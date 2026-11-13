/**
 * server/src/cartridges/cartridge-core.js
 *
 * Universal Roguelike Cartridge Core for the Yendor Engine™ (YASD 3D).
 * Powers standalone `-mbridge` JSON-over-stdio engines (`rogue`, `brogue`, `dcss`)
 * with:
 *   - 66x22 3D-compatible Map Grid (`g`, `a`, `f`, `l` with Bresenham LOS & room lighting)
 *   - 80x24 Classic CRT Terminal (`term.rows`) + Authentic ASCII Tombstone on death
 *   - Realm-specific terrain features (Chasms, Lava, Deep Water, Altars, Fountains, Captive Allies)
 *   - Realm-specific progression (Classic XP, Brogue Strength/Enchantments, DCSS Gods/Piety/Runes)
 *   - Lazarus Checkpoint Save Protection (`.living.sav` preserved whenever `!player.dead`)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

let RyodSystems = null;
try {
    RyodSystems = require('./ryod-systems');
} catch (_) {}

const MAP_W = 66;
const MAP_H = 22;
const TERM_W = 80;
const TERM_H = 24;

const FEAT = Object.freeze({
    NONE: 0,
    FLOOR: 1,
    CLOSED_DOOR: 2,
    OPEN_DOOR: 3,
    UP_STAIR: 5,
    DOWN_STAIR: 6,
    TRAP: 45,
    WALL: 21,
    PERM_WALL: 22,
    LAVA: 23,
    WATER: 28,
    CHASM: 41,
    GRASS: 26,
    ALTAR: 43,
    FOUNTAIN: 44,
    ANVIL: 46,
    CAGE: 47,
    GAS_VENT: 48,
    RUNE_VAULT: 49
});

function parseCliArgs(argv, defaultSaveDir) {
    let user = 'Adventurer';
    let saveDir = defaultSaveDir;
    let isNew = false;
    let customBirth = false;
    let randomBirth = false;
    for (let i = 2; i < argv.length; i++) {
        const arg = String(argv[i] || '');
        if (arg === '-n') isNew = true;
        else if (arg === '-c' || arg === '--custom') customBirth = true;
        else if (arg === '-r' || arg === '--random') randomBirth = true;
        else if (arg.startsWith('-u')) user = arg.slice(2) || user;
        else if (arg.startsWith('-dsave=')) saveDir = arg.slice(7) || saveDir;
    }
    const cleanUser = user.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'Adventurer';
    return { user: cleanUser, saveDir, isNew, customBirth, randomBirth };
}

function isWalkableFeat(feat) {
    return feat !== FEAT.NONE && feat !== FEAT.WALL && feat !== FEAT.PERM_WALL && feat !== FEAT.CLOSED_DOOR && feat !== FEAT.CHASM;
}

function computeVerbMask(item) {
    let vm = (1 << 8) | (1 << 11) | (1 << 12) | (1 << 19); // throw, drop, inscribe, examine
    if (item && item.inscription) vm |= (1 << 13); // uninscribe
    const k = String((item && item.kind) || '').toLowerCase();
    if (k === 'potion') vm |= (1 << 0);
    else if (k === 'scroll') vm |= (1 << 1);
    else if (k === 'food') vm |= (1 << 2);
    else if (k === 'wand') vm |= (1 << 3) | (1 << 5);
    else if (k === 'staff' || k === 'tool' || k === 'charm') vm |= (1 << 4) | (1 << 6);
    else if (k === 'weapon' || k === 'armor' || k === 'ring' || k === 'amulet' || k === 'jewelry' || k === 'shield') {
        vm |= item.equipped ? (1 << 10) : (1 << 9);
    } else if (k === 'ranged' || k === 'ammo') {
        vm |= (1 << 7) | (1 << 9);
    } else if (k === 'book') {
        vm |= (1 << 15) | (1 << 16) | (1 << 17);
    }
    return vm;
}

function formatItemDesc(it) {
    if (!it) return 'nothing';
    const cnt = it.count && it.count > 1 ? `${it.count} ` : '';
    const bns = typeof it.bonus === 'number' ? (it.bonus >= 0 ? `+${it.bonus} ` : `${it.bonus} `) : '';
    const chg = typeof it.charges === 'number' ? ` (${it.charges} charges)` : '';
    const eq = it.equipped ? ` (worn: ${it.equipped})` : '';
    const ins = it.inscription ? ` {${it.inscription}}` : '';
    return `${cnt}${bns}${it.name}${chg}${eq}${ins}`.trim();
}

class UniversalCartridgeEngine {
    constructor(spec, cliOpts) {
        this.spec = spec; // { realm, magic, version, title, roles, monsters, items, branches, gods, ... }
        this.realm = spec.realm;
        this.magic = spec.magic;
        this.saveDir = cliOpts.saveDir;
        this.user = cliOpts.user.replace(/\.sav$/i, '');
        this.saveFile = path.join(this.saveDir, `${this.user}.sav`);
        this.seq = 0;
        const rawSeed = (cliOpts && cliOpts.seed) || (spec && spec.seed) || (spec && spec.ryodBlueprint && spec.ryodBlueprint.seed);
        this.baseSeed = RyodSystems ? RyodSystems.parseSeed(rawSeed || crypto.randomBytes(4).readUInt32LE(0)) : ((Number(rawSeed) >>> 0) || crypto.randomBytes(4).readUInt32LE(0));
        this.rngState = this.baseSeed;

        if (!cliOpts.isNew && this.loadSave()) {
            this.addMessage(`Welcome back to ${spec.title}, ${this.state.player.name}!`, 14);
        } else {
            const startRoleIdx = cliOpts.randomBirth ? this.rand(spec.roles.length) : 0;
            this.initNewState(startRoleIdx);
            if (cliOpts.isNew && !cliOpts.customBirth && (this.realm !== 'dcss' || cliOpts.randomBirth)) {
                this.state.phase = 'play';
                this.saveGame();
            }
        }
    }

    rand(max) {
        this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
        return max > 0 ? (this.rngState % max) : 0;
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

    usesExpLevels() {
        return this.spec.usesExpLevels !== false && this.realm !== 'brogue';
    }

    getMaxLevel() {
        return this.usesExpLevels() ? (this.spec.maxLevel || 27) : 0;
    }

    getExpNextForLevel(level) {
        if (!this.usesExpLevels()) return 0;
        const maxLev = this.getMaxLevel();
        if (level >= maxLev) return 0;
        if (typeof this.spec.getExpNext === 'function') {
            return Number(this.spec.getExpNext(level)) || 0;
        }
        if (Array.isArray(this.spec.expTable) && this.spec.expTable.length > 0) {
            const idx = Math.max(0, (level || 1) - 1);
            return idx < this.spec.expTable.length ? this.spec.expTable[idx] : 0;
        }
        return Math.floor(20 * Math.pow(1.8, Math.max(0, (level || 1) - 1)));
    }

    checkExperience(opts = {}) {
        const p = this.state && this.state.player;
        if (!p) return;
        if (!this.usesExpLevels()) {
            p.level = 0;
            p.maxLevel = 0;
            p.exp = 0;
            p.maxExp = 0;
            p.expNext = 0;
            return;
        }
        const maxLev = this.getMaxLevel();
        if (!p.level || p.level < 1) p.level = 1;
        if (p.level > maxLev) p.level = maxLev;
        p.exp = Math.max(0, Number(p.exp || 0));
        p.maxExp = Math.max(Number(p.maxExp || 0), p.exp);
        p.maxLevel = Math.max(Number(p.maxLevel || 1), p.level);
        p.expNext = this.getExpNextForLevel(p.level);

        while (p.level < maxLev && p.expNext > 0 && p.exp >= p.expNext) {
            p.level++;
            if (p.level > p.maxLevel) p.maxLevel = p.level;
            p.expNext = this.getExpNextForLevel(p.level);
            if (!opts.silent) {
                if (typeof this.spec.onLevelGain === 'function') {
                    this.spec.onLevelGain(p, this);
                } else {
                    p.hpMax += 6;
                    p.hp = p.hpMax;
                    p.pwMax += 2;
                    p.pw = p.pwMax;
                    this.addMessage(`Welcome to Experience Level ${p.level}! Your vitality and power increase!`, 14);
                }
            }
        }
    }

    initNewState(roleIdx = 0) {
        const roles = this.spec.roles;
        const r = roles[roleIdx % roles.length] || roles[0];
        const inv = [];
        const defaultBeatitude = this.spec.beatitude ? 'blessed' : undefined;
        if (r.weapon) inv.push({ beatitude: defaultBeatitude, ...r.weapon, kind: 'weapon', glyph: ')', equipped: 'weapon', count: 1 });
        if (r.armor) inv.push({ beatitude: defaultBeatitude, ...r.armor, kind: 'armor', glyph: '[', equipped: 'body', count: 1 });
        if (r.extra) inv.push({ ...r.extra, count: r.extra.count || 1 });
        inv.push({ kind: 'potion', name: this.spec.healingPotionName || 'potion of healing', glyph: '!', attr: 13, heal: 22, count: 2, weight: 15, tval: 71, sval: 38 });
        inv.push({ kind: 'food', name: this.spec.foodName || 'food ration', glyph: '%', attr: 3, nutrition: 800, count: 2, weight: 20, tval: 80, sval: 1 });

        const hasLevels = this.usesExpLevels();
        const startDepth = this.spec.hasTown ? 0 : 1;
        const initialMonsters = [];
        const petTpl = r.pet || this.spec.startingPet;
        const bpMutator = (this.realm === 'ryod' && this.spec.ryodBlueprint && this.spec.ryodBlueprint.mutatorId) || 'balanced';
        const bpFate = (this.realm === 'ryod' && this.spec.ryodBlueprint && Number(this.spec.ryodBlueprint.d20Fate)) || 15;
        const petBoost = bpMutator === 'packmaster' ? 1.4 : 1.0;
        if (petTpl && petTpl.name) {
            initialMonsters.push({
                id: 9001,
                race: petTpl.name,
                glyph: petTpl.glyph || 'd',
                attr: petTpl.attr || 15,
                x: 11,
                y: 10,
                hp: Math.round((petTpl.hp || 26) * petBoost),
                hp_max: Math.round((petTpl.hp || 26) * petBoost),
                ac: petTpl.ac != null ? petTpl.ac : 5,
                dmg: Math.round((petTpl.dmg || 8) * petBoost),
                exp: 0,
                speed: 115,
                lore: petTpl.lore || 'Your faithful companion.',
                isPet: true,
                peaceful: true,
                captive: false
            });
        }
        if (bpMutator === 'packmaster') {
            initialMonsters.push({
                id: 9002,
                race: 'warg',
                glyph: 'C',
                attr: 11,
                x: 9,
                y: 10,
                hp: 38,
                hp_max: 38,
                ac: 4,
                dmg: 12,
                exp: 0,
                speed: 115,
                lore: 'Packmaster Crusade dire-wolf sworn to your banner.',
                isPet: true,
                peaceful: true,
                captive: false
            });
        }
        if (this.realm === 'ryod' && bpFate === 20) {
            if (inv[0] && inv[0].kind === 'weapon') {
                inv[0].bonus = (inv[0].bonus || 1) + 2;
                inv[0].beatitude = 'blessed';
            }
            inv.push({ kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 14, enchantGain: 1, count: 1, weight: 5, tval: 70, sval: 15 });
            inv.push({ kind: 'ring', name: 'blessed ring of the sun', glyph: '=', attr: 14, ac: 3, bonus: 2, beatitude: 'blessed', isRelic: true, weight: 2, tval: 45, sval: 99 });
            inv.push({ kind: 'potion', name: 'potion of extra healing', glyph: '!', attr: 4, heal: 45, count: 1, weight: 10, tval: 71, sval: 35 });
        } else if (this.realm === 'ryod' && bpFate >= 15) {
            if (inv[0] && inv[0].kind === 'weapon') inv[0].bonus = (inv[0].bonus || 1) + 1;
            inv.push({ kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 14, count: 1, weight: 5, tval: 70, sval: 12 });
            inv.push({ kind: 'potion', name: 'potion of speed', glyph: '!', attr: 11, speedTurns: 25, count: 1, weight: 10, tval: 71, sval: 18 });
        } else if (this.realm === 'ryod' && bpFate === 1) {
            inv.push({ kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 14, enchantGain: 1, count: 1, weight: 5, tval: 70, sval: 15 });
        } else if (this.realm === 'ryod' && bpFate <= 7) {
            inv.push({ kind: 'food', name: 'iron ration', glyph: ':', attr: 3, nutrition: 900, count: 2, weight: 20, tval: 80, sval: 1 });
        }

        this.state = {
            realm: this.realm,
            ryodHash: this.spec.ryodHash || null,
            ryodBlueprint: this.spec.ryodBlueprint || null,
            scoreMultiplier: (this.realm === 'ryod' && bpFate === 1) ? 2.0 : 1.0,
            huntedByShade: (this.realm === 'ryod' && bpFate === 1),
            d20Fate: bpFate,
            slainActBosses: {},
            visitedActs: {},
            phase: 'setup',
            menuMode: 'none',
            pendingVerb: null,
            pendingPrompt: '',
            selectedRoleIdx: roleIdx,
            depth: startDepth,
            maxDepth: Math.max(1, startDepth),
            branchName: this.getBranchName(startDepth),
            turn: 1,
            player: {
                name: this.user || 'Adventurer',
                race: r.race || 'Human',
                class: r.id || 'Warrior',
                originId: r.originId || null,
                avatarId: r.avatarId || this.spec.avatarId || (r.originId === 'beholder' ? 'beholder' : (r.originId === 'red_dragon' ? 'dragon' : (r.originId === 'arch_lich' ? 'lich' : (r.originId === 'vampire_scion' ? 'vampire' : (r.originId === 'iron_golem' ? 'golem' : (r.originId === 'minotaur' ? 'minotaur' : null)))))),
                isMonsterAvatar: Boolean(r.isMonsterAvatar || r.avatarId || this.spec.isMonsterAvatar || this.spec.avatarId),
                avatarMonsterName: r.avatarMonsterName || null,
                innatePower: r.innatePower || null,
                disciplinePowers: Array.isArray(r.disciplinePowers) ? r.disciplinePowers : null,
                progressionMode: this.spec.progressionMode || (hasLevels ? 'xp' : 'brogue_item'),
                powerDiscipline: this.spec.powerDiscipline || 'arcane',
                godMode: Boolean(this.spec.godMode),
                align: r.align || 'Neutral',
                deity: r.deity || (this.spec.defaultDeity || 'Fate'),
                piety: r.piety != null ? r.piety : 2,
                blessed: (this.realm === 'ryod' && bpFate === 20),
                shrineBlessing: (this.realm === 'ryod' && bpFate === 20),
                runes: 0,
                lumenstones: 0,
                enchantments: 0,
                nutrition: 1200,
                level: hasLevels ? 1 : 0,
                maxLevel: hasLevels ? 1 : 0,
                exp: 0,
                maxExp: 0,
                expNext: hasLevels ? this.getExpNextForLevel(1) : 0,
                gold: (this.realm === 'ryod' && bpFate >= 15) ? 45 : ((this.realm === 'ryod' && bpFate === 1) ? 100 : 35),
                hp: r.hp || 18,
                hpMax: r.hp || 18,
                pw: r.pw != null ? r.pw : 8,
                pwMax: r.pw != null ? r.pw : 8,
                ac: r.ac != null ? r.ac : 4,
                str: r.str || 16,
                int: r.int || 12,
                wis: r.wis || 12,
                dex: r.dex || 14,
                con: r.con || 15,
                x: 10,
                y: 10,
                dead: false,
                winner: false,
                diedFrom: '',
                hasAmulet: false,
                poisoned: 0,
                speedBoost: 0,
                weaponName: r.weapon ? r.weapon.name : 'blade',
                inventory: inv
            },
            map: [],
            monsters: initialMonsters,
            objects: [],
            messages: [
                { text: this.spec.welcomeMessage || `You enter ${this.spec.title}.`, count: 1, attr: 14 }
            ],
            statFocus: 'optimal',
            kitBoon: 'signature',
            _optimizedApplied: false
        };
        this.reindexInventory();
        this.generateLevel(startDepth);
    }

    // # ROOT-CAUSE: Cartridge birth setup and Quick Start needed post-randomization stat focus & starting kit boon optimization
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
            p.str = (p.str || 14) + 2;
            p.con = (p.con || 14) + 2;
            p.hpMax = (p.hpMax || 18) + 6;
            p.hp = p.hpMax;
        } else if (statFocus === 'arcane') {
            p.int = (p.int || 12) + 2;
            p.wis = (p.wis || 12) + 2;
            p.pwMax = (p.pwMax || 8) + 5;
            p.pw = p.pwMax;
        } else if (statFocus === 'agile') {
            p.dex = (p.dex || 14) + 3;
            p.ac = (p.ac || 4) + (this.realm === 'nethack' || this.realm === 'rogue' ? -2 : 2);
        } else {
            // 'optimal': auto-tailor to selected or randomized archetype
            if (/mage|conjurer|wizard|necromancer|alchemist|scholar|mystic|transmuter|priest|healer/.test(clsLower)) {
                p.int = (p.int || 12) + 2;
                p.wis = (p.wis || 12) + 1;
                p.pwMax = (p.pwMax || 8) + 4;
                p.pw = p.pwMax;
                p.hpMax = (p.hpMax || 16) + 2;
                p.hp = p.hpMax;
            } else if (/rogue|stalker|hunter|ranger|assassin|thief|tourist/.test(clsLower)) {
                p.dex = (p.dex || 14) + 2;
                p.str = (p.str || 14) + 1;
                p.hpMax = (p.hpMax || 18) + 3;
                p.hp = p.hpMax;
            } else {
                p.str = (p.str || 15) + 2;
                p.con = (p.con || 14) + 1;
                p.hpMax = (p.hpMax || 18) + 4;
                p.hp = p.hpMax;
            }
        }

        const w = p.inventory.find(it => it.equipped === 'weapon') || p.inventory[0];
        const a = p.inventory.find(it => it.equipped === 'armor');
        if (kitBoon === 'expedition') {
            p.inventory.push({ kind: 'potion', name: 'potion of healing', glyph: '!', attr: 11, heal: 22, count: 1, weight: 10, tval: 71, sval: 38 });
            p.inventory.push({ kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 14, count: 1, weight: 5, tval: 70, sval: 12 });
        } else if (kitBoon === 'blessed') {
            if (w) { w.bonus = (w.bonus || 0) + 1; w.beatitude = 'blessed'; }
            if (a) { a.bonus = (a.bonus || 0) + 1; a.beatitude = 'blessed'; }
            p.piety = Math.min(6, (p.piety || 2) + 1);
        } else {
            // 'signature'
            if (w) w.bonus = (w.bonus || 0) + 1;
            if (this.realm === 'brogue') p.enchantments = (p.enchantments || 0) + 1;
        }
        this.reindexInventory();
    }

    getBranchName(depth) {
        if (typeof this.spec.getBranchForDepth === 'function') {
            return this.spec.getBranchForDepth(depth);
        }
        return this.spec.defaultBranch || 'Dungeons of Doom';
    }

    reindexInventory() {
        const p = this.state.player;
        p.inventory = p.inventory.filter(it => (it.count == null || it.count > 0));
        p.inventory.forEach((it, idx) => {
            it.slot = idx;
            it.letter = String.fromCharCode(97 + (idx % 26));
        });
        const w = p.inventory.find(it => it.equipped === 'weapon');
        const sh = p.inventory.find(it => it.equipped === 'shield');
        const bw = p.inventory.find(it => it.equipped === 'bow');
        p.weaponName = w ? w.name : 'bare hands';
        p.shieldName = sh ? sh.name : '';
        p.bowName = bw ? bw.name : '';
        this.recalcPlayerDefenses();
    }

    recalcPlayerDefenses() {
        const p = this.state && this.state.player;
        if (!p || !Array.isArray(p.inventory)) return;
        const body = p.inventory.find(it => it.equipped === 'body' || it.equipped === 'armor');
        const shield = p.inventory.find(it => it.equipped === 'shield');
        const ring = p.inventory.find(it => it.equipped === 'ring' && /protection|armor|defense/i.test(it.name || ''));
        const armorBase = body ? Number(body.ac != null ? body.ac : 4) : 0;
        const shieldAc = shield ? (Number(shield.ac != null ? shield.ac : 2) + Number(shield.bonus || 0)) : 0;
        const armorBonus = (body ? Number(body.bonus || 0) : 0) + (ring ? Number(ring.bonus || 1) : 0) + shieldAc;
        if (this.realm === 'rogue') {
            p.ac = body ? Math.max(-10, (body.ac != null ? body.ac : 7) - armorBonus) : (10 - shieldAc);
        } else {
            p.ac = Math.max(0, (body ? (armorBase + armorBonus) : (2 + armorBonus)) + Math.floor(((p.dex || 12) - 10) / 3));
        }
        p.ev = Math.max(4, 10 + Math.floor(((p.dex || 12) - 10) / 2) - (body && (body.weight || 0) >= 250 ? 2 : 0));
    }

    placeSurvivingPets(survivingPets, startMonId = 9000) {
        if (!Array.isArray(survivingPets) || survivingPets.length === 0) return;
        const p = this.state.player;
        const map = this.state.map;
        const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0]];
        let nextId = startMonId;
        for (const pet of survivingPets) {
            let placed = false;
            for (const [dx, dy] of offsets) {
                const tx = p.x + dx;
                const ty = p.y + dy;
                if (tx <= 0 || ty <= 0 || tx >= MAP_W - 1 || ty >= MAP_H - 1) continue;
                if (!map[ty] || !map[ty][tx] || !isWalkableFeat(map[ty][tx].feat)) continue;
                if (this.state.monsters.some(m => m.x === tx && m.y === ty)) continue;
                this.state.monsters.push({
                    ...pet,
                    id: nextId++,
                    x: tx,
                    y: ty,
                    hp: Math.min(pet.hp_max || 26, (pet.hp || 10) + 4),
                    isPet: true,
                    peaceful: true,
                    captive: false
                });
                placed = true;
                break;
            }
            if (!placed) {
                this.state.monsters.push({ ...pet, id: nextId++, x: Math.min(MAP_W - 2, p.x + 1), y: p.y, isPet: true, peaceful: true, captive: false });
            }
        }
    }

    generateTownLevel(survivingPets = []) {
        this.state.depth = 0;
        this.state.branchName = this.getBranchName(0);
        const map = [];
        for (let y = 0; y < MAP_H; y++) {
            const row = [];
            for (let x = 0; x < MAP_W; x++) {
                const isBorder = (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1);
                row.push({
                    glyph: isBorder ? '#' : '.',
                    attr: isBorder ? 1 : 2,
                    feat: isBorder ? FEAT.PERM_WALL : FEAT.FLOOR,
                    known: true,
                    inView: false,
                    roomLit: true
                });
            }
            map.push(row);
        }

        // Carve 2 Sanctuary Buildings (West Temple & East Quartermaster Hall) with open doors
        const carveBuilding = (x0, y0, x1, y1, doorX, doorY) => {
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const isEdge = (x === x0 || x === x1 || y === y0 || y === y1);
                    if (x === doorX && y === doorY) {
                        map[y][x] = { glyph: "'", attr: 3, feat: FEAT.OPEN_DOOR, known: true, inView: false, roomLit: true };
                    } else if (isEdge) {
                        map[y][x] = { glyph: '#', attr: 1, feat: FEAT.WALL, known: true, inView: false, roomLit: true };
                    }
                }
            }
        };

        const cx = Math.floor(MAP_W / 2);
        const cy = Math.floor(MAP_H / 2);
        carveBuilding(cx - 14, cy - 6, cx - 6, cy - 1, cx - 6, cy - 3);
        carveBuilding(cx + 6, cy - 6, cx + 14, cy - 1, cx + 6, cy - 3);

        // West Building: Sanctuary Temple Altar (_)
        const deity = this.spec.defaultDeity || 'The Pantheon';
        map[cy - 3][cx - 10] = { glyph: '_', attr: 14, feat: FEAT.ALTAR, deity, known: true, inView: false, roomLit: true };

        // Town Square Healing Fountain ({) & Dungeon Gatehouse Down Stair (>)
        map[cy - 2][cx] = { glyph: '{', attr: 11, feat: FEAT.FOUNTAIN, known: true, inView: false, roomLit: true };
        map[cy][cx] = { glyph: '>', attr: 14, feat: FEAT.DOWN_STAIR, known: true, inView: false, roomLit: true };

        this.state.player.x = cx;
        this.state.player.y = cy + 1;
        this.state.map = map;

        this.state.monsters = [
            {
                id: 8001,
                race: 'Town Elder Chronicler',
                glyph: 't',
                attr: 14,
                x: cx - 3,
                y: cy + 1,
                hp: 99,
                hp_max: 99,
                ac: 10,
                dmg: 0,
                exp: 0,
                speed: 100,
                lore: this.spec.elderRumor || 'Keeper of the Sanctuary Town chronicles. Bump to hear the Act I Omen.',
                isPet: false,
                peaceful: true,
                captive: false,
                townRole: 'elder'
            },
            {
                id: 8002,
                race: 'Sanctuary Quartermaster',
                glyph: 'p',
                attr: 11,
                x: cx + 10,
                y: cy - 3,
                hp: 99,
                hp_max: 99,
                ac: 10,
                dmg: 0,
                exp: 0,
                speed: 100,
                lore: 'Master of supplies. Bump to trade 20 gold for Healing Potions & Rations.',
                isPet: false,
                peaceful: true,
                captive: false,
                townRole: 'quartermaster'
            }
        ];

        this.state.objects = [
            { kind: 'potion', name: 'potion of healing', glyph: '!', attr: 11, heal: 28, x: cx + 9, y: cy - 4, count: 1, weight: 10, tval: 71, sval: 28 },
            { kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 14, enchantGain: 1, x: cx + 11, y: cy - 4, count: 1, weight: 5, tval: 70, sval: 15 }
        ];

        this.placeSurvivingPets(survivingPets, 9001);
        this.updateVisibility();
    }

    generateLevel(depth) {
        if (RyodSystems && this.baseSeed) {
            this.rngState = RyodSystems.mixSeed(this.baseSeed, depth);
        }
        const survivingPets = Array.isArray(this.state && this.state.monsters)
            ? this.state.monsters.filter(m => m && m.isPet && m.hp > 0)
            : [];

        if (depth <= 0 && this.spec.hasTown) {
            this.generateTownLevel(survivingPets);
            return;
        }

        this.state.depth = depth;
        if (depth > this.state.maxDepth) this.state.maxDepth = depth;
        this.state.branchName = this.getBranchName(depth);

        const map = [];
        for (let y = 0; y < MAP_H; y++) {
            const row = [];
            for (let x = 0; x < MAP_W; x++) {
                const isBorder = (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1);
                row.push({
                    glyph: '#',
                    attr: 1,
                    feat: isBorder ? FEAT.PERM_WALL : FEAT.WALL,
                    known: false,
                    inView: false,
                    roomLit: false
                });
            }
            map.push(row);
        }

        const rooms = [];
        const isRogue = this.realm === 'rogue';
        const bpLayout = (this.realm === 'ryod' && this.spec.ryodBlueprint && this.spec.ryodBlueprint.mapLayout) || 'classic';
        const isOrganicCavern = this.realm === 'brogue' || bpLayout === 'caverns' || (this.realm === 'ryod' && this.spec.ryodBlueprint && this.spec.ryodBlueprint.biome === 'bioluminescent' && bpLayout === 'classic');
        const isLabyrinth = bpLayout === 'labyrinth';
        const isArena = bpLayout === 'arena';
        const roomCols = isRogue ? 3 : (isLabyrinth ? 5 : (isArena ? 3 : 4));
        const roomRows = isRogue ? 3 : (isLabyrinth ? 3 : 2);
        const cellW = Math.floor((MAP_W - 4) / roomCols);
        const cellH = Math.floor((MAP_H - 2) / roomRows);

        for (let ry = 0; ry < roomRows; ry++) {
            for (let rx = 0; rx < roomCols; rx++) {
                const minW = isRogue ? 5 : 6;
                const minH = isRogue ? 3 : 4;
                const rw = minW + this.rand(Math.max(2, cellW - minW - 2));
                const rh = minH + this.rand(Math.max(2, cellH - minH - 1));
                const x0 = 2 + rx * cellW + this.rand(Math.max(1, cellW - rw - 1));
                const y0 = 1 + ry * cellH + this.rand(Math.max(1, cellH - rh - 1));
                const room = {
                    rx,
                    ry,
                    x0,
                    y0,
                    x1: Math.min(MAP_W - 3, x0 + rw),
                    y1: Math.min(MAP_H - 3, y0 + rh)
                };
                room.cx = Math.floor((room.x0 + room.x1) / 2);
                room.cy = Math.floor((room.y0 + room.y1) / 2);
                const darkChance = isRogue ? Math.min(55, (depth - 1) * 10) : 20;
                const isLit = depth === 1 ? true : (this.rand(100) >= darkChance);
                room.lit = isLit;
                rooms.push(room);

                for (let y = room.y0; y <= room.y1; y++) {
                    for (let x = room.x0; x <= room.x1; x++) {
                        if (isOrganicCavern && (room.x1 - room.x0 >= 7) && (room.y1 - room.y0 >= 5)) {
                            const isCorner = (x === room.x0 || x === room.x1) && (y === room.y0 || y === room.y1);
                            if (isCorner && this.rand(100) < 65) continue;
                        }
                        map[y][x] = { glyph: '.', attr: isLit ? 1 : 2, feat: FEAT.FLOOR, known: false, inView: false, roomLit: isLit };
                    }
                }
            }
        }

        const carveCorridor = (a, b) => {
            let x = a.cx;
            let y = a.cy;
            const tx = b.cx;
            const ty = b.cy;
            const horizFirst = this.rand(2) === 0;
            const stepCell = (ny, nx, prevFeat) => {
                if (map[ny][nx].feat === FEAT.WALL) {
                    const placeDoor = prevFeat === FEAT.FLOOR && !map[ny][nx].roomLit && this.rand(100) < 35;
                    map[ny][nx] = {
                        glyph: placeDoor ? '+' : '.',
                        attr: placeDoor ? 3 : 2,
                        feat: placeDoor ? FEAT.CLOSED_DOOR : FEAT.FLOOR,
                        known: false,
                        inView: false,
                        roomLit: false
                    };
                }
            };
            if (horizFirst) {
                while (x !== tx) { const pf = map[y][x].feat; x += Math.sign(tx - x); stepCell(y, x, pf); }
                while (y !== ty) { const pf = map[y][x].feat; y += Math.sign(ty - y); stepCell(y, x, pf); }
            } else {
                while (y !== ty) { const pf = map[y][x].feat; y += Math.sign(ty - y); stepCell(y, x, pf); }
                while (x !== tx) { const pf = map[y][x].feat; x += Math.sign(tx - x); stepCell(y, x, pf); }
            }
        };

        const shuffledRooms = this.shuffleArray(rooms);
        for (let i = 0; i < shuffledRooms.length - 1; i++) {
            carveCorridor(shuffledRooms[i], shuffledRooms[i + 1]);
        }
        for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
                const manhattan = Math.abs(rooms[i].rx - rooms[j].rx) + Math.abs(rooms[i].ry - rooms[j].ry);
                if (manhattan === 1 && (isLabyrinth || this.rand(100) < 55)) {
                    carveCorridor(rooms[i], rooms[j]);
                }
            }
        }

        if (isArena) {
            // Carve central grand coliseum arena floor with colonnade pillars
            const ax0 = 10, ay0 = 4, ax1 = MAP_W - 11, ay1 = MAP_H - 5;
            for (let y = ay0; y <= ay1; y++) {
                for (let x = ax0; x <= ax1; x++) {
                    const isPillar = (x % 6 === 0) && (y % 4 === 0) && (x > ax0 + 3 && x < ax1 - 3 && y > ay0 + 2 && y < ay1 - 2);
                    if (isPillar) {
                        map[y][x] = { glyph: '#', attr: 1, feat: FEAT.WALL, known: false, inView: false, roomLit: true };
                    } else {
                        map[y][x] = { glyph: '.', attr: 1, feat: FEAT.FLOOR, known: false, inView: false, roomLit: true };
                    }
                }
            }
        } else if (isOrganicCavern) {
            // Cavern cellular rock formations within larger chambers
            for (let i = 0; i < rooms.length; i++) {
                const r = rooms[i];
                if ((r.x1 - r.x0) >= 8 && (r.y1 - r.y0) >= 5) {
                    for (let cy = r.y0 + 1; cy < r.y1; cy++) {
                        for (let cx = r.x0 + 1; cx < r.x1; cx++) {
                            if (this.rand(100) < 12 && !(cx === r.cx && cy === r.cy)) {
                                map[cy][cx] = { glyph: '#', attr: 2, feat: FEAT.WALL, known: false, inView: false, roomLit: r.lit };
                            }
                        }
                    }
                }
            }
        }

        const startRoom = shuffledRooms[0];
        const endRoom = shuffledRooms[shuffledRooms.length - 1];
        this.state.player.x = startRoom.cx;
        this.state.player.y = startRoom.cy;
        map[startRoom.cy][startRoom.cx].glyph = '<';
        map[startRoom.cy][startRoom.cx].feat = FEAT.UP_STAIR;
        map[startRoom.cy][startRoom.cx].attr = 15;
        map[startRoom.cy][startRoom.cx].roomLit = true;

        map[endRoom.cy][endRoom.cx].glyph = '>';
        map[endRoom.cy][endRoom.cx].feat = FEAT.DOWN_STAIR;
        map[endRoom.cy][endRoom.cx].attr = 14;

        // Realm-specific & RYOD Synergy procedural features in randomized non-endpoint rooms
        const wantsAltars = this.realm === 'dcss' || (this.realm === 'ryod' && (this.spec.powerDiscipline === 'piety' || this.spec.beatitude || depth % 3 === 0));
        const wantsEnvHazards = this.realm === 'brogue' || (this.realm === 'ryod' && (this.spec.hazardDensity === 'abundant' || isOrganicCavern));

        if (wantsAltars && shuffledRooms.length > 2) {
            const altarRoom = shuffledRooms[1];
            const gods = (this.spec.gods && this.spec.gods.length > 0) ? this.spec.gods : [this.spec.defaultDeity || 'Okawaru', 'Trog', 'Vehumet'];
            const god = gods[(depth + this.rand(gods.length)) % gods.length];
            map[altarRoom.cy][altarRoom.cx].glyph = '_';
            map[altarRoom.cy][altarRoom.cx].feat = FEAT.ALTAR;
            map[altarRoom.cy][altarRoom.cx].attr = 14;
            map[altarRoom.cy][altarRoom.cx].deity = god;
            if (this.realm === 'dcss' && depth === 4 && shuffledRooms.length > 4) {
                for (let gIdx = 2; gIdx <= 3; gIdx++) {
                    const extraRoom = shuffledRooms[gIdx];
                    const extraGod = gods[(depth + gIdx + this.rand(gods.length)) % gods.length];
                    map[extraRoom.cy][extraRoom.cx].glyph = '_';
                    map[extraRoom.cy][extraRoom.cx].feat = FEAT.ALTAR;
                    map[extraRoom.cy][extraRoom.cx].attr = 14;
                    map[extraRoom.cy][extraRoom.cx].deity = extraGod;
                }
            }
        } else if (wantsEnvHazards && shuffledRooms.length > 3) {
            const envRoom = shuffledRooms[1];
            const isLava = depth >= 4;
            for (let x = envRoom.x0 + 1; x < envRoom.x1; x++) {
                const ry = envRoom.y0 + 1;
                if (ry < envRoom.y1 && !(x === envRoom.cx && ry === envRoom.cy)) {
                    map[ry][x].glyph = '~';
                    map[ry][x].feat = isLava ? FEAT.LAVA : FEAT.WATER;
                    map[ry][x].attr = isLava ? 4 : 11;
                }
            }
        } else if (shuffledRooms.length > 2) {
            const featRoom = shuffledRooms[1];
            map[featRoom.cy][featRoom.cx].glyph = '{';
            map[featRoom.cy][featRoom.cx].feat = FEAT.FOUNTAIN;
            map[featRoom.cy][featRoom.cx].attr = 11;
        }

        this.state.map = map;
        if (RyodSystems && (this.realm === 'ryod' || (this.spec && this.spec.stampedVaults))) {
            RyodSystems.stampMicroVault(this, rooms, depth);
        }
        this.sanitizeDoorPlacement();
        this.state.monsters = [];
        this.state.objects = [];

        // Per-Floor VRAM Cohort Selection (<= 5 regular archetypes per floor in RYOD)
        const cohortMons = (this.spec.floorCohorts && Array.isArray(this.spec.floorCohorts[depth]) && this.spec.floorCohorts[depth].length > 0)
            ? this.spec.floorCohorts[depth]
            : this.spec.monsters.filter(m => (m.minDepth || 1) <= depth + 1);
        const eligibleMons = cohortMons.length > 0 ? cohortMons : this.spec.monsters;

        let monId = 1;
        for (let i = 1; i < shuffledRooms.length; i++) {
            const rm = shuffledRooms[i];
            const count = 1 + (this.rand(100) < (this.spec.difficulty === 'nightmare' ? 65 : 45) ? 1 : 0);
            for (let c = 0; c < count; c++) {
                const template = eligibleMons[this.rand(eligibleMons.length)] || this.spec.monsters[0];
                const mx = rm.x0 + 1 + this.rand(Math.max(1, rm.x1 - rm.x0 - 1));
                const my = rm.y0 + 1 + this.rand(Math.max(1, rm.y1 - rm.y0 - 1));
                if ((mx === this.state.player.x && my === this.state.player.y) || this.state.monsters.some(m => m.x === mx && m.y === my)) continue;
                if (!map[my] || !map[my][mx] || !isWalkableFeat(map[my][mx].feat)) continue;
                this.state.monsters.push({
                    id: monId++,
                    race: template.name,
                    glyph: template.glyph,
                    attr: template.attr || 12,
                    x: mx,
                    y: my,
                    hp: template.hp,
                    hp_max: template.hp,
                    ac: template.ac != null ? template.ac : 8,
                    dmg: template.dmg || 4,
                    exp: template.exp !== undefined ? template.exp : 10,
                    speed: template.speed || 110,
                    lore: template.lore || '',
                    isPet: false,
                    peaceful: false,
                    captive: false
                });
            }
        }

        // Captive ally in a randomized chamber (Brogue or RYOD with captiveAllies enabled)
        if ((this.realm === 'brogue' || (this.realm === 'ryod' && this.spec.captiveAllies)) && shuffledRooms.length > 3 && Array.isArray(this.spec.allies) && this.spec.allies.length > 0) {
            const allyRoom = shuffledRooms[2];
            const allyTpl = this.spec.allies[(depth + this.rand(this.spec.allies.length)) % this.spec.allies.length];
            if (!this.state.monsters.some(m => m.x === allyRoom.cx && m.y === allyRoom.cy)) {
                this.state.monsters.push({
                    id: monId++,
                    race: `chained ${allyTpl.name}`,
                    allyBaseName: allyTpl.name,
                    glyph: allyTpl.glyph,
                    attr: 10,
                    x: allyRoom.cx,
                    y: allyRoom.cy,
                    hp: allyTpl.hp,
                    hp_max: allyTpl.hp,
                    ac: 6,
                    dmg: allyTpl.dmg,
                    exp: 0,
                    speed: 115,
                    lore: allyTpl.lore,
                    isPet: false,
                    peaceful: true,
                    captive: true
                });
            }
        }

        // 5-Act Milestone Boss & Narrative Banner (RYOD)
        if (this.spec.actMilestones && this.spec.actMilestones[depth]) {
            const milestone = this.spec.actMilestones[depth];
            this.state.visitedActs = this.state.visitedActs || {};
            if (!this.state.visitedActs[milestone.actNumber]) {
                this.state.visitedActs[milestone.actNumber] = true;
                this.addMessage(milestone.banner, 14);
            }
            const slainMap = this.state.slainActBosses || {};
            if (milestone.boss && !slainMap[depth]) {
                const bx = Math.max(endRoom.x0 + 1, Math.min(endRoom.x1 - 1, endRoom.cx - 1));
                const by = endRoom.cy;
                this.state.monsters = this.state.monsters.filter(m => !(m.x === bx && m.y === by));
                this.state.monsters.push({
                    id: monId++,
                    race: milestone.boss.name,
                    glyph: milestone.boss.glyph || 'P',
                    attr: milestone.boss.attr || 13,
                    x: bx,
                    y: by,
                    hp: milestone.boss.hp,
                    hp_max: milestone.boss.hp,
                    ac: milestone.boss.ac != null ? milestone.boss.ac : 0,
                    dmg: milestone.boss.dmg || 16,
                    exp: this.usesExpLevels() ? (milestone.boss.actNumber * 45) : 0,
                    speed: 115,
                    lore: milestone.boss.lore || `Guardian of ${milestone.title}.`,
                    isPet: false,
                    peaceful: false,
                    captive: false,
                    isBoss: true,
                    isNemesis: Boolean(milestone.boss.isNemesis),
                    actNumber: milestone.boss.actNumber
                });
            }
        }

        // Spawn Nemesis Shade pursuer on floor if player chose Grim Dare (Nat 1)
        if (this.state.huntedByShade && depth > 0 && shuffledRooms.length > 1) {
            const shadeRoom = shuffledRooms[1];
            this.state.monsters.push({
                id: monId++,
                race: 'Nemesis Shade',
                glyph: 'S',
                attr: 5,
                x: shadeRoom.cx,
                y: shadeRoom.cy,
                hp: 30 + depth * 8,
                hp_max: 30 + depth * 8,
                ac: 12 + depth,
                dmg: 8 + depth * 2,
                exp: 50 * depth,
                speed: 125,
                lore: 'A vengeful shadow stalker summoned by your Grim Dare.',
                isPet: false,
                peaceful: false,
                isNemesisShade: true,
                aiBehavior: 'bolt_caster'
            });
            this.addMessage('A chilling dread settles over the dungeon... a Nemesis Shade hunts your scent!', 5);
        }

        // Spawn depth-gated floor items across shuffled rooms (Tier 1..4)
        const currentTier = Math.min(4, Math.max(1, Math.ceil(depth / 3)));
        const eligibleItems = Array.isArray(this.spec.items)
            ? this.spec.items.filter(it => !it.tier || it.tier <= currentTier)
            : [];
        const itemPool = eligibleItems.length > 0 ? eligibleItems : (this.spec.items || []);

        for (let i = 1; i < shuffledRooms.length; i++) {
            const rm = shuffledRooms[i];
            const tpl = itemPool.length > 0 ? itemPool[this.rand(itemPool.length)] : null;
            if (!tpl) continue;
            const ox = rm.x0 + 1 + this.rand(Math.max(1, rm.x1 - rm.x0 - 1));
            const oy = rm.y0 + 1 + this.rand(Math.max(1, rm.y1 - rm.y0 - 1));
            if (map[oy] && map[oy][ox] && isWalkableFeat(map[oy][ox].feat)) {
                this.state.objects.push({
                    ...tpl,
                    x: ox,
                    y: oy,
                    count: tpl.count || 1
                });
            }
        }

        // Synergy Guarantee: Metered Strength & Enchantment drops in Brogue / Hybrid progression modes
        if ((this.spec.progressionMode === 'brogue_item' || this.spec.progressionMode === 'hybrid') && shuffledRooms.length > 1) {
            const rm = shuffledRooms[1];
            const progItem = (depth % 2 === 1)
                ? { kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 11, enchantGain: 1, weight: 5, tval: 70, sval: 15, count: 1 }
                : { kind: 'potion', name: 'potion of strength', glyph: '!', attr: 14, strengthGain: 2, heal: 15, weight: 12, tval: 71, sval: 40, count: 1 };
            this.state.objects.push({ ...progItem, x: rm.cx, y: rm.cy });
        }

        // Midas Treasure Vaults mutator: bonus gilded chest + Scroll of Enchanting
        if (this.spec.mutatorId === 'midas_vaults' && shuffledRooms.length > 2) {
            const vRoom = shuffledRooms[2];
            this.state.objects.push({ kind: 'gold', name: 'gilded vault hoard', glyph: '$', attr: 14, amount: 65 + depth * 10, x: vRoom.cx, y: vRoom.cy, count: 1 });
            if (depth % 2 === 0) {
                this.state.objects.push({ kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 14, enchantGain: 1, weight: 5, tval: 70, sval: 15, x: Math.min(vRoom.x1 - 1, vRoom.cx + 1), y: vRoom.cy, count: 1 });
            }
        }

        // Three Runes Victory Mode: spawn Abyssal Runes on Act II, III, and IV milestone floors
        if (this.spec.victoryMode === 'three_runes' && this.spec.actMilestones && this.spec.actMilestones[depth]) {
            const ms = this.spec.actMilestones[depth];
            if (ms.actNumber >= 2 && ms.actNumber <= 4) {
                this.state.objects.push({
                    kind: 'rune',
                    name: `Abyssal Rune of ${ms.title || ('Act ' + ms.actRoman)}`,
                    glyph: '}',
                    attr: 11,
                    x: Math.min(endRoom.x1 - 1, endRoom.cx + 1),
                    y: endRoom.cy,
                    count: 1,
                    tval: 40,
                    sval: 80 + ms.actNumber
                });
            }
        }

        // Subterranean Quartermaster Outpost on Floor 5 / 10 / 15 so deep & no-town runs can trade gold
        if ((depth === 5 || depth === 10 || depth === 15) && depth < (this.spec.goalDepth || 15) && shuffledRooms.length > 1) {
            const qRoom = shuffledRooms[1] || shuffledRooms[0];
            const qx = Math.min(qRoom.x1 - 1, qRoom.cx + 1);
            const qy = qRoom.cy;
            this.state.monsters = this.state.monsters.filter(m => m.isBoss || m.isPet || !(m.x === qx && m.y === qy));
            if (!this.state.monsters.some(m => m.x === qx && m.y === qy)) {
                this.state.monsters.push({
                    id: monId++,
                    race: 'Wayfarer Quartermaster',
                    glyph: '@',
                    attr: 11,
                    x: qx,
                    y: qy,
                    hp: 999,
                    hp_max: 999,
                    ac: 30,
                    dmg: 0,
                    exp: 0,
                    speed: 110,
                    lore: 'A subterranean supply factor trading scrolls and potions for gold.',
                    isPet: false,
                    peaceful: true,
                    townRole: 'quartermaster'
                });
            }
        }

        // Goal artifact on final floor
        if (depth >= (this.spec.goalDepth || 15) && !this.state.player.hasAmulet) {
            this.state.objects.push({
                kind: 'amulet',
                name: this.spec.goalItemName || 'Amulet of Yendor',
                glyph: this.spec.goalGlyph || ',',
                attr: 14,
                x: endRoom.cx,
                y: endRoom.cy,
                count: 1,
                isGoalArtifact: true,
                tval: 40,
                sval: 99
            });
        }

        // Carry over surviving pets & liberated allies adjacent to the player!
        this.placeSurvivingPets(survivingPets, monId + 100);
        if (RyodSystems && (this.realm === 'ryod' || (this.spec && this.spec.wantedBounties))) {
            RyodSystems.assignFloorBounty(this);
        }
        if (RyodSystems && this.state && this.state.player) {
            RyodSystems.checkAvatarScaleEvolution(this.state.player, depth);
            if (this.state.player.hasAmulet) {
                RyodSystems.onAscentFloorEnter(this);
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

    updateVisibility() {
        const p = this.state.player;
        const map = this.state.map;
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                map[y][x].inView = false;
            }
        }
        const radius = (this.spec && this.spec.mutatorId === 'stygian_fog' && this.state.depth > 0) ? 4 : 8;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tx = p.x + dx;
                const ty = p.y + dy;
                if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
                if (dx * dx + dy * dy > radius * radius + 2) continue;
                if ((Math.abs(dx) <= 1 && Math.abs(dy) <= 1) || this.hasLineOfSight(p.x, p.y, tx, ty)) {
                    map[ty][tx].inView = true;
                    map[ty][tx].known = true;
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

    logMsg(text, attr = 11) {
        return this.addMessage(text, attr);
    }

    saveGame() {
        try {
            const p = this.state && this.state.player;
            // LAZARUS INVARIANT: Never overwrite a living save file once the character is dead!
            if (!p || p.dead) return false;
            if (!fs.existsSync(this.saveDir)) fs.mkdirSync(this.saveDir, { recursive: true });
            const desc = `${p.class} (${p.race}), ${this.state.branchName} ${this.state.depth}, ${p.hp}/${p.hpMax} HP`;
            const descBuf = Buffer.from(desc + '\0', 'utf8');
            const header = Buffer.alloc(36, 0);
            header.write(this.magic.slice(0, 8).padEnd(8, ' '), 0, 8, 'ascii');
            header.write('description', 8, 11, 'ascii');
            header.writeUInt32LE(1, 24);
            header.writeUInt32LE(descBuf.length, 28);
            header.writeUInt32LE(0, 32);
            const payload = Buffer.from(JSON.stringify(this.state), 'utf8');
            const full = Buffer.concat([header, descBuf, payload]);
            const isIronman = Boolean(this.ironman || process.env.ANGBAND3D_IRONMAN === '1' || (this.state && this.state.ironman));
            fs.writeFileSync(this.saveFile, full);
            if (!isIronman) {
                fs.writeFileSync(this.saveFile + '.living.sav', full);
            } else if (fs.existsSync(this.saveFile + '.living.sav')) {
                try { fs.unlinkSync(this.saveFile + '.living.sav'); } catch (_) {}
            }
            const sidecar = {
                realm: this.realm,
                ryodHash: this.state.ryodHash || this.spec.ryodHash || null,
                ryodTitle: (this.state.ryodBlueprint && this.state.ryodBlueprint.title) || null,
                ryodBiome: (this.state.ryodBlueprint && this.state.ryodBlueprint.biome) || null,
                characterName: p.name,
                level: p.level,
                depth: this.state.depth,
                race: p.race,
                class: p.class,
                updatedAt: Date.now()
            };
            fs.writeFileSync(this.saveFile + '.realm.json', JSON.stringify(sidecar));
            return true;
        } catch (_) {
            return false;
        }
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
            if (magic !== this.magic) return false;
            const descSize = buf.readUInt32LE(28);
            const jsonStr = buf.toString('utf8', 36 + descSize);
            const loaded = JSON.parse(jsonStr);
            if (loaded && loaded.player && loaded.map && !loaded.player.dead) {
                if (loaded.ryodBlueprint && typeof this.spec.onBlueprintHydrate === 'function') {
                    this.spec = this.spec.onBlueprintHydrate(loaded.ryodBlueprint) || this.spec;
                }
                this.state = loaded;
                this.state.phase = 'play';
                this.state.menuMode = 'none';
                this.checkExperience({ silent: true });
                this.updateVisibility();
                return true;
            }
            // Fallback to .living.sav if main save was somehow marked dead
            if (targetFile === this.saveFile && fs.existsSync(this.saveFile + '.living.sav')) {
                const lBuf = fs.readFileSync(this.saveFile + '.living.sav');
                const lDesc = lBuf.readUInt32LE(28);
                const lLoaded = JSON.parse(lBuf.toString('utf8', 36 + lDesc));
                if (lLoaded && lLoaded.player && !lLoaded.player.dead) {
                    if (lLoaded.ryodBlueprint && typeof this.spec.onBlueprintHydrate === 'function') {
                        this.spec = this.spec.onBlueprintHydrate(lLoaded.ryodBlueprint) || this.spec;
                    }
                    this.state = lLoaded;
                    this.state.phase = 'play';
                    this.state.menuMode = 'none';
                    fs.copyFileSync(this.saveFile + '.living.sav', this.saveFile);
                    this.checkExperience({ silent: true });
                    this.updateVisibility();
                    return true;
                }
            }
        } catch (_) {}
        return false;
    }

    handleKey(rawKey) {
        const k = String(rawKey || '').trim();
        if (!k) return;
        const lower = k.toLowerCase();
        const p = this.state.player;

        if (this.state.phase === 'setup') {
            if (lower === '*') {
                const randIdx = this.rand(this.spec.roles.length);
                this.initNewState(randIdx);
                this.applyStartingOptimization('optimal', 'signature');
                this.state.phase = 'play';
                this.saveGame();
                return;
            }
            // # ROOT-CAUSE: Read current statFocus & kitBoon before initNewState resets state
            if (lower === '1' || lower === 'f') {
                const focuses = ['optimal', 'vanguard', 'arcane', 'agile'];
                const cur = this.state.statFocus || 'optimal';
                const kb = this.state.kitBoon || 'signature';
                const nextFocus = focuses[(focuses.indexOf(cur) + 1) % focuses.length];
                this.initNewState(this.state.selectedRoleIdx || 0);
                this.applyStartingOptimization(nextFocus, kb);
                return;
            }
            if (lower === '2' || lower === 'b') {
                const boons = ['signature', 'expedition', 'blessed'];
                const sf = this.state.statFocus || 'optimal';
                const cur = this.state.kitBoon || 'signature';
                const nextBoon = boons[(boons.indexOf(cur) + 1) % boons.length];
                this.initNewState(this.state.selectedRoleIdx || 0);
                this.applyStartingOptimization(sf, nextBoon);
                return;
            }
            if (lower === 'enter' || lower === 'return' || lower === 'space' || lower === 'y') {
                this.applyStartingOptimization(this.state.statFocus || 'optimal', this.state.kitBoon || 'signature');
                this.state.phase = 'play';
                this.saveGame();
                return;
            }
            if (lower === 'down' || lower === 'arrowdown' || lower === 'j') {
                const next = ((this.state.selectedRoleIdx || 0) + 1) % this.spec.roles.length;
                const sf = this.state.statFocus || 'optimal';
                const kb = this.state.kitBoon || 'signature';
                this.initNewState(next);
                this.applyStartingOptimization(sf, kb);
                return;
            }
            if (lower === 'up' || lower === 'arrowup' || lower === 'k') {
                const prev = ((this.state.selectedRoleIdx || 0) - 1 + this.spec.roles.length) % this.spec.roles.length;
                const sf = this.state.statFocus || 'optimal';
                const kb = this.state.kitBoon || 'signature';
                this.initNewState(prev);
                this.applyStartingOptimization(sf, kb);
                return;
            }
            const idx = this.spec.roles.findIndex(r => r.key === lower);
            if (idx >= 0) {
                const sf = this.state.statFocus || 'optimal';
                const kb = this.state.kitBoon || 'signature';
                this.initNewState(idx);
                this.applyStartingOptimization(sf, kb);
                this.state.phase = 'play';
                this.saveGame();
            }
            return;
        }

        if (p.dead) {
            if (lower === 'r' || lower === 'enter' || lower === 'return' || lower === ' ') {
                if (!this.loadSave()) {
                    this.initNewState(this.state.selectedRoleIdx || 0);
                    this.state.phase = 'play';
                    this.saveGame();
                }
            }
            return;
        }

        // Direction mapping
        const dirMap = {
            up: [0, -1], k: [0, -1], '8': [0, -1],
            down: [0, 1], j: [0, 1], '2': [0, 1],
            left: [-1, 0], h: [-1, 0], '4': [-1, 0],
            right: [1, 0], l: [1, 0], '6': [1, 0],
            y: [-1, -1], '7': [-1, -1], home: [-1, -1],
            u: [1, -1], '9': [1, -1], pageup: [1, -1],
            b: [-1, 1], '1': [-1, 1], end: [-1, 1],
            n: [1, 1], '3': [1, 1], pagedown: [1, 1]
        };

        if (this.state.menuMode !== 'none') {
            if (lower === 'escape' || lower === 'esc' || lower === ' ' || lower === 'space') {
                this.state.menuMode = 'none';
                this.state.pendingVerb = null;
                this.state.pendingPrompt = '';
                this.state.selectedItem = null;
                return;
            }
            if (this.state.menuMode === 'inven' || this.state.menuMode === 'equip') {
                if (k === '/' || k === '|' || (this.state.menuMode === 'inven' && k === 'e') || (this.state.menuMode === 'equip' && k === 'i')) {
                    this.state.menuMode = this.state.menuMode === 'inven' ? 'equip' : 'inven';
                    return;
                }
                if (k === 'T' || k === 'R' || (this.state.menuMode === 'equip' && k === 'r')) {
                    this.openVerbPrompt('takeoff', 'Remove which item? [a-z or ESC]');
                    return;
                }
                if (k === 'W' || k === 'P') {
                    this.openVerbPrompt('wield', 'Equip which item? [a-z or ESC]');
                    return;
                }
                if (k === 'E') {
                    this.openVerbPrompt('eat', 'Eat which food item? [a-z or ESC]');
                    return;
                }
                if (k === 'I' || k === ':') {
                    this.openVerbPrompt('inspect', 'Examine which item? [a-z or ESC]');
                    return;
                }
                if (k === '{') {
                    this.openVerbPrompt('inscribe', 'Inscribe which item? [a-z or ESC]');
                    return;
                }
                if (k === '}') {
                    this.openVerbPrompt('uninscribe', 'Uninscribe which item? [a-z or ESC]');
                    return;
                }
                if (/^[a-z]$/.test(k)) {
                    const item = p.inventory.find(it => it.letter === k);
                    if (item) {
                        if (this.state.menuMode === 'equip' && item.kind === 'food') {
                            this.state.menuMode = 'none';
                            this.applyVerbToItem('eat', item);
                            return;
                        }
                        const exKey = this.realm === 'dcss' ? 'v' : (this.realm === 'brogue' ? 'x' : 'I');
                        const thKey = this.realm === 'dcss' ? 'f' : 't';
                        this.state.selectedItem = item;
                        this.state.menuMode = 'item_action';
                        this.state.pendingPrompt = `${item.letter}) ${formatItemDesc(item)} — [Enter] Use/Equip [d]rop [${thKey}]throw [${exKey}]Examine [ESC]`;
                        return;
                    }
                    if (k === 'v' || k === 'x') {
                        this.openVerbPrompt('inspect', 'Examine which item? [a-z or ESC]');
                        return;
                    }
                    if (k === 'q') { this.openVerbPrompt('quaff', 'Drink which potion? [a-z or ESC]'); return; }
                    if (k === 'r') { this.openVerbPrompt('read', 'Read which scroll? [a-z or ESC]'); return; }
                    if (k === 'w') { this.openVerbPrompt('wield', 'Equip which item? [a-z or ESC]'); return; }
                    if (k === 'd') { this.openVerbPrompt('drop', 'Drop which item? [a-z or ESC]'); return; }
                }
                this.state.menuMode = 'none';
                return;
            }
            if (this.state.menuMode === 'item_action') {
                const item = this.state.selectedItem;
                this.state.menuMode = 'none';
                this.state.selectedItem = null;
                this.state.pendingPrompt = '';
                if (!item) return;
                if (k === 'd') { this.applyVerbToItem('drop', item); return; }
                if (k === 't' || k === 'f') { this.fireOrThrowItem(item); return; }
                if (k === 'T' || k === 'R' || (k === 'r' && item.equipped)) { this.applyVerbToItem('takeoff', item); return; }
                if (k === 'v' || k === 'x' || k === 'I' || k === ':' || k === ';') { this.inspectItem(item); return; }
                if (k === '{') { this.applyVerbToItem('inscribe', item); return; }
                if (k === '}') { this.applyVerbToItem('uninscribe', item); return; }
                if (lower === 'enter' || /^[wWPqreEazuUV]$/.test(k)) {
                    const primaryVerb = item.kind === 'potion' ? 'quaff'
                        : (item.kind === 'scroll' ? 'read'
                        : (item.kind === 'food' ? 'eat'
                        : ((item.kind === 'weapon' || item.kind === 'ranged' || item.kind === 'armor' || item.kind === 'ring' || item.kind === 'amulet' || item.kind === 'jewelry' || item.kind === 'shield')
                            ? (item.equipped ? 'takeoff' : 'wield') : 'use')));
                    this.applyVerbToItem(primaryVerb, item);
                }
                return;
            }
            if (this.state.menuMode === 'verb') {
                if (this.state.pendingVerb === 'dcss_ability' && (k === '1' || lower === 'enter' || k === '!')) {
                    this.state.menuMode = 'none';
                    this.state.pendingVerb = null;
                    this.state.pendingPrompt = '';
                    this.invokeDeityPower();
                    return;
                }
                if ((this.state.pendingVerb === 'throw' || this.state.pendingVerb === 'fire') && (lower === 'enter' || k === '5' || k === '.' || lower === 'up' || lower === 'down' || lower === 'left' || lower === 'right' || lower === 'home' || lower === 'pageup' || lower === 'end' || lower === 'pagedown')) {
                    const d = dirMap[lower] || [0, 0];
                    this.state.menuMode = 'none';
                    this.state.pendingVerb = null;
                    this.state.pendingPrompt = '';
                    this.executeDirectedAction('fire', d[0], d[1]);
                    return;
                }
                if (/^[a-z]$/i.test(k)) {
                    const item = p.inventory.find(it => it.letter === k) || p.inventory.find(it => it.letter === lower);
                    const verb = this.state.pendingVerb;
                    this.state.menuMode = 'none';
                    this.state.pendingVerb = null;
                    this.state.pendingPrompt = '';
                    if (!item) {
                        this.addMessage('You do not have that item.');
                        return;
                    }
                    if (verb === 'inspect') this.inspectItem(item);
                    else if (verb === 'throw' || verb === 'fire') this.fireOrThrowItem(item);
                    else this.applyVerbToItem(verb === 'dcss_ability' ? 'use' : verb, item);
                    return;
                }
            }
            if (this.state.menuMode === 'direction') {
                const verb = this.state.pendingVerb || 'fire';
                this.state.menuMode = 'none';
                this.state.pendingVerb = null;
                this.state.pendingPrompt = '';
                const d = dirMap[lower] || dirMap[k];
                if (d) {
                    this.executeDirectedAction(verb, d[0], d[1]);
                } else if (lower === 't' || k === '5' || k === '.' || lower === 'enter') {
                    this.executeDirectedAction(verb, 0, 0);
                } else {
                    this.addMessage('Cancelled.');
                }
                return;
            }
            if (this.state.menuMode === 'power_select' || this.state.menuMode === 'spells' || this.state.menuMode === 'skills') {
                const powers = this.getAvailablePowers();
                if (lower === 'i' || lower === 'z') {
                    this.openVerbPrompt('use', 'Use, zap, or evoke which item? [a-z or ESC]');
                    return;
                }
                if (this.state.menuMode === 'skills' && k === 'M') {
                    this.state.menuMode = 'spells';
                    this.state.pendingPrompt = `${this.spec.title || 'Realm'} — Spells & Powers ([1-4/a-d] Cast, [ESC] Close)`;
                    return;
                }
                // # ROOT-CAUSE: menuMode === 'skills' previously checked powers.length === 0 which was never true when DEFAULT_DISCIPLINE_POWERS existed
                if (this.state.menuMode === 'skills' && /^[a-d1-4]$/.test(lower)) {
                    const keyMap = { '1': 'a', '2': 'b', '3': 'c', '4': 'd' };
                    const effKey = keyMap[lower] || lower;
                    const trainingDisciplines = {
                        a: { id: 'fighting', name: 'Fighting & Melee Mastery', stat: 'str' },
                        b: { id: 'dodging', name: 'Dodging & Armour Defense', stat: 'dex' },
                        c: { id: 'evocations', name: 'Arcane Evocations & Wands', stat: 'int' },
                        d: { id: 'invocations', name: 'Invocations & Stealth', stat: 'wis' }
                    };
                    const chosen = trainingDisciplines[effKey];
                    if (chosen) {
                        this.state.skillFocus = chosen.id;
                        p.activeTrainingFocus = chosen.name;
                        if (!p._trainedFocusOnce) {
                            p._trainedFocusOnce = true;
                            p[chosen.stat] = (p[chosen.stat] || 12) + 1;
                            if (typeof this.recalcPlayerDefenses === 'function') this.recalcPlayerDefenses();
                        }
                        this.state.menuMode = 'none';
                        this.state.pendingPrompt = '';
                        this.addMessage(`Training focus set to ${chosen.name} (+1 ${chosen.stat.toUpperCase()} aptitude).`, 11);
                        return;
                    }
                }
                if (this.realm === 'ryod' && this.state.menuMode === 'power_select' && (/^[056]$/.test(k) || /^[1-4a-d]$/.test(lower))) {
                    const actSys = RyodSystems ? RyodSystems.resolveActiveSystems(this.spec) : {};
                    this.state.menuMode = 'none';
                    this.state.pendingPrompt = '';
                    if (k === '0') {
                        p.activeSong = null;
                        p.activeStance = null;
                        this.addMessage('You relax your martial stance and cease all weaving songs.', 11);
                        this.advanceTurn();
                        return;
                    }
                    if (k === '6') {
                        if (RyodSystems) RyodSystems.invokeDeityPower(this);
                        else this.invokeDeityPower();
                        return;
                    }
                    if (k === '5') {
                        if (p.avatarId === 'dragon') {
                            const hostiles = this.state.monsters.filter(m => !m.isPet && !m.peaceful && !m.captive && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
                            const dmg = 18 + this.rand(8);
                            for (const h of hostiles) {
                                h.hp -= dmg;
                                if (h.hp <= 0) this.handleMonsterKilled(h);
                            }
                            this.addMessage(`You unleash a torrent of ancient dragon breath, searing ${hostiles.length} foes for ${dmg} damage!`, 14);
                            this.advanceTurn();
                            return;
                        }
                        if (p.avatarId === 'beholder') {
                            this.state.menuMode = 'direction';
                            this.state.pendingVerb = 'beholder_gaze';
                            this.state.pendingPrompt = 'Direct Beholder Gaze Ray: [Direction, or Enter for nearest foe]';
                            return;
                        }
                        if (p.avatarId === 'lich') {
                            const target = this.state.monsters.find(m => !m.isPet && !m.peaceful && !m.captive && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
                            if (target) {
                                const d = 14 + this.rand(6);
                                target.hp -= d;
                                p.hp = Math.min(p.hpMax, p.hp + Math.floor(d / 2));
                                p.pw = Math.min(p.pwMax, (p.pw || 0) + 3);
                                this.addMessage(`You channel Necrotic Drain on ${target.race} for ${d} dmg (+${Math.floor(d / 2)} HP, +3 MP)!`, 14);
                                if (target.hp <= 0) this.handleMonsterKilled(target);
                                this.advanceTurn();
                            } else {
                                this.addMessage('No hostiles in sight to drain.');
                            }
                            return;
                        }
                        if (p.avatarId === 'vampire') {
                            if (RyodSystems && RyodSystems.AVATARS && RyodSystems.AVATARS.vampire && RyodSystems.AVATARS.vampire.innatePower) {
                                this.castActivePower(RyodSystems.AVATARS.vampire.innatePower);
                            } else {
                                p.hp = Math.min(p.hpMax, p.hp + 12);
                                this.addMessage('You meld with the shadows and regenerate your lifeblood.', 11);
                                this.advanceTurn();
                            }
                            return;
                        }
                        if (p.innatePower) {
                            this.castActivePower(p.innatePower);
                            return;
                        }
                        this.addMessage('You have no innate avatar power.');
                        return;
                    }
                    const idx = /^[1-4]$/.test(k) ? parseInt(k, 10) : (/^[a-d]$/.test(lower) ? (lower.charCodeAt(0) - 96) : 0);
                    if (idx >= 1 && idx <= 4) {
                        if (actSys.wovenSongs) {
                            const songIds = ['sharpness', 'silence', 'staying', 'slaying'];
                            RyodSystems.toggleSong(this, songIds[idx - 1]);
                            return;
                        }
                        if (actSys.martialStances) {
                            const stanceIds = ['genbu', 'byakko', 'seiryu', 'suzaku'];
                            RyodSystems.toggleStance(this, stanceIds[idx - 1]);
                            return;
                        }
                        const ryodPowers = this.getAvailablePowers();
                        if (ryodPowers[idx - 1]) {
                            this.castActivePower(ryodPowers[idx - 1]);
                            return;
                        }
                    }
                    return;
                }
                const numIdx = /^[1-9]$/.test(k) ? (parseInt(k, 10) - 1) : (/^[a-d]$/.test(lower) ? (lower.charCodeAt(0) - 97) : -1);
                if (numIdx >= 0 && numIdx < powers.length) {
                    this.state.menuMode = 'none';
                    this.state.pendingPrompt = '';
                    this.castActivePower(powers[numIdx]);
                    return;
                }
            }
            this.state.menuMode = 'none';
            this.state.pendingVerb = null;
            this.state.pendingPrompt = '';
            return;
        }

        if (dirMap[lower] || dirMap[k]) {
            const [dx, dy] = dirMap[lower] || dirMap[k];
            this.moveOrAttack(dx, dy);
            return;
        }

        if (k === 'i') { this.state.menuMode = 'inven'; return; }
        if (k === 'e' && this.realm !== 'nethack') {
            this.state.menuMode = 'equip';
            return;
        }
        if (k === 'E' || (k === 'e' && this.realm === 'nethack')) {
            this.openVerbPrompt('eat', 'Eat which food item? [a-z or ESC]');
            return;
        }
        if (k === 'q') { this.openVerbPrompt('quaff', 'Drink which potion? [a-z or ESC]'); return; }
        if (k === 'r') { this.openVerbPrompt('read', 'Read which scroll? [a-z or ESC]'); return; }
        if (k === 'w' || k === 'W') { this.openVerbPrompt('wield', 'Equip which item? [a-z or ESC]'); return; }
        if (k === 'P') { this.openVerbPrompt('wield', 'Put on which ring or amulet? [a-z or ESC]'); return; }
        if (k === 'T' || k === 'R') { this.openVerbPrompt('takeoff', 'Remove which item? [a-z or ESC]'); return; }
        if (k === 't' || k === 'f') {
            if (this.realm === 'ryod' && p.avatarId === 'beholder') {
                this.state.menuMode = 'direction';
                this.state.pendingVerb = 'beholder_gaze';
                this.state.pendingPrompt = 'Direct Beholder Gaze Ray: [Direction, or Enter for nearest foe]';
                return;
            }
            this.openVerbPrompt(k === 'f' ? 'fire' : 'throw', 'Throw/fire which item? [a-z, or Enter/arrows to shoot, ESC]');
            return;
        }
        if (k === 'd') { this.openVerbPrompt('drop', 'Drop which item? [a-z or ESC]'); return; }
        if (k === '{') { this.openVerbPrompt('inscribe', 'Inscribe which item? [a-z or ESC]'); return; }
        if (k === '}') { this.openVerbPrompt('uninscribe', 'Uninscribe which item? [a-z or ESC]'); return; }
        if (k === 'I') {
            if (this.realm === 'dcss' && this.getAvailablePowers().length > 0) {
                this.state.menuMode = 'spells';
                this.state.pendingPrompt = 'Spell Library & Abilities (Press 1-4 / a-d to Cast, or ESC to return)';
                return;
            }
            this.openVerbPrompt('inspect', 'Examine which item? [a-z or ESC]');
            return;
        }
        if (k === 'v' || (k === 'x' && this.realm === 'brogue')) {
            this.openVerbPrompt('inspect', 'Examine which item? [a-z or ESC]');
            return;
        }
        if (k === 'x' || k === "'") {
            if ((this.realm === 'ryod' || k === "'") && p.inventory.filter(it => it.kind === 'weapon' || it.kind === 'ranged').length > 1) {
                const weapons = p.inventory.filter(it => it.kind === 'weapon' || it.kind === 'ranged');
                const curIdx = weapons.findIndex(it => it.equipped === 'weapon');
                weapons.forEach(it => { if (it.equipped === 'weapon') it.equipped = null; });
                const nextW = weapons[(curIdx + 1) % weapons.length];
                nextW.equipped = 'weapon';
                if (typeof this.recalcPlayerDefenses === 'function') this.recalcPlayerDefenses();
                this.addMessage(`You swap weapons and now wield ${formatItemDesc(nextW)}.`, 11);
                return;
            }
            const vis = this.state.monsters.filter(m => this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
            this.addMessage(vis.length ? `Visible: ${vis.map(m => `${m.race} (${m.hp}/${m.hp_max} HP)`).join(', ')}.` : `You survey ${this.state.branchName} ${this.state.depth}: no monsters in sight.`, 11);
            return;
        }
        if (k === 'G' && (p.godMode || this.spec.godMode)) {
            const nextDepth = Math.min(this.spec.goalDepth || 15, (this.state.depth || 0) + 1);
            p.hp = p.hpMax;
            p.pw = p.pwMax;
            this.generateLevel(nextDepth);
            this.addMessage(`[GOD MODE] You warp directly to ${this.state.branchName} Level ${this.state.depth}!`, 14);
            this.saveGame();
            return;
        }
        if (k === 'z' && this.realm === 'brogue') {
            if (p.hp < p.hpMax) p.hp = Math.min(p.hpMax, p.hp + 1);
            if (p.pw < p.pwMax && this.state.turn % 2 === 0) p.pw++;
            this.advanceTurn();
            return;
        }
        if (k === 'z' && this.realm === 'dcss' && this.getAvailablePowers().length > 0) {
            const powers = this.getAvailablePowers();
            const labels = powers.map((pw, idx) => `[${idx + 1}/${String.fromCharCode(97 + idx)}] ${pw.name} (${pw.cost} ${this.spec.resourceLabel || 'MP'})`).join('  ');
            this.state.menuMode = 'power_select';
            this.state.pendingPrompt = `Cast Spell: ${labels}  [i] Item  [ESC]`;
            return;
        }
        if (k === 'a' || k === 'V' || k === 'z' || k === 'Z' || k === 'u' || k === 'U') {
            if (this.realm === 'ryod' && k === 'a') {
                this.openVerbPrompt('use', 'Activate which item? [a-z or ESC]');
                return;
            }
            if (this.realm === 'dcss' && k === 'a' && (p.piety || 0) >= 1 && p.deity) {
                this.openVerbPrompt('dcss_ability', `[1/Enter] Invoke ${p.deity} Divine Power, or [a-z] Activate Item [ESC]`);
                return;
            }
            if ((k === 'U' || k === 'Z') && p.innatePower) {
                this.castActivePower(p.innatePower);
                return;
            }
            this.openVerbPrompt('use', 'Use, zap, or evoke which item/spell? [a-z or ESC]');
            return;
        }
        if (k === 'm') {
            if (this.realm === 'ryod') {
                this.state.menuMode = 'power_select';
                const actSys = RyodSystems ? RyodSystems.resolveActiveSystems(this.spec) : {};
                const label = actSys.wovenSongs ? 'Songs' : (actSys.martialStances ? 'Stances' : 'Powers');
                this.state.pendingPrompt = `Abilities & Magic: [1-4/a-d] ${label}  [5] Avatar Innate  [6] Divine Invocation  [0] End Stance/Song  [ESC]`;
                return;
            }
            if (this.realm === 'dcss') {
                this.state.menuMode = 'skills';
                this.state.pendingPrompt = 'Skills & Training (Press ESC or Space to return)';
            } else if (this.getAvailablePowers().length > 0) {
                const powers = this.getAvailablePowers();
                const labels = powers.map((pw, idx) => `[${idx + 1}/${String.fromCharCode(97 + idx)}] ${pw.name} (${pw.cost} ${this.spec.resourceLabel || 'MP'})`).join('  ');
                this.state.menuMode = 'power_select';
                this.state.pendingPrompt = `${this.spec.verbLabel || 'Invoke Power'}: ${labels}  [i] Item  [ESC]`;
            } else {
                this.openVerbPrompt('use', 'Use or invoke which item/spell? [a-z or ESC]');
            }
            return;
        }
        if (k === 'M' || k === 'b') {
            this.state.menuMode = 'spells';
            this.state.pendingPrompt = 'Spell Library & Abilities (Press 1-4 / a-d to Cast, or ESC to return)';
            return;
        }
        if (k === 'C' || k === '@' || k === '%') {
            this.state.menuMode = 'char';
            this.state.pendingPrompt = 'Character Overview (Press ESC or Space to return)';
            return;
        }
        if (k === '?') {
            this.state.menuMode = 'help';
            this.state.pendingPrompt = 'Realm Commands & Help (Press ESC or Space to return)';
            return;
        }
        if (k === '~' || k === '\\') {
            this.state.menuMode = 'knowledge';
            this.state.pendingPrompt = 'Discovered Lore & Knowledge (Press ESC or Space to return)';
            return;
        }
        if (k === ';' || k === ':') {
            if (k === ':' && p.inventory.length > 0) {
                this.openVerbPrompt('inspect', 'Examine which item? [a-z or ESC]');
                return;
            }
            const vis = this.state.monsters.filter(m => this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
            this.addMessage(vis.length ? `Visible: ${vis.map(m => `${m.race} (${m.hp}/${m.hp_max} HP)`).join(', ')}.` : `You survey ${this.state.branchName} ${this.state.depth}: no monsters in sight.`, 11);
            return;
        }
        if (k === 'o' || k === 'O') { this.openOrCloseDoor(true); return; }
        if (k === 'c') { this.openOrCloseDoor(false); return; }
        if (k === 'D') { this.disarmAdjacentTrap(); return; }
        if (k === 'p') {
            this.interactContextualFeature();
            return;
        }
        if (k === ',' || k === 'g') {
            this.pickupAtPlayer();
            return;
        }
        if (k === '>') {
            const cell = this.state.map[p.y][p.x];
            if (cell.feat === FEAT.DOWN_STAIR) {
                const maxD = this.spec.goalDepth || 30;
                const nextD = Math.min(maxD, this.state.depth + 1);
                this.generateLevel(nextD);
                this.addMessage(`You descend into ${this.state.branchName} (Level ${this.state.depth}).`, 14);
                this.saveGame();
            } else if (this.realm === 'dcss' && cell.feat === FEAT.ALTAR) {
                this.prayAtAltar();
            } else {
                this.addMessage('There are no downward stairs here.');
            }
            return;
        }
        if (k === '<') {
            const cell = this.state.map[p.y][p.x];
            if (cell.feat === FEAT.UP_STAIR) {
                const minDepth = this.spec.hasTown ? 0 : 1;
                if (this.state.depth === 1 && p.hasAmulet) {
                    if (this.spec.hasTown) this.generateLevel(0);
                    p.winner = true;
                    this.addMessage(`Glorious Victory! You ascend into the sunlight with the ${this.spec.goalItemName || 'Amulet of Yendor'}!`, 14);
                    this.saveGame();
                } else if (this.state.depth > minDepth) {
                    this.generateLevel(this.state.depth - 1);
                    this.addMessage(this.state.depth === 0 ? `You return to Sanctuary Town (${this.state.branchName}).` : `You climb upward to Level ${this.state.depth}.`, 11);
                    this.saveGame();
                } else {
                    this.addMessage('You cannot leave the dungeon empty-handed!');
                }
            } else {
                this.addMessage('There are no upward stairs here.');
            }
            return;
        }
        if (k === 's' || k === 'S') {
            this.searchAround();
            return;
        }
        if (lower === 'enter' || lower === 'return') {
            const cell = this.state.map[p.y][p.x];
            if (cell.feat === FEAT.ALTAR || cell.feat === FEAT.FOUNTAIN || cell.feat === FEAT.DOWN_STAIR || cell.feat === FEAT.UP_STAIR) {
                this.interactContextualFeature();
                return;
            }
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = p.x + dx, ny = p.y + dy;
                    if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H) {
                        const f = this.state.map[ny][nx].feat;
                        if (f === FEAT.ANVIL || f === FEAT.CAGE) {
                            this.interactContextualFeature();
                            return;
                        }
                    }
                }
            }
        }
        if (k === '.' || k === '5' || lower === 'space') {
            if (p.hp < p.hpMax) p.hp = Math.min(p.hpMax, p.hp + 1);
            if (p.pw < p.pwMax && this.state.turn % 2 === 0) p.pw++;
            this.advanceTurn();
        }
    }

    inspectItem(item) {
        const desc = formatItemDesc(item);
        const cat = item.kind || 'item';
        const wt = ((item.weight || 10) / 10).toFixed(1);
        this.addMessage(`${item.letter}) ${desc} [${cat}, ${wt} lb] — ${item.equipped ? 'Currently equipped' : 'Carried in pack'}.`, 11);
    }

    fireOrThrowItem(item) {
        const target = this.state.monsters.find(m => !m.isPet && !m.peaceful && !m.captive && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
        const dmg = 5 + this.rand(7) + (item.bonus || 0);
        if (target) {
            target.hp -= dmg;
            this.addMessage(`You hurl ${item.name} at the ${target.race} for ${dmg} damage!`, 14);
            if (target.hp <= 0) this.handleMonsterKilled(target);
        } else {
            this.addMessage(`You hurl ${item.name} into the shadows.`);
        }
        if (item.kind !== 'weapon' || !item.equipped) {
            item.count = (item.count || 1) - 1;
            this.reindexInventory();
        }
        this.advanceTurn();
    }

    executeDirectedAction(verb, dx, dy) {
        const p = this.state.player;
        if (verb === 'open' || verb === 'close') {
            this.openOrCloseDoor(verb === 'open', dx, dy);
            return;
        }
        if (verb === 'disarm') {
            this.disarmAdjacentTrap(dx, dy);
            return;
        }
        if (verb === 'beholder_gaze') {
            let target = null;
            if (dx !== 0 || dy !== 0) {
                for (let step = 1; step <= 8; step++) {
                    const tx = p.x + dx * step, ty = p.y + dy * step;
                    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) break;
                    if (!isWalkableFeat(this.state.map[ty][tx].feat)) break;
                    const mon = this.state.monsters.find(m => m.x === tx && m.y === ty && !m.isPet && !m.peaceful && !m.captive);
                    if (mon) { target = mon; break; }
                }
            } else {
                target = this.state.monsters.find(m => !m.isPet && !m.peaceful && !m.captive && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
            }
            if (target) {
                const dmg = 18 + this.rand(6);
                target.hp -= dmg;
                this.addMessage(`Your central eye projects a ray of disintegration at ${target.race} for ${dmg} damage!`, 14);
                if (target.hp <= 0) this.handleMonsterKilled(target);
            } else {
                this.addMessage('Your gaze pierces the shadows but strikes nothing.');
            }
            this.advanceTurn();
            return;
        }
        let target = null;
        if (dx !== 0 || dy !== 0) {
            for (let step = 1; step <= 8; step++) {
                const tx = p.x + dx * step, ty = p.y + dy * step;
                if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) break;
                if (!isWalkableFeat(this.state.map[ty][tx].feat)) break;
                const mon = this.state.monsters.find(m => m.x === tx && m.y === ty && !m.isPet && !m.peaceful && !m.captive);
                if (mon) { target = mon; break; }
            }
        } else {
            target = this.state.monsters.find(m => !m.isPet && !m.peaceful && !m.captive && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
        }
        const ranged = p.inventory.find(it => it.kind === 'ranged' || it.kind === 'ammo') || p.inventory.find(it => it.equipped === 'weapon');
        const dmg = 5 + this.rand(7) + (ranged && ranged.bonus ? ranged.bonus : 1);
        if (target) {
            target.hp -= dmg;
            this.addMessage(`Your ranged attack strikes the ${target.race} for ${dmg} damage!`, 14);
            if (target.hp <= 0) this.handleMonsterKilled(target);
        } else {
            this.addMessage('Your shot whistles into the darkness and hits nothing.');
        }
        this.advanceTurn();
    }

    openOrCloseDoor(open, dx = 0, dy = 0) {
        const p = this.state.player;
        const targetFeat = open ? FEAT.CLOSED_DOOR : FEAT.OPEN_DOOR;
        const dirs = (dx !== 0 || dy !== 0) ? [[dx, dy]] : [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const [ox, oy] of dirs) {
            const tx = p.x + ox, ty = p.y + oy;
            if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
            if (!open && this.state.monsters.some(m => m.x === tx && m.y === ty)) {
                this.addMessage('There is a creature blocking the doorway!');
                return;
            }
            const cell = this.state.map[ty][tx];
            if (cell.feat === targetFeat) {
                cell.feat = open ? FEAT.OPEN_DOOR : FEAT.CLOSED_DOOR;
                cell.glyph = open ? "'" : '+';
                this.addMessage(open ? 'You open the door.' : 'You close the door.');
                this.updateVisibility();
                this.advanceTurn();
                return;
            }
        }
        this.addMessage(open ? 'There is no closed door nearby to open.' : 'There is no open door nearby to close.');
    }

    disarmAdjacentTrap(dx = 0, dy = 0) {
        const p = this.state.player;
        const dirs = (dx !== 0 || dy !== 0) ? [[dx, dy]] : [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const [ox, oy] of dirs) {
            const tx = p.x + ox, ty = p.y + oy;
            if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
            const cell = this.state.map[ty][tx];
            if (cell.feat === FEAT.TRAP || cell.glyph === '^') {
                cell.feat = FEAT.FLOOR;
                cell.glyph = '.';
                this.addMessage('You carefully disarm the dungeon trap!', 10);
                this.advanceTurn();
                return;
            }
        }
        this.addMessage('You find no trap nearby to disarm.');
    }

    searchAround() {
        const p = this.state.player;
        let found = 0;
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                const tx = p.x + ox, ty = p.y + oy;
                if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
                const cell = this.state.map[ty][tx];
                if (!cell.known) { cell.known = true; found++; }
            }
        }
        if (p.hp < p.hpMax) p.hp = Math.min(p.hpMax, p.hp + 1);
        this.addMessage(found > 0 ? 'You search the surrounding stonework and spot hidden detail!' : 'You search the surrounding area carefully.');
        this.advanceTurn();
    }

    openVerbPrompt(verb, promptText) {
        this.state.menuMode = 'verb';
        this.state.pendingVerb = verb;
        this.state.pendingPrompt = promptText;
    }

    applyVerbToItem(verb, item) {
        const p = this.state.player;
        if (verb === 'inscribe') {
            item.inscription = item.inscription || '!k';
            this.addMessage(`You inscribe ${formatItemDesc(item)}.`, 11);
            return;
        }
        if (verb === 'uninscribe') {
            delete item.inscription;
            this.addMessage(`You erase the inscription on ${formatItemDesc(item)}.`, 11);
            return;
        }
        if (verb === 'quaff' || (verb === 'use' && item.kind === 'potion')) {
            if (this.state && item) {
                this.state.identifiedTypes = this.state.identifiedTypes || {};
                this.state.identifiedTypes[item.name] = true;
                item.identified = true;
            }
            const pLower = String(item.name || '').toLowerCase();
            if (item.levelGain) {
                if (this.usesExpLevels()) {
                    const nextReq = this.getExpNextForLevel(p.level);
                    if (nextReq > 0) {
                        p.exp = Math.max(p.exp, nextReq);
                        this.checkExperience();
                    } else {
                        p.hpMax += 6;
                        p.hp = p.hpMax;
                        this.addMessage(`You quaff the ${item.name} and feel more experienced!`, 14);
                    }
                }
            } else if (item.strengthGain) {
                p.str += item.strengthGain;
                p.hpMax += 6;
                p.hp = p.hpMax;
                this.addMessage(`You quaff the ${item.name}. Surge of power! Strength increases to ${p.str} and max health rises!`, 14);
            } else if (item.speedTurns || /speed/i.test(pLower)) {
                p.speedBoost = Math.max(p.speedBoost || 0, 25);
                this.addMessage(`You drink the ${item.name}. Swiftness surges through your limbs!`, 14);
            } else if (item.heroismTurns || /heroism/i.test(pLower)) {
                p.heroism = 25;
                p.hp = Math.min(p.hpMax, p.hp + 20);
                p.ac += 4;
                this.addMessage(`You drink the ${item.name}. Ancient heroism fills your soul! (+20 HP, +4 AC)`, 14);
            } else if (item.levitationTurns || /levitation/i.test(pLower)) {
                p.levitating = Math.max(p.levitating || 0, 30);
                this.addMessage(`You drink the ${item.name}. Your feet rise gracefully off the stone floor!`, 14);
            } else if (/restore/i.test(pLower)) {
                p.pw = p.pwMax;
                p.hp = p.hpMax;
                p.poisoned = 0;
                p.blind = 0;
                p.confused = 0;
                this.addMessage(`You drink the ${item.name}. Boundless vitality and mana are restored!`, 14);
            } else if (/poison/i.test(pLower)) {
                p.poisoned = Math.max(p.poisoned || 0, 10);
                p.hp = Math.max(1, p.hp - 6);
                this.addMessage(`You drink the ${item.name}. Burning poison sears your veins! (-6 HP)`, 12);
            } else if (/confusion/i.test(pLower)) {
                p.confused = Math.max(p.confused || 0, 8);
                this.addMessage(`You drink the ${item.name}. Swirling confusion clouds your mind!`, 12);
            } else if (item.grantsTelepathy || /telepathy/i.test(pLower)) {
                p.telepathy = true;
                p.telepathyTurns = 40;
                this.addMessage(`You drink the ${item.name}. Your third eye opens, revealing all minds in the deep!`, 14);
            } else {
                const heal = item.heal || 18;
                p.hp = Math.min(p.hpMax, p.hp + heal);
                p.poisoned = 0;
                this.addMessage(`You drink the ${item.name} and recover vitality! (${p.hp}/${p.hpMax} HP)`, 10);
            }
            item.count = (item.count || 1) - 1;
            this.reindexInventory();
            this.advanceTurn();
            return;
        }
        if (verb === 'read' || (verb === 'use' && item.kind === 'scroll')) {
            if (this.state && item) {
                this.state.identifiedTypes = this.state.identifiedTypes || {};
                this.state.identifiedTypes[item.name] = true;
                item.identified = true;
            }
            const sLower = String(item.name || '').toLowerCase();
            if (/identify/i.test(sLower)) {
                p.inventory.forEach(it => { it.identified = true; if (this.state.identifiedTypes) this.state.identifiedTypes[it.name] = true; });
                this.addMessage(`You read the ${item.name}. Brilliant revelation illuminates every item in your pack!`, 14);
            } else if (/remove curse/i.test(sLower)) {
                let lifted = 0;
                p.inventory.forEach(it => { if (it.beatitude === 'cursed') { it.beatitude = 'uncursed'; lifted++; } });
                this.addMessage(`You read the ${item.name}. Holy radiance lifts ${lifted} curse(s) from your gear!`, 14);
            } else if (/enchant weapon/i.test(sLower)) {
                const wep = p.inventory.find(i => i.equipped === 'weapon') || p.inventory.find(i => i.kind === 'weapon');
                if (wep) {
                    wep.bonus = (wep.bonus || 0) + 1;
                    p.enchantments = (p.enchantments || 0) + 1;
                    this.addMessage(`Glowing runes infuse your ${wep.name} (+${wep.bonus})!`, 14);
                } else {
                    this.addMessage(`The magic fizzles; you hold no weapon to enchant.`);
                }
            } else if (/enchant armor/i.test(sLower)) {
                const arm = p.inventory.find(i => i.equipped === 'body' || i.equipped === 'shield' || i.equipped === 'helm' || i.equipped === 'cloak' || i.equipped === 'gloves' || i.equipped === 'boots') || p.inventory.find(i => i.kind === 'armor');
                if (arm) {
                    arm.bonus = (arm.bonus || 0) + 1;
                    p.enchantments = (p.enchantments || 0) + 1;
                    this.recalcPlayerDefenses();
                    this.addMessage(`Impervious steel runes harden your ${arm.name} (+${arm.bonus})!`, 14);
                } else {
                    this.addMessage(`The magic fizzles; you wear no armor to enchant.`);
                }
            } else if (item.enchantGain || /universal enchantment/i.test(sLower)) {
                p.enchantments = (p.enchantments || 0) + 1;
                const eq = p.inventory.find(i => i.equipped === 'weapon')
                    || p.inventory.find(i => i.equipped === 'body' || i.equipped === 'armor')
                    || p.inventory.find(i => i.kind === 'staff' || i.kind === 'wand' || i.kind === 'ring')
                    || item;
                eq.bonus = (eq.bonus || 0) + 1;
                if (typeof eq.charges === 'number') eq.charges += 1;
                this.recalcPlayerDefenses();
                this.addMessage(`Universal runes of enchantment infuse your ${eq.name} (+${eq.bonus})!`, 14);
            } else if (/teleport/i.test(sLower)) {
                p.x = 2 + this.rand(MAP_W - 4);
                p.y = 2 + this.rand(MAP_H - 4);
                this.updateVisibility();
                this.addMessage(`You read the ${item.name}. Reality folds around you in a spatial jump!`, 11);
            } else if (/genocide/i.test(sLower)) {
                const nearestHostile = this.state.monsters.find(m => !m.isPet && !m.peaceful);
                if (nearestHostile) {
                    const doomed = nearestHostile.race;
                    this.state.monsters = this.state.monsters.filter(m => m.race !== doomed || m.isPet);
                    this.addMessage(`You speak the cosmic syllable of Genocide! All ${doomed}s are expunged!`, 14);
                } else {
                    this.addMessage(`A deafening thunderclap rattles the dungeon!`);
                }
            } else if (/recharging/i.test(sLower)) {
                p.inventory.filter(i => i.kind === 'wand').forEach(w => { w.charges = w.maxCharges || 5; });
                this.addMessage(`Crackling mana cascades through your pack; all wands are fully recharged!`, 14);
            } else {
                for (let y = 0; y < MAP_H; y++) {
                    for (let x = 0; x < MAP_W; x++) {
                        if (this.state.map[y][x].feat !== FEAT.PERM_WALL) this.state.map[y][x].known = true;
                    }
                }
                this.addMessage(`You read the ${item.name}. The layout of this floor is revealed!`, 11);
            }
            item.count = (item.count || 1) - 1;
            this.reindexInventory();
            this.advanceTurn();
            return;
        }
        if (verb === 'eat' || (verb === 'use' && item.kind === 'food')) {
            p.nutrition = Math.min(2000, (p.nutrition || 800) + (item.nutrition || 750));
            p.hp = Math.min(p.hpMax, p.hp + 4);
            this.addMessage(`You eat the ${item.name}. It tastes hearty and restores your stamina.`, 10);
            item.count = (item.count || 1) - 1;
            this.reindexInventory();
            this.advanceTurn();
            return;
        }
        if (verb === 'wield') {
            if (p.avatarId === 'beholder') {
                const lowerItem = String(item.name || '').toLowerCase();
                const k = String(item.kind || '').toLowerCase();
                if (k === 'armor' || k === 'body' || k === 'cloak' || k === 'shield' || k === 'helm' || k === 'gloves' || k === 'boots' ||
                    /\b(armor|mail|plate|robe|cloak|shield|buckler|helm|helmet|cap|gloves|gauntlets|boots|shoes)\b/.test(lowerItem)) {
                    this.addMessage(`An eyestalk aberration cannot wear body armor or martial barding!`, 12);
                    return;
                }
            }
            const lowerItem = String(item.name || '').toLowerCase();
            const k = String(item.kind || '').toLowerCase();
            let slot = item.slot;
            if (!slot) {
                if (k === 'bow' || k === 'ranged' || /\b(bow|crossbow|sling)\b/.test(lowerItem)) slot = 'bow';
                else if (k === 'shield' || /\b(shield|buckler|targe)\b/.test(lowerItem)) slot = 'shield';
                else if (k === 'cloak' || /\b(cloak|cape|mantle)\b/.test(lowerItem)) slot = 'cloak';
                else if (k === 'helm' || /\b(helm|helmet|crown|cap|coif)\b/.test(lowerItem)) slot = 'helm';
                else if (k === 'gloves' || /\b(gloves|gauntlets|bracers)\b/.test(lowerItem)) slot = 'gloves';
                else if (k === 'boots' || /\b(boots|shoes|greaves)\b/.test(lowerItem)) slot = 'boots';
                else if (k === 'light' || /\b(lantern|torch|phial)\b/.test(lowerItem)) slot = 'light';
                else if (k === 'amulet' || /\b(amulet|necklace|periapt|talisman)\b/.test(lowerItem)) slot = 'amulet';
                else if (k === 'ring' || /\b(ring|band)\b/.test(lowerItem)) {
                    if (p.avatarId === 'beholder') {
                        const used = new Set(p.inventory.filter(i => i.equipped && i.equipped.startsWith('ring')).map(i => i.equipped));
                        const freeSlot = ['ring1', 'ring2', 'ring3', 'ring4', 'ring5', 'ring6'].find(s => !used.has(s));
                        if (!freeSlot) {
                            this.addMessage('All 6 of your eyestalks are already bearing rings! (Remove one first with [T]).', 12);
                            return;
                        }
                        slot = freeSlot;
                    } else {
                        const hasLeft = p.inventory.some(i => i.equipped === 'ringLeft');
                        slot = !hasLeft ? 'ringLeft' : 'ringRight';
                    }
                } else if (k === 'armor' || /\b(armor|mail|plate|robe|cuirass|hauberk|leather|tunic|vestment)\b/.test(lowerItem)) {
                    slot = 'body';
                } else {
                    slot = 'weapon';
                }
            }
            const existing = p.inventory.find(it => it.equipped === slot);
            if (existing && existing.beatitude === 'cursed') {
                this.addMessage(`The cursed ${existing.name} is welded to your flesh and cannot be removed!`, 12);
                return;
            }
            if (existing) existing.equipped = null;
            item.equipped = slot;
            this.reindexInventory();
            this.addMessage(`You equip the ${formatItemDesc(item)} on your ${slot}.`, 11);
            this.advanceTurn();
            return;
        }
        if (verb === 'takeoff') {
            if (item.beatitude === 'cursed') {
                this.addMessage(`The cursed ${item.name} is welded to your flesh and cannot be removed!`, 12);
                return;
            }
            const prevSlot = item.equipped || 'equipment';
            item.equipped = null;
            this.reindexInventory();
            this.addMessage(`You remove the ${formatItemDesc(item)} from your ${prevSlot}.`, 11);
            this.advanceTurn();
            return;
        }
        if (verb === 'drop') {
            this.state.objects.push({ ...item, x: p.x, y: p.y, count: 1, equipped: null });
            item.count = (item.count || 1) - 1;
            this.reindexInventory();
            this.addMessage(`You drop the ${item.name}.`);
            this.advanceTurn();
            return;
        }
        if (verb === 'zap' || (verb === 'use' && item.kind === 'wand')) {
            if (this.state && item) {
                this.state.identifiedTypes = this.state.identifiedTypes || {};
                this.state.identifiedTypes[item.name] = true;
                item.identified = true;
            }
            if (typeof item.charges === 'number') {
                if (item.charges <= 0) {
                    this.addMessage(`The ${item.name} clicks hollowly; it has no charges left.`, 12);
                    return;
                }
                item.charges--;
            }
            const target = this.state.monsters.find(m => !m.isPet && !m.peaceful && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
            const wLower = String(item.name || '').toLowerCase();
            if (/disintegration/i.test(wLower)) {
                if (target) {
                    target.hp -= 35;
                    this.addMessage(`A ray of pure disintegration annihilates the ${target.race} for 35 damage!`, 14);
                    if (target.hp <= 0) this.handleMonsterKilled(target);
                } else {
                    this.addMessage(`A crackling disintegration ray punches through the dungeon darkness!`, 14);
                }
            } else if (/fire/i.test(wLower)) {
                if (target) {
                    target.hp -= 20;
                    this.addMessage(`A roaring bolt of fire strikes the ${target.race} for 20 damage!`, 14);
                    if (target.hp <= 0) this.handleMonsterKilled(target);
                } else {
                    this.addMessage(`A jet of fire shoots into the corridor!`, 14);
                }
            } else if (/frost|cold/i.test(wLower)) {
                if (target) {
                    target.hp -= 20;
                    this.addMessage(`A chilling lance of frost strikes the ${target.race} for 20 damage!`, 14);
                    if (target.hp <= 0) this.handleMonsterKilled(target);
                } else {
                    this.addMessage(`Freezing frost crystallizes in the air!`, 14);
                }
            } else if (/lightning/i.test(wLower)) {
                if (target) {
                    target.hp -= 24;
                    this.addMessage(`A blinding bolt of lightning arcs through the ${target.race} for 24 damage!`, 14);
                    if (target.hp <= 0) this.handleMonsterKilled(target);
                } else {
                    this.addMessage(`A brilliant fork of lightning illuminates the chamber!`, 14);
                }
            } else if (/teleport/i.test(wLower)) {
                if (target) {
                    target.x = 2 + this.rand(MAP_W - 4);
                    target.y = 2 + this.rand(MAP_H - 4);
                    this.addMessage(`The ${target.race} teleports away in a swirl of arcane smoke!`, 11);
                } else {
                    this.addMessage(`Space wavers around the wand tip.`, 11);
                }
            } else if (/sleep/i.test(wLower)) {
                if (target) {
                    target.energy = -200;
                    this.addMessage(`The ${target.race} slumps into a deep magical slumber!`, 11);
                } else {
                    this.addMessage(`Drowsy blue mist wafts into the darkness.`, 11);
                }
            } else if (/polymorph/i.test(wLower)) {
                if (target) {
                    const randMon = this.spec.monsters[this.rand(this.spec.monsters.length)];
                    target.race = randMon.name; target.hp = randMon.hp; target.hp_max = randMon.hp; target.glyph = randMon.glyph;
                    this.addMessage(`A beam of shifting chaos transforms the target into a ${randMon.name}!`, 14);
                } else {
                    this.addMessage(`Sparks of chaotic flux fizzle against the stone.`, 11);
                }
            } else {
                if (target) {
                    const dmg = 8 + this.rand(8);
                    target.hp -= dmg;
                    this.addMessage(`Arcane energy blasts the ${target.race} for ${dmg} damage!`, 14);
                    if (target.hp <= 0) this.handleMonsterKilled(target);
                } else {
                    p.speedBoost = 15;
                    this.addMessage(`You channel arcane power and feel yourself surge with haste!`, 11);
                }
            }
            this.advanceTurn();
            return;
        }
    }

    getAvailablePowers() {
        const p = this.state && this.state.player;
        if (!p) return [];
        const out = [];
        if (Array.isArray(p.disciplinePowers)) {
            for (const dp of p.disciplinePowers) out.push(dp);
        }
        if (p.innatePower && p.innatePower.name) {
            out.push({ ...p.innatePower, key: String(out.length + 1) });
        }
        return out;
    }

    castActivePower(power, targetX, targetY) {
        if (!power) return;
        const p = this.state.player;
        const resLabel = this.spec.resourceLabel || 'MP';
        const cost = (p.godMode || this.spec.godMode) ? 0 : (power.cost || 2);
        if ((p.pw || 0) < cost) {
            this.addMessage(`Insufficient ${resLabel} to invoke ${power.name} (needs ${cost} ${resLabel}).`, 12);
            return;
        }
        p.pw = Math.max(0, (p.pw || 0) - cost);
        if (power.heal) {
            p.hp = Math.min(p.hpMax, p.hp + power.heal);
        }
        if (power.curePoison) {
            p.poisoned = 0;
        }
        if (power.blink) {
            for (let attempt = 0; attempt < 25; attempt++) {
                const rx = 2 + this.rand(MAP_W - 4);
                const ry = 2 + this.rand(MAP_H - 4);
                const cell = this.state.map[ry] && this.state.map[ry][rx];
                if (cell && cell.feat === FEAT.FLOOR && !this.state.monsters.some(m => m.x === rx && m.y === ry)) {
                    p.x = rx;
                    p.y = ry;
                    this.updateVisibility();
                    break;
                }
            }
            this.addMessage(`You invoke ${power.name} and phase across the chamber!`, 11);
            this.advanceTurn();
            return;
        }

        const hostiles = this.state.monsters.filter(m => !m.isPet && !m.peaceful && !m.captive && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
        const chaosBonus = (this.spec && this.spec.mutatorId === 'chaos_surge' && (this.state.turn % 2 === 0)) ? 6 : 0;
        if (chaosBonus > 0) {
            p.speedBoost = Math.max(p.speedBoost || 0, 8);
        }

        // Directional / Cursor Targeting for powers
        const aim = (targetX != null && targetY != null)
            ? { x: targetX, y: targetY }
            : ((this.state.cursor && this.state.cursor.active) ? this.state.cursor : null);

        if (aim && hostiles.length > 0) {
            const targeted = hostiles.find(f => f.x === aim.x && f.y === aim.y) ||
                hostiles.slice().sort((a, b) => Math.hypot(a.x - aim.x, a.y - aim.y) - Math.hypot(b.x - aim.x, b.y - aim.y))[0];
            if (targeted && Math.hypot(targeted.x - p.x, targeted.y - p.y) <= (power.range || 8)) {
                const dmg = (power.dmg || 15) + this.rand(6) + chaosBonus;
                targeted.hp -= dmg;
                this.addMessage(`You direct ${power.name}${chaosBonus ? ' [CHAOS SURGE]' : ''} at ${targeted.race} for ${dmg} damage!`, 14);
                if (targeted.hp <= 0) this.handleMonsterKilled(targeted);
                this.advanceTurn();
                return;
            }
        }

        if (power.aoe && hostiles.length > 0) {
            const dmg = (power.dmg || 16) + this.rand(6) + chaosBonus;
            for (const foe of hostiles.slice()) {
                foe.hp -= dmg;
                if (foe.hp <= 0) this.handleMonsterKilled(foe);
            }
            this.addMessage(`You unleash ${power.name}${chaosBonus ? ' [CHAOS SURGE]' : ''}, blasting ${hostiles.length} foe(s) for ${dmg} damage!`, 14);
        } else if (power.dmg && hostiles.length > 0) {
            hostiles.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
            const target = hostiles[0];
            const dmg = (power.dmg || 15) + this.rand(6) + chaosBonus;
            target.hp -= dmg;
            this.addMessage(`You invoke ${power.name}${chaosBonus ? ' [CHAOS SURGE]' : ''} on ${target.race} for ${dmg} damage!`, 14);
            if (target.hp <= 0) this.handleMonsterKilled(target);
        } else {
            p.speedBoost = Math.max(p.speedBoost || 0, 12);
            this.addMessage(`You invoke ${power.name}! (${p.hp}/${p.hpMax} HP)`, 14);
        }
        this.advanceTurn();
    }

    prayAtAltar() {
        const p = this.state.player;
        const cell = this.state.map[p.y][p.x];
        if (cell.feat === FEAT.ALTAR && cell.deity) {
            p.deity = cell.deity;
            p.piety = Math.min(6, (p.piety || 2) + 1);
            p.hp = p.hpMax;
            p.pw = p.pwMax;
            p.poisoned = 0;
            const wep = p.inventory.find(i => i.equipped === 'weapon');
            if (wep && wep.beatitude !== 'blessed') {
                wep.beatitude = 'blessed';
                wep.bonus = (wep.bonus || 0) + 1;
            }
            p.inventory.forEach(it => { if (it.beatitude === 'cursed') it.beatitude = 'uncursed'; });
            this.addMessage(`You kneel at the glowing altar of ${cell.deity}. Your vitality and gear are sanctified! (Piety: ${'★'.repeat(p.piety)})`, 14);
        } else {
            p.hp = Math.min(p.hpMax, p.hp + 6);
            p.pw = Math.min(p.pwMax, (p.pw || 0) + 3);
            this.addMessage(`You offer a fervent prayer to ${p.deity}.`, 11);
        }
        this.advanceTurn();
    }

    interactContextualFeature() {
        const p = this.state.player;
        const cell = this.state.map[p.y][p.x];
        if (cell.feat === FEAT.ALTAR) {
            if (RyodSystems && typeof RyodSystems.interactAltar === 'function') {
                RyodSystems.interactAltar(this);
                return true;
            }
            this.prayAtAltar();
            return true;
        }
        if (cell.feat === FEAT.FOUNTAIN) {
            if (RyodSystems && typeof RyodSystems.interactFountain === 'function') {
                RyodSystems.interactFountain(this);
                return true;
            }
            p.hp = Math.min(p.hpMax, p.hp + 20);
            cell.feat = FEAT.FLOOR;
            cell.glyph = '.';
            this.addMessage('You drink the pure spring water (+20 HP). The fountain bubbles and dries to stone.', 11);
            this.advanceTurn();
            return true;
        }
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = p.x + dx, ny = p.y + dy;
                if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
                const c = this.state.map[ny][nx];
                if (c.feat === FEAT.ANVIL) {
                    if (RyodSystems) {
                        const ok = RyodSystems.smithAtAnvil(this, 0);
                        if (ok) this.advanceTurn();
                        return true;
                    }
                } else if (c.feat === FEAT.CAGE) {
                    if (RyodSystems) {
                        const ok = RyodSystems.interactCage(this);
                        if (ok) this.advanceTurn();
                        return true;
                    }
                }
            }
        }
        const pet = this.state.monsters.find(m => m.isPet);
        if (pet) {
            pet.stayClose = !pet.stayClose;
            this.addMessage(pet.stayClose ? `You signal ${pet.race} to heel close.` : `You signal ${pet.race} to hunt freely.`, 11);
            return true;
        }
        this.addMessage('Nothing here to interact with or pray at.');
        return false;
    }

    invokeDeityPower() {
        const p = this.state.player;
        if ((p.piety || 0) < 1) {
            this.addMessage(`${p.deity} ignores your plea for divine intervention.`);
            return;
        }
        p.piety = Math.max(0, (p.piety || 0) - 1);
        p.hp = Math.min(p.hpMax, p.hp + 10);
        p.speedBoost = 20;
        this.addMessage(`${p.deity} grants you righteous fury and haste!`, 14);
        this.advanceTurn();
    }

    pickupAtPlayer() {
        const p = this.state.player;
        const idx = this.state.objects.findIndex(o => o.x === p.x && o.y === p.y);
        if (idx < 0) {
            this.addMessage('There is nothing here to pick up.');
            return;
        }
        const obj = this.state.objects.splice(idx, 1)[0];
        if (obj.kind === 'gold') {
            p.gold += obj.amount || 15;
            this.addMessage(`You pick up ${obj.amount || 15} gold pieces.`, 14);
        } else if (obj.kind === 'rune') {
            p.runes = (p.runes || 0) + 1;
            this.addMessage(`You claim the ${obj.name}! (${p.runes}/3 Runes collected)`, 14);
        } else if (obj.kind === 'lumenstone') {
            p.lumenstones = (p.lumenstones || 0) + 1;
            this.addMessage(`You claim a radiant ${obj.name}! (${p.lumenstones} Lumenstones)`, 14);
        } else {
            if (obj.isGoalArtifact) {
                p.hasAmulet = true;
                if (RyodSystems && typeof RyodSystems.checkRelicClaim === 'function') {
                    RyodSystems.checkRelicClaim(this, obj);
                } else if (this.spec.victoryMode === 'three_runes' && (p.runes || 0) < 3) {
                    this.addMessage(`You seize the ${obj.name}, but you still need ${3 - (p.runes || 0)} more Abyssal Rune(s) before it awakens!`, 14);
                } else if (this.spec.victoryMode === 'boss_kill' || (this.spec.victoryMode === 'three_runes' && (p.runes || 0) >= 3)) {
                    p.winner = true;
                    this.addMessage(`Glorious Victory! You claim the ${obj.name} and triumph over ${this.state.branchName}!`, 14);
                } else {
                    const dest = this.spec.hasTown ? 'Sanctuary Town (Level 0)' : 'Level 1';
                    this.addMessage(`You seize the ${obj.name}! Now ascend to ${dest} to claim immortal victory!`, 14);
                }
            } else {
                this.addMessage(`You pick up ${formatItemDesc(obj)}.`, 11);
            }
            p.inventory.push(obj);
            this.reindexInventory();
        }
        this.advanceTurn();
    }

    moveOrAttack(dx, dy) {
        const p = this.state.player;
        const tx = p.x + dx;
        const ty = p.y + dy;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;

        const mon = this.state.monsters.find(m => m.x === tx && m.y === ty);
        if (mon) {
            if (mon.townRole === 'elder') {
                p.pw = p.pwMax;
                this.addMessage(`The Town Elder speaks: "${this.spec.elderRumor || 'Beware the guardian of the deep floor!'}"`, 14);
                this.advanceTurn();
                return;
            }
            if (mon.townRole === 'quartermaster') {
                if (p.gold >= 35) {
                    p.gold -= 35;
                    p.inventory.push({ kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 14, enchantGain: 1, count: 1, weight: 5, tval: 70, sval: 15 });
                    p.inventory.push({ kind: 'potion', name: 'potion of extra healing', glyph: '!', attr: 4, heal: 40, count: 1, weight: 10, tval: 71, sval: 35 });
                    this.reindexInventory();
                    this.addMessage('The Quartermaster trades you a Scroll of Enchanting and a Potion of Extra Healing for 35 gold!', 14);
                } else if (p.gold >= 20) {
                    p.gold -= 20;
                    p.inventory.push({ kind: 'potion', name: 'potion of extra healing', glyph: '!', attr: 4, heal: 40, count: 1, weight: 10, tval: 71, sval: 35 });
                    p.inventory.push({ kind: 'food', name: 'iron ration', glyph: ':', attr: 3, nutrition: 900, count: 1, weight: 20, tval: 80, sval: 1 });
                    this.reindexInventory();
                    this.addMessage('The Quartermaster trades you a Potion of Extra Healing and an Iron Ration for 20 gold!', 14);
                } else {
                    p.hp = p.hpMax;
                    this.addMessage('The Quartermaster bandages your wounds free of charge. (Bring 20g for supplies or 35g for an Enchant Scroll!)', 11);
                }
                this.advanceTurn();
                return;
            }
            if (mon.captive) {
                mon.captive = false;
                mon.isPet = true;
                mon.peaceful = true;
                mon.race = mon.allyBaseName || mon.race.replace(/^chained\s+/i, '');
                this.addMessage(`You shatter the chains! The ${mon.race} pledges loyalty and fights at your side!`, 10);
                this.advanceTurn();
                return;
            }
            if (mon.isPet || mon.peaceful) {
                mon.x = p.x;
                mon.y = p.y;
                p.x = tx;
                p.y = ty;
                this.addMessage(`You swap places with your ${mon.race}.`);
                this.updateVisibility();
                this.advanceTurn();
                return;
            }
            const strBonus = Math.max(0, Math.floor((p.str - 12) / 2));
            const wep = p.inventory.find(i => i.equipped === 'weapon');
            const wepBonus = wep ? (wep.bonus || 1) * 2 : 0;
            let baseRoll = 4 + this.rand(6);
            if (wep && wep.dmg) {
                const dm = String(wep.dmg).match(/(\d+)d(\d+)/i);
                if (dm) {
                    const nd = parseInt(dm[1], 10) || 1;
                    const sd = parseInt(dm[2], 10) || 6;
                    baseRoll = 0;
                    for (let d = 0; d < nd; d++) baseRoll += 1 + this.rand(sd);
                }
            }
            const mutMult = (this.spec && this.spec.mutatorId === 'blood_moon') ? 1.35 : ((this.spec && this.spec.mutatorId === 'stygian_fog') ? 1.30 : 1.0);
            const rawDmg = Math.max(2, Math.round((baseRoll + strBonus + wepBonus) * mutMult));

            // AC vs DEX/Level/toHit hit roll
            const dexBonus = p.dex ? Math.floor((p.dex - 10) / 2) : 0;
            const toHitBonus = (wep ? (wep.toHit || wep.bonus || 0) : 0) + (p.level || 1);
            const d20Attack = 1 + this.rand(20);
            const hitRoll = 10 + dexBonus + toHitBonus + d20Attack;
            const targetAC = mon.ac != null ? mon.ac : 8;

            let hitQuality = 'hit';
            let dmg = rawDmg;

            if (d20Attack === 20 || hitRoll >= targetAC + 10) {
                hitQuality = 'crit';
                dmg = Math.max(2, Math.round(rawDmg * 1.75));
            } else if (hitRoll >= targetAC) {
                hitQuality = 'hit';
                dmg = Math.max(1, rawDmg);
            } else if (hitRoll >= targetAC - 4) {
                hitQuality = 'graze';
                dmg = Math.max(1, Math.round(rawDmg * 0.5));
            } else {
                hitQuality = 'miss';
                dmg = 0;
            }

            if (hitQuality === 'miss') {
                this.addMessage(`Your swing at the ${mon.race} is deflected by armor! (AC ${targetAC})`, 7);
                this.advanceTurn();
                return;
            }

            // Elemental weapon brands & Hydra cauterization
            const isFlameWep = wep && (wep.brand === 'flame' || /flam|fire/i.test(wep.name || ''));
            const isFrostWep = wep && (wep.brand === 'frost' || /frost|ice|cold/i.test(wep.name || ''));
            const isVenomWep = wep && (wep.brand === 'venom' || /venom|poison/i.test(wep.name || ''));
            const isLightningWep = wep && (wep.brand === 'lightning' || /lightning|storm|shock/i.test(wep.name || ''));

            if (isFlameWep) dmg += 3;
            else if (isFrostWep) dmg += 2;
            else if (isVenomWep) dmg += 2;
            else if (isLightningWep) dmg += 3;

            mon.hp -= dmg;
            if (hitQuality === 'crit') {
                this.addMessage(`CRITICAL HIT! You strike the ${mon.race} for ${dmg} damage!`, 14);
            } else if (hitQuality === 'graze') {
                this.addMessage(`Glancing blow! You graze the ${mon.race} for ${dmg} damage.`, 8);
            } else {
                this.addMessage(`You strike the ${mon.race} with your ${p.weaponName}! (${dmg} dmg)`, 11);
            }

            if (mon.hp <= 0) {
                this.handleMonsterKilled(mon);
                this.advanceTurn();
                return;
            }
            const mLower = String(mon.race || '').toLowerCase();
            if (mLower.includes('hydra')) {
                if (isFlameWep) {
                    this.addMessage(`The fire of your ${wep.name} cauterizes the wound! No heads regrow!`, 14);
                } else if (wep && /sword|axe|blade|dagger|halberd/i.test(wep.name || '')) {
                    mon.hp = Math.min((mon.hp_max || 30) + 12, mon.hp + 6);
                    mon.dmg = (mon.dmg || 8) + 2;
                    this.addMessage(`Your edged ${wep.name} severs a head — two more grow back in its place!`, 12);
                }
            } else if (mLower.includes('jelly') && mon.hp > 6 && this.state.monsters.length < 18) {
                const half = Math.max(3, Math.floor(mon.hp / 2));
                mon.hp = half;
                const maxId = this.state.monsters.reduce((acc, m) => Math.max(acc, m.id || 0), 0);
                this.state.monsters.push({ ...mon, id: maxId + 1, hp: half, hp_max: half, x: Math.min(MAP_W - 2, mon.x + 1) });
                this.addMessage(`The ${mon.race} splits in two under your blow!`, 11);
            }
            this.advanceTurn();
            return;
        }

        const cell = this.state.map[ty][tx];
        if (cell.feat === FEAT.CLOSED_DOOR) {
            cell.feat = FEAT.OPEN_DOOR;
            cell.glyph = "'";
            this.addMessage('You open the door.');
            this.updateVisibility();
            this.advanceTurn();
            return;
        }
        const canFlyOverChasm = cell.feat === FEAT.CHASM && (p.levitating || p.avatarId === 'beholder' || p.avatarId === 'dragon' || p.activeStance === 'suzaku');
        if (!isWalkableFeat(cell.feat) && !canFlyOverChasm) {
            if (cell.feat === FEAT.CHASM) {
                this.addMessage('A bottomless chasm yawns before you! (You need levitation or wings to cross).');
            } else {
                this.addMessage('Solid stone blocks your way.');
            }
            return;
        }

        p.x = tx;
        p.y = ty;
        if (cell.feat === FEAT.CHASM && canFlyOverChasm) {
            this.addMessage('You glide gracefully above the bottomless chasm.', 11);
        }
        const floorObj = this.state.objects.find(o => o.x === tx && o.y === ty);
        if (floorObj) {
            this.addMessage(`You see here ${formatItemDesc(floorObj)}. (Press [g] or [,] to pick up)`, 14);
        }
        if (cell.feat === FEAT.ALTAR && cell.deity) {
            this.addMessage(`There is a glowing altar of ${cell.deity} here. (Press [p] to pray)`, 14);
        }
        this.updateVisibility();
        this.advanceTurn();
    }

    handleMonsterKilled(mon) {
        const p = this.state.player;
        this.state.monsters = this.state.monsters.filter(m => m.id !== mon.id);
        if (this.spec && this.spec.mutatorId === 'blood_moon') {
            p.hp = Math.min(p.hpMax, p.hp + 4);
            p.pw = Math.min(p.pwMax, (p.pw || 0) + 1);
        }
        const scoreMult = this.state.scoreMultiplier || 1.0;
        if (this.usesExpLevels()) {
            const rawXp = mon.exp !== undefined ? mon.exp : 10;
            const xpGain = Math.round(rawXp * scoreMult);
            p.exp += xpGain;
            this.addMessage(`You slay ${mon.isBoss ? '' : 'the '}${mon.race}! (+${xpGain} XP)`, 10);
            this.checkExperience();
        } else {
            this.addMessage(`You slay ${mon.isBoss ? '' : 'the '}${mon.race}!`, 10);
        }
        if (mon.isBoss) {
            this.state.slainActBosses = this.state.slainActBosses || {};
            this.state.slainActBosses[this.state.depth] = true;
            this.state.objects.push({
                kind: 'scroll',
                name: 'scroll of enchanting',
                glyph: '?',
                attr: 14,
                enchantGain: 1,
                x: mon.x,
                y: mon.y,
                count: 1,
                weight: 5,
                tval: 70,
                sval: 15
            });
            // Guaranteed Act Boss Relic drop
            const actNum = mon.actNumber || Math.min(5, Math.max(1, Math.ceil(this.state.depth / 3)));
            const relic = Array.isArray(this.spec.items) ? this.spec.items.find(it => it.isRelic && it.actRelic === actNum) : null;
            if (relic) {
                this.state.objects.push({
                    ...relic,
                    x: Math.min(MAP_W - 2, mon.x + 1),
                    y: mon.y,
                    count: 1
                });
                this.addMessage(`The defeated boss drops its legendary relic: ${relic.name}!`, 14);
            }
            if (mon.isNemesis) {
                if (this.spec.victoryMode === 'boss_kill' || (this.spec.victoryMode === 'three_runes' && (p.runes || 0) >= 3)) {
                    p.hasAmulet = true;
                    p.winner = true;
                    this.addMessage(`GLORIOUS VICTORY! You have vanquished ${mon.race} and reclaimed the ${this.spec.goalItemName || 'Quest Artifact'}!`, 14);
                } else {
                    this.addMessage(`You have vanquished ${mon.race}! Claim the ${this.spec.goalItemName} and ascend to the surface!`, 14);
                }
            } else {
                this.addMessage(`[ACT MILESTONE] ${mon.race} has fallen! A Scroll of Enchanting glimmers on the stones.`, 14);
            }
        }
    }

    advanceTurn() {
        const p = this.state.player;
        this.state.turn++;
        if (p.speedBoost > 0) p.speedBoost--;
        if (p.nutrition > 0 && !p.godMode && !this.spec.godMode) p.nutrition--;
        if (p.godMode || this.spec.godMode) {
            p.pw = p.pwMax;
        }
        if (this.spec && this.spec.mutatorId === 'cataclysm' && this.state.depth > 0 && this.state.turn % 18 === 0) {
            this.state.objects.push({ kind: 'gold', name: 'tremor-shaken gold cache', glyph: '$', attr: 14, amount: 25, x: p.x, y: p.y, count: 1 });
            this.addMessage('[CATACLYSM] Seismic tremors shake the ceiling, dislodging a cache of gold!', 14);
        }

        // Periodic wandering monster spawn (skip in Town Depth 0)
        if (this.state.depth > 0 && this.state.turn % 35 === 0) {
            const hostiles = this.state.monsters.filter(m => !m.isPet && !m.peaceful && !m.captive);
            if (hostiles.length < 8 && Array.isArray(this.spec.monsters) && this.spec.monsters.length > 0) {
                const depth = this.state.depth || 1;
                const eligibleMons = this.spec.monsters.filter(m => (m.minDepth || 1) <= depth + 1 && !m.isBoss);
                const template = eligibleMons[this.rand(eligibleMons.length)] || this.spec.monsters[0];
                for (let attempt = 0; attempt < 25; attempt++) {
                    const rx = 2 + this.rand(MAP_W - 4);
                    const ry = 2 + this.rand(MAP_H - 4);
                    const cell = this.state.map[ry] && this.state.map[ry][rx];
                    if (cell && cell.feat === FEAT.FLOOR && !cell.inView && !(rx === p.x && ry === p.y) && !this.state.monsters.some(m => m.x === rx && m.y === ry)) {
                        const maxId = this.state.monsters.reduce((acc, m) => Math.max(acc, m.id || 0), 0);
                        this.state.monsters.push({
                            id: maxId + 1,
                            race: template.name,
                            glyph: template.glyph,
                            attr: template.attr || 12,
                            x: rx,
                            y: ry,
                            hp: template.hp,
                            hp_max: template.hp,
                            ac: template.ac != null ? template.ac : 8,
                            dmg: template.dmg || 4,
                            exp: template.exp !== undefined ? template.exp : 10,
                            speed: template.speed || 110,
                            lore: template.lore || '',
                            isPet: false,
                            peaceful: false,
                            captive: false
                        });
                        break;
                    }
                }
            }
        }

        for (const mon of this.state.monsters.slice()) {
            if (mon.captive || mon.townRole || mon.hp <= 0) continue;

            // Speed energy accumulator: +10 speed (110) gets extra turns, -10 speed (90) skips turns
            const speedStep = mon.speed || 100;
            mon.energy = (mon.energy || 0) + speedStep;
            if (mon.energy < 100) continue;
            mon.energy = Math.min(200, mon.energy - 100);

            if (mon.isPet) {
                const adjFoe = this.state.monsters.find(f => !f.isPet && !f.peaceful && f.hp > 0 && Math.hypot(f.x - mon.x, f.y - mon.y) <= 1.5);
                if (adjFoe) {
                    const d = 3 + this.rand(5);
                    adjFoe.hp -= d;
                    if (adjFoe.hp <= 0) {
                        this.handleMonsterKilled(adjFoe);
                    } else {
                        this.addMessage(`Your loyal ${mon.race} strikes the ${adjFoe.race}! (${d} dmg)`, 10);
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
                        if (typeof this.updateVisibility === 'function') {
                            this.updateVisibility();
                        }
                    }
                }
                continue;
            }

            const mLower = String(mon.race || '').toLowerCase();
            const dist = Math.hypot(p.x - mon.x, p.y - mon.y);
            const inView = Boolean(this.state.map[mon.y] && this.state.map[mon.y][mon.x] && this.state.map[mon.y][mon.x].inView);
            const isProperName = Boolean(mon.isBoss || /^[A-Z]/.test(mon.race || ''));
            const subjName = isProperName ? mon.race : `The ${mon.race}`;
            const killerArticle = isProperName ? mon.race : (/^[aeiou]/i.test(mon.race || '') ? `an ${mon.race}` : `a ${mon.race}`);

            const aiBehavior = mon.aiBehavior || (
                /archer|bowman|ranger|hunter|skeleton archer|sniper/i.test(mLower) ? 'archer_kite' :
                /mage|wizard|warlock|sorcerer|shade|caster|lich|priest/i.test(mLower) ? 'bolt_caster' :
                /dragon|drake|wyrm|chimera|hellhound/i.test(mLower) ? 'telegraphed_cone_breath' :
                /summoner|overseer|queen|hive|caller|necromancer/i.test(mLower) ? 'summoner' :
                /charger|knight|centaur|bull|minotaur|paladin/i.test(mLower) ? 'shield_charger' :
                'melee'
            );

            // AI 1: Telegraphed Cone Breath
            if (aiBehavior === 'telegraphed_cone_breath') {
                if (mon.telegraph) {
                    mon.telegraph = null;
                    if (dist <= 5 && inView) {
                        const bDmg = Math.max(3, Math.round((mon.dmg || 10) * 1.5));
                        p.hp -= bDmg;
                        if (p.godMode || this.spec.godMode) p.hp = Math.max(1, p.hp);
                        this.addMessage(`🔥 ${subjName} breathes a searing cone of fire directly at you! (-${bDmg} HP)`, 4);
                        if (p.hp <= 0) {
                            p.hp = 0; p.dead = true; p.diedFrom = killerArticle;
                            this.addMessage(`You die... Killed by ${p.diedFrom} on ${this.state.branchName} ${this.state.depth}.`, 4);
                            return;
                        }
                        continue;
                    }
                } else if (dist >= 2 && dist <= 5 && inView && this.rand(100) < 50) {
                    mon.telegraph = { x: p.x, y: p.y };
                    this.addMessage(`⚠️ ${subjName} inhales deeply, aiming a cone of fire at your position!`, 14);
                    continue;
                }
            }

            // AI 2: Shield Charger
            if (aiBehavior === 'shield_charger' && dist >= 2 && dist <= 4 && inView) {
                const dx = p.x - mon.x;
                const dy = p.y - mon.y;
                if ((dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) && this.rand(100) < 65) {
                    const stepX = Math.sign(dx);
                    const stepY = Math.sign(dy);
                    let clear = true;
                    let cx = mon.x + stepX;
                    let cy = mon.y + stepY;
                    while (!(cx === p.x && cy === p.y)) {
                        if (!this.state.map[cy] || !this.state.map[cy][cx] || !isWalkableFeat(this.state.map[cy][cx].feat) || this.state.monsters.some(m => m.x === cx && m.y === cy)) {
                            clear = false; break;
                        }
                        cx += stepX; cy += stepY;
                    }
                    if (clear) {
                        mon.x = p.x - stepX;
                        mon.y = p.y - stepY;
                        const sDmg = Math.max(2, (mon.dmg || 6) + 3);
                        p.hp -= sDmg;
                        if (p.godMode || this.spec.godMode) p.hp = Math.max(1, p.hp);
                        this.addMessage(`💥 ${subjName} charges across the hall and slams into you! (-${sDmg} HP)`, 12);
                        if (p.hp <= 0) {
                            p.hp = 0; p.dead = true; p.diedFrom = killerArticle;
                            this.addMessage(`You die... Killed by ${p.diedFrom} on ${this.state.branchName} ${this.state.depth}.`, 4);
                            return;
                        }
                        continue;
                    }
                }
            }

            // AI 3: Summoner
            if (aiBehavior === 'summoner' && dist >= 3 && dist <= 7 && inView && this.rand(100) < 35 && this.state.monsters.length < 18) {
                const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [ox, oy] of offsets) {
                    const sx = mon.x + ox, sy = mon.y + oy;
                    if (this.state.map[sy] && this.state.map[sy][sx] && isWalkableFeat(this.state.map[sy][sx].feat) && !this.state.monsters.some(m => m.x === sx && m.y === sy)) {
                        const maxId = this.state.monsters.reduce((acc, m) => Math.max(acc, m.id || 0), 0);
                        this.state.monsters.push({
                            id: maxId + 1,
                            race: `${mon.race} minion`,
                            glyph: 'm',
                            attr: 13,
                            x: sx, y: sy,
                            hp: Math.max(6, Math.floor((mon.hp_max || 20) / 3)),
                            hp_max: Math.max(6, Math.floor((mon.hp_max || 20) / 3)),
                            ac: 6, dmg: 4, exp: 15, speed: 105,
                            isPet: false, peaceful: false, captive: false
                        });
                        this.addMessage(`${subjName} chants an invocation and summons a minion!`, 13);
                        break;
                    }
                }
                continue;
            }

            // AI 4: Archer Kite
            if (aiBehavior === 'archer_kite') {
                if (dist <= 2.2) {
                    const rx = mon.x - Math.sign(p.x - mon.x);
                    const ry = mon.y - Math.sign(p.y - mon.y);
                    if (this.state.map[ry] && this.state.map[ry][rx] && isWalkableFeat(this.state.map[ry][rx].feat) && !this.state.monsters.some(m => m.x === rx && m.y === ry)) {
                        mon.x = rx; mon.y = ry;
                    }
                }
                if (dist <= 6 && inView && this.rand(100) < 80) {
                    const arrowDmg = Math.max(1, (mon.dmg || 4) - 1);
                    p.hp -= arrowDmg;
                    if (p.godMode || this.spec.godMode) p.hp = Math.max(1, p.hp);
                    this.addMessage(`${subjName} looses an arrow at you! (-${arrowDmg} HP)`, 11);
                    if (p.hp <= 0) {
                        p.hp = 0; p.dead = true; p.diedFrom = killerArticle;
                        this.addMessage(`You die... Killed by ${p.diedFrom} on ${this.state.branchName} ${this.state.depth}.`, 4);
                        return;
                    }
                    continue;
                }
            }

            // AI 5: Bolt Caster
            if (aiBehavior === 'bolt_caster' && dist >= 2 && dist <= 7 && inView && this.rand(100) < 70) {
                const boltDmg = Math.max(2, (mon.dmg || 6) + 1);
                p.hp -= boltDmg;
                if (p.godMode || this.spec.godMode) p.hp = Math.max(1, p.hp);
                this.addMessage(`${subjName} hurls a shimmering magical bolt at you! (-${boltDmg} HP)`, 13);
                if (p.hp <= 0) {
                    p.hp = 0; p.dead = true; p.diedFrom = killerArticle;
                    this.addMessage(`You die... Killed by ${p.diedFrom} on ${this.state.branchName} ${this.state.depth}.`, 4);
                    return;
                }
                continue;
            }

            // Standard Melee Attack when adjacent
            if (dist <= 1.5) {
                const wornBody = p.inventory.find(it => it.equipped === 'body' || it.equipped === 'armor');
                if ((mLower.includes('aquator') || mLower.includes('acid') || mLower.includes('rust')) && wornBody && !/leather|robe|cloak/i.test(wornBody.name || '')) {
                    wornBody.bonus = Math.max(-3, (wornBody.bonus || 0) - 1);
                    this.recalcPlayerDefenses();
                    this.addMessage(`The ${mon.race}'s corrosive touch rusts your ${wornBody.name}!`, 12);
                    if (mLower.includes('aquator')) continue;
                }
                if (mLower.includes('leprechaun') && p.gold > 0) {
                    const stolen = Math.min(p.gold, 5 + this.rand(25));
                    p.gold -= stolen;
                    this.state.monsters = this.state.monsters.filter(m => m.id !== mon.id);
                    this.addMessage(`The ${mon.race} snatches ${stolen} gold pieces from your purse and vanishes in a flash!`, 14);
                    continue;
                }
                if (mLower.includes('nymph')) {
                    const packItem = p.inventory.find(it => !it.equipped && it.kind !== 'food');
                    if (packItem) {
                        packItem.count = (packItem.count || 1) - 1;
                        this.reindexInventory();
                        this.state.monsters = this.state.monsters.filter(m => m.id !== mon.id);
                        this.addMessage(`The ${mon.race} charms you, steals your ${packItem.name}, and teleports away!`, 13);
                        continue;
                    }
                }
                const acMitigation = this.realm === 'rogue' ? Math.max(0, Math.floor((10 - (p.ac ?? 7)) / 3)) : Math.max(0, Math.floor((p.ac || 2) / 4));
                const dmg = Math.max(1, (mon.dmg || 4) - acMitigation - this.rand(2));
                p.hp -= dmg;
                if (p.godMode || this.spec.godMode) {
                    p.hp = Math.max(1, p.hp);
                }
                this.addMessage(`${subjName} hits you! (-${dmg} HP)`, 4);
                if (p.hp <= 0) {
                    p.hp = 0;
                    p.dead = true;
                    p.diedFrom = killerArticle;
                    if (this.ironman || process.env.ANGBAND3D_IRONMAN === '1' || (this.state && this.state.ironman)) {
                        try { if (fs.existsSync(this.saveFile + '.living.sav')) fs.unlinkSync(this.saveFile + '.living.sav'); } catch (_) {}
                        try { if (fs.existsSync(this.saveFile)) fs.unlinkSync(this.saveFile); } catch (_) {}
                    }
                    this.addMessage(`You die... Killed by ${p.diedFrom} on ${this.state.branchName} ${this.state.depth}.`, 4);
                    return;
                }
            } else if (dist <= 7 && inView) {
                const nx = mon.x + Math.sign(p.x - mon.x);
                const ny = mon.y + Math.sign(p.y - mon.y);
                if (this.state.map[ny] && this.state.map[ny][nx] && isWalkableFeat(this.state.map[ny][nx].feat) && !this.state.monsters.some(m => m.x === nx && m.y === ny) && !(nx === p.x && ny === p.y)) {
                    mon.x = nx; mon.y = ny;
                }
            }
        }

        if (p.activeSong && p.pw > 0) {
            p.pw--;
            if (p.pw <= 0) {
                this.addMessage(`Your concentration breaks as your mana drains empty. The Song of ${p.activeSong} ends.`, 12);
                p.activeSong = null;
            }
        }
        if (RyodSystems && typeof RyodSystems.tickActiveHazards === 'function') {
            RyodSystems.tickActiveHazards(this);
        }
        if (RyodSystems && typeof RyodSystems.checkAvatarScaleEvolution === 'function') {
            RyodSystems.checkAvatarScaleEvolution(this);
        }
    }

    buildTombstoneRows() {
        const p = this.state.player;
        const pad80 = (s) => String(s || '').slice(0, TERM_W).padEnd(TERM_W, ' ');
        const center = (s, w = 28) => {
            const clean = String(s || '').slice(0, w);
            const left = Math.floor((w - clean.length) / 2);
            return clean.padStart(left + clean.length, ' ').padEnd(w, ' ');
        };
        const lines = [
            `          _______`,
            `         /       \\`,
            `        /  R I P  \\`,
            `       /           \\`,
            `      |${center(p.name, 13)}|`,
            `      |${center(p.race + ' ' + p.class, 13)}|`,
            `      |   killed    |`,
            `      |     by      |`,
            `      |${center(p.diedFrom || 'peril', 13)}|`,
            `      |${center(this.state.branchName + ' ' + this.state.depth, 13)}|`,
            `      |    2026     |`,
            `     *|*  *  *  *  *|*`,
            `   _____________________`
        ];
        const rows = [];
        rows.push({ g: pad80(`${this.spec.title} — Memorial Epitaph (YASD 3D • Yendor Engine)`), a: '0e'.repeat(TERM_W) });
        rows.push({ g: pad80(''), a: '01'.repeat(TERM_W) });
        for (const l of lines) {
            rows.push({ g: pad80('                  ' + l), a: '01'.repeat(TERM_W) });
        }
        rows.push({ g: pad80(''), a: '01'.repeat(TERM_W) });
        rows.push({ g: pad80(`  Final Score & Ledger: Gold ${p.gold} • Turns ${this.state.turn} • Deepest Level ${this.state.maxDepth}`), a: '0b'.repeat(TERM_W) });
        rows.push({ g: pad80(`  Press [R] to Restore Last Living Checkpoint Save, or [N] to Roll a New Hero.`), a: '0e'.repeat(TERM_W) });
        while (rows.length < TERM_H) rows.push({ g: pad80(''), a: '01'.repeat(TERM_W) });
        return rows;
    }

    buildTerminalRows() {
        const pad80 = (s) => String(s || '').slice(0, TERM_W).padEnd(TERM_W, ' ');
        const attr80 = (hex2 = '01') => hex2.repeat(TERM_W);
        const p = this.state.player;

        if (p.dead) {
            return this.buildTombstoneRows();
        }

        if (this.state.phase === 'setup') {
            const rows = [];
            rows.push({ g: pad80(`${this.spec.title} — Choose Your Adventurer (Enter/* = Quick Start)`), a: attr80('0e') });
            rows.push({ g: pad80('=============================================================================='), a: attr80('02') });
            this.spec.roles.forEach((r, idx) => {
                const sel = idx === this.state.selectedRoleIdx ? '>' : ' ';
                rows.push({
                    g: pad80(` ${sel} ${r.key}) ${r.id.padEnd(18, ' ')} (${r.race}) — Gear: ${r.weapon ? r.weapon.name : 'blade'} & ${r.armor ? r.armor.name : 'tunic'}`),
                    a: attr80(idx === this.state.selectedRoleIdx ? '0e' : '01')
                });
            });
            rows.push({ g: pad80(''), a: attr80('01') });
            // # ROOT-CAUSE: Cartridge birth screen needed visible post-randomization stat focus & kit boon controls and distinct skill training rows
            rows.push({ g: pad80(`  [1/f] Stat Focus: ${(this.state.statFocus || 'optimal').toUpperCase().padEnd(10, ' ')} [2/b] Kit Boon: ${(this.state.kitBoon || 'signature').toUpperCase()}`), a: attr80('0a') });
            rows.push({ g: pad80('  [*] Quick Start (Randomize & Auto-Optimize) or [Enter] Embark with Selection'), a: attr80('0b') });
            while (rows.length < TERM_H) rows.push({ g: pad80(''), a: attr80('01') });
            return rows;
        }

        if (this.state.menuMode === 'inven' || this.state.menuMode === 'equip' || this.state.menuMode === 'verb' || this.state.menuMode === 'item_action') {
            const rows = [];
            const isEq = this.state.menuMode === 'equip';
            const list = isEq ? p.inventory.filter(it => Boolean(it.equipped)) : p.inventory;
            const hdr = (this.state.menuMode === 'verb' || this.state.menuMode === 'item_action')
                ? (this.state.pendingPrompt || 'Select an item: [a-z or ESC]')
                : (isEq ? `Equipped Gear (${list.length} worn — press [/] for Pack or [ESC])` : `Inventory Pack (${list.length} items — press [/] for Gear or [ESC])`);
            rows.push({ g: pad80(hdr), a: attr80('0e') });
            for (let i = 0; i < Math.min(20, list.length); i++) {
                const it = list[i];
                rows.push({ g: pad80(`  ${it.letter}) ${formatItemDesc(it)}`), a: attr80('01') });
            }
            while (rows.length < TERM_H) rows.push({ g: pad80(''), a: attr80('01') });
            return rows;
        }

        if (this.state.menuMode === 'char' || this.state.menuMode === 'help' || this.state.menuMode === 'knowledge' || this.state.menuMode === 'skills' || this.state.menuMode === 'spells' || this.state.menuMode === 'power_select') {
            const rows = [];
            rows.push({ g: pad80(this.state.pendingPrompt || 'Character Overview (Press ESC or Space to return)'), a: attr80('0e') });
            rows.push({ g: pad80('=============================================================================='), a: attr80('02') });
            if (this.state.menuMode === 'char') {
                rows.push({ g: pad80(`  Name:  ${p.name.padEnd(22, ' ')} Race:  ${p.race}`), a: attr80('01') });
                if (this.usesExpLevels()) {
                    const xpNextStr = p.expNext > 0 ? `${p.exp}/${p.expNext}` : `${p.exp} (MAX)`;
                    rows.push({ g: pad80(`  Class: ${p.class.padEnd(22, ' ')} Level: ${p.level} (XP: ${xpNextStr})`), a: attr80('01') });
                } else {
                    rows.push({ g: pad80(`  Class: ${p.class.padEnd(22, ' ')} Strength: ${p.str}  Enchantments: +${p.enchantments || 0}`), a: attr80('01') });
                }
                rows.push({ g: pad80(`  Place: ${this.state.branchName} ${this.state.depth} (Deepest: ${this.state.maxDepth})   Turn:  ${this.state.turn}`), a: attr80('01') });
                rows.push({ g: pad80(`  STR: ${p.str}   DEX: ${p.dex}   INT: ${p.int}   WIS: ${p.wis}   CON: ${p.con}   AC: ${p.ac}`), a: attr80('0b') });
                rows.push({ g: pad80(`  HP:  ${p.hp}/${p.hpMax}   Power/MP: ${p.pw}/${p.pwMax}   Gold: ${p.gold}`), a: attr80('0a') });
                if (this.realm === 'dcss') rows.push({ g: pad80(`  Deity: ${p.deity} (Piety: ${'★'.repeat(Math.max(0, p.piety || 0))})   Runes: ${p.runes || 0}/3`), a: attr80('0e') });
                if (this.realm === 'brogue') rows.push({ g: pad80(`  Enchantments: +${p.enchantments || 0}   Lumenstones: ${p.lumenstones || 0}`), a: attr80('0e') });
                if (this.realm === 'ryod') rows.push({ g: pad80(`  World: ${this.spec.ryodHash || 'RYOD'} • Mutator: ${this.spec.mutatorId || 'balanced'} • Goal: ${this.spec.goalItemName || 'Relic'} (D:${this.spec.goalDepth || 15})`), a: attr80('0e') });
            } else if (this.state.menuMode === 'skills') {
                const sk = this.state.skills || { fighting: 2, dodging: 1, evocations: 1, invocations: 1 };
                const focus = this.state.skillFocus || 'fighting';
                rows.push({ g: pad80(`  a) Fighting & Melee Mastery       Lv ${(sk.fighting || 2) + Math.max(0, p.level - 1)}   ${focus === 'fighting' ? '[FOCUSED +]' : '(Active)'}`), a: attr80(focus === 'fighting' ? '0e' : '01') });
                rows.push({ g: pad80(`  b) Dodging & Armour Defense       Lv ${(sk.dodging || 1) + Math.max(0, p.level - 1)}   ${focus === 'dodging' ? '[FOCUSED +]' : '(Active)'}`), a: attr80(focus === 'dodging' ? '0e' : '01') });
                rows.push({ g: pad80(`  c) Arcane Evocations & Wands      Lv ${(sk.evocations || 1) + Math.floor(Math.max(0, p.level - 1) / 2)}   ${focus === 'evocations' ? '[FOCUSED +]' : '(Active)'}`), a: attr80(focus === 'evocations' ? '0e' : '01') });
                rows.push({ g: pad80(`  d) Invocations (${p.deity || 'Pantheon'})       Lv ${(sk.invocations || 1)} (Piety ${p.piety || 1}/6) ${focus === 'invocations' ? '[FOCUSED +]' : '(Active)'}`), a: attr80(focus === 'invocations' ? '0e' : '01') });
                rows.push({ g: pad80(''), a: attr80('01') });
                rows.push({ g: pad80('  Press [a-d] or [1-4] to focus/train a skill, [M] for Spells/Powers, or [ESC].'), a: attr80('0b') });
            } else if (this.state.menuMode === 'spells' || this.state.menuMode === 'power_select') {
                const avail = this.getAvailablePowers();
                if (avail.length > 0) {
                    const resLbl = this.spec.resourceLabel || 'MP';
                    avail.forEach((pw, idx) => {
                        const letter = String.fromCharCode(97 + idx);
                        rows.push({ g: pad80(`  ${idx + 1}/${letter}) ${pw.name.padEnd(28, ' ')} Cost: ${pw.cost} ${resLbl} — ${pw.desc || ''}`), a: attr80('0e') });
                    });
                    rows.push({ g: pad80(''), a: attr80('01') });
                    rows.push({ g: pad80('  Press [1-4] or [a-d] to invoke a power, [i] to use an inventory item, or [ESC].'), a: attr80('0b') });
                } else {
                    rows.push({ g: pad80(`  a) Fighting & Melee Mastery       Lv ${p.level + 2}   (Active)`), a: attr80('01') });
                    rows.push({ g: pad80(`  b) Dodging & Armour Defense       Lv ${p.level + 1}   (Active)`), a: attr80('01') });
                    rows.push({ g: pad80(`  c) Arcane Evocations & Wands      Lv ${p.level}     (Active)`), a: attr80('01') });
                    if (this.realm === 'dcss') rows.push({ g: pad80(`  d) Invocations (${p.deity})       Piety ${p.piety || 1}/6`), a: attr80('0e') });
                }
            } else if (this.state.menuMode === 'knowledge') {
                rows.push({ g: pad80(`  Discovered Items (${p.inventory.length} in pack) • Branch: ${this.state.branchName} ${this.state.depth}`), a: attr80('0b') });
                p.inventory.slice(0, 14).forEach((it) => {
                    rows.push({ g: pad80(`    ${it.letter}) ${formatItemDesc(it)}`), a: attr80('01') });
                });
            } else {
                rows.push({ g: pad80(`  === ${(this.spec.title || this.realm).toUpperCase()} — IN-GAME COMMAND & SURVIVAL HELP ===`), a: attr80('0b') });
                rows.push({ g: pad80(`  Goal: ${this.spec.lore || 'Descend, survive, and claim the realm artifact.'}`), a: attr80('0e') });
                rows.push({ g: pad80('  Movement: Arrow Keys / WASD / Vi-keys (hjklyubn) / Click Minimap'), a: attr80('01') });
                rows.push({ g: pad80('  [i] Inventory   [e] Equipment   [g/,] Pick Up   [>/<] Stairs'), a: attr80('01') });
                rows.push({ g: pad80('  [q] Quaff       [r] Read        [w/W] Equip     [T] Take Off'), a: attr80('01') });
                rows.push({ g: pad80('  [f/t] Fire/Throw [m/M] Powers   [o/c] Door      [s/.] Search/Rest'), a: attr80('01') });
                rows.push({ g: pad80('  [C/@] Character [~/\\] Knowledge  [I/x] Examine  [d] Drop Item'), a: attr80('01') });
                if (this.realm === 'dcss') {
                    rows.push({ g: pad80('  --- DCSS SPECIFIC COMMANDS & PANTHEON ---'), a: attr80('0b') });
                    rows.push({ g: pad80('  [m] Skill Training Menu    [M] Spell Library   [a] Invoke Deity Power'), a: attr80('0e') });
                    rows.push({ g: pad80('  [o] Auto-Explore Floor     [5] Rest to Full    [Tab] Auto-Fight'), a: attr80('01') });
                    rows.push({ g: pad80('  Branches: D:1-3 -> Temple(D:4) -> Lair(5-7) -> Orc(8-9) -> Vaults -> Zot:15'), a: attr80('0a') });
                    rows.push({ g: pad80('  Tip: Collect 3 Runes of Zot, worship at Altars (_), and claim the Orb of Zot!'), a: attr80('01') });
                } else if (this.realm === 'brogue') {
                    rows.push({ g: pad80('  --- BROGUE SPECIFIC COMMANDS & CAVERN RULES ---'), a: attr80('0b') });
                    rows.push({ g: pad80('  [e] Auto-Explore Cavern    [z] Rest Until Healed  [a] Apply Any Item'), a: attr80('0e') });
                    rows.push({ g: pad80('  Progression: Zero XP grind! Power comes from Potions of Strength & Life'), a: attr80('0a') });
                    rows.push({ g: pad80('  and Scrolls of Enchantment. Free chained Allies (m, O, d, N) to fight with you!'), a: attr80('01') });
                    rows.push({ g: pad80('  Goal: Retrieve the Amulet of Yendor on D:26 (plus Lumenstones for mastery).'), a: attr80('01') });
                } else if (this.realm === 'rogue') {
                    rows.push({ g: pad80('  --- CLASSIC 1980 ROGUE 5.4 SURVIVAL RULES ---'), a: attr80('0b') });
                    rows.push({ g: pad80('  [e] Eat Food Ration  [s] Search Secret Doors (3x at dead ends!)  [t] Throw Bow'), a: attr80('0e') });
                    rows.push({ g: pad80('  Aquator Hazard (A): Rusts metallic armor by -1 AC! Remove armor [T] first.'), a: attr80('0c') });
                    rows.push({ g: pad80('  Scare Monster Trick: DROP [d] Scroll of Scare Monster and stand on it!'), a: attr80('0a') });
                    rows.push({ g: pad80('  Goal: Descend to Level 26, grab the Amulet of Yendor (,), and climb [<] to L1.'), a: attr80('01') });
                } else if (this.realm === 'ryod') {
                    rows.push({ g: pad80(`  --- ROLL YOUR OWN DUNGEON (${this.spec.ryodHash || 'CUSTOM'}) SURVIVAL DOSSIER ---`), a: attr80('0b') });
                    rows.push({ g: pad80(`  [m] Invoke Signature / Discipline Power   [t] Talk to Town Elder (Depth 0)`), a: attr80('0e') });
                    rows.push({ g: pad80(`  [p] Buy Supplies from Quartermaster       [y] Free Chained Allies (&) or Pray (_)`), a: attr80('0a') });
                    rows.push({ g: pad80(`  [G] God-Mode Floor Warp (when Immortal)   [C] Character Sheet & Blueprint ID`), a: attr80('01') });
                }
                rows.push({ g: pad80('  --------------------------------------------------------------------------'), a: attr80('02') });
                rows.push({ g: pad80('  Click [? HELP] on the HUD or press [Ctrl+K] for full Realm Manuals & Spoilers.'), a: attr80('0b') });
            }
            while (rows.length < TERM_H) rows.push({ g: pad80(''), a: attr80('01') });
            return rows;
        }

        const rows = [];
        const lastMsg = this.state.menuMode === 'direction'
            ? (this.state.pendingPrompt || 'In which direction?')
            : ((this.state.messages[this.state.messages.length - 1] && this.state.messages[this.state.messages.length - 1].text) || '');
        rows.push({ g: pad80(lastMsg), a: attr80('01') });

        for (let y = 0; y < 21; y++) {
            const side = [
                `${p.name.slice(0, 11)}`,
                `${p.race.slice(0, 11)}`,
                `${p.class.slice(0, 11)}`,
                `STR: ${String(p.str).padStart(6, ' ')}`,
                `DEX: ${String(p.dex).padStart(6, ' ')}`,
                `INT: ${String(p.int).padStart(6, ' ')}`,
                `AC:  ${String(p.ac).padStart(6, ' ')}`,
                `HP: ${String(p.hp + '/' + p.hpMax).padStart(7, ' ')}`,
                (this.realm === 'brogue' || p.progressionMode === 'brogue_item') ? `ENC: ${String(p.enchantments || 0).padStart(6, ' ')}` : `${(this.spec.resourceLabel || 'MP').slice(0, 3)}: ${String(p.pw + '/' + p.pwMax).padStart(7, ' ')}`,
                (this.realm === 'dcss' || p.powerDiscipline === 'piety') ? `GOD:${String(p.deity).slice(0, 7).padStart(7, ' ')}` : `$:  ${String(p.gold).padStart(7, ' ')}`,
                `${this.state.branchName.slice(0, 6)}:${String(this.state.depth).padStart(4, ' ')}`
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

        const statusLine = typeof this.spec.formatStatusLine === 'function'
            ? this.spec.formatStatusLine(this.state)
            : `Level: ${this.state.depth}  Gold: ${p.gold}  Hp: ${p.hp}(${p.hpMax})  Str: ${p.str}  Arm: ${p.ac}  Exp: ${p.level}/${p.exp}`;
        rows.push({ g: pad80(`${p.name} the ${p.race} ${p.class} • ${this.state.branchName} ${this.state.depth}`), a: attr80('0e') });
        rows.push({ g: pad80(statusLine), a: attr80('0b') });
        return rows;
    }

    buildFrame() {
        this.seq++;
        const p = this.state.player;
        const mapRows = [];
        for (let y = 0; y < MAP_H; y++) {
            let g = '', a = '', f = '', l = '';
            for (let x = 0; x < MAP_W; x++) {
                const cell = this.state.map[y][x];
                let ch = cell.known ? cell.glyph : ' ';
                let at = cell.known ? (cell.attr || 1) : 1;
                if (x === p.x && y === p.y) {
                    ch = '@'; at = 1;
                } else if (cell.inView) {
                    const mon = this.state.monsters.find(m => m.x === x && m.y === y);
                    const obj = this.state.objects.find(o => o.x === x && o.y === y);
                    if (mon) { ch = mon.glyph; at = mon.attr || 1; }
                    else if (obj) { ch = obj.glyph || '?'; at = obj.attr || 11; }
                }
                const featCode = cell.known ? cell.feat : FEAT.NONE;
                const lighting = cell.roomLit ? 2 : (cell.inView ? 1 : 3);
                const flag = (cell.known ? 1 : 0) | (cell.inView ? 2 : 0) | ((lighting & 3) << 2);
                g += ch;
                a += at.toString(16).padStart(2, '0');
                f += featCode.toString(16).padStart(2, '0');
                l += flag.toString(16);
            }
            mapRows.push({ g, a, f, l });
        }

        const isOverlay = this.state.phase === 'setup' || this.state.menuMode !== 'none';
        const statuses = [];
        if (p.poisoned > 0) statuses.push({ name: 'Poisoned', attr: 4, val: p.poisoned });
        if (p.speedBoost > 0) statuses.push({ name: 'Fast', attr: 10, val: p.speedBoost });
        if (p.nutrition != null && p.nutrition < 50) statuses.push({ name: 'Starving', attr: 4, val: 3 });
        else if (p.nutrition != null && p.nutrition < 150) statuses.push({ name: 'Weak', attr: 12, val: 2 });
        else if (p.nutrition != null && p.nutrition < 300) statuses.push({ name: 'Hungry', attr: 14, val: 1 });
        if (p.hasAmulet) statuses.push({ name: this.spec.goalBadge || 'Amulet', attr: 14, val: 1 });
        if ((this.realm === 'dcss' || p.powerDiscipline === 'piety') && p.deity) {
            statuses.push({ name: `${p.deity} (${'★'.repeat(Math.max(1, p.piety || 1))})`, attr: 14, val: p.piety || 1 });
        }
        if (this.realm === 'brogue' || p.progressionMode === 'brogue_item' || p.progressionMode === 'hybrid') {
            statuses.push({ name: `Str ${p.str} • +${p.enchantments || 0} Ench`, attr: 11, val: p.str });
        }
        if (p.godMode || this.spec.godMode) {
            statuses.push({ name: 'GOD MODE', attr: 14, val: 1 });
        }

        let ryodMeta = null;
        const bp = this.state.ryodBlueprint || this.spec.ryodBlueprint;
        if (bp) {
            const act = typeof this.spec.resolveActForDepth === 'function'
                ? this.spec.resolveActForDepth(this.state.depth)
                : { index: 0, act: 'I', title: 'Act I', lens: 'Omen', banner: '' };
            ryodMeta = {
                ryodHash: bp.ryodHash || this.state.ryodHash,
                title: bp.title,
                subtitle: bp.subtitle,
                biome: bp.biome,
                storyArc: bp.storyArc,
                bestiary: bp.resolvedBestiary || bp.bestiary,
                heroOrigin: bp.heroOrigin,
                avatarMonsterName: p.avatarMonsterName || null,
                powerDiscipline: p.powerDiscipline || bp.resolvedDiscipline,
                resourceLabel: this.spec.resourceLabel || 'MANA',
                verbLabel: this.spec.verbLabel || 'Cast Spell',
                progressionMode: p.progressionMode || bp.progressionMode,
                victoryMode: bp.victoryMode,
                difficulty: bp.difficulty,
                godMode: Boolean(p.godMode || bp.godMode),
                hasTown: Boolean(bp.hasTown),
                goalDepth: bp.goalDepth || 15,
                goalItemName: bp.goalItemName,
                nemesisName: bp.nemesisName,
                chronicler: bp.chronicler,
                traditionKey: bp.traditionKey,
                audioTheme: bp.audioTheme,
                actIndex: act.index,
                actRoman: act.act,
                actTitle: act.title,
                actLens: act.lens,
                actBanner: act.banner
            };
        }

        const equipmentList = p.inventory.filter(it => Boolean(it.equipped)).map((it, idx) => ({
            slot: idx,
            letter: it.letter,
            slot_name: it.equipped,
            mention: it.equipped === 'weapon' ? 'Wielding' : 'Wearing',
            name: formatItemDesc(it),
            category: it.kind || 'misc',
            tval: it.tval || 23,
            sval: it.sval || 1,
            number: it.count || 1,
            weight: it.weight || 20,
            inscription: it.inscription || '',
            vm: computeVerbMask(it),
            attr: 1
        }));
        const inventoryList = p.inventory.map((it) => ({
            slot: it.slot,
            label: it.letter,
            letter: it.letter,
            name: formatItemDesc(it),
            category: it.kind || 'misc',
            tval: it.tval || 70,
            sval: it.sval || 1,
            number: it.count || 1,
            weight: it.weight || 10,
            inscription: it.inscription || '',
            vm: computeVerbMask(it),
            attr: 1
        }));
        const quiverList = p.inventory.filter(it => it.kind === 'ranged' || it.kind === 'ammo').map((it, idx) => ({
            slot: idx,
            letter: it.letter,
            name: formatItemDesc(it),
            category: it.kind || 'ranged',
            tval: it.tval || 16,
            number: it.count || 1,
            weight: it.weight || 5,
            inscription: it.inscription || '',
            vm: computeVerbMask(it)
        }));
        const floorList = this.state.objects.filter(o => o.x === p.x && o.y === p.y).map((o, idx) => ({
            slot: idx,
            letter: String.fromCharCode(97 + (idx % 26)),
            name: formatItemDesc(o),
            category: o.kind || 'misc',
            tval: o.tval || 70,
            sval: o.sval || 1,
            number: o.count || 1,
            vm: computeVerbMask(o)
        }));
        const promptKind = this.state.menuMode === 'direction'
            ? 'direction'
            : (this.state.menuMode === 'spells' || this.state.menuMode === 'skills' || this.state.menuMode === 'power_select' ? 'spell' : 'item');

        const computedResists = {
            acid: 0, elec: 0, fire: 0, cold: 0, pois: 0,
            light: 0, dark: 0, sound: 0, shards: 0, nexus: 0, nether: 0, chaos: 0, disen: 0,
            ...(p.resists || {})
        };
        const computedFlags = {
            rFear: false, rBlind: false, rConf: false, rStun: false,
            freeAct: false, holdLife: false, seeInvis: false, esp: false,
            regen: false, feather: false, slowDigest: false,
            ...(p.flags || {})
        };
        for (const it of p.inventory) {
            if (!it.equipped) continue;
            if (it.resists && typeof it.resists === 'object') {
                for (const [rk, rv] of Object.entries(it.resists)) {
                    if (rk in computedResists && Number.isFinite(rv)) {
                        computedResists[rk] = Math.max(-1, Math.min(3, (computedResists[rk] || 0) + rv));
                    }
                }
            }
            if (it.flags && typeof it.flags === 'object') {
                for (const [fk, fv] of Object.entries(it.flags)) {
                    if (fk in computedFlags && fv) computedFlags[fk] = true;
                }
            }
            if (it.brand === 'fire') computedResists.fire = Math.max(computedResists.fire, 1);
            if (it.brand === 'cold') computedResists.cold = Math.max(computedResists.cold, 1);
            if (it.brand === 'elec') computedResists.elec = Math.max(computedResists.elec, 1);
            if (it.brand === 'pois') computedResists.pois = Math.max(computedResists.pois, 1);
        }

        const uiCursor = (this.state.cursor && this.state.cursor.active) ? {
            active: true,
            mode: this.state.cursor.mode || 'target',
            x: this.state.cursor.x,
            y: this.state.cursor.y,
            has_los: typeof this.hasLineOfSight === 'function'
                ? Boolean(this.hasLineOfSight(p.x, p.y, this.state.cursor.x, this.state.cursor.y))
                : true,
            blast_rad: this.state.cursor.blast_rad || 0,
            mon_id: this.state.cursor.mon_id || 0
        } : null;

        if (!this._sentLoreSigs) this._sentLoreSigs = new Map();
        const pxNow = this.state.player.x;
        const pyNow = this.state.player.y;
        const visibleMonsters = this.state.monsters
            .filter(m => (this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView) || (m.isPet && Math.abs(m.x - pxNow) <= 2 && Math.abs(m.y - pyNow) <= 2));
        const frameLore = {};
        let hasNewLore = false;
        const hashRaceIdx = (raceName) => {
            const s = String(raceName || 'unknown');
            let h = 1;
            for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) & 0x7ff;
            return h || 1;
        };
        for (const m of visibleMonsters) {
            const rIdx = m.r_idx || hashRaceIdx(m.race);
            const relSpeed = (m.speed != null ? m.speed : 110) - 110;
            const sig = `${m.ac != null ? m.ac : 8}|${relSpeed}|${m.dmg || 4}|${m.ai || 'melee'}`;
            if (this._sentLoreSigs.get(rIdx) !== sig) {
                this._sentLoreSigs.set(rIdx, sig);
                const spells = [];
                if (m.ai === 'bolt_caster' || m.rangedElement) spells.push(`BOLT_${String(m.rangedElement || 'MANA').toUpperCase()} (${(m.dmg || 6) * 2})`);
                if (m.ai === 'telegraphed_cone_breath' || m.breathElement) spells.push(`BR_${String(m.breathElement || 'FIRE').toUpperCase()} (${(m.dmg || 8) * 3})`);
                if (m.ai === 'summoner') spells.push('S_MONSTER');
                if (m.ai === 'archer_kite') spells.push(`ARROW (${m.dmg || 5})`);
                const knownResists = [];
                if (/hydra/i.test(m.race || '')) knownResists.push('regen', 'vulnFire');
                if (m.resistElement) knownResists.push(`im${m.resistElement[0].toUpperCase()}${m.resistElement.slice(1)}`);
                frameLore[String(rIdx)] = {
                    ac: m.ac != null ? m.ac : 8,
                    speed: relSpeed,
                    kills: (this.state.killLedger && this.state.killLedger[m.race]) || 0,
                    deaths: 0,
                    blows: [`Hit/Hurt ~${m.dmg || 4}`],
                    spells,
                    known_resists: knownResists
                };
                hasNewLore = true;
            }
        }

        const outFrame = {
            t: 'frame',
            realm: this.realm,
            seq: this.seq,
            phase: this.state.phase,
            victory: Boolean(p.winner),
            ryodMeta,
            ui: {
                overlay: isOverlay ? 3 : 0,
                awaiting_command: !isOverlay,
                more: false,
                context: isOverlay ? 'menu' : 'play',
                prompt: this.state.menuMode !== 'none' ? { kind: promptKind, text: this.state.pendingPrompt || 'Inventory' } : null,
                cursor: uiCursor
            },
            inventory: inventoryList,
            equipment: equipmentList,
            quiver: quiverList,
            floor: floorList,
            player: {
                name: p.name,
                race: p.race,
                class: p.class,
                avatarId: p.avatarId || null,
                isMonsterAvatar: Boolean(p.isMonsterAvatar),
                avatarMonsterName: p.avatarMonsterName || null,
                progression_mode: p.progressionMode || (this.usesExpLevels() ? 'xp' : 'brogue_item'),
                power_discipline: p.powerDiscipline || 'arcane',
                resource_label: this.spec.resourceLabel || 'MANA',
                god_mode: Boolean(p.godMode || this.spec.godMode),
                stakes_mode: p.stakesMode || (bp && bp.stakesMode) || 'ironman',
                resurrection_count: p.resurrectionCount || 0,
                deity: p.deity,
                piety: p.piety,
                runes: p.runes || 0,
                lumenstones: p.lumenstones || 0,
                enchantments: p.enchantments || 0,
                nutrition: p.nutrition || 1000,
                branch: this.state.branchName,
                branch_name: this.state.branchName,
                place_label: this.state.depth === 0 ? `${this.state.branchName || 'Sanctuary'}:Town` : `${this.state.branchName === 'D' ? 'Dungeon' : (this.state.branchName || 'Dungeon')}:${this.state.depth || 1}`,
                god: p.god || p.deity || 'No God',
                piety: p.piety || 0,
                runes: Array.isArray(p.runes) ? p.runes.length : (p.runes || 0),
                rune_list: Array.isArray(p.runes) ? p.runes : [],
                lumenstones: p.lumenstones || 0,
                enchantments: p.enchantments || 0,
                nutrition: Math.min(100, Math.round((p.nutrition || 1000) / 10)),
                nutrition_max: 100,
                history: this.spec.lore || `Venturing through ${this.state.branchName}.`,
                y: p.y,
                x: p.x,
                depth: this.state.depth,
                max_depth: this.state.maxDepth,
                level: this.usesExpLevels() ? p.level : 0,
                max_lev: this.usesExpLevels() ? (p.maxLevel || p.level) : 0,
                exp: this.usesExpLevels() ? p.exp : 0,
                exp_max: this.usesExpLevels() ? (p.maxExp || p.exp) : 0,
                exp_next: this.usesExpLevels() ? p.expNext : 0,
                gold: p.gold,
                hp: p.hp,
                hp_max: p.hpMax,
                sp: this.realm === 'brogue' || this.realm === 'rogue' ? Math.round((p.nutrition || 1000) / 20) : p.pw,
                sp_max: this.realm === 'brogue' || this.realm === 'rogue' ? 100 : p.pwMax,
                ac: p.ac,
                ac_base: p.ac,
                ac_to_a: 0,
                study: 0,
                resting: 0,
                light: 2,
                light_item: 'Dungeon Torch',
                light_fuel: 1500,
                weapon_item: p.weaponName || 'bare hands',
                shield_item: p.shieldName || '',
                bow_item: p.bowName || '',
                speed: p.speedBoost > 0 ? 120 : 110,
                dead: p.dead,
                winner: p.winner,
                died_from: p.diedFrom || p.killed_by || 'mortal wounds',
                turn: this.state.turn,
                stats: {
                    str: { use: p.str, max: p.str, top: p.str, reduced: false },
                    int: { use: p.int, max: p.int, top: p.int, reduced: false },
                    wis: { use: p.wis, max: p.wis, top: p.wis, reduced: false },
                    dex: { use: p.dex, max: p.dex, top: p.dex, reduced: false },
                    con: { use: p.con, max: p.con, top: p.con, reduced: false }
                },
                resists: computedResists,
                flags: computedFlags,
                statuses,
                equipment: equipmentList,
                inventory: inventoryList,
                quiver: quiverList
            },
            map: { h: MAP_H, w: MAP_W, height: MAP_H, width: MAP_W, rows: mapRows },
            monsters: visibleMonsters
                .map(m => {
                    const rIdx = m.r_idx || hashRaceIdx(m.race);
                    return {
                        id: m.id,
                        r_idx: rIdx,
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
                        townRole: m.townRole || null
                    };
                }),
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

function runCartridgeMain(spec, defaultSaveDir) {
    const opts = parseCliArgs(process.argv, defaultSaveDir);
    const engine = new UniversalCartridgeEngine(spec, opts);

    const writeJson = (obj) => {
        process.stdout.write(JSON.stringify(obj) + '\n');
    };

    writeJson({
        t: 'hello',
        protocol: 1,
        protocol_minor: 2,
        version: spec.version || '1.0.0-bridge',
        realm: spec.realm,
        savefile: engine.saveFile
    });

    writeJson({
        t: 'commands',
        realm: spec.realm,
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
            const ok = engine.saveGame();
            writeJson({ t: 'saved', ok });
            return;
        }
        if (line === 'frame') {
            writeJson(engine.buildFrame());
            return;
        }
        if (line === 'quit' || line === 'exit') {
            engine.saveGame(); // Protected by Lazarus check: no-op if player.dead === true
            process.exit(0);
            return;
        }
        if (line.startsWith('key ') || line.startsWith('keys ')) {
            const keyArg = line.replace(/^keys?\s+/, '');
            engine.handleKey(keyArg);
            writeJson(engine.buildFrame());
        }
    });

    return engine;
}

module.exports = {
    FEAT,
    UniversalCartridgeEngine,
    runCartridgeMain,
    formatItemDesc,
    computeVerbMask
};

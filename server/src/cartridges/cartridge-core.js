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
    TRAP: 16,
    WALL: 21,
    PERM_WALL: 22,
    LAVA: 30,
    WATER: 31,
    CHASM: 32,
    GRASS: 33,
    ALTAR: 43,
    FOUNTAIN: 44
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
    const k = String(item.kind || '').toLowerCase();
    if (k === 'potion') vm |= (1 << 0);
    else if (k === 'scroll') vm |= (1 << 1);
    else if (k === 'food') vm |= (1 << 2);
    else if (k === 'wand') vm |= (1 << 3) | (1 << 5);
    else if (k === 'staff' || k === 'tool' || k === 'charm') vm |= (1 << 4) | (1 << 6);
    else if (k === 'weapon' || k === 'armor' || k === 'ring' || k === 'amulet') {
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
    return `${cnt}${bns}${it.name}${chg}${eq}`.trim();
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
        this.rngState = (crypto.randomBytes(4).readUInt32LE(0) || ((Date.now() ^ 0x9e3779b9) >>> 0)) >>> 0;

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
        } else if (this.realm === 'ryod' && bpFate >= 15) {
            if (inv[0] && inv[0].kind === 'weapon') inv[0].bonus = (inv[0].bonus || 1) + 1;
            inv.push({ kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 14, count: 1, weight: 5, tval: 70, sval: 12 });
        } else if (this.realm === 'ryod' && bpFate === 1) {
            inv.push({ kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 14, enchantGain: 1, count: 1, weight: 5, tval: 70, sval: 15 });
        }

        this.state = {
            realm: this.realm,
            ryodHash: this.spec.ryodHash || null,
            ryodBlueprint: this.spec.ryodBlueprint || null,
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
                isMonsterAvatar: Boolean(r.isMonsterAvatar),
                avatarMonsterName: r.avatarMonsterName || null,
                innatePower: r.innatePower || null,
                disciplinePowers: Array.isArray(r.disciplinePowers) ? r.disciplinePowers : null,
                progressionMode: this.spec.progressionMode || (hasLevels ? 'xp' : 'brogue_item'),
                powerDiscipline: this.spec.powerDiscipline || 'arcane',
                godMode: Boolean(this.spec.godMode),
                align: r.align || 'Neutral',
                deity: r.deity || (this.spec.defaultDeity || 'Fate'),
                piety: r.piety != null ? r.piety : 2,
                runes: 0,
                lumenstones: 0,
                enchantments: 0,
                nutrition: 1200,
                level: hasLevels ? 1 : 0,
                maxLevel: hasLevels ? 1 : 0,
                exp: 0,
                maxExp: 0,
                expNext: hasLevels ? this.getExpNextForLevel(1) : 0,
                gold: 35,
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
            ]
        };
        this.reindexInventory();
        this.generateLevel(startDepth);
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
        p.weaponName = w ? w.name : 'bare hands';
        this.recalcPlayerDefenses();
    }

    recalcPlayerDefenses() {
        const p = this.state && this.state.player;
        if (!p || !Array.isArray(p.inventory)) return;
        const body = p.inventory.find(it => it.equipped === 'body' || it.equipped === 'armor');
        const ring = p.inventory.find(it => it.equipped === 'ring' && /protection|armor|defense/i.test(it.name || ''));
        const armorBase = body ? Number(body.ac != null ? body.ac : 4) : 0;
        const armorBonus = (body ? Number(body.bonus || 0) : 0) + (ring ? Number(ring.bonus || 1) : 0);
        if (this.realm === 'rogue') {
            p.ac = body ? Math.max(-10, (body.ac != null ? body.ac : 7) - armorBonus) : 10;
        } else {
            p.ac = Math.max(0, (body ? (armorBase + armorBonus) : 2) + Math.floor(((p.dex || 12) - 10) / 3));
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
                if (manhattan === 1 && this.rand(100) < 55) {
                    carveCorridor(rooms[i], rooms[j]);
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

        // Spawn floor items across shuffled rooms
        for (let i = 1; i < shuffledRooms.length; i++) {
            const rm = shuffledRooms[i];
            const tpl = this.spec.items[this.rand(this.spec.items.length)];
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
                if (this.hasLineOfSight(p.x, p.y, tx, ty)) {
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
            fs.writeFileSync(this.saveFile, full);
            fs.writeFileSync(this.saveFile + '.living.sav', full);
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
                this.state.phase = 'play';
                this.saveGame();
                return;
            }
            if (lower === 'enter' || lower === 'return' || lower === 'space' || lower === 'y') {
                this.state.phase = 'play';
                this.saveGame();
                return;
            }
            if (lower === 'down' || lower === 'arrowdown' || lower === 'j') {
                const next = ((this.state.selectedRoleIdx || 0) + 1) % this.spec.roles.length;
                this.initNewState(next);
                return;
            }
            if (lower === 'up' || lower === 'arrowup' || lower === 'k') {
                const prev = ((this.state.selectedRoleIdx || 0) - 1 + this.spec.roles.length) % this.spec.roles.length;
                this.initNewState(prev);
                return;
            }
            const idx = this.spec.roles.findIndex(r => r.key === lower);
            if (idx >= 0) {
                this.initNewState(idx);
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
                if (k === '/' || k === '|' || (this.state.menuMode === 'inven' && k === 'e' && this.realm !== 'rogue') || (this.state.menuMode === 'equip' && k === 'i')) {
                    this.state.menuMode = this.state.menuMode === 'inven' ? 'equip' : 'inven';
                    return;
                }
                if (this.state.menuMode === 'equip' && (k === 'r' || k === 't' || k === 'T')) {
                    this.openVerbPrompt('takeoff', 'Remove which item? [a-z or ESC]');
                    return;
                }
                if (/^[a-z]$/i.test(k)) {
                    const item = p.inventory.find(it => it.letter === lower);
                    if (item) {
                        if (this.state.menuMode === 'equip' && item.kind === 'food') {
                            this.state.menuMode = 'none';
                            this.applyVerbToItem('eat', item);
                            return;
                        }
                        this.state.selectedItem = item;
                        this.state.menuMode = 'item_action';
                        this.state.pendingPrompt = `${item.letter}) ${formatItemDesc(item)} — [Enter] Use/Equip [d]rop [t]hrow [x]Examine [ESC]`;
                        return;
                    }
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
                if (k === 't' || k === 'f' || k === 'v') { this.fireOrThrowItem(item); return; }
                if (k === 'T' || (k === 'r' && item.equipped)) { this.applyVerbToItem('takeoff', item); return; }
                if (k === 'x' || k === 'I' || k === ';') { this.inspectItem(item); return; }
                if (lower === 'enter' || /^[wWqreEazuU]$/.test(k)) {
                    const primaryVerb = item.kind === 'potion' ? 'quaff'
                        : (item.kind === 'scroll' ? 'read'
                        : (item.kind === 'food' ? 'eat'
                        : ((item.kind === 'weapon' || item.kind === 'ranged' || item.kind === 'armor')
                            ? (item.equipped ? 'takeoff' : 'wield') : 'use')));
                    this.applyVerbToItem(primaryVerb, item);
                }
                return;
            }
            if (this.state.menuMode === 'verb' && /^[a-z]$/i.test(k)) {
                const item = p.inventory.find(it => it.letter === lower);
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
                else this.applyVerbToItem(verb, item);
                return;
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
            if (this.state.menuMode === 'power_select' || this.state.menuMode === 'spells') {
                const powers = this.getAvailablePowers();
                if (lower === 'i' || lower === 'z') {
                    this.openVerbPrompt('use', 'Use, zap, or evoke which item? [a-z or ESC]');
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
            if (this.realm === 'rogue') {
                this.openVerbPrompt('eat', 'Eat which food item? [a-z or ESC]');
                return;
            }
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
        if (k === 'T') { this.openVerbPrompt('takeoff', 'Remove which item? [a-z or ESC]'); return; }
        if (k === 't' || k === 'f' || k === 'v') {
            this.state.menuMode = 'direction';
            this.state.pendingVerb = 'fire';
            this.state.pendingPrompt = 'Direction to fire/throw? [dir or t/Enter for nearest, ESC]';
            return;
        }
        if (k === 'd') { this.openVerbPrompt('drop', 'Drop which item? [a-z or ESC]'); return; }
        if (k === 'I' || k === 'x') { this.openVerbPrompt('inspect', 'Examine which item? [a-z or ESC]'); return; }
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
        if (k === 'a' || k === 'V' || k === 'z' || k === 'Z' || k === 'u' || k === 'U') {
            if (this.realm === 'dcss' && k === 'a' && (p.piety || 0) >= 1) {
                this.invokeDeityPower();
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
            const vis = this.state.monsters.filter(m => this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
            this.addMessage(vis.length ? `Visible: ${vis.map(m => `${m.race} (${m.hp}/${m.hp_max} HP)`).join(', ')}.` : `You survey ${this.state.branchName} ${this.state.depth}: no monsters in sight.`, 11);
            return;
        }
        if (k === 'o' || k === 'O') { this.openOrCloseDoor(true); return; }
        if (k === 'c') { this.openOrCloseDoor(false); return; }
        if (k === 'D') { this.disarmAdjacentTrap(); return; }
        if (k === 'p' || k === 'P') {
            this.prayAtAltar();
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
        if (k === '.' || k === '5' || k === 'R' || lower === 'space') {
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
        if (verb === 'quaff' || (verb === 'use' && item.kind === 'potion')) {
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
            if (item.enchantGain) {
                p.enchantments = (p.enchantments || 0) + 1;
                const eq = p.inventory.find(i => i.equipped === 'weapon')
                    || p.inventory.find(i => i.equipped === 'body' || i.equipped === 'armor')
                    || p.inventory.find(i => i.kind === 'staff' || i.kind === 'wand' || i.kind === 'ring')
                    || item;
                eq.bonus = (eq.bonus || 0) + 1;
                if (typeof eq.charges === 'number') eq.charges += 1;
                this.recalcPlayerDefenses();
                this.addMessage(`Glowing runes of enchantment infuse your ${eq.name} (+${eq.bonus})!`, 14);
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
            const slot = item.kind === 'armor' ? 'body' : (item.kind === 'ring' ? 'ring' : (item.kind === 'amulet' ? 'amulet' : 'weapon'));
            p.inventory.forEach(it => { if (it.equipped === slot) it.equipped = null; });
            item.equipped = slot;
            this.reindexInventory();
            this.addMessage(`You equip the ${formatItemDesc(item)}.`, 11);
            this.advanceTurn();
            return;
        }
        if (verb === 'takeoff') {
            item.equipped = null;
            this.reindexInventory();
            this.addMessage(`You remove the ${formatItemDesc(item)}.`, 11);
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
        // Offensive wand/spell invocation against nearest visible hostile
        const target = this.state.monsters.find(m => !m.isPet && !m.peaceful && this.state.map[m.y][m.x].inView);
        if (target) {
            const dmg = 8 + this.rand(8);
            target.hp -= dmg;
            this.addMessage(`Arcane energy blasts the ${target.race} for ${dmg} damage!`, 14);
            if (target.hp <= 0) this.handleMonsterKilled(target);
        } else {
            p.speedBoost = 15;
            this.addMessage(`You channel arcane power and feel yourself surge with haste!`, 11);
        }
        this.advanceTurn();
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

    castActivePower(power) {
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

    invokeDeityPower() {
        const p = this.state.player;
        if ((p.piety || 0) < 1) {
            this.addMessage(`${p.deity} ignores your plea for divine intervention.`);
            return;
        }
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
                if (this.spec.victoryMode === 'three_runes' && (p.runes || 0) < 3) {
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
            const dmg = Math.max(2, Math.round((baseRoll + strBonus + wepBonus) * mutMult));
            mon.hp -= dmg;
            this.addMessage(`You strike the ${mon.race} with your ${p.weaponName}! (${dmg} dmg)`, 11);
            if (mon.hp <= 0) {
                this.handleMonsterKilled(mon);
                this.advanceTurn();
                return;
            }
            const mLower = String(mon.race || '').toLowerCase();
            if (mLower.includes('hydra') && wep && /sword|axe|blade|dagger|halberd/i.test(wep.name || '') && !/flam|fire/i.test(wep.name || '')) {
                mon.hp = Math.min((mon.hp_max || 30) + 12, mon.hp + 6);
                mon.dmg = (mon.dmg || 8) + 2;
                this.addMessage(`Your edged ${wep.name} severs a head — two more grow back in its place!`, 12);
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
        if (!isWalkableFeat(cell.feat)) {
            this.addMessage('Solid stone blocks your way.');
            return;
        }

        p.x = tx;
        p.y = ty;
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
        if (this.usesExpLevels()) {
            const xpGain = mon.exp !== undefined ? mon.exp : 10;
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
            if (mon.captive || mon.townRole) continue;
            if (mon.isPet) {
                const adjFoe = this.state.monsters.find(f => !f.isPet && !f.peaceful && Math.hypot(f.x - mon.x, f.y - mon.y) <= 1.5);
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
                if (dist > 1.8) {
                    const nx = mon.x + Math.sign(p.x - mon.x);
                    const ny = mon.y + Math.sign(p.y - mon.y);
                    if (this.state.map[ny] && this.state.map[ny][nx] && isWalkableFeat(this.state.map[ny][nx].feat) && !this.state.monsters.some(m => m.x === nx && m.y === ny) && !(nx === p.x && ny === p.y)) {
                        mon.x = nx; mon.y = ny;
                    }
                }
                continue;
            }

            const dist = Math.hypot(p.x - mon.x, p.y - mon.y);
            if (dist <= 1.5) {
                const mLower = String(mon.race || '').toLowerCase();
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
                const isProperName = Boolean(mon.isBoss || /^[A-Z]/.test(mon.race || ''));
                const subjName = isProperName ? mon.race : `The ${mon.race}`;
                const killerArticle = isProperName ? mon.race : (/^[aeiou]/i.test(mon.race || '') ? `an ${mon.race}` : `a ${mon.race}`);
                this.addMessage(`${subjName} hits you! (-${dmg} HP)`, 4);
                if (p.hp <= 0) {
                    p.hp = 0;
                    p.dead = true;
                    p.diedFrom = killerArticle;
                    this.addMessage(`You die... Killed by ${p.diedFrom} on ${this.state.branchName} ${this.state.depth}.`, 4);
                    return;
                }
            } else if (dist <= 7 && this.state.map[mon.y][mon.x].inView) {
                const nx = mon.x + Math.sign(p.x - mon.x);
                const ny = mon.y + Math.sign(p.y - mon.y);
                if (this.state.map[ny] && this.state.map[ny][nx] && isWalkableFeat(this.state.map[ny][nx].feat) && !this.state.monsters.some(m => m.x === nx && m.y === ny) && !(nx === p.x && ny === p.y)) {
                    mon.x = nx; mon.y = ny;
                }
            }
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
            rows.push({ g: pad80('  [*] Quick Start & enter the 3D dungeon immediately'), a: attr80('0b') });
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
            } else if (this.state.menuMode === 'skills' || this.state.menuMode === 'spells' || this.state.menuMode === 'power_select') {
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

        return {
            t: 'frame',
            realm: this.realm,
            ryodMeta,
            seq: this.seq,
            phase: this.state.phase,
            ui: {
                overlay: isOverlay ? 3 : 0,
                awaiting_command: !isOverlay,
                more: false,
                context: isOverlay ? 'menu' : 'play',
                prompt: this.state.menuMode !== 'none' ? { kind: promptKind, text: this.state.pendingPrompt || 'Inventory' } : null
            },
            inventory: inventoryList,
            equipment: equipmentList,
            quiver: quiverList,
            floor: floorList,
            player: {
                name: p.name,
                race: p.race,
                class: p.class,
                isMonsterAvatar: Boolean(p.isMonsterAvatar),
                avatarMonsterName: p.avatarMonsterName || null,
                progression_mode: p.progressionMode || (this.usesExpLevels() ? 'xp' : 'brogue_item'),
                power_discipline: p.powerDiscipline || 'arcane',
                resource_label: this.spec.resourceLabel || 'MANA',
                god_mode: Boolean(p.godMode || this.spec.godMode),
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
                weapon_item: p.weaponName || 'blade',
                speed: p.speedBoost > 0 ? 120 : 110,
                dead: p.dead,
                winner: p.winner,
                died_from: p.diedFrom || p.killed_by || 'mortal wounds',
                turn: this.state.turn,
                stats: {
                    str: { use: p.str, max: p.str, top: p.str, reduced: false },
                    int: { use: p.int, max: p.int, top: p.str, reduced: false },
                    wis: { use: p.wis, max: p.wis, top: p.wis, reduced: false },
                    dex: { use: p.dex, max: p.dex, top: p.dex, reduced: false },
                    con: { use: p.con, max: p.con, top: p.con, reduced: false }
                },
                statuses,
                equipment: equipmentList,
                inventory: inventoryList,
                quiver: quiverList
            },
            map: { h: MAP_H, w: MAP_W, height: MAP_H, width: MAP_W, rows: mapRows },
            monsters: this.state.monsters
                .filter(m => this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView)
                .map(m => ({
                    id: m.id,
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
                    speed: m.speed || 110,
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

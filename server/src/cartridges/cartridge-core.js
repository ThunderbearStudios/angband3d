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
    for (let i = 2; i < argv.length; i++) {
        const arg = String(argv[i] || '');
        if (arg === '-n') isNew = true;
        else if (arg.startsWith('-u')) user = arg.slice(2) || user;
        else if (arg.startsWith('-dsave=')) saveDir = arg.slice(7) || saveDir;
    }
    const cleanUser = user.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'Adventurer';
    return { user: cleanUser, saveDir, isNew };
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
        this.rngState = (Date.now() ^ 0x9e3779b9) >>> 0;

        if (!cliOpts.isNew && this.loadSave()) {
            this.addMessage(`Welcome back to ${spec.title}, ${this.state.player.name}!`, 14);
        } else {
            this.initNewState(0);
            if (cliOpts.isNew) {
                this.state.phase = 'play';
                this.saveGame();
            }
        }
    }

    rand(max) {
        this.rngState = (1664525 * this.rngState + 1013904223) >>> 0;
        return max > 0 ? (this.rngState % max) : 0;
    }

    initNewState(roleIdx = 0) {
        const roles = this.spec.roles;
        const r = roles[roleIdx % roles.length] || roles[0];
        const inv = [];
        if (r.weapon) inv.push({ ...r.weapon, kind: 'weapon', glyph: ')', equipped: 'weapon', count: 1 });
        if (r.armor) inv.push({ ...r.armor, kind: 'armor', glyph: '[', equipped: 'body', count: 1 });
        if (r.extra) inv.push({ ...r.extra, count: r.extra.count || 1 });
        inv.push({ kind: 'potion', name: this.spec.healingPotionName || 'potion of healing', glyph: '!', attr: 13, heal: 18, count: 2, weight: 15, tval: 71, sval: 38 });
        inv.push({ kind: 'food', name: this.spec.foodName || 'food ration', glyph: '%', attr: 3, nutrition: 800, count: 2, weight: 20, tval: 80, sval: 1 });

        this.state = {
            realm: this.realm,
            phase: 'setup',
            menuMode: 'none',
            pendingVerb: null,
            pendingPrompt: '',
            selectedRoleIdx: roleIdx,
            depth: 1,
            maxDepth: 1,
            branchName: this.getBranchName(1),
            turn: 1,
            player: {
                name: this.user || 'Adventurer',
                race: r.race || 'Human',
                class: r.id || 'Warrior',
                align: r.align || 'Neutral',
                deity: r.deity || (this.spec.defaultDeity || 'Fate'),
                piety: r.piety != null ? r.piety : 2,
                runes: 0,
                lumenstones: 0,
                enchantments: 0,
                nutrition: 1200,
                level: 1,
                exp: 0,
                expNext: 20,
                gold: 25,
                hp: r.hp || 18,
                hpMax: r.hp || 18,
                pw: r.pw != null ? r.pw : 4,
                pwMax: r.pw != null ? r.pw : 4,
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
            monsters: [],
            objects: [],
            messages: [
                { text: this.spec.welcomeMessage || `You enter ${this.spec.title}.`, count: 1, attr: 14 }
            ]
        };
        this.reindexInventory();
        this.generateLevel(1);
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
    }

    generateLevel(depth) {
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
        const roomCols = 4;
        const roomRows = 2;
        const cellW = Math.floor((MAP_W - 4) / roomCols);
        const cellH = Math.floor((MAP_H - 2) / roomRows);

        for (let ry = 0; ry < roomRows; ry++) {
            for (let rx = 0; rx < roomCols; rx++) {
                const rw = 6 + this.rand(Math.max(2, cellW - 8));
                const rh = 4 + this.rand(Math.max(2, cellH - 5));
                const x0 = 2 + rx * cellW + this.rand(Math.max(1, cellW - rw - 1));
                const y0 = 1 + ry * cellH + this.rand(Math.max(1, cellH - rh - 1));
                const room = { x0, y0, x1: Math.min(MAP_W - 3, x0 + rw), y1: Math.min(MAP_H - 3, y0 + rh) };
                room.cx = Math.floor((room.x0 + room.x1) / 2);
                room.cy = Math.floor((room.y0 + room.y1) / 2);
                rooms.push(room);

                for (let y = room.y0; y <= room.y1; y++) {
                    for (let x = room.x0; x <= room.x1; x++) {
                        map[y][x] = { glyph: '.', attr: 1, feat: FEAT.FLOOR, known: false, inView: false, roomLit: true };
                    }
                }
            }
        }

        // Connect rooms with corridors and occasional doors
        for (let i = 0; i < rooms.length - 1; i++) {
            let x = rooms[i].cx;
            let y = rooms[i].cy;
            const tx = rooms[i + 1].cx;
            const ty = rooms[i + 1].cy;
            while (x !== tx) {
                x += Math.sign(tx - x);
                if (map[y][x].feat === FEAT.WALL) {
                    map[y][x] = { glyph: '.', attr: 1, feat: FEAT.FLOOR, known: false, inView: false, roomLit: false };
                }
            }
            while (y !== ty) {
                y += Math.sign(ty - y);
                if (map[y][x].feat === FEAT.WALL) {
                    map[y][x] = { glyph: '.', attr: 1, feat: FEAT.FLOOR, known: false, inView: false, roomLit: false };
                }
            }
        }

        // Place Up & Down stairs
        const startRoom = rooms[0];
        const endRoom = rooms[rooms.length - 1];
        this.state.player.x = startRoom.cx;
        this.state.player.y = startRoom.cy;
        map[startRoom.cy][startRoom.cx].glyph = '<';
        map[startRoom.cy][startRoom.cx].feat = FEAT.UP_STAIR;
        map[startRoom.cy][startRoom.cx].attr = 15;

        map[endRoom.cy][endRoom.cx].glyph = '>';
        map[endRoom.cy][endRoom.cx].feat = FEAT.DOWN_STAIR;
        map[endRoom.cy][endRoom.cx].attr = 14;

        // Realm-specific environmental features
        if (this.realm === 'dcss' && rooms.length > 2) {
            const altarRoom = rooms[2];
            const god = (this.spec.gods && this.spec.gods[(depth + this.rand(this.spec.gods.length)) % this.spec.gods.length]) || 'Okawaru';
            map[altarRoom.cy][altarRoom.cx].glyph = '_';
            map[altarRoom.cy][altarRoom.cx].feat = FEAT.ALTAR;
            map[altarRoom.cy][altarRoom.cx].attr = 14;
            map[altarRoom.cy][altarRoom.cx].deity = god;
        } else if (this.realm === 'brogue' && rooms.length > 3) {
            // Brogue environmental tiles: lava/water border & captive ally
            const envRoom = rooms[2];
            const isLava = depth >= 4;
            for (let x = envRoom.x0 + 1; x < envRoom.x1; x++) {
                const ry = envRoom.y0 + 1;
                if (ry < envRoom.y1 && !(x === envRoom.cx && ry === envRoom.cy)) {
                    map[ry][x].glyph = '~';
                    map[ry][x].feat = isLava ? FEAT.LAVA : FEAT.WATER;
                    map[ry][x].attr = isLava ? 4 : 11;
                }
            }
        } else if (rooms.length > 2) {
            const featRoom = rooms[2];
            map[featRoom.cy][featRoom.cx].glyph = '{';
            map[featRoom.cy][featRoom.cx].feat = FEAT.FOUNTAIN;
            map[featRoom.cy][featRoom.cx].attr = 11;
        }

        this.state.map = map;
        this.state.monsters = [];
        this.state.objects = [];

        // Spawn realm monsters
        const eligibleMons = this.spec.monsters.filter(m => (m.minDepth || 1) <= depth + 1);
        let monId = 1;
        for (let i = 1; i < rooms.length; i++) {
            const rm = rooms[i];
            const template = eligibleMons[this.rand(eligibleMons.length)] || this.spec.monsters[0];
            const mx = rm.x0 + 1 + this.rand(Math.max(1, rm.x1 - rm.x0 - 1));
            const my = rm.y0 + 1 + this.rand(Math.max(1, rm.y1 - rm.y0 - 1));
            if (mx === this.state.player.x && my === this.state.player.y) continue;
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
                exp: template.exp || 10,
                speed: template.speed || 110,
                lore: template.lore || '',
                isPet: false,
                peaceful: false,
                captive: false
            });
        }

        // Brogue captive ally in room 3
        if (this.realm === 'brogue' && rooms.length > 3 && this.spec.allies) {
            const allyRoom = rooms[3];
            const allyTpl = this.spec.allies[depth % this.spec.allies.length];
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

        // Spawn floor items
        for (let i = 1; i < rooms.length; i++) {
            const rm = rooms[i];
            const tpl = this.spec.items[this.rand(this.spec.items.length)];
            const ox = rm.x0 + this.rand(Math.max(1, rm.x1 - rm.x0));
            const oy = rm.y0 + this.rand(Math.max(1, rm.y1 - rm.y0));
            this.state.objects.push({
                ...tpl,
                x: ox,
                y: oy,
                count: tpl.count || 1
            });
        }

        // Goal artifact on deep floors
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

        this.updateVisibility();
    }

    updateVisibility() {
        const p = this.state.player;
        const map = this.state.map;
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                map[y][x].inView = false;
            }
        }
        const radius = 8;
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
                this.state = loaded;
                this.state.phase = 'play';
                this.state.menuMode = 'none';
                this.updateVisibility();
                return true;
            }
            // Fallback to .living.sav if main save was somehow marked dead
            if (targetFile === this.saveFile && fs.existsSync(this.saveFile + '.living.sav')) {
                const lBuf = fs.readFileSync(this.saveFile + '.living.sav');
                const lDesc = lBuf.readUInt32LE(28);
                const lLoaded = JSON.parse(lBuf.toString('utf8', 36 + lDesc));
                if (lLoaded && lLoaded.player && !lLoaded.player.dead) {
                    this.state = lLoaded;
                    this.state.phase = 'play';
                    this.state.menuMode = 'none';
                    fs.copyFileSync(this.saveFile + '.living.sav', this.saveFile);
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
            if (lower === 'enter' || lower === 'return' || lower === 'space' || lower === '*' || lower === 'y') {
                this.state.phase = 'play';
                this.saveGame();
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

        if (this.state.menuMode !== 'none') {
            if (lower === 'escape' || lower === 'esc' || lower === ' ') {
                this.state.menuMode = 'none';
                this.state.pendingVerb = null;
                this.state.pendingPrompt = '';
                return;
            }
            if (this.state.menuMode === 'inven' && k === '/') {
                this.state.menuMode = 'equip';
                return;
            }
            if (this.state.menuMode === 'equip' && k === '/') {
                this.state.menuMode = 'inven';
                return;
            }
            if (this.state.menuMode === 'verb' && /^[a-z]$/i.test(k)) {
                const item = p.inventory.find(it => it.letter === lower);
                this.state.menuMode = 'none';
                if (item) this.applyVerbToItem(this.state.pendingVerb, item);
                this.state.pendingVerb = null;
                return;
            }
            this.state.menuMode = 'none';
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
        if (k === 't' || k === 'T') { this.openVerbPrompt('takeoff', 'Remove which item? [a-z or ESC]'); return; }
        if (k === 'd') { this.openVerbPrompt('drop', 'Drop which item? [a-z or ESC]'); return; }
        if (k === 'a' || k === 'z' || k === 'Z' || k === 'm') {
            if (this.realm === 'dcss' && (k === 'p' || k === 'a')) {
                this.invokeDeityPower();
                return;
            }
            this.openVerbPrompt('use', 'Use or invoke which item/spell? [a-z or ESC]');
            return;
        }
        if (k === 'p' && this.realm === 'dcss') {
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
                this.generateLevel(this.state.depth + 1);
                this.addMessage(`You descend deeper into ${this.state.branchName} (Level ${this.state.depth}).`, 14);
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
                if (this.state.depth === 1 && p.hasAmulet) {
                    p.winner = true;
                    this.addMessage(`Glorious Victory! You ascend into the sunlight with the ${this.spec.goalItemName || 'Amulet of Yendor'}!`, 14);
                    this.saveGame();
                } else if (this.state.depth > 1) {
                    this.generateLevel(this.state.depth - 1);
                    this.addMessage(`You climb upward to Level ${this.state.depth}.`, 11);
                    this.saveGame();
                } else {
                    this.addMessage('You cannot leave the dungeon empty-handed!');
                }
            } else {
                this.addMessage('There are no upward stairs here.');
            }
            return;
        }
        if (k === '.' || k === '5' || k === 's' || k === 'R' || lower === 'space') {
            if (p.hp < p.hpMax) p.hp = Math.min(p.hpMax, p.hp + 1);
            if (p.pw < p.pwMax && this.state.turn % 2 === 0) p.pw++;
            this.advanceTurn();
        }
    }

    openVerbPrompt(verb, promptText) {
        this.state.menuMode = 'verb';
        this.state.pendingVerb = verb;
        this.state.pendingPrompt = promptText;
    }

    applyVerbToItem(verb, item) {
        const p = this.state.player;
        if (verb === 'quaff' || (verb === 'use' && item.kind === 'potion')) {
            if (item.strengthGain) {
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
                const eq = p.inventory.find(i => i.equipped === 'weapon') || p.inventory.find(i => i.equipped === 'body') || item;
                eq.bonus = (eq.bonus || 0) + 1;
                if (eq.equipped === 'body') p.ac = (this.realm === 'rogue' ? p.ac - 1 : p.ac + 2);
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
            item.equipped = item.kind === 'armor' ? 'body' : 'weapon';
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

    prayAtAltar() {
        const p = this.state.player;
        const cell = this.state.map[p.y][p.x];
        if (cell.feat === FEAT.ALTAR && cell.deity) {
            p.deity = cell.deity;
            p.piety = Math.min(6, (p.piety || 2) + 1);
            p.hp = p.hpMax;
            this.addMessage(`You kneel at the glowing altar of ${cell.deity}. Divine fervor fills your soul! (Piety: ${'★'.repeat(p.piety)})`, 14);
        } else {
            p.hp = Math.min(p.hpMax, p.hp + 5);
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
            this.addMessage(`You claim the ${obj.name}! (${p.runes}/3 Runes of Zot collected)`, 14);
        } else if (obj.kind === 'lumenstone') {
            p.lumenstones = (p.lumenstones || 0) + 1;
            this.addMessage(`You claim a radiant ${obj.name}! (${p.lumenstones} Lumenstones)`, 14);
        } else {
            if (obj.isGoalArtifact) {
                p.hasAmulet = true;
                this.addMessage(`You seize the ${obj.name}! Now ascend to Level 1 to claim immortal victory!`, 14);
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
            const dmg = Math.max(2, 4 + this.rand(6) + strBonus + wepBonus);
            mon.hp -= dmg;
            this.addMessage(`You strike the ${mon.race} with your ${p.weaponName}! (${dmg} dmg)`, 11);
            if (mon.hp <= 0) {
                this.handleMonsterKilled(mon);
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
        this.addMessage(`You slay the ${mon.race}!`, 10);
        if (this.realm !== 'brogue') {
            p.exp += mon.exp || 10;
            if (p.exp >= p.expNext) {
                p.level++;
                p.expNext = Math.floor(p.expNext * 1.8);
                p.hpMax += 6;
                p.hp = p.hpMax;
                p.pwMax += 2;
                p.pw = p.pwMax;
                if (this.realm === 'dcss' && p.piety < 6) p.piety++;
                this.addMessage(`Welcome to Experience Level ${p.level}! Your vitality and power increase!`, 14);
            }
        }
    }

    advanceTurn() {
        const p = this.state.player;
        this.state.turn++;
        if (p.speedBoost > 0) p.speedBoost--;
        if (p.nutrition > 0) p.nutrition--;

        for (const mon of this.state.monsters.slice()) {
            if (mon.captive) continue;
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
                const dmg = Math.max(1, (mon.dmg || 4) - this.rand(2));
                p.hp -= dmg;
                this.addMessage(`The ${mon.race} hits you! (-${dmg} HP)`, 4);
                if (p.hp <= 0) {
                    p.hp = 0;
                    p.dead = true;
                    p.diedFrom = `a ${mon.race}`;
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

        if (this.state.menuMode === 'inven' || this.state.menuMode === 'equip' || this.state.menuMode === 'verb') {
            const rows = [];
            const isEq = this.state.menuMode === 'equip';
            const list = isEq ? p.inventory.filter(it => Boolean(it.equipped)) : p.inventory;
            const hdr = this.state.menuMode === 'verb'
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

        const rows = [];
        const lastMsg = (this.state.messages[this.state.messages.length - 1] && this.state.messages[this.state.messages.length - 1].text) || '';
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
                this.realm === 'brogue' ? `ENC: ${String(p.enchantments || 0).padStart(6, ' ')}` : `MP: ${String(p.pw + '/' + p.pwMax).padStart(7, ' ')}`,
                this.realm === 'dcss' ? `GOD:${String(p.deity).slice(0, 7).padStart(7, ' ')}` : `$:  ${String(p.gold).padStart(7, ' ')}`,
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
        if (p.hasAmulet) statuses.push({ name: this.spec.goalBadge || 'Amulet', attr: 14, val: 1 });
        if (this.realm === 'dcss' && p.deity) {
            statuses.push({ name: `${p.deity} (${'★'.repeat(Math.max(1, p.piety || 1))})`, attr: 14, val: p.piety || 1 });
        }
        if (this.realm === 'brogue') {
            statuses.push({ name: `Str ${p.str} • +${p.enchantments || 0} Ench`, attr: 11, val: p.str });
        }

        return {
            t: 'frame',
            realm: this.realm,
            seq: this.seq,
            phase: this.state.phase,
            ui: {
                overlay: isOverlay ? 3 : 0,
                awaiting_command: !isOverlay,
                more: false,
                context: isOverlay ? 'menu' : 'play',
                prompt: this.state.menuMode !== 'none' ? { kind: 'item', text: this.state.pendingPrompt || 'Inventory' } : null
            },
            player: {
                name: p.name,
                race: p.race,
                class: p.class,
                deity: p.deity,
                piety: p.piety,
                runes: p.runes || 0,
                lumenstones: p.lumenstones || 0,
                enchantments: p.enchantments || 0,
                nutrition: p.nutrition || 1000,
                branch: this.state.branchName,
                branch_name: this.state.branchName,
                place_label: `${this.state.branchName === 'D' ? 'Dungeon' : (this.state.branchName || 'Dungeon')}:${this.state.depth || 1}`,
                god: p.god || p.deity || 'No God',
                piety: p.piety || 0,
                runes: Array.isArray(p.runes) ? p.runes.length : (p.runes || 0),
                rune_list: Array.isArray(p.runes) ? p.runes : [],
                lumenstones: p.lumenstones || 0,
                nutrition: Math.min(100, Math.round((p.nutrition || 1000) / 10)),
                nutrition_max: 100,
                history: this.spec.lore || `Venturing through ${this.state.branchName}.`,
                y: p.y,
                x: p.x,
                depth: this.state.depth,
                max_depth: this.state.maxDepth,
                level: p.level,
                max_lev: p.level,
                exp: p.exp,
                exp_max: p.exp,
                exp_next: p.expNext,
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
                    int: { use: p.int, max: p.int, top: p.int, reduced: false },
                    wis: { use: p.wis, max: p.wis, top: p.wis, reduced: false },
                    dex: { use: p.dex, max: p.dex, top: p.dex, reduced: false },
                    con: { use: p.con, max: p.con, top: p.con, reduced: false }
                },
                statuses,
                equipment: p.inventory.filter(it => Boolean(it.equipped)).map((it, idx) => ({
                    slot: idx,
                    letter: it.letter,
                    slot_name: it.equipped,
                    mention: it.equipped === 'weapon' ? 'Wielding' : 'Wearing',
                    name: formatItemDesc(it),
                    tval: it.tval || 23,
                    sval: it.sval || 1,
                    number: it.count || 1,
                    weight: it.weight || 20,
                    vm: computeVerbMask(it),
                    attr: 1
                })),
                inventory: p.inventory.map((it) => ({
                    slot: it.slot,
                    label: it.letter,
                    letter: it.letter,
                    name: formatItemDesc(it),
                    tval: it.tval || 70,
                    sval: it.sval || 1,
                    number: it.count || 1,
                    weight: it.weight || 10,
                    vm: computeVerbMask(it),
                    attr: 1
                })),
                quiver: p.inventory.filter(it => it.kind === 'ranged' || it.kind === 'ammo').map((it, idx) => ({
                    slot: idx,
                    letter: it.letter,
                    name: formatItemDesc(it),
                    number: it.count || 1,
                    weight: it.weight || 5
                }))
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
                    captive: Boolean(m.captive)
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

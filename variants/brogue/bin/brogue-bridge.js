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
const RyodSystems = require('../../../server/src/cartridges/ryod-systems');

const BROGUE_SPEC = {
    realm: 'brogue',
    magic: 'SaveBROG',
    version: '1.14-ce-bridge',
    title: 'Brogue (Community Edition)',
    usesExpLevels: false,
    maxLevel: 0,
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
        { key: 'a', id: 'Rogue Delver', race: 'Human', align: 'Neutral', hp: 30, pw: 0, ac: 3, str: 12, int: 12, wis: 12, dex: 14, con: 14, weapon: { name: 'dagger', dmg: '1d6', bonus: 0, strReq: 10, weight: 15, tval: 23, sval: 2 }, armor: { name: 'leather armor', ac: 3, bonus: 0, strReq: 10, weight: 120, tval: 36, sval: 4 }, extra: { kind: 'scroll', name: 'scroll of enchanting', glyph: '?', enchantGain: 1, count: 2, weight: 5, tval: 70, sval: 15 } },
        { key: 'b', id: 'Staff Weaver', race: 'Human', align: 'Neutral', hp: 28, pw: 0, ac: 3, str: 12, int: 15, wis: 14, dex: 13, con: 13, weapon: { name: 'broadsword', dmg: '2d6', bonus: 1, strReq: 15, weight: 40, tval: 23, sval: 14 }, armor: { name: 'scale mail', ac: 5, bonus: 0, strReq: 12, weight: 200, tval: 37, sval: 3 }, extra: { kind: 'wand', name: 'staff of lightning [4/4]', glyph: '\\', charges: 4, maxCharges: 4, count: 1, weight: 20, tval: 55, sval: 8 } },
        { key: 'c', id: 'Ally Liberator', race: 'Human', align: 'Lawful', hp: 32, pw: 0, ac: 4, str: 13, int: 12, wis: 14, dex: 14, con: 15, weapon: { name: 'war pike', dmg: '2d5', bonus: 1, strReq: 16, weight: 45, tval: 22, sval: 8 }, armor: { name: 'chain mail', ac: 6, bonus: 1, strReq: 14, weight: 240, tval: 37, sval: 4 }, extra: { kind: 'potion', name: 'potion of strength', glyph: '!', strengthGain: 2, count: 1, weight: 15, tval: 71, sval: 40 } }
    ],
    allies: [
        { name: 'monkey ally', glyph: 'm', hp: 18, dmg: 5, lore: 'Nimble liberated captive that darts into melee and learns monster traits.' },
        { name: 'ogre ally', glyph: 'O', hp: 42, dmg: 12, lore: 'Stalwart liberated ogre wielding a heavy club on your behalf.' },
        { name: 'dar blademaster ally', glyph: 'd', hp: 36, dmg: 11, lore: 'Blink-stepping elven swordmaster freed from dungeon chains.' },
        { name: 'naga ally', glyph: 'N', hp: 55, dmg: 15, lore: 'Serpentine guardian that cleaves multiple adjacent foes at once.' }
    ],
    monsters: [
        { name: 'kobold', glyph: 'k', attr: 4, minDepth: 1, hp: 8, ac: 25, dmg: 3, exp: 0, lore: 'Scrappy cavern scavenger of the shallow depths.' },
        { name: 'jackal', glyph: 'j', attr: 3, minDepth: 1, hp: 7, ac: 25, dmg: 3, exp: 0, lore: 'Hunts in swift packs through dim corridors.' },
        { name: 'goblin', glyph: 'g', attr: 3, minDepth: 1, hp: 12, ac: 30, dmg: 5, exp: 0, lore: 'Spear-wielding tribal ambusher.' },
        { name: 'bloated', glyph: 'b', attr: 13, minDepth: 2, hp: 10, ac: 0, dmg: 4, special: 'caustic_bloat', exp: 0, lore: 'Floating gas-filled creature that ruptures into caustic clouds when slain.' },
        { name: 'pink jelly', glyph: 'J', attr: 13, minDepth: 2, hp: 20, ac: 0, dmg: 5, special: 'split', exp: 0, lore: 'Amorphous ooze that divides when struck with steel.' },
        { name: 'vampire bat', glyph: 'v', attr: 8, minDepth: 3, hp: 14, ac: 65, dmg: 5, exp: 0, lore: 'Swooping predator whose bite drains life.' },
        { name: 'goblin mystic', glyph: 'g', attr: 11, minDepth: 3, hp: 14, ac: 30, dmg: 4, exp: 0, lore: 'Weaves shielding wards around nearby goblins.' },
        { name: 'acid mound', glyph: 'a', attr: 10, minDepth: 4, hp: 16, ac: 0, dmg: 6, special: 'corrode', exp: 0, lore: 'Corrosive slime that degrades weapons and armor on contact.' },
        { name: 'centipede', glyph: 'c', attr: 4, minDepth: 5, hp: 22, ac: 40, dmg: 8, exp: 0, lore: 'Venomous arthropod whose bite weakens strength.' },
        { name: 'ogre', glyph: 'O', attr: 3, minDepth: 6, hp: 38, ac: 30, dmg: 13, exp: 0, lore: 'Lumbering giant whose club strikes with crushing force.' },
        { name: 'flame turret', glyph: 'T', attr: 4, minDepth: 7, hp: 28, ac: 0, dmg: 11, exp: 0, lore: 'Wall-mounted crystalline emitter that launches bolts of fire.' },
        { name: 'wraith', glyph: 'W', attr: 8, minDepth: 9, hp: 44, ac: 80, dmg: 14, exp: 0, lore: 'Invisible phantom that reveals itself only when striking.' },
        { name: 'salamander', glyph: 's', attr: 4, minDepth: 10, hp: 48, ac: 40, dmg: 15, exp: 0, lore: 'Molten amphibian that leaves trails of searing fire across lava.' },
        { name: 'troll', glyph: 'T', attr: 10, minDepth: 12, hp: 62, ac: 45, dmg: 18, exp: 0, lore: 'Regenerating subterranean behemoth.' },
        { name: 'golem', glyph: 'G', attr: 15, minDepth: 16, hp: 90, ac: 55, dmg: 20, exp: 0, lore: 'Unstoppable stone automaton immune to fire and poison.' },
        { name: 'tentacle horror', glyph: 'H', attr: 13, minDepth: 20, hp: 105, ac: 75, dmg: 26, exp: 0, lore: 'Abyssal monstrosity of the deep lumenstone caverns.' },
        { name: 'dragon', glyph: 'D', attr: 4, minDepth: 23, hp: 135, ac: 80, dmg: 32, exp: 0, lore: 'Supreme apex predator of the deep caverns whose breath ignites the air.' }
    ],
    items: [
        { kind: 'potion', name: 'potion of life', glyph: '!', attr: 4, heal: 40, weight: 15, tval: 71, sval: 39 },
        { kind: 'potion', name: 'potion of strength', glyph: '!', attr: 14, strengthGain: 2, weight: 15, tval: 71, sval: 40 },
        { kind: 'potion', name: 'potion of darkness', glyph: '!', attr: 8, blindTurns: 18, weight: 15, tval: 71, sval: 7 },
        { kind: 'potion', name: 'potion of telepathy', glyph: '!', attr: 11, telepathyTurns: 35, grantsTelepathy: true, weight: 15, tval: 71, sval: 42 },
        { kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 11, enchantGain: 1, weight: 5, tval: 70, sval: 15 },
        { kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 11, weight: 5, tval: 70, sval: 12 },
        { kind: 'food', name: 'food ration', glyph: ':', attr: 3, nutrition: 950, weight: 20, tval: 80, sval: 1 },
        { kind: 'weapon', name: 'dagger', glyph: ')', attr: 11, dmg: '1d6', bonus: 0, strReq: 10, weight: 15, tval: 23, sval: 2 },
        { kind: 'weapon', name: 'spear', glyph: ')', attr: 11, dmg: '2d4', bonus: 0, strReq: 12, weight: 30, tval: 22, sval: 3 },
        { kind: 'weapon', name: 'mace', glyph: ')', attr: 11, dmg: '2d5', bonus: 0, strReq: 14, weight: 35, tval: 21, sval: 5 },
        { kind: 'weapon', name: 'broad sword', glyph: ')', attr: 11, dmg: '2d6', bonus: 0, strReq: 15, weight: 40, tval: 23, sval: 14 },
        { kind: 'weapon', name: 'war axe', glyph: ')', attr: 11, dmg: '2d8', bonus: 0, strReq: 17, weight: 55, tval: 22, sval: 10 },
        { kind: 'weapon', name: 'runic broadsword', glyph: ')', attr: 11, dmg: '2d6', bonus: 3, strReq: 15, weight: 40, tval: 23, sval: 14 },
        { kind: 'armor', name: 'leather armor', glyph: '[', attr: 3, ac: 3, bonus: 0, strReq: 10, weight: 120, tval: 36, sval: 4 },
        { kind: 'armor', name: 'scale mail', glyph: '[', attr: 15, ac: 5, bonus: 0, strReq: 12, weight: 200, tval: 37, sval: 3 },
        { kind: 'armor', name: 'chain mail', glyph: '[', attr: 15, ac: 6, bonus: 0, strReq: 14, weight: 240, tval: 37, sval: 4 },
        { kind: 'armor', name: 'banded mail', glyph: '[', attr: 15, ac: 7, bonus: 0, strReq: 16, weight: 280, tval: 37, sval: 9 },
        { kind: 'armor', name: 'splint mail', glyph: '[', attr: 15, ac: 8, bonus: 0, strReq: 18, weight: 300, tval: 37, sval: 8 },
        { kind: 'armor', name: 'splint mail of mutuality', glyph: '[', attr: 15, ac: 7, bonus: 2, strReq: 18, weight: 300, tval: 37, sval: 8 },
        { kind: 'armor', name: 'plate armor', glyph: '[', attr: 15, ac: 10, bonus: 0, strReq: 20, weight: 350, tval: 37, sval: 10 },
        { kind: 'wand', name: 'staff of firebolt [4/4]', glyph: '\\', attr: 4, charges: 4, maxCharges: 4, weight: 20, tval: 55, sval: 6 },
        { kind: 'wand', name: 'staff of tunneling [3/3]', glyph: '\\', attr: 3, charges: 3, maxCharges: 3, effect: 'tunneling', weight: 20, tval: 55, sval: 7 },
        { kind: 'wand', name: 'staff of entrancement [3/3]', glyph: '\\', attr: 13, charges: 3, maxCharges: 3, effect: 'entrancement', weight: 20, tval: 55, sval: 9 },
        { kind: 'lumenstone', name: 'glowing lumenstone', glyph: '*', attr: 14, weight: 5 }
    ]
};

const MINDLESS_RE = /jelly|mold|fungus|ooze|pudding|mound|vortex|light|golem|skeleton|zombie|turret/i;

class BrogueEngine extends UniversalCartridgeEngine {
    constructor(opts = {}) {
        const defaultSaveDir = path.resolve(__dirname, '../lib/save');
        super(BROGUE_SPEC, { saveDir: defaultSaveDir, user: 'Adventurer', ...opts });
    }

    initNewState(roleIdx = 0) {
        super.initNewState(roleIdx);
        const p = this.state.player;
        p.blind = 0;
        p.telepathy = false;
        p.esp = false;
        p.telepathyTurns = 0;
        p.rBlind = false;
        p.level = 0;
        p.exp = 0;
        p.expNext = 0;
        this.state.activeHazards = [];
        this.state.appearanceMap = RyodSystems.buildAppearanceMap(this.state.seed || Date.now());
        if (Array.isArray(p.inventory)) {
            for (const it of p.inventory) this._syncStaffCharges(it);
        }
    }

    loadSave() {
        const ok = super.loadSave();
        if (ok && this.state && this.state.player) {
            const p = this.state.player;
            p.blind = Number(p.blind || 0);
            p.telepathy = Boolean(p.telepathy || p.esp);
            p.esp = Boolean(p.esp || p.telepathy);
            if (!Array.isArray(this.state.activeHazards)) this.state.activeHazards = [];
            if (!this.state.appearanceMap) this.state.appearanceMap = RyodSystems.buildAppearanceMap(this.state.seed || 1);
            if (Array.isArray(p.inventory)) {
                for (const it of p.inventory) this._syncStaffCharges(it);
            }
        }
        return ok;
    }

    _syncStaffCharges(item) {
        if (!item || !/staff/i.test(item.name || '')) return;
        const m = String(item.name || '').match(/\[(\d+)\/(\d+)\]/);
        if (m) {
            if (typeof item.charges !== 'number') item.charges = parseInt(m[1], 10);
            if (typeof item.maxCharges !== 'number') item.maxCharges = parseInt(m[2], 10);
            item.name = item.name.replace(/\[\d+\/\d+\]/, `[${item.charges}/${item.maxCharges}]`);
        } else {
            item.maxCharges = item.maxCharges || item.charges || 4;
            if (typeof item.charges !== 'number') item.charges = item.maxCharges;
        }
    }

    generateLevel(depth) {
        super.generateLevel(depth);
        this.state.activeHazards = [];
        if (!this.state.appearanceMap) this.state.appearanceMap = RyodSystems.buildAppearanceMap(this.state.seed || depth || 1);
        const map = this.state.map;
        const p = this.state.player;
        if (Array.isArray(map)) {
            let hasVent = false;
            let hasCage = false;
            const floorCells = [];
            for (let y = 2; y < map.length - 2; y++) {
                for (let x = 2; x < map[y].length - 2; x++) {
                    const c = map[y][x];
                    if (c.feat === RyodSystems.FEAT.GAS_VENT) hasVent = true;
                    if (c.feat === RyodSystems.FEAT.CAGE) hasCage = true;
                    if (c.feat === RyodSystems.FEAT.FLOOR && !(x === p.x && y === p.y)) floorCells.push({ x, y });
                }
            }
            if (!hasVent && floorCells.length > 0) {
                const spot = floorCells[this.rand(floorCells.length)];
                map[spot.y][spot.x].feat = RyodSystems.FEAT.GAS_VENT;
                map[spot.y][spot.x].glyph = 'g';
                map[spot.y][spot.x].attr = 10;
            }
            if (!hasCage && floorCells.length > 2) {
                const spot = floorCells[this.rand(floorCells.length)];
                if (map[spot.y][spot.x].feat === RyodSystems.FEAT.FLOOR) {
                    map[spot.y][spot.x].feat = RyodSystems.FEAT.CAGE;
                    map[spot.y][spot.x].glyph = '#';
                    map[spot.y][spot.x].attr = 14;
                }
            }
        }
        for (const o of (this.state.objects || [])) {
            this._syncStaffCharges(o);
            if ((o.kind === 'potion' || o.kind === 'scroll') && !(this.state.identifiedTypes && this.state.identifiedTypes[o.name])) {
                o.identified = false;
            }
        }
    }

    interactContextualFeature() {
        const p = this.state.player;
        const map = this.state.map;
        if (Array.isArray(map)) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = p.x + dx, ny = p.y + dy;
                    if (!map[ny] || !map[ny][nx]) continue;
                    if (map[ny][nx].feat === RyodSystems.FEAT.CAGE) {
                        map[ny][nx].feat = RyodSystems.FEAT.FLOOR;
                        map[ny][nx].glyph = '.';
                        const allySpec = BROGUE_SPEC.allies[this.rand(BROGUE_SPEC.allies.length)];
                        const ally = {
                            id: `ally_${Date.now()}_${this.rand(999)}`,
                            name: allySpec.name,
                            race: allySpec.name,
                            glyph: allySpec.glyph,
                            attr: 10,
                            x: nx,
                            y: ny,
                            hp: allySpec.hp,
                            hpMax: allySpec.hp,
                            hp_max: allySpec.hp,
                            dmg: allySpec.dmg,
                            dmgDice: '2d5',
                            lore: allySpec.lore,
                            alive: true,
                            isAlly: true,
                            isPet: true,
                            kills: 0
                        };
                        this.state.monsters.push(ally);
                        this.addMessage(`You unlock the iron cage! A grateful ${allySpec.name} joins your expedition!`, 14);
                        this.advanceTurn();
                        return true;
                    }
                }
            }
        }
        return super.interactContextualFeature();
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
            (Array.isArray(p.inventory) && p.inventory.some(it => it.equipped && /telepathy|esp|clairvoyance/i.test(it.name || '')))
        );
    }

    applyVerbToItem(verb, item) {
        const p = this.state.player;
        if (item && (verb === 'quaff' || verb === 'read' || (verb === 'use' && (item.kind === 'potion' || item.kind === 'scroll')))) {
            this.state.identifiedTypes = this.state.identifiedTypes || {};
            this.state.identifiedTypes[item.name] = true;
            item.identified = true;
        }
        if (item && (verb === 'quaff' || (verb === 'use' && item.kind === 'potion'))) {
            const nm = String(item.name || '');
            if (item.blindTurns || /darkness|blindness/i.test(nm)) {
                if (!p.rBlind) {
                    p.blind = Math.max(p.blind || 0, (item.blindTurns || 18) + 1);
                    this.updateVisibility();
                    this.addMessage('A veil of darkness blinds you!', 6);
                } else {
                    this.addMessage('Darkness swirls harmlessly past your eyes.', 11);
                }
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
                this.advanceTurn();
                return;
            }
            if (item.grantsTelepathy || item.telepathyTurns || /telepathy|esp/i.test(nm)) {
                p.telepathy = true;
                p.esp = true;
                p.telepathyTurns = Math.max(p.telepathyTurns || 0, (item.telepathyTurns || 35) + 1);
                this.addMessage('You drink the potion of telepathy! Minds shimmer across the caverns!', 11);
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
                this.advanceTurn();
                return;
            }
            if (item.heal || /life|heal|purif/i.test(nm)) {
                if (p.blind > 0) {
                    p.blind = 0;
                    this.updateVisibility();
                    this.addMessage('The potion of life purges the darkness from your eyes!', 11);
                }
            }
        }
        const isDevice = item && (item.kind === 'wand' || item.kind === 'staff');
        if (item && (verb === 'zap' || (verb === 'use' && isDevice)) && /staff/i.test(item.name || '')) {
            this._syncStaffCharges(item);
            const nm = String(item.name || '');
            if (/tunnel/i.test(nm)) {
                if (item.charges <= 0) {
                    this.addMessage(`The ${item.name} has no charges left—wait for it to recharge.`, 12);
                    return;
                }
                item.charges--;
                this._syncStaffCharges(item);
                let carved = false;
                const map = this.state.map;
                outer: for (let dist = 1; dist <= 3; dist++) {
                    for (let dy = -dist; dy <= dist; dy++) {
                        for (let dx = -dist; dx <= dist; dx++) {
                            const tx = p.x + dx, ty = p.y + dy;
                            if (ty > 0 && ty < map.length - 1 && tx > 0 && tx < map[ty].length - 1 && map[ty][tx].feat === RyodSystems.FEAT.WALL) {
                                map[ty][tx].feat = RyodSystems.FEAT.FLOOR;
                                map[ty][tx].glyph = '.';
                                map[ty][tx].attr = 1;
                                carved = true;
                                break outer;
                            }
                        }
                    }
                }
                this.updateVisibility();
                this.addMessage(carved ? 'Your staff of tunneling blasts a smooth passage through solid rock!' : 'Stone dust sparkles harmlessly along the wall.', 14);
                this.advanceTurn();
                return;
            }
            if (/entran/i.test(nm)) {
                if (item.charges <= 0) {
                    this.addMessage(`The ${item.name} has no charges left—wait for it to recharge.`, 12);
                    return;
                }
                item.charges--;
                this._syncStaffCharges(item);
                const foes = (this.state.monsters || []).filter(m => m.hp > 0 && !m.isPet && !m.isAlly && !m.peaceful && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
                foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
                if (foes[0]) {
                    foes[0].energy = -250;
                    foes[0].confused = 6;
                    this.addMessage(`Arcane tendrils seize the mind of ${foes[0].race}!`, 13);
                } else {
                    this.addMessage('The air shimmers with entrancing static.', 13);
                }
                this.advanceTurn();
                return;
            }
            if (/fire/i.test(nm)) {
                const target = (this.state.monsters || []).find(m => m.hp > 0 && !m.isPet && !m.isAlly && this.state.map[m.y] && this.state.map[m.y][m.x] && this.state.map[m.y][m.x].inView);
                const tx = target ? target.x : Math.min((this.state.map[0]?.length || 66) - 2, p.x + 1);
                const ty = target ? target.y : p.y;
                super.applyVerbToItem(verb, item);
                this._syncStaffCharges(item);
                RyodSystems.pushHazard(this.state, { x: tx, y: ty, type: 'wildfire', duration: 6 });
                RyodSystems.tickActiveHazards(this);
                return;
            }
        }
        super.applyVerbToItem(verb, item);
        if (item) this._syncStaffCharges(item);
    }

    handleMonsterKilled(mon) {
        const p = this.state.player;
        if (mon && (mon.special === 'caustic_bloat' || /bloat/i.test(mon.race || ''))) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const cx = mon.x + dx, cy = mon.y + dy;
                    if (this.state.map[cy] && this.state.map[cy][cx] && this.state.map[cy][cx].feat !== RyodSystems.FEAT.WALL) {
                        RyodSystems.pushHazard(this.state, { x: cx, y: cy, type: 'caustic_gas', duration: 5 });
                    }
                }
            }
            if (!p.rBlind && Math.hypot(mon.x - p.x, mon.y - p.y) <= 1.5) {
                p.blind = Math.max(p.blind || 0, 9);
                this.updateVisibility();
                this.addMessage('The bloated creature ruptures in blindness gas! A veil of darkness blinds you!', 13);
            } else {
                this.addMessage('The bloated creature bursts into a lingering cloud of caustic gas!', 10);
            }
        }
        if (mon) {
            const ally = (this.state.monsters || []).find(m => m.hp > 0 && (m.isPet || m.isAlly) && Math.hypot(m.x - mon.x, m.y - mon.y) <= 2.5);
            if (ally) RyodSystems.evolveAllyOnBattle(ally, this);
        }
        super.handleMonsterKilled(mon);
    }

    advanceTurn() {
        const p = this.state.player;
        const wasBlind = p.blind > 0;
        super.advanceTurn();
        if (p.dead) return;
        RyodSystems.tickActiveHazards(this);
        for (const h of (this.state.activeHazards || [])) {
            for (const m of (this.state.monsters || [])) {
                if (m.hp > 0 && !m.isPet && !m.isAlly && m.x === h.x && m.y === h.y) {
                    const dmg = h.type === 'wildfire' ? 4 : (h.type === 'caustic_gas' ? 2 : 0);
                    if (dmg > 0) {
                        m.hp -= dmg;
                        if (m.hp <= 0) this.handleMonsterKilled(m);
                    }
                }
            }
        }
        if (this.state.turn > 0 && this.state.turn % 8 === 0 && Array.isArray(p.inventory)) {
            for (const it of p.inventory) {
                if ((it.kind === 'wand' || it.kind === 'staff') && /staff/i.test(it.name || '')) {
                    this._syncStaffCharges(it);
                    if (it.charges < it.maxCharges) {
                        it.charges++;
                        this._syncStaffCharges(it);
                    }
                }
            }
        }
        if (wasBlind && p.blind > 0) {
            p.blind--;
            if (p.blind === 0) {
                this.updateVisibility();
                this.addMessage('You can see again.', 11);
            }
        }
        if (p.telepathyTurns > 0) {
            p.telepathyTurns--;
            if (p.telepathyTurns === 0 && !p.intrinsicTelepathy) {
                p.telepathy = false;
                p.esp = false;
                this.addMessage('Your telepathic vision fades.', 8);
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
        frame.player.level = 0;
        frame.player.exp = 0;
        frame.player.exp_next = 0;
        frame.hazards = (this.state.activeHazards || []).slice(0, 32).map(h => ({ x: h.x, y: h.y, type: h.type, duration: h.duration }));

        if (Array.isArray(frame.objects)) {
            frame.objects = frame.objects.map(o => ({ ...o, displayName: RyodSystems.getDisplayItemName(o, this.state) }));
        }
        if (frame.player && Array.isArray(frame.player.inventory)) {
            frame.player.inventory = frame.player.inventory.map(it => ({ ...it, displayName: RyodSystems.getDisplayItemName(it, this.state) }));
        }

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
            dmg: m.dmg != null ? m.dmg : 4,
            special: m.special || null,
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
        return frame;
    }
}

if (require.main === module) {
    runCartridgeMain(BrogueEngine, BROGUE_SPEC, path.resolve(__dirname, '../lib/save'));
}

module.exports = { BROGUE_SPEC, BrogueEngine };

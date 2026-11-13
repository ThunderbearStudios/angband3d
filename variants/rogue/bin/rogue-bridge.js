#!/usr/bin/env node
/**
 * variants/rogue/bin/rogue-bridge.js
 *
 * Playable Classic Rogue 5.4 (1980) Realm Engine for YASD 3D / Yendor Engine™.
 * Speaks the authoritative `-mbridge` JSON-over-stdio protocol via UniversalCartridgeEngine.
 */
'use strict';

const path = require('path');
const { UniversalCartridgeEngine, runCartridgeMain } = require('../../../server/src/cartridges/cartridge-core');

const ROGUE_SPEC = {
    realm: 'rogue',
    magic: 'SaveROGU',
    version: '5.4.4-bridge',
    title: 'Classic Rogue 5.4 (1980)',
    usesExpLevels: true,
    maxLevel: 21,
    // Authentic 1980 BSD Rogue 5.4 e_levels progression table (extern.c)
    expTable: [
        10, 20, 40, 80, 160, 320, 640, 1300, 2600, 5200,
        13000, 26000, 50000, 100000, 200000, 400000, 800000, 2000000, 4000000, 8000000
    ],
    onLevelGain(p, engine) {
        const hpGain = 1 + engine.rand(10); // Authentic BSD Rogue 1d10 hit point gain per rank
        p.hpMax += hpGain;
        p.hp = Math.min(p.hpMax, p.hp + hpGain);
        engine.addMessage(`Welcome to level ${p.level}! (+${hpGain} HP)`, 14);
    },
    defaultBranch: 'Dungeons of Doom',
    defaultDeity: 'The RNG Gods',
    goalDepth: 26,
    goalItemName: 'Amulet of Yendor',
    goalGlyph: ',',
    goalBadge: 'Amulet of Yendor',
    healingPotionName: 'potion of healing',
    foodName: 'food ration',
    welcomeMessage: 'Hello Adventurer, welcome to the Dungeons of Doom! Seek the Amulet of Yendor on Level 26.',
    lore: 'Descend 26 floors of the original 1980 Dungeons of Doom, evade the 26 classic A-Z monsters, and ascend with the Amulet of Yendor.',
    formatStatusLine(state) {
        const p = state.player;
        const hunger = (p.nutrition || 1000) < 300 ? '  Hungry' : '';
        return `Level: ${state.depth}  Gold: ${p.gold}      Hp: ${p.hp}(${p.hpMax})  Str: ${p.str}(${p.str})  Arm: ${p.ac}   Exp: ${p.level}/${p.exp}${hunger}`;
    },
    roles: [
        { key: 'a', id: 'Fighter', race: 'Human', align: 'Neutral', hp: 12, pw: 0, ac: 4, str: 16, int: 12, wis: 12, dex: 14, con: 15, weapon: { name: 'mace', dmg: '2d4', bonus: 1, weight: 30, tval: 21, sval: 5 }, armor: { name: 'ring mail', ac: 4, bonus: 1, weight: 250, tval: 37, sval: 2 }, extra: { kind: 'ranged', name: 'short bow', glyph: '}', dmg: '1d6', bonus: 1, count: 1, weight: 30, tval: 19, sval: 2 } },
        { key: 'b', id: 'Rogue Delver', race: 'Human', align: 'Chaotic', hp: 12, pw: 0, ac: 5, str: 16, int: 14, wis: 11, dex: 16, con: 14, weapon: { name: 'two-handed sword', dmg: '3d6', bonus: 1, weight: 60, tval: 23, sval: 25 }, armor: { name: 'studded leather armor', ac: 5, bonus: 1, weight: 180, tval: 36, sval: 5 }, extra: { kind: 'wand', name: 'staff of striking', glyph: '/', charges: 6, count: 1, weight: 25, tval: 55, sval: 4 } },
        { key: 'c', id: 'Archivist', race: 'Elf', align: 'Lawful', hp: 11, pw: 0, ac: 4, str: 15, int: 16, wis: 15, dex: 15, con: 13, weapon: { name: 'long sword', dmg: '1d10', bonus: 1, weight: 40, tval: 23, sval: 12 }, armor: { name: 'scale mail', ac: 4, bonus: 1, weight: 220, tval: 37, sval: 3 }, extra: { kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', count: 2, weight: 5, tval: 70, sval: 12 } }
    ],
    // All 26 classic A-Z Rogue 5.4 monsters
    monsters: [
        { name: 'bat', glyph: 'B', attr: 3, minDepth: 1, hp: 5, ac: 3, dmg: 2, exp: 2, lore: 'Flits erratically through the upper corridors.' },
        { name: 'emu', glyph: 'E', attr: 3, minDepth: 1, hp: 6, ac: 7, dmg: 3, exp: 3, lore: 'An aggressive subterranean flightless bird from 1980 BSD Rogue.' },
        { name: 'hobgoblin', glyph: 'H', attr: 3, minDepth: 1, hp: 8, ac: 5, dmg: 4, exp: 4, lore: 'Brutal dungeon guard armed with a jagged club.' },
        { name: 'kestrel', glyph: 'K', attr: 14, minDepth: 1, hp: 6, ac: 7, dmg: 3, exp: 2, lore: 'Swift subterranean raptor with razor talons.' },
        { name: 'snake', glyph: 'S', attr: 10, minDepth: 1, hp: 6, ac: 5, dmg: 3, exp: 3, lore: 'Slithers silently along the cold flagstone floor.' },
        { name: 'ice monster', glyph: 'I', attr: 11, minDepth: 2, hp: 9, ac: 9, dmg: 3, exp: 6, lore: 'Radiates numbing frost that freezes unwary delvers.' },
        { name: 'rattlesnake', glyph: 'R', attr: 4, minDepth: 2, hp: 11, ac: 3, dmg: 5, exp: 9, lore: 'Venomous fangs sap a warrior’s strength.' },
        { name: 'orc', glyph: 'O', attr: 10, minDepth: 3, hp: 13, ac: 6, dmg: 6, exp: 10, lore: 'Greedy cavern raider drawn to the scent of gold.' },
        { name: 'zombie', glyph: 'Z', attr: 8, minDepth: 3, hp: 15, ac: 8, dmg: 6, exp: 12, lore: 'Shambling corpse of a fallen adventurer.' },
        { name: 'leprechaun', glyph: 'L', attr: 10, minDepth: 4, hp: 14, ac: 8, dmg: 4, exp: 15, lore: 'Nimble trickster notorious for snatching purses of gold.' },
        { name: 'centaur', glyph: 'C', attr: 3, minDepth: 5, hp: 20, ac: 4, dmg: 8, exp: 22, lore: 'Galloping half-horse marksman of the middle vaults.' },
        { name: 'aquator', glyph: 'A', attr: 11, minDepth: 6, hp: 24, ac: 2, dmg: 7, exp: 28, lore: 'Corrosive rust-demon whose touch oxidizes iron armor.' },
        { name: 'nymph', glyph: 'N', attr: 13, minDepth: 6, hp: 22, ac: 9, dmg: 5, exp: 30, lore: 'Beguiling spirit who vanishes with enchanted gear.' },
        { name: 'quagga', glyph: 'Q', attr: 14, minDepth: 7, hp: 26, ac: 3, dmg: 10, exp: 35, lore: 'Striped subterranean beast with vicious hooves.' },
        { name: 'venus flytrap', glyph: 'F', attr: 10, minDepth: 8, hp: 32, ac: 3, dmg: 11, exp: 50, lore: 'Carnivorous dungeon flora that lashes out with crushing vines.' },
        { name: 'troll', glyph: 'T', attr: 10, minDepth: 9, hp: 40, ac: 4, dmg: 14, exp: 80, lore: 'Towering brute whose wounds rapidly knit back together.' },
        { name: 'wraith', glyph: 'W', attr: 8, minDepth: 10, hp: 38, ac: 4, dmg: 13, exp: 75, lore: 'Spectral horror whose chill touch drains life experience.' },
        { name: 'xeroc', glyph: 'X', attr: 14, minDepth: 11, hp: 44, ac: 7, dmg: 15, exp: 95, lore: 'Shape-shifting mimic disguised as dungeon treasure.' },
        { name: 'yeti', glyph: 'Y', attr: 15, minDepth: 12, hp: 48, ac: 6, dmg: 16, exp: 110, lore: 'Fierce frost-ape of the deep caverns.' },
        { name: 'griffin', glyph: 'G', attr: 14, minDepth: 14, hp: 56, ac: 2, dmg: 18, exp: 160, lore: 'Majestic lion-eagle apex predator of the lower halls.' },
        { name: 'medusa', glyph: 'M', attr: 10, minDepth: 16, hp: 62, ac: 2, dmg: 20, exp: 210, lore: 'Gorgon whose terrifying gaze confounds the mind.' },
        { name: 'phantom', glyph: 'P', attr: 13, minDepth: 17, hp: 64, ac: 3, dmg: 19, exp: 220, lore: 'Unseen stalker shimmering at the edge of torchlight.' },
        { name: 'black unicorn', glyph: 'U', attr: 8, minDepth: 18, hp: 70, ac: -2, dmg: 22, exp: 260, lore: 'Dread steed of shadow with an obsidian horn.' },
        { name: 'vampire', glyph: 'V', attr: 4, minDepth: 20, hp: 78, ac: 1, dmg: 24, exp: 350, lore: 'Ancient night-lord who feasts upon mortal vitality.' },
        { name: 'jabberwock', glyph: 'J', attr: 13, minDepth: 22, hp: 88, ac: 6, dmg: 28, exp: 500, lore: 'With eyes of flame and jaws that bite, the terror of deep Rogue.' },
        { name: 'dragon', glyph: 'D', attr: 4, minDepth: 24, hp: 110, ac: -1, dmg: 32, exp: 800, lore: 'Ancient fire-breathing wyrm guarding the Amulet of Yendor.' }
    ],
    items: [
        { kind: 'gold', name: 'pile of gold pieces', glyph: '*', attr: 14, amount: 35, weight: 2 },
        { kind: 'potion', name: 'potion of extra healing', glyph: '!', attr: 4, heal: 28, weight: 15, tval: 71, sval: 39 },
        { kind: 'potion', name: 'potion of gain strength', glyph: '!', attr: 14, strengthGain: 1, weight: 15, tval: 71, sval: 40 },
        { kind: 'potion', name: 'potion of raise level', glyph: '!', attr: 11, levelGain: 1, weight: 15, tval: 71, sval: 41 },
        { kind: 'potion', name: 'potion of blindness', glyph: '!', attr: 8, blindTurns: 20, weight: 15, tval: 71, sval: 7 },
        { kind: 'potion', name: 'potion of monster detection', glyph: '!', attr: 11, telepathyTurns: 40, grantsTelepathy: true, weight: 15, tval: 71, sval: 42 },
        { kind: 'scroll', name: 'scroll of enchant weapon', glyph: '?', attr: 11, enchantGain: 1, weight: 5, tval: 70, sval: 15 },
        { kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 11, weight: 5, tval: 70, sval: 12 },
        { kind: 'food', name: 'food ration', glyph: ':', attr: 3, nutrition: 850, weight: 20, tval: 80, sval: 1 },
        { kind: 'weapon', name: 'long sword', glyph: ')', attr: 11, bonus: 2, weight: 40, tval: 23, sval: 12 },
        { kind: 'armor', name: 'plate mail', glyph: '[', attr: 15, ac: 3, bonus: 2, weight: 350, tval: 37, sval: 10 },
        { kind: 'wand', name: 'wand of lightning', glyph: '/', attr: 14, charges: 6, weight: 15, tval: 65, sval: 8 }
    ]
};

const MINDLESS_RE = /jelly|mold|fungus|ooze|pudding|vortex|light|golem|skeleton|zombie|flytrap/i;

class RogueEngine extends UniversalCartridgeEngine {
    constructor(opts = {}) {
        const defaultSaveDir = path.resolve(__dirname, '../lib/save');
        super(ROGUE_SPEC, { saveDir: defaultSaveDir, user: 'Adventurer', ...opts });
    }

    initNewState(roleIdx = 0) {
        super.initNewState(roleIdx);
        const p = this.state.player;
        p.blind = 0;
        p.telepathy = false;
        p.esp = false;
        p.telepathyTurns = 0;
        p.rBlind = false;
    }

    loadSave() {
        const ok = super.loadSave();
        if (ok && this.state && this.state.player) {
            const p = this.state.player;
            p.blind = Number(p.blind || 0);
            p.telepathy = Boolean(p.telepathy || p.esp);
            p.esp = Boolean(p.esp || p.telepathy);
        }
        return ok;
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
            (Array.isArray(p.inventory) && p.inventory.some(it => it.equipped && /telepathy|esp|detection/i.test(it.name || '')))
        );
    }

    applyVerbToItem(verb, item) {
        const p = this.state.player;
        if (item && (verb === 'quaff' || (verb === 'use' && item.kind === 'potion'))) {
            const nm = String(item.name || '');
            if (item.blindTurns || /blindness|darkness/i.test(nm)) {
                if (!p.rBlind) {
                    p.blind = Math.max(p.blind || 0, (item.blindTurns || 20) + 1);
                    this.updateVisibility();
                    this.addMessage('A cloak of darkness falls around you!', 6);
                } else {
                    this.addMessage('A momentary shadow passes over your eyes.', 11);
                }
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
                this.advanceTurn();
                return;
            }
            if (item.grantsTelepathy || item.telepathyTurns || /monster detection|telepathy|esp/i.test(nm)) {
                p.telepathy = true;
                p.esp = true;
                p.telepathyTurns = Math.max(p.telepathyTurns || 0, (item.telepathyTurns || 40) + 1);
                this.addMessage('You sense the presence of monsters on this level!', 11);
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
                this.advanceTurn();
                return;
            }
            if (item.heal || /healing|extra healing/i.test(nm)) {
                if (p.blind > 0) {
                    p.blind = 0;
                    this.updateVisibility();
                    this.addMessage('The cloak of darkness lifts from your eyes!', 11);
                }
            }
        }
        super.applyVerbToItem(verb, item);
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
                this.addMessage('The veil of darkness lifts. You can see again.', 11);
            }
        }
        if (p.telepathyTurns > 0) {
            p.telepathyTurns--;
            if (p.telepathyTurns === 0 && !p.intrinsicTelepathy) {
                p.telepathy = false;
                p.esp = false;
                this.addMessage('You no longer sense distant monsters.', 8);
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
    const engine = new RogueEngine({ user: user.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'Adventurer', saveDir, isNew, customBirth, randomBirth });
    const writeJson = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
    writeJson({ t: 'hello', protocol: 1, protocol_minor: 2, version: ROGUE_SPEC.version, realm: ROGUE_SPEC.realm, savefile: engine.saveFile });
    writeJson({ t: 'commands', realm: ROGUE_SPEC.realm, verbBits: ['quaff', 'read', 'eat', 'aim', 'use_staff', 'zap', 'activate', 'fire', 'throw', 'wield', 'takeoff', 'drop', 'inscribe', 'uninscribe', 'refill', 'browse', 'study', 'cast', 'ignore', 'examine'] });
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

module.exports = { ROGUE_SPEC, RogueEngine };

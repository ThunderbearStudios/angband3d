#!/usr/bin/env node
/**
 * variants/ryod/bin/ryod-bridge.js
 *
 * Playable RYOD ("Roll Your Own Dungeon") Realm Engine for YASD 3D / Yendor Engine™.
 * Synthesizes a 100% coherent, asset-validated cross-realm dungeon from a RYOD Blueprint
 * (`.ryod.json`) or self-hydrates directly from an existing `SaveRYOD` `.sav` file.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { UniversalCartridgeEngine, runCartridgeMain } = require('../../../server/src/cartridges/cartridge-core');
const RyodCompiler = require('../../../server/src/cartridges/ryod-compiler');
const RyodSystems = require('../../../server/src/cartridges/ryod-systems');

function resolveInitialBlueprint(saveDir, user, explicitBlueprint = null, seed = null) {
    if (explicitBlueprint && typeof explicitBlueprint === 'object') {
        const bp = RyodCompiler.normalizeConfig(explicitBlueprint);
        if (seed && !bp.seed) bp.seed = seed;
        return bp;
    }
    if (process.env.RYOD_CONFIG_JSON) {
        try {
            const envBp = JSON.parse(process.env.RYOD_CONFIG_JSON);
            if (envBp && typeof envBp === 'object') {
                const bp = RyodCompiler.normalizeConfig(envBp);
                if (seed && !bp.seed) bp.seed = seed;
                return bp;
            }
        } catch (_) {}
    }
    const cleanUser = String(user || 'Adventurer').replace(/\.sav$/i, '');
    if (saveDir && cleanUser) {
        const bpFile = path.join(saveDir, `${cleanUser}.ryod.json`);
        if (fs.existsSync(bpFile)) {
            try {
                const raw = JSON.parse(fs.readFileSync(bpFile, 'utf8'));
                const bp = RyodCompiler.normalizeConfig(raw);
                if (seed && !bp.seed) bp.seed = seed;
                return bp;
            } catch (_) {}
        }
        // Check if an existing SaveRYOD .sav file has an embedded blueprint
        const savCandidates = [
            path.join(saveDir, `${cleanUser}.sav`),
            path.join(saveDir, cleanUser),
            path.join(saveDir, `${cleanUser}.sav.living.sav`)
        ];
        for (const savPath of savCandidates) {
            if (fs.existsSync(savPath)) {
                try {
                    const buf = fs.readFileSync(savPath);
                    if (buf.length >= 36 && buf.toString('ascii', 0, 8) === 'SaveRYOD') {
                        const descSize = buf.readUInt32LE(28);
                        const state = JSON.parse(buf.toString('utf8', 36 + descSize));
                        if (state && state.ryodBlueprint) {
                            const bp = RyodCompiler.normalizeConfig(state.ryodBlueprint);
                            if (seed && !bp.seed) bp.seed = seed;
                            return bp;
                        }
                    }
                } catch (_) {}
            }
        }
    }
    const rolled = RyodCompiler.rollCoherentBlueprint();
    if (seed && !rolled.seed) rolled.seed = seed;
    return rolled;
}

function injectRyodSensoryItems(spec) {
    if (!spec) return spec;
    if (!Array.isArray(spec.items)) spec.items = [];
    if (!spec.items.some(it => /blindness|darkness/i.test(it.name || ''))) {
        spec.items.push({ kind: 'potion', name: 'potion of shadow blindness', glyph: '!', attr: 8, blindTurns: 18, weight: 15, tval: 71, sval: 7 });
    }
    if (!spec.items.some(it => /telepathy|esp/i.test(it.name || ''))) {
        spec.items.push({ kind: 'potion', name: 'potion of telepathy', glyph: '!', attr: 11, telepathyTurns: 40, grantsTelepathy: true, weight: 15, tval: 71, sval: 42 });
        spec.items.push({ kind: 'amulet', name: 'amulet of telepathy', glyph: '"', attr: 11, flags: { esp: true, telepathy: true }, weight: 5, tval: 40, sval: 3 });
    }
    return spec;
}

function buildRyodSpec(blueprint) {
    const spec = injectRyodSensoryItems(RyodCompiler.compileEngineSpec(blueprint));
    spec.onBlueprintHydrate = (loadedBp) => {
        const hydrated = injectRyodSensoryItems(RyodCompiler.compileEngineSpec(loadedBp));
        hydrated.onBlueprintHydrate = spec.onBlueprintHydrate;
        return hydrated;
    };
    return spec;
}

const MINDLESS_RE = /jelly|mold|fungus|ooze|pudding|vortex|light|golem|skeleton|zombie|turret/i;

class RyodEngine extends UniversalCartridgeEngine {
    constructor(opts = {}) {
        const defaultSaveDir = path.resolve(__dirname, '../lib/save');
        const saveDir = opts.saveDir || defaultSaveDir;
        const user = opts.user || 'Adventurer';
        const bp = resolveInitialBlueprint(saveDir, user, opts.ryodBlueprint || opts.blueprint, opts.seed);
        if (opts.seed && !bp.seed) bp.seed = opts.seed;
        const spec = buildRyodSpec(bp);
        super(spec, { ...opts, saveDir, user, seed: bp.seed || opts.seed });
    }

    initNewState(roleIdx = 0) {
        super.initNewState(roleIdx);
        const p = this.state.player;
        p.blind = 0;
        p.telepathy = false;
        p.esp = false;
        p.telepathyTurns = 0;
        p.rBlind = false;
        if (this.spec.avatarId) {
            p.avatarId = this.spec.avatarId;
            p.isMonsterAvatar = Boolean(this.spec.isMonsterAvatar);
        }
    }

    loadSave() {
        const ok = super.loadSave();
        if (ok && this.state && this.state.player) {
            const p = this.state.player;
            p.blind = Number(p.blind || 0);
            p.telepathy = Boolean(p.telepathy || p.esp);
            p.esp = Boolean(p.esp || p.telepathy);
            if (this.spec.avatarId && !p.avatarId) {
                p.avatarId = this.spec.avatarId;
                p.isMonsterAvatar = Boolean(this.spec.isMonsterAvatar);
            }
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
            (Array.isArray(p.inventory) && p.inventory.some(it => it.equipped && ((it.flags && (it.flags.esp || it.flags.telepathy)) || /telepathy|esp/i.test(it.name || ''))))
        );
    }

    applyVerbToItem(verb, item) {
        const p = this.state.player;
        if (item && (verb === 'quaff' || (verb === 'use' && item.kind === 'potion'))) {
            const nm = String(item.name || '');
            if (item.blindTurns || /blindness|darkness/i.test(nm)) {
                if (!p.rBlind) {
                    p.blind = Math.max(p.blind || 0, (item.blindTurns || 18) + 1);
                    this.updateVisibility();
                    this.addMessage('Abyssal shadow-mist shrouds your eyes in darkness!', 6);
                } else {
                    this.addMessage('Your warded sight repels the shadow-mist.', 11);
                }
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
                this.advanceTurn();
                return;
            }
            if (item.grantsTelepathy || item.telepathyTurns || /telepathy|esp/i.test(nm)) {
                p.telepathy = true;
                p.esp = true;
                p.telepathyTurns = Math.max(p.telepathyTurns || 0, (item.telepathyTurns || 40) + 1);
                this.addMessage('Eldritch second sight awakens — monster minds pulse through the dark!', 11);
                item.count = (item.count || 1) - 1;
                this.reindexInventory();
                this.advanceTurn();
                return;
            }
            if (item.heal || /heal|curing|life|purif/i.test(nm)) {
                if (p.blind > 0) {
                    p.blind = 0;
                    this.updateVisibility();
                    this.addMessage('Your vision clears!', 11);
                }
            }
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

    moveOrAttack(dx, dy) {
        const p = this.state.player;
        const prevX = p.x, prevY = p.y;
        super.moveOrAttack(dx, dy);
        if (!p.dead && (p.x !== prevX || p.y !== prevY)) {
            const cell = this.state.map[p.y] && this.state.map[p.y][p.x];
            if (cell && (cell.feat === 45 || cell.feat === 16) && !p.rBlind && !p.blind && this.rand(100) < 40) {
                p.blind = 12;
                this.updateVisibility();
                this.addMessage('A shadow-ward trap erupts! Darkness blinds your eyes!', 6);
            }
        }
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
        frame.victory = Boolean(p.winner);
        frame.player.avatarId = p.avatarId || null;
        frame.player.isMonsterAvatar = Boolean(p.isMonsterAvatar);
        frame.player.activeSong = p.activeSong || null;
        frame.player.activeStance = p.activeStance || null;
        frame.player.blind = isBlind;
        frame.player.flags.esp = hasEsp;
        frame.player.flags.telepathy = hasEsp;
        frame.player.flags.rBlind = Boolean(p.rBlind || (frame.player.flags && frame.player.flags.rBlind));

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
    const argv = process.argv;
    let saveDir = defaultSaveDir, user = 'Adventurer', isNew = false, customBirth = false, randomBirth = false, seed = null;
    for (let i = 2; i < argv.length; i++) {
        const arg = String(argv[i] || '');
        if (arg === '-n') isNew = true;
        else if (arg === '-c' || arg === '--custom') customBirth = true;
        else if (arg === '-r' || arg === '--random') randomBirth = true;
        else if (arg === '-d' && argv[i + 1]) saveDir = argv[++i];
        else if (arg.startsWith('-dsave=')) saveDir = arg.slice(7);
        else if (arg.startsWith('-d=')) saveDir = arg.slice(3);
        else if (arg === '-u' && argv[i + 1]) user = argv[++i];
        else if (arg.startsWith('-u')) user = arg.slice(2) || user;
        else if ((arg === '-s' || arg === '--seed') && argv[i + 1]) seed = argv[++i];
        else if (arg.startsWith('--seed=')) seed = arg.slice(7);
    }
    const engine = new RyodEngine({ saveDir, user: user.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'Adventurer', isNew, customBirth, randomBirth, seed });
    const spec = engine.spec;
    const writeJson = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
    writeJson({ t: 'hello', protocol: 1, protocol_minor: 2, version: spec.version || '2.0.0-ryod', realm: spec.realm || 'ryod', savefile: engine.saveFile });
    writeJson({ t: 'commands', realm: spec.realm || 'ryod', verbBits: ['quaff', 'read', 'eat', 'aim', 'use_staff', 'zap', 'activate', 'fire', 'throw', 'wield', 'takeoff', 'drop', 'inscribe', 'uninscribe', 'refill', 'browse', 'study', 'cast', 'ignore', 'examine'] });
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

const DEFAULT_RYOD_SPEC = buildRyodSpec(RyodCompiler.normalizeConfig({ archetypeId: 'obsidian_covenant' }));

module.exports = { DEFAULT_RYOD_SPEC, RyodEngine, buildRyodSpec, resolveInitialBlueprint, RyodCompiler, RyodSystems };

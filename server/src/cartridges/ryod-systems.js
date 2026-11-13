/**
 * server/src/cartridges/ryod-systems.js
 *
 * Deterministic RYOD 2.0 ("The Chimera Forge") Signature Systems:
 * - Deterministic PRNG: parseSeed (RYOD-XXXXXXXX hex/FNV-1a), mixSeed, mulberry32
 * - Seed-randomized item appearances (Potions, Scrolls, Wands)
 * - Discipline-gated systems: Sil-Q Woven Songs + Mithril Smithing (FEAT.ANVIL 46)
 * - Hengband Martial Stances (Genbu/Byakko/Seiryu/Suzaku) + Wanted Floor Bounties
 * - DCSS 6-Deity Pantheon (Trog, Okawaru, Sif Muna, Yredelemnul, Vehumet, Xom)
 * - Brogue Bounded Living Hazards (<=32 O(1) ticks) + Evolving Captive Allies
 * - NetHack BUC Beatitude + Altar/Fountain interactions
 * - FCB Playable Creature Avatars (Dragon, Beholder, Lich, Vampire, Golem, Minotaur)
 * - Stamped ASCII Micro-Vaults (Mithril Forge, Shrine, Menagerie, Crucible, Vault, Hoard)
 * - Rogue Relic Ascent Pursuit (Apex Relic Hunters on DL ascent)
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RyodSystems = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const FEAT = Object.freeze({
        NONE: 0, FLOOR: 1, CLOSED_DOOR: 2, OPEN_DOOR: 3, UP_STAIR: 5, DOWN_STAIR: 6,
        WALL: 21, PERM_WALL: 22, LAVA: 23, GRASS: 26, WATER: 28, CHASM: 41,
        ALTAR: 43, FOUNTAIN: 44, TRAP: 45, ANVIL: 46, CAGE: 47, GAS_VENT: 48, RUNE_VAULT: 49
    });

    function log(engine, msg, attr = 11) {
        if (!engine) return;
        if (typeof engine.addMessage === 'function') engine.addMessage(msg, attr);
        else if (typeof engine.logMsg === 'function') log(engine, msg, attr);
    }

    function parseSeed(raw) {
        if (typeof raw === 'number' && !isNaN(raw)) return (raw >>> 0) || 0x59415344;
        const str = String(raw || '').trim();
        if (!str) return 0x59415344;
        const hexMatch = str.match(/^RYOD-([0-9a-fA-F]{1,8})$/i);
        if (hexMatch) return (parseInt(hexMatch[1], 16) >>> 0) || 0x59415344;
        if (/^\d+$/.test(str)) return (Number(str) >>> 0) || 0x59415344;
        let h = 0x811c9dc5 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return (h >>> 0) || 0x59415344;
    }

    function mixSeed(seed, salt) {
        const s = (Number(seed) >>> 0) || 0x59415344;
        const d = (Number(salt) >>> 0) || 0;
        let h = (s ^ Math.imul(d, 0x9E3779B9)) >>> 0;
        h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
        return ((h ^ (h >>> 16)) >>> 0) || 0x59415344;
    }

    function mulberry32(seed) {
        let s = (Number(seed) >>> 0) || 0x59415344;
        return function next() {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const POTION_APPEARANCES = ['ruby potion', 'emerald potion', 'sapphire potion', 'golden potion', 'milky potion', 'smoky potion', 'bubbling potion', 'viscous potion', 'effervescent potion', 'murky potion', 'cerulean potion', 'amber potion', 'violet potion', 'silver potion'];
    const SCROLL_APPEARANCES = ['scroll titled READ ME', 'scroll titled ZEMO', 'scroll titled FOOBAR', 'scroll titled ELBERETH', 'scroll titled XYZZY', 'scroll titled TEMPLE', 'scroll titled KLAATU', 'scroll titled BARADA', 'scroll titled NIKTO', 'scroll titled DAI SHI', 'scroll titled YENDOR', 'scroll titled PRATYAHARA'];
    const WAND_APPEARANCES = ['oak wand', 'ebony wand', 'willow wand', 'bone wand', 'copper wand', 'silver wand', 'crystal wand', 'iron wand', 'glass wand', 'brass wand', 'yew wand', 'leaden wand'];

    function shuffle(arr, rng) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function buildAppearanceMap(seed) {
        const rng = mulberry32(seed);
        return {
            potions: shuffle(POTION_APPEARANCES, rng),
            scrolls: shuffle(SCROLL_APPEARANCES, rng),
            wands: shuffle(WAND_APPEARANCES, rng),
            nameToAppearance: {},
            appearanceToName: {}
        };
    }

    function getDisplayItemName(item, state) {
        if (!item || !item.name) return 'nothing';
        const appMap = state && state.appearanceMap;
        const idTypes = (state && state.identifiedTypes) || {};
        if (!appMap || item.identified || idTypes[item.name]) return item.name;
        const kind = String(item.kind || '').toLowerCase();
        if (kind !== 'potion' && kind !== 'scroll' && kind !== 'wand') return item.name;
        if (!appMap.nameToAppearance[item.name]) {
            let pool = kind === 'potion' ? appMap.potions : (kind === 'scroll' ? appMap.scrolls : appMap.wands);
            const idx = Object.keys(appMap.nameToAppearance).filter(k => k.startsWith(kind)).length % pool.length;
            const app = pool[idx];
            appMap.nameToAppearance[item.name] = app;
            appMap.appearanceToName[app] = item.name;
        }
        return appMap.nameToAppearance[item.name] || item.name;
    }

    const SONGS = {
        sharpness: { id: 'sharpness', name: 'Song of Sharpness', desc: '+4 Crit Penetration', pwCost: 1 },
        silence: { id: 'silence', name: 'Song of Silence', desc: '+Stealth / muffled footsteps', pwCost: 1 },
        staying: { id: 'staying', name: 'Song of Staying', desc: '+4 AC & physical fortitude', pwCost: 1 },
        slaying: { id: 'slaying', name: 'Song of Slaying', desc: '+4 Melee and Ranged damage', pwCost: 1 }
    };

    const STANCES = {
        genbu: { id: 'genbu', name: 'Stance of Genbu (Black Tortoise)', desc: '+8 Armor Class, stalwart guard', acBonus: 8, dmgMul: 1.0 },
        byakko: { id: 'byakko', name: 'Stance of Byakko (White Tiger)', desc: '+50% Attack Damage, -3 AC ferocity', acBonus: -3, dmgMul: 1.5 },
        seiryu: { id: 'seiryu', name: 'Stance of Seiryu (Azure Dragon)', desc: '+Shock/Frost brand on strikes', elementalBrand: true, acBonus: 0, dmgMul: 1.0 },
        suzaku: { id: 'suzaku', name: 'Stance of Suzaku (Vermilion Bird)', desc: 'Chasm/Lava safety & swiftness', chasmSafe: true, acBonus: 2, dmgMul: 1.0 }
    };

    const DEITIES = {
        Trog: { name: 'Trog', title: 'The Wrathful', power: 'Berserk Rage', cost: 2, desc: 'Restore 20 HP and enter battle frenzy.' },
        Okawaru: { name: 'Okawaru', title: 'Iron Warrior', power: 'Heroism Boon', cost: 2, desc: 'Grant +4 all combat attributes.' },
        'Sif Muna': { name: 'Sif Muna', title: 'Keeper of Secrets', power: 'Divine Channeling', cost: 2, desc: 'Restore 24 Power points instantly.' },
        Yredelemnul: { name: 'Yredelemnul', title: 'The Shadowed', power: 'Animate Dead', cost: 2, desc: 'Raise a loyal shadow thrall.' },
        Vehumet: { name: 'Vehumet', title: 'Lord of Chaos Fire', power: 'Destructive Burst', cost: 3, desc: 'Sear all visible foes for 25 damage.' },
        Xom: { name: 'Xom', title: 'The Unpredictable', power: 'Chaos Dice', cost: 1, desc: 'Unleash wild random boon or hazard!' }
    };

    const AVATARS = {
        dragon: { id: 'dragon', originId: 'red_dragon', label: 'Red Dragon Wyrmling', avatarMonsterName: 'red dragon', isMonsterAvatar: true, ringSlots: 2, allowBodyArmor: true, intrinsicLevitation: true, stages: ['Wyrmling', 'Young Wyrm', 'Adult Wyrm', 'Ancient Wyrm'], breathName: 'Searing Dragon Breath', breathCost: 3, breathDmg: 26 },
        beholder: { id: 'beholder', originId: 'beholder', label: 'Eldritch Beholder Eye', avatarMonsterName: 'floating eye', isMonsterAvatar: true, ringSlots: 6, allowBodyArmor: false, intrinsicLevitation: true, gazePowers: ['Antimagic Ray', 'Sleep Ray', 'Disintegration Ray'], breathName: 'Disintegration Ray', breathCost: 2, breathDmg: 22 },
        lich: { id: 'lich', originId: 'arch_lich', label: 'Arch-Lich Initiate', avatarMonsterName: 'arch-lich', isMonsterAvatar: true, ringSlots: 2, allowBodyArmor: true, intrinsicLevitation: false, phylacteryAbsorption: 0.5, drainName: 'Abyssal Soul Drain', drainCost: 3, drainDmg: 24, drainHeal: 10 },
        vampire: { id: 'vampire', originId: 'vampire_scion', label: 'Vampire Scion', avatarMonsterName: 'vampire lord', isMonsterAvatar: true, ringSlots: 2, allowBodyArmor: true, intrinsicLevitation: false, leechRatio: 0.25, blinkName: 'Bat-Step Shadow Blink', blinkCost: 2 },
        golem: { id: 'golem', originId: 'iron_golem', label: 'Iron Golem Juggernaut', avatarMonsterName: 'iron golem', isMonsterAvatar: true, ringSlots: 2, allowBodyArmor: true, intrinsicLevitation: false, slamName: 'Seismic Ground Slam', slamCost: 2, slamDmg: 22 },
        minotaur: { id: 'minotaur', originId: 'minotaur', label: 'Minotaur Berserker', avatarMonsterName: 'minotaur', isMonsterAvatar: true, ringSlots: 2, allowBodyArmor: true, intrinsicLevitation: false, chargeName: 'Labyrinth Gore Charge', chargeCost: 2, chargeDmg: 24 }
    };

    function resolveActiveSystems(bp = {}) {
        const chaos = Boolean(bp.chimeraChaos || bp.presetId === 'true_chimera_chaos');
        const disc = bp.powerDiscipline || bp.resolvedDiscipline || 'auto';
        const preset = bp.presetId || '';
        return {
            mithrilSmithing: chaos || Boolean(bp.mithrilSmithing) || disc === 'martial' || preset === 'first_age_anvil',
            wovenSongs: chaos || Boolean(bp.wovenSongs) || disc === 'martial' || preset === 'first_age_anvil',
            martialStances: chaos || Boolean(bp.martialStances) || preset === 'bushido_bounty_tower',
            wantedBounties: chaos || Boolean(bp.wantedBounties) || preset === 'bushido_bounty_tower',
            pantheonDeities: chaos || Boolean(bp.pantheonAltars) || Boolean(bp.pantheonDeities) || disc === 'piety' || preset === 'pantheon_gauntlet',
            livingPhysics: chaos || Boolean(bp.livingPhysics) || preset === 'luminous_crucible' || preset === 'mazes_of_alchemy',
            evolvingAllies: chaos || Boolean(bp.captiveAllies) || Boolean(bp.evolvingAllies) || preset === 'luminous_crucible',
            nethackBuc: chaos || Boolean(bp.beatitude) || preset === 'mazes_of_alchemy',
            stampedVaults: chaos || bp.stampedVaults !== false,
            relicAscent: bp.victoryMode === 'relic_ascent' || preset === 'yendor_relic_ascent'
        };
    }

    function toggleSong(engine, songId) {
        const p = engine.state.player;
        if (p.activeSong === songId) {
            p.activeSong = null;
            log(engine, `You quiet your voice; the song ends.`);
            return true;
        }
        if (!SONGS[songId]) return false;
        if (p.pw < 1) {
            log(engine, `You lack the power to sustain a song.`);
            return false;
        }
        p.activeSong = songId;
        log(engine, `You begin singing the ${SONGS[songId].name}.`);
        return true;
    }

    function toggleStance(engine, stanceId) {
        const p = engine.state.player;
        if (p.activeStance === stanceId) {
            p.activeStance = null;
            log(engine, `You drop your martial stance.`);
            return true;
        }
        if (!STANCES[stanceId]) return false;
        p.activeStance = stanceId;
        log(engine, `You assume the ${STANCES[stanceId].name}!`);
        return true;
    }

    function smithAtAnvil(engine, choiceIdx = 0) {
        const s = engine.state;
        const p = s.player;
        let nearAnvil = false;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = p.x + dx, ny = p.y + dy;
                if (nx >= 0 && nx < engine.MAP_W && ny >= 0 && ny < engine.MAP_H) {
                    if (s.map[ny][nx] === FEAT.ANVIL) nearAnvil = true;
                }
            }
        }
        if (!nearAnvil) {
            log(engine, `You must stand next to a Mithril Anvil to smith.`);
            return false;
        }
        const target = p.equipment && (p.equipment.weapon || p.equipment.body || p.inventory.find(i => i.kind === 'weapon' || i.kind === 'armor'));
        if (!target) {
            log(engine, `You have no weapon or armor to temper on the anvil.`);
            return false;
        }
        const brands = ['of Flame', 'of Frost', 'of Sharpness', 'of Protection', 'of Speed'];
        const chosen = brands[choiceIdx % brands.length];
        target.bonus = (target.bonus || 0) + 2;
        if (!target.name.includes(' of ')) target.name = `${target.name} ${chosen}`;
        log(engine, `With ringing hammer-blows, you temper ${target.name}! (+2)`);
        return true;
    }

    function assignFloorBounty(engine) {
        const monsters = engine.state.monsters || [];
        const candidates = monsters.filter(m => m.alive && !m.isBoss && !m.isAlly && !m.isWantedBounty);
        if (candidates.length === 0) return null;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        target.isWantedBounty = true;
        target.name = `[WANTED] ${target.name}`;
        target.bountyRewardGold = (engine.state.depth || 1) * 35 + 50;
        log(engine, `A Shogunate bounty notice is posted for ${target.name}!`);
        return target;
    }

    function onBountyKilled(engine, mon) {
        if (!mon || !mon.isWantedBounty) return;
        const p = engine.state.player;
        const gold = mon.bountyRewardGold || 75;
        p.gold = (p.gold || 0) + gold;
        p.inventory.push({ kind: 'scroll', name: 'scroll of enchanting', glyph: '?', enchantGain: 1, count: 1, weight: 5, tval: 70, sval: 15 });
        log(engine, `Bounty claimed! You receive ${gold} gold and a Scroll of Enchanting!`);
    }

    function recordKillPiety(engine, mon) {
        const p = engine.state.player;
        if (!p.deity) return;
        p.piety = Math.min(6, (p.piety || 0) + 1);
        if (p.piety >= 5 && !p.deityGiftGiven) {
            p.deityGiftGiven = true;
            const gift = { kind: 'weapon', name: `Blessed Blade of ${p.deity}`, dmg: '3d7', bonus: 3, beatitude: 'blessed', weight: 40, tval: 23, sval: 9 };
            p.inventory.push(gift);
            log(engine, `★ ${p.deity} is well pleased and bestows upon you ${gift.name}!`);
        }
    }

    function invokeDeityPower(engine) {
        const p = engine.state.player;
        if (!p.deity || !DEITIES[p.deity]) {
            log(engine, `You worship no deity in this realm.`);
            return false;
        }
        const god = DEITIES[p.deity];
        if ((p.piety || 0) < god.cost) {
            log(engine, `${god.name} demands more piety before granting ${god.power}. (Need ${god.cost}★, have ${p.piety || 0}★)`);
            return false;
        }
        p.piety -= god.cost;
        if (p.deity === 'Trog') {
            p.hp = Math.min(p.hpMax, p.hp + 20);
            p.str = (p.str || 15) + 3;
            log(engine, `Trog roars! Berserk vigor courses through your veins! (+20 HP, +3 STR)`);
        } else if (p.deity === 'Okawaru') {
            p.ac += 4; p.bonusDmg = (p.bonusDmg || 0) + 4;
            log(engine, `Okawaru grants martial perfection! (+4 AC, +4 Dmg)`);
        } else if (p.deity === 'Sif Muna') {
            p.pw = Math.min(p.pwMax, (p.pw || 0) + 24);
            log(engine, `Sif Muna channels boundless arcane energy into your core! (+24 PW)`);
        } else if (p.deity === 'Yredelemnul') {
            const thrall = { id: `thrall_${Date.now()}`, name: 'shadow thrall', glyph: 'Z', x: p.x, y: p.y, hp: 30, hpMax: 30, dmg: '2d6', alive: true, isAlly: true };
            engine.state.monsters.push(thrall);
            log(engine, `Yredelemnul binds a shadow thrall to serve you!`);
        } else if (p.deity === 'Vehumet') {
            (engine.state.monsters || []).filter(m => m.alive && !m.isAlly).forEach(m => {
                m.hp -= 25;
                if (m.hp <= 0) { m.alive = false; engine.onMonsterKilled(m); }
            });
            log(engine, `Vehumet unleashes an apocalyptic conflagration upon all foes!`);
        } else {
            p.hp = Math.min(p.hpMax, p.hp + 15);
            log(engine, `Xom cackles wildly! A rain of shimmering confetti heals you (+15 HP)!`);
        }
        return true;
    }

    function pushHazard(state, hazard) {
        if (!state.activeHazards) state.activeHazards = [];
        if (state.activeHazards.length >= 32) state.activeHazards.shift();
        state.activeHazards.push(hazard);
    }

    function tickActiveHazards(engine) {
        const s = engine.state;
        if (!s.activeHazards || s.activeHazards.length === 0) return;
        const p = s.player;
        const nextHazards = [];
        for (const h of s.activeHazards) {
            h.duration = (h.duration || 1) - 1;
            if (h.type === 'wildfire') {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = h.x + dx, ny = h.y + dy;
                        if (nx >= 0 && nx < engine.MAP_W && ny >= 0 && ny < engine.MAP_H && s.map[ny][nx] === FEAT.GAS_VENT) {
                            s.map[ny][nx] = FEAT.FLOOR;
                            log(engine, `The wildfire ignites a subterranean gas vent with a deafening blast!`);
                        }
                    }
                }
            }
            if (p.x === h.x && p.y === h.y) {
                if (h.type === 'caustic_gas') {
                    p.hp = Math.max(1, p.hp - 3);
                    log(engine, `Caustic fumes burn your lungs! (-3 HP)`);
                } else if (h.type === 'wildfire') {
                    p.hp = Math.max(1, p.hp - 6);
                    log(engine, `Raging wildfire scorches you! (-6 HP)`);
                } else if (h.type === 'confusion_gas') {
                    p.confused = Math.max(p.confused || 0, 4);
                    log(engine, `Choking confusion gas makes your head spin!`);
                }
            }
            if (h.duration > 0) nextHazards.push(h);
        }
        s.activeHazards = nextHazards.slice(0, 32);
    }

    function evolveAllyOnBattle(ally, engine) {
        if (!ally || !ally.isAlly) return;
        ally.kills = (ally.kills || 0) + 1;
        if (ally.kills === 2 && !ally.traits?.vampiric) {
            ally.traits = ally.traits || {}; ally.traits.vampiric = true;
            ally.name = `vampiric ${ally.name}`;
            log(engine, `Your ally drank deep of battle and gained the Vampiric trait!`);
        } else if (ally.kills === 4 && !ally.traits?.blinking) {
            ally.traits.blinking = true;
            ally.name = `shadow-blinking ${ally.name}`;
            log(engine, `Your ally mastered phase-stepping and gained the Blinking trait!`);
        } else if (ally.kills === 7 && !ally.traits?.flame) {
            ally.traits.flame = true;
            ally.name = `flame-crested ${ally.name}`;
            ally.hpMax += 15; ally.hp += 15;
            log(engine, `Your ally ascended into a Flame-Crested guardian! (+15 Max HP)`);
        }
    }

    function interactAltar(engine) {
        const p = engine.state.player;
        if (engine.state.map[p.y][p.x] !== FEAT.ALTAR) {
            log(engine, `There is no altar here.`);
            return false;
        }
        let uncursedCount = 0;
        for (const item of p.inventory) {
            if (item.beatitude === 'cursed') {
                item.beatitude = 'uncursed';
                uncursedCount++;
            }
        }
        log(engine, `You kneel at the consecrated altar. A soothing radiance lifts ${uncursedCount} curses from your pack.`);
        return true;
    }

    function interactFountain(engine) {
        const p = engine.state.player;
        if (engine.state.map[p.y][p.x] !== FEAT.FOUNTAIN) {
            log(engine, `There is no fountain here.`);
            return false;
        }
        p.hp = Math.min(p.hpMax, p.hp + 20);
        engine.state.map[p.y][p.x] = FEAT.FLOOR;
        log(engine, `You drink the pristine spring water (+20 HP). The fountain bubbles and dries to dry stone.`);
        return true;
    }

    function interactCage(engine) {
        const p = engine.state.player;
        let found = false;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = p.x + dx, ny = p.y + dy;
                if (nx >= 0 && nx < engine.MAP_W && ny >= 0 && ny < engine.MAP_H && engine.state.map[ny][nx] === FEAT.CAGE) {
                    engine.state.map[ny][nx] = FEAT.FLOOR;
                    const ally = { id: `liberated_${Date.now()}`, name: 'liberated captive', glyph: 'h', x: nx, y: ny, hp: 35, hpMax: 35, dmg: '2d5', alive: true, isAlly: true };
                    engine.state.monsters.push(ally);
                    log(engine, `You shatter the iron cage! A grateful captive joins your party as a loyal ally!`);
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        return found;
    }

    const VAULT_TEMPLATES = [
        { name: 'Mithril Forge', w: 5, h: 5, layout: ['#####', '#..G#', '#.A.#', '#...#', '##+##'], featMap: { 'A': FEAT.ANVIL, 'G': FEAT.GAS_VENT, '#': FEAT.WALL, '.': FEAT.FLOOR, '+': FEAT.OPEN_DOOR } },
        { name: 'Pantheon Shrine', w: 5, h: 5, layout: ['#####', '#.F.#', '#._.#', '#...#', '##+##'], featMap: { '_': FEAT.ALTAR, 'F': FEAT.FOUNTAIN, '#': FEAT.WALL, '.': FEAT.FLOOR, '+': FEAT.OPEN_DOOR } },
        { name: 'Caged Menagerie', w: 5, h: 5, layout: ['#####', '#.C.#', '#...#', '#.C.#', '##+##'], featMap: { 'C': FEAT.CAGE, '#': FEAT.WALL, '.': FEAT.FLOOR, '+': FEAT.OPEN_DOOR } },
        { name: 'Caustic Crucible', w: 5, h: 5, layout: ['#####', '#G.G#', '#...#', '#G.G#', '##+##'], featMap: { 'G': FEAT.GAS_VENT, '#': FEAT.WALL, '.': FEAT.FLOOR, '+': FEAT.OPEN_DOOR } },
        { name: 'Runic Vault', w: 5, h: 5, layout: ['#####', '#.R.#', '#...#', '#.R.#', '##+##'], featMap: { 'R': FEAT.RUNE_VAULT, '#': FEAT.WALL, '.': FEAT.FLOOR, '+': FEAT.OPEN_DOOR } },
        { name: 'Wyrm Hoard', w: 5, h: 5, layout: ['#####', '#...#', '#.D.#', '#...#', '##+##'], featMap: { 'D': FEAT.FLOOR, '#': FEAT.WALL, '.': FEAT.FLOOR, '+': FEAT.OPEN_DOOR } }
    ];

    function stampMicroVault(engine, rooms, depth) {
        if (!rooms || rooms.length === 0) return false;
        const seed = mixSeed(engine.baseSeed || 0x59415344, depth * 101);
        const rng = mulberry32(seed);
        const vault = VAULT_TEMPLATES[Math.floor(rng() * VAULT_TEMPLATES.length)];
        const targetRoom = rooms[Math.floor(rng() * rooms.length)];
        if (!targetRoom || targetRoom.w < vault.w || targetRoom.h < vault.h) return false;
        const ox = targetRoom.x + Math.floor((targetRoom.w - vault.w) / 2);
        const oy = targetRoom.y + Math.floor((targetRoom.h - vault.h) / 2);
        const map = engine.state.map;
        for (let vy = 0; vy < vault.h; vy++) {
            for (let vx = 0; vx < vault.w; vx++) {
                const char = vault.layout[vy][vx];
                const feat = vault.featMap[char] !== undefined ? vault.featMap[char] : FEAT.FLOOR;
                const gx = ox + vx, gy = oy + vy;
                if (gx > 0 && gx < engine.MAP_W - 1 && gy > 0 && gy < engine.MAP_H - 1) {
                    map[gy][gx] = feat;
                }
            }
        }
        return true;
    }

    function checkRelicClaim(engine, item) {
        const p = engine.state.player;
        const bp = engine.spec.ryodBlueprint || {};
        if (bp.victoryMode !== 'relic_ascent') return false;
        if (item && item.name === (engine.spec.goalItemName || 'Amulet of Yendor')) {
            p.hasAmulet = true;
            log(engine, `You clutch the sacred ${item.name}! The dungeon shudders. Ascend to DL 1 and climb to freedom!`);
            return true;
        }
        return false;
    }

    function onAscentFloorEnter(engine) {
        const p = engine.state.player;
        if (!p.hasAmulet) return;
        const hunter = {
            id: `apex_hunter_${Date.now()}`,
            name: 'Apex Relic Hunter',
            glyph: 'A',
            x: Math.max(1, p.x + 2),
            y: Math.max(1, p.y + 2),
            hp: 60 + (engine.state.depth * 5),
            hpMax: 60 + (engine.state.depth * 5),
            dmg: '3d6',
            alive: true,
            isBoss: true
        };
        engine.state.monsters.push(hunter);
        log(engine, `A relentless ${hunter.name} tracks the resonant pulse of the Relic!`);
    }

    function applyPhylacteryShield(playerOrEngine, incomingDmg) {
        const player = (playerOrEngine && playerOrEngine.state && playerOrEngine.state.player) ? playerOrEngine.state.player : playerOrEngine;
        if (!player || player.avatarId !== 'lich' || player.pw <= 0) return incomingDmg;
        const absorb = Math.min(Math.floor(incomingDmg * 0.5), player.pw);
        player.pw -= absorb;
        return incomingDmg - absorb;
    }

    function applyVampireLeech(playerOrEngine, damageDealt) {
        const player = (playerOrEngine && playerOrEngine.state && playerOrEngine.state.player) ? playerOrEngine.state.player : playerOrEngine;
        if (!player || player.avatarId !== 'vampire' || damageDealt <= 0) return 0;
        const heal = Math.max(1, Math.floor(damageDealt * 0.25));
        player.hp = Math.min(player.hpMax, player.hp + heal);
        return heal;
    }

    function checkAvatarScaleEvolution(playerOrEngine, depth) {
        const player = (playerOrEngine && playerOrEngine.state && playerOrEngine.state.player) ? playerOrEngine.state.player : playerOrEngine;
        const d = depth != null ? depth : ((playerOrEngine && playerOrEngine.state) ? playerOrEngine.state.depth : 1);
        if (!player || player.avatarId !== 'dragon') return;
        const stages = AVATARS.dragon.stages;
        let stageIdx = 0;
        if (player.level >= 30 || d >= 15 || (player.enchantments || 0) >= 6) stageIdx = 3;
        else if (player.level >= 20 || d >= 10 || (player.enchantments || 0) >= 4) stageIdx = 2;
        else if (player.level >= 10 || d >= 5 || (player.enchantments || 0) >= 2) stageIdx = 1;
        const targetStage = stages[stageIdx];
        if (player.dragonStage !== targetStage) {
            player.dragonStage = targetStage;
            player.roleName = `Red Dragon (${targetStage})`;
            player.hpMax += 15;
            player.hp += 15;
            player.ac += 2;
        }
    }

    return {
        FEAT, parseSeed, mixSeed, mulberry32, buildAppearanceMap, getDisplayItemName,
        SONGS, STANCES, DEITIES, AVATARS, resolveActiveSystems,
        toggleSong, toggleStance, smithAtAnvil, assignFloorBounty, onBountyKilled,
        recordKillPiety, invokeDeityPower, pushHazard, tickActiveHazards,
        evolveAllyOnBattle, interactAltar, interactFountain, interactCage,
        stampMicroVault, checkRelicClaim, onAscentFloorEnter,
        applyPhylacteryShield, applyVampireLeech, checkAvatarScaleEvolution
    };
});

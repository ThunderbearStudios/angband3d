/**
 * server/public/js/realm-content-pool.js
 *
 * Universal Cross-Realm Content Assimilation Pool for RYOD ("Roll Your Own Dungeon").
 * Normalizes and exposes validated building blocks across all 8 canonical realms
 * (Angband, Sil-Q, FrogComposband, Hengband, NetHack, DCSS, Brogue, Rogue)
 * plus a forward-compatible `registerRealmContent(realmId, spec)` hook so future
 * 9th+ official realms are automatically assimilated into RYOD.
 *
 * 100% of monsters and items reference canonical names already backed by 3D `.glb`/`.gltf`
 * assets in `MASTER_BESTIARY` and `MASTER_ITEM_REGISTRY` (zero 3D model generation).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RealmContentPool = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const BIOMES = {
        obsidian: {
            id: 'obsidian',
            label: 'Obsidian Stronghold (Iron & Torchlight)',
            sourceRealm: 'angband',
            wallPhId: 'castle_wall_slates',
            floorPhId: 'cobblestone_floor_04',
            ceilPhId: 'rock_boulder_dry',
            fogColor: 0x0b0b12,
            ambientColor: 0x3b3548,
            torchColor: 0xff9d47,
            defaultAudio: 'angband',
            defaultBestiary: 'warbands',
            defaultStory: 'shattered_covenant',
            description: 'Rough-hewn basalt bastions lit by sputtering iron cressets and ancient ward-stones.'
        },
        bioluminescent: {
            id: 'bioluminescent',
            label: 'Bioluminescent Underdark (Glowing Flora & Chasms)',
            sourceRealm: 'brogue',
            wallPhId: 'rock_boulder_dry',
            floorPhId: 'aerial_rocks_02',
            ceilPhId: 'rock_boulder_dry',
            fogColor: 0x06151c,
            ambientColor: 0x24586b,
            torchColor: 0x52f2d6,
            defaultAudio: 'brogue',
            defaultBestiary: 'beasts_wyrms',
            defaultStory: 'spore_choir',
            description: 'Flooded subterranean grottos illuminated by cyan fungal canopies, magma fissures, and suspension bridges.'
        },
        catacombs: {
            id: 'catacombs',
            label: 'Ecumenical Marble Sanctum (Crypts, Altars & Fountains)',
            sourceRealm: 'dcss',
            wallPhId: 'stone_brick_wall_001',
            floorPhId: 'worn_planks',
            ceilPhId: 'castle_wall_slates',
            fogColor: 0x100b16,
            ambientColor: 0x453859,
            torchColor: 0xe6b8ff,
            defaultAudio: 'nethack',
            defaultBestiary: 'necropolis',
            defaultStory: 'ossuary_crown',
            description: 'Echoing reliquary halls of cracked marble, forgotten deity shrines, and ossuary vaults.'
        },
        shadow_keep: {
            id: 'shadow_keep',
            label: 'Eastern Shadow Keep (Crimson Timber & Mist)',
            sourceRealm: 'hengband',
            wallPhId: 'stone_brick_wall_001',
            floorPhId: 'worn_planks',
            ceilPhId: 'worn_planks',
            fogColor: 0x17090d,
            ambientColor: 0x542c35,
            torchColor: 0xff6e52,
            defaultAudio: 'hengband',
            defaultBestiary: 'eastern_oni',
            defaultStory: 'crown_of_cinders',
            description: 'Mist-shrouded fortress citadels of lacquered timber, paper lanterns, and cursed shogunate vaults.'
        },
        chaos_rift: {
            id: 'chaos_rift',
            label: 'Abyssal Chaos Rift (Arcane Crystal & Void)',
            sourceRealm: 'frogcomposband',
            wallPhId: 'castle_wall_slates',
            floorPhId: 'cobblestone_floor_04',
            ceilPhId: 'rock_boulder_dry',
            fogColor: 0x14071f,
            ambientColor: 0x522878,
            torchColor: 0xc466ff,
            defaultAudio: 'frogcomposband',
            defaultBestiary: 'constructs',
            defaultStory: 'clockwork_abyss',
            description: 'Warped astral bastions where brass clockwork conduits and eldritch rift-crystals hum with raw mana.'
        },
        frozen_wastes: {
            id: 'frozen_wastes',
            label: 'Frozen Iron Wastes (Glacial Vaults & Frost)',
            sourceRealm: 'silq',
            wallPhId: 'rock_boulder_dry',
            floorPhId: 'cobblestone_floor_04',
            ceilPhId: 'castle_wall_slates',
            fogColor: 0x07131e,
            ambientColor: 0x2f5475,
            torchColor: 0x7dd3fc,
            defaultAudio: 'silq',
            defaultBestiary: 'shadow_host',
            defaultStory: 'iron_crown_song',
            description: 'Rime-crusted northern delves where howling glacial drafts and starlit ice-pillars guard the Iron Throne.'
        },
        gilded_treasury: {
            id: 'gilded_treasury',
            label: 'Sunken Golden Treasury (Gilded Halls & Traps)',
            sourceRealm: 'rogue',
            wallPhId: 'stone_brick_wall_001',
            floorPhId: 'cobblestone_floor_04',
            ceilPhId: 'stone_brick_wall_001',
            fogColor: 0x161106,
            ambientColor: 0x5e491e,
            torchColor: 0xfbbf24,
            defaultAudio: 'rogue',
            defaultBestiary: 'dungeons_of_doom',
            defaultStory: 'sovereign_heist',
            description: 'Opulent subterranean vaults lined with brass braziers, pressure-plate traps, and ancient coin-hoards.'
        }
    };

    const HERO_ORIGINS = {
        warrior: {
            id: 'warrior',
            label: 'Sovereign Warrior (Mortal Class)',
            isMonsterAvatar: false,
            race: 'Human',
            roleName: 'Sovereign Warrior',
            align: 'Lawful',
            defaultDiscipline: 'martial',
            hp: 40, pw: 10, ac: 5,
            str: 17, int: 10, wis: 11, dex: 14, con: 16,
            weapon: { name: 'long sword', dmg: '2d5', bonus: 1, weight: 40, tval: 23, sval: 17 },
            armor: { name: 'chain mail', ac: 6, bonus: 1, weight: 220, tval: 37, sval: 4 },
            extra: { kind: 'potion', name: 'potion of berserk strength', glyph: '!', heal: 30, strengthGain: 1, count: 2, weight: 10, tval: 71, sval: 30 },
            innatePower: { name: 'Shield Bash Surge', cost: 2, dmg: 14, heal: 4, desc: 'Stagger an adjacent foe and brace your guard (+4 HP).' }
        },
        valkyrie: {
            id: 'valkyrie',
            label: 'Shieldmaiden Valkyrie (Mortal Class)',
            isMonsterAvatar: false,
            race: 'Dunedain',
            roleName: 'Valkyrie',
            align: 'Lawful',
            defaultDiscipline: 'songs',
            hp: 38, pw: 14, ac: 6,
            str: 16, int: 12, wis: 15, dex: 15, con: 16,
            weapon: { name: 'war spear', dmg: '2d6', bonus: 1, weight: 45, tval: 22, sval: 8 },
            armor: { name: 'scale mail', ac: 5, bonus: 2, weight: 190, tval: 37, sval: 3 },
            extra: { kind: 'potion', name: 'potion of curing', glyph: '!', heal: 28, count: 2, weight: 10, tval: 71, sval: 28 },
            innatePower: { name: 'Valkyrie Spear-Leap', cost: 2, dmg: 16, heal: 0, desc: 'Drive a winged spear strike through enemy armor.' }
        },
        samurai: {
            id: 'samurai',
            label: 'Ronin Samurai (Mortal Class)',
            isMonsterAvatar: false,
            race: 'Human',
            roleName: 'Samurai',
            align: 'Lawful',
            defaultDiscipline: 'martial',
            hp: 36, pw: 16, ac: 5,
            str: 16, int: 12, wis: 13, dex: 16, con: 15,
            weapon: { name: 'katana', dmg: '2d7', bonus: 2, weight: 35, tval: 23, sval: 20 },
            armor: { name: 'splint mail', ac: 6, bonus: 1, weight: 210, tval: 37, sval: 6 },
            extra: { kind: 'scroll', name: 'scroll of enchant weapon', glyph: '?', enchantGain: 1, count: 2, weight: 5, tval: 70, sval: 15 },
            innatePower: { name: 'Tsubame Gaeshi (Swallow Cut)', cost: 2, dmg: 20, heal: 0, desc: 'Deliver a lightning double-draw katana slash.' }
        },
        mage: {
            id: 'mage',
            label: 'Arch-Mage Evoker (Mortal Class)',
            isMonsterAvatar: false,
            race: 'High-Elf',
            roleName: 'Arch-Mage',
            align: 'Neutral',
            defaultDiscipline: 'arcane',
            hp: 26, pw: 28, ac: 2,
            str: 10, int: 18, wis: 15, dex: 14, con: 12,
            weapon: { name: 'quarterstaff', dmg: '1d6', bonus: 1, weight: 30, tval: 21, sval: 3 },
            armor: { name: 'robe of the magi', ac: 3, bonus: 2, weight: 40, tval: 36, sval: 2 },
            extra: { kind: 'wand', name: 'wand of fireballs [6/6]', glyph: '-', charges: 6, count: 1, weight: 12, tval: 65, sval: 12 },
            innatePower: { name: 'Aether Nova', cost: 3, dmg: 22, aoe: true, desc: 'Unleash a radial pulse of raw astral force across nearby foes.' }
        },
        ranger: {
            id: 'ranger',
            label: 'Deepwood Ranger (Mortal Class)',
            isMonsterAvatar: false,
            race: 'Wood-Elf',
            roleName: 'Ranger',
            align: 'Neutral',
            defaultDiscipline: 'songs',
            hp: 32, pw: 16, ac: 4,
            str: 14, int: 14, wis: 14, dex: 18, con: 14,
            weapon: { name: 'long bow', dmg: '2d5', bonus: 2, weight: 30, tval: 19, sval: 12 },
            armor: { name: ' studded leather', ac: 4, bonus: 1, weight: 110, tval: 36, sval: 5 },
            extra: { kind: 'wand', name: 'rod of lightning bolts [5/5]', glyph: '-', charges: 5, count: 1, weight: 15, tval: 66, sval: 8 },
            innatePower: { name: 'Heartseeker Volley', cost: 2, dmg: 18, heal: 0, desc: 'Loose an unerring enchanted shaft at your nearest adversary.' }
        },
        rogue: {
            id: 'rogue',
            label: 'Shadowblade Rogue (Mortal Class)',
            isMonsterAvatar: false,
            race: 'Shadow-kin',
            roleName: 'Shadow Rogue',
            align: 'Chaotic',
            defaultDiscipline: 'arcane',
            hp: 30, pw: 18, ac: 4,
            str: 13, int: 15, wis: 11, dex: 18, con: 14,
            weapon: { name: 'assassin dagger', dmg: '2d4', bonus: 3, weight: 15, tval: 23, sval: 4 },
            armor: { name: 'shadow cloak', ac: 4, bonus: 2, weight: 60, tval: 35, sval: 1 },
            extra: { kind: 'scroll', name: 'scroll of teleportation', glyph: '?', count: 3, weight: 5, tval: 70, sval: 8 },
            innatePower: { name: 'Shadowstep Backstab', cost: 2, dmg: 19, blink: false, desc: 'Strike from the blind spot for lethal critical damage.' }
        },
        priest: {
            id: 'priest',
            label: 'Templar High Priest (Mortal Class)',
            isMonsterAvatar: false,
            race: 'Human',
            roleName: 'High Priest',
            align: 'Lawful',
            defaultDiscipline: 'piety',
            hp: 34, pw: 24, ac: 5,
            str: 14, int: 13, wis: 18, dex: 12, con: 15,
            weapon: { name: 'blessed warhammer', dmg: '2d6', bonus: 2, beatitude: 'blessed', weight: 45, tval: 21, sval: 8 },
            armor: { name: 'hauberk of light', ac: 6, bonus: 1, beatitude: 'blessed', weight: 200, tval: 37, sval: 4 },
            extra: { kind: 'potion', name: 'potion of extra healing', glyph: '!', heal: 40, count: 2, weight: 10, tval: 71, sval: 35 },
            innatePower: { name: 'Sanctified Judgment', cost: 2, dmg: 15, heal: 12, desc: 'Call down a pillar of solar fire that sears foes and mends your wounds.' }
        },

        // === PLAYABLE MONSTER AVATARS (3D Creature Mesh + Innate Racial Ability) ===
        red_dragon: {
            id: 'red_dragon',
            label: '🐉 Red Dragon Wyrmling (Creature Avatar)',
            isMonsterAvatar: true,
            avatarMonsterName: 'red dragon',
            race: 'Dragon',
            roleName: 'Red Dragon Wyrmling',
            align: 'Chaotic',
            defaultDiscipline: 'arcane',
            hp: 48, pw: 20, ac: 8,
            str: 19, int: 14, wis: 13, dex: 13, con: 18,
            weapon: { name: 'draconic talons', dmg: '2d8', bonus: 2, weight: 10, tval: 23, sval: 1 },
            armor: { name: 'crimson dragonscales', ac: 8, bonus: 2, weight: 80, tval: 38, sval: 1 },
            extra: { kind: 'potion', name: 'potion of fire essence', glyph: '!', heal: 35, count: 2, weight: 10, tval: 71, sval: 35 },
            innatePower: { name: 'Searing Dragon Breath', cost: 3, dmg: 26, aoe: true, desc: 'Exhale a cone of molten dragonfire across all nearby enemies!' }
        },
        vampire_scion: {
            id: 'vampire_scion',
            label: '🧛 Vampire Scion (Creature Avatar)',
            isMonsterAvatar: true,
            avatarMonsterName: 'vampire lord',
            race: 'Undead',
            roleName: 'Vampire Scion',
            align: 'Chaotic',
            defaultDiscipline: 'piety',
            hp: 36, pw: 22, ac: 6,
            str: 16, int: 16, wis: 14, dex: 17, con: 15,
            weapon: { name: 'crimson rapier', dmg: '2d6', bonus: 2, weight: 25, tval: 23, sval: 10 },
            armor: { name: 'noble dusk-mantle', ac: 5, bonus: 2, weight: 70, tval: 36, sval: 3 },
            extra: { kind: 'potion', name: 'vial of vitae', glyph: '!', heal: 35, count: 2, weight: 10, tval: 71, sval: 35 },
            innatePower: { name: 'Vampiric Life-Drain', cost: 2, dmg: 18, heal: 14, desc: 'Drain lifeblood from your foe to restore 14 HP.' }
        },
        iron_golem: {
            id: 'iron_golem',
            label: '🗿 Iron Golem Juggernaut (Creature Avatar)',
            isMonsterAvatar: true,
            avatarMonsterName: 'iron golem',
            race: 'Construct',
            roleName: 'Iron Golem',
            align: 'Neutral',
            defaultDiscipline: 'martial',
            hp: 56, pw: 12, ac: 11,
            str: 20, int: 10, wis: 10, dex: 10, con: 20,
            weapon: { name: 'forged iron fists', dmg: '3d5', bonus: 2, weight: 60, tval: 21, sval: 12 },
            armor: { name: 'riveted dwarf-iron chassis', ac: 10, bonus: 2, weight: 300, tval: 37, sval: 10 },
            extra: { kind: 'scroll', name: 'scroll of enchanting', glyph: '?', enchantGain: 1, count: 2, weight: 5, tval: 70, sval: 15 },
            innatePower: { name: 'Seismic Ground Slam', cost: 2, dmg: 22, aoe: true, desc: 'Shatter the stone floor, damaging all adjacent creatures.' }
        },
        arch_lich: {
            id: 'arch_lich',
            label: '💀 Arch-Lich Initiate (Creature Avatar)',
            isMonsterAvatar: true,
            avatarMonsterName: 'arch-lich',
            race: 'Undead',
            roleName: 'Arch-Lich',
            align: 'Chaotic',
            defaultDiscipline: 'arcane',
            hp: 30, pw: 34, ac: 5,
            str: 11, int: 20, wis: 18, dex: 14, con: 14,
            weapon: { name: 'skull-crowned scepter', dmg: '2d4', bonus: 2, weight: 25, tval: 21, sval: 5 },
            armor: { name: 'phylactery vestments', ac: 5, bonus: 3, weight: 50, tval: 36, sval: 2 },
            extra: { kind: 'wand', name: 'staff of cold bolts [6/6]', glyph: '\\', charges: 6, count: 1, weight: 18, tval: 55, sval: 7 },
            innatePower: { name: 'Abyssal Soul-Chill', cost: 3, dmg: 24, heal: 8, desc: 'Blast foes with necrotic frost while siphoning 8 HP into your phylactery.' }
        },
        minotaur: {
            id: 'minotaur',
            label: '🐂 Minotaur Berserker (Creature Avatar)',
            isMonsterAvatar: true,
            avatarMonsterName: 'minotaur',
            race: 'Beastkin',
            roleName: 'Minotaur Berserker',
            align: 'Chaotic',
            defaultDiscipline: 'martial',
            hp: 46, pw: 12, ac: 6,
            str: 19, int: 9, wis: 10, dex: 15, con: 18,
            weapon: { name: 'double-bitted battle axe', dmg: '2d8', bonus: 2, weight: 55, tval: 22, sval: 15 },
            armor: { name: 'bronze labyrinth harness', ac: 6, bonus: 1, weight: 180, tval: 37, sval: 5 },
            extra: { kind: 'potion', name: 'potion of berserk strength', glyph: '!', heal: 30, strengthGain: 1, count: 2, weight: 10, tval: 71, sval: 30 },
            innatePower: { name: 'Labyrinth Gore Charge', cost: 2, dmg: 24, heal: 0, desc: 'Lower your horns and gore the nearest target for massive impact.' }
        }
    };

    const POWER_DISCIPLINES = {
        arcane: {
            id: 'arcane',
            label: 'Arcane Spells & Wands (Mana)',
            resourceLabel: 'MANA',
            verbLabel: 'Cast Spell',
            powers: [
                { key: '1', name: 'Arcane Bolt', cost: 2, dmg: 15, heal: 0, desc: 'Launch a focused bolt of pure arcane force at the nearest visible foe.' },
                { key: '2', name: 'Phase Blink', cost: 3, dmg: 0, blink: true, heal: 5, desc: 'Step through the astral plane to a safe tile and mend 5 HP.' },
                { key: '3', name: 'Cataclysmic Firestorm', cost: 5, dmg: 25, aoe: true, desc: 'Engulf all surrounding enemies in a roaring vortex of flame.' }
            ]
        },
        songs: {
            id: 'songs',
            label: 'Songs of Power (Sil-Q Voice)',
            resourceLabel: 'VOICE',
            verbLabel: 'Sing Song',
            powers: [
                { key: '1', name: 'Song of Slaying', cost: 2, dmg: 16, heal: 0, desc: 'Chant a resonant battle-verse that shatters enemy defenses.' },
                { key: '2', name: 'Song of Elbereth (Aegis)', cost: 3, dmg: 10, aoe: true, heal: 8, desc: 'Intone a starlit ward that drives back shadow creatures and restores 8 HP.' },
                { key: '3', name: 'Song of Staying', cost: 4, dmg: 0, heal: 24, curePoison: true, desc: 'Sing an ancient hymn of endurance, restoring 24 HP and purging poison.' }
            ]
        },
        piety: {
            id: 'piety',
            label: 'Divine Piety & Miracles (DCSS/NetHack)',
            resourceLabel: 'PIETY',
            verbLabel: 'Invoke Miracle',
            powers: [
                { key: '1', name: 'Smite Heretic', cost: 2, dmg: 18, heal: 0, desc: 'Call down divine retribution upon your nearest enemy.' },
                { key: '2', name: 'Sanctuary Aegis', cost: 3, dmg: 0, heal: 22, curePoison: true, desc: 'Bathe in sacred light, restoring 22 HP and cleansing toxins.' },
                { key: '3', name: 'Wrath of the Pantheon', cost: 5, dmg: 24, aoe: true, heal: 6, desc: 'Unleash radiant judgment across all foes in sight.' }
            ]
        },
        martial: {
            id: 'martial',
            label: 'Bushido & Chaos Martial Arts (Hengband/FCB)',
            resourceLabel: 'KI',
            verbLabel: 'Execute Technique',
            powers: [
                { key: '1', name: 'Iaijutsu Precision Draw', cost: 2, dmg: 19, heal: 0, desc: 'Strike with blinding speed at the enemy\'s vital seam.' },
                { key: '2', name: 'Whirlwind Blade Dance', cost: 3, dmg: 16, aoe: true, desc: 'Sweep your weapon in a 360-degree arc across all nearby enemies.' },
                { key: '3', name: 'Zanshin Breath Focus', cost: 2, dmg: 0, heal: 18, curePoison: true, desc: 'Center your breathing to recover 18 HP and purge poison.' }
            ]
        },
        blood_shadow: {
            id: 'blood_shadow',
            label: 'Blood & Shadow Pact (Vitae & Night)',
            resourceLabel: 'VITAE',
            verbLabel: 'Invoke Pact',
            powers: [
                { key: '1', name: 'Crimson Siphon Lance', cost: 2, dmg: 17, heal: 9, desc: 'Pierce your target with a lance of dark vitae, draining 9 HP.' },
                { key: '2', name: 'Umbral Shadow-Blink', cost: 2, dmg: 0, blink: true, heal: 6, curePoison: true, desc: 'Dissolve into living shadow to phase to safety and mend 6 HP.' },
                { key: '3', name: 'Blood-Moon Harvest', cost: 4, dmg: 22, aoe: true, heal: 12, desc: 'Reap the life-force of all visible enemies in a radial crimson nova.' }
            ]
        }
    };

    const PET_COMPANIONS = {
        none: null,
        war_hound: {
            id: 'war_hound',
            label: 'Faithful War Hound (Little Dog)',
            name: 'little dog',
            glyph: 'd',
            attr: 15,
            hp: 28,
            ac: 5,
            dmg: 8,
            lore: 'Your fiercely loyal canine companion who bounds across dungeon floors at your side.'
        },
        shadow_panther: {
            id: 'shadow_panther',
            label: 'Shadow Panther (Kitten)',
            name: 'kitten',
            glyph: 'f',
            attr: 8,
            hp: 26,
            ac: 4,
            dmg: 10,
            lore: 'A sleek, velvet-furred feline predator that stalks foes silently beside you.'
        },
        fire_drake: {
            id: 'fire_drake',
            label: 'Tame Ember Drake',
            name: 'red dragon',
            glyph: 'd',
            attr: 4,
            hp: 36,
            ac: 3,
            dmg: 12,
            lore: 'A bonded draconic hatchling whose fiery jaws sear anything that threatens its master.'
        },
        clockwork_scarab: {
            id: 'clockwork_scarab',
            label: 'Clockwork Scarab Sentinel',
            name: 'clockwork scarab',
            glyph: 'I',
            attr: 14,
            hp: 32,
            ac: 2,
            dmg: 10,
            lore: 'An arcane brass automaton calibrated to intercept dungeon threats on your behalf.'
        },
        barrow_hound: {
            id: 'barrow_hound',
            label: 'Spectral Barrow Hound',
            name: 'warg',
            glyph: 'C',
            attr: 11,
            hp: 34,
            ac: 3,
            dmg: 11,
            lore: 'A ghostly dire-wolf bound by oath to hunt beside you through the dark.'
        }
    };

    const MAP_LAYOUTS = {
        classic: { id: 'classic', label: '🏛️ Classic Bastion Rooms', desc: 'Balanced interconnected stone chambers and framed doorways.' },
        caverns: { id: 'caverns', label: '🍄 Organic Winding Caverns', desc: 'Irregular natural grottos, underground lakes, and fungal bridges.' },
        labyrinth: { id: 'labyrinth', label: '🌀 Dense Minotaur Labyrinth', desc: 'High-density network of 15 tight chambers, ambushes, and winding halls.' },
        arena: { id: 'arena', label: '⚔️ Grand Vault Arenas', desc: 'Expansive cathedral pillared halls built for large-scale tactical battles.' }
    };

    const WORLD_MUTATORS = {
        balanced: {
            id: 'balanced',
            label: '⚖️ Classic Balanced Rules',
            desc: 'Authentic tactical pacing, balanced loot, and standard line-of-sight.'
        },
        blood_moon: {
            id: 'blood_moon',
            label: '🩸 Blood-Moon Frenzy (+35% Dmg & Life-On-Kill)',
            desc: 'All combat deals +35% damage; slaying any foe restores +4 HP and +1 Power!'
        },
        midas_vaults: {
            id: 'midas_vaults',
            label: '💎 Midas Vaults & Mimics (2x Loot & Vaults)',
            desc: 'Double floor treasure, bonus Enchanting Scrolls, and guarded Golden Vaults.'
        },
        stygian_fog: {
            id: 'stygian_fog',
            label: '🌫️ Stygian Darkness (4-Tile Torch & Ambush Crits)',
            desc: 'Claustrophobic 4-tile lantern radius, but your attacks deal +30% ambush damage!'
        },
        packmaster: {
            id: 'packmaster',
            label: '🐺 Packmaster Crusade (2 Starting Pets & Buffed Allies)',
            desc: 'Start with 2 loyal companions and rescue buffed Chained Allies (+40% HP/Dmg)!'
        },
        chaos_surge: {
            id: 'chaos_surge',
            label: '🎲 Wild Chaos Surge (Bonus Arcane Surges)',
            desc: 'Invoking any [m] power or scroll triggers a bonus Chaos Surge (chain bolt, haste, or heal)!'
        },
        cataclysm: {
            id: 'cataclysm',
            label: '🌋 Cataclysmic Tremors (Magma & Quake Loot)',
            desc: 'Abundant magma/water hazards; subterranean tremors periodically shake loose gold & scrolls!'
        },
        god_sandbox: {
            id: 'god_sandbox',
            label: '⚡ Immortal God-Sandbox (999 HP & [G] Floor Warp)',
            desc: 'Never die (999 HP/MP, +9 Gear, 0 Cost) and press [G] anytime to warp floors!'
        }
    };

    const CAPTIVE_ALLIES = [
        { name: 'dar blademaster ally', glyph: 'd', hp: 38, dmg: 11, lore: 'Blink-stepping elven swordmaster freed from dungeon chains.' },
        { name: 'ogre ally', glyph: 'O', hp: 46, dmg: 13, lore: 'Stalwart liberated ogre wielding a heavy iron club on your behalf.' },
        { name: 'naga ally', glyph: 'N', hp: 54, dmg: 15, lore: 'Serpentine guardian who cleaves foes in gratitude for its freedom.' },
        { name: 'valkyrie shield-sister', glyph: 'p', hp: 44, dmg: 12, lore: 'Sworn shieldmaiden rescued from captivity.' }
    ];

    // 5-Tier Depth-Banded Bestiary Factions (Tier 1 = shallow scouts -> Tier 5 = deep apex threats)
    const BESTIARY_FACTIONS = {
        warbands: {
            id: 'warbands',
            label: 'Warbands & Brutes (Orcs, Uruks, Ogres, Trolls & Dragons)',
            monsters: [
                { name: 'kobold scout', glyph: 'k', attr: 3, tier: 1, hp: 9, ac: 8, dmg: 3, exp: 8, lore: 'Scrappy tunnel sentry armed with a notched iron dart.' },
                { name: 'goblin cutthroat', glyph: 'o', attr: 2, tier: 1, hp: 11, ac: 7, dmg: 4, exp: 10, lore: 'Cruel subterranean raider lurking in torch shadows.' },
                { name: 'snaga', glyph: 'o', attr: 3, tier: 1, hp: 13, ac: 7, dmg: 5, exp: 12, lore: 'Lesser orc footpad driven forward by the war-drums.' },
                { name: 'gnoll sergeant', glyph: 'g', attr: 14, tier: 2, hp: 20, ac: 6, dmg: 7, exp: 22, lore: 'Hyena-headed pack leader barking orders and hurling spears.' },
                { name: 'orc warrior', glyph: 'o', attr: 6, tier: 2, hp: 24, ac: 5, dmg: 8, exp: 26, lore: 'Broad-shouldered iron-forged orcish infantry.' },
                { name: 'uruk captain', glyph: 'U', attr: 4, tier: 3, hp: 38, ac: 4, dmg: 12, exp: 48, lore: 'Towering black-iron Uruk veteran bearing the blood-hand sigil.' },
                { name: 'ogre mauler', glyph: 'O', attr: 3, tier: 3, hp: 44, ac: 4, dmg: 14, exp: 55, lore: 'Hulking brute whose spiked greatclub splinters shields.' },
                { name: 'cave troll', glyph: 'T', attr: 10, tier: 4, hp: 64, ac: 2, dmg: 18, exp: 95, lore: 'Regenerating stone-hide behemoth of the deep halls.' },
                { name: 'minotaur labyrinth-guard', glyph: 'H', attr: 4, tier: 4, hp: 72, ac: 1, dmg: 21, exp: 120, lore: 'Furious bull-headed champion swinging a two-handed greataxe.' },
                { name: 'ancient red dragon', glyph: 'D', attr: 4, tier: 5, hp: 115, ac: -2, dmg: 28, exp: 260, lore: 'Calamitous draconic sovereign whose breath turns stone to slag.' }
            ]
        },
        necropolis: {
            id: 'necropolis',
            label: 'Necropolis & Specters (Skeletons, Wraiths, Vampires & Liches)',
            monsters: [
                { name: 'skeleton', glyph: 's', attr: 15, tier: 1, hp: 10, ac: 8, dmg: 4, exp: 9, lore: 'Clattering warrior bones bound by necromantic runes.' },
                { name: 'sewer rat', glyph: 'r', attr: 3, tier: 1, hp: 7, ac: 8, dmg: 3, exp: 6, lore: 'Carrion feeder of the upper ossuary drains.' },
                { name: 'rotting zombie', glyph: 'z', attr: 8, tier: 1, hp: 15, ac: 9, dmg: 5, exp: 12, lore: 'Shambling husk that feels neither pain nor fear.' },
                { name: 'vampire bat', glyph: 'v', attr: 8, tier: 2, hp: 16, ac: 5, dmg: 6, exp: 18, lore: 'Silent crypt flyer that thirsts for warm blood.' },
                { name: 'barrow wight', glyph: 'W', attr: 11, tier: 2, hp: 26, ac: 5, dmg: 9, exp: 32, lore: 'Cold-eyed tomb guardian whose touch numbs the living.' },
                { name: 'wraith', glyph: 'W', attr: 8, tier: 3, hp: 40, ac: 3, dmg: 13, exp: 55, lore: 'Shrouded specter drifting between shadow and stone.' },
                { name: 'mummy priest', glyph: 'M', attr: 14, tier: 3, hp: 48, ac: 3, dmg: 14, exp: 65, lore: 'Linen-wrapped hierophant chanting ancient curses.' },
                { name: 'vampire lord', glyph: 'V', attr: 4, tier: 4, hp: 70, ac: 1, dmg: 19, exp: 125, lore: 'Aristocratic immortal predator of the crimson court.' },
                { name: 'bone dragon', glyph: 'D', attr: 15, tier: 4, hp: 82, ac: 0, dmg: 22, exp: 150, lore: 'Colossal skeletal wyrm animated by dark liturgy.' },
                { name: 'arch-lich', glyph: 'L', attr: 13, tier: 5, hp: 110, ac: -3, dmg: 27, exp: 250, lore: 'Undying sorcerer-king crowned in cold astral fire.' }
            ]
        },
        beasts_wyrms: {
            id: 'beasts_wyrms',
            label: 'Primordial Beasts & Wyrms (Wolves, Spiders, Hydras & Dragons)',
            monsters: [
                { name: 'jackal', glyph: 'j', attr: 3, tier: 1, hp: 8, ac: 7, dmg: 3, exp: 7, lore: 'Swift cavern scavenger hunting in coordinated packs.' },
                { name: 'giant frog', glyph: 'F', attr: 10, tier: 1, hp: 11, ac: 7, dmg: 4, exp: 10, lore: 'Bioluminescent marsh amphibian with a whipping tongue.' },
                { name: 'pink jelly', glyph: 'J', attr: 13, tier: 1, hp: 16, ac: 9, dmg: 4, exp: 11, lore: 'Gelatinous cavern ooze pulsing with absorbed minerals.' },
                { name: 'warg', glyph: 'C', attr: 8, tier: 2, hp: 22, ac: 5, dmg: 8, exp: 24, lore: 'Fierce subterranean dire-wolf with jaws like iron traps.' },
                { name: 'cave spider', glyph: 'S', attr: 8, tier: 2, hp: 24, ac: 5, dmg: 9, exp: 28, lore: 'Eight-eyed ambusher spinning razor-taut silk across chasms.' },
                { name: 'acid mound', glyph: 'a', attr: 10, tier: 3, hp: 34, ac: 4, dmg: 12, exp: 45, lore: 'Caustic slime that hisses across wet cavern flagstones.' },
                { name: 'cockatrice', glyph: 'c', attr: 14, tier: 3, hp: 42, ac: 3, dmg: 14, exp: 60, lore: 'Serpent-tailed avian whose calcifying gaze turns flesh to stone.' },
                { name: 'salamander', glyph: 's', attr: 4, tier: 4, hp: 62, ac: 2, dmg: 18, exp: 105, lore: 'Molten-scaled predator swimming effortlessly through magma.' },
                { name: 'five-headed hydra', glyph: 'M', attr: 10, tier: 4, hp: 78, ac: 1, dmg: 21, exp: 135, lore: 'Regenerating swamp terror snapping with five venomous jaws.' },
                { name: 'ancient wyrm', glyph: 'D', attr: 4, tier: 5, hp: 120, ac: -2, dmg: 29, exp: 270, lore: 'Primordial apex dragon of the subterranean biosphere.' }
            ]
        },
        eastern_oni: {
            id: 'eastern_oni',
            label: 'Eastern Warbands & Oni (Ninjas, Ronin, Tengu, Oni & Wyrms)',
            monsters: [
                { name: 'kobold ninja', glyph: 'k', attr: 8, tier: 1, hp: 10, ac: 6, dmg: 4, exp: 10, lore: 'Black-clad tunnel scout hurling iron shuriken from the mist.' },
                { name: 'giant centipede', glyph: 'c', attr: 4, tier: 1, hp: 12, ac: 7, dmg: 4, exp: 11, lore: 'Carapace-armored crawler skittering beneath floorboards.' },
                { name: 'fox spirit', glyph: 'f', attr: 14, tier: 2, hp: 20, ac: 5, dmg: 7, exp: 22, lore: 'Cunning nine-tailed kitsune weaving phantom lantern-fire.' },
                { name: 'tengu wind-crow', glyph: 'B', attr: 9, tier: 2, hp: 25, ac: 4, dmg: 9, exp: 28, lore: 'Winged mountain swordsman who strikes like a gale.' },
                { name: 'cursed ronin', glyph: 'p', attr: 4, tier: 3, hp: 42, ac: 3, dmg: 14, exp: 58, lore: 'Masterless samurai bound to guard the crimson keep in death.' },
                { name: 'naga blademaster', glyph: 'N', attr: 10, tier: 3, hp: 48, ac: 3, dmg: 15, exp: 68, lore: 'Four-armed serpentine duelist with twin curved blades.' },
                { name: 'crimson oni warlord', glyph: 'O', attr: 4, tier: 4, hp: 72, ac: 1, dmg: 20, exp: 125, lore: 'Horned demon-ogre swinging an iron-spiked kanabo club.' },
                { name: 'shadow shogun', glyph: 'P', attr: 13, tier: 4, hp: 80, ac: 0, dmg: 22, exp: 145, lore: 'Armored phantom general commanding the keep\'s dead garrison.' },
                { name: 'celestial sky dragon', glyph: 'D', attr: 11, tier: 5, hp: 118, ac: -2, dmg: 28, exp: 265, lore: 'Sovereign storm-dragon wreathed in thunder and lightning.' }
            ]
        },
        eldritch_abyssal: {
            id: 'eldritch_abyssal',
            label: 'Eldritch & Abyssal (Eyes, Imps, Mind Flayers, Horrors & Demons)',
            monsters: [
                { name: 'crimson imp', glyph: 'i', attr: 4, tier: 1, hp: 9, ac: 7, dmg: 4, exp: 9, lore: 'Cackling abyssal familiar flitting between sulfur vents.' },
                { name: 'floating eye', glyph: 'e', attr: 11, tier: 1, hp: 11, ac: 8, dmg: 3, exp: 10, lore: 'Disembodied ocular orb whose unblinking stare freezes nerves.' },
                { name: 'quasit', glyph: 'i', attr: 13, tier: 2, hp: 20, ac: 5, dmg: 7, exp: 22, lore: 'Clawed rift-stalker phasing in and out of shadow.' },
                { name: 'chaos hound', glyph: 'C', attr: 13, tier: 2, hp: 26, ac: 5, dmg: 9, exp: 30, lore: 'Warp-touched mastiff baying with discordant echoes.' },
                { name: 'mind flayer', glyph: 'h', attr: 13, tier: 3, hp: 40, ac: 3, dmg: 14, exp: 62, lore: 'Tentacle-visaged psionic horror that feasts on memory.' },
                { name: 'vrock demon', glyph: 'u', attr: 4, tier: 3, hp: 48, ac: 3, dmg: 15, exp: 70, lore: 'Vulture-winged abyssal fiend screeching with bloodlust.' },
                { name: 'tentacle horror', glyph: 'H', attr: 13, tier: 4, hp: 74, ac: 1, dmg: 21, exp: 130, lore: 'Writhing elder abomination from beyond the rift-seal.' },
                { name: 'balrog of shadow', glyph: 'U', attr: 4, tier: 5, hp: 116, ac: -2, dmg: 29, exp: 265, lore: 'Demon of terror wreathed in both dark shadow and whip-fire.' }
            ]
        },
        constructs: {
            id: 'constructs',
            label: 'Constructs & Sentinels (Turrets, Golems & Vault Guardians)',
            monsters: [
                { name: 'clockwork scarab', glyph: 'I', attr: 14, tier: 1, hp: 10, ac: 6, dmg: 4, exp: 9, lore: 'Whirring brass beetle with razor-geared mandibles.' },
                { name: 'floating eye', glyph: 'e', attr: 11, tier: 1, hp: 12, ac: 7, dmg: 3, exp: 10, lore: 'Arcane surveillance lens patrolling the outer vault.' },
                { name: 'clay golem', glyph: 'g', attr: 3, tier: 2, hp: 26, ac: 5, dmg: 8, exp: 26, lore: 'Runic earthen sentinel shaped to guard temple thresholds.' },
                { name: 'flame turret', glyph: 'T', attr: 4, tier: 2, hp: 28, ac: 3, dmg: 10, exp: 32, lore: 'Crystalline emitter discharging calibrated bolts of fire.' },
                { name: 'stone golem', glyph: 'g', attr: 8, tier: 3, hp: 48, ac: 2, dmg: 14, exp: 60, lore: 'Granite colossus whose footsteps shake the vault masonry.' },
                { name: 'vault sentinel', glyph: 'p', attr: 14, tier: 3, hp: 44, ac: 2, dmg: 15, exp: 64, lore: 'Gilded automaton halberdier sworn to the Deep Architect.' },
                { name: 'iron golem', glyph: 'G', attr: 15, tier: 4, hp: 78, ac: 0, dmg: 20, exp: 135, lore: 'Furnace-forged juggernaut impervious to mortal toxins.' },
                { name: 'orb guardian', glyph: 'X', attr: 13, tier: 5, hp: 112, ac: -3, dmg: 27, exp: 255, lore: 'Crystalline multi-limbed sentinel guarding the core reliquary.' }
            ]
        },
        dungeons_of_doom: {
            id: 'dungeons_of_doom',
            label: 'Classic Dungeons of Doom (Gnomes, Mimics, Cockatrices & Dragons)',
            monsters: [
                { name: 'grid bug', glyph: 'x', attr: 13, tier: 1, hp: 7, ac: 8, dmg: 3, exp: 6, lore: 'Crackling geometric insect of the upper mazes.' },
                { name: 'gnome lord', glyph: 'G', attr: 3, tier: 1, hp: 12, ac: 7, dmg: 4, exp: 11, lore: 'Pointed-hat subterranean noble carrying a crossbow.' },
                { name: 'rothe', glyph: 'q', attr: 3, tier: 2, hp: 22, ac: 6, dmg: 7, exp: 22, lore: 'Shaggy subterranean musk-ox charging down corridors.' },
                { name: 'leocrotta', glyph: 'q', attr: 14, tier: 2, hp: 28, ac: 4, dmg: 9, exp: 32, lore: 'Swift chimeric predator that mimics human voices.' },
                { name: 'cockatrice', glyph: 'c', attr: 14, tier: 3, hp: 40, ac: 3, dmg: 13, exp: 58, lore: 'Hissing petrifier dreaded by every delver.' },
                { name: 'minotaur', glyph: 'H', attr: 4, tier: 4, hp: 68, ac: 1, dmg: 20, exp: 120, lore: 'Relentless horned hunter of the deep labyrinths.' },
                { name: 'arch-lich', glyph: 'L', attr: 13, tier: 4, hp: 82, ac: 0, dmg: 23, exp: 155, lore: 'Master of the arcane death-spell.' },
                { name: 'chromatic dragon', glyph: 'D', attr: 13, tier: 5, hp: 120, ac: -3, dmg: 29, exp: 270, lore: 'Prismatic sovereign of the Dungeons of Doom.' }
            ]
        },
        shadow_host: {
            id: 'shadow_host',
            label: 'Host of the Iron Fortress (Wolves, Orcs, Spiders & Balrogs)',
            monsters: [
                { name: 'orc scout', glyph: 'o', attr: 3, tier: 1, hp: 10, ac: 7, dmg: 4, exp: 9, lore: 'Keen-eared patrol of the northern iron-ells.' },
                { name: 'wolf', glyph: 'C', attr: 8, tier: 1, hp: 12, ac: 6, dmg: 5, exp: 11, lore: 'Grey hunter of the cold subterranean passes.' },
                { name: 'orc soldier', glyph: 'o', attr: 6, tier: 2, hp: 22, ac: 5, dmg: 8, exp: 24, lore: 'Mail-clad warrior bearing a heavy broad-spear.' },
                { name: 'warg', glyph: 'C', attr: 3, tier: 2, hp: 26, ac: 4, dmg: 9, exp: 28, lore: 'Dread hound of the Dark Throne.' },
                { name: 'great spider', glyph: 'S', attr: 8, tier: 3, hp: 42, ac: 3, dmg: 14, exp: 58, lore: 'Brood-spinner weaving webs of choking gloom.' },
                { name: 'troll guard', glyph: 'T', attr: 10, tier: 4, hp: 68, ac: 2, dmg: 19, exp: 115, lore: 'Slab-muscled gatekeeper of the deep delves.' },
                { name: 'balrog of shadow', glyph: 'U', attr: 4, tier: 5, hp: 115, ac: -2, dmg: 28, exp: 260, lore: 'Ancient spirit of fire and shadow bearing a whip of flame.' }
            ]
        }
    };

    // 7 Curated IP-Clean 5-Act Story Spines
    const STORY_ARCS = {
        shattered_covenant: {
            id: 'shattered_covenant',
            title: 'The Shattered Covenant',
            subtitle: 'Chronicle of the Astral Reliquary',
            chronicler: 'Vaelen the Blind Archivist',
            deity: 'The First Flame',
            traditionKey: 'tolkien_high_myth',
            goalItemName: 'Astral Reliquary of the First Covenant',
            goalGlyph: '"',
            elderRumor: 'Preceptor Malakor broke the Seven Seals of the Covenant and dragged the Astral Reliquary into the deep basalt sanctum.',
            nemesis: { name: 'Preceptor Malakor, the Oathbreaker', glyph: 'P', attr: 13, hp: 95, ac: -2, dmg: 24, lore: 'Fallen high preceptor wreathed in shattered covenant chains and abyssal starlight.' },
            actGuardians: [
                null,
                { name: 'Warden Kaelor of the Outer Seal', glyph: 'p', attr: 4, hp: 36, ac: 4, dmg: 10, lore: 'Corrupted gate-captain guarding the fractured First Seal.' },
                { name: 'Inquisitor Vane of the Ashen Choir', glyph: 'W', attr: 11, hp: 54, ac: 2, dmg: 14, lore: 'Spectral confessor chanting inverted litanies in the mid-vaults.' },
                { name: 'Dread-Knight Morvath', glyph: 'U', attr: 4, hp: 74, ac: 0, dmg: 19, lore: 'Black-iron champion standing before the Reliquary steps.' }
            ],
            acts: [
                { act: 'I', title: 'Act I: The Broken Threshold', lens: 'Omen & Preparation', banner: 'ACT I — THE BROKEN THRESHOLD: The ward-stones of the upper bastion flicker with dying amber light.' },
                { act: 'II', title: 'Act II: The First Seal Falls', lens: 'Rising Shadow', banner: 'ACT II — THE FIRST SEAL FALLS: Warden Kaelor\'s chain-wards rattle ahead in the soot-stained dark!' },
                { act: 'III', title: 'Act III: The Ashen Choir', lens: 'Crucible of Faith', banner: 'ACT III — THE ASHEN CHOIR: Spectral bells toll from the drowned reliquary halls.' },
                { act: 'IV', title: 'Act IV: Gate of the Oathbreaker', lens: 'Penultimate Siege', banner: 'ACT IV — GATE OF THE OATHBREAKER: Dread-Knight Morvath bars the descent to the Covenant Core!' },
                { act: 'V', title: 'Act V: Throne of the Shattered Covenant', lens: 'Final Reckoning', banner: 'ACT V — THRONE OF THE SHATTERED COVENANT: Preceptor Malakor awaits beside the Astral Reliquary!' }
            ]
        },
        ossuary_crown: {
            id: 'ossuary_crown',
            title: 'The Ossuary Crown',
            subtitle: 'Requiem of the Pale Hierophant',
            chronicler: 'Sister Morwen of the Silver Vigil',
            deity: 'The Pale Reliquary',
            traditionKey: 'gothic_dread',
            goalItemName: 'Crown of the Unburied King',
            goalGlyph: ']',
            elderRumor: 'Beneath the marble catacombs, Hierophant Vespera stitches a kingdom of bone around the Crown of the Unburied King.',
            nemesis: { name: 'Hierophant Vespera, the Undying Sovereign', glyph: 'L', attr: 13, hp: 92, ac: -3, dmg: 25, lore: 'Arch-Lich sovereign enthroned upon a dais of gilded skulls.' },
            actGuardians: [
                null,
                { name: 'Crypt-Keeper Grau', glyph: 'z', attr: 10, hp: 34, ac: 5, dmg: 9, lore: 'Hulking embalmer swinging a rusted censer-flail.' },
                { name: 'Countess Carmilla of the Red Vault', glyph: 'V', attr: 4, hp: 56, ac: 2, dmg: 15, lore: 'Crimson-cloaked noblewoman whose blade drinks torchlight.' },
                { name: 'The Ossuary Colossus', glyph: 'G', attr: 15, hp: 78, ac: 0, dmg: 20, lore: 'Towering amalgam of fused warrior bones and grave-iron.' }
            ],
            acts: [
                { act: 'I', title: 'Act I: Whispers in the Marble', lens: 'Descent into Dread', banner: 'ACT I — WHISPERS IN THE MARBLE: Cold incense drifts up from the sealed ossuary stairs.' },
                { act: 'II', title: 'Act II: The Embalmer\'s Toll', lens: 'Unquiet Dead', banner: 'ACT II — THE EMBALMER\'S TOLL: Crypt-Keeper Grau drags his iron keys across the flagstones!' },
                { act: 'III', title: 'Act III: Banquet of the Red Vault', lens: 'Blood & Velvet', banner: 'ACT III — BANQUET OF THE RED VAULT: Countess Carmilla\'s court rises from their marble sarcophagi!' },
                { act: 'IV', title: 'Act IV: The Bone-Forged Nave', lens: 'Grave Titan', banner: 'ACT IV — THE BONE-FORGED NAVE: The Ossuary Colossus awakens to guard the lower sanctum!' },
                { act: 'V', title: 'Act V: Court of the Unburied King', lens: 'Necromantic Climax', banner: 'ACT V — COURT OF THE UNBURIED KING: Hierophant Vespera raises the Ossuary Crown in defiance!' }
            ]
        },
        spore_choir: {
            id: 'spore_choir',
            title: 'The Spore-Choir Plague',
            subtitle: 'Expedition into the Luminous Deep',
            chronicler: 'Naturalist Corin Vance',
            deity: 'Cavern Resonance',
            traditionKey: 'weird_ecological',
            goalItemName: 'Heart-Spore of the Primordial Root',
            goalGlyph: '*',
            elderRumor: 'The bioluminescent caverns are singing with a single hive-mind; sever the Heart-Spore before the Mycelial Matriarch blooms to the surface.',
            nemesis: { name: 'Xylora, the Mycelial Matriarch', glyph: 'M', attr: 11, hp: 96, ac: -2, dmg: 24, lore: 'Crystalline fungal leviathan pulsing with hypnotic cyan spores and subterranean lightning.' },
            actGuardians: [
                null,
                { name: 'Brood-Spinner Arachna', glyph: 'S', attr: 10, hp: 35, ac: 4, dmg: 10, lore: 'Spore-crusted giant spider guarding the upper chasm bridges.' },
                { name: 'Caustic Leviathan Ooze', glyph: 'J', attr: 13, hp: 55, ac: 3, dmg: 14, lore: 'Luminous acid mass digesting ancient dwarven masonry.' },
                { name: 'Ignis, the Magma Salamander', glyph: 's', attr: 4, hp: 75, ac: 1, dmg: 19, lore: 'Primeval drake-amphibian coiled around the geothermal vents.' }
            ],
            acts: [
                { act: 'I', title: 'Act I: The Glowing Canopy', lens: 'Bioluminescent Wonder', banner: 'ACT I — THE GLOWING CANOPY: Cyan fungal lanterns pulse in rhythm with your heartbeat.' },
                { act: 'II', title: 'Act II: Webs Across the Chasm', lens: 'Predator & Prey', banner: 'ACT II — WEBS ACROSS THE CHASM: Silk-strung suspension bridges tremble above the abyss!' },
                { act: 'III', title: 'Act III: The Dissolving Grottos', lens: 'Corrosive Depths', banner: 'ACT III — THE DISSOLVING GROTTOS: Acidic pools hiss where the Spore-Choir feeds.' },
                { act: 'IV', title: 'Act IV: The Geothermal Throat', lens: 'Fire & Spore', banner: 'ACT IV — THE GEOTHERMAL THROAT: Magma rivers light the root-choked caverns!' },
                { act: 'V', title: 'Act V: Cradle of the Matriarch', lens: 'The Hive Awakens', banner: 'ACT V — CRADLE OF THE MATRIARCH: Xylora\'s Heart-Spore blazes at the center of the cavern!' }
            ]
        },
        crown_of_cinders: {
            id: 'crown_of_cinders',
            title: 'The Crown of Cinders',
            subtitle: 'Siege of the Crimson Shogunate',
            chronicler: 'Master Kenshin of the Autumn Leaf',
            deity: 'The Eightfold Blade',
            traditionKey: 'bushido_chronicle',
            goalItemName: 'Regalia of the Ember Shogun',
            goalGlyph: ']',
            elderRumor: 'Lord Kagutsuchi bound the Oni clans to his banner with the Ember Regalia; climb down into the sunken keep and end his reign.',
            nemesis: { name: 'Shogun Kagutsuchi, Regent of Cinders', glyph: 'P', attr: 4, hp: 98, ac: -2, dmg: 26, lore: 'Demon-armored warlord wielding twin blades of white-hot forge steel.' },
            actGuardians: [
                null,
                { name: 'Shadow-Captain Hanzo', glyph: 'p', attr: 8, hp: 35, ac: 4, dmg: 10, lore: 'Master shinobi of the outer mist-courtyard.' },
                { name: 'Gale-Lord Kurama the Tengu', glyph: 'B', attr: 11, hp: 54, ac: 2, dmg: 15, lore: 'Grandmaster of the wind-blade school.' },
                { name: 'General Ibaraki the Iron Oni', glyph: 'O', attr: 4, hp: 78, ac: 0, dmg: 20, lore: 'Colossal horned general guarding the throne-keep gates.' }
            ],
            acts: [
                { act: 'I', title: 'Act I: Courtyard of Falling Ash', lens: 'Honor & Steel', banner: 'ACT I — COURTYARD OF FALLING ASH: Crimson embers drift through the shattered shoji screens.' },
                { act: 'II', title: 'Act II: Ambush in the Mist', lens: 'Blades in Shadow', banner: 'ACT II — AMBUSH IN THE MIST: Shadow-Captain Hanzo steps from the lantern smoke!' },
                { act: 'III', title: 'Act III: The Wind-Swept Pagoda', lens: 'Tempest Duel', banner: 'ACT III — THE WIND-SWEPT PAGODA: Gale-Lord Kurama\'s steel rings through the rafters!' },
                { act: 'IV', title: 'Act IV: Gate of the Iron Oni', lens: 'Thunderous Siege', banner: 'ACT IV — GATE OF THE IRON ONI: General Ibaraki raises his spiked kanabo before the inner keep!' },
                { act: 'V', title: 'Act V: Throne of the Ember Shogun', lens: 'Final Duel', banner: 'ACT V — THRONE OF THE EMBER SHOGUN: Shogun Kagutsuchi draws his twin cinder-blades!' }
            ]
        },
        clockwork_abyss: {
            id: 'clockwork_abyss',
            title: 'The Clockwork Abyss',
            subtitle: 'Vault of the Deep Architect',
            chronicler: 'Artificer Lyra Thorne',
            deity: 'The Prime Mechanism',
            traditionKey: 'sword_and_sorcery',
            goalItemName: 'Chronos Core of the Architect',
            goalGlyph: '*',
            elderRumor: 'The Deep Architect\'s subterranean foundry is grinding the tectonic plates to dust; extract the Chronos Core before the gears lock forever.',
            nemesis: { name: 'Arch-Automaton Omega, the Deep Architect', glyph: 'G', attr: 14, hp: 102, ac: -3, dmg: 25, lore: 'Towering brass-and-aether sovereign powered by a captive star.' },
            actGuardians: [
                null,
                { name: 'Calibrated Turret-Prime', glyph: 'T', attr: 11, hp: 36, ac: 3, dmg: 10, lore: 'Multi-barrel arcane emitter locking onto intruders.' },
                { name: 'Forgemaster Talos-IV', glyph: 'g', attr: 14, hp: 56, ac: 1, dmg: 15, lore: 'Bronze piston-driven sentinel of the smelting halls.' },
                { name: 'Aether-Warden Solaris', glyph: 'X', attr: 13, hp: 78, ac: -1, dmg: 20, lore: 'Prismatic construct guarding the central gear-shaft.' }
            ],
            acts: [
                { act: 'I', title: 'Act I: The Brass Conduit', lens: 'Gears in the Dark', banner: 'ACT I — THE BRASS CONDUIT: Piston-hammers thud rhythmically through the stone beneath your boots.' },
                { act: 'II', title: 'Act II: The Calibration Gallery', lens: 'Crossfire', banner: 'ACT II — THE CALIBRATION GALLERY: Arcane targeting lenses swivel toward your torchlight!' },
                { act: 'III', title: 'Act III: The Smelting Crucible', lens: 'Molten Brass', banner: 'ACT III — THE SMELTING CRUCIBLE: Forgemaster Talos-IV steps from the furnace glare!' },
                { act: 'IV', title: 'Act IV: The Astral Gear-Shaft', lens: 'High Voltage', banner: 'ACT IV — THE ASTRAL GEAR-SHAFT: Aether-Warden Solaris hums with lethal resonance!' },
                { act: 'V', title: 'Act V: Engine of the Architect', lens: 'Core Overload', banner: 'ACT V — ENGINE OF THE ARCHITECT: Arch-Automaton Omega awakens around the Chronos Core!' }
            ]
        },
        sovereign_heist: {
            id: 'sovereign_heist',
            title: 'The Sovereign Heist',
            subtitle: 'Descent into the Vaults of Doom',
            chronicler: 'Roderick the Twice-Hanged',
            deity: 'Lady Luck & the Shadow',
            traditionKey: 'pulp_dungeoneer',
            goalItemName: 'Seal of the Sovereign Vault',
            goalGlyph: ',',
            elderRumor: 'Many delvers have gone down for the Sovereign Seal, but the real trick isn\'t just prying it from the Arch-Warden—it\'s making it back out alive!',
            nemesis: { name: 'Arch-Warden Valerius of the Deep Vault', glyph: 'L', attr: 14, hp: 94, ac: -2, dmg: 24, lore: 'Immortal vault-keeper who has claimed the skulls of a hundred would-be thieves.' },
            actGuardians: [
                null,
                { name: 'Tax-Collector Grimsby', glyph: 'G', attr: 3, hp: 34, ac: 4, dmg: 9, lore: 'Armored gnome bailiff demanding a toll in blood or gold.' },
                { name: 'The Vault Cockatrice', glyph: 'c', attr: 14, hp: 52, ac: 2, dmg: 14, lore: 'Prized guard-beast surrounded by suspiciously lifelike statues.' },
                { name: 'Asterion the Labyrinth Bull', glyph: 'H', attr: 4, hp: 74, ac: 1, dmg: 19, lore: 'Scarred minotaur champion patrolling the final treasury.' }
            ],
            acts: [
                { act: 'I', title: 'Act I: Casing the Upper Mazes', lens: 'Torch & Lockpick', banner: 'ACT I — CASING THE UPPER MAZES: Every chest is a promise, and every flagstone a potential trap.' },
                { act: 'II', title: 'Act II: The Bailiff\'s Toll-Gate', lens: 'Blood or Gold', banner: 'ACT II — THE BAILIFF\'S TOLL-GATE: Tax-Collector Grimsby blocks the treasury stairs!' },
                { act: 'III', title: 'Act III: Gallery of Statues', lens: 'Petrifying Dread', banner: 'ACT III — GALLERY OF STATUES: Don\'t look the Vault Cockatrice in the eye!' },
                { act: 'IV', title: 'Act IV: The Minotaur\'s Maze', lens: 'No Way Out', banner: 'ACT IV — THE MINOTAUR\'S MAZE: Asterion\'s hooves thunder down the narrow corridors!' },
                { act: 'V', title: 'Act V: The Sovereign Treasury', lens: 'Grab & Escape', banner: 'ACT V — THE SOVEREIGN TREASURY: Seize the Seal from Arch-Warden Valerius and fight your way out!' }
            ]
        },
        iron_crown_song: {
            id: 'iron_crown_song',
            title: 'The Song of the Iron Crown',
            subtitle: 'Lay of the Starlit Jewel',
            chronicler: 'Pengolodh of the Grey Havens',
            deity: 'The Secret Fire',
            traditionKey: 'tolkien_high_myth',
            goalItemName: 'Star-Jewel of the Iron Crown',
            goalGlyph: '*',
            elderRumor: 'Descend into the northern iron-fortress, wrest a single Star-Jewel from the Dark Throne, and carry its light back to the upper air.',
            nemesis: { name: 'Gothmog, Lord of the Iron Host', glyph: 'U', attr: 4, hp: 98, ac: -2, dmg: 26, lore: 'Supreme captain of the abyssal citadel wielding a black axe and whip of flame.' },
            actGuardians: [
                null,
                { name: 'Boldog the Orc-Captain', glyph: 'o', attr: 4, hp: 35, ac: 4, dmg: 10, lore: 'Iron-helmed chieftain of the gate guard.' },
                { name: 'Draugluin, Sire of Werewolves', glyph: 'C', attr: 8, hp: 56, ac: 2, dmg: 15, lore: 'Dread wolf-lord whose howl shakes the dungeon roof.' },
                { name: 'Ungoliant\'s Brood-Mother', glyph: 'S', attr: 8, hp: 76, ac: 0, dmg: 20, lore: 'Bloated weaver of unlight guarding the lower stair.' }
            ],
            acts: [
                { act: 'I', title: 'Act I: Gates of Frost and Iron', lens: 'Stealth & Song', banner: 'ACT I — GATES OF FROST AND IRON: The wind howls behind you as you step into the northern delves.' },
                { act: 'II', title: 'Act II: The Guardroom Drums', lens: 'Steel in the Dark', banner: 'ACT II — THE GUARDROOM DRUMS: Boldog\'s iron-shod spears echo down the stair!' },
                { act: 'III', title: 'Act III: Lair of the Wolf-Sire', lens: 'Fangs in Shadow', banner: 'ACT III — LAIR OF THE WOLF-SIRE: Draugluin stalks the pillared halls ahead!' },
                { act: 'IV', title: 'Act IV: Webs of Unlight', lens: 'Suffocating Gloom', banner: 'ACT IV — WEBS OF UNLIGHT: Your torchlight dims against the Brood-Mother\'s dark silk!' },
                { act: 'V', title: 'Act V: The Hall of the Iron Crown', lens: 'Wrest the Jewel', banner: 'ACT V — THE HALL OF THE IRON CROWN: Claim the Star-Jewel before the Lord of the Iron Host!' }
            ]
        },
        bureaucracy_of_doom: {
            id: 'bureaucracy_of_doom',
            title: 'The Bureaucracy of Doom',
            subtitle: 'Sub-Basement 99B: Department of Perpetual Audits (Parody)',
            chronicler: 'Clerk-Magistrate Bixby (Unpaid Intern)',
            deity: 'The Actuarial Table',
            traditionKey: 'satirical_parody',
            goalItemName: 'Notarized Form 27B/6 (In Triplicate)',
            goalGlyph: '?',
            elderRumor: 'Your license to exist was misfiled in Sub-Basement 99B! Retrieve Notarized Form 27B/6 from the Infernal Auditor-General before fiscal midnight.',
            nemesis: { name: 'Malphas, the Infernal Auditor-General', glyph: 'U', attr: 13, hp: 90, ac: -2, dmg: 23, lore: 'Bespoke-suited arch-fiend armed with a flaming red-ink ledger and retroactive penalties.' },
            actGuardians: [
                null,
                { name: 'Sub-Section Chief Grik (Reception)', glyph: 'i', attr: 4, hp: 32, ac: 4, dmg: 9, lore: 'Impish receptionist who rejects every adventurer without an appointment.' },
                { name: 'Actuary Vex, Eater of Deductions', glyph: 'h', attr: 13, hp: 52, ac: 2, dmg: 14, lore: 'Mind-flayer bureaucrat who extracts itemized receipts straight from your cortex.' },
                { name: 'Compliance Golem Mark-IX', glyph: 'G', attr: 14, hp: 74, ac: 0, dmg: 19, lore: 'Ten-ton brass filing cabinet that stamps intruders "VOID".' }
            ],
            acts: [
                { act: 'I', title: 'Act I: Please Take a Number', lens: 'Queue of the Damned', banner: 'ACT I — PLEASE TAKE A NUMBER: You are currently #8,492 in queue. Estimated wait: Eternity.' },
                { act: 'II', title: 'Act II: Improperly Stamped', lens: 'Red Tape Hazard', banner: 'ACT II — IMPROPERLY STAMPED: Sub-Section Chief Grik demands your Dungeon Delving Permit!' },
                { act: 'III', title: 'Act III: The Itemized Deduction', lens: 'Psychic Audit', banner: 'ACT III — THE ITEMIZED DEDUCTION: Actuary Vex has flagged your inventory for non-compliance!' },
                { act: 'IV', title: 'Act IV: Mandatory Arbitration', lens: 'Heavy Machinery', banner: 'ACT IV — MANDATORY ARBITRATION: Compliance Golem Mark-IX rolls down the corridor!' },
                { act: 'V', title: 'Act V: The Final Audit', lens: 'Sign in Blood', banner: 'ACT V — THE FINAL AUDIT: Seize Form 27B/6 from the Infernal Auditor-General!' }
            ]
        }
    };

    // 8 Coherent Master Campaign Archetypes (Used by Presets & Smart Randomize — NEVER "Random Crazy"!)
    const WORLD_ARCHETYPES = [
        {
            id: 'obsidian_covenant',
            label: '🏰 Obsidian Covenant (Classic Dark-Fantasy Bastion)',
            biome: 'obsidian',
            storyArc: 'shattered_covenant',
            bestiary: 'warbands',
            heroOrigin: 'warrior',
            powerDiscipline: 'arcane',
            progressionMode: 'xp',
            beatitude: false,
            pet: 'war_hound',
            captiveAllies: true,
            hasTown: true,
            goalDepth: 15,
            victoryMode: 'boss_kill',
            hazardDensity: 'tactical',
            difficulty: 'standard',
            audioTheme: 'angband'
        },
        {
            id: 'gothic_necropolis',
            label: '🧛 Gothic Necropolis (Crypts, Altars & Undead Court)',
            biome: 'catacombs',
            storyArc: 'ossuary_crown',
            bestiary: 'necropolis',
            heroOrigin: 'vampire_scion',
            powerDiscipline: 'piety',
            progressionMode: 'xp',
            beatitude: true,
            pet: 'shadow_panther',
            captiveAllies: false,
            hasTown: true,
            goalDepth: 15,
            victoryMode: 'boss_kill',
            hazardDensity: 'tactical',
            difficulty: 'standard',
            audioTheme: 'nethack'
        },
        {
            id: 'underdark_plague',
            label: '🍄 Bioluminescent Underdark (Brogue Tactics, Allies & Chasms)',
            biome: 'bioluminescent',
            storyArc: 'spore_choir',
            bestiary: 'beasts_wyrms',
            heroOrigin: 'ranger',
            powerDiscipline: 'arcane',
            progressionMode: 'brogue_item',
            beatitude: false,
            pet: 'none',
            captiveAllies: true,
            hasTown: false,
            goalDepth: 15,
            victoryMode: 'ascension',
            hazardDensity: 'abundant',
            difficulty: 'standard',
            audioTheme: 'brogue'
        },
        {
            id: 'shadow_shogunate',
            label: '⛩️ Eastern Shadow Keep (Samurai, Bushido & Oni Warlords)',
            biome: 'shadow_keep',
            storyArc: 'crown_of_cinders',
            bestiary: 'eastern_oni',
            heroOrigin: 'samurai',
            powerDiscipline: 'martial',
            progressionMode: 'hybrid',
            beatitude: false,
            pet: 'war_hound',
            captiveAllies: true,
            hasTown: true,
            goalDepth: 15,
            victoryMode: 'boss_kill',
            hazardDensity: 'tactical',
            difficulty: 'standard',
            audioTheme: 'hengband'
        },
        {
            id: 'clockwork_abyss',
            label: '⚙️ Clockwork Arcane Vault (Golems, Turrets & Astral Core)',
            biome: 'chaos_rift',
            storyArc: 'clockwork_abyss',
            bestiary: 'constructs',
            heroOrigin: 'iron_golem',
            powerDiscipline: 'arcane',
            progressionMode: 'hybrid',
            beatitude: false,
            pet: 'none',
            captiveAllies: true,
            hasTown: true,
            goalDepth: 15,
            victoryMode: 'boss_kill',
            hazardDensity: 'tactical',
            difficulty: 'standard',
            audioTheme: 'dcss'
        },
        {
            id: 'silmaril_song',
            label: '🎵 Song-Quest of the Iron Crown (Sil-Q Voice & Stealth Heist)',
            biome: 'obsidian',
            storyArc: 'iron_crown_song',
            bestiary: 'shadow_host',
            heroOrigin: 'valkyrie',
            powerDiscipline: 'songs',
            progressionMode: 'xp',
            beatitude: false,
            pet: 'none',
            captiveAllies: false,
            hasTown: false,
            goalDepth: 12,
            victoryMode: 'ascension',
            hazardDensity: 'tactical',
            difficulty: 'standard',
            audioTheme: 'silq'
        },
        {
            id: 'sanctum_heist',
            label: '🗝️ Dungeons of Doom Heist (NetHack/Rogue Pet & Escape)',
            biome: 'catacombs',
            storyArc: 'sovereign_heist',
            bestiary: 'dungeons_of_doom',
            heroOrigin: 'rogue',
            powerDiscipline: 'piety',
            progressionMode: 'xp',
            beatitude: true,
            pet: 'war_hound',
            captiveAllies: true,
            hasTown: true,
            goalDepth: 15,
            victoryMode: 'ascension',
            hazardDensity: 'tactical',
            difficulty: 'standard',
            audioTheme: 'rogue'
        },
        {
            id: 'bureaucracy_parody',
            label: '📜 The Bureaucracy of Doom (Satirical Abyssal Audit)',
            biome: 'chaos_rift',
            storyArc: 'bureaucracy_of_doom',
            bestiary: 'eldritch_abyssal',
            heroOrigin: 'arch_lich',
            powerDiscipline: 'arcane',
            progressionMode: 'hybrid',
            beatitude: true,
            pet: 'fire_drake',
            captiveAllies: true,
            hasTown: true,
            goalDepth: 10,
            victoryMode: 'ascension',
            hazardDensity: 'tactical',
            difficulty: 'standard',
            audioTheme: 'frogcomposband'
        }
    ];

    // Canonical Cross-Realm Loot Pool (100% backed by MASTER_ITEM_REGISTRY)
    const BASE_LOOT_POOL = [
        { kind: 'potion', name: 'potion of healing', glyph: '!', attr: 11, heal: 28, weight: 10, tval: 71, sval: 28 },
        { kind: 'potion', name: 'potion of extra healing', glyph: '!', attr: 4, heal: 45, weight: 10, tval: 71, sval: 35 },
        { kind: 'potion', name: 'potion of restore mana', glyph: '!', attr: 13, mana: 20, weight: 10, tval: 71, sval: 42 },
        { kind: 'potion', name: 'potion of strength', glyph: '!', attr: 14, strengthGain: 2, heal: 15, weight: 12, tval: 71, sval: 40 },
        { kind: 'scroll', name: 'scroll of enchanting', glyph: '?', attr: 11, enchantGain: 1, weight: 5, tval: 70, sval: 15 },
        { kind: 'scroll', name: 'scroll of teleportation', glyph: '?', attr: 11, weight: 5, tval: 70, sval: 8 },
        { kind: 'scroll', name: 'scroll of magic mapping', glyph: '?', attr: 14, weight: 5, tval: 70, sval: 12 },
        { kind: 'scroll', name: 'scroll of remove curse', glyph: '?', attr: 15, weight: 5, tval: 70, sval: 20 },
        { kind: 'food', name: 'iron ration', glyph: ':', attr: 3, nutrition: 900, weight: 20, tval: 80, sval: 1 },
        { kind: 'food', name: 'lembas wafer', glyph: ':', attr: 14, nutrition: 1100, heal: 10, weight: 8, tval: 80, sval: 3 },
        { kind: 'wand', name: 'wand of lightning bolts [5/5]', glyph: '-', attr: 11, charges: 5, weight: 12, tval: 65, sval: 8 },
        { kind: 'wand', name: 'wand of fireballs [4/4]', glyph: '-', attr: 4, charges: 4, weight: 14, tval: 65, sval: 12 },
        { kind: 'wand', name: 'staff of cold bolts [5/5]', glyph: '\\', attr: 15, charges: 5, weight: 18, tval: 55, sval: 7 },
        { kind: 'weapon', name: 'elven broadsword', glyph: ')', attr: 11, bonus: 2, weight: 38, tval: 23, sval: 16 },
        { kind: 'weapon', name: 'forged katana', glyph: ')', attr: 15, bonus: 3, weight: 35, tval: 23, sval: 20 },
        { kind: 'weapon', name: 'dwarven battle axe', glyph: ')', attr: 3, bonus: 3, weight: 50, tval: 22, sval: 14 },
        { kind: 'weapon', name: 'runed war spear', glyph: ')', attr: 14, bonus: 2, weight: 42, tval: 22, sval: 8 },
        { kind: 'armor', name: 'mithril chain mail', glyph: '[', attr: 11, ac: 8, bonus: 2, weight: 150, tval: 37, sval: 6 },
        { kind: 'armor', name: 'dragon scale mail', glyph: '[', attr: 4, ac: 10, bonus: 3, weight: 200, tval: 38, sval: 4 },
        { kind: 'armor', name: 'cloak of protection', glyph: '(', attr: 10, ac: 5, bonus: 2, weight: 60, tval: 35, sval: 2 }
    ];

    // Forward-compatibility registry for future 9th+ official realms
    const _customRealms = new Map();

    /**
     * Builds the Omni-Pantheon monster list dynamically across all factions + any registered 9th+ realms.
     */
    function getOmniPantheonMonsters() {
        const seen = new Set();
        const out = [];
        for (const fac of Object.values(BESTIARY_FACTIONS)) {
            if (!fac || !Array.isArray(fac.monsters)) continue;
            for (const m of fac.monsters) {
                const key = m.name.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push({ ...m });
                }
            }
        }
        for (const custom of _customRealms.values()) {
            if (Array.isArray(custom.monsters)) {
                for (const m of custom.monsters) {
                    const key = String(m.name || '').toLowerCase();
                    if (key && !seen.has(key)) {
                        seen.add(key);
                        out.push({ tier: m.tier || Math.min(5, Math.max(1, Math.ceil((m.minDepth || 1) / 4))), ...m });
                    }
                }
            }
        }
        return out;
    }

    /**
     * Forward-Compatibility Assimilation Hook:
     * When a new official realm (9th+) is added via `RealmCartridge.registerRealm(id, spec)`
     * or `RealmContentPool.registerRealmContent(id, spec)`, its unique monsters, roles, items,
     * and stories are automatically assimilated into RYOD!
     */
    function registerRealmContent(realmId, spec = {}) {
        const cleanId = String(realmId || '').toLowerCase().trim();
        if (!cleanId || cleanId === 'ryod') return false;

        _customRealms.set(cleanId, spec);

        if (Array.isArray(spec.monsters) && spec.monsters.length > 0) {
            const facId = `realm_${cleanId}`;
            BESTIARY_FACTIONS[facId] = {
                id: facId,
                label: `${spec.title || cleanId.toUpperCase()} Bestiary`,
                monsters: spec.monsters.map((m, idx) => ({
                    name: m.name || `denizen_${idx}`,
                    glyph: m.glyph || 'm',
                    attr: m.attr || 15,
                    tier: m.tier || Math.min(5, Math.max(1, Math.ceil((m.minDepth || (idx + 1)) / 3))),
                    hp: m.hp || 18,
                    ac: typeof m.ac === 'number' ? m.ac : 5,
                    dmg: m.dmg || 6,
                    exp: m.exp || 20,
                    lore: m.lore || `Assimilated denizen from ${spec.title || cleanId}.`
                }))
            };
        }

        if (Array.isArray(spec.roles)) {
            for (const r of spec.roles) {
                const roleId = `${cleanId}_${String(r.id || r.name || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
                if (!HERO_ORIGINS[roleId]) {
                    HERO_ORIGINS[roleId] = {
                        id: roleId,
                        label: `${r.id || r.name} (${spec.title || cleanId})`,
                        isMonsterAvatar: Boolean(r.isMonsterAvatar),
                        avatarMonsterName: r.avatarMonsterName || null,
                        race: r.race || 'Human',
                        roleName: r.id || r.name || 'Adventurer',
                        align: r.align || 'Neutral',
                        defaultDiscipline: r.defaultDiscipline || 'arcane',
                        hp: r.hp || 32,
                        pw: r.pw || 14,
                        ac: r.ac || 4,
                        str: r.str || 14, int: r.int || 14, wis: r.wis || 14, dex: r.dex || 14, con: r.con || 14,
                        weapon: r.weapon || { name: 'broad sword', dmg: '2d5', bonus: 1, weight: 40, tval: 23, sval: 16 },
                        armor: r.armor || { name: 'leather armor', ac: 4, bonus: 1, weight: 110, tval: 36, sval: 4 },
                        extra: r.extra || null,
                        innatePower: r.innatePower || { name: 'Sovereign Strike', cost: 2, dmg: 16, heal: 0, desc: 'Signature technique from ' + (spec.title || cleanId) + '.' }
                    };
                }
            }
        }

        if (Array.isArray(spec.items)) {
            for (const it of spec.items) {
                if (it && it.name && !BASE_LOOT_POOL.some(x => x.name === it.name)) {
                    BASE_LOOT_POOL.push({ ...it });
                }
            }
        }

        if (spec.storyArc && spec.storyArc.id) {
            STORY_ARCS[spec.storyArc.id] = spec.storyArc;
        }

        return true;
    }

    function getRegisteredCustomRealms() {
        return Array.from(_customRealms.keys());
    }

    return {
        BIOMES,
        HERO_ORIGINS,
        POWER_DISCIPLINES,
        PET_COMPANIONS,
        CAPTIVE_ALLIES,
        BESTIARY_FACTIONS,
        STORY_ARCS,
        WORLD_ARCHETYPES,
        MAP_LAYOUTS,
        WORLD_MUTATORS,
        BASE_LOOT_POOL,
        getOmniPantheonMonsters,
        registerRealmContent,
        getRegisteredCustomRealms
    };
});

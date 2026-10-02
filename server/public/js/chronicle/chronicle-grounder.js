/**
 * ChronicleGrounder — Strict Lorekeeper, Fact-Sheet Compiler & 4th-Wall Guide
 * Grounded in canon Tolkien lore, creature/player states, survival guide knowledge,
 * and the three literary traditions of Arda.
 */

class ChronicleGrounder {
    static TRADITIONS = {
        noldor: {
            id: 'noldor',
            name: 'The Annals of the Noldor',
            badge: 'Elven Elegiac',
            style: 'Elegiac, sorrowful, singing of lost light, noble tragedy, beauty amidst doom, rich in Tolkien nomenclature.'
        },
        westmarch: {
            id: 'westmarch',
            name: 'The Red Book of Westmarch',
            badge: 'Heroic Chronicle',
            style: 'Direct, courageous, humble steadfastness, songs of forgotten valor, stubborn endurance against darkness.'
        },
        khazad: {
            id: 'khazad',
            name: 'The Record of Khazad-Dûm',
            badge: 'Dwarven Annals',
            style: 'Deep, solemn, stone-hewn, measured rhythmic prose, ancient foundations, delve-depth, forged steel, and oaths.'
        }
    };

    static CANON_ARTIFACT_LORE = {
        "Phial of Galadriel": "It shines with the trapped light of Eärendil's Star, distilled from the Silmaril. In places where all other lights go out, its silver ray pierces the deepest dark of Morgoth.",
        "Glamdring": "The Foe-hammer, forged in hidden Gondolin for King Turgon himself. The goblins of the Misty Mountains trembled before its cold, white gleam, naming it 'Beater'.",
        "Ring of Barahir": "A ring of twin serpents with eyes of green emerald, crowned by golden flowers. Worn by Beren in the dread quest for the Silmaril; an eternal token of kinship between Elves and Men.",
        "Arkenstone": "A great white gem, cut by the Dwarves of Erebor, that gathered the light of all fires into a thousand shining facets. The Heart of the Mountain.",
        "Narsil": "The blade forged by Telchar of Nogrod, which shore the One Ring from Sauron's hand before the Black Gate.",
        "Sting": "An elven dagger forged in Gondolin that glows with cold blue light when Orcs or Goblins draw near.",
        "Amulet of Carlammas": "A talisman of ancient craft offering ward against fire and terror, steeped in the blessing of the Valar."
    };

    /**
     * Auto-attunes literary tradition based on player's chosen race
     */
    static getTraditionForRace(race = '') {
        const r = (race || '').toLowerCase();
        if (r.includes('elf') || r.includes('eldar')) return 'noldor';
        if (r.includes('dwarf')) return 'khazad';
        return 'westmarch'; // Human, Dunadan, Hobbit, Half-Orc, etc.
    }

    /**
     * Contextual pronouns and narrative titles aligned with creature gender.
     */
    static getPronouns(gender = 'male') {
        const isF = (gender === 'female');
        return {
            he: isF ? 'she' : 'he',
            him: isF ? 'her' : 'him',
            his: isF ? 'her' : 'his',
            himself: isF ? 'herself' : 'himself',
            person: isF ? 'woman' : 'man',
            soldier: isF ? 'swordswoman' : 'swordsman',
            warrior: isF ? 'warrior woman' : 'warrior',
            veteranTitle: isF ? 'battle-scarred swordswoman' : 'battle-scarred veteran',
            honorific: isF ? 'milady' : 'milord',
            formal: isF ? 'dame' : 'sir',
            kin: isF ? 'sister' : 'brother'
        };
    }

    /**
     * Progressive dialogue encounter index tracker to prevent repeating the exact same lines.
     */
    static _encounterCounters = new Map();
    static getNextEncounterIndex(creatureKey) {
        const count = (this._encounterCounters.get(creatureKey) || 0) + 1;
        this._encounterCounters.set(creatureKey, count);
        return count;
    }

    /**
     * Detects biological/lore gender of creatures for appropriate voice selection.
     * Synchronizes 100% with 3D character models and narrative prose.
     */
    static detectCreatureGender(name = '', monster = null) {
        // 1. Authoritative 3D Model & Entity Gender Tag
        if (monster) {
            if (monster.isFemale === true) return 'female';
            if (monster.modelGender || monster.gender || monster.sex) {
                const rawG = String(monster.modelGender || monster.gender || monster.sex).toLowerCase();
                if (rawG.startsWith('f')) return 'female';
                if (rawG.startsWith('m')) return 'male';
            }
            if (monster.modelKey === 'casual' || monster.modelKey === 'witch') {
                return 'female';
            }
            if (monster.modelKey && ['farmer', 'worker', 'adventurer', 'medieval', 'punk', 'soldier', 'king'].includes(monster.modelKey)) {
                return 'male';
            }
            // Check active 3D world scene entity if present (try all known globals)
            const dungeon = (typeof window !== 'undefined')
                ? (window.dungeon || (window.__app && window.__app.dungeon) || (window.chronicleManager && window.chronicleManager.dungeon))
                : null;
            if (dungeon && dungeon.monsters) {
                const id = monster.id !== undefined ? monster.id.toString() : (monster.x !== undefined ? `${monster.x}_${monster.y}_${monster.glyph}` : null);
                if (id && dungeon.monsters.has(id)) {
                    const ent = dungeon.monsters.get(id);
                    if (ent) {
                        if (ent.isFemale === true || ent.modelGender === 'female' || ent.modelKey === 'casual' || ent.modelKey === 'witch') {
                            return 'female';
                        }
                        if (ent.config && (ent.config.gender === 'female' || ent.config.templateKey === 'casual' || ent.config.templateKey === 'witch')) {
                            return 'female';
                        }
                        if (ent.monsterData && (ent.monsterData.isFemale === true || ent.monsterData.modelGender === 'female')) {
                            return 'female';
                        }
                        if (ent.modelGender) {
                            const raw = String(ent.modelGender).toLowerCase();
                            if (raw.startsWith('f')) return 'female';
                            if (raw.startsWith('m')) return 'male';
                        }
                        if (ent.config && ent.config.gender) {
                            const raw = String(ent.config.gender).toLowerCase();
                            if (raw.startsWith('f')) return 'female';
                            if (raw.startsWith('m')) return 'male';
                        }
                    }
                }
            }
        }

        const lower = name.toLowerCase();

        // 2. Explicit Female Keywords (Takes absolute precedence over generic role words)
        if (/\b(queen|maiden|crone|hag|witch|priestess|sorceress|enchantress|temptress|mistress|matron|siren|harpy|nymph|dryad|medusa|gorgon|banshee|shelob|thuringwethil|ungoliant|lobelia|maid|woman|lady|princess|duchess|daughter|mother|sister|wife|vixen|female|girl)\b/i.test(lower)) {
            return 'female';
        }

        // 3. Explicit Male Biological/Title Roles Only (Excludes generic professions like veteran/beggar/rogue)
        if (/\b(king|prince|lord|patriarch|emperor|baron|warlock|father|brother|man|boy|son|husband|male)\b/i.test(lower)) {
            return 'male';
        }

        // 4. Balanced 50/50 Deterministic distribution matching dungeon3d.js when monster entity is present
        if (monster) {
            const mId = monster.id ? monster.id : 0;
            const mX = monster.x ? monster.x : 0;
            const mY = monster.y ? monster.y : 0;
            const seed = Math.abs(lower.length * 31 + mId * 17 + mX * 23 + mY * 19);
            return (seed % 2 === 0) ? 'female' : 'male';
        }

        // 5. Default fallback for bare strings with no monster instance or gender markers
        return 'male';
    }

    static instanceVoiceRegistry = new Map();

    static clearInstanceVoiceRegistry() {
        this.instanceVoiceRegistry.clear();
    }

    static hashString(str = '') {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    static getInstanceKey(entityOrMonster = null, player = null, traditionKey = 'westmarch') {
        if (!entityOrMonster) {
            return `narrator_${traditionKey || 'westmarch'}`;
        }
        if (entityOrMonster.isLorekeeper || (entityOrMonster.name && entityOrMonster.name.toLowerCase().includes('lorekeeper'))) {
            return 'mentor_lorekeeper';
        }
        if (entityOrMonster.id !== undefined && entityOrMonster.id !== null) {
            return `id_${entityOrMonster.id}`;
        }
        if (entityOrMonster.uniqueKey) {
            return `unique_${entityOrMonster.uniqueKey}`;
        }
        if (entityOrMonster.isUnique && entityOrMonster.name) {
            return `unique_${entityOrMonster.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        }
        const name = (entityOrMonster.name || entityOrMonster.race || 'creature').toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (entityOrMonster.x !== undefined && entityOrMonster.y !== undefined) {
            const depth = (player && player.depth !== undefined) ? player.depth : 0;
            return `coord_${entityOrMonster.x}_${entityOrMonster.y}_${name}_d${depth}`;
        }
        return `named_${name}`;
    }

    static BEST_VOICE_POOLS = {
        orc: {
            male: {
                edge: ['en-US-RogerNeural', 'en-US-ChristopherNeural', 'en-US-EricNeural'],
                gemini: ['Fenrir', 'Algenib']
            },
            female: {
                edge: ['en-US-AriaNeural', 'en-AU-NatashaNeural'],
                gemini: ['Fenrir', 'Kore']
            }
        },
        dwarf: {
            male: {
                edge: ['en-US-RogerNeural', 'en-US-BrianNeural', 'en-IE-ConnorNeural'],
                gemini: ['Algenib', 'Gacrux']
            },
            female: {
                edge: ['en-CA-ClaraNeural', 'en-US-JennyNeural'],
                gemini: ['Kore', 'Sadaltager']
            }
        },
        elf: {
            male: {
                edge: ['en-GB-ThomasNeural', 'en-GB-RyanNeural'],
                gemini: ['Zephyrus', 'Orus']
            },
            female: {
                edge: ['en-GB-LibbyNeural', 'en-IE-EmilyNeural'],
                gemini: ['Aoede', 'Despina']
            }
        },
        hobbit: {
            male: {
                edge: ['en-IE-ConnorNeural', 'en-US-GuyNeural'],
                gemini: ['Puck', 'Sulafat']
            },
            female: {
                edge: ['en-IE-EmilyNeural', 'en-GB-MaisieNeural'],
                gemini: ['Leda', 'Aoede']
            }
        },
        dragon: {
            male: {
                edge: ['en-US-ChristopherNeural', 'en-US-RogerNeural'],
                gemini: ['Algenib', 'Fenrir']
            },
            female: {
                edge: ['en-GB-SoniaNeural', 'en-US-AriaNeural'],
                gemini: ['Despina', 'Sadaltager']
            }
        },
        undead: {
            male: {
                edge: ['en-US-ChristopherNeural', 'en-US-RogerNeural'],
                gemini: ['Algenib', 'Fenrir']
            },
            female: {
                edge: ['en-GB-SoniaNeural', 'en-US-AriaNeural'],
                gemini: ['Despina', 'Sadaltager']
            }
        },
        mortal: {
            elder: {
                male: {
                    edge: ['en-US-BrianNeural', 'en-US-RogerNeural', 'en-AU-WilliamMultilingualNeural'],
                    gemini: ['Gacrux', 'Sulafat']
                },
                female: {
                    edge: ['en-CA-ClaraNeural', 'en-GB-LibbyNeural'],
                    gemini: ['Sadaltager', 'Despina']
                }
            },
            veteran: {
                male: {
                    edge: ['en-US-EricNeural', 'en-US-SteffanNeural', 'en-US-BrianNeural'],
                    gemini: ['Orus', 'Algenib']
                },
                female: {
                    edge: ['en-AU-NatashaNeural', 'en-US-AriaNeural', 'en-GB-SoniaNeural'],
                    gemini: ['Kore', 'Sadaltager']
                }
            },
            youth: {
                male: {
                    edge: ['en-US-GuyNeural', 'en-CA-LiamNeural'],
                    gemini: ['Puck', 'Zephyrus']
                },
                female: {
                    edge: ['en-GB-MaisieNeural', 'en-IE-EmilyNeural'],
                    gemini: ['Aoede', 'Leda']
                }
            },
            adult: {
                male: {
                    edge: ['en-US-GuyNeural', 'en-IE-ConnorNeural', 'en-CA-LiamNeural', 'en-GB-RyanNeural'],
                    gemini: ['Sulafat', 'Puck', 'Orus']
                },
                female: {
                    edge: ['en-GB-LibbyNeural', 'en-US-JennyNeural', 'en-IE-EmilyNeural', 'en-CA-ClaraNeural'],
                    gemini: ['Aoede', 'Leda', 'Kore']
                }
            }
        }
    };

    /**
     * Resolves rich neural voices attuned to creature instance seed,
     * maintaining strict continuity across encounters.
     */
    static pickCreatureVoice(monster, category) {
        const profile = this.resolveVoiceProfile(monster);
        return profile ? profile.edgeVoice : 'en-US-GuyNeural';
    }

    /**
     * Contextual Voice & Emotion Resolver
     * Selects optimal voices with persistent continuity per instance while ensuring
     * unique variation instance-to-instance, strictly honoring character race, age, and 3D visual sex.
     */
    static resolveVoiceProfile(entityOrMonster = null, player = null, eventType = '', traditionKey = 'westmarch') {
        const instanceKey = this.getInstanceKey(entityOrMonster, player, traditionKey);
        let cached = this.instanceVoiceRegistry.get(instanceKey);

        let gender, isF, raceArchetype, ageArchetype, edgeVoice, geminiVoice;

        if (cached) {
            // Continuity: retain exact identity (voice, gender, race, age)
            gender = cached.gender;
            isF = cached.isFemale;
            raceArchetype = cached.race;
            ageArchetype = cached.ageArchetype;
            edgeVoice = cached.edgeVoice;
            geminiVoice = cached.geminiVoice;
        } else {
            // 1. GENDER / SEX: 100% deterministic alignment from 3D model and creature detection
            const name = (entityOrMonster && (entityOrMonster.name || entityOrMonster.race)) ? (entityOrMonster.name || entityOrMonster.race) : '';
            gender = entityOrMonster ? this.detectCreatureGender(name, entityOrMonster) : 'male';
            isF = (gender === 'female');

            // 2. RACE DETECTION
            const rawRace = (entityOrMonster && (entityOrMonster.race || entityOrMonster.name)) 
                ? (entityOrMonster.race || entityOrMonster.name) 
                : (player ? player.race : '');
            const rLower = (rawRace || '').toLowerCase();
            raceArchetype = 'mortal';
            if (rLower.includes('elf') || rLower.includes('eldar')) raceArchetype = 'elf';
            else if (rLower.includes('dwarf')) raceArchetype = 'dwarf';
            else if (rLower.includes('hobbit') || rLower.includes('halfling')) raceArchetype = 'hobbit';
            else if (rLower.includes('orc') || rLower.includes('goblin') || rLower.includes('troll') || rLower.includes('kobold')) raceArchetype = 'orc';
            else if (rLower.includes('dragon') || rLower.includes('drake') || rLower.includes('wyrm')) raceArchetype = 'dragon';
            else if (rLower.includes('undead') || rLower.includes('lich') || rLower.includes('ghost') || rLower.includes('spectre') || rLower.includes('wraith')) raceArchetype = 'undead';

            // 3. AGE & MARTIAL ARCHETYPE DETECTION
            const nLower = name.toLowerCase();
            ageArchetype = 'adult';
            if (/\b(ancient|elder|venerable|sage|archivist|scholar|old|crone|patriarch|matriarch|hermit|grey|white)\b/i.test(nLower) || (player && player.lev >= 35)) {
                ageArchetype = 'elder';
            } else if (/\b(veteran|soldier|commander|knight|captain|guard|warrior|mercenary|scarred)\b/i.test(nLower)) {
                ageArchetype = 'veteran';
            } else if (/\b(apprentice|youth|young|child|urchin|boy|girl|novice|thief|rogue|idiot|beggar)\b/i.test(nLower)) {
                ageArchetype = 'youth';
            }

            // 4. INSTANCE-TO-INSTANCE UNIQUE CASTING
            if (entityOrMonster) {
                const hash = this.hashString(instanceKey);
                const pools = this.BEST_VOICE_POOLS;
                let pool = null;

                if (raceArchetype === 'mortal') {
                    const ageCat = pools.mortal[ageArchetype] || pools.mortal.adult;
                    pool = isF ? ageCat.female : ageCat.male;
                } else if (pools[raceArchetype]) {
                    pool = isF ? pools[raceArchetype].female : pools[raceArchetype].male;
                } else {
                    pool = isF ? pools.mortal.adult.female : pools.mortal.adult.male;
                }

                edgeVoice = pool.edge[hash % pool.edge.length];
                geminiVoice = pool.gemini[hash % pool.gemini.length];
            } else {
                // Master Chronicler / Narrator attunement based on literary tradition
                if (traditionKey === 'noldor') {
                    edgeVoice = 'en-GB-LibbyNeural';
                    geminiVoice = 'Aoede';
                } else if (traditionKey === 'khazad') {
                    edgeVoice = 'en-US-RogerNeural';
                    geminiVoice = 'Algenib';
                } else {
                    edgeVoice = 'en-GB-RyanNeural';
                    geminiVoice = 'Sulafat';
                }
            }

            this.instanceVoiceRegistry.set(instanceKey, {
                edgeVoice,
                geminiVoice,
                gender,
                isFemale: isF,
                race: raceArchetype,
                ageArchetype
            });
        }

        // 5. EMOTIONAL CONTEXT FROM LIVE GAME TELEMETRY (DYNAMIC PER UTTERANCE)
        const hpRatio = (player && player.hp_max > 0) ? (player.hp / player.hp_max) : 1.0;
        const isPeril = hpRatio < 0.35;
        const isBleedingOrStun = player && (player.cut > 0 || player.stun > 0 || player.poisoned > 0 || player.confused > 0);
        const isBoss = entityOrMonster && (entityOrMonster.isUnique || entityOrMonster.glyph === 'P' || entityOrMonster.glyph === 'B' || entityOrMonster.glyph === 'U' || (entityOrMonster.name && /\b(morgoth|sauron|glaurung|balrog)\b/i.test(entityOrMonster.name)));
        const isStealth = player && (player.isSneaking || player.stealth > 5);
        const isTown = (player && player.depth === 0) || eventType === 'town' || eventType === 'shop';

        let emotion = 'calm';
        let geminiTag = '';
        let directorNote = '';
        let pitch = '+0Hz';
        let rate = '+0%';

        if (isPeril) {
            emotion = 'panicked';
            geminiTag = '[panicked, trembling]';
            directorNote = 'Desperate mortal panic, breathless and fighting for survival';
            pitch = '+3Hz';
            rate = '+8%';
        } else if (isBoss) {
            emotion = 'serious';
            geminiTag = '[grimly, with grave dread]';
            directorNote = 'An epic confrontation with an ancient terror of the First Age';
            pitch = '-2Hz';
            rate = '-4%';
        } else if (isBleedingOrStun) {
            emotion = 'strained';
            geminiTag = '[groaning in pain]';
            directorNote = 'Grievously wounded, voice trembling with pain';
            pitch = '+2Hz';
            rate = '+4%';
        } else if (isStealth) {
            emotion = 'whispering';
            geminiTag = '[whispers]';
            directorNote = 'Hushed stealth in complete darkness, avoiding waking patrolling monsters';
            pitch = '-1Hz';
            rate = '-7%';
        } else if (isTown) {
            emotion = 'cheerful';
            geminiTag = '[warmly, with hearty camaraderie]';
            directorNote = 'A warm fireside tavern keeper or friendly townsman';
            pitch = '+1Hz';
            rate = '+3%';
        } else {
            emotion = 'calm';
            geminiTag = '[atmospheric]';
            directorNote = 'A seasoned Tolkien chronicler narrating the journey with gravitas';
            pitch = '+0Hz';
            rate = '+0%';
        }

        return {
            instanceKey,
            gender,
            isFemale: isF,
            race: raceArchetype,
            ageArchetype,
            emotion,
            geminiTag,
            directorNote,
            pitch,
            rate,
            edgeVoice,
            geminiVoice
        };
    }

    /**
     * Comprehensive creature classification across all canon Angband monster families.
     * Distinguishes sentient vocal beings from non-vocal beasts, vermin, slimes, and constructs.
     */
    static classifyCreature(monster) {
        const name = (monster && (monster.name || monster.race)) ? (monster.name || monster.race) : 'creature';
        const lower = name.toLowerCase();
        const glyph = monster ? monster.glyph : '';
        const gender = this.detectCreatureGender(name, monster);
        const isF = (gender === 'female');
        const pr = {
            he: isF ? 'she' : 'he',
            him: isF ? 'her' : 'him',
            his: isF ? 'her' : 'his',
            himself: isF ? 'herself' : 'himself',
            He: isF ? 'She' : 'He',
            His: isF ? 'Her' : 'His',
            man: isF ? 'woman' : 'man'
        };

        // --- 1. SENTIENT VOCAL CREATURE FAMILIES (Priority check for spoken dialogue & barks) ---

        // 1. Blubbering Idiots & Eccentric Town Vagrants (Glyph 't', idiot)
        if (lower.includes('idiot')) {
            const v = this.pickCreatureVoice(monster, 'idiot');
            return {
                category: 'idiot',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: 'lies sprawled in the street dirt, fast asleep and drooling softly onto a grimy sleeve.',
                ambientBark: '"Hee-hee! Shiny stone in the dark! Don\'t hurt poor me, kind traveler!"',
                combatBark: (hp) => hp <= 0.35
                    ? '"Waaaah! Hurts, hurts! Mommy, why you hit?! Don\'t hit poor me!"'
                    : '"Screams and slobbers: No hit! Poor Gaffer got no coins! Waaah!"',
                assaultProse: (pName) => `Weeping and slobbering in panic, the blubbering idiot flails ${pr.his} arms wildly before ${pName}!`,
                assaultBark: () => 'Get back! Leave poor me alone!'
            };
        }

        // 2. Rogues, Thieves, Cutpurses, Bandits, Assassins
        if (lower.includes('rogue') || lower.includes('thief') || lower.includes('robber') ||
            lower.includes('cutpurse') || lower.includes('brigand') || lower.includes('bandit') ||
            lower.includes('blackguard') || lower.includes('assassin') || lower.includes('mugger')) {
            const v = this.pickCreatureVoice(monster, 'rogue');
            return {
                category: 'rogue',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: `lies sprawled behind an ale barrel, snoring heavily with one hand still resting on ${pr.his} notched dagger.`,
                ambientBark: lower.includes('squint')
                    ? '"Heh... looking for trouble in the alleys, stranger? Your purse, now."'
                    : '"Got any gold on you, traveler? Hand it over before things turn bloody."',
                combatBark: (hp) => hp <= 0.35
                    ? '"Curse your steel! Back off or I will drag you down with me!"'
                    : (lower.includes('squint') ? '"Heh... your purse or your life, traveler! Hand over the silver!"' : '"Drop your coin and you might just leave this alley alive!"'),
                assaultProse: (pName, act) => act === 'steals'
                    ? `With practiced cunning, the ${name} slices through the purse-strings at ${pName}'s hip, darting backward with clinking stolen coin!`
                    : `From the damp shadows of the alley, a ${name} springs forward with bared steel, striking at ${pName} in a sudden, vicious ambush!`,
                assaultBark: (act) => act === 'steals'
                    ? 'A fair toll for walking through my streets, fool! Ha-ha!'
                    : 'Hand over your purse, stranger, or I will paint these stones with your blood!'
            };
        }

        // 3. Beggars, Urchins & Outcasts (Glyph 't', beggar, urchin, leper)
        if (lower.includes('beggar') || lower.includes('urchin') || lower.includes('leper')) {
            const v = this.pickCreatureVoice(monster, 'beggar');
            return {
                category: 'beggar',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: 'lies huddled beneath tattered rags in the alley gutter, shivering softly in uneasy sleep.',
                ambientBark: '"Alms, noble traveler... a copper bit for a wretch cursed to walk these cold stones..."',
                beggingBark: '"Alms, kind traveler! Spare a copper coin for bread, I beg of you! May the stars guide your blade!"',
                combatBark: (hp) => hp <= 0.35
                    ? '"Mercy! I yield! I have no silver, only rags! Spare a poor soul!"'
                    : '"Why do you strike an unarmed beggar?! Guards, murder! Have mercy!"',
                assaultProse: (pName) => `A ${name} extends a trembling, grime-caked hand toward ${pName}, pleading for bread.`,
                assaultBark: () => 'Alms, kind traveler! Spare a copper bit for bread!'
            };
        }

        // 4. Mercenaries & Battle-Scarred Veterans
        if (lower.includes('veteran') || lower.includes('mercenary')) {
            const v = this.pickCreatureVoice(monster, 'veteran');
            return {
                category: 'veteran',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: `sleeps lightly with an arm wrapped around ${pr.his} scabbard, breathing in steady rasping gasps.`,
                ambientBark: '"Keep your steel oiled and your wits sharp. The deeper levels do not forgive hesitation."',
                insultBark: '"Think that shiny armor makes you a hero, runt? The orcs will use your ribs for firewood!"',
                combatBark: (hp) => hp <= 0.35
                    ? `"Curse your blade! A soldier dies on ${pr.his} feet!"`
                    : '"You want a taste of seasoned steel, fool?! Come on!"',
                assaultProse: (pName) => `The ${name} draws a scarred blade, stepping into a ready stance before ${pName}!`,
                assaultBark: () => 'Taste of veteran steel, runt!'
            };
        }

        // 5. Peaceful Townsfolk & Merchants (t, merchant, peasant, etc.)
        if (glyph === 't' || lower.includes('merchant') ||
            lower.includes('townsfolk') || lower.includes('peasant') || lower.includes('drunk') || lower.includes('sot')) {
            const v = this.pickCreatureVoice(monster, 'townsperson');
            return {
                category: 'townsperson',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: lower.includes('merchant')
                    ? 'slumps against a stack of crates, sound asleep with a ledger upon the knees, softly snoring.'
                    : 'is fast asleep against the timber wall, breathing heavily in exhausted slumber.',
                ambientBark: lower.includes('merchant')
                    ? '"Looking for supplies, adventurer? Check the General Store or the Armory."'
                    : (lower.includes('drunk') || lower.includes('sot')
                        ? '"*Hic*... another flagon for the road! To the King under the Mountain!"'
                        : '"Greetings, traveler. Watch your footing near the dungeon stairs."'),
                combatBark: (hp) => hp <= 0.35
                    ? '"Guards! Murder! I am dying! Why do you attack me?!"'
                    : '"Madman! Put down your steel! Help! Town guards, murder in the streets!"',
                assaultProse: (pName) => `In sudden confusion and panic, the ${name} lashes out defensively against ${pName}!`,
                assaultBark: () => 'Get back! Leave me be, madman!'
            };
        }

        // 6. Orcs & Goblins (o / snagas, cave orcs, uruks, captains)
        if (glyph === 'o' || lower.includes('orc') || lower.includes('goblin') || lower.includes('uruk') || lower.includes('snaga')) {
            const v = this.pickCreatureVoice(monster, 'orc');
            return {
                category: 'orc',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: 'slumps against the rocky wall in foul, guttural slumber, wheezing heavily.',
                ambientBark: '"Fresh meat for the pits! Slay the surface scum!"',
                combatBark: (hp) => hp <= 0.35
                    ? '"Curse your steel! I yield... mercy..."'
                    : '"You bleed just like the rest, dog! Tear them to pieces!"',
                assaultProse: (pName) => `With a guttural screech, a ${name} leaps from the gloom, its jagged scimitar hacking furiously against ${pName}'s guard!`,
                assaultBark: () => 'Die, surface scum! Fresh meat for the pits!'
            };
        }

        // 7. Kobolds & Troglodytes (k)
        if (glyph === 'k' || lower.includes('kobold') || lower.includes('troglodyte')) {
            const v = this.pickCreatureVoice(monster, 'kobold');
            return {
                category: 'kobold',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: 'lies curled in a dark fissure, wheezing softly through needle-sharp teeth.',
                ambientBark: '"Yapp! Stick the big one! Skitter and kill!"',
                combatBark: (hp) => hp <= 0.35
                    ? '"No hit! Mercy! Squeeeee!"'
                    : '"Die in the dark, intruder! Poison bites deep!"',
                assaultProse: (pName) => `Darting between shadows, a ${name} thrusts a venom-tipped dart straight toward ${pName}!`,
                assaultBark: () => 'Stick with poison! Skitter and die!'
            };
        }

        // 8. Evil Spellcasters & Cultists (p, h / cultists, dark elves, necromancers, mages, sorcerers)
        if (lower.includes('cultist') || lower.includes('dark elf') || lower.includes('necromancer') ||
            lower.includes('sorcerer') || lower.includes('mage') || lower.includes('warlock') || lower.includes('priest')) {
            const v = this.pickCreatureVoice(monster, 'spellcaster');
            return {
                category: 'spellcaster',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: 'hovers in an unnatural, meditative trance, murmuring dark incantations in slumber.',
                ambientBark: '"You dare step into the sanctum of the Black Enemy? Your soul belongs to Morgoth!"',
                combatBark: (hp) => hp <= 0.35
                    ? '"The Dark Lord... will avenge my blood... curse you..."'
                    : '"Feel the icy hand of the Nether realms! Burn in dark fire!"',
                assaultProse: (pName) => `Dark syllables hiss through the air as the ${name} unleashes a crackling bolt of sorcery at ${pName}!`,
                assaultBark: () => 'Burn in dark flames, mortal!'
            };
        }

        // 9. High Sentient Undead (W, V, L / wights, wraiths, vampires, liches, specters, nazgul)
        if (glyph === 'W' || glyph === 'V' || glyph === 'L' || lower.includes('wight') || lower.includes('wraith') ||
            lower.includes('vampire') || lower.includes('lich') || lower.includes('spectre') || lower.includes('specter') ||
            lower.includes('nazgul') || lower.includes('ringwraith')) {
            const v = this.pickCreatureVoice(monster, 'high_undead');
            return {
                category: 'high_undead',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: 'rests in deathly sepulchral stillness within its cold stone sarcophagus.',
                ambientBark: '"...join us in the cold... surrender your warmth to the grave..."',
                combatBark: (hp) => hp <= 0.35
                    ? '"...the dust reclaims all... but shadow never dies..."'
                    : '"...the Barrow calls to you... your breath is ours..."',
                assaultProse: (pName) => `A freezing chill strikes through ${pName}'s mail as the ${name} glides in, trailing the dead numbness of the barrow!`,
                assaultBark: () => 'Join us in the cold dark... yield your breath...'
            };
        }

        // 10. Dragons & Ancient Drakes (d, D / dragons, drakes, wyrms)
        if (glyph === 'd' || glyph === 'D' || lower.includes('dragon') || lower.includes('drake') || lower.includes('wyrm')) {
            const v = this.pickCreatureVoice(monster, 'dragon');
            return {
                category: 'dragon',
                gender: gender,
                isVocal: true,
                recommendedVoice: v,
                sleepNoise: 'slumbers heavily atop a mound of stolen gold, smoke coiling gently from nostril slits.',
                ambientBark: '"Who dares disturb the ancient slumber of the Fire-Drake? Crawl before me, worm of clay!"',
                combatBark: (hp) => hp <= 0.35
                    ? '"The mountains shall crumble... before my line is extinguished!"'
                    : '"Mortal ash before my ancient flame! Burn, insect!"',
                assaultProse: (pName) => `The subterranean air superheats as the ${name} lunges with ancient draconic fury, striking with terrifying force!`,
                assaultBark: () => 'Mortal ash before my wrath!'
            };
        }

        // --- 2. NON-VOCAL CREATURE FAMILIES (Make appropriate text noises/sounds, cannot speak words) ---

        // 9. Canines (C / dogs, wolves, hounds, jackals, wargs, foxes)
        if (glyph === 'C' || lower.includes('wolf') || lower.includes('hound') ||
            /\b(dog|dogs|jackal|jackals|warg|wargs|fox|foxes|coyote)\b/i.test(lower)) {
            return {
                category: 'canine',
                isVocal: false,
                sleepNoise: 'lies curled upon the stones, chest rising and falling softly with muffled dog-snores.',
                ambientNoise: '*Pants softly and sniffs the floor, growling low in its throat: Grrrr...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*The wounded ${name} whimpers in pain, snapping frantically with bloodied jaws: Yip-whimper-snarl!*`
                    : `*The ${name} howls in savage fury, baring yellowed fangs: Grrrrr-bark!*`,
                assaultProse: (pName) => `With bristling fur and bared yellow fangs, the ${name} leaps from the gloom, snapping viciously at ${pName}'s throat!`,
                assaultNoise: '*Snarls viciously: Grrrrr-bark!*'
            };
        }

        // 10. Felines (f / cats, panthers, tigers, leopards)
        if (glyph === 'f' || /\b(cat|cats|panther|panthers|tiger|tigers|leopard|leopards|jaguar|cougar)\b/i.test(lower)) {
            return {
                category: 'feline',
                isVocal: false,
                sleepNoise: 'lies curled into a tight ball, whiskers twitching softly in deep sleep.',
                ambientNoise: '*Paces in silence with padded steps, emitting a low warning hiss: Hssss...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*The wounded ${name} yowls in agony, flattening its ears against its skull: Screeech-yowl!*`
                    : `*The ${name} spits furiously with bared razor claws: Hssss-screeech!*`,
                assaultProse: (pName) => `Leaping soundlessly from the high ledge, the ${name} lashes out with razor-sharp claws!`,
                assaultNoise: '*Spits and yowls: Hssss-screeech!*'
            };
        }

        // 11. Rodents (r / rats, mice)
        if (glyph === 'r' || /\b(rat|rats|mouse|mice|rodent|rodents)\b/i.test(lower)) {
            return {
                category: 'rodent',
                isVocal: false,
                sleepNoise: 'lies curled in a filthy heap of rubbish, twitching its pink snout in sleep.',
                ambientNoise: '*Scuttles along the damp wall, sniffing nervously: Squeak-chitter...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*The wounded ${name} squeals in shrill agony, thrashing frantically: Eeee-squeak!*`
                    : `*The ${name} gnaws its yellowed incisors, chittering in rabid fury: Chitter-squeak!*`,
                assaultProse: (pName) => `Darting through the refuse with frenzied haste, the ${name} lunges to sink needle teeth into ${pName}'s flesh!`,
                assaultNoise: '*Squeaks sharply: Eeee-squeak!*'
            };
        }

        // 12. Arachnids & Insects (S, a, c, I / spiders, scorpions, centipedes, ticks, tarantulas, ants, beetles)
        if (glyph === 'S' || glyph === 'I' || glyph === 'a' || glyph === 'c' || lower.includes('spider') || lower.includes('scorpion') ||
            lower.includes('centipede') || lower.includes('tick') || lower.includes('tarantula') ||
            /\b(ant|ants|beetle|beetles|crawler|flea|fleas|louse|mite|mites)\b/i.test(lower)) {
            return {
                category: 'arachnid',
                isVocal: false,
                sleepNoise: 'hangs motionless in sticky webbing, dark mandibles locked in torpor.',
                ambientNoise: '*Clicks its dark pedipalps with an agitated chittering: tsk-tsk-click...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*The wounded ${name} convulses on severed legs, dark ichor spurting with shrill hisses: Tsk-hiss-click!*`
                    : `*The ${name} rears up on hairy chitinous legs, dripping venom: Click-tsk-tsk-hiss!*`,
                assaultProse: (pName) => `Dropping from sticky webs above, the ${name} strikes with razor pedipalps, driving venomous fangs toward ${pName}!`,
                assaultNoise: '*Chitters aggressively: tsk-tsk-click!*'
            };
        }

        // 13. Serpents, Reptiles & Worms (J, R, w / snakes, adders, vipers, cobras, hydras, basilisks, lizards, worms)
        if (glyph === 'J' || glyph === 'R' || glyph === 'w' || lower.includes('snake') || lower.includes('adder') || lower.includes('viper') ||
            lower.includes('cobra') || lower.includes('hydra') || lower.includes('basilisk') || lower.includes('salamander') ||
            lower.includes('lizard') || /\b(worm|worms|toad|toads|frog|frogs)\b/i.test(lower)) {
            return {
                category: 'reptile',
                isVocal: false,
                sleepNoise: 'lies coiled tightly in a dark crevice, unmoving and slow of breath.',
                ambientNoise: '*Flicks a slender forked tongue, dry scales rasping against the stone: Sssss...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*The wounded ${name} wriths violently, venom spraying from broken fangs: Sssss-gasp!*`
                    : `*The ${name} coils defensively, rearing to strike with a vicious hiss: Sssssss-hiss!*`,
                assaultProse: (pName) => `With blinding speed, the ${name} coils and strikes forward, venom dripping from needle fangs toward ${pName}!`,
                assaultNoise: '*Hisses violently: Sssssss-hiss!*'
            };
        }

        // 14. Avians & Bats (b, B / bats, vampire bats, crows, ravens, eagles)
        if (glyph === 'b' || glyph === 'B' || /\b(bat|bats|crow|crows|raven|ravens|eagle|eagles|vulture|hawk|owl)\b/i.test(lower)) {
            return {
                category: 'avian',
                isVocal: false,
                sleepNoise: 'hangs upside down from the cavern vault, folded tightly in leathery wings.',
                ambientNoise: '*Flutters leathery wings with sharp, high-pitched clicks: Skreeee...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*The wounded ${name} flaps broken wings in distress, screeching hoarsely: Skree-chert!*`
                    : `*The ${name} swoops in erratic circles, shrieking with shrill menace: Skreeee-chert!*`,
                assaultProse: (pName) => `Buffeting the air with leathery wings, the ${name} swoops down from the vault rafters with bared fangs against ${pName}!`,
                assaultNoise: '*Screeches piercingly: Skreeee-chert!*'
            };
        }

        // 15. Mindless Slimes, Oozes, Jellies, Molds, Fungi & Vortices (j, m, e, v, ,)
        if (glyph === 'j' || glyph === 'm' || glyph === 'e' || glyph === 'v' || glyph === ',' ||
            lower.includes('ooze') || lower.includes('slime') || lower.includes('mold') || lower.includes('jelly') ||
            lower.includes('mushroom') || lower.includes('fungus') || lower.includes('pudding') || lower.includes('blob') ||
            lower.includes('vortex') || lower.includes('cloud') || lower.includes('quylthulg')) {
            return {
                category: 'slime',
                isVocal: false,
                sleepNoise: 'rests as a dormant gelatinous mound upon the stones, barely shimmering.',
                ambientNoise: '*Bubbles and pulses with a wet, squelching rhythm: glub... plop...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*Severed chunks of the ${name} violently sizzle and dissolve in acidic spatter: Squelch-blub-blub!*`
                    : `*The ${name} ripples aggressively, bubbling corrosive acid: Glub-squelch-blub!*`,
                assaultProse: (pName) => `A foul, corrosive mass surges forward across the flagstones as the ${name} slumps against ${pName}'s defenses!`,
                assaultNoise: '*Squelches and bubbles wetly: glub-blub!*'
            };
        }

        // 16. Mindless Undead (s, z, M / skeletons, zombies, mummies, bone golems)
        if (glyph === 's' || glyph === 'z' || glyph === 'M' || lower.includes('skeleton') || lower.includes('zombie') ||
            lower.includes('mummy') || lower.includes('bone golem') || lower.includes('corpse')) {
            return {
                category: 'mindless_undead',
                isVocal: false,
                sleepNoise: 'stands as an inert heap of bleached bones and burial dust, awaiting dark commands.',
                ambientNoise: '*Drags hollow feet across the flagstones, dry bones rattling softly: Clack... clatter...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*Shattered bone splinters upon the stone, its empty skull clicking hollowly: Clack-clack-rattle!*`
                    : `*The ${name} clatters its jaws in silent rage, swinging its rusted weapon: Clack-clack-clatter!*`,
                assaultProse: (pName) => `Bleached bone and rusted iron flash in the gloom as the ${name} swings a notched blade with tireless, soulless malice!`,
                assaultNoise: '*Clatters dryly: clack-clack-clatter!*'
            };
        }

        // 17. Constructs & Golems (g, x / iron, stone, clay, marble golems, statues, gargoyles)
        if (glyph === 'g' || glyph === 'x' || lower.includes('golem') || lower.includes('statue') ||
            lower.includes('gargoyle') || lower.includes('bronze') || lower.includes('marble')) {
            return {
                category: 'construct',
                isVocal: false,
                sleepNoise: 'stands inert like a stone carving, joints locked in profound stillness.',
                ambientNoise: '*Grinds heavy stone joints with a low resonance: Groan-grind...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*Chipped stone and twisted iron shear off with a shrill screech: Screee-clank-grind!*`
                    : `*The ${name} raises a massive fist, gears whining under immense tension: Clank-groan-thud!*`,
                assaultProse: (pName) => `The stone flagstones groan and tremble under massive treads as the ${name} brings down a crushing fist upon ${pName}!`,
                assaultNoise: '*Grinds with deafening resonance: Groan-screee-thud!*'
            };
        }

        // 18. Elementals & Sparks (E / fire, water, air, earth elementals, sparks, vortex)
        if (glyph === 'E' || lower.includes('elemental') || lower.includes('spark') || lower.includes('flame')) {
            return {
                category: 'elemental',
                isVocal: false,
                sleepNoise: 'flickers faintly as a gentle ember or stagnant pool, dormant and calm.',
                ambientNoise: '*Crackles and hums with raw elemental power: Whooosh-crackle...*',
                combatNoise: (hp) => hp <= 0.35
                    ? `*The flickering form of the ${name} sputters erratically, hissing into steam: Whoosh-crackle-fizz!*`
                    : `*The ${name} flares with turbulent fury, searing the cavern air: Roaaar-crackle!*`,
                assaultProse: (pName) => `Raw subterranean power erupts as the ${name} surges forward in a swirling blast of elemental fury!`,
                assaultNoise: '*Roars with turbulent fury: Roaaar-whoosh!*'
            };
        }

        // --- 3. LARGE SENTIENT HUMANOIDS (Trolls, Ogres & Giants) ---
        // 19. Trolls, Ogres & Giants (T, O, P)
        if (glyph === 'T' || glyph === 'O' || glyph === 'P' || lower.includes('troll') || lower.includes('ogre') ||
            lower.includes('cyclops') || lower.includes('ettin') || /\b(giant|giants)\b/i.test(lower)) {
            return {
                category: 'giant',
                isVocal: true,
                recommendedVoice: 'en-US-RogerNeural',
                sleepNoise: 'shakes the cavern floor with booming, earth-shuddering snores.',
                ambientBark: '"Troll smell flesh! Smash little bones to powder!"',
                combatBark: (hp) => hp <= 0.35
                    ? '"Gaaah! Stone flesh bleed! Die, little bug!"'
                    : '"Crush you flat! Troll break your head!"',
                assaultProse: (pName) => `With a deafening bellow, the massive ${name} brings down a tree-trunk club to shatter ${pName}'s footing!`,
                assaultBark: () => 'Smash bones to powder! Troll crush you!'
            };
        }

        // 20. Default Sentient Humanoid Fallback
        return {
            category: 'humanoid',
            isVocal: true,
            recommendedVoice: this.pickCreatureVoice(monster, 'humanoid'),
            sleepNoise: 'is slumped in deep slumber, wheezing in a heavy, exhausted sleep.',
            ambientBark: '"You dare challenge the shadow? Your bones shall pave these halls!"',
            combatBark: (hp) => hp <= 0.35
                ? '"Curse your blade! I will drag you down with me!"'
                : '"Die, wretch!"',
            assaultProse: (pName) => `Steel clatters in the gloom as the ${name} strikes without warning, engaging ${pName} in sudden combat!`,
            assaultBark: () => 'You will not leave these deeps alive!'
        };
    }

    /**
     * Evaluates monster behavioral, anatomical, and mental state for accurate dialogue & observation.
     * Consumes strictly ZERO engine turns.
     * @param {Object} monster The monster data object
     * @param {Array} recentMessages Optional recent engine messages for real-time combat awareness
     */
    static resolveCreatureState(monster, recentMessages = []) {
        if (!monster) return { state: 'unknown', canSpeak: false, observation: 'Shadow in the gloom' };

        const name = monster.name || monster.race || 'creature';
        const cleanName = name.toLowerCase().replace(/^(the|a|an)\s+/, '').trim();
        const recentStrings = (Array.isArray(recentMessages) ? recentMessages.slice(-12) : [])
            .map(m => (typeof m === 'string' ? m : (m && m.text ? m.text : '')).toLowerCase());

        const isUnique = !!monster.is_unique;
        const currentHp = (typeof monster.hp === 'number') ? monster.hp : (typeof monster.chp === 'number' ? monster.chp : 10);
        const maxHp = (typeof monster.hp_max === 'number') ? monster.hp_max : (typeof monster.mhp === 'number' ? monster.mhp : currentHp);
        const hpPercent = (maxHp > 0) ? (currentHp / maxHp) : 1.0;

        // Flags from engine bridge and message log
        const isWaking = recentStrings.some(s => s.includes(cleanName) && s.includes('wakes up'));
        const isFallingAsleep = recentStrings.some(s => s.includes(cleanName) && s.includes('falls asleep'));
        let isAsleep = !!(monster.asleep || monster.is_asleep || monster.is_sleeping || monster.sleeping || (monster.csleep > 0));
        if (isWaking) isAsleep = false;
        if (isFallingAsleep) isAsleep = true;

        const isConfused = !!(monster.confused || monster.is_confused) || recentStrings.some(s => s.includes(cleanName) && s.includes('appears confused'));
        const isFleeing = !!(monster.afraid || monster.is_fleeing || (monster.monfear > 0)) || recentStrings.some(s => s.includes(cleanName) && (s.includes('flees in terror') || s.includes('runs away')));

        // Get creature archetype profile
        const profile = this.classifyCreature(monster);

        // 1. SLEEPING STATE (Guaranteed contextual silence for ALL creatures including sleeping merchants)
        if (isAsleep) {
            return {
                state: 'sleeping',
                category: profile.category,
                isVocal: profile.isVocal,
                canSpeak: false,
                bark: null,
                noise: null,
                recommendedVoice: profile.recommendedVoice,
                observation: `The ${name} ${profile.sleepNoise} It cannot converse while asleep.`
            };
        }

        // 2. CONFUSED STATE
        if (isConfused) {
            return {
                state: 'confused',
                category: profile.category,
                isVocal: profile.isVocal,
                canSpeak: false,
                bark: null,
                noise: profile.isVocal ? null : profile.ambientNoise,
                recommendedVoice: profile.recommendedVoice,
                observation: `The ${name} stumbles blindly in a stupor, snapping at empty air in delirium.`
            };
        }

        // 3. FLEEING (Terrified / in flight)
        if (isFleeing) {
            if (!profile.isVocal) {
                return {
                    state: 'fleeing',
                    category: profile.category,
                    isVocal: false,
                    canSpeak: false,
                    bark: null,
                    noise: profile.combatNoise(0.2),
                    recommendedVoice: null,
                    observation: `Terrified of the light, the ${name} scrambles frantically into the shadows.`
                };
            }
            let bark = '';
            if (profile.category === 'idiot' || cleanName.includes('idiot')) {
                bark = '"Waaaah! Hurts, hurts! Mommy, why you hit?! Stop hitting poor me! Bad man!"';
            } else if (profile.category === 'orc') {
                bark = '"Mercy! The iron devil comes! Run to the pits!"';
            } else {
                bark = '"Mercy! Spare my life! The light burns!"';
            }
            return {
                state: 'fleeing',
                category: profile.category,
                isVocal: true,
                canSpeak: true,
                bark: bark,
                noise: null,
                recommendedVoice: profile.recommendedVoice,
                observation: `Terrified, the ${name} recoils in panic, scrambling backward into the shadows.`
            };
        }

        // 4. COMBAT & SPECIFIC LOG EVENT DETECTION
        const isDamaged = (maxHp > 0 && currentHp < maxHp);
        const wasRecentlyAttacked = !!monster.wasAttacked || (monster.lastAttackedTime && (Date.now() - monster.lastAttackedTime < 25000));

        const heroAttackedThis = recentStrings.some(t => {
            return t.includes(cleanName) && (
                t.includes('you hit') || t.includes('you slash') || t.includes('you crush') ||
                t.includes('you smite') || t.includes('you shoot') || t.includes('you strike') ||
                t.includes('you miss')
            );
        });

        const thisAttackedHero = recentStrings.some(t => {
            return t.includes(cleanName) && (
                t.includes('hits you') || t.includes('bites you') || t.includes('claws you') ||
                t.includes('crushes you') || t.includes('slashes you') || t.includes('casts a spell') ||
                t.includes('breathes') || t.includes('stings you') || t.includes('attacks you') ||
                t.includes('drools on you') || t.includes('touches you')
            );
        });

        const thisBegged = recentStrings.some(t => t.includes(cleanName) && (t.includes('begs you') || t.includes('asks you for money')));
        const thisInsulted = recentStrings.some(t => t.includes(cleanName) && t.includes('insults you'));

        const isUnderAttack = heroAttackedThis || thisAttackedHero || (wasRecentlyAttacked && isDamaged);

        // A. BEGGING (Beggars and urchins in town asking for coins)
        if (thisBegged && !isUnderAttack) {
            return {
                state: 'begging',
                category: profile.category,
                isVocal: true,
                canSpeak: true,
                bark: profile.beggingBark || '"Alms, noble traveler! A copper bit for bread, I beg of you!"',
                noise: null,
                recommendedVoice: profile.recommendedVoice,
                observation: `The ${name} extends a trembling, grime-caked hand toward you, pleading with hollow eyes for a copper coin.`
            };
        }

        // B. INSULTING (Mercenaries, novices, drunkards mocking the player)
        if (thisInsulted && !isUnderAttack) {
            return {
                state: 'insulting',
                category: profile.category,
                isVocal: true,
                canSpeak: true,
                bark: profile.insultBark || '"Move along, soft-skin, before I show you what real steel looks like!"',
                noise: null,
                recommendedVoice: profile.recommendedVoice,
                observation: `The ${name} sneers at you insolently, spitting upon the flagstones in open derision.`
            };
        }

        // C. IN COMBAT / UNDER ATTACK
        if (isUnderAttack) {
            if (!profile.isVocal) {
                const combatNoise = profile.combatNoise(hpPercent);
                return {
                    state: hpPercent <= 0.35 ? 'mortally_wounded_beast' : 'in_combat_beast',
                    category: profile.category,
                    isVocal: false,
                    canSpeak: false,
                    bark: null,
                    noise: combatNoise,
                    recommendedVoice: null,
                    observation: `${combatNoise} Bleeding from combat, the ${name} lashes out with feral aggression.`
                };
            }

            // Sentient vocal creature under attack
            const bark = profile.combatBark(hpPercent);
            let cState = 'in_combat';
            if (profile.category === 'idiot' || cleanName.includes('idiot')) cState = 'cowering_idiot';
            else if (profile.category === 'beggar') cState = 'cowering_beggar';
            else if (profile.category === 'townsperson') cState = 'panicked_townsperson';
            else if (profile.category === 'rogue') cState = 'assaulting_rogue';
            else if (profile.category === 'veteran') cState = 'veteran_in_combat';
            else if (hpPercent <= 0.35) cState = 'mortally_wounded';

            let obs = `Engaged in bloody combat with you, the ${name} lashes out with vicious fury.`;
            if (cState === 'cowering_idiot') {
                obs = `Slobbering in sheer panic, the ${name} weeps and cowers in the dirt, frantically waving hands to ward off your blows.`;
            } else if (cState === 'cowering_beggar') {
                obs = `Terrified of your blade, the ${name} cowers against the damp stones, shielding their head with threadbare sleeves and pleading for mercy.`;
            } else if (cState === 'panicked_townsperson') {
                obs = `Bleeding from your assault, the ${name} clutches a painful wound and shrieks in panic, frantically backing away.`;
            } else if (cState === 'assaulting_rogue') {
                obs = `The ${name} lunges with a notched dagger, eyes darting greedily toward your coinpurse as blades clash.`;
            } else if (cState === 'veteran_in_combat') {
                obs = `The scarred ${name} parries with practiced military discipline, blade ringing as he counter-attacks!`;
            } else if (cState === 'mortally_wounded') {
                obs = `Gravely wounded and bleeding dark blood, the ${name} staggers on trembling limbs, fighting with the desperation of the dying.`;
            }

            return {
                state: cState,
                category: profile.category,
                isVocal: true,
                canSpeak: true,
                bark: bark,
                noise: null,
                recommendedVoice: profile.recommendedVoice,
                observation: obs
            };
        }

        // 5. UNPROVOKED / PEACEFUL / ACTIVE ROAMING
        if (!profile.isVocal) {
            return {
                state: 'ambient',
                category: profile.category,
                isVocal: false,
                canSpeak: false,
                bark: null,
                noise: profile.ambientNoise,
                recommendedVoice: null,
                observation: `The ${name} watches your movements with predatory instinct. ${profile.ambientNoise}`
            };
        }

        // Sentient vocal creature active
        let bark = profile.ambientBark;
        if (isUnique) {
            bark = `"${name.split(',')[0]} will brook no trespassing in this realm! Stand and face your doom!"`;
        }
        let obs = `The ${name} stands before you, watching your movements with seasoned calculation.`;
        if (profile.category === 'idiot') {
            obs = `The ${name} sits in the dirt, drooling softly and staring with vacant curiosity.`;
        } else if (profile.category === 'townsperson') {
            obs = `The ${name} glances at your gear with curiosity, going about their business.`;
        } else if (profile.category === 'rogue') {
            obs = `The ${name} lurks in the alley shadows, thumbing the edge of a curved dagger and sizing you up.`;
        }

        return {
            state: profile.category === 'idiot' ? 'ambient_idiot' : (profile.category === 'townsperson' ? 'townsperson' : (profile.category === 'rogue' ? 'hostile_rogue' : 'active')),
            category: profile.category,
            isVocal: true,
            canSpeak: true,
            bark: bark,
            noise: null,
            recommendedVoice: profile.recommendedVoice,
            observation: obs
        };
    }

    /**
     * Resolves rich multi-turn narrative encounter prose and contextual dialogue for creatures.
     * Integrates creature state, player context (race/class/depth/HP), turn memory, and diegetic user queries.
     * Consumes strictly ZERO engine turns.
     */
    static resolveCreatureEncounter(monster, hero, recentMessages = [], interactionTurn = 1, userQuery = '') {
        if (!monster) return { prose: 'A shadow lingers in the gloom.', text: null, isDialogue: false, speaker: 'Creature', recommendedVoice: null };

        const name = monster.name || monster.race || 'creature';
        const profile = this.classifyCreature(monster);
        const stateObj = this.resolveCreatureState(monster, recentMessages);
        const pName = (hero && hero.name) ? hero.name : 'the traveler';
        const pRace = (hero && hero.race) ? hero.race.toLowerCase() : 'mortal';
        const pClass = (hero && hero.class) ? hero.class.toLowerCase() : 'warrior';
        const pDepth = (hero && hero.depth !== undefined) ? hero.depth : 0;
        const currentHp = (typeof monster.hp === 'number') ? monster.hp : (typeof monster.chp === 'number' ? monster.chp : 10);
        const maxHp = (typeof monster.hp_max === 'number') ? monster.hp_max : (typeof monster.mhp === 'number' ? monster.mhp : currentHp);
        const hpPercent = (maxHp > 0) ? (currentHp / maxHp) : 1.0;
        const query = (userQuery || '').toLowerCase().trim();

        const gender = profile.gender || this.detectCreatureGender(name, monster);
        const isF = (gender === 'female');
        const prSub = isF ? 'she' : 'he';
        const prCap = isF ? 'She' : 'He';
        const prPoss = isF ? 'her' : 'his';
        const prObj = isF ? 'her' : 'him';

        // 1. SLEEPING STATE
        if (stateObj.state === 'sleeping') {
            let prose = '';
            const sSeed = Math.abs(interactionTurn + (monster.id || 0) * 13 + (monster.x || 0) * 7);

            if (profile.category === 'veteran') {
                const vetSleepList = [
                    `The scarred veteran slumps in the quiet timber shadow, jaw relaxed in heavy slumber, ${prPoss} calloused hand still resting instinctively upon the pommel of ${prPoss} sheathed blade.`,
                    `The weathered veteran leans back against the wall, snoring softly with a woolen cloak pulled tight over ${prPoss} mail, resting from long years of frontier vigils.`,
                    `The grizzled soldier is deep in exhausted slumber, breath wheezing through an old battle scar across ${prPoss} chest, undisturbed by the town bustle.`,
                    `Curled beside a stack of seasoned firewood, the veteran sleeps with one eye half-open, soldier instincts guarding ${prPoss} rest even in dreams.`
                ];
                prose = vetSleepList[sSeed % vetSleepList.length];
            } else if (profile.category === 'townsperson') {
                if (name.toLowerCase().includes('merchant')) {
                    const merchSleepList = [
                        `The ${name} slumps heavily against a timber wall upon a stack of empty crates, ${prPoss} eyes shut and soft snores whistling through ${prPoss} teeth. ${prCap} is fast asleep and cannot converse.`,
                        `Dozing peacefully behind a locked strongbox, the merchant slumps with ${prPoss} chin resting upon a fur collar, undisturbed by footsteps along the lane.`
                    ];
                    prose = merchSleepList[sSeed % merchSleepList.length];
                } else {
                    const townSleepList = [
                        `The ${name} lies sprawled against the tavern wall in exhausted slumber, chest rising and falling in rhythmic peace.`,
                        `Wrapped in a coarse wool blanket, the ${name} slumbers deeply in the alcove, resting weary limbs from the day's labor.`,
                        `The ${name} rests head against hand in a quiet doorway, breathing gently in undisturbed slumber.`
                    ];
                    prose = townSleepList[sSeed % townSleepList.length];
                }
            } else if (profile.category === 'beggar') {
                const beggarSleepList = [
                    `Curled in a threadbare mantle upon the cold cobblestones, the ${name} shivers softly in sleep, an empty wooden bowl tucked beneath ${prPoss} arm.`,
                    `The ${name} sleeps fitfully in the alley corner, wheezing softly against the damp stones with chin tucked into ragged wool.`
                ];
                prose = beggarSleepList[sSeed % beggarSleepList.length];
            } else if (profile.category === 'rogue') {
                const rogueSleepList = [
                    `The ${name} lies slumped in the shadow of an ale barrel, snoring heavily with one hand still resting across ${prPoss} notched dagger.`,
                    `With a hood pulled low over ${prPoss} brow, the cutpurse dozes lightly against the brickwork, blade hidden beneath ${prPoss} cloak.`
                ];
                prose = rogueSleepList[sSeed % rogueSleepList.length];
            } else if (!profile.isVocal) {
                prose = `The ${name} ${profile.sleepNoise}`;
            } else {
                prose = `The ${name} ${profile.sleepNoise} It slumbers deeply and cannot converse.`;
            }

            if (query) {
                prose += ` You speak to the ${name}, but your words fall upon deaf ears; ${prSub} only stirs slightly in slumber, unaware of your presence.`;
            }

            return {
                prose: prose,
                text: null,
                isDialogue: false,
                speaker: name,
                recommendedVoice: profile.recommendedVoice,
                observation: stateObj.observation,
                isFemale: isF,
                gender: gender,
                modelGender: gender
            };
        }

        // 2. NON-VOCAL CREATURES (Animals, vermin, slimes, mindless undead, constructs)
        if (!profile.isVocal || !stateObj.canSpeak) {
            let prose = '';
            const noise = stateObj.noise || profile.ambientNoise;

            if (stateObj.state.includes('combat') || stateObj.state.includes('wounded')) {
                if (profile.category === 'canine') {
                    prose = `Snarling through bared yellow fangs, the wounded ${name} thrashes with feral aggression, pacing the bloodstained stones with bristling fur.`;
                } else if (profile.category === 'rodent') {
                    prose = `The ${name} skitters frantically back and forth along the masonry, chittering shrilly with rabid fury as it snaps at the air.`;
                } else if (profile.category === 'arachnid') {
                    prose = `Rearing back on twitching, chitinous legs, the ${name} clicks its dripping mandibles in agitation, venom pooling upon the dungeon floor.`;
                } else if (profile.category === 'slime') {
                    prose = `The ${name} quivers and bulges with noxious digestive acids, acidic pseudopods lashing aggressively toward your boots!`;
                } else if (profile.category === 'skeleton') {
                    prose = `Bone splinters under the impact, yet the animated skeleton marches forward without heed, dry joints clicking in hollow menace.`;
                } else {
                    prose = `The ${name} recoils from the blow, thrashing aggressively in the dark as black ichor drips onto the flagstones.`;
                }
            } else {
                if (profile.category === 'canine') {
                    prose = `The ${name} pads warily across the flagstones, ears cocked and black snout sniffing the air for blood.`;
                } else if (profile.category === 'rodent') {
                    prose = `The ${name} scuttles along the damp floor, whiskers twitching nervously as it clutches a scrap of refuse.`;
                } else if (profile.category === 'arachnid') {
                    prose = `The ${name} clings motionlessly to the stone ceiling, multi-faceted dark eyes glittering in your torchlight.`;
                } else if (profile.category === 'slime') {
                    prose = `The ${name} undulates across the floor, leaving a glistening acidic sheen upon the cobblestones.`;
                } else if (profile.category === 'skeleton') {
                    prose = `The ancient skeletal sentry stands rigid in the cold hall, hollow eye sockets staring blankly through the darkness.`;
                } else {
                    prose = `The ${name} watches your movements with primitive instinct, shifting restlessly in the shadows.`;
                }
            }

            return {
                prose: prose,
                text: noise,
                isDialogue: false,
                speaker: name,
                recommendedVoice: null,
                observation: stateObj.observation,
                isFemale: isF,
                gender: gender,
                modelGender: gender
            };
        }

        // 3. SENTIENT VOCAL CREATURES FLEEING IN TERROR OR COWERING
        if (stateObj.state === 'fleeing' || stateObj.state === 'cowering_idiot') {
            let prose = '';
            let text = '';
            const vSeed = Math.abs(interactionTurn + (monster.id || 0) * 7);

            if (profile.category === 'idiot' || name.toLowerCase().includes('idiot')) {
                const idiotFleeProse = [
                    `Slobbering in sheer panic, the blubbering idiot scrambles backward on all fours through the street dirt, frantically shielding ${prPoss} head with dirty sleeves!`,
                    `The blubbering idiot weeps and cowers against the damp masonry, blubbering and pointing trembling fingers at ${pName}!`,
                    `Frantically wiping tears across ${prPoss} grime-streaked face, the blubbering idiot scuttles away like a terrified animal, howling for mercy!`,
                    `The blubbering idiot curls into a tight ball upon the cobblestones, whimpering and covering ${prPoss} ears as tears stream down ${prPoss} chin.`
                ];
                const idiotFleeBarks = [
                    'Waaaah! Hurts, hurts! Mommy, why you hit?! Leave poor me alone!',
                    'Screams and slobbers: No hit! Poor Gaffer got no coins, only pretty stones! Don\'t hit poor me!',
                    'Waaah! Town watch, save me! Murder! The stranger is beating poor me! Help!',
                    'Please, don\'t hurt! Look, I give you shiny beetle, just don\'t hit! Mommy! Waaah!'
                ];
                prose = idiotFleeProse[vSeed % idiotFleeProse.length];
                text = idiotFleeBarks[vSeed % idiotFleeBarks.length];
            } else if (profile.category === 'townsperson') {
                const pr = (profile.gender === 'female') ? 'she' : 'he';
                const prObj = (profile.gender === 'female') ? 'her' : 'him';
                const townFleeProse = [
                    `Bleeding and reeling from the assault, the ${name} clutches a painful wound and shrieks in panic, frantic eyes darting for the Town Watch!`,
                    `Terror-stricken, the ${name} stumbles backward into the alley shadows, shrieking at the top of their lungs for the town guards!`,
                    `Backing away with trembling hands held up in surrender, the ${name} gasps for breath, blood dripping onto the cobblestones!`
                ];
                const townFleeBarks = [
                    'Madman! Murder in the streets! Help, town guards, murder! Why do you attack an unarmed citizen?!',
                    'Mercy! I yield! Take my purse, take my boots, only spare my life!',
                    'Town Watch! Murder! Someone stop this mad butcher!'
                ];
                prose = townFleeProse[vSeed % townFleeProse.length];
                text = townFleeBarks[vSeed % townFleeBarks.length];
            } else if (profile.category === 'beggar') {
                prose = `Dropping ${prPoss} grimy begging bowl with a tin rattle, the ${name} cowers against the wall, weeping for mercy!`;
                text = (vSeed % 2 === 0)
                    ? 'Mercy! I yield! I have no silver, only rags! Spare an unarmed beggar!'
                    : 'Why do you strike an unarmed wretch?! Have pity! I have done you no harm!';
            } else if (profile.category === 'orc') {
                prose = `Spitting black blood, the terrified ${name} breaks away and scrambles toward the dark tunnels, shrieking in fear!`;
                text = 'Mercy! The iron devil! Run for the pits, the surface scum is mad!';
            } else {
                prose = `Reeling in terror from ${pName}'s relentless assault, the ${name} scrambles backward into the gloom, seeking flight!`;
                text = 'Curse your steel! Stay back, stay away!';
            }

            return {
                prose: prose,
                text: text,
                isDialogue: true,
                speaker: name,
                recommendedVoice: profile.recommendedVoice,
                observation: stateObj.observation,
                isFemale: isF,
                gender: gender,
                modelGender: gender
            };
        }

        // 4. SENTIENT VOCAL CREATURES UNDER ATTACK / IN COMBAT
        if (stateObj.state === 'in_combat' || stateObj.state === 'mortally_wounded' ||
            stateObj.state === 'panicked_townsperson' || stateObj.state === 'assaulting_rogue' ||
            stateObj.state === 'cowering_beggar' || stateObj.state === 'veteran_in_combat') {
            let prose = '';
            let text = '';

            if (profile.category === 'idiot' || name.toLowerCase().includes('idiot')) {
                prose = `Slobbering in sheer panic, the blubbering idiot weeps and cowers in the dirt, frantically waving hands to ward off ${pName}'s blows!`;
                text = (hpPercent <= 0.35)
                    ? 'Mommy! Mercy! Hurts so bad! Leave poor Gaffer alone!'
                    : 'Waaaah! Why you hit poor me?! Bad man! Don\'t hit!';
            } else if (profile.category === 'beggar' || stateObj.state === 'cowering_beggar') {
                prose = `Cowering in terror, the ${name} clutches threadbare rags and cowers against the damp stones, weeping for mercy!`;
                if (hpPercent <= 0.35) {
                    text = 'Mercy! I yield! I have no silver, only rags! Spare an unarmed beggar!';
                } else {
                    text = (interactionTurn <= 1)
                        ? 'Why do you strike an unarmed wretch?! Guards, murder! Have mercy!'
                        : 'Please! I have nothing! Take my bowl, take my rags, only spare my life!';
                }
            } else if (profile.category === 'veteran' || stateObj.state === 'veteran_in_combat') {
                prose = `The scarred ${name} parries your steel with a sharp clang of metal, ${prPoss} face hardening as ${prSub} steps into a fighting crouch!`;
                const cSeed = Math.abs(interactionTurn + (monster.id || 0) * 17);
                if (hpPercent <= 0.35) {
                    const lowHpBarks = [
                        `Curse your blade! A soldier dies with ${prPoss} boots on!`,
                        `You have drawn blood, but my blade still thirsts! Stand and die!`,
                        `The frontier has tested me harder than you! To me, then!`,
                        `Steel breaks, but a veteran never yields! Face me!`
                    ];
                    text = lowHpBarks[cSeed % lowHpBarks.length];
                } else {
                    const highHpBarks = [
                        'You want a taste of veteran steel, fool?! Stand and fight!',
                        'I have broken fiercer warriors than you in the deep trenches!',
                        'Your guard is open and your footwork sloppy! Yield or fall!',
                        'Iron and blood! You picked the wrong soldier to cross!',
                        'Let us see if your armor is as stout as your temper!',
                        'A soldier does not flinch before raw steel! Back to the dirt with you!'
                    ];
                    text = highHpBarks[cSeed % highHpBarks.length];
                }
            } else if (profile.category === 'townsperson') {
                prose = `Bleeding and reeling from the assault, the ${name} clutches a painful wound and shrieks in panic, frantic eyes darting for the town watch!`;
                if (hpPercent <= 0.35) {
                    text = 'Mercy! I yield! Take my purse, take my boots, only spare my life!';
                } else {
                    text = (interactionTurn <= 1)
                        ? 'Madman! Murder in the streets! Help, town guards, murder! Why do you attack me?!'
                        : 'Keep away from me, butcher! Guards! Someone stop this madman!';
                }
            } else if (profile.category === 'rogue') {
                prose = `${prPoss.charAt(0).toUpperCase() + prPoss.slice(1)} blade parries yours with a harsh shriek of metal! The ${name} sneers through gritted teeth, blood dripping from ${prPoss} knuckles as ${prSub} circles you in the alley gloom.`;
                const rSeed = Math.abs(interactionTurn + (monster.id || 0) * 23);
                if (hpPercent <= 0.35) {
                    const lowRogueBarks = [
                        'Curse your steel! I will see you in the barrows before I die alone!',
                        'Bleeding... but I will still slip a blade between your ribs!',
                        'Curse this town... you won\'t take my boots while I draw breath!',
                        'A pox on your sword! The shadows will swallow you whole!'
                    ];
                    text = lowRogueBarks[rSeed % lowRogueBarks.length];
                } else {
                    const highRogueBarks = [
                        'You think your steel frightens me, fool? I will carve the liver out of you!',
                        'Die, surface scum! I will pick your bones clean before the watch arrives!',
                        'Quick hands, cold steel! Let us see what spills from your purse!',
                        'You should have handed over the silver when you had the chance!',
                        'One slip in the cobblestone dark, and you are meat for the alley crows!'
                    ];
                    text = highRogueBarks[rSeed % highRogueBarks.length];
                }
            } else if (profile.category === 'orc') {
                prose = `Dark black blood spatters the stones as the ${name} snarls in bloodthirsty fury, hacking violently at your guard!`;
                if (hpPercent <= 0.35) {
                    text = 'Curse your blade! The Eye will tear your soul to shreds!';
                } else {
                    text = (interactionTurn <= 1)
                        ? 'Fresh meat bleeds! Hack the surface scum to ribbons!'
                        : 'I will gnaw the marrow from your bones, worm!';
                }
            } else if (profile.category === 'spellcaster') {
                prose = `Dark sorcerous fire crackles across the robes of the ${name} as he recoils from your steel, hissing ancient incantations in fury!`;
                text = (hpPercent <= 0.35)
                    ? 'The Black Enemy will avenge my blood! The Shadow never ends!'
                    : 'Feel the freezing hand of Mandos! Burn in dark fire!';
            } else {
                prose = `Gravely engaged in combat, the ${name} trades savage blows with ${pName}, blades clashing in the dark!`;
                text = (hpPercent <= 0.35)
                    ? 'Curse your steel! You will not leave these deeps alive!'
                    : 'Die on the cold stone, mortal!';
            }

            return {
                prose: prose,
                text: text,
                isDialogue: true,
                speaker: name,
                recommendedVoice: profile.recommendedVoice,
                observation: stateObj.observation,
                isFemale: isF,
                gender: gender,
                modelGender: gender
            };
        }

        // 5. PEACEFUL / AMBIENT ENCOUNTERS (Multi-Turn Progression & Diegetic Q&A)
        let prose = '';
        let text = '';

        if (profile.category === 'idiot' || name.toLowerCase().includes('idiot')) {
            const vSeed = Math.abs(interactionTurn + (monster.id || 0) * 11);
            const idiotAmbientProse = [
                `The blubbering idiot sits in the town dirt, drooling softly onto ${prPoss} collar while turning a smooth river pebble over and over in filthy hands.`,
                `The blubbering idiot blinks with wide, vacant eyes, pointing a grubby finger toward a passing town dog with a bubbly giggle.`,
                `The blubbering idiot scratches behind ${prPoss} ear with a grimy knuckle, humming a discordant, nonsensical tune to ${isF ? 'herself' : 'himself'}.`,
                `The blubbering idiot looks up at ${pName} with an innocent, crooked grin, wiping a trail of drool from ${prPoss} chin with the back of ${prPoss} hand.`
            ];
            const idiotAmbientBarks = [
                'Hehe! Look at the pretty shiny rock! It stays cool when you put it in your mouth! Hehe...',
                'Stars in the sky, bugs in the dirt... don\'t step on the squishy bugs, noble traveler! They got tiny boots too!',
                'Drool... buttons! Your coat has shiny brass buttons! Can I touch the buttons? Just one tap? Hehehe...',
                'Cold cobblestones, warm porridge... nobody gives poor Gaffer no porridge today... *sniffle*... but I found a nice snail!',
                'Hehehe! Did you come from the big hole in the ground? Down there is dark and noisy! Old rats have red teeth!'
            ];
            prose = idiotAmbientProse[vSeed % idiotAmbientProse.length];
            text = idiotAmbientBarks[vSeed % idiotAmbientBarks.length];
        } else if (stateObj.state === 'begging' || profile.category === 'beggar') {
            // Dialogue handling for beggars and urchins
            if (query.includes('dungeon') || query.includes('stair') || query.includes('down') || query.includes('deep')) {
                prose = `The ${name} shivers, pointing a filthy, trembling finger toward the archway leading down to the iron stairs.`;
                text = 'The cellar stairs are straight ahead, noble traveler... but stay clear of the dark steps at night. I once peered through the iron grating and smelled sulfur and burnt bone.';
            } else if (query.includes('shop') || query.includes('store') || query.includes('bread') || query.includes('food') || query.includes('ration') || query.includes('potion')) {
                prose = `${prCap} gazes toward the town square with hungry, hollow eyes.`;
                text = 'The General Store sells rations and warm oil, kind sir. A copper bit from a generous hand is all I need for a stale crust from the bakery...';
            } else if (query.includes('gold') || query.includes('coin') || query.includes('silver') || query.includes('money')) {
                prose = `${prCap}'s eyes widen with desperate hope as ${prSub} clutches ${prPoss} grimy begging bowl with both hands.`;
                text = 'Bless your generous heart, traveler! Just a few copper coins to keep the frost away... may the Valar preserve your life in the deep places!';
            } else if (query.includes('who') || query.includes('help') || query.includes('key')) {
                prose = `${prCap} leans in close, whispering with a conspiratorial rasp.`;
                text = 'To open doors, bump right against them. To drink healing draughts, press "q". And watch your back in the dark alleys—the cutpurses take what little copper we have.';
            } else {
                const bSeed = Math.abs(interactionTurn + (monster.id || 0) * 17);
                const beggarProseList = [
                    `A ${name} hobbles forward through the chill frontier wind, extending a trembling, cupped hand toward ${pName}, eyes hollow with hunger.`,
                    `${prCap} clasps ${prPoss} thin, dirt-stained hands together in gratitude as ${pName} lingers, glancing nervously over ${prPoss} shoulder toward the dark corners.`,
                    `${prCap} shivers under ${prPoss} threadbare rags, leaning in to whisper an old street rumor.`,
                    `${prCap} bows ${prPoss} head in quiet reverence, touching ${prPoss} grimy forehead.`
                ];
                const beggarBarkList = [
                    'Alms, noble traveler! Just one copper bit to buy a stale crust from the baker... the nights here are cold and cruel to the destitute.',
                    'Bless you, traveler! If you delve into the deep cellar stairs, beware the dark alleys near the tavern—the cutpurses lurk where the town watch cannot see.',
                    'They say the old armorer keeps a cache of iron rations behind the forge, but the deep tunnels below are full of things that hunger for more than bread.',
                    'May the Valar guide your footsteps in the dark below. Few in this border town have mercy for the fallen.'
                ];
                prose = beggarProseList[bSeed % beggarProseList.length];
                text = beggarBarkList[bSeed % beggarBarkList.length];
            }
        } else if (stateObj.state === 'insulting') {
            prose = `The ${name} spits upon the flagstones, sneering at ${pName} with contemptuous mockery.`;
            if (interactionTurn <= 1) {
                text = 'Think that shiny blade makes you a warrior, soft-skin? The rats down below will pick your teeth for toothpicks!';
            } else {
                text = 'Move along, runt! You haven\'t got the stomach for the deeps, and your armor looks like tin!';
            }
        } else if (profile.category === 'veteran') {
            if (query.includes('dungeon') || query.includes('tactic') || query.includes('fight') || query.includes('combat')) {
                prose = `The scarred ${name} rests a calloused hand upon the pommel of ${prPoss} longsword, speaking with seasoned authority.`;
                text = 'Never fight in open rooms. Step back into narrow 1-tile corridors so only one beast can face you at a time. And carry Phase Door scrolls for when the breathers arrive.';
            } else {
                const vSeed = Math.abs(interactionTurn + (monster.id || 0) * 19 + (monster.x || 0) * 11);
                const vetProseList = [
                    `The ${name} leans against a wooden post, eye scarred and jaw set as ${prSub} appraises ${pName}'s stance.`,
                    `${prCap} taps the hilt of ${prPoss} notched blade with a scarred thumb, looking toward the northern horizon.`,
                    `${prCap} nods with curt respect, ${prPoss} weathered leather armor creaking softly.`,
                    `The ${name} runs a whetstone along the bevel of a steel shortsword, inspecting the edge against the gray sky.`,
                    `${prCap} adjusts the iron buckles of ${prPoss} mail hauberk, scarred knuckles bearing the marks of a hundred border skirmishes.`,
                    `The seasoned soldier stands vigilant beside the alley corner, ${prPoss} gaze piercing the frontier fog.`
                ];
                const vetBarkList = [
                    'Delving into the pits, recruit? Keep your shield high, check every corridor twice, and never let yourself get surrounded.',
                    'The upper halls are crawling with cave orcs and kobold snipers. Stock up on cure potions before you step onto the stairs.',
                    'Fight smart and don\'t get greedy. No hoard of gold is worth staying in the deeps when your torch is burning low.',
                    'Iron discipline is what keeps you alive below. Learn the range of enemy archers, and lure them around solid stone corners.',
                    'Carry oil flasks and spare torches, traveler. The dark below eats your courage the moment your light sputters out.',
                    'A warrior\'s greatest weapon is patience. Let the orcs rush your doorway one by one, and strike when they stumble over their own shields.'
                ];
                prose = vetProseList[vSeed % vetProseList.length];
                text = vetBarkList[vSeed % vetBarkList.length];
            }
        } else if (profile.category === 'townsperson') {
            const isF = (profile.gender === 'female');
            const prSub = isF ? 'she' : 'he';
            const prCap = isF ? 'She' : 'He';
            const prPoss = isF ? 'her' : 'his';
            const prObj = isF ? 'her' : 'him';

            // Dialogue handling based on user query or turn progression
            if (query.includes('dungeon') || query.includes('stair') || query.includes('down') || query.includes('depth') || query.includes('deep')) {
                prose = `The ${name} points a weathered finger toward the dark stone archway leading down to the iron stairs.`;
                text = 'The dungeon stairs lie straight ahead. The first hundred feet are treacherous with cutpurses and cave spiders; stay alert and mind your footing.';
            } else if (query.includes('shop') || query.includes('store') || query.includes('buy') || query.includes('sell') || query.includes('potion') || query.includes('food') || query.includes('scroll')) {
                prose = `${prCap} nods toward the town market buildings lining the cobblestone square.`;
                text = 'The General Store stocks rations and flasks; the Alchemist carries healing draughts. Step into their entrance and press the item letter to purchase.';
            } else if (query.includes('weapon') || query.includes('armor') || query.includes('sword') || query.includes('shield') || query.includes('bow')) {
                prose = `${prCap} inspects your armaments with an appreciative nod.`;
                text = 'Good forged steel will keep your ribs intact. Do not descend without stout armor, or the first cave orc you meet will make short work of you.';
            } else if (query.includes('who') || query.includes('help') || query.includes('key') || query.includes('how')) {
                prose = `The ${name} leans in, speaking in a low, conspiratorial whisper.`;
                text = 'Use the arrow keys or bump into closed doors to open them. To quaff a healing potion, press "q", or "r" to read an enchanted scroll.';
            } else {
                // Rotating anti-repetition conversational options
                const tSeed = Math.abs(interactionTurn + (monster.id || 0) * 23);
                const townProseList = [
                    `The ${name} brushes dust from ${prPoss} sleeves and looks over ${pName}'s gear with a keen, calculating eye.`,
                    `${prCap} leans against a stack of crates, lowering ${prPoss} voice as ${prSub} glances toward the northern gate.`,
                    `${prCap} checks the bindings on a travel pack, pausing to share a word of frontier caution.`,
                    `${prCap} glances up at the chill sky, wrapping a woolen cloak tighter against the mountain draft.`,
                    `The ${name} nods politely in greeting as ${pName} approaches along the cobblestone lane.`,
                    `${prCap} glances toward the tavern entrance with a weary, knowing smile.`
                ];
                const townBarkList = [
                    'Hail, traveler. Looking for supplies or seeking the dungeon? The frontier has been restless of late.',
                    'Word in the tavern is that goblins have crept into the upper halls. Mind your footing, and never delve without torches and Phase Door scrolls.',
                    'Check the General Store or the Armory before you descend. Once you cross the threshold below, town silver will not buy you fresh bandages.',
                    'The mountain air grows colder by the hour. Keep your flask filled with oil—light is life down in the dark.',
                    'Greetings, adventurer. If you meet the town watch, mind your manners; cutpurses have made everyone wary on the square.',
                    'A warm fire and a mug of bitter ale wait in the tavern when you climb back up from the deeps.'
                ];
                prose = townProseList[tSeed % townProseList.length];
                text = townBarkList[tSeed % townBarkList.length];
            }
        } else if (profile.category === 'rogue') {
            // Dialogue handling for rogues
            if (query) {
                prose = `The ${name} sneers dismissively at your words, taking another menacing step closer as the dagger flips between ${prPoss} fingers.`;
                text = 'I do not care about your questions, stranger. Talk is cheap, but silver buys passage. Hand over your coin, now!';
            } else {
                // Progressive conversation turns
                if (interactionTurn <= 1) {
                    let raceFlavor = '';
                    if (pRace.includes('elf')) raceFlavor = 'Another haughty elf from the western woods... your silver spends just like a mortal\'s. ';
                    else if (pRace.includes('dwarf')) raceFlavor = 'Heavy boots and deep pockets... gold weighs you down, dwarf. ';
                    prose = `A ${name} steps out from the damp alley shadow, tossing a notched dagger hand-to-hand with practiced, deadly ease.`;
                    text = raceFlavor + 'Heh... looking for trouble in the dark alleys, stranger? Your purse, now. Hand over the silver before things get messy.';
                } else if (interactionTurn === 2) {
                    prose = `${prCap} steps forward to block your path, blade leveled directly at your throat with a cruel smirk.`;
                    text = 'Did you think I was making polite conversation? Cough up thirty gold coins, or I will see what you have in your boots once you are cold on the stones.';
                } else {
                    prose = `${prCap}'s eyes narrow and ${prPoss} fingers tighten around the leather-wrapped hilt.`;
                    text = 'That is enough stalling. Your purse or your life—make your choice right now!';
                }
            }
        } else if (profile.category === 'orc') {
            prose = `The ${name} hefts a notched scimitar, yellow fangs bared in a wicked sneer as he stomps against the flagstones.`;
            text = (interactionTurn <= 1)
                ? 'What is this? A tender morsel walking straight into the jaws! Slay the surface scum!'
                : 'Your skull will make a fine cup for the captain\'s ale! Stand still and die!';
        } else if (profile.category === 'dragon') {
            prose = `The ancient wyrm regards ${pName} with smoldering golden eyes, sulfurous smoke drifting lazily from slit nostrils.`;
            text = 'Who dares disturb the ancient slumber of the Fire-Drake? Crawl before me, worm of clay, before I turn your bones to ash!';
        } else if (profile.category === 'high_undead') {
            prose = `A sepulchral chill sweeps the chamber as the ${name} hovers in the gloom, ethereal robes fluttering without wind.`;
            text = '...join us in the cold... surrender your warmth to the grave...';
        } else {
            prose = `The ${name} stands poised in the gloom, watching your movements with wary calculation.`;
            text = (interactionTurn <= 1)
                ? 'You dare step into the deeps? Turn back, or pave these stones with your bones.'
                : 'Steel will decide our fate if you take one step closer.';
        }

        return {
            prose: prose,
            text: text,
            isDialogue: true,
            speaker: name,
            recommendedVoice: profile.recommendedVoice || (isF ? 'en-GB-SoniaNeural' : 'en-GB-ThomasNeural'),
            observation: stateObj.observation,
            isFemale: isF,
            gender: gender,
            modelGender: gender
        };
    }

    /**
     * Resolves tactical monster memory vulnerabilities from canon Angband tables
     */
    static resolveTacticalMonsterInsight(monsterName = '') {
        const lower = monsterName.toLowerCase();
        if (lower.includes('red dragon') || lower.includes('fire drake')) {
            return 'Fire courses through its blood. Frost and cold steel bite deepest, but stand not directly before its cone of flame.';
        }
        if (lower.includes('white dragon') || lower.includes('cold drake')) {
            return 'A creature of glacial malice. It shivers before bright flame; strike with fire arrows or burning flasks.';
        }
        if (lower.includes('orc') || lower.includes('goblin')) {
            return 'Cowardly in solitude, savage in packs. Funnel them into a 1-tile corridor to deny them surrounding advantage.';
        }
        if (lower.includes('troll')) {
            return 'Massive brute strength and stone-like regeneration. Do not trade blows in the open; sever its flesh with fire or acid.';
        }
        if (lower.includes('wight') || lower.includes('wraith') || lower.includes('vampire')) {
            return 'Beings of the shadow that drain life force and mortal strength. Engage from range, or restore your vigor with Alchemy potions.';
        }
        if (lower.includes('spider')) {
            return 'Quick of foot with venomous fangs. Keep an antidote vial at your belt before closing distance.';
        }
        if (lower.includes('wormtongue')) {
            return 'A craven infiltrator armed with a venomous needle. Fragile of body, but his strike slows your limbs.';
        }
        return 'Conserve your vigor, strike from narrow doorways, and watch your flanks.';
    }

    /**
     * Translates cryptic Angband level feelings into atmospheric tension
     */
    static translateLevelFeeling(feeling = 0) {
        if (!feeling || feeling === 0) return null;
        if (feeling >= 9) return 'You feel an ominous presence... something ancient and terrifying sleeps in the dark of this tier.';
        if (feeling >= 7) return 'The dungeon air hums with great peril and hidden treasures of the Elder Days.';
        if (feeling >= 5) return 'You have a superb feeling about this level; a relic or grand vault awaits discovery.';
        if (feeling >= 3) return 'You sense this tier holds worthwhile spoils for those who tread with care.';
        return 'The corridors feel quiet and unremarkable, though danger ever lurks in the blackness.';
    }

    /**
     * Alias for answerGuideQuery to ensure complete compatibility across manager and LLM bridge
     */
    static answerSurvivalQuery(query = '', player = null) {
        return this.answerGuideQuery(query, player);
    }

    /**
     * The 4th-Wall Aware Guide Engine: Answers gameplay and menu questions
     * with authentic, diegetic reverent wit grounded in Tolkien lore and Angband mechanics.
     */
    static answerGuideQuery(query = '', player = null) {
        const q = (query || '').toLowerCase().trim();
        const heroClass = (player && player.class) ? player.class.toLowerCase() : 'warrior';
        const pName = (player && player.name) ? player.name : 'Hero';
        const pRace = (player && player.race) ? player.race.toLowerCase() : 'mortal';

        // 1. POTIONS & HEALING
        if (q.includes('potion') || q.includes('quaff') || q.includes('heal') || q.includes('drink') || q.includes('cure')) {
            return `To quaff that draught, mortal hands must strike 'q' upon your keys (or touch the potion vial on your glass scrying screen). Then select the flask's rune from your pack. Quaffing consumes but a single heartbeat—never wait until death's shadow falls across your neck. In town, visit Alchemy Shop '5' to hoard Potions of Cure Critical Wounds!`;
        }

        // 2. RESTING & SAFE SLEEP
        if (q.includes('rest') || q.includes('sleep') || q.includes('recover') || q.includes('mana')) {
            return `Never rest in an open hall where horrors wander! Retreat to a dead-end corridor, shut the door ('c'), and invoke the resting rite: press 'R', then '*' to sleep until your Hit Points and Mana are made whole. If danger approaches, your senses will shock you awake.`;
        }

        // 3. SPELLS & MAGIC CONSTRAINTS
        if (q.includes('spell') || q.includes('magic') || q.includes('cast') || q.includes('pray') || q.includes('book')) {
            if (heroClass === 'warrior') {
                return `Alas, friend, you are a Warrior of iron muscle—you possess no spellbooks or mana. Rely on your honed steel, or trigger enchanted wands and scrolls!`;
            }
            return `Open your grimoire by pressing 'm' upon your keys. Choose your book, then select the spell's incantation. But heed this rule: if your hands are burdened with heavy iron gauntlets, your casting will fail and turn to ash. Wear cloth or soft leather gloves!`;
        }

        // 4. TERMINAL & CRT VIEW
        if (q.includes('terminal') || q.includes('crt') || q.includes('ascii') || q.includes('classic') || q.includes('tab')) {
            return `If you wish to gaze upon the dungeon as the ancient chroniclers of 1990 did—in green phosphor and sacred ASCII runes—strike the 'Tab' key. The 3D stone shall dissolve into the classic 80x24 CRT terminal. Strike 'Tab' once more to return to flesh and bone.`;
        }

        // 5. FOOD & STARVATION
        if (q.includes('food') || q.includes('starve') || q.includes('eat') || q.includes('ration') || q.includes('hunger')) {
            return `A warrior without sustenance is already dead. In the town above, visit Building '1' (The General Store) by stepping on its entrance. Press 'p' to purchase iron rations. In the deep, press 'E' to eat when hunger gnaws at your strength.`;
        }

        // 6. LIGHT, TORCHES & LANTERNS
        if (q.includes('light') || q.includes('torch') || q.includes('lantern') || q.includes('oil') || q.includes('dark')) {
            return `The deeps of Angband are pitch black. Unlit tiles conceal lethal breath ambushes and prevent long-range targeting. Always carry spare torches or a brass lantern. When your lantern dims, strike 'F' to fuel it with a flask of oil from your satchel!`;
        }

        // 7. SPEED & HASTE
        if (q.includes('speed') || q.includes('fast') || q.includes('haste') || q.includes('boots of speed')) {
            return `In the subterranean war, Speed is King. At +10 speed, you take two actions for every single move a normal monster makes. At +20, you take three! Prioritize Boots of Speed, Rings of Speed, and Potions of Speed above all other treasures!`;
        }

        // 8. SHOPS & TOWN SERVICES
        if (q.includes('shop') || q.includes('store') || q.includes('town') || q.includes('buy') || q.includes('sell')) {
            return `The frontier town features 8 establishments: General Store '1' (provisions & torches), Armory '2', Weapon Smith '3', Temple '4', Alchemy '5' (potions of cure & restoration), Magic Shop '6', the shadowy Black Market '7', and your personal Home '8' to store surplus relics. Step upon their doors to enter!`;
        }

        // 9. ESCAPES & PHASE DOOR
        if (q.includes('escape') || q.includes('run') || q.includes('phase door') || q.includes('teleport') || q.includes('recall')) {
            return `Retreating at 25% Health is the mark of a veteran, not cowardice! Keep at least 5 Scrolls of Phase Door ('r') in your pack to blink away from surrounding packs, and Scrolls of Teleportation for desperate flights. Remember: Scrolls of Word of Recall take 15 to 25 turns to activate!`;
        }

        // 10. WIELDING & GEAR
        if (q.includes('wield') || q.includes('equip') || q.includes('wear') || q.includes('armor') || q.includes('weapon') || q.includes('gear')) {
            return `To brandish a blade or don armor, press 'w' on your keys, then select the item from your pack. To inspect the gear currently protecting your body, press 'e' to open your equipment sheet. To take off an item, press 't'.`;
        }

        // 11. INNOCENTS, BEGGARS, AND TOWN VIOLENCE
        if (q.includes('beggar') || q.includes('kill') || q.includes('murder') || q.includes('cat') || q.includes('idiot') || q.includes('townsfolk') || q.includes('crime')) {
            return `Strike not the helpless wretches of the frontier town! Slaying beggars, alley cats, or the simple-minded Novice idiot brings neither glory nor spoils—only the stain of senseless cruelty and the wary gaze of the Town Watch. Save your drawn steel for the Orcs and ancient terrors lurking beneath the stairs.`;
        }

        // 12. CORRIDOR FUNNELING & COMBAT TACTICS
        if (q.includes('corridor') || q.includes('funnel') || q.includes('tactic') || q.includes('surround') || q.includes('room')) {
            return `The Golden Rule of Angband is the 1-tile corridor bottleneck! In open rooms, up to eight horrors can surround and butcher you in a single round. Step backward into a 1-tile corridor or doorway: there, only one monster can face your steel at a time, turning a deadly ambush into an orderly duel.`;
        }

        // 13. THROWING & MISSILES
        if (q.includes('throw') || q.includes('shoot') || q.includes('bow') || q.includes('arrow') || q.includes('sling') || q.includes('missile')) {
            return `To loose an arrow or bolt from a wielded ranged weapon, strike 'f'. To fling an iron spike, oil flask, or dagger by hand at an approaching foe, strike 'v' and pick your target. Ranged attacks whittle down deadly horrors before their fangs can touch your flesh.`;
        }

        // 14. TRAPS & SEARCHING
        if (q.includes('trap') || q.includes('search') || q.includes('disarm') || q.includes('secret')) {
            return `Gas vents, acid pits, and trapdoors riddle the dungeon floor. When creeping into suspicious vaults, strike 's' repeatedly to search the stones for hidden mechanisms. To disarm a spotted trap or pick a locked chest, strike 'D'.`;
        }

        // 15. ATTRIBUTES & STAT DRAINING
        if (q.includes('stat') || q.includes('strength') || q.includes('dexterity') || q.includes('constitution') || q.includes('drain')) {
            return `Strength increases damage and pack carrying capacity. Dexterity improves Armor Class and dodge rate. Constitution dictates your lifeblood. Beware the cold touch of the Undead (wights and wraiths), which permanently drains your attributes! Purchase Potions of Restore Strength and Life Levels from Alchemy Shop '5'.`;
        }

        // 16. LEVEL FEELINGS
        if (q.includes('feeling') || q.includes('danger') || q.includes('depth') || q.includes('level')) {
            return `Upon descending to a new tier, your sixth sense whispers a feeling from 1 to 9. A feeling above 5 portends legendary artifact vaults or dread unique terrors. If your healing flasks are empty and the air feels ominous, retreat up the stairs ('<') without shame!`;
        }

        // General in-character survival counsel
        return `The Lorekeeper hears your question, ${pName}. In the deeps of Angband, your survival hinges on discipline: inspect your pack with 'i', keep your back to the stone, funnel multiple foes into narrow 1-tile corridors, and never venture downward without food, torches, and scrolls of escape.`;
    }

    /**
     * Generates deep, contextual combat saga narratives with genuine Middle-earth color,
     * racial/class internal justification, moral judgment, and rotational anti-repetition.
     */
    static generateKillSaga(kills = [], player = null, depth = 0, traditionKey = 'westmarch', weapon = 'drawn steel') {
        const pName = (player && player.name) ? player.name : 'The Wanderer';
        const pRace = (player && player.race) ? player.race.toLowerCase() : 'mortal';
        const pClass = (player && player.class) ? player.class.toLowerCase() : 'warrior';
        const isTown = (depth === 0);

        // Turn-based pseudo-random seed to guarantee rotational variety
        const turnSeed = Math.abs(((player && player.turn ? player.turn : 0) + (kills.length || 1) * 7)) % 12;

        // Monster Family Detection
        const isBeggar = kills.some(k => /beggar|urchin|leper/i.test(k));
        const isCatOrDog = kills.some(k => /cat|dog|hound|jackal/i.test(k));
        const isIdiot = kills.some(k => /idiot/i.test(k));
        const isTownsperson = kills.some(k => /merchant|peasant|townsfolk|drunk|sot/i.test(k));
        const isRogue = kills.some(k => /rogue|thief|cutpurse|bandit|mugger|brigand/i.test(k));
        const isOrc = kills.some(k => /orc|goblin|snaga|uruk/i.test(k));
        const isVermin = kills.some(k => /spider|centipede|snake|worm|rat|tick|beetle/i.test(k));
        const isUndead = kills.some(k => /skeleton|zombie|wight|wraith|vampire|spectre|ghost/i.test(k));
        const isTroll = kills.some(k => /troll|ogre|giant|ettin/i.test(k));
        const isDragon = kills.some(k => /dragon|drake|wyrm/i.test(k));

        let title = 'Blood on the Stone';
        let prose = '';

        // --- 1. TOWN CRIMES & INNOCENT CASUALTIES (DEPTH 0) ---
        if (isTown && isBeggar) {
            title = ['Grim Deed in the Gutter', 'Blood on the Cobblestones', 'The Beggar\'s Fall', 'Shadow Over the Alleys'][turnSeed % 4];
            if (pRace.includes('half-orc')) {
                const halfOrcBeggarVariants = [
                    `${pName}'s ${weapon} flashes without hesitation, slicing into the tattered rags. The dark, brutal strain of Morgoth-blood surges in ${pName}'s veins—a ruthless instinct honed in the slave-pits, where weakness is despised and every reaching hand is suspected of concealing a shiv. Yet as the wretch collapses lifeless into the muddy gutter, a cold prickle of paranoia settles upon the rogue: the Town Watch patrols these lanes with heavy arbalests, and a senseless slaughter leaves a trail that even alley hounds can follow.`,
                    `With feral, reflexive swiftness, ${pName}'s ${weapon} cuts down the pleading beggar upon the damp paving stones. Born of two worlds that both offer nothing but scorn, ${pName} struck from raw cutthroat calculus, permanently silencing the wretch's cries for coin. The frontier wind whips dust across the fresh crimson pool, leaving an ominous quiet where desperate pleas once hung.`,
                    `A single vicious thrust silences the beggar's whining pleas. ${pName} looks down at the crumpled heap with cold, narrow eyes: on the harsh streets, survival permits no softness, and beggars often double as eyes for the cutpurse guilds. Wiping ${weapon} on the victim's coat, ${pName} slips into the alley shadows.`,
                    `The blade bites deep, and the beggar topples backward into a stack of empty crates with a wet gasp. ${pName}'s orcish blood relishes the cruel demonstration of force, yet mortal cunning whispers caution: corpses in town draw questions that gold cannot always answer.`
                ];
                prose = halfOrcBeggarVariants[turnSeed % halfOrcBeggarVariants.length];
            } else if (pRace.includes('elf')) {
                prose = `A sickening sorrow clenches ${pName}'s chest as the ${weapon} strikes home. What darkness has overtaken an Eldar, to hew down a starving wretch whose only crime was hunger? The blood pools between the ancient flagstones, and the distant light of the stars seems veiled in mournful grief at so senseless and tragic a deed.`;
            } else if (pRace.includes('dwarf')) {
                prose = `The heavy iron strike ends the beggar's cries with a dull, hollow thud upon the stones. Dwarven steel was forged to shatter troll-bone and carve gold from the deep roots of the mountain, not to waste its honed edge on alley wretches. ${pName} cleans the blade in silence, weighed down by the grim dishonor brought upon clan and ancestors.`;
            } else {
                prose = `The ${weapon} strikes home in sudden, tragic haste, felling the pitiful beggar against the timber wall. In this lawless frontier borderland, where the shadow of Angband looms like a black cloud, mortal hearts grow cold all too easily. As the figure crumples motionless, a heavy remorse settles over ${pName}, realizing how swiftly fear and desperation can erode the soul.`;
            }
        } else if (isTown && isCatOrDog) {
            title = ['A Startled Strike in the Alley', 'Shadows of the Backstreets', 'Frayed Nerves in Town'][turnSeed % 3];
            prose = `${pName}'s ${weapon} lashes out in a reflexive sweep, catching the alley beast as it darts from the garbage. With nerves stretched thin by the looming dread of the descent, every sudden scuttle in the gutter feels like an assassin's dagger. The creature crumples into the dust; ${pName} lowers the steel, breathing heavily amidst the tense silence of the backstreets.`;
        } else if (isTown && isIdiot) {
            title = ['Silence in the Street', 'An Ill Deed on the Stones', 'The Witless Slain', 'Tragedy in the Market'][turnSeed % 4];
            const idiotVariants = [
                `The steel strikes home with decisive force, cutting short the foolish laughter upon the cobblestones. The town street falls into an uneasy, accusing silence. Even on the ragged edge of civilization, striking down the witless brings no honor—only the nervous twitching of window shutters and the creeping suspicion of the frontier folk.`,
                `A sudden, brutal thrust ends the idiot's babbling in an instant. The body folds onto the wet cobblestones, and the surrounding townsfolk scatter in horrified silence. In the shadows of Angband, murder is common, but cold slaughter of the harmless marks the killer with an indelible taint.`,
                `With swift, impatient cruelty, ${pName}'s ${weapon} cuts the fool down mid-caper. The silence that follows is thick and hostile. The tavern lights across the street seem suddenly dimmer, as if judging the unnecessary bloodshed.`,
                `The witless victim collapses without understanding the blow that felled him. ${pName} sheathes ${weapon} with a grim grimace, acutely aware that such deeds do not go unnoticed by the unseen powers of the West.`
            ];
            prose = idiotVariants[turnSeed % idiotVariants.length];
        } else if (isTown && isRogue) {
            title = ['Alley Justice', 'Steel in the Mist', 'The Cutpurse\'s Reckoning', 'Street Skirmish'][turnSeed % 4];
            const rogueVariants = [
                `Steel clangs sharply between the timber eaves! Reading the cutpurse's lunging feint, ${pName} pivots on the damp cobblestones and drives ${weapon} through the brigand's guard. The rogue collapses with a final curse, stolen coins spilling from his loosened grip into the mud. In the lawless frontier of Angband, street justice is swift: one less throat-slitter stalks the town alleys tonight.`,
                `A desperate grapple in the alley shadows ends with a decisive counter-thrust. ${pName}'s ${weapon} finds its mark, ending the thief's ambush before poison could coat the blade. The frontier fog rolls over the fallen outlaw, restoring uneasy peace to the market approach.`,
                `The thief's hidden dagger flashes in the lantern light, but ${pName} is quicker. A brutal sidestep and a sweeping stroke of ${weapon} drops the highwayman cold onto the paving stones. The alleys of the border town have claimed another predator.`,
                `Catching the cutpurse's wrist in a vise-like grip, ${pName} runs him through before his accomplices can intervene. The rogue slumps against the wooden rain-barrel, his career of alley extortion brought to an abrupt and bloody close.`
            ];
            prose = rogueVariants[turnSeed % rogueVariants.length];
        } else if (isTown && isTownsperson) {
            title = ['Brawl in the Marketplace', 'Blood on Frontier Timber', 'Violence in the Streets'][turnSeed % 3];
            prose = `The conflict turns bloody in the open street as ${pName}'s ${weapon} finds its mark. The victim crumples against a stack of crates, and the murmur of the town market dies into terrified whispers. Striking down the frontier folk invites doom; ${pName} glances toward the shadowy arches, knowing the town watch will not easily forget this day.`;
        }
        // --- 2. SUBTERRANEAN DUNGEON COMBAT (DEPTH > 0) ---
        else if (isOrc) {
            title = ['Bane of the Orc-Kin', 'Black Blood on Cold Stone', 'The Ancient Feud', 'Heir of the First Age', 'Cleansing the Defilers', 'Iron Against Scimitar'][turnSeed % 6];
            const orcVariants = [
                `Ancestral wrath guides the strike! ${pName}'s ${weapon} cleaves through crude boiled leather and gnawed bone, hewing down the foul orc in a spray of thick, hissing black blood. The ancient feud of the Elder Days burns hot in this corridor; Morgoth's defilers will find no quarter in these halls.`,
                `With seasoned combat instinct, ${pName} parries the notched scimitar and drives ${weapon} straight into the orc's throat. The creature collapses against the damp shale with a choking rattle, leaving the dark passage reeking of sulfur and dead malice.`,
                `Slipping beneath a clumsy overhand chop, ${pName} steps inside the orc's guard. The ${weapon} sinks deep beneath the crude breastplate with brutal efficiency. As the brute thuds heavily onto the flagstones, ${pName} wrenches the blade free, scanning the corridor for more of the pack.`,
                `Funneling the screeching orc into the narrow archway, ${pName} denies the beast room to swing its rusted cleaver. A disciplined, bone-shattering thrust punches through mail and sinew, dropping the defiler cold into the dust before its guttural war-cry could echo.`,
                `The clash of steel rings harsh against the ancient masonry! Sidestepping the orc's vicious lunge, ${pName} delivers a crushing counter-blow that snaps the creature's guard and sends it sprawling lifeless across the blood-slicked stones.`,
                `With cold, merciless focus, ${pName}'s ${weapon} flashes through the torchlit gloom, severing the orc's advance in mid-stride. Black ichor spatters the wall as the foul minion of the Iron Hell crumples into an unmoving heap.`
            ];
            prose = orcVariants[turnSeed % orcVariants.length];
        } else if (isVermin) {
            title = ['Chitin on the Shale', 'The Crawlers Cleansed', 'Venom Averted', 'Shadows of the Web'][turnSeed % 4];
            const verminVariants = [
                `With cold revulsion, ${pName} crushes the venomous creeper beneath a vicious strike of ${weapon}. Chitin shatters against the subterranean floor, spattering foul ichor across the cracked flags. Kicking the twitching carcass into the gloom, ${pName} checks boots and greaves, ensuring no lingering venom breached the armor.`,
                `A sickening crunch echoes through the passage as ${pName}'s ${weapon} smashes into the skittering horror. The creature's jagged mandibles snap convulsively in empty air before curling motionless upon the damp rock.`,
                `Anticipating the sudden venomous lunge, ${pName} sidesteps and brings ${weapon} down with shearing force. The skittering monstrosity is split from carapace to stinger, neutralizing the venomous threat in an instant.`,
                `Darting fangs scrape harmlessly against greaves as ${pName} steps forward with grim finality, grinding the subterranean creeper into the dust with a decisive, heavy blow.`
            ];
            prose = verminVariants[turnSeed % verminVariants.length];
        } else if (isUndead) {
            title = ['Banishment of the Grave-Chill', 'Peace to the Desecrated', 'Rest for the Fallen', 'Light in the Crypt'][turnSeed % 4];
            const undeadVariants = [
                `The sepulchral chill recedes as ${pName}'s blow shatters the dark necromancy binding the restless remains. Bone and brittle armor collapse into harmless dust upon the stones. Whispering an ancient ward of peace, ${pName} turns aside from the scattered fragments, hoping the tortured spirit finally passes beyond the shadows of the Iron Hell.`,
                `With righteous fervor, ${pName}'s ${weapon} strikes straight through the hollow ribcage of the abomination. The malignant blue fire flickering in its sunken eye-sockets dies with an eerie wail, leaving only ancient, brittle dust upon the cold flagstones.`,
                `As the desiccated claws reach out to drain mortal warmth, ${pName} cleaves through the withered sinew. The unholy ward collapses in an instant, liberating the long-imprisoned spirit from Morgoth's cruel thralldom.`,
                `A burst of shattered bone and rusted mail rings out against the chamber walls! The walking curse is laid low at last, and the freezing grave-chill that hung in the corridor begins slowly to thaw.`
            ];
            prose = undeadVariants[turnSeed % undeadVariants.length];
        } else if (isTroll) {
            title = ['The Colossus Falls', 'Shattered Stone-Hide', 'Triumph Over the Brute', 'The Mountain Cleansed'][turnSeed % 4];
            const trollVariants = [
                `A titanic clash resounds through the vault as ${pName}'s decisive blow penetrates the troll's petrified flesh! The hulking brute crashes to earth with a thud that rattles dust from the ancient ceiling, its massive stone club rolling harmlessly into the dark.`,
                `Dancing outside the reach of the monster's lumbering fists, ${pName} drives ${weapon} deep behind the creature's thick knee-joint. As the giant stumbles with a roaring curse, a follow-through strike severs the thick neck, felling the subterranean terror once and for all.`,
                `The stone-tough hide shudders under ${pName}'s punishing assault. With an earsplitting roar that shakes the subterranean foundations, the beast topples like an ancient monument felled by lightning, cracking the flagstones beneath its immense bulk.`,
                `Patience and steel outmatch brute savagery: ducking beneath a tree-trunk club swing that shatters a stone pillar, ${pName} counters with lethal precision, burying the blade to the hilt in the brute's chest.`
            ];
            prose = trollVariants[turnSeed % trollVariants.length];
        } else if (isDragon) {
            title = ['The Smoldering Wyrm', 'Scale and Fire', 'Echo of the Dragon-Slayers'][turnSeed % 3];
            prose = `Through searing heat and blinding sulfur smoke, ${pName} drives ${weapon} into the soft underbelly between the wyrm's gleaming scales. A shriek of draconic agony echoes down the deeps as the beast thrashes in death-spasms, its dying flames casting long, trembling shadows across the vault.`;
        }
        // --- 3. GENERAL COMBAT & ROUTINE FLURRIES ---
        else {
            const numSlain = kills.length || 1;
            title = (numSlain > 1) ? ['Flurry of Decisive Steel', 'The Red Toll', 'Carving a Path', 'The Hall of the Fallen'][turnSeed % 4] : ['Clash in the Shadows', 'Steel and Resolve', 'A Peril Neutralized', 'The Silent Corridor'][turnSeed % 4];
            if (numSlain > 1) {
                const multiVariants = [
                    `Steel flashes in the shadows as ${pName} fells multiple foes in a desperate, fluid flurry of blows. The corridor falls quiet once more, save for the heavy rhythm of breathing and the drip of black blood from drawn steel.`,
                    `Surrounded by snapping teeth and notched blades, ${pName} turns in a ferocious circle of flashing steel. In three rapid, breathtaking strokes, the assailants are laid low, leaving the vault floor strewn with the fallen.`,
                    `A masterclass of dungeon survival: utilizing the doorway to face the onslaught one at a time, ${pName} methodically dismantles the attacking pack, cutting them down until silence returns to the masonry.`,
                    `The skirmish is swift and bloody. Before the enemy could close their perimeter, ${pName}'s ${weapon} reaps through the front rank, scattering the rest into panicked retreat and unmoving corpses.`
                ];
                prose = multiVariants[turnSeed % multiVariants.length];
            } else {
                const killText = kills[0] || 'A foe fell.';
                const singleVariants = [
                    `${pName}'s ${weapon} strikes true with decisive, bone-jarring momentum. ${killText} The immediate threat neutralized, ${pName} pauses to catch breath, eyes sweeping the surrounding gloom for flanking ambushes.`,
                    `A swift, deadly counter-stroke ends the skirmish! ${killText} ${pName} steps over the fallen body, listening intently to the distant echoes of the corridors ahead.`,
                    `Reading the foe's approach in the flickering torchlight, ${pName} sidesteps and delivers a single, fatal blow. ${killText} The dark passage falls silent once more.`,
                    `With calm, surgical lethality, ${pName} drives ${weapon} through the opponent's guard. ${killText} Wiping the blade clean, the adventurer resumes the perilous descent.`
                ];
                prose = singleVariants[turnSeed % singleVariants.length];
            }
        }

        return { title, prose };
    }

    /**
     * Offline Procedural Lore Synthesizer:
     * Generates atmospheric, race-attuned, rule-based Tolkien prose without needing any cloud API or AI model.
     * Guarantees 0ms latency and 100% reliability everywhere.
     */
    static generateProceduralChapter(event, player, traditionKey = 'westmarch') {
        const tradition = this.TRADITIONS[traditionKey] || this.TRADITIONS.westmarch;
        const name = (player && player.name) ? player.name : 'The Wanderer';
        const race = (player && player.race) ? player.race : 'Hero';
        const depth = (player && typeof player.depth === 'number') ? player.depth : (event.data && typeof event.data.depth === 'number' ? event.data.depth : 0);
        const depthFt = `${depth * 50}ft`;
        const weapon = (player && player.equipped && player.equipped.weapon) ? player.equipped.weapon : 'drawn steel';

        let title = 'Echoes in the Deep';
        let prose = '';
        let dialogue = null;
        let insight = null;

        switch (event.type) {
            case 'ONBOARDING_TOWN_ARRIVAL':
                title = 'Arrival at the Frontier';
                if (traditionKey === 'khazad') {
                    prose = `Plant your boots firmly in the town mud, ${name}. Before you delve into the black roots of the mountain, visit the General Store (Building '1') to lay in lanterns and rations. A dwarf who forgets his provisions is an insult to the Seven Houses.`;
                } else if (traditionKey === 'noldor') {
                    prose = `The frontier wind sighs over the ruined stones as ${name} stands upon the edge of the pit. Stock well your pack at the town stores with light and draughts before descending into the sorrowful shadows of Morgoth's realm.`;
                } else {
                    prose = `Welcome to the frontier, ${name}. The iron gates of Angband yawn below. Before taking the stairs down ('>'), step into the General Store ('1') and gather torches and food. Survival in the deep begins with preparation.`;
                }
                insight = "Press '1' to enter the General Store. Purchase torches ('p') and rations before descending.";
                break;

            case 'ONBOARDING_FIRST_DESCENT':
                title = 'Crossing the Threshold';
                prose = `The iron stairs groaning behind, ${name} descends to fifty feet. The darkness presses close against the flickering torchlight, smelling of damp dust and ancient malice.`;
                insight = "The Golden Rule: Never fight in the center of rooms. Step back into narrow 1-tile doorways!";
                break;

            case 'TAVERN_RESPITE':
                title = 'The Tavern Hearth';
                prose = `The iron cellar-doors of the deep slam shut, and the biting mountain air fills ${name}'s lungs. Stumbling into the warmth of the town tavern with boots caked in deep-dust and a pack heavy with spoils, the murmur of the patrons falls into hushed reverence.`;
                insight = "Visit Alchemy Shop '5' to replenish Potions of Cure Critical Wounds and Restore Life Levels.";
                break;

            case 'UNIQUE_SPOTTED':
                const m = event.data ? event.data.monster : null;
                const mName = m ? m.name : 'a dread horror';
                title = `Encounter: ${mName.split(',')[0]}`;
                const stateObj = this.resolveCreatureState(m);
                prose = `At ${depthFt}, the shadows coil. Before ${name} stands ${mName}. ${stateObj.observation}`;
                if (stateObj.canSpeak && stateObj.bark) {
                    dialogue = { speaker: mName.split(',')[0], text: stateObj.bark.replace(/"/g, ''), isNoise: false };
                } else if (stateObj.noise) {
                    dialogue = { speaker: mName.split(',')[0], text: stateObj.noise, isNoise: true };
                }
                insight = this.resolveTacticalMonsterInsight(mName);
                break;

            case 'MORTAL_PERIL':
                title = 'The Brink of Doom';
                prose = `A searing agony tears through ${name}'s side! With Hit Points draining and shield arm trembling under the assault, only desperate speed and quick wit will stay the cold hand of Mandos.`;
                insight = "EMERGENCY: Quaff Cure Potions ('q') or read a Scroll of Phase Door ('r') immediately!";
                break;

            case 'UNIQUE_SLAIN':
                const uName = (event.data && event.data.name) ? event.data.name : 'A Unique Terror';
                title = `The Fall of ${uName.split(',')[0]}`;
                prose = `A final shudder convulses the chamber as ${uName} collapses lifeless upon the flagstones! The surrounding gloom lifts slightly, as if the Iron Hell itself groaned at the blow.`;
                insight = "A legendary victory! Unique foes never return once vanquished.";
                break;

            case 'CREATURE_BEG': {
                const bMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'A pitiful-looking beggar';
                const bDummy = { name: bMon, glyph: (event.data && event.data.glyph) ? event.data.glyph : 't', x: (event.data && event.data.x) || 0, y: (event.data && event.data.y) || 0, id: (event.data && event.data.id) || 0 };
                const bGender = this.detectCreatureGender(bMon, event.data && event.data.monster ? event.data.monster : bDummy);
                const bPronouns = this.getPronouns(bGender);
                const bEnc = this.getNextEncounterIndex(`beg_${bMon}`);
                title = `The Beggar's Plea`;

                const begLines = [
                    `"Alms, noble traveler! A copper bit for bread, I beg of you! May the stars guide your blade!"`,
                    `"The frontier wind freezes my old bones, kind ${bPronouns.honorific}... spare a crust of bread for a wretched soul!"`,
                    `"Just a penny to buy a bowl of warm broth at the tavern, traveler! May your shield never splinter!"`,
                    `"A silver bit for old memories... I once bore steel into the pit too, before the shadows broke me!"`,
                    `"Mercy, traveler! The night grows bitter and cold... spare a copper so I might rest beneath dry roof-timbers!"`,
                    `"Blessings upon your journey, kind soul! But heed an old wretch: never step past dungeon stairs without three torches!"`
                ];
                const bText = begLines[(bEnc + (player ? player.turn || 0 : 0)) % begLines.length];

                const begProse = [
                    `A ${bMon} hobbles through the chill frontier wind, extending a trembling, grime-caked hand toward ${name}, eyes hollow with hunger.`,
                    `Shivering beneath tattered wool in the alley shadows, the ${bMon} bows low before ${name}, pleading with a raspy whisper.`,
                    `Cowering against the damp timber wall, the ${bMon} reaches out with calloused, dirt-stained fingers as ${name} passes.`
                ];
                prose = begProse[bEnc % begProse.length];
                dialogue = {
                    speaker: bMon,
                    text: bText.replace(/"/g, ''),
                    isNoise: false,
                    recommendedVoice: this.pickCreatureVoice(bDummy, 'beggar')
                };
                break;
            }

            case 'CREATURE_INSULT': {
                const iMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'A battle-scarred veteran';
                const iDummy = { name: iMon, glyph: (event.data && event.data.glyph) ? event.data.glyph : 't', x: (event.data && event.data.x) || 0, y: (event.data && event.data.y) || 0, id: (event.data && event.data.id) || 0 };
                const iGender = this.detectCreatureGender(iMon, event.data && event.data.monster ? event.data.monster : iDummy);
                const iPronouns = this.getPronouns(iGender);
                const iEnc = this.getNextEncounterIndex(`insult_${iMon}`);
                title = `Derision in the Street`;

                const insultLines = [
                    `"Look at the bold adventurer! The first cave orc you meet will feed your ears to the hounds!"`,
                    `"Think that shiny steel makes you a hero, greenhorn? The pit will use your ribs for kindling!"`,
                    `"Keep your hand on your hilt, pup. Around here, hesitating for two breaths gets your throat opened!"`,
                    `"Swaggering through the streets with that toy blade? The deep levels do not forgive foolish pride!"`,
                    `"Turn back to the tavern while you still have both eyes, runt! You haven't got the stomach for the dark!"`,
                    `"Hah! Another doomed soul marching toward a shallow pit. Place your bets on how long this one lasts!"`
                ];
                const iText = insultLines[(iEnc + (player ? player.turn || 0 : 0)) % insultLines.length];

                const insultProse = [
                    `The ${iPronouns.veteranTitle} spits insolently upon the flagstones, sneering with open mockery as ${name} passes. ${iPronouns.he.toUpperCase()} rests a calloused hand upon ${iPronouns.his} scarred pommel.`,
                    `Leaning against the tavern wall with cold, appraising eyes, the ${iPronouns.veteranTitle} smirks at ${name}'s equipment with seasoned contempt.`,
                    `Blocking the alley path with brawny confidence, the ${iPronouns.soldier} looks ${name} up and down before laughing in harsh derision.`
                ];
                prose = insultProse[iEnc % insultProse.length];
                dialogue = {
                    speaker: iMon,
                    text: iText.replace(/"/g, ''),
                    isNoise: false,
                    recommendedVoice: this.pickCreatureVoice(iDummy, 'veteran')
                };
                break;
            }

            case 'CREATURE_THEFT': {
                const tMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'A nimble cutpurse';
                const tDummy = { name: tMon, glyph: (event.data && event.data.glyph) ? event.data.glyph : 'p', x: (event.data && event.data.x) || 0, y: (event.data && event.data.y) || 0, id: (event.data && event.data.id) || 0 };
                const tGender = this.detectCreatureGender(tMon, event.data && event.data.monster ? event.data.monster : tDummy);
                const tPronouns = this.getPronouns(tGender);
                const tEnc = this.getNextEncounterIndex(`theft_${tMon}`);
                title = `Theft in the Shadow`;

                const theftLines = [
                    `"A fair toll for passing through my alleys, fool! Keep your boots, I will take the silver!"`,
                    `"Your purse was hanging far too loose, traveler! Consider it an expensive lesson in street vigilance!"`,
                    `"Heh... faster hands make for richer pockets! Better luck keeping your coin next time!"`,
                    `"A little guild donation! Don't look so sour, you weren't using that silver anyway!"`,
                    `"Thanks for the coins, stranger! I'll drink a hearty flagon of ale in your name tonight!"`,
                    `"Light on your feet, but careless with your belt! Catch me if you can, slowpoke!"`
                ];
                const tText = theftLines[(tEnc + (player ? player.turn || 0 : 0)) % theftLines.length];

                prose = `With lightning stealth, the ${tPronouns.person} slices through the purse-strings at ${name}'s belt, darting into the misty shadows with clinking stolen coin!`;
                dialogue = {
                    speaker: tMon,
                    text: tText.replace(/"/g, ''),
                    isNoise: false,
                    recommendedVoice: this.pickCreatureVoice(tDummy, 'rogue')
                };
                break;
            }

            case 'SPELL_LEARNED': {
                const spType = (event.data && event.data.spellType) ? event.data.spellType.toLowerCase() : 'spell';
                const spName = (event.data && event.data.spellName) ? event.data.spellName : 'Ancient Art';

                if (spType === 'prayer') {
                    title = `Divine Litany: ${spName}`;
                    prose = `Kneeling in reverent focus amidst the gloom, ${name} recites the sacred verses of the Holy Book. A celestial warmth descends upon ${name}'s soul—the prayer of ${spName} is sealed within heart and memory, a radiant ward against the crawling evils of the pit!`;
                    dialogue = {
                        speaker: name,
                        text: `By the grace of the High Valar, let the sacred prayer of ${spName} illuminate the shadows and preserve the righteous!`,
                        isNoise: false,
                        recommendedVoice: this.pickCreatureVoice(player, 'spellcaster')
                    };
                    insight = `Prayers rely on Wisdom and piety. Press 'm' or 'p' to channel celestial strength in perilous trials.`;
                } else if (spType === 'spell' || spType === 'incantation') {
                    title = `Arcane Mastery: ${spName}`;
                    prose = `Tracing shimmering eldritch glyphs across ancient parchment, ${name} deciphers the esoteric formulas of the magi. The spell of ${spName} awakens within ${name}'s intellect like a coiled bolt of silver fire, awaiting release!`;
                    dialogue = {
                        speaker: name,
                        text: `The arcane words are bound to my mind. The power of ${spName} answers my command!`,
                        isNoise: false,
                        recommendedVoice: this.pickCreatureVoice(player, 'spellcaster')
                    };
                    insight = `Arcane spells consume Mana (SP) and scale with Intelligence. Always keep restore mana potions at hand.`;
                } else if (spType === 'rune') {
                    title = `Runic Awakening: ${spName}`;
                    prose = `Studying deep Khuzdul inscriptions carved by ancient dwarf-smiths, ${name} decodes the secrets of stone and steel. The sacred rune of ${spName} flares to life, echoing with the primeval fires of Mount Gundabad!`;
                    dialogue = {
                        speaker: name,
                        text: `By the hammer of Mahal and the roots of the world, the rune of ${spName} is forged!`,
                        isNoise: false,
                        recommendedVoice: this.pickCreatureVoice(player, 'veteran')
                    };
                    insight = `Runes grant enduring protective enhancements against elemental and physical perils.`;
                } else {
                    title = `Ancient Rite: ${spName}`;
                    prose = `Attuning breath and willpower to the subterranean earth, ${name} uncovers the lost ritual of ${spName}. Primeval resonance hums through the surrounding bedrock!`;
                    insight = `Study rituals from tomes to broaden your tactical adaptability in the dungeon depths.`;
                }
                break;
            }

            case 'LEVEL_UP': {
                const newLvl = (event.data && event.data.level) ? event.data.level : 2;
                title = `Heroic Transcendence: Level ${newLvl}`;
                prose = `A surge of heroic vigor and seasoned instinct floods through ${name}'s veins! Through steel, sorcery, and harrowing survival in the deep, ${name} attains Level ${newLvl}! Muscles harden against fatigue, reaction times sharpen to razor precision, and the resolute confidence of a true dungeon veteran takes hold.`;
                dialogue = {
                    speaker: name,
                    text: `My steel is proven, and my resolve will not waver! Let the terrors of the deep come forth!`,
                    isNoise: false,
                    recommendedVoice: this.pickCreatureVoice(player, 'veteran')
                };
                insight = `Levelling up increases maximum hit points, spell points, and combat proficiency. Re-stock supplies whenever possible.`;
                break;
            }

            case 'HERO_ATTACK': {
                const targetMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'foe';
                const act = (event.data && event.data.action) ? event.data.action : 'hits';
                const inTown = event.data && event.data.inTown;
                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + targetMon.length * 13 + (player && player.name ? player.name.length * 7 : 0));
                title = inTown ? `Brawl: ${targetMon}` : `Clash: ${targetMon}`;

                if (inTown) {
                    const isIdiot = targetMon.toLowerCase().includes('idiot');
                    const isBeggar = targetMon.toLowerCase().includes('beggar');
                    if (isIdiot || isBeggar) {
                        const idiotHits = [
                            `A sudden commotion shatters the quiet of the frontier street as ${name}'s ${weapon} strikes the hapless ${targetMon}! The wretch shrieks in bewilderment, clutching bruised limbs as onlookers stare in grim disbelief.`,
                            `${name} lashes out, striking the defenseless ${targetMon} with ${weapon}! Dust billows from the ragged clothes as the pitiful creature stumbles backward into the mud with a pained whine.`,
                            `Violence erupts without warning in the town square: ${name}'s blow catches the ${targetMon} squarely, sending the gibbering soul sprawling across the cobblestones!`,
                            `With unsparing force, ${name} strikes the cowering ${targetMon}. Shouts of alarm echo from nearby shop doorways at the unprovoked assault.`
                        ];
                        prose = idiotHits[turnSeed % idiotHits.length];
                    } else {
                        const townBrawls = [
                            `Steel clangs against armor in the narrow frontier alley! ${name} strikes out with ${weapon}, driving the ${targetMon} back against the timber storefronts!`,
                            `${name} engages the ${targetMon} in swift, close-quarters combat, landing a ringing blow upon the insolent ruffian!`,
                            `A vicious skirmish breaks out in the town streets! ${name} swings ${weapon} with practiced precision, staggering the ${targetMon} upon the muddy cobbles.`,
                            `Ducking beneath a clumsy riposte, ${name} lands a solid blow upon the ${targetMon}, making the town street feel as dangerous as any dungeon pit.`
                        ];
                        prose = townBrawls[turnSeed % townBrawls.length];
                    }
                } else {
                    const dungeonHits = [
                        `With swift resolve at ${depthFt}, ${name} brings ${weapon} crashing into the ${targetMon}! Bone and sinew shudder beneath the impact as battle is joined in the subterranean gloom.`,
                        `Ducking beneath a foul counter-strike, ${name} drives forward with ${weapon}, striking the ${targetMon} squarely! Dark ichor splatters across the ancient flagstones.`,
                        `A decisive, punishing strike! ${name} lands a heavy blow upon the ${targetMon}, testing the monster's grim resolve in the vault's dim torchlight.`,
                        `The ringing clash of ${weapon} reverberates through damp dungeon corridors as ${name} hammers into the ${targetMon} with deadly precision!`,
                        `Pressing the offensive, ${name} cleaves through the creature's defenses, landing a searing wound that sends the ${targetMon} reeling backward into the shadows!`,
                        `Quick as a striking viper, ${name} maneuvers past the ${targetMon}'s guard, driving ${weapon} deep with heroic fury!`
                    ];
                    prose = dungeonHits[turnSeed % dungeonHits.length];
                }
                break;
            }

            case 'CREATURE_FLEEING': {
                const fMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'creature';
                title = `Flight of the ${fMon}`;
                const fDummy = { name: fMon, glyph: (event.data && event.data.glyph) ? event.data.glyph : '' };
                const fProfile = this.classifyCreature(fDummy);
                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + fMon.length * 17);

                if (fProfile.category === 'idiot' || fMon.toLowerCase().includes('idiot')) {
                    const idiotFlee = [
                        `Overcome with blind panic and howling terror, the ${fMon} scrambles on all fours across the mud, weeping and clutching at thin air!`,
                        `Babbling shrill, broken words of terror, the ${fMon} throws arms over head and bolts into the mist, tripping wildly over ragged hem and stones!`,
                        `The ${fMon} cowers in utter horror before turning heel, scurrying into an alley alcove with high-pitched, pitiful whines!`
                    ];
                    prose = idiotFlee[turnSeed % idiotFlee.length];
                    const idiotBarks = [
                        'No hit! No hurt! Mother! The biting shadows are loose!',
                        'The sky is cracking! Do not strike! Mercy on poor simple head!',
                        'Too loud! Too sharp! Cold steel bites! Running away!'
                    ];
                    dialogue = {
                        speaker: fMon,
                        text: idiotBarks[turnSeed % idiotBarks.length],
                        isNoise: false,
                        recommendedVoice: this.pickCreatureVoice(fDummy, 'idiot')
                    };
                } else if (!fProfile.isVocal) {
                    const beastFlee = [
                        `Battered and bleeding, the ${fMon} breaks discipline, turning tail to scuttle desperately away into the deep dark!`,
                        `Terror overcomes instinct as the wounded ${fMon} retreats frantically, seeking refuge in the unlit crevices of the hall.`
                    ];
                    prose = beastFlee[turnSeed % beastFlee.length];
                    dialogue = {
                        speaker: fMon,
                        text: '*Shrieks in pain and scuttles frantically away across the stones!*',
                        isNoise: true,
                        recommendedVoice: null
                    };
                } else {
                    const vocalFlee = [
                        `Breaking under ${name}'s relentless onslaught, the ${fMon} turns in blind panic and flees down the corridor, clutching bleeding wounds!`,
                        `Dread terror seizes the ${fMon}! Abandoning all pride, the craven creature bolts toward the dark passages, screaming in dismay.`,
                        `With wild eyes rolling in fear, the ${fMon} casts aside its footing and scrambles desperately away from ${name}'s righteous fury!`
                    ];
                    prose = vocalFlee[turnSeed % vocalFlee.length];
                    const fleeBarks = [
                        'Flee! The doom-blade comes!',
                        'Mercy, warrior! Do not strike again!',
                        'A curse on your steel! I yield the hall!'
                    ];
                    dialogue = {
                        speaker: fMon,
                        text: fleeBarks[turnSeed % fleeBarks.length],
                        isNoise: false,
                        recommendedVoice: this.pickCreatureVoice(fDummy, fProfile.category)
                    };
                }
                break;
            }

            case 'CREATURE_BIZARRE_ACTION': {
                const bzMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'creature';
                const bzAct = (event.data && event.data.action) ? event.data.action : 'acts bizarrely';
                const bzDummy = { name: bzMon, glyph: (event.data && event.data.glyph) ? event.data.glyph : '' };
                const bzProfile = this.classifyCreature(bzDummy);
                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + bzMon.length * 11);
                title = `Aberration: ${bzMon}`;

                if (bzAct.includes('drool')) {
                    prose = `Gawking with glazed, unseeing eyes and slack jaw, the ${bzMon} stumbles clumsily into ${name}'s path, spattering warm drool across ${name}'s boots in pitiful madness.`;
                    dialogue = {
                        speaker: bzMon,
                        text: 'Hee-hee... warm stones, cold broth... worms dance under the town...',
                        isNoise: false,
                        recommendedVoice: this.pickCreatureVoice(bzDummy, 'idiot')
                    };
                } else if (bzAct.includes('vomit')) {
                    prose = `Racked by stale ale and foul rot, the ${bzMon} retches violently onto the stones at ${name}'s feet, clutching a swollen belly with miserable groans.`;
                    dialogue = {
                        speaker: bzMon,
                        text: '*Hacks, retches and gags wretchedly onto the cobblestones: Urrrggh-blech!*',
                        isNoise: true,
                        recommendedVoice: null
                    };
                } else if (bzAct.includes('babble') || bzAct.includes('giggle')) {
                    prose = `An unhinged, chilling cackle bursts from the ${bzMon}, echoing eerily against damp stone as it mutters nonsense to the empty air.`;
                    dialogue = {
                        speaker: bzMon,
                        text: 'They crawl in the walls! Do you hear the bells chiming in the mud?',
                        isNoise: false,
                        recommendedVoice: this.pickCreatureVoice(bzDummy, 'idiot')
                    };
                } else {
                    prose = `The ${bzMon} behaves with unpredictable mania, startling ${name} with erratic movements and wild gestures.`;
                }
                break;
            }

            case 'CREATURE_STATE_CHANGE': {
                const stMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'creature';
                const stVal = (event.data && event.data.state) ? event.data.state : 'stirs';
                title = `Stirring: ${stMon}`;
                if (stVal.includes('wake')) {
                    prose = `The ${stMon} suddenly jerks awake from its slumber! Blinking against the torchlight, its gaze locks upon ${name} with startled fury.`;
                } else if (stVal.includes('sleep')) {
                    prose = `A profound lethargy overtakes the ${stMon}. Its eyelids droop, weapon slipping from limp fingers as it slumps into a deep, snoring stupor upon the stones.`;
                } else if (stVal.includes('confus')) {
                    prose = `Bewilderment clouds the senses of the ${stMon}! Reeling in total confusion, it staggers aimlessly, unable to tell friend from foe.`;
                } else {
                    prose = `The condition of the ${stMon} shifts as it ${stVal}, altering the momentum of the encounter.`;
                }
                break;
            }

            case 'RITUAL_INSIGHT': {
                const rCount = (event.data && event.data.count) ? event.data.count : 1;
                title = 'Arcane Awakening';
                prose = `A luminous clarity pierces ${name}'s consciousness! The hidden symmetries of eldritch lore snap into focus, granting the knowledge to master ${rCount} new ritual of power.`;
                insight = "Press 'm' to study ritual incantations and bind new spells to your arsenal.";
                break;
            }

            case 'STORE_VISIT': {
                const stName = (event.data && event.data.storeName) ? event.data.storeName : 'Town Merchant';
                title = `Sanctuary: ${stName}`;
                prose = `Crossing the worn threshold of the ${stName}, ${name} steps out of the chill frontier wind into dry warmth scented with tallow, iron filings, and aged cedar. The shopkeeper glances up from heavy ledgers, nodding in measured greeting.`;
                insight = "Browse goods carefully. Torches, flasks of oil, and food rations are vital before any descent.";
                break;
            }

            case 'LEVEL_FEELING': {
                const fText = (event.data && event.data.feelingText) ? event.data.feelingText : 'a strange aura';
                title = `Intuition in the Deep`;
                prose = `An ancient premonition crawls along ${name}'s spine like winter frost at ${depthFt}: ${fText}. Every nerve tightens as the dungeon breathes its silent warning.`;
                break;
            }

            case 'CREATURE_ASSAULT':
                const aMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'A shadowy assailant';
                const aAct = (event.data && event.data.action) ? event.data.action : 'hits';
                title = `Ambush: ${aMon}`;

                const dummyMon = { name: aMon, glyph: (event.data && event.data.glyph) ? event.data.glyph : '' };
                const aProfile = this.classifyCreature(dummyMon);

                if (!aProfile.isVocal) {
                    prose = aProfile.assaultProse(name, aAct);
                    dialogue = { speaker: aMon, text: aProfile.assaultNoise, isNoise: true, recommendedVoice: null };
                } else {
                    prose = aProfile.assaultProse(name, aAct);
                    const bText = typeof aProfile.assaultBark === 'function' ? aProfile.assaultBark(aAct) : aProfile.ambientBark;
                    dialogue = {
                        speaker: aMon,
                        text: (bText || 'Die!').replace(/"/g, ''),
                        isNoise: false,
                        recommendedVoice: aProfile.recommendedVoice || 'en-US-RogerNeural'
                    };
                }
                break;

            case 'COMBAT_EPISODE':
            case 'SIGNIFICANT_KILL':
                const kills = event.data ? (event.data.kills || (event.data.message ? [event.data.message] : [])) : [];
                const killSaga = this.generateKillSaga(kills, player, depth, traditionKey, weapon);
                title = killSaga.title;
                prose = killSaga.prose;
                break;

            case 'EXPLORATION_FLOW':
            case 'EPISODE_SUMMARY':
                title = 'Echoes in the Deep';
                prose = `Treading cautiously past cracked pillars at ${depthFt}, ${name} scouts the perimeter of the damp vault, eyes searching the shadows for lurking ambushes and hidden treasures.`;
                break;

            case 'ARTIFACT_AWAKENING':
                const artName = event.data ? event.data.artifactName : 'Ancient Relic';
                title = `Awakening: ${artName}`;
                const lore = this.CANON_ARTIFACT_LORE[artName] || 'A sacred relic forged in the First Age of the world.';
                prose = `As ${name} brushes the grime from the ancient relic, a chill of awe ripples through the hall. ${lore}`;
                insight = "Artifacts cannot be destroyed by fire, acid, or electrical breaches. Guard them well.";
                break;

            case 'FLOOR_CHANGE':
            default:
                const d = event.data ? event.data.newDepth : 1;
                title = `Descent to ${d * 50} Feet`;
                prose = `Down the damp stone stairwell ${name} treads deeper into the black earth. The masonry grows older here, hewn by crude goblin picks and ancient slave-gangs of the Iron Hell.`;
                break;
        }

        return {
            title: title,
            prose: prose,
            dialogue: dialogue,
            insight: insight,
            depth: player ? (player.depth || 0) : 0,
            summary: prose.substring(0, 160) + '...'
        };
    }
}

if (typeof window !== 'undefined') {
    window.ChronicleGrounder = ChronicleGrounder;
}

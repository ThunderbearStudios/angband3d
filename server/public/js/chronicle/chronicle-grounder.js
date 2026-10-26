/**
 * ChronicleGrounder — Strict Lorekeeper, Fact-Sheet Compiler & 4th-Wall Guide
 * Grounded in canon Tolkien lore, creature/player states, survival guide knowledge,
 * and the three literary traditions of Arda.
 */

// Absolute 3D Visual Geometry Ground Truth Sets
const FEMALE_3D_MODEL_KEYS = new Set(['casual', 'witch', 'beach', 'female_peasant', 'female_ranger', 'superhero_female']);
const MALE_3D_MODEL_KEYS = new Set(['farmer', 'worker', 'adventurer', 'medieval', 'punk', 'soldier', 'king', 'formal', 'knight', 'barbarian', 'wizard']);

// Static compiled RegExp constants for creature gender detection
const RE_GENDER_FEMALE = /\b(female|woman|lady|maiden|crone|hag|witch|priestess|sorceress|enchantress|temptress|mistress|matron|siren|harpy|nymph|dryad|medusa|gorgon|banshee|shelob|thuringwethil|ungoliant|lobelia|maid|girl|princess|duchess|daughter|mother|sister|wife|vixen|queen)\b/i;
const RE_GENDER_MALE = /\b(king|prince|lord|patriarch|emperor|baron|warlock|father|brother|man|boy|son|husband|male)\b/i;

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
        },
        amber: {
            id: 'amber',
            name: 'The Amber Chronicles & Multiverse Codex',
            badge: 'Amberite Scion',
            style: 'Lively, cynical fencing wit, epic of overland wilderness, myriad monster folk, shadow-walking, and the eternal clash between the Pattern and Chaos.'
        },
        mythicbard: {
            id: 'mythicbard',
            name: 'The Wilderland Saga',
            badge: 'Mythic Bard',
            style: 'Lively, grand epic of overland wilderness, myriad monster folk, wondrous enchantments, and legendary feats across boundless realms.'
        },
        easternmythos: {
            id: 'easternmythos',
            name: 'The Scrolls of Bushido & Eastern Mythos',
            badge: 'Eastern Kensei',
            style: 'Zen tranquility, Bushido valor, celestial court judgments, mythical deities, and the lethal grace of the sword.'
        },
        beleriand: {
            id: 'beleriand',
            name: 'The Lay of Leithian & Beleriand Songs',
            badge: 'First Age Minstrel',
            style: 'Solemn First Age epic, songs of stealth and woven spells, shadows beneath Thangorodrim, and the desperate quest for Morgoth\'s Iron Crown.'
        }
    };

    static getTraditionForRealm(realmKey, race = '') {
        switch ((realmKey || 'angband').toLowerCase()) {
            case 'frogcomposband': return 'amber';
            case 'hengband': return 'easternmythos';
            case 'silq': return 'beleriand';
            case 'angband':
            default:
                return this.getTraditionForRace(race);
        }
    }

    static getLorekeeperName(realmKey = 'angband') {
        switch ((realmKey || 'angband').toLowerCase()) {
            case 'silq': return 'Daeron of Doriath';
            case 'hengband': return 'Miyamoto Musashi';
            case 'frogcomposband': return 'Corwin of Amber';
            case 'angband':
            default:
                return 'Master Elrond';
        }
    }

    static getLorekeeperTitle(realmKey = 'angband') {
        switch ((realmKey || 'angband').toLowerCase()) {
            case 'silq': return 'Chief Minstrel of King Thingol & Maker of the Runes';
            case 'hengband': return 'Kensei of the Two Heavens & Chronicler of Bushido';
            case 'frogcomposband': return 'Prince of Amber & Master of the Pattern';
            case 'angband':
            default:
                return 'Master of Rivendell & Chronicler of the Elder Days';
        }
    }

    static getLorekeeperVoice(realmKey = 'angband', gender = 'male') {
        const isFemale = (gender === 'female');
        switch ((realmKey || 'angband').toLowerCase()) {
            case 'silq':
                return isFemale ? 'Despina' : 'Charon';
            case 'hengband':
                return isFemale ? 'Sulafat' : 'Gacrux';
            case 'frogcomposband':
                return isFemale ? 'Kore' : 'Fenrir';
            case 'angband':
            default:
                return isFemale ? 'Zephyr' : 'Enceladus';
        }
    }

    static getRealmContext(realmKey = 'angband') {
        switch ((realmKey || 'angband').toLowerCase()) {
            case 'silq':
                return {
                    realm: 'silq',
                    chronicler: 'Daeron of Doriath, Chief Minstrel of King Thingol and Master of the Cirth',
                    lorekeeperName: 'Daeron of Doriath',
                    lorekeeperTitle: 'Chief Minstrel of King Thingol & Maker of the Runes',
                    setting: 'Beleriand in the First Age of the Sun, under the gloom of Thangorodrim. The quest to cut a sacred Silmaril from Morgoth\'s Iron Crown with the Knife Angrist',
                    traditionKey: 'beleriand',
                    style: 'Solemn First Age epic, songs of stealth and woven spells, shadows beneath Thangorodrim, and the desperate quest for Morgoth\'s Iron Crown',
                    dialogueStyle: 'Archaic First Age Beleriand tone, grim pride, songs of stealth or curses of the Iron Hell, archaic high fantasy',
                    voice: 'en-GB-RyanNeural',
                    recommendedVoice: 'en-GB-RyanNeural',
                    geminiVoice: 'Charon'
                };
            case 'hengband':
                return {
                    realm: 'hengband',
                    chronicler: 'Miyamoto Musashi, Kensei of the Two Heavens and Chronicler of Bushido',
                    lorekeeperName: 'Miyamoto Musashi',
                    lorekeeperTitle: 'Kensei of the Two Heavens & Chronicler of Bushido',
                    setting: 'The Sengoku Realm and Eastern Mythos, where ancient Angband dungeons are entwined with feudal Japan, Shinto kami, Buddhist sutras, samurai honor, and perilous yokai',
                    traditionKey: 'easternmythos',
                    style: 'Zen tranquility, Bushido valor, celestial court judgments, mythical deities, and the lethal grace of the sword',
                    dialogueStyle: 'Disciplined feudal Bushido honor or menacing Japanese folklore presence, stoic, terse, and respectful or fierce',
                    voice: 'en-US-BrianNeural',
                    recommendedVoice: 'en-US-BrianNeural',
                    geminiVoice: 'Gacrux'
                };
            case 'frogcomposband':
                return {
                    realm: 'frogcomposband',
                    chronicler: 'Corwin of Amber, Prince of Amber and Chronicler of the Pattern',
                    lorekeeperName: 'Corwin of Amber',
                    lorekeeperTitle: 'Prince of Amber & Master of the Pattern',
                    setting: 'The Boundless Multiverse and the Realm of Amber, where all worlds are but Shadows of the One True City, bounded by the Pattern and the Logrus',
                    traditionKey: 'amber',
                    style: 'Lively, cynical fencing wit, epic of overland wilderness, myriad monster folk, shadow-walking, and the eternal clash between the Pattern and Chaos',
                    dialogueStyle: 'Sharp, cynical Amber courtly wit, hard-boiled Zelazny fencing banter, caustic and observant',
                    voice: 'en-US-ChristopherNeural',
                    recommendedVoice: 'en-US-ChristopherNeural',
                    geminiVoice: 'Fenrir'
                };
            case 'angband':
            default:
                return {
                    realm: 'angband',
                    chronicler: 'Master Elrond of Rivendell, Lorekeeper of the Elder Days',
                    lorekeeperName: 'Master Elrond',
                    lorekeeperTitle: 'Master of Rivendell & Chronicler of the Elder Days',
                    setting: 'Middle-earth in the Third Age of the Sun, beneath the dread Fortress of Angband in the Iron Hell',
                    traditionKey: 'westmarch',
                    style: 'Direct, courageous, humble steadfastness, songs of forgotten valor, stubborn endurance against darkness',
                    dialogueStyle: 'Vintage high fantasy cadence, archaic Middle-earth gravity, resolute and atmospheric',
                    voice: 'en-GB-ThomasNeural',
                    recommendedVoice: 'en-GB-ThomasNeural',
                    geminiVoice: 'Enceladus'
                };
        }
    }

    static CANON_ARTIFACT_LORE = {
        // --- Third Age & Middle-earth (Angband) ---
        "Phial of Galadriel": "It shines with the trapped light of Eärendil's Star, distilled from the Silmaril. In places where all other lights go out, its silver ray pierces the deepest dark of Morgoth.",
        "Glamdring": "The Foe-hammer, forged in hidden Gondolin for King Turgon himself. The goblins of the Misty Mountains trembled before its cold, white gleam, naming it 'Beater'.",
        "Ring of Barahir": "A ring of twin serpents with eyes of green emerald, crowned by golden flowers. Worn by Beren in the dread quest for the Silmaril; an eternal token of kinship between Elves and Men.",
        "Arkenstone": "A great white gem, cut by the Dwarves of Erebor, that gathered the light of all fires into a thousand shining facets. The Heart of the Mountain.",
        "Narsil": "The blade forged by Telchar of Nogrod, which shore the One Ring from Sauron's hand before the Black Gate.",
        "Sting": "An elven dagger forged in Gondolin that glows with cold blue light when Orcs or Goblins draw near.",
        "Amulet of Carlammas": "A talisman of ancient craft offering ward against fire and terror, steeped in the blessing of the Valar.",
        "Palantír": "A Seeing Stone of Westernesse, showing visions of far distances and forgotten times through the dark.",
        "Grond": "The Hammer of the Underworld, forged in the deep fires of Angband, wielded by Morgoth himself in his duel against High King Fingolfin.",
        "Ring of Thrór": "One of the Seven Rings of the Dwarf-lords, deepening the wealth and endurance of the Dwarves of Erebor.",

        // --- First Age of Beleriand (Sil-Q) ---
        "Knife Angrist": "The iron-cleaving knife forged by Telchar of Nogrod, carried by Curufin and wrested by Beren to cut a sacred Silmaril from the Iron Crown of Morgoth.",
        "Angrist": "The iron-cleaving knife forged by Telchar of Nogrod, carried by Curufin and wrested by Beren to cut a sacred Silmaril from the Iron Crown of Morgoth.",
        "Nauglamír": "The Necklace of the Dwarves, fashioned of gold and adorned with unnumbered gems of Valinor, wrought for Finrod Felagund by the craftsmen of Nogrod.",
        "Dragon-helm of Dor-lómin": "The towering crest of Hador, crested with the image of Glaurung the Golden, struck with fear into the hearts of all thralls of Angband.",
        "Ring of Felagund": "The green-gemmed signet of twin serpents given to Barahir upon the fen of Serech in token of eternal aid.",
        "Silmaril": "One of the three holy jewels fashioned by Fëanor from the living light of the Two Trees of Valinor, set into the crushing iron circlet of Morgoth.",
        "Mail of Eärendil": "Mithril mail woven without seam in Gondolin, impenetrable to the venomous darts and jagged scimitars of the Orcs.",
        "Helm of Hador": "The sacred heirloom of the House of Hador, impenetrable against cold steel and dragon-fire.",
        "Spear of Gil-galad": "Aeglos, the icicle of snow and silver, whose gleaming point pierced the shadows before the gates of doom.",

        // --- Amber & Multiverse (FrogComposBand) ---
        "Grayswandir": "The silver blade of Corwin of Amber, etched with a portion of the Pattern. It strikes across dimensions and cleaves apparitions, chaos beasts, and shadow-spawn as though they were mortal flesh.",
        "Werewindle": "Brand's golden sword, twin to Grayswandir, blazing with an amber luster that pierces shadows across the multiverse.",
        "Jewel of Judgment": "The great ruby talisman worn by Oberon, King of Amber, containing the higher Pattern within its fiery depths, granting dominion over weather, probability, and shadow.",
        "Spikard of Doom": "One of the primordial rings of power from the Courts of Chaos, drawing raw magical energy from the distant font of creation.",
        "Trump Deck of Amber": "Cards etched by Dworkin Barimen depicting the Princes and Princesses of Amber and the sacred places of the cosmos, allowing instantaneous telepathic communion and shadow transit.",
        "Necronomicon": "The forbidden grimoire of Abdul Alhazred, bound in sinister leather and pulsing with elder multiversal entities.",
        "Vorpal Blade": "A snicker-snack blade that decapitates foes with mathematical precision, ignoring thick scales and armor.",

        // --- Eastern Mythos & Sengoku (Hengband) ---
        "Kusanagi-no-Tsurugi": "The legendary Grass-Cutting Sword drawn from the tail of the eight-headed dragon Yamata-no-Orochi by Susanoo. It commands the mountain winds and banishes foul spirits.",
        "Kusanagi": "The legendary Grass-Cutting Sword drawn from the tail of the eight-headed dragon Yamata-no-Orochi by Susanoo. It commands the mountain winds and banishes foul spirits.",
        "Muramasa": "The demonic katana forged by the legendary smith Muramasa. Thirsting insatiably for blood, it strikes with lethal sharpness but hungers to draw the wielder into madness.",
        "Masamune": "The sacred, tranquil katana crafted by Master Masamune. In contrast to Muramasa's bloodthirst, this blade cuts only with justice and wards off curses and evil intents.",
        "Yata-no-Kagami": "The sacred eight-hand bronze mirror representing cosmic wisdom, reflecting the truth of all spirits and casting blinding heavenly light upon demonic shadows.",
        "Yasakani-no-Magatama": "The curved jewel of green jade belonging to the Imperial Regalia, carrying the divine protection of the sun goddess Amaterasu.",
        "Tonbogiri": "The legendary spear of Honda Tadakatsu, so exquisitely sharp that a dragonfly landing on its tip was sliced in two by its own weight.",
        "Katana of Musashi": "The paired steel of Miyamoto Musashi, Master of the Niten Ichi-ryū. Balanced with sublime perfection, they cut with the serenity of the void and the lethal speed of lightning.",
        "Musashi": "The paired steel of Miyamoto Musashi, Master of the Niten Ichi-ryū. Balanced with sublime perfection, they cut with the serenity of the void and the lethal speed of lightning."
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
     * Visual 3D geometry with breasts/feminine anatomy serves as absolute authoritative ground truth.
     */
    static detectCreatureGender(nameOrEntity = '', monster = null) {
        let name = '';
        if (typeof nameOrEntity === 'string') {
            name = nameOrEntity;
        } else if (nameOrEntity && typeof nameOrEntity === 'object') {
            monster = monster || nameOrEntity;
            name = nameOrEntity.name || '';
        }

        // 1. Authoritative 3D Model Visual Geometry takes absolute ground truth
        if (monster) {
            if (monster.isFemale === true) return 'female';
            const mKey = (monster.modelKey || (monster.config && monster.config.templateKey) || (monster.model ? monster.model.replace(/\.gltf$/i, '') : '') || '').toLowerCase();
            if (mKey && FEMALE_3D_MODEL_KEYS.has(mKey)) return 'female';
            if (mKey && MALE_3D_MODEL_KEYS.has(mKey)) return 'male';

            // Check active 3D world scene entity if present
            const dungeon = (typeof window !== 'undefined')
                ? (window.dungeon || (window.__app && window.__app.dungeon) || (window.chronicleManager && window.chronicleManager.dungeon))
                : null;
            if (dungeon && dungeon.monsters) {
                const id = monster.id !== undefined ? monster.id.toString() : (monster.x !== undefined ? `${monster.x}_${monster.y}_${monster.glyph}` : null);
                if (id && dungeon.monsters.has(id)) {
                    const ent = dungeon.monsters.get(id);
                    if (ent) {
                        if (ent.isFemale === true || ent.modelGender === 'female') return 'female';
                        const entKey = (ent.modelKey || (ent.config && ent.config.templateKey) || (ent.model ? ent.model.replace(/\.gltf$/i, '') : '') || '').toLowerCase();
                        if (entKey && FEMALE_3D_MODEL_KEYS.has(entKey)) return 'female';
                        if (entKey && MALE_3D_MODEL_KEYS.has(entKey)) return 'male';
                    }
                }
            }
        }

        const lower = (name || '').toLowerCase();

        // 2. Explicit Female Keywords (Takes absolute precedence over generic role words)
        if (RE_GENDER_FEMALE.test(lower)) {
            return 'female';
        }

        // 3. Explicit Male Biological/Title Roles Only
        if (RE_GENDER_MALE.test(lower)) {
            return 'male';
        }

        // 4. Stored / Model Gender Tags
        if (monster) {
            if (monster.modelGender || monster.gender || monster.sex) {
                const rawG = String(monster.modelGender || monster.gender || monster.sex).toLowerCase();
                if (rawG.startsWith('f')) return 'female';
                if (rawG.startsWith('m')) return 'male';
            }
            const mKey = (monster.modelKey || (monster.config && monster.config.templateKey) || '').toLowerCase();
            if (mKey && this.MALE_3D_MODEL_KEYS.has(mKey)) {
                return 'male';
            }
        }

        // 5. Default fallback to male when gender is unspecified or ambiguous per user preference
        return 'male';
    }

    static instanceVoiceRegistry = new Map();
    static recentDialogueBarks = new Map();
    static _lastNarrativeState = {
        depth: null,
        eventType: null,
        turn: null
    };

    static clearInstanceVoiceRegistry() {
        this.instanceVoiceRegistry.clear();
        this.recentDialogueBarks.clear();
        this.recentCombatVerbs.length = 0;
        this._lastNarrativeState = {
            depth: null,
            eventType: null,
            turn: null
        };
    }

    static recentCombatVerbs = [];
    static recordCombatVerb(verb) {
        if (!verb || typeof verb !== 'string') return;
        const v = verb.toLowerCase().trim();
        if (!ChronicleGrounder.recentCombatVerbs.includes(v)) {
            ChronicleGrounder.recentCombatVerbs.push(v);
            if (ChronicleGrounder.recentCombatVerbs.length > 12) {
                ChronicleGrounder.recentCombatVerbs.shift();
            }
        }
    }

    /**
     * Non-repeating combat phrase selector with rotational verb avoidance.
     * Prevents consecutive identical attack prose across battle turns.
     */
    static pickNonRepeatingCombatPhrase(phraseList, seed = 0) {
        if (!phraseList || phraseList.length === 0) return '';
        if (phraseList.length === 1) return phraseList[0];

        let available = phraseList.filter(p => {
            const lower = p.toLowerCase();
            return !ChronicleGrounder.recentCombatVerbs.some(v => v.length > 3 && lower.includes(v));
        });

        if (available.length === 0) {
            // Relieve oldest half of verb memory
            ChronicleGrounder.recentCombatVerbs.splice(0, 6);
            available = phraseList.filter(p => {
                const lower = p.toLowerCase();
                return !ChronicleGrounder.recentCombatVerbs.some(v => v.length > 3 && lower.includes(v));
            });
            if (available.length === 0) available = phraseList;
        }

        const chosen = available[Math.abs(seed) % available.length];
        return chosen;
    }

    /**
     * Non-repeating bark selector with LRU memory buffer per category/speaker.
     * Prevents consecutive identical barks and guarantees variety across turns.
     */
    static pickNonRepeatingBark(key, barkList, seed = 0, options = {}) {
        if (!barkList || barkList.length === 0) return '';
        if (barkList.length === 1) return barkList[0];

        let history = this.recentDialogueBarks.get(key);
        if (!history) {
            history = [];
            this.recentDialogueBarks.set(key, history);
        }

        let available = barkList.filter(b => !history.includes(b));
        if (available.length === 0) {
            const last = history[history.length - 1];
            if (!options.dryRun) {
                history.length = 0;
                if (last) history.push(last);
            }
            available = barkList.filter(b => b !== last);
            if (available.length === 0) available = barkList;
        }

        const chosen = available[Math.abs(seed) % available.length];
        if (!options.dryRun) {
            history.push(chosen);
            if (history.length > 12) history.shift();
        }
        return chosen;
    }

    static hashString(str = '') {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    static getInstanceKey(entityOrMonster = null, player = null, traditionKey = 'westmarch', isHeroExplicit = false) {
        if (!entityOrMonster && !isHeroExplicit) {
            return `narrator_${traditionKey || 'westmarch'}`;
        }
        if (entityOrMonster && (entityOrMonster.isLorekeeper || (entityOrMonster.name && entityOrMonster.name.toLowerCase().includes('lorekeeper')))) {
            return 'mentor_lorekeeper';
        }
        const isHero = isHeroExplicit || (entityOrMonster && (entityOrMonster.isHero || entityOrMonster.isPlayer || (player && entityOrMonster.name && player.name && entityOrMonster.name.toLowerCase() === player.name.toLowerCase())));
        if (isHero) {
            const pName = (entityOrMonster && entityOrMonster.name) ? entityOrMonster.name : ((player && player.name) ? player.name : 'Hero');
            const pRace = (entityOrMonster && entityOrMonster.race) ? entityOrMonster.race : ((player && player.race) ? player.race : 'Mortal');
            const pSex = (entityOrMonster && (entityOrMonster.sex || entityOrMonster.gender)) ? (entityOrMonster.sex || entityOrMonster.gender) : ((player && (player.sex || player.gender)) ? (player.sex || player.gender) : 'male');
            return `hero_${pName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${pRace.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${pSex.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
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
                gemini: ['Fenrir']
            },
            female: {
                edge: ['en-US-AriaNeural', 'en-AU-NatashaNeural'],
                gemini: ['Fenrir', 'Kore']
            }
        },
        kobold: {
            male: {
                edge: ['en-IE-ConnorNeural', 'en-US-GuyNeural'],
                gemini: ['Puck']
            },
            female: {
                edge: ['en-IE-EmilyNeural', 'en-GB-MaisieNeural'],
                gemini: ['Puck', 'Leda']
            }
        },
        giant: {
            male: {
                edge: ['en-US-RogerNeural', 'en-US-ChristopherNeural'],
                gemini: ['Charon', 'Algenib']
            },
            female: {
                edge: ['en-AU-NatashaNeural', 'en-CA-ClaraNeural'],
                gemini: ['Kore', 'Sadaltager']
            }
        },
        spellcaster: {
            male: {
                edge: ['en-US-ChristopherNeural', 'en-GB-RyanNeural', 'en-US-BrianNeural'],
                gemini: ['Gacrux', 'Sulafat']
            },
            female: {
                edge: ['en-US-AriaNeural', 'en-GB-LibbyNeural'],
                gemini: ['Despina', 'Aoede']
            }
        },
        rogue: {
            male: {
                edge: ['en-US-SteffanNeural', 'en-IE-ConnorNeural'],
                gemini: ['Orus', 'Puck']
            },
            female: {
                edge: ['en-AU-NatashaNeural', 'en-GB-SoniaNeural'],
                gemini: ['Kore', 'Despina']
            }
        },
        beast: {
            male: {
                edge: ['en-US-RogerNeural'],
                gemini: ['Fenrir']
            },
            female: {
                edge: ['en-US-RogerNeural'],
                gemini: ['Fenrir']
            }
        },
        dwarf: {
            male: {
                edge: ['en-US-RogerNeural', 'en-US-BrianNeural', 'en-IE-ConnorNeural'],
                gemini: ['Algenib', 'Gacrux', 'Orus']
            },
            female: {
                edge: ['en-CA-ClaraNeural', 'en-US-JennyNeural'],
                gemini: ['Kore', 'Sadaltager']
            }
        },
        elf: {
            male: {
                edge: ['en-GB-ThomasNeural', 'en-GB-RyanNeural'],
                gemini: ['Zephyr', 'Sulafat', 'Orus']
            },
            female: {
                edge: ['en-GB-LibbyNeural', 'en-IE-EmilyNeural'],
                gemini: ['Aoede', 'Despina']
            }
        },
        hobbit: {
            male: {
                edge: ['en-IE-ConnorNeural', 'en-US-GuyNeural'],
                gemini: ['Puck', 'Zephyr']
            },
            female: {
                edge: ['en-IE-EmilyNeural', 'en-GB-MaisieNeural'],
                gemini: ['Leda', 'Aoede']
            }
        },
        dragon: {
            male: {
                edge: ['en-US-ChristopherNeural', 'en-US-RogerNeural'],
                gemini: ['Charon', 'Algenib']
            },
            female: {
                edge: ['en-GB-SoniaNeural', 'en-US-AriaNeural'],
                gemini: ['Despina', 'Sadaltager']
            }
        },
        undead: {
            male: {
                edge: ['en-US-ChristopherNeural', 'en-US-RogerNeural'],
                gemini: ['Algenib', 'Charon']
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
                    gemini: ['Puck', 'Zephyr']
                },
                female: {
                    edge: ['en-GB-MaisieNeural', 'en-IE-EmilyNeural'],
                    gemini: ['Aoede', 'Leda']
                }
            },
            adult: {
                male: {
                    edge: ['en-US-GuyNeural', 'en-IE-ConnorNeural', 'en-CA-LiamNeural', 'en-GB-RyanNeural'],
                    gemini: ['Sulafat', 'Orus', 'Puck']
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
        return profile ? (profile.geminiVoice || profile.edgeVoice || 'Fenrir') : 'Fenrir';
    }

    /**
     * Contextual Voice & Emotion Resolver
     * Selects optimal voices with persistent continuity per instance while ensuring
     * unique variation instance-to-instance, strictly honoring character race, age, and 3D visual sex.
     */
    static resolveVoiceProfile(entityOrMonster = null, player = null, eventType = '', traditionKey = 'westmarch', isHeroExplicit = false, realmKey = null, langMode = 'en') {
        const isHero = isHeroExplicit || (entityOrMonster && (entityOrMonster.isHero || entityOrMonster.isPlayer || (player && entityOrMonster.name && player.name && entityOrMonster.name.toLowerCase() === player.name.toLowerCase())));
        const instanceKey = this.getInstanceKey(entityOrMonster, player, traditionKey, isHero);
        let cached = this.instanceVoiceRegistry.get(instanceKey);

        let gender, isF, raceArchetype, ageArchetype, edgeVoice, geminiVoice;
        let heroPitch = '+0Hz';
        let heroRate = '+0%';
        let heroDirectorNote = '';

        if (cached) {
            // Continuity: retain exact identity (voice, gender, race, age, pitch, rate)
            gender = cached.gender;
            isF = cached.isFemale;
            raceArchetype = cached.race;
            ageArchetype = cached.ageArchetype;
            edgeVoice = cached.edgeVoice;
            geminiVoice = cached.geminiVoice;
            heroPitch = cached.heroPitch || '+0Hz';
            heroRate = cached.heroRate || '+0%';
            heroDirectorNote = cached.heroDirectorNote || '';
        } else {
            if (isHero) {
                // Determine Hero Gender & Pronouns
                const pSex = (entityOrMonster && (entityOrMonster.sex || entityOrMonster.gender)) ? String(entityOrMonster.sex || entityOrMonster.gender).toLowerCase() : ((player && (player.sex || player.gender)) ? String(player.sex || player.gender).toLowerCase() : 'male');
                gender = pSex.startsWith('f') ? 'female' : 'male';
                isF = (gender === 'female');

                // Determine Hero Race & Physical Size Bracket
                const pRace = (entityOrMonster && entityOrMonster.race) ? entityOrMonster.race.toLowerCase() : ((player && player.race) ? player.race.toLowerCase() : '');
                let sizeBracket = (entityOrMonster && entityOrMonster.size) ? entityOrMonster.size.toLowerCase() : ((player && player.size) ? player.size.toLowerCase() : 'medium');
                if (sizeBracket !== 'massive' && sizeBracket !== 'stout' && sizeBracket !== 'small' && sizeBracket !== 'tall') {
                    if (pRace.includes('giant') || pRace.includes('titan') || pRace.includes('troll') || pRace.includes('ogre') || pRace.includes('golem')) {
                        sizeBracket = 'massive';
                    } else if (pRace.includes('dwarf')) {
                        sizeBracket = 'stout';
                    } else if (pRace.includes('hobbit') || pRace.includes('halfling') || pRace.includes('gnome') || pRace.includes('kobold') || pRace.includes('yeek')) {
                        sizeBracket = 'small';
                    } else if (pRace.includes('high-elf') || pRace.includes('elf') || pRace.includes('dunadan') || pRace.includes('dunedain')) {
                        sizeBracket = 'tall';
                    }
                }

                // Deterministic hero casting bound to hero signature
                const heroHash = this.hashString(instanceKey);
                if (sizeBracket === 'massive') {
                    geminiVoice = isF ? 'Kore' : (heroHash % 2 === 0 ? 'Charon' : 'Algenib');
                    edgeVoice = isF ? 'en-AU-NatashaNeural' : 'en-US-RogerNeural';
                    heroPitch = isF ? '-3Hz' : '-5Hz';
                    heroRate = isF ? '-3%' : '-5%';
                    heroDirectorNote = 'A towering, massive warrior with deep booming resonant bass and heavy powerful stride';
                } else if (sizeBracket === 'stout') {
                    geminiVoice = isF ? 'Sadaltager' : (heroHash % 2 === 0 ? 'Algenib' : 'Orus');
                    edgeVoice = isF ? 'en-CA-ClaraNeural' : 'en-US-RogerNeural';
                    heroPitch = isF ? '-1Hz' : '-3Hz';
                    heroRate = '+0%';
                    heroDirectorNote = 'A stout, broad dwarven warrior speaking with an earthy, gruff, resonant baritone';
                } else if (sizeBracket === 'small') {
                    geminiVoice = isF ? (heroHash % 2 === 0 ? 'Leda' : 'Aoede') : (heroHash % 2 === 0 ? 'Puck' : 'Zephyr');
                    edgeVoice = isF ? 'en-GB-MaisieNeural' : 'en-IE-ConnorNeural';
                    heroPitch = '+5Hz';
                    heroRate = '+6%';
                    heroDirectorNote = 'A diminutive, nimble adventurer speaking with a light, spirited, higher-pitched agile voice';
                } else if (sizeBracket === 'tall') {
                    geminiVoice = isF ? (heroHash % 2 === 0 ? 'Aoede' : 'Despina') : (heroHash % 2 === 0 ? 'Sulafat' : 'Zephyr');
                    edgeVoice = isF ? 'en-GB-LibbyNeural' : 'en-GB-ThomasNeural';
                    heroPitch = '+0Hz';
                    heroRate = '+0%';
                    heroDirectorNote = 'A tall, noble adventurer speaking with clear, melodious cadence and calm grace';
                } else {
                    geminiVoice = isF ? (heroHash % 2 === 0 ? 'Aoede' : 'Kore') : (pRace.includes('orc') ? 'Fenrir' : (heroHash % 2 === 0 ? 'Sulafat' : 'Orus'));
                    edgeVoice = isF ? 'en-US-JennyNeural' : 'en-US-GuyNeural';
                    heroPitch = '+0Hz';
                    heroRate = '+0%';
                    heroDirectorNote = 'A brave adventurer speaking with courage and steadfast resolve';
                }
                raceArchetype = sizeBracket;
                ageArchetype = 'adult';
            } else if (entityOrMonster) {
                // 1. GENDER / SEX: 100% deterministic alignment from 3D model and creature detection
                const name = (entityOrMonster.name || entityOrMonster.race || '');
                gender = this.detectCreatureGender(name, entityOrMonster);
                isF = (gender === 'female');

                // 2. RACE & CREATURE ARCHETYPE DETECTION
                const rawRace = (entityOrMonster.race || entityOrMonster.name || (player ? player.race : ''));
                const rLower = (rawRace || '').toLowerCase();
                const nLower = (name || '').toLowerCase();

                if (rLower.includes('giant') || rLower.includes('titan') || rLower.includes('ogre') || rLower.includes('troll')) {
                    raceArchetype = 'giant';
                } else if (rLower.includes('dragon') || rLower.includes('drake') || rLower.includes('wyrm')) {
                    raceArchetype = 'dragon';
                } else if (rLower.includes('undead') || rLower.includes('lich') || rLower.includes('ghost') || rLower.includes('spectre') || rLower.includes('wraith') || rLower.includes('vampire')) {
                    raceArchetype = 'undead';
                } else if (rLower.includes('kobold') || rLower.includes('goblin') || rLower.includes('snaga') || rLower.includes('imp')) {
                    raceArchetype = 'kobold';
                } else if (rLower.includes('orc') || rLower.includes('uruk')) {
                    raceArchetype = 'orc';
                } else if (rLower.includes('hound') || rLower.includes('wolf') || rLower.includes('dog') || rLower.includes('beast') || rLower.includes('rat')) {
                    raceArchetype = 'beast';
                } else if (rLower.includes('elf') || rLower.includes('eldar')) {
                    raceArchetype = 'elf';
                } else if (rLower.includes('dwarf')) {
                    raceArchetype = 'dwarf';
                } else if (rLower.includes('hobbit') || rLower.includes('halfling') || rLower.includes('gnome')) {
                    raceArchetype = 'hobbit';
                } else if (nLower.includes('mage') || nLower.includes('wizard') || nLower.includes('sorcerer') || nLower.includes('priest') || nLower.includes('cleric') || nLower.includes('cultist') || nLower.includes('witch') || nLower.includes('warlock') || nLower.includes('druid') || nLower.includes('shaman') || nLower.includes('seer')) {
                    raceArchetype = 'spellcaster';
                } else if (nLower.includes('thief') || nLower.includes('rogue') || nLower.includes('assassin') || nLower.includes('bandit') || nLower.includes('brigand') || nLower.includes('cutpurse')) {
                    raceArchetype = 'rogue';
                } else {
                    raceArchetype = 'mortal';
                }

                // 3. AGE & MARTIAL ARCHETYPE DETECTION
                ageArchetype = 'adult';
                if (/\b(ancient|elder|venerable|sage|archivist|scholar|old|crone|patriarch|matriarch|hermit|grey|white)\b/i.test(nLower) || (player && player.lev >= 35)) {
                    ageArchetype = 'elder';
                } else if (/\b(veteran|soldier|commander|knight|captain|guard|warrior|mercenary|scarred)\b/i.test(nLower)) {
                    ageArchetype = 'veteran';
                } else if (/\b(apprentice|youth|young|child|urchin|boy|girl|novice|thief|rogue|idiot|beggar)\b/i.test(nLower)) {
                    ageArchetype = 'youth';
                }

                // 4. INSTANCE-TO-INSTANCE UNIQUE CASTING
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
                // Master Chronicler / Narrator attunement: Realm-contextual standard high quality Gemini voice
                const rk = (realmKey) || (player && player.realm) || (typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function' ? window.__app.getActiveRealm() : (traditionKey === 'beleriand' ? 'silq' : (traditionKey === 'easternmythos' ? 'hengband' : (traditionKey === 'amber' ? 'frogcomposband' : 'angband'))));
                const realmCtx = this.getRealmContext(rk);
                edgeVoice = (rk === 'angband' || !rk) ? 'en-GB-RyanNeural' : ((realmCtx && realmCtx.recommendedVoice) || 'en-GB-RyanNeural');
                geminiVoice = this.getLorekeeperVoice(rk, 'male');
                gender = 'male';
                isF = false;
                raceArchetype = 'chronicler';
                ageArchetype = 'elder';
            }

            this.instanceVoiceRegistry.set(instanceKey, {
                edgeVoice,
                geminiVoice,
                gender,
                isFemale: isF,
                race: raceArchetype,
                ageArchetype,
                heroPitch,
                heroRate,
                heroDirectorNote
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
        let pitch = heroPitch || '+0Hz';
        let rate = heroRate || '+0%';

        if (!entityOrMonster && !isHero) {
            // Master Narrator is tuned to the realm and dynamically responds to situational context (peril, stealth, town, boss)
            const rk = (realmKey) || (player && player.realm) || (typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function' ? window.__app.getActiveRealm() : (traditionKey === 'beleriand' ? 'silq' : (traditionKey === 'easternmythos' ? 'hengband' : (traditionKey === 'amber' ? 'frogcomposband' : 'angband'))));
            geminiVoice = this.getLorekeeperVoice(rk, 'male');
            const realmCtx = this.getRealmContext(rk);
            edgeVoice = (rk === 'angband' || !rk) ? 'en-GB-RyanNeural' : ((realmCtx && realmCtx.recommendedVoice) || 'en-GB-RyanNeural');

            if (eventType === 'HERO_DEATH') {
                emotion = 'mournful';
                geminiTag = '[mournfully, with profound solemnity and sorrow, expressive slightly British older storyteller]';
                directorNote = 'An expressive, slightly British older fireside storyteller reciting a solemn funeral epitaph with deep elder grief, gravitas, and reverence for a fallen hero';
                pitch = '-2Hz';
                rate = '-8%';
            } else if (isPeril) {
                emotion = 'panicked';
                geminiTag = '[panicked, expressive slightly British older storyteller]';
                directorNote = 'An expressive, slightly British older fireside storyteller, voice tense and breathless as mortal peril tightens in the dark';
                pitch = '+3Hz';
                rate = '+8%';
            } else if (isBoss) {
                emotion = 'serious';
                geminiTag = '[grimly, with grave dread, expressive slightly British older storyteller]';
                directorNote = 'An expressive, slightly British older fireside storyteller recounting with solemn dread an ancient terror of the First Age';
                pitch = '-2Hz';
                rate = '-4%';
            } else if (isBleedingOrStun) {
                emotion = 'strained';
                geminiTag = '[strained with sorrow, expressive slightly British older storyteller]';
                directorNote = 'An expressive, slightly British older fireside storyteller recounting grievous wounds with elder sympathy and somber weight';
                pitch = '+2Hz';
                rate = '+4%';
            } else if (isStealth) {
                emotion = 'whispering';
                geminiTag = '[whispers, expressive slightly British older storyteller]';
                directorNote = 'An expressive, slightly British older fireside storyteller whispering softly in the dark shadows of the vaults';
                pitch = '-1Hz';
                rate = '-7%';
            } else if (isTown) {
                emotion = 'cheerful';
                geminiTag = '[warmly, with hearty camaraderie, expressive slightly British older storyteller]';
                directorNote = 'An expressive, slightly British older fireside storyteller with warmth and subtle dry wit recounting the bustling settlement';
                pitch = '+1Hz';
                rate = '+3%';
            } else {
                emotion = 'calm';
                pitch = '+0Hz';
                rate = '+0%';
                if (traditionKey === 'noldor') {
                    geminiTag = '[expressive, slightly British older storyteller, poetic and noble]';
                    directorNote = 'An expressive, slightly British older fireside storyteller reciting ancient high Elven verse with sorrowful elder gravitas';
                } else if (traditionKey === 'khazad') {
                    geminiTag = '[expressive, slightly British older storyteller, stern stonecraft gravitas]';
                    directorNote = 'An expressive, slightly British older fireside storyteller chronicling deep Dwarven stone-annals with stern gravitas and subtle dry wit';
                } else {
                    geminiTag = '[expressive, slightly British older storyteller, warm fireside cadence]';
                    directorNote = 'An expressive, slightly British older fireside storyteller with warmth, subtle dry wit, and deep elder gravitas recounting an ancient epic legend';
                }
            }
        } else if (isHero) {
            // Hero Voice Dynamic Situation Modifiers
            directorNote = heroDirectorNote || 'A brave adventurer speaking with courage and steadfast resolve';
            if (isPeril) {
                emotion = 'panicked';
                geminiTag = '[panicked, gasping for breath, no American southern drawl]';
                directorNote = `${directorNote}, desperately fighting for survival`;
                const baseP = parseInt(heroPitch, 10) || 0;
                pitch = (baseP >= 0 ? `+${baseP + 3}` : `${baseP + 3}`) + 'Hz';
                rate = '+8%';
            } else if (isBleedingOrStun) {
                emotion = 'strained';
                geminiTag = '[groaning in pain, no American southern drawl]';
                directorNote = `${directorNote}, heavily wounded and straining against injury`;
                const baseP = parseInt(heroPitch, 10) || 0;
                pitch = (baseP >= 0 ? `+${baseP + 2}` : `${baseP + 2}`) + 'Hz';
                rate = '+4%';
            } else if (isStealth) {
                emotion = 'whispering';
                geminiTag = '[whispers, no American southern drawl]';
                directorNote = `${directorNote}, whispering softly in the dark shadows`;
                const baseP = parseInt(heroPitch, 10) || 0;
                pitch = (baseP >= 0 ? `+${baseP - 1}` : `${baseP - 1}`) + 'Hz';
                rate = '-6%';
            } else {
                geminiTag = '[resolute, heroic, no American southern drawl]';
            }
        } else {
            // Build rich archetype-specific directorial description
            let archetypeDesc = 'Speaking in character';
            switch (raceArchetype) {
                case 'orc':
                    archetypeDesc = 'A harsh, guttural, menacing orc warrior snarling with aggressive Cockney growl';
                    break;
                case 'kobold':
                    archetypeDesc = 'A raspy, cunning, high-pitched goblin or kobold screech, frantic and vicious';
                    break;
                case 'dragon':
                    archetypeDesc = 'An ancient, cavernous draconic entity rumbling with haughty draconic wrath and immense resonant power';
                    break;
                case 'undead':
                    archetypeDesc = 'A sepulchral, chilling, hollow ancient undead entity whispering with cold unholy malice';
                    break;
                case 'giant':
                    archetypeDesc = 'A cavernous, slow, booming giant speaking with earth-shaking resonant bass';
                    break;
                case 'dwarf':
                    archetypeDesc = isF ? 'A hearty, resonant Scottish dwarven shieldmaiden with stone-hewn dwarven timbre' : 'A deep, gravelly Scottish-accented dwarven metalsmith with stone-hewn dwarven timbre and hearty brogue';
                    break;
                case 'elf':
                    archetypeDesc = isF ? 'An ethereal, melodic High-Elven lady speaking with crisp consonants and graceful cadence' : 'A regal, noble High-Elven lord speaking with crisp classical British diction';
                    break;
                case 'hobbit':
                    archetypeDesc = isF ? 'A cheerful, spirited hobbit speaking with warm countryside cadence' : 'A diminutive, lively hobbit speaking with warm West Country countryside cadence';
                    break;
                case 'rogue':
                    archetypeDesc = isF ? 'A sharp, streetwise British cutthroat speaking with cunning cadence' : 'A cunning, raspy urban British cutthroat with dangerous razor-sharp edge';
                    break;
                case 'spellcaster':
                    archetypeDesc = isF ? 'A smooth, mystical sorceress with eerie sibilance and formal diction' : 'A deep, resonant arcane scholar with formal British diction';
                    break;
                case 'beast':
                    archetypeDesc = 'A wild, primal beast with menacing animalistic growls';
                    break;
                case 'mortal':
                default:
                    if (ageArchetype === 'elder') {
                        archetypeDesc = 'A weathered, venerable elder speaking with elder gravitas and subtle dry wit';
                    } else if (ageArchetype === 'veteran') {
                        archetypeDesc = 'A grizzled, seasoned battlefield warrior speaking with commanding discipline';
                    } else if (ageArchetype === 'youth') {
                        archetypeDesc = 'A lively, spirited young townsperson speaking with bright energy';
                    } else {
                        archetypeDesc = 'A natural, warm Classical British townsperson with earnest presence';
                    }
                    break;
            }

            // Creature & NPC Dynamic Emotion & Archetype Directorial Guidance
            if (isPeril) {
                emotion = 'panicked';
                geminiTag = `[${archetypeDesc}, panicked, breathless and fighting for survival, no American southern drawl]`;
                directorNote = `${archetypeDesc}, desperate mortal panic, breathless and fighting for survival, no American southern drawl`;
                pitch = '+3Hz';
                rate = '+8%';
            } else if (isBoss) {
                emotion = 'serious';
                geminiTag = `[${archetypeDesc}, grimly, with ancient authority and grave dread, no American southern drawl]`;
                directorNote = `${archetypeDesc}, an epic confrontation with ancient terror, grim authority, no American southern drawl`;
                pitch = '-3Hz';
                rate = '-4%';
            } else if (isBleedingOrStun) {
                emotion = 'strained';
                geminiTag = `[${archetypeDesc}, groaning in pain, heavily wounded, no American southern drawl]`;
                directorNote = `${archetypeDesc}, grievously wounded, voice trembling with pain, no American southern drawl`;
                pitch = '+2Hz';
                rate = '+4%';
            } else if (isStealth) {
                emotion = 'whispering';
                geminiTag = `[${archetypeDesc}, whispers softly in dark shadows, no American southern drawl]`;
                directorNote = `${archetypeDesc}, hushed stealth in complete darkness, no American southern drawl`;
                pitch = '-1Hz';
                rate = '-7%';
            } else if (isTown) {
                emotion = 'cheerful';
                geminiTag = `[${archetypeDesc}, warmly, with hearty camaraderie, no American southern drawl]`;
                directorNote = `${archetypeDesc}, in the bustling town, with hearty camaraderie, no American southern drawl`;
                pitch = '+1Hz';
                rate = '+3%';
            } else {
                emotion = 'calm';
                geminiTag = `[${archetypeDesc}, in character, no American southern drawl]`;
                directorNote = `${archetypeDesc}, in character with authentic creature presence, no American southern drawl`;
                pitch = '+0Hz';
                rate = '+0%';
            }
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
                    ? ChronicleGrounder.pickNonRepeatingBark('idiot_low_combat', [
                        '"Waaaah! Hurts, hurts! Mommy, why you hit?! Don\'t hit poor me!"',
                        '"Mommy! Mercy! Hurts so bad! Leave poor Gaffer alone!"',
                        '"Waaah! Why you hit poor me?! Bad man! Don\'t hit!"',
                        '"Mercy, noble one! I give you pretty snail, just stop hitting poor me!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('idiot_high_combat', [
                        '"Screams and slobbers: No hit! Poor Gaffer got no coins! Waaah!"',
                        '"Why you mean to poor me?! Go away, mean traveler!"',
                        '"Don\'t touch! Bad stranger swinging sticks at poor me!"',
                        '"Hehe-waaah! Stop it, stop it! Leave me be!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `Weeping and slobbering in panic, the blubbering idiot flails ${pr.his} arms wildly before ${pName}!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('idiot_assault', [
                    'Get back! Leave poor me alone!',
                    'Waaah! Don\'t hit poor me! Bad traveler!',
                    'Screams and slobbers: No hurt, no hurt!',
                    'Mommy! The stranger is swinging steel at poor Gaffer!',
                    'Hands off! Go away, mean one!'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('rogue_low_combat', [
                        '"Curse your steel! Back off or I will drag you down with me!"',
                        '"Bleeding... but I will still slip a blade between your ribs!"',
                        '"Curse this town... you won\'t take my boots while I draw breath!"',
                        '"A pox on your sword! The shadows will swallow you whole!"',
                        '"Curse your blade! I will see you in the barrows before I die alone!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('rogue_high_combat', [
                        lower.includes('squint') ? '"Heh... your purse or your life, traveler! Hand over the silver!"' : '"Drop your coin and you might just leave this alley alive!"',
                        '"You think your steel frightens me, fool? I will carve the liver out of you!"',
                        '"Die, surface scum! I will pick your bones clean before the watch arrives!"',
                        '"Quick hands, cold steel! Let us see what spills from your purse!"',
                        '"You should have handed over the silver when you had the chance!"',
                        '"One slip in the cobblestone dark, and you are meat for the alley crows!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName, act) => act === 'steals'
                    ? `With practiced cunning, the ${name} slices through the purse-strings at ${pName}'s hip, darting backward with clinking stolen coin!`
                    : `From the damp shadows of the alley, a ${name} springs forward with bared steel, striking at ${pName} in a sudden, vicious ambush!`,
                assaultBark: (act) => act === 'steals'
                    ? ChronicleGrounder.pickNonRepeatingBark('rogue_steals', [
                        'A fair toll for walking through my streets, fool! Ha-ha!',
                        'Light fingers, heavy purse! The shadow toll is paid, stranger!',
                        'Your silver pays the alley toll! Heh!',
                        'Alley toll collected! Don\'t bother looking for it!'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('rogue_assault', [
                        'Hand over your purse, stranger, or I will paint these stones with your blood!',
                        'Your gold or your life, traveler—choose quickly!',
                        'A dagger in the dark ends all arguments!',
                        'Quiet now, soft-skin... make this easy and you might live!',
                        'One clean thrust between the ribs, and your silver is mine!',
                        'Nothing personal, stranger—just business in the shadows!'
                    ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('beggar_low_combat', [
                        '"Mercy! I yield! I have no silver, only rags! Spare a poor soul!"',
                        '"Please! I am bleeding! Have mercy on a dying beggar!"',
                        '"I yield, I yield! Spare an unarmed wretch!"',
                        '"By the stars, cease! I have done you no harm!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('beggar_high_combat', [
                        '"Why do you strike an unarmed beggar?! Guards, murder! Have mercy!"',
                        '"Help! Guards! A butcher attacks the destitute in the streets!"',
                        '"Spare me, noble sir! Take my wooden bowl, only don\'t kill!"',
                        '"Why spill beggar blood?! Have pity on the hungry!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `A ${name} extends a trembling, grime-caked hand toward ${pName}, pleading for bread.`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('beggar_assault', [
                    'Alms, kind traveler! Spare a copper bit for bread!',
                    'Have pity on a starving soul! Mercy, noble one!',
                    'A crust of bread, I beg of you! The cold bites so deep!',
                    'Do not strike an unarmed wretch! Mercy!',
                    'Spare a copper coin! May the stars preserve you!'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('veteran_low_combat', [
                        `"Curse your blade! A soldier dies on ${pr.his} feet!"`,
                        '"You have drawn blood, but my blade still thirsts! Stand and die!"',
                        '"The frontier has tested me harder than you! To me, then!"',
                        '"Steel breaks, but a veteran never yields! Face me!"',
                        '"A soldier does not beg! Let us finish this!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('veteran_high_combat', [
                        '"You want a taste of seasoned steel, fool?! Come on!"',
                        '"I have broken fiercer warriors than you in the deep trenches!"',
                        '"Your guard is open and your footwork sloppy! Yield or fall!"',
                        '"Iron and blood! You picked the wrong soldier to cross!"',
                        '"Let us see if your armor is as stout as your temper!"',
                        '"A soldier does not flinch before raw steel! Back to the dirt with you!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `The ${name} draws a scarred blade, stepping into a ready stance before ${pName}!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('veteran_assault', [
                    'Taste of veteran steel, runt!',
                    'Keep your guard up, or this will be quick!',
                    'You crossed the wrong soldier tonight, fool!',
                    'Steel meets steel! Let us see what you are made of!',
                    'I have cleaved fiercer warriors than you on the border!',
                    'Stand and fight, if you have the stomach for it!'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('town_low_combat', [
                        '"Guards! Murder! I am dying! Why do you attack me?!"',
                        '"Mercy! Murder in the streets! Take my purse, take my boots, only spare my life!"',
                        '"Help! Town watch, murder! Someone stop this bloodthirsty butcher!"',
                        '"I have a family! Murder! Have mercy, madman!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('town_high_combat', [
                        '"Madman! Put down your steel! Help! Town guards, murder in the streets!"',
                        '"Help! Murder in the square! Town guards, to me!"',
                        '"Why do you attack an unarmed citizen?! Murder! Guards!"',
                        '"Keep away from me, butcher! Murder! Guards! Someone stop this maniac!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `In sudden confusion and panic, the ${name} lashes out defensively against ${pName}!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('town_assault', [
                    'Get back! Leave me be, madman!',
                    'Guards! Town Watch! Violence in the street!',
                    'Put down your weapon! Are you insane?!',
                    'Help! Murder! Someone stop this madman!',
                    'Stay back! I am an honest citizen!'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('orc_low_combat', [
                        '"Curse your steel! I yield... mercy..."',
                        '"Curse your blade! The Eye will tear your soul to shreds!"',
                        '"Black blood spills... but my kin will feast on your marrow!"',
                        '"Curse the surface scum... I die on Morgoth\'s stone..."',
                        '"A thousand orcs will hunt you down for this... gah!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('orc_high_combat', [
                        '"You bleed just like the rest, dog! Tear them to pieces!"',
                        '"Fresh meat bleeds! Hack the surface scum to ribbons!"',
                        '"I will gnaw the marrow from your bones, worm!"',
                        '"Your skull will make a fine cup for our brew!"',
                        '"Heh-heh! Slice the throat and loot the boots!"',
                        '"Die on our scimitars, daylight scum!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `With a guttural screech, a ${name} leaps from the gloom, its jagged scimitar hacking furiously against ${pName}'s guard!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('orc_assault', [
                    'Die, surface scum! Fresh meat for the pits!',
                    'Hack them to pieces! Black blood and iron!',
                    'Tear the flesh from their bones! No mercy!',
                    'Slay the intruder! The Master\'s eye sees all!',
                    'Skewer the weakling! Your skull is mine!',
                    'Gnaw their marrow! Drive them into the dirt!',
                    'Gut the surface rat! Feed them to the wolves!'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('kobold_low_combat', [
                        '"No hit! Mercy! Squeeeee!"',
                        '"Hurts! Big one too strong! Mercy!"',
                        '"Screee! Don\'t kill, take the pretty rocks!"',
                        '"Yapp-yelp! Run for the cracks!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('kobold_high_combat', [
                        '"Die in the dark, intruder! Poison bites deep!"',
                        '"Yapp! Stick the big one! Skitter and kill!"',
                        '"Stab, stab, stab! Darkness take you!"',
                        '"Screee! Bleed on our stones, big one!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `Darting between shadows, a ${name} thrusts a venom-tipped dart straight toward ${pName}!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('kobold_assault', [
                    'Stick with poison! Skitter and die!',
                    'Yapp! Bite the heels! Take the shiny things!',
                    'Stab, stab, stab! Darkness take you!',
                    'Screee! Bleed on our stones, big one!',
                    'Snicker and slice! The dark warren feeds!'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('caster_low_combat', [
                        '"The Dark Lord... will avenge my blood... curse you..."',
                        '"My flesh fails, but my curse is sealed in the Nether!"',
                        '"The dark rites cannot be broken by mortal steel... curse you!"',
                        '"The abyss... reclaims me... but your soul is forfeit..."'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('caster_high_combat', [
                        '"Feel the icy hand of the Nether realms! Burn in dark fire!"',
                        '"Morgoth\'s shadow stretches over all—perish in agony!"',
                        '"Your weak prayers will not save you from the Nether!"',
                        '"Behold the dark power of the deeps! Weave your shroud!"',
                        '"Your life essence shall feed my ancient rituals!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `Dark syllables hiss through the air as the ${name} unleashes a crackling bolt of sorcery at ${pName}!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('caster_assault', [
                    'Burn in dark flames, mortal!',
                    'The Void hungers for your soul!',
                    'Perish in the cold shadow of the Nether!',
                    'Morgoth\'s darkness shall consume your light!',
                    'Your blood shall fuel the ancient rite!',
                    'Kneel before the Black Arts, fool!'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('undead_low_combat', [
                        '"...the dust reclaims all... but shadow never dies..."',
                        '"...shattered bones... yet darkness is eternal..."',
                        '"...our curse lingers in the stone forever..."'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('undead_high_combat', [
                        '"...the Barrow calls to you... your breath is ours..."',
                        '"...join us in the cold... surrender your warmth to the grave..."',
                        '"...flesh withers, steel rusts... only the tomb endures..."',
                        '"...feel the mortal heat drain from your veins..."'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `A freezing chill strikes through ${pName}'s mail as the ${name} glides in, trailing the dead numbness of the barrow!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('undead_assault', [
                    'Join us in the cold dark... yield your breath...',
                    'Mortality is a flicker... the grave is eternal...',
                    'Feel the chill of the barrows seep into your marrow...',
                    'Your soul shall wander the endless shadows...',
                    'The living have no dominion here... surrender to the dark...',
                    'Cold stone, cold dust... join the fallen...'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('dragon_low_combat', [
                        '"The mountains shall crumble... before my line is extinguished!"',
                        '"My dying wrath... shall incinerate the very bedrock!"',
                        '"Mortal cur... my kin will burn your cities to ash!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('dragon_high_combat', [
                        '"Mortal ash before my ancient flame! Burn, insect!"',
                        '"You dare match your fleeting spark against the dragon\'s breath?!"',
                        '"Your bones will melt into the gold beneath my talons!"',
                        '"Crawl before the lords of fire, wretched creature of clay!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `The subterranean air superheats as the ${name} lunges with ancient draconic fury, striking with terrifying force!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('dragon_assault', [
                    'Mortal ash before my wrath!',
                    'Burn, insect, in the ancient fire of the deeps!',
                    'You dare challenge the terror of the drakes?!',
                    'The mountains tremble at my roar—perish in flame!',
                    'Crawl into the embers, worm of clay!'
                ], Math.floor(Math.random() * 1000))
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
                    ? ChronicleGrounder.pickNonRepeatingBark('giant_low_combat', [
                        '"Gaaah! Stone flesh bleed! Die, little bug!"',
                        '"Hurts! Big hurts! Smash you into grease!"',
                        '"Troll not die! Troll rip off your arms!"',
                        '"Guhhh... hard skull crack! But me still crush you!"'
                    ], Math.floor(Math.random() * 1000))
                    : ChronicleGrounder.pickNonRepeatingBark('giant_high_combat', [
                        '"Crush you flat! Troll break your head!"',
                        '"Troll smell flesh! Smash little bones to powder!"',
                        '"Puny thing! Club go smash on your helmet!"',
                        '"Me turn you into paste! Big club hungry!"',
                        '"Stomp little legs! Break little ribs!"'
                    ], Math.floor(Math.random() * 1000)),
                assaultProse: (pName) => `With a deafening bellow, the massive ${name} brings down a tree-trunk club to shatter ${pName}'s footing!`,
                assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('giant_assault', [
                    'Smash bones to powder! Troll crush you!',
                    'Puny bug! Me make smear out of you!',
                    'Big club swing! Break your spine!',
                    'Troll eat your meat raw! Fresh marrow!',
                    'Crush, smash, stomp! Down you go!'
                ], Math.floor(Math.random() * 1000))
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
                ? ChronicleGrounder.pickNonRepeatingBark('humanoid_low_combat', [
                    '"Curse your blade! I will drag you down with me!"',
                    '"Blood in my eyes... but I\'ll still slit your throat!"',
                    '"Mercy? There is no mercy in these deeps!"',
                    '"Fall with me into the dark, scum!"'
                ], Math.floor(Math.random() * 1000))
                : ChronicleGrounder.pickNonRepeatingBark('humanoid_high_combat', [
                    '"Die, wretch! Your journey ends on cold flagstones!"',
                    '"You dare challenge the shadow? Your bones shall pave these halls!"',
                    '"Steel answers steel! Let us see what you are made of!"',
                    '"No light penetrates these deeps—only our blades!"',
                    '"Stand and fight, dog! Give me your blood!"'
                ], Math.floor(Math.random() * 1000)),
            assaultProse: (pName) => `Steel clatters in the gloom as the ${name} strikes without warning, engaging ${pName} in sudden combat!`,
            assaultBark: () => ChronicleGrounder.pickNonRepeatingBark('humanoid_assault', [
                'You will not leave these deeps alive!',
                'Draw steel, interloper! Your grave is ready!',
                'The darkness claims all who wander here!',
                'Bleed upon the stones, fool!',
                'Cold iron for warm flesh!'
            ], Math.floor(Math.random() * 1000))
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
    static resolveCreatureEncounter(monster, hero, recentMessages = [], interactionTurn = 1, userQuery = '', realmKey = null, langMode = 'en', options = {}) {
        if (!monster) return { prose: 'A shadow lingers in the gloom.', text: null, isDialogue: false, speaker: 'Creature', recommendedVoice: null };

        if (typeof realmKey === 'object' && realmKey !== null) {
            options = realmKey;
            realmKey = null;
        } else if (typeof langMode === 'object' && langMode !== null) {
            options = langMode;
            langMode = 'en';
        }
        options = (options && typeof options === 'object') ? options : {};
        const isDryRun = Boolean(options.dryRun);

        const rk = (realmKey || (typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function' ? window.__app.getActiveRealm() : 'angband')).toLowerCase();
        const effLang = ((rk === 'hengband') ? (langMode || (typeof window !== 'undefined' && window.__langMode ? window.__langMode : 'en')) : 'en').toLowerCase();
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

        const turn = interactionTurn || 1;
        const mKey = (monster.id !== undefined && monster.id !== null) ? String(monster.id) : (monster.name || 'creature');
        let encounterIdx = 0;
        if (!isDryRun) {
            encounterIdx = this.getNextEncounterIndex(mKey);
        } else {
            encounterIdx = this._encounterCounters.get(mKey) || 0;
        }
        const encounterSeed = (this.hashString(mKey + ':' + turn) + encounterIdx);

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
                    `The scarred veteran slumps in the shadow, ${prPoss} hand resting upon ${prPoss} blade.`,
                    `The weathered veteran leans against the timber wall, snoring beneath ${prPoss} woolen cloak.`,
                    `The grizzled soldier sleeps deeply, ${prPoss} calloused thumb hooked over ${prPoss} sword belt.`,
                    `Curled beside seasoned firewood, the veteran guards ${prPoss} rest even in dreams.`,
                    `Chin tucked against ${prPoss} mail collar, the veteran breathes in slow, rhythmic slumber.`,
                    `The frontier soldier dozes upright, ${prPoss} notched longsword balanced across ${prPoss} knees.`
                ];
                prose = vetSleepList[sSeed % vetSleepList.length];
            } else if (profile.category === 'townsperson') {
                if (name.toLowerCase().includes('merchant')) {
                    const merchSleepList = [
                        `The ${name} slumps against a stack of crates, ${prPoss} eyes shut in heavy slumber.`,
                        `Dozing behind a locked strongbox, the ${name} slumps with ${prPoss} chin on ${prPoss} collar.`,
                        `The ${name} slumps over a ledger of tallow and iron, fast asleep.`,
                        `Resting beside bound packs, the ${name} slumps in quiet, undisturbed sleep.`
                    ];
                    prose = merchSleepList[sSeed % merchSleepList.length];
                } else {
                    const townSleepList = [
                        `The ${name} slumps against the tavern wall in deep, rhythmic slumber.`,
                        `Wrapped in coarse wool, the ${name} slumbers deeply inside the quiet alcove.`,
                        `The ${name} rests head against hand in a shadowed doorway, fast asleep.`,
                        `Breathing softly, the ${name} sleeps off the day's labor beside the hearth.`,
                        `The ${name} dozes peacefully on a low timber bench, oblivious to footsteps.`
                    ];
                    prose = townSleepList[sSeed % townSleepList.length];
                }
            } else if (profile.category === 'beggar') {
                const beggarSleepList = [
                    `Curled on cold cobblestones, the ${name} shivers in sleep beside ${prPoss} wooden bowl.`,
                    `The ${name} sleeps fitfully in the alley corner, chin tucked into ragged wool.`,
                    `Huddled beneath threadbare sackcloth, the ${name} breathes in shallow, exhausted sleep.`,
                    `The ${name} slumps against damp masonry, dreaming of warm hearth-bread.`
                ];
                prose = beggarSleepList[sSeed % beggarSleepList.length];
            } else if (profile.category === 'rogue') {
                const rogueSleepList = [
                    `The ${name} slumps beside an ale barrel, one hand still gripping ${prPoss} dagger.`,
                    `Hood pulled low over ${prPoss} brow, the cutpurse dozes lightly in the shadow.`,
                    `The ${name} sleeps with boots braced to bolt, blade tucked under ${prPoss} cloak.`,
                    `Leaning in a dark doorway, the ${name} catches a thief's shallow nap.`
                ];
                prose = rogueSleepList[sSeed % rogueSleepList.length];
            } else if (!profile.isVocal) {
                prose = `The ${name} ${profile.sleepNoise}`;
            } else {
                prose = `The ${name} ${profile.sleepNoise} It slumbers deeply.`;
            }

            if (query) {
                prose += ` Your words fall upon deaf ears; ${prSub} stirs slightly without waking.`;
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
                    prose = ChronicleGrounder.pickNonRepeatingBark('canine_combat_prose', [
                        `Yellow fangs bared, the wounded ${name} lunges across the bloodstained stones.`,
                        `Hackles raised, the ${name} snaps viciously at your throat.`,
                        `Pacing low, the bloodied ${name} snarls and circles for your heels.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else if (profile.category === 'rodent') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('rodent_combat_prose', [
                        `The ${name} skitters frantically along the stone, snapping with rabid fury.`,
                        `Whiskers flecked with foam, the ${name} leaps and gnashes red incisors.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else if (profile.category === 'arachnid') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('arachnid_combat_prose', [
                        `Rearing on chitinous legs, the ${name} clicks venom-dripping mandibles.`,
                        `The ${name} hisses from the dark, venomous fangs poised to strike.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else if (profile.category === 'slime') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('slime_combat_prose', [
                        `The ${name} quivers violently, lashing caustic pseudopods toward your boots.`,
                        `Hissing with digestive acid, the ${name} surges across the flagstones.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else if (profile.category === 'skeleton') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('skeleton_combat_prose', [
                        `Splintered bone clatters as the ${name} advances with hollow menace.`,
                        `Dry joints clicking, the ${name} swings with tireless undead malice.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else {
                    prose = ChronicleGrounder.pickNonRepeatingBark('beast_combat_prose', [
                        `The ${name} recoils and thrashes wildly as dark ichor hits the stone.`,
                        `Wounded and cornered, the ${name} lashes out with feral savagery.`
                    ], encounterSeed, { dryRun: isDryRun });
                }
            } else {
                if (profile.category === 'canine') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('canine_ambient_prose', [
                        `The ${name} pads warily across the stone, black snout testing the air.`,
                        `Ears pricked forward, the ${name} watches your stride with hungry eyes.`,
                        `The ${name} paces the corridor shadow, a low rumble in its chest.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else if (profile.category === 'rodent') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('rodent_ambient_prose', [
                        `The ${name} scuttles along the damp wall, whiskers twitching in the gloom.`,
                        `Nosing through cold rubble, the ${name} freezes as your light nears.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else if (profile.category === 'arachnid') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('arachnid_ambient_prose', [
                        `The ${name} clings motionless to the stone, dark eyes glinting in torchlight.`,
                        `Poised upon a dusty web, the ${name} tracks the vibrations of your boots.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else if (profile.category === 'slime') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('slime_ambient_prose', [
                        `The ${name} undulates slowly, leaving an acidic sheen across the stone.`,
                        `A gelatinous mass quivers in the damp corner, dissolving stray bone.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else if (profile.category === 'skeleton') {
                    prose = ChronicleGrounder.pickNonRepeatingBark('skeleton_ambient_prose', [
                        `The skeletal sentry stands rigid, hollow sockets fixed upon the dark hall.`,
                        `Rusted mail hangs from bleached ribs as the ${name} guards the passage.`
                    ], encounterSeed, { dryRun: isDryRun });
                } else {
                    prose = ChronicleGrounder.pickNonRepeatingBark('beast_ambient_prose', [
                        `The ${name} watches your movements with predatory stillness.`,
                        `Shifting in the cold gloom, the ${name} tracks your torchlight.`
                    ], encounterSeed, { dryRun: isDryRun });
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
            const vSeed = Math.abs(interactionTurn + (monster.id || 0) * 7 + encounterIdx);

            if (profile.category === 'idiot' || name.toLowerCase().includes('idiot')) {
                prose = ChronicleGrounder.pickNonRepeatingBark('idiot_flee_prose', [
                    `The blubbering idiot scrambles backward in the dirt, shielding ${prPoss} head.`,
                    `Weeping in panic, the blubbering idiot cowers against the damp masonry.`,
                    `Tears streaking ${prPoss} face, the blubbering idiot scuttles away in terror.`,
                    `The blubbering idiot curls on the cobblestones, whimpering with hands over ${prPoss} ears.`
                ], vSeed, { dryRun: isDryRun });
                text = ChronicleGrounder.pickNonRepeatingBark('idiot_flee_bark', [
                    'Waaaah! Hurts! Leave poor me alone!',
                    'No hit! Poor Gaffer only got pretty stones!',
                    'Town watch, save me! The stranger is beating poor me!',
                    'Please don\'t hit! Take my shiny beetle, just stop!',
                    'Ow, ow! Bad traveler! Gaffer wants his mommy!'
                ], vSeed, { dryRun: isDryRun });
            } else if (profile.category === 'townsperson') {
                prose = ChronicleGrounder.pickNonRepeatingBark('town_flee_prose', [
                    `Clutching a wound, the ${name} stumbles back and shrieks for the Watch!`,
                    `Terror-stricken, the ${name} bolts toward the alley shadows!`,
                    `Hands raised in panic, the bleeding ${name} backs away across the stones!`
                ], vSeed, { dryRun: isDryRun });
                text = ChronicleGrounder.pickNonRepeatingBark('town_flee_bark', [
                    'Madman! Murder in the streets! Town guards, help!',
                    'Mercy! Take my purse, only spare my life!',
                    'Town Watch! Murder! Stop this mad butcher!',
                    'Spare me! I am unarmed—call the guards!'
                ], vSeed, { dryRun: isDryRun });
            } else if (profile.category === 'beggar') {
                prose = `Dropping ${prPoss} tin bowl, the ${name} cowers against the wall in tears.`;
                text = ChronicleGrounder.pickNonRepeatingBark('beggar_flee', [
                    'Mercy! I have only rags—spare a poor beggar!',
                    'Why strike a starving wretch?! Have pity!',
                    'Guards! Mercy! Do not slay an unarmed beggar!',
                    'Take my bowl, take my crust—only spare my life!',
                    'Pity, traveler! My blood is worth nothing!'
                ], vSeed, { dryRun: isDryRun });
            } else if (profile.category === 'orc') {
                prose = `Spitting black blood, the terrified ${name} scrambles for the dark tunnels.`;
                text = ChronicleGrounder.pickNonRepeatingBark('orc_flee', [
                    'Mercy! The iron devil! Run for the pits!',
                    'The blade burns! Back into the dark, whelps!',
                    'Gaaah! Back to the warrens!',
                    'Too strong! Scatter into the tunnels!',
                    'Sound the retreat! This one fights like a demon!',
                    'Drop the loot and run! Save your hides!'
                ], vSeed, { dryRun: isDryRun });
            } else {
                prose = `Reeling from ${pName}'s assault, the ${name} scrambles backward into the gloom.`;
                text = ChronicleGrounder.pickNonRepeatingBark('general_flee', [
                    'Curse your steel! Stay back!',
                    'Back, fiend! The dark will swallow you yet!',
                    'I yield the hall! Let me pass!',
                    'No more! The wounds run too deep!',
                    'Quarter! Hold your hand!'
                ], vSeed, { dryRun: isDryRun });
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
                prose = `The blubbering idiot cowers in the dirt, waving trembling hands against ${pName}'s blows.`;
                text = (hpPercent <= 0.35)
                    ? ChronicleGrounder.pickNonRepeatingBark('idiot_combat_low', [
                        'Mommy! Mercy! Leave poor Gaffer alone!',
                        'Hurts! Red juice coming out—stop hitting me!',
                        'Waaah! Gaffer just wants to go home!',
                        'Don\'t kill poor me! I didn\'t take nothing!'
                    ], encounterSeed, { dryRun: isDryRun })
                    : ChronicleGrounder.pickNonRepeatingBark('idiot_combat_high', [
                        'Waaaah! Why you hit poor me?! Stop it!',
                        'Ow, ow! Mean stranger with the sharp stick!',
                        'No hit! I got no pennies—go hit the rocks!',
                        'Help! The mean traveler is hitting Gaffer!'
                    ], encounterSeed, { dryRun: isDryRun });
            } else if (profile.category === 'beggar' || stateObj.state === 'cowering_beggar') {
                prose = `The ${name} clutches threadbare rags against the damp stones, weeping for mercy.`;
                text = (hpPercent <= 0.35)
                    ? ChronicleGrounder.pickNonRepeatingBark('beggar_combat_low', [
                        'Mercy! I have only rags—spare an unarmed beggar!',
                        'I bleed out on cold stone... have you no pity?',
                        'Spare me! I will leave town forever!',
                        'No more, I beg you! My ribs are broken!'
                    ], encounterSeed, { dryRun: isDryRun })
                    : ChronicleGrounder.pickNonRepeatingBark('beggar_combat_high', [
                        'Why strike an unarmed wretch?! Guards, murder!',
                        'Please! Take my bowl, only spare my life!',
                        'Cold steel on a starving soul?! Have mercy!',
                        'Help! Watchmen! A lunatic slaughters the poor!'
                    ], encounterSeed, { dryRun: isDryRun });
            } else if (profile.category === 'veteran' || stateObj.state === 'veteran_in_combat') {
                prose = `Sparks fly as the scarred ${name} parries and drops into a lethal crouch.`;
                text = (hpPercent <= 0.35)
                    ? ChronicleGrounder.pickNonRepeatingBark('veteran_combat_low', [
                        `Curse your blade! A soldier dies with ${prPoss} boots on!`,
                        `You drew blood, but my steel still bites!`,
                        `The frontier tested me harder than this! Come on!`,
                        `Bone breaks, but a veteran never yields!`,
                        `A red day, then! Step in and finish it!`,
                        `Still standing, whelp! Guard your throat!`
                    ], encounterSeed, { dryRun: isDryRun })
                    : ChronicleGrounder.pickNonRepeatingBark('veteran_combat_high', [
                        'Want a taste of veteran steel, fool?! Stand fast!',
                        'I broke fiercer blades than yours in the trenches!',
                        'Your footwork is sloppy! Yield or fall!',
                        'Iron and blood! You crossed the wrong soldier!',
                        'Let us test the temper of your mail!',
                        'A veteran never flinches! Back to the dirt!',
                        'Mind your left flank, rookie—too slow!',
                        'Five winters on the border taught me this thrust!'
                    ], encounterSeed, { dryRun: isDryRun });
            } else if (profile.category === 'townsperson') {
                prose = `Reeling from the blow, the ${name} clutches a wound and shouts for the Watch.`;
                text = (hpPercent <= 0.35)
                    ? ChronicleGrounder.pickNonRepeatingBark('town_combat_low', [
                        'Mercy! I yield! Take my purse, only spare my life!',
                        'Town Watch! Murder! Stop this butcher before I bleed dry!',
                        'Mercy! Put away the steel—take everything I have!',
                        'Murder in the square! Somebody call the Watch!'
                    ], encounterSeed, { dryRun: isDryRun })
                    : ChronicleGrounder.pickNonRepeatingBark('town_combat_high', [
                        'Madman! Murder in the streets! Town guards, help!',
                        'Madman! Keep back, butcher! Guards!',
                        'Murder! The Town Watch will hang you for this!',
                        'Mercy! Why draw steel on an honest citizen?!'
                    ], encounterSeed, { dryRun: isDryRun });
            } else if (profile.category === 'rogue') {
                prose = `Blades shriek as the ${name} parries and circles you through the alley gloom.`;
                text = (hpPercent <= 0.35)
                    ? ChronicleGrounder.pickNonRepeatingBark('rogue_combat_low', [
                        'Curse your steel! I will drag you to the barrows with me!',
                        'Bleeding... but I can still slip steel between your ribs!',
                        'You won\'t take my boots while I draw breath!',
                        'A pox on your blade! The shadows aren\'t done with you!',
                        'Cold steel bites both ways, dog!',
                        'Backed into a corner? That\'s when a cutthroat bites hardest!'
                    ], encounterSeed, { dryRun: isDryRun })
                    : ChronicleGrounder.pickNonRepeatingBark('rogue_combat_high', [
                        'Think your steel scares me? I\'ll carve your purse free!',
                        'I\'ll pick your bones clean before the Watch arrives!',
                        'Quick hands, cold steel! Let\'s see what you bleed!',
                        'Should have dropped your silver while you had the chance!',
                        'One slip on the cobbles and you\'re crow meat!',
                        'Step into the shadow—my dagger knows the way!',
                        'Too slow with that heavy guard, traveler!'
                    ], encounterSeed, { dryRun: isDryRun });
            } else if (profile.category === 'orc') {
                prose = `Black blood spatters the stone as the ${name} hacks savagely at your guard.`;
                if (rk === 'silq') {
                    text = (hpPercent <= 0.35)
                        ? ChronicleGrounder.pickNonRepeatingBark('orc_silq_low', [
                            'By the Iron Crown, Morgoth Bauglir shall break your bones upon Thangorodrim!',
                            'Black blood in my eyes... Boldog\'s wrath claims you in Angband!',
                            'Morgoth\'s shadow covers Beleriand—die in the Iron Hell!',
                            'You bleed on the stones of Angband! Bauglir sees all!',
                            'Thangorodrim\'s fires will turn your mail to slag!'
                        ], encounterSeed, { dryRun: isDryRun })
                        : ChronicleGrounder.pickNonRepeatingBark('orc_silq_high', [
                            'Thralls of Angband, slay the intruder!',
                            'Morgoth Bauglir holds the Iron Crown—none escape his dark!',
                            'Die beneath the shadow of Thangorodrim!',
                            'Curse your elven steel! Flesh for the pits of Angband!',
                            'Your skull shall pave the gates of Morgoth!',
                            'For the Iron Crown! Tear the trespasser down!'
                        ], encounterSeed, { dryRun: isDryRun });
                } else if (rk === 'frogcomposband') {
                    text = (hpPercent <= 0.35)
                        ? ChronicleGrounder.pickNonRepeatingBark('orc_fcb_low', [
                            'The Pattern will not save you, shadow-walker!',
                            'Curse your blade! Blood for the Courts of Chaos!',
                            'Chaos will devour your shadow across the multiverse!',
                            'No Trump card can pull you from this abyss!',
                            'Even Amber falls before the tide of Chaos!'
                        ], encounterSeed, { dryRun: isDryRun })
                        : ChronicleGrounder.pickNonRepeatingBark('orc_fcb_high', [
                            'The multiverse belongs to Chaos! Die, Amber dog!',
                            'No Trump can rescue you from this wilderness!',
                            'Your shadow ends in this chaotic gutter!',
                            'Feel the raw fury of the wilderness!',
                            'Neither Pattern nor Trump will spare your throat!',
                            'We butcher shadow-walkers and knights alike!'
                        ], encounterSeed, { dryRun: isDryRun });
                } else if (rk === 'hengband') {
                    if (effLang === 'jp') {
                        text = (hpPercent <= 0.35)
                            ? ChronicleGrounder.pickNonRepeatingBark('orc_heng_low_jp', [
                                '韋駄天走り！貴様の心臓、まだ我が刃が欲している！',
                                '妖刀村正にかけて、この血泥の中で相討ちだ！',
                                '武士に死など恐れにあらず！もののふの魂は永遠なのだ！',
                                '鎧は貫かれたが、戦国の怨霊が貴様を討つであろう！'
                            ], encounterSeed, { dryRun: isDryRun })
                            : ChronicleGrounder.pickNonRepeatingBark('orc_heng_high_jp', [
                                '一本！戦国の大名たちの怒りを受けるがよい！',
                                '神楽の社もお前への祈りは捧げぬ！',
                                '鬼と天狗が侵入者の肉を喰らうのだ！',
                                '鋼の刃の味を知るがよい！',
                                '散りゆく桜花と共に、最後の息を吸うがよい！'
                            ], encounterSeed, { dryRun: isDryRun });
                    } else {
                        text = (hpPercent <= 0.35)
                            ? ChronicleGrounder.pickNonRepeatingBark('orc_heng_low_en', [
                                'Cold steel in the blood mud—we die together!',
                                'No warrior flinches before death! My blade still strikes!',
                                'My armor breaks, but the mountain spirits will avenge me!',
                                'Oni fury burns to the last drop of blood!',
                                'My blade still thirsts for your heart!'
                            ], encounterSeed, { dryRun: isDryRun })
                            : ChronicleGrounder.pickNonRepeatingBark('orc_heng_high_en', [
                                'Face the fury of the mountain lords and cold steel!',
                                'The shrine bells toll no mercy for your blade!',
                                'Oni and dark spirits feast upon intruders!',
                                'Taste the edge of ruthless steel!',
                                'Beneath the falling blossoms, draw your last breath!',
                                'No wandering warrior survives these demon halls!'
                            ], encounterSeed, { dryRun: isDryRun });
                    }
                } else {
                    text = (hpPercent <= 0.35)
                        ? ChronicleGrounder.pickNonRepeatingBark('orc_combat_low', [
                            'Curse your blade! The Deep Eye will shred your soul!',
                            'Black blood in my eyes... my scimitar still bites!',
                            'The whip was worse than your steel! Die, surface scum!',
                            'You bleed too, dog! We die together on cold rock!',
                            'Choke on my blood, pink-skin!',
                            'The warren pack will gnaw your bones for this!'
                        ], encounterSeed, { dryRun: isDryRun })
                        : ChronicleGrounder.pickNonRepeatingBark('orc_combat_high', [
                            'Fresh meat bleeds! Hack the surface scum down!',
                            'I\'ll crack your ribs and drink the marrow, worm!',
                            'Feed the intruder to the cave drakes! Slay!',
                            'Chop the legs! Make the pink-skin crawl!',
                            'Iron and ash! Your skull goes on the warren spike!',
                            'Snaga and Uruk—gut the surface rat!',
                            'Notched steel cuts deepest! Bleed for the pits!'
                        ], encounterSeed, { dryRun: isDryRun });
                }
            } else if (profile.category === 'spellcaster') {
                prose = `Arcane fire crackles across the ${name}'s robes as ${prSub} hisses a counter-hex.`;
                if (rk === 'silq') {
                    text = (hpPercent <= 0.35)
                        ? ChronicleGrounder.pickNonRepeatingBark('caster_silq_low', [
                            'The Iron Hell never yields! Morgoth\'s shadow covers Beleriand!',
                            'My song falters... yet Angband claims your doom!',
                            'Even in death, the frost of Thangorodrim withers you!'
                        ], encounterSeed, { dryRun: isDryRun })
                        : ChronicleGrounder.pickNonRepeatingBark('caster_silq_high', [
                            'Tremble before the dark will of the Iron Crown!',
                            'No song of Elbereth kindles light in Angband!',
                            'Wither in the black flame of Thangorodrim!',
                            'Morgoth Bauglir crushes mortal clay!'
                        ], encounterSeed, { dryRun: isDryRun });
                } else if (rk === 'frogcomposband') {
                    text = (hpPercent <= 0.35)
                        ? ChronicleGrounder.pickNonRepeatingBark('caster_fcb_low', [
                            'My form unravels into shadow... Chaos claims you!',
                            'The Trump of Doom is already drawn for you!',
                            'Chaos dissolves all Pattern boundaries!'
                        ], encounterSeed, { dryRun: isDryRun })
                        : ChronicleGrounder.pickNonRepeatingBark('caster_fcb_high', [
                            'I twist the Pattern\'s probabilities against you!',
                            'Burn in the raw chaos of the multiverse!',
                            'Shadow warps at my command—witness true sorcery!',
                            'Your Amber blood is a flickering shadow!'
                        ], encounterSeed, { dryRun: isDryRun });
                } else if (rk === 'hengband') {
                    if (effLang === 'jp') {
                        text = (hpPercent <= 0.35)
                            ? ChronicleGrounder.pickNonRepeatingBark('caster_heng_low_jp', [
                                '九字切り……我が魂は神仏の元へ昇る！',
                                '輪廻応報の輪が、来世で貴様を押し潰すであろう！',
                                '妖狐の呪いが貴様の影にまとわりつくのだ！'
                            ], encounterSeed, { dryRun: isDryRun })
                            : ChronicleGrounder.pickNonRepeatingBark('caster_heng_high_jp', [
                                '臨・兵・闘・者・皆・陣・烈・在・前！侵入者を調伏せよ！',
                                '比叡の魔炎よ、この愚か者を灰燼に帰せ！',
                                '羯諦羯諦波羅羯諦波羅僧羯諦……業火の消滅を味わうがよい！',
                                '神祇諸仏が貴様の穢れた存在を拒絶する！'
                            ], encounterSeed, { dryRun: isDryRun });
                    } else {
                        text = (hpPercent <= 0.35)
                            ? ChronicleGrounder.pickNonRepeatingBark('caster_heng_low_en', [
                                'Nine secret seals... my spirit ascends beyond your blade!',
                                'The wheel of karmic doom will crush your next life!',
                                'The fox spirit\'s curse clings to your steel!'
                            ], encounterSeed, { dryRun: isDryRun })
                            : ChronicleGrounder.pickNonRepeatingBark('caster_heng_high_en', [
                                'Spirits of mountain and shrine, banish this blade!',
                                'Mystic fire, reduce this intruder to cinders!',
                                'Taste karmic annihilation before the ancient spirits!',
                                'Oni and shrine guardians reject your presence!'
                            ], encounterSeed, { dryRun: isDryRun });
                    }
                } else {
                    text = (hpPercent <= 0.35)
                        ? ChronicleGrounder.pickNonRepeatingBark('caster_combat_low', [
                            'The Dark Masters will avenge my blood!',
                            'My flesh fails... but the Nether claims your soul!',
                            'Even in death, my dark runes wither your heart!',
                            'Blood feeds the hex—choke on the void!'
                        ], encounterSeed, { dryRun: isDryRun })
                        : ChronicleGrounder.pickNonRepeatingBark('caster_combat_high', [
                            'Feel the freezing grip of the Void!',
                            'Mortal clay, dissolve before the black flame!',
                            'Cold iron cannot turn the ancient arts!',
                            'The deeps hunger—wither into ash!',
                            'One syllable of unmaking will shatter your bones!'
                        ], encounterSeed, { dryRun: isDryRun });
                }
            } else {
                prose = `Blades clash in the dark as the ${name} trades fierce blows with ${pName}.`;
                text = (hpPercent <= 0.35)
                    ? ChronicleGrounder.pickNonRepeatingBark('general_combat_low', [
                        'Curse your steel! You won\'t leave these deeps alive!',
                        'Bleeding on the stone... I\'ll drag you down with me!',
                        'No mercy in the dark—fall with me!',
                        'A mortal blow? Then let us trade graves!'
                    ], encounterSeed, { dryRun: isDryRun })
                    : ChronicleGrounder.pickNonRepeatingBark('general_combat_high', [
                        'Die on the cold stone, mortal!',
                        'Pave these dark halls with your bones!',
                        'Steel answers steel—show your mettle!',
                        'No light reaches here—only cold blades!',
                        'Step closer and taste the dark!'
                    ], encounterSeed, { dryRun: isDryRun });
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
            const vSeed = Math.abs(interactionTurn + (monster.id || 0) * 11 + encounterIdx);
            prose = ChronicleGrounder.pickNonRepeatingBark('idiot_ambient_prose', [
                `The blubbering idiot sits in the dirt, turning a smooth pebble in grimy hands.`,
                `Wide-eyed, the blubbering idiot points at a stray dog with a bubbly giggle.`,
                `The blubbering idiot scratches ${prPoss} ear, humming a crooked tune.`,
                `Grinning crookedly, the blubbering idiot wipes drool from ${prPoss} chin.`,
                `The blubbering idiot stacks three mud pebbles like a tiny tower.`,
                `Squinting at your boots, the blubbering idiot rocks happily on ${prPoss} heels.`
            ], vSeed, { dryRun: isDryRun });
            text = ChronicleGrounder.pickNonRepeatingBark('idiot_ambient_bark', [
                'Hehe! Pretty shiny rock stays cool in your mouth!',
                'Mind the squishy bugs, traveler—they got tiny boots too!',
                'Shiny brass buttons! Can Gaffer tap just one? Hehe!',
                'Cold cobbles, no porridge today... but I found a snail!',
                'Going down the dark hole? The rats down there got red teeth!',
                'Gaffer saw a ghost in the well once—it was only a bucket!',
                'Do clouds taste like sheep wool, or salted turnips?',
                'Don\'t tell the Watch, I hid a copper penny in my boot!'
            ], vSeed, { dryRun: isDryRun });
        } else if (stateObj.state === 'begging' || profile.category === 'beggar') {
            if (query.includes('dungeon') || query.includes('stair') || query.includes('down') || query.includes('deep')) {
                prose = `The ${name} points a trembling finger toward the iron stair archway.`;
                text = 'The cellar stairs lie ahead—I smelled sulfur and charred bone rising through the grate.';
            } else if (query.includes('shop') || query.includes('store') || query.includes('bread') || query.includes('food') || query.includes('ration') || query.includes('potion')) {
                prose = `${prCap} gazes toward the market square with hollow eyes.`;
                text = 'The General Store sells rations and oil; one copper buys me a stale crust.';
            } else if (query.includes('gold') || query.includes('coin') || query.includes('silver') || query.includes('money')) {
                prose = `${prCap} clutches ${prPoss} wooden begging bowl with sudden hope.`;
                text = 'Bless your generous hand! May the High Powers guard you in the deep!';
            } else if (query.includes('who') || query.includes('help') || query.includes('key')) {
                prose = `${prCap} leans close, whispering in a dry rasp.`;
                text = 'Bump closed doors to open them, press "q" to quaff potions, and watch the dark alleys.';
            } else {
                const bSeed = Math.abs(interactionTurn + (monster.id || 0) * 17 + encounterIdx);
                prose = ChronicleGrounder.pickNonRepeatingBark('beggar_ambient_prose', [
                    `The ${name} hobbles forward, extending a cupped, trembling hand.`,
                    `${prCap} shivers beneath threadbare rags, glancing nervously down the lane.`,
                    `${prCap} taps a dented tin bowl, hollow eyes fixed on your coinpurse.`,
                    `Huddled against the wind, the ${name} murmurs a quiet street warning.`,
                    `${prCap} pulls a torn wool shawl tighter against the mountain chill.`,
                    `Leaning on a knotted stick, the ${name} bows ${prPoss} head respectfully.`
                ], bSeed, { dryRun: isDryRun });
                text = ChronicleGrounder.pickNonRepeatingBark('beggar_ambient_bark', [
                    'Alms, traveler? One copper bit for a crust of baker\'s bread.',
                    'Watch the dark lanes by the tavern—cutpurses prowl where the Watch won\'t look.',
                    'The deep cellars below hunger for more than bread, friend.',
                    'May the Lords of Light guide your lantern in the dark.',
                    'Spare a copper? The frost bites hard on empty ribs tonight.',
                    'Many proud swords go down those iron steps; few climb back up.',
                    'Keep a Phase Door scroll handy—the upper vaults are full of traps.',
                    'Even a dry rind or a drop of lantern oil is a blessing here.'
                ], bSeed, { dryRun: isDryRun });
            }
        } else if (stateObj.state === 'insulting') {
            prose = `The ${name} spits on the flagstones, sizing ${pName} up with a sneer.`;
            text = ChronicleGrounder.pickNonRepeatingBark('insult_ambient_bark', [
                'Think that blade makes you a hero, soft-skin? The rats below will pick your bones!',
                'Move along, runt! Your armor looks like hammered tin!',
                'Another fresh fool for the deeps—leave your boots at the stairs!',
                'Save your swagger for the tavern, greenhorn!'
            ], encounterSeed, { dryRun: isDryRun });
        } else if (profile.category === 'veteran') {
            if (query.includes('dungeon') || query.includes('tactic') || query.includes('fight') || query.includes('combat')) {
                prose = `The scarred ${name} rests a hand on ${prPoss} pommel with grim authority.`;
                text = 'Never fight in open halls—back into a narrow corridor and carry Phase Door scrolls.';
            } else {
                const vSeed = Math.abs(interactionTurn + (monster.id || 0) * 19 + (monster.x || 0) * 11 + encounterIdx);
                prose = ChronicleGrounder.pickNonRepeatingBark('vet_ambient_prose', [
                    `The ${name} leans against a timber post, appraising ${pName}'s stance.`,
                    `${prCap} taps ${prPoss} notched hilt with a scarred thumb.`,
                    `${prCap} nods curtly, weathered leather creaking as ${prSub} shifts weight.`,
                    `The ${name} draws a whetstone along a steel blade with practiced rhythm.`,
                    `${prCap} tightens a mail buckle, eyes scanning the frontier fog.`,
                    `Resting a boot on a crate, the ${name} studies your weapon balance.`,
                    `${prCap} rolls a silver coin across scarred knuckles without looking down.`,
                    `The grizzled soldier checks the fletching on a bundle of heavy bolts.`
                ], vSeed, { dryRun: isDryRun });
                text = ChronicleGrounder.pickNonRepeatingBark('vet_ambient_bark', [
                    'Delving today? Keep your shield high and check every corridor twice.',
                    'Cave orcs and kobold snipers swarm the upper halls—pack cure potions.',
                    'Don\'t get greedy down there; turn back before your torch burns low.',
                    'Lure archers around solid corners—never charge down a long hall.',
                    'Pack spare oil flasks; the dark eats your nerve when the lantern dies.',
                    'Let the pack rush your doorway one by one, then cleave them down.',
                    'Identify your scrolls before you need them in a life-or-death pinch.',
                    'Acid hounds will ruin good mail—strike them from range if you can.',
                    'Never fight paralyzed; one ghoul touch in the dark ends a saga fast.',
                    'A cheap cloak and a scroll of Word of Recall beat a heavy shroud.'
                ], vSeed, { dryRun: isDryRun });
            }
        } else if (profile.category === 'townsperson') {
            if (query.includes('dungeon') || query.includes('stair') || query.includes('down') || query.includes('depth') || query.includes('deep')) {
                prose = `The ${name} points toward the dark stone archway leading to the iron stairs.`;
                text = 'The dungeon stairs lie ahead—mind the cave spiders and cutpurses on the first level.';
            } else if (query.includes('shop') || query.includes('store') || query.includes('buy') || query.includes('sell') || query.includes('potion') || query.includes('food') || query.includes('scroll')) {
                prose = `${prCap} nods toward the timber storefronts lining the square.`;
                text = 'The General Store stocks rations and oil; the Alchemist sells healing draughts.';
            } else if (query.includes('weapon') || query.includes('armor') || query.includes('sword') || query.includes('shield') || query.includes('bow')) {
                prose = `${prCap} inspects your gear with an approving nod.`;
                text = 'Good forged steel keeps your ribs whole—don\'t descend without stout mail.';
            } else if (query.includes('who') || query.includes('help') || query.includes('key') || query.includes('how')) {
                prose = `The ${name} leans in with a helpful nod.`;
                text = 'Bump closed doors to open them; press "q" to quaff a potion or "r" to read a scroll.';
            } else {
                const tSeed = Math.abs(interactionTurn + (monster.id || 0) * 23 + encounterIdx);
                prose = ChronicleGrounder.pickNonRepeatingBark('town_ambient_prose', [
                    `The ${name} brushes dust from ${prPoss} sleeves and eyes ${pName}'s gear.`,
                    `${prCap} leans by a stack of crates, glancing toward the northern gate.`,
                    `${prCap} tightens the straps on a travel pack, pausing to nod.`,
                    `${prCap} wraps a woolen cloak tighter against the mountain draft.`,
                    `The ${name} offers a polite nod along the cobblestone lane.`,
                    `${prCap} glances toward the tavern door with a weary smile.`,
                    `Warming hands over a brazier, the ${name} watches the square.`,
                    `${prCap} balances a crate of lantern oil upon ${prPoss} hip.`
                ], tSeed, { dryRun: isDryRun });
                text = ChronicleGrounder.pickNonRepeatingBark('town_ambient_bark', [
                    'Hail, traveler. Stocking up, or bound for the deep stairs?',
                    'Goblins crept into the upper cellars last night—carry torches and Phase Door scrolls.',
                    'Visit the Armory before you descend; silver buys no bandages below.',
                    'The mountain wind bites cold today—keep your lantern flask full of oil.',
                    'Mind your purse near the alleys; cutpurses prowl when the Watch turns.',
                    'A warm fire and bitter ale wait in the tavern if you make it back.',
                    'Always carry a scroll of Word of Recall once you pass five hundred feet.',
                    'The Temple blesses worn blades and cures black poison for a fair tithe.',
                    'Strange tremors shook the well-stones at dawn; something stirs below.',
                    'Travel light enough to run—heavy gold has drowned many a greedy delver.'
                ], tSeed, { dryRun: isDryRun });
            }
        } else if (profile.category === 'rogue') {
            if (query) {
                prose = `The ${name} flips a notched dagger between ${prPoss} fingers with a cold sneer.`;
                text = 'Save your breath, stranger—silver buys passage here, not questions!';
            } else {
                if (interactionTurn <= 1) {
                    let raceFlavor = '';
                    if (pRace.includes('elf')) raceFlavor = 'Elven silver spends just fine. ';
                    else if (pRace.includes('dwarf')) raceFlavor = 'Heavy pockets, dwarf. ';
                    prose = `A ${name} steps from the alley shadow, tossing a notched dagger hand-to-hand.`;
                    text = raceFlavor + 'Looking for trouble, stranger? Your purse, now—before things get messy.';
                } else if (interactionTurn === 2) {
                    prose = `${prCap} blocks your path, leveling the blade at your throat with a smirk.`;
                    text = 'Cough up thirty gold coins, or I\'ll check your boots once you\'re cold on the stones.';
                } else {
                    prose = `${prCap} narrows ${prPoss} eyes, thumb testing the dagger's point.`;
                    text = ChronicleGrounder.pickNonRepeatingBark('rogue_ambient_turn3', [
                        'Enough stalling—your purse or your life, right now!',
                        'Last chance, traveler: drop the coinpurse or bleed on the cobbles!',
                        'My blade is thirsty and the Watch is far away—pay up!',
                        'Talk is done. Hand over the silver or draw your steel!'
                    ], encounterSeed, { dryRun: isDryRun });
                }
            }
        } else if (profile.category === 'orc') {
            if (rk === 'silq') {
                prose = `The ${name} hefts a notched scimitar beneath the dark smoke of Thangorodrim.`;
                text = ChronicleGrounder.pickNonRepeatingBark('orc_ambient_silq', [
                    'Thralls of Morgoth, seize the trespasser at the gate!',
                    'You dare enter Angband unchained? Bauglir will break you!',
                    'The Iron Crown holds all! Flesh for Thangorodrim!',
                    'An unbranded spy! Morgoth\'s pits await your bones!',
                    'No light of Valinor reaches the vaults of Angband!',
                    'By the Iron Crown, strip the intruder\'s mail!'
                ], encounterSeed, { dryRun: isDryRun });
            } else if (rk === 'frogcomposband') {
                prose = `The ${name} snarls with chaotic frenzy, stalking across the shadow dust.`;
                text = ChronicleGrounder.pickNonRepeatingBark('orc_ambient_fcb', [
                    'Strayed off the Pattern road? Hack the shadow-walker down!',
                    'The Courts of Chaos hunger! Blood for the abyss!',
                    'No Trump card will save you in this wilderness!',
                    'Fresh meat from the Amber Outpost—strip those boots!',
                    'Across the multiverse, only Chaos endures!',
                    'Your shadow stops right here in the dust!'
                ], encounterSeed, { dryRun: isDryRun });
            } else if (rk === 'hengband') {
                prose = `The ${name} glares through an iron war-mask, gripping a curved glaive.`;
                if (effLang === 'jp') {
                    text = ChronicleGrounder.pickNonRepeatingBark('orc_ambient_heng_jp', [
                        '異境の侵入者め！戦国諸将の領地に土足で踏み入るとは！',
                        '神楽の神鈴が貴様の終焉を告げている！冷刃の錆となれ！',
                        'この身に流れる鬼の血がたぎる！刀を抜け、犬死にするでない！',
                        'この山を生きて越えた浪人も足軽もおらぬわ！'
                    ], encounterSeed, { dryRun: isDryRun });
                } else {
                    text = ChronicleGrounder.pickNonRepeatingBark('orc_ambient_heng_en', [
                        'Intruder! You trespass upon the mountain lords\' domain!',
                        'The shrine bells toll your doom—taste cold steel!',
                        'Oni blood boils in my veins—draw your blade!',
                        'No wandering ronin leaves this dark mountain alive!',
                        'Yokai and iron await you in these halls!',
                        'Test your steel against the fury of theoni clans!'
                    ], encounterSeed, { dryRun: isDryRun });
                }
            } else {
                prose = `The ${name} hefts a jagged scimitar, yellow fangs bared in a sneer.`;
                text = ChronicleGrounder.pickNonRepeatingBark('orc_ambient', [
                    'Fresh meat walking straight into our jaws! Slay the surface scum!',
                    'Your skull will make a fine mug for the captain\'s ale!',
                    'Smells of fear and town bread—get the soft-skin!',
                    'No one leaves the warrens alive! Hack the stranger down!',
                    'Drop your steel and crawl, worm—the pits are hungry!',
                    'Look boys, shiny mail and fat boots for the taking!',
                    'The Deep Eye watches—spill the trespasser\'s blood!',
                    'Back to the sun-world in pieces, pink-skin!'
                ], encounterSeed, { dryRun: isDryRun });
            }
        } else if (profile.category === 'dragon') {
            prose = `Golden eyes smoldering, the wyrm exhales a lazy curl of sulfurous smoke.`;
            text = ChronicleGrounder.pickNonRepeatingBark('dragon_ambient', [
                'Who disturbs my slumber? Kneel before I turn your bones to ash!',
                'You bring a frail spark before mountain fire? Burn, mortal!',
                'Generations of heroes melted beneath my breath; you are next.',
                'This hoard was bought in blood—yours will gild the scales.',
                'Flee while your lungs still hold unburned air, little thief.',
                'Your enchanted steel is mere kindling to an ancient wyrm.'
            ], encounterSeed, { dryRun: isDryRun });
        } else if (profile.category === 'high_undead') {
            prose = `Frost rims the stone as the ${name} drifts closer on windless robes.`;
            text = ChronicleGrounder.pickNonRepeatingBark('undead_ambient', [
                '...surrender your fleeting warmth to the cold grave...',
                '...the living hold no dominion in these silent halls...',
                '...flesh withers and steel rusts; only the crypt endures...',
                '...yield your breath to the dust and sleep forever...',
                '...your heartbeat echoes too loudly in our quiet dark...',
                '...centuries pass like dust; lay down your heavy blade...'
            ], encounterSeed, { dryRun: isDryRun });
        } else {
            prose = `The ${name} stands poised in the gloom, watching your every step.`;
            text = ChronicleGrounder.pickNonRepeatingBark('general_ambient', [
                'Turn back now, or pave these dark stones with your bones.',
                'One step closer and cold steel decides our fate.',
                'The shadows watch you, stranger—guard your flank.',
                'Draw no blade in this hall unless you mean to blood it.',
                'Many enter these vaults; few ever see the sun again.',
                'Walk softly, mortal—deeper horrors wake below.'
            ], encounterSeed, { dryRun: isDryRun });
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
    static answerSurvivalQuery(query = '', player = null, realmKey = null) {
        return this.answerGuideQuery(query, player, realmKey);
    }

    /**
     * The 4th-Wall Aware Guide Engine: Answers gameplay and menu questions
     * with authentic, diegetic reverent wit grounded in specific realm lore and mechanics.
     */
    static answerGuideQuery(query = '', player = null, realmKey = null) {
        const q = (query || '').toLowerCase().trim();
        const rk = (realmKey || (typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function' ? window.__app.getActiveRealm() : 'angband')).toLowerCase();
        const isJpHeng = (rk === 'hengband' && typeof window !== 'undefined' && window.__langMode === 'jp');
        const heroClass = (player && player.class) ? player.class.toLowerCase() : 'warrior';
        const pName = (player && player.name) ? player.name : (isJpHeng ? '武芸者' : 'Hero');
        const pRace = (player && player.race) ? player.race.toLowerCase() : 'mortal';

        if (isJpHeng) {
            if (q.includes('potion') || q.includes('quaff') || q.includes('heal') || q.includes('drink') || q.includes('cure') || q.includes('薬') || q.includes('回復')) {
                return `薬を服するには『q』キーを押すがよい。深手を負ってからでは遅い——城下町の錬金術店（5）にて致命傷の治癒の薬を常に蓄えよ。`;
            }
            if (q.includes('rest') || q.includes('sleep') || q.includes('recover') || q.includes('mana') || q.includes('休') || q.includes('眠')) {
                return `広間で無防備に眠るは愚の骨頂なり。袋小路へ退き、扉を閉ざし（c）、『R』から『*』を押して体力と魔力が満ちるまで静養せよ。`;
            }
            if (q.includes('spell') || q.includes('magic') || q.includes('cast') || q.includes('pray') || q.includes('book') || q.includes('魔法') || q.includes('術')) {
                return `変愚蛮怒の術法は多彩なり。『m』キーにて魔法書・仙術書・忍術を紐解き、己の流派の技を放て。`;
            }
            if (q.includes('shop') || q.includes('store') || q.includes('town') || q.includes('buy') || q.includes('sell') || q.includes('店') || q.includes('町')) {
                return `城下町には雑貨屋（1）、防具屋（2）、武器屋（3）、寺院（4）、錬金術店（5）、魔法店（6）、ブラックマーケット（7）、我が家（8）が並ぶ。扉を踏んで入店せよ。`;
            }
            if (q.includes('escape') || q.includes('run') || q.includes('phase door') || q.includes('teleport') || q.includes('recall') || q.includes('逃') || q.includes('帰還')) {
                return `退くもまた兵法なり。ショート・テレポートの巻物（r）やテレポートの巻物を常備し、帰還の巻物は発動まで十数ターンを要することを忘れるな。`;
            }
            if (q.includes('wield') || q.includes('equip') || q.includes('wear') || q.includes('armor') || q.includes('weapon') || q.includes('gear') || q.includes('装備') || q.includes('武器')) {
                return `武具を装備するには『w』、外すには『t』、現在の装備を検めるには『e』を押すがよい。`;
            }
            return `宮本武蔵が授ける、${pName}よ。迷宮にて生き延びる要諦は、狭い一マスの通路に敵を誘い込み、常に退路と光源、そして帰還の巻物を絶やさぬことにある。心を静め、一太刀に魂を込めよ。`;
        }

        // 1. POTIONS & HEALING
        if (q.includes('potion') || q.includes('quaff') || q.includes('heal') || q.includes('drink') || q.includes('cure')) {
            if (rk === 'silq') {
                return `In Sil-Q, potions of healing soothe mortal wounds—quaff them with 'q'. But heed this: there are NO potions of mana in Beleriand, for the Eldar and Edain wield Will and innate Song, not alchemical mana! Guard your flasks against dragon breath and icy frost.`;
            }
            return `To quaff that draught, mortal hands must strike 'q' upon your keys (or touch the potion vial on your glass scrying screen). Then select the flask's rune from your pack. Quaffing consumes but a single heartbeat—never wait until death's shadow falls across your neck. In town, visit Alchemy Shop '5' to hoard Potions of Cure Critical Wounds!`;
        }

        // 2. RESTING & SAFE SLEEP
        if (q.includes('rest') || q.includes('sleep') || q.includes('recover') || q.includes('mana')) {
            if (rk === 'silq') {
                return `In Sil-Q, resting is invoked with '%' upon your keys (or 'R' in standard keyset). Sil-Q measures recovery in stealth and quiet turns—never rest within sight or scent of Morgoth's thralls! Retreat into quiet dead ends and listen for approaching footsteps.`;
            }
            return `Never rest in an open hall where horrors wander! Retreat to a dead-end corridor, shut the door ('c'), and invoke the resting rite: press 'R', then '*' to sleep until your Hit Points and Mana are made whole. If danger approaches, your senses will shock you awake.`;
        }

        // 3. SPELLS & MAGIC CONSTRAINTS
        if (q.includes('spell') || q.includes('magic') || q.includes('cast') || q.includes('pray') || q.includes('book') || q.includes('song')) {
            if (rk === 'silq') {
                return `In Sil-Q, there are NO spellbooks or mana bars! Magic lives as sacred Songs: strike 'S' to sing! Weave the Song of Slaying, Song of Elbereth, Song of Staying, or Song of Lorien with your Will! Each verse drains your voice until silence returns.`;
            }
            if (rk === 'frogcomposband') {
                return `Magic in FrogComposBand spans diverse disciplines: Sorcery, Chaos, Nature, Death, Trump, Arcane, and Craft. Press 'm' to browse your realm's arts, or evoke Trump cards to cross the multiverse. Mind your encumbrance and avoid heavy iron gauntlets!`;
            }
            if (rk === 'hengband') {
                return `Hengband features Shinto prayers, Buddhist chants, Ninjutsu techniques, and Bushido stances. Strike 'm' to invoke your chosen school of Eastern enlightenment or ninjutsu art!`;
            }
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
            if (rk === 'silq') {
                return `A warrior without sustenance falters quickly in the gloom. In Sil-Q, keep iron rations or bread of the Eldar in your satchel, and strike 'E' to eat when hunger gnaws at your strength.`;
            }
            return `A warrior without sustenance is already dead. In the town above, visit Building '1' (The General Store) by stepping on its entrance. Press 'p' to purchase iron rations. In the deep, press 'E' to eat when hunger gnaws at your strength.`;
        }

        // 6. LIGHT, TORCHES & LANTERNS
        if (q.includes('light') || q.includes('torch') || q.includes('lantern') || q.includes('oil') || q.includes('dark')) {
            return `The subterranean deeps are pitch black. Unlit tiles conceal lethal breath ambushes and prevent long-range targeting. Always carry spare torches or a brass lantern. When your lantern dims, strike 'F' to fuel it with a flask of oil from your satchel!`;
        }

        // 7. SPEED & HASTE
        if (q.includes('speed') || q.includes('fast') || q.includes('haste') || q.includes('boots of speed')) {
            return `In the subterranean war, Speed is King. At +10 speed, you take two actions for every single move a normal monster makes. At +20, you take three! Prioritize Boots of Speed, Rings of Speed, and Potions of Speed above all other treasures!`;
        }

        // 8. SHOPS & TOWN SERVICES
        if (q.includes('shop') || q.includes('store') || q.includes('town') || q.includes('buy') || q.includes('sell')) {
            if (rk === 'silq') {
                return `There are NO shops or surface towns in Sil-Q! You stand directly within the gates of Angband at -250ft. To forge new blades or armor, seek out the ancient Forges in the deep vaults where your Smithing skill shapes steel!`;
            }
            if (rk === 'frogcomposband') {
                return `The Outpost crossroads connects myriad wilderness paths, guild halls, and strange shops. Step onto the border of the town and press '<' or '>' to emerge into the overland wilderness map!`;
            }
            if (rk === 'hengband') {
                return `Feudal Japan features the sacred Kagura Shrine for prayers and daily bounties, pawn shops, martial dojos, and armorers. Step upon their doors to enter and trade!`;
            }
            return `The frontier town features 8 establishments: General Store '1' (provisions & torches), Armory '2', Weapon Smith '3', Temple '4', Alchemy '5' (potions of cure & restoration), Magic Shop '6', the shadowy Black Market '7', and your personal Home '8' to store surplus relics. Step upon their doors to enter!`;
        }

        // 9. ESCAPES & PHASE DOOR
        if (q.includes('escape') || q.includes('run') || q.includes('phase door') || q.includes('teleport') || q.includes('recall')) {
            if (rk === 'silq') {
                return `In Sil-Q, survival requires constant retreat! Use your Stealth skill to slip past dreadful foes unnoticed. There is no Word of Recall in Beleriand—you must forge your own path back to the upper halls on your own two feet!`;
            }
            return `Retreating at 25% Health is the mark of a veteran, not cowardice! Keep at least 5 Scrolls of Phase Door ('r') in your pack to blink away from surrounding packs, and Scrolls of Teleportation for desperate flights. Remember: Scrolls of Word of Recall take 15 to 25 turns to activate!`;
        }

        // 10. WIELDING & GEAR
        if (q.includes('wield') || q.includes('equip') || q.includes('wear') || q.includes('armor') || q.includes('weapon') || q.includes('gear')) {
            if (rk === 'silq') {
                return `To wield a blade or armor in Sil-Q, strike 'w'. But to TAKE OFF or shed gear, strike 'r' (remove)! Do not confuse 'r' with reading, as Sil-Q separates equipping ('w') and removing ('r') gear!`;
            }
            return `To brandish a blade or don armor, press 'w' on your keys, then select the item from your pack. To inspect the gear currently protecting your body, press 'e' to open your equipment sheet. To take off an item, press 't'.`;
        }

        // 11. INNOCENTS, BEGGARS, AND TOWN VIOLENCE
        if (q.includes('beggar') || q.includes('kill') || q.includes('murder') || q.includes('cat') || q.includes('idiot') || q.includes('townsfolk') || q.includes('crime')) {
            return `Strike not the helpless wretches of the frontier town! Slaying beggars, alley cats, or simple-minded wanderers brings neither glory nor spoils—only senseless cruelty and the wary gaze of the Town Watch. Save your drawn steel for the monsters lurking beneath the earth.`;
        }

        // 12. CORRIDOR FUNNELING & COMBAT TACTICS
        if (q.includes('corridor') || q.includes('funnel') || q.includes('tactic') || q.includes('surround') || q.includes('room')) {
            return `The Golden Rule of roguelikes is the 1-tile corridor bottleneck! In open rooms, multiple horrors can surround and butcher you in a single round. Step backward into a 1-tile corridor or doorway: there, only one monster can face your steel at a time, turning a deadly ambush into an orderly duel.`;
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
            if (rk === 'silq') {
                return `Sil-Q attributes govern your prowess: Melee, Archery, Stealth, Perception, Will, Smithing, and Song! Increase them through experience points gained from foes, discoveries, and ancient depths.`;
            }
            return `Strength increases damage and pack carrying capacity. Dexterity improves Armor Class and dodge rate. Constitution dictates your lifeblood. Beware the cold touch of the Undead (wights and wraiths), which permanently drains your attributes! Purchase Potions of Restore Strength and Life Levels from Alchemy Shop '5'.`;
        }

        // 16. OBJECTIVES & DEFEAT
        if (q.includes('morgoth') || q.includes('goal') || q.includes('objective') || q.includes('win') || q.includes('boss')) {
            if (rk === 'silq') {
                return `In Sil-Q, descend 20 levels (-250ft to -1000ft) beneath Thangorodrim. You do not seek to slay Morgoth—no mortal can! Your quest is to wrest a burning Silmaril from his Iron Crown with the Knife Angrist and escape into the starlight of Beleriand!`;
            }
            if (rk === 'frogcomposband') {
                return `In FrogComposBand, brave the endless wilderness, evolve your chosen monster race or master your class, conquer unique multiversal lords, and plunge to the final depth to challenge the dread sovereign!`;
            }
            if (rk === 'hengband') {
                return `In Hengband, master Bushido or the arcane arts, fulfill daily bounties at the Kagura shrine, defeat the legendary warlords and yokai of the realm, and banish the ultimate shadow beneath Angband!`;
            }
            return `Descend 100 deep levels beneath the Iron Mountains. Slay Sauron the Sorcerer on Level 99, then vanquish the Dark Vala Morgoth Bauglir on Level 100 to claim victory for Middle-earth!`;
        }

        // General in-character survival counsel attuned to realm
        if (rk === 'silq') {
            return `Daeron of Doriath speaks, ${pName}. In the shadowed halls beneath Thangorodrim, subtlety is your greatest shield. Master the songs of weaving, husband your light, forge arms at the secret anvils, and remember that combat here is measured in wound thresholds rather than vast pools of health.`;
        } else if (rk === 'hengband') {
            return `Miyamoto Musashi counsels you, ${pName}. In this realm of Bushido and Eastern Mythos, keep your blade keen, your spirit tranquil, and let your Ki flow into every decisive strike. Never let your guard slip before the demons of the dark!`;
        } else if (rk === 'frogcomposband') {
            return `Corwin of Amber observes your journey, ${pName}. In the boundless multiverse of Amber and Chaos, whether you wander as an Elven knight or an evolving monster, leverage your unique gifts, explore the wild overworld with caution, and trust only your steel and the Pattern!`;
        }
        return `Master Elrond counsels you, ${pName}. In the deeps of Angband, your survival hinges on discipline: inspect your pack with 'i', keep your back to the stone, funnel multiple foes into narrow 1-tile corridors, and never venture downward without food, torches, and scrolls of escape.`;
    }

    /**
     * Resolves rich diegetic lorekeeper appraisal and historical context for non-creature objects.
     * Integrates canonical artifact lore, realm-specific tradition, item category, and tactical usage.
     * Consumes strictly ZERO engine turns.
     */
    static resolveObjectInspection(item, hero = null, depth = 0, realmKey = 'angband') {
        const rk = (realmKey || (typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function' ? window.__app.getActiveRealm() : 'angband')).toLowerCase();
        const isJpHeng = (rk === 'hengband' && typeof window !== 'undefined' && window.__langMode === 'jp');
        const realmCtx = this.getRealmContext(rk);
        const itemName = (item && (item.name || item.itemName)) ? (item.name || item.itemName) : (isJpHeng ? '未鑑定の品' : 'Unidentified Object');
        const glyph = (item && item.glyph) ? item.glyph : '?';
        const hName = (hero && hero.name) ? hero.name : (isJpHeng ? '武芸者' : 'the adventurer');
        const lower = itemName.toLowerCase();

        if (isJpHeng) {
            const jpAppraisal = `「${itemName}」——迷宮の石畳に眠る品なり。『g』で拾い、『i』で持ち物を検め、『I』で詳細を見極めよ。`;
            return {
                title: `鑑定: ${itemName}`,
                prose: `${hName}は足元の「${itemName}」に目を留め、宮本武蔵の鑑識を仰ぐ。`,
                appraisal: jpAppraisal,
                dialogue: jpAppraisal,
                lorekeeperName: '宮本武蔵',
                recommendedVoice: realmCtx.voice,
                isArtifact: false,
                realm: rk
            };
        }

        // 1. Check canonical artifact lore across realms
        let matchedArtifactLore = null;
        let matchedArtifactName = null;
        for (const [artName, artDesc] of Object.entries(this.CANON_ARTIFACT_LORE)) {
            if (lower.includes(artName.toLowerCase())) {
                matchedArtifactLore = artDesc;
                matchedArtifactName = artName;
                break;
            }
        }

        if (matchedArtifactLore) {
            const dialogueLine = `${matchedArtifactLore} Take it up with reverence, for relics of such craft turn the tides of doom!`;
            return {
                title: `Relic of Legend: ${matchedArtifactName}`,
                prose: `Gazing down through the subterranean gloom, ${hName} beholds ${matchedArtifactName} resting upon the stones—a legendary relic of the realm, shimmering with ancient power.`,
                appraisal: dialogueLine,
                dialogue: dialogueLine,
                lorekeeperName: realmCtx.lorekeeperName,
                recommendedVoice: realmCtx.voice,
                isArtifact: true,
                realm: rk
            };
        }

        // 2. Generic / standard item categories
        let appraisal = '';
        let prose = '';

        if (glyph === '!' || lower.includes('potion') || lower.includes('draught') || lower.includes('flask of')) {
            if (rk === 'silq') {
                appraisal = `A glass phial filled with distilled draughts. Quaff it with 'q' to mend flesh or bolster your will against the cold dread of Morgoth. Guard it well against freezing breaths!`;
            } else {
                appraisal = `A glass flask sealed with enchanted wax. Quaff it with 'q' to mend mortal wounds or cure pestilence. In the town above, hoard draughts of Cure Critical Wounds before descending deeper!`;
            }
            prose = `${hName} kneels to examine the sealed glass vial gleaming softly upon the flagstones.`;
        } else if (glyph === '?' || lower.includes('scroll') || lower.includes('parchment')) {
            if (rk === 'silq') {
                appraisal = `Ancient parchment inscribed with Elven or Dwarven runes. In Sil-Q, read with 'r' to reveal unseen corridors or ward against shadow, but remember that taking off armor also uses 'r'!`;
            } else {
                appraisal = `A rolled parchment bearing sacred sigils of power. Strike 'r' to read the runes and invoke phase doors, teleports, or magical identification!`;
            }
            prose = `${hName} leans down to inspect the weathered scroll tied with a braided cord among the gravel.`;
        } else if (glyph === '=' || lower.includes('ring')) {
            appraisal = `A band of precious metal imbued with persistent enchantment. Slip it onto your finger with 'w'. Rings of Speed, Resist Fire, and Free Action are worth their weight in mithril!`;
            prose = `A polished band of metal catches the torchlight from a crevice between the stones.`;
        } else if (glyph === '"' || lower.includes('amulet') || lower.includes('necklace') || lower.includes('pendant')) {
            appraisal = `A talisman hung upon a delicate chain. Don it about your throat with 'w' to ward off insidious curses, telepathy drain, or life-force withering.`;
            prose = `An amulet of intricate smithing gleams in the dark dust of the passage.`;
        } else if (glyph === '-' || glyph === '_' || lower.includes('wand') || lower.includes('rod') || lower.includes('staff')) {
            if (rk === 'silq') {
                appraisal = `An instrument fashioned from elder wood and copper. Such devices channel focused rays of light or blast icy stone without straining your singing voice.`;
            } else {
                appraisal = `A magical device of focused sorcery. Aim wands with 'a', discharge rods with 'z', or strike staves with 'u'. Keep them charged for moments when spells fail!`;
            }
            prose = `An intricately carved length of wood and chased silver lies upon the floor.`;
        } else if (glyph === ')' || lower.includes('sword') || lower.includes('blade') || lower.includes('dagger') || lower.includes('katana') || lower.includes('axe') || lower.includes('mace') || lower.includes('spear')) {
            if (rk === 'silq') {
                appraisal = `A weapon forged for the wars of Beleriand. Wield it with 'w'. If you discover an ancient Forge in the deeps, your Smithing skill can reforge and sharpen its steel!`;
            } else if (rk === 'hengband') {
                appraisal = `Honed steel fashioned in the Eastern tradition. Wield it with 'w'. When wielded by a disciplined master, its balance unlocks lethal Bushido stances and decisive critical strikes!`;
            } else {
                appraisal = `Tempered steel balanced for lethal combat. Wield it with 'w' and inspect your blows. Check its weight against your strength so your attacks land swift and true!`;
            }
            prose = `${hName} studies the cold, sharpened edge of the weapon resting quietly in the shadows.`;
        } else if (glyph === '(' || lower.includes('bow') || lower.includes('sling') || lower.includes('crossbow') || lower.includes('arrow') || lower.includes('bolt') || lower.includes('shot')) {
            appraisal = `Ranged armaments for striking across open vaults. Wield the bow or launcher with 'w' and loose missiles with 'f'. Whittle down charging horrors before they reach your steel!`;
            prose = `Missile craft fashioned for distance warfare lies propped against the masonry.`;
        } else if (glyph === '[' || glyph === ']' || lower.includes('armor') || lower.includes('mail') || lower.includes('shield') || lower.includes('helm') || lower.includes('cloak') || lower.includes('boots') || lower.includes('gloves')) {
            if (rk === 'silq') {
                appraisal = `Stout armor wrought to turn the claws of wolves and orcish scimitars. Wield with 'w', and remember to strike 'r' to remove if your stealth requires lighter step.`;
            } else {
                appraisal = `Protective gear to shield vital flesh from crushing blows and elemental breaths. Don it with 'w'. Prioritize protections against Acid, Fire, and Paralysis!`;
            }
            prose = `Sturdy protective gear lies sprawled upon the stones, bearing marks of ancient smithcraft.`;
        } else if (glyph === '~' || lower.includes('torch') || lower.includes('lantern') || lower.includes('oil') || lower.includes('light')) {
            appraisal = `A source of precious subterranean luminescence. Equip it in your light slot with 'w'. Unlit corridors leave you blind to breath ambushes; replenish brass lanterns with 'F'!`;
            prose = `A light source rests in the dark, awaiting fuel or spark to pierce the gloom.`;
        } else if (glyph === ',' || lower.includes('ration') || lower.includes('food') || lower.includes('mushroom') || lower.includes('bread') || lower.includes('meat')) {
            appraisal = `Provisions for the body. Consume with 'E' when hunger gnaws. Beware strange subterranean mushrooms—some purge toxins, while others induce delirium or blinding hallucination!`;
            prose = `Subterranean provisions lie wrapped in damp cloth upon the dungeon floor.`;
        } else if (glyph === '$' || lower.includes('gold') || lower.includes('silver') || lower.includes('copper') || lower.includes('gems') || lower.includes('coins')) {
            if (rk === 'silq') {
                appraisal = `Gleaming ore from the deep veins beneath Thangorodrim. While gold buys no goods where there are no shops, fine gems hold historical lore and smithing virtues.`;
            } else {
                appraisal = `Glittering coin of the realm. Step upon it to sweep it into your purse! Gold finances your provisions, restorations, and enchantments in the town shops above.`;
            }
            prose = `Glittering coins and cut gems sparkle enticingly in the crevices of the flagstones.`;
        } else if (glyph === '&' || lower.includes('chest')) {
            appraisal = `A heavy iron-banded chest. Beware! Such containers are frequently rigged with gas darts, acid vents, or explosive runes. Search with 's' and disarm with 'D' before lifting the lid!`;
            prose = `A heavy, iron-bound chest sits locked in the recess of the corridor.`;
        } else {
            appraisal = `An object of mysterious origin in this deep tier. Handle with care, test with identification before trusting your life to it, and remain watchful of concealed malice!`;
            prose = `${hName} pauses to scrutinize the unusual object resting upon the stones.`;
        }

        return {
            title: `Appraisal: ${itemName}`,
            prose: prose,
            appraisal: appraisal,
            dialogue: appraisal,
            lorekeeperName: realmCtx.lorekeeperName,
            recommendedVoice: realmCtx.voice,
            isArtifact: false,
            realm: rk
        };
    }

    /**
     * Answers specific follow-up inquiries regarding an inspected object.
     */
    static answerObjectQuery(item, query = '', hero = null, depth = 0, realmKey = 'angband') {
        const rk = (realmKey || (typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function' ? window.__app.getActiveRealm() : 'angband')).toLowerCase();
        const realmCtx = this.getRealmContext(rk);
        const itemName = (item && (item.name || item.itemName)) ? (item.name || item.itemName) : 'Object';
        const q = (query || '').toLowerCase().trim();

        if (q.includes('drink') || q.includes('quaff') || q.includes('heal') || q.includes('potion') || q.includes('draught')) {
            return `Quaff potions with 'q'. Keep Cure Critical Wounds at the ready whenever health falls below half, and never wait until bleeding or confusion sets in before drinking!`;
        }
        if (q.includes('read') || q.includes('scroll') || q.includes('parchment')) {
            return `Read sacred scrolls with 'r'. Scrolls of Phase Door, Teleportation, and Word of Recall are your ultimate lifelines when cornered by lethal foes!`;
        }
        if (q.includes('curse') || q.includes('bad') || q.includes('safe') || q.includes('trap') || q.includes('danger')) {
            return `Beware! Unknown equipment found in the deeps may carry sticky curses of misery or vulnerability. Use a Scroll of Identify before donning suspicious gear, or keep Scrolls of Remove Curse at hand!`;
        }
        if (q.includes('use') || q.includes('key') || q.includes('how') || q.includes('equip') || q.includes('wield') || q.includes('wear')) {
            if (rk === 'silq') {
                return `To equip this item in Sil-Q, press 'w'. If you ever need to take it off, remember to press 'r' (remove). Quaff draughts with 'q' and consume provisions with 'E'.`;
            }
            return `To wield or wear this gear, strike 'w' on your keys. To take it off, strike 't'. Potions are quaffed with 'q', scrolls read with 'r', and wands aimed with 'a'.`;
        }
        if (q.includes('keep') || q.includes('worth') || q.includes('good') || q.includes('pick') || q.includes('take') || q.includes('sell') || q.includes('shop') || q.includes('gold')) {
            return `If your pack space allows, take it up! Even mundane items can be sold in the town shops above, or carried as emergency backups against acid breaths and corrosion.`;
        }
        return `${realmCtx.lorekeeperName} observes: "${itemName}" holds a place in the history of ${realmCtx.realm}. Examine its runes closely, tread with care, and let wisdom guide your hand.`;
    }

    /**
     * Extracts a clean, normalized creature name from varied Angband kill strings.
     * Handles upstream Angband formats:
     * - "The small kobold dies." -> "small kobold"
     * - "The yellow jelly is destroyed." -> "yellow jelly"
     * - "The ghost perishes." -> "ghost"
     * - "You have slain the Cave orc." -> "Cave orc"
     * - "The mummy crumbles into dust." -> "mummy"
     */
    static extractSlainMonsterName(kill) {
        if (!kill) return 'foe';
        const text = typeof kill === 'string' ? kill : (kill.monsterName || kill.message || '');
        if (!text) return 'foe';
        let m = text.match(/slain (?:the |a |an )?([A-Za-z0-9\-',\s]+?)(?:\.|$)/i);
        if (m && m[1]) return m[1].trim();
        m = text.match(/(?:The |A |An )?([A-Za-z0-9\-',\s]+?)\s+dies(?:\.|$)/i);
        if (m && m[1]) return m[1].trim();
        m = text.match(/(?:The |A |An )?([A-Za-z0-9\-',\s]+?)\s+is destroyed(?:\.|$)/i);
        if (m && m[1]) return m[1].trim();
        m = text.match(/(?:The |A |An )?([A-Za-z0-9\-',\s]+?)\s+perishes(?:\.|$)/i);
        if (m && m[1]) return m[1].trim();
        m = text.match(/(?:The |A |An )?([A-Za-z0-9\-',\s]+?)\s+crumbles into dust(?:\.|$)/i);
        if (m && m[1]) return m[1].trim();
        return text.replace(/^(?:The |A |An )/i, '').replace(/[.!]+$/, '').trim() || 'foe';
    }

    /**
     * Generates deep, contextual combat saga narratives with genuine Middle-earth color,
     * racial/class internal justification, moral judgment, and rotational anti-repetition.
     */
    static generateKillSaga(kills = [], player = null, depth = 0, traditionKey = 'westmarch', weapon = null, fleeingMonster = null, attackMedium = null) {
        const pName = (player && player.name) ? player.name : 'The Wanderer';
        const pRace = (player && player.race) ? player.race.toLowerCase() : 'mortal';
        const pClass = (player && player.class) ? player.class.toLowerCase() : 'warrior';
        const isTown = (depth === 0);

        let effectiveWeapon = weapon;
        if (!effectiveWeapon || effectiveWeapon === 'drawn steel') {
            const rawWeap = (player && player.weapon_item) ? player.weapon_item : ((player && player.equipped && player.equipped.weapon) ? player.equipped.weapon : null);
            effectiveWeapon = rawWeap ? rawWeap.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim() : 'bare fists';
        }

        const isSpell = (attackMedium && attackMedium.type === 'spell') || (effectiveWeapon && effectiveWeapon.toLowerCase().includes('spell'));
        const isRanged = (attackMedium && attackMedium.type === 'ranged') || (attackMedium && attackMedium.method === 'shoot') || (effectiveWeapon && (effectiveWeapon.toLowerCase().includes('bow') || effectiveWeapon.toLowerCase().includes('arrow') || effectiveWeapon.toLowerCase().includes('bolt') || effectiveWeapon.toLowerCase().includes('sling') || effectiveWeapon.toLowerCase().includes('crossbow')));
        const isDevice = (attackMedium && attackMedium.type === 'device') || (attackMedium && attackMedium.method === 'device') || (effectiveWeapon && (effectiveWeapon.toLowerCase().includes('wand') || effectiveWeapon.toLowerCase().includes('staff') || effectiveWeapon.toLowerCase().includes('rod')));
        const isSpellOrDevice = isSpell || isDevice;

        const archetype = (attackMedium && attackMedium.archetype) ? attackMedium.archetype : (effectiveWeapon.toLowerCase() === 'bare fists' ? 'unarmed' : (effectiveWeapon.toLowerCase().includes('hammer') || effectiveWeapon.toLowerCase().includes('mace') || effectiveWeapon.toLowerCase().includes('flail') || effectiveWeapon.toLowerCase().includes('club') ? 'blunt' : (effectiveWeapon.toLowerCase().includes('axe') ? 'axe' : (effectiveWeapon.toLowerCase().includes('dagger') || effectiveWeapon.toLowerCase().includes('knife') ? 'dagger' : (effectiveWeapon.toLowerCase().includes('spear') || effectiveWeapon.toLowerCase().includes('pike') || effectiveWeapon.toLowerCase().includes('lance') ? 'polearm_pierce' : 'blade')))));

        // Turn-based pseudo-random seed to guarantee rotational variety
        const turnSeed = Math.abs(((player && player.turn ? player.turn : 0) + (kills.length || 1) * 7)) % 12;

        // Monster Family Detection
        const isBeggar = kills.some(k => /beggar|urchin|leper/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isCatOrDog = kills.some(k => /cat|dog|hound|jackal/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isIdiot = kills.some(k => /idiot/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isTownsperson = kills.some(k => /merchant|peasant|townsfolk|drunk|sot/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isRogue = kills.some(k => /rogue|thief|cutpurse|bandit|mugger|brigand/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isOrc = kills.some(k => /orc|goblin|snaga|uruk/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isKobold = kills.some(k => /kobold/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isJelly = kills.some(k => /jelly|mold|ooze|slime|cube/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isVermin = kills.some(k => /spider|centipede|snake|worm|rat|tick|beetle/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isUndead = kills.some(k => /skeleton|zombie|wight|wraith|vampire|spectre|ghost/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isTroll = kills.some(k => /troll|ogre|giant|ettin/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));
        const isDragon = kills.some(k => /dragon|drake|wyrm/i.test(typeof k === 'string' ? k : (k.monsterName || k.message || '')));

        let title = 'Blood on the Stone';
        let prose = '';

        // --- 1. TOWN CRIMES & INNOCENT CASUALTIES (DEPTH 0) ---
        if (isTown && isBeggar) {
            title = ['Grim Deed in the Gutter', 'Blood on the Cobblestones', 'The Beggar\'s Fall', 'Shadow Over the Alleys'][turnSeed % 4];
            if (isSpellOrDevice) {
                prose = `A sudden flare of wild magic erupts from ${pName}'s fingers, searing into the tattered rags of the pleading beggar. The helpless wretch collapses into the muddy gutter as sparks hiss against damp cobblestones, leaving the alley thick with the stench of scorched cloth and a horrified, accusing silence.`;
            } else if (pRace.includes('half-orc')) {
                const halfOrcBeggarVariants = [
                    `${pName}'s ${effectiveWeapon} flashes without hesitation, slicing into the tattered rags. The dark, brutal blood of the shadow-pits surges in ${pName}'s veins—a ruthless instinct honed in the slave-pits, where weakness is despised and every reaching hand is suspected of concealing a shiv. Yet as the wretch collapses lifeless into the muddy gutter, a cold prickle of paranoia settles upon the rogue: the Town Watch patrols these lanes with heavy arbalests, and a senseless slaughter leaves a trail that even alley hounds can follow.`,
                    `With feral, reflexive swiftness, ${pName}'s ${effectiveWeapon} cuts down the pleading beggar upon the damp paving stones. Born of two worlds that both offer nothing but scorn, ${pName} struck from raw cutthroat calculus, permanently silencing the wretch's cries for coin. The frontier wind whips dust across the fresh crimson pool, leaving an ominous quiet where desperate pleas once hung.`,
                    `A single vicious thrust silences the beggar's whining pleas. ${pName} looks down at the crumpled heap with cold, narrow eyes: on the harsh streets, survival permits no softness, and beggars often double as eyes for the cutpurse guilds. Wiping ${effectiveWeapon} on the victim's coat, ${pName} slips into the alley shadows.`,
                    `The blade bites deep, and the beggar topples backward into a stack of empty crates with a wet gasp. ${pName}'s pit-born blood relishes the cruel demonstration of force, yet mortal cunning whispers caution: corpses in town draw questions that gold cannot always answer.`
                ];
                prose = halfOrcBeggarVariants[turnSeed % halfOrcBeggarVariants.length];
            } else if (pRace.includes('elf')) {
                prose = `A sickening sorrow clenches ${pName}'s chest as the blow strikes home. What darkness has overtaken an Eldar, to hew down a starving wretch whose only crime was hunger? The blood pools between the ancient flagstones, and the distant light of the stars seems veiled in mournful grief at so senseless and tragic a deed.`;
            } else if (pRace.includes('dwarf')) {
                prose = `The heavy strike ends the beggar's cries with a dull, hollow thud upon the stones. Dwarven iron was forged to shatter troll-bone and carve gold from the deep roots of the mountain, not to waste its edge on alley wretches. ${pName} turns aside in silence, weighed down by the grim dishonor brought upon clan and ancestors.`;
            } else {
                prose = `The ${effectiveWeapon} strikes home in sudden, tragic haste, felling the pitiful beggar against the timber wall. In this lawless frontier borderland, where the shadow of the deeps looms like a black cloud, mortal hearts grow cold all too easily. As the figure crumples motionless, a heavy remorse settles over ${pName}, realizing how swiftly fear and desperation can erode the soul.`;
            }
        } else if (isTown && isCatOrDog) {
            title = ['A Startled Strike in the Alley', 'Shadows of the Backstreets', 'Frayed Nerves in Town'][turnSeed % 3];
            prose = isSpellOrDevice
                ? `A startled crackle of sorcery lashes out from ${pName}'s hand, catching the alley beast as it darts from the garbage. The stray crumples motionless; ${pName} lowers trembling hands amidst the tense silence of the backstreets.`
                : `${pName}'s ${effectiveWeapon} lashes out in a reflexive sweep, catching the alley beast as it darts from the garbage. With nerves stretched thin by the looming dread of the descent, every sudden scuttle in the gutter feels like an assassin's dagger. The creature crumples into the dust; ${pName} lowers the weapon, breathing heavily amidst the tense silence of the backstreets.`;
        } else if (isTown && isIdiot) {
            title = ['Silence in the Street', 'An Ill Deed on the Stones', 'The Witless Slain', 'Tragedy in the Market'][turnSeed % 4];
            const idiotVariants = [
                `The blow strikes home with decisive force, cutting short the foolish laughter upon the cobblestones. The town street falls into an uneasy, accusing silence. Even on the ragged edge of civilization, striking down the witless brings no honor—only the nervous twitching of window shutters and the creeping suspicion of the frontier folk.`,
                `A sudden, brutal assault ends the idiot's babbling in an instant. The body folds onto the wet cobblestones, and the surrounding townsfolk scatter in horrified silence. In the shadows of the frontier, murder is common, but cold slaughter of the harmless marks the killer with an indelible taint.`,
                `With swift, impatient cruelty, ${pName}'s strike cuts the fool down mid-caper. The silence that follows is thick and hostile. The tavern lights across the street seem suddenly dimmer, as if judging the unnecessary bloodshed.`,
                `The witless victim collapses without understanding the blow that felled him. ${pName} looks down with a grim grimace, acutely aware that such deeds do not go unnoticed by the unseen powers of the world.`
            ];
            prose = idiotVariants[turnSeed % idiotVariants.length];
        } else if (isTown && isRogue) {
            title = ['Alley Justice', 'Steel in the Mist', 'The Cutpurse\'s Reckoning', 'Street Skirmish'][turnSeed % 4];
            if (isSpellOrDevice) {
                prose = `A blinding flash of sorcery illuminates the dark alley as ${pName} unleashes crackling energy straight into the lunging thief! The rogue is hurled backward against the timber wall, stolen copper coins spilling from charred fingers into the mud. Street justice is swift in the frontier: one less cutpurse stalks the town lanes.`;
            } else if (isRanged) {
                prose = `Drawing with blinding speed, ${pName} plants an arrow squarely through the highwayman's guard before the dagger could strike! The cutpurse collapses upon the wet paving stones, his ambush brought to an abrupt and fatal close.`;
            } else {
                const rogueVariants = [
                    `Steel clangs sharply between the timber eaves! Reading the cutpurse's lunging feint, ${pName} pivots on the damp cobblestones and drives ${effectiveWeapon} through the brigand's guard. The rogue collapses with a final curse, stolen coins spilling from his loosened grip into the mud. In the lawless frontier, street justice is swift: one less throat-slitter stalks the town alleys tonight.`,
                    `A desperate grapple in the alley shadows ends with a decisive counter-thrust. ${pName}'s ${effectiveWeapon} finds its mark, ending the thief's ambush before poison could coat the blade. The frontier fog rolls over the fallen outlaw, restoring uneasy peace to the market approach.`,
                    `The thief's hidden dagger flashes in the lantern light, but ${pName} is quicker. A brutal sidestep and a sweeping stroke of ${effectiveWeapon} drops the highwayman cold onto the paving stones. The alleys of the border town have claimed another predator.`,
                    `Catching the cutpurse's wrist in a vise-like grip, ${pName} runs him through before his accomplices can intervene. The rogue slumps against the wooden rain-barrel, his career of alley extortion brought to an abrupt and bloody close.`
                ];
                prose = rogueVariants[turnSeed % rogueVariants.length];
            }
        } else if (isTown && isTownsperson) {
            title = ['Brawl in the Marketplace', 'Blood on Frontier Timber', 'Violence in the Streets'][turnSeed % 3];
            prose = `The conflict turns bloody in the open street as ${pName}'s assault finds its mark. The victim crumples against a stack of crates, and the murmur of the town market dies into terrified whispers. Striking down the frontier folk invites doom; ${pName} glances toward the shadowy arches, knowing the town watch will not easily forget this day.`;
        }
        // --- 2. SUBTERRANEAN DUNGEON COMBAT (DEPTH > 0) ---
        else if (fleeingMonster && kills.length === 1) {
            const cleanFlee = ChronicleGrounder.extractSlainMonsterName(fleeingMonster);
            if (isSpellOrDevice) {
                title = ['Spellflight Cut Short', 'Arcane Ruin', 'The Searing Word', 'No Sanctuary in Magic'][turnSeed % 4];
                const fleeSpellVariants = [
                    `Pursuing the panicked ${cleanFlee}, ${pName} releases a searing lance of magic! The blast overtakes the craven creature in mid-stride, engulfing it in crackling sparks upon the dark stone.`,
                    `Closing distance before the ${cleanFlee} could round the corridor, ${pName} speaks a syllable of power—a dazzling burst of spellfire blasts the fleeing foe into ash upon the flagstones!`,
                    `Blind panic offered the ${cleanFlee} no sanctuary: ${pName}'s arc of sorcery strikes true from behind, dropping the coward motionless onto the dungeon floor.`,
                    `The corridor flares with azure flame as ${pName}'s spell ends the flight of the ${cleanFlee}. The subterranean vault falls into smoking silence.`
                ];
                prose = fleeSpellVariants[turnSeed % fleeSpellVariants.length];
            } else if (isRanged) {
                title = ['Arrow from the Gloom', 'Flight Cut Short', 'The Silent Shaft', 'Pursuit with Bow'][turnSeed % 4];
                const fleeRangedVariants = [
                    `Pursuing the panicked ${cleanFlee}, ${pName} looses a silent shaft from the shadows! The missile strikes true between the shoulder blades, cutting its flight short upon the dark stones.`,
                    `Drawing the bowstring with practiced ease, ${pName} pins the fleeing ${cleanFlee} to the corridor floor before it can reach the dark alcoves!`,
                    `A single, lethal shot whistles through the gloom: the fleeing ${cleanFlee} topples forward, felled in mid-stride upon the flagstones.`
                ];
                prose = fleeRangedVariants[turnSeed % fleeRangedVariants.length];
            } else {
                title = ['Flight Cut Short', 'No Escape in the Dark', 'The Craven Felled', 'Pursuit in the Deep'][turnSeed % 4];
                const fleeKillVariants = [
                    `Pursuing the panicked ${cleanFlee}, ${pName}'s ${effectiveWeapon} strikes true from behind! The craven creature crumples in mid-stride, its desperate flight cut short upon the dark stones.`,
                    `Closing the distance before the ${cleanFlee} could slip down the dark corridor, ${pName} delivers a decisive finishing stroke, felling the fleeing foe upon the flagstones!`,
                    `Blind terror offered the ${cleanFlee} no sanctuary: ${pName} overtakes the retreating assailant, cutting it down with a swift strike of ${effectiveWeapon}.`,
                    `The corridor falls into silence as ${pName}'s ${effectiveWeapon} ends the flight of the ${cleanFlee}. The subterranean passages echo no further cries.`
                ];
                prose = fleeKillVariants[turnSeed % fleeKillVariants.length];
            }
        } else if (isKobold) {
            if (isSpellOrDevice) {
                title = ['Eldritch Purge', 'The Burrow Scoured', 'Spellfire in the Warrens', 'Ashes of the Craven'][turnSeed % 4];
                const koboldSpellVariants = [
                    `A crackling burst of spellfire incinerates the screeching small kobold! The searing energy blasts its crude knife to molten scrap, silencing its snarls upon the stone.`,
                    `Summoning a spark of elemental fire, ${pName} engulfs the darting kobold. The wretched scavenger crumples into a smoking cinder on the dungeon floor.`,
                    `A blinding shockwave of mystical force blasts the small kobold backward against the stone wall, extinguishing its malice in an instant.`,
                    `Whispering a swift cantrip, ${pName} strikes the subterranean scavenger down with a bolt of crackling energy before it can loose another crude dart.`
                ];
                prose = koboldSpellVariants[turnSeed % koboldSpellVariants.length];
            } else if (isRanged) {
                title = ['The Pierced Scavenger', 'Silent Arrow in the Dark', 'Warren Sniper Felled', 'Shaft Through the Gloom'][turnSeed % 4];
                const koboldRangedVariants = [
                    `A swift, whistling arrow pierces the small kobold through before it can retreat into its burrow! The creature falls limp across its crude dagger.`,
                    `Loosing a missile with pinpoint accuracy, ${pName} drops the screeching small kobold in mid-step upon the dark rock.`,
                    `A single well-aimed shot cuts through the torchlit mist, pinning the small kobold cold against the cavern wall.`
                ];
                prose = koboldRangedVariants[turnSeed % koboldRangedVariants.length];
            } else {
                title = ['Bane of the Warrens', 'The Scavenger Silenced', 'The Small Knife Broken', 'Cleansing the Burrows'][turnSeed % 4];
                const koboldVariants = [
                    `A swift, punishing strike of ${effectiveWeapon} cuts down the screeching small kobold! The wretched creature topples across its crude notch-bladed knife, silencing its snarls upon the stone.`,
                    `Catching the small kobold as it recoils, ${pName}'s ${effectiveWeapon} pierces cleanly through. The subterranean scavenger collapses lifeless into the dust, leaving the dark passage clear.`,
                    `With decisive speed, ${pName} hews down the small kobold before it can loose another crude dart or scamper into the alcoves. The immediate threat is neutralized.`,
                    `The small kobold's wild jab glances harmlessly off guard; ${pName} counters with lethal finality, felling the subterranean craven upon the cold rock.`
                ];
                prose = koboldVariants[turnSeed % koboldVariants.length];
            }
        } else if (isJelly) {
            const cleanJelly = ChronicleGrounder.extractSlainMonsterName(kills[0]);
            if (isSpellOrDevice) {
                title = ['Elemental Dissolution', 'Protoplasm Boiled', 'Arcane Evaporation', 'The Slime Purged'][turnSeed % 4];
                const jellySpellVariants = [
                    `A scorching wave of spellfire strikes the quivering protoplasm of the ${cleanJelly}! The acidic mass boils furiously, evaporating into harmless vapor and leaving only charred moisture on the stone.`,
                    `Focusing elemental heat, ${pName} incinerates the gelatinous ${cleanJelly} before its acidic slime can touch boots or mail. The creature is reduced to smoking residue.`,
                    `A brilliant lance of mystical light pierces the ${cleanJelly}, rupturing its acidic core and dissolving the organism into steaming puddles.`,
                    `Arcane energy crackles through the pulsating ${cleanJelly}, boiling its noxious tissue until nothing remains but scorched bedrock.`
                ];
                prose = jellySpellVariants[turnSeed % jellySpellVariants.length];
            } else {
                title = ['Quivering Protoplasm Pierced', 'The Ooze Dissolved', 'Acidic Remnants', 'Clean Cut Through Slime'][turnSeed % 4];
                const jellyVariants = [
                    `A shearing stroke of ${effectiveWeapon} cleaves through the quivering protoplasm of the ${cleanJelly}! The acidic mass dissolves with a violent hiss, spattering inert slime across the dungeon floor.`,
                    `Ducking back from the corrosive stench, ${pName} brings ${effectiveWeapon} down with slicing force. The gelatinous ${cleanJelly} bursts apart, liquefying harmlessly into the cracks of the stone.`,
                    `With measured strikes, ${pName} destroys the ${cleanJelly} before its stinging touch can corrode armor or burn flesh. The noxious organism is reduced to smoking residue.`,
                    `The pulsating ${cleanJelly} quivers under the onslaught of ${effectiveWeapon}, rupturing and collapsing into a lifeless puddle of steaming subterranean goo.`
                ];
                prose = jellyVariants[turnSeed % jellyVariants.length];
            }
        } else if (isOrc) {
            if (isSpellOrDevice) {
                title = ['Arcane Conflagration', 'Sorcery in the Gloom', 'The Cleansing Flame', 'Bane of the Defilers', 'Wrath of the Unseen', 'Ash and Brimstone'][turnSeed % 6];
                const orcSpellVariants = [
                    `Ancestral magic surges through ${pName}'s fingertips! A searing bolt of arcane fire strikes the foul orc square in the breastplate, blasting through crude iron and flesh in a violent shower of sparks. The defiler collapses into a smoking heap of ash upon the flagstones.`,
                    `Whispering words of ancient power, ${pName} unleashes a crackling lance of lightning. The bolt sears through the orc's guard, shattering its notched scimitar and tumbling the creature lifeless across the stone.`,
                    `A blinding flash of mystical force erupts in the narrow corridor! The orc screeches as the radiant shockwave lifts it off its feet and dashes it against the ancient granite, extinguishing its malice forever.`,
                    `Summoning raw elemental force, ${pName} incinerates the charging orc before its rusted cleaver can fall. The stench of burnt brimstone lingers in the damp air as the brute crumbles to cinder.`,
                    `A radiant lance of pure light pierces the gloom! The dark minion howls in agony as the brilliance sears through its black heart, felling the defiler instantly upon the shale.`,
                    `Channeling the deep secrets of the unseen, ${pName} blasts the advancing orc into oblivion with a thunderous detonation of spellfire that rattles dust from the vaulted roof.`
                ];
                prose = orcSpellVariants[turnSeed % orcSpellVariants.length];
            } else if (isRanged) {
                title = ['The Deadly Shaft', 'Marksmanship in the Dark', 'Iron Arrow Through Mail', 'The Pierced Foe', 'Bowstring in the Deep', 'Sniper of the Abyss'][turnSeed % 6];
                const orcRangedVariants = [
                    `The bowstring hums with fatal music! Pierced cleanly through the neck by ${pName}'s missile, the foul orc topples forward with a wet choke, its crude blade clattering harmlessly to the ground.`,
                    `Drawing the shaft to full tension, ${pName} releases into the torchlit mist. The arrow punches through crude boiled leather, dropping the snarling defiler in its tracks.`,
                    `A masterclass of ranged precision: ${pName} catches the charging orc mid-stride, planting a heavy iron quarrel straight through its helmet visor.`,
                    `From the shadowy corridor, ${pName} looses a silent arrow that takes the orc between the ribs, sending it sprawling cold across the blood-slicked stones.`,
                    `The orc's war-cry is cut short as a whistling missile strikes true, pinning its arm to its side and driving into its vitals. The brute crashes lifeless into the dust.`,
                    `With lethal marksmanship, ${pName} neutralizes the advancing orc at distance, leaving its crude scimitar to clatter uselessly on the dark floor.`
                ];
                prose = orcRangedVariants[turnSeed % orcRangedVariants.length];
            } else {
                title = ['Bane of the Orc-Kin', 'Black Blood on Cold Stone', 'The Ancient Feud', 'Heir of the First Age', 'Cleansing the Defilers', 'Iron Against Scimitar'][turnSeed % 6];
                const orcVariants = [
                    `Ancestral wrath guides the strike! ${pName}'s ${effectiveWeapon} cleaves through crude boiled leather and gnawed bone, hewing down the foul orc in a spray of thick, hissing black blood. The ancient feud burns hot in this corridor; the Shadow's defilers will find no quarter in these halls.`,
                    `With seasoned combat instinct, ${pName} parries the notched scimitar and drives ${effectiveWeapon} straight into the orc's throat. The creature collapses against the damp shale with a choking rattle, leaving the dark passage reeking of sulfur and dead malice.`,
                    `Slipping beneath a clumsy overhand chop, ${pName} steps inside the orc's guard. The ${effectiveWeapon} sinks deep beneath the crude breastplate with brutal efficiency. As the brute thuds heavily onto the flagstones, ${pName} wrenches the blade free, scanning the corridor for more of the pack.`,
                    `Funneling the screeching orc into the narrow archway, ${pName} denies the beast room to swing its rusted cleaver. A disciplined, bone-shattering thrust punches through mail and sinew, dropping the defiler cold into the dust before its guttural war-cry could echo.`,
                    `The clash of steel rings harsh against the ancient masonry! Sidestepping the orc's vicious lunge, ${pName} delivers a crushing counter-blow that snaps the creature's guard and sends it sprawling lifeless across the blood-slicked stones.`,
                    `With cold, merciless focus, ${pName}'s ${effectiveWeapon} flashes through the torchlit gloom, severing the orc's advance in mid-stride. Black ichor spatters the wall as the foul minion of the ancient deeps crumples into an unmoving heap.`
                ];
                prose = orcVariants[turnSeed % orcVariants.length];
            }
        } else if (isVermin) {
            if (isSpellOrDevice) {
                title = ['Incinerated Chitin', 'The Skitterers Purged', 'Arcane Cleansing', 'Scoured by Flame'][turnSeed % 4];
                const verminSpellVariants = [
                    `A blazing bolt of mystic force strikes the venomous creeper square on its carapace! Chitin shatters into smoking embers as arcane fire incinerates fangs and venom sacs in a flash of bright light.`,
                    `With a crack of elemental power, ${pName} blasts the skittering monstrosity into scorched fragments, leaving the dungeon passage smelling of burnt sulfur.`,
                    `A burst of searing energy sweeps the floor, cooking the venomous creeper in its shell before it can lunge at greave or boot.`,
                    `Mystic energy courses through the creature's dark limbs, paralyzing and disintegrating the skittering horror upon the cold shale.`
                ];
                prose = verminSpellVariants[turnSeed % verminSpellVariants.length];
            } else {
                title = ['Chitin on the Shale', 'The Crawlers Cleansed', 'Venom Averted', 'Shadows of the Web'][turnSeed % 4];
                const verminVariants = [
                    `With cold revulsion, ${pName} crushes the venomous creeper beneath a vicious strike of ${effectiveWeapon}. Chitin shatters against the subterranean floor, spattering foul ichor across the cracked flags. Kicking the twitching carcass into the gloom, ${pName} checks boots and greaves, ensuring no lingering venom breached the armor.`,
                    `A sickening crunch echoes through the passage as ${pName}'s ${effectiveWeapon} smashes into the skittering horror. The creature's jagged mandibles snap convulsively in empty air before curling motionless upon the damp rock.`,
                    `Anticipating the sudden venomous lunge, ${pName} sidesteps and brings ${effectiveWeapon} down with shearing force. The skittering monstrosity is split from carapace to stinger, neutralizing the venomous threat in an instant.`,
                    `Darting fangs scrape harmlessly against greaves as ${pName} steps forward with grim finality, grinding the subterranean creeper into the dust with a decisive, heavy blow.`
                ];
                prose = verminVariants[turnSeed % verminVariants.length];
            }
        } else if (isUndead) {
            if (isSpellOrDevice) {
                title = ['Radiant Banishment', 'The Holy Flare', 'Purified in Light', 'Dissolution of the Grave-Chill'][turnSeed % 4];
                const undeadSpellVariants = [
                    `A brilliant sphere of sacred light detonates against the restless remains! The dark necromancy binding the desiccated frame shatters instantly; holy fire consumes the unholy abomination, leaving only blessed stillness and purified dust upon the flagstones.`,
                    `Channeling the radiance of the celestial heights, ${pName} bathes the crypt in incandescent glow. The walking curse dissolves with an ethereal shriek, liberated at last from the eternal shadow.`,
                    `A searing beam of holy energy pierces the freezing gloom! The blue corpse-fire in its hollow eye-sockets is snuffed out by pure luminescence, turning dry bones into harmless ash.`,
                    `Speaking words of ancient benediction, ${pName} unleashes a wave of purifying warmth that thaws the grave-chill and banishes the restless shade forever.`
                ];
                prose = undeadSpellVariants[turnSeed % undeadSpellVariants.length];
            } else {
                title = ['Banishment of the Grave-Chill', 'Peace to the Desecrated', 'Rest for the Fallen', 'Light in the Crypt'][turnSeed % 4];
                const undeadVariants = [
                    `The sepulchral chill recedes as ${pName}'s blow shatters the dark necromancy binding the restless remains. Bone and brittle armor collapse into harmless dust upon the stones. Whispering an ancient ward of peace, ${pName} turns aside from the scattered fragments, hoping the tortured spirit finally passes beyond the eternal shadows.`,
                    `With righteous fervor, ${pName}'s ${effectiveWeapon} strikes straight through the hollow ribcage of the abomination. The malignant blue fire flickering in its sunken eye-sockets dies with an eerie wail, leaving only ancient, brittle dust upon the cold flagstones.`,
                    `As the desiccated claws reach out to drain mortal warmth, ${pName} cleaves through the withered sinew. The unholy ward collapses in an instant, liberating the long-imprisoned spirit from the Enemy's cruel thralldom.`,
                    `A burst of shattered bone and rusted mail rings out against the chamber walls! The walking curse is laid low at last, and the freezing grave-chill that hung in the corridor begins slowly to thaw.`
                ];
                prose = undeadVariants[turnSeed % undeadVariants.length];
            }
        } else if (isTroll) {
            if (isSpellOrDevice) {
                title = ['The Colossus Dissolved', 'Thunderous Spellstrike', 'Stone-Hide Shattered', 'Raw Arcane Might'][turnSeed % 4];
                const trollSpellVariants = [
                    `Channeling a concentrated torrent of mystical energy, ${pName} unleashes a devastating beam that pierces through the troll's petrified flesh! The towering brute roars in agony as magical resonance shatters its stone-like hide, tumbling the immense beast lifeless to the earth.`,
                    `Superheated arcane fire engulfs the massive colossus! The creature's regenerative flesh blazes out of control; with an earth-shaking bellow that shakes dust from the ceiling arches, the brute crashes into the stone.`,
                    `A thunderous detonation of sorcery blasts through the giant's club and chest alike! The monster stumbles backward on shattered legs, crashing down like a felled oak upon the dungeon floor.`,
                    `Weaving an intricate spell of destruction, ${pName} directs a lance of crackling force straight through the brute's armored skull, felling the subterranean terror once and for all.`
                ];
                prose = trollSpellVariants[turnSeed % trollSpellVariants.length];
            } else {
                title = ['The Colossus Falls', 'Shattered Stone-Hide', 'Triumph Over the Brute', 'The Mountain Cleansed'][turnSeed % 4];
                const trollVariants = [
                    `A titanic clash resounds through the vault as ${pName}'s decisive blow penetrates the troll's petrified flesh! The hulking brute crashes to earth with a thud that rattles dust from the ancient ceiling, its massive stone club rolling harmlessly into the dark.`,
                    `Dancing outside the reach of the monster's lumbering fists, ${pName} drives ${effectiveWeapon} deep behind the creature's thick knee-joint. As the giant stumbles with a roaring curse, a follow-through strike severs the thick neck, felling the subterranean terror once and for all.`,
                    `The stone-tough hide shudders under ${pName}'s punishing assault. With an earsplitting roar that shakes the subterranean foundations, the beast topples like an ancient monument felled by lightning, cracking the flagstones beneath its immense bulk.`,
                    `Patience and steel outmatch brute savagery: ducking beneath a tree-trunk club swing that shatters a stone pillar, ${pName} counters with lethal precision, burying the blade to the hilt in the brute's chest.`
                ];
                prose = trollVariants[turnSeed % trollVariants.length];
            }
        } else if (isDragon) {
            if (isSpellOrDevice) {
                title = ['Wrath Against the Wyrm', 'Draconic Ruin', 'The Master\'s Spell'][turnSeed % 3];
                prose = `Through searing heat and blinding sulfur smoke, ${pName} channels an overpowering spear of pure sorcery straight through the wyrm's defenses! The blast detonates against the beast's armored heart, bringing the ancient terror crashing down in a cloud of glowing embers and dying flame.`;
            } else {
                title = ['The Smoldering Wyrm', 'Scale and Fire', 'Echo of the Dragon-Slayers'][turnSeed % 3];
                prose = `Through searing heat and blinding sulfur smoke, ${pName} drives ${effectiveWeapon} into the soft underbelly between the wyrm's gleaming scales. A shriek of draconic agony echoes down the deeps as the beast thrashes in death-spasms, its dying flames casting long, trembling shadows across the vault.`;
            }
        }
        // --- 3. GENERAL COMBAT & ROUTINE FLURRIES ---
        else {
            const numSlain = kills.length || 1;
            if (isSpellOrDevice) {
                title = (numSlain > 1) ? ['Arcane Conflagration', 'Storm of Spellfire', 'The Weave Unleashed', 'Ashes in the Corridor'][turnSeed % 4] : ['Arcane Mastery', 'The Mystic Toll', 'Sorcerous Strike', 'Power of the Unseen'][turnSeed % 4];
                if (numSlain > 1) {
                    const multiSpellVariants = [
                        `A devastating detonation of spellfire illuminates the subterranean vault! The cascading shockwave rips through the enemy ranks, blasting ${kills.length} foes off their feet and leaving only smoking ruins upon the flagstones.`,
                        `Summoning a tempest of arcane power, ${pName} sweeps the corridor with blazing elemental energy. In three dazzling bursts of light, ${kills.length} assailants are incinerated upon the stone.`,
                        `Cascading sheets of magical force scour the doorway! The advancing pack is obliterated before they can cross the threshold, their ashes scattering in the subterranean draft.`,
                        `Raw sorcerous might detonates among the enemy! The blast tears through the front ranks, destroying ${kills.length} foes and restoring silence to the masonry.`
                    ];
                    prose = multiSpellVariants[turnSeed % multiSpellVariants.length];
                } else {
                    const killText = kills[0] || 'A foe fell.';
                    const cleanKill = ChronicleGrounder.extractSlainMonsterName(killText);
                    const singleSpellVariants = [
                        `A precision bolt of arcane power strikes the ${cleanKill} dead in its tracks! The mystical detonation echoes down the corridors as the foe collapses into a smoking heap upon the stones.`,
                        `With an authoritative word of power, ${pName} unleashes a searing lance of magic that pierces straight through the ${cleanKill}'s guard, felling the threat in a brilliant flare of light.`,
                        `Arcane fire engulfs the ${cleanKill} as ${pName}'s incantation strikes home. The creature crumbles lifeless to the floor, leaving the air rich with the scent of ozone.`,
                        `Summoning the hidden energies of the deep, ${pName} blasts the ${cleanKill} into stillness with a devastating release of sorcerous force.`
                    ];
                    prose = singleSpellVariants[turnSeed % singleSpellVariants.length];
                }
            } else if (isRanged) {
                title = (numSlain > 1) ? ['Flurry of Deadly Arrows', 'Hail of Shafts', 'The Quiver\'s Toll', 'Archery in the Vault'][turnSeed % 4] : ['The Deadly Shaft', 'Silent Arrow in the Dark', 'Marksmanship in the Deep', 'A Shot True'][turnSeed % 4];
                if (numSlain > 1) {
                    const multiRangedVariants = [
                        `With rapid, breathless archery, ${pName} looses a flurry of deadly arrows into the oncoming rush. Shafts strike home with uncanny accuracy, felling ${kills.length} foes before they can close the distance.`,
                        `Bowstring singing in rapid succession, ${pName} picks off ${kills.length} assailants from the dark. Each shot drops a foe cold upon the flagstones, breaking the enemy advance.`,
                        `A hail of iron-tipped missiles reaps through the attacking pack. Caught in the open corridor, ${kills.length} foes collapse pierced upon the floor.`
                    ];
                    prose = multiRangedVariants[turnSeed % multiRangedVariants.length];
                } else {
                    const killText = kills[0] || 'A foe fell.';
                    const cleanKill = ChronicleGrounder.extractSlainMonsterName(killText);
                    const singleRangedVariants = [
                        `A well-aimed missile whistles from the gloom, striking the ${cleanKill} dead in its tracks! The creature crashes to the flagstones with the shaft buried deep.`,
                        `With steady hands, ${pName} looses a silent arrow that pierces the ${cleanKill}'s vitals. The foe folds lifeless to the ground before it can take another step.`,
                        `The bowstring hums softly in the shadows: the ${cleanKill} drops motionless onto the damp rock, neutralized by lethal marksmanship from afar.`
                    ];
                    prose = singleRangedVariants[turnSeed % singleRangedVariants.length];
                }
            } else {
                const isUnarmed = archetype === 'unarmed';
                const isBlunt = archetype === 'blunt';
                const isAxe = archetype === 'axe';
                const isPierce = archetype === 'dagger' || archetype === 'polearm_pierce';

                if (numSlain > 1) {
                    if (isUnarmed) {
                        title = ['Brawling Carnage', 'Bare-Knuckle Triumph', 'Fists in the Shadows', 'The Crushed Pack'][turnSeed % 4];
                    } else if (isBlunt) {
                        title = ['Crushing Carnage', 'The Shattered Ranks', 'Hammer and Anvil', 'The Battered Vault'][turnSeed % 4];
                    } else if (isAxe) {
                        title = ['Hewn Asunder', 'The Cleaving Edge', 'Chopped to Pieces', 'Biting Iron'][turnSeed % 4];
                    } else {
                        title = ['Flurry of Decisive Steel', 'The Red Toll', 'Carving a Path', 'The Hall of the Fallen'][turnSeed % 4];
                    }
                    const multiVariants = [
                        isUnarmed
                            ? `Fists hammer through the shadows as ${pName} fells multiple foes in a desperate, bruising flurry of blows. The corridor falls quiet once more, save for the heavy rhythm of breathing and the stinging dust upon bruised knuckles.`
                            : (isBlunt
                                ? `The heavy head of ${effectiveWeapon} crashes through the shadows as ${pName} crushes multiple foes in a brutal flurry of impacts. The corridor falls quiet once more, save for heavy breathing and black ichor spattered upon the iron.`
                                : `Steel flashes in the shadows as ${pName} fells multiple foes in a desperate, fluid flurry of blows. The corridor falls quiet once more, save for the heavy rhythm of breathing and the drip of black blood from ${effectiveWeapon}.`),
                        isUnarmed
                            ? `Surrounded by snapping teeth and reaching claws, ${pName} turns in a ferocious circle of bone-cracking punches. In three rapid, breathtaking blows, the assailants are knocked senseless or broken upon the stones.`
                            : (isBlunt
                                ? `Surrounded by snapping teeth and notched blades, ${pName} swings ${effectiveWeapon} in a ferocious arc. Bone and iron splinter together; in three thunderous impacts, the assailants are battered to the floor.`
                                : `Surrounded by snapping teeth and notched blades, ${pName} turns in a ferocious circle of flashing steel. In three rapid, breathtaking strokes, the assailants are laid low, leaving the vault floor strewn with the fallen.`),
                        `A masterclass of dungeon survival: utilizing the doorway to face the onslaught one at a time, ${pName} methodically dismantles the attacking pack, cutting them down until silence returns to the masonry.`,
                        `The skirmish is swift and bloody. Before the enemy could close their perimeter, ${pName}'s ${effectiveWeapon} reaps through the front rank, scattering the rest into panicked retreat and unmoving corpses.`
                    ];
                    prose = ChronicleGrounder.pickNonRepeatingCombatPhrase(multiVariants, turnSeed);
                } else {
                    const killText = kills[0] || 'A foe fell.';
                    const cleanKill = ChronicleGrounder.extractSlainMonsterName(killText);
                    let singleVariants;
                    if (isUnarmed) {
                        title = ['Bare-Knuckle Smite', 'The Bone-Cracker', 'Unarmed Lethality', 'Brawling Finish'][turnSeed % 4];
                        singleVariants = [
                            `${pName}'s bare fists strike true with bone-cracking momentum, felling the ${cleanKill}! The immediate threat neutralized, ${pName} pauses to catch breath, eyes sweeping the surrounding gloom for flanking ambushes.`,
                            `A swift, punishing counter-blow ends the skirmish! Driving a heavy right cross through the guard of the ${cleanKill}, ${pName} steps over the fallen body, listening intently to the distant echoes of the corridors ahead.`,
                            `Reading the approach of the ${cleanKill} in the flickering torchlight, ${pName} sidesteps and delivers a single, shattering bare-knuckle punch. The dark passage falls silent once more.`,
                            `With calm, raw physical power, ${pName} drives an iron fist through the ${cleanKill}'s guard. Shaking stinging dust from bruised knuckles, the adventurer resumes the perilous descent.`
                        ];
                    } else if (isBlunt) {
                        title = ['Jarring Impact', 'Bone-Crushing Blow', 'The Heavy Smite', 'Shattered Armor'][turnSeed % 4];
                        singleVariants = [
                            `${pName}'s ${effectiveWeapon} strikes true with decisive, bone-shattering momentum, crushing the ${cleanKill}! The immediate threat neutralized, ${pName} pauses to catch breath, eyes sweeping the surrounding gloom for flanking ambushes.`,
                            `A swift, heavy counter-stroke ends the skirmish! Smashing through the guard of the ${cleanKill} with ${effectiveWeapon}, ${pName} steps over the fallen body, listening intently to the distant echoes of the corridors ahead.`,
                            `Reading the approach of the ${cleanKill} in the flickering torchlight, ${pName} sidesteps and brings down a crushing blow of ${effectiveWeapon}. The dark passage falls silent once more.`,
                            `With calm, bone-crushing lethality, ${pName} drives ${effectiveWeapon} through the ${cleanKill}'s guard. Lowering the heavy weapon, the adventurer resumes the perilous descent.`
                        ];
                    } else if (isAxe) {
                        title = ['Cleaving Stroke', 'Hewn in Asunder', 'The Biting Blade', 'Severing Chop'][turnSeed % 4];
                        singleVariants = [
                            `${pName}'s ${effectiveWeapon} strikes true with decisive, cleaving momentum, hewing down the ${cleanKill}! The immediate threat neutralized, ${pName} pauses to catch breath, eyes sweeping the surrounding gloom for flanking ambushes.`,
                            `A swift, deadly counter-chop ends the skirmish! Hacking through the guard of the ${cleanKill} with ${effectiveWeapon}, ${pName} steps over the fallen body, listening intently to the distant echoes of the corridors ahead.`,
                            `Reading the approach of the ${cleanKill} in the flickering torchlight, ${pName} sidesteps and delivers a single, cleaving blow. The dark passage falls silent once more.`,
                            `With calm, chopping lethality, ${pName} drives ${effectiveWeapon} through the ${cleanKill}'s guard. Shaking black blood from the axe head, the adventurer resumes the perilous descent.`
                        ];
                    } else if (isPierce) {
                        title = ['Impaling Strike', 'Gleam of Steel', 'The Lethal Thrust', 'Point Driven Home'][turnSeed % 4];
                        singleVariants = [
                            `${pName}'s ${effectiveWeapon} strikes true with lightning puncturing momentum, impaling the ${cleanKill}! The immediate threat neutralized, ${pName} pauses to catch breath, eyes sweeping the surrounding gloom for flanking ambushes.`,
                            `A swift, deadly counter-thrust ends the skirmish! Piercing cleanly through the guard of the ${cleanKill} with ${effectiveWeapon}, ${pName} steps over the fallen body, listening intently to the distant echoes of the corridors ahead.`,
                            `Reading the approach of the ${cleanKill} in the flickering torchlight, ${pName} sidesteps and delivers a single, fatal thrust. The dark passage falls silent once more.`,
                            `With calm, surgical lethality, ${pName} drives the point of ${effectiveWeapon} through the ${cleanKill}'s guard. Wiping the point clean, the adventurer resumes the perilous descent.`
                        ];
                    } else {
                        title = ['Decisive Strike', 'Clash in the Shadows', 'Steel and Resolve', 'A Peril Neutralized'][turnSeed % 4];
                        singleVariants = [
                            `${pName}'s ${effectiveWeapon} strikes true with decisive, bone-jarring momentum, felling the ${cleanKill}! The immediate threat neutralized, ${pName} pauses to catch breath, eyes sweeping the surrounding gloom for flanking ambushes.`,
                            `A swift, deadly counter-stroke ends the skirmish! Slashing through the guard of the ${cleanKill}, ${pName} steps over the fallen body, listening intently to the distant echoes of the corridors ahead.`,
                            `Reading the approach of the ${cleanKill} in the flickering torchlight, ${pName} sidesteps and delivers a single, fatal blow. The dark passage falls silent once more.`,
                            `With calm, surgical lethality, ${pName} drives ${effectiveWeapon} through the ${cleanKill}'s guard. Wiping the blade clean, the adventurer resumes the perilous descent.`
                        ];
                    }
                    prose = ChronicleGrounder.pickNonRepeatingCombatPhrase(singleVariants, turnSeed);
                }
            }
        }

        return { title, prose };
    }

    /**
     * Extracts and summarizes the character's backstory for new instance intros.
     * Weaves Angband's generated player.history or synthesizes rich race/class heritage.
     */
    static formatBackstorySummary(player) {
        if (!player) return 'a wanderer seeking fortune in the iron shadows';

        // 1. If engine provided real player.history string (from birth), distill it cleanly
        if (player.history && typeof player.history === 'string' && player.history.trim().length > 0) {
            let hist = player.history.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
            // In Angband, history typically reads: "You are the eldest son of a small land owner. You have blue eyes, straight dark brown hair, and an average complexion."
            const match = hist.match(/You are (?:the )?([^.]+?)(?:\.|$)/i);
            if (match && match[1]) {
                const lineage = match[1].trim();
                const physMatch = hist.match(/You have ([^.]+?)(?:\.|$)/i);
                if (physMatch && physMatch[1]) {
                    return `born ${lineage}, marked by ${physMatch[1].trim()}`;
                }
                return `born ${lineage}`;
            }
            if (hist.length > 120) {
                hist = hist.substring(0, 117) + '...';
            }
            return hist;
        }

        // 2. Synthesize race and class heritage lore
        const race = (player.race || 'Human').toLowerCase();
        const pClass = (player.class || 'Warrior').toLowerCase();

        let raceHeritage = 'bearing the enduring blood of mortals';
        if (race.includes('dwarf')) {
            raceHeritage = 'born to the stone-hewn halls of the mountain delvers, sworn to the ancient oaths of Durin';
        } else if (race.includes('high-elf') || race.includes('high elf')) {
            raceHeritage = 'scion of the Firstborn, carrying the starlit sorrow of Gondolin into this mortal age';
        } else if (race.includes('elf')) {
            raceHeritage = 'child of the ancient woodland eaves, attuned to the whisper of rustling leaves and keen starlight';
        } else if (race.includes('hobbit')) {
            raceHeritage = 'hailing from the quiet, bountiful burrows of the Shire, leaving cozy hearth and tea behind for high peril';
        } else if (race.includes('gnome')) {
            raceHeritage = 'born of the secret earthen burrows and ingenious craft-smiths, gifted with clever eyes and swift wit';
        } else if (race.includes('dunadan') || race.includes('dúnadan')) {
            raceHeritage = 'scion of the ancient kings of Westernesse, bearing the noble blood and long shadow of the sea-kings';
        } else if (race.includes('half-orc') || race.includes('half orc')) {
            raceHeritage = 'cast out from the blood-stained mountain tribes, determined to carve out honor and destiny through cold iron';
        } else if (race.includes('half-troll') || race.includes('half troll')) {
            raceHeritage = 'endowed with the massive sinew and fearsome endurance of stone-carved stock, unyielding under pain';
        } else if (race.includes('kobold')) {
            raceHeritage = 'nurtured in the suffocating damp of dark caverns, sharp-eyed and venom-wary';
        }

        let classTraining = 'disciplined in the art of the blade';
        if (pClass.includes('mage')) {
            classTraining = 'steeped in ancient cantrips and the lost lore of the unseen';
        } else if (pClass.includes('priest')) {
            classTraining = 'anointed with holy prayers and prayers of steadfast light';
        } else if (pClass.includes('rogue')) {
            classTraining = 'blessed with silent tread, deft fingers, and a ruthless eye for unseen shadows';
        } else if (pClass.includes('ranger')) {
            classTraining = 'hardened by bitter nights on the track of fell beasts across the untamed wilderness';
        } else if (pClass.includes('paladin')) {
            classTraining = 'bound by solemn oath to smite the shadow and shield the innocent';
        } else if (pClass.includes('warrior')) {
            classTraining = 'hardened through grueling drill in sword-work, heavy armor, and shield defence';
        }

        return `${raceHeritage}, ${classTraining}`;
    }

    /**
     * Resolves diegetic shopkeeper personality, voice, and tactical gameplay advice for items.
     * Keeps spoken dialogue barks punchy (<25 words) for minimal neural TTS latency.
     */
    static resolveShopkeeperItemHint(rawItem, storeName = 'General Store') {
        const item = (rawItem || '').toLowerCase();
        const store = (storeName || '').toLowerCase();

        // 1. Resolve Shopkeeper Identity & Voice Profile
        let keeper = {
            name: 'Bilbo the Merchant',
            race: 'hobbit',
            class: 'merchant',
            voice: 'en-US-RogerNeural',
            geminiVoice: 'Enceladus',
            directorNote: 'A warm, grandfatherly shopkeeper sharing seasoned adventuring wisdom'
        };

        if (store.includes('alchem')) {
            keeper = {
                name: 'Maulin the Alchemist',
                race: 'gnome',
                class: 'alchemist',
                voice: 'en-US-GuyNeural',
                geminiVoice: 'Puck',
                directorNote: 'An eccentric, precise gnome herbalist explaining medicinal concoctions'
            };
        } else if (store.includes('temple')) {
            keeper = {
                name: 'Father Kael',
                race: 'human',
                class: 'priest',
                voice: 'en-GB-RyanNeural',
                geminiVoice: 'Charon',
                directorNote: 'A solemn, devout priest giving sacred counsel'
            };
        } else if (store.includes('armour') || store.includes('armory')) {
            keeper = {
                name: 'Elephar the Armorer',
                race: 'dwarf',
                class: 'armorer',
                voice: 'en-US-RogerNeural',
                geminiVoice: 'Algenib',
                directorNote: 'A burly dwarven armorer appraising protective gear'
            };
        } else if (store.includes('weapon')) {
            keeper = {
                name: 'Thurg the Bladesmith',
                race: 'dwarf',
                class: 'weaponsmith',
                voice: 'en-US-RogerNeural',
                geminiVoice: 'Algenib',
                directorNote: 'A gruff weapon-master giving practical martial advice'
            };
        } else if (store.includes('magic')) {
            keeper = {
                name: 'Eldred the Wizard',
                race: 'human',
                class: 'wizard',
                voice: 'en-GB-ThomasNeural',
                geminiVoice: 'Orus',
                directorNote: 'An austere, scholarly wizard advising on arcane scrolls and rods'
            };
        } else if (store.includes('black market')) {
            keeper = {
                name: 'Lotho the Shady Fence',
                race: 'hobbit',
                class: 'rogue',
                voice: 'en-US-EricNeural',
                geminiVoice: 'Zephyr',
                directorNote: 'A whispering, opportunistic street fence giving clandestine advice'
            };
        }

        let dialogue = `"May that purchase serve you well beneath the earth. Keep your wits sharp and your back to the wall, adventurer."`;
        let insight = `Carefully inspect newly acquired equipment. Gold spent in town prepares you for the depths.`;

        if (item.includes('torch')) {
            dialogue = `"Mind the dark, traveller! A torch illuminates one pace around you for four thousand turns. Never let it gutter out when orcs prowl near!"`;
            insight = `Wooden Torches cast light in a 1-tile radius. Carry 2–3 spares so you are never left in magical darkness.`;
        } else if (item.includes('lantern')) {
            dialogue = `"A fine brass lantern! It casts light two paces out—double the reach of torches. Remember to refill it with oil flasks using 'F'!"`;
            insight = `Brass Lanterns illuminate a 2-tile radius. Refill using 'F' with flasks of oil before the light expires.`;
        } else if (item.includes('oil') || item.includes('flask')) {
            dialogue = `"Good fuel for your lantern! In desperate straits, you can also fling an open flask across the hallway to scorch pursuing vermin!"`;
            insight = `Flasks of oil refill lanterns ('F') or can be thrown at enemies as improvised incendiaries.`;
        } else if (item.includes('food') || item.includes('ration') || item.includes('bread') || item.includes('meat')) {
            dialogue = `"Never venture below hungry! Starvation halts natural healing and slows your limbs. Eat with 'E' the moment hunger gnaws at your belly."`;
            insight = `Food rations maintain your nourishment. Starvation severely impairs health regeneration and movement speed.`;
        } else if (item.includes('spike')) {
            dialogue = `"A rogue's secret: strike 'j' to jam an iron spike beneath a closed door. It locks pursuing trolls out while you rest to recover mana!"`;
            insight = `Press 'j' to jam closed doors with iron spikes, creating secured resting rooms to heal safely.`;
        } else if (item.includes('shovel') || item.includes('pick') || item.includes('mattock') || item.includes('digger')) {
            dialogue = `"Veins of quartz and magma glitter with gold! Dig into walls to extract treasures, or carve a narrow one-tile bottleneck against hordes!"`;
            insight = `Picks and shovels excavate mineral veins for gold and carve 1-tile choke points in dungeon corridors.`;
        } else if (item.includes('cure serious') || item.includes('cure critical') || item.includes('cure mortal')) {
            dialogue = `"Drink with 'q' when iron bites deep! Serious and Critical draughts heal wounds, and immediately cure blindness and confusion!"`;
            insight = `Potions of Cure Serious/Critical Wounds restore HP and instantly cure blindness and confusion.`;
        } else if (item.includes('cure light')) {
            dialogue = `"A modest tonic for cuts and scrapes. Quaff with 'q' to patch minor wounds, though stronger draughts are needed for deep trauma."`;
            insight = `Cure Light Wounds patches minor cuts and bleeding. Upgrade to Serious or Critical draughts for status healing.`;
        } else if (item.includes('restore') || item.includes('restoration') || item.includes('life')) {
            dialogue = `"Wights and wraiths will drain your vital experience and wither your attributes. Keep a restoration flask ready so you fight with full strength!"`;
            insight = `Potions of Restoration restore drained statistics (STR/INT/WIS/DEX/CON/CHR) and life levels drained by undead.`;
        } else if (item.includes('speed')) {
            dialogue = `"Liquid lightning! Gulping this grants +10 haste—you move twice for every breath your foes take. Save it for Unique horrors!"`;
            insight = `Potions of Speed grant +10 temporary speed, doubling your actions per enemy turn. Crucial for boss encounters.`;
        } else if (item.includes('heroism') || item.includes('berserk')) {
            dialogue = `"A true warrior's draught! It steels your mind against terror, grants bonus lifeblood, and sharpens your weapon accuracy!"`;
            insight = `Heroism and Berserk potions grant fear immunity, bonus temporary HP, and boost melee hit chance.`;
        } else if (item.includes('phase door')) {
            dialogue = `"A true lifesaver! Reading this with 'r' blinks you ten paces away. Read it when cornered to break line-of-sight and heal behind pillars!"`;
            insight = `Scrolls of Phase Door teleport you 10 tiles away instantly, breaking enemy melee surround and breath trajectories.`;
        } else if (item.includes('teleport')) {
            dialogue = `"Flings you across the entire dungeon floor! When ancient dragons or demon pits surround you, don't gamble—read it and vanish!"`;
            insight = `Scrolls of Teleportation jump you across the dungeon level, escaping otherwise fatal ambushes.`;
        } else if (item.includes('recall')) {
            dialogue = `"Mind an elder's warning: Word of Recall takes fifteen to twenty turns to activate! Do not wait until you are near death—read it early!"`;
            insight = `Scroll of Word of Recall has a delayed activation (15–25 turns). Read it early when facing perilous vaults!`;
        } else if (item.includes('identify')) {
            dialogue = `"Never wield an unknown relic in the dark—some harbor foul curses! Read runes of identify with 'r' to reveal hidden slays and enchants."`;
            insight = `Scrolls of Identify reveal ego slays, stat bonuses, and curses on unidentified equipment.`;
        } else if (item.includes('dagger') || item.includes('sword') || item.includes('blade') || item.includes('rapier') || item.includes('scimitar')) {
            dialogue = `"A sharp blade! Keep it dry and clean. High dexterity lets you strike multiple blows per turn with agile weapons."`;
            insight = `High dexterity and strength increase the number of blows struck per turn with melee weapons.`;
        } else if (item.includes('bow') || item.includes('arrow') || item.includes('sling') || item.includes('crossbow') || item.includes('bolt')) {
            dialogue = `"Strike from a distance! Fire with 'f' to fell charging trolls and sleeping orcs before they ever close to melee range."`;
            insight = `Press 'f' to fire missiles. Ranged combat eliminates dangerous enemies before they reach striking distance.`;
        } else if (item.includes('boot') || item.includes('cloak') || item.includes('shield') || item.includes('helm') || item.includes('armor') || item.includes('armour') || item.includes('mail')) {
            dialogue = `"Sturdy protection! Every point of armor class turns aside blades and claws. Just mind your pack weight to maintain full agility."`;
            insight = `Armor Class reduces enemy hit chances. Watch your total inventory weight to avoid speed penalties.`;
        } else if (item.includes('book') || item.includes('prayer') || item.includes('tome') || item.includes('grimoire')) {
            dialogue = `"Study sacred incantations with care using 'm' or 'p'. Guard your mana pool—exhausting your spirit leaves you helpless in the dark."`;
            insight = `Study spells ('m') and prayers ('p') from spellbooks in your pack. Rest ('R') to restore depleted mana.`;
        }

        return { keeper, dialogue, insight };
    }

    /**
     * Offline Procedural Lore Synthesizer:
     * Generates atmospheric, race-attuned, rule-based Tolkien prose without needing any cloud API or AI model.
     * Guarantees 0ms latency and 100% reliability everywhere.
     */
    static generateProceduralChapter(event, player, traditionKey = 'westmarch') {
        const rk = (typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
        const isJpHeng = (rk === 'hengband' && typeof window !== 'undefined' && window.__langMode === 'jp');
        const tradition = this.TRADITIONS[traditionKey] || this.TRADITIONS.westmarch;
        const name = (player && player.name) ? player.name : (isJpHeng ? '放浪の武芸者' : 'The Wanderer');
        const race = (player && player.race) ? player.race : (isJpHeng ? '武人' : 'Hero');
        const depth = (player && typeof player.depth === 'number') ? player.depth : (event.data && typeof event.data.depth === 'number' ? event.data.depth : 0);
        const depthFt = `${depth * 50}ft`;
        const rawWeap = (player && player.weapon_item) ? player.weapon_item : ((player && player.equipped && player.equipped.weapon) ? player.equipped.weapon : null);
        const weapon = rawWeap ? rawWeap.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim() : (isJpHeng ? '己の拳' : 'bare fists');
        const bow = (player && player.bow_item) ? player.bow_item.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim() : null;
        const quiver = (player && player.quiver_item) ? player.quiver_item.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim() : null;

        if (isJpHeng) {
            const foe = (event && event.data && (event.data.monster || event.data.target || event.data.foe)) || '妖魔';
            let jpTitle = '深淵の残響';
            let jpProse = `${name}は地下${depth}階（${depthFt}）の闇を進み、${weapon}を構えて気配を探る。`;
            let jpInsight = '狭い通路に敵を誘い込み、一対一の勝負に持ち込むべし。';
            if (event && event.type === 'HERO_DEATH') {
                const diedFrom = (event.data && event.data.diedFrom) || '致命傷';
                jpTitle = `墓碑銘：${name}の最期`;
                jpProse = `無念なり——${name}は${depth === 0 ? '城下町' : `地下${depth}階`}にて${diedFrom}により倒れた。されどその武勇は五輪の年代記に永く刻まれん。`;
                jpInsight = '死もまた修行の一歩なり。次なる転生にて雪辱を果たせ。';
            } else if (event && event.type === 'ONBOARDING_TOWN_ARRIVAL') {
                jpTitle = '城下町への出立';
                jpProse = `${name}は変愚蛮怒の城下町に立つ。深淵へ降りる前に雑貨屋（1）で松明と食料を整えよ。`;
                jpInsight = '『1』の入り口を踏んで雑貨屋へ入り、松明と食料を買い求めよ。';
            } else if (event && (event.type === 'BOSS_KILL' || event.type === 'MONSTER_KILL' || event.type === 'COMBAT_EXCHANGE')) {
                jpTitle = `${foe}との死闘`;
                jpProse = `${name}は${weapon}を一閃させ、立ち塞がる${foe}を斬り伏せた。`;
            }
            return {
                id: 'ch_' + Date.now() + '_' + ((player && player.turn) || 0),
                timestamp: new Date().toISOString(),
                turn: (player && player.turn) || 0,
                depth,
                eventType: (event && event.type) || 'EXPLORATION',
                tradition: tradition.name,
                title: jpTitle,
                prose: jpProse,
                summary: jpTitle,
                dialogue: null,
                insight: jpInsight,
                isProcedural: true
            };
        }

        let title = 'Echoes in the Deep';
        let prose = '';
        let dialogue = null;
        let insight = null;

        switch (event.type) {
            case 'HERO_DEATH': {
                const heroName = (event.data && event.data.hero) ? event.data.hero : name;
                const diedFrom = (event.data && event.data.diedFrom) ? event.data.diedFrom : (player && player.died_from) ? String(player.died_from).trim() : 'mortal wounds';
                const pRace = (event.data && event.data.race) ? event.data.race : (player ? player.race || '' : '');
                const pClass = (event.data && event.data.class) ? event.data.class : (player ? player.class || '' : '');
                const raceClass = `${pRace} ${pClass}`.trim() || 'Hero';
                const locDesc = (depth === 0) ? 'upon the surface frontier' : `deep at ${depthFt}`;
                title = `Epitaph: Fall of ${heroName}`;

                if (traditionKey === 'khazad') {
                    prose = `The great hammer shatters, and the dark mountain roots claim another child of Durin. Here falls ${heroName}, valiant ${raceClass}, brought low ${locDesc} by ${diedFrom}. May the ancestors carve their honor into the enduring granite, and grant solemn rest beneath the roots of the world.`;
                } else if (traditionKey === 'noldor') {
                    prose = `A song of deep sorrow rises toward the starry vault of heaven. ${heroName}, noble ${raceClass}, has perished ${locDesc}, vanquished by ${diedFrom}. The shadow of Morgoth lengthens across the deep, but the memory of their courage shall never fade from the Living Chronicle.`;
                } else {
                    prose = `Here falls ${heroName}, brave ${raceClass}, slain ${locDesc} by ${diedFrom}. The torch flickers and dies upon the damp subterranean stone, yet their deeds and valor are sealed into the annals of the Living Chronicle for all ages.`;
                }
                insight = "Death is not the end in Angband—every fall sharpens the wisdom of the next adventurer. Rest thy weary blade, mortal.";
                break;
            }

            case 'ONBOARDING_TOWN_ARRIVAL': {
                title = 'Arrival at the Frontier';
                const backstory = ChronicleGrounder.formatBackstorySummary(player);
                if (traditionKey === 'khazad') {
                    prose = `${name} of the Seven Houses—${backstory}—stands upon the frontier above the Iron Hell. Before delving into the mountain roots, visit the General Store ('1') for torches and oil; an unprepared dwarf shames his ancestors.`;
                } else if (traditionKey === 'noldor') {
                    prose = `The bitter frontier wind sighs as ${name}—${backstory}—pauses upon the precipice of Angband. Before descending into the Enemy's shadows, hasten to the town stores ('1') to stock light and sustaining draughts.`;
                } else {
                    prose = `Welcome to the frontier of Angband, ${name}. ${backstory}, you stand at the threshold of the abyss. Before taking the iron stairs down ('>'), visit the General Store ('1') for torches and oil; in the dark below, forethought is your truest shield.`;
                }
                insight = "Press '1' to enter the General Store. Purchase torches ('p') and rations before descending.";
                break;
            }

            case 'ONBOARDING_FIRST_DESCENT': {
                title = 'Crossing the Threshold';
                const backstory = ChronicleGrounder.formatBackstorySummary(player);
                prose = `The iron stairs groan behind as ${name}—${backstory}—crosses the threshold into fifty feet. Ancient subterranean shadows press close against the flickering torchlight, reeking of damp stone, sulfur, and watchful eyes.`;
                insight = "The Golden Rule: Never fight in the center of rooms. Step back into narrow 1-tile doorways!";
                break;
            }

            case 'TAVERN_RESPITE': {
                title = 'The Tavern Hearth';
                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + (name ? name.length * 19 : 0));
                const tavernOptions = [
                    `The iron cellar-doors of the deep slam shut, and the biting mountain air fills ${name}'s lungs. Stumbling into the warmth of the town tavern with boots caked in deep-dust and a pack heavy with spoils, the murmur of the patrons falls into hushed reverence.`,
                    `Ascending from the dark abyss into the bitter frontier breeze, ${name} pushes open the oak timber doors of the tavern. Battered armor and notched steel bear witness to the trials below, drawing respectful nods from seasoned mercenaries as peat smoke and golden firelight banish the subterranean cold.`,
                    `Leaving the harrowing terrors of the deep pit behind, ${name} steps across the threshold of the frontier inn. Shaking the subterranean grime from cloak and gear, the warmth of the hearth and the aroma of roasted boar offer hard-earned solace to a weary soul.`
                ];
                prose = tavernOptions[turnSeed % tavernOptions.length];
                insight = "Visit Alchemy Shop '5' to replenish Potions of Cure Critical Wounds and Restore Life Levels.";
                break;
            }

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

                const bText = ChronicleGrounder.pickNonRepeatingBark('chap_beg_bark', [
                    `Alms, traveler? One copper bit for bread!`,
                    `The wind freezes my old bones, ${bPronouns.honorific}—spare a crust!`,
                    `Just a penny for warm tavern broth, kind soul!`,
                    `I once bore steel into the pit too, before the dark broke me.`,
                    `Spare a copper so I might sleep beneath dry timbers tonight!`,
                    `Bless your journey—never descend those iron steps without three torches!`,
                    `A crust or a copper bit, traveler? Hunger gnaws sharper than frost.`,
                    `May the High Powers guard your shield if you spare a coin!`
                ], bEnc + (player ? player.turn || 0 : 0));

                prose = ChronicleGrounder.pickNonRepeatingBark('chap_beg_prose', [
                    `A ${bMon} hobbles forward, extending a trembling, grime-caked hand toward ${name}.`,
                    `Shivering in tattered wool, the ${bMon} bows low and pleads in a dry whisper.`,
                    `Huddled by the damp timber wall, the ${bMon} reaches out with hollow eyes.`,
                    `Rattling a dented tin bowl, the ${bMon} steps into ${name}'s lantern light.`,
                    `Leaning on a knotted staff, the ${bMon} murmurs a plea from the cold cobbles.`
                ], bEnc);
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

                const iText = ChronicleGrounder.pickNonRepeatingBark('chap_insult_bark', [
                    `The first cave orc you meet will feed your ears to the hounds!`,
                    `Think that shiny blade makes you a hero, greenhorn?`,
                    `Keep a hand on your hilt, pup—hesitate down there and you're dead!`,
                    `Swaggering with that toy weapon? The deep levels chew up fools!`,
                    `Head back to the tavern, runt—you haven't the stomach for the dark!`,
                    `Place your bets, boys—another fresh delver marching to a shallow grave!`,
                    `Polished boots and untested mail! The rats below will feast tonight!`,
                    `Mind where you step, rookie, or leave your purse at the stairs!`
                ], iEnc + (player ? player.turn || 0 : 0));

                prose = ChronicleGrounder.pickNonRepeatingBark('chap_insult_prose', [
                    `The ${iPronouns.veteranTitle} spits on the flagstones, resting a hand on ${iPronouns.his} pommel.`,
                    `Leaning against the tavern wall, the ${iPronouns.veteranTitle} eyes ${name}'s gear with a smirk.`,
                    `Blocking the lane, the ${iPronouns.soldier} laughs in harsh, seasoned derision.`,
                    `Thumb hooked in ${iPronouns.his} belt, the ${iPronouns.veteranTitle} sizes ${name} up with open scorn.`,
                    `Sharpening a notched dagger, the ${iPronouns.soldier} jeers as ${name} strides past.`
                ], iEnc);
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

                const tText = ChronicleGrounder.pickNonRepeatingBark('chap_theft_bark', [
                    `A fair toll for my alley, fool—I'll take that silver!`,
                    `Your purse hung far too loose, traveler!`,
                    `Faster hands make richer pockets—catch me if you can!`,
                    `A little guild donation! You weren't spending it anyway!`,
                    `Thanks for the coin—I'll drink an ale to your health tonight!`,
                    `Mind your belt next time, slowpoke!`,
                    `Too easy! Keep your eyes on your pouch in this town!`,
                    `Silver weighs a delver down—I'm doing you a favor!`
                ], tEnc + (player ? player.turn || 0 : 0));

                prose = `With a quick flick of steel, the ${tPronouns.person} cuts ${name}'s purse-strings and darts into the mist!`;
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

            case 'COMBAT_EXCHANGE': {
                const exData = event.data || {};
                const inAttacks = exData.incomingAttacks || [];
                const hAttacks = exData.heroAttacks || [];
                const kills = exData.kills || [];
                const statuses = exData.playerStatuses || [];
                const inTown = exData.inTown || (depth === 0);

                const atkMed = exData.attackMedium || (hAttacks[0] && hAttacks[0].attackMedium) || null;
                const method = (atkMed && atkMed.method) ? atkMed.method : ((atkMed && atkMed.type === 'spell') ? 'spell' : ((atkMed && atkMed.type === 'ranged') ? 'shoot' : ((atkMed && atkMed.type === 'device') ? 'device' : 'strike')));
                const isSpell = method === 'spell' || (atkMed && atkMed.type === 'spell');
                const isRanged = method === 'shoot' || (atkMed && atkMed.type === 'ranged');
                const isDevice = method === 'device' || (atkMed && atkMed.type === 'device');
                const weaponArchetype = (atkMed && atkMed.archetype) ? atkMed.archetype : (weapon.toLowerCase() === 'bare fists' ? 'unarmed' : 'blade');
                const spellElem = (atkMed && atkMed.element) ? atkMed.element : 'arcane';
                const spellName = (atkMed && atkMed.name) ? atkMed.name : 'incantation';
                const devType = (atkMed && atkMed.deviceType) ? atkMed.deviceType : 'wand';
                const devName = (atkMed && atkMed.name) ? atkMed.name : devType;
                const launcherName = (atkMed && atkMed.name && method === 'shoot') ? atkMed.name : (bow || 'bow');
                const ammoName = (atkMed && atkMed.ammo) ? atkMed.ammo : (quiver || 'arrow');

                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + (depth * 31) + (kills.length * 7));

                // Contextual Title Generation
                if (isSpell) {
                    const spellTitles = {
                        fire: kills.length > 0 ? (kills.length > 1 ? 'Blazing Infernal Tempest' : 'Searing Flame Strike') : 'Incandescent Burst',
                        cold: kills.length > 0 ? (kills.length > 1 ? 'Glacial Cataclysm' : 'Brittle Frost Shatter') : 'Howling Rime',
                        lightning: kills.length > 0 ? (kills.length > 1 ? 'Chain Lightning Storm' : 'Thunderclap Smite') : 'Blinding Arc',
                        acid: kills.length > 0 ? (kills.length > 1 ? 'Caustic Deluge' : 'Corrosive Dissolution') : 'Hissing Slag',
                        holy: kills.length > 0 ? (kills.length > 1 ? 'Consecrated Wrath' : 'Celestial Smite') : 'Radiant Flare',
                        arcane: kills.length > 0 ? (kills.length > 1 ? 'Arcane Conflagration' : 'Searing Spellfire') : 'Eldritch Clash'
                    };
                    title = spellTitles[spellElem] || 'Arcane Clash';
                } else if (isDevice) {
                    title = kills.length > 0 ? (kills.length > 1 ? 'Runic Conflagration' : `Lethal ${devType.charAt(0).toUpperCase() + devType.slice(1)} Discharge`) : `Channel of the ${devType.charAt(0).toUpperCase() + devType.slice(1)}`;
                } else if (isRanged) {
                    if (weaponArchetype === 'crossbow') {
                        title = kills.length > 0 ? (kills.length > 1 ? 'Volley of Steel Bolts' : 'Deadly Arbalest Shot') : 'Snapping Steel';
                    } else if (weaponArchetype === 'sling') {
                        title = kills.length > 0 ? (kills.length > 1 ? 'Hail of Lead Shot' : 'Crushing Slingstone') : 'Whistling Leather';
                    } else {
                        title = kills.length > 0 ? (kills.length > 1 ? 'Flurry of Arrows' : 'Deadly Marksmanship') : (inTown ? 'Shaft from the Alley' : 'Shot in the Dark');
                    }
                } else {
                    if (weaponArchetype === 'blunt') {
                        title = kills.length > 0 ? (kills.length > 1 ? 'Crushing Carnage' : 'Jarring Impact') : 'Clash of Iron';
                    } else if (weaponArchetype === 'axe') {
                        title = kills.length > 0 ? (kills.length > 1 ? 'Hewn to Asunder' : 'Cleaving Stroke') : 'Biting Iron';
                    } else if (weaponArchetype === 'dagger' || weaponArchetype === 'polearm_pierce') {
                        title = kills.length > 0 ? (kills.length > 1 ? 'Lethal Thrusts' : 'Impaling Strike') : 'Gleam of Steel';
                    } else if (weaponArchetype === 'unarmed') {
                        title = kills.length > 0 ? (kills.length > 1 ? 'Brawling Carnage' : 'Bone-Cracking Fist') : 'Bare-Knuckle Brawl';
                    } else {
                        title = kills.length > 0 ? (kills.length > 1 ? 'Flurry of Steel' : 'Decisive Strike') : (inTown ? 'Street Skirmish' : 'Clash in the Deep');
                    }
                }

                // 1. Status Clause (e.g. confused, poisoned, blind, stunned, terrified, bleeding)
                let statusPrefix = '';
                if (statuses.length > 0) {
                    const st = statuses[0].toLowerCase();
                    if (st.includes('confus')) statusPrefix = 'Reeling from dizzy confusion, ';
                    else if (st.includes('poison') || st.includes('sick')) statusPrefix = 'With burning venom seeping into your veins, ';
                    else if (st.includes('blind')) statusPrefix = 'Striking blind into the darkness, ';
                    else if (st.includes('stun')) statusPrefix = 'Rattled by a staggering blow, ';
                    else if (st.includes('paralyz')) statusPrefix = 'Straining against stiffening limbs, ';
                    else if (st.includes('terrifi') || st.includes('panic')) statusPrefix = 'Fighting down cold panic, ';
                    else if (st.includes('bleed')) statusPrefix = 'Bleeding from torn armor, ';
                }

                // 2. Incoming Attack Summary
                let incomingText = '';
                if (inAttacks.length === 1) {
                    const ia = inAttacks[0];
                    const act = (ia.action || 'hits').toLowerCase();
                    if (act.includes('bite')) {
                        incomingText = `the ${ia.monsterName} lunges with bared fangs`;
                    } else if (act.includes('claw')) {
                        incomingText = `the ${ia.monsterName} rakes downward with savage claws`;
                    } else if (act.includes('crush') || act.includes('bash')) {
                        incomingText = `the ${ia.monsterName} brings down a crushing blow against your guard`;
                    } else if (act.includes('slash')) {
                        incomingText = `the ${ia.monsterName} slashes viciously at your flank`;
                    } else if (act.includes('shoot')) {
                        incomingText = `the ${ia.monsterName} looses a deadly projectile from the shadows`;
                    } else if (act.includes('breath')) {
                        incomingText = `the ${ia.monsterName} exhales a searing blast of ruin`;
                    } else if (act.includes('cast')) {
                        incomingText = `the ${ia.monsterName} lashes out with a crackling incantation`;
                    } else {
                        incomingText = `the ${ia.monsterName} ${ia.action} you`;
                    }
                } else if (inAttacks.length > 1) {
                    const sameMon = inAttacks.every(a => a.monsterName === inAttacks[0].monsterName);
                    if (sameMon) {
                        const twinPhrases = [
                            `the ${inAttacks[0].monsterName} strikes with rapid twin blows`,
                            `the ${inAttacks[0].monsterName} presses the assault with a relentless flurry of strikes`,
                            `the ${inAttacks[0].monsterName} bears down with fierce consecutive blows`,
                            `the ${inAttacks[0].monsterName} redoubles its assault with furious blows`
                        ];
                        incomingText = (statuses.length > 0) ? twinPhrases[0] : ChronicleGrounder.pickNonRepeatingCombatPhrase(twinPhrases, turnSeed);
                    } else {
                        const mNames = [...new Set(inAttacks.map(a => a.monsterName))];
                        incomingText = `${mNames.slice(0, 2).join(' and the ')} strike you in a coordinated rush`;
                    }
                }

                // 3. Hero Attack & Kill Summary
                let heroText = '';
                if (kills.length > 0) {
                    const killNames = kills.map(k => ChronicleGrounder.extractSlainMonsterName(k));
                    const fleeMon = exData.fleeingMonster;
                    if (fleeMon && kills.length === 1) {
                        const cleanFlee = ChronicleGrounder.extractSlainMonsterName(fleeMon);
                        if (isSpell) {
                            const fleeSpellElemText = spellElem === 'fire' ? 'a roaring lance of flame' : (spellElem === 'cold' ? 'a howling blast of freezing rime' : (spellElem === 'lightning' ? 'a jagged bolt of blue-white voltage' : (spellElem === 'acid' ? 'a hissing stream of caustic acid' : (spellElem === 'holy' ? 'a blinding shaft of celestial starlight' : 'a concentrated blast of azure spellfire'))));
                            heroText = `pursuing the fleeing ${cleanFlee}, ${fleeSpellElemText} blasts the craven creature down before it can escape`;
                            ChronicleGrounder.recordCombatVerb('blasts');
                        } else if (isDevice) {
                            heroText = `pursuing the fleeing ${cleanFlee}, a lethal ray from your ${devName} blasts the craven creature down before it can escape`;
                            ChronicleGrounder.recordCombatVerb('blasts');
                        } else if (isRanged) {
                            if (weaponArchetype === 'crossbow') {
                                heroText = `pursuing the fleeing ${cleanFlee}, a heavy steel quarrel from your ${launcherName} punches through its spine before it can escape`;
                                ChronicleGrounder.recordCombatVerb('punches');
                            } else if (weaponArchetype === 'sling') {
                                heroText = `pursuing the fleeing ${cleanFlee}, a whistling lead shot from your ${launcherName} fractures its skull before it can escape`;
                                ChronicleGrounder.recordCombatVerb('fractures');
                            } else {
                                heroText = `pursuing the fleeing ${cleanFlee}, a well-aimed ${ammoName} from your ${launcherName} pins the craven creature down before it can escape`;
                                ChronicleGrounder.recordCombatVerb('pins');
                            }
                        } else {
                            if (weaponArchetype === 'blunt') {
                                heroText = `pursuing the fleeing ${cleanFlee}, your ${weapon} crashes down upon its back with bone-shattering force before it can escape`;
                                ChronicleGrounder.recordCombatVerb('crashes');
                            } else if (weaponArchetype === 'axe') {
                                heroText = `pursuing the fleeing ${cleanFlee}, a sweeping hew of your ${weapon} severs its stride and fells the craven creature upon the stones`;
                                ChronicleGrounder.recordCombatVerb('severs');
                            } else if (weaponArchetype === 'dagger') {
                                heroText = `sprinting after the fleeing ${cleanFlee}, you slip ${weapon} deep between its ribs from behind, silencing its panic forever`;
                                ChronicleGrounder.recordCombatVerb('slips');
                            } else if (weaponArchetype === 'polearm_pierce') {
                                heroText = `lunging forward with lethal reach, your ${weapon} impales the fleeing ${cleanFlee} through the flank, pinning it to the flagstones`;
                                ChronicleGrounder.recordCombatVerb('impales');
                            } else if (weaponArchetype === 'unarmed') {
                                heroText = `surging after the fleeing ${cleanFlee}, you tackle the wretch to the flagstones and drive a brutal fist into its temple`;
                                ChronicleGrounder.recordCombatVerb('pummels');
                            } else {
                                heroText = `pursuing the fleeing ${cleanFlee}, your ${weapon} cuts the craven creature down before it can escape`;
                                ChronicleGrounder.recordCombatVerb('cuts');
                            }
                        }
                    } else if (kills.length === 1) {
                        if (isSpell) {
                            let spellPhrases = [];
                            if (spellElem === 'fire') {
                                spellPhrases = [
                                    `unleashing ${spellName}, a roaring cone of incandescent flame engulfs the ${killNames[0]}, leaving only charred embers upon the floor`,
                                    `your ${spellName} detonates in a blinding flare of heat, incinerating the ${killNames[0]} upon the flagstones`,
                                    `tongues of crackling fire erupt from your hands, reducing the ${killNames[0]} to blackened cinders`,
                                    `a searing conflagration of sorcery consumes the ${killNames[0]} in an instant`
                                ];
                                ChronicleGrounder.recordCombatVerb('incinerates');
                            } else if (spellElem === 'cold') {
                                spellPhrases = [
                                    `channeling ${spellName}, a howling gale of frost flash-freezes the ${killNames[0]}, its brittle form shattering across the stones`,
                                    `crystalline rime races along the floor as your ${spellName} pierces the ${killNames[0]} with lethal, numbing cold`,
                                    `a glacial shockwave bursts from your fingertips, encasing the ${killNames[0]} in solid ice before it collapses lifeless`,
                                    `bitter freezing rime chills the marrow of the ${killNames[0]}, dropping the frozen foe upon the flagstones`
                                ];
                                ChronicleGrounder.recordCombatVerb('freezes');
                            } else if (spellElem === 'lightning') {
                                spellPhrases = [
                                    `a deafening thunderclap tears through the corridor as your ${spellName} drives a jagged fork of blue-white voltage through the ${killNames[0]}`,
                                    `blinding arcs of lightning crackle from your hands, electrocuting the ${killNames[0]} with searing electrical fury`,
                                    `an ozone-scented bolt of lightning lances through the dark, dropping the ${killNames[0]} in a shower of sparks`,
                                    `jagged electrical discharge scorches the air, dropping the ${killNames[0]} upon the electrified floor`
                                ];
                                ChronicleGrounder.recordCombatVerb('electrocutes');
                            } else if (spellElem === 'acid') {
                                spellPhrases = [
                                    `a caustic stream from your ${spellName} hisses into the ${killNames[0]}, dissolving hide and bone in a steaming puddle of slag`,
                                    `corrosive deluge from your ${spellName} eats through the defenses of the ${killNames[0]}, melting the foe into silence`,
                                    `hissing acidic spray bursts across the ${killNames[0]}, dissolving its flesh upon the smoking flagstones`
                                ];
                                ChronicleGrounder.recordCombatVerb('dissolves');
                            } else if (spellElem === 'holy') {
                                spellPhrases = [
                                    `consecrated radiance blazes forth as your ${spellName} smites the ${killNames[0]} with searing celestial wrath`,
                                    `a blinding shaft of holy starlight descends upon the ${killNames[0]}, scouring the darkness from its flesh`,
                                    `divine brilliance flares in righteous fury, banishing the life from the ${killNames[0]} in pure radiant light`
                                ];
                                ChronicleGrounder.recordCombatVerb('smites');
                            } else {
                                spellPhrases = [
                                    `azure darts of concentrated force burst from your ${spellName}, hammering into the ${killNames[0]} with kinetic violence`,
                                    `a shimmering shockwave of raw sorcery erupts from your hand, blasting the ${killNames[0]} into dust upon the stones`,
                                    `weaving ${spellName}, you unleash an eldritch rupture that crushes the ${killNames[0]} against the dungeon floor`,
                                    `a brilliant flare of pure spellfire consumes the ${killNames[0]} in a decisive kinetic blast`
                                ];
                                ChronicleGrounder.recordCombatVerb('blasts');
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(spellPhrases, turnSeed);
                        } else if (isDevice) {
                            const devPhrases = [
                                `leveling your ${devName}, a piercing ray lances from the tip and burns straight through the ${killNames[0]}`,
                                `a sharp flick of your ${devName} discharges a focused beam of power that fells the ${killNames[0]} in mid-stride`,
                                `bringing down the butt of your ${devName} upon the stone, a reverberating shockwave of stored power shatters the ${killNames[0]}`,
                                `your ${devName} flares with ancient dweomer, obliterating the ${killNames[0]} in a radiant burst`
                            ];
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(devPhrases, turnSeed);
                            ChronicleGrounder.recordCombatVerb('discharges');
                        } else if (isRanged) {
                            let rangedPhrases = [];
                            if (weaponArchetype === 'crossbow') {
                                rangedPhrases = [
                                    `the steel prod snaps with violent release, sending an iron quarrel from your ${launcherName} punching cleanly through the ${killNames[0]}`,
                                    `triggering your ${launcherName}, a heavy bolt slams into the ${killNames[0]} with sickening thud, pinning it lifeless to the wall`,
                                    `a sudden mechanical thrum rings out as a steel quarrel tears through the breast of the ${killNames[0]}`,
                                    `with cold marksmanship, your ${launcherName} drops the ${killNames[0]} before it can cross the chamber`
                                ];
                                ChronicleGrounder.recordCombatVerb('punches');
                            } else if (weaponArchetype === 'sling') {
                                rangedPhrases = [
                                    `whirling your ${launcherName} in a blurred arc, you whip a lead shot squarely into the forehead of the ${killNames[0]} with a resounding crack`,
                                    `a whistling river pebble loosed from your ${launcherName} shatters the skull of the ${killNames[0]}`,
                                    `the snap of spinning leather releases a bullet that caves in the brow of the ${killNames[0]}, dropping it instantly`,
                                    `a lead shot hums through the dark, cracking hard against the ${killNames[0]} and felling the beast`
                                ];
                                ChronicleGrounder.recordCombatVerb('fractures');
                            } else {
                                rangedPhrases = [
                                    `drawing the yew limbs taut to the ear, you loose an ${ammoName} that hisses through the gloom and pierces the heart of the ${killNames[0]}`,
                                    `with deadly marksmanship from your ${launcherName}, a feathered shaft takes the ${killNames[0]} in the throat, felling the foe in mid-stride`,
                                    `the bowstring thrums like a harp-wire; your ${ammoName} buries itself to the fletching in the ${killNames[0]}`,
                                    `a silent shaft pierces the ${killNames[0]} from the dark, pinning the foe lifeless upon the flagstones`
                                ];
                                ChronicleGrounder.recordCombatVerb('pierces');
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(rangedPhrases, turnSeed);
                        } else {
                            let meleePhrases = [];
                            if (weaponArchetype === 'blunt') {
                                meleePhrases = [
                                    `bringing down your ${weapon} in a crushing arc, you cave in the guard of the ${killNames[0]} with bone-splintering force`,
                                    `the flanged head of your ${weapon} connects with a deafening crunch, battering the ${killNames[0]} lifeless upon the flagstones`,
                                    `stepping inside its reach, you hammer your ${weapon} into the chest of the ${killNames[0]}, shattering ribs and dropping it in a heap`,
                                    `a resounding blunt impact! Your ${weapon} shatters the skull of the ${killNames[0]} with brutal momentum`,
                                    `with grim force, you drive your ${weapon} down through helm and bone, felling the ${killNames[0]} instantly`
                                ];
                                ChronicleGrounder.recordCombatVerb('crushes');
                            } else if (weaponArchetype === 'axe') {
                                meleePhrases = [
                                    `heaving your ${weapon} in a devastating two-handed arc, you cleave through shield and armor to fell the ${killNames[0]} in a single stroke`,
                                    `the bearded edge of your ${weapon} bites deep into the shoulder of the ${killNames[0]}, splitting it to the brisket`,
                                    `with grim momentum, your ${weapon} hews through the creature's guard, dropping the severed carcass upon the bloody floor`,
                                    `whirling your ${weapon} in a sweeping crescent, you shear through the defenses of the ${killNames[0]}`,
                                    `a brutal downward chop of your ${weapon} cleaves the ${killNames[0]} upon the flagstones`
                                ];
                                ChronicleGrounder.recordCombatVerb('cleaves');
                            } else if (weaponArchetype === 'dagger') {
                                meleePhrases = [
                                    `ducking beneath the wild swing, you drive your ${weapon} deep under the ribcage of the ${killNames[0]} with cold, surgical precision`,
                                    `slipping past the enemy's guard, your ${weapon} finds the exposed seam in the throat of the ${killNames[0]}`,
                                    `a lightning jab of your ${weapon} sinks deep into the heart of the ${killNames[0]}, easing the dying creature quietly to the flagstones`,
                                    `stepping in close, you twist your ${weapon} into a vital joint, ending the ${killNames[0]} in a breathless gasp`
                                ];
                                ChronicleGrounder.recordCombatVerb('slips');
                            } else if (weaponArchetype === 'polearm_pierce') {
                                meleePhrases = [
                                    `bracing your stance, you drive the point of your ${weapon} straight through the breastplate of the ${killNames[0]}`,
                                    `lunging with lethal reach, your ${weapon} skewers the ${killNames[0]} before it can lay a claw upon you`,
                                    `a decisive forward thrust! The cold iron tip of your ${weapon} pierces through the ${killNames[0]} and rings against the wall behind it`,
                                    `planting the haft, you impale the lunging ${killNames[0]} upon the sharp steel of your ${weapon}`
                                ];
                                ChronicleGrounder.recordCombatVerb('skewers');
                            } else if (weaponArchetype === 'unarmed') {
                                meleePhrases = [
                                    `stepping inside the brute's reach, you drive an iron-knuckled fist squarely into the jaw of the ${killNames[0]} with a sickening crack`,
                                    `with raw brawling fury, you pummel the ${killNames[0]} with a rapid barrage of bare-fisted strikes until it crumples senseless`,
                                    `grappling the ${killNames[0]} by the throat, you slam it headfirst into the flagstones with jarring violence`,
                                    `a punishing bare-knuckle smash catches the ${killNames[0]} beneath the chin, snapping its neck and ending the fight`
                                ];
                                ChronicleGrounder.recordCombatVerb('pummels');
                            } else {
                                meleePhrases = [
                                    `your ${weapon} flashes in the torchlight, cleaving down the ${killNames[0]} in a decisive stroke`,
                                    `parrying the return stroke, you run your ${weapon} cleanly through the heart of the ${killNames[0]}`,
                                    `with grim resolve your ${weapon} carves through armor and flesh, felling the ${killNames[0]} upon the flagstones`,
                                    `stepping inside its guard, your ${weapon} cuts down the ${killNames[0]}`,
                                    `a sweeping, fluid slash of your ${weapon} shears across the flank of the ${killNames[0]}, ending the fight`
                                ];
                                ChronicleGrounder.recordCombatVerb('cuts');
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(meleePhrases, turnSeed);
                        }
                    } else {
                        // Multi-kill
                        if (isSpell) {
                            let multiSpellPhrases = [];
                            if (spellElem === 'fire') {
                                multiSpellPhrases = [
                                    `a roaring tempest of flame engulfs the enemy ranks, reducing ${kills.length} foes to heaps of smoking cinders`,
                                    `your ${spellName} detonates in an expanding ring of fire, incinerating ${kills.length} assailants in blinding heat`
                                ];
                            } else if (spellElem === 'cold') {
                                multiSpellPhrases = [
                                    `a howling blizzard of razor-sharp rime sweeps outward, freezing and shattering ${kills.length} foes into crystalline shards`,
                                    `your glacial frost storm sweeps the corridor, encasing ${kills.length} enemies in solid ice`
                                ];
                            } else if (spellElem === 'lightning') {
                                multiSpellPhrases = [
                                    `forks of chain lightning leap from foe to foe, electrocuting ${kills.length} assailants in a deafening flurry of blue-white arcs`,
                                    `a blinding discharge of electrical voltage tears through the ranks, dropping ${kills.length} enemies in mid-step`
                                ];
                            } else {
                                multiSpellPhrases = [
                                    `your sweeping spellfire engulfs and destroys ${kills.length} foes in a blinding eruption of power`,
                                    `a devastating burst of sorcery obliterates ${kills.length} assailants in a storm of arcane light`,
                                    `your magical barrage tears through the ranks, slaying ${kills.length} enemies in swift succession`
                                ];
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(multiSpellPhrases, turnSeed);
                        } else if (isDevice) {
                            const multiDevPhrases = [
                                `unleashing the stored power of your ${devName}, a surging shockwave tears through the chamber, destroying ${kills.length} foes`,
                                `a brilliant cascade of runic energy discharges from your ${devName}, felling ${kills.length} assailants in a flash of light`
                            ];
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(multiDevPhrases, turnSeed);
                        } else if (isRanged) {
                            let multiRangedPhrases = [];
                            if (weaponArchetype === 'crossbow') {
                                multiRangedPhrases = [
                                    `reloading with grim mechanical speed, your ${launcherName} drives steel quarrels through ${kills.length} assailants before they reach your guard`,
                                    `a deadly volley of heavy bolts punches through ${kills.length} foes, pinning them to the flagstones`
                                ];
                            } else if (weaponArchetype === 'sling') {
                                multiRangedPhrases = [
                                    `whirling your ${launcherName} in blurred figure-eights, you pelt ${kills.length} foes with deadly lead bullets, dropping them upon the stones`,
                                    `a rapid hail of slingstones cracks against skulls, felling ${kills.length} assailants in seconds`
                                ];
                            } else {
                                multiRangedPhrases = [
                                    `rapid marksmanship from your ${launcherName} fells ${kills.length} foes before they reach your guard`,
                                    `a deadly volley of missiles cuts down ${kills.length} enemies from the dark`,
                                    `loosing arrow after arrow, you drop ${kills.length} assailants in swift succession`
                                ];
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(multiRangedPhrases, turnSeed);
                        } else {
                            let multiMeleePhrases = [];
                            if (weaponArchetype === 'blunt') {
                                multiMeleePhrases = [
                                    `whirling your ${weapon} in bone-splintering arcs, you batter aside shields and shatter ${kills.length} assailants upon the bloody flagstones`,
                                    `your ${weapon} crashes down like a smith's sledge, crushing the skulls and ribs of ${kills.length} foes in brutal succession`,
                                    `sweeping your ${weapon} with crushing momentum, you batter ${kills.length} enemies lifeless to the floor`
                                ];
                            } else if (weaponArchetype === 'axe') {
                                multiMeleePhrases = [
                                    `hewing left and right with ferocious momentum, your ${weapon} shears through mail and limb to drop ${kills.length} enemies in a crimson heap`,
                                    `your ${weapon} reaps a grim harvest, cleaving down ${kills.length} foes with sweeping two-handed strokes`,
                                    `whirling your ${weapon} in wide crescent hews, you butcher ${kills.length} assailants in rapid succession`
                                ];
                            } else if (weaponArchetype === 'dagger' || weaponArchetype === 'polearm_pierce') {
                                multiMeleePhrases = [
                                    `lunging and darting through the melee, your ${weapon} skewers ${kills.length} assailants through vital seams before they can turn their guard`,
                                    `cold iron strikes with blinding agility; your ${weapon} fells ${kills.length} enemies in swift, lethal thrusts`,
                                    `with lethal precision, your ${weapon} impales ${kills.length} foes upon the flagstones`
                                ];
                            } else if (weaponArchetype === 'unarmed') {
                                multiMeleePhrases = [
                                    `surging into the thick of the fray with iron knuckles, you batter down ${kills.length} assailants with a devastating flurry of barehanded blows`,
                                    `bare fists crack like thunderbolts as you pummel ${kills.length} foes into senseless heaps upon the stones`
                                ];
                            } else {
                                multiMeleePhrases = [
                                    `your ${weapon} fells ${kills.length} assailants in swift, fluid strokes`,
                                    `whirling your ${weapon} in a deadly arc, you cut down ${kills.length} foes upon the bloody stones`,
                                    `your ${weapon} reaps a grim harvest, slaying ${kills.length} enemies in swift succession`
                                ];
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(multiMeleePhrases, turnSeed);
                        }
                    }
                } else if (hAttacks.length > 0) {
                    const ha = hAttacks[0];
                    if (ha.missed) {
                        let missPhrases = [];
                        if (isSpell) {
                            missPhrases = [
                                `your incantation fizzles harmlessly in the gloom`,
                                `the arc of spellfire splashes off the damp stonework without touching the ${ha.monsterName}`,
                                `your magic flares wide into the dark shadows`
                            ];
                        } else if (isDevice) {
                            missPhrases = [
                                `the beam from your ${devName} scorches the stone wall harmlessly`,
                                `your ${devName} discharges wide into the shadows`
                            ];
                        } else if (isRanged) {
                            if (weaponArchetype === 'crossbow') {
                                missPhrases = [
                                    `the steel quarrel from your ${launcherName} clatters off the stone wall into the darkness`,
                                    `your quarrel whistles wide of the dodging ${ha.monsterName}`
                                ];
                            } else if (weaponArchetype === 'sling') {
                                missPhrases = [
                                    `the slingstone ricochets wildly off the cavern ceiling`,
                                    `your lead shot whistles harmlessly over the ${ha.monsterName}`
                                ];
                            } else {
                                missPhrases = [
                                    `your ${ammoName} whistles harmlessly past into the shadows`,
                                    `the shot from your ${launcherName} embeds itself into a timber post`
                                ];
                            }
                        } else {
                            if (weaponArchetype === 'blunt') {
                                missPhrases = [
                                    `your ${weapon} glances heavily off the flagstones with a shower of sparks`,
                                    `the heavy blow of your ${weapon} whistles wide as the ${ha.monsterName} scrambles back`
                                ];
                            } else if (weaponArchetype === 'axe') {
                                missPhrases = [
                                    `your sweeping hew bites deeply into the stone wall, jarring your shoulders`,
                                    `the heavy bearded edge of ${weapon} cleaves empty air`
                                ];
                            } else if (weaponArchetype === 'dagger' || weaponArchetype === 'polearm_pierce') {
                                missPhrases = [
                                    `the ${ha.monsterName} parries your swift thrust with a frantic dodge`,
                                    `the point of your ${weapon} scrapes harmlessly against hardened stone`
                                ];
                            } else if (weaponArchetype === 'unarmed') {
                                missPhrases = [
                                    `your driving punch grazes empty air as the ${ha.monsterName} twists aside`,
                                    `a wild knuckle strike glances harmlessly off empty space`
                                ];
                            } else {
                                missPhrases = [
                                    `your counter-stroke with ${weapon} whistles wide in the gloom`,
                                    `the ${ha.monsterName} ducks beneath the flashing edge of your ${weapon}`
                                ];
                            }
                        }
                        heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(missPhrases, turnSeed);
                    } else {
                        // Successful hit (non-fatal)
                        let hitPhrases = [];
                        if (isSpell) {
                            if (spellElem === 'fire') {
                                hitPhrases = [
                                    `you unleash ${spellName}, searing tongues of flame scorching the hide of the ${ha.monsterName}`,
                                    `a blast of fire from your ${spellName} blisters the flesh of the ${ha.monsterName}`,
                                    `your magic flares in counter-attack, scorching the ${ha.monsterName} with crackling heat`
                                ];
                            } else if (spellElem === 'cold') {
                                hitPhrases = [
                                    `a bitter frost bolt from your ${spellName} bites into the ${ha.monsterName}, numbing its limbs`,
                                    `shards of freezing rime from ${spellName} lacerate the ${ha.monsterName}`,
                                    `glacial cold wraps around the ${ha.monsterName}, slowing its advance`
                                ];
                            } else if (spellElem === 'lightning') {
                                hitPhrases = [
                                    `a crackling arc of voltage from your ${spellName} jolts the ${ha.monsterName} backward`,
                                    `electric current courses through the ${ha.monsterName} with a sharp snap of ozone`,
                                    `a jagged fork of lightning lashes across the ${ha.monsterName}`
                                ];
                            } else if (spellElem === 'acid') {
                                hitPhrases = [
                                    `a hissing splash of acid from ${spellName} eats into the flesh of the ${ha.monsterName}`,
                                    `caustic spray from ${spellName} burns into the hide of the ${ha.monsterName}`
                                ];
                            } else if (spellElem === 'holy') {
                                hitPhrases = [
                                    `consecrated radiance flares from your hands, searing the corrupt essence of the ${ha.monsterName}`,
                                    `a shaft of holy starlight scorches the ${ha.monsterName} in radiant judgment`
                                ];
                            } else {
                                hitPhrases = [
                                    `azure kinetic darts from your ${spellName} hammer hard into the ${ha.monsterName}`,
                                    `a crackling arcane bolt strikes the ${ha.monsterName}, staggering its advance`,
                                    `you unleash spellfire, blasting the ${ha.monsterName} with force`
                                ];
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(hitPhrases, turnSeed);
                        } else if (isDevice) {
                            hitPhrases = [
                                `you discharge your ${devName}, blasting the ${ha.monsterName} with an arc of power`,
                                `a focused ray from your ${devName} strikes true against the ${ha.monsterName}`,
                                `your ${devName} flares, staggering the ${ha.monsterName} with magical force`
                            ];
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(hitPhrases, turnSeed);
                        } else if (isRanged) {
                            if (weaponArchetype === 'crossbow') {
                                hitPhrases = [
                                    `a heavy iron quarrel from your ${launcherName} punches deep into the ${ha.monsterName}`,
                                    `triggering your ${launcherName}, your steel bolt bites hard into the ${ha.monsterName}`,
                                    `a swift quarrel from your ${launcherName} strikes the ${ha.monsterName} with a heavy thud`
                                ];
                            } else if (weaponArchetype === 'sling') {
                                hitPhrases = [
                                    `a whistling lead shot from your ${launcherName} cracks hard against the shoulder of the ${ha.monsterName}`,
                                    `your slingstone strikes true, bruising the ${ha.monsterName} with resounding force`,
                                    `a whirling bullet from ${launcherName} batters into the flank of the ${ha.monsterName}`
                                ];
                            } else {
                                hitPhrases = [
                                    `your ${ammoName} strikes true, piercing deep into the ${ha.monsterName}`,
                                    `you loose a feathered shaft from your ${launcherName} that bites into the ${ha.monsterName}`,
                                    `a swift shot from ${launcherName} wounds the ${ha.monsterName}, drawing dark blood`
                                ];
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(hitPhrases, turnSeed);
                        } else {
                            if (weaponArchetype === 'blunt') {
                                hitPhrases = [
                                    `you drive your ${weapon} hard into the ribs of the ${ha.monsterName}, rattling its bones`,
                                    `ducking low, you hammer ${weapon} heavily against the guard of the ${ha.monsterName}`,
                                    `the blunt momentum of your ${weapon} crashes into the ${ha.monsterName}, staggering it backward`,
                                    `a resounding blow! Your ${weapon} smashes into the flank of the ${ha.monsterName}`
                                ];
                            } else if (weaponArchetype === 'axe') {
                                hitPhrases = [
                                    `your ${weapon} bites deep into the shoulder of the ${ha.monsterName}, splitting its armor`,
                                    `heaving ${weapon} in a brutal crescent, you carve a jagged wound into the ${ha.monsterName}`,
                                    `a punishing hew! Your ${weapon} bites into the flank of the ${ha.monsterName}`,
                                    `stepping forward, you shear through the defenses of the ${ha.monsterName} with ${weapon}`
                                ];
                            } else if (weaponArchetype === 'dagger') {
                                hitPhrases = [
                                    `you slip ${weapon} past its defenses, scoring a bleeding gash along the ${ha.monsterName}'s flank`,
                                    `ducking inside its reach, your ${weapon} bites deep into the thigh of the ${ha.monsterName}`,
                                    `a swift, surgical thrust of your ${weapon} pierces the hide of the ${ha.monsterName}`,
                                    `cold steel flashes as you plant ${weapon} into the shoulder of the ${ha.monsterName}`
                                ];
                            } else if (weaponArchetype === 'polearm_pierce') {
                                hitPhrases = [
                                    `lunging forward, your ${weapon} punches a deep puncture through the ${ha.monsterName}`,
                                    `keeping the brute at spear's reach, you drive the steel point of ${weapon} into the ${ha.monsterName}`,
                                    `a decisive forward thrust! Your ${weapon} impales the flank of the ${ha.monsterName}`,
                                    `you jab your ${weapon} forward, scoring a deep wound upon the ${ha.monsterName}`
                                ];
                            } else if (weaponArchetype === 'unarmed') {
                                hitPhrases = [
                                    `ducking low, you plant a solid bare-knuckle punch into the gut of the ${ha.monsterName}`,
                                    `an iron fist catches the ${ha.monsterName} across the jaw, staggering the brute backward`,
                                    `you drive a heavy knuckle blow into the ribs of the ${ha.monsterName} with a solid thud`,
                                    `a swift jab of your fist snaps the head of the ${ha.monsterName} to the side`
                                ];
                            } else {
                                hitPhrases = [
                                    `you counter with ${weapon}, striking true against the ${ha.monsterName}`,
                                    `ducking low, you drive ${weapon} hard into the ${ha.monsterName}`,
                                    `your ${weapon} flashes in counter-attack, scoring a deep wound upon the ${ha.monsterName}`,
                                    `stepping inside its swing, your ${weapon} carves through the defenses of the ${ha.monsterName}`
                                ];
                            }
                            heroText = ChronicleGrounder.pickNonRepeatingCombatPhrase(hitPhrases, turnSeed);
                        }
                    }
                }

                // Peril prefix when health is critically low (<= 30%)
                let perilPrefix = '';
                if (exData.isPeril) {
                    if (traditionKey === 'khazad' || (exData.playerRace && exData.playerRace.toLowerCase().includes('dwarf'))) {
                        perilPrefix = 'Calling upon the endurance of Durin and the unyielding mountain roots as blood seeps through mail, ';
                    } else if (traditionKey === 'noldor' || (exData.playerRace && (exData.playerRace.toLowerCase().includes('elf') || exData.playerRace.toLowerCase().includes('eldar')))) {
                        perilPrefix = "Remembering the starlit sorrow of Gondolin before Morgoth's shadow fell, ";
                    } else if (traditionKey === 'periath' || (exData.playerRace && (exData.playerRace.toLowerCase().includes('hobbit') || exData.playerRace.toLowerCase().includes('halfling')))) {
                        perilPrefix = 'Desperately longing for the green burrows far from the Iron Hells, small hands trembling yet resolute, ';
                    } else {
                        perilPrefix = 'Summoning the fierce spirit of Westernesse as the mortal shadow of the deep encroaches, ';
                    }
                }
                const activePrefix = perilPrefix ? `${perilPrefix}${statusPrefix ? statusPrefix.charAt(0).toLowerCase() + statusPrefix.slice(1) : ''}` : statusPrefix;

                // Assemble direct, brief 1-2 sentence narrative
                if (incomingText && heroText) {
                    if (activePrefix) {
                        prose = `${incomingText}. ${activePrefix}${heroText}.`;
                    } else {
                        prose = `${incomingText.charAt(0).toUpperCase() + incomingText.slice(1)}, but ${heroText}.`;
                    }
                } else if (heroText) {
                    prose = activePrefix ? `${activePrefix}${heroText}.` : `${heroText.charAt(0).toUpperCase() + heroText.slice(1)}.`;
                } else if (incomingText) {
                    prose = activePrefix ? `${activePrefix}${incomingText}.` : `${incomingText.charAt(0).toUpperCase() + incomingText.slice(1)}.`;
                } else if (activePrefix) {
                    prose = `${activePrefix}you fight to maintain your footing in the dark.`;
                } else {
                    prose = `Steel and shadows clash as battle is joined in the subterranean vaults.`;
                }

                // Check for creature dialogue bark if sentient enemy involved
                const vocalAttacker = inAttacks.find(a => {
                    const profile = this.classifyCreature({ name: a.monsterName, glyph: a.glyph });
                    return profile && profile.isVocal;
                });
                if (vocalAttacker) {
                    const vProfile = this.classifyCreature({ name: vocalAttacker.monsterName, glyph: vocalAttacker.glyph });
                    dialogue = {
                        speaker: vocalAttacker.monsterName,
                        text: (vProfile.assaultBark ? vProfile.assaultBark(vocalAttacker.action) : 'Die!').replace(/"/g, ''),
                        isNoise: false,
                        recommendedVoice: vProfile.recommendedVoice
                    };
                }
                break;
            }

            case 'PLAYER_STATUS': {
                const sType = (event.data && event.data.status) ? event.data.status.toLowerCase() : 'confused';
                title = 'Sudden Affliction';
                if (sType.includes('confus')) {
                    prose = `Your vision twists and the dungeon walls spin wildly—you are confused!`;
                } else if (sType.includes('poison') || sType.includes('sick')) {
                    prose = `Foul burning venom surges through your veins—you are poisoned!`;
                } else if (sType.includes('blind')) {
                    prose = `Darkness crashes down upon your eyes—you are blinded!`;
                } else if (sType.includes('stun')) {
                    prose = `A jarring impact rings through your skull—you are heavily stunned!`;
                } else if (sType.includes('paralyz')) {
                    prose = `Your muscles seize like cold iron—you are paralyzed and cannot move!`;
                } else if (sType.includes('terrifi') || sType.includes('panic')) {
                    prose = `Cold mortal dread grips your heart—you are terrified!`;
                } else if (sType.includes('bleed')) {
                    prose = `Blood seeps through your armor—you are bleeding profusely!`;
                } else {
                    prose = `A sudden affliction chills your blood, testing your resolve in the dark.`;
                }
                break;
            }

            case 'HERO_ATTACK': {
                const targetMon = (event.data && event.data.monsterName) ? event.data.monsterName : 'foe';
                const act = (event.data && event.data.action) ? event.data.action : 'hits';
                const inTown = event.data && event.data.inTown;
                const atkMed = (event.data && event.data.attackMedium) ? event.data.attackMedium : null;
                const method = (atkMed && atkMed.method) ? atkMed.method : ((atkMed && atkMed.type === 'spell') ? 'spell' : ((atkMed && atkMed.type === 'ranged') ? 'shoot' : 'strike'));
                const weaponArchetype = (atkMed && atkMed.archetype) ? atkMed.archetype : (weapon.toLowerCase() === 'bare fists' ? 'unarmed' : 'blade');
                const spellElem = (atkMed && atkMed.element) ? atkMed.element : 'arcane';
                const spellName = (atkMed && atkMed.name) ? atkMed.name : 'incantation';
                const launcherName = (atkMed && atkMed.name && method === 'shoot') ? atkMed.name : (bow || 'bow');
                const ammoName = (atkMed && atkMed.ammo) ? atkMed.ammo : (quiver || 'arrow');

                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + targetMon.length * 13 + (player && player.name ? player.name.length * 7 : 0));
                title = inTown ? `Brawl: ${targetMon}` : `Clash: ${targetMon}`;

                if (inTown) {
                    const isIdiot = targetMon.toLowerCase().includes('idiot');
                    const isBeggar = targetMon.toLowerCase().includes('beggar');
                    if (isIdiot || isBeggar) {
                        let idiotHits = [];
                        if (weaponArchetype === 'blunt') {
                            idiotHits = [
                                `${name} clubs the hapless ${targetMon} with ${weapon}! The wretch shrieks in bewilderment, stumbling into the mud.`,
                                `${name}'s heavy strike catches the ${targetMon} squarely, sending the witless soul sprawling across the cobblestones!`,
                                `With unsparing force, ${name} batters the cowering ${targetMon} with ${weapon}, raising cries of alarm in the street.`
                            ];
                        } else if (weaponArchetype === 'unarmed') {
                            idiotHits = [
                                `${name} drives a bare fist into the hapless ${targetMon}! The wretch shrieks in bewilderment, stumbling into the mud.`,
                                `${name}'s punch catches the ${targetMon} squarely, sending the gibbering soul sprawling across the cobblestones!`,
                                `With unsparing force, ${name} strikes the cowering ${targetMon} with calloused knuckles, raising cries of alarm in the street.`
                            ];
                        } else if (method === 'shoot') {
                            idiotHits = [
                                `${name} looses an ${ammoName} from ${launcherName} near the hapless ${targetMon}, grazing the wretch as it scurries into the gutter!`,
                                `A warning shot from ${launcherName} strikes the ground beside the ${targetMon}, sending the fool tumbling into the mud!`
                            ];
                        } else if (method === 'spell') {
                            idiotHits = [
                                `A startled flare of ${spellElem} magic from ${name}'s fingers scorches the cobblestones near the ${targetMon}, sending the wretch crying in panic!`,
                                `${name} incants ${spellName}, sending a crackling jolt that knocks the witless ${targetMon} into a stack of empty crates!`
                            ];
                        } else {
                            idiotHits = [
                                `${name} strikes the hapless ${targetMon} with ${weapon}! The wretch shrieks in bewilderment, stumbling into the mud.`,
                                `${name}'s blow catches the ${targetMon} squarely, sending the gibbering soul sprawling across the cobblestones!`,
                                `With unsparing force, ${name} strikes the cowering ${targetMon}, raising cries of alarm in the street.`
                            ];
                        }
                        prose = ChronicleGrounder.pickNonRepeatingCombatPhrase(idiotHits, turnSeed);
                    } else {
                        let townBrawls = [];
                        if (weaponArchetype === 'blunt') {
                            townBrawls = [
                                `Iron crashes in the alley! ${name} batters the ${targetMon} with ${weapon}, driving the ruffian back against the timber storefronts!`,
                                `${name} engages the ${targetMon} in swift combat, landing a jarring blunt impact upon the ruffian!`,
                                `Ducking beneath a clumsy riposte, ${name} lands a solid blow upon the ${targetMon} with ${weapon}.`
                            ];
                        } else if (weaponArchetype === 'axe') {
                            townBrawls = [
                                `A brutal crescent arc! ${name} hews toward the ${targetMon} with ${weapon}, splintering a wooden barrel and driving the rogue back!`,
                                `${name} engages the ${targetMon} with ${weapon}, cleaving through the ruffian's guard!`
                            ];
                        } else if (weaponArchetype === 'dagger' || weaponArchetype === 'polearm_pierce') {
                            townBrawls = [
                                `Cold steel darts in the mist! ${name} lunges at the ${targetMon} with ${weapon}, scoring a bleeding strike past the ruffian's guard!`,
                                `${name} thrusts ${weapon} into the fray, driving the ${targetMon} backward with swift reach.`
                            ];
                        } else if (weaponArchetype === 'unarmed') {
                            townBrawls = [
                                `Fists fly in the backstreet! ${name} ducks under a clumsy jab and plants a heavy knuckle blow squarely into the ${targetMon}'s ribs!`,
                                `${name} grapples the ${targetMon} in the alley, slamming an iron fist into the ruffian's jaw with a sickening crack!`,
                                `A swift barehanded brawl! ${name} batters the ${targetMon} back against the timber walls.`
                            ];
                        } else if (method === 'shoot') {
                            townBrawls = [
                                `The hum of ${launcherName} echoes down the alley! ${name} looses an ${ammoName} that bites into the shoulder of the ${targetMon}!`,
                                `From the shadows of the eaves, ${name} fires ${launcherName}, staggering the ${targetMon} with a lethal missile!`
                            ];
                        } else if (method === 'spell') {
                            townBrawls = [
                                `Arcane light blazes in the dark lane! ${name} unleashes ${spellName}, blasting the ${targetMon} backward into a timber wall!`,
                                `A sudden flare of ${spellElem} power from ${name}'s fingertips scorches the rogue, driving the ${targetMon} back in alarm!`
                            ];
                        } else {
                            townBrawls = [
                                `Steel clangs in the alley! ${name} strikes out with ${weapon}, driving the ${targetMon} back against the timber storefronts.`,
                                `${name} engages the ${targetMon} in swift combat, landing a ringing blow upon the ruffian!`,
                                `Ducking beneath a clumsy riposte, ${name} lands a solid blow upon the ${targetMon} with ${weapon}.`
                            ];
                        }
                        prose = ChronicleGrounder.pickNonRepeatingCombatPhrase(townBrawls, turnSeed);
                    }
                } else {
                    let dungeonHits = [];
                    if (method === 'spell') {
                        dungeonHits = [
                            `Incanting words of power at ${depthFt}, ${name} unleashes ${spellName}, blasting the ${targetMon} with searing energy!`,
                            `A dazzling flare of ${spellElem} light illuminates the damp vault as ${name} channels ${spellName} directly into the ${targetMon}!`,
                            `Eldritch force ripples through the air; ${name}'s ${spellName} strikes the ${targetMon} with kinetic violence!`,
                            `Weaving arcane gestures in the dark, ${name} scorches the ${targetMon} with a crackling burst of ${spellName}.`
                        ];
                    } else if (method === 'shoot') {
                        if (weaponArchetype === 'crossbow') {
                            dungeonHits = [
                                `At a measured distance of ${depthFt}, the steel prod of ${launcherName} snaps; ${name}'s quarrel punches deep into the ${targetMon}!`,
                                `The mechanical thrum of ${launcherName} rings through the vault as an iron bolt strikes the ${targetMon} with heavy force!`,
                                `Triggering ${launcherName} from the shadows, ${name} drives a heavy quarrel cleanly into the ${targetMon}!`
                            ];
                        } else if (weaponArchetype === 'sling') {
                            dungeonHits = [
                                `Whirling ${launcherName} with deadly speed at ${depthFt}, ${name} whips a lead shot hard against the ${targetMon}!`,
                                `The whistling crack of a slingstone echoes as ${name} strikes the ${targetMon} with bone-bruising force!`,
                                `A swift release from ${launcherName} sends a lead bullet humming through the dark into the ${targetMon}!`
                            ];
                        } else {
                            dungeonHits = [
                                `At a measured distance of ${depthFt}, ${name} looses an ${ammoName} from ${launcherName} that bites deep into the ${targetMon}!`,
                                `The sharp thrum of ${launcherName} rings out; ${name}'s ${ammoName} strikes true, piercing the ${targetMon} with lethal precision!`,
                                `From the shadows of the corridor, ${name} fires ${launcherName}, planting an ${ammoName} squarely in the ${targetMon}!`,
                                `A deadly projectile hisses through the gloom as ${name} shoots the ${targetMon} from beyond its reach.`
                            ];
                        }
                    } else if (weaponArchetype === 'blunt') {
                        dungeonHits = [
                            `With crushing momentum at ${depthFt}, ${name} hammers ${weapon} squarely into the ${targetMon}, rattling its bones!`,
                            `The deafening crunch of ${weapon} rings through the vault as ${name} batters aside the ${targetMon}'s guard!`,
                            `Ducking beneath a counter-strike, ${name} drives the flanged iron head of ${weapon} into the ribs of the ${targetMon}!`,
                            `A jarring, punishing blow! ${name} lands ${weapon} upon the ${targetMon} with bone-splintering force in the dim torchlight.`
                        ];
                    } else if (weaponArchetype === 'axe') {
                        dungeonHits = [
                            `With a two-handed heave at ${depthFt}, ${name} hews ${weapon} into the flank of the ${targetMon}!`,
                            `The bearded blade of ${weapon} bites deep as ${name} cleaves into the guard of the ${targetMon}!`,
                            `Stepping forward, ${name} swings ${weapon} in a brutal crescent arc, tearing through the ${targetMon}'s defenses!`,
                            `A punishing chop! ${name} drives the heavy iron edge of ${weapon} into the ${targetMon}, drawing dark ichor upon the stones.`
                        ];
                    } else if (weaponArchetype === 'dagger') {
                        dungeonHits = [
                            `Ducking beneath a clumsy swipe at ${depthFt}, ${name} slips ${weapon} deep into the ${targetMon}'s flank!`,
                            `Cold steel flashes in the shadows; ${name} drives ${weapon} into an exposed seam of the ${targetMon}!`,
                            `With blinding agility, ${name} lunges inside the reach of the ${targetMon}, scoring a bleeding wound with ${weapon}!`,
                            `A swift, surgical strike! ${name} plants ${weapon} into the shoulder of the ${targetMon} with deadly precision.`
                        ];
                    } else if (weaponArchetype === 'polearm_pierce') {
                        dungeonHits = [
                            `Bracing low at ${depthFt}, ${name} drives the point of ${weapon} straight into the chest of the ${targetMon}!`,
                            `Keeping the brute at reach, ${name} lunges forward with ${weapon}, skewering the ${targetMon} before it can close!`,
                            `The ringing scrape of iron against stone echoes as ${name}'s ${weapon} punches deep into the ${targetMon}!`,
                            `A decisive forward thrust! ${name} drives the steel tip of ${weapon} through the hide of the ${targetMon}.`
                        ];
                    } else if (weaponArchetype === 'unarmed') {
                        dungeonHits = [
                            `Stepping inside the brute's reach at ${depthFt}, ${name} drives a calloused fist hard into the gut of the ${targetMon}!`,
                            `With raw pugilistic fury, ${name} lands a jarring bare-knuckle punch upon the jaw of the ${targetMon}!`,
                            `Ducking under a savage claw, ${name} drives an iron fist into the ribs of the ${targetMon} with a sickening thud!`,
                            `A bone-rattling blow! ${name} batters the ${targetMon} with a swift barehanded strike, staggering the foe backward.`
                        ];
                    } else {
                        dungeonHits = [
                            `With swift resolve at ${depthFt}, ${name} drives ${weapon} into the ${targetMon}!`,
                            `Ducking beneath a counter-strike, ${name} strikes the ${targetMon} squarely with ${weapon}.`,
                            `A decisive, punishing blow! ${name} lands ${weapon} upon the ${targetMon} in the dim torchlight.`,
                            `The ringing clash of ${weapon} echoes out as ${name} strikes into the ${targetMon} with deadly precision.`,
                            `Pressing forward, ${name} cleaves through the creature's guard, landing a searing wound upon the ${targetMon}!`
                        ];
                    }
                    prose = ChronicleGrounder.pickNonRepeatingCombatPhrase(dungeonHits, turnSeed);
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

            case 'STORE_PURCHASE': {
                const item = (event.data && event.data.item) ? event.data.item : 'provisions';
                const count = (event.data && event.data.count) ? event.data.count : 1;
                const price = (event.data && event.data.price) ? event.data.price : 0;
                const storeName = (event.data && event.data.storeName) ? event.data.storeName : 'Town Merchant';

                const hintInfo = ChronicleGrounder.resolveShopkeeperItemHint(item, storeName);
                title = `Acquisition: ${item}`;
                const itemDisplay = count > 1 ? `${count} ${item}` : item;
                prose = `Counting out ${price} gold upon the counter, ${name} purchases ${itemDisplay} at the ${storeName}. ${hintInfo.keeper.name} slides the goods forward with a knowing nod.`;
                dialogue = {
                    speaker: hintInfo.keeper.name,
                    text: hintInfo.dialogue.replace(/"/g, ''),
                    isNoise: false,
                    recommendedVoice: hintInfo.keeper.voice,
                    voiceProfile: {
                        geminiVoice: hintInfo.keeper.geminiVoice,
                        edgeVoice: hintInfo.keeper.voice,
                        directorNote: hintInfo.keeper.directorNote
                    }
                };
                insight = hintInfo.insight;
                break;
            }

            case 'LEVEL_FEELING': {
                const fText = (event.data && event.data.feelingText) ? event.data.feelingText : 'a strange aura';
                const fLower = fText.toLowerCase();
                if (fLower.includes('tame') || fLower.includes('sheltered') || fLower.includes('quiet') || fLower.includes('peaceful') || fLower.includes('reasonably safe')) {
                    title = 'Sheltered Vaults';
                    prose = `A rare, deceptive stillness hangs over the halls at ${depthFt}: ${fText}. Yet seasoned adventurers know that the deep pits of Angband never remain tranquil for long.`;
                } else if (fLower.includes('omens of death') || fLower.includes('murderous') || fLower.includes('terribly dangerous') || fLower.includes('sinister')) {
                    title = 'Dread Premonition';
                    prose = `A suffocating chill grips ${name}'s heart at ${depthFt}: ${fText}! The very stones seem steeped in ancient malice, warning that lethal horrors stalk this tier.`;
                } else if (fLower.includes("aren't many treasures") || fLower.includes('scant') || fLower.includes('poor')) {
                    title = 'Barren Caverns';
                    prose = `Testing the subterranean drafts at ${depthFt}, ${name} senses only cold dust and hollow cobwebs: ${fText}. Survival, rather than rich plunder, must be the goal of this delve.`;
                } else if (fLower.includes('superb treasures') || fLower.includes('rich') || fLower.includes('great treasures')) {
                    title = 'Glint of Ancient Wealth';
                    prose = `A tingling instinct stirs ${name}'s blood at ${depthFt}: ${fText}! Relics of elder kings and vaults of lost craft await discovery in the gloom.`;
                } else {
                    title = `Intuition in the Deep`;
                    prose = `An ancient premonition crawls along ${name}'s spine like winter frost at ${depthFt}: ${fText}. Every nerve tightens as the dungeon breathes its silent warning.`;
                }
                break;
            }

            case 'EXCAVATION': {
                const isCleared = event.data && event.data.cleared;
                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + (depth * 17));
                if (isCleared) {
                    title = 'Corridor Cleared';
                    const clearVariants = [
                        `With steady, rhythmic blows of pick and shovel, ${name} clears away the collapsed cavern rubble at ${depthFt}, reopening a traversable corridor through the dark!`,
                        `The final stubborn boulders give way under ${name}'s determined digging at ${depthFt}, opening the blocked passage into the vaults beyond.`,
                        `Sweeping aside shattered rock and crushed debris, ${name} unblocks the corridor at ${depthFt}, restoring a vital avenue of movement.`
                    ];
                    prose = clearVariants[turnSeed % clearVariants.length];
                    insight = "Clearing rubble unblocks tactical escape routes and can reveal hidden mineral veins.";
                } else {
                    title = 'Excavation in the Deep';
                    const digVariants = [
                        `Striking iron against stubborn stone, ${name} chips steadily away at the pile of collapsed rubble at ${depthFt}, rock dust rising in the flickering torchlight.`,
                        `With seasoned labor at ${depthFt}, ${name} digs into the obstruction, testing the density of the collapsed ceiling fall.`,
                        `Pebbles and grit scatter across the flagstones as ${name} works to carve a path through the debris-choked hallway.`
                    ];
                    prose = digVariants[turnSeed % digVariants.length];
                    insight = "Picks and shovels carve through collapsed rubble. Digging takes multiple turns; watch for roaming monsters.";
                }
                break;
            }

            case 'TREASURE_DISCOVERY': {
                const amt = (event.data && event.data.amount) ? event.data.amount : 0;
                const metal = (event.data && event.data.metal) ? event.data.metal : 'gold';
                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + (amt * 7) + (depth * 29));
                title = amt > 200 ? 'Rich Plunder' : 'Glint in the Dust';
                if (amt > 0) {
                    const treasureVariants = [
                        `Sweeping aside ancient subterranean dust at ${depthFt}, ${name} uncovers a cache of ${amt} gold pieces worth of ${metal}! The coins clink reassuringly into the adventurer's pouch.`,
                        `A glint of metallic brilliance catches the torchlight at ${depthFt}! ${name} retrieves ${amt} gold pieces worth of ${metal} scattered amongst the flagstones.`,
                        `Fortune smiles in the deep: ${name} gathers ${amt} gold pieces worth of ${metal} from the cold stone floor, adding precious wealth to the coffer.`
                    ];
                    prose = treasureVariants[turnSeed % treasureVariants.length];
                } else {
                    prose = `Amongst the dark rubble at ${depthFt}, ${name} discovers a glint of ancient treasure, securing the prize before resuming the descent.`;
                }
                insight = "Gold is essential for purchasing potions, food rations, spellbooks, and enchantments in the town shops.";
                break;
            }

            case 'DUNGEON_FEATURE': {
                const featMsg = (event.data && event.data.message) ? event.data.message : '';
                const featLower = featMsg.toLowerCase();
                if (featLower.includes('secret door') || featLower.includes('found a secret')) {
                    title = 'Secret Passage Unveiled';
                    prose = `Examining the seemingly solid masonry at ${depthFt}, ${name}'s keen fingers detect a hidden seam—a secret door pivots silently outward on ancient hinges!`;
                    insight = "Secret doors often lead to undisturbed treasure vaults and alternate stairways.";
                } else if (featLower.includes('disarm') || featLower.includes('trap')) {
                    title = 'Trap Disarmed';
                    prose = `With steady hands and bated breath at ${depthFt}, ${name} wedges a pin into the concealed mechanism, neutralizing the deadly trap before it can trigger.`;
                    insight = "Disarming traps yields experience points and clears safe retreat paths.";
                } else if (featLower.includes('bash') || featLower.includes('bursts open') || featLower.includes('smashes open')) {
                    title = 'Portal Breached';
                    prose = `Throwing full shoulder weight against the stubborn timbers at ${depthFt}, ${name} shatters the rusted lock, kicking the door wide open into the chamber beyond!`;
                    insight = "Bashing locked doors creates noise that can alert sleeping monsters in nearby rooms.";
                } else if (featLower.includes('lock') || featLower.includes('picked')) {
                    title = 'Lock Picked';
                    prose = `Working a slender iron pick into the archaic tumblers at ${depthFt}, ${name} turns the cylinder with a satisfying click, easing the door open without a sound.`;
                    insight = "Picking locks avoids noise, keeping slumbering guardians oblivious to your presence.";
                } else {
                    title = 'Dungeon Mystery';
                    prose = `Interacting with the ancient architecture at ${depthFt}, ${name} manipulates the stonework, adapting to the hazards of the labyrinth.`;
                }
                break;
            }

            case 'STATUS_RECOVERY': {
                const recMsg = (event.data && event.data.message) ? event.data.message : '';
                const recLower = recMsg.toLowerCase();
                if (recLower.includes('see again')) {
                    title = 'Vision Restored';
                    prose = `The suffocating blackness recedes from ${name}'s vision! Torchlight and stone resolve into sharp clarity once more.`;
                } else if (recLower.includes('confus')) {
                    title = 'Clarity Returns';
                    prose = `The dizzying fog lifts from ${name}'s mind—equilibrium and razor focus return in full measure.`;
                } else if (recLower.includes('poison') || recLower.includes('feel very good')) {
                    title = 'Purged of Venom';
                    prose = `The burning fire in ${name}'s veins subsides as the body purges the lingering poison, restoring natural vigor.`;
                } else if (recLower.includes('afraid')) {
                    title = 'Courage Restored';
                    prose = `Cold dread yields to steady resolve; ${name}'s heart beats calm and steadfast once more.`;
                } else {
                    title = 'Vitality Restored';
                    prose = `Shaking off lingering afflictions, ${name} stands firm, ready to face the perils ahead.`;
                }
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
                const fleeMon = event.data ? event.data.fleeingMonster : null;
                const atkMed = event.data ? event.data.attackMedium : null;
                const killSaga = this.generateKillSaga(kills, player, depth, traditionKey, weapon, fleeMon, atkMed);
                title = killSaga.title;
                prose = killSaga.prose;
                break;

            case 'EXPLORATION_FLOW':
            case 'EPISODE_SUMMARY': {
                title = 'Echoes in the Deep';
                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + (depth * 23) + (name ? name.length * 11 : 0));
                if (depth === 0) {
                    prose = ChronicleGrounder.pickNonRepeatingBark('exp_town', [
                        `Chill mountain wind whistles past timber eaves as ${name} strides the square, hand near ${weapon}.`,
                        `Peat smoke and roasting boar drift from the tavern across the cold cobblestones.`,
                        `The armorer's hammer rings out across town as ${name} patrols beneath a gray sky.`,
                        `Walking the frontier lanes, ${name} casts a wary glance toward the dark cellar-grates.`,
                        `Lanterns sway outside the General Store as ${name} checks pack straps and supplies.`,
                        `Frost rims the town well-stones while ${name} readies gear for the descent below.`,
                        `Seasoned mercenaries nod from the inn porch as ${name} crosses the market square.`,
                        `A cold draft rises from the iron stair archway, carrying the scent of deep stone.`
                    ], turnSeed);
                } else if (depth <= 5) {
                    prose = ChronicleGrounder.pickNonRepeatingBark('exp_upper', [
                        `Past cracked pillars at ${depthFt}, ${name} scouts the damp vault for ambushes.`,
                        `Torchlight flickers across rough granite and goblin scratchings at ${depthFt}.`,
                        `Water drips from unseen fissures at ${depthFt} as ${name} tests the flagstones for traps.`,
                        `A chill draft carries old dust and beast-musk through the halls at ${depthFt}.`,
                        `Bootsteps echo softly down a narrow stone corridor at ${depthFt}.`,
                        `Rusted iron sconces line the damp passage at ${depthFt}, long stripped of torches.`,
                        `Crushed bone and splintered shields litter a forgotten junction at ${depthFt}.`,
                        `Shadows stretch long across the cold masonry as ${name} advances at ${depthFt}.`
                    ], turnSeed);
                } else if (depth <= 15) {
                    prose = ChronicleGrounder.pickNonRepeatingBark('exp_mid', [
                        `Soot-blackened dwarven runes line the carved halls at ${depthFt}.`,
                        `At ${depthFt}, dark basalt columns rise into oppressive, unbroken gloom.`,
                        `The air at ${depthFt} tastes of cold iron as distant tremors hum through the rock.`,
                        `Hugging the stone wall at ${depthFt}, ${name} listens for the scrape of steel.`,
                        `Frost and damp moss cling to ancient vault doors at ${depthFt}.`,
                        `A draft from deeper chasms sets ${name}'s light wavering at ${depthFt}.`,
                        `Chipped statues of forgotten kings stare blindly across the hall at ${depthFt}.`,
                        `Every archway at ${depthFt} breathes the cold silence of deep earth.`
                    ], turnSeed);
                } else {
                    prose = ChronicleGrounder.pickNonRepeatingBark('exp_deep', [
                        `Immense subterranean heat and brimstone rise through cracked basalt at ${depthFt}.`,
                        `In the crushing gloom of ${depthFt}, ancient malice presses against the light.`,
                        `Predatory shadows coil just beyond the torch-ring at ${depthFt}.`,
                        `The black stone at ${depthFt} thrums with the heartbeat of the Iron Hell.`,
                        `Sulfurous vapor curls along the vault floor at ${depthFt} as ${name} presses on.`,
                        `Even the silence at ${depthFt} feels watchful, heavy with primeval dread.`,
                        `Scars of ancient dragon-fire blacken the Cyclopean walls at ${depthFt}.`,
                        `At ${depthFt}, only cold resolve keeps ${name}'s stride steady in the abyss.`
                    ], turnSeed);
                }
                break;
            }

            case 'ARTIFACT_AWAKENING':
                const artName = event.data ? event.data.artifactName : 'Ancient Relic';
                title = `Awakening: ${artName}`;
                const lore = this.CANON_ARTIFACT_LORE[artName] || 'A sacred relic forged in the First Age of the world.';
                prose = `As ${name} brushes the grime from the ancient relic, a chill of awe ripples through the hall. ${lore}`;
                insight = "Artifacts cannot be destroyed by fire, acid, or electrical breaches. Guard them well.";
                break;

            case 'FLOOR_CHANGE':
            default: {
                const d = event.data ? event.data.newDepth : 1;
                const oldD = event.data && event.data.oldDepth !== undefined ? event.data.oldDepth : (depth || 0);
                const isDescent = d > oldD;
                title = isDescent ? `Descent to ${d * 50} Feet` : `Ascent to ${d === 0 ? 'the Surface' : `${d * 50} Feet`}`;
                const turnSeed = Math.abs((player ? player.turn || 0 : 0) + (d * 19));

                if (isDescent) {
                    if (traditionKey === 'khazad') {
                        prose = ChronicleGrounder.pickNonRepeatingBark('floor_khazad', [
                            `Down the stone stair ${name} treads to ${d * 50} feet, where ancient granite rings under stout boots.`,
                            `At ${d * 50} feet, ${name} reads the deep mountain strata scarred by primeval fire.`,
                            `Iron-bound steps lead down to ${d * 50} feet; ${name} readies shield and steel.`,
                            `The air grows heavier at ${d * 50} feet, smelling of deep ore and goblin soot.`,
                            `Stepping off the stair at ${d * 50} feet, ${name} murmurs a grim Khuzdul ward.`
                        ], turnSeed);
                    } else if (traditionKey === 'noldor') {
                        prose = ChronicleGrounder.pickNonRepeatingBark('floor_noldor', [
                            `Down the damp stairwell ${name} descends to ${d * 50} feet, into masonry hewn by thralls.`,
                            `Darkness thickens like black velvet as ${name} steps into ${d * 50} feet.`,
                            `Starlight fades to memory at ${d * 50} feet, ${name}'s hand firm upon ${weapon}.`,
                            `A cold sigh rises from the vaults of ${d * 50} feet as ${name} crosses the threshold.`,
                            `At ${d * 50} feet, the shadow of the Iron Crown weighs heavier upon the stone.`
                        ], turnSeed);
                    } else {
                        prose = ChronicleGrounder.pickNonRepeatingBark('floor_westmarch', [
                            `Down the worn stone stair ${name} descends to ${d * 50} feet, into older, darker masonry.`,
                            `The iron steps groan behind as ${name} reaches ${d * 50} feet, where cold iron scents the air.`,
                            `Through broken vaults at ${d * 50} feet, rough stone gives way to primeval basalt.`,
                            `At ${d * 50} feet, the torch flame shrinks against the pressing subterranean cold.`,
                            `Stepping from the stairwell at ${d * 50} feet, ${name} listens to the deep silence.`
                        ], turnSeed);
                    }
                } else {
                    prose = ChronicleGrounder.pickNonRepeatingBark('floor_ascent', [
                        `Climbing the worn stairs to ${d === 0 ? 'the surface' : `${d * 50} feet`}, ${name} breathes lighter air.`,
                        `Up the stone steps toward ${d === 0 ? 'town' : `${d * 50} feet`}, the crushing weight of the deep eases.`,
                        `Ascending to ${d === 0 ? 'the frontier sky' : `${d * 50} feet`}, ${name} leaves the deeper shadows behind.`
                    ], turnSeed);
                }
                break;
            }
        }

        // Suppress repetitive "at 50ft" tags on consecutive turns within the same dungeon depth
        const curTurn = (player && typeof player.turn === 'number') ? player.turn : null;
        const prevState = this._lastNarrativeState || {};
        if (
            prose &&
            depth > 0 &&
            prevState.depth === depth &&
            prevState.turn !== null &&
            curTurn !== null &&
            curTurn > prevState.turn &&
            (curTurn - prevState.turn) <= 20 &&
            event.type !== 'FLOOR_CHANGE' &&
            event.type !== 'HERO_DEATH' &&
            event.type !== 'LEVEL_FEELING'
        ) {
            prose = prose.replace(new RegExp(`\\s+at\\s+${depthFt}\\b`, 'i'), '');
        }
        this._lastNarrativeState = {
            depth,
            eventType: event ? event.type : null,
            turn: curTurn
        };

        return {
            title: title,
            prose: prose,
            dialogue: dialogue,
            insight: insight,
            depth: player ? (player.depth || 0) : 0,
            summary: prose.substring(0, 160) + '...',
            isDeath: (event.type === 'HERO_DEATH')
        };
    }

    /**
     * Context-Aware Narrative Catch-Up Synthesizer:
     * When multiple actions take place during active speech (attacks, damage, potions, spells, kills),
     * consolidates the entire unvoiced event ledger into a single flowing, cohesive Tolkien saga beat.
     * Prevents narration thrashing and catches up the story to the character's exact live state.
     */
    static generateCatchUpBeat(events, initialPlayer, livePlayer, traditionKey = 'westmarch') {
        const player = livePlayer || initialPlayer;
        if (!events || events.length === 0) {
            return {
                title: 'Vigil in the Deep',
                prose: 'The shadows shift along the damp corridor walls as the hero maintains a watchful stance, senses attuned to the oppressive quiet of the deep.',
                dialogue: null,
                insight: null,
                depth: player ? (player.depth || 0) : 0,
                isCatchUp: true
            };
        }

        if (events.length === 1) {
            const single = this.generateProceduralChapter(events[0], player, traditionKey);
            single.isCatchUp = true;
            const evType = events[0].type;
            const isMove = (evType === 'HERO_MOVE' || evType === 'EXPLORATION_FLOW' || evType === 'STEP');
            single.actionBreakdown = {
                total: 1,
                paces: isMove ? 1 : 0,
                strikes: isMove ? 0 : 1,
                spells: 0,
                potions: 0,
                discoveries: 0,
                summaryText: isMove ? '1 pace' : '1 action'
            };
            return single;
        }

        const name = (player && player.name) ? player.name : 'The Wanderer';
        const depth = (player && typeof player.depth === 'number') ? player.depth : 0;
        const depthFt = depth === 0 ? 'the surface frontier' : `${depth * 50}ft`;
        const rawWeap = (player && player.weapon_item) ? player.weapon_item : ((player && player.equipped && player.equipped.weapon) ? player.equipped.weapon : null);
        const weapon = rawWeap ? rawWeap.replace(/\s*\([^)]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').trim() : 'bare fists';

        // Metric extraction across all events
        const killSet = new Set();
        const assailantSet = new Set();
        let totalDamageTaken = 0;
        let potionsQuaffed = 0;
        let spellsCast = 0;
        let paces = 0;
        let strikes = 0;
        const spellNames = [];
        const statusAfflictions = [];
        const statusRecoveries = [];
        let treasureFound = 0;
        let secretFound = false;
        let excavationDone = false;
        let uniqueSlain = null;
        let vocalCreature = null;

        for (const ev of events) {
            const data = ev.data || {};
            // Movement paces & strikes
            if (ev.type === 'HERO_MOVE' || ev.type === 'EXPLORATION_FLOW' || ev.type === 'FLOOR_CHANGE' || ev.type === 'STEP') {
                paces++;
            }
            if (ev.type === 'COMBAT_EXCHANGE' || ev.type === 'HERO_ATTACK' || ev.type === 'COMBAT_EPISODE') {
                strikes++;
            }
            // Kills
            if (data.kills && Array.isArray(data.kills)) {
                for (const k of data.kills) {
                    const kName = typeof k === 'string' ? k : (k.monsterName || k.name || '');
                    if (kName) killSet.add(kName);
                }
            }
            if (data.monsterName && (ev.type === 'MONSTER_DIES' || ev.type === 'SLAIN')) {
                killSet.add(data.monsterName);
            }
            if (ev.type === 'UNIQUE_SLAIN' && data.monsterName) {
                uniqueSlain = data.monsterName;
                killSet.add(data.monsterName);
            }

            // Incoming attacks / assailants
            if (data.incomingAttacks && Array.isArray(data.incomingAttacks)) {
                for (const ia of data.incomingAttacks) {
                    if (ia.monsterName) assailantSet.add(ia.monsterName);
                    if (typeof ia.damage === 'number') totalDamageTaken += ia.damage;
                    const vProf = this.classifyCreature({ name: ia.monsterName, glyph: ia.glyph });
                    if (vProf && vProf.isVocal && !vocalCreature) vocalCreature = ia;
                }
            }
            if (data.monsterName && ev.type === 'MONSTER_ATTACK') {
                assailantSet.add(data.monsterName);
            }

            // Hero Attacks / Spells
            if (data.attackMedium && (data.attackMedium.type === 'spell' || data.attackMedium.method === 'spell')) {
                spellsCast++;
                if (data.attackMedium.name) spellNames.push(data.attackMedium.name);
            }

            // Potions & Healing
            if (ev.type === 'POTION_QUAFFED' || ev.type === 'HEALING_DRAUGHT' || (data.item && data.item.toLowerCase().includes('potion'))) {
                potionsQuaffed++;
            }

            // Statuses
            if (ev.type === 'PLAYER_STATUS' && data.status) {
                statusAfflictions.push(data.status);
            }
            if (ev.type === 'STATUS_RECOVERY') {
                statusRecoveries.push(data.recovery || 'vision');
            }

            // Exploration
            if (ev.type === 'TREASURE_DISCOVERY' && (data.amount || data.gold)) {
                treasureFound += (data.amount ?? data.gold);
            }
            if (ev.type === 'DUNGEON_FEATURE' && ((data.feature && data.feature.includes('door')) || (data.message && data.message.includes('door')) || (data.text && data.text.includes('door')))) {
                secretFound = true;
            }
            if (ev.type === 'EXCAVATION') {
                excavationDone = true;
            }
        }

        const kills = Array.from(killSet);
        const assailants = Array.from(assailantSet);
        const currentHp = player ? (player.hp ?? player.chp ?? 1) : 1;
        const maxHp = player ? (player.hp_max ?? player.mhp ?? 1) : 1;
        const hpPercent = currentHp / maxHp;
        const inMortalPeril = hpPercent < 0.35;

        // Build Title
        let title = 'Tides of Battle';
        if (uniqueSlain) {
            title = `Bane of ${uniqueSlain}`;
        } else if (kills.length > 1) {
            title = 'Sweeping Counter-Stroke';
        } else if (kills.length === 1) {
            title = `Felling of the ${kills[0]}`;
        } else if (inMortalPeril) {
            title = 'Desperate Standoff';
        } else if (potionsQuaffed > 0 && assailants.length > 0) {
            title = 'Hard-Fought Reprieve';
        } else if (treasureFound > 0 || secretFound) {
            title = 'Discoveries in the Deep';
        }

        // Build Multi-Clause Saga Prose
        const clauses = [];

        // Clause 1: The Ongoing Struggle / Onslaught
        if (assailants.length > 0) {
            const foeDesc = assailants.length === 1 ? `the ferocious ${assailants[0]}` : (assailants.length === 2 ? `the ${assailants[0]} and ${assailants[1]}` : `a savage pack of foes`);
            if (traditionKey === 'khazad') {
                if (totalDamageTaken > 15 || inMortalPeril) {
                    clauses.push(`Enduring a battering onslaught from ${foeDesc} amidst the ancient granite roots at ${depthFt}, ${name} absorbs heavy blows through dented mail, teeth gritted in stubborn dwarven defiance`);
                } else {
                    clauses.push(`Trading furious blows with ${foeDesc} in the narrow stone passages at ${depthFt}, ${name} stands firm as an iron anvil`);
                }
            } else if (traditionKey === 'noldor') {
                if (totalDamageTaken > 15 || inMortalPeril) {
                    clauses.push(`Beset by the cruel malice of ${foeDesc} deep at ${depthFt}, where Morgoth's shadow weighs heavy upon the earth, ${name} parries desperately through a storm of strikes`);
                } else {
                    clauses.push(`Engaging ${foeDesc} in a swift dance of steel and starlight at ${depthFt}, ${name} maneuvers gracefully across the damp stones`);
                }
            } else {
                if (totalDamageTaken > 15 || inMortalPeril) {
                    clauses.push(`Hard-pressed by ${foeDesc} in the subterranean gloom at ${depthFt}, ${name} weathers bruising strikes as blood darkens the cold flagstones`);
                } else {
                    clauses.push(`Locked in fierce combat against ${foeDesc} at ${depthFt}, ${name} trades swift blows in the flickering torchlight`);
                }
            }
        } else if (excavationDone || treasureFound > 0 || secretFound) {
            clauses.push(`Carving a determined path through the ancient subterranean chambers at ${depthFt}, ${name} sweeps aside the dust of forgotten ages`);
        } else {
            clauses.push(`Pressing forward into the dark vaults of ${depthFt}, ${name} confronts the lurking terrors of the deep`);
        }

        // Clause 2: Tactical Adaptation (Potions, Spells, Statuses)
        if (potionsQuaffed > 0) {
            clauses.push(`hastily seizing a vital opening to quaff a restorative draught, feeling life and warmth surge back into weary limbs`);
        } else if (spellsCast > 0) {
            const sName = spellNames[0] || 'eldritch sorcery';
            clauses.push(`channeling the fiery resonance of ${sName} to blast back the advancing darkness`);
        } else if (statusAfflictions.length > 0 && statusRecoveries.length > 0) {
            clauses.push(`fighting through dizzying poison and blindness until sharp clarity returns`);
        } else if (statusAfflictions.length > 0) {
            clauses.push(`staggering under foul affliction yet refusing to yield a single inch of ground`);
        }

        // Clause 3: Resolution / Climax (Kills, Retreat, or Resolute Stance)
        if (uniqueSlain) {
            clauses.push(`before driving ${weapon} home in a legendary death-blow that silences the dread ${uniqueSlain} forever, sealing their doom in the annals of the Living Chronicle!`);
        } else if (kills.length > 1) {
            clauses.push(`before unleashing a whirlwind counter-attack that fells ${kills[0]} and ${kills[1]} lifeless across the stones!`);
        } else if (kills.length === 1) {
            clauses.push(`before driving ${weapon} clean through the defenses of the ${kills[0]}, sending the creature crashing dead upon the dungeon floor!`);
        } else if (treasureFound > 0 && secretFound) {
            clauses.push(`uncovering a hidden seam in the masonry that yields a cache of ${treasureFound} gold pieces!`);
        } else if (treasureFound > 0) {
            clauses.push(`gathering a scattered hoard of ${treasureFound} gold pieces before turning weapons toward the next shadow.`);
        } else if (inMortalPeril) {
            clauses.push(`and bracing desperately against the cold masonry with ${weapon} raised, poised on the razor edge of life and death!`);
        }

        // Assemble flowing sentence
        let prose = clauses.join(', ');
        if (!prose.endsWith('.') && !prose.endsWith('!')) prose += '.';

        // Capitalize first letter
        prose = prose.charAt(0).toUpperCase() + prose.slice(1);

        // Vocal dialogue if enemy barked
        let dialogue = null;
        if (vocalCreature) {
            const vProf = this.classifyCreature({ name: vocalCreature.monsterName, glyph: vocalCreature.glyph });
            if (vProf && vProf.assaultBark) {
                dialogue = {
                    speaker: vocalCreature.monsterName,
                    text: vProf.assaultBark(vocalCreature.action).replace(/"/g, ''),
                    isNoise: false,
                    recommendedVoice: vProf.recommendedVoice
                };
            }
        }

        const parts = [];
        if (paces > 0) parts.push(`${paces} pace${paces > 1 ? 's' : ''}`);
        if (strikes > 0) parts.push(`${strikes} strike${strikes > 1 ? 's' : ''}`);
        if (spellsCast > 0) parts.push(`${spellsCast} spell${spellsCast > 1 ? 's' : ''}`);
        if (potionsQuaffed > 0) parts.push(`${potionsQuaffed} potion${potionsQuaffed > 1 ? 's' : ''}`);
        if (kills.length > 0) parts.push(`${kills.length} kill${kills.length > 1 ? 's' : ''}`);
        const summaryText = parts.length > 0 ? parts.join(', ') : `${events.length} action${events.length > 1 ? 's' : ''}`;

        const actionBreakdown = {
            total: events.length,
            paces,
            strikes,
            spells: spellsCast,
            potions: potionsQuaffed,
            discoveries: (treasureFound > 0 ? 1 : 0) + (secretFound ? 1 : 0) + (excavationDone ? 1 : 0),
            summaryText
        };

        return {
            title: title,
            prose: prose,
            dialogue: dialogue,
            insight: inMortalPeril ? "When health drops below 30%, prioritize escape with Phase Door or Word of Recall!" : null,
            depth: depth,
            summary: prose.substring(0, 160) + '...',
            isCatchUp: true,
            actionBreakdown
        };
    }

    /**
     * Generates on-demand contextual story prompt narratives ("Spin Tale").
     * The Master Narrator weaves a tailored saga reflection incorporating:
     * - Hero identity (name, race, class, vigor)
     * - Realm lore & strict mechanical invariants (Tolkien vs Beleriand vs Amber vs Sengoku)
     * - Physical environment & depth (feet)
     * - Immediate nearby threats & visibility
     * - Diegetic tactical advice (light, corridor funneling, potion conservation)
     */
    static generateStoryPromptBeat(hero = null, dungeonContext = {}, realmKey = null, langMode = 'en') {
        const rk = (realmKey || (typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function' ? window.__app.getActiveRealm() : 'angband')).toLowerCase();
        const effLang = (rk === 'hengband') ? (langMode || (typeof window !== 'undefined' && window.__langMode ? window.__langMode : 'en')).toLowerCase() : 'en';

        const name = (hero && hero.name) ? hero.name : 'the traveler';
        const depth = (hero && typeof hero.depth === 'number') ? hero.depth : 0;
        const depthFt = depth === 0 ? 'the surface town' : `${depth * 50} feet`;
        const curHp = (hero && typeof hero.hp === 'number') ? hero.hp : 1;
        const maxHp = (hero && typeof hero.hp_max === 'number') ? hero.hp_max : 1;
        const hpRatio = maxHp > 0 ? (curHp / maxHp) : 1.0;
        const inPeril = hpRatio < 0.35;

        const monsters = dungeonContext.nearbyMonsters || [];
        const lightTurns = typeof dungeonContext.lightTurns === 'number' ? dungeonContext.lightTurns : 500;
        const lowLight = depth > 0 && lightTurns < 120;
        const potions = typeof dungeonContext.potions === 'number' ? dungeonContext.potions : 1;

        let title = `🔮 Tale of ${name}`;
        if (depth === 0) title = `🔮 Tale of the Frontier Square`;
        else if (inPeril) title = `🔮 Tale of the Razor Edge`;
        else title = `🔮 Tale of ${depthFt}`;

        let opening = '';
        let threatClause = '';
        let adviceClause = '';

        if (rk === 'silq') {
            title = depth === 0 ? '🔮 Tale of the Iron Gates' : `🔮 Tale of Angband: -${depth * 50} Feet`;
            if (inPeril) {
                opening = `Beset by the cruel malice of Morgoth's thralls deep beneath the Iron Mountains, ${name}'s breath comes ragged, mortal wounds bleeding through torn mail.`;
                adviceClause = `Yield not to despair, child of the Eldar. The Iron Hell devours the proud; summon the quiet stealth of thy ancestors, slip into the shadowed recesses of the stone, and let thy Song of Staying mend thy battered spirit before Bauglir's hounds scent thy blood.`;
            } else {
                opening = `Here in the grim subterranean fortress of Angband, where the black smoke of Thangorodrim blots out all memory of the Undying Lands, ${name} moves with measured, quiet footfalls.`;
                adviceClause = `Trust in stealth and steadfast Will, for in Beleriand there are no alchemical remedies to purchase in surface markets. Conserve thy strength, tread soft upon the cold rock, and let no hasty strike betray thy presence to the watchers of the pit.`;
            }
            if (monsters.length > 0) {
                threatClause = ` The heavy tread of ${monsters[0].name} echoes through the gloom but a few paces distant, their iron spears scraping the damp stone.`;
            }
        } else if (rk === 'frogcomposband') {
            title = depth === 0 ? '🔮 Tale of the Outpost' : `🔮 Tale of the Wild Depths`;
            if (inPeril) {
                opening = `At the turbulent nexus of the multiverse, where the shadows of Chaos gnaw at the edges of reality, ${name} falters under harrowing assault, blood staining the shifting stones.`;
                adviceClause = `The probabilities of the Pattern fray around thee! Retreat toward the known path, invoke a Phase Door scroll if thy satchel holds one, and stand not in the open to be consumed by the wild flux of the deep.`;
            } else {
                opening = `Pausing amidst the shifting corridors of the deep vaults, ${name} listens to the strange, discordant humming of the ancient multiverse.`;
                adviceClause = `Watch thy surroundings with vigilance, wanderer. In this chaotic frontier, creatures mutate and evolve beyond comprehension—lure them around solid corners and test their defenses with care.`;
            }
            if (monsters.length > 0) {
                threatClause = ` A menacing ${monsters[0].name} stalks through the outer dark, its alien eyes reflecting the torchlight.`;
            }
        } else if (rk === 'hengband') {
            title = depth === 0 ? '🔮 Tale of the Shrine' : `🔮 Tale of the Caverns: ${depthFt}`;
            if (effLang === 'jp') {
                if (inPeril) {
                    opening = `深き地下窟にて、${name}の足取りは重く、深手を負いて刃を支えとす。死線の気配が静かに漂う。`;
                    adviceClause = `無謀なる突撃は破滅を招く。一度間合いを取り、階段へと身を引きて傷を癒すべし。生きてこそ武士の道あり。`;
                } else {
                    opening = `静まり返りし地下${depthFt}の回廊にて、${name}は油断なく抜刀の構えを保ち、暗闇の奥を見据える。`;
                    adviceClause = `闇に潜む鬼や野伏を侮るなかれ。狭き通路を背にし、一対一の戦いを挑むことこそ勝利への道なり。`;
                }
                if (monsters.length > 0) {
                    threatClause = ` 前方の陰より、${monsters[0].name}が不気味に蠢き寄り迫る。`;
                }
            } else {
                // English Feudal Lore
                if (inPeril) {
                    opening = `High in the subterranean caverns at ${depthFt}, ${name} leans heavily upon the hilt of drawn steel, wounds bleeding dark upon the cold bedrock.`;
                    adviceClause = `No warrior finds honor in reckless doom. Step backward to the stairs, bind thy bleeding wounds, and let patience restore thy martial vigor before the mountain beasts scent thy weakness.`;
                } else {
                    opening = `Amidst the shadowed basalt corridors of ${depthFt}, ${name} stands vigilant, hand resting steady upon the leather-wrapped hilt.`;
                    adviceClause = `Remember the ancient wisdom of the blade: in open chambers, beasts swarm from every flank. Draw them one by one into the narrow doorway, where thy steel alone shall decide the duel.`;
                }
                if (monsters.length > 0) {
                    threatClause = ` The menacing growl of a ${monsters[0].name} breaks the silence ahead, claws scraping against the stone.`;
                }
            }
        } else {
            // Vanilla Angband
            if (inPeril) {
                opening = `Hard-pressed in the subterranean gloom of ${depthFt}, ${name} weathers bruising strikes as blood darkens the cold flagstones, peril looming close at hand.`;
                adviceClause = `Thy wounds plead for respite, traveler! In these treacherous pits, pride is the precursor to a shallow grave. Retreat to the ascending stairs, quaff a healing draught from thy satchel, and renew thy guard before the darkness claims thee.`;
            } else {
                opening = `At a measured depth of ${depthFt}, ${name} treads through ancient vaulted chambers, the weight of the mountain pressing down like primeval iron.`;
                adviceClause = `Heed the counsel of the deep, adventurer: open vaults invite lethal surrounding swarms, while the 1-tile corridor turns a frantic ambush into an orderly duel. Keep thy light replenished, and never delve without scrolls of escape.`;
            }
            if (monsters.length > 0) {
                threatClause = ` In the flickering torchlight, a ${monsters[0].name} snarls in the adjoining passage, scenting fresh blood.`;
            }
            if (lowLight) {
                adviceClause = `Thy light flickers low and frail upon the damp walls! Delve no further into the gloom without fresh oil, lest the unseen horrors of Angband strike from absolute darkness.`;
            }
        }

        const prose = `${opening}${threatClause} ${adviceClause}`.trim();
        const arch = this.getStoryArchitecture(rk, depth);
        const crossroads = this.getMythicCrossroads(rk, depth, hero);

        return {
            title: title,
            prose: prose,
            dialogue: null,
            isStoryPrompt: true,
            depth: depth,
            storyArcBadge: arch ? arch.currentDivision : null,
            crossroads: crossroads,
            recommendedVoice: this.getLorekeeperVoice(rk),
            summary: prose.substring(0, 160) + '...'
        };
    }

    static REALM_STORY_ARCHITECTURES = {
        angband: {
            realm: 'angband',
            collectionTitle: 'Books of the Siege of Angband',
            divisionUnit: 'Book',
            divisions: [
                { maxDepth: 0, badge: 'Book I • Frontier of Men', title: 'Book I: The Vigil Above the Iron Pits' },
                { maxDepth: 25, badge: 'Book II • The Upper Delvings', title: 'Book II: Echoes in the Goblin Fastness' },
                { maxDepth: 60, badge: 'Book III • Vaults of Thangorodrim', title: 'Book III: Where Ancient Wyrms Slumber' },
                { maxDepth: 999, badge: 'Book IV • The Throne of Bauglir', title: 'Book IV: The Last Descent to Morgoth' }
            ]
        },
        silq: {
            realm: 'silq',
            collectionTitle: 'Cantos of the Lay of Leithian',
            divisionUnit: 'Canto',
            divisions: [
                { maxDepth: 3, badge: 'Canto I • Gates of Doriath', title: 'Canto I: Beneath the Eaves of Beleriand' },
                { maxDepth: 10, badge: 'Canto II • Shadows of Taur-nu-Fuin', title: 'Canto II: The Whispering Stair & Silent Blade' },
                { maxDepth: 17, badge: 'Canto III • Forges of Angband', title: 'Canto III: Anvils of the Fallen Noldor' },
                { maxDepth: 999, badge: 'Canto IV • The Iron Crown', title: 'Canto IV: The Silmaril in the Dark' }
            ]
        },
        frogcomposband: {
            realm: 'frogcomposband',
            collectionTitle: 'Shadow Walks & Arcana Readings',
            divisionUnit: 'Arcana',
            divisions: [
                { maxDepth: 0, badge: 'Arcana I • Outpost of Shadows', title: 'Arcana I: The Crossroads of the Multiverse' },
                { maxDepth: 30, badge: 'Arcana II • Shifting Courts', title: 'Arcana II: Walking the Broken Pattern' },
                { maxDepth: 65, badge: 'Arcana III • The Logrus Flux', title: 'Arcana III: Lords of Chaos & Wyrd' },
                { maxDepth: 999, badge: 'Arcana IV • The Serpent of the Abyss', title: 'Arcana IV: Twilight of the Elder Gods' }
            ]
        },
        hengband: {
            realm: 'hengband',
            collectionTitle: 'Scrolls of the Five Rings (五輪書)',
            divisionUnit: 'Scroll',
            divisions: [
                { maxDepth: 0, badge: '地之巻 • Scroll of Earth', title: 'Scroll of Earth (地之巻): Foundation of the Way' },
                { maxDepth: 20, badge: '水之巻 • Scroll of Water', title: 'Scroll of Water (水之巻): Flowing Steel in the Dark' },
                { maxDepth: 45, badge: '火之巻 • Scroll of Fire', title: 'Scroll of Fire (火之巻): Clash of Sengoku Spirits' },
                { maxDepth: 75, badge: '風之巻 • Scroll of Wind', title: 'Scroll of Wind (風之巻): Secrets of the Ten Realms' },
                { maxDepth: 999, badge: '空之巻 • Scroll of the Void', title: 'Scroll of the Void (空之巻): Beyond Life and Death' }
            ]
        }
    };

    static MYTHIC_VOWS_BY_REALM = {
        angband: [
            {
                id: 'vanguard',
                label: '⚔️ Oath of the Iron Vanguard',
                epithet: 'Iron-Sworn of the West',
                summary: 'Stand unyielding in narrow corridors and meet Morgoth’s captains blade to blade.',
                counsel: 'Hold 1-tile choke points; keep Phase Door & Cure Critical Wounds at the ready.'
            },
            {
                id: 'flame',
                label: '🔥 Covenant of the Secret Fire',
                epithet: 'Keeper of the Unquenched Flame',
                summary: 'Wield arcane light, rods, and high-magic wands to purge the subterranean dark.',
                counsel: 'Preserve mana and device charges for high-threat breeders and summoner uniques.'
            },
            {
                id: 'warden',
                label: '🛡️ Warden of the Shadowed Stair',
                epithet: 'Wayfarer of the Deep Stairs',
                summary: 'Prioritize survival, detection, and measured retreats over reckless glory.',
                counsel: 'Never fight blind; detect monsters on every new floor and retreat before HP drops below 40%.'
            }
        ],
        silq: [
            {
                id: 'finrod',
                label: '🎵 Oath of Finrod’s Harp',
                epithet: 'Singer in the Deep Gloom',
                summary: 'Weave Songs of Elbereth, Silence, and Staying to master the unseen vaults.',
                counsel: 'Chant Songs of Silence near sleeping packs; conserve Voice for dire encounters.'
            },
            {
                id: 'beren',
                label: '🌑 Vow of Beren’s Quiet Step',
                epithet: 'Shadow-Walker of Taur-nu-Fuin',
                summary: 'Pass unseen past Balrogs and sleeping legions to claim the Silmaril by guile.',
                counsel: 'Avoid waking Orc patrols; close doors behind you and strike only isolated sentries.'
            },
            {
                id: 'celebrimbor',
                label: '🔨 Anvil-Oath of Celebrimbor',
                epithet: 'Rune-Smith of Eregion',
                summary: 'Seek the subterranean anvils to forge masterwork Noldorin arms and mithril mail.',
                counsel: 'Invest Grace into Smithing early and craft slaying or protection runes at the first anvil.'
            }
        ],
        frogcomposband: [
            {
                id: 'pattern',
                label: '🧭 Walker of the Pattern of Amber',
                epithet: 'Scion of the True Pattern',
                summary: 'Impose order upon the chaotic wilderness and master tactical positioning.',
                counsel: 'Use wilderness towns and quest citadels to gear up before diving past 1500ft.'
            },
            {
                id: 'logrus',
                label: '🔮 Initiate of the Courts of Chaos',
                epithet: 'Channeler of the Wyrd Flux',
                summary: 'Embrace eldritch mutations, patron boons, and high-variance arcane power.',
                counsel: 'Monitor mutation side-effects and keep resistance gear swapped for elemental breathers.'
            },
            {
                id: 'trump',
                label: '🃏 Dealer of the Shifting Trumps',
                epithet: 'Master of the Painted Arcana',
                summary: 'Bend space, teleportation, and dimensional summons to outmaneuver deadly foes.',
                counsel: 'Use Trump and dimensional translocation to control line-of-sight against ranged casters.'
            }
        ],
        hengband: [
            {
                id: 'niten',
                label: '⚔️ Way of the Two Heavens (二天一流)',
                epithet: 'Seeker of the Empty Sky',
                summary: 'Walk Miyamoto Musashi’s path of decisive, unhesitating martial mastery.',
                counsel: 'Lure dangerousoni and wyrms to pillar corners to prevent breath crossfire.'
            },
            {
                id: 'shinobi',
                label: '🌑 Scroll of the Unseen Shadow (忍法帳)',
                epithet: 'Walker in the Moonless Mist',
                summary: 'Strike from darkness with Kawarimi escapes, speed, and lethal precision.',
                counsel: 'Keep escape scrolls and teleportation ready before engaging fast Sengoku uniques.'
            },
            {
                id: 'onmyo',
                label: '⛩️ Seal of the Onmyōji (陰陽道)',
                epithet: 'Diviner of the Five Elements',
                summary: 'Harmonize Yin and Yang through talismans, divination, and elemental warding.',
                counsel: 'Layer elemental resistances and enlightenment before descending into quest citadels.'
            }
        ]
    };

    static getStoryArchitecture(realmKey = 'angband', depth = 0) {
        const rk = String(realmKey || 'angband').toLowerCase();
        const arch = this.REALM_STORY_ARCHITECTURES[rk] || this.REALM_STORY_ARCHITECTURES.angband;
        const d = Math.max(0, Number(depth) || 0);
        const div = arch.divisions.find(item => d <= item.maxDepth) || arch.divisions[arch.divisions.length - 1];
        return {
            realm: arch.realm,
            collectionTitle: arch.collectionTitle,
            divisionUnit: arch.divisionUnit,
            currentDivision: div.badge,
            currentTitle: div.title
        };
    }

    static getMythicCrossroads(realmKey = 'angband', depth = 0, hero = null) {
        const rk = String(realmKey || 'angband').toLowerCase();
        const vows = this.MYTHIC_VOWS_BY_REALM[rk] || this.MYTHIC_VOWS_BY_REALM.angband;
        const arch = this.getStoryArchitecture(rk, depth);
        const heroName = (hero && hero.name) ? hero.name : 'Adventurer';
        return {
            realm: rk,
            heading: `${arch.currentDivision} — Mythic Crossroads`,
            prompt: `How shall ${heroName} inscribe their vow upon the ${arch.collectionTitle}?`,
            choices: vows
        };
    }

    static resolveVowConsequenceBeat(vowId, hero = null, realmKey = 'angband', langMode = 'en') {
        const rk = String(realmKey || 'angband').toLowerCase();
        const vows = this.MYTHIC_VOWS_BY_REALM[rk] || this.MYTHIC_VOWS_BY_REALM.angband;
        const chosen = vows.find(v => v.id === vowId) || vows[0];
        const name = (hero && hero.name) ? hero.name : 'the hero';
        const depth = (hero && typeof hero.depth === 'number') ? hero.depth : 0;
        const arch = this.getStoryArchitecture(rk, depth);

        const prose = `Under the seal of ${arch.currentDivision}, ${name} swears the ${chosen.label.replace(/^[^\w\u3000-\u9fff]+\s*/, '')}, asumir the mantle of ${chosen.epithet}. ${chosen.summary}`.replace('asumir', 'assuming');
        return {
            title: `${chosen.label} — ${chosen.epithet}`,
            prose,
            insight: chosen.counsel,
            depth,
            isVowBeat: true,
            vowId: chosen.id,
            epithet: chosen.epithet,
            storyArcBadge: arch.currentDivision,
            recommendedVoice: this.getLorekeeperVoice(rk)
        };
    }

    static resolveParleyOutcome(monster, stance = 'parley', hero = null, realmKey = 'angband', langMode = 'en', recentMessages = []) {
        const rk = String(realmKey || 'angband').toLowerCase();
        const realmCtx = this.getRealmContext(rk);
        const mName = (monster && monster.name) ? monster.name : 'the creature';
        const heroName = (hero && hero.name) ? hero.name : 'the traveler';
        const heroRace = (hero && hero.race) ? hero.race : 'Adventurer';
        const heroClass = (hero && (hero.class || hero.cls)) ? (hero.class || hero.cls) : 'Wayfarer';
        const depth = (hero && typeof hero.depth === 'number') ? hero.depth : 0;
        const curHp = (hero && typeof hero.hp === 'number') ? hero.hp : 20;
        const maxHp = (hero && typeof hero.hp_max === 'number' && hero.hp_max > 0) ? hero.hp_max : 20;
        const heroHpPct = Math.round((curHp / maxHp) * 100);
        const heroStanceDesc = heroHpPct <= 35 ? 'bloodied yet unbroken' : (heroHpPct <= 70 ? 'battle-tested and watchful' : 'stalwart and unscathed');

        const mCurHp = (monster && typeof monster.hp === 'number') ? monster.hp : 10;
        const mMaxHp = (monster && typeof monster.hp_max === 'number' && monster.hp_max > 0) ? monster.hp_max : Math.max(1, mCurHp);
        const mHpPct = Math.round((mCurHp / mMaxHp) * 100);
        const mWoundDesc = mHpPct <= 30 ? ' reeling from grievous wounds' : (mHpPct < 95 ? ' bearing fresh battle-scars' : '');

        const locationDesc = depth <= 0
            ? (rk === 'silq' ? 'the threshold of the Iron Gates' : (rk === 'hengband' ? 'the lantern-lit town thoroughfare' : (rk === 'frogcomposband' ? 'the crossroads of the Outpost' : 'the cobblestone town square')))
            : `the ${depth * 50}-foot stratum (${realmCtx.setting.split(',')[0]})`;

        const tactics = this.resolveTacticalMonsterInsight(mName);
        const stateObj = this.resolveCreatureState(monster, Array.isArray(recentMessages) ? recentMessages : []);
        const isTownNpc = depth === 0 && (stateObj.state === 'begging' || /veteran|towns|citizen|villager|mercenary|sailor|agent|farmer|mayor|urchin|shopkeeper/i.test(mName));

        let prose = '';
        let reply = '';
        let titlePrefix = '⚔️ Parley & Stance';

        if (stance === 'challenge') {
            titlePrefix = '⚔️ Martial Challenge';
            prose = `Standing ${heroStanceDesc} in ${locationDesc}, ${heroName} the ${heroRace} ${heroClass} levels drawn steel toward ${mName}${mWoundDesc} and issues a ringing challenge!`;
            if (stateObj.state === 'sleeping') {
                reply = `*Startled from slumber by ${heroName}'s challenge, ${mName} stirs in the gloom!*`;
            } else if (isTownNpc) {
                reply = `Easy with that blade, ${heroName}! Save thy wrath for the horrors waiting below the stairs.`;
            } else if (stateObj.canSpeak) {
                reply = rk === 'hengband'
                    ? `A worthy tachiai, ${heroRace}! Let our steel judge who walks from ${locationDesc} alive!`
                    : (rk === 'silq'
                        ? `By the Iron Crown of Bauglir, thy song ends here in the dark, ${heroName}!`
                        : `Thy bold words shall be carved upon thy tomb at ${depth > 0 ? `${depth * 50} feet` : 'the gates'}, ${heroName}!`);
            } else {
                reply = `*${mName} bristles with primal fury${mWoundDesc}, baring fangs and coiling to strike!*`;
            }
        } else if (stance === 'study') {
            titlePrefix = '📜 Lorekeeper Tactical Assessment';
            prose = `${heroName} studies the footwork, breathing, and vital seams of ${mName}${mWoundDesc} across ${locationDesc} (${mHpPct}% vitality, state: ${stateObj.state}).`;
            reply = `${tactics} [Lorekeeper ${realmCtx.lorekeeperName}: "${stateObj.state === 'sleeping' ? 'The foe slumbers—strike from stealth or slip past unseen.' : (mHpPct <= 35 ? 'Its strength falters; press the advantage while guarding your flanks.' : 'Control the sightline and never let multiple foes surround you.')}"]`;
        } else {
            titlePrefix = isTownNpc ? '🗣️ Town Counsel' : '🗣️ Parley in the Deep';
            prose = `${heroName} the ${heroRace} ${heroClass} (${heroHpPct}% HP) stays their hand in ${locationDesc}, addressing ${mName}${mWoundDesc}.`;
            if (stateObj.state === 'sleeping') {
                reply = `*${mName} breathes heavily in deep slumber, oblivious to ${heroName}'s quiet presence.*`;
            } else if (isTownNpc) {
                reply = `Watch thy step below, ${heroName}. Keep healing draughts and a scroll of Phase Door on thy belt before descending the stairs.`;
            } else if (stateObj.canSpeak) {
                reply = rk === 'frogcomposband'
                    ? `Shadows shift fast in these courts, ${heroName}. Speak your piece before steel settles the wager.`
                    : (rk === 'hengband'
                        ? `Even amidst karma and bloodshed, a warrior pauses to parley. Speak quickly, ${heroName}.`
                        : `Speak quickly, ${heroRace}, before the shadows of ${locationDesc} claim us both.`);
            } else {
                reply = `*${mName} tilts its head warily in ${locationDesc}, watching every flicker of ${heroName}'s lantern.*`;
            }
        }

        return {
            title: `${titlePrefix}: ${mName}`,
            prose,
            dialogue: {
                speaker: stance === 'study' ? 'Lorekeeper' : mName,
                text: reply,
                isNoise: !stateObj.canSpeak && stance !== 'study'
            },
            insight: tactics,
            recommendedVoice: this.getLorekeeperVoice(rk)
        };
    }
}

ChronicleGrounder.FEMALE_3D_MODEL_KEYS = FEMALE_3D_MODEL_KEYS;
ChronicleGrounder.MALE_3D_MODEL_KEYS = MALE_3D_MODEL_KEYS;

if (typeof window !== 'undefined') {
    window.ChronicleGrounder = ChronicleGrounder;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChronicleGrounder;
}

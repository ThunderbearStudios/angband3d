/**
 * adventurer-guide.js — YASD 3D Adventurer's Guide & Novice Roguelike Codex
 * Houses the Novice Roguelike Onboarding Primer (What is a Roguelike, 4 Pillars of Fun,
 * Beginner Realm Picker, 1980-2026 History Lineage), authentic 9-Realm Codex manuals,
 * corrected 3D/Dual-Reality controls, live cross-guide search, and bundled Help Reader.
 */
'use strict';

(function (root) {
    const esc = (s) => (typeof window !== 'undefined' && typeof window.escapeHtml === 'function')
        ? window.escapeHtml(s)
        : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const REALM_ORDER = ['nethack', 'dcss', 'angband', 'brogue', 'rogue', 'silq', 'frogcomposband', 'hengband', 'ryod'];

    const CONTROL_SECTIONS = [
        {
            heading: 'Movement & 0-Turn 3D Scouting',
            lead: 'Looking around in 3D never passes a turn. Step carefully — enemies only act when your hero takes an action.',
            rows: [
                ['↑ / ↓', 'Step Forward or Step Backward along corridors and chambers (costs 1 turn)'],
                ['← / →  or  Mouse Drag', 'Turn Camera smoothly Left or Right / Free-Look 360° (0 turns spent — scout freely!)'],
                ['Shift + ← / →', 'Sidestep / Strafe Left or Right without turning camera (1 turn)'],
                ['Home / PgUp / End / PgDn', 'Step Diagonally NW / NE / SW / SE (or Numpad 7 / 9 / 1 / 3 — 1 turn)'],
                ['Ctrl + PgUp / PgDn / Home', 'Tilt Camera Pitch Up, Pitch Down, or Recenter horizon view (0 turns)'],
                ['5  or  .', 'Stand still / Rest 1 turn in place (wait for approaching foe or recover stamina)'],
                ['Alt + W  (or WALK button)', 'Toggle Opt-In WASD Movement Mode (W/S move, A/D turn, Shift+A/D strafe, Q/E/Z/C diagonals). Off by default so classic roguelike hotkeys (w=Wield, a=Aim, s=Search, d=Drop) stay one key away!']
            ]
        },
        {
            heading: 'Dual-Reality Views, Automation & HUD',
            lead: 'Switch seamlessly between 60 FPS first-person 3D and authentic 80×24 ASCII, automate tedious walking, or customize every HUD widget.',
            rows: [
                ['Alt + T  /  Shift + Tab', 'Instant Dual-Reality Toggle between First-Person 3D and Classic 80×24 CRT Terminal (0 turns)'],
                ['Tab', 'Open Realm Skills, Ability Matrix & Diegetic Grimoire / Armory Deck'],
                ['Alt + E', 'Smart Auto-Explore — swiftly charts rooms & corridors and halts immediately when danger or loot appears'],
                ['F11  /  Alt + Enter', 'Toggle borderless Fullscreen across Title, 3D Dungeon, and Classic Terminal'],
                ['Ctrl + K', 'Open the searchable All-Realm Command Compendium & Keybind Finder'],
                ['Alt + L', 'Reset all dragged/resized HUD panels (Minimap, Message Log, Character Panel, Move Pad) to default layout'],
                ['Esc', 'Open Pause Menu (Quick Save, Load, Export portable .sav, or Switch/Mute 58-Track Jukebox)']
            ]
        }
    ];

    const NOVICE_HISTORY_TIMELINE = [
        { realm: 'rogue', year: '1980', badge: 'Genesis', title: 'Rogue 5.4', blurb: 'Invented procedural dungeons, permadeath, and unidentified potions at UC Santa Cruz.' },
        { realm: 'nethack', year: '1987', badge: 'Emergent Sim', title: 'NetHack 3.6.7', blurb: '"The DevTeam Thinks of Everything" — altars, pet BUC testing, wishes, and engraving Elbereth.' },
        { realm: 'angband', year: '1990', badge: 'Town & Vaults', title: 'Angband 4.2.6', blurb: '100 Tolkien depths, persistent Town shops, stat potions, and multi-hued dragon vaults.' },
        { realm: 'dcss', year: '1997 / 2006', badge: 'Modern Tactical', title: 'Dungeon Crawl Stone Soup', blurb: 'Zero tedious grinding: smart Auto-Explore (o), 25+ Pantheon Gods, and multi-rune branches.' },
        { realm: 'hengband', year: '2000s', badge: 'JP / EN Chaos', title: 'Hengband 3.0+', blurb: 'Japanese roguelike legend with Samurai stances, Arena bouts, bounty corpses, and overworld travel.' },
        { realm: 'brogue', year: '2009', badge: 'Minimalist Gem', title: 'Brogue CE', blurb: 'Classless progression driven solely by Scrolls of Enchantment, fire/gas physics, and captive allies.' },
        { realm: 'silq', year: '2012', badge: 'Stealth Heist', title: 'Sil-Q 1.5+', blurb: '20 intense Tolkien First Age floors: transparent d20 math, forge smithing, and stealth Songs.' },
        { realm: 'frogcomposband', year: '2016', badge: 'Overworld Epic', title: 'FrogComposBand 7.1', blurb: 'Play as 40+ monster species across an entire continent of towns, chasms, and themed dungeons.' },
        { realm: 'ryod', year: '2026', badge: 'Tabletop Forge', title: 'RYOD Chimera Forge', blurb: 'Roll 6 tabletop cards, combine 8 realms\' mechanics, or rampage as a Dragon or Arch-Lich.' }
    ];

    const NOVICE_STARTER_PICKS = [
        {
            title: '🌱 Fast 15-Minute Pure Roguelike',
            badge: 'Best First Dive',
            desc: 'Zero overwhelming skill trees or town micromanagement. Grab your starting gear and learn identification, traps, and turn-based positioning immediately.',
            actions: [
                { type: 'play', realm: 'brogue', label: '⚔ Quick-Play Brogue CE', primary: true },
                { type: 'realm', realm: 'brogue', label: '📖 Brogue Manual' },
                { type: 'realm', realm: 'rogue', label: '📖 1980 Rogue Manual' }
            ]
        },
        {
            title: '🏰 Town Shops & Deep Loot Hunt',
            badge: 'Classic Progression',
            desc: 'Prefer returning safely to Town between dives to sell treasure, buy Healing potions, and store artifacts in your Home? Start with Vanilla Angband.',
            actions: [
                { type: 'play', realm: 'angband', label: '⚔ Quick-Play Angband', primary: true },
                { type: 'realm', realm: 'angband', label: '📖 Angband Manual' },
                { type: 'realm', realm: 'dcss', label: '📖 DCSS Manual' }
            ]
        },
        {
            title: '🗡️ Tense Stealth & Anvil Crafting',
            badge: 'Tactical & Readable',
            desc: 'Every combat roll shows exact d20 dice math. Sneak past patrolling Orc patrols, smith your own weapons on glowing Anvils, and heist a Silmaril.',
            actions: [
                { type: 'play', realm: 'silq', label: '⚔ Quick-Play Sil-Q', primary: true },
                { type: 'realm', realm: 'silq', label: '📖 Sil-Q Manual' },
                { type: 'realm', realm: 'nethack', label: '📖 NetHack Manual' }
            ]
        },
        {
            title: '🐉 Custom Dungeon / Play As a Boss',
            badge: 'Creative Sandbox',
            desc: 'Roll a seeded 6-card dungeon or build your own in RYOD—even start as an Ancient Red Dragon or Beholder—with Daily Blitz & wild twists.',
            actions: [
                { type: 'ryod', realm: 'ryod', label: '🎲 Open RYOD Forge', primary: true },
                { type: 'realm', realm: 'ryod', label: '📖 RYOD Manual' },
                { type: 'realm', realm: 'frogcomposband', label: '📖 FrogComposBand' }
            ]
        }
    ];

    const REALM_SURVIVAL_GUIDES = {
        nethack: {
            eraYear: '1987 • Emergence',
            difficultyTag: 'Deep Sandbox Puzzle',
            title: 'NetHack 3.6.7 — The Mazes of Menace',
            subtitle: '50+ Levels • Sokoban, The Gnomish Mines, Vlad\'s Tower, Gehennom & The Astral Plane',
            victoryGoal: 'Descend through the Dungeons of Doom and Gehennom, slay the <strong>Wizard of Yendor (Rodney)</strong>, perform the Invocation Ritual on the vibrating square, retrieve the genuine <strong>Amulet of Yendor</strong> from the Moloch Sanctum, and ascend through the Elemental & Astral Planes to offer the Amulet on your co-aligned High Altar.',
            branches: [
                { name: 'Dungeons of Doom (DL 1–29)', desc: 'Main trunk featuring Oracle (DL 5–9), Sokoban above it, Big Room, Medusa\'s Island, and The Castle (Wand of Wishing).' },
                { name: 'The Gnomish Mines (DL 2–4 fork)', desc: 'Dark caverns leading to Minetown (guaranteed temple & shops) and Mine\'s End (guaranteed luckstone).' },
                { name: 'Quest Branch (DL 11–16 portal)', desc: 'Role-specific trials unlocked at Experience Level 14; grants your role\'s Quest Artifact and the Bell of Opening.' },
                { name: 'Gehennom & Sanctum (DL 25–50+)', desc: 'Demon princes, Vlad\'s Tower (Candelabrum of Invocation), Wizard\'s Tower (Book of the Dead), and Moloch\'s Sanctum.' }
            ],
            mechanics: [
                { icon: '⚖️', title: 'BUC Status (Blessed / Uncursed / Cursed)', desc: 'Every item has a BUC state. <strong>Cursed gear welds to your body!</strong> Drop unidentified items onto any temple altar or let your pet walk over them (pets avoid cursed items) before equipping.' },
                { icon: '🍖', title: 'Corpse Intrinsics & Dangerous Bites', desc: 'Press <kbd>e</kbd> to eat fresh corpses for permanent intrinsics (Floating Eye = Telepathy, Fire Ant = Fire Resistance). <strong>Never eat Kobolds, Medusa, Green Slimes, or Cockatrices</strong> (instant illness or petrification).' },
                { icon: '✒️', title: 'Elbereth & Prayer Cooldowns', desc: 'Engrave (<kbd>E</kbd>) <code>Elbereth</code> on the floor with fingers, weapons, or a wand of fire/lightning to scare off most melee monsters. Pray (<kbd>#pray</kbd>) in emergencies (Weak from hunger or &lt; 15% HP), then wait 800+ turns.' },
                { icon: '🪨', title: 'Cockatrice Petrification Hazard', desc: 'Touching a cockatrice or chickatrice corpse <strong>without gloves</strong> turns you to stone instantly. Wearing gloves lets you wield (<kbd>w</kbd>) a cockatrice corpse as a petrifying weapon!' }
            ],
            commands: [
                ['#chat / #pray / #offer', 'Extended Command (#): talk to shopkeepers/priests, pray to your deity, or sacrifice corpses on an altar'],
                ['e / q / r', 'Eat food or fresh monster corpse / Quaff potion / Read scroll or spellbook'],
                ['w / W / T', 'Wield weapon / Wear armor / Take off armor'],
                ['P / R', 'Put on ring, amulet, blindfold, or towel / Remove accessory'],
                ['z / Z / a', 'Zap a wand / Cast a memorized spell / Apply tool (stethoscope, key, unicorn horn, lamp)'],
                ['E / s / :', 'Engrave on floor (Elbereth or wand test) / Search adjacent tiles for hidden doors & traps / Look at floor'],
                ['o / c / k', 'Open door / Close door / Kick door or chest (Ctrl+D also kicks)'],
                ['d / D / ,', 'Drop single item / Drop multiple items by category / Pick up item on floor']
            ],
            tips: [
                { title: 'Altars & Pet BUC Testing', body: 'Your starting dog, cat, or pony will reluctantly step on cursed items or avoid them completely. Drop unknown armor/weapons on the floor and watch your pet before putting them on.' },
                { title: 'Shopkeepers & Price ID', body: 'Never pick up items inside a shop unless you can pay, and leave your pick-axe or mattock outside—shopkeepers become hostile if you bring digging tools inside!' },
                { title: 'Unicorn Horn = Cure-All', body: 'Slaying a white, gray, or black unicorn yields a Unicorn Horn. Applying (<kbd>a</kbd>) an uncursed or blessed unicorn horn cures blindness, confusion, sickness, hallucination, and drained stats.' },
                { title: 'Reflection & Magic Resistance', body: 'Before descending past Medusa and The Castle, secure both <strong>Reflection</strong> (Silver Dragon Scale Mail, Shield of Reflection, or Amulet of Reflection) and <strong>Magic Resistance</strong> (Gray Dragon Scale Mail or Cloak of Magic Resistance).' }
            ],
            statsAndMagic: {
                title: 'Attributes, Alignment, Armor Class & Spellcasting',
                summary: 'In NetHack, <strong>lower Armor Class (AC) is better</strong>—you start at AC 10 and aim for negative AC (-10 to -40). Alignment (Lawful, Neutral, Chaotic) dictates your deity, artifact reactions, and Quest eligibility.',
                items: [
                    ['STR (Strength, up to 18/**)', 'Melee to-hit, damage bonus, and carrying capacity before becoming Burdened/Stressed.'],
                    ['DEX / CON / INT / WIS / CHA', 'DEX governs dodging & lockpicking; CON governs HP regen; INT/WIS govern arcane vs clerical spell failure; CHA lowers shop prices.'],
                    ['Spell Memory & Armor Penalty', 'Reading a spellbook (<kbd>r</kbd>) teaches a spell for ~20,000 turns. Wearing metallic body armor or shields massively increases spell failure unless you are an experienced Valkyrie/Priest with Robe support.'],
                    ['#enhance Weapon & Spell Skills', 'When <code>#enhance</code> lights up, open it to advance weapon & spell schools from Unskilled → Basic → Skilled → Expert.']
                ]
            },
            refs: [
                { name: 'NetHackWiki (Official Encyclopedia)', url: 'https://nethackwiki.com/wiki/Main_Page', desc: 'Complete database of every monster, intrinsic, wand engraving ID, Sokoban map, and ascension kit checklist.' },
                { name: 'NetHack 3.6.7 Official Guidebook', url: 'https://www.nethack.org/v367/Guidebook.html', desc: 'The canonical DevTeam manual covering commands, symbols, options, and game rules.' },
                { name: 'NetHack Strategy & Price ID Tables', url: 'https://nethackwiki.com/wiki/Price_identification', desc: 'Identify scrolls, potions, rings, and wands safely in Minetown shops before testing them.' }
            ]
        },
        dcss: {
            eraYear: '1997 / 2006 • Tactical',
            difficultyTag: 'Zero-Grind Branch Runner',
            title: 'Dungeon Crawl Stone Soup 0.31 — The Orb of Zot',
            subtitle: '27+ Branching Floors • Lair, Orcish Mines, Vaults, Pandemonium, Hell & The Realm of Zot',
            victoryGoal: 'Explore the Dungeon and its branches, collect at least <strong>3 Runes of Zot</strong> (up to 15 Runes for an extended endgame across Pandemonium, Hell, and Tomb), enter the <strong>Realm of Zot (D:15)</strong>, seize the <strong>Orb of Zot</strong> on Zot:5, and fight your way back out to D:1.',
            branches: [
                { name: 'Dungeon (D:1–D:15) & Ecumenical Temple', desc: 'Find the Ecumenical Temple (D:4–D:7) early to worship one of 25+ Gods (Okawaru, Trog, Vehumet, Gozag, Ashenzari).' },
                { name: 'Lair of Beasts (Lair:1–5) & Orcish Mines (Orc:1–2)', desc: 'Always clear Lair and Orc before pushing deep into D:12–15. Lair holds entrances to the S-Branches.' },
                { name: 'S-Branches (Swamp, Shoals, Snake Pit, Spider Nest)', desc: 'Two spawn per run inside Lair. Clear both through floor 4 to earn your first <strong>2 Runes of Zot</strong>.' },
                { name: 'Vaults (V:1–5), Depths (U:1–4) & Zot (Zot:1–5)', desc: 'Earn your 3rd Rune in Vaults:5, Slime Pits, or Abyss, clear Depths, then breach Zot:5 for the Orb!' }
            ],
            mechanics: [
                { icon: '🗺️', title: 'Auto-Explore (o) & Auto-Fight (Tab)', desc: 'DCSS is designed around tactical positioning rather than tedious walking. Press <kbd>o</kbd> to auto-explore until danger appears, and <kbd>5</kbd> to rest to full HP/MP.' },
                { icon: '⛩️', title: 'Pantheon of Gods & Piety (* to ******)', desc: 'Gods define your run. Press <kbd>a</kbd> to invoke divine abilities (Trog\'s Berserk/Brothers in Arms, Okawaru\'s Heroism/Finesse, Gozag\'s Potion Petition) BEFORE your HP drops below 40%!' },
                { icon: '📈', title: 'Skill Training Menu (m)', desc: 'Press <kbd>m</kbd> to open the Skill screen. Focus XP on 1–2 primary offense skills (e.g., Axes, Long Blades, or Conjurations) until Mindelay, then train <strong>Fighting, Dodging, Armour, and Invocations</strong>.' },
                { icon: '🪜', title: 'Three-Staircase Geometry & Pillar Dancing', desc: 'Every floor has 3 up-stairs and 3 down-stairs. Never fight packs in the open—lure 1–2 enemies up a staircase or into a 1-tile corridor.' }
            ],
            commands: [
                ['o / 5 / Tab', 'Auto-explore current floor / Rest until HP & MP are full / Auto-fight nearest threat'],
                ['m / A / ^', 'Open Skill Training menu / View Mutations & Innate Abilities / View worshipped God & Piety powers'],
                ['a / z / Z', 'Use Divine, Evocable, or Species Ability / Cast spell / Force-cast spell'],
                ['M / I', 'Memorize a spell from your spell Library / Inspect known spells'],
                ['w / W / T', 'Wield weapon / Wear armor / Take off armor'],
                ['P / R / =', 'Put on ring or amulet / Remove jewelry / Reassign inventory/spell hotkeys'],
                ['f / Q / v', 'Fire ranged weapon or throw javelin/boomerang / Quiver action / Evoke wand or misc device'],
                ['Ctrl+F / X', 'Search all discovered items across the entire dungeon / Level map overview & branch travel (G)']
            ],
            tips: [
                { title: 'Standard 3-Rune Branch Order', body: 'Follow the proven survival route: <strong>D:1–10 → Lair:1–5 → Orc:1–2 → D:11–15 → S-Branch #1 (1–4) → S-Branch #2 (1–4) → Vaults:1–4 → Depths:1–4 → Vaults:5 (3rd Rune) → Zot:1–5</strong>.' },
                { title: 'Identify Consumables Early', body: 'Read scrolls of Identify on stacks of 3+ potions (Curing, Haste, Might, Heal Wounds) and read unknown stack scrolls on cleared floors after Lair.' },
                { title: 'Never Fight Hydras with Edged Blades', body: 'Cutting a Hydra in Lair with an un-flaming Long Blade or Axe severs heads and makes it grow TWO back! Use blunt weapons, wands, ranged weapons, or a Flaming brand.' },
                { title: 'Check Monster Spells (x then v)', body: 'Before engaging unique monsters (Sigmund, Grinder, Mara, Boris, Ancient Liches), inspect them to see their max hit damage and hex/torment/banishment spells.' }
            ],
            statsAndMagic: {
                title: 'AC / EV / SH Defenses, Skills & Hungerless Casting',
                summary: 'DCSS uses three defensive pillars: <strong>AC</strong> (Armour Class — reduces damage taken), <strong>EV</strong> (Evasion — dodges attacks completely), and <strong>SH</strong> (Shield — blocks melee and projectile attacks).',
                items: [
                    ['STR / INT / DEX', 'STR reduces heavy armor encumbrance (aim for STR >= Armor Encumbrance Rating + 2); INT boosts spell power & success; DEX boosts EV, SH, and blades/ranged accuracy.'],
                    ['Weapon Mindelay', 'Each weapon reaches its fastest attack speed (usually 0.7 aut) at a specific skill level (e.g., Broad Axe at 18 Axes, Demon Blade at 14 Long Blades). Stop training weapon skill once you hit Mindelay!'],
                    ['Spellcasting & Schools', 'Spells in DCSS require MP and spell levels from the Spellcasting skill. Train the specific schools (e.g., Fire Magic + Conjurations) to reduce failure rate below 5%.'],
                    ['Willpower (Will+) & Resistances (rF, rC, rPois, rElec, rN)', 'Before Vaults and Zot, stack at least <code>Will+++</code> to avoid paralysis/banishment and <code>rF++</code> against Orbs of Fire on Zot:5!']
                ]
            },
            refs: [
                { name: 'CrawlWiki (Official DCSS Wiki)', url: 'http://crawl.chaosforge.org/Crawl_Wiki', desc: 'Complete guides for every Species, Background, God, Branch, Monster, and 3-to-15 Rune strategy.' },
                { name: 'Ultraviolent4\'s DCSS Guide', url: 'http://www.ultraviolent4.com/guide.html', desc: 'The gold-standard tactical manual for skilling, branch order, god choice, and Zot:5 positioning.' },
                { name: 'DCSS Official In-Game Manual', url: 'https://github.com/crawl/crawl/blob/master/crawl-ref/docs/crawl_manual.rst', desc: 'Upstream reference documentation for DCSS mechanics, combat formulas, and keybindings.' }
            ]
        },
        angband: {
            eraYear: '1990 • Classic Loot',
            difficultyTag: 'Safe Town + 100 Depths',
            title: 'Vanilla Angband 4.2.6 — The Pits of Morgoth',
            subtitle: '100 Dungeon Depths (5,000 ft) • Town Outpost, Vaults, Greater Pits, Sauron (DL 99) & Morgoth (DL 100)',
            victoryGoal: 'Build up your hero using the persistent Town shops and Home storage, descend through 100 dungeon levels, defeat <strong>Sauron, the Sorcerer</strong> at 4,950 ft (DL 99), and slay <strong>Morgoth, Lord of Darkness</strong> at 5,000 ft (DL 100).',
            branches: [
                { name: 'The Town (DL 0)', desc: 'Safe hub with 7 shops (General Store, Armory, Weapon Smiths, Temple, Alchemy, Magic Shop, Black Market) plus your Home (8) for storing endgame gear.' },
                { name: 'Early Depths (DL 1–25 / 50–1,250 ft)', desc: 'Gather gold, secure Free Action + See Invisible, and buy Phase Door, Teleportation, and Cure Critical Wounds.' },
                { name: 'Mid Depths & Stat Gain (DL 26–60 / 1,300–3,000 ft)', desc: 'Farm stat potions (Strength, Constitution, Speed) until CON and primary stats are maxed; secure all 4 Base Resistances.' },
                { name: 'Deep Vaults & The Throne Room (DL 61–100)', desc: 'Greater Vaults, Wyrms, Ringwraiths, Sauron on DL 99, and Morgoth on DL 100.' }
            ],
            mechanics: [
                { icon: '🏰', title: 'Non-Persistent Dungeon Levels', desc: 'Leaving a dungeon floor via stairs or Word of Recall <strong>permanently regenerates the floor</strong>. Never hoard loot on the dungeon floor—store keepers in your Town Home (Store 8)!' },
                { icon: '🛡️', title: 'The Four Base Resistances & Free Action', desc: 'By DL 20 (1,000 ft), you MUST have <strong>Free Action</strong> (or a Carrion Crawler / Ghoul will paralyze-lock and kill you). By DL 30, secure Resist Acid, Elec, Fire, and Cold.' },
                { icon: '📜', title: 'Word of Recall & Escape Stack', desc: 'Always carry 3+ Scrolls of Word of Recall (<kbd>r</kbd>). Reading one starts a 15–25 turn countdown before teleporting you between the Dungeon and Town—never wait until you are at 10% HP to read it!' },
                { icon: '⚡', title: 'The Speed System (+10 to +30+)', desc: 'Speed is the most important late-game stat in Angband. At normal speed (+0), deep uniques move 2–3 times for every 1 action you take. Never dive past DL 50 without permanent Speed items and Potions of Speed.' }
            ],
            commands: [
                ['m / b / G', 'Cast spell or prayer / Browse spellbook / Study & learn new spells when "Study" indicator glows'],
                ['w / t / d', 'Wield or equip item / Take off equipped gear / Drop item'],
                ['q / r / E', 'Quaff potion / Read scroll / Eat food or mushroom'],
                ['u / z / a', 'Use staff / Zap rod / Aim wand'],
                ['f / v / h', 'Fire ammo with launcher / Throw item / Fire default ammo at nearest target'],
                ['< / > / R', 'Ascend up staircase / Descend down staircase / Rest (press & for full HP/MP rest)'],
                ['o / c / T', 'Open door or chest / Close door / Tunnel through rubble or granite/quartz seams'],
                ['C / I / ~', 'Character Sheet (Resistances & Modifiers) / Inspect item lore / Knowledge Menu (Uniques, Artifacts, Monsters)']
            ],
            tips: [
                { title: 'Town Starter Checklist', body: 'Before stepping onto the down staircase (<kbd>&gt;</kbd>), buy Scrolls of Phase Door (Alchemy Shop 5) and Potions of Cure Light/Serious Wounds (Temple 4).' },
                { title: 'Anti-Summoning Corridors', body: 'Never fight Summoners (Lich, Nazgul, Sauron, Morgoth) in open rooms. Fight inside 1-tile corridors or rubble/granite tunnels so summoned hounds and dragons cannot surround you.' },
                { title: 'Detect Monsters & Traps', body: 'Use Rods/Staves/Spells of Detect Monsters, Detect Traps, and Magic Mapping whenever entering a new depth. Level Feelings ("You feel a nervous feeling...") warn you of deadly Uniques or Vaults.' },
                { title: 'High Resistances (Poison, Chaos, Nether, Nexus, Confusion, Blindness)', body: 'Past DL 45, Ancient Multi-Hued Dragons and Dracolisks breathe Poison (up to 800 damage unresisted) and Confusion/Chaos. Check your Resistance grid (<kbd>C</kbd>) before engaging!' }
            ],
            statsAndMagic: {
                title: 'Six Core Attributes, Blows/Round, Saving Throw & Magic Realms',
                summary: 'Angband characters scale through equipment bonuses, Stat Potions (which permanently raise stats up to 18/100 base), and 9 distinct Classes across Arcane (Mage, Necromancer, Rogue, Ranger) and Divine/Nature (Priest, Paladin, Druid, Blackguard) magic.',
                items: [
                    ['STR & DEX → Blows per Round', 'Increasing STR and DEX with a lighter weapon unlocks extra melee attacks per turn (from 1.0 up to 5.0–6.0 blows/round), multiplying your DPS.'],
                    ['CON → Hitpoint Multiplier', 'High CON exponentially increases HP at higher character levels—drinking Potions of Constitution between DL 30–40 is essential.'],
                    ['Saving Throw & Stealth', 'Keep your Saving Throw near 95–100% to shrug off monster Hold/Mind Blast/Blindness curses; high Stealth lets you walk past sleeping packs of hounds.'],
                    ['Rods, Wands & Staves (Device Skill)', 'Even Warriors rely on magical devices (Rods of Teleport Other, Illumination, Detection, Healing). High Device skill reduces activation failure.']
                ]
            },
            refs: [
                { name: 'Official Angband 4.2 Manual (ReadTheDocs)', url: 'https://angband.readthedocs.io/en/latest/', desc: 'Complete upstream documentation for Angband 4.2 classes, birth options, dungeon feelings, and combat mechanics.' },
                { name: 'rephial.org (Official Angband Portal & Ladder)', url: 'https://rephial.org/', desc: 'Home of Vanilla Angband, winning character dumps, and strategy forums.' },
                { name: 'Angband Resistances & Survival Checklist', url: 'https://angband.readthedocs.io/en/latest/dungeon.html', desc: 'Depth-by-depth resistance milestones, vault layouts, and monster breath damage caps.' }
            ]
        },
        brogue: {
            eraYear: '2009 • Minimalist',
            difficultyTag: 'Beginner-Friendly Dive',
            title: 'Brogue CE 1.13 — The Dungeons of Doom & Lumenstones',
            subtitle: '40 Classless Depths • Vaults, Captive Allies, Caustic Gas, Lava Bridges & The Amulet of Yendor',
            victoryGoal: 'Descend to <strong>Depth 26</strong> to retrieve the <strong>Amulet of Yendor</strong> and return to Depth 1 for a Standard Victory—or dive into the brutal <strong>Depths 27–40</strong> to harvest up to 25 <strong>Lumenstones</strong> for a Mastery Victory.',
            branches: [
                { name: 'Early Cavern Depths (D:1–D:6)', desc: 'Identify potions and scrolls safely, rescue captive Monkey/Goblin allies, and loot early Key Vaults.' },
                { name: 'Mid Depths (D:7–D:15)', desc: 'Ogres, Wraiths, Centaurs, Dar Blademasters, Pixies, and Underworms. Commit your Scrolls of Enchantment to a core build!' },
                { name: 'Deep Threats (D:16–D:26)', desc: 'Furies, Tentacle Horrors, Liches, Golems, and Dragons! Grab the Amulet of Yendor on D:26 (where the Warden of Yendor begins hunting you).' },
                { name: 'Lumenstone Mastery Depths (D:27–D:40)', desc: 'Three Lumenstones spawn per floor (D:26–40), each reducing your field of vision unless offset by a Clairvoyance/Telepathy build.' }
            ],
            mechanics: [
                { icon: '✨', title: 'Classless Progression via Scrolls of Enchantment', desc: 'There are <strong>NO XP levels or classes in Brogue</strong>! Your character grows SOLELY through <strong>Potions of Strength</strong>, <strong>Potions of Life</strong>, and <strong>Scrolls of Enchantment</strong> (which boost weapons, armor, rings, staves, and charms).' },
                { icon: '🗝️', title: 'Interactive Key Vaults & Free Item Swapping', desc: 'Locked vaults let you take ONE item before the other cages lock—<strong>until you return the item!</strong> You can take a vault weapon/ring, test it for several floors to discover its runic/enchantment level, and return it to swap for another item!' },
                { icon: '🔥', title: 'Environmental Terrain Physics (Gas, Fire, Water, Chasms)', desc: 'Throw Potions of Paralysis or Confusion into crowds, ignite Swamp Gas with a Firebolt staff or Incendiary Dart, lure Eels onto dry land, and knock non-flying monsters into Lava or Chasms.' },
                { icon: '🐒', title: 'Captive Allies & Empowerment', desc: 'Free chained allies (Ogres, Naga, Troll, Priestess, Dar, Dragon). Using a Wand of Empowerment on an ally lets it learn monster abilities (healing, vampirism, blinking, fire immunity) from fallen foes!' }
            ],
            commands: [
                ['e / z / <Space>', 'Auto-explore current depth / Rest until healed / Wait 1 turn'],
                ['i / a / r / q', 'Open Inventory / Apply (use) any inventory item / Read scroll / Quaff potion'],
                ['w / W / R', 'Equip weapon, armor, or ring / Remove equipped item'],
                ['t / f', 'Throw weapon, dart, or harmful potion / Fire ranged dart or staff'],
                ['s / > / <', 'Search adjacent tiles for hidden traps & doors / Descend stairs / Ascend stairs'],
                ['x / D', 'Examine visible monsters, terrain gases, and items / Discoveries table (identified potions, scrolls, rings)'],
                ['c / A', 'Call (label) an unidentified item / Toggle Autopilot mode']
            ],
            tips: [
                { title: 'How to Safe-Test Potions & Scrolls', body: 'Once your pack is full around D:3–D:4, stand next to water (to extinguish Creeping Fire), away from items on the floor (so Incineration doesn\'t burn scrolls), and near stairs—then test Potions first (Strength & Life are always positive) followed by Scrolls.' },
                { title: 'Strength Requirement Penalties', body: 'Every point of Strength below a weapon or armor\'s requirement imposes a harsh -2.5 level penalty to accuracy and defense. Each Scroll of Enchantment used on heavy gear both adds +1 AND lowers its Strength requirement by 1!' },
                { title: 'Sneak Attacks & Shadow Sight', body: 'Every tile shows your stealth range as a dark shadow ring. Striking an unaware (wandering or sleeping) monster guarantees a <strong>3x damage Sneak Attack</strong> with 100% accuracy (6x with a Dagger)!' },
                { title: 'Dealing with Corrosive Acid Mounds & Jellies', body: 'Never hit an Acid Mound or Acid Turret with your primary enchanted weapon or wearing your best armor—strip your armor (<kbd>R</kbd>) and throw darts or punch it barehanded so your gear never corrodes!' }
            ],
            statsAndMagic: {
                title: 'Strength, Nutrition Clock, Staves, Charms & Rings',
                summary: 'Brogue replaces mana points with self-recharging <strong>Staves</strong> (e.g., Lightning [4/4], Blinking [3/3], Obstruction, Conjuration) and cooldown-based <strong>Charms</strong> (Teleportation, Health, Negation, Haste, Protection).',
                items: [
                    ['Strength (Starts at 12)', 'Every Potion of Strength raises your Strength by +1, letting you equip heavier weapons (BroadSword, War Axe, War Hammer) and heavy Plate/Splint armor.'],
                    ['Potions of Life', 'Permanently increases your maximum HP by ~25%, heals you to full, and cures poison/hallucination/weakness immediately.'],
                    ['Rings (Regeneration, Wisdom, Clairvoyance, Reaping, Stealth)', 'Enchanting a Ring of Regeneration to +8..+12 heals you faster than most monsters can hurt you; Ring of Wisdom recharges staves every few turns.'],
                    ['Runic Weapons & Armor', 'Unidentified weapons/armor can hold rare Runic powers (Quietus instant-kill, Paralysis, Multiplicity, Immunity, Absorption, Respiration, Reflection).']
                ]
            },
            refs: [
                { name: 'Brogue Wiki (Fandom Complete Guide)', url: 'https://brogue.fandom.com/wiki/Brogue_Wiki', desc: 'Complete database of Staves, Charms, Runic weapons/armor, monster stats, and Lumenstone builds.' },
                { name: 'Brogue Community Edition (GitHub)', url: 'https://github.com/tmewett/BrogueCE', desc: 'Official Brogue CE 1.13 release notes, mechanics documentation, and seed sharing.' }
            ]
        },
        rogue: {
            eraYear: '1980 • The Original',
            difficultyTag: 'Pure 15-Minute Arcade Dive',
            title: 'Classic Rogue 5.4.4 — The Original 1980 Amulet of Yendor',
            subtitle: '26 Classic Depths (A to Z) • Hunger Clock, Aquators, Leprechauns, Jabberwocks & Dragons',
            victoryGoal: 'Survive the tight <strong>Food Rations clock</strong> across 26 increasingly deadly levels (where monsters from A to Z unlock progressively), claim the <strong>Amulet of Yendor</strong> on or below Level 26, and climb all the way back to Level 1 to see the light of day.',
            branches: [
                { name: 'Upper Caves (Levels 1–7)', desc: 'Bats, Emu, Hobgoblins, Ice Monsters, Rattlesnakes, and Orcs. Explore fast, find stairs, and conserve Food Rations.' },
                { name: 'Middle Dungeon (Levels 8–16)', desc: 'Centaur, Leprechauns (steal gold), Nymphs (steal magic items), Quaggas, Rust Monsters (Aquators), and Trolls.' },
                { name: 'The Deep Dark (Levels 17–25)', desc: 'Umber Hulks (confuse on sight), Vampires (drain max HP/STR), Wraiths (drain XP levels), Xorns, and Purple Worms.' },
                { name: 'Amulet Depths & Ascent (Level 26+ → Level 1)', desc: 'Dragons (breathe flame) and Jabberwocks! Once you touch the Amulet of Yendor, stairs can go UP (<), allowing your escape.' }
            ],
            mechanics: [
                { icon: '🍞', title: 'The Relentless Hunger Clock', desc: 'Classic Rogue has NO town and NO shops—only the Food Rations you find on the floor. Do not linger on cleared floors; rings consume extra food every turn while worn!' },
                { icon: '💧', title: 'Aquators (A) & Armor Rusting', desc: 'Starting around Level 9, <strong>Aquators (A)</strong> do zero HP damage—instead, every hit permanently lowers your Armor Class by 1 unless you wear Leather Armor, hold a Ring of Maintain Armor, or remove your armor before fighting them!' },
                { icon: '📜', title: 'The Scroll of Scare Monster Trick', desc: 'In Rogue 5.4, reading a Scroll of Scare Monster is wasted—instead, <strong>DROP (<kbd>d</kbd>) the Scroll of Scare Monster on the floor and stand on it!</strong> No monster in the game can attack you while you stand on it (just don\'t pick it up twice, or it turns to dust).' },
                { icon: '🏹', title: 'Ranged Bow & Thrown Weapon Tactics', desc: 'Soften Rattlesnakes (which drain Strength), Aquators, Centaurs, and Dragons from across the room with your Short Bow (<kbd>t</kbd> to throw/fire arrows) or Wands before they reach melee range.' }
            ],
            commands: [
                ['s / . / > / <', 'Search adjacent walls for secret doors & traps (press s 2–3 times at dead-end corridors!) / Rest 1 turn / Go down stairs / Go up stairs (with Amulet)'],
                ['e / q / r', 'Eat Food Ration or slime-mold / Quaff potion / Read scroll'],
                ['w / W / T', 'Wield weapon / Wear armor / Take off armor (crucial before fighting Aquators!)'],
                ['P / R', 'Put on ring (left or right hand) / Remove ring (saves food when exploring)'],
                ['z / t / d', 'Zap wand or staff in a direction / Throw arrow, dart, or dagger / Drop item on floor'],
                ['i / D / c', 'Inventory list / Discoveries (list all identified Potions, Scrolls, Rings, Staves) / Call (name) an item'],
                ['^ / /', 'Identify adjacent trap type / Identify what a map symbol represents']
            ],
            tips: [
                { title: 'Save Enchant Armor for Plate or Banded Mail', body: 'You start in Ring Mail (AC 7). Try to hold onto your Scrolls of Enchant Armor until you find Splint Mail (AC 4) or Plate Mail (AC 3), or until a Scroll of Protect Armor makes your suit rust-proof.' },
                { title: 'Take Off Rings Between Fights', body: 'Most Rings (Slow Digestion is the exception!) burn 1–2 extra food units per turn. Put rings on (<kbd>P</kbd>) for tough rooms and remove them (<kbd>R</kbd>) while walking.' },
                { title: 'Leprechauns (L) & Nymphs (N)', body: 'Drop a pile of gold or use ranged arrows/wands against Leprechauns; before fighting a Nymph adjacent to you, keep your best magic items safe or kill her from range so she doesn\'t steal from your pack and teleport away.' },
                { title: 'Save Wands of Cancellation / Slow Monster for Deep Threats', body: 'A Wand of Cancellation strips special powers from Vampires (no drain), Wraiths (no XP drain), Umber Hulks (no gaze confusion), and Dragons (no fire breath)!' }
            ],
            statsAndMagic: {
                title: 'Strength (16/16), Armor Class, Rings & Staves',
                summary: 'Classic Rogue has two core combat stats: <strong>Strength</strong> (displayed as Current/Max, e.g., <code>16(16)</code>) and <strong>Armor Class</strong> (displayed as AC or Defense rating). Potions of Restore Strength recover all drained STR back to your max.',
                items: [
                    ['Strength & Rattlesnake Poison', 'Rattlesnakes (R) drain Strength unless you wear a Ring of Sustain Strength. Drinking a Potion of Gain Strength at full STR raises both Current and Max STR!'],
                    ['Ring of Slow Digestion', 'The single most valuable item in Rogue—virtually eliminates hunger, letting you farm XP and heal to full on every floor.'],
                    ['Ring of Regeneration & Maintain Armor', 'Regeneration heals 1 HP per turn (at higher food cost); Maintain Armor makes your armor immune to Aquator rust.'],
                    ['Wands & Staves', 'Lightning, Fire, Cold (bounces off walls—never zap straight at a wall!), Polymorph, Teleport Away, Drain Life, and Cancellation.']
                ]
            },
            refs: [
                { name: 'A Guide to the Dungeons of Doom (Original 1980 Manual)', url: 'https://bsd.org/rogue.html', desc: 'Michael Toy & Kenneth Arnold\'s original UNIX manual for Rogue.' },
                { name: 'Rogue 5.4 Monster & Item Spoiler Reference', url: 'https://strategywiki.org/wiki/Rogue/Monsters', desc: 'Complete table of A–Z monsters, level spawn ranges, XP values, and special attacks.' }
            ]
        },
        silq: {
            eraYear: '2012 • Stealth Heist',
            difficultyTag: 'Tight 20-Floor Strategy',
            title: 'Sil-Q 1.5.0 — The Fortress of Angband (First Age)',
            subtitle: '20 Dense Tactical Depths (50 ft to 1,000 ft) • Stealth, Song, Forging, Morgoth\'s Iron Crown & Silmarils',
            victoryGoal: 'Infiltrate Morgoth\'s fortress of Angband down to <strong>1,000 ft (Depth 20)</strong>, prise at least <strong>one Silmaril</strong> from Morgoth\'s Iron Crown using an edged weapon, and escape all the way back to the Gates of Angband at 0 ft while the dungeon collapses in pursuit.',
            branches: [
                { name: 'Upper Guardrooms (50 ft – 350 ft)', desc: 'Orc patrols, Wargs, Spiders, and Forges. Invest XP into Melee/Evasion/Stealth and craft custom gear at glowing Forges.' },
                { name: 'Deep Halls of Angband (400 ft – 950 ft)', desc: 'Trolls, Rauko (Balrogs), Dragons, Werewolves, and Silent Watchers. Forced descent applies—you cannot endlessly stair-scum!' },
                { name: 'The Throne Room of Morgoth (1,000 ft)', desc: 'Morgoth the Bauglir sits upon his throne surrounded by Dragons and Balrogs. Wait for an opening or put him to sleep/terror, then cut a Silmaril free!' },
                { name: 'The Ascent Under Pursuit (950 ft → Gates)', desc: 'Once a Silmaril is taken, the fortress shakes and enemies hunt you relentlessly until you breach the surface gates.' }
            ],
            mechanics: [
                { icon: '🎲', title: 'Transparent Opposed d20 + d4 Combat Rolls', desc: 'No black-box RNG: Melee Accuracy vs Evasion rolls <code>1d20 + Melee</code> vs <code>1d20 + Evasion</code>. Exceeding defense by +10/+15/+20 adds Critical Hit damage dice! Heavy armor provides <code>XdY</code> Protection dice that absorb damage directly.' },
                { icon: '🛠️', title: 'Skill Trees & Ability Unlocks (Tab / @)', desc: 'Spend XP directly at any time to raise 8 Skills (<strong>Melee, Archery, Evasion, Stealth, Perception, Will, Smithing, Song</strong>) and unlock active/passive tactical Abilities (Charge, Flanking, Finesse, Sprint, Keen Senses, Song of Slaying/Silence).' },
                { icon: '⚒️', title: 'Anvil Forging System (0)', desc: 'When you find an enchanted Forge in the dungeon, stand on it and press <kbd>0</kbd> to smith custom weapons, armor, or rings tailored to your exact build.' },
                { icon: '🤫', title: 'Alertness States (Unwary → Alerted)', desc: 'Monsters are Sleeping, Unwary, or Alerted. High Stealth + Song of Silence lets you slip past entire patrols or score devastating Assassination/Cruel Blow strikes.' }
            ],
            commands: [
                ['Tab / @ / C', 'Open Character, Skill & Ability Investment Screen (spend XP directly!)'],
                ['a / m / 0', 'Use Active Ability or Sing a Song of Power / Forge custom equipment on an Anvil'],
                ['w / t / x', 'Wield or wear item / Take off item / Swap between primary and secondary weapon sets (e.g., Blade <-> Bow)'],
                ['f / v', 'Fire bow with arrows / Throw spear or dagger'],
                ['q / r / E / u', 'Quaff potion / Read scroll (or play trumpet) / Eat food / Use staff'],
                ['s / z / Space', 'Search / Rest / Stealth-rest in place'],
                ['> / <', 'Descend stairs / Ascend stairs (note: stairs collapse or push you deeper until you hold a Silmaril!)'],
                ['l / I / ~', 'Look at monsters (shows exact Alertness state & combat stats) / Inspect item / Lore & Knowledge menu']
            ],
            tips: [
                { title: 'Spend XP Early & Unlock Key Abilities', body: 'Unspent XP sits idle! Open your Skill & Ability screen (<kbd>Tab</kbd> or <kbd>@</kbd>) frequently. Early game winners include <strong>Dodging / Flanking</strong> (Evasion), <strong>Power / Finesse</strong> (Melee), and <strong>Listen</strong> (Perception — detects monsters through walls!).' },
                { title: 'Weight & Critical Hit Thresholds', body: 'With 1-handed blades, each +7/+8/+9 margin by which your attack roll beats monster Evasion adds +1 damage die. With 2-handed Greatswords/Bastard Swords, that threshold drops to every +6/+7!' },
                { title: 'Prising a Silmaril at 1,000 ft', body: 'You do NOT have to kill Morgoth (though doing so is legendary)—when adjacent to Morgoth (especially if he is sleeping or distracted) with an edged weapon, attacking him gives the option to prise a Silmaril from his Iron Crown.' },
                { title: 'Beware of Rauko & Shadow Spiders', body: 'Shadow Spiders drain Strength and poison rapidly; Rauko (Balrogs) wield fiery whips that pull you across rooms—keep Free Action and Fire Resistance ready.' }
            ],
            statsAndMagic: {
                title: 'Four Attributes (STR, DEX, CON, GRA) & Eight Skill Trees',
                summary: 'Sil-Q replaces traditional spellbooks with <strong>Grace (GRA)</strong>-powered <strong>Songs of Power</strong> (Elbereth, Slaying, Silence, Trees, Staying, Lorien, Este, Mastery) and <strong>Smithing</strong>.',
                items: [
                    ['STR (Strength) & DEX (Dexterity)', 'STR adds +1 damage side per point (up to weapon weight cap); DEX adds +1 directly to Melee, Archery, Evasion, and Stealth!'],
                    ['CON (Constitution) & GRA (Grace)', 'CON determines your HP pool and poison/stunning recovery; GRA powers Song, Smithing, Willpower, and Perception.'],
                    ['Protection [d4..2d8] vs Evasion [+X]', 'Light armor maximizes Evasion [+X] to avoid hits; heavy mail maximizes Protection [XdY] dice to reduce incoming physical damage to zero.'],
                    ['Voice & Stamina', 'Singing Songs drains Voice (MP), which regenerates when you stop singing or drink Miruvor.']
                ]
            },
            refs: [
                { name: 'Sil-Q 1.5 Official Manual (PDF / GitHub)', url: 'https://github.com/sil-q/sil-q/blob/master/doc/Manual.pdf', desc: 'One of the finest roguelike manuals ever written—explains combat rolls, forging formulas, and First Age lore.' },
                { name: 'Sil-Q GitHub Repository & Ability Reference', url: 'https://github.com/sil-q/sil-q', desc: 'Complete release notes, skill tree tables, and forging recipes for Sil-Q 1.5.0.' }
            ]
        },
        frogcomposband: {
            eraYear: '2016 • Multiverse',
            difficultyTag: 'Massive Variety & Monster Play',
            title: 'FrogComposband 7.1.liquorice — The Multi-Dungeon Overworld',
            subtitle: 'Overworld Wilderness • 18+ Distinct Dungeons, Quests, 40+ Monster Races & The Serpent of Chaos',
            victoryGoal: 'Explore the vast Overworld wilderness, complete Town Quests and conquer multi-themed dungeons (Camelot, Icky Cave, Orc Cave, Labyrinth, Dragon\'s Lair, Mount Olympus), defeat Oberon at Angband DL 99, and slay the <strong>Serpent of Chaos</strong> at Angband DL 100.',
            branches: [
                { name: 'Outpost Town & Overworld Wilderness (<)', desc: 'Complete the Thieves Quest in Outpost early to earn your first Home. Press <kbd>&lt;</kbd> on the surface to enter Overworld Fast-Travel mode between towns and dungeons!' },
                { name: 'Beginner Dungeons (Icky Cave, Yeek Cave, Orc Cave, Camelot)', desc: 'Start here (DL 1–25) instead of diving straight into Angband! Each dungeon boss drops guaranteed artifacts and unlocks Recall points.' },
                { name: 'Mid-Game Dungeons (Labyrinth, Morivant, Lonely Mountain, Castle)', desc: 'Farm experience, Chaos Patron rewards, and resistance gear across specialized monster ecosystems (DL 25–60).' },
                { name: 'Angband & Mount Olympus (DL 60–100)', desc: 'Final confrontation against Oberon, King of Amber (DL 99) and the Serpent of Chaos (DL 100).' }
            ],
            mechanics: [
                { icon: '🌍', title: 'Overworld Wilderness Map (< on Surface)', desc: 'FrogComposband has a full multi-town wilderness! Press <kbd>&lt;</kbd> while on any surface tile to zoom out into the Overworld map and travel rapidly between Telmora, Morivant, Angwil, Zul, and 18+ dungeons.' },
                { icon: '🐉', title: 'Playable Monster Races & Evolutionary Forms', desc: 'In addition to Humans and Elves, you can play as a Dragon, Beholder, Ring, Hound, Vortex, Lich, or Spider—each evolving into stronger monster forms at key XP milestones with custom equipment slots!' },
                { icon: '🎭', title: 'Personality Traits & Chaos Patrons', desc: 'Every character chooses a Personality (Mighty, Shrewd, Patient, Lucky, Munchkin) that modifies all stats and skills, plus optional Chaos Patrons or Demigod parentage.' },
                { icon: '⚔️', title: 'Town Quests & Recall Networks', desc: 'Visit the Town Hall / Castle in each town to accept fixed-level Quests. Keep a Scroll/Rod of Word of Recall to warp directly between unlocked towns and your deepest floor in each dungeon.' }
            ],
            commands: [
                ['< (on surface)', 'Enter Overworld Wilderness Fast-Travel Map (press > to drop back down into local terrain or a dungeon entrance)'],
                ['m / b / G', 'Cast spell, class power, or monster breath / Browse spellbook / Study new spells'],
                ['U / p', 'Use Racial/Class/Mutation power / Mindcraft or pets command menu'],
                ['w / t / d / k', 'Equip item / Take off item / Drop item / Destroy or auto-destroy junk'],
                ['q / r / E', 'Quaff potion / Read scroll / Eat food'],
                ['u / z / a', 'Use staff / Zap rod / Aim wand (note: Devices use an inventory slot system or Device pack depending on class)'],
                ['C / ~ / ?', 'Character Sheet (3 pages of resistances & skills) / Knowledge & Quest Status Menu / In-game Help']
            ],
            tips: [
                { title: 'Start with Outpost Quests & Yeek/Icky Cave', body: 'Do not dive into the main Angband dungeon at Level 1! Clear the Outpost Thieves Quest first, then conquer the Yeek Cave (DL 1–12) and Icky Cave for guaranteed early artifacts and stat potions.' },
                { title: 'Check Dungeon Guardian Restrictions', body: 'Every dungeon has an affinity (e.g., Labyrinth is all minotaurs & walls; Dragon\'s Lair is heavy elemental breathers; Anti-Melee Cave forbids physical strikes). Check <kbd>~</kbd> → Dungeons before entering!' },
                { title: 'Identify & Auto-Picker', body: 'Town shops automatically identify goods, and Scrolls/Rods of Perception are plentiful. Keep Resistance to Confusion, Blindness, Poison, and Shards before DL 35.' },
                { title: 'Use Racial & Class Powers (U)', body: 'Press <kbd>U</kbd> to see active powers granted by your Race, Class, Personality, and Mutations (e.g., Berserk, Dimension Door, Breathe Fire, Detect Monsters).' }
            ],
            statsAndMagic: {
                title: 'Personalities, 30+ Magic Realms, Monster Evolutions & Multi-Slot Bodies',
                summary: 'FrogComposband features 40+ classes (Time-Lord, Blood-Knight, Duelist, Chaos-Warrior, Weaponmaster, Ninja, Magic-Eater) and 40+ races.',
                items: [
                    ['Dual-Realm Spellcasters', 'Mages and Priests can select two magic realms (Life, Sorcery, Nature, Chaos, Death, Trump, Arcane, Craft, Daemon, Crusade, Armageddon, Music).'],
                    ['Monster Mode Equipment Slots', 'Playing as a Hydra gives you multiple head/neck slots; playing as a Spider or Centaur gives extra boot/ring slots; playing as a Sentient Ring lets you possess monster bodies!'],
                    ['Device Skill & Fail Rates', 'Magical devices scale with INT/WIS and your class Device skill—Magic-Eaters can absorb wands/staves/rods directly into their permanent mana repertoire!'],
                    ['Speed & AC Scaling', 'Late-game bosses move at +30 to +40 Speed and cast Psycho-Spear / Mana Storm (up to 600+ damage)—keep 900+ HP and Potions of *Healing* ready.']
                ]
            },
            refs: [
                { name: 'FrogComposband Official Repository & Docs', url: 'https://github.com/sulkasormi/frogcomposband', desc: 'Complete upstream documentation for FrogComposband 7.1 races, classes, personalities, and dungeons.' },
                { name: 'FrogComposband In-Game Help & Spoilers', url: 'https://github.com/sulkasormi/frogcomposband/tree/master/lib/help', desc: 'Detailed plain-text encyclopedias for Monster Mode, Magic Realms, Quests, and Town locations.' }
            ]
        },
        hengband: {
            eraYear: '2000s • JP / EN Classic',
            difficultyTag: 'Rich Classes, Arenas & Quests',
            title: 'Hengband 3.0.1.26 — The Bilingual Japanese Sandbox Epic (変愚蛮怒)',
            subtitle: 'Overworld & 15+ Dungeons • Bilingual EN/JP UI, Arena Championships, Martial Arts & The Serpent of Chaos',
            victoryGoal: 'Conquer the Overworld quests and multi-dungeon guardians, climb the Monster Arena ranks, defeat <strong>Oberon, King of Amber</strong> on Angband DL 99, and vanquish the <strong>Serpent of Chaos (混沌のサーペント)</strong> on Angband DL 100.',
            branches: [
                { name: 'Outpost, Telmora, Morivant & Angwil Towns (<)', desc: 'Overworld towns connected via wilderness travel (<kbd>&lt;</kbd>). Features Casinos, Monster Arenas, Bounty Brokers, and Museum artifact displays.' },
                { name: 'Early Dungeons (Yeek Cave, Orc Cave, Labyrinth, Forest)', desc: 'Build up your early hero (DL 1–30), collect Bounties at the Hunter\'s Office, and unlock Town Recall.' },
                { name: 'Elemental & Specialized Dungeons (Dragon\'s Lair, Castle, Heaven, Hell)', desc: 'Mid-to-late game dungeons (DL 35–85) with unique Dungeon Masters that drop guaranteed artifacts.' },
                { name: 'Angband Sanctuary (DL 90–100)', desc: 'Home of the Unicorn of Order, Amberites, Oberon (DL 99), and the Serpent of Chaos (DL 100).' }
            ],
            mechanics: [
                { icon: '🌐 JP/EN', title: 'Bilingual English / Japanese Engine Toggle', desc: 'Switch between <strong>English</strong> and <strong>Original Japanese (日本語)</strong> at any time from the Main Menu or Realm Selector—all HUD labels, messages, and Lorekeeper voice lines adapt dynamically!' },
                { icon: '🏟️', title: 'Monster Arena & Daily Bounty Hunting', desc: 'Visit the Arena in town to fight 1-on-1 gladiator bouts for rare Potions of Constitution/Speed and artifacts, and check the Bounty Broker for daily monster corpse bounties.' },
                { icon: '🥋', title: 'Specialized Classes (Blue-Mage, Mirror-Master, Ninja, Samurai, Sniper)', desc: 'Each class has bespoke mechanics: Samurais use <em>Hissatsu</em> sword stances, Mirror-Masters place tactical mirrors on tiles to bounce lasers and teleport, and Blue-Mages learn monster breaths/spells cast at them!' },
                { icon: '🗺️', title: 'Wilderness Fast-Travel (<) & Recall Anchors', desc: 'Press <kbd>&lt;</kbd> on the surface to open the global wilderness map. Once you step inside any new dungeon, it is added to your Word of Recall destination list.' }
            ],
            commands: [
                ['< (on surface)', 'Enter Overworld Wilderness Map / > to re-enter local map or dungeon entrance'],
                ['m / b / G', 'Use Magic, Samurai Posture, Mirror Art, or Mindcraft / Browse book / Study new spells'],
                ['U / p', 'Activate Racial / Class / Mutation power / Command pets & mounts (Riding skill)'],
                ['w / t / d / k', 'Equip weapon or armor / Take off gear / Drop item / Auto-destroy or destroy item'],
                ['q / r / E', 'Quaff potion / Read scroll / Eat food'],
                ['u / z / a / f', 'Use staff / Zap rod / Aim wand / Fire bow or gun'],
                ['C / ~ / ?', 'Character Sheet (Resistances, Virtues & Riding) / Knowledge & Quest log / Help files']
            ],
            tips: [
                { title: 'Complete the Thieves Quest First', body: 'In the starting town, locate the Quest building and clear the Level 1 Thieves Quest (bring Phase Door scrolls and ranged bolts!) to unlock your Town Home and earn a strong early reward.' },
                { title: 'Daily Corpse Bounties & Casino', body: 'When monsters drop corpses (`~`) or skeletons (`s`), check the Hunter\'s Office in town—turning in wanted monster corpses yields stat potions, rods, and high-tier equipment.' },
                { title: 'Watch Your Virtues & Alignment', body: 'In Hengband, eight Virtues (Compassion, Honour, Justice, Patience, Temperance, Valour, Faith, Enlightenment) shift based on your actions and directly modify your spell fail rates and saving throw!' },
                { title: 'Resistance Checklist for DL 40+', body: 'Before tackling Dragon\'s Lair or Castle, lock in <strong>Free Action, Hold Life, See Invisible, Levitation</strong>, all 4 Base Resistances, plus <strong>Poison, Confusion, Blindness, Chaos, and Nether</strong>.' }
            ],
            statsAndMagic: {
                title: 'Virtues, Riding Skill, Dual-Wielding (Niten-Ichi-Ryu) & 12 Magic Realms',
                summary: 'Hengband 3.0 expands ZAngband with deep martial arts, Cavalry/BeastMaster monster riding, dual-wielding weapon proficiencies, and 12 distinct magic realms.',
                items: [
                    ['Weapon & Martial Arts Proficiency', 'Using a weapon type or barehanded Martial Arts increases your proficiency from Unskilled → Beginner → Skilled → Expert → Master, granting huge accuracy bonuses.'],
                    ['Monster Riding (p)', 'Classes with Riding skill can tame and mount Dragons, Wyverns, or Unicorns—sharing their movement speed and breath attacks!'],
                    ['12 Magic Realms', 'Life, Sorcery, Nature, Chaos, Death, Trump (summoning & teleportation), Arcane, Craft (self-buffs & branding), Daemon, Crusade, Music, and Hex (continuous curses).'],
                    ['Personality & Demigod Lineages', 'Your chosen Personality (Combat, Lazy, Sexy, Lucky, Patient, Nimble, Fearless, Pious) shapes your entire stat growth curve from birth to Level 50.']
                ]
            },
            refs: [
                { name: 'Hengband Official Portal (hengband.github.io)', url: 'https://hengband.github.io/en/', desc: 'Official English & Japanese portal for Hengband 3.0 releases, score ladders, and documentation.' },
                { name: 'Hengband 3.0 Upstream GitHub Repository', url: 'https://github.com/hengband/hengband', desc: 'Source documentation, class guides, and bilingual help files for Hengband 3.0.1.26.' }
            ]
        },
        ryod: {
            eraYear: '2026 • Tabletop Forge',
            difficultyTag: 'Custom Worlds & Monster Play',
            title: 'Roll Your Own Dungeon (RYOD) — Universal World Forge',
            subtitle: 'Coherent 3-Layer World Spine • 6-Card Hybrid Tabletop Architect • Self-Hydrating Saves & .ryod.json Blueprints',
            victoryGoal: 'Descend through your forged 5-Act campaign to the Throne Depth (8, 15, or 26 floors) and vanquish the Act V Sovereign Boss—or claim the Sovereign Relic and ascend (<) back to Depth 0 in Ascension Mode!',
            branches: [
                { name: 'Sanctuary Town (Depth 0 — Optional)', desc: 'Safe surface haven with a Temple Altar (p to pray/bless), Quartermaster Shop, Ancient Forge (t to temper gear), Fountain ({), and Descent Stairs (>).' },
                { name: 'Acts I–IV Descent (Depths 1..N-1)', desc: 'Biome-matched dungeon floors guarded by cohesive Faction cohorts (<=6 3D archetypes per floor) and Milestone Act Guardians.' },
                { name: 'Act V Sovereign Sanctum (Goal Depth)', desc: 'Final confrontation against your campaign\'s Sovereign Boss (Morgoth, The Serpent of Chaos, Rodney, Carcharoth, or The Dragon King).' }
            ],
            mechanics: [
                { icon: '🎲', title: '6-Card Hybrid Roll-or-Pick Tabletop Forge', desc: 'Roll dice or pick directly across Biome, Bestiary, Mythic Plot, Hero or Playable Monster Avatar, Discipline, and World Mutator cards.' },
                { icon: '🐉', title: 'Hero Classes & Playable Monster Avatars', desc: 'Play as classic mortal classes or monstrous avatars (Ancient Red Dragon, Vampire Lord, Iron Golem, Arch-Lich, Minotaur Berserker) with bespoke 3D eye-height and natural powers.' },
                { icon: '🐾', title: 'Persistent Pets & Captive Allies', desc: 'Start with a Faithful Hound, Battle Cat, Mini-Dragon, or Arcane Familiar—and rescue chained allies on dungeon floors. Pets follow you across every staircase!' },
                { icon: '💾', title: 'Self-Hydrating SaveRYOD & .ryod.json Blueprints', desc: 'Every SaveRYOD (.sav) file embeds its complete World Blueprint inside the save header so your saves and custom worlds never desync.' }
            ],
            commands: [
                ['m / M', 'Open Active Power Drawer (Arcane Spells, Songs, Divine Miracles, Bushido Stances, or Monster Breath)'],
                ['p / _ / {', 'Pray at Temple Altar / Drink from Magic Fountain'],
                ['w / t / d', 'Wield or wear equipment / Temper at Forge or take off gear / Drop item'],
                ['q / r / e', 'Quaff potion / Read scroll / Eat ration'],
                ['z / f', 'Zap wand or rod / Fire ranged weapon'],
                ['> / <', 'Descend deeper / Ascend stairs (or return to Depth 0 Sanctuary Town)']
            ],
            tips: [
                { title: 'Use Active Powers Frequently [m]', body: 'Your MP regenerates naturally as you explore. Press [m] and [a]/[b]/[c] to cast Phase Blink, Arcane Bolt, Healing Song, or Dragon Breath in tough fights!' },
                { title: 'Keep Your Pet Alive', body: 'Your companion attacks adjacent foes automatically every turn and scales its vitality as you descend deeper.' },
                { title: 'Pray & Temper in Sanctuary Town', body: 'Before diving deep, visit Depth 0 to pray [p] at the Altar (`_`) for full healing + weapon blessing, and press [t] on the Forge (`0`) to temper your weapon.' },
                { title: 'Export & Share Your Best Worlds', body: 'Open the RYOD Forge or Load Game menu anytime to download your `.ryod.json` World Blueprint or copy a `?realm=ryod&bp=...` shareable URL!' }
            ],
            statsAndMagic: {
                title: '5 Power Schools, Monster Avatar Scaling & 5 Difficulty Pacts',
                summary: 'RYOD synthesizes the best mechanics of all 8 classic realms into one cohesive, zero-bloat engine.',
                items: [
                    ['Arcane & Eldritch Sorcery', 'Mana Bolt, Phase Blink, and Cataclysm Nova for high-damage ranged control.'],
                    ['Songs of the First Age', 'Song of Sharpness (+ToHit/Brand), Song of Slumber (AoE Sleep), and Song of Staying (Ward + Heal).'],
                    ['Divine Pantheon & Miracles', 'Sanctuary Heal, Smite the Wicked, and Divine Aegis invulnerability blessing.'],
                    ['Bushido & Martial Stances', 'Whirlwind Cleave (360° melee), Void Step Strike (blink + crit), and Kiai Battle Meditation.']
                ]
            },
            refs: [
                { name: 'YASD 3D Universal Cartridge Architecture', url: 'https://yasd3d.com', desc: 'Powered by the Universal 8-Realm Content Pool and deterministic FNV-1a Blueprint Compiler.' }
            ]
        }
    };

    function renderIntroTab() {
        const el = document.getElementById('guide-tab-0');
        if (!el) return;
        const starterCards = NOVICE_STARTER_PICKS.map((s) => `
            <div class="guide-starter-card">
                <div class="guide-starter-top">
                    <span class="guide-starter-badge">${esc(s.badge)}</span>
                    <div class="guide-entry-title">${s.title}</div>
                </div>
                <p class="guide-entry-desc">${s.desc}</p>
                <div class="guide-starter-actions">
                    ${s.actions.map((a) => a.type === 'play'
                        ? `<button type="button" class="btn-gold guide-inline-btn" data-play-realm="${esc(a.realm)}">${esc(a.label)}</button>`
                        : a.type === 'ryod'
                            ? `<button type="button" class="btn-gold guide-inline-btn" data-open-ryod="1">${esc(a.label)}</button>`
                            : `<button type="button" class="btn-gold-outline guide-inline-btn" data-pick-realm="${esc(a.realm)}">${esc(a.label)}</button>`
                    ).join('')}
                </div>
            </div>
        `).join('');

        const historyCards = NOVICE_HISTORY_TIMELINE.map((h) => `
            <button type="button" class="guide-era-card" data-pick-realm="${esc(h.realm)}" title="Open ${esc(h.title)} Manual">
                <div class="guide-era-meta"><span class="guide-era-year">${esc(h.year)}</span><span class="guide-era-badge">${esc(h.badge)}</span></div>
                <div class="guide-era-title">${esc(h.title)}</div>
                <div class="guide-era-blurb">${esc(h.blurb)}</div>
            </button>
        `).join('');

        el.innerHTML = `<div class="guide-panel-inner">
            <section class="guide-hero-banner">
                <div class="guide-hero-kicker">🎲 NEWCOMER CODEX • ZERO PRIOR ROGUELIKE EXPERIENCE NEEDED</div>
                <h3 class="guide-hero-title">What Is a Classic Roguelike — And Why Is This One Different?</h3>
                <p class="guide-lead">Most modern "roguelites" like <em>Hades</em> or <em>Dead Cells</em> are fast real-time action games. A <strong>classic (traditional) roguelike</strong> is closer to tactical chess mixed with an unscripted tabletop RPG: the entire dungeon simulates fire, sound, curses, monster ecology, and traps—and <strong>time freezes completely until you make a move</strong>. Instead of building a simplified lookalike, <strong>YASD 3D</strong> runs nine of the real, unmodified engines from 1980 to 2026 inside a torchlit first-person 3D world.</p>
                <div class="guide-hero-actions">
                    <button type="button" class="btn-gold guide-inline-btn" id="btn-guide-intro-controls">🎮 See Quick Controls (Tab 4)</button>
                    <button type="button" class="btn-gold-outline guide-inline-btn" id="btn-guide-intro-overview">🗺️ Inspect Active Realm (Tab 2)</button>
                </div>
            </section>
            <section>
                <h4 class="guide-subheading">⚡ Four Reasons Classic Roguelikes Hook Players for Decades</h4>
                <div class="guide-card-grid">
                    <div class="guide-entry-card">
                        <div class="guide-entry-icon">⏱️</div>
                        <div class="guide-entry-title">Time Freezes Until You Act (0-Turn Look)</div>
                        <p class="guide-entry-desc">Turn your head with arrow keys or drag the mouse to peek down hallways, inspect every creature's stats, and plan your route for <strong>zero turns spent</strong>. A dragon two steps away cannot touch you while you read a scroll or ponder your bag at 2 HP.</p>
                    </div>
                    <div class="guide-entry-card">
                        <div class="guide-entry-icon">🧪</div>
                        <div class="guide-entry-title">"Everything Works" Emergent Simulation</div>
                        <p class="guide-entry-desc">Throw harmful potions at monsters, drop a <em>Scroll of Scare Monster</em> as an untouchable floor shield (Rogue), wear gloves to swing a petrifying Cockatrice corpse (NetHack), ignite swamp gas (Brogue), or sing past sleeping dragons (Sil-Q).</p>
                    </div>
                    <div class="guide-entry-card">
                        <div class="guide-entry-icon">💀</div>
                        <div class="guide-entry-title">Yet Another Stupid Death (Or Checkpoints!)</div>
                        <p class="guide-entry-desc">Because dungeons regenerate and mystery potions aren't labeled until you test them, narrow escapes and hilarious blunders turn into unforgettable stories. Prefer forgiving saves while learning? Flip <strong>New Hero Stakes → Adventure Checkpoints</strong> on the Main Menu!</p>
                    </div>
                    <div class="guide-entry-card">
                        <div class="guide-entry-icon">🖥️</div>
                        <div class="guide-entry-title">Two Realities, One Authentic Brain</div>
                        <p class="guide-entry-desc">Every combat roll and dungeon vault comes straight from the genuine C/C++ or canonical engine. Tap <kbd>Alt+T</kbd> anytime to snap instantly between 60 FPS 3D and the classic 80×24 terminal (<kbd>@</kbd> = You, <kbd>D</kbd> = Dragon), and drag your HUD panels anywhere.</p>
                    </div>
                </div>
            </section>
            <section>
                <h4 class="guide-subheading">🧭 Where Should You Start? (Pick Your Vibe)</h4>
                <div class="guide-starter-grid">${starterCards}</div>
            </section>
            <section>
                <h4 class="guide-subheading">📜 46 Years of Roguelike History (Click Any Era to Read Its Manual)</h4>
                <div class="guide-era-grid">${historyCards}</div>
            </section>
        </div>`;
    }

    function renderRealmTabs(key, g, realmMeta, ctx) {
        const safeShort = esc(realmMeta.shortName || realmMeta.name || key);
        const tab1 = document.getElementById('guide-tab-1');
        if (tab1) {
            tab1.innerHTML = `<div class="guide-panel-inner">
                <div class="guide-realm-banner">
                    <img src="/assets/realms/${esc(key)}.webp" alt="" class="guide-realm-art" width="148" height="92" loading="lazy" decoding="async">
                    <div class="guide-realm-banner-body">
                        <div class="guide-realm-badges"><span class="guide-era-badge">${esc(g.eraYear || 'Classic')}</span><span class="guide-era-badge">${esc(g.difficultyTag || '9-Realm Codex')}</span></div>
                        <h3 class="guide-banner-title">${g.title}</h3>
                        <p class="guide-banner-sub">${g.subtitle}</p>
                        <div class="guide-banner-actions">
                            <button type="button" class="btn-gold guide-inline-btn" data-play-realm="${esc(key)}">⚔ Quick-Play ${safeShort}</button>
                            <button type="button" class="btn-gold-outline guide-inline-btn" id="btn-guide-jump-helpfiles">📜 Browse ${safeShort} Manuals →</button>
                        </div>
                    </div>
                </div>
                <div class="guide-callout"><strong>🎯 Ultimate Victory Goal:</strong> ${g.victoryGoal}</div>
                <h4 class="guide-subheading">🗺️ Dungeon Progression &amp; Key Branches</h4>
                <div class="guide-card-grid">${g.branches.map((b) => `<div class="guide-entry-card"><div class="guide-entry-title">${b.name}</div><p class="guide-entry-desc">${b.desc}</p></div>`).join('')}</div>
                <div class="guide-callout"><strong>🎙️ Living Chronicle &amp; Official Manuals (${esc(realmMeta.voiceAccent)}):</strong> Open the <strong>📖 Tome</strong> on the top HUD bar mid-run to ask the Voiced Lorekeeper tactical questions grounded directly in your live dungeon state.</div>
            </div>`;
        }

        const tab2 = document.getElementById('guide-tab-2');
        if (tab2) {
            tab2.innerHTML = `<div class="guide-panel-inner">
                <h3>Core Survival Mechanics — ${safeShort}</h3>
                <p class="guide-lead">Mastering these four signature rules separates victorious ascensions from Yet Another Stupid Death in <strong>${esc(realmMeta.name)}</strong>:</p>
                <div class="guide-card-grid">${g.mechanics.map((m) => `<div class="guide-entry-card"><div class="guide-entry-icon">${m.icon}</div><div class="guide-entry-title">${m.title}</div><p class="guide-entry-desc">${m.desc}</p></div>`).join('')}</div>
            </div>`;
        }

        const tab3 = document.getElementById('guide-tab-3');
        if (tab3) {
            tab3.innerHTML = `<div class="guide-panel-inner">${CONTROL_SECTIONS.map((sec) => `
                <section class="guide-control-group">
                    <h3>${esc(sec.heading)}</h3>
                    <p class="guide-lead">${esc(sec.lead)}</p>
                    <div class="guide-key-table">${sec.rows.map(([k, d]) => `<div class="guide-key-row"><span class="key-badge">${esc(k)}</span><span class="key-desc">${esc(d)}</span></div>`).join('')}</div>
                </section>`).join('')}
            </div>`;
        }

        const tab4 = document.getElementById('guide-tab-4');
        if (tab4) {
            tab4.innerHTML = `<div class="guide-panel-inner">
                <div class="guide-section-header-row">
                    <div><h3>${safeShort} Keybindings &amp; Action Reference</h3><p class="guide-lead">Every action is also clickable on your bottom HUD <strong>Action Bar</strong> or via <kbd>Ctrl+K</kbd>.</p></div>
                    <button type="button" class="btn-gold-outline guide-inline-btn" id="btn-guide-open-compendium">⌘ Open Command Compendium (Ctrl+K)</button>
                </div>
                <div class="guide-key-table">${g.commands.map(([k, d]) => `<div class="guide-key-row"><span class="key-badge">${esc(k)}</span><span class="key-desc">${esc(d)}</span></div>`).join('')}</div>
            </div>`;
        }

        const tab5 = document.getElementById('guide-tab-5');
        if (tab5) {
            tab5.innerHTML = `<div class="guide-panel-inner">
                <h3>Veteran Survival Tactics — ${safeShort}</h3>
                <p class="guide-lead">Hard-won lessons to keep your run alive past the early traps of <strong>${esc(realmMeta.name)}</strong>:</p>
                <div class="guide-tips-list">${g.tips.map((t, idx) => `<div class="guide-tip-item"><span class="tip-num">${idx + 1}</span><div><strong>${t.title}:</strong> ${t.body}</div></div>`).join('')}</div>
            </div>`;
        }

        const tab6 = document.getElementById('guide-tab-6');
        if (tab6) {
            tab6.innerHTML = `<div class="guide-panel-inner">
                <h3>${g.statsAndMagic.title}</h3>
                <p class="guide-lead">${g.statsAndMagic.summary}</p>
                <div class="guide-key-table">${g.statsAndMagic.items.map(([k, d]) => `<div class="guide-key-row"><span class="key-badge">${esc(k)}</span><span class="key-desc">${d}</span></div>`).join('')}</div>
            </div>`;
        }

        const tab7 = document.getElementById('guide-tab-7');
        if (tab7) {
            const refCards = g.refs.map((r) => `
                <a class="guide-ref-card" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">
                    <div class="guide-ref-card-title">🔗 ${esc(r.name)} ↗</div>
                    <div class="guide-ref-card-desc">${esc(r.desc)}</div>
                    <div class="guide-ref-card-url">${esc(r.url)}</div>
                </a>`).join('');
            tab7.innerHTML = `<div class="guide-panel-inner">
                <h3>📜 Bundled ${safeShort} Help Files &amp; Official Manuals</h3>
                <p class="guide-lead">Read authentic upstream manuals, spoilers, or bestiaries directly inside YASD 3D, or filter lines below:</p>
                <div class="guide-helpfile-toolbar">
                    <select id="guide-helpfile-select" aria-label="Select Realm Help File"></select>
                    <input type="search" id="guide-helpfile-filter" placeholder="Filter lines (e.g., dragon, pray, speed)..." aria-label="Filter help file lines">
                    <a id="guide-helpfile-raw-link" href="#" target="_blank" rel="noopener noreferrer" class="btn-gold-outline guide-inline-btn">↗ Open Raw / PDF</a>
                    <button type="button" id="btn-guide-native-term-help" class="btn-gold-outline guide-inline-btn" title="Send '?' to active game engine in Classic Terminal view">[?] Terminal Help</button>
                </div>
                <div id="guide-helpfile-pills" class="guide-helpfile-pills"></div>
                <pre id="guide-helpfile-viewer" class="guide-helpfile-viewer">Loading ${safeShort} help files...</pre>
                <h4>🌐 External ${safeShort} Wikis &amp; Strategy References</h4>
                <div class="guide-ref-grid">${refCards}</div>
                <div class="guide-callout"><strong>🎵 Multi-Realm Adaptive Soundtrack &amp; Open-Source Audio Attribution</strong><br>• <strong>YASD 3D Official Theme</strong> — Composed &amp; Produced by <strong>Thunderbear Studios</strong>.<br>• <strong>Hengband 3.0 / HURT RECORD Suite (47 Tracks)</strong> — Composed by Isamu, pin, Take, kiku, G.S, you, Shintaro Aoki, N.K, masa, TMS, y.tamura, kuusuke &amp; mosaic (<a href="https://www.hurtrecord.com/" target="_blank" rel="noopener noreferrer" style="color:var(--yasd-gold-accent);">hurtrecord.com</a>).<br>• <strong>OpenGameArt Dark-Fantasy Realm Expansion (10 Tracks)</strong> — <em>Destroyed Sanctuary</em> by Filtered (CC0), <em>Alandriel's Theme</em> &amp; <em>Dungeon Theme I</em> by Remaxim (CC-BY-SA 3.0), <em>The Elven Groves</em> by loyalty_freak_music (CC0), <em>A Small Fire Will Do</em> by syncopika (CC-BY 3.0), <em>Fantasy Night</em> &amp; <em>Dungeon of Agony</em> by Cleyton Kauffman (CC-BY-SA 3.0/4.0), <em>Dark Descent</em> by Phat Phrog Studios (CC0), <em>Throne Room</em> by Of Far Different Nature (CC-BY 4.0), and <em>Lament for a Warrior's Soul</em> by RandomMind (CC0).</div>
                <div class="guide-callout"><strong>🎨 3D Bestiary, Photogrammetry &amp; Open-License Art Attribution</strong><br>• <strong>Realm Card Plates (Non-AI PD / CC0 / FOSS)</strong>: John Martin <em>Pandemonium</em> (PD, Angband), Gustave Doré <em>Leviathan</em> (PD, FrogComposBand), Utagawa Kuniyoshi <em>Takiyasha the Witch</em> (PD, Hengband), Giovanni Battista Piranesi <em>Carceri Plate VII</em> (PD, Classic Rogue), DCSS <em>Ignis</em> by <code>kaonedong</code> (CC0), and isometric graphical <em>Vulture for NetHack</em> (GPL/NGPL) — see <code>assets/realms/ATTRIBUTION.md</code>.<br>• <strong>Poly Haven (CC0 1.0)</strong>: Photogrammetry cliff mineral veins (<code>marble_cliff_01/02</code>), boulders (<code>rock_07</code>), blades (<code>wooden_handle_saber</code>, <code>antique_katana_01</code>), statues &amp; props • <strong>Quaternius, Medieval Fantasy MegaKit &amp; KayKit (CC0 1.0)</strong> • <strong>OpenMMO (MIT)</strong> • <strong>Poly by Google / Khronos glTF</strong> • <strong>Raymond &quot;Shockbolt&quot; Gaustadnes</strong>.<br>• <strong>Sketchfab / Objaverse CC-BY 4.0 3D Artists</strong>: Fubbi (<em>Hell Wolf</em>), Spinnee (<em>AWIL Werewolf</em>, <em>Cheshire Manticore</em>), Nyilonelycompany (<em>Bear</em>), Anthony Yanez (<em>Animated Beholder</em>), NORBERTO-3D (<em>Dragon Flying</em>), savounited (<em>Alduin Dragon</em>), InaweofGod (<em>Doberman</em>), Ear.Rodriguez (<em>Jaguar</em>), bakuwo (<em>Snake</em>), denys4624 (<em>Komodo</em>), Lilly! (<em>Snowy Owl</em>), Asim3d (<em>Animated Eagle</em>), warrenblyth (<em>American Crow</em>), pxltiger (<em>Zombie</em>), Mateus Schwaab (<em>Great White Shark</em>), lawtrigg (<em>Kraken v2</em>), artikora (<em>Glowing Mushroom</em>), rubaun (<em>Skull</em>) — <a href="https://github.com/ThunderbearStudios/angband3d/blob/main/CREDITS.md" target="_blank" rel="noopener noreferrer" style="color:var(--yasd-gold-accent);">Full CREDITS.md ↗</a>.</div>
                <div class="guide-callout"><strong>⚔️ YASD 3D — 9-Realm Yendor Engine™ &amp; RYOD Tabletop Forge</strong><br>Created by <strong>Thunderbear Studios (<a href="https://thunderbearstudios.dev" target="_blank" rel="noopener noreferrer" style="color:var(--yasd-gold-accent);">thunderbearstudios.dev</a> • <a href="https://yasd3d.com" target="_blank" rel="noopener noreferrer" style="color:var(--yasd-gold-accent);">yasd3d.com</a>)</strong> — Powered by 8 authentic upstream roguelike engines + the 9th <strong>RYOD Tabletop World Forge</strong> and Voiced Living Chronicle.</div>
            </div>`;
            wireHelpReader(key, ctx);
        }
    }

    function wireHelpReader(key, ctx) {
        const selectEl = document.getElementById('guide-helpfile-select');
        const filterEl = document.getElementById('guide-helpfile-filter');
        const viewerEl = document.getElementById('guide-helpfile-viewer');
        const rawLinkEl = document.getElementById('guide-helpfile-raw-link');
        const pillsEl = document.getElementById('guide-helpfile-pills');
        const termHelpBtn = document.getElementById('btn-guide-native-term-help');
        let currentRawContent = '';
        if (termHelpBtn) termHelpBtn.onclick = () => { if (ctx.openTerminalHelp) ctx.openTerminalHelp(); };
        const renderFilteredText = () => {
            if (!viewerEl) return;
            const q = (filterEl && filterEl.value ? filterEl.value.trim().toLowerCase() : '');
            if (!q) { viewerEl.textContent = currentRawContent; return; }
            const lines = currentRawContent.split(/\r?\n/);
            const matched = [];
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(q)) {
                    const start = Math.max(0, i - 1), end = Math.min(lines.length - 1, i + 2);
                    matched.push(`--- [Line ${i + 1}] ---`);
                    for (let j = start; j <= end; j++) matched.push(lines[j]);
                    i = end;
                }
            }
            viewerEl.textContent = matched.length > 0 ? matched.join('\n') : `No lines matching "${filterEl.value}" in this help file.`;
        };
        if (filterEl) filterEl.addEventListener('input', renderFilteredText);
        const loadSingleHelpFile = async (fileName, fileType) => {
            if (!viewerEl || !fileName) return;
            const rawUrl = `/api/help?realm=${encodeURIComponent(key)}&file=${encodeURIComponent(fileName)}&raw=1`;
            if (rawLinkEl) rawLinkEl.href = rawUrl;
            if (pillsEl) pillsEl.querySelectorAll('button[data-help-file]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-help-file') === fileName));
            if (fileType === 'pdf' || fileName.toLowerCase().endsWith('.pdf')) {
                currentRawContent = `[PDF Manual: ${fileName}]`;
                viewerEl.innerHTML = `<div style="padding:10px;"><strong>📕 Illustrated PDF Manual (${esc(fileName)})</strong><br><br><a href="${esc(rawUrl)}" target="_blank" rel="noopener noreferrer" class="btn-gold guide-inline-btn">↗ Open ${esc(fileName)} in New Tab</a></div>`;
                return;
            }
            viewerEl.textContent = `Loading ${fileName}...`;
            try {
                const r = await fetch(`/api/help?realm=${encodeURIComponent(key)}&file=${encodeURIComponent(fileName)}`);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                currentRawContent = data.content || '';
                renderFilteredText();
                viewerEl.scrollTop = 0;
            } catch (err) { viewerEl.textContent = `Unable to load help file (${fileName}): ${err.message}`; }
        };
        fetch(`/api/help?realm=${encodeURIComponent(key)}`)
            .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then((data) => {
                if (ctx.getGuideRealm && ctx.getGuideRealm() !== key) return;
                const files = Array.isArray(data.files) ? data.files : [];
                if (!selectEl || files.length === 0) { if (viewerEl) viewerEl.textContent = 'No bundled help files found for this realm.'; return; }
                selectEl.innerHTML = files.map((f) => `<option value="${esc(f.name)}" data-type="${esc(f.type || 'text')}">${esc(f.label || f.name)}</option>`).join('');
                if (pillsEl) {
                    pillsEl.innerHTML = files.slice(0, 8).map((f) => `<button type="button" class="guide-help-pill" data-help-file="${esc(f.name)}" data-help-type="${esc(f.type || 'text')}">${esc(f.label || f.name)}</button>`).join('');
                    pillsEl.querySelectorAll('button[data-help-file]').forEach((btn) => btn.addEventListener('click', () => {
                        const fn = btn.getAttribute('data-help-file'), ft = btn.getAttribute('data-help-type') || 'text';
                        selectEl.value = fn;
                        loadSingleHelpFile(fn, ft);
                    }));
                }
                selectEl.onchange = () => {
                    const opt = selectEl.options[selectEl.selectedIndex];
                    loadSingleHelpFile(selectEl.value, opt ? (opt.getAttribute('data-type') || 'text') : 'text');
                };
                const firstText = files.find((f) => f.type !== 'pdf') || files[0];
                selectEl.value = firstText.name;
                loadSingleHelpFile(firstText.name, firstText.type);
            })
            .catch((err) => { if (viewerEl) viewerEl.textContent = `Could not fetch help file list: ${err.message}`; });
    }

    function runGlobalSearch(rawQuery, key, ctx) {
        const outEl = document.getElementById('guide-search-results');
        const contents = document.querySelectorAll('#guide-body .guide-tab-content');
        if (!outEl) return;
        const q = String(rawQuery || '').trim().toLowerCase();
        if (!q) {
            outEl.classList.add('hidden');
            outEl.innerHTML = '';
            contents.forEach((c) => {
                if (c.classList.contains('active')) c.removeAttribute('hidden');
                else c.setAttribute('hidden', 'until-found');
            });
            return;
        }
        contents.forEach((c) => c.setAttribute('hidden', 'until-found'));
        outEl.classList.remove('hidden');

        const hits = [];
        const addHit = (tabIdx, realmKey, cat, title, body) => {
            const plain = String(title + ' ' + body).replace(/<[^>]+>/g, ' ').toLowerCase();
            if (plain.includes(q)) hits.push({ tabIdx, realmKey, cat, title, body });
        };

        NOVICE_HISTORY_TIMELINE.forEach((h) => addHit(1, h.realm, 'Era / Realm', `${h.title} (${h.year})`, h.blurb));
        NOVICE_STARTER_PICKS.forEach((s) => addHit(0, key, 'Newcomer Guide', s.title, s.desc));
        CONTROL_SECTIONS.forEach((sec) => sec.rows.forEach(([k, d]) => addHit(3, key, '3D Controls', k, d)));

        const g = REALM_SURVIVAL_GUIDES[key] || REALM_SURVIVAL_GUIDES.angband;
        addHit(1, key, `${key.toUpperCase()} Goal`, g.title, g.victoryGoal);
        g.branches.forEach((b) => addHit(1, key, 'Branch', b.name, b.desc));
        g.mechanics.forEach((m) => addHit(2, key, 'Mechanic', m.title, m.desc));
        g.commands.forEach(([k, d]) => addHit(4, key, 'Command', k, d));
        g.tips.forEach((t) => addHit(5, key, 'Pro Tip', t.title, t.body));
        g.statsAndMagic.items.forEach(([k, d]) => addHit(6, key, 'Stats & Magic', k, d));

        REALM_ORDER.filter((r) => r !== key).forEach((rk) => {
            const rg = REALM_SURVIVAL_GUIDES[rk];
            if (!rg) return;
            addHit(1, rk, `Switch to ${rk.toUpperCase()}`, rg.title, rg.subtitle);
        });

        const tabNames = ['1. New to Roguelikes', '2. Realm Overview', '3. Mechanics', '4. 3D Controls', '5. Commands', '6. Pro Tips', '7. Stats & Magic', '8. Manuals'];
        outEl.innerHTML = `<div class="guide-panel-inner">
            <div class="guide-section-header-row">
                <h3>Search Results for “${esc(rawQuery.trim())}” (${hits.length})</h3>
                <button type="button" class="btn-gold-outline guide-inline-btn" id="btn-guide-clear-search">✕ Clear Search</button>
            </div>
            ${hits.length === 0
                ? `<div class="guide-callout">No matches found for <strong>${esc(rawQuery.trim())}</strong>. Try searching <code>wasd</code>, <code>roguelike</code>, <code>aquator</code>, <code>silmaril</code>, or press <kbd>Ctrl+K</kbd> for all commands.</div>`
                : `<div class="guide-search-grid">${hits.slice(0, 24).map((h) => `
                    <button type="button" class="guide-search-hit" data-hit-tab="${h.tabIdx}" data-hit-realm="${esc(h.realmKey)}">
                        <span class="guide-search-meta">${esc(h.cat)} • ${esc(tabNames[h.tabIdx] || '')}</span>
                        <strong class="guide-search-title">${h.title}</strong>
                        <span class="guide-search-snippet">${String(h.body).replace(/<[^>]+>/g, '')}</span>
                    </button>`).join('')}</div>`
            }
        </div>`;

        const clearBtn = document.getElementById('btn-guide-clear-search');
        if (clearBtn) clearBtn.onclick = () => {
            const inp = document.getElementById('guide-global-search');
            if (inp) inp.value = '';
            runGlobalSearch('', key, ctx);
        };
        outEl.querySelectorAll('.guide-search-hit').forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetTab = parseInt(btn.getAttribute('data-hit-tab'), 10) || 0;
                const targetRealm = btn.getAttribute('data-hit-realm');
                const inp = document.getElementById('guide-global-search');
                if (inp) inp.value = '';
                if (targetRealm && targetRealm !== key) render(targetRealm, ctx);
                if (ctx.switchTab) ctx.switchTab(targetTab);
            });
        });
    }

    function bindDelegatedGuideActions(ctx) {
        const bodyEl = document.getElementById('guide-body');
        if (bodyEl && !bodyEl._guideDelegatedBound) {
            bodyEl._guideDelegatedBound = true;
            bodyEl.addEventListener('click', (e) => {
                const target = e.target.closest('[data-pick-realm], [data-play-realm], [data-open-ryod], #btn-guide-intro-controls, #btn-guide-intro-overview, #btn-guide-jump-helpfiles, #btn-guide-open-compendium');
                if (!target) return;
                if (target.id === 'btn-guide-intro-controls' && ctx.switchTab) return ctx.switchTab(3);
                if (target.id === 'btn-guide-intro-overview' && ctx.switchTab) return ctx.switchTab(1);
                if (target.id === 'btn-guide-jump-helpfiles' && ctx.switchTab) return ctx.switchTab(7);
                if (target.id === 'btn-guide-open-compendium' && ctx.openCommandPalette) return ctx.openCommandPalette();
                if (target.hasAttribute('data-open-ryod') && ctx.openRyodForge) return ctx.openRyodForge();
                const playRealm = target.getAttribute('data-play-realm');
                if (playRealm && ctx.quickPlayRealm) return ctx.quickPlayRealm(playRealm);
                const pickRealm = target.getAttribute('data-pick-realm');
                if (pickRealm && REALM_SURVIVAL_GUIDES[pickRealm]) {
                    if (ctx.playNav) ctx.playNav();
                    render(pickRealm, ctx);
                    if (ctx.switchTab) ctx.switchTab(1);
                }
            });
        }
        const sidePlayBtn = document.getElementById('btn-guide-play-realm');
        if (sidePlayBtn) {
            sidePlayBtn.onclick = () => {
                const cur = (ctx.getGuideRealm && ctx.getGuideRealm()) || 'angband';
                if (ctx.quickPlayRealm) ctx.quickPlayRealm(cur);
            };
        }
        const searchInp = document.getElementById('guide-global-search');
        if (searchInp && !searchInp._guideSearchBound) {
            searchInp._guideSearchBound = true;
            searchInp.addEventListener('input', () => {
                const cur = (ctx.getGuideRealm && ctx.getGuideRealm()) || 'angband';
                runGlobalSearch(searchInp.value, cur, ctx);
            });
        }
        if (!window.__guideRealmPillsBound) {
            window.__guideRealmPillsBound = true;
            document.querySelectorAll('.guide-realm-pill[data-guide-realm]').forEach((pill) => {
                pill.addEventListener('click', () => {
                    const targetRealm = pill.dataset.guideRealm;
                    if (targetRealm && REALM_SURVIVAL_GUIDES[targetRealm]) {
                        if (ctx.playNav) ctx.playNav();
                        render(targetRealm, ctx);
                    }
                });
            });
        }
        document.querySelectorAll('#guide-body .guide-tab-content').forEach((panel, idx) => {
            if (!panel._guideBeforeMatchBound) {
                panel._guideBeforeMatchBound = true;
                panel.addEventListener('beforematch', () => {
                    if (ctx.switchTab) ctx.switchTab(idx);
                });
            }
        });
    }

    function render(realmKey, ctx = {}) {
        const key = (realmKey && REALM_SURVIVAL_GUIDES[realmKey]) ? realmKey : 'angband';
        const g = REALM_SURVIVAL_GUIDES[key];
        const realmData = ctx.REALM_DATA || {};
        const realmMeta = realmData[key] || { name: g.title, shortName: key.toUpperCase(), voiceAccent: 'Master Narrator' };
        const shortName = realmMeta.shortName || realmMeta.name || key;
        if (ctx.setGuideRealm) ctx.setGuideRealm(key);

        document.querySelectorAll('.guide-realm-pill[data-guide-realm]').forEach((btn) => {
            const isMatch = btn.dataset.guideRealm === key;
            btn.classList.toggle('active', isMatch);
            btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
        });
        const titleText = document.getElementById('guide-modal-title-text') || document.getElementById('guide-modal-title');
        if (titleText) titleText.textContent = `ADVENTURER'S CODEX — ${shortName.toUpperCase()}`;
        const chipEl = document.getElementById('guide-active-realm-chip');
        if (chipEl) chipEl.textContent = `${g.eraYear || '9 Realms'}`;
        const playBtn = document.getElementById('btn-guide-play-realm');
        if (playBtn) playBtn.textContent = `⚔ Quick-Play ${shortName}`;

        renderIntroTab();
        renderRealmTabs(key, g, realmMeta, ctx);
        bindDelegatedGuideActions(ctx);

        const searchInp = document.getElementById('guide-global-search');
        if (searchInp && searchInp.value.trim()) runGlobalSearch(searchInp.value, key, ctx);
    }

    root.AdventurerGuide = { REALM_SURVIVAL_GUIDES, render, runGlobalSearch };
})(typeof window !== 'undefined' ? window : globalThis);

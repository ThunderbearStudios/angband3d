'use strict';

/**
 * server/src/realm-help-files.js
 *
 * Unified 9-Realm Official Help File & Manual Provider.
 * Serves:
 *  - Official upstream help files from disk for Angband 4.2.6, Sil-Q 1.5.0,
 *    FrogComposband 7.1, and Hengband 3.0.1.26 (English & Japanese).
 *  - Complete multi-chapter manuals, command tables, role/deity compendiums,
 *    and live engine bestiaries/item encyclopedias for NetHack 3.6.7,
 *    Dungeon Crawl Stone Soup 0.31, Brogue CE 1.13, Classic Rogue 5.4.4,
 *    Sil-Q 1.5.0, Vanilla Angband 4.2.6, and Regions of Yendor: Dungeons (RYOD).
 */

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '../..');

function resolveFirstExistingDir(candidates) {
    for (const c of candidates) {
        try {
            if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
                return path.resolve(c);
            }
        } catch (_) {}
    }
    return null;
}

const REALM_DIRS = {
    angband: () => [
        resolveFirstExistingDir(['/app/engine/docs', path.join(APP_ROOT, 'engine/docs')]),
        resolveFirstExistingDir(['/app/engine/lib/help', path.join(APP_ROOT, 'lib/help'), path.join(APP_ROOT, 'engine/lib/help')])
    ].filter(Boolean),
    silq: () => [
        resolveFirstExistingDir(['/app/variants/silq/lib/docs', path.join(APP_ROOT, 'variants/silq/lib/docs')])
    ].filter(Boolean),
    frogcomposband: () => [
        resolveFirstExistingDir(['/app/variants/frogcomposband/lib/help', path.join(APP_ROOT, 'variants/frogcomposband/lib/help')])
    ].filter(Boolean),
    hengband: () => [
        resolveFirstExistingDir(['/app/variants/hengband/lib/help', path.join(APP_ROOT, 'variants/hengband/lib/help')])
    ].filter(Boolean)
};

// Friendly labels for well-known upstream help filenames
const FILE_LABELS = {
    // Angband 4.2.6 (.rst / .txt)
    'guide.rst': '📖 Adventurer\'s Survival Guide (guide.rst)',
    'a-quick-demo.rst': '⚡ Quick Walkthrough Demo (a-quick-demo.rst)',
    'birth.rst': '🧬 Creating a Hero: Races, Classes & Stats (birth.rst)',
    'command.rst': '⌨️ Complete Command Reference (command.rst)',
    'dungeon.rst': '🏰 Town, Dungeon & Vaults Guide (dungeon.rst)',
    'attack.rst': '⚔️ Combat, Weapons & Monsters (attack.rst)',
    'playing.rst': '🎮 Playing the Game & UI Guide (playing.rst)',
    'customize.rst': '⚙️ Options, Keymaps & Inscriptions (customize.rst)',
    'faq.rst': '❓ Frequently Asked Questions (faq.rst)',
    'index.txt': '📜 In-Game Help Index (index.txt)',
    'help.hlp': '📜 Classic Terminal Help Index (help.hlp)',

    // FrogComposband / Hengband (.txt)
    'general.txt': '📖 General Information & Overview (general.txt)',
    'command.txt': '⌨️ Keybindings & Command Summary (command.txt)',
    'commdesc.txt': '📋 Detailed Command Descriptions (commdesc.txt)',
    'birth.txt': '🧬 Character Birth, Stats & Point-Buy (birth.txt)',
    'raceclas.txt': '🦸 Races, Classes & Personalities (raceclas.txt)',
    'Classes.txt': '🦸 All Playable Classes Guide (Classes.txt)',
    'MonsterRaces.txt': '🐉 Playable Monster Races & Evolutions (MonsterRaces.txt)',
    'Personalities.txt': '🎭 Character Personalities Guide (Personalities.txt)',
    'Demigods.txt': '⚡ Demigod Parentages & Powers (Demigods.txt)',
    'Dragons.txt': '🐲 Playable Dragons Guide (Dragons.txt)',
    'DragonRealms.txt': '🔥 Dragon Magic Realms (DragonRealms.txt)',
    'Demons.txt': '👿 Playable Demon Races (Demons.txt)',
    'Disciples.txt': '🔮 Disciples & Patrons Guide (Disciples.txt)',
    'Draconians.txt': '🦎 Draconian Traits & Breaths (Draconians.txt)',
    'Orcs.txt': '🪓 Playable Orc Subraces (Orcs.txt)',
    'Spiders.txt': '🕷️ Playable Spider Races (Spiders.txt)',
    'The_Ring.txt': '💍 Playing as a Sentient Ring (The_Ring.txt)',
    'Time_Lord.txt': '⏳ Time-Lord Class Guide (Time_Lord.txt)',
    'Vampires.txt': '🧛 Vampire Race & Class Guide (Vampires.txt)',
    'Weaponmaster.txt': '🗡️ Weaponmaster Specializations (Weaponmaster.txt)',
    'Wild_Talent.txt': '🎲 Wild-Talent Class Guide (Wild_Talent.txt)',
    'attack.txt': '⚔️ Attacking, Weapons & Combat Math (attack.txt)',
    'defend.txt': '🛡️ Armor, Resistances & Defense (defend.txt)',
    'dungeon.txt': '🗺️ Dungeons, Wilderness & Quests (dungeon.txt)',
    'town.txt': '🏘️ Towns, Buildings, Arena & Services (town.txt)',
    'magic.txt': '✨ Magic Realms, Spells & Mindcraft (magic.txt)',
    'monster.txt': '👹 Monsters, Uniques & Pets (monster.txt)',
    'objects.txt': '🎒 Objects, Artifacts & Ego Items (objects.txt)',
    'objflags.txt': '🏷️ Equipment Flags & Resistances (objflags.txt)',
    'speed.txt': '⚡ Energy & Speed System Explained (speed.txt)',
    'gambling.txt': '🎰 Town Casino & Gambling Rules (gambling.txt)',
    'option.txt': '⚙️ Game Options Reference (option.txt)',
    'pref.txt': '📝 Macros, Auto-Picker & Pref Files (pref.txt)',
    'faq.txt': '❓ Frequently Asked Questions (faq.txt)',
    'glossary.txt': '📚 Roguelike Glossary (glossary.txt)',
    'tang.txt': '📜 ZAngband / Hengband Heritage (tang.txt)',
    'version.txt': '🕒 Version History & Credits (version.txt)',

    // Hengband Japanese (日本語)
    'jgeneral.txt': '🈳 [JP] 変愚蛮怒 概要 (jgeneral.txt)',
    'jcommand.txt': '🈳 [JP] コマンド一覧 (jcommand.txt)',
    'jcommdesc.txt': '🈳 [JP] コマンド詳細解説 (jcommdesc.txt)',
    'jraceclas.txt': '🈳 [JP] 種族・職業・性格解説 (jraceclas.txt)',
    'jattack.txt': '🈳 [JP] 攻撃と武器 (jattack.txt)',
    'jdefend.txt': '🈳 [JP] 防御と耐性 (jdefend.txt)',
    'jdungeon.txt': '🈳 [JP] ダンジョンと荒野 (jdungeon.txt)',
    'jtown.txt': '🈳 [JP] 街と施設・闘技場 (jtown.txt)',
    'jmagic.txt': '🈳 [JP] 魔法と領域 (jmagic.txt)',
    'jmonster.txt': '🈳 [JP] モンスターとペット (jmonster.txt)',
    'jobjects.txt': '🈳 [JP] アイテムとアーティファクト (jobjects.txt)',
    'joption.txt': '🈳 [JP] オプション設定 (joption.txt)',
    'jpref.txt': '🈳 [JP] 自動拾い・マクロ設定 (jpref.txt)',
    'jgambling.txt': '🈳 [JP] カジノとギャンブル (jgambling.txt)',

    // Sil-Q
    'Sil-Q 1.4.2 Manual.pdf': '📕 Official Sil-Q Illustrated Manual (PDF)',
    'Sil 1.3 Manual.pdf': '📘 Classic Sil 1.3 Illustrated Manual (PDF)',
    'CHANGELOG.md': '📜 Sil-Q 1.5.0 Complete Mechanics & Ability Changes (CHANGELOG.md)',
    'early-changes.txt': '📜 Sil-Q 1.1–1.4 Balance & Ability Reference (early-changes.txt)'
};

function buildCartridgeBestiaryAndItems(spec, realmLabel) {
    if (!spec) return '';
    const lines = [];
    lines.push(`==============================================================================`);
    lines.push(`  ${realmLabel.toUpperCase()} — COMPLETE BESTIARY, ROLES & ITEM ENCYCLOPEDIA`);
    lines.push(`==============================================================================\n`);

    if (Array.isArray(spec.roles) && spec.roles.length > 0) {
        lines.push(`--- PLAYABLE ROLES / BACKGROUNDS ---`);
        for (const r of spec.roles) {
            const wName = r.weapon ? `${r.weapon.name} (${r.weapon.dmg || '1d6'})` : 'unarmed';
            const aName = r.armor ? `${r.armor.name} (AC ${r.armor.ac})` : 'cloth';
            const exName = r.extra ? r.extra.name : 'none';
            lines.push(`  [${r.key}] ${r.id} (${r.race}, ${r.align || 'Neutral'})${r.deity ? ' • Deity: ' + r.deity : ''}`);
            lines.push(`      HP: ${r.hp}  MP: ${r.pw || 0}  AC: ${r.ac}  STR:${r.str} INT:${r.int} WIS:${r.wis} DEX:${r.dex} CON:${r.con}`);
            lines.push(`      Gear: ${wName}, ${aName}, ${exName}\n`);
        }
    }

    if (Array.isArray(spec.gods) && spec.gods.length > 0) {
        lines.push(`--- PANTHEON OF DEITIES ---`);
        lines.push(`  ${spec.gods.join('  •  ')}\n`);
    }

    if (Array.isArray(spec.allies) && spec.allies.length > 0) {
        lines.push(`--- LIBERATED CAPTIVE ALLIES ---`);
        for (const a of spec.allies) {
            lines.push(`  [${a.glyph}] ${a.name.padEnd(24, ' ')} HP:${String(a.hp).padStart(3, ' ')}  DMG:${String(a.dmg).padStart(2, ' ')} — ${a.lore || ''}`);
        }
        lines.push('');
    }

    if (Array.isArray(spec.monsters) && spec.monsters.length > 0) {
        lines.push(`--- MONSTER BESTIARY (BY DEPTH) ---`);
        lines.push(`  GLYPH  NAME                     DEPTH   HP    AC   DMG   EXP   LORE`);
        lines.push(`  -----  -----------------------  -----  ----  ----  ----  ----  ------------------------------`);
        for (const m of spec.monsters) {
            lines.push(
                `   [${m.glyph}]   ${String(m.name).padEnd(23, ' ')}  DL ${String(m.minDepth || 1).padStart(2, ' ')}  ` +
                `${String(m.hp).padStart(4, ' ')}  ${String(m.ac).padStart(4, ' ')}  ${String(m.dmg).padStart(4, ' ')}  ` +
                `${String(m.exp || 0).padStart(4, ' ')}  ${m.lore || ''}`
            );
        }
        lines.push('');
    }

    if (Array.isArray(spec.items) && spec.items.length > 0) {
        lines.push(`--- DUNGEON ITEMS & ARTIFACTS ---`);
        for (const it of spec.items) {
            const detail = it.heal ? `Heals ${it.heal} HP` : (it.enchantGain ? `+${it.enchantGain} Enchant` : (it.strengthGain ? `+${it.strengthGain} Strength` : (it.ac ? `AC ${it.ac}` : (it.charges ? `${it.charges} charges` : (it.nutrition ? `${it.nutrition} nutrition` : '')))));
            lines.push(`  [${it.glyph || '?'}] ${String(it.name).padEnd(32, ' ')} (${it.kind}) ${detail}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function getVirtualHelpFiles(realm) {
    let dcssSpec = null, brogueSpec = null, rogueSpec = null;
    try { dcssSpec = require('../../variants/dcss/bin/dcss-bridge').DCSS_SPEC; } catch (_) {}
    try { brogueSpec = require('../../variants/brogue/bin/brogue-bridge').BROGUE_SPEC; } catch (_) {}
    try { rogueSpec = require('../../variants/rogue/bin/rogue-bridge').ROGUE_SPEC; } catch (_) {}

    const map = {
        nethack: [
            {
                name: 'Guidebook.txt',
                label: '📖 NetHack 3.6.7 Official Guidebook & Ascension Manual',
                type: 'text',
                content: `==============================================================================
  NETHACK 3.6.7 — GUIDEBOOK TO THE MAZES OF MENACE
==============================================================================

1. VICTORY GOAL & THE ASCENSION RUN
-----------------------------------
Your ultimate objective is to descend through the Dungeons of Doom and Gehennom,
collect the three Invocation Artifacts, slay the Wizard of Yendor (Rodney),
perform the Invocation Ritual on the vibrating square (lowest floor of Gehennom),
enter Moloch's Sanctum to claim the real Amulet of Yendor, and ascend all the
way to the Astral Plane to offer (#offer) the Amulet on your co-aligned High Altar.

The Three Required Invocation Artifacts:
  1. The Bell of Opening       — Dropped by your Role's Quest Nemesis (DL 11–16 portal, requires XL 14).
  2. The Candelabrum of Invocation — Guarded by Vlad the Impaler at the top of Vlad's Tower in Gehennom.
  3. The Book of the Dead      — Held by the Wizard of Yendor (Rodney) in his Wizard's Tower.

2. DUNGEON BRANCHES BY DEPTH
----------------------------
  • Dungeons of Doom (DL 1–29): Main trunk.
  • The Gnomish Mines (Fork at DL 2–4): Leads to Minetown (guaranteed Temple & Shops)
    and Mine's End (guaranteed Luckstone).
  • The Oracle & Sokoban (DL 5–9): Stairs UP from the Oracle floor enter Sokoban.
    Solving all 4 Sokoban boulder puzzles rewards either an Amulet of Reflection
    or a Bag of Holding!
  • Quest Portal (DL 11–16): Unlocked at Experience Level 14 with Pious alignment.
  • Medusa's Island (DL 20–24): Cross using Levitation/Water Walking and wear a
    Blindfold/Towel or carry Reflection so Medusa's gaze turns HER to stone!
  • The Castle (DL 25–29): Contains a guaranteed Wand of Wishing (0:1 to 0:3) in
    one of the four corner towers. Lower the drawbridge with a Wand of Striking
    or shatter it with force bolts, or play the Mastermind tune on a bugle/flute.
  • Gehennom (DL 26–50+): Maze levels housing Juiblex, Baalzebub, Orcus, Asmodeus,
    Vlad's Tower, the Wizard's Tower, and the Vibrating Square.

3. BLESSED / UNCURSED / CURSED (BUC) & ALTARS
---------------------------------------------
  • NEVER equip unidentified armor, weapons, rings, or amulets until you know
    they are not Cursed! Cursed equipment welds to your body.
  • Pet Testing: Drop unknown items on the floor in a lit room. Your starting
    dog, cat, or pony will refuse to step on cursed items (or step on them only
    reluctantly with a message).
  • Altar Testing: Dropping items onto ANY Temple Altar immediately reveals
    whether each item is Blessed (amber flash), Uncursed, or Cursed (black flash).
  • Holy Water: Dip (#dip) potions of water into a blessed potion of water (or
    pray on a co-aligned altar with water potions on it) to create Potions of
    Holy Water. Dipping cursed items in Holy Water uncurses them!

4. CORPSE INTRINSICS & FOOD SAFETY
----------------------------------
  Eat (e) fresh corpses (< 50 turns old) to gain permanent intrinsics:
  • Floating Eye          -> Telepathy (see monsters while blind!)
  • Fire Ant / Red Dragon -> Fire Resistance
  • Winter Wolf / White D -> Cold Resistance
  • Killer Bee / Snake    -> Poison Resistance
  • Black Pudding / Dragon-> Disintegration Resistance
  • Wraith                -> +1 Experience Level!
  • Giant / Ettin         -> +1 Strength
  DANGEROUS CORPSES (NEVER EAT):
  • Cockatrice / Chickatrice -> Instant Petrification! (Also NEVER touch barehanded!)
  • Kobold / Rotten Corpse   -> Food Poisoning / Sickness
  • Green Slime              -> Turns you into slime!
  • Mind Flayer / Dwarf/Elf  -> Cannibalism or dangerous side effects

5. ELBERETH & EMERGENCY SURVIVAL
--------------------------------
  • Engraving Elbereth: Press 'E', choose '-' (fingers in dust) or a weapon/wand,
    and write 'Elbereth'. Most non-blind, non-minotaur, non-human monsters refuse
    to attack you in melee while you stand on a clean Elbereth square!
  • Praying (#pray): Only pray when HP < 15%, Weak/Fainting from hunger, or
    turning to stone. Wait at least 800–1,000 turns before praying again.`
            },
            {
                name: 'Commands.txt',
                label: '⌨️ NetHack 3.6.7 Complete Keybindings & #Extended Commands',
                type: 'text',
                content: `==============================================================================
  NETHACK 3.6.7 — COMPLETE COMMAND & EXTENDED (#) KEY REFERENCE
==============================================================================

INVENTORY & EQUIPMENT
  i       List inventory
  [       List worn/wielded equipment (/ or | toggles Inventory <-> Equipment)
  , or g  Pick up item(s) on current tile
  d / D   Drop single item / Drop multiple items
  w       Wield a weapon (or 'w -' to fight barehanded)
  W / T   Wear armor / Take off armor
  P / R   Put on accessory (ring, amulet, blindfold, towel) / Remove accessory
  x       Swap between primary and secondary weapons
  I / :   Examine an inventory item

CONSUMABLES, MAGIC & TOOLS
  e       Eat food ration, tin, or monster corpse (on floor [y/n] or pack [a-z])
  q       Quaff (drink) a potion (or fountain when standing on '{')
  r       Read a scroll or spellbook
  z       Zap a wand in a direction
  Z / +   Cast a memorized spell
  a       Apply (use) a tool: key, lockpick, stethoscope, lamp, unicorn horn, bag, pick-axe
  t / f   Throw an item / Fire ammunition (also v / Q)

DUNGEON INTERACTION, EXPLORATION & SYSTEM
  Move    Arrow Keys / Numpad / Vi-keys hjklyubn (Opt-in WASD via Alt+W)
  o / c   Open a door / Close a door
  C-d     Kick a locked door, chest, or monster (also #kick; k moves North!)
  D / u   Disarm / untrap an adjacent trap
  s / .   Search adjacent tiles for secret doors and traps / Wait 1 turn
  < / >   Climb up stairs (or ladder) / Descend down stairs
  ; / /   Survey creatures in immediate view
  E       Engrave floor text (Enter = "Elbereth", - = write in dust, or custom text)
  p       Pray to your alignment's deity (shortcut for #pray)
  C / @   Character sheet     |   \\ / ~   Discovered lore & knowledge
  ? / O   Commands & help     |   S / C-s Save game

EXTENDED COMMANDS (Press #)
  #pray     Pray to your alignment's deity for emergency help or water blessing [p]
  #dip      Dip an item into a potion (e.g., Holy Water) or fountain (Excalibur!) [d]
  #offer    Sacrifice a fresh corpse on an altar for luck, AC, or blessing [o]
  #sit      Sit down on the floor, fountain, or altar [s]
  #rub      Rub a magic lamp or brass lantern to summon a djinni [r]
  #ride     Mount or dismount an adjacent tame steed (pony, horse, unicorn) [m]
  #equip    Open the worn/wielded Equipment screen (same as '[') [q]
  #loot     Open or loot a chest, box, or sack on the floor [l]
  #untrap   Disarm an adjacent trap or trapped chest [u]
  #chat     Talk to your companion or listen to the Oracle's counsel [c]
  #force    Force the lock of a chest using your wielded weapon [f]
  #enhance  Advance weapon and spell school skill levels [e]
  #kick     Kick in a direction (same as Ctrl+D / C-d) [k]`
            },
            {
                name: 'Bestiary_and_Spoilers.txt',
                label: '🐉 NetHack Roles, Artifacts, Wand ID & Ascension Kit Checklist',
                type: 'text',
                content: `==============================================================================
  NETHACK 3.6.7 — ROLES, QUEST ARTIFACTS, WAND ID & ASCENSION KIT
==============================================================================

1. PLAYABLE ROLES & QUEST ARTIFACTS
-----------------------------------
  • Valkyrie (Lawful/Neutral)   -> The Orb of Fate (Half physical & spell damage, levelport!)
  • Wizard (Neutral/Chaotic)    -> The Eye of the Aethiopica (Rapid power regen, magic resistance, branchport!)
  • Samurai (Lawful)            -> The Tsurugi of Muramasa (Bisects targets, +Luck)
  • Priest (Lawful/Neutral/Cha) -> The Mitre of Holiness (Half spell damage, energy boost, undead warning)
  • Rogue (Chaotic)             -> The Master Key of Thievery (Half physical damage, unlocks all doors/chests)
  • Ranger (Neutral/Chaotic)    -> The Longbow of Diana (Generates endless arrows, telepathy)
  • Knight (Lawful)             -> The Magic Mirror of Merlin (Double knight spell damage, Magic Resistance)
  • Barbarian (Neutral/Chaotic) -> The Heart of Ahriman (Stealth, levitation, +damage)
  • Archaeologist (Lawful/Neut) -> The Orb of Detection (Magic resistance, invisibility, telepathy)
  • Monk (Lawful/Neutral/Cha)   -> The Eyes of the Overworld (Astral vision, magic resistance, enlightenment)
  • Tourist (Neutral)           -> The Platinum Yendorian Express Card (Magic resistance, telepathy, free charging!)
  • Caveman (Lawful/Neutral)    -> The Sceptre of Might (Magic resistance, conflict)
  • Healer (Neutral)            -> The Staff of Aesculapius (Doubles HP, regenerates, drains life)

2. WAND ENGRAVING IDENTIFICATION TABLE
--------------------------------------
  First engrave 'Elbereth' in the dust with your fingers ('E' then '-').
  Then zap/engrave ('E') with the unknown wand onto that tile:
  • Vanishes existing engraving -> Wand of Cancellation, Teleportation, or Make Invisible
  • Adds to engraving silently  -> Polymorph, Undead Turning, Opening, Locking, Probing, Nothing
  • "The bugs on the floor slow down / speed up!" -> Wand of Slow Monster / Speed Monster
  • "The bugs on the floor stop moving!"          -> Wand of Sleep
  • "The engraving is burned / frozen / melted"   -> Wand of Fire / Cold / Lightning / Digging
  • "You may wish for an object"                  -> Wand of Wishing!

3. ESSENTIAL ASCENSION KIT CHECKLIST
------------------------------------
  [ ] Magic Resistance (Gray Dragon Scale Mail, Cloak of Magic Resistance, or Quest Artifact)
  [ ] Reflection (Silver Dragon Scale Mail, Shield of Reflection, or Amulet of Reflection)
  [ ] Free Action (Ring of Free Action)
  [ ] Levitation or Flying (Ring of Levitation, Boots of Levitation, or Ride a Dragon/Jabberwock)
  [ ] Speed (Boots of Speed or permanent Fast intrinsic from Wand/Potion of Speed)
  [ ] Conflict Ring (For the Astral Plane crowds)
  [ ] Unicorn Horn (Blessed/Uncursed — instant cure for stat drain, confusion, blindness, illness)
  [ ] 3+ Scrolls of Gold Detection (Read while Confused on the Elemental Planes to locate the Portal!)
  [ ] 2+ Wands of Death & Wands of Teleportation (For Rodney, Pestilence, Famine, and Death)`
            }
        ],
        dcss: [
            {
                name: 'DCSS_Survival_Manual.txt',
                label: '📖 DCSS 0.31 Complete Branch Order, Skilling & God Manual',
                type: 'text',
                content: `==============================================================================
  DUNGEON CRAWL STONE SOUP (DCSS 0.31) — COMPLETE TACTICAL MANUAL
==============================================================================

1. DESIGN PHILOSOPHY & VICTORY CONDITION
----------------------------------------
Dungeon Crawl Stone Soup is built around meaningful tactical choices, zero-grind
auto-explore ('o'), and a deep Pantheon of 25+ Gods. To win a standard game:
  1. Collect at least 3 Runes of Zot from the dungeon sub-branches.
  2. Descend through the Depths (U:1–4) to unlock the Realm of Zot on D:15.
  3. Fight through Zot:1–5, claim the Orb of Zot on Zot:5, and ascend to D:1!
  (Extended veterans can collect up to 15 Runes across Pandemonium, Hell, and Tomb.)

2. RECOMMENDED 3-RUNE BRANCH ORDER
----------------------------------
  Step 1: Dungeon D:1 – D:10 (Locate the Ecumenical Temple on D:4–7 & pick a God!)
  Step 2: Lair of Beasts (Lair:1 – Lair:5)
  Step 3: Orcish Mines (Orc:1 – Orc:2, shop in Orc:2!)
  Step 4: Dungeon D:11 – D:15
  Step 5: First Lair S-Branch (Snake Pit, Shoals, Swamp, or Spider Nest) Floors 1–4 -> Rune #1!
  Step 6: Second Lair S-Branch Floors 1–4 -> Rune #2!
  Step 7: Vaults:1 – Vaults:4 (Do NOT enter Vaults:5 yet!)
  Step 8: Elven Halls (Elf:1–2, optional Elf:3 if Will+++)
  Step 9: Depths:1 – Depths:4
  Step 10: Vaults:5, Slime Pits:5, or Abyss:3 -> Rune #3!
  Step 11: Realm of Zot (Zot:1 – Zot:5) -> Grab the Orb of Zot & Escape!

3. SKILL TRAINING RULES (Press 'm')
-----------------------------------
  • Rule #1: Train OFFENSE first until your primary weapon reaches Mindelay
    (or your primary attack spells reach < 5% fail rate).
    Common Weapon Mindelays:
      - Hand Axe: 10  | War Axe: 14  | Broad Axe: 18 | Executioner's Axe: 26
      - Short Sword: 10 | Rapier: 14 | Long Sword: 14 | Double Sword / Demon Blade: 14
      - Mace: 12 | MorningStar: 16 | Eveningstar: 16 | Great Mace: 20
      - Spear: 10 | Trident: 12 | Demon Trident: 14 | Bardiche: 26
  • Rule #2: Once Offense is online, train Fighting (HP!), Armour, Dodging, and Shields.
  • Rule #3: If your God uses Invocations (Okawaru, Makhleb, Qazlal, Zin, TSO),
    train Invocations to 8–12 so divine powers succeed reliably.

4. TOP GODS & WHEN TO USE DIVINE POWERS (Press 'a')
---------------------------------------------------
  • Trog: Grants Berserk, Trog's Hand (Regen + Will++), and Brothers in Arms
    (summons Berserker allies). Gifts enchanted weapons! Forbids spellcasting.
  • Okawaru: Grants Heroism (+5 to all martial skills!) and Finesse (doubles attack speed!).
    Use Heroism at the start of EVERY non-trivial fight!
  • Vehumet: Supports Conjurations & destructive magic—extends spell range, reduces
    MP cost on kills, and gifts offensive spells.
  • Gozag: Turns monster corpses into Gold! Use Potion Petition (instant multi-potion
    heal/buff) and Bribe Branch (turns half of Zot:5 onto your side!).
  • Ashenzari: Binds cursed equipment to grant massive skill boosts and Astral Sight
    (see monsters through walls!).`
            },
            {
                name: 'DCSS_Commands.txt',
                label: '⌨️ DCSS Keybindings, Auto-Explore & Quiver Reference',
                type: 'text',
                content: `==============================================================================
  DUNGEON CRAWL STONE SOUP — KEYBINDINGS & COMMAND REFERENCE
==============================================================================

EXPLORATION & COMBAT
  Move      Arrow Keys / Numpad / Vi-keys hjklyubn (Opt-in WASD via Alt+W)
  o         Auto-explore current floor (stops on monsters, stairs, altars, items)
  Tab       Auto-fight nearest threat with wielded weapon
  5 or .    Rest / wait 1 turn (also Space)
  < / >     Ascend up staircase / Descend down staircase (> on Altar also prays)
  O / c     Open closed door / Close adjacent door
  g or ,    Pick up item(s) at your feet
  s         Search adjacent tiles for hidden doors & traps
  p         Pray at Temple Altar / Interact with fountain or companion
  x / ;     Survey visible monsters and branch floor
  v         Examine / inspect an inventory item (0 turns)
  C / @ / % Character overview sheet  |  \\ / ~ Knowledge  |  ? Help

MAGIC, GODS & SKILLS
  m         Open Skill Training focus ([a-d/1-4] Fighting/Dodging/Evocations/Invocations, M spells)
  a         Invoke God Divine Power ([1/Enter]) or Activate item ([a-z])
  z / Z     Cast spell ([1-4/a-d]) or innate species/avatar power
  M / I     Open Spell Library & Memorized Spells (or inspect item with I when no spells)
  ^         View your worshipped God's tenets, Piety rank, and abilities
  A         View Mutations, Innate Species Traits, and Resistances

INVENTORY & EQUIPMENT
  i         Open Inventory
  E / [     Open worn/wielded Equipment (/ or | toggles Inventory <-> Equipment)
  e         Eat a food ration
  w         Wield a weapon or equip shield (' swaps weapons)
  W / T     Wear armor / Take off armor
  P / R     Put on ring or amulet / Remove ring or amulet
  q / r     Quaff a potion / Read a scroll
  f / t     Fire quivered ranged attack / Throw item
  V         Evoke a wand or miscellaneous magical device
  d         Drop item(s)`
            },
            {
                name: 'DCSS_Bestiary_and_Items.txt',
                label: '👹 DCSS Bestiary, Roles, Pantheon & Items Encyclopedia',
                type: 'text',
                content: buildCartridgeBestiaryAndItems(dcssSpec, 'Dungeon Crawl Stone Soup 0.31')
            }
        ],
        brogue: [
            {
                name: 'Brogue_Survival_Manual.txt',
                label: '📖 Brogue CE 1.13 Complete Mechanics, Staves & Lumenstone Guide',
                type: 'text',
                content: `==============================================================================
  BROGUE COMMUNITY EDITION 1.13 — COMPLETE SURVIVAL & LUMENSTONE MANUAL
==============================================================================

1. ZERO-GRIND PROGRESSION: NO XP LEVELS, NO CLASSES
---------------------------------------------------
In Brogue, killing monsters grants 0 XP. Why? Because Brogue is a game of
stealth, improvisation, and resource allocation rather than grinding!
Your hero grows stronger through three pillars:
  1. Potions of Strength (+1 Strength each): Reduces the Strength requirement
     penalty on heavy weapons and armor.
  2. Potions of Life (+25% Max HP each): Permanently raises max HP, heals to
     full, and cures poison/weakness.
  3. Scrolls of Enchantment: Adds +1 to ANY weapon, armor, ring, staff, or charm—
     AND lowers a weapon/armor's Strength requirement by 1!

2. INTERACTIVE KEY VAULTS & FREE ITEM SWAPPING
----------------------------------------------
Throughout the dungeon, you will find Key Vaults containing 3–6 cages.
  • Taking an item from one cage closes the other cages.
  • HOWEVER: You can carry that vault item for 1–3 floors until it auto-identifies
    (revealing its exact +enchantment and whether it is Runic), then WALK BACK UP
    and place the item back into its cage to reopen the vault and pick a different item!

3. ENVIRONMENTAL PHYSICS: GAS, FIRE, WATER & CHASMS
---------------------------------------------------
  • Swamp Gas: Vents when stepping on pressure plates. Shooting a Staff of Firebolt
    or throwing an Incendiary Dart into Swamp Gas triggers a massive fiery explosion!
  • Caustic / Paralytic / Confusion Gas: Throw harmful potions (with 't', never 'q'!)
    into monster packs—never drink unknown harmful potions next to enemies!
  • Deep Water & Eels: Never fight Eels while standing in deep water. Lure them onto
    shallow water or dry land where their defense drops plummet.
  • Chasms & Lava: Use a Staff of Entrancement or Force weapon to walk/knock
    Tentacle Horrors and Golems straight into Lava!

4. SAFE IDENTIFICATION PROTOCOL (Around Depth 3–4)
--------------------------------------------------
  When your inventory fills up on D:3 or D:4:
  1. Clear the floor of monsters.
  2. Stand next to water (to douse Creeping Fire) and away from items on the ground
     (so a Potion of Incineration doesn't burn scrolls).
  3. Drink stacks of 2+ Potions first (Strength, Life, and Detect Magic are common!).
     If you drink Detect Magic, every item in your pack immediately reveals whether
     it is benevolent (blue/good) or malevolent (red/cursed)!

5. LUMENSTONE MASTERY (DEPTHS 27–40)
------------------------------------
  • Depth 26 holds the Amulet of Yendor. Picking it up spawns the invincible
    Warden of Yendor and allows you to ascend to Depth 1 for a Standard Victory.
  • Depths 26–40 also contain 25 Lumenstones (+5,000 points each). Every Lumenstone
    carried shrinks your vision radius by -1 unless countered by a highly enchanted
    Ring of Clairvoyance or Potions of Telepathy.`
            },
            {
                name: 'Brogue_Commands_and_Bestiary.txt',
                label: '👹 Brogue Commands, Allies, Monsters & Items Reference',
                type: 'text',
                content: `==============================================================================
  BROGUE CE 1.13 — KEYBINDINGS & COMPLETE CAVERN BESTIARY
==============================================================================

KEYBINDINGS
  Move      Arrow Keys / Numpad / Vi-keys hjklyubn (Opt-in WASD via Alt+W)
  e         Auto-explore current cavern depth
  z / 5 / . Rest / wait 1 turn (Space also waits 1 turn)
  i         Open Inventory
  [         View worn/wielded Equipment (/ or | toggles Inventory <-> Equipment)
  E         Eat a food ration or mango
  a         Apply (use/zap/activate) any staff, wand, or charm
  q / r     Quaff potion / Read scroll
  w / W / P Equip weapon, armor, or ring  |  T / R   Take off / Remove equipped gear
  t / f     Throw item or harmful potion / Fire dart
  o / c     Open door / Close door       |  , / g  Pick up item  |  d  Drop item
  s         Search adjacent tiles for hidden traps & secret doors
  x / :     Examine inventory item       |  ;      Survey visible monsters
  D         Open Discoveries table (all identified potions, scrolls, rings)
  > / <     Descend stairs / Ascend stairs
  C / @     Character overview sheet     |  ?      Commands & help

` + buildCartridgeBestiaryAndItems(brogueSpec, 'Brogue CE 1.13')
            }
        ],
        rogue: [
            {
                name: 'Rogue_1980_Manual.txt',
                label: '📖 A Guide to the Dungeons of Doom (Classic 1980 Rogue 5.4 Manual)',
                type: 'text',
                content: `==============================================================================
  CLASSIC ROGUE 5.4.4 (1980) — A GUIDE TO THE DUNGEONS OF DOOM
==============================================================================

1. THE ORIGINAL 1980 CLASSIC
----------------------------
You have descended into the Dungeons of Doom in search of the legendary
Amulet of Yendor, hidden on or below Level 26. Unlike modern roguelikes with
town hubs, in Classic Rogue you can NEVER climb back up a staircase ('<')
until the Amulet of Yendor is in your possession!

2. THE FOUR GOLDEN RULES OF ROGUE 5.4
-------------------------------------
  1. Respect the Food Clock: You start with 1 Food Ration. Do not waste turns
     wandering cleared rooms. Take off rings ('R') while walking between fights
     (almost all rings increase food consumption by 50–100%, except the coveted
     Ring of Slow Digestion!).
  2. Dead-End Corridors = Secret Doors: If a corridor ends abruptly in a blank
     wall, walk to the end and press 's' (Search) 3 to 5 times! Secret doors in
     Rogue frequently require multiple searches to reveal.
  3. Beware the Aquator ('A' — Levels 9–18): Aquators deal 0 HP damage, but every
     hit permanently rusts metallic armor by -1 AC! Either take off your armor ('T')
     before fighting an Aquator, wear Leather Armor (immune to rust), wear a Ring
     of Maintain Armor, or read a Scroll of Protect Armor on your best suit.
  4. The Scroll of Scare Monster Trick: NEVER read ('r') a Scroll of Scare Monster!
     Instead, DROP ('d') the Scroll of Scare Monster onto the floor and stand on
     top of it. No monster in the dungeon—not even a Dragon or Jabberwock—can
     attack you while you stand on a Scroll of Scare Monster! (Note: if you pick
     it back up a second time, it crumbles to dust.)

3. KEYBINDINGS
--------------
  Arrow Keys / Numpad / hjklyubn   Move or attack (Opt-in WASD via Alt+W)
  s                              Search adjacent walls for secret doors & traps
  . / 5 / Space                  Rest 1 turn
  >                              Descend staircase to the next level
  <                              Ascend staircase (ONLY works once you hold the Amulet of Yendor!)
  , or g                         Pick up item or gold at your feet
  o / c                          Open door / Close door
  i                              List inventory
  E / ] (or =)                   List worn/wielded Equipment (/ or i returns to Inventory)
  e                              Eat Food Ration or slime-mold
  q                              Quaff a potion
  r                              Read a scroll
  w                              Wield a weapon
  W / T                          Wear armor / Take off armor
  P / R                          Put on ring / Remove ring
  z                              Zap a wand or staff in a direction
  t / f                          Throw arrow (with Short Bow wielded!), dagger, or dart
  d                              Drop item on the floor
  I / :                          Examine an inventory item (; surveys visible monsters)
  D                              List all discovered/identified Potions, Scrolls, Rings, and Staves
  ^                              Identify an adjacent trap
  C / @                          Character sheet   |   ?   Help & commands`
            },
            {
                name: 'Rogue_AZ_Bestiary.txt',
                label: '🐉 Classic Rogue 5.4 Complete A–Z Monster & Item Reference',
                type: 'text',
                content: buildCartridgeBestiaryAndItems(rogueSpec, 'Classic Rogue 5.4.4 (1980)')
            }
        ],
        silq: [
            {
                name: 'SilQ_Combat_Stealth_and_Forging.txt',
                label: '⚔️ Sil-Q 1.5 Combat Math, Stealth, Songs & Anvil Forging Guide',
                type: 'text',
                content: `==============================================================================
  SIL-Q 1.5.0 — THE FORTRESS OF ANGBAND (FIRST AGE SURVIVAL GUIDE)
==============================================================================

1. THE QUEST FOR THE SILMARILS (50 FT TO 1,000 FT)
--------------------------------------------------
Set in the First Age of Middle-earth, you infiltrate Morgoth's subterranean
fortress of Angband. There is NO Town and NO shopkeepers. You descend 20 dense,
tactical floors (50 ft to 1,000 ft), infiltrate Morgoth's Throne Room at 1,000 ft,
prise at least one Silmaril from his Iron Crown using an edged blade, and escape
all the way back to the Gates of Angband (0 ft).

2. TRANSPARENT OPPOSED COMBAT ROLLS
-----------------------------------
  • Accuracy vs Evasion: Every attack rolls (1d20 + Melee) vs (1d20 + Evasion).
  • Critical Hits (Weight Matters!): For every N points by which your attack roll
    beats the defender's Evasion roll, your weapon gains +1 bonus damage die!
    - Light Daggers (1.0 lb): +1 die per 7 points (up to +1 die max unless Finesse).
    - Longswords (3.0 lb):    +1 die per 9 points.
    - Bastard Swords (2-H):   +1 die per 8 points.
    - Greatswords (2-H):      +1 die per 7 points!
  • Armor Protection [XdY]: Armor absorbs damage via dice (e.g., Mail Corslet [2d4])
    at the cost of small Evasion and Stealth penalties.

3. THE EIGHT SKILL TREES & ABILITIES (Press Tab for Skills, @ for Sheet)
---------------------------------------------------------------------------
  Spend XP directly at any time to raise skills and buy active/passive Abilities:
  • Melee:      Finesse, Power, Polearm Mastery, Charge, Follow-Through, Whirlwind, Rapid Attack
  • Archery:    Precision, Point Blank, Versatile, Flaming Arrows, Crippling Shot
  • Evasion:    Dodging, Parry, Flanking, Crowd Fighting, Riposte, Controlled Retreat, Sprint
  • Stealth:    Disguise, Assassination, Cruel Blow, Exchange Places, Vanish
  • Perception: Quick Study, Focused Attack, Keen Senses, Listen (hear monsters through walls!), Master Hunter
  • Will:       Channeling, Mind Over Body, Inner Light, Clarity, Hardiness, Majesty
  • Smithing:   Weaponsmith, Armoursmith, Jewellery, Enchantment, Artifice, Masterpiece
  • Song:       Song of Elbereth, Slaying, Silence, Aule, Staying, Lorien, Este, Mastery

4. ANVIL FORGING (Press '0' while standing on a Forge)
------------------------------------------------------
  Glowing Forges spawn throughout the upper and middle depths. Stand on a Forge
  and press '0' to craft custom weapons, mail, shields, rings, or amulets with
  chosen slays (Orcs, Trolls, Rauko, Dragons, Spiders), resistances, or stat bonuses.

5. ESSENTIAL SIL-Q KEYBINDINGS
------------------------------
  • Move:    Arrow Keys / Numpad / Vi-keys hjklyubn (Opt-in WASD via Alt+W)
  • Combat:  f Fire bow  |  t Throw  |  X Exchange weapons  |  s Sing Song
  • Items:   i Inventory |  e Equipment |  w Wield/Wear  |  r Remove  |  d Drop  |  k Destroy
  • Consum.: q Quaff potion |  a Activate staff |  E Eat food |  u Use item |  p Sound horn
  • Dungeon: g Get item |  o/c/b/D Open/Close/Bash/Disarm |  S Stealth |  % / Z Rest |  z Hold
  • Info:    Tab Skills & Abilities |  0 Anvil Forging |  @ Sheet |  ~ Lore |  x Examine |  m Menu`
            }
        ],
        angband: [
            {
                name: 'Angband_Quick_Survival_Checklist.txt',
                label: '🛡️ Angband 4.2.6 Depth-by-Depth Resistance & Boss Checklist',
                type: 'text',
                content: `==============================================================================
  VANILLA ANGBAND 4.2.6 — DEPTH-BY-DEPTH SURVIVAL & BOSS CHECKLIST
==============================================================================

1. DEPTH MILESTONES & MANDATORY RESISTANCES
-------------------------------------------
  • DL 1 – 15 (50 ft – 750 ft):
    - Buy Scrolls of Phase Door, Word of Recall, and Potions of Cure Serious Wounds.
    - Acquire See Invisible and Ranged/Device damage for jellies and eyes.
  • DL 16 – 25 (800 ft – 1,250 ft):
    - MANDATORY: Free Action (prevents fatal paralysis from Carrion Crawlers & Ghouls!).
    - MANDATORY: Resist Blindness or Potions of Cure Critical Wounds (cures blindness & confusion).
  • DL 26 – 40 (1,300 ft – 2,000 ft):
    - MANDATORY: All 4 Base Resistances (Acid, Electricity, Fire, Cold).
    - Farm Stat Potions (Strength, Constitution, Dexterity, Intelligence/Wisdom) until maxed!
  • DL 41 – 60 (2,050 ft – 3,000 ft):
    - MANDATORY: Resist Poison (Ancient Multi-Hued Dragons breathe Poison for up to 800 dmg!),
      Resist Confusion, Resist Chaos, and Permanent Speed (+10 or higher).
  • DL 61 – 98 (3,050 ft – 4,900 ft):
    - MANDATORY: Speed +20 to +30, 600–900+ Max HP, Resist Nether/Nexus/Disenchantment,
      Rods of Teleport Other, Potions of Healing / *Healing*, and Scrolls of Banishment.
  • DL 99 (4,950 ft) — SAURON, THE SORCERER:
    - Fight in an anti-summoning corridor or destruction-cleared pillar; watch for Mana Bolt
      and Summon Ringwraiths/Hi-Dragons.
  • DL 100 (5,000 ft) — MORGOTH, LORD OF DARKNESS:
    - 20,000 HP, Speed +30, shatters walls with Earthquakes, summons Unique Monsters,
      and casts Mana Storm (up to 550 unresistable damage!). Stock 15+ Healing/*Healing*/Life
      potions, Phase Door, Teleportation, and Mass Banishment.`
            }
        ],
        ryod: [
            {
                name: 'RYOD_Overview_and_Biomes.txt',
                label: '🌍 RYOD Chapter 1: Realms Overview, 7 Biomes, Scaling & Shrines',
                type: 'text',
                content: `==============================================================================
  REGIONS OF YENDOR: DUNGEONS (RYOD) — OVERVIEW, BIOMES & SHRINES
==============================================================================

1. SANDBOX ARCHITECTURE & DETERMINISTIC BLUEPRINTS (RYOD-XXXXXXXX)
--------------------------------------------------------------------
Regions of Yendor: Dungeons (RYOD) is YASD 3D's procedural roguelike sandbox.
Every run compiles into a deterministic RYOD-XXXXXXXX config hash and shareable
blueprint combining Biome, Map Layout, Goal Depth, Victory Rule, Story Arc,
Hero Origin (or Creature Avatar), Power Discipline, and up to 3 Mutators.

2. THE SEVEN BIOMES
-------------------
  • obsidian        Obsidian Stronghold (Iron & Torchlight)
                    Defaults: angband audio | warbands bestiary | shattered_covenant story
  • bioluminescent  Bioluminescent Underdark (Glowing Flora & Chasms)
                    Defaults: caverns layout | brogue audio | beasts_wyrms | spore_choir
  • catacombs       Ecumenical Marble Sanctum (Crypts, Altars & Fountains)
                    Defaults: nethack audio | necropolis bestiary | ossuary_crown story
  • shadow_keep     Eastern Shadow Keep (Crimson Timber & Mist)
                    Defaults: hengband audio | eastern_oni bestiary | crown_of_cinders story
  • chaos_rift      Abyssal Chaos Rift (Arcane Crystal & Void)
                    Defaults: frogcomposband audio | constructs bestiary | clockwork_abyss
  • frozen_wastes   Frozen Iron Wastes (Glacial Vaults & Frost)
                    Defaults: silq audio | shadow_host bestiary | iron_crown_song story
  • gilded_treasury Sunken Golden Treasury (Gilded Halls & Traps)
                    Defaults: rogue audio | dungeons_of_doom bestiary | sovereign_heist

3. MAP LAYOUTS, GOAL DEPTH & PROCEDURAL SCALING
-----------------------------------------------
  • 4 Map Layouts:   classic (Bastion Rooms), caverns (Winding Caverns),
                     labyrinth (Dense Minotaur Corridors), arena (Grand Vaults)
  • Goal Depth:      Configurable from 5 to 30 floors (default 15, or 8 with Boss Rush).
  • 5-Act Pacing:    Act I (Start), Act II (~25% depth), Act III (~50%),
                     Act IV (~75%), and Act V Sovereign Nemesis Boss on goalDepth.
  • Victory Modes:   boss_kill (Slay Nemesis), ascension (Surface escape),
                     three_runes (Claim 3 Runes), or relic_ascent (Artifact heist).
  • Difficulty:      story (gentle scaling), standard, or nightmare (+enemy dmg/HP).
  • Progression:     xp (Leveling), brogue_item (Enchantment/Strength), or hybrid.
  • d20 Fate Roll:   Rolls 1–20 (default 15): 1 = Grim Dare, 15–19 = Explorer Cache,
                     20 = Nat 20 Boon & blessed ring.

4. SANCTUARY TOWN, SHRINES, ALTARS & VAULTS
-------------------------------------------
  • Depth 0 Town:    Optional Sanctuary Hub with Temple Altar (_), Fountain ({),
                     Town Elder (t), Sanctuary Quartermaster (p), and Down Stair (>).
  • Pantheon Altars: Altars (_) channel 6 deities: Trog, Okawaru, Sif Muna,
                     Yredelemnul, Vehumet, and Xom. Press 'p' or Enter on an altar
                     to sanctify worn gear, restore HP/Power, lift curses, and gain
                     Piety (up to 6). Invoke your deity later via 'm' -> '6'!
  • Fountains ({):   Stand on a fountain and press 'p', 'q', or Enter to heal +20 HP.
  • Micro-Vaults:    Procedural rooms stamp Mithril Forges ('0' Anvil), Caged Allies,
                     Pantheon Shrines, Caustic Crucibles, Runic Vaults, and Wyrm Hoards.`
            },
            {
                name: 'RYOD_Origins_and_Avatars.txt',
                label: '🧬 RYOD Chapter 2: Hero Origins, Beholder 6-Ring & Creature Avatars',
                type: 'text',
                content: `==============================================================================
  REGIONS OF YENDOR: DUNGEONS (RYOD) — HERO ORIGINS & MONSTER AVATARS
==============================================================================

1. MORTAL CLASS ORIGINS (HP / PW / AC | STR/INT/WIS/DEX/CON | STARTING KIT)
--------------------------------------------------------------------------
  • Sovereign Warrior (warrior)     — Discipline: martial (KI)
    40 HP / 10 PW / 5 AC | 17/10/11/14/16 | long sword, chain mail,
    potion of berserk strength | Innate: Shield Bash Surge
  • Shieldmaiden Valkyrie (valkyrie) — Discipline: songs (VOICE)
    38 HP / 14 PW / 6 AC | 16/12/15/15/16 | war spear, scale mail,
    potion of curing | Innate: Valkyrie Spear-Leap
  • Ronin Samurai (samurai)         — Discipline: martial (KI)
    36 HP / 16 PW / 5 AC | 16/12/13/16/15 | katana, splint mail,
    scroll of enchant weapon | Innate: Tsubame Gaeshi (Swallow Cut)
  • Arch-Mage Evoker (mage)         — Discipline: arcane (MANA)
    26 HP / 28 PW / 2 AC | 10/18/15/14/12 | quarterstaff, robe of the magi,
    wand of fireballs [6/6] | Innate: Aether Nova
  • Deepwood Ranger (ranger)        — Discipline: songs (VOICE)
    32 HP / 16 PW / 4 AC | 14/14/14/18/14 | long bow, studded leather,
    rod of lightning bolts [5/5] | Innate: Heartseeker Volley
  • Shadowblade Rogue (rogue)       — Discipline: arcane (MANA)
    30 HP / 18 PW / 4 AC | 13/15/11/18/14 | assassin dagger, shadow cloak,
    scroll of teleportation | Innate: Shadowstep Backstab
  • Templar High Priest (priest)    — Discipline: piety (PIETY)
    34 HP / 24 PW / 5 AC | 14/13/18/12/15 | blessed warhammer, hauberk of light,
    potion of extra healing | Innate: Sanctified Judgment

2. PLAYABLE MONSTER AVATARS & SIGNATURE TRAITS
----------------------------------------------
  • Eldritch Beholder Eye (beholder) — Discipline: arcane (MANA)
    34 HP / 30 PW / 7 AC | 12/19/17/15/15 | central antimagic lens,
    wand of disintegration [5/5] | Innate: Disintegration Ray
    SPECIAL RULES: ringSlots = 6 (wear up to 6 rings!), allowBodyArmor = false
    (cannot wear torso armor, cloaks, helms, shields, gloves, or boots),
    intrinsic levitation over chasms, and directional Gaze Ray via 't'/'f' or 'm'->'5'.
  • Red Dragon Wyrmling (red_dragon) — Discipline: arcane (MANA)
    48 HP / 20 PW / 8 AC | 19/14/13/13/18 | draconic talons, crimson dragonscales,
    potion of fire essence | Innate: Searing Dragon Breath
    SPECIAL RULES: Intrinsic levitation; evolves Wyrmling -> Young -> Adult -> Ancient Wyrm.
  • Vampire Scion (vampire_scion)   — Discipline: piety (PIETY)
    36 HP / 22 PW / 6 AC | 16/16/14/17/15 | crimson rapier, noble dusk-mantle,
    vial of vitae | Innate: Vampiric Life-Drain (+ Bat-Step Shadow Blink)
    SPECIAL RULES: 25% innate melee damage leeched as HP.
  • Iron Golem Juggernaut (iron_golem) — Discipline: martial (KI)
    56 HP / 12 PW / 11 AC | 20/10/10/10/20 | forged iron fists, riveted dwarf-iron
    chassis, scroll of enchanting | Innate: Seismic Ground Slam
  • Arch-Lich Initiate (arch_lich)  — Discipline: arcane (MANA)
    30 HP / 34 PW / 5 AC | 11/20/18/14/14 | skull-crowned scepter, phylactery
    vestments, staff of cold bolts [6/6] | Innate: Abyssal Soul-Chill
    SPECIAL RULES: 50% Phylactery damage absorption into Mana.
  • Minotaur Berserker (minotaur)   — Discipline: martial (KI)
    46 HP / 12 PW / 6 AC | 19/9/10/15/18 | double-bitted battle axe, bronze
    labyrinth harness, potion of berserk strength | Innate: Labyrinth Gore Charge

3. FIVE POWER DISCIPLINES (Selectable or Auto-Matched)
------------------------------------------------------
  arcane (MANA) | songs (VOICE) | piety (PIETY) | martial (KI) | blood_shadow (VITAE)`
            },
            {
                name: 'RYOD_Mutators_and_Daily_Blitz.txt',
                label: '🎲 RYOD Chapter 3: Stackable Mutators (0–3) & Daily Blitz UTC Seed',
                type: 'text',
                content: `==============================================================================
  REGIONS OF YENDOR: DUNGEONS (RYOD) — MUTATORS & DAILY BLITZ
==============================================================================

1. STACKABLE WORLD MUTATORS (0 TO 3 ACTIVE PER RUN)
---------------------------------------------------
When customizing a RYOD run, you may stack up to 3 mutators simultaneously
(selecting balanced clears active mutators to 0):

  • balanced        Classic Balanced Rules: authentic tactical pacing & standard LOS.
  • blood_moon      Blood-Moon Frenzy: +35% combat damage; every kill restores +4 HP & +1 PW.
  • midas_vaults    Midas Vaults & Mimics: double floor treasure, extra enchanting scrolls,
                    and guarded Golden Vaults.
  • stygian_fog     Stygian Darkness: 4-tile lantern radius, +30% ambush attack damage.
  • packmaster      Packmaster Crusade: start with 2 loyal pets; rescued Chained Allies
                    gain +40% HP and damage.
  • chaos_surge     Wild Chaos Surge: casting '[m]' powers or reading scrolls unleashes
                    bonus Chaos Surges (speed boost + +6 bonus damage on even turns).
  • cataclysm       Cataclysmic Tremors: forces abundant magma/water hazards; periodic
                    tremors shake loose gold and scrolls.
  • god_sandbox     Immortal God-Sandbox: 999 HP/MP, +9 gear, 0 power cost, and press
                    'G' anytime to warp directly to the next floor.
  • loot_pinata     Loot Pinata: slain enemies have a 35% chance to burst with bonus gold
                    & drops, plus extra treasure caches spawned on dungeon floors.
  • boss_rush       Boss Rush Blitz: compacts default goal depth to 8 floors and spawns
                    elite Floor Champions with bonus relic drops on non-milestone depths.
  • vampire_thirst  Vampire Thirst: disables passive resting HP regeneration (on '.', '5',
                    Space, or resting), while melee attacks leech 30% of damage dealt as HP.
  • floor_collapse  Crumbling Depths: tracks turns spent on the current floor (floorTurns).
                    At 90 floorTurns stone groans in warning; at 120+ floorTurns, every
                    10 turns deals -4 HP falling masonry damage (ignored in God Mode).

2. DAILY BLITZ — DETERMINISTIC GLOBAL UTC CHALLENGE
---------------------------------------------------
Every UTC calendar day (YYYY-MM-DD) generates one shared Daily Blitz dungeon for
all players via rollDailyBlitzBlueprint():
  • Seed Derivation: Hashes "DAILY_BLITZ:YYYY-MM-DD" using 32-bit FNV-1a
                     (0x811c9dc5 / prime 0x01000193) and xorshift32 PRNG.
  • Mutator Pool:    Deterministically selects 1 or 2 mutators from all WORLD_MUTATORS
                     except 'balanced' and 'god_sandbox'.
  • Fixed Blitz Spec:
      - Progression: hybrid | Difficulty: standard | Victory: boss_kill
      - Goal Depth:  8 floors when 'boss_rush' is rolled, otherwise 10 floors
      - Shared Biome, Map Layout, Hero Origin/Avatar, Companion Pet, and RYOD Hash.`
            },
            {
                name: 'RYOD_Commands_and_Forging.txt',
                label: '⌨️ RYOD Chapter 4: Commands, Anvil Forging (0/y), Powers (m) & Swap (x)',
                type: 'text',
                content: `==============================================================================
  REGIONS OF YENDOR: DUNGEONS (RYOD) — COMMANDS & ANVIL FORGING
==============================================================================

1. ANVIL FORGING (Press '0', 'y', Enter, or 'p' next to a Mithril Anvil)
------------------------------------------------------------------------
Glowing Mithril Anvils ('0') spawn in Mithril Forge micro-vaults and sanctums.
Stand ON or ADJACENT (within 1 tile) to an Anvil and press:
  • '0'     Direct Forging hotkey (Sil-Q parity)
  • 'y'     ActionCatalog 'smith' command binding
  • Enter / 'p' Contextual interaction when adjacent to an Anvil ('0')
Forging tempers your currently equipped weapon or body armor for +2 enchantment
and permanently imbues an aspect brand ('of Flame', 'of Frost', 'of Sharpness',
'of Protection', or 'of Speed').

2. SKILLS, SONGS, STANCES & AVATAR POWERS (Press 'm')
-----------------------------------------------------
Press 'm' to open the Abilities & Magic prompt:
  • [1–4] or [a–d]  Invoke Discipline Powers — or toggle Woven Songs (sharpness,
                    silence, staying, slaying) / Martial Stances (genbu, byakko,
                    seiryu, suzaku) when enabled!
  • [5]             Unleash Hero / Monster Avatar Innate Power (e.g., Dragon Breath,
                    Beholder Disintegration Ray, Lich Soul-Chill, Vampire Life-Drain,
                    Iron Golem Ground Slam, Minotaur Gore Charge)
  • [6]             Invoke Pantheon Deity Power (requires Piety >= 1 from Altars)
  • [0]             Relax active Martial Stance / end Woven Song
  • [i] / [z]       Switch to item activation prompt | [M] Open Spell Library

3. WEAPON SWAP & COMPLETE RYOD KEY REFERENCE
--------------------------------------------
  • Movement:     Arrow Keys / Numpad / Vi-keys hjklyubn (Opt-in WASD via Alt+W)
  • Weapon Swap:  x (or ') Cycles between wielded weapon and secondary weapons/bows
                  (If only one weapon is carried, 'x' surveys visible monsters!)
  • Items & Gear: i Inventory | e Equipment (/ or | toggles Inven <-> Equip)
                  E Eat food  | q Quaff potion/fountain | r Read scroll | d Drop
                  w / W / P   Wield weapon / Wear armor / Put on ring or amulet
                  T / R       Take off / Remove gear | I / : Examine | { / } Inscribe
  • Combat/Magic: a Activate item | t / f Throw or Fire (Beholder: directional Gaze!)
                  m Powers/Songs/Stances | M / b Spell Library
  • Dungeon:      p / Enter Interact (Altar, Fountain, adjacent Anvil/Cage, Pet)
                  o / O Open door | c Close door | D Disarm trap | g / , Pick up
                  s Search | . / 5 / Space Rest/Wait 1 turn | < / > Stairs | ; Survey
  • System:       C / @ / % Character Sheet | ~ / \\ Knowledge | ? Help | G God Warp`
            }
        ]
    };
    return map[realm] || [];
}

function listHelpFiles(realm) {
    const r = String(realm || 'angband').toLowerCase();
    const results = [];
    const seen = new Set();

    // 1. Virtual structured help chapters first (always fast & available)
    const virtuals = getVirtualHelpFiles(r);
    for (const vf of virtuals) {
        seen.add(vf.name);
        results.push({
            name: vf.name,
            label: vf.label || vf.name,
            type: vf.type || 'text',
            virtual: true
        });
    }

    // 2. On-disk upstream help files
    const dirGetter = REALM_DIRS[r];
    const dirs = dirGetter ? dirGetter() : [];
    for (const d of dirs) {
        try {
            const entries = fs.readdirSync(d, { withFileTypes: true });
            entries.sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                if (!entry.isFile()) continue;
                const fname = entry.name;
                if (seen.has(fname)) continue;
                const ext = path.extname(fname).toLowerCase();
                if (!['.txt', '.rst', '.md', '.hlp', '.pdf', '.html'].includes(ext)) continue;
                if (fname.endsWith('_contents.txt') || fname === 'Makefile' || fname === 'Makefile.am' || fname === 'index.rst' || fname === 'copying.rst' || fname === 'copying.txt') continue;
                seen.add(fname);
                results.push({
                    name: fname,
                    label: FILE_LABELS[fname] || `📄 ${fname}`,
                    type: ext === '.pdf' ? 'pdf' : (ext === '.html' ? 'html' : 'text'),
                    virtual: false
                });
            }
        } catch (_) {}
    }

    const PRIORITY_ORDER = [
        'Guidebook.txt', 'Commands.txt', 'Bestiary_and_Spoilers.txt',
        'DCSS_Survival_Manual.txt', 'DCSS_Commands.txt', 'DCSS_Bestiary_and_Items.txt',
        'Brogue_Survival_Manual.txt', 'Brogue_Commands_and_Bestiary.txt',
        'Rogue_1980_Manual.txt', 'Rogue_AZ_Bestiary.txt',
        'SilQ_Combat_Stealth_and_Forging.txt', 'Angband_Quick_Survival_Checklist.txt',
        'RYOD_Overview_and_Biomes.txt', 'RYOD_Origins_and_Avatars.txt',
        'RYOD_Mutators_and_Daily_Blitz.txt', 'RYOD_Commands_and_Forging.txt',
        'guide.rst', 'general.txt', 'command.rst', 'command.txt', 'commdesc.txt',
        'birth.rst', 'birth.txt', 'raceclas.txt', 'Classes.txt', 'MonsterRaces.txt',
        'Personalities.txt', 'dungeon.rst', 'dungeon.txt', 'town.txt', 'attack.rst',
        'attack.txt', 'defend.txt', 'magic.txt', 'objects.txt', 'monster.txt',
        'Sil-Q 1.4.2 Manual.pdf', 'CHANGELOG.md',
        'jgeneral.txt', 'jcommand.txt', 'jraceclas.txt', 'jdungeon.txt', 'jmagic.txt'
    ];

    results.sort((a, b) => {
        const idxA = PRIORITY_ORDER.indexOf(a.name);
        const idxB = PRIORITY_ORDER.indexOf(b.name);
        if (idxA !== -1 || idxB !== -1) {
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        }
        if (a.virtual !== b.virtual) return a.virtual ? -1 : 1;
        const aCurated = Boolean(FILE_LABELS[a.name]);
        const bCurated = Boolean(FILE_LABELS[b.name]);
        if (aCurated !== bCurated) return aCurated ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return results;
}

function readHelpFile(realm, fileName) {
    const r = String(realm || 'angband').toLowerCase();
    const cleanName = path.basename(String(fileName || ''));
    if (!cleanName || cleanName !== fileName || cleanName.includes('..')) {
        return null;
    }

    // Check virtual help files first
    const virtuals = getVirtualHelpFiles(r);
    const vf = virtuals.find((item) => item.name === cleanName);
    if (vf) {
        return {
            name: vf.name,
            label: vf.label || vf.name,
            contentType: 'text/plain; charset=utf-8',
            buffer: Buffer.from(vf.content, 'utf8'),
            text: vf.content
        };
    }

    // Check on-disk directories with strict path-jail validation (Law U4 / CWE-22)
    const dirGetter = REALM_DIRS[r];
    const dirs = dirGetter ? dirGetter() : [];
    for (const d of dirs) {
        const rootResolved = path.resolve(d);
        const candidate = path.resolve(rootResolved, cleanName);
        if (!candidate.startsWith(rootResolved + path.sep)) continue;
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
        const ext = path.extname(cleanName).toLowerCase();
        if (!['.txt', '.rst', '.md', '.hlp', '.pdf', '.html'].includes(ext)) continue;
        const buf = fs.readFileSync(candidate);
        if (ext === '.pdf') {
            return {
                name: cleanName,
                label: FILE_LABELS[cleanName] || cleanName,
                contentType: 'application/pdf',
                buffer: buf,
                isBinary: true
            };
        }
        return {
            name: cleanName,
            label: FILE_LABELS[cleanName] || cleanName,
            contentType: 'text/plain; charset=utf-8',
            buffer: buf,
            text: buf.toString('utf8')
        };
    }

    return null;
}

module.exports = {
    listHelpFiles,
    readHelpFile
};

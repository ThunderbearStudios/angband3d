'use strict';

/**
 * server/src/realm-help-files.js
 *
 * Unified 8-Realm Official Help File & Manual Provider.
 * Serves:
 *  - Official upstream help files from disk for Angband 4.2.6, Sil-Q 1.5.0,
 *    FrogComposband 7.1, and Hengband 3.0.1.26 (English & Japanese).
 *  - Complete multi-chapter manuals, command tables, role/deity compendiums,
 *    and live engine bestiaries/item encyclopedias for NetHack 3.6.7,
 *    Dungeon Crawl Stone Soup 0.31, Brogue CE 1.13, Classic Rogue 5.4.4,
 *    Sil-Q 1.5.0, and Vanilla Angband 4.2.6.
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
  , or g  Pick up item(s) on current tile
  d / D   Drop single item / Drop multiple items by category
  w       Wield a weapon (or 'w -' to fight barehanded)
  W / T   Wear armor / Take off armor
  P / R   Put on accessory (ring, amulet, blindfold, towel) / Remove accessory
  x       Swap between primary and secondary weapons

CONSUMABLES, MAGIC & TOOLS
  e       Eat food ration, tin, or monster corpse on floor/inventory
  q       Quaff (drink) a potion
  r       Read a scroll or spellbook
  z       Zap a wand in a direction
  Z       Cast a memorized spell
  a       Apply (use) a tool: key, lockpick, stethoscope, lamp, unicorn horn, bag, pick-axe
  t / f   Throw an item / Fire quivered ammunition

DUNGEON INTERACTION & EXPLORATION
  o / c   Open a door / Close a door
  k / C-d Kick a locked door, chest, or monster
  s       Search adjacent tiles for secret doors and traps
  .       Rest / wait 1 turn
  < / >   Climb up stairs (or ladder) / Descend down stairs
  :       Look at what is on the floor at your feet
  ;       Look at distant map tiles
  E       Engrave writing on the floor (e.g., Elbereth or wand identification)
  p       Pay your shopping bill to the shopkeeper

EXTENDED COMMANDS (Press #)
  #pray     Pray to your alignment's deity for emergency help or water blessing
  #chat     Talk to adjacent shopkeeper, priest, Oracle, or Quest Leader
  #offer    Sacrifice a fresh corpse on an altar for luck, mollification, or Artifacts
  #dip      Dip an item into a potion (e.g.Holy Water or Poison) or fountain
  #loot     Open or put items into a chest, box, or sack on the floor
  #untrap   Disarm an adjacent trap or trapped chest
  #force    Force the lock of a chest using your wielded weapon
  #enhance  Advance weapon and spell school skill levels
  #monster  Use your monster racial ability (if polymorphed)`
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
  o         Auto-explore current floor (stops on monsters, stairs, altars, items)
  Tab       Auto-fight nearest threat with wielded weapon
  5 or .    Rest until HP and MP are full (or wait 1 turn)
  < / >     Ascend up staircase / Descend down staircase
  G         Inter-level travel (jump to any discovered branch or staircase)
  X         Full-screen level map overview
  Ctrl+F    Search all discovered items across the entire dungeon

MAGIC, GODS & SKILLS
  m         Open Skill Training allocation screen
  a         Use Divine Ability (God power), Species power, or Evocable item
  z / Z     Cast a memorized spell / Force-cast spell
  M         Memorize a new spell from your Spell Library
  I         Inspect memorized spells & power ratings
  ^         View your worshipped God's tenets, Piety rank, and abilities
  A         View Mutations, Innate Species Traits, and Resistances

INVENTORY & EQUIPMENT
  i         Open Inventory
  w         Wield a weapon
  W / T     Wear armor / Take off armor
  P / R     Put on ring or amulet / Remove ring or amulet
  q / r     Quaff a potion / Read a scroll
  f / Q     Fire quivered ranged attack / Select quiver action
  v         Evoke a wand or miscellaneous magical device
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
  • Caustic / Paralytic / Confusion Gas: Throw harmful potions (q/t) at a distance
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
  e         Auto-explore current cavern depth
  z         Rest until healed (up to 100 turns)
  Space / . Wait 1 turn in place
  i         Open Inventory
  a         Apply (use/equip/drink/read/zap) any inventory item
  q / r     Quaff potion / Read scroll
  w / W / R Equip weapon, armor, or ring / Remove equipped gear
  t / f     Throw item or harmful potion / Fire dart or staff
  s         Search adjacent tiles for hidden traps & secret doors
  x         Examine visible monsters, terrain gases, and items
  D         Open Discoveries table (all identified potions, scrolls, rings)
  > / <     Descend stairs / Ascend stairs

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
  Arrow Keys / WASD / hjklyubn   Move or attack
  s                              Search adjacent walls for secret doors & traps
  .                              Rest 1 turn
  >                              Descend staircase to the next level
  <                              Ascend staircase (ONLY works once you hold the Amulet of Yendor!)
  i                              List inventory
  e                              Eat Food Ration or slime-mold
  q                              Quaff a potion
  r                              Read a scroll
  w                              Wield a weapon
  W / T                          Wear armor / Take off armor
  P / R                          Put on ring (Left or Right hand) / Remove ring
  z                              Zap a wand or staff in a direction
  t                              Throw arrow (with Short Bow wielded!), dagger, or dart
  d                              Drop item on the floor
  D                              List all discovered/identified Potions, Scrolls, Rings, and Staves
  ^                              Identify an adjacent trap`
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

3. THE EIGHT SKILL TREES & ABILITIES (Press Tab or @)
-----------------------------------------------------
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
  chosen slays (Orcs, Trolls, Rauko, Dragons, Spiders), resistances, or stat bonuses.`
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
        'Guidebook.txt', 'DCSS_Survival_Manual.txt', 'Brogue_Survival_Manual.txt',
        'Rogue_1980_Manual.txt', 'SilQ_Combat_Stealth_and_Forging.txt',
        'Angband_Quick_Survival_Checklist.txt',
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

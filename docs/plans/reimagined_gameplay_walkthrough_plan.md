# Angband3D — Reimagined 5-Minute Award-Winning Commercial & Master Walkthrough Blueprint

## 1. Executive Vision & Core Mandate
This master walkthrough is engineered to compete for a top web award. It transforms Angband's 30-year legacy into a broadcast-quality, cinematic 5-minute showcase (300.0s). Every second is storyboarded like a high-end gaming commercial: fast-paced, visually stunning, mechanically authentic, and highlighting every flagship feature of the 3D first-person client and web platform.

### Strict Directives Enforced:
1. **Theatrical Insignia Branding**: Pure **Thunderbear Studios** insignia on obsidian with radial gold bloom and Cinzel typography at the beginning (0:00–0:06) and finale (4:38–5:00). Zero buttons, zero HUD clutter on splash cards.
2. **Zero Farmer Scenes**: Farmer Maggot is completely removed from the town instance. The town scene features clean cobblestone avenues, architectural storefronts, starry celestial sky, and the friendly scruffy little dog.
3. **Multi-Depth Perspectives & Dynamic Camera Framing**: Every act transitions with dynamic camera facing (`setFacing` + `cameraYaw`), immediately framing the scene, corridor, or monster with zero wall collisions and zero blind stares.
4. **Comprehensive GUI & 3D Usability Spotlight**:
   - Minimap zoom (`+`/`-`), yaw orientation cone, and position telemetry.
   - Message Log drawer (`[L]`) expanding and compacting.
   - Equipment inventory management (`[e]`).
   - Classic 80x24 green CRT ASCII grid toggle (`[Tab]`) with real-time 3D sync.
   - Ranged bow archery targeting down corridor (`[f]`).
   - Arcane Grimoire spellcasting (`[m]`) with projectile VFX.
   - Restorative potion quaffing (`[q]`) with healing auras.
   - Phase door emergency teleportation (`[r]`).
   - In-game pause menu (`[Esc]`) with universal `.SAV` savefile export.
5. **Living Chronicle & Lorekeeper Aoede (Web Exclusive)**: Dedicated 40-second spotlight on the web-exclusive Living Chronicle, Lorekeeper Aoede's dynamic lore commentary, and 3D raycast creature click-and-inspect.
6. **Vocal Pacing & Absolute Mutual Exclusion**: Main narrator delivers cinematic broadcast commentary throughout, with Lorekeeper Aoede vocalizing during the Chronicle showcase. Every voiceover stem has $\ge 1.5\text{s}$ of clean silent separation.
7. **Free, Open-Source & Community Replication Finale**: Emphasizes open-source GitHub repository (`ThunderbearStudios/angband3d`), self-hosting, developer replication, and universal save portability.
8. **Code Compartmentalization**: All demo recording, playback, and showcase assets remain strictly isolated in `server/public/js/demo-*` and `server/public/demo.html`, keeping the core C engine and Godot native client lean and pristine.

---

## 2. Storyboard: 10 Acts / Scenes Across 300 Seconds

```mermaid
timeline
    title Angband3D 5-Minute Award-Winning Walkthrough Timeline
    0:00 - 0:06 : Act 0 : Pure Thunderbear Studios Insignia
    0:06 - 0:42 : Act 1 : Town of Angband & 3D Exploration (No Farmer)
    0:42 - 1:15 : Act 2 : Shallow Crypts (DL1 50ft) & Minimap Zoom
    1:15 - 1:48 : Act 3 : Dual Reality (DL1) - 80x24 CRT Terminal Sync
    1:48 - 2:20 : Act 4 : Caverns (DL12 600ft) - Ranged Bow Archery & Logs
    2:20 - 2:50 : Act 5 : Arcane Vault (DL20 1000ft) - Grimoire Magic & Potions
    2:50 - 3:30 : Act 6 : Web-Exclusive Living Chronicle & Creature Click
    3:30 - 4:08 : Act 7 : Magma Vault (DL25 1250ft) - Young Red Dragon Melee
    4:08 - 4:38 : Act 8 : Universal Save Portability & Pause Menu Export
    4:38 - 5:00 : Act 9 : Grand Finale - Open Source, Replication & Outro
```

---

### Act 0: Theatrical Brand Card (0:00 – 0:06, 6.0s)
- **Visual**: Pure **Thunderbear Studios** insignia on obsidian black with warm amber/gold radial bloom. Cinzel gold typography: *"THUNDERBEAR STUDIOS PRESENTS"*.
- **Camera**: Gentle 1.05x subtle push-in scale over 4 seconds, fading softly into live 3D Town square.
- **Narrator**: *"Thunderbear Studios presents Angband 3D — thirty years of legendary roguelike heritage, completely reborn in a stunning, fully-playable 3D first-person world."*
- **Stem**: `v3_clip_00_thunderbear.wav` (0:00.8 – 0:05.2, 4.4s).

---

### Act 1: The Town & First-Person Immersion (0:06 – 0:42, 36.0s)
- **Instance**: `demo_town` (Ostirch, Half-Elf Necromancer at `(22, 8)` DL 0). **Farmer Maggot completely removed**.
- **Visual**: Spawns facing South (`facing = 2`). Warm lanterns illuminate cobblestones, vaulted stone arches, and open celestial night sky.
- **Subscene 1.1 (0:06–0:16)**: Smooth forward walk South through the town square. Passing the Armoury with shield signboard and General Store.
- **Subscene 1.2 (0:16–0:24)**: Player turns toward the scruffy little dog, presses `[C]` (interact). Cheerful dog bark sound effect, log entry: *"The scruffy little dog wags its tail happily."*
- **Subscene 1.3 (0:24–0:32)**: Player opens the equipment management window `[e]`. Inspects equipped dagger and soft leather armor. Closes cleanly.
- **Subscene 1.4 (0:32–0:42)**: Narrator finishes speaking about the town. Player walks smoothly toward the dark stone dungeon stairwell, stepping on the descent stairs `(25, 4)` and pressing `>` to plunge into the underworld.
- **Narrator**: *"Welcome to the Town of Angband. Beneath these peaceful cobblestones lies fifty levels of peril and ancient treasure. From storefront exploration and street interactions to full first-person equipment management, Angband 3D brings unprecedented depth and atmosphere to classic dungeon crawling."*
- **Stems**:
  - `v3_clip_01_town_intro.wav` (0:07.5 – 0:18.0, 10.5s)
  - `v3_clip_02_town_gear_stairs.wav` (0:20.5 – 0:31.5, 11.0s)

---

### Act 2: The Shallow Crypts & Spatial 3D Navigation (0:42 – 1:15, 33.0s)
- **Instance**: `demo_crypt` (Renwe, High-Elf Paladin at `(73, 48)` DL 1 / 50ft).
- **Visual**: Spawns facing South (`facing = 2`). Vaulted stone masonry, flickering torchlight, open corridor extending ahead.
- **Subscene 2.1 (0:42–0:50)**: Smooth 0-turn camera yaw look-around (left 45°, right 45°, center).
- **Subscene 2.2 (0:50–0:58)**: UI Spotlight on Minimap: Toggling zoom (`+` and `-`), showing dynamic player orientation cone and explored dungeon rooms.
- **Subscene 2.3 (0:58–1:06)**: Player advances down the corridor. Small Kobold approaches at `(73, 54)`. Player engages in melee (`Space`). Authentic attack animation and weapon clash sound.
- **Subscene 2.4 (1:06–1:15)**: Kobold slain. Real in-engine copper drops. Player steps onto tile and picks it up with `g`. Gold counter in HUD increments from 295 to 340.
- **Narrator**: *"Descending into the shallow crypts, dynamic torchlight illuminates vaulted halls. Seamless camera turning offers instant situational awareness with zero game turn penalty, while the interactive tactical minimap keeps your bearings razor-sharp as you slay foes and claim dungeon loot."*
- **Stems**:
  - `v3_clip_03_crypt_minimap.wav` (0:44.0 – 0:56.5, 12.5s)
  - `v3_clip_04_crypt_combat_loot.wav` (0:59.0 – 1:11.0, 12.0s)

---

### Act 3: Dual Reality — The Classic 80x24 CRT Terminal (1:15 – 1:48, 33.0s)
- **Instance**: `demo_vault` (Erolin, Half-Orc Druid at `(129, 54)` DL 1 / 50ft).
- **Visual**: Spawns in front of a vaulted doorway.
- **Subscene 3.1 (1:15–1:25)**: Player presses `[Tab]`. Instantaneous switch to the full green-screen CRT 80x24 ASCII terminal! Phosphor bloom, scanlines, and classic roguelike glyphs.
- **Subscene 3.2 (1:25–1:36)**: Player moves steps in 2D ASCII view. The 3D camera cone indicator rotates and shifts across the grid in real-time bidirectional synchronization.
- **Subscene 3.3 (1:36–1:48)**: Player presses `[Tab]` to seamlessly return to 3D. Reveals a sleeping White Jelly (`[j] 36/36` with floating `"Zzz..."`) framed right in front of the Druid's quarterstaff.
- **Narrator**: *"Every single roll, stat, and mechanic is 100% faithful to authoritative Angband C engine rules. With a single tap of the Tab key, toggle instantly between modern 3D first-person rendering and the legendary 80x24 green-screen CRT terminal — seamlessly synchronized in real time."*
- **Stems**:
  - `v3_clip_05_dual_reality_intro.wav` (1:17.0 – 1:29.5, 12.5s)
  - `v3_clip_06_dual_reality_sync.wav` (1:32.0 – 1:44.5, 12.5s)

---

### Act 4: The Deep Caverns & Ranged Archery (1:48 – 2:20, 32.0s)
- **Instance**: `demo_caverns` (Belonden, High-Elf Ranger at `(140, 10)` DL 12 / 600ft).
- **Visual**: Spawns facing South (`facing = 2`) down a brick corridor. Orc Archer in 3D with spiked helmet, shield, and floating nameplate `[o] 80/80`.
- **Subscene 4.1 (1:48–1:56)**: Player locks target with `[f]` (fire bow). Red reticle highlights the Orc Archer.
- **Subscene 4.2 (1:56–2:06)**: Player releases arrow. 3D projectile streaks down the hallway, striking the Orc Archer with particle impact (`"Your arrow hits the orc archer!"`, HP drops to `72/80`).
- **Subscene 4.3 (2:06–2:20)**: UI Spotlight on Message Log Drawer: Player presses `[L]` (or clicks Log button). The drawer slides open with glassmorphic backdrop, revealing detailed battle history. Player clicks Compact to restore clean HUD.
- **Narrator**: *"Deeper in the caverns, long-range tactical combat comes alive. Draw your bow and let fly arrows down winding corridors with fluid 3D projectile targeting, while the expandable message log drawer delivers full tactical combat telemetry at your fingertips."*
- **Stems**:
  - `v3_clip_07_caverns_archery.wav` (1:50.0 – 2:02.0, 12.0s)
  - `v3_clip_08_caverns_log_drawer.wav` (2:04.5 – 2:16.5, 12.0s)

---

### Act 5: The Arcane Vaults & Magic Mastery (2:20 – 2:50, 30.0s)
- **Instance**: `demo_mage` (Goros, Dunadan Mage at `(66, 21)` DL 20 / 1000ft).
- **Visual**: Spawns facing West (`facing = 3`). Ornate stone vault chamber. Towering Cave Troll `[T] 104/104` blocks the archway.
- **Subscene 5.1 (2:20–2:30)**: Player opens the ritual grimoire `[m]`. Selects Magic Missile. Brilliant azure arcane bolt streaks forward and detonates against the troll (`HP 71/104`).
- **Subscene 5.2 (2:30–2:40)**: Troll retaliates, dealing heavy damage. Player's health bar drops.
- **Subscene 5.3 (2:40–2:50)**: Player quaffs a Potion of Cure Critical Wounds (`[q]`). Emerald healing sparkles envelop the viewport; health bar surges back to full (`514/514`).
- **Narrator**: *"Master the arcane arts with authentic grimoire spellcasting. Channel Magic Missiles, unleash elemental bursts, and quaff restorative elixirs in the heat of battle against towering trolls and fearsome beasts."*
- **Stems**:
  - `v3_clip_09_mage_grimoire.wav` (2:22.0 – 2:33.5, 11.5s)
  - `v3_clip_10_mage_healing_potion.wav` (2:36.0 – 2:47.0, 11.0s)

---

### Act 6: The Living Chronicle & Tolkien Lorekeeper (2:50 – 3:30, 40.0s)
- **WEB EXCLUSIVE FLAGSHIP SPOTLIGHT**
- **Instance**: `demo_vault` or `demo_combat` (Live Web UI Spotlight).
- **Visual**: The player clicks the glowing Tome icon (`#btn-toggle-chronicle`) on the top bar. The Living Chronicle drawer glides open on the right dock with an ornate leather-bound aesthetic.
- **Subscene 6.1 (2:50–3:02)**: Chronicle UI Spotlight: The Tome dynamically compiles recent player deeds into Tolkien-esque literary prose with golden illumination.
- **Subscene 6.2 (3:02–3:15)**: Lorekeeper Aoede's Voice: Lorekeeper Aoede speaks directly: *"Beware, traveler of the shadows... in the obsidian deeps, ancient drakes stir upon hoards of forgotten kings."* The vocal pill pulses emerald in sync with her words.
- **Subscene 6.3 (3:15–3:30)**: Creature Click & 3D Raycasting: Player moves mouse over the 3D monster model in the main viewport and clicks! An interactive target card blooms on screen displaying creature lore, elemental affinities, hit points, and dialogue options.
- **Narrator (Main)**: *"Available exclusively on the web edition, the Living Chronicle weaves your journey into dynamic Tolkien-inspired narrative prose. Consult Lorekeeper Aoede for tactical advice, listen to neural voice narrations, and click directly on any 3D creature in the dungeon to inspect its lore, stats, and weaknesses."*
- **Stems**:
  - `v3_clip_11_chronicle_web_exclusive.wav` (2:51.5 – 3:02.5, 11.0s)
  - `v3_clip_12_aoede_voice_dialogue.wav` (3:04.5 – 3:13.5, 9.0s - Lorekeeper Aoede)
  - `v3_clip_13_creature_click_inspect.wav` (3:15.5 – 3:27.5, 12.0s)

---

### Act 7: The Magma Vault & Dragon Battle (3:30 – 4:08, 38.0s)
- **Instance**: `demo_combat` (Debrest, Half-Orc Necromancer at `(105, 24)` DL 25 / 1250ft).
- **Visual**: Spawns facing East (`facing = 1`). Glowing magma fissures, infernal orange backlighting, towering Young Red Dragon `[d] 241/241`.
- **Subscene 7.1 (3:30–3:42)**: Westernesse fire blade melee: Player steps forward and strikes the dragon (`Space`). Flame particles erupt, dragon roars and retaliates with claw and bite. Genuine combat logs fill the top banner.
- **Subscene 7.2 (3:42–3:55)**: Tactical crisis: Dragon readies fiery breath. Player reads a Scroll of Phase Door (`[r]`). A burst of violet magic teleports the player instantly to a defensive alcove across the chamber.
- **Subscene 7.3 (3:55–4:08)**: Player readies wand/spells, framing the towering dragon across the magma fissure.
- **Narrator**: *"In the deepest magma vaults, survival demands every ounce of strategy. Trade blows with towering dragons, leverage elemental resistances, and trigger phase door escapes when the flames burn too close."*
- **Stems**:
  - `v3_clip_14_dragon_melee_clash.wav` (3:32.0 – 3:44.0, 12.0s)
  - `v3_clip_15_dragon_phase_door.wav` (3:46.5 – 3:58.5, 12.0s)

---

### Act 8: Universal Save Portability & Pause Menu Export (4:08 – 4:38, 30.0s)
- **Instance**: In-Game Pause Menu (`[Esc]`).
- **Visual**: Glassmorphic pause menu modal appears over the game view.
- **Subscene 8.1 (4:08–4:18)**: Player navigates to "Download Character Save (.SAV)". The button glows electric blue.
- **Subscene 8.2 (4:18–4:28)**: Click triggers browser download of `Debrest.sav`. Visual callout shows interoperability between Web, Desktop Godot C# client, and classic terminal Angband.
- **Subscene 8.3 (4:28–4:38)**: Clean modal close returning to gameplay.
- **Narrator**: *"Your adventures are entirely your own. With universal save file export, take your character save file seamlessly between the browser, native desktop clients, and classic terminal Angband with 100% interoperability."*
- **Stem**: `v3_clip_16_universal_saves.wav` (4:10.0 – 4:26.5, 16.5s).

---

### Act 9: Grand Finale — Free, Open Source & Award-Winning (4:38 – 5:00, 22.0s)
- **Visual**: Theatrical outro card with **Thunderbear Studios** insignia, gold title, and 6-pillar feature grid:
  - 100% Authentic Angband 4.2.6 C Engine
  - First-Person 3D WebGL & Godot 4
  - Instant 80x24 Dual Reality Terminal
  - Web-Exclusive Living Chronicle & Voice
  - Free, Open Source & Self-Hostable
  - GitHub: `github.com/ThunderbearStudios/angband3d`
- **Narrator**: *"Angband 3D is 100% free and open source. Play now directly in your browser at angband3d.com, inspect the source, host your own server, and build the future of roguelikes. Brought to you by Thunderbear Studios."*
- **Stem**: `v3_clip_17_grand_finale_open_source.wav` (4:40.0 – 4:56.5, 16.5s).
- **Hold**: 3.5s quiet hold on the Thunderbear Studios insignia and GitHub link before fading to black at 300.0s.

---

## 3. Strict Timing & Stem Scheduling Matrix (Zero Vocal Overlap)

| Stem # | File | Speaker | Start (s) | Duration (s) | End (s) | Buffer (s) |
|---|---|---|---|---|---|---|
| 0 | `v3_clip_00_thunderbear.wav` | Narrator | 0.8 | 4.4 | 5.2 | 2.3 |
| 1 | `v3_clip_01_town_intro.wav` | Narrator | 7.5 | 10.5 | 18.0 | 2.5 |
| 2 | `v3_clip_02_town_gear_stairs.wav` | Narrator | 20.5 | 11.0 | 31.5 | 12.5 |
| 3 | `v3_clip_03_crypt_minimap.wav` | Narrator | 44.0 | 12.5 | 56.5 | 2.5 |
| 4 | `v3_clip_04_crypt_combat_loot.wav` | Narrator | 59.0 | 12.0 | 71.0 | 6.0 |
| 5 | `v3_clip_05_dual_reality_intro.wav` | Narrator | 77.0 | 12.5 | 89.5 | 2.5 |
| 6 | `v3_clip_06_dual_reality_sync.wav` | Narrator | 92.0 | 12.5 | 104.5 | 5.5 |
| 7 | `v3_clip_07_caverns_archery.wav` | Narrator | 110.0 | 12.0 | 122.0 | 2.5 |
| 8 | `v3_clip_08_caverns_log_drawer.wav` | Narrator | 124.5 | 12.0 | 136.5 | 5.5 |
| 9 | `v3_clip_09_mage_grimoire.wav` | Narrator | 142.0 | 11.5 | 153.5 | 2.5 |
| 10 | `v3_clip_10_mage_healing_potion.wav` | Narrator | 156.0 | 11.0 | 167.0 | 4.5 |
| 11 | `v3_clip_11_chronicle_web_exclusive.wav` | Narrator | 171.5 | 11.0 | 182.5 | 2.0 |
| 12 | `v3_clip_12_aoede_voice_dialogue.wav` | Aoede | 184.5 | 9.0 | 193.5 | 2.0 |
| 13 | `v3_clip_13_creature_click_inspect.wav` | Narrator | 195.5 | 12.0 | 207.5 | 2.5 |
| 14 | `v3_clip_14_dragon_melee_clash.wav` | Narrator | 210.0 | 12.0 | 222.0 | 2.5 |
| 15 | `v3_clip_15_dragon_phase_door.wav` | Narrator | 224.5 | 12.0 | 236.5 | 13.5 |
| 16 | `v3_clip_16_universal_saves.wav` | Narrator | 250.0 | 16.5 | 266.5 | 13.5 |
| 17 | `v3_clip_17_grand_finale_open_source.wav` | Narrator | 280.0 | 16.5 | 296.5 | 3.5 |

**Total Duration**: 300.0s (05:00.00).  
**Minimum Silent Buffer Between Any Consecutive Stems**: 2.0s (100% Guaranteed Zero Vocal Overlap).

---

## 4. Code & Asset Architecture Isolation Plan
- **Compartmentalized Walkthrough Automation**:
  - `server/public/js/demo-recorder.js`: Drives the automated CDP session for generating raw video and keyframes.
  - `server/public/js/demo-player.js`: Drives the web player with scrubber, audio sync, and chapter buttons.
  - `server/public/demo.html`: The standalone web showcase page.
  - `server/public/assets/audio/demo/`: All audio stems and `demo_manifest.json`.
  - `server/public/assets/video/`: Master `angband3d_demo.mp4` and `angband3d_demo.webm`.
- **Preserved Core Repositories**:
  - `engine/`: Clean upstream Angband 4.2.6 C code with only the bridge frontend. Zero demo bloat.
  - `client/`: Clean Godot 4 C# client. Contains only a lean link to `/demo` without bundling large video files.
  - `tools/demo_saves_backup/`: Versioned pristine golden saves.

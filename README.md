# Angband 3D

> **Four Legendary Roguelike Engines. One Living 3D World. Over Three Decades of Tactical History Preserved Through High-Performance Engine Decoupling.**

[![Play Online in Browser](https://img.shields.io/badge/⚔_Play_Online-angband3d.com-gold?style=for-the-badge&logo=googlechrome)](https://angband3d.com)
[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-blue.svg)](LICENSE)
[![Engines: 4 Authoritative Realms](https://img.shields.io/badge/Engines-Vanilla_•_Sil--Q_•_FCB_•_Hengband-darkgreen.svg)](#-four-legendary-realms-one-unified-experience)
[![Web Client: Three.js PBR](https://img.shields.io/badge/Web_Client-Three.js_WebGL_PBR-orange.svg)](server/public)
[![Desktop Client: Godot 4 C#](https://img.shields.io/badge/Desktop_Client-Godot_4.3+_.NET_8-blueviolet.svg)](https://godotengine.org/)
[![Mobile: Android Standalone APK](https://img.shields.io/badge/Mobile-Android_SDK_34_APK-green.svg)](#-play-instantly-cross-platform-matrix)
[![Tests: 30/30 Fast + 11/11 Smoke + 4/4 E2E](https://img.shields.io/badge/Automated_Gates-45%2F45_Passing-brightgreen.svg)](tools)

---

> ### 🌟 Official Live Links & Instant Play (`v11.1.1`)
> - ⚔ **Play Now in Browser**: **[https://angband3d.com](https://angband3d.com)** *(Instant 60 FPS 3D roguelike, zero install across Desktop, iOS & Android)*
> - 💻 **Standalone Windows PC**: **[Download Angband3D-Windows-x64.zip](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Windows-x64.zip)** *(144+ FPS native offline play powered by Godot 4 C#)*
> - 📱 **Standalone Android App**: **[Download Angband3D-Android.apk](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Android.apk)** *(Offline mobile play with tactile split-thumb D-pad)*
> - 📖 **System Architecture & Wire Protocol**: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** *(C99 bridge specification, 60 FPS dirty-state gating & automated test matrix)*
> - 🏛 **Official Studio & Architecture Overview**: **[https://thunderbearstudios.dev](https://thunderbearstudios.dev)** *(Thunderbear Studios frameworks & Cloud Run proving ground)*

---

## ⚔️ The Vision: Playability First, 100% Uncompromised Mechanics

Classic turn-based roguelikes represent some of the most mathematically deep, tactically unforgiving, and strategically emergent game designs in computer history. Yet for decades, bringing them into 3D has almost always meant **shallow action-RPG rewrites** that discard their intricate simulation rules, RNG fairness, and legendary difficulty.

**Angband 3D solves this problem permanently through architectural decoupling.** 

Rather than rewriting the game, Angband 3D runs **four authoritative, unmodified C/C++ roguelike engines** in headless bridge mode. Every combat roll, saving throw, item generation curve, stealth check, and monster AI pathfinding decision runs bit-for-bit canonical upstream C code. Frontends—whether our responsive Three.js WebGL client, native Godot 4 C# engine, or standalone Android APK—act purely as reactive presentation layers.

The result is a breathtaking first-person dungeon crawl with real-time camera look, procedural lighting, Gothic dark-fantasy crimson life and sapphire mana orbs, 3D armored gauntlet viewmodels, a 58-model rigged 3D bestiary, and voiced narrative sagas, built upon a foundation of absolute mathematical rigor.

---

## 🎮 Playability Features That Redefine the Dungeon Crawl

### 1. 🌌 Four Legendary Realms, One Unified Experience
Choose your destiny across four masterworks of the open-source roguelike genre, switchable in one click from the title screen:

```
                                    +-----------------------------------------+
                                    |        ANG BAND 3D MULTI-REALM          |
                                    +-----------------------------------------+
                                                         |
         +-----------------------+-----------------------+-----------------------+-----------------------+
         |                       |                       |                       |                       |
         v                       v                       v                       v
+-----------------+     +-----------------+     +-----------------+     +-----------------+
| Vanilla Angband |     |      Sil-Q      |     | FrogComposBand  |     |    Hengband     |
|     (v4.2.6)    |     |     (v1.5.0)    |     |     (v7.1.1)    |     |     (v3.0.1)    |
+-----------------+     +-----------------+     +-----------------+     +-----------------+
| • 100 Dungeon   |     | • First Age     |     | • Sprawling     |     | • Japanese Chaos|
|   Levels        |     |   Beleriand     |     |   Multiverse    |     |   Lore & Classes|
| • Overthrow     |     | • Zero Mana/Shop|     | • Overworld     |     | • Live Bilingual|
|   Morgoth       |     | • Song & Stealth|     |   Wilderness    |     |   JP ↔ EN Toggle|
| • Vault Raiding |     | • Forge Crafting|     | • Monster Races |     | • Feudal Eastern|
| • Artifacts     |     | • Cut Silmaril  |     | • Chasm Abysses |     |   Archetypes    |
+-----------------+     +-----------------+     +-----------------+     +-----------------+
```

* **Vanilla Angband 4.2.6 (The Classical Descent)**: The definitive Middle-earth dungeon crawl. 100 sprawling dungeon levels, hundreds of unique artifacts, deadly breath weapons, and the ultimate descent to confront and defeat Morgoth, Lord of Darkness.
* **Sil-Q 1.5.0 (The First Age Tactical Masterpiece)**: Set in the ancient fortress of Angband during the First Age. Featuring Sil-Q's legendary Song system, 0 mana potions, 0 magic shops, positional melee combat, assassination from the shadows, masterwork smithing at subterranean forges, and the daring quest to carve a Silmaril from the Iron Crown.
* **FrogComposBand 7.1.1 (The Sprawling Multiverse)**: An expansive sandbox featuring a massive overworld wilderness, multiple towns, deep bottomless pit chasms (`#`), and hundreds of playable races and classes—from Dragons and Ringwraiths to Time Mages and Beholder monks.
* **Hengband 3.0.1 (Eastern Chaos & Bilingual Brilliance)**: The revered Japanese variant blending Eastern folklore with chaotic high-fantasy roguelike mechanics. Features real-time line-level Japanese ↔ English bilingual translation (`heng-translate.js`), allowing you to toggle languages on the fly without restarting.

---

### 2. ⚡ The Camera Invariant: 0-Turn Look Meets Pure Turn-Based Tactics
In traditional 2D roguelikes, turning your head is inseparable from taking a step. In first-person 3D, advancing game time whenever you look around makes movement unplayable, while making the entire game real-time destroys the tactical depth.

* **Angband 3D's Solution**: Camera yaw, pitch, and smooth first-person mouse look cost **exactly zero game turns**.
* You can look down dark hallway intersections, inspect distant monsters, peek into stone alcoves, and admire vaulted gothic archways freely without advancing time.
* The moment you execute a translational command (`Step Forward`, `Strafe`, `Attack`, `Quaff`, `Cast`, `Wait`), an authoritative turn token is dispatched to the C engine. Monsters only advance or strike when you take a turn.

---

### 3. 🖥️ Dual-Reality Mode: Seamless 3D, Diegetic Grimoire Deck & Illuminated Vellum Terminal
Transition seamlessly between modern 3D immersion and nostalgic terminal play with a single keystroke (`Tab`) or screen tap:

* **Instant Zero-Turn View Toggling**: Press `Tab` at any millisecond to switch between the 3D first-person perspective and an illuminated 80×24 obsidian-vellum terminal canvas with gilded selection highlights and smooth `grimoireUnfurl` transitions.
* **Diegetic Dark-Fantasy Grimoire & Armory Deck (`grimoire-deck.js`)**: Opening inventory (`i`), equipment (`e`), stores, or Sil-Q ability/smithing (`Tab` / `0`) unfurls an interactive **Grimoire & Armory Deck** featuring rarity-bordered item cards, Pack/Equipped/Quiver tabs, Sil-Q 7-Pillar Ability Tapestry & Anvil Forge controls, and a 1-click **Classic / Hybrid** mode toggle.
* **Multi-Column Variant Menu Hit-Testing & Passive Verb Routing**: Click any option across multi-column character birth tables, Sil-Q ability grids, Hengband `C` page 2, or FrogComposBand power menus (`extractRowRegions`), with automatic `['Escape', verb, slotKey]` routing when invoking action verbs from Vanilla Angband's passive inventory lists.
* **Intelligent Auto-Routing (`needsTerminal`)**: The client automatically presents the terminal canvas during intricate multi-step interactions—such as rolling character birth attributes, inspecting your full equipment sheet (`e`), or bartering with shopkeepers in town—then drops you right back into first-person 3D the moment you return to the dungeon floor.
* **3D Directional Targeting**: When aiming wands, staves, bows, or ball spells, Angband 3D keeps you in first-person 3D with a contextual targeting prompt. Aim with relative arrow keys, press `t` to snap to the nearest visible threat, and loose your missile with full line-of-sight clarity.

---

### 4. 🎛️ Universal Movable HUD, 4-Realm Heraldry & Ergonomic Controls
Every adventurer plays differently. Angband 3D features a complete, zero-lag draggable HUD system where **every major interface widget can be repositioned and customized**:

* **4-Realm Heraldic Themes & Crests (`body[data-realm]`, `#char-realm-crest`)**:
  * Dynamically adapts HUD heraldry, metallic borders, and typography to each realm: **Morgoth's Iron Crown** (`angband`), **The Three Silmarils of Fëanor** (`silq`), **The Sign of the Logrus & Unicorn** (`frogcomposband`), and **The Five Elemental Rings** (`hengband`).
* **Twin Vertical Apothecary Medicine Vials & Tattered-Scroll / Charred-Wood Chrome**:
  * Graduated vertical glass medicine vials (`#hp-fill` crimson tincture & `#sp-fill` sapphire elixir) topped by hammered brass & cork neck collars, etched apothecary graduation marks (`apothecary_vial_overlay.svg`), and side-mounted tabular telemetry readouts (`#hp-text`, `#sp-text`).
  * Structural HUD docks (`#char-panel`, `#action-bar`, `#hud-footer`, `#minimap-container`, `#touch-controls`) are forged in **Charred Iron-Bound Wood** (`charred_wood.png`), while lore windows and menus (`#message-feed-window`, `#chronicle-window`, modals) are rendered on **Tattered Parchment Scrolls** (`tattered_scroll.png`).
* **Tactile Virtual D-Pad & WASD Movement Mode Toggle**:
  * Equipped with a dedicated top grip (`✥ MOVE PAD`) that lets phone, tablet, and desktop players drag the directional pad anywhere on screen.
  * Three-step cycling scale button (`0.85x` compact, `1.0x` standard, `1.20x` large) and one-tap minimize toggle to tuck the pad away during keyboard play.
  * **WASD Movement Mode Toggle**: Seamlessly switch between classical roguelike command keys and modern first-person WASD exploration/strafe controls with one tap or hotkey.
* **Hero Card & Expandable Context Drawer (`#char-panel`)**:
  * Draggable status medallion displaying real-time HP, MP, Voice/Stamina, and AC gauges.
  * 1-click toggle (`▾`) reveals the **Extended Character Context Drawer**: full view of all primary attributes (`STR..CHR` or Sil-Q's 4 core attributes + 8 skills), secondary stats (To-Hit, To-Dam, Speed, Burden, Turn, Depth), and active condition badges (`✨ Blessed`, `🩸 Cut`, `🧪 Poisoned`, `⚡ Hasted`, `🛡 Shielded`).
* **Tactical Radar Minimap & Combat Feed**:
  * Draggable 2D radar with live cell hover tooltips, click-to-inspect coordinates, and stair indicators.
  * Draggable combat and message log with pinned height invariants, smooth 6s idle fade, and 1-click banner expansion.
* **Cross-Device Layout Persistence (`angband3d_hud_layout_v2`)**:
  * Widget coordinates are stored in `localStorage` as viewport percentage ratios, ensuring your custom layout translates cleanly between desktop ultrawides, laptops, tablets, and phones.
  * Emergency **"↺ Reset HUD"** button in both the HUD footer and Pause modal restores default layout in 1 click.

---

### 5. 🎨 Photogrammetry Ultra-Realism, 58-Model 3D Bestiary, Studio Foley & Next-Gen Action VFX
Angband 3D combines 8K photogrammetry scans, a comprehensive 4-realm 3D bestiary, studio-recorded open-source foley, and the dark-fantasy art of **Raymond "Shockbolt" Gaustadnes**:

* **3D Armored Gauntlet Viewmodels & Poly Haven Weapons**: First-person viewmodels feature CC0 8K-scanned Poly Haven models and OpenMMO weaponry anchored below the lower-right viewport rim, gripped by a fully articulated 3D armored gauntlet (`iron_gauntlets.glb`) with animated weapon strike recoil, off-hand shields, and zero HUD occlusion.
* **Comprehensive 58-Model 4-Realm 3D Bestiary**: 100% dedicated 3D models across `Vanilla Angband`, `Sil-Q`, `FrogComposBand`, and `Hengband`—including humanoids (Rangers, Peasants, Royal Guards, Valkyries), goblinoids & giants (goblins, orcs, kobolds, trolls, ogres, cyclopes), multi-headed hydras (`hydra.glb`), hooded nagas (`naga.glb`), floating beholder eyes (`floating_eye.glb`), writhing worm masses (`worm_mass.glb`), scorpions (`scorpion.glb`), centipedes (`centipede.glb`), scarab beetles (`beetle.glb`), formics (`ant.glb`), chiropteran bats (`bat.glb`), bears & heavy quadrupeds (`bear.glb`), basilisks & reptiles (`lizard.glb`), sharks & aquatic predators (`aquatic.glb`), elemental vortices (`vortex_elemental.glb`), quylthulgs (`quylthulg.glb`), fungal colonies (`mushroom_cluster.glb`), and translucent oozes (`jelly_ooze.glb`).
* **78-File Open-Source Studio Audio Bank & Stereo Dungeon Convolution Reverb**: Crisp, non-vocal medieval combat foley (`Kenney CC0` + `Battle for Wesnoth GPL-2.0+`) for steel blades, axes, maces, spears, plate-armor blocks, bows, footsteps, and elemental spells routed through a 2-channel subterranean stone-hall convolution reverb impulse (`createDungeonReverbImpulse`).
* **Zero-Leak 3D Action & Spell VFX**: Weapon-specific crescent blade cleaves (`slash`), blazing X-cleaves (`crit_slash`), dual seismic shockwave rings (`blunt`), piercing thrust lances (`pierce`), volumetric dragon breath cones (`breath`), multi-branch forked lightning (`lightning`), impact detonation domes (`spawnDetonationDome`), and runic ascension pillars (`aura`) powered by shared singleton GPU geometries.
* **Next-Gen Celestial Sky Dome & 4-Level Biome Chapters**: Custom GLSL sky dome (Milky Way, boreal aurora, crescent moon) on surface levels, transitioning every 200 feet through Upper Ashlar Crypts, Damp Flooded Undercrofts, Ancient Sandstone Sepulchres, Fungal Catacombs, and Deep Magma Pits.

---

### 6. 💾 Universal Save Game Portability
Your character lives wherever you want to play:

* **Universal Binary Saves (`SaveVNLA`, `SaveSILQ`, `SaveFROX`, `SaveHENG`)**:
  * Savegames use authentic upstream binary formats.
  * Export your save from your desktop browser with 1 click (`Esc` -> `Export Save`).
  * Drop it into your offline Windows Desktop client or continue your dungeon crawl on your Android phone during your commute.
  * Full freedom to back up your hero or embrace unforgiving ironman permadeath.

---

## 📜 The Living Chronicle: Web-Exclusive Living Saga & AI Voice Matrix
*(Exclusive to the Web Client at `angband3d.com`)*

The classic dungeon crawl is transformed into an epic voiced chronicle. Angband 3D on the web integrates a state-of-the-art neural storytelling suite powered by Google Gemini and a procedural Web Audio acoustic chain:

```
+---------------------------------------------------------------------------------------+
|                                THE LIVING CHRONICLE                                   |
|                      Web-Exclusive Neural Narrative Engine                            |
+---------------------------------------------------------------------------------------+
                                           |
    +------------------+-------------------+-------------------+------------------+
    |                  |                   |                   |                  |
    v                  v                   v                   v                  v
+--------------+ +-------------------+ +-------------------+ +--------------+ +---------------+
| 30-Archetype | | Proximity Voice   | | Intelligent Flow  | | On-Demand    | | Hero Action   |
| Neural Audio | | Pre-Warming (0ms) | | Combat Governor   | | "🔮 Tale"    | | Sketches      |
+--------------+ +-------------------+ +-------------------+ +--------------+ +---------------+
| • Enceladus  | | • Background      | | • Non-intrusive   | | • Alt+T Hot- | | • Alt+K Hot-  |
| • Zephyr     | |   speculative     | |   skirmish pace   | |   key invoke | |   key invoke  |
| • Charon     | |   decoding        | | • Concise melee   | | • Contextual | | • 800×600     |
| • Fenrir     | | • Zero vocal lag  | |   strikes (<=80c) | |   depth &    | |   illuminated |
| • Gacrux     | |   on line-of-     | | • Epic celebration| |   wound lore | |   canvas      |
| • Bestiary   | |   sight trigger   | |   for boss kills  | | • Survival   | | • Exact gear  |
|   vocatives  | | • Instant barks   | | • No overlapping  | |   counsel    | |   depiction   |
+--------------+ +-------------------+ +-------------------+ +--------------+ +---------------+
```

### 🎙️ 30-Archetype Realm-Bound Voice Matrix
Every realm possesses its own distinct literary narrator and creature vocal ecology:
* **Vanilla Angband**: Narrated by **Enceladus** (a resonant, scholarly Old English Tolkienian voice) and **Zephyr**.
* **Sil-Q**: Narrated by **Charon** (a stark, haunting First Age chronicler) and **Despina**, perfectly capturing the doomed grandeur of Beleriand.
* **FrogComposBand**: Narrated by **Fenrir** (a mythic, boisterous skald) and **Kore**, attuned to the chaotic multiverse.
* **Hengband**: Narrated by **Gacrux** (a grave, dignified Eastern feudal storyteller) and **Sulafat**.
* **Encounter Vocatives**: Distinct neural vocal textures for beasts, orc raiders, undead wights, high-tier fiends, and elder dragons.

### ⚡ Proximity Speculative Pre-Warming (Zero-Latency Audio)
Nothing breaks immersion faster than waiting for an audio file to load after a monster ambushes you:
* As hostile creatures move through the corridors, the web client detects proximity in the background and speculatively pre-fetches and decodes their neural audio buffers before you even see them.
* The exact millisecond a creature enters your torchlight or line of sight, its vocalization plays with **zero perceptible latency (0ms lag)**.

### 🛡️ Non-Intrusive Combat Flow Governor
Dungeon combat is fast and perilous; narrators should never get you killed:
* Routine melee exchanges remain brief and punchy ($\le 80$ characters).
* Catch-up messages are aggregated cleanly without audio overlap ($\le 150$ characters).
* Narrow escapes, legendary artifact discoveries, and boss triumphs receive full, dramatic narrative delivery ($> 90$ characters).

### 🔮 On-Demand Contextual Saga Prompt (`Alt+T`)
Need guidance or desire an epic retelling of your current situation? Tap the **"🔮 Tale"** button in the HUD or Tome deck (or press `Alt+T`):
* The AI engine reads your hero's exact character race, class, dungeon depth, remaining HP/SP, current gear, active wounds/blessings, and surrounding monsters.
* It weaves a personalized, realm-attuned saga passage providing deep immersion alongside tactical survival counsel tailored to the immediate danger.

### ⚖️ Non-Modal 3D Entity Popover, 4-Realm Story Architectures, Mythic Crossroads & Creature Parley
* **Zero-Focus-Steal 3D Inspection (`#entity-inspect-popover`, `popover="manual"`)**: Clicking any 3D creature or floor item opens a floating inspection card with `[🗣️ Converse in Tome]`, `[⚖️ Parley]`, and `[🕯️ Swear Vow]` actions while keeping 100% keyboard focus on dungeon movement and combat (`preemptForGameplay`).
* **4-Realm Literary Story Architectures**: Organizes your chronicle into realm-authentic divisions: *Books of the Siege of Angband* (`angband`), *Cantos of the Lay of Leithian* (`silq`), *Shadow Walks & Arcana Readings* (`frogcomposband`), and *Scrolls of the Five Rings* (`hengband`).
* **Interactive Mythic Crossroads & Parley**: Swear realm-specific oaths (`swearMythicVow`) that weave dynamic narrative consequence beats into your saga, or attempt in-character creature parley (`triggerCreatureParley`) while preserving 100% C-engine mechanical authority.

### 🎨 Masterwork Hero Action Sketches (`Alt+K`)
Capture your legend in living ink:
* Press `Alt+K` to generate an illuminated `800×600` canvas etching depicting your character at this exact turn.
* Accurately reflects your equipped weaponry (broadswords, sabers, staves, bows), worn armor, physical injuries (cuts, poison), and recent chronicle deeds in a high-resolution dark-fantasy aesthetic.

### 🔊 Gemini 3.8 TTS `speech_metadata`, Prosodic Continuity & Procedural Web Audio
* **Official Gemini 3.8 TTS `speech_metadata` Architecture**: Sustained voice personas and emotional delivery instructions are routed strictly via `speech_metadata.style` on `gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts` while keeping transcripts 100% clean, paired with single-utterance neural synthesis ($\le 240$ chars) to prevent mid-passage voice resets.
* **Rolling Story-Thread Continuity (`recentStoryThread`)**: Every Chronicle chapter and `"🔮 Tale"` passage tracks prior chapter openings and forbids repeating 3-word sentence prefixes or redundant depth tags (`"at 50ft"`), ensuring a continuous literary saga with zero repetitive filler.
* **Zero-Robotic Fallbacks**: Angband 3D strictly prohibits robotic browser `window.speechSynthesis` voices; all audio flows through a dedicated Web Audio chain (`DynamicsCompressorNode`, stereo panning, and distance attenuation).


---

## 📱 Play Instantly: Cross-Platform Matrix

| Feature / Client | Web Client (`angband3d.com`) | Native Desktop (Godot 4 C#) | Android Standalone APK | Desktop WebView2 (.NET 8) |
|---|---|---|---|---|
| **Direct Access** | **[Play in Browser](https://angband3d.com)** | **[Download .zip](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Windows-x64.zip)** | **[Download .apk](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Android.apk)** | **[Build from Source](desktop)** |
| **Target Platform** | Any Web Browser (PC, Mac, Mobile) | Windows x64 PC | Android 14+ Phones & Tablets | Windows x64 PC |
| **Graphics Pipeline** | Three.js WebGL / PBR Shading | Godot 4.3+ .NET 8 (Vulkan / D3D12) | WebGL / Capacitor Accelerated | Edge Chromium Engine |
| **Target Framerate** | 60 FPS VSync | **144+ FPS Unlocked** | 60 FPS Battery-Optimized | 60 FPS VSync |
| **Offline Playability** | Offline via PWA / Local Worker | **100% Offline Standalone** | **100% Offline Standalone** | **100% Offline Standalone** |
| **Authoritative Engines**| 4 Realms (Vanilla, Sil-Q, FCB, Heng) | 4 Realms via local `stdio` | 4 Realms via local binaries | 4 Realms via local process |
| **Universal Movable HUD**| ✅ Full Touch & Mouse Drag | ✅ Contextual HUD | ✅ Responsive Split-Thumb | ✅ Full Mouse Drag |
| **Savegame Portability** | ✅ 1-Click Export/Import | ✅ Native File Disk | ✅ 1-Click Export/Import | ✅ Native File Disk |
| **Voiced Living Chronicle**| ✅ **Full Gemini Neural Suite** | ➖ Offline Engine Purity | ➖ Offline Engine Purity | ✅ Full Gemini Neural Suite |

---

## ⌨️ Controls Reference

| Action | Desktop Key | Mobile Touch Control |
|---|---|---|
| **Turn Camera 90° (0-Turn)** | `Arrow Left` / `Right` | `Turn ↶` / `↷` Buttons |
| **Move Forward / Backward** | `Arrow Up` / `Down` | D-Pad `▲` / `▼` |
| **Strafe Left / Right** | `Numpad 4` / `6` | Strafe `⇦` / `⇨` |
| **Diagonal Movement** | `Numpad 7 / 9 / 1 / 3` | Diagonal `↖ ↗ ↙ ↘` |
| **Attack Adjacent / Wait / Hold**| `Space` *(or `,` / Numpad 5)* | `Attack / Wait (⚔)` |
| **Quaff Potion** | `q` | `Potion (🧪)` |
| **Read Scroll** | `r` | `Scroll (📜)` |
| **Cast Spell / Sing Song** | `m` / `p` | `Cast (✨)` |
| **Fire Ranged Weapon** | `f` | `Shoot (🏹)` |
| **Pick Up Floor Item** | `g` | `Get (💎)` |
| **Open Door / Chest** | `o` | `Door (🚪)` |
| **Use Staircase (Descend/Ascend)**| `>` / `<` | `Descend (⬇)` / `Ascend (⬆)` |
| **Inventory / Equipment** | `i` / `e` | `Pack (🎒)` / `Gear (🛡)` |
| **Rest to Full HP/Mana** | `R` | `Rest (⏳)` |
| **Toggle CRT Monospace View** | `Tab` | `Classic (📜)` |
| **2D Full Tactical Map** | `Shift + M` | `Map (🗺)` |
| **Living Chronicle / Tome** | `Alt + T` *(Tale)* / `Alt + K` *(Sketch)* | `Tome (📖)` |
| **Smooth First-Person Look** | `Mouse Drag` | Touch Drag on 3D View |
| **Pause Menu, Saves & Settings** | `Escape` | `Menu (⚙)` |

---

## 🌍 The Open Source Hooks & Architecture

Angband 3D is not a walled garden. It is an **open architecture and educational reference** illustrating how classic terminal-based software can be elevated to modern graphic standards without breaking upstream backward compatibility.

```
                        +------------------------------------+
                        |   Authoritative C/C++ Engines      |
                        |   Vanilla 4.2.6 • Sil-Q 1.5.0      |
                        |   FrogComposBand • Hengband 3.0    |
                        +------------------------------------+
                                           |
                              main-bridge.c / main-bridge.cpp
                                   JSON Wire Emitter
                                           |
                       +-------------------+-------------------+
                       |                                       |
                 stdio / Pipes                           stdio / Pipes
                       |                                       |
              client/ (Godot 4 C#)                   server/src/server.js (Node.js)
           +-----------------------+                 +----------------------------+
           | Native Desktop Host   |                 | Cloud Session Multiplexer  |
           | Direct Binary Stdio   |                 | Stdio Subprocess Pool      |
           | Unlocked 144+ FPS     |                 +----------------------------+
           +-----------------------+                               |
                                                             WebSocket JSON
                                                                   |
                                                     server/public/ (Three.js WebGL)
                                                     +----------------------------+
                                                     | Universal Web / Mobile App |
                                                     | Movable HUD • Living Tome  |
                                                     +----------------------------+
```

### 1. The ~200-Line C Bridge Pattern
Classic roguelikes are uniquely suited to 3D decoupling because their game loops are strictly turn-based. Inside `engine/src/main-bridge.c` and `variants/*-src/src/main-bridge.*`, the engine integration hook follows a simple, repeatable blueprint:
1. **Intercept the Blocking Key Input Loop**: Replace `cgetc()` or `Term_inkey()` with a non-blocking `stdin` JSON line parser.
2. **Emit the Dual-Channel Frame**: On every turn tick, serialize:
   - **Structured Telemetry**: Player coordinates `(px, py)`, dungeon depth, HP, SP, speed, visible monsters, ground items, light radii, and combat messages.
   - **Monospace 80×24 Character Buffer**: The exact character glyph and color matrix representing the authentic terminal.
3. **Execute Dispatched Action Tokens**: Convert incoming JSON command tokens back into native engine keycodes without altering game logic.

> 📚 **Read the Complete Engine Porting Guide**: See [`docs/GENERIC_ENGINE_INTEGRATION.md`](docs/GENERIC_ENGINE_INTEGRATION.md) for how to adapt *NetHack*, *Moria*, *Dungeon Crawl Stone Soup (DCSS)*, *ADOM*, or *IVAN* into first-person 3D using this exact bridge!

### 2. The Clean JSON Wire Protocol
All communication between authoritative engines and graphical frontends is strictly standardized and documented in [`docs/PROTOCOL.md`](docs/PROTOCOL.md). 

Want to build your own Angband 3D client in **Unreal Engine 5**, **Unity**, **Bevy**, **Raylib**, or **Virtual Reality (OpenXR)**? You never need to touch C compilation or game logic—simply connect to the engine process over `stdio` or WebSockets and render incoming JSON state frames.

### 3. Permissive, Fully Open Assets
Every asset in Angband 3D adheres strictly to permissive, open-source licensing:
* **Core Code & Engines**: GNU General Public License v2 (GPL-2.0).
* **Photogrammetry 3D Models & PBR Textures**: CC0 1.0 Universal Public Domain Dedication (**Poly Haven**, **KayKit**, **Kenney**, **Quaternius**).
* **Hand-Painted Creature & Item Atlases**: Master fantasy pixel art by **Raymond "Shockbolt" Gaustadnes** and the Angband Development Team (GPL-2.0).
* **Typography**: SIL Open Font License 1.1 (*Cinzel*, *Outfit*, *Fira Code*).
* See [`CREDITS.md`](CREDITS.md) for full licensing details and asset citations.

---

## 🛠️ Developer Quick Start & Self-Hosting

You can compile, test, and run the entire Angband 3D stack locally in seconds.

### Prerequisites
* **Node.js** (v18+) & **Python** (3.8+)
* **GCC / Clang + CMake** (for compiling the native C engines)
* **.NET 8 SDK & Godot 4.3+ Mono** *(Optional, only needed for compiling the native desktop client)*

### 1. Run the Web Edition Locally (30 Seconds)
```bash
# Clone the repository
git clone https://github.com/ThunderbearStudios/angband3d.git
cd angband3d

# Build all 4 authoritative C/C++ engines (Windows PowerShell)
.\build.cmd

# (On Linux / macOS: mkdir -p engine/build && cd engine/build && cmake .. -DSUPPORT_BRIDGE_FRONTEND=ON && make -j$(nproc) && cd ../..)

# Install server dependencies and launch
cd server
npm install
npm start
```
Open **`http://localhost:8080`** in your browser to play immediately.

### 2. Run the Native Godot C# Desktop Client
```powershell
# From the repository root
dotnet build client/angband3d.csproj
.\play.cmd
```

### 3. Run Automated Validation & Quality Gates
Angband 3D maintains strict automated test suites across all layers:
```bash
# Fast Contract & Invariant Gate (29/29 test suites in < 15 seconds)
node tools/run_tests.js --tier fast

# C Engine Bridge Smoke Test (11/11 handshake, save/load & birth tests)
python tools/smoke_test.py

# End-to-End Cross-Realm Browser Tests
node tools/run_tests.js --tier e2e

# Real Chrome Browser CDP Test (Full 4-realm boot & 3D play verification)
node tools/run_tests.js --tier cdp
```

### 4. Deploy Your Own Cloud Server (Docker / Cloud Run)
Angband 3D is 100% containerized and self-hostable. Deploy to Google Cloud Run in minutes:
```bash
# Build and submit the container
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/angband3d-cloud:latest .

# Deploy to Cloud Run with WebSocket support
gcloud run deploy angband3d-cloud \
  --image gcr.io/YOUR_PROJECT_ID/angband3d-cloud:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```
See [`docs/CLOUD_DEPLOYMENT.md`](docs/CLOUD_DEPLOYMENT.md) for full production deployment instructions.

---

## 🤝 An Open Invitation: Join the Fellowship

Angband 3D is a living, community-driven project dedicated to the celebration and preservation of classic roguelikes. There are countless exciting ways to contribute:

* 🎨 **3D Artists & Animators**: Help expand our library of CC0 photogrammetry dungeon props, low-poly creature rigs, and medieval weaponry.
* ⚔️ **Roguelike Devs**: Port your favorite classic roguelike (*NetHack*, *Moria*, *DCSS*, *ADOM*, *IVAN*) into 3D using our bridge architecture.
* 🎧 **Audio Designers**: Craft new procedural Web Audio synthesis algorithms or atmospheric dungeon acoustic presets.
* 🌐 **Frontend Hackers**: Build an alternate frontend in Unreal Engine, Unity, Bevy, or WebGPU!

Check out our [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) guide and open an issue or pull request!

---

## 📖 Complete Technical Documentation Index

* 📡 **[Wire Protocol Specification (docs/PROTOCOL.md)](docs/PROTOCOL.md)**: Full JSON specification for the C engine dual-stream event protocol.
* 🏛️ **[System Architecture (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)**: Multi-realm process isolation, Godot scene graph, and Three.js coordinate mapping.
* 🧠 **[Best Practices & Lessons Learned (docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md)](docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md)**: 34 master project invariants (`L1–L34`), GPU memory management, and anti-trap guidelines.
* 🗺️ **[Generic Engine Integration Guide (docs/GENERIC_ENGINE_INTEGRATION.md)](docs/GENERIC_ENGINE_INTEGRATION.md)**: Step-by-step blueprint for porting classic ASCII engines into 3D.
* 💾 **[Save System & Universal Persistence (docs/SAVE_SYSTEM.md)](docs/SAVE_SYSTEM.md)**: Binary save formats, cloud storage, and cross-platform portability.
* 🎨 **[Hybrid Graphics Master Plan (docs/HYBRID_GRAPHICS_MASTER_PLAN.md)](docs/HYBRID_GRAPHICS_MASTER_PLAN.md)**: 4096 HD atlases, normal mapping, biomes, and lore audit proofs.
* ☁️ **[Cloud Deployment Guide (docs/CLOUD_DEPLOYMENT.md)](docs/CLOUD_DEPLOYMENT.md)**: Production deployment on Google Cloud Run, session affinity, and process pool architecture.
* 🤝 **[Contributing Guide (docs/CONTRIBUTING.md)](docs/CONTRIBUTING.md)**: Contribution guidelines and asset integration recipes.

---

## ⚖️ Legal Notices, Trademarks & Non-Commercial Policy

**Angband 3D** is an independent, non-commercial, open-source fan project created out of deep reverence for classic roguelikes and high fantasy literature.

* **Literary Inspiration**: The setting, lore, and names draw inspiration from the literary legendarium created by **J.R.R. Tolkien**.
* **Trademarks**: *The Lord of the Rings*, *The Hobbit*, *Middle-earth*, *Angband*, and *Moria* are trademarks or registered trademarks of **Middle-earth Enterprises, LLC** (Embracer Group AB) and/or **The Tolkien Estate**. This project is not affiliated with, endorsed by, or sponsored by Middle-earth Enterprises or The Tolkien Estate.
* **Strict Non-Commercial Policy**: Angband 3D is 100% free software. It contains **no advertisements, no microtransactions, no paywalls, and accepts no donations or commercial sponsorship**.
* **Commercial Studio vs. Open-Source Proving Ground Scope**: While the **Angband 3D** game showcase is strictly non-commercial (`GPL-2.0`), **[Thunderbear Studios](https://thunderbearstudios.dev)** is an independent commercial software and applied AI product studio. The underlying reusable studio frameworks demonstrated by this architecture—including **Thunderbear Code Guard™**, **Resonant Cloud Memory Engine™**, and the **Universal C/C++ to Cloud, 3D & Audio Bridge™**—along with our commercial SaaS and pro-audio/DMX product lines, are proprietary commercial products owned by Thunderbear Studios.
* **Open Source Licensing**:
  * Authoritative game engines: **GNU General Public License v2** (GPL-2.0) across **Angband 4.2.6**, **Sil-Q 1.5.0**, **FrogComposBand 7.1.1**, and **Hengband 3.0.1**. Source code is included in full. Full terms in [`LICENSE`](LICENSE) and [`LEGAL.md`](LEGAL.md).
  * 3D Models & PBR Textures: Permissive **CC0 1.0 Universal** public domain dedications (**Poly Haven**, **KayKit**, **Kenney**, **Quaternius**).
  * Monster & Item Pixel Art: Raymond "Shockbolt" Gaustadnes and the Angband Development Team (GPL-2.0 / Angband Open Source License).
  * Fonts: SIL Open Font License 1.1. Full credits in [`CREDITS.md`](CREDITS.md).

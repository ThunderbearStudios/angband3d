# Angband 3D

> **A 35-year-old C codebase meets modern 3D: Preserving roguelike history through high-performance engine decoupling.**

[![Play Online in Browser](https://img.shields.io/badge/Play_Online-angband3d.com-gold?style=for-the-badge&logo=googlechrome)](https://angband3d.com)
[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-blue.svg)](LICENSE)
[![Engine: Angband 4.2.6](https://img.shields.io/badge/Engine-Angband_4.2.6-darkgreen.svg)](https://github.com/angband/angband)
[![Web Client: Three.js WebGL](https://img.shields.io/badge/Web_Client-Three.js_WebGL-orange.svg)](server/public)
[![Desktop Client: Godot 4.3+ .NET](https://img.shields.io/badge/Desktop_Client-Godot_4.3+_.NET_8-blueviolet.svg)](https://godotengine.org/)
[![Tome: Companion Chronicle](https://img.shields.io/badge/Tome-Companion_Chronicle-gold.svg)](#8-the-adventure-tome--companion-chronicle)
[![Smoke Tests: 11/11 Passing](https://img.shields.io/badge/Smoke_Tests-11%2F11_Passing-success.svg)](tools/smoke_test.py)
[![Integration Tests: Passing](https://img.shields.io/badge/Integration_Tests-Passing-success.svg)](tools/test_queue_and_minimap.js)

---

## 🎮 Play Instantly (Zero Install & Downloads)

* **Web Edition (Desktop & Mobile)**: 👉 **[https://angband3d.com](https://angband3d.com)**  
  *(Cloud Run Mirror: [https://angband3d-cloud-iuawf47jqa-uc.a.run.app](https://angband3d-cloud-iuawf47jqa-uc.a.run.app))*  
  Runs directly in Chrome, Safari, Edge, or Firefox across PC, Mac, iPad, iPhone, and Android with zero installation. Supports mouse/keyboard, touch D-pad, and gamepads.
* **Standalone Windows PC Desktop**: Download the pre-packaged **[Angband3D-Windows-x64.zip](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Windows-x64.zip)** for 60+ FPS, zero-latency offline native play.
* **Standalone Android App (.APK)**: Download the offline **[Angband3D-Android.apk](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Android.apk)** for phones and tablets (Target SDK 34, Android 14+).

> ⚠️ **A Humble Note on Server Traffic & Community Play**:  
> The live web client at `angband3d.com` is hosted on a modest, self-funded Google Cloud Run instance with an automated 50-player concurrency cap. If a traffic wave hits and you experience a queue or connection wait time, **we warmly encourage downloading the Standalone Windows PC or Android APK releases**! Standalone packages offload 100% of compute to your local device, run completely offline, and require zero cloud connectivity.

> 💾 **100% Universal Save Game Portability (Play Your Way)**:  
> Angband 3D preserves authentic binary `SaveVNLA` file structure. Your character savefiles (`.sav`) are completely interoperable across all platforms:
> - Dive during lunch in your desktop web browser.
> - Export your savefile with 1 click from the pause menu (`Esc`).
> - Drop it directly into your offline Windows Desktop client or continue your dungeon crawl on Android during your commute!
> - *(And yes—whether you embrace unforgiving ironman permadeath or choose to back up your save files to survive Morgoth's deepest vaults—you have full freedom to play the game your way.)*

---

## 💡 The Philosophy: Preservation Over Reimplementation

Classic roguelikes like *Moria* (1983) and *Angband* (1990) represent over three decades of iterative balance, complex item generation algorithms, tactical monster AI, and emergent dungeon ecology. 

Most modern attempts to bring classic roguelikes into 3D make a fatal mistake: **they rewrite the game from scratch**. In doing so, they inadvertently discard 35 years of battle-tested game logic, resulting in shallow action-RPG clones that lack the mathematical depth and punishing tactical rigor of the original.

**Angband 3D takes the opposite approach**:
* The entire game engine remains the authoritative, unmodified **Angband 4.2.6 C codebase**.
* Every monster roll, artifact curse, dungeon vault, saving throw, and pseudo-random seed is running pure upstream C logic.
* Presentation is completely decoupled from mechanics via a high-speed, zero-allocation C JSON bridge (`-mbridge`).
* The player experiences *Dungeon Master*-style 3D immersion, but every single tactical rule and turn-based mechanic remains 100% faithful to Angband.

---

## 🏛️ System Architecture

Angband's venerable terminal display architecture is bridged into a reactive event stream that drives two distinct 3D frontends:

```
                        +------------------------------------+
                        |     Upstream Angband 4.2.6 C       |
                        |     Mechanics, RNG, DGN, Saves     |
                        +------------------------------------+
                                           |
                                engine/src/main-bridge.c
                                JSON Bridge Term (-mbridge)
                                           |
                      +--------------------+--------------------+
                      |                                         |
                stdio / IPC                               stdio / IPC
                      |                                         |
             client/ (Godot 4 C#)                     server/src/server.js (Node.js)
          +-----------------------+                   +----------------------------+
          | Native Desktop Host   |                   | Cloud Session Supervisor   |
          | Direct Stdio Pipe     |                   | Isolated Process Pool      |
          | Windows x64 Standalone|                   +----------------------------+
          +-----------------------+                                 |
                                                              WebSocket JSON
                                                                    |
                                                      server/public/ (Three.js WebGL)
                                                      +----------------------------+
                                                      | Universal Web / Mobile App |
                                                      | Touch D-Pad, Responsive UX |
                                                      | Zero Install in Browser    |
                                                      +----------------------------+
```

### The Dual-Stream Protocol
On every turn or UI interaction, the C bridge emits two synchronized channels:
1. **Structured Game State**: Strongly typed telemetry covering player vitals, dungeon depth, grid-relative FOV, visible monster entities, ground items, active light radii, and combat feedback banners.
2. **Raw 80x24 Terminal Stream**: An authentic monospace character matrix capturing Angband's character birth sequence, town stores, inventory menus, and targeting prompts.

---

## 🌟 Technical Highlights & Architectural Patterns

This project was built as an open architectural reference for how classic terminal codebases can be modernized into rich 3D experiences. Here are the core patterns worth leveraging:

### 1. Solving the 3D Turn-Based Dilemma (The Camera Invariant)
In a 2D roguelike, looking in a direction is indistinguishable from moving. In first-person 3D, however, forcing a turn tick every time the camera moves feels unplayable, while making it real-time destroys the game mechanics.
* **The Solution**: Client-side camera yaw, pitch, and mouse look are **instantaneous and cost 0 game turns**.
* Only translational steps (`Forward`, `Backward`, `Strafe`, `Wait`, `Attack`) dispatch an input token to the C engine, consuming an authoritative Angband game turn.
* Monsters only step or strike when you take a turn, preserving pure turn-based tactical deliberation.

### 2. Dynamic Physical Height Scaling (Perspective Mechanics)
In Angband, rolled character race and physical height (e.g., a 36-inch Hobbit vs. a 104-inch Half-Troll) were historically just numbers on an ASCII character sheet.
* In Angband 3D, **height dynamically scales the entire physical 3D world**:
  * **Halflings & Gnomes (~36–44")**: Camera eye height drops to ~0.95m with an 86° FOV. You physically look upward at stone archways and towering trolls, instilling subterranean dread.
  * **Humans & Elves (~68–76")**: Standard balanced dungeon eye height (~1.68m).
  * **Half-Trolls & High-Elves (~84–104")**: Commanding eye height (~2.15m) peering down corridors from near the ceiling rafters.
* First-person viewmodel hands, reaching distances, weapon scaling, and footstep acoustic pitch all modulate dynamically with character stature and mass.

### 3. Procedural Anatomical Creature Rigs
Angband features hundreds of bizarre, non-humanoid monsters (Quylthulgs, floating eyes, hydras, slimes, giant lice, centipedes, creeping coins). 
* To prevent awkward static T-poses when 3D skeletal assets are unavailable, the client includes an **anatomical procedural geometry engine**:
* Undulating segmented centipedes, flapping bat wings, pulsing eye nuclei, skittering insect legs, and gelatinous slime shaders are synthesized on the fly.
* Creature tokens interpolate smoothly across tiles and turn to face the player when adjacent.

### 4. Zero-Asset Procedural Audio (Mathematical Sound Synthesis)
Instead of shipping gigabytes of bloated audio samples or risking copyrighted sound effects:
* **100% Procedural Foley**: Audio is dynamically generated in real-time via the Web Audio API (`server/public/js/audio.js`) and dynamic 16-bit PCM generators in C# (`client/scripts/AudioManager.cs`).
* **Physical Models**:
  * *Blade Crits & Clangs*: Euler-Bernoulli bar mode transients with high-frequency ricochets.
  * *Quaffing Potions*: Granular fluid turbulence simulation.
  * *Reading Scrolls*: Resonant harmonic chimes modulated by fibrous friction noise.
  * *Monster Grunts*: Vocal tract formant resonators with guttural low-frequency growls.

### 5. Seamless Classic Monospace Overlay
Whenever complex interaction is needed (rolling stats at birth, browsing inventory `i`, or purchasing goods in the Alchemy Shop), the game seamlessly overlays an authentic 80x24 monospace terminal.
* You never lose the classic Angband interface muscle memory.
* The terminal canvas supports mouse wheel zoom and smooth panning on desktop, and two-finger pinch-to-zoom on mobile, strictly isolated so gesture navigation never triggers accidental in-game commands.

### 6. Robust Mobile & Tablet Touch Architecture
* **Split-Thumb Layout**: Left thumb controls an 8-way directional D-pad; right thumb controls an adaptive action cluster (`Attack`, `Cast`, `Potion`, `Pack`, `Stairs`, `More`).
* **Synthetic Click Suppression**: Strict timing suppression (<500ms post-touch) prevents duplicate input dispatches across mobile Safari and Chrome.
* **Contextual Prompt Ribbon**: Character birth menus, store transactions, and Yes/No/Quantity prompts automatically map to tactile one-tap buttons.

### 7. Universal Binary Save Portability (`SaveVNLA` Everywhere)
* **Zero Format Fragmentation**: Every platform (WebAssembly IDBFS, native Windows Godot desktop, Capacitor Android APK, and upstream Unix terminal Angband) produces and consumes identical byte-for-byte `SaveVNLA` binary savefiles.
* **Frictionless Portability**: Export your hero with a single click from the web pause menu (`Esc` -> `Export Save`), load it into your native desktop client for 120 FPS boss fights, or import it to Android for travel.
* **Play Your Way**: Permadeath purists can play with strict ironman finality, while explorers learning Angband's punishing 5000ft dungeon mechanics can back up and duplicate character files freely.

### 8. The Adventure Tome &amp; Companion Chronicle
Angband 3D includes an optional in-game companion chronicle that documents your dungeon descent in real time:
* **Adaptive Literary Saga**: Translates player turns, combat blows, store visits, and vault discoveries into narrative prose attuned to your adventurer's heritage (Men, Elves, or Dwarves).
* **Optional Voice Narration & Audio Deck**: Integrated speech synthesis deck with full playback controls, customizable narration speeds, and independent volume mixing.
* **In-Game Lorekeeper & Chronicle Export**: Diegetic in-character gameplay tips, monster lore, and 1-click standalone HTML story exports to preserve your character's heroic journey or solemn death requiem.

---

## ⌨️ Controls Reference

| Action | Desktop Key | Mobile Touch Control |
|---|---|---|
| **Turn Camera 90°** | `Arrow Left` / `Right` | `Turn ↶` / `↷` Buttons |
| **Move Forward / Backward** | `Arrow Up` / `Down` | D-Pad `▲` / `▼` |
| **Strafe Left / Right** | `Numpad 4` / `6` | Strafe `⇦` / `⇨` |
| **Diagonal Movement** | `Numpad 7 / 9 / 1 / 3` | Diagonal `↖ ↗ ↙ ↘` |
| **Attack Adjacent / Wait** | `Space` *(or Numpad 5)* | `Attack / Wait (⚔)` |
| **Quaff Potion** | `q` | `Potion (🧪)` |
| **Read Scroll** | `r` | `Scroll (📜)` |
| **Cast Spell / Prayer** | `m` / `p` | `Cast (✨)` |
| **Fire Ranged Weapon** | `f` | `Shoot (🏹)` |
| **Pick Up Floor Item** | `g` | `Get (💎)` |
| **Open Door / Chest** | `o` | `Door (🚪)` |
| **Use Staircase** | `>` / `<` | `Descend (⬇)` / `Ascend (⬆)` |
| **Inventory / Equipment** | `i` / `e` | `Pack (🎒)` / `Gear (🛡)` |
| **Rest to Full HP/Mana** | `R` | `Rest (⏳)` |
| **Toggle Monospace Terminal**| `Tab` | `Classic (📜)` |
| **2D Full Tactical Map** | `Shift-M` | `Map (🗺)` |
| **Minimap Radar Zoom** | `+` / `-` | Minimap `+` / `-` |
| **Smooth First-Person Look**| `Mouse Drag` | Touch Drag on 3D View |
| **In-Game Menu & Saves** | `Escape` | `Menu (⚙)` |

---

## 🛠️ Replication & Developer Quick Start

You can build, test, and run the entire Angband3D stack locally with minimal effort.

### Prerequisites
* **Node.js** (v18+) & **Python** (3.8+)
* **GCC / Clang + CMake** (for compiling the C engine)
* **.NET 8 SDK & Godot 4.3+ Mono** *(Optional, only needed for editing the native desktop client)*

### 1. Run the Web Edition Locally (30 Seconds)
```bash
# Clone the repository
git clone https://github.com/ThunderbearStudios/angband3d.git
cd angband3d

# Build the headless C engine (Windows PowerShell)
.\build.cmd

# (On Linux / macOS: mkdir -p engine/build && cd engine/build && cmake .. -DSUPPORT_BRIDGE_FRONTEND=ON -DSUPPORT_GCU_FRONTEND=ON && make -j$(nproc) && cd ../..)

# Install server dependencies and launch
cd server
npm install
npm start
```
Open **`http://localhost:8080`** in your browser to play immediately.

### 2. Run the Native Desktop Godot Client
```powershell
# From the root repository directory
.\build.cmd
dotnet build client/angband3d.csproj
.\play.cmd
```

### 3. Run Automated Validation & Smoke Tests
```bash
# 1. Engine JSON Bridge Verification (11/11 tests checking save/load, birth, IPC)
python tools/smoke_test.py

# 2. Server & Web Client Integration Tests
cd server && npm test

# 3. Native Client Compilation Check
dotnet build client/angband3d.csproj
```

---

## 🏛️ Invariants & Core Design Rules

Contributors and developers adapting this architecture should adhere to these core invariants:
1. **Engine Rebasability**: Upstream Angband 4.2.6 C code in `engine/` is never modified in its game mechanics, tables, or RNG. All bridge code is strictly encapsulated in `engine/src/main-bridge.c` and `engine/src/bridge-json.c`.
2. **Zero-Turn Freelook**: Camera rotation must never dispatch commands or advance game turns.
3. **Touch Viewport Isolation**: Pinching, zooming, or panning inside the terminal canvas controls the viewport only; it never dispatches game keystrokes.
4. **Non-Commercial Integrity**: The project strictly prohibits any monetization, advertisements, paid tiers, or donation requests.

---

## 📖 In-Depth Technical Documentation

For developers interested in the deep architectural details:
* 📡 **[Wire Protocol Specification (PROTOCOL.md)](docs/PROTOCOL.md)**: Full specification of the JSON IPC format between engine and frontends.
* 🏛️ **[Client Architecture (ARCHITECTURE.md)](docs/ARCHITECTURE.md)**: Godot C# scene graph and Three.js WebGL coordinate mappings.
* 🧠 **[Best Practices & Lessons Learned (BEST_PRACTICES_AND_LESSONS_LEARNED.md)](docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md)**: Edge cases, memory safeguards, pipe deadlock prevention, and lessons learned.
* 💾 **[Save System & Cross-Play (SAVE_SYSTEM.md)](docs/SAVE_SYSTEM.md)**: Binary `SaveVNLA` state preservation and cloud persistence.
* 🎨 **[Graphics & Shaders Handover (GRAPHICS_HANDOVER.md)](docs/GRAPHICS_HANDOVER.md)**: PBR materials, biomes, and kinetic VFX blueprints.
* ☁️ **[Cloud Deployment Guide (CLOUD_DEPLOYMENT.md)](docs/CLOUD_DEPLOYMENT.md)**: Google Cloud Run setup, session affinity, and queue architecture.

---

## ⚖️ Legal Notices, Trademarks & Non-Commercial Policy

**Angband 3D** is an independent, non-commercial, open-source fan tribute created out of love for classic roguelikes and fantasy literature.

* **Literary Inspiration**: The setting, lore, and names draw inspiration from the literary legendarium created by **J.R.R. Tolkien**.
* **Trademarks**: *The Lord of the Rings*, *The Hobbit*, *Middle-earth*, *Angband*, and *Moria* are trademarks or registered trademarks of **Middle-earth Enterprises, LLC** (Embracer Group AB) and/or **The Tolkien Estate**. This project is not affiliated with, endorsed by, or sponsored by Middle-earth Enterprises or The Tolkien Estate.
* **Strict Zero-Monetization Policy**: The game is 100% free. It contains **no ads, no microtransactions, no paywalls, and accepts no donations or commercial sponsorship**.
* **Licensing**:
  * Core engine and derivative work: **GNU General Public License, Version 2** (GPL-2.0). Complete source code is available in this repository. Full terms in [`LICENSE`](LICENSE) and [`LEGAL.md`](LEGAL.md).
  * 3D Art & Textures: Permissive **CC0 1.0 Universal** public domain dedications (KayKit, Kenney, Quaternius).
  * Fonts: **SIL Open Font License 1.1** (Cinzel, Outfit, Fira Code).
  * Full asset credits and citations are detailed in [`CREDITS.md`](CREDITS.md).

# Angband 3D

> **A 35-year-old C codebase meets modern 3D: Preserving roguelike history through high-performance engine decoupling.**

[![Play Online in Browser](https://img.shields.io/badge/Play_Online-angband3d.com-gold?style=for-the-badge&logo=googlechrome)](https://angband3d.com)
[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-blue.svg)](LICENSE)
[![Engine: Angband 4.2.6](https://img.shields.io/badge/Engine-Angband_4.2.6-darkgreen.svg)](https://github.com/angband/angband)
[![Web Client: Three.js WebGL](https://img.shields.io/badge/Web_Client-Three.js_WebGL-orange.svg)](server/public)
[![Desktop Client: Godot 4.3+ .NET](https://img.shields.io/badge/Desktop_Client-Godot_4.3+_.NET_8-blueviolet.svg)](https://godotengine.org/)
[![Tome: Web Client Only](https://img.shields.io/badge/Tome_of_Knowledge-Web_Only-gold.svg)](#-platform-feature-matrix--the-tome-feature-scope)
[![Audit: 100% Lore Accurate](https://img.shields.io/badge/Lore_Audit-100%25_Passing_(624%2F624)-brightgreen.svg)](docs/MODEL_AND_SPRITE_LORE_AUDIT.md)
[![Vulnerabilities: 0](https://img.shields.io/badge/Vulnerabilities-0_Reported-success.svg)](server)
[![Smoke Tests: 11/11 Passing](https://img.shields.io/badge/Smoke_Tests-11%2F11_Passing-success.svg)](tools/smoke_test.py)

---

## 🌍 Open Source, Open Architecture, Open to All

**Angband 3D is 100% Free and Open Source Software (FOSS).**

We believe that classic game preservation thrives through open code, transparent architecture, and community empowerment. This repository is not merely a playable game—it is an **open blueprint** demonstrating how classic, terminal-based C roguelikes can be decoupled and transformed into immersive 3D experiences without rewriting a single rule of game mechanics or random number generation.

> ### 🤝 An Open Invitation to Creators, Modders & Roguelike Devs
> **Fork it. Mod it. Make it your own.**
> - **Build Your Own Frontend**: Use our clean JSON wire protocol ([`docs/PROTOCOL.md`](docs/PROTOCOL.md)) to craft a client in Unreal Engine, Unity, Bevy, Raylib, or VR.
> - **Bridge Other Classic Roguelikes**: Adapt our ~200-line C bridge architecture ([`docs/GENERIC_ENGINE_INTEGRATION.md`](docs/GENERIC_ENGINE_INTEGRATION.md)) to bring *NetHack*, *Moria*, *Dungeon Crawl Stone Soup (DCSS)*, *ADOM*, *IVAN*, or *Sil* into first-person 3D!
> - **Add Custom 3D Art & Assets**: Follow our simple drop-in asset recipe ([`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)) to add CC0 3D models, textures, animations, or acoustic soundscapes.
> - **Host Your Own Cloud Server**: Deploy your own private web instance with Docker or Google Cloud Run in under five minutes ([`docs/CLOUD_DEPLOYMENT.md`](docs/CLOUD_DEPLOYMENT.md)).

---

## 🎮 Play Instantly (Web & Standalone Downloads)

* **Web Edition (Desktop & Mobile)**: 👉 **[https://angband3d.com](https://angband3d.com)**  
  *(Cloud Run Mirror: [https://angband3d-cloud-iuawf47jqa-uc.a.run.app](https://angband3d-cloud-iuawf47jqa-uc.a.run.app))*  
  Runs directly in Chrome, Safari, Edge, or Firefox across PC, Mac, iPad, iPhone, and Android with zero installation. Features full mouse/keyboard look, responsive touch D-pad, and the **exclusive Adventure Tome / Living Chronicle**.
* **Standalone Windows PC Desktop**: Download **[Angband3D-Windows-x64.zip](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Windows-x64.zip)** for 144+ FPS, zero-latency offline native play powered by Godot 4 .NET C#.
* **Standalone Android App (.APK)**: Download **[Angband3D-Android.apk](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Android.apk)** for phones and tablets (Target SDK 34, Android 14+).

> ⚠️ **Server Concurrency & Offline Play**:  
> The live web instance at `angband3d.com` is hosted on a modest, self-funded Google Cloud Run instance with an automated 50-player concurrency cap. If a traffic wave hits, we warmly encourage downloading the **Standalone Windows PC** or **Android APK** releases! Standalone packages offload 100% of compute to your local device, run completely offline, and require zero cloud connectivity.

> 💾 **100% Universal Save Game Portability (`SaveVNLA` Everywhere)**:  
> Angband 3D preserves authentic binary `SaveVNLA` structure. Your character savefiles (`.sav`) are completely interoperable across all platforms:
> - Dive during lunch in your desktop web browser.
> - Export your savefile with 1 click from the pause menu (`Esc` -> `Export Save`).
> - Drop it directly into your offline Windows Desktop client or continue your dungeon crawl on Android during your commute!
> - *(Whether you embrace unforgiving ironman permadeath or back up your saves to survive Morgoth's deepest vaults, you have full freedom to play your way.)*

---

## 📊 Platform Feature Matrix & The Tome Feature Scope

To maintain absolute software purity, zero-dependency offline resilience, and optimal battery efficiency on mobile devices, features are purposefully scoped across platforms:

| Feature | Web Client (`angband3d.com`) | Native Desktop (Godot 4 C#) | Android APK (Mobile) |
|---|---|---|---|
| **Primary Platform** | Modern Web Browsers (PC / Mac / Mobile) | Windows x64 PC | Android 14+ Phones & Tablets |
| **Rendering Pipeline** | Three.js WebGL / PBR Shading | Godot 4.3+ .NET 8 (Vulkan / D3D12) | WebGL / Capacitor Hardware Acceleration |
| **Target Framerate** | 60 FPS VSync | 144+ FPS Unlocked | 60 FPS Battery-Optimized |
| **Offline Capability** | Offline via local Node / PWA | **100% Offline Standalone** | **100% Offline Standalone** |
| **Authoritative C Engine** | Child Process Pool / WebAssembly | Local Child Process (`stdio`) | Local Process / WebAssembly |
| **4096×4096 HD Atlases** | ✅ Included (Normal Mapped) | ✅ Included (High-DPI Bilinear) | ✅ Included (Hardware Compressed) |
| **De-fringed Silhouettes & CAS** | ✅ Included (0.35 Alpha Cutout) | ✅ Included (Alpha Scissor) | ✅ Included (0.35 Alpha Cutout) |
| **4-Level Biome Depth Chapters** | ✅ Included (Micro-formations) | ✅ Included (MultiMesh Materials) | ✅ Included (Micro-formations) |
| **3D Mesh Auto-Upgrade** | ✅ Included (27 Core Meshes) | ✅ Included (Rigged Humanoids) | ✅ Included (27 Core Meshes) |
| **Procedural DSP Audio** | ✅ Web Audio API Synthesizer | ✅ 16-bit PCM Generator | ✅ Web Audio API Synthesizer |
| **Touch Ergonomics & D-Pad** | ✅ Responsive Split-Thumb | ➖ Mouse & Keyboard Focus | ✅ Responsive Split-Thumb |
| **Universal Binary Saves** | ✅ Import / Export `SaveVNLA` | ✅ Native File Disk `SaveVNLA` | ✅ Export / Restore `SaveVNLA` |
| **📖 Adventure Tome & Chronicle** | ✅ **EXCLUSIVE TO WEB CLIENT** | ❌ **Excluded** (Offline Engine Purity) | ❌ **Excluded** (Offline Engine Purity) |

> 📌 **Note on The Adventure Tome**:  
> The **Adventure Tome / Living Chronicle** and Voiced Lorekeeper (`server/public/js/chronicle/`) are **strictly available on the Web Client**. Native Godot C# desktop and mobile clients deliberately omit this web-only narrative layer to maintain 100% offline self-containment, zero external network dependencies, and lightning-fast binary execution.

---

## 💡 The Philosophy: Preservation Over Reimplementation

Classic roguelikes like *Moria* (1983) and *Angband* (1990) represent over three decades of continuous balance, complex item generation algorithms, tactical monster AI, and emergent dungeon ecology. 

Most modern attempts to bring classic roguelikes into 3D make a fatal mistake: **they rewrite the game from scratch**. In doing so, they inadvertently discard 35 years of battle-tested game logic, resulting in shallow action-RPG clones that lack the mathematical depth and punishing tactical rigor of the original.

**Angband 3D takes the opposite approach**:
* The entire game engine remains the authoritative, unmodified **Angband 4.2.6 C codebase**.
* Every monster roll, artifact curse, dungeon vault, saving throw, and pseudo-random seed runs pure upstream C logic.
* Presentation is completely decoupled from mechanics via a high-speed, zero-allocation C JSON bridge (`-mbridge`).
* The player experiences *Dungeon Master*-style 3D immersion, but every single tactical rule and turn-based mechanic remains 100% faithful to Angband.

---

## 🏛️ System Architecture

Angband's venerable terminal display architecture is bridged into a reactive event stream that drives two distinct frontends:

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
                                                      | Exclusive Adventure Tome   |
                                                      +----------------------------+
```

### The Dual-Stream Protocol
On every turn or UI interaction, the C bridge emits two synchronized channels:
1. **Structured Game State**: Strongly typed telemetry covering player vitals, dungeon depth, grid-relative FOV, visible monster entities, ground items, active light radii, and combat feedback banners.
2. **Raw 80x24 Terminal Stream**: An authentic monospace character matrix capturing Angband's character birth sequence, town stores, inventory menus, and targeting prompts.

---

## 🌟 Technical Highlights & Core Architectural Patterns

### 1. Solving the 3D Turn-Based Dilemma (The Camera Invariant)
In a 2D roguelike, looking in a direction is indistinguishable from moving. In first-person 3D, forcing a turn tick every time the camera moves feels unplayable, while making it real-time destroys the game mechanics.
* **The Solution**: Client-side camera yaw, pitch, and mouse look are **instantaneous and cost 0 game turns**.
* Only translational steps (`Forward`, `Backward`, `Strafe`, `Wait`, `Attack`) dispatch an input token to the C engine, consuming an authoritative Angband game turn.
* Monsters only step or strike when you take a turn, preserving pure turn-based tactical deliberation.

### 2. Master Lore Accuracy & 4096×4096 HD Atlases
Angband 3D standardizes on the beloved, authentic 2.5D illustrated visual aesthetic (reminiscent of *The Elder Scrolls: Daggerfall* and *Dungeon Master*):
* **100% Lore Accuracy Audit**: Validated by automated CI tests (`tools/audit_atlas_models.js`) cross-referencing all 624 monster species and 498 items against upstream canonical Shockbolt PRF tables.
* **Math Floor Alignment**: Eradicated IEEE 754 banker's rounding shifts, ensuring creatures like the **Hippogriff** (`[H]`, eagle-headed winged horse) render with their authentic artwork on Row 4, Col 19 rather than shifting into Flesh Golems.
* **4096×4096 HD Atlases**: 4× pixel density (128×128 pixel tiles) upscaled with high-quality bicubic filtering.
* **De-fringed Silhouettes & CAS Sharpening**: Legacy baked 2D drop-shadows are stripped programmatically, edge alpha is un-premultiplied, and Contrast-Adaptive Cross-Laplacian sharpening restores razor-sharp eyes, claws, and weapon bevels.
* **Bilateral Normal Maps & Contact Shadows**: 5×5 bilateral denoised normal maps catch dynamic torchlight glints, while real-time ground contact shadows anchor entities to stone floors.
* **Live 3D Auto-Upgrade**: 27 core 3D polygon meshes (rats, spiders, imps, skeletons, stone pillars) automatically upgrade into full 3D when loaded, with automatic vertex normal smoothing (`computeVertexNormals()`).

### 3. Progressive 4-Level Biome Depth Chapters
Rather than monotonous stone walls across 100 dungeon levels, the descent is partitioned into progressive 4-level chapters (~200 ft per chapter):
* **Chapter 1 (50–200 ft / Lvl 1–4)**: Upper Crypts (Granite Ashlar, Cold Slate, Cool Slate Fog).
* **Chapter 2 (250–400 ft / Lvl 5–8)**: Flooded Undercrofts (Wet Slate, Reflective Water Floors `roughness: 0.44`, Damp Aquamarine Mist).
* **Chapter 3 (450–600 ft / Lvl 9–12)**: Deep Sepulchre (Ancient Earthen Sandstone, Deep Amber Flame, Violet Shadows).
* **Chapter 4 (650–800 ft / Lvl 13–16)**: Overgrown Catacombs (Verdant Lichen, Fungal Spores, Emerald Haze).
* **Chapters 5–9 (850–5000 ft / Lvl 17–100)**: Chasm Threshold, Crystal Caverns, Magma Underworld, Abyssal Nether Vaults, and Morgoth's Iron Citadel.
* Micro-formations (lichen patches, mineral streaks, sandstone salt deposits) are procedurally mapped to tile instances.

### 4. Dynamic Physical Height Scaling (Perspective Mechanics)
In Angband, rolled character race and physical height (e.g., a 36-inch Hobbit vs. a 104-inch Half-Troll) were historically numbers on an ASCII sheet.
* In Angband 3D, **height dynamically scales the entire physical 3D world**:
  * **Halflings & Gnomes (~36–44")**: Camera eye height drops to ~0.95m with an 86° FOV. You look up at stone archways and towering trolls, instilling subterranean dread.
  * **Humans & Elves (~68–76")**: Standard balanced dungeon eye height (~1.68m).
  * **Half-Trolls & High-Elves (~84–104")**: Commanding eye height (~2.15m) peering down corridors from near the ceiling rafters.
* First-person viewmodel hands, reaching distances, weapon scaling, and footstep acoustic pitch all modulate dynamically with character stature.

### 5. Zero-Asset Procedural Audio (Mathematical Sound Synthesis)
Instead of shipping gigabytes of bloated audio samples or risking copyrighted sound effects:
* **100% Procedural Foley**: Audio is dynamically synthesized in real-time via the Web Audio API (`server/public/js/audio.js`) and dynamic 16-bit PCM generators in C# (`client/scripts/AudioManager.cs`).
* **Physical Synthesizers**:
  * *Blade Crits & Clangs*: Euler-Bernoulli bar mode transients with high-frequency ricochets.
  * *Quaffing Potions*: Granular fluid turbulence simulation.
  * *Reading Scrolls*: Resonant harmonic chimes modulated by fibrous friction noise.
  * *Monster Grunts*: Vocal tract formant resonators with guttural low-frequency growls.
* **Master Dynamics Limiter**: An inline Web Audio `DynamicsCompressorNode` (-12dB threshold, 4.5 ratio) permanently protects player ears against clipping during frantic combat bursts.

### 6. Seamless Classic Monospace Overlay
Whenever complex interaction is needed (rolling stats at birth, browsing inventory `i`, or purchasing goods in the Alchemy Shop), the game seamlessly overlays an authentic 80x24 monospace terminal.
* You never lose classic Angband interface muscle memory.
* Terminal canvas supports mouse wheel zoom and smooth panning on desktop, and two-finger pinch-to-zoom on mobile, strictly isolated so gesture navigation never triggers accidental in-game commands.

### 7. Robust Mobile & Tablet Touch Architecture
* **Split-Thumb Layout**: Left thumb controls an 8-way directional D-pad; right thumb controls an adaptive action cluster (`Attack`, `Cast`, `Potion`, `Pack`, `Stairs`, `More`).
* **Synthetic Click Suppression**: Strict timing suppression (<500ms post-touch) prevents duplicate input dispatches across mobile Safari and Chrome.
* **Contextual Prompt Ribbon**: Character birth menus, store transactions, and Yes/No/Quantity prompts automatically map to tactile one-tap buttons.

### 8. The Adventure Tome & Companion Chronicle (Web Client Only)
Exclusive to the web client (`https://angband3d.com`), the optional Adventure Tome records your heroic descent in real time:
* **Adaptive Literary Saga**: Translates player turns, combat blows, store visits, and vault discoveries into narrative prose attuned to your adventurer's heritage (Men, Elves, or Dwarves).
* **Optional Voice Narration & Audio Deck**: Integrated speech synthesis deck with full playback controls, customizable narration speeds, and independent volume mixing.
* **Diegetic Lorekeeper & Story Exports**: In-character gameplay tips, monster lore, and 1-click standalone HTML story exports to preserve your character's heroic journey or solemn death requiem.

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

You can build, test, and run the entire Angband 3D stack locally with minimal effort.

### Prerequisites
* **Node.js** (v18+) & **Python** (3.8+)
* **GCC / Clang + CMake** (for compiling the C engine)
* **.NET 8 SDK & Godot 4.3+ Mono** *(Optional, only needed for compiling the native desktop client)*

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

### 3. Run Automated Validation & Verification Suites
```bash
# 1. Engine JSON Bridge Verification (11/11 tests checking save/load, birth, IPC)
python tools/smoke_test.py

# 2. Master Lore Accuracy & Model Audit (624 monsters, 498 items, 27 meshes)
node tools/audit_atlas_models.js

# 3. Hybrid Graphics & Biome Invariants (9/9 invariants)
node tools/test_hybrid_graphics.js

# 4. Server & Web Client Integration Tests (20/20 test suites)
cd server && npm test

# 5. Native Client Compilation Check (0 errors, 0 warnings)
dotnet build client/angband3d.csproj
```

---

## 🔧 Building Your Own 3D Roguelike (Forking & Modding)

Want to create your own 3D roguelike or bring another classic ASCII game into 3D? We built this codebase to be the cleanest possible starting point.

### How to Adapt the C Bridge to Other Roguelikes
1. **Read the Blueprint**: Consult [`docs/GENERIC_ENGINE_INTEGRATION.md`](docs/GENERIC_ENGINE_INTEGRATION.md) for the ~200-line minimal C bridge skeleton.
2. **Hook the Input Loop**: Find where the source engine blocks for user input (e.g. `cgetc()`, `wgetch()`, or `Term_inkey()`).
3. **Emit the State Frame**: Write out JSON containing:
   - Player position, vitals, and depth.
   - Visible map tile indices and flags.
   - Entity list (monsters, items).
   - Raw terminal character rows for fallback menus.
4. **Consume Virtual Keystrokes**: Read line-delimited keypress tokens from `stdin` and feed them into the engine's event queue.
5. **Connect the 3D Frontend**: Point either our Godot C# client or Three.js WebGL frontend to your new binary!

### Adding Custom 3D Models
Adding custom models is 100% declarative:
* **Monster Models**: Open `client/scripts/MonsterModelResolver.cs` and add a registration rule:
  ```csharp
  RegisterModelRule('k', "res://assets/models/characters/Kobold.glb", scale: 0.75f, speed: 1.1f);
  ```
* **Item Pickups**: Open `client/scripts/ItemModelResolver.cs` and map an item glyph:
  ```csharp
  RegisterItemModel('/', "res://assets/models/items/Broadsword.obj", scale: 0.5f);
  ```
* **Web Client Meshes**: Place GLTF/GLB files in `server/public/assets/models/` and register them in `server/public/js/dungeon3d.js`.

For detailed step-by-step contribution recipes, see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

---

## 🔒 Security, Quality & Resilience Invariants

To guarantee rock-solid stability and security across long-term deployments:
1. **Zero Known Vulnerabilities**: `npm audit` in `server/` reports **0 vulnerabilities**. Dependencies are strictly pinned and minimal (`ws`, `msedge-tts`).
2. **Path Traversal Defenses**: All savegame endpoints and static file deliveries strictly enforce `path.basename()` sanitization, reserved device name rejection (`CON`, `PRN`, `AUX`), and root directory containment checks (`filePath.startsWith(WEB_DIR)`).
3. **Savegame Magic Verification**: Only files with authentic Angband `SaveVNLA` binary magic headers are accepted by the server.
4. **Zero API Key Leakage**: LLM configuration endpoints never transmit raw API keys to browser clients. Authentication occurs exclusively via backend headers or client header injection (`x-goog-api-key`). Keys are never logged or formatted into URL query parameters.
5. **Zero Memory Leak Guarantee**: WebGL geometries, textures, materials, and audio buffers implement deterministic lifecycle pooling and cleanup to prevent browser VRAM exhaustion.

---

## 📖 Complete Technical Documentation Index

* 📡 **[Wire Protocol Specification (PROTOCOL.md)](docs/PROTOCOL.md)**: Full specification of the JSON IPC format between engine and frontends.
* 🏛️ **[Client Architecture (ARCHITECTURE.md)](docs/ARCHITECTURE.md)**: Godot C# scene graph and Three.js WebGL coordinate mappings.
* 🧠 **[Best Practices & Lessons Learned (BEST_PRACTICES_AND_LESSONS_LEARNED.md)](docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md)**: Master engineering guide, edge cases, memory safeguards, and lessons learned.
* 🎨 **[Hybrid Graphics Master Plan (HYBRID_GRAPHICS_MASTER_PLAN.md)](docs/HYBRID_GRAPHICS_MASTER_PLAN.md)**: Detailed specifications for 4096 HD atlases, normal mapping, biomes, and lore audits.
* 🔍 **[Lore & Model Audit Report (MODEL_AND_SPRITE_LORE_AUDIT.md)](docs/MODEL_AND_SPRITE_LORE_AUDIT.md)**: Mathematical proof of row shift resolution and 6-part audit verification.
* 🗺️ **[Generic Engine Integration Guide (GENERIC_ENGINE_INTEGRATION.md)](docs/GENERIC_ENGINE_INTEGRATION.md)**: Blueprint for porting NetHack, Moria, DCSS, or ADOM into 3D.
* 💾 **[Save System & Cross-Play (SAVE_SYSTEM.md)](docs/SAVE_SYSTEM.md)**: Binary `SaveVNLA` state preservation and cloud persistence.
* 🎨 **[Graphics & Shaders Handover (GRAPHICS_HANDOVER.md)](docs/GRAPHICS_HANDOVER.md)**: PBR materials, biomes, and kinetic VFX blueprints.
* ☁️ **[Cloud Deployment Guide (CLOUD_DEPLOYMENT.md)](docs/CLOUD_DEPLOYMENT.md)**: Google Cloud Run setup, session affinity, and queue architecture.
* 🤝 **[Contributing Guide (CONTRIBUTING.md)](docs/CONTRIBUTING.md)**: Step-by-step recipes for adding models, items, audio, and code.

---

## ⚖️ Legal Notices, Trademarks & Non-Commercial Policy

**Angband 3D** is an independent, non-commercial, open-source fan tribute created out of love for classic roguelikes and fantasy literature.

* **Literary Inspiration**: The setting, lore, and names draw inspiration from the literary legendarium created by **J.R.R. Tolkien**.
* **Trademarks**: *The Lord of the Rings*, *The Hobbit*, *Middle-earth*, *Angband*, and *Moria* are trademarks or registered trademarks of **Middle-earth Enterprises, LLC** (Embracer Group AB) and/or **The Tolkien Estate**. This project is not affiliated with, endorsed by, or sponsored by Middle-earth Enterprises or The Tolkien Estate.
* **Strict Zero-Monetization Policy**: The game is 100% free. It contains **no ads, no microtransactions, no paywalls, and accepts no donations or commercial sponsorship**.
* **Licensing**:
  * Core engine and derivative work: **GNU General Public License, Version 2** (GPL-2.0). Complete source code is available in this repository. Full terms in [`LICENSE`](LICENSE) and [`LEGAL.md`](LEGAL.md).
  * 3D Art & Textures: Permissive **CC0 1.0 Universal** public domain dedications (KayKit, Kenney, Quaternius).
  * 2D Tile Art: Upstream canonical Angband tiles by **Shockbolt** and the Angband Development Team.
  * Fonts: **SIL Open Font License 1.1** (Cinzel, Outfit, Fira Code).
  * Full asset credits and citations are detailed in [`CREDITS.md`](CREDITS.md).

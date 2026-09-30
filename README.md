# angband3d

A first-person 3D front end for [Angband](https://github.com/angband/angband), built as a high-performance fork of the game rather than a reimplementation of it.

The goal is *Dungeon Master*-style immersion with Angband's full roguelike depth: every monster, item, artifact, curse, vault, and level generator, completely unchanged.

**Status: Version 1.1.0 — Fully playable standalone 3D dungeon crawler with Godot 4 & .NET 8, and live WebGL Cloud Edition with dedicated mobile touch controls for Desktop, Tablet, and Mobile.**

[![Play Online in Browser](https://img.shields.io/badge/Play_Online-Live_Web_Client-gold?style=for-the-badge&logo=googlechrome)](https://angband3d-cloud-iuawf47jqa-uc.a.run.app)

[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-blue.svg)](LICENSE)
[![Engine: Angband 4.2.6](https://img.shields.io/badge/Angband-4.2.6-darkgreen.svg)](https://github.com/angband/angband)
[![Web Client: Three.js WebGL](https://img.shields.io/badge/Web_Client-Three.js_WebGL-orange.svg)](server/public)
[![Desktop Client: Godot 4.3+ .NET](https://img.shields.io/badge/Godot-4.3+_.NET-blueviolet.svg)](https://godotengine.org/)
[![Cloud Run: Live](https://img.shields.io/badge/Cloud_Run-Online-brightgreen.svg)](https://angband3d-cloud-iuawf47jqa-uc.a.run.app)
[![Smoke Tests: 11/11 Passing](https://img.shields.io/badge/Smoke_Tests-11%2F11_Passing-success.svg)](tools/smoke_test.py)
[![Server Tests: 19/19 Passing](https://img.shields.io/badge/Server_Tests-19%2F19_Passing-success.svg)](server/test/server_test.js)

---

### 🎮 Canonical Play Link (Zero Install, Desktop & Mobile)
👉 **[https://angband3d-cloud-iuawf47jqa-uc.a.run.app](https://angband3d-cloud-iuawf47jqa-uc.a.run.app)**  
Open in Chrome, Safari, Edge, or Firefox on PC, Mac, iPad, iPhone, or Android. Supports mouse/keyboard, gamepad, and touch controls.

---

## 🌟 Notable Features Up Front — Why 3D is Worth Playing

### 📏 1. Dynamic Character Height & World Scaling (The Scaling Feature)
Your character's rolled race and physical height stat directly scale the entire 3D world:
- **Halflings & Gnomes (~36–44")**: Lower camera eye height (~0.88m–1.05m) with a wider perspective. You look upward at looming doors, stone archways, and towering trolls, giving a palpable sense of subterranean dread.
- **Dwarves (~48–56")**: Grounded eye height (~1.15m–1.30m) with rapid, sturdy footing.
- **Humans & Elves (~68–76")**: Standard eye height (~1.62m–1.76m) with balanced dungeon perspective.
- **Half-Trolls & High-Elves (~84–104")**: Commanding eye height (~1.95m–2.35m). You peer down corridors from near the ceiling rafters with heavy, echoing footsteps.
- **Dynamic Viewmodel Proportions**: Hand sizes, arm lengths, reach distances, and weapon scale adapt proportionally to your race.
- **Perspective-Correct FOV & Audio**: Field of view smoothly scales (86° for short races, 82° for giant races), and footstep acoustic pitch modulates with character mass.

### ⚔️ 2. Animated First-Person Viewmodel & Dynamic Hands
- **Articulated Player Hands**: Modeled 3D arms featuring tapered sleeves, metallic wrist bracers, palms, and sculpted fingers wrapping around weapon handles.
- **Dynamic Racial Skin & Sleeves**: Automatically skins your hands and sleeves with race-specific skin tones and class-tailored cloth colors.
- **Equipped Weapon & Item Matching**: Real-time 3D models for swords, daggers, 2H battleaxes, polearms, bows, crossbows, wands, staves, spellbooks, shields, burning torches, or martial bare fists.
- **Fluid First-Person Kinematics**: Natural sinusoidal walk bobbing, inertia yaw/pitch sway, melee slash and thrust animations, glowing spellcast surges, and hit trauma recoil.

### 🐉 3. Living 3D Bestiary & Procedural Anatomical Creatures
- **Role-Accurate Humanoid Equipment**: Guards wield swords and shields; archers draw crossbows; mages hold glowing staves; thieves wield daggers; and beggars fight unarmed.
- **Anatomical Procedural 3D Creature Tokens**: Hundreds of non-humanoid monsters (dragons, hydras, giant spiders, centipedes, beholders, slimes, basilisks, demons, elementals, kobolds, imps, yeeks, yetis, lice) feature dedicated procedural anatomical 3D models with undulating segments, skittering legs, flapping wings, glowing irises, and pulsating nuclei.
- **Robust Skeletal Rigging & T-Pose Prevention**: Bestiary models without embedded skeletal animation tracks automatically fallback to bespoke anatomical creature rigs, preventing static T-pose artifacts.
- **Depth-Tested Nameplates & Status Reticles**: Monster nameplates, status badges (`💤 Sleep`, `⚠ Fleeing`, `🌀 Confused`), and target reticles enforce strict depth buffer testing and LOS gating so creature positions are never spoiled through solid walls.
- **Living Visual Behaviors**: Monsters smoothly interpolate across tiles, turn to face you when adjacent, track their health with color-coded 3D nameplates, and play custom Idle/Walk animations.

### ✨ 4. Animated 3D Item Pickups & Kinetic VFX
- **3D Ground Pickups**: Rendered 3D objects with continuous gentle bobbing, slow ambient rotation, and emissive color accents matching Angband item qualities.
- **Kinetic Combat Juice**: Floating damage numbers, critical strike popups, directional hit sparks, and camera trauma screen-shake.
- **Active Spell Projectiles**: Glowing 3D kinetic projectiles with particle trails for player spellcasting, monster breath weapons, and ranged missile attacks.

### 🏰 5. Procedural PBR Masonry, Depth Biomes & Solid Barrier Walls
- **Multi-Octave PBR Materials**: Ashlar limestone masonry, weathered flagstone floors, cavern ceilings, glowing magma veins, and crystalline quartz seams with normal maps and calibrated roughness.
- **6 Subterranean Depth Biomes**: Town & Overworld (0), Upper Crypts (1-15), Overgrown Catacombs (16-35), Crystal Caverns (36-60), Magma Underworld (61-85), and Abyssal Throne (86-100+).
- **Wall Neighbor Discovery & Void-Free Boundary Rock**: Solid walls adjacent to illuminated rooms or hallways render immediately with inherited lighting upon entrance, and boundary rock is synthesized into dark barriers to eliminate see-through void gaps.
- **Corridor Wall Sconces & Clutter**: Deterministic wall torches with point lights every 6–8 tiles, room corner pillars, and dungeon clutter.
- **Atmospheric Lighting**: Dynamic torchlight with realistic sinusoidal flicker, ember particles, volumetric fog, and ambient SSAO.

### ⚰️ 6. Atmospheric Death & Post-Mortem Revelation Experience
- **Solemn Funeral Bells & Atmospheric Memorial Screen**: Custom death audio chimes and a dedicated death UI honoring your fallen hero.
- **Full Runes & Item Disclosure**: Optional full identification unmasks unknown runes, history, and properties across Equipment, Backpack, and Quiver.
- **Authoritative High Scores**: Seamlessly records high scores into Angband's binary score ledger.
- **Quick Restart & Reload**: Single-click actions to reload the latest save, roll a new character, or review character info.

### 🗺️ 7. Dual-Mode Minimap & Independent Geometry Scaling
- **Decoupled Minimap Controls**: Adjust physical HUD window dimensions (`Ctrl+PgUp/PgDn` or `[`/`]`) independently from grid tile zoom radius (`PgUp/PgDn` or `+`/`-`).
- **Full-Screen 2D Tactical Map**: Press `Shift-M` for an instant top-down view with your directional vision cone and fog of memory.

### 🔊 8. Zero-Latency Positional 3D Audio
- **Procedural 16-bit PCM Audio Engine**: Generates spatialized footsteps (stone vs outdoor terrain), blade clangs, critical slashes, spell zaps, door creaks, funeral death tolls, and staircase transitions dynamically with zero external audio assets.
- **Pre-Allocated Sound Pools**: Zero-allocation audio playback eliminates runtime garbage collection hiccups.

### 📜 9. 100% Faithful Angband 4.2.6 Engine Depth
- **Zero Compromises on Roguelike Depth**: Every item, artifact, ego-type, spell, monster AI behavior, and dungeon generator is running directly from unmodified Angband 4.2.6 C code.
- **Seamless Terminal Overlay**: Inventory, stores, character creation, targeting, and wizard debug menus pop up seamlessly via the terminal overlay without breaking immersion or game state.

### 📦 10. Standalone Zero-Install Packaging
- **One-Click Distribution**: Easily packaged via `package.cmd` into `Angband3D-Windows-x64.zip` containing the standalone `Angband3D.exe`, `.pck` assets, and native C binaries. End-users require zero prerequisites.

### 📱 11. Mobile & Tablet Touch Experience (PWA Cloud Edition)
- **Fluid Touch Controls**: Tactile 8-way directional D-pad, expandable action drawer, and dynamic Contextual Letter Ribbon for 1-tap item/spell selection.
- **Gesture-Safe Touch Tracking**: Displacement-based swipe rejection (>10px) cancels activation during list and ribbon scrolling.
- **Double-Click Elimination**: Strict synthetic click suppression (<500ms post-touch) prevents duplicate keypresses across iOS Safari and Android Chrome.
- **Accessible Classic Menus**: Seamless D-Pad navigation for character birth (Race, Class) and item prompts, with tactile Yes/No prompt buttons (`[y] ✓ Yes`, `[n] ✕ No`) and quantity pickers (`[⏎] All`, `[1] Just 1`).
- **Progressive Web App (PWA)**: Standalone full-screen installation with offline shell caching (`Service Worker`).

---

## 📋 Release Notes & Changelog

See **[CHANGELOG.md](CHANGELOG.md)** for detailed version-by-version release notes.

- **v1.1.0 (Latest)**: Mobile Touch Overhaul & Cloud Edition — Decoupled touch gesture tracking, swipe drag cancellation, post-touch synthetic click suppression, classic menu D-Pad & tactile Yes/No/quantity prompt overhaul, PWA v6.4 offline shell, and live Cloud Run deployment.
- **v1.0.0**: Comprehensive Release — Standalone distribution packaging, full visual overhaul with PBR parallax materials, procedural 3D creature tokens and fallback rigs, dynamic racial scaling and viewmodel kinematics, depth biomes with volumetric fog, atmospheric death experience with runes disclosure, procedural 3D audio, and decoupled minimap controls.
- **v0.3.0**: Standalone release bundle, packaging pipeline & executable export.
- **v0.2.0**: GitHub Actions release automation, 3D pickup models, combat feedback juice, and expanded smoke tests.
- **v0.1.0**: Initial working prototype of the C JSON bridge and Godot 4 3D client.

---

## 🏛️ System Architecture

Angband's game mechanics are decoupled from its presentation layer via the **Angband3D Bridge**:

```
                       +-----------------------------+
                       |  Upstream Angband 4.2.6 C   |
                       |  Mechanics, RNG, DGN, Saves |
                       +-----------------------------+
                                      |
                          engine/src/main-bridge.c
                          JSON Bridge Term (-mbridge)
                                      |
                  +-------------------+-------------------+
                  |                                       |
            stdio / IPC                             stdio / Child Proc
                  |                                       |
        client/ (Godot 4 C#)                 server/src/server.js (Node.js)
      +-----------------------+              +----------------------------+
      | Standalone Desktop    |              | Cloud WebSocket Daemon     |
      | First-person 3D world |              | Session lifecycle, Saves   |
      | Windows x64 .exe      |              +----------------------------+
      +-----------------------+                            |
                                                     WebSocket JSON
                                                           |
                                             server/public/ (Three.js WebGL)
                                             +----------------------------+
                                             | Web & Mobile 3D Client     |
                                             | Desktop, Tablet & Phone    |
                                             | Zero install in browser    |
                                             +----------------------------+
```

The bridge publishes two synchronized channels on every turn or prompt:
1. **Structured Game State**: Player attributes, vitals, racial height/weight, equipment, local 3D tiles, visible monsters, animated items, light radius, and real-time combat banners.
2. **Raw Terminal Stream**: 80x24 ASCII character matrix for Angband's character creation, stores, targeting prompts, and wizard menus.

---

## 🎮 How to Play

### Option 1: Live Cloud Web Client (Instant, Zero Install)
Open **[https://angband3d-cloud-iuawf47jqa-uc.a.run.app](https://angband3d-cloud-iuawf47jqa-uc.a.run.app)** on any device:
- **Desktop (Chrome / Safari / Edge / Firefox)**: Full mouse look (drag or click-drag), keyboard controls, and volume adjustments.
- **Mobile (iPhone / Android)**:
  - **Portrait Mode**: Split-thumb layout — left thumb for 8-way movement D-pad, right thumb for tactical action cluster, top status capsule, and circular radar minimap.
  - **Landscape Mode**: Collision-free widescreen layout — D-pad docked bottom-left, action buttons docked bottom-right, status pill bar centered between them, radar minimap docked top-right, and maximized 3D viewport.
  - **Touch Gestures**: Single-finger drag on 3D view to look around; single-finger touch pan and two-finger pinch-to-zoom on classic terminal view. Touch interactions inside the terminal canvas never trigger unintended commands.
  - **Contextual Action Bar**: Dynamic buttons (`Attack`, `Cast`, `Potion`, `Pack`, `Stairs`, `Classic`, `More`) adapt to your active context.

### Option 2: Standalone Desktop Client (Godot 4 .NET)
Double-click **`play.cmd`** (or run from PowerShell):
```powershell
.\play.cmd
```
To launch in classic ASCII mode:
```powershell
.\play.cmd -Classic
```

---

## ⌨️ Controls Reference

| Control (Desktop) | Mobile Touch | Action |
|---|---|---|
| **Arrow Left / Right** | Turn Left / Right buttons | Turn camera 90° left / right (instant, 0 game turns) |
| **Arrow Up / Down** | D-Pad ▲ / ▼ | Step forward / backward in camera facing direction |
| **Numpad 4 / 6** | Strafe ⇦ / ⇨ | Strafe left / right relative to camera facing |
| **Numpad 7 / 9 / 1 / 3** | Diagonal buttons ↖ ↗ ↙ ↘ | Diagonal step forward-left / right, backward-left / right |
| **Space** *(or Numpad 5)* | Attack / Wait (⚔) | Attack front monster or wait/rest 1 turn |
| **`m` / `p`** | Cast (✨) | Cast magical spell or recite holy prayer |
| **`q`** | Potion (🧪) | Quaff / drink potion from inventory |
| **`r`** | Scroll (📜) | Read magical scroll from inventory |
| **`v`** | Throw (🎯) | Throw item at monster target |
| **`f`** | Shoot (🏹) | Fire ranged weapon from quiver |
| **`o`** | Door (🚪) | Open closed door or chest |
| **`g`** | Get (💎) | Pick up item from dungeon floor |
| **`R`** | Rest (⏳) | Rest until fully healed |
| **`i` / `e`** | Pack (🎒) / Gear (🛡) | Open inventory backpack or equipped gear |
| **`>` / `<`** | Descend (⬇) / Ascend (⬆) | Use staircase |
| **`Tab`** | Classic (📜) | Toggle 80x24 classic terminal view |
| **Mouse Drag** | Single-finger touch drag | Smooth first-person camera look |
| **Mouse Wheel** | Pinch-to-zoom | Zoom in/out on classic terminal view |
| **Drag Terminal** | Touch drag on terminal | Pan around enlarged classic terminal canvas |
| **`Shift-M`** | Map (🗺) | Toggle full-level 2D tactical map overlay |
| **`+` / `-`** | Minimap +/- buttons | Zoom minimap radar tile radius |
| **`[` / `]`** | Minimap Size (⛶) | Toggle minimap radar size preset |
| **`Escape`** | Menu (⚙) | In-game pause menu (Save, Load, Export, Controls) |

---

## 🛠️ Complete Replication Guide

Anyone can build, test, run, and deploy the entire Angband3D stack from scratch using the steps below.

### Prerequisites

| Component | Minimum Version | Used For |
|---|---|---|
| **Node.js** | v18.0+ | Cloud server, WebSocket daemon, Web client delivery |
| **Python** | 3.8+ | Engine smoke test suite and bridge validation |
| **Git** | 2.30+ | Source checkout and upstream patch tracking |
| **GCC / Clang + CMake** | CMake 3.20+, GCC 11+ | Compiling the headless C engine |
| **Docker** *(Optional)* | 24.0+ | Containerized local and cloud deployment |
| **.NET SDK** *(Optional)* | 8.0 or 9.0 | Compiling the Godot C# desktop client |
| **Godot Engine** *(Optional)* | 4.3+ (.NET / Mono) | Running/editing the native desktop client |

---

### Method 1: Run the Web Edition Locally (Fastest)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/lieb2101/angband3d.git
   cd angband3d
   ```

2. **Build the C Engine**:
   - **Windows (PowerShell)**:
     ```powershell
     .\build.cmd
     ```
   - **Linux / macOS**:
     ```bash
     mkdir -p engine/build && cd engine/build
     cmake .. -DCMAKE_BUILD_TYPE=Release -DSUPPORT_BRIDGE_FRONTEND=ON -DSUPPORT_GCU_FRONTEND=ON
     make -j$(nproc)
     cd ../..
     ```

3. **Install server dependencies & start**:
   ```bash
   cd server
   npm install
   npm start
   ```

4. **Play**: Open **`http://localhost:8080`** in your browser!

---

### Method 2: Run via Docker (Zero Toolchain Required)

Run the fully containerized multi-stage build:
```bash
# Build the container image
docker build -t angband3d-cloud:latest -f server/Dockerfile .

# Run with persistent save volume mounted
docker run -d -p 8080:8080 -v angband_saves:/data/save --name angband3d angband3d-cloud:latest
```
Or with Docker Compose:
```bash
cd server
docker compose up -d
```
Visit **`http://localhost:8080`**.

---

### Method 3: Deploy to Google Cloud Run

To replicate the live production deployment on Google Cloud Run:

1. **Install and authenticate Google Cloud SDK**:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Submit container build via Cloud Build**:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/angband3d-cloud:latest -f server/Dockerfile .
   ```

3. **Deploy to Cloud Run with WebSocket & Session Affinity enabled**:
   ```bash
   gcloud run deploy angband3d-cloud \
     --image gcr.io/YOUR_PROJECT_ID/angband3d-cloud:latest \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 8080 \
     --session-affinity \
     --timeout 3600 \
     --concurrency 80 \
     --memory 512Mi \
     --cpu 1
   ```

Cloud Run will output your live HTTPS URL.

---

### Method 4: Run the Standalone Desktop Godot Client

1. **One-time Windows MSYS2 toolchain setup**:
   ```powershell
   .\tools\bootstrap.ps1
   ```
2. **Build C Engine and Godot C# Project**:
   ```powershell
   .\build.cmd
   dotnet build client/angband3d.csproj
   ```
3. **Launch Game**:
   ```powershell
   .\play.cmd
   ```
4. **Package Standalone Windows Distribution**:
   ```powershell
   .\package.cmd
   ```
   This generates `dist/Angband3D-Windows-x64.zip` containing the standalone `Angband3D.exe` and game assets.

---

### 🧪 Automated Validation & Test Suites

Verify total workspace health at any time:

```bash
# 1. Engine JSON Bridge Smoke Tests (11/11 tests)
python tools/smoke_test.py

# 2. Cloud Server & Web Client Integration Tests (18/18 suites)
cd server && npm test

# 3. Godot C# Client Compilation
dotnet build client/angband3d.csproj
```

---

## 🏛️ Invariants & Design Rules

1. **Engine Rebasability**: Upstream Angband 4.2.6 C code in `engine/` is never modified in its game mechanics or RNG. All bridge code is isolated in `engine/src/main-bridge.c`, `bridge-json.c`, and `bridge-json.h`.
2. **Safe Equipment & Querying**: Equipment slots are queried via `bridge_get_equipped_by_type()` (never `slot_by_name()` on optional slots to prevent engine asserts).
3. **Touch Isolation Invariant**: Clicks, drags, and pinch gestures inside the classic terminal viewport strictly control view zoom and panning — never dispatching game commands. Game input is strictly routed through the tactical touch controls.
4. **Zero Landscape Overlap Invariant**: Mobile landscape viewport (`max-height: 520px`) strictly separates the movement D-pad, status pill footer, action cluster, minimap radar, and top message banner into independent bounding zones.

---

## 📖 Further Documentation

- 📜 [Legal Notices, Trademarks & Non-Commercial Policy](LEGAL.md) — Middle-earth trademark notice, GPL v2 terms, and zero-monetization policy.
- 🎨 [Asset Credits & Provenance](CREDITS.md) — Comprehensive attribution for CC0 3D models, fonts, and procedural audio.
- 📡 [Bridge Wire Protocol v1](docs/PROTOCOL.md) — Complete JSON IPC format specification.
- 🏛️ [Client Architecture](docs/ARCHITECTURE.md) — Godot C# and Three.js WebGL coordinate systems and pipelines.
- ☁️ [Cloud Deployment Guide](docs/CLOUD_DEPLOYMENT.md) — Multi-cloud hosting, GCS mounts, and reverse proxies.
- 🎨 [Graphics & Shaders Handover](docs/GRAPHICS_HANDOVER.md) — PBR lighting, biomes, and particle VFX blueprints.
- 💾 [Save System & Cross-Play](docs/SAVE_SYSTEM.md) — Binary `SaveVNLA` format and cloud storage.
- 📋 [Living Task Roadmap](docs/NEXT_STEPS.md) — Milestone tracker and active task queue.
- 🤖 [LLM / Agent Guidelines](docs/LLM_CONTEXT.md) — Operating guidelines and key file index.

---

## ⚖️ Legal, Trademarks & Non-Commercial Notice

**Angband 3D** is an independent, non-commercial, open-source fan tribute. 

- **Tolkien Legendarium**: Elements of the game's setting, names, and lore draw inspiration from the literary works of J.R.R. Tolkien.
- **Trademarks**: *The Lord of the Rings*, *The Hobbit*, *Middle-earth*, *Angband*, *Moria*, and associated characters, places, and items are trademarks or registered trademarks of **Middle-earth Enterprises, LLC** (Embracer Group) and/or **The Tolkien Estate**. This project is **not** endorsed by, sponsored by, or affiliated with Middle-earth Enterprises or The Tolkien Estate.
- **Strictly Non-Commercial**: The game is 100% free. It contains **no ads, no microtransactions, no paywalls, and accepts no donations or commercial monetization**.
- **Licence**: Distributed under the **GNU General Public License, Version 2** (GPL-2.0). See [`LICENSE`](LICENSE), [`LEGAL.md`](LEGAL.md), and `engine/docs/copying.rst`.
- **Asset Attribution**: All third-party 3D models and textures are CC0 / Public Domain. See [`CREDITS.md`](CREDITS.md) for full licensing records.

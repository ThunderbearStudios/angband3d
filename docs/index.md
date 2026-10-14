---
layout: default
title: "Angband 3D — Preserving Classic Roguelike History in Modern 3D"
description: "Four authoritative C/C++ roguelike engines (Vanilla, Sil-Q, FrogComposBand, Hengband) running in first-person 3D with zero-turn camera look, dual-reality CRT canvas, universal movable HUD, and voiced living chronicles."
---

# ⚔️ Angband 3D

> **Four Legendary Roguelike Engines. One Living 3D World. Over Three Decades of Tactical History Preserved Through High-Performance Engine Decoupling.**

[![Play Online in Browser](https://img.shields.io/badge/⚔_Play_Online-angband3d.com-gold?style=for-the-badge&logo=googlechrome)](https://angband3d.com)
[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-blue.svg)](https://github.com/ThunderbearStudios/angband3d/blob/fix/award-pass/LICENSE)
[![GitHub Repository](https://img.shields.io/badge/GitHub-ThunderbearStudios%2Fangband3d-blue?style=for-the-badge&logo=github)](https://github.com/ThunderbearStudios/angband3d)

---

## 🌟 Instant Play & Standalone Downloads

* ⚔ **Play Instantly in Your Browser**: **[https://angband3d.com](https://angband3d.com)**  
  *Zero installation. Runs at smooth 60 FPS in Chrome, Safari, Edge, or Firefox across PC, Mac, iPhone, iPad, and Android.*
* 💻 **Standalone Windows PC Desktop Release**: **[Download Angband3D-Windows-x64.zip](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Windows-x64.zip)**  
  *Unlocked 144+ FPS native execution powered by Godot 4.3+ .NET 8 (Vulkan / D3D12) for pure offline play.*
* 📱 **Standalone Android Mobile APK**: **[Download Angband3D-Android.apk](https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Android.apk)**  
  *Dedicated Android build (Target SDK 34) with hardware acceleration, responsive split-thumb D-pad, and 100% offline standalone capability.*

---

## ⚔️ The Vision: Playability First, 100% Uncompromised Mechanics

Classic turn-based roguelikes represent some of the most mathematically deep, tactically unforgiving, and strategically emergent game designs in computer history. Yet for decades, bringing them into 3D has almost always meant **shallow action-RPG rewrites** that discard their intricate simulation rules, RNG fairness, and legendary difficulty.

**Angband 3D solves this problem permanently through architectural decoupling.** 

Rather than rewriting the game from scratch, Angband 3D runs **four authoritative, unmodified C/C++ roguelike engines** in headless bridge mode. Every combat roll, saving throw, item generation curve, stealth check, and monster AI pathfinding decision runs bit-for-bit canonical upstream C code. Frontends—whether our responsive Three.js WebGL client, native Godot 4 C# engine, or standalone Android APK—act purely as reactive presentation layers.

The result is a breathtaking first-person dungeon crawl with real-time camera look, procedural lighting, and voiced narrative sagas, built upon a foundation of absolute mathematical rigor.

---

## 🎮 Playability Features That Redefine the Dungeon Crawl

### 1. 🌌 Four Legendary Realms, One Unified Experience
Choose your destiny across four masterworks of the open-source roguelike genre, switchable in one click from the title screen:

| Realm | Authoritative Engine | Historical Setting & Core Gameplay Focus | Key Tactical Distinctions |
|---|---|---|---|
| **Vanilla Angband** | Angband v4.2.6 C | The classic Middle-earth descent to overthrow Morgoth, Lord of Darkness. | 100 dungeon levels, deep tactical magic, artifact vaults, breath weapons, pure tactical grid combat. |
| **Sil-Q** | Sil-Q v1.5.0 C | First Age Beleriand tactical masterpiece inside the fortress of Angband. | 0 mana potions, 0 magic shops, Song & Stealth system, subterranean Forge crafting, cut a Silmaril from Morgoth's Crown. |
| **FrogComposBand** | FrogComposBand v7.1.1 C | Sprawling high-fantasy multiverse variant with overworld wilderness. | Hundreds of monster races & exotic classes, overworld wilderness towns, bottomless pit chasms (`#`), chaos deities. |
| **Hengband** | Hengband v3.0.1 C++ | Legendary Japanese Eastern & Chaos folklore roguelike. | Live in-place bilingual Japanese ↔ English translation (`heng-translate.js`), feudal samurai/monk classes, chaotic powers. |

---

### 2. ⚡ The Camera Invariant: 0-Turn Look Meets Pure Turn-Based Tactics
In traditional 2D roguelikes, turning your head is inseparable from taking a step. In first-person 3D, advancing game time whenever you look around makes movement unplayable, while making the entire game real-time destroys the tactical depth.

* **Angband 3D's Solution**: Camera yaw, pitch, and smooth first-person mouse look cost **exactly zero game turns**.
* You can look down dark hallway intersections, inspect distant monsters, peek into stone alcoves, and admire vaulted gothic archways freely without advancing time.
* The moment you execute a translational command (`Step Forward`, `Strafe`, `Attack`, `Quaff`, `Cast`, `Wait`), an authoritative turn token is dispatched to the C engine. Monsters only advance or strike when you take a turn.

---

### 3. 🖥️ Dual-Reality Mode: Seamless 3D & Authentic CRT Canvas
Transition seamlessly between modern 3D immersion and nostalgic terminal play with a single keystroke (`Tab`) or screen tap:

* **Instant Zero-Turn View Toggling**: Press `Tab` at any millisecond to switch between the 3D first-person perspective and an authentically emulated 80×24 CRT canvas complete with amber/green phosphorus glow, scanlines, and CRT curvature.
* **Intelligent Auto-Routing (`needsTerminal`)**: The client automatically presents the terminal canvas during intricate multi-step interactions—such as rolling character birth attributes, inspecting your full equipment sheet (`e`), or bartering with shopkeepers in town—then drops you right back into first-person 3D the moment you return to the dungeon floor.
* **3D Directional Targeting**: When aiming wands, staves, bows, or ball spells, Angband 3D keeps you in first-person 3D with a contextual targeting prompt. Aim with relative arrow keys, press `t` to snap to the nearest visible threat, and loose your missile with full line-of-sight clarity.

---

### 4. 🎛️ Universal Movable HUD & Ergonomic Controls
Every adventurer plays differently. Angband 3D features a complete, zero-lag draggable HUD system where **every major interface widget can be repositioned and customized**:

* **Tactile Virtual D-Pad (`#touch-controls`)**:
  * Equipped with a dedicated top grip (`✥ MOVE PAD`) that lets phone, tablet, and desktop players drag the directional pad anywhere on screen.
  * Three-step cycling scale button (`0.85x` compact, `1.0x` standard, `1.20x` large).
  * One-tap minimize/collapse toggle to tuck the pad away during keyboard play while keeping quick-turn wings accessible.
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

### 5. 📖 The Living Chronicle: Voiced Lorekeepers & AI Masterwork Sketches
*(Exclusive to the Web Client)*

The dungeon comes alive with an integrated, zero-latency narrative engine powered by Google Gemini and procedural Web Audio:

* **30-Archetype Neural Voice Matrix**:
  * Features realm-specific literary Lorekeepers: **Enceladus** (Old English classical narrator for Vanilla Angband), **Zephyr**, **Charon** (grim, haunting First Age narrator for Sil-Q), **Fenrir** (chaotic mythic voice for FrogComposBand), and **Gacrux** (feudal Eastern narrator for Hengband).
  * Distinct monster encounter voices spanning beasts, orcs, undead wights, high-tier demons, and ancient dragons.
* **Proximity Speculative Pre-Warming**:
  * As hostiles approach through the dark, the client speculatively pre-fetches and decodes neural vocal buffers in the background. The exact millisecond a creature enters your field of view, its vocal bark plays with **zero perceptible latency**.
* **Intelligent Combat Flow Governor**:
  * Automatically regulates voice queues during frantic skirmishes: routine melee strikes remain brief and punchy, while close calls, legendary artifact discoveries, and boss takedowns trigger triumphant narrative prose.
* **On-Demand "🔮 Tale" Button**:
  * Tap the Tale button in the HUD or Tome deck (or press `Alt+T`) to receive realm-attuned saga prose, strategic survival counsel, and lore insights tailored to your current dungeon depth, equipment, and surrounding foes.
* **Full-Context Hero Action Sketches (`Alt+K`)**:
  * Generates an illuminated `800×600` canvas etching and AI-rendered masterwork illustration capturing your hero's exact character race, class, physical traits, equipped weapons and armor, active wounds or blessings, and recent chronicle milestones.

---

### 6. 🎨 Photogrammetry Ultra-Realism & 4096×4096 HD Dark Fantasy Art
Angband 3D combines 8K photogrammetry scans with the beloved dark-fantasy art of **Raymond "Shockbolt" Gaustadnes**:

* **Photogrammetry 3D Weapons & Viewmodels**: First-person viewmodels feature CC0 8K-scanned Poly Haven models—including medieval estocs, sabers, katanas, ornate daggers, warhammers, maces, battleaxes, and kite shields—with animated weapon recoil upon attack.
* **High-Realism 3D Bestiary**: 100% rigged 3D models for humanoids (Rangers, Peasants with distinct beard/hair variations), quadrupeds (timber wolves with realistic fur shading, sleek felines, horses), terrifying bestiary horrors (dragons, skulls, giant formics, iridescent scarab beetles, segmented centipedes, and dark-chitin cave spiders), and flora/oozes (gnarled tanglethorn brambles, bioluminescent fungal clusters, and translucent gelatinous oozes).
* **Next-Gen Celestial Sky Dome**: When stepping onto town cobblestones or traversing wilderness plains, look up to behold a custom GLSL sky dome featuring the shimmering Milky Way galactic river, dark interstellar dust lanes, an animated boreal aurora veil, and a silver crescent moon with earthshine.
* **4096×4096 Shockbolt HD Atlases**: Over 1,100 monster species and items mapped to 4× pixel density atlases, enhanced with bilateral normal maps, dynamic contact shadows, and contrast-adaptive sharpening.
* **4-Level Biome Chapters**: As you delve deeper, the dungeon transitions every 200 feet through distinct architectural themes—from Upper Ashlar Crypts and Damp Flooded Undercrofts to Ancient Sandstone Sepulchres, Fungal Catacombs, and Deep Magma Pits.

---

### 7. 💾 Universal Save Game Portability
Your character lives wherever you want to play:

* **Universal Binary Saves (`SaveVNLA`, `SaveSILQ`, `SaveFROX`, `SaveHENG`)**:
  * Savegames use authentic upstream binary formats.
  * Export your save from your desktop browser with 1 click (`Esc` -> `Export Save`).
  * Drop it into your offline Windows Desktop client or continue your dungeon crawl on your Android phone during your commute.
  * Full freedom to back up your hero or embrace unforgiving ironman permadeath.

---

## 🌍 The Open Source Hooks & Architecture

Angband 3D is not a walled garden. It is an **open architecture and educational reference** demonstrating how classic terminal-based software can be elevated to modern graphic standards without breaking upstream backward compatibility.

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

> 📚 **Read the Complete Engine Porting Guide**: See [Generic Engine Integration Guide](GENERIC_ENGINE_INTEGRATION.md) for how to adapt *NetHack*, *Moria*, *Dungeon Crawl Stone Soup (DCSS)*, *ADOM*, or *IVAN* into first-person 3D using this exact bridge!

### 2. The Clean JSON Wire Protocol
All communication between authoritative engines and graphical frontends is strictly standardized and documented in [Wire Protocol Specification (PROTOCOL.md)](PROTOCOL.md).

Want to build your own Angband 3D client in **Unreal Engine 5**, **Unity**, **Bevy**, **Raylib**, or **Virtual Reality (OpenXR)**? You never need to touch C compilation or game logic—simply connect to the engine process over `stdio` or WebSockets and render incoming JSON state frames.

### 3. Permissive, Fully Open Assets
Every asset in Angband 3D adheres strictly to permissive, open-source licensing:
* **Core Code & Engines**: GNU General Public License v2 (GPL-2.0).
* **Photogrammetry 3D Models & PBR Textures**: CC0 1.0 Universal Public Domain Dedication (**Poly Haven**, **KayKit**, **Kenney**, **Quaternius**).
* **Hand-Painted Creature & Item Atlases**: Master fantasy pixel art by **Raymond "Shockbolt" Gaustadnes** and the Angband Development Team (GPL-2.0).
* **Typography**: SIL Open Font License 1.1 (*Cinzel*, *Outfit*, *Fira Code*).
* See [CREDITS.md](file:///c:/Dev/angband3d/CREDITS.md) for full licensing details and asset citations.

---

## 🛠️ Developer Quick Start & Self-Hosting

You can compile, test, and run the entire Angband 3D stack locally in seconds:

```bash
# 1. Clone the repository
git clone https://github.com/ThunderbearStudios/angband3d.git
cd angband3d

# 2. Build all 4 authoritative C/C++ engines (Windows PowerShell)
.\build.cmd

# 3. Install server dependencies and launch
cd server
npm install
npm start
```
Open **`http://localhost:8080`** in your browser to play immediately!

For full native desktop compilation (Godot 4 C#) and Cloud Run Docker deployment, consult:
* [Client Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)
* [Cloud Deployment Guide (CLOUD_DEPLOYMENT.md)](CLOUD_DEPLOYMENT.md)
* [Contributing Guide (CONTRIBUTING.md)](CONTRIBUTING.md)

---

## 📖 Complete Documentation Index

| Documentation Guide | Primary Topic |
|---|---|
| 📡 **[Wire Protocol Specification (PROTOCOL.md)](PROTOCOL.md)** | Full specification of the JSON IPC format between engine and frontends. |
| 🏛️ **[Client Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)** | Multi-realm process isolation, Godot scene graph, and Three.js coordinate mapping. |
| 🧠 **[Best Practices & Lessons Learned (BEST_PRACTICES_AND_LESSONS_LEARNED.md)](BEST_PRACTICES_AND_LESSONS_LEARNED.md)** | 34 master project invariants (`L1–L34`), GPU memory management, and anti-trap guidelines. |
| 🗺️ **[Generic Engine Integration Guide (GENERIC_ENGINE_INTEGRATION.md)](GENERIC_ENGINE_INTEGRATION.md)** | Step-by-step blueprint for porting classic ASCII engines into 3D. |
| 💾 **[Save System & Universal Persistence (SAVE_SYSTEM.md)](SAVE_SYSTEM.md)** | Binary save formats, cloud storage, and cross-platform portability. |
| 🎨 **[Hybrid Graphics Master Plan (HYBRID_GRAPHICS_MASTER_PLAN.md)](HYBRID_GRAPHICS_MASTER_PLAN.md)** | 4096 HD atlases, normal mapping, biomes, and lore audit proofs. |
| ☁️ **[Cloud Deployment Guide (CLOUD_DEPLOYMENT.md)](CLOUD_DEPLOYMENT.md)** | Production deployment on Google Cloud Run, session affinity, and process pool architecture. |
| 🤝 **[Contributing Guide (CONTRIBUTING.md)](CONTRIBUTING.md)** | Contribution guidelines, asset recipes, and how to get involved. |

---

## ⚖️ Legal Notices, Trademarks & Non-Commercial Policy

**Angband 3D** is an independent, non-commercial, open-source fan project created out of deep reverence for classic roguelikes and high fantasy literature.

* **Literary Inspiration**: The setting, lore, and names draw inspiration from the literary legendarium created by **J.R.R. Tolkien**.
* **Trademarks**: *The Lord of the Rings*, *The Hobbit*, *Middle-earth*, *Angband*, and *Moria* are trademarks or registered trademarks of **Middle-earth Enterprises, LLC** (Embracer Group AB) and/or **The Tolkien Estate**. This project is not affiliated with, endorsed by, or sponsored by Middle-earth Enterprises or The Tolkien Estate.
* **Strict Non-Commercial Policy**: Angband 3D is 100% free software. It contains **no advertisements, no microtransactions, no paywalls, and accepts no donations or commercial sponsorship**.
* **Open Source Licensing**:
  * Authoritative game engines: **GNU General Public License v2** (GPL-2.0) across **Angband 4.2.6**, **Sil-Q 1.5.0**, **FrogComposBand 7.1.1**, and **Hengband 3.0.1**. Source code is included in full. Full terms in [`LICENSE`](https://github.com/ThunderbearStudios/angband3d/blob/fix/award-pass/LICENSE) and [`LEGAL.md`](https://github.com/ThunderbearStudios/angband3d/blob/fix/award-pass/LEGAL.md).
  * 3D Models & PBR Textures: Permissive **CC0 1.0 Universal** public domain dedications (**Poly Haven**, **KayKit**, **Kenney**, **Quaternius**).
  * Monster & Item Pixel Art: Raymond "Shockbolt" Gaustadnes and the Angband Development Team (GPL-2.0 / Angband Open Source License).
  * Fonts: SIL Open Font License 1.1. Full credits in [`CREDITS.md`](https://github.com/ThunderbearStudios/angband3d/blob/fix/award-pass/CREDITS.md).


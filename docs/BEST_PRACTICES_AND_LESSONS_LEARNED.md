# Angband3D — Master Architecture, Best Practices & Lessons Learned

> **Target Audience**: Autonomous AI Agents, LLM Pair Programmers, and Human Systems Engineers.  
> **Mission**: Encapsulate the hard-won architectural patterns, critical invariants, failure modes, and efficiency protocols developed across the entire lifecycle of `angband3d` — bridging 30+ years of authoritative legacy C roguelike mechanics with modern 3D rendering engines (Godot 4, Three.js WebGL, WebAssembly, and Android Capacitor).

---

## Table of Contents
1. [Core Architectural Philosophy](#1-core-architectural-philosophy)
2. [Legacy C Engine Interop & Rebasability Invariants](#2-legacy-c-engine-interop--rebasability-invariants)
3. [The Dual-Channel JSON Streaming Protocol](#3-the-dual-channel-json-streaming-protocol)
4. [View Routing & State Transition Architecture (`NeedsTerminal`)](#4-view-routing--state-transition-architecture-needsterminal)
5. [WebAssembly, Asyncify & Web Worker Thread Isolation](#5-webassembly-asyncify--web-worker-thread-isolation)
6. [Offline Persistence & IndexedDB (`IDBFS`) Architecture](#6-offline-persistence--indexeddb-idbfs-architecture)
7. [Spatial 3D Coordinate Mapping, Shading & Graphics Optimization](#7-spatial-3d-coordinate-mapping-shading--graphics-optimization)
8. [Cross-Platform UX: Desktop Roguelike vs. Mobile Responsive Touch](#8-cross-platform-ux-desktop-roguelike-vs-mobile-responsive-touch)
9. [Procedural Audio Synthesis & Master Dynamics Limiting](#9-procedural-audio-synthesis--master-dynamics-limiting)
10. [Android APK Packaging & Modern Play Store Compliance](#10-android-apk-packaging--modern-play-store-compliance)
11. [Cloud Architecture, Container Isolation & Process Lifecycles](#11-cloud-architecture-container-isolation--process-lifecycles)
12. [Autonomous AI Agent & Developer Operating Protocols](#12-autonomous-ai-agent--developer-operating-protocols)
13. [Standalone Packaging, CI/CD & Security Invariants](#13-standalone-packaging-cicd--security-invariants)
14. [Universal Save Interoperability & Community Infrastructure](#14-universal-save-interoperability--community-infrastructure)
15. [The Living Chronicle, Cinematic Story Audio & Web-Only Tome Architecture](#15-the-living-chronicle-cinematic-story-audio--web-only-tome-architecture)
16. [Hybrid 2.5D/3D PBR Visual Architecture, 4096 HD Atlases, De-Fringing & Lore Invariants](#16-hybrid-25d3d-pbr-visual-architecture-4096-hd-atlases-de-fringing--lore-invariants)
17. [Tactical Combat Narrative & Item Resolution Architecture](#17-tactical-combat-narrative--item-resolution-architecture-v270--web-v790)
18. [Seamless Vocal Handoff Architecture & Contextual Tolkien Lore Grounding](#18-seamless-vocal-handoff-architecture--contextual-tolkien-lore-grounding-v280--web-v800)
19. [Dynamic Story Catch-Up Engine & Tolkien Saga Context Consolidation Architecture](#19-dynamic-story-catch-up-engine--tolkien-saga-context-consolidation-architecture-v290--web-v810)
20. [Bidirectional Passage Tracking, Card Play/Pause Controller & Previous Point Playback](#20-bidirectional-passage-tracking-card-playpause-controller--previous-point-playback-architecture-v2100--web-v820)
21. [Core Movement Input Disambiguation & Safe Transport Hotkeys](#21-core-movement-input-disambiguation--safe-transport-hotkeys-v2110--web-v830)
22. [Absolute Vocal Mutual Exclusion & Zero Concurrent Voice Overlap](#22-absolute-vocal-mutual-exclusion--zero-concurrent-voice-overlap-v2111--web-v831)
23. [Visual Vocal Telemetry, Skipped Event Taxonomy & Real-Time Interruption Context Architecture](#23-visual-vocal-telemetry-skipped-event-taxonomy--real-time-interruption-context-architecture-v2112--web-v832)
24. [YouTube-Grade In-Engine Gameplay Commercial & Veteran Theater Showcase Architecture](#24-youtube-grade-in-engine-gameplay-commercial--veteran-theater-showcase-architecture-v2120--web-v840)
25. [Broadcast-Quality Authentic In-Engine Walkthrough Video Recording, Monster Scaling Invariants & Coordinate Facing Systems](#25-broadcast-quality-authentic-in-engine-walkthrough-video-recording-monster-scaling-invariants--coordinate-facing-systems)
26. [Dedicated Walkthrough Showcase Routing, Under-Video Controls Architecture & Cross-Platform Parity Invariants](#26-dedicated-walkthrough-showcase-routing-under-video-controls-architecture--cross-platform-parity-invariants)
27. [Choreographed Gameplay Walkthrough Invariants: Authentic Grid Topology, Real In-Engine Turn Actions & Vocal Mutual Exclusion](#27-choreographed-gameplay-walkthrough-invariants-authentic-grid-topology-real-in-engine-turn-actions--vocal-mutual-exclusion)
28. [Reimagined Showcase Architecture: Dynamic Multi-Depth Perspectives, Camera Facing Synchronization, UI Spotlight & Clean Insignia Cards](#28-reimagined-showcase-architecture-dynamic-multi-depth-perspectives-camera-facing-synchronization-ui-spotlight--clean-insignia-cards)
29. [Award-Ready Production Finalization: Tall 2-Tile Shockbolt Detection, Vocal Dialogue Choreography, Message Drawer Mutual Exclusion, and Release Asset Isolation](#29-award-ready-production-finalization-tall-2-tile-shockbolt-detection-vocal-dialogue-choreography-message-drawer-mutual-exclusion-and-release-asset-isolation)

---

## 1. Core Architectural Philosophy

### 1.1 The Golden Rule: Front End Extension, Never a Reimplementation
Angband represents over thirty years of continuous game balance, edge cases, formulas, level feelings, dungeon generation heuristics, and thousands of distinct items, monsters, curses, and artifacts.
- **The Rewrite Trap**: Attempting to rewrite Angband in C#, JavaScript, or Rust is an infinite-sink project that invariably results in an inferior, bug-ridden clone.
- **The Supported Extension Point**: Angband's C codebase cleanly separates game logic from display via its `term` abstraction (`src/main-xxx.c`). By creating `main-bridge.c`, we treat Angband as a pure, authoritative game server emitting structured JSON frames and receiving standard keypresses over stdio.
- **Single Source of Truth**: Mechanics, RNG, combat formulas, saving/loading, and player status calculations are 100% authoritative in the C engine. The 3D and 2D clients are strictly presentation and control relays.

---

## 2. Legacy C Engine Interop & Rebasability Invariants

### 2.1 Keeping the Upstream Fork Rebasable
Angband is actively maintained upstream. A fork that cannot merge upstream patches is technical debt.
- **Minimal Footprint**: All bridge logic resides in new, isolated files (`engine/src/main-bridge.c`, `engine/src/bridge-json.c`, `engine/src/bridge-json.h`).
- **Registration Only**: Exactly four existing core files are modified, solely to register the bridge module:
  - `src/main.h`: Declares `init_bridge` and `help_bridge`.
  - `src/main.c`: Adds one entry in `modules[]`.
  - `CMakeLists.txt`: Mirrors the frontend build flags.
  - `src/Makefile.src`: Adds `BRIDGEMAINFILES`.
- **Clean Patch Regeneration**: Never alter upstream game formulas. When updating engine bridge code, always regenerate the clean git patch:
  ```powershell
  cd engine; git diff 4.2.6..HEAD --output=..\engine-patch\0001-bridge-frontend.patch
  ```
  > [!CAUTION]
  > **Windows Redirection Hazard**: NEVER use PowerShell `>` redirection (`git diff ... > patch.patch`). PowerShell defaults to UTF-16 with byte-order marks (BOM) or CRLF mismatch, which irreversibly breaks `git apply` in CI and on Linux! Always use `--output=`.

### 2.2 Memory Safety & Safe State Querying
- **The Uninitialized Grid Trap (`bridge_in_play`)**: During level transitions, dungeon generation, and character birth, the dungeon coordinate grid (`cave`) is either null, unallocated, or in an inconsistent intermediate state. Any coordinate lookup during these frames will segfault.
  ```c
  /* Invariant Guard: MUST precede any grid, monster, or object coordinate access */
  static bool bridge_in_play(void) {
      return character_dungeon && character_generated && cave && player
          && player->upkeep && !player->upkeep->generate_level
          && square_in_bounds(cave, player->grid);
  }
  ```
- **Optional Slot Lookup Assertion**: In Angband's equipment code, calling `slot_by_name()` on optional slots (such as weapon, bow, or shield) triggers an internal `assert()` and immediately terminates the process if the slot is empty.
  - **Best Practice**: Never call `slot_by_name()` on optional slots. Instead, use `bridge_get_equipped_by_type(player, EQUIP_*)`, iterating through `player->body.slots` safely.
- **Filesystem Creation Invariant**: Under Windows, `main.c` bypasses directory creation for saves when running without UNIX flags. `main-bridge.c` must explicitly invoke `create_needed_dirs()` during initialization, otherwise saving silently fails on fresh installs.

---

## 3. The Dual-Channel JSON Streaming Protocol

### 3.1 Keypresses Over Stdio vs. `cmdq_push`
A common temptation when building a wrapper is injecting structured commands into `cmdq_push()`. This was considered and firmly rejected:
- **Why `cmdq_push` Fails**: Massive portions of Angband's interface are interactive prompts triggered *inside* synchronous game logic (e.g. "Which item?", "Which spell?", "Which direction?", store bargaining, yes/no queries, character birth roller review). These cannot be expressed as queued commands.
- **Why Keypress Dispatch Succeeds**: Delivering input as standard keypresses (`key <spec>` or `keys <text>`) through `Term_keypress()` allows the entire legacy UI surface — birth, menus, stores, item prompts, targeting, wizard mode — to work out of the box with zero custom C reimplementation.

### 3.2 Dual Channels: Structured Telemetry + Raw ASCII Fallback
1. **The Structured Channel**: Emits parsed, typed data for 3D exploration:
   - Player stats, HP/SP, equipment arrays, inventory arrays.
   - 2D grid slice around the player with 2-hex encoded feature indices (`f`) and flags (`flag`).
   - Monster entities: position `(y, x)`, glyph, color, health percent, speed, status.
   - Object entities: position `(y, x)`, kind index, flavor, description.
2. **The Raw Terminal Channel (`term.rows`)**: Emits the 80x24 character buffer.
   - Serves as the universal fallback for complex menus, store dialogs, and classic ASCII inspectors.
   - As native 3D/HTML5 UI matures for specific features, reliance on the raw channel decreases, but having the raw fallback guarantees 100% functionality at all times.

### 3.3 Frame Timing & Input Throttling
- The bridge emits a frame **only when the engine genuinely blocks for input** (`TERM_XTRA_EVENT` with wait flag set).
- Non-blocking polls return "no event" immediately.
- This produces exactly **one JSON frame per decision point**, avoiding CPU waste and keeping serialization lightweight.

---

## 4. View Routing & State Transition Architecture (`NeedsTerminal`)

### 4.1 The View Routing Matrix
A recurring failure mode in roguelike 3D frontends is flickering or getting stuck between the 3D world view and the 2D terminal. Angband3D resolves this with a strictly governed view routing function (`needsTerminal` in JavaScript / `NeedsTerminal` in C#):

```
                                  +-------------------+
                                  |    New Frame      |
                                  +---------+---------+
                                            |
                      +---------------------+---------------------+
                      |                                           |
             [phase != "play"?]                           [phase == "play"]
                      |                                           |
                     YES                                          |
                      |                                           |
            +---------v---------+                                 |
            |   TERMINAL VIEW   |                                 |
            | (Birth, Setup)    |                                 |
            +-------------------+                                 |
                                                                  |
                                       +--------------------------+--------------------------+
                                       |                          |                          |
                             [ui.overlay > 0?]      [!awaiting_command && !more?]      [more == true?]
                                       |                          |                          |
                                      YES                        YES                        YES
                                       |                          |                          |
                             +---------v---------+      +---------v---------+      +---------v---------+
                             |   TERMINAL VIEW   |      |   TERMINAL VIEW   |      |     3D WORLD      |
                             | (Stores, Menus)   |      | (Target, Prompts) |      | (HUD Banner Alert)|
                             +-------------------+      +-------------------+      +-------------------+
```

### 4.2 Invariant Rules of View Routing
1. **`phase != "play"`**: Engine is in setup/birth/death. Terminal must be shown.
2. **`ui.overlay > 0`**: Player is browsing stores, inventory, or help screens. Terminal must be shown.
3. **`!awaiting_command && !more`**: Engine is asking a synchronous query (e.g. "Target which direction?", "Are you sure? [y/n]"). Terminal must be shown.
4. **`more == true` (-more- prompt)**: **STAY IN 3D VIEW**. Display the message on the top HUD banner. Allow space/click/touch to dismiss. Auto-flush if safe. Never flash the terminal for a basic message banner.

### 4.3 Ring-Buffer Message Baselining
Angband's C engine maintains a circular message history buffer of the last 24 messages.
- **Gotcha**: When a player finishes character creation and enters the dungeon, historical birth prompts (e.g. `Use this character? [y/n]`, `Character created`) remain in the message array.
- **Solution**: When transitioning from `setup` to `play` (`inPlay && !wasInPlay`), the frontend must snapshot `prevMessages = frame.messages` and baseline the log so birth history does not contaminate in-game combat feed.

---

## 5. WebAssembly, Asyncify & Web Worker Thread Isolation

### 5.1 Asyncify: The Bridge Over Blocking Loops
Angband's standard execution model is a synchronous, blocking while-loop: `while (!dead) { inkey(); process(); }`.
In JavaScript and WebAssembly, blocking the main thread freezes the entire browser window, stops WebGL rendering, and prevents event dispatching.
- **Asyncify Solution**: Compiling with Emscripten `-sASYNCIFY` rewinds and unwinds the C callstack whenever the engine awaits input.
- **Execution Hook**: In JavaScript, `onAwaitingInput` is invoked when Asyncify suspends execution, allowing queued commands to resolve the pending Promise.

### 5.2 Thread Isolation with Web Workers (`engine-worker.js`)
- Even with Asyncify, running the C engine on the main thread causes micro-stutters during level generation or complex AI pathfinding.
- **Worker Separation**: The compiled Wasm runtime lives inside a dedicated background Web Worker (`engine-worker.js`).
- The main thread handles Three.js rendering, camera tweening, particle VFX, and touch handling at a steady 60/120fps.
- Frames and commands communicate via zero-copy structured `postMessage()`.

---

## 6. Offline Persistence & IndexedDB (`IDBFS`) Architecture

### 6.1 The Critical Emscripten IDBFS `timestamp` Index Gotcha
When Emscripten mounts its virtual filesystem to IndexedDB (`FS.mount(IDBFS, ...)`), it uses an object store named `FILE_DATA`.
- **The Bug**: In `IDBFS.getRemoteSet()`, Emscripten executes:
  ```javascript
  var index = store.index('timestamp');
  ```
  If IndexedDB was initialized or opened elsewhere without creating the `'timestamp'` index on `FILE_DATA`, IndexedDB throws:
  ```
  NotFoundError: The specified index was not found.
  ```
- **The Consequence**: When `FS.syncfs(true)` fails with `NotFoundError`, Wasm MEMFS `/lib/save` remains completely empty. Angband boots, checks `file_exists(loadpath)`, finds nothing, and silently dumps the player into character creation (`textui_do_birth`), wiping progress!
- **The Fix**:
  1. Set database version consistently across both the Wasm loader and the frontend (e.g. `DB_VERSION = 22`).
  2. In `onupgradeneeded`, always verify and create the index:
     ```javascript
     if (store && !store.indexNames.contains('timestamp')) {
         store.createIndex('timestamp', 'timestamp', { unique: false });
     }
     ```
  3. Upgrading `DB_VERSION` triggers migration automatically, preserving existing save data while adding the missing index.

### 6.2 Asynchronous Worker Termination Race Condition
- **The Bug**: On menu exit, calling `network.sendCommand('save')` immediately followed by `worker.terminate()` kills the worker thread before `IDBFS.syncfs(false)` can commit file bytes from MEMFS to IndexedDB!
- **The Fix**: Implement a two-phase commit:
  ```javascript
  async saveAndDisconnect() {
      await this.saveGame(); // Awaits 'saved_persisted' event from worker
      this.disconnect();     // Safely terminates worker only after DB write
  }
  ```

### 6.3 Savefile Naming & Alias Reconciliation
- Angband on UNIX treats savefiles as raw filenames without mandatory extensions (`/lib/save/Hero_A1B2`).
- Web downloads, desktop clients, and file choosers frequently append `.sav` (`Hero_A1B2.sav`).
- **Best Practice**: In `engine-worker.js` during `preRun` after `syncfs(true)`, reconcile file aliases. If either `<name>` or `<name>.sav` exists in MEMFS, mirror the bytes to both slots.

---

## 7. Spatial 3D Coordinate Mapping & Visibility Shading

### 7.1 Coordinate Systems
Roguelikes and 3D graphics engines use fundamentally different coordinate spaces:
- **Angband Dungeon**: `(y, x)` where `y` is row index (increasing downward / south) and `x` is column index (increasing rightward / east).
- **Three.js & Godot 3D**: `(X, Y, Z)` where `X` is east, `Y` is elevation / vertical height, and `Z` is south (positive Z = downward row).
- **Camera Orientation**:
  - North: Yaw $0^\circ$ (Looking down $-Z$)
  - East: Yaw $90^\circ$ (Looking down $+X$)
  - South: Yaw $180^\circ$ (Looking down $+Z$)
  - West: Yaw $270^\circ$ (Looking down $-X$)

### 7.2 Feature Index (`f`) vs. Glyph (`g`)
- **The Monster Occlusion Bug**: In Angband's display grid, when a monster stands on a door or stair tile, the character glyph `g` changes to the monster's symbol (e.g. `'o'`, `'D'`).
- **The Rule**: Never construct 3D dungeon walls, floors, or doors from the display glyph `g`. Geometry MUST be determined by the 2-hex feature index `f`.
- **2-Hex Encoding**: In the JSON bridge, `map.rows[y].f` is encoded as two hexadecimal characters per tile. Decode using:
  ```javascript
  const feat = parseInt(fStr.substring(x * 2, x * 2 + 2), 16);
  ```

### 7.3 Sealing the Void & Dark Tile Fog of War
- In a classic 2D roguelike, unmapped tiles are simply black ASCII spaces. In 3D, unmapped tiles become transparent holes into an infinite void, revealing wall silhouettes, monster tokens, or chamfer seams.
- **The Fix**:
  - Emit solid boundary geometry for all adjacent unmapped coordinates.
  - Implement dynamic light falloff and fog-of-war gating: unvisited or out-of-LOS tiles must have emissive, diffuse, and specular values clamped to zero so creatures lurking in the dark remain 100% invisible.

### 7.4 Camera Euler Order ('YXZ') & Dutch-Angle Tilt Elimination
- **The Bug**: Three.js defaults to `'XYZ'` Euler rotation order. When calculating yaw (turning left/right) and pitch (looking up/down), applying pitch before yaw introduces stationary roll drift ($Z$-axis rotation). This creates a disorienting diagonal tilt (Dutch-angle) when looking around dungeon rooms.
- **The Fix**:
  ```javascript
  camera.rotation.order = 'YXZ'; // Yaw around world Y first, then pitch around local X
  camera.rotation.z = 0;         // Stationary roll clamped strictly to zero
  ```
  This preserves pitch compensation for player race/height without tilting the horizon.

### 7.5 Three.js `InstancedMesh` Color Buffer Initialization
- **The Bug**: In Three.js, `InstancedMesh` uses an internal buffer attribute for per-instance color (`instanceColor`). If an `InstancedMesh` is created without explicitly initializing `instanceColor` buffers to 1.0 (white albedo), Three.js multiplies the texture albedo by (0, 0, 0), rendering the entire dungeon pitch black regardless of lighting!
- **The Fix**: Always pre-initialize `instanceColor` during mesh setup:
  ```javascript
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1.0), 3);
  ```

### 7.6 Zero-Allocation 3D Web Rendering & Scratch Buffer Caching
- Roguelike map updates arrive every step (up to 10+ frames/second during movement or rest loops). Allocating `new THREE.Vector3()`, `new THREE.Color()`, or intermediate transformation matrices inside the per-tile iteration generates ~15,000 garbage objects per frame, triggering periodic browser Garbage Collector (GC) pauses (frame drops from 60fps to 15fps).
- **The Fix**: Pre-allocate reusable static scratch objects in module scope:
  ```javascript
  const _scratchVec = new THREE.Vector3();
  const _scratchColor = new THREE.Color();
  const _scratchMatrix = new THREE.Matrix4();
  ```
  This eliminates heap allocation churn entirely during active exploration.

---

## 8. Cross-Platform UX: Desktop Roguelike vs. Mobile Responsive Touch

### 8.1 The Dual-Control Paradigm
Desktop players expect traditional roguelike keyboard controls (numpad directionals, vi keys, complex hotkeys like `r`, `q`, `d`, `k`, `Ctrl-S`). Mobile players require single-handed touch accessibility.
- **Virtual Movement Cluster**: Docked bottom-left. Features cardinal directions plus dedicated strafe (`<`, `>`) and turn wings.
- **Tactical Action Cluster**: Docked bottom-right in a 2-column grid. Provides quick access to contextual actions (Attack/Rest, Target Nearest `'`, Fire Missile `h`, Pick Up `g`, Cast `m`, Use Item `u`).
- **Landscape Viewport Budgeting**: On mobile landscape (`max-height: 520px`), viewport real estate is precious.
  - Left dock: Movement D-Pad.
  - Right dock: Tactical Action Cluster.
  - Center bottom: Status bar (`HP`, `SP`, `AC`, `Gold`).
  - Top bar: Depth, Turn count, and compact Message ticker.
  - Strict zero-overlap invariant: action panels and HUD footers must dynamically clamp margins using CSS `env(safe-area-inset-*)` and `max()`.

### 8.2 Strict Keyboard Movement Invariant (NO WASD in Roguelikes)
- In modern FPS/action games, `WASD` is standard. In classic roguelikes, `w` = wield/wear, `s` = spike door / sell in store, `a` = aim wand, and `d` = drop item.
- **The Trap**: Attempting to remap movement to WASD breaks core game mechanics and corrupts muscle memory.
- **The Invariant**: Movement is strictly Arrow keys and Number Pad (`Numpad8`=forward, `Numpad2`=back, `Numpad4`=strafe left, `Numpad6`=strafe right, `Numpad7,9,1,3`=diagonals, `Numpad5`=stay/rest/attack). Single-letter keys pass unhindered to the Angband engine.

### 8.3 Touch Gestures on ASCII Canvas & Command Isolation
- The classic 80x24 terminal canvas (`#terminal-viewport`) must handle pinch-to-zoom and drag-to-pan natively.
- **Command Isolation**: Touching the canvas must NEVER fire accidental game commands or directional steps. Tactical navigation keys must be dispatched through explicit virtual touch controls or keyboard events.

### 8.4 3D-to-2D Orientation Assistance & Radar Cone-of-Sight
- Switching from 3D first-person perspective to classic 2D top-down ASCII map causes disorientation.
- **The Solution**:
  1. Direct 3D camera facing badge (`#term-facing-badge`) in the terminal toolbar (e.g. `🧭 3D: NORTH (▲)`).
  2. Forward directional highlight: dynamically pulses gold (`.fwd-highlight`) on the specific D-pad button matching current 3D yaw.
  3. Radiant golden FOV cone (~62° arc) and central red sightline drawn directly onto the classic terminal canvas radiating outward from `@` along current 3D camera yaw.

### 8.5 Mobile Touch Latency Elimination & Haptics
- By default, mobile browsers impose a 300ms click delay.
- **The Fix**: Injected universal `touch-action: manipulation; -webkit-tap-highlight-color: transparent;` across all interactive elements.
- Upgraded touch buttons with dual `pointerdown` + `click` event listeners with 100ms debouncing, completely bypassing the 300ms mobile touch delay without double-triggering.
- Integrated multi-pattern tactile haptics (`DeviceProfile.triggerHaptic`) via `navigator.vibrate` for light, medium, heavy, and warning button presses.

---

## 9. Procedural Audio Synthesis & Master Dynamics Limiting

### 9.1 Zero Network Asset Downloads & Web Audio Synthesis
- Downloading dozens of static `.wav` or `.mp3` files adds megabytes to client bundles, introduces network latency, and causes 404 errors during offline play.
- **The Solution**: 100% synthesized client-side via the Web Audio API (`audio.js`) and C# dynamic PCM synthesizer (`AudioManager.cs`).

### 9.2 Master Dynamics Limiter Node
- Multiple concurrent sounds (slashes, spells, footsteps, grunts) cause waveform summation exceeding 0 dBFS, resulting in harsh digital clipping distortion.
- **The Mandatory Invariant**: Insert a `DynamicsCompressorNode` before the audio destination:
  ```javascript
  const limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-12, audioCtx.currentTime); // -12dB threshold
  limiter.knee.setValueAtTime(12, audioCtx.currentTime);       // 12dB soft knee
  limiter.ratio.setValueAtTime(4.5, audioCtx.currentTime);     // 4.5:1 ratio
  limiter.attack.setValueAtTime(0.003, audioCtx.currentTime);  // 3ms fast attack
  limiter.release.setValueAtTime(0.120, audioCtx.currentTime); // 120ms release
  limiter.connect(audioCtx.destination);
  ```

### 9.3 Inharmonic Physical Acoustic Models & Foley
- Implement Euler-Bernoulli bar mode frequencies ($f_0=460\text{Hz}$, $2.76f_0$, $5.40f_0$, $8.93f_0$) for metallic strikes.
- Sub-bass 75Hz drops for critical hits.
- Fibrous parchment texture noise + glowing triad chimes (C5, G5, E6) for scrolls.
- Liquid bottle uncork/pop transients + two resonant bubble gulps (480Hz & 580Hz) for potions.
- Creature vocalizations by glyph family: growls for canines (`C`, `Z`, `d`), venomous rattles/hisses for reptiles (`J`, `n`, `R`), chilling wails for undead (`G`, `W`, `L`, `v`), and sub-bass roars for dragons/demons (`D`, `U`, `B`).

### 9.4 The No-Ambient-Loop Constraint
- **User Invariant**: Strictly **NO ambient looping noise** (no droning wind or continuous hums).
- All audio must be 100% contextual: action, combat, interaction, warning, or status indication.

### 9.5 Acoustic Softening & Footstep Throttling
- Synthetic footsteps frequently produce harsh 1.6kHz resonant pings. Soften with warm low-frequency thuds and lowpass surface friction, and throttle playback per movement step to eliminate rapid machine-gun audio spikes.

---

## 10. Android APK Packaging & Modern Play Store Compliance

### 10.1 Target SDK 34 & Play Protect Requirements
Beginning with Android 14 (API level 34), Google Play Protect blocks or flags apps built against older target SDKs as "Unsafe App Blocked".
- Configure `android/app/build.gradle`:
  ```groovy
  minSdkVersion rootProject.ext.minSdkVersion   // 22+
  targetSdkVersion 34                          // Android 14 standard
  compileSdkVersion 34
  ```

### 10.2 Keystore Management & V1/V2 Signing
- Production APKs must be signed with both v1 (JAR signing) and v2 (Full APK Signature Scheme) using a valid keystore:
  ```groovy
  signingConfigs {
      release {
          storeFile file('release.keystore')
          storePassword '...'
          keyAlias '...'
          keyPassword '...'
          v1SigningEnabled true
          v2SigningEnabled true
      }
  }
  ```
- Always build using `assembleRelease`, eliminating debug symbols and development flags.

### 10.3 Asset Synchronization Automation
Capacitor packages the web root from `server/public/` into Android assets:
```bash
npm run android:sync # Executes: cap sync android
```
- CI/CD (`.github/workflows/release.yml`) must run `npx cap sync android` inside the runner before executing `./gradlew assembleRelease` to guarantee that the latest compiled Wasm engine and client scripts are baked directly into the APK binary.

### 10.4 Sideloading User Experience Guidance
When users install release APKs directly outside the Play Store, Android displays an installation warning.
- Provide clear in-modal guidance:
  `Tap "More details ∨" and select "Install anyway" to proceed with installation.`

---

## 11. Cloud Architecture, Container Isolation & Process Lifecycles

### 11.1 Headless Linux Multi-Stage Docker Container
- Use multi-stage Docker builds (`server/Dockerfile`):
  1. Stage 1: Build Angband 4.2.6 C engine with Bridge frontend using `gcc` and `cmake`.
  2. Stage 2: Minimal Node.js Alpine/Slim runtime containing the compiled engine binary and WebSocket server.

### 11.2 Isolated Session Processes & Stdio Pipes
- Each connected WebSocket client spawns a dedicated, isolated Angband process (`child_process.spawn`).
- Session isolation ensures that memory leaks, crashes, or stalls in one session cannot affect other players.

### 11.3 Save Directory Auto-Discovery & Universal Export
- Pass `-dsave=${SAVE_DIR}` to direct savefile writes to persistent mounts.
- Multi-directory discovery scanner checks `/data/save`, `lib/save`, and `~/.angband/Angband/save`, auto-mirroring files to `/data/save`.
- Provide direct binary download (`.sav`) and upload endpoints with `SaveVNLA` magic header validation.

### 11.4 Idle Connection Reaper & Cloud Run Compute Caps
- Inactive player sessions consume memory and container instances.
- Implement an idle session reaper: automatically flush saves and terminate engine processes after 15 minutes of inactivity.
- Configure Cloud Run maximum instances to prevent runaway compute costs.

### 11.5 Download Endpoints & HEAD Request Support
- Download endpoints (`/download/Angband3D-Android.apk`, `/download/angband3d-standalone.zip`) must handle both `GET` and `HEAD` HTTP methods.
- Download managers and browsers send `HEAD` requests to inspect file size and MIME type before downloading; returning 405 on `HEAD` breaks mobile downloads. Issue 302 redirects to GitHub release assets.

---

## 12. Autonomous AI Agent & Developer Operating Protocols

### 12.1 Zero-Turn Orientation Protocol
When an autonomous agent resumes work or starts a new session:
1. Run `git status` to inspect unstaged changes and the active branch.
2. Read `docs/NEXT_STEPS.md` for current in-flight milestones and priorities.
3. Read `docs/LLM_CONTEXT.md` for system invariants and symbol maps.
4. Consult this guide (`docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`) for edge cases and rationale.
5. Verify workspace health immediately:
   - `python tools/smoke_test.py` (11/11 tests, checks C engine JSON bridge in <0.5s).
   - `dotnet build client/angband3d.csproj` (checks Godot C# compilation in <1.5s).
6. **DO NOT** run recursive discovery searches (`**/*`) or dump multi-thousand line files into the context window. All key files are indexed in `docs/LLM_CONTEXT.md`.

### 12.2 Targeted Inspection & Surgical Edits
- **Windowed Reads**: Read only the relevant line range (20–100 lines) around target symbols.
- **Surgical String Edits**: Use exact multi-line replacement tools with 3 lines of unchanged context. Never rewrite entire files.
- **Non-Polling Command Execution**: Never execute bash sleep loops (`while true; sleep 1; ...`) or poll status commands in a loop. Rely on reactive task notifications and scheduled timers.

### 12.3 Test-Driven Verification Loop
For every architectural change or bug fix:
1. **Reproduce via Script**: Create a minimal scratch test (e.g. `scratch/test_*.js` or `scratch/test_*.py`) that reproduces the bug under headless automation.
2. **Apply Surgical Fix**: Modify only the target files.
3. **Verify End-to-End**: Run the automated test harness to confirm resolution before pushing or tagging.
4. **Clean Up Scratch Files**: Delete temporary debugging artifacts before committing.
5. **Document Invariant**: Record the root cause, fix, and newly discovered lesson in `docs/NEXT_STEPS.md` and this master guide.

### 12.4 Preserving Test Automation Hooks (`window.__app` Invariant)
- When refactoring web coordinators (such as `server/public/js/app.js`), NEVER overwrite global handles (`window.__app`) in a manner that strips test methods (`setEngineMode`, `startGame`, `network`, `dungeon`).
- Automated headless test scripts rely on these hooks to drive headless browser tests without manual UI clicking.

### 12.5 Continuous Living Documentation
- Code without up-to-date documentation leads to repeated mistakes across developer generations.
- Update `docs/NEXT_STEPS.md` upon completing any milestone.
- Update `docs/LLM_CONTEXT.md` whenever an architectural invariant or gotcha is discovered.
- Keep `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md` authoritative and synchronized.

---

## 13. Standalone Packaging, CI/CD & Security Invariants

### 13.1 The Godot Standalone Release Packaging Contract
An end-user downloading a game distribution expects a standalone executable that runs immediately without requiring external SDKs, winget, or developer toolchains.
- **Mandatory Standalone Artifacts**: The packaged `Angband3D-Windows-x64.zip` (and canonical `angband3d-standalone.zip`) must contain:
  1. `Angband3D.exe`: The standalone Godot 4 binary (compiled from export templates).
  2. `Angband3D.pck`: Packed virtual filesystem containing scene trees, materials, models, and scripts.
  3. `data_angband3d_windows_x86_64/`: The .NET / Mono runtime assemblies (`GodotSharp.dll`, `System.Private.CoreLib.dll`, `angband3d.dll`, etc.).
  4. `engine/build/game/angband.exe` + `engine/build/game/lib/`: The native C engine binary and standard gamedata libraries.
  5. `Play-Angband3D.cmd`: Quick launcher that invokes `Angband3D.exe` directly while forwarding arguments.
- **Silent Fallback Prohibition**: `tools/package.ps1` must never silently swallow export failures. If Godot or export templates are missing, packaging must fail immediately with exit code 1 unless an explicit `-AllowSourceFallback` switch is passed.
- **Post-Staging Binary Verification**: The packaging tool must explicitly assert `Test-Path` on `Angband3D.exe`, `Angband3D.pck`, and the `data_*` directory before generating the ZIP archive.
- **CI Toolchain Parity**: In `.github/workflows/release.yml`, the `windows-latest` runner must explicitly download Godot Mono and export templates. A build runner that lacks Godot cannot produce a standalone binary.

### 13.2 Security Audit & Hardening Invariants
- **Path Traversal Prevention in Static Delivery**:
  - Never rely on naive string replacement like `.replace(/^(\.\.[\/\\])+/, '')`, which only strips leading dot-dots.
  - Always use `path.resolve(WEB_DIR, '.' + path.sep + safePath)` followed by strict prefix validation: `if (!filePath.startsWith(path.resolve(WEB_DIR))) return res.writeHead(403)`.
- **Filename Sanitization & Reserved Windows Device Names**:
  - User-submitted filenames (e.g. `x-character-name` in savefile upload, or URL params in `GET /api/saves/:name`) must be sanitized using `path.basename(name).replace(/[^a-zA-Z0-9_.-]/g, '_')`.
  - Windows reserved DOS device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) must be explicitly matched and rejected. Attempting to write or open a file named `CON` or `NUL` on Windows causes process deadlocks or system errors.
- **Process Parameter Injection Guards**:
  - In server child process spawning (`spawn(ENGINE_EXE, args)`), query parameters passed as command line flags (e.g. `-u${user}`, `-u${save}`) must be strictly sanitized (`replace(/[^a-zA-Z0-9_-]/g, '')`) to prevent arbitrary flag or option injection into the C engine.
- **Headless Viewport Safety**:
  - When running Godot under `--headless`, `GetViewport().GetTexture()?.GetImage()` returns null because the rendering server disables viewport framebuffers. All screenshot/capture utilities must perform null-safety checks to prevent uncaught `NullReferenceException`.

### 13.3 The Godot Windows Mono Wrapper Invariant
- In Godot Mono (C#) releases on Windows, `Godot_*_mono_win64_console.exe` is a launcher wrapper that inspects its own filename to locate its companion GUI executable (`Godot_*_mono_win64.exe`) by stripping `_console` from its name.
- **The Wrapper Renaming Hazard**: Renaming or copying `Godot_*_console.exe` to `godot.exe` breaks this internal validation, causing Godot to immediately abort with:
  ```
  Invalid wrapper executable name.
  Exit Code: -1
  ```
- **The Correct Pattern**: Keep the original executable filename untouched. Point `$env:GODOT` directly to the authentic `Godot_*_console.exe`, and create a forwarder script (`godot.cmd`) in the Godot directory:
  ```cmd
  @echo off
  "%~dp0Godot_v4.7.2-stable_mono_win64_console.exe" %*
  ```

### 13.4 Export Presets Must Be Tracked in Git
- In Godot 4, headless CI export (`godot --headless --path client --export-release "Windows Desktop" ...`) requires `client/export_presets.cfg` to define the target presets and platform options.
- **The Gitignore Trap**: Placing `export_presets.cfg` in `.gitignore` causes clean CI runners to lack export presets entirely, resulting in immediate export failure (exit code 1) with no presets found.
- As long as private keystores and codesigning passwords are kept out of `export_presets.cfg` (or injected via environment variables), `client/export_presets.cfg` must be committed and tracked in version control.

### 13.5 Process Stdio Pipe Deadlocks During Heavy Asset Compression
- In .NET/PowerShell automation, executing child processes with both `RedirectStandardOutput = true` and `RedirectStandardError = true` while synchronously reading sequentially:
  ```csharp
  // HAZARD: DEADLOCK TRAP
  stdout = process.StandardOutput.ReadToEnd();
  stderr = process.StandardError.ReadToEnd();
  process.WaitForExit();
  ```
  will trigger an irreversible pipe buffer deadlock if the child process (such as Godot compressing 1 GB of VRAM textures) outputs more than 4 KB to STDERR before closing STDOUT.
- **The Solution**: Use PowerShell native streaming (`*>&1 | Tee-Object -FilePath $logPath`) or asynchronous event handlers (`OutputDataReceived` / `ErrorDataReceived`) to continuously drain OS pipe buffers without blocking.

---

## 14. Universal Save Interoperability & Community Infrastructure

### 14.1 Binary `SaveVNLA` Universal Compatibility Contract
- **Byte-for-Byte Interoperability**: Every client and platform target—WebAssembly MEMFS/IDBFS, native Windows Godot (.NET), Capacitor Android APK, and upstream Unix terminal Angband 4.2.6—reads and writes identical `SaveVNLA` binary format savefiles.
- **Zero Format Fragmentation**: Never alter savefile serialization headers or structure in `engine/src/savefile.c` or `main-bridge.c`.
- **Frictionless Export & Backup**:
  - The client provides 1-click binary save downloads via the in-game menu (`Esc -> Export Save`).
  - Players are free to back up, archive, and transfer characters between browser sessions, desktop machines, and mobile devices without loss of game history or inventory attributes.
  - While permadeath remains the traditional roguelike ethos, providing universal save access empowers players to learn Angband's immense 5000ft dungeon depth on their own terms.

### 14.2 Cloud Session Capacity, Idle Reaping & Traffic Safeguards
- **Isolated Process Sandboxing**: The cloud daemon (`server/src/server.js`) spawns isolated headless C engine instances for each active WebSocket player session.
- **Capacity Queuing**:
  - `MAX_CONCURRENT_GAMES = 50`: Prevents container resource starvation and runaway Cloud Run compute scaling.
  - `MAX_QUEUE_SIZE = 100`: Gracefully queues incoming connections with real-time position notifications (`"You are #X in line"`).
- **Proactive Idle Reaping**:
  - `IDLE_TIMEOUT_MS = 20 * 60 * 1000` (20 minutes): Automatically saves and terminates inactive processes to reclaim OS memory and free concurrency slots for active players.
- **Community Transparency**:
  - The web splash screen and main menu explicitly inform players of cloud capacity constraints and encourage downloading standalone desktop or Android offline builds for optimal 60+ FPS performance.

### 14.3 Contributor Onboarding & Zero-Turn Bootstrapping Checklist
Any developer or autonomous agent bootstrapping in this repository can verify and build the entire stack in under 60 seconds:
1. **Engine Smoke Test**: `python tools/smoke_test.py` (Asserts 11/11 tests pass: handshake, frame loop, birth, map, wizard mode, and binary save/load).
2. **C# Client Build**: `dotnet build client/angband3d.csproj` (Ensures Godot C# compilation succeeds with 0 errors).
3. **Desktop Host Build**: `dotnet build desktop/Angband3D.csproj` (Ensures Windows standalone host compiles cleanly).
4. **Cloud Server Tests**: `node server/test/server_test.js` (Verifies WebSocket relay, process spawning, REST saves, and path traversal guards).
5. **No Speculative Discovery**: Consult `docs/LLM_CONTEXT.md` for architectural invariants and file paths before making changes.

---

## 15. The Living Chronicle, Cinematic Story Audio & Web-Only Tome Architecture

### 15.1 Web-Only Tome Scope vs. Standalone Engine Purity
- **Strict Web Client Scope**: The Living Chronicle and Voiced Lorekeeper (`#btn-toggle-chronicle`, `#chronicle-window`, `ChronicleManager`) are strictly scoped to the Web Client (`https://angband3d.com` and browser environments).
- **Standalone Engine Purity**:
  - Standalone distributions (Windows PC `.zip`, Desktop WebView2 host, Android Capacitor `.apk`, and native Godot C# client) are dedicated to 100% offline, zero-dependency, ultra-low-latency dungeon crawling.
  - Standalone clients strictly suppress the Tome button and window (`body.is-standalone`, `display: none !important`), bypass `ChronicleManager.init()`, and avoid external cloud LLM or TTS network calls.
- **Universal Detection Invariant**:
  - Detection relies on `isStandaloneApp()` (`window.Capacitor`, `capacitor:` protocol, `isNativeAndroidApp`, `angband3d.local`, and `window.chrome.webview`).
  - `ChronicleManager.init()` self-guards against execution in standalone environments, ensuring complete isolation.

### 15.2 Flowing Saga Design: Elimination of Artificial Chapters & Canvas Sketches
- **Continuous Saga Continuity**:
  - Legacy artificial chapter cards (`Chapter 1: ...`, `.chapter-header-row`, golden divider banners) fragmented the reading experience and created artificial pauses in long dungeon delves.
  - Replaced by a clean, continuous flowing chronicle: every narrative event (combat, exploration, stairs descent, store visit) renders as an atmospheric prose block with a subtle depth tag (`Town`, `50ft`, etc.) and optional dialogue/hints.
- **Excising Graphic Canvas Sketches**:
  - 3D canvas snapshot capture (`captureCanvasThumbnail()`, `toDataURL()`) required `preserveDrawingBuffer: true` in Three.js, forcing the GPU to copy pixel buffers to system RAM every frame.
  - Removing canvas thumbnails completely eliminated this heavy GPU bandwidth tax, boosted framerates by 15–25%, and allowed disabling the WebGL stencil buffer (`stencil: false`).

### 15.3 Security Invariants & Zero-Leakage Credential Encapsulation
- **Server Backend Encapsulation**:
  - The master API key (`GEMINI_API_KEY`) is stored exclusively in backend environment variables (`.env`), which are gitignored and never committed.
  - `GET /api/config/llm` returns metadata only (`{ hasKey: true, hasServerKey: true, defaultModel: 'gemini-3.8-flash' }`) and strictly omits raw keys.
- **Protected Relay Proxies**:
  - `POST /api/llm/generate` and `POST /api/tts` act as server-side relays. Client browsers never make direct authenticated calls to Google Generative AI endpoints.
- **Zero-URL Exposure Policy**:
  - If a player provides their own API key, it is transmitted strictly via the HTTP header `x-goog-api-key`. Keys are NEVER formatted as URL query parameters (`?key=...`), preventing exposure in proxy logs, browser history, or network traces.
- **Immediate 401 Discrimination**:
  - HTTP 401 Unauthorized errors abort the generation loop immediately without triggering wasteful retry cascades.

### 15.4 Zero-Quality-Loss Performance Engineering
1. **WebGL Stencil Buffer Elimination (`dungeon3d.js`)**:
   - `stencil: false` saves VRAM and removes depth/stencil buffer clear passes on every render frame.
2. **Euclidean Distance-Squared Culling (`dungeon3d.js`)**:
   - Replacing `camera.position.distanceTo()` with `distanceToSquared()` eliminates hundreds of `Math.sqrt()` calculations per frame for terrain labels and monster nameplates.
3. **Raycaster & Math Vector Pooling (`dungeon3d.js`)**:
   - Reusable `this._mouseVec`, `this._raycaster`, and `this._tempVec3` eliminate object churn and GC pauses during mouse hover/target inspections.
4. **Static Module-Level RegExp Compilation (`chronicle-filter.js`, `chronicle-grounder.js`)**:
   - Hoisted 18 regex patterns (`RE_ATTACK`, `RE_THEFT`, `RE_HERO_ATTACK`, `RE_FLEE`, `RE_STORE_BUY`, `RE_SLAIN`, etc.) to module-level constants. Prevents tens of thousands of RegExp object instantiations per minute during combat bursts.
5. **O(1) Incremental Story Playlist Synchronization (`chronicle-manager.js`)**:
   - Appending story beats directly to `this.storyPlaylist` ($O(1)$) replaces linear $O(N)$ DOM parsing on active turns.
6. **In-Memory Static Gzip Caching (`server.js`)**:
   - Gzips static web assets once on first read and caches compressed buffers in RAM keyed by file `mtime`. Eliminates repetitive CPU compression and delivers web assets in `<1ms`.

### 15.5 Dual Voice Engines & Subterranean DSP Audio
- **Primary Voice Engine**: Gemini Native Audio with voice `Enceladus` and directorial notes evoking an experienced, warm, slightly British older storyteller.
- **Fallback Voice Engine**: Microsoft Edge Neural TTS with warm WebSocket connection pooling (`edgeVoicePool`), eliminating 250–450ms cold TLS connection latencies.
- **Subterranean Audio Processing**:
  - Web Audio impulse response convolver defaults to 10% wet reverb (`reverbWet = 0.10`), imparting an authentic subterranean stone reverberation.
  - Subtle biquad lowpass ribbon filter softens high-frequency sibilance.
- **Diegetic Shopkeeper Dialogue & Survival Hints**:
  - 7 unique shopkeepers provide practical Angband survival advice on purchase:
    - *Bilbo the Merchant* (General Store): Explains 1-tile torch radius and 4000-turn duration.
    - *Maulin the Alchemist* (Alchemist): Emphasizes that Cure Serious Wounds cures blindness and confusion.
    - *Father Kael* (Temple): Warns of the 15–25 turn activation delay on Word of Recall.
    - *Elephar the Armorer* (Armoury) & *Thurg the Bladesmith* (Weaponsmith): Detail AC scaling and weapon dice formulas.
    - *Eldred the Wizard* (Magic Shop) & *Lotho the Shady Fence* (Black Market): Advise on Phase Door escape and emergency escape items.

---

## 16. Hybrid 2.5D/3D PBR Visual Architecture, 4096 HD Atlases, De-Fringing & Lore Invariants

### 16.1 The Banker's Rounding Trap vs. Integer Floor Truncation
- **The Defect (The "Hippogriff" Row Shift)**:
  - In PowerShell, casting a float expression `[int]($i / 32)` does NOT truncate towards zero. Instead, it performs **IEEE 754 Banker's Rounding** (`[Math]::Round(..., MidpointRounding.ToEven)`).
  - When $i \pmod{32} \ge 16$, the fractional component is $\ge 0.5$. If the integer quotient is odd, it rounds up to the next even integer ($4.59375 \to 5$), shifting the UV calculation by an entire row ($\Delta \text{index} = +32$).
  - Meanwhile, C# image drawing logic uses standard integer division `i / 32`, which truncates toward zero ($\lfloor 147 / 32 \rfloor = 4$).
  - **The Result**: 320 out of 624 monsters and ~250 items had their JSON UV coordinates shifted down by 32 slots. Hippogriff (`[H]`, index 147 on Row 4, Col 19) rendered with the UV coordinates of **Flesh Golem** (`[g]`, index 179 on Row 5, Col 19), displaying a bald hominid rather than an eagle-headed winged horse!
- **The Mandatory Invariant**:
  - Always use explicit `[int][Math]::Floor($i / $tilesPerRow)` in any PowerShell texture atlas builder or grid serialization script.
  - Assert zero discrepancy between atlas raster layout and UV metadata via automated CI testing (`tools/audit_atlas_models.js`).

### 16.2 2D Baked Drop-Shadow Stripping vs. Dynamic 3D Contact Shadows
- **The 1990s Drop-Shadow Smear Trap**:
  - Canonical Shockbolt tiles from Angband 4.2.6 were authored for a 2D black background and contain hardcoded semi-transparent grey drop shadows ($A < 140$, $R \approx G \approx B$).
  - When upscaled using bicubic or bilinear interpolation in 3D, these baked shadows bleed into surrounding pixels, creating dirty, smudged halos that look out of place against 3D stone cobblestones.
- **The Solution**:
  - The atlas builder programmatically identifies baked shadow pixels using a color/alpha heuristic ($A < 140$, $|R - G| < 18$, $|G - B| < 18$, $R < 135$) and strips them to pure transparent ($A = 0$).
  - In the 3D engine, entities are grounded using real-time dynamic soft contact shadows (`root.contactShadow = shadowDisc`), which project smoothly onto dungeon floor geometry at `y = 0.005`, responding naturally to character elevation and breathing cycles.

### 16.3 Transparent Silhouette De-Fringing & Un-Premultiplied Alpha Restoration
- **Edge Bleeding in Resampling**:
  - When downsampling or upsampling images with transparent backgrounds, convolution kernels sample transparent black pixels ($R=0, G=0, B=0, A=0$). This darkens the RGB values along the outer edge of the sprite silhouette, producing an ugly dark fringe.
- **The Solution**:
  - Boundary pixels are un-premultiplied: $C_{\text{true}} = \min(255, \operatorname{round}(C / \max(0.25, A / 255.0)))$.
  - In Three.js, `alphaTest` is raised from `0.25` to `0.35` (`MeshStandardMaterial({ alphaTest: 0.35, depthWrite: true, transparent: false })`), producing razor-sharp, solid silhouette cutouts with zero translucent edge fuzz or sorting glitches.

### 16.4 Contrast-Adaptive Cross-Laplacian Detail Sharpening for 3D Perspective
- **High-Frequency Detail Recovery**:
  - High-quality bicubic interpolation prevents staircased pixelation but softens micro-features such as monster eyes, scales, claws, feathers, and weapon bevels.
- **The Sharpening Kernel**:
  - Applied a bounded 3×3 Cross-Laplacian sharpening filter to all 128×128 tiles in the 4096×4096 atlas:
    $$C' = C + \operatorname{clamp}\left(1.15 \times \left(4C - C_U - C_D - C_L - C_R\right), -35, +35\right)$$
  - Clamping the adjustment to $[-35, +35]$ prevents ringing artifacts and halos while making creature and item details razor-sharp under 3D camera perspectives.

### 16.5 5×5 Bilateral Normal Map Denoising (Eradicating Specular Sand)
- **The Specular Grain Defect**:
  - Running raw 3×3 Sobel filters directly on 16-color or 256-color pixel-art diffuse textures amplifies single-pixel dithering into sharp normal spikes. Under moving point lights (the player's torch), these spikes reflect blinding, noisy specular grain ("specular sand").
- **The Solution**:
  - A 2-pass separable 5-tap Gaussian/bilateral filter (`[1, 4, 6, 4, 1] / 16`) smooths the luminance field before Sobel gradient calculation.
  - A subtle spherical contouring gradient (`tileRelX`, `tileRelY`) adds volumetric curvature, giving flat 2D sprites tangible 3D fullness.
  - Three.js normal scale is tuned to a balanced `(0.45, 0.45)` with roughness `0.82` for organic creatures and `0.65` for metal/glass items.

### 16.6 Three.js Magnification Filtering, 16× Anisotropy & Mesh Normal Smoothing
- **Texture Filtering**:
  - Texture magnification filter upgraded to `THREE.LinearFilter` with mipmapping to prevent pixelated blockiness at close quarters.
  - 16× anisotropic filtering (`tex.anisotropy = Math.min(16, capabilities.getMaxAnisotropy())`) preserves crisp details at grazing corridor viewing angles.
- **3D Polygon Vertex Normals**:
  - Added automated `computeVertexNormals()` across all GLTF, GLB, and OBJ character, creature, and item loaders, eliminating faceted polygon seams and broken lighting artifacts.

### 16.7 Master Lore Accuracy Audit Automation
- **Zero-Drift Regression Testing**:
  - `tools/audit_atlas_models.js` provides continuous, zero-drift verification:
    - Asserts 100% (624/624) canonical monsters match exact mathematical UV bounds in `graf-shb-dark.prf`.
    - Asserts 100% (498/498) canonical items match exact mathematical UV bounds in `flvr-shb.prf`.
    - Asserts high-profile lore assertions (Hippogriff vs Flesh Golem, Morgoth colossal height, Smaug wingspan, Farmer Maggot scale).
    - Asserts all 27 core 3D polygon meshes exist on disk and have vertex normal smoothing enabled.
    - Asserts 4096×4096 HD atlas and normal map dimensions.

### 16.8 Web-Only Tome Scope & Standalone Zero-Network Invariant
- **Architectural Scoping**:
  - The **Adventure Tome / Living Chronicle** and Voiced Lorekeeper (`server/public/js/chronicle/`) are strictly exclusive to the Web Client (`https://angband3d.com`).
  - Standalone distributions (Windows PC Godot C#, Standalone WebView2, and Android APK) strictly omit the Tome layer to ensure 100% offline self-containment, zero network telemetry, and optimal battery efficiency.

### 16.9 Security Audit & Vulnerability Defenses
- **Zero Known Vulnerabilities**: `npm audit` reports 0 vulnerabilities. Minimal dependencies (`ws`, `msedge-tts`).
- **Path Traversal Protection**:
  - `sanitizeFilename()` applies `path.basename()` and strips non-alphanumeric characters.
  - Reserved Windows device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) are rejected.
  - Static file delivery strictly verifies `filePath.startsWith(WEB_DIR)`.
- **Save Game Integrity**:
  - Only files beginning with authentic Angband `SaveVNLA` binary magic headers are accepted.
- **Zero API Key Leakage**:
  - API keys are never passed as URL query parameters (`?key=...`) and are never returned by configuration APIs (`/api/config/llm`). All key transport occurs via standard HTTP headers (`x-goog-api-key`).
- **Deterministic VRAM Cleanup**:
  - Disposed Three.js meshes systematically free geometries, materials, and textures to prevent WebGL context loss during prolonged dungeon crawls.

---

## 17. Tactical Combat Narrative & Item Resolution Architecture (v2.7.0 / Web v7.9.0)

### 17.1 The Unaware Item Flavor Collision Defect ("Steel Wand" -> "Boots")
- **The Upstream Invariant**:
  - In Angband 4.2.6 C engine, calling `object_desc(buf, sizeof(buf), obj, ODESC_BASE, player)` on an unaware item emits only the flavor string (e.g. `"Steel"` for a steel wand or `"Copper"` for a copper ring) without the base kind category.
- **The Client Resolution Trap**:
  - Naive client-side atlas lookup scripts did substring containment matches: `entry.name.toLowerCase().includes(query)`.
  - When querying `"Steel"`, the dictionary matched `"Pair of Steel Shod Boots"` before or instead of wand flavors, causing steel wands on the dungeon floor to render as a giant pair of boots.
- **The Dual-Tier Architectural Fix**:
  1. **Engine Bridge Serialization (`engine/src/main-bridge.c`)**:
     - Upgraded item name emission to synthesize the base kind name when unaware: `bridge_json_format_obj_kind(obj)`. When `obj->kind` is unknown, it formats `"Steel wand"` by combining `flavor->text` with `obj->kind->name`, preserving category truth over the wire.
  2. **Glyph-Attuned Client Flavor Synthesis (`server/public/js/dungeon3d.js` & `client/scripts/ItemModelResolver.cs`)**:
     - `resolveItemAtlasEntry()` now binds the glyph to flavor resolution:
       - If glyph is `-` and name contains `"Steel"`, synthesize `"Steel wand"`.
       - If glyph is `_` (staff), synthesize `"Staff"`.
       - If glyph is `/` (polearm/spear), synthesize `"Polearm"`.
       - Stripped broad substring matching that previously allowed footwear/armor to match wand queries.
  3. **Dedicated Procedural 3D Wand & Staff Geometry**:
     - Replaced blocky cube fallbacks with dedicated cylinder/tapered shaft meshes in both Three.js (`dungeon3d.js`) and Godot C# (`ItemModelResolver.cs` `CreateCylinderFallbackMesh()`):
       - Wand: Tapered slender shaft (radius 0.015m to 0.035m, height 0.65m), polished brass ferrule, and glowing runic faceted crystal tip (`MeshStandardMaterial({ emissive: 0x4488ff, roughness: 0.2 })`).
       - Staff: Gnarled wooden cylinder shaft (height 1.6m) with carved runic headpiece.

### 17.2 Tactical Combat Medium & Weapon Extraction Architecture
- **Complete Method of Combat Tracking**:
  - The Chronicle pipeline classifies combat into 4 distinct tactical methods: `strike` (melee), `shoot` (missile launcher), `spell` (magic/incantation), and `device` (aim wand, zap rod, activate staff).
- **Zero-Friction State Extraction**:
  - `engine/src/main-bridge.c` extracts equipped weapon (`player.weapon_item`), missile launcher (`player.bow_item`), and current quiver ammunition (`player.quiver_item` from `player->upkeep->quiver[0]`).
  - Serialized cleanly into the JSON frame payload:
    ```json
    "weapon_item": "Broad Sword",
    "bow_item": "Long Bow",
    "quiver_item": "Flight Arrow"
    ```
- **ChronicleFilter Tactical Medium Classification**:
  - `classifyWeaponArchetype(weaponName)`: Sorts weapons into `blade` (swords, scythes, rapiers), `blunt` (maces, flails, hammers), `axe` (battle axes, poleaxes), `dagger` (daggers, stilettos, knives), `polearm` (spears, lances, halberds), or `unarmed` (bare fists, empty slot).
  - `classifyLauncherArchetype(launcherName)`: Distinguishes `bow` (arrows, shaft), `crossbow` (bolts, quarrel, winch), and `sling` (shot, pebbles, leather strap).
  - `detectSpellElement(msg)`: Dynamically categorizes spells into `fire`, `frost`, `lightning`, `acid`, `arcane`, or `holy`.

### 17.3 Rotational LRU Anti-Repetition Verb Memory
- **The Monotony Defect**:
  - Procedural narrative generators frequently repeat identical verbs ("you strike", "you strike", "you slash") across back-to-back combat turns, resulting in stiff, mechanical logs.
- **The LRU Memory Buffer Solution**:
  - `ChronicleGrounder` maintains a 12-item Least-Recently-Used (LRU) memory queue (`recentCombatVerbs`).
  - When selecting an action verb or finishing phrase, `pickNonRepeatingCombatPhrase(pool, recentCombatVerbs, 12)` filters out recently used verbs.
  - If all candidate phrases in a tier were used, the queue gracefully evicts the oldest items, maintaining fluid prose diversity across hundreds of combat turns.

### 17.4 Multi-LLM Tactical Grounding Mandates
- **Prompt Engineering for Absolute Tactical Truth**:
  - In `server/public/js/chronicle/chronicle-llm.js`, both Chapter and Flowing Narrative system prompts enforce strict tactical weapon constraints:
    - Never mention "steel", "blades", or "slashing" if the player is fighting unarmed, casting spells, or using a mace.
    - Match verbs strictly to weapons: arrows *pierce/thrum*, hammers *crush/splinter*, fire spells *incinerate/scorch*, bare fists *pummel/batter*.
    - The LLM context payload explicitly includes `event.data.attackMedium` (weapon archetype, launcher, ammo, spell element) so that all upstream models (Gemini, Claude, GPT, Ollama) generate lore adhering strictly to game state.

### 17.5 Nine-Dimensional Master Plan Validation Matrix
1. **Detail**: Every layer (C engine serialization, WebSocket JSON wire format, Three.js/Godot mesh resolvers, Chronicle event filters, multi-LLM prompt wrappers) is specified with exact mathematical constants, regexes, and coordinate systems.
2. **Conflicts**: Resolved the unaware item flavor collision without breaking upstream save/item compatibility; resolved onboarding stair transitions vs combat event queuing priority.
3. **Optimizations**: Static singleton regexes in JavaScript and C#; 12-item bounded arrays for LRU verb history; pre-warmed speech synthesis AudioBuffers.
4. **Efficiency**: Zero memory allocations during combat turn processing; zero string allocations in hot loops; bounded log history.
5. **Performance**: Maintained solid 60 FPS in 3D WebGL and Godot C# clients; WebGL draw-call coalescing and instancing preserved.
6. **Playability**: 100% visual and narrative consistency between equipped gear, 3D world pickups, first-person viewmodel hands, and the Living Chronicle.
7. **Replayability**: Dynamic archetypes, varied weapon/spell descriptions, and rotating LRU vocabulary eliminate repetitive grinding prose across different character classes.
8. **Best Practices**: Strict preservation of upstream Angband 4.2.6 core mechanics; exported clean patches to `engine-patch/`; isolated the Living Chronicle to the Web Client.
9. **Security**: Zero API key leakage (local client storage, redaction over wire, header-only authentication); path traversal sanitization on all file downloads; strict binary magic verification (`SaveVNLA`) on all save uploads.

---

## 18. Seamless Vocal Handoff Architecture & Contextual Tolkien Lore Grounding (v2.8.0 / Web v8.0.0)

### 18.1 The Preemption Dead Zone Defect
- **The Problem**:
  - In earlier iterations, when a high-priority combat event or floor change occurred during active vocal narration, the audio router immediately invoked `stopSpeaking()`.
  - While this prevented overlapping voices, it created a jarring dead silence lasting between 300ms and 1500ms while the new utterance was requested from the network `/api/tts`, downloaded, and decoded into an `AudioBuffer`.
  - In fast-paced battles with rapid turns, this produced harsh, stuttering audio cutoffs that fractured immersion and broke the storyteller's natural rhythm.
- **The JIT Audio Handoff Engine (`chronicle-audio.js`)**:
  - `speak(text, dialogue, options)` now operates in seamless mode (`options.seamless = true` or `setSeamlessHandoff(true)`).
  - When a new event arrives while the narrator or creature is speaking, the existing vocal playback **continues uninterrupted**.
  - Simultaneously, `fetchOrGetAudioBuffer()` fetches the new utterance and decodes it into memory in the background.
  - Only when the new `AudioBuffer` is completely ready in RAM does `_gracefulHandoffCurrentAudio()` execute:
    1. An 80ms gain fade-down (`linearRampToValueAtTime(0.001, now + 0.08)`) on the current voice sub-bus (`currentSourceGain`).
    2. A 50ms natural breath pause simulating a storyteller's natural phrasing breath (~130ms total natural transition).
    3. Seamless immediate start of the prepared `AudioBuffer` without a single millisecond of network latency.
  - **Hero Death Invariant**: When mortal doom strikes (`HERO_DEATH`), `options.seamless = false` is explicitly enforced to immediately silence ongoing narration with stark, sudden finality.

### 18.2 Contextual First Age Tolkien Lore Grounding
- **Simultaneous Action Coalescence**:
  - Angband turns frequently involve simultaneous actions: incoming strikes, hero counter-attacks, status effects, and level feelings.
  - `ChronicleFilter` coalesces these into a single cohesive `COMBAT_EXCHANGE` beat enriched with `hpPercent`, `isPeril: hpPercent <= 0.30`, `playerRace`, and `levelFeeling`.
- **Character Heritage & Tradition Invocations**:
  - Under mortal peril (<30% HP), `ChronicleGrounder` branches dynamically into canonical Tolkien lore aligned with character tradition:
    - **Khazad (Dwarven)**: Evokes the endurance of Durin and unyielding mountain roots as blood seeps through broken mail.
    - **Noldor (Elven)**: Recalls the starlit sorrow of Gondolin before Morgoth's shadow fell upon Beleriand.
    - **Periath (Hobbits/Halflings)**: Yearns for the peaceful green burrows far from the Iron Hells with small hands trembling yet resolute.
    - **Westmarch / Dunedain (Humans)**: Invocations of Westernesse defiance against the terror of the Iron Crown.
- **Tolkien Legal Boundaries**:
  - Strictly stays within Angband 4.2.6 public lore and Tolkien legendarium concepts established in the public domain and classic Angband gameplay (the Iron Crown, Morgoth beneath Thangorodrim, descent to 5000ft / Level 100), avoiding copyrighted Third Age extended materials while maximizing poetic atmosphere.

---

## 19. Dynamic Story Catch-Up Engine & Zero Audio Overlap Invariants (v2.9.0 / Web v8.1.0)

### 19.1 The Sentence Pipeline Interruption & Overlap Traps
- **Sentence Pipelining Defect**:
  - In `speakUtterance`, fast-start sentence splitting plays Sentence 1 first while Sentence 2+ decodes or buffers.
  - *The Trap*: When a handoff occurred during Sentence 1, `_gracefulHandoffCurrentAudio()` faded and disconnected Sentence 1's source. However, Sentence 1's promise resolved with `interrupted: true`. The loop then naively proceeded to Sentence 2, starting Sentence 2 concurrently with the newly handed-off utterance!
  - *The Fix*: Strict token and interruption guards at every pipeline step:
    ```javascript
    if (r1.aborted || r1.interrupted || this._activeVoiceToken !== voiceToken) {
        return { completed: false, interrupted: true, aborted: true };
    }
    ```
- **Creature Dialogue Bark Interruption Defect**:
  - In narrative events with dialogue (e.g. shopkeeper advice or monster barks), creature audio followed narration. If narration was interrupted during handoff, the creature bark previously still fired.
  - *The Fix*: Token equality check (`this._activeVoiceToken === voiceToken`) before speaking any chained dialogue bark.
- **Single-Staging Slot Invariant & Concurrent Staging Race**:
  - Rapid combat turns fired concurrent `speak(..., { seamless: true })` calls. If turn $N$ and turn $N+1$ both initiated network buffering, they raced. Whichever completed second would abruptly overwrite or clobber playback.
  - *The Fix*: A single atomic staging slot `this._activeStaging = { token, controller }`. When a fresher catch-up beat arrives while an earlier one is buffering, the stale network fetch is immediately aborted via `controller.abort()`, ensuring only the freshest contextual audio is decoded and prepared.
- **Acoustic Separation & Zero-Overlap Guarantee**:
  - Web Audio node disconnection alone can cause micro-clicks if done abruptly during active waveform peaks.
  - `_gracefulHandoffCurrentAudio()` enforces:
    1. Invalidation of active voice tokens (`this._activeVoiceToken = null`).
    2. An 80ms gain micro-fade down to 0.0001 (`linearRampToValueAtTime`).
    3. Disconnection of `currentSource` and stopping HTML5/WebSpeech audio elements.
    4. An enforced 40ms acoustic silence gap before `newSource.start(0)`.
  - Max concurrent audio sources = 1 is mathematically maintained throughout the entire lifecycle.

### 19.2 The Unvoiced Action Ledger & Constant Catch-Up Evaluation
- **The Combat Narrative Gap**:
  - In fast combat (holding down an attack key, drinking a potion, taking hits, slaying a foe), several turns occur while the voice is reading an initial beat.
  - *Naive approaches fail*: Stopping speech immediately on every turn creates stuttering chaos; ignoring turns makes the voice lag minutes behind reality.
- **The Architecture of Constant Catch-Up**:
  1. **Background Unvoiced Event Ledger (`unvoicedEventLedger`)**:
     - When the voice is active or staging (`isSpeaking || isStaging`), incoming frame events are non-disruptively pushed to `this.unvoicedEventLedger`.
  2. **Real-Time Catch-Up Evaluation (`evaluateCatchUp(player)`)**:
     - Evaluated on every game frame. Urgency triggers include:
       - Foes slain (`MONSTER_SLAIN`) or unique monsters sighted.
       - Mortal peril (hero HP drops below 35%).
       - Emergency survival tactics (healing potions quaffed, teleport/phase door spells cast).
       - Event backlog threshold ($\ge 2$ unvoiced tactical events).
  3. **Multi-Turn Tolkien Saga Consolidation (`generateCatchUpBeat`)**:
     - Synthesizes the initial hero snapshot with live player state into an epic, 3-clause flowing saga paragraph:
       - *Clause 1 (Ongoing Struggle)*: Grounded in dungeon depth and attacking foes.
       - *Clause 2 (Tactical Adaptation)*: Weaving potion draughts, spell incantations, or status recoveries.
       - *Clause 3 (Resolution / Climax)*: Lethal finishing blows with weapon archetypes, or bracing on the razor edge of life and death.
  4. **Seamless Transition & Natural Playback Drain**:
     - Triggered catch-up beats are staged seamlessly in the background while the current voice finishes its current phrase.
     - When playback finishes naturally (`onAudioPlaybackEnded`), any remaining unvoiced ledger events are smoothly summarized, ensuring the chronicle is always contextually synchronized with the hero's journey.

---

## 20. Bidirectional Story Tracking, In-Card Play/Pause Controllers & Previous Point Playback (v2.10.0 / Web v8.2.0)

### 20.1 The Card Control & Previous-Point Navigation Defect
- **The Problem**:
  - In earlier versions of the Living Chronicle, story playback was primarily driven through global transport controls (Play / Pause / Stop buttons at the top of the Tome).
  - Players had difficulty jumping directly to past events in the chronicle to re-listen to specific encounters, boss battles, or storekeeper interactions.
  - Clicking an older card often failed to start playback from that point, or clobbered the reading position without updating the card UI.
  - Live gameplay events and manual playlist navigation fought over `currentBeatIndex`, causing highlights to drift out of sync.

### 20.2 The In-Card Controller & Direct Beat Indexing Engine
1. **Direct In-Card Play/Pause Buttons (`.flow-play-btn`)**:
   - Every flowing paragraph and chapter card renders with an embedded, accessible play button tagged with `data-beat-index` and `data-beat-id`.
   - Hovering over any card reveals the glowing golden button.
   - When playing, the active card button transforms into an active pause icon `⏸` with subtle CSS `playPulse` animation and golden border aura (`.is-playing`).
   - When paused, the button transforms into a dashed resume icon `▶` with `.is-paused` styling.
2. **Disambiguating Play vs Pause in `toggleBeatPlayback(targetIdx)`**:
   - *The Invariant*: Clicking a card's play button must only pause if that specific card is already actively speaking (`isStoryPlaying && currentBeatIndex === targetIdx && !audio.isPaused`).
   - If audio is speaking live ambient gameplay or if story playback has not been initiated, clicking any card must immediately start playback from that chosen beat (`playStoryFrom(targetIdx)`), stopping prior speech cleanly and invalidating prior loops via `++this.playbackSessionId`.
   - If playback is paused on that card (`audio.isPaused && pausedBeatIndex === targetIdx`), clicking it seamlessly resumes.
3. **Non-Disruptive Selection (`selectBeat(targetIdx)`)**:
   - Allows moving the cursor / selection focus (`.narrating-selected`) to review card text without cutting off or restarting currently active narration.
4. **Bidirectional Live Synchronization**:
   - As new turns and combat episodes occur in live gameplay, `processEvent()` automatically updates `this.currentBeatIndex = this.storyPlaylist.length - 1` and calls `this._updateCardStates()`.
   - When spoken playback completes naturally (`onAudioPlaybackEnded()`), the status bar updates to `✓ Passage X of Y`, maintaining 100% synchronization between the spoken word, the active reading guide, and the physical scroll position.

---

## 21. Core Movement Input Disambiguation & Safe Transport Hotkeys (v2.11.0 / Web v8.3.0)

### 21.1 The Movement Key Collision & Speech Restart Defect
- **The Symptom**:
  - The player reported: *"It currently restarts vocal play every time I take a step. that's not right. are the controls mixed up?"*
- **The Root Cause**:
  - In `chronicle-manager.js`, a global `keydown` listener checked `if (!this.windowEl || !this.windowEl.classList.contains('active')) return;`.
  - When the Chronicle window is opened (even when minimized or docked alongside the 3D viewport), `#chronicle-window` contains the class `.active`.
  - Inside this listener, bare keys were captured and `e.preventDefault()` was called on:
    - `ArrowUp` and `k` -> called `this.rewindStoryPlayback()`
    - `ArrowDown` and `j` -> called `this.forwardStoryPlayback()`
    - `Shift + ArrowLeft` -> called `this.rewindStoryPlayback()`
    - `Shift + ArrowRight` -> called `this.forwardStoryPlayback()`
    - `Space` -> called `this.toggleStoryPlayback()`
  - In Angband and Angband3D:
    - `ArrowUp` is Step Forward in camera direction!
    - `ArrowDown` is Step Backward in camera direction!
    - `Shift + ArrowLeft` is Strafe Left!
    - `Shift + ArrowRight` is Strafe Right!
    - `k` is Step North!
    - `j` is Step South!
    - `Space` is Attack Adjacent Monster in front (and context prompt advance)!
  - Because `rewindStoryPlayback()` and `forwardStoryPlayback()` both checked `if (isSpeaking) this.playStoryFrom(targetIdx);`, every single step taken in the game stopped the ongoing speech and restarted audio playback from the target beat, while also intercepting and blocking the step from being executed.

### 21.2 The Architectural Invariant: Front-End UI Never Steals Game Movement
1. **Zero Movement Key Capture in Secondary UI**:
   - Secondary overlays, HUD panels, and chronicle views must **NEVER** attach global event listeners that intercept bare navigation or movement keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `k`, `j`, `h`, `l`, numpad keys, or `Space`).
2. **Alt-Key Scoping for Global Application Shortcuts**:
   - All global transport hotkeys for Chronicle audio are strictly scoped to `e.altKey`:
     - `Alt + C`: Toggle Living Chronicle window.
     - `Alt + P` or `Alt + Space`: Play / Pause story audio.
     - `Alt + [`: Rewind story playback to previous passage.
     - `Alt + ]`: Skip story playback to next passage.
     - `Alt + S`: Stop story audio playback.
3. **World Controller Alt-Key Immunity**:
   - In `input.js`, `handleWorldKey()` immediately returns if `e.altKey` is held, ensuring application accelerators never trigger minimap zooming, camera tilting, or game commands.

---

## 22. Absolute Vocal Mutual Exclusion & Zero Concurrent Voice Overlap Architecture (v2.11.1 / Web v8.3.1)

### 22.1 The Concurrent Voice Overlap Defect
- **The Symptom**:
  - The player reported: *"That was a regression, now we have multiple voices talking over eachother."*
- **The Root Causes**:
  1. *Physical Teardown vs Logical Invalidation Desynchronization*:
     In `playNeuralAudio()`, calling `_stopAllActiveAudioSources()` inside the playback function after assigning `sessionId` invalidated the method's own session ID on cache-hit branches, causing it to fail or skip. More critically, prior active audio nodes (`AudioBufferSourceNode`, HTML5 `Audio`, `window.speechSynthesis`) were not reliably stopped physically right before triggering the new node.
  2. *Missing `isStaging` Getter & Frame Evaluation Race Window*:
     `isStaging` getter was missing on `ChronicleAudioRouter` (evaluated to `undefined`/falsy). Furthermore, `isSpeaking` was only set to `true` after async queue processing began. As a result, taking multiple steps per second caused rapid `onFrame()` calls where `!this.audio.isSpeaking && !this.audio.isStaging` evaluated to `true`, triggering concurrent voice requests or rapid restarts that played simultaneously over one another.
  3. *Encounter Audio Bypassing Exclusion*:
     In `onCreatureEncounter()`, audio called `speakUtterance()` directly instead of routing through `this.audio.speak()`, bypassing queue and mutual-exclusion guards.

### 22.2 The Invariant: Maximum Concurrent Voice Streams = 1 Across All Subsystems
1. **Physical Disconnection (`_disconnectPhysicalSources`)**:
   - `_disconnectPhysicalSources({ preserveResolve = null })` physically and synchronously stops `this.currentSource`, disconnects `this.currentSourceGain`, pauses and nulls `this.currentAudio`, calls `window.speechSynthesis.cancel()`, and supersedes active resolve promises.
   - Crucially, it does **NOT** increment session tokens or abort in-flight fetch controllers.
   - It is executed immediately before ANY voice playback starts across all three tiers:
     - Tier 1: Web Audio (`source.start(0)`)
     - Tier 2: HTML5 Audio Element (`audio.play()`)
     - Tier 3: Web Speech API (`window.speechSynthesis.speak(utterance)`)
2. **Synchronous `isSpeaking = true` on `speak()`**:
   - Setting `this.isSpeaking = true` synchronously at the entry point of `speak()` eliminates the race window where back-to-back frames arriving 10-50ms later could see `!this.audio.isSpeaking` before `processSpeechQueue()` started.
3. **Accurate State Queries (`isStaging` and `isBusy`)**:
   - `get isStaging()` returns `!!this._activeStaging && !this._activeStaging.aborted`.
   - `get isBusy()` returns `this.isSpeaking || this.isStaging || this.isProcessingSpeechQueue`.
4. **Quiet Movement Buffering**:
   - `onFrame()` evaluates `if (!this.audio.isSpeaking && !this.audio.isStaging && !this.audio.isProcessingSpeechQueue)`.
   - When audio is active, routine walking turns buffer quietly into `unvoicedEventLedger`. Only high-urgency events (kills, mortal peril, unique bosses, heals) preempt ongoing speech with seamless handoffs.
5. **Dedicated Verification**:
   - Verified via `tools/test_vocal_exclusion.js`, ensuring `maxConcurrentVoices <= 1` across rapid walking turns, seamless combat interruptions, and stop commands.

---

## 23. Visual Vocal Telemetry, Skipped Event Taxonomy & Real-Time Interruption Context Architecture (v2.11.2 / Web v8.3.2)

### 23.1 The User Cognitive Load Problem in Real-Time Speech
In turn-based roguelikes paired with real-time neural speech, players frequently take 3-6 steps or combat actions while a spoken sentence is playing. When an urgent event (such as a monster kill, low HP, or high-level catch-up beat) preempts the vocal stream, players experience cognitive dissonance unless given explicit, ambient visual clarity:
1. *Is the voice still working, or is it buffering / loading?*
2. *What happened during the dialogue that was cut short? How many turns/steps were skipped?*
3. *Which story beat on the parchment corresponds to the interrupted audio?*

### 23.2 Architecture of the Multi-Layered Feedback System
1. **Granular Vocal State Machine (`_emitVocalState` in `ChronicleAudioRouter`)**:
   - Audio state transitions emit `{ state, telemetry }` to `onVocalStateChange`:
     - `'loading'`: Triggered during audio generation / API fetch (`{ details, text, role }`).
     - `'speaking'`: Triggered at actual Web Audio / HTML5 audio node start (`{ role, engine, cached }`).
     - `'interrupted'`: Triggered during preemption / handoff teardown (`{ role, reason }`).
     - `'idle'`: Triggered upon playback end or stop.
2. **In-Header Vocal Pill (`#chronicle-vocal-pill`)**:
   - Positioned prominently in `#chronicle-header-top`.
   - `.loading`: Amber/gold shimmer with rotating micro spinner (`<span class="voice-loading-spinner-micro"></span> Voicing...`).
   - `.speaking`: Emerald/cyan pill with a live 3-bar animated soundwave equalizer (`<span class="voice-wave-anim"><span></span><span></span><span></span></span> Speaking`).
   - `.interrupted`: Fiery amber/gold badge (`⚡ Interrupted`) indicating speech was preempted by rapid action.
3. **Top-Bar Tome Button Ambient Flares (`#btn-toggle-chronicle`)**:
   - When the Tome window is minimized or closed during intense 3D combat, the top bar button visually signals state:
     - `.is-loading-voice`: Soft pulsing gold glow.
     - `.is-voicing`: Emerald sound aura.
     - `.is-interrupted-voice`: Amber flare.
4. **First-Person 3D HUD Toast (`#chronicle-hud-toast`)**:
   - Glassmorphic dark fantasy HUD toast pill floating in the upper right.
   - Non-intrusive 3.2-second ephemeral display informing the player in first-person view:
     - `⏳ Voicing chronicle with Gemini...`
     - `⚡ Speech interrupted (+4 paces)`
5. **Skipped Event Taxonomy & Catch-Up Context Banners (`actionBreakdown`)**:
   - `ChronicleGrounder.generateCatchUpBeat()` categorizes all buffered events into `paces`, `strikes`, `spells`, `potions`, `discoveries`, and `kills`.
   - Returns `actionBreakdown` with `.summaryText` (e.g. `4 paces while moving`, `5 actions (4 paces, 1 strike)`).
   - `renderStoryEntry()` outputs a gold-bordered `.catchup-context-banner`:
     - Badge: `⚡ ACTION FLURRY`
     - Text: `{N} buffered events synthesized: {summaryText}`
     - Header Badge: `⚡ {Depth} • Caught Up (+{summaryText})`
6. **Interrupted Story Beat Cues (`markCurrentBeatInterrupted`)**:
   - When preemption occurs, the previously active story card receives `.is-interrupted` styling (warm amber edge).
   - Injects `<span class="badge-interrupted">⚡ Interrupted (+{SkippedSummary})</span>` before the play button.
   - For dialogue beats, appends `<div class="dialogue-cut-short-note"><em>— Voice trailed off as the battle pressed onward —</em></div>`.

---

## 24. YouTube-Grade In-Engine Gameplay Commercial & Veteran Theater Showcase Architecture (v2.12.0 / Web v8.4.0)

### 24.1 Design Motivation & The Roguelike Veteran Conversion Funnel
Traditional roguelike veterans (Angband, NetHack, DCSS, Moria) are instinctively skeptical of 3D adaptations, fearing dumbed-down action combat, loss of tactical turn pacing, or superficial graphics replacing deep emergent mechanics.
- **The Core Objective**: Provide an instant, autoplay commercial and feature tour that directly addresses the top veteran gotchas within the first 60 seconds:
  1. *Gotcha #1: 0-Turn Camera Yaw* — Panning around consumes zero game turns; time remains frozen until a step or action is taken.
  2. *Gotcha #2: The Dual Reality (`Tab`)* — Instantaneous 1-to-1 switch between 3D view and the authentic 80x24 Angband 4.2.6 ASCII CRT terminal.
  3. *Gotcha #3: 3D Spatial Audio & Darkness* — Hearing creatures around blind corners before line-of-sight.
  4. *Gotcha #4: Authoritative 4.2.6 Engine & Universal Saves* — `SaveVNLA` binary saves transfer freely across Web, PC, and Android APK.
  5. *Gotcha #5: The Living Chronicle* — Generative illuminated Westmarch saga and voiced lorekeeper.

### 24.2 Broadcast-Quality Audio & Pre-Buffered Zero-Latency Assets
To guarantee broadcast quality with zero runtime API failure or network lag:
1. **Pre-Buffered Neural Voice Stems**:
   - Master voice stems are pre-rendered into `/assets/audio/demo/` using Microsoft Edge Neural TTS:
     - Enceladus (Elder British Chronicler): `en-GB-RyanNeural`
     - Armourer (Town merchant): `en-IE-ConnorNeural`
     - Snerk the Snaga (Subterranean goblin): `en-GB-ThomasNeural`
     - Young Red Dragon (Deep vault guardian): `en-US-ChristopherNeural`
   - Generated with Node 18 `globalThis.crypto` polyfill via `tools/generate_demo_audio.js`.
2. **Subterranean Algorithmic Convolver Sub-Graph**:
   - Audio routes through an in-memory Web Audio `ConvolverNode` with a procedurally synthesized exponential decay impulse response (10% wet) to emulate damp dungeon stone acoustic reflections.

### 24.3 Hybrid 60fps Broadcast Reel Engine
1. **Procedural Multi-Act Canvas Engine**:
   - If an external video stream (`demo.mp4`/`demo.webm`) is unavailable, `demo-player.js` runs a 60fps procedural canvas renderer visualizing authentic gameplay across 7 acts:
     - Act 1: *The Awakening (0-25s)* — Town square 360° pan, cobblestones, shop signs, torchlight.
     - Act 2: *Gotcha #1: 0-Turn Camera Yaw (25-55s)* — 50ft Crypts corridor with "0 GAME TURNS CONSUMED" badge and frozen spider.
     - Act 3: *The Dual Reality (55-85s)* — Split screen comparing 3D viewport with authentic CRT 80x24 green-screen terminal (`Tab`).
     - Act 4: *3D Spatial Stealth (85-115s)* — 250ft dungeon with HRTF directional radar rings and misty infravision silhouette.
     - Act 5: *Vault Combat & Tactics (115-140s)* — 1000ft Red Dragon vault encounter with broadsword viewmodel, phase door escape, and lightning blast VFX.
     - Act 6: *The Living Chronicle (140-155s)* — Illuminated Westmarch tome with real-time soundwave equalizer.
     - Act 7: *Universal Saves & Play Free (155-165s)* — Multi-platform save file transfer diagram and instant launch CTA.

### 24.4 Interactive Theater Transport & Accessibility
- **Interactive Scrubber**: Timeline hover tooltip with timecode, buffered progress bar, chapter tick markers, and chapter ribbon pills.
- **Ambient Mode Glow**: `.demo-ambient-glow` smoothly blends background lighting based on active act mood.
- **Timed Subtitles**: `.demo-captions-overlay` color-coded by speaker (`.speaker-bard`, `.speaker-dragon`, etc.).
- **HTTP 206 Partial Content Streaming**: Server delivers media via byte-range requests (`Accept-Ranges: bytes`) for instant scrubbing.
- **Direct Conversion CTA**: `#demo-btn-play-game` launches a new random hero directly into the dungeon with zero friction.

---

## 25. Broadcast-Quality Authentic In-Engine Walkthrough Video Recording, Monster Scaling Invariants & Coordinate Facing Systems

### 25.1 Subterranean Monster Scaling & Ceiling Clearance Invariant
- **The Ceiling Clipping Failure Mode**:
  - In `Dungeon3D`, dungeon masonry walls and vaulted ceilings are constructed with a canonical height of `wallHeight = 3.0` meters.
  - The Shockbolt monster atlas (`monster_atlas.json`) contains historical height entries up to `2.4m` for tall or broad creatures (e.g. Forest Troll, Greater Hell-Beast, Titans, Stone Giants).
  - When rendered in a 3.0m corridor, a 2.4m billboard with idle vertical bobbing (`0.05m`) and an overhead nameplate (`modelHeight + 0.42m = 2.87m - 3.0m`) pushed creature crowns, raised polearms, and floating nameplates directly through the ceiling slabs and into the void.
- **The Mandatory Scaling Cap & Nameplate Clamping Invariant**:
  - In `createMonsterBillboardMesh` (`dungeon3d.js`):
    - Strict physical height cap: `maxMonsterHeight = 2.05`.
    - If `atlasEntry.height > 2.05`, the entity is scaled down proportionally to preserve exact aspect ratio:
      ```javascript
      const maxMonsterHeight = 2.05;
      if (h > maxMonsterHeight) {
          const scaleDown = maxMonsterHeight / h;
          h = maxMonsterHeight;
          w = w * scaleDown;
      }
      ```
  - In `createMonster3DEntity` and `updateMonsters`:
    - Overhead nameplates and floating damage numbers are strictly clamped:
      ```javascript
      entity.nameplate.position.set(0, Math.min(2.65, entity.modelHeight + 0.35), 0);
      ```
    - Guarantees at least 0.35m of clean, unoccluded visual clearance below the 3.0m subterranean masonry ceiling for all 624 monster races in Angband.

### 25.2 Three.js Camera Yaw vs. Compass Coordinate Mapping Trap
- **The Sign Inversion Trap**:
  - In Three.js right-handed coordinate systems ($+X$ right, $+Y$ up, $+Z$ back towards viewer):
    - Default camera at rotation $(0,0,0)$ looks along $-Z$ (**North**).
    - Rotating around the Y-axis:
      - $\text{rotation.y} = 0 \implies \text{Direction } (0, 0, -1)$ (**North**)
      - $\text{rotation.y} = -\frac{\pi}{2} \implies \text{Direction } (+1, 0, 0)$ (**East**)
      - $\text{rotation.y} = \pi \implies \text{Direction } (0, 0, +1)$ (**South**)
      - $\text{rotation.y} = +\frac{\pi}{2} \implies \text{Direction } (-1, 0, 0)$ (**West**)
  - Setting `cameraYaw = Math.PI * 0.5` points **WEST**, NOT EAST!
  - If a player is standing at $(105, 24)$ and the enemy creature is placed at $(106, 24)$ ($\Delta x = +1, \Delta y = 0$, East), setting `cameraYaw = Math.PI * 0.5` points the camera directly into the western wall ($\Delta x = -1$), blinding the viewer.
- **The Invariant**:
  - Facing East always requires `cameraYaw = -Math.PI * 0.5` (or $-1.570796$).
  - Internal camera facing formula: `yaw = -this.facing * (Math.PI / 2)`.

### 25.3 Narrative-Gameplay Coherence & Golden Save Generation
- **Elimination of Artificial "Cold Open" Hacks**:
  - Gameplay showcase videos must present a logical, compelling narrative. Starting a video with an unnatural 4-second cold open fighting a mis-matched creature in a dead-end corridor, flashing CRT scanlines for 4 seconds, and then abruptly teleporting to town breaks viewer immersion.
  - The walkthrough narrative starts in the serene, star-lit Town above, demonstrates 0-turn camera yaw, descends the grand stone staircase, and journeys into the deep.
- **Narrative Entity Fidelity (The Young Red Dragon)**:
  - If narrative audio, lorekeeper consultation, and Tolkien creature dialogue discuss a **Young Red Dragon** at 1250ft (depth 25), the video must authentically feature a Young Red Dragon at depth 25.
  - Golden save creation (`tools/create_golden_dragon_save.py`) employs authoritative C engine wizard commands:
    - `C-a` `j` $\to$ jump to depth 25 (1250ft).
    - `C-a` `A` $\to$ advance hero power (Level 50, 547 HP) to survive draconic fire breath.
    - `C-a` `w` $\to$ wizard light to illuminate the vaulted chamber.
    - `C-a` `n` $\to$ summon named monster `Young red dragon`.
  - All golden saves are version-controlled in `tools/demo_saves_backup/` and restored automatically before recording runs.

---

## 26. Dedicated Walkthrough Showcase Routing, Under-Video Controls Architecture & Cross-Platform Parity Invariants

### 26.1 Under-Video Controls Layout Invariant
- **The Gameplay Occlusion Failure Mode**:
  - Placing video playback controls, scrubbers, volume sliders, and timecodes inside or layered on top of the 1080p video player occludes vital game UI elements (such as the 3-row Angband status bar, message banner, or minimap).
  - Floating controls also induce visual fatigue and trigger unwanted hover popups during playback.
- **The Invariant**:
  - The `.demo-transport-bar` / `.controls-bar` is strictly structured **underneath** the video wrapper outside the video canvas:
    - Video container: `border-radius: 12px 12px 0 0; border-bottom: none`.
    - Transport bar: `border-radius: 0 0 12px 12px; border-top: 1px solid rgba(255, 255, 255, 0.08)`.
  - This ensures 100% unobstructed visibility of all native Angband 4.2.6 C engine HUD text, message history, and 3D dungeon visuals.

### 26.2 Closed Captions Default State
- **The Subtitle Occlusion Trap**:
  - Defaulting closed captions (CC) to `true` permanently occupies the lower quarter of the video stage with subtitle bubbles, blocking Angband's message log and HP/SP statistics.
- **The Invariant**:
  - Closed captions MUST default to **OFF** (`captionsEnabled = false`).
  - Users can toggle captions on-demand via the `[CC]` button or pressing `C`.

### 26.3 Branding Invariants & FFmpeg Video Duration Math
- **Thunderbear Studios Branding**:
  - Act 0 (0:00 - 0:03.8): Theatrical intro card featuring the official Thunderbear Studios logo, radiant gold aura, and Cinzel gold font (*"THUNDERBEAR STUDIOS PRESENTS"*).
  - Act 8 (3:45 - 4:15): Theatrical outro card featuring the Thunderbear Studios logo, *"BROUGHT TO YOU BY THUNDERBEAR STUDIOS"*, 6-pillar feature grid, and GitHub link `https://github.com/ThunderbearStudios/angband3d`.
- **The `-shortest` FFmpeg Track Truncation Trap**:
  - Using `-shortest` in FFmpeg muxing commands causes FFmpeg to terminate the entire output video the millisecond *any* input stream reaches EOF. If the raw video recording stream finishes 1-2 seconds early, the final vocal narration stem (e.g. Enceladus's concluding line *"Descend... if you dare!"*) is abruptly clipped mid-sentence.
- **The Invariant**:
  - Never use `-shortest` when muxing choreographed multi-track vocal stems.
  - Video recording timeline (`TARGET_DURATION = 255.0s`) includes a generous 14-second hold on the outro card after the final vocal completes (at 241.3s), ensuring the voiceover resolves naturally and the audience has ample time to read features and repository links before fading to black.

### 26.4 Native Client Distribution & Routing Invariant
- **The Binary Bloat Trap**:
  - Bundling 300MB+ of 1080p MP4 and WebM video files into the Godot Windows Desktop installer or Android APK swells distribution artifacts from ~25MB to >350MB, causing bandwidth strain, slow downloads, and app store rejection.
- **The Invariant**:
  - The high-definition showcase video is hosted exclusively on the web client (`https://angband3d.com/demo`).
  - All native clients (Godot C# Windows desktop and Android APK) reference the web showcase via `OS.ShellOpen("https://angband3d.com/demo")`:
    - Splash screen: `[V] Watch Demo Video` button & `Key.V` shortcut.
    - Title Menu & Pause Menu: `"Watch Gameplay Showcase & Video Guide (angband3d.com/demo)"`.
    - In-game Survival Guide (Tab 6): Clickable link and `[V]` shortcut.
  - Server daemon (`server.js`) natively routes `/demo`, `/demo/`, `/watch`, and `/showcase` to `server/public/demo.html`.

---

## 27. Choreographed Gameplay Walkthrough Invariants: Authentic Grid Topology, Real In-Engine Turn Actions & Vocal Mutual Exclusion

### 27.1 The Grid Blindness & Wall Collision Trap
- **The Failure Mode**:
  - Scripting movements in `demo-recorder.js` by assuming open space without inspecting the authoritative C engine coordinate map leads to catastrophic collisions.
  - In Act 2, the player at $(73, 55)$ was scripted to step South repeatedly. Because coordinate $(73, 56)$ is a granite wall (`#`), every step generated `"There is a wall in the way!"` in the message log while the camera stared point-blank into masonry.
  - In Act 4, the player at $(142, 14)$ was scripted to step North into row 13, which is solid granite (`#######`), producing identical wall collisions while an untracked snake attacked from behind.
- **The Mandatory Grid Inspection Protocol**:
  - Before writing or modifying movement steps in `demo-recorder.js`, developers and AI agents **MUST** execute a Python simulation script (e.g. `test_act*_sim.py` utilizing `bridge.py` or the socket bridge).
  - The script must dump the local $15 \times 15$ ASCII grid centered on the player and verify every planned step lands strictly on passable open floor (`.`) or open doorways (`'`).
  - Never guess or approximate coordinates. Verify start positions, intermediate turns, target monster coordinates, and loot drop tiles directly against active engine frames.

### 27.2 Absolute Elimination of Synthetic/Phantom Overlays
- **The Failure Mode**:
  - Displaying floating damage text, synthetic hit notifications, or phantom death notices when the engine state has not registered a genuine strike destroys player trust and creates glaring contradictions between the visual scene and the message log.
  - If the message log says `"There is a wall in the way!"` while a floating text overlay says `"-12 (Critical Strike!)"`, the recording is fundamentally broken.
- **The Invariant**:
  - 100% of visible combat actions, monster damage, and loot acquisitions must originate from real in-engine game turns executed via stdio/socket keypresses (`stepMove`, `stepAttack`, `g` loot).
  - Text appearing in the message log (`"You hit the small kobold. You have slain the small kobold."`, `"You have found 45 gold pieces worth of copper."`, `"You have a Scroll..."`) is the authoritative source of truth.
  - Floats and visual VFX must trigger strictly in response to genuine engine state changes, never hardcoded timers running decoupled from game events.

### 27.3 Authoritative Golden Save Generation & Rogue Monster Banishment
- **The Failure Mode**:
  - Loading an unvetted or stale save file where the intended target monster is already dead, positioned in an unreachable quadrant, or surrounded by hostile wandering monsters (e.g. wandering snake biting the player from behind during a stealth showcase).
- **The Invariant**:
  - Golden save creation scripts (`tools/setup_golden_*.py`) must:
    1. Jump to the exact target dungeon depth (`C-a j`).
    2. Illuminate the local region or vault chamber (`C-a w`).
    3. Banish any existing rogue or interfering monsters on the level using long-range teleport/destruction wand commands.
    4. Summon the specific target monster (`C-a n`) at the exact target coordinate $(y, x)$.
    5. Set sleep flags appropriately for stealth scenarios (`m_ptr->mflag |= MFLAG_ASLEEP`).
    6. Verify the player has open, unobstructed line-of-sight and passable walking corridors to the encounter.
  - All golden saves (`demo_intro`, `demo_town`, `demo_crypt`, `demo_vault`, `demo_stealth`, `demo_combat`) must be versioned in `tools/demo_saves_backup/` and restored before recording.

### 27.4 Voiceover Stem Timeline Scheduling & Mutual Exclusion Invariant
- **The Failure Mode**:
  - In Act 8, `clip_19_universal_saves.wav` had an 18.2-second spoken duration and started at 291.8s (ending at 310.0s), while `clip_20_grand_finale.wav` started at 298.5s. This resulted in 11.5 seconds of simultaneous, unintelligible overlapping speech.
- **The Invariant**:
  - Spoken narrative voice tracks must be strictly mutually exclusive.
  - For any two consecutive audio clips $i$ and $i+1$:
    $$\text{delayMs}_{i} + \text{durationMs}_{i} + \text{bufferMs} \le \text{delayMs}_{i+1}$$
    where $\text{bufferMs} \ge 500\text{ms}$ (clean silent buffer between spoken statements).
  - When script content is adjusted, voiceover audio must be regenerated to a duration that strictly fits the time allocation, or the downstream delay must be pushed forward.
  - Video muxing scripts must validate track durations via `ffprobe` prior to running `ffmpeg -filter_complex`.

---

## 28. Reimagined Showcase Architecture: Dynamic Multi-Depth Perspectives, Camera Facing Synchronization, UI Spotlight & Clean Insignia Cards

### 28.1 Dynamic Camera Facing Synchronization on Save State Transition
- **The Failure Mode**:
  - In Angband, restoring a save or spawning into a level defaults client state to `facing = 0` (North) unless overridden. If the architectural corridor, active monsters, or open town square lie to the South, West, or East, the camera immediately stares directly into a blank dead-end wall upon load.
  - Earlier recording passes in Acts 1, 4, 5, and 6 suffered from this: the Orc Archer was South, the Cave Troll was West, and the Young Red Dragon was East, resulting in jarring wall views before any player turn.
- **The Architectural Invariant**:
  - The client transition function `transitionToState(charName, initialFacing)` in `demo-recorder.js` must explicitly accept an `initialFacing` parameter (`0` = North, `1` = East, `2` = South, `3` = West).
  - Immediately upon loading the game frame, the client must invoke `dungeon.setFacing(initialFacing)` and set `cameraYaw` accordingly:
    - `facing = 0` (North): `yaw = 0`
    - `facing = 1` (East): `yaw = -Math.PI / 2`
    - `facing = 2` (South): `yaw = -Math.PI`
    - `facing = 3` (West): `yaw = Math.PI / 2`
  - This guarantees the camera opens with instant, panoramic framing of monsters, corridors, and chambers without requiring blind dummy turns.

### 28.2 Isolated Pristine Golden Save State Management
- **The Failure Mode**:
  - Angband writes persistent game updates directly to `engine/build/game/lib/save/`. A single live capture or automated test run can deal damage to monsters, consume inventory consumables (potions, scrolls, arrows), alter player gold, or leave the player facing an altered orientation.
  - Subsequent recording passes then load degraded or dead saves, causing cascading test and video failures.
- **The Architectural Invariant**:
  - All golden saves (`demo_town`, `demo_crypt`, `demo_vault`, `demo_caverns`, `demo_mage`, `demo_combat`) must be maintained in an isolated backup repository (`tools/demo_saves_backup/`).
  - Prior to launching any recording session or verification suite, the automation script **MUST** copy pristine backup files to `engine/build/game/lib/save/`.
  - Canonical generator scripts (`tools/setup_reimagined_golden_saves.py`) must be maintained to regenerate all 6 pristine saves deterministically if engine data structures evolve.

### 28.3 Theatrical Pure Insignia Cards vs. Gameplay Purity
- **The Failure Mode**:
  - Displaying cluttered menus, play buttons, or UI headers during the theatrical splash screen detracts from brand polish and feels uncinematic.
- **The Architectural Invariant**:
  - The opening splash card (0:00 - 0:04) and outro card (3:24 - 3:35) render pure **Thunderbear Studios** branding on obsidian black with warm amber/gold radial backglow.
  - Zero HUD buttons, zero menu options, and zero text occlusions appear on the theatrical card.
  - The scene transitions smoothly into live 3D gameplay with zero artificial cuts.

### 28.4 Comprehensive In-Engine UI Spotlight Across Depths
- **The Invariant**:
  - Rather than focusing on invisible stealth mechanics or infravision, the walkthrough actively highlights visible, responsive UI systems across 6 distinct character classes and dungeon depths:
    1. **Town DL 0 (Half-Elf Necromancer)**: Street life, cobblestone arches, Armoury storefront, celestial canopy, and town stair descent.
    2. **Shallow Crypts DL 1 / 50ft (High-Elf Paladin)**: Vaulted stone arches, 0-turn camera yaw look-around, interactive minimap zoom (`+`/`-`), tactical melee, and copper loot pickup.
    3. **Dual Reality DL 1 / 50ft (Half-Orc Druid)**: Full classic 80x24 green-screen CRT terminal (`[Tab]`) switching seamlessly to 3D Druid quarterstaff vs White Jelly with floating `"Zzz..."`.
    4. **Caverns DL 12 / 600ft (High-Elf Ranger)**: Deep brick corridors, ranged bow archery (`[f]`) striking an Orc Archer down the hall, and collapsible message log drawer (`[L]`).
    5. **Arcane Vault DL 20 / 1000ft (Dunadan Mage)**: Grimoire spellcasting (`[m]`), Magic Missile impact on towering Cave Troll, and potion of cure critical wounds quaffing (`[q]`).
    6. **Magma Vault DL 25 / 1250ft (Half-Orc Necromancer)**: Westernesse fire blade melee against towering Young Red Dragon in magma fissures, combat log reactions, and phase door emergency teleport (`[r]`).
    7. **Pause Menu & Portability**: Glassmorphism pause menu (`[Esc]`) highlighting universal `.SAV` savefile download.

### 28.5 Audio Stems Scheduling & Mutual Exclusion Invariants
- **The Invariant**:
  - All 16 Gemini Native Audio stems must be measured with `ffprobe` prior to muxing.
  - Narrative audio timeline must maintain $\ge 1.5\text{s}$ silent separation between any two consecutive voice tracks to guarantee zero speech collision, zero auditory fatigue, and seamless musical underscore breathing room.

---

## 29. Award-Ready Production Finalization: Tall 2-Tile Shockbolt Detection, Vocal Dialogue Choreography, Message Drawer Mutual Exclusion, and Release Asset Isolation

### 29.1 Tall 2-Tile Monster Atlas Extraction & Anatomical Aspect Ratio Heuristics
- **The Upstream Shockbolt Peculiarity**:
  - In upstream Angband's 64x64 graphical tileset (`graf-dvg.prf`), massive creatures (Cave Trolls, Stone Giants, Great Wyrms, Ancient Dragons, Colossi, and Shelob) actually span **two vertical tiles** (`64x128` source area).
  - The font preference mapping file indexes creatures by their **lower tile** (representing the creature's feet and legs).
  - Naive single-cell extraction (`64x64`) sliced creatures horizontally across their waist, rendering "headless" monsters in 3D billboard space.
- **The Anatomical Coordinate Rule**:
  - Systematic inspection of the master tile sheets revealed that 2-tile creatures inhabit Row 29, Row 31, and Row 27 (columns $\ge 122$).
  - For these creatures, the upper tile (head, shoulders, and chest) is located at `Row - 1` with identical column offset.
- **The Automated Atlas Invariant (`build_monster_atlas.ps1`)**:
  - When `$isTall` is detected (`$m.Row -eq 29 -or $m.Row -eq 31 -or ($m.Row -eq 27 -and $m.Col -ge 122)`):
    - Source rectangle is dynamically shifted up: `srcY = (m.Row - 1) * 64`
    - Source height is doubled: `srcHeight = 128`
    - The full anatomical body is composited cleanly into the destination atlas tile.
  - **Billboard Aspect Ratio Clamping**:
    - When rendered in 3D world space, a 1:2 source sprite must not be stretched into a 1:1 square.
    - Clamping rule: If `$isTall` and `$width > ($height * 0.65)`, `$width` is automatically adjusted to `Math.Round($height * 0.55, 2)`. This preserves natural, upright physiological proportions for towering beasts in first-person 3D.

### 29.2 Act 6 Authentic Creature Voice & Tactical Lorekeeper Dialogue Choreography
- **The Failure Mode**:
  - In conversational or tactical encounters where both an adversary (e.g. Orc Shaman) and a party companion (Lorekeeper Aoede) speak within the same act, naive parallel playback creates cacophonous audio collision.
- **The Choreographed Dialogue Pattern**:
  - Adversarial dialogue must precede companion analysis:
    1. **Adversary Speech (164.0s - 169.5s)**: In Act 6, the Orc Shaman sneers: *"Ghash! Die, surface filth! The dark lord's fire shall roast your bones!"*
    2. **Acoustic Rest Buffer (169.5s - 172.0s)**: A clean $2.5\text{s}$ pause allows sound effects and combat grunts to resonate without speech clutter.
    3. **Companion Tactical Counsel (172.0s - 178.5s)**: Lorekeeper Aoede advises: *"Careful! His curses sap your vigor. Strike him down before his shamans rally!"*
- **Visual Subtitle Speaker Attribution**:
  - In both `demo-player.js` and `demo.html`, subtitle stems include explicit `speaker` identifiers rendered with dedicated CSS classes:
    - `.speaker-lorekeeper`: Radiant sky blue (`#38bdf8`) with tome iconography.
    - `.speaker-creature`: Threatening crimson (`#ef4444`) with combat dagger iconography.
  - This visual distinction ensures closed captions provide crystal-clear speaker context for viewers and judges.

### 29.3 Strict Angband Source Adherence vs. External Lore Invariants
- **The Mechanical Integrity Invariant**:
  - Dialogue, tooltips, and narrative text must **strictly adhere** to Angband 4.2.6 C engine rules and Tolkien lore as codified in `list-mon-races.h` and upstream documentation.
  - Invented fanfiction, non-canonical stats, or mechanics from unrelated games are strictly prohibited.
  - All demonstrated combat capabilities reflect authoritative engine formulas:
    - Young Red Dragon breath weapons and fire resistance mechanics.
    - Phase door teleport radius ($r \le 10$ tiles).
    - Sound propagation and infravision distance ($40\text{ft}$).
    - Classic 0-turn camera yaw (client-side viewport transformation with zero turn cost).

### 29.4 Layout Lock Interval vs. Modal Drawer Display Invariants
- **The Failure Mode**:
  - `demo-recorder.js` maintains a periodic `layoutLockInterval` (executing every 300ms) to guarantee that HUD elements, mini-bars, and overlays adhere to responsive mobile/desktop boundaries during automated recording.
  - When an automation script invoked `btnMsgClose.click()` or set `msgWin.style.display = 'none'` in Act 6 to showcase an uncluttered 3D corridor view, the layout lock interval immediately re-asserted `msgWin.style.setProperty('display', 'flex', 'important')`.
  - The message log drawer repeatedly snapped back open, obstructing the corridor camera and blocking keyframes.
- **The Architectural Invariant**:
  - UI controllers with active layout monitoring loops must check higher-level semantic state flags rather than relying on direct DOM property tampering.
  - A boolean state flag `messageLogVisible` was integrated into the core layout manager:
    ```javascript
    msgWin.style.setProperty('display', (splashVisible || !messageLogVisible) ? 'none' : 'flex', 'important');
    window.__messageLogClosed = !messageLogVisible;
    ```
  - During Act 6, setting `messageLogVisible = false` cleanly suppresses the drawer across all layout recalculations.
  - When entering Act 7, setting `messageLogVisible = true` restores the combat log smoothly for dragon battle telemetry.

### 29.5 Unified Standalone Showcase Routing & HTTP 206 Partial Content Streaming
- **The Parity Invariant**:
  - The standalone showcase URL (`angband3d.com/demo`) and the in-game splash screen modal (`#demo-modal`) share identical master video streams, subtitle stems, and chapter metadata.
  - Fallback mechanisms in both players support both legacy property naming (`subtitles`) and modern stem naming (`audioStems`).
- **HTTP 206 Byte-Range Streaming**:
  - In `server/src/server.js`, media streaming handles `Range: bytes=start-end` headers with status code `206 Partial Content`, `Content-Range: bytes START-END/TOTAL`, and `Accept-Ranges: bytes`.
  - This allows instant timeline seeking and scrubbing across the 275-second showcase video without requiring the browser to buffer the complete 115 MB MP4 file upfront.

### 29.6 Distribution Package Hygiene & Heavy Demo Video Separation Invariants
- **The Separation Invariant**:
  - Demo videos, promotional capture tools, and raw screen recordings must remain **strictly isolated** from production game releases.
  - `tools/package.ps1` explicitly purges `assets/video/` from the staged distribution directory (`dist/Angband3D-Windows-x64/www/`) before creating release archives.
  - This prevents game distribution packages (`angband3d-standalone.zip`) from being bloated by 260+ MB of video data, guaranteeing lightweight, instant downloads for players while maintaining all marketing assets on the web server and dedicated `/demo` showcase.

### 29.7 CDN Edge Cache Monolith Trap & Service Worker Range Interception (The "Zero-Seek" Production Defect)
- **The Failure Mode**:
  - Video chapter navigation (Act 0 through Act 9) worked smoothly on `localhost:8080`, but completely froze on the live production domain (`angband3d.com` and `angband3d.com/demo`).
  - Clicking any Act button or dragging the scrubber updated UI state momentarily, but the video immediately snapped back to $t=0$ or buffered playback stalled.
  - Headless Chrome CDP evaluation revealed:
    ```json
    "videoSeekable": [{ "start": 0, "end": 0 }],
    "directSeekAssignment": { "before": 1.94, "immediate": 0 }
    ```
- **The Triple Root Cause**:
  1. **Cloudflare Edge Proxy Range Stripping**:
     - Origin `server.js` previously emitted `Cache-Control: public, max-age=86400` on video assets.
     - When Cloudflare edge proxies cached the 120 MB MP4 file, they stored it as a monolithic `HTTP 200 OK` response.
     - Subsequent client `Range: bytes=start-end` requests were answered directly by Cloudflare's edge cache with `HTTP 200 OK` (chunked transfer) rather than querying the origin with the `Range` header.
     - Because the browser received `HTTP 200` instead of `HTTP 206 Partial Content` (with `Content-Range: bytes ...`), Chrome's native AV decoder marked the stream as unseekable (`seekable.length === 1 && end === 0`), causing any `video.currentTime = X` assignment to immediately reset to $0$.
  2. **Service Worker Range Interception**:
     - `server/public/sw.js` was intercepting all `fetch` events with `event.respondWith(fetch(event.request))`.
     - Standard Service Worker `respondWith()` pipelines in Chromium and WebKit strip or buffer HTTP 206 byte ranges unless explicitly bypassed.
  3. **Cloud Run / Google Frontend 32MB Response Body Limit & Range Oversizing**:
     - Google Cloud Run (and Google Frontend load balancer) enforces a strict 32 MB response body limit (`HTTP 500` with `server: Google Frontend` and `content-length: 0`).
     - When Chrome streams or seeks HTML5 video, Chrome sends open-ended range requests (`Range: bytes=0-` or `Range: bytes=32000000-`).
     - If origin server naively resolves open-ended ranges to `end = total - 1`, the response payload equals the remaining file size (e.g. 120MB or 88MB).
     - This exceeds the 32MB limit, causing Google Frontend to immediately terminate the connection with `HTTP 500`.
     - In response to HTTP 500, Chrome's media pipeline never fires `loadedmetadata`, `duration` stays null, and seeking immediately aborts or snaps back to 0.
- **The Mandatory Architectural Invariants**:
  1. **Strictly Dynamic Media Caching for Byte-Range Endpoints**:
     - In `server.js`, video and audio streams requiring byte ranges (`.mp4`, `.webm`, `.m4a`) must NEVER be served with `public` caching.
     - Always emit `Cache-Control: no-cache, no-store, must-revalidate` on both full and `HTTP 206 Partial Content` responses. This guarantees CDN edge proxies (Cloudflare) mark requests as `DYNAMIC`, forwarding client `Range` headers to origin and streaming `HTTP 206` slices directly to the browser.
  2. **Explicit Service Worker Media Stream Bypass**:
     - In `sw.js`, any request matching `/assets/video/`, `.mp4`, `.webm`, or containing a `Range` header must return immediately without calling `event.respondWith()`:
       ```javascript
       if (url.pathname.startsWith('/assets/video/') || url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm') || event.request.headers.has('range')) {
           return; // Allow native browser media pipeline to handle HTTP 206 range streaming
       }
       ```
  3. **RFC 7233 / RFC 9110 Safe Range Chunk Clamping (4MB Slices)**:
     - Under the HTTP range specification, an origin server is explicitly permitted to return a smaller byte range than requested in an `HTTP 206 Partial Content` response.
     - Never resolve open-ended ranges (`bytes=0-`, `bytes=X-`) to `total - 1`. Always clamp the response chunk size:
       ```javascript
       const MAX_CHUNK = 4 * 1024 * 1024; // 4MB safe chunk size
       const actualEnd = Math.min(end, start + MAX_CHUNK - 1, total - 1);
       ```
     - This guarantees every response body stays well below the 32MB Cloud Run limit, minimizes Time-to-First-Frame (TTFB), and delivers instant, silky-smooth chapter seeking and timeline scrubbing.
  4. **Versioned Asset Aliases for Edge Cache Invalidation**:
     - Because CDNs like Cloudflare cache by URL and may hold stale 200 responses or proxy errors for hours, bump the video asset alias in markup (e.g. `/assets/video/angband3d_demo_v884.mp4`) and resolve it dynamically on origin to the canonical file on disk.
- **Verification Proof**:
  - Automated Chrome CDP tests (`tools/test_live_act_nav.js`) verify:
    - `video.seekable` spans the complete 275s duration (`[{ start: 0, end: 274.96 }]`).
    - Network responses return `HTTP 206 Partial Content` with `Content-Range: bytes ...` and `Content-Length: 4194304`.
    - Clicking Act 3 ($75.0\text{s}$) and Act 7 ($197.5\text{s}$) updates `currentTime` instantly without snap-back.
    - Pressing Arrow Right (+5s) and Arrow Left (-5s) navigates forward and backward seamlessly.

### 29.8 True Fullscreen Video Architecture & Auto-Hiding Floating HUD Controls
- **The Failure Mode**:
  - Clicking the Fullscreen button (`⛶`) or pressing `F` failed to make the video fill the screen.
  - The player container retained its desktop windowed constraints (`max-width: 1040px`, `max-height: min(580px, calc(100vh - 220px))`).
  - The video remained in a small letterboxed box in the center of the display with massive black borders and vertically stacked controls underneath.
  - On iOS Safari, `div.requestFullscreen` is unsupported, causing the button to do nothing.
  - Pressing `Escape` in fullscreen closed the entire game modal rather than exiting fullscreen first.
- **The Triple Root Cause**:
  1. **Missing `:fullscreen` CSS Rules**: No `:fullscreen`, `:-webkit-full-screen`, or `.is-fullscreen` style rules existed in the stylesheet, so browser native fullscreen applied default centered box styling with origin dimensions.
  2. **Vertical Flow vs. Overlay Layout**: In normal layout, transport controls and chapter pills were stacked vertically beneath the video wrapper. In fullscreen, these controls occupied vertical space and prevented the video from utilizing 100vh.
  3. **Event & Key Handler Desynchronization**: The player did not listen to `fullscreenchange` / `webkitfullscreenchange`, so browser-initiated exits (such as `Esc` or browser controls) left `this.isFullscreen` out of sync. Pressing `Escape` closed the modal rather than exiting fullscreen first.
- **The Mandatory Architectural Invariants**:
  1. **Complete Viewport Video Fill**:
     - In fullscreen mode, `.demo-theater-container` and `.demo-video-wrapper` expand to `100vw !important` and `100vh !important`, while `#demo-video-player` uses `object-fit: contain; width: 100%; height: 100%;` to letterbox cleanly to the monitor's exact aspect ratio.
  2. **Floating HUD Controls**:
     - `.demo-transport-bar` and `.demo-chapter-ribbon` float over the bottom of the video (`position: absolute; bottom: 50px / 8px; left: 50%; transform: translateX(-50%)`) with dark glassmorphism and ambient blur.
  3. **Auto-Hiding HUD on Idle**:
     - After 2.5s of mouse/keyboard inactivity while video is playing, `.hud-hidden` is applied, transitioning controls to `opacity: 0; pointer-events: none;` and setting `cursor: none;`.
     - On any mouse move, click, touch, or keypress, the HUD immediately reappears.
     - Controls are never hidden while playback is paused.
  4. **Native iOS WebKit Fallback**:
     - For iOS Safari, when `container.requestFullscreen` is unavailable or rejected, fallback immediately to `video.webkitEnterFullscreen()`.
  5. **Bi-directional Fullscreen Event Sync**:
     - Listen to `document.fullscreenchange` and `webkitfullscreenchange` to synchronize `this.isFullscreen`, update button glyph (`⛶` vs `⤓`), and toggle `.is-fullscreen` on the container.
  6. **Ergonomic Keyboard & Mouse Shortcuts**:
     - Double-click on video toggles fullscreen.
     - Single-click on video toggles play/pause.
     - `F` key toggles fullscreen.
     - `Escape` key exits fullscreen if active, or closes the modal if already windowed.
- **Verification Proof**:
  - Automated headless Chrome CDP test (`tools/test_fullscreen.js`) verifies:
    - Normal dimensions: video 1038x579, container 1040x764.
    - Fullscreen dimensions: video 1904x929 (100% of viewport), container 1904x929.
    - HUD auto-hide: Opacity drops to 0 after 2.5s idle on both dedicated showcase (`/demo`) and in-game modal (`/`).





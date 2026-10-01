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


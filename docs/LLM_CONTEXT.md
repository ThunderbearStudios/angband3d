# angband3d — AI Context & Onboarding Guide

## Mission & Architecture
`angband3d` is a first-person 3D dungeon crawler frontend for Angband 4.2.6 (C engine + Godot 4.7.2 Mono/C# client).
Rather than rewriting Angband rules in C#, Angband runs as a headless child process communicating via line-delimited JSON over stdio.

```
+------------------------------------+             +-------------------------------------+
| engine/ (Angband 4.2.6 C)          |  JSON stdout | client/ (Godot 4.7.2 C# client)      |
|  - main-bridge.c (JSON Term/events)| -----------> |  - BridgeClient.cs (Process stdio)  |
|  - bridge-json.c                   |              |  - DungeonWorld.cs (3D mesh/camera) |
|  - Minimal changes to 4 core files | <----------- |  - Overlay.cs (2D Map/Term/HUD/Menu)|
+------------------------------------+  stdin keys  |  - Main.cs (view/input coordinator) |
                                                    +-------------------------------------+
```

## Critical Invariants & Rules
1. **Never break Angband rebasability**:
   - Upstream engine modifications MUST stay isolated to `main-bridge.c`, `bridge-json.c`, `bridge-json.h`, and `BRIDGE_Frontend.cmake`.
   - Only 4 core files are touched to register the module: `main.c`, `main.h`, `CMakeLists.txt`, `src/Makefile.src`.
   - When modifying engine code, always refresh the patch:
     ```powershell
     cd engine; git diff 4.2.6..HEAD --output=..\engine-patch\0001-bridge-frontend.patch
     ```
2. **Never change game rules or save format**:
   - Saves are standard Angband saves stored in `engine/build/game/lib/save/`.
   - Game logic and RNG are 100% authoritative in Angband C.
3. **Turn/Input Architecture**:
   - Input is delivered as keypresses (`key <spec>` or `keys <text>`), NOT `cmdq_push()`, preserving menus, prompts, wizard mode, and birth screens.
   - Turning (Left/Right arrow) is camera-only, instant, 0-turn, and NOT gated on engine busy state.
   - Moving (Up/Down arrow) sends `up`/`down` relative to current camera facing (`N`, `E`, `S`, `W`).
   - `Shift-M` = 2D Map toggle. `m` = Cast spell / magic selection in Angband.
   - `Escape` in dungeon opens in-game pause menu (Resume, Quick Save `Ctrl-S`, Load, Save & Quit `Ctrl-X`, Exit).
   - `Ctrl-W` = Wizard mode toggle. `Ctrl-A` = Wizard debug commands.
4. **View Routing Rule (`NeedsTerminal`)**:
   - `phase != "play"` -> Terminal overlay (splash, birth, level gen).
   - `ui.overlay > 0` -> Terminal overlay (inventory, stores, character sheet).
   - `!awaiting_command && !more` -> Terminal overlay (direction/target/item/yes-no prompts).
   - `more == true` (-more- message pause) -> STAYS IN 3D WORLD, drawn highlighted on HUD.
5. **Terrain vs Glyph**:
   - 3D world geometry MUST be built from map `f` (feature index), NOT `g` (glyph), because glyphs get overwritten by monsters standing on tiles.
   - Engine sends a one-time `features` message containing all feature names, glyphs, and passability flags (`f_info`).

## Quick Build & Run Commands
- **Launch Game**: `.\play.cmd` (or `.\play.ps1 -Character <name> [-Random|-Manual]`)
- **Build Engine**: `.\build.cmd` (runs CMake Ninja inside MSYS2 MinGW64)
- **Build Client**: `dotnet build client/angband3d.csproj`
- **Run Acceptance Tests**: `python tools/smoke_test.py` (11 tests, zero dependencies)
- **Run Upstream Tests**: Run in MSYS2: `cd engine && cmake --build build -t allunittests` (932 tests)
- **Automated Client Test**: `godot --path client -- --save=test --keys=... --screenshot=out.png --shot-after=180`

## Key Files Reference
- `engine/src/main-bridge.c`: The C bridge emitting JSON frames and receiving key commands.
- `client/scripts/BridgeClient.cs`: Handles child process stdio via `System.Diagnostics.Process` (avoid Godot's `OS.ExecuteWithPipe`).
- `client/scripts/Main.cs`: Main loop, input routing, start/pause menus, script test runner.
- `client/scripts/DungeonWorld.cs`: 3D procedural grid mesh, camera tweening, torch lighting, entity billboards.
- `client/scripts/Overlay.cs`: 2D canvas drawing HUD, classic 2D map overlay, 80x24 terminal overlay, and main/pause menus.
- `server/public/js/dungeon3d.js`: Web 3D exploration engine (Three.js procedural meshes, PBR textures, entity models, fog).
- `server/public/js/hud.js`: Web HUD overlay, real-time combat message feed, top action banner, minimap, death modal.
- `server/public/js/app.js`: Web application coordinator, view routing (`needsTerminal`), toolbar/menu isolation.
- `server/public/js/input.js`: Web input dispatcher (3D movement, vanilla Angband action keys, terminal modal hotkeys).
- `server/public/js/chronicle/chronicle-manager.js`: UI coordinator for The Living Chronicle, story playlist, audio preemption gate, and modal settings.
- `server/public/js/chronicle/chronicle-audio.js`: Dual-engine audio router (Edge Neural default for sub-100ms lockstep gameplay + Gemini preview fallback, Web Audio DSP, ribbon warmth).
- `server/public/js/chronicle/chronicle-grounder.js`: Canon Tolkien lorekeeper, 3D model-to-sex determination, and instance voice continuity registry.
- `server/public/js/chronicle/chronicle-llm.js`: Multi-LLM BYOK adapter with free-tier sliding-window rate limiting (10 RPM) and secure backend proxy routing.
- `server/src/server.js`: Protected backend proxy (`POST /api/llm/generate`), Gemini TTS (`/api/tts`), and zero-leakage API key isolation.
- `docs/PROTOCOL.md`: JSON wire specification.
- `docs/ARCHITECTURE.md`: Technical trade-offs and rationale.
- `docs/LOW_HANGING_FRUIT_PLAN.md`: Full implementation log of 7 graphics/engine features.
- `docs/GENERIC_ENGINE_INTEGRATION.md`: Architectural specification for integrating other roguelikes (NetHack, Moria, DCSS, ADOM).
- `engine-patch/0001-bridge-frontend.patch`: Git patch against Angband 4.2.6.

## Declarative Registries & Extension Points
- **Monster Models (`MonsterModelResolver.cs`)**:
  - `MonsterModelRule`: Record defining model path, scale, ethereal/floating flags, animation speed, equipment role, and optional name matcher function.
  - `MonsterModelResolver.RegisterModelRule(char glyph, ...)`: Add custom humanoid or mesh models with 1 line of code.
  - Equipment roles: `Unarmed`, `Warrior`, `Barbarian`, `Rogue`, `Archer`, `Mage`, `TwoHandedSword`, `TwoHandedAxe`, `TwoHandedStaff`.
- **First-Person Viewmodel (`ViewModel.cs`)**:
  - Articulated low-poly arm rig with dynamically tinted skin and class-specific sleeves/cuffs.
  - Automatic wielded weapon, shield, spellbook, and lit torch matching with walk bobbing and inertia sway.
  - Perspective, reach, and camera FOV scale dynamically with character height stats (`CurrentHeightRatio`).
- **Item Models (`ItemModelResolver.cs`)**:
  - `ModelMappings`: Dictionary mapping item glyphs to 3D models and scaling.
  - `ItemModelResolver.RegisterItemModel(char glyph, string path, float scale)`: Register new item pickups.
  - Procedural materials and meshes are cached to prevent allocation churn.
- **Combat Juice & Visual Feedback (`DungeonWorld.cs`)**:
  - `SpawnFloatingText(string text, Vector3 worldPos, Color color, float scale)`: 3D billboarding floating combat numbers.
  - `SpawnHitSparks(...)`, `SpawnDeathVfx(...)`, `SpawnSpellVfx(...)`: Particle VFX on melee/cast/death.
  - `AddTrauma(float amount)`: Smoothly decaying screen trauma shake on impacts.
  - `ProcessCombatEvents(JsonElement frame)`: Central hook parsing combat messages.
- **Procedural Clutter & Sconces (`DungeonClutterResolver.cs`)**:
  - Corridor torch sconces with point lights placed every 6-8 tiles.
  - Room corner pillars, crates, barrels, and heraldic banners.
- **Audio & Spatial Sound (`AudioManager.cs`)**:
  - Positional 3D sound effects for footsteps, swings, hits, spells, doors, and stairs.
- **Minimap Scaling vs Zoom (`Overlay.cs`)**:
  - Physical window sizing decoupled (`[/]`) from grid zoom radius (`PgUp/PgDn`).

## Known Gotchas, Dead Ends & Lessons Learned
1. **Frame sync off-by-one**: The bridge emits an initial frame when waiting for input before any command is sent. Clients must consume this and check `seq > last_seq`.
2. **`create_needed_dirs()`**: On Windows, `main.c` skipped creating `lib/save`. `main-bridge.c` calls `create_needed_dirs()` during init.
3. **Safety check `bridge_in_play()`**: Frames can be emitted mid-generation. Any coordinate access must check `character_dungeon && character_generated && cave && player && square_in_bounds()`.
4. **Equipment slot lookup assertion**: Calling `slot_by_name()` on optional slots (e.g., weapon, bow, shield) will trigger an engine `assert()` and crash if absent. Use `bridge_get_equipped_by_type(player, EQUIP_*)` which safely scans `player->body.slots`.
5. **Deadlock in Godot stdio**: Never use `OS.ExecuteWithPipe()` — it blocks and deadlocks on shared handles. `BridgeClient.cs` uses `System.Diagnostics.Process` with asynchronous line events.
6. **Patch export encoding**: Never redirect git diff in PowerShell with `>` (writes UTF-16 and breaks `git apply`). Always use `git diff 4.2.6..HEAD --output=..\engine-patch\0001-bridge-frontend.patch`.
7. **Object identification integrity**: `object_kind_name(..., false)` is used so unidentified items show their flavor, not actual identity.
8. **Never use `-n` blindly**: It overwrites existing save files. Client uses unique slot names via `FreeSlot()`.
9. **C# String Interpolation**: Nested quotes inside interpolated strings (`$"...{"NESW"[i]}..."`) cause build failures on Mono SDK; use separate variable lookups.
10. **Map Feature String Encoding**: In the JSON bridge, `map.rows[y].f` encodes tile feature indices as a string of 2 hex characters per tile (`w * 2`). Never index `f[px]` directly as a character; always decode using `parseInt(f.substring(px * 2, px * 2 + 2), 16)`.
11. **Engine Message Ring-Buffer Baseline**: The C engine retains up to 24 previous messages across phase boundaries (e.g. `Accept character history? [y/n]`). When entering active play (`inPlay && !wasInPlay`), the frontend must baseline-seed `prevMessages = frame.messages` and `lastTermRow0` so historical birth prompts are not treated as new in-game messages.
12. **Canvas Command Isolation & Touch Navigation Exclusivity**: Clicks, drags, and pinch gestures inside `#terminal-viewport` / `#terminal-canvas` strictly pan and zoom the classic ASCII grid. Terminal selection and game command keys must be dispatched through external tactical navigation controls (`#terminal-touch-controls`).
13. **Landscape Mobile Collision-Free Invariant**: On landscape mobile displays (`max-height: 520px` / `orientation: landscape`), the virtual movement D-pad (`#touch-controls`) is docked bottom-left, the tactical action cluster (`#action-bar:not(.drawer-open)`) is docked bottom-right in 2 columns, and the status footer (`#hud-footer`) is constrained to the center between `left: max(160px, ...)` and `right: max(160px, ...)`. `#minimap-container` requires `left: auto !important; right: max(8px, ...)` to override desktop `left: 18px`. `#top-right-bar` is hidden during terminal mode (`body.terminal-mode-active #top-right-bar { display: none !important; }`) to prevent overlap with zoom controls.
14. **Emscripten IDBFS `timestamp` Index Invariant**: Emscripten's virtual filesystem requires an index named `'timestamp'` on the `FILE_DATA` object store. Any custom IndexedDB opening code must ensure this index exists during `onupgradeneeded`, otherwise `IDBFS.getRemoteSet()` throws `NotFoundError`, silently emptying `/lib/save` and dropping loaded saves into character creation.
15. **Two-Phase Commit for Worker Save Flushing**: When quitting or loading, never call `worker.terminate()` immediately after sending a save command. The engine worker must acknowledge `saved_persisted` (after `IDBFS.syncfs(false)` completes) before process termination to prevent save corruption.
16. **Camera Euler Order ('YXZ') & Stationary Roll Lock**: In Three.js, camera rotation order must be `'YXZ'` (Yaw first around world up-axis, then Pitch up/down, then Roll clamped to 0). This prevents Dutch-angle diagonal room tilting while maintaining height pitch compensation.
17. **Strict Keyboard Invariant (NO WASD for Movement)**: Never bind W/A/S/D to movement in roguelikes. In Angband, `w` = wield, `s` = spike/sell, `a` = aim wand, and `d` = drop item. Movement is strictly Arrow keys and Numpad.
18. **Three.js `InstancedMesh` Color Initialization**: When using `InstancedMesh`, always initialize `instanceColor` buffers to 1.0. Uninitialized color buffers cause dungeon walls to render pitch black.
19. **Audio Master Dynamics Limiter Node**: When synthesizing Web Audio procedural sound effects, always place a `DynamicsCompressorNode` (-12dB threshold, 12dB knee, 4.5 ratio, 3ms attack, 120ms release) before the destination to prevent digital clipping when multiple sounds play simultaneously. Strictly NO ambient looping drones/hums.
20. **Android Target SDK 34 & Keystore Signing**: Android 14+ requires `targetSdkVersion 34` and dual v1+v2 signature scheme. Always sync assets with `npm run android:sync` (`cap sync android`) before building release APKs.
21. **Zero API Key Leakage & Header-Based Auth**: Never pass API keys in URL query strings (`?key=...`) as they leak into server logs, proxy caches, and referrer headers. Always authenticate Gemini via the standard `x-goog-api-key` HTTP header. Store keys strictly in client `localStorage` with permanently masked `type="password"` input fields.
22. **Strict Free-Tier Limiter & Confirmed Working Model Cascade**: The 10 RPM sliding rate-limiter is permanently active. On rate limits or HTTP 429 quota exhaustion, the engine cascades sequentially down through confirmed working stable Gemini models (`gemini-3.8-flash` -> `gemini-3.7-flash` -> `gemini-3.6-flash` -> `gemini-3.5-flash` -> `gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-2.5-flash` -> `gemini-2.5-flash-lite`), notifying the player transparently, before seamlessly dropping to zero-downtime offline procedural lore.
23. **Web-Only Tome Scope & Standalone Purity**: The Living Chronicle and Voiced Lorekeeper (`#btn-toggle-chronicle`, `#chronicle-window`, `ChronicleManager`) are strictly scoped to the Web Client (`https://angband3d.com` and standard browser environments). All standalone editions (Desktop WebView2, Android APK, and native Godot C# client) strictly suppress the Tome button/window (`body.is-standalone`, `display: none !important`) and bypass `ChronicleManager.init()` to ensure standalone binaries remain 100% offline, lightweight, and pure.
24. **Flowing Saga Design (Elimination of Artificial Chapters & Sketches)**: Artificial chapter cards with golden banners (`Chapter 1: ...`) and canvas thumbnail snapshots (`toDataURL()`) are completely eliminated. Narrative renders as a continuous, flowing saga with subtle depth markers. Disabling `preserveDrawingBuffer` and WebGL stencil buffer (`stencil: false`) saves significant GPU bandwidth and boosts framerates by 15-25%.
25. **Zero-Quality-Loss Performance Invariants**:
    - WebGL `stencil: false` saves VRAM and clear passes.
    - Euclidean `distanceToSquared()` eliminates hundreds of `Math.sqrt()` calls per frame.
    - Raycaster and math vector pooling (`this._mouseVec`, `this._raycaster`, `this._tempVec3`) eliminate GC pauses during mouse interaction.
    - Static module-level RegExp compilation eliminates per-frame heap allocations.
    - O(1) incremental story playlist appending eliminates O(N) DOM parsing on active turns.
    - Server-side in-memory static Gzip caching serves static bundles in `<1ms`.
26. **Dual Voice Engines & Subterranean DSP**: Voice synthesis uses Gemini Native Audio (`Enceladus`) with fallbacks to Edge Neural TTS (`edgeVoicePool`), conditioned with a 10% Subterranean Reverb impulse response convolver and biquad ribbon filter for subterranean ambience.
27. **PowerShell Banker's Rounding vs Math.Floor**: In PowerShell scripts creating sprite atlases, `[int]($i / $tilesPerRow)` uses IEEE 754 banker's rounding to the nearest even integer, shifting row indices for odd quotients (e.g. $147/32 = 4.59375 \to 5$), whereas C# / JS truncate towards zero. Always use `[int][Math]::Floor($i / $tilesPerRow)` to guarantee 100% lore-accurate UV slot alignment.
28. **High-Density De-Fringing, 2D Drop Shadow Stripping & Sharpening**: Legacy Shockbolt tiles contain neutral-grey baked drop shadows ($A < 140$) and un-premultiplied dark fringes from transparent black canvas boundaries. Atlases must programmatically strip baked 2D shadows (replacing with real-time 3D contact shadows `contactShadowDisc`), un-premultiply alpha boundaries ($C' = C / \max(0.25, A/255)$), and apply contrast-adaptive cross-Laplacian detail sharpening. Three.js `alphaTest` set to `0.35` ensures clean edges without dark halos.
29. **4096×4096 HD Bilateral Normal Maps & Anisotropic Filtering**: High-fidelity normal-mapped creature/item atlases utilize 4096×4096 resolution with 16× anisotropic filtering, `LinearFilter`, and balanced normalScale (0.45, 0.45).
30. **Automated Master Lore Audit**: `tools/audit_atlas_models.js` provides continuous CI validation of 624 monsters, 498 items, 27 3D meshes, and 4096 HD dimensions with 100% pass rate.

> **Master Architecture & Lessons Learned Guide**: For complete historical context, architectural rationale, and deep-dive explanations of all lessons learned across the project, consult [docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md](file:///c:/Dev/angband3d/docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md).

## Token Efficiency & LLM Rate Limit Protocol
1. **Zero-Discovery Startup**: Consult the Key Files Reference above rather than running exploratory searches.
2. **Windowed Reads**: Limit `read_file` to specific line ranges (30-100 lines max).
3. **Targeted Replacements**: Use `replace_string_in_file` / `multi_replace_string_in_file` with 3 lines of context.
4. **Check State**: Fast verify via `python tools/smoke_test.py` (0.5s) and `dotnet build client/angband3d.csproj` (1.3s).
5. **Session Continuity**: Record any pending work or newly discovered gotchas in `docs/NEXT_STEPS.md` before concluding.

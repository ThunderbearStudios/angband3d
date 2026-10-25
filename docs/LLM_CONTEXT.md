# angband3d — AI Context & Onboarding Guide

## Mission & Architecture
`angband3d` is a multi-realm first-person 3D dungeon crawler platform powered by **4 authoritative C/C++ roguelike engines** (`Vanilla Angband 4.2.6`, `Sil-Q`, `FrogComposBand`, and `Hengband`) paired with both a **Web Three.js / CRT Canvas / Living Chronicle client** (plus Offline Emscripten WASM, Windows `.NET 8` WebView2, and Android Capacitor APK) and a **native Godot 4.7.2 C# client**.
Rather than rewriting game rules, each engine runs as a headless child process (or WebWorker) communicating via line-delimited JSON over stdio / WebSockets.

```
+------------------------------------------+              +-----------------------------------------------+
| 4 Authoritative C/C++ Engines            |  JSON stdio  | Cloud Relay & AI Proxy (server/src/server.js) |
|  - engine/src/main-bridge.c (Vanilla)    | <----------> |  - WS multiplexer & TOFU owner tokens         |
|  - variants/silq-src/src/main-bridge.c   |              |  - /api/llm/generate & /api/tts (Gemini)      |
|  - variants/frogcomposband-src/...       |              +-----------------------+-----------------------+
|  - variants/hengband-src/... (.cpp)      |                                      | WebSocket / REST
+--------------------+---------------------+                                      v
                     | Direct stdio / WS                  +-----------------------------------------------+
                     v                                    | Web / Mobile / Desktop / Offline WASM Client  |
+------------------------------------------+              |  - app.js, input.js, screen-context.js        |
| Godot 4.7.2 C# Client (client/scripts/)  |              |  - menu-router.js, realm-keys.js, heng/*.js   |
|  - BridgeClient.cs / WebSocketBridge.cs  |              |  - dungeon3d.js (Three.js), hud.js, terminal  |
|  - Main.cs, DungeonWorld.cs, Overlay.cs  |              |  - chronicle/*.js (Voiced Lorekeeper & Tome)  |
|  - ViewModel.cs, *ModelResolver.cs       |              |  - local_bridge.js + engine-worker.js (WASM)  |
+------------------------------------------+              +-----------------------------------------------+
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
- `docs/STATE.md`: Live authoritative checklist, active task pointer, and gate run logs.
- `tools/run_tests.js`: Consolidated tiered test runner (`fast`, `e2e`, `cdp`, `all`).
- `server/public/js/screen-context.js`: Pure UMD screen classification module (`ScreenContext.classify(frame)`).
- `server/public/js/menu-router.js`: Contextual action and menu verb router across all 4 realms.
- `server/public/js/realm-keys.js`: Authoritative single source of truth for realm-specific keymappings.
- `server/public/js/heng/heng-translate.js`: Upstream-driven atomic bilingual Japanese/English translator for Hengband.
- `server/public/js/heng/heng-dict.js`: Runtime translation dictionary with lazy-loading loader.
- `server/src/http-guard.js`: Protected HTTP request sanitizer, CORS origin validator, and body size limiter.
- `server/src/rate-limit.js`: Sliding-window per-IP rate limiter with automatic TTL pruning.
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
26. **Gemini Native Audio & Subterranean DSP (Zero Robotic Fallback)**: Voice synthesis uses Google Gemini Native Audio (`Enceladus` + 30 archetype voices via `/api/tts`; zero robotic `window.speechSynthesis` fallback), conditioned with a 10% Subterranean Reverb impulse response convolver and biquad ribbon filter for subterranean ambience.
27. **PowerShell Banker's Rounding vs Math.Floor**: In PowerShell scripts creating sprite atlases, `[int]($i / $tilesPerRow)` uses IEEE 754 banker's rounding to the nearest even integer, shifting row indices for odd quotients (e.g. $147/32 = 4.59375 \to 5$), whereas C# / JS truncate towards zero. Always use `[int][Math]::Floor($i / $tilesPerRow)` to guarantee 100% lore-accurate UV slot alignment.
28. **High-Density De-Fringing, 2D Drop Shadow Stripping & Sharpening**: Legacy Shockbolt tiles contain neutral-grey baked drop shadows ($A < 140$) and un-premultiplied dark fringes from transparent black canvas boundaries. Atlases must programmatically strip baked 2D shadows (replacing with real-time 3D contact shadows `contactShadowDisc`), un-premultiply alpha boundaries ($C' = C / \max(0.25, A/255)$), and apply contrast-adaptive cross-Laplacian detail sharpening. Three.js `alphaTest` set to `0.35` ensures clean edges without dark halos.
29. **4096×4096 HD Bilateral Normal Maps & Anisotropic Filtering**: High-fidelity normal-mapped creature/item atlases utilize 4096×4096 resolution with 16× anisotropic filtering, `LinearFilter`, and balanced normalScale (0.45, 0.45).
30. **Automated Master Lore Audit**: `tools/audit_atlas_models.js` provides continuous CI validation of 624 monsters, 498 items, 27 3D meshes, and 4096 HD dimensions with 100% pass rate.
31. **FrogComposBand 2-Screen Quick-Birth Review**: Intermediate submenu frames during quick birth must not send fallback `enter` keystrokes, which would prematurely trigger `RET) Begin Play` on Screen 2. Once Screen 2 appears, pause for review; `[🎲 Reroll Hero (R)]` steps back via `ESC`, resets randomize state, and re-triggers `@`.
32. **Hengband Death Telemetry Preservation**: Do not check `!p_ptr->is_dead` in `bridge_in_play()`. Omitting death frames prevents the client from displaying death causes, obituaries, and death tabs in the atmospheric modal.
33. **Hengband Door & Store Entrance Translation Precedence**: Always evaluate doors (`FEAT_DOOR_HEAD`..`FEAT_DOOR_TAIL`) and stores (`FEAT_SHOP_HEAD`..`FEAT_SHOP_TAIL`) before checking `FEAT_PERM` wall flags, preventing solid granite wall traps at shop entrances.
34. **Sil-Q Sunlight Lighting at 50ft (`BEST_PRACTICES` §35.1)**: Guard `feat 25` (`FEAT_SUNLIGHT`) under `realm === 'silq'`. Render it as warm sunlit flagstone floor (`_sunlightFloorColor = (1.30, 1.25, 0.90)`), skip ceiling creation over the tile, and attach a pooled warm golden `PointLight` + dust-mote particles (**never** instantiate a hollow `CylinderGeometry` `sunbeamMesh` pipe).
35. **Chamfered Wall Geometry & 45-Degree Diagonal Sightline Aperture**: Solid 1.0m boxes occlude the line of sight between diagonally adjacent floor tiles. All standard walls (`feats 15, 17, 18, 19, 20, 21, 22`) must be 45-degree chamfered octagonal prisms (`chamfer = 0.40m`, 84 vertices) providing a 0.57m aperture. Watertight floor quads at $(wx, -0.05, wz)$ and ceiling quads at $(wx, wallHeight + 0.05, wz)$ must be rendered under/over exposed wall blocks to prevent void leakage.
36. **Navigation Key Separation & Zero-Modifier Diagonal Movement**: Standalone `Home`, `PageUp`, `End`, `PageDown` must never be intercepted for camera tilt. Camera pitch is strictly bound to `Ctrl+PageUp`, `Ctrl+PageDown`, and `Ctrl+Home`. Standalone navigation keys are dedicated exclusively to 8-way diagonal movement with Shift-run support.
37. **Zero-Exposure Credential Enclave & Cloudflare Proxy CSP**: Master API keys reside exclusively in backend `.env`. `GET /api/config/llm` returns boolean capabilities only. CSP header must include `https://static.cloudflareinsights.com` in `script-src` and `connect-src https://cloudflareinsights.com` for Cloudflare proxy parity.
38. **Multi-Realm Container Build Isolation**: Cloud Run deployments must compile all 4 variant engines in the multi-stage Dockerfile and whitelist `variants/` in `.gcloudignore`. If a binary is missing, `resolveRealmEngine` defaults to `isFallback: true`.
39. **Rubble (`:`) vs Green Bush (`:`) Disambiguation (`FEAT_BUSH = 42`)**: Both rubble and bushes share ASCII glyph `:`. Always inspect the tile color attribute (green: 3, 5, 11, 13) or terrain tag before translating to Feat 42 (Bush) vs Feat 16 (Rubble), preventing dungeon talus heaps from rendering as bushes.
40. **Aquatic Immersion Offsets & Liquid Audio**: Water tiles apply dynamic camera immersion wading offsets (-0.08m shallow, -0.22m deep, -0.10m swamp) with buoyancy bobbing and procedural liquid footstep synthesis (low-frequency plunge displacement + resonant bubble spray + liquid slosh tail), respecting native engine drowning and speed mechanics.
41. **No Duplicate Class Methods (`L23`)**: Before adding or editing a method in any large class (`dungeon3d.js`, `app.js`, `hud.js`, `terminal.js`, `chronicle-*.js`), run `Select-String` across the file for the method name to prevent a second definition at the bottom of the class from silently shadowing the first.
42. **Verify Binary Save Formats Against C/C++ Source (`L24`)**: Only Vanilla Angband (`engine/src/savefile.c`) starts with 8-byte ASCII `SaveVNLA`. Sil-Q, FrogComposBand, and Hengband write 4-byte binary version headers (`sf_major, sf_minor, sf_patch, sf_extra`) and use `.realm.json` sidecar tracking on cloud upload.
43. **Zero Per-Frame DOM/GPU Reallocation (`L25`)**: Never rebuild `innerHTML`, resize `<canvas>`, or regenerate `THREE.CanvasTexture` / `InstancedMesh` / `MultiMesh` matrices on every frame when data is unchanged. Gate all per-frame updates on a state signature (`frame.seq`, `(px, py, depth, rowsHash)`). Never declare state-cache variables as local variables inside a per-frame function.
44. **Explicit Three.js / Godot / Web Audio Resource Disposal (`L26`)**: Every removed `THREE.Sprite`, `Mesh`, `CanvasTexture`, `BufferGeometry`, `Material`, or finished Web Audio `GainNode`/`StereoPannerNode` must be explicitly disposed/disconnected. Never include `${depth}` in `resolveContextualTheme` `theme.id` when procedural textures only depend on `(realm, chapter, sub)`.
45. **Cross-Bridge Schema Parity (`L27`)**: All 4 C/C++ bridges must emit `null` for `player` and `map` when `!bridge_in_play()`, `"hp_max"` on monsters, `{text, count, attr}` objects in `messages[]`, and structured `player.inventory[]` / `player.equipment[]`.
46. **State-Machine Auto-Reset on Mode Exit (`L28`)**: Multi-step client state machines (`MenuRouter.pending`, `birthReviewActive`) must auto-clear in `onFrame` whenever `classifier.mode` exits the expected mode AND when any Escape/Close UI button is clicked.
47. **3D Directional Targeting Routing (`L29`)**: When `isDirectionalTargeting` keeps a `"Direction?"` / `"Target:"` prompt in 3D view, arrow keys must send relative direction keys (without rotating camera yaw), and target-nearest (`5`/`.`/`t`/rosette-center) must send `'t'` (never literal `sendKey('5')` in `input.js`).
48. **Deterministic Pre-Warm & Cache-Key Symmetry (`L32`)**: Always unwrap `{ narrator: profile }` via `normalizeVocalOptions(options)` across `getAudioCacheKey`, `prewarmUtterance`, `fetchOrGetAudioBuffer`, and `playNeuralAudio`. Never use `Math.random()` inside pre-warmed encounter resolution (`resolveCreatureEncounter`).
49. **Server/Client Validation Parity (`L33`)**: `/api/tts` `tagRegex` must accept all bracketed `geminiTag` and `directorNote` strings emitted by `ChronicleGrounder`, and client fetchers must never retry `HTTP 4xx` errors.
50. **Speech Queue State Integrity (`L34`)**: `ChronicleAudio.speak()` must never set `this.isSpeaking = true` before `processSpeechQueue()` checks active playback, and `finally` blocks must always emit `'idle'` when speech ends or fails.
51. **Skinned-Mesh Inverse-Bind Fist Centroid & Synthetic Wrist Bones (`L37`)**: Attaching equipment at `(0,0,0)` on `hand_r`/`hand_l` places hilts at the wrist or forearm elbow on 3-bone fingerless rigs (`goblin.glb`, `orc.glb`, `kobold.glb`). Synthesize a child bone `RightHand_Synthetic`/`LeftHand_Synthetic` at the distal forearm axis for handless rigs. Compute palm grip offsets via knuckle vectors (`68%` toward knuckle) or GPU inverse-bind bounding boxes (`c.skeleton.boneInverses[bIdx] * c.bindMatrix`) weighted (`w >= 0.35`) to the hand bone (`58%` along palm axis). Scale equipment by `Math.clamp(charHeight / 1.75, 0.58, 1.35)` to prevent goblin weapons from canceling character scale.
52. **Corrupted Mixamo Clip Stripping & Static-Rig Rest Pose Immutability (`L38`)**: Mixamo clips with corrupted root/pelvis rotations (e.g. `guard.glb` 90° crouch) must be stripped (`content._animations = []`) at template load time to let `_poseRigNaturalStance` establish full stature (`1.82m`). Restrict per-frame `_applyCombatArmPose` and `_stabilizeHeldEquipment` strictly to animated rigs (`instRoot._mixer != null`); static rigs are posed once before `captureRestPoses` records their immutable `_restQuat`.
53. **First-Person Viewmodel FOV Frustum Rim Anchoring & Armored Gauntlet Grip (`L39`)**: In a 68° vertical FOV camera, anchor first-person viewmodel weapons below the lower-right viewport rim (`rightRestPos = (0.31, -0.30, -0.36)`) wrapped in a 3D armored gauntlet cuff (`iron_gauntlets.glb`) emerging from the bottom-right corner. Never render handheld light sources (torches/lanterns) in the left viewmodel hand; reserve the left hand strictly for equipped shields (`leftRestPos = (-0.30, -0.26, -0.38)`).
54. **CSS !important Override Trap on Dynamic Attribute Grids (`L40`)**: Never apply `display: flex !important` to `.stat-item` without explicit `#stat-item-gra[style*="display: none"] { display: none !important; }` protection. Overriding inline styles creates a 7th orphan grid cell in 6-stat realms (`angband`, `frogcomposband`, `hengband`), disrupting the 3×2 attribute grid (`STR, INT, WIS / DEX, CON, CHR`).
55. **Non-Vocal Physical Foley Combat Principle (`L41`)**: Never use humanoid/creature groan/retching/screaming recordings (`orc_hit`, `goblin_hit`, `troll_hit`, `zombie_hit`, `lich_hit`, `squishy_hit`, `wail`) or throat-formant synthesis during melee combat. Combat audio uses the 78-file open-source studio foley bank (`Kenney CC0` + `Battle for Wesnoth GPL-2.0+`) routed through `createDungeonReverbImpulse` stereo stone-hall convolution reverb. `.gitignore` must include `!server/public/assets/audio/sfx/*.wav` and `!client/assets/audio/sfx/*.wav`.
56. **Vertical Apothecary Medicine Vials & Tattered-Scroll / Charred-Wood UI (`L42`)**: Health and Mana/Voice vitals render as graduated vertical medicine vials (`28px × 78px` cylindrical glass tube + `.vial-neck-collar` corked brass neck + `apothecary_vial_overlay.svg` graduation ticks + side `.gauge-header` telemetry column). Structural HUD docks use `charred_wood.png` and lore/menu modals use `tattered_scroll.png`.
57. **Shared Singleton 3D VFX Geometries & Asset Bloat Hygiene (`L43`)**: All 3D action/spell VFX (`slash`, `crit_slash`, `blunt`, `pierce`, `breath`, `lightning`, `fireball`, `aura`, `spawnDetonationDome`, `spawnHitSparks`) must reuse pre-allocated `_shared*Geo` singletons in `_ensureSharedVfxResources()` (tagged `_sharedGeometry = true`), never allocating per-hit `SphereGeometry`. Keep `server/public/assets/` free of unreferenced media caches and allocate browser test profiles in `os.tmpdir()`.
58. **Bulletproof Android Release Signing Fallback (`L44`)**: In `android/app/build.gradle`, `buildTypes.release.signingConfig` must use `(signingConfigs.release.storeFile != null ? signingConfigs.release : signingConfigs.debug)` so `./gradlew assembleRelease` succeeds in CI even when custom keystore secrets are absent.

> **Master Architecture & Lessons Learned Guide**: For complete historical context, architectural rationale, and deep-dive explanations of all lessons learned across the project, consult [docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md](BEST_PRACTICES_AND_LESSONS_LEARNED.md).

## Token Efficiency & LLM Rate Limit Protocol
1. **Zero-Discovery Startup**: Consult `AGENTS.md`, `docs/STATE.md` rather than running exploratory searches.
2. **Windowed Reads**: Limit `view_file` to specific line ranges (30-100 lines max).
3. **Targeted Replacements**: Use `replace_file_content` with 3 lines of context.
4. **Check State**: Fast verify via `node tools/run_tests.js --tier fast`, `python tools/smoke_test.py` (0.5s), and `dotnet build client/angband3d.csproj` (1.3s).
5. **Session Continuity**: Record gate outputs and progress in `docs/STATE.md` before concluding.

---

<!-- AUTO-SYMBOL-INDEX-START -->
## Auto-Generated $O(1)$ Symbol Coordinate Index
| Symbol | Kind | File & Line Range (`StartLine..EndLine`) | Signature / Members |
| :--- | :--- | :--- | :--- |
| `SoundEngine` | `class` | `server/public/js/audio.js:9-69` | `class` |
| `ChronicleAudioRouter` | `class` | `server/public/js/chronicle/chronicle-audio.js:7-67` | `class` |
| `ChronicleFilter` | `class` | `server/public/js/chronicle/chronicle-filter.js:130-190` | `class` |
| `ChronicleGrounder` | `class` | `server/public/js/chronicle/chronicle-grounder.js:15-75` | `class` |
| `ChronicleLLMBridge` | `class` | `server/public/js/chronicle/chronicle-llm.js:33-93` | `class` |
| `ChronicleManager` | `class` | `server/public/js/chronicle/chronicle-manager.js:17-77` | `class` |
| `ChronicleStore` | `class` | `server/public/js/chronicle/chronicle-store.js:7-67` | `class` |
| `DemoPlayer` | `class` | `server/public/js/demo-player.js:29-89` | `class` |
| `DeviceProfile` | `class` | `server/public/js/device.js:7-67` | `class` |
| `Dungeon3D` | `class` | `server/public/js/dungeon3d.js:2071-2131` | `class` |
| `GamepadController` | `class` | `server/public/js/gamepad.js:59-119` | `class` |
| `GrimoireDeckController` | `class` | `server/public/js/grimoire-deck.js:97-157` | `class` |
| `WebHUD` | `class` | `server/public/js/hud.js:6-66` | `class` |
| `InputController` | `class` | `server/public/js/input.js:6-66` | `class` |
| `LocalSaveManager` | `class` | `server/public/js/local_bridge.js:8-68` | `class` |
| `LocalGameBridge` | `class` | `server/public/js/local_bridge.js:145-205` | `class` |
| `MobileOverlay` | `class` | `server/public/js/mobile-overlay.js:7-67` | `class` |
| `GameNetwork` | `class` | `server/public/js/network.js:60-120` | `class` |
| `QuickActionController` | `class` | `server/public/js/quick-actions.js:87-147` | `class` |
| `RadialMenu` | `class` | `server/public/js/radial-menu.js:115-175` | `class` |
| `WebTerminal` | `class` | `server/public/js/terminal.js:2-62` | `class` |
| `MockDungeon3D` | `class` | `tools/audit_variant_monsters.js:10-70` | `class` |
| `BridgeError` | `class` | `tools/bridge.py:19-20` | `class` |
| `Bridge` | `class` | `tools/bridge.py:23-240` | `methods: __init__, next_frame, seq, key, keys, set_map` |
| `get` | `function` | `server/public/js/action-catalog.js:156-216` | `function` |
| `keyFor` | `function` | `server/public/js/action-catalog.js:168-228` | `function` |
| `fromVanillaKey` | `function` | `server/public/js/action-catalog.js:175-235` | `function` |
| `listForRealm` | `function` | `server/public/js/action-catalog.js:206-266` | `function` |
| `shadowedByWasd` | `function` | `server/public/js/action-catalog.js:211-271` | `function` |
| `decodeVerbMask` | `function` | `server/public/js/action-catalog.js:220-280` | `function` |
| `validVerbsForItem` | `function` | `server/public/js/action-catalog.js:239-299` | `function` |
| `ingestBridgeCommands` | `function` | `server/public/js/action-catalog.js:307-350` | `function` |
| `isAvailable` | `function` | `server/public/js/action-catalog.js:328-350` | `function` |
| `showUpdateToast` | `function` | `server/public/js/app.js:17-77` | `function` |
| `openExternalUrl` | `function` | `server/public/js/app.js:69-129` | `function` |
| `loadHengLang` | `function` | `server/public/js/app.js:166-226` | `function` |
| `decodeHengbandText` | `function` | `server/public/js/app.js:395-455` | `function` |
| `stepQuickBirth` | `function` | `server/public/js/app.js:416-476` | `function` |
| `setupDraggableAndResizableWindows` | `function` | `server/public/js/app.js:1036-1096` | `function` |
| `startQueueTipRotation` | `function` | `server/public/js/app.js:1368-1428` | `function` |
| `stopQueueTipRotation` | `function` | `server/public/js/app.js:1384-1444` | `function` |
| `getAppState` | `function` | `server/public/js/app.js:1392-1452` | `function` |
| `hideModals` | `function` | `server/public/js/app.js:1396-1456` | `function` |
| `renderMenuBackdropDiorama` | `function` | `server/public/js/app.js:1409-1469` | `function` |
| `showSplash` | `function` | `server/public/js/app.js:1446-1506` | `function` |
| `showMainMenu` | `function` | `server/public/js/app.js:1456-1516` | `function` |
| `showLoadMenu` | `function` | `server/public/js/app.js:1473-1533` | `function` |
| `hideLoadMenu` | `function` | `server/public/js/app.js:1484-1544` | `function` |
| `fetchAndRenderSaves` | `function` | `server/public/js/app.js:1494-1554` | `function` |
| `renderSaveListUI` | `function` | `server/public/js/app.js:1522-1582` | `function` |
| `renderMainMenuSavesPanel` | `function` | `server/public/js/app.js:1603-1663` | `function` |
| `updateSaveSelectionUI` | `function` | `server/public/js/app.js:1637-1697` | `function` |
| `navigateLoadList` | `function` | `server/public/js/app.js:1649-1709` | `function` |
| `loadSelectedSave` | `function` | `server/public/js/app.js:1656-1716` | `function` |
| `triggerFileDownload` | `function` | `server/public/js/app.js:1669-1729` | `function` |
| `downloadSave` | `function` | `server/public/js/app.js:1697-1757` | `function` |
| `downloadSelectedSave` | `function` | `server/public/js/app.js:1722-1782` | `function` |
| `uploadSave` | `function` | `server/public/js/app.js:1726-1786` | `function` |
| `triggerSaveUpload` | `function` | `server/public/js/app.js:1788-1848` | `function` |
| `downloadCurrentSave` | `function` | `server/public/js/app.js:1793-1853` | `function` |
| `deleteSelectedSave` | `function` | `server/public/js/app.js:1847-1907` | `function` |
| `showPauseMenu` | `function` | `server/public/js/app.js:1886-1946` | `function` |
| `hidePauseMenu` | `function` | `server/public/js/app.js:1901-1961` | `function` |
| `resumeGame` | `function` | `server/public/js/app.js:1906-1966` | `function` |
| `saveGameNow` | `function` | `server/public/js/app.js:1912-1972` | `function` |
| `updatePauseMenuSelectionUI` | `function` | `server/public/js/app.js:1927-1987` | `function` |
| `navigatePauseMenu` | `function` | `server/public/js/app.js:1937-1997` | `function` |
| `selectPauseMenuItem` | `function` | `server/public/js/app.js:1943-2003` | `function` |
| `activatePauseMenuItem` | `function` | `server/public/js/app.js:1955-2015` | `function` |
| `showGuide` | `function` | `server/public/js/app.js:1962-2022` | `function` |
| `hideGuide` | `function` | `server/public/js/app.js:1972-2032` | `function` |
| `switchGuideTab` | `function` | `server/public/js/app.js:1986-2046` | `function` |
| `cycleGuideTab` | `function` | `server/public/js/app.js:2000-2060` | `function` |
| `updateMenuSelectionUI` | `function` | `server/public/js/app.js:2010-2070` | `function` |
| `navigateMenu` | `function` | `server/public/js/app.js:2020-2080` | `function` |
| `selectMenuItem` | `function` | `server/public/js/app.js:2026-2086` | `function` |
| `checkSaves` | `function` | `server/public/js/app.js:2033-2093` | `function` |
| `activateMenuItem` | `function` | `server/public/js/app.js:2072-2132` | `function` |
| `generateHeroName` | `function` | `server/public/js/app.js:2094-2154` | `function` |
| `snapshotClientSaveToIndexedDB` | `function` | `server/public/js/app.js:2132-2192` | `function` |
<!-- AUTO-SYMBOL-INDEX-END -->

# Changelog & Release Notes

All notable changes to `angband3d` are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.0.0] — 2026-10-01

### 👑 Production Major Release: Modern Windows Desktop Standalone, Multi-Platform Parity & ThunderbearStudios Organization Home
The landmark `v2.0.0` major release delivers full multi-platform parity across Windows, Android, Web, and Godot, completes the official migration to the **ThunderbearStudios** organization, introduces the high-performance native Windows Standalone Desktop application, and establishes 100% universal save game portability across all supported environments.

### Added & Enhanced
- **Official Organization Home (`ThunderbearStudios`)**:
  - Migrated the primary project repository, documentation, download endpoints, and issue tracker to [https://github.com/ThunderbearStudios/angband3d](https://github.com/ThunderbearStudios/angband3d).
  - Fully scrubbed all legacy personal handles, broken URLs, and local compiler paths across all client, engine, and server assets.
- **Modern Windows Standalone Desktop Host (`desktop/Angband3D.csproj`)**:
  - Engineered a native Windows executable (`Angband3D.exe`, ~154MB self-contained) powered by .NET 8 WinForms and Microsoft Edge WebView2.
  - Zero installation requirements or dependencies: embeds the complete WebGL 2.0 3D renderer and runs the Angband 4.2.6 C WebAssembly engine 100% offline with 0ms input latency.
  - Seamless borderless fullscreen toggle via `F11` / `Alt+Enter`, native window icon, dark fantasy window framing (`#030407`), and DevTools diagnostics (`F12`).
  - Secure virtual scheme mapping `https://angband3d.local` with isolated, persistent IndexedDB player saves stored in `%LOCALAPPDATA%\Angband3D\UserData`.
- **Full Platform Parity & Dual-Engine Architecture**:
  - Complete parity across Windows Desktop, Android APK, Web Browser, and Godot C# client.
  - Includes baked Contact Ambient Occlusion (AO), calm subterranean living torchlight (no dust motes or distracting strobing), dynamic procedural viewmodel weapon rigs (swords, whips, maces, staves), responsive glassmorphic HUD, real-time combat message window (`#message-feed-window`), Tolkien hero review cards, and five-tab legacy death screen.
- **100% Universal Save Game Portability (`SaveVNLA`)**:
  - Standardized authentic Angband binary save format across all engines and platforms.
  - Players can export their `.sav` binary from the web browser at any time and immediately resume play on the Windows standalone desktop application, Godot client, or Android APK with zero data loss or translation artifacts.
- **Community Server Capacity Advisory & Standalone Recommendation**:
  - Integrated humble server capacity notices on the web splash screen, main menu header, and download dialogs.
  - Transparently explains community server limits and provides immediate, one-click access to download standalone desktop and mobile apps for the optimal latency-free experience.
- **Technical Manifesto & Contributor Blueprint**:
  - Elevated `README.md` into an inspiring architectural manifesto detailing "Preservation Over Reimplementation"—how 35 years of authentic C game mechanics are preserved through zero-allocation decoupling rather than shallow rewrites.
  - Documented Section 14 in `BEST_PRACTICES_AND_LESSONS_LEARNED.md` with complete zero-turn contributor checklists and architectural invariants.
- **Live Cloud Production Deployment**:
  - Containerized headless C bridge engine and WebSocket relay deployed to Google Cloud Run (`angband3d-cloud-00089-psf`), serving 100% live traffic at `https://angband3d.com`.
  - Built-in automatic fallback redirects for `/download/Angband3D-Windows-x64.zip` and `/download/Angband3D-Android.apk` directly to GitHub Releases.

## [v1.2.0] — 2026-09-30

### ⚡ 100% Offline WebAssembly Engine, Standalone Android APK & Universal Save Portability
The `v1.2.0` release completes Route A: bringing the full upstream Angband 4.2.6 C engine directly into the browser and mobile devices via WebAssembly (Asyncify + IDBFS), creating a native standalone Android APK package, and enabling universal `.sav` save file portability across all platforms.

### Added & Enhanced
- **Angband 4.2.6 WebAssembly Engine (`angband.wasm`, `angband.js`, `angband.data`)**:
  - Compiled the complete upstream C engine with the JSON Bridge frontend into WebAssembly using Emscripten.
  - Emscripten Asyncify allows the engine to yield asynchronously to the JavaScript event loop when awaiting input, eliminating thread locking while keeping 100% authentic C game loop execution.
  - Excluded unneeded retro tiles and audio files from the preloaded package, shrinking the total gamedata footprint to just 1.5MB for instantaneous sub-100ms loading.
- **IndexedDB (`IDBFS`) Local Save Persistence**:
  - Mounted `/lib/save` directly to browser IndexedDB with `autoPersist: true`.
  - Save files are automatically flushed to persistent device storage whenever the game is saved, surviving browser restarts and page reloads.
- **Web Worker Background Execution (`engine-worker.js`)**:
  - Runs the WebAssembly runtime in a dedicated background Web Worker thread, ensuring the 60fps/120fps Three.js 3D render loop remains fluid with zero micro-stuttering.
- **Universal Save Portability (`LocalSaveManager`, `local_bridge.js`)**:
  - Universal binary compatibility: import and export identical `SaveVNLA` savefiles between Windows, Linux, Godot desktop client, Cloud Realm, and Android.
  - Integrated local save listing, download, upload, and deletion into the Load Game modal.
- **Standalone Native Android Package (`android/`)**:
  - Initialized Capacitor native Android project targeting Android 8.0+ (API 26–34).
  - Bundled WebAssembly engine and responsive 3D WebGL client directly into APK assets (`android/app/src/main/assets/public/`).
  - Immersive fullscreen gaming with dark theme (`#05070f`), custom application manifest, and hardware back button handling.
  - Automated release pipeline: GitHub Actions `release.yml` now compiles Wasm and builds `Angband3D-Android.apk` on every release.
- **Main Menu Dual-Engine Selector & APK Download Hub**:
  - Added an interactive pill toggle in the Main Menu to switch between `⚡ Local Engine (Offline / 0ms)` and `☁ Cloud Realm`.
  - Added direct `.apk` package download link to the PWA & Installation Modal.
  - Service worker `sw.js` upgraded to `v7.0` with full offline caching for Wasm binaries and worker scripts.

## [v1.1.4] — 2026-09-30

### 🧱 Realistic Dungeon Texturing, Calm Subterranean Torch Draft & Direct Mobile Get Action
The `v1.1.4` release addresses visual realism, lighting serenity, and mobile ergonomics: completely eliminating distracting screen dust motes, replacing rapid torch strobing with a gentle, immersive subterranean draft, breaking up repetitive wall and floor brick patterns via multi-aspect UV scaling, deterministic quarter-turn tile rotations, and per-stone mineral variegation, and bringing the `Get [g]` pickup command directly into the primary mobile touch action cluster with smart item detection.

### Fixed & Enhanced
- **Eliminated Dust Motes & Screen Smudges**:
  - Completely removed camera-bound dust particles and ember simulations, restoring a crystal-clear, distraction-free view into 3D dungeon depths.
- **Calm, Immersive Living Torch Draft**:
  - Replaced rapid, high-frequency torch flickering with a slow, soothing subterranean draft ($0.3\text{Hz}$ ambient breath with a subtle $\pm 2.2\%$ intensity variance).
  - Preserved a stable, warm lantern gold palette (`#ffd28e`) free of harsh chromatic strobing or distracting flashes.
- **Realistic Masonry Scaling, Rotation & Variegation**:
  - **Multi-Aspect Ratio UV Scaling**: Scaled wall textures to `repX=2, repY=3` ($1.4\text{m} \times 2.4\text{m}$ grid), rendering naturally proportioned square masonry blocks instead of stretched giant wallpaper, and floors/ceilings to `repX=2, repY=2` for crisp flagstone pavers.
  - **Deterministic Quarter-Turn Tile Rotations**: Applied deterministic $0^\circ, 90^\circ, 180^\circ, 270^\circ$ rotation hashes (`(x * 73 + y * 37) % 4`) to walls, floors, and ceilings across instanced geometry, completely breaking up identical mortar seams without altering dungeon collision or LOS bounds.
  - **Per-Tile Mineral Variegation**: Integrated stone luminance and mineral warmth modulation into `computeTileShade(..., x, y)` for natural instance-to-instance color variation.
  - **Deepened Grounding & Relief**: Extended Contact Ambient Occlusion gradient (bottom 28% darkens to 0.58) and increased normal map relief (`(1.35, 1.35)` walls, `(1.25, 1.25)` floors).
- **Direct Mobile & Tablet "Get" Action (`#btn-pickup`)**:
  - Moved `#btn-pickup` (`💎 Get [g]`) directly into the primary visible tactile thumb action cluster across phone portrait, phone landscape, and tablet viewports, eliminating the need to open the `⋯ More` drawer to collect loot.
  - Added `.smart-item-active` pulsing emerald highlight (`@keyframes smartPulseEmerald`) that lights up dynamically whenever the hero is standing on a tile containing items.
- **Cache Invalidation & Versioning**:
  - Bumped server status version to `1.1.4` and asset cache-busting queries to `v=6.8` across CSS, JavaScript, and Service Worker.

## [v1.1.3] — 2026-09-30

### 🎨 High-Impact, Performance-Neutral & Gameplay-Safe Graphics Upgrade
The `v1.1.3` release elevates the visual atmosphere and depth perception of Angband3D through baked Contact Ambient Occlusion (AO), living multi-frequency torchlight dynamics with thermodynamic temperature shifts and hand-held inertial sway, environmental adaptive perimeter vignetting, camera-bound subterranean atmospheric dust motes & volcanic embers, and organic surface breathing on in-view molten lava—while preserving 100% of upstream Angband 4.2.6 rules, zero light bleed across fog-of-war, and zero decorative noise.

### Added
- **Contact Ambient Occlusion (AO) Grounding**:
  - Implemented `applyWallVertexAO`, `applyFloorVertexAO`, and `applyCeilingVertexAO` in `dungeon3d.js`.
  - Darkens the bottom 22% and top 18% of walls where geometry meets floors and ceilings, and adds subtle edge contact shadows to floors.
  - Enabled `vertexColors: true` on dungeon materials, multiplying contact shadows directly into existing PBR textures with **0 additional draw calls**.
  - Merged geometries (`doorFrameGeo`, `shopFrameGeo`, `rubbleGeo`, `stairsGeo`) supply neutral `color` attributes, ensuring full shader safety.
- **Living Torch Dynamics & Inertial Hand-Held Sway**:
  - Upgraded torchlight from static illumination to an organic multi-frequency flame equation (12-15Hz micro-jitter + 0.5-1Hz draft breathing).
  - Smooth thermodynamic color temperature modulation between ember amber (`#ffaa55`) during dips and bright lantern gold (`#ffdc99`) during swells.
  - Inertial sway: torch position lags behind camera turns and walking step bob, simulating a hand-held torch rather than a static headlamp.
  - Light reach is strictly bounded by the Angband engine's `torchRadius`.
- **Atmospheric Subterranean Dust Motes & Embers**:
  - Camera-bound particle volume (`THREE.Points`) containing 54 particles on desktop and 24 particles on mobile phones.
  - Gentle Brownian drift in camera local space, wrapping smoothly within a 4.5m x 2.8m x 4.5m view volume.
  - Contextual color and density: warm candlelit dust in dungeons, volcanic crimson embers in Hellish Magma depths, bioluminescent spores in Overgrown Catacombs, and faint air motes in Town.
  - Fully depth-tested with additive blending, non-clickable, and visually distinct from ground item pickups.
- **Environmental Adaptive Vignette (`#dungeon-vignette`)**:
  - Zero-cost CSS vignette placed on a separate layer (`z-index: 2`) behind all HUD and terminal overlays.
  - Automatically adapts: 0% in daylight Town, 18% in lit rooms, 34% in dark corridors, and triggers `@keyframes vignette-danger-pulse` when player HP drops below 20%.
- **Breathing In-View Molten Lava**:
  - Applied smooth 0.5Hz emissive intensity breath (1.9 to 2.5) strictly to in-view molten lava tiles, while unrevealed or memorized fog-of-war lava remains pitch-black cooled basalt (`lavaCooledMaterial`).
- **Centralized Configuration & Instant Reversibility**:
  - All visual enhancements are gated under `window.GRAPHICS_CONFIG` with hot-toggle helper `window.setGraphicsPreset('classic' | 'enhanced')`.
  - Bumped server status version to `1.1.3` and asset cache-busting queries to `v=6.7`.

## [v1.1.2] — 2026-09-30

### ⏳ Cloud Realm Traffic Queue System & Minimap Drag vs. Resize Decoupling
The `v1.1.2` release adds a dedicated player capacity queue system with real-time FIFO position telemetry, keep-alive proxy heartbeats, rotating tactical lore tips, and automated admission into active gameplay, and resolves a window interaction bug where dragging the minimap accidentally resized it.

### Added
- **Cloud Realm Player Capacity Queue System (`#queue-modal`)**:
  - Replaced hard capacity disconnects with a real-time FIFO queue (`waitingQueue` in `server/src/server.js`).
  - Themed glassmorphic modal (`#queue-modal`): *"The Gates of Angband Are Full"* with glowing embers spinner, dynamic position badge (`#1 of 2 waiting`), and active player capacity readout (`50 / 50 Max`).
  - Real-time server telemetry frames (`{ t: 'queue', status: 'waiting', position, totalInQueue, maxCapacity, activeCount }`) pushed instantly upon enqueue and promoted automatically as active adventurers disconnect or save.
  - Active keep-alive heartbeat (5-second intervals) preventing Cloudflare proxy or Cloud Run idle connection terminations while waiting in line.
  - Rotating tactical lore & strategy tips cycling every 7 seconds (Corridor Funneling, Speed Multiplication, Emergency Escapes, Darkness & Torches, Stair Resets, and Zero-Turn Camera Navigation).
  - Seamless auto-launch transition: automatically closes queue modal, spawns isolated C engine process, and launches the player into the 3D world with sound effect cue upon admission.
  - 1-click / 1-tap "Leave Queue" button to cleanly cancel waiting and return to the main menu without orphan connections.
  - Public REST status telemetry endpoint `/api/status` exposing `activeSessions`, `maxCapacity`, `waitingQueue`, and `version`.

### Fixed
- **Minimap Drag vs. Resize Conflict Resolution**:
  - Removed accidental `click` event listener on `#minimap-header` in `hud.js` that previously triggered `cycleMinimapSize(1)` whenever the header was clicked or released during drag operations.
  - Updated window drag controller in `app.js` to strictly freeze window dimensions (`fixedW`, `fixedH`) upon `mousedown`/`touchstart`, guaranteeing dragging only modifies position coordinates (`left`, `top`) and never alters width or height.
  - Added full mobile touch drag support to window headers.
  - Corrected cursor states across `dungeon.css`: header uses `cursor: grab` and `:active { cursor: grabbing }`.
  - Resizing is strictly reserved for `[` / `]` hotkeys, the dedicated `#btn-map-toggle-size` button, or dragging the bottom-right corner grip (`#map-resize-handle`).
  - Bumped asset cache-busting queries to `v=6.6`.

---

## [v1.1.1] — 2026-09-30

### 🛡️ Legal Protection, Asset Provenance, Server Resource Bounds & Cloud Compute Cap
The `v1.1.1` release establishes complete legal notices and trademark safe-harbor protections, comprehensive CC0 asset and typography provenance documentation, server-side idle session reaping, and strict Cloud Run compute bounds to guarantee cost containment and server resilience under public release.

### Added
- **Legal & Trademark Protection (`LEGAL.md`)**:
  - Formal Middle-earth Enterprises, LLC and The Tolkien Estate trademark disclaimer and non-commercial fan tribute disclosure.
  - Strict zero-monetization policy: 100% free of charge, zero advertisements, zero microtransactions, no paywalls, and zero donations or commercial monetization.
  - GNU General Public License v2 (GPL-2.0) terms, upstream maintainer credits (Koeneke, Wilson, Harrison, and the Angband development team), and public source availability.
  - Dedicated in-game Adventurer's Guide Tab 6 (`7. 📜 Credits & Legal`) in `index.html` displaying legal and trademark notices directly inside the game.
  - Prominent Legal and Trademarks section added to `README.md`.
- **Comprehensive Asset Provenance & Attribution (`CREDITS.md`)**:
  - Detailed catalog of all CC0 3D models and textures (KayKit Dungeon Remastered, Characters, Skeletons, Halloween, and City Builder packs by Kay Lousberg, Quaternius, Kenney).
  - Open-source typography attribution for Cinzel, Outfit, and Fira Code under SIL Open Font License 1.1.
  - Full documentation of the 100% procedural mathematical Web Audio API and C# dynamic PCM acoustic synthesis engines.
- **Server Concurrency Limits & Idle Session Reaper (`server/src/server.js`)**:
  - 20-minute idle session timeout: automatically commits clean `save\n`, terminates child `angband` engine process, and closes the WebSocket for abandoned browser tabs to release container RAM and CPU.
  - Reconnection safety: client recognizes idle timeouts, prevents automatic reconnect loops, and provides a 1-click / 1-key banner to instantly reload and resume saved gameplay.
  - Per-container session cap (`MAX_CONCURRENT_GAMES = 50`) to guarantee memory stability within 512MiB bounds.
- **Cloud Run Compute & Billing Cap (Risk 1)**:
  - Capped maximum Cloud Run container instances from 20 down to 2 (`--max-instances 2`), strictly bounding potential monthly compute expenditure.
  - Scale-to-zero verified: scales down to 0 instances when no active players are connected, costing $0.00.
  - Bumped Service Worker cache to `angband3d-v6.5` and stylesheet/script queries to `v=6.5`.

---

## [v1.1.0] — 2026-09-30

### 📱 Mobile Touch Architecture Overhaul, Classic Menus & Cloud WebGL Edition
The `v1.1.0` release introduces a first-class mobile and tablet web experience, complete gesture-safe touch controls, interactive classic menu navigation, PWA offline asset caching, and zero-disruption Google Cloud Run deployment.

### Added
- **Mobile & Tablet Touch Controls**:
  - Full tactile 8-way directional D-pad with 3D camera forward indicators.
  - Contextual Letter Ribbon for direct 1-tap item, spell, and choice selection.
  - Touch-action bar drawer with quick buttons for Attack, Cast, Throw, Fire, Quaff, Read, Rest, Doors, Inventory, and Equipment.
  - Integrated PWA support with standalone full-screen home screen installation and Service Worker asset caching (`angband3d-v6.4`).
- **Decoupled Touch & Click Suppression Architecture**:
  - Displacement tracking across `touchstart` and `touchmove`: dragging $>10\text{px}$ cancels activation, enabling silky smooth ribbon and menu scrolling without accidental triggers.
  - Strict synthetic click suppression window ($<500\text{ms}$ after `touchend`) to permanently eliminate double-actions and duplicate keystrokes across iOS Safari and Android Chrome.
  - Independent action debounce timers (`lastActionTime`) decoupled from click suppression timestamps (`lastTouchEndTime`).
- **Classic Menu & Prompt Overhaul**:
  - Permanent 8-way D-Pad retention in character creation birth wizard (Race, Class) and item prompts (Inventory, Equipment, Quiver, Spells) for highlight navigation and Enter confirmation.
  - Universal tactile `[y/n]` prompt shortcuts (`[y] ✓ Yes`, `[n] ✕ No`, `[Esc] ⎋ Cancel`).
  - Tactile Quantity prompt pickers (`[⏎] All (Default)`, `[1] Just 1`, `[5] 5`, `[Esc] ⎋ Cancel`).
  - Store sub-state isolation and item context action menus (`Buy All`, `Buy One`, `Examine`, `Cancel`).
  - CSS `touch-action: pan-x` on letter ribbons for native horizontal touch scrolling.
- **Sensed & Invisible 3D Creature Visualization**:
  - Sensed and invisible monsters in dark or out-of-LOS areas rendered as ethereal, foggy glowing volumetric auras with `👁 SENSED` billboard badges.
- **Save Management & Audio Controls**:
  - In-browser save download and drag-and-drop save upload compatible with native desktop `SaveVNLA` binary format.
  - Master volume slider and instant mute toggle in HUD header and pause modal.

---

## [v1.0.0] — 2026-09-14

### 🌟 Comprehensive Release & Dark Fantasy Visual Overhaul
The `v1.0.0` milestone transforms Angband3D into a full-featured, standalone first-person dark fantasy dungeon crawler running atop a 100% faithful, unmodified Angband 4.2.6 engine core.

### Added
- **Dynamic Character Height & Racial Scale**:
  - Character race and rolled physical height (`ht`) dynamically modulate camera eye height ($0.70\text{m} - 2.35\text{m}$), field-of-view perspective ($82^\circ - 86^\circ$), and acoustic footstep pitch.
  - Viewmodel hand scale, forearm reach, and weapon proportions scale proportionally to player race.
- **First-Person Viewmodel & Articulated Hand Rigs**:
  - Sculpted 3D player arms featuring tapered cloth sleeves, metallic wrist bracers, articulated palms, opposable thumbs, and four-finger grips.
  - Race-tailored skin tones and class-tailored sleeve fabric shaders.
  - Real-time weapon and shield matching for 1H/2H swords, daggers, battleaxes, polearms, bows, crossbows, wands, staves, spellbooks, torches, or martial bare fists.
  - Natural walk bobbing, inertia yaw/pitch sway, attack slash/thrust kinematics, spellcast surges, and hit recoil.
- **Procedural 3D Creature Tokens & Living Bestiary**:
  - Hundreds of non-humanoid monsters (dragons, hydras, giant spiders, centipedes, beholders, slimes, basilisks, demons, elementals, kobolds, imps, yeeks, yetis) feature procedural anatomical 3D models with undulating segments, skittering legs, flapping wings, glowing irises, and pulsating nuclei.
  - Fallback rigging system to prevent static T-pose artifacts on unrigged humanoid meshes.
  - Humanoid equipment matching (guards hold swords/shields, archers hold crossbows, mages hold glowing staves).
  - Depth-tested nameplates, status badges (`💤 Sleep`, `⚠ Fleeing`, `🌀 Confused`), and target reticles (`[ ⌖ TARGET ⌖ ]`) with line-of-sight gating.
- **Procedural PBR Materials & 6 Subterranean Depth Biomes**:
  - Multi-octave PBR limestone masonry, flagstone floors, cavern ceilings, and glowing magma/crystal veins with calibrated roughness and normal maps.
  - 6 distinct depth zones: Town (0), Upper Crypts (1-15), Overgrown Catacombs (16-35), Crystal Caverns (36-60), Magma Underworld (61-85), and Abyssal Throne (86-100+).
  - Dynamic `WorldEnvironment` with biome-specific volumetric fog, ambient lighting, and environmental particles (dust motes, glowing spores, crystal shimmers, volcanic embers).
  - Solid boundary rock synthesis and wall-neighbor lighting inheritance to eliminate void gaps.
- **Atmospheric Death Experience & Full Post-Mortem Revelation**:
  - Solemn funeral toll audio bells (`PlayerDeath` SFX) and dedicated memorial UI.
  - Full rune and property identification unmasking across Equipment, Backpack Inventory, and Quiver Missiles upon death.
  - Integrated high score recording and one-click quick restart/re-roll actions.
- **Zero-Latency Positional 3D Audio Engine**:
  - Pure procedural 16-bit PCM sound synthesis for spatialized footsteps, weapon impacts, spell zaps, door creaks, funeral death tolls, and staircase transitions.
  - Pre-allocated zero-allocation sound pools.
- **Decoupled Dual-Mode Minimap**:
  - Independent physical HUD window scaling (`Ctrl+PgUp/PgDn` or `[`/`]`) and grid zoom radius (`PgUp/PgDn` or `+`/`-`).
  - Full-screen 2D tactical map overlay (`Shift-M`).
- **Standalone Distribution & Packaging Pipeline**:
  - Automated `package.ps1` script creating clean, self-contained Windows bundles (`Angband3D-Windows-x64.zip`) containing standalone `Angband3D.exe`, `.pck` gamedata, engine binaries, and launcher scripts with zero Godot installation requirement.

### Changed
- Refactored `BridgeClient.cs` to utilize non-blocking async IO streams with robust backpressure handling.
- Optimized multi-mesh batching to render up to 12,000 dungeon tiles in $\le 10$ draw calls.
- Improved directional numpad controls to always align with the camera's current cardinal facing.

---

## [v0.3.0] — 2026-08-28

### Added
- Standalone `Angband3D.exe` export support via Godot headless packaging toolchain.
- `package.cmd` one-click packaging utility for Windows.
- Runtime path discovery for embedded gamedata libraries (`lib/save/`, `lib/scores/`, `lib/user/`).

### Fixed
- Fixed process exit hang when closing the client while engine process is active.
- Fixed terminal overlay focus clipping on wide aspect ratio monitors.

---

## [v0.2.0] — 2026-08-15

### Added
- Automated GitHub Releases workflow in `.github/workflows/release.yml`.
- Reusable packaging scripts and automated MSYS2 MinGW-w64 toolchain bootstrapping (`tools/bootstrap.ps1`).
- Dynamic 3D item pickup models with continuous floating rotation and emissive color accents.
- Screen shake / trauma feedback on physical melee hits.

### Changed
- Standardized documentation structure (`ARCHITECTURE.md`, `PROTOCOL.md`, `CONTRIBUTING.md`).
- Extended smoke test suite with 11 automated acceptance test cases.

---

## [v0.1.0] — 2026-07-20

### Added
- Initial working prototype of `angband3d`.
- High-performance C JSON bridge frontend in `engine/src/main-bridge.c` communicating over stdio.
- Godot 4 (.NET C#) 3D frontend with first-person perspective, multi-mesh wall rendering, and dynamic torchlight.
- Seamless 80x24 terminal overlay for text menus, stores, prompts, and character birth.
- 100% binary savefile compatibility with upstream Angband 4.2.6.

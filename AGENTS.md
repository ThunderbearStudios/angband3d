# AGENTS.md — Master Operating Manual & Entry Point for `angband3d`

> **READ THIS FIRST (Turn 0)**: Whether you are a human engineer, a Principal Architect LLM, or a fast execution model (such as `Gemini 3.8 Flash`), this file is your single authoritative compass. Follow the exact orientation sequence and guardrails below on every turn.

---

## 1. Zero-Turn Orientation Protocol ("Where Do I Start?")

Never run exploratory recursive searches (`**/*`, `find .`, `Get-ChildItem -Recurse`) or dump full multi-thousand-line files into context. Instead, follow this exact 60-second boot sequence:

1. **Check Git & Active Task (`10s`)**:
   - Run `git status -s` to check branch (`fix/award-pass`) and uncommitted files.
   - Read [`docs/STATE.md`](docs/STATE.md) (lines 1–65) to see the current active workstream/card and last gate output.
2. **Read the Active Execution Spec (`20s`)**:
   - Read [`docs/plan/EXECUTOR_START_HERE.md`](docs/plan/EXECUTOR_START_HERE.md) for the golden rules and workflow.
   - For the **Award-Pass v2 Deep Audit & Turnkey Execution Cards**, read [`docs/plan/master_audit_and_execution_plan.md`](docs/plan/master_audit_and_execution_plan.md) (**Part VI: Gemini 3.8 Flash Turnkey Execution Runbook**, Cards `1` → `2A..2D` → `3A..3B` → `4` → `5`).
3. **Consult Architecture & Deep Post-Mortems Only as Needed (`15s`)**:
   - File paths, coordinate rules & registries → [`docs/LLM_CONTEXT.md`](docs/LLM_CONTEXT.md)
   - JSON wire schema, WebSocket & REST contracts → [`docs/PROTOCOL.md`](docs/PROTOCOL.md)
   - Historical post-mortems & architectural rationale → [`docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`](docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md)
   - Generic high-agency engineering & bootstrap skill → [`thunderbear-agentic-mastery/SKILL.md`](thunderbear-agentic-mastery/SKILL.md)
4. **Verify Baseline Health (`15s`)**:
   - Fast JS/Contract Gate: `node tools/run_tests.js --tier fast`
   - Native C Bridge Gate: `python tools/smoke_test.py` (11/11)
   - Godot C# Build Gate: `dotnet build client/angband3d.csproj`

---

## 2. Complete Multi-Realm & Multi-Client Key File Map

`angband3d` runs **4 authoritative C/C++ roguelike engines** (`Vanilla Angband 4.2.6`, `Sil-Q`, `FrogComposBand`, `Hengband`) communicating via line-delimited JSON over stdio/WebSockets with **Web (Three.js + CRT Canvas + Living Chronicle)**, **Offline WASM**, **Desktop WebView2**, **Android Capacitor APK**, and **Godot 4 C#**.

| Subsystem | File Path | Role & Ownership |
|---|---|---|
| **Vanilla C Bridge** | `engine/src/main-bridge.c`, `bridge-json.c/.h` | Vanilla Angband 4.2.6 JSON state emitter & stdin key dispatcher |
| **Sil-Q C Bridge** | `variants/silq-src/src/main-bridge.c` | Sil-Q (First Age Beleriand) JSON bridge (`silq/bin/silq.exe`) |
| **FCB C Bridge** | `variants/frogcomposband-src/src/main-bridge.c` | FrogComposBand (Chaos/Wilderness) JSON bridge (`frogcomposband/bin/frogcomposband.exe`) |
| **Hengband C++ Bridge** | `variants/hengband-src/src/main-bridge.cpp` | Hengband (JP/EN Eastern/Chaos) JSON bridge (`hengband/bin/hengband.exe`) |
| **Cloud Relay & AI Proxy** | `server/src/server.js`, `http-guard.js`, `rate-limit.js` | WebSocket engine multiplexer, save ownership, `/api/llm/generate`, `/api/tts` |
| **Web Coordinator** | `server/public/js/app.js` | View routing (`needsTerminal`), toolbars, save UI, Command Palette (`Ctrl+K`) |
| **Web Input & Keys** | `server/public/js/input.js`, `realm-keys.js` | 3D/Terminal keyboard & touch dispatch, canonical per-realm keymap table |
| **Screen & Menu Router** | `server/public/js/screen-context.js`, `menu-router.js` | Pure UMD screen classifier (`classify(frame)`) & 2-step Action Chooser state machine |
| **Hengband Translator** | `server/public/js/heng/heng-translate.js`, `heng-dict.js` | Atomic line-level JP→EN translator & lazy-loaded upstream dictionary |
| **Web 3D Renderer** | `server/public/js/dungeon3d.js` | Three.js procedural dungeon, PBR themes, Shockbolt billboards, 3D rigs, VFX |
| **Web HUD & CRT Term** | `server/public/js/hud.js`, `terminal.js`, `mobile-overlay.js` | 2D HUD, minimap, message feed, 80×24 CRT canvas, Hero Birth Review card |
| **Web Audio & SW** | `server/public/js/audio.js`, `server/public/sw.js` | Procedural Web Audio SFX synthesizer (`DynamicsCompressorNode`) & PWA cache |
| **Living Chronicle** | `server/public/js/chronicle/chronicle-*.js` | `chronicle-manager.js`, `chronicle-audio.js`, `chronicle-llm.js`, `chronicle-grounder.js`, `chronicle-filter.js` |
| **Offline WASM Bridge** | `server/public/js/local_bridge.js`, `engine-worker.js` | Browser-local Emscripten WASM worker & IndexedDB (`IDBFS`) save manager |
| **Godot 4 C# Client** | `client/scripts/Main.cs`, `DungeonWorld.cs`, `Overlay.cs`, `ViewModel.cs`, `MonsterModelResolver.cs`, `ItemModelResolver.cs`, `AudioManager.cs`, `BridgeClient.cs`, `WebSocketBridgeClient.cs`, `RealmKeys.cs` | Native desktop Godot 4.7.2 C# 3D client |
| **Desktop & Android** | `desktop/MainForm.cs`, `android/app/build.gradle` | Windows `.NET 8` WebView2 standalone wrapper & Android SDK 34 Capacitor project |
| **Test Suite & Gates** | `tools/run_tests.js`, `tools/test_manifest.json`, `tools/smoke_test.py` | Tiered verification runner (`fast`, `e2e`, `cdp`) & C bridge smoke test |

---

## 3. Non-Negotiable Architectural & Code-Quality Rules (`L1–L34`)

### A. Engine & Protocol Integrity
1. **Engine Rebasability (`L4`, `L17`, `L27`)**:
   - Never alter game mechanics or RNG in `engine/` or `variants/*-src/`. Keep changes strictly inside `main-bridge.c/.cpp` and `bridge-json.c/.h`.
   - Never call `slot_by_name()` on optional equipment slots (crashes on assert); use `bridge_get_equipped_by_type(player, EQUIP_*)`.
   - Always guard coordinate/grid reads with `bridge_in_play()` (check `if (!bridge_in_play())` **before** dereferencing `p_ptr` or `cave`).
   - After modifying `engine/src/`, re-export the patch using `--output=` (never `>` which writes UTF-16 on Windows):
     ```powershell
     git -C engine diff 4.2.6..HEAD --output=..\engine-patch\0001-bridge-frontend.patch
     ```
2. **Input & View Routing Protocol (`L2`, `L3`, `L4`, `L16`, `L28`, `L29`)**:
   - **Never send raw digits for movement or hold (`L2`)**: Digits (`0`–`9`) are repeat counts in Angband. Use arrow keys (`up`/`down`/`left`/`right`) for cardinal movement and `,` (`RealmKeys.get('hold', realm)`) for Hold. **Never bind WASD to movement.**
   - **View Routing (`NeedsTerminal`) (`L16`)**:
     - `phase != "play"` or `ui.overlay > 0` or (`!awaiting_command && !more`) → **Terminal View** (except active 3D directional targeting prompts kept in 3D).
     - `more == true` (`-more-` prompt during `play` with `overlay == 0`) → **Stay in 3D View**, show HUD `-more-` banner (never auto-dismiss `-more-` without user input).
   - **3D Directional Targeting (`L29`)**: When `isDirectionalTargeting` keeps a `"Direction?"` / `"Target:"` prompt in 3D view, arrow keys must send relative direction keys (not rotate camera yaw), and target-nearest (`5`/`.`/`t`/center) must send `'t'`.
   - **State-Machine Self-Healing (`L28`)**: Multi-step UI state (`MenuRouter.pending`, `birthReviewActive`) must auto-clear in `onFrame` whenever `classifier.mode` exits the expected mode AND when any Escape/Close button is clicked.

### B. Zero-Lag Performance & Resource Disposal
3. **No Duplicate Class Methods (`L23`)**:
   - Before adding or editing a method in any large class (`dungeon3d.js`, `app.js`, `hud.js`, `terminal.js`, `chronicle-*.js`), run `Select-String -Path <file> -Pattern "<methodName>"` to ensure a later duplicate method does not silently shadow an earlier one.
4. **Zero Per-Frame DOM/GPU Reallocation (`L5`, `L25`)**:
   - Never rebuild `innerHTML`, resize `<canvas>`, or regenerate `THREE.CanvasTexture` / `InstancedMesh` / `MultiMesh` matrices on every frame when data is unchanged. Gate all per-frame updates on a state signature (`frame.seq`, `(px, py, depth, rowsHash)`). Never declare state-cache variables as local variables inside a per-frame function.
5. **Explicit GPU & Audio Disposal (`L26`)**:
   - Every removed `THREE.Sprite`, `Mesh`, `CanvasTexture`, `BufferGeometry`, `Material`, or finished Web Audio `GainNode`/`StereoPannerNode` must be explicitly disposed/disconnected. Cap dynamic texture/audio caches with an LRU eviction policy.

### C. Security, Persistence & Living Chronicle Voice
6. **HTML Escaping & Secret Isolation (`L8`, `L10`, `L11`, `L24`)**:
   - Wrap all dynamic strings rendered via `innerHTML` in `escapeHtml()` (or use `textContent`).
   - Never expose API keys in client responses, logs, or URL query strings (`?key=`).
   - Verify binary savefile formats against C source (`SaveVNLA` for Vanilla; 4-byte version header + `.realm.json` sidecar for Sil-Q/FCB/Hengband).
7. **Zero-Latency Living Chronicle (`L31`, `L32`, `L33`, `L34`)**:
   - **Deterministic Pre-Warm & Cache-Key Symmetry (`L32`)**: Always unwrap `{ narrator: profile }` via `normalizeVocalOptions(options)` across `getAudioCacheKey`, `prewarmUtterance`, `fetchOrGetAudioBuffer`, and `playNeuralAudio`. Never use `Math.random()` inside pre-warmed encounter resolution.
   - **Server/Client Validation Parity (`L33`)**: `/api/tts` `tagRegex` must accept all bracketed `geminiTag` and `directorNote` strings emitted by `ChronicleGrounder`, and client fetchers must never retry `HTTP 4xx` errors.
   - **Speech Queue State Integrity (`L34`)**: Never set `this.isSpeaking = true` before `processSpeechQueue()` checks active playback, and always emit `'idle'` in `finally` blocks when speech finishes or fails.

---

## 4. The 8 Golden Anti-Trap Guardrails (Existing Test Contracts)

Before editing code, remember these **8 pinned test contracts** in `tools/`:
1. **DO NOT edit `server/public/js/realm-keys.js`**: `tools/test_realm_keys.js:116` pins `RealmKeys.fromVanilla('r', 'silq') === null` and `tools/fixtures/realm_keys/angband.json` pins `"use": "U"`. Handle Sil-Q native `'r'`/`'b'` passthrough inside `server/public/js/input.js:1283-1291`.
2. **NEVER write literal `sendKey('5')` or `sendKey("5")` in `server/public/js/input.js`**: `tools/test_realm_keys.js:174` fails if `/sendKey\(['"]5['"]\)/` matches anywhere in `input.js`. Use `this.network.sendKey('t')` for target-nearest in 3D targeting.
3. **DO NOT alter `ChronicleGrounder.getLorekeeperVoice` realm voice names**: `tools/test_realm_chronicles_and_inspection.js:47-59` and `tools/test_chronicle_llm_realm_voices.js:43-59` pin `angband='Enceladus'/'Zephyr'`, `silq='Charon'/'Despina'`, `frogcomposband='Fenrir'/'Kore'`, `hengband='Gacrux'/'Sulafat'`. Fix `chronicle-audio.js:121` (`hengband: 'Gacrux'`) instead.
4. **DO NOT alter `MenuRouter.chooseVerb` key count for Vanilla `angband`**: `tools/test_menu_router.js:198-200` pins `sentKeys = ['w']` (`length === 1`).
5. **Update `snapshot.json` After Editing `screen-context.js`**: `tools/test_screen_context.js` checks `SC.KEYS` and `tools/fixtures/menus/snapshot.json`. Run `node tools/test_screen_context.js --update && node tools/test_screen_context.js` after any classifier change.
6. **Preserve `translateName(label` in `server/public/js/app.js`**: `tools/test_heng_wiring.js:93-96` asserts `appSrc.includes('translateName(label')`.
7. **Preserve Top-Bar & Message-Feed Static Selectors**: `tools/test_top_bar_consolidation.js` and `tools/test_hud_message_pass.js` assert exact button IDs inside `#top-right-bar` (`index.html`) and exact height/opacity rules on `#message-feed-window` (`106px`, `0.35`, `320px`) and `.top-message-banner { cursor: pointer; }` (`dungeon.css`).
8. **Bump Version & Sync Android After Any `server/public/` Change (`L7`, `L12`)**: Run `node tools/bump_version.js` and `npm run android:sync` before final sign-off so `check_version_sync.js` and `check_android_sync.js` pass.

---

## 5. Build, Test & Verification Reference

- **Fast Contract & Static Gate (`< 10s`, run after EVERY edit)**:
  ```powershell
  node tools/run_tests.js --tier fast
  ```
- **Build All 4 C/C++ Engines (MSYS2 MinGW64)**:
  ```powershell
  $env:MSYSTEM='MINGW64'; $env:CHERE_INVOKING='1'
  & C:\msys64\usr\bin\bash.exe -lc "cd /c/Dev/angband3d/engine && cmake --build build"
  & C:\msys64\usr\bin\bash.exe -lc "cd /c/Dev/angband3d/variants/silq-src && cmake --build build && cp build/silq.exe ../silq/bin/silq.exe"
  & C:\msys64\usr\bin\bash.exe -lc "cd /c/Dev/angband3d/variants/frogcomposband-src && cmake --build build && cp build/frogcomposband.exe ../frogcomposband/bin/frogcomposband.exe"
  & C:\msys64\usr\bin\bash.exe -lc "cd /c/Dev/angband3d/variants/hengband-src && cmake --build build && cp build/hengband.exe ../hengband/bin/hengband.exe"
  ```
- **Smoke Test C Bridge (`11/11`)**: `python tools/smoke_test.py`
- **Build Godot C# & Desktop Wrapper (`0 warnings / 0 errors`)**:
  ```powershell
  dotnet build client/angband3d.csproj
  dotnet build desktop/Angband3D.csproj
  ```
- **E2E & Real-Browser Chrome CDP Gates (requires fresh server on port 8080)**:
  ```powershell
  node tools/run_tests.js --tier e2e
  node tools/run_tests.js --tier cdp
  ```
- **Version Bump & Android Asset Sync**:
  ```powershell
  node tools/bump_version.js
  npm run android:sync
  ```

---

## 6. Argon Token-Frugal Execution & Real-Asset Mandate (`L35–L36`)

1. **Zero Token Waste (`L35` — Argon High-Efficiency Protocol)**:
   - **Never Stream Large Code Edits from Parent Argon Context (`Flash Subagent Delegation Mandate`)**: For any edit > 40 lines or any mutation to a large file (`dungeon3d.js`, `app.js`, `server.js`, `hud.js`, `chronicle-*.js`, `DungeonWorld.cs`), write the exact line-numbered spec into `docs/plan/master_audit_and_execution_plan.md` and delegate the file mutation to a **`Model: 'flash'` subagent (`invoke_subagent`)** so the heavy parent context never pays to stream or re-serialize large code blocks.
   - **Never Call `replace_file_content` in Parallel on the Same File**: Parallel edits to the same file violate tool rules and cause canceled/colliding streams. Batch parallel tool calls ONLY across **different** files.
   - **Pinpoint First**: Use `Select-String -Path <file> -Pattern "<symbol>" | Select-Object -First 20 LineNumber, Line` before `view_file`. Read 30–100 line windows, never multi-hundred-line exploratory dumps.
   - **Plan First & Cap Command Output**: Always update `docs/plan/master_audit_and_execution_plan.md` and `docs/STATE.md` before coding, bound PowerShell output (`Select-Object -First 25`), and run targeted verification (`node --check <file>`) first before running full gates once at completion.
2. **Zero Scratch Models, Zero Cartoon/KayKit Assets & Zero 2D Creature Billboards in 3D Scene (`L36` — High-Realism Asset Mandate)**:
   - **Never build 3D models from scratch** out of primitive geometries (`BoxGeometry`, `SphereGeometry`, `CylinderGeometry`, `IcosahedronGeometry`, `createProceduralCreatureMesh`).
   - **Never use KayKit cartoon models** (`Adventurer.gltf`, `Farmer.gltf`, `King.gltf`, `Medieval.gltf`, `Punk.gltf`, `Soldier.gltf`, `Witch.gltf`, `Worker.gltf`) or render characters/creatures as flat 2D sprite billboards in the 3D viewport.
   - **Use ONLY high-realism photogrammetry, UE5-rigged 2K PBR 3D character/bestiary models & dark-fantasy painted assets** (see **Parts VIII–IX Asset Matrix** in `docs/plan/master_audit_and_execution_plan.md`):
     1. **Poly Haven CC0 8K-Scanned Photogrammetry glTFs & 1K/2K PBR Textures** (`server/public/assets/polyhaven/models/` & `textures/`) for trees (`pachira_aquatica_01`), bushes, boulders (`moon_rock_02`), mountain crags (`rock_07`), rodents (`street_rat`), weapons/shields (`antique_estoc`, `antique_katana_01`, `wooden_handle_saber`, `ornate_medieval_dagger`, `ornate_medieval_mace`, `ornate_war_hammer`, `hatchet`, `wooden_axe`, `kite_shield`), and dungeon props/loot (`wine_bottles_01`, `jug_01`, `ceramic_vase_01`, `brass_goblets`, `wooden_lantern_01`, `brass_candleholders`, `treasure_chest`).
     2. **High-Realism 2K PBR UE5-Rigged 3D Character & Bestiary Models** (`server/public/assets/models/characters/{Male_Peasant,Female_Peasant,Male_Ranger,Female_Ranger,Superhero_Male_FullBody,Superhero_Female_FullBody,Hair_*}.gltf` + `server/public/assets/models/monsters/{Puglin,Imp}.glb` + `server/public/assets/models/monsters/bestiary/{Dragon,Fox,Horse,Parrot,Stork,Skull}.glb` + PBR-enhanced `Spider/Snake_angry/Wasp/Frog.obj`) for **100% of townsfolk, humanoids, undead, demons, goblins/orcs/trolls, dragons, beasts, and creatures in the 3D world**.
     3. **4096×4096 Shockbolt Hand-Painted Dark-Fantasy PBR Atlases** (`item_atlas.png` + `item_normal.png` for non-photogrammetry floor items; `monster_atlas.png` + `item_atlas.png` for 2D UI Target Inspector portraits, ribbon icons, and Living Chronicle Hero Action Sketches).
   - Keep GPU index buffers intact on loaded glTF submeshes (never call `.toNonIndexed()`) and tag cached template geometries/materials/textures with `_sharedGeometry = true` / `_sharedMaterial = true` / `_sharedTexture = true` so `destroyEntity()` never disposes shared GPU buffers.



# Angband 3D — Contributor & Engine-Bridge Invariants (v2.4)

> **`Law U0` (Epistemic Honesty)**: Tag claims `⊢ PROVED` / `⊬ HYPOTHESIS` / `⊥ REFUTED` (cite file/line or exit code `0`); separate cited external benchmarks from internal proof receipts (`HONESTY-01`).

## 1. Core Architecture & Engine Authority
1. **Engine Authority**: Game rules, RNG, and saves (`SaveVNLA` + `.realm.json` sidecars for `silq`, `frogcomposband`, `hengband`) are 100% authoritative in C/C++. Isolate upstream Angband changes to `main-bridge.c` and `bridge-json.{c,h}` (export patch via `git diff 4.2.6..HEAD --output=..\engine-patch\0001-bridge-frontend.patch`, never `>`).
2. **Input & Navigation**: Deliver input via `key <spec>` / `keys <text>` (never `cmdq_push()`). **Never bind WASD to movement by default** (`w`=wield, `a`=aim, `s`=search, `d`=drop); opt-in WASD mode (`Alt+W` / `#btn-wasd-toggle`) is active only in engine-idle 3D, `-more-`, and 3D direction prompts (`D22`). Standalone `Home/PgUp/End/PgDn` are 8-way diagonal movement; camera pitch is `Ctrl+PgUp/PgDn/Home`.
3. **View Routing (`§3.3 NeedsTerminal` / `ScreenContext.classify`)**: Route to terminal when `phase != "play"`, `ui.overlay > 0`, or `(!awaiting_command && !more)` (except active 3D directional targeting where arrows send relative directions and `5`/`.`/`t` sends `'t'`). When `more == true` in play with `overlay == 0`, **stay in 3D view**; `ScreenModel.of` routes eligible prompts to `mirror3d` (`D20`).
4. **3D Geometry, Assets & 60fps Lifecycle**:
   - Build 3D walls (`chamfer = 0.40m` octagonal prisms) and floors from map `f` (2-hex-char feature index via `parseInt(f.substring(px*2, px*2+2), 16)`), never glyph `g`. Disambiguate rubble vs bush (`:`) by color (`FEAT_BUSH = 42`).
   - Gate per-frame DOM/GPU updates on state signatures (`frame.seq`, `(px, py, depth, rowsHash)`). Explicitly `.dispose()` removed Three.js/Web Audio resources while protecting `_shared*` singletons.
   - Combat audio uses the 78-file non-vocal foley bank + `createDungeonReverbImpulse` (zero monster groans; `L41`). Passive HP/mana regen is silent (`L49`).
5. **Security Invariants (`CWE-208, CWE-598, E17`)**: Pass API keys via `x-goog-api-key` headers (never `?key=`). Verify ownership tokens via `crypto.timingSafeEqual` (`CWE-208`). Echo `Access-Control-Allow-Origin` only for allowed origins (never `*`; `E17`). Scope `ChronicleManager` to Web Client (`!isStandalone`).

## 2. Pinned Test-Contract Guardrails
1. **Duplicate Methods (`L23`)**: Check for existing `<methodName>(` definitions before editing classes `>300` lines.
2. **ScreenContext Parity (`L19`)**: Update both `screen-context.js` and `app.js:needsTerminal`, then run `node tools/test_screen_context.js` (`151/151`).
3. **Realm Keymaps (`L6/L29`)**: Never hardcode `'5'` or realm verbs in `input.js`; route through `ActionCatalog` / `RealmKeys` (`node tools/test_realm_keys.js`).
4. **CommandDispatcher & MenuRouter (`L28/L59`)**: Run UI intents via `CommandDispatcher` frame-acked KeyPlans; clear pending KeyPlans/`MenuRouter.pending` and `birthReviewActive` on mode exit/Escape (`node tools/test_menu_router.js`).
5. **Edge TTS & Pre-Warm Symmetry (`L30/L32/L34`)**: Default `'edge'` TTS (`<100ms`); unwrap `{ narrator: profile }` via `normalizeVocalOptions(options)`; no `Math.random()` in `resolveCreatureEncounter`; emit `'idle'` in `finally`.
6. **Gemini TTS Regex (`L33`)**: `/api/tts` `tagRegex` must accept `[\[\]]`; never retry `HTTP 4xx`.
7. **HUD & Cache Keys (`L25/L26`)**: Gate HUD DOM updates on state hashes; exclude `${depth}` from `resolveContextualTheme` `theme.id`.
8. **Version, Temp Profiles & Android (`L14/L15/L44`)**: Put browser test profiles in `os.tmpdir()`. After `server/public/` edits, run `node tools/bump_version.js <ver>` and `npm run android:sync`.

## 3. Verification Gate Commands
- **Fast Gate (Before & after edits)**: `node tools/run_tests.js --tier fast` (`30/30 PASS`)
- **Engine Smoke**: `python tools/smoke_test.py` (`11/11 PASS`)
- **Godot C# Build**: `dotnet build client/angband3d.csproj` (`0 warnings / 0 errors`)

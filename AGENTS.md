# Angband 3D — Contributor & Engine-Bridge Invariants (v11.5.7)

> **`Law U0` (Epistemic Honesty)**: Tag claims `⊢ PROVED` / `⊬ HYPOTHESIS` / `⊥ REFUTED` (cite file/line or exit code `0`); separate external benchmarks from internal proof receipts (`HONESTY-01`). Zero personal name references in code/docs (`PUB-PII-01`).

## 1. Core Architecture & 8-Realm Authority
1. **Engine Authority**: Game rules, RNG, and saves (`SaveVNLA` + `.realm.json` sidecars across all 8 realms: `angband`, `silq`, `frogcomposband`, `hengband`, `nethack`, `dcss`, `brogue`, `rogue`) are 100% authoritative in C/C++ (`main-bridge.c` / `bridge-json.{c,h}`) and `UniversalCartridge` (`cartridge-core.js`, `nethack-bridge.js`).
2. **Input & Navigation**: Deliver input via `key <spec>` / `keys <text>` (never `cmdq_push()`). **Never bind WASD to movement by default** (`w`=wield, `a`=aim, `s`=search, `d`=drop); opt-in WASD mode (`Alt+W` / `#btn-wasd-toggle`) is active only in engine-idle 3D, `-more-`, and 3D direction prompts (`D22`). Standalone `Home/PgUp/End/PgDn` are 8-way diagonal movement; camera pitch is `Ctrl+PgUp/PgDn/Home`. In `#death-modal` Tab 0, bare keys route directly to the C engine (`input.js:_handleDeathModalKey`).
3. **View Routing (`§3.3 NeedsTerminal` / `ScreenContext.classify`)**: Route to terminal when `phase != "play"`, `ui.overlay > 0`, or `(!awaiting_command && !more)` (except active 3D directional targeting where arrows send relative directions and `5`/`.`/`t` sends `'t'`). When `more == true` in play with `overlay == 0`, **stay in 3D view**; `ScreenModel.of` routes eligible prompts to `mirror3d` (`D20`).
4. **3D Geometry, Assets & 60fps Lifecycle**:
   - Build 3D walls (`chamfer = 0.40m` octagonal prisms) and floors from map `f` (2-hex-char feature index), never glyph `g`. Disambiguate rubble vs bush (`:`) by color (`FEAT_BUSH = 42`), stores (`7..14`) vs magma/quartz by `g`, and Sil-Q Forge (`feat 60`, `g === '0'`).
   - Preserve multi-material arrays on multi-slot GLBs (`Array.isArray(child.material)`). First-person viewmodels (`_ensureViewmodelWeapon`) rotate `innerPivot.rotation.y += Math.PI * 0.86` so blades/axes face forward (`-Z/-X`).
   - Gate per-frame DOM/GPU updates on state signatures (`frame.seq`, `(px, py, depth, rowsHash)`). Explicitly `.dispose()` removed Three.js/Web Audio resources while protecting `_shared*` singletons.
   - Audio uses the 101-file studio foley bank + `createDungeonReverbImpulse` + 58-track Multi-Realm Adaptive Jukebox & Contextual Music Director (`audio.js`, `getRealmMusicProfile`). Passive HP/mana regen is silent (`L49`).
5. **Security (`CWE-208, CWE-598, E17`)**: Pass API keys via `x-goog-api-key` headers (never `?key=`). Verify ownership tokens via `crypto.timingSafeEqual` (`CWE-208`). Echo `Access-Control-Allow-Origin` only for allowed origins (never `*`; `E17`).

## 2. Pinned Test-Contract Guardrails
1. **Duplicate Methods (`L23`)**: Check for existing `<methodName>(` definitions before editing classes `>300` lines.
2. **ScreenContext Parity (`L19`)**: Update both `screen-context.js` and `app.js:needsTerminal`, then run `node tools/test_screen_context.js` (`151/151`).
3. **Realm Keymaps (`L6/L29`)**: Route realm verbs through `ActionCatalog` / `RealmKeys` (`node tools/test_realm_keys.js`).
4. **CommandDispatcher & MenuRouter (`L28/L59`)**: Run UI intents via `CommandDispatcher` frame-acked KeyPlans; clear pending KeyPlans/`MenuRouter.pending` and `birthReviewActive` on mode exit/Escape (`node tools/test_menu_router.js`).
5. **Edge TTS & Pre-Warm (`L30/L32/L34`)**: Default `'edge'` TTS (`<100ms`); unwrap `{ narrator: profile }` via `normalizeVocalOptions`; no `Math.random()` in `resolveCreatureEncounter`; emit `'idle'` in `finally`.
6. **Gemini TTS Regex (`L33`)**: `/api/tts` `tagRegex` must accept `[\[\]]`; never retry `HTTP 4xx`.
7. **HUD & Memoization (`L25/L26/L58`, `UI_SEQ_IN_MEMO_SIG`)**: Gate HUD/overlay DOM updates on content digests (`itemDigest`, `screenDigest`)—NEVER include `frame.seq` in `_lastSig` / `toolbarSig`; reconcile `#char-extended-drawer` & `#footer-badges` child nodes in-place; exclude `${depth}` from `resolveContextualTheme` `theme.id`.
8. **Version & Temp Profiles (`L14/L15`)**: Put browser test profiles in `os.tmpdir()`. After `server/public/` edits, run `node tools/bump_version.js <ver>`.

## 3. Verification Gates (Web-Only)
- **Fast Gate**: `node tools/run_tests.js --tier fast` (`30/30 PASS`)
- **Engine Smoke**: `python tools/smoke_test.py` (`11/11 PASS`)
- **LOC & Version Sync**: `node tools/check_loc_budget.js && node tools/check_version_sync.js`

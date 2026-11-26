# YASD 3D — Contributor & Engine-Bridge Invariants (v13.3.4)

> **`Law U0` (Epistemic Honesty)**: Tag claims `⊢ PROVED` / `⊬ HYPOTHESIS` / `⊥ REFUTED` (cite `file:line` or exit `0`); separate external baselines from internal receipts (`HONESTY-01`). Zero personal names (`PUB-PII-01`).

## 1. Core Architecture & 9-Realm Authority
1. **Engine Authority**: Rules, RNG, and saves (`SaveVNLA` / `SaveRYOD` + `.realm.json` across 9 realms: `angband`, `silq`, `frogcomposband`, `hengband`, `nethack`, `dcss`, `brogue`, `rogue`, `ryod`) live in C/C++ (`main-bridge.c`, `bridge-json.{c,h}`) and `UniversalCartridge` (`cartridge-core.js`, `nethack-bridge.js`, `ryod-bridge.js`).
2. **Input & Navigation**: Send input via `key <spec>` / `keys <text>` (never `cmdq_push()`). **Never bind WASD by default** (`w`=wield, `a`=aim, `s`=search, `d`=drop); opt-in WASD (`Alt+W` / `#btn-wasd-toggle`) applies in idle 3D, `-more-`, and 3D direction prompts (`D22`). `Home/PgUp/End/PgDn` move diagonally; `Ctrl+PgUp/PgDn/Home` pitch; `#death-modal` Tab 0 routes bare keys to C (`_handleDeathModalKey`).
3. **View Routing (`NeedsTerminal` / `ScreenContext`)**: Route to CRT when `phase != "play"`, `ui.overlay > 0`, or `(!awaiting_command && !more)` (except 3D directional targeting). With `more == true` in play & `overlay == 0`, stay in 3D; `ScreenModel.of` routes eligible prompts to `mirror3d` (`D20`).
4. **3D Geometry, r187 & 60fps Lifecycle**:
   - Build walls/floors from `f` (hex feature), never `g`. Disambiguate rubble/bush (`FEAT_BUSH = 42`), stores (`7..14`), and Sil-Q Forge (`feat 60`, `g === '0'`). Preserve multi-material GLB arrays; viewmodels rotate `innerPivot.rotation.y += Math.PI * 0.86`.
   - `RENDERER_THREE_V2` defaults `r187` (KTX2, `BatchedMesh`, PMREM, PostFX; `?flag_RENDERER_THREE_V2=0` -> `r128`). Gate DOM/GPU on signatures; `.dispose()` removed nodes while protecting `_shared*`; `audio.js` uses 101 SFX + 58-track Jukebox (`L49` silent regen).
5. **Security (`CWE-208, CWE-598, E17`)**: Pass API keys via `x-goog-api-key` (never `?key=`); `timingSafeEqual` owner tokens; mirror Sil-Q `trunc8` `.owner.json` (`server.js:3790`); strict `Access-Control-Allow-Origin` allowlist (never `*`).

## 2. Pinned Test-Contract Guardrails
1. **Duplicate Methods (`L23`)**: Check `<methodName>(` before editing classes `>300` lines.
2. **ScreenContext & PromptMirror (`L19`)**: Keep `screen-context.js` & `app.js:needsTerminal` synced (`test_screen_context.js`). Scope `resolveScreenModelItems` containers + spell priority (`test_v13_3_4_menu_prompts.js`, `test_9realm_menu_prompts_e2e.js`); toggle `YASD_FLAGS` via `__setYasdFlag`.
3. **Realm Keymaps & Router (`L6/L28/L29/L59`)**: Use `ActionCatalog` / `RealmKeys` (`test_realm_keys.js`) and frame-acked KeyPlans (`test_menu_router.js`); clear pending state on Escape.
4. **TTS & HUD (`L25/L26/L30/L32/L33/L34/L58`)**: Default `'edge'` TTS, `normalizeVocalOptions`, emit `'idle'` in `finally`, `tagRegex` `[\[\]]`, no `4xx` retry. Gate HUD on digests (never `frame.seq`), reconcile in-place, omit `${depth}` from `theme.id`.
5. **Profiles, Domain & OVH**: Temp profiles go in `os.tmpdir()` with `--mute-audio`; bump via `node tools/bump_version.js <ver>`. Exclusive domain: `yasd3d.com` (`test_ws82_prelaunch_9pillars.js`). Keep `yasd3d.slice` (`4-5,12-13`) off `games.slice`.

## 3. Verification Gates (Web-Only)
- **Fast / CI Gate**: `node tools/run_tests.js --tier fast` (`61/61`) & `node tools/pre_push_ci_gate.js`
- **Smoke, E2E & Server**: `python tools/smoke_test.py` (`11/11`), `node server/test/server_test.js` (`24/24`), `node tools/test_9realm_menu_prompts_e2e.js` (`10/10`), `node tools/check_loc_budget.js && node tools/check_version_sync.js`

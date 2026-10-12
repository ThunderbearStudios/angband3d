# STATE (live, authoritative). Update after EVERY gate.
Branch: fix/award-pass   Updated: 2026-10-12T07:46-04:00 (WS9.1 layout overlap & touch targets)
Plan: docs/plan/EXECUTOR_START_HERE.md (read first, incl. NEW lessons L18–L22), then the plan section for the current task.
Current task: **WS9.2** (Top bar consolidation).

> PATH NOTE: the plan says "server.js:NNNN". The real file is **server/src/server.js**. Always re-locate lines with `Select-String`.

## ⚠ Incident 2026-10-11 (read once)
An uncommitted WS2/WS3/WS5 attempt broke localhost ("empty sky of stars"). Verified root cause:
`app.js` called `window.MenuRouter.getPending()`, which `menu-router.js` never exported. That threw inside
`needsTerminal()` on **every frame**, and `network.js` silently swallowed the exception, so nothing rendered.
Other defects in that attempt: `ScreenContext.classify()` lacked 6 properties callers read
(`isReviewScreen, isChoiceMenu, isNamePrompt, isMenuOrInteractive, isSplashPoem, isTargetingPrompt`);
`MenuRouter.onFrame` was called twice per frame; the lazy Hengband loader referenced `/js/heng/*` files that
never existed; server stdout was decoded as `latin1` and `lang=en` silently switched Hengband to the English
binary (both broke the Hengband menu test); 66 video keyframes were deleted (D4 violation); STATE/NEXT_STEPS
claimed WS2/WS5 done with no commit.
**Recovery:** working tree restored to commit `0ae16a2` (last good). The full attempt is preserved on branch
`wip/snapshot-pre-triage`, and its untracked files are in `tools/archive/wip-snapshot-2026-10-11/` (salvage list below).

## Checklist
- [x] WS0.1–WS0.4 STATE, AGENTS pointer, probes reverted, test runner
- [ ] WS0.5 Baselines (screenshots: `tools/boot_<realm>.png` from `test_boot_flow.js` are a start)
- [x] WS1 relay guard / crash fix / WS limits
- [x] WS4.1–WS4.10 security (committed through `0ae16a2`)
- [x] R0 Recovery: baseline restored + `tools/test_boot_flow.js` real-browser gate + network.js no longer swallows handler errors (this commit)
- [x] **WS2.2** Extract `screen-context.js` pure module + 47 realm fixtures + delegate `app.js`, `input.js`, `terminal.js` (zero behavior change)
- [x] **WS2.3** Additive classifications (`promptKind: 'command'`, `mode: 'press-any-key'`, `mode: 'item-actions'`, FCB gear UI)
- [x] **WS2.4** `menu-router.js` and Action Chooser in `#term-contextual-actions`
- [x] **WS2.5** End-to-end polish and cleanup
- [x] **WS6.1** Probe realm keys (`tools/probe_realm_keys.js` + 4 fixtures in `tools/fixtures/realm_keys/`)
- [x] **WS6.2** `server/public/js/realm-keys.js` UMD module + unit tests `tools/test_realm_keys.js`
- [x] **WS6.3** Switch senders over, applyLabels, no raw digits
- [x] **WS3.0** Baseline coverage and untranslated corpus (uniqueLines: 171, untranslated: 58, coveragePct: 66.08%)
- [x] **WS3.1** Generator for upstream Hengband translations (`tools/gen_heng_dict.js`)
- [x] **WS3.2** HengTranslate pure UMD module (`server/public/js/heng/heng-translate.js`)
- [x] **WS3.3** Contract unit tests (`tools/test_heng_translate.js`, T1–T12)
- [x] **WS3.4** Wire in behind flag & fix L2, L8, L9
- [x] **WS3.5** Cleanup legacy heng-dict implementation
- [x] **WS9.1** Layout Overlap & Touch Targets (CDP test across 6 viewports & 4 realms, 0 overlaps, all buttons >= 40x40)
- [ ] WS9.2–WS9.5 GUI consolidation & realm action bar
- [ ] WS5 perf/bloat (NOT done: lazy heng-dict, version source, profile hygiene must be redone and committed)
- [ ] WS10 Android/PWA/offline
- [ ] WS7 test consolidation
- [ ] WS8 docs + lessons merged into BEST_PRACTICES
- [ ] G-B..G-K (EXECUTOR §3)

## Mandatory gate (every task, run TWICE for cdp, paste the summary lines here)
Server must be fresh (L13): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }` then `cd server; node src/server.js`.
1. `node --check server/src/server.js` (if server touched)
2. `node tools/run_tests.js --tier all`  → fast + e2e (`verify_cross_realm_menus.js`) + cdp (`test_boot_flow.js`)
3. `python tools/smoke_test.py` → 11/11
4. `dotnet build client/angband3d.csproj` → 0 errors
5. Any `server/public` change → bump `?v=` in index.html AND `CACHE_NAME` in sw.js (use Node, not PowerShell `Set-Content`, to keep UTF-8).

## Known issues (pre-existing at 0ae16a2, not regressions)
- K1 FCB: welcome `-more-` opens the terminal (Continue button) instead of the 3D banner. Gate presses Space and prints a NOTE.
- K2 Hengband: server always spawns the JP binary; client `lang` only affects display translation. Changing this is a WS3 decision, and tests expect JP strings today.
- K3 FCB/Hengband: engine emits a `{"t":"error"}` with empty message during boot; client logs "[Engine Error]" and sets `manualDisconnect`. Investigate in WS2/WS7 (harmless so far).
- K4 `cdp.js` temp-profile cleanup sometimes hits EBUSY on Windows (Chrome still exiting). Add a retry loop in WS5.6.
- K5: e2e test suite leaves multiple engine sessions alive in grace period; restart server before CDP test runs.

## In-flight (uncommitted) files
None

## Last gate results
- WS9.1 (2026-10-12 07:46): fast 7/7 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router, test_realm_keys, test_heng_translate 12 tests, test_heng_wiring 4 tests) | e2e 2/2 PASS (verify_cross_realm_menus 10.6s, test_server_boot 0.8s) | cdp test_boot_flow PASS ×2 consecutive (60.0s, 60.0s; 4/4 realms reach 3D play, FCB NOTE K1) | cdp test_ui_layout PASS (4/4 realms: angband, silq, hengband, poschengband across all 6 viewports: 1920x1080, 1366x768, 1264x625, 1024x768, 844x390, 390x844 with 0 bounding rect overlaps and all touch buttons >= 40x40 under coarse pointer) | smoke 11/11 PASS | dotnet 0 warn / 0 err | asset version bumped to 9.3.13.
- WS3.5 (2026-10-12 01:15): fast 7/7 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router, test_realm_keys, test_heng_translate 12 tests, test_heng_wiring 4 tests) | e2e 2/2 PASS (verify_cross_realm_menus 10.8s, test_server_boot 0.8s) | cdp test_boot_flow PASS ×2 consecutive (60.0s, 60.0s; 4/4 realms reach 3D play, FCB NOTE K1) | test_heng_language_switch PASS | smoke 11/11 PASS | dotnet 0 warn / 0 err | live coverage 98.24% (170 unique raw JP lines, 3 untranslated, 0 mixed lines) | payload reduced from 950 KB to 5 KB, legacy archived to tools/archive/heng-dict.legacy.js.
- WS3.4 (2026-10-12 01:05): fast 7/7 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router, test_realm_keys, test_heng_translate 12 tests, test_heng_wiring 4 tests) | e2e 2/2 PASS (verify_cross_realm_menus 10.9s, test_server_boot 0.8s) | cdp test_boot_flow PASS ×2 consecutive (60.0s, 62.0s; 4/4 realms reach 3D play, FCB NOTE K1) | test_heng_language_switch PASS (live EN -> JP -> bilingual -> EN in-place) | smoke 11/11 PASS | dotnet 0 warn / 0 err | live coverage 98.34% (181 unique raw JP lines, 3 untranslated, 0 mixed lines).
- WS3.4-test red (2026-10-11 23:35): fast 6/7 (test_heng_wiring red as expected: HengTranslate not yet wired into heng-dict.js, L2/L8/L9 not yet implemented)
- WS3.2 (2026-10-11 23:25): fast 6/6 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router, test_realm_keys, test_heng_translate 12 tests) | e2e 2/2 PASS (verify_cross_realm_menus 10.0s, test_server_boot 0.8s) | cdp test_boot_flow PASS ×2 consecutive (59.0s, 60.0s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err | T1-T12 contract green, translation 1ms for 10x corpus.
- WS3.3-test red (2026-10-11 23:16): fast 5/6 (test_heng_translate red as expected: heng-translate.js not yet present)
- WS3.1 (2026-10-11 23:13): fast 5/5 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router, test_realm_keys) | e2e 2/2 PASS (verify_cross_realm_menus 10.0s, test_server_boot 0.8s) | cdp test_boot_flow PASS ×2 consecutive (60.0s, 62.0s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err | generator deterministic, output 1204.1 KB raw / 273.3 KB gzip.
- WS3.0 (2026-10-11 23:04): fast 5/5 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router, test_realm_keys) | e2e 2/2 PASS (verify_cross_realm_menus 10.7s, test_server_boot 0.8s) | cdp test_boot_flow PASS ×2 consecutive (61.0s, 62.0s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err | baseline coverage 66.08% (171 unique raw JP lines, 58 untranslated).
- WS6.3 (2026-10-11 22:30): fast 5/5 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router, test_realm_keys 11 tests) | e2e 2/2 PASS (verify_cross_realm_menus 9.9s, test_server_boot 0.8s) | cdp test_boot_flow PASS ×2 consecutive (64.9s, 65.8s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS6.3-test red (2026-10-11 22:06): fast 4/5 (test_realm_keys red as expected: sendKey('5') present in input.js, senders not yet switched to RealmKeys)
- WS6.2 (2026-10-11 22:01): fast 5/5 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router, test_realm_keys) | e2e 2/2 PASS (verify_cross_realm_menus 10.6s, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (71.3s, 105.3s; 4/4 realms) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS6.2-test red (2026-10-11 21:55): fast 4/5 (test_realm_keys red as expected: realm-keys.js not yet present)
- WS6.1 (2026-10-11 21:53): fast 4/4 PASS | e2e 2/2 PASS (verify_cross_realm_menus 11.0s, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (114.2s, 74.6s; 4/4 realms reach 3D play) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS2.5 (2026-10-11 21:35): fast 4/4 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router) | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms in 9.7s with torch state assertion + remove routing, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (72.2s, 69.9s; 4/4 realms + real-browser Action Chooser DOM test in Sil-Q) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS2.4 (2026-10-11 21:25): fast 4/4 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router) | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms in 10.2s, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (67.0s, 67.9s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS2.3 (2026-10-11 21:11): fast 3/3 PASS (relay guard, http guard, screen_context 141/141 tests) | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms in 10.6s, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (61.6s, 78.8s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS2.2 (2026-10-11 20:57): fast 3/3 PASS (relay guard, http guard, screen_context 135/135 tests) | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (60.7s, 61.5s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- R0 (2026-10-11 20:00): fast 2/2 PASS | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms) | cdp test_boot_flow PASS ×2 consecutive (64s, 68s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 | dotnet 0 warn / 0 err.

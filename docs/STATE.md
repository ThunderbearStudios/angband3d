# STATE (live, authoritative). Update after EVERY gate.
Branch: fix/award-pass   Updated: 2026-10-11T21:36-04:00 (WS2 Phase 5 pass)
Plan: docs/plan/EXECUTOR_START_HERE.md (read first, incl. NEW lessons L18–L22), then the plan section for the current task.
Current task: **WS6** (Realm keys: probe first per EXECUTOR §8 / language_gui_platform_spec.md).

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
- [ ] WS6 realm keys (probe first)
- [ ] WS3 Hengband language (decides lang→binary policy; see K2)
- [ ] WS9 GUI
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
- `tools/verify_cross_realm_menus.js` (extended with MenuRouter item selection, state assertions for equipped torch, Remove routing, Hengband item interception and client-side Escape cancellation)
- `tools/test_boot_flow.js` (added real-DOM Action Chooser test in Sil-Q: clicks ribbon letter, asserts chooser header + verbs + escape, tests Escape dismissal)

## Last gate results
- WS2.5 (2026-10-11 21:35): fast 4/4 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router) | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms in 9.7s with torch state assertion + remove routing, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (72.2s, 69.9s; 4/4 realms + real-browser Action Chooser DOM test in Sil-Q) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS2.4 (2026-10-11 21:25): fast 4/4 PASS (relay guard, http guard, screen_context 141 tests, test_menu_router) | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms in 10.2s, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (67.0s, 67.9s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS2.3 (2026-10-11 21:11): fast 3/3 PASS (relay guard, http guard, screen_context 141/141 tests) | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms in 10.6s, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (61.6s, 78.8s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- WS2.2 (2026-10-11 20:57): fast 3/3 PASS (relay guard, http guard, screen_context 135/135 tests) | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms, test_server_boot) | cdp test_boot_flow PASS ×2 consecutive (60.7s, 61.5s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 PASS | dotnet 0 warn / 0 err.
- R0 (2026-10-11 20:00): fast 2/2 PASS | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms) | cdp test_boot_flow PASS ×2 consecutive (64s, 68s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 | dotnet 0 warn / 0 err.

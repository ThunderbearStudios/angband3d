# STATE (live, authoritative). Update after EVERY gate.
Branch: fix/award-pass   Updated: 2026-10-11T20:00-04:00 (Opus recovery pass)
Plan: docs/plan/EXECUTOR_START_HERE.md (read first, incl. NEW lessons L18–L22), then the plan section for the current task.
Current task: **WS2 Phase 2** (extract `screen-context.js`, zero behavior change). See "WS2 redo recipe" below.

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
- [ ] **WS2** menus / action chooser — redo per recipe below (Phases 2→5, one commit per phase)
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

## WS2 redo recipe (plan: docs/plan/menu_context_remediation_plan.md §3–§5)
Salvage from `tools/archive/wip-snapshot-2026-10-11/` (copy back ONLY in the phase that needs it, then fix):
| File | State | Use in |
|---|---|---|
| `server/public/js/screen-context.js` | Good start, WRONG contract (see incident) | Phase 2 |
| `tools/test_screen_context.js`, `tools/capture_menu_fixtures.js`, `tools/fixtures/menus/*` | Usable; fixtures only cover i/e for 3 realms | Phase 2 |
| `server/public/js/menu-router.js`, `tools/test_menu_router.js` | No `getPending` export; verbs need ⚠ citations | Phase 4 |
| `server/public/js/realm-keys.js`, `tools/probe_realm_keys.js`, `tools/fixtures/realm_keys/*` | Only angband+silq probed | WS6 |
| `tools/bump_version.js`, `tools/check_version_sync.js`, `server/public/version.json` | Unverified | WS5.4 |
| `tools/refactor_app_js.js` | Script that rewrites app.js. **Do not run.** | none |
| `setCtxActions()` escaping helper in app.js (branch `wip/snapshot-pre-triage`) | Worth porting | Phase 3/4 |

Phase 2 rules that were skipped last time (non-negotiable):
1. `classify()` must return **every** property any caller reads. Write `tools/test_screen_context.js` to assert the full key set (contract test), not just `mode`.
2. Keep the old inline heuristics during Phase 2 and assert old == new on every fixture before deleting them.
3. Switch callers one file at a time: app.js → gate → input.js → gate → terminal.js → gate.
4. Any `window.X.fn()` call must be guarded `typeof window.X?.fn === 'function'` until the module ships in the same commit.

## In-flight (uncommitted) files
- (none after R0 commit)

## Last gate results
- R0 (2026-10-11 20:00): fast 2/2 PASS | e2e 2/2 PASS (verify_cross_realm_menus: all 4 realms) | cdp test_boot_flow PASS ×2 consecutive (64s, 68s; 4/4 realms reach 3D play, FCB NOTE K1) | smoke 11/11 | dotnet 0 warn / 0 err.
- K5: one earlier cdp run inside `--tier all` failed once (124.9s) right after the e2e suite left 4+ engines alive; not reproduced in 3 later runs. If it recurs, restart the server between e2e and cdp.
- PowerShell gotcha: `node ... 2>&1 | Select-String` reports exit 1 because Node's ExperimentalWarning on stderr becomes an error record. Use `*> file; $LASTEXITCODE` to read the real exit code.

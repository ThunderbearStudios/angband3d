# Execution State (Read First, Update Last)

## Active Task
**WS37 — Compact 3D Creature/Object Inspection Popover (`flex-direction: column` + `🔍 Inspect` / `💬 Interact`), Story-Enriched Chronicle Creature Interactions, Non-Conflicting `Alt+1..4` Quick-Slot Hotkeys & Fullscreen `Escape` Lock, and Sleek Bottom Command Dock & Telemetry Footer (`v10.3.0`) — COMPLETE**

- **Current Phase**: All workstreams `WS0–WS37` complete (`v10.3.0`, `19/19 fast`, `144/144 screen_context`, `17/17 menu_router`, `11/11 smoke`, `0 C# errors`, `tb_mastery.py audit` `0 errors / 0 warnings`).
- **Historical Log**: Full checklist and gate history for `WS0–WS21` are archived in [`docs/archive/STATE_HISTORY_WS0_WS21.md`](file:///c:/Dev/angband3d/docs/archive/STATE_HISTORY_WS0_WS21.md).

## Completed Workstream Summary (`WS0–WS37`)

| Workstream | Scope Summary | Status |
| :--- | :--- | :--- |
| **WS0–WS3** | Baseline harness, `ScreenContext.classify(frame)` (`144/144`), `MenuRouter`, `RealmKeys`, and `HengTranslate` (`98.34%` coverage) | `[x] DONE` |
| **WS4–WS10** | `http-guard.js`, `rate-limit.js`, TOFU isolation, single version source (`version.json`), HUD pass, Android SDK 34 sync (`505/505` SHA-1) | `[x] DONE` |
| **WS11–WS21** | Voiced Lorekeeper (`Enceladus` + 30 archetypes), 8-Pillar 3D, Shockbolt 4096 HD, 4-Realm `.glb` Bestiary, Studio Foley, Apothecary Vials (`L37–L44`) | `[x] DONE` |
| **WS22–WS31** | Agentic Mastery (`L45–L53`), 3D Bestiary & Popover, Multi-Col Hit-Testing, `RealmGrimoireDeck`, Narrative Vows/Parley, Cross-Realm Unified Command/Inventory | `[x] DONE` |
| **WS32–WS34** | Viewport-Budget Terminal/Grimoire, `#quick-slot-bar`, Sliding Outdoor Terrain Anchor, Bresenham LOS Recommender, Sleek Horizontal Vitals, StreetView & Classic Route Parity (`v10.0.0`) | `[x] DONE` |
| **WS35–WS36** | 4-Realm Bestiary (`J` -> `snake.glb`, `Parrot.glb` corvid tint), Immediate-Space Chevrons, Always-Visible Classic Terminal, Default D-Pad & `106px` Message Log, Cohesive 60fps Wall UVs (`v10.2.0`) | `[x] DONE` |
| **WS37** | Compact 3D Inspection Popover (`flex-direction: column`, `🔍 Inspect` + Web-only `💬 Interact`), Story-Enriched Chronicle Encounters, Non-Conflicting `Alt+1..4` & Fullscreen `Escape` Lock, Sleek Bottom Dock (`v10.3.0`) | `[x] DONE` |

## Mandatory Verification Gate
Server must be fresh (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }` then `cd server; node src/server.js`.
1. `node --check server/src/server.js` (if server touched)
2. `node tools/run_tests.js --tier fast` $\rightarrow$ `19/19 PASS` (`--tier all` when UI/protocol/routes change)
3. `python tools/smoke_test.py` $\rightarrow$ `11/11 PASS`
4. `dotnet build client/angband3d.csproj` $\rightarrow$ `0 warnings / 0 errors`
5. `python c:\Dev\thunderbear-agentic-mastery\tools\tb_mastery.py audit c:\Dev\angband3d` $\rightarrow$ `0 errors / 0 warnings`
6. Any `server/public` change $\rightarrow$ bump via `node tools/bump_version.js <v>`.

## Known Upstream Issues (Pre-existing at `0ae16a2`, Not Regressions)
- **K1 (FCB)**: Welcome `-more-` opens the terminal (Continue button) instead of the 3D banner; gate presses Space and prints a NOTE.
- **K2 (Hengband)**: Server spawns the JP binary; client `lang` controls display translation (`HengTranslate`).
- **K3 (FCB/Hengband)**: Engine emits harmless `{"t":"error"}` with empty message during boot.
- **K4 (`cdp.js`)**: Temp-profile cleanup on Windows retries on `EBUSY`; always allocate in `os.tmpdir()` (`L15/L43`).
- **K5 (E2E)**: Restart local server before running CDP suite after heavy E2E runs.
- **K6 (Vanilla `ui-input.c:1527`)**: `"Direction or <click> (Escape to cancel)?"` is emitted while `awaiting_command: true`; `ScreenContext` routes via row-0 prompt matching (`test_screen_context.js:172`).

## In-Flight (Uncommitted) Files Inventory
None

## Queued Backlog (Next To-Do When Token Budget Available)
- **WS-NH1..WS-NH6 — UnNetHack (5th Realm) Full Integration (`~2.5–4.0 hrs` / `~110–145 turns`)**: Complete architectural spec, `win/bridge/winbridge.c` `window_procs` design, `SaveUNHK` multi-file save bundler, and 6 pre-solved NetHack technical gotchas documented in [`docs/plan/UNNETHACK_INTEGRATION_PLAN.md`](file:///c:/Dev/angband3d/docs/plan/UNNETHACK_INTEGRATION_PLAN.md).

## Last Gate Results
- **WS37 Compact 3D Inspection Popover, Story-Enriched Chronicle Encounters, Non-Conflicting Hotkeys & Sleek Bottom Dock Gate (`v10.3.0`, 2026-10-21)**: `fast 19/19 PASS` (`test_bestiary_match_verification` 53/53, `test_screen_context` 144/144, `test_menu_router` 17/17, `check_version_sync` `10.3.0`, `check_android_sync` SHA-1 matched) | `smoke_test.py` `11/11 PASS` | `dotnet build` Godot `0 warn / 0 err` | `tb_mastery.py audit` `0 errors / 0 warnings`.

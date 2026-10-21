# Execution State (Read First, Update Last)

## Active Task
**WS41 — Deep Security, 60fps Render Pipeline Gating, Bloat Reclaim & Wire Efficiency Pass (v10.7.0) — COMPLETE**

- **Current Phase**: All atomic turnkey cards `WS41.1` $\rightarrow$ `WS41.5` defined in [`docs/plan/master_audit_and_execution_plan.md`](file:///c:/Dev/angband3d/docs/plan/master_audit_and_execution_plan.md#L166) are complete.
- **Active Checklist**:
  - [x] **`WS41.1`**: Workspace Bloat Purge (`~1.98 GB` temp profiles) & Test Suite Hermeticity (`os.tmpdir()`, dynamic ports)
  - [x] **`WS41.2`**: Server Ownership Hardening (`C1`/`C2`), Rate-Limit Isolation (`H1`/`H4`/`H5`) & O(1) Relay/False-Death Fix (`H2`/`H3`/`P3`)
  - [x] **`WS41.3`**: 60 FPS Client Render, HUD & Terminal Pipeline Gating (`dungeon3d.js`, `hud.js`, `terminal.js`, `chronicle-*`)
  - [x] **`WS41.4`**: Service Worker Install Diet (`-9.02 MB`), Cache-First Static Assets, Script `defer` & Version Sync (`v10.7.0`)
  - [x] **`WS41.5`**: Native Bridge UTF-8 Decoding (`H8`), Godot Input Encoding/Badge Gating & CI/Docker Hardening (`H6`/`H7`)
- **Historical Log**: Full checklist and gate history for `WS0–WS21` are archived in [`docs/archive/STATE_HISTORY_WS0_WS21.md`](file:///c:/Dev/angband3d/docs/archive/STATE_HISTORY_WS0_WS21.md).

## Completed Workstream Summary (`WS0–WS41`)

| Workstream | Scope Summary | Status |
| :--- | :--- | :--- |
| **WS0–WS21** | Baseline harness, ScreenContext (`144/144`), MenuRouter, RealmKeys, HengTranslate (`98.34%`), guards, Lorekeeper, 8-Pillar 3D, Foley (`L37–L44`) | `[x] DONE` |
| **WS22–WS36** | Mastery (`L45–L53`), Grimoire Deck, Viewport Budget, Sliding Anchor, LOS, Horizontal Vitals, Classic Terminal (`v10.2.0`) | `[x] DONE` |
| **WS37–WS40** | Popover, Story Chronicle, `Alt+1..4` Slots, Minimap, Offline Continuity, Mobile Layout, Zero-Parse WS Relay (`TCP_NODELAY`, `v10.6.0`) | `[x] DONE` |
| **WS41** | Security audit (`C1`/`C2`, `H1`/`H4`/`H5`, `H6`–`H8`), 60fps render/HUD gating, SW diet (`-9.02 MB`), C bridge UTF-8 (`v10.7.0`) | `[x] DONE` |

## Mandatory Verification Gate
Server must be fresh (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }` then `cd server; node src/server.js`.
1. `node --check server/src/server.js` (if server touched)
2. `node tools/run_tests.js --tier fast` $\rightarrow$ `19/19 PASS` (`--tier all` when UI/protocol/routes change)
3. `python tools/smoke_test.py` $\rightarrow$ `11/11 PASS`
4. `dotnet build client/angband3d.csproj` $\rightarrow$ `0 warnings / 0 errors`
5. `python c:\Dev\thunderbear-agentic-mastery\tools\tb_mastery.py audit c:\Dev\angband3d` $\rightarrow$ `0 errors / 0 warnings`
6. Any `server/public` change $\rightarrow$ bump via `node tools/bump_version.js <v>`.

## Known Upstream Issues (Pre-existing at `0ae16a2`, Not Regressions)
- **K1 (FCB)**: Welcome `-more-` opens terminal instead of 3D banner; gate presses Space.
- **K2 (Hengband)**: Server spawns JP binary; client `lang` controls translation (`HengTranslate`).
- **K3 (FCB/Hengband)**: Engine emits harmless `{"t":"error"}` during boot.
- **K4 (`cdp.js`)**: Always allocate Chrome profiles in `os.tmpdir()` (`L15/L43`).
- **K5 (E2E)**: Restart local server before running CDP suite after heavy E2E runs.
- **K6 (Vanilla `ui-input.c:1527`)**: Direction prompt routes via row-0 prompt matching (`test_screen_context.js:172`).

## In-Flight (Uncommitted) Files Inventory
None

## Queued Backlog (Next To-Do When Token Budget Available)
- **WS-NH1..WS-NH6 — UnNetHack (5th Realm) Full Integration**: Full spec in [`docs/plan/UNNETHACK_INTEGRATION_PLAN.md`](file:///c:/Dev/angband3d/docs/plan/UNNETHACK_INTEGRATION_PLAN.md).

## Last Gate Results
- **WS41 (`v10.7.0`) Live Cloud & Full Gate (2026-10-21)**: `fast 19/19 PASS` | `smoke_test.py 11/11 PASS` | `dotnet build 0 warn / 0 err` | `tb_mastery.py audit 0 err / 0 warn` | `test_cloud_live.js PASS (angband3d.com v10.7.0)`.

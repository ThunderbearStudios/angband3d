# Execution State (Read First, Update Last)

## Active Task
**WS42 — Cross-Realm Command, Action & Menu Unification — IN PROGRESS (Wave 5)**

- **Plan of record**: [`docs/plan/WS42_COMMAND_AND_MENU_UNIFICATION_PLAN.md`](file:///c:/Dev/angband3d/docs/plan/WS42_COMMAND_AND_MENU_UNIFICATION_PLAN.md) (audit §2, cards §8, decisions §10). Index: `master_audit_and_execution_plan.md` §9.
- **Checklist** (one commit per card, red test first):
  - [x] `WS42.0` Recorder + fixtures + red contracts (`8/8 RED` proven, `146/146` screen-context)
  - [x] `WS42.1A–D` Hot-fixes: key-spec case (P0-01), Escape (P0-02), FCB select (P0-03), chooser letters (P0-04), Vanilla `nohjkl` letters (P0-05), palette, quick slots (`7/7` contracts PASS, `19/19` fast PASS)
  - [x] `WS42.2A–E` Bridge `ui.prompt`/`letter`/`verbs`/`commands` + Protocol vNext (`21/21` schema PASS, wire `+2.66%`)
  - [x] `WS42.3A–C` ActionCatalog (`9/9`), ScreenModel (`151/151`), CommandDispatcher (`74/74` replay PASS)
  - [x] `WS42.4A–C` InputRouter (`3,473L`), app wiring & palette extraction, terminal fidelity (`1,149L`, `8/8` contracts PASS)
  - [ ] `WS42.5A–D` Mirrors, Item Sheet, Palette, Entity menu, Dock
  - [ ] `WS42.6` Archive + contract migration · [ ] `WS42.7` (opt.) Radial/Gamepad · [ ] `WS42.8` Verify + docs + `v10.8.0`
- **History**: WS0–WS21 in [`docs/archive/STATE_HISTORY_WS0_WS21.md`](file:///c:/Dev/angband3d/docs/archive/STATE_HISTORY_WS0_WS21.md).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS21 | Harness, ScreenContext, MenuRouter, RealmKeys, HengTranslate, 8-Pillar 3D, Foley | `[x]` |
| WS22–WS36 | Mastery, Grimoire, Viewport, LOS, Vitals, Classic Terminal (`v10.2.0`) | `[x]` |
| WS37–WS40 | Popover, Chronicle, `Alt+1..4`, Minimap, Mobile, Zero-Parse Relay (`v10.6.0`) | `[x]` |
| WS41 | Security, 60fps gating, SW diet, C bridge UTF-8 (`v10.7.0`) | `[x]` |

## Mandatory Verification Gate
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` (if touched) 2. `node tools/run_tests.js --tier fast` → `19/19` (`--tier all` for UI/protocol) 3. `python tools/smoke_test.py` → `11/11` 4. `dotnet build client/angband3d.csproj` → `0/0` 5. `tb_mastery.py audit c:\Dev\angband3d` → `0/0` 6. `server/public` change → `node tools/bump_version.js <v>` + `npm run android:sync`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- `docs/plan/WS42_COMMAND_AND_MENU_UNIFICATION_PLAN.md` (new), `docs/plan/master_audit_and_execution_plan.md` (§9), `docs/plan/EXECUTOR_START_HERE.md`, `docs/plan/UNIFIED_MENU_SYSTEM_PLAN.md` (superseded banner), `docs/STATE.md`.

## Queued Backlog
- **WS-NH1..6 UnNetHack** — [`UNNETHACK_INTEGRATION_PLAN.md`](file:///c:/Dev/angband3d/docs/plan/UNNETHACK_INTEGRATION_PLAN.md) (after WS42 W3 so it inherits ActionCatalog/Dispatcher).

## Last Gate Results
- **WS41 (`v10.7.0`, 2026-10-21)**: fast `19/19` · smoke `11/11` · dotnet `0/0` · mastery `0/0` · `test_cloud_live.js` PASS.
- **WS42 planning baseline (2026-10-21)**: `test_screen_context` 144/144 · `test_menu_router` PASS · `test_realm_keys` 11/11 (synthetic; misses P0-01..05).

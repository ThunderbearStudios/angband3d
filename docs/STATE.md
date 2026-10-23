# Execution State (Read First, Update Last)

## Active Task
**WS42 — Cross-Realm Command, Action & Menu Unification (`v10.8.1`) — COMPLETE**

- **Checklist** (one commit per card, red test first):
  - [x] `WS42.0` Recorder + fixtures + red contracts (`8/8 RED` proven, `146/146` screen-context)
  - [x] `WS42.1A–D` Hot-fixes: key-spec case (P0-01), Escape (P0-02), FCB select (P0-03), chooser letters (P0-04), Vanilla `nohjkl` letters (P0-05), palette, quick slots (`7/7` contracts PASS)
  - [x] `WS42.2A–E` Bridge `ui.prompt`/`letter`/`verbs`/`commands` + Protocol vNext (`21/21` schema PASS, wire `+2.66%`)
  - [x] `WS42.3A–C` ActionCatalog (`351L`, `9/9`), ScreenModel (`811L`, `151/151`), CommandDispatcher (`615L`, `74/74` replay PASS)
  - [x] `WS42.4A–C` InputRouter (`3,474L`), app wiring (`5,001L`), terminal fidelity (`1,149L`, `8/8` contracts PASS)
  - [x] `WS42.5A–D` Mirrors (`70/70`), Item Sheet (`373L`), Palette (`13/13`), Entity menu (`203L`), Dock (`hud.js` `3,114L`)
  - [x] `WS42.6` Grimoire rebase (`246L`) + AGENTS.md · [x] `WS42.7` Radial/Gamepad (`ALL PASS`) · [x] `WS42.8` KLM (`13/13`), LOC (`17/17`), Ledger (`29/29`), `v10.8.0`

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS21 | Harness, ScreenContext, MenuRouter, RealmKeys, HengTranslate, 8-Pillar 3D, Foley | `[x]` |
| WS22–WS36 | Mastery, Grimoire, Viewport, LOS, Vitals, Classic Terminal (`v10.2.0`) | `[x]` |
| WS37–WS40 | Popover, Chronicle, `Alt+1..4`, Minimap, Mobile, Zero-Parse Relay (`v10.6.0`) | `[x]` |
| WS41 | Security, 60fps gating, SW diet, C bridge UTF-8 (`v10.7.0`) | `[x]` |
| WS42 | Cross-Realm Command, Action & Menu Unification (`v10.8.1`) | `[x]` |

## Mandatory Verification Gate
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` (if touched) 2. `node tools/run_tests.js --tier fast` → `29/29` (`--tier all` for UI/protocol) 3. `python tools/smoke_test.py` → `11/11` 4. `dotnet build client/angband3d.csproj` → `0/0` 5. `server/public` change → `node tools/bump_version.js <v>` + `npm run android:sync`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (clean working tree after `WS42.8` commit).

## Last Gate Results
- **WS41 (`v10.7.0`, 2026-10-21)**: fast `19/19` · smoke `11/11` · dotnet `0/0` · `test_cloud_live.js` PASS.
- **WS42 (`v10.8.1`, 2026-10-22)**: fast `29/29` · contracts `8/8` · LOC budgets `17/17` · capability ledger `29/29` · smoke `11/11` · dotnet `0/0`.

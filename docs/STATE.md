# Execution State (Read First, Update Last)

## Active Task
**WS43 — `v10.9.0` Exemplar Polish (`~42%` Chronicle Prompt Diet + 1-Click `<kbd>Tab</kbd> CRT` Toggle) — COMPLETE**

- **Checklist** (one commit per card, red test first):
  - [x] `WS42.0–WS42.8` Cross-Realm Command, Action & Menu Unification + Global Circuit Breakers (`v10.8.3`, `29/29` fast PASS)
  - [x] `WS43.1` Compact `chronicle-llm.js` (`generateChapter` & `chatWithCreature` prompts reduced by `~42%`, `recentUtterances` capped to `.slice(-6)`)
  - [x] `WS43.2` Add 1-click `<kbd>Tab</kbd> CRT` (`#btn-map-toggle-crt`) to `#minimap-controls-bar` in `index.html` (`1535/1545L`) and wire to `toggleTerminalView` in `app.js`
  - [x] `WS43.3` Bump version to `v10.9.0`, sync Android assets (`npm run android:sync`), pass `29/29` fast tests, `11/11` smoke tests, and `0/0` C# build

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS21 | Harness, ScreenContext, MenuRouter, RealmKeys, HengTranslate, 8-Pillar 3D, Foley | `[x]` |
| WS22–WS36 | Mastery, Grimoire, Viewport, LOS, Vitals, Classic Terminal (`v10.2.0`) | `[x]` |
| WS37–WS40 | Popover, Chronicle, `Alt+1..4`, Minimap, Mobile, Zero-Parse Relay (`v10.6.0`) | `[x]` |
| WS41 | Security, 60fps gating, SW diet, C bridge UTF-8 (`v10.7.0`) | `[x]` |
| WS42 | Cross-Realm Command, Action & Menu Unification + Global Circuit Breakers (`v10.8.3`) | `[x]` |

## Mandatory Verification Gate
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` (if touched) 2. `node tools/run_tests.js --tier fast` → `29/29` (`--tier all` for UI/protocol) 3. `python tools/smoke_test.py` → `11/11` 4. `dotnet build client/angband3d.csproj` → `0/0` 5. `server/public` change → `node tools/bump_version.js <v>` + `npm run android:sync`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (clean working tree after `v10.8.3` commit).

## Last Gate Results
- **WS41 (`v10.7.0`, 2026-10-21)**: fast `19/19` · smoke `11/11` · dotnet `0/0` · `test_cloud_live.js` PASS.
- **WS42 (`v10.8.3`, 2026-10-25)**: fast `29/29` · contracts `8/8` · LOC budgets `17/17` · capability ledger `29/29` · smoke `11/11` · dotnet `0/0`.

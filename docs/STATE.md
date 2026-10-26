# Execution State (Read First, Update Last)

## Active Task
**WS44 — `v11.0.0` Showcase Overhaul (11 UI/HUD/3D/Gemini Upgrades + WebMCP + GeForce NOW Gamepad) — COMPLETE**

- **Checklist** (one commit per card, red test first):
  - [x] `WS44.1` Default `GrimoireDeckController` to `'hybrid'`, add `[Cards / Classic F10]` toolbar toggle, expand `#grimoire-deck-container` to `min(44dvh, 320px)`
  - [x] `WS44.2` Sync `CommandPalette` `appState` via `window.__app.setAppState`, add `🎒 Items` tab, split `tactical` vs `exploration`, bound `extractRowRegions` `endCol`, close `ItemSheet` on `Escape`, wire `GamepadController` (`X`, `Start`, `Select`, `B`), wire `--hud-scale`, fix mobile `>=40x40px` touch targets, convert `#terminal-viewport` to `flex: 1 1 0`, add `@media (max-height: 820px)` compaction
  - [x] `WS44.3` Upgrade Gemini models (`gemini-nano-banana-2.1`, `gemini-3.8-flash-lite-tts`, `gemini-3.8-flash` / `gemini-4-argon` with `thinkingLevel` + `Api-Revision: 2026-05-20`), add `8x` anisotropic PBR filtering, Adaptive 60fps Pixel-Ratio Governor, `Alt+H` HUD Immersion cycling, and Chrome `WebMCP` read-only tools
  - [x] `WS44.4` Bump version to `v11.0.0`, sync Android assets (`npm run android:sync`), package `dist/Angband3D-Windows-x64.zip`, pass `17/17` LOC budgets, `29/29` fast, `11/11` smoke, `4/4` E2E, `6/6` UI layout viewports, and `0/0` C# builds

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

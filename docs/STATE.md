# Execution State (Read First, Update Last)

## Active Task
**WS45 — `v11.0.0` Classic Terminal Menu & Living Chronicle Narration Overhaul — COMPLETE**

- **Checklist** (one commit per card, red test first):
  - [x] `WS44.1–WS44.4` Showcase Overhaul (`v11.0.0` bump, `8x` anisotropic PBR filtering, Adaptive 60fps Pixel-Ratio Governor, `Alt+H` HUD Immersion, Chrome `WebMCP`, GeForce NOW Gamepad, Android sync, Windows x64 package)
  - [x] `WS45.1` Default `GrimoireDeckController` to `'classic'` mode (`0px` deck overhead), auto-hide `#term-letter-ribbon` and `#btn-term-advance` on empty prompts, fix `MenuRouter` verbs (`b`, `m`, `G`), and enhance `Terminal.updateSelectableRegions` / `moveSelection` + `#terminal-touch-controls`
  - [x] `WS45.2` Living Chronicle Tome & Gemini 3.8 TTS Overhaul: route sustained delivery instructions via `speech_metadata: { style }` for `gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts`, inject `recentStoryThread` anti-repetition context + `responseMimeType: 'application/json'` + `thinkingLevel` (`MINIMAL` / `LOW`), raise `_executeSeamlessSpeak` single-utterance threshold to `240` chars, suppress repetitive depth suffixes and `4500ms` melee clash spam, and coalesce superseded fragment chapters on `triggerCatchUpBeat`

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

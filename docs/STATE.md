# Execution State (Read First, Update Last)

## Active Task
**WS24 — Non-Modal 3D Entity Inspection Popover, Gameplay Precedence & Concise Anti-Repetition Dialogue (`v9.9.4`) — COMPLETE**

- **Current Phase**: All workstreams `WS0–WS24` complete and verified (`19/19 fast`, `4/4 e2e`, `11/11 smoke`, `0 C# errors`, `tb_mastery.py audit` `0 errors / 0 warnings`).
- **Historical Log**: Full checklist and gate history for `WS0–WS21` are archived in [`docs/archive/STATE_HISTORY_WS0_WS21.md`](file:///c:/Dev/angband3d/docs/archive/STATE_HISTORY_WS0_WS21.md).

## Completed Workstream Summary (`WS0–WS24`)

| Workstream | Scope Summary | Status |
| :--- | :--- | :--- |
| **WS0–WS1** | Baseline harness, tiered runner (`tools/run_tests.js`), and pure UMD `ScreenContext.classify(frame)` (`144/144` fixtures) | `[x] DONE` |
| **WS2 & WS6** | Declarative `MenuRouter`, `RealmKeys` cross-realm keymap registry, and Sil-Q Action Chooser | `[x] DONE` |
| **WS3** | Upstream-driven atomic Hengband JP/EN translator (`HengTranslate`, `98.34%` coverage, lazy dictionary) | `[x] DONE` |
| **WS4, WS7, WS8** | `http-guard.js`, `rate-limit.js`, TOFU save isolation, multi-realm container build, and Cloud Run deployment | `[x] DONE` |
| **WS5, WS9, WS10** | Single version source (`version.json`), top-bar consolidation, HUD message pass, and Android SDK 34 sync (`504/504` SHA-1) | `[x] DONE` |
| **WS11–WS18** | Voiced Lorekeeper (`Enceladus` + 30 archetypes), 8-Pillar Ultra Realism 3D, Shockbolt 4096 HD atlases, Hero Action Sketch, and Skinned-Mesh Held Equipment (`L37–L40`) | `[x] DONE` |
| **WS19–WS21** | 4-Realm 3D Bestiary (`.glb`), Studio Foley + Stone-Hall Convolution Reverb, Shared Singleton VFX (`L43`), and Vertical Apothecary Medicine Vials / Tattered-Scroll UI (`L41–L44`) | `[x] DONE` |
| **WS22–WS24** | Universal Agentic Mastery (`L45–L49`), Authentic Artist 3D Bestiary & Arcane Items (`L50`), Non-Modal 3D Entity Popover (`#entity-inspect-popover`), Gameplay Precedence & Concise 12-Slot Anti-Repetition Dialogue (`L51`, `v9.9.4`) | `[x] DONE` |

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

## Last Gate Results
- **WS24 Non-Modal 3D Entity Popover, Gameplay Precedence & Concise Dialogue Gate (`v9.9.4`, 2026-10-20)**: `fast 19/19 PASS` (`test_chronicle.js` 37/37 phases incl. Phase 37 popover/focus/preemption/brevity, `check_version_sync` `9.9.4`, `check_android_sync` SHA-1 matched) | `smoke_test.py` `11/11 PASS` | `dotnet build` Godot & Desktop `0 warn / 0 err` | `tb_mastery.py audit` `0 errors / 0 warnings`.
- **WS23 Authentic Artist 3D Bestiary & Arcane Items Gate (`v9.9.3`, 2026-10-19)**: `fast 19/19 PASS` | `e2e 4/4 PASS` | `smoke_test.py` `11/11 PASS` | `dotnet build` Godot & Desktop `0 warn / 0 err` | `tb_mastery.py audit` `0 errors / 0 warnings`.

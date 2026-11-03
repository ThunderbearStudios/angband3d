# Execution State (Read First, Update Last)

## Active Task
**WS48 — `v11.3.5` YASD 3D Showcase Splash, Cross-Realm Procedural Birth & YASD Death Sketch/Modal Overhaul — COMPLETE**

- **Checklist** (one commit per card, red test first):
  - [x] `M1–M4` Zero-Flicker Overlay Memoization, Action Bar Stability & In-Place HUD Reconciliation (`v11.1.1`).
  - [x] `v11.3.3–v11.3.4` Official YASD 3D Splash Billboard (`yasd3d_logo.png`), Realm Popularity Strip (`NetHack • DCSS • Angband • Brogue • Rogue • Sil-Q • FrogComposBand • Hengband`), and Cross-Realm Procedural Dungeon & Birth Audit.
  - [x] `v11.3.5` YASD Death Modal & On-Demand Sketch Overhaul (`chronicle-manager.js`, `hud.js`, `terminal.js`, `server.js`, `cartridge-core.js`, `nethack-bridge.js`, `realm-cartridge.js`, `dungeon.css`, `index.html`):
    - Responsive `#death-terminal-canvas` scaling inside `.death-tombstone-split` (eliminating `1120px` overflow scrollbars that hid `#death-sketch-wrap`).
    - Guarded `renderDeathSketchIntoModal` with `_lastDeathSketchSig` so subsequent frames while dead do not overwrite Gemini illustrations or trip rate limits.
    - Unwrapped stat objects (`{ use, cur, val, top, max }`) across all 8 realms (zero `[object Object]` badges) and fixed unique boss kill grammar (`Killed by Sigmund`, not `Killed by a Sigmund`).
    - Overhauled `renderMasterworkCanvasSketch` death mode to render a chiseled tombstone memorial + slayer silhouette, styled `#chronicle-sketch-modal` lightbox, and cached AI Studio `429` cooldown (`_aiStudioDepletedUntil`) for instant Vertex AI `gemini-2.5-flash-image` routing.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS21 | Harness, ScreenContext, MenuRouter, RealmKeys, HengTranslate, 8-Pillar 3D, Foley | `[x]` |
| WS22–WS36 | Mastery, Grimoire, Viewport, LOS, Vitals, Classic Terminal (`v10.2.0`) | `[x]` |
| WS37–WS42 | Popover, Chronicle, Minimap, Zero-Parse Relay, Command Unification (`v10.8.3`) | `[x]` |
| WS43–WS46 | Showcase Overhaul, Classic Terminal Menu, Dark-Fantasy Action Architecture (`v11.1.0`) | `[x]` |
| WS47 | Zero-Flicker Menu/HUD/Action-Bar Stabilization (`M1–M6`) & `v11.1.1` Packaging | `[x]` |

## Mandatory Verification Gate
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `30/30` 3. `python tools/smoke_test.py` → `11/11` 4. `dotnet build client/angband3d.csproj` → `0/0` 5. `server/public` change → `node tools/bump_version.js <v>` + `npm run android:sync`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (ready for `v11.1.1` release commit and tag).

## Last Gate Results
- **WS46 (`v11.1.0`, 2026-10-26)**: fast `30/30` · rev6 exemplar `7/7` · e2e `4/4` · live CDP 4-realm matrix `PASS` · smoke `11/11` · dotnet `0/0`.
- **WS47 (`v11.1.1`, 2026-10-26)**: fast `30/30` · rev5/6 exemplar `8/8` (`M1–M6` 5-turn DOM identity `clearCount === 1`) · desktop & Godot C# build `0/0` · `Angband3D-Windows-x64.zip` packaged.

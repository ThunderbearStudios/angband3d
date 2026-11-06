# Execution State (Read First, Update Last)

## Active Task
**WS54 — `v11.5.5` Storefront Plaque + High Wayfinder, Sketch Loading Spinner, Maximized Death Modal, Heraldic Skin, 1st-Person Weapon Audit, D-Pad Close (`✕`), 58-Track Soundtrack & Cloud Run `2 vCPU / 2GiB` Scaling — COMPLETE**

- **Checklist** (`v11.5.5` Polish & High-Traffic Scaling):
  - [x] **Storefront Lintel Plaque + High Wayfinder (`dungeon3d.js`)**: Removed perpendicular blade sign, framed flush lintel plaque (`y=2.76m, z=1.062m`), and restored high floating `roofSprite` wayfinder (`y=4.40m`).
  - [x] **Sketch Loading Spinner & Maximized Death Modal (`index.html`, `chronicle-manager.js`, `hud.js`, `input.js`, `hud-skin.css`)**: Added `.sketch-loading-placeholder` spinner, kept `<img>` hidden until `onload`, shrank `#death-sketch-wrap` to `184px` sidebar, maximized `#death-terminal-container` (`>82%` width, `this.deathTerminal.resize()`), added `#death-term-toolbar`, and routed bare keys in Tab 0 directly to the C engine.
  - [x] **Heraldic Skin, 1st-Person Weapon Audit & D-Pad Close (`hud-skin.css`, `dungeon3d.js`, `hud.js`)**: Layered showcase art & SVG filigree on Splash/Main Menu, rotated 1st-person blades/axes forward (`Math.PI * 0.86`), stripped dagger scabbards, rebuilt coiled bullwhip (`WhipStrikeLash`), and added `#btn-dpad-close` (`✕`).
  - [x] **58-Track CC0/CC-BY Soundtrack & Cloud Run `2 vCPU / 2GiB` Scaling (`audio.js`, `server.js`, `CREDITS.md`, `LEGAL.md`)**: Added 10 OpenGameArt tracks with `getRealmMusicProfile(realm)` & live attribution, added `7-day` `Cache-Control` (HTTP 200/206), tuned session reaping (`45s`/`5m`/`20m`, `MAX_CONCURRENT_GAMES = 36`), and upgraded Cloud Run to `2 vCPU / 2GiB`.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS36 | Harness, ScreenContext, MenuRouter, RealmKeys, 8-Pillar 3D, Foley, Grimoire (`v10.2.0`) | `[x]` |
| WS37–WS47 | Popover, Chronicle, Minimap, Command Unification, Zero-Flicker HUD (`v11.1.1`) | `[x]` |
| WS48–WS54 | 8-Realm Cartridges, YASD Death Sketch, 3D Bestiary/Town/Prop/Weapon/Music/Cloud Overhaul (`v11.5.5`) | `[x]` |

## Mandatory Verification Gate (Web-Only Focus)
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `30/30` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` 5. `server/public` change → `node tools/bump_version.js <v>`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (ready for `v11.5.5` release commit and Cloud Run deploy).

## Last Gate Results
- **WS54 (`v11.5.5`, 2026-11-05)**: fast `30/30` · universal cartridge `9/9` · LOC budget `PASS` · version sync `PASS` (`11.5.5`).

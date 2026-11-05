# Execution State (Read First, Update Last)

## Active Task
**WS50 — `v11.5.1` 8-Realm Mastery, Medieval Town Storefronts/Roofs, Braided Whip Viewmodel & Dark-Fantasy Scene Sketches — COMPLETE**

- **Checklist** (`v11.5.1` Overhaul):
  - [x] **Pillar 1 & 2 (Web-Only Focus, Green CI & Fast Cloud Build Overlay)**: Retired `.apk` / `.exe` / Godot C# CI jobs; deleted `7.05 GB` local build/music bloat; added `.dockerignore`, optimized `.gcloudignore`, multi-stage `server/Dockerfile`, and cached `cloudbuild.yaml` overlay.
  - [x] **Pillar 3 (Intelligent, Varied & Obvious 8-Realm Chargen)**: Added `RealmCartridge.createRandomBirthPlanner(realmId, rngOrPreset)` (`random`, `melee`, `ranged`, `magic`) with point-buy allocation (`Sil-Q`, `FCB`, `Hengband`, `Angband`), `stepQuickBirth()`, and `#terminal-birth-helper-bar`.
  - [x] **Pillar 4 (Authentic 8-Realm Mechanics, Equipment AC/EV & Hunger Clock)**: Dynamic equipment AC/EV/weapon-dice combat math, nutrition decay + HUD status badges (`Hungry`, `Weak`, `Starving`), Brogue Scroll of Enchantment item upgrades, and signature monster traits (`cartridge-core.js`, `nethack-bridge.js`).
  - [x] **Pillar 5 (High-Craft 3D Bestiary, 4-Model Canine Pack, Braided Whip Viewmodel & Medieval Town Storefronts)**: Promoted 33 stranded models/textures; wired local PBR sets (`T_Plaster`, `T_WoodTrim`, `T_RoundTiles`) and Poly Haven `large_castle_door` normal/ARM maps; upgraded Town Shop Buildings with half-timbered oak framing (`townTimberMesh`), 4-tier pitched shingle roofs (`townRoofMesh`), sloped guild awnings (`shopAwningMesh`), carved oak storefronts (`shopFrameMesh`), illuminated guild signboards, 3D storefront lanterns (`ph_lantern`) + display wares (`storefrontPropsGroup`), and braided leather bullwhip (`createWhipViewmodelMesh`).
  - [x] **Pillar 6 (Zero-Memorization HUD, Restored Target Card, Minimap Beacons & Fast Dark-Fantasy Scene Sketches)**: Restored `#reticle-target-card`, Minimap beacons, and realm-adaptive `#btn-stair`; routed `/api/chronicle/sketch` directly to Vertex AI `gemini-2.5-flash-image` (`~6s`) and stripped stat/inventory table bloat from Death & Tome Scene Sketches (`chronicle-manager.js`).
  - [x] **Pillar 7 (48-Track Jukebox, Contextual Music Director & 101-File Foley)**: Promoted 48 MP3/OGG tracks + 23 WAV SFX; added in-menu Jukebox inside `#quick-volume-popover`, `updateContextualMusic(frame, activeRealm)`, and 8 realm SFX methods (`audio.js`, `app.js`, `dungeon3d.js`).
  - [x] **Pillar 8 (`PUB-PII-01` Anonymity & Documentation Sync)**: Scrubbed personal name references across code/tests and updated `README.md`, `AGENTS.md`, `docs/STATE.md`, `CHANGELOG.md`, and `docs/ARCHITECTURE.md` to `v11.5.1`.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS36 | Harness, ScreenContext, MenuRouter, RealmKeys, 8-Pillar 3D, Foley, Grimoire (`v10.2.0`) | `[x]` |
| WS37–WS47 | Popover, Chronicle, Minimap, Command Unification, Zero-Flicker HUD (`v11.1.1`) | `[x]` |
| WS48–WS50 | 8-Realm Cartridges, YASD Death Sketch, 3D Bestiary/Town/Whip Overhaul, Jukebox, Chargen & HUD (`v11.5.1`) | `[x]` |

## Mandatory Verification Gate (Web-Only Focus)
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `30/30` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` 5. `server/public` change → `node tools/bump_version.js <v>`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (ready for `v11.5.1` release commit and Cloud Run deploy).

## Last Gate Results
- **WS50 (`v11.5.1`, 2026-11-05)**: fast `30/30` · universal cartridge `9/9` · smoke `11/11` · LOC budget `PASS` · version sync `PASS` (`11.5.1`).

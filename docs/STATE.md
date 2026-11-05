# Execution State (Read First, Update Last)

## Active Task
**WS53 — `v11.5.4` Contextual Music Director, Programmatic Realm Hooks, "Resume Default Music", Natural Stone Cornice Roofs & 3D Architectural Shop Signboards — COMPLETE**

- **Checklist** (`v11.5.4` Polish):
  - [x] **Automatic Contextual Music Director & Programmatic Realm Hooks (`audio.js`, `app.js`, `index.html`)**: Fixed `_initThemeDecks()`, `_syncThemeVolume()`, and `#btn-top-music` so opening the Music Jukebox drawer never mutes background music and `'jukebox'` mode auto-starts on load/gesture; added `resumeDefaultMusic()` and `#btn-music-resume-default` (`🎭 Resume Default Music (Auto)`) to return from manual track/shuffle selection to automatic realm/level music; added `resolveProgrammaticMusicTrack()` so programmatic realm hooks (`frame.music`, `frame.bgm`, `frame.musicCue`, store `build.mp3`, arena `arena.mp3`, boss `The_Serpent_of_Chaos.mp3` / `battle.mp3`, level feelings `feel1.mp3` / `feel2.mp3`, and realm/depth tiers) automatically play in the background while keeping `yasd_theme.mp3` auto-playing only on Menu/Death and selectable in the Jukebox.
  - [x] **Natural Dark-Stone Cornice Roofs & 3D Architectural Shop Signboards (`dungeon3d.js`)**: Replaced the 4-tier stepped red voxel pyramid `townRoofGeo` (`local_round_tiles`) and orange-striped `townTimberMaterial` (`local_wood_trim`) with a flush, continuous dark-slate & dressed-stone parapet cornice (`local_rock_trim`) and dark stone quoins; replaced camera-rotating `THREE.Sprite` shop signs (which clipped into walls when viewed down narrow streets) with fixed-orientation 3D Architectural Storefront Fascia Plaques + Double-Sided Projecting Tavern Blade Signs aligned to `doorYaw`.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS36 | Harness, ScreenContext, MenuRouter, RealmKeys, 8-Pillar 3D, Foley, Grimoire (`v10.2.0`) | `[x]` |
| WS37–WS47 | Popover, Chronicle, Minimap, Command Unification, Zero-Flicker HUD (`v11.1.1`) | `[x]` |
| WS48–WS53 | 8-Realm Cartridges, YASD Death Sketch, 3D Bestiary/Town/Prop/WebGL/Music Overhaul (`v11.5.4`) | `[x]` |

## Mandatory Verification Gate (Web-Only Focus)
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `30/30` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` 5. `server/public` change → `node tools/bump_version.js <v>`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (ready for `v11.5.4` release commit and Cloud Run deploy).

## Last Gate Results
- **WS53 (`v11.5.4`, 2026-11-05)**: fast `30/30` · universal cartridge `9/9` · LOC budget `PASS` · version sync `PASS` (`11.5.4`).

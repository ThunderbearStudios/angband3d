# Execution State (Read First, Update Last)

## Active Task
**WS92 — `v13.1.0` Photogrammetry 3D Mineral Veins, Rigged 3rd-Party Bestiary, Grid-Free Floors, Broad-Face Blades & Zero Floor Clutter — COMPLETE (`main` @ `v13.1.0`)**

- **Checklist** (`v13.1.0`):
  - [x] **Photogrammetry 3D Mineral Veins & Zero Floor Clutter**: `createCraggyVeinWallGeometry` (`14x18` edge-pinned 3D heightmap displacement), crevice-locked `MAGMA`/`QUARTZ`/`GOLD SEAM`/`GEM SEAM` shaders bound to CC0 PolyHaven `marble_cliff_01` & `marble_cliff_02` (`emissiveMap = null`), and `initDungeonSetDressing`/`emitDungeonSetDressing` zero-clutter enforcement (`_setDressingMeshes = []`).
  - [x] **Dark-Fantasy 3rd-Party Bestiary & Skinned Centering**: Upgraded `29` bestiary GLBs + `2` item GLBs (`<= 512x512` embedded PNGs, `test_bestiary_no_aislop.js`), volumetric `env_ooze_mound`, animated `bestiary_vortex`, craggy `rock_07` rubble, and post-yaw `_computeTrueSkinnedBoundingBox(pivot)` centering in `normalizeWrapper`.
  - [x] **Grid-Free Floors, Raised Stairwell Parapets & Broad-Face Blades**: Exact `cellSize` floor abutment (`colors.fill(1.0)`), cursor-only range grid, zero hover breadcrumbs, `+0.15m` stairwell parapets, unified `+0.68` viewmodel blade yaw, and brushed steel tuning on `ph_katana`.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0-WS87 | 9 Realms, Scanned Masonry, Town Solid-Rect Roofs, Splash Fix (`v12.0.0-v12.3.2`) | `[x]` |
| WS88-WS90 | `v12.3.4-v12.3.8` Vertex Sketch/TTS, Msg Dedupe, 3D Visuals & `yasd3d.com` Enforcement | `[x]` |
| WS91 | `v13.0.0-v13.0.2` 9-Realm Parity, 3rd-Party Bestiary, Storefront Text & 2-Step Main Menu | `[x]` |
| WS92 | `v13.1.0` Photogrammetry Veins, Rigged Bestiary Overhaul, Clean Floors & Broad Blades | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` (`45/45`) 2. `node server/test/server_test.js` (`23/23`) 3. `python tools/smoke_test.py` (`11/11`) 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` (`v13.1.0`).

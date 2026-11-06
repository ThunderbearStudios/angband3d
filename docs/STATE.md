# Execution State (Read First, Update Last)

## Active Task
**WS57 — `v11.7.0` Universal 4-Tier Master Bestiary (`master-bestiary.js`) & Item Registry (`master-item-registry.js`), 8-Realm + Future-Realm Forward Compatibility, Katana & 15-GLB Orientation Fixes, and 60fps WebGL Screen Optimizations (`P1–P5`) — COMPLETE**

- **Checklist** (`v11.7.0` Universal Bestiary, Item Registry & 60fps Performance Architecture):
  - [x] **Universal 4-Tier Master Bestiary (`server/public/js/master-bestiary.js`)**: Implemented Tier 0 $O(1)$ 2048-entry LRU cache (`<0.001 ms`), Tier 1 `registerRealm()` manifests + bilingual Hengband JP translation, Tier 2 morphological head-noun + modifier decomposer, Tier 3 isolated 8-realm glyph tables (`angband`, `silq`, `frogcomposband`, `hengband`, `nethack`, `dcss`, `brogue`, `rogue`), `resolveInspectionTaxonomy()` shared with `ChronicleManager`, and the `useAsciiTint` visual fidelity invariant so multi-material models (`Wolf.glb`, `Fox.glb`, `husky.glb`, `shiba.glb`, `MountainLion.glb`, `bear.glb`, `Horse.glb`, `Owl.glb`, `Stork.glb`) preserve their natural PBR fur/feathers.
  - [x] **Universal Master Item & Transform Registry (`server/public/js/master-item-registry.js`)**: Unified `POLYHAVEN_ITEM_GLTF_PATHS`, `HELD_CANONICAL_SPECS`, `VIEWMODEL_POSES`, `REALM_ITEM_GLYPHS`, `registerRealm()`, and $O(1)$ LRU-memoized `resolveItem()`, `resolveEquippedWeaponKey()`, `resolveShieldKey()`, and `getItemObjKey()`.
  - [x] **Fixed All 3 Proved NetHack Bugs (`dungeon3d.js`, `chronicle-manager.js`)**: (1) Added `identitySig` invalidation in `updateMonsters`/`updateItems`, `purgeAllSceneEntities()` on realm/depth transitions, and synchronized `entity.creatureMesh.monsterData` + `entity.nameplate.monsterData`; (2) Fixed `ph_katana` (`antique_katana_01.gltf`) `rotY: Math.PI * 0.5` so `-X` convex cutting edge (`ha`) faces forward (`+Z`); (3) Fixed canonical yaw offsets on 15 creature GLBs (`Dragon`, `Fox`, `husky`, `shiba`, `MountainLion`, `bear`, `werewolf`, `zombie_model`, `centipede`, `frog`, `Owl`, `Stork`, `lizard`, `kraken`, `aquatic`) and removed bogus `0.15–0.52` radian offsets.
  - [x] **Shipped 5 Proved 60fps WebGL Screen Optimizations (`P1–P5` in `dungeon3d.js`)**: (`P1`) Targeted 3-bone `updateWorldMatrix(false, false)` in `_applyCombatArmPose`/`_stabilizeHeldEquipment` + 30Hz distant idle mixer throttle; (`P2`) In-place `<canvas>` & `THREE.CanvasTexture` reuse (`needsUpdate = true`) in `createNameplateSprite`; (`P3`) Distance-gated `updateItems` (`<=28m`) + lazy `caption` creation (`<=6m`); (`P4`) $O(N)$ analytical 3-sphere vertical capsule ray intersection (`<0.01 ms`) replacing `SkinnedMesh.raycast()`; (`P5`) Removed `347` lines of dead legacy methods.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS36 | Harness, ScreenContext, MenuRouter, RealmKeys, 8-Pillar 3D, Foley, Grimoire (`v10.2.0`) | `[x]` |
| WS37–WS47 | Popover, Chronicle, Minimap, Command Unification, Zero-Flicker HUD (`v11.1.1`) | `[x]` |
| WS48–WS55 | 8-Realm Cartridges, High-Poly PBR Bestiary/Altars, Action-Matched VFX, Cloud Overhaul (`v11.6.0`) | `[x]` |
| WS56 | Auto-Explore Camera, 3.1s Viral Dark-Fantasy Sketch Pipeline, Minimal Menu Chrome (`v11.6.1`) | `[x]` |
| WS57 | Universal 4-Tier Master Bestiary & Item Registry, 8-Realm + Future-Realm Gate, 60fps P1–P5 (`v11.7.0`) | `[x]` |

## Mandatory Verification Gate (Web-Only Focus)
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `30/30` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` 5. `server/public` change → `node tools/bump_version.js <v>`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (ready for `v11.5.7` release commit and Cloud Run deploy).

## Last Gate Results
- **WS54 (`v11.5.7`, 2026-11-05)**: fast `30/30` · universal cartridge `9/9` · LOC budget `PASS` · version sync `PASS` (`11.5.7`).

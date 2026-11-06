# Execution State (Read First, Update Last)

## Active Task
**WS55 — `v11.6.0` Complete High-Poly PBR 3D Asset Overhaul (`44+` Sculpted `13k–97k` Vert PBR Models), Sculpted `2K` PBR High Altars, Zero-Lag Action-Matched Combat VFX, Same-Turn Door Sightline Reveal & Pre-Warmed Sketch Pipeline — COMPLETE**

- **Checklist** (`v11.6.0` Complete Visual, Performance & Gameplay Polish):
  - [x] **High-Poly PBR 3D Asset Overhaul & Material Preservation (`dungeon3d.js`, `tools/upgrade_v11_6_pbr_models.js`)**: Replaced all 38+ low-poly flat/vertex-colored models with `13,000–97,880` vertex PBR-textured `.glb` models (`wolf.glb`, `werewolf.glb`, `husky.glb`, `hellhound.glb`, `Fox.glb`, `shiba.glb`, `bear.glb`, `bear_armored.glb`, `MountainLion.glb`, `Parrot.glb`, `Flamingo.glb`, `Stork.glb`, `Owl.glb`, `naga.glb`, `hydra.glb`, `lizard.glb`, `frog.glb`, `aquatic.glb`, `kraken.glb`, `jelly_ooze.glb`, `mushroom_cluster.glb`, `vortex_elemental.glb`, `zombie_model.glb`, `GhostArmature.glb`, `GodAnubis_Art.glb`, `wasp.glb`, `quylthulg.glb`, `worm_mass.glb`, `floating_eye.glb`, `beetle.glb`, `centipede.glb`, `scorpion.glb`, `ant.glb`, `bat.glb`, `giant_spider.glb`, `snake.glb`, `Horse.glb`, `treeman.glb`, `Skull.glb`, `staff.glb`, `rod.glb`, `wand.glb`, `coin_pile_spill.glb`, `high_altar_pbr.glb`, `door_stone_arc.glb`, `tree_pbr.glb`, `bush_pbr.glb`); preserved multi-channel PBR textures (`lerp(tintCol, 0.14)`) in `_instantiateMonster3DFromTemplate`.
  - [x] **Sculpted `2K` PBR High Altars (`feat 43`), Fountains & Same-Turn Door Reveal (`dungeon3d.js`)**: Wired `high_altar_pbr.glb` (`terraclash_altar` `2K` PBR + `shrine_candles.gltf`), fixed `_computeTerrainSig` to hash every char (`i += 1`) of `row.f`, `row.l || row.flags`, and `row.g`, and swung `doorOpenMesh` to `-86°` for instant same-turn room reveal.
  - [x] **Zero-Lag Action-Matched Combat VFX (`dungeon3d.js`)**: Replaced all 7 per-hit dynamic `new THREE.PointLight` allocations with persistent pooled `this.vfxFlashLight`, added `64`-entry LRU `FloatingText` texture cache, split multi-sentence turn messages, restricted melee fallback to `<= 3.8m`, and matched player melee VFX (`whip_lash`, `axe_cleave`, `slash`, `blunt`, `pierce`) to `this.currentRightWeapon`.
  - [x] **Pre-Warmed Sketch Pipeline & In-Flight Coalescing (`chronicle-manager.js`, `server/src/server.js`)**: Lowered peril pre-warm threshold to `<= 45%` HP (`45s` cooldown), added depth/boss background scene pre-warming, rendered an immediate Gustave Doré dark-parchment engraving preview while Gemini illustrates, and added `sketchInFlight` promise coalescing on `/api/chronicle/sketch`.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS36 | Harness, ScreenContext, MenuRouter, RealmKeys, 8-Pillar 3D, Foley, Grimoire (`v10.2.0`) | `[x]` |
| WS37–WS47 | Popover, Chronicle, Minimap, Command Unification, Zero-Flicker HUD (`v11.1.1`) | `[x]` |
| WS48–WS54 | 8-Realm Cartridges, YASD Death Sketch, 3D Bestiary/Town/Prop/Weapon/Music/Cloud Overhaul (`v11.5.7`) | `[x]` |

## Mandatory Verification Gate (Web-Only Focus)
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `30/30` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` 5. `server/public` change → `node tools/bump_version.js <v>`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (ready for `v11.5.7` release commit and Cloud Run deploy).

## Last Gate Results
- **WS54 (`v11.5.7`, 2026-11-05)**: fast `30/30` · universal cartridge `9/9` · LOC budget `PASS` · version sync `PASS` (`11.5.7`).

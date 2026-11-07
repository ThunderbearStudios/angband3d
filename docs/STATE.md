# Execution State (Read First, Update Last)

## Active Task
**WS64 — `v11.8.7` Realm, Lore, Bestiary, Companion & Sketch Accuracy Overhaul — COMPLETE**

- **Checklist** (`v11.8.7` Realm, Lore, Bestiary, Companion & Sketch Accuracy Overhaul):
  - [x] **Cross-Realm Glyph Disambiguation (`classifyCreature(monster, realmKey)`)**: Consults `MasterBestiary.resolve(monster, glyph, rk)` and explicit non-vocal families (`1A`–`1L`) before sentient vocal glyph checks so `'d'`, `'C'`, `'t'`, `'f'`, `'b'`, `'m'`, `'M'`, `'s'`, `'S'`, `'L'`, `'E'`, `'I'`, `'P'`, `'w'`, `'g'` never collide across the 9 realms (e.g., NetHack `'d'` `little dog (tame)` is `tame_canine` (`isVocal: false`), never a vocal `'d'` Angband Dragon/Wyrm).
  - [x] **Tame Companion & Peaceful NPC Awareness (`detectCreatureAttitude`, `resolveCreatureState`, `resolveCreatureEncounter`, `resolveParleyOutcome`, `chatWithCreature`)**: Strips status suffixes (`(tame)`, `(peaceful)`, `(ally)`), guarantees `0ms` non-vocal animal responses (`"Woof! Yip!"`, `"Prrrrr... mrow!"`, `"Whinny-huff!"`), and renders dedicated `🐾 Companion` cards with `🐾 Praise`, `🦴 Instincts`, and `📜 Companion Lore` actions.
  - [x] **9-Realm Depth Formatting (`formatRealmDepth`) & Tactical Bestiary (`resolveTacticalMonsterInsight`)**: Formats canonical floor badges (`Dlvl 1` in NetHack, `D:1` in DCSS, `Depth 1` in Brogue, `Level 1` in Rogue, `Floor 1` in RYOD, `-${d*50}ft` in Sil-Q, `${d*50}ft` in Angband/FCB/Hengband) and expands Lorekeeper tactical insights across all 9 realms (`bullwhip` / `pick-axe` weapon archetypes included).
  - [x] **Tome Sketch Bestiary & Companion Visual Grounding (`buildHeroSketchContext`, `MasterBestiary.describeVisualAnatomy`, `renderMasterworkCanvasSketch`)**: Routes tame companions strictly into `visibleAllies` with exact 3D model anatomy descriptions and class visual attire (`Archeologist` fedora, leather jacket, bullwhip, brass lantern).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS36 | Harness, ScreenContext, MenuRouter, RealmKeys, 8-Pillar 3D, Foley, Grimoire (`v10.2.0`) | `[x]` |
| WS37–WS47 | Popover, Chronicle, Minimap, Command Unification, Zero-Flicker HUD (`v11.1.1`) | `[x]` |
| WS48–WS56 | 8-Realm Cartridges, PBR Bestiary/Altars, Action VFX, Cloud & Sketch (`v11.6.1`) | `[x]` |
| WS57–WS58 | Universal 4-Tier Master Bestiary, Item Registry, Menu/Action/VFX Abstraction (`v11.7.1`) | `[x]` |
| WS59 | RYOD ("Roll Your Own Dungeon") World Forge, Self-Hydrating Saves & Playability Bot (`v11.8.1`) | `[x]` |
| WS60–WS61 | Main Menu Overhaul, Grey-Slate RYOD Forge, 8 Mutators & 9-Realm Chronicle (`v11.8.4`) | `[x]` |
| WS62 | Global 3-Layer Sculpted PBR Consecrated High Altars & Sparkling Magic Fountains (`v11.8.5`) | `[x]` |
| WS63 | Official Art, YASD3D.com Icon Badge Suite & Widescreen Splash Screen Overhaul (`v11.8.6`) | `[x]` |
| WS64 | Realm, Lore, Bestiary, Companion & Sketch Accuracy Overhaul (`v11.8.7`) | `[x]` |

## Mandatory Verification Gate (Web-Only Focus)
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `34/34` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` 5. `server/public` change → `node tools/bump_version.js <v>`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- Ready for `v11.8.4` release commit and Cloud Run deploy.

## Last Gate Results
- **WS61 (`v11.8.4`, 2026-11-07)**: fast `34/34` (`0` failed) · `test_ryod_engine_and_handshake.js` `259/259` · `probe_ryod_play.js` `PASS` (`0` console errors) · LOC budget `PASS` (`dungeon.css` `9791/9850`, `index.html` `1396/1545`) · version sync `PASS` (`11.8.4`).

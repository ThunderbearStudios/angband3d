# Execution State (Read First, Update Last)

## Active Task
**WS91 — `v13.0.2` 9-Realm Mechanical Parity, 3rd-Party Bestiary, Always-Readable Storefront Text & 2-Step Full-Viewport Main Menu — COMPLETE (`main` @ `v13.0.2`)**

- **Checklist** (`v13.0.0-v13.0.2`):
  - [x] **9-Realm Mechanical & Manual Parity (`v13.0.0`)**: Rogue 5.4 descending AC (`swing()`, Aquator 0-HP rust, Scare Monster floor sanctuary & crumble, secret doors, Amulet gate); NetHack 3.6.7 13 roles, `stats.cha`/`align`/`hunger_state`, cursed weld-locks, atomic `#command` worker dispatch; DCSS `AC/EV/SH`, Octopode 8-ring slots, `m`/`^`/`A`/`V`/`v`/`e`/`E`; Brogue `level=0`/`exp=0` & specials; C/C++ bridge `melee_to_h`/`melee_to_d`/`blows`/`total_weight`/`disp` across all 4 engines; `RealmCartridge v3`, descending-AC `ItemSheet.compareWithEquipped`, and `YasdAutopsy`.
  - [x] **100% 3rd-Party Sculpted Bestiary & Sil-Q UX (`v13.0.1`)**: Restored/baked 18 genuine 3rd-party GLBs (`<=512x512` PBR + normal maps, zero procedural monsters), `+Z` `yawOffset` alignment, `5,174` mapped entries verified (`audit_9realm_bestiary_exhaustive.js`), Sil-Q Quick Start XP pre-spend (`4,800/5,000`), turn-0 safety, full-width `EVN / PROT`, and `SKILLS [Tab]` vs `CLASSIC [Alt+T]`.
  - [x] **Storefront Fascia + Always-Readable Floating Store Text & 2-Step Main Menu (`v13.0.2`)**: Flush `StorefrontFasciaSign` + fog-immune `StorefrontFloatingLabel` (`1024x192`, `0..64m`), `1480px` 2-step Main Menu (`Step 1` `3x3` showcase, `Step 2` dossier + stakes + `[1]-[4]` launchpad + `#btn-menu-fullscreen`), race-free `checkSavesReqSeq`, and universal Fullscreen (`F11`/`Alt+Enter`).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0-WS87 | 9 Realms, Scanned Masonry, Town Solid-Rect Roofs, Splash Fix (`v12.0.0-v12.3.2`) | `[x]` |
| WS88-WS90 | `v12.3.4-v12.3.8` Vertex Sketch/TTS, Msg Dedupe, 3D Visuals & `yasd3d.com` Enforcement | `[x]` |
| WS91 | `v13.0.0-v13.0.2` 9-Realm Parity, 3rd-Party Bestiary, Storefront Text & 2-Step Main Menu | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` (`44/44`) 2. `node server/test/server_test.js` (`23/23`) 3. `python tools/smoke_test.py` (`11/11`) 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` (`v13.0.2`).

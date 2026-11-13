# Execution State (Read First, Update Last)

## Active Task
**WS85 — `v12.3.0` 8-Workstream Architecture & Playability Overhaul — COMPLETE (`feat/v12.2-overnight-overhaul` @ `v12.3.0`)**

- **Checklist** (`v12.3.0` Release):
  - [x] **WS-1 Unified Vertex Failover & YASD Woodcut Sketch Composer**: Shared `_aiStudioDepletedUntil`, skip metadata probe off-GCP, `MINIMAL` thinking on `gemini-nano-banana-2.1`, full `sha256(realm + ':' + prompt)` cache key, extracted `yasd-sketch-composer.js` procedural woodcut composer + working `🔄 Regenerate AI Illustration` flow (`⊢ PROVED`).
  - [x] **WS-2 Chronicle Narrator (`Enceladus` Main + Color Counsel Voices)**: Locked `Enceladus` as main narrator across 9 realms, wired distinct mentor/altar voices (`Orus`, `Charon`, `Schedar`, `Iapetus`, `Sadachbia`, `Algenib`, `Gacrux`), purged female `Sulafat` from male pools, fixed `frogcomposband -> 'amber'` (`⊢ PROVED`).
  - [x] **WS-3 60fps Smooth Movement & Adaptive DPR**: Adaptive `renderGovernor.getEffectivePixelRatio` (`_adaptiveDpr`), continuous `_strideChain` stride, and `UI_SEQ_IN_MEMO_SIG` compliance (`⊢ PROVED`).
  - [x] **WS-4 Town Cluster Architecture & Cross-Realm Storefronts**: Added `dungeon3d-town.js`, rebuilt `hengband.exe`, and specialized Town signage across Angband, Hengband/FCB, and Cartridge towns (`⊢ PROVED`).
  - [x] **WS-5 Hengband Bilingual Polish & Fixture Save Isolation**: Enhanced `heng-translate.js` notifications and filtered `smoke_`/`demo_`/`TestOne` fixture saves in `save-vault-routes.js` (`⊢ PROVED`).
  - [x] **WS-6 Cross-Realm Action Parity & Contextual Pills**: Wired NetHack `#pray`/`#offer`/`#dip`/`#chat` in `ActionCatalog`/`RealmKeys`/`CommandDispatcher` and memoized `#btn-context-tile` & `#btn-context-alt` in `input.js` (`⊢ PROVED`).
  - [x] **WS-7 1-Hop Splash -> Main Menu, Slide-Over Atlas & 9x `16:9` Plates**: Routed `enterFromSplash()` 1-hop to `showMainMenu()`, styled `#realm-selector-modal` as right slide-over drawer, generated & converted `silq.webp`, `brogue.webp`, `frogcomposband.webp`, removed `"Enceladus"` from `REALM_DATA.ryod` (`⊢ PROVED`).
  - [x] **WS-8 RYOD 3.0 Casual Arcade Toybox**: Added 3-Zone Toybox (`#btn-ryod-daily-blitz`, 6 `ARCADE_ADVENTURES`, stackable `0..3` Wild Twists including `loot_pinata`, `boss_rush` 8F Champions, `vampire_thirst`, `floor_collapse`, collapsed `#ryod-tinker-drawer`), fixed non-Pantheon `prayAtAltar()`, wired `activeSong`/`activeStance` (`⊢ PROVED`).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS84 | 9 Realms, Scanned Masonry, Sightlines, Save Vaults, Stability (`v12.0.0–v12.2.2`) | `[x]` |
| WS85 | `v12.3.0` 8-Workstream Overhaul (Vertex Failover, Narrator, Town, Actions, 1-Hop Menu, RYOD 3.0) | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` → `40/40 PASS` 2. `node server/test/server_test.js` → `22/22 PASS` 3. `python tools/smoke_test.py` → `11/11 PASS` 4. `node tools/check_loc_budget.js; node tools/check_version_sync.js; node tools/check_android_sync.js` (`v12.3.0` / `0` violations).

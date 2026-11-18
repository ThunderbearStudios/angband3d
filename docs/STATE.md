# Execution State (Read First, Update Last)

## Active Task
**WS94 — `v13.1.2` 9-Realm Pre-Embark Character Review, Cold-Cache 2K PBR Buffer Gate & Mobile Main Menu Scroll — COMPLETE (`main` @ `v13.1.2`)**

- **Checklist** (`v13.1.2`):
  - [x] **9-Realm Pre-Embark Character Review & Clean Realm Switcher**: Paused Quick-Play / Random Hero on complete stats & equipment review sheets (`phase === 'setup'`, `isBirthReviewActive() === true`) across all 9 realms (`birth-review.js`, `app.js`, `input.js`, `cartridge-core.js`, `nethack-bridge.js`, `engine-worker.js`, `local_bridge.js`, `network.js`, `save-vault-client.js`, `server.js`) with Start `[Enter]`, Reroll `[R]`, clean Realm Switcher without orphan saves, Custom `[C]`, and Main Menu `[Esc]`.
  - [x] **Cold-Cache 2K PBR Pre-Buffering, GPU Upload Gate & Native `<progress>`**: Added per-file texture load progress tracking, `<progress id="loading-native-progress">` status announcements, `_suppressMenuPbrLoads` title diorama gate, core >=1024px `tier1Tasks` + `renderer.initTexture(tex)` upload before dropping `#loading-overlay`, and removed inline `oncontextmenu` CSP warning.
  - [x] **Mobile Main Menu Touch-Scroll Restoration**: Restored vertical touch-panning scroll in portrait (`390×844`) and landscape (`844×390`) (`hud-skin.css`) with flex scroll column (`align-items: safe center`), `overflow: visible`, and button wrapping.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0-WS87 | 9 Realms, Scanned Masonry, Town Solid-Rect Roofs, Splash Fix (`v12.0.0-v12.3.2`) | `[x]` |
| WS88-WS90 | `v12.3.4-v12.3.8` Vertex Sketch/TTS, Msg Dedupe, 3D Visuals & `yasd3d.com` Enforcement | `[x]` |
| WS91 | `v13.0.0-v13.0.2` 9-Realm Parity, 3rd-Party Bestiary, Storefront Text & 2-Step Main Menu | `[x]` |
| WS92 | `v13.1.0` Photogrammetry Veins, Rigged Bestiary Overhaul, Clean Floors & Broad Blades | `[x]` |
| WS93 | `v13.1.1` 2-Pane Adventurer's Codex, Novice Roguelike Primer, Controls & Live Search | `[x]` |
| WS94 | `v13.1.2` 9-Realm Pre-Embark Character Review, Cold-Cache 2K PBR Buffer Gate & Mobile Scroll | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` (`45/45`) 2. `node server/test/server_test.js` (`23/23`) 3. `python tools/smoke_test.py` (`11/11`) 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` (`v13.1.2`).

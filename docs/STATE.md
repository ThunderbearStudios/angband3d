# Execution State (Read First, Update Last)

## Active Task
**WS88-WS89 — `v12.3.6` Multi-Realm Overhaul & Playtest Closure — COMPLETE (`main` @ `v12.3.6`)**

- **Checklist** (`v12.3.4-v12.3.6` Overhaul & Playtest Fixes):
  - [x] **Vertex AI Sketch & Chronicle Audio (`server.js`, `sketch-service.js`, `chronicle-manager.js`, `chronicle-audio.js`)**: Normalized `gemini-nano-banana-2.1` -> `gemini-3.1-flash-image`, fixed Windows `gcloud.cmd` ADC spawn, withheld fallback text on real `HTTP 200` sketches, added fast Sentence-1 TTS & prewarm, bidirectional Edge/Gemini Vertex fallback, and `AudioContext.resume()`.
  - [x] **HUD Message Log Deduplication (`hud.js`)**: Added `_normFeedText` & `_isRedundantTermRow0` (exact, 80-col truncation, concatenation, repetition, and `localizeGameMessage`).
  - [x] **Town Roofs, Shop Wayfinders & Outer Walls (`dungeon3d-town.js`, `dungeon3d-proc-textures.js`, `dungeon3d.js`)**: Roofed all solid-rect + `1x1` interior clusters, routed outer granite/permanent walls (`21`/`22`) to battlements, upgraded overhead store signs & `512x512` slate/kawara tiles, and synced `bark_willow_02` + quintic FBM sky.
  - [x] **Chasms, Lava, Woodland & Realistic Beasts (`dungeon3d.js`, `dungeon3d-environment.js`, `master-bestiary.js`)**: Sealed Bottomless Pits (`feat === 41`) with textured rocky cliffs + horizontal void floor, upgraded molten basalt lava (`23|82|83`), botanical woodland foliage, removed render jitter, and restored realistic PBR beasts.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0-WS87 | 9 Realms, Scanned Masonry, Town Solid-Rect Roofs, Splash Fix (`v12.0.0-v12.3.2`) | `[x]` |
| WS88-WS89 | `v12.3.4-v12.3.6` Vertex Sketch/TTS, Msg Dedupe, Town/Chasm/Lava/Botanical/Beasts | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` (`42/42`) 2. `node server/test/server_test.js` (`23/23`) 3. `python tools/smoke_test.py` (`11/11`) 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` (`v12.3.6`).

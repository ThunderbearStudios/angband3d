# Execution State (Read First, Update Last)

## Active Task
**WS95 — `v13.1.4` Reddit Traffic, Linux `0.<slot>` Save Parity, `tmpfs` Staging & Cloudflare Edge Hardening — COMPLETE (`main` @ `v13.1.4`)**

- **Checklist** (`v13.1.4`):
  - [x] **Linux `0.<slot>` Save Parity (`domain-config.js`, `save-vault-routes.js`, `server.js`)**: Unified `stripUnixUidPrefix` and `0.<slot>` resolution across `/api/saves`, `/api/saves/:name`, `restoreLivingCheckpoint*`, delete, `hydrateSlotToDirAsync`, and `mirrorStagedSavesToPersistent` (`frogcomposband` & `silq` UID saves now visible, downloadable, and restorable).
  - [x] **Zero-Stall Server & GCS FUSE Offload**: Staged all 4 C/C++ engines (`angband`, `frogcomposband`, `silq`, `hengband`) in `/tmp` (`15s` non-forced mirror throttle, `12`-cmd autosave), added singleflight `30s` `/api/saves` caching, RAM-backed `/api/saves/sync` snapshots, `hasFloorSidecarsForRealm` guards, memoized `/api/realms` & engine metadata, async WS connect/save checks, `staticHotMap` + RAM `.br` serving, `90s`/`20s` zombie grace reaping, and `25s` client `visibilitychange` snapshot throttle.
  - [x] **Cloudflare Edge `Cache-Control` & `24/24` Server Tests (`edge/worker.js`, `server_test.js`)**: Restored `public, max-age=31536000, immutable` on `?v=` bundles & static metadata paths in `edge/worker.js`, and added Test 24 (`0.<slot>` parity, `20x` singleflight burst, in-memory `/api/saves/sync`).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0-WS87 | 9 Realms, Scanned Masonry, Town Solid-Rect Roofs, Splash Fix (`v12.0.0-v12.3.2`) | `[x]` |
| WS88-WS90 | `v12.3.4-v12.3.8` Vertex Sketch/TTS, Msg Dedupe, 3D Visuals & `yasd3d.com` Enforcement | `[x]` |
| WS91 | `v13.0.0-v13.0.2` 9-Realm Parity, 3rd-Party Bestiary, Storefront Text & 2-Step Main Menu | `[x]` |
| WS92 | `v13.1.0` Photogrammetry Veins, Rigged Bestiary Overhaul, Clean Floors & Broad Blades | `[x]` |
| WS93 | `v13.1.1` 2-Pane Adventurer's Codex, Novice Roguelike Primer, Controls & Live Search | `[x]` |
| WS94 | `v13.1.3` 9-Realm Pre-Embark Character Review, Cold-Cache 2K PBR Buffer Gate & Mobile Scroll | `[x]` |
| WS95 | `v13.1.4` Reddit Traffic, Linux `0.<slot>` Save Parity, `tmpfs` Staging & Edge Hardening | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` (`45/45`) 2. `node server/test/server_test.js` (`24/24`) 3. `python tools/smoke_test.py` (`11/11`) 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` (`v13.1.4`).

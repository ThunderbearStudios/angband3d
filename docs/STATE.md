# Execution State (Read First, Update Last)

## Active Task
**WS84 — `v12.2.2` Multi-Realm Stability Overhaul, Main Menu Redesign & Audio Config Fix — COMPLETE (`feat/v12.2-overnight-overhaul` @ `v12.2.2`)**

- **Checklist** (`v12.2.2` Release):
  - [x] **Sil-Q `96%` Asset-Gate Race Fix**: Added `gateSettled` + `++sceneAssetGateSeq` inside `finishAssetGate()`, guarded late `tier1Tasks` `onProgress` callbacks (`dungeon3d.js:awaitSceneAssetsReady` `gateDone` + `app.js`), and set `sw.js` `navigate` fetch to `{ cache: 'no-store' }` (`⊢ PROVED`).
  - [x] **Hengband `44%` Quick-Birth Hang Fix**: Added `-続く-` / `何かキーを押して` detection, bounded `(a-X)` / `*)` magic realm selection, signature stall-breaker rotation (`['*', 'a', 'space', 'enter', 'y', 'escape']`), and `setLoadingCurtain(false)` fallback; `12/12` live `hengband.exe` Quick-Birth trials passed (`⊢ PROVED`).
  - [x] **FrogComposBand & NetHack Movement-to-Menu Fix**: `setEngineMode` now detaches callbacks on outgoing `network` and syncs `input.network` + `quickActions.network`; `InputController` resolves live `window.__app.network`; `GameNetwork.disconnect()` sets `disposed = true` blocking zombie reconnects (`⊢ PROVED`).
  - [x] **Audio Popover Fix (`#quick-volume-popover`)**: Hoisted out of `#top-right-bar` (`z-index: 10060`) directly under `#app-container`, anchored dynamically to clicking button, outside-dismissal + Splash guard exclusions (`⊢ PROVED`).
  - [x] **2-Column Dark-Slate Main Menu Launcher (`WEB-SCOTOPIC-02`)**: Replaced cluttered strip/cards with visual 9-realm grid + `/assets/realms/<id>.webp` Hero Dossier + clear `#btn-menu-random` CTA + `#btn-menu-audio-settings` while preserving all `128/128` button IDs (`index.html` `1460/1545`, `dungeon.css` `9596/9850`) (`⊢ PROVED`).
  - [x] **Server & Client Edge TTS `403` Cooldown**: Reuses in-flight `initPromise` in `getWarmEdgeTTS`, adds 10m server + 5m client `X-TTS-Unavailable: 1` cooldown with single-line warning (`⊢ PROVED`).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS81 | 9 Realms, Scanned Masonry, Relief POM, Sightlines, Storefronts & Action Parity (`v12.0.0–v12.0.4`) | `[x]` |
| WS82 | `v12.1.0` Pre-Launch 9-Pillar Overhaul, RYOD 2.0, Hengband Bilingual, Dual-Vault Saves & RPG Cards | `[x]` |
| WS83 | `v12.2.1` Overnight Overhaul, Layer-0 3D & Non-Cancelling Loading Curtain Hotfix | `[x]` |
| WS84 | `v12.2.2` Multi-Realm Stability Overhaul, Main Menu Redesign, Audio Config Fix & TTS Cooldown | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` → `39/39` 2. `node server/test/server_test.js` → `22/22` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js; node tools/check_version_sync.js; node tools/check_android_sync.js` (`v12.2.2` / `0` violations).

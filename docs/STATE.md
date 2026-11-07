# Execution State (Read First, Update Last)

## Active Task
**WS61 — `v11.8.4` RYOD Grey-Slate Tabletop Forge Aesthetics, Cloud Run Container Path Parity, Zero-Overflow 3×2 Grid, In-Game HUD `:has()` Visibility Fix & Full RYOD Menu/Launch Audit — COMPLETE**

- **Checklist** (`v11.8.4` RYOD Grey-Slate Aesthetics, Quick-Roll/Play Fix & Deep Menu Audit):
  - [x] **RYOD Quick-Roll & Launch Fix (`server/src/cartridges/ryod-compiler.js`, `server/src/cartridges/realm-content-pool.js`, `variants/ryod/bin/ryod-bridge.js`, `server/src/cartridges/cartridge-core.js`, `cloudbuild.yaml`, `server/Dockerfile`)**: Fixed Cloud Run `/app/public/js` vs `/app/server/public/js` path resolution (`ln -sfn /app/public /app/server/public` + fallback resolution); hydrated `process.env.RYOD_CONFIG_JSON` and `-dsave=<path>` CLI flag in `ryod-bridge.js`; hoisted `seq` and `phase` ahead of `ryodMeta` in `cartridge-core.js:buildFrame` so `network.js` regex pre-parser matches on large frames.
  - [x] **Grey-Slate & Burnished Gold RYOD Forge Aesthetics (`server/public/js/ryod-forge.js`)**: Replaced warm bronze/parchment styling with site-wide Grey-Slate & Burnished Gold plates (`#0d1018` / `#12151e` / `#181d2a` / `#222838`, `rgba(212, 175, 55, 0.56)` brass borders, `#e5c158` headers, `#dce0e8` text); fixed `3×2` CSS Grid horizontal overflow (`repeat(3, minmax(0, 1fr))`, `.ryod-die-card { min-width: 0; overflow: hidden; }`, `.ryod-select-input { flex: 1 1 0%; width: 0; min-width: 0; }`) — verified `fitsViewport: true`, `hasHorizontalOverflow: false`.
  - [x] **Deep RYOD Menu, HUD & WebSocket Lifecycle Audit (`server/public/js/app.js`, `server/public/js/input.js`, `server/public/js/network.js`, `server/public/js/ryod-compiler.js`, `server/public/css/dungeon.css`)**: Added `window.RyodForge.isOpen()` keyboard guard in `input.js`; wired `.realm-card[data-realm="ryod"]` click to attune `'ryod'`, close `#realm-selector-modal`, and open `RyodForge`; fixed `returnToMainMenu` + `saveAndDisconnect` (`{ t: 'quit' }`) so rapid relaunches never clobber new sockets or leave zombie sessions; fixed `Lv:1`/`MANA:20/20` status line (`hasUndefinedInTerminal: false`), added RYOD `C` and `?` modal rows, and removed `visibility: hidden !important` from `#app-container:has(...) #hud-overlay` in `dungeon.css` to cure Chromium `:has()` container-query visibility inheritance on `#char-panel` and `#hud-footer`.
  - [x] **Automated & Headless Browser Verification (`probe_ryod_play.js`, `tools/run_tests.js`)**: Verified all 3 RYOD launch paths (`#btn-ryod-quick-dropin`, `#btn-menu-ryod-quick`, `#btn-ryod-launch`), `34/34` fast suites, `259/259` RYOD engine/handshake assertions, and headless Chrome CDP (`0` console errors).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS36 | Harness, ScreenContext, MenuRouter, RealmKeys, 8-Pillar 3D, Foley, Grimoire (`v10.2.0`) | `[x]` |
| WS37–WS47 | Popover, Chronicle, Minimap, Command Unification, Zero-Flicker HUD (`v11.1.1`) | `[x]` |
| WS48–WS56 | 8-Realm Cartridges, PBR Bestiary/Altars, Action VFX, Cloud & Sketch (`v11.6.1`) | `[x]` |
| WS57–WS58 | Universal 4-Tier Master Bestiary, Item Registry, Menu/Action/VFX Abstraction (`v11.7.1`) | `[x]` |
| WS59 | RYOD ("Roll Your Own Dungeon") World Forge, Self-Hydrating Saves & Playability Bot (`v11.8.1`) | `[x]` |
| WS60 | Main Menu Overhaul, 6-Card Hybrid RYOD Forge, 8 Mutators & 9-Realm Chronicle (`v11.8.3`) | `[x]` |
| WS61 | RYOD Grey-Slate Aesthetics, Cloud Path Parity, HUD `:has()` Fix & Deep Menu Audit (`v11.8.4`) | `[x]` |

## Mandatory Verification Gate (Web-Only Focus)
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `34/34` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` 5. `server/public` change → `node tools/bump_version.js <v>`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- Ready for `v11.8.4` release commit and Cloud Run deploy.

## Last Gate Results
- **WS61 (`v11.8.4`, 2026-11-07)**: fast `34/34` (`0` failed) · `test_ryod_engine_and_handshake.js` `259/259` · `probe_ryod_play.js` `PASS` (`0` console errors) · LOC budget `PASS` (`dungeon.css` `9791/9850`, `index.html` `1396/1545`) · version sync `PASS` (`11.8.4`).

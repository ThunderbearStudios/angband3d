# Execution State (Read First, Update Last)

## Active Task
**WS60 — `v11.8.3` Main Menu & Splash Overhaul, 6-Card Hybrid Roll-or-Pick RYOD Tabletop Forge, 8 World Mutators, 100% 9-Realm Living Chronicle & Lorekeeper Persona (`Enceladus`), Low-Latency Pre-Warming & `yasd3d.com` Production Release — COMPLETE**

- **Checklist** (`v11.8.3` Menu Overhaul, Hybrid 6-Card RYOD Forge & 9-Realm Chronicle):
  - [x] **Splash Deduplication & Main Menu Overhaul (`server/public/index.html`, `server/public/css/dungeon.css`)**: Deduplicated `Roll Your Own Dungeon` on Splash (`.splash-features-line` only); compacted Main Menu into a single-row Realm & RYOD Command Bar (`.main-menu-realm-actions`); restyled `.main-menu-card` and `.menu-option-btn` into Obsidian & Burnished Gold command plates (`WEB-SCOTOPIC-02`) with recessed keycaps (`1`–`4`) and a 3-column utility dock (`[5]`–`[7]`); reduced `dungeon.css` to `9,792 / 9,850` lines and `index.html` to `1,397 / 1,545` lines.
  - [x] **6-Card (`3×2`) Hybrid Roll-or-Pick RYOD Tabletop Forge & 8 World Mutators (`server/public/js/ryod-forge.js`, `server/public/js/realm-content-pool.js`, `server/public/js/ryod-compiler.js`, `server/src/cartridges/cartridge-core.js`)**: Every card supports both 1-click `<select>` direct-pick dropdowns and `🎲 Roll` + `🔒 Lock` + `◀/▶` steppers (`d8 3D Biome & Layout`, `d10 Bestiary & Allies`, `d8 Mythic Plot & Goal`, `d12 Hero / Avatar & Pet`, `d6 Power & Leveling`, `d8 World Mutator & Stakes`), plus `d20` Starting Fate Boons, `three_runes` victory mode, and Floor 5/10/15 Wayfarer Quartermaster outposts.
  - [x] **100% 9-Realm Living Chronicle, Lorekeeper Q&A & `Enceladus` Voice Preservation (`chronicle-store.js`, `chronicle-grounder.js`, `chronicle-llm.js`, `chronicle-manager.js`, `chronicle-audio.js`, `server.js`, `app.js`)**: Eliminated Angband default leaks across all 9 realms; wired `REALM_STORY_ARCHITECTURES`, `MYTHIC_VOWS_BY_REALM`, `ONBOARDING_TOWN_ARRIVAL`, `ONBOARDING_FIRST_DESCENT`, `buildRealmControlAndSituationBrief`, and all 45 `REALM_CHRONICLE_CHIPS`; locked `Enceladus` (`role: 'narrator'`) across all realms; capped `MAX_AUDIO_BUFFER_CACHE = 48` (`Law U4`); gated `ChronicleManager.onFrame` (`Law U3`).
  - [x] **Automated & Browser Verification (`tools/test_ryod_engine_and_handshake.js`, `tools/test_ui_surface_integrity.js`, `verify_v11_8_3_cdp.js`)**: `259/259` RYOD engine/handshake assertions, `128/128` UI surface buttons, `34/34` fast suites, `11/11` smoke tests, and headless Chrome CDP (`1440×900` & `390×844` with `0` console errors).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS36 | Harness, ScreenContext, MenuRouter, RealmKeys, 8-Pillar 3D, Foley, Grimoire (`v10.2.0`) | `[x]` |
| WS37–WS47 | Popover, Chronicle, Minimap, Command Unification, Zero-Flicker HUD (`v11.1.1`) | `[x]` |
| WS48–WS56 | 8-Realm Cartridges, PBR Bestiary/Altars, Action VFX, Cloud & Sketch (`v11.6.1`) | `[x]` |
| WS57–WS58 | Universal 4-Tier Master Bestiary, Item Registry, Menu/Action/VFX Abstraction (`v11.7.1`) | `[x]` |
| WS59 | RYOD ("Roll Your Own Dungeon") World Forge, Self-Hydrating Saves & Playability Bot (`v11.8.1`) | `[x]` |
| WS60 | Main Menu Overhaul, 6-Card Hybrid RYOD Forge, 8 Mutators & 9-Realm Chronicle (`v11.8.3`) | `[x]` |

## Mandatory Verification Gate (Web-Only Focus)
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `34/34` 3. `python tools/smoke_test.py` → `11/11` 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` 5. `server/public` change → `node tools/bump_version.js <v>`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- Ready for `v11.8.3` release commit and Cloud Run deploy.

## Last Gate Results
- **WS60 (`v11.8.3`, 2026-11-07)**: fast `34/34` (`0` failed) · `test_ryod_engine_and_handshake.js` `259/259` · `test_ui_surface_integrity.js` `PASS` · CDP `verify_v11_8_3_cdp` `PASS` (`0` console errors) · LOC budget `PASS` (`dungeon.css` `9792/9850`, `index.html` `1397/1545`) · version sync `PASS` (`11.8.3`).

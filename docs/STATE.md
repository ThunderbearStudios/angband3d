# Execution State (Read First, Update Last)

## Active Task
**WS93 — `v13.1.1` 2-Pane Adventurer's Codex, Novice Roguelike Primer, Corrected Controls & Live Search — COMPLETE (`main` @ `v13.1.1`)**

- **Checklist** (`v13.1.1`):
  - [x] **2-Pane `1440px` Adventurer's Codex & Component Redesign**: Modularized guide engine into `server/public/js/adventurer-guide.js` (~660 LOC trimmed from `app.js`), upgraded `#guide-modal` to `focusgroup="tablist nomemory"` single-row tabs + `268px` 9-realm switcher rail + `hidden="until-found"` panels, resolved `.guide-card` collision, and verified `WEB-VISUAL-GATE-05` (`0px` overflow, `0` halation) across `1920x1080`, `1440x900`, `1366x768`, and `390x844`.
  - [x] **Novice "What Is a Classic Roguelike?" Onboarding**: Tab 1 primer comparing classic roguelikes vs roguelites, 4 Pillars of Fun (`0`-Turn Look, Emergent Sim, YASD vs Checkpoints, `Alt+T` Dual-Reality CRT), 4-archetype Starter Picker, and clickable 1980–2026 History Lineage.
  - [x] **Corrected `v13.1.1` 3D Controls & Live Cross-Guide Search**: Documented accurate arrow look/strafe/diagonal/pitch, opt-in `Alt+W` WASD, `Alt+T` CRT switch, and `Tab` Grimoire controls; added `#guide-global-search` and fixed `input.js` field focus guard (`closest('input, select, textarea')`).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0-WS87 | 9 Realms, Scanned Masonry, Town Solid-Rect Roofs, Splash Fix (`v12.0.0-v12.3.2`) | `[x]` |
| WS88-WS90 | `v12.3.4-v12.3.8` Vertex Sketch/TTS, Msg Dedupe, 3D Visuals & `yasd3d.com` Enforcement | `[x]` |
| WS91 | `v13.0.0-v13.0.2` 9-Realm Parity, 3rd-Party Bestiary, Storefront Text & 2-Step Main Menu | `[x]` |
| WS92 | `v13.1.0` Photogrammetry Veins, Rigged Bestiary Overhaul, Clean Floors & Broad Blades | `[x]` |
| WS93 | `v13.1.1` 2-Pane Adventurer's Codex, Novice Roguelike Primer, Controls & Live Search | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` (`45/45`) 2. `node server/test/server_test.js` (`23/23`) 3. `python tools/smoke_test.py` (`11/11`) 4. `node tools/check_loc_budget.js && node tools/check_version_sync.js` (`v13.1.1`).

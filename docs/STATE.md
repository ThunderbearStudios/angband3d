# Execution State (Read First, Update Last)

## Active Task
**WS47 — `v11.1.1` Zero-Flicker Menu/HUD/Action-Bar Stabilization (`M1–M6`) & Resonant MCP `v2.5` Guardrail Evolution — COMPLETE**

- **Checklist** (one commit per card, red test first):
  - [x] `M1 & M2` Zero-Flicker Overlay Memoization (`prompt-mirror.js`, `item-sheet.js`, `grimoire-deck.js`, `app.js`, `dungeon.css`): Removed monotonic `frame.seq` from `_lastSig` & `toolbarSig` (`UI_SEQ_IN_MEMO_SIG`), replaced with content digests (`itemDigest`, `actDigest`, `chipDigest`, `screenDigest`), moved `skipScraping` $O(1)$ early return above `toolbarSig`, and added `.is-open-stable`.
  - [x] `M3 & M4` Action Bar & Contextual Controls Stability (`input.js`, `dungeon.css`): Replaced raw `curSp` & `hostileMonsters.length` in `evaluateActionBarContext` `stateSig` with threshold buckets, memoized `updateActionBarOverflow` on `_lastOverflowSig`, removed `frame.seq` from `updateContextualControls` `sig`, fixed `btnAttack` visibility (`contextHidden` / `realmHidden`), and locked `#btn-hero-action` `min-width: 98px`.
  - [x] `M5 & M6` In-Place HUD Drawer & Footer Reconciliation (`hud.js`, `server.js`): Reconciled `#char-extended-drawer` & `#footer-badges` child nodes in-place, memoized `footerTarget.innerHTML` on `_lastFooterTargetSig`, and added `/version.json` to `no-store` headers.
  - [x] Version bump to `11.1.1` (`node tools/bump_version.js 11.1.1` + `npm run android:sync`), packaged `dist/Angband3D-Windows-x64.zip`, and verified `test_rev5_exemplar_contracts.js` (`8/8 PASS`).

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS21 | Harness, ScreenContext, MenuRouter, RealmKeys, HengTranslate, 8-Pillar 3D, Foley | `[x]` |
| WS22–WS36 | Mastery, Grimoire, Viewport, LOS, Vitals, Classic Terminal (`v10.2.0`) | `[x]` |
| WS37–WS42 | Popover, Chronicle, Minimap, Zero-Parse Relay, Command Unification (`v10.8.3`) | `[x]` |
| WS43–WS46 | Showcase Overhaul, Classic Terminal Menu, Dark-Fantasy Action Architecture (`v11.1.0`) | `[x]` |
| WS47 | Zero-Flicker Menu/HUD/Action-Bar Stabilization (`M1–M6`) & `v11.1.1` Packaging | `[x]` |

## Mandatory Verification Gate
Fresh server (`L13`): `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`; `cd server; node src/server.js`.
1. `node --check server/src/server.js` 2. `node tools/run_tests.js --tier fast` → `30/30` 3. `python tools/smoke_test.py` → `11/11` 4. `dotnet build client/angband3d.csproj` → `0/0` 5. `server/public` change → `node tools/bump_version.js <v>` + `npm run android:sync`.

## Known Upstream Issues (not regressions)
K1 FCB welcome `-more-` opens terminal · K2 Heng JP binary, client `lang` translates · K3 FCB/Heng boot `{"t":"error"}` · K4 Chrome profiles in `os.tmpdir()` · K5 restart server before CDP suite · K6 Vanilla direction prompt via row-0 match.

## In-Flight (Uncommitted) Files Inventory
- None (ready for `v11.1.1` release commit and tag).

## Last Gate Results
- **WS46 (`v11.1.0`, 2026-10-26)**: fast `30/30` · rev6 exemplar `7/7` · e2e `4/4` · live CDP 4-realm matrix `PASS` · smoke `11/11` · dotnet `0/0`.
- **WS47 (`v11.1.1`, 2026-10-26)**: fast `30/30` · rev5/6 exemplar `8/8` (`M1–M6` 5-turn DOM identity `clearCount === 1`) · desktop & Godot C# build `0/0` · `Angband3D-Windows-x64.zip` packaged.

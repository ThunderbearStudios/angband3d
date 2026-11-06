# Angband 3D — Engineering Lessons & Bridge Invariants

> Project-specific engineering notes and regression invariants for the Angband 3D bridge, WebGL renderer, and multi-realm frontend.

## Master $O(1)$ Dispatch Index
| ID | Subsystem | Invariant |
| :--- | :--- | :--- |
| `L6` | Input & Realms | Route realm-specific rest and action verbs through `RealmKeys` / `ActionCatalog` (`test_realm_keys.js`). |
| `L14` | Test Hygiene | Store temporary headless browser profiles in `os.tmpdir()`, never inside the repository tree. |
| `L19` | View Routing | Keep `screen-context.js` and `app.js:needsTerminal` symmetric (`AGENTS.md §3.3`, `test_screen_context.js`). |
| `L23` | Renderer Classes | Scan large classes (`>300` lines) for duplicate method names before adding or renaming methods. |
| `L25` | 60fps HUD | Gate DOM updates on state signatures (`frame.seq`, `(px, py, depth, rowsHash)`). |
| `L28` | MenuRouter | Clear pending `CommandDispatcher` KeyPlans and `MenuRouter.pending` on `Escape` or mode transitions. |
| `L30` | Audio / TTS | Unwrap `{ narrator: profile }` in `normalizeVocalOptions(options)` and emit `'idle'` in `finally`. |
| `L41` | Combat Foley | Use the 78-file non-vocal foley bank + `createDungeonReverbImpulse`; keep passive regen silent (`L49`). |
| `L45` | Server Security | Verify session ownership tokens with `crypto.timingSafeEqual` (`CWE-208`) and restrict CORS origins (`L46`). |
| `L48` | Deterministic CI | Use `npm ci` in `server/Dockerfile` and `.github/workflows/release.yml` (`SLSA v1.0`). |
| `L50` | License Metadata | Keep root `LICENSE` verbatim SPDX `GPL-2.0` text for GitHub Licensee detection; place derivation/asset notes in `LEGAL.md` & `CREDITS.md`. |
| `L51` | GitHub Actions | Ensure repository Actions permission `allowed_actions` is set to `"all"` after org creation/transfer so `actions/checkout@v4` does not hit `startup_failure`. |
| `L52` | WASM & Cloud Build | Compile offline WASM with `emcmake.exe cmake -DCMAKE_BUILD_TYPE=Release` (`2.79 MB`) and exclude `variants/**/build-bridge` in `.gcloudignore`. |
| `L53` | Planning Gate (`PLAN-GATE-01`) | Never modify source files when the user requests a plan; audit Playbooks `01–05`, `modern-web-guidance`, and Gemini SDK docs before finalizing any plan. |
| `L54` | 3D Message VFX | Track frame-to-frame `_prevFrameMessageEntries` + `msgObj.count` increments instead of a `Set` of message strings so repeated combat/potion/spell messages always trigger 3D VFX (`guard:js:7552ce05bf75`). |
| `L55` | Shockbolt Item Atlas | Filter out `<pile>` / `<unknown*>` (`category: 'none'`) in `resolveItemAtlasEntry` and provide semantic Shockbolt fallbacks for identified potions, hyphenated spellbooks, scrolls, amulets, and armor (`test_rev5_exemplar_contracts.js`). |
| `L56` | Input Context & WASD | Never self-call `this.getFacingForward()` inside `getFacingForward()` (`guard:js:7a85c6d1fc52`); keep `#btn-wasd-toggle` exclusively on `#touch-controls` with `stopPropagation()` drag isolation and 8-way `w/a/s/d/q/e/z/c` direction-prompt aiming. |
| `L57` | Living Chronicle & SDK | Enforce British RP `'Enceladus'` + `gemini-3.1-flash-tts-preview` + `35ms` Web Audio anti-pop ramp, `SceneEpoch` coalescing (`.is-coalesced-into-epoch`), `O(1)` `snapshotHeroVitals` (`guard:js:84db58d1cf4d`), 5-Tier deterministic KV-cache prefixes, OpenAPI `responseSchema`, and `!p.thought` filtering (`guard:js:8b9bb20dbd0f`). |
| `L58` | Zero-Flicker UI Memoization (`UI_SEQ_IN_MEMO_SIG`) | Never include monotonic `frame.seq` in UI overlay or contextual-control memoization signatures (`_lastSig`, `toolbarSig`, `updateContextualControls`); hash rendered content (`itemDigest`, `screenDigest`), add `.is-open-stable` to skip entry keyframes on open modals, bucket action-bar `stateSig` on boolean thresholds, and reconcile HUD drawer/footer DOM nodes in-place (`guard:js:3415aed5c883`, `test_rev5_exemplar_contracts.js` Contract 8). |
| `L60` | 1st-Person Viewmodel Orientation, Lintel Plaque + High Wayfinder, Non-Coplanar Town Framing & Death Modal Key Routing (`v11.5.6`) | Rotate 1st-person viewmodel weapons `innerPivot.rotation.y += Math.PI * 0.86` so blades/axes face forward-left (`-Z/-X`); strip `scabbard` nodes from held daggers; keep `townTimberGeo`/`townRoofGeo`/`shopFrameGeo` boxes strictly inside `[-0.998m, +0.998m]` cell bounds and disjoint in Y (`>=3mm` gap + `6mm` depth step, inner town `wallMesh` scaled `0.96`) so adjacent cells and intersecting beams/posts never Z-fight; keep sketch `<img>` hidden behind `.sketch-loading-placeholder` until `onload`; and route bare keys in `#death-modal` Tab 0 directly to the C engine (`input.js:_handleDeathModalKey`). |
| `L61` | Universal 4-Tier Master Bestiary, Entity `identitySig` Invalidation, Katana `ha` Orientation & Analytical Capsule Raycasting (`v11.7.0`) | Never mix ASCII glyph checks (`g === '...'`) into species name regexes; isolate glyph fallbacks to Tier 3 per-realm tables (`master-bestiary.js`); invalidate 3D entities in `updateMonsters`/`updateItems` whenever `identitySig` (`realm\|name\|glyph\|attr`) changes and call `purgeAllSceneEntities()` on realm/depth transitions; use analytical 3-sphere vertical capsule ray intersection (`<0.01 ms`, immune to child `.monsterData` shadowing) instead of `SkinnedMesh.raycast()`; and set `ph_katana` (`antique_katana_01.gltf`, whose cutting edge `ha` is on `-X`) to `rotY: Math.PI * 0.5` (`test_universal_8realm_bestiary_and_items.js`). |

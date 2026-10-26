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

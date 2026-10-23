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

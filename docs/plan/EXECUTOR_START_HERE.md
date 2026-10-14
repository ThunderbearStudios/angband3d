# EXECUTOR START HERE (angband3d award pass & v2 deep-audit runbook)

This page is the **entry point** for any human or LLM implementing the plan. Read it in full first (≈5 min). It sums up the rules, lessons learned and success criteria. The details live in four companion docs, all in this folder:

| Order | Doc | Contains |
|---|---|---|
| 1 | this file | Rules (`L1–L34`), lessons, 8 anti-trap guardrails, success bar |
| 2 | **[master_audit_and_execution_plan.md](master_audit_and_execution_plan.md)** | **ACTIVE Award-Pass v2 Deep Audit (48 findings) & Part VI: Gemini 3.8 Flash Turnkey Execution Runbook (Atomic Cards `1` → `2A..2D` → `3A..3B` → `4` → `5`)** |
| 3 | [master_completion_plan.md](master_completion_plan.md) | Historical Award-Pass v1 evidence E1–E34, WS0/1/4/5/7/8, decisions D1–D17 |
| 4 | [menu_context_remediation_plan.md](menu_context_remediation_plan.md) & [language_gui_platform_spec.md](language_gui_platform_spec.md) | Historical WS2, WS3, WS6, WS9, WS10 specs |

**Active Order of Work (Award-Pass v2):** Execute **Part VI** of [`master_audit_and_execution_plan.md`](master_audit_and_execution_plan.md) in card order: **Card 1 (Wave 1)** → **Cards 2A, 2B, 2C, 2D (Wave 2)** → **Cards 3A, 3B (Wave 3)** → **Card 4 (Wave 4)** → **Card 5 (Wave 5)**.

---

## 1. Ten Golden Rules (non-negotiable)
1. **Resume protocol.** Run `git status`, then read `docs/STATE.md` (created in WS0), then continue the first unchecked task. Never redo a checked task without evidence it regressed.
2. **One task = one commit** on branch `fix/award-pass`, message `WSx.y: <what>`. Update STATE.md **in the same commit**. Crashes then cost at most one task.
3. **Gate before checkbox.** A task is done only when its listed gate passes, and on **two consecutive runs** for flaky CDP tests. Paste the one-line gate result into STATE.md.
4. **Engine is read-only** except `engine/src/main-bridge.c`, `bridge-json.c/.h` (and `variants/*-src/src/main-bridge.*`). Never touch mechanics or RNG. After a bridge edit, re-export the patch with `git diff 4.2.6..HEAD --output=...` (never `>`; it writes UTF-16).
5. **No new npm dependencies.** Use Node built-ins (`crypto`, `http`, `fs`) and the existing `ws`.
6. **Archive, don't delete** (D4): move to `tools/archive/` or `docs/archive/`. The only exception is the gitignored Chrome profiles (D16), after confirming with `git check-ignore`.
7. **Any change under `server/public` ⇒ version bump** via `tools/bump_version.js` (WS5.4) and `npm run android:sync`.
8. **Escape everything rendered.** Use `textContent` or the shared `escapeHtml()`. Never put engine text, item names, inscriptions or translations into `innerHTML` raw.
9. **Surgical reads/edits.** Read 20–100 lines around a symbol, and use exact-string replacement. `grep_search` returns nothing on this repo; use `Select-String` in PowerShell.
10. **Tests never touch real saves.** Every server-spawning test sets `SAVE_DIR` to `fs.mkdtempSync(os.tmpdir()+'/a3d-')` and a random `PORT`, and cleans up in `finally`.

## 2. Consolidated Lessons Learned (`L1–L34`: why things broke before)
| # | Lesson | Consequence if ignored |
|---|---|---|
| L1 | Allowlists must be **derived from both senders and receivers** (grep client `sendCommand(` + bridge dispatch). | The old plan dropped `save` and would have broken saving. |
| L2 | **Never send digits for movement or hold.** Digits are repeat counts in the Angband keyset. Use arrows, and `,` for hold (E27). Never write `sendKey('5')` in `input.js`. | Mystery repeat/stall bugs & fails `test_realm_keys.js:174`. |
| L3 | **Realm keymaps differ** (Sil-Q, Hengband, FCB, Vanilla). Keys come from one table (`realm-keys.js`), proven by the probe tool, not guessed. Do not edit `realm-keys.js` without updating probe fixtures. | Buttons fire wrong commands per realm or fail `test_realm_keys.js`. |
| L4 | **Item letters are selections only inside a menu.** Route through `ScreenContext.classify(frame)`; outside menus a letter is a command. | Inventory letters ran commands in Sil-Q/Hengband. |
| L5 | **Classify once per frame** (memoize by `frame.seq`) and pass `screenText` down. | CPU waste plus contradictory decisions between handlers. |
| L6 | **Hengband: match on raw JP, translate only for display.** Translation is atomic per line: fully translated or untouched JP, never mixed. Keep `attrs` length equal to the text width. | Broken menus after translation, misaligned columns, "Japanglish". |
| L7 | **Translation data is generated from upstream** (`_("ja","en")` pairs and `lib/edit` JSONC names), not hand-typed. Manual overrides go in a small separate layer. | Coverage gaps and drift. |
| L8 | **Console mojibake ≠ file corruption.** Hengband files are UTF-8; PowerShell shows garbage because of the code page. Read with `-Encoding UTF8`. | Someone "fixes" good files. |
| L9 | **`const` reassignment and other hot-path errors kill every frame** (E1). Run `node --check server/src/server.js` plus the boot test after every server edit. | Total outage from a one-line change. |
| L10 | **Money and delete endpoints are never open:** same-origin, rate-limited, body-capped, model allowlist, no client-supplied raw payload passthrough. | API-key bill abuse, data loss. |
| L11 | **Errors to clients are generic** (`'Internal error'`); details go to the server log. Never echo paths, env names or `err.message`. | Info leaks (E24). |
| L12 | **The PWA and APK cache aggressively.** Every asset change needs the version bump, and the APK needs `npm run android:sync` plus the hash check. | Users run stale JS and file "already fixed" bugs. |
| L13 | **Kill stale servers before testing.** `Get-NetTCPConnection -LocalPort 8080 -State Listen \| % { Stop-Process -Id $_.OwningProcess -Force }`. | Tests hit old code and give false passes or fails. |
| L14 | **No polling or sleep loops in terminals.** Use one-shot commands; tests must exit with a code. | Hung sessions burn tokens. |
| L15 | **CDP tools must clean up their Chrome profiles** (`tools/lib/cdp.js`). | 24 GB of temp profiles (E11). |
| L16 | **View routing invariant:** `NeedsTerminal(frame)` (Godot) and the web equivalent: `-more-` stays in 3D with a banner; menus and overlays go to the terminal. | Flicker and lost prompts. |
| L17 | **`slot_by_name()` on optional slots asserts.** Use `bridge_get_equipped_by_type`. Guard every coordinate query with `bridge_in_play()`. | Engine crash during level gen. |
| L18 | **Never swallow handler exceptions.** Catch only `SyntaxError` from `JSON.parse`; log everything else. | Silent total outage ("empty sky of stars"). |
| L19 | **Contract tests, not just unit tests.** When a module is extracted, the test must assert every property and function that callers use (`classify()` keys, `MenuRouter.getPending`). | Module and callers drift apart. |
| L20 | **A browser gate is mandatory for client changes.** `tools/test_boot_flow.js` (cdp tier) loads the real page per realm and fails on any uncaught or handler error. | False greens. |
| L21 | **Checkbox = commit.** Never tick STATE.md for uncommitted work, and never claim PASS without the pasted gate output. | Phantom progress; the next agent builds on sand. |
| L22 | **One workstream / card at a time.** Don't mix unrelated card edits in one uncommitted tree. | Untangleable regressions. |
| L23 | **No duplicate class methods.** Before adding or editing a method in `dungeon3d.js`, `hud.js`, `terminal.js`, `chronicle-*.js`, run `Select-String` for the method name. | Later method silently overwrites earlier method (`destroyEntity`, `setPing`, `decodeText`). |
| L24 | **Verify binary save formats against C/C++ source.** Only Vanilla starts with `SaveVNLA`; Sil-Q/FCB/Hengband start with 4-byte binary version headers. Never guard WASM `.sav` alias sync with `!exists`. | Variant save uploads rejected; offline WASM saves overwritten on reload (`SEC-1`, `SEC-5`). |
| L25 | **Zero per-frame DOM/GPU reallocation.** Gate `updateDungeon`, `Rebuild`, `terminal.render`, `updateLanguageUI`, and `#term-letter-ribbon` on state-change signatures. Never declare cache keys as local variables inside per-frame functions. | 7× terminal redraws, 150ms stalls, DOM thrashing (`PERF-4..PERF-6`). |
| L26 | **Explicit GPU & Audio disposal.** Call `.dispose()` on removed sprites, nameplates, `CanvasTexture`s, and geometries; never embed `${depth}` in `resolveContextualTheme` `theme.id`. | 26 MB/floor VRAM leak & WebGL crashes (`PERF-2`, `PERF-3`). |
| L27 | **Cross-bridge JSON schema parity.** All 4 C/C++ bridges must emit `player: null` and `map: null` when `!bridge_in_play()`, monster `"hp_max"`, `messages: [{text, count, attr}]`, and `player.inventory[]` / `equipment[]`. | Broken health bars, messages, and gear inspection in Hengband/Sil-Q (`ENG-7`, `ENG-8`). |
| L28 | **State-machine self-healing on mode exit.** `MenuRouter.onFrame` and `#btn-term-escape` must clear `pending` whenever `classifier.mode !== 'item-list'`. | Player permanently trapped in Terminal View (`PLAY-4`). |
| L29 | **3D directional targeting routing.** When `isDirectionalTargeting` keeps `"Direction?"`/`"Target:"` in 3D view, route arrows to relative directions (no yaw spin) and `5`/`.`/`t` to `sendKey('t')`. | Targeting prompts spin camera or send `,` hold (`PLAY-2`, `GODOT-4`). |
| L30 | **Documentation single-source hierarchy.** Never let `AGENTS.md`, `LLM_CONTEXT.md`, `PROTOCOL.md`, and `BEST_PRACTICES` contradict each other. | Context poisoning across agent turns (`DOC-1..DOC-5`). |
| L31 | **Realm voice contract parity.** Keep `getLorekeeperVoice`, `chronicle-audio.js` `setRealm` (`hengband: 'Gacrux'`), and `server.js` `GEMINI_REALM_NARRATOR_MAP` aligned; zero robotic `speechSynthesis` fallback. | Cache misses or broken `test_realm_chronicles_and_inspection.js` (`CHRON-6`). |
| L32 | **Deterministic pre-warm & cache-key symmetry.** Always unwrap `{ narrator: profile }` via `normalizeVocalOptions(options)`, check `audioBufferCache.has(fullKey)` before splitting sentences, and never use `Math.random()` in `resolveCreatureEncounter`. | ~0% pre-warm cache hit rate and 2–4s voice delay (`CHRON-3`). |
| L33 | **Server/client validation parity.** `/api/tts` `tagRegex` must allow `[` `]` and `<= 300` chars; never retry `HTTP 4xx` errors; filter out `.thought` parts in `/api/llm/generate`. | `HTTP 400` + 1,800ms retry sleep & LLM `JSON.parse` crashes (`CHRON-1`, `CHRON-4`). |
| L34 | **Never set `isSpeaking = true` before playback starts.** Only route to `_executeSeamlessSpeak` when audio is physically playing, and emit `'idle'` in `finally` blocks. | False self-interruption (`⚡ Interrupted`) & stuck `"Voicing..."` pill (`CHRON-2`). |
| L35 | **Argon Token-Frugal Execution Protocol.** Locate lines via `Select-String ... \| Select-Object -First 20`, read 30–100 line slices, batch parallel tool calls per turn, plan complete file edits before mutating, and delegate isolated tracks to `Model: 'flash'` subagents. | Context-window bloat, redundant multi-turn re-reads, and severe token waste. |
| L36 | **Zero-Scratch & Zero-KayKit High-Realism Asset Mandate.** NEVER hand-craft 3D models from primitives (`BoxGeometry`, `SphereGeometry`, `CylinderGeometry`, `createProceduralCreatureMesh`) AND NEVER use cartoonish low-poly KayKit/OBJ models (`models/characters/*.gltf`, `models/monsters/*.obj`, `models/items/*.obj`). Use ONLY **Poly Haven CC0 8K-scanned photogrammetry glTFs/textures** (`polyhaven/models/`, `polyhaven/textures/`) and **4096×4096 Shockbolt hand-painted dark-fantasy PBR atlases** (`monster_atlas.png`, `item_atlas.png`). Never call `.toNonIndexed()` on photogrammetry meshes, and guard `_sharedGeometry` in `destroyEntity()`. | Cartoonish low-poly meshes, blocky procedural shapes, destroyed template geometries, or 110M-vertex GPU lag. |

## 2.5. Argon Token-Frugal Execution Protocol (Mandatory When Argon / Autonomous Execution is Enabled)
Token waste is strictly prohibited. When executing any plan or card under Argon (`Pro` / heavy reasoning model), obey these 8 token-economics laws without exception:
1. **Never Stream Large Code Edits from Parent Argon Context (`Flash Subagent Delegation Mandate`)**:
   - The parent Argon model's context window is re-billed on every turn and its output tokens are expensive and slow.
   - For **any edit > 40 lines** or any mutation to a large file (`dungeon3d.js`, `app.js`, `server.js`, `hud.js`, `chronicle-*.js`, `DungeonWorld.cs`), the parent Argon agent MUST write the exact line-numbered spec into `docs/plan/master_audit_and_execution_plan.md` and delegate the file mutation to a **`Model: 'flash'` subagent (`invoke_subagent`)**.
   - The `flash` subagent executes in an isolated, disposable context at ~1/10th the token cost, runs `node --check` + unit gates, and returns a concise <= 15-line summary.
2. **Never Call `replace_file_content` in Parallel on the Same File**:
   - Calling `replace_file_content` multiple times in the same turn on a single file is forbidden by tool rules and causes canceled/colliding streams that waste thousands of output tokens. Batch parallel tool calls ONLY across **different** files, or combine edits to one file inside a `Model: 'flash'` subagent.
3. **Pinpoint Before Reading (`Zero Exploratory Dumps`)**:
   - Never view >100 lines in the parent agent to "look around." Run a single `Select-String -Path <file> -Pattern "<symbol>" | Select-Object -First 20 LineNumber, Line` first, or delegate multi-section code reading to a `Model: 'flash'` subagent.
4. **Plan First in `master_audit_and_execution_plan.md` & `STATE.md`**:
   - Before touching code for any new user request or iteration, update `docs/plan/master_audit_and_execution_plan.md` and `docs/STATE.md` first so the plan is persistent, crash-recoverable, and ready for `flash` subagent execution.
5. **Design Complete Single-Pass Edits**:
   - Resolve all dependencies, material bindings, and test contracts before mutating a file—never iterate via trial-and-error edits.
6. **Cap All Command Stdout**:
   - Always bound PowerShell/Node output (`Select-Object -First 25`), and run targeted single-test scripts (`node tools/test_<name>.js`) during subagent execution before running full gates once at sign-off.
7. **Consult the Canonical Pre-Verified Asset Matrix (`L36`)**:
   - Never re-scan asset directories repeatedly across turns. Consult the **Verified Asset Catalog & Selection Matrix** in `docs/plan/master_audit_and_execution_plan.md` (Part VIII).
8. **Zero Scratch Models & Zero Cartoon/KayKit Assets (`L36`)**:
   - Never waste tokens or visual quality writing procedural 3D geometry generators (`BoxGeometry`/`SphereGeometry`/`CylinderGeometry` assemblies or `createProceduralCreatureMesh`) and never load cartoonish low-poly KayKit/OBJ models. Bind only **Poly Haven photogrammetry glTFs/textures** and **4096×4096 Shockbolt hand-painted dark-fantasy PBR atlases**.

## 3. Gaps Found in Final Review (now closed: implement these too)
| ID | Gap | Action (where) |
|---|---|---|
| G-A | **API key history leak check.** We verified no key in code, but not in git history. | WS4 first task: `git log --all -p -S "AIza" --oneline \| Select-String AIza` and the same for `GEMINI_API_KEY=`. If anything is found, **rotate the key in Google AI Studio immediately** and add a history scrub to the WS10.2 step-5 run. Confirm `.env` is in `.gitignore`. |
| G-B | **Secrets in logs.** Owner tokens, API keys and the full LLM payload must never be logged. | WS4: grep `console.log` near `/api/llm`, `/api/tts` and owner code; log only lengths/status. |
| G-C | **Rate-limit map growth.** In-memory buckets must expire. | WS4 `rate-limit.js`: prune entries older than 24 h on each call or every 10 min via `setInterval(...).unref()`. |
| G-D | **Deployed environment config.** Docker/Cloud Run need `ALLOWED_ORIGINS`, `TRUST_PROXY=1`, and no `ENABLE_RECORDING_UPLOAD`. | WS4 + WS8: update `cloudbuild.yaml`/Dockerfile env docs; `/health` must not reveal config. |
| G-E | **Service-worker update UX.** After a version bump, users must actually get the new build. | WS5.4: sw.js `skipWaiting()` + `clients.claim()` on a version change; the app shows a "New version, reload" toast (`textContent`) on `controllerchange`. Never auto-reload mid-game. |
| G-F | **APK not on Play Store → forced reinstall** after key rotation. | WS10.2 step 4 (updated): verify save export/import exists **before** rotating; release note. |
| G-G | **Untracked scratch files** (`tools/scratch_test_labels.js`, `tools/scratch_test_regex_all.js`, and any other `tools/scratch_*`). | WS0.3: move to `tools/archive/scratch/` (or delete if untracked and fully superseded; ask if unsure). |
| G-H | **Godot client compiles but is secondary** (D10). | Each gate run also does `dotnet build client/angband3d.csproj`; no Godot feature work. |
| G-I | **Rollback path.** | Every WS ends on a tagged commit `ws<N>-done`. If a later WS regresses, `git revert` that WS's commits; never force-reset shared history (except the final approved keystore scrub). |
| G-J | **Upload validation per realm** (E21: only `SaveVNLA` accepted). | WS4: accept each realm's real save magic (probe one save per realm in tests), enforce the size cap, and use `path.basename` on the filename (no traversal). |
| G-K | **WS message-shape validation.** | WS1.2: `JSON.parse` in try/catch, reject non-object/oversized messages, unknown `t` → ignore + counter, never crash. |

## 4. Success Criteria (what "done" means, all required)
1. **Functionality:** in every realm (Vanilla, Sil-Q, FCB, Hengband EN, Hengband JP, offline wasm):
   - start a new game, resume, move, open inventory, pick an item, choose an action, and the correct engine prompt appears;
   - letters never fire commands inside menus; context buttons match the screen.
2. **Hengband language:** switching JP⇄EN re-renders in place with no reload. No line mixes JP and EN. Menus still work in both. The welcome text and HUD strings are localized. T1–T12 are green.
3. **Security:**
   - no wildcard CORS;
   - the LLM/TTS proxy is same-origin, rate-limited, capped, and uses a model allowlist; BYOK is removed;
   - recording upload is dev-only;
   - WS has `maxPayload` and an Origin check;
   - ownership protects delete, overwrite and `new=1`;
   - no secrets in the repo, its history, logs or responses;
   - CSP has no `unsafe-eval`, and `unsafe-inline` is removed or justified.
4. **GUI:**
   - no overlap at any of the 6 viewports in any realm;
   - consistent typography tokens and realm-aware labels;
   - toasts and a11y labels in place; screenshots attached in STATE.md.
5. **Performance/bloat:**
   - the Hengband dictionary is lazy-loaded (non-Hengband first load ≥ 900 KB lighter);
   - `updateTerminalToolbar` ≤ 400 lines;
   - one version source; 24 GB of temp profiles reclaimed.
6. **Quality:**
   - fast, e2e and cdp test tiers green twice in a row; smoke 11/11; dotnet build OK;
   - CI boots the server and runs the fast tier;
   - docs updated (STATE, NEXT_STEPS, LLM_CONTEXT, PROTOCOL, BEST_PRACTICES with sections 1–2 of this file merged in).
7. **Zero regressions:** the full test matrix (master plan §5) passes, and saving works in every realm (L1).

## 5. If You Are Low on Context
Do only this loop: `git status` → STATE.md → next unchecked task → read only the plan section for that task → implement → gate → commit + STATE.md → stop or continue. Never load whole files; never re-plan.

## 6. Requirement Traceability (every user complaint → task → proving test)
| User concern | Task | Test that must FAIL before the fix and PASS after |
|---|---|---|
| Item letters run commands (Sil-Q, Hengband) | WS2 + WS6 | `test_menu_router` fixtures per realm + CDP "press letter in inventory → no game turn passes" |
| Menu context buttons wrong in all realms | WS2, WS5.3, WS9.7 | CDP per realm: open inventory/equipment/spell/store → button labels match `CTX_BUTTONS[screenType]` and each press yields the expected prompt |
| Hengband JP/EN switching not correct or elegant | WS3 | T1–T12 + CDP "toggle mid-menu → in-place, no mixed line, menu still selectable" |
| No regressions | All | Full matrix (master §5) + saving in every realm |
| Security / no API leakage | WS4, G-A, G-B | test_http_guard, test_proxy_limits, history scan empty, log grep empty |
| Crash-resumable progress | WS0 | Kill the session mid-task, then a fresh agent resumes from STATE.md alone |
| Cross-platform | WS10 | Android hash check, offline wasm CDP, `dotnet build` |

**Red-first rule:** for each bug row, commit the failing test first (`WSx.y-test: red`), then the fix (`WSx.y: green`). A fix with no test that was red before it doesn't count.

## 7. Baselines (WS0, before any code change)
- Capture screenshots for each realm × {town, inventory, equipment, spell menu, store} at 1920×1080 and 412×915 into `tools/reports/baseline/`.
- Record current pass/fail for every existing test in STATE.md. Later "regression" means **worse than this baseline**, not merely failing.

## 8. Unverified Assumptions (verify with a spike before relying on them)
| Assumption | Verify by | If false |
|---|---|---|
| `REALM_KEYS` values per realm | WS6 probe tool | Use probe output; update spec |
| No API key in git history | G-A scan | Rotate key now; scrub with keystore |
| Offline/APK save export exists | G-F grep | Build export/import before key rotation |
| Scratch files untracked | `git ls-files tools/scratch_*` | Archive via `git mv` |
| Sil-Q/Hengband frames lack `player.inventory` | Dump one frame per realm | If present, prefer it over screen parsing |
| `hello.version` is the protocol version | docs/PROTOCOL.md | Rename the field in docs only |

## 9. Stop and Ask the User When
- A gate can't pass without changing engine mechanics, or without deleting anything other than D16 profiles.
- A test baseline was already failing and the fix would expand scope.
- You'd need a new dependency, a force-push (except the approved final scrub), or any change to deployed secrets.
- Two attempts at the same task have failed: record what was tried in STATE.md "Blockers", then ask.

## 10. Out of Scope (prevents scope creep)
No new gameplay features, no Godot feature work, no new realms, no redesign beyond WS9, no new LLM providers, no framework migration.

## 11. Human Playtest Script (final acceptance, ~20 min, user runs it)
For each realm: new character → walk the town → buy one item → open inventory, select the item, use the chooser → enter the dungeon → fight one monster → save → reload page → resume. Hengband: repeat once with the JP⇄EN toggle pressed mid-menu. On a phone-size window: confirm no overlapping controls. Any "feels wrong" note becomes a STATE.md item before DoD.


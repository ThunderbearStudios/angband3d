# EXECUTOR START HERE (angband3d award pass)

This page is the **entry point** for any human or LLM implementing the plan. Read it in full first (≈5 min). It sums up the rules, lessons learned and success criteria. The details live in three companion docs, all in this folder:

| Order | Doc | Contains |
|---|---|---|
| 1 | this file | Rules, lessons, gaps closed, success bar |
| 2 | [master_completion_plan.md](master_completion_plan.md) | Evidence E1–E34, global order, WS0/1/4/5/7/8, risks, test matrix, DoD, decisions D1–D17 |
| 3 | [menu_context_remediation_plan.md](menu_context_remediation_plan.md) | WS2 (menus/action chooser). Phases 0–1 are **SUPERSEDED**; skip them |
| 4 | [language_gui_platform_spec.md](language_gui_platform_spec.md) | WS3 (Hengband JP/EN), WS6 (realm keys), WS9 (GUI), WS10 (Android/PWA/offline/Godot) |

**Order of work:** WS0 → WS1 → WS4 → WS2 → WS6 → WS3 → WS9 → WS5 → WS10 → WS7 → WS8. Do not reorder: security comes before features, and the keys (WS6) before Hengband language (WS3), because WS3 tests rely on correct keys.

---

## 1. Ten Golden Rules (non-negotiable)
1. **Resume protocol.** Run `git status`, then read `docs/STATE.md` (created in WS0), then continue the first unchecked task. Never redo a checked task without evidence it regressed.
2. **One task = one commit** on branch `fix/award-pass`, message `WSx.y: <what>`. Update STATE.md **in the same commit**. Crashes then cost at most one task.
3. **Gate before checkbox.** A task is done only when its listed gate passes, and on **two consecutive runs** for flaky CDP tests. Paste the one-line gate result into STATE.md.
4. **Engine is read-only** except `engine/src/main-bridge.c`, `bridge-json.c/.h`. Never touch mechanics or RNG. After a bridge edit, re-export the patch with `git diff 4.2.6..HEAD --output=...` (never `>`; it writes UTF-16).
5. **No new npm dependencies.** Use Node built-ins (`crypto`, `http`, `fs`) and the existing `ws`.
6. **Archive, don't delete** (D4): move to `tools/archive/` or `docs/archive/`. The only exception is the gitignored Chrome profiles (D16), after confirming with `git check-ignore`.
7. **Any change under `server/public` ⇒ version bump** via `tools/bump_version.js` (WS5.4). Until that tool exists, bump `?v=` in index.html **and** `CACHE_NAME` in sw.js by hand.
8. **Escape everything rendered.** Use `textContent` or the shared `escapeHtml()`. Never put engine text, item names, inscriptions or translations into `innerHTML` raw.
9. **Surgical reads/edits.** Read 20–100 lines around a symbol, and use exact-string replacement. `grep_search` returns nothing on this repo; use `Select-String` in PowerShell.
10. **Tests never touch real saves.** Every server-spawning test sets `SAVE_DIR` to `fs.mkdtempSync(os.tmpdir()+'/a3d-')` and a random `PORT`, and cleans up in `finally`.

## 2. Consolidated Lessons Learned (why things broke before)
| # | Lesson | Consequence if ignored |
|---|---|---|
| L1 | Allowlists must be **derived from both senders and receivers** (grep client `sendCommand(` + bridge dispatch). | The old plan dropped `save` and would have broken saving. |
| L2 | **Never send digits for movement or hold.** Digits are repeat counts in the Angband keyset. Use arrows, and `,` for hold (E27). | Mystery repeat/stall bugs. |
| L3 | **Realm keymaps differ** (Sil-Q, Hengband, FCB, Vanilla). Keys come from one table (`realm-keys.js`), proven by the probe tool, not guessed. Delete the 4 duplicate remaps. | Buttons fire wrong commands per realm (the original bug). |
| L4 | **Item letters are selections only inside a menu.** Route through `ScreenContext.classify(frame)`; outside menus a letter is a command. | Inventory letters ran commands in Sil-Q/Hengband. |
| L5 | **Classify once per frame** (memoize by `frame.seq`) and pass `screenText` down. | CPU waste plus contradictory decisions between handlers. |
| L6 | **Hengband: match on raw JP, translate only for display.** Translation is atomic per line: fully translated or untouched JP, never mixed. Keep `attrs` length equal to the text width. | Broken menus after translation, misaligned columns, "Japanglish". |
| L7 | **Translation data is generated from upstream** (`_("ja","en")` pairs and `lib/edit` JSONC names), not hand-typed. Manual overrides go in a small separate layer. | Coverage gaps and drift. |
| L8 | **Console mojibake ≠ file corruption.** Hengband files are UTF-8; PowerShell shows garbage because of the code page. Read with `-Encoding UTF8`. | Someone "fixes" good files. |
| L9 | **`const` reassignment and other hot-path errors kill every frame** (E1). Run `node --check server/server.js` plus the boot test after every server edit. | Total outage from a one-line change. |
| L10 | **Money and delete endpoints are never open:** same-origin, rate-limited, body-capped, model allowlist, no client-supplied raw payload passthrough. | API-key bill abuse, data loss. |
| L11 | **Errors to clients are generic** (`'Internal error'`); details go to the server log. Never echo paths, env names or `err.message`. | Info leaks (E24). |
| L12 | **The PWA and APK cache aggressively.** Every asset change needs the version bump, and the APK needs `npx cap sync android` plus the hash check. | Users run stale JS and file "already fixed" bugs. |
| L13 | **Kill stale servers before testing.** `Get-NetTCPConnection -LocalPort 8080 -State Listen \| % { Stop-Process -Id $_.OwningProcess -Force }`. One was running as PID 5068 at handoff. | Tests hit old code and give false passes or fails. |
| L14 | **No polling or sleep loops in terminals.** Use one-shot commands; tests must exit with a code. | Hung sessions burn tokens. |
| L15 | **CDP tools must clean up their Chrome profiles** (`tools/lib/cdp.js`). | 24 GB of temp profiles (E11). |
| L16 | **View routing invariant:** `NeedsTerminal(frame)` (Godot) and the web equivalent: `-more-` stays in 3D with a banner; menus and overlays go to the terminal. | Flicker and lost prompts. |
| L17 | **`slot_by_name()` on optional slots asserts.** Use `bridge_get_equipped_by_type`. Guard every coordinate query with `bridge_in_play()`. | Engine crash during level gen. |
| L18 | **Never swallow handler exceptions.** `network.js` once caught *everything* in `onmessage` as "non-JSON"; a per-frame `TypeError` became invisible. Catch only `SyntaxError` from `JSON.parse`; log everything else. | Silent total outage ("empty sky of stars"). |
| L19 | **Contract tests, not just unit tests.** When a module is extracted, the test must assert every property and function that callers use (`classify()` keys, `MenuRouter.getPending`). Green unit tests proved nothing while the app crashed. | Module and callers drift apart. |
| L20 | **A browser gate is mandatory for client changes.** `tools/test_boot_flow.js` (cdp tier) loads the real page per realm and fails on any uncaught or handler error. WS-only tests cannot see DOM/JS wiring. | False greens. |
| L21 | **Checkbox = commit.** Never tick STATE.md for uncommitted work, and never write "100% Operational" in NEXT_STEPS without the pasted gate output. Re-run gates yourself; do not trust a previous agent's PASS claim. | Phantom progress; the next agent builds on sand. |
| L22 | **One workstream at a time.** Don't mix WS2 + WS3 + WS5 edits in one uncommitted tree. If a change belongs to another WS (e.g. Hengband lang→binary policy), note it in STATE and leave it. | Untangleable regressions. |

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


# Audit, Incident Analysis & Course Correction (2026-10-12)

**Branch:** `fix/award-pass`  
**Base Commit:** `ba87091` (*WS9.3-WS9.5: HUD message log, topline polish, and action ribbon polish*)  
**Status:** All test tiers verified 100% green; working tree stabilized and documented.

---

## 1. Executive Summary & Verification Matrix

The codebase is healthy, stable, and functionally sound across all four realms (Vanilla Angband, Sil-Q, FrogComposBand, and Hengband).

| Verification Gate | Command | Result | Notes |
|---|---|---|---|
| **Python Smoke Tests** | `python tools/smoke_test.py` | **11/11 PASS** | Engine JSON bridge, handshakes, memory, save/load |
| **C# Godot Client** | `dotnet build client/angband3d.csproj` | **0 warn, 0 err** | C# client compiles cleanly |
| **Fast Test Tier** | `node tools/run_tests.js --tier fast` | **10/10 PASS** | Relay guard, HTTP guard, screen context (141 tests), menu router, realm keys, HengTranslate (12 tests), Heng wiring (4 tests), top bar consolidation (6 tests), HUD message pass (4 tests), version sync (all match 9.4.1) |
| **E2E Test Tier** | `node tools/run_tests.js --tier e2e` | **2/2 PASS** | `verify_cross_realm_menus.js` (11.0s, all 4 realms), `test_server_boot.js` (0.9s) |
| **CDP Real-Browser Gate** | `node tools/test_boot_flow.js` | **4/4 PASS** | Angband, Sil-Q (Action Chooser verified in real DOM), FrogComposBand, Hengband reach 3D play with 0 uncaught errors |
| **Single Version Sync** | `node tools/check_version_sync.js` | **PASS** | `version.json`, `sw.js`, and `index.html` all synchronized at `9.4.1` |

---

## 2. Where We Are At

### 2.1 Completed & Committed Milestones (History)
- **WS0 (0.1–0.4):** Checkpoints, AGENTS pointer, probe reverts, minimal test runner (`run_tests.js`).
- **WS1:** Relay guard, crash fixes, WebSocket payload limits.
- **WS4 (4.1–4.10):** Security hardening (CSP, rate-limiting, proxy caps, BYOK removal, origin checks).
- **R0:** Baseline recovery after 2026-10-11 incident + `tools/test_boot_flow.js` CDP gate.
- **WS2 (2.2–2.5):** `screen-context.js` pure module (47 realm fixtures), additive classifications, `menu-router.js`, and in-game Action Chooser UI.
- **WS6 (6.1–6.3):** Realm key probe, `realm-keys.js` UMD module, sender keymap migration (no raw digits).
- **WS3 (3.0–3.5):** Hengband JP/EN baseline, translation generator (`gen_heng_dict.js`), `heng-translate.js` pure module (T1–T12 contract green), live language toggling, legacy dictionary cleanup.
- **WS9 (9.1–9.5):** Layout overlap resolution across 6 viewports/4 realms (0 overlaps, >=40x40 touch targets), top-bar consolidation into pause menu, HUD message log (4-line default, drawer, idle fade, resize toggle), topline polish, action ribbon polish.

### 2.2 Working Tree Status (In-Flight Work)
The working tree contains 14 modified files and 3 untracked files representing parts of **WS5** and minor **WS3** dictionary additions:
1. **WS5.4 Single Version Source:** `server/public/version.json` (canonical `9.4.1`), `tools/bump_version.js`, `tools/check_version_sync.js`, `server/src/server.js` (`/health` reads version.json), and version bumps in `index.html` / `sw.js`.
2. **WS5.2 Memoization:** `server/public/js/screen-context.js` (caches `classify()` by `frame.seq` or frame identity, memoizes `screenTextOf()`), and `server/public/js/input.js` (delegates screen text extraction to `ScreenContext.screenTextOf`).
3. **WS5.1 Lazy Hengband Assets:** `server/public/js/app.js` (introduces `loadHengLang()` lazy loader, called on Hengband realm select/boot), and `server/public/index.html` (removes synchronous `<script>` tags for Hengband dictionaries).
4. **WS5.5 Dead Code Sweep:** `tools/report_dead_code.js` and report `tools/reports/dead_code.md` (only 2 unreferenced candidate functions in `app.js`).
5. **WS3 Coverage Polish:** `server/public/js/heng/heng-translate.js`, `server/public/js/heng/heng-names.json`, `tools/fixtures/heng/lines_raw.json`, `tools/reports/heng_untranslated.json`, `tools/heng_lang_coverage.js`, and `tools/test_boot_flow.js` (handles Hengband/FCB spellbook titles and character background generation choices).

---

## 3. Incident Analysis: Where We Got Stuck

During the previous session, the agent entered an extended 500+ step loop repeatedly executing `git status` and inspecting `docs/STATE.md` without taking action until the user manually stopped execution.

### Root Causes
1. **Contradictory State Metadata in `docs/STATE.md` (Paralysis Trigger):**
   - Line 4 stated: `Current task: **WS9.2** (Top bar consolidation)`.
   - The checklist had already marked `WS9.2` and `WS9.3–WS9.5` as complete and committed in `ba87091`.
   - Line 64 stated: `## In-flight (uncommitted) files: None`, while `git status` showed 14 modified files.
   - When an LLM oriented on turn start (per Rule 1), it encountered an irreconcilable contradiction: the current task was already marked done, but uncommitted files existed from an unknown task. The model entered a loop trying to re-verify state.
2. **Violation of Golden Rule 2 ("One task = one commit") and Rule 22 ("One workstream at a time"):**
   - The previous agent did not commit each sub-task atomically. Instead, it worked on WS5.1, WS5.2, WS5.4, WS5.5, and WS3 polish simultaneously in a single uncommitted batch.
   - When any step stalled or timed out, the working tree was left in an ambiguous, uncommitted state.
3. **Server Process Lifecycle & Port 8080 Race Conditions (K5):**
   - `verify_cross_realm_menus.js` connects to `ws://127.0.0.1:8080/ws` and leaves engine instances alive during an 1800s grace period.
   - If an agent runs `run_tests.js --tier all` without killing and restarting the server, E2E or CDP tests fail with `ECONNREFUSED` or experience timeouts from multiple engines running in background grace periods.
4. **Terminal Polling & Wait Loops:**
   - Attempting to poll task statuses or running sleep loops inside command executions burned thousands of tokens and hit API rate limits (HTTP 429).

---

## 4. Course Corrections & Immediate Plan

To restore clean alignment with the **Ten Golden Rules**, we must take the following actions:

### Step 1: Stage and Commit the In-Flight Work in Atomic Commits
Rather than discarding valid, fully-tested code, partition the 14 in-flight files into 4 clean, verifiable commits:

1. **Commit 1 — WS5.4: Single version source and fast sync gate**
   - Files: `server/public/version.json`, `tools/bump_version.js`, `tools/check_version_sync.js`, `tools/test_manifest.json`, `server/src/server.js`, `server/public/sw.js`, `server/public/index.html` (version params)
   - Gate: `node tools/check_version_sync.js` and `node tools/run_tests.js --tier fast`
   - Message: `WS5.4: single version source (version.json 9.4.1, bump_version.js, check_version_sync)`

2. **Commit 2 — WS5.2: Per-frame classify and screen text memoization**
   - Files: `server/public/js/screen-context.js`, `server/public/js/input.js`
   - Gate: `node tools/test_screen_context.js` (141 tests PASS)
   - Message: `WS5.2: per-frame classify and screenText memoization by seq/identity`

3. **Commit 3 — WS5.1: Lazy load Hengband language assets**
   - Files: `server/public/js/app.js`, `server/public/index.html` (removal of static heng script tags)
   - Gate: `node tools/test_boot_flow.js` (verifies Hengband and non-Hengband realms boot into 3D play)
   - Message: `WS5.1: lazy load Hengband dictionary and translation assets`

4. **Commit 4 — WS3 Polish & WS5.5 Dead Code Sweep Report**
   - Files: `server/public/js/heng/heng-translate.js`, `server/public/js/heng/heng-names.json`, `tools/fixtures/heng/lines_raw.json`, `tools/reports/heng_untranslated.json`, `tools/heng_lang_coverage.js`, `tools/test_boot_flow.js`, `tools/report_dead_code.js`, `tools/reports/dead_code.md`
   - Gate: `node tools/run_tests.js --tier all`
   - Message: `WS5.5: dead-code sweep report and Hengband translation coverage polish`

### Step 2: Proceed with the Next Remaining Master Plan Tasks
Once the working tree is clean and committed:
- **WS5.3: Action-bar deduplication** (`setCtxActions` and data-driven `CTX_BUTTONS` in `app.js` to reduce `updateTerminalToolbar` below 400 lines).
- **WS5.6: Temp profile hygiene & profile cleanup** (reclaim the 24 GB of gitignored `temp_chrome_*` profiles per D16).
- **WS10: Platform & Mobile Hardening** (Android APK key rotation, PWA service worker reload toast, offline wasm fallback).
- **WS7: Test suite consolidation**.
- **WS8: Master documentation & lessons learned merge**.
- **G-B through G-K: Final review security & resilience items**.

---

## 5. Execution Guidelines & Guardrails for Success

1. **One Task = One Commit (Rule 2):** Never begin editing files for task $N+1$ until task $N$ has passed its gate and is committed along with an update to `docs/STATE.md`.
2. **No Command Polling (Rule L14):** When running background commands or dev servers, use one-shot commands. Never run polling loops (`while true; sleep`). Rely on IDE reactive notifications.
3. **Server Cleanliness (Rule L13 & K5):** Always terminate any existing listener on port 8080 before running full test suites:
   ```powershell
   Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
   ```
4. **Token Efficiency:**
   - Keep file inspections strictly targeted (20–100 lines using `StartLine`/`EndLine`).
   - Do not re-run full test suites when running fast unit tests.
   - Commit frequently to keep diffs small and manageable.

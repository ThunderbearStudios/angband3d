# BOOTSTRAP.md: 5-Minute Agentic Repository Bootstrap Guide

This checklist guides human directors and AI agents in bootstrapping any new or existing repository into an award-winning, agentic-ready workspace.

---

## Step 1: Create the 4-Tier Knowledge Hierarchy (Law U1)
In your repository root, establish the four synchronized tiers so any human or LLM contributor knows **without a doubt** where to start within 60 seconds:
1. **Tier 1 — `AGENTS.md` (and mirrors `CLAUDE.md`, `.cursorrules`)**: The Turn-0 Orientation Compass, Non-Negotiable Invariants, Pinned Test-Contract Guardrails, Key File Map, and Build/Verification Commands.
2. **Tier 2 — `docs/STATE.md` + `docs/plan/EXECUTOR_START_HERE.md`**: The live, authoritative execution checklist tracking the exact `Current task`, in-flight files, and mandatory verification gate output. (Keep `docs/NEXT_STEPS.md` as historical archive only so there is never a competing task list).
3. **Tier 3 — `docs/LLM_CONTEXT.md` + `docs/PROTOCOL.md`**: The complete module & line-number map, wire protocol schemas, coordinate systems, and security boundaries (eliminating exploratory `**/*` scans).
4. **Tier 4 — `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`**: Deep post-mortems (`Failure Mode` $\rightarrow$ `Root Cause` $\rightarrow$ `Invariant` $\rightarrow$ `Verification Proof`).

## Step 2: Establish the Tiered Verification Gate
Create a fast, deterministic verification runner (`node tools/run_tests.js --tier fast` or `python tools/smoke_test.py`):
- **Fast Tier (<15s)**: Pure unit, contract, security regex, and version-sync assertions that require no external server.
- **E2E / CDP Tier**: Headless browser or process stdio integration assertions across all supported realms/modes.
- **Pinned Test-Contract Guardrails**: Document the core assertion invariants of existing tests in `AGENTS.md` so contributors never break existing regex/structural contracts while fixing adjacent bugs.

## Step 3: Enforce Universal High-Leverage Engineering Laws (`U1–U8`)
Record and enforce these 8 universal laws in `AGENTS.md`:
- **U1 (Single Entry Point)**: `AGENTS.md` $\rightarrow$ `docs/STATE.md` $\rightarrow$ `docs/LLM_CONTEXT.md` $\rightarrow$ `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`.
- **U2 (Anti-Shadowing)**: Always grep a class file for `<methodName>(` before editing or adding a method so a duplicate definition at the bottom of the class doesn't silently overwrite an earlier one.
- **U3 (Zero Per-Frame Allocation & Instance Dirty Signatures)**: Store UI/render dirty-check signatures on the class instance or module (`this._lastSig`), never in local frame variables.
- **U4 (Explicit GPU & Audio Disposal + Bounded Caches)**: Explicitly `.dispose()` GPU geometries/materials/textures, `.disconnect()` finished Web Audio nodes, and bound all LRU caches with normalized keys.
- **U5 (Bidirectional Contract & Pre-Warm Symmetry)**: Derive allowlists from both senders and receivers; contract-test client payloads against server regexes; never retry `HTTP 4xx`; and share one `normalizeOptions()` + deterministic hash between speculative pre-warmers and live callers.
- **U6 (State-Machine Self-Healing)**: Auto-clear client multi-step state machines when the backend mode changes and inside `finally` blocks.
- **U7 (Red-First Atomic Commits & Disjoint Wave Files)**: `1 card = 1 commit`; partition parallel waves strictly by target file.
- **U8 (Turnkey Execution Cards)**: Package implementation plans into self-contained cards with exact file/line targets, pinned test guardrails, code snippets, and one-line verification commands so even fast/lower-tier models succeed 100% of the time.

## Step 4: Configure Token & Asset Economics
- Add large asset folders, raw video recordings, build caches, and `node_modules` to `.gitignore` and `.gcloudignore`.
- Enforce single-source version synchronization (`version.json` + `tools/bump_version.js` + `tools/check_version_sync.js`) across HTML `?v=` tags, Service Worker `CACHE_NAME`, and mobile/desktop manifests.

## Step 5: Activate the Global Skill
Sync `thunderbear-agentic-mastery` to your global Antigravity skills directory:
```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.gemini\config\skills\thunderbear-agentic-mastery" -Force
Copy-Item "thunderbear-agentic-mastery\SKILL.md" "$env:USERPROFILE\.gemini\config\skills\thunderbear-agentic-mastery\SKILL.md" -Force
```
You are now ready to build at the highest level of human-agent synergy.

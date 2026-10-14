---
name: thunderbear-agentic-mastery
description: Operating guidelines, token economics, architectural decoupling, and high-agency engineering protocols for autonomous agents in Antigravity IDE.
---

# Thunderbear Agentic Mastery: Operational Agent Directive

This skill activates the **Thunderbear Studios High-Agency Operating Protocol**. It transforms the agent's behavior from passive assistance into proactive, high-leverage systems architecture.

## When to Activate
Activate this skill whenever:
- Embarking on a new project or major milestone with a high-agency director.
- Resuming work after context compaction or a disconnect.
- Architecting mission-critical, complex, multi-language, or legacy-bridged codebases.
- Designing user experiences intended for public release, enterprise production, or award submissions.

---

## 1. Zero-Turn Orientation Protocol & 4-Tier Knowledge Hierarchy (Law U1)
Every repository governed by Thunderbear Agentic Mastery maintains a strict **4-Tier Knowledge Hierarchy** with zero contradictions across tiers:
1. **Tier 1 — Turn-0 Compass (`AGENTS.md` / `CLAUDE.md` / `.cursorrules`)**: Single source of truth for orientation order, non-negotiable invariants, file map, and build/test commands.
2. **Tier 2 — Live State & Turnkey Execution Ledger (`docs/STATE.md` + `docs/plan/EXECUTOR_START_HERE.md`)**: Tracks the exact `Current task`, in-flight files, and gate output. (`docs/NEXT_STEPS.md` is historical archive only).
3. **Tier 3 — Indexed Contracts (`docs/LLM_CONTEXT.md` + `docs/PROTOCOL.md`)**: Complete module & line-number map, wire schema, coordinate conventions, and security boundaries.
4. **Tier 4 — Deep Post-Mortems (`docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`)**: Root-cause analyses, subtle traps, and verification proofs.

When booting or resuming:
1. Run `git status -s` to inspect unstaged changes and the active branch.
2. Read `docs/STATE.md` (lines 1–65) first to identify the exact active task card, then read `docs/plan/EXECUTOR_START_HERE.md`.
3. Read the operational guidelines in `AGENTS.md` and target module entries in `docs/LLM_CONTEXT.md`.
4. Run the fast verification gate (`node tools/run_tests.js --tier fast` or `python tools/smoke_test.py`) to verify workspace health.
5. **NEVER** run recursive directory scans (`**/*`) or dump entire source files into context.

---

## 2. Token & Attention Economics
- **Bounded Reads**: Read only 20–100 lines around target symbols (`Select-String` first to locate line numbers).
- **Surgical String Replacements**: Always use `replace_file_content` with 3 lines of unique context. Never rewrite whole files.
- **No Command Polling**: Never execute `sleep` loops or while-wait commands. When a long task runs asynchronously, yield your turn and await reactive wakeup.

---

## 3. The Decoupling & Extension Doctrine
- **The Golden Rule**: Extend authoritative domain logic; never rewrite it.
- **Zero-Allocation Bridge**: Build headless wrappers emitting structured JSON or binary frames over stdio/IPC.
- **Presentation Disposability**: Keep client UI, 3D renderers, and shaders completely decoupled from authoritative state.

---

## 4. Universal High-Leverage Engineering Laws (`U1–U8`)
- **U1 (Single-Entry-Point 4-Tier Hierarchy)**: Never leave stale task pointers in `docs/STATE.md`. Contradictions between `STATE.md` and `git status` cause smaller models to enter infinite read-only loops.
- **U2 (Anti-Shadowing / No Duplicate Class Members)**: Before editing or adding any method/property in a class >500 lines, search the entire file for `<methodName>(` first. A duplicate method definition later in a class body silently shadows the earlier definition in JS/TS.
- **U3 (Zero Per-Frame Reallocation & Instance/Module Dirty Signatures)**:
  - Never allocate DOM nodes (`innerHTML =`), Canvas2D patterns, or GPU `InstancedMesh`/`MultiMesh` buffers on every animation frame or network tick.
  - Gate all per-frame updates on a compact state signature stored on the **class instance or module scope** (`this._lastToolbarSig`), **never** in a local variable inside `onFrame()` (which resets to `''` every frame!).
- **U4 (Explicit GPU, WebGL & Audio Graph Disposal + Bounded LRU Caches)**:
  - Removing a 3D mesh from a scene graph (`scene.remove(mesh)`) or letting a `CanvasTexture` go out of scope does **not** free GPU VRAM. Always explicitly call `.dispose()` on geometries, materials, and textures on level change or entity despawn.
  - Explicitly `.disconnect()` and `.stop()` procedural Web Audio nodes (`OscillatorNode`, `AudioBufferSourceNode`, `GainNode`, `BiquadFilterNode`) in `onended` callbacks.
  - Bound all server/client memory caches (LRU max entries + TTL sweep) and exclude non-semantic fields (`context`, timestamps) from cache keys.
- **U5 (Bidirectional Contract & Pre-Warm Symmetry)**:
  - Derive protocol command allowlists from the **union** of all valid sender actions and backend handlers.
  - Contract-test client request payloads against server validation regexes (`SAFE_PROSE_RE`).
  - Never retry deterministic client errors (`HTTP 4xx`) in network retry loops.
  - Route speculative pre-warming (`prewarmUtterance`) and live execution (`speakCreatureDialogue`) through the **exact same** option normalizer (`normalizeVoiceOptions`) and deterministic entity hash (`hashId(id) % len`, never `Math.random()`) so pre-warmed cache keys achieve 100% hit rates.
- **U6 (State-Machine Self-Healing on Mode Exit)**:
  - Multi-step client routers (`MenuRouter.pending`) must auto-clear in `onFrame` whenever the authoritative backend exits the expected mode, and async modal loops must wrap execution in `try { ... } finally { ... }` so cancelled/errored flows never leave the UI stuck.
- **U7 (Red-First Atomic Commits & Disjoint Wave File Ownership)**:
  - Write or extend the automated contract test **first** (verify it fails on the bug), apply the surgical fix, verify green, and commit atomically (`1 card = 1 commit`).
  - Partition parallel execution waves strictly by **Target File** so no two concurrent tasks or subagents ever edit the same file in the same wave.
- **U8 (Turnkey Atomic Execution Cards for Fast/Lower-Tier Models)**:
  - When packaging an execution plan for fast models (e.g., Gemini 3.8 Flash) or new contributors, structure every work unit as a self-contained **Execution Card** with:
    1. **Pinned Test-Contract Guardrails ("What NOT to Touch")**: Explicit list of existing test invariants and regexes that must remain untouched.
    2. **Exact File Paths & Line Ranges**: Verified via `Select-String`.
    3. **Copy-Paste-Ready Code Anchor & Replacement**: Eliminating architectural guesswork.
    4. **One-Line Verification Gate**: Exact CLI command that must exit `0` before marking `[x]` in `docs/STATE.md`.

---

## 5. Platform & Media Invariants
- **Audio Mutual Exclusion**: $\text{delay}_i + \text{duration}_i + \text{buffer} \le \text{delay}_{i+1}$.
- **Semantic State**: Never rely on DOM mutations surviving layout loops. Bind UI elements to explicit state booleans.
- **Golden State Vaulting**: Maintain pristine backups of persistent game/data state and restore before automated test runs.
- **Media Streaming & Edge Proxy Invariant (RFC 7233 / 9110)**: Any endpoint serving video/audio requiring timeline seeking/scrubbing MUST use `HTTP 206 Partial Content` with `Accept-Ranges: bytes`, `Content-Range: bytes START-END/TOTAL`, `Cache-Control: no-cache, no-store, must-revalidate`, clamped chunk slices ($\le 4\text{ MB}$), and Service Worker `Range` bypass.
- **True Fullscreen Video, Floating HUD & DOM Target Hierarchy Invariant**: Never conflate a modal wrapper (`#demo-modal`) with the component stage (`.demo-theater-container`). Expand fullscreen stages to `100vw`/`100vh` with dual-engine CSS fallback (`.is-fullscreen`).
- **Standalone Client External Link Decoupling & Distribution Hygiene Invariant**: High-bandwidth video showcases belong strictly on the public website; exclude `assets/video/` from offline builds and route external links via host container interception.

---

## 6. Grounded Truth Standard & Award-Winning Aesthetics
- **Never claim a fix without verification**: Execute test scripts, inspect exit codes, check HTTP status codes, or verify rendered keyframes before reporting completion.
- **Award-Winning Aesthetics Baseline**: Dark obsidian surfaces, radial amber/gold glows, emerald/cyan accents, curated typography (`Cinzel`, `Outfit`, `Fira Code`), zero-jank GPU animations (`transform`/`opacity`), and $\ge 40\times 40\text{px}$ mobile touch targets.

---

## 7. Knowledge Codification
- Whenever an elusive bug, race condition, or OS gotcha is conquered, immediately append a structured entry to `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`:
  - **Failure Mode** $\rightarrow$ **Root Cause** $\rightarrow$ **Architectural Invariant** $\rightarrow$ **Verification Proof**.


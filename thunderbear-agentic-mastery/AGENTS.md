# AGENTS.md — Universal Agent Operating Guidelines Template

## 1. Zero-Turn Orientation Protocol (4-Tier Knowledge Hierarchy)
If starting a new session or recovering from context compaction:
1. Run `git status -s` to inspect active changes and current branch.
2. Read `docs/STATE.md` (lines 1–65) FIRST to see the active task card, then `docs/plan/EXECUTOR_START_HERE.md`. (`docs/NEXT_STEPS.md` is historical archive only).
3. Check `docs/LLM_CONTEXT.md` and `docs/PROTOCOL.md` for indexed file paths, symbol line ranges, and wire contracts.
4. Consult `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md` for historical post-mortems and anti-trap guardrails.
5. Verify workspace health via the primary fast test gate.
6. **DO NOT** execute recursive directory dumps (`**/*`) or dump entire files into context.

## 2. Token, Efficiency & Workflow Rules
- **Targeted Reads**: Locate symbols with `Select-String` / `grep`, then read only 20–100 lines around target symbols.
- **Surgical Edits**: Use exact string replacement tools (`replace_file_content`) with 3 lines of unique context. Never rewrite full files.
- **Anti-Shadowing Check (U2)**: Before adding or editing any method in a class >500 lines, search the entire file for `<methodName>(` so a duplicate definition later in the class does not silently overwrite an earlier one.
- **Avoid Command Polling**: Never run sleep loops or wait scripts in terminals.
- **Atomic Commits & Disjoint Wave Files (U7)**: One task card = one verified commit. Partition parallel tracks strictly by target file.

## 3. Strict Architectural Invariants (`U1–U8`)
1. **Core Domain Authority**:
   - Upstream computational logic remains authoritative. Never rewrite domain logic in presentation layers.
2. **Presentation Disposability & State-Machine Self-Healing (U6)**:
   - Presentation clients must be purely reactive relays. Multi-step UI routers must auto-clear when the backend mode changes and in `finally` blocks.
3. **Zero Per-Frame Reallocation & Instance Dirty Signatures (U3)**:
   - Never rebuild DOM trees or GPU buffers unconditionally per frame. Store dirty-check signatures on the class instance or module (`this._lastSig`), never in local frame variables.
4. **Explicit GPU & Audio Disposal + Bounded Caches (U4)**:
   - Explicitly `.dispose()` GPU geometries/materials/textures on removal, `.disconnect()` finished Web Audio nodes, and bound all LRU caches with normalized keys.
5. **Bidirectional Contract & Pre-Warm Symmetry (U5)**:
   - Derive allowlists from both senders and receivers; contract-test client payloads against server validation regexes; never retry `HTTP 4xx`; and share one `normalizeOptions()` + deterministic hash between speculative pre-warmers and live callers.

## 4. Key File Map
| Domain | File Path | Role |
|---|---|---|
| Live State & Checklist | `docs/STATE.md` | Authoritative active task card, checklist, and gate log |
| Executor Rules | `docs/plan/EXECUTOR_START_HERE.md` | Non-negotiable workflow rules and active lessons |
| Architecture & Index | `docs/LLM_CONTEXT.md` | Module index, symbol line numbers, and invariants |
| Wire Protocol | `docs/PROTOCOL.md` | JSON schemas, allowlists, and REST/WS contracts |
| Lessons Learned | `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md` | Master post-mortems (`Failure` $\rightarrow$ `Cause` $\rightarrow$ `Invariant` $\rightarrow$ `Proof`) |

## 5. Build & Verification Commands
- **Fast Gate (<15s)**: `<fast test command>`
- **Full E2E / Browser Gate**: `<e2e test command>`
- **Native / Engine Smoke Gate**: `<smoke test command>`

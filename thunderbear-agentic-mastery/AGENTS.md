# AGENTS.md — Universal Agent Operating Guidelines Template

## 1. Zero-Turn Orientation Protocol
If starting a new session or recovering from context compaction:
1. Run `git status -s` to inspect active changes.
2. Read the active milestone in `docs/NEXT_STEPS.md` (top 50 lines).
3. Check `docs/LLM_CONTEXT.md` for architectural invariants and file maps.
4. Consult `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md` for historical gotchas and design rationale.
5. Verify workspace health via the primary smoke test.
6. **DO NOT** execute recursive directory dumps (`**/*`) or dump entire files into context.

## 2. Token & Attention Rules
- **Targeted Reads**: Inspect 20–80 lines around target symbols.
- **Surgical Edits**: Use exact string replacement tools with 3 lines of unique context.
- **Avoid Command Polling**: Never run sleep loops or wait scripts in terminals.
- **Output Brevity**: Keep chat responses short, dense, and action-oriented. State the fix, verify it, and record progress.

## 3. Strict Architectural Invariants
1. **Core Domain Authority**:
   - Upstream computational logic remains authoritative. Never rewrite domain logic in presentation layers.
2. **Presentation Disposability**:
   - Presentation clients must be purely reactive relays. Reconnection must restore exact state without domain mutation.
3. **Pristine State Isolation**:
   - Golden test states must reside in an isolated backup vault. Always restore before running destructive automated tests.

## 4. Key File Map
| Domain | File Path | Role |
|---|---|---|
| Core Engine | `src/core/` | Authoritative logic and domain models |
| Protocol Bridge | `src/bridge/` | Zero-allocation telemetry serialization and dispatch |
| Client / UI | `src/presentation/` | Responsive rendering, animations, user input |
| Roadmap Queue | `docs/NEXT_STEPS.md` | Living task queue and session notes |
| Lessons Learned | `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md` | Master architecture, lessons learned & failure modes |

## 5. Build & Verification Commands
- **Core Build**: `<build command>`
- **Client Build**: `<client build command>`
- **Smoke Tests**: `<smoke test command>`

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

## 1. Zero-Turn Orientation Protocol
When booting or resuming:
1. Run `git status -s` to inspect unstaged changes and the active branch.
2. Read the active milestone in `docs/NEXT_STEPS.md` (lines 1–50).
3. Read the operational guidelines in `AGENTS.md`.
4. Run the project smoke test to verify workspace health.
5. **NEVER** run recursive directory scans (`**/*`) or dump entire source files into context.

---

## 2. Token & Attention Economics
- **Bounded Reads**: Read only 20–80 lines around target symbols.
- **Surgical String Replacements**: Always use `replace_file_content` / `multi_replace_file_content` with 3 lines of unique context. Do not rewrite whole files.
- **No Command Polling**: Never execute `sleep` loops or while-wait commands. When a long task runs asynchronously, yield your turn and await reactive wakeup.

---

## 3. The Decoupling & Extension Doctrine
- **The Golden Rule**: Extend authoritative domain logic; never rewrite it.
- **Zero-Allocation Bridge**: Build headless wrappers emitting structured JSON or binary frames over stdio/IPC.
- **Presentation Disposability**: Keep client UI, 3D renderers, and shaders completely decoupled from authoritative state.

---

## 4. Architectural Invariants
- Establish system invariants mathematically and structurally upfront.
- **Audio Mutual Exclusion**: $\text{delay}_i + \text{duration}_i + \text{buffer} \le \text{delay}_{i+1}$.
- **Semantic State**: Never rely on DOM mutations surviving layout loops. Bind UI elements to explicit state booleans.
- **Golden State Vaulting**: Maintain pristine backups of persistent game/data state and restore before automated test runs.
- **Media Streaming & Edge Proxy Invariant**: Any endpoint serving video/audio requiring timeline seeking/scrubbing MUST use `HTTP 206 Partial Content` with `Accept-Ranges: bytes` and `Content-Range`. It must NEVER be served with `public` caching headers to CDN edge proxies (Cloudflare); always emit `Cache-Control: no-cache, no-store, must-revalidate` so proxies mark requests as dynamic, avoiding monolithic 200 chunked responses that destroy browser seekability. Range requests MUST clamp open-ended slices (`bytes=0-`, `bytes=X-`) to safe chunks (e.g. 4MB) under RFC 7233 to prevent Cloud Run / Google Frontend 32MB payload buffer limit failures (`HTTP 500`). Service workers must explicitly return early to bypass media range requests.

---

## 5. Grounded Truth Standard
- **Never claim a fix without verification**: Execute test scripts, inspect exit codes, check HTTP status codes, or verify rendered keyframes before reporting completion.
- Provide dense, action-oriented, factual responses.

---

## 6. Award-Winning Aesthetics Baseline
- Reject plain, default, or unstyled UI frameworks.
- Standard Palette: Dark obsidian surfaces, radial amber/gold glows, emerald/cyan accents, and glassmorphism.
- Typography: Curated fonts (`Cinzel`, `Outfit`, `Fira Code`) over default browser fonts.
- Polish: Responsive mobile touch controls, fluid micro-animations, and high-impact visual first impressions.

---

## 7. Knowledge Codification
- Whenever an elusive bug, race condition, or OS gotcha is conquered, immediately append a structured entry to `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`:
  - Failure Mode
  - Root Cause
  - Architectural Invariant
  - Verification Proof

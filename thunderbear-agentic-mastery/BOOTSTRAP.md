# BOOTSTRAP.md: 5-Minute Agentic Repository Bootstrap Guide

This checklist guides human directors and AI agents in bootstrapping any new or existing repository into an award-winning, agentic-ready workspace.

---

## Step 1: Create the Tri-Factor Index
In your repository root:
1. Copy `AGENTS.md` to repository root.
2. Create `docs/NEXT_STEPS.md` to track the active milestone queue.
3. Create `docs/LLM_CONTEXT.md` to map core symbols, protocols, and coordinate systems.
4. Create `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md` to capture post-mortems and gotchas.

## Step 2: Establish the Smoke Test
Create a single, fast verification script:
- Python: `tools/smoke_test.py`
- Node.js: `npm test`
- Rust/Go: `cargo test` / `go test ./...`
Ensure the smoke test runs in under 5 seconds and tests the primary data bridge.

## Step 3: Define Architectural Invariants
Identify 2–3 mission-critical rules that must never be broken:
- E.g. "Presentation layer never computes authoritative physics/math."
- E.g. "All network messages must validate binary checksums."
- E.g. "All async audio streams must maintain $\ge 1.5\text{s}$ separation."
Record these invariants clearly in `AGENTS.md`.

## Step 4: Configure Token Economics
Ensure large asset folders, raw video recordings, build caches, and node_modules are added to `.gitignore` and `.gcloudignore`.

## Step 5: Activate the Skill
Add `thunderbear-agentic-mastery` to your global or workspace skills:
```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.gemini\config\skills\thunderbear-agentic-mastery" -Force
Copy-Item "SKILL.md" "$env:USERPROFILE\.gemini\config\skills\thunderbear-agentic-mastery\SKILL.md"
```
You are now ready to build at the highest level of human-agent synergy.

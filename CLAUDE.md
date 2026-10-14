# CLAUDE.md — Anthropic Claude & Claude Code Guidance for `angband3d`

Read [`AGENTS.md`](AGENTS.md) FIRST for the complete Turn-0 Orientation Protocol, Key File Map, Rules `L1–L34`, and the 8 Golden Anti-Trap Guardrails.

## 1. Zero-Turn Orientation & Active Plan
1. Run `git status -s`.
2. Read [`docs/STATE.md`](docs/STATE.md) (live task checklist & gate log).
3. Read [`docs/plan/EXECUTOR_START_HERE.md`](docs/plan/EXECUTOR_START_HERE.md) and [`docs/plan/master_audit_and_execution_plan.md`](docs/plan/master_audit_and_execution_plan.md) (**Part VI: Turnkey Execution Runbook**, Cards `1` → `5`).
4. Refer to [`docs/LLM_CONTEXT.md`](docs/LLM_CONTEXT.md), [`docs/PROTOCOL.md`](docs/PROTOCOL.md), and [`docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`](docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md) for deep architecture and post-mortems. (`docs/NEXT_STEPS.md` is archived history only).

## 2. Essential Build & Verification Commands
- **Fast JS/Contract Gate (`<10s`)**: `node tools/run_tests.js --tier fast`
- **Smoke Tests (`11/11`)**: `python tools/smoke_test.py`
- **Build Godot C# & Desktop**: `dotnet build client/angband3d.csproj && dotnet build desktop/Angband3D.csproj`
- **Build Engine (MSYS2)**: `$env:MSYSTEM='MINGW64'; $env:CHERE_INVOKING='1'; & C:\msys64\usr\bin\bash.exe -lc "cd /c/Dev/angband3d/engine && cmake --build build"`
- **E2E & Browser CDP Gates**: `node tools/run_tests.js --tier e2e` and `node tools/run_tests.js --tier cdp`
- **Version Bump & Android Sync (required after any `server/public/` edit)**: `node tools/bump_version.js && npm run android:sync`

## 3. Core Non-Negotiable Rules
- **Targeted Reads & Surgical Edits**: Read 20–100 lines around target symbols; never dump whole files or run `**/*` searches. Check for duplicate class methods (`Select-String`) before adding/editing methods (`L23`).
- **Engine Rebasability**: Keep C/C++ changes strictly in `main-bridge.c/.cpp` and `bridge-json.c/.h`. Export Vanilla patch via `git -C engine diff 4.2.6..HEAD --output=..\engine-patch\0001-bridge-frontend.patch` (never `>`).
- **Input & View Routing**: Never send raw digits (`0`–`9`) for movement/hold (`L2`); use arrow keys and `,`. `-more-` prompts in `play` with `overlay == 0` stay in 3D view (`L16`).
- **Zero Per-Frame Thrashing & Explicit Disposal**: Dirty-gate all per-frame DOM/Canvas/3D updates (`L25`) and explicitly `.dispose()` removed Three.js/Godot textures, geometries, and materials (`L26`).

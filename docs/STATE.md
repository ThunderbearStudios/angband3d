# STATE (live, authoritative). Update after EVERY gate.
Branch: fix/award-pass   Updated: 2026-10-11T15:35-04:00
Plan: docs/plan/EXECUTOR_START_HERE.md (read first), then docs/plan/master_completion_plan.md
Current task: WS1.3   Next command: node tools/run_tests.js --tier fast

> PATH NOTE: the plan says "server.js:NNNN". The real file is **server/src/server.js**. The line numbers were taken before the WS1 edits; after WS1.2, lines below ~2080 shift by about +19. Always re-locate with `Select-String`.

## Checklist
- [x] WS0.1 STATE.md created
- [x] WS0.2 AGENTS.md points to STATE.md + docs/plan
- [x] WS0.3 debug probes reverted (verify_cross_realm_menus.js); branch fix/award-pass
- [x] WS0.4 tools/run_tests.js + tools/test_manifest.json
- [ ] WS0.5 Baselines (EXECUTOR §7): screenshots + current pass/fail of existing tests
- [x] WS1.1 E1 `const line` → `let line` (server/src/server.js stdout loop)
- [x] WS1.2 Relay guard `sanitizeEngineCommand` + ENGINE_VERBS (gate: tools/test_relay_guard.js PASS)
- [ ] WS1.3+ remaining WS1 items (CI boot test etc.; see master plan)
- [ ] G-A API-key history scan (do FIRST in WS4)
- [ ] WS4.* security (CORS, LLM proxy, recording upload, WS maxPayload/Origin, CSP, info leaks, ownership)
- [ ] WS2 menus / action chooser
- [ ] WS6 realm keys (probe first)
- [ ] WS3 Hengband language
- [ ] WS9 GUI
- [ ] WS5 perf/bloat (incl. D16 profile deletion)
- [ ] WS10 Android/PWA/offline (keystore rotation; APK is side-loaded → export saves first)
- [ ] WS7 test consolidation
- [ ] WS8 docs + lessons merged into BEST_PRACTICES
- [ ] G-B..G-K (EXECUTOR §3)

## In-flight (uncommitted) files
- (none)

## Blockers / decisions pending
- (none). Decisions D1–D17 are resolved (master plan §7). APK is NOT on Play Store.

## Baselines
- not yet captured (WS0.5)

## Last gate results
- fast tier: PASS (test_relay_guard.js) | e2e: not run | smoke: not run | dotnet: not run
- Stale server may still be listening on :8080. Kill it before e2e (EXECUTOR L13).

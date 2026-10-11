# STATE (live, authoritative). Update after EVERY gate.
Branch: fix/award-pass   Updated: 2026-10-11T15:35-04:00
Plan: docs/plan/EXECUTOR_START_HERE.md (read first), then docs/plan/master_completion_plan.md
Current task: WS5.1 Lazy Hengband language data

> PATH NOTE: the plan says "server.js:NNNN". The real file is **server/src/server.js**. The line numbers were taken before the WS1 edits; after WS1.2, lines below ~2080 shift by about +19. Always re-locate with `Select-String`.

## Checklist
- [x] WS0.1 STATE.md created
- [x] WS0.2 AGENTS.md points to STATE.md + docs/plan
- [x] WS0.3 debug probes reverted (verify_cross_realm_menus.js); branch fix/award-pass
- [x] WS0.4 tools/run_tests.js + tools/test_manifest.json
- [ ] WS0.5 Baselines (EXECUTOR §7): screenshots + current pass/fail of existing tests
- [x] WS1.1 E1 `const line` → `let line` (server/src/server.js stdout loop)
- [x] WS1.2 Relay guard `sanitizeEngineCommand` + ENGINE_VERBS (gate: tools/test_relay_guard.js PASS)
- [x] WS1.3+ remaining WS1 items (CI boot test etc.; see master plan)
- [x] G-A API-key history scan (done in WS4)
- [x] WS4.1 Sanitize UI Event Streams (innerHTML audit)
- [x] WS4.2 Remove Bring-Your-Own-Key (BYOK) proxy handlers
- [x] WS4.3 Hardening Server CORS & LLM Request Relays
- [x] WS4.4 Ownership Tokens & Action Authorization
- [x] WS4.5 Recording upload hygiene
- [x] WS4.6 Save upload and delete hygiene
- [x] WS4.7 CSP tightening
- [x] WS4.8 Info leaks
- [x] WS4.9 Ownership tokens (light scope)
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
- fast tier: PASS | e2e: PASS | smoke: 11/11 | dotnet: PASS
- Stale server killed, tests passing.

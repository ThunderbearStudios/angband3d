# Execution State (Read First, Update Last)

## Active Task
**v13.3.4 — Waves 0–4C, 9-Realm Menu/PromptMirror & Panel Remediation, Sil-Q Owner Parity, Brotli GLB & Live Production Release — COMPLETE**

- **Checklist** (`v13.3.4`):
  - [x] **Waves 0–1 (Security, `perMessageDeflate`, ResonantOVH & Edge Failover)**: Rootless Podman primary (`yasd3d.service`, `yasd3d.slice` CPUs `4-5,12-13`, `MemoryMax=8G`; strictly isolated from `games.slice` `arma-reforger.service` on `0-3,6-11,14-15`), `vault.db` SQLite WAL + NVMe cache, and Cloudflare Edge Worker `yasd3d-edge` with automatic Cloud Run failover.
  - [x] **Wave 2 (C Bridges, Float32 Meshopt GLBs, 3D HRTF Audio, Opus Music & Sil-Q WASM)**: Protocol v1.3 dirty-row deltas & `128 KiB` `setvbuf`, `+8px` UV dilation + Meshopt GLBs, 3D HRTF SFX (`AUDIO_HRTF_3D`), `57` Opus `.ogg` tracks, Splash boot split, lazy Sil-Q C-WASM (`395.2 KB .br`), and Tier-2 mechanical fidelity upgrades (Brogue/DCSS/Rogue).
  - [x] **Wave 3 (CSS `@layer`, Native `<dialog>`/`popover`, AAA Ergonomics)**: Unified `@layer` tokens (`!important` `3,814 -> 44`), native `<dialog>`/`popover`/Container Queries, 8-slot SVG hotbar, and compact mobile/desktop layout.
  - [x] **Wave 4 (Three.js `r187` Default, KTX2/BasisU, `BatchedMesh` & HDR PostFX)**: `three@0.187.0` ESM (`RENDERER_THREE_V2: true` with `?flag_RENDERER_THREE_V2=0` `r128` rollback), 45 KTX2 BasisU PBR textures, `BatchedMesh` roofs/props, PMREM IBL, tier-gated half-res HDR PostFX (`GTAOPass` + `UnrealBloomPass`), Fresnel Water & Voronoi Lava shaders.
  - [x] **9-Realm Panel, Menu, `PromptMirror` & Wire Perf (`v13.3.3`–`v13.3.4`)**: `extractSpellItems()`, container-scoped `resolveScreenModelItems()`, `{`/`}` & col-50+ actions, zero-empty-overlay CRT fallback, live Settings **`Prompt & Menu Style`** toggle (`window.__setYasdFlag`), Sil-Q `>8`-char `.owner.json` `4403` parity fix (`server.js:3763-3797`), build-time Brotli-11 `.glb.br`/`.ktx2.br`/`.bin.br` (`-39.8%` `precompress_assets.js`), `sw.js` versioned `?v=` precache & 7-day `/assets/*` + `/wasm/*` Edge caching, and `--mute-audio` across CDP/playtest runners.

## Completed Workstreams
| WS | Scope | Status |
| :--- | :--- | :--- |
| WS0–WS95 | 9 Realms, 3D Bestiary, Codex, Checkpoints, Linux `0.<slot>` Parity (`v12.0.0–v13.1.4`) | `[x]` |
| Wave 0–1 | Hardening, `perMessageDeflate`, ResonantOVH Podman Cutover & Cloudflare Failover (`v13.3.0`) | `[x]` |
| Wave 2A–2C2 | Protocol v1.3, Meshopt GLBs, 3D HRTF Audio, Opus OGG, Sil-Q WASM & Tier-2 Soul (`v13.3.0-w2c2`) | `[x]` |
| Wave 3A–3C | Dual-Reality Menus, 8-Layer `@layer` CSS, `<dialog>`/`popover`/Container Queries (`v13.3.0-w3c`) | `[x]` |
| Wave 4A–4C | Three.js `r187` ESM Default, KTX2 BasisU, `BatchedMesh`, PMREM IBL & HDR PostFX (`v13.3.0-w4c`) | `[x]` |
| v13.3.3–v13.3.4 | 9-Realm Panel & `PromptMirror`/Spell/Cartridge Fixes, Sil-Q `4403`, `.glb.br`, Muted Soak | `[x]` |

## Mandatory Verification Gate
1. `node tools/run_tests.js --tier fast` (`61/61`) 2. `node server/test/server_test.js` (`24/24`) 3. `python tools/smoke_test.py` (`11/11`) 4. `node tools/test_9realm_menu_prompts_e2e.js` (`10/10`) 5. `node tools/verify_visual_and_perf_gate.js` (`7`-VP PASS, `189.39 MB`, Town `43.52 MB` VRAM) 6. `node tools/playtest/cli.js` (L1 `10/10` + L2 `10/10` `40`-turn soak, `0` bugs) 7. `node tools/check_loc_budget.js && node tools/check_version_sync.js` (`v13.3.4`).

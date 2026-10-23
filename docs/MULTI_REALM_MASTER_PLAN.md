# Multi-Realm Master Architecture & Implementation Index

> For the active implementation roadmap and live operational state, consult:
> - [`docs/STATE.md`](STATE.md) — Live checklist, gate results, and current task
> - [`docs/LLM_CONTEXT.md`](LLM_CONTEXT.md) — Architectural invariants, file map, and symbol index
> - [`docs/PROTOCOL.md`](PROTOCOL.md) — Wire protocol and API specifications

---

## 1. Supported Variant Pantheon
Angband3D unifies four canonical roguelike engines into a shared first-person 3D world with native CRT terminal fallbacks:

| Realm | Upstream Version | Key Characteristics & Mechanics |
|---|---|---|
| **Vanilla Angband** | 4.2.6 | Canonical Morgoth quest, 100 dungeon levels, 50ft/level, classic stores, d-pad movement. |
| **Sil-Q** | 1.5.0 | Tolkien-accurate Beleriand setting, 20 levels, 50ft/level, skill-based progression, 2-phase inventory command prompts (`Command:`), special keys (`w` wield, `r` remove gear, `%` rest). |
| **FrogComposBand** | 7.1.1 | 50+ classes, wilderness overworld, Outpost starter town, tabbed `Inventory \| Equipment` gear UI (`obj.c`), demigod/monster races. |
| **Hengband** | 3.0.1 | Eastern mythos, Japanese native string encoding (CP932/UTF-8), runtime atomic bilingual translation (`heng-translate.js`), bounty office, special shop features. |

---

## 2. Core Architectural Invariants
1. **Engine Rebasability**:
   - Upstream engine C code remains vanilla and rebasable. Engine bridge code is isolated to `engine/src/main-bridge.c` and `engine/src/bridge-json.c`.
2. **Unified Input & Key Mapping**:
   - All client key bindings route through `server/public/js/realm-keys.js` (`RealmKeys.get(realm)`). Never hard-code numeric key codes or raw digits for movement (which represent repeat counts in Angband).
3. **Pure Screen Classification**:
   - `server/public/js/screen-context.js` (`ScreenContext.classify(frame)`) classifies game screens into pure semantic models (`mode: 'menu' | 'item-list' | 'prompt' | 'text'`, etc.) independently of client rendering.
4. **Contextual Action Routing**:
   - `server/public/js/menu-router.js` handles action-chooser item verbs and contextual actions across all four variants.
5. **Security & Session Hygiene**:
   - Owner tokens (`X-Owner-Token`, `{t:'owner', token}`) protect character saves and prevents unauthorized overwrite or deletion. Rate limits protect LLM/TTS endpoints. Wildcard CORS is prohibited.
6. **Cross-Platform Parity**:
   - Identical web assets run in Desktop WebView2, Android PWA/Capacitor, Godot C# client, and Cloud Run Docker container. Asset versions are synchronized via `version.json` and validated with `tools/check_version_sync.js`.

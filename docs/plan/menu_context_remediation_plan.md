# Angband3D: Cross-Realm Menu Context Remediation Plan

> [!IMPORTANT]
> This is a **planning document only**. No production code was changed while writing it.
> The next agent should follow the phases **in order**. Each phase ends with a verification gate, and you don't move on until that gate passes.

---

## 0. Executive Summary

**What you see:** You open the inventory, press or tap an item letter, and the game runs whatever *command* is bound to that letter instead of acting on the item. This happens in Sil-Q, Hengband and FrogComposBand, and the context buttons don't fit the screen you're on.

**Why it happens:** the variants fall into three different menu designs, and the web client treats all of them the same way: it sends the raw letter.

| Realm | Upstream behavior after `i` | What a raw letter does now | Verdict |
|---|---|---|---|
| **Vanilla 4.2.6** | `get_item("Select Item:")` → `context_menu_object()` | Picks the item, then opens a native action menu | ✅ Engine works. ⚠️ Client may misread the follow-up action menu |
| **Sil-Q 1.5.0** | `(Inventory) Command:` → `p_ptr->command_new = inkey()` | Runs **the command** bound to that letter (`c` = Close door) | ❌ Broken |
| **Hengband 3.0.1** | `持ち物： … コマンド:` (same 2.x `command_new` pattern) | Runs **the command** (`a` = Aim wand → "使える魔法棒がない。", "You have no wand to aim") | ❌ Broken (confirmed live) |
| **FrogComposBand** | `Inventory \| Equipment` gear UI. Letter opens the item **description** | Shows `[Press Any Key to Continue]`. No action menu | ⚠️ Works, but no way to act on the item, and the follow-up screen gets the wrong context |

The engines in Sil-Q and Hengband are working as designed. Their inventory screen is a *display followed by a command prompt*, not an item picker. So the fix belongs in the **client**: turn an item selection into the engine's native `verb + item` sequence. No engine game logic changes, and the RNG is untouched.

**Why the tests "passed 100%":** `tools/verify_cross_realm_menus.js` sends keys straight over the WebSocket. It **never goes through `input.js` or `app.js`**, which is where the bug lives. It also never selected an item by letter; it only tested verb-first flows (`w` then `b`). A green suite alone can't be trusted here; it needs to be redesigned (Phase 5).

---

## 1. Audit Findings (Ranked)

### P0: Latent server crash (fix first)
[server/src/server.js:2284-2292](file:///c:/Dev/angband3d/server/src/server.js#L2284-L2292):
```js
const line = lineBuffer.substring(0, newlineIdx).trim();   // const
...
line = '{"t":"frame","realm":"' + session.realm + '",' + ...; // reassignment → TypeError
```
Reassigning a `const` throws on **every frame** whenever `session.realm` is set. The server on port 8080 (PID 5068) is almost certainly running **older code**, which is the only way frames are still arriving. **The next server restart will break every session.** Fix: change it to `let line`. This is a one-word change and the top priority.

### P1: Item selection runs commands (Sil-Q, Hengband)
- Sil-Q source: [cmd3.c:218-257](file:///c:/Dev/angband3d/variants/silq-src/src/cmd3.c#L218-L257). `do_cmd_inven()` / `do_cmd_equip()` store `inkey()` in `command_new` and set `command_see = TRUE`. The next dungeon-loop pass runs that key **as a command**. Because `command_see` is set, the item list shows up at the following `get_item` prompt.
- This also means **chaining works natively**: sending `w` then `c` from `(Inventory) Command:` wields slot `c`. This was confirmed with `w`→`b` (torch) in the existing test.
- Hengband shows the same behavior (live probe: `i`, `a` → Aim Wand).
- Two code paths send the raw letter today:
  1. Keyboard: [input.js handleTerminalKey:1044-1049](file:///c:/Dev/angband3d/server/public/js/input.js#L1044-L1049) (`keySpec = e.key` → `sendKey`).
  2. Ribbon/touch: [app.js:682-686](file:///c:/Dev/angband3d/server/public/js/app.js#L682-L686) (`term-letter-btn` → `network.sendKey(key)`).

### P1: Context mis-detection after selection
- FrogComposBand: the description screen (`[Press Any Key to Continue]`) doesn't match `isItemPrompt` ([app.js:4060-4097](file:///c:/Dev/angband3d/server/public/js/app.js#L4060-L4097)). It falls through to the **Classic Dungeon** branch, so you get 3D View, Pack and Gear buttons, which is the wrong context.
- Vanilla: the `context_menu_object()` action menu ("Command for …") is only detected inside the **store** branch (`isStoreContextMenu`, [app.js:4631](file:///c:/Dev/angband3d/server/public/js/app.js#L4631)). Outside a store it's probably misclassified. **This needs to be checked with a live frame capture.**

### P2: Duplicated screen detection (bloat and drift)
The same screen-classification heuristics live in **five** places and have already drifted apart:
- `isChoiceMenu` / `isReviewScreen`: [input.js:889-926](file:///c:/Dev/angband3d/server/public/js/input.js#L889-L926) **and** [app.js:692+](file:///c:/Dev/angband3d/server/public/js/app.js#L692)
- `isItemPrompt` / `hasStoreText` / `isTargeting`: [app.js:4032-4099](file:///c:/Dev/angband3d/server/public/js/app.js#L4032-L4099)
- `detectMode`: `terminal.js`
- `needsTerminal`: [app.js:4938-4999](file:///c:/Dev/angband3d/server/public/js/app.js#L4938-L4999) plus the C# mirror [Main.cs NeedsTerminal / IsInContextMenu](file:///c:/Dev/angband3d/client/scripts/Main.cs#L1290-L1314)
- Test copies: `evalIsItemPrompt` / `evalNeedsTerminal` in `tools/verify_cross_realm_menus.js`

### P2: Security on the stdin relay
[server.js attachWebSocketToSession:2114-2117](file:///c:/Dev/angband3d/server/src/server.js#L2114-L2117) writes `str.trim() + '\n'` straight to engine stdin:
- **Newline injection:** `trim()` keeps *internal* `\n`, so `"key a\nquit"` runs `quit`, which exits **without saving**.
- **Rate-limit bypass:** one `keys <long string>` frame counts as 1 of the 60/sec limit but can queue hundreds of keypresses.
- **No command allowlist:** clients can send `map off`, `quit`, and anything else the bridge accepts.

### P3: Hygiene
- Debug logging and an un-asserted `'a'` probe I added to `tools/verify_cross_realm_menus.js` (FCB around L542-563, Hengband around L599-611). Turn these into real assertions or revert them.
- Scratch files in the working tree: `tools/scratch_test_labels.js` and `tools/scratch_test_regex_all.js`. **Confirm with the user before deleting.**
- `docs/NEXT_STEPS.md` is about 398 KB, and `MULTI_REALM_MASTER_PLAN.md` about 297 KB. That's too large for agent context. Archive older entries (see Phase 7).

---

## 2. Design Principles

1. **Engine stays untouched.** All of the fix lives in client JS, with an optional Phase 6 additive bridge field.
2. **One source of truth.** A single screen classifier is shared by keyboard, touch, toolbar and tests.
3. **Item-first everywhere.** Pick an item, then pick an action, as in Vanilla 4.2. Each variant gets its native key sequence underneath.
4. **No guessing that can misfire.** Show an action chooser rather than inferring "the" action from a name. A suggested default is shown but never sent automatically.
5. **Degrade safely.** If the client can't parse a screen, the raw key goes through exactly as it does today. The new code adds behavior without removing any.
6. **Test the real path.** The tests have to go through `input.js` / `app.js`, not just the socket.

---

## 3. Target Architecture

### 3.1 New module: `server/public/js/screen-context.js` (pure functions, about 200 lines)
UMD-style, so it loads in the browser (`window.ScreenContext`) and in Node tests (`module.exports`).

```js
// classifyScreen(frame, realm) → stable descriptor; NO DOM, NO network.
{
  mode: 'birth' | 'review' | 'name' | 'store' | 'targeting' | 'yesno' | 'quantity'
      | 'item-list'        // inventory/equipment display or "which item?" prompt
      | 'item-actions'     // Vanilla context_menu_object / FCB-like action list
      | 'press-any-key'    // FCB description, "[Press Any Key to Continue]", 何かキーを押して
      | 'world' | 'terminal',
  listKind: 'inven' | 'equip' | 'quiver' | null,
  promptKind: 'command' | 'select' | null, // 'command' = Sil-Q/Heng "Command:" prompt (letters are VERBS)
  verbPrompt: 'wear'|'remove'|'drop'|'examine'|'throw'|'fire'|'quaff'|'read'|... | null,
  items: [{ key:'c', label:'a Short Bow', glyph:'}' | null }],  // reuses the ribbon regex + cleaners
}
```
- Move the regexes and label cleaners out of `populateLetterRibbon` ([app.js:4158-4251](file:///c:/Dev/angband3d/server/public/js/app.js#L4158-L4251)) unchanged, **including** the Hengband `decodeHengbandText` path and the `(nothing)`/`なし` filters.
- `needsTerminal(frame)` moves here too, unchanged in logic.
- `app.js`, `input.js`, `terminal.js` and the test harness all **call** this module. Delete the copies only after the parity gate in Phase 2 passes.

### 3.2 New module: `server/public/js/menu-router.js` (about 150 lines)
The single entry point for every menu keypress or ribbon tap:

```js
MenuRouter.route(key, frame, realm) → boolean   // true = handled; false = caller sends raw key (today's behavior)
MenuRouter.onFrame(frame, realm)                 // advances a pending two-phase dispatch
MenuRouter.pending                               // { item, listKind, step, verb, deadline } | null
```

**Behavior by realm:**

| Context | Realm | Letter / tap on an item | Then |
|---|---|---|---|
| `item-list` + `promptKind:'command'` | Sil-Q, Hengband | Intercept. Set `pending.item`, show the **Action Chooser** | You pick a verb → `dispatch(verb, item)` |
| `item-list` (gear UI) | FCB | Intercept. Show the Action Chooser (Examine is one choice and uses the native letter) | Same |
| `item-list` + `promptKind:'select'` | All (e.g. "Wear/Wield which item?") | **Pass through.** The engine is already asking for an item | None |
| `item-actions` | Vanilla | **Pass through.** The native menu handles it | None |
| anything else | All | Pass through | None |

**`dispatch(verb, item)`: two-phase and name-matched.** This is robust even if letters get relabeled:
1. Send `key <verb>`. Set `pending.step = 'await-prompt'` and `deadline = now + 1500ms`.
2. On the next frames (`onFrame`): if `classifyScreen` shows `promptKind:'select'`, find the row whose `label` matches `pending.item.label` (normalized, ignoring quantity prefixes) and send **that** row's key.
3. If the item isn't listed (the engine filtered it out because it isn't valid for the verb): send `escape` and toast "Can't <verb> that item".
4. If the prompt shows no list, which happens in 3.x variants unless `command_see` is set, fall back to the original slot letter. Labels in Sil-Q, Heng and FCB are slot-based, so this is safe.
5. If the engine returns a message, `-more-` or `awaiting_command`, clear `pending`. On deadline expiry, clear `pending` and leave the screen alone.

> [!NOTE]
> Why not just send `keys wc` in one go? It works in Sil-Q, where letters are slot-stable and the list is shown. But a single-shot send can't detect "not applicable" or relabeling, and FCB's `obj_prompt` labels still have to be verified. Use name-matching as the default path. A live probe can whitelist one-shot `keys` per realm later if the latency matters.

**Keyboard rules on a `command` prompt (Sil-Q/Heng):**
- A lowercase letter that matches a **listed item row** is an item selection and opens the Action Chooser.
- Anything else (uppercase, symbols, letters with no row, `Esc`, `/`, space) passes through unchanged, so the native verb-first path still works.
- While the Action Chooser is open: the verb hotkeys shown on its buttons dispatch the action, and `Esc` closes the chooser **client-side only** (nothing is sent, and the inventory stays open).

> [!WARNING]
> Trade-off to document for players: in the Sil-Q/Heng inventory screen, letter keys now mean *items*, not commands. You can still go verb-first from the world (`w`, then the item), which is the standard Sil/Heng habit, so nothing is lost. The current verb buttons (`[w] Wear/Wield`, `[d] Drop`, and so on) stay as clickable buttons in the `termCtxActions` bar.

### 3.3 Verb tables (data, not code paths)
Keep these in `menu-router.js` as one frozen object per realm. **Every entry marked ⚠ must be checked against engine source before shipping** (Sil-Q: `variants/silq-src/src/dungeon.c` `process_command`; Hengband: `variants/hengband-src` command table; FCB: `variants/frogcomposband-src` command dispatch).

| Action | Sil-Q | Hengband | FCB | Shown when (glyph or slot) |
|---|---|---|---|---|
| Wear / Wield | `w` | `w` | `w` | weapons `\|/\\}` armor `([)` jewelry `="` light `~` ammo `{` |
| Take off | `r` ✔ (verified) | `t` ⚠ | `t` ⚠ | equipment list only |
| Eat | `E` ⚠ | `E` | `E` | `,` |
| Quaff | `q` | `q` | `q` | `!` |
| Read | n/a (Sil has no scrolls) ⚠ | `r` | `r` | `?` |
| Use staff | `u` ⚠ | `u` | `u` | `_` |
| Aim wand | n/a ⚠ | `a` | `a` | `-` |
| Zap rod | n/a | `z` | `z` | `-` |
| Activate | ⚠ | `A` | `A` | equipment |
| Throw | `t` ✔ (verified, *not* `v`) | `v` | `v` | always |
| Drop | `d` | `d` | `d` | always |
| Examine | `x` ⚠ | `I` ⚠ | `I`, or the native letter in the gear UI | always |
| Destroy / Ignore | `k` ⚠ | `k` ⚠ | `k` ⚠ | always (confirm prompt is handled by the existing `isYesNoPrompt`) |

- **Glyph source:** Hengband and FCB print the object glyph in the list (`a) , 7つの 食料`). Sil-Q may not; if `glyph` is null, show all applicable verbs and let the engine refuse invalid ones with its own message.
- **Suggested default** (gold button, first in the list): Wear for wearables, Eat/Quaff/Read/Use by glyph, Take off in the equipment list. Display only; never sent automatically.

---

## 4. UI Spec: the Action Chooser

- Shown in the existing `#term-contextual-actions` bar. Title: `🎒 c) a Short Bow — choose action`. No new DOM containers and no new CSS beyond one `.term-ctx-btn.is-suggested` modifier.
- Buttons: `[w] ⚔ Wear/Wield` (suggested), `[t] 🎯 Throw`, `[d] 📦 Drop`, `[x] 🔍 Examine`, `[k] 🗑 Destroy`, `[Esc] ⎋ Back`.
- The letter ribbon stays visible, so tapping another item switches `pending.item`.
- Labels use the existing `hengLabel(en, bilingual, jp)` helper for Hengband.
- Accessibility: buttons are real `<button>` elements; give the chooser container `aria-live="polite"` so the change is announced. Visual polish (glass styling, focus ring, keyboard navigation, suggested-verb highlight) follows spec **WS9.7**. That section styles **this** bar; it does not add a second modal.
- `press-any-key` mode: one gold `[␣] Continue` plus `[Esc] Close`. This fixes FCB descriptions and every other "[Press Any Key]" screen.
- `item-actions` mode (Vanilla): title `⚔ CHOOSE ACTION FOR ITEM`, letter ribbon built from the menu entries, `[⏎] Select` and `[Esc] Back`. Pull it out of the store-only branch so it applies everywhere.

---

## 5. Phased Execution Plan

### Phase 0 and Phase 1: SUPERSEDED, do not execute
> [!CAUTION]
> Use **master plan WS0** (branch `fix/award-pass`, STATE.md, test runner) and **WS1** (crash fix, relay guard, WS limits, CI boot test) instead. The allowlist that used to be here (`key|keys|frame|map|ping`) **omitted `save`**, which the client sends 5 times (network.js:290). Shipping it would have broken saving. The correct allowlist is in master WS1.2: `key, keys, frame, map, save, ping`.

**Binding additions from the master plan (apply them during Phases 2-5):**
- Vanilla and FCB frames already contain `frame.player.inventory[]` (slot, name, tval, ...; Vanilla also has `label`). Prefer it over screen-scraping for those two realms (master WS2.a). FCB slots are 1-based; confirm the letter mapping against a live row.
- Hengband: match items on the **raw JP** row text; display through `translateName()` (master WS2.b).
- Verb keys come from `REALM_KEYS` in `realm-keys.js` (spec WS6) once it lands; the table in 3.3 is the interim source.
- No classic-letters toggle (D7). Every label goes through `textContent`/`escapeHtml` (master WS4.1).

### Phase 2: Extract `screen-context.js` (pure refactor, zero behavior change)
1. **Before any refactor, capture golden fixtures:** a small Node script (`tools/capture_menu_fixtures.js`) drives each realm over WS and writes frames to `tools/fixtures/menus/<realm>/<screen>.json` for: world, `i`, `e`, item-letter result, `w` prompt, remove prompt, store browse/buy/sell, `-more-`, `[Press Any Key]`, a Vanilla `context_menu_object`, y/n, quantity, targeting, and a birth choice screen.
2. Create `screen-context.js` by **moving** the existing logic (`needsTerminal`, `isItemPrompt`, `hasStoreText`, `isTargeting`, `isChoiceMenu`, `isReviewScreen`, and the ribbon item extraction). Change no heuristics.
3. Add `tools/test_screen_context.js` (Node, offline). For every fixture, assert that `classifyScreen` matches a hand-checked expected value **and** that the old inline functions (temporarily kept) agree with the new module.
4. Switch callers to the module one file at a time: `app.js` → `input.js` → `terminal.js` → test harness. Run the offline test after each switch.
5. Add the `<script src="js/screen-context.js">` tag in `index.html` **before** `input.js` / `app.js`. Check `server/public/sw.js` for a precache list or version string and bump it; otherwise PWA users keep stale JS. A grep found no `CACHE` token, so read the file to confirm its strategy.
6. Delete the old inline copies only after parity is 100%.

**Gate:** offline fixture tests 100%; WS suite green; birth-flow suites green (`tools/test_heng_cdp_automation.js`, `tools/test_3d_labels_and_terminal_language.js`); manual smoke in the browser for each realm.

### Phase 3: Add the new classifications (additive)
1. `promptKind:'command'` for: Sil-Q `(inventory) command:` / `(equipment) command:`; Hengband first row containing `持ち物：` or `装備：` **and** `コマンド:`. Use the fixtures to confirm the exact strings.
2. `mode:'press-any-key'`: `press any key`, `[press any key to continue]`, and the Hengband equivalent (pin it from a fixture).
3. `mode:'item-actions'`: Vanilla `context_menu_object` (pin from a fixture), no longer limited to stores.
4. FCB gear UI: `inventory | equipment` → `item-list`, with `promptKind:'command'`-like handling (letters get intercepted).
5. Wire the toolbar (`updateTerminalToolbar`) to render the `press-any-key` and `item-actions` contexts.

**Gate:** new fixture expectations pass; old fixtures unchanged.

### Phase 4: `menu-router.js` and the Action Chooser
1. Implement the router (section 3.2) and the verb tables (section 3.3). **Resolve every ⚠ by reading engine source** and write the citation as a comment next to each entry.
2. Integration points. These are the only call sites, so keep the diff small:
   - [input.js handleTerminalKey](file:///c:/Dev/angband3d/server/public/js/input.js#L1044-L1050): before `sendKey(keySpec)`, run `if (window.MenuRouter?.route(keySpec, lastFrame, realm)) return;`
   - [app.js:683](file:///c:/Dev/angband3d/server/public/js/app.js#L683-L686) (`term-letter-btn`): same guard.
   - The `term-ctx-btn` click handler: chooser buttons carry `data-verb="w"` and call `MenuRouter.chooseVerb('w')`.
   - The `network.onFrame` handler in `app.js`: call `MenuRouter.onFrame(frame, realm)` **before** `updateViewMode`.
3. `route()` returns `false` on any parse uncertainty, so today's raw-key behavior applies.
4. Clear `pending` on: `Esc`, realm change, disconnect, `phase !== 'play'`, death, and `awaiting_command === true` with `overlay === 0`.

**Gate:** offline router unit tests with a fake network that records keys sent:
- Sil-Q fixture `i` + `c` → chooser shown, nothing sent. `chooseVerb('w')` → sends `w`. Feeding the `w`-prompt fixture to `onFrame` → sends `c`.
- Hengband `i` + `a`(food) + `E` → `E`, then `a`.
- Item not in the verb list → `escape` and a toast.
- Uppercase or unlisted letters pass through.

### Phase 5: Real end-to-end verification (fixes the false-green problem)
1. **Extend `verify_cross_realm_menus.js` with state assertions, not just screen text:**
   - Sil-Q: `i` → letter for "Bow" → Wear → assert `player.bow_item` is set (or the equipment row contains "Bow"). `i` → food → Eat → food count goes down. `e` → weapon → Remove → it shows in the inventory.
   - Hengband: `i` → food → `E` → count 7→6 (or the eat message). `e` → slot → take off.
   - FCB: `i` → torch → Wield. `e` → slot → take off. Check the description flow ends on `press-any-key`, then Continue.
   - Vanilla: `i` → `a` → classifier reports `item-actions` → choose → state change.
   - These WS tests drive the **router module in Node** (it's UMD), so they exercise the same routing logic as the browser.
2. **Browser-level (CDP) test** modeled on `tools/test_heng_cdp_automation.js`: open inventory, **click a ribbon button**, click a chooser verb, assert the state change. This is the only test that proves the DOM wiring.
3. Regression gates: store multi-purchase (Vanilla), Sil-Q verb-first (`w`→letter from world), Escape returns `overlay === 0`, birth suites, `smoke_test.py` 11/11, `dotnet build` with 0 errors.

**Gate:** everything above green on two consecutive runs. Engine RNG makes runs differ, so look up items by **name**, never by a fixed letter.

### Phase 6 (optional, later): structured inventory over the bridge
If screen-scraping still proves fragile, add an **additive** `inven: [{slot, name, tval, wearable}]` field to each variant's `main-bridge.c` frame. This is allowed by the AGENTS.md rules (bridge files only; new fields are protocol-v1 compatible per PROTOCOL.md). Then re-export the engine patch with `--output=`. The router would prefer `frame.inven` when present and fall back to the classifier otherwise. Don't do this in the same pass as Phases 1-5.

### Phase 7: Docs and hygiene
1. Update `docs/PROTOCOL.md` with the relay allowlist and length limits.
2. Update `docs/LLM_CONTEXT.md` with the new modules (`screen-context.js`, `menu-router.js`) and the rule that all menu keys go through `MenuRouter.route`.
3. Update `docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md`:
   - The "Command: prompt ≠ item picker" lesson.
   - The "WS tests bypass the client" lesson.
   - The `const line` crash.
4. Add a short entry at the top of `docs/NEXT_STEPS.md`, and move entries older than about 30 milestones to `docs/archive/NEXT_STEPS_HISTORY.md`. That archive is a new file, so get user approval first.
5. Remove the scratch files **after asking the user**, and revert the temporary debug logging in the test harness.

---

## 6. Regression Risk Register

| Risk | Mitigation |
|---|---|
| Intercepting letters breaks verb-first habits inside the inventory | Only lowercase letters **that match a listed row** are intercepted; verb buttons stay; verb-first from the world is untouched |
| Hengband JP text varies (bilingual decode) | Classify from fixtures captured in all three language modes; reuse `decodeHengbandText` |
| Heuristic drift between browser and tests | One UMD module loaded by both; remove the copies |
| PWA serves stale JS | Bump the service-worker version and verify a hard reload |
| Two-phase dispatch hangs | 1500 ms deadline; `pending` cleared on any unexpected screen; raw-key fallback |
| Relay allowlist blocks a legitimate client command | Grep `sendCommand(` and `sendKey(` across `server/public/js` and the demo player/recorder before finalizing the allowlist (known: `keys .<dir>` for running, from [input.js:1016](file:///c:/Dev/angband3d/server/public/js/input.js#L1016)) |
| Godot C# client divergence | The C# client runs Vanilla only, where native context menus already work; leave it alone unless multi-realm reaches Godot |
| Demo record/replay | Check `demo-recorder.js` / `demo-player.js` replay frames, not routed keys, before enabling the router during playback |

---

## 7. Definition of Done
- [ ] P0 `const line` fixed; server restarts cleanly.
- [ ] Relay rejects multi-line, oversized and non-allowlisted commands; no regressions.
- [ ] One `screen-context.js` is the only screen classifier; duplicates deleted.
- [ ] In Sil-Q, Hengband and FCB, picking an item opens an action chooser, and every chosen action changes game state as expected.
- [ ] Vanilla item action menu and FCB "Press Any Key" screens show the correct context buttons.
- [ ] Offline fixture tests, WS state-assertion tests, and one CDP click-through test pass on two consecutive runs.
- [ ] `smoke_test.py` 11/11; `dotnet build` 0 errors / 0 warnings.
- [ ] Docs updated; scratch files removed with approval; net line count in `app.js`/`input.js` **goes down**.

---

## 8. Resolved Questions (see master plan Decisions)
1. Letter semantics: **item-first + Action Chooser** (D1).
2. After an action: **native per-realm behavior** (D3).
3. Old docs and scratch files: **archive (move), never delete** (D4).

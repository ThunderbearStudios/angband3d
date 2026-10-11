# Angband3D: Language, Input, GUI and Platform Spec (WS3, WS6, WS9, WS10)

> [!IMPORTANT]
> This is a companion to [master_completion_plan.md](file:///C:/Users/brian/.gemini/antigravity-ide/brain/006dfba9-9cb3-42f2-aefe-45e00975340d/master_completion_plan.md), which holds the executor protocol, global order, decisions and Definition of Done. Read §0 of the master plan first. Every task below has the same shape: **Why → Files → Steps → Tests → Gate → Rollback → Regression watch.**

---

## WS3: Hengband Language (D2, D8)

### 3.0 Facts verified in this audit (don't re-investigate)
| Fact | Evidence |
|---|---|
| The engine always runs the JP binary; the client translates | network.js:110-113 sends `lang`, but translation happens client-side in `heng-dict.js` |
| Upstream has **9,266** `_("ja","en")` macro pairs in `variants/hengband-src/src/**` | `Select-String '_\("'` count |
| Upstream names live in **UTF-8 JSONC** files: `lib/edit/BaseitemDefinitions.jsonc`, `ArtifactDefinitions.jsonc`, `EgoDefinitions.jsonc`, `MonraceDefinitions.jsonc`, `TerrainDefinitions.jsonc`, `DungeonDefinitions.jsonc`, `SpellDefinitions.jsonc`, `ClassMagicDefinitions.jsonc`, `MonsterMessages.jsonc` | `Get-ChildItem lib/edit` |
| Name format: `"name": { "ja": "食料", "en": "& Ration~ of Food" }`. EN names carry Angband markers: `&` (article slot) and `~` (plural slot) | BaseitemDefinitions.jsonc |
| Source files are UTF-8. PowerShell shows mojibake **only** because of the console code page | Decoding as CP932 produced classic UTF-8-as-SJIS garbage |
| `setLanguageMode` already re-renders the terminal, HUD, toolbar, nameplates and captions | app.js:3141-3175. **E7 is mostly a coverage problem, not a re-render problem** |
| The HUD message feed stores `rawText` and re-translates on render | hud.js:1280-1284 (good: switching modes re-translates history) |
| Translation call sites: hud.js 346, 453, 1284, 1693, 1783; terminal.js 609; dungeon3d.js 5757, 8639; app.js ribbon 4203 | grep |

### 3.1 Observed defects (EN mode; from user screenshots). Each becomes a fixture test
| ID | Surface | Observed | Expected | Root cause |
|---|---|---|---|---|
| L1 | Message log | `Blubbering idiotにダメージを与えた。` | Whole EN sentence, or whole JP line (D8) | Name-substitution fallback runs when no template matches, producing mixed lines |
| L2 | Topline (top-left strip) | Birth prompt `キャラKutarの名前を入力して下さい: Corwin_58` persists in play | Empty, or the current message (translated) | Stale row 0 kept across the setup→play transition |
| L3 | 3D item caption | `泣きじゃくる白痴の死体` | EN corpse name | Corpse pattern exists, but the monster lookup misses (incomplete monster dict) |
| L4 | Footer gear pill (`#footer-gear`) | `ブロード・アックス (2d6) (+0,+0)` | `Broad Axe (2d6) (+0,+0)` | `getLocalizedItemName` doesn't split off dice and bonus suffixes |
| L5 | Classic inventory rows | `6つの & Ration~ of Food`, `7つの & Wooden Torch~(2,500TURN の寿命)`, `Lv1 Lifeの Magic 書[Book of Common Prayer]` | `6 Rations of Food`, `7 Wooden Torches (2,500 turns)`, the EN book name | Raw EN edit-file names inserted without `&`/`~` rendering; JP counters and kind suffixes not parsed |
| L6 | Inventory header | `Inventory: 合計 18.8 kg (限界の32%) コマンド:` | `Inventory: Burden 18.8 kg (32% of capacity). Command:` | Header is translated piecemeal |
| L7 | Sidebar | `1日目 6:22`, `辺境の地`, `学習` | `Day 1 6:22`, the EN town name, `Study` | Missing row terms |
| L8 | Message log start | `Welcome to the Town of Angband!` in every realm | Realm-correct text | Hard-coded string at hud.js:1840 |
| L9 | Ribbon labels | Uses `JP_TERM_TRANSLATIONS[label]` or `HENG_DICT.DATA.items[label]` (app.js:4203) | One `translateName()` call | Duplicate lookup logic |

### 3.2 Target architecture
```
tools/gen_heng_dict.js  (offline, deterministic, committed output)
   ├─ reads variants/hengband-src/src/**/*.{c,cpp,h}  → template pairs
   ├─ reads variants/hengband-src/lib/edit/*.jsonc    → name pairs
   └─ writes server/public/js/heng/
         heng-names.json       { "ja": "en", ... }               (names, already marker-normalized per §3.4)
         heng-templates.json   [[jaPattern, enFormat, argKinds], ...] (sorted, bucketed)
         heng-manifest.json    { sourceHash, counts, generatedAt, conflicts }
server/public/js/heng/heng-translate.js  (≈200 lines, UMD; works in the browser and in Node tests)
   translateLine(jp, mode) / translateName(jp, n?) / translateRow(text, attrs, mode, rowIdx)
heng-dict.js  → shrinks to an override layer + the existing public function names (kept as thin wrappers)
```
The public globals stay the same (`window.localizeGameMessage`, `getLocalizedItemName`, `getLocalizedMonsterName`, `translateTerminalRow`, `HENG_DICT`). Callers in hud.js, terminal.js, dungeon3d.js and app.js **don't change** in the first pass. That is the regression firewall.

### 3.3 WS3.0 Measure first (no production behavior change)
1. **Dev probe** (in `heng-dict.js`, guarded): when `localStorage.angband3d_dev_lang_audit === '1'` and mode is `en`, every output of `localizeGameMessage` / `translateTerminalRow` that still matches `/[\u3040-\u30ff\u4e00-\u9fff]/` is recorded in a `Map(text → count)`, capped at 500 entries. Expose it as `window.__hengUntranslated = () => [...map].sort((a,b)=>b[1]-a[1])`.
2. **Coverage tool** `tools/heng_lang_coverage.js` (CDP; copy the launch, connect and evaluate helpers from `tools/test_heng_cdp_automation.js`, without duplicating Chrome-profile code. Use `os.tmpdir()` for the profile and delete it in `finally`; see WS7.4).
   - Script: start Hengband in EN → finish birth with defaults → walk 10 steps → `i` → Esc → `e` → Esc → enter the General Store `1` → Esc → descend if stairs are adjacent, otherwise skip → collect `-more-` chains by pressing space until `ui.more` is false.
   - Output: `tools/reports/heng_untranslated.json` = `{ uniqueLines, untranslated, coveragePct, top50 }`.
   - Also dump **every raw JP line seen** to `tools/fixtures/heng/lines_raw.json` (deduped). This becomes the regression corpus for the unit tests.
3. Record the baseline `coveragePct` in `docs/STATE.md`.

**Gate:** the report exists, and the baseline is recorded.

### 3.4 WS3.1 Generator spec (`tools/gen_heng_dict.js`)
**Inputs:** UTF-8 (strip the BOM `\uFEFF` if present).

**A. Template pairs from source**
1. Tokenize each file. Find `_(` that is **not** preceded by an identifier character (`/(?<![A-Za-z0-9_])_\(/`).
2. Parse argument 1 as a *string-literal sequence*: one or more C string literals separated only by whitespace or comments, with an optional `u8` prefix and escapes `\" \\ \n \t`. Then `,`. Then argument 2 the same way. Then `)`. If either argument isn't a pure literal sequence (for example `_(buf, buf2)`), **skip it and count it** in `manifest.skippedNonLiteral`.
3. Placeholders: support printf (`%s %d %ld %lld %u %c %x %%`, flags `-+ 0#`, width, precision, `%^s`) **and** `{}`/`{:d}`/`{:>5}` (std::format style). First check whether the second style occurs: `Select-String -Path variants/hengband-src/src -Recurse -Pattern '_\("[^"]*\{\}'`. Map each placeholder to a capture group: string → `(.+?)`, integer → `([-+]?\d[\d,]*)`, char → `(.)`. Positional `%1$s` keeps its index.
4. A JP pattern is the escaped JP literal with placeholders replaced by captures, anchored `^…$`. The EN format records the argument order and kind; `%^s` means "capitalize the first letter of the EN argument".
5. Drop pairs whose JP side has fewer than 2 literal characters (for example `_("%s", "%s")`); they match everything.
6. **Conflicts** (same JP pattern, different EN): keep the variant that occurs most often; on a tie keep the first in path order. Write every conflict to `manifest.conflicts` (and `tools/reports/heng_conflicts.json`) for human review.
7. **Bucketing for speed:** the bucket key is the first 2 characters of the leading literal. Templates that start with a placeholder go into a `"*"` bucket. Inside a bucket, sort by total literal length descending. Emit `{ buckets: { key: [[pattern, enFormat, argSpec], ...] } }`.

**B. Name pairs from JSONC.** Use regex extraction (robust against comments and trailing commas):
```js
// Matches  "name": { "ja": "...", "en": "..." }  with either key order.
const RE_NAME = /"name"\s*:\s*\{\s*"(ja|en)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"(ja|en)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
```
Sources (all of them): Baseitem, Artifact, Ego, Monrace, Terrain, Dungeon, Spell, ClassMagic, Town definition files. Skip placeholder entries (`ja === '日本語名'`, `en === 'English Name'`, empty strings).

**C. Name normalization (critical; fixes L5).** Store each EN name in two forms: `en1` (singular) and `enN` (plural), using Angband marker rules:
- `& ` at the start → removed for display (the article is added by `translateName` only when needed; inventory rows never show articles in EN when a count is shown).
- `~` → `''` for singular. For plural: `'s'`, but `'es'` after `s, x, z, ch, sh`; `Torch~` → `Torches`, `Knife~` → `Knives` is **not** needed (upstream writes such cases explicitly).
- `|a|b|` alternation (if present) → singular `a`, plural `b`.
- Write a unit test for each rule (WS3.6).

**D. Kind forms (flavored items).** JP `スピードの薬` = base `スピード` + kind suffix `の薬`; EN = `Potion~ of Speed`. Extract the kind table from `variants/hengband-src/src/flavor/` (grep `_("%sの薬"`-style pairs and the tval switch in the flavor/object-desc code). Emit `heng-kinds.json` as `[{ jaSuffix: 'の薬', en: 'Potion~ of %s', tval: 'POTION' }, ...]` for potion, scroll, wand, staff, rod, ring, amulet, mushroom, book (`魔法書`), and chest. If extraction is ambiguous, hand-write this ~12-row table in the override layer and cite the source line numbers in a comment.

**E. JP counters.** `^(\d+)(つ|個|本|冊|枚|巻|匹|服|切れ|袋|組|振り|着|足|対|発|束)の(.+)$` → `{ n, rest }`.

**F. Determinism:** sort all keys; no timestamps inside the data files (only in the manifest). Running the generator twice gives byte-identical output (test this).

**G. Size budget:** `heng-names.json` + `heng-templates.json` + `heng-kinds.json` ≤ **1.2 MB raw / ≤ 400 KB gzip**. If over budget, drop templates from `debug/`, `wizard/` and `cmd-debug*` source paths first (players never see them).

**Gate WS3.1:** `node tools/gen_heng_dict.js` exits 0 and prints counts. The second run produces an identical `git diff --stat` (none). The manifest lists `skippedNonLiteral` and `conflicts`.

### 3.5 WS3.2 Translator spec (`server/public/js/heng/heng-translate.js`)
```js
// UMD so the same code runs in the browser and in node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HengTranslate = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CJK = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/;
  let NAMES = null, KINDS = [], BUCKETS = null, OVERRIDES = {};
  const lru = new Map(); const LRU_MAX = 2000;
  function memo(key, fn) {               // tiny LRU: Map keeps insertion order
    if (lru.has(key)) { const v = lru.get(key); lru.delete(key); lru.set(key, v); return v; }
    const v = fn(); lru.set(key, v); if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value); return v;
  }
  function load(data) { /* sets NAMES, KINDS, BUCKETS, OVERRIDES; compiles regexes lazily per bucket */ lru.clear(); }
  function translateName(ja, n) { /* §3.5.2 */ }
  function translateLine(ja, mode) { /* §3.5.1 */ }
  function translateRow(text, attrs, mode, rowIdx) { /* §3.5.3 */ }
  return { load, translateName, translateLine, translateRow, _lru: lru };
}));
```
**3.5.1 `translateLine(ja, mode)`** (message lines, prompts):
1. `mode === 'jp'` or no CJK → return the input unchanged.
2. Override exact match → return it.
3. Split on sentence boundaries `。` and `！`, keeping the delimiters. Translate each clause by: exact template, then bucketed regex template (captures go through `translateName`; integers stay as they are).
4. **Atomicity rule (D8):** if any clause still contains CJK after step 3, the line's EN result is **discarded** and the original JP line is returned whole (and recorded by the dev probe). This removes Frankenstein output by construction.
5. `bilingual` mode: return `ja` unchanged, plus a gloss for **names only**: `泣きじゃくる白痴(Blubbering idiot)`. Never gloss sentences.

**3.5.2 `translateName(ja, n)`**:
1. Strip the trailing suffix group `/(\s*(\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|<[^>]*>))+$/`: dice `(2d6)`, bonuses `(+0,+0)`, AC `[3,+0]`, inscriptions `{…}` (**never translated**), charges `(10 charges)`. Translate the inner text of charges and turns (`2,500TURN の寿命` → `2,500 turns`) via the override table. Keep dice, bonuses and inscriptions **verbatim**.
2. JP counter (§3.4 E) → `n`.
3. Kind suffix (§3.4 D) → `base` + kind.
4. Look up in `NAMES` (exact match; then strip the `の死体`/`の骨`/`の像`/`の人形` monster-part suffix and render `"<Monster> Corpse"` etc. Confirm EN wording against the corpse branch in `variants/hengband-src/src/flavor/`).
5. Render: `n > 1` → `${n} ${enN}`; `n === 1` → `en1`. Append the preserved suffixes.
6. If any step misses, return `ja` (never partial).

**3.5.3 `translateRow(text, attrs, mode, rowIdx)`** (80×24 grid):
- **Message and prompt rows** (row 0, and any row the classifier marks as a prompt) → `translateLine`.
- **List rows** matching `^(\s*)([a-zA-Z])\)\s(.*?)(\s{2,}[\d.]+\s?(kg|lb)\.?)?\s*$` → keep the label `a) ` and the weight column; translate only the name span via `translateName`. Pad or truncate to the **original visual width** (reuse `visualWidth()` from heng-dict.js:621) so the column alignment and the `attrs` string length stay intact. `attrs` must stay the same length as `text`: when the name changes length, repeat the name's first attribute character or cut it.
- **Sidebar rows** (left 12 columns) → exact row-term table (existing `EXACT_ROW_TERMS`, extended with L7).
- Anything else → `translateLine`, still atomic.

### 3.6 WS3.3 Tests (all offline, Node, <2 s; add to the `fast` tier)
`tools/test_heng_translate.js` loads the generated JSON and the UMD module with `require`.
| Case | Input | Expected |
|---|---|---|
| T1 dice suffix (L4) | `ブロード・アックス (2d6) (+0,+0)` | `Broad Axe (2d6) (+0,+0)` (confirm the EN base name from BaseitemDefinitions) |
| T2 counter + markers (L5) | `6つの食料` | `6 Rations of Food` |
| T3 torch turns (L5) | `7つの松明(2,500ターンの寿命)` (use the exact raw string from `lines_raw.json`) | `7 Wooden Torches (2,500 turns)` |
| T4 corpse (L3) | `泣きじゃくる白痴の死体` | EN corpse form per upstream |
| T5 atomic (L1) | any raw line with no template | **identical to the input** (no mix) |
| T6 inscription | `食料 {@q1}` | `Ration of Food {@q1}` |
| T7 list row width | `a) 6つの食料          3.0 kg` | same visual width; `a) ` and `3.0 kg` columns unchanged |
| T8 jp mode | any | identity |
| T9 bilingual | monster name line | JP plus `(EN)` gloss on names only |
| T10 determinism | run the generator twice | byte-identical outputs |
| T11 corpus | every line in `tools/fixtures/heng/lines_raw.json` | the output has no CJK **or** equals the input; never a mix |
| T12 perf | translate the corpus 10× | < 200 ms total after warm-up (LRU) |

### 3.7 WS3.4 Wire in, behind a flag
1. `heng-dict.js` public functions become wrappers. If `window.__hengTranslatorV2 !== false` and `HengTranslate` is loaded, delegate to it; otherwise use the old code path (kept intact until WS3.6).
2. Load order: the generated JSON is fetched by `loadHengLang()` (WS5.1). Until it resolves, the wrappers use the old path, so nothing breaks while loading.
3. Fix L2 (topline): find the topline element (`Select-String server/public/js/hud.js -Pattern 'lastTermRow0'`). On a `setup`→`play` phase transition, clear it. Render the topline text through `translateLine`.
4. Fix L8: replace the hard-coded welcome with a `REALM_TEXT` table (put it in `realm-keys.js`, WS6):
   `{ angband:{town:'the Town'}, silq:{town:null}, frogcomposband:{town:'the Outpost'}, hengband:{town:'the Outpost'} }`. Confirm each town name from a live frame row (sidebar or topline) before committing. Use feet per level from the same table (confirm Sil-Q's depth display from a frame).
5. L9: the ribbon (app.js:4203) calls `translateName(label)` instead of its two-map lookup.

**Gate WS3:**
- `test_heng_translate.js` all green.
- `tools/heng_lang_coverage.js` ≥ **98%** unique-line coverage, and **zero** mixed lines (T11 property on the live corpus).
- New CDP test `tools/test_heng_language_switch.js`: EN→JP→bilingual→EN in place. Assert: same `sessionId`; the terminal row 0, `#footer-gear` and the first 3 message-log lines change in the expected script within one `requestAnimationFrame` after the click; player x/y/gold unchanged.
- Existing suites green: `test_hengband_japanese_mode.js`, `test_ribbon_bilingual.js`, `test_3d_labels_and_terminal_language.js`, `test_heng_cdp_automation.js`, `test_heng_sjis.js`.

**Rollback:** `localStorage.setItem('angband3d_heng_v2','0')` maps to `window.__hengTranslatorV2 = false` (read at boot), which restores the old path instantly. Code revert: `git revert` the WS3.4 commit.

**WS3.5 Cleanup (only after the gate passes twice):** reduce `heng-dict.js` to override entries plus wrappers. Move the old implementation to `tools/archive/heng-dict.legacy.js` (D4). Target total Hengband language payload ≤ 400 KB gzip.

**Regression watch:** CJK double-width kerning in terminal.js; ribbon letter parsing (must keep `a)` tokens); menu-router item matching. The router must match **translated** labels when in EN mode. Simplest fix: the router matches on the **raw JP** row and only displays the translated label.

---

## WS6: One Realm Keymap for Every Sender

### 6.0 Verified duplication (four copies today)
| Copy | Location | Covers |
|---|---|---|
| Keyboard remap | input.js:1298-1302 | silq: m→s, v→t, R→% |
| Button remap | input.js:1428-1435 (`bind()`), plus rest special case 1450-1461 | silq: throw t, cast s, skills tab, rest % |
| Command palette | app.js ≈3597 (`r === 'silq' ? …`) | per-command |
| Classic-terminal context buttons | app.js:4886-4916 | none (shows `[m] Cast`, `[R] Rest` for every realm) |
| Static labels | index.html:455-476 (`<kbd>v</kbd>`, `title="… [m]"`) | none |

**Also found:** `.` and `,` send the digit `'5'` ("rest one turn") at input.js:1252 and 1258. That violates the AGENTS.md rule "never send raw digits". Vanilla 4.2's *Stand still* is `CMD_HOLD` on `,` or `.` (engine/src/ui-game.c:221).

### 6.1 WS6.1 Probe first (`tools/probe_realm_keys.js`, WS-level, no CDP)
For each realm: connect → finish birth → at a top-level `awaiting_command` frame, send each candidate key → capture row 0 (the prompt) → send `escape` (twice if needed) → wait for `awaiting_command` again. Write `tools/fixtures/realm_keys/<realm>.json` as `{ key: promptRow0 }`.
Candidate keys: `m s v t f q r R % o g i e U b G N O Q , . 5 Z z a u E A`.
This turns every keymap entry into evidence, not memory.

### 6.2 WS6.2 `server/public/js/realm-keys.js` (UMD, ≈80 lines, loaded right after device.js)
```js
// Single source of truth for realm-specific command keys and realm text.
// Every value must be backed by tools/fixtures/realm_keys/<realm>.json (WS6.1).
const REALM_KEYS = {
  angband:        { cast:'m', throw:'v', fire:'f', quaff:'q', read:'r', rest:'R', open:'o', pickup:'g', inven:'i', equip:'e', use:'U', hold:',', browse:'b', study:null,  power:null, skills:null, quests:null, overland:null },
  silq:           { cast:'s', throw:'t', fire:'f', quaff:'q', read:null, rest:'%', open:'o', pickup:'g', inven:'i', equip:'e', use:'a', hold:',', browse:null, study:null,  power:null, skills:'tab', quests:null, overland:null },
  frogcomposband: { cast:'m', throw:'v', fire:'f', quaff:'q', read:'r', rest:'R', open:'o', pickup:'g', inven:'i', equip:'e', use:'U', hold:',', browse:'b', study:null,  power:'U', skills:null, quests:null, overland:null },
  hengband:       { cast:'m', throw:'v', fire:'f', quaff:'q', read:'r', rest:'R', open:'o', pickup:'g', inven:'i', equip:'e', use:'U', hold:',', browse:'b', study:'G', power:'U', skills:null, quests:null, overland:null },
};
// null = the verb doesn't exist in that realm: hide the button and the palette entry.
// VALUES ABOVE ARE PROVISIONAL. Replace each with the probe result before committing.
```
`realmKey(verb)` reads `getActiveRealm()` and returns the key or `null`. The table also holds `REALM_TEXT` (town name, feet per level) for WS3.7.

### 6.3 WS6.3 Switch every sender over
1. input.js:1298-1302 → `const mapped = RealmKeys.fromVanilla(e.key)` (a reverse map built from the angband row) only when `isTopLevelWorldCmd`. Keep the exact gating (`awaiting_command`, `overlay === 0`, `!more`).
2. input.js `bind(id, verb)`: bind by **verb** (`bind('btn-throw','throw')`) and resolve the key at fire time. Delete the silq `if` block (1430-1435) and the rest special case's realm branch. Rest becomes: send `rest`; if the realm's rest key is `R`, follow with `enter` (keep the 80 ms gap; ordering is guaranteed by the stdin pipe).
3. `.` and `,` → `RealmKeys.key('hold')`. Remove the digit `'5'`.
4. app.js palette (≈3597) and classic context buttons (4886-4916) → read `realmKey(verb)`. Hide entries whose key is `null`.
5. Labels: on realm select, run `RealmKeys.applyLabels(document)`, which sets each `#btn-*` `<kbd>` text, `title`, and `hidden` from the table. index.html keeps Vanilla defaults for no-JS first paint.

**Tests:** `tools/test_realm_keys.js` (fast): the table is complete for all 4 realms and every non-null key appears in the probe fixture with a prompt that matches the verb regex (for example cast: `/song|spell|cast|唱|魔法/i`). CDP test: for each realm, click each visible action button and assert row 0 matches the fixture prompt.
**Gate:** both green, plus `verify_cross_realm_menus.js`.
**Rollback:** revert the WS6 commits. The table is additive until step 6.3.

---

## WS9: GUI Elegance and Functionality

### 9.0 Observed issues (screenshots 1264×625 and 1024×486)
| ID | Issue | Evidence |
|---|---|---|
| G1 | **The D-pad overlaps the action bar** at ≤1280 px wide: Help and Cmds sit under the D-pad and can't be clicked | Screenshot 1264×625 |
| G2 | The top bar has 13 controls (Cloud, Realm, EN, Tome, Log, Map, D-Pad, Invert, Controls, Sound+slider, ⚙, Fullscreen, Menu): crowded, low hierarchy | index.html ~280-336 |
| G3 | The action bar shows 18 buttons plus More. Labels and `<kbd>` hints are Vanilla-only (Sil-Q shows `Cast m`; Scroll shows in Sil-Q, which has no scrolls) | index.html:455-476 |
| G4 | "Controls [?]" appears twice (top bar and footer) | screenshots |
| G5 | The message log panel covers the top-center of the 3D view permanently | screenshots |
| G6 | The topline shows a stale prompt; the first glyph is clipped at the far left (`キ`) | L2 |
| G7 | Footer gear pill: JP text and no truncation | L4 |
| G8 | Cinzel small caps at ≈10-11 px in the button labels hurts legibility | screenshots |
| G9 | Toasts are built with `innerHTML` (app.js:3138) | XSS hygiene |
| G10 | Naming is inconsistent: "Pack/Gear" (buttons), "Inventory/Equipment" (titles), "Classic" vs "Terminal" | index.html |

### 9.1 Design tokens (add at the top of `css/dungeon.css`; reuse the existing gold/ink palette)
```css
:root {
  --hud-gap: 12px;
  --hud-radius: 12px;
  --hud-glass: rgba(10, 12, 18, 0.72);
  --hud-border: rgba(212, 175, 55, 0.35);
  --hud-gold: #d4af37;
  --hud-text: #e8e3d3;
  --hud-dim: #9a937f;
  --font-ui: 'Outfit', system-ui, sans-serif;   /* all labels ≤ 13px */
  --font-display: 'Cinzel', serif;              /* headings ≥ 14px only */
  --tap: 44px;                                   /* min touch target */
  --dpad-w: 200px;  --charpanel-w: 320px;  --minimap-w: 260px;
}
```

### 9.2 Tasks
**WS9.1 Layout without overlap (G1).**
- Constrain `#hud-center-column`: `max-width: calc(100vw - var(--dpad-w) - var(--charpanel-w) - 4 * var(--hud-gap)); margin-inline: auto;`.
- The action bar uses `display:flex; flex-wrap:wrap; justify-content:center; gap:6px`. Add an overflow strategy using the existing `#btn-action-more`: a `ResizeObserver` on `#action-bar` moves trailing buttons (by priority order, §9.3) into a popover until `scrollHeight <= 2 rows`.
- At `max-width: 900px` or `(pointer: coarse)`: the action bar collapses to 6 primary buttons plus More (bottom sheet).
- **Test** `tools/test_ui_layout.js` (CDP), viewports 1920×1080, 1366×768, 1264×625, 1024×768, 844×390, 390×844:
  - The bounding rects of `#action-bar`, the D-pad container (the parent of `#dpad-up`), `#char-panel`, `#minimap-container`, the message log panel and `#hud-footer` must not intersect.
  - Every visible button under `(pointer: coarse)` emulation is ≥ 40×40.
  - Save screenshots to `tools/reports/ui/<w>x<h>-<realm>.png` for human review.

**WS9.2 Top bar consolidation (G2, G4).** Keep these visible: Realm badge (includes the ping), Language (Hengband only), Log, Map, Sound, Menu. Move Tome, D-Pad, Invert, Controls and Fullscreen into the Menu drawer under a new section "Display & Controls". **Move the DOM nodes; don't rename ids** (all the JS bindings use the ids). Remove the footer "Controls [?]" duplicate (keep `?` as the keyboard shortcut).

**WS9.3 Realm-aware action bar (G3).** Primary priority order: Hero-action, Attack, Cast, Fire, Throw, Quaff, Read, Pickup, Rest, Pack, Gear, Door, then Power/Browse/Study/Skills/Quests/Map (if non-null), Walk, Classic, Help, Cmds. `RealmKeys.applyLabels()` (WS6) sets the `<kbd>`, the title, and hides null verbs.

**WS9.4 Message log (G5).** Default 4 visible lines. After 6 s without a new message or hover, fade to `opacity:.35` (`transition: opacity .4s`). On a new message or hover, `opacity:1`. `@media (prefers-reduced-motion: reduce)` → no transition. The Expand button keeps today's behavior.

**WS9.5 Topline and footer text (G6, G7).** `overflow:hidden; text-overflow:ellipsis; white-space:nowrap;` and `title=` the full text. Add `padding-left` so the first glyph isn't clipped. The text comes from `translateLine`/`translateName` (WS3).

**WS9.6 Typography (G8).** `.action-btn, .status-pill, .icon-btn { font-family: var(--font-ui); font-weight: 600; letter-spacing: .02em; }`. Cinzel stays for panel titles ≥14 px.

**WS9.7 Action Chooser visual polish (styles the companion §4 bar; no new modal).**
> [!NOTE]
> The engine already draws the inventory list, and the letter ribbon already shows the items. A second item-list modal would duplicate both, add bloat and add regression surface. So the chooser **is** the existing `#term-contextual-actions` bar, switched into "item selected" mode by `menu-router.js` (companion §3.2 and §4).
- **Title row:** `🎒 c) <item name> — choose action` (name via `textContent`; Hengband through `translateName`).
- **Verb chips:** real `<button class="term-ctx-btn">`. Text is `[key] Label`, with the key taken from `REALM_KEYS`. When the frame has `tval` (Vanilla, FCB), show only verbs valid for the item; otherwise show the realm's full list and let the engine refuse invalid ones. The suggested verb gets `.is-suggested` (gold border, first in order). It's never auto-sent.
- **Style** (add to dungeon.css, scoped to `#term-contextual-actions.is-item-mode`): `background: var(--hud-glass); backdrop-filter: blur(10px); border: 1px solid var(--hud-border); border-radius: var(--hud-radius); padding: 8px; gap: 6px;`. Chips are min-height `var(--tap)` on `(pointer:coarse)`. Fade the mode switch in with `opacity .15s`, disabled under `prefers-reduced-motion`.
- **Keyboard:** while in item mode, the verb's key sends the two-phase dispatch (companion §3.2); another item letter switches the selection; Esc goes back (first Esc clears the item mode, second Esc is sent to the engine). `←/→` move focus between chips; Enter activates.
- **A11y:** the container has `role="toolbar" aria-label="Item actions"` and `aria-live="polite"` on the title. Focus moves to the suggested chip on entering item mode and returns to the ribbon letter on exit.
- **Build** chips with `document.createElement` + `textContent`; never `innerHTML` with dynamic text.

**WS9.8 A11y and toasts (G9).**
- Icon-only buttons get `aria-label`.
- `:focus-visible { outline: 2px solid var(--hud-gold); outline-offset: 2px; }`.
- The toast container gets `role="status" aria-live="polite"`.
- `showRealmToast(message)` → `showRealmToast({ text, strong })` built with `textContent`. Keep a temporary shim that accepts a string and **escapes** it, so old callers stay safe.

**WS9.9 Naming (G10).** Buttons: "Inventory" (short label "Pack" allowed on ≤900 px) and "Equipment" ("Gear"). Pick one per breakpoint and use it the same way in titles, help and palette.

**Gate WS9:** `test_ui_layout.js` green on all 6 viewports × 4 realms. A human screenshot review (the user) is recorded in STATE.md. `test_live_web_buttons.js` green. No new console errors.
**Rollback:** each WS9.x is a separate commit with CSS-first changes; revert individually.

---

## WS10: Platform Parity (web, PWA, Android, WebView2, Godot, offline)

**WS10.1 Android asset drift (verified).** `android/app/src/main/assets/public/js/app.js` is 262 KB versus 290 KB in `server/public` while **both** say `CACHE_NAME 'angband3d-v9.1.0'`, so the APK ships stale JS under a "current" version.
- Add `tools/check_android_sync.js`: compare SHA-1 of every file under `server/public` with `android/app/src/main/assets/public`; print the mismatches; exit 1 on any.
- The release step runs `npx cap sync android` (Capacitor's `webDir` is `server/public` per `capacitor.config.json`), then the check.
- Gate: the check exits 0 after a sync.

**WS10.2 Release keystore (D14 approved: rotate + untrack + history scrub).** `android/app/release.keystore` **is tracked in git**, and `android/app/build.gradle:22-25` hard-codes `storePassword 'angband3d'` / `keyPassword 'angband3d'`. If the repo is public, anyone can sign an APK as this app.
1. Generate a new upload key **outside the repo** (`keytool -genkeypair -v -keystore %USERPROFILE%\.android-keys\angband3d-upload.jks -alias angband3d -keyalg RSA -keysize 4096 -validity 10000`). The user picks the passwords; never write them into any repo file or chat.
2. `build.gradle` reads `storeFile`/passwords from `keystore.properties` (gitignored) or env vars `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. If neither exists, skip the release `signingConfig` (debug builds still work) instead of failing.
3. `git rm --cached android/app/release.keystore`, and add `*.keystore`, `*.jks`, `keystore.properties` to `.gitignore`. Commit on `fix/award-pass`.
4. **Resolved: the APK is NOT on Google Play (side-loaded).** There's no Play upload-key reset, so after rotation, existing installs **cannot update in place** (Android rejects a signature mismatch). Required mitigation, in order:
   a. Before rotating, confirm where offline/APK saves live (`Select-String server/public/js/local_bridge.js,server/public/js/engine-worker.js -Pattern 'indexedDB|localStorage|FS.syncfs|IDBFS'`) and that the Saves panel can **export/download** a save file and **import** it. If export is missing, add it first (Blob + `<a download>`; import via `<input type=file>` → same validation as the upload endpoint).
   b. Bump `versionCode`/`versionName` in `android/app/build.gradle` to match version.json (9.2.0).
   c. Release note text (put in CHANGELOG + README Android section): "This build is signed with a new key. Export your saves, uninstall the old app, install this one, then import your saves."
   d. Keep the new keystore + passwords backed up outside the repo (password manager). Losing it means another forced reinstall.
5. **History scrub: LAST step, only after `fix/award-pass` is merged and all gates are green.**
   - Backup: `git clone --mirror <remote> ..\angband3d-backup.git` (keep until the user confirms).
   - In a fresh mirror clone: `git filter-repo --path android/app/release.keystore --invert-paths` (install with `pip install git-filter-repo` in a venv if absent).
   - Verify: `git log --all -- android/app/release.keystore` prints nothing.
   - `git push --force --mirror` (user runs or explicitly confirms at that moment).
   - Tell collaborators to re-clone. Local clones (including `c:\Dev\angband3d`) must be re-cloned or hard-reset; re-copy untracked files (saves, `.env`) first.
   - The old key stays compromised regardless; rotation (step 1) is the real fix, the scrub just stops further spread.

**WS10.3 Offline / local bridge.** `local_bridge.js` + `engine-worker.js` + `/wasm/angband.*` run Vanilla in-browser (APK/offline). The menu router and screen classifier must work from the same frames. Add the offline path to `test_menu_router` fixtures (capture one offline inventory frame). The relay guard (WS1.2) is server-only; check `local_bridge.js` for an equivalent `sendCommand` path and apply the same allowlist function (shared from `screen-context.js` as `isAllowedEngineCommand`).

**WS10.4 WebView2 desktop.** `isStandaloneApp()` (app.js:23-30) detects `window.chrome.webview`. Smoke-test `openExternalUrl` and the menu router in the desktop shell if it's buildable locally; otherwise record "not verified" in STATE.md (don't block).

**WS10.5 Godot client (D10).** `dotnet build client/angband3d.csproj` stays green. Port `NeedsTerminal` precedence changes to `Main.cs` only if JS precedence changes (it shouldn't).

**WS10.6 PWA.** WS5.4 single version: `css/*.css?v=8.9.3` (index.html:65-66) is a **third** stale version string. Include the CSS links and vendor scripts in `bump_version.js`. The SW is network-first (sw.js:61-77), so the main risk is offline staleness; the version bump covers it.

**Gate WS10:** android sync check, `dotnet build`, the offline router fixture test, and the PWA version check (`tools/check_version_sync.js`: every `?v=` in index.html, `CACHE_NAME` in sw.js, `/health` `version`, and the WS `hello.version` (if it's meant to be the app version) all equal `version.json`).

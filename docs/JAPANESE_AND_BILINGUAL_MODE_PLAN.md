# Complete Japanese & Bilingual Localization and Multi-Realm Running Architecture

## 1. Executive Summary & Design Vision

This document details the architectural plan and implementation specification to deliver:
1. **Flawless Japanese & Bilingual Localization across Hengband and the Client**:
   - Tailored specifically to aid players who are learning Japanese by offering **Bilingual (日英併記)**, **Native Japanese (日本語/漢字)**, and **English (英語)** modes.
   - Complete coverage: HUD, stats, gauges, action bar, status badges, contextual cues, target cards, terminal toolbar, pause/options menu, death screen, and minimap.
   - Instant, zero-reload runtime toggling via `Alt+L`, header button (`#btn-toggle-lang`), and pause options menu.
2. **Multi-Realm Running Mechanics Parity**:
   - Flawless sprint running via on-screen D-Pad and `Shift+Direction` across all four variant realms: Vanilla Angband 4.2.6, FrogComposBand 7.1, Hengband 3.0+, and Sil-Q 1.5+.
   - Architectural resolution of the Vanilla Angband `check_for_player_interrupt()` input collision bug.

---

## 2. Japanese & Bilingual Pedagogical Design (For Japanese Language Learners)

### 2.1 The Three Language Modes

| Mode ID | Display Name | Philosophy & Learning Objective | Example: HP Bar | Example: Attack Action | Example: Poison Badge |
|---|---|---|---|---|---|
| `en` | **English** | Standard English interface for classic gameplay. | `HP 25 / 25` | `⚔ Attack [Space]` | `POISON` |
| `bilingual` | **Bilingual (日英)** | **Primary learning mode.** English term paired with Japanese Kanji & Kana. Builds instant kanji recognition, vocabulary association, and context without requiring a dictionary. | `HP (体力) 25 / 25` | `⚔ Attack (攻撃) [Space]` | `POISON (毒)` |
| `jp` | **日本語 (Kanji/Kana)** | Pure authentic Japanese roguelike terminology matching canonical Hengband/JAngband translations. Immersion mode for advancing learners. | `体力 25 / 25` | `⚔ 攻撃 [Space]` | `毒` |

---

## 3. Comprehensive Localization Dictionary Matrix

### 3.1 Primary Attributes & Gauges

| Key | English (`en`) | Bilingual (`bilingual`) | Japanese (`jp`) | Romaji / Meaning |
|---|---|---|---|---|
| `hp` | `HP` | `HP (体力)` | `体力` | *Tairyoku* (Physical Health) |
| `sp_mana` | `MANA` | `MANA (魔力)` | `魔力` | *Maryoku* (Magic Power) |
| `sp_voice` | `VOICE` | `VOICE (声)` | `声` | *Koe* (Sil-Q Voice/Song) |
| `str` | `STR` | `STR (腕力)` | `腕力` | *Wanryoku* (Arm Strength) |
| `int` | `INT` | `INT (知能)` | `知能` | *Chinō* (Intelligence) |
| `wis` | `WIS` | `WIS (賢さ)` | `賢さ` | *Kashikosa* (Wisdom) |
| `dex` | `DEX` | `DEX (器用)` | `器用` | *Kiyō* (Dexterity) |
| `con` | `CON` | `CON (耐久)` | `耐久` | *Taikyū* (Constitution) |
| `chr` | `CHR` | `CHR (魅力)` | `魅力` | *Miryoku* (Charisma) |
| `gra` | `GRA` | `GRA (威厳)` | `威厳` | *Igen* (Sil-Q Grace) |
| `ac` | `AC` | `AC (防御)` | `防御` | *Bōgyo* (Armor Class) |
| `gold` | `GOLD` | `GOLD (所持金)` | `所持金` | *Shojikin* (Held Gold) |
| `exp` | `EXP` | `EXP (経験値)` | `経験値` | *Keikenchi* (Experience Points) |
| `level` | `Lvl` | `Lvl (レベル)` | `レベル` | *Reberu* (Level) |
| `depth_town` | `Town` | `Town (街)` | `街` | *Machi* (Town) |
| `depth_wild` | `Wilderness` | `Wilderness (荒野)` | `荒野` | *Kōya* (Wilderness) |
| `depth_floor` | `{d}ft` | `{d}ft (地下 {n}階)` | `地下 {n}階 ({d}ft)` | *Chika {n}-kai* (Underground Floor) |

### 3.2 Action Bar Buttons & Controls

| Action ID | English (`en`) | Bilingual (`bilingual`) | Japanese (`jp`) | Shortcut Key |
|---|---|---|---|---|
| `action_attack` | `Attack` | `Attack (攻撃)` | `攻撃` | `Space` |
| `action_throw` | `Throw` | `Throw (投擲)` | `投擲` | `v` |
| `action_shoot` | `Shoot` | `Shoot (射撃)` | `射撃` | `f` |
| `action_cast` | `Cast` | `Cast (呪文)` | `呪文` | `m` |
| `action_skills` | `Skills` | `Skills (特技)` | `特技` | `N` |
| `action_power` | `Power` | `Power (能力)` | `能力` | `U` |
| `action_map` | `Map` | `Map (地図)` | `地図` | `O` |
| `action_quests` | `Quests` | `Quests (任務)` | `任務` | `Q` |
| `action_browse` | `Browse` | `Browse (閲覧)` | `閲覧` | `b` |
| `action_study` | `Study` | `Study (学習)` | `学習` | `G` |
| `action_quaff` | `Potion` | `Potion (薬飲)` | `薬飲` | `q` |
| `action_read` | `Scroll` | `Scroll (巻読)` | `巻読` | `r` |
| `action_door` | `Door` | `Door (開閉)` | `開閉` | `o` |
| `action_get` | `Get` | `Get (拾う)` | `拾う` | `g` |
| `action_rest` | `Rest` | `Rest (休息)` | `休息` | `R` |
| `action_pack` | `Pack` | `Pack (持物)` | `持物` | `i` |
| `action_gear` | `Gear` | `Gear (装備)` | `装備` | `e` |
| `action_descend` | `Descend` | `Descend (降りる)` | `降りる` | `>` |
| `action_ascend` | `Ascend` | `Ascend (登る)` | `登る` | `<` |
| `action_walk` | `Walk` | `Walk (歩く)` | `歩く` | `Alt+R` |
| `action_run` | `Run` | `Run (走る)` | `走る` | `Alt+R` |
| `action_term` | `Classic` | `Classic (端末)` | `端末` | `Tab` |
| `action_help` | `Help` | `Help (案内)` | `案内` | `?` |
| `action_cmds` | `Cmds` | `Cmds (指令)` | `指令` | `Ctrl+K` |

### 3.3 Status Conditions & Alerts

| Status ID | English (`en`) | Bilingual (`bilingual`) | Japanese (`jp`) | Meaning |
|---|---|---|---|---|
| `status_cut` | `Cut` | `Cut (重傷)` | `重傷` | Deep laceration |
| `status_mortal` | `Mortal Wound` | `Mortal (致命傷)` | `致命傷` | Mortal bleeding |
| `status_stun` | `Stun` | `Stun (朦朧)` | `朦朧` | Stunned / dazed |
| `status_blind` | `Blind` | `Blind (盲目)` | `盲目` | Blindness |
| `status_conf` | `Confused` | `Confused (混乱)` | `混乱` | Mental confusion |
| `status_poison` | `Poisoned` | `Poisoned (毒)` | `毒` | Venomed / poisoned |
| `status_fear` | `Afraid` | `Afraid (恐怖)` | `恐怖` | Panicked with fear |
| `status_paralyze` | `Paralyzed` | `Paralyzed (麻痺)` | `麻痺` | Paralyzed / unable to act |
| `status_hallu` | `Hallucinating` | `Hallucinating (幻覚)` | `幻覚` | Strange sensory visions |
| `status_fast` | `Fast` | `Fast (加速)` | `加速` | Hastened movement |
| `status_slow` | `Slow` | `Slow (減速)` | `減速` | Sluggish movement |
| `status_resting` | `Resting` | `Resting (休息中)` | `休息中` | Regenerating HP/MP |

### 3.4 Terminal Toolbar & Navigation

| Element | English (`en`) | Bilingual (`bilingual`) | Japanese (`jp`) |
|---|---|---|---|
| Advance Button | `Advance (Enter)` | `Advance (決定)` | `決定 (Enter)` |
| Back Button | `Back (Esc)` | `Back (戻る)` | `戻る (Esc)` |
| Reroll Button | `🎲 Reroll Hero (R)` | `🎲 Reroll (再生成)` | `🎲 英雄再生成 (R)` |
| Custom Button | `⚙️ Custom Hero (C)` | `⚙️ Custom (作成)` | `⚙️ 英雄作成 (C)` |
| Main Menu Button | `⌂ Main Menu` | `⌂ Main Menu (主献立)` | `⌂ メインメニュー` |

---

## 4. Multi-Realm Running Mechanics Architecture

### 4.1 Diagnosis of Vanilla Angband Run Issue

In Vanilla Angband 4.2.6:
- The command `CMD_RUN` is bound to `.` in the original keyset.
- When `keys .<digit>` is sent (e.g. `keys .8`), the engine executes `run_step(dir)` which initializes the run to 9999 steps and takes step 1.
- Crucially, on every step in `process_player()`, Vanilla Angband signals `EVENT_CHECK_INTERRUPT`, invoking `check_for_player_interrupt()`:
  ```c
  if (player->upkeep->running) {
      inkey_scan = SCAN_INSTANT;
      e = inkey_ex();
      if (e.type != EVT_NONE) {
          event_signal(EVENT_INPUT_FLUSH);
          disturb(player);
          msg("Cancelled.");
      }
  }
  ```
- **The Defect**:
  1. On keyboards: when holding `Shift+Arrow` or when Run Toggle is ON, the operating system's keyboard repeat fires repeated `keydown` events every 30-50ms.
  2. On touchscreens: touch repeat intervals fire every 140ms, or synthetic `mousedown` events trail touch taps.
  3. These repeated commands enqueue additional `keys .<digit>` strings. The moment step 1 finishes, `inkey_ex()` reads the pending `.` from the input buffer, triggering `disturb(player)` and immediately canceling the run!

### 4.2 The Unified Fix Across All Realms

1. **Repeat Suppression on Run Movement**:
   - In `server/public/js/input.js` `handleWorldKey`: if `e.repeat` is true and a run movement is triggered, immediately ignore the event (`return`). Only the initial keydown initiates the sprint.
2. **Debounce / Throttle Guard in `sendRunMove`**:
   - Enforce a 350ms cooldown window in `sendRunMove(localDir)` so redundant or overlapping sprint calls cannot collide with active engine execution.
3. **Touch D-Pad Run Suppression**:
   - In `server/public/js/input.js` `setupTouchEvents`: when `this.dpadRunMode` is active, disable the 140ms `setInterval` repeat loop for directional movement buttons. A tap or hold triggers exactly one atomic run command until destination or disturbance.
4. **Strafe Run Parity**:
   - Support `ArrowLeft` / `ArrowRight` strafe-running when `this.isRunningActive(e)` and `e.shiftKey` are engaged.

---

## 5. Verification & Testing Matrix

1. **Automated Unit & Integration Tests**:
   - `tools/test_hengband_japanese_mode.js`: Automated browser test verifying switching between `en`, `bilingual`, and `jp` updates all HUD widgets, stats, gauges, action bar buttons, status badges, and terminal buttons dynamically.
   - `tools/test_run_all_realms.js`: Test runner verifying that atomic running operates cleanly in Vanilla Angband, FrogComposBand, Hengband, and Sil-Q without premature cancellation.
2. **Regression Testing**:
   - `python tools/smoke_test.py`: 11/11 tests pass.
   - `dotnet build client/angband3d.csproj`: 0 warnings, 0 errors.

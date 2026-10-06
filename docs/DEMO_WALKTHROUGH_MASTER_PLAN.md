# Angband3D — Demo Trailer Master Plan (Narrator Unification, Seamless Flow & Authentic Lore)

## Executive Summary
This plan addresses all three core user directives to deliver the definitive 240-second (4-minute) 1080p demo showcase for Angband3D:
1. **Voice Consistency & Role Specialization**:
   - The primary narrator (**Enceladus** — warm, resonant, authoritative British master chronicler) narrates **all** core walkthrough segments (Acts 1, 2, 3, 4, 5, and 8, plus the narrative framing for Acts 6 and 7).
   - Specialized character voices are brought in **strictly** within the Living Chronicle features:
     - **Voiced Lorekeeper** (Voice: `Aoede` — scholarly, mystical sage) answering tactical inquiries in Act 6.
     - **Creature Parley** (Voice: `Charon` — menacing, deep dragon timbre) speaking in Act 7.
2. **Engaging Gameplay Flow & Seamless Bi-Directional Layer Parity**:
   - Every act features active movement, pacing, turning corners, and mechanical interaction.
   - **Act 3 specifically showcases seamless dual-reality integration**:
     - Walk forward 3 steps in 3D.
     - Press `[Tab]` -> Instantaneous bit-for-bit CRT 80x24 ASCII terminal.
     - Walk 2 steps directly in ASCII terminal mode (`down`, `right`).
     - Press `e` -> Authentic Angband Equipment Menu sheet opens in the terminal!
     - Inspect equipment, then press `escape` -> Menu cleanly dismisses.
     - Press `[Tab]` -> Instantaneous return to 3D first-person right at the exact destination tile!
     - Walk forward 2 more steps in 3D to show continuous fluid flow!
3. **Authentic In-Game Dialogue**:
   - All monster speech, combat text, and Lorekeeper advice is directly sourced from upstream Angband 4.2.6 data files (`engine/lib/gamedata/monster.txt`, `blow_methods.txt`, and item compendia).

---

## 1. Voice Architecture & Audio Stem Manifest

All master narration uses `Enceladus` with identical director styling `[master chronicler, warm resonant British narrator, steady storytelling tone]` to maintain voice continuity.

| Clip ID | Chapter / Act | Speaker | Voice | Delay | Text |
|---|---|---|---|---|---|
| `clip_01_awakening` | Act 1: Town (0:00) | Narrator | Enceladus | 1.0s | *"For thirty years, you mapped the pits of Morgoth through strings of green text on an eighty-column screen. You memorized every glyph, every stat, and every cruel demise. Welcome back to Angband... but open your eyes."* |
| `clip_02_town_quote` | Act 1: Town (0:26) | Narrator | Enceladus | 26.0s | *"From the Living Chronicle, Prologue: 'The pilgrim stepped from the sunlight into the stone jaws of Morgoth's pits... and the descent began.'"* |
| `clip_03_gotcha_yaw` | Act 2: Yaw (0:42) | Narrator | Enceladus | 43.0s | *"Rule number one for the veteran: looking around will not get you killed. Camera yaw costs precisely zero turns. Pan the darkness, inspect every corridor, scout the pillars—the world moves only when you take a step."* |
| `clip_04_dual_reality` | Act 3: Terminal (1:03) | Narrator | Enceladus | 64.0s | *"Miss your glyphs? Fear losing your classic overview? Press Tab. Instantaneous, bit-for-bit Angband 4.2.6 CRT terminal mode. Every dungeon tile, monster letter, and stat line is preserved. The 3D world and the classic matrix are one and the same."* |
| `clip_05_seamless_menu` | Act 3: Terminal (1:24) | Narrator | Enceladus | 84.5s | *"Step through the dungeon in ASCII, open your classic equipment menus with 'e', and return to 3D right where you stand. Seamless, uncompromising dual reality."* |
| `clip_06_spatial_stealth` | Act 4: Stealth (1:36) | Narrator | Enceladus | 97.0s | *"In first-person, corridors are narrow and corners are blind. Tactical positioning is everything. Manage your torchlight, peek down dark intersections, and never rush blindly into uncharted shadows."* |
| `clip_07_infravision` | Act 4: Stealth (1:53) | Narrator | Enceladus | 113.0s | *"And when the dark closes in, your ranger's infravision pierces the gloom—revealing the crimson heat signatures of lurking predators before they strike."* |
| `clip_08_dragon_awaken` | Act 5: Combat (2:05) | Narrator | Enceladus | 126.0s | *"Deep below at twelve-hundred and fifty feet, the ancient vault opens. A Young Red Dragon awakens!"* |
| `clip_09_vault_combat` | Act 5: Combat (2:19) | Narrator | Enceladus | 139.0s | *"Every spell, resistance, and artifact from the authentic 4.2.6 compendium is here. Phase Door to break line of sight, lightning wands to soften scales, and the Westernesse blade to finish the beast. Pure turn-based roguelike combat."* |
| `clip_10a_chronicle_intro` | Act 6: Chronicle (2:40) | Narrator | Enceladus | 161.0s | *"Every battle and blunder is penned in real time into the Living Chronicle—an AI oral tradition that recounts your journey like an epic poem. Inquire directly with the Voiced Lorekeeper to uncover monster weaknesses and plan your tactical descent."* |
| **`clip_10b_lorekeeper_voice`** | **Act 6: Chronicle (2:55)** | **Lorekeeper** | **Aoede** | **175.0s** | *"Fire resistance is vital against draconic breath. Don a Ring of Fire Resistance or quaff a Potion of Resist Heat before entering open halls."* |
| `clip_11a_parley_intro` | Act 7: Parley (3:07) | Narrator | Enceladus | 188.0s | *"And the denizens of the deep are not mere statues. Click any creature in the three-dimensional world to interact and parley with authentic characters."* |
| **`clip_11b_creature_voice`** | **Act 7: Parley (3:18)** | **Young Red Dragon** | **Charon** | **198.0s** | *"My scales are like iron, and my breath is flame! Fools dare challenge the brood of the deep. Flee, mortal, ere your bones join the embers of the vault!"* |
| `clip_12_universal_call` | Act 8: Outro (3:30) | Narrator | Enceladus | 211.0s | *"Angband 3D is one-hundred percent free and open-source on GitHub, built for the community to explore, mod, and improve. Export and load your savefiles universally across Web Browser, Windows PC, and Android APK. The cloud chronicler is hosted on angband3d.com, with complete DIY instructions in the repo to plug in your own keys. The descent awaits."* |

# Angband 3D — Definitive 5-Minute Broadcast Walkthrough Plan

**Target Duration**: 300.0s (5:00 minutes)  
**Resolution**: 1920x1080 Full HD @ 60 FPS  
**Audio Architecture**: 21 Gemini Native Voice Stems + Dynamic Middle-earth Soundscape + Convolution Subterranean Reverb  
**Branding**: Thunderbear Studios & Open Source Community  

---

## 1. Core Mandates & Problem Analysis

### 1.1 Lessons Learned from Previous Runs
1. **Camera Pitch Clamping**:
   - *Problem*: In previous iterations, camera pitch tilted to `-0.28` radians (-25° below horizontal), forcing the viewer to stare straight down at the dirt/cobblestones between 20s and 30s.
   - *Fix*: Strictly clamp camera pitch between `0.0` (level eye horizon) and `+0.06` (slight upward tilt admiring architecture, storefronts, and night sky). Only during actual stair entrance does pitch dip gently to `-0.08` to look into the stairwell.
2. **Eliminating NPC Clutter & `-more-` Dialogue Freezes**:
   - *Problem*: Farmer Maggot was bumping the player, triggering dialogue barks that hijacked key inputs into message dismissal.
   - *Fix*: Create a dedicated `demo_intro` golden save state placed on the grand central avenue of town with zero nearby NPCs.
3. **True Descent Down the Stairs**:
   - *Problem*: In the prior cut, the player stood atop `>` and the video abruptly hard-cut before descending.
   - *Fix*: Actively send `>` at 0:42.0, capture the descent animation and stair audio resonance, and let the camera smoothly plunge down into the torchlit depth 1 level before transitioning.
4. **Rich GUI, Spellcasting, Lorekeeper & Creature Parley**:
   - *Problem*: Spells were not highlighted enough, and lorekeeper/creature interaction was too brief.
   - *Fix*: Dedicated acts for:
     - Multi-tier spellcasting (Orb of Light, Arcane Shield, Phase Door, Lightning Wand).
     - Living Chronicle Tome exploration with Voiced Lorekeeper (Aoede).
     - Direct 3D viewport creature interaction with full AI-voiced parley (Charon the Red Dragon).
5. **No Dead Silence**:
   - *Problem*: Previous trailer had 10 seconds of silence at the end.
   - *Fix*: A continuous 21-clip audio score running through second 299.5, culminating in an inspiring open-source community call-to-action.

---

## 2. 5-Minute Master Chapter Timeline (300s)

```mermaid
timeline
    title 5-Minute Master Walkthrough Architecture
    0:00 - 0:04 : Act 0 - Thunderbear Studios Presentation Intro (Voiced)
    0:04 - 0:45 : Act 1 - The Awakening & Town Walk (Spells, Armoury & True Descent)
    0:45 - 1:20 : Act 2 - The Crypts (Gotcha #1: 0-Turn Yaw & Tactical Melee)
    1:20 - 1:55 : Act 3 - The Dual Reality (Instant Tab & Bit-for-Bit CRT Terminal)
    1:55 - 2:30 : Act 4 - 3D Spatial Stealth (HRTF Binaural Audio & Infravision)
    2:30 - 3:15 : Act 5 - Deep Vault Combat & Spell Arsenal (Dragon Vault at 1250ft)
    3:15 - 3:55 : Act 6 - The Living Chronicle & Voiced Lorekeeper (Tome & Aoede)
    3:55 - 4:35 : Act 7 - 3D Creature Parley (Interactive Viewport Selection & Charon)
    4:35 - 5:00 : Act 8 - Universal Saves, Open Source & Grand Finale (300s)
```

---

## 3. Detailed Act-by-Act Choreography & Audio Mapping

### Act 0: Thunderbear Studios Presentation Intro (0:00 – 0:04)
- **Visual**: Cinematic obsidian radial backdrop, glowing gold Thunderbear Studios emblem, golden typography.
- **Audio (Clip 00 @ 0:01)**:
  > *"Brought to you by Thunderbear Studios."* (Enceladus, warm resonant British narrator)
- **Transition**: Smooth fade-to-world at 0:03.2, full reveal at 0:04.0.

---

### Act 1: The Awakening, Town Walk & True Stair Descent (0:04 – 0:45)
- **Save State**: `demo_intro` (High-Elf Hero in Town, steel blade & lantern, no NPC clutter).
- **0:04 – 0:10**:
  - Gaze upward at celestial canopy (Star of Eärendil and River of Stars).
  - Smooth 60fps crane down to level horizon (`pitch = 0.02, yaw = -0.50*PI`).
  - Steel weapon drawn with moonlight glint (`playEquipWeapon()`).
  - **Audio (Clip 01 @ 0:04)**:
    > *"For thirty years, you mapped the pits of Morgoth through strings of green text on an eighty-column screen. You memorized every glyph, every stat, and every cruel, unforgiving demise. Welcome back to Angband... but open your eyes."*
- **0:10 – 0:20**:
  - Confident strides down the wide cobblestone avenue.
  - Camera glides level with natural head-bob (never tilting down!).
  - Practice sword slash with whoosh SFX (`triggerAttackAnimation()`, `playWhoosh()`).
- **0:20 – 0:28**:
  - **Spellcasting Showcase**:
    - Spell 1: Glowing golden *Orb of Light* radiating outward with particle sparks (`LIGHT OF VALINOR`).
    - Spell 2: Arcane *Shadow Veil* surge with violet runic banner (`SHADOW VEIL`).
  - **Audio (Clip 02 @ 0:20)**:
    > *"Every journey begins under the stars of the town square. Stock your pack at the armory, weave your arcane wards and holy chants, and prepare for the descent."*
- **0:28 – 0:36**:
  - Arrive directly outside **[2] ARMOURY**.
  - Camera smoothly pans to showcase timber lintels, hanging shield, weapon racks, and warm lantern glow.
- **0:36 – 0:42**:
  - Smooth camera pan North toward the ancient stone walkway.
  - Stride forward directly onto the ancient stone descent stairs `>`.
  - **Audio (Clip 03 @ 0:36)**:
    > *"Step onto the ancient stone threshold, and plunge into the deep."*
- **0:42 – 0:45**:
  - **True Descent**: Player triggers `>` to descend! Deep stairwell resonance audio plays (`playStairs(true)`), camera smoothly moves down into the dark stairwell, and depth 1 level generates!

---

### Act 2: The Crypts & Gotcha #1: 0-Turn Camera Yaw (0:45 – 1:20)
- **Save State**: `demo_crypt` (50ft, depth 1).
- **0:45 – 1:04**:
  - Player stands in torchlit stone crypt. Directly ahead: small kobold asleep.
  - Full 360° camera yaw sweep while time completely freezes!
  - On-screen HUD shows turn counter remaining frozen.
  - **Audio (Clip 04 @ 0:46)**:
    > *"Rule number one for the veteran: looking around will not get you killed. Camera yaw costs precisely zero turns. Pan the darkness, inspect every corridor, scout the pillars—the world moves only when you take a step."*
- **1:04 – 1:20**:
  - Player takes 1 step forward. Kobold awakens!
  - Melee combat: sword slash, shield block with metallic clang (`BLOCK`), counter-strike critical (`CRITICAL!`), monster defeated (`SLAIN!`).
  - Pick up floor potion/scroll (`playItemPickup()`).
  - **Audio (Clip 05 @ 1:06)**:
    > *"When you do strike, feel the kinetic weight of every blow. Parries, critical strikes, and tactile weapon feedback bring turn-based survival to life."*

---

### Act 3: The Dual Reality — Instant Bit-for-Bit CRT Terminal (1:20 – 1:55)
- **1:20 – 1:40**:
  - Tap `Tab`: Immediate transition into authentic 80x24 green-phosphor Angband 4.2.6 CRT terminal.
  - Highlight camera orientation arrow indicating 3D facing on ASCII map.
  - **Audio (Clip 06 @ 1:21)**:
    > *"Miss your glyphs? Fear losing your classic overview? Press Tab. Instantaneous, bit-for-bit Angband 4.2.6 CRT terminal mode. Every dungeon tile, monster letter, and stat line is preserved. The 3D world and the classic matrix are one and the same."*
- **1:40 – 1:55**:
  - Open inventory `i`, scroll equipment `e`, inspect item with `l`.
  - Take 2 steps in ASCII mode to prove full bidirectional synchronization.
  - Tap `Tab` again: seamlessly snap right back into full 3D first-person perspective.
  - **Audio (Clip 07 @ 1:42)**:
    > *"Step through the dungeon in ASCII, manage your inventory with classic keys, and return to 3D right where you stand. Seamless, uncompromising dual reality."*

---

### Act 4: 3D Spatial Stealth & Infravision (1:55 – 2:30)
- **Save State**: `demo_stealth` (250ft, depth 5).
- **1:55 – 2:13**:
  - Claustrophobic stone labyrinth with sharp 90-degree blind turns.
  - Extinguish lantern: torchlight fades into moody subterranean gloom.
  - 3D spatial audio ripple shows snoring sound panned in left ear.
  - **Audio (Clip 08 @ 1:56)**:
    > *"In first-person, corridors are narrow and corners are blind. But you have ears. 3D spatial audio lets you hear snoring orcs and skittering vermin around the bend before you walk into their line of sight."*
- **2:13 – 2:20**:
  - Snerk the Snaga whispering in the dark:
  - **Audio (Clip 09 @ 2:14)**:
    > *"Hssst... quiet in the dark... the man-thing smells of iron and lamp oil..."* (Goblin voice)
- **2:20 – 2:30**:
  - Ranger's infravision activates: ethereal misty red creature silhouette appears through solid gloom!
  - Player creeps forward and surprises the scout.
  - **Audio (Clip 10 @ 2:21)**:
    > *"When the shadows thicken, your infravision pierces the gloom, painting heat silhouettes through the blackness."*

---

### Act 5: Deep Vault Combat & Spell Arsenal (2:30 – 3:15)
- **Save State**: `demo_combat` (1250ft, depth 25).
- **2:30 – 2:54**:
  - Volcanic chamber: Young Red Dragon towering at (106, 24).
  - Tactical escape: Phase Door spell teleport (`WARP` + teleport chime).
  - Quaff Potion of Resist Heat (`playQuaff()`, fire shield status icon lights up on HUD).
  - Unleash Lightning Wand / cast Lightning Strike (`CAST` + lightning bolt + thunderclap).
  - Advance and slash with Blade of Westernesse.
  - **Audio (Clip 11 @ 2:32)**:
    > *"At twelve-hundred and fifty feet, the dragon vault opens! Phase Door to break line of sight, unleash lightning wands to soften scales, and strike with Westernesse. Pure, tactical roguelike combat."*
- **2:54 – 3:15**:
  - Rapid showcase of spellbook spells: Holy Chant healing, Arcane Barrier, Teleport Other.
  - **Audio (Clip 12 @ 2:56)**:
    > *"From fiery bolts to protective spheres and teleportation, every spell from the 4.2.6 compendium is rendered with vibrant particle kinetics."*

---

### Act 6: The Living Chronicle & Voiced Lorekeeper (3:15 – 3:55)
- **3:15 – 3:32**:
  - The Living Chronicle Tome opens smoothly on the right dock.
  - Illuminated parchment pages display the character's pilgrimage penned in real time.
  - **Audio (Clip 13 @ 3:15)**:
    > *"Every deed of your pilgrimage is penned in real time into the Living Chronicle. Open the Tome to review your epic saga, or consult the Voiced Lorekeeper for tactical secrets."*
- **3:32 – 3:45**:
  - Clicking the Voiced Lorekeeper button:
  - Aoede speaks with glowing portrait and mystical scholar voice:
  - **Audio (Clip 14 @ 3:34)**:
    > *"Fire resistance is vital against draconic breath. Don a Ring of Fire Resistance or quaff a Potion of Resist Heat before entering open halls."* (Lorekeeper Aoede)
- **3:45 – 3:55**:
  - Zooming in on Lorekeeper monster stats, weaknesses, and Tolkien historical annotations.
  - **Audio (Clip 15 @ 3:47)**:
    > *"The Lorekeeper draws upon deep Tolkien lore and the complete Angband monster compendium, giving you strategic wisdom for every beast in the pit."*

---

### Act 7: 3D Creature Parley & Interactive Dialogue (3:55 – 4:35)
- **3:55 – 4:09**:
  - In the 3D viewport, mouse cursor hovers over the Young Red Dragon.
  - High-definition Shockbolt 3D model lights up with an interactive golden targeting reticle.
  - Clicking the dragon opens the Parley Modal in 3D!
  - **Audio (Clip 16 @ 3:56)**:
    > *"And the denizens of the dark are more than mere statistics. Click any creature directly in the 3D world to parley with authentic AI-voiced characters."*
- **4:09 – 4:24**:
  - The Red Dragon speaks in a booming, terrifying gravel voice:
  - **Audio (Clip 17 @ 4:10)**:
    > *"My scales are like iron, and my breath is flame! Fools dare challenge the brood of the deep. Flee, mortal, ere your bones join the embers of the vault!"* (Dragon Charon)
- **4:24 – 4:35**:
  - Player responds or navigates dialogue choices in real time.
  - **Audio (Clip 18 @ 4:25)**:
    > *"Bargain, taunt, or listen—every creature speaks in character, bridging classic roguelike depth with modern immersive roleplay."*

---

### Act 8: Universal Saves, Open Source & Grand Finale (4:35 – 5:00)
- **4:35 – 4:50**:
  - UI showcases the `Export .sav` button: standard `SaveVNLA` format.
  - Showing cross-platform icons: Web Browser (Chrome/Firefox/Safari) + Windows Desktop + Android APK.
  - **Audio (Clip 19 @ 4:36)**:
    > *"Angband 3D is one-hundred percent free and open-source on GitHub, built for the community to explore, mod, and celebrate. Export and load your savefiles universally across Web Browser, Windows PC, and Android APK."*
- **4:50 – 5:00**:
  - Final visual montage: rapid cinematic cuts of town under stars, deep dungeon vault, and classic terminal.
  - Final Thunderbear Studios card with `https://angband3d.com` and GitHub badges.
  - **Audio (Clip 20 @ 4:51)**:
    > *"No microtransactions, no paywalls. Thirty years of roguelike history, reborn. Play free now in your browser at angband3d.com. The descent awaits."*
  - Musical finale concludes precisely at 299.8s. **Zero silence.**

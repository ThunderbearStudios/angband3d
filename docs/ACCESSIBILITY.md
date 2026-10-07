# Angband 3D — Accessibility Statement & Evaluation Dossier

> **Standard Compliance**: [Game Accessibility Guidelines (GAG)](https://gameaccessibilityguidelines.com/) (Basic, Intermediate, and Advanced), AbleGamers APX (Accessible Player Experiences), and Section 508 / CVAA principles.  
> **Target Audience**: Accessibility Evaluators, AbleGamers, GAconf, IGF Accessibility Jurors, and Players of all ability profiles.  
> **Official Web Client**: [https://angband3d.com](https://angband3d.com)  
> **Interactive Cinema Showcase**: [https://angband3d.com/demo](https://angband3d.com/demo)  

---

## 1. Executive Summary & Accessibility Philosophy

Foundational roguelikes are uniquely positioned to be among the most accessible games ever conceived: they are completely turn-based, mathematically transparent, and place zero demand on physical reflexes or reaction times. However, transitioning a turn-based ASCII game into first-person 3D introduces significant accessibility pitfalls—most notably motion sickness, vestibular disorientation, visual clutter, and complex 3D spatial controls.

**Angband 3D was architected from day one to break this barrier.**

Rather than treating accessibility as an afterthought, Angband 3D’s core technical innovations—the **0-turn camera yaw**, the **Dual-Reality `[Tab]` CRT terminal mode**, **100% visual-auditory redundancy**, **closed captions (`[CC]`)**, and **master -6 dB audio dynamics limiting**—directly dismantle motor, sensory, visual, and cognitive barriers.

---

## 2. Motor & Physical Accessibility

### 2.1 Pure Turn-Based Temporal Agency (Zero Twitch Reflexes)
- **Zero Reaction Time Dependency**: The game simulation is 100% turn-based. Time does not advance until the player executes a discrete movement or action command.
- **Infinite Decision Windows**: Players may pause between actions for seconds, minutes, or hours without penalty. There are no Quick-Time Events (QTEs), no real-time dodging windows, and no timed puzzles.
- **Elimination of Motor Fatigue**: Players with tremors, limited dexterity, cerebral palsy, or chronic joint fatigue can engage in deep tactical combat at their own pace without physical exhaustion.

### 2.2 0-Turn Continuous Spatial Look
- **Zero Time Penalty for Looking**: Unlike traditional 3D grid crawlers where rotating the camera advances the game clock, Angband 3D decouples camera yaw from game time.
- **Effortless Scouting**: Players can slowly pan the camera 360 degrees to inspect vaulted ceilings, read signs, or check for monster ambushes without fear of being attacked while looking.

### 2.3 Comprehensive Input Redundancy & Remapping
- **Multi-Device Support**: Playable with standard keyboard, mouse-only, touch screen, or assistive switch interfaces.
- **Standard Keyset Support**:
  - Classic Roguelike Vi-keys (`h`, `j`, `k`, `l`, `y`, `u`, `b`, `n`)
  - Numeric Keypad 8-way directional movement (1–9)
  - Standard Arrow Keys
  - Modern WASD controls
- **Single-Click / Tap Execution**: Menus, store interactions, item inspections, and combat spells can all be triggered with single clicks or taps without requiring complex multi-button combinations or sustained holds.

### 2.4 Mobile Split-Thumb Touch Ergonomics
- **Natural Grip Layout**: On touch devices, controls are anchored to the lower corners in an ergonomic split-thumb layout, preventing hand cramping.
- **Generous Touch Targets**: All interactive buttons meet or exceed the recommended 48×48 CSS pixel minimum target size.

---

## 3. Vision & Sensory Accessibility

### 3.1 The Dual-Reality [Tab] CRT Mode (Vestibular & Motion Relief)
- **Complete Motion Sickness Elimination**: First-person 3D camera movement can trigger severe nausea, vertigo, or migraines in players with vestibular disorders, simulator sickness, or visual processing sensitivities.
- **Instantaneous Fallback**: With a single press of `[Tab]` (or screen icon), the game instantly crossfades into an authentic, flat 80×24 CRT ASCII terminal.
- **Zero Simulation Compromise**: The 2D terminal is not a simplified minigame—it is the exact live game simulation. Players who cannot tolerate 3D visuals can play the entire game from start to finish in clean, stable 2D with zero visual motion.

### 3.2 Visual Contrast & Typography
- **High-Contrast Color Palettes**: Clean typography rendered with high-contrast text ratios exceeding WCAG 2.1 AA standards (minimum 4.5:1 for body text, 7:1 for headers).
- **Legible Monospace Fonts**: The terminal and HUD utilize crisp, easily distinguishable monospace fonts (VT323, Courier Prime, Inter) with generous letter spacing to assist players with dyslexia.
- **Distinguishable Monster Glyph Silhouettes**: In 3D mode, monsters feature high-contrast color banding and distinct silhouettes. In 2D terminal mode, monsters are represented by distinct uppercase/lowercase ASCII characters paired with color cues.
- **Entity Tooltips & Radar**: Hovering or looking at any monster displays an immediate, high-contrast HUD tooltip with its exact name, health bar, and tactical status.

### 3.3 Spatial Radar & Minimap Orientation
- **High-Visibility Compass & Radar**: A dedicated top-corner minimap provides real-time radar blips for walkable corridors, stairs, and discovered enemies, aiding players with spatial memory or orientation challenges.

---

## 4. Auditory Accessibility

### 4.1 100% Visual-Auditory Redundancy
- **Zero Information Lost Without Sound**: Every sound effect in the game—monster footsteps, spell blasts, door creaks, potion quaffs, and critical hits—is paired with an immediate visual counterpart.
- **Dual Visual Reporting Channels**:
  1. **Top Action Banner**: Displays immediate, real-time feedback (e.g., *"The Young Red Dragon breathes fire!"*).
  2. **Expandable Message Drawer**: Keeps a permanent, scrollable log of all combat rolls, damage numbers, and tactical occurrences for subsequent review.
- **Sound Direction Indicators**: Audio spatialization is matched by on-screen radar pings and message alerts.

### 4.2 Closed Captions (`[CC]`) & Subtitles
- **Story Narration Captions**: All spoken voice passages in *The Living Chronicle* (voiced by Master Bard Enceladus and Lorekeeper Aoede) feature synchronized, high-contrast closed captions.
- **Showcase Walkthrough Captions**: The official 10-act cinematic demonstration (`/demo`) includes full, multi-lingual compatible closed captions (`[CC]`).

### 4.3 Acoustic Safety & Dynamic Limiting
- **Master Dynamics Limiter (-6 dB Ceiling)**: All audio generated by the procedural Web Audio DSP engine passes through a master `DynamicsCompressorNode` configured with a hard threshold at -6.0 dB.
- **Ear Protection**: Sudden explosive sound spikes (such as multi-projectile dragon breath or chain lightning) are smoothly compressed, preventing acoustic shock, startling spikes, or ear fatigue for players with hyperacusis or sensory processing sensitivity.
- **Independent Volume Sliders**: Players have independent volume controls for Master, Sound Effects, Ambient Sound, and Voice Narration.

---

## 5. Cognitive & Neurodivergent Accessibility

### 5.1 The Living Chronicle (Dynamic Story Recap & Memory Aid)
- **Combat & Narrative Journal**: For players with executive function challenges, ADHD, or short-term memory fatigue, returning to a complex RPG after a break can be overwhelming.
- **Real-Time Adventure Tome**: *The Living Chronicle* maintains an illustrated, readable narrative history of the current dungeon run—recording which unique monsters have been slain, which potions have been identified, and what floor depth the player has reached.

### 5.2 Information Transparency & Risk Assessment
- **Explicit Game Mechanics**: No hidden timers or obfuscated stat penalties.
- **Grimoire Spell Details**: The magic grimoire (`[m]`) explicitly displays mana cost, minimum required player level, damage formulas, and percentage failure rates before casting.
- **Inventory Inspection**: Players can inspect any item (`[i]`) to view detailed lore descriptions, weight capacity, and armor class ratings.

### 5.3 Permadeath Warnings & Save Safeguards
- **Universal Save Export (`SaveVNLA`)**: While classic Angband features unforgiving permadeath, Angband 3D empowers players by allowing single-click exports of their binary `.sav` file at any time. Players who need checkpoints for accessibility or stress management can back up their save files locally.

---

## 6. Game Accessibility Guidelines (GAG) Compliance Matrix

| GAG Guideline | Tier | Status | Implementation in Angband 3D |
|---|---|---|---|
| **Allow game to be paused / stopped** | Basic | **Full Compliance** | 100% turn-based simulation; time pauses automatically between turns. |
| **No reflex or rapid-reaction requirements** | Basic | **Full Compliance** | Zero QTEs, zero real-time dodging; infinite decision time per turn. |
| **Provide high-contrast text and UI** | Basic | **Full Compliance** | Text contrast ratios exceed WCAG AA (4.5:1 to 7:1); crisp monospace typography. |
| **Provide closed captions for spoken dialogue** | Basic | **Full Compliance** | Full synchronized closed captions (`[CC]`) on all story narration and demos. |
| **Ensure all audio cues have visual equivalents** | Basic | **Full Compliance** | Combat logs and top action banners mirror 100% of acoustic events. |
| **Prevent audio spikes & acoustic injury** | Basic | **Full Compliance** | Master Web Audio DSP dynamics compressor with hard -6 dB ceiling. |
| **Provide multiple input methods** | Intermediate | **Full Compliance** | Keyboard (vi-keys, numpad, arrows, WASD), mouse, touch screen, and switch. |
| **Provide adjustable camera & motion relief** | Intermediate | **Full Compliance** | Instant `[Tab]` toggle to 2D CRT mode completely eliminates 3D motion sickness. |
| **Provide distinct colorblind-safe visual cues** | Intermediate | **Full Compliance** | Entities distinguished by shape, glyph, and silhouette in addition to color. |
| **Provide narrative and task recaps** | Advanced | **Full Compliance** | *The Living Chronicle* logs and narrates all major dungeon events and milestones. |
| **Universal cross-platform save portability** | Advanced | **Full Compliance** | Single-click `.SAV` export/import enables seamless migration across devices. |

---

## 7. Direct Evaluator Accessibility Testing Checklist

To immediately verify these accessibility systems in action:
1. **Test 3D Motion Sickness Relief**:
   - Open [https://angband3d.com](https://angband3d.com) and enter the dungeon.
   - Press `[Tab]` to verify the instant, 0ms crossfade into the stable 2D CRT terminal.
2. **Test Temporal Agency**:
   - Encounter an enemy. Stop all keyboard/mouse inputs. Observe that the game waits indefinitely without passing time or taking damage.
3. **Test Visual-Auditory Redundancy**:
   - Mute your speakers. Fire an arrow or cast a spell. Observe that the top action banner and bottom message drawer immediately report all hit, miss, and damage telemetry.
4. **Test Closed Captions & Living Chronicle**:
   - Open [https://angband3d.com/demo](https://angband3d.com/demo).
   - Toggle the `[CC]` closed captions button in the theater controls. Observe synchronized subtitle delivery.

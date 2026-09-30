# Angband 3D — Acknowledgments & Asset Credits

This document provides complete attribution, provenance, and licensing details for all software, 3D art, typography, audio synthesis, and design resources utilized in **Angband 3D**.

---

## 1. Project Creation & Engineering

- **Design, 3D Architecture & Engineering**: Developed and presented by **Thunderbear Studios** and the Angband 3D open-source contributors.
- **Project Repository**: [https://github.com/lieb2101/angbang3d](https://github.com/lieb2101/angbang3d)

---

## 2. Core Game Engine & Historical Roguelike Lineage

Angband 3D is powered by the authoritative, unmodified **Angband 4.2.6 C engine**, operating as a headless subprocess via a high-speed, zero-allocation JSON IPC bridge.

- **Upstream Angband Project**: [https://angband.github.io/](https://angband.github.io/)
- **Angband Development Team**: Ben Harrison, James E. Wilson, Robert Alan Koeneke, Alex Cutler, Andy Astrand, David Grabiner, Robert Rühlmann, Nick McConway, Peter Denison, and the global Angband open-source community.
- **Historical Lineage**:
  - *Moria* (1983) — Robert Alan Koeneke and Jimmey Wayne Todd Jr.
  - *Umoria* (1988–1992) — Alex Cutler, Andy Astrand, and David Grabiner.
  - *Angband* (1990–present) — Alex Cutler, Andy Astrand, Keith Horner, Charles Swiger, Ben Harrison, and successive maintainers.
- **Engine License**: GNU General Public License Version 2 (GPL-2.0) and historical Angband Open Source License.

---

## 3. 3D Models, Textures & Environmental Assets

All third-party 3D models and textures utilized in Angband 3D are released under permissive public domain dedications (**CC0 1.0 Universal**) or free open-game licenses:

| Asset Collection | Author / Source | License | Usage in Angband 3D |
|---|---|---|---|
| **KayKit Dungeon Remastered** | [Kay Lousberg](https://kaylousberg.com/) / [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0) | **CC0** (Public Domain) | Dungeon stone walls, flagstone floors, arched portals, wooden doors, stone stairs, iron-bound chests, columns, and sconces. |
| **KayKit Character Pack: Skeletons** | [Kay Lousberg](https://kaylousberg.com/) / [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) | **CC0** (Public Domain) | Skeletons, liches, necromancers, and crypt horrors. |
| **KayKit Character Pack: Adventures** | [Kay Lousberg](https://kaylousberg.com/) / [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | **CC0** (Public Domain) | Rogue, warrior, mage, and humanoid adventurers and townspeople. |
| **KayKit Halloween & Crypt Bits** | [Kay Lousberg](https://kaylousberg.com/) / [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0) | **CC0** (Public Domain) | Tombs, stone coffins, sacrificial altars, skulls, and dungeon clutter. |
| **KayKit Medieval & City Builder Bits** | [Kay Lousberg](https://kaylousberg.com/) / [GitHub](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) | **CC0** (Public Domain) | Town shop fronts, timber houses, market stalls, and signage. |
| **Modular Dungeon & Monsters** | [Quaternius](https://quaternius.com/) | **CC0** (Public Domain) | Bestiary variety, beasts, vermin, and supplemental dungeon props. |
| **Kenney Game Assets** | [Kenney (Asset Jesus)](https://kenney.nl/) | **CC0 1.0 Universal** | Supplemental UI primitives and environmental textures. |

### Procedural 3D Models & Shaders (Custom Authored)
The following 3D models and shader systems were created specifically for Angband 3D under the project's open-source license:
- **Procedural Braided Bullwhip**: Multi-knot braided leather lash with curved `CatmullRomCurve3` spline, brass pommel, wrist strap, and tapered cracker tip.
- **Footwear & Boots**: Layered leather sole, contour toe cap, and buckle strap geometry for sandals, boots, and shoes (`]`).
- **Magical Jewelry**: Faceted floating gem pendants (`"`) and toroid metallic rings (`=`).
- **Potions & Reagents**: Glass vials with cork stoppers and bubbling procedural liquid shader (`!`).
- **Dynamic Shaders**: Line-of-sight modulated lava emission, molten floor displacement, ethereal sensory mist auras for detected monsters, and first-person viewmodel bobbing and weapon swaying.

---

## 4. Audio Systems & Foley Synthesis

Angband 3D uses **100% procedural mathematical sound synthesis**:

- **Web Audio API Real-Time Synthesizer (`server/public/js/audio.js`)**: Pure client-side synthesis using Web Audio API nodes (`OscillatorNode`, `BiquadFilterNode`, `GainNode`, `DynamicsCompressorNode`, `StereoPannerNode`, and `WaveShaperNode`). Zero audio files are downloaded over the network.
- **Godot C# Dynamic PCM Synthesizer (`client/scripts/AudioManager.cs`)**: Pure in-memory 16-bit PCM mathematical acoustic modeling.
- **Physical Models**:
  - Inharmonic Euler-Bernoulli bar mode transients for blade strikes and hammer crits.
  - Multi-octave resonant metallic clang with ricochet high pings for shields and heavy armor.
  - Granular fluid turbulence simulation for quaffing potions.
  - Fibrous friction noise with resonant harmonic triad chimes for reading scrolls.
  - Exponential frequency sweeps and vacuum implosion pops for teleportation.
  - Formant vocalization resonators and guttural low-frequency growls for monster grunts.
- **Zero Third-Party Audio Files**: No copyrighted or pre-recorded audio samples are bundled.

---

## 5. Typography & Fonts

All interface fonts are open-source and served via Google Fonts under the **SIL Open Font License 1.1**:

- **Cinzel**: Designed by **Natanael Gama**. Used for title typography, classical fantasy headers, and shop signboards. (SIL OFL 1.1)
- **Outfit**: Designed by **Outfit.io** / Brand New Media. Used for modern ergonomic UI labels, vital badges, and controls. (SIL OFL 1.1)
- **Fira Code**: Designed by **Nikita Prokopov**. Used for classic 80x24 monospace terminal rendering, stats grids, and coordinate telemetry. (SIL OFL 1.1)

---

## 6. Open-Source Libraries & Frameworks

- **Three.js** — [https://threejs.org/](https://threejs.org/) (MIT License, © Ricardo Cabello and Three.js authors)
- **Godot Engine** — [https://godotengine.org/](https://godotengine.org/) (MIT License, © Juan Linietsky, Ariel Manzur, and Godot Engine contributors)
- **Node.js** — [https://nodejs.org/](https://nodejs.org/) (MIT License, © OpenJS Foundation)
- **ws (WebSocket Library)** — [https://github.com/websockets/ws](https://github.com/websockets/ws) (MIT License, © Einar Otto Stangvik)
- **Express / Compression** — [https://expressjs.com/](https://expressjs.com/) (MIT License)

---

## 7. Literary Inspiration

- **J.R.R. Tolkien** (*The Silmarillion*, *The Hobbit*, *The Lord of the Rings*): The names, lore, and subterranean depths of Angband and the Iron Hell of Morgoth draw eternal inspiration from Tolkien's literary mythology.
- Please review [`LEGAL.md`](LEGAL.md) for full trademark disclaimers and non-commercial fan project terms.

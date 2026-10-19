# Angband 3D — Acknowledgments & Asset Credits

This document provides complete attribution, provenance, and licensing details for all software, 3D art, typography, audio synthesis, and design resources utilized in **Angband 3D**.

---

## 1. Project Creation & Engineering

- **Design, 3D Architecture & Engineering**: Developed and presented by **Thunderbear Studios** and the Angband 3D open-source contributors.
- **Project Repository**: [https://github.com/ThunderbearStudios/angband3d](https://github.com/ThunderbearStudios/angband3d)

---

## 2. Core Game Engines & Multi-Realm Roguelike Lineage

Angband 3D is powered by **four authoritative, unmodified C/C++ roguelike engines**, operating as headless subprocesses (or WebAssembly workers) via a high-speed, zero-allocation JSON IPC bridge:

- **Upstream Angband 4.2.6**: [https://angband.github.io/](https://angband.github.io/) — Ben Harrison, James E. Wilson, Robert Alan Koeneke, Alex Cutler, Andy Astrand, David Grabiner, Robert Rühlmann, Nick McConway, Peter Denison, and the global Angband open-source community.
- **Sil-Q (First Age of Beleriand)**: [https://github.com/sil-quirk/sil-q](https://github.com/sil-quirk/sil-q) — Original *Sil* by Scatha and half; *Sil-Q* maintained by Hugo "backwardsEric" Cornelis and contributors.
- **FrogComposBand (Chaos & Wilderness Realm)**: [https://github.com/sulkasormi/frogcomposband](https://github.com/sulkasormi/frogcomposband) — Built upon *PosChengband* (Chris) and *Chengband* / *Hengband* / *Zangband*; maintained by Sideways (sulkasormi) and the FrogComposBand community.
- **Hengband / 変愚蛮怒 (Eastern & Chaos Realm)**: [https://hengband.github.io/](https://hengband.github.io/) — Maintained by the Hengband Development Team (Habu, Hourier, Deskull, and contributors).
- **Historical Lineage**:
  - *Moria* (1983) — Robert Alan Koeneke and Jimmey Wayne Todd Jr.
  - *Umoria* (1988–1992) — Alex Cutler, Andy Astrand, and David Grabiner.
  - *Angband* (1990–present) — Alex Cutler, Andy Astrand, Keith Horner, Charles Swiger, Ben Harrison, and successive maintainers.
- **Engine Licenses**: GNU General Public License Version 2 (GPL-2.0) and the historical Angband Open Source License.

---

## 3. Illustrated Creature & Item Artwork, PBR Photogrammetry & 3D Assets

All third-party 2D/3D art and photogrammetry textures utilized in Angband 3D are used under their respective open-source licenses or permissive public domain dedications (**CC0 1.0 Universal**):

| Asset Collection | Author / Source | License | Usage in Angband 3D |
|---|---|---|---|
| **Shockbolt 64×64 Fantasy Tileset** | **Raymond "Shockbolt" Gaustadnes** ([Upstream Angband Graphic Tiles](https://github.com/angband/angband/tree/master/lib/tiles/shockbolt)) | **GPL-2.0 / Angband Open Source License** | Master illustrated 64×64 painted fantasy creature & item tileset (`4096×4096` HD creature & item atlases, 2.5D volumetric normal-mapped billboards, GUI item/creature portraits, and Chronicle Hero Action Sketch sprites). |
| **Poly Haven 2K Photogrammetry PBR** | **[Poly Haven](https://polyhaven.com/)** (Rob Tuytel, Rico Cilliers, Charlotte Baglioni, Dimitrios Savva, Greg Zaal & contributors) | **CC0 1.0 Universal** (Public Domain) | 2K photogrammetry PBR stone, brick, cobble, dirt, plaster, and timber diffuse, normal (`nor_gl`), and roughness/AO (`arm`) texture sets across dungeon and wilderness biomes. |
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

## 4. Audio Systems, Studio Foley & Open-Source Sound Libraries

Angband 3D combines **high-fidelity open-source studio foley & combat recordings** with **real-time Web Audio convolution reverb and physical acoustic modeling**:

| Audio Collection | Author / Source | License | Usage in Angband 3D |
|---|---|---|---|
| **Kenney RPG Audio & Impact Sounds** | **[Kenney (Kenney Vleugels)](https://kenney.nl/assets)** | **CC0 1.0 Universal** (Public Domain) | Recorded stone, cobblestone, grass, and timber footsteps, steel blade draws/slices, heavy plate/metal/wood/mining impacts, door latches/creaks, coin jingles, parchment/tome page flips, and glass shatter foley (`server/public/assets/audio/sfx/`, `client/assets/audio/sfx/`). |
| **The Battle for Wesnoth Core Sound Library** | **[The Battle for Wesnoth Project](https://github.com/wesnoth/wesnoth/tree/master/data/core/sounds)** (West, LordBob, Espreon, and Wesnoth sound contributors) | **GNU GPL v2.0+** (compatible with Angband GPL-2.0) | Studio-recorded medieval melee weapons (sword, axe, mace, flail, spear), bows & crossbows, elemental spells & dragon breaths (fireball, explosion, lightning bolt, arcane missiles, holy chimes, frost/petrify, water blast), and creature vocalizations (orc, goblin, troll, dragon/drake, wolf, serpent, undead skeleton/zombie/lich/wraith, bat, insect pincers/claws). |
| **Web Audio API Studio Sampler & Convolution Reverb (`server/public/js/audio.js`)** | **Thunderbear Studios** | **GPL-2.0** | Multi-sample round-robin variation engine with stereo stone-dungeon `ConvolverNode` impulse response reverb, `DynamicsCompressorNode` mastering bus, 3D stereo panning, and physical transient synthesis fallbacks. |
| **Godot C# Studio Stream & PCM Audio Engine (`client/scripts/AudioManager.cs`)** | **Thunderbear Studios** | **GPL-2.0** | Native `.ogg`/`.wav` studio sample pool loader with in-memory 16-bit PCM acoustic fallback modeling. |

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

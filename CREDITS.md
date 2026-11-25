# YASD 3D (`yasd3d.com`) & The Yendor Engine™ — Open-Source Credits & Attribution

**YASD 3D** (*"Yet Another Stupid Death"*) is an open-source first-person 3D WebGL, CRT terminal, and AI-voiced frontend harness powered by the **Yendor Engine™**, created by **Thunderbear Studios™** (`https://thunderbearstudios.dev` / `https://yasd3d.com`).

## 1. Process Isolation & License Architecture ("Mere Aggregation")

The **Yendor Engine™** executes each classical roguelike realm as an **independent OS subprocess** communicating strictly over standard `stdin` / `stdout` JSON-lines and `80×24` VT100 terminal pipes (`-mbridge`). No source code from incompatible licenses (`GPL-2.0-only`, `AGPL-3.0`, `NetHack General Public License`, `BSD-3-Clause`) is statically or dynamically linked into a single binary. Each engine remains an independent work governed by its respective upstream license.

---

## 2. Upstream Roguelike Engines & Creators

We gratefully credit the original authors, maintainers, and contributors of the 8 legendary upstream roguelike realms and the 9th **Roll Your Own Dungeon (`RYOD`)** Universal World Forge supported by the Yendor Engine™:

1. **Vanilla Angband 4.2.6 (`angband`)**
   - **Authors**: Robert Alan Koeneke, James E. Wilson, Ben Harrison, Andrew Sidwell, Nick McConnell, and the Angband DevTeam.
   - **License**: GNU General Public License v2.0 (`GPL-2.0`).
   - **Upstream**: `https://rephial.org` / `https://github.com/angband/angband`

2. **Sil-Q 1.5.0 (`silq`)**
   - **Authors**: half, Scatha, and the Sil / Sil-Q Contributors (built upon the Angband / NPPAngband lineage).
   - **License**: GNU General Public License v2.0 (`GPL-2.0`).
   - **Upstream**: `https://github.com/sil-quirk/sil-q`

3. **FrogComposBand 7.1.1 (`frogcomposband`)**
   - **Authors**: Chris, Sideways, and the PosChengband / Composband / Hengband / ZAngband Contributors.
   - **License**: GNU General Public License v2.0 (`GPL-2.0`).
   - **Upstream**: `https://github.com/sulkasormi/frogcomposband`

4. **Hengband 3.0.1 (`hengband`)**
   - **Authors**: Hengband DevTeam.
   - **License**: GNU General Public License v2.0 (`GPL-2.0`) / JAngband Open Source License.
   - **Upstream**: `https://hengband.github.io` / `https://github.com/hengband/hengband`

5. **NetHack 3.6.7 (`nethack`)**
   - **Authors**: Mike Stephenson, Izchak Miller, Ken Arnold, Jay Fenlason, and the NetHack DevTeam.
   - **License**: NetHack General Public License (`NGPL`).
   - **Upstream**: `https://www.nethack.org` / `https://github.com/NetHack/NetHack`

6. **Dungeon Crawl Stone Soup (`dcss`)**
   - **Authors**: Linley Henzell and the Dungeon Crawl Stone Soup (`DCSS`) DevTeam.
   - **License**: GNU General Public License v2.0 or later (`GPL-2.0+`).
   - **Upstream**: `https://crawl.develz.org` / `https://github.com/crawl/crawl`

7. **Brogue (Community Edition) (`brogue`)**
   - **Authors**: Brian Walker (original Brogue 1.7.5) and the Brogue Community Edition Contributors (`tmewett`, `flend`, et al.).
   - **License**: GNU Affero General Public License v3.0 (`AGPL-3.0`).
   - **Upstream**: `https://sites.google.com/site/broguegame/` / `https://github.com/tmewett/BrogueCE`

8. **Classic Rogue 5.4 (`rogue` — 1980)**
   - **Authors**: Michael Toy, Glenn Wichman, Ken Arnold (UC Berkeley), and the Roguelike Restoration Project.
   - **License**: 3-Clause BSD License (`BSD-3-Clause`).
   - **Upstream**: `https://github.com/RoguelikeRestorationProject/rogue5.4`

9. **Roll Your Own Dungeon — The Chimera Forge (`ryod` — RYOD 2.0)**
   - **Authors**: **Thunderbear Studios™** (`https://thunderbearstudios.dev` / `https://yasd3d.com`).
   - **Architecture**: Deterministic `RYOD-XXXXXXXX` blueprint compiler (`ryod-compiler.js`), 8-Realm Cross-Pollinated Chimera Disciplines (`ryod-systems.js`), 6-Card Hybrid Roll-or-Pick Tabletop Forge (`ryod-forge.js`), Playable 3D Creature Avatars, Floor 5/10/15 Subterranean Quartermaster Outposts, and Self-Hydrating `SaveRYOD` `.sav` Portability (`cartridge-core.js`).

---

## 3. 3D Models, 2D Tilesets & Audio Assets

- **Shockbolt 64×64 Fantasy Tileset**: Artwork by Raymond "Shockbolt" Gaustadnes (`GPL-2.0` / Angband distribution license).
- **3D Dungeon, High Altar, Weapon & Bestiary PBR Meshes**:
  - **Poly Haven (`https://polyhaven.com`)**: Photogrammetry 3D props, signature weapons (`antique_katana_01`, `wooden_handle_saber`), craggy stone (`rock_07`), marble cliff mineral-vein photogrammetry sets (`marble_cliff_01`, `marble_cliff_02`), statues (`gothic_statue`), and architectural assets (`CC0 1.0 Universal` Public Domain).
  - **Objaverse / Sketchfab Creative Commons Artist Bestiary (`codepawl/objaverse-clean-glb`)**: Rigged, animated, and sculpted dark-fantasy creatures (`CC-BY 4.0` / `CC0 1.0`):
    - **Fubbi**: *Hell Wolf* (`wolf.glb`, `husky.glb`, `hellhound.glb`) — `CC-BY 4.0`.
    - **InaweofGod**: *Doberman* (`shiba.glb`) — `CC-BY 4.0`.
    - **Spinnee**: *AWIL Werewolf* (`werewolf.glb`) and *Cheshire Manticore* (`hydra.glb`) — `CC-BY 4.0`.
    - **Nyilonelycompany**: *Bear* (`bear.glb`, `bear_armored.glb`) — `CC-BY 4.0`.
    - **Ear.Rodriguez**: *Jaguar* (`MountainLion.glb`) — `CC-BY 4.0`.
    - **NORBERTO-3D**: *Dragon Flying* (`Dragon.glb`) and **savounited**: *Alduin Dragon* (`cockatrice.glb`) — `CC-BY 4.0`.
    - **bakuwo**: *Snake* (`naga.glb`) and **denys4624**: *Komodo* (`lizard.glb`) — `CC-BY 4.0`.
    - **Lilly!**: *Snowy Owl* (`Owl.glb`), **Asim3d**: *Animated Eagle* (`Parrot.glb`, `Flamingo.glb`), **warrenblyth**: *American Crow* (`Stork.glb`) — `CC-BY 4.0`.
    - **Anthony Yanez (Yanez Designs)**: *Animated Beholder* (`floating_eye.glb`) — `CC-BY 4.0`.
    - **pxltiger**: *Zombie* (`zombie_model.glb`) — `CC-BY 4.0`.
    - **Mateus Schwaab**: *Great White Shark* (`aquatic.glb`), **lawtrigg**: *Kraken v2* (`kraken.glb`), **artikora**: *Glowing Mushroom* (`mushroom_cluster.glb`), **rubaun**: *Skull* (`Skull.glb`) — `CC-BY 4.0`.
  - **OpenMMO 2K PBR Asset Collection (`jake-song-openmmo/onlinerpg-assets`)**: Sculpted `2K` PBR wraiths (`GhostArmature.glb`), archfiend guardians (`GodAnubis_Art.glb`), character rigs (`thief_king.glb`), and weapons (`MIT` / Open-Source RPG Asset Release).
  - **Quaternius & Fantasy Props MegaKit & KayKit (Kay Lousberg)**: Rigged bestiary creatures (`Fox.glb`, `frog.glb`, `snake.glb`, `giant_spider.glb`, `wasp.glb`, `beetle.glb`, `centipede.glb`, `worm_mass.glb`), arcane staves/rods (`staff.glb`, `rod.glb`, `wand.glb`), and Medieval Fantasy MegaKit dungeon props (`Barrel`, `Crate_Wooden`, `Cage_Small`, `CandleStick_Triple`, `WeaponStand`, `BookStand`, `Cauldron`, `bone_A`) (`CC0 1.0 Universal` Public Domain).
  - **Poly by Google & Community Rigged Beasts (`obj2gltf` / Khronos glTF)**: `ant.glb`, `scorpion.glb`, `goblin.glb`, `orc.glb`, `orc_female.glb`, `kobold.glb`, `hobgoblin.glb`, `gnoll.glb`, `ogre.glb`, `troll.glb`, `cyclop.glb`, `lizardfolk.glb`, `skeleton_knight.glb`, `skeleton_warrior.glb`, `stone_golem.glb`, `frost_construct.glb`, `treeman.glb`, `YetiSmall.glb`, `horse_mount.glb`, `scp939.glb` (`CC-BY 3.0 / 4.0` & `CC0 1.0`).
  - **Quaternius, CreativeTrio & Poly Pizza CC0 / CC-BY 3.0 3D Expansions (Wave 4B)**:
    - **Weapons & Gear (`server/public/assets/models/items/`)**: `halberd.glb` (CreativeTrio `/m/dtLT2Nj0KF`, `CC0 1.0`), `crossbow.glb` (CreativeTrio `/m/kHb0kA11oD`, `CC0 1.0`), `flail.glb` (Poly by Google `/m/40LBkajLUig`, `CC-BY 3.0`), `phial.glb` (Quaternius `/m/WJxYta4Z96`, `CC0 1.0`), `chest_metal.glb` (Quaternius `/m/O72u4Drp8k`, `CC0 1.0`), `food_ration.glb` (jeremy `/m/06KHMUZPiGV`, `CC-BY 3.0`).
    - **Bestiary Species (`server/public/assets/models/monsters/bestiary/`)**: `balrog.glb` (Quaternius *Demon* `/m/LnfIziKv4o`, `CC0 1.0`), `minotaur.glb` (Quaternius *Horned Demon* `/m/Mo2ky6vkf8`, `CC0 1.0`), `centaur.glb` (Артур Мигранов *Horse* `/m/b48xU1GsYOT`, `CC-BY 3.0`), `corvid_raptor.glb` (jeremy *Hawk* `/m/0qIgSrL5qEn`, `CC-BY 3.0`), `feline_predator.glb` (Poly by Google *Jaguar* `/m/4fb-oMr2uUF`, `CC-BY 3.0`), `mumak.glb` (Poly by Google *Elephant* `/m/a27MA0rXyyj`, `CC-BY 3.0`).
- **Three.js 3D WebGL Renderer**: Mr.doob & Three.js Contributors (`MIT License`).
- **Yendor Engine™ 3D Harness, Universal Cartridge Bridge, Living Chronicle & YASD 3D Emblem**: © 2026 **Thunderbear Studios™** (`https://thunderbearstudios.dev`).

---

## 4. Open-Source Adaptive Soundtrack (`58` Tracks — `CC0 1.0` & `CC-BY 3.0 / 4.0`)

YASD 3D features an adaptive 58-track fantasy soundtrack across all 8 realms, combining original procedural synthesis with curated open-source orchestral, choral, harp, and dungeon dark-ambient compositions from **OpenGameArt.org** and the **Hengband BGM pack** (curated & loop-adjusted by **Sasahito Handa**):

- **HitCtrl** (`CC-BY 3.0` — `https://opengameart.org/users/hitctrl`):
  - *Alandriel's Theme (Elven Harp)* (`https://opengameart.org/content/fantasy-music-alandriels-theme`)
  - *The Elven Groves* (`https://opengameart.org/content/fantasy-music-the-elven-groves`)
  - *The Mourning Forest* (`https://opengameart.org/content/fantasy-music-the-mourning-forest`)
  - *The Wraiths of Winter* (`https://opengameart.org/content/fantasy-music-the-wraiths-of-winter`)
  - *Through the Veil of Time* (collab with TAD, `https://opengameart.org/content/through-the-veil-of-time-collab-with-tad`)
- **RandomMind** (`CC0 1.0 Public Domain` — `https://opengameart.org/users/randommind`):
  - *Destroyed Sanctuary (Dark Choir)* (`https://opengameart.org/content/medieval-destroyed-sanctuary`)
  - *The Small Fire (Tavern Lute)* (`https://opengameart.org/content/medieval-the-small-fire`)
  - *Warrior's Lament* (`https://opengameart.org/content/medieval-warriors-lament`)
- **Northivanastan** (`CC0 1.0 Public Domain` — `https://opengameart.org/content/dungeon-ambient-vorf%C3%BChrung`):
  - *Vorführung (Deep Dungeon Ambient)*
- **The Cynic Project (`cynicmusic.com`)** (`CC0 1.0 Public Domain` — `https://opengameart.org/content/fantasy-night`):
  - *Fantasy Night (Starlight Wilderness)*
- **Matthew Pablo (`www.matthewpablo.com`)** (`CC-BY 3.0` — `https://opengameart.org/users/matthew-pablo`):
  - *Dark Descent (Extended Cut)* (`https://opengameart.org/content/dark-descent-extended-cut`), *Leap Into Eternity (Live Orchestra)*, *Woodland Fantasy*, *Wasteland Overdrive*, *Blackmoor Tides*, *Wasteland Showdown*, *Evasion*, *Heroic Demise*, *The Dark Amulet - Dark Mage Theme*
- **Gundatsch (`https://soundcloud.com/gundatsch`)** (`CC-BY 3.0`):
  - *Dungeon of Agony* (`https://opengameart.org/content/dungeon-of-agony`)
- **Of Far Different Nature** (`CC-BY 4.0`):
  - *Throne Room (Unique & Lord Battle)* (`https://opengameart.org/content/throne-room`), *Epic Departure* (`https://opengameart.org/content/epic-departure`)
- **TAD (`https://www.youtube.com/c/Tadon`)** (`CC0 1.0` / `CC-BY 3.0` / `CC-BY 4.0`):
  - *Treasure Hunter*, *Forward Operating Base*, *Arcana*, *Revenge*, *Wind Run*, *Epic Orchestra+Drum*
- **migfus20** (`CC-BY 4.0`):
  - *Boss Introduction*, *Search*, *Hero on Guard*, *Mist Forest*, *Field*, *Panic*, *Despair*, *Somewhere*
- **Additional OpenGameArt & Hengband BGM Contributors** (loop-arranged by **Sasahito Handa**):
  - **Emma_MA** (*Determined Pursuit*, *QaziJamJam* — `CC0`), **joeBaxterWebb** (*Mutant Orchestra* — `CC-BY 4.0`), **Axton Dylan Crolley** (*Menu or Level Select Theme* — `CC-BY 3.0`), **Doge** (*Fantasy - Grasslands* — `CC0`), **LokiF** (*Title Theme* — `CC0`), **CelestialGhost8** (*Dark Intro* — `CC0`), **Alexandr Zhelanov** (*Dark Ambience* — `CC-BY 3.0`), **Jobromedia** (*Menu Screen* — `CC-BY 3.0`), **Kistol** (*Snowing* — `CC0`), **Umplix** (*8-Bit Explorative* — `CC0`), **BigGiantCircles** (*Glory* — `CC-BY 3.0`), **Telaron** (*bedtime/quest complete* — `CC-BY 3.0`), **Remaxim** (*The Old Tower Inn* — `CC-BY-SA 3.0`).
- **YASD 3D Original Theme (*Angband 3D Theme*) & Procedural Synthesizer**: © 2026 **Thunderbear Studios™** (`https://thunderbearstudios.dev`).

---

## 5. Realm Collector Card Nostalgia Plates (`server/public/assets/realms/*.webp`)

The 8 classic Realm Collector Cards deliberately use authentic open-source engine title screens, documentation plates, and Public Domain fine-art engravings; newly commissioned illustration is used strictly for **RYOD**:

- **`angband.webp`**: John Martin, *Le Pandémonium* (1841, Musée du Louvre — `Public Domain` via Wikimedia Commons).
- **`silq.webp`**: Official Sil-Q / MicroChasm documentation tile plate (`variants/silq/lib/docs/sil-gfx-tiles_120x120.png` — `GPL-2.0`).
- **`dcss.webp`**: Official Dungeon Crawl Stone Soup *Ignis, the Dying Flame* splash painting (`crawl-ref/source/dat/tiles/title_kaonedong_ignis_the_dying_flame.png` by `kaonedong` — `CC0 1.0`, cropped full-bleed 16:9).
- **`nethack.webp`**: Authentic graphical *Vulture for NetHack* isometric dungeon view (`https://commons.wikimedia.org/wiki/File:Vultures-2.1.0_screenshot.jpg` — `GPL` / `NGPL` ecosystem, cropped full-bleed 16:9).
- **`brogue.webp`**: Official Brogue / BrogueCE flaming-chasm title screen (`io.github.tmewett.brogue.metainfo.xml` — `AGPL-3.0-or-later`).
- **`frogcomposband.webp`**: Gustave Doré, *The Destruction of Leviathan* (1865 — `Public Domain` via Wikimedia Commons).
- **`hengband.webp`**: Utagawa Kuniyoshi, *Takiyasha the Witch and the Skeleton Spectre* (c. 1844 — `Public Domain` Edo ukiyo-e woodblock print via Wikimedia Commons, cropped full-bleed 16:9).
- **`rogue.webp`**: Giovanni Battista Piranesi, *The Drawbridge (Carceri d'Invenzione, Plate VII)* (c. 1761 — `Public Domain` via Wikimedia Commons, torchlight-graded 16:9).
- **`ryod.webp`**: *The Chimera Forge* original dark-fantasy illustration — © 2026 **Thunderbear Studios™** (`https://yasd3d.com`). See also `server/public/assets/realms/ATTRIBUTION.md`.

# YASD 3D (`yasd3d.com`) & The Yendor Engine™ — Open-Source Credits & Attribution

**YASD 3D** (*"Yet Another Stupid Death"*) is an open-source first-person 3D WebGL, CRT terminal, and AI-voiced frontend harness powered by the **Yendor Engine™**, created by **Thunderbear Studios™** (`https://thunderbearstudios.dev` / `https://yasd3d.com` / `https://angband3d.com`).

## 1. Process Isolation & License Architecture ("Mere Aggregation")

The **Yendor Engine™** executes each classical roguelike realm as an **independent OS subprocess** communicating strictly over standard `stdin` / `stdout` JSON-lines and `80×24` VT100 terminal pipes (`-mbridge`). No source code from incompatible licenses (`GPL-2.0-only`, `AGPL-3.0`, `NetHack General Public License`, `BSD-3-Clause`) is statically or dynamically linked into a single binary. Each engine remains an independent work governed by its respective upstream license.

---

## 2. Upstream Roguelike Engines & Creators

We gratefully credit the original authors, maintainers, and contributors of the 8 legendary roguelike realms supported by the Yendor Engine™:

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
   - **Authors**: Brian Walker (original Brogue 1.7.5) and the Brogue Community Edition Contributors (flend et al.).
   - **License**: GNU Affero General Public License v3.0 (`AGPL-3.0`).
   - **Upstream**: `https://sites.google.com/site/broguegame/` / `https://github.com/flend/BrogueCE`

8. **Classic Rogue 5.4 (`rogue` — 1980)**
   - **Authors**: Michael Toy, Glenn Wichman, Ken Arnold (UC Berkeley), and the Roguelike Restoration Project.
   - **License**: 3-Clause BSD License (`BSD-3-Clause`).
   - **Upstream**: `https://github.com/RoguelikeRestorationProject/rogue5.4`

---

## 3. 3D Models, 2D Tilesets & Audio Assets

- **Shockbolt 64×64 Fantasy Tileset**: Artwork by Raymond "Shockbolt" Gaustadnes (`GPL-2.0` / Angband distribution license).
- **3D Dungeon & Bestiary Meshes**: Quaternius, KayKit (Kay Lousberg), and Poly Haven (`CC0 1.0 Universal` Public Domain).
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

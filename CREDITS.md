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
- **3D Dungeon & Bestiary Meshes**: Quaternius, KayKit, and Poly Haven (`CC0 1.0 Universal` Public Domain).
- **Three.js 3D WebGL Renderer**: Mr.doob & Three.js Contributors (`MIT License`).
- **Yendor Engine™ 3D Harness, Universal Cartridge Bridge, Living Chronicle & YASD 3D Emblem**: © 2026 **Thunderbear Studios™** (`https://thunderbearstudios.dev`).

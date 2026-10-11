# Bridge protocol v1

Line-delimited JSON over the child process's stdin/stdout. One JSON object per
line, UTF-8, no embedded newlines. Everything outside printable ASCII is emitted
as `\uXXXX`, so the stream is valid UTF-8 regardless of the host locale.

stdout carries the protocol and nothing else. Angband's own diagnostics go to
stderr.

## Lifecycle

```
engine -> client   {"t":"hello", ...}
engine -> client   {"t":"frame","seq":1, ...}      <-- game is waiting for input
client -> engine   key x
engine -> client   {"t":"frame","seq":2, ...}
```

### The synchronisation contract

**The engine emits its first frame before the client has sent anything.** A
client must consume that frame at connect, then after each command wait for a
frame whose `seq` is greater than the last one seen. Clients that assume
one-frame-per-command without checking `seq` will read stale state and appear
to have no effect on the game.

`seq` increases by at least one per frame and never resets.

## Messages from the engine

### `hello`

Sent once at startup.

| field | type | meaning |
|---|---|---|
| `protocol` | int | Protocol version. Currently `1`. |
| `build` | string | Angband build id, e.g. `"Angband 4.2.6"`. |
| `savefile` | string | Full path of the savefile in use. |
| `save_dir` | string | Directory savefiles are read from and written to. |

### `frame`

Sent whenever the game blocks for input.

| field | type | meaning |
|---|---|---|
| `seq` | int | Monotonic frame counter. |
| `phase` | string | `"setup"` during splash/birth/level generation, `"play"` once the player is placed on a level. |
| `ui` | object | Input state: what the game is currently asking for. |
| `player` | object or null | Null before a character exists. |
| `map` | object or null | Null unless `phase` is `"play"`, or if map output is disabled. |
| `monsters` | array | Currently visible monsters. |
| `objects` | array | Currently visible floor objects. |
| `messages` | array | Up to 24 recent messages, oldest first. |
| `term` | object | The raw character grid. |

Only read `map`, `monsters` and `objects` when `phase` is `"play"`.

#### `ui`

```json
{"overlay": 3, "awaiting_command": false, "more": false}
```

| field | meaning |
|---|---|
| `overlay` | Angband's `screen_save_depth`. Non-zero means a screen has been pushed: a menu, store, character sheet or item prompt. |
| `awaiting_command` | True when the game wants a normal game command. False when it is asking a question. |
| `more` | A `-more-` message pause is waiting to be acknowledged. |

**Clients should show the terminal channel whenever `overlay > 0`, `more` is
true, or `awaiting_command` is false.** Those states exist only as text. A
client that keeps rendering its own world view during them will swallow the
player's keystrokes into an invisible menu, which is indistinguishable from a
freeze.

#### `player`

| field | meaning |
|---|---|
| `name`, `race`, `class` | Character identity. |
| `history` | Character backstory string generated at birth. |
| `y`, `x` | Position on the level. |
| `depth`, `max_depth` | Current and deepest level reached. `0` is town. |
| `level`, `max_lev` | Character level and maximum level reached. |
| `ht`, `wt` | Character height (inches) and weight (pounds). Used for viewmodel/camera scaling. |
| `exp`, `exp_max`, `exp_next` | Current experience, maximum experience attained, and experience target for next level. |
| `gold` | Current gold (AU). |
| `hp`, `hp_max` | Current and maximum hit points. |
| `sp`, `sp_max` | Current and maximum spell/mana points. |
| `ac`, `ac_base`, `ac_to_a` | Total armor class, base AC, and armor bonus (+to_a). |
| `stats` | Object with `str`, `int`, `wis`, `dex`, `con` stats containing `use`, `max`, `top`, and `reduced` boolean. |
| `statuses` | Array of active condition/effect badges with `name`, `attr` (color index), and `val`. |
| `study` | Number of spells currently available to study/learn. |
| `resting` | Resting turn counter (negative for special rest modes). |
| `word_recall`, `deep_descent` | Active recall/descent countdown turns. |
| `target` | Tracked monster target object with `name`, `hp`, `hp_max`, `pct`, and `attr` (when targeting/tracking). |
| `feeling` | Level feeling object with `mon` (monster danger rating) and `obj` (treasure rating). |
| `light` | **The player's own light radius** (torch, lantern). Drives client torch lighting. |
| `light_item`, `light_fuel` | Equipped light source name and remaining turns of fuel. |
| `weapon_item`, `weapon_tval`, `weapon_sval` | Equipped melee weapon name and item type/subtype tags. |
| `bow_item`, `bow_tval`, `bow_sval` | Equipped ranged weapon name and item type/subtype tags. |
| `shield_item`, `shield_tval`, `shield_sval` | Equipped shield name and item type/subtype tags. |
| `body_armor_item`, `body_armor_tval`, `body_armor_sval` | Equipped body armor name and item type/subtype tags. |
| `gloves_item`, `gloves_tval`, `gloves_sval` | Equipped gloves/gauntlets name and item type/subtype tags. |
| `grid_light` | **Ambient light of the square the player stands on.** Distinct from `light`; this is what Angband's status bar shows as "Light N". |
| `speed` | Current speed. |
| `dead` | Whether the character has died. |
| `wizard` | Whether wizard (god) mode is currently active. |
| `noscore` | Cheat flags. Non-zero means the game is unscored. `2` = wizard mode has been used. Persists in the savefile. |

#### `map`

```json
{"h": 65, "w": 178, "rows": [{"g": "...", "a": "...", "f": "...", "l": "..."}]}
```

`rows` has exactly `h` entries. Each row carries four parallel encodings:

| key | length | meaning |
|---|---|---|
| `g` | `w` chars | Glyph per cell, exactly what Angband would draw. |
| `a` | `2w` chars | Colour attribute per cell, two hex digits. |
| `f` | `2w` chars | Terrain feature index per cell, two hex digits. |
| `l` | `w` chars | Flags per cell, one hex digit. |

Terrain Feature (`f`) Taxonomy:

| Index | Name | Glyph | In-Universe Lore & 3D Visual Rendering |
|---|---|---|---|
| `00` | None / Void | ` ` | Unexplored abyss / unmapped void. |
| `01` | Floor | `.` | Flagstone masonry corridor or cobblestone street pavers. |
| `02` | Door Closed | `+` | Heavy forged-iron strapped oak door leaf. |
| `03` | Door Open | `'` | Wooden door swung open 70° ajar. |
| `04` | Door Broken | `'` | Shattered wood planks and iron splinter debris. |
| `05` | Up Staircase | `<` | 3D carved stone steps ascending. |
| `06` | Down Staircase | `>` | 3D carved stone steps descending into darkness. |
| `07`..`0E`| Stores 1-8 | `1`-`8` | Half-timbered shop facade with heraldic bronze emblem and gold numeral plaque. |
| `0F` | Secret Door | `#` | Camouflaged masonry blending seamlessly with surrounding walls. |
| `10` | Rubble | `:` | Collapsed boulders, jagged talus and stone rubble heap. |
| `11` | Magma Vein | `%` | Dark basalt volcanic rock with pulsating red/orange molten fissures. |
| `12` | Quartz Vein | `%` | Pale stone matrix embedded with crystalline mineral streaks. |
| `13` | Magma (Gold) | `%`/`*` | Volcanic basalt studded with glittering native gold ore nuggets. |
| `14` | Quartz (Gems)| `%`/`*` | Crystalline stone embedded with faceted, sparkling emeralds, rubies, and sapphires. |
| `15` | Granite Wall | `#` | Heavy chiseled granite stone block masonry. |
| `16` | Permanent Wall | `#` | Cyclopean subterranean bedrock and impenetrable fortress ramparts. |
| `17` | Lava | `~` | Molten bubbling incandescent lava pool. |
| `18` | Passable Rubble | `.` | Scattered small pebbles and loose gravel. |
| `19` | Tree (Forest) | `T`/`*` | 3D stylized bark trunk with tiered foliage canopy, grass beneath, and open celestial sky (strictly NO ceiling). |
| `1A` | Grass | `.` | Lush verdant outdoor meadow. |
| `1B` | Dirt Road | `:` | Packed earthen loam trail and cart paths. |
| `1C` | Shallow Water| `~` | Sparkling translucent rippling water. |
| `1D` | Deep Water | `~` | Deep oceanic blue water. |
| `1E` | Mountain | `^` | Towering alpine crag and rocky massif. |
| `1F` | Swamp | `~` | Wetland marsh, mire, and bog. |
| `20` (32) | Guild / Castle | `B`/`1` | Mayor's Office / Guildhall / Castle / Bounty Office with fortified portcullis. |
| `21` (33) | Tavern / Inn | `0`/`I` | Half-timbered tavern with swinging painted ale-mug signboard. |
| `22` (34) | Healer | `4`/`H` | Sanctified hospice / hospital portal with luminous caduceus insignia. |
| `23` (35) | Museum | `M` | Classical marble-columned repository of relics with velvet cordons. |
| `24` (36) | Casino | `7`/`C` | Gilded gaming hall & gladiator arena with roulette crest. |
| `25` (37) | Forge | `0`/`_` | Subterranean smithing forge with basalt hearth, physical 3D anvil, and pulsing coals. |
| `26` (38) | Pagoda | `T`/`S` | Eastern shrine/pagoda with upturned ceramic roof eaves and Noren Kanji curtains. |
| `27` (39) | Bookstore | `9`/`B` | Carved mahogany facade with suspended open grimoire signboard. |
| `28` (40) | Monster Stable | `8`/`s` | Split-rail cedar corral gate with straw bedding and feed troughs. |
| `29` (41) | Abyssal Chasm | ` ` | Subterranean floor fracture with depth void gradient shader and vapor mist. |
| `2A` (42) | Bush / Brake | `:` | Dense leafy bramble/brake cluster with mossy green foliage and swaying wind physics. Disambiguated from Rubble by green color attributes. |

Aquatic & Liquid Mechanics:
- Shallow Water (`1C` / 28): -0.08m camera immersion wading offset, dynamic splash/slosh footstep synthesis.
- Deep Water (`1D` / 29): -0.22m camera immersion wading offset, buoyancy oscillation, liquid plunge audio; triggers real engine drowning damage (`DAMAGE_NOESCAPE`) and blocks running in FrogComposBand and Hengband without levitation or water-walking abilities.
- Swamp (`1F` / 31): -0.10m camera immersion wading offset, viscous liquid footstep synthesis.

Flag bits:

| bit | meaning |
|---|---|
| `0x1` | Known — the player has seen or mapped this square. |
| `0x2` | In view — currently visible. |
| `0xC` | Lighting, shifted right 2: `0` line-of-sight, `1` torchlight, `2` lit, `3` dark. |

The intended rendering is: *in view* is lit, *known but not in view* is drawn
dimmed (the player's memory), and everything else is not drawn at all.

The map is produced through Angband's own `map_info()` and
`grid_data_as_text()`, so it always matches what the game itself would display,
including hallucination and detection effects.

#### `monsters` / `objects`

Each entry has `y`, `x`, `attr` and `glyph`. Monsters additionally carry `race`,
`race_level`, `hp` and `hp_max` when the monster is resolvable. Objects carry
`pile`, true when more than one item occupies the square.

Only *visible* entities are listed, which is why the list is usually empty right
after arriving on a level.

#### `term`

```json
{"w": 80, "h": 24, "cx": 12, "cy": 3, "cursor": true, "rows": [{"g": "...", "a": "..."}]}
```

The full character grid, including the map region. Clients that render the world
themselves should mask out the map area and draw only the surrounding text.
`cx`/`cy` are the cursor position; `cursor` is whether it should be shown.

### `ok` / `error` / `pong` / `bye`

Acknowledgements and diagnostics, carrying an optional `detail` string. `bye` is
the last message before the engine exits.

## Commands to the engine

One per line.

| command | effect |
|---|---|
| `key <spec>` | Queue one keypress. Advances the game. |
| `keys <text>` | Queue every character of `text` as keypresses. |
| `map on` / `map off` | Enable or disable map serialisation. Off is much cheaper when only the text UI matters. |
| `frame` | Re-emit the current frame without advancing the game. |
| `ping` | Replies `pong`. |
| `quit` | Exit immediately **without saving**. |
| `# ...` | Comment, ignored. |

Only `key` and `keys` advance the game; everything else is answered and then the
engine keeps waiting.

### Key specifications

Named: `left` `right` `up` `down` `space` `enter` `return` `escape` `tab`
`backspace` `delete` `home` `end`.

Control: `C-<letter>`, e.g. `C-s` to save, `C-w` to toggle wizard mode.

Anything else uses its first character literally, so `key >` descends and
`key @` completes character creation randomly.

## Worked example

```
key enter        # dismiss the splash screen
key @            # random race/class/etc, repeat until phase == "play"
key >            # descend
key C-w          # toggle wizard mode (then dismiss -more-, answer y)
key C-a          # debug menu, then a command key, then confirm with y
key C-s          # save
```

`tools/bridge.py` is the reference client and wraps all of this.

## Cloud WebSocket Transport (v1-ws)

The bridge protocol can be carried over WebSockets (`ws://` or `wss://`) through the cloud server relay (`server/`):

- **Endpoint**: `/ws` (supports query params `?user=<id>&save=<slot>&realm=<angband|silq|hengband|frogcomposband>&lang=<en|ja>`).
- **Framing**: Each WebSocket text frame corresponds to one line of the standard Bridge Protocol.
  - Client sends command frames (e.g. `key left`, `frame`, `quit`).
  - Server emits JSON text frames (`{"t":"hello",...}`, `{"t":"frame",...}`, `{"t":"bye",...}`).
- **Keep-alive**: Ping/pong heartbeat frames measure roundtrip network latency (displayed on the client HUD).

### REST Endpoints & Save Portability
The cloud daemon also exposes REST endpoints alongside the WebSocket gateway:
- `GET /health` — Service uptime and engine health status.
- `GET /download/angband3d-standalone.zip` — Download pre-packaged standalone client & engine zip.
- `GET /download/Angband3D-Android.apk` — Download mobile release APK package.
- `GET /api/saves` (optional `?realm=<realm>`) — List saved characters with metadata (`name`, `file`, `size`, `mtime`).
- `GET /api/saves/:filename` — Download a binary `.sav` file (`application/octet-stream`, `Content-Disposition: attachment`).
- `POST /api/saves/upload` — Upload a validated binary save file (supports raw binary body with `?name=<slot>` query param or `multipart/form-data`). Must begin with the 8-byte magic header `SaveVNLA` (ASCII `0x53 0x61 0x76 0x65 0x56 0x4E 0x4C 0x41`).
- `GET /api/config/llm` — Protected LLM configuration provider. Strictly returns `{ hasKey: bool, hasServerKey: bool, defaultModel: string, provider: string }` without ever exposing secret tokens.
- `POST /api/llm/generate` — Protected server-side proxy for Gemini Generative AI text and chronicle generation. Shields backend API keys completely from the client browser.
- `GET /api/tts` (or `POST /api/tts`) — Dual-engine audio synthesis relay. Generates streaming audio via Gemini Native Audio or Edge Neural TTS, with warm connection pooling, subterranean Web Audio DSP, and in-memory audio caching.
- `POST /api/recordings/upload` and `POST /api/demo/upload` — Dev-only tools to upload video recordings of gameplay. These endpoints are completely disabled in production and return 404 unless `ENABLE_RECORDING_UPLOAD=1` is set in the server environment AND the client connection is from a local loopback address (e.g., `127.0.0.1`).

## Compatibility

New fields may be added to any object within protocol version 1. Clients must
ignore unknown fields. Removing or repurposing a field requires a version bump.

 # #   S e r v e r   E n v i r o n m e n t   V a r i a b l e s 
 -   " T R U S T _ P R O X Y " :   s e t   t o   ' 1 '   w h e n   d e p l o y i n g   b e h i n d   a   t r u s t e d   r e v e r s e   p r o x y   ( l i k e   G o o g l e   C l o u d   R u n )   t o   c o r r e c t l y   p a r s e   " x - f o r w a r d e d - f o r "   h e a d e r s   f o r   r a t e   l i m i t i n g .  
 
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
| `protocol` | int | Protocol version from engine. Currently `1`. |
| `version` | string | Server API version (emitted by Node). Currently `"1.0.0"`. |
| `sessionId` | string | Unique connection session identifier. |
| `realm` | string | The active game realm for this session (e.g. `"angband"`). |
| `engineName` | string | Human-readable name of the game engine running. |
| `build` | string | Angband build id, e.g. `"Angband 4.2.6"`. |
| `savefile` | string | Full path of the savefile in use. |
| `save_dir` | string | Directory savefiles are read from and written to. |
| `ownerToken` | string | (Optional) Secure token proving ownership of the newly created or loaded savefile. |
| `isFallback` | boolean | (Optional) True if the requested realm failed and the server used a fallback. |

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

**View Routing Rule (`needsTerminal` / `NeedsTerminal`):** Clients should show
the terminal channel whenever `phase != "play"`, `overlay > 0`, or
(`!awaiting_command && !more`) (except active 3D directional targeting prompts
explicitly handled in 3D view). When `more` is `true` during `play` with
`overlay == 0`, clients **stay in the 3D World View** and display the `-more-`
prompt in the top HUD message banner (waiting for explicit player `Space`/`Enter`/`Escape` input).

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

The bridge protocol is carried over WebSockets (`ws://` or `wss://`) through the cloud server relay (`server/src/server.js`):

- **Endpoint**: `/ws?user=<user>&save=<save>&realm=<realm>&lang=<lang>&new=<0|1>&owner=<token>`
- **Frame Limits (`maxPayload`)**: WebSocket text frames are hard-capped at 64 KB (65,536 bytes). Oversized frames are dropped immediately to protect server memory.
- **Relay Command Allowlist**:
  Only validated commands are forwarded by the server to the native engine bridge:
  - `key <spec>` (standard keys, `C-<letter>`, arrows, whitespace, or single literal character)
  - `keys <text>` (up to 256 characters)
  - `map on` / `map off`
  - `frame` (re-emit current state)
  - `save` (triggers safe engine save persistence)
  - `ping` / `pong` (heartbeat and latency measurement)
  - `quit` (immediate disconnect)
  - `# ...` (developer comments)
  Any command outside this allowlist is rejected and logged.
- **Origin & CORS Verification**:
  WebSocket connections check the `Origin` header against same-origin or configured `ALLOWED_ORIGINS`. Cross-origin connections from unauthorized domains are rejected with HTTP 403.
- **Session Lifecycle & Handshake**:
  1. On connection, server greets client with `{"t":"hello", "sessionId": "...", "version": "...", "realm": "...", "ownerToken": "..."}`.
  2. The native engine automatically sends its initial `{"t":"frame", "seq": 1, ...}` as soon as it initializes.
  3. Ping/pong heartbeat frames measure roundtrip latency.
  4. On termination or rejection, server emits `{"t":"bye", "detail": "..."}` and closes the socket.

---

## Character Ownership & Security Token Protocol

To protect player savefiles against griefing, overwriting, or unauthorized deletion on public cloud servers, an ownership token protocol is enforced:

1. **Token Generation (TOFU - Trust On First Use)**:
   - When a player creates a new character (`&new=1`) or accesses a legacy savefile without an owner token, the server generates a cryptographically secure 32-byte hex token.
   - The token hash is stored server-side in `<savedir>/<slot>.owner.json`.
   - The token is transmitted to the client in the `hello` message (`ownerToken` property) or via `{ t: 'owner', token: '...' }`.
   - The client securely stores this token in localStorage under `angband3d_owner_<realm>_<slot>`.
2. **Re-Rolling & Overwriting (`&new=1`)**:
   - If a client requests `&new=1` or `&reroll=1` for an existing character slot, the connection must include `&owner=<token>`.
   - If the token does not match `<slot>.owner.json`, the server rejects the connection:
     - Emits `{"t":"error", "message":"Forbidden: invalid owner token for existing character"}`.
     - Emits `{"t":"bye", "detail":"Invalid owner token"}`.
     - Closes the WebSocket with custom application code `4403` (Forbidden).
3. **REST Save Operations**:
   - `DELETE /api/saves/:filename`: Requires header `X-Owner-Token: <token>`. Returns `403 Forbidden` if invalid or missing.
   - `POST /api/saves/upload`: Requires header `X-Owner-Token: <token>` if replacing an existing character save.

---

## REST Endpoints & Generative AI Proxy

The cloud server exposes secured REST endpoints:

- `GET /health` — Health check endpoint returning `{ status: 'ok', uptime: number, engine: 'ready', version: string, activeSessions: number }`. Config secrets and environment variables are strictly excluded.
- `GET /api/saves` (optional `?realm=<realm>`) — Lists saves for the specified realm with `{ saves: [{ name, file, size, mtime, hasOwner }] }`.
- `GET /api/saves/:filename` — Download character savefile (`application/octet-stream`). Path traversal is blocked (`path.basename` enforcement).
- `POST /api/saves/upload` (optional `?realm=<realm>` or `X-Realm: <realm>`) — Upload savefile. Validates binary header per realm (`SaveVNLA` 8-byte ASCII magic for `angband`; 4-byte binary version header `sf_major, sf_minor, sf_patch, sf_extra` + `.realm.json` sidecar for `silq`, `frogcomposband`, and `hengband`), validates size bounds (`>= 36` bytes and `<= 10 MB`), and validates `X-Owner-Token`.
- `DELETE /api/saves/:filename` — Delete savefile. Enforces `X-Owner-Token` validation.
- `GET /api/config/llm` — Returns `{ hasKey: bool, hasServerKey: bool, defaultModel: string, provider: 'gemini' }` without leaking keys.
- `POST /api/llm/generate` — Protected server-side proxy for Gemini chronicle and lore generation:
  - **Request Body**:
    ```json
    {
      "prompt": "string (required, max 10000 chars)",
      "systemInstruction": "string (optional, max 4000 chars)",
      "model": "gemini-2.5-flash | gemini-1.5-flash (allowlist enforced)",
      "temperature": 0.7,
      "maxOutputTokens": 1024
    }
    ```
  - **Response Body**:
    ```json
    {
      "text": "Generated narrative text...",
      "model": "gemini-2.5-flash",
      "cached": false
    }
    ```
  - **Rate Limits**: Governed by `rate-limit.js` using sliding window per IP. Exceeding limit returns `429 Too Many Requests` with `Retry-After`.
- `GET /api/tts` (or `POST /api/tts`) — Streaming voice synthesis relay with rate limiting, warm connection pooling, and in-memory LRU caching.
- `POST /api/recordings/upload` — Development-only screen recording upload. Disabled by default (returns `404 Not Found`). Only enabled when `ENABLE_RECORDING_UPLOAD=1` and caller IP is `127.0.0.1` / `::1`.

---

## Server Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Port for the HTTP and WebSocket server. |
| `TRUST_PROXY` | `0` | Set to `1` when running behind a reverse proxy (e.g. Google Cloud Run, Nginx) to inspect `x-forwarded-for` for client rate limiting. |
| `ALLOWED_ORIGINS` | *(empty)* | Comma-separated list of allowed HTTP/WS origins. When empty, same-origin enforcement is applied. |
| `LLM_RPM` | `10` | Maximum requests per minute for `/api/llm/generate` per client IP. |
| `LLM_RPD` | `500` | Maximum requests per day for `/api/llm/generate` per client IP. |
| `TTS_RPM` | `30` | Maximum requests per minute for `/api/tts` per client IP. |
| `TTS_RPD` | `1000` | Maximum requests per day for `/api/tts` per client IP. |
| `ENABLE_RECORDING_UPLOAD`| `0` | Set to `1` to enable local recording upload endpoints during automated browser tests. |
| `GEMINI_API_KEY` | *(empty)* | Google AI Studio API key used by the server-side proxy for chronicle narrative and TTS voice generation. Never sent to clients or logged. |

---

## Compatibility

New fields may be added to any object within protocol version 1. Clients must
ignore unknown fields. Removing or repurposing a field requires a version bump.

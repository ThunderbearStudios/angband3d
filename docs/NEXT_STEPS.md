# Angband3D — Status & Next Steps Roadmap

## Current System State (Post Low-Hanging Fruit & Viewmodel Hand Enhancements)

1. **Engine Bridge**:
   - Upstream Angband 4.2.6 fork on branch `bridge` with `main-bridge.c`.
   - Complete player telemetry: HP, SP, AC, Max/Exp/Next Exp, Gold, Stats (STR/INT/WIS/DEX/CON with reductions), active statuses array, targeting monster tracker, depth/feelings, physical height (`ht`) and weight (`wt`), equipped light source, weapons (`weapon_item`), bows (`bow_item`), shields (`shield_item`), cause of death (`died_from`), and fully identified `equipment`, `inventory`, and `quiver` object arrays on death.
   - 11/11 bridge smoke tests passing (`python tools/smoke_test.py`).
   - Patch file `engine-patch/0001-bridge-frontend.patch` fully synchronized.

2. **Godot 4.7.2 C# Client**:
   - **Full-Featured Death Experience & Post-Mortem Disclosure (`Overlay.cs`, `Main.cs`)**:
     - Atmospheric death screen with funeral toll audio bells (`PlayerDeath` SFX).
     - Full item & runes disclosure across Equipment, Backpack Inventory, Quiver Missiles, and Ability Scores.
     - One-click / one-key quick actions: `[R]` Reload last saved game, `[N]` Re-roll new character, `[M / Esc]` Return to main menu.
   - **First-Person Viewmodel & Hands (`ViewModel.cs`)**:
     - Tapered forearm sleeves with class-tailored fabric shaders.
     - Modeled wrist cuffs / metal bracers.
     - Articulated palm, opposable thumb, and 4 sculpted fingers with natural grip wraps around wielded weapon and torch handles.
     - Character height & race scale adaptation ($0.70\text{m} - 2.10\text{m}$ eye heights).
     - Reactive camera bob, weapon sway, attack slash/thrust animations, spellcast surges, and hit trauma recoil.
   - **Item & Monster Model Resolution**:
     - Full item matching for swords, daggers, 2H axes, 1H axes, staves, bows, crossbows, shields, books, wands, and torches.
     - Bare hands / martial fists when unarmed.
     - Animated 3D pickups with continuous hover, slow rotation, and emissive color accents.
   - **Audio & Juice Feedback**:
     - Positional sound effects (`AudioManager.cs`) for footsteps, melee impacts, spell zaps, door creaks, and stairs.
     - Floating damage numbers & crits (`Label3D` billboarding), hit sparks, and camera screen-shake.
   - **Dungeon Aesthetics & Clutter**:
     - Deterministic wall sconces with point lights in corridors (`DungeonClutterResolver.cs`).
     - Procedural props and furniture in rooms.
   - **Dark Unmapped Area Sealing & Dynamic Emission Gating (`DungeonWorld.cs`)**:
     - Unmapped rock boundary sealing: tiles with `FEAT_NONE` bordering explored walkable/portal space automatically render as dark solid stone boundary walls, eliminating see-through voids into the unmapped world.
     - Dynamic per-instance emission shader for lava and magma: modulates emission by instance alpha (`COLOR.a`), ensuring full incandescent molten glow in direct line-of-sight while extinguishing emission in player memory or dark areas.
     - Enclosed subterranean lava pools with dungeon ceilings, avoiding black void cutouts.
   - **Option A Cloud Architecture & Dual-Engine Relay (`server/`, `WebSocketBridgeClient.cs`, `Main.cs`)**:
      - Headless Linux multi-stage Docker container (`server/Dockerfile`, `server/docker-compose.yml`) hosting Angband 4.2.6 C engine with Bridge protocol.
      - High-performance WebSocket daemon (`server/src/server.js`) with isolated child process management per session, REST API for save file management (`/api/saves`), and static file delivery.
      - Dual-engine client architecture: unified `IGameEngineBridge` supporting runtime toggling between `Local Engine` (process stdio) and `Cloud Realm` (WebSockets) with roundtrip ping telemetry on the HUD.
      - **Web 3D Graphics 1:1 Parity Overhaul (`dungeon3d.js`, `hud.js`, `input.js`)**:
         - Fixed Three.js `InstancedMesh` zero-albedo bug by pre-initializing `instanceColor` buffers to 1.0, eliminating pitch black dungeon walls.
         - Replicated Godot's `OmniAttenuation = 0.70f` lighting falloff, illuminating dungeon depths authentically.
         - Removed stand-in mannequin block arms and unshaded flame cones. First-person viewmodel now strictly follows Godot `ViewModel.cs` (unobstructed corner-mounted weapons with multi-material PBR).
         - Fixed unhandled viewmodel runtime TypeError that halted web client frame processing.
         - Floating 3D billboard shop signage (`[1] General Store` ... `[8] Home`, `[>] Down to Dungeon (50')`) with crisp black outlines and distance culling matching Godot `Label3D`.
         - 1:1 Godot minimap: direct ASCII glyph parsing from `map.rows[y].g`, `a`, `l` with 32-color palette, LOS darkening, floor underlays, golden vision cone with boundary arc, two-tone directional polygon pointer (`drawDirectionalPointer`), and `MINIMAP (X,Y) Town [▲ N]` coordinate header.
         - Minimap controls: size presets (`compact`, `expanded`, `tactical`), continuous zoom (0.5x to 3.0x), header click cycling, and real-time 60fps rotating compass needle with 8-point text (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`).
         - Detailed 3-row footer replicating Godot `Overlay.cs:1620-1748` (contextual stairs hint, name/race/class/level, colored HP, SP, AC, gold, EXP, place, speed, light status with fuel/radius, facing, target tracking, condition badges).
         - **Camera Orientation & Level Horizon Fix**: Set Three.js Euler rotation order to `'YXZ'` (Yaw first around vertical world axis, then Pitch up/down, then Roll) and clamped stationary roll (`rotation.z`) strictly to 0. Completely eliminated the Dutch-angle left/right room tilt and diagonal skew, providing a level horizon in all directions while keeping character height pitch compensation.
         - **True Fog of War & Misty Blackness**: Replaced corridor boundary wall synthesis with authentic subterranean darkness. Unexplored cells (`feat === 0 || (!known && !inView)`) are not rendered as fake granite walls, allowing dungeon corridors to open into smooth, atmospheric `THREE.FogExp2` misty blackness.
         - **Reliable `-more-` Prompt Dismissal**: Added direct `key space` handling for <kbd>Space</kbd>, <kbd>Enter</kbd>, and click events on `#prompt-bar` / exploration canvas during `ui.more` states, preventing melee attack animations and ensuring instant prompt advancement.
         - **Atmospheric Death Screen & Full Terminal Interactivity**: Crimson-themed post-mortem modal with 5 tabs (Tombstone & Menus, Equipment, Inventory, Quiver, Stats grid). Tab 0 forwards all terminal keystrokes (`y`, `n`, `Enter`, `Space`, arrow keys) to answer panic save and character dump prompts, while `Tab`/`1`..`5` switch tabs, `u` identifies items, `R` reloads, and `N` rerolls.
      - **Web Client Usability, Interaction & Explicit Controls Milestone**:
         - **Seamless Character Confirmation -> 3D Transition**: Fixed terminal lock bug after character creation by clearing `forceTerminal = false` and dismissing the terminal on `Accept & Play (Enter)` button click and physical <kbd>Enter</kbd>/<kbd>y</kbd> keys. Added automatic phase transition guard in `network.onFrame` and restricted review toolbar strictly to `!frame.map`.
         - **Real-Time Message Feed Queue (Newest First & Turn Fading)**: Inverted message order so that the latest message is always displayed at the top (`#message-log-queue.prepend`), popping in with spring animation (`@keyframes msgPopIn`). Stripped trailing prompts (` -more-`, ` [more]`) from log entries. Messages smoothly fade after 2 turns (or 5.5s) and are cleanly evicted after 4 turns (or 7.5s) while cascading down with decreasing opacity.
         - **Comprehensive 3D Item Model Resolution & Footwear Parity**: Overhauled `createItem3DEntity` with full keyword and glyph resolution matching Godot's `ItemModelResolver.cs`. Replaced generic white octahedron placeholders with full OBJ templates (Armor, Helmets/Crowns, Gloves, Shields, Axes, Hammers, Greatswords, Daggers, Spears, Bows, Arrows, Food, Gems, Skulls, Keys, Backpacks/Pouches) and dedicated procedural 3D meshes (leather soles & straps for sandals/boots/shoes `]`, glowing torches `~`, toruses for rings `=`, gem pendants for amulets `"`, and potions `!`).
         - **Non-Intrusive Glassmorphic Footer Overhaul**: Replaced the bulky 160px, 3-row monospace text block with a compact 28px glassmorphic status ticker (`.hud-status-bar`). Organized telemetry into environment pills (`[🏛 Town]`, `[🧭 N]`, `[☀️ Daylight]`, `[⚡ Spd Normal]`), dynamic contextual alerts (`[⬇ Downstairs >]`, `[⚔ Target]`, `[⚔ Weapon]`), and condition badges (`[Fed]`, `[Study]`, `[⌨ Controls ?]`), completely freeing the 3D viewport.
         - **Random Character Review Pause**: Auto-birth halts on the final character sheet, giving players full review of rolled stats, race, class, and history before entering town, with `⚔ Accept & Play (Enter)` and `🎲 Reroll Hero (R)` buttons.
          - **Store Entrance Auto-Display & Native Trigger Parity**: Fixed shop entrance navigation by removing erroneous artificial key injection on shop entrance tiles. Stepping onto a shop entrance tile automatically invokes `EVENT_ENTER_STORE` (`overlay: 2`), opening the store interface with store owner/title and inventory. Exiting returns directly to the 3D town world.
          - **Contextual Footer Action Menus & Touch Pills**: Fixed `isStore` misclassification in `updateTerminalToolbar`. Opening Inventory (`i`), Equipment (`e`), Throw (`v`), Quaff (`q`), Read (`r`), Cast (`m`), Fire (`f`), or Drop (`d`) in town or dungeon opens the contextual terminal modal with interactive item pills (`[a] Item Name`, `[b] Item Name`), dynamic titles (`🎒 INVENTORY PACK`, `🛡 EQUIPPED GEAR`, `🎯 THROW ITEM`, etc.), switch (`/`), and cancel (`Esc`) returning smoothly to 3D.
          - **Keyboard Controls Parity & Zoomable Classic View Milestone**:
             - **Strict Keyboard Invariant (NO WSAD for Movement)**:
                - Removed `w`, `s`, `W`, `S` from `mainMenu`, `loadMenu`, and `pauseMenu` navigation. Menu navigation is strictly Arrow keys (Up/Down) or numbers.
                - Restored complete 3D exploration keyboard controls by connecting `handleWorldKey` directly to movement dispatcher without dead methods.
                - Movement is strictly Arrow keys (`ArrowUp`=forward, `ArrowDown`=back, `ArrowLeft`=turn left 90°, `ArrowRight`=turn right 90°, `Shift+ArrowLeft/Right`=strafe) and Number Pad (`Numpad8`=forward, `Numpad2`=back, `Numpad4`=strafe left, `Numpad6`=strafe right, `Numpad7,9,1,3`=diagonals, `Numpad5`=stay/rest/attack).
                - Top-row digits (`Digit0`..`Digit9`) strictly pass through as repeat counts / quantities to the engine.
                - All single-letter keys (`w`=wield/wear, `s`=spike door / sell in shop, `a`=aim wand, `d`=drop item, `i`=inventory, `e`=equipment, `m`=cast spell, `q`=quaff potion, `r`=read scroll, `g`=pickup, `o`=open, `c`=close, `f`=fire, `v`=throw) pass unhindered to the Angband engine.
                - Removed stale `[4 / A]` and `[6 / D]` tooltip references on the 3D D-pad.
             - **Zoomable Classic CRT Terminal Viewport**:
                - Wrapped `<canvas id="terminal-canvas">` inside `<div id="terminal-viewport" class="terminal-viewport">` with hardware-accelerated touch panning and scrolling (`overflow: auto; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y`).
                - Added dedicated toolbar zoom controls: `[🔍 -]` (Zoom Out), `[100%]` (Reset / Fit), `[🔍 +]` (Zoom In) supporting smooth scaling from 0.6x to 2.5x.
                - Added keyboard zoom shortcuts: `Ctrl + =` / `+` (Zoom In), `Ctrl + -` / `-` (Zoom Out), `Ctrl + 0` (Reset Zoom).
                - Integrated touch pinch-to-zoom and mouse wheel zoom within the terminal viewport.
                - Preserved pixel-accurate mouse/touch selection (`handleRowClick`) using `getBoundingClientRect()` across all zoom levels.
             - **Scrapped Supplemental Choices Strip**:
                - Removed artificial `#terminal-choices-container` and fragile regex scraping chips, eliminating broken buttons like `[0] 4 LB`.
             - **Classic View D-Pad Navigation Dock**:
                - Provided `#terminal-touch-controls` with 5-button directional D-pad (`▲`, `▼`, `◀`, `▶`, `⏎`) and action keys (`⎋ Esc`, `␣ Space`, `⛶ 3D View`, `🎒 Pack`, `🛡 Gear`, `✨ Cast`, `🚪 Open`, `⏳ Rest`).
                - Kept D-pad dock active in stores and classic mode on touch devices, allowing seamless navigation of menu highlights and item selection.
             - **Strict Store Overlay Classification Guard**:
                - Enforced `isStore = inOverlay && !isItemPrompt && (isStoreFeat || hasStoreText)`.
                - A store is only active when `ui.overlay > 0`. Walking around town near shop entrances (`ui.overlay === 0`) will never mislabel the town map as a shop.
          - **Mobile & Tablet UX Transformation & Visual Repair (Split-Thumb Layout & Overlap Resolution)**:
             - **Top-Right Telemetry & Header Overlap Fix (`dungeon.css`, `index.html`)**:
                - Diagnosed and resolved severe header overlap across phone screens: `#top-right-bar` previously occupied ~530px across, colliding directly with `#review-hero-header`, `#splash-title`, `#main-menu-overlay`, and the top of `#message-feed-window`.
                - Applied high-specificity compaction for mobile/touch screens (`max-width: 768px`, coarse pointer): completely hides `#ping-badge`, `#btn-controls`, `#btn-fullscreen`, volume slider, and text labels. Compresses the top bar to two 38x38px icon buttons `[🔊]` and `[⚙]` (~82px width), completely freeing the top row.
                - Added safe top clearance (`padding-top: calc(48px + var(--safe-top)) !important;`) on all full-screen overlays (`#splash-overlay`, `#main-menu-overlay`, `#terminal-container`, `#guide-modal`, `#load-modal`).
             - **Desktop Toolbar Quarantine (Zero Duplicate Buttons)**:
                - Fixed bug where desktop `.terminal-toolbar` (`[REROLL HERO (R)]`, `[CUSTOM HERO (C)]`, `[ACCEPT & PLAY]`, `[BACK]`) rendered simultaneously with the mobile hero card's `.m-hero-actions-bar`.
                - Enforced quarantine in CSS (`#terminal-card.mobile-card-active .terminal-toolbar { display: none !important; }`) and programmatically in `app.js` (`updateTerminalToolbar`), guaranteeing single, unified 48px tactile actions.
             - **Unbreakable Splash & Menu Typography**:
                - Eliminated word wrapping mid-name (`A N G B A` / `N D  3 D`) on narrow phone viewports by replacing spaced characters with solid strings (`ANGBAND 3D`) paired with `white-space: nowrap !important; font-size: clamp(...); letter-spacing: clamp(...)`.
             - **Blows Suffix Sanitization**:
                - Fixed double-suffix bug in combat stats (`Melee: 1d1,+2 (2.3/turn/turn)`) by stripping existing `/turn` suffixes prior to template interpolation (`mBlows[1].replace(/\/turn.*$/i, '')`).
             - **Split-Thumb Ergonomic HUD Layout (`dungeon.css`, `device.js`)**:
                - Cleanly separated phone tier (`minDim < 600px` in `DeviceProfile.getTier()`) from tablet tier (`600px <= minDim < 1024px`).
                - Movement & Orientation D-pad anchored strictly in bottom-left thumb zone (`width: 146px; height: 146px; left: max(8px, var(--safe-left)); bottom: calc(44px + var(--safe-bottom))`).
                - 2-column tactical action cluster anchored in bottom-right thumb zone (`width: 146px; right: max(8px, var(--safe-right)); bottom: calc(44px + var(--safe-bottom))`) with 44-48px touch targets for Attack/Context, Cast, Pack, Potion, Classic, and More. Completely eliminates element collisions with D-pad.
                - Character vitals panel docked as a slim floating status capsule at top-left (`top: calc(48px + var(--safe-top)); left: max(8px, var(--safe-left)); max-width: 215px`).
                - Minimap docked at top-right as a 105px circular radar (`border-radius: 50%`).
                - Desktop 180px message window hidden by default on mobile phones; `.top-message-banner` serves as a clean 1-line event ticker. Tapping the banner expands `#message-feed-window.mobile-expanded` as a smooth sliding bottom-sheet narrative drawer with scrollback history, freeing >70% of the screen height for the 3D viewport.
             - **Touch Latency Elimination & Haptic Feedback (`input.js`, `mobile-overlay.js`, `app.js`)**:
                - Injected universal `touch-action: manipulation; -webkit-tap-highlight-color: transparent;` across all interactive elements.
                - Upgraded all touch buttons (`action-btn`, `m-action-btn`, `splash-shortcut-btn`, `menu-option-btn`) with dual `pointerdown` + `click` event listeners and calibrated 100ms debouncing, completely bypassing the 300ms mobile touch delay without double-triggering.
                - Integrated multi-pattern tactile haptics (`DeviceProfile.triggerHaptic`) via `navigator.vibrate` for light, medium, heavy, and warning button presses.
             - **Native Mobile Hero Review Card (`mobile-overlay.js`, `index.html`, `dungeon.css`, `app.js`)**:
                - Replaces microscopic 80-column ASCII terminal canvas (~4.5px wide characters) on phones and tablets with a native, responsive HTML/CSS touch card.
                - Renders hero name, race, class, level, and title with gold fantasy trim; HP, SP, Armor, and Speed vitals capsules; 5 core attribute cards (STR, INT, WIS, DEX, CON) with racial bonus and best roll badges; combat chips; and formatted lore/backstory text.
                - Minimum 48px tactile touch buttons with haptic feedback: `[🎲 Reroll Hero (R)]`, `[🛠 Custom Hero (C)]`, `[⚔ Accept & Play (Enter)]`, and `[Back (Esc)]`.
             - **Automated Verification (`tools/test_responsive_profiles.js`)**:
                - 10 test suites automated via headless Chrome with real CDP across Desktop (1920x1080), Tablet (768x1024 / 1024x768), Phone Portrait (390x844), and Phone Landscape (844x390). All 10 suites passing 100%, verifying zero bounding-rect collisions, correct thumb zones, 48px touch targets, collapsed top-right bar (<= 82px), nowrap splash title, and clean single suffix.
          - **Comprehensive Message Feed & Real-Time Action Log**: Eliminated dropped combat messages by removing consecutive identical message suppression (`prevLast`). Added real-time capture from `frame.term.rows[0]` for single-turn action notices, warnings, and failures (e.g. `"There is a wall in the way!"`, `"You have no potions from which to quaff."`, `"You have nothing to fire with."`, `"You see nothing there to open."`). Color-coded lines by event type (red for monster damage, gold for player attacks/kills, green for healing, blue for spells, orange for warnings).
          - **Menu Toolbar Isolation & Real-Time Combat Message Stream Restoration (`hud.js`, `app.js`, `dungeon.css`)**:
             - Implemented missing `isWalkableOrPortal(feat)` and `isStoreKind(feat)` on `WebHUD`, resolving unhandled runtime `TypeError` when player approaches walls, doors, or monsters.
             - Fixed frozen menu toolbar: previously, runtime errors during `hud.update()` aborted execution before `updateTerminalToolbar()` ran, stranding character creation controls (`⚔ REVIEW YOUR HERO`, `Reroll Hero (R)`, `Custom Hero (C)`, `Accept & Play (Enter)`) permanently across all shop and inventory screens.
             - Quarantined character creation buttons (`btn-term-reroll`, `btn-term-custom`, `btn-term-advance`) strictly to character setup, while dynamically showing `#store-actions-bar` inside shops and `#item-actions-bar` during item prompts.
             - Fixed live message streaming in town and dungeon: baseline message history is cleanly seeded upon entering active play (`inPlay && !wasInPlay`), eliminating bulk message dumps upon dungeon descent, while allowing turn-by-turn monster kills (e.g. happy drunk), combat trades, and obstacle warnings to stream continuously into `#message-feed-window`.
          - **Staircase Descent Phase Contract**: Fixed `phase` serialization in `main-bridge.c` from `bridge_in_play() ? "play" : "setup"` to `character_generated ? "play" : "setup"`, preventing the character creation toolbar from appearing during level generation.
         - **Physical Escape Key**: Physical <kbd>Escape</kbd> now forwards to the engine across all menus, stores, and terminals, matching the on-screen `[Back (Esc)]` button.
         - **Explicit Minimap Controls**: Added dedicated `#minimap-controls-bar` with clickable Size (`[` / `]`) and Zoom (`-` / `+`) buttons with hotkey badges.
         - **Camera Head Tilt Controls**: Added `#camera-tilt-bar` with clickable `▲ Look Up (PgUp)`, `● Level (Home)`, and `▼ Look Down (PgDn)`.
         - **Complete Action Bar**: Extended action bar with all essential Angband commands (`⚔ Attack Space`, `🏹 Shoot f`, `✨ Cast m`, `🧪 Potion q`, `📜 Scroll r`, `🚪 Door o`, `💎 Get g`, `⏳ Rest R`, `🎒 Pack i`, `🛡 Gear e`, `⬇ Descend > / ⬆ Ascend <`, `📜 Classic Tab`, `❓ Help ?`).
         - **Dynamic Staircase Action Button**: Illuminates and pulses bright gold with directional label (`⬇ Enter Dungeon >`, `⬇ Descend >`, `⬆ Return to Town <`) when standing on stair tiles.
         - **Virtual Touch Diagonals**: Added 4 diagonal buttons (`NW 7`, `NE 9`, `SW 1`, `SE 3`) to the virtual touch D-pad.
         - **Controls & Commands Guide Sheet**: Integrated 6-tab modal guide opened via `⌨ Controls (?)` top button, `❓ Help (?)` action button, or physical <kbd>?</kbd> key.
         - **Top Landscape Opaque Message Feed Window**: Replaced ephemeral floating chips with an opaque landscape HUD window (#message-feed-window) at top center (`#080b12`, gold borders) that streams the complete narrative and combat feed, supports scrollback history, and includes `▲ Top`, `▼ Latest`, and `✕ Clear` controls.
         - **Resilient Death & Permadeath Transition**: Fixed unhandled exception in `hud.update` that previously blocked the death screen, ensuring the atmospheric death modal and embedded tombstone canvas (#death-terminal-canvas) appear immediately on lethal damage (`player.dead || player.hp <= 0`) while forwarding keys to dismiss prompts or restart.
         - **Warm Acoustic Footstep Audio & Movement Throttle**: Softened synthetic footstep frequencies (warm low-frequency thuds, lowpass surface friction, eliminated harsh 1.6kHz resonant pings) and reduced volume to subtle foley (`0.30`). Throttled footstep triggers per movement step to eliminate rapid machine-gun audio spikes.
    - **Universal Save Game Portability & Permadeath Snapshots (`Main.cs`, `Overlay.cs`, `app.js`, `server.js`)**:
       - **Web Client Save Download & Upload**:
         - 1-click `📥 Download (.sav)` on every save item card in the Load Saved Game modal (`/api/saves/:filename`).
         - In-game Pause Menu option `[3] Download Current Save (.sav)`: flushes save to disk and immediately downloads a local backup copy to the user's computer.
         - `📤 Upload Save (.sav)` button + drag-and-drop support on `#load-modal`: reads local binary `.sav` files, verifies `SaveVNLA` magic header, posts to `/api/saves/upload`, automatically extracts character metadata, and refreshes the save archive listing.
         - Keyboard shortcuts: <kbd>U</kbd> triggers upload file picker; <kbd>X</kbd> or <kbd>E</kbd> downloads selected save.
       - **Desktop Godot Client Sync**:
         - In-game `Save Game Manager` menu: archive saves to timestamped backups (`lib/save/backups/`), export `.sav` files directly to user Downloads, and restore backups with `SaveVNLA` binary validation.
         - Bi-directional Cloud Sync: Upload local characters to cloud server and synchronize cloud characters down to local disk.
       - In-game Standalone Package Download: Menu action to download the offline game bundle (`.zip`) directly from within the game.
   - **Sensed & Invisible Creature 3D Depiction (`main-bridge.c`, `dungeon3d.js`)**:
      - Engine bridge emits `invisible`, `detected` (`MFLAG_MARK`), and `unlit` (outside direct FOV/torchlight) flags.
      - Multi-layered procedural foggy aura in Three.js: glowing ethereal shroud, luminous inner core, floating eye iris torus, and rotating ground detection ripple.
      - Sensed monsters depicted with pulsing ghostly mist and `👁 SENSED` / `👁 SENSED [INVIS]` overhead nameplate badges.
   - **Global Audio Controls & Mute (`audio.js`, `index.html`, `dungeon.css`, `app.js`)**:
      - Smooth volume range sliders in top bar and pause menu with percentage labels and `localStorage` persistence.
      - Instant global mute button and <kbd>Ctrl+M</kbd> shortcut with bidirectional UI synchronization.
   - **Splash Screen Presentation, Credits, Key Features & Pro Tips (`index.html`, `dungeon.css`, `app.js`)**:
      - Ornate splash credits footer and quick-access navigation buttons (`[1] Key Features`, `[4] Guide`, `[5] Pro Tips`, `[6] Credits`).
      - Comprehensive technical features tab outlining headless C engine, zero-turn yaw, save portability, and dual-engine architecture.
      - Roguelike pro tips guide covering corridor funneling, lighting & infravision, speed imperatives, emergency teleportation, stair scouting, and stat drain recovery.
    - **Dedicated Procedural 3D Whip Viewmodel & Floor Model (`dungeon3d.js`)**:
       - Replaced the sword fallback for whips with a dedicated procedural 3D braided leather bullwhip:
         - Hand-wrapped dark leather grip cylinder (`#3a2012`), polished brass spherical pommel (`#d4a034`), wrist strap loop, and brass collar.
         - Gracefully curving braided leather lash generated via `CatmullRomCurve3` and `TubeGeometry` sweeping forward and downward from the right hand.
         - Tapered popper/cracker tip trailing at the end.
       - Updated `resolveRightWeaponModel()` with keyword matching for `whip`, `bullwhip`, `scourge`, and `cat-o`.
       - Rendered floor pickups as concentric coiled leather bullwhips with brass pommels instead of default hammers.
    - **HUD Footer Level & EXP Telemetry Display (`index.html`, `dungeon.css`, `hud.js`)**:
       - Positioned `⭐ Lvl` and `✨ EXP` status pills directly into the primary `.status-left` group of `#hud-footer`.
       - Styled `.pill-level` (luminous gold/amber `#fbbf24`) and `.pill-exp` (mystic amethyst `#c084fc`) with formatted numbers and thousand separators.
    - **Universal Save Game Portability & Direct Fallback (`server.js`, `app.js`)**:
       - Added `-dsave=${SAVE_DIR}` and `-dpanic=${path.join(SAVE_DIR, 'panic')}` to headless engine spawn arguments so saves write directly to `/data/save`.
       - Added multi-directory scanner `getSaveDirs()` discovering saves across `/data/save`, `lib/save`, and `~/.angband/Angband/save`, auto-mirroring files to `/data/save`.
       - Added direct fallback streaming endpoint `GET /api/saves/latest?char=...` with raw binary file detection.
       - Implemented `triggerFileDownload()` using blob streams with error trapping.
    - **Character Stats Strip AC & Gold Relocation (`index.html`, `dungeon.css`, `hud.js`)**:
       - Relocated Armor (AC) and Gold indicators from the bottom-right panel directly into the bottom-left character stats strip next to `STR`, `INT`, `WIS`, `DEX`, `CON` separated by a subtle vertical divider.
       - Wired real-time AC calculation in `WebHUD.update()` displaying base AC and magical bonuses (e.g. `10` or `14 (+4)`), and removed the redundant bottom-right economy container.
    - **Graphics & Spatial Occlusion Culling (`DungeonWorld.cs`)**:
      - Radial horizon culling ($R \le 28$ tiles) eliminating instance buffer updates outside the maximum visible fog horizon.

### Priority 6: Deep Efficiency, Performance, Operations & Standalone Packaging (COMPLETED)
- **Scope**: `server/src/server.js`, `server/public/js/dungeon3d.js`, `tools/package.ps1`, `docs/SYSTEM_DESIGN.md`
- **Accomplishments**:
  - **Zero-Allocation 3D Web Rendering**: Pre-allocated scratch color vectors and reusable math objects in `dungeon3d.js` eliminating ~15,000 heap allocations per map frame and abolishing garbage collection stutter.
  - **Cloud Delivery & Network Bandwidth Optimization**: Streaming native gzip/deflate compression in `server.js` reducing client bundle (`dungeon3d.js`) from 186KB down to 37.8KB (>79% compression ratio).
  - **Production Caching & Liveness Probes**: Implemented `Cache-Control: public, max-age=86400, immutable` for static 3D models/textures, and `/health` reporting uptime, active session counts, and engine binary status.
  - **Process Lifecycle & Graceful Shutdown**: Track active sessions in an in-memory Map and hook `SIGTERM`/`SIGINT` to cleanly flush saves and terminate engine child processes.
  - **Hardened Windows Packaging Pipeline**: `tools/package.ps1` bundles Godot's C# .NET assembly directory (`data_angband3d_windows_x86_64`), compiled C engine, PCK, launchers, and generates `Angband3D-Windows-x64.zip` and canonical `angband3d-standalone.zip`.
  - **Authoritative System Architecture Documentation**: Authored `docs/SYSTEM_DESIGN.md` with complete ASCII/Mermaid topologies, zero-alloc bridge specifications, coordinate invariants, and operational runbooks.
  - **Verification**: 11/11 C smoke tests, 0 warnings dotnet build, 7/7 server unit tests, and automated headless Chrome test verifying level horizon camera Euler order and death modal input handling.

---

## Active Execution Focus & High-Fidelity Roadmap (Daggerfall / Skyrim Aesthetic Track)

The project has achieved the **Tier 4 Visual & Environmental Overhaul**: delivering immersive dungeon atmosphere, depth-based biome shifts, dynamic torch flame VFX, rich PBR materials, and 2.5D normal-mapped monster rendering, while preserving 100% of viewmodel, tracking, and bridge architecture.

### Priority 1: Depth-Based Biomes & Atmospheric Lighting (COMPLETED)
- **Scope**: `client/scripts/DungeonWorld.cs`
- **Accomplishments**:
  - Implemented depth lookup matrix in `DungeonWorld.cs` with `BiomeProfile`.
  - 6 distinct subterranean depth zones: Town & Overworld (0), Upper Crypts (1-15), Overgrown Catacombs (16-35), Crystal Caverns (36-60), Magma Underworld (61-85), and Abyssal Throne (86-100+).
  - Dynamic `WorldEnvironment` properties (`FogDensity`, `FogLightColor`, `AmbientLightColor`, `AmbientLightEnergy`, `TonemapExposure`).
  - Active atmospheric particulate emitter (`CpuParticles3D`) dynamically configured per biome for dust motes, luminous spores, crystal shimmers, and rising volcanic embers.

### Priority 2: High-Fidelity PBR Materials & Normal/Roughness Mapping (COMPLETED)
- **Scope**: `client/scripts/DungeonWorld.cs`
- **Accomplishments**:
  - Procedural PBR masonry with multi-octave normal mapping, chiseled bevels, recessed mortar joints, and wear-modeled flagstone roughness.
  - Incandescent emissive glow for magma fissures, lava flows, and crystal veins with Softlight bloom.
  - Medieval oak plank doors with forged iron reinforcement straps, rivets, and emblazoned shop door numerals.

### Priority 3: Dynamic Torch Flame VFX & Ego Weapon Light Auras (COMPLETED)
- **Scope**: `client/scripts/ViewModel.cs`, `client/scripts/DungeonWorld.cs`
- **Accomplishments**:
  - Animated `CpuParticles3D` torch flame, rising smoke plume, and dynamic tip omni light.
  - Multi-octave Perlin noise light flicker and shadow jitter.
  - Dynamic elemental particle auras and colored lighting for ego-branded weapons (Flame, Frost, Lightning, Acid/Venom, Holy/Slay).

### Priority 4: Viewmodel Glove & Gauntlet Hand Armor Overlays (COMPLETED)
- **Scope**: `client/scripts/ViewModel.cs`
- **Accomplishments**:
  - Integration with engine body armor and glove slots (`body_armor_item`, `gloves_item`).
  - First-person viewmodel displaying held equipment with clean unobstructed lower-corner rest transforms.

### Priority 5: 3D Magic Projectiles & Monster Status VFX (COMPLETED)
- **Scope**: `client/scripts/DungeonWorld.cs`, `client/scripts/MonsterModelResolver.cs`
- **Accomplishments**:
  - Kinetic 3D projectiles (`ActiveProjectile`) with glowing cores and particle trails for arrows, player spells, and enemy spell attacks.
  - Overhead 3D status billboarding for Sleep ("💤 Zzz..."), Fear ("⚠ FLEEING"), Confusion ("🌀 CONFUSED"), and Stun ("💫 STUNNED").
  - Overhead target reticle badge (`[ ⌖ TARGET ⌖ ]`) locked to engine target tracking.

### Priority 7: High-Fidelity Procedural Audio Synthesizer & Contextual Sfx Overhaul (COMPLETED)
- **Scope**: `server/public/js/audio.js`, `server/public/js/dungeon3d.js`, `server/public/js/input.js`
- **User Constraint Invariants**:
  - Strictly **NO ambient looping noise** (no droning wind or hums).
  - 100% useful action, combat, interaction, and status indication sound effects.
  - Pure client-side Web Audio API synthesis (zero network asset downloads, zero 404s, zero latency).
- **Accomplishments**:
  - **Master Dynamics Limiter**: Inserted a `DynamicsCompressorNode` (`-12dB` threshold, `12dB` knee, `4.5` ratio, `3ms` attack, `120ms` release) on the master bus, guaranteeing zero digital clipping when multiple strikes, spells, footsteps, and creature acoustics play concurrently.
  - **Acoustic Physical Models**:
    - `hit`: Inharmonic Euler-Bernoulli bar mode frequencies ($f_0=460\text{Hz}$, $2.76f_0$, $5.40f_0$, $8.93f_0$) + low-end punch transient with soft non-linear saturation (`Math.tanh`).
    - `crit`: Sub-bass 75Hz drop + heavy hammer impact transient + ringing anvil overtone sustain.
    - `goldPickup`: Rapid 3-coin cascade (distinct impacts at $0\text{ms}$, $42\text{ms}$, $88\text{ms}$ with crystal overtone pings at 2093Hz, 2349Hz, 2793Hz).
    - `shieldBlock` / `armorDeflect`: Resonant 580Hz/1160Hz clang + high ricochet ping at 2800Hz.
    - `wallBump`: Dull 68Hz stone impact punch + surface grit friction crunch for impassable walls/doors.
    - `quaff`: Liquid bottle uncork/pop transient + two resonant bubble gulps (480Hz & 580Hz).
    - `scroll`: Fibrous parchment texture noise + glowing mystical triad chime (C5, G5, E6).
    - `eat`: Crispy multi-bite ration crunch with teeth click.
    - `chestOpen`: Heavy creaking wooden lid friction + iron latch snap.
    - `trapDisarm` & `trapTrigger`: Delicate clockwork release + relief chime vs sudden spring snap + danger thud.
    - `teleport`: Exponential spatial frequency warp (180Hz to 1400Hz) + vacuum pop.
  - **Elemental Spells**: Dedicated synthesis profiles for `fire` (combustion blast + crackle), `cold`/`frost` (crystalline ice shatter), `lightning` (electric arc snap + thunder roll), `poison` (caustic sizzle + bubble), and `magic` (ethereal harmonic sweep).
  - **Creature Vocalizations & Grunts by Glyph**:
    - Canines (`C`, `Z`, `d`): Guttural rasping growl (`synthMonsterGrowl`).
    - Serpents/Reptiles (`J`, `n`, `R`): Sibilant venomous rattle and sharp hiss (`synthMonsterHiss`).
    - Undead/Wraiths (`G`, `W`, `L`, `v`): Chilling spectral harmonic wail (`synthGhostWail`).
    - Dragons/Demons (`D`, `U`, `B`): Immense subterranean sub-bass roar (`synthDragonRoar`).
    - Rodents/Bats (`r`, `b`): High-pitch double chirp (`synthRodentSqueak`).
    - Insects/Spiders (`s`, `S`, `I`): Multi-click chitinous mandible snaps (`synthInsectChitin`).
  - **Status Condition Warning Indicators**:
    - Immediate synthesized acoustic cues with intelligent re-trigger throttling for `poison`, `confused`, `blind`, `paralyzed`, `afraid`, and `hunger`.
  - **3D Positional Stereo Panning**:
    - Implemented `calculateStereoPan(worldX, worldZ)` projecting relative monster coordinates onto camera right-vector for dynamic binaural spatial panning in Web Audio `StereoPannerNode`.
  - **Full C# Godot Parity (`AudioManager.cs`, `DungeonWorld.cs`)**:
    - Ported all 28 acoustic physical sound effect models into C# 16-bit PCM dynamic synthesizer in `AudioManager.cs`.
    - Wired status condition warnings, monster family vocalizations, and combat message hooks into `DungeonWorld.cs`.
  - **Perpetual Panic Save Trap Elimination & State Persistence Overhaul**:
    - Added `save` command to engine bridge (`main-bridge.c`), invoking `savefile_save(savefile)` for clean disk persistence with `player->is_dead = false`.
    - Automated deletion of stale panic saves in `init_bridge` when `-n` is passed so fresh games never prompt `"A panic save exists. Use it?"`.
    - In `Main.cs`: `StartGame(newCharacter: true)` passes `-n` and generates isolated character slots (`Adventurer_xxxx`), preventing save collisions with OS username.
    - In `server.js`: Clean save flush on disconnect (`ws.on('close')`) enables seamless reconnection without panic prompts; `new=1` query param purges any stale panic files and passes `-n`.
    - Cache-busting (`?v=2.2`) and `must-revalidate` headers prevent browser disk caching of old audio/engine scripts.
- **Verification**: 11/11 bridge smoke tests passed, 55/55 synthesis method tests passed, 31/31 Chrome Web Audio in-browser headless tests passed with master compressor active, and automated persistence/reroll integration test passed without panic prompts.

### Priority 7: Menu Parity, Splash Key Requirement, Load Game Modal, Pause Menu, & Store Contextual Toolbar (COMPLETED)
- **Scope**: `server/public/index.html`, `server/public/css/dungeon.css`, `server/public/js/app.js`, `server/public/js/input.js`, `client/scripts/Main.cs`
- **Accomplishments**:
  - **Splash Screen Keypress Requirement**: Any keypress (Space, Enter, letters, numbers, arrow keys) or mouse click is required to advance from the splash screen to the main menu. Added shortcuts for Guide (`[2]`/`[G]`), Credits (`[3]`/`[C]`), and Wiki (`[W]`). Guaranteed that the splash screen never auto-advances.
  - **Main Menu 1:1 Parity**: Main menu provides all options: `[1] Continue Last Played`, `[2] Load Saved Game...`, `[3] Start from Scratch (Random Hero)`, `[4] Start from Scratch (Custom Hero)`, `[5] Game Guide & Primer`, `[6] Summary & Credits`, `[7] Angband Online Wiki & Manual`.
  - **Dedicated Load Saved Game Modal (`#load-modal`)**: Built ornate modal with dynamic queries to `/api/saves`. Displays all saved adventurers with name, class/race/level/depth summary, date, file size, and interactive `Load [Enter]` and `Delete [Del/D]` actions with confirmation safeguards.
  - **In-Game Pause Menu (`#pause-modal`)**: Pressing <kbd>Esc</kbd> in free-roaming 3D world (or clicking ⚙ Menu) opens the in-game Game Menu (matching Godot `Main.cs:1822`), offering Resume Game, Save Game Now (Ctrl-S), Load Other Character..., Start Over (Random/Custom), Guide, Fullscreen (F11), and Save & Quit to Main Menu.
  - **Contextual Store & Terminal Toolbar**: When entering stores (e.g. Armoury, General Store, Weaponsmith), the terminal card dynamically updates its title (e.g. `⚔ ARMOURY`) and buttons (`Exit Store (Esc)`), strictly hiding the `⚔ Quick Start Hero (@)` birth button during active play so players never confuse a shop screen with character creation.
- **Regression Repairs & Comprehensive UX/3D Polish Milestone**:
  - **Global Sound Mute**: Universal mute toggling across all game states, menus, and views via <kbd>Ctrl+M</kbd> shortcut, pause menu toggle in Godot, and `#btn-sound-toggle` in Web UI (`AudioManager.cs`, `Main.cs`, `input.js`, `audio.js`).
  - **Shop Menus & Action Bar**: Auto-dismissing rumor `-more-` prompts when entering stores, providing explicit Buy (`p`), Sell (`s`), Examine (`i`), and Exit (`Esc`) action buttons, and enabling direct row clicking to purchase store inventory items (`terminal.js`, `hud.js`, `index.html`, `app.js`).
  - **Hero Creation Guarding**: `btn-quick-birth`, `btn-term-reroll`, and `btn-term-custom` buttons strictly hidden once a player exists (`hasPlayer`), preventing birth options from intruding on shop or in-game terminal menus.
  - **Message Log in Town**: Message feed window is available and active from game start in town (`hasPlayer || frame.phase === 'play'`).
  - **Message Log & Minimap Separation + Automated `-more-`**: Message log relocated to avoid minimap overlap; removed distracting pulsing animation; automatically clears `-more-` prompts by sending `space` to engine so space is never required during message log reading.
  - **Mouse Resizable & Moveable HUD Windows**: Both the Minimap and Message Log windows are freely draggable via their header bars and resizable via bottom-right drag handles, with real-time canvas resizing and persistent layout coordinates in `localStorage`.
  - **Dungeon Undiscovered Terrain**: Reverted unmapped tiles (`FEAT_NONE`) to authentic dark subterranean void space rather than synthesizing fake granite walls.
  - **Item Models & Textures**: Resolved pebbles, stones, rocks, shots, and bullets to `Mineral` models/fbx and procedural stone geometries instead of arrows; routed darts to `Dart` models.
  - **Monster Models**: Fixed non-humanoid FBX models (`Rat`, `Snake`, `Spider`, `Frog`, `Wasp`) by removing improper `QueueFree()` calls; added model bindings for kobolds (`Puglin.glb`) and demons/imps (`Imp.glb`).
  - **Menu Lifecycle Audit & Store Isolation**:
    - Strictly quarantined character creation options (`Quick Start`, `Reroll`, `Custom`, `Advance`) away from store menus.
    - Inside shops (`inPlay && isStore`), the toolbar presents strictly shop options: `[ 💰 Buy (p) ] [ 🏷 Sell (s) ] [ 🔍 Examine (i) ] [ 🚪 Exit (Esc) ]`.
    - Fixed store entrance detection bug by parsing 2-hex feature indices (`parseInt(f.substring(px*2, px*2+2), 16)`), enabling instant automatic store menu display upon entering shop doors in town (feats 7..14).
    - Unblocked store `-more-` auto-advance in `onFrame` so initial store rumors/messages never require manual spacebar presses.
    - On character creation/review (`phase === 'setup'`), `#store-actions-bar` is strictly hidden (`display: none`).
  - **Message Log Clean Start**:
    - Quarantined all message capture (`frame.messages` and `frame.term.rows[0]`) strictly to active gameplay (`inPlay`).
    - On transition into active play (`inPlay && !wasInPlay`), message feed starts exclusively with the welcoming greeting:
      `Welcome to the Town of Angband! Visit the General Store and Armory to equip your journey.`
    - Baseline-seeds engine ring-buffer (`prevMessages`) and `lastTermRow0` on play entry, preventing Angband's creation/history messages (`Accept character history? [y/n]`, `' . .`) from polluting the message log.
    - Added keyword filter rejecting any creation or history prompt fragments.
  - **Confirmed Default Window Coordinates & Scale**:
    - Minimap Radar: `top: 14px; left: 18px;`
    - Message Log: `top: 14px; left: 320px;`
- **Character Creation Navigation & Main Menu Escape**:
  - `Escape` keypress and `Back (Esc)` toolbar button now detect character creation beginning (`!inPlay && !isReviewScreen`) and return directly to the Main Menu overlay (`returnToMainMenu()`), cleanly disconnecting and preventing the blank screen lock.
  - Review screen `Back (Esc)` continues to step back to character creation beginning (`'s'`).
- **Message Log in Town Display & Width Constraint Fix**:
  - Corrected `#message-feed-window` CSS constraints to `width: min(580px, calc(100vw - 340px)); min-width: 260px; height: 180px; min-height: 90px;`, fixing layout collapse on standard viewports.
  - Added safe clamping in `makeWindowDraggableAndResizable` so no stored `localStorage` values can position the window offscreen or collapse it.
  - Ensured `this.messageFeedWindow` is lazily queried and forced visible with `display: flex; visibility: visible; opacity: 1` whenever `inPlay` (`frame.phase === 'play'` or `frame.player.name`).
  - Guaranteed town welcome message seeding on town entry.
  - Removed duplicate `network.sendKey('space')` from `hud.js` to eliminate racing double-space key events.
- **Automatic Shop Menu Opening & Action Bar Isolation**:
  - Updated `needsTerminal(frame)` to immediately route to the terminal when `frame.ui.overlay > 0` or whenever stepping onto a store entrance tile (feats 7..14).
  - Expanded `updateTerminalToolbar(frame)` to detect all Angband store variations (`Armoury`, `Alchemy Shop`, `Magic User's`, `Weapon Smiths`, `Your Home`, `Store Inventory`, `Home Inventory`) and mapped store names from `playerFeat`.
  - Exclusively displays `store-actions-bar` (`💰 Buy (p)`, `🏷 Sell (s)`, `🔍 Examine (i)`, `🚪 Exit (Esc)`) and hides generic advance/creation buttons.
  - Guarded auto-space flushing so spaces are NEVER auto-sent while inside a store overlay (`!isOverlay`), preventing store interactions from being unintentionally cancelled or dismissed.
- **Omni-Device Responsive Scaling, Touch Ergonomics & Mobile GPU Throttling Milestone (`device.js`, `input.js`, `terminal.js`, `dungeon3d.js`, `hud.js`, `dungeon.css`)**:
  - **Dynamic Device Profile Engine (`device.js`)**:
    - Created lightweight `DeviceProfile` tracking device tier (`desktop` $\ge 1024\text{px}$, `tablet` $600\text{px}-1023\text{px}$, `phone` $< 600\text{px}$ or short dimension $< 600\text{px}$), orientation (`is-portrait`, `is-landscape`), and touch capability (`pointer: coarse`).
    - Automatically synchronizes reactive semantic root classes on `<html>` (`device-desktop`, `device-tablet`, `device-phone`, `is-portrait`, `is-landscape`, `has-touch`).
    - Integrated safe micro-haptics (`DeviceProfile.vibrate`) delivering $10-12\text{ms}$ tactile pulses on virtual button taps.
  - **Touch & Gesture Controls (`input.js`)**:
    - **Hold-to-Repeat Movement**: Holding directional D-pad buttons for $> 300\text{ms}$ auto-repeats steps every $140\text{ms}$, matching the Three.js 3D movement tween speed for effortless long corridor transit.
    - **Viewport Swipe-to-Turn**: Horizontal swipes on the 3D viewport canvas turn the camera $90^\circ$ left/right without touching the D-pad.
    - **Context-Aware Multifunction Center Button**: Dynamically detects player surroundings and updates the center D-pad button:
      - Standing on downstairs/upstairs -> illuminates `⬇` / `⬆` to descend or ascend stairs.
      - Monster directly in front -> transforms into `⚔` attack trigger.
      - Closed/locked door directly in front -> transforms into `🚪` open door trigger.
      - Default tile -> `●` rest/wait 1 turn.
    - **Expandable Action Drawer**: Phone screens show 4 primary quick-actions (`Attack`, `Cast`, `Pack`, `Classic`) plus a `⋯ More` toggle that expands into a 3x4 action drawer grid.
  - **Terminal Auto-Containment Scaling (`terminal.js`)**:
    - Replaced hardcoded $960\text{px}$ minimum width floor (`Math.max(12, ...)`) with responsive containment scaling (`Math.min(availW / logicalWidth, availH / logicalHeight)`).
    - Preserves high-DPI crisp monospace canvas buffer while scaling smoothly onto mobile displays ($374\text{px}$ on iPhone 14) with zero horizontal overflow.
    - Touch event coordinate re-mapping accurately translates finger taps to terminal grid rows/cols on any screen scale.
  - **Mobile GPU Throttling & Battery Conservation (`dungeon3d.js`)**:
    - Automatic 5 FPS rendering throttle when classic terminal view or death screen is active, eliminating unnecessary 60 FPS 3D rendering in menus and preventing mobile thermal throttling.
    - Adaptive DPR and render distances scaled by device tier (Phone: 1.25 DPR cap, far 85; Tablet: 1.5 DPR cap, far 110; Desktop: 2.0 DPR cap, far 140).
  - **Contextual Action Button Pulses (`hud.js`)**:
    - Exposed `updateContextPulses(frame)`: pulses `#btn-quaff` with `.smart-low-hp` gold-red border when player HP drops to $\le 30\%$, and pulses `#btn-door` with `.smart-door-active` cyan glow when facing closed doors.
  - **Comprehensive Automated Multi-Profile Verification (`tools/test_responsive_profiles.js`)**:
    - Created headless Chrome CDP automated test suite executing 9 verification suites across Desktop ($1920\times 1080$), Tablet Portrait ($768\times 1024$), Phone Portrait ($390\times 844$), and Phone Landscape ($844\times 390$):
      1. Desktop Viewport: 15 full action bar buttons, drawer toggle hidden, high-DPI terminal.
      2. Tablet Viewport: `device-tablet` applied, D-pad active, terminal contained.
      3. Phone Portrait: `device-phone is-portrait`, 4-action bar + drawer toggle, $374\text{px}$ terminal (0 overflow).
      4. Action Drawer: opens 3x4 grid drawer and closes smoothly.
      5. Phone Landscape: dual-axis terminal fit (542px width, 279px height within 390px viewport).
      6. Hold-to-Repeat: verified multiple continuous movement steps during sustained touch hold.
      7. Viewport Swipe: verified $90^\circ$ camera yaw turn from canvas touch drag.
      8. Context-Aware Controls: verified stairs icon detection and emergency low HP potion pulse.
      9. GPU Throttling: verified 5 FPS power-saving throttle when terminal is open.
    - All 9 test suites passed 100%. Bridge smoke tests: 11/11 passed. C# client build: 0 warnings, 0 errors.

- **Omni-Platform D-Pad, Strafe/Turn Unification & Mobile Layout Audit & Repair Milestone (`input.js`, `mobile-overlay.js`, `app.js`, `hud.js`, `dungeon.css`, `index.html`)**:
  - **D-Pad Turn & Strafe Architecture (Photo 1 & Universal)**:
    - Overhauled virtual `#touch-controls` with a clean CSS Grid layout and dedicated `.dpad-turn-wings`:
      - `#dpad-turn-left` (`↶`) and `#dpad-turn-right` (`↷`): instant $90^\circ$ camera yaw without consuming a game turn.
      - 3x3 Semantic Movement Grid: `#dpad-up` (Forward), `#dpad-down` (Backward), `#dpad-left` (Hold-to-repeat Strafe Left via `getRelativeDirectionKey(4)`), `#dpad-right` (Hold-to-repeat Strafe Right via `getRelativeDirectionKey(6)`).
      - Diagonals: `#dpad-ul` (7 NW), `#dpad-ur` (9 NE), `#dpad-dl` (1 SW), `#dpad-dr` (3 SE).
      - Center Action: `#dpad-center` with context-sensitive state (Staircase `⬇`/`⬆`, Melee `⚔`, Door `🚪`, Rest `●`).
    - Added desktop keyboard strafing support via <kbd>Shift + ArrowLeft</kbd> and <kbd>Shift + ArrowRight</kbd>.
  - **Closable & Reopenable Minimap and Message Log with Header Banner Retention**:
    - Embedded `#btn-minimap-close` (`✕`) into the minimap header and `#btn-msg-close` (`✕ Hide`) into the message feed window header.
    - Added sleek, non-invasive toggle buttons in `#top-right-bar`: `#btn-toggle-msg-feed` (`📜 Log`) and `#btn-toggle-minimap` (`🗺 Map`), with active glowing gold indicators.
    - Preserved persistent state across turns via `window.__minimapClosed` and `window.__messageLogClosed`.
    - Retained `#top-message-banner` in the top header during active play per user feedback, with mobile tap-to-expand sliding sheet for message log scrollback.
  - **Phone Splash & Menu Bounds Repair (Photo 2)**:
    - Injected safe top clearance (`padding-top: calc(52px + var(--safe-top)) !important;`) on all full-screen overlays, completely eliminating top-bar collisions with the skull logo and title.
    - Added responsive font scaling (`clamp(18px, 5.2vw, 28px)`) with `white-space: nowrap !important;` to `.splash-title`, ensuring `ANGBAND 3D` fits inside the card without wrapping or overflowing.
    - Added `overflow-wrap: break-word` and line clamping to subtitles and engine tags; capped splash card padding to 16px.
  - **Phone Hero Review Card Tactile & Logic Repair (Photo 3)**:
    - Fixed frozen action buttons (`Accept & Play`, `Back`):
      - Delegated actions directly to toolbar handlers (`termAdvanceBtn.click()` for Enter, `termEscapeBtn.click()` for `'s'` restart).
      - Resolved 60Hz DOM wiping by caching `container._lastHeroSig = heroSig`.
      - Enhanced `wireFastButton` with touch tracking and 10px drag threshold, allowing vertical scrolling of the character sheet without accidentally firing buttons or losing taps.
      - Fixed stat regex parsing (`(?:\\s*:\\s*|\\s+)`) to parse Angband's whitespace-aligned stat rows (`STR    17  +2`), eliminating `--` fallbacks.
      - Applied bottom safe clearance (`padding-bottom: max(32px, calc(16px + var(--safe-bottom))) !important; z-index: 50;`) to `.m-hero-actions-bar`, keeping buttons above mobile navigation bars.
  - **Phone In-Game Overlap & Stat Strip Restoration (Photo 4)**:
    - Fixed circular minimap overlap: added `left: auto !important; right: max(6px, var(--safe-right))` in mobile media query, preventing LTR desktop CSS (`left: 18px`) from docking the minimap on top of `#char-panel`.
    - Restored character stats strip (`#stats-strip`) on mobile into a sleek 4-column micro-grid displaying STR, INT, WIS, DEX, CON, AC, and Gold inside `#char-panel`.
  - **Cache Invalidation & Asset Versioning**:
    - Configured server HTTP headers to `Cache-Control: no-cache, no-store, must-revalidate` for `.html`, `.js`, and `.css`.
    - Bumped asset query strings to `?v=4.0` in `index.html`.
  - **Automated Verification & Cloud Run Live Deployment**:
    - Extended `tools/test_responsive_profiles.js` to 10 automated test suites. All 10 suites passing 100%.
    - Verified engine bridge (11/11 smoke tests) and C# client (0 warnings, 0 errors).
    - Deployed to Google Cloud Run (`us-central1`):
      - `angband3d-cloud`: Revision `angband3d-cloud-00062-2zn` (https://angband3d-cloud-564958309282.us-central1.run.app)
      - `angband3d-web`: Revision `angband3d-web-00020-c4m` (https://angband3d-web-564958309282.us-central1.run.app)
      - Verified HTTP 200 and zero-caching `Cache-Control: no-cache, no-store, must-revalidate` headers.

---

## Next Backlog & Future Milestones

1. **Step 12: Ambient Subterranean Soundscapes** (`AudioManager.cs`)
   - Layered depth-based looping ambient audio (dripping water in crypts, cavern wind in catacombs, subterranean rumble in magma depths).
2. **Step 14: Dynamic Door Kinematics & Smashed Debris VFX** (`DungeonWorld.cs`)
   - Animated smooth swing open/close interpolation and splintered wood particle bursts on door smashing.
3. **Packaging & Distribution Verification** (`package.ps1`)
   - Standalone release export validation across Windows targets.


## Secondary Polish Queue (Wave 2 Backlog)

- **Step 13**: Minimap Fog-of-War Smoothing & Golden Discovery Pulses (`Overlay.cs`).
- **Step 12**: Procedural Atmospheric Subterranean Soundscape (`AudioManager.cs`).
- **Step 14**: Dynamic Door Kinematics & Destruction Debris (`DungeonWorld.cs`).

---

## Skyrim-Style Graphical & Model Quality Scaling Track

1. **PBR Surface Realism & Parallax Mapping**:
   - 2K/4K PBR material sets (Albedo, Normal, Roughness, AO, Height/Displacement) for chiseled granite stone walls, damp flagstones, and cavern walls.
   - Parallax Occlusion Mapping (POM) in `StandardMaterial3D` for deep mortar crevices and stone protrusions.
2. **Forward+ Lighting & Atmospheric Post-Processing**:
   - Volumetric Fog with light-shaft scattering for torches and wall sconces.
   - Signed Distance Field Global Illumination (SDFGI) for secondary light bounce.
   - ACES Tonemapping and Nordic/dark-fantasy color grading LUT (cool slate shadows, warm incandescent fire).
   - Perlin-noise torch light jitter and flicker dynamics.
3. **Rigged 3D Assets & Skeletal Animations**:
   - Rigged first-person arm/hand pack with dedicated bone animations (walk, swing, block, shoot, cast).
   - High-fidelity dark-fantasy monster meshes with skeletal movement and combat animations.

---

## Quick Reference Commands

- **Run Smoke Tests**: `python tools/smoke_test.py`
- **Build Client**: `dotnet build client/angband3d.csproj`
- **Play Game**: `.\play.cmd` (or `.\play.ps1 -Character <name> -Random`)
- **Engine Rebuild**:
  ```powershell
  $env:MSYSTEM='MINGW64'; $env:CHERE_INVOKING='1'
  & C:\msys64\usr\bin\bash.exe -lc "cd /c/Dev/angband3d/engine && cmake --build build"
  ```
- **Automated Responsive Test Suite**: `node tools/test_responsive_profiles.js` (12/12 suites passing)

---

### Priority 8: PWA Standalone App, PC D-Pad Toggle, Shop Item Parsing & Omni-Platform Polish (COMPLETED)
- **Scope**: `server/public/manifest.json`, `server/public/sw.js`, `server/public/index.html`, `server/public/js/app.js`, `server/public/css/dungeon.css`, `server/public/js/input.js`
- **Accomplishments**:
  - **PWA Web App Manifest & Service Worker (`manifest.json`, `sw.js`, `index.html`, `app.js`)**:
    - Created `manifest.json` with `display: standalone`, `theme_color: #080b12`, category tags, and responsive app icons (`thunderbear_logo.png`).
    - Added service worker `sw.js` with static shell caching, automatic skip-waiting/claim lifecycle, and transparent pass-through for WebSockets (`/ws`), save file APIs (`/api/`), and health probes. Bumped cache name to `angband3d-v5.2`.
    - Linked manifest and Apple touch icons in `index.html` and wired service worker registration on window load.
  - **PC Desktop D-Pad Toggle & Default Clean 3D Viewport (`app.js`, `index.html`, `dungeon.css`)**:
    - Addressed user feedback regarding PC D-pad clutter: on desktop viewports (`DeviceProfile.getTier() === 'desktop'`), the on-screen D-pad defaults to hidden, providing an unobstructed full-screen 3D world for keyboard players (WASD / Arrows / Numpad).
    - Added dedicated `[🕹 D-Pad]` toggle button in `#top-right-bar` next to `[📜 Log]` and `[🗺 Map]`, allowing PC players to display the complete D-pad (with Turn L/R wings, Strafe, and diagonals) on demand.
    - Added glowing active indicator state (`btn-toggle-dpad.active`) and quarantined the toggle button from mobile phones where virtual touch controls are permanently required. Cleaned up hotkey labels.
  - **Shop Choices Strip, Command Binding & Exploration Dock Sanitization (`app.js`, `index.html`)**:
    - Fixed store examine key binding: changed `btn-store-examine` from sending `'i'` (which opened the player's inventory pack) to `'l'` (which initiates Angband's native store item inspection prompt `Examine which item?`), updating the button label to `🔍 Examine (l)`.
    - Enabled `btn-store-advance` during purchase and sell confirmation prompts (`[ESC, any other key to accept]`) by expanding `isStoreMore` matching, allowing mobile and mouse users to confirm store transactions with a single tap.
    - Resolved shop item clutter: Angband's terminal command strings (`l) Examine`, `p) Buy`, `s) Sell`, `ESC) Exit`) are detected and filtered from `choicesGrid` so the on-screen choice chips strictly display purchasable/examinable store inventory items.
    - Completely hid `#terminal-touch-controls` (dungeon exploration movement dock) while inside stores, preventing buttons like `Cast` or `Open` from obscuring shop terminal rows.
    - Preserved 180° camera flip on store exit so player never accidentally steps right back into the store.
  - **Cross-Platform Fullscreen Robustness (`input.js`)**:
    - Upgraded `toggleFullscreen()` with vendor-prefixed methods (`webkitRequestFullscreen`, `mozRequestFullScreen`, `msRequestFullscreen`) and safe try/catch error handling, ensuring full compatibility across iOS Safari / WebKit and desktop browsers without uncaught runtime exceptions.
  - **Staircase Action Button Strict Visibility Invariant (`dungeon.css`)**:
    - Enforced `#action-bar.drawer-open #btn-stair:not(.stair-active), #action-bar #btn-stair:not(.stair-active) { display: none !important; }`, fixing the bug where opening the mobile action drawer displayed `⬇ Enter Dungeon >` even when the player was not standing on stairs.
  - **Mobile Portrait Header & Footer Overlap / Truncation Resolution (`dungeon.css`)**:
    - Increased `.top-message-banner` `padding-right` from 180px to `calc(220px + var(--safe-right)) !important`, ensuring live combat notices never run under or collide with the 5 top-right utility buttons (`[📜] [🗺] [🔊] [⛶] [⚙]`).
    - Added horizontal scroll without visible scrollbars (`overflow-x: auto; white-space: nowrap; scrollbar-width: none`) to `#hud-footer`, eliminating status pill truncation on narrow phone screens while keeping all telemetry accessible.
- **Verification**:
  - Engine smoke tests: **11/11 passed**.
  - Godot C# client build: **0 warnings, 0 errors**.
  - Automated responsive test suite (`tools/test_responsive_profiles.js`): **12/12 suites passing 100%** on Chrome CDP across Desktop (1920x1080), Tablet (768x1024 / 1024x768), Phone Portrait (390x844), and Phone Landscape (844x390).

---

### Priority 9: PC D-Pad Realignment & Closable Window Restorations + Mobile Classic ASCII Menu Adaptive Scaling Engine (COMPLETED)
- **Scope**: `server/public/index.html`, `server/public/css/dungeon.css`, `server/public/js/app.js`, `server/public/js/terminal.js`, `server/public/js/hud.js`, `server/public/sw.js`
- **Accomplishments**:
  1. **PC Web Client D-Pad Realignment & Default Visibility**:
     - Corrected desktop D-pad visibility default: `window.__dpadVisible !== undefined ? window.__dpadVisible : true` so on-screen controller is active by default across both PC desktop and mobile.
     - Kept top-right bar `#btn-toggle-dpad` permanently active and synchronized with active state so players can toggle the on-screen D-pad at will.
     - Resized `#touch-controls` on desktop: expanded width to `186px`, offset to `bottom: 92px; right: 28px;` with dark glass border and backdrop blur.
     - Guaranteed zero right-column clipping: turning wings (`↺ Turn L`, `↻ Turn R`), strafe buttons (`⇦ STRAFE`, `⇨ STRAFE`), and diagonals (`↗ 9`, `↘ 3`) all render with ample margin before the viewport edge.
  2. **Minimap & Message Log Closable Options Restored**:
     - Identified root cause of unclosable windows: header elements had exceeded container widths, causing `overflow: hidden` on `#message-feed-window` and `#minimap-container` to push close buttons off-screen.
     - Expanded `#message-feed-window` min-width to `360px` and styled `#btn-msg-close` as a prominent red button (`rgba(239, 68, 68, 0.25)`, border `rgba(255, 123, 114, 0.5)`).
     - Added prominent red close button `#btn-map-close-bar` (`✕ Hide`) directly to `#minimap-controls-bar` next to `[● Reset]`, and wired it in `app.js`.
     - In `.minimap-header`, pinned `#btn-minimap-close` to the right with `flex-shrink: 0`, and added event target guard in `hud.js` so clicking close never triggers `cycleMinimapSize(1)`.
     - Truncated `.minimap-hint` text gracefully with `max-width: 105px; text-overflow: ellipsis; white-space: nowrap;` so it never crowds out the close button.
     - Synchronized top-bar toggle indicators (`[📜 Log]`, `[🗺 Map]`, `[🕹 D-Pad]`) with active glowing gold borders when windows are open.
  3. **Mobile Classic Menu & Terminal Adaptive Scaling Engine**:
     - Added intelligent context detection (`detectMode(termData)` in `terminal.js`) recognizing `store`, `item_prompt`, `birth`, and `classic_play`.
     - Implemented mode-aware scaling in `resize()`: on mobile portrait viewports (`window.innerWidth <= 768`), stores, birth screens, and inventory/equipment prompts scale against the active 54-column content width (756px) rather than the empty 80-column span, producing crisp 14–19px logical font height (`charWidth >= 10px`).
     - Automated left column alignment: on menu render, `#terminal-viewport` immediately scrolls to `scrollLeft = 0` so item letters (`a)`, `b)`, `c)`) and descriptions are flush and instantly legible without horizontal scrolling.
     - Implemented player `@` tracking in `classic_play`: when zoomed in (>1.0x), the viewport automatically centers on the player character as they explore the dungeon.
     - Viewport touch support: smooth momentum scrolling (`-webkit-overflow-scrolling: touch`), pinch-to-zoom (0.6x to 2.5x), and zoom toolbar buttons (`🔍 -`, `Reset %`, `🔍 +`).
     - Click coordinate accuracy: touch events compute pixel-accurate character cell hit tests via `getBoundingClientRect()` regardless of zoom or scroll offsets.
     - Docked on-screen `#terminal-touch-controls` below classic menus for 1-thumb D-pad cursor movement, selection (`Enter`), cancellation (`Esc`), and view switching (`Tab`).
  4. **PWA & Cache Synchronization**:
     - Bumped Service Worker cache version in `server/public/sw.js` to `angband3d-v5.4`.
- **Verification**:
  - Engine smoke tests: **11/11 passed** (`python tools/smoke_test.py`).
  - Godot C# client build: **0 warnings, 0 errors** (`dotnet build client/angband3d.csproj`).
  - Automated responsive test suite: **12/12 suites passed 100%** (`node tools/test_responsive_profiles.js`).
  - Dedicated CDP inspection (`scratch/test_desktop_and_menu_scale.js`):
    - Desktop D-Pad: `display: flex`, width: 186px, height: 226px, `clippedRight: false`, `clippedBottom: false`.
    - Minimap close options: header close `✕` hides minimap, bar close `✕ Hide` hides minimap, top-right `[🗺 Map]` restores and hides.
    - Message log close options: header close `✕ Hide` hides message log, top-right `[📜 Log]` restores and hides.
    - Mobile menu adaptive scaling: accurately identifies `storeMode: 'store'`, scales canvas to 616px with large 19px font, and aligns `scrollLeft: 0`.
    - Visual inspection of captured screenshots: `desktop_dpad_and_close_buttons.png` and `mobile_store_adaptive_scale.png`.

---

### Priority 10: Mobile Custom Character Creation, Invert Drag Look Toggle, Full-Width Message Banner, and Mobile Minimap Zoom (COMPLETED)
- **Scope**: `server/public/index.html`, `server/public/css/dungeon.css`, `server/public/js/app.js`, `server/public/js/input.js`, `server/public/js/terminal.js`, `server/public/js/hud.js`, `server/public/sw.js`, `tools/test_responsive_profiles.js`
- **Accomplishments**:
  1. **Mobile Custom Character Creation Restoration & Classic Zoom**:
     - Permanently retired artificial `mobileHeroCard` takeover that stalled progression on a static "Hero of Angband" placeholder with no controls.
     - Preserved the authentic classic 80x24 terminal canvas visible across all mobile and tablet viewports during birth and review, dynamically scaling content across 48 columns for large, crisp 16–20px typography.
     - Implemented `#birth-touch-controls`: dynamically generates touch option buttons `[a]` through `[m]` based on available options (sex, race, class, roller, point-based stats), action shortcuts `[🎲 Random (@)]`, `[⏎ Enter]`, `[⎋ Esc]`, `[🎲 Reroll (R)]`, `[⚔ Accept (y)]`, and an on-screen character name input bar (`#birth-name-input` + `#btn-birth-name-submit`).
  2. **Invert on Drag View Toggle**:
     - Added easily accessible `[🔄 Invert]` toggle button directly in `#top-right-bar` and `#btn-pause-invert` in the Pause/Settings menu (`#pause-modal`).
     - Initialized from and persisted to `localStorage.getItem('angband3d_invert_drag')`.
     - Inverts mouse and touch drag look yaw/pitch sensitivity multipliers (`input.js`), plus swipe turning.
  3. **Full-Width Mobile Message Banner Placement**:
     - Pinned `.top-message-banner` on mobile portrait and landscape directly UNDER the top utility toolbar at `top: calc(44px + var(--safe-top)) !important;` spanning full width `left: max(8px, var(--safe-left))` to `right: max(8px, var(--safe-right))` with dark glass styling and golden border.
     - Relocated Character Vitals (`#char-panel`) and Minimap Radar (`#minimap-container`) to `top: calc(80px + var(--safe-top))` in portrait and `top: calc(64px + var(--safe-top))` in landscape, completely eliminating overlapping between the top toolbar, live messages, and character/minimap widgets.
  4. **Mobile Minimap Quick-Zoom Buttons & Pinch-to-Zoom**:
     - Added floating `.mobile-map-zoom-group` with circular touch buttons `[+]` and `[−]` attached to the minimap radar.
     - Updated `#minimap-container` on mobile with `overflow: visible !important`, ensuring floating zoom buttons are cleanly rendered without container clipping.
     - Implemented 2-finger touch pinch-to-zoom on `#minimap-canvas` (`hud.js`) and wired zoom-in/zoom-out step handlers (`setMinimapZoom`).
  5. **PWA & Cache Synchronization**:
     - Bumped Service Worker cache version in `server/public/sw.js` to `angband3d-v5.5` and bumped asset version parameters in `index.html`.
- **Verification**:
  - Engine smoke tests: **11/11 passed** (`python tools/smoke_test.py`).
  - Godot C# client build: **0 warnings, 0 errors** (`dotnet build client/angband3d.csproj`).
  - Automated responsive test suite: **12/12 suites passed 100%** (`node tools/test_responsive_profiles.js`).
  - Dedicated mobile CDP verification (`scratch/test_mobile_custom_and_ux.js`):
    - Birth state on mobile: terminal canvas visible (350x180), adaptive 48-col scale, 13 dynamic touch option buttons `[a]`-`[m]`, action keys active.
    - Invert drag look: toggle cycles `false` -> `true` -> `false` with live UI feedback.
    - Minimap zoom: zoom in step `1.0 -> 1.25`, zoom out step `1.25 -> 1.0`.
    - Message banner: positioned at `top: 44px` under top toolbar (bottom: 40px), width 374px, zero clipping or collision.
    - Visual inspection of captured screenshots: `mobile_custom_character_creation.png` and `mobile_hud_and_minimap_zoom.png`.

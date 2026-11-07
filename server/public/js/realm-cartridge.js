/**
 * realm-cartridge.js — Universal Dungeon Cartridge Schema v2 & Declarative 5-Realm Engine
 *
 * Provides the single declarative source of truth for:
 *   1. Angband 4.2.6 (`angband`) — Forged Blackened Iron & Morgul Gold
 *   2. Sil-Q 1.5+ (`silq`) — First-Age Starlight Silver & Beleriand Slate
 *   3. FrogComposBand 7.1 (`frogcomposband`) — Eldritch Pattern Amethyst & Chaos Gold
 *   4. Hengband 3.0.2 (`hengband`) — Lacquered Vermilion-Obsidian & Shakudo Brass
 *   5. NetHack 3.6.7 (`nethack`) — Subterranean Verdigris Bronze & Gehennom Emerald
 *   + Universal Cartridge Schema v2 loader for any external roguelike or original ThunderBear realm.
 *
 * Architecture:
 *   - Declarative Menu Grammar Taxonomy (`MENU_GRAMMAR_ARCHETYPES`) covering all 7 canonical
 *     roguelike interaction models (Select-Noun-Then-Verb, Verb-First-Prompt, Unified-Command-Popup,
 *     Contextual-Use-Verb, Extended-Ritual-Hash, Paged-ASCII-Table, Spatial-Radial-Marking-Menu).
 *   - Bespoke Realm Material Language (`themeTokens` + `applyThemeTokens`).
 *   - Hero Panoply Equipment Slot Definitions (`getEquipmentSlots`).
 *   - Stat-Delta Comparison Engine (`compareWithEquipped`) for instant upgrade/downgrade badges.
 *   - Beatitude BUC Parser (`parseBeatitudeBUC`) and Diagonal Doorway Rule (`canMoveDiagonally`).
 *
 * Contract: Pure UMD module, zero external runtime dependencies, 100% IP-clean (IP-CLEAN-01).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RealmCartridge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CARTRIDGE_SCHEMA_VERSION = '2.0.0';
    const VANILLA_LETTERS = 'abcdefgimnopqrstuvwxyz';
    const NETHACK_SLOTS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$';
    const SUPPORTED_TRANSPORTS = Object.freeze([
        'pty-ansi-80x24',
        'pty-ansi-bigmap',
        'json-rpc-turn',
        'wasm-worker',
        'godot-ipc'
    ]);

    /**
     * Universal Roguelike Menu Grammar Taxonomy — covers the 7 canonical interaction models
     * across classic and modern roguelikes so any plugged-in cartridge adapts automatically.
     */
    const MENU_GRAMMAR_ARCHETYPES = Object.freeze({
        'select-noun-then-verb': {
            id: 'select-noun-then-verb',
            description: 'Slot selection list where verbs dispatch as atomic verb+slot sequences',
            supportsCategoryFilter: true,
            supportsQuickBelt: true
        },
        'verb-first-prompt': {
            id: 'verb-first-prompt',
            description: 'Verb key opens an engine item-filter prompt (e.g. Quaff which potion?) followed by slot key',
            supportsCategoryFilter: true,
            supportsQuickBelt: true
        },
        'unified-command-popup': {
            id: 'unified-command-popup',
            description: 'Selecting a slot opens an engine-side or client-side verb action submenu for that item',
            supportsCategoryFilter: true,
            supportsQuickBelt: true
        },
        'contextual-use-verb': {
            id: 'contextual-use-verb',
            description: 'Single unified Use verb (u) dispatches contextually by item type alongside skill/craft trees',
            supportsCategoryFilter: true,
            supportsQuickBelt: true
        },
        'extended-ritual-hash': {
            id: 'extended-ritual-hash',
            description: 'Extended #command\\n ritual prompts paired with 52-slot BUC beatitude inventory',
            supportsCategoryFilter: true,
            supportsQuickBelt: true
        },
        'paged-ascii-table': {
            id: 'paged-ascii-table',
            description: 'Multi-page store, recall encyclopedia, or building service table with Space/Page navigation',
            supportsCategoryFilter: false,
            supportsQuickBelt: false
        },
        'spatial-radial-pie': {
            id: 'spatial-radial-pie',
            description: '8-sector angular marking menu for 3D tile props, directional aiming, and gamepad/touch play',
            supportsCategoryFilter: false,
            supportsQuickBelt: true
        }
    });

    const DOORWAY_FEAT_REGEX = /\b(door|doorway|open_door|broken_door|closed_door|curtain|archway)\b/i;

    function canTraverseDoorwayDiagonally(fromCell, toCell, capabilities) {
        const caps = capabilities || {};
        if (!caps.diagonalDoorwayBlocked) return true;
        const f = String((fromCell && (fromCell.feat || fromCell.type || fromCell)) || '');
        const t = String((toCell && (toCell.feat || toCell.type || toCell)) || '');
        if (DOORWAY_FEAT_REGEX.test(f) || DOORWAY_FEAT_REGEX.test(t)) {
            return false;
        }
        return true;
    }

    const DEFAULT_MOVEMENT = Object.freeze({
        cardinalKeys: Object.freeze({ N: 'k', S: 'j', W: 'h', E: 'l', up: '<', down: '>' }),
        diagonalKeys: Object.freeze({ NW: 'y', NE: 'u', SW: 'b', SE: 'n' }),
        numpadKeys: Object.freeze({ N: '8', S: '2', W: '4', E: '6', NW: '7', NE: '9', SW: '1', SE: '3', rest: '5' }),
        runPrefix: '.',
        restKey: 'R',
        canTraverseDoorwayDiagonally: canTraverseDoorwayDiagonally
    });

    const STANDARD_EQUIPMENT_SLOTS = Object.freeze([
        { id: 'mainhand', label: '⚔️ Mainhand', slotKey: 'a', categories: ['weapon'] },
        { id: 'ranged',   label: '🏹 Launcher', slotKey: 'b', categories: ['ranged'] },
        { id: 'ring_r',   label: '💍 Right Ring', slotKey: 'c', categories: ['jewelry'] },
        { id: 'ring_l',   label: '💍 Left Ring', slotKey: 'd', categories: ['jewelry'] },
        { id: 'amulet',   label: '📿 Amulet', slotKey: 'e', categories: ['jewelry'] },
        { id: 'light',    label: '🕯️ Light', slotKey: 'f', categories: ['light'] },
        { id: 'body',     label: '🛡️ Body Armor', slotKey: 'g', categories: ['armor'] },
        { id: 'cloak',    label: '🧥 Cloak', slotKey: 'h', categories: ['armor'] },
        { id: 'shield',   label: '🛡️ Offhand / Shield', slotKey: 'i', categories: ['armor', 'weapon'] },
        { id: 'helm',     label: '👑 Helm / Crown', slotKey: 'j', categories: ['armor'] },
        { id: 'gloves',   label: '🧤 Gloves', slotKey: 'k', categories: ['armor'] },
        { id: 'boots',    label: '🥾 Boots', slotKey: 'l', categories: ['armor'] }
    ]);

    const NETHACK_EQUIPMENT_SLOTS = Object.freeze([
        { id: 'mainhand',  label: '⚔️ Weapon in Hand', slotKey: 'a', categories: ['weapon'] },
        { id: 'offhand',   label: '🛡️ Offhand / Shield', slotKey: 'b', categories: ['armor', 'weapon'] },
        { id: 'quiver',    label: '🏹 Quivered Ammo', slotKey: 'c', categories: ['ranged'] },
        { id: 'body',      label: '🛡️ Suit of Armor', slotKey: 'd', categories: ['armor'] },
        { id: 'shirt',     label: '👕 Shirt / Tunic', slotKey: 'e', categories: ['armor'] },
        { id: 'cloak',     label: '🧥 Cloak / Robe', slotKey: 'f', categories: ['armor'] },
        { id: 'helm',      label: '👑 Helm', slotKey: 'g', categories: ['armor'] },
        { id: 'gloves',    label: '🧤 Gloves', slotKey: 'h', categories: ['armor'] },
        { id: 'boots',     label: '🥾 Boots', slotKey: 'i', categories: ['armor'] },
        { id: 'ring_r',    label: '💍 Right Ring', slotKey: 'j', categories: ['jewelry'] },
        { id: 'ring_l',    label: '💍 Left Ring', slotKey: 'k', categories: ['jewelry'] },
        { id: 'amulet',    label: '📿 Amulet', slotKey: 'l', categories: ['jewelry'] },
        { id: 'blindfold', label: '🕶️ Eyewear / Lens', slotKey: 'm', categories: ['jewelry', 'misc'] },
        { id: 'light',     label: '🕯️ Lit Lamp / Torch', slotKey: 'n', categories: ['light'] }
    ]);

    const CARTRIDGES = {
        angband: {
            id: 'angband',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'Angband 4.2.6',
            tagline: 'The Vaults of Thangorodrim',
            menuGrammar: 'select-noun-then-verb',
            heraldry: {
                id: 'angband',
                crestTitle: 'IRON CROWN OF MORGOTH',
                subtitle: 'Vaults of Thangorodrim',
                accent: '#d4af37',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 18h18M4 15l2-9 4 5 2-7 2 7 4-5 2 9H4z"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#141210',
                panelGradient: 'linear-gradient(180deg, rgba(28, 22, 16, 0.96) 0%, rgba(15, 12, 9, 0.98) 100%)',
                borderAccent: 'rgba(212, 175, 55, 0.52)',
                crestColor: '#e6c35c',
                glowAccent: 'rgba(212, 175, 55, 0.22)'
            },
            equipmentSlots: STANDARD_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-w',
                maxInventoryVisible: 24,
                hasQuiver: true,
                beatitudeBUC: false,
                diagonalDoorwayBlocked: false,
                extendedHashCommands: false,
                nutritionStates: ['Starving', 'Weak', 'Hungry', 'Fed', 'Full', 'Gorged'],
                encumbranceStates: ['Unencumbered', 'Burdened', 'Overweight'],
                multiBranchGraph: false,
                hasTown: true,
                hasShops: true,
                statCount: 6,
                invenMode: 'select',
                hasPopupCommandMenu: false,
                isBilingual: false
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield' },
                wear: { id: 'wear', key: 'w', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 't', label: '🔓 Take Off' },
                puton: { id: 'puton', key: 'w', label: '💍 Put On' },
                remove: { id: 'remove', key: 't', label: '💍 Remove' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'E', label: '🍞 Eat' },
                aim: { id: 'aim', key: 'a', label: '🪄 Aim Wand' },
                zap: { id: 'zap', key: 'z', label: '⚡ Zap Rod' },
                use_staff: { id: 'use_staff', key: 'u', label: '🪄 Use Staff' },
                activate: { id: 'activate', key: 'A', label: '✨ Activate' },
                apply: { id: 'apply', key: 'u', label: '🔧 Use' },
                browse: { id: 'browse', key: 'b', label: '📖 Browse' },
                cast: { id: 'cast', key: 'm', label: '✨ Cast' },
                study: { id: 'study', key: 'G', label: '📘 Study' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 'v', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm' },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' }
            },
            extendedCommands: [],
            biomeBranches: {
                town: { id: 'town', name: 'Town of Angband', minDepth: 0, maxDepth: 0, wallTint: 0x6e737b, floorTint: 0x484d56, fogColor: 0x2d3a50, ambientHex: 0x808aa8, torchHex: 0xffdc99 },
                upper_halls: { id: 'upper_halls', name: 'Upper Granite Halls', minDepth: 1, maxDepth: 25, wallTint: 0x5c6472, floorTint: 0x363c48, fogColor: 0x161b24, ambientHex: 0x5a657a, torchHex: 0xffd280 },
                deep_vaults: { id: 'deep_vaults', name: 'Obsidian Vaults', minDepth: 26, maxDepth: 65, wallTint: 0x46485a, floorTint: 0x2a2c38, fogColor: 0x12141f, ambientHex: 0x4b5068, torchHex: 0xffbd66 },
                thangorodrim: { id: 'thangorodrim', name: 'Pits of Morgoth', minDepth: 66, maxDepth: 127, wallTint: 0x4d3438, floorTint: 0x2b1d20, fogColor: 0x180e12, ambientHex: 0x644048, torchHex: 0xff9e52 }
            },
            interactiveFeatures: {
                door: [{ id: 'open', label: '🚪 Open Door', cmd: 'o' }, { id: 'close', label: '🔒 Close Door', cmd: 'c' }, { id: 'spike', label: '🔩 Jam Door', cmd: 'j' }],
                stairs: [{ id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' }, { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }],
                chest: [{ id: 'open', label: '🗝️ Open Chest', cmd: 'o' }, { id: 'disarm', label: '⚙️ Disarm Chest', cmd: 'D' }]
            },
            audioAcoustics: { reverbDecay: 2.4, lowpassHz: 2400, wetness: 0.28, mood: 'cathedral-stone' },
            chroniclePersona: {
                speaker: 'Loremaster of Minas Tirith',
                style: 'High-annals chronicler recording the descent into the iron fortress.'
            }
        },

        silq: {
            id: 'silq',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'Sil-Q 1.5',
            tagline: 'The Lay of Leithian & The Silmarils',
            menuGrammar: 'contextual-use-verb',
            heraldry: {
                id: 'silq',
                crestTitle: 'LAY OF LEITHIAN & SILMARIL',
                subtitle: 'Halls of Menegroth & Angband',
                accent: '#a8d5e5',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 19 9 12 22 5 9 12 2"/><path d="M5 9h14M12 2v20"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#11161d',
                panelGradient: 'linear-gradient(180deg, rgba(20, 28, 38, 0.96) 0%, rgba(12, 17, 24, 0.98) 100%)',
                borderAccent: 'rgba(168, 213, 229, 0.48)',
                crestColor: '#b8e2f2',
                glowAccent: 'rgba(168, 213, 229, 0.20)'
            },
            equipmentSlots: STANDARD_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-w',
                maxInventoryVisible: 24,
                hasQuiver: false,
                beatitudeBUC: false,
                diagonalDoorwayBlocked: false,
                extendedHashCommands: false,
                nutritionStates: ['Starving', 'Weak', 'Hungry', 'Fed', 'Full'],
                encumbranceStates: ['Unencumbered', 'Burdened'],
                multiBranchGraph: false,
                hasTown: false,
                hasShops: false,
                statCount: 4,
                invenMode: 'command',
                hasPopupCommandMenu: false,
                isBilingual: false,
                features: { smithing: true, songs: true, abilityTree: true }
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT, { restKey: 'z' }),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield / Wear' },
                wear: { id: 'wear', key: 'w', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 'r', label: '🔓 Remove' },
                puton: { id: 'puton', key: 'w', label: '💍 Put On' },
                remove: { id: 'remove', key: 'r', label: '💍 Remove' },
                use: { id: 'use', key: 'u', label: '✨ Use Item' },
                quaff: { id: 'quaff', key: 'u', label: '🧪 Quaff' },
                read: { id: 'read', key: 'u', label: '📜 Read' },
                eat: { id: 'eat', key: 'u', label: '🍞 Eat' },
                aim: { id: 'aim', key: 'u', label: '🪄 Use Staff' },
                zap: { id: 'zap', key: 'u', label: '⚡ Sound Horn' },
                use_staff: { id: 'use_staff', key: 'u', label: '🪄 Channel Staff' },
                activate: { id: 'activate', key: 'u', label: '✨ Use' },
                apply: { id: 'apply', key: 'u', label: '🔨 Craft / Use' },
                sing: { id: 'sing', key: 's', label: '🎵 Sing' },
                abilities: { id: 'abilities', key: 't', label: '🌟 Abilities' },
                forge: { id: 'forge', key: '0', label: '🔨 Forge' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 'v', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'x', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm' },
                search: { id: 'search', key: 's', label: '👁️ Perception' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' }
            },
            extendedCommands: [],
            biomeBranches: {
                gates: { id: 'gates', name: 'Gates of Angband', minDepth: 1, maxDepth: 6, wallTint: 0x627382, floorTint: 0x394552, fogColor: 0x16202a, ambientHex: 0x6c8299, torchHex: 0xffe0a3 },
                delvings: { id: 'delvings', name: 'Echoing Delvings', minDepth: 7, maxDepth: 14, wallTint: 0x506275, floorTint: 0x2d3845, fogColor: 0x111923, ambientHex: 0x58708c, torchHex: 0xa8d5e5 },
                throne: { id: 'throne', name: 'Throne Hall of Morgoth', minDepth: 15, maxDepth: 25, wallTint: 0x3b4859, floorTint: 0x222933, fogColor: 0x0c1118, ambientHex: 0x4a5d75, torchHex: 0xffb366 }
            },
            interactiveFeatures: {
                forge: [{ id: 'forge', label: '🔨 Work Noldorin Anvil', cmd: '0' }],
                door: [{ id: 'open', label: '🚪 Open Door', cmd: 'o' }, { id: 'close', label: '🔒 Close Door', cmd: 'c' }],
                stairs: [{ id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' }, { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }]
            },
            audioAcoustics: { reverbDecay: 3.1, lowpassHz: 2900, wetness: 0.35, mood: 'elven-echo' },
            chroniclePersona: {
                speaker: 'Minstrel of Doriath',
                style: 'First-Age Noldorin lay poet singing of stealth, song, and the Silmarils.'
            }
        },

        frogcomposband: {
            id: 'frogcomposband',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'FrogComposBand',
            tagline: 'The Courts of Chaos & Amber',
            menuGrammar: 'unified-command-popup',
            heraldry: {
                id: 'frogcomposband',
                crestTitle: 'COURTS OF CHAOS & AMBER',
                subtitle: 'Pattern of Amber & Logrus',
                accent: '#b47ede',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#16111f',
                panelGradient: 'linear-gradient(180deg, rgba(30, 21, 43, 0.96) 0%, rgba(16, 11, 24, 0.98) 100%)',
                borderAccent: 'rgba(180, 126, 222, 0.50)',
                crestColor: '#cfa3f0',
                glowAccent: 'rgba(180, 126, 222, 0.22)'
            },
            equipmentSlots: STANDARD_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-w',
                maxInventoryVisible: 24,
                hasQuiver: false,
                beatitudeBUC: false,
                diagonalDoorwayBlocked: false,
                extendedHashCommands: false,
                nutritionStates: ['Starving', 'Weak', 'Hungry', 'Full', 'Gorged'],
                encumbranceStates: ['Unencumbered', 'Burdened', 'Overweight'],
                multiBranchGraph: true,
                hasTown: true,
                hasShops: true,
                statCount: 6,
                invenMode: 'command',
                hasPopupCommandMenu: true,
                isBilingual: false,
                features: { wilderness: true, unifiedGearUi: true, powers: true, quests: true }
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield' },
                wear: { id: 'wear', key: 'w', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 't', label: '🔓 Take Off' },
                puton: { id: 'puton', key: 'w', label: '💍 Put On' },
                remove: { id: 'remove', key: 't', label: '💍 Remove' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'E', label: '🍞 Eat' },
                aim: { id: 'aim', key: 'a', label: '🪄 Use / Aim' },
                zap: { id: 'zap', key: 'z', label: '⚡ Zap Rod' },
                use_staff: { id: 'use_staff', key: 'u', label: '🪄 Use Staff' },
                activate: { id: 'activate', key: 'A', label: '✨ Activate' },
                apply: { id: 'apply', key: 'a', label: '🪄 Use Device' },
                browse: { id: 'browse', key: 'b', label: '📖 Browse' },
                cast: { id: 'cast', key: 'm', label: '✨ Cast' },
                power: { id: 'power', key: 'U', label: '🌀 Use Power' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 'v', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm' },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' }
            },
            extendedCommands: [],
            biomeBranches: {
                wilderness: { id: 'wilderness', name: 'Outpost & Amber Wilds', minDepth: 0, maxDepth: 0, wallTint: 0x6b7c6e, floorTint: 0x435246, fogColor: 0x25332c, ambientHex: 0x7d9484, torchHex: 0xffe099 },
                camelot: { id: 'camelot', name: 'Stronghold & Orc Caves', minDepth: 1, maxDepth: 35, wallTint: 0x665c78, floorTint: 0x3b3547, fogColor: 0x1b1624, ambientHex: 0x6e6085, torchHex: 0xd9b3ff },
                logrus: { id: 'logrus', name: 'Abyss of the Logrus', minDepth: 36, maxDepth: 127, wallTint: 0x5c426e, floorTint: 0x342440, fogColor: 0x160e1f, ambientHex: 0x7a5299, torchHex: 0xc880ff }
            },
            interactiveFeatures: {
                door: [{ id: 'open', label: '🚪 Open Door', cmd: 'o' }, { id: 'close', label: '🔒 Close Door', cmd: 'c' }],
                stairs: [{ id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' }, { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }]
            },
            audioAcoustics: { reverbDecay: 2.7, lowpassHz: 2600, wetness: 0.31, mood: 'amber-chaos' },
            chroniclePersona: {
                speaker: 'Chronicler of the Courts of Amber',
                style: 'Multiverse archivist documenting eccentric quests and cosmic powers.'
            }
        },

        hengband: {
            id: 'hengband',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'Hengband 3.0.2',
            tagline: 'Scrolls of the Five Rings (変愚蛮怒)',
            menuGrammar: 'unified-command-popup',
            heraldry: {
                id: 'hengband',
                crestTitle: 'SCROLLS OF THE FIVE RINGS',
                subtitle: 'Gensokyo & Sengoku Abyss',
                accent: '#e0533c',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><rect x="9" y="9" width="6" height="6"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#1a1110',
                panelGradient: 'linear-gradient(180deg, rgba(36, 20, 18, 0.96) 0%, rgba(19, 11, 10, 0.98) 100%)',
                borderAccent: 'rgba(224, 83, 60, 0.50)',
                crestColor: '#f27b66',
                glowAccent: 'rgba(224, 83, 60, 0.22)'
            },
            equipmentSlots: STANDARD_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-w',
                maxInventoryVisible: 24,
                hasQuiver: false,
                beatitudeBUC: false,
                diagonalDoorwayBlocked: false,
                extendedHashCommands: false,
                nutritionStates: ['Starving', 'Weak', 'Hungry', 'Full', 'Gorged'],
                encumbranceStates: ['Unencumbered', 'Burdened', 'Overweight'],
                multiBranchGraph: true,
                hasTown: true,
                hasShops: true,
                statCount: 6,
                invenMode: 'command',
                hasPopupCommandMenu: true,
                isBilingual: true,
                features: { wilderness: true, riding: true, magicRealms: true }
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield', labelJp: '⚔️ 装備', labelBi: '⚔️ Wield (装備)' },
                wear: { id: 'wear', key: 'w', label: '🛡️ Wear', labelJp: '🛡️ 装備', labelBi: '🛡️ Wear (装備)' },
                takeoff: { id: 'takeoff', key: 't', label: '🔓 Take Off', labelJp: '🔓 外す', labelBi: '🔓 Take Off (外す)' },
                puton: { id: 'puton', key: 'w', label: '💍 Put On', labelJp: '💍 着ける', labelBi: '💍 Put On (着)' },
                remove: { id: 'remove', key: 't', label: '💍 Remove', labelJp: '💍 外す', labelBi: '💍 Remove (外)' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff', labelJp: '🧪 飲む', labelBi: '🧪 Quaff (薬)' },
                read: { id: 'read', key: 'r', label: '📜 Read', labelJp: '📜 読む', labelBi: '📜 Read (巻)' },
                eat: { id: 'eat', key: 'E', label: '🍞 Eat', labelJp: '🍞 食べる', labelBi: '🍞 Eat (食)' },
                aim: { id: 'aim', key: 'a', label: '🪄 Use / Aim', labelJp: '🪄 使う', labelBi: '🪄 Use (使)' },
                zap: { id: 'zap', key: 'z', label: '⚡ Zap Rod', labelJp: '⚡ 振る', labelBi: '⚡ Zap (振)' },
                use_staff: { id: 'use_staff', key: 'u', label: '🪄 Use Staff', labelJp: '🪄 杖を使う', labelBi: '🪄 Staff (杖)' },
                activate: { id: 'activate', key: 'A', label: '✨ Activate', labelJp: '✨ 発動', labelBi: '✨ Activate (発)' },
                apply: { id: 'apply', key: 'a', label: '🪄 Use', labelJp: '🪄 使う', labelBi: '🪄 Use (使)' },
                browse: { id: 'browse', key: 'b', label: '📖 Browse', labelJp: '📖 閲覧', labelBi: '📖 Browse (閲)' },
                cast: { id: 'cast', key: 'm', label: '✨ Cast', labelJp: '✨ 詠唱', labelBi: '✨ Cast (呪)' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire', labelJp: '🏹 射撃', labelBi: '🏹 Fire (射)' },
                throw: { id: 'throw', key: 'v', label: '🎯 Throw', labelJp: '🎯 投げる', labelBi: '🎯 Throw (投)' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop', labelJp: '⬇️ 落とす', labelBi: '⬇️ Drop (落)' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect', labelJp: '🔍 調査', labelBi: '🔍 Inspect (調)' },
                open: { id: 'open', key: 'o', label: '🚪 Open', labelJp: '🚪 開ける', labelBi: '🚪 Open (開)' },
                close: { id: 'close', key: 'c', label: '🚪 Close', labelJp: '🚪 閉める', labelBi: '🚪 Close (閉)' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm', labelJp: '⚙️ 解除', labelBi: '⚙️ Disarm (解)' },
                search: { id: 'search', key: 's', label: '👁️ Search', labelJp: '👁️ 探索', labelBi: '👁️ Search (探)' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up', labelJp: '✋ 拾う', labelBi: '✋ Pick Up (拾)' }
            },
            extendedCommands: [],
            biomeBranches: {
                morivant: { id: 'morivant', name: 'Castle Town & Torii Outpost', minDepth: 0, maxDepth: 0, wallTint: 0x785a54, floorTint: 0x4a3d3a, fogColor: 0x261d1e, ambientHex: 0x8f7470, torchHex: 0xffcfa3 },
                yeek_lair: { id: 'yeek_lair', name: 'Sengoku Caverns & Icky Cave', minDepth: 1, maxDepth: 35, wallTint: 0x6b4e4b, floorTint: 0x3d2e2d, fogColor: 0x1c1415, ambientHex: 0x785956, torchHex: 0xffb878 },
                abyss_five_rings: { id: 'abyss_five_rings', name: 'Abyss of the Serpent of Chaos', minDepth: 36, maxDepth: 127, wallTint: 0x5e3434, floorTint: 0x331b1b, fogColor: 0x170b0d, ambientHex: 0x733d3d, torchHex: 0xff8566 }
            },
            interactiveFeatures: {
                door: [{ id: 'open', label: '🚪 Open (開ける)', cmd: 'o' }, { id: 'close', label: '🔒 Close (閉める)', cmd: 'c' }],
                stairs: [{ id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' }, { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }]
            },
            audioAcoustics: { reverbDecay: 2.5, lowpassHz: 2500, wetness: 0.29, mood: 'sengoku-shrine' },
            chroniclePersona: {
                speaker: 'Scribe of the Five Rings (五輪書記官)',
                style: 'Bilingual Edo-fantasy chronicler recording martial arts, jutsu, and chaos depths.'
            }
        },

        nethack: {
            id: 'nethack',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'NetHack 3.6.7',
            tagline: 'The Mazes of Menace & Amulet of Yendor',
            menuGrammar: 'extended-ritual-hash',
            heraldry: {
                id: 'nethack',
                crestTitle: 'AMULET OF YENDOR',
                subtitle: 'Mazes of Menace & Gehennom',
                accent: '#10b981',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="10" r="5"/><path d="M7 4c2 2 8 2 10 0M12 15v7M9 19h6"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#0f1715',
                panelGradient: 'linear-gradient(180deg, rgba(16, 31, 26, 0.96) 0%, rgba(10, 19, 16, 0.98) 100%)',
                borderAccent: 'rgba(16, 185, 129, 0.50)',
                crestColor: '#34d399',
                glowAccent: 'rgba(16, 185, 129, 0.22)'
            },
            equipmentSlots: NETHACK_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-zA-Z$',
                maxInventoryVisible: 52,
                hasQuiver: true,
                beatitudeBUC: true,
                diagonalDoorwayBlocked: true,
                extendedHashCommands: true,
                nutritionStates: ['Fainting', 'Fainted', 'Starving', 'Weak', 'Hungry', 'Not Hungry', 'Satiated', 'Choking'],
                encumbranceStates: ['Unencumbered', 'Burdened', 'Stressed', 'Strained', 'Overtaxed', 'Overloaded'],
                multiBranchGraph: true,
                hasTown: false,
                hasShops: true,
                statCount: 6,
                invenMode: 'select',
                hasPopupCommandMenu: false,
                isBilingual: false,
                features: { altars: true, fountains: true, sinks: true, boulders: true, containers: true, pets: true, prayer: true }
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT, {
                runPrefix: 'g',
                restKey: '.',
                canTraverseDoorwayDiagonally: canTraverseDoorwayDiagonally
            }),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield' },
                wear: { id: 'wear', key: 'W', label: '🛡️ Wear Armor' },
                takeoff: { id: 'takeoff', key: 'T', label: '🔓 Take Off Armor' },
                puton: { id: 'puton', key: 'P', label: '💍 Put On Accessory' },
                remove: { id: 'remove', key: 'R', label: '💍 Remove Accessory' },
                quiver: { id: 'quiver', key: 'Q', label: '🏹 Ready in Quiver' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'e', label: '🍞 Eat' },
                aim: { id: 'aim', key: 'z', label: '🪄 Zap Wand' },
                zap: { id: 'zap', key: 'z', label: '⚡ Zap Wand' },
                use_staff: { id: 'use_staff', key: 'z', label: '🪄 Zap Wand / Staff' },
                activate: { id: 'activate', key: 'a', label: '🔧 Apply / Use' },
                apply: { id: 'apply', key: 'a', label: '🔧 Apply Tool' },
                cast: { id: 'cast', key: 'Z', label: '✨ Cast Spell' },
                browse: { id: 'browse', key: '+', label: '📖 View Spells' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 't', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: ';', label: '🔍 Examine' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: '#untrap\n', label: '🪤 #untrap', isExtended: true },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                pickup: { id: 'pickup', key: ',', label: '✋ Pick Up' },
                pray: { id: 'pray', key: '#pray\n', label: '🙏 #pray', isExtended: true },
                dip: { id: 'dip', key: '#dip\n', label: '⛲ #dip', isExtended: true },
                offer: { id: 'offer', key: '#offer\n', label: '🕯️ #offer', isExtended: true },
                loot: { id: 'loot', key: '#loot\n', label: '📦 #loot', isExtended: true },
                untrap: { id: 'untrap', key: '#untrap\n', label: '🪤 #untrap', isExtended: true },
                chat: { id: 'chat', key: '#chat\n', label: '💬 #chat', isExtended: true },
                force: { id: 'force', key: '#force\n', label: '🗡️ #force', isExtended: true },
                ride: { id: 'ride', key: '#ride\n', label: '🐎 #ride', isExtended: true },
                rub: { id: 'rub', key: '#rub\n', label: '🪔 #rub', isExtended: true }
            },
            extendedCommands: [
                { id: 'pray',   label: '🙏 #pray',   verb: '#pray\n',   hint: 'Beseech your deity at an altar or in mortal peril' },
                { id: 'dip',    label: '⛲ #dip',    verb: '#dip\n',    hint: 'Dip an item into a fountain or potion' },
                { id: 'offer',  label: '🕯️ #offer',  verb: '#offer\n',  hint: 'Sacrifice a corpse on a high altar' },
                { id: 'loot',   label: '📦 #loot',   verb: '#loot\n',   hint: 'Loot a chest, box, or saddlebag on the floor' },
                { id: 'untrap', label: '🪤 #untrap', verb: '#untrap\n', hint: 'Disarm a trapped chest, door, or floor tile' },
                { id: 'chat',   label: '💬 #chat',   verb: '#chat\n',   hint: 'Converse with a shopkeeper, priest, or oracle' },
                { id: 'force',  label: '🗡️ #force',  verb: '#force\n',  hint: 'Force a locked chest with your wielded weapon' }
            ],
            biomeBranches: {
                dungeons_of_doom: { id: 'dungeons_of_doom', name: 'The Dungeons of Doom', minDepth: 1, maxDepth: 20, wallTint: 0x586964, floorTint: 0x323d3a, fogColor: 0x131c19, ambientHex: 0x5c756d, torchHex: 0xffd890 },
                gnomish_mines: { id: 'gnomish_mines', name: 'The Gnomish Mines', minDepth: 2, maxDepth: 12, wallTint: 0x6e5944, floorTint: 0x423528, fogColor: 0x1e1610, ambientHex: 0x7a6248, torchHex: 0xffc266 },
                minetown: { id: 'minetown', name: 'Minetown Lantern Bazaar', minDepth: 5, maxDepth: 8, wallTint: 0x786852, floorTint: 0x4a4033, fogColor: 0x241d15, ambientHex: 0x8c7a62, torchHex: 0xffe299 },
                sokoban: { id: 'sokoban', name: 'Sokoban Boulder Sanctum', minDepth: 4, maxDepth: 9, wallTint: 0x637282, floorTint: 0x3b4550, fogColor: 0x182028, ambientHex: 0x748699, torchHex: 0xd9ecff },
                gehennom: { id: 'gehennom', name: 'Gehennom (Valley of the Dead)', minDepth: 21, maxDepth: 50, wallTint: 0x66332e, floorTint: 0x381b18, fogColor: 0x1c0b09, ambientHex: 0x783932, torchHex: 0xff7744 },
                astral_plane: { id: 'astral_plane', name: 'The Astral Plane & High Altars', minDepth: 51, maxDepth: 60, wallTint: 0x7e8899, floorTint: 0x4f5666, fogColor: 0x222836, ambientHex: 0x99a8bf, torchHex: 0xccf2ff }
            },
            interactiveFeatures: {
                altar: [
                    { id: 'pray', label: '🙏 #pray at Altar', cmd: '#pray\n', isExtended: true },
                    { id: 'offer', label: '🕯️ #offer Sacrifice', cmd: '#offer\n', isExtended: true },
                    { id: 'drop_buc', label: '⚖️ Drop Item (BUC Test)', cmd: 'd' }
                ],
                fountain: [
                    { id: 'quaff', label: '💧 Quaff from Fountain', cmd: 'q' },
                    { id: 'dip', label: '⛲ #dip Item in Fountain', cmd: '#dip\n', isExtended: true }
                ],
                sink: [
                    { id: 'quaff', label: '🚰 Quaff from Sink', cmd: 'q' },
                    { id: 'kick', label: '🥾 Kick Sink (Ctrl+D)', cmd: '\x04' }
                ],
                throne: [
                    { id: 'sit', label: '👑 #sit on Throne', cmd: '#sit\n', isExtended: true }
                ],
                boulder: [
                    { id: 'push', label: '🪨 Push Boulder into Pit', cmd: 'm' }
                ],
                chest: [
                    { id: 'loot', label: '📦 #loot Container', cmd: '#loot\n', isExtended: true },
                    { id: 'untrap', label: '🪤 #untrap Chest', cmd: '#untrap\n', isExtended: true },
                    { id: 'force', label: '🗡️ #force Lock', cmd: '#force\n', isExtended: true },
                    { id: 'apply_key', label: '🗝️ Apply Key / Lockpick', cmd: 'a' }
                ],
                door: [
                    { id: 'open', label: '🚪 Open Door', cmd: 'o' },
                    { id: 'close', label: '🔒 Close Door', cmd: 'c' },
                    { id: 'kick', label: '🥾 Kick Door (Ctrl+D)', cmd: '\x04' },
                    { id: 'untrap', label: '🪤 #untrap Door', cmd: '#untrap\n', isExtended: true }
                ],
                stairs: [
                    { id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' },
                    { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }
                ]
            },
            audioAcoustics: { reverbDecay: 2.2, lowpassHz: 2300, wetness: 0.26, mood: 'mazes-of-menace' },
            chroniclePersona: {
                speaker: 'Oracle of Delphi & Chronicler of Yendor',
                style: 'Wry, laconic chronicler noting BUC beatitude, hubris, altars, fountains, and mortal peril.'
            }
        },

        dcss: {
            id: 'dcss',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'Dungeon Crawl Stone Soup',
            tagline: 'Pantheon of Gods, Multi-Branch Realms & The Orb of Zot',
            menuGrammar: 'verb-first-prompt',
            heraldry: {
                id: 'dcss',
                crestTitle: 'ORB OF ZOT & ECUMENICAL PANTHEON',
                subtitle: 'Lair, Vaults & The Realm of Zot',
                accent: '#a855f7',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#140f1d',
                panelGradient: 'linear-gradient(180deg, rgba(32, 20, 46, 0.96) 0%, rgba(16, 11, 24, 0.98) 100%)',
                borderAccent: 'rgba(168, 85, 247, 0.52)',
                crestColor: '#d8b4fe',
                glowAccent: 'rgba(168, 85, 247, 0.22)'
            },
            equipmentSlots: STANDARD_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-z',
                maxInventoryVisible: 26,
                hasQuiver: true,
                beatitudeBUC: false,
                diagonalDoorwayBlocked: false,
                extendedHashCommands: false,
                multiBranchGraph: true,
                hasTown: false,
                hasShops: true,
                statCount: 3,
                invenMode: 'select'
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT, { restKey: '5' }),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield' },
                wear: { id: 'wear', key: 'W', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 'T', label: '🔓 Take Off' },
                puton: { id: 'puton', key: 'P', label: '💍 Put On' },
                remove: { id: 'remove', key: 'R', label: '💍 Remove' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'e', label: '🍖 Eat' },
                aim: { id: 'aim', key: 'V', label: '🪄 Evoke Wand' },
                evoke: { id: 'evoke', key: 'V', label: '🪄 Evoke' },
                zap: { id: 'zap', key: 'z', label: '✨ Cast Spell' },
                cast: { id: 'cast', key: 'z', label: '✨ Cast Spell' },
                browse: { id: 'browse', key: 'M', label: '📖 Memorise / Browse' },
                skills: { id: 'skills', key: 'm', label: '📊 Skills' },
                power: { id: 'power', key: 'a', label: '🙏 Divine Ability' },
                pray: { id: 'pray', key: 'p', label: '⛩️ Pray at Altar' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 'f', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                search: { id: 'search', key: 's', label: '👁️ Wait / Search' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' }
            },
            extendedCommands: [],
            biomeBranches: {
                dungeon: { id: 'dungeon', name: 'The Dungeon (D)', minDepth: 1, maxDepth: 3, wallTint: 0x625a78, floorTint: 0x3b354a, fogColor: 0x181324, ambientHex: 0x706490, torchHex: 0xffd699 },
                temple: { id: 'temple', name: 'Ecumenical Temple', minDepth: 4, maxDepth: 4, wallTint: 0x8a795d, floorTint: 0x4f4434, fogColor: 0x241d14, ambientHex: 0x9e8c6c, torchHex: 0xffe8a3 },
                lair: { id: 'lair', name: 'Lair of Beasts', minDepth: 5, maxDepth: 7, wallTint: 0x4b6e52, floorTint: 0x2c4230, fogColor: 0x111f14, ambientHex: 0x5c8564, torchHex: 0xd4ff99 },
                vaults: { id: 'vaults', name: 'The Vaults & Zot', minDepth: 8, maxDepth: 27, wallTint: 0x6e4278, floorTint: 0x382040, fogColor: 0x1a0c21, ambientHex: 0x884c96, torchHex: 0xe899ff }
            },
            interactiveFeatures: {
                altar: [{ id: 'pray', label: '⛩️ Pray / Join God (p)', cmd: 'p' }, { id: 'ability', label: '✨ Invoke Divine Ability (a)', cmd: 'a' }],
                door: [{ id: 'open', label: '🚪 Open Door', cmd: 'o' }, { id: 'close', label: '🔒 Close Door', cmd: 'c' }],
                stairs: [{ id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' }, { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }]
            },
            audioAcoustics: { reverbDecay: 2.5, lowpassHz: 2350, wetness: 0.28, mood: 'zot-sanctum' },
            chroniclePersona: {
                speaker: 'Herald of the Ecumenical Temple & Zot',
                style: 'Mythic chronicler of divine piety, Runes of Zot, and perilous multi-branch ascensions.'
            }
        },

        brogue: {
            id: 'brogue',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'Brogue (Community Edition)',
            tagline: 'Bioluminescent Caverns, Enchantments & Liberated Allies',
            menuGrammar: 'contextual-use-verb',
            heraldry: {
                id: 'brogue',
                crestTitle: 'AMULET OF YENDOR & LUMENSTONES',
                subtitle: 'Bioluminescent Caverns of Doom',
                accent: '#2dd4bf',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 20 12 12 22 4 12 12 2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#0d191b',
                panelGradient: 'linear-gradient(180deg, rgba(16, 36, 38, 0.96) 0%, rgba(9, 20, 22, 0.98) 100%)',
                borderAccent: 'rgba(45, 212, 191, 0.50)',
                crestColor: '#5eead4',
                glowAccent: 'rgba(45, 212, 191, 0.22)'
            },
            equipmentSlots: STANDARD_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-z',
                maxInventoryVisible: 26,
                hasQuiver: false,
                beatitudeBUC: false,
                diagonalDoorwayBlocked: false,
                extendedHashCommands: false,
                multiBranchGraph: false,
                hasTown: false,
                hasShops: false,
                statCount: 2,
                invenMode: 'select'
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT, { restKey: 'z' }),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Equip' },
                wear: { id: 'wear', key: 'w', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 'T', label: '🔓 Remove' },
                use: { id: 'use', key: 'a', label: '✨ Apply / Use' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'E', label: '🍖 Eat' },
                aim: { id: 'aim', key: 'a', label: '🪄 Zap Staff' },
                fire: { id: 'fire', key: 't', label: '🎯 Throw' },
                throw: { id: 'throw', key: 't', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' }
            },
            extendedCommands: [],
            biomeBranches: {
                caverns: { id: 'caverns', name: 'Bioluminescent Shallows', minDepth: 1, maxDepth: 10, wallTint: 0x3b6e6c, floorTint: 0x223d3c, fogColor: 0x0c1c1c, ambientHex: 0x4d8c89, torchHex: 0x80ffe8 },
                lava_depths: { id: 'lava_depths', name: 'Brimstone & Chasm Depths', minDepth: 11, maxDepth: 40, wallTint: 0x6e423b, floorTint: 0x3d2420, fogColor: 0x1c0e0c, ambientHex: 0x8c5249, torchHex: 0xff9e66 }
            },
            interactiveFeatures: {
                door: [{ id: 'open', label: '🚪 Open Door', cmd: 'o' }],
                stairs: [{ id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' }, { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }]
            },
            audioAcoustics: { reverbDecay: 2.7, lowpassHz: 2100, wetness: 0.32, mood: 'bioluminescent-cavern' },
            chroniclePersona: {
                speaker: 'Chronicler of the Bioluminescent Caverns',
                style: 'Atmospheric cavern observer noting liberated allies, enchantment runes, chasms, and subterranean flora.'
            }
        },

        rogue: {
            id: 'rogue',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'Classic Rogue 5.4 (1980)',
            tagline: 'The 1980 Unix Original That Named a Genre',
            menuGrammar: 'verb-first-prompt',
            heraldry: {
                id: 'rogue',
                crestTitle: '1980 BSD DUNGEONS OF DOOM',
                subtitle: 'Original Amulet of Yendor Quest',
                accent: '#e2e8f0',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8M12 8v8"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#12151a',
                panelGradient: 'linear-gradient(180deg, rgba(24, 30, 38, 0.96) 0%, rgba(13, 16, 22, 0.98) 100%)',
                borderAccent: 'rgba(226, 232, 240, 0.45)',
                crestColor: '#f1f5f9',
                glowAccent: 'rgba(226, 232, 240, 0.18)'
            },
            equipmentSlots: STANDARD_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-z',
                maxInventoryVisible: 26,
                hasQuiver: true,
                beatitudeBUC: false,
                diagonalDoorwayBlocked: true,
                extendedHashCommands: false,
                multiBranchGraph: false,
                hasTown: false,
                hasShops: false,
                statCount: 2,
                invenMode: 'select'
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT, { restKey: '.' }),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield' },
                wear: { id: 'wear', key: 'W', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 'T', label: '🔓 Take Off' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'e', label: '🍖 Eat' },
                aim: { id: 'aim', key: 'z', label: '🪄 Zap Wand/Staff' },
                fire: { id: 'fire', key: 't', label: '🏹 Throw / Fire' },
                throw: { id: 'throw', key: 't', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm' },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                pickup: { id: 'pickup', key: ',', label: '✋ Pick Up' }
            },
            extendedCommands: [],
            biomeBranches: {
                doom: { id: 'doom', name: 'Dungeons of Doom (1980)', minDepth: 1, maxDepth: 26, wallTint: 0x64748b, floorTint: 0x334155, fogColor: 0x0f172a, ambientHex: 0x94a3b8, torchHex: 0xffe499 }
            },
            interactiveFeatures: {
                door: [{ id: 'open', label: '🚪 Open Door', cmd: 'o' }],
                stairs: [{ id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' }, { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }]
            },
            audioAcoustics: { reverbDecay: 2.0, lowpassHz: 2200, wetness: 0.24, mood: 'classic-1980' },
            chroniclePersona: {
                speaker: 'Archivist of the 1980 Dungeons of Doom',
                style: 'Classic tabletop dungeon master chronicling the original 26-floor quest for the Amulet of Yendor.'
            }
        },
        ryod: {
            id: 'ryod',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            name: 'Roll Your Own Dungeon (RYOD)',
            tagline: 'The Infinite Dungeon Forge',
            menuGrammar: 'select-noun-then-verb',
            heraldry: {
                id: 'ryod',
                crestTitle: 'THE INFINITE FORGE',
                subtitle: 'Roll Your Own Dungeon',
                accent: '#f59e0b',
                svgCrest: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z"/><circle cx="12" cy="11" r="2.2" fill="currentColor"/></svg>'
            },
            themeTokens: {
                surfaceBg: '#121016',
                panelGradient: 'linear-gradient(180deg, rgba(28, 20, 34, 0.96) 0%, rgba(14, 11, 18, 0.98) 100%)',
                borderAccent: 'rgba(245, 158, 11, 0.55)',
                crestColor: '#fbbf24',
                glowAccent: 'rgba(245, 158, 11, 0.24)'
            },
            equipmentSlots: STANDARD_EQUIPMENT_SLOTS,
            capabilities: {
                inventorySlots: 'a-w',
                maxInventoryVisible: 23,
                hasQuiver: true,
                beatitudeBUC: true,
                diagonalDoorwayBlocked: false,
                extendedHashCommands: false,
                nutritionStates: ['Starving', 'Hungry', 'Fed', 'Full'],
                encumbranceStates: ['Unencumbered', 'Burdened'],
                multiBranchGraph: false,
                hasTown: true,
                hasShops: true,
                statCount: 6,
                invenMode: 'select',
                hasPopupCommandMenu: false,
                isBilingual: false
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT, { restKey: '.' }),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield' },
                wear: { id: 'wear', key: 'w', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 'T', label: '🔓 Take Off' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'e', label: '🍞 Eat' },
                aim: { id: 'aim', key: 'a', label: '🪄 Evoke / Use' },
                zap: { id: 'zap', key: 'a', label: '⚡ Zap' },
                use_staff: { id: 'use_staff', key: 'a', label: '🪄 Use Staff' },
                activate: { id: 'activate', key: 'a', label: '✨ Activate' },
                apply: { id: 'apply', key: 'a', label: '🔧 Apply' },
                browse: { id: 'browse', key: 'M', label: '📖 Powers' },
                cast: { id: 'cast', key: 'm', label: '✨ Cast / Power' },
                study: { id: 'study', key: 'M', label: '📘 Powers' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 't', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm' },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' }
            },
            extendedCommands: [],
            biomeBranches: {
                sanctuary: { id: 'sanctuary', name: 'Sanctuary Outpost', minDepth: 0, maxDepth: 0, wallTint: 0x6e737b, floorTint: 0x484d56, fogColor: 0x2d3a50, ambientHex: 0x808aa8, torchHex: 0xffdc99 },
                vaults: { id: 'vaults', name: 'Forged Dungeon', minDepth: 1, maxDepth: 50, wallTint: 0x5c5470, floorTint: 0x352f44, fogColor: 0x161224, ambientHex: 0x685a7a, torchHex: 0xffcf78 }
            },
            interactiveFeatures: {
                door: [{ id: 'open', label: '🚪 Open Door', cmd: 'o' }, { id: 'close', label: '🔒 Close Door', cmd: 'c' }],
                stairs: [{ id: 'ascend', label: '⬆️ Ascend (<)', cmd: '<' }, { id: 'descend', label: '⬇️ Descend (>)', cmd: '>' }],
                altar: [{ id: 'pray', label: '⛩️ Pray at Altar (p)', cmd: 'p' }]
            },
            audioAcoustics: { reverbDecay: 2.3, lowpassHz: 2400, wetness: 0.28, mood: 'forged-mythic' },
            chroniclePersona: {
                speaker: 'The Sovereign Architect of the Forge',
                style: 'Dynamic chronicler adapting to the forged world spine, biome, and five-act quest.'
            }
        }
    };

    let _activeRealmId = 'angband';

    function normalizeRealmId(realm) {
        const r = String(realm || _activeRealmId || 'angband').trim().toLowerCase();
        return CARTRIDGES[r] ? r : 'angband';
    }

    function listRealms() {
        return Object.keys(CARTRIDGES);
    }

    function getCartridge(realm) {
        return CARTRIDGES[normalizeRealmId(realm)];
    }

    function getActive() {
        return CARTRIDGES[_activeRealmId] || CARTRIDGES.angband;
    }

    function setActive(realm) {
        _activeRealmId = normalizeRealmId(realm);
        return getActive();
    }

    function getCapabilities(realm) {
        const c = getCartridge(realm);
        return (c && c.capabilities) || CARTRIDGES.angband.capabilities;
    }

    function getHeraldry(realm) {
        const c = getCartridge(realm);
        return (c && c.heraldry) || CARTRIDGES.angband.heraldry;
    }

    function getThemeTokens(realm) {
        const c = getCartridge(realm);
        return (c && c.themeTokens) || CARTRIDGES.angband.themeTokens;
    }

    /**
     * Applies Bespoke Realm Material Language tokens (`--realm-*`) and `data-active-realm`
     * to `doc.documentElement` (safe no-op in headless Node environments).
     */
    function applyThemeTokens(realm, doc) {
        const c = getCartridge(realm);
        const tokens = getThemeTokens(c.id);
        const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
        if (targetDoc && targetDoc.documentElement) {
            const rootEl = targetDoc.documentElement;
            if (typeof rootEl.setAttribute === 'function') {
                rootEl.setAttribute('data-active-realm', c.id);
            }
            if (rootEl.style && typeof rootEl.style.setProperty === 'function') {
                rootEl.style.setProperty('--realm-surface-bg', tokens.surfaceBg);
                rootEl.style.setProperty('--realm-panel-gradient', tokens.panelGradient);
                rootEl.style.setProperty('--realm-border-accent', tokens.borderAccent);
                rootEl.style.setProperty('--realm-crest-color', tokens.crestColor);
                rootEl.style.setProperty('--realm-glow-accent', tokens.glowAccent);
            }
        }
        return tokens;
    }

    function getEquipmentSlots(realm) {
        const c = getCartridge(realm);
        return (c && Array.isArray(c.equipmentSlots)) ? c.equipmentSlots.slice() : STANDARD_EQUIPMENT_SLOTS.slice();
    }

    function getExtendedCommands(realm) {
        const c = getCartridge(realm);
        return (c && Array.isArray(c.extendedCommands)) ? c.extendedCommands.slice() : [];
    }

    function getSlotLetter(index, realm) {
        const idx = Math.max(0, Number(index) || 0);
        const r = normalizeRealmId(realm);
        if (r === 'nethack') {
            return NETHACK_SLOTS[idx] || String.fromCharCode(97 + (idx % 26));
        }
        if (r === 'angband') {
            return VANILLA_LETTERS[idx] || String.fromCharCode(97 + (idx % 26));
        }
        return NETHACK_SLOTS[idx] || String.fromCharCode(97 + (idx % 26));
    }

    function parseBeatitudeBUC(desc, itemObj) {
        if (itemObj && typeof itemObj === 'object') {
            const explicit = String(itemObj.buc || itemObj.beatitude || '').toLowerCase();
            if (explicit === 'blessed' || explicit === 'uncursed' || explicit === 'cursed') {
                return {
                    buc: explicit,
                    badgeLabel: explicit === 'blessed' ? '✦ Blessed' : (explicit === 'cursed' ? '☠ Cursed' : '○ Uncursed'),
                    shortCode: explicit === 'blessed' ? 'B' : (explicit === 'cursed' ? 'C' : 'U')
                };
            }
        }
        const s = String(desc || '');
        if (!s) return { buc: 'unknown', badgeLabel: '', shortCode: '?' };

        if (/\b(uncursed|non-cursed)\b/i.test(s) || /\{uncursed\}/i.test(s) || /(呪われていない)/.test(s)) {
            return { buc: 'uncursed', badgeLabel: '○ Uncursed', shortCode: 'U' };
        }
        if (/\b(blessed|holy)\b/i.test(s) || /\{blessed\}/i.test(s) || /(祝福された)/.test(s)) {
            return { buc: 'blessed', badgeLabel: '✦ Blessed', shortCode: 'B' };
        }
        if (/\b(cursed|heavily cursed|permanently cursed)\b/i.test(s) || /\{cursed\}/i.test(s) || /(呪われた|呪い)/.test(s)) {
            return { buc: 'cursed', badgeLabel: '☠ Cursed', shortCode: 'C' };
        }
        return { buc: 'unknown', badgeLabel: '', shortCode: '?' };
    }

    /**
     * Parses numeric weapon average damage or armor total AC from an item description or metrics string
     * and computes a human-friendly stat delta (`▲ +3 AC`, `▲ +2.5 Dmg`, `▼ -2 AC`) against equipped gear.
     */
    function _extractCombatScore(textOrObj, category) {
        const raw = typeof textOrObj === 'string'
            ? textOrObj
            : String((textOrObj && (textOrObj.stats || textOrObj.cleanName || textOrObj.desc || textOrObj.name)) || '');
        const cat = String(category || 'weapon').toLowerCase();

        if (cat === 'weapon' || cat === 'ranged') {
            const diceMatch = raw.match(/\((\d+)d(\d+)\)(?:\s*\(([+-]?\d+)(?:,\s*([+-]?\d+))?\))?/);
            if (diceMatch) {
                const n = Number(diceMatch[1]) || 1;
                const sides = Number(diceMatch[2]) || 1;
                const toDam = Number(diceMatch[4] != null ? diceMatch[4] : (diceMatch[3] || 0)) || 0;
                return n * ((sides + 1) / 2) + toDam;
            }
            const plusMatch = raw.match(/(?:^|\s)([+-]\d+)\s+(?:long\s+sword|sword|dagger|axe|mace|bow|spear|blade|katana)/i);
            if (plusMatch) return 4.5 + (Number(plusMatch[1]) || 0);
            return null;
        }

        if (cat === 'armor') {
            const acMatch = raw.match(/\[(\d+)(?:,\s*([+-]?\d+))?\]/);
            if (acMatch) {
                return (Number(acMatch[1]) || 0) + (Number(acMatch[2]) || 0);
            }
            const plusAc = raw.match(/(?:^|\s)([+-]\d+)\s+(?:plate|mail|leather|cloak|shield|helm|boots|gloves|armor|armour)/i);
            if (plusAc) return 3 + (Number(plusAc[1]) || 0);
            return null;
        }

        return null;
    }

    function compareWithEquipped(candidateMetrics, equippedMetrics, category) {
        const cat = String(category || 'weapon').toLowerCase();
        const candScore = _extractCombatScore(candidateMetrics, cat);
        const eqScore = _extractCombatScore(equippedMetrics, cat);
        if (candScore == null || eqScore == null) {
            return { deltaScore: 0, deltaLabel: '', isUpgrade: false, isDowngrade: false };
        }
        const diff = Number((candScore - eqScore).toFixed(1));
        const unit = (cat === 'armor') ? 'AC' : 'Dmg';
        if (diff > 0.05) {
            return { deltaScore: diff, deltaLabel: `▲ +${diff} ${unit}`, isUpgrade: true, isDowngrade: false };
        }
        if (diff < -0.05) {
            return { deltaScore: diff, deltaLabel: `▼ ${diff} ${unit}`, isUpgrade: false, isDowngrade: true };
        }
        return { deltaScore: 0, deltaLabel: `= 0 ${unit}`, isUpgrade: false, isDowngrade: false };
    }

    function canMoveDiagonally(realm, fromFeat, toFeat) {
        const cart = getCartridge(realm);
        if (!cart || !cart.movement || typeof cart.movement.canTraverseDoorwayDiagonally !== 'function') {
            return true;
        }
        return cart.movement.canTraverseDoorwayDiagonally(fromFeat, toFeat, cart.capabilities);
    }

    function getFeatureActions(realm, featName) {
        const cart = getCartridge(realm);
        const key = String(featName || '').trim().toLowerCase();
        if (!key || !cart || !cart.interactiveFeatures) return [];
        if (cart.interactiveFeatures[key]) return cart.interactiveFeatures[key].slice();
        for (const k of Object.keys(cart.interactiveFeatures)) {
            if (key.indexOf(k) !== -1) return cart.interactiveFeatures[k].slice();
        }
        return [];
    }

    function getBiomeForDepth(realm, depth, branchId) {
        const cart = getCartridge(realm);
        const branches = (cart && cart.biomeBranches) || CARTRIDGES.angband.biomeBranches;
        const keys = Object.keys(branches);
        if (typeof branchId === 'string' && branchId.trim()) {
            const norm = branchId.trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (branches[norm]) return branches[norm];
            for (const k of keys) {
                if (norm.indexOf(k) !== -1 || branches[k].name.toLowerCase().indexOf(branchId.trim().toLowerCase()) !== -1) {
                    return branches[k];
                }
            }
        }
        const d = Number(typeof depth === 'number' ? depth : 0);
        for (const k of keys) {
            const b = branches[k];
            if (d >= b.minDepth && d <= b.maxDepth) return b;
        }
        return branches[keys[keys.length - 1]] || branches[keys[0]];
    }

    const getBiomeProfile = getBiomeForDepth;

    function resolveVerbsForCategory(category, realm, ctx = {}) {
        const r = normalizeRealmId(realm);
        const cart = getCartridge(r);
        const cat = String(category || 'misc').toLowerCase();
        const lang = String(ctx.lang || 'en').toLowerCase();
        const isJp = r === 'hengband' && lang === 'jp';
        const isBi = r === 'hengband' && lang === 'bilingual';
        const lbl = (en, jp, bi) => isJp ? jp : (isBi ? (bi || `${en} (${jp.replace(/^[^\s]+\s*/, '')})`) : en);

        if (ctx.isStoreScreen) {
            return [
                { id: 'buy', label: lbl('🪙 Buy / Take', '🪙 購入 / 受取', '🪙 Buy (購入)'), verb: 'p' },
                { id: 'inspect', label: lbl('🔍 Examine', '🔍 調査', '🔍 Examine (調査)'), verb: r === 'nethack' ? ':' : 'I' }
            ];
        }
        if (ctx.isSpellPowerChoice || (ctx.submenu && (ctx.submenu.isFcbPowerMenu || ctx.submenu.isHengbandMagicMenu))) {
            return [
                { id: 'invoke', label: lbl('✨ Cast / Invoke', '✨ 詠唱 / 発動', '✨ Cast (詠唱)'), verb: '' },
                { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind (登録)'), verb: '__bind_spell__', isBind: true }
            ];
        }
        if (ctx.isItemTargetPrompt) {
            return [{ id: 'select', label: lbl('✓ Choose Slot', '✓ 選択', '✓ Select (選択)'), verb: '' }];
        }

        const itemDesc = String(ctx.itemDesc || (ctx.item && (ctx.item.desc || ctx.item.label || ctx.item.name)) || '');
        const isEq = Boolean(ctx.isEquipScreen);

        if (r === 'nethack') {
            if (isEq) {
                const eqNh = [];
                if (cat === 'armor') eqNh.push({ id: 'takeoff', label: '🔓 Take Off (T)', verb: 'T' });
                else if (cat === 'jewelry') eqNh.push({ id: 'remove', label: '💍 Remove (R)', verb: 'R' });
                else eqNh.push({ id: 'wield', label: '⚔️ Change / Unwield (w)', verb: 'w' });
                eqNh.push({ id: 'apply', label: '🔧 Apply / Invoke (a)', verb: 'a' }, { id: 'inspect', label: '🔍 Examine (;)', verb: ';' });
                return eqNh;
            }
            const nhVerbs = [];
            if (cat === 'weapon') {
                nhVerbs.push({ id: 'wield', label: '⚔️ Wield (w)', verb: 'w' }, { id: 'throw', label: '🎯 Throw (t)', verb: 't' });
            } else if (cat === 'ranged') {
                nhVerbs.push({ id: 'wield', label: '⚔️ Wield (w)', verb: 'w' }, { id: 'fire', label: '🏹 Fire (f)', verb: 'f' }, { id: 'quiver', label: '🏹 Quiver (Q)', verb: 'Q' }, { id: 'bind', label: '⚡ Bind', verb: 'f', isBind: true });
            } else if (cat === 'armor') {
                nhVerbs.push({ id: 'wear', label: '🛡️ Wear (W)', verb: 'W' }, { id: 'takeoff', label: '🔓 Take Off (T)', verb: 'T' });
            } else if (cat === 'jewelry') {
                nhVerbs.push({ id: 'puton', label: '💍 Put On (P)', verb: 'P' }, { id: 'remove', label: '💍 Remove (R)', verb: 'R' });
            } else if (cat === 'potion') {
                nhVerbs.push({ id: 'quaff', label: '🧪 Quaff (q)', verb: 'q' }, { id: 'dip', label: '⛲ #dip', verb: '#dip\n', isExtended: true }, { id: 'bind', label: '⚡ Bind', verb: 'q', isBind: true });
            } else if (cat === 'scroll') {
                nhVerbs.push({ id: 'read', label: '📜 Read (r)', verb: 'r' }, { id: 'bind', label: '⚡ Bind', verb: 'r', isBind: true });
            } else if (cat === 'food') {
                nhVerbs.push({ id: 'eat', label: '🍞 Eat (e)', verb: 'e' }, { id: 'offer', label: '🕯️ #offer', verb: '#offer\n', isExtended: true });
            } else if (cat === 'device') {
                nhVerbs.push({ id: 'zap', label: '🪄 Zap (z)', verb: 'z' }, { id: 'apply', label: '🔧 Apply (a)', verb: 'a' }, { id: 'bind', label: '⚡ Bind', verb: 'z', isBind: true });
            } else if (cat === 'tome') {
                nhVerbs.push({ id: 'read', label: '📖 Study Book (r)', verb: 'r' }, { id: 'cast', label: '✨ Cast Spell (Z)', verb: 'Z' }, { id: 'bind', label: '⚡ Bind', verb: 'Z', isBind: true });
            } else if (cat === 'light') {
                nhVerbs.push({ id: 'apply', label: '🕯️ Light / Apply (a)', verb: 'a' }, { id: 'rub', label: '🪔 #rub', verb: '#rub\n', isExtended: true });
            } else {
                nhVerbs.push({ id: 'apply', label: '🔧 Apply (a)', verb: 'a' }, { id: 'loot', label: '📦 #loot', verb: '#loot\n', isExtended: true });
            }
            nhVerbs.push(
                { id: 'dip', label: '⛲ #dip', verb: '#dip\n', isExtended: true },
                { id: 'drop', label: '⬇️ Drop (d)', verb: 'd' }
            );
            const seen = new Set();
            return nhVerbs.filter(v => {
                if (seen.has(v.id)) return false;
                seen.add(v.id);
                return true;
            });
        }

        if (r === 'silq') {
            if (isEq) {
                const eqSq = [{ id: 'takeoff', label: '🛡️ Take Off', verb: 'r' }];
                if (/\bhorn\b/i.test(itemDesc)) eqSq.push({ id: 'play_horn', label: '📯 Play Horn', verb: 'p' });
                eqSq.push({ id: 'inspect', label: '🔍 Inspect', verb: 'x' }, { id: 'inscribe', label: '✍️ Inscribe', verb: '{' }, { id: 'drop', label: '⬇️ Drop', verb: 'd' });
                return eqSq;
            }
            const v = [];
            if (/\bhorn\b/i.test(itemDesc)) {
                v.push({ id: 'play_horn', label: '📯 Play Horn', verb: 'p' }, { id: 'bind', label: '⚡ Bind', verb: 'p', isBind: true });
            } else if (cat === 'device' || /\bstaff\b/i.test(itemDesc)) {
                v.push({ id: 'use_staff', label: '🪄 Activate Staff', verb: 'a' }, { id: 'bind', label: '⚡ Bind', verb: 'a', isBind: true });
            } else if (cat === 'potion') {
                v.push({ id: 'quaff', label: '🧪 Quaff', verb: 'q' }, { id: 'bind', label: '⚡ Bind', verb: 'q', isBind: true });
            } else if (cat === 'food') {
                v.push({ id: 'eat', label: '🍞 Eat', verb: 'E' });
            } else if (/^(weapon|ranged|armor|jewelry|light)$/.test(cat)) {
                v.push({ id: 'wield', label: '⚔️ Wield / Wear', verb: 'w' });
            } else if (/^(scroll)$/.test(cat)) {
                v.push({ id: 'use', label: '✨ Use Item', verb: 'u' }, { id: 'bind', label: '⚡ Bind', verb: 'u', isBind: true });
            }
            v.push({ id: 'inspect', label: '🔍 Inspect', verb: 'x' }, { id: 'inscribe', label: '✍️ Inscribe', verb: '{' }, { id: 'drop', label: '⬇️ Drop', verb: 'd' });
            return v;
        }

        if (isEq) {
            const eqVerbs = [
                { id: 'takeoff', label: lbl('🛡️ Take Off', '🛡️ 外す', '🛡️ Take Off (外)'), verb: 't' },
                { id: 'activate', label: lbl('🔮 Activate', '🔮 発動', '🔮 Activate (発)'), verb: 'A' },
                { id: 'inspect', label: lbl('🔍 Inspect', '🔍 調査', '🔍 Inspect (調)'), verb: cart.verbs.inspect ? cart.verbs.inspect.key : 'I' },
                { id: 'inscribe', label: lbl('✍️ Inscribe', '✍️ 銘刻', '✍️ Inscribe (銘)'), verb: '{' }
            ];
            if (cat === 'light') {
                eqVerbs.splice(2, 0, { id: 'refill', label: lbl('🔥 Refill', '🔥 補給', '🔥 Refill (補)'), verb: 'F' });
            }
            return eqVerbs;
        }

        const verbs = [];
        const eatKey = (r === 'dcss' || r === 'rogue' || r === 'brogue') ? 'e' : 'E';
        const wieldKey = (cat === 'armor' && (r === 'dcss' || r === 'rogue')) ? 'W' : ((cat === 'jewelry' && (r === 'dcss' || r === 'rogue')) ? 'P' : 'w');
        if (/^(weapon|ranged|armor|jewelry|light)$/.test(cat)) {
            verbs.push({ id: 'wield', label: lbl('⚔️ Wield', '⚔️ 装備', '⚔️ Wield (装備)'), verb: wieldKey });
            if (cat === 'ranged') verbs.push({ id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: (r === 'brogue' || r === 'rogue') ? 't' : 'f', isBind: true });
            if (cat === 'light' && r !== 'dcss' && r !== 'brogue' && r !== 'rogue') verbs.push({ id: 'refill', label: lbl('🔥 Refill', '🔥 補給', '🔥 Refill (補)'), verb: 'F' });
        }
        if (cat === 'potion') {
            verbs.push({ id: 'quaff', label: lbl('🧪 Quaff', '🧪 飲む', '🧪 Quaff (薬)'), verb: 'q' }, { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'q', isBind: true });
        } else if (cat === 'scroll') {
            verbs.push({ id: 'read', label: lbl('📜 Read', '📜 読む', '📜 Read (巻)'), verb: 'r' }, { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: 'r', isBind: true });
        } else if (cat === 'food') {
            verbs.push({ id: 'eat', label: lbl('🍞 Eat', '🍞 食べる', '🍞 Eat (食)'), verb: eatKey });
        } else if (cat === 'device') {
            const isWand = /\bwand\b|魔法棒/i.test(itemDesc);
            const isRod = /\brod\b|ロッド/i.test(itemDesc);
            const isStaff = /\bstaff\b|\bstave\b|スタッフ|の杖/i.test(itemDesc);
            const dv = r === 'dcss' ? 'V' : (r === 'brogue' ? 'a' : (r === 'rogue' ? 'z' : (isRod ? 'z' : (isWand ? 'a' : (isStaff ? 'u' : ((r === 'hengband' || r === 'frogcomposband') ? 'a' : 'u'))))));
            const dLabel = r === 'dcss' ? '🪄 Evoke (V)' : (r === 'brogue' ? '🪄 Apply (a)' : (r === 'rogue' ? '🪄 Zap (z)' : (isRod ? lbl('⚡ Zap Rod', '⚡ 使う(ロッド)', '⚡ Zap (ロ)') : (isWand ? lbl('🪄 Aim Wand', '🪄 振る(魔法棒)', '🪄 Aim (棒)') : lbl('🪄 Use Staff', '🪄 使う(杖)', '🪄 Use (杖)')))));
            verbs.push({ id: isRod ? 'zap' : (isWand ? 'aim' : 'use'), label: dLabel, verb: dv }, { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: dv, isBind: true });
        } else if (cat === 'tome' && r !== 'brogue' && r !== 'rogue') {
            verbs.push(
                { id: 'browse', label: lbl('📖 Browse', '📖 閲覧', '📖 Browse (閲)'), verb: r === 'dcss' ? 'I' : 'b' },
                { id: 'cast', label: lbl('✨ Cast', '✨ 詠唱', '✨ Cast (呪)'), verb: r === 'dcss' ? 'z' : 'm' },
                { id: 'study', label: lbl('📚 Study', '📚 学習', '📚 Study (学)'), verb: r === 'dcss' ? 'M' : 'G' },
                { id: 'bind', label: lbl('⚡ Bind', '⚡ 登録', '⚡ Bind'), verb: r === 'dcss' ? 'z' : 'm', isBind: true }
            );
        }
        verbs.push(
            { id: 'inspect', label: lbl('🔍 Inspect', '🔍 調査', '🔍 Inspect (調)'), verb: cart.verbs.inspect ? cart.verbs.inspect.key : 'I' },
            { id: 'inscribe', label: lbl('✍️ Inscribe', '✍️ 銘刻', '✍️ Inscribe (銘)'), verb: '{' },
            { id: 'drop', label: lbl('⬇️ Drop', '⬇️ 落とす', '⬇️ Drop (落)'), verb: 'd' }
        );
        return verbs;
    }

    function validateCartridgeManifest(manifest) {
        const errors = [];
        if (!manifest || typeof manifest !== 'object') {
            return { valid: false, errors: ['Manifest must be a non-null object'] };
        }
        if (!manifest.id || typeof manifest.id !== 'string' || !/^[a-z0-9_-]{2,32}$/i.test(manifest.id)) {
            errors.push('Manifest requires a valid alphanumeric id (2-32 chars)');
        }
        if (!manifest.name || typeof manifest.name !== 'string') {
            errors.push('Manifest requires a human-readable name string');
        }
        if (manifest.transportProtocol && SUPPORTED_TRANSPORTS.indexOf(manifest.transportProtocol) === -1) {
            errors.push('Unsupported transportProtocol: ' + manifest.transportProtocol);
        }
        if (manifest.capabilities && typeof manifest.capabilities !== 'object') {
            errors.push('capabilities must be an object');
        }
        return {
            valid: errors.length === 0,
            schemaVersion: CARTRIDGE_SCHEMA_VERSION,
            errors: errors
        };
    }

    function registerCartridge(idOrManifest, maybeSpec) {
        const spec = (typeof idOrManifest === 'object' && idOrManifest !== null)
            ? idOrManifest
            : Object.assign({}, maybeSpec || {}, { id: idOrManifest });
        if (!spec || !spec.id) return null;
        const key = String(spec.id).trim().toLowerCase();
        const base = CARTRIDGES[key] || CARTRIDGES.angband;
        CARTRIDGES[key] = Object.assign({}, base, spec, {
            id: key,
            schemaVersion: spec.schemaVersion || CARTRIDGE_SCHEMA_VERSION,
            heraldry: Object.assign({}, base.heraldry, spec.heraldry || {}, { id: key }),
            themeTokens: Object.assign({}, base.themeTokens, spec.themeTokens || {}),
            equipmentSlots: Array.isArray(spec.equipmentSlots) ? spec.equipmentSlots : base.equipmentSlots,
            capabilities: Object.assign({}, base.capabilities, spec.capabilities || {}),
            movement: Object.assign({}, base.movement, spec.movement || {}),
            verbs: Object.assign({}, base.verbs, spec.verbs || {}),
            extendedCommands: Array.isArray(spec.extendedCommands) ? spec.extendedCommands : base.extendedCommands,
            biomeBranches: Object.assign({}, base.biomeBranches, spec.biomeBranches || {}),
            interactiveFeatures: Object.assign({}, base.interactiveFeatures, spec.interactiveFeatures || {})
        });
        const mb = (typeof window !== 'undefined' && window.MASTER_BESTIARY) || (typeof global !== 'undefined' && global.MASTER_BESTIARY) || null;
        if (mb && typeof mb.registerRealm === 'function' && spec.bestiary) {
            mb.registerRealm(key, spec.bestiary);
        }
        const mir = (typeof window !== 'undefined' && window.MASTER_ITEM_REGISTRY) || (typeof global !== 'undefined' && global.MASTER_ITEM_REGISTRY) || null;
        if (mir && typeof mir.registerRealm === 'function' && spec.items) {
            mir.registerRealm(key, spec.items);
        }
        const rcp = (typeof window !== 'undefined' && window.RealmContentPool) || (typeof global !== 'undefined' && global.RealmContentPool) || null;
        if (rcp && typeof rcp.registerRealmContent === 'function' && key !== 'ryod') {
            rcp.registerRealmContent(key, spec);
        }
        return CARTRIDGES[key];
    }
    const registerRealm = registerCartridge;

    function loadExternalCartridgeJSON(jsonOrObject) {
        let parsed = jsonOrObject;
        if (typeof jsonOrObject === 'string') {
            try {
                parsed = JSON.parse(jsonOrObject);
            } catch (err) {
                return { ok: false, error: 'Invalid JSON: ' + err.message, cartridge: null };
            }
        }
        const check = validateCartridgeManifest(parsed);
        if (!check.valid) {
            return { ok: false, error: check.errors.join('; '), cartridge: null };
        }
        const registered = registerCartridge(parsed.id, Object.assign({
            transportProtocol: parsed.transportProtocol || 'pty-ansi-80x24',
            schemaVersion: CARTRIDGE_SCHEMA_VERSION
        }, parsed));
        return { ok: true, error: null, cartridge: registered };
    }

    function formatDeathModalSummary(frame, realmId) {
        const f = frame || {};
        const p = f.player || {};
        const r = String(realmId || f.realm || 'angband').toLowerCase();
        const name = p.name || 'Hero';
        const race = p.race || 'Human';
        const pClass = p.class || 'Adventurer';
        const level = p.level || 1;
        const depth = p.depth || 0;
        const maxDepth = p.max_depth || depth;
        const gold = p.gold || 0;
        const exp = p.exp || 0;
        const turns = p.turns || f.turn || 1;
        const rawDiedFrom = String(p.died_from || p.killed_by || 'mortal wounds').trim();
        const diedFrom = rawDiedFrom
            .replace(/^a\s+([A-Z][a-zA-Z]+)/, '$1')
            .replace(/^a\s+([aeiouAEIOU][a-z]+)/, 'an $1');
        const isWinner = Boolean(p.winner);

        let depthStr = depth === 0 ? 'in the Town' : `on Dungeon Level ${depth} (${depth * 50} ft)`;
        let maxDepthStr = maxDepth === 0 ? 'Town' : `${maxDepth} (${maxDepth * 50} ft)`;
        if (r === 'dcss') {
            depthStr = `in ${p.place_label || `${p.branch_name || 'Dungeon'}:${depth}`}`;
            maxDepthStr = `${p.branch_name || 'D'}:${maxDepth}`;
        } else if (r === 'nethack') {
            depthStr = `in ${p.branch_name || 'The Dungeons of Doom'} (DLvl ${depth})`;
            maxDepthStr = `DLvl ${maxDepth}`;
        } else if (r === 'brogue') {
            depthStr = `on Depth ${depth} of the Dungeons of Doom`;
            maxDepthStr = `Depth ${maxDepth}`;
        } else if (r === 'rogue') {
            depthStr = `on Level ${depth} of the Dungeons of Doom`;
            maxDepthStr = `Level ${maxDepth}`;
        } else if (r === 'silq') {
            depthStr = depth === 0 ? 'at the Gates of Angband' : `at ${depth * 50} ft in Angband`;
        }

        const titleText = isWinner
            ? '👑   I M M O R T A L   A S C E N S I O N   👑'
            : '☠   Y O U   H A V E   P E R I S H E D   ☠';
        const epitaph = (r === 'brogue' || r === 'rogue')
            ? `${name} the ${pClass} (${r === 'brogue' ? `Depth ${depth}` : `Level ${level}`})`
            : (r === 'silq'
                ? `${name} of the ${p.house || race} (${depth === 0 ? 'Gates of Angband' : `${depth * 50} ft`})`
                : `${name} the ${race} ${pClass} (${r === 'dcss' ? `XL ${level}` : `Level ${level}`})`);
        const cause = isWinner
            ? `Ascended triumphantly ${depthStr}!`
            : `Killed by ${diedFrom} ${depthStr}.`;

        let score = `Gold: ${gold.toLocaleString()} AU  •  Experience: ${exp.toLocaleString()}  •  Deepest: ${maxDepthStr}`;
        if (r === 'dcss') {
            score = `XL: ${level}  •  Runes: ${p.runes || 0}/3 ${p.rune_list && p.rune_list.length ? `(${p.rune_list.join(', ')})` : ''}  •  God: ${p.god || 'No God'}  •  Gold: ${gold.toLocaleString()}  •  Deepest: ${maxDepthStr}`;
        } else if (r === 'brogue') {
            const brogueStr = (p.stats && typeof p.stats.str === 'object') ? (p.stats.str.use ?? p.stats.str.top ?? 12) : ((p.stats && p.stats.str) || p.str || 12);
            score = `Lumenstones: ${p.lumenstones || 0}  •  Enchantments: +${p.enchantments || 0}  •  Gold: ${gold.toLocaleString()}  •  Strength: ${brogueStr}  •  Deepest: ${maxDepthStr}`;
        } else if (r === 'nethack') {
            score = `Score: ${(gold + exp + depth * 50).toLocaleString()}  •  Gold: ${gold.toLocaleString()} zorkmids  •  Turns: ${turns.toLocaleString()}  •  Deepest: ${maxDepthStr}`;
        } else if (r === 'silq') {
            const totalExp = p.exp_max !== undefined ? p.exp_max : exp;
            score = `Total XP: ${totalExp.toLocaleString()} (Unspent: ${exp.toLocaleString()})  •  Silmarils: ${p.silmarils || 0}  •  Deepest: ${maxDepthStr}`;
        }

        // Partition equipment / inventory / quiver when equipment array is empty
        let eq = Array.isArray(p.equipment) ? p.equipment.slice() : [];
        let inv = Array.isArray(p.inventory) ? p.inventory.slice() : [];
        let quiv = Array.isArray(p.quiver) ? p.quiver.slice() : [];
        if (eq.length === 0 && inv.length > 0) {
            const worn = [];
            const pack = [];
            const ammo = [];
            for (const item of inv) {
                if (!item) continue;
                const nm = String(item.name || item.label || '');
                if (/\((?:in quiver|quivered)\)/i.test(nm) || item.category === 'ammo') {
                    ammo.push(item);
                } else if (item.equipped || /\((?:weapon in hand|being worn|wielded|alternate weapon|on left|on right|around neck)\)/i.test(nm)) {
                    worn.push(Object.assign({ slot_name: item.slot ? `${item.slot})` : '•' }, item));
                } else {
                    pack.push(item);
                }
            }
            if (worn.length > 0) eq = worn;
            if (quiv.length === 0 && ammo.length > 0) quiv = ammo;
        }

        return { titleText, epitaph, cause, score, eq, inv, quiv };
    }

    function buildDeathStatsHtml(player, realmId, escFn) {
        const p = player || {};
        const r = String(realmId || 'angband').toLowerCase();
        const esc = typeof escFn === 'function' ? escFn : (s => String(s ?? ''));
        const getStat = s => (s && typeof s === 'object') ? (s.use || s.top || '10') : (s !== undefined ? s : '10');
        const stats = p.stats || {};
        const cards = [];
        const add = (label, val) => cards.push(`<div class="death-stat-card"><div class="stat-name">${esc(label)}</div><div class="stat-num">${esc(String(val))}</div></div>`);

        if (r === 'silq') {
            add('STRENGTH', getStat(stats.str));
            add('DEXTERITY', getStat(stats.dex));
            add('CONSTITUTION', getStat(stats.con));
            add('GRACE', getStat(stats.gra));
            add('ARMOR', p.ac || 0);
            add('VOICE', `${p.sp || 0}/${p.sp_max || 0}`);
            add('TURNS', p.turns || 1);
            add('DEEPEST', `${(p.max_depth || p.depth || 0) * 50} ft`);
        } else if (r === 'brogue') {
            add('STRENGTH', getStat(stats.str));
            add('ARMOR', p.ac || 0);
            add('NUTRITION', `${p.nutrition || 0}%`);
            add('LUMENSTONES', p.lumenstones || 0);
            add('GOLD', p.gold || 0);
            add('ALLIES', p.allies_count || 0);
            add('TURNS', p.turns || 1);
            add('DEEPEST', `Depth ${p.max_depth || p.depth || 1}`);
        } else if (r === 'dcss') {
            add('STRENGTH', getStat(stats.str));
            add('INTELLIGENCE', getStat(stats.int));
            add('DEXTERITY', getStat(stats.dex));
            add('AC / EV / SH', `${p.ac || 0} / ${p.ev || 10} / ${p.sh || 0}`);
            add('DEITY', p.god || 'No God');
            add('RUNES OF ZOT', `${p.runes || 0} / 3`);
            add('GOLD', p.gold || 0);
            add('BRANCH', p.place_label || `D:${p.depth || 1}`);
        } else {
            add('STRENGTH', getStat(stats.str));
            add('INTELLIGENCE', getStat(stats.int));
            add('WISDOM', getStat(stats.wis));
            add('DEXTERITY', getStat(stats.dex));
            add('CONSTITUTION', getStat(stats.con));
            add('ARMOR CLASS', p.ac ?? 10);
            add(r === 'nethack' ? 'ALIGNMENT' : 'SPEED', r === 'nethack' ? (p.alignment || 'Neutral') : (p.speed || 110));
            add('DEEP LEVEL', `${p.max_depth || p.depth || 0}`);
        }
        return cards.join('');
    }

    function createRandomBirthPlanner(realmId, rngOrPreset) {
        const r = String(realmId || 'angband').toLowerCase();
        const isPreset = typeof rngOrPreset === 'string' && ['melee', 'ranged', 'magic', 'stealth'].includes(rngOrPreset);
        const rng = typeof rngOrPreset === 'function' ? rngOrPreset : () => Math.random();
        const archetypes = ['melee', 'ranged', 'magic', 'stealth'];
        const archetype = isPreset ? rngOrPreset : archetypes[Math.floor(rng() * archetypes.length) % archetypes.length];

        const realmPoolByArchetype = {
            melee: ['a', 'f', 'g', 'j'],
            ranged: ['c', 'f', 'a', 'e'],
            magic: ['b', 'c', 'd', 'e', 'g'],
            stealth: ['e', 'f', 'b', 'c']
        };
        const rPool = realmPoolByArchetype[archetype] || ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const magicRealmKey = rPool[Math.floor(rng() * rPool.length) % rPool.length];

        const persLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
        const p1Idx = Math.floor(rng() * persLetters.length) % persLetters.length;
        const p2Idx = (p1Idx + 1 + (Math.floor(rng() * (persLetters.length - 1)) % (persLetters.length - 1))) % persLetters.length;
        const fcbPersonalityKeys = [persLetters[p1Idx], persLetters[p2Idx]];

        const roleByArchetype = {
            nethack: { melee: 'a', ranged: 'd', magic: 'b', stealth: 'f' },
            dcss: { melee: 'a', ranged: 'c', magic: 'b', stealth: 'd' },
            brogue: { melee: 'a', ranged: 'b', magic: 'c', stealth: 'd' },
            rogue: { melee: 'a', ranged: 'b', magic: 'c', stealth: 'b' }
        };
        const cartridgeRoleKey = (roleByArchetype[r] && roleByArchetype[r][archetype]) || '*';

        // Coherent Sil-Q 30-point stat allocations (Str, Dex, Con, Gra)
        const silqStatsByArchetype = {
            melee: ['6', '6', '6', '2', '6', '6', '6', '2', '6', '6', '6', 'enter'],
            ranged: ['6', '6', '2', '6', '6', '6', '6', '2', '6', '6', '2', '6', 'enter'],
            magic: ['6', '2', '6', '6', '2', '6', '6', '2', '6', '6', '6', '6', 'enter'],
            stealth: ['6', '2', '6', '6', '6', '6', '2', '6', '6', '2', '6', '6', 'enter']
        };
        const silqStatSequence = silqStatsByArchetype[archetype] || silqStatsByArchetype.melee;

        // Coherent Sil-Q starting skill allocations (Melee, Archery, Evasion, Stealth, Perception, Will, Smithing, Song)
        const silqSkillsByArchetype = {
            melee: ['6', '6', '6', '6', '2', '2', '6', '6', '6', '2', '2', '2', '6', '6', 'enter'],
            ranged: ['6', '6', '2', '6', '6', '6', '6', '2', '6', '6', '6', '2', '2', '6', '6', 'enter'],
            magic: ['6', '2', '2', '6', '6', '2', '2', '6', '6', '2', '6', '6', '6', '2', '6', '6', '6', 'enter'],
            stealth: ['6', '6', '2', '2', '6', '6', '6', '2', '6', '6', '6', '6', '2', '6', '6', 'enter']
        };
        const silqSkillSequence = silqSkillsByArchetype[archetype] || silqSkillsByArchetype.melee;

        return {
            realmId: r,
            archetype,
            magicRealmKey,
            fcbPersonalityKeys,
            cartridgeRoleKey,
            silqStatSequence,
            silqSkillSequence
        };
    }

    return {
        CARTRIDGE_SCHEMA_VERSION,
        SUPPORTED_TRANSPORTS,
        MENU_GRAMMAR_ARCHETYPES,
        CARTRIDGES,
        VANILLA_LETTERS,
        NETHACK_SLOTS,
        listRealms,
        getCartridge,
        getActive,
        setActive,
        getCapabilities,
        getHeraldry,
        getThemeTokens,
        applyThemeTokens,
        getEquipmentSlots,
        getExtendedCommands,
        getSlotLetter,
        resolveVerbsForCategory,
        parseBeatitudeBUC,
        compareWithEquipped,
        canMoveDiagonally,
        canTraverseDoorwayDiagonally,
        getFeatureActions,
        getBiomeForDepth,
        getBiomeProfile,
        validateCartridgeManifest,
        registerCartridge,
        registerRealm,
        loadExternalCartridgeJSON,
        formatDeathModalSummary,
        buildDeathStatsHtml,
        createRandomBirthPlanner
    };
});

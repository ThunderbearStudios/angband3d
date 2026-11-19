/**
 * realm-cartridge.js — Universal Dungeon Cartridge Schema v3 & Declarative 9-Realm Engine
 *
 * Provides the single declarative source of truth for all 9 playable realms:
 *   1. Angband 4.2.6 (`angband`) — Forged Blackened Iron & Morgul Gold
 *   2. Sil-Q 1.5+ (`silq`) — First-Age Starlight Silver & Beleriand Slate
 *   3. FrogComposBand 7.1 (`frogcomposband`) — Eldritch Pattern Amethyst & Chaos Gold
 *   4. Hengband 3.0.2 (`hengband`) — Lacquered Vermilion-Obsidian & Shakudo Brass
 *   5. NetHack 3.6.7 (`nethack`) — Subterranean Verdigris Bronze & Gehennom Emerald
 *   6. Dungeon Crawl Stone Soup (`dcss`) — Pantheon & Multi-Branch Zot
 *   7. Brogue CE (`brogue`) — Bioluminescent Caverns & Enchantments
 *   8. Classic Rogue 5.4 (`rogue`) — 1980 Dungeons of Doom
 *   9. Roll Your Own Dungeon (`ryod`) — Infinite Procedural Forge
 *   + Universal Cartridge Schema v3 loader for external roguelikes & custom realms.
 *
 * Architecture:
 *   - Declarative Schema v3 (`statSchema`, `defenseSchema`, `resourceSchema`, `progressionSchema`,
 *     `depthSchema`, `equipmentSlots` + species/avatar overrides, authoritative `verbs`).
 *   - Declarative Menu Grammar Taxonomy (`MENU_GRAMMAR_ARCHETYPES`).
 *   - Bespoke Realm Material Language (`themeTokens` + `applyThemeTokens`).
 *   - Stat-Delta Comparison Engine (`computeStatDelta` / `compareWithEquipped`) supporting
 *     both ascending and descending AC models.
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

    const CARTRIDGE_SCHEMA_VERSION = 3;
    const VANILLA_LETTERS = 'abcdefgimnopqrstuvwxyz';
    const NETHACK_SLOTS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$';
    const SUPPORTED_TRANSPORTS = Object.freeze([
        'pty-ansi-80x24',
        'pty-ansi-bigmap',
        'json-rpc-turn',
        'wasm-worker',
        'godot-ipc'
    ]);

    const STAT_LABELS = Object.freeze({
        str: 'STR',
        int: 'INT',
        wis: 'WIS',
        dex: 'DEX',
        con: 'CON',
        chr: 'CHR',
        cha: 'CHR',
        gra: 'GRA'
    });

    /**
     * Builds a frozen statSchema array (`['str', ...]`) with non-enumerable Schema v3
     * metadata (`fields`, `keys`, `stats`, `format`, `aliases`, `labels`, `count`)
     * so both array-based and object-based consumers work identically.
     */
    function createStatSchema(statKeys, opts = {}) {
        const arr = (Array.isArray(statKeys) ? statKeys : ['str', 'int', 'wis', 'dex', 'con']).slice();
        const aliases = Object.freeze(Object.assign({}, opts.aliases || {}));
        const labels = Object.freeze(Object.assign({}, STAT_LABELS, opts.labels || {}));
        Object.defineProperties(arr, {
            fields:  { value: arr, enumerable: false },
            keys:    { value: arr, enumerable: false },
            stats:   { value: arr, enumerable: false },
            count:   { value: arr.length, enumerable: false },
            format:  { value: opts.format || 'int', enumerable: false },
            aliases: { value: aliases, enumerable: false },
            labels:  { value: labels, enumerable: false }
        });
        return Object.freeze(arr);
    }

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

    const ROGUE_EQUIPMENT_SLOTS = Object.freeze([
        { id: 'mainhand', label: '⚔️ Weapon', slotKey: 'a', categories: ['weapon'] },
        { id: 'body',     label: '🛡️ Armor', slotKey: 'b', categories: ['armor'] },
        { id: 'ring_l',   label: '💍 Left Ring', slotKey: 'c', categories: ['jewelry'] },
        { id: 'ring_r',   label: '💍 Right Ring', slotKey: 'd', categories: ['jewelry'] }
    ]);

    const BROGUE_EQUIPMENT_SLOTS = Object.freeze([
        { id: 'mainhand', label: '⚔️ Weapon', slotKey: 'a', categories: ['weapon'] },
        { id: 'body',     label: '🛡️ Armor', slotKey: 'b', categories: ['armor'] },
        { id: 'ring_l',   label: '💍 Left Ring', slotKey: 'c', categories: ['jewelry'] },
        { id: 'ring_r',   label: '💍 Right Ring', slotKey: 'd', categories: ['jewelry'] }
    ]);

    const DCSS_EQUIPMENT_SLOTS = Object.freeze([
        { id: 'mainhand', label: '⚔️ Weapon', slotKey: 'a', categories: ['weapon', 'ranged'] },
        { id: 'shield',   label: '🛡️ Shield / Offhand', slotKey: 'b', categories: ['armor', 'weapon'] },
        { id: 'quiver',   label: '🏹 Quivered Missile', slotKey: 'c', categories: ['ranged'] },
        { id: 'body',     label: '🛡️ Body Armour', slotKey: 'd', categories: ['armor'] },
        { id: 'cloak',    label: '🧥 Cloak', slotKey: 'e', categories: ['armor'] },
        { id: 'helm',     label: '👑 Helmet', slotKey: 'f', categories: ['armor'] },
        { id: 'gloves',   label: '🧤 Gloves', slotKey: 'g', categories: ['armor'] },
        { id: 'boots',    label: '🥾 Boots', slotKey: 'h', categories: ['armor'] },
        { id: 'amulet',   label: '📿 Amulet', slotKey: 'i', categories: ['jewelry'] },
        { id: 'ring_l',   label: '💍 Left Ring', slotKey: 'j', categories: ['jewelry'] },
        { id: 'ring_r',   label: '💍 Right Ring', slotKey: 'k', categories: ['jewelry'] }
    ]);

    const DCSS_OCTOPODE_SLOTS = Object.freeze([
        { id: 'mainhand', label: '⚔️ Weapon', slotKey: 'a', categories: ['weapon', 'ranged'] },
        { id: 'shield',   label: '🛡️ Shield / Offhand', slotKey: 'b', categories: ['armor', 'weapon'] },
        { id: 'quiver',   label: '🏹 Quivered Missile', slotKey: 'c', categories: ['ranged'] },
        { id: 'amulet',   label: '📿 Amulet', slotKey: 'd', categories: ['jewelry'] },
        { id: 'ring_1',   label: '💍 Tentacle Ring 1', slotKey: 'e', categories: ['jewelry'] },
        { id: 'ring_2',   label: '💍 Tentacle Ring 2', slotKey: 'f', categories: ['jewelry'] },
        { id: 'ring_3',   label: '💍 Tentacle Ring 3', slotKey: 'g', categories: ['jewelry'] },
        { id: 'ring_4',   label: '💍 Tentacle Ring 4', slotKey: 'h', categories: ['jewelry'] },
        { id: 'ring_5',   label: '💍 Tentacle Ring 5', slotKey: 'i', categories: ['jewelry'] },
        { id: 'ring_6',   label: '💍 Tentacle Ring 6', slotKey: 'j', categories: ['jewelry'] },
        { id: 'ring_7',   label: '💍 Tentacle Ring 7', slotKey: 'k', categories: ['jewelry'] },
        { id: 'ring_8',   label: '💍 Tentacle Ring 8', slotKey: 'l', categories: ['jewelry'] }
    ]);

    const RYOD_BEHOLDER_SLOTS = Object.freeze([
        { id: 'mainhand', label: '👁️ Focus / Weapon', slotKey: 'a', categories: ['weapon', 'device'] },
        { id: 'quiver',   label: '🏹 Telekinetic Ammo', slotKey: 'b', categories: ['ranged'] },
        { id: 'amulet',   label: '📿 Amulet', slotKey: 'c', categories: ['jewelry'] },
        { id: 'light',    label: '🕯️ Light / Orb', slotKey: 'd', categories: ['light'] },
        { id: 'cloak',    label: '🧥 Shroud / Cloak', slotKey: 'e', categories: ['armor'] },
        { id: 'helm',     label: '👑 Crown / Diadem', slotKey: 'f', categories: ['armor'] },
        { id: 'ring_1',   label: '💍 Eyestalk Ring 1', slotKey: 'g', categories: ['jewelry'] },
        { id: 'ring_2',   label: '💍 Eyestalk Ring 2', slotKey: 'h', categories: ['jewelry'] },
        { id: 'ring_3',   label: '💍 Eyestalk Ring 3', slotKey: 'i', categories: ['jewelry'] },
        { id: 'ring_4',   label: '💍 Eyestalk Ring 4', slotKey: 'j', categories: ['jewelry'] },
        { id: 'ring_5',   label: '💍 Eyestalk Ring 5', slotKey: 'k', categories: ['jewelry'] },
        { id: 'ring_6',   label: '💍 Eyestalk Ring 6', slotKey: 'l', categories: ['jewelry'] }
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
            statSchema: createStatSchema(['str', 'int', 'wis', 'dex', 'con'], { format: 'disp' }),
            defenseSchema: Object.freeze({ direction: 'ascending', label: 'AC', fields: Object.freeze(['ac', 'ac_base', 'ac_to_a']) }),
            resourceSchema: Object.freeze({ mpLabel: 'SP', hasMana: true }),
            progressionSchema: Object.freeze({ hasLevels: true, hasXp: true, levelLabel: 'Lv', xpLabel: 'EXP' }),
            depthSchema: Object.freeze({ unit: 'ft', feetPerLevel: 50, townLabel: 'Town', style: 'feet' }),
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
                statCount: 5,
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
                equip: { id: 'equip', key: 'e', label: '🛡️ Equipment' },
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
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' },
                rest: { id: 'rest', key: 'R', label: '⏳ Rest' },
                explore: { id: 'explore', key: 'p', label: '🗺️ Auto-Explore' }
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
            statSchema: createStatSchema(['str', 'dex', 'con', 'gra'], { format: 'signed' }),
            defenseSchema: Object.freeze({ direction: 'ascending', label: 'EVN / Prot', fields: Object.freeze(['evn', 'pr_min', 'pr_max']), formatBracket: true }),
            resourceSchema: Object.freeze({ mpLabel: 'Voice', hasMana: true, hasGold: false, dualSong: true }),
            progressionSchema: Object.freeze({ hasLevels: false, hasXp: true, xpLabel: 'XP' }),
            depthSchema: Object.freeze({ unit: 'ft', feetPerLevel: 50, townLabel: 'Gates of Angband', style: 'feet' }),
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
                equip: { id: 'equip', key: 'e', label: '🛡️ Equipment' },
                use: { id: 'use', key: 'u', label: '✨ Use Item' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'u', label: '📜 Read' },
                eat: { id: 'eat', key: 'E', label: '🍞 Eat' },
                aim: { id: 'aim', key: 'a', label: '🪄 Use Staff' },
                zap: { id: 'zap', key: 'p', label: '📯 Sound Horn' },
                use_staff: { id: 'use_staff', key: 'a', label: '🪄 Channel Staff' },
                activate: { id: 'activate', key: 'p', label: '📯 Sound Horn' },
                apply: { id: 'apply', key: 'u', label: '🔨 Craft / Use' },
                sing: { id: 'sing', key: 's', label: '🎵 Sing' },
                abilities: { id: 'abilities', key: 'tab', label: '🌟 Abilities' },
                increaseSkills: { id: 'increaseSkills', key: '@', label: '📈 Increase Skills' },
                forge: { id: 'forge', key: '0', label: '🔨 Forge' },
                smith: { id: 'smith', key: '0', label: '🔨 Smith' },
                fletchery: { id: 'fletchery', key: '-', label: '🏹 Fletchery' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 't', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'x', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm' },
                stealthMode: { id: 'stealthMode', key: 'S', label: '🌑 Stealth Mode' },
                search: { id: 'search', key: 'S', label: '👁️ Stealth Mode' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' },
                rest: { id: 'rest', key: '%', label: '⏳ Rest' }
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
            statSchema: createStatSchema(['str', 'int', 'wis', 'dex', 'con', 'chr'], { format: 'disp', aliases: { cha: 'chr' } }),
            defenseSchema: Object.freeze({ direction: 'ascending', label: 'AC', fields: Object.freeze(['ac', 'ac_base', 'ac_to_a']) }),
            resourceSchema: Object.freeze({ mpLabel: 'SP', hasMana: true }),
            progressionSchema: Object.freeze({ hasLevels: true, hasXp: true, levelLabel: 'Lv', xpLabel: 'EXP' }),
            depthSchema: Object.freeze({ unit: 'ft', feetPerLevel: 50, townLabel: 'Outpost', style: 'feet' }),
            capabilities: {
                inventorySlots: 'a-w',
                maxInventoryVisible: 24,
                hasQuiver: true,
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
                equip: { id: 'equip', key: 'e', label: '🛡️ Equipment' },
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
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' },
                rest: { id: 'rest', key: 'R', label: '⏳ Rest' }
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
            statSchema: createStatSchema(['str', 'int', 'wis', 'dex', 'con', 'chr'], { format: 'disp', aliases: { cha: 'chr' } }),
            defenseSchema: Object.freeze({ direction: 'ascending', label: 'AC', fields: Object.freeze(['ac', 'ac_base', 'ac_to_a']) }),
            resourceSchema: Object.freeze({ mpLabel: 'SP', hasMana: true, mpLabelJp: '魔力' }),
            progressionSchema: Object.freeze({ hasLevels: true, hasXp: true, levelLabel: 'Lv', xpLabel: 'EXP' }),
            depthSchema: Object.freeze({ unit: 'ft', feetPerLevel: 50, townLabel: 'Outpost', style: 'feet' }),
            capabilities: {
                inventorySlots: 'a-w',
                maxInventoryVisible: 24,
                hasQuiver: true,
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
                equip: { id: 'equip', key: 'e', label: '🛡️ Equipment', labelJp: '🛡️ 装備一覧', labelBi: '🛡️ Equipment (装備一覧)' },
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
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up', labelJp: '✋ 拾う', labelBi: '✋ Pick Up (拾)' },
                rest: { id: 'rest', key: 'R', label: '⏳ Rest', labelJp: '⏳ 休憩', labelBi: '⏳ Rest (休憩)' }
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
            statSchema: createStatSchema(['str', 'int', 'wis', 'dex', 'con', 'chr'], { format: 'int', aliases: { cha: 'chr' } }),
            defenseSchema: Object.freeze({ direction: 'descending', label: 'AC', fields: Object.freeze(['ac']) }),
            resourceSchema: Object.freeze({ mpLabel: 'MP', hasMana: true }),
            progressionSchema: Object.freeze({ hasLevels: true, hasXp: true, levelLabel: 'Lv', xpLabel: 'EXP' }),
            depthSchema: Object.freeze({ unit: 'Dlvl', feetPerLevel: 0, prefix: 'Dlvl', style: 'dlvl' }),
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
                equip: { id: 'equip', key: '[', aliases: ['#equip'], label: '🛡️ Equipment' },
                quiver: { id: 'quiver', key: 'Q', label: '🏹 Ready in Quiver' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'e', label: '🍞 Eat' },
                engrave: { id: 'engrave', key: 'E', label: '✒️ Engrave' },
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
                rest: { id: 'rest', key: '.', label: '⏳ Rest' },
                pray: { id: 'pray', key: '#pray', label: '🙏 #pray', isExtended: true },
                dip: { id: 'dip', key: '#dip\n', label: '⛲ #dip', isExtended: true },
                offer: { id: 'offer', key: '#offer', label: '🕯️ #offer', isExtended: true },
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
            equipmentSlots: DCSS_EQUIPMENT_SLOTS,
            slotOverrides: Object.freeze({ octopode: DCSS_OCTOPODE_SLOTS }),
            statSchema: createStatSchema(['str', 'int', 'dex'], { format: 'int' }),
            defenseSchema: Object.freeze({ direction: 'ascending', label: 'AC | EV | SH', fields: Object.freeze(['ac', 'ev', 'sh']) }),
            resourceSchema: Object.freeze({ mpLabel: 'MP', hasMana: true }),
            progressionSchema: Object.freeze({ hasLevels: true, hasXp: true, levelLabel: 'XL', xpLabel: 'XP' }),
            depthSchema: Object.freeze({ unit: ':', feetPerLevel: 0, defaultBranch: 'D', style: 'branch-colon' }),
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
                equip: { id: 'equip', key: 'E', label: '🛡️ Equipment' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'e', label: '🍖 Eat' },
                aim: { id: 'aim', key: 'V', label: '🪄 Evoke Wand' },
                evoke: { id: 'evoke', key: 'V', label: '🪄 Evoke' },
                zap: { id: 'zap', key: 'z', label: '✨ Cast Spell' },
                cast: { id: 'cast', key: 'z', label: '✨ Cast Spell' },
                browse: { id: 'browse', key: 'I', label: '📖 Browse Spells' },
                study: { id: 'study', key: 'M', label: '📚 Spell Library' },
                skills: { id: 'skills', key: 'm', label: '📊 Skills' },
                abilities: { id: 'abilities', key: 'm', label: '📊 Skills / Abilities' },
                power: { id: 'power', key: 'a', label: '🙏 Divine Ability' },
                pray: { id: 'pray', key: 'p', label: '⛩️ Pray at Altar' },
                god: { id: 'god', key: '^', label: '⛩️ God / Piety' },
                mutations: { id: 'mutations', key: 'A', label: '🧬 Mutations' },
                explore: { id: 'explore', key: 'o', label: '🗺️ Auto-Explore' },
                autofight: { id: 'autofight', key: 'tab', label: '⚔️ Auto-Fight' },
                rest: { id: 'rest', key: '5', label: '⏳ Rest' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 'f', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'v', label: '🔍 Examine' },
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
            equipmentSlots: BROGUE_EQUIPMENT_SLOTS,
            statSchema: createStatSchema(['str'], { format: 'int' }),
            defenseSchema: Object.freeze({ direction: 'ascending', label: 'Armor', fields: Object.freeze(['ac']) }),
            resourceSchema: Object.freeze({ hasMana: false, secondaryLabel: 'Nutrition', altLabel: 'Enchantment' }),
            progressionSchema: Object.freeze({ hasLevels: false, hasXp: false }),
            depthSchema: Object.freeze({ unit: 'Depth', feetPerLevel: 0, prefix: 'Depth', style: 'depth' }),
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
                statCount: 1,
                invenMode: 'select'
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT, { restKey: 'z' }),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Equip' },
                wear: { id: 'wear', key: 'w', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 'T', label: '🔓 Remove' },
                equip: { id: 'equip', key: '[', label: '🛡️ Equipment' },
                use: { id: 'use', key: 'a', label: '✨ Apply / Use' },
                apply: { id: 'apply', key: 'a', label: '✨ Apply / Use' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'E', label: '🍖 Eat' },
                aim: { id: 'aim', key: 'a', label: '🪄 Zap Staff' },
                fire: { id: 'fire', key: 't', label: '🎯 Throw' },
                throw: { id: 'throw', key: 't', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'x', label: '🔍 Examine' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' },
                explore: { id: 'explore', key: 'e', label: '🗺️ Auto-Explore' },
                rest: { id: 'rest', key: 'z', label: '⏳ Rest' },
                discoveries: { id: 'discoveries', key: 'D', label: '📖 Discoveries' }
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
            equipmentSlots: ROGUE_EQUIPMENT_SLOTS,
            statSchema: createStatSchema(['str'], { format: 'cur/max' }),
            defenseSchema: Object.freeze({ direction: 'descending', label: 'Arm', fields: Object.freeze(['arm', 'ac']) }),
            resourceSchema: Object.freeze({ hasMana: false, secondaryLabel: 'Nutrition' }),
            progressionSchema: Object.freeze({ hasLevels: true, hasXp: true, levelLabel: 'Lv', xpLabel: 'EXP' }),
            depthSchema: Object.freeze({ unit: 'Level', feetPerLevel: 0, prefix: 'Level', style: 'level' }),
            capabilities: {
                inventorySlots: 'a-z',
                maxInventoryVisible: 26,
                hasQuiver: false,
                beatitudeBUC: false,
                diagonalDoorwayBlocked: true,
                extendedHashCommands: false,
                multiBranchGraph: false,
                hasTown: false,
                hasShops: false,
                statCount: 1,
                invenMode: 'select'
            },
            movement: Object.assign({}, DEFAULT_MOVEMENT, { restKey: '.' }),
            verbs: {
                wield: { id: 'wield', key: 'w', label: '⚔️ Wield' },
                wear: { id: 'wear', key: 'W', label: '🛡️ Wear' },
                takeoff: { id: 'takeoff', key: 'T', label: '🔓 Take Off' },
                puton: { id: 'puton', key: 'P', label: '💍 Put On' },
                remove: { id: 'remove', key: 'R', label: '💍 Remove' },
                equip: { id: 'equip', key: 'E', aliases: [']', '='], label: '🛡️ Equipment' },
                quaff: { id: 'quaff', key: 'q', label: '🧪 Quaff' },
                read: { id: 'read', key: 'r', label: '📜 Read' },
                eat: { id: 'eat', key: 'e', label: '🍖 Eat' },
                aim: { id: 'aim', key: 'z', label: '🪄 Zap Wand/Staff' },
                zap: { id: 'zap', key: 'z', label: '⚡ Zap Wand/Staff' },
                fire: { id: 'fire', key: 't', label: '🏹 Throw / Fire' },
                throw: { id: 'throw', key: 't', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm' },
                discoveries: { id: 'discoveries', key: 'D', label: '📖 Discoveries' },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                id_trap: { id: 'id_trap', key: '^', label: '🪤 Identify Trap' },
                rest: { id: 'rest', key: '.', label: '⏳ Rest' },
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
            slotOverrides: Object.freeze({ beholder: RYOD_BEHOLDER_SLOTS }),
            statSchema: createStatSchema(['str', 'int', 'wis', 'dex', 'con', 'chr'], { format: 'int', aliases: { cha: 'chr' } }),
            defenseSchema: Object.freeze({ direction: 'ascending', label: 'AC', fields: Object.freeze(['ac', 'ac_base', 'ac_to_a']) }),
            resourceSchema: Object.freeze({ mpLabel: 'MP', hasMana: true }),
            progressionSchema: Object.freeze({ hasLevels: true, hasXp: true, levelLabel: 'Lv', xpLabel: 'EXP' }),
            depthSchema: Object.freeze({ unit: 'Branch', feetPerLevel: 0, defaultBranch: 'Branch', style: 'branch-space' }),
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
                equip: { id: 'equip', key: 'e', label: '🛡️ Equipment' },
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
                abilities: { id: 'abilities', key: 'm', label: '✨ Abilities / Magic' },
                study: { id: 'study', key: 'M', label: '📘 Powers' },
                smith: { id: 'smith', key: '0', label: '🔨 Smith / Forge' },
                pet: { id: 'pet', key: 'p', label: '🐾 Pet / Interact' },
                fire: { id: 'fire', key: 'f', label: '🏹 Fire' },
                throw: { id: 'throw', key: 't', label: '🎯 Throw' },
                drop: { id: 'drop', key: 'd', label: '⬇️ Drop' },
                inspect: { id: 'inspect', key: 'I', label: '🔍 Inspect' },
                open: { id: 'open', key: 'o', label: '🚪 Open' },
                close: { id: 'close', key: 'c', label: '🚪 Close' },
                disarm: { id: 'disarm', key: 'D', label: '⚙️ Disarm' },
                search: { id: 'search', key: 's', label: '👁️ Search' },
                pickup: { id: 'pickup', key: 'g', label: '✋ Pick Up' },
                rest: { id: 'rest', key: '.', label: '⏳ Rest' }
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

    function getStatSchema(realm) {
        const c = getCartridge(realm);
        return (c && c.statSchema) || CARTRIDGES.angband.statSchema;
    }

    function getDefenseSchema(realm) {
        const c = getCartridge(realm);
        return (c && c.defenseSchema) || CARTRIDGES.angband.defenseSchema;
    }

    function getResourceSchema(realm) {
        const c = getCartridge(realm);
        return (c && c.resourceSchema) || CARTRIDGES.angband.resourceSchema;
    }

    function getProgressionSchema(realm) {
        const c = getCartridge(realm);
        return (c && c.progressionSchema) || CARTRIDGES.angband.progressionSchema;
    }

    function getDepthSchema(realm) {
        const c = getCartridge(realm);
        return (c && c.depthSchema) || CARTRIDGES.angband.depthSchema;
    }

    function getVerbKey(verbId, realm) {
        const c = getCartridge(realm);
        const entry = c && c.verbs && c.verbs[verbId];
        return entry ? entry.key : null;
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

    function getEquipmentSlots(realm, playerOrOpts) {
        const r = normalizeRealmId(realm);
        const c = getCartridge(r);
        let baseSlots = (c && Array.isArray(c.equipmentSlots)) ? c.equipmentSlots : STANDARD_EQUIPMENT_SLOTS;

        if (playerOrOpts && typeof playerOrOpts === 'object') {
            const raceToken = String(playerOrOpts.race || playerOrOpts.species || playerOrOpts.avatarId || playerOrOpts.originId || '').toLowerCase();
            if (r === 'dcss' && /octopode/.test(raceToken) && c.slotOverrides && Array.isArray(c.slotOverrides.octopode)) {
                baseSlots = c.slotOverrides.octopode;
            } else if (r === 'ryod' && /beholder/.test(raceToken) && c.slotOverrides && Array.isArray(c.slotOverrides.beholder)) {
                baseSlots = c.slotOverrides.beholder;
            }
            if (!playerOrOpts.includeUnsupported) {
                return baseSlots.slice();
            }
        }

        // Preserve >= 12 paperdoll slot invariant when called without player/options context
        if (baseSlots.length >= 12) return baseSlots.slice();
        const usedIds = new Set(baseSlots.map(s => s.id));
        const padded = baseSlots.slice();
        for (const stdSlot of STANDARD_EQUIPMENT_SLOTS) {
            if (padded.length >= 12) break;
            if (!usedIds.has(stdSlot.id)) {
                padded.push(Object.assign({}, stdSlot, { supported: false }));
                usedIds.add(stdSlot.id);
            }
        }
        return padded;
    }

    /**
     * Resolves a stat entry from a player.stats map, supporting `'chr'`/`'cha'` aliasing seamlessly.
     */
    function getStatEntry(statsOrPlayer, statKey) {
        if (!statsOrPlayer || typeof statsOrPlayer !== 'object') return undefined;
        const container = (statsOrPlayer.stats && typeof statsOrPlayer.stats === 'object') ? statsOrPlayer.stats : statsOrPlayer;
        const k = String(statKey || '').toLowerCase();
        if (!k) return undefined;
        if (container[k] !== undefined) return container[k];
        if (k === 'chr' && container.cha !== undefined) return container.cha;
        if (k === 'cha' && container.chr !== undefined) return container.chr;
        if (statsOrPlayer !== container) {
            if (statsOrPlayer[k] !== undefined) return statsOrPlayer[k];
            if (k === 'chr' && statsOrPlayer.cha !== undefined) return statsOrPlayer.cha;
            if (k === 'cha' && statsOrPlayer.chr !== undefined) return statsOrPlayer.chr;
        }
        return undefined;
    }

    /**
     * Formats a single stat entry or looks up `statKey` from a `stats` / `player` object
     * according to the realm's `statSchema` (`disp`, signed `+2`/`0`/`-1`, numeric, or `cur/max`).
     */
    function formatStatValue(statOrStats, realmOrOpts, maybeStatKey) {
        let realm = _activeRealmId;
        let statKey = maybeStatKey || null;
        if (typeof realmOrOpts === 'object' && realmOrOpts !== null) {
            realm = realmOrOpts.realm || _activeRealmId;
            statKey = realmOrOpts.statKey || realmOrOpts.key || statKey;
        } else if (typeof realmOrOpts === 'string') {
            const lowerArg2 = realmOrOpts.trim().toLowerCase();
            const lowerArg3 = typeof maybeStatKey === 'string' ? maybeStatKey.trim().toLowerCase() : '';
            if (lowerArg3 && CARTRIDGES[lowerArg3] && !CARTRIDGES[lowerArg2]) {
                statKey = lowerArg2;
                realm = lowerArg3;
            } else {
                realm = realmOrOpts;
            }
        }

        const r = normalizeRealmId(realm);
        const schema = getStatSchema(r);
        let entry = statOrStats;

        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            const isLeafStat = entry.use !== undefined || entry.disp !== undefined || entry.cur !== undefined ||
                entry.top !== undefined || entry.max !== undefined || entry.val !== undefined || entry.value !== undefined;
            if (!isLeafStat && (statKey || entry.stats)) {
                entry = getStatEntry(entry, statKey || schema[0] || 'str');
            }
        }

        if (entry === null || entry === undefined) return '';
        const fmt = schema.format || 'int';

        if (fmt === 'signed') {
            const raw = (typeof entry === 'object')
                ? (entry.disp !== undefined ? entry.disp : (entry.use !== undefined ? entry.use : (entry.cur !== undefined ? entry.cur : (entry.top !== undefined ? entry.top : entry.max))))
                : entry;
            if (raw === null || raw === undefined || raw === '') return '';
            const n = Number(raw);
            if (Number.isFinite(n)) return n > 0 ? `+${n}` : `${n}`;
            return String(raw);
        }

        if (fmt === 'cur/max') {
            if (typeof entry === 'string') {
                const trimmed = entry.trim();
                if (trimmed.includes('/')) return trimmed;
                if (trimmed !== '' && Number.isFinite(Number(trimmed))) return `${trimmed}/${trimmed}`;
                return trimmed;
            }
            if (typeof entry === 'object') {
                if (entry.disp !== undefined && entry.disp !== null && String(entry.disp).includes('/')) {
                    return String(entry.disp).trim();
                }
                const cur = entry.cur !== undefined ? entry.cur : (entry.use !== undefined ? entry.use : (entry.val !== undefined ? entry.val : (entry.top !== undefined ? entry.top : entry.max)));
                if (cur === undefined || cur === null) return '';
                const max = entry.max !== undefined ? entry.max : (entry.top !== undefined ? entry.top : cur);
                return `${cur}/${max}`;
            }
            return `${entry}/${entry}`;
        }

        const isAngband18 = (r === 'angband' || r === 'frogcomposband' || r === 'hengband');
        const fmtAng18 = (rawStr) => {
            if (!isAngband18) return rawStr;
            const s = String(rawStr).trim();
            if (s.includes('/')) return s;
            if (/^\d+$/.test(s)) {
                const n = parseInt(s, 10);
                if (n > 18) return n >= 118 ? '18/***' : `18/${String(n - 18).padStart(2, '0')}`;
            }
            return rawStr;
        };

        if (typeof entry === 'object') {
            if (entry.disp !== undefined && entry.disp !== null && String(entry.disp).trim() !== '') {
                return fmtAng18(String(entry.disp).trim());
            }
            const val = entry.use !== undefined ? entry.use : (entry.cur !== undefined ? entry.cur : (entry.top !== undefined ? entry.top : (entry.max !== undefined ? entry.max : (entry.val !== undefined ? entry.val : entry.value))));
            return val !== undefined && val !== null ? fmtAng18(String(val)) : '';
        }
        return fmtAng18(String(entry));
    }

    /**
     * Formats player defense readout according to `defenseSchema` across all 9 realms.
     */
    function formatDefenseValue(player, realm) {
        const p = player || {};
        const r = normalizeRealmId(realm);
        const ds = getDefenseSchema(r);

        if (ds.formatBracket || r === 'silq') {
            const evn = p.evn !== undefined ? Number(p.evn) : Number(p.ac || 0);
            const evnStr = evn >= 0 ? `+${evn}` : `${evn}`;
            const prMin = Number(p.pr_min || 0);
            const prMax = Number(p.pr_max || 0);
            return `[${evnStr}, ${prMin}-${prMax}]`;
        }
        if (r === 'dcss') {
            const ac = p.ac !== undefined ? p.ac : 0;
            const ev = p.ev !== undefined ? p.ev : 10;
            const sh = p.sh !== undefined ? p.sh : 0;
            return `${ac} | ${ev} | ${sh}`;
        }
        if (r === 'rogue') {
            const arm = p.arm !== undefined ? p.arm : (p.ac !== undefined ? p.ac : 10);
            return `${arm}`;
        }
        if (r === 'nethack') {
            return `${p.ac !== undefined ? p.ac : 10}`;
        }
        if (r === 'brogue') {
            return `${p.ac !== undefined ? p.ac : 0}`;
        }
        const acTotal = p.ac !== undefined ? p.ac : ((Number(p.ac_base || 0)) + (Number(p.ac_to_a || 0)));
        const acToA = Number(p.ac_to_a || 0);
        return acToA !== 0 ? `${acTotal} (${acToA > 0 ? '+' : ''}${acToA})` : `${acTotal}`;
    }

    /**
     * Formats depth/location string according to `depthSchema` across all 9 realms.
     */
    function formatDepth(depthOrPlayer, realm, branchOrOpts) {
        const isObj = depthOrPlayer && typeof depthOrPlayer === 'object';
        const p = isObj ? depthOrPlayer : null;
        const r = normalizeRealmId(realm || (p && p.realm));
        const ds = getDepthSchema(r);
        const opts = (branchOrOpts && typeof branchOrOpts === 'object') ? branchOrOpts : {};
        const explicitBranch = typeof branchOrOpts === 'string' ? branchOrOpts.trim() : (typeof opts.branch === 'string' ? opts.branch.trim() : '');
        const rawDepth = isObj ? (p.depth !== undefined ? p.depth : p.max_depth) : depthOrPlayer;
        const depth = (rawDepth !== undefined && rawDepth !== null && Number.isFinite(Number(rawDepth))) ? Number(rawDepth) : (ds.style === 'feet' ? 0 : 1);

        if (ds.style === 'dlvl') {
            return `${ds.prefix || 'Dlvl'} ${depth}`;
        }
        if (ds.style === 'branch-colon') {
            let branch = explicitBranch || (p && (p.branch_name || p.branch)) || ds.defaultBranch || 'D';
            if (/^dungeon$/i.test(branch)) branch = 'D';
            return `${branch}:${depth}`;
        }
        if (ds.style === 'level') {
            return `${ds.prefix || 'Level'} ${depth}`;
        }
        if (ds.style === 'depth') {
            return `${ds.prefix || 'Depth'} ${depth}`;
        }
        if (ds.style === 'branch-space') {
            const branch = explicitBranch || (p && (p.branch_name || p.branch)) || ds.defaultBranch || 'Branch';
            return `${branch} ${depth}`;
        }
        const fpl = Number(ds.feetPerLevel) || 50;
        if (depth === 0 && !opts.numericZero) {
            if (p && p.wilderness) return 'Wilderness';
            return ds.townLabel || 'Town';
        }
        return `${depth * fpl} ${ds.unit || 'ft'}`;
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
     * Parses numeric weapon average damage or armor total AC from an item object, description,
     * or metrics string, and computes realm-aware stat delta (`▲ +3 AC`, `▲ +2.5 Dmg`, `▼ -2 AC`)
     * respecting `defenseSchema.direction === 'descending'` (`rogue`, `nethack`).
     */
    function _inferCombatCategory(item, equippedItem) {
        for (const candidate of [item, equippedItem]) {
            if (!candidate || typeof candidate !== 'object') continue;
            const kind = String(candidate.category || candidate.kind || candidate.slot_name || '').toLowerCase();
            if (/^(armor|armour|body|shield|cloak|helm|gloves|boots|shirt|panoply)$/.test(kind)) return 'armor';
            if (/^(weapon|ranged|melee|bow)$/.test(kind)) return kind === 'ranged' ? 'ranged' : 'weapon';
            if (candidate.ac !== undefined || candidate.arm !== undefined || candidate.ac_base !== undefined || candidate.evn !== undefined) {
                return 'armor';
            }
            if (candidate.dmg !== undefined || (candidate.dd !== undefined && candidate.ds !== undefined) || candidate.to_d !== undefined) {
                return 'weapon';
            }
        }
        const txt = [item, equippedItem].map(x => typeof x === 'string' ? x : String((x && (x.stats || x.cleanName || x.desc || x.name)) || '')).join(' ');
        if (/\[[+-]?\d+|\b(?:ac|arm)\s*[:=]?\s*[+-]?\d+\b|\b(plate|mail|leather|cloak|shield|helm|boots|gloves|armor|armour|robe|scale|splint|banded)\b/i.test(txt)) {
            return 'armor';
        }
        return 'weapon';
    }

    function _extractCombatScore(textOrObj, category, realm) {
        if (textOrObj == null) return null;
        if (typeof textOrObj === 'number') return Number.isFinite(textOrObj) ? textOrObj : null;

        const cat = String(category || 'weapon').toLowerCase();
        const r = realm ? normalizeRealmId(realm) : null;
        const ds = r ? getDefenseSchema(r) : null;
        const isDescending = Boolean(cat === 'armor' && ds && ds.direction === 'descending');

        if (typeof textOrObj === 'object') {
            if (cat === 'armor') {
                let baseAc = null;
                if (textOrObj.arm !== undefined && textOrObj.arm !== null) baseAc = Number(textOrObj.arm);
                else if (textOrObj.ac !== undefined && textOrObj.ac !== null) baseAc = Number(textOrObj.ac);
                else if (textOrObj.ac_base !== undefined && textOrObj.ac_base !== null) baseAc = Number(textOrObj.ac_base);
                else if (textOrObj.evn !== undefined && textOrObj.evn !== null) baseAc = Number(textOrObj.evn);
                if (baseAc !== null && Number.isFinite(baseAc)) {
                    const bonus = Number(
                        textOrObj.to_a !== undefined ? textOrObj.to_a :
                            (textOrObj.ac_to_a !== undefined ? textOrObj.ac_to_a :
                                (textOrObj.bonus !== undefined ? textOrObj.bonus : 0))
                    ) || 0;
                    return isDescending ? (baseAc - bonus) : (baseAc + bonus);
                }
            }
            if (cat === 'weapon' || cat === 'ranged') {
                const toDam = Number(textOrObj.to_d !== undefined ? textOrObj.to_d : (textOrObj.bonus !== undefined ? textOrObj.bonus : 0)) || 0;
                if (textOrObj.dd != null && textOrObj.ds != null) {
                    return (Number(textOrObj.dd) || 1) * (((Number(textOrObj.ds) || 1) + 1) / 2) + toDam;
                }
                if (typeof textOrObj.dmg === 'string') {
                    const dm = textOrObj.dmg.match(/(\d+)d(\d+)/);
                    if (dm) return (Number(dm[1]) || 1) * (((Number(dm[2]) || 1) + 1) / 2) + toDam;
                }
                if (typeof textOrObj.dmg === 'number' && Number.isFinite(textOrObj.dmg)) {
                    return textOrObj.dmg + toDam;
                }
            }
        }

        const raw = typeof textOrObj === 'string'
            ? textOrObj
            : String((textOrObj && (textOrObj.stats || textOrObj.cleanName || textOrObj.desc || textOrObj.name)) || '');

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
            const acMatch = raw.match(/\[([+-]?\d+)(?:,\s*([+-]?\d+))?\]/);
            if (acMatch) {
                const base = Number(acMatch[1]) || 0;
                const extra = Number(acMatch[2]) || 0;
                return isDescending ? (base - extra) : (base + extra);
            }
            const namedAc = raw.match(/\b(?:ac|arm)\s*[:=]?\s*([+-]?\d+)\b/i);
            if (namedAc) return Number(namedAc[1]);
            const plusAc = raw.match(/(?:^|\s)([+-]\d+)\s+(?:plate|mail|leather|cloak|shield|helm|boots|gloves|armor|armour)/i);
            if (plusAc) {
                const bonus = Number(plusAc[1]) || 0;
                return isDescending ? (3 - bonus) : (3 + bonus);
            }
            return null;
        }

        return null;
    }

    function computeStatDelta(item, equippedItem, realm, category) {
        const r = normalizeRealmId(realm || _activeRealmId);
        const cat = String(category || _inferCombatCategory(item, equippedItem) || 'weapon').toLowerCase();
        const ds = getDefenseSchema(r);
        const isDescending = Boolean(cat === 'armor' && ds && ds.direction === 'descending');
        const direction = isDescending ? 'descending' : 'ascending';
        const unit = (cat === 'armor') ? 'AC' : 'Dmg';

        const candScore = _extractCombatScore(item, cat, r);
        const eqScore = _extractCombatScore(equippedItem, cat, r);
        if (candScore == null || eqScore == null) {
            return { delta: 0, deltaScore: 0, metric: unit, direction, deltaLabel: '', isUpgrade: false, isDowngrade: false };
        }
        const rawDiff = isDescending ? (eqScore - candScore) : (candScore - eqScore);
        let diff = Number(rawDiff.toFixed(1));
        if (Object.is(diff, -0)) diff = 0;

        if (diff > 0.05) {
            return { delta: diff, deltaScore: diff, metric: unit, direction, deltaLabel: `▲ +${diff} ${unit}`, isUpgrade: true, isDowngrade: false };
        }
        if (diff < -0.05) {
            return { delta: diff, deltaScore: diff, metric: unit, direction, deltaLabel: `▼ ${diff} ${unit}`, isUpgrade: false, isDowngrade: true };
        }
        return { delta: 0, deltaScore: 0, metric: unit, direction, deltaLabel: `= 0 ${unit}`, isUpgrade: false, isDowngrade: false };
    }

    function compareWithEquipped(candidateMetrics, equippedMetrics, category, realm) {
        return computeStatDelta(candidateMetrics, equippedMetrics, realm || 'angband', category || 'weapon');
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
        if (ctx.submenu && ctx.submenu.isSilqAbilityTree) {
            if (ctx.submenu.isSilqAbilityMenu2) {
                return [
                    { id: 'gain', label: '✨ Gain Ability', verb: '__silq_gain__' },
                    { id: 'select', label: '🔍 View Ability', verb: '__silq_select__' }
                ];
            }
            return [{ id: 'select', label: '🌟 View Abilities', verb: '__silq_select__' }];
        }
        if (ctx.submenu && ctx.submenu.isSilqSmithing) {
            return [{ id: 'forge', label: '🔨 Select / Forge', verb: '__silq_select__' }];
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
                { id: 'inspect', label: '🔍 Examine (:)', verb: ':' },
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
            let takeoffKey = 't';
            if (r === 'silq') {
                takeoffKey = 'r';
            } else if (cat === 'jewelry' && cart.verbs && cart.verbs.remove && cart.verbs.remove.key) {
                takeoffKey = cart.verbs.remove.key;
            } else if (r === 'dcss' || r === 'brogue' || r === 'rogue' || r === 'ryod' || r === 'nethack') {
                takeoffKey = (cart.verbs && cart.verbs.takeoff && cart.verbs.takeoff.key) ? cart.verbs.takeoff.key : 'T';
            } else if (cart.verbs && cart.verbs.takeoff && cart.verbs.takeoff.key) {
                takeoffKey = cart.verbs.takeoff.key;
            }

            const eqVerbs = [
                { id: 'takeoff', label: lbl('🛡️ Take Off', '🛡️ 外す', '🛡️ Take Off (外)'), verb: takeoffKey },
                { id: 'activate', label: lbl('🔮 Activate', '🔮 発動', '🔮 Activate (発)'), verb: (r === 'nethack' || r === 'dcss' || r === 'brogue' || r === 'ryod') ? 'a' : 'A' },
                { id: 'inspect', label: lbl('🔍 Inspect', '🔍 調査', '🔍 Inspect (調)'), verb: cart.verbs.inspect ? cart.verbs.inspect.key : 'I' },
                { id: 'inscribe', label: lbl('✍️ Inscribe', '✍️ 銘刻', '✍️ Inscribe (銘)'), verb: '{' }
            ];
            if (cat === 'light') {
                eqVerbs.splice(2, 0, { id: 'refill', label: lbl('🔥 Refill', '🔥 補給', '🔥 Refill (補)'), verb: 'F' });
            }
            return eqVerbs;
        }

        const verbs = [];
        const eatKey = (r === 'dcss' || r === 'rogue' || r === 'nethack') ? 'e' : 'E';
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
        const resolvedStatSchema = Array.isArray(spec.statSchema)
            ? createStatSchema(spec.statSchema, {
                format: (spec.statSchema.format || (base.statSchema && base.statSchema.format) || 'int'),
                aliases: (spec.statSchema.aliases || (base.statSchema && base.statSchema.aliases) || {}),
                labels: (spec.statSchema.labels || (base.statSchema && base.statSchema.labels) || {})
            })
            : (base.statSchema || CARTRIDGES.angband.statSchema);
        CARTRIDGES[key] = Object.assign({}, base, spec, {
            id: key,
            schemaVersion: spec.schemaVersion || CARTRIDGE_SCHEMA_VERSION,
            heraldry: Object.assign({}, base.heraldry, spec.heraldry || {}, { id: key }),
            themeTokens: Object.assign({}, base.themeTokens, spec.themeTokens || {}),
            equipmentSlots: Array.isArray(spec.equipmentSlots) ? spec.equipmentSlots : base.equipmentSlots,
            slotOverrides: spec.slotOverrides ? Object.assign({}, base.slotOverrides || {}, spec.slotOverrides) : base.slotOverrides,
            statSchema: resolvedStatSchema,
            defenseSchema: spec.defenseSchema ? Object.assign({}, base.defenseSchema, spec.defenseSchema) : base.defenseSchema,
            resourceSchema: spec.resourceSchema ? Object.assign({}, base.resourceSchema, spec.resourceSchema) : base.resourceSchema,
            progressionSchema: spec.progressionSchema ? Object.assign({}, base.progressionSchema, spec.progressionSchema) : base.progressionSchema,
            depthSchema: spec.depthSchema ? Object.assign({}, base.depthSchema, spec.depthSchema) : base.depthSchema,
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
        const rawRace = p.race || 'Human';
        const rawClass = p.class || 'Adventurer';
        let race = rawRace;
        let pClass = rawClass;
        if (r === 'hengband' && typeof window !== 'undefined' && (window.__langMode || 'en') !== 'jp') {
            const jpToEn = window.__JP_TERM_TRANSLATIONS || {};
            const ht = window.HengTranslate;
            race = jpToEn[rawRace] || ((ht && typeof ht.translateName === 'function') ? ht.translateName(rawRace, 1, 'en') : rawRace) || rawRace;
            pClass = jpToEn[rawClass] || ((ht && typeof ht.translateName === 'function') ? ht.translateName(rawClass, 1, 'en') : rawClass) || rawClass;
        }
        const level = p.level || 1;
        const depth = p.depth || 0;
        const maxDepth = p.max_depth || depth;
        const gold = p.gold || 0;
        const exp = p.exp || 0;
        const turns = p.turns || f.turn || 1;
        let extractedDiedFrom = p.died_from || p.killed_by || '';
        if (!extractedDiedFrom && f.term && Array.isArray(f.term.rows)) {
            const termJoined = f.term.rows.map(row => (row && row.g) ? row.g : (typeof row === 'string' ? row : '')).join('\n');
            const mTomb = termJoined.match(/(?:Slain|Killed|Destroyed)\s+by\s+([^\n\r.]+?)(?:\s+on\s+\d+|\s+at\s+\d+|\.|\s{2,}|$)/i);
            if (mTomb && mTomb[1]) extractedDiedFrom = mTomb[1].trim();
        }
        if (!extractedDiedFrom && Array.isArray(f.messages)) {
            for (let i = f.messages.length - 1; i >= 0; i--) {
                const msg = String((f.messages[i] && f.messages[i].text) || f.messages[i] || '');
                const mHit = msg.match(/\b([A-Z][a-zA-Z\s'-]{2,28}?)\s+(?:hits|slashes|bites|claws|crushes|burns|freezes|breathes|casts|strikes|stings|gores|smashes|shoots|zaps)\s+you\b/i);
                if (mHit && mHit[1] && !/^(It|Something|You)\b/i.test(mHit[1])) {
                    extractedDiedFrom = mHit[1].trim();
                    break;
                }
            }
        }
        const rawDiedFrom = String(extractedDiedFrom || 'mortal wounds').trim();
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
        const getStat = (s, fallback = '10') => {
            const formatted = formatStatValue(s, r);
            return formatted !== '' ? formatted : fallback;
        };
        const stats = p.stats || {};
        const cards = [];
        const add = (label, val) => cards.push(`<div class="death-stat-card"><div class="stat-name">${esc(label)}</div><div class="stat-num">${esc(String(val))}</div></div>`);

        if (r === 'silq') {
            add('STRENGTH', getStat(stats.str, '0'));
            add('DEXTERITY', getStat(stats.dex, '0'));
            add('CONSTITUTION', getStat(stats.con, '0'));
            add('GRACE', getStat(stats.gra, '0'));
            add('ARMOR', formatDefenseValue(p, 'silq'));
            add('VOICE', `${p.sp || 0}/${p.sp_max || 0}`);
            add('TURNS', p.turns || 1);
            add('DEEPEST', `${(p.max_depth || p.depth || 0) * 50} ft`);
        } else if (r === 'brogue') {
            add('STRENGTH', getStat(stats.str, '12'));
            add('ARMOR', p.ac || 0);
            add('NUTRITION', `${p.nutrition || 0}%`);
            add('LUMENSTONES', p.lumenstones || 0);
            add('GOLD', p.gold || 0);
            add('ALLIES', p.allies_count || 0);
            add('TURNS', p.turns || 1);
            add('DEEPEST', `Depth ${p.max_depth || p.depth || 1}`);
        } else if (r === 'rogue') {
            add('STRENGTH', getStat(stats.str, '16/16'));
            add('ARMOR', p.arm !== undefined ? p.arm : (p.ac ?? 10));
            add('LEVEL', p.level || 1);
            add('EXPERIENCE', p.exp || 0);
            add('GOLD', p.gold || 0);
            add('TURNS', p.turns || 1);
            add('DEEPEST', `Level ${p.max_depth || p.depth || 1}`);
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
            if (r !== 'angband') {
                add('CHARISMA', getStat(getStatEntry(stats, 'chr')));
            }
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

        // Exact Sil-Q 13-point stat allocations (Str, Dex, Con, Gra; triangular costs +1=1, +2=3, +3=6, +4=10 => 6+3+3+1=13)
        const silqStatsByArchetype = {
            melee: ['6', '6', '6', '2', '6', '6', '2', '6', '6', '2', '6', 'enter'],
            ranged: ['6', '2', '6', '6', '6', '2', '6', '6', '2', '6', '6', 'enter'],
            magic: ['6', '6', '2', '6', '6', '2', '6', '2', '6', '6', '6', 'enter'],
            stealth: ['6', '2', '6', '6', '6', '2', '6', '6', '2', '6', '6', 'enter']
        };
        const silqStatSequence = silqStatsByArchetype[archetype] || silqStatsByArchetype.melee;

        // Safe fallback Sil-Q skill sequences (guaranteed <= 1000 XP across all Race+House modifiers)
        const silqSkillsByArchetype = {
            melee: ['6', '6', '2', '2', '6', '6', '2', '2', '2', '6', 'enter'],
            ranged: ['2', '6', '6', '2', '6', '6', '2', '2', '6', 'enter'],
            magic: ['2', '2', '6', '2', '2', '2', '6', '6', '2', '6', '6', 'enter'],
            stealth: ['2', '2', '6', '2', '6', '6', '2', '6', '6', 'enter']
        };
        const silqSkillSequence = silqSkillsByArchetype[archetype] || silqSkillsByArchetype.melee;

        function computeSilqSkillKeys(screenText) {
            const txt = String(screenText || '');
            const skillNames = ['Melee', 'Archery', 'Evasion', 'Stealth', 'Perception', 'Will', 'Smithing', 'Song'];
            const bases = [0, 0, 0, 0, 0, 0, 0, 0];
            for (let i = 0; i < skillNames.length; i++) {
                const reEq = new RegExp(`\\b${skillNames[i]}[^\\n]*?=\\s*(-?\\d+)`, 'i');
                const rePlain = new RegExp(`\\b${skillNames[i]}\\s+(-?\\d+)`, 'i');
                const m = txt.match(reEq) || txt.match(rePlain);
                if (m) bases[i] = parseInt(m[1], 10) || 0;
            }
            const expMatch = txt.match(/(?:Points|Experience)\s+Left\s*:\s*(-?\d+)/i);
            let expLeft = expMatch ? parseInt(expMatch[1], 10) : 5000;
            if (!Number.isFinite(expLeft) || expLeft <= 0) expLeft = 1000;
            const inc = [0, 0, 0, 0, 0, 0, 0, 0];
            const priorityByArchetype = {
                melee: [0, 2, 5, 4, 3, 1, 6, 7],
                ranged: [1, 2, 4, 3, 0, 5, 6, 7],
                magic: [7, 6, 5, 4, 2, 0, 3, 1],
                stealth: [3, 2, 4, 0, 1, 5, 7, 6]
            };
            const prio = priorityByArchetype[archetype] || priorityByArchetype.melee;
            let progress = true;
            while (progress && expLeft >= 100) {
                progress = false;
                for (const idx of prio) {
                    const nextStep = inc[idx] + 1;
                    if (nextStep > 5) continue;
                    const stepCost = Math.max(100, 100 * (bases[idx] + nextStep));
                    if (stepCost <= expLeft) {
                        inc[idx] = nextStep;
                        expLeft -= stepCost;
                        progress = true;
                    }
                }
            }
            const keys = [];
            for (let i = 0; i < 8; i++) {
                for (let c = 0; c < inc[i]; c++) keys.push('6');
                if (i < 7 && inc.slice(i + 1).some(v => v > 0)) keys.push('2');
            }
            keys.push('enter');
            return keys;
        }

        function nextKey(screenText) {
            const st = String(screenText || '').toLowerCase();
            if (st.includes('choose a realm') || st.includes('choose realm') || st.includes('魔法領域') || st.includes('領域を選んで')) {
                return magicRealmKey || 'a';
            }
            if (st.includes('choose your adventurer') || st.includes('choose your role')) {
                return cartridgeRoleKey || '*';
            }
            if (st.includes('enter accept name') || st.includes('tab random name')) {
                return 'tab';
            }
            if (st.includes('accept history') || st.includes('reroll history') || st.includes('accept age/height/weight')) {
                return 'space';
            }
            return '*';
        }

        return {
            realmId: r,
            archetype,
            magicRealmKey,
            fcbPersonalityKeys,
            cartridgeRoleKey,
            silqStatSequence,
            silqSkillSequence,
            computeSilqSkillKeys,
            nextKey
        };
    }

    return {
        CARTRIDGE_SCHEMA_VERSION,
        SUPPORTED_TRANSPORTS,
        MENU_GRAMMAR_ARCHETYPES,
        STAT_LABELS,
        CARTRIDGES,
        VANILLA_LETTERS,
        NETHACK_SLOTS,
        listRealms,
        getCartridge,
        getActive,
        setActive,
        getCapabilities,
        getStatSchema,
        getDefenseSchema,
        getResourceSchema,
        getProgressionSchema,
        getDepthSchema,
        getVerbKey,
        getHeraldry,
        getThemeTokens,
        applyThemeTokens,
        getEquipmentSlots,
        getExtendedCommands,
        getSlotLetter,
        getStatEntry,
        formatStatValue,
        formatDefenseValue,
        formatDepth,
        resolveVerbsForCategory,
        parseBeatitudeBUC,
        computeStatDelta,
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

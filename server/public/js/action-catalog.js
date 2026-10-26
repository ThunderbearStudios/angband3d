(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ActionCatalog = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

        const VERB_BITS = Object.freeze([
        'quaff',      // bit 0  (1)
        'read',       // bit 1  (2)
        'eat',        // bit 2  (4)
        'aim',        // bit 3  (8)
        'use_staff',  // bit 4  (16)
        'zap',        // bit 5  (32)
        'activate',   // bit 6  (64)
        'fire',       // bit 7  (128)
        'throw',      // bit 8  (256)
        'wield',      // bit 9  (512)
        'takeoff',    // bit 10 (1024)
        'drop',       // bit 11 (2048)
        'inscribe',   // bit 12 (4096)
        'uninscribe', // bit 13 (8192)
        'refill',     // bit 14 (16384)
        'browse',     // bit 15 (32768)
        'study',      // bit 16 (65536)
        'cast',       // bit 17 (131072)
        'ignore',     // bit 18 (262144)
        'examine'     // bit 19 (524288)
    ]);

        const RAW_COMMANDS = [
        // =========================================================================
        // Items Group
        // =========================================================================
        { id: 'wield', group: 'items', icon: 'sword', labels: { en: 'Wield / Wear', jp: '装備する' }, synonyms: ['wear', 'equip', 'arm'], keys: { angband: 'w', silq: 'w', frogcomposband: 'w', hengband: 'w' }, target: 'item', itemFilter: 'equipment', primaryFor: ['weapon', 'armour', 'shield', 'ring', 'amulet', 'cloak', 'boots', 'gloves', 'helm', 'crown', 'bow', 'light'], needsIdle: true, atomic: false },
        { id: 'takeoff', group: 'items', icon: 'shield', labels: { en: 'Take Off', jp: '装備をはずす' }, synonyms: ['remove', 'unwield', 'unequip'], keys: { angband: 't', silq: 'r', frogcomposband: 't', hengband: 't' }, target: 'item', itemFilter: 'equipped', primaryFor: [], needsIdle: true, atomic: false },
        { id: 'drop', group: 'items', icon: 'drop', labels: { en: 'Drop', jp: '落とす' }, synonyms: ['discard', 'put_down'], keys: { angband: 'd', silq: 'd', frogcomposband: 'd', hengband: 'd' }, target: 'item', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'ignore', group: 'items', icon: 'trash', labels: { en: 'Ignore / Destroy', jp: '無視/破壊' }, synonyms: ['destroy', 'squelch', 'trash', 'delete'], keys: { angband: 'k', silq: 'k', frogcomposband: 'k', hengband: 'k' }, target: 'item', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'quaff', group: 'items', icon: 'potion', labels: { en: 'Quaff', jp: '飲む' }, synonyms: ['drink', 'potion', 'draught'], keys: { angband: 'q', silq: 'q', frogcomposband: 'q', hengband: 'q' }, target: 'item', itemFilter: 'potion', primaryFor: ['potion'], needsIdle: true, atomic: false },
        { id: 'read', group: 'items', icon: 'scroll', labels: { en: 'Read', jp: '読む' }, synonyms: ['scroll', 'recite'], keys: { angband: 'r', silq: null, frogcomposband: 'r', hengband: 'r' }, target: 'item', itemFilter: 'scroll', primaryFor: ['scroll'], needsIdle: true, atomic: false },
        { id: 'eat', group: 'items', icon: 'food', labels: { en: 'Eat', jp: '食べる' }, synonyms: ['food', 'consume', 'ration', 'mushroom'], keys: { angband: 'E', silq: 'E', frogcomposband: 'E', hengband: 'E' }, target: 'item', itemFilter: 'food', primaryFor: ['food'], needsIdle: true, atomic: false },
        { id: 'aim', group: 'items', icon: 'wand', labels: { en: 'Aim Wand', jp: '振る(魔法棒)' }, synonyms: ['wand', 'shoot_wand'], keys: { angband: 'a', silq: null, frogcomposband: 'a', hengband: 'a' }, target: 'item+dir', itemFilter: 'wand', primaryFor: ['wand'], needsIdle: true, atomic: false },
        { id: 'use_staff', group: 'items', icon: 'staff', labels: { en: 'Use Staff', jp: '使う(杖)' }, synonyms: ['staff', 'strike_staff'], keys: { angband: 'u', silq: 'a', frogcomposband: 'u', hengband: 'u' }, target: 'item', itemFilter: 'staff', primaryFor: ['staff'], needsIdle: true, atomic: false },
        { id: 'zap', group: 'items', icon: 'rod', labels: { en: 'Zap Rod', jp: '使う(ロッド)' }, synonyms: ['rod', 'discharge'], keys: { angband: 'z', silq: null, frogcomposband: 'z', hengband: 'z' }, target: 'item', itemFilter: 'rod', primaryFor: ['rod'], needsIdle: true, atomic: false },
        { id: 'activate', group: 'items', icon: 'activate', labels: { en: 'Activate', jp: '始動する' }, synonyms: ['artifact', 'trigger', 'invoke'], keys: { angband: 'A', silq: null, frogcomposband: 'A', hengband: 'A' }, target: 'item', itemFilter: 'activatable', primaryFor: [], needsIdle: true, atomic: false },
        { id: 'use', group: 'items', icon: 'use', labels: { en: 'Use Item', jp: '使う' }, synonyms: ['item', 'apply'], keys: { angband: 'U', silq: 'u', frogcomposband: null, hengband: null }, target: 'item', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'play_horn', group: 'items', icon: 'horn', labels: { en: 'Play Horn', jp: '角笛を吹く' }, synonyms: ['horn', 'instrument', 'play', 'music'], keys: { angband: null, silq: 'p', frogcomposband: null, hengband: null }, target: 'item', itemFilter: 'horn', primaryFor: ['horn'], needsIdle: true, atomic: false },
        { id: 'fire', group: 'items', icon: 'bow', labels: { en: 'Fire', jp: '射撃' }, synonyms: ['shoot', 'bow', 'arrow', 'quiver', 'missile'], keys: { angband: 'f', silq: 'f', frogcomposband: 'f', hengband: 'f' }, target: 'item+dir', itemFilter: 'bow', primaryFor: ['bow', 'sling', 'crossbow'], needsIdle: true, atomic: false },
        { id: 'throw', group: 'items', icon: 'throw', labels: { en: 'Throw', jp: '投げる' }, synonyms: ['toss', 'hurl', 'launch'], keys: { angband: 'v', silq: 't', frogcomposband: 'v', hengband: 'v' }, target: 'item+dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'inscribe', group: 'items', icon: 'inscribe', labels: { en: 'Inscribe', jp: '銘を刻む' }, synonyms: ['label', 'tag', 'name'], keys: { angband: '{', silq: '{', frogcomposband: '{', hengband: '{' }, target: 'item', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'uninscribe', group: 'items', icon: 'uninscribe', labels: { en: 'Uninscribe', jp: '銘を消す' }, synonyms: ['erase', 'unlabel'], keys: { angband: '}', silq: null, frogcomposband: '}', hengband: '}' }, target: 'item', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'refill', group: 'items', icon: 'lamp', labels: { en: 'Refill Light', jp: '光源を補給' }, synonyms: ['fuel', 'oil', 'lantern', 'torch'], keys: { angband: 'F', silq: null, frogcomposband: 'F', hengband: 'F' }, target: 'item', itemFilter: 'light', primaryFor: [], needsIdle: true, atomic: false },
        { id: 'examine', group: 'items', icon: 'inspect', labels: { en: 'Examine Item', jp: '調べる' }, synonyms: ['inspect', 'identify', 'describe'], keys: { angband: 'I', silq: 'x', frogcomposband: 'I', hengband: 'I' }, target: 'item', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },

        // =========================================================================
        // Magic / Abilities Group
        // =========================================================================
        { id: 'cast', group: 'magic', icon: 'magic', labels: { en: 'Cast Spell', jp: '詠唱' }, synonyms: ['spell', 'pray', 'magic', 'incant'], keys: { angband: 'm', silq: null, frogcomposband: 'm', hengband: 'm' }, target: 'spell', itemFilter: 'book', primaryFor: ['book'], needsIdle: true, atomic: false },
        { id: 'browse', group: 'magic', icon: 'book', labels: { en: 'Browse Book', jp: '閲覧' }, synonyms: ['read_book', 'peruse'], keys: { angband: 'b', silq: null, frogcomposband: 'b', hengband: 'b' }, target: 'item', itemFilter: 'book', primaryFor: [], needsIdle: true, atomic: false },
        { id: 'study', group: 'magic', icon: 'study', labels: { en: 'Study Spells', jp: '学習' }, synonyms: ['learn', 'memorize', 'gain_spells'], keys: { angband: 'G', silq: null, frogcomposband: 'G', hengband: 'G' }, target: 'item', itemFilter: 'book', primaryFor: [], needsIdle: true, atomic: false },
        { id: 'song', group: 'magic', icon: 'music', labels: { en: 'Sing Song', jp: '歌う' }, synonyms: ['sing', 'music', 'chant'], keys: { angband: null, silq: 's', frogcomposband: null, hengband: null }, target: 'menu', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'abilities', group: 'magic', icon: 'tree', labels: { en: 'Abilities / Skills', jp: '能力/技能' }, synonyms: ['skills', 'tree', 'talents'], keys: { angband: null, silq: 'tab', frogcomposband: null, hengband: null }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'smithing', group: 'magic', icon: 'anvil', labels: { en: 'Smithing', jp: '鍛冶' }, synonyms: ['forge', 'craft', 'smith'], keys: { angband: null, silq: '0', frogcomposband: null, hengband: null }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'power', group: 'magic', icon: 'power', labels: { en: 'Use Power', jp: '特殊能力' }, synonyms: ['mutation', 'racial_power', 'class_power'], keys: { angband: null, silq: null, frogcomposband: 'U', hengband: 'U' }, target: 'menu', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'pet', group: 'magic', icon: 'pet', labels: { en: 'Pet / Minion Command', jp: 'ペットへの指示' }, synonyms: ['minion', 'companion', 'summon'], keys: { angband: null, silq: null, frogcomposband: 'p', hengband: 'p' }, target: 'menu', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },

        // =========================================================================
        // Action / Terrain Group
        // =========================================================================
        { id: 'tunnel', group: 'action', icon: 'pickaxe', labels: { en: 'Tunnel', jp: '掘る' }, synonyms: ['dig', 'mine'], keys: { angband: 'T', silq: 'T', frogcomposband: 'T', hengband: 'T' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'open', group: 'action', icon: 'door-open', labels: { en: 'Open Door / Chest', jp: '開ける' }, synonyms: ['door', 'chest', 'unlock'], keys: { angband: 'o', silq: 'o', frogcomposband: 'o', hengband: 'o' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'close', group: 'action', icon: 'door-closed', labels: { en: 'Close Door', jp: '閉める' }, synonyms: ['shut'], keys: { angband: 'c', silq: 'c', frogcomposband: 'c', hengband: 'c' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'bash', group: 'action', icon: 'shield-bash', labels: { en: 'Bash Door', jp: '体当たり' }, synonyms: ['force', 'smash', 'break'], keys: { angband: null, silq: 'b', frogcomposband: 'B', hengband: 'B' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'spike', group: 'action', icon: 'spike', labels: { en: 'Jam / Spike Door', jp: 'くさびを打つ' }, synonyms: ['jam', 'wedge', 'spike'], keys: { angband: null, silq: null, frogcomposband: 'j', hengband: 'j' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'disarm', group: 'action', icon: 'trap', labels: { en: 'Disarm Trap', jp: 'トラップ解除' }, synonyms: ['trap', 'untrap'], keys: { angband: 'D', silq: 'D', frogcomposband: 'D', hengband: 'D' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'alter', group: 'action', icon: 'alter', labels: { en: 'Alter / Attack Feature', jp: '手を加える' }, synonyms: ['modify'], keys: { angband: '+', silq: '/', frogcomposband: '+', hengband: '+' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'exchange', group: 'action', icon: 'exchange', labels: { en: 'Exchange Weapon', jp: '持ち替え' }, synonyms: ['swap', 'switch_weapon'], keys: { angband: null, silq: 'X', frogcomposband: null, hengband: null }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'steal', group: 'action', icon: 'steal', labels: { en: 'Steal', jp: '盗む' }, synonyms: ['pickpocket', 'rob'], keys: { angband: 's', silq: null, frogcomposband: null, hengband: null }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'rest', group: 'action', icon: 'rest', labels: { en: 'Rest', jp: '休憩' }, synonyms: ['sleep', 'heal', 'wait'], keys: { angband: 'R', silq: '%', frogcomposband: 'R', hengband: 'R' }, target: 'prompt', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'pickup', group: 'action', icon: 'pickup', labels: { en: 'Pick Up', jp: '拾う' }, synonyms: ['get', 'take', 'grab'], keys: { angband: 'g', silq: 'g', frogcomposband: 'g', hengband: 'g' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'hold', group: 'action', icon: 'hold', labels: { en: 'Hold / Wait 1 Turn', jp: '待機' }, synonyms: ['stay', 'pass', 'wait'], keys: { angband: ',', silq: 'z', frogcomposband: ',', hengband: ',' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'walk', group: 'action', icon: 'walk', labels: { en: 'Walk / Step', jp: '歩行' }, synonyms: ['step', 'move'], keys: { angband: ';', silq: ';', frogcomposband: ';', hengband: ';' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'run', group: 'action', icon: 'run', labels: { en: 'Run / Dash', jp: '走る' }, synonyms: ['dash', 'sprint'], keys: { angband: '.', silq: '.', frogcomposband: '.', hengband: '.' }, target: 'dir', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'search_mode', group: 'action', icon: 'search', labels: { en: 'Search / Stealth Mode', jp: '探索/隠密モード' }, synonyms: ['stealth', 'stance'], keys: { angband: null, silq: 'S', frogcomposband: 'S', hengband: 'S' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'search', group: 'action', icon: 'search', labels: { en: 'Search Surrounding', jp: '探索' }, synonyms: ['investigate', 'find'], keys: { angband: null, silq: null, frogcomposband: 'S', hengband: 'S' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'explore', group: 'action', icon: 'compass', labels: { en: 'Auto-Explore', jp: '自動探索' }, synonyms: ['autoexplore', 'scout'], keys: { angband: 'p', silq: null, frogcomposband: null, hengband: null }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'travel', group: 'action', icon: 'path', labels: { en: 'Travel / Pathfind', jp: '移動' }, synonyms: ['path', 'navigate', 'goto'], keys: { angband: null, silq: null, frogcomposband: '`', hengband: '`' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'stairs_up', group: 'action', icon: 'stairs-up', labels: { en: 'Go Up Stairs', jp: '階段を昇る' }, synonyms: ['ascend', 'up'], keys: { angband: '<', silq: '<', frogcomposband: '<', hengband: '<' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'stairs_down', group: 'action', icon: 'stairs-down', labels: { en: 'Go Down Stairs', jp: '階段を降りる' }, synonyms: ['descend', 'down'], keys: { angband: '>', silq: '>', frogcomposband: '>', hengband: '>' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'repeat', group: 'action', icon: 'repeat', labels: { en: 'Repeat Previous', jp: '繰り返す' }, synonyms: ['redo', 'again'], keys: { angband: 'n', silq: 'n', frogcomposband: 'n', hengband: 'n' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'count', group: 'action', icon: 'counter', labels: { en: 'Repeat Count Prefix', jp: '回数指定' }, synonyms: ['times', 'multiplier', 'repeat_count'], keys: { angband: '0', silq: 'R', frogcomposband: '0', hengband: '0' }, target: 'prompt', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },

        // =========================================================================
        // Information / Manage Group
        // =========================================================================
        { id: 'inventory', group: 'info', icon: 'pack', labels: { en: 'Inventory', jp: '持ち物一覧' }, synonyms: ['inven', 'pack', 'items', 'bag'], keys: { angband: 'i', silq: 'i', frogcomposband: 'i', hengband: 'i' }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'equipment', group: 'info', icon: 'shield', labels: { en: 'Equipment', jp: '装備品一覧' }, synonyms: ['equip', 'gear', 'worn'], keys: { angband: 'e', silq: 'e', frogcomposband: 'e', hengband: 'e' }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'quiver', group: 'info', icon: 'quiver', labels: { en: 'Quiver', jp: '矢筒' }, synonyms: ['ammo', 'arrows', 'bolts', 'shots'], keys: { angband: '|', silq: null, frogcomposband: null, hengband: null }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'look', group: 'info', icon: 'eye', labels: { en: 'Look / Inspect Target', jp: 'マップ調査' }, synonyms: ['view', 'inspect', 'survey'], keys: { angband: 'l', silq: 'l', frogcomposband: 'l', hengband: 'l' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'target', group: 'info', icon: 'target', labels: { en: 'Target', jp: 'ターゲット' }, synonyms: ['aim', 'reticle', 'lock'], keys: { angband: '*', silq: null, frogcomposband: '*', hengband: '*' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'map', group: 'info', icon: 'map', labels: { en: 'Overview Map', jp: '全体マップ' }, synonyms: ['minimap', 'dungeon_map'], keys: { angband: 'M', silq: 'M', frogcomposband: 'M', hengband: 'M' }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'locate', group: 'info', icon: 'locate', labels: { en: 'Locate Player', jp: '自分を中心' }, synonyms: ['center', 'recenter', 'find_self'], keys: { angband: 'L', silq: 'L', frogcomposband: 'L', hengband: 'L' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: true },
        { id: 'char_sheet', group: 'info', icon: 'character', labels: { en: 'Character Sheet', jp: 'キャラクター情報' }, synonyms: ['status', 'profile', 'stats', 'sheet'], keys: { angband: 'C', silq: '@', frogcomposband: 'C', hengband: 'C' }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'knowledge', group: 'info', icon: 'scroll-knowledge', labels: { en: 'Knowledge Screen', jp: '知識' }, synonyms: ['lore', 'artifacts', 'monsters', 'uniques'], keys: { angband: '~', silq: '~', frogcomposband: '~', hengband: '~' }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'messages', group: 'info', icon: 'chat', labels: { en: 'Message History', jp: 'メッセージ履歴' }, synonyms: ['log', 'history', 'chat'], keys: { angband: 'C-p', silq: 'C-p', frogcomposband: 'C-p', hengband: 'C-p' }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'save', group: 'manage', icon: 'save', labels: { en: 'Save and Exit', jp: 'セーブして終了' }, synonyms: ['quit', 'exit', 'save_game'], keys: { angband: 'C-s', silq: 'C-s', frogcomposband: 'C-s', hengband: 'C-s' }, target: 'none', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'options', group: 'manage', icon: 'gear', labels: { en: 'Game Options', jp: 'オプション設定' }, synonyms: ['settings', 'config', 'preferences'], keys: { angband: '=', silq: 'O', frogcomposband: '=', hengband: '=' }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'help', group: 'manage', icon: 'question', labels: { en: 'Help & Manual', jp: 'ヘルプ' }, synonyms: ['manual', 'guide', 'docs'], keys: { angband: '?', silq: '?', frogcomposband: '?', hengband: '?' }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'command_menu', group: 'manage', icon: 'menu', labels: { en: 'Command Menu', jp: 'コマンドメニュー' }, synonyms: ['menu', 'actions', 'palette'], keys: { angband: 'enter', silq: 'm', frogcomposband: 'enter', hengband: 'enter' }, target: 'menu', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'overland', group: 'info', icon: 'world-map', labels: { en: 'Overland Wilderness Map', jp: '広域マップ' }, synonyms: ['wilderness', 'world', 'overworld'], keys: { angband: null, silq: null, frogcomposband: null, hengband: null }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false },
        { id: 'quests', group: 'info', icon: 'quest', labels: { en: 'Quests & Bounties', jp: '任務/賞金首' }, synonyms: ['bounties', 'missions', 'tasks'], keys: { angband: null, silq: null, frogcomposband: null, hengband: null }, target: 'screen', itemFilter: null, primaryFor: [], needsIdle: true, atomic: false }
    ];

    // Deep freeze command definitions
    const COMMANDS = Object.freeze(RAW_COMMANDS.map(c => {
        return Object.freeze({
            ...c,
            labels: Object.freeze({ ...c.labels }),
            synonyms: Object.freeze(c.synonyms.slice()),
            keys: Object.freeze({ ...c.keys }),
            primaryFor: Object.freeze(c.primaryFor.slice())
        });
    }));

    // Fast indexed maps by id and synonym
    const COMMAND_MAP = new Map();
    const SYNONYM_MAP = new Map();

    for (const cmd of COMMANDS) {
        COMMAND_MAP.set(cmd.id, cmd);
        for (const syn of cmd.synonyms) {
            if (!SYNONYM_MAP.has(syn)) {
                SYNONYM_MAP.set(syn, cmd);
            }
        }
    }

    // Additional canonical aliases for legacy / shorthand compatibility
    const ALIAS_MAP = new Map([
        ['inven', 'inventory'],
        ['equip', 'equipment'],
        ['skills', 'abilities'],
        ['skill', 'abilities'],
        ['remove', 'takeoff'],
        ['destroy', 'ignore'],
        ['sing', 'song']
    ]);

    // Runtime bridge commands state (updated via ingestBridgeCommands without mutating defaults)
    let runtimeVerbBits = null;
    const runtimeAvailable = new Map();

        function get(idOrSynonym) {
        if (!idOrSynonym || typeof idOrSynonym !== 'string') return null;
        const normalized = idOrSynonym.trim().toLowerCase();
        if (COMMAND_MAP.has(normalized)) return COMMAND_MAP.get(normalized);
        if (ALIAS_MAP.has(normalized)) {
            const aliased = ALIAS_MAP.get(normalized);
            if (COMMAND_MAP.has(aliased)) return COMMAND_MAP.get(aliased);
        }
        if (SYNONYM_MAP.has(normalized)) return SYNONYM_MAP.get(normalized);
        return null;
    }

        function keyFor(id, realm) {
        const cmd = get(id);
        if (!cmd) return null;
        const r = realm || 'angband';
        return cmd.keys[r] !== undefined ? cmd.keys[r] : null;
    }

        function fromVanillaKey(vanillaKey, realm) {
        const r = realm || 'angband';
        if (r === 'angband') return vanillaKey;

        // Explicit Sil-Q magic remap: Vanilla 'm' (cast) -> Sil-Q 's' (song)
        if (r === 'silq') {
            if (vanillaKey === 'm') return 's';
            if (vanillaKey === 'v') return 't';
            if (vanillaKey === 'R') return '%';
            if (vanillaKey === 'r') return null;
            if (vanillaKey === 'I') return 'x';
            if (vanillaKey === 'C') return '@';
            if (vanillaKey === '=') return 'O';
            if (vanillaKey === ',') return 'z';
            if (vanillaKey === 'u') return 'a';
            if (vanillaKey === 'U') return 'u';
            if (vanillaKey === 't') return 'r';
        }

        // Search catalog for a command where keys.angband === vanillaKey
        for (const cmd of COMMANDS) {
            if (cmd.keys.angband === vanillaKey) {
                if (cmd.keys[r] !== undefined) {
                    return cmd.keys[r];
                }
            }
        }

        return vanillaKey;
    }

        function listForRealm(realm) {
        const r = realm || 'angband';
        return COMMANDS.filter(cmd => cmd.keys[r] !== null && cmd.keys[r] !== undefined);
    }

        function shadowedByWasd(realm) {
        const r = realm || 'angband';
        const wasdKeys = new Set(['w', 'a', 's', 'd']);
        return COMMANDS.filter(cmd => {
            const k = cmd.keys[r];
            return k !== null && k !== undefined && wasdKeys.has(k);
        });
    }

        function decodeVerbMask(vm, realm) {
        if (typeof vm !== 'number' || !Number.isFinite(vm) || vm === 0) return [];
        const r = realm || 'angband';
        const bits = runtimeVerbBits || VERB_BITS;
        const result = [];

        for (let i = 0; i < bits.length; i++) {
            if ((vm & (1 << i)) !== 0) {
                let verbId = bits[i];
                if (verbId === 'activate' && r === 'silq') {
                    verbId = 'play_horn';
                }
                const cmd = get(verbId);
                if (cmd && cmd.keys[r] !== null && cmd.keys[r] !== undefined) {
                    result.push(cmd);
                }
            }
        }

        return result;
    }

        function validVerbsForItem(item, realm, isEquipped) {
        if (!item || typeof item !== 'object') return [];
        const r = realm || 'angband';

        // 1. Authoritative bridge bitmask
        if (typeof item.vm === 'number' && Number.isFinite(item.vm) && item.vm > 0) {
            return decodeVerbMask(item.vm, r);
        }

        // 2. Client-side heuristic fallback
        const name = (item.name || item.dname || item.label || '').toLowerCase();
        const tval = item.tval || item.type || '';
        const equipped = Boolean(isEquipped || item.equipped || (typeof item.slot === 'number' && item.slot >= 0 && item.slot <= 30));
        const candidateIds = [];

        const isPotion = tval === 75 || tval === 71 || tval === 'potion' || name.includes('potion') || name.includes('draught') || name.includes('flask');
        const isScroll = tval === 70 || tval === 'scroll' || name.includes('scroll') || name.includes('parchment');
        const isFood = tval === 80 || tval === 'food' || name.includes('ration') || name.includes('food') || name.includes('mushroom') || name.includes('bread') || name.includes('wafer') || name.includes('jerky') || name.includes('slime mold');
        const isHorn = tval === 'horn' || name.includes('horn');
        const isWand = tval === 65 || tval === 'wand' || name.includes('wand');
        const isStaff = tval === 55 || tval === 'staff' || name.includes('staff') || name.includes('stave');
        const isRod = tval === 66 || tval === 'rod' || name.includes('rod');
        const isBook = (typeof tval === 'number' && tval >= 90 && tval <= 115) || tval === 'book' || name.includes('book') || name.includes('tome') || name.includes('grimoire') || name.includes('spellbook') || /\[[^\]]+\]/.test(name);
        const isLight = tval === 39 || tval === 40 || name.includes('lantern') || name.includes('torch') || name.includes('light');

        if (isHorn && r === 'silq') {
            candidateIds.push('play_horn', 'throw', 'drop', 'inscribe', 'ignore', 'examine');
        } else if (isPotion) {
            candidateIds.push('quaff', 'throw', 'drop', 'inscribe', 'ignore', 'examine');
        } else if (isScroll) {
            candidateIds.push('read', 'throw', 'drop', 'inscribe', 'ignore', 'examine');
        } else if (isFood) {
            candidateIds.push('eat', 'throw', 'drop', 'inscribe', 'ignore', 'examine');
        } else if (isWand) {
            candidateIds.push('aim', 'throw', 'drop', 'inscribe', 'ignore', 'examine');
        } else if (isStaff) {
            candidateIds.push('use_staff', 'throw', 'drop', 'inscribe', 'ignore', 'examine');
        } else if (isRod) {
            candidateIds.push('zap', 'throw', 'drop', 'inscribe', 'ignore', 'examine');
        } else if (isBook) {
            candidateIds.push('browse', 'study', 'cast', 'drop', 'inscribe', 'ignore', 'examine');
        } else if (equipped) {
            candidateIds.push('takeoff', 'inscribe', 'examine');
            if (item.activate || item.artifact || name.includes('ring') || name.includes('amulet')) {
                candidateIds.push('activate');
            }
        } else {
            candidateIds.push('wield', 'drop', 'throw', 'inscribe', 'ignore', 'examine');
            if (item.activate || item.artifact) {
                candidateIds.push('activate');
            }
        }

        if (isLight) {
            candidateIds.push('refill');
        }

        const seen = new Set();
        const results = [];
        for (const cid of candidateIds) {
            if (seen.has(cid)) continue;
            seen.add(cid);
            const cmd = get(cid);
            if (cmd && cmd.keys[r] !== null && cmd.keys[r] !== undefined) {
                results.push(cmd);
            }
        }

        return results;
    }

        function evaluateActionAvailability(id, frame, realm, context) {
        const cmd = get(id);
        const r = (realm || (frame && frame.realm) || 'angband').toLowerCase();
        if (!cmd || cmd.keys[r] === null || cmd.keys[r] === undefined) {
            return { supported: false, available: false, suggested: false, badge: '', itemSample: null };
        }
        if (runtimeAvailable.has(cmd.id) && !runtimeAvailable.get(cmd.id)) {
            return { supported: true, available: false, suggested: false, badge: '', itemSample: null };
        }
        if (!frame || frame.phase !== 'play') {
            return { supported: true, available: true, suggested: false, badge: '', itemSample: null };
        }

        const p = frame.player || {};
        const inv = Array.isArray(frame.inventory) ? frame.inventory : [];
        const eq = Array.isArray(frame.equipment) ? frame.equipment : [];
        const allItems = inv.concat(eq);

        const matchVerbOnItem = (it, verbId, isEq) => {
            const verbs = validVerbsForItem(it, r, isEq);
            return verbs.some(v => v.id === verbId);
        };
        const findMatchingItems = (verbId, source) => {
            if (source === 'inv') return inv.filter(it => matchVerbOnItem(it, verbId, false));
            if (source === 'eq') return eq.filter(it => matchVerbOnItem(it, verbId, true));
            return inv.filter(it => matchVerbOnItem(it, verbId, false)).concat(eq.filter(it => matchVerbOnItem(it, verbId, true)));
        };

        let available = true;
        let suggested = false;
        let badge = '';
        let itemSample = null;

        const pClass = (p.class || '').toLowerCase();
        const studyCount = typeof p.study_spells === 'number' ? p.study_spells : (typeof p.study === 'number' ? p.study : (typeof p.newSpells === 'number' ? p.newSpells : (typeof p.new_spells === 'number' ? p.new_spells : 0)));
        const canStudyNow = Boolean(studyCount > 0 || p.canStudy || p.studyState === 'can_study' || (Array.isArray(p.statuses) && p.statuses.some(s => /study/i.test(String(s && s.name ? s.name : s)))) || (context && context.canStudyNow));
        const isHungry = Boolean(
            (typeof p.food === 'number' && p.food > 0 && p.food < 1500) ||
            (typeof p.food === 'string' && /hungry|weak|faint|starv/i.test(p.food)) ||
            (typeof p.hunger === 'string' && /hungry|weak|faint|starv/i.test(p.hunger)) ||
            (Array.isArray(p.status) && p.status.some(s => /hungry|weak|faint|starv/i.test(String(s)))) ||
            (Array.isArray(p.statuses) && p.statuses.some(s => /hungry|weak|faint|starv/i.test(String(s && s.name ? s.name : s)))) ||
            (context && context.isHungry)
        );

        switch (cmd.id) {
            case 'quaff':
            case 'read':
            case 'eat':
            case 'aim':
            case 'use_staff':
            case 'zap':
            case 'play_horn':
            case 'wield':
            case 'refill': {
                const matches = findMatchingItems(cmd.id, 'inv');
                available = matches.length > 0;
                itemSample = matches[0] || null;
                if (available) {
                    const totalQty = matches.reduce((sum, it) => sum + (typeof it.qty === 'number' ? it.qty : 1), 0);
                    badge = totalQty > 1 ? `×${totalQty}` : '';
                }
                if (cmd.id === 'eat' && available && isHungry) {
                    suggested = true;
                    badge = '✦ Hungry';
                }
                if (cmd.id === 'quaff' && available && typeof p.hp === 'number' && typeof p.mhp === 'number' && p.mhp > 0 && (p.hp / p.mhp) <= 0.45) {
                    suggested = true;
                }
                break;
            }
            case 'takeoff': {
                const matches = eq.filter(it => it && (it.name || it.dname || it.label));
                available = matches.length > 0;
                itemSample = matches[0] || null;
                break;
            }
            case 'activate': {
                const matches = findMatchingItems('activate', 'all');
                available = matches.length > 0;
                itemSample = matches[0] || null;
                break;
            }
            case 'use': {
                const usableVerbs = ['quaff', 'read', 'eat', 'aim', 'use_staff', 'zap', 'activate', 'play_horn'];
                const matches = allItems.filter((it, idx) => {
                    const isEq = idx >= inv.length;
                    const verbs = validVerbsForItem(it, r, isEq);
                    return verbs.some(v => usableVerbs.includes(v.id));
                });
                available = matches.length > 0;
                itemSample = matches[0] || null;
                break;
            }
            case 'drop':
            case 'ignore':
            case 'inscribe':
            case 'uninscribe':
            case 'examine':
            case 'throw': {
                const matches = inv.length > 0 ? inv : eq.filter(it => it && (it.name || it.dname || it.label));
                available = matches.length > 0;
                itemSample = matches[0] || null;
                break;
            }
            case 'fire': {
                const hasBow = eq.some(it => {
                    if (!it) return false;
                    const nm = (it.name || it.dname || it.label || '').toLowerCase();
                    return it.tval === 19 || nm.includes('bow') || nm.includes('sling') || nm.includes('crossbow') || (typeof it.vm === 'number' && (it.vm & (1 << 7)) !== 0);
                });
                const hasAmmo = inv.some(it => {
                    if (!it) return false;
                    const nm = (it.name || it.dname || it.label || '').toLowerCase();
                    return it.tval === 16 || it.tval === 17 || it.tval === 18 || nm.includes('arrow') || nm.includes('bolt') || nm.includes('shot') || nm.includes('pebble') || (typeof it.vm === 'number' && (it.vm & (1 << 7)) !== 0);
                });
                available = Boolean(hasBow || hasAmmo || (context && context.hasRanged));
                break;
            }
            case 'browse': {
                const books = findMatchingItems('browse', 'inv');
                available = books.length > 0;
                itemSample = books[0] || null;
                break;
            }
            case 'study': {
                const books = findMatchingItems('study', 'inv');
                available = books.length > 0 || canStudyNow;
                itemSample = books[0] || null;
                if (available && canStudyNow) {
                    suggested = true;
                    badge = studyCount > 0 ? `✦ ${studyCount} Ready` : '✦ Study Ready';
                }
                break;
            }
            case 'cast': {
                const books = findMatchingItems('cast', 'inv');
                const isIntrinsicCaster = /mindcrafter|psion|warlock|berserker|mirror|blue[-\s]?mage|imitator|bard|monk|mystic|wild[-\s]?talent|possessor|red[-\s]?mage|samurai|ninja|force[-\s]?trainer/i.test(pClass);
                available = books.length > 0 || isIntrinsicCaster || (typeof p.msp === 'number' && p.msp > 0 && books.length > 0);
                itemSample = books[0] || null;
                break;
            }
            case 'song': {
                available = r === 'silq';
                break;
            }
            case 'smithing': {
                available = r === 'silq' && Boolean((context && context.onForge) || true);
                if (context && context.onForge) {
                    suggested = true;
                    badge = '✦ Forge Here';
                }
                break;
            }
            case 'pickup': {
                const hasFloorItem = Boolean((context && context.hasFloorItem) || (Array.isArray(frame.floor) && frame.floor.length > 0) || (frame.ui && frame.ui.floorItems && frame.ui.floorItems.length > 0));
                available = hasFloorItem || inv.length >= 0;
                if (context && context.hasFloorItem !== undefined) {
                    available = Boolean(context.hasFloorItem);
                }
                if (hasFloorItem) {
                    suggested = true;
                    badge = '✦ On Floor';
                }
                break;
            }
            case 'open': {
                if (context && context.hasClosedDoorOrChest !== undefined) {
                    available = Boolean(context.hasClosedDoorOrChest);
                    if (available) suggested = true;
                }
                break;
            }
            case 'rest': {
                if (typeof p.hp === 'number' && typeof p.mhp === 'number' && p.mhp > 0 && (p.hp / p.mhp) < 0.75 && !(context && context.hasAdjacentMonster)) {
                    suggested = true;
                }
                break;
            }
            default:
                available = true;
                break;
        }

        return { supported: true, available, suggested, badge, itemSample };
    }

        function ingestBridgeCommands(msg) {
        if (!msg || typeof msg !== 'object') return false;
        if (Array.isArray(msg.verbBits)) {
            runtimeVerbBits = Object.freeze(msg.verbBits.slice());
        }
        if (Array.isArray(msg.groups)) {
            for (const grp of msg.groups) {
                if (grp && Array.isArray(grp.cmds)) {
                    for (const c of grp.cmds) {
                        if (c && c.id) {
                            if (c.available !== undefined) {
                                runtimeAvailable.set(c.id, Boolean(c.available));
                            }
                        }
                    }
                }
            }
        }
        return true;
    }

        function isAvailable(id) {
        const cmd = get(id);
        if (!cmd) return false;
        if (runtimeAvailable.has(cmd.id)) {
            return runtimeAvailable.get(cmd.id);
        }
        return true;
    }

    return Object.freeze({
        VERB_BITS,
        COMMANDS,
        get,
        keyFor,
        fromVanillaKey,
        listForRealm,
        shadowedByWasd,
        decodeVerbMask,
        validVerbsForItem,
        evaluateActionAvailability,
        ingestBridgeCommands,
        isAvailable
    });
});

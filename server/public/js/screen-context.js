/**
 * screen-context.js — Pure screen classification for the angband3d web client.
 * Contract: Pure refactor, no DOM, no globals. UMD export.
 * KEYS sets are frozen & asserted by tools/test_screen_context.js (151/151).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ScreenContext = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const KEYS = Object.freeze({
        toolbarFlags: ['inPlay', 'playerFeat', 'isStoreFeat', 'inOverlay', 'hasStoreText', 'isTargeting', 'isItemPrompt', 'isStore'],
        birthFlags: ['isTitleScreen', 'isHengInitialOpt', 'isHengSex', 'isHengRace', 'isHengClass', 'isHengPersonality',
            'isHengRealm', 'isHengStatRoller', 'isHengStatDecide', 'isHengName', 'isHengHistory', 'isHengEmbark',
            'isNamePrompt', 'isHistoryPrompt', 'isStatRoller', 'isBackgroundEdit', 'isReadyPrompt', 'isChoiceMenu',
            'isReviewScreen'],
        promptFlags: ['isYesNoPrompt', 'isQuantityPrompt'],
        storeFlags: ['hasMore', 'isStoreContextMenu', 'isStoreBuy', 'isStoreSell', 'isStoreExamine'],
        itemFlags: ['isSilq', 'isSilqInvenCmd', 'isSilqEquipCmd', 'isSilqWear', 'isSilqRemove', 'isSilqExamine',
            'isSilqDrop', 'isSilqThrow', 'isSilqFire', 'isEquipView', 'isQuiverView'],
        inputTerminalKeyFlags: ['isChoiceMenu', 'isNamePrompt', 'isReviewScreen'],
        classify: ['mode', 'listKind', 'promptKind', 'verbPrompt', 'items', 'inPlay',
            'needsTerminal', 'screenText', 'isItemPrompt', 'isStore', 'isTargeting',
            'isTargetingPrompt', 'isYesNoPrompt', 'isQuantityPrompt', 'isChoiceMenu',
            'isNamePrompt', 'isReviewScreen', 'isMenuOrInteractive', 'isSplashPoem',
            'isPressAnyKey', 'isItemActions', 'isPopupCommandMenu']
    });

    const VARIANT_REGISTRY = {
        angband: { id: 'angband', title: 'Angband 4.2.6', hasTown: true, hasShops: true, statCount: 6, invenMode: 'select', hasPopupCommandMenu: false },
        silq: { id: 'silq', title: 'Sil-Q', hasTown: false, hasShops: false, statCount: 4, invenMode: 'command', hasPopupCommandMenu: false, features: { smithing: true, songs: true, abilityTree: true } },
        frogcomposband: { id: 'frogcomposband', title: 'FrogComposBand', hasTown: true, hasShops: true, statCount: 6, invenMode: 'command', hasPopupCommandMenu: true, features: { wilderness: true, unifiedGearUi: true, powers: true, quests: true } },
        hengband: { id: 'hengband', title: 'Hengband', hasTown: true, hasShops: true, statCount: 6, invenMode: 'command', hasPopupCommandMenu: true, isBilingual: true, features: { wilderness: true, riding: true, magicRealms: true } }
    };

    function registerVariant(id, spec) {
        if (id && spec) VARIANT_REGISTRY[id] = Object.assign({}, VARIANT_REGISTRY.angband, spec, { id });
        return VARIANT_REGISTRY[id];
    }

    function isPopupCommandMenu(screenText) {
        return Boolean(screenText && (/\|\s*>\s*(?:song\/special|action|item|equi|info|save|呪文|行動|道具|装備|情報)/i.test(screenText) || (/\+---+\+/.test(screenText) && /\|\s*>\s*\S+/.test(screenText))));
    }

    function isCharacterSheet(screenText) {
        if (!screenText) return false;
        if (screenText.includes('(character sheet)') || screenText.includes('キャラクター情報') || screenText.includes('character sheet')) return true;
        const hasIdentity = (screenText.includes('name') && (screenText.includes('race') || screenText.includes('house')) && (screenText.includes('sex') || screenText.includes('age') || screenText.includes('house') || screenText.includes('class'))) ||
                            (screenText.includes('名前') && screenText.includes('種族') && screenText.includes('職業'));
        const hasStats = (screenText.includes('str') && screenText.includes('dex') && screenText.includes('con')) ||
                         (screenText.includes('str') && screenText.includes('gra')) ||
                         (screenText.includes('腕力') && screenText.includes('器用'));
        return Boolean(hasIdentity && hasStats);
    }

    function isSpellOrAbilityMenu(screenText) {
        if (!screenText) return false;
        if (/\bname\s+(?:lv|level)\s+(?:mana|cost|sp)\s+fail/i.test(screenText)) return true;
        if (/名前\s+lv\s+(?:mp|魔力)/i.test(screenText)) return true;
        if (/(?:cast|study|browse)\s+which\s+(?:spell|prayer|power|technique|incantation)/i.test(screenText)) return true;
        if (/use\s+which\s+(?:power|ability|racial|technique|mindcraft)/i.test(screenText)) return true;
        if (/sing\s+which\s+song|songs?\s+known|stop\s+singing/i.test(screenText)) return true;
        if (screenText.includes('smithing') && (screenText.includes('weaponsmith') || screenText.includes('armoursmith') || screenText.includes('jeweller') || screenText.includes('mithril'))) return true;
        if (screenText.includes('abilities') && (screenText.includes('stealth') || screenText.includes('evasion') || screenText.includes('archery')) && (screenText.includes('melee') || screenText.includes('will') || screenText.includes('perception'))) return true;
        return false;
    }

    function isKnowledgeOrOptions(screenText) {
        if (!screenText) return false;
        if (/display\s+current\s+knowledge|knowledge\s+menu|known\s+artifacts|known\s+uniques|known\s+objects|現在の知識|既知の/i.test(screenText)) return true;
        if (/options?\s+menu|game[\s-]*play\s+options|interface\s+options|disturbance\s+options|set\s+options|オプション設定/i.test(screenText)) return true;
        if (/please\s+choose\s+one\s+of\s+the\s+following\s+online\s+help|angband\s+help|help\s+system|ヘルプ/i.test(screenText)) return true;
        return false;
    }

    function rawScreenText(frame) {
        return (frame && frame.term && frame.term.rows) ? frame.term.rows.map(r => r.g || '').join('\n') : '';
    }

    function screenTextOf(frame, decode) {
        if (!decode && frame && frame._screenTextLower !== undefined) return frame._screenTextLower;
        if (decode && frame && frame._screenTextDecodedLower !== undefined) return frame._screenTextDecodedLower;
        const raw = rawScreenText(frame);
        const decoded = typeof decode === 'function' ? decode(raw) : raw;
        const res = (raw + '\n' + decoded).toLowerCase();
        if (frame && typeof frame === 'object') {
            if (!decode) frame._screenTextLower = res;
            else frame._screenTextDecodedLower = res;
        }
        return res;
    }

    function playerFeatOf(frame) {
        let playerFeat = 0;
        if (frame && frame.map && frame.map.rows && frame.player) {
            const py = frame.player.y, px = frame.player.x;
            if (frame.map.rows[py] && frame.map.rows[py].f) {
                playerFeat = parseInt(frame.map.rows[py].f.substring(px * 2, px * 2 + 2), 16) || 0;
            }
        }
        return playerFeat;
    }

    function isDirectionalTargetingText(fullText) {
        if (!fullText) return false;
        return ['direction?', 'which direction?', 'aim which direction?', 'target [', 'target:', 'select target',
            '方向?', 'どの方向', 'どちらの方向', '標的:', '照準:', 'ターゲット:'].some(s => fullText.includes(s));
    }

    function needsTerminal(frame, opts) {
        const forceTerminal = Boolean(opts && opts.forceTerminal);
        const decode = opts && opts.decode;
        if (!frame || !frame.player) return true;
        if (frame.phase && frame.phase !== 'play') return true;
        const isDead = Boolean(frame.player.dead || (frame.player.hp !== undefined && frame.player.hp <= 0 && frame.player.hp_max > 0));
        if (isDead) return false;
        if (forceTerminal) return true;
        const ui = frame.ui;
        if (!ui) return false;
        if (ui.context && (ui.context === 'menu' || ui.context === 'birth' || ui.context === 'setup')) return true;
        if ((ui.overlay || 0) > 0) {
            const fullText = screenTextOf(frame, decode);
            if (fullText.includes('low hitpoint warning') || fullText.includes('low hitpoint')) return false;
            return true;
        }
        if (ui.more) return false;
        if (!ui.awaiting_command && !ui.more) {
            const fullText = screenTextOf(frame, decode);
            if (fullText.includes('low hitpoint warning') || fullText.includes('low hitpoint')) return false;
            if (isDirectionalTargetingText(fullText)) return false;
            return true;
        }
        return false;
    }

    function toolbarFlags(frame, screenText, isHeng) {
        screenText = screenText || '';
        const inPlay = Boolean(frame && frame.phase === 'play' && (frame.map || (frame.player && frame.player.name)));
        const playerFeat = playerFeatOf(frame);
        const isStoreFeat = (playerFeat >= 7 && playerFeat <= 14) || (playerFeat >= 0x20 && playerFeat <= 0x28) || (isHeng && playerFeat === 4);
        const inOverlay = Boolean(frame && frame.ui && (frame.ui.overlay || 0) > 0);
        const hasStoreText = ['store inventory', 'home inventory', 'gold remaining', 'purchase which item', 'sell which item',
            'examine which item', '商品の一覧', '雑貨屋', '万屋', '防具屋', '武器屋', '寺院', '錬金術の店', '魔術師の店',
            'ブラック・マーケット', '我が家', '博物館'].some(s => screenText.includes(s)) || (screenText.includes('重さ') && screenText.includes('価格'));
        const isTargeting = inPlay && ['target [', 'target:', 'direction?', 'which direction?', 'select target', 'aim which direction?'].some(s => screenText.includes(s));
        const isItemPrompt = inPlay && !isTargeting && (
            /inventory\s*\|\s*equipment/.test(screenText) ||
            ['select item:', 'inven:', '(inven', '(inventory)', 'inventory |', '| equipment', 'equip:', '(equip', '(equipment)',
            'quiver:', '(quiver', 'choice:', 'which item?', 'which potion?', 'which scroll?', 'which spell?', 'which prayer?',
            'which book?', 'wear/wield which', 'wield which', 'wear which', 'take off which', 'remove which item', 'drop which',
            'throw which', 'fire which', 'shoot which', 'quaff which', 'read which', 'destroy which', 'eat which', 'use which',
            'aim which', 'zap which', 'activate which', 'inscribe which', 'uninscribe which', 'refill which', 'refill with which',
            'fuel with which', 'fuel which', 'browse which', 'cast which', 'study which'].some(s => screenText.includes(s)) ||
            (!hasStoreText && screenText.includes('examine which item')) ||
            (isHeng && !hasStoreText && (
                screenText.includes('持ち物：') || screenText.includes('装備：') ||
                ((screenText.includes('inventory:') || screenText.includes('equipment:') || screenText.includes('(inventory)') || screenText.includes('(equipment)')) && screenText.includes('command:')) ||
                ['どれを装備', 'どれを外しますか', 'どれを落としますか', 'どれを投げますか', 'どれを食べますか', 'どれを使いますか', 'どの杖', 'どのロッド', 'どれを発動', '銘を刻み', '銘を消', 'どの呪文', 'どれを学習'].some(s => screenText.includes(s))
            ))
        );
        const isStore = !isItemPrompt && (hasStoreText || (isStoreFeat && inOverlay));
        return { inPlay, playerFeat, isStoreFeat, inOverlay, hasStoreText, isTargeting, isItemPrompt, isStore };
    }

    function birthFlags(screenText, isHeng) {
        screenText = screenText || '';
        const isTitleScreen = ['when the world is old', 'press any key to continue', 'rephial.org', 'last battle be gathered'].some(s => screenText.includes(s)) &&
            !screenText.includes('character traits') && !screenText.includes('affects stats');

        const isHengInitialOpt = isHeng && (((screenText.includes('smart_learn') && screenText.includes('初期オプション')) ||
            (screenText.includes('esc:終了') && screenText.includes('初期オプション'))));
        const isHengSex = isHeng && screenText.includes('性別を選んで');
        const isHengRace = isHeng && screenText.includes('種族を選んで');
        const isHengClass = isHeng && screenText.includes('職業を選んで');
        const isHengPersonality = isHeng && screenText.includes('性格を選んで');
        const isHengRealm = isHeng && (screenText.includes('魔法領域') || screenText.includes('領域を選んで'));
        const isHengStatRoller = isHeng && (screenText.includes('能力値を抽選') || screenText.includes('最低限得たい能力値'));
        const isHengStatDecide = isHeng && (screenText.includes('この数値に決定') || screenText.includes('次の数値'));
        const isHengName = isHeng && (screenText.includes('名前を入力') || screenText.includes('キャラクターの名前を入力'));
        const isHengHistory = isHeng && (screenText.includes('キャラクターの生い立ち') || screenText.includes('生い立ちを表示'));
        const isHengEmbark = isHeng && (screenText.includes('ゲーム開始') || screenText.includes('冒険に出ますか'));

        const isNamePrompt = isHengName || ['enter a name for your character', 'enter a name', "enter character's name",
            "enter your player's name", 'choose your name'].some(s => screenText.includes(s));

        const isHistoryPrompt = isHengHistory || screenText.includes('accept character history') ||
            (screenText.includes('[y/n]') && !screenText.includes('use as is') && !screenText.includes('to start over'));

        const isStatRoller = isHengStatRoller || ['left/right to modify', 'to modify', 'total cost:', 'point-based',
            'set minimum stats', 'enter for goto next', 'points left'].some(s => screenText.includes(s)) ||
            ((screenText.includes('minimum') && screenText.includes('roller')) || screenText.includes("hit 'r' to reroll") || screenText.includes('previous roll')) ||
            /allocate.*points/i.test(screenText) || /tab.*abilities/i.test(screenText);

        const isBackgroundEdit = isHengHistory || screenText.includes('character background') || screenText.includes('cursor key for move, enter for end');
        const isReadyPrompt = isHengEmbark || screenText.includes('start over, or enter to continue') || screenText.includes("['q'uit, 's'tart over, or enter to continue]");

        const isChoiceMenu = isHengSex || isHengRace || isHengClass || isHengPersonality || isHengRealm ||
            ['choose a race', 'choose race', 'choose a class', 'choose class', 'race affects stats', 'class affects stats',
            'sex affects stats', 'choose sex', 'choose your sex', 'choose character sex', 'choose character race', 'choose character class',
            'choose a personality', 'choose personality', 'personality affects stats', 'choose realm', 'choose a realm',
            'choose first realm', 'choose second realm', 'first realm', 'second realm', 'choose a house', 'choose house',
            'choose character background', 'choose background', 'choose subrace', 'choose a subrace', '*でランダム', '* for random',
            'escで戻る', 'esc to return', 'esc to step back', 'esc:戻る', 'escで前へ'].some(s => screenText.includes(s));

        const isReviewScreen = !isChoiceMenu && !isNamePrompt && !isHistoryPrompt && !isStatRoller && !isBackgroundEdit && !isReadyPrompt &&
            !screenText.includes('character traits') && !screenText.includes('affects stats') &&
            (['to start over', 'any other key to continue', 'use as is', 'accept character', 're-roll', 'r to reroll',
            "'s' to start", "['r'eroll", 'or enter to accept', "reroll, 'h'istory", 'enter to begin play', '能力値決定', '次の数値'].some(s => screenText.includes(s)) ||
            (screenText.includes('enter your starting stats') && screenText.includes('begin play')) ||
            (screenText.includes('best') && screenText.includes('cur exp')));

        return {
            isTitleScreen, isHengInitialOpt, isHengSex, isHengRace, isHengClass, isHengPersonality,
            isHengRealm, isHengStatRoller, isHengStatDecide, isHengName, isHengHistory, isHengEmbark,
            isNamePrompt, isHistoryPrompt, isStatRoller, isBackgroundEdit, isReadyPrompt, isChoiceMenu,
            isReviewScreen
        };
    }

    function promptFlags(screenText) {
        screenText = screenText || '';
        const isYesNoPrompt = ['[y/n]', '(y/n)', 'are you sure', 'really drop', 'really destroy'].some(s => screenText.includes(s));
        const isQuantityPrompt = ['how many', 'quantity', 'how much'].some(s => screenText.includes(s));
        return { isYesNoPrompt, isQuantityPrompt };
    }

    function storeFlags(frame, screenText, isHeng) {
        screenText = screenText || '';
        const hasMore = Boolean(frame && frame.ui && frame.ui.more) || screenText.includes('-more-');
        const isStoreContextMenu = screenText.includes('command for ') ||
            (screenText.includes('(enter to select') && screenText.includes('examine')) || (isHeng && screenText.includes('に対するコマンド'));
        const isStoreBuy = screenText.includes('purchase which item') || screenText.includes('which item to buy') ||
            (isHeng && ['何か買いますか', 'どのアイテムを買いますか', '何を買いますか', '買いますか'].some(s => screenText.includes(s)));
        const isStoreSell = screenText.includes('sell which item') || screenText.includes('which item to sell') ||
            (isHeng && ['どれを売りますか', 'どのアイテムを売りますか', '何を売りますか', '売りますか'].some(s => screenText.includes(s)));
        const isStoreExamine = screenText.includes('examine which item') ||
            (isHeng && ['どれを調べますか', 'どのアイテムを調べますか', '調べますか'].some(s => screenText.includes(s)));
        return { hasMore, isStoreContextMenu, isStoreBuy, isStoreSell, isStoreExamine };
    }

    function itemFlags(screenText, realm) {
        screenText = screenText || '';
        const isSilq = realm === 'silq';
        const isSilqInvenCmd = isSilq && (screenText.includes('(inventory) command:') || screenText.includes('(inven) command:'));
        const isSilqEquipCmd = isSilq && (screenText.includes('(equipment) command:') || screenText.includes('(equip) command:'));
        const isSilqWear = isSilq && (screenText.includes('wear/wield which item') || screenText.includes('wear/wield'));
        const isSilqRemove = isSilq && (screenText.includes('remove which item') || screenText.includes('remove which'));
        const isSilqExamine = isSilq && screenText.includes('examine which item');
        const isSilqDrop = isSilq && (screenText.includes('drop which item') || screenText.includes('drop which'));
        const isSilqThrow = isSilq && (screenText.includes('throw which item') || screenText.includes('throw which'));
        const isSilqFire = isSilq && (screenText.includes('fire which item') || screenText.includes('fire which'));
        const isEquipView = ['equip', '装備品', '装備：', '装備:'].some(s => screenText.includes(s));
        const isQuiverView = ['quiver:', 'quiver', '矢筒:'].some(s => screenText.includes(s));
        return { isSilq, isSilqInvenCmd, isSilqEquipCmd, isSilqWear, isSilqRemove, isSilqExamine, isSilqDrop, isSilqThrow, isSilqFire, isEquipView, isQuiverView };
    }

    function decodeSjis(str, td) {
        if (!str) return '';
        if (/[\u3000-\u9faf\uff01-\uff60]/.test(str)) return str;
        if (td) {
            try {
                const bytes = new Uint8Array(str.length);
                let hasSjisLead = false;
                for (let i = 0; i < str.length; i++) {
                    const b = str.charCodeAt(i) & 0xff;
                    bytes[i] = b;
                    if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)) hasSjisLead = true;
                }
                if (hasSjisLead) return td.decode(bytes);
            } catch (_) { /* fall through to raw */ }
        }
        return str;
    }

    function inputEscapeReview(screenText, inPlay, isReviewActive) {
        screenText = screenText || '';
        return Boolean(isReviewActive || (!inPlay && (['use as is', "'y': use", 'to start over', 'r to reroll', 'reroll',
            "'s' to start", 'accept character', '能力値の決定', 'step back', 'any other key to continue'].some(s => screenText.includes(s)) ||
            (screenText.includes('enter your starting stats') && screenText.includes('begin play')))));
    }

    function inputTerminalKeyFlags(screenText, inPlay, isReviewActive) {
        screenText = screenText || '';
        const isChoiceMenu = !inPlay && ['性別', '種族', '職業', '性格', '魔法領域', '領域を選んで', 'choose sex', 'choose your sex',
            'sex affects stats', 'choose character sex', 'choose a race', 'choose race', 'race affects stats', 'choose character race',
            'choose a class', 'choose class', 'class affects stats', 'choose character class', 'choose a personality',
            'choose personality', 'personality affects stats', 'choose realm', 'choose a realm', 'choose first realm',
            'choose second realm', 'first realm', 'second realm', 'choose a house', 'choose house', 'choose character background',
            'choose background', 'choose subrace', 'choose a subrace', '*でランダム', '* for random', 'escで戻る', 'esc to return',
            'esc to step back', 'esc:戻る', 'escで前へ'].some(s => screenText.includes(s));
        const isNamePrompt = !inPlay && ['名前を入力', "character's name", 'enter a name', 'choose your name'].some(s => screenText.includes(s));
        const isReviewScreen = !isChoiceMenu && !isNamePrompt && !inPlay && (
            Boolean(isReviewActive) || ['use as is', "'y': use", 'to start over', 'r to reroll', 'reroll', "'s' to start",
            'accept character', '能力値決定', '次の数値', 'この数値に決定'].some(s => screenText.includes(s)) ||
            (screenText.includes('enter your starting stats') && screenText.includes('begin play'))
        );
        return { isChoiceMenu, isNamePrompt, isReviewScreen };
    }

    function inputTargetingPrompt(screenText, inPlay) {
        screenText = screenText || '';
        return Boolean(inPlay && ['target [', 'target:', 'direction?', 'which direction?', 'select target', 'aim which direction?'].some(s => screenText.includes(s)));
    }

    function terminalDetectMode(termData, decode) {
        if (!termData || !termData.rows) return 'classic_play';
        const rawText = termData.rows.map(r => r.g || '').join(' ').toLowerCase();
        const decodedText = typeof decode === 'function' ? termData.rows.map(r => decode(r.g || '')).join(' ').toLowerCase() : rawText;
        const fullText = rawText + ' ' + decodedText;
        const bf = birthFlags(fullText, false);
        const isBirth = bf.isTitleScreen || bf.isChoiceMenu || bf.isNamePrompt || bf.isReviewScreen ||
            ['character creation', 'choose a race', 'choose a class', 'tombstone', 'stat roll'].some(s => fullText.includes(s));
        const synthFrame = {
            phase: isBirth ? 'birth' : 'play',
            player: isBirth ? null : { name: 'Player', hp: 10, hp_max: 10 },
            term: termData,
            ui: { awaiting_command: false, more: false, overlay: 0 }
        };
        const model = screenModelOf(synthFrame, 'angband', { decode });
        const legacy = model.legacy, kind = model.prompt.kind;
        if (model.owner === 'birth' || isBirth || legacy.mode === 'birth' || legacy.mode === 'name' || legacy.mode === 'review') return 'birth';
        if (kind === 'store' || legacy.isStore || legacy.mode === 'store') return 'store';
        if (kind === 'target' || kind === 'direction' || legacy.isTargeting || legacy.mode === 'targeting' || legacy.isTargetingPrompt) return 'targeting';
        if (kind === 'item' || kind === 'spell' || legacy.isItemPrompt || legacy.mode === 'item-list' || legacy.isItemActions) return 'item_prompt';
        return 'classic_play';
    }

    let lastSeq = null, lastRealm = null, lastFrameObj = null, lastLang = null, lastDecode = null, cachedClassify = null;

    function extractItems(rows, isHeng, decode) {
        if (!rows || !Array.isArray(rows)) return [];
        const regexes = [
            /(?:^|\s+)\(([a-zA-Z0-9*@?])\)\s+([^\n\r]{1,70})/g,
            /(?:^|\s+)\[([a-zA-Z0-9*@?])\]\s+([^\n\r]{1,70})/g,
            /(?:^|\s+)([a-zA-Z0-9*@?])[\)\.\:\-]\s+([^\n\r]{1,70})/g,
            /(?:^|\s+)(\*)\s*(ランダム|random|Random)/gi
        ];
        const suffixActionRe = /(?:^|\s{2,})(Inspect|Cast|Study|Browse|Aim|Zap|Use|Read|Quaff|Eat|Activate|Fire|Refill|Take off|Equip|Drop All|Drop|Sell|Pick up|Throw|Uninscribe|Inscribe|Unignore|Ignore)\s+\(([a-zA-Z\{\}])\)\s*$/g;
        const seenKeys = new Set(), items = [];
        for (let r = 0; r < rows.length; r++) {
            const rawLine = rows[r].g || '';
            const line = isHeng && typeof decode === 'function' ? decode(rawLine) : rawLine;
            if (isHeng && (line.includes('選んで下さい') || line.includes('初期オプション設定') || line.includes('注意：'))) continue;
            for (const re of regexes) {
                re.lastIndex = 0;
                let m;
                while ((m = re.exec(line)) !== null) {
                    const key = m[1];
                    let label = (m[2] || '').trim(), glyph = null;
                    const gm = label.match(/^([)\]}>~!=?,_/\-\\])\s+(.+)$/);
                    if (gm) { glyph = gm[1]; label = gm[2]; }
                    label = label.replace(/^[^:]{1,20}:\s*/, '').replace(/\s{2,}.*$/, '').replace(/\s+\d+(\.\d+)?\s*(lb|kg|g)$/i, '').replace(/[(\[\{]+$/, '').trim();
                    if (!label || label === '(nothing)' || label.includes('(nothing)') || label === 'なし') continue;
                    if (key && !seenKeys.has(key)) { seenKeys.add(key); items.push({ key, label, glyph, display: `[${key}]` }); }
                }
            }
            suffixActionRe.lastIndex = 0;
            let sm;
            while ((sm = suffixActionRe.exec(line)) !== null) {
                const actionLabel = (sm[1] || '').trim(), actionKey = sm[2];
                if (actionKey && actionLabel && !seenKeys.has(actionKey)) { seenKeys.add(actionKey); items.push({ key: actionKey, label: actionLabel, glyph: null, display: `[${actionKey}]` }); }
            }
        }
        return items;
    }

    function classify(frame, realm, opts) {
        realm = realm || (frame && frame.realm) || 'angband';
        const isHeng = realm === 'hengband';
        const decode = opts && opts.decode;
        const optLang = (opts && opts.lang) || '';
        const optDecode = (opts && opts.decode) ? 1 : 0;

        const isMatch = frame && cachedClassify && !(opts && opts.forceRefresh) && realm === lastRealm &&
            optLang === lastLang && optDecode === lastDecode &&
            (frame === lastFrameObj || (frame.seq !== undefined && lastSeq !== null && frame.seq === lastSeq && (frame.term === lastFrameObj?.term || frame.term?.rows === lastFrameObj?.term?.rows)));
        if (isMatch) return cachedClassify;

        const screenText = screenTextOf(frame, decode);
        const inPlay = Boolean(frame && frame.phase === 'play' && (frame.map || (frame.player && frame.player.name)));
        const nTerm = needsTerminal(frame, opts);
        const tb = toolbarFlags(frame, screenText, isHeng);
        const bf = birthFlags(screenText, isHeng);
        const pf = promptFlags(screenText);
        const isTargetingPrompt = inputTargetingPrompt(screenText, inPlay);
        const isPressAnyKey = ['press any key', '[press any key to continue]', '何かキーを押して'].some(s => screenText.includes(s));
        const isItemActions = screenText.includes('command for ') || (screenText.includes('(enter to select') && screenText.includes('examine')) || (isHeng && screenText.includes('に対するコマンド'));
        const isSplashPoem = Boolean(['into the vast and echoing gloom', 'depths they went alone', 'menace dark enshrined', 'when the world is old and the days of wonder', 'rephial.org', 'last battle be gathered'].some(s => screenText.includes(s)));
        const isPopupCmd = isPopupCommandMenu(screenText);

        let mode = 'terminal';
        if (isPressAnyKey) mode = 'press-any-key';
        else if (tb.isTargeting) mode = 'targeting';
        else if (isItemActions) mode = 'item-actions';
        else if (isPopupCmd) mode = 'popup-menu';
        else if (tb.isStore) mode = 'store';
        else if (pf.isYesNoPrompt) mode = 'yesno';
        else if (pf.isQuantityPrompt) mode = 'quantity';
        else if (tb.isItemPrompt || (realm === 'frogcomposband' && (/inventory\s*\|\s*equipment/.test(screenText) || screenText.includes('inventory |') || screenText.includes('| equipment')))) mode = 'item-list';
        else if (!inPlay) {
            if (bf.isReviewScreen) mode = 'review';
            else if (bf.isNamePrompt) mode = 'name';
            else mode = 'birth';
        } else if (inPlay && !nTerm) mode = 'world';
        else mode = 'terminal';

        let listKind = null;
        if (mode === 'item-list') {
            if ((realm === 'hengband' || isHeng) && ['装備：', 'equipment:', '(equipment)'].some(s => screenText.includes(s))) listKind = 'equip';
            else if ((realm === 'hengband' || isHeng) && ['持ち物：', 'inventory:', '(inventory)'].some(s => screenText.includes(s))) listKind = 'inven';
            else if (['(inventory)', 'inven:', 'inventory |'].some(s => screenText.includes(s)) || (isHeng && screenText.includes('持ち物：'))) listKind = 'inven';
            else if (['(equipment)', 'equip:', '| equipment'].some(s => screenText.includes(s)) || (isHeng && screenText.includes('装備：'))) listKind = 'equip';
            else if (screenText.includes('quiver:') || screenText.includes('quiver')) listKind = 'quiver';
        }

        let promptKind = null;
        if (mode === 'item-list') {
            if (realm === 'silq' && (screenText.includes('(inventory) command:') || screenText.includes('(equipment) command:'))) {
                promptKind = 'command';
            } else if (realm === 'hengband' || isHeng) {
                const hasListHeader = screenText.includes('持ち物：') || screenText.includes('装備：') ||
                    ((['inventory:', 'equipment:', '(inventory)', '(equipment)'].some(s => screenText.includes(s))) && screenText.includes('command:'));
                const hasCommandPrompt = screenText.includes('コマンド:') || screenText.includes('command:');
                if (hasListHeader) {
                    listKind = (screenText.includes('装備：') || screenText.includes('equipment:') || screenText.includes('(equipment)')) ? 'equip' : 'inven';
                    promptKind = hasCommandPrompt ? 'command' : 'select';
                } else promptKind = 'select';
            } else if (realm === 'frogcomposband' && (/inventory\s*\|\s*equipment/.test(screenText) || screenText.includes('inventory |') || screenText.includes('| equipment'))) {
                const cy = (frame && frame.term && typeof frame.term.cy === 'number') ? frame.term.cy : -1;
                const cyRowText = (cy >= 0 && frame.term.rows && frame.term.rows[cy] && frame.term.rows[cy].g) ? frame.term.rows[cy].g.toLowerCase() : '';
                const hasExamine = screenText.includes('examine which item') || cyRowText.includes('examine which item');
                const hasPrompt = !hasExamine && (['choice:', 'quaff', 'read', 'eat', 'wear/wield', 'wield', 'take off', 'drop',
                    'destroy', 'throw', 'shoot', 'zap', 'aim', 'use', 'activate', 'fuel', 'refill', 'inscribe', 'uninscribe', 'identify'].some(s => screenText.includes(s) || cyRowText.includes(s)));
                promptKind = hasPrompt ? 'select' : 'command';
            } else promptKind = 'select';
        }

        let verbPrompt = null;
        if (mode === 'item-list' && promptKind === 'select') {
            const cy = (frame && frame.term && typeof frame.term.cy === 'number') ? frame.term.cy : -1;
            const cyRowText = (cy >= 0 && frame.term.rows && frame.term.rows[cy] && frame.term.rows[cy].g) ? frame.term.rows[cy].g.toLowerCase() : '';
            const check = (s) => screenText.includes(s) || cyRowText.includes(s);

            if (check('wear/wield') || check('wear which') || check('wield which') || check('どれを装備')) verbPrompt = 'wear';
            else if (check('remove which') || check('take off') || check('どれを外しますか')) verbPrompt = 'remove';
            else if (check('drop which') || check('どれを落としますか') || (realm === 'frogcomposband' && check('drop'))) verbPrompt = 'drop';
            else if (check('throw which') || check('どれを投げますか') || (realm === 'frogcomposband' && check('throw'))) verbPrompt = 'throw';
            else if (check('fire which') || check('shoot which') || (realm === 'frogcomposband' && check('shoot'))) verbPrompt = 'fire';
            else if (check('quaff which') || check('どの薬') || (realm === 'frogcomposband' && check('quaff'))) verbPrompt = 'quaff';
            else if (check('read which') || check('どの巻物') || (realm === 'frogcomposband' && check('read'))) verbPrompt = 'read';
            else if (check('examine which') || check('どれを調べますか')) verbPrompt = 'examine';
            else if (check('destroy which') || (realm === 'frogcomposband' && check('destroy'))) verbPrompt = 'destroy';
            else if (check('eat which') || check('どれを食べますか') || (realm === 'frogcomposband' && check('eat'))) verbPrompt = 'eat';
            else if (check('use which') || check('どれを使いますか') || (realm === 'frogcomposband' && check('use'))) verbPrompt = 'use';
            else if (check('aim which') || check('どの杖') || (realm === 'frogcomposband' && check('aim'))) verbPrompt = 'aim';
            else if (check('zap which') || check('どのロッド') || (realm === 'frogcomposband' && check('zap'))) verbPrompt = 'zap';
            else if (check('activate which') || check('どれを発動') || (realm === 'frogcomposband' && check('activate'))) verbPrompt = 'activate';
            else if (check('inscribe which') || check('銘を刻み') || (realm === 'frogcomposband' && check('inscribe'))) verbPrompt = 'inscribe';
            else if (check('uninscribe which') || check('銘を消') || (realm === 'frogcomposband' && check('uninscribe'))) verbPrompt = 'uninscribe';
            else if (check('refill which') || check('refill with which') || check('fuel with which') || (realm === 'frogcomposband' && (check('refill') || check('fuel')))) verbPrompt = 'refill';
            else if (check('cast which') || check('use which book') || check('どの呪文')) verbPrompt = 'cast';
            else if (check('browse which') || check('どの本を')) verbPrompt = 'browse';
            else if (check('study which') || check('どれを学習')) verbPrompt = 'study';
            else if (realm === 'frogcomposband' && check('identify')) verbPrompt = 'identify';
            else if (realm === 'frogcomposband' && check('choice:')) verbPrompt = 'select';
        }

        const items = (mode === 'item-list' || mode === 'item-actions' || mode === 'store' || mode === 'birth' || mode === 'review')
            ? extractItems(frame && frame.term ? frame.term.rows : [], isHeng, decode) : [];

        const isMenuOrInteractive = Boolean(mode === 'item-list' || mode === 'item-actions' || mode === 'popup-menu' || mode === 'store' ||
            mode === 'birth' || mode === 'review' || mode === 'name' || mode === 'yesno' || mode === 'quantity' || mode === 'press-any-key');

        const result = {
            mode, listKind, promptKind, verbPrompt, items, inPlay,
            needsTerminal: nTerm, screenText, isItemPrompt: tb.isItemPrompt,
            isStore: tb.isStore, isTargeting: tb.isTargeting, isTargetingPrompt,
            isYesNoPrompt: pf.isYesNoPrompt, isQuantityPrompt: pf.isQuantityPrompt,
            isChoiceMenu: bf.isChoiceMenu, isNamePrompt: bf.isNamePrompt,
            isReviewScreen: bf.isReviewScreen, isMenuOrInteractive, isSplashPoem,
            isPressAnyKey, isItemActions, isPopupCommandMenu: isPopupCmd
        };

        if (frame) {
            lastSeq = frame.seq !== undefined ? frame.seq : null;
            lastFrameObj = frame;
            lastRealm = realm;
            lastLang = optLang;
            lastDecode = optDecode;
            cachedClassify = result;
        }
        return result;
    }

    function resolveScreenModelItems(frame, legacy) {
        const player = frame && frame.player;
        const inv = (player && Array.isArray(player.inventory)) ? player.inventory : [];
        const eq = (player && Array.isArray(player.equipment)) ? player.equipment : [];
        const quiv = (player && Array.isArray(player.quiver)) ? player.quiver : [];
        const playerItems = [...inv, ...eq, ...quiv];
        const hasPlayerLists = Boolean(player && (Array.isArray(player.inventory) || Array.isArray(player.equipment) || Array.isArray(player.quiver)));
        const itemRows = (legacy && (legacy.itemRows || legacy.items)) || [];
        if (!itemRows.length) return [];
        if (hasPlayerLists) {
            const result = [];
            for (const row of itemRows) {
                const rowKey = String(row.key || '').toLowerCase(), rowLabel = String(row.label || '').toLowerCase();
                const match = playerItems.find(p => {
                    const pLetter = String(p.letter || p.label || '').toLowerCase();
                    if (pLetter && pLetter === rowKey) return true;
                    if (p.name && rowLabel) {
                        const pName = String(p.name).toLowerCase();
                        if (rowLabel.includes(pName) || pName.includes(rowLabel)) return true;
                    }
                    return false;
                });
                if (match) {
                    result.push(Object.assign({}, match, {
                        key: row.key, letter: row.key, rowLabel: row.label,
                        glyph: row.glyph || match.glyph || null, display: row.display || `[${row.key}]`
                    }));
                }
            }
            return result;
        }
        return itemRows.map(r => ({ key: r.key, letter: r.key, name: r.label, label: r.label, glyph: r.glyph || null, display: r.display || `[${r.key}]` }));
    }

    function derivePromptFromScraper(frame, realm, legacy, opts) {
        const rows = (frame && frame.term && Array.isArray(frame.term.rows)) ? frame.term.rows : [];
        const decode = opts && opts.decode;
        const rawRow0 = (rows[0] && rows[0].g) ? rows[0].g : '';
        const row0 = (typeof decode === 'function' ? decode(rawRow0) : rawRow0).trim();
        const row0Lower = row0.toLowerCase();

        const cy = (frame && frame.term && typeof frame.term.cy === 'number') ? frame.term.cy : -1;
        const rawCyRow = (cy >= 0 && cy < rows.length && rows[cy] && rows[cy].g) ? rows[cy].g : '';
        const cyRow = (typeof decode === 'function' ? decode(rawCyRow) : rawCyRow).trim();
        const cyRowLower = cyRow.toLowerCase();

        const isFCB = realm === 'frogcomposband';
        const hasCyPrompt = isFCB && cy > 0 && cyRow.length > 0 && (['choice:', 'examine which item', 'quaff', 'read', 'eat',
            'wear', 'wield', 'take off', 'drop', 'destroy', 'throw', 'shoot', 'zap', 'aim', 'use', 'activate', 'identify'].some(s => cyRowLower.includes(s)));
        let activeText = hasCyPrompt ? cyRow : row0;
        if (hasCyPrompt) activeText = activeText.replace(/\s{2,}[A-Z]{2,4}\s*:\s*\S.*$/i, '').trim();
        const activeLower = activeText.toLowerCase();
        const inPlay = Boolean(legacy && legacy.inPlay);
        const ui = (frame && frame.ui) || {};

        let kind = 'unknown', text = activeText, verb = legacy ? legacy.verbPrompt : null;

        if (Boolean(ui.more) || (legacy && legacy.isPressAnyKey) || row0Lower.includes('-more-') || cyRowLower.includes('-more-')) {
            kind = 'more'; text = row0 || '-more-'; verb = null;
        } else if ((legacy && (legacy.isTargeting || legacy.isTargetingPrompt || legacy.mode === 'targeting')) ||
                   /(?:target\s*\[|target:|select target|target mode|choose target|ターゲット|照準)/i.test(activeLower) || activeLower.startsWith('target')) {
            kind = 'target'; verb = null;
        } else if (/(?:direction\?|which direction\?|aim which direction\?|どの方向|方向\?)/i.test(activeLower)) {
            kind = 'direction'; verb = null;
        } else if ((legacy && (legacy.isYesNoPrompt || legacy.mode === 'yesno')) ||
                   /\[y\/n\]|\(y\/n\)|y\/n\?|really\s+(?:drop|destroy)|are you sure|よろしいですか/i.test(activeLower)) {
            kind = 'yesno'; verb = null;
        } else if (/^(?:repeat\s+count|count)\b|:\s*count\b/i.test(activeLower)) {
            kind = 'count'; verb = null;
        } else if ((legacy && (legacy.isQuantityPrompt || legacy.mode === 'quantity')) || /(?:how\s+many|quantity|how\s+much|何個)/i.test(activeLower)) {
            kind = 'quantity'; verb = null;
        } else if ((legacy && (legacy.isItemActions || legacy.isPopupCommandMenu || legacy.isChoiceMenu || legacy.isReviewScreen || legacy.mode === 'item-actions' || legacy.mode === 'popup-menu')) ||
                   row0Lower.includes('command for ') || row0Lower.includes('に対するコマンド')) {
            kind = 'menu'; verb = null;
        } else if (legacy && (legacy.isStore || legacy.mode === 'store')) {
            kind = 'store'; verb = null;
        } else if (isSpellOrAbilityMenu(legacy ? legacy.screenText : '') ||
                   /(?:cast|study|browse)\s+which|(?:use|sing)\s+which|which\s+(?:spell|prayer|book|power)|どの(?:魔法|呪文|本)/i.test(activeLower)) {
            kind = 'spell'; verb = verb || 'cast';
        } else if ((legacy && legacy.mode === 'item-list' && legacy.promptKind === 'select') ||
                   (legacy && legacy.isItemPrompt && legacy.promptKind === 'select') ||
                   /(?:select\s+item|which\s+(?:item|potion|scroll|book|weapon|armour|wand|staff|rod)|wear\/wield\s+which|wear\s+which|wield\s+which|take\s+off|remove\s+which|drop\s+which|throw\s+which|fire\s+which|shoot\s+which|quaff\s+which|read\s+which|eat\s+which|destroy\s+which|examine\s+which|choice:)/i.test(activeLower)) {
            kind = 'item'; verb = legacy ? legacy.verbPrompt : null;
        } else if ((legacy && (legacy.isNamePrompt || legacy.mode === 'name')) ||
                   /(?:enter\s+(?:a\s+)?name|enter\s+name|character's\s+name|inscribe\b|inscription|file\s+name|名前を入力)/i.test(activeLower)) {
            kind = 'string'; verb = null;
        } else if ((inPlay && ui.awaiting_command && !ui.more && (ui.overlay || 0) === 0) || (legacy && legacy.promptKind === 'command') || activeLower.includes('command:') || activeLower.includes('コマンド:')) {
            kind = 'command'; verb = null;
        } else {
            kind = 'unknown';
        }
        return { kind, text, verb, src: 'scraper' };
    }

    let smLastSeq = null, smLastFrameObj = null, smLastRealm = null, smLastLang = null, smLastDecode = null, smLastMirror3d = null, smLastForceTerminal = null, cachedScreenModel = null;

    function screenModelOf(frame, realm, opts) {
        if (realm && typeof realm === 'object' && !opts) { opts = realm; realm = (frame && frame.realm) || 'angband'; }
        realm = realm || (frame && frame.realm) || 'angband';
        opts = opts || {};
        const optLang = opts.lang || '', optDecode = Boolean(opts.decode), optMirror3d = Boolean(opts.mirror3d), optForceTerminal = Boolean(opts.forceTerminal);

        const isMatch = frame && cachedScreenModel && !opts.forceRefresh &&
            realm === smLastRealm && optLang === smLastLang && optDecode === smLastDecode &&
            optMirror3d === smLastMirror3d && optForceTerminal === smLastForceTerminal &&
            (frame === smLastFrameObj || (frame.seq !== undefined && smLastSeq !== null && frame.seq === smLastSeq && (frame.term === smLastFrameObj?.term || frame.term?.rows === smLastFrameObj?.term?.rows)));
        if (isMatch) return cachedScreenModel;

        const legacy = classify(frame, realm, opts);
        let prompt;
        const bp = frame && frame.ui && frame.ui.prompt;
        if (bp && bp.kind) {
            prompt = { kind: bp.kind, text: bp.text !== undefined ? bp.text : '', verb: bp.verb !== undefined ? bp.verb : null, src: bp.src || 'hook' };
            if (bp.slot !== undefined) prompt.slot = bp.slot;
        } else {
            prompt = derivePromptFromScraper(frame, realm, legacy, opts);
        }

        const inPlay = Boolean(legacy && legacy.inPlay), player = frame && frame.player, ui = (frame && frame.ui) || {}, overlay = ui.overlay || 0;
        const isDead = Boolean((legacy && legacy.mode === 'death') || (player && (player.dead || (player.hp !== undefined && player.hp <= 0 && player.hp_max > 0))));
        const isBirth = Boolean(!frame || !player || (frame.phase && frame.phase === 'birth') || (legacy && (legacy.mode === 'birth' || legacy.mode === 'name' || legacy.mode === 'review')) || (frame.phase && frame.phase !== 'play' && !isDead));

        const rows = (frame && frame.term && Array.isArray(frame.term.rows)) ? frame.term.rows : [];
        const decode = opts && opts.decode, rawRow0 = (rows[0] && rows[0].g) ? rows[0].g : '';
        const row0 = (typeof decode === 'function' ? decode(rawRow0) : rawRow0).trim(), row0Lower = row0.toLowerCase();

        const isDirTargeting = Boolean((legacy && legacy.isDirectionalTargeting) || isDirectionalTargetingText(legacy ? legacy.screenText : '') ||
            prompt.kind === 'direction' || prompt.kind === 'target' || (legacy && (legacy.isTargeting || legacy.isTargetingPrompt)));

        let mirror = null;
        if (inPlay && !isDead && !isBirth) {
            if (ui.more && overlay === 0) mirror = 'more';
            else if (isDirTargeting) mirror = 'direction';
            else if (optMirror3d) {
                if (prompt.kind === 'yesno') mirror = 'yesno';
                else if (prompt.kind === 'quantity') mirror = 'quantity';
                else if (prompt.kind === 'count') mirror = 'count';
                else if (prompt.kind === 'item' || (legacy && legacy.mode === 'item-list' && legacy.promptKind === 'select')) mirror = 'item';
                else if (prompt.kind === 'menu' && (row0Lower.includes('command for ') || prompt.text.toLowerCase().includes('command for '))) mirror = 'item-menu';
                else if (prompt.kind === 'spell' && (Boolean(frame && frame.spells) || Boolean(opts && opts.hasBridgeSpells))) mirror = 'spell';
            }
        }

        let owner;
        if (isBirth) owner = 'birth';
        else if (isDead) owner = 'dead';
        else if (inPlay && ui.awaiting_command && !ui.more && overlay === 0 && prompt.kind === 'command') owner = 'engine-idle';
        else if (inPlay && mirror !== null) owner = 'engine-prompt';
        else owner = 'engine-screen';

        let needsTerm;
        if (optForceTerminal || owner === 'birth' || owner === 'dead') needsTerm = true;
        else if (mirror !== null) needsTerm = false;
        else needsTerm = needsTerminal(frame, opts);

        const items = resolveScreenModelItems(frame, legacy), isHeng = realm === 'hengband';
        const regions = extractMultiColumnItems(rows, isHeng, decode);

        const result = { owner, prompt, mirror, needsTerminal: needsTerm, items, regions, legacy };
        if (frame) {
            smLastSeq = frame.seq !== undefined ? frame.seq : null;
            smLastFrameObj = frame;
            smLastRealm = realm;
            smLastLang = optLang;
            smLastDecode = optDecode;
            smLastMirror3d = optMirror3d;
            smLastForceTerminal = optForceTerminal;
            cachedScreenModel = result;
        }
        return result;
    }

    const ScreenModel = Object.freeze({ of: screenModelOf });
    const ENGINE_VERBS = new Set(['key', 'keys', 'frame', 'map', 'save', 'ping']);

    function isAllowedEngineCommand(raw) {
        if (typeof raw !== 'string') return false;
        const cmd = raw.trim();
        if (!cmd || cmd.length > 64 || /[\r\n\0]/.test(cmd)) return false;
        const sp = cmd.indexOf(' '), verb = sp === -1 ? cmd : cmd.slice(0, sp);
        if (!ENGINE_VERBS.has(verb)) return false;
        if (verb === 'keys' && cmd.length > 5 + 16) return false;
        return true;
    }

    function extractRowRegions(line) {
        if (!line || typeof line !== 'string') return [];
        if (line.includes('選んで下さい') || line.includes('初期オプション設定') || line.includes('注意：')) return [];
        const tagRe = /(?:^|(\s{1,}))(?:\(([a-zA-Z0-9*@?])\)|\[([a-zA-Z0-9*@?])\]|([a-zA-Z0-9*@?])[\)\.\:\-]|(\*)\s*(?=ランダム|random|Random))\s+/g;
        const matches = [];
        let m;
        while ((m = tagRe.exec(line)) !== null) {
            const leadSpaces = m[1] ? m[1].length : 0, startCol = m.index + leadSpaces;
            if (startCol > 4 && leadSpaces < 2) continue;
            const key = m[2] || m[3] || m[4] || m[5], contentStart = m.index + m[0].length;
            if (key) matches.push({ key, startCol, contentStart });
        }

        const regions = [];
        for (let i = 0; i < matches.length; i++) {
            const cur = matches[i], nextStart = (i + 1 < matches.length) ? matches[i + 1].startCol : line.length;
            const rawSlice = line.slice(cur.contentStart, nextStart), rawTrim = rawSlice.trim();
            if (!rawTrim || rawTrim === '(nothing)' || rawTrim.includes('(nothing)') || rawTrim === 'なし') continue;
            let label = rawTrim, glyph = null;
            const glyphMatch = label.match(/^([)\]}>~!=?,_/\-\\|&"'])\s+(.+)$/);
            if (glyphMatch) { glyph = glyphMatch[1]; label = glyphMatch[2]; }
            let weight = null;
            const weightMatch = label.match(/(\d+(?:\.\d+)?\s*(?:lb|kg|g))\b/i);
            if (weightMatch) weight = weightMatch[1];
            let price = null;
            const priceMatch = rawSlice.match(/\s+(\d+)\s*(?:au|gp|gold)?\s*$/i);
            if (priceMatch && (!weightMatch || !weightMatch[0].includes(priceMatch[1]))) price = priceMatch[1];

            let cleanLabel = label.replace(/^[^:]{1,20}:\s*/, '').replace(/\s+\d+(\.\d+)?\s*(lb|kg|g).*$/i, '')
                .replace(/\s{3,}\d+\s*$/, '').replace(/\s{2,}.*$/, '').replace(/[(\[\{]+$/, '').trim();
            if (!cleanLabel) cleanLabel = rawTrim;

            regions.push({
                key: cur.key, label: cleanLabel, rawLabel: rawTrim, glyph, weight, price,
                startCol: cur.startCol, endCol: nextStart - 1, display: `[${cur.key}]`
            });
        }

        if (regions.length === 0) {
            const suffixActionRe = /(?:^|(\s{2,}))(Inspect|Cast|Study|Browse|Aim|Zap|Use|Read|Quaff|Eat|Activate|Fire|Refill|Take off|Equip|Drop All|Drop|Sell|Pick up|Throw|Uninscribe|Inscribe|Unignore|Ignore)\s+\(([a-zA-Z\{\}])\)\s*$/g;
            let sm;
            while ((sm = suffixActionRe.exec(line)) !== null) {
                const leadSpaces = sm[1] ? sm[1].length : 0, startCol = sm.index + leadSpaces;
                const actionLabel = (sm[2] || '').trim(), actionKey = sm[3];
                const endCol = sm.index + sm[0].trimEnd().length - 1;
                if (actionKey && actionLabel) {
                    regions.push({
                        key: actionKey, label: actionLabel, rawLabel: `${actionLabel} (${actionKey})`,
                        glyph: null, weight: null, price: null, startCol, endCol, display: `[${actionKey}]`
                    });
                }
            }
        }
        return regions;
    }

    function extractMultiColumnItems(rows, isHeng, decode) {
        if (!rows || !Array.isArray(rows)) return [];
        const seenKeys = new Set(), items = [];
        for (let r = 0; r < rows.length; r++) {
            const rawLine = rows[r] && rows[r].g ? rows[r].g : '';
            const line = isHeng && typeof decode === 'function' ? decode(rawLine) : rawLine;
            const regions = extractRowRegions(line);
            for (let c = 0; c < regions.length; c++) {
                const reg = regions[c];
                if (reg.key && !seenKeys.has(reg.key)) {
                    seenKeys.add(reg.key);
                    items.push(Object.assign({ row: r, colIndex: c, colCount: regions.length }, reg));
                }
            }
        }
        return items;
    }

    function detectRealmSubmenu(frame, realm, decode) {
        realm = (realm || (frame && frame.realm) || 'angband').toLowerCase();
        const isHeng = realm === 'hengband', screenText = screenTextOf(frame, decode);
        const rows = (frame && frame.term && Array.isArray(frame.term.rows)) ? frame.term.rows : [];
        const silqSkillColumns = ['Melee', 'Archery', 'Evasion', 'Stealth', 'Perception', 'Will', 'Smithing', 'Song'];
        const isSilqAbilityTree = Boolean(realm === 'silq' && screenText.includes('melee') && screenText.includes('archery') &&
            screenText.includes('evasion') && screenText.includes('stealth') &&
            (screenText.includes('will') || screenText.includes('perception') || screenText.includes('smithing') || screenText.includes('song')));

        let activeSilqSkillCol = 0;
        if (isSilqAbilityTree) {
            for (let i = 0; i < silqSkillColumns.length; i++) {
                const colLower = silqSkillColumns[i].toLowerCase();
                if (screenText.includes(`(${colLower})`) || screenText.includes(`[${colLower}]`) || screenText.includes(`${colLower} abilities`)) {
                    activeSilqSkillCol = i;
                    break;
                }
            }
        }

        const isSilqSmithing = Boolean(realm === 'silq' && (screenText.includes('smithing') || screenText.includes('forge') || screenText.includes('anvil')) &&
            (screenText.includes('weaponsmith') || screenText.includes('armoursmith') || screenText.includes('jeweller') || (screenText.includes('weapon') && screenText.includes('armour') && screenText.includes('ring'))));
        const isSilqSongMenu = Boolean(realm === 'silq' && /sing\s+which\s+song|songs?\s+known|stop\s+singing/i.test(screenText));
        const isCharSheet = isCharacterSheet(screenText);
        const isSpellMenu = !isSilqAbilityTree && !isSilqSmithing && isSpellOrAbilityMenu(screenText);

        let multiColRows = 0;
        for (let r = 0; r < rows.length; r++) {
            const rawLine = rows[r] && rows[r].g ? rows[r].g : '';
            const line = isHeng && typeof decode === 'function' ? decode(rawLine) : rawLine;
            if (extractRowRegions(line).length >= 2) multiColRows++;
        }
        const isMultiColumnMenu = multiColRows >= 2;
        const isInven = screenText.includes('(inventory)') || screenText.includes('inven:') || screenText.includes('inventory |') || screenText.includes('持ち物：');
        const isEquip = screenText.includes('(equipment)') || screenText.includes('equip:') || screenText.includes('| equipment') || screenText.includes('装備：');
        const isQuiver = screenText.includes('quiver:') || screenText.includes('| quiver');
        const hasGearModeTabs = Boolean(isInven || isEquip || isQuiver);
        const gearActiveTab = isEquip ? 'equip' : (isQuiver ? 'quiver' : (isInven ? 'inven' : null));
        const gearSwitchKey = (realm === 'frogcomposband' || realm === 'silq' || realm === 'hengband') ? '/' : (isEquip ? 'i' : 'e');

        return {
            realm, isSilqAbilityTree, silqSkillColumns, activeSilqSkillCol, isSilqSmithing, isSilqSongMenu,
            isCharacterSheet: isCharSheet, isSpellBookOrPowerMenu: isSpellMenu, isMultiColumnMenu,
            hasGearModeTabs, gearActiveTab, gearSwitchKey, multiColumnItems: extractMultiColumnItems(rows, isHeng, decode)
        };
    }

    return {
        KEYS, VARIANT_REGISTRY, registerVariant, isPopupCommandMenu, isCharacterSheet, isSpellOrAbilityMenu,
        isKnowledgeOrOptions, rawScreenText, screenTextOf, playerFeatOf, needsTerminal, toolbarFlags, birthFlags,
        promptFlags, storeFlags, itemFlags, inputEscapeReview, inputTerminalKeyFlags, inputTargetingPrompt,
        terminalDetectMode, extractItems, extractRowRegions, extractMultiColumnItems, detectRealmSubmenu,
        classify, classifyScreen: classify, ScreenModel, of: screenModelOf, decodeSjis, ENGINE_VERBS, isAllowedEngineCommand
    };
});

/**
 * screen-context.js — Pure screen classification for the angband3d web client.
 *
 * WS2 Phase 2 (menu_context_remediation_plan.md §3/§5). This module is a PURE
 * REFACTOR: every predicate below was moved VERBATIM from app.js
 * (needsTerminal + updateTerminalToolbar) at commit 45b67b0. Do not "improve"
 * or unify heuristics here without fixtures proving the change (see
 * tools/test_screen_context.js and tools/fixtures/menus/).
 *
 * Contract:
 *   - No DOM, no globals, no side effects. Inputs are a frame (wire protocol,
 *     docs/PROTOCOL.md) plus explicit options; outputs are plain objects.
 *   - Every returned object always carries its FULL key set (see KEYS below);
 *     tools/test_screen_context.js asserts this so callers never read
 *     `undefined` (the root cause of the R0 "sky of stars" incident).
 *   - UMD: browser -> window.ScreenContext; Node -> module.exports.
 *
 * Callers (keep in sync when adding exports):
 *   app.js  needsTerminal()           -> ScreenContext.needsTerminal
 *   app.js  updateTerminalToolbar()   -> toolbarFlags / birthFlags /
 *                                        promptFlags / storeFlags / itemFlags
 *   tools/verify_cross_realm_menus.js -> needsTerminal / toolbarFlags (e2e)
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ScreenContext = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Canonical key sets. Tests assert each function returns exactly these.
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
        inputTerminalKeyFlags: ['isChoiceMenu', 'isNamePrompt', 'isReviewScreen']
    });

    /** Raw terminal text: rows' glyph strings joined by '\n' (no decoding, original case). */
    function rawScreenText(frame) {
        return (frame && frame.term && frame.term.rows)
            ? frame.term.rows.map(r => r.g || '').join('\n')
            : '';
    }

    /**
     * Combined lowercase text used by every predicate: raw + '\n' + decoded.
     * `decode` is the caller's Hengband SJIS decoder (app.js decodeHengbandText);
     * identity when omitted. Matches app.js updateTerminalToolbar lines 3978-3982.
     */
    function screenTextOf(frame, decode) {
        const raw = rawScreenText(frame);
        const decoded = typeof decode === 'function' ? decode(raw) : raw;
        return (raw + '\n' + decoded).toLowerCase();
    }

    /**
     * Feature code under the player, parsed from map.rows[py].f (2 hex chars per cell).
     * 0 when unknown.
     */
    function playerFeatOf(frame) {
        let playerFeat = 0;
        if (frame && frame.map && frame.map.rows && frame.player) {
            const py = frame.player.y;
            const px = frame.player.x;
            if (frame.map.rows[py] && frame.map.rows[py].f) {
                playerFeat = parseInt(frame.map.rows[py].f.substring(px * 2, px * 2 + 2), 16) || 0;
            }
        }
        return playerFeat;
    }

    /**
     * View routing: should the classic terminal be shown for this frame?
     * Verbatim from app.js needsTerminal(); app-state inputs are explicit options.
     * @param {object} frame
     * @param {{forceTerminal?: boolean, decode?: function}} [opts]
     */
    function needsTerminal(frame, opts) {
        const forceTerminal = Boolean(opts && opts.forceTerminal);
        const decode = opts && opts.decode;
        if (!frame) return true;
        // If player does not exist yet, we are in birth / character setup
        if (!frame.player) return true;
        // Non-play phases (panic save prompts, etc.) route to terminal
        if (frame.phase && frame.phase !== 'play') return true;
        // During active play, if the player is dead, the atmospheric death modal handles death presentation
        const isDead = Boolean(frame.player.dead || (frame.player.hp !== undefined && frame.player.hp <= 0 && frame.player.hp_max > 0));
        if (isDead) return false;
        if (forceTerminal) return true;
        const ui = frame.ui;
        if (!ui) return false;

        // Overlays and menus take precedence over more prompts:
        // Inside stores, inventory, equipment, or menus, any -more- prompt belongs to that overlay and must stay in terminal view
        if (ui.context && (ui.context === 'menu' || ui.context === 'birth' || ui.context === 'setup')) return true;
        if ((ui.overlay || 0) > 0) {
            const fullText = screenTextOf(frame, decode);
            if (fullText.includes('low hitpoint warning') || fullText.includes('low hitpoint')) {
                return false;
            }
            return true;
        }

        // In-dungeon messages and -more- prompts must strictly remain in 3D view
        if (ui.more) return false;

        // In active play exploration with map:
        // If awaiting_command is false and more is false, route to terminal UNLESS it is a directional
        // targeting prompt (e.g. aiming a spell or bow in 3D using the rosette or target cursor).
        if (!ui.awaiting_command && !ui.more) {
            const fullText = screenTextOf(frame, decode);

            // Low hitpoint warnings must never engage terminal mode or interrupt 3D exploration
            if (fullText.includes('low hitpoint warning') || fullText.includes('low hitpoint')) {
                return false;
            }

            const isDirectionalTargeting = fullText.includes('direction?') ||
                                          fullText.includes('target [') ||
                                          fullText.includes('target:') ||
                                          fullText.includes('which direction?') ||
                                          fullText.includes('aim which direction?') ||
                                          fullText.includes('select target') ||
                                          fullText.includes('方向') ||
                                          fullText.includes('どの方向') ||
                                          fullText.includes('ターゲット');

            if (isDirectionalTargeting) {
                return false; // Stay in 3D view for rosette / crosshair aiming
            }

            return true;
        }
        return false;
    }

    /**
     * Mode flags used by updateTerminalToolbar section "2. Identify Current Mode & Screen".
     * Verbatim from app.js (45b67b0) lines ~4030-4109.
     * @param {object} frame      effective frame
     * @param {string} screenText screenTextOf(frame, decode)
     * @param {boolean} isHeng    active realm is Hengband
     */
    function toolbarFlags(frame, screenText, isHeng) {
        screenText = screenText || '';
        const inPlay = Boolean(frame && frame.phase === 'play' && frame.map);
        const playerFeat = playerFeatOf(frame);
        const isStoreFeat = (playerFeat >= 7 && playerFeat <= 14) ||
                            (playerFeat >= 0x20 && playerFeat <= 0x28) ||
                            (isHeng && playerFeat === 4);
        const inOverlay = Boolean(frame && frame.ui && (frame.ui.overlay || 0) > 0);
        const hasStoreText = screenText.includes('store inventory') ||
                             screenText.includes('home inventory') ||
                             screenText.includes('gold remaining') ||
                             screenText.includes('purchase which item') ||
                             screenText.includes('sell which item') ||
                             screenText.includes('examine which item') ||
                             screenText.includes('商品の一覧') ||
                             screenText.includes('雑貨屋') ||
                             screenText.includes('万屋') ||
                             screenText.includes('防具屋') ||
                             screenText.includes('武器屋') ||
                             screenText.includes('寺院') ||
                             screenText.includes('錬金術の店') ||
                             screenText.includes('魔術師の店') ||
                             screenText.includes('ブラック・マーケット') ||
                             screenText.includes('我が家') ||
                             screenText.includes('博物館') ||
                             (screenText.includes('重さ') && screenText.includes('価格'));
        const isTargeting = inPlay && (
            screenText.includes('target [') ||
            screenText.includes('target:') ||
            screenText.includes('direction?') ||
            screenText.includes('which direction?') ||
            screenText.includes('select target') ||
            screenText.includes('aim which direction?')
        );

        const isItemPrompt = inPlay && !isTargeting && (
            screenText.includes('select item:') ||
            screenText.includes('inven:') ||
            screenText.includes('(inven') ||
            screenText.includes('(inventory)') ||
            screenText.includes('inventory | equipment') ||
            screenText.includes('inventory |') ||
            screenText.includes('| equipment') ||
            screenText.includes('equip:') ||
            screenText.includes('(equip') ||
            screenText.includes('(equipment)') ||
            screenText.includes('quiver:') ||
            screenText.includes('quiver') ||
            screenText.includes('which item?') ||
            screenText.includes('which potion?') ||
            screenText.includes('which scroll?') ||
            screenText.includes('which spell?') ||
            screenText.includes('which prayer?') ||
            screenText.includes('which book?') ||
            screenText.includes('wear/wield') ||
            screenText.includes('take off') ||
            screenText.includes('remove which item') ||
            screenText.includes('drop which') ||
            screenText.includes('throw which') ||
            screenText.includes('fire which') ||
            screenText.includes('quaff which') ||
            screenText.includes('read which') ||
            screenText.includes('destroy which') ||
            (!hasStoreText && screenText.includes('examine which item')) ||
            (isHeng && !hasStoreText && (
                screenText.includes('持ち物：') ||
                screenText.includes('装備：') ||
                screenText.includes('どれを装備') ||
                screenText.includes('どれを外しますか') ||
                screenText.includes('どれを落としますか') ||
                screenText.includes('どれを投げますか')
            ))
        );

        const isStore = !isItemPrompt && (hasStoreText || (isStoreFeat && inOverlay));
        return { inPlay, playerFeat, isStoreFeat, inOverlay, hasStoreText, isTargeting, isItemPrompt, isStore };
    }

    /**
     * Birth / setup screen flags (updateTerminalToolbar non-play branch).
     * Verbatim from app.js (45b67b0) lines ~4277-4368. NOTE: input.js and the
     * app.js onFrame/-more- paths still hold their OWN, DIFFERENT copies of
     * isReviewScreen / isChoiceMenu / isNamePrompt (WS2 Phase 2d migrates them).
     */
    function birthFlags(screenText, isHeng) {
        screenText = screenText || '';
        const isTitleScreen = (screenText.includes('when the world is old') ||
                               screenText.includes('press any key to continue') ||
                               screenText.includes('rephial.org') ||
                               screenText.includes('last battle be gathered')) &&
                              !screenText.includes('character traits') &&
                              !screenText.includes('affects stats');

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

        const isNamePrompt = isHengName ||
                             screenText.includes("enter a name for your character") ||
                             screenText.includes("enter a name") ||
                             screenText.includes("enter character's name") ||
                             screenText.includes("enter your player's name") ||
                             screenText.includes("choose your name");

        const isHistoryPrompt = isHengHistory ||
                                screenText.includes("accept character history") ||
                                (screenText.includes("[y/n]") && !screenText.includes("use as is") && !screenText.includes("to start over"));

        const isStatRoller = isHengStatRoller ||
                             screenText.includes("left/right to modify") ||
                             screenText.includes("to modify") ||
                             screenText.includes("total cost:") ||
                             screenText.includes("point-based") ||
                             screenText.includes("standard roller") ||
                             screenText.includes("set minimum stats") ||
                             screenText.includes("enter for goto next") ||
                             screenText.includes("roller");

        const isBackgroundEdit = isHengHistory ||
                                 screenText.includes("character background") ||
                                 screenText.includes("cursor key for move, enter for end");

        const isReadyPrompt = isHengEmbark ||
                              screenText.includes("start over, or enter to continue") ||
                              screenText.includes("['q'uit, 's'tart over, or enter to continue]");

        const isChoiceMenu = isHengSex || isHengRace || isHengClass || isHengPersonality || isHengRealm ||
                             screenText.includes('choose a race') || screenText.includes('choose race') ||
                             screenText.includes('choose a class') || screenText.includes('choose class') ||
                             screenText.includes('race affects stats') || screenText.includes('class affects stats') ||
                             screenText.includes('sex affects stats') || screenText.includes('choose sex') ||
                             screenText.includes('choose your sex') || screenText.includes('choose character sex') ||
                             screenText.includes('choose character race') || screenText.includes('choose character class') ||
                             screenText.includes('choose a personality') || screenText.includes('choose personality') ||
                             screenText.includes('personality affects stats') ||
                             screenText.includes('choose realm') || screenText.includes('choose a realm') ||
                             screenText.includes('choose first realm') || screenText.includes('choose second realm') ||
                             screenText.includes('first realm') || screenText.includes('second realm') ||
                             screenText.includes('choose a house') || screenText.includes('choose house') ||
                             screenText.includes('choose character background') || screenText.includes('choose background') ||
                             screenText.includes('choose subrace') || screenText.includes('choose a subrace') ||
                             screenText.includes('*でランダム') || screenText.includes('* for random') ||
                             screenText.includes('escで戻る') || screenText.includes('esc to return') ||
                             screenText.includes('esc to step back') || screenText.includes('esc:戻る') ||
                             screenText.includes('escで前へ');

        const isReviewScreen = !isChoiceMenu && !isNamePrompt && !isHistoryPrompt && !isStatRoller && !isBackgroundEdit && !isReadyPrompt &&
                               !screenText.includes('character traits') &&
                               !screenText.includes('affects stats') &&
                               (screenText.includes("to start over") ||
                                screenText.includes("any other key to continue") ||
                                screenText.includes("use as is") ||
                                screenText.includes("accept character") ||
                                screenText.includes("re-roll") ||
                                screenText.includes("r to reroll") ||
                                screenText.includes("'s' to start") ||
                                screenText.includes("['r'eroll") ||
                                screenText.includes("or enter to accept") ||
                                screenText.includes("reroll, 'h'istory") ||
                                screenText.includes("enter to begin play") ||
                                screenText.includes("能力値決定") ||
                                screenText.includes("次の数値") ||
                                (screenText.includes("best") && screenText.includes("cur exp")));

        return {
            isTitleScreen, isHengInitialOpt, isHengSex, isHengRace, isHengClass, isHengPersonality,
            isHengRealm, isHengStatRoller, isHengStatDecide, isHengName, isHengHistory, isHengEmbark,
            isNamePrompt, isHistoryPrompt, isStatRoller, isBackgroundEdit, isReadyPrompt, isChoiceMenu,
            isReviewScreen
        };
    }

    /** Universal y/n and quantity prompts (active-play branch). Verbatim, app.js ~4575-4578. */
    function promptFlags(screenText) {
        screenText = screenText || '';
        const isYesNoPrompt = screenText.includes('[y/n]') || screenText.includes('(y/n)') ||
                              screenText.includes('are you sure') || screenText.includes('really drop') ||
                              screenText.includes('really destroy');
        const isQuantityPrompt = screenText.includes('how many') || screenText.includes('quantity') || screenText.includes('how much');
        return { isYesNoPrompt, isQuantityPrompt };
    }

    /** Store sub-state flags (store branch). Verbatim, app.js ~4640-4651. */
    function storeFlags(frame, screenText, isHeng) {
        screenText = screenText || '';
        const hasMore = Boolean(frame && frame.ui && frame.ui.more) || screenText.includes('-more-');
        const isStoreContextMenu = screenText.includes('command for ') ||
                                   (screenText.includes('(enter to select') && screenText.includes('examine')) ||
                                   (isHeng && screenText.includes('に対するコマンド'));
        const isStoreBuy = screenText.includes('purchase which item') ||
                           screenText.includes('which item to buy') ||
                           (isHeng && (screenText.includes('何か買いますか') || screenText.includes('どのアイテムを買いますか') || screenText.includes('何を買いますか') || screenText.includes('買いますか')));
        const isStoreSell = screenText.includes('sell which item') ||
                            screenText.includes('which item to sell') ||
                            (isHeng && (screenText.includes('どれを売りますか') || screenText.includes('どのアイテムを売りますか') || screenText.includes('何を売りますか') || screenText.includes('売りますか')));
        const isStoreExamine = screenText.includes('examine which item') ||
                               (isHeng && (screenText.includes('どれを調べますか') || screenText.includes('どのアイテムを調べますか') || screenText.includes('調べますか')));
        return { hasMore, isStoreContextMenu, isStoreBuy, isStoreSell, isStoreExamine };
    }

    /** Item-prompt sub-state flags (item branch). Verbatim, app.js ~4749-4760. */
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

        const isEquipView = screenText.includes('equip') || screenText.includes('装備品') || screenText.includes('装備：') || screenText.includes('装備:');
        const isQuiverView = screenText.includes('quiver:') || screenText.includes('quiver') || screenText.includes('矢筒:');
        return {
            isSilq, isSilqInvenCmd, isSilqEquipCmd, isSilqWear, isSilqRemove, isSilqExamine,
            isSilqDrop, isSilqThrow, isSilqFire, isEquipView, isQuiverView
        };
    }

    /**
     * Pure SJIS decoder equivalent to terminal.js decodeText() (the effective,
     * second definition). For Node tests/tools; the browser keeps using
     * terminal.decodeText via app.js decodeHengbandText.
     * @param {string} str  latin1-ish byte string from the bridge
     * @param {TextDecoder} td  a TextDecoder('shift_jis') or null
     */
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

    /**
     * Input review check for Escape key handling.
     * Verbatim from input.js (45b67b0) lines ~826-834.
     */
    function inputEscapeReview(screenText, inPlay, isReviewActive) {
        screenText = screenText || '';
        return Boolean(isReviewActive || (!inPlay && (screenText.includes("use as is") || screenText.includes("'y': use") ||
            screenText.includes("to start over") || screenText.includes("r to reroll") ||
            screenText.includes("reroll") || screenText.includes("'s' to start") ||
            screenText.includes("accept character") ||
            (screenText.includes("enter your starting stats") && screenText.includes("begin play")) ||
            screenText.includes("能力値の決定") ||
            screenText.includes("step back") || screenText.includes("any other key to continue"))));
    }

    /**
     * Input choice menu / name / review flags for handleTerminalKey.
     * Verbatim from input.js (45b67b0) lines ~889-926.
     */
    function inputTerminalKeyFlags(screenText, inPlay, isReviewActive) {
        screenText = screenText || '';
        const isChoiceMenu = !inPlay && (
            screenText.includes("性別") || screenText.includes("種族") ||
            screenText.includes("職業") || screenText.includes("性格") ||
            screenText.includes("魔法領域") || screenText.includes("領域を選んで") ||
            screenText.includes("choose sex") || screenText.includes("choose your sex") ||
            screenText.includes("sex affects stats") || screenText.includes("choose character sex") ||
            screenText.includes("choose a race") || screenText.includes("choose race") ||
            screenText.includes("race affects stats") || screenText.includes("choose character race") ||
            screenText.includes("choose a class") || screenText.includes("choose class") ||
            screenText.includes("class affects stats") || screenText.includes("choose character class") ||
            screenText.includes("choose a personality") || screenText.includes("choose personality") ||
            screenText.includes("personality affects stats") ||
            screenText.includes("choose realm") || screenText.includes("choose a realm") ||
            screenText.includes("choose first realm") || screenText.includes("choose second realm") ||
            screenText.includes("first realm") || screenText.includes("second realm") ||
            screenText.includes("choose a house") || screenText.includes("choose house") ||
            screenText.includes("choose character background") || screenText.includes("choose background") ||
            screenText.includes("choose subrace") || screenText.includes("choose a subrace") ||
            screenText.includes("*でランダム") || screenText.includes("* for random") ||
            screenText.includes("escで戻る") || screenText.includes("esc to return") ||
            screenText.includes("esc to step back") || screenText.includes("esc:戻る") ||
            screenText.includes("escで前へ")
        );
        const isNamePrompt = !inPlay && (
            screenText.includes("名前を入力") || screenText.includes("character's name") ||
            screenText.includes("enter a name") || screenText.includes("choose your name")
        );
        const isReviewScreen = !isChoiceMenu && !isNamePrompt && !inPlay && (
            Boolean(isReviewActive) ||
            screenText.includes("use as is") || screenText.includes("'y': use") ||
            screenText.includes("to start over") || screenText.includes("r to reroll") ||
            screenText.includes("reroll") || screenText.includes("'s' to start") ||
            screenText.includes("accept character") ||
            (screenText.includes("enter your starting stats") && screenText.includes("begin play")) ||
            screenText.includes("能力値決定") || screenText.includes("次の数値") ||
            screenText.includes("この数値に決定")
        );
        return { isChoiceMenu, isNamePrompt, isReviewScreen };
    }

    /**
     * Input directional aim rosette prompt check.
     * Verbatim from input.js (45b67b0) lines ~2237-2244.
     */
    function inputTargetingPrompt(screenText, inPlay) {
        screenText = screenText || '';
        return Boolean(inPlay && (
            screenText.includes('target [') ||
            screenText.includes('target:') ||
            screenText.includes('direction?') ||
            screenText.includes('which direction?') ||
            screenText.includes('select target') ||
            screenText.includes('aim which direction?')
        ));
    }

    /**
     * Classic terminal screen mode detection for font scaling.
     * Verbatim from terminal.js (45b67b0) lines ~312-442.
     */
    function terminalDetectMode(termData, decode) {
        if (!termData || !termData.rows) return 'classic_play';
        const rawText = termData.rows.map(r => r.g || '').join(' ').toLowerCase();
        const decodedText = typeof decode === 'function' ? termData.rows.map(r => decode(r.g || '')).join(' ').toLowerCase() : rawText;
        const fullText = rawText + ' ' + decodedText;

        // 1. Birth / Character Setup / Death
        if (fullText.includes('choose a race') ||
            fullText.includes('choose a class') ||
            fullText.includes('choose a sex') ||
            fullText.includes('choose your') ||
            fullText.includes('character creation') ||
            fullText.includes('please select your character') ||
            fullText.includes('select your character traits') ||
            fullText.includes('step back through the birth process') ||
            fullText.includes('race affects stats') ||
            fullText.includes('class affects stats') ||
            fullText.includes('choose how to generate') ||
            fullText.includes('when the world is old') ||
            fullText.includes('press any key to continue') ||
            fullText.includes('use as is') ||
            fullText.includes('to start over') ||
            fullText.includes('r to reroll') ||
            fullText.includes("'s' to start") ||
            fullText.includes('tombstone') ||
            fullText.includes('stat roll') ||
            fullText.includes('point-based') ||
            fullText.includes('roller') ||
            fullText.includes("character's name") ||
            fullText.includes('enter a name') ||
            fullText.includes('enter name') ||
            fullText.includes('accept character history') ||
            fullText.includes('any other key to continue') ||
            fullText.includes('enter character') ||
            // Japanese Hengband Birth Screens
            fullText.includes('初期オプション') ||
            fullText.includes('smart_learn') ||
            fullText.includes('キャラクターを作成') ||
            fullText.includes('性別を選んで') ||
            fullText.includes('種族を選んで') ||
            fullText.includes('職業を選んで') ||
            fullText.includes('性格を選んで') ||
            fullText.includes('魔法領域') ||
            fullText.includes('能力値を抽選') ||
            fullText.includes('この数値に決定') ||
            fullText.includes('生い立ち') ||
            fullText.includes('ゲーム開始') ||
            fullText.includes('冒険に出ますか')) {
            return 'birth';
        }

        // 2. Stores & Shops
        if (fullText.includes('store inventory') ||
            fullText.includes('home inventory') ||
            fullText.includes('gold remaining') ||
            fullText.includes('which store') ||
            fullText.includes('storekeeper') ||
            fullText.includes('purchase which item') ||
            fullText.includes('sell which item') ||
            fullText.includes('examine which item') ||
            fullText.includes('所持金') ||
            fullText.includes('店主') ||
            fullText.includes('いらっしゃいませ') ||
            fullText.includes('買いますか') ||
            fullText.includes('売りますか')) {
            return 'store';
        }

        // 3. Targeting & Direction Prompts
        if (fullText.includes('target [') ||
            fullText.includes('direction?') ||
            fullText.includes('target:') ||
            fullText.includes('select target') ||
            fullText.includes('target mode') ||
            fullText.includes('choose target') ||
            fullText.includes('どの方向') ||
            fullText.includes('対象:') ||
            fullText.includes('照準')) {
            return 'targeting';
        }

        // 4. Item & Spell Prompts
        if (fullText.includes('inven:') ||
            fullText.includes('(inventory)') ||
            fullText.includes('(inven') ||
            fullText.includes('inventory | equipment') ||
            fullText.includes('inventory |') ||
            fullText.includes('| equipment') ||
            fullText.includes('examine which item') ||
            fullText.includes('equip:') ||
            fullText.includes('(equipment)') ||
            fullText.includes('(equip') ||
            fullText.includes('quiver:') ||
            fullText.includes('quiver') ||
            fullText.includes('select item:') ||
            fullText.includes('which item?') ||
            fullText.includes('which potion?') ||
            fullText.includes('which scroll?') ||
            fullText.includes('which book?') ||
            fullText.includes('which spell?') ||
            fullText.includes('cast which') ||
            fullText.includes('aim which') ||
            fullText.includes('zap which') ||
            fullText.includes('browse which') ||
            fullText.includes('destroy which') ||
            fullText.includes('take off') ||
            fullText.includes('remove which item') ||
            fullText.includes('wear/wield') ||
            fullText.includes('drop which') ||
            fullText.includes('throw which') ||
            fullText.includes('fire which') ||
            fullText.includes('quaff which') ||
            fullText.includes('read which') ||
            fullText.includes('どのアイテム') ||
            fullText.includes('どの巻物') ||
            fullText.includes('どの薬') ||
            fullText.includes('どの魔法') ||
            fullText.includes('どの呪文') ||
            fullText.includes('どの本') ||
            fullText.includes('装備品') ||
            fullText.includes('持ち物') ||
            fullText.includes('どれを装備') ||
            fullText.includes('どれを外しますか') ||
            fullText.includes('どれを落としますか') ||
            fullText.includes('どれを投げますか')) {
            return 'item_prompt';
        }

        // 5. Default: Classic Dungeon Exploration
        return 'classic_play';
    }

    return {
        KEYS,
        rawScreenText,
        screenTextOf,
        playerFeatOf,
        needsTerminal,
        toolbarFlags,
        birthFlags,
        promptFlags,
        storeFlags,
        itemFlags,
        inputEscapeReview,
        inputTerminalKeyFlags,
        inputTargetingPrompt,
        terminalDetectMode,
        decodeSjis
    };
});

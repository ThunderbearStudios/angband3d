(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        factory(exports);
    } else {
        root.ScreenContext = {};
        factory(root.ScreenContext);
    }
}(typeof self !== 'undefined' ? self : this, function (exports) {

    let lastSeq = null;
    let cached = null;

    function decodeHengbandText(str) {
        if (!str) return '';
        if (/[\u3000-\u9faf]/.test(str)) return str;
        // In the browser, 'terminal' global might have decodeText
        if (typeof window !== 'undefined' && window.terminal && typeof window.terminal.decodeText === 'function') {
            return window.terminal.decodeText(str);
        }
        return str;
    }

    // Helper to determine active realm dynamically
    function getActiveRealm(frame) {
        if (frame && frame.realm) return frame.realm;
        if (typeof window !== 'undefined') {
            if (window.activeRealm) return window.activeRealm;
            if (window.__activeRealm) return window.__activeRealm;
        }
        return 'angband';
    }

    function classify(frame) {
        if (!frame) return null;
        if (frame.seq !== undefined && frame.seq === lastSeq && cached) {
            return cached;
        }

        const realm = getActiveRealm(frame);
        const isHeng = (realm === 'hengband');

        const rawScreenText = (frame.term && frame.term.rows) ? frame.term.rows.map(r => r.g || '').join('\n') : '';
        const decodedScreenText = isHeng ? decodeHengbandText(rawScreenText) : rawScreenText;
        const screenText = (rawScreenText + '\n' + decodedScreenText).toLowerCase();

        const inPlay = Boolean(frame.phase === 'play' && frame.map);
        
        let playerFeat = 0;
        if (inPlay && frame.player) {
            const py = frame.player.y;
            const px = frame.player.x;
            if (frame.map.rows && frame.map.rows[py] && frame.map.rows[py].f) {
                playerFeat = parseInt(frame.map.rows[py].f.substring(px * 2, px * 2 + 2), 16) || 0;
            }
        }
        const isStoreFeat = (playerFeat >= 7 && playerFeat <= 14) || (playerFeat >= 0x20 && playerFeat <= 0x28) || (isHeng && playerFeat === 4);
        const inOverlay = Boolean(frame.ui && (frame.ui.overlay || 0) > 0);

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

        let isItemPrompt = inPlay && !isTargeting && (
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

        // FCB gear UI check
        if (realm === 'frogcomposband' && (screenText.includes('inventory | equipment') || screenText.includes('inventory |') || screenText.includes('| equipment'))) {
            isItemPrompt = true;
        }

        const isReviewActive = Boolean(typeof window !== 'undefined' && window.__app && typeof window.__app.isBirthReviewActive === 'function' && window.__app.isBirthReviewActive());

        const isChoiceMenu = !inPlay && (
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
            screenText.includes("* for random") ||
            screenText.includes("esc to return") ||
            screenText.includes("esc to step back") ||
            (isHeng && screenText.includes('よろしいですか'))
        );

        const isNamePrompt = !inPlay && (
            screenText.includes("character's name") ||
            screenText.includes("enter a name") || screenText.includes("choose your name")
        );

        const isReviewScreen = !isChoiceMenu && !isNamePrompt && !inPlay && (
            isReviewActive ||
            screenText.includes("use as is") || screenText.includes("'y': use") ||
            screenText.includes("to start over") || screenText.includes("r to reroll") ||
            screenText.includes("reroll") || screenText.includes("'s' to start") ||
            screenText.includes("accept character") ||
            (screenText.includes("enter your starting stats") && screenText.includes("begin play")) ||
            screenText.includes("step back") || screenText.includes("any other key to continue")
        );

        const isSplashPoem = screenText.includes('into the vast and echoing gloom') || 
            screenText.includes('depths they went alone') || 
            screenText.includes('menace dark enshrined') ||
            screenText.includes('when the world is old and the days of wonder') ||
            screenText.includes('rephial.org') ||
            screenText.includes('last battle be gathered') ||
            (screenText.includes('press any key to continue') && !screenText.includes('character traits'));

        let mode = 'terminal';
        let promptKind = null;
        let listKind = null;

        if (isTargeting) {
            mode = 'targeting';
        } else if (isItemPrompt) {
            mode = 'item-list';
            if (screenText.includes('inven:') || screenText.includes('(inventory)') || screenText.includes('inventory |') || (isHeng && screenText.includes('持ち物：'))) listKind = 'inven';
            else if (screenText.includes('equip:') || screenText.includes('(equipment)') || screenText.includes('| equipment') || (isHeng && screenText.includes('装備：'))) listKind = 'equip';
            else if (screenText.includes('quiver:') || screenText.includes('quiver')) listKind = 'quiver';

            // Check if it's a command prompt vs a select prompt
            if (realm === 'silq' && (screenText.includes('(inventory) command:') || screenText.includes('(equipment) command:'))) {
                promptKind = 'command';
            } else if (isHeng && (screenText.includes('持ち物：') || screenText.includes('装備：')) && screenText.includes('コマンド:')) {
                promptKind = 'command';
            } else if (realm === 'frogcomposband' && (screenText.includes('inventory | equipment') || screenText.includes('inventory |') || screenText.includes('| equipment'))) {
                // FCB gear UI handles letters natively as examine, but we want our action chooser
                promptKind = 'command'; 
            } else {
                promptKind = 'select'; // asking for "which item?"
            }

        } else if (screenText.includes('command for') || screenText.includes('command:')) {
            // In vanilla, when an item is selected from inventory outside of store
            if (realm === 'angband' && (screenText.includes('command for') || screenText.includes('action:'))) {
                mode = 'item-actions';
            }
        } else if (hasStoreText || (isStoreFeat && inOverlay)) {
            mode = 'store';
        } else if (!inPlay) {
            if (isSplashPoem) mode = 'splash';
            else if (isReviewScreen) mode = 'review';
            else if (isNamePrompt) mode = 'name';
            else if (isChoiceMenu) mode = 'birth';
        } else if (inPlay && !inOverlay && !frame.more) {
            mode = 'world';
        }

        // Additive Phase 3 checks:
        if (screenText.includes('press any key') || screenText.includes('[press any key to continue]') || (isHeng && screenText.includes('何かキーを押して'))) {
            // FCB item descriptions end with [Press Any Key to Continue]
            // We shouldn't drop out of terminal but rather show a "Continue" button
            mode = 'press-any-key';
        }

        const items = (mode === 'item-list' || mode === 'item-actions' || mode === 'store' || mode === 'birth' || mode === 'review') ? extractItems(frame, isHeng) : [];

        // Check if Yes/No Prompt is embedded
        if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || (isHeng && screenText.includes('よろしいですか'))) {
            if (mode !== 'item-list' && mode !== 'birth') {
                mode = 'yesno';
            }
        }

        const nTerminal = needsTerminal(frame, isHeng, screenText, mode);

        lastSeq = frame.seq;
        cached = {
            mode,
            listKind,
            promptKind,
            items,
            screenText,
            inPlay,
            needsTerminal: nTerminal
        };
        return cached;
    }

    function extractItems(frame, isHeng) {
        let options = [];
        const rows = frame.term && frame.term.rows ? frame.term.rows : [];
        const regexes = [
            /(?:^|\s+)\(([a-zA-Z0-9*@?])\)\s+([^\n\r]{1,70})/g,
            /(?:^|\s+)\[([a-zA-Z0-9*@?])\]\s+([^\n\r]{1,70})/g,
            /(?:^|\s+)([a-zA-Z0-9*@?])[\)\.\:\-]\s+([^\n\r]{1,70})/g,
            /(?:^|\s+)(\*)\s*(ランダム|random|Random)/gi
        ];
        const seenKeys = new Set();
        const rawScreenText = rows.map(r => r.g || '').join('\n').toLowerCase();

        for (let r = 0; r < rows.length; r++) {
            const rawLine = rows[r].g || '';
            const line = isHeng ? decodeHengbandText(rawLine) : rawLine;
            if (isHeng && (line.includes('選んで下さい') || line.includes('初期オプション設定') || line.includes('注意：'))) continue;

            for (const re of regexes) {
                re.lastIndex = 0;
                let m;
                while ((m = re.exec(line)) !== null) {
                    const key = m[1];
                    let label = (m[2] || '').trim();
                    label = label.replace(/^[^:]{1,20}:\s*/, '');
                    label = label.replace(/\s{2,}.*$/, '');
                    label = label.replace(/\s+\d+(\.\d+)?\s*(lb|kg|g)$/i, '');
                    label = label.replace(/[(\[\{]+$/, '').trim();

                    if (!label || label === '(nothing)' || label.includes('(nothing)') || label === 'なし') {
                        continue;
                    }

                    if (key && !seenKeys.has(key)) {
                        seenKeys.add(key);
                        let display = `[${key}]`;
                        // Note: display string formatting is delegated back to caller for translation support
                        options.push({ key, label, display });
                    }
                }
            }
        }
        
        if (rawScreenText.includes('[y/n]') || rawScreenText.includes('(y/n)') || (isHeng && rawScreenText.includes('よろしいですか'))) {
            if (!seenKeys.has('y')) options.unshift({ key: 'y', label: 'Yes', display: '[y] ✓ Yes' });
            if (!seenKeys.has('n')) options.push({ key: 'n', label: 'No', display: '[n] ✕ No' });
        }

        return options;
    }

    function needsTerminal(frame, isHeng, fullText, mode) {
        if (!frame) return true;
        if (!frame.player) return true;
        if (frame.phase && frame.phase !== 'play') return true;
        
        const isDead = Boolean(frame.player.dead || (frame.player.hp !== undefined && frame.player.hp <= 0 && frame.player.hp_max > 0));
        if (isDead) return false;
        
        if (typeof window !== 'undefined' && window.__app && window.__app.forceTerminal) return true;

        const ui = frame.ui;
        if (!ui) return false;

        if (ui.context && (ui.context === 'menu' || ui.context === 'birth' || ui.context === 'setup')) return true;
        
        if ((ui.overlay || 0) > 0) {
            if (fullText.includes('low hitpoint warning') || fullText.includes('low hitpoint')) {
                return false;
            }
            return true;
        }

        if (ui.more) return false;

        if (!ui.awaiting_command && !ui.more) {
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
                                          fullText.includes('ターゲットを');
            
            // If the terminal requires input but it's not a spatial targeting action, force the terminal
            if (!isDirectionalTargeting) return true;
        }

        // Catch for 'press-any-key' screen
        if (mode === 'press-any-key') return true;
        
        return false;
    }

    exports.classify = classify;
    exports.decodeHengbandText = decodeHengbandText;

}));

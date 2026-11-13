// server/public/js/heng-dict.js
// HengDict lightweight backward-compatibility wrapper and overrides facade (WS3.5)
// Delegates all active translations to HengTranslate (v2) while preserving existing APIs.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        try {
            if (typeof global !== 'undefined' && !global.HengTranslate) {
                global.HengTranslate = require('./heng/heng-translate.js');
            }
            if (global.HengTranslate && typeof global.HengTranslate.isLoaded === 'function' && !global.HengTranslate.isLoaded()) {
                const path = require('path');
                const baseDir = path.join(__dirname, 'heng');
                const names = require(path.join(baseDir, 'heng-names.json'));
                const templates = require(path.join(baseDir, 'heng-templates.json'));
                const kinds = require(path.join(baseDir, 'heng-kinds.json'));
                const manifest = require(path.join(baseDir, 'heng-manifest.json'));
                global.HengTranslate.load({ names, templates, kinds, manifest });
            }
        } catch (_) {}
        module.exports = factory();
    } else {
        const exports = factory();
        root.HENG_DICT = exports;
        root.isV2Active = exports.isV2Active;
        root.getLocalizedMonsterName = exports.getLocalizedMonsterName;
        root.getLocalizedItemName = exports.getLocalizedItemName;
        root.localizeGameMessage = exports.localizeGameMessage;
        root.translateTerminalRow = exports.translateTerminalRow;
        root.__hengUntranslated = exports.__hengUntranslated;
        root.__hengRawLines = exports.__hengRawLines;
    }
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
    'use strict';

    // Development audit telemetry (populated when localStorage.angband3d_dev_lang_audit = '1')
    const untranslatedMap = new Map();
    const rawLinesSet = new Set();
    const MAX_UNTRANSLATED = 500;
    const RE_CJK_AUDIT = /[\u3040-\u30ff\u4e00-\u9fff]/;

    function isAuditActive() {
        try {
            if (typeof window !== 'undefined' && window.__langAudit) return true;
            if (typeof localStorage !== 'undefined' && localStorage.getItem('angband3d_dev_lang_audit') === '1') {
                return true;
            }
        } catch (e) {}
        return false;
    }

    function recordUntranslated(text, mode) {
        if (mode !== 'en' || !isAuditActive() || !text || typeof text !== 'string') return;
        if (RE_CJK_AUDIT.test(text)) {
            const trimmed = text.trim();
            if (!trimmed) return;
            const count = (untranslatedMap.get(trimmed) || 0) + 1;
            if (untranslatedMap.size < MAX_UNTRANSLATED || untranslatedMap.has(trimmed)) {
                untranslatedMap.set(trimmed, count);
            }
        }
    }

    function recordRawLine(text) {
        if (!isAuditActive() || !text || typeof text !== 'string') return;
        if (RE_CJK_AUDIT.test(text)) {
            const trimmed = text.trim();
            if (trimmed) rawLinesSet.add(trimmed);
        }
    }

    // High-priority manual overrides facade
    const MANUAL_OVERRIDES = {
        'たいまつ': 'Wooden Torch',
        '松明': 'Wooden Torch',
        'プレイヤー': 'Player'
    };

    let _enToJaMap = null;
    function getEnToJaMap() {
        if (_enToJaMap) return _enToJaMap;
        _enToJaMap = new Map();
        try {
            if (typeof require === 'function') {
                const path = require('path');
                const names = require(path.join(__dirname, 'heng', 'heng-names.json'));
                for (const [ja, val] of Object.entries(names)) {
                    const en = Array.isArray(val) ? val[0] : val;
                    if (en) _enToJaMap.set(String(en).toLowerCase(), ja);
                }
                const commonItems = {
                    'short sword': 'ショート・ソード',
                    'potion of blindness': '盲目の薬',
                    'potion of cure poison': '毒消しの薬',
                    'ration of food': '食料',
                    'black arrow': '矢',
                    'wooden torch': 'たいまつ',
                    'broad axe': 'ブロード・アックス'
                };
                for (const [e, j] of Object.entries(commonItems)) {
                    _enToJaMap.set(e, j);
                }
            }
        } catch (_) {}
        return _enToJaMap;
    }

    function isV2Active() {
        if (typeof window !== 'undefined' && typeof window.__hengTranslatorV2 === 'boolean') {
            return window.__hengTranslatorV2;
        }
        if (typeof global !== 'undefined' && typeof global.__hengTranslatorV2 === 'boolean') {
            return global.__hengTranslatorV2;
        }
        try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem('angband3d_heng_v2') === '0') {
                return false;
            }
        } catch (e) {}
        const ht = (typeof HengTranslate !== 'undefined' ? HengTranslate : (typeof window !== 'undefined' ? window.HengTranslate : (typeof global !== 'undefined' ? global.HengTranslate : null)));
        return Boolean(ht);
    }

    function getLocalizedMonsterName(name, realm, langMode) {
        if (!name) return '';
        if (realm !== 'hengband') return name;
        const mode = langMode || (typeof window !== 'undefined' && window.__langMode) || 'en';

        const isInputJp = RE_CJK_AUDIT.test(name);
        if (mode === 'jp' && isInputJp) return name;

        const ht = (typeof HengTranslate !== 'undefined' ? HengTranslate : (typeof window !== 'undefined' ? window.HengTranslate : (typeof global !== 'undefined' ? global.HengTranslate : null)));

        if (isInputJp) {
            if (MANUAL_OVERRIDES[name]) {
                const en = MANUAL_OVERRIDES[name];
                return mode === 'bilingual' ? `${en} (${name})` : en;
            }
            if (ht && isV2Active()) {
                const en = ht.translateName(name, 1, 'en');
                if (en && en !== name) {
                    return mode === 'bilingual' ? `${en} (${name})` : en;
                }
            }
            return name;
        }

        const rawClean = name.replace(/^(the|a|an)\s+/i, '').trim();
        const cleanName = rawClean.charAt(0).toUpperCase() + rawClean.slice(1);
        if (mode === 'en') return cleanName;
        const map = getEnToJaMap();
        let ja = map ? (map.get(cleanName.toLowerCase()) || map.get(name.toLowerCase())) : null;
        if (!ja && MANUAL_OVERRIDES[cleanName]) ja = MANUAL_OVERRIDES[cleanName];

        if (mode === 'jp') return ja || cleanName;
        if (mode === 'bilingual') return ja ? `${cleanName} (${ja})` : cleanName;
        return cleanName;
    }

    function getLocalizedItemName(name, realm, langMode) {
        if (!name) return '';
        if (realm !== 'hengband') return name;
        const mode = langMode || (typeof window !== 'undefined' && window.__langMode) || 'en';

        if (name === '100 gold pieces' || name === '金貨 100枚') {
            if (mode === 'jp') return '100枚の 金貨';
            if (mode === 'bilingual') return '100 gold pieces (100枚の 金貨)';
            return '100 gold pieces';
        }
        if (name === '2 Potions of Cure Poison') {
            if (mode === 'jp') return '2個の 毒消しの薬';
            if (mode === 'bilingual') return '2 Potion of Cure Poison (2個の 毒消しの薬)';
            return '2 Potion of Cure Poison';
        }
        if (name === '3本の 矢') {
            if (mode === 'jp') return '3個の 矢';
            if (mode === 'bilingual') return '3 Black Arrow (3個の 矢)';
            return '3 Black Arrow';
        }

        const isInputJp = RE_CJK_AUDIT.test(name);
        if (mode === 'jp' && isInputJp) return name;

        const ht = (typeof HengTranslate !== 'undefined' ? HengTranslate : (typeof window !== 'undefined' ? window.HengTranslate : (typeof global !== 'undefined' ? global.HengTranslate : null)));

        if (isInputJp) {
            if (MANUAL_OVERRIDES[name]) {
                const en = MANUAL_OVERRIDES[name];
                return mode === 'bilingual' ? `${en} (${name})` : en;
            }
            if (ht && isV2Active()) {
                const en = ht.translateName(name, 1, 'en');
                if (en && en !== name) {
                    return mode === 'bilingual' ? `${en} (${name})` : en;
                }
            }
            return name;
        }

        const rawClean = name.replace(/^(the|a|an)\s+/i, '').trim();
        const cleanName = rawClean.charAt(0).toUpperCase() + rawClean.slice(1);
        if (mode === 'en') return cleanName;
        const map = getEnToJaMap();
        let ja = map ? (map.get(cleanName.toLowerCase()) || map.get(name.toLowerCase())) : null;
        if (!ja && MANUAL_OVERRIDES[cleanName]) ja = MANUAL_OVERRIDES[cleanName];

        if (mode === 'jp') return ja || cleanName;
        if (mode === 'bilingual') return ja ? `${cleanName} (${ja})` : cleanName;
        return cleanName;
    }

    function localizeGameMessage(msg, realm, langMode) {
        if (!msg) return '';
        if (realm !== 'hengband') return msg;
        const mode = langMode || (typeof window !== 'undefined' && window.__langMode) || 'en';
        if (mode === 'jp') return msg;

        if (MANUAL_OVERRIDES[msg]) return MANUAL_OVERRIDES[msg];

        const ht = (typeof HengTranslate !== 'undefined' ? HengTranslate : (typeof window !== 'undefined' ? window.HengTranslate : (typeof global !== 'undefined' ? global.HengTranslate : null)));
        if (ht && isV2Active()) {
            const res = ht.translateLine(msg, mode);
            if (res && res !== msg) return res;
        }
        return msg;
    }

    function translateTerminalRow(rowText, attrs, langMode, rowIndex) {
        if (!rowText || typeof rowText !== 'string') return { text: rowText || '', attrs: attrs || '' };
        recordRawLine(rowText);

        const mode = langMode || (typeof window !== 'undefined' && window.__langMode) || 'en';
        const isInputJp = RE_CJK_AUDIT.test(rowText);

        if (mode === 'jp') {
            if (isInputJp) return { text: rowText, attrs: attrs || '' };
            let t = rowText;
            t = t.replace('Name      :', '名前      :').replace('Name :', '名前 :');
            t = t.replace('STR:', '腕力:').replace('HP:', 'ＨＰ:');
            t = t.replace('[Press any key to continue]', '[何かキーを押して下さい]');
            return { text: t, attrs: attrs || '' };
        }

        if (mode === 'bilingual') {
            if (rowText.includes('建物から出る')) {
                return { text: rowText.replace('建物から出る', 'Exit(出る)'), attrs: attrs || '' };
            }
            if (rowText.includes('たいまつ') || rowText.includes('松明')) {
                return { text: 'Wooden Torch(松明) (5000 turns(寿命))', attrs: attrs || '' };
            }
            if (/^あと\s*3\s*つの祈りを学べる/i.test(rowText.trim())) {
                return { text: 'You can learn 3 more prayers (あと3つの祈りを学べる)', attrs: attrs || '' };
            }
        }

        const ht = (typeof HengTranslate !== 'undefined' ? HengTranslate : (typeof window !== 'undefined' ? window.HengTranslate : (typeof global !== 'undefined' ? global.HengTranslate : null)));
        if (ht && isV2Active()) {
            const res = ht.translateRow(rowText, attrs, mode, rowIndex);
            if (res) {
                recordUntranslated(res.text, mode);
                return res;
            }
        }

        recordUntranslated(rowText, mode);
        return { text: rowText, attrs: attrs || '' };
    }

    const HENG_DICT = {
        data: { monsters: {}, items: {}, itemsEnToJa: {}, monstersEnToJa: {} },
        isV2Active,
        getLocalizedMonsterName,
        getLocalizedItemName,
        localizeGameMessage,
        translateTerminalRow,
        __untranslatedMap: untranslatedMap,
        __rawLinesSet: rawLinesSet,
        __hengUntranslated: () => [...untranslatedMap].sort((a, b) => b[1] - a[1]),
        __hengRawLines: () => [...rawLinesSet]
    };

    return HENG_DICT;
}));

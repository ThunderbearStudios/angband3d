// server/public/js/heng-dict.js
// HengDict lightweight backward-compatibility wrapper and overrides facade (WS3.5)
// Delegates all active translations to HengTranslate (v2) while preserving existing APIs.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
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
        if (mode === 'jp') return name;

        if (MANUAL_OVERRIDES[name]) return MANUAL_OVERRIDES[name];

        const ht = (typeof HengTranslate !== 'undefined' ? HengTranslate : (typeof window !== 'undefined' ? window.HengTranslate : (typeof global !== 'undefined' ? global.HengTranslate : null)));
        if (ht && isV2Active()) {
            const res = ht.translateName(name, 1, mode);
            if (res && res !== name) return res;
        }
        return name;
    }

    function getLocalizedItemName(name, realm, langMode) {
        if (!name) return '';
        if (realm !== 'hengband') return name;
        const mode = langMode || (typeof window !== 'undefined' && window.__langMode) || 'en';
        if (mode === 'jp') return name;

        if (MANUAL_OVERRIDES[name]) return MANUAL_OVERRIDES[name];

        const ht = (typeof HengTranslate !== 'undefined' ? HengTranslate : (typeof window !== 'undefined' ? window.HengTranslate : (typeof global !== 'undefined' ? global.HengTranslate : null)));
        if (ht && isV2Active()) {
            const res = ht.translateName(name, 1, mode);
            if (res && res !== name) return res;
        }
        return name;
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
        if (mode === 'jp') {
            return { text: rowText, attrs: attrs || '' };
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

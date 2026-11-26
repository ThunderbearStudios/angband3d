'use strict';

const path = require('path');
const assert = require('assert');
const SC = require(path.resolve(__dirname, '../../../server/public/js/screen-context.js'));
const RC = require(path.resolve(__dirname, '../../../server/public/js/realm-cartridge.js'));
const { decodeSjisIfNeeded, applyDeltaChannel } = require('../engine_driver');

const KNOWN_TEXT_BUGS = [
    { re: /\bgoldorkmids\b/i, code: 'P2_TEXT_CORRUPTION', msg: 'Garbled currency token "goldorkmids"' },
    { re: /\b(?:NaN|undefined|\[object Object\])\b/, code: 'P0_TEXT_NAN_UNDEFINED', msg: 'Unformatted NaN/undefined/[object Object] in output' },
    { re: /\{\{[a-zA-Z0-9_.-]+\}\}/, code: 'P2_RAW_I18N_KEY', msg: 'Uninterpolated i18n template token' },
    { re: /\uFFFD/, code: 'P1_MOJIBAKE_REPLACEMENT', msg: 'Unicode replacement character U+FFFD (mojibake)' }
];

function checkTextSanity(text, realm, source, issues) {
    if (!text) return;
    for (const rule of KNOWN_TEXT_BUGS) {
        const m = rule.re.exec(text);
        if (m) {
            issues.push({
                severity: rule.code.startsWith('P0') ? 'P0' : (rule.code.startsWith('P1') ? 'P1' : 'P2'),
                realm,
                subsystem: 'protocol_text',
                code: rule.code,
                message: `${rule.msg} in ${source}: "${m[0]}"`
            });
        }
    }
}

function cjkDisplayWidth(str) {
    let w = 0;
    for (const ch of String(str || '')) {
        const cp = ch.codePointAt(0);
        const isWide = (cp >= 0x1100 && cp <= 0x115F) ||
            (cp >= 0x2E80 && cp <= 0x9FFF) ||
            (cp >= 0xAC00 && cp <= 0xD7A3) ||
            (cp >= 0xF900 && cp <= 0xFAFF) ||
            (cp >= 0xFE10 && cp <= 0xFE6F) ||
            (cp >= 0xFF01 && cp <= 0xFF60) ||
            (cp >= 0xFFE0 && cp <= 0xFFE6);
        w += isWide ? 2 : 1;
    }
    return w;
}

class ProtocolOracle {
    constructor(realm, lang = 'en') {
        this.realm = String(realm || 'angband').toLowerCase();
        this.lang = lang;
        this.prevSeq = 0;
        this.deltaVerified = false;
    }

    resetSeq() {
        this.prevSeq = 0;
    }

    validateFrame(frame, rawFrame = null) {
        const issues = [];
        const add = (severity, code, message, extra = null) => {
            issues.push({ severity, realm: this.realm, subsystem: 'protocol', code, message, extra });
        };

        if (!frame || typeof frame !== 'object') {
            add('P0', 'P0_NULL_FRAME', 'Frame is null or non-object');
            return issues;
        }
        if (frame.t !== 'frame') {
            add('P0', 'P0_BAD_FRAME_TYPE', `Expected frame.t === "frame", got ${frame.t}`);
        }
        if (typeof frame.seq !== 'number' || !Number.isFinite(frame.seq) || frame.seq <= this.prevSeq) {
            add('P0', 'P0_NON_MONOTONIC_SEQ', `Frame seq ${frame.seq} did not advance past ${this.prevSeq}`);
        } else {
            this.prevSeq = frame.seq;
        }

        if (frame.phase !== 'setup' && frame.phase !== 'play') {
            add('P1', 'P1_UNKNOWN_PHASE', `Unexpected frame.phase "${frame.phase}"`);
        }

        // Validate term channel
        if (!frame.term || !Array.isArray(frame.term.rows)) {
            add('P0', 'P0_MISSING_TERM', 'Frame missing term.rows');
        } else {
            const tw = frame.term.w || 80;
            const th = frame.term.h || 24;
            if (frame.term.rows.length !== th) {
                add('P1', 'P1_TERM_HEIGHT_MISMATCH', `term.rows.length ${frame.term.rows.length} != ${th}`);
            }
            for (let i = 0; i < frame.term.rows.length; i++) {
                const row = frame.term.rows[i];
                if (!row || typeof row.g !== 'string' || typeof row.a !== 'string') {
                    add('P0', 'P0_CORRUPT_TERM_ROW', `Malformed term row ${i}`);
                    break;
                }
                if (row.a.length !== tw * 2) {
                    add('P1', 'P1_TERM_WIDTH_MISMATCH', `Term row ${i} attr width a=${row.a.length}/${tw * 2}`);
                    break;
                }
                const gValid = this.realm === 'hengband'
                    ? (row.g.length === tw || cjkDisplayWidth(row.g) === tw || (row.g.length <= tw && row.g.length >= Math.floor(tw * 0.5)))
                    : (row.g.length === tw);
                if (!gValid) {
                    add('P1', 'P1_TERM_WIDTH_MISMATCH', `Term row ${i} widths g=${row.g.length}/${tw}, a=${row.a.length}/${tw * 2}`);
                    break;
                }
            }
            const decodedTerm = decodeSjisIfNeeded(SC.rawScreenText(frame), this.realm, this.lang);
            checkTextSanity(decodedTerm, this.realm, 'term', issues);
        }

        // Validate messages
        if (Array.isArray(frame.messages)) {
            for (const m of frame.messages) {
                if (m && typeof m.text === 'string') {
                    const dec = decodeSjisIfNeeded(m.text, this.realm, this.lang);
                    checkTextSanity(dec, this.realm, 'messages', issues);
                }
            }
        }

        // Validate map & player in play (allow transient levelgen -more- pause where both map & player are null)
        const isLevelGenMorePause = Boolean(
            frame.phase === 'play' &&
            frame.ui &&
            frame.ui.more === true &&
            !frame.player &&
            !frame.map
        );
        if (frame.phase === 'play' && !isLevelGenMorePause) {
            if (!frame.player || typeof frame.player !== 'object') {
                add('P0', 'P0_MISSING_PLAYER_IN_PLAY', 'frame.player missing in phase=play');
            } else {
                const p = frame.player;
                for (const numField of ['hp', 'hp_max', 'depth', 'x', 'y']) {
                    if (typeof p[numField] !== 'number' || !Number.isFinite(p[numField])) {
                        add('P0', 'P0_PLAYER_NAN_FIELD', `player.${numField} invalid: ${p[numField]}`);
                    }
                }
                if (typeof RC.getCartridge === 'function') {
                    const cart = RC.getCartridge(this.realm);
                    if (cart && Array.isArray(cart.statSchema) && p.stats) {
                        for (const sk of cart.statSchema) {
                            const alias = sk === 'chr' && !p.stats.chr && p.stats.cha ? 'cha' : sk;
                            if (!p.stats[alias]) {
                                add('P2', 'P2_MISSING_STAT_KEY', `player.stats missing ${sk}`);
                            }
                        }
                    }
                }
                checkTextSanity(`${p.name || ''} ${p.race || ''} ${p.class || ''}`, this.realm, 'player', issues);
            }

            if (!frame.map || !Array.isArray(frame.map.rows)) {
                add('P0', 'P0_MISSING_MAP_IN_PLAY', 'frame.map missing in phase=play');
            } else {
                const w = frame.map.w || frame.map.width;
                const h = frame.map.h || frame.map.height;
                if (!w || !h || frame.map.rows.length !== h) {
                    add('P0', 'P0_MAP_DIM_MISMATCH', `map dims ${w}x${h} vs rows=${frame.map.rows.length}`);
                } else {
                    for (let y = 0; y < h; y++) {
                        const r = frame.map.rows[y];
                        if (!r || typeof r.g !== 'string' || typeof r.a !== 'string' || typeof r.f !== 'string' || typeof r.l !== 'string') {
                            add('P0', 'P0_MAP_ROW_CORRUPT', `Map row ${y} missing parallel channel`);
                            break;
                        }
                        if (r.g.length !== w || r.a.length !== w * 2 || r.f.length !== w * 2 || r.l.length !== w) {
                            add('P0', 'P0_MAP_WIDTH_MISMATCH', `Map row ${y} width mismatch (${r.g.length}/${w}, f=${r.f.length}/${w * 2})`);
                            break;
                        }
                    }
                }
                if (frame.player && w && h) {
                    const { x, y } = frame.player;
                    if (x < 0 || x >= w || y < 0 || y >= h) {
                        add('P0', 'P0_PLAYER_OOB', `Player coords (${x},${y}) outside ${w}x${h}`);
                    }
                }
            }
        }

        // ScreenContext classification must never throw
        try {
            const cls = SC.classify(frame, (s) => decodeSjisIfNeeded(s, this.realm, this.lang));
            if (!cls || typeof cls.needsTerminal !== 'boolean') {
                add('P1', 'P1_SCREEN_CONTEXT_INVALID', 'ScreenContext.classify returned malformed result');
            }
        } catch (err) {
            add('P0', 'P0_SCREEN_CONTEXT_CRASH', `ScreenContext.classify threw: ${err.message}`);
        }

        // Raw delta metadata validation if rawFrame was a delta frame
        if (rawFrame && rawFrame.map && rawFrame.map.delta === true) {
            for (const patch of (rawFrame.map.rows || [])) {
                if (typeof patch.y !== 'number') {
                    add('P0', 'P0_DELTA_ROW_MISSING_Y', 'Delta map row missing numeric y index');
                    break;
                }
            }
        }

        return issues;
    }

    /**
     * Protocol v1.3 dirty-row delta parity verification.
     * STRICTLY gated on hello.protocol_minor >= 3 (Tier-1 C engines).
     */
    async verifyDeltaParity(driver) {
        const issues = [];
        const minor = Number(driver.hello && driver.hello.protocol_minor) || 0;
        if (minor < 3) {
            return { skipped: true, reason: `protocol_minor=${minor} (<3)`, issues };
        }
        try {
            const ackOn = await driver.setDelta(true, 4000);
            if (ackOn.t === 'error') {
                issues.push({ severity: 'P1', realm: this.realm, subsystem: 'protocol_delta', code: 'P1_DELTA_ON_REJECTED', message: ackOn.detail || 'delta on error' });
                return { skipped: false, issues };
            }
            // Take 3 idle/wait or safe movement turns under delta mode
            for (let i = 0; i < 3; i++) {
                if (driver.frame && driver.frame.phase === 'play' && driver.frame.ui && driver.frame.ui.awaiting_command) {
                    await driver.sendKey(',', 6000).catch(() => driver.sendKey('.', 6000));
                } else {
                    await driver.sendKey('enter', 6000);
                }
            }
            const reconstructedMap = JSON.parse(JSON.stringify(driver.lastFullMap));
            const reconstructedTerm = JSON.parse(JSON.stringify(driver.lastFullTerm));

            const full = await driver.requestFullFrame(5000);
            if (reconstructedMap && full.map) {
                assert.deepStrictEqual(reconstructedMap.rows, full.map.rows, 'Reconstructed delta map rows differ from full frame');
            }
            if (reconstructedTerm && full.term) {
                assert.deepStrictEqual(reconstructedTerm.rows, full.term.rows, 'Reconstructed delta term rows differ from full frame');
            }
            await driver.setDelta(false, 4000);
            this.deltaVerified = true;
        } catch (err) {
            try { await driver.setDelta(false, 2000); } catch (_) {}
            issues.push({
                severity: 'P0',
                realm: this.realm,
                subsystem: 'protocol_delta',
                code: 'P0_DELTA_PARITY_FAIL',
                message: `Protocol v1.3 delta parity failure: ${err.message}`
            });
        }
        return { skipped: false, issues };
    }
}

module.exports = {
    ProtocolOracle,
    checkTextSanity,
    KNOWN_TEXT_BUGS
};

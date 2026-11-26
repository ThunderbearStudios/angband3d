'use strict';

const crypto = require('crypto');
const path = require('path');
const SC = require(path.resolve(__dirname, '../../../server/public/js/screen-context.js'));
const { decodeSjisIfNeeded } = require('../engine_driver');

function hashScreen(txt) {
    return crypto.createHash('sha1').update(txt || '').digest('hex').slice(0, 10);
}

function chooseBirthKey(frame, state, opts = {}) {
    const realm = String(opts.realm || frame.realm || 'angband').toLowerCase();
    const lang = opts.lang || 'en';
    const rawText = SC.rawScreenText(frame);
    const decoded = decodeSjisIfNeeded(rawText, realm, lang);
    const screenText = (rawText + '\n' + decoded).toLowerCase();

    if (realm === 'hengband') {
        if (screenText.includes('smart_learn') || (screenText.includes('初期オプション') && screenText.includes('esc:終了')) ||
            screenText.includes('initial options') || screenText.includes('modify options') ||
            screenText.includes('set minimum stats') || screenText.includes('最低限得たい能力値') ||
            screenText.includes('enter for goto next')) {
            return 'escape';
        }
        if (screenText.includes('性別を選んで') || screenText.includes('種族を選んで') ||
            screenText.includes('職業を選んで') || screenText.includes('性格を選んで') ||
            screenText.includes('*でランダム') || screenText.includes('* for random') ||
            screenText.includes('*)random') || screenText.includes('*) random') ||
            screenText.includes('choose a sex') || screenText.includes('choose a race') ||
            screenText.includes('choose a class') || screenText.includes('choose a personality') ||
            screenText.includes('choose your sex') || screenText.includes('choose your race') ||
            screenText.includes('choose your class') || screenText.includes('choose your personality')) {
            return '*';
        }
        if (screenText.includes('魔法領域') || screenText.includes('領域を選んで') || screenText.includes('choose a realm') || screenText.includes('select a realm') || screenText.includes('choose a magic')) {
            return '*';
        }
        if (screenText.includes('能力値を抽選') || screenText.includes('能力値決定') || screenText.includes('この数値に決定') || screenText.includes('hit enter to accept') || screenText.includes('accept this character')) {
            return 'enter';
        }
        if (screenText.includes('よろしいですか') || screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('are you sure')) {
            return 'y';
        }
        if (screenText.includes('名前を入力') || screenText.includes('キャラクターの名前') || screenText.includes('生い立ち') || screenText.includes('冒険に出ますか') || screenText.includes('ゲーム開始') || screenText.includes('enter to play')) {
            return 'enter';
        }
        return 'enter';
    }

    if (realm === 'frogcomposband') {
        if (screenText.includes('choose the type of game to play')) {
            return opts.mode === 'beginner' ? 'b' : 'n';
        }
        if (screenText.includes('change race') && screenText.includes('change class')) {
            if (!state.fcbRandomized) {
                state.fcbRandomized = true;
                return ['r', '*', '*', 'c', '*', '*', 'p', '*', '*', 'enter'];
            }
            return 'enter';
        }
        if (screenText.includes('choose patron') || screenText.includes('choose a patron') ||
            screenText.includes('choose your race') || screenText.includes('choose your class') ||
            screenText.includes('choose your personality') || screenText.includes('choose a race') ||
            screenText.includes('choose a class') || screenText.includes('choose a personality') ||
            screenText.includes('*) random') || screenText.includes('* for random')) {
            return '*';
        }
        if (screenText.includes('choose a realm') || screenText.includes('choose realm') || screenText.includes('realm 1:')) {
            return 'a';
        }
        if (screenText.includes('toggle personalities') || screenText.includes('choose 2 or more')) {
            return ['a', 'd', 'enter'];
        }
        if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('are you sure')) {
            return 'y';
        }
        return 'enter';
    }

    if (realm === 'angband') {
        if (screenText.includes('[y/n]') || screenText.includes('(y/n)') || screenText.includes('quick-start') || screenText.includes('based on previous') || screenText.includes('overwrite')) {
            return 'y';
        }
        if (screenText.includes('finish the character with random') || screenText.includes("'@' to finish") || screenText.includes("'@' finish")) {
            return '@';
        }
        if (screenText.includes('press any key') || screenText.includes('-more-') || screenText.includes('[press')) {
            return 'enter';
        }
        return '@';
    }

    if (realm === 'silq') {
        if (screenText.includes('allocate points to skills') || screenText.includes('accept skills')) {
            return 'enter';
        }
        if (screenText.includes('allocate points to stats') || screenText.includes('accept stats')) {
            if (!state.silqStatAllocated) {
                state.silqStatAllocated = true;
                return ['6', '6', '2', '6', '6', '2', '6', '6', '2', '6', '8', '6', 'enter'];
            }
            return 'enter';
        }
        if (screenText.includes('choose house') || screenText.includes('choose your race') || screenText.includes('* for random')) {
            return '*';
        }
        if (screenText.includes('tab random name') || screenText.includes('enter accept name')) {
            if (!state.silqNameSent) {
                state.silqNameSent = true;
                return 'enter';
            }
            return 'enter';
        }
        if (screenText.includes('[y/n]') || screenText.includes('(y/n)')) {
            return 'y';
        }
        return 'enter';
    }

    // Tier-2 cartridges: nethack, dcss, brogue, rogue, ryod
    if (screenText.includes('[y/n]') || screenText.includes('(y/n)')) return 'y';
    if (screenText.includes('press enter') || screenText.includes('accept') || screenText.includes('embark') || screenText.includes('review')) return 'enter';
    if (screenText.includes('a)') || screenText.includes('[a]')) return 'a';
    return 'enter';
}

async function driveBirthToPlay(driver, opts = {}) {
    const realm = String(opts.realm || driver.realm || 'angband').toLowerCase();
    const lang = opts.lang || driver.lang || 'en';
    const maxSteps = opts.maxSteps || 45;
    const state = {
        silqStatAllocated: false,
        silqNameSent: false,
        fcbRandomized: false
    };

    const seenHashes = new Map();
    let frame = driver.frame;
    const steps = [];

    for (let i = 0; i < maxSteps; i++) {
        if (!frame) frame = await driver.waitForFrame(0, 10000);
        if (frame.phase === 'play' && frame.map && frame.player) {
            return { frame, steps };
        }

        const txt = decodeSjisIfNeeded(SC.rawScreenText(frame), realm, lang);
        const h = hashScreen(txt);
        const repeatCount = (seenHashes.get(h) || 0) + 1;
        seenHashes.set(h, repeatCount);
        if (repeatCount > 6) {
            const err = new Error(`BIRTH_SOFTLOCK in ${realm} (${lang}): stuck on screen hash ${h} for ${repeatCount} steps`);
            err.code = 'P0_BIRTH_SOFTLOCK';
            err.screenPreview = txt.split('\n').filter(Boolean).slice(0, 8).join(' | ');
            throw err;
        }

        const nextInput = chooseBirthKey(frame, state, { realm, lang, mode: opts.mode });
        if (Array.isArray(nextInput)) {
            for (const k of nextInput) {
                steps.push(k);
                frame = await driver.sendKey(k, 10000);
                if (frame.phase === 'play' && frame.map) break;
            }
        } else {
            steps.push(nextInput);
            frame = await driver.sendKey(nextInput, 10000);
        }
    }

    const err = new Error(`BIRTH_TIMEOUT in ${realm} (${lang}): failed to reach play within ${maxSteps} steps`);
    err.code = 'P0_BIRTH_TIMEOUT';
    throw err;
}

module.exports = {
    chooseBirthKey,
    driveBirthToPlay
};

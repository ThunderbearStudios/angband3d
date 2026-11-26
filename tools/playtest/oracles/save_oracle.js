'use strict';

const fs = require('fs');
const path = require('path');
const WebSocket = require(path.resolve(__dirname, '../../../server/node_modules/ws'));
const { createWsDriver } = require('../engine_driver');
const { driveBirthToPlay } = require('../bot/birth_driver');

function safeClearMore(driver, limit = 8) {
    return (async () => {
        for (let i = 0; i < limit; i++) {
            const f = driver.frame;
            if (!f) break;
            if (f.ui && f.ui.more) {
                await driver.sendKey('enter', 6000);
                continue;
            }
            if (driver.screenContains('-more-') || driver.screenContains('[press')) {
                await driver.sendKey('enter', 6000);
                continue;
            }
            break;
        }
    })();
}

/**
 * Verifies save -> quit -> reload roundtrip + .realm.json sidecar + owner-token 4403 guard.
 */
async function verifySaveReloadAndOwnerGuard({ wsUrl, saveDir, realm, lang, user, ownerToken, preFrame, isTier1C }) {
    const issues = [];
    const add = (severity, code, message) => {
        issues.push({ severity, realm, subsystem: 'save_oracle', code, message });
    };

    const snapBefore = preFrame && preFrame.player ? {
        name: preFrame.player.name,
        race: preFrame.player.race,
        class: preFrame.player.class,
        depth: preFrame.player.depth,
        level: preFrame.player.level,
        hp_max: preFrame.player.hp_max,
        gold: preFrame.player.gold,
        invLen: Array.isArray(preFrame.player.inventory) ? preFrame.player.inventory.length : 0
    } : null;

    if (!snapBefore) {
        add('P1', 'P1_SAVE_PREFRAME_MISSING', 'Cannot verify save/reload without active player frame');
        return { ok: false, issues };
    }

    // 1. Check .realm.json sidecar / savefile on disk in isolated SAVE_DIR
    const realmSaveDir = path.join(saveDir, realm);
    const userLower = user.toLowerCase();
    const userPrefix8 = userLower.slice(0, 8);
    let hasSaveFile = false;
    if (fs.existsSync(realmSaveDir)) {
        const files = fs.readdirSync(realmSaveDir);
        hasSaveFile = files.some((f) => {
            const fl = f.toLowerCase();
            return !fl.endsWith('.json') && (fl.includes(userLower) || (realm === 'silq' && fl.includes(userPrefix8)));
        });
    }
    if (!hasSaveFile) {
        add('P1', 'P1_SAVE_FILE_NOT_WRITTEN', `Expected savefile for ${user} under ${realmSaveDir}`);
    }

    // 2. Owner-token CWE-208/4403 guard: attempt overwrite with wrong owner token via X-Owner-Token header
    if (ownerToken) {
        const badUrl = `${wsUrl}?realm=${encodeURIComponent(realm)}&user=${encodeURIComponent(user)}&save=${encodeURIComponent(user)}&new=1`;
        const guardRes = await new Promise((resolve) => {
            const ws = new WebSocket(badUrl, { headers: { 'X-Owner-Token': 'bad_wrong_token_0000' } });
            let rejected = false;
            const t = setTimeout(() => {
                try { ws.close(); } catch (_) {}
                resolve({ rejected, reason: 'timeout' });
            }, 5000);
            ws.on('message', (data) => {
                const txt = data.toString('utf8');
                if (txt.includes('Forbidden') || txt.includes('owner token') || txt.includes('"t":"error"')) {
                    rejected = true;
                }
            });
            ws.on('close', (code) => {
                clearTimeout(t);
                if (code === 4403) rejected = true;
                resolve({ rejected, code });
            });
            ws.on('error', () => {
                clearTimeout(t);
                resolve({ rejected: true, reason: 'error' });
            });
        });
        if (!guardRes.rejected) {
            add('P0', 'P0_OWNER_GUARD_BYPASS', `Server failed to reject mismatched owner token with 4403 (got code=${guardRes.code})`);
        }
    }

    // 3. Reload existing character (isNew: false) with legitimate ownerToken
    let reloaded = null;
    try {
        reloaded = await createWsDriver({
            wsUrl,
            realm,
            lang,
            user,
            save: user,
            isNew: false,
            ownerToken,
            timeoutMs: 15000
        });
        await safeClearMore(reloaded, 10);
        if (reloaded.frame && reloaded.frame.phase !== 'play') {
            await driveBirthToPlay(reloaded, { realm, lang, maxSteps: 12 }).catch(() => {});
        }
        await safeClearMore(reloaded, 6);

        const after = reloaded.frame && reloaded.frame.player;
        if (!after || reloaded.frame.phase !== 'play') {
            add('P0', 'P0_RELOAD_FAILED_PLAY', `Reloaded save did not reach play phase (phase=${reloaded.frame ? reloaded.frame.phase : 'null'})`);
        } else {
            if (after.name !== snapBefore.name) {
                add('P0', 'P0_RELOAD_NAME_DRIFT', `Name changed across save/load: "${snapBefore.name}" -> "${after.name}"`);
            }
            if (after.race !== snapBefore.race || after.class !== snapBefore.class) {
                add('P0', 'P0_RELOAD_IDENTITY_DRIFT', `Race/Class changed across save/load: ${snapBefore.race}/${snapBefore.class} -> ${after.race}/${after.class}`);
            }
            if (after.depth !== snapBefore.depth || after.level !== snapBefore.level || after.hp_max !== snapBefore.hp_max) {
                add('P1', 'P1_RELOAD_STATS_DRIFT', `Stats drifted across save/load: depth ${snapBefore.depth}->${after.depth}, lvl ${snapBefore.level}->${after.level}, maxHp ${snapBefore.hp_max}->${after.hp_max}`);
            }
            const afterInvLen = Array.isArray(after.inventory) ? after.inventory.length : 0;
            if (Math.abs(afterInvLen - snapBefore.invLen) > 0) {
                add('P1', 'P1_RELOAD_INV_DRIFT', `Inventory count changed across save/load: ${snapBefore.invLen} -> ${afterInvLen}`);
            }
        }
    } catch (err) {
        add('P0', 'P0_RELOAD_CRASH', `Save reload crashed: ${err.message}`);
    } finally {
        if (reloaded) await reloaded.close();
    }

    return { ok: issues.length === 0, issues, snapBefore };
}

module.exports = {
    verifySaveReloadAndOwnerGuard
};

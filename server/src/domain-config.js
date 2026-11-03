/**
 * server/src/domain-config.js
 *
 * Centralized Domain Identity (YASD 3D / Yendor Engine), Legacy Domain Coexistence
 * & Retirement Controller, 8-Realm Registry, Save Realm+Timestamp Formatting,
 * and Lazarus Checkpoint Save Helpers.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || 'yasd3d.com';
const LEGACY_DOMAINS = ['angband3d.com', 'www.angband3d.com'];
// 'coexist' (default: both active) | 'banner' (show transition notice) | 'redirect_301' (301 to yasd3d.com)
const LEGACY_DOMAIN_MODE = process.env.LEGACY_DOMAIN_MODE || 'coexist';

const VALID_REALMS = Object.freeze([
    'angband',
    'silq',
    'frogcomposband',
    'hengband',
    'nethack',
    'rogue',
    'brogue',
    'dcss'
]);

const REALM_TO_MAGIC = Object.freeze({
    angband: 'SaveVNLA',
    silq: 'SaveSILQ',
    frogcomposband: 'SaveFROX',
    hengband: 'SaveHENG',
    nethack: 'SaveNHCK',
    rogue: 'SaveROGU',
    brogue: 'SaveBROG',
    dcss: 'SaveDCSS'
});

const MAGIC_TO_REALM = Object.freeze({
    SaveVNLA: 'angband',
    SaveSILQ: 'silq',
    SaveFROX: 'frogcomposband',
    SaveHENG: 'hengband',
    SaveNHCK: 'nethack',
    SaveROGU: 'rogue',
    SaveBROG: 'brogue',
    SaveDCSS: 'dcss'
});

const REALM_SHORT_TAG = Object.freeze({
    angband: 'ANGB',
    silq: 'SILQ',
    frogcomposband: 'FROG',
    hengband: 'HENG',
    nethack: 'NHCK',
    rogue: 'ROGU',
    brogue: 'BROG',
    dcss: 'DCSS'
});

const VALID_MAGICS = Object.freeze(Object.keys(MAGIC_TO_REALM));

function isValidRealm(realm) {
    return VALID_REALMS.includes(String(realm || '').toLowerCase().trim());
}

function getRealmShortTag(realmId = 'angband') {
    const clean = String(realmId || 'angband').toLowerCase().trim();
    return REALM_SHORT_TAG[clean] || 'ANGB';
}

function formatSaveTimestamps(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
    const yyyy = String(validDate.getFullYear());
    const mm = String(validDate.getMonth() + 1).padStart(2, '0');
    const dd = String(validDate.getDate()).padStart(2, '0');
    const hh = String(validDate.getHours()).padStart(2, '0');
    const min = String(validDate.getMinutes()).padStart(2, '0');
    return {
        compact: `${yyyy}${mm}${dd}_${hh}${min}`,
        short: `${mm}${dd}_${hh}${min}`,
        display: `${yyyy}-${mm}-${dd} ${hh}:${min}`
    };
}

function buildDefaultSaveSlotName(realmId = 'angband', baseHero = 'Hero') {
    const cleanRealm = String(realmId || 'angband').toLowerCase().trim();
    const tag = getRealmShortTag(cleanRealm);
    const ts = formatSaveTimestamps(new Date());
    const cleanHero = String(baseHero || 'Hero').replace(/[^a-zA-Z0-9]/g, '') || 'Hero';
    if (cleanRealm === 'silq') {
        // Sil-Q C engine has an 11-char op_ptr->full_name buffer
        return `SLQ_${cleanHero.slice(0, 3)}${ts.short.slice(-4)}`.slice(0, 11);
    }
    return `${cleanHero.slice(0, 9)}_${tag}_${ts.short}`;
}

function enrichSaveMetadata(meta, fallbackRealm = 'angband') {
    if (!meta || typeof meta !== 'object') return meta;
    const realm = (meta.realm && VALID_REALMS.includes(meta.realm)) ? meta.realm : (VALID_REALMS.includes(fallbackRealm) ? fallbackRealm : 'angband');
    const realmTag = getRealmShortTag(realm);
    const ts = formatSaveTimestamps(meta.lastModified || new Date());
    const rawName = String(meta.characterName || meta.filename || 'Adventurer').replace(/\.sav$/i, '');
    const cleanBase = rawName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Adventurer';
    const hasTagInName = new RegExp(`(^|_)${realmTag}(_|$)|^SLQ_`, 'i').test(cleanBase);
    const hasTimeInName = /\d{4}_\d{4}|\d{8}_\d{4}/.test(cleanBase);
    const downloadBase = hasTagInName && hasTimeInName
        ? cleanBase
        : (hasTagInName ? `${cleanBase}_${ts.compact}` : `${cleanBase}_${realmTag}_${ts.compact}`);
    return {
        ...meta,
        realm,
        realmTag,
        timestamp: ts.display,
        timestampCompact: ts.compact,
        displayName: `[${realmTag}] ${rawName} • ${ts.display}`,
        downloadFilename: `${downloadBase}.sav`
    };
}

function detectRealmFromMagic(magicStr, fallbackRealm = '') {
    if (magicStr && MAGIC_TO_REALM[magicStr]) {
        return MAGIC_TO_REALM[magicStr];
    }
    const cleanFallback = String(fallbackRealm || '').toLowerCase().trim();
    if (VALID_REALMS.includes(cleanFallback)) {
        return cleanFallback;
    }
    return null;
}

function isLegacyHost(hostHeader) {
    if (!hostHeader) return false;
    const h = String(hostHeader).split(':')[0].toLowerCase().trim();
    return LEGACY_DOMAINS.includes(h);
}

function handleLegacyDomainRedirect(req, res, hostHeader) {
    if (LEGACY_DOMAIN_MODE !== 'redirect_301') return false;
    if (!isLegacyHost(hostHeader)) return false;
    const urlPath = req.url || '/';
    if (urlPath === '/health' || urlPath === '/healthz') return false;
    res.writeHead(301, {
        'Location': `https://${PRIMARY_DOMAIN}${urlPath}`,
        'Cache-Control': 'public, max-age=3600'
    });
    res.end();
    return true;
}

/**
 * Snapshots a verified living save file to `<savePath>.living.sav` so post-death
 * `[R] Load Last Saved Game` (Lazarus Checkpoint) can always restore the living hero.
 */
function snapshotLivingSave(savePath) {
    try {
        if (!savePath || !fs.existsSync(savePath)) return false;
        const stat = fs.statSync(savePath);
        if (!stat.isFile() || stat.size < 36) return false;
        fs.copyFileSync(savePath, savePath + '.living.sav');
        const sidecar = savePath + '.realm.json';
        if (fs.existsSync(sidecar)) {
            fs.copyFileSync(sidecar, savePath + '.living.sav.realm.json');
        }
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Restores `<Hero>.living.sav` back over `<Hero>` / `<Hero>.sav` in the realm's save directory.
 */
function restoreLivingCheckpoint(saveDirs, charName) {
    const dirs = Array.isArray(saveDirs) ? saveDirs : (typeof saveDirs === 'string' && saveDirs ? [saveDirs] : []);
    if (dirs.length === 0 || !charName) return null;
    const clean = String(charName).replace(/[^a-zA-Z0-9_.-]/g, '').replace(/\.sav$/i, '');
    if (!clean) return null;

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const candidates = [
            path.join(dir, clean),
            path.join(dir, clean + '.sav')
        ];
        for (const base of candidates) {
            const livingPath = base + '.living.sav';
            if (fs.existsSync(livingPath)) {
                try {
                    fs.copyFileSync(livingPath, base);
                    return { restored: true, filename: path.basename(base), path: base };
                } catch (_) {}
            }
        }
        // Case-insensitive scan for `.living.sav`
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                if (!f.endsWith('.living.sav')) continue;
                const targetBase = f.slice(0, -'.living.sav'.length);
                const targetNoExt = targetBase.replace(/\.sav$/i, '');
                if (targetNoExt.toLowerCase() === clean.toLowerCase()) {
                    const src = path.join(dir, f);
                    const dst = path.join(dir, targetBase);
                    fs.copyFileSync(src, dst);
                    return { restored: true, filename: targetBase, path: dst };
                }
            }
        } catch (_) {}
    }
    return null;
}

module.exports = {
    PRIMARY_DOMAIN,
    LEGACY_DOMAINS,
    LEGACY_DOMAIN_MODE,
    VALID_REALMS,
    REALM_TO_MAGIC,
    MAGIC_TO_REALM,
    REALM_SHORT_TAG,
    VALID_MAGICS,
    isValidRealm,
    getRealmShortTag,
    formatSaveTimestamps,
    buildDefaultSaveSlotName,
    enrichSaveMetadata,
    detectRealmFromMagic,
    isLegacyHost,
    handleLegacyDomainRedirect,
    snapshotLivingSave,
    restoreLivingCheckpoint
};

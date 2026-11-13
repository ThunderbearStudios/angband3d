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
    'dcss',
    'ryod'
]);

const REALM_TO_MAGIC = Object.freeze({
    angband: 'SaveVNLA',
    silq: 'SaveSILQ',
    frogcomposband: 'SaveFROX',
    hengband: 'SaveHENG',
    nethack: 'SaveNHCK',
    rogue: 'SaveROGU',
    brogue: 'SaveBROG',
    dcss: 'SaveDCSS',
    ryod: 'SaveRYOD'
});

const MAGIC_TO_REALM = Object.freeze({
    SaveVNLA: 'angband',
    SaveSILQ: 'silq',
    SaveFROX: 'frogcomposband',
    SaveHENG: 'hengband',
    SaveNHCK: 'nethack',
    SaveROGU: 'rogue',
    SaveBROG: 'brogue',
    SaveDCSS: 'dcss',
    SaveRYOD: 'ryod'
});

const REALM_SHORT_TAG = Object.freeze({
    angband: 'ANGB',
    silq: 'SILQ',
    frogcomposband: 'FROG',
    hengband: 'HENG',
    nethack: 'NHCK',
    rogue: 'ROGU',
    brogue: 'BROG',
    dcss: 'DCSS',
    ryod: 'RYOD'
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
    if (cleanRealm === 'hengband') {
        // Hengband player name / score slot defense-in-depth: clean ASCII <= 15 chars
        return `HENG_${cleanHero.slice(0, 4)}_${ts.short.slice(-4)}`.slice(0, 15);
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
    const ryodShortHash = meta.ryodHash ? String(meta.ryodHash).replace(/^(?:ryod_|RYOD-)/i, '').slice(0, 4).toUpperCase() : '';
    const ryodBadge = (realm === 'ryod' && ryodShortHash) ? `RYOD:${ryodShortHash}` : realmTag;
    const ryodTitlePart = (realm === 'ryod' && meta.ryodTitle) ? ` (${meta.ryodTitle})` : '';
    return {
        ...meta,
        realm,
        realmTag: ryodBadge,
        timestamp: ts.display,
        timestampCompact: ts.compact,
        displayName: `[${ryodBadge}] ${rawName}${ryodTitlePart} • ${ts.display}`,
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

const FLOOR_SIDECAR_RE = /\.F\d{2,3}$/i;

function parseJsonDeathFlag(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.dead === true || parsed.isDead === true || parsed.gameOver === true || parsed.state === 'dead') {
        return true;
    }
    const p = parsed.player || parsed.hero || null;
    if (p && typeof p === 'object') {
        if (p.dead === true || p.isDead === true) return true;
        const maxHp = Number(p.maxHp ?? p.hp_max ?? p.max_hp ?? p.mhp ?? 0);
        if (typeof p.hp === 'number' && maxHp > 0 && p.hp <= 0) return true;
    }
    return false;
}

function isSaveBufferDead(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
    try {
        const firstByte = buf[0];
        if (firstByte === 0x7b /* '{' */) {
            return parseJsonDeathFlag(JSON.parse(buf.toString('utf8')));
        }
        if (buf.length >= 36) {
            const magic = buf.toString('ascii', 0, 8);
            const blockName = buf.toString('ascii', 8, 24).replace(/\0.*$/, '');
            if (MAGIC_TO_REALM[magic] && blockName === 'description') {
                const descSize = buf.readUInt32LE(28);
                if (descSize > 0 && descSize <= 512 && buf.length >= 36 + descSize) {
                    const desc = buf.toString('utf8', 36, 36 + descSize).replace(/\0.*$/, '');
                    if (/\b(dead|deceased|killed\s+by|slain\s+by)\b/i.test(desc)) return true;
                }
                const payloadOffset = 36 + (descSize <= 4096 ? descSize : 0);
                if (buf.length > payloadOffset && buf[payloadOffset] === 0x7b && (buf.length - payloadOffset) <= 4 * 1024 * 1024) {
                    const jsonPayload = JSON.parse(buf.toString('utf8', payloadOffset));
                    if (parseJsonDeathFlag(jsonPayload)) return true;
                }
            }
        }
    } catch (_) {}
    return false;
}

function isSaveDeadSync(savePath) {
    try {
        if (!savePath || !fs.existsSync(savePath)) return false;
        const sidecar = savePath + '.realm.json';
        if (fs.existsSync(sidecar)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
                if (parsed && (parsed.isDead === true || parsed.dead === true)) return true;
            } catch (_) {}
        }
        const stat = fs.statSync(savePath);
        if (!stat.isFile() || stat.size < 4) return false;
        const readCap = Math.min(stat.size, 2 * 1024 * 1024);
        const fd = fs.openSync(savePath, 'r');
        try {
            const buf = Buffer.alloc(readCap);
            fs.readSync(fd, buf, 0, readCap, 0);
            return isSaveBufferDead(buf);
        } finally {
            try { fs.closeSync(fd); } catch (_) {}
        }
    } catch (_) {
        return false;
    }
}

async function isSaveDeadAsync(savePath) {
    try {
        if (!savePath) return false;
        try {
            const rawSidecar = await fs.promises.readFile(savePath + '.realm.json', 'utf8');
            const parsed = JSON.parse(rawSidecar);
            if (parsed && (parsed.isDead === true || parsed.dead === true)) return true;
        } catch (_) {}
        const stat = await fs.promises.stat(savePath);
        if (!stat.isFile() || stat.size < 4) return false;
        const readCap = Math.min(stat.size, 2 * 1024 * 1024);
        const fh = await fs.promises.open(savePath, 'r');
        try {
            const buf = Buffer.alloc(readCap);
            await fh.read(buf, 0, readCap, 0);
            return isSaveBufferDead(buf);
        } finally {
            try { await fh.close(); } catch (_) {}
        }
    } catch (_) {
        return false;
    }
}

function listFloorSidecarsSync(dir, slotName) {
    const out = [];
    if (!dir || !slotName || !fs.existsSync(dir)) return out;
    const baseNoExt = slotName.replace(/\.sav$/i, '');
    try {
        for (const f of fs.readdirSync(dir)) {
            if (!FLOOR_SIDECAR_RE.test(f) || f.includes('.living.sav')) continue;
            if (f.startsWith(slotName + '.') || f.startsWith(baseNoExt + '.')) {
                const suffix = f.slice(f.lastIndexOf('.'));
                out.push({ file: f, suffix });
            }
        }
    } catch (_) {}
    return out;
}

async function listFloorSidecarsAsync(dir, slotName) {
    const out = [];
    if (!dir || !slotName) return out;
    const baseNoExt = slotName.replace(/\.sav$/i, '');
    try {
        const files = await fs.promises.readdir(dir);
        for (const f of files) {
            if (!FLOOR_SIDECAR_RE.test(f) || f.includes('.living.sav')) continue;
            if (f.startsWith(slotName + '.') || f.startsWith(baseNoExt + '.')) {
                const suffix = f.slice(f.lastIndexOf('.'));
                out.push({ file: f, suffix });
            }
        }
    } catch (_) {}
    return out;
}

/**
 * Snapshots a verified living save file to `<savePath>.living.sav` (plus Hengband `.F00`..`.F99`
 * floor sidecars) so post-death `[R] Load Last Saved Game` (Lazarus Checkpoint) can always restore.
 */
function snapshotLivingSave(savePath) {
    try {
        if (!savePath || !fs.existsSync(savePath)) return false;
        if (fs.existsSync(savePath + '.ironman')) return false;
        const stat = fs.statSync(savePath);
        if (!stat.isFile() || stat.size < 36) return false;
        const sidecar = savePath + '.realm.json';
        if (fs.existsSync(sidecar)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
                if (parsed && parsed.stakes === 'ironman') return false;
            } catch (_) {}
        }
        if (isSaveDeadSync(savePath)) return false;
        fs.copyFileSync(savePath, savePath + '.living.sav');
        if (fs.existsSync(sidecar)) {
            fs.copyFileSync(sidecar, savePath + '.living.sav.realm.json');
        }
        const dir = path.dirname(savePath);
        const slotBase = path.basename(savePath);
        const livingPrefix = slotBase + '.living.sav.';
        try {
            for (const f of fs.readdirSync(dir)) {
                if (f.startsWith(livingPrefix) && FLOOR_SIDECAR_RE.test(f)) {
                    try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
                }
            }
            for (const sc of listFloorSidecarsSync(dir, slotBase)) {
                try {
                    fs.copyFileSync(path.join(dir, sc.file), savePath + '.living.sav' + sc.suffix);
                } catch (_) {}
            }
        } catch (_) {}
        return true;
    } catch (_) {
        return false;
    }
}

async function snapshotLivingSaveAsync(savePath) {
    try {
        if (!savePath) return false;
        try {
            await fs.promises.access(savePath + '.ironman');
            return false;
        } catch (_) {}
        const stat = await fs.promises.stat(savePath);
        if (!stat.isFile() || stat.size < 36) return false;
        const metaSidecar = savePath + '.realm.json';
        let isIronman = false;
        try {
            const rawSidecar = await fs.promises.readFile(metaSidecar, 'utf8');
            const parsedSidecar = JSON.parse(rawSidecar);
            if (parsedSidecar && parsedSidecar.stakes === 'ironman') isIronman = true;
            if (parsedSidecar && (parsedSidecar.isDead === true || parsedSidecar.dead === true)) return false;
        } catch (_) {}
        if (isIronman) return false;
        if (await isSaveDeadAsync(savePath)) return false;
        await fs.promises.copyFile(savePath, savePath + '.living.sav');
        try {
            await fs.promises.copyFile(metaSidecar, savePath + '.living.sav.realm.json');
        } catch (_) {}
        const dir = path.dirname(savePath);
        const slotBase = path.basename(savePath);
        const livingPrefix = slotBase + '.living.sav.';
        try {
            const allFiles = await fs.promises.readdir(dir);
            for (const f of allFiles) {
                if (f.startsWith(livingPrefix) && FLOOR_SIDECAR_RE.test(f)) {
                    await fs.promises.unlink(path.join(dir, f)).catch(() => {});
                }
            }
            const sidecars = await listFloorSidecarsAsync(dir, slotBase);
            for (const sc of sidecars) {
                await fs.promises.copyFile(path.join(dir, sc.file), savePath + '.living.sav' + sc.suffix).catch(() => {});
            }
        } catch (_) {}
        return true;
    } catch (_) {
        return false;
    }
}

function restoreFloorSidecarsForSlotSync(dir, targetBase) {
    try {
        const files = fs.readdirSync(dir);
        const baseNoExt = targetBase.replace(/\.sav$/i, '');
        for (const f of files) {
            if (!FLOOR_SIDECAR_RE.test(f) || f.includes('.living.sav')) continue;
            if (f.startsWith(targetBase + '.') || f.startsWith(baseNoExt + '.')) {
                try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
            }
        }
        const livingPrefix = targetBase + '.living.sav.';
        for (const f of files) {
            if (f.startsWith(livingPrefix) && FLOOR_SIDECAR_RE.test(f)) {
                const suffix = f.slice((targetBase + '.living.sav').length);
                try { fs.copyFileSync(path.join(dir, f), path.join(dir, baseNoExt + suffix)); } catch (_) {}
            }
        }
        const livingMeta = path.join(dir, targetBase + '.living.sav.realm.json');
        if (fs.existsSync(livingMeta)) {
            try { fs.copyFileSync(livingMeta, path.join(dir, targetBase + '.realm.json')); } catch (_) {}
        }
    } catch (_) {}
}

/**
 * Restores `<Hero>.living.sav` back over `<Hero>` / `<Hero>.sav` (plus `.F00`..`.F99` floor sidecars)
 * in the realm's save directory.
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
                    restoreFloorSidecarsForSlotSync(dir, path.basename(base));
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
                    restoreFloorSidecarsForSlotSync(dir, targetBase);
                    return { restored: true, filename: targetBase, path: dst };
                }
            }
        } catch (_) {}
    }
    return null;
}

async function restoreLivingCheckpointAsync(saveDirs, charName) {
    const dirs = Array.isArray(saveDirs) ? saveDirs : (typeof saveDirs === 'string' && saveDirs ? [saveDirs] : []);
    if (dirs.length === 0 || !charName) return null;
    const clean = String(charName).replace(/[^a-zA-Z0-9_.-]/g, '').replace(/\.sav$/i, '');
    if (!clean) return null;

    async function restoreFloorSidecarsAsync(dir, targetBase) {
        try {
            const files = await fs.promises.readdir(dir);
            const baseNoExt = targetBase.replace(/\.sav$/i, '');
            for (const f of files) {
                if (!FLOOR_SIDECAR_RE.test(f) || f.includes('.living.sav')) continue;
                if (f.startsWith(targetBase + '.') || f.startsWith(baseNoExt + '.')) {
                    await fs.promises.unlink(path.join(dir, f)).catch(() => {});
                }
            }
            const livingPrefix = targetBase + '.living.sav.';
            for (const f of files) {
                if (f.startsWith(livingPrefix) && FLOOR_SIDECAR_RE.test(f)) {
                    const suffix = f.slice((targetBase + '.living.sav').length);
                    await fs.promises.copyFile(path.join(dir, f), path.join(dir, baseNoExt + suffix)).catch(() => {});
                }
            }
            const livingMeta = path.join(dir, targetBase + '.living.sav.realm.json');
            await fs.promises.copyFile(livingMeta, path.join(dir, targetBase + '.realm.json')).catch(() => {});
        } catch (_) {}
    }

    for (const dir of dirs) {
        let files = null;
        try {
            files = await fs.promises.readdir(dir);
        } catch (_) {
            continue;
        }
        const fileSet = new Set(files);
        for (const candName of [clean, clean + '.sav']) {
            if (fileSet.has(candName + '.living.sav')) {
                const dst = path.join(dir, candName);
                try {
                    await fs.promises.copyFile(path.join(dir, candName + '.living.sav'), dst);
                    await restoreFloorSidecarsAsync(dir, candName);
                    return { restored: true, filename: candName, path: dst };
                } catch (_) {}
            }
        }
        for (const f of files) {
            if (!f.endsWith('.living.sav')) continue;
            const targetBase = f.slice(0, -'.living.sav'.length);
            const targetNoExt = targetBase.replace(/\.sav$/i, '');
            if (targetNoExt.toLowerCase() === clean.toLowerCase()) {
                const dst = path.join(dir, targetBase);
                try {
                    await fs.promises.copyFile(path.join(dir, f), dst);
                    await restoreFloorSidecarsAsync(dir, targetBase);
                    return { restored: true, filename: targetBase, path: dst };
                } catch (_) {}
            }
        }
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
    FLOOR_SIDECAR_RE,
    isValidRealm,
    getRealmShortTag,
    formatSaveTimestamps,
    buildDefaultSaveSlotName,
    enrichSaveMetadata,
    detectRealmFromMagic,
    isLegacyHost,
    handleLegacyDomainRedirect,
    isSaveBufferDead,
    isSaveDeadSync,
    isSaveDeadAsync,
    listFloorSidecarsSync,
    listFloorSidecarsAsync,
    snapshotLivingSave,
    snapshotLivingSaveAsync,
    restoreLivingCheckpoint,
    restoreLivingCheckpointAsync
};

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    VALID_MAGICS,
    MAGIC_TO_REALM,
    FLOOR_SIDECAR_RE,
    stripUnixUidPrefix,
    hasFloorSidecarsForRealm,
    isValidRealm,
    detectRealmFromMagic,
    enrichSaveMetadata,
    isSaveBufferDead,
    listFloorSidecarsAsync,
    snapshotLivingSaveAsync,
    restoreLivingCheckpointAsync
} = require('./domain-config');

const CARTRIDGE_REALMS = new Set(['nethack', 'rogue', 'brogue', 'dcss', 'ryod']);
const MAX_SAVES_META_INDEX = 20000;
const MAX_OWNER_HASH_CACHE = 20000;
const SAVES_CACHE_TTL_MS = 30000;
const MAX_OWNER_TOKENS = 128;

const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

function isReservedFilename(name) {
    if (!name) return true;
    const trimmed = String(name).trim();
    if (trimmed.startsWith('.') || /\.(owner|realm)\.json$/i.test(trimmed)) return true;
    const base = trimmed.split('.')[0].trim();
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base);
}

function sanitizeFilename(name) {
    if (!name) return '';
    return path.basename(String(name)).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function isFixtureSaveFile(file) {
    return /^(smoke_|demo_|TestOne$)/i.test(String(file || ''));
}

function isSidecarOrHiddenSaveFile(file) {
    if (!file || typeof file !== 'string') return true;
    if (
        file.startsWith('.') ||
        isFixtureSaveFile(file) ||
        file.endsWith('.realm.json') ||
        file.endsWith('.ryod.json') ||
        file.endsWith('.owner.json') ||
        file.endsWith('.living.sav') ||
        file.endsWith('.ironman') ||
        file.includes('.living.sav.') ||
        FLOOR_SIDECAR_RE.test(file)
    ) {
        return true;
    }
    return false;
}

function getOwnerTokenPath(savePath) {
    return savePath + '.owner.json';
}

function getOwnerCandidatePaths(savePath) {
    const resolved = path.resolve(savePath);
    const out = [getOwnerTokenPath(resolved)];
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    const siblings = [base];
    if (/\.sav$/i.test(base)) {
        siblings.push(base.replace(/\.sav$/i, ''));
    } else {
        siblings.push(base + '.sav');
    }
    for (const s of siblings) {
        out.push(getOwnerTokenPath(path.join(dir, s)));
        if (/^\d+\./.test(s)) {
            out.push(getOwnerTokenPath(path.join(dir, stripUnixUidPrefix(s))));
        } else {
            out.push(getOwnerTokenPath(path.join(dir, '0.' + s)));
        }
    }
    return Array.from(new Set(out));
}

function parseOwnerTokens(requestToken) {
    if (!requestToken) return [];
    return String(requestToken)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, MAX_OWNER_TOKENS);
}

function extractVaultId(req) {
    if (!req || !req.headers) return '';
    return String(req.headers['x-vault-id'] || '').split(',')[0].trim();
}

function extractRequestOwnerTokens(req, urlObj = null) {
    const parts = [];
    if (req && req.headers) {
        if (req.headers['x-vault-id']) parts.push(String(req.headers['x-vault-id']));
        if (req.headers['x-owner-token']) parts.push(String(req.headers['x-owner-token']));
        if (req.headers['x-save-owner-token']) parts.push(String(req.headers['x-save-owner-token']));
        if (req.headers['authorization']) {
            parts.push(String(req.headers['authorization']).replace(/^Bearer\s+/i, '').trim());
        }
        const protoHdr = String(req.headers['sec-websocket-protocol'] || '');
        for (const p of protoHdr.split(',')) {
            const trimmed = p.trim();
            if (trimmed.startsWith('owner.')) parts.push(trimmed.slice(6).trim());
        }
    }
    return parts.filter(Boolean).join(',');
}

function setBoundedMap(map, maxEntries, key, val) {
    if (map.has(key)) {
        map.delete(key);
    } else if (map.size >= maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, val);
}

function createSaveVaultService({
    SAVE_DIR,
    getSaveDirsForRealm,
    activeSessions,
    uploadLimiter,
    vaultSyncLimiter,
    clientIp,
    normalizeSessionKey,
    vaultIndex = null,
    savesCacheTtlMs = SAVES_CACHE_TTL_MS
}) {
    const savesCacheMap = new Map(); // realm -> { entries, time }
    const savesListInFlight = new Map(); // realm -> Promise<entries>
    const savesMetaIndex = new Map(); // fullPath -> { mtimeMs, size, meta }
    const ownerHashCache = new Map(); // savePath -> { mtimeMs, hasOwnerFile, hashBuf, vaultHashBuf, checkedAt }
    const deadSavePaths = new Set();

    function isProdEnv() {
        return process.env.TRUST_PROXY === '1' || Boolean(process.env.K_SERVICE) || process.env.DEPLOY_TARGET === 'ovh';
    }

    function invalidateSavesCache(realm = null, slotName = null) {
        if (realm && typeof realm === 'string') {
            savesCacheMap.delete(realm);
        } else {
            savesCacheMap.clear();
        }
        if (slotName && typeof slotName === 'string') {
            const cleanBase = stripUnixUidPrefix(path.basename(slotName)).replace(/\.sav$/i, '').toLowerCase();
            for (const fullPath of Array.from(savesMetaIndex.keys())) {
                const b = stripUnixUidPrefix(path.basename(fullPath)).replace(/\.sav$/i, '').toLowerCase();
                if (b === cleanBase) savesMetaIndex.delete(fullPath);
            }
            for (const fullPath of Array.from(ownerHashCache.keys())) {
                const b = stripUnixUidPrefix(path.basename(fullPath)).replace(/\.sav$/i, '').toLowerCase();
                if (b === cleanBase) ownerHashCache.delete(fullPath);
            }
        }
    }

    function buildOwnerRecordFromJson(data, mtimeMs = Date.now()) {
        const hashStr = data && data.hash ? String(data.hash) : '';
        const vaultStr = data && data.vaultHash ? String(data.vaultHash) : '';
        return {
            mtimeMs,
            hasOwnerFile: true,
            valid: Boolean(hashStr),
            hashBuf: hashStr ? Buffer.from(hashStr, 'utf8') : null,
            vaultHashBuf: vaultStr ? Buffer.from(vaultStr, 'utf8') : null,
            checkedAt: Date.now()
        };
    }

    async function getOwnerRecordAsync(savePath) {
        const resolved = path.resolve(savePath);
        const now = Date.now();
        const cached = ownerHashCache.get(resolved);
        const candidates = getOwnerCandidatePaths(resolved);
        for (const ownerPath of candidates) {
            try {
                const stat = await fs.promises.stat(ownerPath);
                if (cached && cached.hasOwnerFile && cached.ownerPath === ownerPath && cached.mtimeMs === stat.mtimeMs) {
                    cached.checkedAt = now;
                    return cached;
                }
                const raw = await fs.promises.readFile(ownerPath, 'utf8');
                const parsed = JSON.parse(raw);
                const rec = { ...buildOwnerRecordFromJson(parsed, stat.mtimeMs), ownerPath };
                setBoundedMap(ownerHashCache, MAX_OWNER_HASH_CACHE, resolved, rec);
                return rec;
            } catch (err) {
                if (err && err.code === 'ENOENT') continue;
                return { mtimeMs: 0, hasOwnerFile: true, valid: false, hashBuf: null, vaultHashBuf: null, checkedAt: now };
            }
        }
        const missingRec = {
            mtimeMs: 0,
            hasOwnerFile: false,
            valid: false,
            hashBuf: null,
            vaultHashBuf: null,
            checkedAt: now
        };
        setBoundedMap(ownerHashCache, MAX_OWNER_HASH_CACHE, resolved, missingRec);
        return missingRec;
    }

    function buildCandidateHashBuffers(requestToken) {
        const tokens = parseOwnerTokens(requestToken);
        return tokens.map(t => Buffer.from(sha(t), 'utf8'));
    }

    function verifyOwnerRecordWithBuffers(ownerRec, candidateHashBufs) {
        if (!ownerRec || !ownerRec.hasOwnerFile) {
            return !isProdEnv();
        }
        if (!ownerRec.valid || !ownerRec.hashBuf) return false;
        if (!candidateHashBufs || candidateHashBufs.length === 0) return false;
        for (const actual of candidateHashBufs) {
            if (ownerRec.hashBuf.length === actual.length && crypto.timingSafeEqual(ownerRec.hashBuf, actual)) {
                return true;
            }
            if (ownerRec.vaultHashBuf && ownerRec.vaultHashBuf.length === actual.length && crypto.timingSafeEqual(ownerRec.vaultHashBuf, actual)) {
                return true;
            }
        }
        return false;
    }

    async function verifyOwnerTokenAsync(savePath, requestToken) {
        const ownerRec = await getOwnerRecordAsync(savePath);
        if (!ownerRec.hasOwnerFile) return !isProdEnv();
        const candBufs = buildCandidateHashBuffers(requestToken);
        return verifyOwnerRecordWithBuffers(ownerRec, candBufs);
    }

    function verifyOwnerToken(savePath, requestToken) {
        const resolved = path.resolve(savePath);
        const candidates = getOwnerCandidatePaths(resolved);
        for (const ownerPath of candidates) {
            if (!fs.existsSync(ownerPath)) continue;
            try {
                const stat = fs.statSync(ownerPath);
                let rec = ownerHashCache.get(resolved);
                if (!rec || !rec.hasOwnerFile || rec.ownerPath !== ownerPath || rec.mtimeMs !== stat.mtimeMs) {
                    const data = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
                    rec = { ...buildOwnerRecordFromJson(data, stat.mtimeMs), ownerPath };
                    setBoundedMap(ownerHashCache, MAX_OWNER_HASH_CACHE, resolved, rec);
                }
                return verifyOwnerRecordWithBuffers(rec, buildCandidateHashBuffers(requestToken));
            } catch (_) {
                return false;
            }
        }
        ownerHashCache.delete(resolved);
        return !isProdEnv();
    }

    function createOwnerToken(savePath, vaultId = '') {
        const resolved = path.resolve(savePath);
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
        }
        const token = crypto.randomBytes(16).toString('hex');
        const payload = {
            hash: sha(token),
            createdAt: Date.now()
        };
        if (vaultId) payload.vaultHash = sha(vaultId);
        const ownerPath = getOwnerTokenPath(resolved);
        fs.writeFileSync(ownerPath, JSON.stringify(payload), 'utf8');
        try {
            const st = fs.statSync(ownerPath);
            setBoundedMap(ownerHashCache, MAX_OWNER_HASH_CACHE, resolved, buildOwnerRecordFromJson(payload, st.mtimeMs));
        } catch (_) {
            setBoundedMap(ownerHashCache, MAX_OWNER_HASH_CACHE, resolved, buildOwnerRecordFromJson(payload, Date.now()));
        }
        return token;
    }

    async function createOwnerTokenAsync(savePath, vaultId = '') {
        const resolved = path.resolve(savePath);
        await fs.promises.mkdir(path.dirname(resolved), { recursive: true }).catch(() => {});
        const token = crypto.randomBytes(16).toString('hex');
        const payload = {
            hash: sha(token),
            createdAt: Date.now()
        };
        if (vaultId) payload.vaultHash = sha(vaultId);
        const ownerPath = getOwnerTokenPath(resolved);
        await fs.promises.writeFile(ownerPath, JSON.stringify(payload), 'utf8');
        try {
            const st = await fs.promises.stat(ownerPath);
            setBoundedMap(ownerHashCache, MAX_OWNER_HASH_CACHE, resolved, buildOwnerRecordFromJson(payload, st.mtimeMs));
        } catch (_) {
            setBoundedMap(ownerHashCache, MAX_OWNER_HASH_CACHE, resolved, buildOwnerRecordFromJson(payload, Date.now()));
        }
        return token;
    }

    function parseSaveBufferMetadata(buf, filenameHint = 'Adventurer', sidecarObj = null, hasIronmanMarker = false, sizeBytes = 0, lastModifiedIso = null) {
        if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
        const readLen = Math.min(buf.length, 36);
        const magic = readLen >= 8 ? buf.toString('ascii', 0, 8) : '';
        let detectedRealm = MAGIC_TO_REALM[magic] || 'angband';
        if (sidecarObj && sidecarObj.realm && isValidRealm(sidecarObj.realm)) {
            detectedRealm = sidecarObj.realm;
        } else if (!sidecarObj && !VALID_MAGICS.includes(magic)) {
            return null;
        }
        const blockName = readLen >= 24 ? buf.toString('ascii', 8, 24).replace(/\0.*$/, '') : '';
        let description = null;
        let charName = null;
        if (blockName === 'description' && readLen >= 32) {
            const descSize = buf.readUInt32LE(28);
            if (descSize > 0 && descSize <= 512 && buf.length >= 36 + descSize) {
                const descSlice = buf.subarray(36, 36 + descSize);
                const nullIdx = descSlice.indexOf(0);
                const strLen = nullIdx >= 0 ? nullIdx : descSize;
                description = descSlice.toString('utf8', 0, strLen);
                const commaIdx = description.indexOf(',');
                if (commaIdx > 0) charName = description.substring(0, commaIdx).trim();
            }
        }
        const baseNameNoExt = path.basename(filenameHint).replace(/\.sav$/i, '');
        const stakes = (hasIronmanMarker || (sidecarObj && sidecarObj.stakes === 'ironman'))
            ? 'ironman'
            : ((sidecarObj && typeof sidecarObj.stakes === 'string' && sidecarObj.stakes) ? sidecarObj.stakes : 'standard');
        return {
            filename: path.basename(filenameHint),
            characterName: charName || baseNameNoExt,
            description: description || baseNameNoExt,
            realm: detectedRealm,
            stakes,
            resurrectCount: (sidecarObj && Number(sidecarObj.resurrectCount)) || 0,
            sizeBytes: sizeBytes || buf.length,
            lastModified: lastModifiedIso || new Date().toISOString()
        };
    }

    async function readSaveMetadataAsync(filePath, statObj = null) {
        try {
            const resolved = path.resolve(filePath);
            const stat = statObj || await fs.promises.stat(resolved);
            if (!stat.isFile() || stat.size < 4) return null;
            const cached = savesMetaIndex.get(resolved);
            if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
                return cached.meta;
            }
            if (vaultIndex) {
                const dbMeta = vaultIndex.getSaveMeta(resolved, stat.mtimeMs, stat.size);
                if (dbMeta) {
                    setBoundedMap(savesMetaIndex, MAX_SAVES_META_INDEX, resolved, { mtimeMs: stat.mtimeMs, size: stat.size, meta: dbMeta });
                    return dbMeta;
                }
            }
            let fh = null;
            try {
                fh = await fs.promises.open(resolved, 'r');
                const headCap = Math.min(stat.size, 600);
                const headBuf = Buffer.alloc(headCap);
                await fh.read(headBuf, 0, headCap, 0);

                const baseName = stripUnixUidPrefix(path.basename(resolved));
                let sidecarObj = null;
                for (const scPath of [resolved + '.realm.json', path.join(path.dirname(resolved), baseName + '.realm.json')]) {
                    try {
                        sidecarObj = JSON.parse(await fs.promises.readFile(scPath, 'utf8'));
                        break;
                    } catch (_) {}
                }
                let hasIronman = false;
                try {
                    await fs.promises.access(resolved + '.ironman');
                    hasIronman = true;
                } catch (_) {
                    if (baseName !== path.basename(resolved)) {
                        try {
                            await fs.promises.access(path.join(path.dirname(resolved), baseName + '.ironman'));
                            hasIronman = true;
                        } catch (__) {}
                    }
                }

                const baseMeta = parseSaveBufferMetadata(
                    headBuf,
                    baseName,
                    sidecarObj,
                    hasIronman,
                    stat.size,
                    stat.mtime.toISOString()
                );
                if (!baseMeta) return null;

                let ryodHash = null;
                let ryodTitle = null;
                let ryodArchetype = null;
                if (baseMeta.realm === 'ryod') {
                    for (const cand of [resolved.replace(/\.sav$/i, '') + '.ryod.json', resolved + '.ryod.json']) {
                        try {
                            const bp = JSON.parse(await fs.promises.readFile(cand, 'utf8'));
                            ryodHash = bp.ryodHash || null;
                            ryodTitle = bp.title || null;
                            ryodArchetype = bp.archetype || null;
                            break;
                        } catch (_) {}
                    }
                    if (!ryodHash && headCap >= 32) {
                        const blockName = headBuf.toString('ascii', 8, 24).replace(/\0.*$/, '');
                        if (blockName === 'description') {
                            const descSize = headBuf.readUInt32LE(28);
                            const jsonOffset = 36 + descSize;
                            if (stat.size > jsonOffset && stat.size - jsonOffset <= 2 * 1024 * 1024) {
                                try {
                                    const jsonBuf = Buffer.alloc(stat.size - jsonOffset);
                                    await fh.read(jsonBuf, 0, jsonBuf.length, jsonOffset);
                                    const parsedState = JSON.parse(jsonBuf.toString('utf8'));
                                    if (parsedState && parsedState.ryodBlueprint) {
                                        ryodHash = parsedState.ryodBlueprint.ryodHash || parsedState.ryodHash || null;
                                        ryodTitle = parsedState.ryodBlueprint.title || null;
                                        ryodArchetype = parsedState.ryodBlueprint.archetype || null;
                                    }
                                } catch (_) {}
                            }
                        }
                    }
                }

                const meta = enrichSaveMetadata({
                    ...baseMeta,
                    ryodHash,
                    ryodTitle,
                    ryodArchetype
                }, baseMeta.realm);
                setBoundedMap(savesMetaIndex, MAX_SAVES_META_INDEX, resolved, {
                    mtimeMs: stat.mtimeMs,
                    size: stat.size,
                    meta
                });
                if (vaultIndex) vaultIndex.upsertSaveMeta(resolved, meta.realm, meta.filename, stat.mtimeMs, stat.size, meta);
                return meta;
            } finally {
                if (fh) {
                    try { await fh.close(); } catch (_) {}
                }
            }
        } catch (_) {
            return null;
        }
    }

    function readSaveMetadata(filePath) {
        try {
            const resolved = path.resolve(filePath);
            const stat = fs.statSync(resolved);
            if (!stat.isFile() || stat.size < 4) return null;
            const cached = savesMetaIndex.get(resolved);
            if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
                return cached.meta;
            }
            if (vaultIndex) {
                const dbMeta = vaultIndex.getSaveMeta(resolved, stat.mtimeMs, stat.size);
                if (dbMeta) {
                    setBoundedMap(savesMetaIndex, MAX_SAVES_META_INDEX, resolved, { mtimeMs: stat.mtimeMs, size: stat.size, meta: dbMeta });
                    return dbMeta;
                }
            }
            const fd = fs.openSync(resolved, 'r');
            try {
                const headCap = Math.min(stat.size, 600);
                const headBuf = Buffer.alloc(headCap);
                fs.readSync(fd, headBuf, 0, headCap, 0);

                let sidecarObj = null;
                if (fs.existsSync(resolved + '.realm.json')) {
                    try { sidecarObj = JSON.parse(fs.readFileSync(resolved + '.realm.json', 'utf8')); } catch (_) {}
                }
                const hasIronman = fs.existsSync(resolved + '.ironman');
                const baseMeta = parseSaveBufferMetadata(
                    headBuf,
                    path.basename(resolved),
                    sidecarObj,
                    hasIronman,
                    stat.size,
                    stat.mtime.toISOString()
                );
                if (!baseMeta) return null;

                let ryodHash = null;
                let ryodTitle = null;
                let ryodArchetype = null;
                if (baseMeta.realm === 'ryod') {
                    const bpCand1 = resolved.replace(/\.sav$/i, '') + '.ryod.json';
                    const bpCand2 = resolved + '.ryod.json';
                    const bpPath = fs.existsSync(bpCand1) ? bpCand1 : (fs.existsSync(bpCand2) ? bpCand2 : null);
                    if (bpPath) {
                        try {
                            const bp = JSON.parse(fs.readFileSync(bpPath, 'utf8'));
                            ryodHash = bp.ryodHash || null;
                            ryodTitle = bp.title || null;
                            ryodArchetype = bp.archetype || null;
                        } catch (_) {}
                    }
                    if (!ryodHash && headCap >= 32) {
                        const blockName = headBuf.toString('ascii', 8, 24).replace(/\0.*$/, '');
                        if (blockName === 'description') {
                            const descSize = headBuf.readUInt32LE(28);
                            const jsonOffset = 36 + descSize;
                            if (stat.size > jsonOffset && stat.size - jsonOffset <= 2 * 1024 * 1024) {
                                try {
                                    const jsonBuf = Buffer.alloc(stat.size - jsonOffset);
                                    fs.readSync(fd, jsonBuf, 0, jsonBuf.length, jsonOffset);
                                    const parsedState = JSON.parse(jsonBuf.toString('utf8'));
                                    if (parsedState && parsedState.ryodBlueprint) {
                                        ryodHash = parsedState.ryodBlueprint.ryodHash || parsedState.ryodHash || null;
                                        ryodTitle = parsedState.ryodBlueprint.title || null;
                                        ryodArchetype = parsedState.ryodBlueprint.archetype || null;
                                    }
                                } catch (_) {}
                            }
                        }
                    }
                }

                const meta = enrichSaveMetadata({
                    ...baseMeta,
                    ryodHash,
                    ryodTitle,
                    ryodArchetype
                }, baseMeta.realm);
                setBoundedMap(savesMetaIndex, MAX_SAVES_META_INDEX, resolved, {
                    mtimeMs: stat.mtimeMs,
                    size: stat.size,
                    meta
                });
                if (vaultIndex) vaultIndex.upsertSaveMeta(resolved, meta.realm, meta.filename, stat.mtimeMs, stat.size, meta);
                return meta;
            } finally {
                try { fs.closeSync(fd); } catch (_) {}
            }
        } catch (_) {
            return null;
        }
    }

    async function markSaveDeadAsync(savePath, realm = 'angband') {
        if (!savePath) return;
        const resolved = path.resolve(savePath);
        deadSavePaths.add(resolved);
        try {
            let sidecar = { realm };
            try {
                sidecar = JSON.parse(await fs.promises.readFile(resolved + '.realm.json', 'utf8')) || sidecar;
            } catch (_) {}
            sidecar.isDead = true;
            await fs.promises.writeFile(resolved + '.realm.json', JSON.stringify(sidecar), 'utf8');
        } catch (_) {}
    }

    function clearSaveDead(savePath) {
        if (!savePath) return;
        deadSavePaths.delete(path.resolve(savePath));
    }

    function isSaveMarkedDead(savePath) {
        if (!savePath) return false;
        return deadSavePaths.has(path.resolve(savePath));
    }

    async function migrateFallbackSlotToPrimaryAsync(srcPath, sDir, primarySaveDir, file) {
        if (!primarySaveDir || sDir === primarySaveDir) return srcPath;
        try {
            await fs.promises.mkdir(primarySaveDir, { recursive: true });
            const dstPath = path.join(primarySaveDir, file);
            try {
                await fs.promises.access(dstPath);
                return dstPath;
            } catch (_) {}
            await fs.promises.copyFile(srcPath, dstPath);
            for (const ext of ['.realm.json', '.owner.json', '.living.sav', '.living.sav.realm.json', '.ironman', '.ryod.json']) {
                await fs.promises.copyFile(srcPath + ext, dstPath + ext).catch(() => {});
            }
            const floorSidecars = await listFloorSidecarsAsync(sDir, file);
            for (const sc of floorSidecars) {
                await fs.promises.copyFile(path.join(sDir, sc.file), path.join(primarySaveDir, sc.file)).catch(() => {});
            }
            return dstPath;
        } catch (_) {
            return srcPath;
        }
    }

    async function scanRealmSaveEntriesAsync(queryRealm) {
        const saveDirs = getSaveDirsForRealm(queryRealm);
        const bySlotKey = new Map();
        const primarySaveDir = saveDirs[0] || path.join(SAVE_DIR, queryRealm);

        for (const sDir of saveDirs) {
            let files = [];
            try {
                files = await fs.promises.readdir(sDir);
            } catch (_) {
                continue;
            }
            for (const file of files) {
                if (isSidecarOrHiddenSaveFile(file)) continue;
                const cleanFile = stripUnixUidPrefix(file);
                const slotKey = cleanFile.replace(/\.sav$/i, '').toLowerCase();
                const fullPath = path.join(sDir, file);
                try {
                    const stat = await fs.promises.stat(fullPath);
                    if (!stat.isFile() || stat.size <= 0) continue;
                    const existing = bySlotKey.get(slotKey);
                    if (existing && existing.mtimeMs >= stat.mtimeMs) continue;

                    let meta = await readSaveMetadataAsync(fullPath, stat);
                    if (!meta && stat.size >= 4) {
                        let sidecarObj = null;
                        for (const scCand of [fullPath + '.realm.json', path.join(sDir, cleanFile + '.realm.json')]) {
                            try {
                                sidecarObj = JSON.parse(await fs.promises.readFile(scCand, 'utf8'));
                                break;
                            } catch (_) {}
                        }
                        const sidecarRealm = sidecarObj && sidecarObj.realm ? sidecarObj.realm : null;
                        if (!sidecarRealm || sidecarRealm === queryRealm) {
                            const charStem = cleanFile.replace(/\.sav$/i, '');
                            meta = enrichSaveMetadata({
                                filename: cleanFile,
                                characterName: charStem,
                                description: charStem,
                                realm: sidecarRealm || queryRealm,
                                stakes: (sidecarObj && sidecarObj.stakes === 'ironman') ? 'ironman' : 'standard',
                                sizeBytes: stat.size,
                                lastModified: stat.mtime.toISOString(),
                            }, sidecarRealm || queryRealm);
                        }
                    }
                    if (meta && (!meta.realm || meta.realm === queryRealm)) {
                        const canonicalMeta = (meta.filename !== cleanFile) ? { ...meta, filename: cleanFile } : meta;
                        const canonicalPath = await migrateFallbackSlotToPrimaryAsync(fullPath, sDir, primarySaveDir, file);
                        const ownerRec = await getOwnerRecordAsync(canonicalPath);
                        bySlotKey.set(slotKey, {
                            fullPath: canonicalPath,
                            meta: canonicalMeta,
                            ownerRec,
                            mtimeMs: stat.mtimeMs
                        });
                    }
                } catch (_) {}
            }
        }
        const discovered = Array.from(bySlotKey.values());
        discovered.sort((a, b) => b.mtimeMs - a.mtimeMs);
        if (savesCacheTtlMs > 0) savesCacheMap.set(queryRealm, { entries: discovered, time: Date.now() });
        return discovered;
    }

    async function handleListSaves(req, res, urlObj) {
        const queryRealm = urlObj.searchParams.get('realm') || 'angband';
        if (!isValidRealm(queryRealm)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid realm' }));
            return;
        }
        const reqToken = extractRequestOwnerTokens(req, urlObj);
        const candidateHashBufs = buildCandidateHashBuffers(reqToken);
        try {
            const now = Date.now();
            let allEntries = null;
            const cached = savesCacheMap.get(queryRealm);
            if (savesCacheTtlMs > 0 && cached && Array.isArray(cached.entries) && (now - cached.time < savesCacheTtlMs)) {
                allEntries = cached.entries;
            } else {
                let inFlight = savesListInFlight.get(queryRealm);
                if (!inFlight) {
                    inFlight = scanRealmSaveEntriesAsync(queryRealm).finally(() => {
                        if (savesListInFlight.get(queryRealm) === inFlight) {
                            savesListInFlight.delete(queryRealm);
                        }
                    });
                    savesListInFlight.set(queryRealm, inFlight);
                }
                allEntries = await inFlight;
            }

            const saves = [];
            for (const item of allEntries) {
                const ownerRec = item.ownerRec || await getOwnerRecordAsync(item.fullPath);
                if (verifyOwnerRecordWithBuffers(ownerRec, candidateHashBufs)) {
                    saves.push(item.meta);
                }
            }
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'private, no-store'
            });
            res.end(JSON.stringify({ saves, realm: queryRealm }));
        } catch (err) {
            console.error('[API] /api/saves error:', err);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal error', saves: [] }));
            }
        }
    }

    async function handleRestoreCheckpoint(req, res, urlObj) {
        const wait = vaultSyncLimiter ? vaultSyncLimiter(req) : uploadLimiter(clientIp(req));
        if (wait > 0) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': wait });
            res.end(JSON.stringify({ ok: false, error: 'Rate limit exceeded' }));
            return;
        }
        const queryRealm = String(urlObj.searchParams.get('realm') || req.headers['x-realm'] || 'angband').toLowerCase().trim();
        const charName = urlObj.searchParams.get('char') || req.headers['x-character-name'] || 'Adventurer';
        if (!isValidRealm(queryRealm)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid realm' }));
            return;
        }
        const saveDirs = getSaveDirsForRealm(queryRealm);
        const cleanChar = stripUnixUidPrefix(String(charName)).replace(/[^a-zA-Z0-9_.-]/g, '').replace(/\.sav$/i, '');
        const reqToken = extractRequestOwnerTokens(req, urlObj);

        for (const sDir of saveDirs) {
            for (const cand of [path.join(sDir, cleanChar), path.join(sDir, cleanChar + '.sav'), path.join(sDir, '0.' + cleanChar), path.join(sDir, '0.' + cleanChar + '.sav')]) {
                try {
                    await fs.promises.access(cand + '.ironman');
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'Ironman permadeath active: checkpoints disabled' }));
                    return;
                } catch (_) {}
                try {
                    const rawSidecar = await fs.promises.readFile(cand + '.realm.json', 'utf8');
                    const parsed = JSON.parse(rawSidecar);
                    if (parsed && parsed.stakes === 'ironman') {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: false, error: 'Ironman permadeath active: checkpoints disabled' }));
                        return;
                    }
                } catch (_) {}
                let existsCand = false;
                try {
                    const st = await fs.promises.stat(cand);
                    existsCand = st.isFile();
                } catch (_) {}
                if (existsCand && !(await verifyOwnerTokenAsync(cand, reqToken))) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'Forbidden: invalid owner token for existing character' }));
                    return;
                }
            }
        }

        const restored = await restoreLivingCheckpointAsync(saveDirs, charName);
        if (restored && restored.path) {
            clearSaveDead(restored.path);
            try {
                const rawSidecar = await fs.promises.readFile(restored.path + '.realm.json', 'utf8');
                const parsed = JSON.parse(rawSidecar);
                if (parsed) {
                    delete parsed.isDead;
                    delete parsed.dead;
                    parsed.resurrectCount = (Number(parsed.resurrectCount) || 0) + 1;
                    await fs.promises.writeFile(restored.path + '.realm.json', JSON.stringify(parsed), 'utf8');
                }
            } catch (_) {}
        }
        invalidateSavesCache(queryRealm, cleanChar);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            restored: Boolean(restored && restored.restored),
            filename: restored ? restored.filename : null,
            realm: queryRealm
        }));
    }

    async function handleDownloadLatestSave(req, res, urlObj) {
        const charName = urlObj.searchParams.get('char');
        const reqRealm = (urlObj.searchParams.get('realm') || '').toLowerCase().trim();
        const queryRealm = (reqRealm && isValidRealm(reqRealm)) ? reqRealm : 'angband';
        const saveDirs = getSaveDirsForRealm(queryRealm);
        const reqToken = extractRequestOwnerTokens(req, urlObj);

        const ownedSaves = [];
        let sawUnownedCandidate = false;
        const seenNames = new Set();

        for (const sDir of saveDirs) {
            let files = [];
            try {
                files = await fs.promises.readdir(sDir);
            } catch (_) {
                continue;
            }
            for (const file of files) {
                if (isSidecarOrHiddenSaveFile(file) || seenNames.has(file)) continue;
                const fullPath = path.join(sDir, file);
                try {
                    const stat = await fs.promises.stat(fullPath);
                    if (!stat.isFile() || stat.size <= 0) continue;
                    seenNames.add(file);
                    let meta = await readSaveMetadataAsync(fullPath, stat);
                    if (!meta && stat.size >= 4) {
                        meta = enrichSaveMetadata({
                            filename: file,
                            characterName: file.replace(/\.sav$/i, ''),
                            description: file.replace(/\.sav$/i, ''),
                            realm: queryRealm,
                            stakes: 'standard',
                            sizeBytes: stat.size,
                            lastModified: stat.mtime.toISOString(),
                        }, queryRealm);
                    }
                    if (!meta) continue;
                    const isOwned = await verifyOwnerTokenAsync(fullPath, reqToken);
                    if (!isOwned) {
                        const unprefixedFile = stripUnixUidPrefix(file);
                        if (!charName || (meta.characterName && stripUnixUidPrefix(meta.characterName).toLowerCase() === stripUnixUidPrefix(charName).toLowerCase()) || unprefixedFile.toLowerCase().startsWith(stripUnixUidPrefix(charName).toLowerCase())) {
                            sawUnownedCandidate = true;
                        }
                        continue;
                    }
                    ownedSaves.push({ ...meta, filename: stripUnixUidPrefix(meta.filename || file), fullPath });
                } catch (_) {}
            }
        }

        ownedSaves.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        let match = null;
        if (charName) {
            const lowerChar = stripUnixUidPrefix(charName).toLowerCase();
            match = ownedSaves.find(s =>
                (s.characterName && stripUnixUidPrefix(s.characterName).toLowerCase() === lowerChar) ||
                (s.filename && stripUnixUidPrefix(s.filename).toLowerCase() === lowerChar) ||
                (s.filename && stripUnixUidPrefix(s.filename).toLowerCase().startsWith(lowerChar))
            );
        }
        if (!charName && ownedSaves.length > 0) {
            match = ownedSaves[0];
        }

        if (!match) {
            if (sawUnownedCandidate) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden: invalid owner token for requested save' }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No save files available' }));
            }
            return;
        }

        const dlMeta = enrichSaveMetadata(match, queryRealm);
        const outName = (dlMeta && dlMeta.downloadFilename)
            ? dlMeta.downloadFilename
            : ((match.characterName || match.filename).replace(/[^a-zA-Z0-9_-]/g, '_') + '.sav');
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `attachment; filename="${outName}"`
        });
        const stream = fs.createReadStream(match.fullPath);
        res.on('close', () => stream.destroy());
        stream.on('error', () => {
            if (!res.headersSent) res.writeHead(500);
            res.end();
        });
        stream.pipe(res);
    }

    async function handleDownloadSingleSave(req, res, urlObj, pathname) {
        let rawSaveName = pathname.substring('/api/saves/'.length);
        try { rawSaveName = decodeURIComponent(rawSaveName); } catch (_) {}
        const saveName = sanitizeFilename(rawSaveName);
        if (!saveName || isReservedFilename(saveName)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid save file name' }));
            return;
        }
        const queryRealm = urlObj.searchParams.get('realm') || 'angband';
        if (!isValidRealm(queryRealm)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid realm' }));
            return;
        }
        const saveDirs = getSaveDirsForRealm(queryRealm);
        let targetPath = null;
        let ownerCheckPath = null;
        const cleanNoExt = stripUnixUidPrefix(saveName).replace(/\.sav$/i, '');
        const candFileNames = Array.from(new Set([
            saveName,
            cleanNoExt + '.sav',
            cleanNoExt,
            '0.' + cleanNoExt,
            '0.' + cleanNoExt + '.sav'
        ]));

        // Check active tmpfs stageDir first so staged live sessions serve IndexedDB snapshots at RAM speed with 0 GCS FUSE reads
        if (activeSessions && typeof activeSessions.values === 'function') {
            const targetNorm = normalizeSessionKey(cleanNoExt);
            for (const sess of activeSessions.values()) {
                if ((sess.realm || 'angband') !== queryRealm || !sess.stageDir) continue;
                const sessNorm = normalizeSessionKey(stripUnixUidPrefix(sess.save || sess.user || ''));
                if (sessNorm !== targetNorm) continue;
                for (const fname of candFileNames) {
                    const cand = path.join(sess.stageDir, fname);
                    try {
                        const st = await fs.promises.stat(cand);
                        if (st.isFile() && st.size > 0) {
                            targetPath = cand;
                            ownerCheckPath = sess.persistentSavePath || sess.savePath || cand;
                            break;
                        }
                    } catch (_) {}
                }
                if (targetPath) break;
            }
        }

        if (!targetPath) {
            for (const sDir of saveDirs) {
                for (const fname of candFileNames) {
                    const cand = path.join(sDir, fname);
                    try {
                        const st = await fs.promises.stat(cand);
                        if (st.isFile() && st.size > 0) {
                            targetPath = cand;
                            ownerCheckPath = cand;
                            break;
                        }
                    } catch (_) {}
                }
                if (targetPath) break;
            }
        }

        if (!targetPath) {
            if (urlObj.searchParams.get('optional') === '1') {
                res.writeHead(204, { 'Cache-Control': 'private, no-store' });
                res.end();
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Save file not found' }));
            return;
        }

        const reqToken = extractRequestOwnerTokens(req, urlObj);
        if (!(await verifyOwnerTokenAsync(ownerCheckPath || targetPath, reqToken))) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden: invalid owner token for existing character' }));
            return;
        }

        const meta = (await readSaveMetadataAsync(targetPath)) || {
            filename: path.basename(targetPath),
            characterName: cleanNoExt,
            realm: queryRealm
        };
        const dlMeta = enrichSaveMetadata(meta, queryRealm);
        const outName = (dlMeta && dlMeta.downloadFilename)
            ? dlMeta.downloadFilename
            : (saveName.endsWith('.sav') ? saveName : `${saveName}.sav`);
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `attachment; filename="${outName}"`
        });
        const stream = fs.createReadStream(targetPath);
        res.on('close', () => stream.destroy());
        stream.on('error', () => {
            if (!res.headersSent) res.writeHead(500);
            res.end();
        });
        stream.pipe(res);
    }

    function handleUploadOrSyncSave(req, res, urlObj, isSyncEndpoint = false) {
        const hasVaultIdentity = Boolean(
            req.headers['x-vault-id'] ||
            req.headers['x-owner-token'] ||
            req.headers['x-save-owner-token']
        );
        const wait = (isSyncEndpoint || hasVaultIdentity) && vaultSyncLimiter
            ? vaultSyncLimiter(req)
            : uploadLimiter(clientIp(req));
        if (wait > 0) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': wait });
            res.end(JSON.stringify({ error: 'Rate limit' }));
            return;
        }

        const chunks = [];
        let totalSize = 0;
        const maxLimit = 10 * 1024 * 1024;
        let aborted = false;

        req.on('data', chunk => {
            if (aborted) return;
            totalSize += chunk.length;
            if (totalSize > maxLimit) {
                aborted = true;
                if (!res.headersSent) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Payload too large' }));
                }
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            if (aborted) return;
            (async () => {
                try {
                    const rawBuf = Buffer.concat(chunks);
                    let saveBuf = rawBuf;
                    let jsonEnvelope = null;
                    const ct = String(req.headers['content-type'] || '').toLowerCase();

                    if (ct.includes('application/json') || (isSyncEndpoint && rawBuf.length > 0 && rawBuf[0] === 0x7b && rawBuf.toString('ascii', 0, Math.min(8, rawBuf.length)) !== 'SaveRYOD')) {
                        try {
                            const parsed = JSON.parse(rawBuf.toString('utf8'));
                            if (parsed && typeof parsed === 'object' && (parsed.dataBase64 || parsed.saveBase64 || parsed.contentBase64 || parsed.data)) {
                                jsonEnvelope = parsed;
                                const b64 = parsed.dataBase64 || parsed.saveBase64 || parsed.contentBase64 || '';
                                if (b64 && typeof b64 === 'string') {
                                    saveBuf = Buffer.from(b64, 'base64');
                                } else if (typeof parsed.data === 'string') {
                                    saveBuf = Buffer.from(parsed.data, 'base64');
                                } else if (parsed.data && typeof parsed.data === 'object') {
                                    saveBuf = Buffer.from(JSON.stringify(parsed.data), 'utf8');
                                }
                            }
                        } catch (_) {}
                    }

                    if (!saveBuf || saveBuf.length < 36) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid savefile: too short' }));
                        return;
                    }

                    const reqRealm = String(
                        (jsonEnvelope && jsonEnvelope.realm) ||
                        urlObj.searchParams.get('realm') ||
                        req.headers['x-realm'] ||
                        ''
                    ).toLowerCase().trim();
                    const magic = saveBuf.length >= 8 ? saveBuf.toString('ascii', 0, 8) : '';
                    const detectedRealm = detectRealmFromMagic(magic, reqRealm !== 'angband' ? reqRealm : '');
                    if (!detectedRealm) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid savefile: missing or unknown magic header' }));
                        return;
                    }

                    const saveDirs = getSaveDirsForRealm(detectedRealm);
                    const targetDir = saveDirs[0] || path.join(SAVE_DIR, detectedRealm);
                    await fs.promises.mkdir(targetDir, { recursive: true });

                    const envSlot = (jsonEnvelope && jsonEnvelope.slot && !/^(living|floor|bookmark)$/i.test(String(jsonEnvelope.slot).trim()))
                        ? jsonEnvelope.slot
                        : '';
                    const headerName =
                        (jsonEnvelope && (jsonEnvelope.filename || jsonEnvelope.name || envSlot || jsonEnvelope.characterName)) ||
                        req.headers['x-save-slot'] ||
                        req.headers['x-character-name'] ||
                        urlObj.searchParams.get('slot') ||
                        urlObj.searchParams.get('name') ||
                        '';
                    let cleanHeaderName = headerName ? sanitizeFilename(headerName) : null;
                    if (cleanHeaderName && isReservedFilename(cleanHeaderName)) {
                        cleanHeaderName = null;
                    }

                    const reqStakes = (jsonEnvelope && jsonEnvelope.stakes === 'ironman') || req.headers['x-stakes'] === 'ironman'
                        ? 'ironman'
                        : 'standard';
                    const parsedBufMeta = parseSaveBufferMetadata(
                        saveBuf,
                        cleanHeaderName || 'Adventurer',
                        { realm: detectedRealm, stakes: reqStakes },
                        reqStakes === 'ironman',
                        saveBuf.length
                    );

                    let targetName = cleanHeaderName;
                    if (!targetName && parsedBufMeta && parsedBufMeta.characterName) {
                        const cleanMetaName = sanitizeFilename(parsedBufMeta.characterName);
                        if (cleanMetaName && !isReservedFilename(cleanMetaName)) {
                            targetName = cleanMetaName;
                        }
                    }
                    if (!targetName) targetName = `upload_${Date.now()}`;

                    // Preserve .sav extension when needed for cartridges or existing .sav slots
                    const baseNoSav = targetName.replace(/\.sav$/i, '');
                    if (CARTRIDGE_REALMS.has(detectedRealm)) {
                        let hasBareExisting = false;
                        let hasSavExisting = false;
                        try { await fs.promises.access(path.join(targetDir, baseNoSav)); hasBareExisting = true; } catch (_) {}
                        try { await fs.promises.access(path.join(targetDir, baseNoSav + '.sav')); hasSavExisting = true; } catch (_) {}
                        if (hasSavExisting || (!hasBareExisting && targetName.toLowerCase().endsWith('.sav'))) {
                            targetName = baseNoSav + '.sav';
                        }
                    }

                    let finalName = targetName;
                    let destPath = path.join(targetDir, finalName);
                    const reqToken = [
                        extractRequestOwnerTokens(req, urlObj),
                        jsonEnvelope && jsonEnvelope.ownerToken ? String(jsonEnvelope.ownerToken) : '',
                        jsonEnvelope && jsonEnvelope.vaultId ? String(jsonEnvelope.vaultId) : ''
                    ].filter(Boolean).join(',');
                    const vaultId = extractVaultId(req) || (jsonEnvelope && jsonEnvelope.vaultId ? String(jsonEnvelope.vaultId).trim() : '');

                    let destExists = false;
                    try {
                        const st = await fs.promises.stat(destPath);
                        destExists = st.isFile();
                    } catch (_) {}

                    if (destExists && !(await verifyOwnerTokenAsync(destPath, reqToken))) {
                        if (isSyncEndpoint) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Forbidden: slot belongs to another vault' }));
                            return;
                        }
                        const ext = finalName.toLowerCase().endsWith('.sav') ? '.sav' : '';
                        const stem = finalName.replace(/\.sav$/i, '');
                        for (let n = 1; n < 1000; n++) {
                            const candName = `${stem}_${n}${ext}`;
                            const candPath = path.join(targetDir, candName);
                            let existsCand = false;
                            try {
                                await fs.promises.access(candPath);
                                existsCand = true;
                            } catch (_) {}
                            if (!existsCand) {
                                finalName = candName;
                                destPath = candPath;
                                break;
                            }
                        }
                    }

                    // Close stale setup-phase or disconnected session holding this slot before replacing on disk
                    const normFinal = normalizeSessionKey(finalName);
                    for (const [sId, cand] of activeSessions.entries()) {
                        if ((cand.realm || 'angband') === detectedRealm) {
                            const candKey = normalizeSessionKey(cand.save || cand.user);
                            if (candKey === normFinal && (cand.phase === 'setup' || !cand.ws)) {
                                try {
                                    if (cand.child && !cand.child.killed) cand.child.kill();
                                } catch (_) {}
                                activeSessions.delete(sId);
                            }
                        }
                    }

                    const isDeadUpload = isSaveBufferDead(saveBuf);
                    const tmpSuffix = `${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
                    const destTmp = `${destPath}.tmp.${tmpSuffix}`;
                    await fs.promises.writeFile(destTmp, saveBuf);
                    await fs.promises.rename(destTmp, destPath);

                    // Optional Hengband floor sidecars bundled in sync envelope
                    if (jsonEnvelope && jsonEnvelope.floorSidecars && typeof jsonEnvelope.floorSidecars === 'object') {
                        const slotStem = finalName.replace(/\.sav$/i, '');
                        for (const [suffix, b64Floor] of Object.entries(jsonEnvelope.floorSidecars)) {
                            if (/^\.?F\d{2,3}$/i.test(suffix) && typeof b64Floor === 'string' && b64Floor.length <= 2 * 1024 * 1024) {
                                const dotSuffix = suffix.startsWith('.') ? suffix.toUpperCase() : `.${suffix.toUpperCase()}`;
                                await fs.promises.writeFile(path.join(targetDir, slotStem + dotSuffix), Buffer.from(b64Floor, 'base64')).catch(() => {});
                            }
                        }
                    }

                    let existingSidecar = {};
                    try {
                        existingSidecar = JSON.parse(await fs.promises.readFile(destPath + '.realm.json', 'utf8')) || {};
                    } catch (_) {}
                    const stakesFinal = (reqStakes === 'ironman' || existingSidecar.stakes === 'ironman') ? 'ironman' : 'standard';
                    const sidecarOut = {
                        ...existingSidecar,
                        realm: detectedRealm,
                        stakes: stakesFinal,
                        updatedAt: Date.now()
                    };
                    if (isDeadUpload) {
                        sidecarOut.isDead = true;
                        deadSavePaths.add(path.resolve(destPath));
                    } else {
                        delete sidecarOut.isDead;
                        delete sidecarOut.dead;
                        clearSaveDead(destPath);
                    }
                    const scPath = destPath + '.realm.json';
                    const scTmp = `${scPath}.tmp.${tmpSuffix}`;
                    await fs.promises.writeFile(scTmp, JSON.stringify(sidecarOut), 'utf8').then(() => fs.promises.rename(scTmp, scPath)).catch(() => {});

                    let newOwnerToken = undefined;
                    const existingOwnerRec = await getOwnerRecordAsync(destPath);
                    if (!existingOwnerRec.hasOwnerFile) {
                        newOwnerToken = await createOwnerTokenAsync(destPath, vaultId);
                    }

                    if (!isDeadUpload && stakesFinal !== 'ironman') {
                        await snapshotLivingSaveAsync(destPath, {
                            realm: detectedRealm,
                            buffer: saveBuf,
                            sidecarObj: sidecarOut
                        });
                    }

                    const nowIso = new Date().toISOString();
                    const baseSyncMeta = parsedBufMeta || {
                        filename: finalName,
                        characterName: finalName.replace(/\.sav$/i, ''),
                        description: finalName.replace(/\.sav$/i, ''),
                        realm: detectedRealm,
                        stakes: stakesFinal,
                        sizeBytes: saveBuf.length,
                        lastModified: nowIso
                    };
                    const metadata = enrichSaveMetadata({
                        ...baseSyncMeta,
                        filename: finalName,
                        realm: detectedRealm,
                        stakes: stakesFinal,
                        sizeBytes: saveBuf.length,
                        lastModified: nowIso
                    }, detectedRealm);
                    setBoundedMap(savesMetaIndex, MAX_SAVES_META_INDEX, path.resolve(destPath), {
                        mtimeMs: sidecarOut.updatedAt,
                        size: saveBuf.length,
                        meta: metadata
                    });
                    if (vaultIndex) vaultIndex.upsertSaveMeta(destPath, detectedRealm, finalName, sidecarOut.updatedAt, saveBuf.length, metadata);
                    invalidateSavesCache(detectedRealm, finalName);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: true,
                        status: 'saved',
                        synced: isSyncEndpoint,
                        filename: finalName,
                        realm: detectedRealm,
                        ownerToken: newOwnerToken,
                        metadata
                    }));
                } catch (err) {
                    console.error('[API] /api/saves upload/sync error:', err);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Internal error saving file' }));
                    }
                }
            })();
        });
    }

    async function handleDeleteSave(req, res, urlObj, pathname) {
        let rawSaveName = pathname.substring('/api/saves/'.length);
        try { rawSaveName = decodeURIComponent(rawSaveName); } catch (_) {}
        const saveName = sanitizeFilename(rawSaveName);
        if (!saveName || isReservedFilename(saveName)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid save file name' }));
            return;
        }
        const queryRealm = urlObj.searchParams.get('realm') || 'angband';
        if (!isValidRealm(queryRealm)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid realm' }));
            return;
        }

        const saveDirs = getSaveDirsForRealm(queryRealm);
        const cleanNoExt = stripUnixUidPrefix(saveName).replace(/\.sav$/i, '');
        const matchedPaths = [];
        const deleteCands = Array.from(new Set([
            saveName,
            cleanNoExt + '.sav',
            cleanNoExt,
            '0.' + cleanNoExt,
            '0.' + cleanNoExt + '.sav'
        ]));

        for (const sDir of saveDirs) {
            for (const fname of deleteCands) {
                const cand = path.join(sDir, fname);
                try {
                    const st = await fs.promises.stat(cand);
                    if (st.isFile() && !matchedPaths.includes(cand)) {
                        matchedPaths.push(cand);
                    }
                } catch (_) {}
            }
        }

        if (matchedPaths.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Save file not found' }));
            return;
        }

        const reqToken = extractRequestOwnerTokens(req, urlObj);
        for (const mp of matchedPaths) {
            if (!(await verifyOwnerTokenAsync(mp, reqToken))) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden: invalid owner token for existing character' }));
                return;
            }
        }

        try {
            for (const savePath of matchedPaths) {
                const dir = path.dirname(savePath);
                const slotBase = path.basename(savePath);
                const slotStem = slotBase.replace(/\.sav$/i, '');
                const cleanStem = stripUnixUidPrefix(slotStem);
                const targets = [
                    savePath,
                    savePath + '.living.sav',
                    savePath + '.living.sav.realm.json',
                    savePath + '.realm.json',
                    getOwnerTokenPath(savePath),
                    savePath + '.ironman',
                    savePath + '.ryod.json',
                    path.join(dir, slotStem + '.ryod.json'),
                    path.join(dir, cleanStem + '.owner.json'),
                    path.join(dir, cleanStem + '.realm.json')
                ];
                for (const t of targets) {
                    await fs.promises.unlink(t).catch(() => {});
                }
                if (hasFloorSidecarsForRealm(queryRealm)) {
                    try {
                        const dirFiles = await fs.promises.readdir(dir);
                        for (const f of dirFiles) {
                            if (!FLOOR_SIDECAR_RE.test(f)) continue;
                            if (
                                f.startsWith(slotBase + '.') ||
                                f.startsWith(slotStem + '.') ||
                                f.startsWith(cleanStem + '.') ||
                                f.startsWith(slotBase + '.living.sav.') ||
                                f.startsWith(slotStem + '.living.sav.')
                            ) {
                                await fs.promises.unlink(path.join(dir, f)).catch(() => {});
                            }
                        }
                    } catch (_) {}
                }
                clearSaveDead(savePath);
                savesMetaIndex.delete(path.resolve(savePath));
                ownerHashCache.delete(path.resolve(savePath));
                if (vaultIndex) vaultIndex.deleteSaveMeta(savePath);
            }

            invalidateSavesCache(queryRealm, saveName);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'deleted', filename: saveName, realm: queryRealm }));
        } catch (err) {
            console.error('[API] /api/saves/delete error:', err);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal error' }));
            }
        }
    }

    function handleSaveVaultRoute(req, res, urlObj, pathname) {
        if (pathname === '/api/saves' && req.method === 'GET') {
            handleListSaves(req, res, urlObj);
            return true;
        }
        if (pathname === '/api/saves/restore-checkpoint' && req.method === 'POST') {
            handleRestoreCheckpoint(req, res, urlObj);
            return true;
        }
        if ((pathname === '/api/saves/latest' || pathname === '/api/saves-download-current') && req.method === 'GET') {
            handleDownloadLatestSave(req, res, urlObj);
            return true;
        }
        if (pathname === '/api/saves/upload' && req.method === 'POST') {
            handleUploadOrSyncSave(req, res, urlObj, false);
            return true;
        }
        if (pathname === '/api/saves/sync' && req.method === 'POST') {
            handleUploadOrSyncSave(req, res, urlObj, true);
            return true;
        }
        if (pathname.startsWith('/api/saves/') && !pathname.endsWith('/blueprint')) {
            if (req.method === 'GET') {
                handleDownloadSingleSave(req, res, urlObj, pathname);
                return true;
            }
            if (req.method === 'DELETE') {
                handleDeleteSave(req, res, urlObj, pathname);
                return true;
            }
        }
        return false;
    }

    return {
        savesCacheMap,
        savesMetaIndex,
        ownerHashCache,
        invalidateSavesCache,
        isReservedFilename,
        sanitizeFilename,
        getOwnerTokenPath,
        parseOwnerTokens,
        extractVaultId,
        extractRequestOwnerTokens,
        verifyOwnerToken,
        verifyOwnerTokenAsync,
        createOwnerToken,
        createOwnerTokenAsync,
        readSaveMetadataAsync,
        readSaveMetadata,
        markSaveDeadAsync,
        clearSaveDead,
        isSaveMarkedDead,
        handleSaveVaultRoute
    };
}

module.exports = {
    MAX_SAVES_META_INDEX,
    MAX_OWNER_HASH_CACHE,
    MAX_OWNER_TOKENS,
    isReservedFilename,
    sanitizeFilename,
    isSidecarOrHiddenSaveFile,
    getOwnerTokenPath,
    parseOwnerTokens,
    extractVaultId,
    extractRequestOwnerTokens,
    createSaveVaultService
};

/**
 * Angband3D Local WebAssembly Bridge & IndexedDB Save Manager
 * Drop-in replacement for GameNetwork that connects directly to the
 * in-browser WebAssembly engine running in engine-worker.js.
 * Provides 0ms latency, 100% offline play, and local IndexedDB save persistence.
 */

class LocalSaveManager {
    static DB_NAME = '/lib/save';
    static STORE_NAME = 'FILE_DATA';
    static DB_VERSION = 22;

    static openDB() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') return resolve(null);
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                let store;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    store = db.createObjectStore(this.STORE_NAME);
                } else {
                    store = e.target.transaction.objectStore(this.STORE_NAME);
                }
                if (store && !store.indexNames.contains('timestamp')) {
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    }

    static _normalizePaths(slot, realm) {
        if (!slot) return [];
        let s = String(slot).trim().replace(/^\/lib\/save\//, '');
        let r = realm ? String(realm).toLowerCase() : '';
        if (s.includes(':')) {
            const parts = s.split(':');
            r = parts[0].toLowerCase();
            s = parts.slice(1).join(':');
        }
        const base = s.replace(/(\.sav|\.living\.sav|\.floor\.sav|\.bookmark\.sav|\.realm\.json|\.ryod\.json)$/i, '');
        const paths = new Set();
        paths.add('/lib/save/' + s);
        paths.add('/lib/save/' + base);
        paths.add('/lib/save/' + base + '.sav');
        if (r) {
            paths.add('/lib/save/' + r + ':' + s);
            paths.add('/lib/save/' + r + ':' + base);
            paths.add('/lib/save/' + r + ':' + base + '.sav');
            paths.add('/lib/save/' + r + '_' + s);
            paths.add('/lib/save/' + r + '_' + base);
            paths.add('/lib/save/' + r + '_' + base + '.sav');
        }
        return Array.from(paths);
    }

    static async listSaves() {
        try {
            const db = await this.openDB();
            if (!db) return [];
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const req = store.openCursor();
                const savesByBase = new Map();
                const sidecars = new Map();
                const rawEntries = [];
                const magicToRealm = { SaveNHCK: 'nethack', SaveDCSS: 'dcss', SaveBROG: 'brogue', SaveROGU: 'rogue', SaveRYOD: 'ryod' };
                req.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const k = cursor.key;
                        const record = cursor.value || {};
                        if (typeof k === 'string' && k.startsWith('/lib/save/')) {
                            const filename = k.replace('/lib/save/', '');
                            if (filename && filename !== '.' && filename !== '..' && !filename.includes('/')) {
                                if (filename.endsWith('.sav.realm.json') && record.contents) {
                                    try {
                                        const txt = new TextDecoder('utf-8').decode(record.contents);
                                        sidecars.set(filename.replace(/\.sav\.realm\.json$/i, '').toLowerCase(), JSON.parse(txt));
                                    } catch (_) {}
                                } else if (!/\.(living\.sav|floor\.sav|bookmark\.sav|realm\.json|ryod\.json)$/i.test(filename)) {
                                    rawEntries.push({ filename, record });
                                }
                            }
                        }
                        cursor.continue();
                    } else {
                        for (const { filename, record } of rawEntries) {
                            const base = filename.replace(/\.sav$/i, '');
                            const lowerBase = base.toLowerCase();
                            const rawTs = record.timestamp || record.mtime || 0;
                            const ts = rawTs ? (rawTs instanceof Date ? rawTs.getTime() : new Date(rawTs).getTime()) : 0;
                            let realm = 'angband';
                            let desc = 'Local Device Save (0ms Offline)';
                            const bytes = record.contents;
                            if (bytes && bytes.length >= 36) {
                                let magic = '';
                                for (let i = 0; i < 8; i++) magic += String.fromCharCode(bytes[i]);
                                if (magicToRealm[magic]) {
                                    realm = magicToRealm[magic];
                                    const descLen = ((bytes[28]) | (bytes[29] << 8) | (bytes[30] << 16) | (bytes[31] * 0x1000000)) >>> 0;
                                    if (descLen > 0 && 36 + descLen <= bytes.length) {
                                        try {
                                            desc = new TextDecoder('utf-8').decode(bytes.subarray(36, 36 + descLen)).replace(/\0+$/, '') || desc;
                                        } catch (_) {}
                                    }
                                }
                            }
                            const sc = sidecars.get(lowerBase);
                            if (sc && sc.realm) realm = sc.realm;
                            const entry = {
                                characterName: (sc && sc.characterName) || base,
                                filename,
                                realm,
                                level: sc ? sc.level : undefined,
                                depth: sc ? sc.depth : undefined,
                                race: sc ? sc.race : undefined,
                                class: sc ? sc.class : undefined,
                                ryodTitle: sc ? sc.ryodTitle : undefined,
                                description: desc,
                                isLocal: true,
                                lastModified: ts || Date.now(),
                                timestamp: ts
                            };
                            if (!savesByBase.has(lowerBase) || ts > (savesByBase.get(lowerBase).timestamp || 0)) {
                                savesByBase.set(lowerBase, entry);
                            }
                        }
                        const saves = Array.from(savesByBase.values());
                        saves.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                        resolve(saves);
                    }
                };
                req.onerror = () => resolve([]);
            });
        } catch (_) {
            return [];
        }
    }

    static async getSaveData(filename, realm = null) {
        try {
            const db = await this.openDB();
            if (!db) return null;
            const candidates = this._normalizePaths(filename, realm);
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const tryNext = (i) => {
                    if (i >= candidates.length) return resolve(null);
                    const req = store.get(candidates[i]);
                    req.onsuccess = () => {
                        if (req.result && req.result.contents) {
                            resolve(req.result.contents);
                        } else {
                            tryNext(i + 1);
                        }
                    };
                    req.onerror = () => tryNext(i + 1);
                };
                tryNext(0);
            });
        } catch (_) {
            return null;
        }
    }

    static async putSaveData(filename, uint8Array, realm = null) {
        try {
            const db = await this.openDB();
            if (!db) return false;
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const record = {
                    timestamp: new Date(),
                    mode: 33206, // regular file 0100666
                    contents: uint8Array
                };
                const candidates = this._normalizePaths(filename, realm);
                for (const p of candidates) {
                    store.put(record, p);
                }
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (_) {
            return false;
        }
    }

    static async deleteSave(filename, realm = null) {
        try {
            const db = await this.openDB();
            if (!db) return false;
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const candidates = this._normalizePaths(filename, realm);
                const exts = ['', '.sav', '.living.sav', '.sav.living.sav', '.floor.sav', '.sav.floor.sav', '.bookmark.sav', '.sav.bookmark.sav', '.realm.json', '.sav.realm.json', '.ryod.json', '.sav.ryod.json'];
                for (const p of candidates) {
                    const b = p.replace(/\.sav$/i, '');
                    for (const ext of exts) {
                        store.delete(b + ext);
                    }
                }
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (_) {
            return false;
        }
    }

    static async saveCheckpoint(slot, kind = 'living', data = null, realm = null) {
        if (!slot) return false;
        try {
            const db = await this.openDB();
            if (!db) return false;
            let bytes = data;
            if (typeof data === 'string') {
                bytes = new TextEncoder().encode(data);
            } else if (data && typeof data === 'object' && !(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) {
                bytes = new TextEncoder().encode(JSON.stringify(data));
            } else if (data instanceof ArrayBuffer) {
                bytes = new Uint8Array(data);
            }
            if (!bytes) return false;
            const candidates = this._normalizePaths(slot, realm);
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const record = {
                    timestamp: new Date(),
                    mode: 33206,
                    contents: bytes
                };
                for (const p of candidates) {
                    const b = p.replace(/(\.sav|\.living\.sav|\.floor\.sav|\.bookmark\.sav)$/i, '');
                    store.put(record, b + `.${kind}.sav`);
                    store.put(record, b + `.sav.${kind}.sav`);
                }
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (_) {
            return false;
        }
    }

    static async restoreCheckpoint(slot, kind = 'living', realm = null) {
        if (!slot) return null;
        try {
            const db = await this.openDB();
            if (!db) return null;
            const candidates = this._normalizePaths(slot, realm);
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const lookups = [];
                for (const p of candidates) {
                    const b = p.replace(/(\.sav|\.living\.sav|\.floor\.sav|\.bookmark\.sav)$/i, '');
                    lookups.push(b + `.${kind}.sav`);
                    lookups.push(b + `.sav.${kind}.sav`);
                }
                const tryNext = (i) => {
                    if (i >= lookups.length) return resolve(null);
                    const req = store.get(lookups[i]);
                    req.onsuccess = () => {
                        if (req.result && req.result.contents) {
                            resolve(req.result.contents);
                        } else {
                            tryNext(i + 1);
                        }
                    };
                    req.onerror = () => tryNext(i + 1);
                };
                tryNext(0);
            });
        } catch (_) {
            return null;
        }
    }
}

class LocalGameBridge {
    constructor() {
        this.worker = null;
        this.connected = false;
        this.pingMs = 0;
        this.isInQueue = false;
        this.currentChar = 'Adventurer';
        this.currentIsNew = false;
        this.currentSave = null;
        this.isLocal = true;

        this.onFrame = null;
        this.onHello = null;
        this.onBye = null;
        this.onPing = null;
        this.onStatus = null;
        this.onQueue = null;
        this.onSavePersisted = null;

        this._pendingSaveListResolvers = [];
        this._pendingExportResolvers = [];
        this._pendingImportResolvers = [];
        this._watchdogTimer = null;
    }

    _clearWatchdog() {
        if (this._watchdogTimer) {
            clearTimeout(this._watchdogTimer);
            this._watchdogTimer = null;
        }
    }

    static SUPPORTED_REALMS = new Set(['angband', 'nethack', 'dcss', 'brogue', 'rogue', 'ryod']);
    static supportsRealm(realm) {
        return LocalGameBridge.SUPPORTED_REALMS.has(String(realm || 'angband').toLowerCase());
    }

    connect(charName = 'Adventurer', isNew = false, saveFile = null, realm = 'angband', customBirthOrOpts = false) {
        const opts = (customBirthOrOpts && typeof customBirthOrOpts === 'object') ? customBirthOrOpts : { customBirth: Boolean(customBirthOrOpts) };
        this.currentChar = charName;
        this.currentIsNew = isNew;
        this.currentSave = saveFile;
        this.currentRealm = String(realm || 'angband').toLowerCase();
        this.isInQueue = false;

        this._clearWatchdog();

        if (!LocalGameBridge.supportsRealm(this.currentRealm)) {
            const err = `Realm "${this.currentRealm}" requires Cloud Native C/C++ Engine.`;
            console.error('[LocalBridge]', err);
            if (this.onStatus) this.onStatus(err);
            if (this.onError) this.onError(err);
            if (this.onBye) this.onBye(err);
            return;
        }

        if (this.worker) {
            this.disconnect();
        }

        if (this.onStatus) {
            this.onStatus(this.currentRealm === 'angband'
                ? 'Initializing Local WebAssembly Engine (0ms)...'
                : `Initializing Local ${this.currentRealm.toUpperCase()} Cartridge (0ms)...`);
        }

        this._watchdogTimer = setTimeout(() => {
            if (!this.connected) {
                const err = new Error(`Local WASM/Worker startup timed out after 3500ms for realm ${this.currentRealm}`);
                console.warn('[LocalBridge 3.5s Watchdog]', err.message);
                if (this.worker) {
                    try { this.worker.terminate(); } catch (_) {}
                    this.worker = null;
                }
                this.connected = false;
                if (this.onWasmFallback) {
                    try { this.onWasmFallback(err); } catch (_) {}
                }
                if (this.onEvent) {
                    try { this.onEvent({ type: 'wasm_fallback', error: err, realm: this.currentRealm }); } catch (_) {}
                }
            }
        }, 3500);

        const workerUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
            ? window.location.origin + '/js/engine-worker.js'
            : '/js/engine-worker.js';

        try {
            this.worker = new Worker(workerUrl);
        } catch (err) {
            try {
                this.worker = new Worker('/js/engine-worker.js');
            } catch (err2) {
                try {
                    this.worker = new Worker('js/engine-worker.js');
                } catch (err3) {
                    this._clearWatchdog();
                    const fatal = new Error(`Failed to instantiate Web Worker: ${err3.message}`);
                    console.error('[LocalBridge Worker Pre-connect Fatal]', fatal);
                    if (this.onWasmFallback) try { this.onWasmFallback(fatal); } catch (_) {}
                    if (this.onEvent) try { this.onEvent({ type: 'wasm_fallback', error: fatal, realm: this.currentRealm }); } catch (_) {}
                    return;
                }
            }
        }

        this.worker.onmessage = (e) => {
            const data = e.data;
            if (!data) return;

            switch (data.type) {
                case 'status':
                    if (this.onStatus) this.onStatus(data.message);
                    break;

                case 'ready':
                    this._clearWatchdog();
                    this.connected = true;
                    if (this.onPing) this.onPing(0);
                    if (this.onStatus) this.onStatus('Local 0ms Engine Running');
                    break;

                case 'hello':
                    this._clearWatchdog();
                    this.connected = true;
                    if (this.onHello) this.onHello(data.msg);
                    if (this.onPing) this.onPing(0);
                    break;

                case 'event':
                    if (data.event && data.event.t === 'commands') {
                        if (typeof window !== 'undefined' && window.ActionCatalog && typeof window.ActionCatalog.applyEngineCommands === 'function') {
                            window.ActionCatalog.applyEngineCommands(data.event);
                        }
                        if (this.onCommands) this.onCommands(data.event);
                    } else if (data.event && data.event.t === 'spells' && this.onSpells) {
                        this.onSpells(data.event);
                    }
                    if (this.onEvent) this.onEvent(data.event);
                    break;

                case 'frame':
                    this._clearWatchdog();
                    if (this.onFrame) this.onFrame(data.frame);
                    break;

                case 'bye':
                    this.connected = false;
                    if (this.onBye) this.onBye(data.detail || 'Game session terminated');
                    break;

                case 'saved_persisted':
                    if (this.onSavePersisted) this.onSavePersisted(data.filename);
                    if (this.onStatus) this.onStatus('Game saved to device (IndexedDB)');
                    break;

                case 'save_list':
                    while (this._pendingSaveListResolvers.length > 0) {
                        const resolve = this._pendingSaveListResolvers.shift();
                        resolve(data.saves || []);
                    }
                    break;

                case 'save_export':
                    while (this._pendingExportResolvers.length > 0) {
                        const resolve = this._pendingExportResolvers.shift();
                        resolve({ filename: data.filename, data: data.data });
                    }
                    break;

                case 'save_imported':
                    while (this._pendingImportResolvers.length > 0) {
                        const resolve = this._pendingImportResolvers.shift();
                        resolve(true);
                    }
                    break;

                case 'error':
                    console.error('[LocalBridge Worker Error]', data.message);
                    if (this.onStatus) this.onStatus('Error: ' + data.message);
                    break;
            }
        };

        this.worker.onerror = (err) => {
            console.error('[LocalBridge Worker Fatal]', err);
            if (this.onStatus) this.onStatus('Fatal engine worker error');
        };

        let effectiveRyod = (opts && opts.ryodBlueprint) || null;
        if (this.currentRealm === 'ryod' && !effectiveRyod && typeof window !== 'undefined' && window.RyodForge && typeof window.RyodForge.getCurrentBlueprint === 'function') {
            effectiveRyod = window.RyodForge.getCurrentBlueprint();
        }
        const effectiveUser = (this.currentRealm !== 'angband' && !saveFile && !String(charName || '').toLowerCase().startsWith(this.currentRealm + '_'))
            ? `${this.currentRealm}_${charName}`
            : charName;

        this.worker.postMessage({
            type: 'init',
            realm: this.currentRealm,
            username: effectiveUser,
            isNew: isNew,
            saveFile: saveFile,
            customBirth: Boolean(opts && opts.customBirth),
            randomBirth: Boolean(opts && opts.randomBirth),
            ryodBlueprint: effectiveRyod
        });
    }

    async saveGame() {
        if (!this.connected || !this.worker) return false;
        return new Promise((resolve) => {
            let resolved = false;
            const prev = this.onSavePersisted;
            const onPersist = (data) => {
                if (typeof prev === 'function') {
                    try { prev(data); } catch (_) {}
                }
                if (!resolved) {
                    resolved = true;
                    this.onSavePersisted = prev;
                    resolve(true);
                }
            };
            this.onSavePersisted = onPersist;
            this.sendCommand('save');
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (this.onSavePersisted === onPersist) {
                        this.onSavePersisted = prev;
                    }
                    resolve(false);
                }
            }, 2000);
        });
    }

    async saveAndDisconnect() {
        try {
            await this.saveGame();
        } catch (_) {}
        this.disconnect();
    }

    disconnect() {
        this._clearWatchdog();
        this.connected = false;
        if (this.worker) {
            try {
                this.worker.terminate();
            } catch (_) {}
            this.worker = null;
        }
        if (this.onStatus) this.onStatus('Local engine stopped');
    }

    leaveQueue() {
        this.isInQueue = false;
    }

    _validateCommand(cmd) {
        let sc = null;
        if (typeof ScreenContext !== 'undefined') sc = ScreenContext;
        else if (typeof window !== 'undefined' && window.ScreenContext) sc = window.ScreenContext;
        else if (typeof require === 'function') {
            try { sc = require('./screen-context.js'); } catch (_) {}
        }
        if (sc && typeof sc.isAllowedEngineCommand === 'function') {
            return sc.isAllowedEngineCommand(cmd);
        }
        return true;
    }

    sendKey(spec) {
        if (!this.worker) return;
        const cmd = `key ${spec}`;
        if (!this._validateCommand(cmd)) {
            console.warn('[LocalBridge] Disallowed command blocked:', cmd);
            return;
        }
        this.worker.postMessage({
            type: 'command',
            cmd: cmd
        });
    }

    sendCommand(cmd) {
        if (!this.worker) return;
        if (!this._validateCommand(cmd)) {
            console.warn('[LocalBridge] Disallowed command blocked:', cmd);
            return;
        }
        this.worker.postMessage({
            type: 'command',
            cmd: cmd
        });
    }

    async listSaves() {
        return LocalSaveManager.listSaves();
    }

    async exportSave(filename) {
        const contents = await LocalSaveManager.getSaveData(filename);
        if (contents) {
            return { filename, data: contents.buffer };
        }
        if (!this.worker) return null;
        return new Promise((resolve, reject) => {
            this._pendingExportResolvers.push(resolve);
            this.worker.postMessage({ type: 'export_save', filename });
            setTimeout(() => reject(new Error('Export timed out')), 4000);
        });
    }

    async importSave(filename, arrayBuffer) {
        const ok = await LocalSaveManager.putSaveData(filename, new Uint8Array(arrayBuffer));
        if (this.worker) {
            this.worker.postMessage({
                type: 'import_save',
                filename,
                data: arrayBuffer
            }, [arrayBuffer]);
        }
        return ok;
    }

    async deleteSave(filename) {
        const ok = await LocalSaveManager.deleteSave(filename, this.currentRealm);
        if (this.worker) {
            this.worker.postMessage({ type: 'delete_save', filename });
        }
        return ok;
    }

    async saveCheckpoint(slot, kind = 'living', data = null, realm = null) {
        return LocalSaveManager.saveCheckpoint(slot, kind, data, realm || this.currentRealm);
    }

    async restoreCheckpoint(slot, kind = 'living', realm = null) {
        return LocalSaveManager.restoreCheckpoint(slot, kind, realm || this.currentRealm);
    }
}

if (typeof window !== 'undefined') {
    window.LocalSaveManager = LocalSaveManager;
    window.LocalGameBridge = LocalGameBridge;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LocalSaveManager, LocalGameBridge };
}

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

    static async listSaves() {
        try {
            const db = await this.openDB();
            if (!db) return [];
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const req = store.openCursor();
                const savesByBase = new Map();
                req.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const k = cursor.key;
                        const record = cursor.value || {};
                        if (typeof k === 'string' && k.startsWith('/lib/save/')) {
                            const filename = k.replace('/lib/save/', '');
                            if (filename && filename !== '.' && filename !== '..' && !filename.includes('/')) {
                                const base = filename.replace(/\.sav$/i, '');
                                const lowerBase = base.toLowerCase();
                                const rawTs = record.timestamp || record.mtime || 0;
                                const ts = rawTs ? (rawTs instanceof Date ? rawTs.getTime() : new Date(rawTs).getTime()) : 0;
                                const entry = {
                                    characterName: base,
                                    filename: filename,
                                    description: 'Local Device Save (Offline)',
                                    isLocal: true,
                                    lastModified: ts || Date.now(),
                                    timestamp: ts
                                };
                                if (!savesByBase.has(lowerBase) || ts > (savesByBase.get(lowerBase).timestamp || 0)) {
                                    savesByBase.set(lowerBase, entry);
                                }
                            }
                        }
                        cursor.continue();
                    } else {
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

    static async getSaveData(filename) {
        try {
            const db = await this.openDB();
            if (!db) return null;
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const req = store.get('/lib/save/' + filename);
                req.onsuccess = () => {
                    const val = req.result;
                    if (val && val.contents) {
                        resolve(val.contents);
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            });
        } catch (_) {
            return null;
        }
    }

    static async putSaveData(filename, uint8Array) {
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
                const req = store.put(record, '/lib/save/' + filename);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            });
        } catch (_) {
            return false;
        }
    }

    static async deleteSave(filename) {
        try {
            const db = await this.openDB();
            if (!db) return false;
            return new Promise((resolve) => {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const base = filename.replace(/\.sav$/i, '');
                store.delete('/lib/save/' + base);
                store.delete('/lib/save/' + base + '.sav');
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (_) {
            return false;
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
    }

    connect(charName = 'Adventurer', isNew = false, saveFile = null, realm = 'angband') {
        this.currentChar = charName;
        this.currentIsNew = isNew;
        this.currentSave = saveFile;
        this.currentRealm = realm || 'angband';
        this.isInQueue = false;

        if (this.currentRealm && this.currentRealm !== 'angband') {
            const err = `Realm "${this.currentRealm}" is not supported in offline WebAssembly mode. Fallbacks are disabled.`;
            console.error('[LocalBridge]', err);
            if (this.onStatus) this.onStatus(err);
            if (this.onError) this.onError(err);
            if (this.onBye) this.onBye(err);
            return;
        }

        if (this.worker) {
            this.disconnect();
        }

        if (this.onStatus) this.onStatus('Initializing Local WebAssembly Engine...');

        const workerUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
            ? window.location.origin + '/js/engine-worker.js'
            : '/js/engine-worker.js';

        try {
            this.worker = new Worker(workerUrl);
        } catch (err) {
            try {
                this.worker = new Worker('/js/engine-worker.js');
            } catch (err2) {
                console.warn('[LocalBridge] Absolute worker path failed, falling back to relative:', err2);
                this.worker = new Worker('js/engine-worker.js');
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
                    this.connected = true;
                    if (this.onPing) this.onPing(0);
                    if (this.onStatus) this.onStatus('Local Engine Running (Offline Mode)');
                    break;

                case 'hello':
                    this.connected = true;
                    if (this.onHello) this.onHello(data.msg);
                    if (this.onPing) this.onPing(0);
                    break;

                case 'frame':
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

        this.worker.postMessage({
            type: 'init',
            username: charName,
            isNew: isNew,
            saveFile: saveFile
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
        const ok = await LocalSaveManager.deleteSave(filename);
        if (this.worker) {
            this.worker.postMessage({ type: 'delete_save', filename });
        }
        return ok;
    }
}

if (typeof window !== 'undefined') {
    window.LocalSaveManager = LocalSaveManager;
    window.LocalGameBridge = LocalGameBridge;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LocalSaveManager, LocalGameBridge };
}

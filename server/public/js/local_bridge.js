/**
 * Angband3D Local WebAssembly Bridge & IndexedDB Save Manager
 * Drop-in replacement for GameNetwork that connects directly to the
 * in-browser WebAssembly engine running in engine-worker.js.
 * Provides 0ms latency, 100% offline play, and local IndexedDB save persistence.
 */

class LocalSaveManager {
    static DB_NAME = '/lib/save';
    static STORE_NAME = 'FILE_DATA';
    static DB_VERSION = 21;

    static openDB() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') return resolve(null);
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
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
                const req = store.getAllKeys();
                req.onsuccess = async () => {
                    const keys = req.result || [];
                    const saves = [];
                    for (const k of keys) {
                        if (typeof k === 'string' && k.startsWith('/lib/save/')) {
                            const filename = k.replace('/lib/save/', '');
                            if (filename && filename !== '.' && filename !== '..') {
                                saves.push({
                                    characterName: filename,
                                    filename: filename,
                                    description: 'Local Device Save (Offline)',
                                    isLocal: true,
                                    lastModified: Date.now()
                                });
                            }
                        }
                    }
                    resolve(saves);
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
                const req = store.delete('/lib/save/' + filename);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
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

    connect(charName = 'Adventurer', isNew = false, saveFile = null) {
        this.currentChar = charName;
        this.currentIsNew = isNew;
        this.currentSave = saveFile;
        this.isInQueue = false;

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

    sendKey(spec) {
        if (!this.worker) return;
        this.worker.postMessage({
            type: 'command',
            cmd: `key ${spec}`
        });
    }

    sendCommand(cmd) {
        if (!this.worker) return;
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

window.LocalSaveManager = LocalSaveManager;
window.LocalGameBridge = LocalGameBridge;

/**
 * Angband3D WebAssembly Engine Worker
 * Runs the compiled C engine in a background Web Worker thread.
 * Synchronizes savefiles with browser IndexedDB (IDBFS) for true offline capability.
 */

/* global importScripts, createAngbandModule */

let angbandModule = null;
let cartridgeSession = null;
let activeRealm = 'angband';
let isAwaitingInput = false;
const commandQueue = [];
let currentChar = 'Adventurer';
let wasmPlayerAlive = true;
const CARTRIDGE_REALMS = new Set(['nethack', 'dcss', 'brogue', 'rogue', 'ryod']);

function ensureCartridgesBundleLoaded() {
    if (typeof self.YendorWorkerCartridges !== 'undefined') return true;
    const baseJs = (typeof self !== 'undefined' && self.location && self.location.origin)
        ? self.location.origin + '/js/'
        : '/js/';
    for (const candidate of [
        baseJs + 'cartridges-worker-bundle.js',
        '/js/cartridges-worker-bundle.js',
        './cartridges-worker-bundle.js',
        baseJs + 'worker-cartridges.js',
        '/js/worker-cartridges.js',
        './worker-cartridges.js'
    ]) {
        try {
            importScripts(candidate);
            if (typeof self.YendorWorkerCartridges !== 'undefined') return true;
        } catch (_) {}
    }
    return false;
}

function getSaveList() {
    const out = new Set();
    if (angbandModule && angbandModule.FS) {
        try {
            for (const f of angbandModule.FS.readdir('/lib/save')) {
                if (f !== '.' && f !== '..' && !/\.(living\.sav|floor\.sav|bookmark\.sav|realm\.json|ryod\.json)$/i.test(f)) out.add(f);
            }
        } catch (_) {}
    }
    if (typeof self.YendorWorkerCartridges !== 'undefined' && self.YendorWorkerCartridges.VFS) {
        try {
            for (const f of self.YendorWorkerCartridges.VFS.readdirSync('/lib/save')) {
                if (f !== '.' && f !== '..' && !/\.(living\.sav|floor\.sav|bookmark\.sav|realm\.json|ryod\.json)$/i.test(f)) out.add(f);
            }
        } catch (_) {}
    }
    return Array.from(out);
}

async function startCartridgeEngine(realm, data) {
    self.postMessage({ type: 'status', message: `Booting local ${realm.toUpperCase()} 3D Cartridge (0ms Worker)...` });
    if (!ensureCartridgesBundleLoaded()) {
        self.postMessage({ type: 'error', message: 'Could not load cartridges-worker-bundle.js' });
        self.postMessage({ type: 'bye', detail: 'Failed to load local cartridge runtime' });
        return;
    }
    const YWC = self.YendorWorkerCartridges;
    await YWC.VFS.hydrateFromIndexedDB();
    cartridgeSession = YWC.createCartridgeSession({
        realm,
        user: data.username || 'Adventurer',
        isNew: !!data.isNew,
        saveFile: data.saveFile || null,
        customBirth: !!data.customBirth,
        randomBirth: !!data.randomBirth,
        ryodBlueprint: data.ryodBlueprint || null
    });
    currentChar = cartridgeSession.user;
    await YWC.VFS.flushToIndexedDB();
    self.postMessage({ type: 'ready', saves: getSaveList() });
    self.postMessage({ type: 'hello', msg: cartridgeSession.getHello() });
    self.postMessage({ type: 'event', event: cartridgeSession.getCommands() });
    self.postMessage({ type: 'frame', frame: cartridgeSession.getFrame() });
}

self.onmessage = async (e) => {
    const data = e.data;
    if (!data || !data.type) return;

    switch (data.type) {
        case 'init': {
            const reqRealm = String(data.realm || 'angband').toLowerCase();
            activeRealm = reqRealm;
            cartridgeSession = null;
            if (CARTRIDGE_REALMS.has(reqRealm)) {
                await startCartridgeEngine(reqRealm, data);
                return;
            }
            if (reqRealm !== 'angband') {
                self.postMessage({ type: 'error', message: `Realm "${reqRealm}" requires Cloud Native C/C++ Engine.` });
                self.postMessage({ type: 'bye', detail: `Realm "${reqRealm}" is hosted on Cloud Engine.` });
                return;
            }
            currentChar = data.username || 'Adventurer';
            await startEngine(currentChar, !!data.isNew, data.saveFile);
            break;
        }

        case 'command':
            if (data.cmd) {
                if (cartridgeSession) {
                    const msgs = cartridgeSession.handleCommand(data.cmd);
                    const YWC = self.YendorWorkerCartridges;
                    if (YWC && YWC.VFS) {
                        YWC.VFS.flushToIndexedDB().then((flushed) => {
                            if (data.cmd === 'save' && flushed) {
                                self.postMessage({ type: 'saved_persisted', filename: cartridgeSession ? cartridgeSession.user : currentChar });
                            }
                        });
                    }
                    for (const msg of msgs) {
                        if (msg.t === 'frame') self.postMessage({ type: 'frame', frame: msg });
                        else if (msg.t === 'bye') self.postMessage({ type: 'bye', detail: msg.detail });
                        else self.postMessage({ type: 'event', event: msg });
                    }
                } else {
                    pushCommand(data.cmd);
                }
            }
            break;

        case 'list_saves':
            if (!angbandModule && ensureCartridgesBundleLoaded()) {
                await self.YendorWorkerCartridges.VFS.hydrateFromIndexedDB();
            }
            self.postMessage({ type: 'save_list', saves: getSaveList() });
            break;

        case 'export_save': {
            const name = data.filename || currentChar;
            try {
                let fileBytes = null;
                if (angbandModule && angbandModule.FS && angbandModule.FS.analyzePath('/lib/save/' + name).exists) {
                    fileBytes = angbandModule.FS.readFile('/lib/save/' + name);
                } else if (ensureCartridgesBundleLoaded()) {
                    await self.YendorWorkerCartridges.VFS.hydrateFromIndexedDB();
                    const cand = self.YendorWorkerCartridges.VFS.existsSync('/lib/save/' + name) ? name : (name + '.sav');
                    fileBytes = self.YendorWorkerCartridges.VFS.readFileSync('/lib/save/' + cand);
                }
                if (!fileBytes) throw new Error('Save not found');
                const buffer = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength);
                self.postMessage({ type: 'save_export', filename: name, data: buffer }, [buffer]);
            } catch (err) {
                self.postMessage({ type: 'error', message: 'Failed to export save: ' + err.message });
            }
            break;
        }

        case 'import_save': {
            const name = data.filename;
            const buffer = data.data;
            try {
                if (angbandModule && angbandModule.FS) {
                    angbandModule.FS.writeFile('/lib/save/' + name, new Uint8Array(buffer));
                    angbandModule.FS.syncfs(false, (err) => {
                        if (err) self.postMessage({ type: 'error', message: 'Sync error: ' + err.message });
                        else self.postMessage({ type: 'save_imported', filename: name, saves: getSaveList() });
                    });
                } else if (ensureCartridgesBundleLoaded()) {
                    await self.YendorWorkerCartridges.VFS.hydrateFromIndexedDB();
                    self.YendorWorkerCartridges.VFS.writeFileSync('/lib/save/' + name, new Uint8Array(buffer));
                    await self.YendorWorkerCartridges.VFS.flushToIndexedDB();
                    self.postMessage({ type: 'save_imported', filename: name, saves: getSaveList() });
                } else {
                    throw new Error('Engine not initialized');
                }
            } catch (err) {
                self.postMessage({ type: 'error', message: 'Failed to import save: ' + err.message });
            }
            break;
        }

        case 'delete_save': {
            const name = data.filename;
            try {
                const base = String(name || '').replace(/(\.sav|\.living\.sav|\.floor\.sav|\.bookmark\.sav|\.realm\.json|\.ryod\.json)$/i, '');
                const sidecarExts = [
                    '', '.sav', '.living.sav', '.sav.living.sav',
                    '.floor.sav', '.sav.floor.sav',
                    '.bookmark.sav', '.sav.bookmark.sav',
                    '.realm.json', '.sav.realm.json',
                    '.ryod.json', '.sav.ryod.json'
                ];
                if (angbandModule && angbandModule.FS) {
                    for (const ext of sidecarExts) {
                        try { angbandModule.FS.unlink('/lib/save/' + base + ext); } catch (_) {}
                    }
                    angbandModule.FS.syncfs(false, () => {
                        self.postMessage({ type: 'save_deleted', filename: name, saves: getSaveList() });
                    });
                } else if (ensureCartridgesBundleLoaded()) {
                    await self.YendorWorkerCartridges.VFS.hydrateFromIndexedDB();
                    for (const ext of sidecarExts) {
                        try { self.YendorWorkerCartridges.VFS.unlinkSync('/lib/save/' + base + ext); } catch (_) {}
                    }
                    await self.YendorWorkerCartridges.VFS.flushToIndexedDB();
                    self.postMessage({ type: 'save_deleted', filename: name, saves: getSaveList() });
                } else {
                    throw new Error('Engine not initialized');
                }
            } catch (err) {
                self.postMessage({ type: 'error', message: 'Failed to delete save: ' + err.message });
            }
            break;
        }
    }
};

function pushCommand(cmd) {
    if (angbandModule && angbandModule.commandResolver) {
        const resolver = angbandModule.commandResolver;
        angbandModule.commandResolver = null;
        isAwaitingInput = false;
        resolver(cmd);
    } else {
        commandQueue.push(cmd);
    }
}

async function startEngine(charName, isNew, saveFile) {
    self.postMessage({ type: 'status', message: 'Loading Angband WebAssembly runtime...' });

    const baseWasm = (typeof self !== 'undefined' && self.location && self.location.origin)
        ? self.location.origin + '/wasm/'
        : '/wasm/';

    try {
        importScripts(baseWasm + 'angband.js');
    } catch (e) {
        try {
            importScripts('/wasm/angband.js');
        } catch (e2) {
            try {
                importScripts('../wasm/angband.js');
            } catch (e3) {
                self.postMessage({ type: 'error', message: 'Could not load wasm/angband.js: ' + e3.message });
                return;
            }
        }
    }

    const targetSlot = (saveFile || charName || 'Adventurer').trim().replace(/^\/lib\/save\//, '');
    const baseSlot = targetSlot.replace(/\.sav$/i, '');
    currentChar = baseSlot;

    const args = ['-mbridge', '-u' + targetSlot];
    if (isNew) args.push('-n');

    const config = {
        locateFile: (path) => {
            if (typeof self !== 'undefined' && self.location && self.location.origin) {
                return self.location.origin + '/wasm/' + path;
            }
            return '/wasm/' + path;
        },
        onAwaitingInput: function () {
            isAwaitingInput = true;
            if (commandQueue.length > 0 && this.commandResolver) {
                const nextCmd = commandQueue.shift();
                const resolver = this.commandResolver;
                this.commandResolver = null;
                isAwaitingInput = false;
                resolver(nextCmd);
            }
        },
        print: (text) => {
            const str = (text || '').trim();
            if (!str) return;

            try {
                const msg = JSON.parse(str);
                if (msg.t === 'hello') {
                    self.postMessage({ type: 'hello', msg });
                } else if (msg.t === 'frame') {
                    wasmPlayerAlive = !msg.player?.dead && (msg.player?.hp ?? 1) >= 0;
                    self.postMessage({ type: 'frame', frame: msg });
                } else if (msg.t === 'bye') {
                    self.postMessage({ type: 'bye', detail: msg.detail });
                } else if (msg.t === 'ok' && msg.detail === 'saved') {
                    if (angbandModule && angbandModule.FS) {
                        try {
                            const dotSavSlot = baseSlot + '.sav';
                            const livingSlot = baseSlot + '.living.sav';
                            const dotSavLivingSlot = baseSlot + '.sav.living.sav';
                            let data = null;
                            if (angbandModule.FS.analyzePath('/lib/save/' + targetSlot).exists) {
                                data = angbandModule.FS.readFile('/lib/save/' + targetSlot);
                                angbandModule.FS.writeFile('/lib/save/' + baseSlot, data);
                                angbandModule.FS.writeFile('/lib/save/' + dotSavSlot, data);
                            } else if (angbandModule.FS.analyzePath('/lib/save/' + baseSlot).exists) {
                                data = angbandModule.FS.readFile('/lib/save/' + baseSlot);
                                angbandModule.FS.writeFile('/lib/save/' + targetSlot, data);
                                angbandModule.FS.writeFile('/lib/save/' + dotSavSlot, data);
                            }
                            if (data && wasmPlayerAlive) {
                                angbandModule.FS.writeFile('/lib/save/' + livingSlot, data);
                                angbandModule.FS.writeFile('/lib/save/' + dotSavLivingSlot, data);
                            }
                        } catch (_) {}

                        angbandModule.FS.syncfs(false, (err) => {
                            if (err) console.error('[IDBFS Sync Error]', err);
                            self.postMessage({ type: 'saved_persisted', filename: baseSlot });
                        });
                    }
                    self.postMessage({ type: 'event', event: msg });
                } else {
                    self.postMessage({ type: 'event', event: msg });
                }
            } catch (err) {
                // Ignore raw stdout lines
            }
        },
        printErr: (text) => {
            console.warn('[Wasm Stderr]', text);
        },
        arguments: args,
        preRun: [
            function (mod) {
                try {
                    mod.FS.mkdir('/lib');
                } catch (e) {}
                try {
                    mod.FS.mkdir('/lib/save');
                } catch (e) {}

                if (mod.IDBFS) {
                    try {
                        mod.IDBFS.DB_VERSION = 22;
                        mod.FS.mount(mod.IDBFS, { autoPersist: true }, '/lib/save');
                        mod.addRunDependency('idbfs_sync_init');
                        mod.FS.syncfs(true, function (err) {
                            if (err) {
                                console.warn('[IDBFS] Initial sync warning:', err);
                            } else {
                                console.log('[IDBFS] Mounted and loaded /lib/save from IndexedDB');
                                try {
                                    const dotSavSlot = baseSlot + '.sav';
                                    const hasTarget = mod.FS.analyzePath('/lib/save/' + targetSlot).exists;
                                    const hasBase = mod.FS.analyzePath('/lib/save/' + baseSlot).exists;
                                    const hasDotSav = mod.FS.analyzePath('/lib/save/' + dotSavSlot).exists;

                                    let existingBytes = null;
                                    if (hasTarget) {
                                        existingBytes = mod.FS.readFile('/lib/save/' + targetSlot);
                                    } else if (hasBase) {
                                        existingBytes = mod.FS.readFile('/lib/save/' + baseSlot);
                                    } else if (hasDotSav) {
                                        existingBytes = mod.FS.readFile('/lib/save/' + dotSavSlot);
                                    }

                                    if (existingBytes && existingBytes.length > 0) {
                                        if (!hasTarget) mod.FS.writeFile('/lib/save/' + targetSlot, existingBytes);
                                        if (!hasBase) mod.FS.writeFile('/lib/save/' + baseSlot, existingBytes);
                                        if (!hasDotSav) mod.FS.writeFile('/lib/save/' + dotSavSlot, existingBytes);
                                        console.log('[IDBFS] Reconciled savefile slots for:', targetSlot, baseSlot);
                                    }
                                } catch (aliasErr) {
                                    console.warn('[IDBFS] Savefile alias reconciliation note:', aliasErr);
                                }
                            }
                            mod.removeRunDependency('idbfs_sync_init');
                        });
                    } catch (mountErr) {
                        console.warn('[IDBFS] Mount error, falling back to MEMFS:', mountErr);
                    }
                }
            }
        ]
    };

    try {
        angbandModule = config;
        const mod = await createAngbandModule(config);
        angbandModule = mod;
        if (!angbandModule.onAwaitingInput) {
            angbandModule.onAwaitingInput = config.onAwaitingInput;
        }

        self.postMessage({ type: 'ready', saves: getSaveList() });
    } catch (err) {
        console.error('[Engine Worker Boot Error]', err);
        self.postMessage({ type: 'error', message: 'Failed to boot Wasm engine: ' + err.message });
    }
}

/**
 * Angband3D WebAssembly Engine Worker
 * Runs the compiled C engine in a background Web Worker thread.
 * Synchronizes savefiles with browser IndexedDB (IDBFS) for true offline capability.
 */

/* global importScripts, createAngbandModule */

let angbandModule = null;
let isAwaitingInput = false;
const commandQueue = [];
let currentChar = 'Adventurer';

function getSaveList() {
    if (!angbandModule || !angbandModule.FS) return [];
    try {
        const files = angbandModule.FS.readdir('/lib/save');
        return files.filter(f => f !== '.' && f !== '..');
    } catch (e) {
        return [];
    }
}

self.onmessage = async (e) => {
    const data = e.data;
    if (!data || !data.type) return;

    switch (data.type) {
        case 'init':
            currentChar = data.username || 'Adventurer';
            await startEngine(currentChar, !!data.isNew, data.saveFile);
            break;

        case 'command':
            if (data.cmd) {
                pushCommand(data.cmd);
            }
            break;

        case 'list_saves':
            self.postMessage({ type: 'save_list', saves: getSaveList() });
            break;

        case 'export_save': {
            const name = data.filename || currentChar;
            try {
                if (!angbandModule || !angbandModule.FS) throw new Error('Engine not initialized');
                const fileBytes = angbandModule.FS.readFile('/lib/save/' + name);
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
                if (!angbandModule || !angbandModule.FS) throw new Error('Engine not initialized');
                angbandModule.FS.writeFile('/lib/save/' + name, new Uint8Array(buffer));
                angbandModule.FS.syncfs(false, (err) => {
                    if (err) {
                        self.postMessage({ type: 'error', message: 'Sync error: ' + err.message });
                    } else {
                        self.postMessage({ type: 'save_imported', filename: name, saves: getSaveList() });
                    }
                });
            } catch (err) {
                self.postMessage({ type: 'error', message: 'Failed to import save: ' + err.message });
            }
            break;
        }

        case 'delete_save': {
            const name = data.filename;
            try {
                if (!angbandModule || !angbandModule.FS) throw new Error('Engine not initialized');
                angbandModule.FS.unlink('/lib/save/' + name);
                angbandModule.FS.syncfs(false, () => {
                    self.postMessage({ type: 'save_deleted', filename: name, saves: getSaveList() });
                });
            } catch (err) {
                self.postMessage({ type: 'error', message: 'Failed to delete save: ' + err.message });
            }
            break;
        }
    }
};

function pushCommand(cmd) {
    if (isAwaitingInput && angbandModule && angbandModule.commandResolver) {
        isAwaitingInput = false;
        const resolver = angbandModule.commandResolver;
        angbandModule.commandResolver = null;
        resolver(cmd);
    } else {
        commandQueue.push(cmd);
    }
}

async function startEngine(charName, isNew, saveFile) {
    self.postMessage({ type: 'status', message: 'Loading Angband WebAssembly runtime...' });

    try {
        importScripts('../wasm/angband.js');
    } catch (e) {
        try {
            importScripts('/wasm/angband.js');
        } catch (e2) {
            self.postMessage({ type: 'error', message: 'Could not load wasm/angband.js: ' + e2.message });
            return;
        }
    }

    const args = ['-mbridge', '-u' + charName];
    if (isNew) args.push('-n');

    const config = {
        locateFile: (path) => {
            return '../wasm/' + path;
        },
        print: (text) => {
            const str = (text || '').trim();
            if (!str) return;

            try {
                const msg = JSON.parse(str);
                if (msg.t === 'hello') {
                    self.postMessage({ type: 'hello', msg });
                } else if (msg.t === 'frame') {
                    self.postMessage({ type: 'frame', frame: msg });
                } else if (msg.t === 'bye') {
                    self.postMessage({ type: 'bye', detail: msg.detail });
                } else if (msg.t === 'ok' && msg.detail === 'saved') {
                    if (angbandModule && angbandModule.FS) {
                        angbandModule.FS.syncfs(false, (err) => {
                            if (err) console.error('[IDBFS Sync Error]', err);
                            self.postMessage({ type: 'saved_persisted', filename: charName });
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
                    mod.FS.mkdir('/lib/save');
                } catch (e) {}

                if (mod.IDBFS) {
                    try {
                        mod.FS.mount(mod.IDBFS, { autoPersist: true }, '/lib/save');
                        mod.addRunDependency('idbfs_sync_init');
                        mod.FS.syncfs(true, function (err) {
                            if (err) {
                                console.warn('[IDBFS] Initial sync warning:', err);
                            } else {
                                console.log('[IDBFS] Mounted and loaded /lib/save from IndexedDB');
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
        angbandModule = await createAngbandModule(config);
        angbandModule.onAwaitingInput = () => {
            isAwaitingInput = true;
            if (commandQueue.length > 0) {
                const nextCmd = commandQueue.shift();
                isAwaitingInput = false;
                const resolver = angbandModule.commandResolver;
                angbandModule.commandResolver = null;
                if (resolver) resolver(nextCmd);
            }
        };

        self.postMessage({ type: 'ready', saves: getSaveList() });
    } catch (err) {
        console.error('[Engine Worker Boot Error]', err);
        self.postMessage({ type: 'error', message: 'Failed to boot Wasm engine: ' + err.message });
    }
}

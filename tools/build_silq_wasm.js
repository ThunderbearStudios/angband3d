#!/usr/bin/env node
/**
 * tools/build_silq_wasm.js
 *
 * Compiles Sil-Q 1.5.1 (C99 + Headless JSON Bridge) into lazy-loadable Emscripten WASM
 * under server/public/wasm/silq.{js,wasm,data} behind YASD_FLAGS.SILQ_WASM_LOCAL.
 * Stages only runtime /lib/edit + /lib/pref (+ empty save/data/apex/user dirs) to keep
 * silq.data compact (<120 KB .br).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SILQ_DIR = path.join(ROOT, 'variants', 'silq-src');
const SRC_DIR = path.join(SILQ_DIR, 'src');
const LIB_DIR = path.join(SILQ_DIR, 'lib');
const OUT_DIR = path.join(ROOT, 'server', 'public', 'wasm');

function findEmcc() {
    const candidates = ['emcc'];
    if (process.platform === 'win32') {
        candidates.unshift('C:\\emsdk\\upstream\\emscripten\\emcc.exe');
        candidates.push('C:\\emsdk\\upstream\\emscripten\\emcc.bat');
    } else if (fs.existsSync('/opt/emsdk/upstream/emscripten/emcc')) {
        candidates.unshift('/opt/emsdk/upstream/emscripten/emcc');
    }
    for (const cmd of candidates) {
        try {
            if (path.isAbsolute(cmd) && !fs.existsSync(cmd)) continue;
            execFileSync(cmd, ['--version'], { stdio: 'pipe' });
            return cmd;
        } catch (_) {}
    }
    throw new Error('emcc not found on PATH or C:\\emsdk');
}

function copyDirRecursive(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, ent.name);
        const d = path.join(dst, ent.name);
        if (ent.isDirectory()) copyDirRecursive(s, d);
        else if (ent.isFile()) fs.copyFileSync(s, d);
    }
}

const C_FILES = [
    'z-form.c', 'z-rand.c', 'z-term.c', 'z-util.c', 'z-virt.c',
    'birth.c', 'cave.c', 'cmd1.c', 'cmd2.c', 'cmd3.c', 'cmd4.c', 'cmd5.c', 'cmd6.c',
    'dungeon.c', 'files.c', 'generate.c', 'init1.c', 'init2.c', 'load.c',
    'melee1.c', 'melee2.c', 'monster1.c', 'monster2.c', 'obj-info.c',
    'object1.c', 'object2.c', 'randart.c', 'save.c', 'spells1.c', 'spells2.c',
    'squelch.c', 'tables.c', 'use-obj.c', 'util.c', 'variable.c',
    'wizard1.c', 'wizard2.c', 'xtra1.c', 'xtra2.c',
    'main.c', 'main-bridge.c', 'bridge-json.c'
];

function main() {
    const emcc = findEmcc();
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'silq-wasm-'));
    const stageLib = path.join(stageRoot, 'lib');
    try {
        for (const sub of ['edit', 'pref']) {
            const subPath = path.join(LIB_DIR, sub);
            if (fs.existsSync(subPath)) copyDirRecursive(subPath, path.join(stageLib, sub));
        }
        for (const emptySub of ['apex', 'bone', 'data', 'help', 'info', 'save', 'script', 'user', 'xtra']) {
            fs.mkdirSync(path.join(stageLib, emptySub), { recursive: true });
        }

        const outJs = path.join(OUT_DIR, 'silq.js');
        const args = [
            '-O2',
            '-std=gnu99',
            '-Wno-everything',
            `-I${SRC_DIR}`,
            '-DUSE_BRIDGE',
            '-DHAVE_MKSTEMP',
            '-DDEFAULT_PATH="/lib/"',
            '-DVERSION_MAJOR=1',
            '-DVERSION_MINOR=5',
            '-DVERSION_PATCH=1',
            '-DVERSION_EXTRA=0',
            '-DVERSION_STRING="1.5.1-wasm"',
            ...C_FILES.map((f) => path.join(SRC_DIR, f)),
            '-s', 'ASYNCIFY=1',
            '-s', 'ASYNCIFY_STACK_SIZE=65536',
            '-s', 'MODULARIZE=1',
            '-s', 'EXPORT_NAME=createSilqModule',
            '-s', 'EXPORTED_RUNTIME_METHODS=["FS","IDBFS","stringToUTF8"]',
            '-lidbfs.js',
            '-s', 'ALLOW_MEMORY_GROWTH=1',
            '-s', 'INITIAL_MEMORY=33554432',
            '-s', 'EXIT_RUNTIME=0',
            '-s', 'ENVIRONMENT=web,worker,node',
            '--preload-file', `${stageLib}@/lib`,
            '-o', outJs
        ];

        console.log('[build_silq_wasm] Compiling 42 C translation units via emcc...');
        execFileSync(emcc, args, { stdio: 'inherit', cwd: ROOT });

        for (const f of ['silq.js', 'silq.wasm', 'silq.data']) {
            const p = path.join(OUT_DIR, f);
            if (!fs.existsSync(p)) throw new Error(`Expected output missing: ${f}`);
            console.log(`  ✓ ${f}: ${(fs.statSync(p).size / 1024).toFixed(1)} KB`);
        }
    } finally {
        try { fs.rmSync(stageRoot, { recursive: true, force: true }); } catch (_) {}
    }
}

main();

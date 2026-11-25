#!/usr/bin/env node
/**
 * tools/test_wave2c1_audio_boot.js
 * Fast-tier verification for Wave 2C-1:
 *  - AudioDirector 3D HRTF updateListener + lazy per-cue SFX synthesis proxy
 *  - Opus .ogg music catalog & zero remaining .mp3 music files
 *  - ChronicleAudioRouter Edge toggle for narrator, CJK sentence splitting, prewarm abort/cooldown, HTML5 speed
 *  - Server.js narrator engine toggle + Gemini rate pacing/cache keys
 *  - Boot split (boot.min.js / game.min.js / engine3d.min.js / demo.min.js), worker minification & warm reuse
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'server', 'public');

function readText(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// 1. AudioDirector + SoundEngine lazy SFX Proxy & 3D HRTF Panner
console.log('[wave2c1] Checking AudioDirector + SoundEngine lazy SFX & 3D HRTF...');
const AudioDirector = require(path.join(PUB, 'js', 'audio-director.js'));
assert.strictEqual(typeof AudioDirector.updateListener, 'function', 'AudioDirector.updateListener must exist');
assert(Array.isArray(AudioDirector.SFX_KEYS) && AudioDirector.SFX_KEYS.length >= 48, 'SFX_KEYS must list all cues');

// Modern AudioListener mock
const modernVals = {};
const modernCtx = {
    currentTime: 1.25,
    listener: {
        positionX: { setValueAtTime: (v) => { modernVals.px = v; } },
        positionY: { setValueAtTime: (v) => { modernVals.py = v; } },
        positionZ: { setValueAtTime: (v) => { modernVals.pz = v; } },
        forwardX: { setValueAtTime: (v) => { modernVals.fx = v; } },
        forwardY: { setValueAtTime: (v) => { modernVals.fy = v; } },
        forwardZ: { setValueAtTime: (v) => { modernVals.fz = v; } },
        upX: { setValueAtTime: (v) => { modernVals.ux = v; } },
        upY: { setValueAtTime: (v) => { modernVals.uy = v; } },
        upZ: { setValueAtTime: (v) => { modernVals.uz = v; } }
    }
};
AudioDirector.updateListener(modernCtx, { x: 4, y: 1.7, z: -8 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 });
assert.deepStrictEqual(modernVals, { px: 4, py: 1.7, pz: -8, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0 });

// Legacy AudioListener mock
let legacyPos = null;
let legacyOri = null;
AudioDirector.updateListener({
    currentTime: 0,
    listener: {
        setPosition: (x, y, z) => { legacyPos = [x, y, z]; },
        setOrientation: (fx, fy, fz, ux, uy, uz) => { legacyOri = [fx, fy, fz, ux, uy, uz]; }
    }
}, { x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
assert.deepStrictEqual(legacyPos, [1, 2, 3]);
assert.deepStrictEqual(legacyOri, [0, 0, -1, 0, 1, 0]);

// Instantiate SoundEngine in sandbox
const fakeBuf = { duration: 0.1, getChannelData: () => new Float32Array(256) };
function makeAudioSandbox(hrtfFlag = true) {
    const sb = {
        window: { YASD_FLAGS: { AUDIO_HRTF_3D: hrtfFlag }, addEventListener: () => {}, removeEventListener: () => {}, localStorage: { getItem: () => null, setItem: () => {} } },
        document: { getElementById: () => null },
        Audio: function () { return { addEventListener: () => {}, preload: 'none', volume: 0 }; },
        AudioDirector,
        console,
        performance,
        Math,
        Float32Array,
        Set,
        Map,
        Object,
        Array,
        Reflect,
        Proxy,
        Number,
        String,
        Boolean,
        setTimeout,
        clearTimeout,
        setInterval: () => 0,
        clearInterval: () => {}
    };
    vm.createContext(sb);
    vm.runInContext(readText('server/public/js/audio.js') + '\nthis.SoundEngine = SoundEngine;', sb);
    const se = new sb.SoundEngine();
    se.ctx = {
        currentTime: 0,
        sampleRate: 44100,
        state: 'running',
        createBuffer: () => fakeBuf,
        createPanner: () => ({
            positionX: { setValueAtTime: () => {} },
            positionY: { setValueAtTime: () => {} },
            positionZ: { setValueAtTime: () => {} },
            connect: () => {}
        }),
        createStereoPanner: () => ({ pan: { setValueAtTime: (v) => { sb._lastStereoPan = v; } }, connect: () => {} }),
        createBiquadFilter: () => ({ frequency: { setValueAtTime: () => {} }, Q: { setValueAtTime: () => {} }, connect: () => {} })
    };
    se.unlocked = true;
    return { se, sb };
}

const { se: seLazy } = makeAudioSandbox(true);
assert.strictEqual(Object.keys(seLazy._rawBuffers).length, 0, 'Cold boot must synthesize 0 SFX buffers');
const hitBuf = seLazy.buffers.hit;
assert(hitBuf, 'Lazy access must synthesize hit buffer');
assert.strictEqual(Object.keys(seLazy._rawBuffers).length, 1, 'Accessing one buffer key must synthesize ONLY 1 cue');

const p3d = seLazy.createPanner({ worldSpace: true, x: 4, y: 1, z: -2, pan: 0.6, hasLos: false });
assert(p3d && p3d.panningModel === 'HRTF', 'AUDIO_HRTF_3D=true must produce HRTF PannerNode');
assert(p3d._filter && p3d._occluded === true, 'Occluded 3D panner must attach 900Hz lowpass filter');

const { se: seStereo, sb: sbStereo } = makeAudioSandbox(false);
const p2d = seStereo.createPanner({ worldSpace: true, x: 4, y: 1, z: -2, pan: 0.6, hasLos: false });
assert(p2d && !p2d.panningModel, 'AUDIO_HRTF_3D=false must fall back to StereoPannerNode');
assert.strictEqual(sbStereo._lastStereoPan, 0.6, 'Stereo fallback must use normalized pan, not world x');

// 2. Opus .ogg Music Catalog & Asset Verification
console.log('[wave2c1] Checking Opus .ogg music catalog & audio directory...');
const audioDir = path.join(PUB, 'assets', 'audio');
const walkFiles = (dir, out = []) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walkFiles(p, out);
        else if (ent.isFile()) out.push(p);
    }
    return out;
};
const allAudioFiles = walkFiles(audioDir);
const mp3Left = allAudioFiles.filter((f) => f.toLowerCase().endsWith('.mp3'));
assert.strictEqual(mp3Left.length, 0, `Expected 0 .mp3 files under assets/audio, found: ${mp3Left.join(', ')}`);

const catalog = seLazy.getMusicCatalog();
assert(catalog.length >= 55, 'Expected full music catalog');
const musicFilesSet = new Set();
for (const tr of catalog) {
    assert(tr.src.endsWith('.ogg'), `Catalog track must use .ogg: ${tr.id} -> ${tr.src}`);
    const diskPath = path.join(PUB, tr.src.replace(/^\//, ''));
    assert(fs.existsSync(diskPath), `Missing .ogg track on disk: ${tr.src}`);
    const hdr = Buffer.alloc(4);
    const fd = fs.openSync(diskPath, 'r');
    fs.readSync(fd, hdr, 0, 4, 0);
    fs.closeSync(fd);
    assert.strictEqual(hdr.toString('ascii'), 'OggS', `Invalid OggS header in ${tr.src}`);
    musicFilesSet.add(diskPath);
}
const totalMusicBytes = Array.from(musicFilesSet).reduce((s, p) => s + fs.statSync(p).size, 0);
assert(totalMusicBytes < 85 * 1024 * 1024, `Total music bytes should be <85 MB, got ${(totalMusicBytes / (1024 * 1024)).toFixed(2)} MB`);

const html = readText('server/public/index.html');
assert(!html.includes('yasd_theme.mp3') && html.includes('/assets/audio/yasd_theme.ogg'), 'index.html theme decks must reference .ogg');
const swJs = readText('server/public/sw.js');
assert(swJs.includes("'/assets/audio/music/'") && swJs.includes("'/assets/audio/yasd_theme.ogg'"), 'sw.js must bypass streaming OGG music while keeping sfx cached');

// 3. ChronicleAudioRouter & Server.js TTS fixes
console.log('[wave2c1] Checking ChronicleAudioRouter & server.js TTS routing...');
const caSb = {
    window: { addEventListener: () => {}, localStorage: { getItem: () => null, setItem: () => {} } },
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: {},
    fetch: () => Promise.reject(new Error('network disabled in unit test')),
    AbortController,
    URLSearchParams,
    Map,
    Set,
    Date,
    Math,
    console,
    setTimeout,
    clearTimeout
};
vm.createContext(caSb);
vm.runInContext(readText('server/public/js/chronicle/chronicle-audio.js') + '\nthis.ChronicleAudioRouter = ChronicleAudioRouter;', caSb);
const router = new caSb.ChronicleAudioRouter();
router.ttsEngine = 'edge';
const kEdge = router.getAudioCacheKey('Hello world.', 'narrator');
assert(kEdge.startsWith('rp2:edge:'), `Narrator cache key must honor edge engine, got: ${kEdge}`);
router.ttsEngine = 'gemini';
const kGem = router.getAudioCacheKey('Hello world.', 'narrator');
assert(kGem.startsWith('rp2:gemini:'), `Narrator cache key must support gemini engine, got: ${kGem}`);

const caSrc = readText('server/public/js/chronicle/chronicle-audio.js');
assert(caSrc.includes('[.!?。！？]+'), 'chronicle-audio.js must split CJK 。！？ sentence punctuation');
assert(caSrc.includes('this._abortAllPrewarms()'), 'chronicle-audio.js must abort active prewarms on mute/stop');
assert(caSrc.includes('audio.playbackRate = Math.max(0.5, Math.min(2.5, this.speed || 1.0))'), 'chronicle-audio.js HTML5 fallback must apply speed');

const srvSrc = readText('server/src/server.js');
assert(!srvSrc.includes("const requestedEngine = isNarrator ? 'gemini'"), 'server.js must not force gemini when client explicitly asks for edge narrator');
assert(srvSrc.includes('rate = \'\'') && srvSrc.includes('${reqRate || \'+0%\'}'), 'server.js synthesizeGeminiTTS & cache keys must include reqRate');

// 4. Boot split, Worker minification & Warm Worker reuse
console.log('[wave2c1] Checking Splash boot split & worker bundle...');
const bootMinPath = path.join(PUB, 'dist', 'boot.min.js');
const gameMinPath = path.join(PUB, 'dist', 'game.min.js');
const engine3dMinPath = path.join(PUB, 'dist', 'engine3d.min.js');
const demoMinPath = path.join(PUB, 'dist', 'demo.min.js');
for (const p of [bootMinPath, gameMinPath, engine3dMinPath, demoMinPath]) {
    assert(fs.existsSync(p), `Missing dist bundle: ${path.basename(p)}`);
    execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
}
const bootCode = fs.readFileSync(bootMinPath, 'utf8');
assert(!bootCode.includes('GLTFLoader') && !bootCode.includes('DemoPlayer'), 'boot.min.js must stay lean (no Three loaders or DemoPlayer)');
const gameCode = fs.readFileSync(gameMinPath, 'utf8');
assert(!gameCode.includes('DemoPlayer'), 'game.min.js must not include lazy DemoPlayer');
if (fs.existsSync(bootMinPath + '.br') && fs.existsSync(gameMinPath + '.br')) {
    const bootBrKb = fs.statSync(bootMinPath + '.br').size / 1024;
    const gameBrKb = fs.statSync(gameMinPath + '.br').size / 1024;
    const initialBrKb = bootBrKb + gameBrKb;
    console.log(`  boot.min.js.br=${bootBrKb.toFixed(1)} KB, game.min.js.br=${gameBrKb.toFixed(1)} KB (sum=${initialBrKb.toFixed(1)} KB)`);
    assert(bootBrKb < 35, `Splash boot.min.js.br must be <35 KB, got ${bootBrKb.toFixed(1)} KB`);
    assert(initialBrKb < 280, `Initial Brotli JS payload (boot+game) must be <280 KB, got ${initialBrKb.toFixed(1)} KB`);
}

const workerBundlePath = path.join(PUB, 'js', 'cartridges-worker-bundle.js');
execFileSync(process.execPath, ['--check', workerBundlePath], { stdio: 'pipe' });
const wbKb = fs.statSync(workerBundlePath).size / 1024;
console.log(`  cartridges-worker-bundle.js = ${wbKb.toFixed(1)} KB`);
assert(wbKb < 500, `Expected minified cartridges-worker-bundle.js <500 KB (raw ~714 KB), got ${wbKb.toFixed(1)} KB`);

// LocalGameBridge warm worker reuse & 10s watchdog check
const lbSrc = readText('server/public/js/local_bridge.js');
assert(lbSrc.includes('consumeWarmWorker') && lbSrc.includes('10000'), 'local_bridge.js must expose consumeWarmWorker and 10000ms watchdog');
const { LocalGameBridge } = require(path.join(PUB, 'js', 'local_bridge.js'));
assert.strictEqual(typeof LocalGameBridge.consumeWarmWorker, 'function', 'LocalGameBridge.consumeWarmWorker must be exported');

console.log('✓ Wave 2C-1 audio, Opus, narrator & boot-split tests PASSED!');

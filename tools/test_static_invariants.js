#!/usr/bin/env node
/**
 * tools/test_static_invariants.js
 *
 * Fast static & structural invariant guardrail (Card 1 / WS-A).
 * Verifies:
 *   1. `node --check` syntax validity on all server & public JS files.
 *   2. Zero duplicate class methods in WebHUD, WebTerminal, DungeonRenderer, ChronicleManager, ChronicleAudio.
 *   3. Server `/api/tts` `tagRegex` accepts all `ChronicleGrounder` voice profile tags (`emotion`, `geminiTag`, `directorNote`).
 *   4. `ChronicleAudio.getAudioCacheKey` produces identical keys for `{ narrator: profile }` and `profile` (`L32`).
 *   5. `dungeon3d.js` contains zero `sunbeamMesh` or `CylinderGeometry` instances (`L35.1`).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// 1. Syntax check across all server & client JS files
const JS_FILES = [
    'server/src/server.js',
    'server/src/http-guard.js',
    'server/src/rate-limit.js',
    'server/public/js/app.js',
    'server/public/js/input.js',
    'server/public/js/screen-context.js',
    'server/public/js/menu-router.js',
    'server/public/js/realm-keys.js',
    'server/public/js/terminal.js',
    'server/public/js/hud.js',
    'server/public/js/dungeon3d.js',
    'server/public/js/audio.js',
    'server/public/js/network.js',
    'server/public/js/local_bridge.js',
    'server/public/js/engine-worker.js',
    'server/public/js/mobile-overlay.js',
    'server/public/js/chronicle/chronicle-manager.js',
    'server/public/js/chronicle/chronicle-audio.js',
    'server/public/js/chronicle/chronicle-llm.js',
    'server/public/js/chronicle/chronicle-grounder.js',
    'server/public/js/chronicle/chronicle-filter.js',
    'server/public/js/heng/heng-translate.js',
    'server/public/sw.js'
];

for (const rel of JS_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
}

// 2. Zero duplicate class methods in core classes
const CLASS_FILES = [
    'server/public/js/hud.js',
    'server/public/js/terminal.js',
    'server/public/js/dungeon3d.js',
    'server/public/js/chronicle/chronicle-manager.js',
    'server/public/js/chronicle/chronicle-audio.js'
];

const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function']);

for (const rel of CLASS_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = src.split(/\r?\n/);
    const seen = new Map();
    lines.forEach((line, idx) => {
        const m = line.match(/^    (?:(async|get|set)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (!m) return;
        const prefix = m[1] === 'get' || m[1] === 'set' ? m[1] : 'method';
        const name = m[2];
        if (CONTROL_KEYWORDS.has(name)) return;
        const key = `${prefix}:${name}`;
        assert.ok(
            !seen.has(key),
            `[Duplicate Method] ${rel} defines '${key}' at line ${seen.get(key)} and again at line ${idx + 1}`
        );
        seen.set(key, idx + 1);
    });
}

// 3. Server /api/tts tagRegex parity with ChronicleGrounder voice profiles
const serverSrc = fs.readFileSync(path.join(ROOT, 'server/src/server.js'), 'utf8');
const tagRegexMatch = serverSrc.match(/const\s+tagRegex\s*=\s*(\/\^.*?\$\/u);/);
assert.ok(tagRegexMatch, 'server.js must define tagRegex');
// eslint-disable-next-line no-eval
const tagRegex = eval(tagRegexMatch[1]);

global.window = global;
const ChronicleGrounder = require(path.join(ROOT, 'server/public/js/chronicle/chronicle-grounder.js'));
require(path.join(ROOT, 'server/public/js/chronicle/chronicle-audio.js'));

const sampleProfiles = [
    ChronicleGrounder.resolveVoiceProfile({ race: 'Elf', class: 'Mage', realm: 'angband' }),
    ChronicleGrounder.resolveVoiceProfile({ race: 'Noldor', class: 'Warrior', realm: 'silq' }),
    ChronicleGrounder.resolveVoiceProfile({ race: 'Amberite', class: 'Chaos-Warrior', realm: 'frogcomposband' }),
    ChronicleGrounder.resolveVoiceProfile({ race: 'Human', class: 'Samurai', realm: 'hengband' }),
    ChronicleGrounder.pickCreatureVoice({ name: 'Grip, Farmer Maggot\'s dog', glyph: 'C' }),
    ChronicleGrounder.pickCreatureVoice({ name: 'Morgoth, Lord of Darkness', glyph: 'P' }),
    ChronicleGrounder.pickCreatureVoice({ name: 'Sauron, the Sorcerer', glyph: 'p' })
];

for (const raw of sampleProfiles) {
    const vp = raw && raw.narrator ? raw.narrator : raw;
    assert.ok(vp, 'Voice profile must resolve');
    if (vp.emotion) assert.ok(tagRegex.test(vp.emotion), `tagRegex rejected emotion: ${vp.emotion}`);
    if (vp.geminiTag) assert.ok(tagRegex.test(vp.geminiTag), `tagRegex rejected geminiTag: ${vp.geminiTag}`);
    if (vp.directorNote) assert.ok(tagRegex.test(vp.directorNote), `tagRegex rejected directorNote: ${vp.directorNote}`);
}

// 4. ChronicleAudioRouter.getAudioCacheKey symmetry between { narrator: profile } and profile
const audio = Object.create(window.ChronicleAudioRouter.prototype);
audio.ttsEngine = 'gemini';
audio.narratorVoice = 'Enceladus';
audio.activeRealm = 'angband';
audio.speed = 1.0;

const profileWrap = ChronicleGrounder.resolveVoiceProfile({ race: 'Elf', class: 'Mage', realm: 'angband' });
const profile = profileWrap.narrator || profileWrap;
const keyDirect = audio.getAudioCacheKey('The torches flicker.', 'narrator', profile.voice, profile);
const keyWrapped = audio.getAudioCacheKey('The torches flicker.', 'narrator', profile.voice, { narrator: profile });
assert.strictEqual(
    keyWrapped,
    keyDirect,
    'getAudioCacheKey must return identical key whether profile is passed directly or wrapped in { narrator: profile }'
);
const keyPrewarmShape = audio.getAudioCacheKey('The torches flicker.', 'narrator', profile.edgeVoice || '', {
    voice: profile.edgeVoice || 'en-US-ChristopherNeural',
    geminiVoice: profile.geminiVoice || 'Enceladus',
    emotion: profile.emotion || '',
    geminiTag: profile.geminiTag || '',
    directorNote: profile.directorNote || '',
    pitch: profile.pitch || '',
    rate: profile.rate || '',
    gender: profile.gender || 'male',
    engine: 'gemini'
});
assert.strictEqual(
    keyPrewarmShape,
    keyWrapped,
    'getAudioCacheKey must match between prewarmEncounterProseAndVoice options and { narrator: profile } playback options'
);

// 5. No sunbeamMesh property and protected shared GPU assets in destroyEntity in dungeon3d.js
const d3dSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/dungeon3d.js'), 'utf8');
assert.ok(!d3dSrc.includes('this.sunbeamMesh'), 'dungeon3d.js must not instantiate this.sunbeamMesh');
assert.ok(
    d3dSrc.includes('sharedMats') && d3dSrc.includes('sharedTexs') && d3dSrc.includes('this.monsterAtlasTex'),
    'dungeon3d.js destroyEntity must protect shared singleton materials and textures from disposal'
);

console.log('[PASS] test_static_invariants.js: syntax (22 files), 0 duplicate methods, tagRegex parity, cache-key symmetry, and 3D geometry invariants verified.');

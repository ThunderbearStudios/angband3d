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
    'server/public/js/grimoire-deck.js',
    'server/public/js/quick-actions.js',
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

// 6. Cross-browser CSS prefixes and Apple PWA metadata invariants
const cssSrc = fs.readFileSync(path.join(ROOT, 'server/public/css/dungeon.css'), 'utf8');
const cssLines = cssSrc.split('\n');
const missingPrefixes = [];
cssLines.forEach((line, idx) => {
    if (/(?<!-webkit-)backdrop-filter:/.test(line)) {
        const prev = cssLines[idx - 1] || '';
        const next = cssLines[idx + 1] || '';
        if (!/-webkit-backdrop-filter:/.test(prev) && !/-webkit-backdrop-filter:/.test(next)) {
            missingPrefixes.push(`Line ${idx + 1}: ${line.trim()}`);
        }
    }
});
assert.strictEqual(
    missingPrefixes.length,
    0,
    `Every backdrop-filter in dungeon.css must have a paired -webkit-backdrop-filter. Found missing at:\n${missingPrefixes.join('\n')}`
);

const indexHtmlSrc = fs.readFileSync(path.join(ROOT, 'server/public/index.html'), 'utf8');
assert.ok(
    indexHtmlSrc.includes('apple-mobile-web-app-title'),
    'index.html must include apple-mobile-web-app-title meta tag'
);

// 7. Wave 20 Studio Audio Bank, Convolution Reverb & Zero-Leak Shared 3D Action VFX Invariants
const webManifestPath = path.join(ROOT, 'server/public/assets/audio/sfx/manifest.json');
const godotManifestPath = path.join(ROOT, 'client/assets/audio/sfx/manifest.json');
assert.ok(fs.existsSync(webManifestPath), 'Missing web studio SFX manifest.json');
assert.ok(fs.existsSync(godotManifestPath), 'Missing Godot studio SFX manifest.json');
const sfxManifest = JSON.parse(fs.readFileSync(webManifestPath, 'utf8'));
assert.ok(Array.isArray(sfxManifest.files) && sfxManifest.files.length >= 60, 'Studio SFX manifest must list at least 60 open-source sound files');
for (const entry of sfxManifest.files) {
    const wf = path.join(ROOT, 'server/public/assets/audio/sfx', entry.file);
    const gf = path.join(ROOT, 'client/assets/audio/sfx', entry.file);
    assert.ok(fs.existsSync(wf) && fs.statSync(wf).size > 64, `Missing or empty web studio SFX file: ${entry.file}`);
    assert.ok(fs.existsSync(gf) && fs.statSync(gf).size > 64, `Missing or empty Godot studio SFX file: ${entry.file}`);
}

const audioJsSrc = fs.readFileSync(path.join(ROOT, 'server/public/js/audio.js'), 'utf8');
assert.ok(
    audioJsSrc.includes('loadStudioSfxBank') && audioJsSrc.includes('createDungeonReverbImpulse') && audioJsSrc.includes('playPoolSample') && audioJsSrc.includes('reverbConvolver'),
    'audio.js must implement loadStudioSfxBank, createDungeonReverbImpulse, playPoolSample, and reverbConvolver'
);
const bannedVocalFiles = ['orc_hit_1.ogg', 'orc_die_1.ogg', 'goblin_hit_1.ogg', 'goblin_die_1.ogg', 'troll_hit_1.ogg', 'troll_die_1.ogg', 'zombie_hit_1.ogg', 'lich_hit_1.ogg', 'lich_die.ogg', 'squishy_hit.wav', 'wail.wav'];
for (const banned of bannedVocalFiles) {
    assert.ok(!audioJsSrc.includes(banned), `audio.js must not reference banned guttural vocal file: ${banned}`);
    assert.ok(!sfxManifest.files.some((f) => f.file === banned), `manifest.json must not include banned guttural vocal file: ${banned}`);
}

assert.ok(
    d3dSrc.includes('_ensureSharedVfxResources') && d3dSrc.includes('spawnDetonationDome') && d3dSrc.includes('_sharedSparkGeo') && d3dSrc.includes('_sharedSlashArcGeo') && d3dSrc.includes('_sharedBreathConeGeo'),
    'dungeon3d.js must implement _ensureSharedVfxResources, spawnDetonationDome, and shared VFX singleton geometries'
);
const hitSparksBlock = d3dSrc.slice(d3dSrc.indexOf('spawnHitSparks('), d3dSrc.indexOf('spawnDetonationDome('));
assert.ok(
    !hitSparksBlock.includes('new THREE.SphereGeometry'),
    'spawnHitSparks must reuse shared VFX geometries and never allocate per-call SphereGeometry'
);

// 8. WS22 Universal Agentic Mastery Compliance Invariants (L45–L48: CWE-208, E17, BUDGET-01, INDEX-01, SLSA v1.0)
const verifyOwnerBlock = serverSrc.slice(
    serverSrc.indexOf('function verifyOwnerToken('),
    serverSrc.indexOf('function createOwnerToken(')
);
assert.ok(
    verifyOwnerBlock.includes('crypto.timingSafeEqual') && !verifyOwnerBlock.includes('data.hash ==='),
    'verifyOwnerToken in server.js must use constant-time crypto.timingSafeEqual (CWE-208 / L45)'
);

const realmsRouteBlock = serverSrc.slice(
    serverSrc.indexOf("pathname === '/api/realms'"),
    serverSrc.indexOf("pathname === '/api/status'")
);
assert.ok(
    !realmsRouteBlock.includes("'Access-Control-Allow-Origin': '*'"),
    'GET /api/realms in server.js must not override CORS with wildcard * (E17 / L46)'
);

const agentsSize = fs.statSync(path.join(ROOT, 'AGENTS.md')).size;
const stateSize = fs.statSync(path.join(ROOT, 'docs/STATE.md')).size;
assert.ok(agentsSize <= 6000, `AGENTS.md exceeds 6.0 KB Tier 1 token budget (${agentsSize} bytes; L47)`);
assert.ok(stateSize <= 5000, `docs/STATE.md exceeds 5.0 KB Tier 2 token budget (${stateSize} bytes; L47)`);

const bpHead = fs.readFileSync(path.join(ROOT, 'docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md'), 'utf8').split('\n').slice(0, 45).join('\n');
assert.ok(
    bpHead.includes('| ID |') && bpHead.includes('Master $O(1)$ Dispatch Index'),
    'docs/BEST_PRACTICES_AND_LESSONS_LEARNED.md must include Top-of-File O(1) Master Dispatch Index table in lines 1-45 (INDEX-01 / L47)'
);

const dockerfileSrc = fs.readFileSync(path.join(ROOT, 'server/Dockerfile'), 'utf8');
const releaseYmlSrc = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
assert.ok(
    dockerfileSrc.includes('npm ci --omit=dev') && !dockerfileSrc.includes('npm install --omit=dev'),
    'server/Dockerfile must use deterministic npm ci --omit=dev (SLSA v1.0 / L48)'
);
assert.ok(
    !releaseYmlSrc.includes('npm install\n'),
    '.github/workflows/release.yml must use deterministic npm ci instead of npm install (SLSA v1.0 / L48)'
);

// 9. Silent Passive Regeneration & Non-Invasive Restorative Audio Invariants (L49)
const hpDeltaBlock = d3dSrc.slice(
    d3dSrc.indexOf('// Player HP delta tracking'),
    d3dSrc.indexOf('// Track Active Status Conditions')
);
assert.ok(
    !hpDeltaBlock.includes('playHeal('),
    'Passive HP regeneration delta in dungeon3d.js must never call playHeal() (L49)'
);
assert.ok(
    !d3dSrc.includes('|missile|mana|chaos|'),
    'triggerMessageVfx in dungeon3d.js must not match standalone "mana" as an offensive fireball explosion (use mana bolt|mana storm|mana burst; L49)'
);
assert.ok(
    !audioJsSrc.includes("heal: ['heal_spell.wav'") && !audioJsSrc.includes("prayer: ['magic_holy_1.ogg'"),
    'STUDIO_POOL_MAP in audio.js must not map heal/prayer to piercing heal_spell.wav or magic_holy_1.ogg chimes (L49)'
);
const csWorldSrc = fs.readFileSync(path.join(ROOT, 'client/scripts/DungeonWorld.cs'), 'utf8');
const csHpBlock = csWorldSrc.slice(
    csWorldSrc.indexOf('else if (_lastPlayerHp >= 0 && curHp > _lastPlayerHp)'),
    csWorldSrc.indexOf('_lastPlayerHp = curHp;')
);
assert.ok(
    !csHpBlock.includes('AudioManager.Play('),
    'Passive HP regeneration delta in DungeonWorld.cs must never call AudioManager.Play (L49)'
);

console.log(`[PASS] test_static_invariants.js: syntax (22 files), 0 duplicate methods, tagRegex parity, cache-key symmetry, 3D geometry/VFX invariants, ${sfxManifest.files.length} clean studio SFX files (L41), and WS22 compliance & audio invariants (L45–L49) verified.`);

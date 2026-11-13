/**
 * Angband3D Cloud Server Daemon
 *
 * Provides:
 *  1. WebSocket bridge relay (/ws) spawning isolated headless Angband C engine instances
 *  2. REST API for cross-platform save game management (/api/saves)
 *  3. Static file delivery for Godot Web export (/) and standalone zip packages (/download/angband3d-standalone.zip)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const zlib = require('zlib');
const crypto = require('crypto');
const { guardMutation } = require('./http-guard');
const { createLimiter, createVaultSyncLimiter, clientIp, DEFAULT_MAX_WS_PER_IP } = require('./rate-limit');
const { createSaveVaultService } = require('./save-vault-routes');
const { generateChronicleSketch } = require('./sketch-service');
const {
    PRIMARY_DOMAIN,
    LEGACY_DOMAINS,
    LEGACY_DOMAIN_MODE,
    VALID_REALMS,
    VALID_MAGICS,
    MAGIC_TO_REALM,
    FLOOR_SIDECAR_RE,
    isValidRealm,
    detectRealmFromMagic,
    getRealmShortTag,
    buildDefaultSaveSlotName,
    enrichSaveMetadata,
    handleLegacyDomainRedirect,
    listFloorSidecarsAsync,
    snapshotLivingSave,
    snapshotLivingSaveAsync,
    restoreLivingCheckpoint
} = require('./domain-config');
if (!globalThis.crypto) globalThis.crypto = crypto;

const llmLimiter = createLimiter({ perMinute: +process.env.LLM_RPM || 20, perDay: +process.env.LLM_RPD || 500 });
const ttsLimiter = createLimiter({ perMinute: +process.env.TTS_RPM || 30, perDay: +process.env.TTS_RPD || 500 });
const sketchLimiter = createLimiter({ perMinute: +process.env.SKETCH_RPM || 15, perDay: +process.env.SKETCH_RPD || 120 });
const uploadLimiter = createLimiter({ perMinute: +process.env.UPLOAD_RPM || 20, perDay: +process.env.UPLOAD_RPD || 200 });
const vaultSyncLimiter = createVaultSyncLimiter({ perMinute: +process.env.SYNC_RPM || 60, perDay: +process.env.SYNC_RPD || 5000 });
const globalLlmLimiter = createLimiter({ perMinute: +process.env.GLOBAL_LLM_RPM || 120, perDay: +process.env.GLOBAL_LLM_RPD || 2500 });
const globalTtsLimiter = createLimiter({ perMinute: +process.env.GLOBAL_TTS_RPM || 240, perDay: +process.env.GLOBAL_TTS_RPD || 5000 });
const globalSketchLimiter = createLimiter({ perMinute: +process.env.GLOBAL_SKETCH_RPM || 60, perDay: +process.env.GLOBAL_SKETCH_RPD || 800 });

const ALLOWED_MODELS = [
    'gemini-4-argon',
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-transcribe',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
];

let MsEdgeTTS, OUTPUT_FORMAT;
try {
    const ttsModule = require('msedge-tts');
    MsEdgeTTS = ttsModule.MsEdgeTTS;
    OUTPUT_FORMAT = ttsModule.OUTPUT_FORMAT;
} catch (e) {
    console.warn('[TTS] msedge-tts module not found, server-side neural TTS disabled:', e.message);
}

// Active session registry for telemetry, leak prevention, and graceful shutdown
const activeSessions = new Map();

let saveVault = null;
function invalidateSavesCache(realm, slotName) {
    if (saveVault) saveVault.invalidateSavesCache(realm, slotName);
}

// In-Memory Neural TTS Audio Cache (LRU up to 250 items or 48MB)
const ttsAudioCache = new Map();
const MAX_TTS_CACHE_ITEMS = 250;
let ttsAudioCacheBytes = 0;
const MAX_TTS_CACHE_BYTES = 48 * 1024 * 1024;

// In-Flight TTS Request Deduplication (prevents redundant API syntheses during traffic spikes)
const inFlightTTS = new Map();

// In-Memory Static Gzip Cache (eliminates repeated compression CPU overhead on static assets)
const staticGzipCache = new Map();
const MAX_STATIC_CACHE_ITEMS = 250;

// In-Memory Living Chronicle Hero Action Sketch Cache (LRU up to 128 items) + In-Flight Deduplication Map
const sketchCache = new Map();
const sketchInFlight = new Map();
const MAX_SKETCH_CACHE_ITEMS = 128;

// Warm WebSocket Connection Pool for Edge Neural TTS
// Eliminates 250-450ms cold TLS connection setup latency on repeated synthesis requests
const edgeVoicePool = new Map(); // voice -> { tts, initPromise, lastUsed }
const EDGE_POOL_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle timeout

// Persistent Warm HTTPS Agent for Google Generative AI API
// Eliminates 350-500ms cold TLS 1.3 handshake overhead on sequential Gemini audio & LLM calls
const geminiHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 25,
    maxFreeSockets: 5,
    timeout: 20000,
    freeSocketTimeout: 10000
});

setInterval(() => {
    const now = Date.now();
    for (const [voice, entry] of edgeVoicePool.entries()) {
        if (now - entry.lastUsed > EDGE_POOL_IDLE_TIMEOUT_MS) {
            try { entry.tts.close(); } catch (_) {}
            edgeVoicePool.delete(voice);
        }
    }
}, 60000).unref();

async function getWarmEdgeTTS(voice) {
    if (!MsEdgeTTS) return null;
    let entry = edgeVoicePool.get(voice);
    if (entry && entry.tts && entry.tts._ws && entry.tts._ws.readyState === 1 /* OPEN */) {
        entry.lastUsed = Date.now();
        return entry.tts;
    }
    if (entry) {
        try { entry.tts.close(); } catch (_) {}
        edgeVoicePool.delete(voice);
    }
    const tts = new MsEdgeTTS();
    const edgeFormat = (OUTPUT_FORMAT && OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3) ? OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3 : (OUTPUT_FORMAT && OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const initPromise = tts.setMetadata(voice, edgeFormat)
        .then(() => tts)
        .catch(err => {
            edgeVoicePool.delete(voice);
            try { tts.close(); } catch (_) {}
            throw err;
        });
    entry = { tts, initPromise, lastUsed: Date.now() };
    edgeVoicePool.set(voice, entry);
    await initPromise;
    return tts;
}

const TTS_VOICE_MAP = {
    // Curated British Masters & Bards
    ryan: 'en-GB-RyanNeural',             // Theatrical, dramatic Tolkien narrator (NEW DEFAULT)
    sonia: 'en-GB-SoniaNeural',           // Majestic, regal High-Elven queen / sorceress (Female)
    libby: 'en-GB-LibbyNeural',           // Gentle, warm British folklore herbalist / townsfolk (Female)
    maisie: 'en-GB-MaisieNeural',         // Young, high-spirited urchin / maid / eccentric babbler (Female)
    thomas: 'en-GB-ThomasNeural',         // Vintage British fireside scholar / chronicler (Male)

    // Celtic & Regional Bards
    connor: 'en-IE-ConnorNeural',         // Vintage Celtic bard / tavern keeper (Male)
    emily: 'en-IE-EmilyNeural',           // Lyrical, poetic Irish folklore female (Female)
    natasha: 'en-AU-NatashaNeural',       // Bold, spirited adventurer / female rogue (Female)
    clara: 'en-CA-ClaraNeural',           // Noble, serene priestess / maiden (Female)
    liam: 'en-CA-LiamNeural',             // Bold, hearty frontier traveler (Male)
    william: 'en-AU-WilliamMultilingualNeural', // Ancient lore-master & scholar (Male)

    // American Characters & Powerhouse Vocals
    christopher: 'en-US-ChristopherNeural', // Deep, resonant fantasy baritone / ancient wyrms / liches / mentors (Male)
    roger: 'en-US-RogerNeural',           // Grizzled, weathered veteran / orc / mercenary (Male)
    guy: 'en-US-GuyNeural',               // Warm, expressive, natural male adventurer (Male)
    jenny: 'en-US-JennyNeural',           // Clear, melodic, evocative female adventurer (Female)
    aria: 'en-US-AriaNeural',             // Intense, dramatic witch / dark cultist / harpy (Female)
    steffan: 'en-US-SteffanNeural',       // Cunning, raspy alley cutthroat (Male)
    andrew: 'en-US-AndrewNeural',         // Stalwart town guard / watchman (Male)
    eric: 'en-US-EricNeural',             // Crisp, authoritative battlefield commander (Male)

    // Contextual Role Mappings with Gender Awareness
    narrator: 'en-GB-RyanNeural',         // Default: theatrical, dramatic British narrator (RESTORED)
    mentor: 'en-US-ChristopherNeural',    // Deep, ancient fantasy baritone sage & guide
    idiot: 'en-GB-MaisieNeural',          // High-spirited, eccentric babbler & drooling vagrant
    babbler: 'en-GB-MaisieNeural',
    female_townsperson: 'en-GB-LibbyNeural',
    male_townsperson: 'en-US-GuyNeural',
    female_rogue: 'en-AU-NatashaNeural',
    male_rogue: 'en-US-SteffanNeural',
    female_spellcaster: 'en-US-AriaNeural',
    male_spellcaster: 'en-US-ChristopherNeural',
    rogue: 'en-US-SteffanNeural',         // Cunning, raspy cutthroat
    merchant: 'en-US-GuyNeural',          // Warm, lively town merchant
    townsperson: 'en-US-GuyNeural',       // Warm, natural townsman
    veteran: 'en-US-RogerNeural',         // Weathered warrior
    beggar: 'en-IE-ConnorNeural',         // Plaintive, raspy wanderer
    orc: 'en-US-RogerNeural',             // Harsh, menacing combatant
    dragon: 'en-US-ChristopherNeural',    // Deep, ancient draconic baritone
    high_undead: 'en-US-ChristopherNeural', // Cold sepulchral resonance
    creature: 'en-US-RogerNeural',        // Default dramatic creature voice
    default: 'en-GB-RyanNeural'
};

// Realm-Contextual Casting Map for Lorekeeper Narrators (Google Gemini High-Quality Audio)
// IMMUTABLE CONTRACT: Always preserve the canonical British RP Storyteller ('Enceladus') across all realms.
const GEMINI_REALM_NARRATOR_MAP = {
    angband: 'Enceladus',     // Venerable, weathered Old English male storyteller (Master Elrond)
    silq: 'Enceladus',        // Venerable British First-Age mythic chronicler (Daeron of Doriath)
    frogcomposband: 'Enceladus', // Venerable British chronicler of Amber & Chaos
    hengband: 'Enceladus',    // Venerable British chronicler (switches to Japanese voice only when lang=jp)
    nethack: 'Enceladus',     // Venerable British chronicler of the Dungeons of Doom
    dcss: 'Enceladus',        // Venerable British chronicler of the Realm of Zot
    brogue: 'Enceladus',      // Venerable British chronicler of the Bioluminescent Caverns
    rogue: 'Enceladus',       // Venerable British 1980 Archivist of the Dungeons of Doom
    ryod: 'Enceladus',        // Venerable British Grand Architect of Roll Your Own Dungeon
    default: 'Enceladus'
};
Object.freeze(GEMINI_REALM_NARRATOR_MAP);

// Curated 30 Character Archetype Casting Matrix for Gemini Native Audio (Free Tier Preview)
const GEMINI_VOICE_MAP = {
    narrator: 'Enceladus',       // Expressive, venerable Old English male storyteller
    mentor: 'Enceladus',         // Locked to canonical British RP Storyteller ('Enceladus') across all realms
    idiot: 'Puck',              // Upbeat, blubbering, eccentric babbler
    female_townsperson: 'Aoede', // Breezy, lyrical, gentle townsfolk
    male_townsperson: 'Sulafat',
    townsperson: 'Sulafat',
    female_rogue: 'Kore',       // Firm, gritty, sharp martial cadence
    male_rogue: 'Orus',         // Disciplined, raspy cutthroat
    rogue: 'Orus',
    female_spellcaster: 'Despina', // Smooth, eerie, mystical sibilance
    male_spellcaster: 'Gacrux',
    spellcaster: 'Gacrux',
    veteran: 'Orus',            // Firm, commanding warrior
    female_veteran: 'Kore',     // Firm, battle-scarred swordswoman
    orc: 'Fenrir',              // Harsh, guttural snarls and aggressive combat barks
    uruk: 'Fenrir',
    troll: 'Fenrir',
    kobold: 'Puck',             // Nimble, raspy, eccentric tenor
    goblin: 'Puck',
    imp: 'Puck',
    snaga: 'Puck',
    elf: 'Orus',
    female_elf: 'Despina',
    male_elf: 'Orus',
    giant: 'Charon',            // Cavernous, hollow booming bass (Half-Giant, Half-Titan, Half-Troll)
    male_giant: 'Charon',
    female_giant: 'Kore',
    dwarf: 'Algenib',           // Deep, gravelly subterranean rumble
    male_dwarf: 'Algenib',
    female_dwarf: 'Sadaltager',
    hobbit: 'Puck',             // Diminutive, lively tenor
    gnome: 'Puck',
    dragon: 'Algenib',          // Deep, gravelly draconic power
    male_dragon: 'Algenib',
    female_dragon: 'Kore',
    high_undead: 'Charon',      // Sepulchral, chilling hollow resonance
    samurai: 'Gacrux',
    ninja: 'Orus',
    amber_noble: 'Fenrir',
    beggar: 'Puck',
    beast: 'Fenrir',            // Bestial snarl
    creature: 'Fenrir',
    default: 'Enceladus'
};
Object.freeze(GEMINI_VOICE_MAP);

// Canonical Character Accent Directorial Map for Immersion (Enforces Zero Southern Accents)
// IMMUTABLE CONTRACT: Never strip or alter the British RP storyteller accent or character accents.
const CHARACTER_ACCENT_MAP = {
    narrator: 'expressive, older British storyteller, standard RP British accent, warm fireside gravitas',
    elf: 'regal, ethereal High-Elven RP accent, crisp consonants',
    female_elf: 'ethereal, melodic High-Elven accent',
    male_elf: 'regal, poetic High-Elven accent',
    dwarf: 'deep, gravelly Scottish brogue, stone-hewn dwarven timbre',
    female_dwarf: 'hearty, resonant Scottish dwarven timbre',
    male_dwarf: 'deep, gruff Scottish brogue',
    hobbit: 'warm, cheerful English countryside West Country accent, lively hobbit',
    gnome: 'lively, eccentric, high-spirited English accent',
    orc: 'harsh, guttural, raspy Cockney monster growl, aggressive combat snarl, no American southern drawl',
    uruk: 'heavy, guttural, brutal Cockney uruk growl, menacing warrior snarl',
    kobold: 'raspy, cunning, high-pitched goblin screech, frantic and vicious',
    goblin: 'raspy, cunning, high-pitched goblin screech, frantic and vicious',
    imp: 'high-pitched, mocking, vicious fiendish cackle',
    snaga: 'whining, groveling, raspy goblin wheeze',
    giant: 'cavernous, slow, booming ancient bass, earth-shaking rumble',
    troll: 'sluggish, heavy, guttural monstrous grunt',
    samurai: 'dignified, disciplined feudal Japanese accent, measured cadence with crisp consonants',
    ninja: 'quiet, hushed, disciplined feudal Japanese whisper',
    amber_noble: 'witty, aristocratic, polished Mid-Atlantic courtly cadence',
    veteran: 'grizzled, seasoned, disciplined British battlefield veteran',
    mentor: 'wise, ancient British scholar with deep gravitas',
    townsperson: 'natural, warm Classical British or Mid-Atlantic cadence',
    female_townsperson: 'gentle, warm English folklore cadence',
    male_townsperson: 'natural, hearty Classical British cadence',
    female_rogue: 'sharp, streetwise British or Celtic cadence',
    male_rogue: 'cunning, raspy urban British cutthroat',
    female_spellcaster: 'smooth, eerie, mystical cadence with crisp enunciation',
    male_spellcaster: 'deep, resonant, arcane scholar with formal British diction and mystical sibilance',
    beggar: 'blubbering, raspy street urchin cadence, eccentric and pathetic',
    high_undead: 'sepulchral, chilling, hollow ancient whisper, cold unholy malice',
    dragon: 'ancient cavernous draconic rumble, haughty draconic wrath and immense resonant power',
    beast: 'bestial, vicious feral snarl, primal predatory growl'
};
Object.freeze(CHARACTER_ACCENT_MAP);

// Generates a standard 44-byte RIFF WAV header for raw 16-bit linear PCM audio
function createWavHeader(pcmLength, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmLength, 40);

    return header;
}

function sanitizeHeader(val) {
    if (!val) return '';
    return String(val).replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, '').substring(0, 120);
}

function redactSecret(val, secret = '') {
    if (!val || typeof val !== 'string') return val;
    let sanitized = val;
    const keys = [secret, process.env.GEMINI_API_KEY].filter(k => k && typeof k === 'string' && k.length > 5);
    for (const k of keys) {
        sanitized = sanitized.split(k).join('[PROTECTED_KEY]');
    }
    return sanitized;
}

let _gcpAuthCache = { token: '', projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '', expiresAt: 0, inflight: null };
let _aiStudioDepletedUntil = 0;

function fetchMetadataText(metaPath) {
    return new Promise(resolve => {
        const metaReq = http.request(`http://metadata.google.internal/computeMetadata/v1/${metaPath}`, {
            method: 'GET',
            headers: { 'Metadata-Flavor': 'Google' },
            timeout: 1500
        }, metaRes => {
            let b = '';
            metaRes.on('data', c => b += c);
            metaRes.on('end', () => resolve(metaRes.statusCode === 200 ? b.trim() : ''));
        });
        metaReq.on('timeout', () => { metaReq.destroy(); resolve(''); });
        metaReq.on('error', () => resolve(''));
        metaReq.end();
    });
}

function runGcloudCmd(args) {
    return new Promise(resolve => {
        const cmd = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
        let proc;
        try {
            proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
        } catch (_) {
            return resolve('');
        }
        let out = '';
        const t = setTimeout(() => { try { proc.kill(); } catch (_) {} resolve(''); }, 4000);
        proc.stdout.on('data', d => out += d);
        proc.on('error', () => { clearTimeout(t); resolve(''); });
        proc.on('close', code => {
            clearTimeout(t);
            resolve(code === 0 ? out.trim() : '');
        });
    });
}

function getGcpAuthContext() {
    const now = Date.now();
    if (_gcpAuthCache.token && _gcpAuthCache.projectId && now < _gcpAuthCache.expiresAt) {
        return Promise.resolve({ token: _gcpAuthCache.token, projectId: _gcpAuthCache.projectId });
    }
    if (_gcpAuthCache.failedUntil && now < _gcpAuthCache.failedUntil) {
        return Promise.resolve({ token: '', projectId: '' });
    }
    if (_gcpAuthCache.inflight) return _gcpAuthCache.inflight;
    _gcpAuthCache.inflight = Promise.all([
        fetchMetadataText('instance/service-accounts/default/token'),
        _gcpAuthCache.projectId ? Promise.resolve(_gcpAuthCache.projectId) : fetchMetadataText('project/project-id')
    ]).then(async ([rawTokenJson, metaProject]) => {
        if (metaProject) _gcpAuthCache.projectId = metaProject;
        if (rawTokenJson) {
            try {
                const data = JSON.parse(rawTokenJson);
                if (data && data.access_token && _gcpAuthCache.projectId) {
                    const ttlSec = Math.max(60, (data.expires_in || 1800) - 120);
                    _gcpAuthCache.token = data.access_token;
                    _gcpAuthCache.expiresAt = Date.now() + ttlSec * 1000;
                    _gcpAuthCache.failedUntil = 0;
                    _gcpAuthCache.inflight = null;
                    return { token: _gcpAuthCache.token, projectId: _gcpAuthCache.projectId };
                }
            } catch (_) {}
        }
        const [localTok, localProj] = await Promise.all([
            process.env.GCP_ACCESS_TOKEN ? Promise.resolve(process.env.GCP_ACCESS_TOKEN) : runGcloudCmd(['auth', 'print-access-token']),
            _gcpAuthCache.projectId ? Promise.resolve(_gcpAuthCache.projectId) : runGcloudCmd(['config', 'get-value', 'project'])
        ]);
        if (localProj) _gcpAuthCache.projectId = localProj;
        if (localTok && _gcpAuthCache.projectId) {
            _gcpAuthCache.token = localTok;
            _gcpAuthCache.expiresAt = Date.now() + 1500 * 1000;
            _gcpAuthCache.failedUntil = 0;
        } else {
            _gcpAuthCache.failedUntil = Date.now() + 5 * 60 * 1000;
        }
        _gcpAuthCache.inflight = null;
        return { token: _gcpAuthCache.token, projectId: _gcpAuthCache.projectId };
    });
    return _gcpAuthCache.inflight;
}

// Proxies text-to-speech to Gemini Native Audio (gemini-3.8-flash-tts / gemini-3.8-flash-lite-tts / gemini-3.1-flash-tts-preview) with Vertex AI failover
function synthesizeGeminiTTS({ text, voice, emotion, geminiTag, directorNote, role, apiKey, realm = 'angband', lang = 'en', isRetry = false }) {
    return new Promise((resolve, reject) => {
        if (!apiKey) {
            return reject(new Error('No Gemini API key provided'));
        }
        const baseReqOpts = { method: 'POST', agent: geminiHttpsAgent, timeout: 20000 };
        const ttsModels = ['gemini-3.1-flash-tts-preview'];
        const retryIdx = typeof isRetry === 'number' ? isRetry : (isRetry ? 1 : 0);
        const ttsModel = ttsModels[Math.min(retryIdx, ttsModels.length - 1)];
        const isGemini38Tts = false;
        const cleanTranscript = String(text || '').replace(/^\s*(?:\[[^\]]+\]|\*[^*]+\*)\s*/g, '').trim() || String(text || '');

        let promptText = cleanTranscript;
        let tag = '';
        let styleInstruction = '';
        if (isRetry !== true) {
            let roleKey = role ? role.toLowerCase() : 'narrator';
            const isHeng = (realm === 'hengband');
            const isJp = isHeng && (lang === 'jp' || /[\u3040-\u30ff\u4e00-\u9faf]/.test(cleanTranscript));
            if (!isHeng) {
                if (roleKey === 'samurai') roleKey = 'veteran';
                else if (roleKey === 'ninja') roleKey = 'rogue';
            }

            const cleanGeminiTag = geminiTag ? String(geminiTag).replace(/[\[\]]/g, '').trim() : '';
            const cleanDirectorNote = directorNote ? String(directorNote).replace(/[\[\]]/g, '').trim() : '';
            const cleanEmotion = emotion ? String(emotion).replace(/[\[\]]/g, '').trim() : '';

            let tagInner = '';
            const baseAccent = (CHARACTER_ACCENT_MAP[roleKey] || (roleKey === 'narrator' ? CHARACTER_ACCENT_MAP.narrator : 'natural, noble Classical British or Mid-Atlantic cadence')).replace(/[\[\]]/g, '').trim();
            if (isJp) {
                tagInner = 'dignified ancient chronicler, calm and resonant';
            } else if (cleanGeminiTag) {
                const sanitizedTag = isHeng ? cleanGeminiTag : cleanGeminiTag.replace(/\b(japanese|samurai|ninja)\b/gi, 'classical');
                tagInner = sanitizedTag.toLowerCase().includes('standard rp british') ? sanitizedTag : `${baseAccent}, ${sanitizedTag}`;
            } else if (cleanDirectorNote) {
                const sanitizedNote = isHeng ? cleanDirectorNote : cleanDirectorNote.replace(/\b(japanese|samurai|ninja)\b/gi, 'classical');
                tagInner = sanitizedNote.toLowerCase().includes('standard rp british') ? sanitizedNote : `${baseAccent}, ${sanitizedNote}`;
            } else {
                tagInner = baseAccent;
            }

            if (cleanEmotion && !tagInner.toLowerCase().includes(cleanEmotion.toLowerCase())) {
                tagInner = tagInner ? `${cleanEmotion}, ${tagInner}` : cleanEmotion;
            }

            if (!isJp && tagInner && !tagInner.toLowerCase().includes('no american') && !tagInner.toLowerCase().includes('no southern')) {
                tagInner = `${tagInner}, no American southern drawl`;
            }

            if (tagInner) {
                tagInner = tagInner
                    .replace(/[\[\]]/g, '')
                    .replace(/(?:\s*,\s*)+/g, ', ')
                    .replace(/^[\s,]+|[\s,]+$/g, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                if (tagInner.length > 240) {
                    tagInner = tagInner.slice(0, 240).replace(/[,;\s]+[^\s,;]*$/, '').trim();
                }
                const wordCount = cleanTranscript.split(/\s+/).filter(Boolean).length;
                if (tagInner && wordCount > 2) {
                    styleInstruction = tagInner;
                    tag = `[${tagInner}]`;
                    promptText = `${tag} ${cleanTranscript}`;
                }
            }
        }

        const partObj = { text: promptText };
        if (isGemini38Tts && styleInstruction && retryIdx === 0) {
            partObj.speech_metadata = { style: styleInstruction };
        }

        const payload = JSON.stringify({
            contents: [{
                role: 'user',
                parts: [partObj]
            }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: voice || 'Enceladus'
                        }
                    }
                }
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
            ]
        });

        function sendViaVertex(fallbackErrMsg) {
            getGcpAuthContext().then(({ token, projectId }) => {
                if (!token || !projectId) {
                    return reject(new Error(fallbackErrMsg || 'Vertex AI fallback token unavailable'));
                }
                const vUrl = `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/locations/global/publishers/google/models/${ttsModel}:generateContent`;
                const vReq = https.request(vUrl, {
                    method: 'POST',
                    agent: geminiHttpsAgent,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'Content-Length': Buffer.byteLength(payload)
                    },
                    timeout: 20000
                }, vRes => {
                    let vBody = '';
                    vRes.on('data', c => vBody += c);
                    vRes.on('end', () => {
                        if ((vRes.statusCode === 401 || vRes.statusCode === 403) && fallbackErrMsg) {
                            return reject(new Error(fallbackErrMsg));
                        }
                        handleTtsResponse(vRes, vBody, true);
                    });
                });
                vReq.setTimeout(20000, () => { vReq.destroy(new Error('Gemini TTS request timed out')); reject(new Error('Gemini TTS request timed out')); });
                vReq.on('timeout', () => { vReq.destroy(new Error('Gemini TTS request timed out')); reject(new Error('Gemini TTS request timed out')); });
                vReq.on('error', err => reject(fallbackErrMsg ? new Error(fallbackErrMsg) : err));
                vReq.write(payload);
                vReq.end();
            }).catch(() => reject(new Error(fallbackErrMsg || 'Vertex AI fallback unavailable')));
        }

        function handleTtsResponse(res, body, usedVertex) {
            if (res.statusCode !== 200) {
                let errMsg = `HTTP ${res.statusCode}`;
                try {
                    const parsed = JSON.parse(body);
                    if (parsed.error && parsed.error.message) {
                        errMsg = `HTTP ${res.statusCode}: ${parsed.error.message}`;
                    }
                } catch (_) {
                    errMsg = `HTTP ${res.statusCode}: ${body.substring(0, 100)}`;
                }
                const safeErrMsg = redactSecret(errMsg.replace(/[\r\n\t]+/g, ' ').substring(0, 120), apiKey);
                if (!usedVertex && (res.statusCode === 402 || res.statusCode === 429 || res.statusCode === 503)) {
                    if (res.statusCode === 402 && apiKey === process.env.GEMINI_API_KEY) {
                        _aiStudioDepletedUntil = Date.now() + 15 * 60 * 1000;
                    }
                    return sendViaVertex(safeErrMsg);
                }
                if (retryIdx + 1 < ttsModels.length && (res.statusCode === 400 || res.statusCode === 404 || res.statusCode === 429 || res.statusCode === 503)) {
                    return synthesizeGeminiTTS({ text, voice, emotion, geminiTag, directorNote, role, apiKey, realm, lang, isRetry: retryIdx + 1 }).then(resolve).catch(reject);
                }
                return reject(new Error(safeErrMsg));
            }
            try {
                const data = JSON.parse(body);
                let inlineData = null;
                const parts = data.candidates?.[0]?.content?.parts;
                if (Array.isArray(parts)) {
                    for (const part of parts) {
                        if (part.inlineData && part.inlineData.data) {
                            inlineData = part.inlineData;
                            break;
                        }
                    }
                }
                if (!inlineData || !inlineData.data) {
                    if (!isRetry && (tag || retryIdx === 0)) {
                        return synthesizeGeminiTTS({
                            text,
                            voice,
                            emotion: '',
                            geminiTag: '',
                            directorNote: '',
                            role,
                            apiKey,
                            realm,
                            lang,
                            isRetry: true
                        }).then(resolve).catch(reject);
                    }
                    const candidateErr = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || data.error?.message || 'Gemini TTS returned no audio data in payload';
                    return reject(new Error(candidateErr));
                }

                let sampleRate = 24000;
                if (inlineData.mimeType && inlineData.mimeType.includes('rate=')) {
                    const rateMatch = inlineData.mimeType.match(/rate=(\d+)/);
                    if (rateMatch) sampleRate = parseInt(rateMatch[1], 10);
                }

                const pcmBuffer = Buffer.from(inlineData.data, 'base64');
                if (pcmBuffer.length > 12 && pcmBuffer.slice(0, 4).toString('ascii') === 'RIFF') {
                    return resolve(pcmBuffer);
                }
                const wavHeader = createWavHeader(pcmBuffer.length, sampleRate, 1, 16);
                const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
                resolve(wavBuffer);
            } catch (err) {
                reject(err);
            }
        }

        if (apiKey.startsWith('AQ.') || (Date.now() < _aiStudioDepletedUntil && apiKey === process.env.GEMINI_API_KEY)) {
            return sendViaVertex();
        }

        const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent`, {
            method: 'POST',
            agent: geminiHttpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'Api-Revision': '2026-05-20',
                'x-goog-api-key': apiKey
            },
            timeout: 20000
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => handleTtsResponse(res, body, false));
        });

        req.setTimeout(20000, () => {
            req.destroy(new Error('Gemini TTS request timed out'));
            reject(new Error('Gemini TTS request timed out'));
        });
        req.on('timeout', () => {
            req.destroy(new Error('Gemini TTS request timed out'));
            reject(new Error('Gemini TTS request timed out'));
        });
        req.on('error', err => {
            reject(err);
        });
        req.write(payload);
        req.end();
    });
}

// Safe Zero-Dependency .env Loader (Root and Server dirs)
function loadEnv() {
    const envPaths = [
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, '../.env'),
        path.resolve(process.cwd(), '.env')
    ];
    for (const p of envPaths) {
        if (fs.existsSync(p)) {
            try {
                const lines = fs.readFileSync(p, 'utf8').split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) continue;
                    const eqIdx = trimmed.indexOf('=');
                    if (eqIdx !== -1) {
                        const key = trimmed.substring(0, eqIdx).trim();
                        const val = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
                        if (process.env[key] === undefined) {
                            process.env[key] = val;
                        }
                    }
                }
            } catch (_) {}
        }
    }
}
loadEnv();

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const IS_WIN = process.platform === 'win32';
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS || `${15 * 60 * 1000}`, 10); // 15 minutes (WS70 Cloud Run cost guard)
const MAX_CONCURRENT_GAMES = parseInt(process.env.MAX_CONCURRENT_GAMES || '36', 10);
const MAX_WS_PER_IP = parseInt(process.env.MAX_WS_PER_IP || String(DEFAULT_MAX_WS_PER_IP), 10);
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || '100', 10);
// Reconnect Grace Period: Keeps headless game engine alive across network drops, tab reloads, or lag spikes (5 minutes; active play sessions save immediately on disconnect)
const DISCONNECT_GRACE_PERIOD_MS = parseInt(process.env.DISCONNECT_GRACE_PERIOD_MS || `${5 * 60 * 1000}`, 10); // 5 minutes

// Waiting queue for connections when activeSessions.size >= MAX_CONCURRENT_GAMES
// Each item: { id, ws, request, enqueueTime, user, save }
const waitingQueue = [];

function resolveEngineExe() {
    if (process.env.ENGINE_EXE && fs.existsSync(process.env.ENGINE_EXE)) {
        return process.env.ENGINE_EXE;
    }
    const localExe = path.resolve(__dirname, '../../engine/build/game', IS_WIN ? 'angband.exe' : 'angband');
    if (fs.existsSync(localExe)) {
        return localExe;
    }
    const systemExe = IS_WIN ? 'angband.exe' : '/usr/local/bin/angband';
    return systemExe;
}

const ENGINE_EXE = resolveEngineExe();
const SAVE_DIR = process.env.SAVE_DIR || path.resolve(__dirname, '../../engine/build/game/lib/save');
const DIST_DIR = process.env.DIST_DIR || path.resolve(__dirname, '../../dist');
const WEB_DIR = process.env.WEB_DIR || path.resolve(__dirname, '../public');

// Ensure directories exist
if (!fs.existsSync(SAVE_DIR)) {
    try { fs.mkdirSync(SAVE_DIR, { recursive: true }); } catch (_) {}
}
if (!fs.existsSync(DIST_DIR)) {
    try { fs.mkdirSync(DIST_DIR, { recursive: true }); } catch (_) {}
}
if (!fs.existsSync(WEB_DIR)) {
    try { fs.mkdirSync(WEB_DIR, { recursive: true }); } catch (_) {}
}

function readAppVersion() {
    let appVersion = '9.9.1';
    try {
        const vFile = path.join(WEB_DIR, 'version.json');
        if (fs.existsSync(vFile)) {
            appVersion = JSON.parse(fs.readFileSync(vFile, 'utf8')).v || appVersion;
        }
    } catch (_) {}
    return appVersion;
}
const CACHED_APP_VERSION = readAppVersion();

const CSP_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self' blob: data: ws: wss:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'"
].join('; ');

function getSaveDirs() {
    const dirs = new Set();
    if (SAVE_DIR) dirs.add(path.resolve(SAVE_DIR));
    const engineDir = path.dirname(ENGINE_EXE);
    const homeDir = process.env.HOME || '/app';
    const candidates = [
        SAVE_DIR,
        path.join(engineDir, 'lib/save'),
        path.join(engineDir, 'lib/user/save'),
        path.join(homeDir, '.angband/Angband/save'),
        path.join('/root/.angband/Angband/save'),
        path.join('/app/.angband/Angband/save'),
        path.join('/data/save')
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(c)) dirs.add(path.resolve(c));
    }
    return Array.from(dirs);
}

console.log(`[Angband3D Cloud] Engine executable: ${ENGINE_EXE}`);
console.log(`[Angband3D Cloud] Save directory:    ${SAVE_DIR}`);
console.log(`[Angband3D Cloud] Standalone dist:   ${DIST_DIR}`);
console.log(`[Angband3D Cloud] Web root:          ${WEB_DIR}`);

// Universal Engine Manifest & Multi-Realm Registry
const MANIFEST_PATH = path.resolve(__dirname, '../../engine-manifest.json');
let engineManifest = null;
try {
    if (fs.existsSync(MANIFEST_PATH)) {
        engineManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        console.log(`[Multi-Realm] Loaded engine manifest (v${engineManifest.version || '1.0'}). Realms: ${Object.keys(engineManifest.realms || {}).join(', ')}`);
    }
} catch (e) {
    console.warn('[Multi-Realm] Could not load engine-manifest.json:', e.message);
}

function getPrimaryRealmSaveDir(realmId = 'angband') {
    const cleanRealm = isValidRealm(realmId) ? realmId : 'angband';
    const primaryDir = path.resolve(SAVE_DIR, cleanRealm);
    if (!fs.existsSync(primaryDir)) {
        try { fs.mkdirSync(primaryDir, { recursive: true }); } catch (_) {}
    }
    return primaryDir;
}

function resolveRealmEngine(realmId = 'angband', lang = 'en') {
    const primarySaveDir = getPrimaryRealmSaveDir(realmId);
    const defaultEngine = {
        realm: 'angband',
        name: 'Vanilla Angband 4.2.6',
        exe: ENGINE_EXE,
        saveDir: primarySaveDir,
        cwd: path.dirname(ENGINE_EXE),
        env: {
            ANGBAND_PATH: path.join(path.dirname(ENGINE_EXE), 'lib')
        },
        cli: {
            frontend_switch: '-mbridge',
            save_token_format: '-u{name}',
            save_dir_switch: '-dsave={path}',
            panic_dir_switch: '-dpanic={path}',
            new_char_switch: '-n'
        },
        installed: fs.existsSync(ENGINE_EXE),
        isFallback: false
    };

    if (!engineManifest || !engineManifest.realms || !engineManifest.realms[realmId]) {
        if (realmId === 'angband') return defaultEngine;
        return {
            realm: realmId,
            name: realmId,
            exe: null,
            saveDir: isValidRealm(realmId) ? primarySaveDir : null,
            cwd: null,
            env: {},
            cli: defaultEngine.cli,
            installed: false,
            isFallback: false,
            fallbackNotice: `Realm "${realmId}" is not defined in engine manifest.`
        };
    }

    if (realmId === 'angband') {
        return defaultEngine;
    }

    const realmDef = engineManifest.realms[realmId];
    let binRelPath = IS_WIN ? realmDef.binary?.win_x64 : realmDef.binary?.linux_x64;

    // Multilingual variant binary resolution:
    // Hengband native binary (hengband.exe / hengband) provides full native Japanese strings,
    // enabling seamless real-time client-side toggling between English, Bilingual, and Japanese across all views.
    // We prefer the native binary if present, falling back to pure English (hengband-en) only if the native binary is absent.
    if (realmId === 'hengband') {
        const enBin = IS_WIN ? 'variants/hengband/bin/hengband-en.exe' : 'variants/hengband/bin/hengband-en';
        const jpBin = IS_WIN ? 'variants/hengband/bin/hengband.exe' : 'variants/hengband/bin/hengband';
        if (fs.existsSync(path.resolve(__dirname, '../../', jpBin))) {
            binRelPath = jpBin;
        } else if (fs.existsSync(path.resolve(__dirname, '../../', enBin))) {
            binRelPath = enBin;
        }
    }

    const variantExe = binRelPath ? path.resolve(__dirname, '../../', binRelPath) : null;

    if (variantExe && fs.existsSync(variantExe)) {
        let variantCwd = path.dirname(variantExe);
        if (!fs.existsSync(path.join(variantCwd, 'lib')) && fs.existsSync(path.join(variantCwd, '..', 'lib'))) {
            variantCwd = path.resolve(variantCwd, '..');
        }
        const variantEnv = {};
        if (realmDef.cli && realmDef.cli.env_vars) {
            for (const [k, v] of Object.entries(realmDef.cli.env_vars)) {
                variantEnv[k] = path.resolve(__dirname, '../../', v);
            }
        }
        if (!variantEnv.ANGBAND_PATH && fs.existsSync(path.join(variantCwd, 'lib'))) {
            variantEnv.ANGBAND_PATH = path.join(variantCwd, 'lib');
        }
        const isNativeAngbandVariant = (realmId === 'frogcomposband' || realmId === 'hengband' || realmId === 'silq');
        const resolvedCli = isNativeAngbandVariant
            ? { ...defaultEngine.cli, ...(realmDef.cli || {}) }
            : (realmDef.cli || defaultEngine.cli);
        return {
            realm: realmId,
            name: realmDef.name,
            exe: variantExe,
            saveDir: primarySaveDir,
            cwd: variantCwd,
            env: variantEnv,
            cli: resolvedCli,
            installed: true,
            isFallback: false
        };
    }

    return {
        realm: realmId,
        name: realmDef.name,
        exe: null,
        saveDir: primarySaveDir,
        cwd: null,
        env: {},
        cli: realmDef.cli || defaultEngine.cli,
        installed: false,
        isFallback: false,
        fallbackNotice: `Engine binary for realm "${realmDef.name}" is not installed on this server.`
    };
}

function getSaveDirsForRealm(realmId = 'angband') {
    const cleanRealm = isValidRealm(realmId) ? realmId : 'angband';
    const dirs = new Set();
    dirs.add(getPrimaryRealmSaveDir(cleanRealm));

    if (cleanRealm === 'angband') {
        for (const d of getSaveDirs()) {
            dirs.add(d);
        }
    } else {
        const realmDef = engineManifest && engineManifest.realms && engineManifest.realms[cleanRealm];
        const fallbackCandidates = [
            realmDef && realmDef.save_system && realmDef.save_system.directory
                ? path.resolve(__dirname, '../../', realmDef.save_system.directory)
                : null,
            path.resolve(__dirname, '../../variants', cleanRealm, 'lib/save'),
            path.resolve(__dirname, '../../engine/build/game/lib/save', cleanRealm)
        ];
        for (const cand of fallbackCandidates) {
            if (cand && fs.existsSync(cand)) {
                dirs.add(path.resolve(cand));
            }
        }
    }
    return Array.from(dirs);
}

/**
 * Resolves a requested save name against disk files in all known save directories.
 * Preserves the exact on-disk filename (e.g. "Hero.sav" vs "Hero"), ensuring Angband's
 * start_game() engine check finds the savefile and does not drop the player into character creation!
 */
function resolveSavefileName(requestedSave, realmId = 'angband') {
    if (!requestedSave) return null;
    const clean = requestedSave.replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!clean) return null;
    const cleanNoExt = clean.replace(/\.sav$/i, '');
    const saveDirs = getSaveDirsForRealm(realmId);

    for (const dir of saveDirs) {
        if (!fs.existsSync(dir)) continue;
        const exact = path.join(dir, clean);
        if (fs.existsSync(exact) && fs.statSync(exact).isFile()) return path.basename(exact);

        const withSav = path.join(dir, cleanNoExt + '.sav');
        if (fs.existsSync(withSav) && fs.statSync(withSav).isFile()) return path.basename(withSav);

        const withoutExt = path.join(dir, cleanNoExt);
        if (fs.existsSync(withoutExt) && fs.statSync(withoutExt).isFile()) return path.basename(withoutExt);
    }

    for (const dir of saveDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                const fNoExt = f.replace(/\.sav$/i, '');
                if (f.toLowerCase() === clean.toLowerCase() ||
                    f.toLowerCase() === (cleanNoExt + '.sav').toLowerCase() ||
                    fNoExt.toLowerCase() === cleanNoExt.toLowerCase()) {
                    return f;
                }
            }
        } catch (_) {}
    }

    return clean;
}

saveVault = createSaveVaultService({
    SAVE_DIR,
    getSaveDirsForRealm,
    activeSessions,
    uploadLimiter,
    vaultSyncLimiter,
    clientIp,
    normalizeSessionKey
});

const {
    isReservedFilename,
    sanitizeFilename,
    getOwnerTokenPath,
    verifyOwnerTokenAsync,
    createOwnerToken,
    createOwnerTokenAsync,
    readSaveMetadataAsync,
    readSaveMetadata
} = saveVault;

function verifyOwnerToken(savePath, requestToken, expectedHashBuf = null) {
    if (expectedHashBuf && Buffer.isBuffer(expectedHashBuf) && requestToken) {
        const candBuf = Buffer.from(crypto.createHash('sha256').update(String(requestToken)).digest('hex'), 'utf8');
        if (candBuf.length === expectedHashBuf.length && crypto.timingSafeEqual(expectedHashBuf, candBuf)) {
            return true;
        }
    }
    return saveVault.verifyOwnerToken(savePath, requestToken);
}

// HTTP Server
// --- Origin policy (WS4.3, E17/E22) ---------------------------------------
// Same-host origins are always allowed. Capacitor/Android WebView origins are allowed by
// default so the APK keeps working. Extra origins: ALLOWED_ORIGINS="https://a.com,https://b.com".
// A missing Origin header (curl, same-origin navigation, native clients) is allowed; CORS is a
const EXTRA_ALLOWED_ORIGINS = new Set(
    [
        'capacitor://localhost',
        'https://localhost',
        'http://localhost',
        'ionic://localhost',
        'https://yasd3d.com',
        'http://yasd3d.com',
        'https://www.yasd3d.com',
        'http://www.yasd3d.com',
        'https://angband3d.com',
        'http://angband3d.com',
        'https://www.angband3d.com',
        'http://www.angband3d.com'
    ].concat((process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean))
);
EXTRA_ALLOWED_ORIGINS.some = function(fn) {
    for (const item of this) {
        if (fn(item)) return true;
    }
    return false;
};
const ALLOWED_RUN_APP_RE = /^angband3d(?:-[a-z0-9-]+)?\.run\.app$/i;
function isAllowedForwardedHost(firstFwdHost) {
    return EXTRA_ALLOWED_ORIGINS.some(o => o.endsWith('://' + firstFwdHost)) || ALLOWED_RUN_APP_RE.test(firstFwdHost);
}
function extractWsOwnerToken(request, urlObj) {
    return saveVault.extractRequestOwnerTokens(request, urlObj);
}
function isAllowedOrigin(origin, host, req) {
    if (!origin) {
        const sfs = req && req.headers && req.headers['sec-fetch-site'];
        if (sfs === 'same-origin' || sfs === 'same-site') return true;
        if (sfs && sfs !== 'none') return false;
        const isProd = process.env.TRUST_PROXY === '1' || Boolean(process.env.K_SERVICE);
        if (isProd && req && !isLoopbackRequest(req)) {
            const referer = req.headers && req.headers.referer;
            if (referer) {
                try {
                    return isAllowedOrigin(new URL(referer).origin, host, req);
                } catch (_) {}
            }
            return false;
        }
        return true;
    }
    try {
        const originHost = new URL(origin).host;
        if (host && (originHost === host || originHost === host.split(':')[0])) return true;
        if (req && req.headers) {
            if (process.env.TRUST_PROXY === '1') {
                const fwdHost = req.headers['x-forwarded-host'];
                if (fwdHost) {
                    const firstFwd = fwdHost.split(',')[0].trim();
                    const firstFwdHost = firstFwd.split(':')[0].toLowerCase();
                    if (isAllowedForwardedHost(firstFwdHost)) {
                        if (originHost === firstFwd || originHost === firstFwdHost) return true;
                    }
                }
            }
            const reqHost = req.headers.host;
            if (reqHost && (originHost === reqHost || originHost === reqHost.split(':')[0])) return true;
        }
    } catch (_) {
        return false;
    }
    return EXTRA_ALLOWED_ORIGINS.has(origin);
}
function verifyBrowserOrigin(req) {
    const origin = req.headers && req.headers.origin;
    if (!origin) return true;
    let fwdHost = '';
    if (process.env.TRUST_PROXY === '1' && req.headers && req.headers['x-forwarded-host']) {
        const firstFwd = req.headers['x-forwarded-host'].split(',')[0].trim();
        const firstFwdHost = firstFwd.split(':')[0].toLowerCase();
        if (isAllowedForwardedHost(firstFwdHost)) {
            fwdHost = firstFwd;
        }
    }
    const host = fwdHost || (req.headers && req.headers.host) || '';
    return isAllowedOrigin(origin, host, req);
}
// Loopback check for dev-only endpoints (D17). Ignores X-Forwarded-For on purpose.
function isLoopbackRequest(req) {
    const a = (req.socket && req.socket.remoteAddress) || '';
    return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;

    // HTTPS Redirection behind SSL Proxies (Cloud Run / Load Balancers)
    const proto = req.headers['x-forwarded-proto'];
    let fwdHost = '';
    if (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-host']) {
        const firstFwd = req.headers['x-forwarded-host'].split(',')[0].trim();
        const firstFwdHost = firstFwd.split(':')[0].toLowerCase();
        if (isAllowedForwardedHost(firstFwdHost)) {
            fwdHost = firstFwd;
        }
    }
    const host = fwdHost || req.headers.host || '';
    if (proto === 'http' && host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
        res.writeHead(301, {
            'Location': `https://${host}${req.url}`,
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
        });
        res.end();
        return;
    }

    if (handleLegacyDomainRedirect(req, res, host)) return;

    // CORS: echo the Origin only when allowed (never '*'; E17). Vary keeps caches honest.
    const reqOrigin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (reqOrigin && isAllowedOrigin(reqOrigin, host, req)) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Character-Name, X-Recording-Name, X-Vault-Id, X-Owner-Token, X-Save-Owner-Token, X-Save-Slot, X-Realm, X-Stakes, X-API-Key, x-goog-api-key, Api-Revision');
        res.setHeader('Access-Control-Expose-Headers', 'X-TTS-Engine, X-TTS-Cache, X-TTS-Fallback-Reason, Content-Type, Content-Length');
    }
    
    if (guardMutation(req, res, isAllowedOrigin, host)) return;

    // # ROOT-CAUSE: Strip third-party Google Fonts and Cloudflare beacon CSP origins and disable Privacy Sandbox APIs in Permissions-Policy.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'attribution-reporting=(), browsing-topics=(), camera=(), geolocation=(), interest-cohort=(), join-ad-interest-group=(), microphone=(self), payment=(), private-aggregation=(), private-state-token-issuance=(), private-state-token-redemption=(), run-ad-auction=()');
    if (proto === 'https' || req.socket.encrypted) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Modern Content Security Policy (permits WebGL Three.js, local shaders, Web Audio, and self-hosted WOFF2 fonts)
    res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health & Liveness Probes (/health and /healthz for Cloud Run / Kubernetes)
    if ((pathname === '/health' || pathname === '/healthz') && req.method === 'GET') {
        const appVersion = CACHED_APP_VERSION;
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify({
            status: 'ok',
            uptime: Math.floor(process.uptime()),
            activeSessions: activeSessions.size,
            engine: fs.existsSync(ENGINE_EXE) ? 'ready' : 'missing',
            version: appVersion,
            timestamp: Date.now()
        }));
        return;
    }

    if ((pathname === '/robots.txt' || req.url === '/robots.txt') && (req.method === 'GET' || req.method === 'HEAD')) {
        const body = 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /ws\n';
        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
            'Cache-Control': 'public, max-age=86400'
        });
        if (req.method === 'HEAD') { res.end(); return; }
        res.end(body);
        return;
    }

    if ((pathname === '/.well-known/security.txt' || pathname === '/security.txt' || req.url === '/.well-known/security.txt' || req.url === '/security.txt') && (req.method === 'GET' || req.method === 'HEAD')) {
        const body = 'Contact: https://github.com/ThunderbearStudios/angband3d/security/advisories\nExpires: 2027-12-31T23:59:59.000Z\nPreferred-Languages: en\nCanonical: https://angband3d.com/.well-known/security.txt\n';
        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
            'Cache-Control': 'public, max-age=86400'
        });
        if (req.method === 'HEAD') { res.end(); return; }
        res.end(body);
        return;
    }

    // Standalone package ZIP download
    if ((pathname === '/download/angband3d-standalone.zip' || pathname === '/download/Angband3D-Windows-x64.zip' || pathname === '/download/angband3d-windows.zip') && (req.method === 'GET' || req.method === 'HEAD')) {
        // Look for zip in DIST_DIR
        let zipPath = path.join(DIST_DIR, 'Angband3D-Windows-x64.zip');
        if (!fs.existsSync(zipPath)) zipPath = path.join(DIST_DIR, 'angband3d-standalone.zip');
        if (!fs.existsSync(zipPath)) {
            // Check for any zip file in dist directory
            const files = fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR) : [];
            const found = files.find(f => f.endsWith('.zip'));
            if (found) {
                zipPath = path.join(DIST_DIR, found);
            }
        }

        if (fs.existsSync(zipPath)) {
            const stat = fs.statSync(zipPath);
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Length': stat.size,
                'Content-Disposition': `attachment; filename="${path.basename(zipPath)}"`,
            });
            if (req.method === 'HEAD') {
                res.end();
                return;
            }
            const dlStream = fs.createReadStream(zipPath);
            res.on('close', () => dlStream.destroy());
            dlStream.on('error', () => {
                if (!res.headersSent) res.writeHead(500);
                res.end();
            });
            dlStream.pipe(res);
            return;
        } else {
            // Redirect to latest GitHub Release asset as fallback
            res.writeHead(302, {
                'Location': 'https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Windows-x64.zip'
            });
            res.end();
        }
        return;
    }

    // Android APK download endpoint
    if ((pathname === '/download/Angband3D-Android.apk' || pathname === '/download/angband3d-android.apk') && (req.method === 'GET' || req.method === 'HEAD')) {
        let apkPath = path.join(DIST_DIR, 'Angband3D-Android.apk');
        if (!fs.existsSync(apkPath)) {
            const files = fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR) : [];
            const found = files.find(f => f.endsWith('.apk'));
            if (found) apkPath = path.join(DIST_DIR, found);
        }

        if (fs.existsSync(apkPath)) {
            const stat = fs.statSync(apkPath);
            res.writeHead(200, {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Length': stat.size,
                'Content-Disposition': 'attachment; filename="Angband3D-Android.apk"',
            });
            if (req.method === 'HEAD') {
                res.end();
                return;
            }
            const dlStream = fs.createReadStream(apkPath);
            res.on('close', () => dlStream.destroy());
            dlStream.on('error', () => {
                if (!res.headersSent) res.writeHead(500);
                res.end();
            });
            dlStream.pipe(res);
            return;
        } else {
            // Redirect to latest GitHub Release asset
            res.writeHead(302, {
                'Location': 'https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Android.apk'
            });
            res.end();
        }
        return;
    }

    // REST: Async Write-Through Dual-Vault Save Endpoints (/api/saves, /api/saves/sync, /api/saves/upload, /api/saves/latest, /api/saves/restore-checkpoint, /api/saves/:name)
    if (saveVault.handleSaveVaultRoute(req, res, urlObj, pathname)) return;

    // REST: Multi-Realm Registry & Capabilities
    if (pathname === '/api/realms' && req.method === 'GET') {
        const realmsStatus = {};
        if (engineManifest && engineManifest.realms) {
            for (const [rId, def] of Object.entries(engineManifest.realms)) {
                const resolved = resolveRealmEngine(rId);
                realmsStatus[rId] = {
                    id: rId,
                    name: def.name,
                    tagline: def.tagline,
                    version: def.version,
                    lineage: def.lineage,
                    installed: resolved.installed && !resolved.isFallback,
                    isFallback: resolved.isFallback,
                    fallbackNotice: resolved.fallbackNotice || null,
                    capabilities: def.capabilities,
                    theme: def.theme,
                    lore: def.lore
                };
            }
        }
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        res.end(JSON.stringify({
            status: 'ok',
            defaultRealm: engineManifest?.default_realm || 'angband',
            realms: realmsStatus
        }));
        return;
    }

    // REST: Per-Realm Official Help Files & Manuals (/api/help?realm=<realm>[&file=<name>])
    if (pathname === '/api/help' && (req.method === 'GET' || req.method === 'HEAD')) {
        const { listHelpFiles, readHelpFile } = require('./realm-help-files');
        const rawRealm = String(urlObj.searchParams.get('realm') || 'angband').toLowerCase();
        const realm = isValidRealm(rawRealm) ? rawRealm : 'angband';
        const fileParam = urlObj.searchParams.get('file');
        if (!fileParam) {
            const files = listHelpFiles(realm);
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=300'
            });
            res.end(JSON.stringify({ status: 'ok', realm, files }));
            return;
        }
        const entry = readHelpFile(realm, fileParam);
        if (!entry) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Help file not found for realm.' }));
            return;
        }
        if (entry.isBinary) {
            res.writeHead(200, {
                'Content-Type': entry.contentType,
                'Content-Length': entry.buffer.length,
                'Content-Disposition': `inline; filename="${entry.name.replace(/"/g, '')}"`,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(req.method === 'HEAD' ? undefined : entry.buffer);
            return;
        }
        if (urlObj.searchParams.get('raw') === '1') {
            res.writeHead(200, {
                'Content-Type': entry.contentType,
                'Content-Length': entry.buffer.length,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(req.method === 'HEAD' ? undefined : entry.buffer);
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        });
        res.end(JSON.stringify({
            status: 'ok',
            realm,
            name: entry.name,
            label: entry.label,
            content: entry.text
        }));
        return;
    }

    // REST: Server Capacity & Telemetry Status
    if (pathname === '/api/status' && req.method === 'GET') {
        const appVersion = CACHED_APP_VERSION;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            activeSessions: activeSessions.size,
            maxCapacity: MAX_CONCURRENT_GAMES,
            waitingQueue: waitingQueue.length,
            maxQueueSize: MAX_QUEUE_SIZE,
            version: appVersion
        }));
        return;
    }

    // REST: Protected LLM Configuration Provider (Never exposes raw secret key to browser)
    if (pathname === '/api/config/llm' && req.method === 'GET') {
        const apiKey = process.env.GEMINI_API_KEY || '';
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify({
            hasKey: !!apiKey,
            hasServerKey: !!apiKey,
            defaultModel: 'gemini-3.8-flash',
            models: ALLOWED_MODELS,
            provider: apiKey ? 'gemini' : 'offline'
        }));
        return;
    }

    // REST: Protected LLM Generator Proxy (Protects API key entirely on backend; zero client leakage)
    if (pathname === '/api/llm/generate' && req.method === 'POST') {
        const wait = llmLimiter(clientIp(req)) || globalLlmLimiter('GLOBAL');
        if (wait > 0) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': wait });
            res.end(JSON.stringify({ error: { message: 'Rate limit' } }));
            return;
        }

        let rawBody = '';
        req.on('data', chunk => {
            rawBody += chunk;
            if (rawBody.length > 65536) {
                if (!res.headersSent) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Payload too large' } }));
                }
                req.destroy();
            }
        });

        req.on('end', () => {
            let parsed = null;
            try {
                parsed = JSON.parse(rawBody);
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Invalid JSON payload' } }));
                return;
            }

            const model = parsed.model || 'gemini-3.8-flash';
            if (!ALLOWED_MODELS.includes(model)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Disallowed model' } }));
                return;
            }

            let systemPrompt = '';
            let userPrompt = '';
            if (parsed.payload) {
                try {
                    systemPrompt = parsed.payload.systemInstruction.parts[0].text || '';
                    userPrompt = parsed.payload.contents[0].parts[0].text || '';
                } catch(e) {}
            } else {
                systemPrompt = parsed.systemPrompt || '';
                userPrompt = parsed.userPrompt || '';
            }

            if (systemPrompt.length > 4000) systemPrompt = systemPrompt.substring(0, 4000);
            if (userPrompt.length > 8000) userPrompt = userPrompt.substring(0, 8000);

            const generationConfig = { maxOutputTokens: 350 };
            if (parsed.payload?.generationConfig?.responseMimeType === 'application/json') {
                generationConfig.responseMimeType = 'application/json';
            }
            if (parsed.payload?.generationConfig?.responseSchema && typeof parsed.payload.generationConfig.responseSchema === 'object') {
                generationConfig.responseSchema = parsed.payload.generationConfig.responseSchema;
            }
            const isGemini3 = model.includes('gemini-3') || model.includes('gemini-4') || model.includes('3.8') || model.includes('3.7') || model.includes('3.6') || model.includes('3.5') || model.includes('3.1');
            if (isGemini3) {
                generationConfig.thinkingConfig = {
                    thinkingLevel: model.includes('lite') ? 'MINIMAL' : 'LOW'
                };
            } else {
                generationConfig.temperature = 0.7;
            }

            const payload = {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig
            };

            // Key resolution: client header override allowed, else server environment
            const apiKey = req.headers['x-goog-api-key'] || req.headers['x-api-key'] || process.env.GEMINI_API_KEY || '';

            if (!apiKey) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'No Gemini API key configured on server or request.' } }));
                return;
            }

            const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
            const payloadStr = JSON.stringify(payload);
            const vertexLlmModel = model;

            function handleLlmResponse(upstreamRes, respBody, usedVertex) {
                if (upstreamRes.statusCode !== 200 && !usedVertex && (upstreamRes.statusCode === 402 || upstreamRes.statusCode === 403 || upstreamRes.statusCode === 404 || upstreamRes.statusCode === 429 || upstreamRes.statusCode === 500 || upstreamRes.statusCode === 503)) {
                    if (upstreamRes.statusCode === 402 && apiKey === process.env.GEMINI_API_KEY) {
                        _aiStudioDepletedUntil = Date.now() + 15 * 60 * 1000;
                    }
                    return sendLlmViaVertex(upstreamRes.statusCode, respBody);
                }
                const outStatus = (upstreamRes.statusCode === 400 && respBody.includes('API_KEY_INVALID')) ? 401 : (upstreamRes.statusCode || 200);
                if (!res.headersSent) {
                    res.writeHead(outStatus, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    });
                    if (upstreamRes.statusCode === 200) {
                        try {
                            const rb = JSON.parse(respBody);
                            const parts = rb.candidates?.[0]?.content?.parts || [];
                            const text = parts
                                .filter(p => p && !p.thought && typeof p.text === 'string')
                                .map(p => p.text)
                                .join('')
                                .trim();
                            res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
                        } catch(e) {
                            res.end(JSON.stringify({ error: { message: 'Upstream error parsing response' } }));
                        }
                    } else {
                        res.end(JSON.stringify({ error: { message: `Upstream error ${outStatus}` } }));
                    }
                }
            }

            function sendLlmViaVertex(fallbackStatus = 502, fallbackBody = '') {
                getGcpAuthContext().then(({ token, projectId }) => {
                    if (!token || !projectId) {
                        if (!res.headersSent) {
                            const outStatus = (fallbackStatus === 400 && fallbackBody.includes('API_KEY_INVALID')) ? 401 : fallbackStatus;
                            res.writeHead(outStatus, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
                            res.end(JSON.stringify({ error: { message: `Upstream error ${outStatus}` } }));
                        }
                        return;
                    }
                    const vUrl = `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/locations/global/publishers/google/models/${encodeURIComponent(vertexLlmModel)}:generateContent`;
                    const vReq = https.request(vUrl, {
                        method: 'POST',
                        agent: geminiHttpsAgent,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            'Content-Length': Buffer.byteLength(payloadStr)
                        },
                        timeout: 30000
                    }, vRes => {
                        let vBody = '';
                        vRes.on('data', c => vBody += c);
                        vRes.on('end', () => handleLlmResponse(vRes, vBody, true));
                    });
                    vReq.on('timeout', () => {
                        vReq.destroy();
                        if (!res.headersSent) {
                            res.writeHead(504, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: { message: 'Gemini upstream request timed out' } }));
                        }
                    });
                    vReq.on('error', err => {
                        if (!res.headersSent) {
                            res.writeHead(502, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: { message: redactSecret(err.message, apiKey) } }));
                        }
                    });
                    vReq.write(payloadStr);
                    vReq.end();
                });
            }

            if (apiKey.startsWith('AQ.') || (Date.now() < _aiStudioDepletedUntil && apiKey === process.env.GEMINI_API_KEY)) {
                sendLlmViaVertex();
                return;
            }

            const upstreamReq = https.request(targetUrl, {
                method: 'POST',
                agent: geminiHttpsAgent,
                headers: {
                    'Content-Type': 'application/json',
                    'Api-Revision': '2026-05-20',
                    'x-goog-api-key': apiKey,
                    'Content-Length': Buffer.byteLength(payloadStr)
                },
                timeout: 30000
            }, upstreamRes => {
                let respBody = '';
                upstreamRes.on('data', chunk => respBody += chunk);
                upstreamRes.on('end', () => handleLlmResponse(upstreamRes, respBody, false));
            });

            upstreamReq.on('timeout', () => {
                upstreamReq.destroy();
                if (!res.headersSent) {
                    res.writeHead(504, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Gemini upstream request timed out' } }));
                }
            });

            upstreamReq.on('error', err => {
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: redactSecret(err.message, apiKey) } }));
                }
            });

            upstreamReq.write(payloadStr);
            upstreamReq.end();
        });
        return;
    }

    // REST: Living Chronicle Lore-Correct Hero Action Sketch (/api/chronicle/sketch)
    if (pathname === '/api/chronicle/sketch' && req.method === 'POST') {
        if (!verifyBrowserOrigin(req)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Origin not allowed' }));
            return;
        }

        const customKey = String(req.headers['x-goog-api-key'] || req.headers['x-api-key'] || '').trim();
        const wait = sketchLimiter(clientIp(req)) || (customKey ? 0 : globalSketchLimiter('GLOBAL'));
        if (wait > 0) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': wait });
            res.end(JSON.stringify({ error: { message: 'Rate limit' } }));
            return;
        }

        let rawBody = '';
        const maxBodyBytes = 16384;
        req.on('data', chunk => {
            rawBody += chunk;
            if (rawBody.length > maxBodyBytes) {
                if (!res.headersSent) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Payload too large' } }));
                }
                req.destroy();
            }
        });

        req.on('end', () => {
            let parsed = null;
            try {
                parsed = JSON.parse(rawBody);
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Invalid JSON payload' } }));
                return;
            }

            const realm = (parsed.realm || 'angband').toString();
            const prompt = (typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '');

            if (!prompt || typeof prompt !== 'string' || prompt.length > 4000) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Invalid or missing prompt (max 4000 chars)' } }));
                return;
            }

            const cacheKey = crypto.createHash('sha256').update(realm + ':' + prompt.trim().slice(0, 640)).digest('hex');
            if (sketchCache.has(cacheKey)) {
                const cachedImg = sketchCache.get(cacheKey);
                sketchCache.delete(cacheKey);
                sketchCache.set(cacheKey, cachedImg);
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                });
                res.end(JSON.stringify({
                    ok: true,
                    imageUrl: cachedImg,
                    model: 'gemini-2.5-flash-image',
                    cached: true
                }));
                return;
            }

            // Coalesce identical or concurrent pre-warm + user sketch requests in flight
            if (sketchInFlight.has(cacheKey)) {
                sketchInFlight.get(cacheKey).then((sharedPayload) => {
                    if (!res.headersSent) {
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-cache, no-store, must-revalidate'
                        });
                        res.end(JSON.stringify(sharedPayload));
                    }
                });
                return;
            }

            let resolveInFlight;
            const inFlightPromise = new Promise((resolve) => { resolveInFlight = resolve; });
            sketchInFlight.set(cacheKey, inFlightPromise);
            const finishSketchRequest = (payloadObj) => {
                sketchInFlight.delete(cacheKey);
                if (resolveInFlight) resolveInFlight(payloadObj);
                if (!res.headersSent) {
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    });
                    res.end(JSON.stringify(payloadObj));
                }
            };

            const apiKey = customKey || process.env.GEMINI_API_KEY || '';
            const SKETCH_MODELS = ['gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
            const rawRequestedModel = (typeof parsed.model === 'string') ? parsed.model.trim() : '';

            generateChronicleSketch({
                prompt,
                requestedModel: rawRequestedModel,
                models: SKETCH_MODELS,
                apiKey,
                customKey,
                geminiHttpsAgent,
                getGcpAuthContext,
                redactSecret
            }).then((result) => {
                if (result && result.ok && result.imageUrl) {
                    if (sketchCache.size >= MAX_SKETCH_CACHE_ITEMS) {
                        const oldestKey = sketchCache.keys().next().value;
                        if (oldestKey !== undefined) sketchCache.delete(oldestKey);
                    }
                    sketchCache.set(cacheKey, result.imageUrl);
                }
                finishSketchRequest(result || { ok: false, fallback: true, reason: 'upstream_error_502' });
            }).catch((err) => {
                console.warn(`[Sketch] Unhandled error: ${err && err.message ? err.message : err}`);
                finishSketchRequest({ ok: false, fallback: true, reason: 'network_error' });
            });
        });
        return;
    }

    // REST: Dual-Engine Neural Text-To-Speech (/api/tts?text=...&role=...&engine=edge|gemini&emotion=...)
    if (pathname === '/api/tts' && (req.method === 'GET' || req.method === 'HEAD')) {
        const wait = ttsLimiter(clientIp(req)) || globalTtsLimiter('GLOBAL');
        if (wait > 0) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': wait });
            res.end(JSON.stringify({ error: { message: 'Rate limit' } }));
            return;
        }

        if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
            res.end();
            return;
        }

        // Fast mute exit: If audio is muted by client, skip processing and return 204 No Content
        if (urlObj.searchParams.get('muted') === '1' || req.headers['x-tome-muted'] === '1') {
            res.writeHead(204, {
                'X-TTS-Status': 'MUTED',
                'Cache-Control': 'no-cache'
            });
            res.end();
            return;
        }
        const text = (urlObj.searchParams.get('text') || '').trim();
        const role = (urlObj.searchParams.get('role') || 'narrator').toLowerCase();
        const isNarrator = (role === 'narrator');

        if (!text) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing text parameter' }));
            return;
        }

        if (text.length > 1000) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Text too long (max 1000 characters)' }));
            return;
        }

        // Extract Gemini API key (client header takes priority, then server environment; NEVER from URL query)
        const geminiApiKey = req.headers['x-goog-api-key'] ||
                             req.headers['x-api-key'] ||
                             process.env.GEMINI_API_KEY ||
                             '';

        const reqEngineParam = urlObj.searchParams.get('engine');
        // Lorekeeper narrator uses high quality Gemini Native Audio
        const requestedEngine = isNarrator ? 'gemini' : (reqEngineParam ? reqEngineParam.toLowerCase() : 'gemini');
        const emotion = (urlObj.searchParams.get('emotion') || '').toLowerCase().trim();
        const geminiTag = (urlObj.searchParams.get('gemini_tag') || '').trim();
        const directorNote = (urlObj.searchParams.get('director_note') || '').trim();
        const reqVoice = (urlObj.searchParams.get('voice') || '').trim();
        const reqRealm = (urlObj.searchParams.get('realm') || 'angband').toLowerCase().trim();
        const reqLang = (urlObj.searchParams.get('lang') || 'en').toLowerCase().trim();
        const isJpText = reqLang === 'jp' || /[\u3040-\u30ff\u4e00-\u9faf]/.test(String(text || ''));
        const reqGender = (urlObj.searchParams.get('gender') || '').toLowerCase().trim();
        const reqPitch = (urlObj.searchParams.get('pitch') || '').trim();
        const reqRate = (urlObj.searchParams.get('rate') || '').trim();

        if (reqPitch && !/^[+-]?\d{1,3}(%|Hz)?$/.test(reqPitch)) {
            res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Invalid pitch"}'); return;
        }
        if (reqRate && !/^[+-]?\d{1,3}(%|Hz)?$/.test(reqRate)) {
            res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Invalid rate"}'); return;
        }

        const tagRegex = /^[\p{L}\p{N} ,.'\-:;!()\[\]/&+]{0,300}$/u;
        if (emotion && !tagRegex.test(emotion)) {
            res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Invalid emotion"}'); return;
        }
        if (geminiTag && !tagRegex.test(geminiTag)) {
            res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Invalid gemini_tag"}'); return;
        }
        if (directorNote && !tagRegex.test(directorNote)) {
            res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Invalid director_note"}'); return;
        }

        // --- ENGINE B: GEMINI NATIVE CONTROLLABLE AUDIO ---
        if (requestedEngine === 'gemini') {
            if (!geminiApiKey) {
                if (!isNarrator) {
                    console.info('[TTS] No Gemini API key for non-narrator role, falling back to Edge Neural');
                    handleEdgeTTS('No Gemini API key configured');
                    return;
                }
                console.warn('[TTS] Gemini Native Audio requested, but no Gemini API key found (headers, query, or env).');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No Gemini API key configured for Gemini Native Audio' }));
                return;
            }

            // Resolve Gemini voice from official 30-voice matrix or realm-contextual narrator defaults
            let geminiVoice = isNarrator ? (GEMINI_REALM_NARRATOR_MAP[reqRealm] || GEMINI_REALM_NARRATOR_MAP.default) : GEMINI_VOICE_MAP.default;
            const validGeminiVoices = [
                'Sulafat', 'Aoede', 'Algenib', 'Kore', 'Orus', 'Despina', 'Fenrir', 'Puck',
                'Gacrux', 'Sadaltager', 'Achernar', 'Zephyrus', 'Zephyr', 'Chort', 'Leda',
                'Izar', 'Enif', 'Vindemiatrix', 'Vega', 'Charon', 'Callirrhoe', 'Autonoe',
                'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Erinome', 'Rasalgethi',
                'Laomedeia', 'Alnilam', 'Schedar', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Sadachbia'
            ];
            const isDefaultMaleFallback = isNarrator && reqVoice && reqVoice.toLowerCase() === 'enceladus'
                && reqGender === 'female';
            if (reqVoice && validGeminiVoices.map(v => v.toLowerCase()).includes(reqVoice.toLowerCase()) && !isDefaultMaleFallback) {
                geminiVoice = validGeminiVoices.find(v => v.toLowerCase() === reqVoice.toLowerCase());
            } else if (isNarrator) {
                geminiVoice = (reqGender === 'female')
                    ? (reqRealm === 'silq' ? 'Despina' : (reqRealm === 'hengband' ? 'Sulafat' : (reqRealm === 'frogcomposband' ? 'Kore' : 'Zephyr')))
                    : (GEMINI_REALM_NARRATOR_MAP[reqRealm] || GEMINI_REALM_NARRATOR_MAP.default);
            } else if (reqGender === 'female' && GEMINI_VOICE_MAP[`female_${role}`]) {
                geminiVoice = GEMINI_VOICE_MAP[`female_${role}`];
            } else if (reqGender === 'male' && GEMINI_VOICE_MAP[`male_${role}`]) {
                geminiVoice = GEMINI_VOICE_MAP[`male_${role}`];
            } else if (GEMINI_VOICE_MAP[role]) {
                geminiVoice = GEMINI_VOICE_MAP[role];
            }

            function sendWav(buffer, isHit = false) {
                if (res.headersSent) return;
                res.writeHead(200, {
                    'Content-Type': 'audio/wav',
                    'Content-Length': buffer.length,
                    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
                    'X-TTS-Engine': 'gemini',
                    'X-TTS-Cache': isHit ? 'HIT' : 'MISS'
                });
                res.end(buffer);
            }

            const geminiCacheKey = `gemini:${geminiVoice}:${role}:${isJpText ? 'jp' : reqLang}:${emotion}:${geminiTag}:${directorNote}:${text}`;
            if (ttsAudioCache.has(geminiCacheKey)) {
                const hitBuf = ttsAudioCache.get(geminiCacheKey);
                ttsAudioCache.delete(geminiCacheKey);
                ttsAudioCache.set(geminiCacheKey, hitBuf);
                sendWav(hitBuf, true);
                return;
            }

            if (inFlightTTS.has(geminiCacheKey)) {
                inFlightTTS.get(geminiCacheKey)
                    .then(wavBuffer => sendWav(wavBuffer, false))
                    .catch(geminiErr => {
                        console.warn(`[TTS] Gemini Native Audio error: ${redactSecret(geminiErr.message, geminiApiKey)}`);
                        if (!isNarrator) {
                            console.info('[TTS] Non-narrator role falling back to Edge Neural:', geminiErr.message);
                            handleEdgeTTS(geminiErr.message);
                            return;
                        }
                        if (!res.headersSent) {
                            res.writeHead(502, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: redactSecret(geminiErr.message, geminiApiKey) }));
                        }
                    });
                return;
            }

            console.log(`[TTS] Gemini Native Request: voice=${geminiVoice}, role=${role}, emotion=${emotion || 'calm'}`);
            const synthPromise = synthesizeGeminiTTS({
                text,
                voice: geminiVoice,
                emotion,
                geminiTag,
                directorNote,
                role,
                apiKey: geminiApiKey,
                realm: reqRealm,
                lang: isJpText ? 'jp' : reqLang
            }).then(wavBuffer => {
                inFlightTTS.delete(geminiCacheKey);
                if (ttsAudioCache.has(geminiCacheKey)) {
                    const old = ttsAudioCache.get(geminiCacheKey);
                    if (old) ttsAudioCacheBytes -= old.length;
                    ttsAudioCache.delete(geminiCacheKey);
                }
                while (ttsAudioCache.size >= MAX_TTS_CACHE_ITEMS || (ttsAudioCacheBytes + wavBuffer.length > MAX_TTS_CACHE_BYTES && ttsAudioCache.size > 0)) {
                    const oldestKey = ttsAudioCache.keys().next().value;
                    const oldBuf = ttsAudioCache.get(oldestKey);
                    if (oldBuf) ttsAudioCacheBytes -= oldBuf.length;
                    ttsAudioCache.delete(oldestKey);
                }
                ttsAudioCache.set(geminiCacheKey, wavBuffer);
                ttsAudioCacheBytes += wavBuffer.length;
                return wavBuffer;
            }).catch(geminiErr => {
                inFlightTTS.delete(geminiCacheKey);
                throw geminiErr;
            });

            inFlightTTS.set(geminiCacheKey, synthPromise);

            synthPromise.then(wavBuffer => {
                sendWav(wavBuffer, false);
            }).catch(geminiErr => {
                console.warn(`[TTS] Gemini Native Audio error: ${redactSecret(geminiErr.message, geminiApiKey)}`);
                if (!isNarrator) {
                    console.info('[TTS] Non-narrator role falling back to Edge Neural:', geminiErr.message);
                    handleEdgeTTS(geminiErr.message);
                    return;
                }
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: redactSecret(geminiErr.message, geminiApiKey) }));
                }
            });
            return;
        }

        // --- ENGINE A: EXPRESSIVE EDGE NEURAL (ACCESSIBLE ONLY ON EXPLICIT REQUEST) ---
        handleEdgeTTS();

        function handleEdgeTTS(fallbackReason = null) {
            let voice = isJpText
                ? (reqGender === 'female' ? 'ja-JP-NanamiNeural' : 'ja-JP-KeitaNeural')
                : TTS_VOICE_MAP.default;
            if (!isJpText) {
                if (reqGender === 'female' && TTS_VOICE_MAP[`female_${role}`]) {
                    voice = TTS_VOICE_MAP[`female_${role}`];
                } else if (reqGender === 'male' && TTS_VOICE_MAP[`male_${role}`]) {
                    voice = TTS_VOICE_MAP[`male_${role}`];
                } else if (TTS_VOICE_MAP[role]) {
                    voice = TTS_VOICE_MAP[role];
                }
            }

            if (reqVoice) {
                const alias = reqVoice.toLowerCase();
                if (!isJpText && TTS_VOICE_MAP[alias]) {
                    voice = TTS_VOICE_MAP[alias];
                } else if ((reqVoice.startsWith('en-') || reqVoice.startsWith('ga-') || reqVoice.startsWith('ja-JP-')) && reqVoice.endsWith('Neural')) {
                    voice = reqVoice;
                }
            }

            // Emotion-tuned dramatic prosody
            let defaultPitch = '+0Hz';
            let defaultRate = '+0%';
            if (emotion === 'panicked' || emotion === 'fearful') {
                defaultPitch = '+3Hz';
                defaultRate = '+8%';
            } else if (emotion === 'serious' || emotion === 'grave') {
                defaultPitch = '-2Hz';
                defaultRate = '-4%';
            } else if (emotion === 'whispering' || emotion === 'stealth') {
                defaultPitch = '-1Hz';
                defaultRate = '-7%';
            } else if (emotion === 'cheerful' || emotion === 'warm') {
                defaultPitch = '+1Hz';
                defaultRate = '+3%';
            }

            const prosodyOptions = {
                pitch: reqPitch || defaultPitch,
                rate: reqRate || defaultRate,
                volume: '100'
            };

            const edgeCacheKey = `edge:${voice}:${prosodyOptions.pitch}:${prosodyOptions.rate}:${text}`;

            function sendEdgeMp3(buffer, isHit = false) {
                if (res.headersSent) return;
                const headers = {
                    'Content-Type': 'audio/mpeg',
                    'Content-Length': buffer.length,
                    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
                    'X-TTS-Engine': 'edge',
                    'X-TTS-Cache': isHit ? 'HIT' : 'MISS'
                };
                if (fallbackReason) {
                    headers['X-TTS-Fallback-Reason'] = String(fallbackReason).slice(0, 100);
                }
                res.writeHead(200, headers);
                res.end(buffer);
            }

            if (ttsAudioCache.has(edgeCacheKey)) {
                const hitBuf = ttsAudioCache.get(edgeCacheKey);
                ttsAudioCache.delete(edgeCacheKey);
                ttsAudioCache.set(edgeCacheKey, hitBuf);
                sendEdgeMp3(hitBuf, true);
                return;
            }

            if (inFlightTTS.has(edgeCacheKey)) {
                inFlightTTS.get(edgeCacheKey)
                    .then(buffer => sendEdgeMp3(buffer, false))
                    .catch(err => {
                        if (!res.headersSent) {
                            console.error('[TTS] Edge TTS fetch error:', err);
                            res.writeHead(502, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Internal error' }));
                        }
                    });
                return;
            }

            if (!MsEdgeTTS) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Neural TTS engine unavailable' }));
                return;
            }

            const edgePromise = new Promise((resolve, reject) => {
                getWarmEdgeTTS(voice)
                    .then(tts => {
                        const { audioStream } = tts.toStream(text, prosodyOptions);
                        const chunks = [];

                        audioStream.on('data', chunk => chunks.push(chunk));
                        audioStream.on('end', () => {
                            const buffer = Buffer.concat(chunks);
                            if (ttsAudioCache.has(edgeCacheKey)) {
                                const old = ttsAudioCache.get(edgeCacheKey);
                                if (old) ttsAudioCacheBytes -= old.length;
                                ttsAudioCache.delete(edgeCacheKey);
                            }
                            while (ttsAudioCache.size >= MAX_TTS_CACHE_ITEMS || (ttsAudioCacheBytes + buffer.length > MAX_TTS_CACHE_BYTES && ttsAudioCache.size > 0)) {
                                const oldestKey = ttsAudioCache.keys().next().value;
                                const oldBuf = ttsAudioCache.get(oldestKey);
                                if (oldBuf) ttsAudioCacheBytes -= oldBuf.length;
                                ttsAudioCache.delete(oldestKey);
                            }
                            ttsAudioCache.set(edgeCacheKey, buffer);
                            ttsAudioCacheBytes += buffer.length;
                            resolve(buffer);
                        });

                        audioStream.on('error', err => {
                            console.warn('[TTS] audioStream error:', err.message);
                            try { tts.close(); } catch (_) {}
                            edgeVoicePool.delete(voice);
                            reject(err);
                        });
                    })
                    .catch(reject);
            }).finally(() => {
                inFlightTTS.delete(edgeCacheKey);
            });

            inFlightTTS.set(edgeCacheKey, edgePromise);

            edgePromise
                .then(buffer => sendEdgeMp3(buffer, false))
                .catch(err => {
                    if (!fallbackReason && geminiApiKey && !res.headersSent) {
                        const fallbackVoice = GEMINI_VOICE_MAP[role] || GEMINI_VOICE_MAP.default;
                        return synthesizeGeminiTTS({
                            text,
                            voice: fallbackVoice,
                            emotion,
                            geminiTag,
                            directorNote,
                            role,
                            apiKey: geminiApiKey,
                            realm: reqRealm,
                            lang: isJpText ? 'jp' : reqLang
                        }).then(wavBuffer => {
                            if (!res.headersSent) {
                                res.writeHead(200, {
                                    'Content-Type': 'audio/wav',
                                    'Content-Length': wavBuffer.length,
                                    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
                                    'X-TTS-Engine': 'gemini',
                                    'X-TTS-Cache': 'MISS'
                                });
                                res.end(wavBuffer);
                            }
                        }).catch(() => {
                            if (!res.headersSent) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Internal error' }));
                            }
                        });
                    }
                    if (!res.headersSent) {
                        console.error('[TTS] Edge TTS error:', err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Internal error' }));
                    }
                });
        }
        return;
    }

    // REST: RYOD ("Roll Your Own Dungeon") Blueprint & AI Architect Endpoints
    if ((pathname === '/api/ryod/blueprint' || pathname === '/api/ryod/architect' || (pathname.startsWith('/api/saves/') && pathname.endsWith('/blueprint'))) && (req.method === 'GET' || req.method === 'POST')) {
        const RyodCompiler = require('./cartridges/ryod-compiler');
        const ryodSaveDirs = getSaveDirsForRealm('ryod');
        const ryodSaveDir = ryodSaveDirs[0] || path.resolve(__dirname, '../../variants/ryod/lib/save');
        if (!fs.existsSync(ryodSaveDir)) {
            try { fs.mkdirSync(ryodSaveDir, { recursive: true }); } catch (_) {}
        }
        const bpDir = path.join(ryodSaveDir, '.blueprints');
        if (!fs.existsSync(bpDir)) {
            try { fs.mkdirSync(bpDir, { recursive: true }); } catch (_) {}
        }

        if (req.method === 'GET') {
            let saveOrUser = urlObj.searchParams.get('user') || urlObj.searchParams.get('save') || '';
            if (pathname.startsWith('/api/saves/') && pathname.endsWith('/blueprint')) {
                saveOrUser = pathname.slice('/api/saves/'.length, -'/blueprint'.length);
            }
            const reqHash = urlObj.searchParams.get('hash') || '';
            const cleanName = sanitizeFilename(saveOrUser || '').replace(/\.sav$/i, '');
            let blueprint = null;

            if (reqHash) {
                const hashFile = path.join(bpDir, `${sanitizeFilename(reqHash)}.ryod.json`);
                if (fs.existsSync(hashFile)) {
                    try { blueprint = JSON.parse(fs.readFileSync(hashFile, 'utf8')); } catch (_) {}
                }
            }
            if (!blueprint && cleanName) {
                const sidecar1 = path.join(ryodSaveDir, `${cleanName}.ryod.json`);
                const sidecar2 = path.join(ryodSaveDir, `${cleanName}.sav.ryod.json`);
                const sidecarPath = fs.existsSync(sidecar1) ? sidecar1 : (fs.existsSync(sidecar2) ? sidecar2 : null);
                if (sidecarPath) {
                    try { blueprint = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')); } catch (_) {}
                }
                if (!blueprint) {
                    const savCand1 = path.join(ryodSaveDir, cleanName);
                    const savCand2 = path.join(ryodSaveDir, `${cleanName}.sav`);
                    const savPath = fs.existsSync(savCand1) ? savCand1 : (fs.existsSync(savCand2) ? savCand2 : null);
                    if (savPath) {
                        try {
                            const buf = fs.readFileSync(savPath);
                            if (buf.length > 36 && buf.toString('ascii', 0, 8) === 'SaveRYOD') {
                                const descLen = buf.readUInt32LE(28);
                                const jsonStr = buf.toString('utf8', 36 + descLen);
                                const parsed = JSON.parse(jsonStr);
                                if (parsed && parsed.ryodBlueprint) blueprint = parsed.ryodBlueprint;
                            }
                        } catch (_) {}
                    }
                }
            }
            if (!blueprint) {
                const getOwnerToken = String(req.headers['x-owner-token'] || urlObj.searchParams.get('token') || '').trim();
                blueprint = (cleanName ? ryodBlueprintStore('get', 'slot:' + cleanName.toLowerCase()) : null)
                    || (getOwnerToken ? ryodBlueprintStore('get', 'tok:' + getOwnerToken) : null);
            }
            if (!blueprint) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'RYOD blueprint not found' }));
                return;
            }
            const headers = { 'Content-Type': 'application/json; charset=utf-8' };
            if (urlObj.searchParams.get('download') === '1') {
                const dlSlug = String(blueprint.title || cleanName || 'custom_realm').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
                headers['Content-Disposition'] = `attachment; filename="${dlSlug}.ryod.json"`;
            }
            res.writeHead(200, headers);
            res.end(JSON.stringify({
                ok: true,
                ryodHash: blueprint.ryodHash,
                permalink: `?realm=ryod&bp=${RyodCompiler.encodePermalink(blueprint)}`,
                blueprint
            }, null, 2));
            return;
        }

        // POST /api/ryod/blueprint or /api/ryod/architect
        let body = '';
        req.on('data', chunk => {
            if (body.length < 256 * 1024) body += chunk;
        });
        req.on('end', () => {
            try {
                const payload = body ? JSON.parse(body) : {};
                let blueprint = null;
                if (pathname === '/api/ryod/architect') {
                    blueprint = RyodCompiler.rollCoherentBlueprint({
                        prompt: String(payload.prompt || '').slice(0, 300),
                        seed: payload.seed,
                        archetype: payload.archetype
                    });
                } else {
                    const rawCfg = payload.ryodConfig || payload.blueprint || payload;
                    blueprint = RyodCompiler.normalizeConfig(rawCfg);
                }
                const postOwnerToken = String(req.headers['x-owner-token'] || payload.ownerToken || urlObj.searchParams.get('token') || '').trim();
                const saveName = sanitizeFilename(String(payload.saveName || payload.user || '')).replace(/\.sav$/i, '');
                if (saveName && !isReservedFilename(saveName)) {
                    ryodBlueprintStore('set', 'slot:' + saveName.toLowerCase(), blueprint);
                    try {
                        fs.writeFileSync(path.join(ryodSaveDir, `${saveName}.ryod.json`), JSON.stringify(blueprint, null, 2), 'utf8');
                    } catch (_) {}
                }
                if (postOwnerToken) {
                    ryodBlueprintStore('set', 'tok:' + postOwnerToken, blueprint);
                }
                if (blueprint.ryodHash) {
                    try {
                        fs.writeFileSync(path.join(bpDir, `${sanitizeFilename(blueprint.ryodHash)}.ryod.json`), JSON.stringify(blueprint, null, 2), 'utf8');
                    } catch (_) {}
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    ok: true,
                    ryodHash: blueprint.ryodHash,
                    permalink: `?realm=ryod&bp=${RyodCompiler.encodePermalink(blueprint)}`,
                    blueprint
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Invalid RYOD payload: ' + err.message }));
            }
        });
        return;
    }

    // REST: Upload Gameplay Recording
    if ((pathname === '/api/recordings/upload' || pathname === '/api/demo/upload') && req.method === 'POST') {
        // D17: dev-only. Requires ENABLE_RECORDING_UPLOAD=1 AND a loopback client (E19).
        if (process.env.ENABLE_RECORDING_UPLOAD !== '1' || !isLoopbackRequest(req)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }
        let headerName = req.headers['x-recording-name'] || 'raw_gameplay.webm';
        let cleanName = sanitizeFilename(headerName);
        const recExt = path.extname(cleanName).toLowerCase();
        if (recExt !== '.webm' && recExt !== '.mp4') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid recording format. Only .webm and .mp4 allowed.' }));
            return;
        }
        const videoDir = path.join(WEB_DIR, 'assets', 'video');
        if (!fs.existsSync(videoDir)) {
            try { fs.mkdirSync(videoDir, { recursive: true }); } catch (_) {}
        }
        let destPath = path.join(videoDir, cleanName);
        if (fs.existsSync(destPath)) {
            const baseName = path.basename(cleanName, recExt);
            cleanName = `${baseName}-${Date.now()}${recExt}`;
            destPath = path.join(videoDir, cleanName);
        }
        const writeStream = fs.createWriteStream(destPath);
        let totalSize = 0;
        const maxLimit = 300 * 1024 * 1024; // 300 MB limit

        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > maxLimit) {
                writeStream.destroy();
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload too large' }));
                req.destroy();
                return;
            }
            writeStream.write(chunk);
        });

        req.on('end', () => {
            writeStream.end(() => {
                console.log(`[Recording] Uploaded gameplay recording: ${destPath} (${(totalSize / (1024 * 1024)).toFixed(2)} MB)`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'saved',
                    filename: cleanName,
                    sizeBytes: totalSize
                }));
            });
        });
        return;
    }

    // Static Web Client Files
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';
    if (['/demo', '\\demo', '/demo/', '\\demo\\', '/demo.html', '\\demo.html', '/watch', '\\watch', '/showcase', '\\showcase'].includes(safePath)) {
        res.writeHead(302, { 'Location': '/?demo=1', 'Cache-Control': 'no-cache' });
        res.end();
        return;
    }
    // Alias versioned walkthrough demo video URLs to canonical master video assets
    if (safePath.includes('angband3d_demo_') && safePath.endsWith('.mp4')) {
        safePath = '/assets/video/angband3d_demo.mp4';
    } else if (safePath.includes('angband3d_demo_') && safePath.endsWith('.webm')) {
        safePath = '/assets/video/angband3d_demo.webm';
    } else if (safePath.replace(/\\/g, '/') === '/assets/models/items/Mineral.obj') {
        safePath = '/assets/models/items/coin_pile_spill.glb';
    } else if (safePath.replace(/\\/g, '/') === '/assets/models/items/Dart.obj') {
        safePath = '/assets/models/items/bow.glb';
    } else if (safePath.replace(/\\/g, '/') === '/assets/models/monsters/Spider.obj') {
        safePath = '/assets/models/monsters/bestiary/giant_spider.glb';
    }
    const webRoot = path.resolve(WEB_DIR);
    const filePath = path.resolve(WEB_DIR, '.' + path.sep + safePath);

    // Guard against directory traversal attacks (strict boundary separator check, CWE-22)
    if (filePath !== webRoot && !filePath.startsWith(webRoot + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return;
    }

    // Guard against hidden dotfiles (.env, .git, etc.)
    const pathSegments = safePath.split(/[/\\]/);
    if (pathSegments.some(seg => seg.startsWith('.') && seg !== '.' && seg !== '..' && seg !== '.well-known')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return;
    }

    if (fs.existsSync(filePath)) {
        const fileStat = fs.statSync(filePath);
        if (fileStat.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.wasm': 'application/wasm',
                '.data': 'application/octet-stream',
                '.pck': 'application/octet-stream',
                '.css': 'text/css; charset=utf-8',
                '.woff2': 'font/woff2',
                '.woff': 'font/woff',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
                '.json': 'application/json; charset=utf-8',
                '.obj': 'text/plain; charset=utf-8',
                '.mtl': 'text/plain; charset=utf-8',
                '.gltf': 'model/gltf+json',
                '.glb': 'model/gltf-binary',
                '.bin': 'application/octet-stream',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.mp3': 'audio/mpeg',
                '.webm': 'video/webm',
                '.mp4': 'video/mp4',
                '.m4a': 'audio/mp4',
            };
            if (!mimeTypes[ext]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File type not supported' }));
                return;
            }
            const contentType = mimeTypes[ext];

            // HTTP Caching Strategy:
            // - HTML: public, max-age=0, must-revalidate (enables instant ETag 304 Not Modified validation on fresh loads)
            // - JS, CSS: public, max-age=0, must-revalidate (enables instant ETag 304 with 0 body bytes, saving up to 90% bandwidth)
            // - Video & Audio Streams (.mp4, .webm, .m4a): strictly no-cache, no-store so CDN proxies (Cloudflare)
            //   never cache or buffer full 200 responses, ensuring HTTP 206 Partial Content byte ranges stream cleanly
            // - Static Audio SFX (.mp3, .wav, .ogg): 24h caching
            // - 3D Models, Textures, Atlases, WASM: 24h immutable caching
            const posixPath = safePath.replace(/\\/g, '/');
            const hasVersionQuery = Boolean(req.url && /[?&]v=/.test(req.url));
            let cacheControl = 'no-cache, must-revalidate';
            if (posixPath === '/index.html' || posixPath === '/' || posixPath === '/sw.js' || posixPath === '/version.json' || ext === '.html') {
                cacheControl = 'no-store, no-cache, must-revalidate, max-age=0, no-transform';
            } else if (['.mp4', '.webm', '.m4a'].includes(ext)) {
                cacheControl = 'no-cache, no-store, must-revalidate';
            } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
                cacheControl = 'public, max-age=604800, no-transform';
            } else if (['.woff2', '.woff'].includes(ext)) {
                cacheControl = 'public, max-age=31536000, immutable';
            } else if (['.png', '.jpg', '.jpeg', '.webp', '.obj', '.mtl', '.gltf', '.glb', '.bin', '.wasm', '.data', '.pck'].includes(ext)) {
                cacheControl = hasVersionQuery ? 'public, max-age=604800, immutable' : 'public, max-age=3600, must-revalidate';
            } else if (['.js', '.css'].includes(ext)) {
                cacheControl = hasVersionQuery ? 'public, max-age=604800, immutable' : 'no-cache, must-revalidate';
            }

            const etag = `W/"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
            const headers = {
                'Content-Type': contentType,
                'Cache-Control': cacheControl,
                'ETag': etag,
                'Accept-Ranges': 'bytes',
                'Cross-Origin-Resource-Policy': 'cross-origin',
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'strict-origin-when-cross-origin',
                'X-Frame-Options': 'SAMEORIGIN',
            };

            // Cross-Origin Isolation headers required for WebAssembly multithreading/SharedArrayBuffer and Dedicated Workers under COEP
            if (posixPath === '/index.html' || posixPath === '/' || ext === '.wasm' || ext === '.data' || ext === '.pck' || ext === '.js') {
                headers['Cross-Origin-Opener-Policy'] = 'same-origin';
                headers['Cross-Origin-Embedder-Policy'] = 'credentialless';
            }

            // Handle Conditional ETag Revalidation (HTTP 304 Not Modified)
            // (Strictly bypass 304 for HTML shell, sw.js, and version.json to ensure immediate live updates)
            if (req.headers['if-none-match'] === etag && posixPath !== '/index.html' && posixPath !== '/' && posixPath !== '/sw.js' && posixPath !== '/version.json') {
                res.writeHead(304, headers);
                res.end();
                return;
            }

            // HTTP 206 Partial Content (Range Request) support for smooth video/audio seeking & scrubbing
            const range = req.headers.range;
            if (range && (ext === '.mp4' || ext === '.webm' || ext === '.mp3' || ext === '.wav' || ext === '.ogg' || ext === '.m4a')) {
                try {
                    const total = fileStat.size;
                    const matches = range.match(/bytes=(\d*)-(\d*)/);
                    if (matches) {
                        let start = matches[1] ? parseInt(matches[1], 10) : NaN;
                        let end = matches[2] ? parseInt(matches[2], 10) : NaN;

                        if (isNaN(start) && !isNaN(end)) {
                            // Suffix range: bytes=-500 (last 500 bytes)
                            start = Math.max(0, total - end);
                            end = total - 1;
                        } else if (!isNaN(start) && isNaN(end)) {
                            // Open-ended range: bytes=0- or bytes=1000-
                            end = total - 1;
                        }

                        if (!isNaN(start) && !isNaN(end) && start < total && start <= end) {
                            // Cloud Run (Google Frontend) enforces a strict 32MB payload limit on response bodies.
                            // Cap streaming chunks to 4MB (4,194,304 bytes) for instant seeking and proxy resilience.
                            const MAX_CHUNK = 4 * 1024 * 1024;
                            const actualEnd = Math.min(end, start + MAX_CHUNK - 1, total - 1);
                            const chunksize = (actualEnd - start) + 1;
                            const stream = fs.createReadStream(filePath, { start, end: actualEnd });
                            const rangeCacheControl = (ext === '.mp3' || ext === '.wav' || ext === '.ogg')
                                ? 'public, max-age=604800, no-transform'
                                : 'no-cache, no-store, must-revalidate';
                            res.writeHead(206, {
                                ...headers,
                                'Cache-Control': rangeCacheControl,
                                'Content-Range': `bytes ${start}-${actualEnd}/${total}`,
                                'Content-Length': chunksize,
                            });
                            stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
                            res.on('close', () => { stream.destroy(); });
                            stream.pipe(res);
                            return;
                        } else {
                            // Unsatisfiable range
                            res.writeHead(416, {
                                'Content-Range': `bytes */${total}`,
                                'Cache-Control': 'no-cache, no-store, must-revalidate'
                            });
                            res.end();
                            return;
                        }
                    }
                } catch (_) {}
            }

        // Brotli & Gzip compression for text & 3D scene/code payloads (.html, .js, .css, .json, .obj, .mtl, .svg, .gltf, .glb, .bin, .wasm, .data)
        const compressible = ['.html', '.js', '.css', '.json', '.obj', '.mtl', '.svg', '.gltf', '.glb', '.bin', '.wasm', '.data'].includes(ext);
        const acceptEncoding = req.headers['accept-encoding'] || '';

        if (compressible && acceptEncoding.includes('br') && typeof zlib.brotliCompress === 'function') {
            headers['Content-Encoding'] = 'br';
            try {
                const stat = fileStat;
                const cacheKey = `br:${filePath}:${stat.mtimeMs}`;
                const cached = staticGzipCache.get(cacheKey);
                if (cached) {
                    staticGzipCache.delete(cacheKey);
                    staticGzipCache.set(cacheKey, cached);
                    headers['Content-Length'] = cached.length;
                    res.writeHead(200, headers);
                    res.end(cached);
                    return;
                }
                fs.promises.readFile(filePath).then((rawBuffer) => {
                    zlib.brotliCompress(rawBuffer, {
                        params: {
                            [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
                            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: rawBuffer.length
                        }
                    }, (err, compressed) => {
                        if (!err && compressed) {
                            if (staticGzipCache.size >= MAX_STATIC_CACHE_ITEMS) {
                                const oldest = staticGzipCache.keys().next().value;
                                staticGzipCache.delete(oldest);
                            }
                            staticGzipCache.set(cacheKey, compressed);
                            headers['Content-Length'] = compressed.length;
                            res.writeHead(200, headers);
                            res.end(compressed);
                        } else {
                            res.writeHead(200, headers);
                            const fallbackStream = fs.createReadStream(filePath);
                            res.on('close', () => { fallbackStream.destroy(); });
                            fallbackStream.pipe(zlib.createBrotliCompress({
                                params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
                            })).pipe(res);
                        }
                    });
                }).catch(() => {
                    res.writeHead(200, headers);
                    const fallbackStream = fs.createReadStream(filePath);
                    res.on('close', () => { fallbackStream.destroy(); });
                    fallbackStream.pipe(zlib.createBrotliCompress({
                        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
                    })).pipe(res);
                });
                return;
            } catch (_) {
                res.writeHead(200, headers);
                const fallbackStream = fs.createReadStream(filePath);
                res.on('close', () => { fallbackStream.destroy(); });
                fallbackStream.pipe(zlib.createBrotliCompress({
                    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
                })).pipe(res);
                return;
            }
        } else if (compressible && acceptEncoding.includes('gzip')) {
            headers['Content-Encoding'] = 'gzip';
            try {
                const stat = fileStat;
                const cacheKey = `${filePath}:${stat.mtimeMs}`;
                const cached = staticGzipCache.get(cacheKey);
                if (cached) {
                    staticGzipCache.delete(cacheKey);
                    staticGzipCache.set(cacheKey, cached);
                    headers['Content-Length'] = cached.length;
                    res.writeHead(200, headers);
                    res.end(cached);
                    return;
                }
                fs.promises.readFile(filePath).then((rawBuffer) => {
                    zlib.gzip(rawBuffer, { level: 6 }, (err, gzipped) => {
                        if (!err && gzipped) {
                            if (staticGzipCache.size >= MAX_STATIC_CACHE_ITEMS) {
                                const oldest = staticGzipCache.keys().next().value;
                                staticGzipCache.delete(oldest);
                            }
                            staticGzipCache.set(cacheKey, gzipped);
                            headers['Content-Length'] = gzipped.length;
                            res.writeHead(200, headers);
                            res.end(gzipped);
                        } else {
                            res.writeHead(200, headers);
                            const fallbackStream = fs.createReadStream(filePath);
                            res.on('close', () => { fallbackStream.destroy(); });
                            fallbackStream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
                        }
                    });
                }).catch(() => {
                    res.writeHead(200, headers);
                    const fallbackStream = fs.createReadStream(filePath);
                    res.on('close', () => { fallbackStream.destroy(); });
                    fallbackStream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
                });
                return;
            } catch (_) {
                res.writeHead(200, headers);
                const fallbackStream = fs.createReadStream(filePath);
                res.on('close', () => { fallbackStream.destroy(); });
                fallbackStream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
                return;
            }
        } else if (compressible && acceptEncoding.includes('deflate')) {
            headers['Content-Encoding'] = 'deflate';
            res.writeHead(200, headers);
            const deflateStream = fs.createReadStream(filePath);
            res.on('close', () => { deflateStream.destroy(); });
            deflateStream.pipe(zlib.createDeflate()).pipe(res);
            return;
        }

        headers['Content-Length'] = fileStat.size;
        res.writeHead(200, headers);
        const stream = fs.createReadStream(filePath);
        stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
        res.on('close', () => { stream.destroy(); });
        stream.pipe(res);
        return;
    }
}

    // Return 404 for missing assets or files with extensions instead of returning HTML landing page
    if (pathname.startsWith('/assets/') || path.extname(pathname)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Asset not found: ${pathname}` }));
        return;
    }

    // Default Landing Page
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head>
    <title>Angband3D Cloud Realm</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c0d12; color: #dcdcdc; padding: 40px; text-align: center; }
        h1 { color: #e6a817; letter-spacing: 2px; }
        p { color: #8892b0; max-width: 600px; margin: 0 auto 20px; line-height: 1.6; }
        .btn { display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px; }
        .btn:hover { background: #1d4ed8; }
        .card { background: #151821; border: 1px solid #282f44; border-radius: 8px; padding: 20px; max-width: 600px; margin: 30px auto; text-align: left; }
        code { background: #090a0f; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
    </style>
</head>
<body>
    <h1>ANGBAND 3D</h1>
    <p>Authoritative Cloud Game Server & WebSocket Bridge.</p>
    <div class="card">
        <h3>Server Status: Online</h3>
        <p>WebSocket Endpoint: <code>ws://${req.headers.host || 'localhost:' + PORT}/ws</code></p>
    </div>
    <a href="/download/angband3d-standalone.zip" class="btn">Download Standalone Game (.zip)</a>
</body>
</html>`);
});

// WebSocket Server attached to HTTP server.
// maxPayload: client messages are tiny ("key left", JSON ping); 64 KB is generous (E22).
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });

server.on('upgrade', (request, socket, head) => {
    try { socket.setNoDelay(true); } catch (_) {}
    let fwdHost = '';
    if (process.env.TRUST_PROXY === '1' && request.headers['x-forwarded-host']) {
        const firstFwd = request.headers['x-forwarded-host'].split(',')[0].trim();
        const firstFwdHost = firstFwd.split(':')[0].toLowerCase();
        if (isAllowedForwardedHost(firstFwdHost)) {
            fwdHost = firstFwd;
        }
    }
    const host = fwdHost || request.headers.host || '';
    const urlObj = new URL(request.url, `http://${host || 'localhost'}`);
    // Cross-site WebSocket hijacking guard (E22): browsers always send Origin on WS upgrades.
    if (!isAllowedOrigin(request.headers.origin, host, request)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
    }
    if (urlObj.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

function broadcastQueueStatus() {
    // Purge any closed sockets
    for (let i = waitingQueue.length - 1; i >= 0; i--) {
        if (waitingQueue[i].ws.readyState !== 1 /* WebSocket.OPEN */) {
            waitingQueue.splice(i, 1);
        }
    }

    for (let i = 0; i < waitingQueue.length; i++) {
        const item = waitingQueue[i];
        try {
            if (item.ws.readyState === 1) {
                item.ws.send(JSON.stringify({
                    t: 'queue',
                    status: 'waiting',
                    position: i + 1,
                    totalInQueue: waitingQueue.length,
                    maxCapacity: MAX_CONCURRENT_GAMES,
                    activeCount: activeSessions.size
                }));
            }
        } catch (_) {}
    }
}

function processWaitingQueue() {
    while (waitingQueue.length > 0 && activeSessions.size < MAX_CONCURRENT_GAMES) {
        const nextClient = waitingQueue.shift();
        if (!nextClient) break;
        if (nextClient.ws.readyState === 1 /* WebSocket.OPEN */) {
            const waitSeconds = Math.round((Date.now() - nextClient.enqueueTime) / 1000);
            console.log(`[Queue] Admitting queued client ${nextClient.id} after ${waitSeconds}s wait. Active games: ${activeSessions.size + 1}/${MAX_CONCURRENT_GAMES}`);

            // Remove temporary queue listeners
            nextClient.ws.removeAllListeners('message');
            nextClient.ws.removeAllListeners('close');
            nextClient.ws.removeAllListeners('error');

            try {
                nextClient.ws.send(JSON.stringify({
                    t: 'queue',
                    status: 'admitted',
                    position: 0,
                    totalInQueue: waitingQueue.length
                }));
            } catch (_) {}

            spawnGameSession(nextClient.ws, nextClient.request);
        }
    }
    broadcastQueueStatus();
}

// Periodic queue status broadcast (every 5 seconds) to refresh position and keep connection alive
setInterval(() => {
    if (waitingQueue.length > 0) {
        broadcastQueueStatus();
    }
}, 5000).unref();

function ryodBlueprintStore(op, key, bp) {
    if (!ryodBlueprintStore._map) ryodBlueprintStore._map = new Map();
    const m = ryodBlueprintStore._map;
    if (!key) return null;
    if (op === 'set' && bp) {
        if (m.has(key)) m.delete(key);
        else if (m.size >= 128) m.delete(m.keys().next().value);
        m.set(key, bp);
        return bp;
    }
    return m.get(key) || null;
}

const STAGED_NATIVE_REALMS = new Set(['frogcomposband', 'silq', 'hengband']);

function isActiveSaveStagingEnabled(realm) {
    return STAGED_NATIVE_REALMS.has(realm) && Boolean(process.env.K_SERVICE || process.env.STAGE_ACTIVE_SAVES === '1');
}

async function copyFileIfPresentAsync(src, dest) {
    try {
        const st = await fs.promises.stat(src);
        if (st.isFile() && st.size > 0) {
            await fs.promises.copyFile(src, dest);
            return true;
        }
    } catch (_) {}
    return false;
}

async function hydrateSlotToDirAsync(slotName, sourceDirs, destDir) {
    if (!slotName || !destDir || !Array.isArray(sourceDirs)) return;
    await fs.promises.mkdir(destDir, { recursive: true }).catch(() => {});
    const resolvedDest = path.resolve(destDir);
    const stem = String(slotName).replace(/\.sav$/i, '');
    const candidates = slotName.endsWith('.sav') ? [slotName, stem] : [slotName, `${stem}.sav`];

    for (const sDir of sourceDirs) {
        if (!sDir) continue;
        const resolvedSrc = path.resolve(sDir);
        if (resolvedSrc === resolvedDest) continue;
        let matchedFile = null;
        for (const cand of candidates) {
            try {
                const st = await fs.promises.stat(path.join(resolvedSrc, cand));
                if (st.isFile() && st.size > 0) {
                    matchedFile = cand;
                    break;
                }
            } catch (_) {}
        }
        if (!matchedFile) continue;

        const destSlotPath = path.join(resolvedDest, matchedFile);
        let shouldCopyMain = true;
        try {
            const dstStat = await fs.promises.stat(destSlotPath);
            const srcStat = await fs.promises.stat(path.join(resolvedSrc, matchedFile));
            if (dstStat.isFile() && dstStat.size > 0 && dstStat.mtimeMs >= srcStat.mtimeMs) {
                shouldCopyMain = false;
            }
        } catch (_) {}

        if (shouldCopyMain) {
            await copyFileIfPresentAsync(path.join(resolvedSrc, matchedFile), destSlotPath);
        }
        const sidecarSuffixes = ['.owner.json', '.realm.json', '.living.sav', '.living.sav.realm.json', '.ironman', '.ryod.json'];
        for (const sfx of sidecarSuffixes) {
            const dstSidecar = destSlotPath + sfx;
            try {
                await fs.promises.access(dstSidecar);
            } catch (_) {
                await copyFileIfPresentAsync(path.join(resolvedSrc, matchedFile + sfx), dstSidecar);
            }
        }
        if (matchedFile !== stem) {
            const stemRyodDst = path.join(resolvedDest, `${stem}.ryod.json`);
            try {
                await fs.promises.access(stemRyodDst);
            } catch (_) {
                await copyFileIfPresentAsync(path.join(resolvedSrc, `${stem}.ryod.json`), stemRyodDst);
            }
        }
        const floorFiles = await listFloorSidecarsAsync(resolvedSrc, matchedFile);
        for (const f of floorFiles) {
            await copyFileIfPresentAsync(path.join(resolvedSrc, f), path.join(resolvedDest, f));
        }
        const livingFloorFiles = await listFloorSidecarsAsync(resolvedSrc, matchedFile + '.living.sav');
        for (const f of livingFloorFiles) {
            await copyFileIfPresentAsync(path.join(resolvedSrc, f), path.join(resolvedDest, f));
        }
        break;
    }
}

async function ensureRealmSidecarAsync(savePath, realm, isIronman) {
    if (!savePath || !realm) return;
    const sidecarPath = savePath + '.realm.json';
    let existing = {};
    try {
        existing = JSON.parse(await fs.promises.readFile(sidecarPath, 'utf8')) || {};
    } catch (_) {}
    const next = {
        ...existing,
        realm,
        stakes: isIronman ? 'ironman' : (existing.stakes || 'standard')
    };
    await fs.promises.writeFile(sidecarPath, JSON.stringify(next), 'utf8').catch(() => {});
}

function mirrorStagedSavesToPersistent(session, opts = null) {
    if (!session || !session.stageDir || !session.persistentSaveDir) return Promise.resolve(false);
    const cleanupStage = Boolean(opts && opts.cleanup);
    const runMirror = async () => {
        try {
            let stageFiles = [];
            try {
                stageFiles = await fs.promises.readdir(session.stageDir);
            } catch (_) {
                return false;
            }
            await fs.promises.mkdir(session.persistentSaveDir, { recursive: true }).catch(() => {});
            const slotCandidates = new Set([
                session.save,
                session.user,
                session.engineSavefile ? path.basename(session.engineSavefile) : null
            ].filter(Boolean));

            let mirroredPrimaryPath = null;
            for (const f of stageFiles) {
                if (!f || f === 'panic' || f.startsWith('.')) continue;
                const srcFile = path.join(session.stageDir, f);
                let st = null;
                try {
                    st = await fs.promises.stat(srcFile);
                } catch (_) {
                    continue;
                }
                if (!st.isFile() || st.size <= 0) continue;
                const isFloor = FLOOR_SIDECAR_RE.test(f);
                const isMainSlot = slotCandidates.has(f) || Array.from(slotCandidates).some(s => f === `${s}.sav` || f.startsWith(`${s}.`));
                if (!isFloor && !isMainSlot) continue;
                const dstFile = path.join(session.persistentSaveDir, f);
                await fs.promises.copyFile(srcFile, dstFile);
                if (!isFloor && !f.endsWith('.json') && !f.endsWith('.sav.living') && !mirroredPrimaryPath) {
                    mirroredPrimaryPath = dstFile;
                }
            }

            const canonicalSavePath = mirroredPrimaryPath || session.persistentSavePath || session.savePath;
            if (mirroredPrimaryPath) {
                await ensureRealmSidecarAsync(canonicalSavePath, session.realm, session.ironman);
                invalidateSavesCache(session.realm, path.basename(canonicalSavePath));
                if (!session.isDead && !session.ironman) {
                    await snapshotLivingSaveAsync(canonicalSavePath);
                }
            }
            return Boolean(mirroredPrimaryPath);
        } catch (err) {
            console.warn(`[StageMirror] Failed to mirror staged save for ${session.sessionId}: ${err.message}`);
            return false;
        } finally {
            if (cleanupStage && session.stageDir) {
                await fs.promises.rm(session.stageDir, { recursive: true, force: true }).catch(() => {});
            }
        }
    };
    session._mirrorChain = (session._mirrorChain || Promise.resolve()).then(runMirror, runMirror);
    return session._mirrorChain;
}

function scheduleStagedMirror(session, delayMs = 2000) {
    if (!session || !session.stageDir || session.isDead) return;
    if (session.stageMirrorTimer) clearTimeout(session.stageMirrorTimer);
    session.stageMirrorTimer = setTimeout(() => {
        session.stageMirrorTimer = null;
        if (!session.isDead) {
            mirrorStagedSavesToPersistent(session);
        }
    }, delayMs);
    if (session.stageMirrorTimer.unref) session.stageMirrorTimer.unref();
}

function stepQuickBirth(session, frameLine) {
    if (!session || !session.quickBirthActive) return;
    if (session.isDead || session.phase === 'play') {
        session.quickBirthActive = false;
        return;
    }
    if (!session.child || session.child.killed || session.child.exitCode !== null || !session.child.stdin || !session.child.stdin.writable) {
        session.quickBirthActive = false;
        return;
    }
    session.quickBirthSteps = (session.quickBirthSteps || 0) + 1;
    if (session.quickBirthSteps > 64) {
        session.quickBirthActive = false;
        return;
    }

    let promptText = '';
    let hasMore = false;
    let sig = '';
    if (frameLine && frameLine.startsWith('{"t":"frame"')) {
        try {
            const parsed = JSON.parse(frameLine);
            const ui = parsed.ui || {};
            const rawPrompt = typeof ui.prompt === 'string'
                ? ui.prompt
                : ((ui.prompt && typeof ui.prompt.text === 'string') ? ui.prompt.text : '');
            hasMore = Boolean(ui.more || (ui.prompt && ui.prompt.kind === 'more'));
            const rawRows = (parsed.term && (parsed.term.rows || parsed.term.lines)) || [];
            const rowsText = Array.isArray(rawRows)
                ? rawRows.map(r => (typeof r === 'string' ? r : ((r && r.g) || ''))).join(' ')
                : '';
            promptText = `${rawPrompt} ${rowsText}`;
            sig = `${ui.context || ''}|${hasMore ? 1 : 0}|${promptText.replace(/\s+/g, ' ').trim().slice(0, 240)}`;
        } catch (_) {}
    }

    if (sig && sig === session.quickBirthLastSig) {
        session.quickBirthSameSigCount = (session.quickBirthSameSigCount || 0) + 1;
    } else {
        session.quickBirthLastSig = sig;
        session.quickBirthSameSigCount = 0;
    }

    let nextCmd = 'key enter';
    const stall = session.quickBirthSameSigCount || 0;
    if (/ESC:終了|ESC:\s*exit/i.test(promptText)) {
        nextCmd = 'key Escape';
    } else if (stall > 0) {
        const mod = stall % 5;
        nextCmd = mod === 1 ? 'key space' : (mod === 2 ? 'key a' : (mod === 3 ? 'key y' : (mod === 4 ? 'key Escape' : 'key enter')));
    } else if (hasMore || /(-more-|-続く-|\(more\)|\[初期化終了\]|\[Press Any Key\]|Hit any key|何かキーを押して)/i.test(promptText)) {
        nextCmd = 'key space';
    } else if (/(\[y\/n\]|\(y\/n\)|よろしいですか|クイック・スタート|前回のキャラ|quick[\s-]*start|previous character)/i.test(promptText)) {
        nextCmd = 'key y';
    }

    setTimeout(() => {
        if (!session.quickBirthActive || session.isDead || session.phase === 'play') return;
        if (session.child && !session.child.killed && session.child.exitCode === null && session.child.stdin && session.child.stdin.writable) {
            try {
                session.child.stdin.write(nextCmd + '\n');
            } catch (_) {
                session.quickBirthActive = false;
            }
        }
    }, 8).unref();
}

function startQuickBirth(session) {
    if (!session || session.isDead) return;
    if (session.phase === 'play') {
        session.quickBirthActive = false;
        if (session.child && session.child.stdin && session.child.stdin.writable) {
            try { session.child.stdin.write('frame\n'); } catch (_) {}
        }
        return;
    }
    session.quickBirthActive = true;
    session.quickBirthSteps = 0;
    session.quickBirthLastSig = '';
    session.quickBirthSameSigCount = 0;
    if (session.lastFrame && session.lastFrame.startsWith('{"t":"frame"')) {
        stepQuickBirth(session, session.lastFrame);
    }
}

function gracefulSessionSaveAndExit(sessionId, byeMessage = null, packetType = 'bye', opts = null) {
    const session = activeSessions.get(sessionId);
    if (!session) return;
    const skipSave = Boolean(opts && opts.skipSave);

    if (session.disconnectTimer) {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = null;
    }
    if (session.autoSaveTimer) {
        clearTimeout(session.autoSaveTimer);
        session.autoSaveTimer = null;
    }
    if (session.stageMirrorTimer) {
        clearTimeout(session.stageMirrorTimer);
        session.stageMirrorTimer = null;
    }
    session.quickBirthActive = false;

    const { child, ws } = session;
    activeSessions.delete(sessionId);

    if (ws && ws.readyState === 1 /* OPEN */) {
        try {
            if (byeMessage) {
                ws.send(JSON.stringify({
                    t: packetType || 'bye',
                    reason: packetType === 'hibernated' ? 'idle' : undefined,
                    detail: byeMessage,
                    preservedSave: Boolean(!skipSave && !session.isDead && session.phase === 'play'),
                    saveSlot: session.save || session.user || null
                }));
            }
            ws.close();
        } catch (_) {}
    }

    if (child && !child.killed && child.exitCode === null) {
        try {
            if (skipSave) {
                if (child.stdin) { try { child.stdin.destroy(); } catch (_) {} }
                child.kill();
                setTimeout(() => { try { if (session.child && session.child.exitCode === null) session.child.kill('SIGKILL'); } catch (_) {} }, 1000).unref();
                invalidateSavesCache(session.realm, session.save);
            } else if (!session.isDead && session.phase === 'play' && child.stdin && child.stdin.writable) {
                console.log(`[Session] Saving authoritative state for session ${sessionId}...`);
                child.stdin.write('save\n');
                scheduleStagedMirror(session, 900);
                // Allow ample time (1200ms) for engine to flush savegame to disk without truncation
                setTimeout(() => {
                    try {
                        if (child && !child.killed && child.exitCode === null) {
                            child.stdin.write('quit\n');
                            child.stdin.end();
                            setTimeout(() => {
                                try {
                                    if (child && !child.killed && child.exitCode === null) {
                                        child.kill();
                                        setTimeout(() => { try { if (session.child && session.child.exitCode === null) session.child.kill('SIGKILL'); } catch (_) {} }, 2000).unref();
                                    }
                                    invalidateSavesCache(session.realm, session.save);
                                } catch (_) {}
                            }, 500);
                        }
                    } catch (_) {}
                }, 1200);
            } else {
                // If player is dead or in setup, NEVER write 'save\n'! Immediately quit to protect living save on disk.
                if (child.stdin && child.stdin.writable) {
                    try {
                        child.stdin.write('quit\n');
                        child.stdin.end();
                    } catch (_) {}
                }
                setTimeout(() => {
                    try {
                        if (child && !child.killed && child.exitCode === null) {
                            child.kill();
                            setTimeout(() => { try { if (session.child && session.child.exitCode === null) session.child.kill('SIGKILL'); } catch (_) {} }, 2000).unref();
                        }
                        invalidateSavesCache(session.realm, session.save);
                    } catch (_) {}
                }, 300);
            }
        } catch (_) {
            try {
                child.kill();
                setTimeout(() => { try { if (session.child && session.child.exitCode === null) session.child.kill('SIGKILL'); } catch (_) {} }, 2000).unref();
            } catch (_) {}
        }
    }

    setTimeout(processWaitingQueue, 50);
}

function handleSessionDisconnect(sessionId, socket = null) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    // Invariant: If a socket is provided, verify it is still the active socket for this session.
    // If the session was already re-attached to a new socket, ignore close/error events from the superseded socket!
    if (socket && session.ws && session.ws !== socket) {
        console.log(`[WebSocket] Ignoring close/error event from superseded socket for session ${sessionId}`);
        return;
    }

    session.ws = null;
    session.disconnectedAt = Date.now();

    // Check if the engine process is still running
    if (session.child && !session.child.killed && session.child.exitCode === null) {
        const graceMs = (session.phase === 'setup' || session.isDead) ? Math.min(DISCONNECT_GRACE_PERIOD_MS, 45000) : DISCONNECT_GRACE_PERIOD_MS;
        console.log(`[WebSocket] Client disconnected from session ${sessionId} (Phase: ${session.phase || 'unknown'}, isDead: ${session.isDead || false}). Keeping engine alive for ${Math.round(graceMs / 1000)}s grace period...`);

        // Only issue non-blocking save command if actively in gameplay and player is NOT dead
        if (!session.isDead && session.phase === 'play' && session.child.stdin && session.child.stdin.writable) {
            try {
                session.child.stdin.write('save\n');
                scheduleStagedMirror(session, 2000);
            } catch (err) {
                console.warn(`[Session] Failed to issue disconnect save for ${sessionId}: ${err.message}`);
            }
        }

        if (session.disconnectTimer) {
            clearTimeout(session.disconnectTimer);
        }
        session.disconnectTimer = setTimeout(() => {
            console.log(`[Session] Grace period expired for session ${sessionId}. Terminating...`);
            gracefulSessionSaveAndExit(sessionId, 'Session disconnected and saved.');
        }, graceMs);
    } else {
        // Child is already dead or exited
        activeSessions.delete(sessionId);
        setTimeout(processWaitingQueue, 50);
    }
}

function attachWebSocketToSession(session, ws) {
    // If there was an old WebSocket attached to this session, strip all listeners before closing
    // so its asynchronous close/error callbacks will NEVER touch this session or trigger handleSessionDisconnect!
    if (session.ws && session.ws !== ws) {
        const oldWs = session.ws;
        session.ws = null;
        oldWs.removeAllListeners('close');
        oldWs.removeAllListeners('error');
        oldWs.removeAllListeners('message');
        try { oldWs.close(); } catch (_) {}
    }

    session.ws = ws;
    if (session.disconnectTimer) {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = null;
    }
    session.disconnectedAt = null;

    let cmdCount = 0;
    let cmdWindowStart = Date.now();
    const MAX_CMDS_PER_SEC = 60; // Max 60 inputs/sec (burst tolerance, guards against spam bots and buffer bloat)

    // Relay guard (WS1.2). Exactly one bridge command per WS message, bounded, allowlisted.
    // Verbs derived from client senders (network.js sendKey/sendCommand, app.js, input.js,
    // local_bridge.js) AND bridge dispatchers: key <spec> | keys <seq> | frame | map | save | ping | quickbirth.
    // 'quit' stays out on purpose: the JSON {t:'quit'} path saves gracefully first.
    // LESSON L1: never shrink this list without grepping every sender ('save' was nearly dropped once).
    const ENGINE_VERBS = new Set(['key', 'keys', 'frame', 'map', 'save', 'ping', 'quickbirth']);
    const CANONICAL_KEY_MAP = {
        escape: 'escape',
        esc: 'escape',
        enter: 'enter',
        return: 'return',
        tab: 'tab',
        space: 'space',
        spacebar: 'space',
        backspace: 'backspace',
        delete: 'delete',
        del: 'delete',
        arrowleft: 'left',
        left: 'left',
        arrowright: 'right',
        right: 'right',
        arrowup: 'up',
        up: 'up',
        arrowdown: 'down',
        down: 'down',
        home: 'home',
        end: 'end',
        pageup: 'pageup',
        pgup: 'pageup',
        pagedown: 'pagedown',
        pgdn: 'pagedown'
    };
    const sanitizeEngineCommand = (raw) => {
        if (typeof raw !== 'string') return null;
        if (!raw || raw.length > 64 || raw.includes('\0')) return null;

        const trimmedStart = raw.trimStart();
        if (trimmedStart.startsWith('key ')) {
            let payload = trimmedStart.slice(4);
            if (payload === ' ') {
                payload = 'space';
            } else if (payload === '\t') {
                payload = 'tab';
            } else if (payload === '\n' || payload === '\r' || payload === '\r\n') {
                payload = 'enter';
            } else {
                payload = payload.trim();
            }
            if (!payload || /[\r\n\0]/.test(payload)) return null;

            if (payload.length === 1) {
                return `key ${payload}`;
            }

            const lower = payload.toLowerCase();
            if (CANONICAL_KEY_MAP[lower]) {
                return `key ${CANONICAL_KEY_MAP[lower]}`;
            }

            if (/^C-[a-zA-Z0-9_[\]\\^@]$/.test(payload)) {
                return `key ${payload}`;
            }
            const cMatch = payload.match(/^c-([a-zA-Z0-9_[\]\\^@])$/);
            if (cMatch) {
                return `key C-${cMatch[1]}`;
            }

            return null; // Reject unknown multi-char spec (e.g. "key Foo")
        }

        const cmd = raw.trim();
        if (!cmd || /[\r\n\0]/.test(cmd)) return null;
        const sp = cmd.indexOf(' ');
        const verb = sp === -1 ? cmd : cmd.slice(0, sp);
        if (!ENGINE_VERBS.has(verb)) return null;
        if ((verb === 'key' || verb === 'keys') && sp === -1) return null;
        if (verb === 'keys' && cmd.length > 5 + 16) return null; // client only sends "keys .<dir>"
        return cmd;
    };

    ws.on('message', message => {
        const str = message.toString();
        // Respond immediately to latency heartbeat pings WITHOUT resetting session.lastActivityTime!
        // Otherwise open idle browser tabs defeat IDLE_TIMEOUT_MS and pin Cloud Run instances 24/7.
        if (str.startsWith('{')) {
            try {
                const parsed = JSON.parse(str);
                const msgType = parsed.t || parsed.type;
                if (msgType === 'ping') {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ t: 'pong', time: parsed.time }));
                    }
                    return;
                }
                session.lastActivityTime = Date.now();
                if (msgType === 'quickbirth') {
                    startQuickBirth(session);
                    return;
                }
                if (msgType === 'sync_client_state') {
                    if (Array.isArray(parsed.commands) && session.child && session.child.stdin && session.child.stdin.writable) {
                        const replayCmds = parsed.commands.slice(0, 128);
                        let replayed = 0;
                        for (const rawCmd of replayCmds) {
                            const safeCmd = sanitizeEngineCommand(rawCmd);
                            if (safeCmd && safeCmd !== 'quickbirth') {
                                session.child.stdin.write(safeCmd + '\n');
                                replayed++;
                            }
                        }
                        session.inputSeq = (session.inputSeq || 0) + replayed;
                        if (!session.isDead && session.phase === 'play') {
                            session.child.stdin.write('save\n');
                            session.lastSavedTurn = session.currentTurn || 0;
                            session.lastSavedInputSeq = session.inputSeq || 0;
                            invalidateSavesCache(session.realm, session.save);
                            scheduleStagedMirror(session, 2000);
                        }
                        session.child.stdin.write('frame\n');
                        if (ws.readyState === ws.OPEN) {
                            ws.send(JSON.stringify({
                                t: 'ok',
                                detail: 'client_state_synced',
                                replayed,
                                saveSlot: session.save || session.user || null
                            }));
                        }
                    }
                    return;
                }
                if (msgType === 'quit' || msgType === 'cancel') {
                    console.log(`[WebSocket] Client explicitly ended session ${session.sessionId}`);
                    gracefulSessionSaveAndExit(session.sessionId, 'Client requested exit.');
                    return;
                }
            } catch (_) {}
        }

        // Real player interaction resets the 15-minute idle reaper timer
        session.lastActivityTime = Date.now();

        // Rate limit commands to protect engine stdio pipe
        const now = Date.now();
        if (now - cmdWindowStart > 1000) {
            cmdWindowStart = now;
            cmdCount = 0;
        }
        cmdCount++;
        if (cmdCount > MAX_CMDS_PER_SEC) {
            return;
        }

        // Client sends command line e.g. "key left", "frame", or "quickbirth"
        const safe = sanitizeEngineCommand(str);
        if (!safe) return; // silently drop: never forward unknown, JSON, or multi-line input to engine stdin
        if (safe === 'quickbirth') {
            startQuickBirth(session);
            return;
        }
        // Manual key input cancels server-side quickbirth auto-advance so user retains full control
        if (session.quickBirthActive && (safe.startsWith('key ') || safe.startsWith('keys '))) {
            session.quickBirthActive = false;
        }
        if (session.child && session.child.stdin && session.child.stdin.writable) {
            session.child.stdin.write(safe + '\n');
            if (safe === 'save') {
                session.lastSavedTurn = session.currentTurn || 0;
                session.lastSavedInputSeq = session.inputSeq || 0;
                invalidateSavesCache(session.realm, session.save);
                scheduleStagedMirror(session, 2000);
            }
            if (!session.isDead && session.phase === 'play' && (safe.startsWith('key ') || safe.startsWith('keys '))) {
                session.inputSeq = (session.inputSeq || 0) + 1;
                session.commandsSinceSave = (session.commandsSinceSave || 0) + 1;
                if (session.autoSaveTimer) clearTimeout(session.autoSaveTimer);
                if (session.commandsSinceSave >= 8) {
                    session.autoSaveTimer = setTimeout(() => {
                        session.autoSaveTimer = null;
                        if (!session.isDead && session.phase === 'play' && session.child && !session.child.killed && session.child.exitCode === null && session.child.stdin && session.child.stdin.writable) {
                            session.commandsSinceSave = 0;
                            try {
                                session.child.stdin.write('save\n');
                                session.lastSavedTurn = session.currentTurn || 0;
                                session.lastSavedInputSeq = session.inputSeq || 0;
                                invalidateSavesCache(session.realm, session.save);
                                scheduleStagedMirror(session, 2000);
                            } catch (_) {}
                        }
                    }, 3500).unref();
                }
            }
        }
    });

    ws.on('close', () => {
        handleSessionDisconnect(session.sessionId, ws);
    });

    ws.on('error', err => {
        console.error(`[WebSocket Error] Session ${session.sessionId}: ${err.message}`);
        handleSessionDisconnect(session.sessionId, ws);
    });
}

async function spawnGameSession(ws, request) {
    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const rawRealm = urlObj.searchParams.get('realm') || 'angband';
    const realm = rawRealm.replace(/[^a-zA-Z0-9_-]/g, '') || 'angband';
    const rawUser = urlObj.searchParams.get('user') || urlObj.searchParams.get('char') || null;
    const rawSave = urlObj.searchParams.get('save') || null;
    let user = rawUser ? rawUser.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) : null;
    if (!user && !rawSave) {
        user = buildDefaultSaveSlotName(realm, 'Hero');
    }
    const rawLang = urlObj.searchParams.get('lang') || 'en';
    const lang = rawLang.toLowerCase();
    const engineInfo = resolveRealmEngine(realm, lang);

    if (!engineInfo.installed || !engineInfo.exe || !fs.existsSync(engineInfo.exe)) {
        console.error(`[Session Rejected] Realm "${realm}" (${engineInfo.name || realm}) binary is not installed on this host.`);
        try {
            ws.send(JSON.stringify({
                t: 'error',
                message: `Engine binary for realm "${engineInfo.name || realm}" is not installed on this server.`
            }));
            ws.send(JSON.stringify({
                t: 'bye',
                detail: `Realm "${engineInfo.name || realm}" is not installed on this host.`
            }));
            ws.close();
        } catch (_) {}
        return;
    }

    const resolvedSave = rawSave ? resolveSavefileName(rawSave, realm) : null;
    const save = resolvedSave || (rawSave ? rawSave.replace(/[^a-zA-Z0-9_.-]/g, '') : null);

    const isNew = urlObj.searchParams.get('new') === '1' || urlObj.searchParams.get('reroll') === '1';
    const isCustomBirth = urlObj.searchParams.get('custom') === '1';
    const wantQuickBirth = urlObj.searchParams.get('quickbirth') === '1';
    const persistentSaveDir = engineInfo.saveDir || SAVE_DIR;
    const allRealmSaveDirs = getSaveDirsForRealm(realm);
    let targetSlot = save || user || 'Adventurer';

    // Hydrate existing save slot + sidecars from fallback directories into primary persistentSaveDir if needed
    await hydrateSlotToDirAsync(targetSlot, allRealmSaveDirs, persistentSaveDir);
    let savePath = path.join(persistentSaveDir, targetSlot);

    let ownerToken = undefined;
    const reqToken = extractWsOwnerToken(request, urlObj);

    // Check ownership whenever loading OR overwriting an existing save file on disk.
    // If creating a new character with no explicit save target (e.g. random hero name collision),
    // allocate a fresh non-colliding slot instead of failing with an Engine Error.
    let saveExists = false;
    try {
        saveExists = (await fs.promises.stat(savePath)).isFile();
    } catch (_) {}
    if (saveExists) {
        if (!(await verifyOwnerTokenAsync(savePath, reqToken))) {
            if (isNew && !rawSave) {
                const maxBase = realm === 'hengband' ? 10 : 20;
                const baseUser = (user || 'Adventurer').replace(/_[0-9a-z]+$/i, '').slice(0, maxBase) || 'Hero';
                for (let i = 0; i < 20; i++) {
                    const candidate = `${baseUser}_${crypto.randomInt(100, 1000)}`;
                    const candPath = path.join(persistentSaveDir, candidate);
                    if (!fs.existsSync(candPath)) {
                        user = candidate;
                        targetSlot = candidate;
                        savePath = candPath;
                        break;
                    }
                }
            } else {
                ws.send(JSON.stringify({ t: 'error', message: 'Forbidden: invalid owner token for existing character' }));
                ws.send(JSON.stringify({ t: 'bye', detail: 'Invalid owner token' }));
                ws.close(4403, 'Invalid owner token');
                return;
            }
        }
    }

    // Generate token if it's a new character, or if it's a legacy save we are claiming (TOFU)
    if (isNew || !fs.existsSync(getOwnerTokenPath(savePath))) {
        ownerToken = await createOwnerTokenAsync(savePath, reqToken);
    }

    const sessionId = crypto.randomUUID();
    ws.send(JSON.stringify({
        t: 'hello',
        sessionId,
        version: '1.0.0',
        realm,
        saveSlot: targetSlot,
        engineName: engineInfo.name || engineInfo.targetName,
        isFallback: false,
        ownerToken: ownerToken
    }));

    // Stage active C/C++ saves in local tmpfs/overlayfs on Cloud Run to eliminate GCS FUSE latency & partial writes
    let stageDir = null;
    let activeEngineSaveDir = persistentSaveDir;
    if (isActiveSaveStagingEnabled(realm)) {
        stageDir = path.join(os.tmpdir(), 'angband3d-active', sessionId);
        await fs.promises.mkdir(path.join(stageDir, 'panic'), { recursive: true }).catch(() => {});
        if (!isNew) {
            await hydrateSlotToDirAsync(targetSlot, [persistentSaveDir, ...allRealmSaveDirs], stageDir);
        }
        activeEngineSaveDir = stageDir;
    }

    const frontendSwitch = engineInfo.cli?.frontend_switch || '-mbridge';
    const args = [frontendSwitch];
    if (activeEngineSaveDir && engineInfo.cli?.save_dir_switch) {
        args.push(engineInfo.cli.save_dir_switch.replace('{path}', activeEngineSaveDir));
    }
    if (activeEngineSaveDir && engineInfo.cli?.panic_dir_switch) {
        args.push(engineInfo.cli.panic_dir_switch.replace('{path}', path.join(activeEngineSaveDir, 'panic')));
    }
    const saveTokenFormat = engineInfo.cli?.save_token_format || '-u{name}';
    if (save) {
        args.push(saveTokenFormat.replace('{name}', targetSlot));
    } else if (user) {
        args.push(saveTokenFormat.replace('{name}', targetSlot));
    }
    if (isNew) {
        args.push(engineInfo.cli?.new_char_switch || '-n');
        if (isCustomBirth && (realm === 'dcss' || realm === 'brogue' || realm === 'rogue' || realm === 'nethack' || realm === 'ryod')) {
            args.push('-c');
        } else if (!isCustomBirth && realm === 'nethack') {
            args.push('-r');
        }
    }

    let ryodConfigEnvJson = '';
    if (realm === 'ryod') {
        try {
            const RyodCompiler = require('./cartridges/ryod-compiler');
            const bpParam = urlObj.searchParams.get('bp');
            let bp = null;
            if (bpParam) {
                const decoded = RyodCompiler.decodePermalink(bpParam);
                if (decoded) bp = RyodCompiler.normalizeConfig(decoded);
            }
            if (!bp && persistentSaveDir && rawUser) {
                const rawSidecar = path.join(persistentSaveDir, `${rawUser.replace(/[^a-zA-Z0-9_-]/g, '')}.ryod.json`);
                if (fs.existsSync(rawSidecar)) {
                    bp = JSON.parse(fs.readFileSync(rawSidecar, 'utf8'));
                }
            }
            if (!bp) {
                const slotKey = targetSlot ? String(targetSlot).replace(/\.sav$/i, '').toLowerCase() : '';
                const userKey = rawUser ? String(rawUser).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() : '';
                bp = (slotKey ? ryodBlueprintStore('get', 'slot:' + slotKey) : null)
                    || (userKey ? ryodBlueprintStore('get', 'slot:' + userKey) : null)
                    || (reqToken ? ryodBlueprintStore('get', 'tok:' + reqToken) : null)
                    || (ownerToken ? ryodBlueprintStore('get', 'tok:' + ownerToken) : null);
            }
            if (bp) {
                ryodConfigEnvJson = JSON.stringify(bp);
                if (ownerToken) ryodBlueprintStore('set', 'tok:' + ownerToken, bp);
                if (isNew && persistentSaveDir && targetSlot) {
                    const slotSidecar = path.join(persistentSaveDir, `${targetSlot.replace(/\.sav$/i, '')}.ryod.json`);
                    try { fs.writeFileSync(slotSidecar, JSON.stringify(bp, null, 2), 'utf8'); } catch (_) {}
                }
            }
        } catch (_) {}
    }

    const engineDir = engineInfo.cwd;

    // If starting a fresh character, purge any stale panic save files so the engine starts cleanly without prompts
    if (isNew) {
        const panicDirs = [
            path.join(persistentSaveDir, 'panic'),
            stageDir ? path.join(stageDir, 'panic') : null,
            path.join(engineDir, 'lib/user/panic'),
            path.join(engineDir, 'lib/save/panic')
        ].filter(Boolean);
        for (const pDir of panicDirs) {
            try {
                if (fs.existsSync(pDir)) {
                    const files = fs.readdirSync(pDir);
                    for (const f of files) {
                        if (f === targetSlot || f.startsWith(targetSlot + '.')) {
                            try { fs.unlinkSync(path.join(pDir, f)); } catch (_) {}
                        }
                    }
                }
            } catch (_) {}
        }
    }
    const isIronman = urlObj.searchParams.get('ironman') === '1';
    if (savePath) {
        try {
            if (isIronman) {
                await fs.promises.writeFile(savePath + '.ironman', '1', 'utf8');
                await fs.promises.unlink(savePath + '.living.sav').catch(() => {});
            } else if (isNew) {
                saveVault.clearSaveDead(savePath);
                await fs.promises.unlink(savePath + '.ironman').catch(() => {});
                await fs.promises.unlink(savePath + '.living.sav').catch(() => {});
            }
            await ensureRealmSidecarAsync(savePath, realm, isIronman);
        } catch (_) {}
    }
    let child = null;
    let spawnError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const childEnv = {
                ...process.env,
                ...engineInfo.env,
                SAVE_DIR: activeEngineSaveDir || SAVE_DIR,
                LANG: process.env.LANG || 'C.UTF-8',
                LC_ALL: process.env.LC_ALL || 'C.UTF-8',
                LC_CTYPE: 'C.UTF-8',
                TERM: 'xterm-256color',
                HOME: process.env.HOME || '/app',
                ANGBAND3D_IRONMAN: isIronman ? '1' : '0',
            };
            if (ryodConfigEnvJson) {
                childEnv.RYOD_CONFIG_JSON = ryodConfigEnvJson;
            }
            delete childEnv.GEMINI_API_KEY;
            const isNodeBridge = String(engineInfo.exe || '').endsWith('.js');
            const spawnExe = isNodeBridge ? process.execPath : engineInfo.exe;
            const spawnArgs = isNodeBridge ? [engineInfo.exe, ...args] : args;
            child = spawn(spawnExe, spawnArgs, {
                cwd: engineDir,
                env: childEnv,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            spawnError = null;
            break;
        } catch (err) {
            spawnError = err;
            if ((err.code === 'EBUSY' || err.code === 'ETXTBSY') && attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 150));
                continue;
            }
            break;
        }
    }

    if (!child || spawnError) {
        console.error(`[Session Spawn Failed] Unable to spawn engine "${engineInfo.exe}": ${spawnError?.message}`);
        if (stageDir) {
            fs.promises.rm(stageDir, { recursive: true, force: true }).catch(() => {});
        }
        try {
            ws.send(JSON.stringify({
                t: 'error',
                message: `Failed to launch game engine (${spawnError?.code || 'ERROR'})`
            }));
            ws.close();
        } catch (_) {}
        return;
    }

    const session = {
        sessionId,
        child,
        ws,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        user: targetSlot,
        save: targetSlot,
        savePath,
        persistentSaveDir,
        persistentSavePath: savePath,
        stageDir,
        stageMirrorTimer: null,
        realm,
        engineInfo,
        phase: 'setup',
        hasSavedInitialPlay: false,
        commandsSinceSave: 0,
        currentTurn: 0,
        lastSavedTurn: -1,
        inputSeq: 0,
        lastSavedInputSeq: 0,
        lastDepth: null,
        isDead: false,
        ironman: isIronman,
        quickBirthActive: wantQuickBirth,
        quickBirthSteps: 0,
        quickBirthLastSig: '',
        quickBirthSameSigCount: 0,
        disconnectedAt: null,
        disconnectTimer: null,
        lastFrame: null,
        clientIp: clientIp(request)
    };

    activeSessions.set(sessionId, session);

    let lineBuffer = '';
    const stdoutDecoder = new TextDecoder('utf-8');

    child.stdout.on('data', chunk => {
        lineBuffer += stdoutDecoder.decode(chunk, { stream: true });
        if (lineBuffer.length > 524288 && lineBuffer.indexOf('\n') === -1) { lineBuffer = ''; return; }
        let startIdx = 0;
        let newlineIdx;
        while ((newlineIdx = lineBuffer.indexOf('\n', startIdx)) !== -1) {
            let line = lineBuffer.substring(startIdx, newlineIdx).trim(); // let: realm tag is spliced in below (E1 fix)
            startIdx = newlineIdx + 1;
            if (line.length > 0) {
                if (line.startsWith('{"t":"frame"')) {
                    if (session.realm) {
                        if (line.startsWith('{"t":"frame",')) {
                            line = '{"t":"frame","realm":"' + session.realm + '",' + line.substring('{"t":"frame",'.length);
                        } else if (line.startsWith('{"t":"frame"}')) {
                            line = '{"t":"frame","realm":"' + session.realm + '"}';
                        }
                    }
                    session.lastFrame = line;
                    try {
                        const headSlice = line.slice(0, 420);
                        const prevPhase = session.phase;
                        const phaseMatch = headSlice.match(/"phase":"([^"]+)"/);
                        if (phaseMatch) session.phase = phaseMatch[1];
                        const turnMatch = headSlice.match(/"turn":(\d+)/);
                        if (turnMatch) session.currentTurn = parseInt(turnMatch[1], 10);
                        const isDeathFrame =
                            headSlice.includes('"context":"death"') ||
                            line.includes('"dead":true') ||
                            /"hp":(?:0|-\d+),"(?:max_hp|hp_max)":[1-9]/.test(line.slice(0, 1400));
                        if (isDeathFrame) {
                            session.isDead = true;
                            session.quickBirthActive = false;
                            if (session.autoSaveTimer) {
                                clearTimeout(session.autoSaveTimer);
                                session.autoSaveTimer = null;
                            }
                            if (session.stageMirrorTimer) {
                                clearTimeout(session.stageMirrorTimer);
                                session.stageMirrorTimer = null;
                            }
                            if (session.savePath) {
                                saveVault.markSaveDeadAsync(session.savePath, session.realm);
                                if (session.ironman) {
                                    fs.promises.unlink(session.savePath + '.living.sav').catch(() => {});
                                }
                            }
                        }
                        const depthMatch = headSlice.match(/"depth":(-?\d+)/);
                        const curDepth = depthMatch ? parseInt(depthMatch[1], 10) : null;
                        const depthChanged = curDepth !== null && session.lastDepth !== null && curDepth !== session.lastDepth;
                        if (curDepth !== null) session.lastDepth = curDepth;

                        if (session.quickBirthActive) {
                            if (session.phase === 'play' || session.isDead) {
                                session.quickBirthActive = false;
                            } else {
                                stepQuickBirth(session, line);
                                if (session.quickBirthSteps > 1) {
                                    continue;
                                }
                            }
                        }

                        // Auto-flush save immediately when character finishes birth and enters 'play', or on dungeon depth change
                        if (!session.isDead && session.phase === 'play' && (!session.hasSavedInitialPlay || prevPhase !== 'play' || depthChanged)) {
                            session.hasSavedInitialPlay = true;
                            setTimeout(() => {
                                try {
                                    if (!session.isDead && session.phase === 'play' && session.child && !session.child.killed && session.child.exitCode === null && session.child.stdin && session.child.stdin.writable) {
                                        session.child.stdin.write('save\n');
                                        session.lastSavedTurn = session.currentTurn || 0;
                                        session.lastSavedInputSeq = session.inputSeq || 0;
                                        invalidateSavesCache(session.realm, session.save);
                                        if (session.stageDir) {
                                            scheduleStagedMirror(session, 900);
                                        } else {
                                            setTimeout(() => {
                                                if (!session.isDead && !session.ironman && session.savePath) {
                                                    ensureRealmSidecarAsync(session.savePath, session.realm, session.ironman)
                                                        .then(() => snapshotLivingSaveAsync(session.savePath))
                                                        .catch(() => {});
                                                }
                                            }, 250).unref();
                                        }
                                    }
                                } catch (_) {}
                            }, 180).unref();
                        }
                    } catch (_) {}
                }
                if (line.startsWith('{"t":"hello"')) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.savefile) session.engineSavefile = parsed.savefile;
                        parsed.sessionId = session.sessionId;
                        parsed.realm = session.realm || 'angband';
                        parsed.saveSlot = session.save || session.user || targetSlot;
                        if (session.engineInfo) {
                            parsed.engineName = session.engineInfo.name || session.engineInfo.targetName;
                            parsed.isFallback = !!session.engineInfo.isFallback;
                            if (session.engineInfo.fallbackNotice) {
                                parsed.fallbackNotice = session.engineInfo.fallbackNotice;
                            }
                        }
                        const augmentedLine = JSON.stringify(parsed);
                        session.lastFrame = augmentedLine;
                        if (session.ws && session.ws.readyState === 1 /* OPEN */) {
                            session.ws.send(augmentedLine);
                        }
                        continue;
                    } catch (_) {}
                }
                if (session.stageDir && !session.isDead && line.includes('"t":"ok"') && line.includes('"saved"')) {
                    scheduleStagedMirror(session, 200);
                }
                if (session.ws && session.ws.readyState === 1 /* OPEN */) {
                    // Backpressure Guard: If socket has >64KB queued in OS/Node buffer, drop intermediate visual frames
                    // to prevent latency delay and memory bloat for slow network connections.
                    if (line.startsWith('{"t":"frame"') && session.ws.bufferedAmount > 65536) {
                        continue;
                    }
                    session.ws.send(line);
                }
            }
        }
        if (startIdx > 0) lineBuffer = lineBuffer.substring(startIdx);
    });

    child.stderr.on('data', chunk => {
        console.error(`[Engine Stderr] ${chunk.toString('utf8').trim()}`);
    });

    child.on('error', err => {
        console.error(`[Engine Process Error] Session ${sessionId}: ${err.message}`);
        if (session.disconnectTimer) {
            clearTimeout(session.disconnectTimer);
            session.disconnectTimer = null;
        }
        if (session.stageMirrorTimer) {
            clearTimeout(session.stageMirrorTimer);
            session.stageMirrorTimer = null;
        }
        activeSessions.delete(sessionId);
        if (session.stageDir) {
            mirrorStagedSavesToPersistent(session, { cleanup: true });
        }
        if (session.ws && session.ws.readyState === 1) {
            session.ws.send(JSON.stringify({ t: 'bye', detail: err.message }));
            session.ws.close();
        }
        setTimeout(processWaitingQueue, 50);
    });

    child.on('close', (code, signal) => {
        console.log(`[Engine Process Exit] Session ${sessionId} - Code: ${code}, Signal: ${signal}`);
        if (session.disconnectTimer) {
            clearTimeout(session.disconnectTimer);
            session.disconnectTimer = null;
        }
        if (session.stageMirrorTimer) {
            clearTimeout(session.stageMirrorTimer);
            session.stageMirrorTimer = null;
        }
        activeSessions.delete(sessionId);
        if (session.stageDir) {
            mirrorStagedSavesToPersistent(session, { cleanup: true });
        }
        invalidateSavesCache(session.realm, session.save);
        if (session.ws && session.ws.readyState === 1) {
            session.ws.send(JSON.stringify({ t: 'bye', detail: `process exited with code ${code}` }));
            session.ws.close();
        }
        setTimeout(processWaitingQueue, 50);
    });

    attachWebSocketToSession(session, ws);
}

function normalizeSessionKey(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/\.sav$/i, '').trim();
}

wss.on('connection', (ws, request) => {
    ws.isAlive = true;
    ws.on('pong', function wsHeartbeat() {
        this.isAlive = true;
    });

    const connIp = clientIp(request);
    if (connIp !== '127.0.0.1' && connIp !== '::1' && connIp !== '::ffff:127.0.0.1' && connIp !== 'unknown') {
        let ipCount = 0;
        for (const s of activeSessions.values()) {
            if (s.clientIp === connIp && s.ws && s.ws.readyState === 1) {
                ipCount++;
            }
        }
        if (ipCount >= MAX_WS_PER_IP) {
            try {
                ws.send(JSON.stringify({ t: 'error', message: 'Too many concurrent sessions from your IP' }));
                ws.send(JSON.stringify({ t: 'bye', detail: 'Too many concurrent sessions' }));
                ws.close(1008, 'Rate limit exceeded');
            } catch (_) {}
            return;
        }
    }

    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const rawUser = urlObj.searchParams.get('user') || null;
    const rawSave = urlObj.searchParams.get('save') || null;
    const rawSession = urlObj.searchParams.get('session') || null;
    const isNew = urlObj.searchParams.get('new') === '1' || urlObj.searchParams.get('reroll') === '1';
    const reqToken = extractWsOwnerToken(request, urlObj);

    const rawRealm = urlObj.searchParams.get('realm') || 'angband';
    const realm = rawRealm.replace(/[^a-zA-Z0-9_-]/g, '') || 'angband';

    const user = rawUser ? rawUser.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) : null;
    const resolvedSave = rawSave ? resolveSavefileName(rawSave, realm) : null;
    const save = resolvedSave || (rawSave ? rawSave.replace(/[^a-zA-Z0-9_.-]/g, '') : null);
    const clientSessionId = rawSession ? rawSession.replace(/[^a-zA-Z0-9_-]/g, '') : null;

    console.log(`[WebSocket] Client connection attempt. Realm: ${realm}, Session: ${clientSessionId || 'none'}, User: ${user || 'default'}, Save: ${save || 'none'}, isNew: ${isNew}. (Active: ${activeSessions.size}/${MAX_CONCURRENT_GAMES}, Queue: ${waitingQueue.length})`);

    const reqRealm = realm || 'angband';
    const rawLang = urlObj.searchParams.get('lang') || 'en';
    const lang = rawLang.toLowerCase();

    // STRICT INVARIANT: Never load or fall back to the wrong realm.
    // If the requested realm binary is missing, uninstalled, or invalid, reject immediately.
    const engineInfo = resolveRealmEngine(reqRealm, lang);
    if (!engineInfo.installed || !engineInfo.exe || !fs.existsSync(engineInfo.exe)) {
        console.error(`[WebSocket] Connection rejected: realm "${reqRealm}" (${engineInfo.name || reqRealm}) binary is not installed on this server. Fallbacks are strictly disabled.`);
        try {
            ws.send(JSON.stringify({
                t: 'error',
                message: `Engine binary for realm "${engineInfo.name || reqRealm}" is not installed on this server. Fallbacks are strictly disabled.`
            }));
            ws.send(JSON.stringify({
                t: 'bye',
                detail: `Realm "${engineInfo.name || reqRealm}" is not installed on this host.`
            }));
            ws.close();
        } catch (_) {}
        return;
    }

    // Priority Check 1: Can we seamlessly reconnect to a live session in memory?
    if (!isNew) {
        let existingSession = null;
        if (clientSessionId && activeSessions.has(clientSessionId)) {
            const candidate = activeSessions.get(clientSessionId);
            const candRealm = candidate.realm || 'angband';
            if (candRealm === reqRealm && candidate.child && !candidate.child.killed && candidate.child.exitCode === null) {
                const reqSave = normalizeSessionKey(save);
                const candSave = normalizeSessionKey(candidate.save || (candidate.engineSavefile ? path.basename(candidate.engineSavefile) : ''));
                const reqUser = normalizeSessionKey(user);
                const candUser = normalizeSessionKey(candidate.user);

                const saveMatches = !reqSave || (candSave && (candSave === reqSave || candSave.includes(reqSave) || reqSave.includes(candSave)));
                const userMatches = !reqUser || reqUser === 'adventurer' || (candUser && candUser === reqUser);
                const isSetupHijack = Boolean(reqSave && candidate.phase === 'setup');
                const isDeadHijack = Boolean(candidate.isDead);

                if (saveMatches && userMatches && !isSetupHijack && !isDeadHijack) {
                    existingSession = candidate;
                } else {
                    console.log(`[WebSocket] Session ${clientSessionId} in realm ${candRealm} rejected for re-attachment (reqSave=${reqSave}, candSave=${candSave}, candPhase=${candidate.phase}, isDead=${candidate.isDead}).`);
                    if (isDeadHijack) {
                        gracefulSessionSaveAndExit(candidate.sessionId, 'Dead session discarded on reload attempt.');
                    }
                }
            }
        }
        // Priority Check 2: Match by save or non-generic username within the SAME realm
        const isGenericUser = !user || normalizeSessionKey(user) === 'adventurer';
        if (!existingSession && (save || !isGenericUser)) {
            const targetKey = normalizeSessionKey(save || user);
            for (const candidate of activeSessions.values()) {
                const candRealm = candidate.realm || 'angband';
                if (candRealm === reqRealm && !candidate.isDead && candidate.child && !candidate.child.killed && candidate.child.exitCode === null) {
                    const candSave = normalizeSessionKey(candidate.save);
                    const candUser = normalizeSessionKey(candidate.user);
                    const candEngineSave = candidate.engineSavefile ? normalizeSessionKey(path.basename(candidate.engineSavefile)) : '';
                    if (candSave === targetKey || candUser === targetKey || candEngineSave === targetKey) {
                        if (candidate.savePath && fs.existsSync(getOwnerTokenPath(candidate.savePath))) {
                            if (!verifyOwnerToken(candidate.savePath, reqToken)) {
                                continue;
                            }
                        }
                        existingSession = candidate;
                        break;
                    }
                }
            }
        }

        if (existingSession) {
            console.log(`[WebSocket] Seamlessly re-attaching client to live ${existingSession.realm || 'angband'} session ${existingSession.sessionId} (User: ${existingSession.user || 'none'}, Save: ${existingSession.save || 'none'})`);

            attachWebSocketToSession(existingSession, ws);

            try {
                ws.send(JSON.stringify({
                    t: 'hello',
                    sessionId: existingSession.sessionId,
                    version: '1.0.0',
                    realm: existingSession.realm || 'angband',
                    saveSlot: existingSession.save || existingSession.user || null,
                    engineName: existingSession.engineInfo?.name || existingSession.engineInfo?.targetName,
                    isFallback: false,
                    resumed: true
                }));

                // Immediately emit cached last frame for 0ms visual reconnection
                if (existingSession.lastFrame) {
                    ws.send(existingSession.lastFrame);
                }

                // Request an immediate fresh frame from the engine
                if (existingSession.child && existingSession.child.stdin && existingSession.child.stdin.writable) {
                    existingSession.child.stdin.write('frame\n');
                }
            } catch (e) {
                console.error(`[WebSocket] Error sending resume frame: ${e.message}`);
            }
            return;
        }
    } else {
        // If player explicitly requested a brand new hero (-n / isNew=true),
        // terminate any lingering session for this character within the SAME realm
        const isGenericUser = !user || normalizeSessionKey(user) === 'adventurer';
        const targetKey = normalizeSessionKey(save || (!isGenericUser ? user : null));
        if (targetKey) {
            for (const [sId, cand] of activeSessions.entries()) {
                const candRealm = cand.realm || 'angband';
                if (candRealm === reqRealm) {
                    const candKey = normalizeSessionKey(cand.save || cand.user || (cand.engineSavefile ? path.basename(cand.engineSavefile) : null));
                    if (candKey === targetKey) {
                        const candSavePath = cand.savePath || path.join(engineInfo.saveDir || SAVE_DIR, cand.save || cand.user || '');
                        if (candSavePath && fs.existsSync(getOwnerTokenPath(candSavePath)) && !verifyOwnerToken(candSavePath, reqToken)) {
                            continue;
                        }
                        console.log(`[WebSocket] Terminating existing session ${sId} in realm ${candRealm} to begin fresh hero for ${targetKey}`);
                        gracefulSessionSaveAndExit(sId, 'Starting new character.', 'bye', { skipSave: true });
                    }
                }
            }
        }
    }

    // If active games are at capacity, check if any disconnected grace-period session can be evicted
    if (activeSessions.size >= MAX_CONCURRENT_GAMES) {
        let oldestDisconnectedId = null;
        let oldestDisconnectTime = Infinity;
        for (const [sId, cand] of activeSessions.entries()) {
            if (!cand.ws) {
                const discTime = cand.disconnectedAt || cand.lastActivityTime || 0;
                if (discTime < oldestDisconnectTime) {
                    oldestDisconnectTime = discTime;
                    oldestDisconnectedId = sId;
                }
            }
        }
        if (oldestDisconnectedId) {
            console.log(`[WebSocket] Evicting oldest disconnected grace-period session ${oldestDisconnectedId} to make room for incoming connection`);
            gracefulSessionSaveAndExit(oldestDisconnectedId, 'capacity-eviction');
        }
    }

    // If active games are at capacity or a queue already exists, enqueue!
    if (activeSessions.size >= MAX_CONCURRENT_GAMES || waitingQueue.length > 0) {
        if (waitingQueue.length >= MAX_QUEUE_SIZE) {
            console.warn(`[Queue] Realm and queue at capacity (${activeSessions.size}/${MAX_CONCURRENT_GAMES}, Queue: ${waitingQueue.length}/${MAX_QUEUE_SIZE}). Rejecting.`);
            ws.send(JSON.stringify({
                t: 'bye',
                detail: 'The realm is currently at maximum player and queue capacity. Please try reconnecting shortly.'
            }));
            ws.close();
            return;
        }

        const queueId = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
        const queueItem = {
            id: queueId,
            ws,
            request,
            enqueueTime: Date.now(),
            user,
            save
        };
        waitingQueue.push(queueItem);
        const position = waitingQueue.length;

        console.log(`[Queue] Enqueued client ${queueId} (Position: #${position}/${waitingQueue.length}, Active games: ${activeSessions.size}/${MAX_CONCURRENT_GAMES})`);

        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                t: 'queue',
                status: 'waiting',
                position: position,
                totalInQueue: waitingQueue.length,
                maxCapacity: MAX_CONCURRENT_GAMES,
                activeCount: activeSessions.size
            }));
        }

        ws.on('message', message => {
            const str = message.toString();
            if (str.startsWith('{')) {
                try {
                    const parsed = JSON.parse(str);
                    if (parsed.t === 'ping') {
                        if (ws.readyState === ws.OPEN) {
                            ws.send(JSON.stringify({ t: 'pong', time: parsed.time }));
                        }
                        return;
                    }
                    if (parsed.t === 'cancel') {
                        console.log(`[Queue] Client canceled queue wait: ${queueId}`);
                        ws.close();
                        return;
                    }
                } catch (_) {}
            }
        });

        ws.on('close', () => {
            const idx = waitingQueue.findIndex(item => item.id === queueId);
            if (idx !== -1) {
                waitingQueue.splice(idx, 1);
                console.log(`[Queue] Client left queue: ${queueId}. Remaining in queue: ${waitingQueue.length}`);
                broadcastQueueStatus();
            }
        });

        ws.on('error', err => {
            console.error(`[Queue Error] ${err.message}`);
            const idx = waitingQueue.findIndex(item => item.id === queueId);
            if (idx !== -1) {
                waitingQueue.splice(idx, 1);
                broadcastQueueStatus();
            }
        });

        broadcastQueueStatus();
        return;
    }

    spawnGameSession(ws, request);
});

// WebSocket Heartbeat / Ghost Connection Terminator
const wsLivenessInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log('[WebSocket] Terminating silent/unresponsive ghost socket');
            return ws.terminate();
        }
        ws.isAlive = false;
        try {
            ws.ping();
        } catch (_) {}
    });
}, 30000);
wsLivenessInterval.unref();

// In-Flight Checkpointing (WS70 Dirty-Turn Gate): Periodically checkpoint active game sessions every 60s
// ONLY when player turns or inputs have actually advanced since the last save (eliminating 2,880 GCS Class A writes/day on idle tabs!).
setInterval(() => {
    for (const [sessionId, session] of activeSessions.entries()) {
        if (!session.isDead && session.phase === 'play' && session.child && !session.child.killed && session.child.exitCode === null && session.child.stdin && session.child.stdin.writable) {
            const isDirty = (session.currentTurn !== session.lastSavedTurn) || (session.inputSeq !== session.lastSavedInputSeq);
            if (!isDirty) continue;
            try {
                session.child.stdin.write('save\n');
                session.lastSavedTurn = session.currentTurn || 0;
                session.lastSavedInputSeq = session.inputSeq || 0;
                invalidateSavesCache(session.realm, session.save);
                if (session.stageDir) {
                    scheduleStagedMirror(session, 2000);
                } else if (session.savePath && !session.ironman) {
                    setTimeout(() => {
                        if (!session.isDead && !session.ironman && session.savePath) {
                            snapshotLivingSaveAsync(session.savePath);
                        }
                    }, 300).unref();
                }
            } catch (_) {}
        }
    }
}, 60000).unref();

// Periodic idle session reaper: safely flush dirty save, emit { t: 'hibernated' } so client pauses without auto-reconnecting,
// and terminate engine process so Cloud Run scales cleanly to 0 instances.
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of activeSessions.entries()) {
        // Disconnected sessions are governed by their own disconnectTimer (DISCONNECT_GRACE_PERIOD_MS)
        if (session.ws && (now - session.lastActivityTime > IDLE_TIMEOUT_MS)) {
            const idleMins = Math.round((now - session.lastActivityTime) / 60000);
            console.log(`[Angband3D Cloud] Hibernating idle session ${sessionId} (${idleMins}m inactive). Saving state...`);
            gracefulSessionSaveAndExit(
                sessionId,
                `zzz Dungeon Paused — ${idleMins}m inactive. Progress saved; press any key to resume.`,
                'hibernated'
            );
        }
    }
}, 30000).unref();

// Graceful container shutdown: flush active C/C++ saves (up to 1,500ms drain), mirror staged saves, and exit cleanly
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const sessionsSnapshot = Array.from(activeSessions.values());
    console.log(`[Angband3D Cloud] Received ${signal}. Draining saves across ${sessionsSnapshot.length} active engine sessions...`);

    for (const item of waitingQueue) {
        try {
            if (item.ws && item.ws.readyState === 1) {
                item.ws.send(JSON.stringify({ t: 'bye', detail: 'Server shutting down' }));
                item.ws.close();
            }
        } catch (_) {}
    }
    waitingQueue.length = 0;

    const drainPromises = [];
    for (const session of sessionsSnapshot) {
        try {
            if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
            if (session.autoSaveTimer) clearTimeout(session.autoSaveTimer);
            if (session.stageMirrorTimer) clearTimeout(session.stageMirrorTimer);
            session.quickBirthActive = false;

            if (session.ws && session.ws.readyState === 1) {
                session.ws.send(JSON.stringify({
                    t: 'bye',
                    detail: 'Server shutting down',
                    preservedSave: Boolean(!session.isDead && session.phase === 'play'),
                    saveSlot: session.save || session.user || null
                }));
                session.ws.close();
            }

            const child = session.child;
            if (child && !child.killed && child.exitCode === null) {
                drainPromises.push(new Promise(resolve => child.once('close', resolve)));
                if (!session.isDead && session.phase === 'play' && child.stdin && child.stdin.writable) {
                    try {
                        child.stdin.write('save\nquit\n');
                        child.stdin.end();
                    } catch (_) {
                        try { child.kill('SIGTERM'); } catch (__) {}
                    }
                } else {
                    try {
                        if (child.stdin && child.stdin.writable) {
                            child.stdin.write('quit\n');
                            child.stdin.end();
                        } else {
                            child.kill('SIGTERM');
                        }
                    } catch (_) {
                        try { child.kill('SIGTERM'); } catch (__) {}
                    }
                }
            }
        } catch (_) {}
    }

    if (drainPromises.length > 0) {
        await Promise.race([
            Promise.allSettled(drainPromises),
            new Promise(resolve => setTimeout(resolve, 1500))
        ]);
    }

    for (const session of sessionsSnapshot) {
        try {
            if (session.child && !session.child.killed && session.child.exitCode === null) {
                session.child.kill('SIGTERM');
            }
        } catch (_) {}
    }

    const mirrorPromises = sessionsSnapshot
        .filter(s => Boolean(s.stageDir))
        .map(s => mirrorStagedSavesToPersistent(s, { cleanup: true }));
    if (mirrorPromises.length > 0) {
        await Promise.allSettled(mirrorPromises);
    }

    activeSessions.clear();
    server.close(() => {
        console.log('[Angband3D Cloud] HTTP server closed cleanly. Exiting.');
        process.exit(0);
    });
    setTimeout(() => {
        console.warn('[Angband3D Cloud] Forcing exit after shutdown timeout.');
        process.exit(0);
    }, 3000).unref();
}

process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });

process.on('uncaughtException', (err) => {
    console.error('[Angband3D Server Uncaught Exception]', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Angband3D Server Unhandled Rejection]', reason);
});

// Ensure keepAliveTimeout exceeds reverse proxy (Cloudflare/ALB/Nginx) standard 60s idle timeout
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;
server.timeout = 60000;

server.listen(PORT, () => {
    console.log(`[Angband3D Cloud Server] Listening on http://localhost:${PORT}`);
});

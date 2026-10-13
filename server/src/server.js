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
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const zlib = require('zlib');
const crypto = require('crypto');
const { guardMutation } = require('./http-guard');
const { createLimiter, clientIp } = require('./rate-limit');
if (!globalThis.crypto) globalThis.crypto = crypto;

const llmLimiter = createLimiter({ perMinute: +process.env.LLM_RPM || 20, perDay: +process.env.LLM_RPD || 500 });
const ttsLimiter = createLimiter({ perMinute: +process.env.TTS_RPM || 30, perDay: +process.env.TTS_RPD || 500 });

const ALLOWED_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
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

// In-Memory Save Metadata Cache (TTL: 2.5s) to eliminate synchronous disk thrashing on /api/saves under load
const savesCacheMap = new Map(); // realm -> { json, time }
const SAVES_CACHE_TTL_MS = 2500;

function invalidateSavesCache() {
    savesCacheMap.clear();
}

// In-Memory Neural TTS Audio Cache (LRU up to 250 items to keep RAM tiny ~5MB)
const ttsAudioCache = new Map();
const MAX_TTS_CACHE_ITEMS = 250;

// In-Flight TTS Request Deduplication (prevents redundant API syntheses during traffic spikes)
const inFlightTTS = new Map();

// In-Memory Static Gzip Cache (eliminates repeated compression CPU overhead on static assets)
const staticGzipCache = new Map();
const MAX_STATIC_CACHE_ITEMS = 100;

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
    brian: 'en-US-BrianNeural',           // Stalwart town guard / watchman (Male)
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
const GEMINI_REALM_NARRATOR_MAP = {
    angband: 'Zephyr',        // Noble, wise, scholarly Tolkien chronicler (Master Elrond)
    silq: 'Charon',           // Solemn, grave, deep First-Age mythic bard (Daeron of Doriath)
    frogcomposband: 'Fenrir', // Bold, sharp, cynical Amber fencing wit (Corwin of Amber)
    hengband: 'Gacrux',       // Disciplined, weathered Eastern Bushido master (Miyamoto Musashi)
    default: 'Zephyr'
};

// Curated 30 Character Archetype Casting Matrix for Gemini Native Audio (Free Tier Preview)
const GEMINI_VOICE_MAP = {
    narrator: 'Zephyr',          // Expressive, scholarly storyteller
    mentor: 'Gacrux',           // Mature, raspy, ancient scholar
    idiot: 'Puck',              // Upbeat, blubbering, eccentric babbler
    female_townsperson: 'Aoede', // Breezy, lyrical, gentle townsfolk
    male_townsperson: 'Sulafat',
    female_rogue: 'Kore',       // Firm, gritty, sharp martial cadence
    male_rogue: 'Orus',         // Disciplined, raspy cutthroat
    rogue: 'Orus',
    female_spellcaster: 'Despina', // Smooth, eerie, mystical sibilance
    male_spellcaster: 'Gacrux',
    spellcaster: 'Gacrux',
    veteran: 'Orus',            // Firm, commanding warrior
    female_veteran: 'Kore',     // Firm, battle-scarred swordswoman
    orc: 'Fenrir',              // Excitable, guttural snarls
    giant: 'Charon',            // Cavernous, hollow booming bass (Half-Giant, Half-Titan, Half-Troll)
    dwarf: 'Algenib',           // Deep, gravelly subterranean rumble
    hobbit: 'Puck',             // Diminutive, lively tenor
    gnome: 'Puck',
    dragon: 'Algenib',          // Deep, gravelly draconic power
    high_undead: 'Algenib',     // Sepulchral resonance
    beggar: 'Puck',
    beast: 'Fenrir',            // Bestial snarl
    creature: 'Fenrir',
    default: 'Zephyr'
};

// Canonical Character Accent Directorial Map for Immersion (Enforces Zero Southern Accents)
const CHARACTER_ACCENT_MAP = {
    narrator: 'expressive, older British storyteller, standard RP British accent',
    elf: 'regal, ethereal High-Elven RP accent, crisp consonants',
    female_elf: 'ethereal, melodic High-Elven accent',
    male_elf: 'regal, poetic High-Elven accent',
    dwarf: 'deep, gravelly Scottish brogue, stone-hewn dwarven timbre',
    female_dwarf: 'hearty, resonant Scottish dwarven timbre',
    male_dwarf: 'deep, gruff Scottish brogue',
    hobbit: 'warm, cheerful English countryside West Country accent, lively hobbit',
    gnome: 'lively, eccentric, high-spirited English accent',
    orc: 'harsh, guttural, raspy Cockney monster growl',
    giant: 'cavernous, slow, booming ancient bass',
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
    male_spellcaster: 'deep, resonant, arcane scholar with formal British diction',
    beggar: 'raspy, weather-beaten street urchin cadence',
    high_undead: 'sepulchral, chilling, hollow ancient whisper',
    dragon: 'resonant, cavernous, ancient draconic baritone'
};

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

// Proxies text-to-speech to Gemini Native Audio (gemini-3.1-flash-tts-preview) with directorial prompting
function synthesizeGeminiTTS({ text, voice, emotion, geminiTag, directorNote, role, apiKey, realm = 'angband', isRetry = false }) {
    return new Promise((resolve, reject) => {
        if (!apiKey) {
            return reject(new Error('No Gemini API key provided'));
        }

        // Directorial Prompting: Enforce character-accurate accent and strictly forbid southern accents
        let promptText = text;
        let tag = '';
        if (!isRetry) {
            let roleKey = role ? role.toLowerCase() : 'narrator';
            const isHeng = (realm === 'hengband');
            if (!isHeng) {
                if (roleKey === 'samurai') roleKey = 'veteran';
                else if (roleKey === 'ninja') roleKey = 'rogue';
            }

            if (geminiTag) {
                tag = geminiTag.trim();
                if (!isHeng) {
                    tag = tag.replace(/\b(japanese|samurai|ninja)\b/gi, 'classical British');
                }
            } else if (directorNote) {
                let note = directorNote.trim();
                if (!isHeng) {
                    note = note.replace(/\b(japanese|samurai|ninja)\b/gi, 'classical British');
                }
                tag = `[${note}]`;
            } else {
                const accent = CHARACTER_ACCENT_MAP[roleKey] || (roleKey === 'narrator' ? CHARACTER_ACCENT_MAP.narrator : 'natural, noble Classical British or Mid-Atlantic cadence');
                tag = `[${accent}]`;
            }

            // Strict Accent Invariant: Prohibit American southern drawl across all voices
            if (tag) {
                const lowerTag = tag.toLowerCase();
                if (!lowerTag.includes('no southern') && !lowerTag.includes('no american southern')) {
                    if (tag.endsWith(']')) {
                        tag = tag.slice(0, -1) + ', no American southern drawl]';
                    } else {
                        tag = `[${tag}, no American southern drawl]`;
                    }
                }
                promptText = `${tag} ${text}`;
            }
        }

        const payload = JSON.stringify({
            contents: [{
                parts: [{ text: promptText }]
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

        const req = https.request('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            timeout: 20000
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
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
                    return reject(new Error(redactSecret(errMsg.replace(/[\r\n\t]+/g, ' ').substring(0, 120), apiKey)));
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
                        // If prompt was rejected or blocked due to directorial brackets (e.g. single-word probes), retry cleanly ONCE with raw text
                        if (!isRetry && tag && promptText !== text) {
                            return synthesizeGeminiTTS({
                                text,
                                voice,
                                emotion,
                                geminiTag: '',
                                directorNote: '',
                                role,
                                apiKey,
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
                    const wavHeader = createWavHeader(pcmBuffer.length, sampleRate, 1, 16);
                    const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
                    resolve(wavBuffer);
                } catch (err) {
                    reject(err);
                }
            });
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
                        if (!process.env[key]) {
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
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS || `${20 * 60 * 1000}`, 10); // 20 minutes
const MAX_CONCURRENT_GAMES = parseInt(process.env.MAX_CONCURRENT_GAMES || '50', 10);
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || '100', 10);
// Reconnect Grace Period: Keeps headless game engine alive across network drops, tab reloads, or lag spikes (30 minutes)
const DISCONNECT_GRACE_PERIOD_MS = parseInt(process.env.DISCONNECT_GRACE_PERIOD_MS || `${30 * 60 * 1000}`, 10); // 30 minutes

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

function resolveRealmEngine(realmId = 'angband', lang = 'en') {
    const defaultEngine = {
        realm: 'angband',
        name: 'Vanilla Angband 4.2.6',
        exe: ENGINE_EXE,
        saveDir: SAVE_DIR,
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
            saveDir: null,
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
        const variantSaveDir = path.resolve(__dirname, '../../', realmDef.save_system?.directory || `engine/build/game/lib/save/${realmId}`);
        if (!fs.existsSync(variantSaveDir)) {
            try { fs.mkdirSync(variantSaveDir, { recursive: true }); } catch (_) {}
        }
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
        return {
            realm: realmId,
            name: realmDef.name,
            exe: variantExe,
            saveDir: variantSaveDir,
            cwd: variantCwd,
            env: variantEnv,
            cli: realmDef.cli || defaultEngine.cli,
            installed: true,
            isFallback: false
        };
    }

    return {
        realm: realmId,
        name: realmDef.name,
        exe: null,
        saveDir: null,
        cwd: null,
        env: {},
        cli: realmDef.cli || defaultEngine.cli,
        installed: false,
        isFallback: false,
        fallbackNotice: `Engine binary for realm "${realmDef.name}" is not installed on this server.`
    };
}

function getSaveDirsForRealm(realmId = 'angband') {
    const dirs = new Set();
    const engineInfo = resolveRealmEngine(realmId);
    if (engineInfo.saveDir && fs.existsSync(engineInfo.saveDir)) {
        dirs.add(path.resolve(engineInfo.saveDir));
    }
    if (realmId === 'angband') {
        for (const d of getSaveDirs()) {
            dirs.add(d);
        }
    }
    return Array.from(dirs);
}

function isReservedFilename(name) {
    if (!name) return true;
    const base = name.split('.')[0].trim();
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base);
}

function sanitizeFilename(name) {
    if (!name) return '';
    return path.basename(name).replace(/[^a-zA-Z0-9_.-]/g, '_');
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

    // Check each save directory for candidate matches in order:
    // 1. Exact match (e.g. "Brian.sav" or "Brian")
    // 2. Name with .sav extension ("Brian.sav")
    // 3. Name without extension ("Brian")
    for (const dir of saveDirs) {
        if (!fs.existsSync(dir)) continue;
        const exact = path.join(dir, clean);
        if (fs.existsSync(exact) && fs.statSync(exact).isFile()) return path.basename(exact);

        const withSav = path.join(dir, cleanNoExt + '.sav');
        if (fs.existsSync(withSav) && fs.statSync(withSav).isFile()) return path.basename(withSav);

        const withoutExt = path.join(dir, cleanNoExt);
        if (fs.existsSync(withoutExt) && fs.statSync(withoutExt).isFile()) return path.basename(withoutExt);
    }

    // Case-insensitive check fallback:
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

// --- Ownership Token System ---
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function getOwnerTokenPath(savePath) {
    return savePath + '.owner.json';
}

function verifyOwnerToken(savePath, requestToken) {
    const ownerPath = getOwnerTokenPath(savePath);
    if (!fs.existsSync(ownerPath)) return true; // Legacy save: trust on first use
    try {
        const data = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
        if (!data || !data.hash) return true;
        return data.hash === sha(requestToken || '');
    } catch (e) {
        return false;
    }
}

function createOwnerToken(savePath) {
    const token = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(getOwnerTokenPath(savePath), JSON.stringify({
        hash: sha(token),
        createdAt: Date.now()
    }), 'utf8');
    return token;
}

/**
 * Parses Angband 4.2.6 SaveVNLA header from binary save file.
 * Structure:
 *  0..7:   "SaveVNLA" magic
 *  8..23:  "description\0..."
 *  24..27: block version/type
 *  28..31: size (uint32_le)
 *  32..35: checksum
 *  36..:   description string
 */
function readSaveMetadata(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size < 36) return null;

        const fd = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(36);
        fs.readSync(fd, header, 0, 36, 0);

        const magic = header.toString('ascii', 0, 8);
        const VALID_MAGICS = ['SaveVNLA', 'SaveSILQ', 'SaveFROX', 'SaveHENG'];
        let detectedRealm = 'angband';
        if (magic === 'SaveSILQ') detectedRealm = 'silq';
        else if (magic === 'SaveFROX') detectedRealm = 'frogcomposband';
        else if (magic === 'SaveHENG') detectedRealm = 'hengband';

        if (!VALID_MAGICS.includes(magic)) {
            // Check sidecar
            const sidecarPath = filePath + '.realm.json';
            if (fs.existsSync(sidecarPath)) {
                try {
                    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
                    if (sidecar.realm) detectedRealm = sidecar.realm;
                } catch (_) {}
            } else {
                fs.closeSync(fd);
                return null;
            }
        }

        const blockName = header.toString('ascii', 8, 24).replace(/\0.*$/, '');
        let description = null;
        let charName = null;

        if (blockName === 'description') {
            const size = header.readUInt32LE(28);
            if (size > 0 && size <= 512 && stat.size >= 36 + size) {
                const descBuf = Buffer.alloc(size);
                fs.readSync(fd, descBuf, 0, size, 36);
                const nullIdx = descBuf.indexOf(0);
                const strLen = nullIdx >= 0 ? nullIdx : size;
                description = descBuf.toString('utf8', 0, strLen);
                const commaIdx = description.indexOf(',');
                if (commaIdx > 0) {
                    charName = description.substring(0, commaIdx).trim();
                }
            }
        }

        fs.closeSync(fd);
        const baseNameNoExt = path.basename(filePath).replace(/\.sav$/i, '');
        return {
            filename: path.basename(filePath),
            characterName: charName || baseNameNoExt,
            description: description || baseNameNoExt,
            realm: detectedRealm,
            sizeBytes: stat.size,
            lastModified: stat.mtime.toISOString(),
        };
    } catch (e) {
        return null;
    }
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
        'https://angband3d.com',
        'http://angband3d.com',
        'https://www.angband3d.com',
        'http://www.angband3d.com'
    ].concat((process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean))
);
function isAllowedOrigin(origin, host, req) {
    if (!origin) return true;
    try {
        const originHost = new URL(origin).host;
        if (host && (originHost === host || originHost === host.split(':')[0])) return true;
        if (req && req.headers) {
            const fwdHost = req.headers['x-forwarded-host'];
            if (fwdHost) {
                const firstFwd = fwdHost.split(',')[0].trim();
                if (originHost === firstFwd || originHost === firstFwd.split(':')[0]) return true;
            }
            const reqHost = req.headers.host;
            if (reqHost && (originHost === reqHost || originHost === reqHost.split(':')[0])) return true;
        }
    } catch (_) {
        return false;
    }
    return EXTRA_ALLOWED_ORIGINS.has(origin);
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
    const fwdHost = req.headers['x-forwarded-host'] ? req.headers['x-forwarded-host'].split(',')[0].trim() : '';
    const host = fwdHost || req.headers.host || '';
    if (proto === 'http' && host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
        res.writeHead(301, {
            'Location': `https://${host}${req.url}`,
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
        });
        res.end();
        return;
    }

    // CORS: echo the Origin only when allowed (never '*'; E17). Vary keeps caches honest.
    const reqOrigin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (reqOrigin && isAllowedOrigin(reqOrigin, host, req)) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Character-Name, X-Recording-Name, X-Owner-Token');
        res.setHeader('Access-Control-Expose-Headers', 'X-TTS-Engine, X-TTS-Cache, X-TTS-Fallback-Reason, Content-Type, Content-Length');
    }
    
    if (guardMutation(req, res, isAllowedOrigin, host)) return;

    // Industry-Standard Security Headers (Eliminates browser security warnings & MIME confusion)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
    if (proto === 'https' || req.socket.encrypted) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Modern Content Security Policy (permits WebGL Three.js, local shaders, Web Audio, Cloudflare Insights, and Google Fonts)
    const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval' blob: https://static.cloudflareinsights.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https://angband3d.com https://fonts.gstatic.com",
        "media-src 'self' data: blob: https://angband3d.com",
        "connect-src 'self' blob: data: ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com https://cloudflareinsights.com https://generativelanguage.googleapis.com",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'"
    ].join('; ');
    res.setHeader('Content-Security-Policy', cspDirectives);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health & Liveness Probes (/health and /healthz for Cloud Run / Kubernetes)
    if ((pathname === '/health' || pathname === '/healthz') && req.method === 'GET') {
        let appVersion = '9.4.5';
        try {
            const vFile = path.join(WEB_DIR, 'version.json');
            if (fs.existsSync(vFile)) {
                appVersion = JSON.parse(fs.readFileSync(vFile, 'utf8')).v || appVersion;
            }
        } catch (_) {}
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
            fs.createReadStream(zipPath).pipe(res);
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
            fs.createReadStream(apkPath).pipe(res);
        } else {
            // Redirect to latest GitHub Release asset
            res.writeHead(302, {
                'Location': 'https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Android.apk'
            });
            res.end();
        }
        return;
    }

    // REST: List saves
    if (pathname === '/api/saves' && req.method === 'GET') {
        const queryRealm = urlObj.searchParams.get('realm') || 'angband';
        if (!['angband', 'silq', 'frogcomposband', 'hengband'].includes(queryRealm)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid realm' }));
            return;
        }
        const now = Date.now();
        const cached = savesCacheMap.get(queryRealm);
        if (cached && (now - cached.time < SAVES_CACHE_TTL_MS)) {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=2, stale-while-revalidate=5'
            });
            res.end(cached.json);
            return;
        }

        try {
            const saveDirs = getSaveDirsForRealm(queryRealm);
            const saves = [];
            const seenFiles = new Set();
            const primarySaveDir = saveDirs[0] || SAVE_DIR;

            for (const sDir of saveDirs) {
                if (!fs.existsSync(sDir)) continue;
                const files = fs.readdirSync(sDir);
                for (const file of files) {
                    if (file.startsWith('.') || seenFiles.has(file)) continue;
                    const fullPath = path.join(sDir, file);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isFile() && stat.size > 0) {
                            let meta = readSaveMetadata(fullPath);
                            if (!meta && stat.size >= 36) {
                                meta = {
                                    filename: file,
                                    characterName: file,
                                    description: file,
                                    sizeBytes: stat.size,
                                    lastModified: stat.mtime.toISOString(),
                                };
                            }
                            if (meta) {
                                seenFiles.add(file);
                                // Ensure save is mirrored into primary save directory if found in a secondary dir
                                if (primarySaveDir && sDir !== primarySaveDir) {
                                    try {
                                        fs.copyFileSync(fullPath, path.join(primarySaveDir, file));
                                    } catch (_) {}
                                }
                                saves.push(meta);
                            }
                        }
                    } catch (_) {}
                }
            }
            saves.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
            const jsonStr = JSON.stringify({ saves, realm: queryRealm });
            savesCacheMap.set(queryRealm, { json: jsonStr, time: Date.now() });
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=2, stale-while-revalidate=5'
            });
            res.end(jsonStr);
            return;
        } catch (err) {
            console.error('[API] /api/saves error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal error', saves: [] }));
            return;
        }
    }

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
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
            status: 'ok',
            defaultRealm: engineManifest?.default_realm || 'angband',
            realms: realmsStatus
        }));
        return;
    }

    // REST: Server Capacity & Telemetry Status
    if (pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            activeSessions: activeSessions.size,
            maxCapacity: MAX_CONCURRENT_GAMES,
            waitingQueue: waitingQueue.length,
            maxQueueSize: MAX_QUEUE_SIZE,
            version: '3.0.0'
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
        const wait = llmLimiter(clientIp(req));
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
            const isGemini3 = model.includes('gemini-3');
            if (isGemini3) {
                generationConfig.thinkingConfig = { thinkingLevel: 'LOW' };
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

            const upstreamReq = https.request(targetUrl, {
                method: 'POST',
                agent: geminiHttpsAgent,
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                    'Content-Length': Buffer.byteLength(payloadStr)
                },
                timeout: 30000
            }, upstreamRes => {
                let respBody = '';
                upstreamRes.on('data', chunk => respBody += chunk);
                upstreamRes.on('end', () => {
                    res.writeHead(upstreamRes.statusCode || 200, {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    });
                    if (upstreamRes.statusCode === 200) {
                        try {
                            const rb = JSON.parse(respBody);
                            const text = rb.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
                        } catch(e) {
                            res.end(JSON.stringify({ error: { message: 'Upstream error parsing response' } }));
                        }
                    } else {
                        res.end(JSON.stringify({ error: { message: `Upstream error ${upstreamRes.statusCode}` } }));
                    }
                });
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

    // REST: Dual-Engine Neural Text-To-Speech (/api/tts?text=...&role=...&engine=edge|gemini&emotion=...)
    if (pathname === '/api/tts' && (req.method === 'GET' || req.method === 'HEAD')) {
        const wait = ttsLimiter(clientIp(req));
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
        const reqGender = (urlObj.searchParams.get('gender') || '').toLowerCase().trim();
        const reqPitch = (urlObj.searchParams.get('pitch') || '').trim();
        const reqRate = (urlObj.searchParams.get('rate') || '').trim();

        if (reqPitch && !/^[+-]?\d{1,3}(%|Hz)?$/.test(reqPitch)) {
            res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Invalid pitch"}'); return;
        }
        if (reqRate && !/^[+-]?\d{1,3}(%|Hz)?$/.test(reqRate)) {
            res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Invalid rate"}'); return;
        }

        const tagRegex = /^[\p{L}\p{N} ,.'-]{0,120}$/u;
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
            if (reqVoice && validGeminiVoices.map(v => v.toLowerCase()).includes(reqVoice.toLowerCase())) {
                geminiVoice = validGeminiVoices.find(v => v.toLowerCase() === reqVoice.toLowerCase());
            } else if (isNarrator) {
                geminiVoice = (reqGender === 'female')
                    ? (reqRealm === 'silq' ? 'Despina' : (reqRealm === 'hengband' ? 'Sulafat' : (reqRealm === 'frogcomposband' ? 'Kore' : 'Aoede')))
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

            const geminiCacheKey = `gemini:${geminiVoice}:${emotion}:${geminiTag}:${text}`;
            if (ttsAudioCache.has(geminiCacheKey)) {
                sendWav(ttsAudioCache.get(geminiCacheKey), true);
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
                realm: reqRealm
            }).then(wavBuffer => {
                inFlightTTS.delete(geminiCacheKey);
                if (ttsAudioCache.size >= MAX_TTS_CACHE_ITEMS) {
                    const oldestKey = ttsAudioCache.keys().next().value;
                    ttsAudioCache.delete(oldestKey);
                }
                ttsAudioCache.set(geminiCacheKey, wavBuffer);
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
            let voice = TTS_VOICE_MAP.default;
            if (reqGender === 'female' && TTS_VOICE_MAP[`female_${role}`]) {
                voice = TTS_VOICE_MAP[`female_${role}`];
            } else if (reqGender === 'male' && TTS_VOICE_MAP[`male_${role}`]) {
                voice = TTS_VOICE_MAP[`male_${role}`];
            } else if (TTS_VOICE_MAP[role]) {
                voice = TTS_VOICE_MAP[role];
            }

            if (reqVoice) {
                const alias = reqVoice.toLowerCase();
                if (TTS_VOICE_MAP[alias]) {
                    voice = TTS_VOICE_MAP[alias];
                } else if ((reqVoice.startsWith('en-') || reqVoice.startsWith('ga-')) && reqVoice.endsWith('Neural')) {
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
                sendEdgeMp3(ttsAudioCache.get(edgeCacheKey), true);
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
                            if (ttsAudioCache.size >= MAX_TTS_CACHE_ITEMS) {
                                const oldestKey = ttsAudioCache.keys().next().value;
                                ttsAudioCache.delete(oldestKey);
                            }
                            ttsAudioCache.set(edgeCacheKey, buffer);
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
                    if (!res.headersSent) {
                        console.error('[TTS] Edge TTS error:', err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Internal error' }));
                    }
                });
        }
        return;
    }

    // REST: Download latest or current save direct fallback
    if ((pathname === '/api/saves/latest' || pathname === '/api/saves-download-current') && req.method === 'GET') {
        const charName = urlObj.searchParams.get('char');
        const saveDirs = getSaveDirs();
        let allSaves = [];

        for (const sDir of saveDirs) {
            if (!fs.existsSync(sDir)) continue;
            const files = fs.readdirSync(sDir);
            for (const file of files) {
                if (file.startsWith('.')) continue;
                const fullPath = path.join(sDir, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isFile() && stat.size > 0) {
                        let meta = readSaveMetadata(fullPath);
                        if (!meta && stat.size >= 36) {
                            meta = {
                                filename: file,
                                characterName: file,
                                description: file,
                                sizeBytes: stat.size,
                                lastModified: stat.mtime.toISOString(),
                            };
                        }
                        if (meta) {
                            allSaves.push({ ...meta, fullPath });
                        }
                    }
                } catch (_) {}
            }
        }

        allSaves.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        let match = null;
        if (charName) {
            match = allSaves.find(s =>
                (s.characterName && s.characterName.toLowerCase() === charName.toLowerCase()) ||
                (s.filename && s.filename.toLowerCase() === charName.toLowerCase()) ||
                (s.filename && s.filename.toLowerCase().startsWith(charName.toLowerCase()))
            );
        }
        if (!match && allSaves.length > 0) {
            match = allSaves[0];
        }

        // Final fallback: check for any non-empty file in any save directory
        if (!match) {
            let newestMtime = 0;
            for (const sDir of saveDirs) {
                if (!fs.existsSync(sDir)) continue;
                const files = fs.readdirSync(sDir);
                for (const file of files) {
                    if (file.startsWith('.')) continue;
                    const fullPath = path.join(sDir, file);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isFile() && stat.size > 0 && stat.mtimeMs > newestMtime) {
                            newestMtime = stat.mtimeMs;
                            match = { fullPath, filename: file, characterName: charName || file };
                        }
                    } catch (_) {}
                }
            }
        }

        if (match && fs.existsSync(match.fullPath)) {
            const outName = (match.characterName || match.filename).replace(/[^a-zA-Z0-9_-]/g, '_') + '.sav';
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${outName}"`,
            });
            fs.createReadStream(match.fullPath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No save files available' }));
        }
        return;
    }

    // REST: Download single save
    if (pathname.startsWith('/api/saves/') && req.method === 'GET') {
        const rawSaveName = pathname.substring('/api/saves/'.length);
        const saveName = sanitizeFilename(rawSaveName);
        if (!saveName || isReservedFilename(saveName)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid save file name' }));
            return;
        }
        const queryRealm = urlObj.searchParams.get('realm') || 'angband';
        if (!['angband', 'silq', 'frogcomposband', 'hengband'].includes(queryRealm)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid realm' }));
            return;
        }
        const saveDirs = getSaveDirsForRealm(queryRealm);
        let targetPath = null;

        for (const sDir of saveDirs) {
            const p = path.join(sDir, saveName);
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                targetPath = p;
                break;
            }
        }

        if (targetPath) {
            const outName = saveName.endsWith('.sav') ? saveName : `${saveName}.sav`;
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${outName}"`,
            });
            fs.createReadStream(targetPath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Save file not found' }));
        }
        return;
    }

    // REST: Upload save
    if (pathname === '/api/saves/upload' && req.method === 'POST') {
        const chunks = [];
        let totalSize = 0;
        const maxLimit = 10 * 1024 * 1024; // 10 MB limit

        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > maxLimit) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload too large' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            const buf = Buffer.concat(chunks);
            if (buf.length < 36) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid savefile: too short' }));
                return;
            }
            const magic = buf.toString('ascii', 0, 8);
            let detectedRealm = 'angband';
            if (magic === 'SaveVNLA') detectedRealm = 'angband';
            else if (magic === 'SaveSILQ') detectedRealm = 'silq';
            else if (magic === 'SaveFROX') detectedRealm = 'frogcomposband';
            else if (magic === 'SaveHENG') detectedRealm = 'hengband';
            else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid savefile: missing or unknown magic header' }));
                return;
            }

            const targetDir = getSaveDirsForRealm(detectedRealm)[0] || SAVE_DIR;
            const headerName = req.headers['x-character-name'];
            let cleanHeaderName = headerName ? sanitizeFilename(headerName) : null;
            if (cleanHeaderName && isReservedFilename(cleanHeaderName)) {
                cleanHeaderName = null;
            }
            let targetName = cleanHeaderName || ('upload_' + Date.now());

            const tempFile = path.join(targetDir, '.tmp_' + Date.now());
            try {
                fs.writeFileSync(tempFile, buf);
                const meta = readSaveMetadata(tempFile);
                if (meta && meta.characterName && !cleanHeaderName) {
                    const cleanMetaName = sanitizeFilename(meta.characterName);
                    if (cleanMetaName && !isReservedFilename(cleanMetaName)) {
                        targetName = cleanMetaName;
                    }
                }

                let finalName = targetName;
                let destPath = path.join(targetDir, finalName);
                if (fs.existsSync(destPath)) {
                    const reqToken = req.headers['x-owner-token'] || '';
                    if (!verifyOwnerToken(destPath, reqToken)) {
                        let n = 1;
                        while (fs.existsSync(path.join(targetDir, `${targetName}_${n}`))) {
                            n++;
                        }
                        finalName = `${targetName}_${n}`;
                        destPath = path.join(targetDir, finalName);
                    }
                }

                fs.renameSync(tempFile, destPath);
                invalidateSavesCache();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'saved',
                    filename: finalName,
                    metadata: readSaveMetadata(destPath)
                }));
            } finally {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
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

    // REST: Delete save
    if (pathname.startsWith('/api/saves/') && req.method === 'DELETE') {
        const rawSaveName = pathname.substring('/api/saves/'.length);
        const saveName = sanitizeFilename(rawSaveName);
        if (!saveName || isReservedFilename(saveName)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid save file name' }));
            return;
        }
        const queryRealm = urlObj.searchParams.get('realm') || 'angband';
        if (!['angband', 'silq', 'frogcomposband', 'hengband'].includes(queryRealm)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid realm' }));
            return;
        }
        const saveDirs = getSaveDirsForRealm(queryRealm);
        let savePath = null;
        for (const sDir of saveDirs) {
            const p = path.join(sDir, saveName);
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                savePath = p;
                break;
            }
        }
        if (savePath) {
            const reqToken = req.headers['x-owner-token'] || '';
            if (!verifyOwnerToken(savePath, reqToken)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden: invalid owner token for existing character' }));
                return;
            }
            try {
                fs.unlinkSync(savePath);
                const ownerPath = getOwnerTokenPath(savePath);
                if (fs.existsSync(ownerPath)) fs.unlinkSync(ownerPath);
                invalidateSavesCache();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'deleted', filename: saveName, realm: queryRealm }));
            } catch (err) {
                console.error('[API] /api/saves/delete error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal error' }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Save file not found' }));
        }
        return;
    }

    // Static Web Client Files
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';
    if (['/demo', '\\demo', '/demo/', '\\demo\\', '/watch', '\\watch', '/showcase', '\\showcase'].includes(safePath)) {
        safePath = '/demo.html';
    }
    // Alias versioned walkthrough demo video URLs to canonical master video assets
    if (safePath.includes('angband3d_demo_') && safePath.endsWith('.mp4')) {
        safePath = '/assets/video/angband3d_demo.mp4';
    } else if (safePath.includes('angband3d_demo_') && safePath.endsWith('.webm')) {
        safePath = '/assets/video/angband3d_demo.webm';
    }
    const filePath = path.resolve(WEB_DIR, '.' + path.sep + safePath);

    // Guard against directory traversal attacks
    if (!filePath.startsWith(path.resolve(WEB_DIR))) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return;
    }

    // Guard against hidden dotfiles (.env, .git, etc.)
    const pathSegments = safePath.split(/[/\\]/);
    if (pathSegments.some(seg => seg.startsWith('.') && seg !== '.' && seg !== '..')) {
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
                '.pck': 'application/octet-stream',
                '.css': 'text/css; charset=utf-8',
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
            let cacheControl = 'no-cache, must-revalidate';
            if (posixPath === '/index.html' || posixPath === '/' || posixPath === '/sw.js') {
                cacheControl = 'no-store, no-cache, must-revalidate, max-age=0';
            } else if (['.mp4', '.webm', '.m4a'].includes(ext)) {
                cacheControl = 'no-cache, no-store, must-revalidate';
            } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
                cacheControl = 'public, max-age=86400, no-transform';
            } else if (['.png', '.jpg', '.jpeg', '.webp', '.obj', '.mtl', '.gltf', '.glb', '.bin', '.wasm', '.pck'].includes(ext)) {
                cacheControl = 'public, max-age=86400, immutable';
            } else if (['.js', '.css'].includes(ext)) {
                cacheControl = 'no-cache, must-revalidate';
            }

            const etag = `W/"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
            const headers = {
                'Content-Type': contentType,
                'Cache-Control': cacheControl,
                'ETag': etag,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
                'Cross-Origin-Resource-Policy': 'cross-origin',
            };

            // Handle Conditional ETag Revalidation (HTTP 304 Not Modified)
            // (Strictly bypass 304 for HTML shell and sw.js to ensure immediate localhost live updates)
            if (req.headers['if-none-match'] === etag && posixPath !== '/index.html' && posixPath !== '/' && posixPath !== '/sw.js') {
                res.writeHead(304, headers);
                res.end();
                return;
            }

            // Cross-Origin Isolation headers required for Godot 4 WebAssembly multithreading/SharedArrayBuffer on game client
            if (posixPath === '/index.html' || ext === '.wasm' || ext === '.pck') {
                headers['Cross-Origin-Opener-Policy'] = 'same-origin';
                headers['Cross-Origin-Embedder-Policy'] = 'credentialless';
            }

            // HTTP 206 Partial Content (Range Request) support for smooth video/audio seeking & scrubbing
            const range = req.headers.range;
            if (range && (ext === '.mp4' || ext === '.webm' || ext === '.mp3' || ext === '.wav' || ext === '.m4a')) {
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
                            res.writeHead(206, {
                                ...headers,
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
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

        // Gzip compression for text & code payloads (.html, .js, .css, .json, .obj, .mtl, .svg)
        const compressible = ['.html', '.js', '.css', '.json', '.obj', '.mtl', '.svg'].includes(ext);
        const acceptEncoding = req.headers['accept-encoding'] || '';

        if (compressible && acceptEncoding.includes('gzip')) {
            headers['Content-Encoding'] = 'gzip';
            try {
                const stat = fileStat;
                const cacheKey = `${filePath}:${stat.mtimeMs}`;
                const cached = staticGzipCache.get(cacheKey);
                if (cached) {
                    headers['Content-Length'] = cached.length;
                    res.writeHead(200, headers);
                    res.end(cached);
                    return;
                }
                const rawBuffer = fs.readFileSync(filePath);
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
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (request, socket, head) => {
    const fwdHost = request.headers['x-forwarded-host'] ? request.headers['x-forwarded-host'].split(',')[0].trim() : '';
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

function gracefulSessionSaveAndExit(sessionId, byeMessage = null) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    if (session.disconnectTimer) {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = null;
    }

    const { child, ws } = session;
    activeSessions.delete(sessionId);

    if (ws && ws.readyState === 1 /* OPEN */) {
        try {
            if (byeMessage) {
                ws.send(JSON.stringify({ t: 'bye', detail: byeMessage }));
            }
            ws.close();
        } catch (_) {}
    }

    if (child && !child.killed && child.exitCode === null) {
        try {
            if (!session.isDead && session.phase === 'play' && child.stdin && child.stdin.writable) {
                console.log(`[Session] Saving authoritative state for session ${sessionId}...`);
                child.stdin.write('save\n');
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
                                    }
                                    invalidateSavesCache();
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
                        }
                        invalidateSavesCache();
                    } catch (_) {}
                }, 300);
            }
        } catch (_) {
            try { child.kill(); } catch (_) {}
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
        const graceMs = session.phase === 'setup' ? Math.min(DISCONNECT_GRACE_PERIOD_MS, 60000) : DISCONNECT_GRACE_PERIOD_MS;
        console.log(`[WebSocket] Client disconnected from session ${sessionId} (Phase: ${session.phase || 'unknown'}, isDead: ${session.isDead || false}). Keeping engine alive for ${Math.round(graceMs / 1000)}s grace period...`);

        // Only issue non-blocking save command if actively in gameplay and player is NOT dead
        if (!session.isDead && session.phase === 'play' && session.child.stdin && session.child.stdin.writable) {
            try {
                session.child.stdin.write('save\n');
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
    // local_bridge.js) AND bridge dispatchers: key <spec> | keys <seq> | frame | map | save | ping.
    // 'quit' stays out on purpose: the JSON {t:'quit'} path saves gracefully first.
    // LESSON L1: never shrink this list without grepping every sender ('save' was nearly dropped once).
    const ENGINE_VERBS = new Set(['key', 'keys', 'frame', 'map', 'save', 'ping']);
    const sanitizeEngineCommand = (raw) => {
        if (typeof raw !== 'string') return null;
        const cmd = raw.trim();
        if (!cmd || cmd.length > 64 || /[\r\n\0]/.test(cmd)) return null;
        const sp = cmd.indexOf(' ');
        const verb = sp === -1 ? cmd : cmd.slice(0, sp);
        if (!ENGINE_VERBS.has(verb)) return null;
        if (verb === 'keys' && cmd.length > 5 + 16) return null; // client only sends "keys .<dir>"
        return cmd;
    };

    ws.on('message', message => {
        session.lastActivityTime = Date.now();
        const str = message.toString();
        // Respond immediately to latency heartbeat pings or explicit session terminations
        if (str.startsWith('{')) {
            try {
                const parsed = JSON.parse(str);
                if (parsed.t === 'ping') {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ t: 'pong', time: parsed.time }));
                    }
                    return;
                }
                if (parsed.t === 'quit' || parsed.t === 'cancel') {
                    console.log(`[WebSocket] Client explicitly ended session ${session.sessionId}`);
                    gracefulSessionSaveAndExit(session.sessionId, 'Client requested exit.');
                    return;
                }
            } catch (_) {}
        }

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

        // Client sends command line e.g. "key left" or "frame"
        const safe = sanitizeEngineCommand(str);
        if (!safe) return; // silently drop: never forward unknown, JSON, or multi-line input to engine stdin
        if (session.child && session.child.stdin && session.child.stdin.writable) {
            session.child.stdin.write(safe + '\n');
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

function spawnGameSession(ws, request) {
    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const rawUser = urlObj.searchParams.get('user') || urlObj.searchParams.get('char') || null;
    const rawSave = urlObj.searchParams.get('save') || null;
    let user = rawUser ? rawUser.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) : null;
    if (!user && !rawSave) {
        user = 'Adventurer';
    }
    const rawRealm = urlObj.searchParams.get('realm') || 'angband';
    const realm = rawRealm.replace(/[^a-zA-Z0-9_-]/g, '') || 'angband';
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
    const targetSlot = save || user || 'Adventurer';
    const savePath = path.join(engineInfo.saveDir || SAVE_DIR, targetSlot);

    let ownerToken = undefined;
    const reqToken = urlObj.searchParams.get('owner') || '';

    // If we're creating a new character over an existing one, check ownership
    if (isNew && fs.existsSync(savePath)) {
        if (!verifyOwnerToken(savePath, reqToken)) {
            ws.send(JSON.stringify({ t: 'error', message: 'Forbidden: invalid owner token for existing character' }));
            ws.send(JSON.stringify({ t: 'bye', detail: 'Invalid owner token' }));
            ws.close();
            return;
        }
    }

    // Generate token if it's a new character, or if it's a legacy save we are claiming (TOFU)
    if (isNew || !fs.existsSync(getOwnerTokenPath(savePath))) {
        ownerToken = createOwnerToken(savePath);
    }

    const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    ws.send(JSON.stringify({
        t: 'hello',
        sessionId,
        version: '1.0.0',
        realm,
        engineName: engineInfo.name || engineInfo.targetName,
        isFallback: false,
        ownerToken: ownerToken
    }));

    const frontendSwitch = engineInfo.cli?.frontend_switch || '-mbridge';
    const args = [frontendSwitch];
    if (engineInfo.saveDir && engineInfo.cli?.save_dir_switch) {
        args.push(engineInfo.cli.save_dir_switch.replace('{path}', engineInfo.saveDir));
    }
    if (engineInfo.saveDir && engineInfo.cli?.panic_dir_switch) {
        args.push(engineInfo.cli.panic_dir_switch.replace('{path}', path.join(engineInfo.saveDir, 'panic')));
    }
    const saveTokenFormat = engineInfo.cli?.save_token_format || '-u{name}';
    if (save) {
        args.push(saveTokenFormat.replace('{name}', save));
    } else if (user) {
        args.push(saveTokenFormat.replace('{name}', user));
    }
    if (isNew) {
        args.push(engineInfo.cli?.new_char_switch || '-n');
    }

    const engineDir = engineInfo.cwd;

    // If starting a fresh character, purge any stale panic save files so the engine starts cleanly without prompts
    if (isNew) {
        const panicDirs = [
            path.join(engineInfo.saveDir || SAVE_DIR, 'panic'),
            path.join(engineDir, 'lib/user/panic'),
            path.join(engineDir, 'lib/save/panic')
        ];
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
    let child = null;
    let spawnError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            child = spawn(engineInfo.exe, args, {
                cwd: engineDir,
                env: {
                    ...process.env,
                    ...engineInfo.env,
                    LANG: process.env.LANG || 'C.UTF-8',
                    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
                    LC_CTYPE: 'C.UTF-8',
                    TERM: 'xterm-256color',
                    HOME: process.env.HOME || '/app',
                },
                stdio: ['pipe', 'pipe', 'pipe']
            });
            spawnError = null;
            break;
        } catch (err) {
            spawnError = err;
            if ((err.code === 'EBUSY' || err.code === 'ETXTBSY') && attempt < 2) {
                const sleepUntil = Date.now() + 150;
                while (Date.now() < sleepUntil) {}
                continue;
            }
            break;
        }
    }

    if (!child || spawnError) {
        console.error(`[Session Spawn Failed] Unable to spawn engine "${engineInfo.exe}": ${spawnError?.message}`);
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
        user,
        save,
        realm,
        engineInfo,
        phase: 'setup',
        isDead: false,
        disconnectedAt: null,
        disconnectTimer: null,
        lastFrame: null
    };

    activeSessions.set(sessionId, session);

    let lineBuffer = '';
    const stdoutDecoder = new TextDecoder('utf-8');

    child.stdout.on('data', chunk => {
        lineBuffer += stdoutDecoder.decode(chunk, { stream: true });
        let newlineIdx;
        while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
            let line = lineBuffer.substring(0, newlineIdx).trim(); // let: realm tag is spliced in below (E1 fix)
            lineBuffer = lineBuffer.substring(newlineIdx + 1);
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
                        const parsed = JSON.parse(line);
                        if (parsed.phase) session.phase = parsed.phase;
                        if (parsed.player && (parsed.player.dead || (parsed.player.hp !== undefined && parsed.player.hp <= 0 && parsed.player.hp_max > 0))) {
                            session.isDead = true;
                        }
                    } catch (_) {}
                }
                if (line.startsWith('{"t":"hello"')) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.savefile) session.engineSavefile = parsed.savefile;
                        parsed.sessionId = session.sessionId;
                        parsed.realm = session.realm || 'angband';
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
                if (session.ws && session.ws.readyState === 1 /* OPEN */) {
                    // Backpressure Guard: If socket has >64KB queued in OS/Node buffer, drop intermediate visual frames
                    // to prevent latency delay and memory bloat for slow network connections.
                    if (line.startsWith('{"t":"frame"') && session.ws.bufferedAmount > 65536) {
                        return;
                    }
                    session.ws.send(line);
                }
            }
        }
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
        activeSessions.delete(sessionId);
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
        activeSessions.delete(sessionId);
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

    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const rawUser = urlObj.searchParams.get('user') || null;
    const rawSave = urlObj.searchParams.get('save') || null;
    const rawSession = urlObj.searchParams.get('session') || null;
    const isNew = urlObj.searchParams.get('new') === '1' || urlObj.searchParams.get('reroll') === '1';

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
                // VERIFICATION GUARD: Only attach to clientSessionId if it actually matches the requested save/user,
                // or if no specific save/user was requested.
                // If the candidate session was in 'setup' (character creation) while the client requested a saved game,
                // or if the candidate belongs to a different save, REJECT the hijack and let the server spawn the requested save cleanly!
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
            // Search active sessions within the requested realm for a live engine running this character.
            for (const candidate of activeSessions.values()) {
                const candRealm = candidate.realm || 'angband';
                if (candRealm === reqRealm && !candidate.isDead && candidate.child && !candidate.child.killed && candidate.child.exitCode === null) {
                    const candSave = normalizeSessionKey(candidate.save);
                    const candUser = normalizeSessionKey(candidate.user);
                    const candEngineSave = candidate.engineSavefile ? normalizeSessionKey(path.basename(candidate.engineSavefile)) : '';
                    if (candSave === targetKey || candUser === targetKey || candEngineSave === targetKey) {
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
                        console.log(`[WebSocket] Terminating existing session ${sId} in realm ${candRealm} to begin fresh hero for ${targetKey}`);
                        gracefulSessionSaveAndExit(sId, 'Starting new character.');
                    }
                }
            }
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

        const queueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
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
// Every 30 seconds, ping all active sockets. If a socket did not respond with a pong
// since the last cycle (e.g. abrupt carrier drop, dead WiFi, suspended tab), terminate it.
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

// In-Flight Checkpointing: Periodically checkpoint active game sessions to disk every 60s
// so that active battles, dungeon exploration, and player inventory changes are continuously written to disk
// and never lost across unexpected client disconnects, power loss, or container restarts.
setInterval(() => {
    for (const [sessionId, session] of activeSessions.entries()) {
        if (!session.isDead && session.child && !session.child.killed && session.child.exitCode === null && session.child.stdin && session.child.stdin.writable) {
            try {
                session.child.stdin.write('save\n');
            } catch (_) {}
        }
    }
}, 60000).unref();

// Periodic idle session reaper: safely flush saves and release memory for inactive connected sessions
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of activeSessions.entries()) {
        // Disconnected sessions are governed by their own disconnectTimer (DISCONNECT_GRACE_PERIOD_MS)
        if (session.ws && (now - session.lastActivityTime > IDLE_TIMEOUT_MS)) {
            console.log(`[Angband3D Cloud] Reaping idle session ${sessionId} (${Math.round((now - session.lastActivityTime) / 60000)}m inactive). Saving state...`);
            gracefulSessionSaveAndExit(sessionId, 'Session timed out due to 20 minutes of inactivity. Progress has been safely saved.');
        }
    }
}, 30000).unref();

// Graceful container shutdown: terminate child processes before container exit
function gracefulShutdown(signal) {
    console.log(`[Angband3D Cloud] Received ${signal}. Terminating all ${activeSessions.size} active engine sessions...`);
    for (const [sessionId, session] of activeSessions.entries()) {
        try {
            if (session.ws && session.ws.readyState === 1) {
                session.ws.send(JSON.stringify({ t: 'bye', detail: 'Server shutting down' }));
                session.ws.close();
            }
            if (session.child && !session.child.killed) {
                session.child.kill('SIGTERM');
            }
        } catch (_) {}
    }
    activeSessions.clear();
    for (const item of waitingQueue) {
        try {
            if (item.ws && item.ws.readyState === 1) {
                item.ws.send(JSON.stringify({ t: 'bye', detail: 'Server shutting down' }));
                item.ws.close();
            }
        } catch (_) {}
    }
    waitingQueue.length = 0;
    server.close(() => {
        console.log('[Angband3D Cloud] HTTP server closed cleanly. Exiting.');
        process.exit(0);
    });
    setTimeout(() => {
        console.warn('[Angband3D Cloud] Forcing exit after shutdown timeout.');
        process.exit(0);
    }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    console.error('[Angband3D Server Uncaught Exception]', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Angband3D Server Unhandled Rejection]', reason);
});

// Ensure keepAliveTimeout exceeds reverse proxy (Cloudflare/ALB/Nginx) standard 60s idle timeout
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, () => {
    console.log(`[Angband3D Cloud Server] Listening on http://localhost:${PORT}`);
});

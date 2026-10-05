/**
 * Angband3D — Demo Trailer Audio Generator
 * Synthesizes high-fidelity master narration stems and character dialogue barks
 * using MsEdgeTTS (or Gemini Native Audio if configured) and stores them in
 * server/public/assets/audio/demo/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
if (!globalThis.crypto) globalThis.crypto = crypto;
const { MsEdgeTTS, OUTPUT_FORMAT } = require(path.resolve(__dirname, '../server/node_modules/msedge-tts'));

const OUT_DIR = path.resolve(__dirname, '../server/public/assets/audio/demo');
if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
}

const CLIPS = [
    {
        id: 'clip_01_awakening',
        voice: 'en-GB-RyanNeural',
        rate: '-2%',
        pitch: '-1Hz',
        text: 'For thirty years, you mapped the pits of Morgoth through strings of green text on an eighty-column screen. You memorized every glyph, every stat, and every cruel, unforgiving demise. Welcome back to Angband... but open your eyes.'
    },
    {
        id: 'clip_02_merchant',
        voice: 'en-IE-ConnorNeural',
        rate: '+4%',
        pitch: '+2Hz',
        text: 'Ah, another brave fool seeking glory below! Mind your torches, stranger!'
    },
    {
        id: 'clip_03_gotcha_yaw',
        voice: 'en-GB-RyanNeural',
        rate: '-1%',
        pitch: '-1Hz',
        text: 'Rule number one for the veteran: looking around will not get you killed. Camera yaw costs precisely zero turns. Pan the darkness, inspect every shadow, check the ceiling for spiders—the world moves only when you take a step.'
    },
    {
        id: 'clip_04_dual_reality',
        voice: 'en-GB-RyanNeural',
        rate: '-1%',
        pitch: '-1Hz',
        text: 'Miss your glyphs? Fear losing your classic overview? Press Tab. Instantaneous, bit-for-bit Angband 4.2.6 terminal mode. Same menus, same inventory hotkeys, zero compromise. The 3D world and the ASCII matrix are one and the same.'
    },
    {
        id: 'clip_05_spatial_stealth',
        voice: 'en-GB-RyanNeural',
        rate: '-2%',
        pitch: '-1Hz',
        text: 'In 3D, corridors are narrow and corners are blind. But you have ears. 3D spatial audio lets you hear snoring orcs and skittering vermin around the bend before you walk into their line of sight.'
    },
    {
        id: 'clip_06_goblin',
        voice: 'en-GB-ThomasNeural',
        rate: '+10%',
        pitch: '+15Hz',
        text: 'Hssst... quiet in the dark... the man-thing smells of iron and lamp oil...'
    },
    {
        id: 'clip_07_vault_combat',
        voice: 'en-GB-RyanNeural',
        rate: '-1%',
        pitch: '-1Hz',
        text: 'Every item, every spell, every resistance from the 4.2.6 compendium is here. No cooldowns, no action-game shortcuts. Turn-based tactical roguelike survival, exactly as Tolkien and the Devteam intended.'
    },
    {
        id: 'clip_08_dragon',
        voice: 'en-US-ChristopherNeural',
        rate: '-15%',
        pitch: '-12Hz',
        text: 'Who dares disturb the hoard of the deep?!'
    },
    {
        id: 'clip_09_chronicle',
        voice: 'en-GB-RyanNeural',
        rate: '-2%',
        pitch: '-1Hz',
        text: 'Every step of your pilgrimage is penned in real time into the Living Chronicle—voiced as an epic saga, preserving your glorious victories and your most humiliating blunders for eternity.'
    },
    {
        id: 'clip_10_universal_call',
        voice: 'en-GB-RyanNeural',
        rate: '-1%',
        pitch: '-1Hz',
        text: 'Play instantly in your browser, or take it offline with standalone Windows and Android clients. Your save files are universal. Angband 3D awaits. Descend if you dare.'
    }
];

async function generateClip(clip) {
    const outFile = path.join(OUT_DIR, `${clip.id}.mp3`);
    console.log(`[TTS] Synthesizing: ${clip.id} (${clip.voice})...`);

    const tts = new MsEdgeTTS();
    const format = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3 || 'audio-24khz-48kbitrate-mono-mp3';
    await tts.setMetadata(clip.voice, format);

    return new Promise((resolve, reject) => {
        const { audioStream } = tts.toStream(clip.text, {
            rate: clip.rate,
            pitch: clip.pitch,
            volume: '+0%'
        });

        const writeStream = fs.createWriteStream(outFile);
        audioStream.pipe(writeStream);

        writeStream.on('finish', () => {
            const stats = fs.statSync(outFile);
            console.log(`  ✓ Generated ${clip.id}.mp3 (${Math.round(stats.size / 1024)} KB)`);
            resolve();
        });

        writeStream.on('error', err => {
            console.error(`  ✗ Error generating ${clip.id}:`, err);
            reject(err);
        });
    });
}

async function main() {
    console.log(`[Demo Audio Generator] Starting generation of ${CLIPS.length} narration clips...`);
    for (const clip of CLIPS) {
        await generateClip(clip);
        // Brief pause between requests to prevent connection flooding
        await new Promise(r => setTimeout(r, 200));
    }
    console.log('[Demo Audio Generator] All narration clips successfully synthesized!');

    // Also write a master manifest with duration metadata and subtitles for the player
    const manifest = {
        title: 'Angband3D — Official Gameplay Commercial & Veteran Showcase',
        narrator: 'Master Chronicler Enceladus',
        totalDuration: 165, // ~2m 45s
        chapters: [
            { id: 'awakening', title: 'The Awakening', start: 0, end: 25 },
            { id: 'gotcha_yaw', title: 'Gotcha #1: 0-Turn Yaw', start: 25, end: 55 },
            { id: 'dual_reality', title: '[Tab] ASCII Terminal', start: 55, end: 85 },
            { id: 'spatial_stealth', title: '3D Spatial Stealth', start: 85, end: 115 },
            { id: 'vault_combat', title: 'Vault Combat & Tactics', start: 115, end: 140 },
            { id: 'chronicle', title: 'The Living Chronicle', start: 140, end: 155 },
            { id: 'universal_call', title: 'Universal Saves & Play Free', start: 155, end: 165 }
        ],
        subtitles: [
            { start: 1.0, end: 8.5, speaker: 'Enceladus', text: 'For thirty years, you mapped the pits of Morgoth through strings of green text on an eighty-column screen.' },
            { start: 9.0, end: 15.0, speaker: 'Enceladus', text: 'You memorized every glyph, every stat, and every cruel, unforgiving demise.' },
            { start: 15.5, end: 20.0, speaker: 'Enceladus', text: 'Welcome back to Angband... but open your eyes.' },
            { start: 20.8, end: 24.5, speaker: 'Armourer', text: 'Ah, another brave fool seeking glory below! Mind your torches, stranger!' },
            { start: 25.5, end: 32.5, speaker: 'Enceladus', text: 'Rule number one for the veteran: looking around will not get you killed.' },
            { start: 33.0, end: 36.5, speaker: 'Enceladus', text: 'Camera yaw costs precisely zero turns.' },
            { start: 37.0, end: 46.0, speaker: 'Enceladus', text: 'Pan the darkness, inspect every shadow, check the ceiling for spiders—the world moves only when you take a step.' },
            { start: 47.0, end: 54.0, speaker: 'SFX', text: '[Shield Block • Steel Clang • Spider Defeated]' },
            { start: 55.5, end: 60.5, speaker: 'Enceladus', text: 'Miss your glyphs? Fear losing your classic overview? Press Tab.' },
            { start: 61.5, end: 69.0, speaker: 'Enceladus', text: 'Instantaneous, bit-for-bit Angband 4.2.6 terminal mode.' },
            { start: 69.5, end: 77.0, speaker: 'Enceladus', text: 'Same menus, same inventory hotkeys, zero compromise.' },
            { start: 77.5, end: 84.0, speaker: 'Enceladus', text: 'The 3D world and the ASCII matrix are one and the same.' },
            { start: 85.5, end: 92.5, speaker: 'Enceladus', text: 'In 3D, corridors are narrow and corners are blind. But you have ears.' },
            { start: 93.0, end: 104.0, speaker: 'Enceladus', text: '3D spatial audio lets you hear snoring orcs and skittering vermin around the bend before you walk into their line of sight.' },
            { start: 104.5, end: 110.0, speaker: 'Snerk the Snaga', text: 'Hssst... quiet in the dark... the man-thing smells of iron and lamp oil...' },
            { start: 111.0, end: 114.5, speaker: 'SFX', text: '[Infravision Activated • Misty Red Silhouette Revealed]' },
            { start: 115.5, end: 124.0, speaker: 'Enceladus', text: 'Every item, every spell, every resistance from the 4.2.6 compendium is here.' },
            { start: 124.5, end: 128.5, speaker: 'Dragon', text: 'Who dares disturb the hoard of the deep?!' },
            { start: 129.0, end: 133.0, speaker: 'SFX', text: '[Phase Door Teleport • Lightning Blast]' },
            { start: 133.5, end: 139.5, speaker: 'Enceladus', text: 'No cooldowns, no action-game shortcuts. Turn-based tactical roguelike survival.' },
            { start: 140.5, end: 148.0, speaker: 'Enceladus', text: 'Every step of your pilgrimage is penned in real time into the Living Chronicle—voiced as an epic saga.' },
            { start: 148.5, end: 154.5, speaker: 'Enceladus', text: 'Preserving your glorious victories and your most humiliating blunders for eternity.' },
            { start: 155.5, end: 161.0, speaker: 'Enceladus', text: 'Play instantly in your browser, or take it offline with standalone Windows and Android clients.' },
            { start: 161.5, end: 165.0, speaker: 'Enceladus', text: 'Your save files are universal. Angband 3D awaits. Descend if you dare.' }
        ]
    };

    const manifestPath = path.join(OUT_DIR, 'demo_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`[Demo Audio Generator] Wrote manifest to ${manifestPath}`);
}

main().catch(err => {
    console.error('[Demo Audio Generator] Fatal Error:', err);
    process.exit(1);
});

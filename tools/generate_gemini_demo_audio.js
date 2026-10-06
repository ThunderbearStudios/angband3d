/**
 * Angband3D — Gemini Native Audio Demo Voice Generator
 *
 * Calls the local server's Gemini Native Audio endpoint (/api/tts?engine=gemini&voice=...)
 * to synthesize pristine 24kHz studio-quality voice clips using official Gemini voices:
 *  - Enceladus (Master Chronicler / Narrator)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const OUT_DIR = path.join(__dirname, '..', 'server', 'public', 'assets', 'audio', 'demo');

const clips = [
    {
        id: 'clip_01_awakening',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, dramatic energetic storytelling tone',
        text: 'Deep in the forgotten vaults of Morgoth, ancient terror stirs! Lightning wands cleave the gloom, blades clash against draconic scales, and thirty years of legendary roguelike history are reborn in first-person 3D.'
    },
    {
        id: 'clip_02_town_quote',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: 'Welcome to Angband. Every journey begins under the stars of the town square. Stock your pack at the armory, ready your spells, and plunge into the deep.'
    },
    {
        id: 'clip_03_gotcha_yaw',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: 'Rule number one for the veteran: looking around will not get you killed. Camera yaw costs precisely zero turns. Pan the darkness, inspect every corridor, scout the pillars—the world moves only when you take a step.'
    },
    {
        id: 'clip_04_dual_reality',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: 'Miss your glyphs? Fear losing your classic overview? Press Tab. Instantaneous, bit-for-bit Angband 4.2.6 CRT terminal mode. Every dungeon tile, monster letter, and stat line is preserved. The 3D world and the classic matrix are one and the same.'
    },
    {
        id: 'clip_05_kore_terminal',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: "Step through the dungeon in ASCII, open your classic equipment menus with 'e', and return to 3D right where you stand. Seamless, uncompromising dual reality."
    },
    {
        id: 'clip_06_spatial_stealth',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: "In first-person, corridors are narrow and corners are blind. Manage your torchlight, and when the deep closes in, let your ranger's infravision pierce the dark to track lurking predators."
    },
    {
        id: 'clip_07_vault_combat',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: 'At twelve-hundred and fifty feet, the dragon vault opens! Phase Door to break line of sight, unleash lightning wands to soften scales, and strike with Westernesse. Pure turn-based roguelike combat.'
    },
    {
        id: 'clip_08_chronicle_intro',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: 'Every deed is penned in real time into the Living Chronicle. Consult the Voiced Lorekeeper for tactical secrets.'
    },
    {
        id: 'clip_09_lorekeeper_voice',
        voice: 'Aoede',
        directorNote: 'wise ancient scholar, calm mystical lorekeeper',
        text: 'Fire resistance is vital against draconic breath. Don a Ring of Fire Resistance or quaff a Potion of Resist Heat before entering open halls.'
    },
    {
        id: 'clip_10_parley_intro',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: 'And the monsters of the deep hold secrets. Click any creature in the dungeon to parley with authentic characters.'
    },
    {
        id: 'clip_11_creature_voice',
        voice: 'Charon',
        directorNote: 'deep gravelly draconic voice, ancient and menacing',
        text: 'My scales are like iron, and my breath is flame! Fools dare challenge the brood of the deep. Flee, mortal, ere your bones join the embers of the vault!'
    },
    {
        id: 'clip_12_universal_call',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, steady storytelling tone',
        text: 'Angband 3D is one-hundred percent free and open-source on GitHub, built for the community to explore, mod, and improve. Export and load your savefiles universally across Web Browser, Windows PC, and Android APK. The cloud chronicler is hosted on angband3d.com, with complete DIY instructions in the repo to plug in your own keys. The descent awaits.'
    }
];

function fetchAudio(clip) {
    return new Promise((resolve, reject) => {
        const query = new URLSearchParams({
            engine: 'gemini',
            voice: clip.voice,
            text: clip.text,
            gemini_tag: clip.directorNote ? `[${clip.directorNote}]` : ''
        });
        const url = `http://127.0.0.1:8080/api/tts?${query.toString()}`;
        console.log(`[Gemini TTS] Requesting: ${clip.id} (${clip.voice})...`);

        http.get(url, res => {
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${clip.id}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const outPath = path.join(OUT_DIR, `${clip.id}.wav`);
                fs.writeFileSync(outPath, buffer);
                console.log(`[Gemini TTS] ✓ Generated ${clip.id}.wav (${(buffer.length / 1024).toFixed(1)} KB)`);
                resolve({ ...clip, size: buffer.length, path: outPath });
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('================================================================');
    console.log('   Angband3D — Generating Gemini Native Audio Voice Assets      ');
    console.log('================================================================');

    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    const results = [];
    for (const clip of clips) {
        try {
            const res = await fetchAudio(clip);
            results.push(res);
            await new Promise(r => setTimeout(r, 600));
        } catch (err) {
            console.error(`[Error] Failed generating ${clip.id}:`, err.message);
            process.exit(1);
        }
    }

    console.log('================================================================');
    console.log(`Successfully generated ${results.length} voice assets!`);
    console.log('================================================================');
}

main().catch(err => {
    console.error('Fatal error in generator:', err);
    process.exit(1);
});

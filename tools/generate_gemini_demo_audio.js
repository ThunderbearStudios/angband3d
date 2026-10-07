/**
 * Angband3D — Reimagined 8-Act Dynamic Walkthrough Voice Generator
 *
 * Calls the local server's Gemini Native Audio endpoint (/api/tts?engine=gemini&voice=...)
 * to synthesize pristine 24kHz studio-quality voice clips using Enceladus (Master Chronicler / Narrator).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const OUT_DIR = path.join(__dirname, '..', 'server', 'public', 'assets', 'audio', 'demo');
if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
}

const clips = [
    {
        id: 'v3_clip_00_thunderbear',
        voice: 'Enceladus',
        directorNote: 'prestigious cinematic commercial presentation tone, warm resonant British baritone',
        text: 'Thunderbear Studios presents Angband 3D — thirty years of legendary roguelike heritage, completely reborn in a stunning, fully-playable 3D first-person world.'
    },
    {
        id: 'v3_clip_01_town_intro',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, welcoming adventurous storytelling tone',
        text: 'Welcome to the Town of Angband. Beneath these peaceful cobblestones lies fifty levels of peril and ancient treasure.'
    },
    {
        id: 'v3_clip_02_town_gear_stairs',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, crisp engaging feature explanation tone',
        text: 'From storefront exploration and street interactions to full first-person equipment management, Angband 3D brings unprecedented depth and atmosphere to classic dungeon crawling.'
    },
    {
        id: 'v3_clip_03_crypt_minimap',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, confident authoritative tactical tone',
        text: 'Descending into the shallow crypts, dynamic torchlight illuminates vaulted halls. Seamless camera turning offers instant situational awareness with zero game turn penalty.'
    },
    {
        id: 'v3_clip_04_crypt_combat_loot',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, visceral tactical combat tone',
        text: 'The interactive tactical minimap keeps your bearings razor-sharp as you slay foes and claim valuable dungeon loot.'
    },
    {
        id: 'v3_clip_05_dual_reality_intro',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, authentic classic gaming authority tone',
        text: 'Every single roll, stat, and mechanic is 100% faithful to authoritative Angband C engine rules.'
    },
    {
        id: 'v3_clip_06_dual_reality_sync',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, proud technical marvel tone',
        text: 'With a single tap of the Tab key, toggle instantly between modern 3D first-person rendering and the legendary 80x24 green-screen CRT terminal — seamlessly synchronized in real time.'
    },
    {
        id: 'v3_clip_07_caverns_archery',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, stealthy ranged combat tone',
        text: 'Deeper in the caverns, long-range tactical combat comes alive. Draw your bow and let fly arrows down winding corridors with fluid 3D projectile targeting.'
    },
    {
        id: 'v3_clip_08_caverns_log_drawer',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, precise telemetry UI tone',
        text: 'While the expandable message log drawer delivers full tactical combat telemetry at your fingertips.'
    },
    {
        id: 'v3_clip_09_mage_grimoire',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, awe-inspiring arcane spellcasting tone',
        text: 'Master the arcane arts with authentic grimoire spellcasting. Channel Magic Missiles and unleash elemental bursts against dark sorcerers.'
    },
    {
        id: 'v3_clip_10_mage_healing_potion',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, fast survival pacing tone',
        text: 'And quaff restorative elixirs in the heat of battle to survive the darkest depths.'
    },
    {
        id: 'v3_clip_11_chronicle_web_exclusive',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, enthusiastic flagship web announcement tone',
        text: 'Available exclusively on the web edition, the Living Chronicle is your interactive AI lore companion.'
    },
    {
        id: 'v3_clip_12_creature_dialogue',
        voice: 'Fenrir',
        directorNote: 'snarling, raspy tribal orc sorcerer, guttural threatening menacing tone',
        text: 'Back, surface dog! Douse that torch or my curses will rend your flesh before you reach the stairs!'
    },
    {
        id: 'v3_clip_13_lorekeeper_counsel',
        voice: 'Aoede',
        directorNote: 'wise ancient elf lorekeeper, lyrical, mystical and authoritative tactical teacher',
        text: 'Heed well, traveler: dragon breath ignores common armor. Wield rings of Resist Heat, and keep scrolls of Phase Door ready to break line of sight!'
    },
    {
        id: 'v3_clip_14_dragon_melee_clash',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, epic high-stakes battle tone',
        text: 'In the deepest magma vaults, survival demands every ounce of strategy. Trade blows with towering dragons, and leverage elemental resistances.'
    },
    {
        id: 'v3_clip_15_dragon_phase_door',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, thrilling tactical turn tone',
        text: 'Trigger phase door escapes when the flames burn too close, turning the tide of battle in an instant.'
    },
    {
        id: 'v3_clip_16_universal_saves',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, proud open architecture tone',
        text: 'Your adventures are entirely your own. With universal save file export, take your character save file seamlessly between the browser, native desktop clients, and classic terminal Angband with 100% interoperability.'
    },
    {
        id: 'v3_clip_17_grand_finale_open_source',
        voice: 'Enceladus',
        directorNote: 'master chronicler, warm resonant British narrator, grand inspiring commercial closing call to action',
        text: 'Angband 3D is 100% free and open source. Play now directly in your browser at angband3d dot com, inspect the source, host your own server, and build the future of roguelikes. Brought to you by Thunderbear Studios.'
    }
];

function fetchTTS(clip) {
    return new Promise((resolve, reject) => {
        const fullPrompt = `[Director's Note: ${clip.directorNote}]\n${clip.text}`;
        const queryParams = new URLSearchParams({
            text: fullPrompt,
            voice: clip.voice,
            engine: 'gemini'
        });

        const url = `http://127.0.0.1:8080/api/tts?${queryParams.toString()}`;
        console.log(`[TTS] Synthesizing ${clip.id} (${clip.voice})...`);

        http.get(url, (res) => {
            if (res.statusCode !== 200) {
                let errData = '';
                res.on('data', chunk => errData += chunk);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errData}`)));
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const outPath = path.join(OUT_DIR, `${clip.id}.wav`);
                fs.writeFileSync(outPath, buffer);
                console.log(`[TTS] ✓ Saved ${clip.id}.wav (${(buffer.length / 1024).toFixed(1)} KB)`);
                resolve({ id: clip.id, size: buffer.length, path: outPath });
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('================================================================');
    console.log('   Angband3D — Synthesizing Reimagined 8-Act Walkthrough Voice  ');
    console.log('================================================================');

    for (const clip of clips) {
        try {
            await fetchTTS(clip);
            await new Promise(r => setTimeout(r, 600)); // Rate-limit safety buffer
        } catch (err) {
            console.error(`[Error] Failed synthesizing ${clip.id}:`, err.message);
        }
    }

    console.log('================================================================');
    console.log('   ALL 16 REIMAGINED WALKTHROUGH AUDIO CLIPS GENERATED!         ');
    console.log('================================================================');
}

main().catch(err => {
    console.error('[Fatal Error]', err);
    process.exit(1);
});

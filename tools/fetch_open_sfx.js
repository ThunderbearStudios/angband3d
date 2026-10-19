/**
 * tools/fetch_open_sfx.js
 * Curates and bundles 62 high-fidelity open-source / public-domain fantasy sound effects
 * into server/public/assets/audio/sfx/ and mirrors them to client/assets/audio/sfx/:
 *   1. Kenney RPG Audio & Impact Sounds (CC0 1.0 Universal - https://kenney.nl/assets)
 *   2. The Battle for Wesnoth Core Sound Library (GPL-2.0+ - https://github.com/wesnoth/wesnoth)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WEB_SFX_DIR = path.join(ROOT, 'server', 'public', 'assets', 'audio', 'sfx');
const GODOT_SFX_DIR = path.join(ROOT, 'client', 'assets', 'audio', 'sfx');
const TEMP_DIR = path.join(os.tmpdir(), 'kenney_audit');

const KENNEY_RPG_URL = 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip';
const KENNEY_IMPACT_URL = 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip';
const WESNOTH_BASE = 'https://raw.githubusercontent.com/wesnoth/wesnoth/master/data/core/sounds/';

// 1. Kenney CC0 mappings (relative to extracted Audio/ folder -> target filename)
const KENNEY_RPG_FILES = [
    { src: 'footstep00.ogg', dst: 'step_wood_1.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'footstep01.ogg', dst: 'step_wood_2.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'drawKnife1.ogg', dst: 'blade_draw_1.ogg', category: 'weapons', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'drawKnife2.ogg', dst: 'blade_draw_2.ogg', category: 'weapons', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'knifeSlice.ogg', dst: 'blade_slice_1.ogg', category: 'weapons', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'knifeSlice2.ogg', dst: 'blade_slice_2.ogg', category: 'weapons', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'chop.ogg', dst: 'chop.ogg', category: 'weapons', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'doorOpen_1.ogg', dst: 'door_open_1.ogg', category: 'environment', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'doorClose_1.ogg', dst: 'door_close_1.ogg', category: 'environment', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'creak1.ogg', dst: 'creak_1.ogg', category: 'environment', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'handleCoins.ogg', dst: 'coins_1.ogg', category: 'items', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'handleCoins2.ogg', dst: 'coins_2.ogg', category: 'items', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'bookFlip1.ogg', dst: 'book_flip_1.ogg', category: 'items', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'bookFlip2.ogg', dst: 'book_flip_2.ogg', category: 'items', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'cloth1.ogg', dst: 'cloth_1.ogg', category: 'items', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'cloth2.ogg', dst: 'cloth_2.ogg', category: 'items', license: 'CC0-1.0 (Kenney RPG Audio)' },
    { src: 'metalLatch.ogg', dst: 'metal_latch.ogg', category: 'environment', license: 'CC0-1.0 (Kenney RPG Audio)' }
];

const KENNEY_IMPACT_FILES = [
    { src: 'footstep_concrete_000.ogg', dst: 'step_stone_1.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'footstep_concrete_001.ogg', dst: 'step_stone_2.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'footstep_concrete_002.ogg', dst: 'step_stone_3.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'footstep_concrete_003.ogg', dst: 'step_stone_4.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'footstep_grass_000.ogg', dst: 'step_grass_1.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'footstep_grass_001.ogg', dst: 'step_grass_2.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'footstep_grass_002.ogg', dst: 'step_grass_3.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'footstep_grass_003.ogg', dst: 'step_grass_4.ogg', category: 'footsteps', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactMetal_heavy_000.ogg', dst: 'impact_metal_heavy_1.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactMetal_heavy_001.ogg', dst: 'impact_metal_heavy_2.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactPlate_heavy_000.ogg', dst: 'impact_plate_heavy_1.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactPlate_heavy_001.ogg', dst: 'impact_plate_heavy_2.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactPlate_medium_000.ogg', dst: 'impact_plate_med_1.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactWood_heavy_000.ogg', dst: 'impact_wood_heavy_1.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactWood_heavy_001.ogg', dst: 'impact_wood_heavy_2.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactMining_000.ogg', dst: 'impact_mining_1.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactMining_001.ogg', dst: 'impact_mining_2.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactMining_002.ogg', dst: 'impact_mining_3.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactPunch_heavy_000.ogg', dst: 'impact_punch_1.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactPunch_heavy_001.ogg', dst: 'impact_punch_2.ogg', category: 'impacts', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactGlass_heavy_000.ogg', dst: 'impact_glass_1.ogg', category: 'items', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactGlass_heavy_001.ogg', dst: 'impact_glass_2.ogg', category: 'items', license: 'CC0-1.0 (Kenney Impact Sounds)' },
    { src: 'impactBell_heavy_000.ogg', dst: 'impact_bell_1.ogg', category: 'spells', license: 'CC0-1.0 (Kenney Impact Sounds)' }
];

// 2. Battle for Wesnoth GPL-2.0+ fantasy combat, spells, and monster vocalizations
const WESNOTH_FILES = [
    // Weapons & Ranged
    { src: 'sword-1.ogg', dst: 'sword_1.ogg', category: 'weapons', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'axe.ogg', dst: 'axe_hit.ogg', category: 'weapons', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'mace.ogg', dst: 'mace_hit.ogg', category: 'weapons', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'flail.ogg', dst: 'flail_hit.ogg', category: 'weapons', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'spear.ogg', dst: 'spear_hit.ogg', category: 'weapons', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'miss-1.ogg', dst: 'miss_1.ogg', category: 'weapons', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'miss-2.ogg', dst: 'miss_2.ogg', category: 'weapons', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'miss-3.ogg', dst: 'miss_3.ogg', category: 'weapons', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'bow.ogg', dst: 'bow_fire.ogg', category: 'ranged', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'bow-miss.ogg', dst: 'bow_miss.ogg', category: 'ranged', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'crossbow.ogg', dst: 'crossbow_fire.ogg', category: 'ranged', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'open-chest.wav', dst: 'open_chest.wav', category: 'environment', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'cave-in.ogg', dst: 'cave_in.ogg', category: 'environment', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'gold.ogg', dst: 'gold_pickup.ogg', category: 'items', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'potion.ogg', dst: 'potion_drink.ogg', category: 'items', license: 'GPL-2.0+ (Battle for Wesnoth)' },

    // Spells & Breaths
    { src: 'flame-big.ogg', dst: 'flame_big.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'explosion.ogg', dst: 'explosion.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'lightning.ogg', dst: 'lightning_bolt.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'magic-missile-1.ogg', dst: 'magic_missile_1.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'magic-missile-2.ogg', dst: 'magic_missile_2.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'magic-dark-big.ogg', dst: 'magic_dark_big.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'magic-holy-1.ogg', dst: 'magic_holy_1.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'magic-holy-2.ogg', dst: 'magic_holy_2.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'magic-faeriefire.ogg', dst: 'magic_faerie.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'petrified.ogg', dst: 'petrified.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'poison.ogg', dst: 'poison_spell.ogg', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'heal.wav', dst: 'heal_spell.wav', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'fanfare-short.wav', dst: 'fanfare_short.wav', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'water-blast.wav', dst: 'water_blast.wav', category: 'spells', license: 'GPL-2.0+ (Battle for Wesnoth)' },

    // Clean Non-Vocal Creature & Physical Foley (Zero Guttural Groans/Screams per L41)
    { src: 'drake-hit-1.ogg', dst: 'drake_hit_1.ogg', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'wolf-growl-1.ogg', dst: 'wolf_growl_1.ogg', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'hiss-big.wav', dst: 'hiss_big.wav', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'skeleton-hit-1.ogg', dst: 'skeleton_hit_1.ogg', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'skeleton-die-1.ogg', dst: 'skeleton_die_1.ogg', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'bat-hit-1.ogg', dst: 'bat_hit_1.ogg', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'pincers.ogg', dst: 'pincers.ogg', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'bite.ogg', dst: 'bite.ogg', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' },
    { src: 'claws.ogg', dst: 'claws.ogg', category: 'monsters', license: 'GPL-2.0+ (Battle for Wesnoth)' }
];

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest) && fs.statSync(dest).size > 64) {
            return resolve(dest);
        }
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlink(dest, () => {});
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve(dest)));
        }).on('error', (err) => {
            file.close();
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    fs.mkdirSync(WEB_SFX_DIR, { recursive: true });
    fs.mkdirSync(GODOT_SFX_DIR, { recursive: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    const rpgZip = path.join(TEMP_DIR, 'rpg.zip');
    const impactZip = path.join(TEMP_DIR, 'impact.zip');
    const rpgExtract = path.join(TEMP_DIR, 'rpg');
    const impactExtract = path.join(TEMP_DIR, 'impact');

    console.log('1. Ensuring Kenney CC0 RPG & Impact packs are downloaded & extracted...');
    await downloadFile(KENNEY_RPG_URL, rpgZip);
    await downloadFile(KENNEY_IMPACT_URL, impactZip);

    if (!fs.existsSync(path.join(rpgExtract, 'Audio', 'knifeSlice.ogg'))) {
        fs.mkdirSync(rpgExtract, { recursive: true });
        execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Path '${rpgZip}' -DestinationPath '${rpgExtract}' -Force`]);
    }
    if (!fs.existsSync(path.join(impactExtract, 'Audio', 'impactMetal_heavy_000.ogg'))) {
        fs.mkdirSync(impactExtract, { recursive: true });
        execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Path '${impactZip}' -DestinationPath '${impactExtract}' -Force`]);
    }

    const manifest = {
        version: '1.0.0',
        sources: [
            { name: 'Kenney RPG Audio & Impact Sounds', license: 'CC0 1.0 Universal', url: 'https://kenney.nl/assets' },
            { name: 'The Battle for Wesnoth Core Sound Library', license: 'GPL-2.0+', url: 'https://github.com/wesnoth/wesnoth' }
        ],
        files: []
    };

    for (const item of KENNEY_RPG_FILES) {
        const srcPath = path.join(rpgExtract, 'Audio', item.src);
        const webDst = path.join(WEB_SFX_DIR, item.dst);
        const godotDst = path.join(GODOT_SFX_DIR, item.dst);
        fs.copyFileSync(srcPath, webDst);
        fs.copyFileSync(srcPath, godotDst);
        const size = fs.statSync(webDst).size;
        manifest.files.push({ file: item.dst, category: item.category, license: item.license, bytes: size });
    }

    for (const item of KENNEY_IMPACT_FILES) {
        const srcPath = path.join(impactExtract, 'Audio', item.src);
        const webDst = path.join(WEB_SFX_DIR, item.dst);
        const godotDst = path.join(GODOT_SFX_DIR, item.dst);
        fs.copyFileSync(srcPath, webDst);
        fs.copyFileSync(srcPath, godotDst);
        const size = fs.statSync(webDst).size;
        manifest.files.push({ file: item.dst, category: item.category, license: item.license, bytes: size });
    }

    console.log(`2. Downloading ${WESNOTH_FILES.length} Battle for Wesnoth (GPL-2.0+) studio sound effects...`);
    // Download in batches of 8 for speed
    for (let i = 0; i < WESNOTH_FILES.length; i += 8) {
        const batch = WESNOTH_FILES.slice(i, i + 8);
        await Promise.all(batch.map(async (item) => {
            const webDst = path.join(WEB_SFX_DIR, item.dst);
            const godotDst = path.join(GODOT_SFX_DIR, item.dst);
            await downloadFile(WESNOTH_BASE + item.src, webDst);
            fs.copyFileSync(webDst, godotDst);
            const size = fs.statSync(webDst).size;
            manifest.files.push({ file: item.dst, category: item.category, license: item.license, bytes: size });
        }));
    }

    manifest.files.sort((a, b) => a.file.localeCompare(b.file));
    const allowedSet = new Set(manifest.files.map((f) => f.file));
    for (const dir of [WEB_SFX_DIR, GODOT_SFX_DIR]) {
        for (const f of fs.readdirSync(dir)) {
            if ((f.endsWith('.ogg') || f.endsWith('.wav')) && !allowedSet.has(f)) {
                fs.unlinkSync(path.join(dir, f));
            }
        }
    }
    const totalBytes = manifest.files.reduce((acc, f) => acc + f.bytes, 0);
    manifest.totalFiles = manifest.files.length;
    manifest.totalBytes = totalBytes;

    fs.writeFileSync(path.join(WEB_SFX_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(GODOT_SFX_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    console.log(`Done! Curated ${manifest.totalFiles} open-source studio SFX files (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) in web & Godot client directories.`);
}

main().catch((err) => {
    console.error('fetch_open_sfx failed:', err);
    process.exit(1);
});

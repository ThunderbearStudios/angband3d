const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = 'C:\\msys64\\mingw64\\bin\\ffmpeg.exe';
const video = path.resolve('server/public/assets/video/angband3d_demo.mp4');
const outDir = path.resolve('server/public/assets/video/frames');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const timestamps = [
    { name: 'kf_00_splash_pure_logo_8s', time: '00:00:08' },
    { name: 'kf_01_town_street_shops_24s', time: '00:00:24' },
    { name: 'kf_02_town_dog_interaction_28s', time: '00:00:28' },
    { name: 'kf_03_town_equipment_screen_34s', time: '00:00:34' },
    { name: 'kf_04_town_stairs_descent_45s', time: '00:00:45' },
    { name: 'kf_05_crypt_minimap_yaw_52s', time: '00:00:52' },
    { name: 'kf_06_crypt_kobold_combat_loot_73s', time: '00:01:13' },
    { name: 'kf_07_dual_reality_terminal_crt_80s', time: '00:01:20' },
    { name: 'kf_08_dual_reality_3d_corridor_100s', time: '00:01:40' },
    { name: 'kf_09_caverns_ranged_archery_114s', time: '00:01:54' },
    { name: 'kf_10_caverns_message_log_drawer_127s', time: '00:02:07' },
    { name: 'kf_11_mage_grimoire_spell_cast_140s', time: '00:02:20' },
    { name: 'kf_12_mage_potion_quaff_153s', time: '00:02:33' },
    { name: 'kf_13_chronicle_dock_opened_164s', time: '00:02:44' },
    { name: 'kf_13b_chronicle_orc_shaman_dialogue_173s', time: '00:02:53' },
    { name: 'kf_14_chronicle_lorekeeper_counsel_188s', time: '00:03:08' },
    { name: 'kf_15_dragon_target_fire_clash_205s', time: '00:03:25' },
    { name: 'kf_16_dragon_phase_door_escape_218s', time: '00:03:38' },
    { name: 'kf_17_pause_menu_save_download_230s', time: '00:03:50' },
    { name: 'kf_18_outro_clean_insignia_255s', time: '00:04:15' }
];

console.log('=== Extracting Keyframes from 275s Master Video ===');
for (const ts of timestamps) {
    const outPath = path.join(outDir, ts.name + '.png');
    execSync(`"${ffmpeg}" -y -ss ${ts.time} -accurate_seek -i "${video}" -frames:v 1 -update 1 "${outPath}"`, { stdio: 'inherit' });
    const stat = fs.statSync(outPath);
    console.log(`[Extracted] ${ts.name}.png (${(stat.size / 1024).toFixed(1)} KB)`);
}

const mp4Stat = fs.statSync(video);
const webmStat = fs.statSync(path.resolve('server/public/assets/video/angband3d_demo.webm'));
console.log(`MP4: ${(mp4Stat.size / (1024*1024)).toFixed(2)} MB`);
console.log(`WebM: ${(webmStat.size / (1024*1024)).toFixed(2)} MB`);

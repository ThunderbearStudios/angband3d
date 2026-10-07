const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = 'C:\\msys64\\mingw64\\bin\\ffprobe.exe';
const audioDir = path.resolve('server/public/assets/audio/demo');

const clips = [
    { id: 'v3_clip_00_thunderbear' },
    { id: 'v3_clip_01_town_intro' },
    { id: 'v3_clip_02_town_gear_stairs' },
    { id: 'v3_clip_03_crypt_minimap' },
    { id: 'v3_clip_04_crypt_combat_loot' },
    { id: 'v3_clip_05_dual_reality_intro' },
    { id: 'v3_clip_06_dual_reality_sync' },
    { id: 'v3_clip_07_caverns_archery' },
    { id: 'v3_clip_08_caverns_log_drawer' },
    { id: 'v3_clip_09_mage_grimoire' },
    { id: 'v3_clip_10_mage_healing_potion' },
    { id: 'v3_clip_11_chronicle_web_exclusive' },
    { id: 'v3_clip_12_aoede_voice_dialogue' },
    { id: 'v3_clip_13_creature_click_inspect' },
    { id: 'v3_clip_14_dragon_melee_clash' },
    { id: 'v3_clip_15_dragon_phase_door' },
    { id: 'v3_clip_16_universal_saves' },
    { id: 'v3_clip_17_grand_finale_open_source' }
];

console.log('=== Verifying Exact Clip Durations ===');
for (const c of clips) {
    const file = path.join(audioDir, c.id + '.wav');
    const out = execSync(`"${ffmpeg}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`).toString().trim();
    c.duration = parseFloat(out);
    console.log(`${c.id}: ${c.duration.toFixed(2)}s`);
}

// Compute clean schedule
console.log('\n=== Calculating Clean Mutual-Exclusion Timeline Schedule ===');
let currentTime = 1.0; // Start at 1.0s
for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    c.start = currentTime;
    c.end = c.start + c.duration;
    console.log(`[Clip ${i}] ${c.id.padEnd(28)} start=${c.start.toFixed(2)}s end=${c.end.toFixed(2)}s (len ${c.duration.toFixed(2)}s)`);
    // Buffer for next clip
    currentTime = c.end + 1.5; // 1.5s clean silent buffer
}
console.log(`Total speech duration up to: ${currentTime.toFixed(2)}s`);

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = 'C:\\msys64\\mingw64\\bin\\ffmpeg.exe';
const video = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'angband3d_demo.mp4');
const outDir = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'frames');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

const times = [
    { t: '00:00:02', name: 'act0_thunderbear_intro.png' },
    { t: '00:00:15', name: 'act1_town_street.png' },
    { t: '00:00:32', name: 'act1_town_stairs.png' },
    { t: '00:00:52', name: 'act2_crypt_vault.png' },
    { t: '00:01:15', name: 'act3_terminal_matrix.png' },
    { t: '00:01:30', name: 'act3_terminal_equipment.png' },
    { t: '00:01:55', name: 'act4_stealth_snake.png' },
    { t: '00:02:16', name: 'act5_combat_dragon.png' },
    { t: '00:02:45', name: 'act6_chronicle_lorekeeper.png' },
    { t: '00:03:15', name: 'act7_creature_chat.png' },
    { t: '00:03:36', name: 'act8_pause_saves.png' },
    { t: '00:04:02', name: 'act8_outro_thunderbear.png' }
];

times.forEach(item => {
    const out = path.join(outDir, item.name);
    execSync(`"${ffmpeg}" -y -ss ${item.t} -i "${video}" -vframes 1 "${out}"`, { stdio: 'pipe' });
    console.log(`Extracted ${item.name} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
});

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'C:\\msys64\\mingw64\\bin\\ffmpeg.exe';
const ROOT_DIR = path.resolve(__dirname, '..');
const VIDEO_DIR = path.join(ROOT_DIR, 'server', 'public', 'assets', 'video');
const AUDIO_DIR = path.join(ROOT_DIR, 'server', 'public', 'assets', 'audio', 'demo');
const RAW_VIDEO_PATH = path.join(VIDEO_DIR, 'raw_gameplay.webm');
const OUT_WEBM_PATH = path.join(VIDEO_DIR, 'angband3d_demo.webm');

const clips = [
    { file: 'clip_01_awakening.mp3', delayMs: 1000 },
    { file: 'clip_02_merchant.mp3', delayMs: 20800 },
    { file: 'clip_03_gotcha_yaw.mp3', delayMs: 25500 },
    { file: 'clip_04_dual_reality.mp3', delayMs: 55500 },
    { file: 'clip_05_spatial_stealth.mp3', delayMs: 85500 },
    { file: 'clip_06_goblin.mp3', delayMs: 104500 },
    { file: 'clip_07_vault_combat.mp3', delayMs: 115500 },
    { file: 'clip_08_dragon.mp3', delayMs: 124500 },
    { file: 'clip_09_chronicle.mp3', delayMs: 140500 },
    { file: 'clip_10_universal_call.mp3', delayMs: 155500 },
];

let ffmpegInputs = ['-y', '-i', RAW_VIDEO_PATH];
let filterDelays = [];
let mixInputs = [];

clips.forEach((clip, idx) => {
    const clipPath = path.join(AUDIO_DIR, clip.file);
    ffmpegInputs.push('-i', clipPath);
    const streamIdx = idx + 1;
    filterDelays.push(`[${streamIdx}:a]adelay=${clip.delayMs}|${clip.delayMs}[a${streamIdx}]`);
    mixInputs.push(`[a${streamIdx}]`);
});

const filterComplex = `${filterDelays.join(';')};${mixInputs.join('')}amix=inputs=${clips.length}:dropout_transition=0:normalize=0[voice];[voice]volume=1.4[outa]`;

const webmArgs = [
    ...ffmpegInputs,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[outa]',
    '-c:v', 'copy',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-shortest',
    OUT_WEBM_PATH
];

console.log('Rendering WebM master via stream copy...');
const t0 = Date.now();
execSync(`"${FFMPEG_PATH}" ${webmArgs.map(a => `"${a}"`).join(' ')}`, { stdio: 'inherit' });
console.log('Done in ' + ((Date.now() - t0)/1000).toFixed(1) + 's, size: ' + (fs.statSync(OUT_WEBM_PATH).size / (1024*1024)).toFixed(2) + ' MB');

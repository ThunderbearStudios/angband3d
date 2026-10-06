/**
 * Angband3D — Automated 1080p Actual Gameplay Walkthrough Capture & Video Muxer
 *
 * Launches local Chrome with GPU acceleration, runs the authentic 8-act multi-depth
 * in-game walkthrough across multiple dungeon depths, records pristine 1080p video
 * from the WebGL viewport & classic terminal, and uses FFmpeg to mux with the
 * 12 Gemini Native voice audio stems.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FFMPEG_PATH = 'C:\\msys64\\mingw64\\bin\\ffmpeg.exe';
const ROOT_DIR = path.resolve(__dirname, '..');
const VIDEO_DIR = path.join(ROOT_DIR, 'server', 'public', 'assets', 'video');
const AUDIO_DIR = path.join(ROOT_DIR, 'server', 'public', 'assets', 'audio', 'demo');

const RAW_VIDEO_PATH = path.join(VIDEO_DIR, 'raw_gameplay.webm');
const OUT_MP4_PATH = path.join(VIDEO_DIR, 'angband3d_demo.mp4');
const OUT_WEBM_PATH = path.join(VIDEO_DIR, 'angband3d_demo.webm');

async function main() {
    console.log('================================================================');
    console.log('   Angband3D — Broadcast Gameplay Walkthrough Capture & Muxer   ');
    console.log('================================================================');

    if (!fs.existsSync(CHROME_PATH)) {
        console.error(`[Error] Chrome executable not found at: ${CHROME_PATH}`);
        process.exit(1);
    }
    if (!fs.existsSync(FFMPEG_PATH)) {
        console.error(`[Error] FFmpeg executable not found at: ${FFMPEG_PATH}`);
        process.exit(1);
    }

    if (!fs.existsSync(VIDEO_DIR)) {
        fs.mkdirSync(VIDEO_DIR, { recursive: true });
    }

    // Clean existing raw video
    if (fs.existsSync(RAW_VIDEO_PATH)) {
        try { fs.unlinkSync(RAW_VIDEO_PATH); } catch (_) {}
    }

    // Restore golden pristine demo save files before recording
    const BACKUP_DIR = path.join(ROOT_DIR, 'tools', 'demo_saves_backup');
    const SAVE_DIRS = [
        path.join(ROOT_DIR, 'engine', 'build', 'game', 'lib', 'save'),
        path.join(ROOT_DIR, 'engine', 'build', 'game', 'lib', 'user', 'save')
    ];
    if (fs.existsSync(BACKUP_DIR)) {
        console.log('[Saves] Restoring golden demo save states for 100% authentic playthrough...');
        const backupFiles = fs.readdirSync(BACKUP_DIR);
        for (const sDir of SAVE_DIRS) {
            if (fs.existsSync(sDir)) {
                for (const bFile of backupFiles) {
                    const src = path.join(BACKUP_DIR, bFile);
                    const dest = path.join(sDir, bFile);
                    fs.copyFileSync(src, dest);
                }
            }
        }
        console.log('[Saves] ✓ Golden demo saves restored (demo_town, demo_crypt, demo_vault, demo_stealth, demo_combat).');
    }

    const tempProfileDir = path.join(require('os').tmpdir(), 'angband3d_chrome_rec_' + Date.now());
    console.log(`[Chrome] Using temporary profile: ${tempProfileDir}`);

    const chromeArgs = [
        '--remote-debugging-port=9222',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1920,1080',
        '--headless=new',
        '--enable-usermedia-screen-capturing',
        '--auto-select-desktop-capture-source=Entire screen',
        '--use-fake-ui-for-media-stream',
        '--allow-http-screen-capture',
        '--autoplay-policy=no-user-gesture-required',
        `--user-data-dir=${tempProfileDir}`,
        'http://127.0.0.1:8080/?autoplay=1&char=demo_town&record_walkthrough=1'
    ];

    console.log(`[Chrome] Launching Chrome for real gameplay capture...`);
    const chromeProc = spawn(CHROME_PATH, chromeArgs, { stdio: 'ignore' });

    // Stream browser console logs to terminal via CDP
    const { WebSocket } = require('../server/node_modules/ws');
    const http = require('http');
    setTimeout(async () => {
        try {
            const targets = await new Promise((resolve, reject) => {
                http.get('http://127.0.0.1:9222/json', res => {
                    let d = '';
                    res.on('data', c => d += c);
                    res.on('end', () => resolve(JSON.parse(d)));
                }).on('error', reject);
            });
            const pt = targets.find(t => t.type === 'page');
            if (pt) {
                const cdp = new WebSocket(pt.webSocketDebuggerUrl);
                cdp.on('open', () => {
                    cdp.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
                    cdp.send(JSON.stringify({
                        id: 2,
                        method: 'Emulation.setDeviceMetricsOverride',
                        params: { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }
                    }));
                });
                cdp.on('message', m => {
                    try {
                        const parsed = JSON.parse(m);
                        if (parsed.method === 'Runtime.consoleAPICalled') {
                            const str = parsed.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
                            if (str.includes('[Recorder]') || str.includes('[Angband3D]')) {
                                console.log(`[Browser] ${str}`);
                            }
                        }
                    } catch (_) {}
                });
            }
        } catch (_) {}
    }, 2000);

    console.log('[Recorder] Waiting for walkthrough recording to complete (~240 seconds)...');
    const startTime = Date.now();
    let recorded = false;

    // Poll for raw_gameplay.webm to appear and finish writing
    while ((Date.now() - startTime) < 420000) { // 420s timeout (7 minutes)
        await new Promise(r => setTimeout(r, 4000));
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

        if (fs.existsSync(RAW_VIDEO_PATH)) {
            const stat1 = fs.statSync(RAW_VIDEO_PATH);
            if (stat1.size > 500000) { // At least 500KB
                console.log(`[Recorder] Detected uploaded video (${(stat1.size / (1024 * 1024)).toFixed(2)} MB). Waiting for file flush...`);
                await new Promise(r => setTimeout(r, 3000));
                const stat2 = fs.statSync(RAW_VIDEO_PATH);
                if (stat2.size === stat1.size) {
                    console.log(`[Recorder] Video upload complete! Final size: ${(stat2.size / (1024 * 1024)).toFixed(2)} MB`);
                    recorded = true;
                    break;
                }
            }
        } else {
            process.stdout.write(`\r[Recorder] Recording progress: ${elapsedSec}s / 255s...`);
        }
    }

    console.log('\n[Chrome] Terminating browser instance...');
    try {
        chromeProc.kill('SIGTERM');
    } catch (_) {}

    // Clean up chrome temp profile
    setTimeout(() => {
        try {
            fs.rmSync(tempProfileDir, { recursive: true, force: true });
        } catch (_) {}
    }, 2000);

    if (!recorded || !fs.existsSync(RAW_VIDEO_PATH)) {
        console.error('[Error] Recording failed or timed out. raw_gameplay.webm was not created.');
        process.exit(1);
    }

    // -------------------------------------------------------------
    // FFmpeg Audio/Video Muxing Stage (12 Gemini Native Audio Stems)
    // -------------------------------------------------------------
    console.log('================================================================');
    console.log('   Muxing Gemini Native Voice Stems & Real Gameplay Video       ');
    console.log('================================================================');

    const clips = [
        { file: 'clip_01_awakening.wav', delayMs: 3800 },
        { file: 'clip_02_town_quote.wav', delayMs: 25800 },
        { file: 'clip_03_gotcha_yaw.wav', delayMs: 41500 },
        { file: 'clip_04_dual_reality.wav', delayMs: 63500 },
        { file: 'clip_05_kore_terminal.wav', delayMs: 89000 },
        { file: 'clip_06_spatial_stealth.wav', delayMs: 106500 },
        { file: 'clip_07_vault_combat.wav', delayMs: 126500 },
        { file: 'clip_08_chronicle_intro.wav', delayMs: 148000 },
        { file: 'clip_09_lorekeeper_voice.wav', delayMs: 161500 },
        { file: 'clip_10_parley_intro.wav', delayMs: 180000 },
        { file: 'clip_11_creature_voice.wav', delayMs: 191500 },
        { file: 'clip_12_universal_call.wav', delayMs: 211000 }
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

    const filterComplex = `${filterDelays.join(';')};${mixInputs.join('')}amix=inputs=${clips.length}:dropout_transition=0:normalize=0[voice];[voice]volume=1.35[outa]`;

    // 1. Generate MP4 (H.264 / AAC for universal compatibility)
    console.log(`[FFmpeg] Rendering 1080p MP4 master -> ${OUT_MP4_PATH}...`);
    const mp4Args = [
        ...ffmpegInputs,
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '21',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        OUT_MP4_PATH
    ];

    try {
        execSync(`"${FFMPEG_PATH}" ${mp4Args.map(a => `"${a}"`).join(' ')}`, { stdio: 'inherit' });
        console.log(`[FFmpeg] ✓ Successfully created MP4: ${(fs.statSync(OUT_MP4_PATH).size / (1024 * 1024)).toFixed(2)} MB`);
    } catch (err) {
        console.error('[FFmpeg] Error creating MP4:', err.message);
    }

    // 2. Generate WebM (VP9 / Opus for open web standard)
    console.log(`[FFmpeg] Rendering WebM master -> ${OUT_WEBM_PATH}...`);
    const webmArgs = [
        ...ffmpegInputs,
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[outa]',
        '-c:v', 'copy',
        '-c:a', 'libopus',
        '-b:a', '128k',
        OUT_WEBM_PATH
    ];

    try {
        execSync(`"${FFMPEG_PATH}" ${webmArgs.map(a => `"${a}"`).join(' ')}`, { stdio: 'inherit' });
        console.log(`[FFmpeg] ✓ Successfully created WebM: ${(fs.statSync(OUT_WEBM_PATH).size / (1024 * 1024)).toFixed(2)} MB`);
    } catch (err) {
        console.error('[FFmpeg] Error creating WebM:', err.message);
    }

    console.log('================================================================');
    console.log('   WALKTHROUGH RECORDING & VIDEO MUXING COMPLETE!               ');
    console.log('================================================================');
}

main().catch(err => {
    console.error('[Fatal Error]', err);
    process.exit(1);
});

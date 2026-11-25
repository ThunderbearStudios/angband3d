#!/usr/bin/env node
/**
 * tools/transcode_music_opus.js
 *
 * Transcodes all server/public/assets/audio music tracks from MP3 -> 64 kbps VBR Opus (.ogg)
 * using ffmpeg libopus with metadata preserved, leaving /assets/audio/sfx/*.ogg untouched.
 *
 * Usage:
 *   node tools/transcode_music_opus.js [--remove-mp3]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'server', 'public', 'assets', 'audio');
const REMOVE_MP3 = process.argv.includes('--remove-mp3');

function findFfmpeg() {
    const candidates = ['ffmpeg'];
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        const wingetRoot = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
        if (fs.existsSync(wingetRoot)) {
            for (const pkg of fs.readdirSync(wingetRoot)) {
                if (!pkg.startsWith('Gyan.FFmpeg')) continue;
                const pkgDir = path.join(wingetRoot, pkg);
                for (const sub of fs.readdirSync(pkgDir)) {
                    const exe = path.join(pkgDir, sub, 'bin', 'ffmpeg.exe');
                    if (fs.existsSync(exe)) candidates.unshift(exe);
                }
            }
        }
    }
    for (const cmd of candidates) {
        try {
            execFileSync(cmd, ['-version'], { stdio: 'pipe' });
            return cmd;
        } catch (_) {}
    }
    throw new Error('ffmpeg not found on PATH or WinGet packages');
}

function collectMp3Files(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectMp3Files(full, out);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) out.push(full);
    }
    return out;
}

function isValidOgg(filePath) {
    if (!fs.existsSync(filePath)) return false;
    const st = fs.statSync(filePath);
    if (st.size <= 1024) return false;
    const fd = fs.openSync(filePath, 'r');
    try {
        const hdr = Buffer.alloc(4);
        fs.readSync(fd, hdr, 0, 4, 0);
        return hdr.toString('ascii') === 'OggS';
    } finally {
        fs.closeSync(fd);
    }
}

function main() {
    const ffmpeg = findFfmpeg();
    const mp3Files = collectMp3Files(AUDIO_DIR).sort();
    if (mp3Files.length === 0) {
        console.log('[transcode_music_opus] No .mp3 files found; checking existing .ogg files.');
        return;
    }

    let beforeBytes = 0;
    let afterBytes = 0;
    let converted = 0;
    let failed = 0;

    for (const mp3Path of mp3Files) {
        const oggPath = mp3Path.slice(0, -4) + '.ogg';
        const srcSize = fs.statSync(mp3Path).size;
        beforeBytes += srcSize;

        try {
            execFileSync(ffmpeg, [
                '-y', '-v', 'error',
                '-i', mp3Path,
                '-vn', '-map_metadata', '0',
                '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on',
                '-compression_level', '10', '-application', 'audio',
                oggPath
            ], { stdio: 'pipe' });

            if (!isValidOgg(oggPath)) {
                throw new Error('Output invalid or missing OggS header');
            }
            const dstSize = fs.statSync(oggPath).size;
            afterBytes += dstSize;
            converted++;
        } catch (err) {
            failed++;
            console.error(`[transcode_music_opus] FAIL ${path.relative(ROOT, mp3Path)}: ${err.message}`);
        }
    }

    if (failed > 0) {
        console.error(`[transcode_music_opus] Aborting: ${failed} file(s) failed; source .mp3 retained.`);
        process.exit(1);
    }

    if (REMOVE_MP3) {
        for (const mp3Path of mp3Files) {
            fs.unlinkSync(mp3Path);
        }
    }

    const beforeMb = (beforeBytes / (1024 * 1024)).toFixed(2);
    const afterMb = (afterBytes / (1024 * 1024)).toFixed(2);
    const pct = ((1 - afterBytes / Math.max(1, beforeBytes)) * 100).toFixed(1);
    console.log(`[transcode_music_opus] converted=${converted}, failed=${failed}, removedMp3=${REMOVE_MP3}, ${beforeMb} MB -> ${afterMb} MB (-${pct}%)`);
}

main();

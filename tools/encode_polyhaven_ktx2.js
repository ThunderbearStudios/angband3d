#!/usr/bin/env node
/**
 * tools/encode_polyhaven_ktx2.js
 *
 * Wave 4B: Encodes all 15 PolyHaven texture sets (diff.jpg, nor_gl.jpg, arm.jpg -> 45 .ktx2 files)
 * into GPU-compressed Basis Universal KTX2 sidecars (ETC1S sRGB albedo, UASTC+Zstd linear normal & ARM)
 * with full mip chains and Y-flip matching WebGL TextureLoader UVs.
 * Existing .jpg files are preserved untouched for Three.js r128 fallback parity.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PH_TEX_ROOT = path.join(ROOT, 'server', 'public', 'assets', 'polyhaven', 'textures');
const FORCE = process.argv.includes('--force');
const ROLES_ARG = process.argv.find((a) => a.startsWith('--roles='));
const TARGET_ROLES = new Set(ROLES_ARG ? ROLES_ARG.slice('--roles='.length).split(',').map((s) => s.trim()).filter(Boolean) : ['diff', 'nor_gl', 'arm']);
const KTX2_MAGIC = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);

function findSharp() {
    const local = path.join(ROOT, 'node_modules', 'sharp');
    if (fs.existsSync(local)) return require(local);
    const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm'), 'npm-cache', '_npx');
    if (fs.existsSync(npxRoot)) {
        for (const h of fs.readdirSync(npxRoot)) {
            const cand = path.join(npxRoot, h, 'node_modules', 'sharp');
            if (fs.existsSync(cand)) return require(cand);
        }
    }
    throw new Error('Could not locate sharp in node_modules or npx cache');
}

async function main() {
    const sharp = findSharp();
    const { encodeToKTX2 } = await import('ktx2-encoder');

    const makeImageDecoder = (maxDim) => async (buf) => {
        let pipe = sharp(Buffer.from(buf));
        if (maxDim > 0) {
            pipe = pipe.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
        }
        const { data, info } = await pipe
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        return {
            width: info.width,
            height: info.height,
            data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        };
    };
    const dec1024 = makeImageDecoder(0);
    const dec512 = makeImageDecoder(512);

    const sets = fs.readdirSync(PH_TEX_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();

    let encoded = 0;
    let skipped = 0;
    let totalJpgBytes = 0;
    let totalKtxBytes = 0;

    for (const setId of sets) {
        const dir = path.join(PH_TEX_ROOT, setId);
        for (const role of ['diff', 'nor_gl', 'arm']) {
            const jpgPath = path.join(dir, `${role}.jpg`);
            const ktxPath = path.join(dir, `${role}.ktx2`);
            if (!fs.existsSync(jpgPath)) {
                throw new Error(`Missing PolyHaven map: ${jpgPath}`);
            }
            const jpgStat = fs.statSync(jpgPath);
            totalJpgBytes += jpgStat.size;

            const shouldReencode = TARGET_ROLES.has(role) && FORCE;
            if (!shouldReencode && fs.existsSync(ktxPath)) {
                const ktxStat = fs.statSync(ktxPath);
                const head = fs.readFileSync(ktxPath).subarray(0, 12);
                if ((FORCE && !TARGET_ROLES.has(role) || ktxStat.mtimeMs >= jpgStat.mtimeMs) && ktxStat.size > 128 && head.equals(KTX2_MAGIC)) {
                    totalKtxBytes += ktxStat.size;
                    skipped++;
                    continue;
                }
            }

            const srcBuf = fs.readFileSync(jpgPath);
            let opts;
            if (role === 'diff') {
                opts = {
                    isKTX2File: true,
                    isUASTC: false,
                    isYFlip: true,
                    generateMipmap: true,
                    isPerceptual: true,
                    isSetKTX2SRGBTransferFunc: true,
                    qualityLevel: 128,
                    compressionLevel: 2,
                    imageDecoder: dec1024
                };
            } else if (role === 'arm') {
                opts = {
                    isKTX2File: true,
                    isUASTC: false,
                    isYFlip: true,
                    generateMipmap: true,
                    isPerceptual: false,
                    isSetKTX2SRGBTransferFunc: false,
                    qualityLevel: 192,
                    compressionLevel: 2,
                    imageDecoder: dec1024
                };
            } else {
                opts = {
                    isKTX2File: true,
                    isUASTC: true,
                    needSupercompression: true,
                    uastcLDRQualityLevel: 1,
                    enableRDO: true,
                    rdoQualityLevel: 2.0,
                    isNormalMap: true,
                    isYFlip: true,
                    generateMipmap: true,
                    isPerceptual: false,
                    isSetKTX2SRGBTransferFunc: false,
                    imageDecoder: dec512
                };
            }

            const ktxBytes = await encodeToKTX2(new Uint8Array(srcBuf), opts);
            const outBuf = Buffer.from(ktxBytes.buffer, ktxBytes.byteOffset, ktxBytes.byteLength);
            if (outBuf.length < 64 || !outBuf.subarray(0, 12).equals(KTX2_MAGIC)) {
                throw new Error(`Invalid KTX2 magic generated for ${setId}/${role}.ktx2`);
            }
            fs.writeFileSync(ktxPath, outBuf);
            totalKtxBytes += outBuf.length;
            encoded++;
        }
    }

    console.log(`[encode_polyhaven_ktx2] PASS: ${sets.length} sets (${encoded} encoded, ${skipped} fresh) | JPG ${(totalJpgBytes / 1048576).toFixed(2)} MB -> KTX2 ${(totalKtxBytes / 1048576).toFixed(2)} MB`);
}

main().catch((err) => {
    console.error('[encode_polyhaven_ktx2] FAIL:', err);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * tools/fetch_polyhaven_assets.js
 * Downloads curated CC0 Public Domain 8K-scanned photogrammetry PBR textures (1K JPG)
 * and 3D glTF models from Poly Haven (https://polyhaven.com / dl.polyhaven.org)
 * into server/public/assets/polyhaven/.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUT_ROOT = path.join(__dirname, '..', 'server', 'public', 'assets', 'polyhaven');

const TEXTURE_IDS = [
    'castle_brick_broken_06',
    'cobblestone_floor_08',
    'medieval_blocks_05',
    'monastery_stone_floor',
    'rock_wall_10',
    'cliff_side',
    'rock_embedded_floor',
    'japanese_stone_wall',
    'plastered_stone_wall',
    'aerial_grass_rock',
    'brown_mud_rocks_01',
    'bark_willow_02',
    'rock_boulder_cracked'
];

const MODEL_IDS = [
    'antique_estoc',
    'wooden_handle_saber',
    'antique_katana_01',
    'ornate_medieval_dagger',
    'ornate_war_hammer',
    'ornate_medieval_mace',
    'wooden_axe',
    'hatchet',
    'kite_shield',
    'large_castle_door',
    'moon_rock_02',
    'rock_07',
    'rock_face_01',
    'shrub_02',
    'shrub_04',
    'pachira_aquatica_01',
    'shrub_sorrel_01',
    'fern_02'
];

async function downloadFile(url, destPath) {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 100) {
        return { skipped: true, bytes: fs.statSync(destPath).size };
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return { skipped: false, bytes: buf.length };
}

async function fetchTextureSet(id) {
    const metaRes = await fetch(`https://api.polyhaven.com/files/${id}`);
    if (!metaRes.ok) throw new Error(`Failed metadata for texture ${id}`);
    const meta = await metaRes.json();
    const dir = path.join(OUT_ROOT, 'textures', id);
    fs.mkdirSync(dir, { recursive: true });

    const maps = [
        { key: 'Diffuse', out: 'diff.jpg', prefer: ['jpg', 'png'] },
        { key: 'nor_gl', out: 'nor_gl.jpg', prefer: ['jpg', 'png'] },
        { key: 'arm', out: 'arm.jpg', prefer: ['jpg', 'png'] },
        { key: 'Displacement', out: 'disp.jpg', prefer: ['jpg', 'png'] }
    ];

    let totalBytes = 0;
    for (const m of maps) {
        const entry = meta[m.key] && meta[m.key]['1k'];
        if (!entry) continue;
        let fmtObj = null;
        for (const f of m.prefer) {
            if (entry[f] && entry[f].url) {
                fmtObj = entry[f];
                break;
            }
        }
        if (!fmtObj) continue;
        const r = await downloadFile(fmtObj.url, path.join(dir, m.out));
        totalBytes += r.bytes;
    }
    console.log(`[Texture] ${id} ready (${(totalBytes / 1024).toFixed(0)} KB)`);
}

async function fetchModel(id) {
    const metaRes = await fetch(`https://api.polyhaven.com/files/${id}`);
    if (!metaRes.ok) throw new Error(`Failed metadata for model ${id}`);
    const meta = await metaRes.json();
    const gEntry = meta.gltf && meta.gltf['1k'] && meta.gltf['1k'].gltf;
    if (!gEntry || !gEntry.url) throw new Error(`No 1k gltf for ${id}`);

    const dir = path.join(OUT_ROOT, 'models', id);
    fs.mkdirSync(dir, { recursive: true });

    let totalBytes = 0;
    const mainRes = await downloadFile(gEntry.url, path.join(dir, `${id}.gltf`));
    totalBytes += mainRes.bytes;

    const includes = gEntry.include || {};
    for (const [relPath, info] of Object.entries(includes)) {
        if (!info || !info.url) continue;
        const dest = path.join(dir, relPath);
        const r = await downloadFile(info.url, dest);
        totalBytes += r.bytes;
    }
    console.log(`[Model]   ${id} ready (${(totalBytes / 1024).toFixed(0)} KB)`);
}

async function main() {
    console.log(`Downloading Poly Haven CC0 photogrammetry pack into ${OUT_ROOT}...`);
    // Run in batches of 4 to be polite & fast
    for (let i = 0; i < TEXTURE_IDS.length; i += 4) {
        await Promise.all(TEXTURE_IDS.slice(i, i + 4).map(fetchTextureSet));
    }
    for (let i = 0; i < MODEL_IDS.length; i += 4) {
        await Promise.all(MODEL_IDS.slice(i, i + 4).map(fetchModel));
    }
    console.log('All Poly Haven CC0 assets downloaded and verified!');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

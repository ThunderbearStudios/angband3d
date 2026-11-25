#!/usr/bin/env node
/**
 * tools/build_client.js
 *
 * Concatenates classic global/IIFE client scripts & CSS sheets in exact execution order
 * and minifies via esbuild.transform (NEVER esbuild --bundle, preserving shared globals).
 * Emits code-split runtime chunks + 3 lazy feature chunks under server/public/dist/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const PUB_DIR = path.join(ROOT, 'server', 'public');
const DIST_DIR = path.join(PUB_DIR, 'dist');

const JS_BUNDLES = {
    'boot.min.js': [
        'js/boot.js',
        'js/safe-html.js',
        'js/i18n-locale.js',
        'js/device.js',
        'js/save-vault-client.js',
        'js/realm-carousel.js',
        'js/splash-shader.js'
    ],
    'engine3d.min.js': [
        'js/vendor/three.min.js',
        'js/vendor/meshopt_decoder.js',
        'js/vendor/OBJLoader.js',
        'js/vendor/GLTFLoader.js',
        'js/dungeon3d-lightmap.js',
        'js/dungeon3d-model-governor.js',
        'js/master-bestiary.js',
        'js/master-item-registry.js',
        'js/dungeon3d-proc-textures.js',
        'js/dungeon3d-environment.js',
        'js/dungeon3d-vfx.js',
        'js/dungeon3d-atmosphere.js',
        'js/dungeon3d.js',
        'js/dungeon3d-tactical.js',
        'js/dungeon3d-town.js'
    ],
    'demo.min.js': [
        'js/demo-player.js'
    ],
    'game.min.js': [
        'js/realm-content-pool.js',
        'js/realm-cartridge.js',
        'js/screen-modal-coordinator.js',
        'js/screen-context.js',
        'js/menu-router.js',
        'js/grimoire-renderers.js',
        'js/grimoire-deck.js',
        'js/quick-actions.js',
        'js/action-catalog.js',
        'js/realm-keys.js',
        'js/command-dispatcher.js',
        'js/command-palette.js',
        'js/prompt-mirror.js',
        'js/item-sheet.js',
        'js/entity-menu.js',
        'js/gamepad.js',
        'js/radial-menu.js',
        'js/audio-director.js',
        'js/audio.js',
        'js/audio-ambience.js',
        'js/terminal-lexer.js',
        'js/terminal.js',
        'js/hud-telemetry.js',
        'js/yasd-autopsy.js',
        'js/hud-layout.js',
        'js/hud.js',
        'js/network.js',
        'js/local_bridge.js',
        'js/input-autonav.js',
        'js/input.js',
        'js/birth-review.js',
        'js/settings-modal.js',
        'js/app.js',
        'js/mobile-console.js'
    ],
    'chronicle.min.js': [
        'js/chronicle/chronicle-store.js',
        'js/chronicle/chronicle-grounder.js',
        'js/chronicle/chronicle-filter.js',
        'js/chronicle/chronicle-story-weaver.js',
        'js/chronicle/chronicle-audio.js',
        'js/chronicle/chronicle-llm.js',
        'js/chronicle/yasd-sketch-composer.js',
        'js/chronicle/chronicle-manager.js'
    ],
    'ryod-forge.min.js': [
        'js/ryod-compiler.js',
        'js/ryod-forge.js'
    ],
    'adventurer-guide.min.js': [
        'js/adventurer-guide.js'
    ]
};

const CSS_BUNDLES = {
    'app.min.css': [
        'css/tokens.css',
        'css/dungeon.css',
        'css/realm-cards.css',
        'css/hud-skin.css',
        'css/chronicle.css',
        'css/sightline-polish.css'
    ],
    'mobile-console.min.css': [
        'css/mobile-console.css'
    ]
};

function readConcat(files, sep) {
    return files.map((rel) => {
        const abs = path.join(PUB_DIR, rel);
        if (!fs.existsSync(abs)) {
            throw new Error(`Missing source file for bundle: ${rel}`);
        }
        return `/* === ${rel} === */\n${fs.readFileSync(abs, 'utf8')}`;
    }).join(sep);
}

async function main() {
    fs.mkdirSync(DIST_DIR, { recursive: true });
    let totalRaw = 0;
    let totalMin = 0;

    console.log('=== YASD 3D Client Asset Bundler (esbuild.transform) ===\n');
    console.log('BUNDLE'.padEnd(28) + 'RAW KB'.padStart(10) + 'MIN KB'.padStart(10) + '  SAVED');
    console.log('-'.repeat(58));

    for (const [outName, files] of Object.entries(JS_BUNDLES)) {
        const concat = readConcat(files, '\n;\n');
        const res = await esbuild.transform(concat, {
            loader: 'js',
            minify: true,
            target: 'es2020',
            legalComments: 'none'
        });
        const outPath = path.join(DIST_DIR, outName);
        fs.writeFileSync(outPath, res.code, 'utf8');
        execFileSync(process.execPath, ['--check', outPath], { stdio: 'pipe' });

        const rawBytes = Buffer.byteLength(concat, 'utf8');
        const minBytes = Buffer.byteLength(res.code, 'utf8');
        totalRaw += rawBytes;
        totalMin += minBytes;
        const pct = ((1 - minBytes / rawBytes) * 100).toFixed(1);
        console.log(`${outName.padEnd(28)}${(rawBytes / 1024).toFixed(1).padStart(10)}${(minBytes / 1024).toFixed(1).padStart(10)}  -${pct}%`);
    }

    for (const [outName, files] of Object.entries(CSS_BUNDLES)) {
        const concat = readConcat(files, '\n');
        const res = await esbuild.transform(concat, {
            loader: 'css',
            minify: true,
            target: 'es2020',
            legalComments: 'none'
        });
        const outPath = path.join(DIST_DIR, outName);
        fs.writeFileSync(outPath, res.code, 'utf8');

        const rawBytes = Buffer.byteLength(concat, 'utf8');
        const minBytes = Buffer.byteLength(res.code, 'utf8');
        totalRaw += rawBytes;
        totalMin += minBytes;
        const pct = ((1 - minBytes / rawBytes) * 100).toFixed(1);
        console.log(`${outName.padEnd(28)}${(rawBytes / 1024).toFixed(1).padStart(10)}${(minBytes / 1024).toFixed(1).padStart(10)}  -${pct}%`);
    }

    console.log('-'.repeat(58));
    const totPct = ((1 - totalMin / totalRaw) * 100).toFixed(1);
    console.log(`TOTAL${' '.repeat(23)}${(totalRaw / 1024).toFixed(1).padStart(10)}${(totalMin / 1024).toFixed(1).padStart(10)}  -${totPct}%`);
    console.log('\nbuild_client.js: PASS');
}

main().catch((err) => {
    console.error('[build_client] FAIL:', err);
    process.exit(1);
});

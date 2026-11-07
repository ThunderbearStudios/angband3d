#!/usr/bin/env node
/**
 * variants/ryod/bin/ryod-bridge.js
 *
 * Playable RYOD ("Roll Your Own Dungeon") Realm Engine for YASD 3D / Yendor Engine™.
 * Synthesizes a 100% coherent, asset-validated cross-realm dungeon from a RYOD Blueprint
 * (`.ryod.json`) or self-hydrates directly from an existing `SaveRYOD` `.sav` file.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { UniversalCartridgeEngine, runCartridgeMain } = require('../../../server/src/cartridges/cartridge-core');
const RyodCompiler = require('../../../server/src/cartridges/ryod-compiler');

function resolveInitialBlueprint(saveDir, user, explicitBlueprint = null) {
    if (explicitBlueprint && typeof explicitBlueprint === 'object') {
        return RyodCompiler.normalizeConfig(explicitBlueprint);
    }
    const cleanUser = String(user || 'Adventurer').replace(/\.sav$/i, '');
    if (saveDir && cleanUser) {
        const bpFile = path.join(saveDir, `${cleanUser}.ryod.json`);
        if (fs.existsSync(bpFile)) {
            try {
                const raw = JSON.parse(fs.readFileSync(bpFile, 'utf8'));
                return RyodCompiler.normalizeConfig(raw);
            } catch (_) {}
        }
        // Check if an existing SaveRYOD .sav file has an embedded blueprint
        const savCandidates = [
            path.join(saveDir, `${cleanUser}.sav`),
            path.join(saveDir, cleanUser),
            path.join(saveDir, `${cleanUser}.sav.living.sav`)
        ];
        for (const savPath of savCandidates) {
            if (fs.existsSync(savPath)) {
                try {
                    const buf = fs.readFileSync(savPath);
                    if (buf.length >= 36 && buf.toString('ascii', 0, 8) === 'SaveRYOD') {
                        const descSize = buf.readUInt32LE(28);
                        const state = JSON.parse(buf.toString('utf8', 36 + descSize));
                        if (state && state.ryodBlueprint) {
                            return RyodCompiler.normalizeConfig(state.ryodBlueprint);
                        }
                    }
                } catch (_) {}
            }
        }
    }
    return RyodCompiler.rollCoherentBlueprint();
}

function buildRyodSpec(blueprint) {
    const spec = RyodCompiler.compileEngineSpec(blueprint);
    spec.onBlueprintHydrate = (loadedBp) => {
        const hydrated = RyodCompiler.compileEngineSpec(loadedBp);
        hydrated.onBlueprintHydrate = spec.onBlueprintHydrate;
        return hydrated;
    };
    return spec;
}

class RyodEngine extends UniversalCartridgeEngine {
    constructor(opts = {}) {
        const defaultSaveDir = path.resolve(__dirname, '../lib/save');
        const saveDir = opts.saveDir || defaultSaveDir;
        const user = opts.user || 'Adventurer';
        const bp = resolveInitialBlueprint(saveDir, user, opts.ryodBlueprint);
        const spec = buildRyodSpec(bp);
        super(spec, { ...opts, saveDir, user });
    }
}

if (require.main === module) {
    const defaultSaveDir = path.resolve(__dirname, '../lib/save');
    const argv = process.argv;
    let saveDir = defaultSaveDir;
    let user = 'Adventurer';
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '-d' && argv[i + 1]) saveDir = argv[++i];
        else if (argv[i].startsWith('-d=')) saveDir = argv[i].slice(3);
        else if (argv[i] === '-u' && argv[i + 1]) user = argv[++i];
        else if (argv[i].startsWith('-u')) user = argv[i].slice(2);
    }
    const bp = resolveInitialBlueprint(saveDir, user);
    const spec = buildRyodSpec(bp);
    runCartridgeMain(spec, defaultSaveDir);
}

const DEFAULT_RYOD_SPEC = buildRyodSpec(RyodCompiler.normalizeConfig({ archetypeId: 'obsidian_covenant' }));

module.exports = { DEFAULT_RYOD_SPEC, RyodEngine, buildRyodSpec, resolveInitialBlueprint };

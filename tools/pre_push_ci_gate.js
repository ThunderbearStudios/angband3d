#!/usr/bin/env node
/**
 * tools/pre_push_ci_gate.js
 *
 * Automated local clean-checkout gate (invoked by .git/hooks/pre-push).
 * Simulates a pristine GitHub Actions Ubuntu checkout (gitignored archive/,
 * client/, dist/, variants/{silq,frogcomposband,hengband}* hidden) so broken
 * CI pushes are blocked locally before reaching origin.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function runStep(label, cmd, args, extraEnv = {}) {
    console.log(`\n[pre-push] ${label}...`);
    const r = spawnSync(cmd, args, {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, ...extraEnv }
    });
    if (r.status !== 0) {
        console.error(`\n[pre-push] FAIL at step: ${label} (exit=${r.status})`);
        process.exit(r.status || 1);
    }
}

function checkPatchAndWorktree() {
    console.log('[pre-push] Checking engine-patch/0001-bridge-frontend.patch...');
    const patchPath = path.join(ROOT, 'engine-patch/0001-bridge-frontend.patch');
    const patchBuf = fs.readFileSync(patchPath);
    assert.strictEqual(patchBuf.includes(0x0d), false, 'Patch must have 0 CR bytes');
    assert.strictEqual(patchBuf.includes(0x00), false, 'Patch must have 0 NUL bytes');

    const engineGitDir = path.join(ROOT, 'engine/.git');
    if (fs.existsSync(engineGitDir)) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a3d-prepush-patch-'));
        try {
            execFileSync('git', ['worktree', 'add', '--detach', tmpDir, '4.2.6'], {
                cwd: path.join(ROOT, 'engine'),
                stdio: 'pipe'
            });
            execFileSync('git', ['apply', '--check', patchPath], {
                cwd: tmpDir,
                stdio: 'pipe'
            });
            console.log('[pre-push] Clean git apply --check against Angband 4.2.6: PASS');
        } finally {
            try {
                execFileSync('git', ['worktree', 'remove', '--force', tmpDir], {
                    cwd: path.join(ROOT, 'engine'),
                    stdio: 'pipe'
                });
            } catch (_) {}
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        }
    }
}

function main() {
    checkPatchAndWorktree();

    runStep('Precompress static assets', process.execPath, [path.join(ROOT, 'tools/precompress_assets.js')]);

    const shimPath = path.join(ROOT, 'tools/ci_clean_fs_shim.js').replace(/\\/g, '/');
    const existingNodeOpts = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : '';
    const cleanEnv = {
        CI_SIMULATE_CLEAN_CHECKOUT: '1',
        NODE_OPTIONS: `${existingNodeOpts}--require "${shimPath}"`
    };
    runStep(
        'Fast test tier under CI_SIMULATE_CLEAN_CHECKOUT=1',
        process.execPath,
        [path.join(ROOT, 'tools/run_tests.js'), '--tier', 'fast'],
        cleanEnv
    );

    runStep('Server boot verification', process.execPath, [path.join(ROOT, 'tools/test_server_boot.js')]);

    console.log('\n[pre-push] ALL CLEAN-CHECKOUT CI GATES PASSED!');
}

main();

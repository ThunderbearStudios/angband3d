'use strict';

if (process.env.CI_SIMULATE_CLEAN_CHECKOUT === '1') {
    const fs = require('fs');
    const path = require('path');
    const { fileURLToPath } = require('url');

    const ROOT = path.resolve(__dirname, '..').replace(/\\/g, '/').replace(/\/$/, '');
    const IGNORED_DIRS = [
        'archive',
        'client',
        'dist',
        'variants/silq',
        'variants/silq-src',
        'variants/frogcomposband',
        'variants/frogcomposband-src',
        'variants/hengband',
        'variants/hengband-src'
    ];

    function toPosixAbs(target) {
        if (target == null) return '';
        let str = '';
        if (typeof target === 'string') str = target;
        else if (Buffer.isBuffer(target)) str = target.toString('utf8');
        else if (target instanceof URL) {
            try { str = fileURLToPath(target); } catch (_) { return ''; }
        } else return '';
        if (!str) return '';
        return path.resolve(str).replace(/\\/g, '/');
    }

    function isIgnoredCleanPath(target) {
        const abs = toPosixAbs(target);
        if (!abs || !abs.startsWith(ROOT + '/')) return false;
        const rel = abs.slice(ROOT.length + 1);
        for (const dir of IGNORED_DIRS) {
            if (rel === dir || rel.startsWith(dir + '/')) return true;
        }
        return false;
    }

    function makeEnoent(target) {
        const err = new Error(`ENOENT: no such file or directory (CI clean checkout simulation), '${target}'`);
        err.errno = -2;
        err.code = 'ENOENT';
        err.syscall = 'open';
        err.path = String(target);
        return err;
    }

    const origExistsSync = fs.existsSync.bind(fs);
    const origReadFileSync = fs.readFileSync.bind(fs);
    const origStatSync = fs.statSync.bind(fs);
    const origLstatSync = fs.lstatSync.bind(fs);
    const origReaddirSync = fs.readdirSync.bind(fs);

    fs.existsSync = function (p) {
        if (isIgnoredCleanPath(p)) return false;
        return origExistsSync(p);
    };
    fs.readFileSync = function (p, ...rest) {
        if (isIgnoredCleanPath(p)) throw makeEnoent(p);
        return origReadFileSync(p, ...rest);
    };
    fs.statSync = function (p, ...rest) {
        if (isIgnoredCleanPath(p)) throw makeEnoent(p);
        return origStatSync(p, ...rest);
    };
    fs.lstatSync = function (p, ...rest) {
        if (isIgnoredCleanPath(p)) throw makeEnoent(p);
        return origLstatSync(p, ...rest);
    };
    fs.readdirSync = function (p, ...rest) {
        if (isIgnoredCleanPath(p)) throw makeEnoent(p);
        return origReaddirSync(p, ...rest);
    };
}

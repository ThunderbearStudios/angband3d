'use strict';

const fs = require('fs');
const path = require('path');
const { createWsDriver, createStdioDriver } = require('../engine_driver');
const { ProtocolOracle } = require('../oracles/protocol_oracle');

class TapeRecorder {
    constructor(filePath, meta = {}) {
        this.filePath = filePath;
        this.meta = { t: 'meta', ...meta, startedAt: new Date().toISOString() };
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(this.meta) + '\n', 'utf8');
        this.steps = [];
    }

    recordStep(entry) {
        const line = { t: 'step', ...entry };
        this.steps.push(line);
        fs.appendFileSync(this.filePath, JSON.stringify(line) + '\n', 'utf8');
    }
}

function loadTape(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
    const meta = lines.find((l) => l.t === 'meta') || {};
    const steps = lines.filter((l) => l.t === 'step');
    return { meta, steps };
}

function writeTape(filePath, meta, steps) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const out = [JSON.stringify({ t: 'meta', ...meta }), ...steps.map((s) => JSON.stringify({ t: 'step', ...s }))];
    fs.writeFileSync(filePath, out.join('\n') + '\n', 'utf8');
}

async function replayTape(tapePathOrData, opts = {}) {
    const { meta, steps } = typeof tapePathOrData === 'string'
        ? loadTape(tapePathOrData)
        : tapePathOrData;

    const realm = opts.realm || meta.realm || 'angband';
    const lang = opts.lang || meta.lang || 'en';
    const seed = opts.seed !== undefined ? opts.seed : meta.seed;
    const targetCode = opts.targetCode || null;
    const oracle = new ProtocolOracle(realm, lang);
    const issues = [];
    let driver = null;

    try {
        if (typeof opts.createDriver === 'function') {
            driver = await opts.createDriver({ realm, lang, seed, meta });
        } else if (opts.wsUrl) {
            driver = await createWsDriver({
                wsUrl: opts.wsUrl,
                realm,
                lang,
                user: `Rep_${Date.now().toString(36)}`,
                isNew: true,
                seed
            });
        } else {
            driver = await createStdioDriver({
                realm,
                lang,
                user: `Rep_${Date.now().toString(36)}`,
                saveDir: opts.saveDir,
                isNew: true,
                seed
            });
        }

        const initialIssues = oracle.validateFrame(driver.frame, driver.rawFrame);
        issues.push(...initialIssues);

        for (let i = 0; i < steps.length; i++) {
            const st = steps[i];
            if (!st.key) continue;
            const frame = st.isKeys
                ? await driver.sendKeys(st.key, opts.stepTimeoutMs || 8000)
                : await driver.sendKey(st.key, opts.stepTimeoutMs || 8000);
            const fIssues = oracle.validateFrame(frame, driver.rawFrame);
            issues.push(...fIssues);
            if (targetCode && issues.some((x) => x.code === targetCode)) {
                return { reproduced: true, stepIndex: i, issues, stepsExecuted: i + 1 };
            }
        }

        if (driver.errors && driver.errors.length > 0) {
            for (const e of driver.errors) {
                issues.push({ severity: 'P0', realm, subsystem: 'replay', code: 'P0_ENGINE_ERROR', message: e.message || JSON.stringify(e) });
            }
        }

        const reproduced = targetCode
            ? issues.some((x) => x.code === targetCode)
            : issues.length > 0;
        return { reproduced, stepIndex: steps.length - 1, issues, stepsExecuted: steps.length };
    } catch (err) {
        issues.push({
            severity: 'P0',
            realm,
            subsystem: 'replay',
            code: err.code || 'P0_REPLAY_EXCEPTION',
            message: err.message
        });
        const reproduced = targetCode
            ? issues.some((x) => x.code === targetCode)
            : true;
        return { reproduced, stepIndex: -1, issues, stepsExecuted: 0 };
    } finally {
        if (driver) {
            try { await driver.close(); } catch (_) {}
        }
    }
}

module.exports = {
    TapeRecorder,
    loadTape,
    writeTape,
    replayTape
};

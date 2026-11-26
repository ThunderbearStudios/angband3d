'use strict';

const { loadTape, writeTape, replayTape } = require('./tape_recorder');

/**
 * Deterministic prefix-bisection + loop-segment tape minimizer.
 * Replays full tape to verify determinism before shrinking.
 */
async function minimizeFailureTape(tapePathOrData, targetCode, outPath, opts = {}) {
    const loaded = typeof tapePathOrData === 'string' ? loadTape(tapePathOrData) : tapePathOrData;
    const { meta, steps } = loaded;
    if (!steps || steps.length === 0) {
        return { determinism: 'EMPTY', originalLen: 0, minimizedLen: 0, outPath: null };
    }

    const runSubset = (subset) => replayTape({ meta, steps: subset }, { ...opts, targetCode });

    // 1. Determinism check (replay full tape)
    const r1 = await runSubset(steps);
    if (!r1.reproduced) {
        return { determinism: 'FLAKY', originalLen: steps.length, minimizedLen: steps.length, outPath: null };
    }
    const r2 = await runSubset(steps);
    if (!r2.reproduced) {
        return { determinism: 'FLAKY', originalLen: steps.length, minimizedLen: steps.length, outPath: null };
    }

    // 2. Binary search earliest failing prefix 1..N
    let lo = 1;
    let hi = r1.stepIndex >= 0 ? Math.min(steps.length, r1.stepIndex + 1) : steps.length;
    let bestSteps = steps.slice(0, hi);

    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const res = await runSubset(steps.slice(0, mid));
        if (res.reproduced) {
            bestSteps = steps.slice(0, mid);
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }

    // 3. Causal loop-segment pruning: remove cycles returning to identical (depth,x,y,overlay)
    let improved = true;
    while (improved && bestSteps.length > 1) {
        improved = false;
        const posMap = new Map();
        for (let i = 0; i < bestSteps.length; i++) {
            const s = bestSteps[i];
            if (s.depth === undefined || s.x === undefined || s.y === undefined) continue;
            const key = `${s.depth}:${s.x}:${s.y}:${s.overlay || 0}`;
            if (posMap.has(key)) {
                const start = posMap.get(key);
                if (i - start >= 1) {
                    const candidate = bestSteps.slice(0, start).concat(bestSteps.slice(i));
                    if (candidate.length >= 1) {
                        const res = await runSubset(candidate);
                        if (res.reproduced) {
                            bestSteps = candidate;
                            improved = true;
                            break;
                        }
                    }
                }
            } else {
                posMap.set(key, i);
            }
        }
    }

    if (outPath) {
        writeTape(outPath, { ...meta, minimizedFor: targetCode, originalSteps: steps.length }, bestSteps);
    }

    return {
        determinism: 'DETERMINISTIC',
        originalLen: steps.length,
        minimizedLen: bestSteps.length,
        outPath: outPath || null
    };
}

module.exports = {
    minimizeFailureTape
};

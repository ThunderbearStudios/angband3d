'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

function normalizeMsg(msg) {
    return String(msg || '')
        .replace(/seq \d+/g, 'seq <N>')
        .replace(/\b\d{4,}\b/g, '<NUM>')
        .replace(/PT_[a-zA-Z0-9_]+/g, '<USER>')
        .trim();
}

function fingerprintIssue(issue) {
    const key = [
        issue.severity || 'P2',
        issue.realm || 'global',
        issue.subsystem || 'unknown',
        issue.code || 'UNKNOWN',
        normalizeMsg(issue.message)
    ].join('|');
    return crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
}

class TriageReporter {
    constructor(runDir) {
        this.runDir = runDir;
        this.issuesById = new Map();
        this.runs = [];
        this.metrics = {};
        fs.mkdirSync(runDir, { recursive: true });
    }

    addIssues(issues, context = {}) {
        for (const raw of (issues || [])) {
            if (!raw) continue;
            const id = fingerprintIssue(raw);
            if (!this.issuesById.has(id)) {
                this.issuesById.set(id, {
                    id,
                    severity: raw.severity || 'P2',
                    realm: raw.realm || context.realm || 'global',
                    subsystem: raw.subsystem || 'unknown',
                    code: raw.code || 'UNKNOWN',
                    message: raw.message || '',
                    count: 1,
                    contexts: [context],
                    reproPath: context.reproPath || null,
                    screenshotPath: context.screenshotPath || null,
                    determinism: context.determinism || null
                });
            } else {
                const entry = this.issuesById.get(id);
                entry.count++;
                if (entry.contexts.length < 5) entry.contexts.push(context);
                if (!entry.reproPath && context.reproPath) entry.reproPath = context.reproPath;
                if (!entry.screenshotPath && context.screenshotPath) entry.screenshotPath = context.screenshotPath;
                if (!entry.determinism && context.determinism) entry.determinism = context.determinism;
            }
        }
    }

    attachRepro(issueCode, realm, info) {
        for (const entry of this.issuesById.values()) {
            if (entry.code === issueCode && entry.realm === realm) {
                if (info.outPath) entry.reproPath = info.outPath;
                if (info.determinism) entry.determinism = info.determinism;
            }
        }
    }

    recordRun(runSummary) {
        this.runs.push(runSummary);
    }

    finalize() {
        const bugs = Array.from(this.issuesById.values()).sort((a, b) => {
            const sa = SEVERITY_ORDER[a.severity] ?? 9;
            const sb = SEVERITY_ORDER[b.severity] ?? 9;
            if (sa !== sb) return sa - sb;
            if (a.realm !== b.realm) return a.realm.localeCompare(b.realm);
            return a.code.localeCompare(b.code);
        });

        const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
        for (const b of bugs) counts[b.severity] = (counts[b.severity] || 0) + 1;

        const summary = {
            generatedAt: new Date().toISOString(),
            runDir: this.runDir,
            counts,
            totalUniqueBugs: bugs.length,
            runs: this.runs,
            bugs
        };

        fs.writeFileSync(path.join(this.runDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
        fs.writeFileSync(path.join(this.runDir, 'metrics.json'), JSON.stringify({ runs: this.runs }, null, 2), 'utf8');

        const md = [];
        md.push('# YASD 3D 9-Realm Playtest Bug Ledger');
        md.push('');
        md.push(`- **Generated**: ${summary.generatedAt}`);
        md.push(`- **Run Directory**: \`${this.runDir}\``);
        md.push(`- **Unique Bugs**: **${bugs.length}** (P0: ${counts.P0}, P1: ${counts.P1}, P2: ${counts.P2}, P3: ${counts.P3})`);
        md.push('');
        md.push('## Execution Matrix');
        md.push('');
        md.push('| Target | Lane | Session | Engine | Renderer | Status | Turns | Max Depth | Milestones | Bugs |');
        md.push('|---|---|---|---|---|---|---:|---:|---|---:|');
        for (const r of this.runs) {
            const ms = Array.isArray(r.milestones) ? r.milestones.join(', ') : '';
            md.push(`| ${r.targetId || r.realm} | ${r.lane} | ${r.session || '-'} | ${r.engine || 'ws'} | ${r.renderer || '-'} | ${r.status} | ${r.turns || 0} | ${r.maxDepth ?? '-'} | ${ms} | ${r.bugCount || 0} |`);
        }
        md.push('');
        md.push('## Prioritized Findings');
        md.push('');
        if (bugs.length === 0) {
            md.push('No bugs detected across executed runs.');
        } else {
            for (const b of bugs) {
                md.push(`### [${b.severity}] ${b.realm} — \`${b.code}\` (id: \`${b.id}\`, hits: ${b.count})`);
                md.push(`- **Subsystem**: \`${b.subsystem}\``);
                md.push(`- **Message**: ${b.message}`);
                if (b.determinism) md.push(`- **Reproducibility**: ${b.determinism}`);
                if (b.reproPath) md.push(`- **Minimized Repro**: \`${b.reproPath}\``);
                if (b.screenshotPath) md.push(`- **Screenshot**: \`${b.screenshotPath}\``);
                md.push('');
            }
        }

        const reportPath = path.join(this.runDir, 'BUG_REPORT.md');
        fs.writeFileSync(reportPath, md.join('\n'), 'utf8');
        return { summary, reportPath };
    }
}

module.exports = {
    TriageReporter,
    fingerprintIssue
};

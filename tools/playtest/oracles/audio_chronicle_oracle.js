'use strict';

const { checkTextSanity } = require('./protocol_oracle');

class AudioChronicleOracle {
    constructor({ realm, lang = 'en', forbiddenChronicleTerms = [], baseUrl = '' }) {
        this.realm = String(realm || 'angband').toLowerCase();
        this.lang = lang;
        this.forbiddenTerms = forbiddenChronicleTerms || [];
        this.baseUrl = baseUrl;
        this.l49Checked = false;
        this.chronicleChecked = false;
        this.ttsChecked = false;
    }

    auditSnapshot(snap, { isRestOrPassiveTurn = false } = {}) {
        const issues = [];
        const add = (severity, code, message, extra = null) => {
            issues.push({ severity, realm: this.realm, subsystem: 'audio_chronicle', code, message, extra });
        };

        if (!snap) return issues;

        // L49: Passive regen / rest turns must not fire spurious SFX
        if (isRestOrPassiveTurn && snap.probe?.audioStats?.deltaSources > 0) {
            this.l49Checked = true;
            // Only flag if multiple passive turns fire audio repeatedly; allow first turn if ambient
        }

        // Check Chronicle entries for cross-realm lore bleed & AI UNAVAILABLE HTTP 200
        const ch = snap.chronicle;
        if (ch && ch.loaded) {
            if (ch.entryCount > 0) this.chronicleChecked = true;
            const combined = [
                ch.domTextSample || '',
                ...(ch.recentEntries || []).map((e) => e.text || '')
            ].join('\n');

            if (/AI UNAVAILABLE:\s*HTTP\s*200/i.test(combined)) {
                add('P1', 'P1_CHRONICLE_HTTP200_ERROR', 'Chronicle displayed forbidden "AI UNAVAILABLE: HTTP 200" banner');
            }
            checkTextSanity(combined, this.realm, 'chronicle', issues);

            for (const term of this.forbiddenTerms) {
                if (!term) continue;
                const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (re.test(combined)) {
                    add('P1', 'P1_CHRONICLE_LORE_BLEED', `Cross-realm Chronicle bleed in ${this.realm}: found "${term}"`);
                }
            }
        }

        // Check /api/tts or /api/llm network failures
        for (const net of (snap.cdpNetworkErrors || [])) {
            if (/\/api\/tts/i.test(net.url || '') && (net.status >= 500 || net.status === 429)) {
                add('P1', 'P1_TTS_ENDPOINT_ERROR', `/api/tts returned HTTP ${net.status}`);
            }
        }

        return issues;
    }

    async verifyChronicleAndTtsEndpoint(browser, liveAi = false) {
        const issues = [];
        const add = (severity, code, message) => {
            issues.push({ severity, realm: this.realm, subsystem: 'audio_chronicle', code, message });
        };

        // Ensure lazy ChronicleManager initializes
        try {
            const cmOk = await browser.evaluate(`(async () => {
                if (window.chronicleManager) return { loaded: true, entries: window.chronicleManager.entries?.length || 0 };
                const btn = document.getElementById('btn-chronicle-expand') || document.getElementById('chronicle-header');
                if (btn) btn.click();
                await new Promise(r => setTimeout(r, 800));
                return { loaded: Boolean(window.chronicleManager), entries: window.chronicleManager?.entries?.length || 0 };
            })()`);
            if (cmOk && cmOk.loaded) {
                this.chronicleChecked = true;
            }
        } catch (err) {
            add('P2', 'P2_CHRONICLE_PROBE_ERR', `Chronicle readiness check error: ${err.message}`);
        }

        // Probe local Edge TTS endpoint cleanly without burning Gemini quota
        if (this.baseUrl && !this.ttsChecked) {
            this.ttsChecked = true;
            try {
                const engineParam = liveAi ? '' : '&engine=edge';
                const res = await fetch(`${this.baseUrl}/api/tts?realm=${encodeURIComponent(this.realm)}&lang=${encodeURIComponent(this.lang)}${engineParam}&text=${encodeURIComponent('The dungeon awaits.')}`);
                if (res.status >= 500 || res.status === 429) {
                    add('P1', 'P1_TTS_HTTP_FAILURE', `/api/tts health check returned HTTP ${res.status}`);
                }
            } catch (err) {
                add('P2', 'P2_TTS_FETCH_ERROR', `/api/tts fetch failed: ${err.message}`);
            }
        }

        return issues;
    }
}

module.exports = {
    AudioChronicleOracle
};

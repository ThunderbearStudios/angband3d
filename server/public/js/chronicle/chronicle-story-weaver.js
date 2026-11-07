/**
 * chronicle-story-weaver.js — In-Realm Episodic Narrative Weaver, AI Director Pacing Curve,
 * and Rolling N-Gram Anti-Repetition Guard for the Living Chronicle (WS55).
 *
 * CORE CONTRACT:
 *   1. 100% VOICE PRESERVATION (`preserveVoiceProfile: true`):
 *      Never alters `chronicle-audio.js` voice IDs, timbre, pitch, or speech rate.
 *      Enriches the narrative prompt context and post-filters repetitive phrasing
 *      while keeping the exact same Lorekeeper voice.
 *   2. FIVE-ACT MYTHIC PROGRESSION (`resolveMythicAct`):
 *      Adapts narrative themes across Act I (Threshold & Omen), Act II (Echoing Delvings),
 *      Act III (Crucible of Iron & Shadow), Act IV (Abyssal Sanctum), and Act V (Sovereign Reckoning).
 *   3. EPISODIC CONTINUITY & CALLBACK LEDGER (`recordStoryBeat` & `buildCallbackContext`):
 *      Tracks weapon/relic origins, near-death scars, nemesis monster races, and altar vows
 *      so later floors weave organic callbacks to earlier moments in the run.
 *   4. AI DIRECTOR DRAMATIC PACING CURVE (`evaluateNarrativePacing`):
 *      Modulates narration cooldowns and word-count budgets based on real-time tension
 *      (quiet exploration vs rising discovery vs mortal peril).
 *   5. ROLLING N-GRAM & CLICHE DIVERSITY GUARD (`PhraseDiversityGuard`):
 *      Tracks a 24-utterance ring buffer of recent openings, verbs, and tropes, blocking
 *      repetitive stock phrases and diversifying openings deterministically.
 *
 * Contract: Pure UMD module, 100% IP-clean (IP-CLEAN-01).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChronicleStoryWeaver = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MYTHIC_ACTS = Object.freeze([
        {
            act: 1,
            id: 'act_1_threshold',
            title: 'Act I: The Threshold & Omen',
            minDepth: 0,
            maxDepth: 5,
            narrativeLens: 'Establish the adventurer’s unproven resolve, the weight of humble gear, and the first omens of the descent.',
            cadenceStyle: 'observant, grounded, quietly foreboding'
        },
        {
            act: 2,
            id: 'act_2_delvings',
            title: 'Act II: The Echoing Delvings',
            minDepth: 6,
            maxDepth: 20,
            narrativeLens: 'Weave resource scarcity, emerging rivalries with recurring monster broods, and the first discovery of enchanted relics.',
            cadenceStyle: 'taut, investigative, atmospheric'
        },
        {
            act: 3,
            id: 'act_3_crucible',
            title: 'Act III: The Crucible of Iron & Shadow',
            minDepth: 21,
            maxDepth: 45,
            narrativeLens: 'Recall hard-won scars, close brushes with death, and the growing bond between the hero and their proven panoply.',
            cadenceStyle: 'seasoned, weathered, resolute'
        },
        {
            act: 4,
            id: 'act_4_sanctum',
            title: 'Act IV: The Abyssal Sanctum',
            minDepth: 46,
            maxDepth: 85,
            narrativeLens: 'Confront ancient dread, primordial vaults, and the toll of deep isolation far below the mortal sun.',
            cadenceStyle: 'solemn, mythic, high-stakes'
        },
        {
            act: 5,
            id: 'act_5_reckoning',
            title: 'Act V: The Sovereign Reckoning',
            minDepth: 86,
            maxDepth: 999,
            narrativeLens: 'Culminate every earlier vow, scar, and relic lineage toward the final confrontation of the realm.',
            cadenceStyle: 'epic, decisive, fateful'
        }
    ]);

    const OVERUSED_OPENINGS = Object.freeze([
        'in the shadows',
        'as you descend',
        'the air grows',
        'steel rings out',
        'pressing deeper into',
        'with a swift',
        'the darkness of',
        'another foe falls'
    ]);

    const REALM_ALTERNATE_LEAD_INS = Object.freeze({
        angband: [
            'Beneath the iron vaults,',
            'Torch-smoke curls along the chiselled granite as',
            'Cold echoes answer your boots while',
            'Scored stone bears witness as',
            'Deep within the mountain’s ribs,'
        ],
        silq: [
            'Starlight-memory lingers on cold steel while',
            'Through the hushed corridors of stone,',
            'Measured breath steadies your hand as',
            'Where ancient songs once held sway,'
        ],
        frogcomposband: [
            'Threads of shifting pattern hum faintly as',
            'Across the strange marches of the realm,',
            'Chaos-tinted lantern light catches the stone while',
            'Destiny bends a fraction further as'
        ],
        hengband: [
            'Along the mist-veiled stone corridor,',
            'With the stillness of a drawn blade,',
            'Lantern-glow settles over the ancient tiles as',
            'Between one heartbeat and the next,'
        ],
        nethack: [
            'Down in the flagstones of the Mazes,',
            'The gods watch in measured silence as',
            'By flickering tallow and cold masonry,',
            'Another turn of fate’s ledger unfolds as'
        ]
    });

    function resolveMythicAct(depth = 0, realm = 'angband') {
        const d = Math.max(0, Number(depth) || 0);
        const r = String(realm || 'angband').toLowerCase();
        let ryodScale = 1.0;
        if (r === 'ryod' && typeof window !== 'undefined' && window.__activeRyodBlueprint && window.__activeRyodBlueprint.goalDepth) {
            ryodScale = 90 / Math.max(5, Number(window.__activeRyodBlueprint.goalDepth) || 12);
        }
        // Scale Sil-Q's 20-floor delve, NetHack's 50-floor delve, and RYOD's custom goalDepth onto the 5-act curve
        const scaledDepth = (r === 'silq') ? d * 4.5 : (r === 'nethack' ? d * 1.8 : (r === 'ryod' ? d * ryodScale : d));
        for (let i = 0; i < MYTHIC_ACTS.length; i++) {
            const a = MYTHIC_ACTS[i];
            if (scaledDepth >= a.minDepth && scaledDepth <= a.maxDepth) {
                return a;
            }
        }
        return MYTHIC_ACTS[MYTHIC_ACTS.length - 1];
    }

    /**
     * PhraseDiversityGuard — Tracks recent Chronicle outputs in a 24-entry ring buffer,
     * extracts opening bigrams/trigrams and overused verbs, and prevents repetitive phrasing.
     */
    class PhraseDiversityGuard {
        constructor(maxHistory = 24) {
            this.maxHistory = Math.max(6, Number(maxHistory) || 24);
            this._history = [];
            this._rotateIdx = 0;
        }

        _extractOpeningStem(text) {
            const words = String(text || '')
                .trim()
                .replace(/^["'“”‘’]+/, '')
                .toLowerCase()
                .split(/\s+/)
                .slice(0, 3);
            return words.join(' ').replace(/[^a-z0-9\s]/g, '').trim();
        }

        recordUtterance(text) {
            const clean = String(text || '').trim();
            if (!clean) return;
            const stem = this._extractOpeningStem(clean);
            this._history.push({ text: clean, stem, ts: Date.now() });
            if (this._history.length > this.maxHistory) {
                this._history.shift();
            }
        }

        getBannedOpenings() {
            const recentStems = this._history.map(h => h.stem).filter(Boolean);
            const combined = new Set([...OVERUSED_OPENINGS, ...recentStems]);
            return Array.from(combined);
        }

        isRepetitive(candidateText) {
            const clean = String(candidateText || '').trim();
            if (!clean) return false;
            const stem = this._extractOpeningStem(clean);
            const lower = clean.toLowerCase();

            for (let i = 0; i < OVERUSED_OPENINGS.length; i++) {
                if (lower.startsWith(OVERUSED_OPENINGS[i])) return true;
            }
            for (let i = 0; i < this._history.length; i++) {
                if (this._history[i].stem === stem && stem.length >= 5) return true;
                if (this._history[i].text.toLowerCase() === lower) return true;
            }
            return false;
        }

        /**
         * Rewrites a repetitive opening stem using realm-authentic lead-ins while preserving
         * the core meaning and keeping the Lorekeeper's voice intact.
         */
        diversifyUtterance(candidateText, realm = 'angband') {
            const raw = String(candidateText || '').trim();
            if (!raw) return raw;
            if (!this.isRepetitive(raw)) {
                this.recordUtterance(raw);
                return raw;
            }

            const r = String(realm || 'angband').toLowerCase();
            const pool = REALM_ALTERNATE_LEAD_INS[r] || REALM_ALTERNATE_LEAD_INS.angband;
            const prefix = pool[this._rotateIdx % pool.length];
            this._rotateIdx++;

            // Strip stock opening clause if separated by comma, or prepend varied lead-in
            let body = raw;
            for (let i = 0; i < OVERUSED_OPENINGS.length; i++) {
                const pat = new RegExp('^' + OVERUSED_OPENINGS[i] + '[^,]*,\s*', 'i');
                if (pat.test(body)) {
                    body = body.replace(pat, '');
                    break;
                }
            }
            const firstChar = body.charAt(0).toLowerCase() + body.slice(1);
            const diversified = `${prefix} ${firstChar}`;
            this.recordUtterance(diversified);
            return diversified;
        }
    }

    /**
     * ChronicleStoryWeaverController — Coordinates the 5-Act Arc, Continuity Callbacks,
     * AI Director Pacing Curve, and Phrase Diversity Guard while preserving TTS voice settings.
     */
    class ChronicleStoryWeaverController {
        constructor(options = {}) {
            this.preserveVoiceProfile = true;
            this.diversityGuard = new PhraseDiversityGuard(options.maxHistory || 24);
            this._milestones = [];
            this._maxMilestones = 36;
            this._nemesisLedger = new Map();
            this._relicLineage = new Map();
            this._lastNarratedTurn = -999;
        }

        /**
         * Records a significant story beat (`relic_found`, `near_death_scar`, `boss_slain`, `altar_vow`, `branch_entered`)
         * so later turns can weave organic callbacks.
         */
        recordStoryBeat(beat = {}) {
            const entry = {
                kind: String(beat.kind || 'moment'),
                turn: Number(beat.turn) || 0,
                depth: Number(beat.depth) || 0,
                realm: String(beat.realm || 'angband').toLowerCase(),
                subject: String(beat.subject || beat.entity || beat.item || '').trim(),
                detail: String(beat.detail || '').trim(),
                hpRatio: (typeof beat.hpRatio === 'number') ? beat.hpRatio : 1.0
            };

            if (entry.kind === 'near_death_scar' && entry.subject) {
                this._nemesisLedger.set(entry.subject.toLowerCase(), entry);
            } else if (entry.kind === 'relic_found' && entry.subject) {
                this._relicLineage.set(entry.subject.toLowerCase(), entry);
            }

            this._milestones.push(entry);
            if (this._milestones.length > this._maxMilestones) {
                this._milestones.shift();
            }
            return entry;
        }

        /**
         * Finds relevant earlier story beats that connect to the current turn's monster, weapon, or depth.
         */
        buildCallbackContext(currentContext = {}) {
            const callbacks = [];
            const foe = String(currentContext.monster || currentContext.foe || '').trim().toLowerCase();
            const weapon = String(currentContext.wieldedWeapon || currentContext.item || '').trim().toLowerCase();

            if (foe && this._nemesisLedger.has(foe)) {
                const scar = this._nemesisLedger.get(foe);
                callbacks.push({
                    type: 'nemesis_callback',
                    summary: `Previously survived a near-fatal clash (${Math.round(scar.hpRatio * 100)}% HP) against ${scar.subject} on Depth ${scar.depth}.`
                });
            }

            if (weapon && this._relicLineage.has(weapon)) {
                const relic = this._relicLineage.get(weapon);
                callbacks.push({
                    type: 'relic_lineage',
                    summary: `Wielding ${relic.subject}, claimed on Depth ${relic.depth} (${relic.detail || 'proven in earlier depths'}).`
                });
            }

            if (callbacks.length === 0 && this._milestones.length > 0) {
                const recent = this._milestones[this._milestones.length - 1];
                callbacks.push({
                    type: 'arc_continuity',
                    summary: `Continuing from Depth ${recent.depth} after ${recent.kind}: ${recent.subject || recent.detail}.`
                });
            }

            return callbacks;
        }

        /**
         * AI Director Pacing Curve (`evaluateNarrativePacing`)
         * Computes a `0.0..1.0` Dramatic Tension Score and decides whether the Lorekeeper
         * should speak on this turn, how many words to use, and what emotional cadence to adopt.
         */
        evaluateNarrativePacing(state = {}) {
            const turn = Number(state.turn) || 0;
            const depth = Number(state.depth) || 0;
            const hpRatio = (typeof state.hpRatio === 'number') ? state.hpRatio : 1.0;
            const hpDrop = Math.max(0, Number(state.hpDropRatio) || 0);
            const isBossOrUnique = Boolean(state.isUnique || state.isBoss);
            const isMajorDiscovery = Boolean(state.isArtifact || state.isNewBranch || state.isAltarRitual);
            const turnsSinceLast = turn - this._lastNarratedTurn;

            let tension = 0.15;
            if (hpRatio <= 0.30) tension += 0.45;
            else if (hpRatio <= 0.55) tension += 0.20;
            if (hpDrop >= 0.20) tension += 0.30;
            if (isBossOrUnique) tension += 0.35;
            if (isMajorDiscovery) tension += 0.25;
            tension = Number(Math.min(1.0, tension).toFixed(2));

            const act = resolveMythicAct(depth, state.realm);

            // High / Climax Tension: immediate narration, sharp visceral cadence
            if (tension >= 0.70) {
                this._lastNarratedTurn = turn;
                return {
                    shouldNarrate: true,
                    tension,
                    tier: 'climax',
                    cooldownTurns: 0,
                    targetWordRange: [12, 22],
                    cadence: 'urgent, visceral, immediate',
                    act
                };
            }

            // Rising Tension: moderate cooldown (15 turns), story-weaving cadence
            if (tension >= 0.35) {
                const ready = turnsSinceLast >= 15 || isMajorDiscovery;
                if (ready) this._lastNarratedTurn = turn;
                return {
                    shouldNarrate: ready,
                    tension,
                    tier: 'rising',
                    cooldownTurns: 15,
                    targetWordRange: [18, 28],
                    cadence: act.cadenceStyle,
                    act
                };
            }

            // Quiet Exploration: long cooldown (40 turns), brief atmospheric reflection
            const ready = turnsSinceLast >= 40;
            if (ready) this._lastNarratedTurn = turn;
            return {
                shouldNarrate: ready,
                tension,
                tier: 'ambient',
                cooldownTurns: 40,
                targetWordRange: [10, 16],
                cadence: 'hushed, atmospheric, concise',
                act
            };
        }

        /**
         * Builds the enriched, non-repetitive prompt directive for `chronicle-llm.js`
         * while guaranteeing `preserveVoiceProfile = true`.
         */
        composeStoryDirective(state = {}) {
            const pacing = this.evaluateNarrativePacing(state);
            const callbacks = this.buildCallbackContext(state);
            const bannedOpenings = this.diversityGuard.getBannedOpenings().slice(0, 12);

            return {
                preserveVoiceProfile: true,
                realm: String(state.realm || 'angband').toLowerCase(),
                actTitle: pacing.act.title,
                narrativeLens: pacing.act.narrativeLens,
                tensionTier: pacing.tier,
                tensionScore: pacing.tension,
                targetWordRange: pacing.targetWordRange,
                cadence: pacing.cadence,
                continuityCallbacks: callbacks,
                bannedOpenings: bannedOpenings,
                promptSupplement: [
                    `[ACT: ${pacing.act.title}] ${pacing.act.narrativeLens}`,
                    `[PACING: ${pacing.tier.toUpperCase()} | ${pacing.targetWordRange[0]}-${pacing.targetWordRange[1]} words | Cadence: ${pacing.cadence}]`,
                    callbacks.length ? `[CONTINUITY CALLBACK: ${callbacks.map(c => c.summary).join(' ')}]` : '',
                    `[BANNED REPETITIVE OPENINGS: Never begin with ${bannedOpenings.map(b => '"' + b + '"').join(', ')}]`
                ].filter(Boolean).join('\\n')
            };
        }
    }

    const singleton = new ChronicleStoryWeaverController();

    return {
        MYTHIC_ACTS,
        OVERUSED_OPENINGS,
        resolveMythicAct,
        getActMetadata: resolveMythicAct,
        PhraseDiversityGuard,
        ChronicleStoryWeaverController,
        getInstance: () => singleton,
        recordStoryBeat: (b) => singleton.recordStoryBeat(b),
        buildCallbackContext: (ctx) => singleton.buildCallbackContext(ctx),
        evaluateNarrativePacing: (st) => singleton.evaluateNarrativePacing(st),
        composeStoryDirective: (st) => singleton.composeStoryDirective(st),
        diversifyUtterance: (txt, r) => singleton.diversityGuard.diversifyUtterance(txt, r)
    };
});

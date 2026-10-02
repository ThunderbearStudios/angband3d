/**
 * ChronicleLLMBridge — Multi-LLM BYOK Adapter for The Living Chronicle & Voiced Lorekeeper
 * Supports Google Gemini (2.5 Flash / 1.5 Flash), OpenAI (GPT-4o / GPT-4o-mini),
 * Anthropic Claude (3.5 Haiku / Sonnet), and Local/OpenRouter (Ollama / LM Studio).
 * Gracefully falls back to offline procedural Tolkien lore on any network or parsing failure.
 */

// Curated Google AI Studio Free Tier model chain for automatic failover in order of confirmed working capability
const FREE_TIER_CHAIN = [
    'gemini-3.8-flash',      // Flagship Flash (Highest intelligence, New Stable)
    'gemini-3.7-flash',      // High-performance agentic Flash (Stable)
    'gemini-3.6-flash',      // Balanced Flash (Stable)
    'gemini-3.5-flash',      // Foundational Flash (Stable)
    'gemini-3.5-flash-lite', // High-throughput, ultra-cost-effective (Stable)
    'gemini-3.1-flash-lite', // Frontier-class lightweight (Stable)
    'gemini-2.5-flash',      // Proven hybrid reasoning (Stable)
    'gemini-2.5-flash-lite'  // Ultra-fast budget multimodal (Stable)
];

function redactSecret(val, secret = '') {
    if (!val || typeof val !== 'string') return val;
    let sanitized = val;
    if (secret && secret.length > 5) {
        sanitized = sanitized.split(secret).join('[PROTECTED_KEY]');
    }
    return sanitized;
}

class ChronicleLLMBridge {
    constructor() {
        this.provider = 'offline'; // 'offline' | 'gemini' | 'openai' | 'anthropic' | 'custom'
        this.apiKey = '';
        this.model = '';
        this.endpoint = '';

        // Free Tier Cost Protection & Sliding Window Rate Limiter
        this.modelTimestamps = new Map(); // model -> [timestamps]
        this.requestTimestamps = []; // backward compatibility
        this.MAX_RPM = 10; // Strict Free Tier ceiling: 10 requests / minute
        this.enforceFreeTier = true; // Permanently enforced, non-optional

        this.onStatusUpdate = null; // Status callback for UI transparent notification

        // Anti-Repetition Rolling Utterance Buffer
        this.recentUtterances = [];

        this.hasServerKey = false;
        this.loadSettings();
        this.fetchServerKeyIfEmpty();
    }

    async fetchServerKeyIfEmpty() {
        if (typeof window === 'undefined') return;
        try {
            const r = await fetch('/api/config/llm');
            if (r.ok) {
                const d = await r.json();
                if (d && (d.hasKey || d.hasServerKey)) {
                    this.hasServerKey = true;
                    this.provider = 'gemini';
                    this.model = d.defaultModel || 'gemini-3.8-flash';
                    // Clean up any stale client-side key from localStorage since server key is active
                    if (window.localStorage && !this.apiKey) {
                        try {
                            localStorage.removeItem('angband_llm_api_key');
                        } catch (_) {}
                    }
                    console.log('[ChronicleLLM] Server has protected Gemini API key configured in backend environment.');
                }
            }
        } catch (_) {}
    }

    recordUtterance(text) {
        if (!text || typeof text !== 'string') return;
        const clean = text.replace(/<[^>]*>/g, '').trim();
        if (clean.length > 5) {
            this.recentUtterances.push(clean);
            if (this.recentUtterances.length > 30) {
                this.recentUtterances.shift();
            }
        }
    }

    loadSettings() {
        if (typeof window === 'undefined' || !window.localStorage) return;
        try {
            const savedProvider = localStorage.getItem('angband_llm_provider');
            if (savedProvider) this.provider = savedProvider;

            const savedKey = localStorage.getItem('angband_llm_api_key');
            if (savedKey) this.apiKey = savedKey;

            const savedEnforce = localStorage.getItem('angband_llm_enforce_free');
            if (savedEnforce !== null) this.enforceFreeTier = (savedEnforce === 'true');

            const savedModel = localStorage.getItem('angband_llm_model');
            if (savedModel) {
                // Auto-migrate retired 404 models to gemini-3.8-flash (preserve confirmed 2.5-flash)
                if (savedModel.includes('1.5-flash') || savedModel.includes('2.0-flash')) {
                    this.model = 'gemini-3.8-flash';
                    try { localStorage.setItem('angband_llm_model', this.model); } catch (_) {}
                } else {
                    this.model = savedModel;
                }
            }

            const savedEndpoint = localStorage.getItem('angband_llm_endpoint');
            if (savedEndpoint) this.endpoint = savedEndpoint;
        } catch (_) {}
    }

    saveSettings(settings = {}) {
        if (settings.provider !== undefined) this.provider = settings.provider;
        if (settings.apiKey !== undefined) this.apiKey = settings.apiKey.trim();
        if (settings.model !== undefined) this.model = settings.model.trim();
        if (settings.endpoint !== undefined) this.endpoint = settings.endpoint.trim();
        // Rate limiting is permanently enforced (never optional)
        this.enforceFreeTier = true;

        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                localStorage.setItem('angband_llm_provider', this.provider);
                if (this.apiKey) {
                    localStorage.setItem('angband_llm_api_key', this.apiKey);
                } else {
                    localStorage.removeItem('angband_llm_api_key');
                }
                localStorage.setItem('angband_llm_model', this.model);
                localStorage.setItem('angband_llm_endpoint', this.endpoint);
                localStorage.setItem('angband_llm_enforce_free', 'true');
            } catch (_) {}
        }
    }

    getActiveModel() {
        if (this.model) {
            // Guard against deprecated 404 models if passed directly
            if (this.model.includes('1.5-flash') || this.model.includes('2.0-flash')) {
                return 'gemini-3.8-flash';
            }
            return this.model;
        }
        switch (this.provider) {
            case 'gemini': return 'gemini-3.8-flash';
            case 'openai': return 'gpt-4o-mini';
            case 'anthropic': return 'claude-3-5-haiku-20241022';
            case 'custom': return 'llama3';
            default: return 'offline-procedural';
        }
    }

    notifyStatus(msg, isWarning = false) {
        if (typeof this.onStatusUpdate === 'function') {
            try { this.onStatusUpdate(msg, isWarning); } catch (_) {}
        }
    }

    pruneOldTimestamps(now = Date.now()) {
        for (const [m, timestamps] of this.modelTimestamps.entries()) {
            const valid = timestamps.filter(t => (now - t) < 60000);
            if (valid.length === 0) {
                this.modelTimestamps.delete(m);
            } else {
                this.modelTimestamps.set(m, valid);
            }
        }
    }

    getModelRPM(model) {
        const now = Date.now();
        const list = (this.modelTimestamps.get(model) || []).filter(t => (now - t) < 60000);
        this.modelTimestamps.set(model, list);
        return list.length;
    }

    recordModelRequest(model) {
        const now = Date.now();
        const list = (this.modelTimestamps.get(model) || []).filter(t => (now - t) < 60000);
        list.push(now);
        this.modelTimestamps.set(model, list);
        this.requestTimestamps = list; // backward compatibility
        this.pruneOldTimestamps(now);
    }

    /**
     * Finds the next best confirmed working model in the FREE_TIER_CHAIN.
     * Prioritizes stepping down sequentially to the next tier, wrapping back to cooled-down tiers if needed.
     */
    findAvailableFreeModel(currentModel = null) {
        const currentIndex = currentModel ? FREE_TIER_CHAIN.indexOf(currentModel) : -1;
        // Priority 1: Step down sequentially to the next best confirmed working models
        for (let i = currentIndex + 1; i < FREE_TIER_CHAIN.length; i++) {
            const m = FREE_TIER_CHAIN[i];
            if (this.getModelRPM(m) < this.MAX_RPM) {
                return m;
            }
        }
        // Priority 2: Wrap around to see if higher tiers have cooled down
        for (let i = 0; i <= currentIndex; i++) {
            const m = FREE_TIER_CHAIN[i];
            if (m !== currentModel && this.getModelRPM(m) < this.MAX_RPM) {
                return m;
            }
        }
        return null;
    }

    isConfigured() {
        if (this.provider === 'offline') return false;
        if (this.provider === 'custom') return !!this.endpoint;
        if (this.provider === 'gemini' && this.hasServerKey) return true;
        return !!this.apiKey;
    }

    /**
     * Generates an atmospheric chronicle chapter or flowing narrative passage using the player's configured LLM,
     * or smoothly falls back to ChronicleGrounder procedural generation.
     */
    async generateChapter(event, player, traditionKey = 'westmarch', grounder = null) {
        if (!this.isConfigured() || this.provider === 'offline') {
            return (grounder || ChronicleGrounder).generateProceduralChapter(event, player, traditionKey);
        }

        const tradition = (ChronicleGrounder.TRADITIONS && ChronicleGrounder.TRADITIONS[traditionKey])
            ? ChronicleGrounder.TRADITIONS[traditionKey]
            : { name: 'The Red Book of Westmarch', style: 'heroic, grounded, mortal courage' };

        const isFlowing = (event.isChapter === false);
        const depth = (player && typeof player.depth === 'number') ? player.depth : 0;
        const isTown = (depth === 0);        const systemPrompt = isFlowing
            ? `You are the Master Chronicler of Angband, continuing the active saga of ${player ? player.name : 'the hero'} in the literary tradition: "${tradition.name}".
Perspective: ${tradition.style}.
Tolkien tone: Serious, atmospheric, legendary, direct, descriptive of dungeon skirmishes and perilous exploration.
Critical Story Guidelines:
- Direct Brevity: Exactly 1 to 2 concise, punchy sentences. Cut excessive purple prose; keep the pacing swift and engaging.
- Coalesced Combat & Blow-by-Blow: When multiple strikes or combat messages occur concurrently, weave them into one unified, cohesive exchange (e.g., "twin strikes in rapid succession", "parrying one blow only to catch a blade to the shoulder").
- Integrated Status Ailments: If player status effects (confused, poisoned, blind, stunned, terrified, paralyzed, bleeding) are present, integrate them directly into the hero's physical struggle.
- Character Psychology: Reveal the hero's internal thoughts, racial heritage (${player ? player.race : 'Mortal'}), and tactical justification (fear, ruthless survival, or duty).
- Moral & Lore Judgment: Frame the deed in accordance with ${tradition.name}. Slaying innocents or beggars in town is a dark, tragic deed.
Length: Exactly 1 to 2 sentences of high-impact flowing prose. Do NOT write a chapter title or header.
Output: Respond with ONLY a raw JSON object (no markdown, no code blocks):
{
  "prose": "1-2 sentences of direct, punchy flowing narrative continuing the active scene.",
  "dialogue": { "speaker": "Name or null", "text": "Short spoken line or null" }
}`
            : `You are the Master Chronicler of Angband, recording the saga of ${player ? player.name : 'the hero'} in strict accordance with the literary tradition: "${tradition.name}".
Perspective: ${tradition.style}.
Tolkien tone: Serious, atmospheric, legendary, never modern slang, never fourth-wall breaking in chapter prose.
Critical Story Guidelines:
- Direct Brevity: Exactly 1 to 2 concise, punchy sentences. Cut rambling prose; make every word count while retaining Tolkien gravitas.
- Coalesced Combat & Blow-by-Blow: Synthesize concurrent strikes, counter-attacks, and lethal blows into one unified tactical exchange.
- Integrated Status Ailments: Weave status conditions (confused, poisoned, blind, stunned, terrified, paralyzed, bleeding) directly into the sensory peril of the scene.
- Justification & Internal Narrative: Contextualize why the hero acted according to their race (${player ? player.race : 'Mortal'}) and class (${player ? player.class : 'Warrior'}).
- Moral Weight: Reflect the reality of the situation (e.g. street violence vs dungeon orc slaying).
Length: Exactly 1 to 2 sentences of high-impact narrative prose.
Output: Respond with ONLY a raw JSON object (no markdown code blocks, no backticks, no preamble) with these keys:
{
  "title": "Short poetic title (3-5 words)",
  "prose": "1-2 sentences of atmospheric, direct prose describing the event.",
  "summary": "One short sentence summary.",
  "dialogue": { "speaker": "Name or null", "text": "Short spoken line or null" }
}`;

        const locationText = isTown ? 'Town of Angband (surface streets, timber eaves, cobblestones)' : `Dungeon Depth ${depth * 50}ft (subterranean vaults, Iron Hell)`;
        
        let antiRepetition = '';
        if (this.recentUtterances && this.recentUtterances.length > 0) {
            const sample = this.recentUtterances.slice(-4).map(u => `"${u.slice(0, 70)}..."`).join(' | ');
            antiRepetition = `\nCRITICAL ANTI-REPETITION MANDATE:\nDo NOT repeat or closely mirror recently recorded phrases:\n${sample}\nEvery sentence must be completely fresh, unique, and attuned to this exact moment.`;
        }

        const backstory = (grounder || ChronicleGrounder).formatBackstorySummary ? (grounder || ChronicleGrounder).formatBackstorySummary(player) : '';
        const backstoryContext = backstory ? ` Backstory: ${backstory}.` : '';

        const userPrompt = `Hero: ${player ? player.name : 'Hero'}, ${player ? player.race : 'Mortal'} ${player ? player.class : 'Warrior'}.${backstoryContext} Location: ${locationText}.
Event: ${event.type}. Details: ${JSON.stringify(event.data || {})}.${antiRepetition}
Compose ${isFlowing ? 'flowing passage' : 'Chapter'}. (For new instance starts and intros, weave the character's backstory and heritage into the scene).`;

        try {
            const rawText = await this.callLLM(systemPrompt, userPrompt);
            const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.prose) {
                this.recordUtterance(parsed.prose);
                if (parsed.dialogue && parsed.dialogue.text) {
                    this.recordUtterance(parsed.dialogue.text);
                }
                return {
                    title: parsed.title || 'Echoes in the Deep',
                    prose: parsed.prose,
                    summary: parsed.summary || parsed.title || parsed.prose.substring(0, 80),
                    dialogue: parsed.dialogue && parsed.dialogue.text ? parsed.dialogue : null,
                    llm_generated: true,
                    model: this.getActiveModel()
                };
            }
        } catch (err) {
            console.warn('[ChronicleLLM] LLM generation failed or timed out, using procedural fallback:', err.message);
        }

        const proc = (grounder || ChronicleGrounder).generateProceduralChapter(event, player, traditionKey);
        if (proc && proc.prose) this.recordUtterance(proc.prose);
        return proc;
    }

    /**
     * Talks directly with a targeted creature in 3D.
     * Takes creature state (sleeping, under attack, fleeing, hostile, townsperson) into account.
     * Fully synchronizes narrative pronouns, physical descriptions, and voices with the 3D model.
     * Generates rich scene prose even for sleeping/silent entities.
     */
    async chatWithCreature(monster, playerMessage, player = null, recentMessages = []) {
        const turn = (monster && monster._interactTurn) ? monster._interactTurn : 1;
        const groundTruth = ChronicleGrounder.resolveCreatureEncounter(monster, player, recentMessages, turn, playerMessage);

        const name = monster.name || monster.race || 'creature';
        const stateObj = ChronicleGrounder.resolveCreatureState(monster, recentMessages);
        const gender = groundTruth.gender || (groundTruth.isFemale ? 'female' : 'male');
        const isF = (gender === 'female');
        const prSub = isF ? 'she' : 'he';
        const prCap = isF ? 'She' : 'He';
        const prPoss = isF ? 'her' : 'his';
        const prObj = isF ? 'her' : 'him';

        if (!this.isConfigured() || this.provider === 'offline') {
            return groundTruth;
        }

        // Anti-repetition context
        let antiRep = '';
        if (this.recentUtterances && this.recentUtterances.length > 0) {
            const sample = this.recentUtterances.slice(-4).map(u => `"${u.slice(0, 60)}..."`).join(' | ');
            antiRep = `\nCRITICAL ANTI-REPETITION MANDATE:\nDo NOT reuse recent phrases or static cliches:\n${sample}\nEvery line must be fresh, unexpected, and completely unique to this situation.`;
        }

        // 1. SLEEPING OR NON-VOCAL ENTITIES: Generate rich scene prose (dialogue is null)
        if (!groundTruth.isDialogue || groundTruth.text === null) {
            const stateDesc = (stateObj.state === 'sleeping')
                ? `asleep in undisturbed slumber (${prSub} cannot converse)`
                : `non-vocal or silent (${stateObj.observation || 'cannot speak words'})`;

            const systemPrompt = `You are the Master Chronicler of Angband describing a creature encountered in the realm.
Creature: "${name}".
CRITICAL VISUAL GENDER & 3D MODEL MANDATE:
The 3D model rendered on screen is visually ${gender.toUpperCase()} (${gender === 'female' ? 'Woman / Female Model' : 'Man / Male Model'}).
You MUST use ${gender === 'female' ? 'FEMALE pronouns (she, her, hers, herself)' : 'MALE pronouns (he, him, his, himself)'}.
NEVER use ${gender === 'female' ? 'male pronouns (he/him/his)' : 'female pronouns (she/her/hers)'} under any circumstance!
Status: ${stateDesc}.
Hero: "${player ? player.name : 'The traveler'}", a ${player ? player.race : 'mortal'} ${player ? player.class : 'adventurer'}.
${antiRep}
Rules:
- Write exactly 1 to 2 sentences of evocative scene prose describing the creature's resting posture, breathing, gear, and atmospheric presence.
- You MUST respect the creature's visual gender presentation: use "${prSub}", "${prPoss}", and "${prObj}" consistently.
- Spoken dialogue MUST be null!
- Return ONLY a raw JSON object (no markdown, no backticks):
{
  "prose": "1-2 sentences of atmospheric scene prose.",
  "dialogue": null
}`;

            try {
                const raw = await this.callLLM(systemPrompt, `Player observes the ${name}. Query if any: "${playerMessage || ''}"`);
                const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
                const parsed = JSON.parse(cleaned);
                if (parsed.prose) {
                    this.recordUtterance(parsed.prose);
                    return {
                        prose: parsed.prose,
                        text: null,
                        isDialogue: false,
                        speaker: name,
                        recommendedVoice: groundTruth.recommendedVoice,
                        isFemale: isF,
                        gender: gender,
                        modelGender: gender
                    };
                }
            } catch (err) {
                console.warn('[ChronicleLLM] Sleeping creature scene prose failed, using ground truth:', err.message);
            }

            return groundTruth;
        }

        // 2. AWAKE VOCAL CREATURES: Roleplay in character with visual gender synchronization
        const inCombat = (stateObj.state.includes('combat') || stateObj.state.includes('wounded') || stateObj.state === 'panicked_townsperson');

        let combatGuidance = '';
        if (inCombat) {
            combatGuidance = `
CRITICAL COMBAT CONTEXT:
The player is ACTIVELY ATTACKING this creature!
Current Health: ${monster.hp || 1} / ${monster.hp_max || monster.hp || 1}.
Observation: ${stateObj.observation}.
CRITICAL INSTRUCTION:
- If townsperson or merchant: You are being brutally assaulted by the player! Scream for the town guards, yell 'Murder in the streets!', or plead for your life!
- If monster or orc: Snarl in rage, curse the attacker's steel, or scream a combat taunt!
- You MUST react directly to being struck! Do NOT offer peaceful greetings or shop services!`;
        }

        const systemPrompt = `You are roleplaying a creature in the classic roguelike Angband (J.R.R. Tolkien mythos).
Creature: "${name}".
CRITICAL VISUAL GENDER & 3D MODEL MANDATE:
The 3D model rendered on screen is visually ${gender.toUpperCase()} (${gender === 'female' ? 'Woman / Female Model' : 'Man / Male Model'}).
You MUST use ${gender === 'female' ? 'FEMALE pronouns (she, her, hers, herself)' : 'MALE pronouns (he, him, his, himself)'}.
NEVER use ${gender === 'female' ? 'male pronouns (he/him/his)' : 'female pronouns (she/her/hers)'} under any circumstance!
Creature State: "${stateObj.state}".
Creature Observation: "${stateObj.observation}".
Player: "${player ? player.name : 'Adventurer'}", a ${player ? player.race : ''} ${player ? player.class : ''}.
${combatGuidance}
${antiRep}
Guidelines:
- Scene prose must describe ${prPoss} posture and actions matching ${gender} presentation ("${prSub}", "${prPoss}").
- Spoken dialogue: exactly 1 sentence in character. Vintage Tolkien tone. No quotes or modern slang.
- Return ONLY a raw JSON object (no markdown, no backticks):
{
  "prose": "1-2 sentences of atmospheric scene prose describing the creature's posture and actions.",
  "dialogue": "1 spoken sentence in character."
}`;

        try {
            const raw = await this.callLLM(systemPrompt, `Player says: "${playerMessage || 'Hail!'}"`);
            const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.dialogue || parsed.prose) {
                if (parsed.prose) this.recordUtterance(parsed.prose);
                if (parsed.dialogue) this.recordUtterance(parsed.dialogue);
                return {
                    prose: parsed.prose || groundTruth.prose,
                    text: (parsed.dialogue || groundTruth.text).replace(/^["']|["']$/g, '').trim(),
                    isDialogue: true,
                    speaker: name,
                    recommendedVoice: groundTruth.recommendedVoice,
                    isFemale: isF,
                    gender: gender,
                    modelGender: gender
                };
            }
        } catch (err) {
            console.warn('[ChronicleLLM] Creature dialogue failed, using procedural fallback:', err.message);
        }

        return groundTruth;
    }

    /**
     * Answers player questions regarding Angband 4.2.6 survival, keybindings, and mechanics
     * while maintaining an authentic Lorekeeper persona.
     */
    async consultLorekeeper(query, player = null) {
        if (!this.isConfigured() || this.provider === 'offline') {
            return ChronicleGrounder.answerSurvivalQuery(query, player);
        }

        const systemPrompt = `You are the ancient Lorekeeper of Angband, mentor and guide to heroes delving into the Iron Hell.
You know the complete body of Angband 4.2.6 mechanics, keybindings (roguelike and standard keysets), survival tactics, shop mechanics, item commands, and Tolkien lore.
Rules:
- Be diegetically wise, warm, and helpful.
- When explaining game mechanics (keys, commands, inventory, resting, shops, terminal), cross the fourth wall gracefully (e.g. "To quaff a potion, press 'q'...").
- Keep answers concise and direct: 2 to 3 sentences maximum!`;

        try {
            const answer = await this.callLLM(systemPrompt, query);
            if (answer && answer.trim()) {
                const cleaned = answer.trim();
                this.recordUtterance(cleaned);
                return cleaned;
            }
        } catch (err) {
            console.warn('[ChronicleLLM] Lorekeeper query failed, using procedural fallback:', err.message);
        }

        return ChronicleGrounder.answerSurvivalQuery(query, player);
    }

    /**
     * Unified Provider Dispatcher with Free Tier Rate Limiting, Automatic Failover & 10s AbortController timeout
     */
    async callLLM(systemPrompt, userPrompt) {
        // Enforce strict Free Tier rate limit with automatic model cascade
        if (this.enforceFreeTier) {
            const currentModel = this.getActiveModel();
            const now = Date.now();

            // Backward compatibility for requestTimestamps
            this.requestTimestamps = this.requestTimestamps.filter(t => (now - t) < 60000);
            const curRpm = Math.max(this.getModelRPM(currentModel), this.requestTimestamps.length);

            if (curRpm >= this.MAX_RPM) {
                if (this.provider === 'gemini') {
                    const nextModel = this.findAvailableFreeModel(currentModel);
                    if (nextModel) {
                        this.model = nextModel;
                        this.saveSettings({ model: nextModel });
                        const notifyMsg = `⚡ Auto-switched to ${nextModel} (Rate limit protection)`;
                        console.log(`[ChronicleLLM] ${notifyMsg}`);
                        this.notifyStatus(notifyMsg, false);
                    } else {
                        const notifyMsg = `🛡️ Free tier rate limit reached (${this.MAX_RPM} RPM) across all free models. Using procedural lorekeeper.`;
                        console.warn(`[ChronicleLLM] ${notifyMsg}`);
                        this.notifyStatus(notifyMsg, true);
                        throw new Error(`Free tier rate limit ceiling reached (${this.MAX_RPM} RPM) for cost protection.`);
                    }
                } else {
                    console.warn(`[ChronicleLLM] Free Tier rate limit ceiling (${this.MAX_RPM} RPM) reached for ${this.provider}.`);
                    throw new Error(`Free tier rate limit ceiling reached (${this.MAX_RPM} RPM) for cost protection.`);
                }
            }

            this.recordModelRequest(this.getActiveModel());
        }

        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const signal = controller ? controller.signal : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;

        try {
            switch (this.provider) {
                case 'gemini':
                    return await this.callGemini(systemPrompt, userPrompt, signal);
                case 'openai':
                    return await this.callOpenAI(systemPrompt, userPrompt, signal);
                case 'anthropic':
                    return await this.callAnthropic(systemPrompt, userPrompt, signal);
                case 'custom':
                    return await this.callCustom(systemPrompt, userPrompt, signal);
                default:
                    throw new Error(`Unsupported provider: ${this.provider}`);
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    async callGemini(systemPrompt, userPrompt, signal, retryCount = 0) {
        const model = this.getActiveModel();
        const isGemini3 = model.includes('gemini-3') || model.includes('3.8') || model.includes('3.7') || model.includes('3.6') || model.includes('3.5') || model.includes('3.1');

        const generationConfig = {
            maxOutputTokens: 350
        };

        if (isGemini3) {
            // Gemini 3.x models use thinkingConfig and deprecate temperature
            generationConfig.thinkingConfig = {
                thinkingLevel: 'LOW'
            };
        } else {
            generationConfig.temperature = 0.7;
        }

        const payload = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [
                { role: 'user', parts: [{ text: userPrompt }] }
            ],
            generationConfig
        };

        let res;
        // Zero API Key Exposure: If server has key configured in .env or client has no direct key,
        // route request securely through local server backend proxy.
        if (this.hasServerKey || !this.apiKey) {
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiKey) {
                headers['x-goog-api-key'] = this.apiKey;
            }
            res = await fetch('/api/llm/generate', {
                method: 'POST',
                headers,
                body: JSON.stringify({ model, payload }),
                signal
            });
        } else {
            // Standalone client with explicit client-side key
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey
                },
                body: JSON.stringify(payload),
                signal
            });
        }

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            const errMsg = errJson.error ? errJson.error.message : res.statusText;

            // Handle HTTP 429 Quota Exceeded or transient 503/404 with automatic transparent model failover
            if ((res.status === 429 || res.status === 503 || res.status === 404) && retryCount < FREE_TIER_CHAIN.length) {
                const currentModel = model;
                const reason = res.status === 429 ? '429 Quota Exceeded' : `${res.status} Unavailable`;
                console.warn(`[ChronicleLLM] Received ${reason} on ${currentModel}. Auto-failing over to next best confirmed model.`);
                const nextModel = this.findAvailableFreeModel(currentModel);
                if (nextModel) {
                    this.model = nextModel;
                    this.saveSettings({ model: nextModel });
                    const notifyMsg = `⚡ Auto-switched to ${nextModel} (${reason} Failover)`;
                    console.log(`[ChronicleLLM] ${notifyMsg}`);
                    this.notifyStatus(notifyMsg, false);
                    return await this.callGemini(systemPrompt, userPrompt, signal, retryCount + 1);
                } else {
                    this.notifyStatus('🛡️ Free Tier models quota reached — seamlessly using procedural lore', true);
                    throw new Error(`All Free Tier models currently exhausted quota (${reason}). Seamless procedural fallback.`);
                }
            }

            // Authentication / Authorization / Bad Request errors (400, 401, 403) must NOT cascade across models
            if (res.status === 400 || res.status === 401 || res.status === 403) {
                const safeMsg = redactSecret(errMsg, this.apiKey);
                this.notifyStatus(`⚠️ Gemini Authentication/Request error (${res.status}): ${safeMsg}`, true);
                throw new Error(`Gemini Authentication/Request error (${res.status}): ${safeMsg}`);
            }

            throw new Error(`Gemini API error ${res.status}: ${redactSecret(errMsg, this.apiKey)}`);
        }

        const data = await res.json();
        const candidate = data.candidates && data.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            throw new Error('Gemini returned empty response');
        }

        // When thinkingConfig is enabled, some parts represent thoughts (part.thought === true).
        // Find the actual final answer text part.
        const answerPart = candidate.content.parts.find(p => !p.thought && p.text) || candidate.content.parts[candidate.content.parts.length - 1];
        if (!answerPart || !answerPart.text) {
            throw new Error('Gemini returned no text content');
        }
        return answerPart.text;
    }

    async callOpenAI(systemPrompt, userPrompt, signal) {
        const model = this.getActiveModel();
        const url = 'https://api.openai.com/v1/chat/completions';

        const payload = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 350
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(payload),
            signal
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(`OpenAI API error ${res.status}: ${errJson.error ? errJson.error.message : res.statusText}`);
        }

        const data = await res.json();
        const msg = data.choices && data.choices[0] && data.choices[0].message;
        if (!msg || !msg.content) {
            throw new Error('OpenAI returned empty response');
        }
        return msg.content;
    }

    async callAnthropic(systemPrompt, userPrompt, signal) {
        const model = this.getActiveModel();
        const url = 'https://api.anthropic.com/v1/messages';

        const payload = {
            model,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 350,
            temperature: 0.7
        };

        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        };

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(`Anthropic API error ${res.status}: ${errJson.error ? errJson.error.message : res.statusText}`);
        }

        const data = await res.json();
        const block = data.content && data.content[0];
        if (!block || !block.text) {
            throw new Error('Anthropic returned empty response');
        }
        return block.text;
    }

    async callCustom(systemPrompt, userPrompt, signal) {
        const endpoint = this.endpoint || 'http://localhost:11434/v1/chat/completions';
        const model = this.getActiveModel();

        const payload = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 350
        };

        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(`Endpoint error ${res.status}: ${errJson.error ? (errJson.error.message || errJson.error) : res.statusText}`);
        }

        const data = await res.json();
        const msg = data.choices && data.choices[0] && data.choices[0].message;
        if (!msg || !msg.content) {
            throw new Error('Custom LLM endpoint returned empty response');
        }
        return msg.content;
    }

    /**
     * Verifies API Key and model with a quick ping
     */
    async testConnection(provider, apiKey, model, endpoint) {
        const original = { provider: this.provider, apiKey: this.apiKey, model: this.model, endpoint: this.endpoint };
        try {
            this.provider = provider;
            this.apiKey = apiKey;
            this.model = model;
            this.endpoint = endpoint;

            if (provider === 'offline') {
                return { ok: true, message: 'Built-in offline procedural engine is always ready (0ms latency, zero cost).' };
            }

            const reply = await this.callLLM('You are a test probe.', 'Respond with the single word: READY');
            if (reply && reply.toLowerCase().includes('ready')) {
                const note = (provider === 'gemini' && !apiKey && this.hasServerKey) ? ' (Protected Server Key)' : '';
                return { ok: true, message: `Connected to ${this.getActiveModel()} successfully!${note}` };
            }
            return { ok: true, message: `Connected! Response: "${reply.slice(0, 30)}..."` };
        } catch (err) {
            return { ok: false, error: err.message };
        } finally {
            this.provider = original.provider;
            this.apiKey = original.apiKey;
            this.model = original.model;
            this.endpoint = original.endpoint;
        }
    }
}

if (typeof window !== 'undefined') {
    window.ChronicleLLMBridge = ChronicleLLMBridge;
}

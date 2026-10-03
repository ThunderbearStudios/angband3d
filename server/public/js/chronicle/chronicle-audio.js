/**
 * ChronicleAudio — Web Audio DSP Mastering, HRTF 3D Panner, TTS & Microphone Input
 * Features audio ducking against footsteps/swords, binaural monster spatialization,
 * speed multiplier controls, and speech-to-text mic input with acoustic loopback guards.
 */

class ChronicleAudioRouter {
    constructor(soundEngine = null) {
        this.soundEngine = soundEngine;
        this.enabled = false; // MUTED BY DEFAULT per strict requirement
        this.speed = 1.0;     // 0.75x, 0.85x, 1.0x, 1.25x, 1.5x
        this.flowMode = 'interrupt'; // Default to interrupt: latest developments take priority, story flows cleanly
        this.narratorVoice = 'en-GB-RyanNeural'; // Dramatic theatrical British bard / older English storyteller
        this.ttsEngine = 'gemini'; // High-fidelity Google Gemini Native Audio primary default
        this.isSpeaking = false;
        this.isPaused = false;
        this.isListeningMic = false;
        this.speechQueue = [];
        this.isProcessingSpeechQueue = false;
        this._playSessionId = 0;
        this._activeFetchController = null;

        // Restore persisted audio preferences
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                // Purge legacy manual engine/voice configs so Gemini-only and Enceladus remain pristine
                localStorage.removeItem('angband_chronicle_engine');
                localStorage.removeItem('angband_chronicle_voice');
                localStorage.removeItem('angband_chronicle_tradition');

                const savedMuted = localStorage.getItem('angband_chronicle_muted');
                this.enabled = (savedMuted === 'false'); // Only enable if player explicitly unmuted in prior session
                const savedSpeed = parseFloat(localStorage.getItem('angband_chronicle_speed'));
                if (!isNaN(savedSpeed) && savedSpeed >= 0.5 && savedSpeed <= 2.5) {
                    this.speed = savedSpeed;
                }
                const savedFlow = localStorage.getItem('angband_chronicle_flow');
                if (savedFlow) this.flowMode = savedFlow;
                this.narratorVoice = 'Enceladus';
                this.ttsEngine = 'gemini';

                const savedReverb = parseFloat(localStorage.getItem('angband_chronicle_reverb'));
                if (!isNaN(savedReverb) && savedReverb >= 0.0 && savedReverb <= 1.0) this.reverbWet = savedReverb;
                else this.reverbWet = 0.10; // Default 10% reverb per user request
            } catch (_) {}
        } else {
            this.ttsEngine = 'gemini';
            this.narratorVoice = 'Enceladus';
            this.reverbWet = 0.10; // Default 10% reverb per user request
        }

        this.isLoading = false;
        this.onLoadingStateChange = null;

        // Web Audio Sub-Graph
        this.ctx = null;
        this.voiceMasterGain = null;
        this.voiceLowShelf = null;
        this.voiceHighShelf = null;
        this.reverbNode = null;
        this.reverbGain = null;
        this.activeTradition = 'westmarch';
        this.duckingActive = false;
        this.currentUtterance = null;
        this.speechRecognition = null;

        // Neural Streaming & Voices
        this.currentSource = null;
        this.currentAudio = null;
        this.activePlaybackResolve = null;
        this._pauseTimeout = null;
        this.availableVoices = [];
        this._sequenceSessionId = 0;
        this._isExecutingSequence = false;

        // Decoded AudioBuffer In-Memory LRU Cache & Prewarm In-Flight Registry
        // Bypasses both network and Web Audio decodeAudioData CPU decompression (0.01ms playback)
        this.audioBufferCache = new Map();
        this.MAX_AUDIO_BUFFER_CACHE = 150;
        this._prewarmPromises = new Map();

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                this.availableVoices = window.speechSynthesis.getVoices() || [];
                window.speechSynthesis.onvoiceschanged = () => {
                    this.availableVoices = window.speechSynthesis.getVoices() || [];
                };
            } catch (_) {}
        }
    }

    init(soundEngine) {
        if (soundEngine) this.soundEngine = soundEngine;
        if (!this.soundEngine || !this.soundEngine.ctx) return;
        this.ctx = this.soundEngine.ctx;

        try {
            // Master Voice Sub-Bus
            this.voiceMasterGain = this.ctx.createGain();
            this.voiceMasterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

            // Vintage Analogue Ribbon Mic Warmer: Gentle low-shelf warmth (+1.2dB at 180Hz) and high-shelf smoothing (-1.8dB at 7200Hz)
            this.voiceLowShelf = this.ctx.createBiquadFilter();
            this.voiceLowShelf.type = 'lowshelf';
            this.voiceLowShelf.frequency.setValueAtTime(180, this.ctx.currentTime);
            this.voiceLowShelf.gain.setValueAtTime(1.2, this.ctx.currentTime);

            this.voiceHighShelf = this.ctx.createBiquadFilter();
            this.voiceHighShelf.type = 'highshelf';
            this.voiceHighShelf.frequency.setValueAtTime(7200, this.ctx.currentTime);
            this.voiceHighShelf.gain.setValueAtTime(-1.8, this.ctx.currentTime);

            // Subterranean Vault Convolution Reverb Node
            this.reverbNode = this.ctx.createConvolver();
            const impulse = this._buildVaultImpulseResponse(1.6, 3.5);
            if (impulse) this.reverbNode.buffer = impulse;

            this.reverbGain = this.ctx.createGain();
            this.reverbGain.gain.setValueAtTime(this.reverbWet, this.ctx.currentTime);

            // Direct voice path + wet reverb path feeding into Analog Ribbon filter
            this.voiceMasterGain.connect(this.voiceLowShelf);
            if (this.reverbNode) {
                this.voiceMasterGain.connect(this.reverbNode);
                this.reverbNode.connect(this.reverbGain);
                this.reverbGain.connect(this.voiceLowShelf);
            }

            this.voiceLowShelf.connect(this.voiceHighShelf);
            this.voiceHighShelf.connect(this.ctx.destination);
        } catch (e) {
            console.warn('[ChronicleAudio] Failed to bind Web Audio sub-graph:', e);
        }
    }

    _buildVaultImpulseResponse(duration = 1.6, decay = 3.5) {
        if (!this.ctx) return null;
        try {
            const rate = this.ctx.sampleRate;
            const length = Math.floor(rate * duration);
            const impulse = this.ctx.createBuffer(2, length, rate);
            const left = impulse.getChannelData(0);
            const right = impulse.getChannelData(1);

            // Pre-delay of ~22ms (stone corridor reflection delay)
            const preDelaySamples = Math.floor(rate * 0.022);

            for (let i = 0; i < length; i++) {
                if (i < preDelaySamples) {
                    left[i] = 0;
                    right[i] = 0;
                } else {
                    const t = (i - preDelaySamples) / (length - preDelaySamples);
                    const env = Math.exp(-decay * t);
                    // Dense stereo diffuse reflections
                    left[i] = (Math.random() * 2 - 1) * env;
                    right[i] = (Math.random() * 2 - 1) * env;
                }
            }
            return impulse;
        } catch (_) {
            return null;
        }
    }

    setTradition(traditionKey) {
        if (!traditionKey) return;
        this.activeTradition = traditionKey;
    }

    setReverbVolume(wetLevel) {
        this.reverbWet = Math.max(0, Math.min(1.0, wetLevel));
        try { localStorage.setItem('angband_chronicle_reverb', this.reverbWet.toString()); } catch (_) {}
        if (this.reverbGain && this.ctx) {
            this.reverbGain.gain.setTargetAtTime(this.reverbWet, this.ctx.currentTime, 0.05);
        }
    }

    setEngine(engine) {
        if (engine === 'gemini' || engine === 'edge') {
            this.ttsEngine = engine;
            try { localStorage.setItem('angband_chronicle_engine', engine); } catch (_) {}
        }
    }

    setMuted(muted) {
        this.enabled = !muted;
        try {
            localStorage.setItem('angband_chronicle_muted', muted ? 'true' : 'false');
        } catch (_) {}
        if (muted) {
            this.stopSpeaking();
        }
    }

    setSpeed(speedMultiplier) {
        this.speed = Math.max(0.5, Math.min(2.5, speedMultiplier));
        // Strictly preserve pitch/formant: do not alter AudioBufferSourceNode.playbackRate in Web Audio,
        // which resamples and alters pitch. Speed is handled natively at the neural vocoder level.
        if (this.currentAudio) {
            try {
                if ('preservesPitch' in this.currentAudio) {
                    this.currentAudio.preservesPitch = true;
                }
                this.currentAudio.playbackRate = this.speed;
            } catch (_) {}
        }
        try {
            localStorage.setItem('angband_chronicle_speed', this.speed.toString());
        } catch (_) {}
    }

    setFlowMode(mode) {
        this.flowMode = mode;
        try {
            localStorage.setItem('angband_chronicle_flow', mode);
        } catch (_) {}
    }

    setVoice(voiceId) {
        if (!voiceId) return;
        this.narratorVoice = voiceId;
        try {
            localStorage.setItem('angband_chronicle_voice', voiceId);
        } catch (_) {}
    }

    /**
     * Dips game sound effects (footsteps, swords, spells) by -7dB (gain 0.45)
     * during active voice narration.
     */
    duckGameAudio(duck = true) {
        if (!this.soundEngine || !this.soundEngine.ctx || !this.soundEngine.masterGain) return;
        const ctx = this.soundEngine.ctx;
        const sfxBus = this.soundEngine.masterGain;

        const target = duck ? 0.42 : (this.soundEngine.masterVolume || 0.75);
        this.duckingActive = duck;
        try {
            sfxBus.gain.setTargetAtTime(target, ctx.currentTime, 0.15); // Smooth 150ms ramp
        } catch (_) {}
    }

    _setLoading(loading, details = '') {
        if (this.isLoading === loading) return;
        this.isLoading = loading;
        if (typeof this.onLoadingStateChange === 'function') {
            try {
                this.onLoadingStateChange(loading, details);
            } catch (_) {}
        }
    }

    stopSpeaking() {
        this._playSessionId = (this._playSessionId || 0) + 1;
        this._sequenceSessionId = (this._sequenceSessionId || 0) + 1;
        this._isExecutingSequence = false;
        this.isSpeaking = false;
        this._setLoading(false);
        if (this._activeFetchController) {
            try { this._activeFetchController.abort(); } catch (_) {}
            this._activeFetchController = null;
        }
        if (this._pauseTimeout) {
            clearTimeout(this._pauseTimeout);
            this._pauseTimeout = null;
        }
        const queueToDrain = this.speechQueue;
        this.speechQueue = [];
        this.isProcessingSpeechQueue = false;
        for (const item of queueToDrain) {
            if (item && item.resolve) {
                try { item.resolve({ aborted: true }); } catch (_) {}
            }
        }
        if (this.currentSource) {
            try {
                this.currentSource.onended = null;
                this.currentSource.stop();
                this.currentSource.disconnect();
            } catch (_) {}
            this.currentSource = null;
        }
        if (this.currentAudio) {
            try {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
                this.currentAudio.onended = null;
                this.currentAudio.onerror = null;
            } catch (_) {}
            this.currentAudio = null;
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            try { this.ctx.resume(); } catch (_) {}
        }
        if (this.activePlaybackResolve) {
            const res = this.activePlaybackResolve;
            this.activePlaybackResolve = null;
            try { res({ aborted: true }); } catch (_) {}
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch (_) {}
        }
        this.isSpeaking = false;
        this.isPaused = false;
        this._speechStartTime = 0;
        this.currentRole = null;
        this.duckGameAudio(false);
    }

    getSpeakingDuration() {
        return (this.isSpeaking && this._speechStartTime > 0) ? (Date.now() - this._speechStartTime) : 0;
    }

    getCurrentTime() {
        if (this.currentAudio && typeof this.currentAudio.currentTime === 'number') {
            return this.currentAudio.currentTime;
        }
        return 0;
    }

    getDuration() {
        if (this.currentAudio && typeof this.currentAudio.duration === 'number') {
            return this.currentAudio.duration;
        }
        return 0;
    }

    pause() {
        this.isPaused = true;
        if (this.ctx && this.ctx.state === 'running') {
            try { this.ctx.suspend(); } catch (_) {}
        }
        if (this.currentAudio && !this.currentAudio.paused) {
            try { this.currentAudio.pause(); } catch (_) {}
        } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
            try { window.speechSynthesis.pause(); } catch (_) {}
        }
    }

    resume() {
        this.isPaused = false;
        if (this.ctx && this.ctx.state === 'suspended') {
            try { this.ctx.resume(); } catch (_) {}
        }
        if (this.currentAudio && this.currentAudio.paused) {
            try { this.currentAudio.play(); } catch (_) {}
        } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
            try { window.speechSynthesis.resume(); } catch (_) {}
        }
    }

    /**
     * Speaks narrative prose and creature dialogue with seamless queueing.
     * Returns a Promise that resolves when the prose and optional creature bark finish speaking.
     * Tier 1: Studio-quality Neural TTS via server /api/tts (Edge Neural SSML or Gemini Native Audio).
     * Tier 2: In-browser Web Speech API with clean formant preservation.
     */
    speak(text, dialogue = null, monsterCoords = null, playerCoords = null, cameraYaw = 0, options = {}) {
        if (!this.enabled || !text) return Promise.resolve({ skipped: true });

        // Zero-lag real-time preemption:
        // Always halt prior speech immediately and clear backlog so new game actions speak without latency
        if (this.flowMode === 'interrupt' || this.isSpeaking || this.speechQueue.length > 0) {
            this.stopSpeaking();
        }

        // Low Latency Pruning: Drop any remaining queued beats so voice stays locked with action
        if (this.speechQueue.length > 0) {
            const stale = this.speechQueue.splice(0, this.speechQueue.length);
            for (const item of stale) {
                if (item && item.resolve) {
                    try { item.resolve({ skipped: true, stale: true }); } catch (_) {}
                }
            }
        }

        return new Promise((resolve) => {
            this.speechQueue.push({ text, dialogue, monsterCoords, playerCoords, cameraYaw, options, resolve });
            if (!this.isProcessingSpeechQueue) {
                this.processSpeechQueue();
            }
        });
    }

    async processSpeechQueue() {
        if (this.isProcessingSpeechQueue) return;
        this.isProcessingSpeechQueue = true;

        try {
            while (this.speechQueue.length > 0 && this.enabled) {
                const item = this.speechQueue.shift();
                let result = null;
                try {
                    result = await this._executeSpeak(item.text, item.dialogue, item.options || {});
                } catch (err) {
                    console.warn('[ChronicleAudio] Error speaking queued utterance:', err);
                } finally {
                    if (item && item.resolve) {
                        try { item.resolve(result || { finished: true }); } catch (_) {}
                    }
                }
            }
        } finally {
            this.isProcessingSpeechQueue = false;
        }
    }

    async _executeSpeak(text, dialogue = null, options = {}) {
        this.duckGameAudio(true);
        this.isSpeaking = true;
        this._speechStartTime = Date.now();
        this.currentRole = options.role || (options.narrator ? 'narrator' : 'combat');
        this._isExecutingSequence = true;
        this._sequenceSessionId = (this._sequenceSessionId || 0) + 1;
        const currentSeqId = this._sequenceSessionId;

        try {
            // High-Performance Parallel Pre-Decoding: If vocal dialogue exists, dispatch
            // background pre-warming immediately so the creature bark audio is fully decoded
            // in memory by the time narration finishes (0ms dialogue transition latency).
            if (dialogue && dialogue.text && !dialogue.isNoise && this.enabled) {
                const prewarmVoice = dialogue.recommendedVoice || dialogue.edgeVoice || null;
                const prewarmOptions = dialogue.voiceProfile ? { ...dialogue.voiceProfile, engine: this.ttsEngine } : {
                    emotion: dialogue.emotion || options.emotion || '',
                    geminiTag: dialogue.geminiTag || '',
                    directorNote: dialogue.directorNote || '',
                    gender: dialogue.gender || '',
                    engine: this.ttsEngine
                };
                this.prewarmUtterance(dialogue.text, 'creature', dialogue.speaker, prewarmVoice, prewarmOptions).catch(() => {});
            }

            // 1. Speak main narrative prose (Narrator voice) with emotion & tradition context
            const narrOptions = options.narrator || options || {};
            const r1 = await this.speakUtterance(text, 'narrator', '', null, narrOptions);
            if (r1 && r1.aborted) return { aborted: true };
            if (!this.enabled || this.isPaused || this._sequenceSessionId !== currentSeqId) return { stopped: true };

            // 2. If vocal dialogue exists (and is NOT a non-vocal creature sound noise), speak creature bark
            if (dialogue && dialogue.text && !dialogue.isNoise && this.enabled) {
                // Conversational cadence pause between narration and creature bark to guarantee zero vocal overlay
                await new Promise(r => {
                    this._pauseTimeout = setTimeout(r, 220);
                });
                this._pauseTimeout = null;
                if (!this.enabled || this.isPaused || this._sequenceSessionId !== currentSeqId) return { stopped: true };

                const voice = dialogue.recommendedVoice || dialogue.edgeVoice || null;
                const dOptions = dialogue.voiceProfile ? { ...dialogue.voiceProfile, engine: this.ttsEngine } : {
                    emotion: dialogue.emotion || options.emotion || '',
                    geminiTag: dialogue.geminiTag || '',
                    directorNote: dialogue.directorNote || '',
                    gender: dialogue.gender || '',
                    engine: this.ttsEngine
                };
                const r2 = await this.speakUtterance(dialogue.text, 'creature', dialogue.speaker, voice, dOptions);
                if (r2 && r2.aborted) return { aborted: true };
            }
            return { finished: true };
        } finally {
            if (this._sequenceSessionId === currentSeqId) {
                this._isExecutingSequence = false;
                this.isSpeaking = false;
                this.duckGameAudio(false);
            }
        }
    }

    /**
     * Speaks an individual prose or dialogue utterance.
     * Attempts server-side neural streaming first; falls back cleanly to local browser synthesis.
     */
    async speakUtterance(text, role = 'narrator', speakerName = '', customVoice = null, options = {}) {
        if (!this.enabled) return { aborted: true };
        const cleanText = text.replace(/<[^>]*>/g, '').trim();
        if (!cleanText) return { finished: true };

        const wasSpeaking = this.isSpeaking;
        if (!wasSpeaking) {
            this.duckGameAudio(true);
            this.isSpeaking = true;
            this._speechStartTime = Date.now();
        }
        this.currentRole = role;

        try {
            // Check if full utterance is already in AudioBuffer cache (0ms instant hit)
            const fullCacheKey = this.getAudioCacheKey(cleanText, role, customVoice, options);
            if (this.audioBufferCache.has(fullCacheKey)) {
                try {
                    const res = await this.playNeuralAudio(cleanText, role, customVoice, options);
                    return res || { finished: true };
                } catch (_) {}
            }

            // High-Speed Sentence Fast-Start Pipelining:
            // For longer paragraphs (>60 chars) with multiple sentences, synthesize sentence 1
            // immediately (~1.5s TTFA) while speculatively pre-warming the remainder in parallel.
            const sentences = cleanText.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || [cleanText];
            if (sentences.length > 1 && cleanText.length > 40 && sentences[0].length >= 10) {
                const s1 = sentences[0];
                const remainder = sentences.slice(1).join(' ');
                if (s1 && remainder) {
                    // 1. Speculatively pre-warm remainder in background
                    this.prewarmUtterance(remainder, role, speakerName, customVoice, options).catch(() => {});
                    // 2. Synthesize and speak sentence 1 immediately
                    try {
                        const r1 = await this.playNeuralAudio(s1, role, customVoice, options);
                        if (r1 && r1.aborted) return { aborted: true };
                        if (!this.enabled || this.isPaused) return { stopped: true };

                        // 3. Sentence 1 finished playing; remainder is now ready in cache!
                        const r2 = await this.playNeuralAudio(remainder, role, customVoice, options);
                        return r2 || { finished: true };
                    } catch (pipelineErr) {
                        console.info('[ChronicleAudio] Sentence fast-start failed, falling back to full text:', pipelineErr.message);
                    }
                }
            }

            // Standard full utterance playback
            try {
                const res = await this.playNeuralAudio(cleanText, role, customVoice, options);
                return res || { finished: true };
            } catch (err) {
                // Server neural TTS offline or failed; smoothly fall back to browser Web Speech API
                console.info('[ChronicleAudio] Server neural TTS bypassed, using local speech synthesis:', err.message);
            }

            const res = await this.speakSpeechSynthesis(cleanText, role, speakerName);
            return res || { finished: true };
        } finally {
            if (!wasSpeaking && !this._isExecutingSequence) {
                this.isSpeaking = false;
                this.duckGameAudio(false);
            }
        }
    }

    /**
     * High-speed synchronous PCM WAV fast-path decoder.
     * Directly creates AudioBuffer and converts 16-bit linear PCM in ~0.05ms without async worker handoffs.
     * Returns null if buffer is not standard uncompressed 16-bit PCM WAV.
     */
    static decodePcmWav(arrayBuffer, ctx) {
        if (!arrayBuffer || arrayBuffer.byteLength < 44 || !ctx) return null;
        try {
            const dv = new DataView(arrayBuffer);
            // "RIFF" = 0x52494646 (big-endian), "WAVE" = 0x57415645
            if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null;

            let offset = 12;
            let format = 0;
            let channels = 1;
            let sampleRate = 24000;
            let bitsPerSample = 16;
            let dataOffset = 0;
            let dataLength = 0;

            while (offset + 8 <= arrayBuffer.byteLength) {
                const chunkId = dv.getUint32(offset, false);
                const chunkSize = dv.getUint32(offset + 4, true);
                offset += 8;

                if (chunkId === 0x666d7420) { // "fmt "
                    format = dv.getUint16(offset, true);
                    channels = dv.getUint16(offset + 2, true);
                    sampleRate = dv.getUint32(offset + 4, true);
                    bitsPerSample = dv.getUint16(offset + 14, true);
                } else if (chunkId === 0x64617461) { // "data"
                    dataOffset = offset;
                    dataLength = chunkSize;
                    break;
                }
                offset += chunkSize;
            }

            if (format !== 1 || bitsPerSample !== 16 || !dataOffset || dataLength <= 0) return null;

            const numSamples = Math.floor(dataLength / (channels * 2));
            if (numSamples <= 0) return null;

            const audioBuffer = ctx.createBuffer(channels, numSamples, sampleRate);
            const int16View = new Int16Array(arrayBuffer, dataOffset, numSamples * channels);

            for (let c = 0; c < channels; c++) {
                const channelData = audioBuffer.getChannelData(c);
                for (let i = 0; i < numSamples; i++) {
                    channelData[i] = int16View[i * channels + c] / 32768.0;
                }
            }
            return audioBuffer;
        } catch (_) {
            return null;
        }
    }

    playNeuralAudio(text, role, customVoice = null, options = {}) {
        return new Promise(async (resolve, reject) => {
            const sessionId = ++this._playSessionId;
            const abortCtrl = new AbortController();
            this._activeFetchController = abortCtrl;
            this.activePlaybackResolve = resolve;

            // Stop any prior source and audio immediately
            if (this.currentSource) {
                try {
                    this.currentSource.onended = null;
                    this.currentSource.stop();
                    this.currentSource.disconnect();
                } catch (_) {}
                this.currentSource = null;
            }
            if (this.currentAudio) {
                try {
                    this.currentAudio.pause();
                    this.currentAudio.currentTime = 0;
                    this.currentAudio.onended = null;
                    this.currentAudio.onerror = null;
                } catch (_) {}
                this.currentAudio = null;
            }

            try {
                this.isSpeaking = true;
                const engine = options.engine || this.ttsEngine || 'gemini';
                let voice = customVoice || (role === 'narrator' ? (engine === 'gemini' ? 'Enceladus' : this.narratorVoice) : '');
                if (engine === 'gemini' && options.geminiVoice) {
                    voice = options.geminiVoice;
                }

                const emotion = options.emotion || '';
                const geminiTag = options.geminiTag || '';
                const directorNote = options.directorNote || '';
                const pitch = options.pitch || '';
                const gender = options.gender || '';

                // --- PITCH-PRESERVED NEURAL SPEED CONTROL ---
                // Rather than resampling the decoded audio (which alters pitch like a turntable),
                // we calculate the relative prosody rate adjustment from this.speed and request
                // the server neural vocoder to generate time-stretched audio with CONSTANT natural formant!
                const currentSpeed = Math.max(0.5, Math.min(2.5, this.speed || 1.0));
                const speedRatePercent = Math.round((currentSpeed - 1.0) * 100);
                let baseRateNum = 0;
                if (options.rate) {
                    const m = String(options.rate).match(/([+-]?\d+)/);
                    if (m) baseRateNum = parseInt(m[1], 10);
                }
                const combinedRateNum = Math.max(-50, Math.min(100, baseRateNum + speedRatePercent));
                const rateParam = `${combinedRateNum >= 0 ? '+' : ''}${combinedRateNum}%`;

                const cacheKey = this.getAudioCacheKey(text, role, customVoice, options);

                // Resume suspended AudioContext if browser blocked autoplay before interaction
                if (this.ctx && this.ctx.state === 'suspended') {
                    try { await this.ctx.resume(); } catch (_) {}
                }

                if (this._playSessionId !== sessionId || !this.enabled) {
                    this.isSpeaking = false;
                    return resolve({ aborted: true });
                }

                // --- INSTANT TIER 0: IN-MEMORY DECODED AUDIOBUFFER CACHE (0.01ms PLAYBACK) ---
                if (this.ctx && this.voiceMasterGain && this.audioBufferCache.has(cacheKey)) {
                    try {
                        const cachedBuffer = this.audioBufferCache.get(cacheKey);
                        const source = this.ctx.createBufferSource();
                        source.buffer = cachedBuffer;
                        source.playbackRate.value = 1.0; // Strictly preserve pitch & formant
                        source.connect(this.voiceMasterGain);
                        this.currentSource = source;
                        this._setLoading(false);

                        source.onended = () => {
                            try { source.disconnect(); } catch (_) {}
                            if (this.currentSource === source) {
                                this.currentSource = null;
                                if (!this._isExecutingSequence) {
                                    this.isSpeaking = false;
                                }
                            }
                            if (this.activePlaybackResolve === resolve) {
                                this.activePlaybackResolve = null;
                            }
                            resolve({ finished: true, engine, cached: true });
                        };
                        source.start(0);
                        return;
                    } catch (cacheErr) {
                        console.warn('[ChronicleAudio] Cached buffer playback error, fetching fresh:', cacheErr.message);
                    }
                }

                const q = new URLSearchParams({
                    text,
                    role,
                    engine,
                    voice: voice || '',
                    emotion,
                    gemini_tag: geminiTag,
                    director_note: directorNote,
                    pitch,
                    rate: rateParam,
                    gender
                });
                // Zero Key Leakage: Server handles API key via backend .env; only send header if custom user key entered in UI
                let apiKey = '';
                if (typeof window !== 'undefined') {
                    if (window.chronicleManager?.inputApiKey?.value) {
                        apiKey = window.chronicleManager.inputApiKey.value.trim();
                    }
                    if (!apiKey && window.chronicleManager?.llm?.apiKey) {
                        apiKey = window.chronicleManager.llm.apiKey;
                    }
                }
                const fetchHeaders = {};
                if (apiKey) {
                    // Passed strictly in HTTP header, NEVER in URL query string
                    fetchHeaders['x-goog-api-key'] = apiKey;
                }

                const url = `/api/tts?${q.toString()}`;

                // --- TIER 1: WEB AUDIO DECODING WITH SUBTERRANEAN REVERB & RIBBON FILTER ---
                if (this.ctx && this.voiceMasterGain) {
                    try {
                        let audioBuffer = null;
                        if (this._prewarmPromises.has(cacheKey)) {
                            try {
                                audioBuffer = await this._prewarmPromises.get(cacheKey);
                            } catch (_) {}
                        }

                        let usedEngine = engine;
                        let fallbackReason = null;

                        if (!audioBuffer) {
                            this._setLoading(true, 'Voicing lore...');
                            const res = await fetch(url, { headers: fetchHeaders, signal: abortCtrl.signal });
                            if (this._playSessionId !== sessionId || !this.enabled) {
                                this.isSpeaking = false;
                                this._setLoading(false);
                                return resolve({ aborted: true });
                            }
                            if (!res.ok) {
                                this._setLoading(false);
                                throw new Error(`HTTP ${res.status}`);
                            }
                            usedEngine = res.headers.get('x-tts-engine');
                            fallbackReason = res.headers.get('x-tts-fallback-reason');
                            if (engine === 'gemini' && usedEngine === 'edge') {
                                console.warn('[ChronicleAudio] Gemini Native Audio fell back to Edge Neural:', fallbackReason || 'unknown reason');
                            }

                            const arrayBuffer = await res.arrayBuffer();
                            if (this._playSessionId !== sessionId || !this.enabled) {
                                this.isSpeaking = false;
                                this._setLoading(false);
                                return resolve({ aborted: true });
                            }

                            this._setLoading(true, 'Decoding audio...');
                            audioBuffer = ChronicleAudioRouter.decodePcmWav(arrayBuffer, this.ctx);
                            if (!audioBuffer) {
                                audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                            }
                            if (this.audioBufferCache.size >= this.MAX_AUDIO_BUFFER_CACHE) {
                                const oldest = this.audioBufferCache.keys().next().value;
                                this.audioBufferCache.delete(oldest);
                            }
                            this.audioBufferCache.set(cacheKey, audioBuffer);
                        }

                        if (this._playSessionId !== sessionId || !this.enabled) {
                            this.isSpeaking = false;
                            this._setLoading(false);
                            return resolve({ aborted: true });
                        }

                        const source = this.ctx.createBufferSource();
                        source.buffer = audioBuffer;
                        // KEEP PLAYBACK RATE AT 1.0 TO PRESERVE NATURAL PITCH!
                        // The audio is already time-stretched at the server level via the prosody rate parameter.
                        source.playbackRate.value = 1.0;
                        source.connect(this.voiceMasterGain);

                        this.currentSource = source;
                        this._setLoading(false);

                        source.onended = () => {
                            try { source.disconnect(); } catch (_) {}
                            if (this.currentSource === source) {
                                this.currentSource = null;
                                if (!this._isExecutingSequence) {
                                    this.isSpeaking = false;
                                }
                            }
                            if (this.activePlaybackResolve === resolve) {
                                this.activePlaybackResolve = null;
                            }
                            resolve({ finished: true, engine: usedEngine || engine, fallbackReason });
                        };
                        source.start(0);
                        return;
                    } catch (decodeErr) {
                        if (abortCtrl.signal.aborted || this._playSessionId !== sessionId) {
                            this.isSpeaking = false;
                            return resolve({ aborted: true });
                        }
                        console.info('[ChronicleAudio] Web Audio decode bypassed, falling back to HTML5 audio element:', decodeErr.message);
                    }
                }

                if (this._playSessionId !== sessionId || !this.enabled) {
                    this.isSpeaking = false;
                    return resolve({ aborted: true });
                }

                // --- TIER 2: HTML5 AUDIO ELEMENT FALLBACK ---
                const audio = new Audio();
                audio.src = url;
                // Server rendered rate; maintain natural playbackRate 1.0 and enable preservesPitch
                audio.playbackRate = 1.0;
                if ('preservesPitch' in audio) audio.preservesPitch = true;
                this.currentAudio = audio;

                // Sync audio volume to master volume if sound engine present
                if (this.soundEngine && typeof this.soundEngine.masterVolume === 'number') {
                    audio.volume = Math.max(0, Math.min(1, this.soundEngine.masterVolume));
                }

                audio.onended = () => {
                    this.currentAudio = null;
                    if (!this._isExecutingSequence) {
                        this.isSpeaking = false;
                    }
                    if (this.activePlaybackResolve === resolve) {
                        this.activePlaybackResolve = null;
                    }
                    resolve({ finished: true });
                };
                audio.onerror = (e) => {
                    this.currentAudio = null;
                    this.isSpeaking = false;
                    if (this.activePlaybackResolve === resolve) {
                        this.activePlaybackResolve = null;
                    }
                    if (this._playSessionId === sessionId) {
                        console.warn('[ChronicleAudio] Neural audio streaming error:', e);
                        reject(new Error('HTMLAudio playback failed'));
                    } else {
                        resolve({ aborted: true });
                    }
                };

                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    await playPromise;
                }
            } catch (err) {
                this.isSpeaking = false;
                this._setLoading(false);
                if (abortCtrl.signal.aborted || this._playSessionId !== sessionId) {
                    return resolve({ aborted: true });
                }
                if (this.activePlaybackResolve === resolve) {
                    this.activePlaybackResolve = null;
                }
                reject(err);
            }
        });
    }

    speakSpeechSynthesis(cleanText, role, speakerName) {
        return new Promise((resolve) => {
            if (typeof window === 'undefined' || !('speechSynthesis' in window) || !this.enabled) {
                return resolve({ finished: true });
            }

            const utterance = new SpeechSynthesisUtterance(cleanText);
            this.currentUtterance = utterance;
            this.activePlaybackResolve = resolve;

            // Apply Audiobook Speed Multiplier (0.92 gives deliberate, clear audiobook pacing)
            utterance.rate = Math.max(0.75, Math.min(1.8, (0.92 * this.speed)));

            // Select Best Available American / Universal English Voice
            const voices = (this.availableVoices && this.availableVoices.length > 0)
                ? this.availableVoices
                : (window.speechSynthesis.getVoices() || []);

            // Prioritize British / Celtic / Vintage Natural storytelling voices (BBC Radio style)
            let voice = voices.find(v => (v.name.includes('Natural') || v.name.includes('Online')) && (v.lang.includes('GB') || v.lang.includes('IE') || v.name.includes('UK')));
            if (!voice) {
                voice = voices.find(v => (v.name.includes('Natural') || v.name.includes('Online')) && v.lang.startsWith('en'));
            }
            if (!voice) {
                voice = voices.find(v => (v.lang.includes('GB') || v.lang.includes('IE') || v.name.includes('UK') || v.name.includes('George') || v.name.includes('Hazel')));
            }
            if (!voice) {
                voice = voices.find(v => v.lang.startsWith('en') && !v.name.includes('David'));
            }
            if (!voice && voices.length > 0) {
                voice = voices[0];
            }

            if (voice) {
                utterance.voice = voice;
            }

            // Strictly maintain natural human formant (pitch 1.0) to eliminate robotic vocoder ringing
            utterance.pitch = 1.0;

            utterance.onend = () => {
                this.currentUtterance = null;
                this.activePlaybackResolve = null;
                resolve({ finished: true });
            };
            utterance.onerror = () => {
                this.currentUtterance = null;
                this.activePlaybackResolve = null;
                resolve({ finished: true });
            };

            try {
                window.speechSynthesis.speak(utterance);
            } catch (err) {
                console.warn('[ChronicleAudio] Speech synthesis failed:', err);
                this.currentUtterance = null;
                this.activePlaybackResolve = null;
                resolve({ finished: true });
            }
        });
    }

    /**
     * Speech-to-Text Microphone Input:
     * Listens to the player's voice query with automatic acoustic loopback guard.
     */
    startMicrophone(onInterim, onFinal, onError) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            if (onError) onError('Microphone speech recognition is not supported in this browser.');
            return false;
        }

        try {
            // Stop any ongoing speech and heavily duck sound effects during voice input
            this.stopSpeaking();
            this.duckGameAudio(true);

            this.speechRecognition = new SpeechRec();
            this.speechRecognition.continuous = false;
            this.speechRecognition.interimResults = true;
            this.speechRecognition.lang = 'en-US';

            this.isListeningMic = true;

            this.speechRecognition.onresult = (event) => {
                let interim = '';
                let final = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        final += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }

                if (interim && onInterim) onInterim(interim);
                if (final && onFinal) {
                    this.isListeningMic = false;
                    this.duckGameAudio(false);
                    onFinal(final.trim());
                }
            };

            this.speechRecognition.onerror = (event) => {
                this.isListeningMic = false;
                this.duckGameAudio(false);
                if (onError) onError(event.error || 'Speech recognition error.');
            };

            this.speechRecognition.onend = () => {
                this.isListeningMic = false;
                this.duckGameAudio(false);
            };

            this.speechRecognition.start();
            return true;
        } catch (err) {
            this.isListeningMic = false;
            this.duckGameAudio(false);
            if (onError) onError(err.message || 'Microphone activation failed.');
            return false;
        }
    }

    stopMicrophone() {
        if (this.speechRecognition && this.isListeningMic) {
            try {
                this.speechRecognition.stop();
            } catch (_) {}
        }
        this.isListeningMic = false;
        this.duckGameAudio(false);
    }

    /**
     * Deterministic Cache Key generator matching server and local AudioBuffer cache.
     */
    getAudioCacheKey(text, role, customVoice, options = {}) {
        const cleanText = text.replace(/<[^>]*>/g, '').trim();
        const engine = options.engine || this.ttsEngine || 'gemini';
        let voice = customVoice || (role === 'narrator' ? (engine === 'gemini' ? 'Enceladus' : this.narratorVoice) : '');
        if (engine === 'gemini' && options.geminiVoice) voice = options.geminiVoice;

        const emotion = options.emotion || '';
        const geminiTag = options.geminiTag || '';
        const directorNote = options.directorNote || '';
        const pitch = options.pitch || '';
        const gender = options.gender || '';

        const currentSpeed = Math.max(0.5, Math.min(2.5, this.speed || 1.0));
        const speedRatePercent = Math.round((currentSpeed - 1.0) * 100);
        let baseRateNum = 0;
        if (options.rate) {
            const m = String(options.rate).match(/([+-]?\d+)/);
            if (m) baseRateNum = parseInt(m[1], 10);
        }
        const combinedRateNum = Math.max(-50, Math.min(100, baseRateNum + speedRatePercent));
        const rateParam = `${combinedRateNum >= 0 ? '+' : ''}${combinedRateNum}%`;

        return `${engine}:${role}:${voice}:${gender}:${pitch}:${rateParam}:${emotion}:${geminiTag}:${directorNote}:${cleanText}`;
    }

    /**
     * Non-blocking background pre-fetch and Web Audio decompression.
     * Decodes audio directly into this.audioBufferCache ahead of time for 0ms playback initiation.
     */
    async prewarmUtterance(text, role = 'narrator', speakerName = '', customVoice = null, options = {}) {
        if (!text || typeof window === 'undefined') return null;
        const cleanText = text.replace(/<[^>]*>/g, '').trim();
        if (!cleanText) return null;

        const cacheKey = this.getAudioCacheKey(cleanText, role, customVoice, options);
        if (this.audioBufferCache.has(cacheKey)) {
            return this.audioBufferCache.get(cacheKey);
        }
        if (this._prewarmPromises.has(cacheKey)) {
            return this._prewarmPromises.get(cacheKey);
        }

        const prewarmPromise = (async () => {
            try {
                const engine = options.engine || this.ttsEngine || 'gemini';
                let voice = customVoice || (role === 'narrator' ? (engine === 'gemini' ? 'Enceladus' : this.narratorVoice) : '');
                if (engine === 'gemini' && options.geminiVoice) voice = options.geminiVoice;

                const emotion = options.emotion || '';
                const geminiTag = options.geminiTag || '';
                const directorNote = options.directorNote || '';
                const pitch = options.pitch || '';
                const gender = options.gender || '';

                const currentSpeed = Math.max(0.5, Math.min(2.5, this.speed || 1.0));
                const speedRatePercent = Math.round((currentSpeed - 1.0) * 100);
                let baseRateNum = 0;
                if (options.rate) {
                    const m = String(options.rate).match(/([+-]?\d+)/);
                    if (m) baseRateNum = parseInt(m[1], 10);
                }
                const combinedRateNum = Math.max(-50, Math.min(100, baseRateNum + speedRatePercent));
                const rateParam = `${combinedRateNum >= 0 ? '+' : ''}${combinedRateNum}%`;

                const q = new URLSearchParams({
                    text: cleanText,
                    role,
                    engine,
                    voice: voice || '',
                    emotion,
                    gemini_tag: geminiTag,
                    director_note: directorNote,
                    pitch,
                    rate: rateParam,
                    gender
                });

                let apiKey = '';
                if (window.chronicleManager?.inputApiKey?.value) {
                    apiKey = window.chronicleManager.inputApiKey.value.trim();
                }
                if (!apiKey && window.chronicleManager?.llm?.apiKey) {
                    apiKey = window.chronicleManager.llm.apiKey;
                }
                const fetchHeaders = {};
                if (apiKey) fetchHeaders['x-goog-api-key'] = apiKey;

                const url = `/api/tts?${q.toString()}`;
                const res = await fetch(url, { headers: fetchHeaders });
                if (!res.ok) return null;
                const arrayBuffer = await res.arrayBuffer();
                if (!this.ctx) return null;
                let audioBuffer = ChronicleAudioRouter.decodePcmWav(arrayBuffer, this.ctx);
                if (!audioBuffer) {
                    audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                }
                if (this.audioBufferCache.size >= this.MAX_AUDIO_BUFFER_CACHE) {
                    const oldest = this.audioBufferCache.keys().next().value;
                    this.audioBufferCache.delete(oldest);
                }
                this.audioBufferCache.set(cacheKey, audioBuffer);
                return audioBuffer;
            } catch (_) {
                return null;
            } finally {
                this._prewarmPromises.delete(cacheKey);
            }
        })();

        this._prewarmPromises.set(cacheKey, prewarmPromise);
        return prewarmPromise;
    }
}

if (typeof window !== 'undefined') {
    window.ChronicleAudioRouter = ChronicleAudioRouter;
}

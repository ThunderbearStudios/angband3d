/**
 * ChronicleAudio — Web Audio DSP Mastering, HRTF 3D Panner, TTS & Microphone Input
 * Features audio ducking against footsteps/swords, binaural monster spatialization,
 * speed multiplier controls, and speech-to-text mic input with acoustic loopback guards.
 */

class ChronicleAudioRouter {
    constructor(soundEngine = null) {
        this.soundEngine = soundEngine;
        this.enabled = false; // MUTED BY DEFAULT per strict requirement
        this.voiceVolume = 1.0; // Dedicated Tome / Lore voice volume (0.0 to 1.0)
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
                const savedVoiceVol = parseFloat(localStorage.getItem('angband3d_tome_voice_volume'));
                if (!isNaN(savedVoiceVol) && savedVoiceVol >= 0.0 && savedVoiceVol <= 1.0) {
                    this.voiceVolume = savedVoiceVol;
                }
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
        this.onVocalStateChange = null;

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
        this.currentSourceGain = null;
        this.currentAudio = null;
        this.activePlaybackResolve = null;
        this._pauseTimeout = null;
        this.availableVoices = [];
        this._sequenceSessionId = 0;
        this._isExecutingSequence = false;
        this._transitionSessionId = 0;
        this._pendingTransitionAbort = null;
        this.seamlessHandoff = false;

        // Atomic Single-Playback and Single-Staging Slot Architecture (guarantees ZERO voice overlap)
        this._activePlayToken = 0;
        this._activeVoiceToken = 0;
        this._stagingTokenSeq = 0;
        this._activeStaging = null;
        this.onPlaybackEnded = null;

        // Buffer Pause and Resume State (preserves Web Audio playback without freezing game sound engine context)
        this._activeAudioBuffer = null;
        this._activeBufferEngine = 'gemini';
        this._sourceStartCtxTime = 0;
        this._pauseOffset = 0;

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

    get isStaging() {
        return Boolean(this._activeStaging && !this._activeStaging.aborted);
    }

    init(soundEngine) {
        if (soundEngine) this.soundEngine = soundEngine;
        if (!this.soundEngine || !this.soundEngine.ctx) return;
        this.ctx = this.soundEngine.ctx;

        try {
            // Master Voice Sub-Bus
            this.voiceMasterGain = this.ctx.createGain();
            this.voiceMasterGain.gain.setValueAtTime(this.voiceVolume, this.ctx.currentTime);

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
            // Universal Signal Flow: Route Tome Voice sub-bus directly through SoundEngine.masterGain
            // so master volume and universal mute govern both SFX and voice simultaneously.
            const masterDest = (this.soundEngine && this.soundEngine.masterGain) ? this.soundEngine.masterGain : this.ctx.destination;
            this.voiceHighShelf.connect(masterDest);
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

    setVoiceVolume(volume) {
        this.voiceVolume = Math.max(0.0, Math.min(1.0, parseFloat(volume) || 0.0));
        try { localStorage.setItem('angband3d_tome_voice_volume', this.voiceVolume.toString()); } catch (_) {}
        if (this.voiceMasterGain && this.ctx) {
            this.voiceMasterGain.gain.setValueAtTime(this.voiceVolume, this.ctx.currentTime);
        }
        if (this.voiceVolume > 0 && !this.enabled) {
            this.setMuted(false);
        }
        return this.voiceVolume;
    }

    getVoiceVolume() {
        return this.voiceVolume;
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

    setSeamlessHandoff(enabled) {
        this.seamlessHandoff = Boolean(enabled);
    }

    setVoice(voiceId) {
        if (!voiceId) return;
        this.narratorVoice = voiceId;
        try {
            localStorage.setItem('angband_chronicle_voice', voiceId);
        } catch (_) {}
    }

    /**
     * Dips game sound effects (footsteps, swords, spells) by -7dB (gain 0.42)
     * on the independent SFX sub-bus during active voice narration.
     */
    duckGameAudio(duck = true) {
        if (!this.soundEngine || !this.soundEngine.ctx) return;
        const ctx = this.soundEngine.ctx;
        const sfxBus = this.soundEngine.sfxGain || this.soundEngine.masterCompressor;
        if (!sfxBus) return;

        const baseVol = (typeof this.soundEngine.getSfxVolume === 'function') ? this.soundEngine.getSfxVolume() : 1.0;
        const target = duck ? (baseVol * 0.42) : baseVol;
        this.duckingActive = duck;
        try {
            sfxBus.gain.setTargetAtTime(target, ctx.currentTime, 0.15); // Smooth 150ms ramp
        } catch (_) {}
    }

    _emitVocalState(state, telemetry = {}) {
        if (typeof this.onVocalStateChange === 'function') {
            try {
                this.onVocalStateChange(state, {
                    role: this.currentRole || 'narrator',
                    voice: this.narratorVoice,
                    engine: this.ttsEngine,
                    isSpeaking: this.isSpeaking,
                    isLoading: this.isLoading,
                    isStaging: this.isStaging,
                    ...telemetry
                });
            } catch (_) {}
        }
    }

    _setLoading(loading, details = '') {
        if (this.isLoading === loading) return;
        this.isLoading = loading;
        if (typeof this.onLoadingStateChange === 'function') {
            try {
                this.onLoadingStateChange(loading, details);
            } catch (_) {}
        }
        this._emitVocalState(loading ? 'loading' : (this.isSpeaking ? 'speaking' : 'idle'), { details });
    }

    get isStaging() {
        return !!this._activeStaging && !this._activeStaging.aborted;
    }

    get isBusy() {
        return this.isSpeaking || this.isStaging || this.isProcessingSpeechQueue || (this.speechQueue && this.speechQueue.length > 0) || this.isLoading;
    }

    /**
     * Absolute Single-Voice Physical Silence Primitive:
     * Immediately stops, disconnects, and nullifies any and all active sound sources
     * across Web Audio, HTML5 Audio, and Web Speech API.
     * Guarantees that at any given millisecond, EXACTLY ZERO or ONE voice is physically emitting audio.
     */
    _disconnectPhysicalSources({ preserveResolve = null } = {}) {
        // 1. Web Audio Source
        if (this.currentSource) {
            try {
                this.currentSource.onended = null;
                this.currentSource.stop();
                this.currentSource.disconnect();
            } catch (_) {}
            this.currentSource = null;
        }
        if (this.currentSourceGain) {
            try {
                this.currentSourceGain.disconnect();
            } catch (_) {}
            this.currentSourceGain = null;
        }

        // 2. HTML5 Audio Element
        if (this.currentAudio) {
            try {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
                this.currentAudio.onended = null;
                this.currentAudio.onerror = null;
            } catch (_) {}
            this.currentAudio = null;
        }

        // 3. Web Speech API (speechSynthesis)
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
            } catch (_) {}
        }
        this.currentUtterance = null;

        // 4. Supersede active playback promise if not preserved
        if (this.activePlaybackResolve && this.activePlaybackResolve !== preserveResolve) {
            const res = this.activePlaybackResolve;
            this.activePlaybackResolve = null;
            try { res({ finished: true, interrupted: true, superseded: true }); } catch (_) {}
        }
    }

    /**
     * Logical & Physical Voice Invalidation:
     * Invalidates all in-flight session and playback tokens, aborts active fetches and staging,
     * and physically silences all audio sources.
     */
    _stopAllActiveAudioSources({ preserveResolve = null } = {}) {
        this._activePlayToken = (this._activePlayToken || 0) + 1;
        this._playSessionId = (this._playSessionId || 0) + 1;
        this._transitionSessionId = (this._transitionSessionId || 0) + 1;

        if (this._activeFetchController) {
            try { this._activeFetchController.abort(); } catch (_) {}
            this._activeFetchController = null;
        }

        if (this._activeStaging) {
            this._activeStaging.aborted = true;
            if (this._activeStaging.abortCtrl) {
                try { this._activeStaging.abortCtrl.abort(); } catch (_) {}
            }
            this._activeStaging = null;
        }

        if (this._pauseTimeout) {
            clearTimeout(this._pauseTimeout);
            this._pauseTimeout = null;
        }

        this._disconnectPhysicalSources({ preserveResolve });
    }

    stopSpeaking() {
        this._stopAllActiveAudioSources();
        if (this._pendingTransitionAbort) {
            try { this._pendingTransitionAbort.abort(); } catch (_) {}
            this._pendingTransitionAbort = null;
        }
        this._isExecutingSequence = false;
        this.isSpeaking = false;
        this.isPaused = false;
        this._setLoading(false);

        const queueToDrain = this.speechQueue;
        this.speechQueue = [];
        this.isProcessingSpeechQueue = false;
        for (const item of queueToDrain) {
            if (item && item.resolve) {
                try { item.resolve({ aborted: true, skipped: true }); } catch (_) {}
            }
        }

        if (this.ctx && (!this.soundEngine || this.ctx !== this.soundEngine.ctx) && this.ctx.state === 'suspended') {
            try { this.ctx.resume(); } catch (_) {}
        }

        this._activeAudioBuffer = null;
        this._pauseOffset = 0;
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
        if (this.ctx && this._sourceStartCtxTime) {
            return Math.max(0, this.ctx.currentTime - this._sourceStartCtxTime);
        }
        if (this._speechStartTime) {
            return Math.max(0, (Date.now() - this._speechStartTime) / 1000.0);
        }
        return 0;
    }

    getDuration() {
        if (this.currentAudio && typeof this.currentAudio.duration === 'number') {
            return this.currentAudio.duration;
        }
        if (this._activeAudioBuffer && typeof this._activeAudioBuffer.duration === 'number') {
            return this._activeAudioBuffer.duration;
        }
        return 0;
    }

    pause() {
        this.isPaused = true;
        // Pause Web Audio buffer without suspending the shared game AudioContext
        if (this.currentSource && this.ctx && this._activeAudioBuffer) {
            const elapsed = Math.max(0, this.ctx.currentTime - (this._sourceStartCtxTime || 0));
            this._pauseOffset = Math.min(elapsed, this._activeAudioBuffer.duration || 0);
            try {
                this.currentSource.onended = null;
                this.currentSource.stop();
                this.currentSource.disconnect();
            } catch (_) {}
            this.currentSource = null;
        } else if (this.ctx && (!this.soundEngine || this.ctx !== this.soundEngine.ctx) && this.ctx.state === 'running') {
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
        // Resume Web Audio buffer from recorded pause offset
        if (!this.currentSource && this._activeAudioBuffer && this.ctx && this.activePlaybackResolve) {
            const remaining = (this._activeAudioBuffer.duration || 0) - (this._pauseOffset || 0);
            if (remaining > 0.05) {
                const source = this.ctx.createBufferSource();
                source.buffer = this._activeAudioBuffer;
                source.playbackRate.value = 1.0;
                let localGain = this.currentSourceGain;
                if (!localGain && typeof this.ctx.createGain === 'function') {
                    try {
                        localGain = this.ctx.createGain();
                        localGain.gain.setValueAtTime(1.0, this.ctx.currentTime || 0);
                        localGain.connect(this.voiceMasterGain);
                        this.currentSourceGain = localGain;
                    } catch (_) {}
                }
                if (localGain) source.connect(localGain);
                else source.connect(this.voiceMasterGain);

                this.currentSource = source;
                this._sourceStartCtxTime = this.ctx.currentTime - this._pauseOffset;
                const resolve = this.activePlaybackResolve;
                const engine = this._activeBufferEngine || 'gemini';

                source.onended = () => {
                    try { source.disconnect(); } catch (_) {}
                    if (this.currentSourceGain) {
                        try { this.currentSourceGain.disconnect(); } catch (_) {}
                        this.currentSourceGain = null;
                    }
                    if (this.currentSource === source) {
                        this.currentSource = null;
                        this._activeAudioBuffer = null;
                        if (!this._isExecutingSequence && !this.isStaging) {
                            this.isSpeaking = false;
                            this.duckGameAudio(false);
                            if (typeof this.onPlaybackEnded === 'function') {
                                try { this.onPlaybackEnded(); } catch (_) {}
                            }
                        }
                    }
                    if (this.activePlaybackResolve === resolve) {
                        this.activePlaybackResolve = null;
                    }
                    resolve({ finished: true, engine, cached: true });
                };

                source.start(0, this._pauseOffset);
            } else {
                if (this.activePlaybackResolve) {
                    const r = this.activePlaybackResolve;
                    this.activePlaybackResolve = null;
                    r({ finished: true });
                }
            }
        } else if (this.ctx && (!this.soundEngine || this.ctx !== this.soundEngine.ctx) && this.ctx.state === 'suspended') {
            try { this.ctx.resume(); } catch (_) {}
        }

        if (this.currentAudio && this.currentAudio.paused) {
            try { this.currentAudio.play(); } catch (_) {}
        } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
            try { window.speechSynthesis.resume(); } catch (_) {}
        }
    }

    /**
     * Seamless Just-In-Time Vocal Handoff:
     * When new vocals are ready to interrupt, applies a smooth 80ms gain fade-down
     * on the existing voice and a 50ms natural breath pause (~130ms total natural transition)
     * before disconnecting the prior source. Prevents abrupt jarring audio cuts.
     */
    async _gracefulHandoffCurrentAudio() {
        if (!this.isSpeaking && !this.currentSource && !this.currentAudio && !(typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking)) return;

        this._emitVocalState('interrupted', { role: this.currentRole, reason: 'handoff' });

        // Invalidate active playback and fetch tokens immediately so multi-sentence continuations, creature barks, and in-flight fetches CANNOT fire
        this._activeVoiceToken = (this._activeVoiceToken || 0) + 1;
        this._sequenceSessionId = (this._sequenceSessionId || 0) + 1;
        this._playSessionId = (this._playSessionId || 0) + 1;
        this._activePlayToken = (this._activePlayToken || 0) + 1;

        if (this._activeFetchController) {
            try { this._activeFetchController.abort(); } catch (_) {}
            this._activeFetchController = null;
        }

        // 1. Web Audio Source: smooth 80ms fade down
        if (this.currentSourceGain && this.ctx && this.currentSource) {
            try {
                const fadeDuration = 0.08;
                const now = this.ctx.currentTime || 0;
                if (this.currentSourceGain.gain && typeof this.currentSourceGain.gain.setValueAtTime === 'function') {
                    this.currentSourceGain.gain.setValueAtTime(this.currentSourceGain.gain.value, now);
                    this.currentSourceGain.gain.linearRampToValueAtTime(0.001, now + fadeDuration);
                }
                await new Promise(r => setTimeout(r, (fadeDuration * 1000) + 40));
            } catch (_) {}
        }

        // 2. HTML5 Audio Element: smooth fade down
        if (this.currentAudio && !this.currentAudio.paused) {
            try {
                const startVol = this.currentAudio.volume || 1.0;
                for (let i = 4; i >= 0; i--) {
                    await new Promise(r => setTimeout(r, 15));
                    try { this.currentAudio.volume = startVol * (i / 5); } catch (_) {}
                }
                await new Promise(r => setTimeout(r, 40));
            } catch (_) {}
        }

        // 3. Web Speech API (speechSynthesis): cancel
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
            try {
                await new Promise(r => setTimeout(r, 60));
                window.speechSynthesis.cancel();
            } catch (_) {}
        }

        // Disconnect all physical sources and supersede prior resolve
        this._disconnectPhysicalSources();

        // Guaranteed silence breath gap (40ms) to ensure absolute physical separation between voices
        await new Promise(r => setTimeout(r, 40));
    }

    /**
     * Retrieves an AudioBuffer from cache or fetches/decodes it from /api/tts in background.
     * Guaranteed zero-alloc on cache hits and safe abort support.
     */
    async fetchOrGetAudioBuffer(text, role = 'narrator', customVoice = null, options = {}, signal = null) {
        const engine = options.engine || this.ttsEngine || 'gemini';
        let voice = customVoice || (role === 'narrator' ? (engine === 'gemini' ? 'Enceladus' : this.narratorVoice) : '');
        if (engine === 'gemini' && options.geminiVoice) {
            voice = options.geminiVoice;
        }
        const cacheKey = this.getAudioCacheKey(text, role, customVoice, options);

        // 1. Direct in-memory hit
        if (this.audioBufferCache.has(cacheKey)) {
            return { audioBuffer: this.audioBufferCache.get(cacheKey), engine, cached: true };
        }

        // 2. Prewarm promise in flight
        if (this._prewarmPromises.has(cacheKey)) {
            try {
                const prewarmed = await this._prewarmPromises.get(cacheKey);
                if (prewarmed) return { audioBuffer: prewarmed, engine, cached: true };
            } catch (_) {}
        }

        // 3. Network fetch & decode
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
        if (apiKey) fetchHeaders['x-goog-api-key'] = apiKey;

        const url = `/api/tts?${q.toString()}`;
        const res = await fetch(url, { headers: fetchHeaders, signal: signal || undefined });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const usedEngine = res.headers.get('x-tts-engine') || engine;
        const fallbackReason = res.headers.get('x-tts-fallback-reason');
        const arrayBuffer = await res.arrayBuffer();

        let audioBuffer = ChronicleAudioRouter.decodePcmWav(arrayBuffer, this.ctx);
        if (!audioBuffer && this.ctx) {
            audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        }

        if (audioBuffer) {
            if (this.audioBufferCache.size >= this.MAX_AUDIO_BUFFER_CACHE) {
                const oldest = this.audioBufferCache.keys().next().value;
                this.audioBufferCache.delete(oldest);
            }
            this.audioBufferCache.set(cacheKey, audioBuffer);
        }

        return { audioBuffer, engine: usedEngine, fallbackReason, cached: false };
    }

    /**
     * Plays an already-decoded AudioBuffer immediately through a dedicated gain sub-bus.
     */
    playPreparedBuffer(audioBuffer, engine = 'gemini', options = {}) {
        return new Promise((resolve) => {
            if (!this.ctx || !this.voiceMasterGain || !audioBuffer || !this.enabled) {
                return resolve({ aborted: true });
            }
            // Absolute physical mutual exclusion: stop all active sources across all tiers before starting
            this._disconnectPhysicalSources({ preserveResolve: resolve });
            this.activePlaybackResolve = resolve;

            this.duckGameAudio(true);
            this.isSpeaking = true;
            this._speechStartTime = Date.now();
            this.currentRole = options.role || (options.narrator ? 'narrator' : 'combat');
            this._emitVocalState('speaking', { role: this.currentRole, engine });

            const source = this.ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = 1.0;

            let localGain = null;
            if (typeof this.ctx.createGain === 'function') {
                try {
                    localGain = this.ctx.createGain();
                    if (localGain.gain && typeof localGain.gain.setValueAtTime === 'function') {
                        localGain.gain.setValueAtTime(1.0, this.ctx.currentTime || 0);
                    }
                    source.connect(localGain);
                    localGain.connect(this.voiceMasterGain);
                } catch (_) {
                    source.connect(this.voiceMasterGain);
                    localGain = null;
                }
            } else {
                source.connect(this.voiceMasterGain);
            }

            this.currentSource = source;
            this.currentSourceGain = localGain;
            this.activePlaybackResolve = resolve;
            this._activeAudioBuffer = audioBuffer;
            this._activeBufferEngine = engine;
            this._activeBufferOptions = options;
            this._sourceStartCtxTime = (this.ctx && this.ctx.currentTime) ? this.ctx.currentTime : 0;
            this._pauseOffset = 0;

            source.onended = () => {
                try { source.disconnect(); } catch (_) {}
                try { localGain.disconnect(); } catch (_) {}
                if (this.currentSourceGain === localGain) this.currentSourceGain = null;
                if (this.currentSource === source) {
                    this.currentSource = null;
                    this._activeAudioBuffer = null;
                    if (!this._isExecutingSequence && !this.isStaging && this.speechQueue.length === 0) {
                        this.isSpeaking = false;
                        this.duckGameAudio(false);
                        this._emitVocalState('idle');
                        if (typeof this.onPlaybackEnded === 'function') {
                            try { this.onPlaybackEnded(); } catch (_) {}
                        }
                    }
                }
                if (this.activePlaybackResolve === resolve) {
                    this.activePlaybackResolve = null;
                }
                resolve({ finished: true, engine, cached: true });
            };

            source.start(0);
        });
    }

    /**
     * Executes speech with seamless background buffering:
     * Keeps current narration playing while fetching/decoding the next vocals.
     * When ready, smoothly fades down the old audio, pauses 50ms, and cuts over seamlessly.
     */
    async _executeSeamlessSpeak(text, dialogue = null, options = {}) {
        const transitionId = ++this._transitionSessionId;
        const stagingToken = ++this._stagingTokenSeq;
        if (this._activeStaging) {
            this._activeStaging.aborted = true;
            if (this._activeStaging.abortCtrl) {
                try { this._activeStaging.abortCtrl.abort(); } catch (_) {}
            }
        }
        const abortCtrl = new AbortController();
        const staging = {
            token: stagingToken,
            transitionId,
            abortCtrl,
            aborted: false
        };
        this._activeStaging = staging;

        const cleanText = text.replace(/<[^>]*>/g, '').trim();
        if (!cleanText) {
            if (this._activeStaging === staging) this._activeStaging = null;
            return { finished: true };
        }

        // Pre-warm creature bark in parallel if dialogue exists
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

        // Buffer the first sentence or full utterance while old audio keeps playing!
        const sentences = cleanText.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || [cleanText];
        const isMultiSentence = (sentences.length > 1 && cleanText.length > 40 && sentences[0].length >= 10);
        const s1 = isMultiSentence ? sentences[0] : cleanText;
        const remainder = isMultiSentence ? sentences.slice(1).join(' ') : null;

        if (remainder) {
            this.prewarmUtterance(remainder, 'narrator', '', null, options).catch(() => {});
        }

        let prep = null;
        try {
            this._setLoading(true, 'Staging voice in background...');
            this._emitVocalState('loading', { details: 'Staging next beat...', text: cleanText, role: options.role || 'narrator' });
            prep = await this.fetchOrGetAudioBuffer(s1, 'narrator', null, options, abortCtrl.signal);
        } catch (fetchErr) {
            if (staging.aborted || abortCtrl.signal.aborted || this._activeStaging !== staging) {
                this._setLoading(false);
                return { aborted: true };
            }
            console.info('[ChronicleAudio] Seamless buffer fetch bypassed, falling back to local speech:', fetchErr.message);
        } finally {
            this._setLoading(false);
        }

        if (staging.aborted || this._activeStaging !== staging || !this.enabled) {
            return { aborted: true };
        }

        // Now that the new vocals are ready in RAM, perform the gentle handoff:
        // Smooth 80ms fade down + 50ms natural breath pause
        if (this.isSpeaking || this.currentSource || this.currentAudio || (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking)) {
            await this._gracefulHandoffCurrentAudio();
        } else {
            await new Promise(r => setTimeout(r, 40));
        }

        if (staging.aborted || this._activeStaging !== staging || !this.enabled) {
            return { aborted: true };
        }

        // Promote staging to active playback
        this._activeStaging = null;
        this._isExecutingSequence = true;
        this._sequenceSessionId = (this._sequenceSessionId || 0) + 1;
        const currentSeqId = this._sequenceSessionId;
        const currentVoiceToken = ++this._activeVoiceToken;
        this.duckGameAudio(true);
        this.isSpeaking = true;
        this._speechStartTime = Date.now();
        this.currentRole = options.role || (options.narrator ? 'narrator' : 'combat');

        try {
            let r1 = null;
            if (prep && prep.audioBuffer) {
                r1 = await this.playPreparedBuffer(prep.audioBuffer, prep.engine, options);
                if (r1 && (r1.aborted || r1.interrupted || r1.superseded)) return { aborted: true };
                if (!this.enabled || this.isPaused || this._sequenceSessionId !== currentSeqId || this._activeVoiceToken !== currentVoiceToken) return { stopped: true };

                // If multi-sentence paragraph, play cached remainder
                if (remainder) {
                    const r2 = await this.playNeuralAudio(remainder, 'narrator', null, options);
                    if (r2 && (r2.aborted || r2.interrupted || r2.superseded)) return { aborted: true };
                    if (!this.enabled || this.isPaused || this._sequenceSessionId !== currentSeqId || this._activeVoiceToken !== currentVoiceToken) return { stopped: true };
                }
            } else {
                r1 = await this.speakSpeechSynthesis(cleanText, 'narrator', '');
            }

            if (r1 && (r1.aborted || r1.interrupted || r1.superseded)) return { aborted: true };
            if (!this.enabled || this.isPaused || this._sequenceSessionId !== currentSeqId || this._activeVoiceToken !== currentVoiceToken) return { stopped: true };

            // Speak creature bark if present
            if (dialogue && dialogue.text && !dialogue.isNoise && this.enabled) {
                await new Promise(r => {
                    this._pauseTimeout = setTimeout(r, 220);
                });
                this._pauseTimeout = null;
                if (!this.enabled || this.isPaused || this._sequenceSessionId !== currentSeqId || this._activeVoiceToken !== currentVoiceToken) return { stopped: true };

                const voice = dialogue.recommendedVoice || dialogue.edgeVoice || null;
                const dOptions = dialogue.voiceProfile ? { ...dialogue.voiceProfile, engine: this.ttsEngine } : {
                    emotion: dialogue.emotion || options.emotion || '',
                    geminiTag: dialogue.geminiTag || '',
                    directorNote: dialogue.directorNote || '',
                    gender: dialogue.gender || '',
                    engine: this.ttsEngine
                };
                const rBark = await this.speakUtterance(dialogue.text, 'creature', dialogue.speaker, voice, dOptions);
                if (rBark && (rBark.aborted || rBark.interrupted)) return { aborted: true };
            }
            return { finished: true };
        } finally {
            if (this._sequenceSessionId === currentSeqId && this._activeVoiceToken === currentVoiceToken) {
                this._isExecutingSequence = false;
                if (!this.isStaging && this.speechQueue.length === 0) {
                    this.isSpeaking = false;
                    this.duckGameAudio(false);
                    if (typeof this.onPlaybackEnded === 'function') {
                        try { this.onPlaybackEnded(); } catch (_) {}
                    }
                }
            }
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

        // Ergonomic argument normalization: allow speak(text, dialogue, options) or speak(text, options)
        if (monsterCoords && typeof monsterCoords === 'object' && !('x' in monsterCoords) && !('y' in monsterCoords) && !Array.isArray(monsterCoords)) {
            options = Object.assign({}, monsterCoords, options);
            monsterCoords = null;
        } else if (dialogue && typeof dialogue === 'object' && !('text' in dialogue) && !('speaker' in dialogue)) {
            options = Object.assign({}, dialogue, options);
            dialogue = null;
        }

        const isSeamless = (options.seamless === true) || (this.seamlessHandoff && options.seamless !== false && (this.isSpeaking || this.isStaging));

        if (!isSeamless) {
            // Zero-lag real-time preemption (Death or hard interrupt):
            // Always halt prior speech immediately and clear backlog so new game actions speak without latency
            this.stopSpeaking();
            this.isSpeaking = true;
            return new Promise((resolve) => {
                this.speechQueue.push({ text, dialogue, monsterCoords, playerCoords, cameraYaw, options, resolve, seamless: false });
                if (!this.isProcessingSpeechQueue) {
                    this.processSpeechQueue();
                }
            });
        }

        // SEAMLESS CONCURRENT JIT VOCAL PIPELINE:
        // When active vocals are currently speaking or staging:
        // Do NOT block in a queue waiting for playback to finish!
        // Immediately start background pre-fetching and decoding of the next utterance right now.
        // Existing vocals continue playing uninterrupted until the new AudioBuffer is ready in RAM.
        // Only once ready in RAM does it execute an 80ms micro-fade + 50ms breath pause and cut over seamlessly.
        if (this.isSpeaking || this.isStaging) {
            if (this.speechQueue.length > 0) {
                const stale = this.speechQueue.splice(0, this.speechQueue.length);
                for (const item of stale) {
                    if (item && item.resolve) {
                        try { item.resolve({ skipped: true, superseded: true }); } catch (_) {}
                    }
                }
            }
            return this._executeSeamlessSpeak(text, dialogue, options);
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

        this.isSpeaking = true;
        return new Promise((resolve) => {
            this.speechQueue.push({ text, dialogue, monsterCoords, playerCoords, cameraYaw, options, resolve, seamless: true });
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
                    if (item.seamless && (this.isSpeaking || this.isStaging)) {
                        result = await this._executeSeamlessSpeak(item.text, item.dialogue, item.options || {});
                    } else {
                        result = await this._executeSpeak(item.text, item.dialogue, item.options || {});
                    }
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
            if (!this._isExecutingSequence && !this.isStaging && !this.currentSource && !this.currentAudio && !(typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking)) {
                this.isSpeaking = false;
                this.duckGameAudio(false);
                if (typeof this.onPlaybackEnded === 'function') {
                    try { this.onPlaybackEnded(); } catch (_) {}
                }
            }
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
        const currentVoiceToken = ++this._activeVoiceToken;

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
            if (r1 && (r1.aborted || r1.interrupted || r1.superseded)) return { aborted: true, interrupted: true };
            if (!this.enabled || this.isPaused || this._sequenceSessionId !== currentSeqId || this._activeVoiceToken !== currentVoiceToken) return { stopped: true };

            // 2. If vocal dialogue exists (and is NOT a non-vocal creature sound noise), speak creature bark
            if (dialogue && dialogue.text && !dialogue.isNoise && this.enabled) {
                // Conversational cadence pause between narration and creature bark to guarantee zero vocal overlay
                await new Promise(r => {
                    this._pauseTimeout = setTimeout(r, 220);
                });
                this._pauseTimeout = null;
                if (!this.enabled || this.isPaused || this._sequenceSessionId !== currentSeqId || this._activeVoiceToken !== currentVoiceToken) return { stopped: true };

                const voice = dialogue.recommendedVoice || dialogue.edgeVoice || null;
                const dOptions = dialogue.voiceProfile ? { ...dialogue.voiceProfile, engine: this.ttsEngine } : {
                    emotion: dialogue.emotion || options.emotion || '',
                    geminiTag: dialogue.geminiTag || '',
                    directorNote: dialogue.directorNote || '',
                    gender: dialogue.gender || '',
                    engine: this.ttsEngine
                };
                const r2 = await this.speakUtterance(dialogue.text, 'creature', dialogue.speaker, voice, dOptions);
                if (r2 && (r2.aborted || r2.interrupted || r2.superseded)) return { aborted: true, interrupted: true };
            }
            return { finished: true };
        } finally {
            if (this._sequenceSessionId === currentSeqId && this._activeVoiceToken === currentVoiceToken) {
                this._isExecutingSequence = false;
                if (!this.isStaging && this.speechQueue.length === 0) {
                    this.isSpeaking = false;
                    this.duckGameAudio(false);
                    if (typeof this.onPlaybackEnded === 'function') {
                        try { this.onPlaybackEnded(); } catch (_) {}
                    }
                }
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
                    const voiceToken = this._activeVoiceToken;
                    try {
                        const r1 = await this.playNeuralAudio(s1, role, customVoice, options);
                        if (r1 && (r1.aborted || r1.interrupted || r1.superseded)) return { aborted: true, interrupted: true };
                        if (!this.enabled || this.isPaused || this._activeVoiceToken !== voiceToken) return { stopped: true };

                        // 3. Sentence 1 finished playing; remainder is now ready in cache!
                        const r2 = await this.playNeuralAudio(remainder, role, customVoice, options);
                        if (r2 && (r2.aborted || r2.interrupted || r2.superseded)) return { aborted: true, interrupted: true };
                        return r2 || { finished: true };
                    } catch (pipelineErr) {
                        if (pipelineErr.name === 'AbortError' || this._activeVoiceToken !== voiceToken || !this.enabled) {
                            return { aborted: true };
                        }
                        console.info('[ChronicleAudio] Sentence fast-start failed, falling back to full text:', pipelineErr.message);
                    }
                }
            }

            // Standard full utterance playback
            const voiceToken = this._activeVoiceToken;
            try {
                const res = await this.playNeuralAudio(cleanText, role, customVoice, options);
                if (res && (res.aborted || res.interrupted || res.superseded)) return { aborted: true, interrupted: true };
                return res || { finished: true };
            } catch (err) {
                if (err.name === 'AbortError' || this._activeVoiceToken !== voiceToken || !this.enabled) {
                    return { aborted: true };
                }
                // Server neural TTS offline or failed; smoothly fall back to browser Web Speech API
                console.info('[ChronicleAudio] Server neural TTS bypassed, using local speech synthesis:', err.message);
            }

            if (!this.enabled || this.isPaused || this._activeVoiceToken !== voiceToken) return { stopped: true };
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
            // First stop any prior in-flight fetch and invalidate prior sessions
            this._stopAllActiveAudioSources({ preserveResolve: resolve });
            const sessionId = this._playSessionId;
            const playToken = this._activePlayToken;
            const abortCtrl = new AbortController();
            this._activeFetchController = abortCtrl;
            this.activePlaybackResolve = resolve;

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

                if (this._playSessionId !== sessionId || this._activePlayToken !== playToken || !this.enabled) {
                    this.isSpeaking = false;
                    return resolve({ aborted: true, superseded: true });
                }

                // --- INSTANT TIER 0: IN-MEMORY DECODED AUDIOBUFFER CACHE (0.01ms PLAYBACK) ---
                if (this.ctx && this.voiceMasterGain && this.audioBufferCache.has(cacheKey)) {
                    try {
                        const cachedBuffer = this.audioBufferCache.get(cacheKey);
                        this._disconnectPhysicalSources({ preserveResolve: resolve });
                        this.activePlaybackResolve = resolve;

                        const source = this.ctx.createBufferSource();
                        source.buffer = cachedBuffer;
                        let localGain = null;
                        if (typeof this.ctx.createGain === 'function') {
                            try {
                                localGain = this.ctx.createGain();
                                if (localGain.gain && typeof localGain.gain.setValueAtTime === 'function') {
                                    localGain.gain.setValueAtTime(1.0, this.ctx.currentTime || 0);
                                }
                                source.connect(localGain);
                                localGain.connect(this.voiceMasterGain);
                            } catch (_) {
                                source.connect(this.voiceMasterGain);
                                localGain = null;
                            }
                        } else {
                            source.connect(this.voiceMasterGain);
                        }
                        this.currentSource = source;
                        this.currentSourceGain = localGain;
                        this._activeAudioBuffer = cachedBuffer;
                        this._activeBufferEngine = engine;
                        this._activeBufferOptions = options;
                        this._sourceStartCtxTime = (this.ctx && this.ctx.currentTime) ? this.ctx.currentTime : 0;
                        this._pauseOffset = 0;
                        this._setLoading(false);
                        this._emitVocalState('speaking', { role: this.currentRole, engine, cached: true });

                        source.onended = () => {
                            try { source.disconnect(); } catch (_) {}
                            if (localGain) {
                                try { localGain.disconnect(); } catch (_) {}
                                if (this.currentSourceGain === localGain) this.currentSourceGain = null;
                            }
                            if (this.currentSource === source) {
                                this.currentSource = null;
                                this._activeAudioBuffer = null;
                                if (!this._isExecutingSequence && !this.isStaging && this.speechQueue.length === 0) {
                                    this.isSpeaking = false;
                                    this.duckGameAudio(false);
                                    this._emitVocalState('idle');
                                    if (typeof this.onPlaybackEnded === 'function') {
                                        try { this.onPlaybackEnded(); } catch (_) {}
                                    }
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
                            if (this._playSessionId !== sessionId || this._activePlayToken !== playToken || !this.enabled) {
                                this.isSpeaking = false;
                                this._setLoading(false);
                                return resolve({ aborted: true, superseded: true });
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
                            if (this._playSessionId !== sessionId || this._activePlayToken !== playToken || !this.enabled) {
                                this.isSpeaking = false;
                                this._setLoading(false);
                                return resolve({ aborted: true, superseded: true });
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

                        if (this._playSessionId !== sessionId || this._activePlayToken !== playToken || !this.enabled) {
                            this.isSpeaking = false;
                            this._setLoading(false);
                            return resolve({ aborted: true, superseded: true });
                        }

                        // Absolute physical mutual exclusion right before starting node
                        this._disconnectPhysicalSources({ preserveResolve: resolve });
                        this.activePlaybackResolve = resolve;

                        const source = this.ctx.createBufferSource();
                        source.buffer = audioBuffer;
                        // KEEP PLAYBACK RATE AT 1.0 TO PRESERVE NATURAL PITCH!
                        let localGain = null;
                        if (typeof this.ctx.createGain === 'function') {
                            try {
                                localGain = this.ctx.createGain();
                                if (localGain.gain && typeof localGain.gain.setValueAtTime === 'function') {
                                    localGain.gain.setValueAtTime(1.0, this.ctx.currentTime || 0);
                                }
                                source.connect(localGain);
                                localGain.connect(this.voiceMasterGain);
                            } catch (_) {
                                source.connect(this.voiceMasterGain);
                                localGain = null;
                            }
                        } else {
                            source.connect(this.voiceMasterGain);
                        }

                        this.currentSource = source;
                        this.currentSourceGain = localGain;
                        this._activeAudioBuffer = audioBuffer;
                        this._activeBufferEngine = usedEngine || engine;
                        this._activeBufferOptions = options;
                        this._sourceStartCtxTime = (this.ctx && this.ctx.currentTime) ? this.ctx.currentTime : 0;
                        this._pauseOffset = 0;
                        this._setLoading(false);
                        this._emitVocalState('speaking', { role: this.currentRole, engine: usedEngine || engine, cached: false });

                        source.onended = () => {
                            try { source.disconnect(); } catch (_) {}
                            if (localGain) {
                                try { localGain.disconnect(); } catch (_) {}
                                if (this.currentSourceGain === localGain) this.currentSourceGain = null;
                            }
                            if (this.currentSource === source) {
                                this.currentSource = null;
                                this._activeAudioBuffer = null;
                                if (!this._isExecutingSequence && !this.isStaging && this.speechQueue.length === 0) {
                                    this.isSpeaking = false;
                                    this.duckGameAudio(false);
                                    this._emitVocalState('idle');
                                    if (typeof this.onPlaybackEnded === 'function') {
                                        try { this.onPlaybackEnded(); } catch (_) {}
                                    }
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
                        if (abortCtrl.signal.aborted || this._playSessionId !== sessionId || this._activePlayToken !== playToken) {
                            this.isSpeaking = false;
                            return resolve({ aborted: true, superseded: true });
                        }
                        console.info('[ChronicleAudio] Web Audio decode bypassed, falling back to HTML5 audio element:', decodeErr.message);
                    }
                }

                if (this._playSessionId !== sessionId || this._activePlayToken !== playToken || !this.enabled) {
                    this.isSpeaking = false;
                    return resolve({ aborted: true, superseded: true });
                }

                // --- TIER 2: HTML5 AUDIO ELEMENT FALLBACK ---
                this._disconnectPhysicalSources({ preserveResolve: resolve });
                this.activePlaybackResolve = resolve;

                const audio = new Audio();
                audio.src = url;
                audio.playbackRate = 1.0;
                if ('preservesPitch' in audio) audio.preservesPitch = true;
                this.currentAudio = audio;

                // Sync audio volume to master volume if sound engine present
                if (this.soundEngine && typeof this.soundEngine.masterVolume === 'number') {
                    audio.volume = Math.max(0, Math.min(1, this.soundEngine.masterVolume));
                }

                audio.onended = () => {
                    this.currentAudio = null;
                    if (!this._isExecutingSequence && !this.isStaging && this.speechQueue.length === 0) {
                        this.isSpeaking = false;
                        this.duckGameAudio(false);
                        this._emitVocalState('idle');
                        if (typeof this.onPlaybackEnded === 'function') {
                            try { this.onPlaybackEnded(); } catch (_) {}
                        }
                    }
                    if (this.activePlaybackResolve === resolve) {
                        this.activePlaybackResolve = null;
                    }
                    resolve({ finished: true });
                };
                audio.onerror = (e) => {
                    this.currentAudio = null;
                    this.isSpeaking = false;
                    this._emitVocalState('idle');
                    if (this.activePlaybackResolve === resolve) {
                        this.activePlaybackResolve = null;
                    }
                    if (this._playSessionId === sessionId && this._activePlayToken === playToken) {
                        console.warn('[ChronicleAudio] Neural audio streaming error:', e);
                        reject(new Error('HTMLAudio playback failed'));
                    } else {
                        resolve({ aborted: true, superseded: true });
                    }
                };

                this._emitVocalState('speaking', { role: this.currentRole, engine: 'html5' });
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    await playPromise;
                }
            } catch (err) {
                this.isSpeaking = false;
                this._setLoading(false);
                if (abortCtrl.signal.aborted || this._playSessionId !== sessionId || this._activePlayToken !== playToken) {
                    return resolve({ aborted: true, superseded: true });
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

            // Absolute physical mutual exclusion right before speech synthesis
            this._disconnectPhysicalSources({ preserveResolve: resolve });
            this.activePlaybackResolve = resolve;

            const utterance = new SpeechSynthesisUtterance(cleanText);
            this.currentUtterance = utterance;

            // Apply Audiobook Speed Multiplier (0.92 gives deliberate, clear audiobook pacing)
            utterance.rate = Math.max(0.75, Math.min(1.8, (0.92 * this.speed)));
            const masterVol = (this.soundEngine && typeof this.soundEngine.getMasterVolume === 'function') ? this.soundEngine.getMasterVolume() : 1.0;
            const isSoundMuted = (this.soundEngine && typeof this.soundEngine.isMuted === 'function') ? this.soundEngine.isMuted() : false;
            utterance.volume = (!this.enabled || isSoundMuted) ? 0.0 : Math.max(0.0, Math.min(1.0, this.voiceVolume * masterVol));

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
                if (!this._isExecutingSequence && !this.isStaging && this.speechQueue.length === 0) {
                    this.isSpeaking = false;
                    this.duckGameAudio(false);
                    this._emitVocalState('idle');
                    if (typeof this.onPlaybackEnded === 'function') {
                        try { this.onPlaybackEnded(); } catch (_) {}
                    }
                }
                resolve({ finished: true });
            };
            utterance.onerror = () => {
                this.currentUtterance = null;
                this.activePlaybackResolve = null;
                if (!this._isExecutingSequence && !this.isStaging && this.speechQueue.length === 0) {
                    this.isSpeaking = false;
                    this.duckGameAudio(false);
                    this._emitVocalState('idle');
                }
                resolve({ finished: true });
            };

            try {
                this._emitVocalState('speaking', { role: this.currentRole || 'narrator', engine: 'speechSynthesis' });
                window.speechSynthesis.speak(utterance);
            } catch (err) {
                console.warn('[ChronicleAudio] Speech synthesis failed:', err);
                this.currentUtterance = null;
                this.activePlaybackResolve = null;
                this._emitVocalState('idle');
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

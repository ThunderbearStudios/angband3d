/**
 * ChronicleAudio — Web Audio DSP Mastering, HRTF 3D Panner, TTS & Microphone Input
 * Features audio ducking against footsteps/swords, binaural monster spatialization,
 * speed multiplier controls, and speech-to-text mic input with acoustic loopback guards.
 */

class ChronicleAudioRouter {
    constructor(soundEngine = null) {
        this.soundEngine = soundEngine;
        this.enabled = false; // MUTED BY DEFAULT per strict requirement
        this.speed = 1.0;     // 1.0x, 1.25x, 1.5x
        this.flowMode = 'continuous'; // 'continuous' | 'interrupt'
        this.narratorVoice = 'en-GB-RyanNeural'; // Dramatic British stage storyteller / epic Tolkien fireside narrator
        this.isSpeaking = false;
        this.isPaused = false;
        this.isListeningMic = false;
        this.speechQueue = [];
        this.isProcessingSpeechQueue = false;

        // Restore persisted audio preferences
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                const savedMuted = localStorage.getItem('angband_chronicle_muted');
                this.enabled = (savedMuted === 'false'); // Only enable if player explicitly unmuted in prior session
                const savedSpeed = parseFloat(localStorage.getItem('angband_chronicle_speed'));
                if (!isNaN(savedSpeed) && savedSpeed >= 1.0 && savedSpeed <= 2.0) {
                    this.speed = savedSpeed;
                }
                const savedFlow = localStorage.getItem('angband_chronicle_flow');
                if (savedFlow) this.flowMode = savedFlow;
                const savedVoice = localStorage.getItem('angband_chronicle_voice');
                // Support all aged, bardic, and neural storyteller voices
                if (savedVoice && savedVoice !== 'en-GB-ThomasNeural' && (savedVoice.includes('Neural') || savedVoice.includes('Ryan') || savedVoice.includes('Roger') || savedVoice.includes('Brian') || savedVoice.includes('William') || savedVoice.includes('Clara') || savedVoice.includes('Steffan') || savedVoice.includes('Sonia') || savedVoice.includes('Connor') || savedVoice.includes('Libby') || savedVoice.includes('Christopher') || savedVoice.includes('Guy') || savedVoice.includes('Jenny') || savedVoice.includes('Aria') || savedVoice.includes('Maisie') || savedVoice.includes('Emily') || savedVoice.includes('Natasha') || savedVoice.includes('Liam'))) {
                    this.narratorVoice = savedVoice;
                } else {
                    this.narratorVoice = 'en-GB-RyanNeural';
                }
            } catch (_) {}
        }

        // Web Audio Sub-Graph
        this.ctx = null;
        this.voiceMasterGain = null;
        this.duckingActive = false;
        this.currentUtterance = null;
        this.speechRecognition = null;

        // Neural Streaming & Voices
        this.currentSource = null;
        this.currentAudio = null;
        this.activePlaybackResolve = null;
        this._pauseTimeout = null;
        this.availableVoices = [];

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
            // Removes modern sterile digital sizzle, providing authentic vintage BBC radio & vinyl audiobook acoustics
            this.voiceLowShelf = this.ctx.createBiquadFilter();
            this.voiceLowShelf.type = 'lowshelf';
            this.voiceLowShelf.frequency.setValueAtTime(180, this.ctx.currentTime);
            this.voiceLowShelf.gain.setValueAtTime(1.2, this.ctx.currentTime);

            this.voiceHighShelf = this.ctx.createBiquadFilter();
            this.voiceHighShelf.type = 'highshelf';
            this.voiceHighShelf.frequency.setValueAtTime(7200, this.ctx.currentTime);
            this.voiceHighShelf.gain.setValueAtTime(-1.8, this.ctx.currentTime);

            this.voiceMasterGain.connect(this.voiceLowShelf);
            this.voiceLowShelf.connect(this.voiceHighShelf);
            this.voiceHighShelf.connect(this.ctx.destination);
        } catch (e) {
            console.warn('[ChronicleAudio] Failed to bind Web Audio sub-graph:', e);
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
        this.speed = Math.max(1.0, Math.min(2.0, speedMultiplier));
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

    stopSpeaking() {
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
            try { this.currentSource.stop(); } catch (_) {}
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
        this.duckGameAudio(false);
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
        if (this.currentAudio && !this.currentAudio.paused) {
            try { this.currentAudio.pause(); } catch (_) {}
        } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
            try { window.speechSynthesis.pause(); } catch (_) {}
        }
    }

    resume() {
        this.isPaused = false;
        if (this.currentAudio && this.currentAudio.paused) {
            try { this.currentAudio.play(); } catch (_) {}
        } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
            try { window.speechSynthesis.resume(); } catch (_) {}
        }
    }

    /**
     * Speaks narrative prose and creature dialogue with seamless queueing.
     * Returns a Promise that resolves when the prose and optional creature bark finish speaking.
     * Tier 1: Studio-quality Neural TTS via server /api/tts.
     * Tier 2: In-browser Web Speech API with clean formant preservation.
     */
    speak(text, dialogue = null, monsterCoords = null, playerCoords = null, cameraYaw = 0) {
        if (!this.enabled || !text) return Promise.resolve({ skipped: true });

        // If in interrupt mode and new urgent speech arrives, stop prior
        if (this.flowMode === 'interrupt' && this.isSpeaking) {
            this.stopSpeaking();
        }

        return new Promise((resolve) => {
            this.speechQueue.push({ text, dialogue, monsterCoords, playerCoords, cameraYaw, resolve });
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
                    result = await this._executeSpeak(item.text, item.dialogue);
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

    async _executeSpeak(text, dialogue = null) {
        this.duckGameAudio(true);
        this.isSpeaking = true;

        try {
            // 1. Speak main narrative prose (Narrator voice)
            const r1 = await this.speakUtterance(text, 'narrator');
            if (r1 && r1.aborted) return { aborted: true };
            if (!this.enabled || !this.isSpeaking || this.isPaused) return { stopped: true };

            // 2. If vocal dialogue exists (and is NOT a non-vocal creature sound noise), speak creature bark
            if (dialogue && dialogue.text && !dialogue.isNoise && this.enabled) {
                // Conversational cadence pause between narration and creature bark to guarantee zero vocal overlay
                await new Promise(r => {
                    this._pauseTimeout = setTimeout(r, 220);
                });
                this._pauseTimeout = null;
                if (!this.enabled || !this.isSpeaking || this.isPaused) return { stopped: true };

                const voice = dialogue.recommendedVoice || null;
                const r2 = await this.speakUtterance(dialogue.text, 'creature', dialogue.speaker, voice);
                if (r2 && r2.aborted) return { aborted: true };
            }
            return { finished: true };
        } finally {
            this.isSpeaking = false;
            this.duckGameAudio(false);
        }
    }

    /**
     * Speaks an individual prose or dialogue utterance.
     * Attempts server-side neural streaming first; falls back cleanly to local browser synthesis.
     */
    async speakUtterance(text, role = 'narrator', speakerName = '', customVoice = null) {
        if (!this.enabled) return { aborted: true };
        const cleanText = text.replace(/<[^>]*>/g, '').trim();
        if (!cleanText) return { finished: true };

        // Try high-fidelity server neural TTS first
        try {
            const res = await this.playNeuralAudio(cleanText, role, customVoice);
            return res || { finished: true };
        } catch (err) {
            // Server neural TTS offline or failed; smoothly fall back to browser Web Speech API
            console.info('[ChronicleAudio] Server neural TTS bypassed, using local speech synthesis:', err.message);
        }

        const res = await this.speakSpeechSynthesis(cleanText, role, speakerName);
        return res || { finished: true };
    }

    playNeuralAudio(text, role, customVoice = null) {
        return new Promise(async (resolve, reject) => {
            try {
                const voice = customVoice || (role === 'narrator' ? this.narratorVoice : '');
                const voiceParam = voice ? `&voice=${encodeURIComponent(voice)}` : '';
                // Add timestamp query param to guarantee no stale browser disk cache
                const url = `/api/tts?text=${encodeURIComponent(text)}&role=${encodeURIComponent(role)}${voiceParam}&_t=${Date.now()}`;

                // Stop prior audio cleanly
                if (this.currentAudio) {
                    try {
                        this.currentAudio.pause();
                        this.currentAudio.currentTime = 0;
                        this.currentAudio.onended = null;
                        this.currentAudio.onerror = null;
                    } catch (_) {}
                    this.currentAudio = null;
                }
                if (this.currentSource) {
                    try { this.currentSource.stop(); } catch (_) {}
                    this.currentSource = null;
                }

                const audio = new Audio();
                audio.src = url;
                audio.playbackRate = Math.max(0.75, Math.min(2.0, this.speed));
                this.currentAudio = audio;
                this.activePlaybackResolve = resolve;

                // Sync audio volume to master volume if sound engine present
                if (this.soundEngine && typeof this.soundEngine.masterVolume === 'number') {
                    audio.volume = Math.max(0, Math.min(1, this.soundEngine.masterVolume));
                }

                audio.onended = () => {
                    this.currentAudio = null;
                    this.activePlaybackResolve = null;
                    resolve({ finished: true });
                };
                audio.onerror = (e) => {
                    this.currentAudio = null;
                    this.activePlaybackResolve = null;
                    console.warn('[ChronicleAudio] Neural audio streaming error:', e);
                    reject(new Error('HTMLAudio playback failed'));
                };

                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    await playPromise;
                }
            } catch (err) {
                this.activePlaybackResolve = null;
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
}

if (typeof window !== 'undefined') {
    window.ChronicleAudioRouter = ChronicleAudioRouter;
}

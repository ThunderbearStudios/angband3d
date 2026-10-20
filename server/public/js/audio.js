/**
 * Angband3D Web Audio — High-Fidelity Procedural Sound Synthesizer
 * 1:1 Parity with Godot C# AudioManager.cs acoustic physical modeling + Next-Gen Expansions.
 * Synthesizes rich 16-bit PCM AudioBuffers natively via Web Audio API.
 * Guarantees zero 404s, zero latency, zero ambient noise loops,
 * and immediate contextual feedback for all player actions, combat, status, and interactions.
 */

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.masterVolume = 0.75;
        this.unlocked = false;

        this.sampleRate = 44100;
        this._sfxLibraryGenerated = false;
        this._rawBuffers = {};
        this.buffers = new Proxy(this._rawBuffers, {
            get: (target, prop) => {
                if (!this._sfxLibraryGenerated) {
                    this._sfxLibraryGenerated = true;
                    this.generateSfxLibrary();
                }
                return target[prop];
            },
            set: (target, prop, value) => {
                target[prop] = value;
                return true;
            },
            ownKeys: (target) => {
                if (!this._sfxLibraryGenerated) {
                    this._sfxLibraryGenerated = true;
                    this.generateSfxLibrary();
                }
                return Reflect.ownKeys(target);
            },
            getOwnPropertyDescriptor: (target, prop) => {
                if (!this._sfxLibraryGenerated) {
                    this._sfxLibraryGenerated = true;
                    this.generateSfxLibrary();
                }
                return Reflect.getOwnPropertyDescriptor(target, prop);
            }
        });
        this.stoneFootsteps = [];
        this.outdoorFootsteps = [];
        this.waterFootsteps = [];
        this.stoneStepIdx = 0;
        this.outdoorStepIdx = 0;
        this.waterStepIdx = 0;

        this.samplePools = {};
        this._poolCursors = {};
        this._studioBankLoading = false;
        this._studioBankLoaded = false;
        this.reverbConvolver = null;
        this.reverbSend = null;
        this.reverbWetGain = null;

        // Master Limiter / Compressor Stage & SFX Bus
        this.masterCompressor = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.sfxVolume = 1.0;

        // Throttles for status warnings and repetitive cues
        this.lastLowHpTime = 0;
        this.lastStatusTimes = {};

        // Restore persisted volume and mute state
        if (typeof window !== 'undefined') {
            try {
                if (window.localStorage) {
                    const savedVol = localStorage.getItem('angband3d_volume');
                    if (savedVol !== null) {
                        const parsed = parseFloat(savedVol);
                        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1.0) {
                            this.masterVolume = parsed;
                        }
                    }
                    const savedSfxVol = localStorage.getItem('angband3d_sfx_volume');
                    if (savedSfxVol !== null) {
                        const parsedSfx = parseFloat(savedSfxVol);
                        if (!isNaN(parsedSfx) && parsedSfx >= 0 && parsedSfx <= 1.0) {
                            this.sfxVolume = parsedSfx;
                        }
                    }
                    const savedMuted = localStorage.getItem('angband3d_muted');
                    if (savedMuted !== null) {
                        this.enabled = (savedMuted !== 'true');
                    }
                }
            } catch (_) {}
        }

        // Seamlessly initialize audio graph on the first trusted user gesture (click/key/touch),
        // preventing modern browser autoplay policy warnings on initial page load.
        if (typeof window !== 'undefined') {
            const unlockHandler = () => {
                this.unlock(true);
            };
            ['click', 'pointerdown', 'keydown', 'touchstart'].forEach(evt => {
                window.addEventListener(evt, unlockHandler, { passive: true, once: true });
            });
        }
    }

    setMasterVolume(volume) {
        this.masterVolume = Math.max(0.0, Math.min(1.0, parseFloat(volume) || 0.0));
        if (typeof window !== 'undefined') {
            try { if (window.localStorage) localStorage.setItem('angband3d_volume', this.masterVolume.toString()); } catch (_) {}
        }
        if (this.ctx && this.masterGain) {
            const effectiveVol = this.enabled ? this.masterVolume : 0.0;
            this.masterGain.gain.setValueAtTime(effectiveVol, this.ctx.currentTime);
        }
        // Universal scale: synchronize speech synthesis volume if fallback is active
        if (typeof window !== 'undefined' && window.chronicleManager && window.chronicleManager.audio) {
            if (this.masterVolume > 0 && !this.enabled) {
                this.setMute(false);
            }
        }
        return this.masterVolume;
    }

    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0.0, Math.min(1.0, parseFloat(volume) || 0.0));
        if (typeof window !== 'undefined') {
            try { if (window.localStorage) localStorage.setItem('angband3d_sfx_volume', this.sfxVolume.toString()); } catch (_) {}
        }
        if (this.ctx && this.sfxGain) {
            this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
        }
        return this.sfxVolume;
    }

    getSfxVolume() {
        return this.sfxVolume;
    }

    setMute(isMuted) {
        this.enabled = !isMuted;
        if (typeof window !== 'undefined') {
            try { if (window.localStorage) localStorage.setItem('angband3d_muted', (!this.enabled).toString()); } catch (_) {}
        }
        if (this.ctx && this.masterGain) {
            const effectiveVol = this.enabled ? this.masterVolume : 0.0;
            this.masterGain.gain.setValueAtTime(effectiveVol, this.ctx.currentTime);
        }
        // Universal mute: if muting, immediately hush any speaking voice narration
        if (isMuted && typeof window !== 'undefined' && window.chronicleManager && window.chronicleManager.audio) {
            if (typeof window.chronicleManager.audio.stopSpeaking === 'function') {
                window.chronicleManager.audio.stopSpeaking();
            }
        }
        return !this.enabled;
    }

    toggleMute() {
        return this.setMute(this.enabled);
    }

    getMasterVolume() {
        return this.masterVolume;
    }

    isMuted() {
        return !this.enabled;
    }

    init() {
        if (this.ctx) return;
        const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
                         (typeof global !== 'undefined' && (global.AudioContext || global.webkitAudioContext));
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.sampleRate = this.ctx.sampleRate || 44100;

        // Master Dynamics Limiter: Prevents clipping distortion when multiple combat/environmental sounds stack
        try {
            this.masterCompressor = this.ctx.createDynamicsCompressor();
            this.masterCompressor.threshold.setValueAtTime(-12.0, this.ctx.currentTime);
            this.masterCompressor.knee.setValueAtTime(12.0, this.ctx.currentTime);
            this.masterCompressor.ratio.setValueAtTime(4.5, this.ctx.currentTime);
            this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
            this.masterCompressor.release.setValueAtTime(0.12, this.ctx.currentTime);

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.enabled ? this.masterVolume : 0.0, this.ctx.currentTime);

            this.masterCompressor.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);

            // Independent SFX Sub-Bus feeding into Master Compressor
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
            this.sfxGain.connect(this.masterCompressor);

            this.reverbSend = this.ctx.createGain();
            this.reverbSend.gain.setValueAtTime(1.0, this.ctx.currentTime);
            this.reverbConvolver = this.ctx.createConvolver();
            this.reverbConvolver.buffer = this.createDungeonReverbImpulse(1.35, 3.2);
            this.reverbWetGain = this.ctx.createGain();
            this.reverbWetGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
            this.reverbSend.connect(this.reverbConvolver);
            this.reverbConvolver.connect(this.reverbWetGain);
            this.reverbWetGain.connect(this.masterCompressor);
        } catch (e) {
            console.warn('[SoundEngine] Could not initialize master audio nodes:', e);
            this.masterCompressor = null;
            this.masterGain = null;
            this.sfxGain = null;
            this.reverbSend = null;
            this.reverbConvolver = null;
            this.reverbWetGain = null;
        }

        // SFX library generated lazily on first audio interaction
        this.loadStudioSfxBank();
    }

    unlock(forceFromGesture = false) {
        if (!this.ctx) {
            this.init();
        }
        if (!this.unlocked && !forceFromGesture) {
            const hasUserGesture = (typeof navigator !== 'undefined' && navigator.userActivation && navigator.userActivation.hasBeenActive);
            if (!hasUserGesture) {
                // Defer audio context resumption until genuine user gesture, preventing browser autoplay warnings
                return;
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                this.unlocked = true;
            }).catch(() => {});
        } else if (this.ctx) {
            this.unlocked = true;
        }
    }

    /* -------------------------------------------------------------
     * Buffer Synthesis Helpers
     * ------------------------------------------------------------- */
    createBuffer(samples) {
        if (!this.ctx) return null;
        const buffer = this.ctx.createBuffer(1, samples.length, this.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
            data[i] = Math.max(-1.0, Math.min(1.0, samples[i]));
        }
        return buffer;
    }

    ensureSfxLibrary() {
        if (!this._sfxLibraryGenerated) {
            this._sfxLibraryGenerated = true;
            this.generateSfxLibrary();
        }
    }

    createDungeonReverbImpulse(duration = 1.35, decay = 3.2) {
        if (!this.ctx || typeof this.ctx.createBuffer !== 'function') return null;
        try {
            const rate = this.sampleRate || 44100;
            const length = Math.max(1, Math.floor(rate * duration));
            const impulse = this.ctx.createBuffer(2, length, rate);
            const left = impulse.getChannelData(0);
            const right = impulse.getChannelData(1);

            // Early stone wall reflections at 11ms, 19ms, 29ms, 43ms, 61ms with slight stereo offset
            const earlyReflections = [
                { t: 0.011, l: 0.45, r: 0.30 },
                { t: 0.019, l: 0.28, r: 0.42 },
                { t: 0.029, l: 0.35, r: 0.25 },
                { t: 0.043, l: 0.22, r: 0.30 },
                { t: 0.061, l: 0.18, r: 0.16 }
            ];

            for (const ref of earlyReflections) {
                const idxL = Math.floor(ref.t * rate);
                const idxR = Math.floor((ref.t + 0.0018) * rate);
                if (idxL < length) left[idxL] += ref.l;
                if (idxR < length) right[idxR] += ref.r;
            }

            // Exponentially decaying, lowpass-damped diffuse stereo tail
            let prevL = 0;
            let prevR = 0;
            const damping = 0.65; // High-frequency stone absorption

            for (let i = 0; i < length; i++) {
                const t = i / rate;
                const env = Math.exp(-t * decay);
                const rawL = (Math.random() * 2 - 1) * env;
                const rawR = (Math.random() * 2 - 1) * env;

                prevL = prevL * damping + rawL * (1 - damping);
                prevR = prevR * damping + rawR * (1 - damping);

                left[i] += prevL * 0.70;
                right[i] += prevR * 0.70;
            }

            return impulse;
        } catch (e) {
            console.warn('[SoundEngine] Could not create convolution impulse:', e);
            return null;
        }
    }

    loadStudioSfxBank() {
        if (this._studioBankLoading || this._studioBankLoaded || !this.ctx || typeof fetch !== 'function') return;
        if (typeof window !== 'undefined' && window.location && !/^https?:/i.test(window.location.protocol)) return;

        this._studioBankLoading = true;

        const STUDIO_SFX_POOLS = {
            step_stone: ['step_stone_1.ogg', 'step_stone_2.ogg', 'step_stone_3.ogg', 'step_stone_4.ogg'],
            step_grass: ['step_grass_1.ogg', 'step_grass_2.ogg', 'step_grass_3.ogg', 'step_grass_4.ogg'],
            step_wood: ['step_wood_1.ogg', 'step_wood_2.ogg'],
            step_water: ['water_blast.wav'],
            whoosh: ['miss_1.ogg', 'miss_2.ogg', 'miss_3.ogg', 'blade_slice_1.ogg', 'blade_slice_2.ogg'],
            slash: ['sword_1.ogg', 'axe_hit.ogg', 'blade_slice_1.ogg', 'blade_slice_2.ogg', 'chop.ogg'],
            bludgeon: ['mace_hit.ogg', 'flail_hit.ogg', 'impact_metal_heavy_1.ogg', 'impact_wood_heavy_1.ogg'],
            pierce: ['spear_hit.ogg', 'sword_1.ogg', 'blade_slice_2.ogg'],
            crit: ['axe_hit.ogg', 'mace_hit.ogg', 'impact_metal_heavy_1.ogg', 'impact_plate_heavy_1.ogg'],
            shieldBlock: ['impact_plate_heavy_1.ogg', 'impact_plate_heavy_2.ogg', 'impact_metal_heavy_1.ogg', 'impact_metal_heavy_2.ogg'],
            armorDeflect: ['impact_plate_med_1.ogg', 'impact_metal_heavy_2.ogg'],
            bow_loose: ['bow_fire.ogg', 'crossbow_fire.ogg', 'bow_miss.ogg'],
            bow_impact: ['spear_hit.ogg', 'impact_wood_heavy_1.ogg', 'impact_wood_heavy_2.ogg'],
            digging: ['impact_mining_1.ogg', 'impact_mining_2.ogg', 'impact_mining_3.ogg'],
            wallBump: ['impact_wood_heavy_2.ogg', 'step_stone_1.ogg'],
            doorOpen: ['door_open_1.ogg', 'creak_1.ogg'],
            doorClose: ['door_close_1.ogg', 'metal_latch.ogg'],
            doorBreak: ['impact_wood_heavy_1.ogg', 'cave_in.ogg'],
            chestOpen: ['open_chest.wav', 'metal_latch.ogg'],
            itemPickup: ['cloth_1.ogg', 'cloth_2.ogg'],
            itemDrop: ['step_wood_1.ogg', 'cloth_2.ogg'],
            goldPickup: ['gold_pickup.ogg', 'coins_1.ogg', 'coins_2.ogg'],
            equipWeapon: ['blade_draw_1.ogg', 'blade_draw_2.ogg'],
            equipArmor: ['impact_plate_med_1.ogg', 'cloth_1.ogg'],
            quaff: ['potion_drink.ogg'],
            potionThrow: ['miss_1.ogg', 'miss_2.ogg'],
            potionShatter: ['impact_glass_1.ogg', 'impact_glass_2.ogg'],
            scroll: ['book_flip_1.ogg', 'book_flip_2.ogg'],
            heal: ['potion_drink.ogg'],
            prayer: ['book_flip_1.ogg', 'book_flip_2.ogg'],
            staff: ['magic_faerie.ogg', 'magic_missile_1.ogg'],
            levelUp: ['fanfare_short.wav', 'magic_holy_2.ogg'],
            teleport: ['magic_faerie.ogg', 'magic_missile_2.ogg'],
            spell_fire: ['flame_big.ogg', 'explosion.ogg'],
            spell_cold: ['petrified.ogg', 'impact_glass_1.ogg'],
            spell_lightning: ['lightning_bolt.ogg'],
            spell_acid: ['water_blast.wav', 'poison_spell.ogg'],
            spell_poison: ['poison_spell.ogg'],
            spell_magic: ['magic_missile_1.ogg', 'magic_missile_2.ogg', 'magic_faerie.ogg'],
            spell_dark: ['magic_dark_big.ogg', 'impact_bell_1.ogg'],
            breath: ['flame_big.ogg', 'drake_hit_1.ogg', 'explosion.ogg'],
            monster_orc: ['impact_plate_med_1.ogg', 'impact_wood_heavy_1.ogg'],
            monster_orc_die: ['impact_plate_heavy_1.ogg', 'impact_wood_heavy_2.ogg'],
            monster_troll: ['impact_wood_heavy_1.ogg', 'impact_metal_heavy_1.ogg'],
            monster_troll_die: ['cave_in.ogg', 'impact_wood_heavy_2.ogg'],
            monster_dragon: ['drake_hit_1.ogg', 'flame_big.ogg'],
            monster_dragon_die: ['explosion.ogg', 'cave_in.ogg'],
            monster_wolf: ['wolf_growl_1.ogg', 'bite.ogg'],
            monster_wolf_die: ['bite.ogg', 'claws.ogg'],
            monster_hiss: ['hiss_big.wav', 'bite.ogg'],
            monster_hiss_die: ['hiss_big.wav'],
            monster_undead: ['skeleton_hit_1.ogg'],
            monster_undead_die: ['skeleton_die_1.ogg'],
            monster_ghost: ['magic_dark_big.ogg', 'magic_faerie.ogg'],
            monster_bat: ['bat_hit_1.ogg', 'claws.ogg'],
            monster_insect: ['pincers.ogg', 'claws.ogg'],
            playerHurt: ['impact_plate_med_1.ogg', 'impact_plate_heavy_2.ogg'],
            playerDeath: ['impact_bell_1.ogg', 'magic_dark_big.ogg']
        };

        const POOL_TO_RAW_BUFFER_KEYS = {
            whoosh: ['whoosh'],
            slash: ['hit'],
            crit: ['crit'],
            shieldBlock: ['shieldBlock'],
            armorDeflect: ['armorDeflect'],
            bow_loose: ['bow'],
            wallBump: ['wallBump'],
            doorOpen: ['doorOpen'],
            doorClose: ['doorClose'],
            doorBreak: ['doorBreak'],
            chestOpen: ['chestOpen'],
            itemPickup: ['itemPickup'],
            itemDrop: ['itemDrop'],
            goldPickup: ['goldPickup'],
            equipWeapon: ['equipWeapon'],
            equipArmor: ['equipArmor'],
            quaff: ['quaff'],
            scroll: ['scroll'],
            heal: ['heal'],
            levelUp: ['levelUp'],
            teleport: ['teleport'],
            spell_fire: ['spell_fire'],
            spell_cold: ['spell_cold'],
            spell_lightning: ['spell_lightning'],
            spell_acid: ['spell_acid'],
            spell_poison: ['spell_poison'],
            spell_magic: ['spell_magic'],
            monster_orc: ['monsterGrunt'],
            monster_orc_die: ['monsterDeath'],
            monster_wolf: ['monsterGrowl'],
            monster_hiss: ['monsterHiss'],
            monster_ghost: ['ghostWail'],
            monster_dragon: ['dragonRoar'],
            monster_bat: ['rodentSqueak'],
            monster_insect: ['insectChitin'],
            playerHurt: ['playerHurt'],
            playerDeath: ['playerDeath']
        };

        const decodedByFile = new Map();
        const loadFileBuffer = async (fileName) => {
            if (decodedByFile.has(fileName)) {
                return decodedByFile.get(fileName);
            }
            const promise = (async () => {
                try {
                    const res = await fetch(`/assets/audio/sfx/${fileName}`);
                    if (!res.ok) return null;
                    const ab = await res.arrayBuffer();
                    return await new Promise((resolve, reject) => {
                        this.ctx.decodeAudioData(ab, resolve, reject);
                    });
                } catch (e) {
                    return null;
                }
            })();
            decodedByFile.set(fileName, promise);
            return promise;
        };

        const allPoolPromises = Object.entries(STUDIO_SFX_POOLS).map(async ([poolKey, files]) => {
            try {
                const buffers = await Promise.all(files.map(f => loadFileBuffer(f)));
                const valid = buffers.filter(Boolean);
                if (valid.length > 0) {
                    this.samplePools[poolKey] = valid;
                    if (poolKey === 'step_stone') {
                        this.stoneFootsteps = valid;
                    } else if (poolKey === 'step_grass') {
                        this.outdoorFootsteps = valid;
                    } else if (poolKey === 'step_water') {
                        this.waterFootsteps = valid;
                    }
                    const rawKeys = POOL_TO_RAW_BUFFER_KEYS[poolKey];
                    if (rawKeys) {
                        for (const rk of rawKeys) {
                            this._rawBuffers[rk] = valid[0];
                        }
                    }
                }
            } catch (_) {}
        });

        Promise.allSettled(allPoolPromises).then(() => {
            this._studioBankLoaded = true;
            this._studioBankLoading = false;
        });
    }

    playPoolSample(poolKey, pitchScale = 1.0, volumeScale = 1.0, pan = 0.0, reverbAmount = 0.22, fallbackBufferKey = null) {
        const pool = this.samplePools && this.samplePools[poolKey];
        if (pool && pool.length > 0) {
            const cursor = (this._poolCursors[poolKey] || 0) % pool.length;
            this._poolCursors[poolKey] = (cursor + 1) % pool.length;
            this.playBuffer(pool[cursor], pitchScale, volumeScale, pan, reverbAmount);
            return true;
        } else if (fallbackBufferKey && this.buffers && this.buffers[fallbackBufferKey]) {
            this.playBuffer(this.buffers[fallbackBufferKey], pitchScale, volumeScale, pan, reverbAmount);
            return true;
        }
        return false;
    }

    /**
     * Spatial Panner helper: Clamps pan to [-0.95, 0.95] and creates a StereoPannerNode,
     * falling back to a pass-through GainNode if StereoPanner is unsupported (e.g. older iOS/Safari).
     */
    createPanner(pan = 0) {
        if (!this.ctx) return null;
        const clampedPan = Math.max(-0.95, Math.min(0.95, Number(pan) || 0));
        if (typeof this.ctx.createStereoPanner === 'function') {
            try {
                const panner = this.ctx.createStereoPanner();
                panner.pan.setValueAtTime(clampedPan, this.ctx.currentTime);
                return panner;
            } catch (_) {}
        }
        if (typeof this.ctx.createGain === 'function') {
            try {
                const passThrough = this.ctx.createGain();
                passThrough.gain.setValueAtTime(1.0, this.ctx.currentTime);
                return passThrough;
            } catch (_) {}
        }
        return null;
    }

    /**
     * Shared white noise buffer cache for transient and atmospheric synthesis
     */
    getNoiseBuffer(seconds = 2.0) {
        if (!this.ctx) return null;
        if (this._noiseBuffer && this._noiseBuffer.duration >= seconds) {
            return this._noiseBuffer;
        }
        const len = Math.floor(this.sampleRate * Math.max(2.0, seconds));
        const buffer = this.ctx.createBuffer(1, len, this.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
            data[i] = Math.random() * 2.0 - 1.0;
        }
        this._noiseBuffer = buffer;
        return buffer;
    }

    /**
     * Helper to allocate a temporary spatialized voice sub-bus with automatic node disposal (Rule L26).
     */
    _createVoice(duration, pan = 0.0) {
        if (!this.enabled) return null;
        this.unlock();
        if (!this.ctx) return null;

        const now = this.ctx.currentTime;
        const dest = this.sfxGain || this.masterCompressor || this.masterGain || this.ctx.destination;
        const panner = this.createPanner(pan);
        const voiceGain = this.ctx.createGain();
        voiceGain.gain.setValueAtTime(1.0, now);

        if (panner) {
            voiceGain.connect(panner);
            panner.connect(dest);
        } else {
            voiceGain.connect(dest);
        }

        const nodes = [voiceGain];
        if (panner) nodes.push(panner);

        const cleanupTimer = setTimeout(() => {
            for (let i = 0; i < nodes.length; i++) {
                try { nodes[i].disconnect(); } catch (_) {}
            }
            nodes.length = 0;
        }, Math.ceil((duration + 0.15) * 1000));

        return {
            ctx: this.ctx,
            now,
            out: voiceGain,
            add(...n) {
                for (let i = 0; i < n.length; i++) {
                    if (n[i]) nodes.push(n[i]);
                }
            },
            cleanup() {
                clearTimeout(cleanupTimer);
                for (let i = 0; i < nodes.length; i++) {
                    try { nodes[i].disconnect(); } catch (_) {}
                }
                nodes.length = 0;
            }
        };
    }

    playBuffer(buffer, pitchScale = 1.0, volumeScale = 1.0, pan = 0.0, reverbAmount = 0.20) {
        this.ensureSfxLibrary();
        if (!this.enabled || !this.ctx || !buffer || !this.unlocked) return;
        if (this.ctx.state === 'suspended') {
            return;
        }

        const now = this.ctx.currentTime;
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        // Subtle organic pitch detune (+/- 2%)
        const detune = (Math.random() * 0.04 - 0.02);
        source.playbackRate.setValueAtTime(Math.max(0.4, Math.min(2.5, pitchScale + detune)), now);

        const gain = this.ctx.createGain();
        // Master gain controls master volume; per-source gain scales individual sound volume
        gain.gain.setValueAtTime(volumeScale, now);

        const dest = this.sfxGain || this.masterCompressor || this.masterGain || this.ctx.destination;

        let wetSend = null;
        if (this.reverbSend && reverbAmount > 0) {
            try {
                wetSend = this.ctx.createGain();
                wetSend.gain.setValueAtTime(volumeScale * reverbAmount, now);
                source.connect(wetSend);
                wetSend.connect(this.reverbSend);
            } catch (_) {
                wetSend = null;
            }
        }

        const panner = (pan !== 0.0) ? this.createPanner(pan) : null;

        if (panner) {
            source.connect(gain);
            gain.connect(panner);
            panner.connect(dest);
            source.onended = () => {
                try {
                    source.disconnect();
                    gain.disconnect();
                    panner.disconnect();
                    if (wetSend) wetSend.disconnect();
                } catch (_) {}
            };
        } else {
            source.connect(gain);
            gain.connect(dest);
            source.onended = () => {
                try {
                    source.disconnect();
                    gain.disconnect();
                    if (wetSend) wetSend.disconnect();
                } catch (_) {}
            };
        }

        source.start(now);
    }

    /* -------------------------------------------------------------
     * Procedural SFX Library Generation
     * ------------------------------------------------------------- */
    generateSfxLibrary() {
        if (!this.ctx) return;

        // 1. Footstep variations (stone, outdoor dirt, and aquatic water splash)
        this.stoneFootsteps = [];
        this.outdoorFootsteps = [];
        this.waterFootsteps = [];
        for (let i = 0; i < 4; i++) {
            this.stoneFootsteps.push(this.synthFootstep(true, i));
            this.outdoorFootsteps.push(this.synthFootstep(false, i));
            this.waterFootsteps.push(this.synthWaterFootstep(i));
        }

        // 2. Combat & Action sounds
        this.buffers['whoosh'] = this.synthWhoosh();
        this.buffers['hit'] = this.synthHit();
        this.buffers['crit'] = this.synthCrit();
        this.buffers['shieldBlock'] = this.synthShieldBlock();
        this.buffers['armorDeflect'] = this.synthArmorDeflect();
        this.buffers['bow'] = this.synthBowShoot();
        this.buffers['playerHurt'] = this.synthPlayerHurt();
        this.buffers['playerDeath'] = this.synthPlayerDeath();
        this.buffers['lowHp'] = this.synthLowHpHeartbeat();
        this.buffers['heal'] = this.synthHeal();
        this.buffers['subtleRegenHp'] = this.synthSubtleRegen(false);
        this.buffers['subtleRegenSp'] = this.synthSubtleRegen(true);
        this.buffers['levelUp'] = this.synthLevelUp();

        // 3. Creature acoustics by family/glyph
        this.buffers['monsterGrunt'] = this.synthMonsterGrunt();
        this.buffers['monsterDeath'] = this.synthMonsterDeath();
        this.buffers['monsterGrowl'] = this.synthMonsterGrowl();
        this.buffers['monsterHiss'] = this.synthMonsterHiss();
        this.buffers['ghostWail'] = this.synthGhostWail();
        this.buffers['dragonRoar'] = this.synthDragonRoar();
        this.buffers['rodentSqueak'] = this.synthRodentSqueak();
        this.buffers['insectChitin'] = this.synthInsectChitin();

        // 4. Dungeon & Environment interactions
        this.buffers['wallBump'] = this.synthWallBump();
        this.buffers['doorOpen'] = this.synthDoor(true);
        this.buffers['doorClose'] = this.synthDoor(false);
        this.buffers['doorBreak'] = this.synthDoorBreak();
        this.buffers['stairsDown'] = this.synthStairs(true);
        this.buffers['stairsUp'] = this.synthStairs(false);
        this.buffers['levelEnter'] = this.synthDungeonHorn();
        this.buffers['chestOpen'] = this.synthChest();
        this.buffers['trapDisarm'] = this.synthTrapDisarm();
        this.buffers['trapTrigger'] = this.synthTrapTrigger();
        this.buffers['teleport'] = this.synthTeleport();

        // 5. Items, Inventory & Equipment
        this.buffers['itemPickup'] = this.synthItemPickup();
        this.buffers['goldPickup'] = this.synthGoldPickup();
        this.buffers['itemDrop'] = this.synthItemDrop();
        this.buffers['equipWeapon'] = this.synthEquipWeapon();
        this.buffers['equipArmor'] = this.synthEquipArmor();
        this.buffers['quaff'] = this.synthQuaff();
        this.buffers['scroll'] = this.synthScroll();
        this.buffers['eat'] = this.synthEat();

        // 6. Status condition warnings
        this.buffers['poison'] = this.synthPoison();
        this.buffers['confused'] = this.synthConfused();
        this.buffers['blind'] = this.synthBlind();
        this.buffers['paralyzed'] = this.synthParalyzed();
        this.buffers['afraid'] = this.synthAfraid();
        this.buffers['hunger'] = this.synthHunger();

        // 7. Elemental Spell Variety
        this.buffers['spell_magic'] = this.synthElementalSpell('magic');
        this.buffers['spell_fire'] = this.synthElementalSpell('fire');
        this.buffers['spell_cold'] = this.synthElementalSpell('cold');
        this.buffers['spell_lightning'] = this.synthElementalSpell('lightning');
        this.buffers['spell_poison'] = this.synthElementalSpell('poison');

        // 8. Tactile UI Sounds
        this.buffers['menuNav'] = this.synthMenuNav();
        this.buffers['menuSelect'] = this.synthMenuSelect();
        this.buffers['menuOpen'] = this.synthMenuOpen();
    }

    /* -------------------------------------------------------------
     * Acoustic Physical Synthesis Models
     * ------------------------------------------------------------- */

    // Multi-stage acoustic footstep model (warm, muted organic impact)
    synthFootstep(stone, variation) {
        const duration = stone ? 0.12 : 0.14;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        // Warm, muted physical frequencies (avoiding harsh mid-frequency pings)
        const fHeel = stone ? (85 + variation * 4) : (68 + variation * 3);
        const fToe = stone ? (130 + variation * 6) : (105 + variation * 5);
        const toeDelay = Math.floor(this.sampleRate * 0.018);

        let lpNoise1 = 0, lpNoise2 = 0;
        let bpState1 = 0, bpState2 = 0;

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;

            // Stage 1: Heel impact transient (soft low-frequency thud)
            const envHeel = Math.exp(-t * (stone ? 55 : 42));
            const heelPunch = Math.sin(2 * Math.PI * fHeel * t) * envHeel * (stone ? 0.45 : 0.55);

            // Stage 2: Toe impact transient
            let toePunch = 0;
            if (i >= toeDelay) {
                const tToe = (i - toeDelay) / this.sampleRate;
                const envToe = Math.exp(-tToe * (stone ? 65 : 48));
                toePunch = Math.sin(2 * Math.PI * fToe * tToe) * envToe * (stone ? 0.28 : 0.32);
            }

            // Stage 3: Surface texture friction (gentle warm bandpass, NO harsh resonant peaks)
            const rawNoise = Math.random() * 2 - 1;
            const coeff = stone ? 0.12 : 0.08;
            lpNoise1 += (rawNoise - lpNoise1) * coeff;
            lpNoise2 += (lpNoise1 - lpNoise2) * coeff;

            // Use low center frequency (520Hz stone, 360Hz dirt) with low Q (0.7) for soft organic crunch
            const centerFreq = stone ? 520 : 360;
            const q = 0.7;
            const omega = 2 * Math.PI * centerFreq / this.sampleRate;
            const alpha = Math.sin(omega) / (2 * q);
            bpState1 = bpState1 + alpha * (rawNoise - bpState1);
            bpState2 = bpState2 + alpha * (bpState1 - bpState2);

            const frictionEnv = Math.exp(-t * (stone ? 38 : 28));
            const friction = (lpNoise2 * 0.5 + bpState2 * 0.5) * frictionEnv * (stone ? 0.18 : 0.24);

            samples[i] = (heelPunch + toePunch + friction) * 0.38;
        }
        return this.createBuffer(samples);
    }

    // Aquatic Wading / Liquid Splash Footstep (Physical acoustic displacement + droplet spray)
    synthWaterFootstep(variation) {
        const duration = 0.16;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        const fPlunge = 80 + variation * 8;
        const splashDelay = Math.floor(this.sampleRate * 0.012);

        let lpFluid = 0;
        let bpSpray = 0;

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;

            // Stage 1: Liquid displacement thump / pop (sub-120Hz)
            const envPlunge = Math.exp(-t * 36);
            const plunge = Math.sin(2 * Math.PI * fPlunge * t) * envPlunge * 0.42;

            // Stage 2: Wet splash / spray droplet bandpass noise
            let spray = 0;
            if (i >= splashDelay) {
                const tSpray = (i - splashDelay) / this.sampleRate;
                const envSpray = Math.exp(-tSpray * 28);
                const rawNoise = Math.random() * 2 - 1;
                // Resonant bandpass around 950Hz (water slosh / splash)
                bpSpray += 0.22 * (rawNoise - bpSpray);
                // Bubble micro-modulation
                const bubble = 1.0 + 0.35 * Math.sin(2 * Math.PI * 440 * tSpray);
                spray = bpSpray * envSpray * bubble * 0.38;
            }

            // Stage 3: Low slosh tail
            const rawFluid = Math.random() * 2 - 1;
            lpFluid += 0.08 * (rawFluid - lpFluid);
            const slosh = lpFluid * Math.exp(-t * 22) * 0.25;

            let sample = plunge + spray + slosh;
            sample = Math.tanh(sample * 1.2) * 0.85;
            samples[i] = sample;
        }

        return this.createBuffer(samples);
    }

    // Weapon swing whoosh (AudioManager.cs:321-343)
    synthWhoosh() {
        const duration = 0.16;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const progress = t / duration;
            const env = Math.sin(progress * Math.PI);
            const noise = (Math.random() * 2 - 1);
            const freq = 200 + Math.sin(progress * Math.PI) * 450;
            const whistle = Math.sin(2 * Math.PI * freq * t) * 0.4;
            samples[i] = (noise * 0.6 + whistle) * env * 0.7;
        }
        return this.createBuffer(samples);
    }

    // Upgraded Metallic Impact Strike: Inharmonic Euler-Bernoulli blade modes + punchy low impact
    synthHit() {
        const duration = 0.22;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const f0 = 460;

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const clang = Math.sin(2 * Math.PI * f0 * t) * Math.exp(-t * 12) * 0.35
                        + Math.sin(2 * Math.PI * (f0 * 2.76) * t) * Math.exp(-t * 22) * 0.25
                        + Math.sin(2 * Math.PI * (f0 * 5.40) * t) * Math.exp(-t * 38) * 0.18
                        + Math.sin(2 * Math.PI * (f0 * 8.93) * t) * Math.exp(-t * 55) * 0.12;
            const punch = Math.sin(2 * Math.PI * (125 - t * 240) * t) * Math.exp(-t * 32) * 0.6;
            const spark = (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.4;
            samples[i] = Math.tanh((clang + punch + spark) * 0.88);
        }
        return this.createBuffer(samples);
    }

    // Upgraded Critical Strike: Sub-bass drop + heavy hammer slam + ringing anvil overtones
    synthCrit() {
        const duration = 0.38;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const bass = Math.sin(2 * Math.PI * (160 - t * 280) * t) * Math.exp(-t * 14) * 0.75;
            const sub = Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t * 8) * 0.55;
            const gong = (Math.sin(2 * Math.PI * 392 * t) * 0.35
                        + Math.sin(2 * Math.PI * 784 * t) * 0.30
                        + Math.sin(2 * Math.PI * 1175 * t) * 0.22) * Math.exp(-t * 7);
            samples[i] = Math.tanh((bass + sub + gong) * 0.92);
        }
        return this.createBuffer(samples);
    }

    // Shield Block / Parry: Resonant metallic/wooden deflection with high ricochet ping
    synthShieldBlock() {
        const duration = 0.22;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 22);
            const clang = Math.sin(2 * Math.PI * 580 * t) * 0.45 + Math.sin(2 * Math.PI * 1160 * t) * 0.35;
            const ping = Math.sin(2 * Math.PI * 2800 * t) * Math.exp(-t * 45) * 0.30;
            const punch = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t * 60) * 0.40;
            samples[i] = Math.tanh((clang + ping + punch) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Heavy Armor Deflect: Glancing plate blow (clink-thud)
    synthArmorDeflect() {
        const duration = 0.18;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 28);
            const ping = Math.sin(2 * Math.PI * 640 * t) * 0.50 + Math.sin(2 * Math.PI * 1480 * t) * 0.35;
            const thud = Math.sin(2 * Math.PI * 90 * t) * 0.45;
            samples[i] = Math.tanh((ping + thud) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Bow release twang (AudioManager.cs:456-475)
    synthBowShoot() {
        const duration = 0.20;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 24);
            const twang = Math.sin(2 * Math.PI * (380 + Math.sin(t * 120) * 40) * t) * 0.65;
            const snap = (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.45;
            samples[i] = (twang + snap) * env * 0.85;
        }
        return this.createBuffer(samples);
    }

    // Visceral player hurt shock (AudioManager.cs:436-454)
    synthPlayerHurt() {
        const duration = 0.25;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 16);
            const impact = Math.sin(2 * Math.PI * (130 - t * 250) * t) * 0.8;
            const shock = Math.sin(2 * Math.PI * 65 * t) * 0.5;
            samples[i] = (impact + shock) * env * 0.90;
        }
        return this.createBuffer(samples);
    }

    // Somber funeral death toll (AudioManager.cs:704-728)
    synthPlayerDeath() {
        const duration = 2.6;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const attackSamples = Math.floor(this.sampleRate * 0.006);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const attack = i < attackSamples ? (i / attackSamples) : 1.0;
            const env = attack * Math.exp(-t * 1.5);

            const fundamental = Math.sin(2 * Math.PI * 73.416 * t) * 0.55;
            const minorThird = Math.sin(2 * Math.PI * 87.307 * t) * 0.35;
            const fifth = Math.sin(2 * Math.PI * 110.00 * t) * 0.25;
            const octave = Math.sin(2 * Math.PI * 146.83 * t) * 0.20;
            const chime = Math.sin(2 * Math.PI * 293.66 * t) * Math.exp(-t * 4.0) * 0.25;
            const highChime = Math.sin(2 * Math.PI * 587.33 * t) * Math.exp(-t * 8.0) * 0.15;

            samples[i] = (fundamental + minorThird + fifth + octave + chime + highChime) * env * 0.85;
        }
        return this.createBuffer(samples);
    }

    // Low HP heartbeat pulse (tactical danger warning)
    synthLowHpHeartbeat() {
        const duration = 0.42;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const pulse2Delay = Math.floor(this.sampleRate * 0.14);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env1 = Math.exp(-t * 26);
            const lub = Math.sin(2 * Math.PI * (58 - t * 45) * t) * env1 * 0.85;

            let dub = 0;
            if (i >= pulse2Delay) {
                const t2 = (i - pulse2Delay) / this.sampleRate;
                const env2 = Math.exp(-t2 * 22);
                dub = Math.sin(2 * Math.PI * (48 - t2 * 35) * t2) * env2 * 0.70;
            }

            samples[i] = (lub + dub) * 0.75;
        }
        return this.createBuffer(samples);
    }

    // Soft, warm low-register restorative acoustic pad (zero high-frequency sweeps or bells per L49)
    synthHeal() {
        const duration = 0.24;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const attack = Math.min(1.0, t / 0.015);
            const env = attack * Math.exp(-t * 12);
            const tone1 = Math.sin(2 * Math.PI * 220.0 * t) * 0.45;
            const tone2 = Math.sin(2 * Math.PI * 330.0 * t) * 0.28;
            samples[i] = (tone1 + tone2) * env * 0.22;
        }
        return this.createBuffer(samples);
    }

    // Whisper-soft, non-invasive warm harmonic breath for over-time HP/SP recovery (L49 refinement)
    synthSubtleRegen(isMana = false) {
        const duration = isMana ? 0.15 : 0.14;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const f1 = isMana ? 261.63 : 196.00; // C4 for Mana, G3 for HP
        const f2 = isMana ? 392.00 : 293.66; // Soft fifth (G4 / D4)

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const attack = Math.sin(Math.min(1.0, t / 0.035) * (Math.PI * 0.5));
            const env = attack * Math.exp(-t * 16.5);
            const fundamental = Math.sin(2 * Math.PI * f1 * t) * 0.52;
            const fifth = Math.sin(2 * Math.PI * f2 * t) * 0.24;
            samples[i] = (fundamental + fifth) * env * 0.16;
        }
        return this.createBuffer(samples);
    }

    // Heroic level up fanfare
    synthLevelUp() {
        const duration = 0.95;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const notes = [261.63, 329.63, 392.00, 523.25];
        const noteDuration = 0.16;

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const noteIdx = Math.min(notes.length - 1, Math.floor(t / noteDuration));
            const noteT = t - noteIdx * noteDuration;
            const f = notes[noteIdx];

            const noteEnv = Math.exp(-noteT * 6);
            const masterEnv = t > 0.6 ? Math.exp(-(t - 0.6) * 3) : 1.0;

            const h1 = Math.sin(2 * Math.PI * f * t) * 0.50;
            const h2 = Math.sin(2 * Math.PI * (f * 2) * t) * 0.30;
            const h3 = Math.sin(2 * Math.PI * (f * 3) * t) * 0.15;

            samples[i] = (h1 + h2 + h3) * noteEnv * masterEnv * 0.70;
        }
        return this.createBuffer(samples);
    }

    // Clean physical armor/shield impact transient (Zero vocal groans per L41)
    synthMonsterGrunt() {
        const duration = 0.16;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 32);
            const clack = Math.sin(2 * Math.PI * (420 - t * 900) * t) * Math.exp(-t * 45) * 0.55;
            const plate = Math.sin(2 * Math.PI * 1180 * t) * Math.exp(-t * 60) * 0.30;
            const leather = (Math.random() * 2 - 1) * Math.exp(-t * 48) * 0.25;
            samples[i] = (clack + plate + leather) * env * 0.80;
        }
        return this.createBuffer(samples);
    }

    // Clean collapsing armor & bone clatter dissolution (Zero vocal groans per L41)
    synthMonsterDeath() {
        const duration = 0.34;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const clatters = [0.0, 0.055, 0.125, 0.21];

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 10);
            let clatter = 0;
            for (const c of clatters) {
                const dt = t - c;
                if (dt >= 0 && dt < 0.045) {
                    clatter += Math.sin(2 * Math.PI * (680 - c * 900) * dt) * Math.exp(-dt * 95) * 0.45;
                    clatter += (Math.random() * 2 - 1) * Math.exp(-dt * 110) * 0.25;
                }
            }
            const drop = Math.sin(2 * Math.PI * (110 - t * 140) * t) * Math.exp(-t * 18) * 0.45;
            samples[i] = Math.tanh((clatter + drop) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Canine / Wolf growl (glyphs C, Z, d)
    synthMonsterGrowl() {
        const duration = 0.32;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 8);
            const vocal = Math.sin(2 * Math.PI * (115 + Math.sin(t * 60) * 20) * t) * 0.60;
            const rasp = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 35 * t)) * 0.45;
            samples[i] = Math.tanh((vocal + rasp) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Serpent / Reptilian hiss (glyphs J, n, R)
    synthMonsterHiss() {
        const duration = 0.36;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.sin((t / duration) * Math.PI);
            const hiss = (Math.random() * 2 - 1) * 0.65;
            const sibilance = Math.sin(2 * Math.PI * 3400 * t) * 0.30;
            samples[i] = Math.tanh((hiss + sibilance) * env * 0.80);
        }
        return this.createBuffer(samples);
    }

    // Undead / Ghostly spectral wail (glyphs G, W, L, v)
    synthGhostWail() {
        const duration = 0.60;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.sin((t / duration) * Math.PI);
            const f = 340 + Math.sin(t * 8) * 90;
            const w1 = Math.sin(2 * Math.PI * f * t) * 0.55;
            const w2 = Math.sin(2 * Math.PI * (f * 2.01) * t) * 0.35;
            samples[i] = Math.tanh((w1 + w2) * env * 0.75);
        }
        return this.createBuffer(samples);
    }

    // Dragon / Demon massive sub-bass roar (glyphs D, U, B)
    synthDragonRoar() {
        const duration = 0.65;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 4);
            const sub = Math.sin(2 * Math.PI * (52 - t * 25) * t) * 0.80;
            const throat = Math.sin(2 * Math.PI * 105 * t) * 0.50;
            const flame = (Math.random() * 2 - 1) * Math.sin(t * 22) * 0.45;
            samples[i] = Math.tanh((sub + throat + flame) * env * 0.90);
        }
        return this.createBuffer(samples);
    }

    // Rodent / Bat chitter & high-pitch squeak (glyphs r, b)
    synthRodentSqueak() {
        const duration = 0.20;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const chirp1 = t < 0.09 ? Math.sin(2 * Math.PI * (1900 + t * 9000) * t) * Math.sin((t / 0.09) * Math.PI) * 0.60 : 0;
            const t2 = t - 0.09;
            const chirp2 = t2 > 0 && t2 < 0.10 ? Math.sin(2 * Math.PI * (2200 + t2 * 8000) * t2) * Math.sin((t2 / 0.10) * Math.PI) * 0.55 : 0;
            samples[i] = Math.tanh((chirp1 + chirp2) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Insect / Spider chitinous click (glyphs s, S, I)
    synthInsectChitin() {
        const duration = 0.22;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const clicks = [0.0, 0.04, 0.09, 0.15];

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            let cVal = 0;
            for (const c of clicks) {
                const dt = t - c;
                if (dt >= 0 && dt < 0.025) {
                    const snap = Math.sin(2 * Math.PI * 3200 * dt) * Math.exp(-dt * 180) * 0.55;
                    const noise = (Math.random() * 2 - 1) * Math.exp(-dt * 140) * 0.35;
                    cVal += (snap + noise);
                }
            }
            samples[i] = Math.tanh(cVal * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Wall Bump / Obstacle Blocked: Dull low stone thud + surface grit crunch
    synthWallBump() {
        const duration = 0.13;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 38);
            const thud = Math.sin(2 * Math.PI * (68 - t * 180) * t) * 0.85;
            const grit = (Math.random() * 2 - 1) * Math.exp(-t * 65) * 0.35;
            samples[i] = Math.tanh((thud + grit) * env * 0.90);
        }
        return this.createBuffer(samples);
    }

    // Wooden door squeak & latch (AudioManager.cs:501-523)
    synthDoor(open) {
        const duration = 0.30;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * (open ? 9 : 15));
            const squeakF = open ? (240 + t * 400) : (350 - t * 300);
            const squeak = Math.sin(2 * Math.PI * squeakF * t) * 0.45;
            const wood = Math.sin(2 * Math.PI * 95 * t) * 0.5;
            const friction = (Math.random() * 2 - 1) * 0.2;
            samples[i] = (squeak + wood + friction) * env * 0.70;
        }
        return this.createBuffer(samples);
    }

    // Door break / bash (AudioManager.cs:525-543)
    synthDoorBreak() {
        const duration = 0.38;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 12);
            const shatter = (Math.random() * 2 - 1) * 0.7;
            const splinter = Math.sin(2 * Math.PI * (220 - t * 300) * t) * 0.5;
            const heavy = Math.sin(2 * Math.PI * 80 * t) * 0.6;
            samples[i] = (shatter + splinter + heavy) * env * 0.85;
        }
        return this.createBuffer(samples);
    }

    // Stairs descent/ascent steps (AudioManager.cs:545-565)
    synthStairs(down) {
        const duration = 0.40;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 7);
            const f1 = down ? (160 - t * 140) : (110 + t * 140);
            const f2 = down ? (80 - t * 60) : (55 + t * 60);
            const step1 = Math.sin(2 * Math.PI * f1 * t) * 0.5;
            const step2 = Math.sin(2 * Math.PI * f2 * t) * 0.5;
            samples[i] = (step1 + step2) * env * 0.80;
        }
        return this.createBuffer(samples);
    }

    // Resonant brassy fantasy dungeon horn (AudioManager.cs:678-702)
    synthDungeonHorn() {
        const duration = 0.90;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const attackSamples = Math.floor(this.sampleRate * 0.06);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const attack = i < attackSamples ? (i / attackSamples) : 1.0;
            const env = attack * Math.exp(-t * 3.8);

            const f0 = 110.0;
            const h1 = Math.sin(2 * Math.PI * f0 * t) * 0.45;
            const h2 = Math.sin(2 * Math.PI * (f0 * 1.5) * t) * 0.30;
            const h3 = Math.sin(2 * Math.PI * (f0 * 2.0) * t) * 0.22;
            const h4 = Math.sin(2 * Math.PI * (f0 * 3.0) * t) * 0.14;
            const sub = Math.sin(2 * Math.PI * (f0 * 0.5) * t) * 0.25;

            samples[i] = (h1 + h2 + h3 + h4 + sub) * env * 0.65;
        }
        return this.createBuffer(samples);
    }

    // Chest Open: Heavy creaking wooden lid + iron latch click
    synthChest() {
        const duration = 0.40;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const creakF = 180 + t * 240 + Math.sin(t * 70) * 35;
            const creak = Math.sin(2 * Math.PI * creakF * t) * Math.exp(-t * 7) * 0.45;
            const latch = Math.sin(2 * Math.PI * 920 * t) * Math.exp(-t * 60) * 0.40;
            const wood = Math.sin(2 * Math.PI * 75 * t) * Math.exp(-t * 12) * 0.40;
            samples[i] = Math.tanh((creak + latch + wood) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Trap Disarm: Clockwork click + relief chime
    synthTrapDisarm() {
        const duration = 0.32;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const click = Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-t * 90) * 0.50;
            const t2 = t - 0.05;
            const chime1 = t2 > 0 ? Math.sin(2 * Math.PI * 1046.5 * t2) * Math.exp(-t2 * 12) * 0.40 : 0;
            const chime2 = t2 > 0.08 ? Math.sin(2 * Math.PI * 1318.5 * (t - 0.13)) * Math.exp(-(t - 0.13) * 10) * 0.40 : 0;
            samples[i] = Math.tanh((click + chime1 + chime2) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Trap Trigger: Mechanical spring snap + danger thud
    synthTrapTrigger() {
        const duration = 0.35;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const snap = Math.sin(2 * Math.PI * 980 * t) * Math.exp(-t * 70) * 0.60;
            const spring = Math.sin(2 * Math.PI * (340 + Math.sin(t * 80) * 80) * t) * Math.exp(-t * 15) * 0.45;
            const thud = Math.sin(2 * Math.PI * 75 * t) * Math.exp(-t * 12) * 0.55;
            samples[i] = Math.tanh((snap + spring + thud) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Teleport / Phase Door: Spatial warp sweep + vacuum pop
    synthTeleport() {
        const duration = 0.38;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const f = 180 + Math.pow(t / duration, 2) * 1400;
            const env = Math.sin((t / duration) * Math.PI);
            const warp = Math.sin(2 * Math.PI * f * t) * 0.65;
            const pop = Math.sin(2 * Math.PI * 60 * t) * Math.exp(-(t - 0.28) * 40) * (t > 0.28 ? 0.6 : 0);
            samples[i] = Math.tanh((warp * env + pop) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Item Pickup: Light cloth/leather rustle + brass chime
    synthItemPickup() {
        const duration = 0.26;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 14);
            const tone1 = Math.sin(2 * Math.PI * 880.0 * t) * 0.45;
            const tone2 = Math.sin(2 * Math.PI * 1318.5 * t) * 0.35;
            const rustle = (Math.random() * 2 - 1) * Math.exp(-t * 35) * 0.25;
            samples[i] = Math.tanh((tone1 + tone2 + rustle) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Upgraded Gold Pickup: 3-coin rapid cascade (clink-clink-clink)
    synthGoldPickup() {
        const duration = 0.34;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const coins = [
            { t: 0.0, f1: 2093.0, f2: 3136.0 },
            { t: 0.042, f1: 2349.3, f2: 3520.0 },
            { t: 0.088, f1: 2793.8, f2: 4186.0 }
        ];

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            let cAcc = 0;
            for (const c of coins) {
                const dt = t - c.t;
                if (dt >= 0 && dt < 0.18) {
                    const env = Math.exp(-dt * 16);
                    const tone = Math.sin(2 * Math.PI * c.f1 * dt) * 0.45 + Math.sin(2 * Math.PI * c.f2 * dt) * 0.30;
                    const click = (Math.random() * 2 - 1) * Math.exp(-dt * 120) * 0.25;
                    cAcc += (tone + click) * env;
                }
            }
            samples[i] = Math.tanh(cAcc * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Drop Item: Soft flagstone tap & clatter
    synthItemDrop() {
        const duration = 0.15;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env1 = Math.exp(-t * 35);
            const tap1 = Math.sin(2 * Math.PI * 190 * t) * env1 * 0.65;
            const t2 = t - 0.045;
            const env2 = t2 > 0 ? Math.exp(-t2 * 45) : 0;
            const tap2 = t2 > 0 ? Math.sin(2 * Math.PI * 230 * t2) * env2 * 0.35 : 0;
            samples[i] = Math.tanh((tap1 + tap2) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Equip Weapon: Steel blade unsheathe & ring
    synthEquipWeapon() {
        const duration = 0.26;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const scrape = (Math.random() * 2 - 1) * Math.sin((t / duration) * Math.PI) * 0.35;
            const ring = Math.sin(2 * Math.PI * 1760 * t) * 0.30 + Math.sin(2 * Math.PI * 2640 * t) * 0.20;
            const env = Math.exp(-t * 14);
            samples[i] = Math.tanh((scrape + ring * env) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Equip Armor: Chainmail rattle & buckle clasp
    synthEquipArmor() {
        const duration = 0.24;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const rattle = (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.45;
            const snap = Math.sin(2 * Math.PI * 340 * t) * Math.exp(-t * 40) * 0.45;
            samples[i] = Math.tanh((rattle + snap) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Upgraded Potion Quaff: Cork pop transient + liquid bubble gulps
    synthQuaff() {
        const duration = 0.36;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const pop = Math.sin(2 * Math.PI * (1200 - t * 3000) * t) * Math.exp(-t * 90) * 0.55;
            const t1 = t - 0.035;
            const g1 = t1 > 0 && t1 < 0.14 ? Math.sin(2 * Math.PI * (480 - t1 * 1200) * t1) * Math.sin((t1 / 0.14) * Math.PI) * 0.55 : 0;
            const t2 = t - 0.17;
            const g2 = t2 > 0 && t2 < 0.16 ? Math.sin(2 * Math.PI * (580 - t2 * 1400) * t2) * Math.sin((t2 / 0.16) * Math.PI) * 0.60 : 0;
            const bubble = (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.20;
            samples[i] = Math.tanh((pop + g1 + g2 + bubble) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Upgraded Scroll Reading: Soft parchment texture + warm low-register rune triad
    synthScroll() {
        const duration = 0.28;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 11);
            const rustle = (Math.random() * 2 - 1) * Math.exp(-t * 28) * 0.28;
            const rune1 = Math.sin(2 * Math.PI * 220.0 * t) * 0.30;
            const rune2 = Math.sin(2 * Math.PI * 330.0 * t) * 0.20;
            const rune3 = Math.sin(2 * Math.PI * 440.0 * t) * 0.12;
            samples[i] = Math.tanh((rustle + (rune1 + rune2 + rune3) * env) * 0.40);
        }
        return this.createBuffer(samples);
    }

    // Eating Food: Crispy ration bite & chew
    synthEat() {
        const duration = 0.28;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const bite1 = t < 0.12 ? (Math.random() * 2 - 1) * Math.sin((t / 0.12) * Math.PI) * 0.55 : 0;
            const t2 = t - 0.12;
            const bite2 = t2 > 0 && t2 < 0.14 ? (Math.random() * 2 - 1) * Math.sin((t2 / 0.14) * Math.PI) * 0.50 : 0;
            const crunch = Math.sin(2 * Math.PI * 480 * t) * Math.exp(-t * 20) * 0.30;
            samples[i] = Math.tanh((bite1 + bite2 + crunch) * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Poison Status Cue: Corrosive sizzle + minor second warning pulse
    synthPoison() {
        const duration = 0.42;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 6);
            const hiss = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 24 * t)) * 0.35;
            const tone = Math.sin(2 * Math.PI * (660 - t * 80) * t) * 0.45;
            samples[i] = Math.tanh((hiss + tone) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Confusion Status Cue: Binaural 6Hz beat disorientation warble
    synthConfused() {
        const duration = 0.45;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.sin((t / duration) * Math.PI);
            const w1 = Math.sin(2 * Math.PI * 220 * t) * 0.45;
            const w2 = Math.sin(2 * Math.PI * 226 * t) * 0.45;
            samples[i] = Math.tanh((w1 + w2) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Blindness Status Cue: Deep muffled subterranean gong with lowpass sweep
    synthBlind() {
        const duration = 0.55;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 4);
            const gong = Math.sin(2 * Math.PI * 85 * t) * 0.70 + Math.sin(2 * Math.PI * 130 * t) * 0.30;
            samples[i] = Math.tanh(gong * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Paralysis Status Cue: Freezing iron snap / shackle lock
    synthParalyzed() {
        const duration = 0.28;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.exp(-t * 16);
            const iron = Math.sin(2 * Math.PI * 840 * t) * 0.55 + Math.sin(2 * Math.PI * 1680 * t) * 0.35;
            const frost = (Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.30;
            samples[i] = Math.tanh((iron + frost) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Afraid Status Cue: Shivering dissonant tritone tremolo
    synthAfraid() {
        const duration = 0.45;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const tremolo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 14 * t);
            const tritone1 = Math.sin(2 * Math.PI * 587.33 * t) * 0.45;
            const tritone2 = Math.sin(2 * Math.PI * 830.61 * t) * 0.40;
            const env = Math.sin((t / duration) * Math.PI);
            samples[i] = Math.tanh((tritone1 + tritone2) * tremolo * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Hunger Warning: Hollow rumbling chime
    synthHunger() {
        const duration = 0.50;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const env = Math.sin((t / duration) * Math.PI);
            const rumble = Math.sin(2 * Math.PI * (110 - t * 45) * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 8 * t)) * 0.70;
            const hollow = Math.sin(2 * Math.PI * 185 * t) * 0.35;
            samples[i] = Math.tanh((rumble + hollow) * env * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Elemental Spell Synthesis
    synthElementalSpell(element) {
        const duration = 0.38;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const p = t / duration;
            let v = 0;

            if (element === 'fire') {
                const blast = Math.sin(2 * Math.PI * (120 - t * 140) * t) * Math.exp(-t * 8) * 0.65;
                const crackle = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(t * 30)) * Math.exp(-t * 6) * 0.45;
                v = blast + crackle;
            } else if (element === 'cold' || element === 'frost') {
                const crack = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.40;
                const chime1 = Math.sin(2 * Math.PI * 2093 * t) * 0.40 + Math.sin(2 * Math.PI * 3136 * t) * 0.25;
                v = crack + chime1 * Math.exp(-t * 10);
            } else if (element === 'lightning') {
                const zap = (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.70;
                const hum = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 25) * 0.40;
                const thunder = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 5) * 0.55;
                v = zap + hum + thunder;
            } else if (element === 'poison') {
                const sizzle = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 28 * t)) * 0.50;
                const bubble = Math.sin(2 * Math.PI * (520 - t * 400) * t) * Math.exp(-t * 8) * 0.40;
                v = sizzle + bubble;
            } else {
                const sweep = Math.sin(2 * Math.PI * (320 + p * 700) * t) * 0.50;
                const shimmer = Math.sin(2 * Math.PI * (1200 + Math.sin(t * 40) * 280) * t) * 0.35;
                v = (sweep + shimmer) * Math.sin(p * Math.PI);
            }
            samples[i] = Math.tanh(v * 0.85);
        }
        return this.createBuffer(samples);
    }

    // Soft tactile UI navigation click (AudioManager.cs:597-617)
    synthMenuNav() {
        const duration = 0.022;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const attackSamples = Math.floor(this.sampleRate * 0.0015);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const attack = i < attackSamples ? (i / attackSamples) : 1.0;
            const env = attack * Math.exp(-t * 160);
            const body = Math.sin(2 * Math.PI * 320 * t) * 0.40
                       + Math.sin(2 * Math.PI * 540 * t) * 0.25;
            samples[i] = body * env * 0.40;
        }
        return this.createBuffer(samples);
    }

    // Bright crystal UI affirmation chime (AudioManager.cs:619-640)
    synthMenuSelect() {
        const duration = 0.28;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const attackSamples = Math.floor(this.sampleRate * 0.003);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const attack = i < attackSamples ? (i / attackSamples) : 1.0;
            const env = attack * Math.exp(-t * 15);

            const tone1 = Math.sin(2 * Math.PI * 659.25 * t) * 0.40;
            const tone2 = Math.sin(2 * Math.PI * 987.77 * t) * 0.35;
            const tone3 = Math.sin(2 * Math.PI * 1318.51 * t) * 0.20;
            const bell = Math.sin(2 * Math.PI * 1819.5 * t) * Math.exp(-t * 30) * 0.15;

            samples[i] = (tone1 + tone2 + tone3 + bell) * env * 0.55;
        }
        return this.createBuffer(samples);
    }

    // Fantasy harmony chord (AudioManager.cs:642-676)
    synthMenuOpen() {
        const duration = 1.4;
        const totalSamples = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(totalSamples);
        const attackSamples = Math.floor(this.sampleRate * 0.04);

        for (let i = 0; i < totalSamples; i++) {
            const t = i / this.sampleRate;
            const attack = i < attackSamples ? (i / attackSamples) : 1.0;

            const envBass = attack * Math.exp(-t * 2.2);
            const envMid = attack * Math.exp(-t * 3.4);
            const envHigh = attack * Math.exp(-t * 5.2);
            const shimmer = 1.0 + 0.08 * Math.sin(2 * Math.PI * 0.45 * t);

            const d2 = Math.sin(2 * Math.PI * 73.42 * t) * 0.35 * envBass;
            const a2 = Math.sin(2 * Math.PI * 110.00 * t) * 0.30 * envBass;
            const d3 = Math.sin(2 * Math.PI * 146.83 * t) * 0.28 * envMid;
            const f3 = Math.sin(2 * Math.PI * 174.61 * t) * 0.24 * envMid;
            const a3 = Math.sin(2 * Math.PI * 220.00 * t) * 0.20 * envMid * shimmer;
            const e4 = Math.sin(2 * Math.PI * 329.63 * t) * 0.16 * envHigh * shimmer;
            const chimePing = Math.sin(2 * Math.PI * 1318.51 * t) * Math.exp(-t * 12) * 0.22;

            samples[i] = (d2 + a2 + d3 + f3 + a3 + e4 + chimePing) * 0.48;
        }
        return this.createBuffer(samples);
    }

    /* -------------------------------------------------------------
     * Public Playback API
     * ------------------------------------------------------------- */
    playFootstep(outdoors = false, heightRatio = 1.0, surface = null) {
        if (!this.enabled) return;
        this.unlock();
        this.ensureSfxLibrary();
        let list;
        if (surface === 'water' || surface === 'deep_water' || surface === 'swamp') {
            list = this.waterFootsteps;
        } else {
            list = outdoors ? this.outdoorFootsteps : this.stoneFootsteps;
        }
        if (!list || list.length === 0) return;

        let idx;
        if (surface === 'water' || surface === 'deep_water' || surface === 'swamp') {
            if (!this.waterStepIdx) this.waterStepIdx = 0;
            idx = this.waterStepIdx++ % list.length;
        } else {
            idx = outdoors ? (this.outdoorStepIdx++ % list.length) : (this.stoneStepIdx++ % list.length);
        }
        const buffer = list[idx];
        const pitchScale = Math.max(0.85, Math.min(1.20, 1.0 / Math.pow(heightRatio || 1.0, 0.35)));
        const vol = (surface === 'water' || surface === 'deep_water') ? 0.38 : (surface === 'swamp' ? 0.34 : 0.30);
        this.playBuffer(buffer, pitchScale, vol);
    }

    playWhoosh() {
        this.unlock();
        if (this.playPoolSample('whoosh', 1.0, 0.85, 0.0, 0.15, 'whoosh')) return;
        this.playBuffer(this.buffers['whoosh'], 1.0, 0.85);
    }

    playHit(crit = false, pan = 0.0, category = 'slash') {
        this.unlock();
        if (this.ctx && typeof this.ctx.createOscillator === 'function') {
            this.playWeaponImpact(category, crit, pan);
        } else if (crit) {
            this.playCrit(pan);
        } else {
            this.playBuffer(this.buffers['hit'], 1.0, 0.95, pan);
        }
    }

    playCrit(pan = 0.0) {
        this.unlock();
        if (this.ctx && typeof this.ctx.createOscillator === 'function') {
            this.playWeaponImpact('slash', true, pan);
        } else {
            this.playBuffer(this.buffers['crit'], 1.0, 1.10, pan);
        }
    }

    playShieldBlock(pan = 0.0) {
        this.unlock();
        if (this.playPoolSample('shieldBlock', 1.0, 0.95, pan, 0.22, 'shieldBlock')) return;
        this.playBuffer(this.buffers['shieldBlock'], 1.0, 0.95, pan);
    }

    playArmorDeflect(pan = 0.0) {
        this.unlock();
        if (this.playPoolSample('armorDeflect', 1.0, 0.90, pan, 0.20, 'armorDeflect')) return;
        this.playBuffer(this.buffers['armorDeflect'], 1.0, 0.90, pan);
    }

    playBow(stage = 'loose', pan = 0.0) {
        this.unlock();
        if (this.ctx && typeof this.ctx.createOscillator === 'function') {
            this.playArrowLooseAndImpact(stage, pan);
        } else {
            const poolKey = stage !== 'impact' ? 'bow_loose' : 'bow_impact';
            if (this.playPoolSample(poolKey, 1.0, 0.95, pan, 0.20, 'bow')) return;
            this.playBuffer(this.buffers['bow'], 1.0, 0.95, pan);
        }
    }

    playBowShoot(pan = 0.0) {
        this.unlock();
        if (this.ctx && typeof this.ctx.createOscillator === 'function') {
            this.playArrowLooseAndImpact('loose', pan);
        } else {
            if (this.playPoolSample('bow_loose', 1.0, 0.95, pan, 0.20, 'bow')) return;
            this.playBuffer(this.buffers['bow'], 1.0, 0.95, pan);
        }
    }

    playPlayerHurt() {
        this.unlock();
        if (this.playPoolSample('playerHurt', 1.0, 1.10, 0.0, 0.22, 'playerHurt')) return;
        this.playBuffer(this.buffers['playerHurt'], 1.0, 1.10);
    }

    playLowHpWarning() {
        if (!this.enabled) return;
        const now = performance.now();
        if (now - this.lastLowHpTime < 1700) return;
        this.lastLowHpTime = now;
        this.unlock();
        this.playBuffer(this.buffers['lowHp'], 1.0, 0.85);
    }

    playDeathBell() {
        this.unlock();
        if (this.playPoolSample('playerDeath', 1.0, 1.25, 0.0, 0.40, 'playerDeath')) return;
        this.playBuffer(this.buffers['playerDeath'], 1.0, 1.25);
    }

    playHeal() {
        const now = performance.now();
        if (now - (this.lastStatusTimes['heal'] || 0) < 1800) return;
        this.lastStatusTimes['heal'] = now;
        this.unlock();
        if (this.playPoolSample('heal', 1.0, 0.25, 0.0, 0.10, 'heal')) return;
        this.playBuffer(this.buffers['heal'], 1.0, 0.25);
    }

    /**
     * Plays a whisper-soft, non-invasive warm harmonic breath when HP or Mana recovers over time.
     * Rate-limited with a strict >= 2200ms cooldown so resting ('R') or fast walking is soothing and never repetitive.
     */
    playSubtleRegen(kind = 'hp', isFull = false) {
        const now = performance.now();
        const cooldownMs = 2200;
        const lastAny = this.lastStatusTimes['subtleRegenAny'] || 0;
        const key = kind === 'sp' ? 'subtleRegenSp' : 'subtleRegenHp';
        const lastKind = this.lastStatusTimes[key] || 0;

        // Enforce 2200ms cooldown unless transitioning to 100% full after at least 650ms
        if (now - lastKind < cooldownMs && !(isFull && now - lastKind > 650)) return;
        if (now - lastAny < 450) return; // Prevent double-triggering on simultaneous HP+SP tick

        this.lastStatusTimes[key] = now;
        this.lastStatusTimes['subtleRegenAny'] = now;
        this.unlock();

        const buf = this.buffers[key] || this.buffers['subtleRegenHp'];
        if (!buf) return;
        const rate = isFull ? 1.06 : 1.0;
        const gain = kind === 'sp' ? 0.032 : 0.036;
        this.playBuffer(buf, rate, gain);
    }

    playLevelUp() {
        this.unlock();
        if (this.playPoolSample('levelUp', 1.0, 1.15, 0.0, 0.35, 'levelUp')) return;
        this.playBuffer(this.buffers['levelUp'], 1.0, 1.15);
    }

    // Creature vocalizations routed dynamically by monster family/glyph
    playMonsterVocal(glyph, action = 'grunt', pan = 0.0) {
        this.unlock();
        const g = glyph || 'm';
        const isDeath = action === 'death';

        let poolKey;
        let fallbackKey;
        let fallbackPitch = 1.0;
        let volume = isDeath ? 1.05 : 0.90;

        if (['D', 'd', 'M'].includes(g)) {
            poolKey = isDeath ? 'monster_dragon_die' : 'monster_dragon';
            fallbackKey = isDeath ? 'monsterDeath' : 'dragonRoar';
            fallbackPitch = isDeath ? 0.70 : 1.0;
            volume = 1.10;
        } else if (['C', 'Z', 'q'].includes(g)) {
            poolKey = isDeath ? 'monster_wolf_die' : 'monster_wolf';
            fallbackKey = isDeath ? 'monsterDeath' : 'monsterGrowl';
        } else if (['J', 'n', 'R', 'w'].includes(g)) {
            poolKey = isDeath ? 'monster_hiss_die' : 'monster_hiss';
            fallbackKey = isDeath ? 'monsterDeath' : 'monsterHiss';
        } else if (['G', 'W', 'V'].includes(g)) {
            poolKey = isDeath ? 'monster_undead_die' : 'monster_ghost';
            fallbackKey = isDeath ? 'monsterDeath' : 'ghostWail';
        } else if (['s', 'z', 'L'].includes(g)) {
            poolKey = isDeath ? 'monster_undead_die' : 'monster_undead';
            fallbackKey = isDeath ? 'monsterDeath' : 'ghostWail';
        } else if (['T', 'O', 'P', 'U'].includes(g)) {
            poolKey = isDeath ? 'monster_troll_die' : 'monster_troll';
            fallbackKey = isDeath ? 'monsterDeath' : 'monsterGrunt';
            fallbackPitch = isDeath ? 0.70 : 0.85;
        } else if (['r', 'b', 'B'].includes(g)) {
            poolKey = 'monster_bat';
            fallbackKey = isDeath ? 'monsterDeath' : 'rodentSqueak';
            fallbackPitch = isDeath ? 1.35 : 1.0;
        } else if (['a', 'c', 'I', 'K', 'S', 'j', 'i', 'm', 'Q'].includes(g)) {
            poolKey = 'monster_insect';
            fallbackKey = isDeath ? 'monsterDeath' : 'insectChitin';
            fallbackPitch = isDeath ? 1.35 : 1.0;
        } else {
            poolKey = isDeath ? 'monster_orc_die' : 'monster_orc';
            fallbackKey = isDeath ? 'monsterDeath' : 'monsterGrunt';
        }

        if (this.playPoolSample(poolKey, 1.0, volume, pan, 0.25)) return;

        if (this.buffers[fallbackKey]) {
            this.playBuffer(this.buffers[fallbackKey], fallbackPitch, volume, pan);
        }
    }

    playMonsterGrunt(pan = 0.0) {
        this.unlock();
        this.playBuffer(this.buffers['monsterGrunt'], 1.0, 0.90, pan);
    }

    playMonsterDeath(glyph = 'm', pan = 0.0) {
        this.playMonsterVocal(glyph, 'death', pan);
    }

    playWallBump(volume = 0.85) {
        this.unlock();
        if (this.playPoolSample('wallBump', 1.0, volume, 0.0, 0.22, 'wallBump')) return;
        this.playBuffer(this.buffers['wallBump'], 1.0, volume);
    }

    playDoor(open = true, pan = 0.0) {
        this.unlock();
        const poolKey = open ? 'doorOpen' : 'doorClose';
        if (this.playPoolSample(poolKey, 1.0, 0.85, pan, 0.25, poolKey)) return;
        this.playBuffer(open ? this.buffers['doorOpen'] : this.buffers['doorClose'], 1.0, 0.85, pan);
    }

    playDoorBreak(pan = 0.0) {
        this.unlock();
        if (this.playPoolSample('doorBreak', 1.0, 1.05, pan, 0.30, 'doorBreak')) return;
        this.playBuffer(this.buffers['doorBreak'], 1.0, 1.05, pan);
    }

    playStairs(down = true) {
        this.unlock();
        this.playBuffer(down ? this.buffers['stairsDown'] : this.buffers['stairsUp'], 1.0, 0.95);
    }

    playLevelEnter() {
        this.unlock();
        this.playBuffer(this.buffers['levelEnter'], 1.0, 0.85);
    }

    playChest() {
        this.unlock();
        if (this.playPoolSample('chestOpen', 1.0, 0.95, 0.0, 0.25, 'chestOpen')) return;
        this.playBuffer(this.buffers['chestOpen'], 1.0, 0.95);
    }

    playTrapDisarm() {
        this.unlock();
        this.playBuffer(this.buffers['trapDisarm'], 1.0, 0.90);
    }

    playTrapTrigger() {
        this.unlock();
        this.playBuffer(this.buffers['trapTrigger'], 1.0, 1.05);
    }

    playTeleport() {
        this.unlock();
        if (this.playPoolSample('teleport', 1.0, 0.95, 0.0, 0.30, 'teleport')) return;
        this.playBuffer(this.buffers['teleport'], 1.0, 0.95);
    }

    playItemPickup() {
        this.unlock();
        if (this.playPoolSample('itemPickup', 1.0, 0.85, 0.0, 0.18, 'itemPickup')) return;
        this.playBuffer(this.buffers['itemPickup'], 1.0, 0.85);
    }

    playGoldPickup() {
        this.unlock();
        if (this.playPoolSample('goldPickup', 1.0, 1.00, 0.0, 0.20, 'goldPickup')) return;
        this.playBuffer(this.buffers['goldPickup'], 1.0, 1.00);
    }

    playItemDrop() {
        this.unlock();
        if (this.playPoolSample('itemDrop', 1.0, 0.85, 0.0, 0.18, 'itemDrop')) return;
        this.playBuffer(this.buffers['itemDrop'], 1.0, 0.85);
    }

    playEquipWeapon() {
        this.unlock();
        if (this.playPoolSample('equipWeapon', 1.0, 0.90, 0.0, 0.22, 'equipWeapon')) return;
        this.playBuffer(this.buffers['equipWeapon'], 1.0, 0.90);
    }

    playEquipArmor() {
        this.unlock();
        if (this.playPoolSample('equipArmor', 1.0, 0.85, 0.0, 0.22, 'equipArmor')) return;
        this.playBuffer(this.buffers['equipArmor'], 1.0, 0.85);
    }

    playQuaff(pan = 0.0) {
        this.unlock();
        if (this.playPoolSample('quaff', 1.0, 0.42, pan, 0.12, 'quaff')) return;
        this.playBuffer(this.buffers['quaff'], 1.0, 0.42, pan);
    }

    playScroll(pan = 0.0) {
        this.unlock();
        if (this.playPoolSample('scroll', 1.0, 0.40, pan, 0.14, 'scroll')) return;
        if (this.ctx && typeof this.ctx.createOscillator === 'function') {
            this.playRunicAura('scroll', pan);
        } else {
            this.playBuffer(this.buffers['scroll'], 1.0, 0.40, pan);
        }
    }

    playEat() {
        this.unlock();
        this.playBuffer(this.buffers['eat'], 1.0, 0.95);
    }

    // Status warning play methods with intelligent throttle
    playStatusCue(statusKey, throttleMs = 2800) {
        if (!this.enabled) return;
        const now = performance.now();
        const last = this.lastStatusTimes[statusKey] || 0;
        if (now - last < throttleMs) return;
        this.lastStatusTimes[statusKey] = now;
        this.unlock();
        if (this.buffers[statusKey]) {
            this.playBuffer(this.buffers[statusKey], 1.0, 0.95);
        }
    }

    playPoison() {
        this.playStatusCue('poison', 2500);
    }

    playConfused() {
        this.playStatusCue('confused', 2800);
    }

    playBlind() {
        this.playStatusCue('blind', 3500);
    }

    playParalyzed() {
        this.playStatusCue('paralyzed', 2800);
    }

    playAfraid() {
        this.playStatusCue('afraid', 3000);
    }

    playHunger() {
        this.playStatusCue('hunger', 4500);
    }

    playSpell(element = 'magic', pan = 0.0) {
        this.unlock();
        if (element === 'lightning') {
            this.playLightningCrack(pan);
            return;
        }
        if (element === 'fire') {
            this.playFireballDetonation(false, pan);
            return;
        }
        const poolKey = 'spell_' + element;
        if (this.playPoolSample(poolKey, 1.0, 0.95, pan, 0.28)) return;
        const key = `spell_${element}`;
        const buffer = this.buffers[key] || this.buffers['spell_magic'];
        this.playBuffer(buffer, 1.0, 0.95, pan);
    }

    playMenuNav() {
        this.unlock();
        this.playBuffer(this.buffers['menuNav'], 1.0, 0.50);
    }

    playMenuSelect() {
        this.unlock();
        this.playBuffer(this.buffers['menuSelect'], 1.0, 0.80);
    }

    playMenuOpen() {
        this.unlock();
        this.playBuffer(this.buffers['menuOpen'], 1.0, 0.75);
    }

    playSound(soundName, ...args) {
        return this.play(soundName, ...args);
    }

    play(soundName, ...args) {
        if (!soundName) return;
        if (soundName === 'menuSelect') return this.playMenuSelect();
        if (soundName === 'menuNav') return this.playMenuNav();
        if (soundName === 'menuOpen') return this.playMenuOpen();
        if (soundName === 'weaponImpact' || soundName === 'hit') return this.playWeaponImpact(...args);
        if (soundName === 'digging' || soundName === 'diggingStrike') return this.playDiggingStrike(...args);
        if (soundName === 'arrowLoose') return this.playArrowLooseAndImpact('loose', ...args);
        if (soundName === 'arrowImpact') return this.playArrowLooseAndImpact('impact', ...args);
        if (soundName === 'potionThrow') return this.playPotionThrowAndShatter('throw', ...args);
        if (soundName === 'potionShatter') return this.playPotionThrowAndShatter('shatter', ...args);
        if (soundName === 'lightningCrack') return this.playLightningCrack(...args);
        if (soundName === 'fireball' || soundName === 'fireballDetonation') return this.playFireballDetonation(...args);
        if (soundName === 'runicAura') return this.playRunicAura(...args);
        if (this.buffers && this.buffers[soundName]) {
            this.unlock();
            const pan = typeof args[0] === 'number' ? args[0] : 0.0;
            this.playBuffer(this.buffers[soundName], 1.0, 0.85, pan);
        }
    }

    /* -------------------------------------------------------------
     * Contextual & Spatial SFX Choreography (Card 14C)
     * Real-time Multi-layered Procedural Web Audio Physical Models
     * ------------------------------------------------------------- */

    /**
     * Contextual & Spatial Weapon Impact Acoustics
     * @param {string} category 'slash' | 'bludgeon' | 'pierce'
     * @param {boolean} isCrit Critical strike overtone
     * @param {number} pan Spatial pan [-0.95, 0.95]
     */
    playWeaponImpact(category = 'slash', isCrit = false, pan = 0) {
        const cat = String(category || 'slash').toLowerCase();
        let poolKey = 'slash';
        if (cat.includes('blunt') || cat.includes('bludgeon') || cat.includes('mace') || cat.includes('hammer') || cat.includes('club') || cat.includes('staff')) {
            poolKey = 'bludgeon';
        } else if (cat.includes('pierce') || cat.includes('spear') || cat.includes('stab') || cat.includes('dagger')) {
            poolKey = 'pierce';
        }

        if (this.samplePools && this.samplePools[poolKey] && this.samplePools[poolKey].length > 0) {
            this.playPoolSample(poolKey, isCrit ? 0.92 : 1.0, isCrit ? 1.05 : 0.90, pan, 0.26);
            if (isCrit) {
                this.playPoolSample('crit', 1.04, 0.85, pan, 0.32);
            }
            return;
        }

        if (this.buffers && this.buffers[isCrit ? 'crit' : 'hit']) {
            this.playBuffer(this.buffers[isCrit ? 'crit' : 'hit'], 1.0, 0.95, pan);
            return;
        }

        const duration = isCrit ? 0.45 : 0.35;
        const voice = this._createVoice(duration, pan);
        if (!voice) return;
        const { ctx, now, out } = voice;
        const noiseBuf = this.getNoiseBuffer(1.0);

        if (cat.includes('bludgeon') || cat.includes('mace') || cat.includes('hammer') || cat.includes('club') || cat.includes('staff')) {
            // Bludgeon: Deep kinetic concussion (145Hz -> 32Hz sine pitch-drop + 340Hz dry bone/armor crack + lowpass noise thud)
            const subOsc = ctx.createOscillator();
            const subGain = ctx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(145, now);
            subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
            subGain.gain.setValueAtTime(isCrit ? 0.95 : 0.75, now);
            subGain.gain.exponentialRampToValueAtTime(0.0001, now + (isCrit ? 0.32 : 0.26));
            subOsc.connect(subGain);
            subGain.connect(out);
            subOsc.start(now);
            subOsc.stop(now + 0.35);
            voice.add(subOsc, subGain);

            const crackOsc = ctx.createOscillator();
            const crackGain = ctx.createGain();
            crackOsc.type = 'triangle';
            crackOsc.frequency.setValueAtTime(340, now);
            crackGain.gain.setValueAtTime(isCrit ? 0.70 : 0.50, now);
            crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
            crackOsc.connect(crackGain);
            crackGain.connect(out);
            crackOsc.start(now);
            crackOsc.stop(now + 0.06);
            voice.add(crackOsc, crackGain);

            if (noiseBuf) {
                const noiseSrc = ctx.createBufferSource();
                noiseSrc.buffer = noiseBuf;
                const lpFilter = ctx.createBiquadFilter();
                lpFilter.type = 'lowpass';
                lpFilter.frequency.setValueAtTime(180, now);
                lpFilter.Q.setValueAtTime(1.8, now);
                const noiseGain = ctx.createGain();
                noiseGain.gain.setValueAtTime(isCrit ? 0.75 : 0.55, now);
                noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
                noiseSrc.connect(lpFilter);
                lpFilter.connect(noiseGain);
                noiseGain.connect(out);
                noiseSrc.start(now);
                noiseSrc.stop(now + 0.18);
                voice.add(noiseSrc, lpFilter, noiseGain);
            }
        } else if (cat.includes('pierce') || cat.includes('spear') || cat.includes('pike') || cat.includes('arrow') || cat.includes('estoc')) {
            // Pierce: Fast high-velocity whip-snap (1800Hz -> 420Hz) + sharp armor puncture transient
            const snapOsc = ctx.createOscillator();
            const snapGain = ctx.createGain();
            snapOsc.type = 'sawtooth';
            snapOsc.frequency.setValueAtTime(1800, now);
            snapOsc.frequency.exponentialRampToValueAtTime(420, now + 0.065);
            snapGain.gain.setValueAtTime(isCrit ? 0.75 : 0.55, now);
            snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
            snapOsc.connect(snapGain);
            snapGain.connect(out);
            snapOsc.start(now);
            snapOsc.stop(now + 0.08);
            voice.add(snapOsc, snapGain);

            if (noiseBuf) {
                const puncSrc = ctx.createBufferSource();
                puncSrc.buffer = noiseBuf;
                const hpFilter = ctx.createBiquadFilter();
                hpFilter.type = 'highpass';
                hpFilter.frequency.setValueAtTime(2400, now);
                const puncGain = ctx.createGain();
                puncGain.gain.setValueAtTime(isCrit ? 0.65 : 0.45, now);
                puncGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
                puncSrc.connect(hpFilter);
                hpFilter.connect(puncGain);
                puncGain.connect(out);
                puncSrc.start(now);
                puncSrc.stop(now + 0.05);
                voice.add(puncSrc, hpFilter, puncGain);
            }

            const biteOsc = ctx.createOscillator();
            const biteGain = ctx.createGain();
            biteOsc.type = 'sine';
            biteOsc.frequency.setValueAtTime(2200, now);
            biteGain.gain.setValueAtTime(isCrit ? 0.35 : 0.20, now);
            biteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
            biteOsc.connect(biteGain);
            biteGain.connect(out);
            biteOsc.start(now);
            biteOsc.stop(now + 0.045);
            voice.add(biteOsc, biteGain);
        } else {
            // Slash: High-Q metallic ring (1420Hz -> 680Hz bandpass + 2640Hz harmonic) + cleave noise transient + deep sub-thump (110Hz -> 38Hz)
            const thumpOsc = ctx.createOscillator();
            const thumpGain = ctx.createGain();
            thumpOsc.type = 'sine';
            thumpOsc.frequency.setValueAtTime(110, now);
            thumpOsc.frequency.exponentialRampToValueAtTime(38, now + (isCrit ? 0.20 : 0.14));
            thumpGain.gain.setValueAtTime(isCrit ? 0.85 : 0.60, now);
            thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + (isCrit ? 0.22 : 0.16));
            thumpOsc.connect(thumpGain);
            thumpGain.connect(out);
            thumpOsc.start(now);
            thumpOsc.stop(now + 0.25);
            voice.add(thumpOsc, thumpGain);

            if (noiseBuf) {
                const ringSrc = ctx.createBufferSource();
                ringSrc.buffer = noiseBuf;
                const bpFilter = ctx.createBiquadFilter();
                bpFilter.type = 'bandpass';
                bpFilter.frequency.setValueAtTime(1420, now);
                bpFilter.frequency.exponentialRampToValueAtTime(680, now + 0.18);
                bpFilter.Q.setValueAtTime(14, now);
                const ringGain = ctx.createGain();
                ringGain.gain.setValueAtTime(isCrit ? 0.65 : 0.45, now);
                ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
                ringSrc.connect(bpFilter);
                bpFilter.connect(ringGain);
                ringGain.connect(out);
                ringSrc.start(now);
                ringSrc.stop(now + 0.24);
                voice.add(ringSrc, bpFilter, ringGain);
            }

            const harmOsc = ctx.createOscillator();
            const harmGain = ctx.createGain();
            harmOsc.type = 'sine';
            harmOsc.frequency.setValueAtTime(2640, now);
            harmGain.gain.setValueAtTime(isCrit ? 0.35 : 0.20, now);
            harmGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);
            harmOsc.connect(harmGain);
            harmGain.connect(out);
            harmOsc.start(now);
            harmOsc.stop(now + 0.22);
            voice.add(harmOsc, harmGain);

            if (noiseBuf) {
                const cleaveSrc = ctx.createBufferSource();
                cleaveSrc.buffer = noiseBuf;
                const cleaveFilter = ctx.createBiquadFilter();
                cleaveFilter.type = 'highpass';
                cleaveFilter.frequency.setValueAtTime(950, now);
                const cleaveGain = ctx.createGain();
                cleaveGain.gain.setValueAtTime(isCrit ? 0.55 : 0.38, now);
                cleaveGain.gain.exponentialRampToValueAtTime(0.0001, now + (isCrit ? 0.08 : 0.05));
                cleaveSrc.connect(cleaveFilter);
                cleaveFilter.connect(cleaveGain);
                cleaveGain.connect(out);
                cleaveSrc.start(now);
                cleaveSrc.stop(now + 0.10);
                voice.add(cleaveSrc, cleaveFilter, cleaveGain);
            }

            if (isCrit) {
                const critSteel = ctx.createOscillator();
                const critSteelGain = ctx.createGain();
                critSteel.type = 'sine';
                critSteel.frequency.setValueAtTime(3100, now);
                critSteelGain.gain.setValueAtTime(0.35, now);
                critSteelGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
                critSteel.connect(critSteelGain);
                critSteelGain.connect(out);
                critSteel.start(now);
                critSteel.stop(now + 0.40);
                voice.add(critSteel, critSteelGain);
            }
        }
    }

    /**
     * Sharp metallic pickaxe-on-granite anvil clang followed by stone rubble noise cascade
     * @param {number} pan Spatial pan [-0.95, 0.95]
     */
    playDiggingStrike(pan = 0) {
        if (this.playPoolSample('digging', 1.0, 0.92, pan, 0.28)) return;

        const duration = 0.38;
        const voice = this._createVoice(duration, pan);
        if (!voice) return;
        const { ctx, now, out } = voice;
        const noiseBuf = this.getNoiseBuffer(1.0);

        // 1. Pickaxe-on-granite anvil clang: 1980Hz + 2870Hz inharmonic FM bell transient decaying over 0.22s
        const carrier = ctx.createOscillator();
        const carrierGain = ctx.createGain();
        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(1980, now);
        carrierGain.gain.setValueAtTime(0.55, now);
        carrierGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        mod.type = 'sine';
        mod.frequency.setValueAtTime(2870, now);
        modGain.gain.setValueAtTime(520, now);
        modGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        mod.connect(carrier.frequency);

        const chime = ctx.createOscillator();
        const chimeGain = ctx.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(2870, now);
        chimeGain.gain.setValueAtTime(0.28, now);
        chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);

        carrier.connect(carrierGain);
        carrierGain.connect(out);
        chime.connect(chimeGain);
        chimeGain.connect(out);

        carrier.start(now);
        carrier.stop(now + 0.23);
        mod.start(now);
        mod.stop(now + 0.23);
        chime.start(now);
        chime.stop(now + 0.23);
        voice.add(carrier, carrierGain, mod, modGain, chime, chimeGain);

        // 2. 60ms-delayed cascade of 3 crumbling stone rubble noise grains (450Hz..900Hz bandpass)
        if (noiseBuf) {
            const grains = [
                { delay: 0.060, duration: 0.045, freq: 520, q: 3.2, gain: 0.35 },
                { delay: 0.095, duration: 0.050, freq: 780, q: 3.5, gain: 0.30 },
                { delay: 0.140, duration: 0.065, freq: 640, q: 2.8, gain: 0.25 }
            ];

            grains.forEach(g => {
                const gStart = now + g.delay;
                const gStop = gStart + g.duration;
                const gSrc = ctx.createBufferSource();
                gSrc.buffer = noiseBuf;
                const gFilter = ctx.createBiquadFilter();
                gFilter.type = 'bandpass';
                gFilter.frequency.setValueAtTime(g.freq, gStart);
                gFilter.Q.setValueAtTime(g.q, gStart);
                const gGain = ctx.createGain();
                gGain.gain.setValueAtTime(0.0001, gStart);
                gGain.gain.linearRampToValueAtTime(g.gain, gStart + 0.008);
                gGain.gain.exponentialRampToValueAtTime(0.0001, gStop);
                gSrc.connect(gFilter);
                gFilter.connect(gGain);
                gGain.connect(out);
                gSrc.start(gStart);
                gSrc.stop(gStop + 0.01);
                voice.add(gSrc, gFilter, gGain);
            });
        }
    }

    /**
     * Bowstring pluck ('loose') and shaft thud with iron arrowhead bite ('impact')
     * @param {string} stage 'loose' | 'impact'
     * @param {number} pan Spatial pan [-0.95, 0.95]
     */
    playArrowLooseAndImpact(stage = 'loose', pan = 0) {
        if (stage !== 'impact') {
            if (this.playPoolSample('bow_loose', 1.0, 0.92, pan, 0.20)) return;
        } else {
            if (this.playPoolSample('bow_impact', 1.0, 0.92, pan, 0.22)) return;
        }

        const isLoose = stage !== 'impact';
        const duration = isLoose ? 0.25 : 0.22;
        const voice = this._createVoice(duration, pan);
        if (!voice) return;
        const { ctx, now, out } = voice;
        const noiseBuf = this.getNoiseBuffer(1.0);

        if (isLoose) {
            // Loose: Taut bowstring pluck (165Hz -> 95Hz triangle) + high-speed air whoosh (1200Hz -> 2400Hz bandpass noise)
            const pluck = ctx.createOscillator();
            const pluckGain = ctx.createGain();
            pluck.type = 'triangle';
            pluck.frequency.setValueAtTime(165, now);
            pluck.frequency.exponentialRampToValueAtTime(95, now + 0.12);
            pluckGain.gain.setValueAtTime(0.70, now);
            pluckGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
            pluck.connect(pluckGain);
            pluckGain.connect(out);
            pluck.start(now);
            pluck.stop(now + 0.15);
            voice.add(pluck, pluckGain);

            if (noiseBuf) {
                const whooshSrc = ctx.createBufferSource();
                whooshSrc.buffer = noiseBuf;
                const bpFilter = ctx.createBiquadFilter();
                bpFilter.type = 'bandpass';
                bpFilter.frequency.setValueAtTime(1200, now);
                bpFilter.frequency.exponentialRampToValueAtTime(2400, now + 0.15);
                bpFilter.Q.setValueAtTime(2.2, now);
                const whooshGain = ctx.createGain();
                whooshGain.gain.setValueAtTime(0.0001, now);
                whooshGain.gain.linearRampToValueAtTime(0.48, now + 0.04);
                whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
                whooshSrc.connect(bpFilter);
                bpFilter.connect(whooshGain);
                whooshGain.connect(out);
                whooshSrc.start(now);
                whooshSrc.stop(now + 0.20);
                voice.add(whooshSrc, bpFilter, whooshGain);
            }
        } else {
            // Impact: Crisp wooden shaft thud (240Hz -> 65Hz) + iron arrowhead bite (1600Hz)
            const thud = ctx.createOscillator();
            const thudGain = ctx.createGain();
            thud.type = 'triangle';
            thud.frequency.setValueAtTime(240, now);
            thud.frequency.exponentialRampToValueAtTime(65, now + 0.10);
            thudGain.gain.setValueAtTime(0.75, now);
            thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
            thud.connect(thudGain);
            thudGain.connect(out);
            thud.start(now);
            thud.stop(now + 0.13);
            voice.add(thud, thudGain);

            const bite = ctx.createOscillator();
            const biteGain = ctx.createGain();
            bite.type = 'sine';
            bite.frequency.setValueAtTime(1600, now);
            biteGain.gain.setValueAtTime(0.45, now);
            biteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
            bite.connect(biteGain);
            biteGain.connect(out);
            bite.start(now);
            bite.stop(now + 0.06);
            voice.add(bite, biteGain);

            if (noiseBuf) {
                const biteNoise = ctx.createBufferSource();
                biteNoise.buffer = noiseBuf;
                const bpFilter = ctx.createBiquadFilter();
                bpFilter.type = 'bandpass';
                bpFilter.frequency.setValueAtTime(1600, now);
                bpFilter.Q.setValueAtTime(4.0, now);
                const nGain = ctx.createGain();
                nGain.gain.setValueAtTime(0.40, now);
                nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
                biteNoise.connect(bpFilter);
                bpFilter.connect(nGain);
                nGain.connect(out);
                biteNoise.start(now);
                biteNoise.stop(now + 0.05);
                voice.add(biteNoise, bpFilter, nGain);
            }
        }
    }

    /**
     * Spinning glass whoosh ('throw') and crystalline shatter with alchemical sizzle ('shatter')
     * @param {string} stage 'throw' | 'shatter'
     * @param {number} pan Spatial pan [-0.95, 0.95]
     */
    playPotionThrowAndShatter(stage = 'throw', pan = 0) {
        if (stage === 'throw') {
            if (this.playPoolSample('potionThrow', 1.05, 0.82, pan, 0.16)) return;
        } else {
            if (this.playPoolSample('potionShatter', 1.0, 0.95, pan, 0.28)) return;
        }

        const isThrow = stage === 'throw';
        const duration = isThrow ? 0.32 : 0.48;
        const voice = this._createVoice(duration, pan);
        if (!voice) return;
        const { ctx, now, out } = voice;
        const noiseBuf = this.getNoiseBuffer(1.0);

        if (isThrow) {
            // Throw: Spinning glass whoosh (600Hz -> 1100Hz bandpass sweep)
            if (noiseBuf) {
                const whooshSrc = ctx.createBufferSource();
                whooshSrc.buffer = noiseBuf;
                const bpFilter = ctx.createBiquadFilter();
                bpFilter.type = 'bandpass';
                bpFilter.frequency.setValueAtTime(600, now);
                bpFilter.frequency.exponentialRampToValueAtTime(1100, now + 0.24);
                bpFilter.Q.setValueAtTime(3.0, now);
                const whooshGain = ctx.createGain();
                whooshGain.gain.setValueAtTime(0.0001, now);
                whooshGain.gain.linearRampToValueAtTime(0.50, now + 0.10);
                whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
                whooshSrc.connect(bpFilter);
                bpFilter.connect(whooshGain);
                whooshGain.connect(out);
                whooshSrc.start(now);
                whooshSrc.stop(now + 0.30);
                voice.add(whooshSrc, bpFilter, whooshGain);
            }
        } else {
            // Shatter: 4 staggered pings (3200Hz, 4100Hz, 4900Hz, 5600Hz) + highpass noise burst + bubbling alchemical sizzle (900Hz -> 1800Hz)
            const pings = [
                { delay: 0.000, freq: 3200, decay: 0.14, gain: 0.40 },
                { delay: 0.012, freq: 4100, decay: 0.12, gain: 0.35 },
                { delay: 0.024, freq: 4900, decay: 0.10, gain: 0.30 },
                { delay: 0.038, freq: 5600, decay: 0.09, gain: 0.25 }
            ];

            pings.forEach(p => {
                const pStart = now + p.delay;
                const pOsc = ctx.createOscillator();
                const pGain = ctx.createGain();
                pOsc.type = 'sine';
                pOsc.frequency.setValueAtTime(p.freq, pStart);
                pGain.gain.setValueAtTime(p.gain, pStart);
                pGain.gain.exponentialRampToValueAtTime(0.0001, pStart + p.decay);
                pOsc.connect(pGain);
                pGain.connect(out);
                pOsc.start(pStart);
                pOsc.stop(pStart + p.decay + 0.01);
                voice.add(pOsc, pGain);
            });

            if (noiseBuf) {
                const burstSrc = ctx.createBufferSource();
                burstSrc.buffer = noiseBuf;
                const hpFilter = ctx.createBiquadFilter();
                hpFilter.type = 'highpass';
                hpFilter.frequency.setValueAtTime(3200, now);
                const burstGain = ctx.createGain();
                burstGain.gain.setValueAtTime(0.65, now);
                burstGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
                burstSrc.connect(hpFilter);
                hpFilter.connect(burstGain);
                burstGain.connect(out);
                burstSrc.start(now);
                burstSrc.stop(now + 0.09);
                voice.add(burstSrc, hpFilter, burstGain);

                const sizzleSrc = ctx.createBufferSource();
                sizzleSrc.buffer = noiseBuf;
                const sizzleFilter = ctx.createBiquadFilter();
                sizzleFilter.type = 'bandpass';
                sizzleFilter.frequency.setValueAtTime(900, now + 0.04);
                sizzleFilter.frequency.exponentialRampToValueAtTime(1800, now + 0.38);
                sizzleFilter.Q.setValueAtTime(2.5, now + 0.04);
                const sizzleGain = ctx.createGain();
                sizzleGain.gain.setValueAtTime(0.0001, now);
                sizzleGain.gain.setValueAtTime(0.35, now + 0.05);
                sizzleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
                sizzleSrc.connect(sizzleFilter);
                sizzleFilter.connect(sizzleGain);
                sizzleGain.connect(out);
                sizzleSrc.start(now + 0.04);
                sizzleSrc.stop(now + 0.44);
                voice.add(sizzleSrc, sizzleFilter, sizzleGain);
            }
        }
    }

    /**
     * High-voltage electrostatic snap and rolling low-frequency thunder rumble
     * @param {number} pan Spatial pan [-0.95, 0.95]
     */
    playLightningCrack(pan = 0) {
        if (this.playPoolSample('spell_lightning', 1.0, 1.0, pan, 0.35)) return;

        const duration = 0.65;
        const voice = this._createVoice(duration, pan);
        if (!voice) return;
        const { ctx, now, out } = voice;
        const noiseBuf = this.getNoiseBuffer(1.0);

        // 1. High-voltage electrostatic snap (white noise through 2800Hz highpass)
        if (noiseBuf) {
            const snapSrc = ctx.createBufferSource();
            snapSrc.buffer = noiseBuf;
            const hpFilter = ctx.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.setValueAtTime(2800, now);
            const snapGain = ctx.createGain();
            snapGain.gain.setValueAtTime(0.85, now);
            snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
            snapSrc.connect(hpFilter);
            hpFilter.connect(snapGain);
            snapGain.connect(out);
            snapSrc.start(now);
            snapSrc.stop(now + 0.07);
            voice.add(snapSrc, hpFilter, snapGain);
        }

        // 2. Jagged sawtooth crackle (880Hz -> 120Hz)
        const crackle = ctx.createOscillator();
        const crackleGain = ctx.createGain();
        crackle.type = 'sawtooth';
        crackle.frequency.setValueAtTime(880, now);
        crackle.frequency.exponentialRampToValueAtTime(120, now + 0.08);
        crackleGain.gain.setValueAtTime(0.70, now);
        crackleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
        crackle.connect(crackleGain);
        crackleGain.connect(out);
        crackle.start(now);
        crackle.stop(now + 0.09);
        voice.add(crackle, crackleGain);

        // 3. Rolling low-frequency thunder rumble (95Hz -> 28Hz over 0.55s)
        const rumble = ctx.createOscillator();
        const rumbleGain = ctx.createGain();
        rumble.type = 'sine';
        rumble.frequency.setValueAtTime(95, now);
        rumble.frequency.exponentialRampToValueAtTime(28, now + 0.55);
        rumbleGain.gain.setValueAtTime(0.75, now);
        rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
        rumble.connect(rumbleGain);
        rumbleGain.connect(out);
        rumble.start(now);
        rumble.stop(now + 0.60);
        voice.add(rumble, rumbleGain);

        if (noiseBuf) {
            const rumbleNoise = ctx.createBufferSource();
            rumbleNoise.buffer = noiseBuf;
            const lpFilter = ctx.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.setValueAtTime(120, now);
            const rNoiseGain = ctx.createGain();
            rNoiseGain.gain.setValueAtTime(0.50, now);
            rNoiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
            rumbleNoise.connect(lpFilter);
            lpFilter.connect(rNoiseGain);
            rNoiseGain.connect(out);
            rumbleNoise.start(now);
            rumbleNoise.stop(now + 0.57);
            voice.add(rumbleNoise, lpFilter, rNoiseGain);
        }
    }

    /**
     * Whooshing ignition swell, explosive bass boom, and flame turbulence (+ dragon roar if breath)
     * @param {boolean} isBreath Dragon breath attack layer
     * @param {number} pan Spatial pan [-0.95, 0.95]
     */
    playFireballDetonation(isBreath = false, pan = 0) {
        if (isBreath) {
            if (this.playPoolSample('breath', 0.92, 1.05, pan, 0.38)) {
                this.playPoolSample('monster_dragon', 0.88, 0.85, pan, 0.35);
                return;
            }
        } else {
            if (this.playPoolSample('spell_fire', 1.0, 0.98, pan, 0.34)) return;
        }

        const duration = isBreath ? 0.80 : 0.65;
        const voice = this._createVoice(duration, pan);
        if (!voice) return;
        const { ctx, now, out } = voice;
        const noiseBuf = this.getNoiseBuffer(1.0);

        // 1. Whooshing ignition swell (220Hz -> 640Hz)
        const swell = ctx.createOscillator();
        const swellGain = ctx.createGain();
        swell.type = 'sine';
        swell.frequency.setValueAtTime(220, now);
        swellGain.gain.setValueAtTime(0.0001, now);
        swell.frequency.exponentialRampToValueAtTime(640, now + 0.08);
        swellGain.gain.linearRampToValueAtTime(0.55, now + 0.08);
        swellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        swell.connect(swellGain);
        swellGain.connect(out);
        swell.start(now);
        swell.stop(now + 0.15);
        voice.add(swell, swellGain);

        // 2. Deep explosive bass boom (110Hz -> 24Hz over 0.5s)
        const boom = ctx.createOscillator();
        const boomGain = ctx.createGain();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(110, now + 0.07);
        boom.frequency.exponentialRampToValueAtTime(24, now + 0.57);
        boomGain.gain.setValueAtTime(0.0001, now);
        boomGain.gain.setValueAtTime(0.90, now + 0.08);
        boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
        boom.connect(boomGain);
        boomGain.connect(out);
        boom.start(now + 0.07);
        boom.stop(now + 0.60);
        voice.add(boom, boomGain);

        // 3. Roaring flame turbulence (modulated lowpass noise 380Hz..1100Hz)
        if (noiseBuf) {
            const flameSrc = ctx.createBufferSource();
            flameSrc.buffer = noiseBuf;
            const flameFilter = ctx.createBiquadFilter();
            flameFilter.type = 'lowpass';
            flameFilter.frequency.setValueAtTime(380, now);
            flameFilter.frequency.linearRampToValueAtTime(1100, now + 0.20);
            flameFilter.frequency.exponentialRampToValueAtTime(380, now + 0.55);
            flameFilter.Q.setValueAtTime(1.8, now);
            const flameGain = ctx.createGain();
            flameGain.gain.setValueAtTime(0.0001, now);
            flameGain.gain.linearRampToValueAtTime(0.65, now + 0.10);
            flameGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
            flameSrc.connect(flameFilter);
            flameFilter.connect(flameGain);
            flameGain.connect(out);
            flameSrc.start(now);
            flameSrc.stop(now + 0.60);
            voice.add(flameSrc, flameFilter, flameGain);
        }

        // 4. If isBreath, layer deep guttural dragon roar (85Hz -> 52Hz sawtooth + sub-octave growl)
        if (isBreath) {
            const roar = ctx.createOscillator();
            const roarGain = ctx.createGain();
            const roarFilter = ctx.createBiquadFilter();
            roar.type = 'sawtooth';
            roar.frequency.setValueAtTime(85, now + 0.06);
            roar.frequency.exponentialRampToValueAtTime(52, now + 0.65);
            roarFilter.type = 'lowpass';
            roarFilter.frequency.setValueAtTime(280, now + 0.06);
            roarGain.gain.setValueAtTime(0.0001, now);
            roarGain.gain.setValueAtTime(0.60, now + 0.08);
            roarGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);
            roar.connect(roarFilter);
            roarFilter.connect(roarGain);
            roarGain.connect(out);
            roar.start(now + 0.06);
            roar.stop(now + 0.70);
            voice.add(roar, roarFilter, roarGain);

            const growl = ctx.createOscillator();
            const growlGain = ctx.createGain();
            growl.type = 'sawtooth';
            growl.frequency.setValueAtTime(42, now + 0.08);
            growl.frequency.exponentialRampToValueAtTime(26, now + 0.65);
            growlGain.gain.setValueAtTime(0.0001, now);
            growlGain.gain.setValueAtTime(0.45, now + 0.10);
            growlGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
            growl.connect(growlGain);
            growlGain.connect(out);
            growl.start(now + 0.08);
            growl.stop(now + 0.68);
            voice.add(growl, growlGain);
        }
    }

    /**
     * Resonant runic magic aura for scrolls, staves/wands/rods, and divine prayers/heals
     * @param {string} kind 'scroll' | 'staff' | 'wand' | 'rod' | 'prayer' | 'heal'
     * @param {number} pan Spatial pan [-0.95, 0.95]
     */
    playRunicAura(kind = 'scroll', pan = 0) {
        const k = String(kind || 'scroll').toLowerCase();
        let poolKey = 'scroll';
        if (k.includes('potion') || k.includes('quaff')) {
            poolKey = 'quaff';
        } else if (k.includes('pray') || k.includes('holy') || k.includes('heal') || k.includes('celestial')) {
            poolKey = 'prayer';
        } else if (k.includes('staff') || k.includes('wand') || k.includes('rod')) {
            poolKey = 'staff';
        }

        if (this.playPoolSample(poolKey, 1.0, 0.35, pan, 0.12)) {
            return;
        }

        const duration = (k === 'prayer' || k === 'heal' || k === 'holy' || k === 'celestial') ? 0.36 : (k.includes('staff') || k.includes('wand') || k.includes('rod') ? 0.55 : 0.45);
        const voice = this._createVoice(duration, pan);
        if (!voice) return;
        const { ctx, now, out } = voice;
        const noiseBuf = this.getNoiseBuffer(1.0);

        if (k.includes('staff') || k.includes('wand') || k.includes('rod')) {
            // Arcane capacitor hum: warm low-mid chord (264Hz + 396Hz + 528Hz) with gentle vibrato
            const freqs = [264, 396, 528];
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.frequency.setValueAtTime(5.0, now);
            lfoGain.gain.setValueAtTime(6.0, now);
            lfo.connect(lfoGain);

            freqs.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now);
                lfoGain.connect(osc.frequency);

                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.linearRampToValueAtTime(0.18 / (idx + 1), now + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.50);

                osc.connect(gain);
                gain.connect(out);
                osc.start(now);
                osc.stop(now + 0.52);
                voice.add(osc, gain);
            });

            lfo.start(now);
            lfo.stop(now + 0.52);
            voice.add(lfo, lfoGain);
        } else if (k === 'prayer' || k === 'heal' || k === 'holy' || k === 'celestial') {
            // Warm, unobtrusive low-register restorative acoustic pad (A3 220Hz + E4 330Hz, zero high bells)
            const rootOsc = ctx.createOscillator();
            const rootGain = ctx.createGain();
            rootOsc.type = 'sine';
            rootOsc.frequency.setValueAtTime(220.0, now);
            rootGain.gain.setValueAtTime(0.0001, now);
            rootGain.gain.linearRampToValueAtTime(0.16, now + 0.02);
            rootGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
            rootOsc.connect(rootGain);
            rootGain.connect(out);
            rootOsc.start(now);
            rootOsc.stop(now + 0.35);
            voice.add(rootOsc, rootGain);

            const fifthOsc = ctx.createOscillator();
            const fifthGain = ctx.createGain();
            fifthOsc.type = 'sine';
            fifthOsc.frequency.setValueAtTime(330.0, now);
            fifthGain.gain.setValueAtTime(0.0001, now);
            fifthGain.gain.linearRampToValueAtTime(0.10, now + 0.025);
            fifthGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
            fifthOsc.connect(fifthGain);
            fifthGain.connect(out);
            fifthOsc.start(now);
            fifthOsc.stop(now + 0.34);
            voice.add(fifthOsc, fifthGain);
        } else {
            // Scroll: Crisp parchment unfurl noise (1400Hz bandpass) + warm mystical triad chord (440Hz + 554.37Hz + 659.25Hz)
            if (noiseBuf) {
                const unfurlSrc = ctx.createBufferSource();
                unfurlSrc.buffer = noiseBuf;
                const bpFilter = ctx.createBiquadFilter();
                bpFilter.type = 'bandpass';
                bpFilter.frequency.setValueAtTime(1400, now);
                bpFilter.Q.setValueAtTime(2.2, now);
                const unfurlGain = ctx.createGain();
                unfurlGain.gain.setValueAtTime(0.0001, now);
                unfurlGain.gain.linearRampToValueAtTime(0.45, now + 0.035);
                unfurlGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
                unfurlSrc.connect(bpFilter);
                bpFilter.connect(unfurlGain);
                unfurlGain.connect(out);
                unfurlSrc.start(now);
                unfurlSrc.stop(now + 0.20);
                voice.add(unfurlSrc, bpFilter, unfurlGain);
            }

            const triad = [220.00, 277.18, 329.63];
            triad.forEach(f => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, now);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
                osc.connect(gain);
                gain.connect(out);
                osc.start(now);
                osc.stop(now + 0.40);
                voice.add(osc, gain);
            });
        }
    }

    // --- WS29: Diegetic Dark-Fantasy & Realm-Specific Procedural Foley ---
    playParchmentTurn(pan = 0.0) {
        if (!this.enabled) return;
        this.unlock();
        if (!this.ctx || typeof this.ctx.createBiquadFilter !== 'function') {
            this.playMenuNav();
            return;
        }
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const noiseBuf = this._getNoiseBuffer ? this._getNoiseBuffer(0.16) : null;
        if (!noiseBuf) {
            this.playMenuNav();
            return;
        }
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1150, now);
        filter.frequency.exponentialRampToValueAtTime(820, now + 0.14);
        filter.Q.setValueAtTime(2.4, now);
        const gain = ctx.createGain();
        const vol = Math.max(0.01, this.masterVolume * this.sfxVolume * 0.28);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain || ctx.destination);
        src.start(now);
        src.stop(now + 0.16);
    }

    playIronLatch(pan = 0.0) {
        if (!this.enabled) return;
        this.unlock();
        if (!this.ctx || typeof this.ctx.createOscillator !== 'function') return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const vol = Math.max(0.01, this.masterVolume * this.sfxVolume * 0.22);
        [185, 640].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = idx === 0 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.65, now + 0.075);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(vol * (idx === 0 ? 1.0 : 0.45), now + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
            osc.connect(gain);
            gain.connect(this.masterGain || ctx.destination);
            osc.start(now);
            osc.stop(now + 0.085);
        });
    }

    playAnvilStrike(pan = 0.0) {
        if (!this.enabled) return;
        this.unlock();
        if (!this.ctx || typeof this.ctx.createOscillator !== 'function') return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const vol = Math.max(0.01, this.masterVolume * this.sfxVolume * 0.25);
        [880, 1320, 2640].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(vol / (idx + 1), now + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 / (idx + 1));
            osc.connect(gain);
            gain.connect(this.masterGain || ctx.destination);
            osc.start(now);
            osc.stop(now + 0.46);
        });
    }

    playHarpChord(pan = 0.0) {
        if (!this.enabled) return;
        this.unlock();
        if (!this.ctx || typeof this.ctx.createOscillator !== 'function') return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const vol = Math.max(0.01, this.masterVolume * this.sfxVolume * 0.16);
        [293.66, 369.99, 440.00, 587.33].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.035;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(vol, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
            osc.connect(gain);
            gain.connect(this.masterGain || ctx.destination);
            osc.start(start);
            osc.stop(start + 0.44);
        });
    }

    playTrumpSnap(pan = 0.0) {
        if (!this.enabled) return;
        this.unlock();
        if (!this.ctx || typeof this.ctx.createOscillator !== 'function') return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const vol = Math.max(0.01, this.masterVolume * this.sfxVolume * 0.18);
        [528.0, 1056.0].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = idx === 0 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.18);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(vol * (idx === 0 ? 1.0 : 0.5), now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
            osc.connect(gain);
            gain.connect(this.masterGain || ctx.destination);
            osc.start(now);
            osc.stop(now + 0.20);
        });
    }

    playKotoPluck(pan = 0.0) {
        if (!this.enabled) return;
        this.unlock();
        if (!this.ctx || typeof this.ctx.createOscillator !== 'function') return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const vol = Math.max(0.01, this.masterVolume * this.sfxVolume * 0.20);
        [329.63, 493.88].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + idx * 0.04;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq * 1.02, start);
            osc.frequency.exponentialRampToValueAtTime(freq, start + 0.03);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(vol, start + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
            osc.connect(gain);
            gain.connect(this.masterGain || ctx.destination);
            osc.start(start);
            osc.stop(start + 0.34);
        });
    }
}

const SoundManager = SoundEngine;

if (typeof window !== 'undefined') {
    window.SoundEngine = SoundEngine;
    window.SoundManager = SoundEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SoundEngine;
    module.exports.SoundEngine = SoundEngine;
    module.exports.SoundManager = SoundEngine;
}

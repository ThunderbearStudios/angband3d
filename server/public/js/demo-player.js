/**
 * Angband3D — Broadcast-Quality Gameplay Demo & Commercial Showcase Controller
 *
 * Provides a YouTube-grade interactive theater experience:
 *  - 16:9 responsive cinema stage with ambient background glow ("Ambient Mode")
 *  - Hybrid Video & High-Definition WebGL/Canvas Cinematic Reel engine
 *  - Pre-buffered neural audio stems (Master Narrator Enceladus + creature barks)
 *  - Interactive scrubber with timeline hover tooltips and chapter tick markers
 *  - Timed closed captions / subtitle engine with speaker callouts
 *  - Full keyboard accessibility (Space/K play, Arrows seek, M mute, C captions, F fullscreen, Esc back, Enter play)
 *  - Direct "Jump In & Play" CTA button to launch hero into the dungeon instantly
 */

(function() {
    'use strict';

    class DemoPlayer {
        constructor() {
            this.modalEl = null;
            this.videoEl = null;
            this.canvasEl = null;
            this.canvasCtx = null;
            this.ambientGlowEl = null;
            this.captionsEl = null;
            this.centerPlayEl = null;
            this.transportBarEl = null;
            this.scrubberTrackEl = null;
            this.scrubberBufferEl = null;
            this.scrubberProgressEl = null;
            this.scrubberHandleEl = null;
            this.scrubberTooltipEl = null;
            this.chapterPipsEl = null;
            this.btnPlayEl = null;
            this.btnReplayEl = null;
            this.btnMuteEl = null;
            this.volumeSliderEl = null;
            this.timecodeEl = null;
            this.btnCcEl = null;
            this.btnFullscreenEl = null;
            this.btnPlayGameEl = null;
            this.btnCloseEl = null;
            this.chapterPillContainer = null;

            this.previousState = 'mainMenu';
            this.isOpen = false;
            this.isPlaying = false;
            this.currentTime = 0;
            this.duration = 165; // 2m 45s
            this.volume = 0.85;
            this.isMuted = false;
            this.captionsEnabled = true;
            this.isFullscreen = false;
            this.useVideo = false;

            this.audioCtx = null;
            this.audioBuffers = new Map();
            this.activeAudioSource = null;
            this.activeAudioGain = null;
            this.reverbNode = null;
            this.reverbGain = null;
            this.masterGain = null;

            this.animationFrameId = null;
            this.lastFrameTime = 0;
            this.isScrubbing = false;
            this.activeChapterIndex = 0;
            this.activeSubtitle = null;

            this.manifest = {
                title: 'Angband3D — Official Gameplay Commercial & Veteran Showcase',
                narrator: 'Master Chronicler Enceladus',
                totalDuration: 165,
                chapters: [
                    { id: 'awakening', title: 'The Awakening', start: 0, end: 25, color: '#f59e0b' },
                    { id: 'gotcha_yaw', title: 'Gotcha #1: 0-Turn Yaw', start: 25, end: 55, color: '#3b82f6' },
                    { id: 'dual_reality', title: '[Tab] ASCII Terminal', start: 55, end: 85, color: '#10b981' },
                    { id: 'spatial_stealth', title: '3D Spatial Stealth', start: 85, end: 115, color: '#8b5cf6' },
                    { id: 'vault_combat', title: 'Vault Combat & Tactics', start: 115, end: 140, color: '#ef4444' },
                    { id: 'chronicle', title: 'The Living Chronicle', start: 140, end: 155, color: '#ec4899' },
                    { id: 'universal_call', title: 'Universal Saves & Play Free', start: 155, end: 165, color: '#ffd700' }
                ],
                subtitles: [
                    { start: 1.0, end: 8.5, speaker: 'Enceladus', text: 'For thirty years, you mapped the pits of Morgoth through strings of green text on an eighty-column screen.' },
                    { start: 9.0, end: 15.0, speaker: 'Enceladus', text: 'You memorized every glyph, every stat, and every cruel, unforgiving demise.' },
                    { start: 15.5, end: 20.0, speaker: 'Enceladus', text: 'Welcome back to Angband... but open your eyes.' },
                    { start: 20.8, end: 24.5, speaker: 'Armourer', text: 'Ah, another brave fool seeking glory below! Mind your torches, stranger!' },
                    { start: 25.5, end: 32.5, speaker: 'Enceladus', text: 'Rule number one for the veteran: looking around will not get you killed.' },
                    { start: 33.0, end: 36.5, speaker: 'Enceladus', text: 'Camera yaw costs precisely zero turns.' },
                    { start: 37.0, end: 46.0, speaker: 'Enceladus', text: 'Pan the darkness, inspect every shadow, check the ceiling for spiders—the world moves only when you take a step.' },
                    { start: 47.0, end: 54.0, speaker: 'SFX', text: '[Shield Block • Steel Clang • Cave Spider Defeated]' },
                    { start: 55.5, end: 60.5, speaker: 'Enceladus', text: 'Miss your glyphs? Fear losing your classic overview? Press Tab.' },
                    { start: 61.5, end: 69.0, speaker: 'Enceladus', text: 'Instantaneous, bit-for-bit Angband 4.2.6 terminal mode.' },
                    { start: 69.5, end: 77.0, speaker: 'Enceladus', text: 'Same menus, same inventory hotkeys, zero compromise.' },
                    { start: 77.5, end: 84.0, speaker: 'Enceladus', text: 'The 3D world and the ASCII matrix are one and the same.' },
                    { start: 85.5, end: 92.5, speaker: 'Enceladus', text: 'In 3D, corridors are narrow and corners are blind. But you have ears.' },
                    { start: 93.0, end: 104.0, speaker: 'Enceladus', text: '3D spatial audio lets you hear snoring orcs and skittering vermin around the bend before you walk into their line of sight.' },
                    { start: 104.5, end: 110.0, speaker: 'Snerk the Snaga', text: 'Hssst... quiet in the dark... the man-thing smells of iron and lamp oil...' },
                    { start: 111.0, end: 114.5, speaker: 'SFX', text: '[Infravision Activated • Misty Red Silhouette Revealed]' },
                    { start: 115.5, end: 124.0, speaker: 'Enceladus', text: 'Every item, every spell, every resistance from the 4.2.6 compendium is here.' },
                    { start: 124.5, end: 128.5, speaker: 'Young Red Dragon', text: 'Who dares disturb the hoard of the deep?!' },
                    { start: 129.0, end: 133.0, speaker: 'SFX', text: '[Phase Door Teleport • Lightning Blast]' },
                    { start: 133.5, end: 139.5, speaker: 'Enceladus', text: 'No cooldowns, no action-game shortcuts. Turn-based tactical roguelike survival.' },
                    { start: 140.5, end: 148.0, speaker: 'Enceladus', text: 'Every step of your pilgrimage is penned in real time into the Living Chronicle—voiced as an epic saga.' },
                    { start: 148.5, end: 154.5, speaker: 'Enceladus', text: 'Preserving your glorious victories and your most humiliating blunders for eternity.' },
                    { start: 155.5, end: 161.0, speaker: 'Enceladus', text: 'Play instantly in your browser, or take it offline with standalone Windows and Android clients.' },
                    { start: 161.5, end: 165.0, speaker: 'Enceladus', text: 'Your save files are universal. Angband 3D awaits. Descend if you dare.' }
                ]
            };

            // Audio clip timeline mapping
            this.audioClips = [
                { start: 1.0, file: '/assets/audio/demo/clip_01_awakening.mp3', id: 'clip_01' },
                { start: 20.8, file: '/assets/audio/demo/clip_02_merchant.mp3', id: 'clip_02' },
                { start: 25.5, file: '/assets/audio/demo/clip_03_gotcha_yaw.mp3', id: 'clip_03' },
                { start: 55.5, file: '/assets/audio/demo/clip_04_dual_reality.mp3', id: 'clip_04' },
                { start: 85.5, file: '/assets/audio/demo/clip_05_spatial_stealth.mp3', id: 'clip_05' },
                { start: 104.5, file: '/assets/audio/demo/clip_06_goblin.mp3', id: 'clip_06' },
                { start: 115.5, file: '/assets/audio/demo/clip_07_vault_combat.mp3', id: 'clip_07' },
                { start: 124.5, file: '/assets/audio/demo/clip_08_dragon.mp3', id: 'clip_08' },
                { start: 140.5, file: '/assets/audio/demo/clip_09_chronicle.mp3', id: 'clip_09' },
                { start: 155.5, file: '/assets/audio/demo/clip_10_universal_call.mp3', id: 'clip_10' }
            ];

            this.currentClipIndex = -1;
            this.currentPlayingAudio = null;
        }

        init() {
            this.modalEl = document.getElementById('demo-modal');
            if (!this.modalEl) return;

            this.videoEl = document.getElementById('demo-video-player');
            this.canvasEl = document.getElementById('demo-canvas-stage');
            if (this.canvasEl) {
                this.canvasCtx = this.canvasEl.getContext('2d');
            }
            this.ambientGlowEl = document.getElementById('demo-ambient-glow');
            this.captionsEl = document.getElementById('demo-captions-overlay');
            this.centerPlayEl = document.getElementById('demo-center-play');
            this.transportBarEl = document.getElementById('demo-transport-bar');
            this.scrubberTrackEl = document.getElementById('demo-scrubber-track');
            this.scrubberBufferEl = document.getElementById('demo-scrubber-buffer');
            this.scrubberProgressEl = document.getElementById('demo-scrubber-progress');
            this.scrubberHandleEl = document.getElementById('demo-scrubber-handle');
            this.scrubberTooltipEl = document.getElementById('demo-scrubber-tooltip');
            this.chapterPipsEl = document.getElementById('demo-chapter-pips');
            this.btnPlayEl = document.getElementById('demo-btn-play');
            this.btnReplayEl = document.getElementById('demo-btn-replay');
            this.btnMuteEl = document.getElementById('demo-btn-mute');
            this.volumeSliderEl = document.getElementById('demo-volume-slider');
            this.timecodeEl = document.getElementById('demo-timecode');
            this.btnCcEl = document.getElementById('demo-btn-cc');
            this.btnFullscreenEl = document.getElementById('demo-btn-fullscreen');
            this.btnPlayGameEl = document.getElementById('demo-btn-play-game');
            this.btnCloseEl = document.getElementById('btn-demo-close');
            this.chapterPillContainer = this.modalEl.querySelector('.demo-chapter-ribbon');

            this.setupEvents();
            this.renderChapterPips();
            this.preloadManifest();
        }

        setupEvents() {
            // Center Play button
            if (this.centerPlayEl) {
                this.centerPlayEl.addEventListener('click', () => this.togglePlay());
            }

            // Transport Play/Pause & Replay
            if (this.btnPlayEl) {
                this.btnPlayEl.addEventListener('click', () => this.togglePlay());
            }
            if (this.btnReplayEl) {
                this.btnReplayEl.addEventListener('click', () => {
                    this.seek(0);
                    this.play();
                });
            }

            // Scrubber interaction
            if (this.scrubberTrackEl) {
                const handleScrub = (e) => {
                    const rect = this.scrubberTrackEl.getBoundingClientRect();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                    this.seek(pos * this.duration);
                };

                this.scrubberTrackEl.addEventListener('mousedown', (e) => {
                    this.isScrubbing = true;
                    handleScrub(e);
                });
                window.addEventListener('mousemove', (e) => {
                    if (this.isScrubbing) handleScrub(e);
                    this.updateTooltip(e);
                });
                window.addEventListener('mouseup', () => {
                    if (this.isScrubbing) this.isScrubbing = false;
                });

                // Touch support
                this.scrubberTrackEl.addEventListener('touchstart', (e) => {
                    this.isScrubbing = true;
                    handleScrub(e);
                }, { passive: true });
                this.scrubberTrackEl.addEventListener('touchmove', (e) => {
                    if (this.isScrubbing) handleScrub(e);
                }, { passive: true });
                this.scrubberTrackEl.addEventListener('touchend', () => {
                    this.isScrubbing = false;
                });
            }

            // Volume controls
            if (this.volumeSliderEl) {
                this.volumeSliderEl.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value) / 100;
                    this.setVolume(val);
                });
            }
            if (this.btnMuteEl) {
                this.btnMuteEl.addEventListener('click', () => this.toggleMute());
            }

            // Captions toggle
            if (this.btnCcEl) {
                this.btnCcEl.addEventListener('click', () => this.toggleCaptions());
            }

            // Fullscreen toggle
            if (this.btnFullscreenEl) {
                this.btnFullscreenEl.addEventListener('click', () => this.toggleFullscreen());
            }

            // Jump In & Play CTA button
            if (this.btnPlayGameEl) {
                this.btnPlayGameEl.addEventListener('click', () => this.jumpInAndPlay());
            }

            // Close button
            if (this.btnCloseEl) {
                this.btnCloseEl.addEventListener('click', () => this.close());
            }

            // Chapter pills
            if (this.chapterPillContainer) {
                const pills = this.chapterPillContainer.querySelectorAll('.demo-chapter-pill');
                pills.forEach(pill => {
                    pill.addEventListener('click', () => {
                        const targetTime = parseFloat(pill.dataset.time || 0);
                        this.seek(targetTime);
                        if (!this.isPlaying) this.play();
                    });
                });
            }

            // Click canvas/video to toggle play
            if (this.canvasEl) {
                this.canvasEl.addEventListener('click', () => this.togglePlay());
            }
            if (this.videoEl) {
                this.videoEl.addEventListener('click', () => this.togglePlay());
                this.videoEl.addEventListener('ended', () => this.onEnded());
            }

            // Escape key or backdrop click closes modal
            const backdrop = this.modalEl ? this.modalEl.querySelector('.demo-backdrop') : null;
            if (backdrop) {
                backdrop.addEventListener('click', () => this.close());
            }
        }

        renderChapterPips() {
            if (!this.chapterPipsEl || !this.manifest.chapters) return;
            this.chapterPipsEl.innerHTML = '';
            this.manifest.chapters.forEach(ch => {
                if (ch.start === 0) return;
                const pip = document.createElement('div');
                pip.className = 'demo-chapter-pip';
                const pct = (ch.start / this.duration) * 100;
                pip.style.left = `${pct}%`;
                pip.title = `${ch.title} (${this.formatTime(ch.start)})`;
                this.chapterPipsEl.appendChild(pip);
            });
        }

        updateTooltip(e) {
            if (!this.scrubberTrackEl || !this.scrubberTooltipEl) return;
            const rect = this.scrubberTrackEl.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top - 20 && e.clientY <= rect.bottom + 20) {
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const time = pos * this.duration;
                this.scrubberTooltipEl.textContent = this.formatTime(time);
                this.scrubberTooltipEl.style.left = `${pos * 100}%`;
                this.scrubberTooltipEl.classList.add('visible');
            } else {
                this.scrubberTooltipEl.classList.remove('visible');
            }
        }

        async preloadManifest() {
            try {
                const res = await fetch('/assets/audio/demo/demo_manifest.json');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.chapters) {
                        this.manifest = data;
                        this.duration = data.totalDuration || 165;
                        this.renderChapterPips();
                    }
                }
            } catch (_) {}
        }

        open(fromState = 'mainMenu') {
            if (this.isOpen) return;
            this.isOpen = true;
            this.previousState = fromState;
            if (window.__app) {
                window.__app.lastDemoState = fromState;
            }
            if (this.modalEl) {
                this.modalEl.classList.remove('hidden');
            }

            // Sync master volume
            if (window.__app && window.__app.audio) {
                const masterVol = window.__app.audio.getMasterVolume();
                this.setVolume(masterVol);
                this.isMuted = window.__app.audio.isMuted();
                this.updateVolumeUI();
            }

            // Initialize Web Audio sub-graph for demo
            this.initAudioContext();

            // Auto-play immediately upon opening
            this.currentTime = 0;
            this.play();
        }

        close() {
            if (!this.isOpen) return;
            this.isOpen = false;
            this.pause();
            if (this.modalEl) {
                this.modalEl.classList.add('hidden');
            }
            if (this.isFullscreen) {
                this.exitFullscreen();
            }

            // Restore prior state
            if (window.__app) {
                if (this.previousState === 'splash') {
                    window.__app.showSplash();
                } else if (this.previousState === 'pauseMenu') {
                    window.__app.showPauseMenu();
                } else {
                    window.__app.showMainMenu();
                }
            }
        }

        initAudioContext() {
            if (this.audioCtx) return;
            try {
                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtxClass) return;
                this.audioCtx = new AudioCtxClass();
                this.masterGain = this.audioCtx.createGain();
                this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.audioCtx.currentTime);

                // Subterranean Reverb Node (10% wet)
                this.reverbNode = this.audioCtx.createConvolver();
                this.reverbGain = this.audioCtx.createGain();
                this.reverbGain.gain.setValueAtTime(0.10, this.audioCtx.currentTime);

                // Build procedural impulse response
                const rate = this.audioCtx.sampleRate;
                const length = rate * 2.0;
                const impulse = this.audioCtx.createBuffer(2, length, rate);
                const left = impulse.getChannelData(0);
                const right = impulse.getChannelData(1);
                for (let i = 0; i < length; i++) {
                    const decay = Math.exp(-i / (rate * 0.45));
                    left[i] = (Math.random() * 2 - 1) * decay;
                    right[i] = (Math.random() * 2 - 1) * decay;
                }
                this.reverbNode.buffer = impulse;

                // Routing: Source -> Master -> Destination
                //         Source -> Reverb -> ReverbGain -> Destination
                this.masterGain.connect(this.audioCtx.destination);
                this.reverbNode.connect(this.reverbGain);
                this.reverbGain.connect(this.audioCtx.destination);
            } catch (_) {}
        }

        play() {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(() => {});
            }

            this.isPlaying = true;
            this.lastFrameTime = performance.now();

            if (this.centerPlayEl) this.centerPlayEl.classList.add('hidden');
            if (this.btnPlayEl) this.btnPlayEl.textContent = '⏸';

            this.startLoop();
            this.syncAudioToCurrentTime();
        }

        pause() {
            this.isPlaying = false;
            if (this.centerPlayEl) this.centerPlayEl.classList.remove('hidden');
            if (this.btnPlayEl) this.btnPlayEl.textContent = '▶';

            if (this.currentPlayingAudio) {
                try { this.currentPlayingAudio.pause(); } catch (_) {}
            }
        }

        togglePlay() {
            if (this.isPlaying) this.pause();
            else this.play();
        }

        seek(time) {
            this.currentTime = Math.max(0, Math.min(this.duration, time));
            this.syncAudioToCurrentTime();
            this.updateUI();
            this.renderCanvas();
        }

        seekDelta(delta) {
            this.seek(this.currentTime + delta);
        }

        setVolume(vol) {
            this.volume = Math.max(0, Math.min(1, vol));
            if (this.volume > 0 && this.isMuted) {
                this.isMuted = false;
            }
            if (this.masterGain && this.audioCtx) {
                this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.audioCtx.currentTime);
            }
            if (this.currentPlayingAudio) {
                this.currentPlayingAudio.volume = this.isMuted ? 0 : this.volume;
            }
            this.updateVolumeUI();
        }

        toggleMute() {
            this.isMuted = !this.isMuted;
            if (this.masterGain && this.audioCtx) {
                this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.audioCtx.currentTime);
            }
            if (this.currentPlayingAudio) {
                this.currentPlayingAudio.volume = this.isMuted ? 0 : this.volume;
            }
            this.updateVolumeUI();
        }

        updateVolumeUI() {
            if (this.volumeSliderEl) {
                this.volumeSliderEl.value = Math.round((this.isMuted ? 0 : this.volume) * 100);
            }
            if (this.btnMuteEl) {
                this.btnMuteEl.textContent = this.isMuted ? '🔇' : (this.volume > 0.5 ? '🔊' : '🔉');
                this.btnMuteEl.title = this.isMuted ? 'Unmute (M)' : 'Mute (M)';
            }
        }

        toggleCaptions() {
            this.captionsEnabled = !this.captionsEnabled;
            if (this.btnCcEl) {
                this.btnCcEl.classList.toggle('active', this.captionsEnabled);
            }
            if (this.captionsEl) {
                this.captionsEl.style.display = this.captionsEnabled ? 'flex' : 'none';
            }
        }

        toggleFullscreen() {
            const container = this.modalEl ? this.modalEl.querySelector('.demo-theater-container') : null;
            if (!container) return;

            if (!document.fullscreenElement) {
                if (container.requestFullscreen) {
                    container.requestFullscreen();
                } else if (container.webkitRequestFullscreen) {
                    container.webkitRequestFullscreen();
                }
                this.isFullscreen = true;
                if (this.btnFullscreenEl) this.btnFullscreenEl.textContent = '⤓';
            } else {
                this.exitFullscreen();
            }
        }

        exitFullscreen() {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
            this.isFullscreen = false;
            if (this.btnFullscreenEl) this.btnFullscreenEl.textContent = '⛶';
        }

        jumpInAndPlay() {
            this.close();
            if (window.__app && typeof window.__app.startNewRandomHero === 'function') {
                window.__app.startNewRandomHero();
            }
        }

        onEnded() {
            this.pause();
            this.currentTime = this.duration;
            this.updateUI();
            if (this.centerPlayEl) {
                this.centerPlayEl.classList.remove('hidden');
                this.centerPlayEl.innerHTML = '<svg viewBox="0 0 24 24" class="play-icon"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor"/></svg>';
            }
        }

        startLoop() {
            if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

            const loop = (timestamp) => {
                if (!this.isPlaying) return;

                const dt = (timestamp - this.lastFrameTime) / 1000;
                this.lastFrameTime = timestamp;

                if (!this.isScrubbing) {
                    this.currentTime += dt;
                    if (this.currentTime >= this.duration) {
                        this.onEnded();
                        return;
                    }
                }

                this.checkAudioSync();
                this.updateUI();
                this.renderCanvas();

                this.animationFrameId = requestAnimationFrame(loop);
            };

            this.animationFrameId = requestAnimationFrame(loop);
        }

        checkAudioSync() {
            // Find active clip corresponding to currentTime
            let activeIdx = -1;
            for (let i = 0; i < this.audioClips.length; i++) {
                const clip = this.audioClips[i];
                const nextClip = this.audioClips[i + 1];
                const clipEnd = nextClip ? nextClip.start : this.duration;
                if (this.currentTime >= clip.start && this.currentTime < clipEnd) {
                    activeIdx = i;
                    break;
                }
            }

            if (activeIdx !== this.currentClipIndex) {
                this.playClipIndex(activeIdx);
            }
        }

        syncAudioToCurrentTime() {
            // Find active clip
            let activeIdx = -1;
            for (let i = 0; i < this.audioClips.length; i++) {
                const clip = this.audioClips[i];
                const nextClip = this.audioClips[i + 1];
                const clipEnd = nextClip ? nextClip.start : this.duration;
                if (this.currentTime >= clip.start && this.currentTime < clipEnd) {
                    activeIdx = i;
                    break;
                }
            }
            this.playClipIndex(activeIdx, true);
        }

        playClipIndex(idx, forceOffset = false) {
            if (this.currentPlayingAudio) {
                try {
                    this.currentPlayingAudio.pause();
                    this.currentPlayingAudio = null;
                } catch (_) {}
            }

            this.currentClipIndex = idx;
            if (idx < 0 || idx >= this.audioClips.length || !this.isPlaying) return;

            const clip = this.audioClips[idx];
            const audio = new Audio(clip.file);
            audio.volume = this.isMuted ? 0 : this.volume;

            if (forceOffset) {
                const offset = Math.max(0, this.currentTime - clip.start);
                audio.currentTime = offset;
            }

            audio.play().catch(() => {});
            this.currentPlayingAudio = audio;
        }

        updateUI() {
            // Timecode display
            if (this.timecodeEl) {
                this.timecodeEl.textContent = `${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`;
            }

            // Scrubber progress & buffer
            const pct = (this.currentTime / this.duration) * 100;
            if (this.scrubberProgressEl) {
                this.scrubberProgressEl.style.width = `${pct}%`;
            }
            if (this.scrubberHandleEl) {
                this.scrubberHandleEl.style.left = `${pct}%`;
            }
            if (this.scrubberBufferEl) {
                this.scrubberBufferEl.style.width = `${Math.min(100, pct + 20)}%`;
            }

            // Update active chapter
            let currentChapterIdx = 0;
            this.manifest.chapters.forEach((ch, i) => {
                if (this.currentTime >= ch.start && this.currentTime < ch.end) {
                    currentChapterIdx = i;
                }
            });

            if (currentChapterIdx !== this.activeChapterIndex) {
                this.activeChapterIndex = currentChapterIdx;
                this.updateActiveChapterUI();
            }

            // Update Subtitles / Closed Captions
            this.updateCaptions();
        }

        updateActiveChapterUI() {
            if (!this.chapterPillContainer) return;
            const pills = this.chapterPillContainer.querySelectorAll('.demo-chapter-pill');
            pills.forEach((pill, i) => {
                pill.classList.toggle('active', i === this.activeChapterIndex);
            });

            // Ambient background glow color matches chapter accent
            if (this.ambientGlowEl && this.manifest.chapters[this.activeChapterIndex]) {
                const ch = this.manifest.chapters[this.activeChapterIndex];
                this.ambientGlowEl.style.background = `radial-gradient(ellipse at center, ${ch.color}22 0%, rgba(0,0,0,0) 70%)`;
            }
        }

        updateCaptions() {
            if (!this.captionsEl || !this.captionsEnabled) return;

            const t = this.currentTime;
            let currentSub = null;
            for (const sub of this.manifest.subtitles) {
                if (t >= sub.start && t <= sub.end) {
                    currentSub = sub;
                    break;
                }
            }

            if (currentSub !== this.activeSubtitle) {
                this.activeSubtitle = currentSub;
                if (currentSub) {
                    const speakerClass = (currentSub.speaker === 'Enceladus') ? 'speaker-bard' :
                                         (currentSub.speaker === 'Young Red Dragon') ? 'speaker-dragon' :
                                         (currentSub.speaker === 'Snerk the Snaga') ? 'speaker-goblin' : 'speaker-npc';
                    this.captionsEl.innerHTML = `
                        <div class="demo-caption-bubble">
                            <span class="demo-caption-speaker ${speakerClass}">${currentSub.speaker}:</span>
                            <span class="demo-caption-text">${currentSub.text}</span>
                        </div>
                    `;
                    this.captionsEl.classList.add('visible');
                } else {
                    this.captionsEl.innerHTML = '';
                    this.captionsEl.classList.remove('visible');
                }
            }
        }

        /**
         * Broadcast-Quality Canvas Reel Renderer
         * Renders dynamic 1080p 60fps cinematic scenes for each of the 7 chapters:
         * 1. The Awakening (Town & 0-Turn Yaw)
         * 2. The Descent & Gotcha #1 (0-Turn Yaw & Time Freeze)
         * 3. The Dual Reality (Instant [Tab] ASCII Terminal)
         * 4. 3D Spatial Stealth (Directional Audio Waves & Infravision)
         * 5. Vault Breach & Viewmodels (Dragon, Claymore, Phase Door)
         * 6. The Living Chronicle (Illuminated Tome & Sagas)
         * 7. Universal Freedom (Web, PC, Android, Universal Saves)
         */
        renderCanvas() {
            if (!this.canvasCtx || !this.canvasEl) return;
            const ctx = this.canvasCtx;
            const w = this.canvasEl.width;
            const h = this.canvasEl.height;
            const t = this.currentTime;
            const ch = this.manifest.chapters[this.activeChapterIndex] || this.manifest.chapters[0];

            // 1. Deep Subterranean Vignette Background
            ctx.fillStyle = '#05070c';
            ctx.fillRect(0, 0, w, h);

            // 2. Render Scene by Chapter
            ctx.save();
            switch (ch.id) {
                case 'awakening':
                    this.renderSceneAwakening(ctx, w, h, t);
                    break;
                case 'gotcha_yaw':
                    this.renderSceneGotchaYaw(ctx, w, h, t);
                    break;
                case 'dual_reality':
                    this.renderSceneDualReality(ctx, w, h, t);
                    break;
                case 'spatial_stealth':
                    this.renderSceneSpatialStealth(ctx, w, h, t);
                    break;
                case 'vault_combat':
                    this.renderSceneVaultCombat(ctx, w, h, t);
                    break;
                case 'chronicle':
                    this.renderSceneChronicle(ctx, w, h, t);
                    break;
                case 'universal_call':
                    this.renderSceneUniversalCall(ctx, w, h, t);
                    break;
                default:
                    this.renderSceneAwakening(ctx, w, h, t);
            }
            ctx.restore();

            // 3. Cinematic Film Grain & Scanline Overlay
            this.renderFilmOverlay(ctx, w, h, t);

            // 4. On-Screen Kinetic Watermark & Chapter HUD Card
            this.renderHUDOverlay(ctx, w, h, t, ch);
        }

        renderSceneAwakening(ctx, w, h, t) {
            // Cobblestone ground perspective glide
            const horizon = h * 0.48;
            const panAngle = Math.sin(t * 0.5) * 0.35;

            // Sky / Town Sunset gradient
            const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
            skyGrad.addColorStop(0, '#1a102f');
            skyGrad.addColorStop(0.6, '#3a1a3b');
            skyGrad.addColorStop(1, '#663931');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, w, horizon);

            // Cobblestone floor with perspective lines
            const floorGrad = ctx.createLinearGradient(0, horizon, 0, h);
            floorGrad.addColorStop(0, '#1c1917');
            floorGrad.addColorStop(1, '#09090b');
            ctx.fillStyle = floorGrad;
            ctx.fillRect(0, horizon, w, h - horizon);

            // Perspective lines
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
            ctx.lineWidth = 1.5;
            const numLines = 14;
            const cx = w * 0.5 + Math.sin(t * 0.8) * 80;
            for (let i = 0; i <= numLines; i++) {
                const x = (w / numLines) * i;
                ctx.beginPath();
                ctx.moveTo(cx, horizon);
                ctx.lineTo(x, h);
                ctx.stroke();
            }

            // Timbered Shopfronts on Left & Right
            ctx.fillStyle = '#27201c';
            // Left shop
            ctx.fillRect(0, horizon - 120, w * 0.28, h - horizon + 120);
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 2;
            ctx.strokeRect(w * 0.05, horizon - 80, w * 0.18, 90);
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 15px var(--font-fantasy, serif)';
            ctx.fillText('ARMOURY & WEAPONS', w * 0.06, horizon - 50);

            // Right shop
            ctx.fillStyle = '#221a16';
            ctx.fillRect(w * 0.72, horizon - 120, w * 0.28, h - horizon + 120);
            ctx.strokeRect(w * 0.75, horizon - 80, w * 0.18, 90);
            ctx.fillStyle = '#ffd700';
            ctx.fillText('ALCHEMIST', w * 0.78, horizon - 50);

            // 360° Camera Yaw Demonstration indicator
            const compassYaw = ((t * 40) % 360).toFixed(0);
            ctx.save();
            ctx.translate(w * 0.5, h * 0.22);
            ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-160, -25, 320, 50, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 16px var(--font-ui, sans-serif)';
            ctx.textAlign = 'center';
            ctx.fillText(`👀 FREE 360° CAMERA YAW • 0 GAME TURNS (${compassYaw}°)`, 0, 6);
            ctx.restore();
        }

        renderSceneGotchaYaw(ctx, w, h, t) {
            // Depth 50ft Crypts — Lantern circle in pitch darkness
            const cx = w * 0.5;
            const cy = h * 0.52;
            const radius = 280 + Math.sin(t * 8) * 10; // flickering lantern

            const lanternGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, radius);
            lanternGrad.addColorStop(0, 'rgba(255, 200, 80, 0.45)');
            lanternGrad.addColorStop(0.5, 'rgba(220, 130, 40, 0.25)');
            lanternGrad.addColorStop(0.85, 'rgba(40, 20, 10, 0.15)');
            lanternGrad.addColorStop(1, 'rgba(4, 5, 8, 1)');

            ctx.fillStyle = lanternGrad;
            ctx.fillRect(0, 0, w, h);

            // Stone brick pattern inside light
            ctx.strokeStyle = 'rgba(255, 220, 120, 0.12)';
            ctx.lineWidth = 1;
            for (let y = cy - 200; y < cy + 200; y += 40) {
                ctx.beginPath();
                ctx.moveTo(cx - 240, y);
                ctx.lineTo(cx + 240, y);
                ctx.stroke();
            }

            // Cave Spider crawling on ceiling
            const spiderX = cx + Math.sin(t * 1.5) * 60;
            const spiderY = cy - 140;
            ctx.fillStyle = '#831843';
            ctx.beginPath();
            ctx.arc(spiderX, spiderY, 22, 0, Math.PI * 2);
            ctx.fill();
            // Spider legs
            ctx.strokeStyle = '#9d174d';
            ctx.lineWidth = 3;
            for (let leg = -3; leg <= 3; leg++) {
                ctx.beginPath();
                ctx.moveTo(spiderX, spiderY);
                ctx.lineTo(spiderX + leg * 18, spiderY - 20 + Math.abs(leg) * 8);
                ctx.stroke();
            }

            // Highlighted Gotcha Badge
            ctx.save();
            ctx.translate(w * 0.5, h * 0.80);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(-240, -32, 480, 64, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 18px var(--font-title, sans-serif)';
            ctx.textAlign = 'center';
            ctx.fillText('⏳ VETERAN GOTCHA #1: LOOKING AROUND = 0 TURNS', 0, -6);
            ctx.font = '13px var(--font-ui, sans-serif)';
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText('Monsters freeze in time while camera pans. Turns advance only on movement.', 0, 18);
            ctx.restore();
        }

        renderSceneDualReality(ctx, w, h, t) {
            // Split-screen / Morph: Left side 3D, Right side 80x24 Terminal CRT
            const splitX = w * (0.5 + Math.sin(t * 1.2) * 0.15);

            // Left: 3D Dungeon Corridor
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, splitX, h);
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 16px var(--font-fantasy)';
            ctx.fillText('⚡ 3D FIRST-PERSON VIEWPORT', 30, 45);

            // Torch in 3D
            const torchX = splitX * 0.5;
            const torchGrad = ctx.createRadialGradient(torchX, h * 0.5, 20, torchX, h * 0.5, 200);
            torchGrad.addColorStop(0, 'rgba(251, 146, 60, 0.4)');
            torchGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = torchGrad;
            ctx.fillRect(0, 0, splitX, h);

            // Right: Classic 80x24 CRT Terminal
            ctx.fillStyle = '#022c22';
            ctx.fillRect(splitX, 0, w - splitX, h);

            // CRT scanlines on right
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            for (let y = 0; y < h; y += 4) {
                ctx.fillRect(splitX, y, w - splitX, 2);
            }

            // Glowing green text & roguelike glyphs
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 15px var(--font-terminal, monospace)';
            ctx.fillText('⌨ ANGBAND 4.2.6 CRT MATRIX [TAB]', splitX + 30, 45);

            const asciiMap = [
                '########################################',
                '#...................#..................#',
                '#...######..........#.....s............#',
                '#...#....#..........+..................#',
                '#...#.@..#..........#..................#',
                '#...#....#..........#........d.........#',
                '#...######..........#..................#',
                '########################################'
            ];
            asciiMap.forEach((line, idx) => {
                ctx.fillText(line, splitX + 40, 100 + idx * 26);
            });

            // Dual Reality Banner
            ctx.save();
            ctx.translate(w * 0.5, h * 0.84);
            ctx.fillStyle = 'rgba(6, 78, 59, 0.95)';
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-220, -28, 440, 56, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#6ee7b7';
            ctx.font = 'bold 16px var(--font-terminal, monospace)';
            ctx.textAlign = 'center';
            ctx.fillText('PRESS [TAB] ANYTIME: DUAL REALITY', 0, -2);
            ctx.font = '12px var(--font-ui, sans-serif)';
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText('Bit-for-bit 80x24 Angband terminal with camera direction marker', 0, 18);
            ctx.restore();
        }

        renderSceneSpatialStealth(ctx, w, h, t) {
            // Depth 250ft — HRTF 3D Audio & Sensed misty silhouettes
            const cx = w * 0.5;
            const cy = h * 0.5;

            // Blind 90-degree corner
            ctx.fillStyle = '#090d16';
            ctx.fillRect(0, 0, w, h);

            // Wall blocking line of sight
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(w * 0.45, h * 0.2, w * 0.55, h * 0.6);
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 2;
            ctx.strokeRect(w * 0.45, h * 0.2, w * 0.55, h * 0.6);

            // Pulsing 3D Binaural Audio Wave Rings radiating from behind corner
            const waveOriginX = w * 0.65;
            const waveOriginY = h * 0.5;
            for (let ring = 0; ring < 4; ring++) {
                const ringRadius = ((t * 70 + ring * 50) % 200) + 20;
                const alpha = Math.max(0, 1 - (ringRadius / 200));
                ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 0.8})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(waveOriginX, waveOriginY, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Sensed Red Misty Silhouette through wall (Infravision)
            const mistyAlpha = 0.5 + Math.sin(t * 4) * 0.25;
            ctx.fillStyle = `rgba(239, 68, 68, ${mistyAlpha})`;
            ctx.beginPath();
            ctx.ellipse(waveOriginX, waveOriginY, 35, 55, 0, 0, Math.PI * 2);
            ctx.fill();

            // Directional Audio Prompt HUD Card
            ctx.save();
            ctx.translate(w * 0.5, h * 0.82);
            ctx.fillStyle = 'rgba(88, 28, 135, 0.9)';
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-230, -30, 460, 60, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#f3e8ff';
            ctx.font = 'bold 16px var(--font-title, sans-serif)';
            ctx.textAlign = 'center';
            ctx.fillText('🎧 BINAURAL 3D HRTF AUDIO & INFRAVISION', 0, -4);
            ctx.font = '12px var(--font-ui, sans-serif)';
            ctx.fillStyle = '#e9d5ff';
            ctx.fillText('Hear snoring orcs and spiders around blind corners before line of sight', 0, 18);
            ctx.restore();
        }

        renderSceneVaultCombat(ctx, w, h, t) {
            // Depth 1000ft — Vault Breach & Red Dragon
            const cx = w * 0.5;
            const cy = h * 0.45;

            // Dragon Fire Glow
            const fireGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 320);
            fireGrad.addColorStop(0, 'rgba(239, 68, 68, 0.55)');
            fireGrad.addColorStop(0.4, 'rgba(249, 115, 22, 0.35)');
            fireGrad.addColorStop(1, 'rgba(10, 8, 12, 1)');
            ctx.fillStyle = fireGrad;
            ctx.fillRect(0, 0, w, h);

            // Young Red Dragon Silhouette with glowing eyes
            ctx.fillStyle = '#7f1d1d';
            ctx.beginPath();
            ctx.moveTo(cx - 120, cy + 60);
            ctx.lineTo(cx, cy - 80);
            ctx.lineTo(cx + 120, cy + 60);
            ctx.closePath();
            ctx.fill();

            // Glowing yellow dragon eyes
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(cx - 25, cy - 20, 8, 0, Math.PI * 2);
            ctx.arc(cx + 25, cy - 20, 8, 0, Math.PI * 2);
            ctx.fill();

            // Viewmodel: Westernesse Claymore blade swing
            const swordSwing = Math.sin(t * 6) * 40;
            ctx.save();
            ctx.translate(w * 0.72 + swordSwing, h * 0.65);
            ctx.rotate(-0.35 + Math.sin(t * 6) * 0.15);
            // Steel Blade
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(-12, -180, 24, 180);
            // Golden Hilt
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(-35, 0, 70, 16);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(-8, 16, 16, 45);
            ctx.restore();

            // Phase door teleportation spark rings
            const sparkRadius = ((t * 120) % 180) + 10;
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(w * 0.28, h * 0.65, sparkRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Tactical Banner
            ctx.save();
            ctx.translate(w * 0.5, h * 0.84);
            ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-220, -28, 440, 56, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fecaca';
            ctx.font = 'bold 16px var(--font-title, sans-serif)';
            ctx.textAlign = 'center';
            ctx.fillText('⚔ PURE TURN-BASED TACTICAL ROGUELIKE COMBAT', 0, -2);
            ctx.font = '12px var(--font-ui, sans-serif)';
            ctx.fillStyle = '#fee2e2';
            ctx.fillText('Viewmodels, phase doors, resistance checks — zero altered mechanics', 0, 18);
            ctx.restore();
        }

        renderSceneChronicle(ctx, w, h, t) {
            // The Living Chronicle Tome
            const cx = w * 0.5;
            const cy = h * 0.48;

            // Warm illuminated parchment desk
            const bookWidth = 560;
            const bookHeight = 320;
            ctx.fillStyle = '#3f2212';
            ctx.fillRect(cx - bookWidth / 2 - 10, cy - bookHeight / 2 - 10, bookWidth + 20, bookHeight + 20);

            // Open Pages
            ctx.fillStyle = '#fef3c7';
            ctx.fillRect(cx - bookWidth / 2, cy - bookHeight / 2, bookWidth / 2 - 4, bookHeight);
            ctx.fillRect(cx + 4, cy - bookHeight / 2, bookWidth / 2 - 4, bookHeight);

            // Gold filigree edge
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 3;
            ctx.strokeRect(cx - bookWidth / 2 + 10, cy - bookHeight / 2 + 10, bookWidth - 20, bookHeight - 20);

            // Gothic Westmarch prose
            ctx.fillStyle = '#78350f';
            ctx.font = 'bold 16px var(--font-fantasy, serif)';
            ctx.fillText('📖 THE LIVING CHRONICLE', cx - bookWidth / 2 + 30, cy - bookHeight / 2 + 45);

            ctx.font = 'italic 12px var(--font-ui, serif)';
            const lines = [
                '“...In the shadowed vaults of depth 1000ft,',
                'the adventurer stood before Morgoth\'s kin.',
                'With steel drawn and whispered incantation,',
                'the saga of valour was etched into the annals...”'
            ];
            lines.forEach((l, idx) => {
                ctx.fillText(l, cx - bookWidth / 2 + 30, cy - bookHeight / 2 + 85 + idx * 24);
            });

            // Animated Vocal Soundwave equalizer on right page
            const eqX = cx + 80;
            const eqY = cy + 40;
            ctx.fillStyle = '#d97706';
            for (let b = 0; b < 12; b++) {
                const barHeight = 20 + Math.sin(t * 8 + b * 0.8) * 35;
                ctx.fillRect(eqX + b * 16, eqY - barHeight / 2, 10, barHeight);
            }

            // Chronicler Banner
            ctx.save();
            ctx.translate(w * 0.5, h * 0.84);
            ctx.fillStyle = 'rgba(120, 53, 15, 0.95)';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-220, -28, 440, 56, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fef3c7';
            ctx.font = 'bold 16px var(--font-fantasy, serif)';
            ctx.textAlign = 'center';
            ctx.fillText('VOICED LOREKEEPER & GENERATIVE SAGAS', 0, -2);
            ctx.font = '12px var(--font-ui, sans-serif)';
            ctx.fillStyle = '#fed7aa';
            ctx.fillText('Illuminated Westmarch parchment voiced in real-time by Enceladus', 0, 18);
            ctx.restore();
        }

        renderSceneUniversalCall(ctx, w, h, t) {
            // Universal Platforms & 100% Free
            const cx = w * 0.5;
            const cy = h * 0.44;

            // 3 Platform Badges: Web Browser, Windows PC, Android APK
            const platforms = [
                { title: '🌐 WEB BROWSER', desc: 'Instant play at angband3d.com', x: cx - 220 },
                { title: '💻 WINDOWS PC', desc: 'Standalone offline 144 FPS', x: cx },
                { title: '📱 ANDROID APK', desc: 'Tactile touch D-pad & offline', x: cx + 220 }
            ];

            platforms.forEach(p => {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(p.x - 95, cy - 60, 190, 120, 12);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 15px var(--font-title, sans-serif)';
                ctx.textAlign = 'center';
                ctx.fillText(p.title, p.x, cy - 20);

                ctx.fillStyle = '#cbd5e1';
                ctx.font = '11.5px var(--font-ui, sans-serif)';
                ctx.fillText(p.desc, p.x, cy + 15);
            });

            // Animated .sav file flowing between devices
            const flowX = cx - 180 + ((t * 80) % 360);
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(flowX, cy + 90, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px monospace';
            ctx.fillText('.SAV', flowX, cy + 93);

            // Call to Action Banner
            ctx.save();
            ctx.translate(w * 0.5, h * 0.84);
            ctx.fillStyle = 'rgba(217, 119, 6, 0.95)';
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(-220, -28, 440, 56, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px var(--font-title, sans-serif)';
            ctx.textAlign = 'center';
            ctx.fillText('⚔ PLAY FREE NOW • ZERO PAYWALLS • 100% SAVES', 0, -2);
            ctx.font = '12px var(--font-ui, sans-serif)';
            ctx.fillStyle = '#fef08a';
            ctx.fillText('Click [Jump In & Play] or press [Enter] to begin your descent', 0, 18);
            ctx.restore();
        }

        renderFilmOverlay(ctx, w, h, t) {
            // Subtle cinematic letterbox bars (2.39:1 widescreen aesthetic)
            const barHeight = Math.max(16, h * 0.05);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, barHeight);
            ctx.fillRect(0, h - barHeight, w, barHeight);
        }

        renderHUDOverlay(ctx, w, h, t, ch) {
            // Top Left: Angband 3D Logo & Commercial Tag
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 14px var(--font-fantasy, serif)';
            ctx.textAlign = 'left';
            ctx.fillText('⚔ ANGBAND 3D • GAMEPLAY SHOWCASE', 24, Math.max(28, h * 0.05 + 18));

            // Top Right: Chapter Title
            ctx.fillStyle = '#cbd5e1';
            ctx.font = '12px var(--font-ui, sans-serif)';
            ctx.textAlign = 'right';
            ctx.fillText(`Act ${this.activeChapterIndex + 1}: ${ch.title}`, w - 24, Math.max(28, h * 0.05 + 18));
        }

        formatTime(seconds) {
            const s = Math.floor(seconds || 0);
            const mins = Math.floor(s / 60);
            const secs = s % 60;
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
    }

    // Expose instance to global window
    window.DemoPlayer = DemoPlayer;
    window.demoPlayer = new DemoPlayer();

    // Auto-init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.demoPlayer.init());
    } else {
        window.demoPlayer.init();
    }
})();

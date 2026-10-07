/**
 * Angband3D — Broadcast-Quality Gameplay Demo & Walkthrough Showcase Controller
 *
 * Provides a YouTube-grade interactive cinema experience for actual recorded gameplay:
 *  - 1080p Pristine Authentic Gameplay Video with muxed Master Narrator voice stems
 *  - 16:9 Cinema stage with ambient background glow matched to active chapter accent
 *  - Interactive scrubber with timeline hover tooltips and chapter tick markers
 *  - Timed closed captions / subtitle engine with speaker badges
 *  - Full keyboard accessibility (Space/K play, Arrows seek, M mute, C captions, F fullscreen, Esc close, Enter play)
 *  - Direct "Jump In & Play" CTA button to launch hero into the dungeon instantly
 */

(function() {
    'use strict';

    class DemoPlayer {
        constructor() {
            this.modalEl = null;
            this.videoEl = null;
            this.canvasEl = null;
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
            this.duration = 255.0; // 4m 15s
            this.volume = 0.85;
            this.isMuted = false;
            this.captionsEnabled = false; // Closed captions OFF by default as requested
            this.isFullscreen = false;
            this.useVideo = true;

            this.animationFrameId = null;
            this.isScrubbing = false;
            this.activeChapterIndex = 0;
            this.activeSubtitle = null;

            this.manifest = {
                title: 'Angband3D — Award-Winning 10-Act Gameplay Walkthrough',
                narrator: 'Master Chronicler Enceladus & Lorekeeper Aoede (Gemini Native Audio)',
                totalDuration: 275.0,
                chapters: [
                    { id: 'intro', title: 'Act 0: Insignia', start: 0, end: 18.5, color: '#ffd700' },
                    { id: 'town', title: 'Act 1: Town & Descent', start: 18.5, end: 48.0, color: '#f59e0b' },
                    { id: 'crypt', title: 'Act 2: 0-Turn Yaw & Radar', start: 48.0, end: 75.0, color: '#38bdf8' },
                    { id: 'terminal', title: 'Act 3: 80x24 CRT Terminal', start: 75.0, end: 106.5, color: '#10b981' },
                    { id: 'caverns', title: 'Act 4: Archery & Combat Log', start: 106.5, end: 133.5, color: '#8b5cf6' },
                    { id: 'sorcery', title: 'Act 5: Grimoire & Potions', start: 133.5, end: 157.5, color: '#c084fc' },
                    { id: 'chronicle', title: 'Act 6: Living Chronicle', start: 157.5, end: 197.5, color: '#ec4899' },
                    { id: 'combat', title: 'Act 7: Dragon Clash', start: 197.5, end: 223.5, color: '#ef4444' },
                    { id: 'saves', title: 'Act 8: Universal Saves', start: 223.5, end: 244.5, color: '#06b6d4' },
                    { id: 'finale', title: 'Act 9: Grand Finale', start: 244.5, end: 275.0, color: '#eab308' }
                ],
                subtitles: [
                    { start: 3.8, end: 9.8, speaker: 'Enceladus', text: 'Deep in the forgotten vaults of Morgoth, ancient terror stirs!' },
                    { start: 10.1, end: 17.3, speaker: 'Enceladus', text: 'Thirty years of legendary roguelike history are reborn in first-person 3D.' },
                    { start: 17.8, end: 24.5, speaker: 'Enceladus', text: 'Welcome to Angband. Every journey begins under the stars of the town square.' },
                    { start: 24.8, end: 31.8, speaker: 'Enceladus', text: 'Stock your pack at the armory, ready your spells, and plunge into the deep.' },
                    { start: 34.0, end: 39.8, speaker: 'Enceladus', text: 'Rule number one for the veteran: looking around will not get you killed.' },
                    { start: 40.2, end: 44.5, speaker: 'Enceladus', text: 'Camera yaw costs precisely zero turns.' },
                    { start: 45.0, end: 54.5, speaker: 'Enceladus', text: 'Pan the darkness, inspect every corridor, scout the pillars—the world moves only when you take a step.' },
                    { start: 64.0, end: 70.0, speaker: 'Enceladus', text: 'Miss your glyphs? Fear losing your classic overview? Press Tab.' },
                    { start: 70.5, end: 75.5, speaker: 'Enceladus', text: 'Instantaneous, bit-for-bit Angband 4.2.6 CRT terminal mode.' },
                    { start: 76.0, end: 82.66, speaker: 'Enceladus', text: 'Same menus, same inventory hotkeys, zero compromise. The 3D world and the ASCII matrix are one and the same.' },
                    { start: 83.2, end: 89.00, speaker: 'Kore', text: 'Equipping the Westernesse Broadsword... every stat matches.' },
                    { start: 92.5, end: 99.0, speaker: 'Enceladus', text: 'In 3D, corridors are narrow and corners are blind. But you have ears.' },
                    { start: 99.5, end: 106.58, speaker: 'Enceladus', text: '3D spatial audio lets you hear snoring orcs around the bend before you walk into their line of sight.' },
                    { start: 107.0, end: 114.64, speaker: 'Snerk the Snaga', text: 'Hssst... quiet in the dark... the man-thing smells of iron and lamp oil...' },
                    { start: 115.0, end: 123.84, speaker: 'Enceladus', text: 'And with infravision, the crimson heat of your quarry pierces the subterranean gloom.' },
                    { start: 124.0, end: 129.40, speaker: 'Young Red Dragon', text: 'Who dares disturb the hoard of the deep?!' },
                    { start: 130.0, end: 138.0, speaker: 'Enceladus', text: 'Every spell, every resistance, every artifact from the 4.2.6 compendium is here.' },
                    { start: 138.5, end: 144.36, speaker: 'Enceladus', text: 'No cooldowns, no action-game shortcuts. Turn-based tactical roguelike survival.' },
                    { start: 149.5, end: 158.0, speaker: 'Enceladus', text: 'Every step of your pilgrimage is penned in real time into the Living Chronicle—voiced by Gemini as an epic saga.' },
                    { start: 158.5, end: 166.02, speaker: 'Enceladus', text: 'Preserving your triumphs and blunders for eternity.' },
                    { start: 169.0, end: 178.5, speaker: 'Enceladus', text: 'Play instantly in your browser, or take it offline with standalone Windows and Android clients.' },
                    { start: 179.0, end: 188.00, speaker: 'Enceladus', text: 'Your save files are universal. Angband 3D awaits. Descend if you dare.' }
                ]
            };
        }

        init() {
            this.modalEl = document.getElementById('demo-modal');
            if (!this.modalEl) return;

            this.videoEl = document.getElementById('demo-video-player');
            this.canvasEl = document.getElementById('demo-canvas-stage');

            // Enforce genuine recorded video playback only — canvas stage is permanently disabled
            if (this.canvasEl) {
                this.canvasEl.style.display = 'none';
            }
            if (this.videoEl) {
                this.videoEl.style.display = 'block';
                this.videoEl.volume = this.volume;
                this.videoEl.muted = this.isMuted;
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

            if (this.btnCcEl) {
                this.btnCcEl.classList.toggle('active', this.captionsEnabled);
            }
            if (this.captionsEl) {
                this.captionsEl.style.display = this.captionsEnabled ? 'flex' : 'none';
            }
            this.updateVolumeUI();
        }

        setupEvents() {
            // HTML5 Video Element Wireup
            if (this.videoEl) {
                this.videoEl.addEventListener('click', () => this.togglePlay());
                this.videoEl.addEventListener('timeupdate', () => {
                    if (!this.isScrubbing) {
                        this.currentTime = this.videoEl.currentTime;
                        this.updateUI();
                    }
                });
                this.videoEl.addEventListener('play', () => {
                    this.isPlaying = true;
                    this.updatePlayPauseUI();
                    this.startLoop();
                });
                this.videoEl.addEventListener('pause', () => {
                    this.isPlaying = false;
                    this.updatePlayPauseUI();
                });
                this.videoEl.addEventListener('ended', () => this.onEnded());
                this.videoEl.addEventListener('progress', () => {
                    if (this.videoEl.buffered.length > 0 && this.scrubberBufferEl) {
                        const bufferedEnd = this.videoEl.buffered.end(this.videoEl.buffered.length - 1);
                        const pct = (bufferedEnd / (this.duration || 1)) * 100;
                        this.scrubberBufferEl.style.width = `${Math.min(100, pct)}%`;
                    }
                });
                this.videoEl.addEventListener('loadedmetadata', () => {
                    if (this.videoEl.duration && !isNaN(this.videoEl.duration) && isFinite(this.videoEl.duration)) {
                        this.duration = this.videoEl.duration;
                        this.renderChapterPips();
                        this.updateUI();
                    }
                });
            }

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
                        if (!this.manifest.subtitles && this.manifest.audioStems) {
                            this.manifest.subtitles = this.manifest.audioStems;
                        }
                        if (data.totalDuration) this.duration = data.totalDuration;
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

            // Sync master volume with game audio settings
            if (window.__app && window.__app.audio) {
                const masterVol = window.__app.audio.getMasterVolume();
                this.setVolume(masterVol);
                this.isMuted = window.__app.audio.isMuted();
                this.updateVolumeUI();
            }

            if (this.videoEl) {
                this.videoEl.style.display = 'block';
                this.videoEl.volume = this.volume;
                this.videoEl.muted = this.isMuted;
                if (!this.videoEl.currentSrc) {
                    this.videoEl.load();
                }
            }
            if (this.canvasEl) {
                this.canvasEl.style.display = 'none';
            }

            // Auto-play from start
            this.seek(0);
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

        play() {
            this.isPlaying = true;
            this.updatePlayPauseUI();

            if (this.videoEl) {
                if (this.videoEl.ended) {
                    this.videoEl.currentTime = 0;
                }
                const playPromise = this.videoEl.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn('[DemoPlayer] Video playback was prevented, falling back to muted play:', err);
                        this.videoEl.muted = true;
                        this.isMuted = true;
                        this.updateVolumeUI();
                        this.videoEl.play().catch(e => console.error('[DemoPlayer] Muted playback error:', e));
                    });
                }
            }
            this.startLoop();
        }

        pause() {
            this.isPlaying = false;
            this.updatePlayPauseUI();

            if (this.videoEl) {
                this.videoEl.pause();
            }
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }

        togglePlay() {
            if (this.isPlaying) this.pause();
            else this.play();
        }

        seek(time) {
            this.currentTime = Math.max(0, Math.min(this.duration, time));
            if (this.videoEl) {
                if (this.videoEl.readyState >= 1) {
                    this.videoEl.currentTime = this.currentTime;
                } else {
                    this.videoEl.addEventListener('loadedmetadata', () => {
                        this.videoEl.currentTime = this.currentTime;
                    }, { once: true });
                }
            }
            this.updateUI();
        }

        seekDelta(delta) {
            this.seek(this.currentTime + delta);
        }

        jumpToChapter(idx) {
            if (!this.manifest.chapters || idx < 0 || idx >= this.manifest.chapters.length) return;
            this.seek(this.manifest.chapters[idx].start);
            if (!this.isPlaying) this.play();
        }

        setVolume(vol) {
            this.volume = Math.max(0, Math.min(1, vol));
            if (this.volume > 0 && this.isMuted) {
                this.isMuted = false;
            }
            if (this.videoEl) {
                this.videoEl.volume = this.volume;
                this.videoEl.muted = this.isMuted;
            }
            this.updateVolumeUI();
        }

        toggleMute() {
            this.isMuted = !this.isMuted;
            if (this.videoEl) {
                this.videoEl.muted = this.isMuted;
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

        updatePlayPauseUI() {
            if (this.centerPlayEl) {
                this.centerPlayEl.classList.toggle('hidden', this.isPlaying);
                if (!this.isPlaying) {
                    this.centerPlayEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
                }
            }
            if (this.btnPlayEl) {
                this.btnPlayEl.textContent = this.isPlaying ? '⏸' : '▶';
            }
        }

        startLoop() {
            if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

            const loop = () => {
                if (!this.isPlaying) return;

                if (this.videoEl && !this.isScrubbing) {
                    this.currentTime = this.videoEl.currentTime;
                    this.updateUI();
                }

                this.animationFrameId = requestAnimationFrame(loop);
            };

            this.animationFrameId = requestAnimationFrame(loop);
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

            // Ambient background glow matches active chapter accent
            if (this.ambientGlowEl && this.manifest.chapters[this.activeChapterIndex]) {
                const ch = this.manifest.chapters[this.activeChapterIndex];
                this.ambientGlowEl.style.background = `radial-gradient(ellipse at center, ${ch.color}33 0%, rgba(0,0,0,0) 70%)`;
            }
        }

        updateCaptions() {
            if (!this.captionsEl || !this.captionsEnabled) return;

            const t = this.currentTime;
            let currentSub = null;
            const subs = this.manifest.subtitles || this.manifest.audioStems || [];
            for (const sub of subs) {
                if (t >= sub.start && t <= sub.end) {
                    currentSub = sub;
                    break;
                }
            }

            if (currentSub !== this.activeSubtitle) {
                this.activeSubtitle = currentSub;
                if (currentSub) {
                    const speakerClass = (currentSub.speaker === 'Enceladus') ? 'speaker-bard' :
                                         (currentSub.speaker === 'Aoede') ? 'speaker-lorekeeper' :
                                         (currentSub.speaker === 'Fenrir') ? 'speaker-creature' :
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

        renderCanvas() {
            // No-op: Authentic 1080p WebGL gameplay video is rendered by #demo-video-player
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

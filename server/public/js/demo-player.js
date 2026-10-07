/**
 * Angband3D — Broadcast-Quality Gameplay Demo & Walkthrough Showcase Controller
 *
 * Provides a YouTube-grade interactive cinema experience for actual recorded gameplay:
 *  - 1080p Pristine Authentic Gameplay Video with muxed Master Narrator voice stems
 *  - 16:9 Cinema stage with ambient background glow matched to active chapter accent
 *  - Interactive scrubber with timeline hover tooltips and chapter tick markers
 *  - Timed closed captions / subtitle engine with speaker badges
 *  - Full keyboard accessibility (Space/K play, Arrows seek, M mute, C captions, F fullscreen, Esc close/back)
 *  - Direct "Jump In & Play" CTA button to launch hero into the dungeon instantly
 */

(function() {
    'use strict';

    const CHAPTER_COLORS = [
        '#ffd700', // Act 0: Insignia (Gold)
        '#f59e0b', // Act 1: Town & Descent (Amber)
        '#38bdf8', // Act 2: 0-Turn Yaw & Radar (Cyan)
        '#10b981', // Act 3: 80x24 CRT Terminal (Emerald)
        '#8b5cf6', // Act 4: Archery & Combat Log (Violet)
        '#c084fc', // Act 5: Grimoire & Potions (Purple)
        '#ec4899', // Act 6: Living Chronicle (Pink)
        '#ef4444', // Act 7: Dragon Clash (Crimson)
        '#06b6d4', // Act 8: Universal Saves (Teal)
        '#eab308'  // Act 9: Grand Finale (Bright Gold)
    ];

    class DemoPlayer {
        constructor(options = {}) {
            this.isStandalone = options.isStandalone || false;
            this.modalEl = null;
            this.theaterContainerEl = null;
            this.videoWrapperEl = null;
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
            this.isSeeking = false;
            this.currentTime = 0;
            this.duration = 275.0; // 4m 35s Master Walkthrough
            this.volume = 0.85;
            this.isMuted = false;
            this.captionsEnabled = false; // Closed captions OFF by default
            this.isFullscreen = false;
            this.useVideo = true;

            this.animationFrameId = null;
            this.isScrubbing = false;
            this.activeChapterIndex = 0;
            this.activeSubtitle = null;
            this._seekTimeout = null;
            this._keydownHandler = null;
            this._hudIdleTimeout = null;

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

        isClientStandalone() {
            return (typeof window !== 'undefined' && (
                (window.chrome && window.chrome.webview !== undefined) ||
                window.location.hostname === 'angband3d.local' ||
                (typeof document !== 'undefined' && document.body?.classList?.contains('is-standalone')) ||
                window.Capacitor !== undefined ||
                window.location.protocol === 'file:' ||
                window.location.protocol === 'capacitor:'
            ));
        }

        init() {
            // Standalone Native Client Guard:
            // Standalone desktop/Android apps never bundle video or play demo locally;
            // demo showcase is strictly hosted on https://angband3d.com/demo.
            if (this.isClientStandalone()) {
                return;
            }

            // Auto-detect standalone page context
            if (!this.isStandalone) {
                const path = window.location.pathname || '';
                this.isStandalone = path.endsWith('/demo') || 
                                    path.endsWith('/demo.html') || 
                                    document.body.classList.contains('demo-standalone-page') || 
                                    !document.getElementById('demo-modal');
            }

            this.modalEl = document.getElementById('demo-modal');
            this.theaterContainerEl = document.querySelector('.demo-theater-container');
            this.videoWrapperEl = document.querySelector('.demo-video-wrapper');
            this.videoEl = document.getElementById('demo-video-player');
            if (!this.videoEl) return;

            this.canvasEl = document.getElementById('demo-canvas-stage');
            if (this.canvasEl) {
                this.canvasEl.style.display = 'none';
            }

            this.videoEl.style.display = 'block';
            this.videoEl.volume = this.volume;
            this.videoEl.muted = this.isMuted;

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
            this.chapterPillContainer = document.querySelector('.demo-chapter-ribbon');

            if (this.isStandalone) {
                this.isOpen = true;
                if (this.btnCloseEl) {
                    this.btnCloseEl.title = 'Back to Angband 3D (Esc)';
                }
            }

            this.setupEvents();
            this.bindChapterPills();
            this.renderChapterPips();
            this.preloadManifest();

            if (this.btnCcEl) {
                this.btnCcEl.classList.toggle('active', this.captionsEnabled);
            }
            if (this.captionsEl) {
                this.captionsEl.style.display = this.captionsEnabled ? 'flex' : 'none';
            }
            this.updateVolumeUI();
            this.updateActiveChapterUI();

            if (this.isStandalone) {
                // Standalone page: autoplay immediately with graceful unmuted/muted fallback
                this.play();
            }
        }

        setupEvents() {
            // HTML5 Video Element Wireup
            if (this.videoEl) {
                this.videoEl.addEventListener('timeupdate', () => {
                    if (!this.isScrubbing && !this.isSeeking) {
                        this.currentTime = this.videoEl.currentTime;
                        this.updateUI();
                    }
                });
                this.videoEl.addEventListener('seeking', () => {
                    this.isSeeking = true;
                });
                this.videoEl.addEventListener('seeked', () => {
                    this.isSeeking = false;
                    if (this.videoEl && !this.isScrubbing) {
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

            // Sync with browser native fullscreen changes (Esc, browser controls, F11)
            document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
            document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());

            // Video wrapper click (single click: play/pause, double click: toggle fullscreen)
            if (this.videoWrapperEl) {
                let clickTimer = null;
                this.videoWrapperEl.addEventListener('click', (e) => {
                    if (e.target.closest('#demo-center-play') || 
                        e.target.closest('.demo-close-btn') || 
                        e.target.closest('.demo-captions-overlay') || 
                        e.target.closest('.demo-transport-bar') || 
                        e.target.closest('.demo-chapter-ribbon')) return;
                    if (clickTimer) {
                        clearTimeout(clickTimer);
                        clickTimer = null;
                        this.toggleFullscreen();
                    } else {
                        clickTimer = setTimeout(() => {
                            clickTimer = null;
                            this.togglePlay();
                        }, 240);
                    }
                });
                this.videoWrapperEl.addEventListener('dblclick', (e) => {
                    if (e.target.closest('#demo-center-play') || 
                        e.target.closest('.demo-close-btn') || 
                        e.target.closest('.demo-captions-overlay') || 
                        e.target.closest('.demo-transport-bar') || 
                        e.target.closest('.demo-chapter-ribbon')) return;
                    e.preventDefault();
                    if (clickTimer) {
                        clearTimeout(clickTimer);
                        clickTimer = null;
                    }
                    this.toggleFullscreen();
                });
            } else if (this.videoEl) {
                this.videoEl.addEventListener('click', () => this.togglePlay());
            }

            // Reset HUD auto-hide timer on user interaction
            const onUserActivity = () => this.resetHudTimer();
            window.addEventListener('mousemove', onUserActivity, { passive: true });
            window.addEventListener('mousedown', onUserActivity, { passive: true });
            window.addEventListener('touchstart', onUserActivity, { passive: true });

            // Jump In & Play CTA button
            if (this.btnPlayGameEl) {
                this.btnPlayGameEl.addEventListener('click', () => this.jumpInAndPlay());
            }

            // Close button
            if (this.btnCloseEl) {
                this.btnCloseEl.addEventListener('click', () => {
                    if (this.isFullscreen) {
                        this.exitFullscreen();
                    } else {
                        this.close();
                    }
                });
            }

            // Escape key or backdrop click closes modal
            const backdrop = this.modalEl ? this.modalEl.querySelector('.demo-backdrop') : null;
            if (backdrop) {
                backdrop.addEventListener('click', () => this.close());
            }

            // Keyboard Shortcuts (Space, K, Arrows, M, C, F, Esc)
            if (!this._keydownHandler) {
                this._keydownHandler = (e) => {
                    if (!this.isOpen && !this.isStandalone) return;
                    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                    this.resetHudTimer();

                    if (e.code === 'Space' || e.code === 'KeyK') {
                        e.preventDefault();
                        this.togglePlay();
                    } else if (e.code === 'ArrowLeft') {
                        e.preventDefault();
                        this.seekDelta(-5);
                    } else if (e.code === 'ArrowRight') {
                        e.preventDefault();
                        this.seekDelta(5);
                    } else if (e.code === 'KeyM') {
                        e.preventDefault();
                        this.toggleMute();
                    } else if (e.code === 'KeyC') {
                        e.preventDefault();
                        this.toggleCaptions();
                    } else if (e.code === 'KeyF') {
                        e.preventDefault();
                        this.toggleFullscreen();
                    } else if (e.code === 'Escape') {
                        e.preventDefault();
                        if (this.isFullscreen) {
                            this.exitFullscreen();
                        } else {
                            this.close();
                        }
                    }
                };
                window.addEventListener('keydown', this._keydownHandler);
            }
        }

        bindChapterPills() {
            if (!this.chapterPillContainer) {
                this.chapterPillContainer = this.modalEl ? this.modalEl.querySelector('.demo-chapter-ribbon') : document.querySelector('.demo-chapter-ribbon');
            }
            if (!this.chapterPillContainer) return;

            const pills = this.chapterPillContainer.querySelectorAll('.demo-chapter-pill');
            pills.forEach((pill, idx) => {
                pill.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rawTime = pill.dataset.time !== undefined ? pill.dataset.time : pill.getAttribute('data-time');
                    const targetTime = parseFloat(rawTime || 0);
                    this.jumpToChapter(idx, targetTime);
                });
            });
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
            if (this.isClientStandalone()) return;
            try {
                const res = await fetch('/assets/audio/demo/demo_manifest.json');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.chapters) {
                        data.chapters.forEach((ch, idx) => {
                            if (!ch.color) {
                                ch.color = CHAPTER_COLORS[idx % CHAPTER_COLORS.length];
                            }
                        });
                        this.manifest = data;
                        if (!this.manifest.subtitles && this.manifest.audioStems) {
                            this.manifest.subtitles = this.manifest.audioStems;
                        }
                        if (data.totalDuration) this.duration = data.totalDuration;
                        this.renderChapterPips();
                        this.updateActiveChapterUI();
                    }
                }
            } catch (_) {}
        }

        open(fromState = 'mainMenu') {
            // Standalone Client Invariant: Demo showcase is strictly web-only.
            // Shell out to https://angband3d.com/demo and exit without opening modal.
            if (this.isClientStandalone()) {
                if (typeof window.openExternalUrl === 'function') {
                    window.openExternalUrl('https://angband3d.com/demo');
                } else {
                    window.open('https://angband3d.com/demo', '_blank');
                }
                return;
            }

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
            if (this.isStandalone) {
                window.location.href = '/';
                return;
            }

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
            this.resetHudTimer();

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
            if (this._hudIdleTimeout) {
                clearTimeout(this._hudIdleTimeout);
                this._hudIdleTimeout = null;
            }
            const container = this.getContainer();
            if (container) container.classList.remove('hud-hidden');

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
            this.isSeeking = true;
            if (this._seekTimeout) clearTimeout(this._seekTimeout);
            this._seekTimeout = setTimeout(() => {
                this.isSeeking = false;
            }, 800);

            this.currentTime = Math.max(0, Math.min(this.duration, time));
            if (this.videoEl) {
                try {
                    if (this.videoEl.readyState >= 1) {
                        this.videoEl.currentTime = this.currentTime;
                    } else {
                        this.videoEl.addEventListener('loadedmetadata', () => {
                            this.videoEl.currentTime = this.currentTime;
                        }, { once: true });
                    }
                } catch (e) {
                    console.warn('[DemoPlayer] Seek error:', e);
                }
            }
            this.updateUI();
        }

        seekDelta(delta) {
            this.seek(this.currentTime + delta);
        }

        jumpToChapter(idx, explicitTime) {
            let targetTime = 0;
            if (explicitTime !== undefined && !isNaN(explicitTime)) {
                targetTime = explicitTime;
            } else if (this.manifest && this.manifest.chapters && this.manifest.chapters[idx]) {
                targetTime = this.manifest.chapters[idx].start;
            }

            this.activeChapterIndex = idx;
            this.seek(targetTime);

            if (this.videoEl) {
                const playPromise = this.videoEl.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn('[DemoPlayer] Chapter jump autoplay blocked, falling back to muted play:', err);
                        this.videoEl.muted = true;
                        this.isMuted = true;
                        this.updateVolumeUI();
                        this.videoEl.play().catch(e => console.error('[DemoPlayer] Chapter jump playback error:', e));
                    });
                }
            }
            this.isPlaying = true;
            this.updatePlayPauseUI();
            this.updateActiveChapterUI();
            this.startLoop();
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

        getContainer() {
            if (this.theaterContainerEl && document.contains(this.theaterContainerEl)) {
                return this.theaterContainerEl;
            }
            const el = document.querySelector('.demo-theater-container');
            if (el) {
                this.theaterContainerEl = el;
                return el;
            }
            if (this.modalEl) {
                const inner = this.modalEl.querySelector('.demo-theater-container');
                if (inner) return inner;
                if (this.modalEl.classList.contains('demo-theater-container')) return this.modalEl;
            }
            return null;
        }

        toggleFullscreen() {
            const container = this.getContainer();
            if (!container) return;

            const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement || container.classList.contains('is-fullscreen'));
            if (!isFs) {
                const req = container.requestFullscreen ? container.requestFullscreen() :
                            container.webkitRequestFullscreen ? container.webkitRequestFullscreen() : null;
                if (req && req.catch) {
                    req.catch(err => {
                        console.warn('[DemoPlayer] Container fullscreen failed, using CSS fullscreen fallback:', err);
                        this.enterCssFullscreen(container);
                    });
                } else if (!req) {
                    if (this.videoEl && this.videoEl.webkitEnterFullscreen) {
                        this.videoEl.webkitEnterFullscreen();
                    } else {
                        this.enterCssFullscreen(container);
                    }
                }
            } else {
                this.exitFullscreen();
            }
        }

        enterCssFullscreen(container) {
            if (!container) container = this.getContainer();
            if (!container) return;
            container.classList.add('is-fullscreen');
            this.isFullscreen = true;
            if (this.btnFullscreenEl) {
                this.btnFullscreenEl.textContent = '⤓';
                this.btnFullscreenEl.title = 'Exit Fullscreen (F / Esc)';
            }
            if (this.btnCloseEl) {
                this.btnCloseEl.title = 'Exit Fullscreen (Esc)';
            }
            if (this.isPlaying) {
                this.resetHudTimer();
            }
        }

        exitFullscreen() {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
            const container = this.getContainer();
            if (container) {
                container.classList.remove('is-fullscreen', 'hud-hidden');
            }
            this.isFullscreen = false;
            if (this.btnFullscreenEl) {
                this.btnFullscreenEl.textContent = '⛶';
                this.btnFullscreenEl.title = 'Toggle Fullscreen (F)';
            }
            if (this.btnCloseEl) {
                this.btnCloseEl.title = this.isStandalone ? 'Back to Angband 3D (Esc)' : 'Close Demo (Esc)';
            }
            if (this._hudIdleTimeout) {
                clearTimeout(this._hudIdleTimeout);
                this._hudIdleTimeout = null;
            }
        }

        onFullscreenChange() {
            const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
            this.isFullscreen = isFs;
            const container = this.getContainer();
            if (container) {
                if (isFs) {
                    container.classList.add('is-fullscreen');
                } else {
                    container.classList.remove('is-fullscreen', 'hud-hidden');
                }
            }
            if (this.btnFullscreenEl) {
                this.btnFullscreenEl.textContent = isFs ? '⤓' : '⛶';
                this.btnFullscreenEl.title = isFs ? 'Exit Fullscreen (F / Esc)' : 'Toggle Fullscreen (F)';
            }
            if (this.btnCloseEl) {
                this.btnCloseEl.title = isFs ? 'Exit Fullscreen (Esc)' : (this.isStandalone ? 'Back to Angband 3D (Esc)' : 'Close Demo (Esc)');
            }
            if (isFs && this.isPlaying) {
                this.resetHudTimer();
            } else if (this._hudIdleTimeout) {
                clearTimeout(this._hudIdleTimeout);
                this._hudIdleTimeout = null;
            }
        }

        resetHudTimer() {
            const container = this.getContainer();
            if (!container) return;
            container.classList.remove('hud-hidden');
            if (this._hudIdleTimeout) {
                clearTimeout(this._hudIdleTimeout);
                this._hudIdleTimeout = null;
            }
            if (this.isFullscreen && this.isPlaying) {
                this._hudIdleTimeout = setTimeout(() => {
                    if (this.isFullscreen && this.isPlaying) {
                        container.classList.add('hud-hidden');
                    }
                }, 2500);
            }
        }

        jumpInAndPlay() {
            if (this.isStandalone) {
                window.location.href = '/';
                return;
            }
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

                if (this.videoEl && !this.isScrubbing && !this.isSeeking) {
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
            if (this.manifest && this.manifest.chapters && this.manifest.chapters.length > 0) {
                for (let i = 0; i < this.manifest.chapters.length; i++) {
                    const ch = this.manifest.chapters[i];
                    if (this.currentTime >= ch.start && (ch.end === undefined || this.currentTime < ch.end)) {
                        currentChapterIdx = i;
                    }
                }
            }

            if (currentChapterIdx !== this.activeChapterIndex) {
                this.activeChapterIndex = currentChapterIdx;
                this.updateActiveChapterUI();
            }

            // Update Subtitles / Closed Captions
            this.updateCaptions();
        }

        updateActiveChapterUI() {
            if (!this.chapterPillContainer) {
                this.chapterPillContainer = document.querySelector('.demo-chapter-ribbon');
            }
            if (this.chapterPillContainer) {
                const pills = this.chapterPillContainer.querySelectorAll('.demo-chapter-pill');
                pills.forEach((pill, i) => {
                    const isActive = (i === this.activeChapterIndex);
                    pill.classList.toggle('active', isActive);
                    if (isActive) {
                        try {
                            pill.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                        } catch (_) {}
                    }
                });
            }

            // Ambient background glow matches active chapter accent
            if (this.ambientGlowEl) {
                const ch = (this.manifest && this.manifest.chapters) ? this.manifest.chapters[this.activeChapterIndex] : null;
                const color = (ch && ch.color) ? ch.color : (CHAPTER_COLORS[this.activeChapterIndex % CHAPTER_COLORS.length] || '#ffd700');
                this.ambientGlowEl.style.background = `radial-gradient(ellipse at center, ${color}33 0%, rgba(0,0,0,0) 70%)`;
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

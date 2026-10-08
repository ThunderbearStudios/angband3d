/**
 * ChronicleManager — Master Coordinator for The Living Chronicle & Voiced Lorekeeper
 * Orchestrates UI window, drag/resize mechanics, frame evaluation, 3D canvas snapshot art,
 * interactive Q&A consultation, and tab visibility audio etiquette.
 */

class ChronicleManager {
    constructor() {
        this.store = (typeof window !== 'undefined' && window.ChronicleStore) ? window.ChronicleStore : (typeof ChronicleStore !== 'undefined' ? ChronicleStore : null);
        this.grounder = (typeof window !== 'undefined' && window.ChronicleGrounder) ? window.ChronicleGrounder : (typeof ChronicleGrounder !== 'undefined' ? ChronicleGrounder : null);
        this.filter = (typeof window !== 'undefined' && window.ChronicleFilter) ? new window.ChronicleFilter() : new ChronicleFilter();
        this.audio = (typeof window !== 'undefined' && window.ChronicleAudioRouter) ? new window.ChronicleAudioRouter() : new ChronicleAudioRouter();
        if (this.audio) {
            this.audio.onPlaybackEnded = () => {
                this.onAudioPlaybackEnded();
            };
        }
        this.llm = (typeof window !== 'undefined' && window.ChronicleLLMBridge) ? new window.ChronicleLLMBridge() : (typeof ChronicleLLMBridge !== 'undefined' ? new ChronicleLLMBridge() : null);

        if (this.llm) {
            this.llm.onStatusUpdate = (msg, isWarning = false) => {
                if (this.statusTextEl) {
                    this.statusTextEl.textContent = msg;
                    this.statusTextEl.style.color = isWarning ? '#fbbf24' : '#34d399';
                    clearTimeout(this._statusResetTimer);
                    this._statusResetTimer = setTimeout(() => {
                        if (this.statusTextEl) {
                            this.statusTextEl.textContent = 'Chronicle Active';
                            this.statusTextEl.style.color = '';
                        }
                    }, 5000);
                }
                if (this.inputModel) {
                    this.inputModel.value = this.llm.getActiveModel();
                }
                const chips = document.querySelectorAll('.btn-model-chip');
                if (chips && chips.length > 0) {
                    const curModel = this.llm.getActiveModel();
                    chips.forEach(c => c.classList.toggle('active', c.getAttribute('data-model') === curModel));
                }
            };
        }

        this.activeChronicle = null;
        this.tradition = 'westmarch'; // 'noldor' | 'westmarch' | 'khazad'
        this.visible = false;
        this.dungeon = null;
        this.targetedCreature = null;
        this.currentCharacterSignature = null;
        this.characterDied = false;
        this.lastSeenMessages = [];

        // DOM Element Cache
        this.windowEl = null;
        this.headerEl = null;
        this.resizeHandleEl = null;
        this.scrollEl = null;
        this.listEl = null;
        this.navBtn = null;
        this.vocalPillEl = null;
        this.hudToastEl = null;
        this._toastTimeout = null;
        this._pillInterruptedTimeout = null;

        // Controls
        this.btnPlayStory = null;
        this.btnStopStory = null;
        this.btnRewindStory = null;
        this.btnForwardStory = null;
        this.btnMute = null;
        this.btnSpeed = null;
        this.btnExpand = null;
        this.btnSettings = null;
        this.btnClose = null;

        // Audiobook & Story Playback State
        this.storyPlaylist = [];
        this.currentBeatIndex = 0;
        this.isStoryPlaying = false;
        this.pausedBeatIndex = null;
        this.playbackSessionId = 0;
        this.statusTextEl = null;
        this.lorekeeperQueryCount = 0;

        // Interactive Bar & Creature Target
        this.inputQuery = null;
        this.btnMic = null;
        this.btnSend = null;
        this.quickChips = [];
        this.targetPill = null;
        this.targetLabel = null;
        this.btnClearTarget = null;

        // Footer Actions
        this.btnExportJson = null;
        this.btnExportHtml = null;
        this.btnImport = null;
        this.fileInput = null;

        // Settings Modal & Extra Controls
        this.settingsModal = null;
        this.selectEngine = null;
        this.selectSpeed = null;
        this.sliderReverb = null;
        this.valReverb = null;
        this.selectTradition = null;
        this.btnTestVoice = null;
        this.selectProvider = null;
        this.inputApiKey = null;
        this.btnPasteApiKey = null;
        this.btnClearApiKey = null;
        this.apiKeyStatus = null;
        this.inputModel = null;
        this.inputEndpoint = null;
        this.btnTestLLM = null;
        this.testStatus = null;
        this.btnSettingsClose = null;
        this.btnSettingsSave = null;
        this.isSpeakingBeat = false;
        this.isVoiceLoading = false;

        // Telemetry tracking for bulletproof character instance transitions
        this.lastSeenTurn = null;
        this.lastEngineTurn = null;
        this.lastSeenDepth = null;

        // Real-Time Unvoiced Action Ledger & Catch-Up Engine
        this.unvoicedEventLedger = [];
        this.voicingHeroSnapshot = null;
        this.liveHero = null;
        this._lastCatchUpTriggerTurn = 0;
        this._lastStagingTime = 0;

        this.initialized = false;
    }

    _isAudioMuted() {
        if (!this.audio) return true;
        if (typeof this.audio.isMuted === 'function') return this.audio.isMuted();
        if (this.audio.enabled === false) return true;
        if (typeof this.audio.voiceVolume === 'number' && this.audio.voiceVolume <= 0) return true;
        return false;
    }

    init(dungeon, soundEngine) {
        if (this.initialized) return;

        // Standalone Client Guard: The Tome is strictly available only on the Web Client (angband3d.com)
        if (typeof window !== 'undefined' && (
            window.Capacitor !== undefined ||
            window.location?.protocol === 'capacitor:' ||
            window.isNativeAndroidApp === true ||
            window.location?.hostname === 'angband3d.local' ||
            (window.chrome && window.chrome.webview !== undefined) ||
            document.body?.classList?.contains('is-standalone')
        )) {
            const win = document.getElementById('chronicle-window');
            if (win) win.style.display = 'none';
            const nav = document.getElementById('btn-toggle-chronicle');
            if (nav) nav.style.display = 'none';
            return;
        }

        this.dungeon = dungeon;

        // Cache DOM Elements
        this.windowEl = document.getElementById('chronicle-window');
        this.headerEl = document.getElementById('chronicle-header');
        this.resizeHandleEl = document.getElementById('chronicle-resize-handle');
        this.scrollEl = document.getElementById('chronicle-scroll');
        this.listEl = document.getElementById('chronicle-list');
        this.navBtn = document.getElementById('btn-toggle-chronicle');
        this.vocalPillEl = document.getElementById('chronicle-vocal-pill');
        this.hudToastEl = document.getElementById('chronicle-hud-toast');

        if (!this.windowEl) {
            console.warn('[ChronicleManager] #chronicle-window not found in DOM.');
            return;
        }

        // Initialize Audio Sub-system
        if (soundEngine) {
            this.audio.init(soundEngine);
        }

        // Connect voice loading state and granular vocal state callbacks for visual feedback & anti-click guarding
        if (this.audio) {
            this.audio.onLoadingStateChange = (loading, details) => {
                this.onVoiceLoadingState(loading, details);
            };
            this.audio.onVocalStateChange = (state, telemetry) => {
                this.onVocalStateChanged(state, telemetry);
            };
            this.audio.onPlaybackEnded = () => {
                this.onAudioPlaybackEnded();
            };
        }

        // Cache Control Buttons
        this.btnPlayStory = document.getElementById('btn-chronicle-play');
        this.btnStopStory = document.getElementById('btn-chronicle-stop');
        this.btnRewindStory = document.getElementById('btn-chronicle-rewind');
        this.btnForwardStory = document.getElementById('btn-chronicle-forward');
        this.btnMute = document.getElementById('btn-chronicle-mute');
        this.btnSpeed = document.getElementById('btn-chronicle-speed');
        this.btnExpand = document.getElementById('btn-chronicle-expand');
        this.btnSettings = document.getElementById('btn-chronicle-settings');
        this.btnClose = document.getElementById('btn-chronicle-close');
        this.statusTextEl = document.getElementById('chronicle-status-text');

        // Cache Q&A Bar & Target Pill
        this.inputQuery = document.getElementById('chronicle-query-input');
        this.btnMic = document.getElementById('btn-chronicle-mic');
        this.btnSend = document.getElementById('btn-chronicle-send');
        this.quickChips = document.querySelectorAll('.quick-topic-chip');
        this.targetPill = document.getElementById('chronicle-target-pill');
        this.targetLabel = document.getElementById('chronicle-target-label');
        this.btnClearTarget = document.getElementById('btn-chronicle-clear-target');

        // Cache Footer Buttons
        this.btnExportJson = document.getElementById('btn-chronicle-export-json');
        this.btnExportHtml = document.getElementById('btn-chronicle-export-html');
        this.btnImport = document.getElementById('btn-chronicle-import');
        this.fileInput = document.getElementById('chronicle-file-input');

        // Cache Settings Modal
        this.settingsModal = document.getElementById('chronicle-settings-modal');
        this.selectEngine = document.getElementById('chronicle-setting-engine');
        this.selectSpeed = document.getElementById('chronicle-setting-speed');
        this.sliderReverb = document.getElementById('chronicle-setting-reverb');
        this.valReverb = document.getElementById('chronicle-reverb-value');
        this.selectTradition = document.getElementById('chronicle-setting-tradition');
        this.btnTestVoice = document.getElementById('btn-chronicle-test-voice');
        this.selectProvider = document.getElementById('chronicle-setting-provider');
        this.inputApiKey = document.getElementById('chronicle-setting-apikey');
        this.btnPasteApiKey = document.getElementById('btn-paste-apikey');
        this.btnClearApiKey = document.getElementById('btn-clear-apikey');
        this.apiKeyStatus = document.getElementById('chronicle-apikey-status');
        this.inputModel = document.getElementById('chronicle-setting-model');
        this.inputEndpoint = document.getElementById('chronicle-setting-endpoint');
        this.btnTestLLM = document.getElementById('btn-chronicle-test-llm');
        this.testStatus = document.getElementById('chronicle-test-status');
        this.btnSettingsClose = document.getElementById('btn-chronicle-settings-close');
        this.btnSettingsSave = document.getElementById('btn-chronicle-settings-save');
        this.checkEnforceFree = document.getElementById('chronicle-setting-enforce-free');

        // Bind Event Listeners
        this.bindEvents();

        // Restore active story from localStorage only if explicitly imported
        this.activeChronicle = this.store ? this.store.loadActive() : null;
        if (this.activeChronicle && this.activeChronicle.isManuallyImported) {
            this.renderAllChapters();
        } else {
            if (this.listEl) this.listEl.innerHTML = '';
        }

        // Automatic Zero-Config Management:
        // Gemini Native Audio, elder British storyteller Enceladus, and 10% subterranean reverb
        // are always managed automatically under the hood without exposing manual settings controls.
        if (this.audio) {
            this.audio.setEngine('gemini');
            this.audio.setReverbVolume(0.10);
            this.audio.narratorVoice = 'Enceladus';
        }
        if (this.llm) {
            this.llm.saveSettings({
                provider: 'gemini',
                model: 'gemini-3.8-flash',
                enforceFreeTier: true
            });
        }

        // Update UI Button states
        this.updateAudioControlsUI();

        // Tab Visibility Safety: Pause speech on hidden, restore on return
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.audio) {
                    this.audio.stopSpeaking();
                }
            });
        }

        this.initialized = true;
    }

    bindEvents() {
        // Navbar Toggle Button
        if (this.navBtn) {
            this.navBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleWindow();
            });
        }

        // Safe Global Hotkeys for Chronicle Window & Audio Playback
        // NOTE: Standard movement (ArrowUp, ArrowDown, Shift+ArrowLeft, Shift+ArrowRight, k, j)
        // and game prompts (Space) must NEVER be intercepted while navigating the dungeon!
        // All Chronicle shortcuts require Alt to avoid conflicting with core Angband controls.
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('keydown', (e) => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

                if (e.altKey) {
                    // Alt + C: Toggle Living Chronicle window
                    if (e.key === 'c' || e.key === 'C') {
                        e.preventDefault();
                        this.toggleWindow();
                        return;
                    }

                    // Alt + P / Alt + Space: Play / Pause Story Audio
                    if (e.key === 'p' || e.key === 'P' || e.code === 'Space') {
                        e.preventDefault();
                        this.toggleStoryPlayback();
                        return;
                    }

                    // Alt + [: Rewind to previous paragraph
                    if (e.key === '[' || e.code === 'BracketLeft') {
                        e.preventDefault();
                        this.rewindStoryPlayback();
                        return;
                    }

                    // Alt + ]: Skip to next paragraph
                    if (e.key === ']' || e.code === 'BracketRight') {
                        e.preventDefault();
                        this.forwardStoryPlayback();
                        return;
                    }

                    // Alt + S: Stop audio playback
                    if (e.key === 's' || e.key === 'S') {
                        e.preventDefault();
                        this.stopStoryPlayback();
                        return;
                    }
                }
            });
        }

        // Window & Audio Playback Button Controls
        if (this.btnPlayStory) {
            this.btnPlayStory.addEventListener('click', () => this.toggleStoryPlayback());
        }
        if (this.btnStopStory) {
            this.btnStopStory.addEventListener('click', () => this.stopStoryPlayback());
        }
        if (this.btnRewindStory) {
            this.btnRewindStory.addEventListener('click', () => this.rewindStoryPlayback());
        }
        if (this.btnForwardStory) {
            this.btnForwardStory.addEventListener('click', () => this.forwardStoryPlayback());
        }

        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => this.hideWindow());
        }

        if (this.btnExpand) {
            this.btnExpand.addEventListener('click', () => {
                if (this.windowEl) {
                    this.windowEl.classList.toggle('minimized');
                    this.btnExpand.textContent = this.windowEl.classList.contains('minimized') ? '▼ Show' : '▲ Min';
                }
            });
        }

        if (this.btnMute) {
            this.btnMute.addEventListener('click', () => {
                const nowMuted = this.audio.enabled; // Toggle
                this.audio.setMuted(nowMuted);
                this.updateAudioControlsUI();
            });
        }

        if (this.btnSpeed) {
            this.btnSpeed.addEventListener('click', () => {
                const speeds = [0.75, 0.85, 1.0, 1.25, 1.5];
                const current = this.audio ? this.audio.speed : 1.0;
                let nextIdx = speeds.findIndex(s => Math.abs(s - current) < 0.02) + 1;
                if (nextIdx >= speeds.length || nextIdx < 0) nextIdx = 0;
                const nextSpeed = speeds[nextIdx];
                this.audio.setSpeed(nextSpeed);
                this.updateAudioControlsUI();
            });
        }

        // Voice Speed Selector in Settings Modal
        if (this.selectSpeed) {
            this.selectSpeed.addEventListener('change', () => {
                const spd = parseFloat(this.selectSpeed.value) || 1.0;
                if (this.audio) this.audio.setSpeed(spd);
                this.updateAudioControlsUI();
            });
        }

        // Voice Engine Selection
        if (this.selectEngine) {
            this.selectEngine.addEventListener('change', () => {
                const eng = this.selectEngine.value;
                if (this.audio) this.audio.setEngine(eng);
                if (this.statusTextEl) {
                    this.statusTextEl.textContent = eng === 'gemini' ? '✨ Engine: Gemini Native Audio' : '🎙️ Engine: Edge Neural';
                }
            });
        }

        // Subterranean Reverb Slider
        if (this.sliderReverb) {
            const updateReverb = () => {
                const val = parseInt(this.sliderReverb.value, 10);
                if (this.valReverb) this.valReverb.textContent = `${val}%`;
                if (this.audio) this.audio.setReverbVolume(val / 100);
            };
            this.sliderReverb.addEventListener('input', updateReverb);
            this.sliderReverb.addEventListener('change', updateReverb);
        }

        // Audition Voice Button in Settings Modal: Auditions the Master Chronicler Enceladus
        if (this.btnTestVoice) {
            this.btnTestVoice.addEventListener('click', async () => {
                const sampleText = "Deep in the subterranean vaults of Angband, iron doors groan upon rusted hinges. Steel your courage, mortal, for the shadows stir.";
                if (this.audio) {
                    const wasMuted = !this.audio.enabled;
                    if (wasMuted) {
                        this.audio.setMuted(false);
                        this.updateAudioControlsUI();
                    }
                    if (this.testStatus) {
                        this.testStatus.style.color = '#ffd700';
                        this.testStatus.textContent = '✨ Auditioning Master Chronicler (Enceladus)...';
                    }
                    try {
                        const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, this.currentHero, 'exploration', this.tradition) : null;
                        await this.audio.speakUtterance(sampleText, 'narrator', '', 'Enceladus', {
                            engine: 'gemini',
                            geminiVoice: (narrProfile && narrProfile.geminiVoice) || 'Enceladus',
                            geminiTag: (narrProfile && narrProfile.geminiTag) || '[expressive, older British storyteller]',
                            directorNote: (narrProfile && narrProfile.directorNote) || 'An expressive, slightly British older fireside storyteller',
                            emotion: 'solemn'
                        });
                        if (this.testStatus) {
                            this.testStatus.style.color = '#4ade80';
                            this.testStatus.textContent = '✓ Master Chronicler audition complete.';
                            setTimeout(() => { if (this.testStatus) this.testStatus.textContent = ''; }, 4000);
                        }
                    } catch (e) {
                        if (this.testStatus) {
                            this.testStatus.style.color = '#f87171';
                            this.testStatus.textContent = `Audition error: ${e.message}`;
                        }
                    }
                }
            });
        }

        // Settings Open / Close / Save Handlers
        if (this.btnSettings && this.settingsModal) {
            this.btnSettings.addEventListener('click', () => this.openSettings());
        }
        if (this.btnSettingsClose && this.settingsModal) {
            this.btnSettingsClose.addEventListener('click', () => this.closeSettings());
        }
        if (this.btnSettingsSave && this.settingsModal) {
            this.btnSettingsSave.addEventListener('click', () => this.closeSettings());
        }

        // Clipboard Paste API Key Button
        if (this.btnPasteApiKey && this.inputApiKey) {
            this.btnPasteApiKey.addEventListener('click', async () => {
                let pasted = '';
                if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
                    try {
                        pasted = await navigator.clipboard.readText();
                    } catch (err) {
                        console.warn('[ChronicleManager] Clipboard readText blocked:', err);
                    }
                }
                if (pasted) {
                    this.inputApiKey.value = pasted.trim();
                    if (this.llm) {
                        this.llm.saveSettings({ apiKey: this.inputApiKey.value });
                    }
                    if (this.apiKeyStatus) {
                        this.apiKeyStatus.textContent = '✓ Pasted & Saved locally!';
                        setTimeout(() => { if (this.apiKeyStatus) this.apiKeyStatus.textContent = ''; }, 3000);
                    }
                } else {
                    this.inputApiKey.focus();
                    this.inputApiKey.select();
                    if (this.apiKeyStatus) {
                        this.apiKeyStatus.textContent = 'Press Ctrl+V to paste';
                        setTimeout(() => { if (this.apiKeyStatus) this.apiKeyStatus.textContent = ''; }, 3000);
                    }
                }
            });
        }

        // Clear API Key Button
        if (this.btnClearApiKey && this.inputApiKey) {
            this.btnClearApiKey.addEventListener('click', () => {
                this.inputApiKey.value = '';
                if (this.llm) {
                    this.llm.saveSettings({ apiKey: '' });
                }
                if (this.apiKeyStatus) {
                    this.apiKeyStatus.textContent = '✓ Cleared';
                    clearTimeout(this._apiKeyStatusTimer);
                    this._apiKeyStatusTimer = setTimeout(() => {
                        if (this.apiKeyStatus) this.apiKeyStatus.textContent = '';
                    }, 2500);
                }
            });
        }

        // API Key Instant Auto-save
        if (this.inputApiKey) {
            const handleApiKeyChange = () => {
                const key = this.inputApiKey.value.trim();
                if (this.llm) {
                    this.llm.saveSettings({ apiKey: key });
                }
                if (this.apiKeyStatus) {
                    this.apiKeyStatus.textContent = '✓ Saved locally';
                    clearTimeout(this._apiKeyStatusTimer);
                    this._apiKeyStatusTimer = setTimeout(() => {
                        if (this.apiKeyStatus) this.apiKeyStatus.textContent = '';
                    }, 2500);
                }
            };
            this.inputApiKey.addEventListener('input', handleApiKeyChange);
            this.inputApiKey.addEventListener('change', handleApiKeyChange);
            this.inputApiKey.addEventListener('paste', () => setTimeout(handleApiKeyChange, 50));
        }

        // Settings Tabs Switching
        const tabBtns = document.querySelectorAll('.settings-tab-btn');
        if (tabBtns && tabBtns.length > 0) {
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabKey = btn.getAttribute('data-tab');
                    tabBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
                    const targetPane = document.getElementById(`pane-setting-${tabKey}`);
                    if (targetPane) targetPane.classList.add('active');
                });
            });
        }

        // Model Preset Chips
        const modelChips = document.querySelectorAll('.btn-model-chip');
        if (modelChips && modelChips.length > 0) {
            modelChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    const chosen = chip.getAttribute('data-model');
                    modelChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    if (this.inputModel && chosen) {
                        this.inputModel.value = chosen;
                        if (this.llm) {
                            this.llm.saveSettings({ model: chosen });
                        }
                        if (this.apiKeyStatus) {
                            this.apiKeyStatus.textContent = `✓ Selected: ${chosen}`;
                            setTimeout(() => { if (this.apiKeyStatus) this.apiKeyStatus.textContent = ''; }, 2500);
                        }
                    }
                });
            });
        }

        // Free Tier Enforce Checkbox
        if (this.checkEnforceFree) {
            this.checkEnforceFree.addEventListener('change', () => {
                if (this.llm) {
                    this.llm.saveSettings({ enforceFreeTier: this.checkEnforceFree.checked });
                }
            });
        }

        // Literary Tradition Preview Synchronization
        if (this.selectTradition) {
            const updateTraditionPreview = () => {
                const val = this.selectTradition.value;
                if (this.audio) this.audio.setTradition(val);
                const nameEl = document.getElementById('tradition-preview-name');
                const styleEl = document.getElementById('tradition-preview-style');
                const quoteEl = document.getElementById('tradition-preview-quote');
                if (!nameEl) return;
                if (val === 'noldor') {
                    nameEl.textContent = 'The Annals of the Noldor';
                    if (styleEl) styleEl.textContent = 'Perspective: High elven nobility, sorrow of the Silmarils, and ancient starlight.';
                    if (quoteEl) quoteEl.textContent = '"O Elbereth Gilthoniel, silivren penna míriel o menel aglar elenath! We remember the elder beauty and the tears unnumbered."';
                } else if (val === 'khazad') {
                    nameEl.textContent = 'The Record of Khazad-Dûm';
                    if (styleEl) styleEl.textContent = 'Perspective: Unyielding dwarven stonecraft, deep vaults, and ancient blood-feuds.';
                    if (quoteEl) quoteEl.textContent = '"The world was young, the mountains green, no stain yet on the Moon was seen... We strike true and hold the iron gates."';
                } else {
                    nameEl.textContent = 'The Red Book of Westmarch';
                    if (styleEl) styleEl.textContent = 'Perspective: Mortal courage, humble hearths, and the lingering shadow of Mordor.';
                    if (quoteEl) quoteEl.textContent = '"Still round the corner there may wait a new road or a secret gate; and though we pass them by today, tomorrow we may come this way..."';
                }
            };
            this.selectTradition.addEventListener('change', updateTraditionPreview);
        }

        // Model Input auto-save on input/change with auto-upgrade
        if (this.inputModel) {
            const handleModelChange = () => {
                let m = this.inputModel.value.trim();
                if (m.includes('1.5-flash') || m.includes('2.0-flash')) {
                    m = 'gemini-3.8-flash';
                    this.inputModel.value = m;
                }
                if (this.llm) {
                    this.llm.saveSettings({ model: m });
                }
                // Update active chip highlight
                const chips = document.querySelectorAll('.btn-model-chip');
                if (chips) {
                    chips.forEach(c => c.classList.toggle('active', c.getAttribute('data-model') === m));
                }
            };
            this.inputModel.addEventListener('input', handleModelChange);
            this.inputModel.addEventListener('change', handleModelChange);
        }

        // Test Connection Button
        if (this.btnTestLLM) {
            this.btnTestLLM.addEventListener('click', async () => {
                if (!this.llm) return;
                const prov = this.selectProvider ? this.selectProvider.value : 'offline';
                const key = this.inputApiKey ? this.inputApiKey.value.trim() : '';
                const model = this.inputModel ? this.inputModel.value.trim() : '';
                const endpoint = this.inputEndpoint ? this.inputEndpoint.value.trim() : '';

                if (this.testStatus) {
                    this.testStatus.style.color = '#ffd700';
                    this.testStatus.textContent = '⏳ Testing connection...';
                }

                try {
                    const res = await this.llm.testConnection(prov, key, model, endpoint);
                    if (this.testStatus) {
                        if (res && res.ok) {
                            this.testStatus.style.color = '#4ade80';
                            this.testStatus.textContent = `✓ ${res.message || 'Connected successfully!'}`;
                        } else {
                            this.testStatus.style.color = '#f87171';
                            this.testStatus.textContent = `✕ ${res.error || 'Connection failed'}`;
                        }
                    }
                } catch (e) {
                    if (this.testStatus) {
                        this.testStatus.style.color = '#f87171';
                        this.testStatus.textContent = `✕ Error: ${e.message}`;
                    }
                }
            });
        }

        // Q&A Bar: Send Query
        if (this.btnSend && this.inputQuery) {
            this.btnSend.addEventListener('click', () => this.submitUserQuery());
            this.inputQuery.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.submitUserQuery();
                }
            });
        }

        // Q&A Bar: Microphone Voice Input
        if (this.btnMic && this.inputQuery) {
            this.btnMic.addEventListener('click', () => this.toggleMicrophone());
        }

        // Quick Topic Chips
        if (this.quickChips) {
            this.quickChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    const query = chip.getAttribute('data-query');
                    if (query) {
                        if (this.inputQuery) this.inputQuery.value = query;
                        this.submitUserQuery();
                    }
                });
            });
        }

        // Clear Target Action
        if (this.btnClearTarget) {
            this.btnClearTarget.addEventListener('click', (e) => {
                e.preventDefault();
                this.clearTargetCreature();
            });
        }

        // Export Actions
        if (this.btnExportJson) {
            this.btnExportJson.addEventListener('click', () => this.exportChronicle('json'));
        }
        if (this.btnExportHtml) {
            this.btnExportHtml.addEventListener('click', () => this.exportChronicle('html'));
        }

        // Import Action
        if (this.btnImport && this.fileInput) {
            this.btnImport.addEventListener('click', () => this.fileInput.click());
            this.fileInput.addEventListener('change', (e) => this.handleFileImport(e));
        }
    }

    updateAudioControlsUI() {
        if (this.btnMute) {
            this.btnMute.textContent = this.audio.enabled ? '🔊 Audio' : '🔇 Muted';
            this.btnMute.classList.toggle('active', this.audio.enabled);
            this.btnMute.title = this.audio.enabled ? 'Click to Mute Voice Narration' : 'Click to Enable Voice Narration';
        }
        if (this.btnSpeed) {
            this.btnSpeed.textContent = `⚡ ${this.audio.speed.toFixed(2).replace(/\.00$/, '')}x`;
            this.btnSpeed.title = `Voice Speed: ${this.audio.speed}x (Click to cycle 0.75x, 0.85x, 1.0x, 1.25x, 1.5x)`;
        }
        if (this.selectSpeed && this.audio) {
            this.selectSpeed.value = String(this.audio.speed);
        }
        if (this.selectQuickVoice && this.audio && this.audio.narratorVoice) {
            this.selectQuickVoice.value = this.audio.narratorVoice;
        }
        this.updatePlayButtonUI();
    }

    updateTraditionBadge() {
        if (typeof document === 'undefined') return;
        const tradBadge = document.getElementById('chronicle-tradition-badge');
        if (tradBadge && this.grounder && this.grounder.TRADITIONS && this.grounder.TRADITIONS[this.tradition]) {
            tradBadge.textContent = this.grounder.TRADITIONS[this.tradition].name
                .replace('The Annals of the ', '')
                .replace('The Record of ', '')
                .replace('The Red Book of ', '');
            tradBadge.title = `Literary Tradition: ${this.grounder.TRADITIONS[this.tradition].name} (Attuned to ${this.currentHero?.race || 'Adventurer'})`;
        }
    }

    showWindow() {
        if (this.windowEl) {
            this.windowEl.classList.add('active');
            this.visible = true;
            if (this.navBtn) this.navBtn.classList.add('active');
            this.renderAllChapters();
            this.buildStoryPlaylist();
            if (this.storyPlaylist.length > 0 && typeof this.prewarmBeat === 'function') {
                this.prewarmBeat(this.storyPlaylist[this.currentBeatIndex || 0]);
            }
        }
    }

    hideWindow() {
        if (this.windowEl) {
            this.windowEl.classList.remove('active');
            this.visible = false;
            if (this.navBtn) this.navBtn.classList.remove('active');
        }
    }

    toggleWindow() {
        if (this.visible) this.hideWindow();
        else this.showWindow();
    }

    /**
     * Bulletproof reset and re-initialization of dialogue, story, and audio state
     * for a brand new character instance or newly loaded adventurer.
     */
    resetForNewCharacter(hero = null) {
        return this.startFreshChronicle(hero);
    }

    startFreshChronicle(hero) {
        const name = (hero && hero.name) ? hero.name : 'Adventurer';
        console.log(`[ChronicleManager] Bulletproof reset & starting fresh chronicle for character instance: ${name}`);

        // 1. Immediately halt all speech and audiobook playback
        this.stopStoryPlayback();
        if (this.audio) {
            this.audio.stopSpeaking();
            if (this.audio.playlist) this.audio.playlist = [];
            this.audio.isSpeaking = false;
            this.audio.isPaused = false;
        }
        this.playbackSessionId++;
        this.storyPlaylist = [];
        this.currentBeatIndex = 0;
        this.isStoryPlaying = false;
        this.lorekeeperQueryCount = 0;

        // 2. Wipe filter telemetry, combat trackers & action accumulators
        if (this.filter) this.filter.reset();
        this.lastSeenTurn = null;
        this.lastEngineTurn = null;
        this.lastSeenDepth = null;
        this.lastSeenMessages = [];
        this.unvoicedEventLedger = [];
        this.voicingHeroSnapshot = null;
        this.liveHero = hero;
        this._lastCatchUpTriggerTurn = 0;
        this._lastStagingTime = 0;

        // 3. Clear instance voice cache so new dungeon monsters don't inherit old mappings
        if (this.grounder && typeof this.grounder.clearInstanceVoiceRegistry === 'function') {
            this.grounder.clearInstanceVoiceRegistry();
        }

        // 4. Reset LLM utterance anti-repetition buffer for new character
        if (this.llm) {
            this.llm.recentUtterances = [];
        }

        // 5. Completely purge UI list, target pills, input queries and status badges
        if (this.listEl) this.listEl.innerHTML = '';
        this.clearTargetCreature();
        if (this.inputQuery) this.inputQuery.value = '';
        if (this.statusTextEl) this.statusTextEl.textContent = 'Chronicle Active';

        // 6. Initialize pristine chronicle for this character instance
        this.currentHero = hero;
        this.activeChronicle = this.store ? this.store.createNewChronicle(hero) : null;
        if (this.activeChronicle) {
            this.activeChronicle.isManuallyImported = false;
            if (this.store) this.store.saveActive(this.activeChronicle);
        }

        if (hero && hero.race) {
            this.currentCharacterSignature = `${hero.name || 'Hero'}_${hero.race || ''}_${hero.class || ''}`;
        } else {
            // Incomplete/partial hero stub from UI launch before engine frame 1; leave signature null
            // so frame 1 triggers authoritative initialization once player.race and history are ready.
            this.currentCharacterSignature = null;
        }
        this.characterDied = false;

        // 7. Attune tradition to hero race best fit
        if (hero && hero.race && this.grounder) {
            this.tradition = this.grounder.getTraditionForRace(hero.race);
            if (this.audio) this.audio.setTradition(this.tradition);
            this.updateTraditionBadge();
        }

        // 8. Speculative Pre-Warming: Immediately warm the opening town arrival prologue in the background!
        // Guarantees zero-latency, instant vocal initiation when the player appears in town.
        // Requires complete hero profile (hero.race) to avoid firing duplicate pre-warms on dummy UI stubs.
        if (hero && hero.race && this.grounder && this.audio && !this._isAudioMuted() && typeof this.audio.prewarmUtterance === 'function') {
            try {
                const townArrivalEvent = {
                    type: 'ONBOARDING_TOWN_ARRIVAL',
                    priority: 'normal',
                    isChapter: true,
                    data: { player: hero }
                };
                const prologueEntry = this.grounder.generateProceduralChapter(townArrivalEvent, hero, this.tradition);
                if (prologueEntry && prologueEntry.prose) {
                    const narrProfile = this.grounder.resolveVoiceProfile(null, hero, 'ONBOARDING_TOWN_ARRIVAL', this.tradition);
                    const prewarmOpts = {
                        narrator: narrProfile,
                        engine: this.audio.ttsEngine
                    };
                    this.audio.prewarmUtterance(prologueEntry.prose, 'narrator', '', null, prewarmOpts).catch(() => {});
                }
            } catch (_) {}
        }
    }

    async onFrame(frame) {
        if (!frame) return;

        // Track birth/setup phase transitions to force a fresh chronicle on next character
        if (frame.phase === 'birth' || frame.phase === 'setup') {
            this.characterDied = true;
            return;
        }

        // Only evaluate during active gameplay or death sequence
        if ((frame.phase !== 'play' && frame.phase !== 'death') || !frame.player) return;

        if (this._isProcessingFrame) return;
        this._isProcessingFrame = true;

        try {
            const player = frame.player;
            const heroSig = `${player.name || 'Hero'}_${player.race || ''}_${player.class || ''}`;
            const playerTurn = (typeof player.turn === 'number') ? player.turn : null;
            const engineTurn = (typeof frame.turn === 'number') ? frame.turn : null;

            // Bulletproof Fresh Start Heuristics:
            // 1. Character died in previous life or passed through birth/setup
            // 2. Character identity (name/race/class) changed
            // 3. No active chronicle exists
            // 4. Stored chronicle does NOT match current character AND was NOT manually imported
            // 5. Turn count rewound (e.g. player restarted game with exact same character name/race/class!)
            let needsFreshStart = false;

            if (this.characterDied) {
                needsFreshStart = true;
            } else if (this.currentCharacterSignature && this.currentCharacterSignature !== heroSig) {
                needsFreshStart = true;
            } else if (!this.activeChronicle) {
                needsFreshStart = true;
            } else if (!this.activeChronicle.isManuallyImported && this.store && !this.store.isMatchingHero(this.activeChronicle, player)) {
                needsFreshStart = true;
            } else if (playerTurn !== null && this.lastSeenTurn !== null && playerTurn < this.lastSeenTurn && playerTurn <= 15) {
                // Turn counter rewound to early game: undeniably a new character run
                needsFreshStart = true;
            } else if (engineTurn !== null && this.lastEngineTurn !== null && engineTurn < this.lastEngineTurn && engineTurn <= 15) {
                needsFreshStart = true;
            }

            if (needsFreshStart) {
                this.startFreshChronicle(player);
            } else {
                // Picking up where we are at for this active character instance
                if (!this.currentCharacterSignature) {
                    this.currentCharacterSignature = heroSig;
                }
                this.currentHero = player;
                // Populate UI if currently blank but chapters exist in active chronicle
                if (this.listEl && this.listEl.children && this.listEl.children.length === 0 && this.activeChronicle && this.activeChronicle.chapters && this.activeChronicle.chapters.length > 0) {
                    this.renderAllChapters();
                }
            }

            if (playerTurn !== null) this.lastSeenTurn = playerTurn;
            if (engineTurn !== null) this.lastEngineTurn = engineTurn;

            // Auto-attune literary tradition based on character race best fit
            if (frame.player && frame.player.race && this.grounder) {
                const bestTradition = this.grounder.getTraditionForRace(frame.player.race);
                if (this.tradition !== bestTradition) {
                    this.tradition = bestTradition;
                    if (this.audio) this.audio.setTradition(bestTradition);
                    this.updateTraditionBadge();
                }
            }

            // Cache live message stream for real-time combat awareness in direct conversations
            this.lastSeenMessages = frame.messages || [];

            // Drain sequential events for this frame (up to 6 events per turn to prevent story backlog)
            let drained = 0;
            let event = this.filter.evaluate(frame);
            const frameEntries = [];
            while (event && drained < 6) {
                drained++;
                const entry = this.processEvent(event, frame, false);
                if (entry) frameEntries.push({ event, entry });
                event = this.filter.evaluate(frame);
            }

            // Hero Death: Ultimate terminal priority — immediately cuts off prior speech and speaks Requiem
            const deathEntry = frameEntries.find(fe => fe.event.type === 'HERO_DEATH');
            if (deathEntry) {
                this.characterDied = true;
                if (this.audio) {
                    this.audio.stopSpeaking();
                }
                this.unvoicedEventLedger = [];
                this.voicingHeroSnapshot = null;

                if (this.audio && this.audio.enabled && deathEntry.entry) {
                    const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, frame.player, 'HERO_DEATH', this.tradition) : null;
                    const speakOpts = {
                        narrator: narrProfile,
                        engine: this.audio.ttsEngine,
                        seamless: false
                    };
                    this.audio.speak(deathEntry.entry.prose, deathEntry.entry.dialogue, null, null, 0, speakOpts);
                    this._highlightActiveCard(deathEntry.entry);
                }
                return;
            }

            // Cache live hero state for ongoing catch-up evaluations
            this.liveHero = frame.player;

            // Audio disabled or manual story playlist active
            if (!this.audio || !this.audio.enabled || this.isStoryPlaying) {
                return;
            }

            // Dynamic Voice Handoff & Story Catch-Up Gate:
            // 1. If audio is idle (!isSpeaking && !isStaging):
            //    - Speak the primary action of this frame immediately.
            //    - Record snapshot of hero state when voicing starts.
            //    - Buffer any secondary events from this frame into unvoicedEventLedger.
            // 2. If audio IS speaking or staging:
            //    - Current voice continues playing without interruption!
            //    - Frame events buffer into unvoicedEventLedger.
            //    - Constantly evaluate whether urgency (kill, mortal peril, potion) or backlog density
            //      warrants staging a seamless catch-up beat.
            if (!this.audio.isSpeaking && !this.audio.isStaging && !this.audio.isProcessingSpeechQueue) {
                if (frameEntries.length > 0) {
                    const bestToSpeak = frameEntries.find(fe => fe.event.isChapter !== false) ||
                                        frameEntries.find(fe => fe.event.type === 'STORE_PURCHASE') ||
                                        frameEntries.find(fe => fe.event.type === 'COMBAT_EPISODE' || fe.event.type === 'UNIQUE_SLAIN' || (fe.event.type === 'COMBAT_EXCHANGE' && fe.event.data?.kills?.length > 0)) ||
                                        frameEntries.find(fe => fe.entry.dialogue && !fe.entry.dialogue.isNoise) ||
                                        frameEntries[frameEntries.length - 1];

                    if (bestToSpeak && bestToSpeak.entry) {
                        this.voicingHeroSnapshot = JSON.parse(JSON.stringify(frame.player));
                        this.unvoicedEventLedger = [];

                        for (const fe of frameEntries) {
                            if (fe !== bestToSpeak) {
                                this.unvoicedEventLedger.push({
                                    event: fe.event,
                                    entry: fe.entry,
                                    turn: playerTurn,
                                    player: JSON.parse(JSON.stringify(frame.player))
                                });
                            }
                        }

                        const eventType = bestToSpeak.event ? bestToSpeak.event.type : '';
                        const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, frame.player, eventType, this.tradition) : null;
                        let dVoiceProfile = null;
                        if (bestToSpeak.entry.dialogue && this.grounder) {
                            const speakerEntity = (bestToSpeak.event && bestToSpeak.event.monster) ? bestToSpeak.event.monster : { name: bestToSpeak.entry.dialogue.speaker };
                            dVoiceProfile = bestToSpeak.entry.dialogue.voiceProfile || this.grounder.resolveVoiceProfile(speakerEntity, frame.player, eventType, this.tradition);
                            bestToSpeak.entry.dialogue.voiceProfile = dVoiceProfile;
                        }
                        const speakOpts = {
                            narrator: narrProfile,
                            engine: this.audio.ttsEngine,
                            seamless: true
                        };
                        this.audio.speak(bestToSpeak.entry.prose, bestToSpeak.entry.dialogue, null, null, 0, speakOpts);
                        this._highlightActiveCard(bestToSpeak.entry);
                    }
                } else if (this.unvoicedEventLedger && this.unvoicedEventLedger.length > 0) {
                    this.triggerCatchUpBeat(frame.player);
                }
            } else {
                // Audio is currently speaking or staging
                if (frameEntries.length > 0) {
                    for (const fe of frameEntries) {
                        this.unvoicedEventLedger.push({
                            event: fe.event,
                            entry: fe.entry,
                            turn: playerTurn,
                            player: JSON.parse(JSON.stringify(frame.player))
                        });
                    }
                }
                this.evaluateCatchUp(frame.player);
            }
        } finally {
            this._isProcessingFrame = false;
        }
    }

    onAudioPlaybackEnded() {
        this._updateCardStates();
        this.updatePlayButtonUI();
        if (this.statusTextEl && this.storyPlaylist && this.storyPlaylist.length > 0) {
            const beatNum = (typeof this.currentBeatIndex === 'number' && this.currentBeatIndex >= 0) ? this.currentBeatIndex + 1 : this.storyPlaylist.length;
            this.statusTextEl.textContent = `✓ Passage ${beatNum} of ${this.storyPlaylist.length}`;
        }
        if (!this.audio || !this.audio.enabled || this.isStoryPlaying) return;
        if (this.unvoicedEventLedger && this.unvoicedEventLedger.length > 0) {
            this.triggerCatchUpBeat(this.liveHero);
        }
    }

    evaluateCatchUp(player) {
        if (!this.audio || !this.audio.enabled || this.isStoryPlaying) return;
        if (!this.unvoicedEventLedger || this.unvoicedEventLedger.length === 0) return;

        const curPlayer = player || this.liveHero || this.currentHero;
        if (!curPlayer) return;

        // Metric extraction across unvoiced ledger
        const events = this.unvoicedEventLedger.map(item => item.event).filter(Boolean);
        const hasKill = events.some(ev => ev.type === 'UNIQUE_SLAIN' || ev.type === 'COMBAT_EPISODE' || (ev.type === 'COMBAT_EXCHANGE' && ev.data?.kills?.length > 0) || ev.type === 'MONSTER_DIES');
        const hasUniqueSpotted = events.some(ev => ev.type === 'UNIQUE_SPOTTED');
        const hasPotionOrHeal = events.some(ev => ev.type === 'POTION_QUAFFED' || ev.type === 'HEALING_DRAUGHT' || (ev.data?.item && ev.data.item.toLowerCase().includes('potion')));
        const hasSpellCast = events.some(ev => ev.data?.attackMedium && (ev.data.attackMedium.type === 'spell' || ev.data.attackMedium.method === 'spell'));
        const hasMajorAffliction = events.some(ev => ev.type === 'PLAYER_STATUS');
        const curHp = curPlayer.chp || 1;
        const maxHp = curPlayer.mhp || 1;
        const hpPct = curHp / maxHp;
        const inMortalPeril = hpPct < 0.35;

        let significantHpDrop = false;
        if (this.voicingHeroSnapshot && typeof this.voicingHeroSnapshot.chp === 'number') {
            const hpDelta = this.voicingHeroSnapshot.chp - curHp;
            if (hpDelta >= Math.max(15, maxHp * 0.25)) {
                significantHpDrop = true;
            }
        }

        const isUrgent = hasKill || inMortalPeril || hasUniqueSpotted || hasPotionOrHeal || hasMajorAffliction || significantHpDrop;
        const isBacklogDense = this.unvoicedEventLedger.length >= 2;

        const now = Date.now();
        if (this.audio.isSpeaking || this.audio.isStaging || this.audio.isProcessingSpeechQueue) {
            // While audio is actively speaking, ONLY urgent high-drama events may preempt the voice!
            // Routine actions buffer cleanly in the ledger and are voiced sequentially when playback ends.
            if (!isUrgent) return;
            if (this._lastStagingTime && (now - this._lastStagingTime < 1000)) return;
            this._lastStagingTime = now;
            this.triggerCatchUpBeat(curPlayer);
        } else {
            // Audio is idle: if backlog exists, voice it now
            if (!isUrgent && !isBacklogDense) return;
            if (this._lastStagingTime && (now - this._lastStagingTime < 400)) return;
            this._lastStagingTime = now;
            this.triggerCatchUpBeat(curPlayer);
        }
    }

    triggerCatchUpBeat(player) {
        if (!this.unvoicedEventLedger || this.unvoicedEventLedger.length === 0 || this.isStoryPlaying) return;
        const curPlayer = player || this.liveHero || this.currentHero;
        if (!curPlayer) return;

        // Calculate skipped action summary before flushing ledger
        const ledgerSummary = this.getLedgerSummary();

        // If audio was actively speaking or staging, mark active beat interrupted with skipped action count
        if (this.audio && (this.audio.isSpeaking || this.audio.isStaging || this.audio.isProcessingSpeechQueue)) {
            this.markCurrentBeatInterrupted('catchup', ledgerSummary);
            this.showHudToast(`⚡ Speech interrupted (+${ledgerSummary})`, 3200);
        }

        const ledgerItems = this.unvoicedEventLedger.slice();
        this.unvoicedEventLedger = [];

        const events = ledgerItems.map(item => item.event).filter(Boolean);
        if (events.length === 0) return;

        // Ground-truth Tolkien saga prose synthesis
        const catchUpEntry = this.grounder.generateCatchUpBeat(
            events,
            this.voicingHeroSnapshot,
            curPlayer,
            this.tradition
        );

        if (!catchUpEntry || !catchUpEntry.prose) return;

        // Append to active chronicle store & render to UI
        this.store.appendChapter(this.activeChronicle, catchUpEntry);
        this.renderStoryEntry(catchUpEntry, true);

        // Update snapshot to current player state
        this.voicingHeroSnapshot = JSON.parse(JSON.stringify(curPlayer));
        this._lastCatchUpTriggerTurn = curPlayer.turn || 0;

        // Stage for seamless playback (zero overlap guaranteed)
        if (this.audio && this.audio.enabled) {
            const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, curPlayer, 'CATCH_UP', this.tradition) : null;
            let dVoiceProfile = null;
            if (catchUpEntry.dialogue && this.grounder) {
                const speakerEntity = { name: catchUpEntry.dialogue.speaker };
                dVoiceProfile = this.grounder.resolveVoiceProfile(speakerEntity, curPlayer, 'CATCH_UP', this.tradition);
                catchUpEntry.dialogue.voiceProfile = dVoiceProfile;
            }

            const speakOpts = {
                narrator: narrProfile,
                engine: this.audio.ttsEngine,
                seamless: true
            };

            this.audio.speak(catchUpEntry.prose, catchUpEntry.dialogue, null, null, 0, speakOpts);
            this._highlightActiveCard(catchUpEntry);
        } else if (!this.isStoryPlaying && (!this.audio || !this.audio.isSpeaking)) {
            this.currentBeatIndex = this.storyPlaylist.length - 1;
            this._updateCardStates();
        }
    }

    _highlightActiveCard(entry) {
        if (!this.listEl || !entry) return;
        const chNum = entry.chapter_num;
        const pIdx = (entry.pIndex !== undefined && entry.pIndex !== null) ? entry.pIndex : 0;

        let foundIdx = -1;
        if (this.storyPlaylist && this.storyPlaylist.length > 0) {
            foundIdx = this.storyPlaylist.findIndex(b => b.chapterNum === chNum && b.pIndex === pIdx);
            if (foundIdx === -1) {
                foundIdx = this.storyPlaylist.length - 1;
            }
        }
        if (foundIdx >= 0) {
            this.currentBeatIndex = foundIdx;
        }

        this._updateCardStates();
        this.updatePlayButtonUI();

        const activeEl = (foundIdx >= 0 ? document.querySelector(`[data-beat-index="${foundIdx}"]`) : null) ||
                         document.getElementById(`chronicle-beat-${chNum}-${pIdx}`) ||
                         document.querySelector(`[data-chapter-num="${chNum}"]`);
        if (activeEl) {
            activeEl.classList.add('narrating-active', 'is-playing');
            if (this.scrollEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        if (this.statusTextEl && this.storyPlaylist && this.storyPlaylist.length > 0) {
            this.statusTextEl.textContent = `▶ Voicing passage ${this.currentBeatIndex + 1} of ${this.storyPlaylist.length}`;
        }
    }

    processEvent(event, frame, shouldSpeak = true) {
        if (!event || !frame) return null;

        // Instant Ground-Truth Procedural Synthesis (0ms latency):
        // Generates rich, lore-accurate, race-attuned Tolkien prose matching vocals 1:1.
        const entry = this.grounder.generateProceduralChapter(event, frame.player, this.tradition);
        if (!entry) return null;

        // Append to rolling story & render
        this.store.appendChapter(this.activeChronicle, entry);
        this.renderStoryEntry(entry, true);

        // Speak aloud if audio is unmuted (respects isNoise for non-vocal creatures)
        if (shouldSpeak && this.audio && !this._isAudioMuted()) {
            const isDeath = (event && event.type === 'HERO_DEATH');
            if (isDeath && this.audio.isSpeaking) {
                this.audio.stopSpeaking();
            }
            const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, frame.player, event.type, this.tradition) : null;
            let dVoiceProfile = null;
            if (entry.dialogue && this.grounder) {
                const speakerEntity = event.monster || { name: entry.dialogue.speaker };
                dVoiceProfile = entry.dialogue.voiceProfile || this.grounder.resolveVoiceProfile(speakerEntity, frame.player, event.type, this.tradition);
                entry.dialogue.voiceProfile = dVoiceProfile;
            }
            const speakOpts = {
                narrator: narrProfile,
                engine: this.audio.ttsEngine,
                seamless: !isDeath
            };
            this.audio.speak(entry.prose, entry.dialogue, null, null, 0, speakOpts);

            this._highlightActiveCard(entry);
        } else if (!this.isStoryPlaying && (!this.audio || !this.audio.isSpeaking)) {
            this.currentBeatIndex = this.storyPlaylist.length - 1;
            this._updateCardStates();
        }

        return entry;
    }

    renderAllChapters() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        this.storyPlaylist = [];
        if (!this.activeChronicle || !this.activeChronicle.chapters) return;

        for (const ch of this.activeChronicle.chapters) {
            if (ch.paragraphs && ch.paragraphs.length > 0) {
                ch.paragraphs.forEach((p, pIdx) => {
                    this.renderStoryEntry({
                        prose: p.prose,
                        dialogue: p.dialogue,
                        insight: p.insight,
                        depth: ch.depth,
                        chapter_num: ch.chapter_num,
                        pIndex: pIdx,
                        isLorekeeper: p.isLorekeeper
                    }, false);
                });
            } else if (ch.prose) {
                this.renderStoryEntry({
                    ...ch,
                    pIndex: 0
                }, false);
            }
        }

        if (this.scrollEl) {
            this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
        }

        if (this.storyPlaylist.length > 0) {
            this.currentBeatIndex = this.storyPlaylist.length - 1;
            this._updateCardStates();
        }
    }

    renderStoryEntry(entry, shouldScroll = true) {
        if (!this.listEl || !entry) return null;

        if (!this.storyPlaylist) this.storyPlaylist = [];
        const playlistIndex = this.storyPlaylist.length;

        const count = this.listEl.children ? this.listEl.children.length : 0;
        const chNum = entry.chapter_num || (count + 1);
        const pIdx = (entry.pIndex !== undefined && entry.pIndex !== null) ? entry.pIndex : 0;
        const beatId = entry.beatId || `chronicle-beat-${chNum}-${pIdx}`;

        const isDeath = Boolean(entry.isDeath || entry.type === 'HERO_DEATH' || (entry.title && entry.title.includes('Epitaph')));
        const block = document.createElement('div');
        block.className = isDeath ? 'flowing-paragraph-block chapter-card chapter-death' : 'flowing-paragraph-block chapter-card';
        block.id = beatId;
        block.setAttribute('data-beat-id', beatId);
        block.setAttribute('data-beat-index', playlistIndex);
        block.setAttribute('data-chapter-num', chNum);
        block.setAttribute('data-p-index', pIdx);

        const depth = (entry.depth !== undefined && entry.depth !== null)
            ? entry.depth
            : (this.currentHero ? this.currentHero.depth : 0);
        const depthLabel = depth === 0 ? 'Town' : `${depth * 50}ft`;
        let headerBadge = isDeath ? `⚰️ ${depthLabel} • Requiem` : depthLabel;
        if (entry.isCatchUp && entry.actionBreakdown && entry.actionBreakdown.summaryText) {
            headerBadge = `⚡ ${depthLabel} • Caught Up (+${entry.actionBreakdown.summaryText})`;
        } else if (entry.isCatchUp) {
            headerBadge = `⚡ ${depthLabel} • Caught Up`;
        }

        let html = `
            <div class="flowing-paragraph-header ${isDeath ? 'death-header' : ''}">
                <span class="entry-meta-depth ${isDeath ? 'death-badge' : ''}">${headerBadge}</span>
                <button class="flow-play-btn" data-beat-id="${beatId}" data-beat-index="${playlistIndex}" title="${isDeath ? 'Hear the Requiem' : 'Play story from here'}">▶</button>
            </div>
        `;

        if (entry.isCatchUp && entry.actionBreakdown) {
            html += `
                <div class="catchup-context-banner">
                    <span class="catchup-badge">⚡ Action Flurry</span>
                    <span class="catchup-breakdown">${entry.actionBreakdown.total} buffered events synthesized: ${entry.actionBreakdown.summaryText}</span>
                </div>
            `;
        }

        html += `<p class="chapter-prose ${isDeath ? 'death-prose' : ''}">${entry.prose}</p>`;

        if (entry.dialogue && entry.dialogue.text) {
            if (entry.dialogue.isNoise) {
                html += `
                    <div class="chapter-dialogue creature-sound-box">
                        <span class="dialogue-speaker">${entry.dialogue.speaker}</span>
                        <span class="dialogue-sound-noise">${entry.dialogue.text}</span>
                    </div>
                `;
            } else {
                html += `
                    <div class="chapter-dialogue">
                        <span class="dialogue-speaker">${entry.dialogue.speaker}</span>
                        "${entry.dialogue.text}"
                    </div>
                `;
            }
        }

        if (entry.insight) {
            html += `
                <div class="lorekeeper-insight ${isDeath ? 'death-insight' : ''}">
                    <span class="lorekeeper-insight-icon">${isDeath ? '🕯️' : '💡'}</span>
                    <span><strong>${isDeath ? 'Epitaph:' : 'Lorekeeper:'}</strong> ${entry.insight}</span>
                </div>
            `;
        }

        block.innerHTML = html;

        // Play from here & selection click handlers
        const playBtn = block.querySelector('.flow-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idxAttr = playBtn.getAttribute('data-beat-index');
                const targetIdx = (idxAttr !== null && idxAttr !== undefined) ? parseInt(idxAttr, 10) : playlistIndex;
                this.toggleBeatPlayback(targetIdx);
            });
        }
        block.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const idxAttr = block.getAttribute('data-beat-index');
            const targetIdx = (idxAttr !== null && idxAttr !== undefined) ? parseInt(idxAttr, 10) : playlistIndex;
            this.selectBeat(targetIdx);
        });
        block.addEventListener('dblclick', (e) => {
            if (e.target.closest('button')) return;
            const idxAttr = block.getAttribute('data-beat-index');
            const targetIdx = (idxAttr !== null && idxAttr !== undefined) ? parseInt(idxAttr, 10) : playlistIndex;
            this.playStoryFrom(targetIdx);
        });

        this.listEl.appendChild(block);

        // O(1) Incremental Playlist Synchronization (bypasses full O(N) chronicle traversal)
        this.storyPlaylist.push({
            elementId: beatId,
            chapterNum: chNum,
            pIndex: pIdx,
            text: entry.prose || '',
            dialogue: entry.dialogue || null,
            role: entry.isLorekeeper ? 'mentor' : 'narrator'
        });

        if (this.storyPlaylist.length > 0 && typeof this.prewarmBeat === 'function') {
            const nextIdx = (this.currentBeatIndex || 0) + 1;
            if (nextIdx < this.storyPlaylist.length) {
                this.prewarmBeat(this.storyPlaylist[nextIdx]);
            }
        }

        if (shouldScroll && this.scrollEl) {
            this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
        }

        return block;
    }

    renderChapterCard(ch, shouldScroll = true) {
        return this.renderStoryEntry(ch, shouldScroll);
    }

    renderFlowingParagraph(entry, shouldScroll = true) {
        return this.renderStoryEntry(entry, shouldScroll);
    }

    buildStoryPlaylist() {
        this.storyPlaylist = [];
        if (!this.activeChronicle || !this.activeChronicle.chapters) return;

        this.activeChronicle.chapters.forEach((ch, chIdx) => {
            const chNum = ch.chapter_num || (chIdx + 1);
            if (ch.paragraphs && ch.paragraphs.length > 0) {
                ch.paragraphs.forEach((p, pIdx) => {
                    const beatId = `chronicle-beat-${chNum}-${pIdx}`;
                    this.storyPlaylist.push({
                        elementId: beatId,
                        chapterNum: chNum,
                        pIndex: pIdx,
                        text: p.prose || '',
                        dialogue: p.dialogue || null,
                        role: p.isLorekeeper ? 'mentor' : 'narrator'
                    });
                });
            } else if (ch.prose) {
                const beatId = `chronicle-beat-${chNum}-0`;
                this.storyPlaylist.push({
                    elementId: beatId,
                    chapterNum: chNum,
                    pIndex: 0,
                    text: ch.prose || '',
                    dialogue: ch.dialogue || null,
                    role: ch.isLorekeeper ? 'mentor' : 'narrator'
                });
            }
        });

        // Synchronize DOM card indices with playlist
        if (this.listEl) {
            const cards = this.listEl.querySelectorAll('.flowing-paragraph-block, .chapter-card');
            cards.forEach((card, idx) => {
                card.setAttribute('data-beat-index', idx);
                const btn = card.querySelector('.flow-play-btn');
                if (btn) {
                    btn.setAttribute('data-beat-index', idx);
                }
            });
        }
    }

    toggleBeatPlayback(targetIdx) {
        if (!this.storyPlaylist || this.storyPlaylist.length === 0) {
            this.buildStoryPlaylist();
        }
        if (this.storyPlaylist.length === 0) return;

        targetIdx = Math.max(0, Math.min(targetIdx, this.storyPlaylist.length - 1));

        // If story playback is currently active on this card: pause it
        if (this.isStoryPlaying && this.currentBeatIndex === targetIdx && !this.audio?.isPaused) {
            this.pauseStoryPlayback();
            return;
        }

        // If story playback was paused on this card: resume it
        if (this.audio && this.audio.isPaused && this.pausedBeatIndex === targetIdx) {
            this.resumeStoryPlayback();
            return;
        }

        // Switching to a different beat: start playing immediately from this chosen beat
        this.playStoryFrom(targetIdx);
    }

    selectBeat(targetIdx) {
        if (!this.storyPlaylist || this.storyPlaylist.length === 0) {
            this.buildStoryPlaylist();
        }
        if (this.storyPlaylist.length === 0) return;

        targetIdx = Math.max(0, Math.min(targetIdx, this.storyPlaylist.length - 1));

        // If audio was paused on a different beat, discard old paused buffer
        if (this.audio && this.audio.isPaused && this.pausedBeatIndex !== null && this.pausedBeatIndex !== targetIdx) {
            this.audio.stopSpeaking();
            this.pausedBeatIndex = null;
        }

        this.currentBeatIndex = targetIdx;
        this._updateCardStates();

        if (this.statusTextEl) {
            const isSpeaking = (this.isStoryPlaying || (this.audio && this.audio.isSpeaking)) && !this.audio?.isPaused;
            if (isSpeaking) {
                this.statusTextEl.textContent = `▶ Reading passage ${targetIdx + 1} of ${this.storyPlaylist.length}`;
            } else if (this.audio && this.audio.isPaused && this.pausedBeatIndex === targetIdx) {
                this.statusTextEl.textContent = `⏸ Paused at passage ${targetIdx + 1} of ${this.storyPlaylist.length}`;
            } else {
                this.statusTextEl.textContent = `Passage ${targetIdx + 1} of ${this.storyPlaylist.length} selected — Press Play [Alt+P]`;
            }
        }
        this.updatePlayButtonUI();
    }

    playStoryFromElementId(elementIdOrIndex) {
        if (!this.storyPlaylist || this.storyPlaylist.length === 0) {
            this.buildStoryPlaylist();
        }
        if (this.storyPlaylist.length === 0) return;

        let foundIdx = -1;
        if (typeof elementIdOrIndex === 'number' && !isNaN(elementIdOrIndex)) {
            foundIdx = elementIdOrIndex;
        } else if (elementIdOrIndex) {
            foundIdx = this.storyPlaylist.findIndex(b => b.elementId === elementIdOrIndex);
            if (foundIdx === -1 && typeof elementIdOrIndex === 'string') {
                const match = elementIdOrIndex.match(/chronicle-beat-(\d+)(?:-(\d+))?/);
                if (match) {
                    const targetCh = parseInt(match[1], 10);
                    const targetP = match[2] !== undefined ? parseInt(match[2], 10) : 0;
                    foundIdx = this.storyPlaylist.findIndex(b => b.chapterNum === targetCh && b.pIndex === targetP);
                    if (foundIdx === -1) {
                        foundIdx = this.storyPlaylist.findIndex(b => b.chapterNum === targetCh);
                    }
                }
            }
        }

        if (foundIdx === -1) {
            foundIdx = (typeof this.currentBeatIndex === 'number' && this.currentBeatIndex >= 0)
                ? this.currentBeatIndex
                : 0;
        }

        this.toggleBeatPlayback(foundIdx);
    }

    async playStoryFrom(beatIndex = null) {
        if (!this.audio) return;
        if (!this.storyPlaylist || this.storyPlaylist.length === 0) {
            this.buildStoryPlaylist();
        }
        if (this.storyPlaylist.length === 0) return;

        // Auto-unmute for playback since player explicitly invoked Play
        if (!this.audio.enabled) {
            this.audio.setMuted(false);
            this.updateAudioControlsUI();
        }

        // Determine target beat index: default to current position ("play from where we are")
        let targetIdx = this.currentBeatIndex;
        if (typeof beatIndex === 'number' && !isNaN(beatIndex)) {
            targetIdx = beatIndex;
        } else if (targetIdx === null || targetIdx === undefined || targetIdx < 0) {
            targetIdx = 0;
        }
        targetIdx = Math.max(0, Math.min(targetIdx, this.storyPlaylist.length - 1));

        // If currently paused on the exact current beat and beatIndex wasn't changed, seamlessly resume
        if (this.audio.isPaused && this.pausedBeatIndex === targetIdx && (beatIndex === null || beatIndex === undefined || beatIndex === this.currentBeatIndex)) {
            this.resumeStoryPlayback();
            return;
        }

        // Stop prior speech immediately
        this.audio.stopSpeaking();
        this.pausedBeatIndex = null;

        // Increment playbackSessionId to invalidate any prior running or suspended loops
        const sessionId = ++this.playbackSessionId;

        this.currentBeatIndex = targetIdx;
        this.isStoryPlaying = true;
        this._updateCardStates();
        this.updatePlayButtonUI();

        await this._playNextBeat(sessionId);
    }

    /**
     * Lookahead Beat Pre-Warming:
     * Synthesizes and decodes an upcoming beat into an in-memory AudioBuffer ahead of time.
     * Guarantees 0ms delay between chapters and paragraphs during continuous audiobook playback.
     */
    prewarmBeat(beat) {
        if (!beat || !beat.text || !this.audio || typeof this.audio.prewarmUtterance !== 'function') return;
        if (this._isAudioMuted()) return;
        try {
            if (beat.role === 'mentor') {
                const mentorProfile = this.grounder ? this.grounder.resolveVoiceProfile({ name: 'Elder Lorekeeper', race: 'Human' }, this.currentHero, 'counsel', this.tradition) : null;
                if (mentorProfile) {
                    mentorProfile.geminiTag = '[solemnly, with wise gravitas]';
                    mentorProfile.directorNote = 'An ancient scholar and lorekeeper reciting the living chronicle';
                }
                const mOpts = { ...(mentorProfile || {}), engine: this.audio.ttsEngine || 'gemini' };
                this.audio.prewarmUtterance(beat.text, 'mentor', 'Elder Lorekeeper', null, mOpts).catch(() => {});
            } else {
                const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, this.currentHero, '', this.tradition) : null;
                const speakOpts = { ...(narrProfile || {}), narrator: narrProfile, engine: this.audio.ttsEngine || 'gemini' };
                this.audio.prewarmUtterance(beat.text, 'narrator', '', null, speakOpts).catch(() => {});
                if (beat.dialogue && beat.dialogue.text && !beat.dialogue.isNoise) {
                    const speakerEntity = beat.dialogue.creature || { name: beat.dialogue.speaker };
                    const cProfile = this.grounder ? this.grounder.resolveVoiceProfile(speakerEntity, this.currentHero, '', this.tradition) : null;
                    const dOpts = cProfile ? { ...cProfile, engine: this.audio.ttsEngine || 'gemini' } : { engine: this.audio.ttsEngine || 'gemini' };
                    this.audio.prewarmUtterance(beat.dialogue.text, 'creature', beat.dialogue.speaker, beat.dialogue.recommendedVoice || null, dOpts).catch(() => {});
                }
            }
        } catch (_) {}
    }

    async _playNextBeat(sessionId) {
        if (sessionId !== this.playbackSessionId || !this.isStoryPlaying || !this.audio) return;

        if (!this.storyPlaylist || this.storyPlaylist.length === 0) {
            this.buildStoryPlaylist();
        }
        if (this.currentBeatIndex >= this.storyPlaylist.length) {
            this.stopStoryPlayback();
            if (this.statusTextEl) {
                this.statusTextEl.textContent = '✓ Finished reading chronicle.';
            }
            return;
        }

        const beat = this.storyPlaylist[this.currentBeatIndex];
        if (!beat) {
            this.stopStoryPlayback();
            return;
        }

        // Visual Highlight & Card Button State Sync
        this._updateCardStates();

        const el = document.getElementById(beat.elementId) ||
                   document.querySelector(`[data-beat-index="${this.currentBeatIndex}"]`) ||
                   document.querySelector(`[data-beat-id="${beat.elementId}"]`) ||
                   document.querySelector(`[data-chapter-num="${beat.chapterNum}"][data-p-index="${beat.pIndex}"]`) ||
                   document.querySelector(`[data-chapter-num="${beat.chapterNum}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (this.statusTextEl) {
            this.statusTextEl.textContent = `▶ Reading passage ${this.currentBeatIndex + 1} of ${this.storyPlaylist.length}`;
        }
        this.updatePlayButtonUI();

        // Lookahead Beat Pre-Warming:
        // While the current beat is speaking aloud, immediately synthesize and decode
        // the next beat in the background so it plays with 0ms transition latency!
        if (this.currentBeatIndex + 1 < this.storyPlaylist.length) {
            const nextBeat = this.storyPlaylist[this.currentBeatIndex + 1];
            this.prewarmBeat(nextBeat);
        }

        this.isSpeakingBeat = true;
        try {
            if (beat.role === 'mentor') {
                const mentorProfile = this.grounder ? this.grounder.resolveVoiceProfile({ name: 'Elder Lorekeeper', race: 'Human' }, this.currentHero, 'counsel', this.tradition) : null;
                if (mentorProfile) {
                    mentorProfile.geminiTag = '[solemnly, with wise gravitas]';
                    mentorProfile.directorNote = 'An ancient scholar and lorekeeper reciting the living chronicle';
                }
                await this.audio.speakUtterance(beat.text, 'mentor', 'Elder Lorekeeper', null, mentorProfile || { engine: this.audio.ttsEngine });
            } else {
                const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, this.currentHero, '', this.tradition) : null;
                if (beat.dialogue && this.grounder) {
                    const speakerEntity = beat.dialogue.creature || { name: beat.dialogue.speaker };
                    beat.dialogue.voiceProfile = this.grounder.resolveVoiceProfile(speakerEntity, this.currentHero, '', this.tradition);
                }
                const speakOpts = {
                    narrator: narrProfile,
                    engine: this.audio.ttsEngine
                };
                await this.audio.speak(beat.text, beat.dialogue, null, null, 0, speakOpts);
            }
        } catch (err) {
            console.warn('[ChronicleManager] Playback error at beat', this.currentBeatIndex, err);
        } finally {
            this.isSpeakingBeat = false;
        }

        // Check if session changed during speech (user clicked Stop, Rewind, Seek, or Next)
        if (sessionId !== this.playbackSessionId) return;

        if (this.isStoryPlaying && !this.audio.isPaused) {
            this.currentBeatIndex++;
            await this._playNextBeat(sessionId);
        }
    }

    _updateCardStates() {
        if (!this.listEl) return;
        const currentIdx = (typeof this.currentBeatIndex === 'number') ? this.currentBeatIndex : -1;
        const isSpeaking = (this.isStoryPlaying || (this.audio && this.audio.isSpeaking)) && !this.audio?.isPaused;
        const isPaused = Boolean(this.audio && this.audio.isPaused && this.pausedBeatIndex === currentIdx);

        const cards = this.listEl.querySelectorAll('.flowing-paragraph-block, .chapter-card');
        cards.forEach((card, idx) => {
            const cardIdxAttr = card.getAttribute('data-beat-index');
            const cardIdx = (cardIdxAttr !== null && cardIdxAttr !== undefined) ? parseInt(cardIdxAttr, 10) : idx;
            const isTarget = (cardIdx === currentIdx);
            const playBtn = card.querySelector('.flow-play-btn');

            if (isTarget) {
                if (isSpeaking) {
                    card.classList.add('narrating-active', 'is-playing');
                    card.classList.remove('narrating-selected', 'is-paused');
                    if (playBtn) {
                        playBtn.textContent = '⏸';
                        playBtn.title = 'Pause passage [Alt+P]';
                        playBtn.classList.add('active', 'playing');
                        playBtn.classList.remove('paused');
                    }
                } else if (isPaused) {
                    card.classList.add('narrating-selected', 'is-paused');
                    card.classList.remove('narrating-active', 'is-playing');
                    if (playBtn) {
                        playBtn.textContent = '▶';
                        playBtn.title = 'Resume passage [Alt+P]';
                        playBtn.classList.add('active', 'paused');
                        playBtn.classList.remove('playing');
                    }
                } else {
                    card.classList.add('narrating-selected');
                    card.classList.remove('narrating-active', 'is-playing', 'is-paused');
                    if (playBtn) {
                        playBtn.textContent = '▶';
                        playBtn.title = 'Play passage from here';
                        playBtn.classList.remove('active', 'playing', 'paused');
                    }
                }
            } else {
                card.classList.remove('narrating-active', 'is-playing', 'is-paused', 'narrating-selected');
                if (playBtn) {
                    playBtn.textContent = '▶';
                    playBtn.title = 'Play passage from here';
                    playBtn.classList.remove('active', 'playing', 'paused');
                }
            }
        });
    }

    pauseStoryPlayback() {
        this.isStoryPlaying = false;
        this.pausedBeatIndex = this.currentBeatIndex;
        if (this.audio) {
            this.audio.pause();
        }
        if (this.statusTextEl) {
            const beatNum = (typeof this.currentBeatIndex === 'number' && this.currentBeatIndex >= 0) ? this.currentBeatIndex + 1 : 1;
            const total = (this.storyPlaylist && this.storyPlaylist.length) ? this.storyPlaylist.length : beatNum;
            this.statusTextEl.textContent = `⏸ Paused at passage ${beatNum} of ${total}`;
        }
        this._updateCardStates();
        this.updatePlayButtonUI();
    }

    resumeStoryPlayback() {
        if (this.pausedBeatIndex !== null && this.pausedBeatIndex !== this.currentBeatIndex) {
            if (this.audio) this.audio.stopSpeaking();
            this.pausedBeatIndex = null;
            this.playStoryFrom(this.currentBeatIndex);
            return;
        }

        this.isStoryPlaying = true;
        this.pausedBeatIndex = null;
        if (this.audio) {
            this.audio.resume();
        }
        if (this.statusTextEl) {
            const beatNum = (typeof this.currentBeatIndex === 'number' && this.currentBeatIndex >= 0) ? this.currentBeatIndex + 1 : 1;
            const total = (this.storyPlaylist && this.storyPlaylist.length) ? this.storyPlaylist.length : beatNum;
            this.statusTextEl.textContent = `▶ Reading passage ${beatNum} of ${total}`;
        }
        this._updateCardStates();
        this.updatePlayButtonUI();

        // If no utterance was actively suspended mid-speech, resume loop to next beat
        if (!this.isSpeakingBeat && (!this.audio || !this.audio.isSpeaking)) {
            this._playNextBeat(this.playbackSessionId);
        }
    }

    toggleStoryPlayback() {
        if (this.isVoiceLoading) {
            console.log('[ChronicleManager] Voice is currently generating/loading, ignoring impatient play click.');
            return;
        }
        const isSpeaking = (this.isStoryPlaying || (this.audio && this.audio.isSpeaking)) && !this.audio?.isPaused;
        if (isSpeaking) {
            this.pauseStoryPlayback();
        } else if (this.audio && this.audio.isPaused && this.pausedBeatIndex === this.currentBeatIndex) {
            this.resumeStoryPlayback();
        } else {
            this.playStoryFrom(this.currentBeatIndex);
        }
    }

    stopStoryPlayback() {
        this.playbackSessionId++; // Invalidate running loops
        this.isStoryPlaying = false;
        this.isSpeakingBeat = false;
        this.pausedBeatIndex = null;
        if (this.audio) {
            this.audio.stopSpeaking();
        }
        this._updateCardStates();
        if (this.statusTextEl) {
            const beatNum = (typeof this.currentBeatIndex === 'number' && this.currentBeatIndex >= 0) ? this.currentBeatIndex + 1 : 1;
            const total = (this.storyPlaylist && this.storyPlaylist.length) ? this.storyPlaylist.length : beatNum;
            this.statusTextEl.textContent = `⏹ Stopped at passage ${beatNum} of ${total}`;
        }
        this.updatePlayButtonUI();
    }

    rewindStoryPlayback() {
        if (!this.storyPlaylist || this.storyPlaylist.length === 0) {
            this.buildStoryPlaylist();
        }
        if (this.storyPlaylist.length === 0) return;

        const isSpeaking = (this.isStoryPlaying || (this.audio && this.audio.isSpeaking)) && !this.audio?.isPaused;
        const currentTime = (this.audio && typeof this.audio.getCurrentTime === 'function')
            ? this.audio.getCurrentTime()
            : 0;

        let targetIdx = this.currentBeatIndex;
        if (isSpeaking && currentTime > 2.0) {
            targetIdx = this.currentBeatIndex;
        } else {
            targetIdx = Math.max(0, this.currentBeatIndex - 1);
        }

        if (isSpeaking) {
            this.playStoryFrom(targetIdx);
        } else {
            this.selectBeat(targetIdx);
            const el = document.querySelector(`[data-beat-index="${targetIdx}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    forwardStoryPlayback() {
        if (!this.storyPlaylist || this.storyPlaylist.length === 0) {
            this.buildStoryPlaylist();
        }
        if (this.storyPlaylist.length === 0) return;

        const isSpeaking = (this.isStoryPlaying || (this.audio && this.audio.isSpeaking)) && !this.audio?.isPaused;
        const targetIdx = Math.min(this.storyPlaylist.length - 1, this.currentBeatIndex + 1);

        if (isSpeaking) {
            this.playStoryFrom(targetIdx);
        } else {
            this.selectBeat(targetIdx);
            const el = document.querySelector(`[data-beat-index="${targetIdx}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    updatePlayButtonUI() {
        const isSpeaking = (this.isStoryPlaying || (this.audio && this.audio.isSpeaking)) && !this.audio?.isPaused;
        const isPaused = Boolean(this.audio && this.audio.isPaused && this.pausedBeatIndex === this.currentBeatIndex);

        if (this.btnPlayStory) {
            if (this.isVoiceLoading) {
                this.btnPlayStory.classList.add('loading');
                this.btnPlayStory.disabled = true;
                this.btnPlayStory.innerHTML = `<span class="voice-loading-spinner"></span> <span class="btn-play-text">Voicing...</span>`;
                return;
            }
            this.btnPlayStory.disabled = false;
            this.btnPlayStory.classList.remove('loading');
            if (isSpeaking) {
                this.btnPlayStory.textContent = '⏸ Pause';
                this.btnPlayStory.title = 'Pause Story Audio [Alt+P]';
                this.btnPlayStory.classList.add('active');
            } else if (isPaused) {
                this.btnPlayStory.textContent = '▶ Resume';
                this.btnPlayStory.title = 'Resume Story Audio [Alt+P]';
                this.btnPlayStory.classList.add('active');
            } else {
                this.btnPlayStory.textContent = '▶ Play';
                this.btnPlayStory.title = 'Play Story from Selected Passage [Alt+P]';
                this.btnPlayStory.classList.remove('active');
            }
        }
        if (this.btnStopStory) {
            if (isSpeaking || isPaused) {
                this.btnStopStory.classList.add('active');
            } else {
                this.btnStopStory.classList.remove('active');
            }
        }
    }

    onVoiceLoadingState(loading, details) {
        this.isVoiceLoading = !!loading;
        if (this.btnPlayStory) {
            this.btnPlayStory.classList.toggle('loading', this.isVoiceLoading);
            if (this.isVoiceLoading) {
                this.btnPlayStory.disabled = true;
                this.btnPlayStory.innerHTML = `<span class="voice-loading-spinner"></span> <span class="btn-play-text">Voicing...</span>`;
                this.btnPlayStory.title = 'Generating voice with Gemini... please wait';
            } else {
                this.btnPlayStory.disabled = false;
                this.updatePlayButtonUI();
            }
        }
        if (this.statusTextEl) {
            if (this.isVoiceLoading) {
                this.statusTextEl.classList.add('voice-loading-pulse');
                this.statusTextEl.innerHTML = `<span class="voice-pulse-dot"></span> ${details || 'Voicing chronicle with Gemini...'}`;
            } else {
                this.statusTextEl.classList.remove('voice-loading-pulse');
            }
        }
    }

    getLedgerSummary() {
        if (!this.unvoicedEventLedger || this.unvoicedEventLedger.length === 0) return '';
        let paces = 0, strikes = 0, spells = 0, potions = 0, kills = 0;
        for (const item of this.unvoicedEventLedger) {
            const ev = item.event;
            if (!ev) continue;
            const t = ev.type;
            if (t === 'HERO_MOVE' || t === 'EXPLORATION_FLOW' || t === 'FLOOR_CHANGE' || t === 'STEP') {
                paces++;
            } else if (t === 'COMBAT_EXCHANGE' || t === 'COMBAT_EPISODE' || t === 'MELEE_ATTACK' || t === 'MISSILE_ATTACK') {
                strikes++;
                if (ev.data && Array.isArray(ev.data.kills) && ev.data.kills.length > 0) kills += ev.data.kills.length;
            } else if (t === 'POTION_QUAFFED' || t === 'HEALING_DRAUGHT') {
                potions++;
            } else if (t === 'UNIQUE_SLAIN' || t === 'MONSTER_DIES') {
                kills++;
            } else if (ev.data && ev.data.attackMedium && (ev.data.attackMedium.type === 'spell' || ev.data.attackMedium.method === 'spell')) {
                spells++;
            }
        }
        const parts = [];
        if (paces > 0) parts.push(`${paces} pace${paces > 1 ? 's' : ''}`);
        if (strikes > 0) parts.push(`${strikes} strike${strikes > 1 ? 's' : ''}`);
        if (spells > 0) parts.push(`${spells} spell${spells > 1 ? 's' : ''}`);
        if (potions > 0) parts.push(`${potions} potion${potions > 1 ? 's' : ''}`);
        if (kills > 0) parts.push(`${kills} kill${kills > 1 ? 's' : ''}`);
        return parts.length > 0 ? parts.join(', ') : `${this.unvoicedEventLedger.length} action${this.unvoicedEventLedger.length > 1 ? 's' : ''}`;
    }

    showHudToast(text, duration = 3200) {
        if (!this.hudToastEl) return;
        this.hudToastEl.innerHTML = text;
        this.hudToastEl.style.display = 'inline-flex';
        this.hudToastEl.classList.remove('fade-out');
        this.hudToastEl.classList.add('visible');

        if (this._toastTimeout) clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            if (this.hudToastEl) {
                this.hudToastEl.classList.add('fade-out');
                setTimeout(() => {
                    if (this.hudToastEl && this.hudToastEl.classList.contains('fade-out')) {
                        this.hudToastEl.style.display = 'none';
                        this.hudToastEl.classList.remove('visible', 'fade-out');
                    }
                }, 400);
            }
        }, duration);
    }

    onVocalStateChanged(state, telemetry = {}) {
        this.isVoiceLoading = (state === 'loading');

        // Update Header Vocal Pill
        if (this.vocalPillEl) {
            if (this._pillInterruptedTimeout) {
                clearTimeout(this._pillInterruptedTimeout);
                this._pillInterruptedTimeout = null;
            }

            if (state === 'loading') {
                this.vocalPillEl.className = 'chronicle-vocal-pill loading';
                this.vocalPillEl.innerHTML = '<span class="voice-loading-spinner-micro"></span> Voicing...';
                this.vocalPillEl.style.display = 'inline-flex';
                this.vocalPillEl.title = telemetry.details || 'Synthesizing voice with Gemini...';
            } else if (state === 'speaking') {
                this.vocalPillEl.className = 'chronicle-vocal-pill speaking';
                this.vocalPillEl.innerHTML = '<span class="voice-wave-anim"><span></span><span></span><span></span></span> Speaking';
                this.vocalPillEl.style.display = 'inline-flex';
                this.vocalPillEl.title = `Voicing: ${telemetry.role || 'narrator'}`;
            } else if (state === 'interrupted') {
                this.vocalPillEl.className = 'chronicle-vocal-pill interrupted';
                this.vocalPillEl.innerHTML = '⚡ Interrupted';
                this.vocalPillEl.style.display = 'inline-flex';
                this.vocalPillEl.title = `Voice interrupted: ${telemetry.reason || 'action'}`;
                this._pillInterruptedTimeout = setTimeout(() => {
                    if (this.vocalPillEl && this.vocalPillEl.classList.contains('interrupted')) {
                        this.vocalPillEl.style.display = 'none';
                        this.vocalPillEl.className = 'chronicle-vocal-pill idle';
                    }
                }, 2500);
            } else {
                this.vocalPillEl.className = 'chronicle-vocal-pill idle';
                this.vocalPillEl.style.display = 'none';
            }
        }

        // Update Top Bar Tome Button Visual Flare
        if (this.navBtn) {
            this.navBtn.classList.toggle('is-loading-voice', state === 'loading');
            this.navBtn.classList.toggle('is-voicing', state === 'speaking');
            if (state === 'interrupted') {
                this.navBtn.classList.add('is-interrupted-voice');
                setTimeout(() => {
                    if (this.navBtn) this.navBtn.classList.remove('is-interrupted-voice');
                }, 2200);
            }
        }

        // 3D HUD Toast notifications for non-intrusive awareness during first-person exploration
        if (state === 'loading') {
            this.showHudToast('⏳ Voicing chronicle with Gemini...', 3000);
        } else if (state === 'interrupted') {
            const reasonText = telemetry.reason === 'handoff' ? 'New event preempted voice' : 'Action interrupted voice';
            this.showHudToast(`⚡ ${reasonText}`, 3000);
            this.markCurrentBeatInterrupted(telemetry.reason || 'handoff');
        }
    }

    markCurrentBeatInterrupted(reason = 'handoff', skippedSummary = null) {
        if (!this.listEl) return;
        const currentIdx = (typeof this.currentBeatIndex === 'number') ? this.currentBeatIndex : -1;
        const activeCard = (currentIdx >= 0 ? this.listEl.querySelector(`[data-beat-index="${currentIdx}"]`) : null) ||
                           this.listEl.querySelector('.flowing-paragraph-block.narrating-active') ||
                           this.listEl.querySelector('.flowing-paragraph-block.is-playing') ||
                           this.listEl.lastElementChild;
        if (!activeCard) return;

        activeCard.classList.add('is-interrupted');
        activeCard.classList.remove('narrating-active', 'is-playing');

        // Header badge
        const headerEl = activeCard.querySelector('.flowing-paragraph-header');
        if (headerEl && !headerEl.querySelector('.badge-interrupted')) {
            const badge = document.createElement('span');
            badge.className = 'badge-interrupted';
            const extra = skippedSummary ? ` (+${skippedSummary})` : '';
            badge.textContent = `⚡ Interrupted${extra}`;
            badge.title = 'Dialogue/narration cut short by rapid combat or movement';
            const playBtn = headerEl.querySelector('.flow-play-btn');
            if (playBtn) {
                headerEl.insertBefore(badge, playBtn);
            } else {
                headerEl.appendChild(badge);
            }
        }

        // Dialogue note
        const dialogueEl = activeCard.querySelector('.chapter-dialogue');
        if (dialogueEl && !activeCard.querySelector('.dialogue-cut-short-note')) {
            const note = document.createElement('div');
            note.className = 'dialogue-cut-short-note';
            note.innerHTML = '<em>— Voice trailed off as the battle pressed onward —</em>';
            dialogueEl.appendChild(note);
        }
    }

    /**
     * Interacts with a creature clicked in 3D:
     * Greets the player in character or emits creature noise, opens the chat bar, and speaks aloud if vocal.
     */
    async interactWithCreature(monster) {
        if (!monster) return;
        this.targetedCreature = monster;
        monster._interactTurn = (monster._interactTurn || 0) + 1;
        if (this.dungeon && this.dungeon.monsters) {
            for (const ent of this.dungeon.monsters.values()) {
                if (ent.monsterData && ((monster.id !== undefined && ent.monsterData.id === monster.id) || (ent.monsterData.x === monster.x && ent.monsterData.y === monster.y && ent.monsterData.glyph === monster.glyph))) {
                    ent._interactTurn = monster._interactTurn;
                    ent.monsterData._interactTurn = monster._interactTurn;
                }
            }
        }

        // Ensure Chronicle window is visible and unminimized
        this.showWindow();
        if (this.windowEl && this.windowEl.classList.contains('minimized')) {
            this.windowEl.classList.remove('minimized');
            if (this.btnExpand) this.btnExpand.textContent = '▲ Min';
        }

        const stateObj = this.grounder.resolveCreatureState(monster, this.lastSeenMessages);

        // Show Contextual Creature Target Pill
        if (this.targetPill && this.targetLabel) {
            this.targetPill.classList.remove('hidden');
            if (stateObj.state === 'sleeping') {
                this.targetLabel.innerHTML = `😴 Target: <b>${monster.name}</b> <span style="font-size: 0.8rem; opacity: 0.8;">(Asleep)</span>`;
            } else if (stateObj.state === 'begging') {
                this.targetLabel.innerHTML = `🤲 Target: <b>${monster.name}</b> <span style="font-size: 0.8rem; opacity: 0.8;">(Pleading)</span>`;
            } else if (!stateObj.canSpeak) {
                this.targetLabel.innerHTML = `🐾 Target: <b>${monster.name}</b> <span style="font-size: 0.8rem; opacity: 0.8;">(Non-vocal)</span>`;
            } else {
                this.targetLabel.innerHTML = `🗣️ Target: <b>${monster.name}</b>`;
            }
        }
        if (this.inputQuery) {
            if (stateObj.state === 'sleeping') {
                this.inputQuery.placeholder = `${monster.name} is fast asleep...`;
            } else if (stateObj.state === 'begging') {
                this.inputQuery.placeholder = `Give coin or speak to ${monster.name}...`;
            } else if (!stateObj.canSpeak) {
                this.inputQuery.placeholder = `Observe ${monster.name}...`;
            } else {
                this.inputQuery.placeholder = `Talk to ${monster.name}...`;
            }
            this.inputQuery.focus();
        }

        // Initial Greeting / Reaction from the creature with full scene prose
        let res = null;
        if (this.llm && this.llm.isConfigured()) {
            res = await this.llm.chatWithCreature(monster, '', this.currentHero, this.lastSeenMessages);
        } else {
            res = this.grounder.resolveCreatureEncounter(monster, this.currentHero, this.lastSeenMessages, monster._interactTurn, '');
        }

        // Render Creature Card in Chronicle
        if (this.listEl && res && (res.prose || res.text)) {
            const card = document.createElement('div');
            card.className = 'chapter-card creature-chat-card';

            let bodyHtml = '';
            if (res.prose) {
                bodyHtml += `<p class="chapter-prose" style="margin-bottom: 6px;">${res.prose}</p>`;
            }
            if (res.isDialogue && res.text) {
                bodyHtml += `
                    <div class="chapter-dialogue" style="margin-top: 4px;">
                        <span class="dialogue-speaker">${monster.name}</span>
                        <span>"${res.text}"</span>
                    </div>
                `;
            } else if (!res.isDialogue && res.text) {
                bodyHtml += `
                    <div class="chapter-dialogue creature-sound-box" style="margin-top: 4px;">
                        <span class="dialogue-speaker">${monster.name}</span>
                        <span class="dialogue-sound-noise">${res.text}</span>
                    </div>
                `;
            }

            const headingLabel = (stateObj.state === 'sleeping')
                ? `Observation: ${monster.name} (Asleep)`
                : (stateObj.state === 'begging' ? `Alms: ${monster.name}` : `Encounter: ${monster.name}`);

            card.innerHTML = `
                <div class="chapter-header-row">
                    <span class="chapter-heading creature-chat-speaker">${headingLabel}</span>
                    <button class="chapter-replay-btn" title="Listen to narration">▶ Play</button>
                </div>
                ${bodyHtml}
            `;
            const replayBtn = card.querySelector('.chapter-replay-btn');
            if (replayBtn) {
                replayBtn.addEventListener('click', () => {
                    if (this.audio) {
                        const cVoiceProfile = this.grounder ? this.grounder.resolveVoiceProfile(monster, this.currentHero, stateObj.state, this.tradition) : null;
                        const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, this.currentHero, stateObj.state, this.tradition) : null;
                        const speakOpts = { narrator: narrProfile, engine: this.audio.ttsEngine };
                        if (res.isDialogue && res.text) {
                            this.audio.speak(res.prose, { text: res.text, speaker: monster.name, recommendedVoice: res.recommendedVoice, voiceProfile: cVoiceProfile }, null, null, 0, speakOpts);
                        } else if (res.prose) {
                            this.audio.speakUtterance(res.prose, 'narrator', '', null, narrProfile || { engine: this.audio.ttsEngine });
                        }
                    }
                });
            }
            this.listEl.appendChild(card);
            if (this.scrollEl) this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
        }

        // Voice playback upon encounter: speak aloud for ALL entities with contextual casting
        if (this.audio && !this._isAudioMuted() && res) {
            const cVoiceProfile = this.grounder ? this.grounder.resolveVoiceProfile(monster, this.currentHero, stateObj.state, this.tradition) : null;
            const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, this.currentHero, stateObj.state, this.tradition) : null;
            const speakOpts = { narrator: narrProfile, engine: this.audio.ttsEngine };
            if (res.isDialogue && res.text) {
                // Awake vocal creature: speak atmospheric scene prose then creature line in character
                this.audio.speak(res.prose, { text: res.text, speaker: monster.name, recommendedVoice: res.recommendedVoice, voiceProfile: cVoiceProfile }, null, null, 0, speakOpts);
            } else if (res.prose) {
                // Sleeping or non-vocal creature: Master Chronicler speaks the scene aloud
                this.audio.speakUtterance(res.prose, 'narrator', '', null, narrProfile || { engine: this.audio.ttsEngine });
            }
        }
    }

    clearTargetCreature() {
        this.targetedCreature = null;
        if (this.targetPill) this.targetPill.classList.add('hidden');
        if (this.inputQuery) {
            this.inputQuery.placeholder = 'Ask the Lorekeeper about keys, items, or tactics...';
        }
    }

    async submitUserQuery() {
        if (!this.inputQuery) return;
        const text = this.inputQuery.value.trim();
        if (!text) return;
        this.inputQuery.value = '';

        if (this.targetedCreature) {
            // Player talking directly to targeted creature
            const creature = this.targetedCreature;
            creature._interactTurn = (creature._interactTurn || 0) + 1;
            if (this.dungeon && this.dungeon.monsters) {
                for (const ent of this.dungeon.monsters.values()) {
                    if (ent.monsterData && ((creature.id !== undefined && ent.monsterData.id === creature.id) || (ent.monsterData.x === creature.x && ent.monsterData.y === creature.y && ent.monsterData.glyph === creature.glyph))) {
                        ent._interactTurn = creature._interactTurn;
                        ent.monsterData._interactTurn = creature._interactTurn;
                    }
                }
            }

            let reply = null;
            if (this.llm && this.llm.isConfigured()) {
                reply = await this.llm.chatWithCreature(creature, text, this.currentHero, this.lastSeenMessages);
            } else {
                reply = this.grounder.resolveCreatureEncounter(creature, this.currentHero, this.lastSeenMessages, creature._interactTurn, text);
            }

            const userHeroName = (this.currentHero && this.currentHero.name) ? this.currentHero.name : 'The hero';
            const combinedProse = reply && reply.prose
                ? `Addressing ${creature.name}, ${userHeroName} speaks: "${text}". ${reply.prose}`
                : `Addressing ${creature.name}, ${userHeroName} speaks: "${text}".`;

            const cVoiceProfile = this.grounder ? this.grounder.resolveVoiceProfile(creature, this.currentHero, 'dialogue', this.tradition) : null;
            const narrProfile = this.grounder ? this.grounder.resolveVoiceProfile(null, this.currentHero, 'dialogue', this.tradition) : null;

            const entry = {
                title: `Encounter: ${creature.name}`,
                depth: (this.currentHero && typeof this.currentHero.depth === 'number') ? this.currentHero.depth : 0,
                prose: combinedProse,
                dialogue: (reply && reply.text) ? {
                    speaker: creature.name,
                    text: reply.text,
                    isNoise: !reply.isDialogue,
                    creature: creature,
                    recommendedVoice: reply.recommendedVoice,
                    voiceProfile: cVoiceProfile
                } : null,
                timestamp: Date.now()
            };

            this.store.appendChapter(this.activeChronicle, entry);
            this.renderStoryEntry(entry, true);

            if (this.audio && !this._isAudioMuted()) {
                const speakOpts = { narrator: narrProfile, engine: this.audio.ttsEngine };
                if (entry.dialogue) {
                    this.audio.speak(entry.prose, entry.dialogue, null, null, 0, speakOpts);
                } else {
                    this.audio.speakUtterance(entry.prose, 'narrator', '', null, narrProfile || { engine: this.audio.ttsEngine });
                }

                if (this.listEl) {
                    document.querySelectorAll('.narrating-active').forEach(el => el.classList.remove('narrating-active'));
                    const chNum = entry.chapter_num;
                    const pIdx = (entry.pIndex !== undefined) ? entry.pIndex : 0;
                    const activeEl = document.getElementById(`chronicle-beat-${chNum}-${pIdx}`) || document.querySelector(`[data-chapter-num="${chNum}"]`);
                    if (activeEl) {
                        activeEl.classList.add('narrating-active');
                        if (this.scrollEl) {
                            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }
                }
            }
        } else {
            // Player asking Lorekeeper for survival / mechanics counsel
            let answer = '';
            try {
                if (this.llm && this.llm.isConfigured()) {
                    answer = await this.llm.consultLorekeeper(text, this.currentHero);
                } else {
                    answer = this.grounder.answerSurvivalQuery(text, this.currentHero);
                }
            } catch (err) {
                console.warn('[ChronicleManager] Lorekeeper consult error, falling back:', err);
                answer = this.grounder.answerSurvivalQuery(text, this.currentHero);
            }

            if (!answer) {
                answer = "The lore on this matter is shrouded in the mists of time, yet vigilance and steady courage will keep you whole.";
            }

            // Weave Lorekeeper counsel seamlessly and non-repetitively into the permanent saga!
            this.weaveLorekeeperCounsel(text, answer, this.currentHero);
        }
    }

    weaveLorekeeperCounsel(queryText, answer, player) {
        const q = (queryText || '').toLowerCase();
        const pName = (player && player.name) ? player.name : 'Hero';
        const pRace = (player && player.race) ? player.race : 'Human';
        const pClass = (player && player.class) ? player.class : 'Warrior';
        
        // Determine topic for evocative narrative framing
        let topic = 'the ways of survival';
        if (q.includes('potion') || q.includes('heal') || q.includes('quaff') || q.includes('cure')) topic = 'healing draughts and vials';
        else if (q.includes('rest') || q.includes('sleep') || q.includes('mana')) topic = 'safe rest and recovery';
        else if (q.includes('spell') || q.includes('magic') || q.includes('cast')) topic = 'the arcane incantations';
        else if (q.includes('terminal') || q.includes('crt') || q.includes('ascii')) topic = 'the ancient runic terminal of 1990';
        else if (q.includes('food') || q.includes('starve') || q.includes('eat')) topic = 'iron rations and sustenance';
        else if (q.includes('light') || q.includes('torch') || q.includes('lantern')) topic = 'torches and illumination';
        else if (q.includes('speed') || q.includes('fast') || q.includes('haste')) topic = 'the virtue of swiftness';
        else if (q.includes('shop') || q.includes('store') || q.includes('town')) topic = 'the shops of the frontier town';
        else if (q.includes('escape') || q.includes('phase door') || q.includes('teleport')) topic = 'tactical retreat and phase doors';
        else if (q.includes('weapon') || q.includes('armor') || q.includes('wield')) topic = 'arms, armor, and burdens';
        else if (q.includes('beggar') || q.includes('crime') || q.includes('innocent')) topic = 'the streets and beggars of town';
        else if (q.includes('corridor') || q.includes('funnel') || q.includes('choke')) topic = 'corridor funnels and doorways';
        else if (q.includes('bow') || q.includes('arrow') || q.includes('missile')) topic = 'bows, slings, and archery';
        else if (q.includes('trap') || q.includes('disarm') || q.includes('search')) topic = 'hidden traps and subterranean snares';
        else if (q.includes('drain') || q.includes('stat') || q.includes('wight')) topic = 'dark drains of mortal vigor';
        else if (q.includes('feeling') || q.includes('level') || q.includes('danger')) topic = 'the foreboding sense of the deeps';

        // Rotate narrative intros with character perspective (anti-repetitive hashing)
        this.lorekeeperQueryCount = (this.lorekeeperQueryCount || 0) + 1;
        const turnSeed = this.lorekeeperQueryCount;
        
        let intro = '';
        if (pRace.toLowerCase().includes('half-orc')) {
            const orcIntros = [
                `Pausing amidst the dank gloom, ${pName} turns over hard-learned street wisdom regarding ${topic}:`,
                `Leaning against the rough masonry, ${pName} recalls the cynical counsel of elder scoundrels concerning ${topic}:`,
                `With a sharp half-orc grin, ${pName} brings to mind the pragmatic secrets of survival regarding ${topic}:`,
                `In the quiet between perils, ${pName} weighs what he knows of ${topic} against the cruel reality of the deeps:`
            ];
            intro = orcIntros[turnSeed % orcIntros.length];
        } else if (pRace.toLowerCase().includes('elf')) {
            const elfIntros = [
                `The fair blood of ${pName} stirs with ancient recollections of the First Age, recalling the wise words of Imladris regarding ${topic}:`,
                `Pausing in reverent stillness, ${pName} calls to mind the elven teachings of old concerning ${topic}:`,
                `A quiet memory from elder annals surfaces in ${pName}'s thoughts, shedding light upon ${topic}:`,
                `Listening to the whisper of stone and wind, ${pName} reflects upon the timeless nature of ${topic}:`
            ];
            intro = elfIntros[turnSeed % elfIntros.length];
        } else if (pRace.toLowerCase().includes('dwarf')) {
            const dwarfIntros = [
                `Grasping iron and stone, ${pName} recalls the stern maxims hammered into dwarven memory concerning ${topic}:`,
                `The time-tested wisdom of the Mountain Kings echoes in ${pName}'s thoughts, speaking plainly of ${topic}:`,
                `With dwarven pragmatism, ${pName} considers the craft and counsel of ancestors regarding ${topic}:`,
                `Pausing to inspect the dungeon masonry, ${pName} recollects the unyielding laws of ${topic}:`
            ];
            intro = dwarfIntros[turnSeed % dwarfIntros.length];
        } else {
            const generalIntros = [
                `In the subterranean silence, ${pName} recalls elder counsel regarding ${topic}:`,
                `Pausing in thought, the hero reflects upon ancient knowledge concerning ${topic}:`,
                `The Chronicler dips quill in ink to record wisdom passed down through generations regarding ${topic}:`,
                `A whisper of ancestral guidance illuminates the peril, laying bare the truth of ${topic}:`,
                `Consulting the weathered marginalia of ancient lore, the mysteries of ${topic} are made plain:`,
                `In the stillness before the next battle, the counsel of the Wise echoes in ${pName}'s mind concerning ${topic}:`
            ];
            intro = generalIntros[turnSeed % generalIntros.length];
        }

        const mentorProfile = this.grounder ? this.grounder.resolveVoiceProfile({ name: 'Elder Lorekeeper', race: 'Human' }, player, 'counsel', this.tradition) : null;
        if (mentorProfile) {
            mentorProfile.geminiTag = '[solemnly, with wise gravitas]';
            mentorProfile.directorNote = 'An ancient scholar and lorekeeper offering survival counsel';
        }

        const entry = {
            title: `Counsel of the Wise: ${topic}`,
            depth: (player && typeof player.depth === 'number') ? player.depth : 0,
            prose: `${intro}\n\n"${answer}"`,
            dialogue: null,
            insight: answer,
            isLorekeeper: true,
            timestamp: Date.now()
        };

        // Append to active chronicle so it becomes part of the permanent saga
        if (!this.activeChronicle || !this.activeChronicle.chapters || this.activeChronicle.chapters.length === 0) {
            this.store.appendChapter(this.activeChronicle, entry);
            entry.pIndex = 0;
            this.renderChapterCard(entry, true);
        } else {
            this.store.appendParagraph(this.activeChronicle, entry);
            const currentChapter = this.activeChronicle.chapters[this.activeChronicle.chapters.length - 1];
            entry.chapter_num = currentChapter.chapter_num;
            entry.pIndex = currentChapter.paragraphs ? currentChapter.paragraphs.length - 1 : 0;
            this.renderFlowingParagraph(entry, true);
        }

        // Voice immediately in the deep, warm Mentor voice speaking the full prose (matching card 100%)
        if (this.audio && this.audio.enabled) {
            this.audio.speakUtterance(entry.prose, 'mentor', 'Elder Lorekeeper', null, mentorProfile || { engine: this.audio.ttsEngine });

            this._highlightActiveCard(entry);
        }
    }

    toggleMicrophone() {
        if (!this.audio || !this.btnMic) return;

        if (this.audio.isListeningMic) {
            this.audio.stopMicrophone();
            this.btnMic.classList.remove('listening');
        } else {
            this.btnMic.classList.add('listening');
            const started = this.audio.startMicrophone(
                (interim) => {
                    if (this.inputQuery) this.inputQuery.value = interim;
                },
                (finalText) => {
                    this.btnMic.classList.remove('listening');
                    if (this.inputQuery) this.inputQuery.value = finalText;
                    this.submitUserQuery();
                },
                (error) => {
                    this.btnMic.classList.remove('listening');
                    console.warn('[ChronicleManager] Mic error:', error);
                }
            );

            if (!started) {
                this.btnMic.classList.remove('listening');
            }
        }
    }

    // --- Export / Import Handlers ---

    exportChronicle(format = 'json') {
        if (!this.activeChronicle) return;
        const filename = `${(this.activeChronicle.title || 'chronicle').toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

        let content = '';
        let mime = 'application/json';
        let ext = 'json';

        if (format === 'html') {
            content = this.store.exportAsStandaloneHtml(this.activeChronicle);
            mime = 'text/html';
            ext = 'html';
        } else {
            content = this.store.exportAsJson(this.activeChronicle);
        }

        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleFileImport(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!imported || !imported.chapters) {
                    alert('Invalid chronicle file format.');
                    return;
                }

                // Mark explicitly as manually imported so it resumes across reloads
                imported.isManuallyImported = true;

                // Compatibility & "The Torch Passes" Check
                const compat = this.store.checkCompatibility(imported, this.currentHero);
                if (compat.isNewHero) {
                    const prevName = compat.previousProtagonist ? compat.previousProtagonist.name : 'The Fallen';
                    const newName = compat.newProtagonist.name;
                    const bridgeProse = `Kicking aside the ancient ash at ${compat.newProtagonist.depth * 50}ft, ${newName} discovers a waterlogged, leather-bound grimoire—the final journal of ${prevName}. Reading of battles fought and horrors endured, ${newName} grips their steel firmly. A new hand now turns the blank pages of this legend.`;
                    
                    this.store.passTorch(imported, compat.newProtagonist, bridgeProse);
                }

                this.activeChronicle = imported;
                this.store.saveActive(this.activeChronicle);
                if (this.currentHero) {
                    this.currentCharacterSignature = `${this.currentHero.name || 'Hero'}_${this.currentHero.race || ''}_${this.currentHero.class || ''}`;
                }
                this.characterDied = false;
                this.renderAllChapters();
                alert(`Successfully loaded: "${this.activeChronicle.title}" (${this.activeChronicle.chapters.length} chapters)`);
            } catch (err) {
                alert('Failed to parse chronicle file: ' + err.message);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }

    // --- Settings Modal ---

    openSettings() {
        if (!this.settingsModal) return;
        if (this.audio) this.audio.setEngine('gemini');
        if (this.selectSpeed && this.audio) this.selectSpeed.value = String(this.audio.speed || 1.0);

        if (this.sliderReverb && this.audio) {
            const revPct = Math.round((this.audio.reverbWet !== undefined ? this.audio.reverbWet : 0.10) * 100);
            this.sliderReverb.value = revPct;
            if (this.valReverb) this.valReverb.textContent = `${revPct}%`;
        }

        if (this.llm) {
            if (this.selectProvider) this.selectProvider.value = this.llm.provider;
            if (this.inputApiKey) {
                if (this.llm.hasServerKey && !this.llm.apiKey) {
                    this.inputApiKey.value = '';
                    this.inputApiKey.placeholder = '●●●●●●●● (Protected Server Key Active)';
                    if (this.apiKeyStatus) {
                        this.apiKeyStatus.style.color = '#4ade80';
                        this.apiKeyStatus.textContent = '✓ Protected server key active';
                    }
                } else {
                    this.inputApiKey.value = this.llm.apiKey || '';
                    this.inputApiKey.placeholder = 'Paste your API key here...';
                }
            }
            
            let m = this.llm.model;
            if (m && (m.includes('1.5-flash') || m.includes('2.0-flash'))) {
                m = 'gemini-3.8-flash';
                this.llm.saveSettings({ model: m });
            }
            if (this.inputModel) this.inputModel.value = m || '';
            if (this.inputEndpoint) this.inputEndpoint.value = this.llm.endpoint;
            if (this.checkEnforceFree) this.checkEnforceFree.checked = (this.llm.enforceFreeTier !== false);

            // Highlight currently matching chip
            const chips = document.querySelectorAll('.btn-model-chip');
            if (chips) {
                chips.forEach(c => c.classList.toggle('active', c.getAttribute('data-model') === (m || 'gemini-3.8-flash')));
            }

            const grpKey = document.getElementById('group-setting-apikey');
            const grpEndpoint = document.getElementById('group-setting-endpoint');
            if (grpKey) grpKey.style.display = (this.llm.provider === 'offline') ? 'none' : 'block';
            if (grpEndpoint) grpEndpoint.style.display = (this.llm.provider === 'custom') ? 'block' : 'none';
        }
        if (this.testStatus) this.testStatus.textContent = '';
        if (this.apiKeyStatus && (!this.llm || !this.llm.hasServerKey || this.llm.apiKey)) {
            this.apiKeyStatus.textContent = '';
        }
        this.settingsModal.classList.remove('hidden');
    }

    closeSettings() {
        if (!this.settingsModal) return;
        if (this.audio) this.audio.setEngine('gemini');
        if (this.currentHero && this.currentHero.race && this.grounder) {
            this.tradition = this.grounder.getTraditionForRace(this.currentHero.race);
            if (this.audio) this.audio.setTradition(this.tradition);
            this.updateTraditionBadge();
        }
        if (this.selectSpeed && this.audio) {
            this.audio.setSpeed(parseFloat(this.selectSpeed.value) || 1.0);
            this.updateAudioControlsUI();
        }
        if (this.sliderReverb && this.audio) {
            this.audio.setReverbVolume(parseInt(this.sliderReverb.value, 10) / 100);
        }

        if (this.llm) {
            const enteredKey = this.inputApiKey ? this.inputApiKey.value.trim() : '';
            const newKey = enteredKey ? enteredKey : (this.llm.hasServerKey ? '' : this.llm.apiKey);
            this.llm.saveSettings({
                provider: this.selectProvider ? this.selectProvider.value : this.llm.provider,
                apiKey: newKey,
                model: this.inputModel ? this.inputModel.value : this.llm.model,
                endpoint: this.inputEndpoint ? this.inputEndpoint.value : this.llm.endpoint,
                enforceFreeTier: true
            });
        }
        this.settingsModal.classList.add('hidden');
    }
}

if (typeof window !== 'undefined') {
    window.ChronicleManager = ChronicleManager;
}

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
        this.selectQuickVoice = null;
        this.settingsModal = null;
        this.selectTradition = null;
        this.selectFlow = null;
        this.selectVoice = null;
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

        this.initialized = false;
    }

    init(dungeon, soundEngine) {
        if (this.initialized) return;
        this.dungeon = dungeon;

        // Cache DOM Elements
        this.windowEl = document.getElementById('chronicle-window');
        this.headerEl = document.getElementById('chronicle-header');
        this.resizeHandleEl = document.getElementById('chronicle-resize-handle');
        this.scrollEl = document.getElementById('chronicle-scroll');
        this.listEl = document.getElementById('chronicle-list');
        this.navBtn = document.getElementById('btn-toggle-chronicle');

        if (!this.windowEl) {
            console.warn('[ChronicleManager] #chronicle-window not found in DOM.');
            return;
        }

        // Initialize Audio Sub-system
        if (soundEngine) {
            this.audio.init(soundEngine);
        }

        // Cache Control Buttons
        this.btnPlayStory = document.getElementById('btn-chronicle-play');
        this.btnStopStory = document.getElementById('btn-chronicle-stop');
        this.btnRewindStory = document.getElementById('btn-chronicle-rewind');
        this.btnForwardStory = document.getElementById('btn-chronicle-forward');
        this.selectQuickVoice = document.getElementById('chronicle-quick-voice');
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
        this.selectTradition = document.getElementById('chronicle-setting-tradition');
        this.selectFlow = document.getElementById('chronicle-setting-flow');
        this.selectVoice = document.getElementById('chronicle-setting-voice');
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
        this.activeChronicle = this.store.loadActive();
        if (this.activeChronicle && this.activeChronicle.isManuallyImported) {
            this.renderAllChapters();
        }

        // Update UI Button states
        this.updateAudioControlsUI();

        // Tab Visibility Safety: Pause speech on hidden, restore on return
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.audio) {
                this.audio.stopSpeaking();
            }
        });

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

        // Safe Hotkey: Alt + C to toggle window
        window.addEventListener('keydown', (e) => {
            if (e.altKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                this.toggleWindow();
            }
        });

        // Window & Audio Playback Controls
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

        // Global hotkeys for chronicle audio playback when chronicle is visible
        window.addEventListener('keydown', (e) => {
            if (!this.windowEl || !this.windowEl.classList.contains('active')) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

            if (e.code === 'Space') {
                e.preventDefault();
                this.toggleStoryPlayback();
            } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.code === 'ArrowLeft')) {
                e.preventDefault();
                this.rewindStoryPlayback();
            } else if (e.shiftKey && (e.key === 'ArrowRight' || e.code === 'ArrowRight')) {
                e.preventDefault();
                this.forwardStoryPlayback();
            }
        });

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
                let nextSpeed = 1.0;
                if (this.audio.speed === 1.0) nextSpeed = 1.25;
                else if (this.audio.speed === 1.25) nextSpeed = 1.5;
                else nextSpeed = 1.0;
                this.audio.setSpeed(nextSpeed);
                this.updateAudioControlsUI();
            });
        }

        // Quick Voice Selector in Chronicle Header
        if (this.selectQuickVoice) {
            if (this.audio && this.audio.narratorVoice) {
                this.selectQuickVoice.value = this.audio.narratorVoice;
            }
            this.selectQuickVoice.addEventListener('change', () => {
                const val = this.selectQuickVoice.value;
                if (this.audio) this.audio.setVoice(val);
                if (this.selectVoice) this.selectVoice.value = val;
                if (this.statusTextEl) {
                    const selText = (this.selectQuickVoice.options && this.selectQuickVoice.selectedIndex >= 0)
                        ? this.selectQuickVoice.options[this.selectQuickVoice.selectedIndex].text
                        : val;
                    this.statusTextEl.textContent = `🎙️ Narrator: ${selText.split('—')[0].trim()}`;
                }
            });
        }

        // Modal Voice Selector Synchronization
        if (this.selectVoice) {
            this.selectVoice.addEventListener('change', () => {
                const val = this.selectVoice.value;
                if (this.audio) this.audio.setVoice(val);
                if (this.selectQuickVoice) this.selectQuickVoice.value = val;
            });
        }

        // Audition Voice Button in Settings Modal
        if (this.btnTestVoice) {
            this.btnTestVoice.addEventListener('click', async () => {
                const voice = this.selectVoice ? this.selectVoice.value : (this.audio ? this.audio.narratorVoice : '');
                const sampleText = "Deep in the subterranean vaults of Angband, iron doors groan upon rusted hinges. Steel your courage, mortal, for the shadows stir.";
                if (this.audio) {
                    const wasMuted = !this.audio.enabled;
                    if (wasMuted) {
                        this.audio.setMuted(false);
                        this.updateAudioControlsUI();
                    }
                    if (this.testStatus) {
                        this.testStatus.style.color = '#ffd700';
                        this.testStatus.textContent = '🔊 Auditioning voice...';
                    }
                    try {
                        await this.audio.speakUtterance(sampleText, 'narrator', '', voice);
                        if (this.testStatus) {
                            this.testStatus.style.color = '#4ade80';
                            this.testStatus.textContent = '✓ Audition complete.';
                            setTimeout(() => { if (this.testStatus) this.testStatus.textContent = ''; }, 3000);
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
            this.btnSpeed.title = `Voice Speed: ${this.audio.speed}x (Click to cycle 1.0x, 1.25x, 1.5x)`;
        }
        if (this.selectQuickVoice && this.audio && this.audio.narratorVoice) {
            this.selectQuickVoice.value = this.audio.narratorVoice;
        }
        this.updatePlayButtonUI();
    }

    showWindow() {
        if (this.windowEl) {
            this.windowEl.classList.add('active');
            this.visible = true;
            if (this.navBtn) this.navBtn.classList.add('active');
            this.renderAllChapters();
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

    startFreshChronicle(hero) {
        const name = (hero && hero.name) ? hero.name : 'Adventurer';
        console.log(`[ChronicleManager] Starting fresh chronicle for character instance: ${name}`);
        this.currentHero = hero;
        this.activeChronicle = this.store.createNewChronicle(hero);
        this.activeChronicle.isManuallyImported = false;
        this.store.saveActive(this.activeChronicle);

        if (this.filter) this.filter.reset();

        if (hero && hero.race) {
            this.tradition = this.grounder.getTraditionForRace(hero.race);
            if (typeof document !== 'undefined') {
                const tradBadge = document.getElementById('chronicle-tradition-badge');
                if (tradBadge && this.grounder && this.grounder.TRADITIONS[this.tradition]) {
                    tradBadge.textContent = this.grounder.TRADITIONS[this.tradition].name
                        .replace('The Annals of the ', '')
                        .replace('The Record of ', '')
                        .replace('The Red Book of ', '');
                }
            }
        }

        if (this.listEl) this.listEl.innerHTML = '';
        this.clearTargetCreature();
    }

    async onFrame(frame) {
        if (!frame) return;

        // Track death to force a fresh chronicle on the next character instance
        if (frame.phase === 'death') {
            this.characterDied = true;
            return;
        }

        // Only evaluate during active gameplay
        if (frame.phase !== 'play' || !frame.player) return;

        const player = frame.player;
        this.currentHero = player;
        const heroSig = `${player.name || 'Hero'}_${player.race || ''}_${player.class || ''}`;

        // Fresh Start Check:
        // 1. Character died in previous life
        // 2. Character identity (name/race/class) changed
        // 3. No active chronicle exists
        // 4. Stored chronicle does NOT match current character AND was NOT manually imported
        let needsFreshStart = false;

        if (this.characterDied) {
            needsFreshStart = true;
        } else if (this.currentCharacterSignature && this.currentCharacterSignature !== heroSig) {
            needsFreshStart = true;
        } else if (!this.activeChronicle) {
            needsFreshStart = true;
        } else if (!this.activeChronicle.isManuallyImported && !this.store.isMatchingHero(this.activeChronicle, player)) {
            needsFreshStart = true;
        }

        if (needsFreshStart) {
            this.startFreshChronicle(player);
            this.characterDied = false;
            this.currentCharacterSignature = heroSig;
        } else {
            // Picking up where we are at for this active character instance
            if (!this.currentCharacterSignature) {
                this.currentCharacterSignature = heroSig;
            }
            // Populate UI if currently blank but chapters exist in active chronicle
            if (this.listEl && this.listEl.children.length === 0 && this.activeChronicle.chapters && this.activeChronicle.chapters.length > 0) {
                this.renderAllChapters();
            }
        }

        // Auto-attune literary tradition if not set
        if (!this.tradition && frame.player.race) {
            this.tradition = this.grounder.getTraditionForRace(frame.player.race);
        }

        // Cache live message stream for real-time combat awareness in direct conversations
        this.lastSeenMessages = frame.messages || [];

        // Drain sequential events for this frame (up to 4 events per turn to prevent story backlog)
        let drained = 0;
        let event = this.filter.evaluate(frame);
        const frameEntries = [];
        while (event && drained < 4) {
            drained++;
            const entry = await this.processEvent(event, frame, false);
            if (entry) frameEntries.push({ event, entry });
            event = this.filter.evaluate(frame);
        }

        // Live Narration Priority Gate: To guarantee ZERO vocal overlay and no lagged queues,
        // speak the single most significant event of this turn.
        if (this.audio && this.audio.enabled && frameEntries.length > 0) {
            const bestToSpeak = frameEntries.find(fe => fe.event.isChapter !== false) ||
                                frameEntries.find(fe => fe.entry.dialogue && !fe.entry.dialogue.isNoise) ||
                                frameEntries[frameEntries.length - 1];
            if (bestToSpeak && bestToSpeak.entry) {
                this.audio.speak(bestToSpeak.entry.prose, bestToSpeak.entry.dialogue);
            }
        }
    }

    async processEvent(event, frame, shouldSpeak = true) {
        if (!event || !frame) return null;

        // Capture 3D Canvas Snapshot for milestone events
        let illustrationDataUri = null;
        if (event.type === 'UNIQUE_SPOTTED' || event.type === 'MORTAL_PERIL' || event.type === 'FLOOR_CHANGE' || event.type === 'ONBOARDING_FIRST_DESCENT' || event.type === 'SPELL_LEARNED' || event.type === 'LEVEL_UP') {
            illustrationDataUri = this.captureCanvasThumbnail();
        }

        // Generate Chapter or Flowing Paragraph via Player's Configured LLM or Offline Procedural Synthesizer
        let entry = null;
        if (this.llm && this.llm.isConfigured()) {
            entry = await this.llm.generateChapter(event, frame.player, this.tradition, this.grounder);
        } else {
            entry = this.grounder.generateProceduralChapter(event, frame.player, this.tradition);
        }

        if (illustrationDataUri) {
            entry.illustration = illustrationDataUri;
        }

        // Major milestones become full chapters; routine kills/assaults/exploration flow into the active chapter
        if (event.isChapter !== false) {
            this.store.appendChapter(this.activeChronicle, entry);
            this.renderChapterCard(entry, true);
        } else {
            this.store.appendParagraph(this.activeChronicle, entry);
            this.renderFlowingParagraph(entry, true);
        }

        // Speak aloud if audio is unmuted (respects isNoise for non-vocal creatures)
        if (shouldSpeak && this.audio && this.audio.enabled) {
            this.audio.speak(entry.prose, entry.dialogue);
        }

        return entry;
    }

    captureCanvasThumbnail() {
        if (!this.dungeon || !this.dungeon.renderer) return null;
        try {
            const canvas = this.dungeon.renderer.domElement;
            if (!canvas) return null;
            return canvas.toDataURL('image/jpeg', 0.60);
        } catch (e) {
            return null;
        }
    }

    renderAllChapters() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        if (!this.activeChronicle || !this.activeChronicle.chapters) return;

        for (const ch of this.activeChronicle.chapters) {
            this.renderChapterCard(ch, false);
        }

        if (this.scrollEl) {
            this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
        }
    }

    renderChapterCard(ch, shouldScroll = true) {
        if (!this.listEl) return;

        const card = document.createElement('div');
        card.className = 'chapter-card';
        const chNum = ch.chapter_num || 1;
        card.id = `chronicle-card-ch-${chNum}`;
        card.setAttribute('data-chapter-num', chNum);

        let html = `
            <div class="chapter-header-row">
                <span class="chapter-heading">Chapter ${chNum}: ${ch.title}</span>
                <div class="chapter-meta">
                    <span>${(ch.depth || 0) * 50}ft</span>
                    <button class="chapter-replay-btn" data-beat-id="chronicle-beat-${chNum}-0" title="Play Story from Chapter ${chNum}">▶ Play</button>
                </div>
            </div>
        `;

        if (ch.illustration) {
            html += `
                <div class="chapter-illustration-wrap">
                    <img src="${ch.illustration}" class="chapter-illustration-img" alt="Chapter ${chNum}">
                    <span class="chapter-illustration-tag">${(ch.depth || 0) * 50}ft</span>
                </div>
            `;
        }

        if (ch.paragraphs && ch.paragraphs.length > 0) {
            ch.paragraphs.forEach((p, idx) => {
                const beatId = `chronicle-beat-${chNum}-${idx}`;
                if (idx > 0) {
                    html += `
                        <div class="flowing-paragraph-block" id="${beatId}">
                            <div class="flowing-paragraph-header">
                                <button class="flow-play-btn" data-beat-id="${beatId}" title="Play story from here">▶</button>
                            </div>
                    `;
                } else {
                    html += `<div class="chapter-lead-block" id="${beatId}">`;
                }
                html += `<p class="chapter-prose">${p.prose}</p>`;
                if (p.dialogue && p.dialogue.text) {
                    if (p.dialogue.isNoise) {
                        html += `
                            <div class="chapter-dialogue creature-sound-box">
                                <span class="dialogue-speaker">${p.dialogue.speaker}</span>
                                <span class="dialogue-sound-noise">${p.dialogue.text}</span>
                            </div>
                        `;
                    } else {
                        html += `
                            <div class="chapter-dialogue">
                                <span class="dialogue-speaker">${p.dialogue.speaker}</span>
                                "${p.dialogue.text}"
                            </div>
                        `;
                    }
                }
                if (p.insight) {
                    html += `
                        <div class="lorekeeper-insight">
                            <span class="lorekeeper-insight-icon">💡</span>
                            <span><strong>Lorekeeper:</strong> ${p.insight}</span>
                        </div>
                    `;
                }
                html += `</div>`;
            });
        } else {
            const beatId = `chronicle-beat-${chNum}-0`;
            html += `<div class="chapter-lead-block" id="${beatId}">`;
            html += `<p class="chapter-prose">${ch.prose}</p>`;

            if (ch.dialogue && ch.dialogue.text) {
                if (ch.dialogue.isNoise) {
                    html += `
                        <div class="chapter-dialogue creature-sound-box">
                            <span class="dialogue-speaker">${ch.dialogue.speaker}</span>
                            <span class="dialogue-sound-noise">${ch.dialogue.text}</span>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="chapter-dialogue">
                            <span class="dialogue-speaker">${ch.dialogue.speaker}</span>
                            "${ch.dialogue.text}"
                        </div>
                    `;
                }
            }

            if (ch.insight) {
                html += `
                    <div class="lorekeeper-insight">
                        <span class="lorekeeper-insight-icon">💡</span>
                        <span><strong>Lorekeeper:</strong> ${ch.insight}</span>
                    </div>
                `;
            }
            html += `</div>`;
        }

        card.innerHTML = html;

        // Attach Play from Here listeners
        const replayBtn = card.querySelector('.chapter-replay-btn');
        if (replayBtn) {
            replayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const beatId = replayBtn.getAttribute('data-beat-id');
                this.playStoryFromElementId(beatId);
            });
        }

        card.querySelectorAll('.flow-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const beatId = btn.getAttribute('data-beat-id');
                this.playStoryFromElementId(beatId);
            });
        });

        // Click anywhere on paragraph block to select and play from here
        const leadBlock = card.querySelector('.chapter-lead-block');
        if (leadBlock) {
            leadBlock.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this.playStoryFromElementId(leadBlock.id);
            });
        }

        card.querySelectorAll('.flowing-paragraph-block').forEach(block => {
            block.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this.playStoryFromElementId(block.id);
            });
        });

        this.listEl.appendChild(card);

        if (shouldScroll && this.scrollEl) {
            this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
        }
    }

    renderFlowingParagraph(entry, shouldScroll = true) {
        if (!this.listEl) return;
        let card = this.listEl.lastElementChild;
        if (!card || !card.classList.contains('chapter-card') || card.classList.contains('creature-chat-card') || card.classList.contains('player-chat-card')) {
            this.renderChapterCard(entry, shouldScroll);
            return;
        }

        const chNum = parseInt(card.getAttribute('data-chapter-num'), 10) || 1;
        const currentChapter = this.activeChronicle ? this.activeChronicle.chapters[this.activeChronicle.chapters.length - 1] : null;
        const pIdx = (currentChapter && currentChapter.paragraphs) ? (currentChapter.paragraphs.length - 1) : (card.querySelectorAll('.flowing-paragraph-block').length + 1);
        const beatId = `chronicle-beat-${chNum}-${pIdx}`;

        const flowBlock = document.createElement('div');
        flowBlock.className = 'flowing-paragraph-block';
        flowBlock.id = beatId;

        let html = `
            <div class="flowing-paragraph-header">
                <button class="flow-play-btn" data-beat-id="${beatId}" title="Play story from here">▶</button>
            </div>
            <p class="chapter-prose">${entry.prose}</p>
        `;

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
                <div class="lorekeeper-insight">
                    <span class="lorekeeper-insight-icon">💡</span>
                    <span><strong>Lorekeeper:</strong> ${entry.insight}</span>
                </div>
            `;
        }

        flowBlock.innerHTML = html;
        const playBtn = flowBlock.querySelector('.flow-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playStoryFromElementId(beatId);
            });
        }

        flowBlock.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            this.playStoryFromElementId(beatId);
        });

        card.appendChild(flowBlock);

        if (shouldScroll && this.scrollEl) {
            this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
        }
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
    }

    playStoryFromElementId(elementId) {
        this.buildStoryPlaylist();
        if (this.storyPlaylist.length === 0) return;

        let foundIdx = -1;
        if (elementId) {
            foundIdx = this.storyPlaylist.findIndex(b => b.elementId === elementId);
            if (foundIdx === -1 && typeof elementId === 'string') {
                const match = elementId.match(/chronicle-beat-(\d+)-(\d+)/);
                if (match) {
                    const targetCh = parseInt(match[1], 10);
                    const targetP = parseInt(match[2], 10);
                    foundIdx = this.storyPlaylist.findIndex(b => b.chapterNum === targetCh && b.pIndex === targetP);
                    if (foundIdx === -1) {
                        foundIdx = this.storyPlaylist.findIndex(b => b.chapterNum === targetCh);
                    }
                }
            }
        }

        if (foundIdx !== -1) {
            this.playStoryFrom(foundIdx);
        } else {
            this.playStoryFrom(this.currentBeatIndex || 0);
        }
    }

    async playStoryFrom(beatIndex = null) {
        if (!this.audio) return;
        this.buildStoryPlaylist();
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
        }
        targetIdx = Math.max(0, Math.min(targetIdx, this.storyPlaylist.length - 1));

        // If currently paused on the exact current beat and beatIndex wasn't changed, seamlessly resume
        if (this.audio.isPaused && (beatIndex === null || beatIndex === undefined || beatIndex === this.currentBeatIndex)) {
            this.resumeStoryPlayback();
            return;
        }

        // Stop prior speech immediately
        this.audio.stopSpeaking();

        // Increment playbackSessionId to invalidate any prior running or suspended loops
        const sessionId = ++this.playbackSessionId;

        this.currentBeatIndex = targetIdx;
        this.isStoryPlaying = true;
        this.updatePlayButtonUI();

        await this._playNextBeat(sessionId);
    }

    async _playNextBeat(sessionId) {
        if (sessionId !== this.playbackSessionId || !this.isStoryPlaying || !this.audio) return;

        this.buildStoryPlaylist();
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

        // Active Reading Guide Visual Highlight
        document.querySelectorAll('.narrating-active').forEach(el => el.classList.remove('narrating-active'));
        document.querySelectorAll('.narrating-selected').forEach(el => el.classList.remove('narrating-selected'));

        const el = document.getElementById(beat.elementId);
        if (el) {
            el.classList.add('narrating-active');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            const cardEl = document.getElementById(`chronicle-card-ch-${beat.chapterNum}`);
            if (cardEl) {
                cardEl.classList.add('narrating-active');
                cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        if (this.statusTextEl) {
            const chNum = beat.chapterNum || 1;
            const pNum = (beat.pIndex || 0) + 1;
            this.statusTextEl.textContent = `▶ Reading Ch. ${chNum} [Para ${pNum}]`;
        }

        this.isSpeakingBeat = true;
        try {
            if (beat.role === 'mentor') {
                await this.audio.speakUtterance(beat.text, 'mentor');
            } else {
                await this.audio.speak(beat.text, beat.dialogue);
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

    pauseStoryPlayback() {
        this.isStoryPlaying = false;
        if (this.audio) {
            this.audio.pause();
        }
        if (this.statusTextEl) {
            this.statusTextEl.textContent = `⏸ Paused at Beat ${this.currentBeatIndex + 1}`;
        }
        this.updatePlayButtonUI();
    }

    resumeStoryPlayback() {
        this.isStoryPlaying = true;
        if (this.audio) {
            this.audio.resume();
        }
        if (this.statusTextEl) {
            this.statusTextEl.textContent = `▶ Reading...`;
        }
        this.updatePlayButtonUI();

        // If no utterance was actively suspended mid-speech, resume loop to next beat
        if (!this.isSpeakingBeat) {
            this._playNextBeat(this.playbackSessionId);
        }
    }

    toggleStoryPlayback() {
        if (this.isStoryPlaying) {
            this.pauseStoryPlayback();
        } else if (this.audio && this.audio.isPaused) {
            this.resumeStoryPlayback();
        } else {
            this.playStoryFrom(this.currentBeatIndex);
        }
    }

    stopStoryPlayback() {
        this.playbackSessionId++; // Invalidate running loops
        this.isStoryPlaying = false;
        this.isSpeakingBeat = false;
        if (this.audio) {
            this.audio.stopSpeaking();
        }
        document.querySelectorAll('.narrating-active').forEach(el => el.classList.remove('narrating-active'));
        if (this.statusTextEl) {
            this.statusTextEl.textContent = `⏹ Stopped at Beat ${this.currentBeatIndex + 1}`;
        }
        this.updatePlayButtonUI();
    }

    rewindStoryPlayback() {
        this.buildStoryPlaylist();
        if (this.storyPlaylist.length === 0) return;

        // If audio has played for > 2 seconds into current beat, rewind to start of current beat;
        // otherwise rewind to previous beat
        const currentTime = (this.audio && typeof this.audio.getCurrentTime === 'function')
            ? this.audio.getCurrentTime()
            : 0;

        let targetIdx = this.currentBeatIndex;
        if (currentTime > 2.0) {
            targetIdx = this.currentBeatIndex;
        } else {
            targetIdx = Math.max(0, this.currentBeatIndex - 1);
        }

        this.playStoryFrom(targetIdx);
    }

    forwardStoryPlayback() {
        this.buildStoryPlaylist();
        if (this.storyPlaylist.length === 0) return;

        const targetIdx = Math.min(this.storyPlaylist.length - 1, this.currentBeatIndex + 1);
        this.playStoryFrom(targetIdx);
    }

    updatePlayButtonUI() {
        if (this.btnPlayStory) {
            if (this.isStoryPlaying) {
                this.btnPlayStory.textContent = '⏸ Pause';
                this.btnPlayStory.title = 'Pause Story Audio [Space]';
                this.btnPlayStory.classList.add('active');
            } else if (this.audio && this.audio.isPaused) {
                this.btnPlayStory.textContent = '▶ Resume';
                this.btnPlayStory.title = 'Resume Story Audio [Space]';
                this.btnPlayStory.classList.add('active');
            } else {
                this.btnPlayStory.textContent = '▶ Play';
                this.btnPlayStory.title = 'Play Story from Current Position [Space]';
                this.btnPlayStory.classList.remove('active');
            }
        }
        if (this.btnStopStory) {
            if (this.isStoryPlaying || (this.audio && this.audio.isPaused)) {
                this.btnStopStory.classList.add('active');
            } else {
                this.btnStopStory.classList.remove('active');
            }
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
                        if (res.isDialogue && res.text) {
                            this.audio.speak(res.prose, { text: res.text, speaker: monster.name, recommendedVoice: res.recommendedVoice });
                        } else if (res.prose) {
                            this.audio.speakUtterance(res.prose, 'narrator');
                        }
                    }
                });
            }
            this.listEl.appendChild(card);
            if (this.scrollEl) this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
        }

        // Voice playback upon encounter: speak aloud for ALL entities
        if (this.audio && this.audio.enabled && res) {
            if (res.isDialogue && res.text) {
                // Awake vocal creature: speak atmospheric scene prose then creature line in character
                this.audio.speak(res.prose, { text: res.text, speaker: monster.name, recommendedVoice: res.recommendedVoice });
            } else if (res.prose) {
                // Sleeping or non-vocal creature: Master Chronicler speaks the scene aloud
                this.audio.speakUtterance(res.prose, 'narrator');
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

            if (this.listEl) {
                const pCard = document.createElement('div');
                pCard.className = 'chapter-card player-chat-card';
                pCard.innerHTML = `
                    <div class="chapter-header-row">
                        <span class="chapter-heading" style="color: #38bdf8;">You to ${creature.name}:</span>
                    </div>
                    <div class="chapter-prose" style="font-style: italic; color: #bae6fd; margin-top: 4px;">
                        "${text}"
                    </div>
                `;
                this.listEl.appendChild(pCard);
            }

            let reply = null;
            if (this.llm && this.llm.isConfigured()) {
                reply = await this.llm.chatWithCreature(creature, text, this.currentHero, this.lastSeenMessages);
            } else {
                reply = this.grounder.resolveCreatureEncounter(creature, this.currentHero, this.lastSeenMessages, creature._interactTurn, text);
            }

            if (this.listEl && reply && (reply.prose || reply.text)) {
                const rCard = document.createElement('div');
                rCard.className = 'chapter-card creature-chat-card';

                let replyHtml = '';
                if (reply.prose) {
                    replyHtml += `<p class="chapter-prose" style="margin-bottom: 6px;">${reply.prose}</p>`;
                }
                if (reply.isDialogue && reply.text) {
                    replyHtml += `
                        <div class="chapter-dialogue" style="margin-top: 4px;">
                            <span class="dialogue-speaker">${creature.name}</span>
                            <span>"${reply.text}"</span>
                        </div>
                    `;
                } else if (!reply.isDialogue && reply.text) {
                    replyHtml += `
                        <div class="chapter-dialogue creature-sound-box" style="margin-top: 4px;">
                            <span class="dialogue-speaker">${creature.name}</span>
                            <span class="dialogue-sound-noise">${reply.text}</span>
                        </div>
                    `;
                }

                rCard.innerHTML = `
                    <div class="chapter-header-row">
                        <span class="chapter-heading creature-chat-speaker">${creature.name}</span>
                        <button class="chapter-replay-btn" title="Listen to narration">▶ Play</button>
                    </div>
                    ${replyHtml}
                `;
                const replayBtn = rCard.querySelector('.chapter-replay-btn');
                if (replayBtn) {
                    replayBtn.addEventListener('click', () => {
                        if (this.audio) {
                            if (reply.isDialogue && reply.text) {
                                this.audio.speak(reply.prose, { text: reply.text, speaker: creature.name, recommendedVoice: reply.recommendedVoice });
                            } else if (reply.prose) {
                                this.audio.speakUtterance(reply.prose, 'narrator');
                            }
                        }
                    });
                }
                this.listEl.appendChild(rCard);
                if (this.scrollEl) this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
            }

            if (this.audio && this.audio.enabled && reply) {
                if (reply.isDialogue && reply.text) {
                    this.audio.speak(reply.prose, { text: reply.text, speaker: creature.name, recommendedVoice: reply.recommendedVoice });
                } else if (reply.prose) {
                    this.audio.speakUtterance(reply.prose, 'narrator');
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
            this.renderChapterCard(entry, true);
        } else {
            this.store.appendParagraph(this.activeChronicle, entry);
            this.renderFlowingParagraph(entry, true);
        }

        // Voice immediately in the deep, warm Mentor voice
        if (this.audio && this.audio.enabled) {
            this.audio.speakUtterance(answer, 'mentor');
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
        if (this.selectTradition) this.selectTradition.value = this.tradition;
        if (this.selectFlow) this.selectFlow.value = this.audio.flowMode;
        if (this.selectVoice && this.audio) this.selectVoice.value = this.audio.narratorVoice;
        if (this.selectQuickVoice && this.audio) this.selectQuickVoice.value = this.audio.narratorVoice;

        if (this.llm) {
            if (this.selectProvider) this.selectProvider.value = this.llm.provider;
            if (this.inputApiKey) this.inputApiKey.value = this.llm.apiKey;
            
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
        if (this.selectTradition) {
            const ev = new Event('change');
            this.selectTradition.dispatchEvent(ev);
        }
        if (this.testStatus) this.testStatus.textContent = '';
        if (this.apiKeyStatus) this.apiKeyStatus.textContent = '';
        this.settingsModal.classList.remove('hidden');
    }

    closeSettings() {
        if (!this.settingsModal) return;
        if (this.selectTradition) this.tradition = this.selectTradition.value;
        if (this.selectFlow) this.audio.setFlowMode(this.selectFlow.value);
        if (this.selectVoice && this.audio) {
            this.audio.setVoice(this.selectVoice.value);
            if (this.selectQuickVoice) this.selectQuickVoice.value = this.selectVoice.value;
        }

        if (this.llm) {
            this.llm.saveSettings({
                provider: this.selectProvider ? this.selectProvider.value : this.llm.provider,
                apiKey: this.inputApiKey ? this.inputApiKey.value : this.llm.apiKey,
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

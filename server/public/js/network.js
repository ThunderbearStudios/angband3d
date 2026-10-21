/**
 * Angband3D WebSocket Client — Real-Time Game Stream Relay
 * Connects directly to the cloud C engine daemon, measures round-trip latency,
 * and queues user key commands.
 */

class GameNetwork {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.pingMs = 0;
        this.lastPingSent = 0;
        this.sessionId = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;

        this.onFrame = null;
        this.onHello = null;
        this.onBye = null;
        this.onError = null;
        this.onPing = null;
        this.onStatus = null;
        this.onQueue = null;
        this.onOfflineCommand = null;
        this.isInQueue = false;
        this.sessionHibernated = false;
        this.offlinePlayActive = false;
        this.offlineCommandQueue = [];
        this._lastReconnectAttemptMs = 0;

        try {
            this.sessionId = localStorage.getItem('angband3d_session_id') || null;
            const savedChar = localStorage.getItem('angband3d_session_char');
            if (savedChar) this.currentChar = savedChar;
            const savedSave = localStorage.getItem('angband3d_session_save');
            if (savedSave) this.currentSave = savedSave;
            const savedRealm = localStorage.getItem('angband3d_session_realm');
            if (savedRealm) this.currentRealm = savedRealm;
            const savedOfflineCmds = localStorage.getItem('angband3d_offline_cmd_queue');
            if (savedOfflineCmds) {
                const parsedCmds = JSON.parse(savedOfflineCmds);
                if (Array.isArray(parsedCmds)) this.offlineCommandQueue = parsedCmds.slice(0, 128);
            }
        } catch (_) {}

        if (typeof document !== 'undefined' && typeof window !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && !this.manualDisconnect) {
                    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
                        this.sessionHibernated = false;
                        this.reconnectAttempts = 0;
                        this.connect(this.currentChar, false, this.currentSave, this.currentRealm);
                    } else if (this.ws.readyState === WebSocket.OPEN) {
                        this.lastPingSent = performance.now();
                        try { this.ws.send(JSON.stringify({ t: 'ping', time: Date.now() })); } catch (_) {}
                    }
                }
            });
            window.addEventListener('online', () => {
                if (!this.manualDisconnect && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
                    this.sessionHibernated = false;
                    this.reconnectAttempts = 0;
                    this.connect(this.currentChar, false, this.currentSave, this.currentRealm);
                }
            });
        }
    }

    connect(charName = 'Adventurer', isNew = false, saveFile = null, realm = 'angband') {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.manualDisconnect = false;
        this.sessionHibernated = false;
        this.isInQueue = false;
        this.isDead = false;
        this.currentChar = charName || this.currentChar || 'Adventurer';
        this.currentIsNew = isNew;
        const effectiveSave = saveFile || (!isNew ? this.currentSave : null) || (this.currentChar !== 'Adventurer' ? this.currentChar : null);
        this.currentSave = effectiveSave;
        this.requestedRealm = realm || this.currentRealm || 'angband';
        this.currentRealm = this.requestedRealm;

        // Invariant: Verify if the requested character, savefile, or realm matches what is stored in localStorage.
        // If the player starts a new game, switches saves, or switches realms, discard any stale sessionId!
        const reqSaveNorm = effectiveSave ? effectiveSave.toLowerCase().replace(/\.sav$/i, '').trim() : null;
        let storedSaveNorm = null;
        let storedRealm = null;
        try {
            const storedSave = localStorage.getItem('angband3d_session_save');
            if (storedSave) storedSaveNorm = storedSave.toLowerCase().replace(/\.sav$/i, '').trim();
            storedRealm = localStorage.getItem('angband3d_session_realm');
        } catch (_) {}

        const saveChanged = Boolean(reqSaveNorm && storedSaveNorm && reqSaveNorm !== storedSaveNorm);
        const realmChanged = Boolean(storedRealm && storedRealm !== this.currentRealm);

        // If explicitly starting fresh, switching realm, or switching save slot, drop stale session ID!
        // Note: Do NOT drop sessionId merely because in-game display name (currentChar) updated from the slot name.
        if (isNew || realmChanged || saveChanged) {
            this.sessionId = null;
            if (isNew) {
                this.offlineCommandQueue = [];
                try { localStorage.removeItem('angband3d_offline_cmd_queue'); } catch (_) {}
            }
            try {
                localStorage.removeItem('angband3d_session_id');
                if (effectiveSave) {
                    localStorage.setItem('angband3d_session_save', effectiveSave);
                } else {
                    localStorage.removeItem('angband3d_session_save');
                }
                localStorage.setItem('angband3d_session_realm', this.currentRealm);
            } catch (_) {}
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        let wsUrl = `${protocol}//${host}/ws?user=${encodeURIComponent(this.currentChar)}`;
        if (isNew) {
            wsUrl += '&new=1';
        }
        if (effectiveSave) {
            wsUrl += `&save=${encodeURIComponent(effectiveSave)}`;
        }
        if (this.currentRealm) {
            wsUrl += `&realm=${encodeURIComponent(this.currentRealm)}`;
            if (this.currentRealm === 'hengband') {
                const langMode = window.__langMode || (typeof localStorage !== 'undefined' ? localStorage.getItem('angband3d_lang_mode') : null) || 'en';
                wsUrl += `&lang=${encodeURIComponent(langMode)}`;
            }
        }

        try {
            const targetSlot = effectiveSave || this.currentChar || 'Adventurer';
            const ownerToken = localStorage.getItem(`angband3d_owner_${targetSlot}`) || localStorage.getItem(`angband3d_owner_${this.currentChar}`);
            if (ownerToken) {
                wsUrl += `&owner=${encodeURIComponent(ownerToken)}`;
            }
        } catch (_) {}

        if (this.sessionId && !isNew) {
            wsUrl += `&session=${encodeURIComponent(this.sessionId)}`;
        }

        if (this.onStatus) this.onStatus(`Connecting to ${realm ? (realm.charAt(0).toUpperCase() + realm.slice(1)) : 'Cloud'} Realm...`);

        try {
            if (this.ws) {
                this.ws.onclose = null;
                this.ws.onerror = null;
                this.ws.onmessage = null;
                this.ws.onopen = null;
                try { this.ws.close(); } catch (_) {}
            }
        } catch (_) {}

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            if (this.onStatus) this.onStatus('Connected to Cloud Realm');
            this.startPingHeartbeat();
        };

        this.ws.onmessage = (event) => {
            const str = event.data.trim();
            if (!str) return;

            try {
                const msg = JSON.parse(str);

                if (msg.t === 'hello') {
                    this.isInQueue = false;
                    this.reconnectAttempts = 0;

                    // Strict Invariant: Never allow the wrong realm or a fallback realm to be accepted
                    const wrongRealm = Boolean(this.requestedRealm && msg.realm && msg.realm !== this.requestedRealm);
                    if (msg.isFallback || wrongRealm) {
                        console.error(`[Network] Wrong realm or fallback rejected! Requested: "${this.requestedRealm}", received: "${msg.realm}", isFallback: ${msg.isFallback}. Aborting.`);
                        this.manualDisconnect = true;
                        if (this.reconnectTimer) {
                            clearTimeout(this.reconnectTimer);
                            this.reconnectTimer = null;
                        }
                        try { this.ws.close(); } catch (_) {}
                        const err = msg.fallbackNotice || `Requested realm "${this.requestedRealm}" could not be loaded (server sent "${msg.realm || 'fallback'}"). Fallback is strictly disabled.`;
                        if (this.onError) this.onError(err);
                        return;
                    }

                    if (msg.realm) {
                        this.currentRealm = msg.realm;
                    }
                    if (msg.saveSlot) {
                        this.currentSave = msg.saveSlot;
                    }
                    if (msg.sessionId) {
                        this.sessionId = msg.sessionId;
                        try {
                            localStorage.setItem('angband3d_session_id', msg.sessionId);
                            localStorage.setItem('angband3d_session_char', this.currentChar || '');
                            localStorage.setItem('angband3d_session_realm', this.currentRealm || 'angband');
                            if (this.currentSave) {
                                localStorage.setItem('angband3d_session_save', this.currentSave);
                            }
                        } catch (_) {}
                    }
                    if (msg.ownerToken) {
                        try {
                            const targetSlot = this.currentSave || this.currentChar || 'Adventurer';
                            localStorage.setItem(`angband3d_owner_${targetSlot}`, msg.ownerToken);
                            if (this.currentChar) {
                                localStorage.setItem(`angband3d_owner_${this.currentChar}`, msg.ownerToken);
                            }
                        } catch (_) {}
                    }
                    // CRITICAL: Once the engine session is initialized, subsequent reconnects must NOT send &new=1!
                    this.currentIsNew = false;
                    this.sessionHibernated = false;
                    this.offlinePlayActive = false;
                    if (msg.resumed && this.onStatus) {
                        this.onStatus('Resumed Live Session');
                    }
                    this.flushOfflineSync();
                    if (this.onHello) this.onHello(msg);
                } else if (msg.t === 'queue') {
                    this.isInQueue = (msg.status === 'waiting');
                    if (this.onQueue) this.onQueue(msg);
                } else if (msg.t === 'pong') {
                    if (this.lastPingSent > 0) {
                        this.pingMs = Math.round(performance.now() - this.lastPingSent);
                        if (this.onPing) this.onPing(this.pingMs);
                    }
                } else if (msg.t === 'frame') {
                    msg.realm = msg.realm || this.currentRealm || this.requestedRealm || 'angband';
                    // Strict Invariant: Reject frames if they belong to a different realm than requested
                    if (this.requestedRealm && msg.realm && msg.realm !== this.requestedRealm) {
                        console.error(`[Network] Frame received for wrong realm "${msg.realm}" (expected "${this.requestedRealm}"). Aborting.`);
                        this.manualDisconnect = true;
                        if (this.reconnectTimer) {
                            clearTimeout(this.reconnectTimer);
                            this.reconnectTimer = null;
                        }
                        try { this.ws.close(); } catch (_) {}
                        if (this.onError) this.onError(`Wrong realm "${msg.realm}" received from engine (expected "${this.requestedRealm}"). Fallbacks are disabled.`);
                        return;
                    }

                    this.currentIsNew = false;
                    if (msg.player) {
                        if (msg.player.name && msg.player.name !== 'PLAYER') {
                            if (!this.currentSave) {
                                this.currentSave = this.currentChar || msg.player.name;
                            }
                            this.currentChar = msg.player.name;
                            try {
                                localStorage.setItem('angband3d_session_char', msg.player.name);
                                if (this.currentSave) {
                                    localStorage.setItem('angband3d_session_save', this.currentSave);
                                }
                            } catch (_) {}
                        }
                        if (msg.player.dead || (msg.player.hp !== undefined && msg.player.hp <= 0 && msg.player.hp_max > 0)) {
                            this.isDead = true;
                        }
                    }
                    if (this.onFrame) this.onFrame(msg);
                } else if (msg.t === 'ok' && msg.detail === 'saved') {
                    if (this._pendingSaveResolve) {
                        this._pendingSaveResolve();
                    }
                    if (this.onSave) this.onSave(msg);
                } else if (msg.t === 'ok' && msg.detail === 'client_state_synced') {
                    if (this.onStatus) this.onStatus('⚡ Client State Synced');
                } else if (msg.t === 'error') {
                    const errText = (msg.message || msg.detail || '').trim();
                    const isNotInPlay = !errText || errText.toLowerCase().includes('not in play');
                    if (isNotInPlay) {
                        return;
                    }
                    console.error('[Engine Error]', errText);
                    this.manualDisconnect = true;
                    if (this.reconnectTimer) {
                        clearTimeout(this.reconnectTimer);
                        this.reconnectTimer = null;
                    }
                    if (this.onError) this.onError(errText);
                } else if (msg.t === 'bye') {
                    this.sessionId = null;
                    if (msg.saveSlot) {
                        this.currentSave = msg.saveSlot;
                    }
                    try {
                        localStorage.removeItem('angband3d_session_id');
                        if (this.currentSave) {
                            localStorage.setItem('angband3d_session_save', this.currentSave);
                        }
                        if (this.currentChar) {
                            localStorage.setItem('angband3d_session_char', this.currentChar);
                        }
                    } catch (_) {}
                    const detailStr = msg.detail || 'Game session saved';
                    const isFatalRejection = /not installed|invalid owner token|maximum player/i.test(detailStr);
                    if (isFatalRejection) {
                        this.manualDisconnect = true;
                    } else {
                        // Session was saved due to idle/grace period: enter hibernated/offline-ready state so any key or click resumes seamlessly
                        this.sessionHibernated = true;
                        this.manualDisconnect = false;
                    }
                    if (this.reconnectTimer) {
                        clearTimeout(this.reconnectTimer);
                        this.reconnectTimer = null;
                    }
                    if (this.onBye) this.onBye(detailStr);
                }
            } catch (err) {
                // Raw non-JSON text frames are ignored. Any OTHER exception came from an
                // app handler (onFrame/onHello/...) and MUST be visible: swallowing it here
                // once hid a per-frame crash that left players in an empty 3D skybox.
                if (!(err instanceof SyntaxError)) {
                    console.error('[Network] Handler error:', err && err.stack ? err.stack : err);
                }
            }
        };

        this.ws.onerror = (err) => {
            console.error('[WebSocket Error]', err);
            if (this.onStatus) this.onStatus('Network connection error');
            if (this.onError) this.onError('WebSocket connection error');
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.stopPingHeartbeat();
            if (this.manualDisconnect) {
                if (this.onStatus) this.onStatus('Disconnected');
                return;
            }
            if (this.sessionHibernated) {
                if (this.onStatus) this.onStatus('Standby • Press any key or tap to continue');
                return;
            }
            // Unexpected disconnection (lag, socket reset, cell network blip).
            // Reconnect smoothly to existing running session; if offline, stay in offline-play mode without kicking player out!
            if (this.reconnectAttempts >= 8) {
                console.warn('[WebSocket] Offline continuation active — will sync to server on next input or network restore.');
                this.offlinePlayActive = true;
                if (this.onStatus) this.onStatus('⚡ Offline Play Active (Will Sync on Reconnect)');
                return;
            }
            if (this.onStatus) this.onStatus('Connection interrupted. Reconnecting...');
            const delay = Math.min(4000, 1000 + (this.reconnectAttempts * 500));
            this.reconnectAttempts++;
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
                if (!this.manualDisconnect && !this.sessionHibernated) {
                    this.connect(this.currentChar, false, this.currentSave, this.currentRealm);
                }
            }, delay);
        };
    }

    async saveGame() {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.isDead) {
            console.log('[GameNetwork] Refusing to send save command: Player is dead, protecting living save.');
            return;
        }
        return new Promise(resolve => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    this._pendingSaveResolve = null;
                    resolve();
                }
            }, 1500);

            const prevResolve = this._pendingSaveResolve;
            this._pendingSaveResolve = () => {
                if (typeof prevResolve === 'function') {
                    try { prevResolve(); } catch (_) {}
                }
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    this._pendingSaveResolve = null;
                    resolve();
                }
            };
            this.sendCommand('save');
        });
    }

    async saveAndDisconnect() {
        try {
            await this.saveGame();
        } catch (_) {}
        this.disconnect();
    }

    disconnect() {
        this.manualDisconnect = true;
        this.isInQueue = false;
        this.sessionId = null;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.stopPingHeartbeat();
        try {
            localStorage.removeItem('angband3d_session_id');
            localStorage.removeItem('angband3d_session_char');
            localStorage.removeItem('angband3d_session_save');
        } catch (_) {}
        if (this.ws) {
            try { this.ws.close(); } catch (_) {}
        }
    }

    leaveQueue() {
        this.manualDisconnect = true;
        this.isInQueue = false;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify({ t: 'cancel' })); } catch (_) {}
            try { this.ws.close(); } catch (_) {}
        }
    }

    leaveSession() {
        this.manualDisconnect = true;
        this.isInQueue = false;
        this.isDead = false;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify({ t: 'quit' })); } catch (_) {}
        }
        this.sessionId = null;
        try {
            localStorage.removeItem('angband3d_session_id');
            localStorage.removeItem('angband3d_session_char');
            localStorage.removeItem('angband3d_session_save');
        } catch (_) {}
        this.disconnect();
    }

    startPingHeartbeat() {
        this.stopPingHeartbeat();
        this.pingTimer = setInterval(() => {
            if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.lastPingSent = performance.now();
                this.ws.send(JSON.stringify({ t: 'ping', time: Date.now() }));
            }
        }, 2000);
    }

    stopPingHeartbeat() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    ensureConnected() {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) return true;
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return false;
        const now = Date.now();
        if (now - (this._lastReconnectAttemptMs || 0) < 2000) return false;
        this._lastReconnectAttemptMs = now;
        this.manualDisconnect = false;
        this.sessionHibernated = false;
        this.reconnectAttempts = 0;
        this.connect(this.currentChar || 'Adventurer', false, this.currentSave, this.currentRealm || 'angband');
        return false;
    }

    queueOfflineCommand(cmd) {
        if (!cmd || typeof cmd !== 'string') return;
        if (cmd.startsWith('key ') || cmd.startsWith('keys ')) {
            this.offlineCommandQueue = this.offlineCommandQueue || [];
            if (this.offlineCommandQueue.length < 128) {
                this.offlineCommandQueue.push(cmd);
                try {
                    localStorage.setItem('angband3d_offline_cmd_queue', JSON.stringify(this.offlineCommandQueue));
                } catch (_) {}
            }
            if (typeof this.onOfflineCommand === 'function') {
                try { this.onOfflineCommand(cmd); } catch (_) {}
            }
        }
    }

    flushOfflineSync() {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.offlineCommandQueue && this.offlineCommandQueue.length > 0) {
            const cmds = this.offlineCommandQueue.splice(0, 128);
            try {
                localStorage.removeItem('angband3d_offline_cmd_queue');
            } catch (_) {}
            try {
                this.ws.send(JSON.stringify({
                    t: 'sync_client_state',
                    commands: cmds
                }));
            } catch (_) {}
        }
    }

    sendKey(spec) {
        if (typeof window !== 'undefined' && window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
            window.chronicleManager.preemptForGameplay('network_action');
        }
        this.lastSentKey = spec;
        this.sentKeyCount = (this.sentKeyCount || 0) + 1;
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.queueOfflineCommand(`key ${spec}`);
            this.ensureConnected();
            return;
        }
        this.ws.send(`key ${spec}`);
    }

    sendCommand(cmd) {
        if (typeof window !== 'undefined' && window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
            window.chronicleManager.preemptForGameplay('network_action');
        }
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.queueOfflineCommand(cmd);
            this.ensureConnected();
            return;
        }
        this.ws.send(cmd);
    }
}

window.GameNetwork = GameNetwork;

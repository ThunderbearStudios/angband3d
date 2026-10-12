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
        this.isInQueue = false;

        try {
            this.sessionId = localStorage.getItem('angband3d_session_id') || null;
            const savedChar = localStorage.getItem('angband3d_session_char');
            if (savedChar) this.currentChar = savedChar;
            const savedSave = localStorage.getItem('angband3d_session_save');
            if (savedSave) this.currentSave = savedSave;
            const savedRealm = localStorage.getItem('angband3d_session_realm');
            if (savedRealm) this.currentRealm = savedRealm;
        } catch (_) {}

        if (typeof document !== 'undefined' && typeof window !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && !this.manualDisconnect) {
                    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
                        this.connect(this.currentChar, false, this.currentSave, this.currentRealm);
                    } else if (this.ws.readyState === WebSocket.OPEN) {
                        this.lastPingSent = performance.now();
                        try { this.ws.send(JSON.stringify({ t: 'ping', time: Date.now() })); } catch (_) {}
                    }
                }
            });
            window.addEventListener('online', () => {
                if (!this.manualDisconnect && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
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
        this.isInQueue = false;
        this.isDead = false;
        this.currentChar = charName;
        this.currentIsNew = isNew;
        this.currentSave = saveFile;
        this.requestedRealm = realm || 'angband';
        this.currentRealm = realm || 'angband';

        // Invariant: Verify if the requested character, savefile, or realm matches what is stored in localStorage.
        // If the player starts a new game, switches saves, switches characters, or switches realms, discard any stale sessionId!
        const reqSaveNorm = saveFile ? saveFile.toLowerCase().replace(/\.sav$/i, '').trim() : null;
        let storedSaveNorm = null;
        let storedCharNorm = null;
        let storedRealm = null;
        try {
            const storedSave = localStorage.getItem('angband3d_session_save');
            if (storedSave) storedSaveNorm = storedSave.toLowerCase().replace(/\.sav$/i, '').trim();
            const storedChar = localStorage.getItem('angband3d_session_char');
            if (storedChar) storedCharNorm = storedChar.toLowerCase().trim();
            storedRealm = localStorage.getItem('angband3d_session_realm');
        } catch (_) {}

        const reqCharNorm = (charName && charName !== 'Adventurer') ? charName.toLowerCase().trim() : null;
        const saveChanged = reqSaveNorm && storedSaveNorm && reqSaveNorm !== storedSaveNorm;
        const charChanged = reqCharNorm && storedCharNorm && storedCharNorm !== 'adventurer' && reqCharNorm !== storedCharNorm;
        const realmChanged = storedRealm && storedRealm !== this.currentRealm;

        // If explicitly starting fresh, switching realm, switching save/character, or loading a save without matching stored save, drop stale session ID!
        if (isNew || realmChanged || saveChanged || charChanged || (saveFile && !storedSaveNorm)) {
            this.sessionId = null;
            try {
                localStorage.removeItem('angband3d_session_id');
                localStorage.removeItem('angband3d_session_save');
                localStorage.setItem('angband3d_session_realm', this.currentRealm);
            } catch (_) {}
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        let wsUrl = `${protocol}//${host}/ws?user=${encodeURIComponent(charName)}`;
        if (isNew) {
            wsUrl += '&new=1';
        }
        if (saveFile) {
            wsUrl += `&save=${encodeURIComponent(saveFile)}`;
        }
        if (realm) {
            wsUrl += `&realm=${encodeURIComponent(realm)}`;
            if (realm === 'hengband') {
                const langMode = window.__langMode || (typeof localStorage !== 'undefined' ? localStorage.getItem('angband3d_lang_mode') : null) || 'en';
                wsUrl += `&lang=${encodeURIComponent(langMode)}`;
            }
        }

        try {
            const targetSlot = saveFile || charName || 'Adventurer';
            const ownerToken = localStorage.getItem(`angband3d_owner_${targetSlot}`);
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
                        } catch (_) {}
                    }
                    // CRITICAL: Once the engine session is initialized, subsequent reconnects must NOT send &new=1!
                    this.currentIsNew = false;
                    if (msg.resumed && this.onStatus) {
                        this.onStatus('Resumed Live Session');
                    }
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
                            this.currentChar = msg.player.name;
                            try {
                                localStorage.setItem('angband3d_session_char', msg.player.name);
                            } catch (_) {}
                        }
                        if (msg.player.dead || (msg.player.hp !== undefined && msg.player.hp <= 0 && msg.player.hp_max > 0)) {
                            this.isDead = true;
                        }
                    }
                    if (this.onFrame) this.onFrame(msg);
                } else if (msg.t === 'error') {
                    console.error('[Engine Error]', msg.message);
                    this.manualDisconnect = true;
                    if (this.reconnectTimer) {
                        clearTimeout(this.reconnectTimer);
                        this.reconnectTimer = null;
                    }
                    if (this.onError) this.onError(msg.message || 'Game engine error');
                } else if (msg.t === 'bye') {
                    this.sessionId = null;
                    try {
                        localStorage.removeItem('angband3d_session_id');
                        localStorage.removeItem('angband3d_session_char');
                        localStorage.removeItem('angband3d_session_save');
                    } catch (_) {}
                    // If the server explicitly terminated or rejected the session, DO NOT auto-reconnect in a loop!
                    this.manualDisconnect = true;
                    if (this.reconnectTimer) {
                        clearTimeout(this.reconnectTimer);
                        this.reconnectTimer = null;
                    }
                    if (this.onBye) this.onBye(msg.detail || 'Game session terminated');
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
            // Unexpected disconnection (lag, socket reset, cell network blip).
            // Reconnect smoothly to existing running session up to max attempts
            if (this.reconnectAttempts >= 6) {
                console.warn('[WebSocket] Maximum reconnection attempts (6) exceeded. Aborting.');
                this.manualDisconnect = true;
                if (this.onStatus) this.onStatus('Disconnected');
                if (this.onError) this.onError(`Unable to establish connection to realm "${this.requestedRealm || 'angband'}". Server unreachable.`);
                return;
            }
            if (this.onStatus) this.onStatus('Connection interrupted. Reconnecting...');
            const delay = Math.min(3000, 1000 + (this.reconnectAttempts * 500));
            this.reconnectAttempts++;
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
                if (!this.manualDisconnect) {
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
        this.sendCommand('save');
        await new Promise(r => setTimeout(r, 300));
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

    sendKey(spec) {
        if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;
        this.lastSentKey = spec;
        this.sentKeyCount = (this.sentKeyCount || 0) + 1;
        this.ws.send(`key ${spec}`);
    }

    sendCommand(cmd) {
        if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(cmd);
    }
}

window.GameNetwork = GameNetwork;

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
        this.onPing = null;
        this.onStatus = null;
        this.onQueue = null;
        this.isInQueue = false;

        try {
            this.sessionId = localStorage.getItem('angband3d_session_id') || null;
            const savedChar = localStorage.getItem('angband3d_session_char');
            if (savedChar) this.currentChar = savedChar;
        } catch (_) {}

        if (typeof document !== 'undefined' && typeof window !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && !this.manualDisconnect) {
                    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
                        this.connect(this.currentChar, false, this.currentSave);
                    } else if (this.ws.readyState === WebSocket.OPEN) {
                        this.lastPingSent = performance.now();
                        try { this.ws.send(JSON.stringify({ t: 'ping', time: Date.now() })); } catch (_) {}
                    }
                }
            });
            window.addEventListener('online', () => {
                if (!this.manualDisconnect && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
                    this.connect(this.currentChar, false, this.currentSave);
                }
            });
        }
    }

    connect(charName = 'Adventurer', isNew = false, saveFile = null) {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.manualDisconnect = false;
        this.isInQueue = false;
        this.currentChar = charName;
        this.currentIsNew = isNew;
        this.currentSave = saveFile;

        // If player explicitly requested a brand new character, drop any previous session reference
        if (isNew) {
            this.sessionId = null;
            try {
                localStorage.removeItem('angband3d_session_id');
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
        if (this.sessionId && !isNew) {
            wsUrl += `&session=${encodeURIComponent(this.sessionId)}`;
        }

        if (this.onStatus) this.onStatus('Connecting to Cloud Realm...');

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
                    if (msg.sessionId) {
                        this.sessionId = msg.sessionId;
                        try {
                            localStorage.setItem('angband3d_session_id', msg.sessionId);
                            localStorage.setItem('angband3d_session_char', this.currentChar || '');
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
                    this.currentIsNew = false;
                    if (msg.player && msg.player.name && msg.player.name !== 'PLAYER') {
                        this.currentChar = msg.player.name;
                        try {
                            localStorage.setItem('angband3d_session_char', msg.player.name);
                        } catch (_) {}
                    }
                    if (this.onFrame) this.onFrame(msg);
                } else if (msg.t === 'bye') {
                    this.sessionId = null;
                    try {
                        localStorage.removeItem('angband3d_session_id');
                        localStorage.removeItem('angband3d_session_char');
                    } catch (_) {}
                    if (msg.detail && msg.detail.toLowerCase().includes('idle')) {
                        this.manualDisconnect = true;
                    }
                    if (this.onBye) this.onBye(msg.detail || 'Game session terminated');
                }
            } catch (err) {
                // Ignore raw non-JSON text frames
            }
        };

        this.ws.onerror = (err) => {
            console.error('[WebSocket Error]', err);
            if (this.onStatus) this.onStatus('Network connection error');
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.stopPingHeartbeat();
            if (this.manualDisconnect) {
                if (this.onStatus) this.onStatus('Disconnected');
                return;
            }
            // Unexpected disconnection (lag, socket reset, cell network blip).
            // Reconnect smoothly to existing running session!
            if (this.onStatus) this.onStatus('Connection interrupted. Reconnecting...');
            const delay = Math.min(3000, 1000 + (this.reconnectAttempts * 500));
            this.reconnectAttempts++;
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
                if (!this.manualDisconnect) {
                    this.connect(this.currentChar, false, this.currentSave);
                }
            }, delay);
        };
    }

    async saveGame() {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
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
        this.ws.send(`key ${spec}`);
    }

    sendCommand(cmd) {
        if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(cmd);
    }
}

window.GameNetwork = GameNetwork;

/**
 * audio-ambience.js — Zero-MB Procedural Web Audio Subterranean Room-Tone Bed
 * Subtle cavern draft & deep-stone air tone modulated by depth and realm.
 * Silent outdoors (depth 0), auto-stopped when disabled or on sound mute.
 * Contract: Pure UMD module, 100% IP-clean (IP-CLEAN-01).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AudioAmbience = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STORAGE_KEY = 'yasd3d_room_tone';
    const REALM_FILTER_HZ = Object.freeze({
        angband: 170,
        silq: 195,
        frogcomposband: 210,
        hengband: 230,
        nethack: 155,
        dcss: 180,
        brogue: 165,
        rogue: 150,
        ryod: 190
    });

    let _srcNode = null;
    let _filterNode = null;
    let _gainNode = null;
    let _noiseBuffer = null;
    let _activeDepth = 0;
    let _activeRealm = 'angband';
    let _lastAudio = null;

    function isEnabled() {
        try {
            return typeof localStorage === 'undefined' || localStorage.getItem(STORAGE_KEY) !== 'off';
        } catch (_) {
            return true;
        }
    }

    function ensureNoiseBuffer(ctx) {
        if (_noiseBuffer && _noiseBuffer.sampleRate === ctx.sampleRate) return _noiseBuffer;
        const length = ctx.sampleRate * 4;
        const buf = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + white * 0.099046;
            b1 = 0.96300 * b1 + white * 0.2965164;
            b2 = 0.57000 * b2 + white * 1.0526913;
            data[i] = Math.max(-0.9, Math.min(0.9, (b0 + b1 + b2 + white * 0.1848) * 0.08));
        }
        // Crossfade head/tail 512 samples for click-free loop seam
        const fade = 512;
        for (let i = 0; i < fade; i++) {
            const k = i / fade;
            data[i] = data[i] * k + data[length - fade + i] * (1 - k);
        }
        _noiseBuffer = buf;
        return buf;
    }

    function stopGraph(ctx) {
        if (_gainNode && ctx) {
            try {
                const now = ctx.currentTime;
                _gainNode.gain.cancelScheduledValues(now);
                _gainNode.gain.setTargetAtTime(0.0001, now, 0.15);
            } catch (_) {}
        }
        if (_srcNode) {
            const old = _srcNode;
            _srcNode = null;
            setTimeout(() => {
                try { old.stop(); old.disconnect(); } catch (_) {}
            }, 350);
        }
        _filterNode = null;
        _gainNode = null;
    }

    function sync(audio, realm, depth) {
        if (audio) _lastAudio = audio;
        if (realm) _activeRealm = String(realm).toLowerCase();
        if (typeof depth === 'number') _activeDepth = depth;
        const a = _lastAudio;
        if (!a || !a.ctx) return;

        const shouldPlay = isEnabled() && a.enabled !== false && a.ctx.state === 'running' && _activeDepth > 0;
        if (!shouldPlay) {
            if (_srcNode) stopGraph(a.ctx);
            return;
        }

        const ctx = a.ctx;
        const now = ctx.currentTime;
        const baseFreq = REALM_FILTER_HZ[_activeRealm] || 170;
        const depthCutoff = Math.max(95, Math.min(260, baseFreq - Math.min(50, _activeDepth) * 1.1));
        const targetGain = Math.min(0.045, 0.018 * (a.masterVolume ?? 0.8) * (a.sfxVolume ?? 0.8));

        if (!_srcNode || !_gainNode || !_filterNode) {
            try {
                const src = ctx.createBufferSource();
                src.buffer = ensureNoiseBuffer(ctx);
                src.loop = true;

                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(depthCutoff, now);
                filter.Q.setValueAtTime(0.7, now);

                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.linearRampToValueAtTime(targetGain, now + 0.8);

                src.connect(filter);
                filter.connect(gain);
                gain.connect(a.masterGain || ctx.destination);
                src.start(now);

                _srcNode = src;
                _filterNode = filter;
                _gainNode = gain;
            } catch (_) {
                _srcNode = null;
            }
        } else {
            try {
                _filterNode.frequency.setTargetAtTime(depthCutoff, now, 0.25);
                _gainNode.gain.setTargetAtTime(targetGain, now, 0.25);
            } catch (_) {}
        }
    }

    function setEnabled(enabled, audio) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
            }
        } catch (_) {}
        sync(audio || _lastAudio, _activeRealm, _activeDepth);
    }

    return { isEnabled, sync, setEnabled };
});

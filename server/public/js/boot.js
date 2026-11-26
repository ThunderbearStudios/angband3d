(function () {
    'use strict';
    // Derive canonical asset version from boot.js?v=... before any subsystem loads (CSP-clean, zero inline script)
    const cur = document.currentScript;
    const vMatch = cur && cur.src ? cur.src.match(/[?&]v=([^&]+)/) : null;
    const ver = (vMatch && vMatch[1]) || window.ASSET_VERSION || window.APP_VERSION || '13.3.4';
    window.ASSET_VERSION = ver;
    window.__ASSET_V = ver;
    window.APP_VERSION = window.APP_VERSION || ver;
    window.__assetUrl = function (u) {
        if (!u || typeof u !== 'string' || u.startsWith('data:') || u.startsWith('blob:') || u.includes('?v=') || u.includes('&v=')) return u;
        return u + (u.includes('?') ? '&v=' : '?v=') + (window.__ASSET_V || window.APP_VERSION || ver);
    };

    // Wave 2C runtime feature flags (defaults + localStorage + URL ?flag_<KEY>=0|1 overrides)
    const defaultFlags = {
        AUDIO_HRTF_3D: true,
        PROMPT_MIRROR_3D: true,
        SILQ_WASM_LOCAL: false,
        RENDERER_THREE_V2: true,
        WEBGPU_EXPERIMENTAL: false
    };
    try {
        const storedFlags = window.localStorage && localStorage.getItem('yasd_flags_v1');
        if (storedFlags) {
            const parsed = JSON.parse(storedFlags);
            if (parsed && typeof parsed === 'object') {
                for (const k of Object.keys(defaultFlags)) {
                    if (typeof parsed[k] === 'boolean') defaultFlags[k] = parsed[k];
                }
            }
        }
    } catch (_) {}
    try {
        if (window.location && window.location.search) {
            const qs = new URLSearchParams(window.location.search);
            for (const k of Object.keys(defaultFlags)) {
                const raw = qs.get('flag_' + k);
                if (raw === '1' || raw === 'true') defaultFlags[k] = true;
                else if (raw === '0' || raw === 'false') defaultFlags[k] = false;
            }
        }
    } catch (_) {}
    window.YASD_FLAGS = Object.freeze(Object.assign({}, defaultFlags));
    window.__setYasdFlag = function (key, val) {
        if (!(key in defaultFlags)) return false;
        defaultFlags[key] = Boolean(val);
        window.YASD_FLAGS = Object.freeze(Object.assign({}, defaultFlags));
        try { if (window.localStorage) localStorage.setItem('yasd_flags_v1', JSON.stringify(defaultFlags)); } catch (_) {}
        return true;
    };

    const _lazyBundleCache = new Map();
    window.__loadLazyBundle = function (name) {
        const key = String(name || '').trim();
        if (!key) return Promise.reject(new Error('Missing bundle name'));
        if (_lazyBundleCache.has(key)) return _lazyBundleCache.get(key);
        const p = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.async = true;
            s.src = '/dist/' + encodeURIComponent(key) + '.min.js?v=' + encodeURIComponent(window.__ASSET_V || window.APP_VERSION || ver);
            s.onload = () => resolve(true);
            s.onerror = () => {
                _lazyBundleCache.delete(key);
                reject(new Error('Failed to load bundle: ' + key));
            };
            document.head.appendChild(s);
        });
        _lazyBundleCache.set(key, p);
        return p;
    };

    document.addEventListener('DOMContentLoaded', () => {
        // Stop propagation for Hengband language selector wrap
        const langWrap = document.querySelector('.splash-lang-select-wrap');
        if (langWrap) {
            langWrap.addEventListener('click', (e) => e.stopPropagation());
        }

        // Lazy-load demo player bundle if demo/showcase query parameter requested
        if (window.location.search && /[?&](?:demo|showcase)=1\b/.test(window.location.search)) {
            window.__loadLazyBundle('demo').catch(() => {});
        }

        // Demo recorder load
        if (window.location.search && window.location.search.includes('record_walkthrough=1')) {
            const s = document.createElement('script');
            s.src = '/js/demo-recorder.js?v=' + encodeURIComponent(window.__ASSET_V || ver);
            document.body.appendChild(s);
        }
    });
})();

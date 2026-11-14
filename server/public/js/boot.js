'use strict';
(function () {
    // Derive canonical asset version from boot.js?v=... before any subsystem loads (CSP-clean, zero inline script)
    const cur = document.currentScript;
    const vMatch = cur && cur.src ? cur.src.match(/[?&]v=([^&]+)/) : null;
    const ver = (vMatch && vMatch[1]) || window.ASSET_VERSION || window.APP_VERSION || '12.3.7';
    window.ASSET_VERSION = ver;
    window.__ASSET_V = ver;
    window.APP_VERSION = window.APP_VERSION || ver;
    window.__assetUrl = function (u) {
        if (!u || typeof u !== 'string' || u.startsWith('data:') || u.startsWith('blob:') || u.includes('?v=') || u.includes('&v=')) return u;
        return u + (u.includes('?') ? '&v=' : '?v=') + (window.__ASSET_V || window.APP_VERSION || ver);
    };

    document.addEventListener('DOMContentLoaded', () => {
        // Stop propagation for Hengband language selector wrap
        const langWrap = document.querySelector('.splash-lang-select-wrap');
        if (langWrap) {
            langWrap.addEventListener('click', (e) => e.stopPropagation());
        }

        // Demo recorder load
        if (window.location.search && window.location.search.includes('record_walkthrough=1')) {
            const s = document.createElement('script');
            s.src = '/js/demo-recorder.js?v=' + encodeURIComponent(window.__ASSET_V || ver);
            document.body.appendChild(s);
        }
    });
})();

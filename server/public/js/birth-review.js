/**
 * birth-review.js — Pre-Embark Character Review Banner & PBR Texture Prewarm Controller
 * Ensures every New Game stops on the hero review screen with Embark, Reroll, Realm Switcher,
 * Custom Build, and Main Menu controls plus non-blocking high-res 3D texture pre-buffering.
 */
(function (root) {
    'use strict';

    const REALM_OPTIONS = [
        { key: 'angband', label: 'Vanilla Angband 4.2.6' },
        { key: 'silq', label: 'Sil-Q 1.5+' },
        { key: 'frogcomposband', label: 'FrogComposband' },
        { key: 'hengband', label: 'Hengband 3.0' },
        { key: 'nethack', label: 'NetHack 3.6.7' },
        { key: 'dcss', label: 'Dungeon Crawl Stone Soup' },
        { key: 'brogue', label: 'Brogue 1.14 CE' },
        { key: 'rogue', label: 'Rogue 5.4.4' },
        { key: 'ryod', label: 'Roll Your Own Dungeon (RYOD)' }
    ];

    const REALM_LABELS = Object.fromEntries(REALM_OPTIONS.map((r) => [r.key, r.label]));

    let currentCallbacks = {};
    let prewarmSeq = 0;

    function rowsToText(frame) {
        if (!frame || !frame.term || !Array.isArray(frame.term.rows)) return '';
        return frame.term.rows.map((r) => (r && r.g) ? r.g : '').join('\n');
    }

    function matchTermField(text, regex) {
        const m = text.match(regex);
        return m && m[1] ? m[1].trim().replace(/\s+/g, ' ') : '';
    }

    function extractHeroSummaryFromFrame(frame, realm) {
        const realmKey = String((frame && frame.realm) || realm || 'angband').toLowerCase();
        const realmTitle = REALM_LABELS[realmKey] || realmKey.toUpperCase();
        const p = (frame && frame.player) || {};
        const text = rowsToText(frame);

        let name = (p.name && p.name !== 'PLAYER') ? String(p.name).trim() : '';
        if (!name) name = matchTermField(text, /(?:Name|Hero)\s*:\s*([^\r\n|]{1,24})/i);

        let race = p.race ? String(p.race).trim() : '';
        if (!race) race = matchTermField(text, /Race\s*:\s*([^\r\n|]{1,22})/i);

        let cls = (p.class || p.cls) ? String(p.class || p.cls).trim() : '';
        if (!cls) cls = matchTermField(text, /(?:Class|Origin|Role|House)\s*:\s*([^\r\n|]{1,22})/i);

        const hp = (typeof p.hp === 'number' && p.hp > 0) ? p.hp : Number(matchTermField(text, /(?:Max Hit Points|Hit Points|HP)\s*[: ]\s*\d+\/(\d+)|(?:Max Hit Points|Hit Points)\s*[: ]\s*(\d+)/i) || 0);
        const parts = [realmTitle];
        if (name || race || cls) {
            const identity = [name || 'Hero', [race, cls].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
            parts.push(identity);
        }
        if (typeof p.str === 'number' && p.str > 0) {
            parts.push(`STR ${p.str} DEX ${p.dex || p.str} CON ${p.con || p.str}`);
        }
        if (hp > 0) {
            parts.push(`HP ${hp}`);
        }
        parts.push('Review build & starting gear before descending');
        return parts.join(' • ');
    }

    function ensureSelectOptions(selectEl) {
        if (!selectEl || selectEl.options.length > 0) return;
        for (const opt of REALM_OPTIONS) {
            const o = document.createElement('option');
            o.value = opt.key;
            o.textContent = opt.label;
            selectEl.appendChild(o);
        }
    }

    function bindBannerControls(banner) {
        if (!banner || banner.dataset.bound === '1') return;
        banner.dataset.bound = '1';

        const bindBtn = (id, cbName) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                const fn = currentCallbacks[cbName];
                if (typeof fn === 'function') fn();
            });
        };

        bindBtn('btn-review-embark', 'onEmbark');
        bindBtn('btn-review-reroll', 'onReroll');
        bindBtn('btn-review-custom', 'onCustom');
        bindBtn('btn-review-main-menu', 'onMainMenu');

        const realmSelect = document.getElementById('birth-review-realm-select');
        if (realmSelect) {
            ensureSelectOptions(realmSelect);
            realmSelect.addEventListener('change', (e) => {
                const chosen = e && e.target ? String(e.target.value || '').toLowerCase() : '';
                if (!chosen) return;
                if (typeof currentCallbacks.onSwitchRealm === 'function') {
                    currentCallbacks.onSwitchRealm(chosen);
                }
            });
        }
    }

    function syncBanner(active, frame, realm, callbacks) {
        if (callbacks && typeof callbacks === 'object') {
            currentCallbacks = { ...currentCallbacks, ...callbacks };
        }
        const banner = document.getElementById('birth-review-banner');
        if (!banner) return;
        bindBannerControls(banner);
        banner.classList.toggle('hidden', !active);
        if (!active) return;

        const realmKey = String((frame && frame.realm) || realm || 'angband').toLowerCase();
        const realmSelect = document.getElementById('birth-review-realm-select');
        if (realmSelect) {
            ensureSelectOptions(realmSelect);
            if (REALM_LABELS[realmKey] && realmSelect.value !== realmKey) {
                realmSelect.value = realmKey;
            }
        }
        const summaryEl = document.getElementById('birth-review-summary-text');
        if (summaryEl) {
            summaryEl.textContent = extractHeroSummaryFromFrame(frame, realmKey);
        }
    }

    function updatePrewarmUi(loaded, total, done) {
        const statusEl = document.getElementById('birth-review-tex-status');
        const progEl = document.getElementById('birth-review-tex-progress');
        if (progEl) {
            if (total > 0) {
                progEl.max = total;
                progEl.value = Math.min(total, Math.max(0, loaded));
            } else {
                progEl.max = 100;
                progEl.value = done ? 100 : 18;
            }
        }
        if (statusEl) {
            if (done || (total > 0 && loaded >= total)) {
                statusEl.textContent = '✓ High-Res 3D Textures Buffered & Ready';
            } else if (total > 0) {
                statusEl.textContent = `Loading High-Res 3D Textures (${loaded}/${total} maps)...`;
            } else {
                statusEl.textContent = 'Warming High-Res 3D Textures...';
            }
        }
    }

    function startReviewTexturePrewarm(realm, dungeonInstance) {
        const token = ++prewarmSeq;
        const realmKey = String(realm || 'angband').toLowerCase();
        if (typeof root.Dungeon3D === 'function' && typeof root.Dungeon3D.prefetchRealmTextureHttp === 'function') {
            root.Dungeon3D.prefetchRealmTextureHttp(realmKey);
        }
        if (dungeonInstance && typeof dungeonInstance.prewarmRealmPbr === 'function') {
            updatePrewarmUi(0, 0, false);
            return dungeonInstance.prewarmRealmPbr(realmKey, (loaded, total, done) => {
                if (token !== prewarmSeq) return;
                updatePrewarmUi(loaded, total, done);
            });
        }
        updatePrewarmUi(0, 0, false);
        return Promise.resolve({ loaded: 0, total: 0, warm: false });
    }

    function resetBanner() {
        prewarmSeq++;
        const banner = document.getElementById('birth-review-banner');
        if (banner) banner.classList.add('hidden');
        updatePrewarmUi(0, 0, false);
    }

    const api = {
        REALM_OPTIONS,
        extractHeroSummaryFromFrame,
        syncBanner,
        startReviewTexturePrewarm,
        resetBanner
    };

    root.BirthReview = api;
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);

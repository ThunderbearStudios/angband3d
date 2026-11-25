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

    function rowsToText(frame, realmKey) {
        if (!frame || !frame.term || !Array.isArray(frame.term.rows)) return '';
        let raw = frame.term.rows.map((r) => (r && r.g) ? r.g : '').join('\n');
        if (realmKey === 'hengband') {
            const dec = (root.__app && root.__app.decodeHengbandText) || root.decodeHengbandText || (root.ScreenContext && root.ScreenContext.decodeSjis);
            if (typeof dec === 'function') raw = dec(raw);
        }
        return raw;
    }

    function matchTermField(text, regex) {
        const m = text.match(regex);
        return m && m[1] ? m[1].trim().replace(/\s+/g, ' ') : '';
    }

    function formatBirthStat(val, realmKey) {
        const RC = root.RealmCartridge || (typeof require === 'function' ? (() => { try { return require('./realm-cartridge.js'); } catch (_) { return null; } })() : null);
        if (RC && typeof RC.formatStatValue === 'function') {
            return RC.formatStatValue(val, realmKey);
        }
        const n = Number(val);
        if (!Number.isFinite(n)) return String(val || '');
        if ((realmKey === 'angband' || realmKey === 'frogcomposband' || realmKey === 'hengband') && n > 18) {
            return n >= 118 ? '18/***' : `18/${String(n - 18).padStart(2, '0')}`;
        }
        return String(n);
    }

    function extractHeroSummaryFromFrame(frame, realm) {
        const realmKey = String((frame && frame.realm) || realm || 'angband').toLowerCase();
        const realmTitle = REALM_LABELS[realmKey] || realmKey.toUpperCase();
        const p = (frame && frame.player) || {};
        const text = rowsToText(frame, realmKey);

        let rawName = (p.name && p.name !== 'PLAYER') ? String(p.name).trim() : '';
        if (!rawName) rawName = matchTermField(text, /(?:Name|Hero)\s*:\s*([^\r\n|]{1,24})/i);
        const name = (typeof root.formatDisplayHeroName === 'function' && rawName) ? root.formatDisplayHeroName(rawName) : rawName;

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
        if (realmKey === 'silq') {
            if (typeof p.str === 'number' && p.str > 0) {
                parts.push(`STR ${p.str} DEX ${p.dex ?? p.str} CON ${p.con ?? p.str} GRA ${p.gra ?? p.wis ?? 0}`);
            }
            if (hp > 0) parts.push(`HP ${hp}`);
            if (p.evn !== undefined || p.pr_min !== undefined) parts.push(`Evn ${p.evn ?? p.ac ?? 0} Prot ${p.pr_min ?? 0}-${p.pr_max ?? 0}`);
            if (typeof p.sp_max === 'number' && p.sp_max > 0) parts.push(`Voice ${p.sp ?? p.sp_max}/${p.sp_max}`);
        } else if (realmKey === 'dcss') {
            if (typeof p.str === 'number' && p.str > 0) parts.push(`STR ${p.str} INT ${p.int ?? 10} DEX ${p.dex ?? p.str}`);
            if (hp > 0) parts.push(`HP ${hp}`);
            if (typeof p.ac === 'number') parts.push(`AC ${p.ac} EV ${p.ev ?? 10} SH ${p.sh ?? 0}`);
            if (p.deity || p.god) parts.push(`God: ${p.deity || p.god}`);
        } else if (realmKey === 'brogue') {
            if (typeof p.str === 'number' && p.str > 0) parts.push(`STR ${p.str}`);
            if (hp > 0) parts.push(`HP ${hp}`);
            if (typeof p.ac === 'number') parts.push(`Armor ${p.ac}`);
        } else if (realmKey === 'rogue') {
            if (typeof p.str === 'number' && p.str > 0) parts.push(`STR ${p.str}`);
            if (hp > 0) parts.push(`HP ${hp}`);
            if (typeof p.ac === 'number') parts.push(`Arm ${p.ac}`);
        } else {
            if (typeof p.str === 'number' && p.str > 0) {
                const stats = [`STR ${formatBirthStat(p.str, realmKey)}`];
                if (typeof p.int === 'number') stats.push(`INT ${formatBirthStat(p.int, realmKey)}`);
                if (typeof p.wis === 'number') stats.push(`WIS ${formatBirthStat(p.wis, realmKey)}`);
                stats.push(`DEX ${formatBirthStat(p.dex || p.str, realmKey)}`, `CON ${formatBirthStat(p.con || p.str, realmKey)}`);
                if (typeof p.chr === 'number') stats.push(`CHR ${formatBirthStat(p.chr, realmKey)}`);
                parts.push(stats.join(' '));
            }
            if (hp > 0) parts.push(`HP ${hp}`);
            if (typeof p.sp_max === 'number' && p.sp_max > 0) parts.push(`MP ${p.sp ?? p.sp_max}`);
            if (typeof p.ac === 'number') parts.push(`AC ${p.ac}`);
            if (typeof p.au === 'number' || typeof p.gold === 'number') parts.push(`${p.au !== undefined ? p.au : p.gold} au`);
        }
        const gearPool = []
            .concat(Array.isArray(p.equipment) ? p.equipment : [])
            .concat(Array.isArray(p.inventory) ? p.inventory : [])
            .map(it => it && (it.name || it.dname || it.label || ''))
            .filter(Boolean)
            .slice(0, 2);
        if (gearPool.length > 0) parts.push(`Gear: ${gearPool.join(', ')}`);
        else parts.push('Review build & starting gear before descending');
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

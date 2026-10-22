/**
 * radial-menu.js — Angband3D Concentric Marking Menu (WS42.7)
 * Implements 2 concentric rings × 8 fixed angular wedges (Kurtenbach & Buxton 1994),
 * hold-to-open and toggle modes (XAG 107), and realm-aware key resolution.
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RadialMenu = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const INNER_VERBS = Object.freeze(['quaff', 'read', 'use_staff', 'aim', 'fire', 'throw', 'wield', 'drop']);
    const OUTER_VERBS = Object.freeze(['cast', 'rest', 'open', 'disarm', 'tunnel', 'look', 'map', 'char_sheet']);

    const FALLBACK_KEYS = Object.freeze({
        angband: {
            quaff: 'q', read: 'r', use_staff: 'u', aim: 'z', fire: 'f', throw: 'v', wield: 'w', drop: 'd',
            cast: 'm', rest: 'R', open: 'o', disarm: 'D', tunnel: 'T', look: 'l', map: 'M', char_sheet: 'C'
        },
        silq: {
            quaff: 'q', read: null, use_staff: 'a', aim: 'z', fire: 'f', throw: 't', wield: 'w', drop: 'd',
            cast: null, rest: '%', open: 'o', disarm: 'D', tunnel: 'T', look: 'l', map: 'M', char_sheet: 'C'
        },
        frogcomposband: {
            quaff: 'q', read: 'r', use_staff: 'u', aim: 'z', fire: 'f', throw: 'v', wield: 'w', drop: 'd',
            cast: 'm', rest: 'R', open: 'o', disarm: 'D', tunnel: 'T', look: 'l', map: 'M', char_sheet: 'C'
        },
        hengband: {
            quaff: 'q', read: 'r', use_staff: 'u', aim: 'z', fire: 'f', throw: 'v', wield: 'w', drop: 'd',
            cast: 'm', rest: 'R', open: 'o', disarm: 'D', tunnel: 'T', look: 'l', map: 'M', char_sheet: 'C'
        }
    });

    const DEFAULT_LABELS = Object.freeze({
        quaff: 'Quaff Potion', read: 'Read Scroll', use_staff: 'Use Staff', aim: 'Aim Wand',
        fire: 'Shoot Quiver', throw: 'Throw Item', wield: 'Wield / Equip', drop: 'Drop Item',
        cast: 'Cast Spell', rest: 'Rest', open: 'Open Door', disarm: 'Disarm Trap',
        tunnel: 'Tunnel Wall', look: 'Look', map: 'Overland Map', char_sheet: 'Character Sheet'
    });

    const DEFAULT_ICONS = Object.freeze({
        quaff: '🧪', read: '📜', use_staff: '🪄', aim: '✨',
        fire: '🏹', throw: '🎯', wield: '⚔', drop: '📦',
        cast: '✨', rest: '⏳', open: '🚪', disarm: '⚙',
        tunnel: '⛏', look: '👁', map: '🗺', char_sheet: '👤'
    });

    /**
     * Build 8 fixed-position wedges for the given realm and ring.
     * Disabled verbs retain their angular index with disabled: true (Kurtenbach principle).
     */
    function buildWedges(realm = 'angband', ring = 'inner') {
        const r = String(realm || 'angband').toLowerCase();
        const isInner = ring === 0 || ring === 'inner';
        const ringName = isInner ? 'inner' : 'outer';
        const verbs = isInner ? INNER_VERBS : OUTER_VERBS;

        const catalog = (typeof ActionCatalog !== 'undefined') ? ActionCatalog : (typeof window !== 'undefined' ? window.ActionCatalog : null);
        const realmKeyMap = FALLBACK_KEYS[r] || FALLBACK_KEYS.angband;

        return verbs.map((verb, index) => {
            let key = null;
            let label = DEFAULT_LABELS[verb] || verb;
            let icon = DEFAULT_ICONS[verb] || '';

            if (catalog && typeof catalog.get === 'function') {
                const cmd = catalog.get(verb);
                if (cmd) {
                    if (cmd.keys && cmd.keys[r] !== undefined) key = cmd.keys[r];
                    else key = realmKeyMap[verb] !== undefined ? realmKeyMap[verb] : null;
                    if (cmd.labels && cmd.labels.en) label = cmd.labels.en;
                    if (cmd.icon) icon = cmd.icon;
                } else {
                    key = realmKeyMap[verb] !== undefined ? realmKeyMap[verb] : null;
                }
            } else {
                key = realmKeyMap[verb] !== undefined ? realmKeyMap[verb] : null;
            }

            const disabled = (key === null || key === undefined);

            return {
                index,
                id: verb,
                verb,
                ring: ringName,
                angle: index * 45,
                key,
                label,
                icon,
                disabled
            };
        });
    }

    /**
     * Maps stick/pointer offset (dx, dy) to a wedge index (0..7 clockwise from North).
     * Returns null if magnitude is inside deadzone.
     */
    function angleToWedgeIndex(dx, dy, deadzone = 0.28) {
        const mag = Math.hypot(dx, dy);
        if (mag < deadzone) return null;

        let deg = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
        if (deg < 0) deg += 360;

        return Math.floor(((deg + 22.5) % 360) / 45);
    }

    class RadialMenu {
        constructor(options = {}) {
            this.options = options;
            this.mode = options.mode || 'toggle'; // 'toggle' | 'hold' (XAG 107)
            this.realm = options.realm || 'angband';
            this.activeRing = options.ring === 1 || options.ring === 'outer' ? 1 : 0;
            this.isOpen = false;
            this.selectedIndex = null;
            this.el = null;

            if (typeof document !== 'undefined') {
                this._initDom();
            }
        }

        _initDom() {
            let root = document.getElementById('radial-menu-overlay');
            if (!root) {
                root = document.createElement('div');
                root.id = 'radial-menu-overlay';
                root.className = 'radial-menu-overlay hidden';
                root.innerHTML = '<div class="radial-menu-disc" id="radial-menu-disc"></div>';
                document.body.appendChild(root);
            }
            this.el = root;
        }

        open(ring) {
            if (ring !== undefined) this.setRing(ring);
            this.isOpen = true;
            this.selectedIndex = null;
            if (this.el) {
                this.el.classList.remove('hidden');
                this.render();
            }
        }

        close() {
            this.isOpen = false;
            this.selectedIndex = null;
            if (this.el) this.el.classList.add('hidden');
        }

        toggle(ring) {
            if (this.isOpen) this.close();
            else this.open(ring);
        }

        setRing(ring) {
            this.activeRing = (ring === 1 || ring === 'outer') ? 1 : 0;
            if (this.isOpen) this.render();
        }

        setMode(mode) {
            if (mode === 'toggle' || mode === 'hold') this.mode = mode;
        }

        render() {
            if (!this.el) return;
            const disc = this.el.querySelector('#radial-menu-disc');
            if (!disc) return;

            const r = this.realm || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');
            const wedges = buildWedges(r, this.activeRing);
            disc.innerHTML = wedges.map((w, idx) => {
                const isSel = idx === this.selectedIndex;
                const disClass = w.disabled ? ' wedge-disabled' : '';
                const selClass = isSel ? ' wedge-selected' : '';
                return `<div class="radial-wedge${disClass}${selClass}" data-index="${idx}" style="--wedge-angle: ${w.angle}deg;">` +
                    `<span class="radial-icon">${w.icon}</span>` +
                    `<span class="radial-label">${w.label}</span>` +
                    (w.key ? `<kbd class="radial-key">${w.key}</kbd>` : '') +
                    `</div>`;
            }).join('');
        }

        selectWedge(index) {
            const r = this.realm || (typeof window !== 'undefined' && window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');
            const wedges = buildWedges(r, this.activeRing);
            const wedge = wedges[index];
            if (!wedge || wedge.disabled) return false;

            if (typeof this.options.onSelect === 'function') {
                this.options.onSelect(wedge);
            } else if (typeof window !== 'undefined') {
                if (window.CommandDispatcher && typeof window.CommandDispatcher.run === 'function') {
                    window.CommandDispatcher.run(wedge.id);
                } else if (wedge.key && window.__app && window.__app.network) {
                    window.__app.network.sendKey(wedge.key);
                }
            }

            this.close();
            return true;
        }
    }

    RadialMenu.buildWedges = buildWedges;
    RadialMenu.angleToWedgeIndex = angleToWedgeIndex;
    RadialMenu.INNER_VERBS = INNER_VERBS;
    RadialMenu.OUTER_VERBS = OUTER_VERBS;

    return RadialMenu;
}));

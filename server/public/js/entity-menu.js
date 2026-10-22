/**
 * entity-menu.js — 3D Entity Context Actions Menu
 *
 * WS42 Command & Menu Unification (Card WS42.5C, §6.8 #5, §8, §16.4, §16.5).
 * Generates and dispatches context actions for clicked 3D entities:
 *   - Monsters: Look, Target, Fire at, Throw at, Cast/Song/Power at, Recall
 *   - Floor Items: Walk to, Pick up, Examine
 *   - Features: Open, Close, Disarm, Bash, Tunnel, Alter, Stairs
 *
 * Renders into #entity-context-actions inside #entity-inspect-popover (L51 no focus steal).
 *
 * UMD: browser -> window.EntityMenu; Node -> module.exports.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EntityMenu = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let ActionCatalogModule = null;
    if (typeof require === 'function') {
        try { ActionCatalogModule = require('./action-catalog'); } catch (_) {}
    }

    function getCatalog() {
        if (typeof window !== 'undefined' && window.ActionCatalog) return window.ActionCatalog;
        if (ActionCatalogModule) return ActionCatalogModule;
        return null;
    }

    /**
     * Pure function returning context actions for an entity.
     * Testable in Node without DOM.
     * @param {Object} entity
     * @param {string} [realm='angband']
     * @param {Object} [frame]
     * @returns {Array<{ id: string, label: string, key: string|null }>}
     */
    function buildActionsForEntity(entity, realm, frame) {
        if (!entity || typeof entity !== 'object') return [];

        const r = (realm || (frame && frame.realm) || 'angband').toLowerCase();
        const type = String(entity.type || entity.kind || '').toLowerCase();
        const catalog = getCatalog();

        function keyFor(id, fallback) {
            if (catalog && typeof catalog.keyFor === 'function') {
                const k = catalog.keyFor(id, r);
                if (k !== null && k !== undefined) return k;
            }
            return fallback;
        }

        if (type === 'monster' || type === 'creature') {
            const actions = [
                { id: 'look', label: 'Look', key: keyFor('look', 'l') },
                { id: 'target', label: 'Target', key: (r === 'silq' ? 'f' : keyFor('target', '*')) },
                { id: 'fire', label: 'Fire at', key: (r === 'silq' ? 't' : keyFor('fire', 'f')) },
                { id: 'throw', label: 'Throw at', key: keyFor('throw', 'v') }
            ];

            if (r === 'silq') {
                actions.push({ id: 'song', label: 'Song at', key: 's' });
            } else if (r === 'frogcomposband' || r === 'hengband') {
                actions.push({ id: 'cast', label: 'Cast at', key: 'm' });
                actions.push({ id: 'power', label: 'Power at', key: 'U' });
            } else {
                actions.push({ id: 'cast', label: 'Cast at', key: 'm' });
            }

            actions.push({ id: 'recall', label: 'Recall', key: '/' });
            return actions;
        }

        if (type === 'item') {
            return [
                { id: 'walk_to', label: 'Walk to', key: null },
                { id: 'pickup', label: 'Pick up', key: keyFor('pickup', 'g') },
                { id: 'examine', label: 'Examine', key: (r === 'silq' ? 'x' : keyFor('examine', 'I')) }
            ];
        }

        if (type === 'door') {
            return [
                { id: 'open', label: 'Open', key: keyFor('open', 'o') },
                { id: 'close', label: 'Close', key: keyFor('close', 'c') },
                { id: 'bash', label: 'Bash', key: (r === 'silq' ? 'b' : keyFor('bash', 'B')) },
                { id: 'disarm', label: 'Disarm', key: keyFor('disarm', 'D') }
            ];
        }

        if (type === 'trap') {
            return [
                { id: 'disarm', label: 'Disarm', key: keyFor('disarm', 'D') }
            ];
        }

        if (type === 'rubble') {
            return [
                { id: 'tunnel', label: 'Tunnel', key: keyFor('tunnel', 'T') },
                { id: 'alter', label: 'Alter', key: (r === 'silq' ? '/' : keyFor('alter', '+')) }
            ];
        }

        if (type === 'stair' || type === 'stairs' || type === 'staircase') {
            return [
                { id: 'stairs_up', label: 'Stairs Up', key: keyFor('stairs_up', '<') },
                { id: 'stairs_down', label: 'Stairs Down', key: keyFor('stairs_down', '>') }
            ];
        }

        // Generic feature
        return [
            { id: 'open', label: 'Open', key: keyFor('open', 'o') },
            { id: 'close', label: 'Close', key: keyFor('close', 'c') },
            { id: 'disarm', label: 'Disarm', key: keyFor('disarm', 'D') },
            { id: 'bash', label: 'Bash', key: (r === 'silq' ? 'b' : keyFor('bash', 'B')) },
            { id: 'tunnel', label: 'Tunnel', key: keyFor('tunnel', 'T') },
            { id: 'alter', label: 'Alter', key: (r === 'silq' ? '/' : keyFor('alter', '+')) },
            { id: 'stairs_up', label: 'Stairs Up', key: keyFor('stairs_up', '<') },
            { id: 'stairs_down', label: 'Stairs Down', key: keyFor('stairs_down', '>') }
        ];
    }

    function ensureContainer() {
        if (typeof document === 'undefined') return null;
        let c = document.getElementById('entity-context-actions');
        if (!c) {
            const popover = document.getElementById('entity-inspect-popover');
            if (!popover) return null;
            c = document.createElement('div');
            c.id = 'entity-context-actions';
            c.className = 'entity-context-actions';
            popover.appendChild(c);
        }
        return c;
    }

    function render(entity, realm, frame, opts) {
        if (typeof document === 'undefined') return;

        opts = opts || {};
        const container = opts.container || ensureContainer();
        if (!container) return;

        const actions = buildActionsForEntity(entity, realm, frame);
        container.textContent = '';

        if (!actions.length) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        for (let i = 0; i < actions.length; i++) {
            const act = actions[i];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'entity-action-btn';
            btn.setAttribute('data-action-id', act.id);

            if (act.key) {
                btn.setAttribute('data-key', act.key);
                const kbd = document.createElement('kbd');
                kbd.className = 'entity-action-kbd';
                kbd.textContent = `[${act.key}]`;
                btn.appendChild(kbd);
            }

            const labelSpan = document.createElement('span');
            labelSpan.textContent = act.label;
            btn.appendChild(labelSpan);

            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const d = opts.dispatcher || (typeof window !== 'undefined' && window.__app && window.__app.dispatcher) || null;
                if (d && typeof d.run === 'function') {
                    d.run({ verb: act.id, target: entity, key: act.key });
                } else if (act.key) {
                    const net = (typeof window !== 'undefined' && window.__app && window.__app.network) || (window && window.network);
                    if (net && typeof net.sendKey === 'function') {
                        net.sendKey(act.key);
                    }
                }
            });

            container.appendChild(btn);
        }
    }

    return Object.freeze({
        buildActionsForEntity,
        render
    });
});

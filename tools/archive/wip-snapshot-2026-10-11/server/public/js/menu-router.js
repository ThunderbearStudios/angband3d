(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        factory(exports);
    } else {
        root.MenuRouter = {};
        factory(root.MenuRouter);
    }
}(typeof self !== 'undefined' ? self : this, function (exports) {

    // ⚠ citations for silq from variants/silq-src/src/cmd3.c process_command
    // ⚠ citations for hengband from variants/hengband-src/src/cmd/cmd-process.c
    // ⚠ citations for fcb from variants/frogcomposband-src/src/cmd3.c process_command
    const VERBS = {
        silq: {
            w: { icon: '⚔', label: 'Wear/Wield', glyphs: '|/\\}()=["~{' },
            r: { icon: '🛡', label: 'Take off', listOnly: 'equip' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            d: { icon: '📦', label: 'Drop' },
            t: { icon: '🎯', label: 'Throw' },
            x: { icon: '🔍', label: 'Examine' },
            k: { icon: '🗑', label: 'Destroy' }
        },
        hengband: {
            w: { icon: '⚔', label: 'Wear/Wield', glyphs: '|/\\}()=["~{' },
            t: { icon: '🛡', label: 'Take off', listOnly: 'equip' },
            E: { icon: '🍖', label: 'Eat', glyphs: ',' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            u: { icon: '🪄', label: 'Use staff', glyphs: '_' },
            a: { icon: '⚡', label: 'Aim wand', glyphs: '-' },
            z: { icon: '💥', label: 'Zap rod', glyphs: '-' },
            A: { icon: '🔮', label: 'Activate', listOnly: 'equip' },
            v: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            I: { icon: '🔍', label: 'Examine' },
            k: { icon: '🗑', label: 'Destroy' }
        },
        frogcomposband: {
            w: { icon: '⚔', label: 'Wear/Wield', glyphs: '|/\\}()=["~{' },
            t: { icon: '🛡', label: 'Take off', listOnly: 'equip' },
            E: { icon: '🍖', label: 'Eat', glyphs: ',' },
            q: { icon: '🧪', label: 'Quaff', glyphs: '!' },
            r: { icon: '📜', label: 'Read', glyphs: '?' },
            u: { icon: '🪄', label: 'Use staff', glyphs: '_' },
            a: { icon: '⚡', label: 'Aim wand', glyphs: '-' },
            z: { icon: '💥', label: 'Zap rod', glyphs: '-' },
            A: { icon: '🔮', label: 'Activate', listOnly: 'equip' },
            v: { icon: '🎯', label: 'Throw' },
            d: { icon: '📦', label: 'Drop' },
            I: { icon: '🔍', label: 'Examine' }, // or native letter
            k: { icon: '🗑', label: 'Destroy' }
        }
    };

    let pending = null; // { item, listKind, step, verb, deadline } | null

    function getSendKey() {
        if (typeof window !== 'undefined' && window.__network && window.__network.sendKey) {
            return window.__network.sendKey;
        } else if (typeof global !== 'undefined' && global.testSendKey) {
            return global.testSendKey;
        }
        return () => {};
    }

    function getToast() {
        if (typeof window !== 'undefined' && window.__app && window.__app.showToast) {
            return window.__app.showToast;
        }
        return (msg) => console.log('Toast:', msg);
    }

    function normalizeLabel(label) {
        if (!label) return '';
        return label.replace(/^\d+\s+/, '').replace(/\s+\(.*?\)$/, '').toLowerCase().trim();
    }

    function route(key, frame, realm) {
        if (!frame || !realm) return false;
        
        let classifier = null;
        if (typeof window !== 'undefined' && window.ScreenContext) {
            classifier = window.ScreenContext.classify(frame, realm);
        } else if (typeof global !== 'undefined' && global.ScreenContext) {
            classifier = global.ScreenContext.classify(frame, realm);
        } else {
            return false;
        }

        if (!classifier) return false;

        const isEscape = (key === 'Escape' || key === 'escape');

        if (pending && pending.step === 'chooser') {
            if (isEscape) {
                pending = null;
                renderActionChooser(null, classifier, realm);
                return true; // handled client side
            }

            // Find if key matches a verb
            const verbsForRealm = VERBS[realm];
            if (verbsForRealm) {
                const verbEntry = verbsForRealm[key];
                if (verbEntry) {
                    chooseVerb(key);
                    return true;
                }
            }
            
            // Allow changing item while chooser is open
            if (key.length === 1 && /[a-z]/i.test(key)) {
                const row = classifier.items.find(i => i.key === key);
                if (row) {
                    pending.item = row;
                    renderActionChooser(pending, classifier, realm);
                    return true;
                }
            }
        }

        // Catch mode item-list + command (Sil-Q / Hengband)
        if (classifier.mode === 'item-list' && classifier.promptKind === 'command') {
            if (isEscape) {
                pending = null;
                return false; // let it pass through to engine to close menu
            }

            if (key.length === 1 && /[a-z]/.test(key)) {
                const row = classifier.items.find(i => i.key === key);
                if (row) {
                    pending = {
                        item: row,
                        listKind: classifier.listKind,
                        step: 'chooser',
                        verb: null,
                        deadline: 0
                    };
                    renderActionChooser(pending, classifier, realm);
                    return true; // intercepted
                }
            }
            return false; // Let 'w' and uppercase pass through to engine natively
        }

        return false;
    }

    function onFrame(frame, realm) {
        if (!frame || !realm) return;
        
        let classifier = null;
        if (typeof window !== 'undefined' && window.ScreenContext) {
            classifier = window.ScreenContext.classify(frame, realm);
        } else if (typeof global !== 'undefined' && global.ScreenContext) {
            classifier = global.ScreenContext.classify(frame, realm);
        }

        if (pending && pending.step === 'await-prompt') {
            const now = Date.now();
            if (now > pending.deadline) {
                pending = null;
                return;
            }

            if (classifier && classifier.promptKind === 'select') {
                const normTarget = normalizeLabel(pending.item.label);
                const match = classifier.items.find(i => normalizeLabel(i.label) === normTarget);
                if (match) {
                    getSendKey()(match.key);
                } else {
                    getSendKey()('Escape');
                    getToast()("Can't " + pending.verb + " that item.");
                }
                pending = null;
                return;
            }

            if (frame.more || (frame.ui && !frame.ui.overlay && frame.ui.awaiting_command)) {
                pending = null; // engine handled it
            }
        }

        // Render any UI that needs to show based on the classifier outside of the 'pending' state
        if (typeof document !== 'undefined' && classifier) {
            if (!pending || pending.step !== 'chooser') {
                renderActionChooser(null, classifier, realm);
            }
        }
    }

    function chooseVerb(verb) {
        if (!pending || !pending.item) return;
        
        pending.verb = verb;
        pending.step = 'await-prompt';
        pending.deadline = Date.now() + 1500;
        
        // Hide chooser
        if (typeof document !== 'undefined') {
            renderActionChooser(null, null, 'angband');
        }

        // Send verb
        getSendKey()(verb);
    }

    function renderActionChooser(pendingState, classifier, realm) {
        if (typeof document === 'undefined') return;
        const container = document.getElementById('term-contextual-actions');
        if (!container) return;

        if (pendingState && pendingState.step === 'chooser') {
            const verbs = VERBS[realm] || {};
            let html = `<div class="term-chooser-header">🎒 ${pendingState.item.key}) ${pendingState.item.label} — choose action</div>`;
            html += `<div class="term-chooser-buttons">`;
            
            for (const [v, data] of Object.entries(verbs)) {
                if (data.listOnly && data.listOnly !== pendingState.listKind) continue;
                // Add suggested logic later
                html += `<button type="button" class="term-ctx-btn" data-verb="${v}" title="${data.label} [${v}]">[${v}] ${data.icon} ${data.label}</button>`;
            }
            html += `<button type="button" class="term-ctx-btn" data-verb="Escape" title="Back [Esc]">[Esc] ⎋ Back</button>`;
            html += `</div>`;
            container.innerHTML = html;
            container.style.display = 'block';
            return;
        }

        if (classifier && classifier.mode === 'press-any-key') {
            container.innerHTML = `
                <div class="term-chooser-buttons">
                    <button type="button" class="term-ctx-btn is-suggested" data-verb=" " title="Continue [Space]">[␣] Continue</button>
                    <button type="button" class="term-ctx-btn" data-verb="Escape" title="Close [Esc]">[Esc] Close</button>
                </div>
            `;
            container.style.display = 'block';
            return;
        }

        if (classifier && classifier.mode === 'item-actions') {
            container.innerHTML = `<div class="term-chooser-header">⚔ CHOOSE ACTION FOR ITEM</div>
                <div class="term-chooser-buttons">
                    <button type="button" class="term-ctx-btn is-suggested" data-verb="Enter" title="Select [Enter]">[⏎] Select</button>
                    <button type="button" class="term-ctx-btn" data-verb="Escape" title="Back [Esc]">[Esc] Back</button>
                </div>
            `;
            container.style.display = 'block';
            return;
        }

        container.style.display = 'none';
        container.innerHTML = '';
    }

    // Attach click handler via delegation if document exists
    if (typeof document !== 'undefined') {
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('.term-ctx-btn');
            if (btn && btn.dataset.verb) {
                if (btn.dataset.verb === 'Escape' || btn.dataset.verb === ' ' || btn.dataset.verb === 'Enter') {
                    if (pending && pending.step === 'chooser' && btn.dataset.verb === 'Escape') {
                        pending = null;
                        renderActionChooser(null, null, 'angband');
                    } else {
                        getSendKey()(btn.dataset.verb);
                    }
                } else {
                    chooseVerb(btn.dataset.verb);
                }
            }
        });
    }

    exports.route = route;
    exports.onFrame = onFrame;
    exports.chooseVerb = chooseVerb;
    Object.defineProperty(exports, 'pending', {
        get: () => pending,
        set: (v) => { pending = v; }
    });
}));

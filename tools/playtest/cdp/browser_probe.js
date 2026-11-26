'use strict';

/**
 * Injected read-only browser telemetry collector via CDP Page.addScriptToEvaluateOnNewDocument.
 * Zero edits to server/public/ required; preserves LOC & version sync gates.
 */
const BROWSER_PROBE_SCRIPT = `(function () {
    'use strict';
    if (window.__PLAYTEST_PROBE__) return;

    const state = {
        errors: [],
        consoleErrors: [],
        webglErrors: [],
        webglContextLost: false,
        networkFailures: [],
        wasmFallbackEvents: [],
        domMutations: { hud: 0, footerBadges: 0, charDrawer: 0, promptMirror: 0 },
        audioStats: {
            contextsCreated: 0,
            pannersCreated: 0,
            hrtfPanners: 0,
            bufferSourcesStarted: 0,
            lastTurnSources: 0
        },
        observersAttached: false,
        canvasTracked: false
    };

    window.__PLAYTEST_PROBE__ = state;

    window.addEventListener('error', (ev) => {
        state.errors.push({
            type: 'error',
            message: String(ev.message || 'Unknown error'),
            filename: ev.filename || '',
            lineno: ev.lineno || 0
        });
    });

    window.addEventListener('unhandledrejection', (ev) => {
        const reason = ev.reason;
        state.errors.push({
            type: 'unhandledrejection',
            message: reason && reason.message ? String(reason.message) : String(reason)
        });
    });

    const origConsoleError = console.error.bind(console);
    console.error = function (...args) {
        const msg = args.map((a) => (a && a.message ? a.message : String(a))).join(' ');
        state.consoleErrors.push(msg.slice(0, 300));
        if (/WebGL|GL_INVALID|SHADER|THREE\.WebGLProgram/i.test(msg)) {
            state.webglErrors.push(msg.slice(0, 300));
        }
        if (/wasm_fallback|Falling back to Cloud/i.test(msg)) {
            state.wasmFallbackEvents.push(msg.slice(0, 200));
        }
        return origConsoleError(...args);
    };

    const origConsoleWarn = console.warn.bind(console);
    console.warn = function (...args) {
        const msg = args.map((a) => (a && a.message ? a.message : String(a))).join(' ');
        if (/THREE\.WebGLProgram|Shader Error|GL_INVALID/i.test(msg)) {
            state.webglErrors.push(msg.slice(0, 300));
        }
        if (/wasm_fallback|Local WASM.*fallback|Falling back to Cloud/i.test(msg)) {
            state.wasmFallbackEvents.push(msg.slice(0, 200));
        }
        return origConsoleWarn(...args);
    };

    // Instrument AudioContext for HRTF & L49 SFX verification
    const OrigAC = window.AudioContext || window.webkitAudioContext;
    if (OrigAC) {
        const wrapAudioProto = (AC) => {
            if (!AC || !AC.prototype || AC.prototype.__ptWrapped) return;
            AC.prototype.__ptWrapped = true;
            const origPanner = AC.prototype.createPanner;
            if (typeof origPanner === 'function') {
                AC.prototype.createPanner = function (...args) {
                    const node = origPanner.apply(this, args);
                    state.audioStats.pannersCreated++;
                    try {
                        const origDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'panningModel');
                        if (node.panningModel === 'HRTF') state.audioStats.hrtfPanners++;
                    } catch (_) {}
                    return node;
                };
            }
            const origCreateBufSrc = AC.prototype.createBufferSource;
            if (typeof origCreateBufSrc === 'function') {
                AC.prototype.createBufferSource = function (...args) {
                    const src = origCreateBufSrc.apply(this, args);
                    const origStart = src.start;
                    src.start = function (...sArgs) {
                        state.audioStats.bufferSourcesStarted++;
                        return origStart.apply(this, sArgs);
                    };
                    return src;
                };
            }
        };
        wrapAudioProto(OrigAC);
    }

    function attachDomObservers() {
        if (state.observersAttached) return;
        const bindObs = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return false;
            const obs = new MutationObserver((muts) => {
                state.domMutations[key] += muts.length;
            });
            obs.observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
            return true;
        };
        const a = bindObs('hud-overlay', 'hud');
        const b = bindObs('footer-badges', 'footerBadges');
        const c = bindObs('char-extended-drawer', 'charDrawer');
        const d = bindObs('prompt-mirror', 'promptMirror');
        if (a || b || c || d) state.observersAttached = true;

        const canvas = document.getElementById('viewport-canvas');
        if (canvas && !state.canvasTracked) {
            state.canvasTracked = true;
            canvas.addEventListener('webglcontextlost', () => {
                state.webglContextLost = true;
            }, false);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        attachDomObservers();
        setTimeout(attachDomObservers, 500);
        setTimeout(attachDomObservers, 1500);
    });

    window.__PLAYTEST_RESET_MUTATIONS__ = function () {
        state.domMutations.hud = 0;
        state.domMutations.footerBadges = 0;
        state.domMutations.charDrawer = 0;
        state.domMutations.promptMirror = 0;
        state.audioStats.lastTurnSources = state.audioStats.bufferSourcesStarted;
    };

    window.__PLAYTEST_WAIT_FRAME__ = function (prevSeq, timeoutMs = 8000) {
        return new Promise((resolve) => {
            const deadline = performance.now() + timeoutMs;
            function poll() {
                const app = window.__app;
                const f = (app && app.lastFrame) || window.__lastFrame;
                const seq = f && typeof f.seq === 'number' ? f.seq : 0;
                if (seq > prevSeq) {
                    requestAnimationFrame(() => requestAnimationFrame(() => resolve({ advanced: true, seq })));
                    return;
                }
                if (performance.now() >= deadline) {
                    resolve({ advanced: false, seq });
                    return;
                }
                setTimeout(poll, 25);
            }
            poll();
        });
    };

    window.__PLAYTEST_SNAPSHOT__ = function () {
        attachDomObservers();
        const app = window.__app || null;
        const f = (app && app.lastFrame) || window.__lastFrame || null;
        const d3d = (app && app.dungeon) || null;
        const canvas = document.getElementById('viewport-canvas');
        const term = document.getElementById('terminal-container');
        const hud = document.getElementById('hud-overlay');
        const deathModal = document.getElementById('death-modal');
        const loading = document.getElementById('loading-overlay');
        const queueModal = document.getElementById('queue-modal');
        const itemSheet = document.getElementById('item-sheet');
        const cmdPalette = document.getElementById('command-palette-modal');
        const promptMirror = document.getElementById('prompt-mirror');
        const wasdBtn = document.getElementById('btn-wasd-toggle');

        const isVisible = (el) => {
            if (!el) return false;
            if (el.tagName === 'DIALOG' && el.hasAttribute('open')) return true;
            if (el.hidden || el.classList.contains('hidden')) return false;
            const cs = window.getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.01;
        };

        let glRenderer = null;
        let rendererInfo = null;
        let hasNaNTransform = false;
        if (d3d && d3d.renderer) {
            try {
                const gl = d3d.renderer.getContext();
                const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
                glRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : null);
            } catch (_) {}
            if (d3d.renderer.info) {
                rendererInfo = {
                    geometries: d3d.renderer.info.memory ? d3d.renderer.info.memory.geometries : 0,
                    textures: d3d.renderer.info.memory ? d3d.renderer.info.memory.textures : 0,
                    programs: Array.isArray(d3d.renderer.info.programs) ? d3d.renderer.info.programs.length : 0,
                    calls: d3d.renderer.info.render ? d3d.renderer.info.render.calls : 0,
                    triangles: d3d.renderer.info.render ? d3d.renderer.info.render.triangles : 0
                };
            }
            if (d3d.camera && d3d.camera.position) {
                const cp = d3d.camera.position;
                if (!Number.isFinite(cp.x) || !Number.isFinite(cp.y) || !Number.isFinite(cp.z)) {
                    hasNaNTransform = true;
                }
            }
        }

        // Chronicle snapshot
        const cm = window.chronicleManager || null;
        const chronicleEl = document.getElementById('chronicle-entries') || document.getElementById('chronicle-window');
        const chronicleEntries = cm && Array.isArray(cm.entries) ? cm.entries.slice(-5).map((e) => ({
            type: e.type || e.eventType || '',
            text: e.prose || e.text || ''
        })) : [];

        const isInsideScrollableViewport = (el) => {
            let p = el.parentElement;
            while (p && p !== document.body) {
                const pcs = window.getComputedStyle(p);
                if (pcs.overflowY === 'auto' || pcs.overflowY === 'scroll') {
                    const pr = p.getBoundingClientRect();
                    return pr.height > 0 && pr.left >= -2 && pr.right <= window.innerWidth + 2 && pr.top >= -2 && pr.bottom <= window.innerHeight + 2;
                }
                p = p.parentElement;
            }
            return false;
        };

        // Layout & A11y audit
        const overflowX = document.documentElement.scrollWidth > window.innerWidth + 3;
        const offscreenControls = [];
        const missingAria = [];
        const buttons = document.querySelectorAll('button');
        for (const b of buttons) {
            if (!isVisible(b)) continue;
            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (!isInsideScrollableViewport(b) && (r.right < -2 || r.left > window.innerWidth + 2 || r.bottom < -2 || r.top > window.innerHeight + 2)) {
                offscreenControls.push(b.id || b.className || 'button');
            }
            const label = (b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('title') || '';
            if (!label) missingAria.push(b.id || b.className || 'button');
        }

        const hudText = hud ? (hud.innerText || '') : '';
        const chronicleText = chronicleEl ? (chronicleEl.innerText || '') : '';

        // Viewmodel telemetry (detect offhand torch/lantern regression & double-gauntlet regressions)
        let viewmodel = null;
        let creatures = [];
        let lighting = null;
        if (d3d) {
            let rightMeshCount = 0;
            if (d3d.rightItemSlot) {
                d3d.rightItemSlot.traverse((c) => {
                    if (c.userData && c.userData._isHumanGauntlet) rightMeshCount++;
                });
            }
            viewmodel = {
                leftVisible: Boolean(d3d.leftHandGroup && d3d.leftHandGroup.visible),
                currentLeftWeapon: d3d.currentLeftWeapon || null,
                rightVisible: Boolean(d3d.rightHandGroup && d3d.rightHandGroup.visible),
                currentRightWeapon: d3d.currentRightWeapon || null,
                rightGauntletGroups: rightMeshCount
            };

            const T = window.THREE;
            if (T && d3d.monsters && typeof d3d.monsters.values === 'function') {
                const box = new T.Box3();
                const sz = new T.Vector3();
                const q = new T.Quaternion();
                const up = new T.Vector3(0, 1, 0);
                for (const ent of d3d.monsters.values()) {
                    if (!ent || !ent.creatureMesh || ent.isBillboard) continue;
                    const tk = String((ent.config && ent.config.templateKey) || ent.templateKey || '');
                    const isHumanoid = tk.startsWith('char_');
                    let hipsTiltRad = 0;
                    let hipsName = null;
                    let sx = 0, sy = 0, szLen = 0, minY = 0;
                    try {
                        ent.updateMatrixWorld(true);
                        box.setFromObject(ent.creatureMesh);
                        box.getSize(sz);
                        sx = Math.round(sz.x * 100) / 100;
                        sy = Math.round(sz.y * 100) / 100;
                        szLen = Math.round(sz.z * 100) / 100;
                        minY = Math.round((box.min.y - (ent.position ? ent.position.y : 0)) * 100) / 100;
                        if (isHumanoid) {
                            ent.creatureMesh.traverse((n) => {
                                if (hipsName) return;
                                if (n.isBone && /(?:^|[:|./])Hips$/i.test(n.name || '')) {
                                    n.getWorldQuaternion(q);
                                    const boneUp = up.clone().applyQuaternion(q);
                                    const dot = Math.max(-1, Math.min(1, boneUp.y));
                                    hipsTiltRad = Math.round(Math.acos(dot) * 100) / 100;
                                    hipsName = n.name;
                                }
                            });
                        }
                    } catch (_) {}
                    creatures.push({
                        key: tk,
                        race: (ent.monsterData && (ent.monsterData.race || ent.monsterData.name)) || '',
                        isHumanoid,
                        hipsTiltRad,
                        sx,
                        sy,
                        sz: szLen,
                        minY
                    });
                    if (creatures.length >= 24) break;
                }
            }

            const lumOf = (c) => c ? Math.round((0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * 1000) / 1000 : null;
            const ambientLum = (d3d.ambientLight && d3d.ambientLight.color) ? lumOf(d3d.ambientLight.color) : null;
            const hemiLum = (d3d.hemiLight && d3d.hemiLight.color) ? lumOf(d3d.hemiLight.color) : null;
            lighting = {
                colorMgmtEnabled: Boolean(window.THREE && window.THREE.ColorManagement && window.THREE.ColorManagement.enabled),
                ambientLum,
                ambientIntensity: d3d.ambientLight ? Math.round(d3d.ambientLight.intensity * 100) / 100 : null,
                hemiLum,
                hemiIntensity: d3d.hemiLight ? Math.round(d3d.hemiLight.intensity * 100) / 100 : null
            };
        }

        // HUD panel overflow & navbar/compass overlap geometry
        let hudLayout = null;
        {
            const charPanel = document.getElementById('char-panel');
            const statsStrip = document.getElementById('stats-strip');
            const compassTape = document.getElementById('yasd-compass-tape');
            const topbar = document.getElementById('hud-top-bar') || document.querySelector('.hud-top-bar, header, nav');
            const rectOf = (el) => {
                if (!el || !isVisible(el)) return null;
                const r = el.getBoundingClientRect();
                return (r.width > 0 && r.height > 0) ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null;
            };
            const cr = rectOf(compassTape);
            const tr = rectOf(topbar);
            const overlaps = Boolean(cr && tr && !(cr.right <= tr.x || tr.right <= cr.x || cr.bottom <= tr.y || tr.bottom <= cr.y));
            hudLayout = {
                charPanelOverflowX: (charPanel && isVisible(charPanel)) ? Math.max(0, charPanel.scrollWidth - charPanel.clientWidth) : 0,
                statsStripOverflowX: (statsStrip && isVisible(statsStrip)) ? Math.max(0, statsStrip.scrollWidth - statsStrip.clientWidth) : 0,
                compassRect: cr,
                topbarRect: tr,
                compassOverlapsTopbar: overlaps
            };
        }

        return {
            ts: Date.now(),
            flags: window.YASD_FLAGS || null,
            threeV2: Boolean(window.THREE && window.THREE.IS_THREE_V2),
            engineMode: app && app.getEngineMode ? app.getEngineMode() : null,
            activeRealm: app && app.getActiveRealm ? app.getActiveRealm() : null,
            langMode: app && app.getLanguageMode ? app.getLanguageMode() : (window.__langMode || null),
            inPlay: Boolean(app && app.inPlay),
            isBirthReview: Boolean(app && app.isBirthReviewActive && app.isBirthReviewActive()),
            frame: f ? {
                seq: f.seq,
                phase: f.phase,
                ui: f.ui || null,
                player: f.player ? {
                    name: f.player.name,
                    race: f.player.race,
                    class: f.player.class,
                    depth: f.player.depth,
                    level: f.player.level,
                    hp: f.player.hp,
                    hp_max: f.player.hp_max,
                    x: f.player.x,
                    y: f.player.y,
                    dead: Boolean(f.player.dead),
                    gold: f.player.gold
                } : null,
                needsTerminal: window.ScreenContext ? window.ScreenContext.needsTerminal(f, { mirror3d: true, forceTerminal: app && app.isForceTerminal && app.isForceTerminal() }) : null
            } : null,
            dom: {
                canvasRect: canvas ? { w: canvas.width, h: canvas.height, vis: isVisible(canvas) } : null,
                termVisible: isVisible(term),
                bodyTermMode: document.body.classList.contains('terminal-mode-active'),
                hudVisible: isVisible(hud),
                deathModalVisible: isVisible(deathModal),
                loadingVisible: isVisible(loading),
                queueModalVisible: isVisible(queueModal),
                itemSheetOpen: isVisible(itemSheet),
                cmdPaletteOpen: isVisible(cmdPalette),
                promptMirrorVisible: isVisible(promptMirror),
                wasdPressed: wasdBtn ? wasdBtn.getAttribute('aria-pressed') === 'true' : false,
                overflowX,
                offscreenControls: offscreenControls.slice(0, 10),
                missingAria: missingAria.slice(0, 10),
                hudTextSample: hudText.slice(0, 1200)
            },
            viewmodel,
            creatures,
            lighting,
            hudLayout,
            webgl: {
                glRenderer,
                gpuTier: d3d && d3d.renderBudget ? d3d.renderBudget.gpuTier : null,
                postFx: d3d && d3d._postFx ? { enabled: Boolean(d3d._postFx.enabled), tier: d3d._postFx.tier, hasBloom: Boolean(d3d._postFx.bloomPass), hasGtao: Boolean(d3d._postFx.gtaoPass) } : null,
                liquidUpgraded: Boolean(d3d && d3d._liquidShadersUpgraded),
                rendererInfo,
                hasNaNTransform,
                contextLost: state.webglContextLost
            },
            memory: performance && performance.memory ? {
                usedJSHeapMB: Math.round((performance.memory.usedJSHeapSize / 1048576) * 10) / 10
            } : null,
            chronicle: {
                loaded: Boolean(cm),
                entryCount: cm && Array.isArray(cm.entries) ? cm.entries.length : 0,
                tradition: cm ? cm.tradition : null,
                recentEntries: chronicleEntries,
                domTextSample: chronicleText.slice(0, 1200)
            },
            probe: {
                errors: state.errors.slice(),
                consoleErrors: state.consoleErrors.slice(),
                webglErrors: state.webglErrors.slice(),
                networkFailures: state.networkFailures.slice(),
                wasmFallbackEvents: state.wasmFallbackEvents.slice(),
                domMutations: { ...state.domMutations },
                audioStats: {
                    ...state.audioStats,
                    deltaSources: state.audioStats.bufferSourcesStarted - state.audioStats.lastTurnSources
                },
                audioCtxState: app && app.audio && app.audio.ctx ? app.audio.ctx.state : null
            }
        };
    };
})();`;

module.exports = {
    BROWSER_PROBE_SCRIPT
};

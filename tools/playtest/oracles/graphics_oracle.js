'use strict';

class GraphicsOracle {
    constructor({ realm, expectV2 = true, allowSoftwareGl = false }) {
        this.realm = realm;
        this.expectV2 = expectV2;
        this.allowSoftwareGl = allowSoftwareGl;
        this.baselineMem = null;
        this.lastCanvasHash = null;
        this.sameCanvasInPlayTurns = 0;
        this.depthChanges = 0;
        this.lastDepth = null;
        this.checkedRendererOnce = false;
    }

    auditSnapshot(snap, { movedIn3d = false, pngSample = null } = {}) {
        const issues = [];
        const add = (severity, code, message, extra = null) => {
            issues.push({ severity, realm: this.realm, subsystem: 'graphics', code, message, extra });
        };

        if (!snap || !snap.webgl) return issues;

        if (snap.webgl.contextLost) {
            add('P0', 'P0_WEBGL_CONTEXT_LOST', 'WebGL context lost during play');
        }
        if (snap.webgl.hasNaNTransform) {
            add('P0', 'P0_CAMERA_NAN_TRANSFORM', 'Camera position contains NaN/Infinity');
        }
        for (const err of (snap.probe?.webglErrors || [])) {
            add('P0', 'P0_WEBGL_SHADER_ERROR', `WebGL/Shader error: ${err}`);
        }
        for (const ce of (snap.probe?.consoleErrors || [])) {
            if (/is not a function|TypeError:|ReferenceError:/i.test(ce)) {
                add('P0', 'P0_CONSOLE_RUNTIME_ERROR', `Console runtime error: ${ce}`);
            }
        }
        if (snap.inPlay && snap.viewmodel && snap.viewmodel.leftVisible) {
            const lw = String(snap.viewmodel.currentLeftWeapon || '');
            if (/^light:|torch|lantern/i.test(lw)) {
                add('P0', 'P0_FORBIDDEN_OFFHAND_TORCH', `Off-hand light source rendered in left hand viewmodel: "${lw}"`);
            }
        }
        if (snap.inPlay && Array.isArray(snap.creatures)) {
            for (const cr of snap.creatures) {
                if (!cr || !cr.isHumanoid) continue;
                const flatBbox = cr.sy > 0 && cr.sy < Math.max(cr.sx || 0, cr.sz || 0) * 0.55;
                if ((cr.hipsTiltRad || 0) > 0.65 || flatBbox || (cr.minY || 0) > 0.65) {
                    add('P0', 'P0_CREATURE_ORIENTATION_CORRUPT', `Humanoid ${cr.key} (${cr.race}) corrupt orientation/grounding: hipsTilt=${cr.hipsTiltRad}rad size=[${cr.sx},${cr.sy},${cr.sz}] minY=${cr.minY}`);
                    break;
                }
            }
        }
        if (snap.inPlay && snap.frame?.player?.depth === 0 && snap.threeV2 && snap.lighting && typeof snap.lighting.ambientLum === 'number') {
            if (snap.lighting.colorMgmtEnabled && snap.lighting.ambientLum < 0.35) {
                add('P1', 'P1_LIGHTING_CRUSHED', `Three V2 ColorManagement crushed outdoor ambient luminance to ${snap.lighting.ambientLum}`);
            }
        }
        for (const net of (snap.cdpNetworkErrors || [])) {
            if (/\.(glb|gltf|ktx2|wasm|png|jpg|jpeg|webp)(\?|$)/i.test(net.url || '')) {
                add('P1', 'P1_3D_ASSET_HTTP_ERROR', `Asset load failed (${net.status}): ${net.url}`);
            }
        }

        if (!this.checkedRendererOnce && snap.inPlay && snap.webgl.glRenderer) {
            this.checkedRendererOnce = true;
            if (this.expectV2 && !snap.threeV2) {
                add('P0', 'P0_THREE_V2_NOT_ACTIVE', 'Expected Wave 4C Three.js V2 (IS_THREE_V2=true) but legacy/missing Three.js loaded');
            }
            if (!this.expectV2 && snap.flags && snap.flags.RENDERER_THREE_V2 !== false) {
                add('P1', 'P1_THREE_V1_ROLLBACK_FAILED', 'Expected RENDERER_THREE_V2=false under V1 rollback flag');
            }
            if (!this.allowSoftwareGl && snap.webgl.gpuTier === 'mobile-saver') {
                add('P1', 'P1_SWIFTSHADER_DOWNGRADE', `Software WebGL detected (${snap.webgl.glRenderer}); Wave 4C PostFX/shaders downgraded to mobile-saver`);
            }
        }

        // Non-black & non-frozen 3D canvas check using real PNG screenshot samples
        const in3dView = Boolean(snap.inPlay && snap.dom?.canvasRect?.vis && !snap.dom?.termVisible);
        if (in3dView && pngSample) {
            if (pngSample.sampleCount > 0 && pngSample.nonZeroCount === 0) {
                add('P0', 'P0_BLACK_CANVAS', '3D WebGL viewport screenshot sampled solid black/flat');
            }
            if (movedIn3d && pngSample.hash) {
                if (this.lastCanvasHash && pngSample.hash === this.lastCanvasHash) {
                    this.sameCanvasInPlayTurns++;
                    if (this.sameCanvasInPlayTurns >= 3) {
                        add('P0', 'P0_FROZEN_CANVAS', '3D viewport screenshot hash frozen across 3 movement/camera sample checkpoints');
                    }
                } else {
                    this.sameCanvasInPlayTurns = 0;
                }
            }
            this.lastCanvasHash = pngSample.hash;
        }

        // Verify 3D world actually drew triangles when in 3D view
        if (in3dView && snap.webgl.rendererInfo && snap.webgl.rendererInfo.triangles === 0 && snap.webgl.rendererInfo.calls === 0) {
            add('P0', 'P0_EMPTY_3D_RENDER', 'WebGL renderer reported 0 draw calls and 0 triangles in active 3D view');
        }

        // GPU memory leak tracking across depth transitions
        const depth = snap.frame?.player?.depth;
        if (typeof depth === 'number') {
            if (this.lastDepth !== null && depth !== this.lastDepth) {
                this.depthChanges++;
            }
            this.lastDepth = depth;
        }

        const mem = snap.webgl.rendererInfo;
        if (snap.inPlay && mem) {
            if (!this.baselineMem && (mem.geometries > 0 || mem.textures > 0)) {
                this.baselineMem = { geometries: Math.max(20, mem.geometries), textures: Math.max(20, mem.textures) };
            } else if (this.baselineMem && this.depthChanges >= 3) {
                if (mem.geometries > this.baselineMem.geometries * 1.35 + 25) {
                    add('P2', 'P2_GPU_GEOMETRY_LEAK', `Renderer geometries grew from baseline ${this.baselineMem.geometries} to ${mem.geometries} across ${this.depthChanges} floor transitions`);
                }
                if (mem.textures > this.baselineMem.textures * 1.35 + 25) {
                    add('P2', 'P2_GPU_TEXTURE_LEAK', `Renderer textures grew from baseline ${this.baselineMem.textures} to ${mem.textures} across ${this.depthChanges} floor transitions`);
                }
            }
        }

        return issues;
    }
}

module.exports = {
    GraphicsOracle
};

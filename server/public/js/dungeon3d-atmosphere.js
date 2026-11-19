/**
 * dungeon3d-atmosphere.js — Subterranean Atmosphere, GPU Ambient Particles,
 * Instanced Sconce Glow Halos, Staircase Fade & Combat Edge Vignette.
 *
 * Strictly zero EffectComposer / zero backdrop-filter / 1-draw-call GPU shaders.
 * Contract: Pure UMD module, 100% IP-clean (IP-CLEAN-01).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Dungeon3DAtmosphere = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const REALM_SLATE_FOG = Object.freeze({
        angband: 0x1a2232,
        silq: 0x162230,
        frogcomposband: 0x22172e,
        hengband: 0x26181c,
        nethack: 0x162420,
        dcss: 0x221e18,
        brogue: 0x261a14,
        rogue: 0x1a1c24,
        ryod: 0x20182d
    });

    function prefersReducedMotion() {
        try {
            return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (_) {
            return false;
        }
    }

    function applySubterraneanAtmosphere(d3d, biome, depth, outdoors) {
        if (!d3d || !d3d.scene || typeof THREE === 'undefined') return;
        const realm = String(d3d.realm || 'angband').toLowerCase();
        if (outdoors) {
            const skyColor = (biome && biome.bgColor !== undefined) ? biome.bgColor : 0x121b2d;
            const fogColor = (biome && biome.fogColor !== undefined) ? biome.fogColor : 0x121b2d;
            const density = (biome && biome.fogDensity) ? biome.fogDensity : 0.012;
            if (d3d.scene.background) d3d.scene.background.setHex(skyColor);
            if (!(d3d.scene.fog instanceof THREE.FogExp2)) {
                d3d.scene.fog = new THREE.FogExp2(fogColor, density);
            } else {
                d3d.scene.fog.color.setHex(fogColor);
                d3d.scene.fog.density = density;
            }
            if (d3d.hemiLight) {
                d3d.hemiLight.color.setHex(0x687da6);
                d3d.hemiLight.groundColor.setHex(0x221914);
                d3d.hemiLight.intensity = 0.32;
            }
            return;
        }

        const baseSlate = REALM_SLATE_FOG[realm] || 0x0c101a;
        const fogCol = new THREE.Color(baseSlate);
        if (biome && biome.fogColor !== undefined && biome.fogColor !== 0x000000) {
            fogCol.lerp(new THREE.Color(biome.fogColor), 0.30);
        }
        const rawDensity = (biome && biome.fogDensity) ? biome.fogDensity : 0.012;
        const dungeonDensity = Math.min(0.036, Math.max(0.021, rawDensity * 1.85));

        if (d3d.scene.background) d3d.scene.background.copy(fogCol);
        if (!(d3d.scene.fog instanceof THREE.FogExp2)) {
            d3d.scene.fog = new THREE.FogExp2(fogCol.getHex(), dungeonDensity);
        } else {
            d3d.scene.fog.color.copy(fogCol);
            d3d.scene.fog.density = dungeonDensity;
        }
        if (d3d.hemiLight) {
            d3d.hemiLight.color.setHex(0x526486);
            d3d.hemiLight.groundColor.setHex(0x221914);
            d3d.hemiLight.intensity = 0.36;
        }
        if (typeof window !== 'undefined' && window.AudioAmbience && typeof window.AudioAmbience.sync === 'function') {
            window.AudioAmbience.sync(d3d.audio, realm, outdoors ? 0 : depth);
        }
    }

    function ensureAmbientParticles(d3d) {
        if (!d3d || !d3d.scene || typeof THREE === 'undefined') return null;
        if (d3d._ambientParticles) return d3d._ambientParticles;

        const isPhone = d3d.renderBudget && (d3d.renderBudget.tier === 'phone' || d3d.renderBudget.gpuTier === 'mobile-saver');
        const count = isPhone ? 100 : 220;
        const boxSize = 18.0;

        const seeds = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            seeds[i * 3] = Math.random() * boxSize;
            seeds[i * 3 + 1] = Math.random() * 6.0;
            seeds[i * 3 + 2] = Math.random() * boxSize;
            phases[i] = Math.random() * 6.283185;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
        geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uBoxSize: { value: boxSize },
                uColor: { value: new THREE.Color(0xc8d2e6) },
                uSize: { value: isPhone ? 22.0 : 28.0 },
                uOpacity: { value: 0.32 },
                uDriftSpeed: { value: 0.14 }
            },
            vertexShader: [
                'attribute float aPhase;',
                'uniform float uTime;',
                'uniform vec3 uCameraPos;',
                'uniform float uBoxSize;',
                'uniform float uSize;',
                'uniform float uDriftSpeed;',
                'varying float vAlpha;',
                'void main() {',
                '  float halfB = uBoxSize * 0.5;',
                '  vec3 drift = vec3(',
                '    sin(uTime * 0.45 + aPhase) * 0.45,',
                '    uTime * uDriftSpeed + cos(uTime * 0.3 + aPhase) * 0.25,',
                '    cos(uTime * 0.41 + aPhase * 1.3) * 0.45',
                '  );',
                '  vec3 p = position + drift;',
                '  p.x = mod(p.x - uCameraPos.x + halfB, uBoxSize) - halfB + uCameraPos.x;',
                '  p.z = mod(p.z - uCameraPos.z + halfB, uBoxSize) - halfB + uCameraPos.z;',
                '  p.y = mod(p.y, 4.4) - 0.15;',
                '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
                '  float dist = max(1.0, -mv.z);',
                '  vAlpha = clamp((1.0 - smoothstep(2.0, halfB, length(p.xz - uCameraPos.xz))) * smoothstep(0.6, 1.4, dist), 0.0, 1.0);',
                '  gl_PointSize = clamp(uSize / dist, 1.5, 6.5);',
                '  gl_Position = projectionMatrix * mv;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 uColor;',
                'uniform float uOpacity;',
                'varying float vAlpha;',
                'void main() {',
                '  float d = length(gl_PointCoord - vec2(0.5));',
                '  float a = smoothstep(0.5, 0.05, d) * uOpacity * vAlpha;',
                '  if (a < 0.01) discard;',
                '  gl_FragColor = vec4(uColor, a);',
                '}'
            ].join('\n'),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geo, mat);
        points.name = 'DungeonAmbientParticles';
        points.frustumCulled = false;
        d3d.scene.add(points);
        d3d._ambientParticles = { points, geo, mat };
        return d3d._ambientParticles;
    }

    function ensureSconceHaloMesh(d3d) {
        if (!d3d || !d3d.scene || typeof THREE === 'undefined') return null;
        if (d3d._sconceHaloSystem) return d3d._sconceHaloSystem;

        const maxHalos = 64;
        const geo = new THREE.PlaneGeometry(0.95, 0.95);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0xff9b3d) },
                uTime: { value: 0 },
                uOpacity: { value: 0.36 }
            },
            vertexShader: [
                'uniform float uTime;',
                'varying vec2 vUv;',
                'varying float vSeed;',
                'void main() {',
                '  vUv = uv;',
                '  #ifdef USE_INSTANCING',
                '    vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
                '    vSeed = fract(sin(dot(worldOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453);',
                '    vec4 mvPos = modelViewMatrix * worldOrigin;',
                '  #else',
                '    vSeed = 0.5;',
                '    vec4 mvPos = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
                '  #endif',
                '  float pulse = 0.92 + 0.08 * sin(uTime * 5.2 + vSeed * 19.0);',
                '  mvPos.xy += position.xy * pulse;',
                '  gl_Position = projectionMatrix * mvPos;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform vec3 uColor;',
                'uniform float uOpacity;',
                'varying vec2 vUv;',
                'void main() {',
                '  float d = length(vUv - vec2(0.5)) * 2.0;',
                '  float core = exp(-d * d * 4.2);',
                '  float rim = smoothstep(1.0, 0.0, d) * 0.35;',
                '  float alpha = (core * 0.78 + rim) * uOpacity * smoothstep(1.0, 0.55, d);',
                '  if (alpha < 0.008) discard;',
                '  vec3 tint = mix(uColor, vec3(1.0, 0.92, 0.72), core * 0.55);',
                '  gl_FragColor = vec4(tint, alpha);',
                '}'
            ].join('\n'),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const mesh = new THREE.InstancedMesh(geo, mat, maxHalos);
        mesh.name = 'WallSconceGlowHalos';
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        d3d.scene.add(mesh);
        d3d._sconceHaloSystem = { mesh, geo, mat, maxHalos, matrix: new THREE.Matrix4() };
        return d3d._sconceHaloSystem;
    }

    function syncSconceHalos(d3d, sconces, outdoors) {
        if (outdoors || !Array.isArray(sconces) || sconces.length === 0) {
            if (d3d._sconceHaloSystem) {
                d3d._sconceHaloSystem.mesh.count = 0;
                d3d._sconceHaloSystem.mesh.visible = false;
            }
            return;
        }
        const sys = ensureSconceHaloMesh(d3d);
        if (!sys) return;
        sys.mesh.visible = true;
        const limit = Math.min(sys.maxHalos, sconces.length);
        for (let i = 0; i < limit; i++) {
            const s = sconces[i];
            sys.matrix.makeTranslation(s.x, 1.98, s.z);
            sys.mesh.setMatrixAt(i, sys.matrix);
        }
        sys.mesh.count = limit;
        sys.mesh.instanceMatrix.needsUpdate = true;
    }

    function updateAtmosphere(d3d, timeSec) {
        if (!d3d || !d3d.camera) return;
        const depth = Number(d3d.lastDepth || 0);
        if (depth <= 0) {
            if (d3d._ambientParticles && d3d._ambientParticles.points) {
                d3d._ambientParticles.points.visible = false;
            }
        } else {
            const sys = ensureAmbientParticles(d3d);
            if (sys && sys.points) sys.points.visible = true;
            if (sys && sys.mat && sys.mat.uniforms) {
                const u = sys.mat.uniforms;
                u.uTime.value = timeSec;
                u.uCameraPos.value.copy(d3d.camera.position);
                const realm = String(d3d.realm || 'angband').toLowerCase();
                if (depth >= 25 || realm === 'hengband' || realm === 'brogue') {
                    u.uColor.value.setHex(0xff8e42);
                    u.uOpacity.value = 0.34;
                    u.uDriftSpeed.value = 0.24;
                } else if (realm === 'nethack' || realm === 'dcss') {
                    u.uColor.value.setHex(0x7be0b4);
                    u.uOpacity.value = 0.26;
                    u.uDriftSpeed.value = 0.12;
                } else {
                    u.uColor.value.setHex(0xc8d2e6);
                    u.uOpacity.value = 0.28;
                    u.uDriftSpeed.value = 0.14;
                }
            }
        }
        if (d3d._sconceHaloSystem && d3d._sconceHaloSystem.mat && d3d._sconceHaloSystem.mat.uniforms) {
            d3d._sconceHaloSystem.mat.uniforms.uTime.value = timeSec;
        }
    }

    function ensureOverlayEl(id, cssText) {
        if (typeof document === 'undefined' || !document.body) return null;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.style.cssText = cssText;
            document.body.appendChild(el);
        }
        return el;
    }

    let _stairFadeTimer = null;
    function triggerStairFade(descending) {
        if (prefersReducedMotion()) return;
        const el = ensureOverlayEl(
            'yasd-stair-fade',
            'position:fixed;inset:0;pointer-events:none;z-index:9990;opacity:0;transition:opacity 180ms ease-out;background:' +
            (descending ? 'radial-gradient(circle at 50% 50%, rgba(8,10,16,0.72), rgba(4,6,10,0.92))' : 'radial-gradient(circle at 50% 50%, rgba(220,210,185,0.28), rgba(10,12,18,0.84))') + ';'
        );
        if (!el) return;
        clearTimeout(_stairFadeTimer);
        el.style.opacity = '0.92';
        _stairFadeTimer = setTimeout(() => {
            el.style.opacity = '0';
        }, 120);
    }

    let _vignetteTimer = null;
    function triggerEdgeVignette(kind) {
        if (prefersReducedMotion()) return;
        const palette = kind === 'levelup'
            ? 'inset 0 0 90px rgba(245, 200, 75, 0.52), inset 0 0 28px rgba(255, 232, 130, 0.36)'
            : (kind === 'crit'
                ? 'inset 0 0 110px rgba(235, 68, 52, 0.62), inset 0 0 36px rgba(255, 160, 80, 0.35)'
                : 'inset 0 0 88px rgba(196, 36, 36, 0.48)');
        const el = ensureOverlayEl(
            'yasd-edge-vignette',
            'position:fixed;inset:0;pointer-events:none;z-index:9989;opacity:0;transition:opacity 160ms ease-out;'
        );
        if (!el) return;
        clearTimeout(_vignetteTimer);
        el.style.boxShadow = palette;
        el.style.opacity = '1';
        _vignetteTimer = setTimeout(() => {
            el.style.opacity = '0';
        }, kind === 'levelup' ? 420 : 190);
    }

    function createBudgetMaterial(d3d, params) {
        if (typeof THREE === 'undefined') return null;
        const p = params || {};
        const preferLambert = Boolean(d3d && d3d.renderBudget && d3d.renderBudget.preferLambert);
        if (preferLambert && !p.requirePbr) {
            const lambertOpts = {};
            for (const k of ['name', 'color', 'map', 'emissive', 'emissiveMap', 'emissiveIntensity', 'transparent', 'opacity', 'depthWrite', 'depthTest', 'side', 'vertexColors', 'alphaTest', 'fog']) {
                if (p[k] !== undefined) lambertOpts[k] = p[k];
            }
            return new THREE.MeshLambertMaterial(lambertOpts);
        }
        return new THREE.MeshStandardMaterial(p);
    }

    function applyEntityHitFlash(entity, delta) {
        if (!entity) return;
        if (entity._hitFlashTimer > 0) {
            entity._hitFlashTimer -= delta;
            const flashAmt = Math.max(0, entity._hitFlashTimer / 0.18);
            if (!entity._cachedFlashMats) {
                entity._cachedFlashMats = [];
                entity.traverse((c) => {
                    if (!c.isMesh || !c.material) return;
                    if (!c._origPooledMat) c._origPooledMat = c.material;
                    if (Array.isArray(c._origPooledMat)) {
                        c._flashMat = c._origPooledMat.map((m) => {
                            if (m && m.emissive && !m._isInstanceFlashClone) {
                                const cloned = m.clone();
                                if (m.onBeforeCompile) cloned.onBeforeCompile = m.onBeforeCompile;
                                if (m.customProgramCacheKey) cloned.customProgramCacheKey = m.customProgramCacheKey;
                                cloned._isInstanceFlashClone = true;
                                entity._cachedFlashMats.push(cloned);
                                return cloned;
                            }
                            return m;
                        });
                    } else if (c._origPooledMat.emissive && !c._origPooledMat._isInstanceFlashClone) {
                        const origMat = c._origPooledMat;
                        const cloned = origMat.clone();
                        if (origMat.onBeforeCompile) cloned.onBeforeCompile = origMat.onBeforeCompile;
                        if (origMat.customProgramCacheKey) cloned.customProgramCacheKey = origMat.customProgramCacheKey;
                        cloned._isInstanceFlashClone = true;
                        c._flashMat = cloned;
                        entity._cachedFlashMats.push(cloned);
                    }
                });
            }
            entity.traverse((c) => {
                if (c.isMesh && c._flashMat && c.material !== c._flashMat) {
                    c.material = c._flashMat;
                }
            });
            for (let i = 0; i < entity._cachedFlashMats.length; i++) {
                const m = entity._cachedFlashMats[i];
                if (m && m.emissive) {
                    m.emissive.setRGB(flashAmt * 0.85, flashAmt * 0.08, flashAmt * 0.08);
                }
            }
        } else if (entity._hitFlashTimer !== undefined && entity._hitFlashTimer <= 0 && entity._hitFlashTimer > -1) {
            entity._hitFlashTimer = -1;
            entity.traverse((c) => {
                if (c.isMesh && c._origPooledMat && c.material !== c._origPooledMat) {
                    c.material = c._origPooledMat;
                }
            });
        }
    }

    function disposeEntityFlashMats(entity) {
        if (!entity || !Array.isArray(entity._cachedFlashMats)) return;
        for (let i = 0; i < entity._cachedFlashMats.length; i++) {
            const m = entity._cachedFlashMats[i];
            if (m && m._isInstanceFlashClone && typeof m.dispose === 'function') {
                m.dispose();
            }
        }
        entity._cachedFlashMats = null;
    }

    return {
        REALM_SLATE_FOG,
        applySubterraneanAtmosphere,
        ensureAmbientParticles,
        ensureSconceHaloMesh,
        syncSconceHalos,
        updateAtmosphere,
        triggerStairFade,
        triggerEdgeVignette,
        createBudgetMaterial,
        applyEntityHitFlash,
        disposeEntityFlashMats
    };
});

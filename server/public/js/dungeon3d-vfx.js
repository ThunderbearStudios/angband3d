/**
 * dungeon3d-vfx.js — Pooled 3D Combat Projectiles, Spell Detonations, Sparks & Floating Text VFX.
 * Extracted from dungeon3d.js (Wave 0) to enforce modular LOC budgets with zero behavioral drift.
 */
(function (root) {
    'use strict';

    function createLatheFrustumGeo(rTop = 0.5, rBottom = 0.5, height = 1.0, segs = 12, openEnded = false) {
        const halfH = height * 0.5;
        const pts = openEnded
            ? [new THREE.Vector2(Math.max(0.0001, rBottom), -halfH), new THREE.Vector2(Math.max(0.0001, rTop), halfH)]
            : [
                new THREE.Vector2(0, -halfH),
                new THREE.Vector2(Math.max(0.0001, rBottom), -halfH),
                new THREE.Vector2(Math.max(0.0001, rTop), halfH),
                new THREE.Vector2(0, halfH)
            ];
        const geo = new THREE.LatheGeometry(pts, Math.max(4, segs | 0));
        geo.computeVertexNormals();
        return geo;
    }

    const ELEMENT_PROFILES = Object.freeze({
        frost:  { element: 'frost',  color: 0x38bdf8, core: 0xe0f7ff, secondary: 0xbae6fd, flash: 0x7dd3fc, duration: 0.28 },
        cold:   { element: 'frost',  color: 0x38bdf8, core: 0xe0f7ff, secondary: 0xbae6fd, flash: 0x7dd3fc, duration: 0.28 },
        acid:   { element: 'acid',   color: 0x84cc16, core: 0xd9f99d, secondary: 0xa3e635, flash: 0xa3e635, duration: 0.30 },
        poison: { element: 'poison', color: 0x9333ea, core: 0x34d399, secondary: 0x10b981, flash: 0x34d399, duration: 0.32 },
        venom:  { element: 'poison', color: 0x9333ea, core: 0x34d399, secondary: 0x10b981, flash: 0x34d399, duration: 0.32 },
        nether: { element: 'nether', color: 0x7e22ce, core: 0xf43f5e, secondary: 0xd946ef, flash: 0xd946ef, duration: 0.29 },
        chaos:  { element: 'chaos',  color: 0xc026d3, core: 0xf472b6, secondary: 0x38bdf8, flash: 0xe879f9, duration: 0.28 },
        magic:  { element: 'chaos',  color: 0xbb55ff, core: 0xf5d0fe, secondary: 0x38bdf8, flash: 0xc084fc, duration: 0.28 },
        fire:   { element: 'fire',   color: 0xff5500, core: 0xfff7cc, secondary: 0xffcc44, flash: 0xff7722, duration: 0.28 }
    });

    function resolveElementProfile(kindOrElem, colorHex, opts) {
        const raw = (opts && opts.element) || kindOrElem || 'fire';
        const key = String(raw).toLowerCase().replace(/_bolt$/, '');
        const base = ELEMENT_PROFILES[key] || ELEMENT_PROFILES.fire;
        const primaryColor = (colorHex !== undefined && colorHex !== null) ? colorHex : base.color;
        return {
            element: base.element,
            color: primaryColor,
            core: base.core,
            secondary: base.secondary,
            flash: base.flash,
            duration: base.duration
        };
    }

    function attachVfx(Dungeon3DClass) {
        if (!Dungeon3DClass || !Dungeon3DClass.prototype) return;
        const Dungeon3DProto = Dungeon3DClass.prototype;

        Dungeon3DProto.spawnFloatingText = function spawnFloatingText(text, worldPos, colorHex = '#ffcc00', scale = 1.0) {
            this._floatingTextTexCache = this._floatingTextTexCache || new Map();
            const cacheKey = `${text}|${colorHex}`;
            let tex = this._floatingTextTexCache.get(cacheKey);
            if (tex) {
                this._floatingTextTexCache.delete(cacheKey);
                this._floatingTextTexCache.set(cacheKey, tex);
            } else {
                const canvas = document.createElement('canvas');
                canvas.width = 384;
                canvas.height = 96;
                const ctx = canvas.getContext('2d');
                ctx.font = '900 36px "Cinzel", serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
                ctx.lineWidth = 6;
                ctx.strokeText(text, 192, 48);

                ctx.fillStyle = colorHex;
                ctx.fillText(text, 192, 48);

                tex = new THREE.CanvasTexture(canvas);
                tex.minFilter = THREE.LinearFilter;
                tex._cachedFloatingTex = true;
                if (this._floatingTextTexCache.size >= 64) {
                    const oldestKey = this._floatingTextTexCache.keys().next().value;
                    const oldTex = this._floatingTextTexCache.get(oldestKey);
                    this._floatingTextTexCache.delete(oldestKey);
                    if (oldTex && typeof oldTex.dispose === 'function') {
                        oldTex._cachedFloatingTex = false;
                        oldTex.dispose();
                    }
                }
                this._floatingTextTexCache.set(cacheKey, tex);
            }

            let stackCount = 0;
            if (Array.isArray(this.floatingTexts) && worldPos) {
                for (let i = 0; i < this.floatingTexts.length; i++) {
                    const ft = this.floatingTexts[i];
                    if (ft && ft.basePos && ft.elapsed < 0.35) {
                        const dx = ft.basePos.x - worldPos.x;
                        const dz = ft.basePos.z - worldPos.z;
                        if (dx * dx + dz * dz < 0.36) stackCount++;
                    }
                }
            }
            const stackedPos = worldPos.clone();
            if (stackCount > 0) {
                stackedPos.y += Math.min(4, stackCount) * 0.26;
            }

            const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(1.4 * scale, 0.35 * scale, 1.0);
            sprite.position.copy(stackedPos);

            this.scene.add(sprite);
            this.floatingTexts.push({
                sprite: sprite,
                elapsed: 0,
                duration: 0.75,
                basePos: stackedPos,
                material: mat
            });
        };

        Dungeon3DProto._buildTaperedCrescentGeo = function _buildTaperedCrescentGeo(rInner, rOuter, segs, thetaStart, thetaLength) {
            const geo = new THREE.RingGeometry(rInner, rOuter, segs, 1, thetaStart, thetaLength);
            const pos = geo.attributes && geo.attributes.position;
            if (pos) {
                const rMid = (rInner + rOuter) * 0.5;
                const halfSpan = (rOuter - rInner) * 0.5;
                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i);
                    const y = pos.getY(i);
                    const r = Math.hypot(x, y);
                    if (r > 0.0001) {
                        const ang = Math.atan2(y, x);
                        const normAng = Math.max(0, Math.min(1, (ang - thetaStart) / thetaLength));
                        const env = Math.sin(normAng * Math.PI);
                        const targetR = rMid + Math.sign(r - rMid) * halfSpan * Math.pow(env, 0.85);
                        const scale = targetR / r;
                        pos.setXY(i, x * scale, y * scale);
                    }
                }
                pos.needsUpdate = true;
            }
            geo._sharedGeometry = true;
            return geo;
        };

        Dungeon3DProto._ensureSharedVfxResources = function _ensureSharedVfxResources() {
            if (!this._sharedVfxInitialized) {
                this._sharedVfxInitialized = true;
                if (typeof THREE !== 'undefined') {
                    this._sharedSparkGeo = new THREE.OctahedronGeometry(0.032, 0);
                    this._sharedSparkGeo._sharedGeometry = true;

                    this._sharedStreakGeo = new THREE.ConeGeometry(0.022, 0.24, 5);
                    this._sharedStreakGeo.rotateX(Math.PI / 2);
                    this._sharedStreakGeo._sharedGeometry = true;

                    this._sharedShockRingGeo = new THREE.RingGeometry(0.18, 0.36, 28);
                    this._sharedShockRingGeo.rotateX(-Math.PI / 2);
                    this._sharedShockRingGeo._sharedGeometry = true;

                    this._sharedSlashArcGeo = this._buildTaperedCrescentGeo(0.28, 0.64, 24, -Math.PI * 0.42, Math.PI * 0.84);
                    this._sharedSlashCoreGeo = this._buildTaperedCrescentGeo(0.41, 0.57, 24, -Math.PI * 0.38, Math.PI * 0.76);
                    this._sharedCleaveWaveGeo = this._buildTaperedCrescentGeo(0.22, 0.76, 28, -Math.PI * 0.48, Math.PI * 0.96);

                    this._sharedThrustLanceGeo = new THREE.ConeGeometry(0.075, 0.95, 8);
                    this._sharedThrustLanceGeo.rotateX(Math.PI / 2);
                    this._sharedThrustLanceGeo.translate(0, 0, 0.475);
                    this._sharedThrustLanceGeo._sharedGeometry = true;

                    this._sharedBreathConeGeo = new THREE.ConeGeometry(0.52, 1.45, 16, 1, true);
                    this._sharedBreathConeGeo.rotateX(-Math.PI / 2);
                    this._sharedBreathConeGeo.translate(0, 0, 0.725);
                    this._sharedBreathConeGeo._sharedGeometry = true;

                    this._sharedBoltSegGeo = createLatheFrustumGeo(0.016, 0.016, 1.0, 6);
                    this._sharedBoltSegGeo.rotateX(Math.PI / 2);
                    this._sharedBoltSegGeo.translate(0, 0, 0.5);
                    this._sharedBoltSegGeo._sharedGeometry = true;

                    this._sharedDetonationDomeGeo = new THREE.SphereGeometry(0.46, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
                    this._sharedDetonationDomeGeo._sharedGeometry = true;

                    this._sharedOrbCoreGeo = new THREE.IcosahedronGeometry(0.11, 1);
                    this._sharedOrbCoreGeo._sharedGeometry = true;

                    this._sharedOrbShellGeo = new THREE.IcosahedronGeometry(0.19, 1);
                    this._sharedOrbShellGeo._sharedGeometry = true;

                    this._sharedAuraCylinderGeo = createLatheFrustumGeo(0.42, 0.50, 1.35, 20, true);
                    this._sharedAuraCylinderGeo._sharedGeometry = true;

                    // Elemental silhouette geometries (Frost crystals, Acid vitriol, Poison miasma, Chaos/Nether rings)
                    this._sharedFrostShardGeo = new THREE.OctahedronGeometry(0.105, 0);
                    this._sharedFrostShardGeo.scale(0.60, 1.95, 0.60);
                    this._sharedFrostShardGeo.rotateX(Math.PI / 2);
                    this._sharedFrostShardGeo._sharedGeometry = true;

                    this._sharedFrostNovaRingGeo = new THREE.RingGeometry(0.22, 0.44, 6);
                    this._sharedFrostNovaRingGeo.rotateX(-Math.PI / 2);
                    this._sharedFrostNovaRingGeo._sharedGeometry = true;

                    this._sharedAcidGlobGeo = typeof THREE.DodecahedronGeometry === 'function'
                        ? new THREE.DodecahedronGeometry(0.125, 1)
                        : new THREE.IcosahedronGeometry(0.125, 1);
                    this._sharedAcidGlobGeo._sharedGeometry = true;

                    this._sharedAcidPoolRingGeo = new THREE.RingGeometry(0.10, 0.44, 20);
                    this._sharedAcidPoolRingGeo.rotateX(-Math.PI / 2);
                    this._sharedAcidPoolRingGeo._sharedGeometry = true;

                    this._sharedMiasmaCloudGeo = new THREE.IcosahedronGeometry(0.24, 1);
                    this._sharedMiasmaCloudGeo._sharedGeometry = true;

                    this._sharedChaosTorusGeo = typeof THREE.TorusGeometry === 'function'
                        ? new THREE.TorusGeometry(0.23, 0.028, 8, 20)
                        : new THREE.RingGeometry(0.19, 0.25, 20);
                    this._sharedChaosTorusGeo._sharedGeometry = true;
                }
            }
            if (typeof THREE !== 'undefined') {
                this._initHitSparkPool();
                if (this.scene && !this.vfxFlashLight) {
                    this.vfxFlashLight = new THREE.PointLight(0xffaa44, 0, 10);
                    this.vfxFlashLight.position.set(0, -100, 0);
                    this.scene.add(this.vfxFlashLight);
                    this._vfxFlashState = { active: false, elapsed: 0, duration: 0.25, maxIntensity: 0 };
                }
            }
        };

        Dungeon3DProto._initHitSparkPool = function _initHitSparkPool(poolSize = 20, maxSparksPerBurst = 26) {
            if (this._hitSparkPoolInitialized) return;
            this._hitSparkPoolInitialized = true;
            this._hitSparkPool = this._hitSparkPool || [];
            this._activeHitSparks = this._activeHitSparks || [];
            if (typeof THREE === 'undefined') return;

            const useInstanced = (typeof THREE.InstancedMesh === 'function');
            const streakCap = Math.ceil(maxSparksPerBurst / 2);
            const sparkCap = Math.max(1, Math.floor(maxSparksPerBurst / 2));

            for (let b = 0; b < poolSize; b++) {
                const group = new THREE.Group();
                group.visible = false;

                const material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 1.0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                material._sharedMaterial = true;
                material._pooledHitSparkMat = true;

                const altMaterial = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 1.0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                altMaterial._sharedMaterial = true;
                altMaterial._pooledHitSparkMat = true;

                const sparks = [];
                let streakInstMesh = null;
                let sparkInstMesh = null;

                if (useInstanced) {
                    streakInstMesh = new THREE.InstancedMesh(this._sharedStreakGeo, material, streakCap);
                    streakInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                    streakInstMesh.frustumCulled = false;
                    streakInstMesh.count = 0;
                    group.add(streakInstMesh);

                    sparkInstMesh = new THREE.InstancedMesh(this._sharedSparkGeo, altMaterial, sparkCap);
                    sparkInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                    sparkInstMesh.frustumCulled = false;
                    sparkInstMesh.count = 0;
                    group.add(sparkInstMesh);

                    let sIdx = 0;
                    let dIdx = 0;
                    for (let i = 0; i < maxSparksPerBurst; i++) {
                        const isStreak = (i % 2 === 0);
                        const instIdx = isStreak ? sIdx++ : dIdx++;
                        sparks.push({
                            pos: new THREE.Vector3(),
                            vel: new THREE.Vector3(),
                            scale: 1.0,
                            isStreak,
                            instIdx
                        });
                    }
                } else {
                    for (let i = 0; i < maxSparksPerBurst; i++) {
                        const isStreak = (i % 2 === 0);
                        const geo = isStreak ? this._sharedStreakGeo : this._sharedSparkGeo;
                        const mat = (i % 3 === 1) ? altMaterial : material;
                        const mesh = new THREE.Mesh(geo, mat);
                        mesh.visible = false;
                        group.add(mesh);
                        sparks.push({ mesh, vel: new THREE.Vector3(), isStreak });
                    }
                }

                const ringMat = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                ringMat._sharedMaterial = true;
                ringMat._pooledHitSparkMat = true;

                const shockRingMesh = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                shockRingMesh.position.y = 0.02;
                shockRingMesh.visible = false;
                group.add(shockRingMesh);

                this._hitSparkPool.push({
                    group,
                    instanced: useInstanced,
                    streakInstMesh,
                    sparkInstMesh,
                    sparks,
                    activeCount: 0,
                    elapsed: 0,
                    duration: 0.38,
                    gravity: 6.0,
                    material,
                    altMaterial,
                    shockRingMesh,
                    ringMat,
                    hasShockRing: false
                });
            }
        };

        Dungeon3DProto.recycleHitSparks = function recycleHitSparks() {
            if (Array.isArray(this._activeHitSparks) && this._activeHitSparks.length > 0) {
                this._hitSparkPool = this._hitSparkPool || [];
                for (let i = 0; i < this._activeHitSparks.length; i++) {
                    const slot = this._activeHitSparks[i];
                    if (slot) {
                        slot.elapsed = 0;
                        slot.activeCount = 0;
                        if (slot.streakInstMesh) slot.streakInstMesh.count = 0;
                        if (slot.sparkInstMesh) slot.sparkInstMesh.count = 0;
                        if (slot.group) {
                            slot.group.visible = false;
                            if (this.scene) this.scene.remove(slot.group);
                        }
                        if (slot.shockRingMesh) slot.shockRingMesh.visible = false;
                        this._hitSparkPool.push(slot);
                    }
                }
                this._activeHitSparks.length = 0;
            }
            if (Array.isArray(this.particles) && this.particles.length > 0) {
                for (let i = 0; i < this.particles.length; i++) {
                    const p = this.particles[i];
                    if (p && p.group && this.scene) this.scene.remove(p.group);
                    if (p && p.material && !p.material._sharedMaterial && typeof p.material.dispose === 'function') {
                        p.material.dispose();
                    }
                    if (p && p.ringMat && !p.ringMat._sharedMaterial && typeof p.ringMat.dispose === 'function') {
                        p.ringMat.dispose();
                    }
                }
                this.particles.length = 0;
            }
        };

        Dungeon3DProto._triggerVfxFlash = function _triggerVfxFlash(pos, colorHex = 0xffaa44, intensity = 3.5, distance = 9.0, duration = 0.26) {
            this._ensureSharedVfxResources();
            if (!this.vfxFlashLight || !pos) return;
            this.vfxFlashLight.position.copy(pos);
            this.vfxFlashLight.color.set(colorHex);
            if (window.Dungeon3DCompat) window.Dungeon3DCompat.setLightIntensity(this.vfxFlashLight, 'point', intensity);
            else this.vfxFlashLight.intensity = intensity;
            this.vfxFlashLight.distance = distance;
            this._vfxFlashState = {
                active: true,
                elapsed: 0,
                duration: Math.max(0.08, duration),
                maxIntensity: intensity
            };
        };

        Dungeon3DProto.spawnHitSparks = function spawnHitSparks(worldPos, colorHex = '#ffaa33', count = 14, opts = {}) {
            if (typeof THREE === 'undefined' || !worldPos) return;
            this._ensureSharedVfxResources();
            this._hitSparkPool = this._hitSparkPool || [];
            this._activeHitSparks = this._activeHitSparks || [];

            let slot = this._hitSparkPool.pop();
            if (!slot && this._activeHitSparks.length > 0) {
                slot = this._activeHitSparks.shift();
            }
            if (!slot) return;

            const safeColor = (colorHex !== undefined && colorHex !== null) ? colorHex : '#ffaa33';
            const secColor = (opts && opts.secondaryColor !== undefined && opts.secondaryColor !== null) ? opts.secondaryColor : safeColor;
            slot.group.position.copy(worldPos);
            slot.group.visible = true;
            slot.material.color.set(safeColor);
            slot.material.opacity = 1.0;
            if (slot.altMaterial) {
                slot.altMaterial.color.set(secColor);
                slot.altMaterial.opacity = 1.0;
            }

            const speedScale = (opts && typeof opts.speedScale === 'number') ? opts.speedScale : 1.0;
            const sparkScale = (opts && typeof opts.sparkScale === 'number') ? opts.sparkScale : 1.0;
            const upBias = (opts && typeof opts.upBias === 'number') ? opts.upBias : 1.2;
            const activeCount = Math.min(slot.sparks.length, Math.max(0, count | 0));
            const lookTarget = this._tmpSparkInitLook || (this._tmpSparkInitLook = new THREE.Vector3());

            if (slot.instanced && slot.streakInstMesh && slot.sparkInstMesh) {
                const dummy = this._sparkDummy || (this._sparkDummy = new THREE.Object3D());
                let streakCount = 0;
                let sparkCount = 0;
                for (let i = 0; i < activeCount; i++) {
                    const sp = slot.sparks[i];
                    const theta = Math.random() * Math.PI * 2;
                    const phi = (Math.random() - 0.5) * Math.PI;
                    const speed = (1.2 + Math.random() * 2.2) * speedScale;
                    sp.pos.set(0, 0, 0);
                    sp.scale = sparkScale;
                    sp.vel.set(
                        Math.cos(theta) * Math.cos(phi) * speed,
                        Math.sin(phi) * speed + upBias,
                        Math.sin(theta) * Math.cos(phi) * speed
                    );
                    dummy.position.set(0, 0, 0);
                    dummy.scale.setScalar(sparkScale);
                    if (sp.isStreak) {
                        lookTarget.copy(sp.vel);
                        dummy.lookAt(lookTarget);
                        dummy.updateMatrix();
                        slot.streakInstMesh.setMatrixAt(sp.instIdx, dummy.matrix);
                        streakCount = Math.max(streakCount, sp.instIdx + 1);
                    } else {
                        dummy.rotation.set(0, 0, 0);
                        dummy.updateMatrix();
                        slot.sparkInstMesh.setMatrixAt(sp.instIdx, dummy.matrix);
                        sparkCount = Math.max(sparkCount, sp.instIdx + 1);
                    }
                }
                slot.streakInstMesh.count = streakCount;
                slot.streakInstMesh.instanceMatrix.needsUpdate = true;
                slot.sparkInstMesh.count = sparkCount;
                slot.sparkInstMesh.instanceMatrix.needsUpdate = true;
            } else {
                for (let i = 0; i < slot.sparks.length; i++) {
                    const sp = slot.sparks[i];
                    if (i < activeCount) {
                        const theta = Math.random() * Math.PI * 2;
                        const phi = (Math.random() - 0.5) * Math.PI;
                        const speed = (1.2 + Math.random() * 2.2) * speedScale;
                        sp.mesh.position.set(0, 0, 0);
                        sp.mesh.scale.setScalar(sparkScale);
                        sp.mesh.visible = true;
                        sp.vel.set(
                            Math.cos(theta) * Math.cos(phi) * speed,
                            Math.sin(phi) * speed + upBias,
                            Math.sin(theta) * Math.cos(phi) * speed
                        );
                        if (sp.isStreak) {
                            lookTarget.copy(sp.vel);
                            sp.mesh.lookAt(lookTarget);
                        }
                    } else {
                        sp.mesh.visible = false;
                    }
                }
            }

            slot.activeCount = activeCount;
            slot.elapsed = 0;
            slot.duration = (opts && typeof opts.duration === 'number') ? opts.duration : 0.38;
            slot.gravity = (opts && typeof opts.gravity === 'number') ? opts.gravity : 6.0;
            slot.hasShockRing = Boolean(opts && opts.shockRing);

            if (slot.hasShockRing && slot.shockRingMesh && slot.ringMat) {
                slot.ringMat.color.set((opts && opts.ringColor !== undefined && opts.ringColor !== null) ? opts.ringColor : safeColor);
                slot.ringMat.opacity = 0.85;
                slot.shockRingMesh.scale.set(1, 1, 1);
                slot.shockRingMesh.visible = true;
            } else if (slot.shockRingMesh) {
                slot.shockRingMesh.visible = false;
            }

            if (this.scene && slot.group.parent !== this.scene) {
                this.scene.add(slot.group);
            }
            this._activeHitSparks.push(slot);
            if (this.renderGovernor && typeof this.renderGovernor.wake === 'function') {
                this.renderGovernor.wake(450);
            }
        };

        Dungeon3DProto.spawnDetonationDome = function spawnDetonationDome(worldPos, colorHex = 0xff6600, scale = 1.0, opts = {}) {
            this._ensureSharedVfxResources();
            this.activeProjectiles = this.activeProjectiles || [];
            const prof = resolveElementProfile(opts && opts.element, colorHex, opts);
            const elem = prof.element;
            const group = new THREE.Group();
            group.position.copy(worldPos);
            if (this.scene) this.scene.add(group);

            const col = new THREE.Color(prof.color);
            const isPoison = elem === 'poison';
            const isAcid = elem === 'acid';
            const isFrost = elem === 'frost';
            const isChaosOrNether = elem === 'chaos' || elem === 'nether';

            const domeGeo = isPoison ? (this._sharedMiasmaCloudGeo || this._sharedDetonationDomeGeo) : this._sharedDetonationDomeGeo;
            const domeOpacity = isPoison ? 0.68 : 0.82;
            const domeMat = new THREE.MeshBasicMaterial({
                color: col,
                transparent: true,
                opacity: domeOpacity,
                blending: isPoison ? THREE.NormalBlending : THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const domeMesh = new THREE.Mesh(domeGeo, domeMat);
            if (isPoison) domeMesh.scale.set(1.75, 1.35, 1.75);
            group.add(domeMesh);

            const coreGeo = isPoison ? (this._sharedMiasmaCloudGeo || this._sharedDetonationDomeGeo) : this._sharedDetonationDomeGeo;
            const coreMat = new THREE.MeshBasicMaterial({
                color: prof.core,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const coreMesh = new THREE.Mesh(coreGeo, coreMat);
            coreMesh.scale.setScalar(isPoison ? 1.15 : 0.55);
            group.add(coreMesh);

            const ringGeo = isFrost
                ? (this._sharedFrostNovaRingGeo || this._sharedShockRingGeo)
                : (isAcid ? (this._sharedAcidPoolRingGeo || this._sharedShockRingGeo) : this._sharedShockRingGeo);
            const ringMat = new THREE.MeshBasicMaterial({
                color: isPoison ? prof.secondary : col,
                transparent: true,
                opacity: 0.88,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.position.y = 0.02;
            group.add(ringMesh);

            const disposables = [domeMat, coreMat, ringMat];
            let extraMeshes = null;
            let extraMat = null;
            let altDomeMat = null;

            if (isFrost && this._sharedFrostShardGeo) {
                extraMat = new THREE.MeshBasicMaterial({
                    color: 0xe0f7ff,
                    transparent: true,
                    opacity: 0.94,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                disposables.push(extraMat);
                extraMeshes = [];
                for (let k = 0; k < 6; k++) {
                    const ang = (k / 6) * Math.PI * 2;
                    const spike = new THREE.Mesh(this._sharedFrostShardGeo, extraMat);
                    const dx = Math.cos(ang), dz = Math.sin(ang);
                    spike.position.set(dx * 0.14, 0.10, dz * 0.14);
                    spike.lookAt(dx * 1.4, 0.45, dz * 1.4);
                    spike.userData = { radialDir: new THREE.Vector3(dx, 0.25, dz).normalize() };
                    group.add(spike);
                    extraMeshes.push(spike);
                }
            } else if (isAcid && this._sharedAcidGlobGeo) {
                extraMat = new THREE.MeshBasicMaterial({
                    color: prof.secondary,
                    transparent: true,
                    opacity: 0.90,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                disposables.push(extraMat);
                extraMeshes = [];
                for (let k = 0; k < 5; k++) {
                    const ang = (k / 5) * Math.PI * 2 + 0.3;
                    const glob = new THREE.Mesh(this._sharedAcidGlobGeo, extraMat);
                    const dx = Math.cos(ang), dz = Math.sin(ang);
                    glob.scale.setScalar(0.55);
                    glob.position.set(dx * 0.12, 0.12, dz * 0.12);
                    glob.userData = { radialDir: new THREE.Vector3(dx, 0.55, dz).normalize() };
                    group.add(glob);
                    extraMeshes.push(glob);
                }
            } else if (isPoison && this._sharedMiasmaCloudGeo) {
                altDomeMat = new THREE.MeshBasicMaterial({
                    color: prof.secondary,
                    transparent: true,
                    opacity: 0.78,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                disposables.push(altDomeMat);
                extraMeshes = [];
                for (let k = 0; k < 3; k++) {
                    const ang = (k / 3) * Math.PI * 2;
                    const puff = new THREE.Mesh(this._sharedMiasmaCloudGeo, altDomeMat);
                    puff.position.set(Math.cos(ang) * 0.22, 0.22 + k * 0.06, Math.sin(ang) * 0.22);
                    puff.scale.setScalar(0.85);
                    puff.userData = { radialDir: new THREE.Vector3(Math.cos(ang) * 0.4, 0.65, Math.sin(ang) * 0.4) };
                    group.add(puff);
                    extraMeshes.push(puff);
                }
            } else if (isChaosOrNether && this._sharedChaosTorusGeo) {
                extraMat = new THREE.MeshBasicMaterial({
                    color: prof.secondary,
                    transparent: true,
                    opacity: 0.92,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                disposables.push(extraMat);
                extraMeshes = [];
                for (let k = 0; k < 2; k++) {
                    const torus = new THREE.Mesh(this._sharedChaosTorusGeo, extraMat);
                    torus.position.y = 0.22;
                    torus.rotation.set(k === 0 ? 0.85 : -0.85, k * 1.1, 0);
                    torus.scale.setScalar(1.35);
                    torus.userData = { spinRate: k === 0 ? 9.0 : -9.0 };
                    group.add(torus);
                    extraMeshes.push(torus);
                }
            }

            const duration = isPoison ? 0.44 : (isFrost ? 0.36 : 0.32);
            this._triggerVfxFlash(worldPos, prof.flash, 4.2, 9.0, duration);

            this.activeProjectiles.push({
                kind: 'detonation',
                element: elem,
                group,
                baseScale: scale,
                squashY: isAcid ? 0.56 : 1.0,
                domeOpacity,
                domeMat,
                coreMat,
                altDomeMat,
                ringMat,
                extraMat,
                extraMeshes,
                pLight: null,
                startPos: worldPos.clone(),
                endPos: worldPos.clone(),
                colorHex: prof.color,
                elapsed: 0,
                duration,
                disposables
            });
            if (this.renderGovernor && typeof this.renderGovernor.wake === 'function') {
                this.renderGovernor.wake(1500);
            }
        };

        Dungeon3DProto._resolveCombatEndpoints = function _resolveCombatEndpoints(msgLower, isPlayerAction = true, isRangedOrSpell = false) {
            const playerPos = this.camera ? this.camera.position.clone() : new THREE.Vector3();
            const fwd = new THREE.Vector3(0, 0, -1);
            if (this.camera) fwd.applyQuaternion(this.camera.quaternion);

            const maxDist = (isPlayerAction && !isRangedOrSpell) ? 3.8 : 14.0;
            let monsterEntity = null;
            if (this.targetedMonsterId && this.monsters && this.monsters.has(this.targetedMonsterId)) {
                const candidate = this.monsters.get(this.targetedMonsterId);
                if (candidate && (isRangedOrSpell || !isPlayerAction || candidate.position.distanceTo(playerPos) <= maxDist)) {
                    monsterEntity = candidate;
                }
            }
            if (!monsterEntity && this.monsters) {
                let bestNamedDist = maxDist;
                for (const ent of this.monsters.values()) {
                    if (!ent.visible) continue;
                    const mData = ent.monsterData;
                    const mName = ((mData && mData.name) || ent.name || '').toLowerCase();
                    if (mName && msgLower.includes(mName)) {
                        const d = ent.position.distanceTo(playerPos);
                        if (d <= bestNamedDist) {
                            bestNamedDist = d;
                            monsterEntity = ent;
                        }
                    }
                }
                if (!monsterEntity) {
                    let bestDist = maxDist;
                    for (const ent of this.monsters.values()) {
                        if (!ent.visible) continue;
                        const d = ent.position.distanceTo(playerPos);
                        if (d < bestDist) {
                            bestDist = d;
                            monsterEntity = ent;
                        }
                    }
                }
            }
            if (!monsterEntity && Array.isArray(this._dyingMonsters) && this._dyingMonsters.length > 0) {
                let bestDist = maxDist;
                for (const ent of this._dyingMonsters) {
                    if (!ent) continue;
                    const d = ent.position.distanceTo(playerPos);
                    if (d <= bestDist) {
                        bestDist = d;
                        monsterEntity = ent;
                    }
                }
            }

            let monsterPos;
            if (monsterEntity) {
                monsterPos = monsterEntity.position.clone().add(new THREE.Vector3(0, (monsterEntity.modelHeight || 1.4) * 0.55, 0));
            } else {
                const reach = (isPlayerAction && !isRangedOrSpell) ? 1.55 : 3.2;
                monsterPos = playerPos.clone().addScaledVector(fwd, reach);
                monsterPos.y = playerPos.y - 0.15;
            }

            const rightVec = new THREE.Vector3(1, 0, 0);
            if (this.camera) rightVec.applyQuaternion(this.camera.quaternion);
            const toMonster = monsterPos.clone().sub(playerPos).normalize();
            const pan = Math.max(-0.95, Math.min(0.95, toMonster.dot(rightVec)));

            const playerHandPos = playerPos.clone().addScaledVector(fwd, 0.45).add(new THREE.Vector3(0.18, -0.18, 0));
            const playerFacePos = playerPos.clone().addScaledVector(fwd, 0.55);
            const hasLos = monsterEntity ? (monsterEntity.inLos !== false && monsterEntity.visible !== false) : true;

            return {
                startPos: isPlayerAction ? playerHandPos : monsterPos,
                endPos: isPlayerAction ? monsterPos : playerFacePos,
                monsterEntity,
                pan,
                spatialAudio: {
                    worldSpace: true,
                    x: monsterPos.x,
                    y: monsterPos.y,
                    z: monsterPos.z,
                    pan,
                    hasLos,
                    occluded: !hasLos
                }
            };
        };

        Dungeon3DProto.spawnProjectileOrSpellVfx = function spawnProjectileOrSpellVfx(kind, startPos, endPos, colorHex = 0xff6600, opts = {}) {
            this._ensureSharedVfxResources();
            this.activeProjectiles = this.activeProjectiles || [];
            const group = new THREE.Group();
            group.position.copy(startPos);
            if (this.scene) this.scene.add(group);

            const disposables = [];
            let duration = 0.25;
            let onComplete = null;
            let lines = null;
            let mat = null;
            let outerMat = null;
            let innerMat = null;
            let ringMat = null;
            let bluntRingMat = null;
            let bluntDomeMat = null;
            let lanceMat = null;
            let needleMat = null;
            let pillarMat = null;
            let pLight = null;
            let dist = null;
            let vortexRings = null;
            let spinMeshes = null;

            const col = new THREE.Color(colorHex);

            if (kind === 'arrow') {
                duration = 0.22;
                let arrowMesh = null;
                if (this._gltfTemplateCache && this._gltfTemplateCache.has('item_arrow')) {
                    arrowMesh = this._cloneCachedGltfTemplate(this._gltfTemplateCache.get('item_arrow'), null, 'item_arrow');
                    if (arrowMesh.children && arrowMesh.children[0]) {
                        arrowMesh.children[0].rotation.set(0, 0, 0);
                        arrowMesh.children[0].position.set(0, 0, 0);
                    }
                    arrowMesh.scale.setScalar(0.42);
                } else {
                    const shaftGeo = createLatheFrustumGeo(0.012, 0.012, 0.65, 6);
                    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xdbeafe });
                    disposables.push(shaftGeo, shaftMat);
                    arrowMesh = new THREE.Mesh(shaftGeo, shaftMat);
                }
                const dir = endPos.clone().sub(startPos).normalize();
                arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                group.add(arrowMesh);
                onComplete = () => {
                    this.spawnHitSparks(endPos, 0xdbeafe, 12);
                };
            } else if (kind === 'potion') {
                duration = 0.34;
                let bottleMesh = null;
                if (this._gltfTemplateCache && this._gltfTemplateCache.has('ph_potion_bottle')) {
                    bottleMesh = this._cloneCachedGltfTemplate(this._gltfTemplateCache.get('ph_potion_bottle'), '#' + col.getHexString(), 'ph_potion_bottle');
                    bottleMesh.scale.setScalar(0.35);
                } else {
                    const botGeo = createLatheFrustumGeo(0.05, 0.07, 0.20, 8);
                    const botMat = new THREE.MeshBasicMaterial({ color: col });
                    disposables.push(botGeo, botMat);
                    bottleMesh = new THREE.Mesh(botGeo, botMat);
                }
                group.add(bottleMesh);
                onComplete = () => {
                    this.spawnHitSparks(endPos, colorHex, 16);
                };
            } else if (kind === 'slash' || kind === 'crit_slash') {
                duration = (kind === 'crit_slash') ? 0.26 : 0.20;
                group.position.copy(endPos);
                group.lookAt(startPos);

                outerMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.95,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                innerMat = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.98,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                disposables.push(outerMat, innerMat);

                const blade1 = new THREE.Group();
                blade1.rotation.set(0.28, -0.22, 0.58);
                blade1.add(new THREE.Mesh(this._sharedSlashArcGeo, outerMat));
                blade1.add(new THREE.Mesh(this._sharedSlashCoreGeo, innerMat));
                group.add(blade1);

                if (kind === 'crit_slash') {
                    const blade2 = new THREE.Group();
                    blade2.scale.x = -1;
                    blade2.rotation.set(0.28, 0.22, 0.58);
                    blade2.add(new THREE.Mesh(this._sharedSlashArcGeo, outerMat));
                    blade2.add(new THREE.Mesh(this._sharedSlashCoreGeo, innerMat));
                    group.add(blade2);

                    ringMat = new THREE.MeshBasicMaterial({
                        color: col,
                        transparent: true,
                        opacity: 0.85,
                        blending: THREE.AdditiveBlending,
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });
                    const ringMesh = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                    ringMesh.position.y = -0.2;
                    group.add(ringMesh);
                    disposables.push(ringMat);

                    this._triggerVfxFlash(endPos, colorHex, 3.5, 6.0, duration);
                }

                this.spawnHitSparks(endPos, colorHex, (kind === 'crit_slash') ? 24 : 14, { shockRing: kind === 'crit_slash' });
            } else if (kind === 'axe_cleave') {
                duration = 0.24;
                group.position.copy(endPos);
                group.lookAt(startPos);

                outerMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.96,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                innerMat = new THREE.MeshBasicMaterial({
                    color: 0xfff3cc,
                    transparent: true,
                    opacity: 0.98,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                ringMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.88,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                disposables.push(outerMat, innerMat, ringMat);

                const cleaveArc = new THREE.Group();
                cleaveArc.rotation.set(0.42, -0.15, 0.36);
                cleaveArc.add(new THREE.Mesh(this._sharedCleaveWaveGeo || this._sharedSlashArcGeo, outerMat));
                cleaveArc.add(new THREE.Mesh(this._sharedSlashCoreGeo, innerMat));
                group.add(cleaveArc);

                const shockRing = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                shockRing.position.y = -0.15;
                group.add(shockRing);

                this._triggerVfxFlash(endPos, colorHex, 3.6, 6.5, duration);
                this.spawnHitSparks(endPos, colorHex, 20, { shockRing: true });
            } else if (kind === 'whip_lash') {
                duration = 0.21;
                lines = [];
                const coreMat = new THREE.LineBasicMaterial({ color: 0xffe4b5, transparent: true, opacity: 0.98 });
                const outerLineMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.92 });
                const segMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.92,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                ringMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.90,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                disposables.push(coreMat, outerLineMat, segMat, ringMat);

                const segs = 12;
                const lashPts = [];
                const dxW = endPos.x - startPos.x, dzW = endPos.z - startPos.z;
                const lenW = Math.hypot(dxW, dzW) || 1.0;
                const perpX = -dzW / lenW, perpZ = dxW / lenW;
                for (let i = 0; i <= segs; i++) {
                    const frac = i / segs;
                    const pt = new THREE.Vector3().lerpVectors(startPos, endPos, frac);
                    const wave = Math.sin(frac * Math.PI * 2.5) * (1.0 - frac * 0.6) * 0.22;
                    pt.x += perpX * wave;
                    pt.z += perpZ * wave;
                    pt.y += Math.cos(frac * Math.PI * 2.0) * 0.14 * (1.0 - frac);
                    lashPts.push(pt.sub(startPos));
                }
                if (this._sharedBoltSegGeo) {
                    for (let i = 0; i < lashPts.length - 1; i++) {
                        const p0 = lashPts[i];
                        const p1 = lashPts[i + 1];
                        const segLen = p0.distanceTo(p1);
                        if (segLen > 0.005) {
                            const segMesh = new THREE.Mesh(this._sharedBoltSegGeo, segMat);
                            segMesh.position.copy(p0);
                            segMesh.lookAt(p1);
                            const thickness = 1.25 - (i / lashPts.length) * 0.65;
                            segMesh.scale.set(thickness, thickness, segLen);
                            group.add(segMesh);
                        }
                    }
                }
                const lashGeo = new THREE.BufferGeometry().setFromPoints(lashPts);
                disposables.push(lashGeo);
                const lashLine = new THREE.Line(lashGeo, coreMat);
                group.add(lashLine);
                lines.push(lashLine);

                const crackRing = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                crackRing.position.copy(endPos).sub(startPos);
                crackRing.lookAt(startPos.clone().sub(endPos));
                group.add(crackRing);

                this._triggerVfxFlash(endPos, colorHex, 2.8, 5.5, duration);
                this.spawnHitSparks(endPos, colorHex, 16, { shockRing: true });
            } else if (kind === 'blunt') {
                duration = 0.24;
                group.position.copy(endPos);

                bluntRingMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                bluntDomeMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                disposables.push(bluntRingMat, bluntDomeMat);

                const ring1 = new THREE.Mesh(this._sharedShockRingGeo, bluntRingMat);
                ring1.position.y = 0.02;
                group.add(ring1);

                const ring2 = new THREE.Mesh(this._sharedShockRingGeo, bluntRingMat);
                if (this.camera) {
                    ring2.quaternion.copy(this.camera.quaternion);
                } else {
                    ring2.rotation.x = Math.PI * 0.25;
                }
                group.add(ring2);

                const flashDome = new THREE.Mesh(this._sharedDetonationDomeGeo, bluntDomeMat);
                flashDome.scale.setScalar(0.55);
                group.add(flashDome);

                this._triggerVfxFlash(endPos, colorHex, 3.0, 6.0, duration);
                this.spawnHitSparks(endPos, colorHex, 18, { shockRing: true });
            } else if (kind === 'pierce') {
                duration = 0.19;
                group.position.copy(startPos.clone().lerp(endPos, 0.22));
                group.lookAt(endPos);

                lanceMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.95,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                needleMat = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.98,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                disposables.push(lanceMat, needleMat);

                const lanceMesh = new THREE.Mesh(this._sharedThrustLanceGeo, lanceMat);
                group.add(lanceMesh);

                const needleMesh = new THREE.Mesh(this._sharedThrustLanceGeo, needleMat);
                needleMesh.scale.set(0.45, 0.45, 1.15);
                group.add(needleMesh);

                const pRing = new THREE.Mesh(this._sharedShockRingGeo, lanceMat);
                pRing.rotation.x = Math.PI / 2;
                group.add(pRing);

                this.spawnHitSparks(endPos, colorHex, 15);
            } else if (kind === 'breath') {
                const prof = resolveElementProfile(opts && opts.element, colorHex, opts);
                const elem = prof.element;
                const bCol = new THREE.Color(prof.color);
                duration = 0.38;
                group.position.copy(startPos);
                group.lookAt(endPos);
                dist = Math.max(1.5, startPos.distanceTo(endPos));

                outerMat = new THREE.MeshBasicMaterial({
                    color: bCol,
                    transparent: true,
                    opacity: elem === 'poison' ? 0.68 : 0.72,
                    blending: elem === 'poison' ? THREE.NormalBlending : THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                innerMat = new THREE.MeshBasicMaterial({
                    color: prof.core,
                    transparent: true,
                    opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                ringMat = new THREE.MeshBasicMaterial({
                    color: elem === 'poison' ? prof.secondary : bCol,
                    transparent: true,
                    opacity: 0.80,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                disposables.push(outerMat, innerMat, ringMat);

                const outerCone = new THREE.Mesh(this._sharedBreathConeGeo, outerMat);
                group.add(outerCone);

                const innerCone = new THREE.Mesh(this._sharedBreathConeGeo, innerMat);
                innerCone.scale.set(0.55, 0.55, 0.92);
                group.add(innerCone);

                vortexRings = [];
                const ringFracs = [0.33, 0.66, 0.95];
                const vRingGeo = elem === 'frost'
                    ? (this._sharedFrostNovaRingGeo || this._sharedShockRingGeo)
                    : (elem === 'chaos' || elem === 'nether')
                        ? (this._sharedChaosTorusGeo || this._sharedShockRingGeo)
                        : this._sharedShockRingGeo;
                for (let r = 0; r < ringFracs.length; r++) {
                    const vRing = new THREE.Mesh(vRingGeo, ringMat);
                    if (vRingGeo !== this._sharedChaosTorusGeo) vRing.rotation.x = Math.PI / 2;
                    vRing.position.z = 1.45 * ringFracs[r];
                    const sc = 0.5 + ringFracs[r] * 0.8;
                    vRing.scale.set(sc, sc, sc);
                    group.add(vRing);
                    vortexRings.push(vRing);
                }

                // Element-specific silhouette inclusions inside breath cone
                const elemGeo = elem === 'frost' ? this._sharedFrostShardGeo
                    : elem === 'acid' ? this._sharedAcidGlobGeo
                    : elem === 'poison' ? this._sharedMiasmaCloudGeo
                    : null;
                if (elemGeo) {
                    const elemMat = elem === 'frost' ? innerMat : ringMat;
                    for (let k = 0; k < 4; k++) {
                        const fz = 0.35 + k * 0.28;
                        const ang = k * 1.65;
                        const rad = 0.14 + k * 0.05;
                        const piece = new THREE.Mesh(elemGeo, elemMat);
                        piece.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, fz);
                        piece.scale.setScalar(elem === 'frost' ? 0.85 : 0.65);
                        group.add(piece);
                        vortexRings.push(piece);
                    }
                }

                this._triggerVfxFlash(startPos.clone().lerp(endPos, 0.5), prof.flash, 4.5, 11.0, duration);

                onComplete = () => {
                    this.spawnDetonationDome(endPos, prof.color, 1.15, { element: elem });
                    this.spawnHitSparks(endPos, prof.color, 24, {
                        shockRing: true,
                        secondaryColor: prof.secondary,
                        gravity: elem === 'poison' ? -1.4 : (elem === 'acid' ? 8.5 : 6.0)
                    });
                };
            } else if (kind === 'fireball' || kind === 'bolt' || kind === 'frost' || kind === 'frost_bolt' || kind === 'acid' || kind === 'acid_bolt' || kind === 'poison' || kind === 'nether' || kind === 'chaos') {
                const prof = resolveElementProfile(kind === 'bolt' || kind === 'fireball' ? (opts && opts.element) || 'fire' : kind, colorHex, opts);
                const elem = prof.element;
                const eCol = new THREE.Color(prof.color);
                duration = prof.duration;
                const isBoltVariant = kind === 'bolt' || kind.endsWith('_bolt');
                const scaleMult = isBoltVariant ? 0.78 : 1.0;

                innerMat = new THREE.MeshBasicMaterial({
                    color: prof.core,
                    transparent: true,
                    opacity: 0.98,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                outerMat = new THREE.MeshBasicMaterial({
                    color: eCol,
                    transparent: true,
                    opacity: elem === 'poison' ? 0.72 : 0.80,
                    blending: elem === 'poison' ? THREE.NormalBlending : THREE.AdditiveBlending,
                    depthWrite: false
                });
                ringMat = new THREE.MeshBasicMaterial({
                    color: elem === 'poison' ? prof.secondary : eCol,
                    transparent: true,
                    opacity: 0.88,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                disposables.push(innerMat, outerMat, ringMat);
                spinMeshes = [];

                if (elem === 'frost') {
                    // Crystalline ice shard cluster aimed along flight vector + hexagonal ice halo
                    group.lookAt(endPos);
                    const coreMesh = new THREE.Mesh(this._sharedOrbCoreGeo, innerMat);
                    coreMesh.scale.setScalar(scaleMult * 0.85);
                    group.add(coreMesh);

                    const shardGeo = this._sharedFrostShardGeo || this._sharedOrbShellGeo;
                    const leadShard = new THREE.Mesh(shardGeo, outerMat);
                    leadShard.scale.setScalar(scaleMult * 1.45);
                    group.add(leadShard);
                    spinMeshes.push(leadShard);

                    for (let k = 0; k < 3; k++) {
                        const ang = (k / 3) * Math.PI * 2;
                        const sat = new THREE.Mesh(shardGeo, innerMat);
                        sat.position.set(Math.cos(ang) * 0.14 * scaleMult, Math.sin(ang) * 0.14 * scaleMult, -0.05);
                        sat.scale.setScalar(scaleMult * 0.82);
                        group.add(sat);
                        spinMeshes.push(sat);
                    }

                    const hexRing = new THREE.Mesh(this._sharedFrostNovaRingGeo || this._sharedShockRingGeo, ringMat);
                    hexRing.rotation.x = Math.PI / 2;
                    hexRing.scale.setScalar(scaleMult * 0.95);
                    group.add(hexRing);
                    spinMeshes.push(hexRing);
                } else if (elem === 'acid') {
                    // Bubbling green vitriol glob + orbiting droplets
                    const globGeo = this._sharedAcidGlobGeo || this._sharedOrbShellGeo;
                    const mainGlob = new THREE.Mesh(globGeo, outerMat);
                    mainGlob.scale.setScalar(scaleMult * 1.25);
                    group.add(mainGlob);
                    spinMeshes.push(mainGlob);

                    const innerAcid = new THREE.Mesh(this._sharedOrbCoreGeo, innerMat);
                    innerAcid.scale.setScalar(scaleMult * 0.80);
                    group.add(innerAcid);

                    for (let k = 0; k < 3; k++) {
                        const ang = (k / 3) * Math.PI * 2;
                        const drop = new THREE.Mesh(globGeo, ringMat);
                        drop.position.set(Math.cos(ang) * 0.16 * scaleMult, Math.sin(ang) * 0.12 * scaleMult, (k - 1) * 0.08);
                        drop.scale.setScalar(scaleMult * 0.45);
                        group.add(drop);
                        spinMeshes.push(drop);
                    }
                } else if (elem === 'poison') {
                    // Swirling noxious purple + emerald dual-tone miasma cloud
                    const cloudGeo = this._sharedMiasmaCloudGeo || this._sharedOrbShellGeo;
                    const outerCloud = new THREE.Mesh(cloudGeo, outerMat);
                    outerCloud.scale.setScalar(scaleMult * 1.15);
                    group.add(outerCloud);
                    spinMeshes.push(outerCloud);

                    const emeraldCore = new THREE.Mesh(cloudGeo, innerMat);
                    emeraldCore.scale.setScalar(scaleMult * 0.72);
                    emeraldCore.position.set(0.05, 0.03, 0);
                    group.add(emeraldCore);
                    spinMeshes.push(emeraldCore);

                    const orbitPuff = new THREE.Mesh(cloudGeo, ringMat);
                    orbitPuff.scale.setScalar(scaleMult * 0.52);
                    orbitPuff.position.set(-0.14 * scaleMult, -0.04, 0.08);
                    group.add(orbitPuff);
                    spinMeshes.push(orbitPuff);
                } else if (elem === 'nether' || elem === 'chaos') {
                    // Singularity orb + counter-spinning tilted Chaos/Nether torus rings
                    const innerMesh = new THREE.Mesh(this._sharedOrbCoreGeo, innerMat);
                    innerMesh.scale.setScalar(scaleMult * 0.95);
                    group.add(innerMesh);

                    const outerMesh = new THREE.Mesh(this._sharedOrbShellGeo, outerMat);
                    outerMesh.scale.setScalar(scaleMult);
                    group.add(outerMesh);

                    const torusGeo = this._sharedChaosTorusGeo || this._sharedShockRingGeo;
                    for (let k = 0; k < 2; k++) {
                        const ring = new THREE.Mesh(torusGeo, ringMat);
                        ring.rotation.set(k === 0 ? 0.75 : -0.75, k * 1.1, 0);
                        ring.scale.setScalar(scaleMult * (k === 0 ? 1.05 : 0.85));
                        group.add(ring);
                        spinMeshes.push(ring);
                    }
                } else {
                    // Blazing Fireball / Fire Bolt
                    const innerMesh = new THREE.Mesh(this._sharedOrbCoreGeo, innerMat);
                    innerMesh.scale.setScalar(scaleMult);
                    group.add(innerMesh);

                    const outerMesh = new THREE.Mesh(this._sharedOrbShellGeo, outerMat);
                    outerMesh.scale.setScalar(scaleMult);
                    group.add(outerMesh);
                    spinMeshes.push(outerMesh);

                    const coronaRing = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                    coronaRing.scale.setScalar(scaleMult * 0.9);
                    coronaRing.lookAt(endPos);
                    group.add(coronaRing);
                    spinMeshes.push(coronaRing);
                }

                const trailGravity = elem === 'poison' ? -1.2 : (elem === 'acid' ? 8.5 : (elem === 'frost' ? 2.2 : 6.0));
                this.spawnHitSparks(startPos.clone().lerp(endPos, 0.35), prof.color, 12, { secondaryColor: prof.secondary, gravity: trailGravity });
                this.spawnHitSparks(startPos.clone().lerp(endPos, 0.65), prof.secondary, 12, { secondaryColor: prof.core, gravity: trailGravity });

                this._triggerVfxFlash(endPos, prof.flash, 3.8, 10.0, duration);

                onComplete = () => {
                    this.spawnDetonationDome(endPos, prof.color, isBoltVariant ? 0.72 : 1.05, { element: elem });
                    this.spawnHitSparks(endPos, prof.color, 20, {
                        shockRing: true,
                        secondaryColor: prof.secondary,
                        gravity: trailGravity,
                        duration: elem === 'poison' ? 0.46 : 0.38
                    });
                };
            } else if (kind === 'lightning') {
                duration = 0.28;
                lines = [];
                const coreMat = new THREE.LineBasicMaterial({ color: 0xeeffff, transparent: true, opacity: 1.0 });
                const outerLineMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.92 });
                const boltSegMat = new THREE.MeshBasicMaterial({
                    color: 0xccffff,
                    transparent: true,
                    opacity: 0.92,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                ringMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                disposables.push(coreMat, outerLineMat, boltSegMat, ringMat);

                const ptCount = 12;
                const corePts = [];
                for (let i = 0; i < ptCount; i++) {
                    const frac = i / (ptCount - 1);
                    const pt = new THREE.Vector3().lerpVectors(startPos, endPos, frac);
                    if (i > 0 && i < ptCount - 1) {
                        pt.x += (Math.random() - 0.5) * 0.22;
                        pt.y += (Math.random() - 0.5) * 0.22;
                        pt.z += (Math.random() - 0.5) * 0.22;
                    }
                    corePts.push(pt.clone().sub(startPos));
                }
                if (this._sharedBoltSegGeo) {
                    for (let i = 0; i < corePts.length - 1; i++) {
                        const p0 = corePts[i];
                        const p1 = corePts[i + 1];
                        const segLen = p0.distanceTo(p1);
                        if (segLen > 0.005) {
                            const segMesh = new THREE.Mesh(this._sharedBoltSegGeo, boltSegMat);
                            segMesh.position.copy(p0);
                            segMesh.lookAt(p1);
                            segMesh.scale.set(1.15, 1.15, segLen);
                            group.add(segMesh);
                        }
                    }
                }
                const coreGeo = new THREE.BufferGeometry().setFromPoints(corePts);
                disposables.push(coreGeo);
                const coreLine = new THREE.Line(coreGeo, coreMat);
                group.add(coreLine);
                lines.push(coreLine);

                for (let arc = 0; arc < 3; arc++) {
                    const pts = [];
                    for (let i = 0; i < ptCount; i++) {
                        const frac = i / (ptCount - 1);
                        const pt = new THREE.Vector3().lerpVectors(startPos, endPos, frac);
                        if (i > 0 && i < ptCount - 1) {
                            pt.x += (Math.random() - 0.5) * 0.42;
                            pt.y += (Math.random() - 0.5) * 0.42;
                            pt.z += (Math.random() - 0.5) * 0.42;
                        }
                        pts.push(pt.clone().sub(startPos));
                    }
                    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
                    disposables.push(lineGeo);
                    const line = new THREE.Line(lineGeo, outerLineMat);
                    group.add(line);
                    lines.push(line);
                }

                const branchFractions = [0.30, 0.55, 0.75];
                for (let b = 0; b < branchFractions.length; b++) {
                    const frac = branchFractions[b];
                    const forkStart = new THREE.Vector3().lerpVectors(startPos, endPos, frac);
                    const branchPts = [forkStart.clone().sub(startPos)];
                    let curPt = forkStart.clone();
                    const forkDir = new THREE.Vector3(
                        (Math.random() - 0.5) * 0.8,
                        (Math.random() - 0.2) * 0.6,
                        (Math.random() - 0.5) * 0.8
                    ).normalize();
                    for (let step = 1; step <= 4; step++) {
                        curPt.addScaledVector(forkDir, 0.20);
                        curPt.x += (Math.random() - 0.5) * 0.15;
                        curPt.y += (Math.random() - 0.5) * 0.15;
                        curPt.z += (Math.random() - 0.5) * 0.15;
                        branchPts.push(curPt.clone().sub(startPos));
                    }
                    const bGeo = new THREE.BufferGeometry().setFromPoints(branchPts);
                    disposables.push(bGeo);
                    const bLine = new THREE.Line(bGeo, outerLineMat);
                    group.add(bLine);
                    lines.push(bLine);
                }

                const strikeRing = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                strikeRing.position.copy(endPos).sub(startPos);
                strikeRing.position.y += 0.02;
                group.add(strikeRing);

                this._triggerVfxFlash(endPos, colorHex, 4.5, 10.0, duration);

                onComplete = () => {
                    this.spawnDetonationDome(endPos, colorHex, 0.65, { element: 'chaos' });
                    this.spawnHitSparks(endPos, colorHex, 18, { shockRing: true, secondaryColor: 0xeeffff });
                };
            } else if (kind === 'aura') {
                duration = 0.62;
                pillarMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.42,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                ringMat = new THREE.MeshBasicMaterial({
                    color: col,
                    transparent: true,
                    opacity: 0.85,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                disposables.push(pillarMat, ringMat);

                const pillarMesh = new THREE.Mesh(this._sharedAuraCylinderGeo, pillarMat);
                group.add(pillarMesh);

                const yOffsets = [-0.35, 0.0, 0.35];
                for (const yOff of yOffsets) {
                    const rMesh = new THREE.Mesh(this._sharedShockRingGeo, ringMat);
                    rMesh.position.y = yOff;
                    group.add(rMesh);
                }

                this._triggerVfxFlash(startPos, colorHex, 3.2, 7.0, duration);
                this.spawnHitSparks(startPos, colorHex, 16);
            }

            this.activeProjectiles.push({
                kind,
                group,
                startPos: startPos.clone(),
                endPos: endPos.clone(),
                colorHex,
                elapsed: 0,
                duration,
                lines,
                mat,
                outerMat,
                innerMat,
                ringMat,
                bluntRingMat,
                bluntDomeMat,
                lanceMat,
                needleMat,
                pillarMat,
                pLight,
                dist,
                vortexRings,
                spinMeshes,
                onComplete,
                disposables
            });
            if (this.renderGovernor && typeof this.renderGovernor.wake === 'function') {
                this.renderGovernor.wake(1500);
            }
        };
    }

    root.Dungeon3DVfx = { attach: attachVfx };
    if (root.Dungeon3D) {
        attachVfx(root.Dungeon3D);
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { attach: attachVfx };
    }
})(typeof window !== 'undefined' ? window : globalThis);

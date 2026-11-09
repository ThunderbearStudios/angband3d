/**
 * YASD 3D — WebGL Per-Pixel Crest Shader & Ambient Menu Torchlight
 *
 * Renders /assets/yasd3d_logo_fast.jpg through a single GPU fragment shader that
 * operates directly on the painted pixels of the illustration (zero HTML/CSS sticker divs):
 *  1. Flame UV Advection + Blackbody Heat FBM strictly gated to warm flame pixels above
 *     the Viking helmet (with outline-protection clamping so horns, helmet, and arrow stay rock-solid).
 *  2. Per-pixel Ruby Eye Crystalline Caustics gated strictly to the red ruby facets inside the eye sockets.
 *  3. High-pass Specular Ridge Detection on the Gold Hoard, Cut Gems, and Held Amulet of Yendor,
 *     modulated by a cellular Voronoi glint field so only actual painted coin rims & gem facets catch the light.
 *  4. Sub-pixel analytical curl-noise rising embers from the crown fire.
 *  5. Subtle cursor-tracked torchlight + depth-of-field background ember motes on #main-menu-overlay.
 *
 * Instant Revert / Kill-Switch:
 *   - URL param: ?splashShader=0
 *   - Console / Runtime: window.YasdSplashShader.disable()  (or .enable())
 */
(function () {
    'use strict';

    const VERT_SRC = `
        attribute vec2 aPos;
        varying vec2 vUv;
        void main() {
            vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
            gl_Position = vec4(aPos, 0.0, 1.0);
        }
    `;

    const FRAG_SRC = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uTime;
        uniform vec2 uTexel;

        float hash21(vec2 p) {
            p = fract(p * vec2(234.34, 435.345));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
                mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
                u.y
            );
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p = rot * p * 2.03 + vec2(17.1, 31.7);
                a *= 0.5;
            }
            return v;
        }

        // Returns how strongly a sampled RGB color belongs to the warm painted flame palette
        float flameColorWeight(vec3 c) {
            float warm = c.r - c.b;
            return smoothstep(0.18, 0.48, warm) * smoothstep(0.24, 0.58, c.r);
        }

        void main() {
            vec2 uv = vUv;
            vec3 baseCol = texture2D(uTex, uv).rgb;
            vec3 col = baseCol;
            vec2 aspect = vec2(880.0 / 516.0, 1.0);

            // -----------------------------------------------------------------
            // 1. CROWN FIRE: Per-Pixel UV Advection + Upward FBM Heat Tongues
            //    Strictly gated by flame color + height above helmet dome so
            //    steel horns, helmet brow, and arrow shaft never warp.
            // -----------------------------------------------------------------
            float crownSpatial =
                smoothstep(0.35, 0.23, uv.y) *
                smoothstep(0.01, 0.07, uv.y) *
                smoothstep(0.135, 0.045, abs(uv.x - 0.478));

            float wFlame = crownSpatial * flameColorWeight(baseCol);

            if (wFlame > 0.001) {
                float t = uTime;
                // Upward-advecting domain-warped noise (in top-down UV, +t on y moves patterns UP)
                vec2 np = vec2(uv.x * 13.0, uv.y * 10.5 + t * 2.35);
                float n1 = fbm(np);
                float n2 = fbm(np + vec2(5.2, 1.3) + vec2(n1 * 1.4, t * 0.8));

                // Displacement grows toward flame tips (uv.y -> 0.06) and is 0 at helmet rim (uv.y >= 0.31)
                float tipScale = smoothstep(0.32, 0.10, uv.y);
                vec2 disp = vec2((n1 - 0.48) * 0.015, (n2 - 0.52) * 0.024) * wFlame * tipScale;

                vec3 warpedCol = texture2D(uTex, clamp(uv + disp, 0.002, 0.998)).rgb;
                // Outline-protection gate: only accept warped pixel if it is also warm flame
                float wWarped = flameColorWeight(warpedCol);
                col = mix(baseCol, warpedCol, wFlame * wWarped);

                // Travelling blackbody heat tongues rising through the flame
                float heat = fbm(vec2(uv.x * 10.0 + (n1 - 0.5) * 1.6, uv.y * 8.0 + t * 3.1));
                float coreMask = wFlame * smoothstep(0.35, 0.78, baseCol.r);
                vec3 flameBoost = vec3(1.0, 0.58, 0.14) * (heat - 0.44) * 0.42;
                vec3 whiteHot = vec3(1.0, 0.92, 0.65) * smoothstep(0.58, 0.82, heat) * 0.24;
                col += coreMask * (flameBoost + whiteHot);
            }

            // -----------------------------------------------------------------
            // 2. SUB-PIXEL RISING EMBERS (14 Curl-Noise Sparks from Crown Fire)
            // -----------------------------------------------------------------
            if (uv.x > 0.34 && uv.x < 0.62 && uv.y > 0.01 && uv.y < 0.32) {
                for (int i = 0; i < 14; i++) {
                    float fi = float(i);
                    float speed = 0.32 + 0.18 * fract(fi * 0.731);
                    float phase = fract(uTime * speed + fi * 0.173);
                    // Spawn inside the bright flame core and rise toward uv.y = 0.02
                    float spawnX = 0.425 + 0.105 * fract(fi * 0.618034);
                    float spawnY = 0.245 - 0.04 * fract(fi * 0.4142);
                    float curlX = sin(phase * 7.5 + fi * 2.1) * 0.016 * phase + cos(uTime * 1.7 + fi) * 0.005;
                    vec2 emberPos = vec2(spawnX + curlX, spawnY - phase * 0.21);
                    float d = length((uv - emberPos) * vec2(880.0, 516.0));
                    float radius = mix(2.1, 0.7, phase);
                    float spark = smoothstep(radius, 0.0, d);
                    float lifeAlpha = sin(phase * 3.14159265) * (1.0 - phase * 0.35);
                    // Blackbody cooling: white-gold at birth -> bright orange -> deep ember red
                    vec3 sparkCol = mix(vec3(1.0, 0.94, 0.68), vec3(1.0, 0.34, 0.05), smoothstep(0.15, 0.85, phase));
                    col += spark * lifeAlpha * sparkCol * 0.95;
                }
            }

            // -----------------------------------------------------------------
            // 3. RUBY EYES: Per-Pixel Crystalline Facet Caustics
            //    Strictly gated by eye socket radius AND painted ruby redness
            //    so bone skull and black eye-socket shadows stay untouched.
            // -----------------------------------------------------------------
            float dEyeL = length((uv - vec2(0.476, 0.484)) * aspect);
            float dEyeR = length((uv - vec2(0.540, 0.465)) * aspect);
            float eyeEnv = smoothstep(0.040, 0.014, min(dEyeL, dEyeR));

            if (eyeEnv > 0.001) {
                float rubyChroma = smoothstep(0.09, 0.30, baseCol.r - max(baseCol.g, baseCol.b)) * smoothstep(0.22, 0.48, baseCol.r);
                float rubyMask = eyeEnv * rubyChroma;

                // Internal faceted caustic waves travelling across the painted gemstone planes
                vec2 eyeUv = uv * vec2(165.0, 140.0);
                float cWave1 = sin(eyeUv.x + eyeUv.y * 0.85 - uTime * 2.6);
                float cWave2 = sin(eyeUv.x * 0.75 - eyeUv.y * 1.15 + uTime * 2.1);
                float facetGlint = pow(max(0.0, cWave1 * cWave2), 4.0);

                // Deep crimson breath + sharp white-rose specular facet catchlight
                float pulse = 0.5 + 0.5 * sin(uTime * 2.3 + (uv.x > 0.508 ? 0.45 : 0.0));
                float specPeak = smoothstep(0.55, 0.88, baseCol.r) * smoothstep(0.12, 0.48, baseCol.g);
                col += rubyMask * (
                    vec3(0.36, 0.03, 0.08) * pulse +
                    vec3(1.0, 0.62, 0.70) * facetGlint * (0.45 + 0.75 * specPeak)
                );
            }

            // -----------------------------------------------------------------
            // 4. HELD AMULET OF YENDOR & GOLD/GEM HOARD:
            //    High-pass per-pixel ridge & chroma detection so ONLY the
            //    actual painted coin edges, cut gem facets, and amulet filigree
            //    shimmer as torchlight caustics pass across them.
            // -----------------------------------------------------------------
            float dAmulet = length((uv - vec2(0.669, 0.484)) * aspect);
            float amuletEnv = smoothstep(0.082, 0.018, dAmulet);
            if (amuletEnv > 0.001) {
                float goldWarmth = smoothstep(0.14, 0.38, baseCol.r - baseCol.b) * smoothstep(0.32, 0.68, baseCol.r);
                float angle = atan(uv.y - 0.484, (uv.x - 0.669) * aspect.x);
                float rays = 0.5 + 0.5 * sin(angle * 6.0 - uTime * 1.8 + dAmulet * 45.0);
                float amuletPulse = 0.5 + 0.5 * sin(uTime * 2.4);
                col += amuletEnv * goldWarmth * (
                    vec3(0.28, 0.20, 0.04) * amuletPulse +
                    vec3(1.0, 0.90, 0.52) * pow(rays, 3.0) * 0.34
                );
            }

            // Treasure hoard region (coins, rubies, sapphires, emeralds around the skull & beneath scroll)
            // -----------------------------------------------------------------
            // 3. AMULET OF YENDOR & CUT GEMSTONES ONLY (ZERO TEXT / SCROLL GLITTER)
            // -----------------------------------------------------------------
            // Strictly target ONLY the 6 painted cut gemstones and the upper coin pockets above y=0.675.
            // The parchment scroll banner and "YET ANOTHER STUPID DEATH" lettering are 100% untouched.
            float g1 = exp(-dot((uv - vec2(0.304, 0.642)) / vec2(0.022, 0.028), (uv - vec2(0.304, 0.642)) / vec2(0.022, 0.028)) * 2.5);
            float g2 = exp(-dot((uv - vec2(0.310, 0.700)) / vec2(0.016, 0.020), (uv - vec2(0.310, 0.700)) / vec2(0.016, 0.020)) * 2.5);
            float g3 = exp(-dot((uv - vec2(0.680, 0.672)) / vec2(0.018, 0.024), (uv - vec2(0.680, 0.672)) / vec2(0.018, 0.024)) * 2.5);
            float g4 = exp(-dot((uv - vec2(0.662, 0.720)) / vec2(0.015, 0.018), (uv - vec2(0.662, 0.720)) / vec2(0.015, 0.018)) * 2.5);
            float g5 = exp(-dot((uv - vec2(0.298, 0.896)) / vec2(0.024, 0.028), (uv - vec2(0.298, 0.896)) / vec2(0.024, 0.028)) * 2.5);
            float g6 = exp(-dot((uv - vec2(0.706, 0.898)) / vec2(0.024, 0.028), (uv - vec2(0.706, 0.898)) / vec2(0.024, 0.028)) * 2.5);
            float gemCluster = clamp(g1 + g2 + g3 + g4 + g5 + g6, 0.0, 1.0);

            // Upper coin pile tucked strictly above the scroll ribbon (y in 0.59..0.672)
            float upperCoins = smoothstep(0.585, 0.615, uv.y) * smoothstep(0.675, 0.655, uv.y) * (
                smoothstep(0.31, 0.34, uv.x) * smoothstep(0.45, 0.42, uv.x) +
                smoothstep(0.56, 0.59, uv.x) * smoothstep(0.66, 0.63, uv.x)
            );

            float treasureZone = clamp(gemCluster + upperCoins, 0.0, 1.0);
            if (treasureZone > 0.005) {
                vec3 cN = texture2D(uTex, uv + vec2(0.0, -1.5 * uTexel.y)).rgb;
                vec3 cS = texture2D(uTex, uv + vec2(0.0,  1.5 * uTexel.y)).rgb;
                vec3 cE = texture2D(uTex, uv + vec2( 1.5 * uTexel.x, 0.0)).rgb;
                vec3 cW = texture2D(uTex, uv + vec2(-1.5 * uTexel.x, 0.0)).rgb;
                vec3 mean4 = 0.25 * (cN + cS + cE + cW);

                float luma = dot(baseCol, vec3(0.299, 0.587, 0.114));
                float meanLuma = dot(mean4, vec3(0.299, 0.587, 0.114));
                float highPass = smoothstep(0.015, 0.10, luma - meanLuma);

                float maxC = max(baseCol.r, max(baseCol.g, baseCol.b));
                float minC = min(baseCol.r, min(baseCol.g, baseCol.b));
                float sat = (maxC > 0.01) ? ((maxC - minC) / maxC) : 0.0;

                float facetMask = treasureZone * smoothstep(0.28, 0.62, luma) * smoothstep(0.25, 0.58, sat) * (0.35 + 0.65 * highPass);

                vec2 cellUv = uv * vec2(56.0, 34.0);
                vec2 cellId = floor(cellUv);
                vec2 cellLocal = fract(cellUv) - 0.5;
                float cellSeed = hash21(cellId);
                float cellSpeed = 1.4 + 1.5 * hash21(cellId + 19.3);
                float flash = pow(max(0.0, sin(uTime * cellSpeed + cellSeed * 6.2831853)), 12.0);
                float centerFalloff = smoothstep(0.46, 0.08, length(cellLocal));

                vec3 glintColor = mix(normalize(baseCol + 0.05) * 1.30, vec3(1.0, 0.96, 0.84), 0.58);
                col += facetMask * flash * centerFalloff * glintColor * 0.85;
            }

            gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
    `;

    // Offscreen WebGL shader for the Twin Alchemical HUD Vials (#hp-fill & #sp-fill)
    // Renders living alchemical blood-ruby (HP, uKind=0.0) and crystalline sapphire-aether (SP, uKind=1.0)
    // fluid currents, internal caustics, and rising micro-bubbles inside the existing DOM progress bars.
    const VIAL_FRAG_SRC = `
        precision mediump float;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uKind; // 0.0 = HP Blood Ruby, 1.0 = SP Crystalline Aether

        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
                mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
                u.y
            );
        }

        float fbm(vec2 p) {
            float v = 0.0;
            v += 0.5500 * noise(p); p *= 2.03;
            v += 0.2800 * noise(p); p *= 2.01;
            v += 0.1700 * noise(p);
            return v;
        }

        void main() {
            vec2 uv = vUv;
            float t = uTime * (uKind < 0.5 ? 0.85 : 1.05);

            // Internal fluid convection currents (swirling horizontally and rising vertically)
            vec2 flowUv = vec2(uv.x * 4.5 - t * 0.42, uv.y * 2.2 + sin(uv.x * 6.0 + t * 1.3) * 0.25);
            float current1 = fbm(flowUv);
            float current2 = fbm(flowUv * 1.7 + vec2(t * 0.65, -t * 0.48));
            float fluid = mix(current1, current2, 0.5);

            // Crystalline / alchemical caustic veins inside the liquid
            float ridge = 1.0 - abs(fluid * 2.0 - 1.0);
            float caustic = pow(clamp(ridge, 0.0, 1.0), 3.5);

            // Subtle rising micro-bubbles (4 analytical bubbles across the tube)
            float bubbles = 0.0;
            for (int i = 0; i < 4; i++) {
                float fi = float(i);
                float bx = fract(0.18 + fi * 0.23 + t * (0.06 + fi * 0.015));
                float by = fract(0.25 + fi * 0.31 + t * (0.35 + fi * 0.08));
                vec2 d = (uv - vec2(bx, by)) * vec2(6.5, 1.4);
                float r2 = dot(d, d);
                bubbles += exp(-r2 * 55.0) * 0.55;
            }

            // Cylindrical glass tube shading (darkened top/bottom edges, specular ridge at y=0.28)
            float cylinderShade = smoothstep(0.0, 0.28, uv.y) * smoothstep(1.0, 0.72, uv.y);
            float glassSpecular = exp(-pow((uv.y - 0.26) * 5.8, 2.0)) * 0.32;

            // Meniscus glow near the right edge of the fill bar (uv.x -> 1.0)
            float meniscus = smoothstep(0.84, 1.0, uv.x) * (0.55 + 0.45 * sin(t * 3.4 + uv.y * 5.0));

            vec3 col;
            if (uKind < 0.5) {
                // Blood-Ruby Alchemical Essence (HP)
                vec3 deepRuby = vec3(0.36, 0.04, 0.06);
                vec3 midCrimson = vec3(0.76, 0.12, 0.15);
                vec3 hotEmber = vec3(1.00, 0.48, 0.24);
                col = mix(deepRuby, midCrimson, smoothstep(0.22, 0.78, fluid));
                col += caustic * hotEmber * 0.42;
                col += bubbles * vec3(1.0, 0.68, 0.42);
                col += meniscus * vec3(1.0, 0.52, 0.25) * 0.48;
            } else if (uKind < 1.5) {
                // Crystalline Sapphire-Aether (SP & Music)
                vec3 deepSapphire = vec3(0.05, 0.16, 0.42);
                vec3 midCobalt = vec3(0.15, 0.44, 0.86);
                vec3 brightAether = vec3(0.48, 0.85, 1.00);
                col = mix(deepSapphire, midCobalt, smoothstep(0.22, 0.78, fluid));
                col += caustic * brightAether * 0.46;
                col += bubbles * vec3(0.72, 0.94, 1.0);
                col += meniscus * vec3(0.55, 0.90, 1.0) * 0.48;
            } else {
                // Liquid Sun-Gold Alchemical Amber (EXP & Audio Configuration Meters)
                vec3 deepBronze = vec3(0.30, 0.14, 0.03);
                vec3 moltenGold = vec3(0.86, 0.55, 0.08);
                vec3 solarSpark = vec3(1.00, 0.92, 0.52);
                col = mix(deepBronze, moltenGold, smoothstep(0.20, 0.80, fluid));
                col += caustic * solarSpark * 0.48;
                col += bubbles * vec3(1.0, 0.94, 0.62);
                col += meniscus * vec3(1.0, 0.86, 0.38) * 0.52;
            }

            col = col * (0.62 + 0.38 * cylinderShade) + vec3(glassSpecular);
            gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
    `;

    let enabled = true;
    let rafId = 0;
    let glCanvas = null;
    let gl = null;
    let prog = null;
    let uTimeLoc = null;
    let uTexelLoc = null;
    let startTime = performance.now();
    let lastStepNow = 0;
    let accumSec = 0;

    // Offscreen WebGL context for HUD HP/SP/EXP fluid vials (shared 128x20 buffer copied to 2D canvases)
    let vialGlCanvas = null;
    let vialGl = null;
    let vialProg = null;
    let vialUTimeLoc = null;
    let vialUKindLoc = null;
    let hpCanvas = null;
    let hpCtx = null;
    let spCanvas = null;
    let spCtx = null;
    let expCanvas = null;
    let expCtx = null;

    // Ambient menu & modal ember/ash particles state (no cursor tracking!)
    let splashOverlayEl = null;
    let menuEmberCanvas = null;
    let menuEmberCtx = null;
    let emberSpriteCanvas = null;
    let ashSpriteCanvas = null;
    let _lastRealmSig = '';
    let _lastTorchWarmthSig = -1;
    let _lastTorchUpdateMs = 0;
    let menuEmbers = [];

    const MODAL_IDS = [
        'main-menu-overlay',
        'pause-modal',
        'load-modal',
        'guide-modal',
        'realm-selector-modal',
        'death-modal'
    ];

    function compileShader(ctx, type, src) {
        const sh = ctx.createShader(type);
        ctx.shaderSource(sh, src);
        ctx.compileShader(sh);
        if (!ctx.getShaderParameter(sh, ctx.COMPILE_STATUS)) {
            console.warn('[SplashShader] Compile error:', ctx.getShaderInfoLog(sh));
            ctx.deleteShader(sh);
            return null;
        }
        return sh;
    }

    function setupSplashWebGL() {
        splashOverlayEl = document.getElementById('splash-overlay');
        const wrap = document.querySelector('.splash-logo-wrap.protected-crest');
        const img = wrap ? wrap.querySelector('.splash-logo-main') : null;
        if (!wrap || !img) return false;

        if (!glCanvas) {
            glCanvas = document.createElement('canvas');
            glCanvas.className = 'splash-shader-canvas';
            glCanvas.setAttribute('aria-hidden', 'true');
            wrap.appendChild(glCanvas);
        }

        const w = img.naturalWidth || 880;
        const h = img.naturalHeight || 516;
        glCanvas.width = w;
        glCanvas.height = h;

        gl = glCanvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
        if (!gl) return false;

        const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
        if (!vs || !fs) return false;

        prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn('[SplashShader] Link error:', gl.getProgramInfoLog(prog));
            return false;
        }

        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

        uTimeLoc = gl.getUniformLocation(prog, 'uTime');
        uTexelLoc = gl.getUniformLocation(prog, 'uTexel');
        gl.uniform2f(uTexelLoc, 1.0 / w, 1.0 / h);
        gl.viewport(0, 0, w, h);

        return true;
    }

    function setupHudVialsWebGL() {
        const hpFill = document.getElementById('hp-fill');
        const spFill = document.getElementById('sp-fill');
        if (!hpFill || !spFill) return false;

        if (!vialGlCanvas) {
            vialGlCanvas = document.createElement('canvas');
            vialGlCanvas.width = 128;
            vialGlCanvas.height = 20;
            vialGl = vialGlCanvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
            if (!vialGl) return false;

            const vs = compileShader(vialGl, vialGl.VERTEX_SHADER, VERT_SRC);
            const fs = compileShader(vialGl, vialGl.FRAGMENT_SHADER, VIAL_FRAG_SRC);
            if (!vs || !fs) return false;

            vialProg = vialGl.createProgram();
            vialGl.attachShader(vialProg, vs);
            vialGl.attachShader(vialProg, fs);
            vialGl.linkProgram(vialProg);
            if (!vialGl.getProgramParameter(vialProg, vialGl.LINK_STATUS)) return false;

            vialGl.useProgram(vialProg);
            const buf = vialGl.createBuffer();
            vialGl.bindBuffer(vialGl.ARRAY_BUFFER, buf);
            vialGl.bufferData(vialGl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), vialGl.STATIC_DRAW);

            const aPos = vialGl.getAttribLocation(vialProg, 'aPos');
            vialGl.enableVertexAttribArray(aPos);
            vialGl.vertexAttribPointer(aPos, 2, vialGl.FLOAT, false, 0, 0);

            vialUTimeLoc = vialGl.getUniformLocation(vialProg, 'uTime');
            vialUKindLoc = vialGl.getUniformLocation(vialProg, 'uKind');
            vialGl.viewport(0, 0, 128, 20);
        }

        if (!hpCanvas) {
            hpCanvas = document.createElement('canvas');
            hpCanvas.width = 128;
            hpCanvas.height = 20;
            hpCanvas.className = 'vial-fluid-canvas';
            hpCanvas.setAttribute('aria-hidden', 'true');
            hpFill.appendChild(hpCanvas);
            hpCtx = hpCanvas.getContext('2d');
        }

        if (!spCanvas) {
            spCanvas = document.createElement('canvas');
            spCanvas.width = 128;
            spCanvas.height = 20;
            spCanvas.className = 'vial-fluid-canvas';
            spCanvas.setAttribute('aria-hidden', 'true');
            spFill.appendChild(spCanvas);
            spCtx = spCanvas.getContext('2d');
        }

        const expFill = document.getElementById('exp-fill');
        if (expFill && !expCanvas) {
            expCanvas = document.createElement('canvas');
            expCanvas.width = 128;
            expCanvas.height = 20;
            expCanvas.className = 'vial-fluid-canvas';
            expCanvas.setAttribute('aria-hidden', 'true');
            expFill.appendChild(expCanvas);
            expCtx = expCanvas.getContext('2d');
        }

        return true;
    }

    function drawHudVials(elapsedSec) {
        if (!vialGl || !vialProg || !hpCtx || !spCtx) return;
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer && uiLayer.classList.contains('hidden')) return;

        vialGl.useProgram(vialProg);
        vialGl.uniform1f(vialUTimeLoc, elapsedSec);

        // Render HP Blood-Ruby fluid (uKind = 0.0)
        vialGl.uniform1f(vialUKindLoc, 0.0);
        vialGl.drawArrays(vialGl.TRIANGLE_STRIP, 0, 4);
        hpCtx.drawImage(vialGlCanvas, 0, 0);

        // Render SP Crystalline-Aether fluid (uKind = 1.0)
        vialGl.uniform1f(vialUKindLoc, 1.0);
        vialGl.drawArrays(vialGl.TRIANGLE_STRIP, 0, 4);
        spCtx.drawImage(vialGlCanvas, 0, 0);

        // Render EXP Liquid Sun-Gold fluid (uKind = 2.0)
        if (expCtx) {
            vialGl.uniform1f(vialUKindLoc, 2.0);
            vialGl.drawArrays(vialGl.TRIANGLE_STRIP, 0, 4);
            expCtx.drawImage(vialGlCanvas, 0, 0);
        }
    }

    const REALM_EMBER_RGB = {
        angband: [245, 175, 55],
        brogue: [251, 125, 45],
        nethack: [52, 211, 153],
        frogcomposband: [192, 132, 252],
        silq: [148, 210, 255],
        dcss: [250, 204, 45],
        hengband: [251, 113, 133],
        rogue: [245, 175, 55],
        ryod: [245, 175, 55]
    };

    function ensureEmberSprite(realm) {
        if (_lastRealmSig === realm && emberSpriteCanvas) return;
        _lastRealmSig = realm;
        if (!emberSpriteCanvas) {
            emberSpriteCanvas = document.createElement('canvas');
            emberSpriteCanvas.width = 32;
            emberSpriteCanvas.height = 32;
        }
        const sctx = emberSpriteCanvas.getContext('2d');
        sctx.clearRect(0, 0, 32, 32);
        const [r, g, b] = REALM_EMBER_RGB[realm] || REALM_EMBER_RGB.angband;
        const grad = sctx.createRadialGradient(16, 16, 0, 16, 16, 15);
        grad.addColorStop(0, 'rgba(255, 248, 220, 1)');
        grad.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, 0.85)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        sctx.fillStyle = grad;
        sctx.beginPath();
        sctx.arc(16, 16, 15, 0, Math.PI * 2);
        sctx.fill();
    }

    function ensureAshSprite() {
        if (ashSpriteCanvas) return;
        ashSpriteCanvas = document.createElement('canvas');
        ashSpriteCanvas.width = 24;
        ashSpriteCanvas.height = 24;
        const actx = ashSpriteCanvas.getContext('2d');
        const grad = actx.createRadialGradient(12, 12, 0, 12, 12, 11);
        grad.addColorStop(0, 'rgba(218, 212, 198, 0.75)');
        grad.addColorStop(0.45, 'rgba(148, 142, 132, 0.35)');
        grad.addColorStop(1, 'rgba(90, 86, 80, 0)');
        actx.fillStyle = grad;
        actx.beginPath();
        actx.arc(12, 12, 11, 0, Math.PI * 2);
        actx.fill();
    }

    function setupMenuAtmosphere() {
        const mainMenu = document.getElementById('main-menu-overlay');
        if (!mainMenu) return;

        if (!menuEmberCanvas) {
            menuEmberCanvas = document.createElement('canvas');
            menuEmberCanvas.className = 'menu-ember-backdrop-canvas';
            menuEmberCanvas.setAttribute('aria-hidden', 'true');
            mainMenu.insertBefore(menuEmberCanvas, mainMenu.firstChild);
            menuEmberCtx = menuEmberCanvas.getContext('2d');
        }

        const resize = () => {
            if (!menuEmberCanvas) return;
            menuEmberCanvas.width = window.innerWidth || 1280;
            menuEmberCanvas.height = window.innerHeight || 720;
        };
        resize();
        window.addEventListener('resize', resize, { passive: true });
        ensureAshSprite();

        menuEmbers = [];
        for (let i = 0; i < 34; i++) {
            const isAsh = i >= 22; // 22 warm rising embers + 12 slow-drifting dungeon ash motes
            menuEmbers.push({
                x: Math.random(),
                y: Math.random(),
                r: isAsh ? (2.2 + Math.random() * 3.2) : (3.2 + Math.random() * 5.8),
                vy: isAsh ? (0.00010 + Math.random() * 0.00018) : (0.00024 + Math.random() * 0.00046),
                vxPhase: Math.random() * Math.PI * 2,
                vxAmp: isAsh ? (0.00025 + Math.random() * 0.00035) : (0.00016 + Math.random() * 0.00028),
                alpha: isAsh ? (0.14 + Math.random() * 0.26) : (0.22 + Math.random() * 0.52),
                isAsh
            });
        }
    }

    function getActiveModalOverlay() {
        for (let i = 0; i < MODAL_IDS.length; i++) {
            const el = document.getElementById(MODAL_IDS[i]);
            if (el && !el.classList.contains('hidden')) {
                return el;
            }
        }
        return null;
    }

    function drawMenuEmbers(nowSec, hostModal) {
        if (!menuEmberCtx || !menuEmberCanvas || !hostModal) return;
        if (menuEmberCanvas.parentElement !== hostModal) {
            hostModal.insertBefore(menuEmberCanvas, hostModal.firstChild);
        }

        const w = menuEmberCanvas.width;
        const h = menuEmberCanvas.height;
        menuEmberCtx.clearRect(0, 0, w, h);

        const realm = (document.body && document.body.getAttribute('data-realm')) || 'angband';
        ensureEmberSprite(realm);
        ensureAshSprite();

        for (let i = 0; i < menuEmbers.length; i++) {
            const p = menuEmbers[i];
            p.y -= p.vy;
            p.x += Math.sin(nowSec * (p.isAsh ? 0.85 : 1.4) + p.vxPhase) * p.vxAmp;
            if (p.y < -0.02) {
                p.y = 1.02;
                p.x = Math.random();
            }
            if (p.x < -0.02) p.x = 1.02;
            if (p.x > 1.02) p.x = -0.02;

            const px = p.x * w;
            const py = p.y * h;
            const flicker = p.isAsh
                ? (0.78 + 0.22 * Math.sin(nowSec * 1.7 + p.vxPhase))
                : (0.62 + 0.38 * Math.sin(nowSec * 3.2 + p.vxPhase * 2.0));
            const a = p.alpha * flicker * Math.min(1, (1 - Math.abs(p.y - 0.5) * 1.75));
            if (a <= 0.02) continue;

            menuEmberCtx.globalAlpha = a;
            const sprite = p.isAsh ? ashSpriteCanvas : emberSpriteCanvas;
            menuEmberCtx.drawImage(sprite, px - p.r, py - p.r, p.r * 2, p.r * 2);
        }
        menuEmberCtx.globalAlpha = 1;
    }

    function drawSplashAt(elapsedSec) {
        if (!gl || !prog) return;
        gl.useProgram(prog);
        gl.uniform1f(uTimeLoc, elapsedSec);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function stepFrame(now) {
        if (!enabled) {
            rafId = 0;
            return;
        }
        const rawDt = lastStepNow > 0 ? (now - lastStepNow) * 0.001 : 0.016;
        lastStepNow = now;
        accumSec += Math.min(0.033, Math.max(0.001, rawDt));
        const elapsedSec = accumSec;
        const splashVisible = splashOverlayEl && !splashOverlayEl.classList.contains('hidden');

        if (splashVisible) {
            drawSplashAt(elapsedSec);
        } else {
            const activeModal = getActiveModalOverlay();
            if (activeModal) {
                drawMenuEmbers(elapsedSec, activeModal);
            }
            drawHudVials(elapsedSec);
        }

        rafId = requestAnimationFrame(stepFrame);
    }

    function boot() {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('splashShader') === '0' || localStorage.getItem('yasd_splash_shader') === '0') {
                enabled = false;
            }
        } catch (_) {}

        setupHudVialsWebGL();
        setupMenuAtmosphere();

        const img = document.querySelector('.splash-logo-main');
        const startWhenLoaded = () => {
            setupSplashWebGL();
            if (enabled && !rafId) {
                rafId = requestAnimationFrame(stepFrame);
            }
        };

        if (img && img.complete && img.naturalWidth > 0) {
            startWhenLoaded();
        } else if (img) {
            img.addEventListener('load', startWhenLoaded, { once: true });
        } else if (enabled && !rafId) {
            rafId = requestAnimationFrame(stepFrame);
        }
    }

    window.YasdSplashShader = {
        enable() {
            enabled = true;
            try { localStorage.removeItem('yasd_splash_shader'); } catch (_) {}
            if (glCanvas) glCanvas.style.display = 'block';
            if (menuEmberCanvas) menuEmberCanvas.style.display = 'block';
            if (hpCanvas) hpCanvas.style.display = 'block';
            if (spCanvas) spCanvas.style.display = 'block';
            if (!rafId) rafId = requestAnimationFrame(stepFrame);
        },
        disable() {
            enabled = false;
            try { localStorage.setItem('yasd_splash_shader', '0'); } catch (_) {}
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            if (glCanvas) glCanvas.style.display = 'none';
            if (menuEmberCanvas) menuEmberCanvas.style.display = 'none';
            if (hpCanvas) hpCanvas.style.display = 'none';
            if (spCanvas) spCanvas.style.display = 'none';
        },
        isEnabled() {
            return enabled;
        },
        renderFrame(sec) {
            const t = Number(sec) || 0;
            drawSplashAt(t);
            drawHudVials(t);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();

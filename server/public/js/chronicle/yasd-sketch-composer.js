/**
 * yasd-sketch-composer.js
 * Procedural Woodcut & Etching Scene Composer + YASD Share Card Builder.
 * Extracted from chronicle-manager.js (WS-1B) to relieve LOC pressure while
 * delivering dramatic realm architecture, creature silhouettes, and epitaph plates.
 */
(function (root) {
    'use strict';

    const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    function unwrapStatVal(v) {
        if (v === undefined || v === null) return null;
        if (typeof v === 'object') {
            const u = v.use ?? v.cur ?? v.val ?? v.top ?? v.max ?? v.base;
            return (u !== undefined && u !== null && typeof u !== 'object') ? String(u) : null;
        }
        const s = String(v);
        return s.includes('[object') ? null : s;
    }

    function parseStatNum(val, isSilqScale = false) {
        if (!val) return 10;
        const s = String(val).trim();
        if (s.includes('/')) return 22;
        const n = parseInt(s, 10);
        if (Number.isNaN(n)) return 10;
        return isSilqScale ? (n * 4) : n;
    }

    function detectHeroStatuses(p, termRowStrings, hp, hpMax, mp, mpMax, speedVal) {
        const bottomText = termRowStrings.slice(-5).join(' ');
        const fullScreenText = termRowStrings.join(' ');
        const testStatus = (re) => re.test(bottomText) || re.test(fullScreenText);
        const hpRatio = hpMax > 0 ? (hp / hpMax) : 1;

        const isPoisoned = Boolean(p.poisoned || p.status?.poisoned || p.timed?.poisoned || p.effects?.poisoned) || testStatus(/\b(Poisoned|Poison|Psn)\b/i);
        const isCut = Boolean(p.cut || p.status?.cut || p.timed?.cut || p.bleeding) || testStatus(/\b(Cut|Bleeding|Graze|Wound)\b/i);
        const isStunned = Boolean(p.stun || p.stunned || p.status?.stun) || testStatus(/\b(Stun|Stunned)\b/i);
        const isBlind = Boolean(p.blind || p.blindness || p.status?.blind) || testStatus(/\b(Blind)\b/i);
        const isConfused = Boolean(p.confused || p.status?.confused) || testStatus(/\b(Confused|Conf)\b/i);
        const isAfraid = Boolean(p.afraid || p.fear || p.status?.afraid) || testStatus(/\b(Afraid|Fear)\b/i);
        const isBlessed = Boolean(p.blessed || p.status?.blessed || p.timed?.blessed) || testStatus(/\b(Blessed|Bless)\b/i);
        const isHeroic = Boolean(p.hero || p.heroic || p.berserk || p.shero) || testStatus(/\b(Hero|Heroic|Berserk|Shero)\b/i);
        const isFast = Boolean(p.fast || p.haste || (speedVal > 0)) || testStatus(/\b(Fast|Haste|Spd)\b/i);
        const isSlow = Boolean(p.slow || (speedVal < 0)) || testStatus(/\b(Slow)\b/i);
        const isProtEvil = Boolean(p.protevil || p.prtevl) || testStatus(/\b(Protevil|PrtEvl)\b/i);
        const isShielded = Boolean(p.shield || p.shielded || p.shld) || testStatus(/\b(Shield|Shld)\b/i);
        const isStudy = Boolean(p.study) || testStatus(/\b(Study)\b/i);
        const isLowHp = hpRatio < 0.35;
        const hasHighMana = mpMax > 0 && (mp / mpMax) > 0.7;

        const statusBadges = [];
        if (isBlessed) statusBadges.push('✨ Blessed');
        if (isHeroic) statusBadges.push('🔥 Heroic');
        if (isPoisoned) statusBadges.push('☠ Poisoned');
        if (isCut) statusBadges.push('🩸 Bleeding');
        if (isFast) statusBadges.push(speedVal > 0 ? `⚡ Fast (+${speedVal})` : '⚡ Fast');
        if (isSlow) statusBadges.push(speedVal < 0 ? `🐢 Slow (${speedVal})` : '🐢 Slow');
        if (isStunned) statusBadges.push('💫 Stunned');
        if (isBlind) statusBadges.push('👁️‍🗨️ Blind');
        if (isConfused) statusBadges.push('🌀 Confused');
        if (isAfraid) statusBadges.push('😨 Afraid');
        if (isProtEvil) statusBadges.push('🛡 Prot Evil');
        if (isShielded) statusBadges.push('🛡 Shielded');
        if (isStudy) statusBadges.push('📖 Study');

        if (hpRatio >= 0.85) statusBadges.push(`🛡 Vigorous (${Math.round(hpRatio * 100)}% HP)`);
        else if (hpRatio >= 0.5) statusBadges.push(`⚔ Alert (${Math.round(hpRatio * 100)}% HP)`);
        else if (hpRatio >= 0.35) statusBadges.push(`⚠️ Weary (${Math.round(hpRatio * 100)}% HP)`);
        else statusBadges.push(`🩸 Critical (${Math.round(hpRatio * 100)}% HP)`);

        return {
            hpRatio,
            statusBadges,
            statusVisuals: { isPoisoned, isCut, isStunned, isBlind, isBlessed, isHeroic, isAfraid, isFast, isLowHp, hasHighMana }
        };
    }

    function _realmPalette(realmKey) {
        const key = String(realmKey || 'angband').toLowerCase();
        const palettes = {
            silq: { c0: '#191d28', c1: '#0e1118', c2: '#07090d', accent: '#cbd5e1', torch: 'rgba(186, 230, 253, 0.24)' },
            brogue: { c0: '#102426', c1: '#0a1618', c2: '#050b0c', accent: '#5eead4', torch: 'rgba(45, 212, 191, 0.22)' },
            hengband: { c0: '#27171a', c1: '#150c0e', c2: '#090506', accent: '#fbbf24', torch: 'rgba(251, 146, 60, 0.24)' },
            frogcomposband: { c0: '#211829', c1: '#120d18', c2: '#08050b', accent: '#e9d5ff', torch: 'rgba(216, 180, 254, 0.22)' },
            nethack: { c0: '#1d1b14', c1: '#11100b', c2: '#080705', accent: '#fcd34d', torch: 'rgba(245, 158, 11, 0.22)' },
            dcss: { c0: '#181826', c1: '#0e0e18', c2: '#06060b', accent: '#c084fc', torch: 'rgba(192, 132, 252, 0.22)' },
            rogue: { c0: '#221a12', c1: '#140f0a', c2: '#090704', accent: '#f59e0b', torch: 'rgba(251, 191, 36, 0.22)' },
            ryod: { c0: '#241812', c1: '#140c08', c2: '#0a0503', accent: '#f97316', torch: 'rgba(249, 115, 22, 0.25)' }
        };
        return palettes[key] || { c0: '#201811', c1: '#120d09', c2: '#080604', accent: '#d4af37', torch: 'rgba(245, 185, 75, 0.24)' };
    }

    function _drawBackdropArchitecture(ctx, realmKey, info, pal) {
        // Ashlar stone blocks & depth perspective ribs
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.16)';
        ctx.lineWidth = 1;
        for (let r = 0; r < 6; r++) {
            const y = 148 + r * 36;
            ctx.beginPath();
            ctx.moveTo(46, y);
            ctx.lineTo(250, y + 6);
            ctx.moveTo(518, y + 6);
            ctx.lineTo(722, y);
            ctx.stroke();
        }
        // Realm-distinct silhouette landmarks inside frame
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 215, 127, 0.28)';
        ctx.lineWidth = 1.6;
        if (realmKey === 'hengband') {
            // Shogunate torii lintel overhead
            ctx.beginPath();
            ctx.moveTo(190, 156); ctx.quadraticCurveTo(384, 166, 578, 156);
            ctx.moveTo(214, 172); ctx.lineTo(554, 172);
            ctx.moveTo(246, 158); ctx.lineTo(246, 355);
            ctx.moveTo(522, 158); ctx.lineTo(522, 355);
            ctx.stroke();
        } else if (realmKey === 'silq') {
            // Fluted Noldor pillars & pointed vault
            ctx.beginPath();
            ctx.moveTo(246, 355); ctx.lineTo(246, 200); ctx.lineTo(384, 136); ctx.lineTo(522, 200); ctx.lineTo(522, 355);
            ctx.stroke();
        } else if (realmKey === 'brogue') {
            // Subterranean crystal stalactites & water ripples
            for (const sx of [210, 278, 490, 558]) {
                ctx.beginPath();
                ctx.moveTo(sx - 10, 146); ctx.lineTo(sx, 184); ctx.lineTo(sx + 10, 146);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.ellipse(384, 344, 175, 14, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Classic Gothic dungeon arch + flanking pillars
            ctx.beginPath();
            ctx.arc(384, 224, 136, Math.PI, 0, false);
            ctx.lineTo(520, 356);
            ctx.moveTo(248, 224);
            ctx.lineTo(248, 356);
            ctx.stroke();
        }
        // Flanking Iron Torch Sconces
        for (const tx of [170, 598]) {
            ctx.fillStyle = pal.torch;
            ctx.beginPath();
            ctx.arc(tx, 205, 42, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.moveTo(tx, 188);
            ctx.quadraticCurveTo(tx + 9, 204, tx, 212);
            ctx.quadraticCurveTo(tx - 9, 204, tx, 188);
            ctx.fill();
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
            ctx.beginPath();
            ctx.moveTo(tx, 212); ctx.lineTo(tx, 244);
            ctx.stroke();
        }
        // Flagstone floor perspective lines
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.18)';
        for (let i = -4; i <= 4; i++) {
            ctx.beginPath();
            ctx.moveTo(384 + i * 34, 315);
            ctx.lineTo(384 + i * 74, 360);
            ctx.stroke();
        }
        ctx.restore();
    }

    function _drawHeroSilhouette(ctx, cx, cy, heroClass, gearText, isFallen) {
        ctx.save();
        ctx.translate(cx, cy);
        if (isFallen) {
            ctx.translate(0, 26);
            ctx.rotate(-0.42);
        }
        ctx.fillStyle = '#15100c';
        ctx.strokeStyle = 'rgba(245, 215, 127, 0.85)';
        ctx.lineWidth = 2;

        // Flowing adventurer cloak + torso
        ctx.beginPath();
        ctx.moveTo(-26, 36);
        ctx.lineTo(-14, -18);
        ctx.lineTo(14, -18);
        ctx.lineTo(22, 36);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Helm / Hood
        ctx.beginPath();
        ctx.arc(0, -30, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Class-specific weapon silhouette
        const gLow = `${heroClass || ''} ${gearText || ''}`.toLowerCase();
        ctx.beginPath();
        if (/mage|wizard|priest|cleric|mystic|necromancer|sorcerer|staff|wand/.test(gLow)) {
            ctx.moveTo(22, 34); ctx.lineTo(34, -46);
            ctx.stroke();
            ctx.fillStyle = '#fcd34d';
            ctx.beginPath(); ctx.arc(35, -49, 5, 0, Math.PI * 2); ctx.fill();
        } else if (/ranger|archer|bow/.test(gLow)) {
            ctx.arc(16, -2, 26, -Math.PI * 0.45, Math.PI * 0.45);
            ctx.stroke();
        } else {
            // Sword & Shield
            ctx.moveTo(18, 4); ctx.lineTo(48, -32);
            ctx.moveTo(16, -4); ctx.lineTo(28, 8);
            ctx.stroke();
            ctx.fillStyle = '#1f1710';
            ctx.beginPath();
            ctx.moveTo(-26, -12); ctx.lineTo(-8, -12); ctx.lineTo(-12, 12); ctx.lineTo(-17, 20); ctx.lineTo(-26, 12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    function _drawFoeArchetype(ctx, cx, cy, foeName) {
        const low = String(foeName || '').toLowerCase();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = '#1b0f10';
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
        ctx.lineWidth = 2;

        if (/dragon|wyrm|drake/.test(low)) {
            ctx.beginPath();
            ctx.moveTo(-20, 32); ctx.lineTo(-42, -38); ctx.lineTo(-6, -16);
            ctx.lineTo(28, -42); ctx.lineTo(44, -8); ctx.lineTo(18, 32);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
        } else if (/jackal|wolf|hound|dog|warg|hyena|fox/.test(low)) {
            // Prowling quadruped beast
            ctx.beginPath();
            ctx.moveTo(-34, 34); ctx.lineTo(-26, 6); ctx.lineTo(-42, -14); ctx.lineTo(-28, -24);
            ctx.lineTo(-14, -8); ctx.lineTo(26, -6); ctx.lineTo(42, -20); ctx.lineTo(30, 6); ctx.lineTo(34, 34);
            ctx.lineTo(18, 34); ctx.lineTo(14, 14); ctx.lineTo(-12, 14); ctx.lineTo(-18, 34);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
        } else if (/spider|arachnid|ant|beetle|scorpion/.test(low)) {
            ctx.beginPath(); ctx.ellipse(0, 6, 18, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            for (const dir of [-1, 1]) {
                for (let l = -1; l <= 1; l++) {
                    ctx.beginPath();
                    ctx.moveTo(dir * 12, 4 + l * 4);
                    ctx.lineTo(dir * 34, -8 + l * 10);
                    ctx.lineTo(dir * 42, 14 + l * 10);
                    ctx.stroke();
                }
            }
        } else if (/lich|wraith|ghost|skeleton|vampire|zombie|spectre/.test(low)) {
            ctx.beginPath();
            ctx.moveTo(-22, 36); ctx.lineTo(-12, -22); ctx.arc(0, -32, 12, Math.PI, 0); ctx.lineTo(14, -22); ctx.lineTo(26, 36);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#f87171';
            ctx.fillRect(-5, -34, 3, 3); ctx.fillRect(3, -34, 3, 3);
        } else if (/demon|balrog|devil|imp/.test(low)) {
            ctx.beginPath();
            ctx.moveTo(-24, 36); ctx.lineTo(-18, -20); ctx.lineTo(-34, -44); ctx.lineTo(-10, -28);
            ctx.lineTo(10, -28); ctx.lineTo(34, -44); ctx.lineTo(18, -20); ctx.lineTo(24, 36);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        } else {
            // Bulky orc / troll / goblin / dungeon foe silhouette
            ctx.beginPath();
            ctx.moveTo(-26, 36); ctx.lineTo(-22, -14); ctx.arc(0, -28, 13, Math.PI, 0);
            ctx.lineTo(22, -14); ctx.lineTo(26, 36); ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(-46, -24); ctx.stroke();
        }
        ctx.restore();
    }

    function renderMasterworkCanvasSketch(ctxData) {
        if (typeof document === 'undefined') return TRANSPARENT_GIF;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 768;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            if (!ctx) return TRANSPARENT_GIF;

            const info = ctxData || {};
            const hero = info.hero || { name: 'Adventurer', level: 1, race: 'Human', class: 'Warrior' };
            const loc = info.locationLabel || 'The Dungeons of Doom';
            const realmKey = String(info.realm || 'angband').toLowerCase();
            const realm = realmKey.toUpperCase();
            const quote = String(info.narrativeText || 'The shadows deepen around the torchlight...').replace(/\s+/g, ' ').trim();
            const allies = Array.isArray(info.visibleAllies) ? info.visibleAllies : [];
            const foes = Array.isArray(info.visibleMonsters) ? info.visibleMonsters : [];
            const pal = _realmPalette(realmKey);

            // 1. Dark Heraldic Parchment / Charcoal Engraving Plate
            const bg = ctx.createRadialGradient(384, 232, 36, 384, 240, 465);
            bg.addColorStop(0, pal.c0);
            bg.addColorStop(0.65, pal.c1);
            bg.addColorStop(1, pal.c2);
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, 768, 480);

            // Woodcut cross-hatching lines (horizontal + subtle diagonal vignette)
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.045)';
            ctx.lineWidth = 1;
            for (let y = 24; y < 456; y += 6) {
                ctx.beginPath();
                ctx.moveTo(24, y);
                ctx.lineTo(744, y + ((y % 12 === 0) ? 2 : -2));
                ctx.stroke();
            }

            // Double Gilded Folio Frame
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.72)';
            ctx.lineWidth = 2;
            ctx.strokeRect(18, 18, 732, 444);
            ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
            ctx.lineWidth = 1;
            ctx.strokeRect(26, 26, 716, 428);

            // Ambient torchlight aura
            const archGlow = ctx.createRadialGradient(384, 224, 16, 384, 224, 200);
            archGlow.addColorStop(0, pal.torch);
            archGlow.addColorStop(0.55, 'rgba(180, 95, 30, 0.08)');
            archGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = archGlow;
            ctx.beginPath();
            ctx.arc(384, 224, 200, 0, Math.PI * 2);
            ctx.fill();

            _drawBackdropArchitecture(ctx, realmKey, info, pal);

            // Header Crest & Location
            ctx.textAlign = 'center';
            ctx.fillStyle = '#c9a050';
            ctx.font = 'bold 13px "Cinzel", Georgia, serif';
            ctx.fillText(`✦ CHRONICLE ENGRAVING • ${realm} REALM • ${loc.toUpperCase()} ✦`, 384, 60);

            // Hero Title Plate
            ctx.fillStyle = '#f5d77f';
            ctx.font = 'bold 24px "Cinzel", Georgia, serif';
            ctx.fillText(`${hero.name} — Lv.${hero.level || 1} ${hero.race || ''} ${hero.class || ''}`.trim(), 384, 98);

            const killerLabel = String(info.killedBy || (hero && hero.killedBy) || (foes[0] && foes[0].name) || 'mortal peril');
            if (info.mode === 'death') {
                ctx.fillStyle = '#e87a7a';
                ctx.font = 'bold 14px "Cinzel", Georgia, serif';
                ctx.fillText(`☠ SLAIN BY ${killerLabel.toUpperCase()} ☠`.slice(0, 82), 384, 126);
            } else if (info.mode === 'victory') {
                ctx.fillStyle = '#fde047';
                ctx.font = 'bold 14px "Cinzel", Georgia, serif';
                ctx.fillText('👑 IMMORTAL ASCENSION OF THE REALM 👑', 384, 126);
            } else if (allies.length > 0 || foes.length > 0) {
                ctx.fillStyle = '#d4b872';
                ctx.font = 'italic 13px Georgia, serif';
                const subParts = [];
                if (allies.length > 0) subParts.push(`🐾 Companion: ${allies.map(a => a.name).join(', ')}`);
                if (foes.length > 0) subParts.push(`⚔ Encounter: ${foes.map(f => f.name).join(', ')}`);
                ctx.fillText(subParts.join('  •  ').slice(0, 82), 384, 124);
            }

            // Procedural Woodcut Scene Silhouettes inside Archway
            const gearStr = Array.isArray(info.gearBadges) ? info.gearBadges.join(' ') : '';
            const primaryFoe = info.mode === 'death' ? killerLabel : (foes[0] ? foes[0].name : '');
            if (primaryFoe) {
                _drawHeroSilhouette(ctx, 312, 272, hero.class, gearStr, info.mode === 'death');
                _drawFoeArchetype(ctx, 456, 270, primaryFoe);
                // Clash spark lines between hero and foe
                ctx.strokeStyle = info.mode === 'death' ? 'rgba(248, 113, 113, 0.72)' : 'rgba(251, 191, 36, 0.65)';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(366, 232); ctx.lineTo(402, 258);
                ctx.moveTo(398, 226); ctx.lineTo(368, 260);
                ctx.stroke();
            } else {
                _drawHeroSilhouette(ctx, 384, 272, hero.class, gearStr, false);
                if (info.mode === 'victory') {
                    ctx.fillStyle = '#fde047';
                    ctx.font = 'bold 26px "Cinzel", Georgia, serif';
                    ctx.fillText('👑', 384, 212);
                }
            }

            // Narrative Inscription Footer
            ctx.fillStyle = '#e5d5b5';
            ctx.font = 'italic 15px Georgia, serif';
            const maxChars = 76;
            const l1 = quote.slice(0, maxChars);
            const l2 = quote.length > maxChars ? quote.slice(maxChars, maxChars * 2 - 3) + (quote.length > maxChars * 2 - 3 ? '...' : '') : '';
            ctx.fillText(`“${l1}${l2 ? '' : '”'}`, 384, 392);
            if (l2) ctx.fillText(`${l2}”`, 384, 416);

            return canvas.toDataURL('image/jpeg', 0.88);
        } catch (_) {
            return TRANSPARENT_GIF;
        }
    }

    async function downloadYasdShareCard(manager, frame, customCtx = null, customSketchSrc = null) {
        if (typeof document === 'undefined') return;
        const activeFrame = frame || (manager && manager.lastFrame) || {};
        const p = activeFrame.player || {};
        const ctxData = customCtx || (manager && (manager._lastDeathCtx || manager._lastActiveSketchCtx)) ||
            (manager ? manager.buildHeroSketchContext(null, { mode: p.winner ? 'victory' : (p.dead ? 'death' : 'action'), frame: activeFrame }) : {});
        const sketchSrc = customSketchSrc || (ctxData.mode === 'action' ? (manager && manager._lastActiveSketchUrl) : (manager && (manager._lastDeathSketchUrl || manager._preWarmedDeathUrl))) || null;
        const isActionScene = (ctxData.mode === 'action');

        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 630;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bg = ctx.createLinearGradient(0, 0, 1200, 630);
        bg.addColorStop(0, '#140f0a');
        bg.addColorStop(0.5, '#0b0805');
        bg.addColorStop(1, '#18110a');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1200, 630);

        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 3;
        ctx.strokeRect(16, 16, 1168, 598);
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(24, 24, 1152, 582);

        try {
            const loadBadge = (src) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
            const [yBadge, tbBadge] = await Promise.all([loadBadge('/assets/yasd3d_badge.png'), loadBadge('/assets/thunderbear_logo.png')]);
            if (yBadge && yBadge.width > 1) ctx.drawImage(yBadge, 44, 28, 25, 34);
            if (tbBadge && tbBadge.width > 1) ctx.drawImage(tbBadge, 1130, 28, 26, 34);
        } catch (_) {}

        ctx.fillStyle = '#f5d77f';
        ctx.font = 'bold 16px "Cinzel", Georgia, serif';
        ctx.textAlign = 'left';
        ctx.fillText(isActionScene ? 'YASD 3D • LIVING CHRONICLE SCENE (yasd3d.com)' : 'YASD 3D • YET ANOTHER STUPID DEATH (yasd3d.com)', 76, 52);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#c9a050';
        ctx.font = 'bold 13px "Cinzel", Georgia, serif';
        ctx.fillText('POWERED BY YENDOR ENGINE™ • THUNDERBEAR STUDIOS™', 1122, 52);

        ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
        ctx.beginPath();
        ctx.moveTo(44, 68);
        ctx.lineTo(1156, 68);
        ctx.stroke();

        if (sketchSrc) {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve;
                    img.src = sketchSrc;
                });
                if (img.width > 0) {
                    ctx.save();
                    ctx.strokeStyle = 'rgba(212, 175, 55, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(42, 86, 520, 496);
                    ctx.drawImage(img, 44, 88, 516, 492);
                    ctx.restore();
                }
            } catch (_) {}
        }

        const rx = 594;
        ctx.textAlign = 'left';
        if (isActionScene) {
            ctx.fillStyle = ctxData.sceneTone === 'humor' ? '#fbbf24' : (ctxData.sceneTone === 'humor_horror' ? '#c084fc' : '#f87171');
            ctx.font = 'bold 24px "Cinzel", Georgia, serif';
            ctx.fillText((ctxData.toneBadge || '🎭 DUNGEON CHRONICLE SCENE').toUpperCase(), rx, 120);
        } else {
            ctx.fillStyle = p.winner ? '#fde047' : '#f87171';
            ctx.font = 'bold 26px "Cinzel", Georgia, serif';
            ctx.fillText(p.winner ? '👑 IMMORTAL ASCENSION' : '☠ YOU HAVE PERISHED', rx, 120);
        }

        const hero = ctxData.hero || { name: 'Hero', level: 1, race: 'Human', class: 'Warrior' };
        const vitals = ctxData.vitals || {};
        ctx.fillStyle = '#fff8e1';
        ctx.font = 'bold 22px "Cinzel", Georgia, serif';
        ctx.fillText(`${hero.name} — Lv.${hero.level} ${hero.race} ${hero.class}`, rx, 156);

        ctx.fillStyle = isActionScene ? '#fde68a' : '#fca5a5';
        ctx.font = 'italic 17px Georgia, serif';
        const causeStr = isActionScene
            ? ((ctxData.notableDeeds && ctxData.notableDeeds[0]) || ctxData.storyArc || `Chronicled at ${ctxData.locationLabel}.`)
            : (p.winner ? `Ascended triumphantly from ${ctxData.locationLabel}!` : `Killed by ${ctxData.killedBy || 'mortal wounds'} at ${ctxData.locationLabel}.`);
        ctx.fillText(causeStr.slice(0, 62), rx, 188);

        ctx.fillStyle = 'rgba(28, 21, 12, 0.9)';
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
        ctx.fillRect(rx, 210, 546, 88);
        ctx.strokeRect(rx, 210, 546, 88);

        ctx.fillStyle = '#f5d77f';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`REALM: ${String(ctxData.realm || 'angband').toUpperCase()}   •   LOCATION: ${ctxData.locationLabel || 'Dungeon'}`, rx + 16, 236);
        ctx.fillStyle = '#e2d9c5';
        ctx.font = '13px monospace';
        ctx.fillText(`Gold: ${(vitals.gold || 0).toLocaleString()} AU   •   EXP: ${(vitals.exp || 0).toLocaleString()}   •   Turns: ${vitals.turn || 1}`, rx + 16, 260);
        ctx.fillText((ctxData.statBadges || []).slice(0, 6).join('  |  '), rx + 16, 284);

        ctx.fillStyle = '#f5d77f';
        ctx.font = 'bold 14px "Cinzel", Georgia, serif';
        ctx.fillText(isActionScene ? '⚔ EQUIPPED ARMS & RELICS IN SCENE' : '⚔ EQUIPPED ARMS & RELICS AT DEMISE', rx, 330);
        ctx.fillStyle = '#e2d2b5';
        ctx.font = '13px sans-serif';
        const gearList = (ctxData.gearBadges && ctxData.gearBadges.length > 0) ? ctxData.gearBadges.slice(0, 5) : ['Basic adventurer attire'];
        gearList.forEach((g, idx) => ctx.fillText(`• ${g.slice(0, 58)}`, rx + 8, 354 + idx * 22));

        ctx.fillStyle = '#d4c2a0';
        ctx.font = 'italic 14px Georgia, serif';
        const q = `“${(ctxData.narrativeText || '').replace(/\s+/g, ' ').trim().slice(0, 115)}”`;
        ctx.fillText(q, rx, 505);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('Play 9 classic roguelikes in first-person 3D at https://yasd3d.com', rx, 555);

        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && typeof canvas.toBlob === 'function' && typeof File === 'function') {
            try {
                const shareBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (shareBlob) {
                    const cleanShare = (hero.name || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    const file = new File([shareBlob], `${cleanShare}-${ctxData.realm || 'angband'}-yasd-card.png`, { type: 'image/png' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title: 'YASD 3D — Yet Another Stupid Death',
                            text: `${hero.name} (Lv.${hero.level}) in ${String(ctxData.realm || 'angband').toUpperCase()} — https://yasd3d.com`,
                            files: [file]
                        });
                    }
                }
            } catch (_) {}
        }

        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        const cleanName = (hero.name || 'hero').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        a.href = dataUrl;
        a.download = isActionScene
            ? `${cleanName}-${ctxData.realm || 'angband'}-${ctxData.sceneTone || 'scene'}-card.png`
            : `${cleanName}-${ctxData.realm || 'angband'}-yasd-card.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        let copiedToClipboard = false;
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined' && typeof canvas.toBlob === 'function') {
            try {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (blob) {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    copiedToClipboard = true;
                }
            } catch (_) {}
        }
        if (manager && typeof manager.showHudToast === 'function') {
            manager.showHudToast(
                copiedToClipboard
                    ? (isActionScene ? '⚔ Copied to Clipboard & Downloaded Scene Card (.PNG)!' : '⚔ Copied to Clipboard & Downloaded YASD Card (.PNG)!')
                    : (isActionScene ? '⚔ Downloaded Shareable Scene Card (.PNG)!' : '⚔ Downloaded Shareable YASD Memorial Card (.PNG)!')
            );
        }
    }

    const exported = { unwrapStatVal, parseStatNum, detectHeroStatuses, renderMasterworkCanvasSketch, downloadYasdShareCard };
    if (typeof module !== 'undefined' && module.exports) module.exports = exported;
    if (root) root.YasdSketchComposer = exported;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));

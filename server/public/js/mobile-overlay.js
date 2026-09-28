/**
 * Angband3D Mobile Touch Overlays Engine
 * Renders native, high-legibility touch cards and drawers for phones and tablets,
 * replacing microscopic 80-column ASCII terminal scaling with tactile touch UI.
 */

class MobileOverlay {
    /**
     * Parse character attributes and backstory from game frame (player state + terminal rows).
     * @param {Object} frame The current game frame from engine bridge.
     * @returns {Object} Parsed hero review data.
     */
    static parseHero(frame) {
        const text = (frame && frame.term && frame.term.rows)
            ? frame.term.rows.map(r => r.g || '').join('\n')
            : '';
        const lines = text.split('\n').map(l => l.trimEnd());
        const data = { stats: {}, secondary: {} };

        // Fallbacks from structured player object if available
        if (frame && frame.player) {
            const p = frame.player;
            if (p.name) data.name = p.name;
            if (p.race) data.race = p.race;
            if (p.class) data.class = p.class;
            if (p.title) data.title = p.title;
            if (p.hp !== undefined && p.hp_max !== undefined) data.hp = `${p.hp}/${p.hp_max}`;
            if (p.sp !== undefined && p.sp_max !== undefined) data.sp = `${p.sp}/${p.sp_max}`;
            if (p.ac !== undefined) data.armor = `[${p.ac}]`;
            if (p.gold !== undefined) data.gold = `${p.gold}`;
            if (p.au !== undefined) data.gold = `${p.au}`;
        }

        // Parse regex fields from terminal text for 100% fidelity with roll
        const mName = text.match(/Name\s+([A-Za-z0-9\-]+)/);
        if (mName) data.name = mName[1];

        const mRace = text.match(/Race\s+([A-Za-z\- ]+?)(?=\s{2,}|Height|INT|$)/);
        if (mRace) data.race = mRace[1].trim();

        const mClass = text.match(/Class\s+([A-Za-z\- ]+?)(?=\s{2,}|Weight|WIS|$)/);
        if (mClass) data.class = mClass[1].trim();

        const mTitle = text.match(/Title\s+([A-Za-z\- ]+?)(?=\s{2,}|Turns|DEX|$)/);
        if (mTitle) data.title = mTitle[1].trim();

        const mAge = text.match(/Age\s+([0-9]+)/);
        if (mAge) data.age = mAge[1];

        const mHeight = text.match(/Height\s+([0-9'"]+)/);
        if (mHeight) data.height = mHeight[1];

        const mWeight = text.match(/Weight\s+([0-9a-z ]+?)(?=\s{2,}|WIS|$)/);
        if (mWeight) data.weight = mWeight[1].trim();

        const mHP = text.match(/HP\s+([0-9\/]+)/);
        if (mHP) data.hp = mHP[1];

        const mSP = text.match(/SP\s+([0-9\/]+)/);
        if (mSP) data.sp = mSP[1];

        const mArmor = text.match(/Armor\s+(\[[^\]]+\])/);
        if (mArmor) data.armor = mArmor[1];

        const mMelee = text.match(/Melee\s+([^\s]+)/);
        if (mMelee) data.melee = mMelee[1];

        const mMeleeHit = text.match(/Melee.*?[\r\n]+.*?To-hit\s+([^\s]+)/);
        if (mMeleeHit) data.meleeHit = mMeleeHit[1];

        const mBlows = text.match(/Blows\s+([^\s]+)/);
        if (mBlows) data.blows = mBlows[1].replace(/\/turn.*$/i, '');

        const mShootDam = text.match(/Shoot to-dam\s+([^\s]+)/);
        if (mShootDam) data.shootDam = mShootDam[1];

        const mShootHit = text.match(/Shoot to-dam.*?[\r\n]+.*?To-hit\s+([^\s]+)/);
        if (mShootHit) data.shootHit = mShootHit[1];

        const mSpeed = text.match(/Speed\s+([^\s]+)/);
        if (mSpeed) data.speed = mSpeed[1];

        const mGold = text.match(/Gold\s+([0-9]+)/);
        if (mGold) data.gold = mGold[1];

        // 5 Core Stats (STR, INT, WIS, DEX, CON)
        for (const s of ['STR', 'INT', 'WIS', 'DEX', 'CON']) {
            const re = new RegExp(s + '(?:\\s*:\\s*|\\s+)([0-9\\/]+)(?:\\s+([+-]?[0-9]+)\\s+([+-]?[0-9]+)\\s+([+-]?[0-9]+)\\s+([0-9\\/]+))?', 'i');
            const m = text.match(re);
            if (m) {
                data.stats[s] = {
                    val: m[1],
                    rb: m[2] || '+0',
                    cb: m[3] || '+0',
                    eb: m[4] || '+0',
                    best: m[5] || m[1]
                };
            } else if (frame && frame.player && frame.player.stats && frame.player.stats[s.toLowerCase()]) {
                const ps = frame.player.stats[s.toLowerCase()];
                data.stats[s] = {
                    val: String(ps.cur || ps.max || ps || '--'),
                    rb: '+0', cb: '+0', eb: '+0', best: String(ps.max || ps || '--')
                };
            }
        }

        // Secondary abilities & skills
        const mSave = text.match(/Saving Throw\s+([^\s]+)/);
        if (mSave) data.secondary.savingThrow = mSave[1];

        const mStealth = text.match(/Stealth\s+([^\s]+)/);
        if (mStealth) data.secondary.stealth = mStealth[1];

        const mDisarmP = text.match(/Disarm - phys\.\s+([^\s]+)/);
        if (mDisarmP) data.secondary.disarmPhys = mDisarmP[1];

        const mDisarmM = text.match(/Disarm - magic\s+([^\s]+)/);
        if (mDisarmM) data.secondary.disarmMagic = mDisarmM[1];

        const mMagicDev = text.match(/Magic Devices\s+([^\s]+)/);
        if (mMagicDev) data.secondary.magicDevices = mMagicDev[1];

        const mSearch = text.match(/Searching\s+([^\s]+)/);
        if (mSearch) data.secondary.searching = mSearch[1];

        const mInfra = text.match(/Infravision\s+([0-9]+\s*ft)/);
        if (mInfra) data.secondary.infravision = mInfra[1];

        // Extract Lore / Backstory paragraphs
        const loreLines = [];
        let capturingLore = false;
        for (const line of lines) {
            if (line.includes('Your ') || line.includes('You are') || line.includes('You were') || line.includes('You grew up') || line.includes('You have')) {
                capturingLore = true;
            }
            if (capturingLore) {
                if (line.includes('ESC') || line.includes('continue') || line.includes('---') || line.includes('start over')) break;
                const trimmed = line.trim();
                if (trimmed) loreLines.push(trimmed);
            }
        }
        data.backstory = loreLines.join(' ');

        return data;
    }

    /**
     * Render the Rich Native Hero Review Card into the given container.
     * @param {Object} frame Game frame.
     * @param {HTMLElement} container The DOM element to populate.
     * @param {Object} actions Callbacks: { onReroll, onCustom, onAccept, onBack }.
     */
    static renderHeroReviewCard(frame, container, actions = {}) {
        if (!container) return;
        container.style.display = 'flex';
        const hero = this.parseHero(frame);

        const heroSig = `${hero.name}|${hero.race}|${hero.class}|${hero.hp}|${hero.sp}|${hero.armor}|${hero.stats.STR ? hero.stats.STR.val : ''}`;
        if (container._lastHeroSig === heroSig) {
            return;
        }
        container._lastHeroSig = heroSig;

        const statNames = [
            { key: 'STR', label: 'Strength' },
            { key: 'INT', label: 'Intelligence' },
            { key: 'WIS', label: 'Wisdom' },
            { key: 'DEX', label: 'Dexterity' },
            { key: 'CON', label: 'Constitution' }
        ];

        let statsHtml = '';
        for (const s of statNames) {
            const st = hero.stats[s.key] || { val: '--', rb: '+0', cb: '+0', best: '--' };
            statsHtml += `
                <div class="m-hero-stat-card">
                    <div class="m-stat-top">
                        <span class="m-stat-key">${s.key}</span>
                        <span class="m-stat-val">${st.val}</span>
                    </div>
                    <div class="m-stat-bot">
                        <span class="m-stat-mod" title="Racial Bonus">Race ${st.rb}</span>
                        <span class="m-stat-best" title="Best Possible Roll">Best ${st.best}</span>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="m-hero-card-inner">
                <!-- Header Banner -->
                <div class="m-hero-header">
                    <div class="m-hero-avatar-wrap">
                        <div class="m-hero-avatar">🧙</div>
                    </div>
                    <div class="m-hero-title-group">
                        <div class="m-hero-name">${hero.name || 'Hero of Angband'}</div>
                        <div class="m-hero-meta">
                            <span class="m-meta-badge m-race-badge">${hero.race || 'Human'}</span>
                            <span class="m-meta-badge m-class-badge">${hero.class || 'Warrior'}</span>
                            <span class="m-meta-badge m-title-badge">${hero.title || 'Novice'}</span>
                        </div>
                    </div>
                </div>

                <!-- Vitals Pills -->
                <div class="m-hero-vitals-row">
                    <div class="m-vital-pill m-vital-hp">
                        <span class="m-vital-lbl">❤️ HP</span>
                        <span class="m-vital-val">${hero.hp || '15/15'}</span>
                    </div>
                    <div class="m-vital-pill m-vital-sp">
                        <span class="m-vital-lbl">✨ SP</span>
                        <span class="m-vital-val">${hero.sp || '0/0'}</span>
                    </div>
                    <div class="m-vital-pill m-vital-ac">
                        <span class="m-vital-lbl">🛡 ARMOR</span>
                        <span class="m-vital-val">${hero.armor || '[0]'}</span>
                    </div>
                    <div class="m-vital-pill m-vital-spd">
                        <span class="m-vital-lbl">⚡ SPEED</span>
                        <span class="m-vital-val">${hero.speed || 'Normal'}</span>
                    </div>
                </div>

                <!-- Attributes 5-Tile Grid -->
                <div class="m-section-label">ATTRIBUTES</div>
                <div class="m-hero-stat-grid">
                    ${statsHtml}
                </div>

                <!-- Combat & Secondary Abilities -->
                <div class="m-section-label">COMBAT & EXPLORATION</div>
                <div class="m-hero-combat-grid">
                    <div class="m-combat-chip"><span class="m-chip-lbl">Melee:</span> <span class="m-chip-val">${hero.melee || '1d1'} (${hero.blows || '1.0'}/turn)</span></div>
                    <div class="m-combat-chip"><span class="m-chip-lbl">Saving Throw:</span> <span class="m-chip-val">${hero.secondary.savingThrow || '30%'}</span></div>
                    <div class="m-combat-chip"><span class="m-chip-lbl">Stealth:</span> <span class="m-chip-val">${hero.secondary.stealth || 'Normal'}</span></div>
                    <div class="m-combat-chip"><span class="m-chip-lbl">Disarm:</span> <span class="m-chip-val">${hero.secondary.disarmPhys || '30%'}</span></div>
                    <div class="m-combat-chip"><span class="m-chip-lbl">Magic Devices:</span> <span class="m-chip-val">${hero.secondary.magicDevices || '25'}</span></div>
                    <div class="m-combat-chip"><span class="m-chip-lbl">Infravision:</span> <span class="m-chip-val">${hero.secondary.infravision || '0 ft'}</span></div>
                </div>

                <!-- Backstory Lore Box -->
                ${hero.backstory ? `
                <div class="m-section-label">HERO LORE & ORIGIN</div>
                <div class="m-hero-lore-box">
                    <div class="m-lore-scroll">📜 "${hero.backstory}"</div>
                </div>
                ` : ''}

                <!-- Tactile Touch Actions Footer (48px targets) -->
                <div class="m-hero-actions-bar">
                    <button id="m-btn-reroll" class="m-action-btn m-btn-reroll">
                        <span class="m-btn-icon">🎲</span>
                        <span class="m-btn-text">Reroll (R)</span>
                    </button>
                    <button id="m-btn-custom" class="m-action-btn m-btn-custom">
                        <span class="m-btn-icon">🛠</span>
                        <span class="m-btn-text">Custom (C)</span>
                    </button>
                    <button id="m-btn-accept" class="m-action-btn m-btn-accept">
                        <span class="m-btn-icon">⚔</span>
                        <span class="m-btn-text">Accept & Play</span>
                    </button>
                    <button id="m-btn-back" class="m-action-btn m-btn-back">
                        <span class="m-btn-icon">✕</span>
                        <span class="m-btn-text">Back</span>
                    </button>
                </div>
            </div>
        `;

        // Wire high-responsiveness touch & click actions with drag rejection
        const wireFastButton = (btn, action, hapticType) => {
            if (!btn || !action) return;
            let lastTrigger = 0;
            let startX = 0;
            let startY = 0;
            let moved = false;

            const trigger = (e) => {
                const now = Date.now();
                if (now - lastTrigger < 300) return; // Prevent duplicate rapid taps
                lastTrigger = now;
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic(hapticType);
                action();
            };

            btn.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    moved = false;
                }
            }, { passive: true });

            btn.addEventListener('touchmove', (e) => {
                if (e.touches && e.touches[0]) {
                    const dx = Math.abs(e.touches[0].clientX - startX);
                    const dy = Math.abs(e.touches[0].clientY - startY);
                    if (dx > 10 || dy > 10) {
                        moved = true;
                    }
                }
            }, { passive: true });

            btn.addEventListener('touchend', (e) => {
                if (!moved) {
                    if (e.cancelable) e.preventDefault();
                    trigger(e);
                }
            }, { passive: false });

            btn.addEventListener('click', (e) => {
                trigger(e);
            });
        };

        const btnReroll = container.querySelector('#m-btn-reroll');
        const btnCustom = container.querySelector('#m-btn-custom');
        const btnAccept = container.querySelector('#m-btn-accept');
        const btnBack = container.querySelector('#m-btn-back');

        wireFastButton(btnReroll, actions.onReroll, 'light');
        wireFastButton(btnCustom, actions.onCustom, 'medium');
        wireFastButton(btnAccept, actions.onAccept, 'heavy');
        wireFastButton(btnBack, actions.onBack, 'light');
    }
}

// Global exposure
window.MobileOverlay = MobileOverlay;

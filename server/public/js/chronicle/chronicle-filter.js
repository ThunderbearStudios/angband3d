/**
 * ChronicleFilter — Narrative Significance Evaluator & Episode Action Accumulator
 * Gating 50,000+ mundane turns into 1–2 high-impact literary beats per minute.
 * Handles re-roll dormant guard, Tavern Respite, and Continuous Ballad episode batching.
 */

class ChronicleFilter {
    constructor() {
        this.lastDepth = null;
        this.lastHpPercent = 1.0;
        this.lastTurn = null;
        this.lastSeenMessages = [];
        this.pendingKills = [];
        this.seenMonsterTypes = new Set();
        this.knownUniques = new Set();
        this.recentAssailants = new Map();
        this.recentHeroAttacks = new Map();
        this.recentCreatureStates = new Map();
        this.recentFleeings = new Map();
        this.recentBizarreActions = new Map();
        this.identifiedArtifacts = new Set();
        this.lastBeatTime = 0;
        this.lastCombatActionTime = 0;
        this.MIN_BEAT_INTERVAL_MS = 12000; // 12s responsive flowing narrative interval
        this.eventQueue = [];

        this.hasCompletedOnboarding = {
            townArrival: false,
            firstStairsDown: false
        };

        // Continuous Ballad Episode Accumulator
        this.episodeAccumulator = {
            turnCount: 0,
            monstersSlain: 0,
            damageTaken: 0,
            potionsQuaffed: 0
        };
    }

    reset() {
        this.lastDepth = null;
        this.lastHpPercent = 1.0;
        this.lastTurn = null;
        this.lastSeenMessages = [];
        this.pendingKills = [];
        this.eventQueue = [];
        this.seenMonsterTypes.clear();
        this.knownUniques.clear();
        this.recentAssailants.clear();
        this.recentHeroAttacks.clear();
        this.recentCreatureStates.clear();
        this.recentFleeings.clear();
        this.recentBizarreActions.clear();
        this.identifiedArtifacts.clear();
        this.lastBeatTime = 0;
        this.lastCombatActionTime = 0;
        this.hasCompletedOnboarding.townArrival = false;
        this.hasCompletedOnboarding.firstStairsDown = false;
        this.resetEpisodeAccumulator();
    }

    resetEpisodeAccumulator() {
        this.episodeAccumulator.turnCount = 0;
        this.episodeAccumulator.monstersSlain = 0;
        this.episodeAccumulator.damageTaken = 0;
        this.episodeAccumulator.potionsQuaffed = 0;
    }

    evaluate(frame) {
        // Dormant guard: Never trigger during character creation or setup
        if (!frame || !frame.player || frame.phase !== 'play') {
            return null;
        }

        // Drain any pending sequential events in the queue
        if (this.eventQueue && this.eventQueue.length > 0) {
            this.lastBeatTime = Date.now();
            return this.eventQueue.shift();
        }

        const player = frame.player;
        const now = Date.now();
        const hpPercent = (typeof player.chp === 'number' && typeof player.mhp === 'number' && player.mhp > 0)
            ? (player.chp / player.mhp)
            : 1.0;
        const depth = (frame.map && typeof frame.map.depth === 'number')
            ? frame.map.depth
            : (player.depth || 0);

        // --- 1. MESSAGE STREAM DIFFING (Prevents Repeating Past Log Entries) ---
        const curList = (frame.messages || [])
            .map(m => (typeof m === 'string' ? m : (m.text || '')))
            .filter(s => s && s.trim().length > 0 && !s.trim().startsWith('===') && !s.trim().startsWith('---'));

        let newMsgs = [];
        if (this.lastSeenMessages.length === 0) {
            newMsgs = curList;
        } else {
            // Suffix-overlap match against prior message buffer
            let matchedOverlap = 0;
            const maxK = Math.min(this.lastSeenMessages.length, curList.length);
            for (let k = maxK; k > 0; k--) {
                let match = true;
                for (let j = 0; j < k; j++) {
                    if (this.lastSeenMessages[this.lastSeenMessages.length - k + j] !== curList[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    matchedOverlap = k;
                    break;
                }
            }
            newMsgs = curList.slice(matchedOverlap);
        }
        this.lastSeenMessages = curList;

        // --- 2. GAMEPLAY TURN ADVANCEMENT & ACCUMULATION ---
        const currentTurn = (player && typeof player.turn === 'number') ? player.turn : (frame.turn || null);
        const turnAdvanced = (currentTurn !== null && this.lastTurn !== null)
            ? (currentTurn > this.lastTurn)
            : (newMsgs.length > 0);

        if (turnAdvanced) {
            const turnDelta = (currentTurn !== null && this.lastTurn !== null) ? Math.max(1, currentTurn - this.lastTurn) : 1;
            this.episodeAccumulator.turnCount += turnDelta;
            this.lastTurn = currentTurn;
        } else if (this.lastTurn === null && currentTurn !== null) {
            this.lastTurn = currentTurn;
        }

        // Process ONLY NEW messages for events to prevent phantom re-triggers
        const attackRe = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(hits|bites|claws|crushes|touches|shoots|breathes|casts|stings|spits|engulfs|charges|gazes|wails|slashes|bashes|gores|strikes)\b/i;
        const theftRe = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(steals|tries to steal)\b/i;
        const begRe = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(?:begs you for money|asks you for money|begs for money)\b/i;
        const insultRe = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(?:insults you|mocks you|jeers at you)\b/i;
        const heroAttackRe = /^(?:You\s+)(hit|slash|crush|smite|strike|pierce|shoot|bash|missed|miss)\s+(?:the\s+)?([A-Za-z0-9\-',\s]+?)(?:\.|\!|$)/i;
        const fleeRe = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(flees in terror|runs away in panic|turns and runs|flees|panics)(?:\.|\!|$)/i;
        const bizarreRe = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(drools on you|vomits on your boots|vomits|giggles|babbles incoherently|babbles|cries out in despair|weeps|snarls|hisses|moans|howls)(?:\.|\!|$)/i;
        const stateRe = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(wakes up|falls asleep|is confused|recovers|blinks|appears unaffected)(?:\.|\!|$)/i;
        const ritualRe = /(?:You can learn (\d+) more (?:ritual|spell|prayer)s?|You feel your knowledge of (?:the arcane|rituals|prayers) expand)/i;
        const spellLearnedRe = /(?:You have learned the|You master the|You study the)\s+(prayer|spell|ritual|rune|incantation|hymn)\s+of\s+([A-Za-z0-9\-',\s]+?)(?:\.|\!|$)/i;
        const levelUpRe = /(?:Welcome to level\s+(\d+)|You are now level\s+(\d+))/i;
        const levelFeelingRe = /(?:You feel|There is|This seems)\s+(a sinister presence|like you are being watched|quiet and peaceful|a chill run down your spine|a sense of dread)/i;
        const storeRe = /(?:Welcome to|You enter)\s+(?:the\s+)?([A-Za-z0-9\-',\s]+?(?:Store|Armoury|Armory|Weaponsmith|Magic Shop|Alchemist|Temple|Black Market|Guild))(?:\.|\!|$)/i;

        const frameKills = [];
        const slainMonsterNames = new Set();

        for (const msg of newMsgs) {
            // 1. Kills
            if (msg.includes('You have slain') || msg.includes('destroyed')) {
                this.episodeAccumulator.monstersSlain++;
                frameKills.push(msg);
                this.lastCombatActionTime = now;

                // Extract monster name to prevent slain creatures from talking/attacking post-mortem
                const slainMatch = msg.match(/You have slain (?:the )?([A-Za-z0-9\-',\s]+?)(?:\s*\([x0-9]+\))?\./i);
                if (slainMatch && slainMatch[1]) {
                    slainMonsterNames.add(slainMatch[1].trim().toLowerCase());
                }
            }

            // 2. Hero Attacks (Swords, spells, bows, fists)
            const hMatch = msg.match(heroAttackRe);
            if (hMatch) {
                this.lastCombatActionTime = now;
                const act = hMatch[1].toLowerCase();
                const monName = hMatch[2].trim();
                const monLower = monName.toLowerCase();
                if (!slainMonsterNames.has(monLower)) {
                    const lastAtk = this.recentHeroAttacks.get(monLower) || 0;
                    if (now - lastAtk >= 2000) {
                        this.recentHeroAttacks.set(monLower, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        this.eventQueue.push({
                            type: 'HERO_ATTACK',
                            priority: 'normal',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                action: act,
                                message: msg,
                                glyph: monObj ? monObj.glyph : '',
                                depth: depth,
                                inTown: depth === 0
                            }
                        });
                    }
                }
            }

            // 3. Creature Fleeing (Fear, terror, retreat)
            const flMatch = msg.match(fleeRe);
            if (flMatch) {
                const monName = flMatch[1].trim();
                const monLower = monName.toLowerCase();
                if (!slainMonsterNames.has(monLower)) {
                    const lastFlee = this.recentFleeings.get(monLower) || 0;
                    if (now - lastFlee >= 4000) {
                        this.recentFleeings.set(monLower, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        this.eventQueue.push({
                            type: 'CREATURE_FLEEING',
                            priority: 'high',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                message: msg,
                                glyph: monObj ? monObj.glyph : '',
                                depth: depth
                            }
                        });
                    }
                }
            }

            // 4. Creature Bizarre Actions (Drooling, vomiting, babbling, giggling)
            const bzMatch = msg.match(bizarreRe);
            if (bzMatch) {
                const monName = bzMatch[1].trim();
                const act = bzMatch[2].toLowerCase();
                const monLower = monName.toLowerCase();
                if (!slainMonsterNames.has(monLower)) {
                    const lastBz = this.recentBizarreActions.get(monLower) || 0;
                    if (now - lastBz >= 4000) {
                        this.recentBizarreActions.set(monLower, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        this.eventQueue.push({
                            type: 'CREATURE_BIZARRE_ACTION',
                            priority: 'normal',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                action: act,
                                message: msg,
                                glyph: monObj ? monObj.glyph : '',
                                depth: depth
                            }
                        });
                    }
                }
            }

            // 5. Creature State Changes (Waking up, falling asleep, confusion)
            const stMatch = msg.match(stateRe);
            if (stMatch) {
                const monName = stMatch[1].trim();
                const state = stMatch[2].toLowerCase();
                const monLower = monName.toLowerCase();
                if (!slainMonsterNames.has(monLower)) {
                    const lastSt = this.recentCreatureStates.get(monLower) || 0;
                    if (now - lastSt >= 4000) {
                        this.recentCreatureStates.set(monLower, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        this.eventQueue.push({
                            type: 'CREATURE_STATE_CHANGE',
                            priority: 'normal',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                state: state,
                                message: msg,
                                glyph: monObj ? monObj.glyph : '',
                                depth: depth
                            }
                        });
                    }
                }
            }

            // 6. Ritual Insights
            const rMatch = msg.match(ritualRe);
            if (rMatch) {
                const count = rMatch[1] ? parseInt(rMatch[1], 10) : 1;
                this.eventQueue.push({
                    type: 'RITUAL_INSIGHT',
                    priority: 'normal',
                    isChapter: false,
                    data: {
                        count: count,
                        message: msg,
                        depth: depth
                    }
                });
            }

            // 6b. Spell / Prayer / Ritual Mastered
            const spMatch = msg.match(spellLearnedRe);
            if (spMatch) {
                const spellType = spMatch[1].toLowerCase();
                const spellName = spMatch[2].trim();
                this.eventQueue.push({
                    type: 'SPELL_LEARNED',
                    priority: 'high',
                    isChapter: true,
                    data: {
                        spellType,
                        spellName,
                        message: msg,
                        depth: depth
                    }
                });
            }

            // 6c. Character Level Up
            const lvlMatch = msg.match(levelUpRe);
            if (lvlMatch) {
                const newLevel = parseInt(lvlMatch[1] || lvlMatch[2], 10);
                this.eventQueue.push({
                    type: 'LEVEL_UP',
                    priority: 'high',
                    isChapter: true,
                    data: {
                        level: newLevel,
                        message: msg,
                        depth: depth
                    }
                });
            }

            // 7. Store Visits
            const storeMatch = msg.match(storeRe);
            if (storeMatch) {
                const storeName = storeMatch[1].trim();
                this.eventQueue.push({
                    type: 'STORE_VISIT',
                    priority: 'normal',
                    isChapter: false,
                    data: {
                        storeName: storeName,
                        message: msg,
                        depth: depth
                    }
                });
            }

            // 8. Level Feelings
            const lfMatch = msg.match(levelFeelingRe);
            if (lfMatch) {
                this.eventQueue.push({
                    type: 'LEVEL_FEELING',
                    priority: 'normal',
                    isChapter: false,
                    data: {
                        feelingText: lfMatch[1],
                        message: msg,
                        depth: depth
                    }
                });
            }

            if (msg.includes('You feel very good') || msg.includes('You quaff')) {
                this.episodeAccumulator.potionsQuaffed++;
            }

            // 9. Detect creature interactions and assaults on the player
            if (!msg.startsWith('You ') && !msg.includes('misses you')) {
                // Begging (Beggars, urchins, outcasts)
                const bMatch = msg.match(begRe);
                if (bMatch) {
                    const monName = bMatch[1].trim();
                    const monLower = monName.toLowerCase();
                    if (!slainMonsterNames.has(monLower) && (!this.recentAssailants.has(monName) || (now - this.recentAssailants.get(monName) > 8000))) {
                        this.recentAssailants.set(monName, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        this.eventQueue.push({
                            type: 'CREATURE_BEG',
                            priority: 'normal',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                message: msg,
                                glyph: monObj ? monObj.glyph : 't',
                                depth: depth
                            }
                        });
                    }
                }

                // Insults (Mercenaries, novices, drunkards)
                const iMatch = msg.match(insultRe);
                if (iMatch) {
                    const monName = iMatch[1].trim();
                    const monLower = monName.toLowerCase();
                    if (!slainMonsterNames.has(monLower) && (!this.recentAssailants.has(monName) || (now - this.recentAssailants.get(monName) > 8000))) {
                        this.recentAssailants.set(monName, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        this.eventQueue.push({
                            type: 'CREATURE_INSULT',
                            priority: 'normal',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                message: msg,
                                glyph: monObj ? monObj.glyph : 't',
                                depth: depth
                            }
                        });
                    }
                }

                // Theft (Rogues, cutpurses, bandits)
                const tMatch = msg.match(theftRe);
                if (tMatch) {
                    const monName = tMatch[1].trim();
                    const monLower = monName.toLowerCase();
                    if (!slainMonsterNames.has(monLower) && (!this.recentAssailants.has(monName) || (now - this.recentAssailants.get(monName) > 8000))) {
                        this.recentAssailants.set(monName, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        this.eventQueue.push({
                            type: 'CREATURE_THEFT',
                            priority: 'high',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                action: 'steals',
                                message: msg,
                                glyph: monObj ? monObj.glyph : 'p',
                                depth: depth
                            }
                        });
                    }
                } else if (msg.includes('purse feels lighter') || msg.includes('coins were stolen') || msg.includes('was stolen!')) {
                    const rogueMon = (frame.monsters || []).find(m => {
                        const n = (m.name || '').toLowerCase();
                        return n.includes('rogue') || n.includes('thief') || n.includes('cutpurse') || n.includes('bandit');
                    });
                    const monName = rogueMon ? rogueMon.name : 'Squint-eyed rogue';
                    if (!slainMonsterNames.has(monName.toLowerCase()) && (!this.recentAssailants.has(monName) || (now - this.recentAssailants.get(monName) > 8000))) {
                        this.recentAssailants.set(monName, now);
                        this.eventQueue.push({
                            type: 'CREATURE_THEFT',
                            priority: 'high',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                action: 'steals',
                                message: msg,
                                glyph: rogueMon ? rogueMon.glyph : 'p',
                                depth: depth
                            }
                        });
                    }
                }

                // Combat Assaults (Hits, bites, claws, spells, breath)
                const aMatch = msg.match(attackRe);
                if (aMatch) {
                    const monName = aMatch[1].trim();
                    const action = aMatch[2].toLowerCase();
                    const monLower = monName.toLowerCase();
                    if (!slainMonsterNames.has(monLower) && (!this.recentAssailants.has(monName) || (now - this.recentAssailants.get(monName) > 8000))) {
                        this.recentAssailants.set(monName, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        this.eventQueue.push({
                            type: 'CREATURE_ASSAULT',
                            priority: 'high',
                            isChapter: false,
                            data: {
                                monsterName: monName,
                                action: action,
                                message: msg,
                                glyph: monObj ? monObj.glyph : '',
                                depth: depth
                            }
                        });
                    }
                }
            }
        }

        // IMMEDIATE LOCKSTEP COMBAT EPISODES (Immediate kill narrative, zero delayed wait)
        if (frameKills.length > 0) {
            this.eventQueue.unshift({
                type: 'COMBAT_EPISODE',
                priority: 'normal',
                isChapter: false,
                data: {
                    kills: frameKills,
                    message: frameKills[0],
                    monstersSlain: frameKills.length,
                    depth,
                    accumulated: { ...this.episodeAccumulator }
                }
            });
            this.resetEpisodeAccumulator();
        }

        // Initialize lastDepth on first frame
        if (this.lastDepth === null) {
            this.lastDepth = depth;
        }

        // --- 3. IMMEDIATE HIGH-PRIORITY INTERRUPTS ---

        // Mortal Peril (HP drops below 25%)
        if (hpPercent < 0.25 && this.lastHpPercent >= 0.25) {
            this.lastHpPercent = hpPercent;
            this.lastBeatTime = now;
            return {
                type: 'MORTAL_PERIL',
                priority: 'urgent',
                isChapter: true,
                data: { hpPercent, depth, accumulated: { ...this.episodeAccumulator } }
            };
        }
        this.lastHpPercent = hpPercent;

        // Artifact Awakening Detection (Only on newly printed messages)
        for (const msg of newMsgs) {
            for (const artName of Object.keys(ChronicleGrounder.CANON_ARTIFACT_LORE)) {
                if (msg.includes(artName) && !this.identifiedArtifacts.has(artName)) {
                    this.identifiedArtifacts.add(artName);
                    this.lastBeatTime = now;
                    return {
                        type: 'ARTIFACT_AWAKENING',
                        priority: 'high',
                        isChapter: true,
                        data: { artifactName: artName, depth }
                    };
                }
            }
        }

        // Unique Boss Spotted (Line of sight)
        if (frame.monsters && frame.monsters.length > 0) {
            for (const m of frame.monsters) {
                const mName = m.name || m.race;
                if (m.is_unique && mName) {
                    this.knownUniques.add(mName);
                    if (!this.seenMonsterTypes.has(mName)) {
                        this.seenMonsterTypes.add(mName);
                        this.lastBeatTime = now;
                        return {
                            type: 'UNIQUE_SPOTTED',
                            priority: 'high',
                            isChapter: true,
                            data: { monster: { ...m, name: mName }, depth }
                        };
                    }
                }
            }
        }

        // Check for Unique Boss slayings in pending kills
        if (this.pendingKills.length > 0 && this.knownUniques.size > 0) {
            for (let i = 0; i < this.pendingKills.length; i++) {
                const kMsg = this.pendingKills[i];
                for (const uName of this.knownUniques) {
                    if (kMsg.includes(uName)) {
                        this.pendingKills.splice(i, 1);
                        this.lastBeatTime = now;
                        return {
                            type: 'UNIQUE_SLAIN',
                            priority: 'high',
                            isChapter: true,
                            data: { name: uName, message: kMsg, depth }
                        };
                    }
                }
            }
        }

        // --- 4. ONBOARDING MILESTONES (MAJOR CHAPTER MILESTONES) ---

        // Town Arrival (First time spawn at Depth 0)
        if (depth === 0 && !this.hasCompletedOnboarding.townArrival) {
            this.hasCompletedOnboarding.townArrival = true;
            this.lastDepth = 0;
            this.lastBeatTime = now;
            return {
                type: 'ONBOARDING_TOWN_ARRIVAL',
                priority: 'normal',
                isChapter: true,
                data: { player }
            };
        }

        // First Descent (First time taking stairs down to 50ft)
        if (depth > 0 && !this.hasCompletedOnboarding.firstStairsDown) {
            this.hasCompletedOnboarding.firstStairsDown = true;
            this.lastDepth = depth;
            this.lastBeatTime = now;
            return {
                type: 'ONBOARDING_FIRST_DESCENT',
                priority: 'normal',
                isChapter: true,
                data: { depth, player }
            };
        }

        // --- 5. FLOOR CHANGES & TAVERN RESPITE (MAJOR CHAPTER MILESTONES) ---

        if (depth !== this.lastDepth) {
            const oldDepth = this.lastDepth;
            this.lastDepth = depth;
            this.lastBeatTime = now;

            // Tavern Respite: Returned from deep to Town (Depth 0)
            if (oldDepth > 0 && depth === 0) {
                return {
                    type: 'TAVERN_RESPITE',
                    priority: 'normal',
                    isChapter: true,
                    data: { oldDepth, player }
                };
            }

            // Normal Floor Change deeper or shallower
            return {
                type: 'FLOOR_CHANGE',
                priority: 'normal',
                isChapter: true,
                data: { oldDepth, newDepth: depth, feeling: frame.map ? frame.map.feeling : 0 }
            };
        }

        // --- 6. DRAIN PENDING SEQUENTIAL EVENTS IN QUEUE ---
        if (this.eventQueue && this.eventQueue.length > 0) {
            this.lastBeatTime = now;
            return this.eventQueue.shift();
        }

        // --- 7. FLOWING EXPLORATION PASSAGES (CONTINUOUS AMBIENT CHRONICLE) ---
        if (now - this.lastBeatTime >= 16000) {
            // Only trigger an exploration passage if real movement/action occurred
            if (this.episodeAccumulator.turnCount >= 20 || this.episodeAccumulator.potionsQuaffed > 0) {
                this.lastBeatTime = now;
                const event = {
                    type: 'EXPLORATION_FLOW',
                    priority: 'low',
                    isChapter: false,
                    data: { depth, accumulated: { ...this.episodeAccumulator } }
                };
                this.resetEpisodeAccumulator();
                return event;
            }
        }

        return null;
    }
}

if (typeof window !== 'undefined') {
    window.ChronicleFilter = ChronicleFilter;
}

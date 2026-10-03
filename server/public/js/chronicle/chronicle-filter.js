/**
 * ChronicleFilter — Narrative Significance Evaluator & Episode Action Accumulator
 * Gating 50,000+ mundane turns into 1–2 high-impact literary beats per minute.
 * Handles re-roll dormant guard, Tavern Respite, and Continuous Ballad episode batching.
 */

// Static compiled RegExp constants (hoisted to module scope to eliminate thousands of per-frame heap allocations)
const RE_ATTACK = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(hits|bites|claws|crushes|touches|shoots|breathes|casts|stings|spits|engulfs|charges|gazes|wails|slashes|bashes|gores|strikes)\b/i;
const RE_THEFT = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(steals|tries to steal)\b/i;
const RE_BEG = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(?:begs you for money|asks you for money|begs for money)\b/i;
const RE_INSULT = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(?:insults you|mocks you|jeers at you)\b/i;
const RE_HERO_ATTACK = /^(?:You\s+)(hit|slash|crush|smite|strike|pierce|shoot|bash|missed|miss)\s+(?:the\s+)?([A-Za-z0-9\-',\s]+?)(?:\.|\!|$)/i;
const RE_MON_PAIN = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(?:screams? in (?:agony|pain)|shrieks? in (?:agony|pain)|cr(?:ies|y) out in pain|howls? in (?:agony|pain)|writhes? in agony|grunts? with pain|flinches?|quivers? in pain|squelches?|hisses? in (?:pain|agony)|jerks? in (?:agony|pain)|twitches? in pain|yelps? in pain|squeals? in pain)(?:\.|\!|$)/i;
const RE_FLEE = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(flees in terror|runs away in panic|turns and runs|flees|panics)(?:\.|\!|$)/i;
const RE_BIZARRE = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(drools on you|vomits on your boots|vomits|giggles|babbles incoherently|babbles|cries out in despair|weeps|snarls|hisses|moans|howls)(?:\.|\!|$)/i;
const RE_STATE = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(wakes up|falls asleep|is confused|recovers|blinks|appears unaffected)(?:\.|\!|$)/i;
const RE_RITUAL = /(?:You can learn (\d+) more (?:ritual|spell|prayer)s?|You feel your knowledge of (?:the arcane|rituals|prayers) expand)/i;
const RE_SPELL_LEARNED = /(?:You have learned the|You master the|You study the)\s+(prayer|spell|ritual|rune|incantation|hymn)\s+of\s+([A-Za-z0-9\-',\s]+?)(?:\.|\!|$)/i;
const RE_LEVEL_UP = /(?:Welcome to level\s+(\d+)|You are now level\s+(\d+))/i;
const RE_LEVEL_FEELING = /(?:Omens of death haunt this place|This place seems (?:murderous|terribly dangerous|reasonably safe)|This place does not seem too risky|This seems a (?:tame,?\s*sheltered place|quiet,?\s*peaceful place)|You are still uncertain about this place|You feel (?:anxious|nervous) about this place|Looks like any other level|You feel that (?:you sense|there are|there may|there is naught)|a sinister presence|like you are being watched|a chill run down your spine|a sense of dread)/i;
const RE_STORE = /(?:Welcome to|You enter)\s+(?:the\s+)?([A-Za-z0-9\-',\s]+?(?:Store|Armoury|Armory|Weaponsmith|Weapon Smith|Magic Shop|Alchemist|Temple|Black Market|Guild))(?:\.|\!|$)/i;
const RE_STORE_BUY = /^You bought\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)\s+for\s+(\d+)\s+gold(?:\.|\!|$)/i;
const RE_STATUS = /^(?:You\s+)(are\s+(?:confused|poisoned|blind|blinded|stunned|heavily stunned|knocked out|paralyzed|terrified|bleeding|mortally wounded)|feel\s+(?:confused|very sick|unreal|strange|sluggish|fast|your life draining away|very weak|clumsy)|cannot\s+(?:see|move)|panic)\b/i;
const RE_STATUS_RECOVERY = /(?:You are no longer (?:confused|poisoned|blind|stunned|terrified)|You can see again|You feel your strength returning)/i;
const RE_SLAIN = /You have slain (?:the )?([A-Za-z0-9\-',\s]+?)(?:\s*\([x0-9]+\))?\./i;
const RE_MON_DIES = /^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(?:dies|is destroyed|crumbles into dust|dissolves|perishes)(?:\.|\!|$)/i;
const RE_EXCAVATE = /(?:You have removed the rubble|You have cleared a path through the rubble|You have finished digging a tunnel|You tunnel into the (?:granite wall|magma vein|quartz vein)|You dig in the (?:rubble|granite wall|magma vein|quartz vein))/i;
const RE_TREASURE = /(?:You have found|You find|You pick up)\s+(\d+)\s+gold pieces worth of\s+([A-Za-z0-9\-',\s]+?)(?:\.|\!|$)/i;
const RE_CHEST = /(?:You have found|You see)\s+(?:a\s+|an\s+)?([A-Za-z0-9\-',\s]+?chest)(?:\.|\!|$)/i;
const RE_DUNGEON_FEATURE = /(?:You have found a (?:trap|secret door)|You have disarmed the trap|You pick the lock|The door is locked|You bash open the door|You kick open the door|You bash the door open|You kick the door open)/i;
const RE_CLEAN_PARENS = /\s*\([^)]*\)/g;
const RE_CLEAN_BRACKETS = /\s*\[[^\]]*\]/g;

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

        this.lastVisitedStore = null;

        // Continuous Ballad Episode Accumulator
        this.episodeAccumulator = {
            turnCount: 0,
            monstersSlain: 0,
            damageTaken: 0,
            potionsQuaffed: 0
        };
        this.hasRecordedDeath = false;
    }

    reset() {
        this.hasRecordedDeath = false;
        this.lastDepth = null;
        this.lastHpPercent = 1.0;
        this.lastTurn = null;
        this.lastSeenMessages = [];
        this.lastVisitedStore = null;
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
        this._lastConfused = false;
        this._lastPoisoned = false;
        this._lastBlind = false;
        this._lastStun = false;
        this._lastCut = false;
        this._lastExcavationTime = 0;
        this._lastTreasureTime = 0;
        this._lastLevelFeelingTime = 0;
        this._lastFeatureTime = 0;
        this.resetEpisodeAccumulator();
    }

    resetEpisodeAccumulator() {
        this.episodeAccumulator.turnCount = 0;
        this.episodeAccumulator.monstersSlain = 0;
        this.episodeAccumulator.damageTaken = 0;
        this.episodeAccumulator.potionsQuaffed = 0;
    }

    evaluate(frame) {
        // Dormant guard: Never trigger during birth or initial setup
        if (!frame || !frame.player || (frame.phase !== 'play' && frame.phase !== 'death')) {
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

        // --- 0. HERO DEATH & DEMISE (Highest Priority Terminal Event) ---
        const isDead = Boolean(
            (player && player.dead) ||
            frame.phase === 'death' ||
            (player && typeof player.chp === 'number' && player.chp <= 0 && player.mhp > 0) ||
            newMsgs.some(m => /\byou die\b|\byou have died\b|\bkilled by\b|\bslain by\b/i.test(m))
        );

        if (isDead) {
            if (!this.hasRecordedDeath) {
                this.hasRecordedDeath = true;
                this.lastBeatTime = now;
                let diedFrom = (player && player.died_from) ? String(player.died_from).trim() : '';
                if (!diedFrom) {
                    const deathMsg = newMsgs.find(m => /\b(killed by|slain by|died of|destroyed by)\b/i.test(m));
                    if (deathMsg) {
                        const match = deathMsg.match(/\b(?:killed by|slain by|died of|destroyed by)\s+(.+?)(?:\.|$)/i);
                        if (match && match[1]) diedFrom = match[1].trim();
                    }
                }
                if (!diedFrom) diedFrom = 'succumbing to mortal wounds';

                return {
                    type: 'HERO_DEATH',
                    isChapter: true,
                    importance: 100,
                    priority: 1000,
                    turn: currentTurn || 0,
                    data: {
                        hero: player.name || 'The Hero',
                        race: player.race || 'Hero',
                        class: player.class || 'Adventurer',
                        level: player.clev || 1,
                        depth: depth,
                        diedFrom: diedFrom,
                        turn: currentTurn || 0,
                        messages: newMsgs
                    }
                };
            }
            // Once death is captured, suppress any subsequent action events for this life
            return null;
        }

        // Process ONLY NEW messages for events to prevent phantom re-triggers
        // (Using module-scoped static regexes for zero-allocation performance)
        const attackRe = RE_ATTACK;
        const theftRe = RE_THEFT;
        const begRe = RE_BEG;
        const insultRe = RE_INSULT;
        const heroAttackRe = RE_HERO_ATTACK;
        const fleeRe = RE_FLEE;
        const bizarreRe = RE_BIZARRE;
        const stateRe = RE_STATE;
        const ritualRe = RE_RITUAL;
        const spellLearnedRe = RE_SPELL_LEARNED;
        const levelUpRe = RE_LEVEL_UP;
        const levelFeelingRe = RE_LEVEL_FEELING;
        const storeRe = RE_STORE;
        const storeBuyRe = RE_STORE_BUY;
        const statusRe = RE_STATUS;

        const frameKills = [];
        const frameHeroAttacks = [];
        const frameIncomingAttacks = [];
        const framePlayerStatuses = [];
        const slainMonsterNames = new Set();

        // Expand compound Angband messages (e.g. "The small kobold screams in agony. The small kobold flees in terror!")
        const expandedMsgs = [];
        for (const rawMsg of newMsgs) {
            if (rawMsg.includes('. ') || rawMsg.includes('! ')) {
                const parts = rawMsg.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
                expandedMsgs.push(...parts);
            } else {
                expandedMsgs.push(rawMsg);
            }
        }

        for (const msg of expandedMsgs) {
            // 1. Kills & Slayings (Dies, destroyed, dissolved, crumbled, slain)
            const diesMatch = msg.match(RE_MON_DIES);
            const slainMatch = msg.match(RE_SLAIN);
            const isKill = diesMatch || slainMatch || msg.includes('You have slain') || msg.includes('destroyed') || /\bdies(?:\.|\!|$)/i.test(msg);
            if (isKill) {
                this.episodeAccumulator.monstersSlain++;
                frameKills.push(msg);
                this.lastCombatActionTime = now;

                let mName = null;
                if (diesMatch && diesMatch[1]) mName = diesMatch[1].trim();
                else if (slainMatch && slainMatch[1]) mName = slainMatch[1].trim();
                else {
                    const fallback = msg.match(/(?:slain|destroyed|dies)\s+(?:the\s+)?([A-Za-z0-9\-',\s]+?)(?:\.|$)/i) ||
                                     msg.match(/^(?:The\s+)?([A-Za-z0-9\-',\s]+?)\s+(?:dies|is destroyed)/i);
                    if (fallback && fallback[1]) mName = fallback[1].trim();
                }
                if (mName) {
                    slainMonsterNames.add(mName.toLowerCase());
                }
            }

            // Status messages (confused, poisoned, blind, stunned, etc.)
            const sMatch = msg.match(statusRe);
            if (sMatch) {
                const lowerMsg = msg.toLowerCase();
                if (lowerMsg.includes('confus')) framePlayerStatuses.push('confused');
                else if (lowerMsg.includes('poison') || lowerMsg.includes('very sick')) framePlayerStatuses.push('poisoned');
                else if (lowerMsg.includes('blind') || lowerMsg.includes('cannot see')) framePlayerStatuses.push('blind');
                else if (lowerMsg.includes('stun') || lowerMsg.includes('knocked out')) framePlayerStatuses.push('stunned');
                else if (lowerMsg.includes('paralyz') || lowerMsg.includes('cannot move')) framePlayerStatuses.push('paralyzed');
                else if (lowerMsg.includes('terrifi') || lowerMsg.includes('panic')) framePlayerStatuses.push('terrified');
                else if (lowerMsg.includes('bleed') || lowerMsg.includes('mortally wounded')) framePlayerStatuses.push('bleeding');
            }

            // 2. Hero Attacks & Monster Pain Reactions
            const hMatch = msg.match(heroAttackRe);
            const pMatch = !hMatch ? msg.match(RE_MON_PAIN) : null;
            if (hMatch || pMatch) {
                this.lastCombatActionTime = now;
                const act = hMatch ? hMatch[1].toLowerCase() : 'strikes';
                const monName = hMatch ? hMatch[2].trim() : pMatch[1].trim();
                const monLower = monName.toLowerCase();
                if (!slainMonsterNames.has(monLower)) {
                    const lastAtk = this.recentHeroAttacks.get(monLower) || 0;
                    if (now - lastAtk >= 1500) {
                        this.recentHeroAttacks.set(monLower, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        frameHeroAttacks.push({
                            monsterName: monName,
                            action: act,
                            message: msg,
                            glyph: monObj ? monObj.glyph : '',
                            depth: depth,
                            inTown: depth === 0,
                            missed: act.includes('miss')
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
                this.lastVisitedStore = storeName;
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

            // 7b. Store Purchases
            const buyMatch = msg.match(storeBuyRe);
            if (buyMatch) {
                const count = buyMatch[1] ? parseInt(buyMatch[1], 10) : 1;
                const rawItem = buyMatch[2].trim();
                const cleanItem = rawItem.replace(RE_CLEAN_PARENS, '').replace(RE_CLEAN_BRACKETS, '').trim();
                const price = parseInt(buyMatch[3], 10);
                const storeName = this.lastVisitedStore || 'General Store';
                this.eventQueue.push({
                    type: 'STORE_PURCHASE',
                    priority: 'high',
                    isChapter: false,
                    data: {
                        rawItem,
                        item: cleanItem,
                        count,
                        price,
                        storeName,
                        message: msg,
                        depth: depth
                    }
                });
            }

            // 8. Level Feelings (Canonical Angband Monster & Object Feelings)
            const lfMatch = msg.match(RE_LEVEL_FEELING);
            if (lfMatch) {
                const feelText = msg.trim();
                const lastLf = this._lastLevelFeelingTime || 0;
                if (now - lastLf >= 6000) {
                    this._lastLevelFeelingTime = now;
                    this.eventQueue.push({
                        type: 'LEVEL_FEELING',
                        priority: 'high',
                        isChapter: false,
                        data: {
                            feelingText: feelText,
                            message: msg,
                            depth: depth
                        }
                    });
                }
            }

            // 8b. Excavation / Rubble Clearing / Tunneling
            const excMatch = msg.match(RE_EXCAVATE);
            if (excMatch) {
                const isCleared = msg.includes('removed') || msg.includes('cleared a path') || msg.includes('finished digging');
                const lastExc = this._lastExcavationTime || 0;
                if (isCleared || (now - lastExc >= 4000)) {
                    this._lastExcavationTime = now;
                    this.eventQueue.push({
                        type: 'EXCAVATION',
                        priority: isCleared ? 'high' : 'normal',
                        isChapter: false,
                        data: {
                            message: msg,
                            cleared: isCleared,
                            depth: depth
                        }
                    });
                }
            }

            // 8c. Treasure & Valuable Discoveries
            const trMatch = msg.match(RE_TREASURE);
            const chMatch = !trMatch ? msg.match(RE_CHEST) : null;
            if (trMatch || chMatch) {
                const lastTr = this._lastTreasureTime || 0;
                if (now - lastTr >= 3000) {
                    this._lastTreasureTime = now;
                    this.eventQueue.push({
                        type: 'TREASURE_DISCOVERY',
                        priority: 'normal',
                        isChapter: false,
                        data: {
                            amount: trMatch ? parseInt(trMatch[1], 10) : 0,
                            metal: trMatch ? trMatch[2].trim() : (chMatch ? chMatch[1].trim() : 'gold'),
                            message: msg,
                            depth: depth
                        }
                    });
                }
            }

            // 8d. Dungeon Features (Secret Doors, Traps, Locks, Bashes)
            const featMatch = msg.match(RE_DUNGEON_FEATURE);
            if (featMatch) {
                const lastFeat = this._lastFeatureTime || 0;
                if (now - lastFeat >= 4000) {
                    this._lastFeatureTime = now;
                    this.eventQueue.push({
                        type: 'DUNGEON_FEATURE',
                        priority: 'normal',
                        isChapter: false,
                        data: {
                            message: msg,
                            depth: depth
                        }
                    });
                }
            }

            // 8e. Status Recovery
            const recMatch = msg.match(RE_STATUS_RECOVERY);
            if (recMatch) {
                this.eventQueue.push({
                    type: 'STATUS_RECOVERY',
                    priority: 'normal',
                    isChapter: false,
                    data: {
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
                    const lastHit = this.recentAssailants.get(monName);
                    if (!slainMonsterNames.has(monLower) && (lastHit === undefined || lastHit === now || (now - lastHit > 8000))) {
                        this.recentAssailants.set(monName, now);
                        const monObj = (frame.monsters || []).find(m => (m.name || '').toLowerCase().includes(monLower));
                        frameIncomingAttacks.push({
                            monsterName: monName,
                            action: action,
                            message: msg,
                            glyph: monObj ? monObj.glyph : '',
                            depth: depth
                        });
                    }
                }
            }
        }

        // Live Telemetry status onset detection
        if (player.confused > 0 && !this._lastConfused) framePlayerStatuses.push('confused');
        if (player.poisoned > 0 && !this._lastPoisoned) framePlayerStatuses.push('poisoned');
        if (player.blind > 0 && !this._lastBlind) framePlayerStatuses.push('blind');
        if (player.stun > 0 && !this._lastStun) framePlayerStatuses.push('stunned');
        if (player.cut > 0 && !this._lastCut) framePlayerStatuses.push('bleeding');
        this._lastConfused = (player.confused > 0);
        this._lastPoisoned = (player.poisoned > 0);
        this._lastBlind = (player.blind > 0);
        this._lastStun = (player.stun > 0);
        this._lastCut = (player.cut > 0);

        // Coalesce concurrent/stacked combat messages into a single COMBAT_EXCHANGE beat
        const isStackedCombat = (frameIncomingAttacks.length > 1) ||
            (frameIncomingAttacks.length > 0 && (frameHeroAttacks.length > 0 || frameKills.length > 0 || framePlayerStatuses.length > 0)) ||
            (framePlayerStatuses.length > 0 && (frameHeroAttacks.length > 0 || frameKills.length > 0)) ||
            (frameHeroAttacks.length > 0 && frameKills.length > 0);

        if (isStackedCombat) {
            let fleeingMon = null;
            for (const k of frameKills) {
                const kLower = (typeof k === 'string' ? k : '').toLowerCase();
                for (const [fName, fTime] of this.recentFleeings.entries()) {
                    if (now - fTime <= 10000 && kLower.includes(fName)) {
                        fleeingMon = fName;
                        break;
                    }
                }
            }

            this.eventQueue.push({
                type: 'COMBAT_EXCHANGE',
                priority: frameKills.length > 0 ? 'high' : 'normal',
                isChapter: false,
                data: {
                    incomingAttacks: frameIncomingAttacks,
                    heroAttacks: frameHeroAttacks,
                    kills: frameKills,
                    fleeingMonster: fleeingMon,
                    playerStatuses: [...new Set(framePlayerStatuses)],
                    depth: depth,
                    inTown: depth === 0,
                    accumulated: { ...this.episodeAccumulator }
                }
            });
            if (frameKills.length > 0) {
                this.resetEpisodeAccumulator();
            }
        } else {
            // Dispatch isolated events independently in strict chronological causal order:
            // 1. Enemy assaults (enemy attacks or initiates)
            for (const inc of frameIncomingAttacks) {
                this.eventQueue.push({
                    type: 'CREATURE_ASSAULT',
                    priority: 'high',
                    isChapter: false,
                    data: inc
                });
            }
            // 2. Player statuses suffered from assaults (confusion, poison, stun, etc.)
            const uniqueStatuses = [...new Set(framePlayerStatuses)];
            for (const st of uniqueStatuses) {
                this.eventQueue.push({
                    type: 'PLAYER_STATUS',
                    priority: 'normal',
                    isChapter: false,
                    data: { status: st, depth: depth }
                });
            }
            // 3. Hero attacks (player strikes back)
            for (const atk of frameHeroAttacks) {
                this.eventQueue.push({
                    type: 'HERO_ATTACK',
                    priority: 'normal',
                    isChapter: false,
                    data: atk
                });
            }
            // 4. Fatal slayings (enemy dies from hero's blow)
            if (frameKills.length > 0) {
                let fleeingMon = null;
                for (const k of frameKills) {
                    const kLower = (typeof k === 'string' ? k : '').toLowerCase();
                    for (const [fName, fTime] of this.recentFleeings.entries()) {
                        if (now - fTime <= 10000 && kLower.includes(fName)) {
                            fleeingMon = fName;
                            break;
                        }
                    }
                }
                this.eventQueue.push({
                    type: 'COMBAT_EPISODE',
                    priority: 'normal',
                    isChapter: false,
                    data: {
                        kills: frameKills,
                        fleeingMonster: fleeingMon,
                        message: frameKills[0],
                        monstersSlain: frameKills.length,
                        depth,
                        accumulated: { ...this.episodeAccumulator }
                    }
                });
                this.resetEpisodeAccumulator();
            }
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
        for (const msg of expandedMsgs) {
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

        // --- 5. DRAIN PENDING SEQUENTIAL EVENTS IN QUEUE FIRST ---
        // Ensure all combat and events on current floor are chronicled before stairs transitions
        if (this.eventQueue && this.eventQueue.length > 0) {
            this.lastBeatTime = now;
            return this.eventQueue.shift();
        }

        // --- 6. FLOOR CHANGES & TAVERN RESPITE (MAJOR CHAPTER MILESTONES) ---
        if (depth !== this.lastDepth) {
            const oldDepth = this.lastDepth;
            this.lastDepth = depth;
            this.lastBeatTime = now;
            if (depth > 0) this.lastVisitedStore = null;

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

/**
 * audio-director.js — Threat-Weighted Adaptive Music & Contextual Audio Hints (WS82 Pillar 1)
 *
 * Eliminates jarring combat track switches on harmless, sleeping, peaceful, or town creatures.
 * Scales intensity smoothly by hostility, awareness (!asleep), LOS proximity, HP peril, and
 * monster-vs-player depth delta, with 18s / 8-turn hysteresis, paused-playhead exploration
 * deck resume, 7-tier dungeon feeling track routing, and subtle WebAudio acoustic hints.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AudioDirector = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COMBAT_HOLD_MS = 18000;
  const COMBAT_HOLD_TURNS = 8;
  const BOSS_HOLD_MS = 22000;

  // Known peaceful town / quest NPCs that must NEVER trigger combat or boss music
  // Note: negative lookahead (?!'s) ensures "Fang, Farmer Maggot's Dog" & "Grip, Farmer Maggot's Dog" remain hostile uniques!
  const PEACEFUL_NAME_RE = /\b(?:farmer maggot(?!'s)|shopkeeper|storekeeper|townsman|townsperson|mercenary|agent of black market|priest|healer|oracle|aligned priest|watchman|watch captain|izchak|king arthur|meng-huo|mayor|hermit|sage|chronicler|quartermaster)\b/i;
  const FINAL_LORD_RE = /\b(?:morgoth|sauron|serpent of chaos|oberon|wizard of yendor|orb of zot|carcharoth|glaurung|gothmog|tiamat|demogorgon|asmodeus|cerebov|lom lobon|mnoleg|gloorx vloq)\b/i;

  // Feeling keyword -> subtle music track preference
  const FEELING_TRACK_MAP = Object.freeze([
    { re: /special|superb|omen|murderous|terribly dangerous|sinister|vault|rune/i, low: 'dungeon_special', med: 'dungeon_med_feel1', high: 'dungeon_high_feel1', perilCue: 'vault' },
    { re: /dangerous|very dangerous|dread|chill|anxious|nervous/i, low: 'dungeon_low_feel1', med: 'dungeon_med_feel2', high: 'dungeon_high_feel2', perilCue: 'danger' },
    { re: /good|lucky|wealth|treasure/i, low: 'dungeon_low_feel2', med: 'dungeon_med_feel1', high: 'dungeon_high_feel1', perilCue: null }
  ]);

  class AudioDirectorController {
    constructor() {
      this.reset();
    }

    reset() {
      this.activeCombatTier = 0; // 0=explore, 1=skirmish(no track swap), 2=battle, 3=boss, 4=final_lord
      this.lastThreatTime = 0;
      this.lastThreatTurn = -1;
      this.savedExploreState = new Map(); // trackId -> currentTime (seconds)
      this.lastFeelingKey = '';
      this.seenSleepingUniques = new Set();
      this.lastLowHpPulseAt = 0;
      this.lastBlindState = false;
      this._perilFilterNode = null;
      this._lastFilterCutoff = 20000;
    }

    static isHostileMonster(mon, depth = 0, playerX = null, playerY = null) {
      if (!mon || mon.dead || mon.hp <= 0) return false;
      const att = String(mon.attitude || mon.disposition || '').toLowerCase();
      if (mon.isPet || mon.pet || mon.tame || mon.friendly || mon.peaceful || mon.shopkeeper || mon.neutral) return false;
      if (att === 'pet' || att === 'friendly' || att === 'peaceful' || att === 'neutral' || att === 'tame' || att === 'ally') return false;
      const name = String(mon.name || mon.race || '');
      if (PEACEFUL_NAME_RE.test(name)) return false;
      // Town Sanctuary Guard: depth 0 in town never triggers boss/combat music unless monster actually struck player
      if (depth === 0 && !mon.provoked && !mon.attackedPlayer) return false;
      return true;
    }

    static isAwakeAndAware(mon, playerX = null, playerY = null) {
      if (!mon) return false;
      if (mon.asleep || mon.sleeping || mon.sleep > 0 || mon.csleep > 0 || mon.paralyzed) return false;
      const state = String(mon.state || mon.aiState || '').toLowerCase();
      if (state === 'asleep' || state === 'sleeping' || state === 'dormant' || state === 'wandering_unaware') return false;
      if (typeof playerX === 'number' && typeof playerY === 'number' && typeof mon.x === 'number' && typeof mon.y === 'number') {
        const dist = Math.hypot(mon.x - playerX, mon.y - playerY);
        if (dist > 11) return false;
      }
      if (mon.inLos === false || mon.visible === false) return false;
      return true;
    }

    /**
     * Computes composite threat score & music tier for visible monsters.
     * Tier 0: Peaceful / Exploration / Sleeping foes only
     * Tier 1: Minor / Trivial skirmish -> KEEP exploration music playing smoothly!
     * Tier 2: Serious pack or dangerous OOD foe -> Combat track (with 18s hysteresis)
     * Tier 3: Awake hostile Unique / Boss -> Boss track (with 22s hysteresis)
     * Tier 4: Awake hostile Endgame Lord -> Final Boss track
     */
    evaluateThreat(frame, realm = 'angband') {
      if (!frame || !frame.player) {
        return { tier: 0, score: 0, sleepingUnique: null, bossMon: null, isLowHp: false, isBlind: false };
      }
      const p = frame.player;
      const depth = Number((frame.map && typeof frame.map.depth === 'number') ? frame.map.depth : (p.depth || 0));
      const pLevel = Math.max(1, Number(p.level || 1));
      const px = typeof p.x === 'number' ? p.x : null;
      const py = typeof p.y === 'number' ? p.y : null;
      const hpMax = Math.max(1, Number(p.hp_max || p.mhp || 1));
      const hpCur = Number(p.hp ?? p.chp ?? hpMax);
      const hpRatio = Math.max(0, Math.min(1, hpCur / hpMax));
      const isLowHp = hpRatio > 0 && hpRatio <= 0.25 && !p.dead;
      const statuses = Array.isArray(p.statuses) ? p.statuses : [];
      const isBlind = Boolean(
        p.blind || p.isBlind ||
        statuses.some(s => /blind|盲目/i.test(typeof s === 'string' ? s : (s && s.name) || ''))
      );

      const mons = Array.isArray(frame.monsters) ? frame.monsters : [];
      let totalThreat = 0;
      let awakeHostileCount = 0;
      let highestBoss = null;
      let isFinalLord = false;
      let sleepingUnique = null;

      // Scale expected monster level by realm depth norms
      const r = String(realm || frame.realm || 'angband').toLowerCase();
      const expectedDepthBase = (r === 'silq' || r === 'brogue' || r === 'rogue' || r === 'dcss' || r === 'nethack')
        ? Math.max(1, depth * 2)
        : Math.max(1, Math.round(depth * 0.7 + pLevel * 0.5));

      for (let i = 0; i < mons.length; i++) {
        const m = mons[i];
        if (!m) continue;
        if (!AudioDirectorController.isHostileMonster(m, depth, px, py)) continue;

        const name = String(m.name || m.race || '');
        const isUnique = Boolean(m.unique || m.isBoss || FINAL_LORD_RE.test(name));
        const awake = AudioDirectorController.isAwakeAndAware(m, px, py);

        if (!awake) {
          if (isUnique && !sleepingUnique) sleepingUnique = m;
          continue;
        }

        awakeHostileCount++;
        const mLevel = Number(m.level || m.depth || m.hd || expectedDepthBase);
        const dist = (px !== null && py !== null && typeof m.x === 'number' && typeof m.y === 'number')
          ? Math.max(1, Math.hypot(m.x - px, m.y - py))
          : 4;
        const proxFactor = dist <= 2.2 ? 1.35 : (dist <= 5.5 ? 1.0 : 0.65);
        const relRatio = mLevel / Math.max(1, expectedDepthBase);

        if (FINAL_LORD_RE.test(name)) {
          isFinalLord = true;
          highestBoss = m;
          totalThreat += 6.0;
        } else if (isUnique) {
          if (!highestBoss) highestBoss = m;
          totalThreat += 3.4 * proxFactor;
        } else if (relRatio >= 1.45) {
          // Out-of-depth dangerous monster
          totalThreat += 2.1 * proxFactor;
        } else if (relRatio >= 0.85) {
          // On-level peer monster: 1 lone peer = skirmish (no jarring BGM swap); pack of 3+ or low HP = battle
          totalThreat += 0.8 * proxFactor;
        } else {
          // Under-leveled fodder (rats, kobolds, bats when over-leveled): negligible musical threat
          totalThreat += 0.22 * proxFactor;
        }
      }

      if (isLowHp && awakeHostileCount > 0) {
        totalThreat += 1.6;
      }

      let rawTier = 0;
      if (isFinalLord) rawTier = 4;
      else if (highestBoss) rawTier = 3;
      else if (totalThreat >= 2.35) rawTier = 2;
      else if (awakeHostileCount > 0) rawTier = 1;

      const now = Date.now();
      const turn = Number(p.turn ?? frame.turn ?? 0);

      if (rawTier >= 2) {
        if (rawTier >= this.activeCombatTier) {
          this.activeCombatTier = rawTier;
        }
        this.lastThreatTime = now;
        this.lastThreatTurn = turn;
      } else if (this.activeCombatTier >= 2) {
        const holdMs = this.activeCombatTier >= 3 ? BOSS_HOLD_MS : COMBAT_HOLD_MS;
        const elapsedMs = now - this.lastThreatTime;
        const elapsedTurns = (turn >= this.lastThreatTurn && this.lastThreatTurn >= 0) ? (turn - this.lastThreatTurn) : 0;
        // Hysteresis: keep combat/boss music steady until both 18s (or 8 turns with zero awake hostiles) have passed
        const clearByTurns = awakeHostileCount === 0 && elapsedTurns >= COMBAT_HOLD_TURNS && elapsedMs >= 6000;
        if (elapsedMs >= holdMs || clearByTurns || depth === 0) {
          this.activeCombatTier = rawTier;
        }
      } else {
        this.activeCombatTier = rawTier;
      }

      return {
        tier: this.activeCombatTier,
        rawTier,
        score: Number(totalThreat.toFixed(2)),
        awakeHostileCount,
        bossMon: highestBoss,
        sleepingUnique,
        isLowHp,
        hpRatio,
        isBlind,
        depth
      };
    }

    /**
     * Resolves dungeon level feeling text from player.feeling or recent level-feeling messages.
     */
    resolveFeelingTrack(frame, depthCategory = 'dungeon_low') {
      if (!frame || !frame.player) return null;
      const p = frame.player;
      let feelingText = String(p.feeling || p.levelFeeling || '');
      if (!feelingText && Array.isArray(frame.messages)) {
        for (let i = frame.messages.length - 1; i >= Math.max(0, frame.messages.length - 6); i--) {
          const m = frame.messages[i];
          const txt = typeof m === 'string' ? m : (m && m.text) || '';
          if (/place seems|omens of death|sense of dread|sinister presence|quiet,?\s*peaceful/i.test(txt)) {
            feelingText = txt;
            break;
          }
        }
      }
      if (!feelingText) return null;
      for (const entry of FEELING_TRACK_MAP) {
        if (entry.re.test(feelingText)) {
          const track = depthCategory === 'dungeon_high' ? entry.high : (depthCategory === 'dungeon_med' ? entry.med : entry.low);
          return { track, perilCue: entry.perilCue, feelingText };
        }
      }
      return null;
    }

    saveExplorationPlayhead(trackId, currentTime) {
      if (!trackId || typeof currentTime !== 'number' || !isFinite(currentTime) || currentTime <= 1.0) return;
      if (/^boss|victory|death|arena/i.test(trackId)) return;
      this.savedExploreState.set(trackId, currentTime);
      if (this.savedExploreState.size > 16) {
        const oldest = this.savedExploreState.keys().next().value;
        this.savedExploreState.delete(oldest);
      }
    }

    consumeSavedPlayhead(trackId) {
      if (!trackId || !this.savedExploreState.has(trackId)) return 0;
      const t = this.savedExploreState.get(trackId) || 0;
      return t > 1.0 ? t : 0;
    }

    /**
     * Plays subtle, non-cheesy contextual acoustic hints (sleeping unique omen chord,
     * <25% HP warm sub-bass pulse, blindness acoustic dampening cue) using existing WebAudio ctx.
     */
    applyContextualHints(soundEngine, evalState, frame) {
      if (!soundEngine || !soundEngine.enabled || !soundEngine.ctx || soundEngine.ctx.state !== 'running') return;
      const ctx = soundEngine.ctx;
      const dest = soundEngine.sfxGain || soundEngine.masterGain;
      if (!dest) return;
      const now = Date.now();

      // 1. Sleeping Unique Omen: subtle bowed low fifth once per unique sighting (teaches cautious stealth!)
      if (evalState.sleepingUnique) {
        const uKey = `${evalState.depth}:${evalState.sleepingUnique.id || evalState.sleepingUnique.name || 'u'}`;
        if (!this.seenSleepingUniques.has(uKey)) {
          this.seenSleepingUniques.add(uKey);
          if (this.seenSleepingUniques.size > 64) this.seenSleepingUniques.clear();
          this._playSubtleHarmonic(ctx, dest, [110, 164.81], 0.055, 1.4, 'sine');
        }
      }

      // 2. Mortal Peril (<25% HP): restrained warm 55Hz pulse at most once every 9s during active danger
      if (evalState.isLowHp && evalState.awakeHostileCount > 0 && (now - this.lastLowHpPulseAt) > 9000) {
        this.lastLowHpPulseAt = now;
        this._playSubtleHarmonic(ctx, dest, [55, 82.41], 0.065, 0.85, 'triangle');
      }

      // 3. Blindness Transition: subtle crystalline veil whisper on onset
      if (evalState.isBlind !== this.lastBlindState) {
        this.lastBlindState = evalState.isBlind;
        if (evalState.isBlind) {
          this._playSubtleHarmonic(ctx, dest, [293.66, 311.13], 0.04, 0.9, 'sine');
        }
      }
    }

    _playSubtleHarmonic(ctx, dest, freqs, peakGain, durationSec, waveType = 'sine') {
      try {
        const t0 = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(peakGain, t0 + 0.16);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
        g.connect(dest);
        for (let i = 0; i < freqs.length; i++) {
          const osc = ctx.createOscillator();
          osc.type = waveType;
          osc.frequency.setValueAtTime(freqs[i], t0);
          osc.connect(g);
          osc.start(t0);
          osc.stop(t0 + durationSec + 0.04);
        }
      } catch (_) {}
    }
  }

  return AudioDirectorController;
});

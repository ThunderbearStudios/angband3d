'use strict';

const crypto = require('crypto');
const path = require('path');
const SC = require(path.resolve(__dirname, '../../../server/public/js/screen-context.js'));
const ActionCatalog = require(path.resolve(__dirname, '../../../server/public/js/action-catalog.js'));
const { decodeSjisIfNeeded } = require('../engine_driver');

function mulberry32(seed) {
    let a = (Number(seed) >>> 0) || 133701;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const DIR_KEYS = [
    { dx: 0, dy: -1, key: 'up', num: '8' },
    { dx: 0, dy: 1, key: 'down', num: '2' },
    { dx: -1, dy: 0, key: 'left', num: '4' },
    { dx: 1, dy: 0, key: 'right', num: '6' },
    { dx: -1, dy: -1, key: 'home', num: '7' },
    { dx: 1, dy: -1, key: 'pageup', num: '9' },
    { dx: -1, dy: 1, key: 'end', num: '1' },
    { dx: 1, dy: 1, key: 'pagedown', num: '3' }
];

function dirToKey(dx, dy, useNumpad = false) {
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    const hit = DIR_KEYS.find((d) => d.dx === sx && d.dy === sy);
    if (!hit) return '5';
    return useNumpad ? hit.num : hit.key;
}

const FEAT_WALLS = new Set([0x00, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x1e]);
const FEAT_HAZARD = new Set([0x17, 0x1d, 0x29]);
const FEAT_DOOR_CLOSED = 0x02;
const FEAT_DOORS = new Set([0x02, 0x03, 0x04]);

function getTile(map, x, y) {
    if (!map || !Array.isArray(map.rows) || y < 0 || y >= map.rows.length) return null;
    const row = map.rows[y];
    if (!row || !row.g || x < 0 || x >= row.g.length) return null;
    const g = row.g[x];
    const f = parseInt((row.f || '').slice(x * 2, x * 2 + 2), 16) || 0;
    const l = parseInt((row.l || '')[x] || '0', 16) || 0;
    return { x, y, g, f, l };
}

function isWalkableTile(tile, allowHazards = false) {
    if (!tile) return false;
    if (FEAT_WALLS.has(tile.f)) return false;
    if (!allowHazards && FEAT_HAZARD.has(tile.f)) return false;
    if (tile.f === 0 && tile.g === ' ') return false;
    if (tile.g === '#' || tile.g === '^') return false;
    return true;
}

function isStoreFeat(f) {
    return (f >= 0x07 && f <= 0x0e) || (f >= 0x20 && f <= 0x28 && f !== 0x25);
}

class YendorBot {
    constructor(opts = {}) {
        this.realm = String(opts.realm || 'angband').toLowerCase();
        this.lang = opts.lang || 'en';
        this.rng = mulberry32(opts.seed || 133701);
        this.mode = opts.mode || 'crawl'; // 'crawl' | 'dive' | 'death'
        this.diagonalDoorwayBlocked = (this.realm === 'nethack' || this.realm === 'rogue');
        this.visitedByDepth = new Map();
        this.stateWindow = [];
        this.promptLockCount = 0;
        this.lastPromptSig = '';
        this.stepCount = 0;
        this.completedTasks = new Set();
        this.pendingQueue = [];
        this.lastTarget = null;
        this.openedDoors = new Set();
        this.maxDepthSeen = 0;
        this.minDepthAfterGoal = null;
        this.allowDieYes = Boolean(opts.allowDieYes);
        this.inStoreCooldown = 0;
    }

    _visitedSet(depth, branch = '') {
        const key = `${branch}:${depth}`;
        let set = this.visitedByDepth.get(key);
        if (!set) {
            set = new Set();
            this.visitedByDepth.set(key, set);
        }
        return set;
    }

    _markVisited(frame) {
        if (!frame || !frame.player) return;
        const set = this._visitedSet(frame.player.depth, frame.player.branch || '');
        set.add(`${frame.player.x},${frame.player.y}`);
        if (frame.player.depth > this.maxDepthSeen) this.maxDepthSeen = frame.player.depth;
    }

    _detectStuck(frame) {
        const raw = SC.rawScreenText(frame);
        const dec = decodeSjisIfNeeded(raw, this.realm, this.lang);
        const termHash = crypto.createHash('sha1').update(dec).digest('hex').slice(0, 8);
        const p = frame.player || {};
        const ui = frame.ui || {};

        const isIdlePlay = frame.phase === 'play' && ui.awaiting_command && (ui.overlay || 0) === 0 && !ui.more;
        const promptSig = isIdlePlay ? '' : `${frame.phase}:${ui.overlay || 0}:${ui.more ? 1 : 0}:${termHash}`;
        if (!isIdlePlay) {
            if (promptSig === this.lastPromptSig) {
                this.promptLockCount++;
            } else {
                this.lastPromptSig = promptSig;
                this.promptLockCount = 1;
            }
            if (this.promptLockCount >= 10) {
                return { stuck: true, code: 'P0_PROMPT_SOFTLOCK', message: `Stuck on non-idle prompt (${promptSig}) for ${this.promptLockCount} steps` };
            }
        } else {
            this.lastPromptSig = '';
            this.promptLockCount = 0;
        }

        const sig = `${p.depth}:${p.x}:${p.y}:${ui.overlay || 0}`;
        this.stateWindow.push(sig);
        if (this.stateWindow.length > 24) this.stateWindow.shift();
        if (this.stateWindow.length === 24) {
            const unique = new Set(this.stateWindow);
            if (unique.size <= 2 && isIdlePlay && this.mode !== 'death') {
                return { stuck: true, code: 'P1_BOT_OSCILLATION', message: `Bot oscillated on <=2 states over 24 turns at ${sig}` };
            }
        }
        return null;
    }

    _bfsNextStep(map, px, py, goalFn, allowClosedDoors = true) {
        if (!map || !Array.isArray(map.rows)) return null;
        const h = map.h || map.rows.length;
        const w = map.w || (map.rows[0] ? map.rows[0].g.length : 0);
        if (!w || !h) return null;

        const q = [{ x: px, y: py, firstDx: 0, firstDy: 0, dist: 0 }];
        const seen = new Set([`${px},${py}`]);
        let head = 0;

        while (head < q.length) {
            const cur = q[head++];
            if (cur.dist > 0 && goalFn(cur.tile, cur.x, cur.y)) {
                return { dx: cur.firstDx, dy: cur.firstDy, targetX: cur.x, targetY: cur.y, tile: cur.tile, dist: cur.dist };
            }
            if (cur.dist > 60) continue;

            const curTile = getTile(map, cur.x, cur.y);
            const curIsDoor = curTile && FEAT_DOORS.has(curTile.f);

            for (const d of DIR_KEYS) {
                const nx = cur.x + d.dx;
                const ny = cur.y + d.dy;
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                const k = `${nx},${ny}`;
                if (seen.has(k)) continue;
                const nt = getTile(map, nx, ny);
                if (!nt) continue;

                const isDiag = d.dx !== 0 && d.dy !== 0;
                if (this.diagonalDoorwayBlocked && isDiag && (curIsDoor || FEAT_DOORS.has(nt.f))) {
                    continue;
                }

                const isClosedDoor = nt.f === FEAT_DOOR_CLOSED || nt.g === '+';
                const walkable = isWalkableTile(nt, false) || (allowClosedDoors && isClosedDoor);
                if (!walkable) continue;

                seen.add(k);
                const firstDx = cur.dist === 0 ? d.dx : cur.firstDx;
                const firstDy = cur.dist === 0 ? d.dy : cur.firstDy;
                q.push({ x: nx, y: ny, firstDx, firstDy, dist: cur.dist + 1, tile: nt });
            }
        }
        return null;
    }

    _scheduleRealmTasks(frame) {
        if (this.pendingQueue.length > 0 || this.mode === 'death') return;
        const p = frame.player || {};
        const r = this.realm;

        if (!this.completedTasks.has('info_screens') && this.stepCount >= 3) {
            this.completedTasks.add('info_screens');
            const invKey = ActionCatalog.keyFor('inventory', r) || 'i';
            const eqKey = ActionCatalog.keyFor('equipment', r) || 'e';
            const charKey = ActionCatalog.keyFor('char_sheet', r) || 'C';
            this.pendingQueue.push(
                { key: invKey, tag: 'open_inven' },
                { key: 'escape', tag: 'close_inven' },
                { key: eqKey, tag: 'open_equip' },
                { key: 'escape', tag: 'close_equip' },
                { key: charKey, tag: 'open_char_sheet' },
                { key: 'escape', tag: 'close_char_sheet' }
            );
            return;
        }

        if (r === 'silq' && !this.completedTasks.has('silq_verbs') && p.depth >= 1) {
            this.completedTasks.add('silq_verbs');
            this.pendingQueue.push(
                { key: 'S', tag: 'silq_stealth_toggle' },
                { key: 's', tag: 'silq_song_menu' },
                { key: 'escape', tag: 'close_song' },
                { key: 'tab', tag: 'silq_abilities' },
                { key: 'escape', tag: 'close_abilities' }
            );
            return;
        }

        if (r === 'nethack' && !this.completedTasks.has('nethack_verbs') && p.depth >= 1) {
            this.completedTasks.add('nethack_verbs');
            this.pendingQueue.push(
                { key: 'E', tag: 'nethack_engrave' },
                { key: 'Elbereth', isKeys: true, tag: 'nethack_elbereth_text' },
                { key: 'enter', tag: 'nethack_elbereth_submit' },
                { key: '#pray', tag: 'nethack_pray' }
            );
            return;
        }

        if (r === 'dcss' && !this.completedTasks.has('dcss_verbs') && p.depth >= 1) {
            this.completedTasks.add('dcss_verbs');
            this.pendingQueue.push(
                { key: 'm', tag: 'dcss_skills' },
                { key: 'escape', tag: 'close_skills' },
                { key: '^', tag: 'dcss_god' },
                { key: 'escape', tag: 'close_god' },
                { key: 'o', tag: 'dcss_autoexplore' }
            );
            return;
        }

        if (r === 'rogue' && !this.completedTasks.has('rogue_verbs') && p.depth >= 1) {
            this.completedTasks.add('rogue_verbs');
            this.pendingQueue.push(
                { key: 'D', tag: 'rogue_discoveries' },
                { key: 'escape', tag: 'close_discoveries' },
                { key: 's', tag: 'rogue_search' }
            );
            return;
        }

        if ((r === 'frogcomposband' || r === 'hengband') && !this.completedTasks.has('variant_popup') && p.depth >= 0) {
            this.completedTasks.add('variant_popup');
            this.pendingQueue.push(
                { key: 'enter', tag: 'popup_menu_open' },
                { key: 'escape', tag: 'popup_menu_close' },
                { key: 'U', tag: 'variant_powers' },
                { key: 'escape', tag: 'close_powers' }
            );
            return;
        }

        if (r === 'ryod' && !this.completedTasks.has('ryod_verbs') && p.depth >= 1) {
            this.completedTasks.add('ryod_verbs');
            this.pendingQueue.push(
                { key: 'U', tag: 'ryod_power' },
                { key: 'escape', tag: 'close_ryod_power' }
            );
        }
    }

    _handlePromptOrOverlay(frame, cls) {
        const raw = SC.rawScreenText(frame);
        const dec = decodeSjisIfNeeded(raw, this.realm, this.lang);
        const txt = (raw + '\n' + dec).toLowerCase();
        const ui = frame.ui || {};

        if (ui.more || txt.includes('-more-') || txt.includes('[more]')) {
            return { key: 'enter', reason: 'dismiss_more' };
        }
        if (txt.includes('die?') || txt.includes('do you really want to quit')) {
            return { key: this.allowDieYes ? 'y' : 'n', reason: 'die_or_quit_prompt' };
        }
        if (cls.isYesNoPrompt || txt.includes('[y/n]') || txt.includes('(y/n)') || txt.includes('よろしいですか')) {
            if (txt.includes('destroy') || txt.includes('quit') || txt.includes('suicide') || txt.includes('abandon')) {
                return { key: 'n', reason: 'decline_destructive_yn' };
            }
            return { key: 'y', reason: 'confirm_yn' };
        }
        if (cls.isStore || txt.includes('store inventory') || txt.includes('gold remaining') || txt.includes('商品の一覧')) {
            this.completedTasks.add('store_visit');
            this.inStoreCooldown = 6;
            if (!this.completedTasks.has('store_examine')) {
                this.completedTasks.add('store_examine');
                return { key: 'x', reason: 'store_examine_prompt' };
            }
            return { key: 'escape', reason: 'exit_store' };
        }
        if (cls.isTargeting || cls.isTargetingPrompt || (ui.prompt && (ui.prompt.kind === 'direction' || ui.prompt.kind === 'target'))) {
            const mons = Array.isArray(frame.monsters) ? frame.monsters : [];
            const p = frame.player || { x: 0, y: 0 };
            if (mons.length > 0 && !txt.includes('no target') && !txt.includes('escape to cancel')) {
                const nearest = mons.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
                return { key: dirToKey(nearest.x - p.x, nearest.y - p.y, true), reason: 'dir_to_monster' };
            }
            return { key: 'escape', reason: 'dir_cancel_escape' };
        }
        if (cls.isQuantityPrompt || (ui.prompt && ui.prompt.kind === 'quantity')) {
            return { key: 'enter', reason: 'accept_qty' };
        }
        if ((ui.overlay || 0) >= 2) {
            return { key: 'escape', reason: 'unwind_nested_overlay' };
        }
        const isSpellPrompt = Boolean((ui.prompt && ui.prompt.kind === 'spell') || cls.isSpellPrompt);
        if (!isSpellPrompt && this.promptLockCount < 3 && (cls.isItemPrompt || (ui.prompt && ui.prompt.kind === 'item'))) {
            const inv = (frame.player && Array.isArray(frame.player.inventory)) ? frame.player.inventory : [];
            if (/\b(quaff|drink|potion)\b/i.test(txt)) {
                const pot = inv.find((it) => /potion|healing|cure/i.test(it.name || it.kind || ''));
                if (pot && (pot.letter || pot.label)) return { key: pot.letter || pot.label, reason: 'select_potion' };
            }
            if (/\b(eat|food)\b/i.test(txt) || txt.includes('食べ')) {
                const food = inv.find((it) => /food|ration|bread|slime|apple|corp/i.test(it.name || it.kind || ''));
                if (food && (food.letter || food.label)) return { key: food.letter || food.label, reason: 'select_food' };
            }
            if (/\b(wield|wear|equip)\b/i.test(txt) || txt.includes('装備')) {
                const gear = inv.find((it) => !it.equipped && /weapon|sword|dagger|axe|mace|armor|mail|leather|robe|shield|ring/i.test(it.name || it.kind || ''));
                if (gear && (gear.letter || gear.label)) return { key: gear.letter || gear.label, reason: 'select_gear' };
            }
            return { key: 'escape', reason: 'escape_item_prompt' };
        }
        if ((ui.overlay || 0) > 0 || !ui.awaiting_command) {
            return { key: 'escape', reason: 'unwind_overlay' };
        }
        return null;
    }

    chooseAction(frame) {
        this.stepCount++;
        if (this.inStoreCooldown > 0) this.inStoreCooldown--;
        this._markVisited(frame);

        const stuck = this._detectStuck(frame);
        if (stuck) return { stuck };

        const decFn = (s) => decodeSjisIfNeeded(s, this.realm, this.lang);
        const cls = SC.classify(frame, decFn);

        // 1. Always handle active prompts, -more-, stores, overlays first
        const promptAction = this._handlePromptOrOverlay(frame, cls);
        if (promptAction) return promptAction;

        // 2. Drain scheduled playbook sequence if idle in play
        if (this.pendingQueue.length > 0) {
            const next = this.pendingQueue.shift();
            return { key: next.key, isKeys: Boolean(next.isKeys), reason: next.tag };
        }

        const p = frame.player || {};
        const map = frame.map;
        const inv = Array.isArray(p.inventory) ? p.inventory : [];
        const mons = Array.isArray(frame.monsters)
            ? frame.monsters.filter((m) => (m.hp > 0 || m.hp === undefined) && m.attitude !== 'friendly' && m.attitude !== 'pet' && !m.isPet && !m.peaceful && !m.friendly)
            : [];
        const objs = Array.isArray(frame.objects) ? frame.objects : [];

        // 3. Death mode: seek enemies aggressively to trigger natural death cleanly
        if (this.mode === 'death') {
            if (mons.length > 0) {
                const nearest = mons.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
                const dx = nearest.x - p.x;
                const dy = nearest.y - p.y;
                if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) {
                    return { key: dirToKey(dx, dy, false), reason: 'death_melee_enemy' };
                }
                const step = this._bfsNextStep(map, p.x, p.y, (_t, x, y) => x === nearest.x && y === nearest.y, true);
                if (step) return { key: dirToKey(step.dx, step.dy, false), reason: 'death_approach_enemy' };
            }
            const curTile = getTile(map, p.x, p.y);
            if (curTile && (curTile.f === 0x06 || curTile.g === '>') && p.depth === 0) {
                return { key: '>', reason: 'death_descend_from_town' };
            }
            if (p.depth === 0) {
                const stairStep = this._bfsNextStep(map, p.x, p.y, (t) => t.f === 0x06 || t.g === '>', true);
                if (stairStep) return { key: dirToKey(stairStep.dx, stairStep.dy, false), reason: 'death_seek_stairs' };
            }
            const hazardStep = this._bfsNextStep(map, p.x, p.y, (t) => t.f === 0x17, false);
            if (hazardStep) return { key: dirToKey(hazardStep.dx, hazardStep.dy, false), reason: 'death_seek_hazard' };
        }

        // 4. Survival: heal below 45% HP
        const hpRatio = p.hp_max > 0 ? (p.hp / p.hp_max) : 1;
        if (hpRatio < 0.45 && this.mode !== 'death') {
            const healPot = inv.find((it) => /healing|cure|restore/i.test(it.name || ''));
            if (healPot && !this.completedTasks.has(`heal_${this.stepCount - 1}`)) {
                const qKey = ActionCatalog.keyFor('quaff', this.realm) || 'q';
                return { key: qKey, reason: 'emergency_heal' };
            }
            if (mons.length === 0) {
                const restKey = ActionCatalog.keyFor('rest', this.realm) || 'R';
                return { key: restKey === 'R' ? 'R' : restKey, reason: 'rest_recover_hp' };
            }
        }

        // 5. Eat if hungry/weak
        const statuses = Array.isArray(p.statuses) ? p.statuses.map((s) => String(s.name || '').toLowerCase()).join(' ') : '';
        if ((statuses.includes('hungry') || statuses.includes('weak') || statuses.includes('faint')) && inv.some((it) => /food|ration|bread/i.test(it.name || it.kind || ''))) {
            const eatKey = ActionCatalog.keyFor('eat', this.realm) || 'E';
            return { key: eatKey, reason: 'eat_food' };
        }

        // 6. Schedule realm playbook tasks
        this._scheduleRealmTasks(frame);
        if (this.pendingQueue.length > 0) {
            const next = this.pendingQueue.shift();
            return { key: next.key, isKeys: Boolean(next.isKeys), reason: next.tag };
        }

        // 7. Adjacent hostile combat
        const adjMon = mons.find((m) => Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) <= 1);
        if (adjMon) {
            return { key: dirToKey(adjMon.x - p.x, adjMon.y - p.y, false), reason: 'melee_adjacent' };
        }

        // 8. Pick up item underfoot
        if (objs.some((o) => o.x === p.x && o.y === p.y) && !this.completedTasks.has(`pickup_${p.depth}_${p.x}_${p.y}`)) {
            this.completedTasks.add(`pickup_${p.depth}_${p.x}_${p.y}`);
            const pickKey = ActionCatalog.keyFor('pickup', this.realm) || 'g';
            return { key: pickKey, reason: 'pickup_item' };
        }

        // 9. Town store milestone on depth 0
        if (p.depth === 0 && !this.completedTasks.has('store_visit') && this.inStoreCooldown === 0 &&
            ['angband', 'frogcomposband', 'hengband'].includes(this.realm)) {
            const storeStep = this._bfsNextStep(map, p.x, p.y, (t) => isStoreFeat(t.f), true);
            if (storeStep) {
                return { key: dirToKey(storeStep.dx, storeStep.dy, false), reason: 'walk_to_store' };
            }
        }

        // 10. Goal item / Amulet / Orb ascension check in dive mode
        const hasGoal = Boolean(p.hasAmulet || p.orbRun || (Array.isArray(p.statuses) && p.statuses.some((s) => /amulet|orb/i.test(s.name || ''))));
        const curTile = getTile(map, p.x, p.y);
        if (hasGoal) {
            if (curTile && (curTile.f === 0x05 || curTile.g === '<')) {
                return { key: '<', reason: 'ascend_with_goal' };
            }
            const upStep = this._bfsNextStep(map, p.x, p.y, (t) => t.f === 0x05 || t.g === '<', true);
            if (upStep) return { key: dirToKey(upStep.dx, upStep.dy, false), reason: 'seek_up_stairs_with_goal' };
        }

        // 11. Descend stairs when ready (immediately in dive mode or town, or after 25 steps per floor)
        const visitedOnFloor = this._visitedSet(p.depth, p.branch || '').size;
        const readyToDescend = this.mode === 'dive' || p.depth === 0 || visitedOnFloor >= 18 || this.stepCount > 80;
        if (readyToDescend) {
            if (curTile && (curTile.f === 0x06 || curTile.g === '>')) {
                return { key: '>', reason: 'descend_stairs' };
            }
            const downStep = this._bfsNextStep(map, p.x, p.y, (t) => t.f === 0x06 || t.g === '>', true);
            if (downStep) {
                const nextTile = getTile(map, p.x + downStep.dx, p.y + downStep.dy);
                if (nextTile && (nextTile.f === FEAT_DOOR_CLOSED || nextTile.g === '+') && !this.openedDoors.has(`${p.depth}:${nextTile.x},${nextTile.y}`)) {
                    this.openedDoors.add(`${p.depth}:${nextTile.x},${nextTile.y}`);
                    const openKey = ActionCatalog.keyFor('open', this.realm) || 'o';
                    this.pendingQueue.push({ key: dirToKey(downStep.dx, downStep.dy, true), tag: 'open_door_dir' });
                    return { key: openKey, reason: 'open_door_before_step' };
                }
                return { key: dirToKey(downStep.dx, downStep.dy, false), reason: 'seek_down_stairs' };
            }
        }

        // 12. Approach visible monster or floor loot
        if (mons.length > 0 && mons.length <= 4 && hpRatio >= 0.65) {
            const nearest = mons.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
            const monStep = this._bfsNextStep(map, p.x, p.y, (_t, x, y) => x === nearest.x && y === nearest.y, true);
            if (monStep) return { key: dirToKey(monStep.dx, monStep.dy, false), reason: 'engage_monster' };
        }
        if (objs.length > 0) {
            const nearestObj = objs[0];
            const objStep = this._bfsNextStep(map, p.x, p.y, (_t, x, y) => x === nearestObj.x && y === nearestObj.y, true);
            if (objStep) return { key: dirToKey(objStep.dx, objStep.dy, false), reason: 'seek_loot' };
        }

        // 13. Explore nearest unvisited reachable tile
        const visited = this._visitedSet(p.depth, p.branch || '');
        const exploreStep = this._bfsNextStep(map, p.x, p.y, (t, x, y) => {
            if (visited.has(`${x},${y}`)) return false;
            if (isStoreFeat(t.f) && this.inStoreCooldown > 0) return false;
            return isWalkableTile(t, false);
        }, true);
        if (exploreStep) {
            const nt = getTile(map, p.x + exploreStep.dx, p.y + exploreStep.dy);
            if (nt && (nt.f === FEAT_DOOR_CLOSED || nt.g === '+') && !this.openedDoors.has(`${p.depth}:${nt.x},${nt.y}`)) {
                this.openedDoors.add(`${p.depth}:${nt.x},${nt.y}`);
                const openKey = ActionCatalog.keyFor('open', this.realm) || 'o';
                this.pendingQueue.push({ key: dirToKey(exploreStep.dx, exploreStep.dy, true), tag: 'open_door_dir' });
                return { key: openKey, reason: 'open_door_explore' };
            }
            return { key: dirToKey(exploreStep.dx, exploreStep.dy, false), reason: 'explore_frontier' };
        }

        // 14. Fallback: step in a walkable seeded random direction or search
        const validDirs = DIR_KEYS.filter((d) => {
            if (this.diagonalDoorwayBlocked && d.dx !== 0 && d.dy !== 0) return false;
            const nt = getTile(map, p.x + d.dx, p.y + d.dy);
            return isWalkableTile(nt, false);
        });
        if (validDirs.length > 0) {
            const pick = validDirs[Math.floor(this.rng() * validDirs.length)];
            return { key: pick.key, reason: 'random_walkable_step' };
        }
        return { key: 's', reason: 'search_fallback' };
    }
}

async function driveWizardEndgame(driver, realm, lang = 'en') {
    const result = { supported: false, jumpedDepth: false, issues: [] };
    try {
        let f = await driver.sendKey('C-w', 6000);
        for (let i = 0; i < 6; i++) {
            const dec = decodeSjisIfNeeded(SC.rawScreenText(f), realm, lang).toLowerCase();
            if (dec.includes('only permitted in special builds') || dec.includes('not permitted')) {
                result.reason = 'WIZARD_UNAVAILABLE_IN_BUILD';
                return result;
            }
            if (f.player && f.player.wizard) break;
            if (f.ui && f.ui.more) { f = await driver.sendKey('enter', 6000); continue; }
            if (dec.includes('are you sure') || dec.includes('[y/n]') || dec.includes('(y/n)')) {
                f = await driver.sendKey('y', 6000);
                continue;
            }
            break;
        }
        if (!f.player || !f.player.wizard) {
            result.reason = 'WIZARD_DID_NOT_ENABLE';
            return result;
        }
        result.supported = true;

        // Try C-a then 'j' (jump depth) to deep floor (e.g. 20 or 50)
        f = await driver.sendKey('C-a', 6000);
        if (driver.screenContains('are you sure') || driver.screenContains('[y/n]')) {
            f = await driver.sendKey('y', 6000);
        }
        f = await driver.sendKey('j', 6000);
        const targetDepth = realm === 'silq' ? '15' : '50';
        f = await driver.sendKeys(`${targetDepth}`, 6000);
        f = await driver.sendKey('enter', 6000);
        for (let i = 0; i < 4 && f.ui && f.ui.more; i++) {
            f = await driver.sendKey('enter', 6000);
        }
        if (f.player && f.player.depth >= 10) {
            result.jumpedDepth = true;
            result.depthReached = f.player.depth;
        }
    } catch (err) {
        result.issues.push({
            severity: 'P1',
            realm,
            subsystem: 'wizard_endgame',
            code: 'P1_WIZARD_PROBE_ERROR',
            message: err.message
        });
    }
    return result;
}

module.exports = {
    YendorBot,
    mulberry32,
    dirToKey,
    getTile,
    isWalkableTile,
    driveWizardEndgame
};

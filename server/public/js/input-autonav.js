/**
 * input-autonav.js — A* Minimap Pathfinding, BFS Auto-Explore & StreetView Safe-Nav.
 * Extracted from input.js (Wave 0) to enforce modular LOC budgets with zero behavioral drift.
 */
(function (root) {
    'use strict';

    function attachAutoNav(InputControllerClass) {
        if (!InputControllerClass || !InputControllerClass.prototype) return;
        const InputProto = InputControllerClass.prototype;

        InputProto.isAutoNavigating = function isAutoNavigating() {
            return Boolean(this._autoNav && this._autoNav.active);
        };

        InputProto.getWorldDirectionKey = function getWorldDirectionKey(dx, dy) {
            if (dx === 0 && dy === -1) return 'up';
            if (dx === 1 && dy === -1) return 'pageup';
            if (dx === 1 && dy === 0) return 'right';
            if (dx === 1 && dy === 1) return 'pagedown';
            if (dx === 0 && dy === 1) return 'down';
            if (dx === -1 && dy === 1) return 'end';
            if (dx === -1 && dy === 0) return 'left';
            if (dx === -1 && dy === -1) return 'home';
            return null;
        };

        InputProto._isTileWalkableForNav = function _isTileWalkableForNav(map, x, y, allowUnexplored = false, outdoors = false) {
            if (!map || !Array.isArray(map.rows)) return { walkable: false, cost: Infinity, isClosedDoor: false, isTrap: false, isStore: false };
            const h = map.h || map.rows.length;
            const w = map.w || (map.rows[0] && map.rows[0].g ? map.rows[0].g.length : 0);
            if (y < 0 || y >= h || x < 0 || x >= w) return { walkable: false, cost: Infinity, isClosedDoor: false, isTrap: false, isStore: false };
            const row = map.rows[y];
            if (!row) return { walkable: false, cost: Infinity, isClosedDoor: false, isTrap: false, isStore: false };

            const ch = (row.g && x < row.g.length) ? row.g[x] : ' ';
            const feat = this.getFeatAt ? this.getFeatAt(map, x, y) : 0;
            const flagStr = row.l || row.v;
            if (!allowUnexplored && !outdoors) {
                if (flagStr && x < flagStr.length) {
                    const flag = parseInt(flagStr[x], 16) || 0;
                    if ((flag & 0x3) === 0) {
                        return { walkable: false, cost: Infinity, isClosedDoor: false, isTrap: false, isStore: false };
                    }
                } else if (ch === ' ' && feat === 0) {
                    return { walkable: false, cost: Infinity, isClosedDoor: false, isTrap: false, isStore: false };
                }
            } else if (!allowUnexplored && outdoors && ch === ' ' && feat === 0) {
                return { walkable: false, cost: Infinity, isClosedDoor: false, isTrap: false, isStore: false };
            }

            if (ch === '#' || ch === '%' || ch === '*' || ch === ':' || (!outdoors && ch === '~') || feat === 0 || (feat >= 15 && feat <= 23) || (feat === 25 && ch !== '.' && ch !== ',' && ch !== '\'') || feat === 29 || feat === 30 || (!outdoors && (feat === 31 || feat === 32)) || feat === 41) {
                return { walkable: false, cost: Infinity, isClosedDoor: false, isTrap: false, isStore: false };
            }
            if (ch === '^') {
                return { walkable: true, cost: 12.0, isClosedDoor: false, isTrap: true, isStore: false };
            }
            if ((feat >= 7 && feat <= 14) || (outdoors && feat >= 32 && feat <= 40) || (ch >= '1' && ch <= '9')) {
                return { walkable: true, cost: 8.0, isClosedDoor: false, isTrap: false, isStore: true };
            }
            if (ch === '+' || feat === 2) {
                return { walkable: true, cost: 1.4, isClosedDoor: true, isTrap: false, isStore: false };
            }
            return { walkable: true, cost: 1.0, isClosedDoor: false, isTrap: false, isStore: false };
        };

        InputProto.computeMinimapPath = function computeMinimapPath(arg1, arg2, arg3, arg4, arg5, arg6) {
            let frame, startX, startY, goalX, goalY, opts;
            if (arg1 && typeof arg1 === 'object' && arg1.map) { frame = arg1; startX = arg2; startY = arg3; goalX = arg4; goalY = arg5; opts = arg6; }
            else if (arg5 && typeof arg5 === 'object' && arg5.map) { startX = arg1; startY = arg2; goalX = arg3; goalY = arg4; frame = arg5; opts = arg6; }
            else { frame = (this.app && this.app.lastFrame) || (typeof window !== 'undefined' && window.__app && window.__app.lastFrame) || null; startX = arg1; startY = arg2; goalX = arg3; goalY = arg4; opts = arg5; }
            if (!frame || !frame.map || !Array.isArray(frame.map.rows)) return [];
            const map = frame.map, outdoors = Boolean((frame.player && frame.player.depth === 0) || frame.is_wild_mode);
            const sx = Math.round(Number(startX)), sy = Math.round(Number(startY));
            let gx = Math.round(Number(goalX)), gy = Math.round(Number(goalY));
            if (sx === gx && sy === gy) return [];
            const w = map.w || (map.rows[0] && map.rows[0].g ? map.rows[0].g.length : 80), keyOf = (x, y) => y * w + x;
            const occupiedByCreature = new Set();
            if (Array.isArray(frame.monsters)) {
                for (const m of frame.monsters) {
                    if (m && m.visible !== false && typeof m.x === 'number' && typeof m.y === 'number' && !(m.x === sx && m.y === sy)) {
                        if (m.captive || !(m.isPet || m.pet)) occupiedByCreature.add(keyOf(m.x, m.y));
                    }
                }
            }
            const goalOccupied = occupiedByCreature.has(keyOf(gx, gy));
            if (goalOccupied && !(opts && opts.stopAdjacent)) return [];
            const goalCheck = this._isTileWalkableForNav(map, gx, gy, false, outdoors);
            if (!goalCheck.walkable || goalOccupied) {
                const adj = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }];
                let bestNeighbor = null, bestDist = Infinity;
                for (const d of adj) {
                    const nx = gx + d.dx, ny = gy + d.dy;
                    if (occupiedByCreature.has(keyOf(nx, ny))) continue;
                    const nc = this._isTileWalkableForNav(map, nx, ny, false, outdoors);
                    if (nc.walkable && !nc.isTrap && !nc.isStore) {
                        const dist = Math.hypot(nx - sx, ny - sy);
                        if (dist < bestDist) { bestDist = dist; bestNeighbor = { x: nx, y: ny, check: nc }; }
                    }
                }
                if (!bestNeighbor) return [];
                gx = bestNeighbor.x; gy = bestNeighbor.y;
                if (sx === gx && sy === gy) return [];
            }
            const octile = (x1, y1, x2, y2) => { const dx = Math.abs(x1 - x2), dy = Math.abs(y1 - y2); return (dx + dy) + (1.41421356 - 2) * Math.min(dx, dy); };
            const open = [{ x: sx, y: sy, g: 0, f: octile(sx, sy, gx, gy) }], gScore = new Map(), cameFrom = new Map(), stepMeta = new Map(), closed = new Set();
            gScore.set(keyOf(sx, sy), 0);
            const dirs = [{ dx: 0, dy: -1, w: 1.0 }, { dx: 1, dy: 0, w: 1.0 }, { dx: 0, dy: 1, w: 1.0 }, { dx: -1, dy: 0, w: 1.0 }, { dx: 1, dy: -1, w: 1.4142 }, { dx: 1, dy: 1, w: 1.4142 }, { dx: -1, dy: 1, w: 1.4142 }, { dx: -1, dy: -1, w: 1.4142 }];
            let iterations = 0;
            while (open.length > 0 && iterations++ < 4500) {
                let bestIdx = 0;
                for (let i = 1; i < open.length; i++) { if (open[i].f < open[bestIdx].f) bestIdx = i; }
                const cur = open.splice(bestIdx, 1)[0], curKey = keyOf(cur.x, cur.y);
                if (cur.x === gx && cur.y === gy) {
                    const path = [];
                    for (let k = curKey; cameFrom.has(k); k = cameFrom.get(k)) path.push(stepMeta.get(k));
                    return path.reverse();
                }
                if (closed.has(curKey)) continue;
                closed.add(curKey);
                for (const d of dirs) {
                    const nx = cur.x + d.dx, ny = cur.y + d.dy, nKey = keyOf(nx, ny);
                    if (closed.has(nKey) || occupiedByCreature.has(nKey)) continue;
                    const tileInfo = this._isTileWalkableForNav(map, nx, ny, false, outdoors);
                    const allowStoreWalk = ['ryod', 'nethack', 'dcss', 'brogue', 'rogue'].includes(String(this.realm || frame.realm || '').toLowerCase());
                    if (!tileInfo.walkable || (tileInfo.isTrap && !(nx === gx && ny === gy)) || (tileInfo.isStore && !allowStoreWalk && !(nx === gx && ny === gy))) continue;
                    const tentativeG = cur.g + d.w * tileInfo.cost, prevG = gScore.get(nKey);
                    if (prevG === undefined || tentativeG < prevG) {
                        gScore.set(nKey, tentativeG); cameFrom.set(nKey, curKey);
                        stepMeta.set(nKey, { x: nx, y: ny, isClosedDoor: tileInfo.isClosedDoor, isTrap: tileInfo.isTrap });
                        open.push({ x: nx, y: ny, g: tentativeG, f: tentativeG + octile(nx, ny, gx, gy) });
                    }
                }
            }
            return [];
        };

        InputProto._statusSignatureOf = function _statusSignatureOf(player) {
            if (!player) return '';
            const st = Array.isArray(player.statuses) ? player.statuses.map((s) => `${s.name || ''}:${s.val || 0}`).sort().join('|') : '';
            return `${st}::${player.blind ? 1 : 0}:${player.confused ? 1 : 0}:${player.poisoned ? 1 : 0}:${player.afraid ? 1 : 0}:${player.cut ? 1 : 0}:${player.stun ? 1 : 0}`;
        };

        InputProto._itemSignatureOf = function _itemSignatureOf(frame) {
            const items = (frame && Array.isArray(frame.items)) ? frame.items : ((frame && Array.isArray(frame.objects)) ? frame.objects : []);
            return items.map((it) => `${it.x},${it.y}:${it.name || it.glyph || ''}`).sort().join('|');
        };

        if (!Object.getOwnPropertyDescriptor(InputProto, '_minimapNavPath')) {
            Object.defineProperty(InputProto, '_minimapNavPath', {
                get() {
                    return (this._autoNav && this._autoNav.active && Array.isArray(this._autoNav.path)) ? this._autoNav.path : null;
                },
                configurable: true
            });
        }

        InputProto.canEngageStreetViewNav = function canEngageStreetViewNav(frame = null) {
            const effFrame = frame || (this.app && this.app.lastFrame) || (typeof window !== 'undefined' && window.__app && window.__app.lastFrame) || null;
            if (this.dungeon && this.dungeon.canEngageStreetViewNav !== this._boundDungeonCanEngage) {
                this._boundDungeonCanEngage = (f) => this.canEngageStreetViewNav(f);
                this.dungeon.canEngageStreetViewNav = this._boundDungeonCanEngage;
            }
            if (!effFrame || !effFrame.player || !effFrame.map || effFrame.phase !== 'play' || (effFrame.ui?.overlay || 0) > 0) return false;
            if (!effFrame.ui?.awaiting_command && !effFrame.ui?.more) return false;
            const player = effFrame.player, statuses = Array.isArray(player.statuses) ? player.statuses : [];
            if (statuses.some(s => /blind|confus|paralyz|stun|afraid|hallucinat|盲目|混乱|麻痺|朦朧|恐怖|幻覚/i.test(typeof s === 'string' ? s : (s && s.name ? s.name : '')))) return false;
            const px = player.x, py = player.y;
            if (px === undefined || py === undefined) return false;
            const monsters = Array.isArray(effFrame.monsters) ? effFrame.monsters : [];
            const r = (this.realm || (effFrame && effFrame.realm) || 'angband').toLowerCase(), depth = player.depth || 0;
            for (const m of monsters) {
                if (!m || m.visible === false || m.ml === false || m.captive || m.friendly || m.pet || m.peaceful) continue;
                if (depth === 0 && r !== 'silq') {
                    const isDamaged = (typeof m.hp === 'number' && typeof m.hp_max === 'number' && m.hp < m.hp_max);
                    const hasHostileFlag = Boolean(m.hostile || m.is_hostile || (m.status && /hostile|anger|alert/i.test(m.status)));
                    if (!isDamaged && !hasHostileFlag) continue;
                }
                if (Math.max(Math.abs(m.x - px), Math.abs(m.y - py)) <= 2) return false;
            }
            return true;
        };

        InputProto._syncExploreButtonUI = function _syncExploreButtonUI(active) {
            if (typeof document === 'undefined') return;
            const btn = document.getElementById('btn-explore');
            if (!btn) return;
            btn.classList.toggle('is-running', Boolean(active));
            btn.classList.toggle('action-suggested', Boolean(active));
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.innerHTML = active ? '🧭 Exploring <kbd>Alt+E</kbd>' : '🧭 Explore <kbd>Alt+E</kbd>';
        };

        InputProto._isTileUnexplored = function _isTileUnexplored(map, x, y, outdoors = false) {
            if (!map || !Array.isArray(map.rows)) return false;
            const h = map.h || map.rows.length, w = map.w || (map.rows[0] && map.rows[0].g ? map.rows[0].g.length : 0);
            if (y < 0 || y >= h || x < 0 || x >= w) return false;
            const row = map.rows[y];
            if (!row) return false;
            const ch = (row.g && x < row.g.length) ? row.g[x] : ' ';
            const feat = this.getFeatAt ? this.getFeatAt(map, x, y) : 0;
            const flagStr = row.l || row.v;
            if (!outdoors && flagStr && x < flagStr.length) return ((parseInt(flagStr[x], 16) || 0) & 0x3) === 0;
            return ch === ' ' && feat === 0;
        };

        InputProto.findNextAutoExploreGoal = function findNextAutoExploreGoal(frame, visitedGoals = null) {
            if (!frame || !frame.player || !frame.map || !Array.isArray(frame.map.rows)) return null;
            const map = frame.map, px = frame.player.x, py = frame.player.y;
            const outdoors = Boolean((frame.player.depth === 0) || frame.is_wild_mode);
            const h = map.h || map.rows.length, w = map.w || (map.rows[0] && map.rows[0].g ? map.rows[0].g.length : 80);
            const dirs = [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]];
            const seen = visitedGoals || new Set();

            const items = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);
            let bestItemGoal = null;
            for (const it of items) {
                if (!it || typeof it.x !== 'number' || typeof it.y !== 'number' || (it.x === px && it.y === py)) continue;
                const k = `${it.x},${it.y}`;
                if (seen.has(k)) continue;
                const p = this.computeMinimapPath(frame, px, py, it.x, it.y);
                if (p && p.length > 0 && (!bestItemGoal || p.length < bestItemGoal.path.length)) {
                    bestItemGoal = { x: it.x, y: it.y, path: p, reason: 'item' };
                }
            }
            if (Array.isArray(frame.monsters)) {
                for (const m of frame.monsters) {
                    if (!m || !m.captive || seen.has(`${m.x},${m.y}`)) continue;
                    for (const [dx, dy] of dirs) {
                        const ax = m.x + dx, ay = m.y + dy;
                        if (seen.has(`${ax},${ay}`)) continue;
                        const p = this.computeMinimapPath(frame, px, py, ax, ay);
                        if (p && p.length > 0 && (!bestItemGoal || p.length < bestItemGoal.path.length)) {
                            bestItemGoal = { x: ax, y: ay, path: p, reason: 'captive' };
                        }
                    }
                }
            }
            if (bestItemGoal) return bestItemGoal;

            const visited = new Uint8Array(w * h);
            const queue = [{ x: px, y: py }];
            visited[py * w + px] = 1;
            let stairsGoal = null;

            for (let head = 0; head < queue.length; head++) {
                const cur = queue[head];
                const isStart = (cur.x === px && cur.y === py);
                const row = map.rows[cur.y];
                const ch = (row && row.g && cur.x < row.g.length) ? row.g[cur.x] : ' ';
                const tile = isStart ? { walkable: true, isClosedDoor: false, isTrap: false, isStore: false } : this._isTileWalkableForNav(map, cur.x, cur.y, false, outdoors);
                if (!isStart && !seen.has(`${cur.x},${cur.y}`)) {
                    let bordersUnexplored = false;
                    for (let i = 0; i < 8; i++) {
                        if (this._isTileUnexplored(map, cur.x + dirs[i][0], cur.y + dirs[i][1], outdoors)) { bordersUnexplored = true; break; }
                    }
                    if ((bordersUnexplored || ch === '_' || ch === '{') && !tile.isTrap && !tile.isStore) {
                        const p = this.computeMinimapPath(frame, px, py, cur.x, cur.y);
                        if (p && p.length > 0) return { x: cur.x, y: cur.y, path: p, reason: (ch === '_' || ch === '{') ? 'poi' : 'frontier' };
                    }
                    if (!stairsGoal && ch === '>') {
                        const p = this.computeMinimapPath(frame, px, py, cur.x, cur.y);
                        if (p && p.length > 0) stairsGoal = { x: cur.x, y: cur.y, path: p, reason: 'stairs' };
                    }
                }
                if (tile.isClosedDoor && !isStart) continue;
                for (let i = 0; i < 8; i++) {
                    const nx = cur.x + dirs[i][0], ny = cur.y + dirs[i][1];
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                    const idx = ny * w + nx;
                    if (visited[idx]) continue;
                    const nt = this._isTileWalkableForNav(map, nx, ny, false, outdoors);
                    if (!nt.walkable || nt.isTrap) continue;
                    visited[idx] = 1;
                    queue.push({ x: nx, y: ny });
                }
            }
            return stairsGoal;
        };

        InputProto.toggleAutoExplore = function toggleAutoExplore(frameOverride = null) {
            const winApp = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
            const hud = (this.app && this.app.hud) || (winApp && winApp.hud);
            if (this.isAutoNavigating()) {
                this.stopMinimapAutoNav('Auto-Explore paused');
                return false;
            }
            const frame = frameOverride || (this.app && this.app.lastFrame) || (winApp && winApp.lastFrame) || null;
            if (!frame || !frame.player || !frame.map) return false;
            const hostile = Array.isArray(frame.monsters) ? frame.monsters.find(m => m && m.visible !== false && (this.isHostileMonster ? this.isHostileMonster(m, frame) : (!m.captive && !m.friendly && !m.pet && !m.peaceful && m.hostile !== false))) : null;
            if (hostile && (frame.player.depth || 0) > 0) {
                if (hud && typeof hud.showToast === 'function') hud.showToast(`Cannot Auto-Explore: ${hostile.name || 'hostile creature'} nearby!`);
                return false;
            }
            const visitedGoals = new Set([`${frame.player.x},${frame.player.y}`]);
            const nextGoal = this.findNextAutoExploreGoal(frame, visitedGoals);
            if (!nextGoal) {
                if (hud && typeof hud.showToast === 'function') hud.showToast('🧭 Floor is already fully explored!');
                return false;
            }
            const started = this.startMinimapAutoNav(nextGoal.x, nextGoal.y, frame, { isExplore: true, visitedGoals });
            if (started && hud && typeof hud.showToast === 'function') hud.showToast('🧭 Auto-Explore engaged [Alt+E or any key to stop]');
            return started;
        };

        InputProto.startMinimapAutoNav = function startMinimapAutoNav(goalX, goalY, frameOverride = null, opts = null) {
            const winApp = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
            const frame = frameOverride || (this.app && this.app.lastFrame) || (winApp && winApp.lastFrame) || null;
            if (!frame || !frame.player || !frame.map) return false;
            const px = frame.player.x, py = frame.player.y;
            const rxGoal = Math.round(Number(goalX)), ryGoal = Math.round(Number(goalY));

            if (this.isAutoNavigating()) {
                const curGoalX = this._autoNav.goalX, curGoalY = this._autoNav.goalY;
                if ((rxGoal === px && ryGoal === py) || (rxGoal === curGoalX && ryGoal === curGoalY)) {
                    this.stopMinimapAutoNav('Cancelled');
                    return false;
                }
                this.stopMinimapAutoNav('');
            }

            const stopAdjacent = Boolean(opts && opts.stopAdjacent);
            const pickupOnArrival = Boolean(opts && opts.pickupOnArrival);
            const path = this.computeMinimapPath(frame, px, py, rxGoal, ryGoal, { stopAdjacent });
            const hud = (this.app && this.app.hud) || (winApp && winApp.hud);
            if (!path || path.length === 0) {
                if (Math.abs(rxGoal - px) <= 1 && Math.abs(ryGoal - py) <= 1 && (rxGoal !== px || ryGoal !== py)) {
                    const wk = this.getWorldDirectionKey(rxGoal - px, ryGoal - py);
                    if (wk) { this.sendMovementKey(wk); return true; }
                }
                if (this.audio && typeof this.audio.playWallBump === 'function') this.audio.playWallBump(0.45);
                if (hud && typeof hud.showToast === 'function') hud.showToast(`No clear explored route to (${rxGoal}, ${ryGoal})`);
                return false;
            }

            const isHostile = (m) => m && m.visible !== false && (this.isHostileMonster ? this.isHostileMonster(m, frame) : (!m.captive && !m.friendly && !m.pet && !m.peaceful && m.hostile !== false));
            const visibleMonsters = Array.isArray(frame.monsters) ? frame.monsters.filter(isHostile) : [];
            const baselineMonsterKeys = new Set(visibleMonsters.map((m) => `${m.name || m.race || ''}|${m.glyph || ''}`));
            const hadAdjacentMonsterAtStart = visibleMonsters.some((m) => Math.max(Math.abs(m.x - px), Math.abs(m.y - py)) <= 1);
            const isExplore = Boolean(opts && opts.isExplore);

            this._autoNav = {
                active: true, isExplore, stopAdjacent, pickupOnArrival,
                visitedGoals: (opts && opts.visitedGoals) ? opts.visitedGoals : new Set([`${px},${py}`]),
                goalX: path[path.length - 1].x, goalY: path[path.length - 1].y, path: path.slice(),
                lastHp: Number(frame.player.hp ?? 0), startStatusesSig: this._statusSignatureOf(frame.player),
                baselineItemSig: this._itemSignatureOf(frame), baselineMonsterCount: visibleMonsters.length,
                baselineMonsterKeys, hadAdjacentMonsterAtStart, startDepth: frame.player.depth,
                lastPlayerX: px, lastPlayerY: py, expectedX: null, expectedY: null, openingDoorAt: null, stepTimer: null
            };
            this._syncExploreButtonUI(isExplore);

            if (hud && typeof hud.updateMinimap === 'function') { hud._lastMinimapSig = ''; hud.updateMinimap(frame); }
            const term = this.terminal || (this.app && this.app.terminal) || (winApp && winApp.terminal);
            if (term && typeof term.render === 'function' && frame && frame.term) term.render(frame.term);

            this.stepMinimapAutoNav(frame, true);
            return true;
        };

        InputProto.stopMinimapAutoNav = function stopMinimapAutoNav(reason = '') {
            if (!this._autoNav || !this._autoNav.active) return;
            const wasExplore = Boolean(this._autoNav.isExplore);
            if (this._autoNav.stepTimer) clearTimeout(this._autoNav.stepTimer);
            this._autoNav.active = false;
            this._autoNav.path = [];
            this._autoNav = null;
            this._syncExploreButtonUI(false);

            const winApp = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
            const hud = (this.app && this.app.hud) || (winApp && winApp.hud);
            const frame = (this.app && this.app.lastFrame) || (winApp && winApp.lastFrame) || null;
            if (hud && frame && typeof hud.updateMinimap === 'function') { hud._lastMinimapSig = ''; hud.updateMinimap(frame); }
            const term = this.terminal || (this.app && this.app.terminal) || (winApp && winApp.terminal);
            if (term && typeof term.render === 'function' && frame && frame.term) term.render(frame.term);
            if (reason && reason !== 'Reached destination' && reason !== 'Cancelled' && hud && typeof hud.showToast === 'function') {
                hud.showToast(`${wasExplore ? '🧭 Auto-Explore' : 'Auto-travel'} stopped: ${reason}`);
            }
        };

        InputProto.stepMinimapAutoNav = function stepMinimapAutoNav(frame, isInitial = false) {
            if (!this._autoNav || !this._autoNav.active || !frame || !frame.player) return;
            const nav = this._autoNav, player = frame.player, px = player.x, py = player.y, ui = frame.ui || {};
            if (nav.visitedGoals) nav.visitedGoals.add(`${px},${py}`);

            if (frame.phase !== 'play' || (ui.overlay || 0) > 0 || ui.awaiting_command === false) {
                this.stopMinimapAutoNav('Prompt requires attention'); return;
            }
            if (ui.more) {
                if (isInitial && this.network && typeof this.network.sendKey === 'function') {
                    this.network.sendKey('space');
                    if (nav.stepTimer) clearTimeout(nav.stepTimer);
                    nav.stepTimer = setTimeout(() => {
                        const winApp = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
                        this.stepMinimapAutoNav((this.app && this.app.lastFrame) || (winApp && winApp.lastFrame) || frame, true);
                    }, 48);
                    return;
                }
                this.stopMinimapAutoNav('Prompt requires attention'); return;
            }
            if (player.depth !== nav.startDepth) { this.stopMinimapAutoNav('Entered new level'); return; }

            const curHp = Number(player.hp ?? 0);
            if (curHp < nav.lastHp) { this.stopMinimapAutoNav('Took damage!'); return; }
            nav.lastHp = curHp;

            if (this._statusSignatureOf(player) !== nav.startStatusesSig) {
                this.stopMinimapAutoNav('Status condition changed!'); return;
            }

            const isHostile = (m) => m && m.visible !== false && (this.isHostileMonster ? this.isHostileMonster(m, frame) : (!m.captive && !m.friendly && !m.pet && !m.peaceful && m.hostile !== false));
            const visibleMonsters = Array.isArray(frame.monsters) ? frame.monsters.filter(isHostile) : [];
            if (!isInitial && visibleMonsters.length > 0) {
                const isDungeon = (player.depth || 0) > 0;
                const newlySpotted = visibleMonsters.find((m) => !nav.baselineMonsterKeys || !nav.baselineMonsterKeys.has(`${m.name || ''}|${m.glyph || ''}`));
                const countIncreased = visibleMonsters.length > (nav.baselineMonsterCount || 0);
                const adjacentMon = visibleMonsters.find((m) => Math.max(Math.abs(m.x - px), Math.abs(m.y - py)) <= 1);
                if (isDungeon && (newlySpotted || countIncreased || (adjacentMon && !nav.hadAdjacentMonsterAtStart) || nav.isExplore)) {
                    const targetMon = newlySpotted || adjacentMon || visibleMonsters[0];
                    this.stopMinimapAutoNav(`Spotted ${targetMon.name || 'a hostile creature'}!`); return;
                }
            }

            const items = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);
            const curItemSig = this._itemSignatureOf(frame);
            const atGoalWithPickup = Boolean(nav.pickupOnArrival && px === nav.goalX && py === nav.goalY);
            const steppedOnItem = !isInitial && !atGoalWithPickup && items.some((it) => it && it.x === px && it.y === py);
            if (steppedOnItem || (!isInitial && !nav.isExplore && !nav.pickupOnArrival && curItemSig !== nav.baselineItemSig && items.length > 0)) {
                this.stopMinimapAutoNav('Discovered an item!'); return;
            }

            const outdoors = Boolean((player.depth === 0) || frame.is_wild_mode);
            if (!isInitial) {
                if (nav.openingDoorAt) {
                    const doorTile = this._isTileWalkableForNav(frame.map, nav.openingDoorAt.x, nav.openingDoorAt.y, false, outdoors);
                    nav.openingDoorAt = null;
                    if (doorTile.isClosedDoor) { this.stopMinimapAutoNav('Door is locked or blocked'); return; }
                } else if (nav.expectedX !== null && nav.expectedY !== null) {
                    if (px === nav.expectedX && py === nav.expectedY) nav.path.shift();
                    else if (nav.isExplore) nav.path = [];
                    else { this.stopMinimapAutoNav('Path blocked'); return; }
                }
            }

            if (nav.stopAdjacent && Math.max(Math.abs(nav.goalX - px), Math.abs(nav.goalY - py)) <= 1) {
                this.stopMinimapAutoNav('Reached target'); return;
            }
            if ((px === nav.goalX && py === nav.goalY) || nav.path.length === 0) {
                if (nav.isExplore) {
                    if (nav.visitedGoals) nav.visitedGoals.add(`${nav.goalX},${nav.goalY}`);
                    const nextGoal = this.findNextAutoExploreGoal(frame, nav.visitedGoals);
                    if (nextGoal && nextGoal.path && nextGoal.path.length > 0) {
                        nav.goalX = nextGoal.x; nav.goalY = nextGoal.y; nav.path = nextGoal.path.slice();
                        nav.expectedX = null; nav.expectedY = null;
                    } else {
                        const row = frame.map && frame.map.rows && frame.map.rows[py];
                        const onStairs = row && row.g && row.g[px] === '>';
                        this.stopMinimapAutoNav(onStairs ? 'Floor explored — ready at stairs [>]' : 'Floor fully explored!');
                        return;
                    }
                } else {
                    const shouldPickup = Boolean(nav.pickupOnArrival && px === nav.goalX && py === nav.goalY && items.some((it) => it && it.x === px && it.y === py));
                    this.stopMinimapAutoNav('Reached destination');
                    if (shouldPickup && this.network && typeof this.network.sendKey === 'function') {
                        const winApp = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
                        const rk = String((this.app && typeof this.app.getActiveRealm === 'function' ? this.app.getActiveRealm() : '') || (winApp && typeof winApp.getActiveRealm === 'function' ? winApp.getActiveRealm() : '') || frame.realm || 'angband').toLowerCase();
                        const fb = (rk === 'nethack' || rk === 'rogue') ? ',' : 'g';
                        const pKey = (typeof RealmKeys !== 'undefined' && typeof RealmKeys.realmKey === 'function') ? (RealmKeys.realmKey('pickup', rk) || fb) : fb;
                        this.network.sendKey(pKey);
                    }
                    return;
                }
            }

            let nextStep = nav.path[0];
            if (Array.isArray(frame.monsters) && frame.monsters.some((m) => m && m.visible !== false && m.x === nextStep.x && m.y === nextStep.y && (m.captive || !(m.isPet || m.pet)))) {
                const detour = this.computeMinimapPath(frame, px, py, nav.goalX, nav.goalY);
                if (!detour || detour.length === 0) { this.stopMinimapAutoNav('Path blocked'); return; }
                nav.path = detour; nextStep = nav.path[0];
            }

            const dx = nextStep.x - px, dy = nextStep.y - py;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
                this.stopMinimapAutoNav('Route diverged'); return;
            }
            const worldKey = this.getWorldDirectionKey(dx, dy);
            if (!worldKey) { this.stopMinimapAutoNav('Invalid step direction'); return; }

            if (this.dungeon && !this.inTerminal) {
                const look = nav.path[Math.min(2, nav.path.length - 1)] || nextStep;
                const lx = look.x - px, ly = look.y - py;
                if (typeof this.dungeon.orientCameraTowardStep === 'function') {
                    this.dungeon.orientCameraTowardStep(dx, dy, lx, ly);
                } else if (lx !== 0 || ly !== 0) {
                    const targetYaw = Math.atan2(-lx, -ly);
                    if (typeof this.dungeon.setCameraYaw === 'function') this.dungeon.setCameraYaw(targetYaw);
                    else if (typeof this.dungeon.cameraYaw === 'number') this.dungeon.cameraYaw = targetYaw;
                }
            }

            if (nav.stepTimer) clearTimeout(nav.stepTimer);
            const dispatchStep = () => {
                if (!this._autoNav || !this._autoNav.active) return;
                const liveTile = this._isTileWalkableForNav(frame.map, nextStep.x, nextStep.y, false, outdoors);
                if (liveTile.isClosedDoor) {
                    nav.openingDoorAt = { x: nextStep.x, y: nextStep.y };
                    nav.expectedX = px; nav.expectedY = py;
                } else {
                    nav.expectedX = nextStep.x; nav.expectedY = nextStep.y;
                }
                if (this.network) this.network.sendKey(worldKey);
                else if (typeof this.sendMovementKey === 'function') this.sendMovementKey(worldKey);
            };
            if (isInitial) dispatchStep();
            else nav.stepTimer = setTimeout(dispatchStep, nav.isExplore ? 85 : 42);
        };
    }

    root.InputAutoNav = { attach: attachAutoNav };
    if (root.InputController) {
        attachAutoNav(root.InputController);
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { attach: attachAutoNav };
    }
})(typeof window !== 'undefined' ? window : globalThis);

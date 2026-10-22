/**
 * Angband3D Input Controller — Keyboard, Mouse, and Touch Navigation
 * Provides 1:1 parity with the Godot C# desktop client.
 */

class InputController {
    constructor(network, dungeon, terminal, audio, toggleTerminalView) {
        this.network = network;
        this.dungeon = dungeon;
        this.terminal = terminal;
        if (audio && (audio.hud || audio.lastFrame || audio.getActiveRealm)) {
            this.app = audio;
            this.audio = audio.audio || null;
            this.toggleTerminalView = toggleTerminalView || (this.app ? () => this.app.toggleTerminalView() : null);
        } else {
            this.audio = audio;
            this.toggleTerminalView = toggleTerminalView;
            this.app = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
        }

        if (this.dungeon) {
            if (typeof this.dungeon.turnLeft !== 'function') {
                this.dungeon.turnLeft = () => this.dungeon.turn(-1);
            }
            if (typeof this.dungeon.turnRight !== 'function') {
                this.dungeon.turnRight = () => this.dungeon.turn(1);
            }
            if (typeof this.dungeon.getRelativeDirection !== 'function') {
                this.dungeon.getRelativeDirection = (fwd, strafe) => (fwd > 0 ? 8 : (fwd < 0 ? 2 : (strafe < 0 ? 4 : 6)));
            }
        }

        this.inTerminal = false;
        this.smartAction = 'wait';
        this.wasdMode = (function() {
            try { return localStorage.getItem('angband3d_wasd_mode') === '1'; } catch (_) { return false; }
        })();
        this.invertDragLook = (function() {
            try { return localStorage.getItem('angband3d_invert_drag') === 'true'; } catch (_) { return false; }
        })();
        this.dpadRunMode = (function() {
            try { return localStorage.getItem('angband3d_dpad_run') === '1'; } catch (_) { return false; }
        })();
        this._wasdLiteralNext = false;
        this.setupKeyboardEvents();
        this.setupActionButtons();
        this.setupTouchEvents();
        this.setupViewportGestures();
        this.setupInvertControls();
        this.updateRunToggleUI();
        this.init();
    }

    init() {
        const btnWasd = document.getElementById('btn-wasd-toggle');
        if (btnWasd) {
            btnWasd.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleWasdMode();
                if (window.AngbandAudio && typeof window.AngbandAudio.playUiTick === 'function') {
                    window.AngbandAudio.playUiTick();
                }
            });
        }
        this.setupTouchControls();
        this.syncWasdUiState();
    }

    setupTouchControls() {
        // Touch controls are bound via bind() in initDungeonControls / setupMobileControls (CMD-P1-01)
    }

    toggleWasdMode(forceState) {
        this.wasdMode = typeof forceState === 'boolean' ? forceState : !this.wasdMode;
        try {
            localStorage.setItem('angband3d_wasd_mode', this.wasdMode ? '1' : '0');
        } catch (_) {}
        this.syncWasdUiState();
        const msg = this.wasdMode
            ? '⌨ WASD Movement ENABLED — W/S Move, A/D Turn, Shift+A/D Strafe (Wield/Drop/Search highlighted on HUD)'
            : '⌨ WASD Movement OFF — Classic Arrow Keys & W/A/S/D roguelike hotkeys restored';
        const hud = (this.app && this.app.hud) || (window.__app && window.__app.hud);
        if (hud && typeof hud.showToast === 'function') {
            hud.showToast(msg);
        } else if (window.__app && typeof window.__app.showRealmToast === 'function') {
            window.__app.showRealmToast(msg);
        }
        return this.wasdMode;
    }

    syncWasdUiState() {
        const active = Boolean(this.wasdMode);
        const btn = document.getElementById('btn-wasd-toggle');
        if (btn) {
            btn.classList.toggle('wasd-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.textContent = active ? '⌨ WASD: ON' : '⌨ WASD';
            btn.title = active
                ? 'WASD Movement Active (Alt+W to toggle off). W/S: Move, A/D: Turn, Shift+A/D: Strafe. W/A/S/D commands locked to HUD buttons.'
                : 'Toggle WASD Keyboard Movement (Alt+W). Locks W/A/S/D roguelike keys and highlights HUD command buttons.';
        }
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('wasd-mode-active', active);
        }
        const turnL = document.querySelector('#dpad-turn-left .dpad-turn-text');
        if (turnL) turnL.textContent = active ? 'Turn [A]' : 'Turn L';
        const turnR = document.querySelector('#dpad-turn-right .dpad-turn-text');
        if (turnR) turnR.textContent = active ? 'Turn [D]' : 'Turn R';
        const dpadUp = document.getElementById('dpad-up');
        if (dpadUp) dpadUp.textContent = active ? '▲ W' : '▲';
        const dpadDown = document.getElementById('dpad-down');
        if (dpadDown) dpadDown.textContent = active ? '▼ S' : '▼';
        const strafeL = document.querySelector('#dpad-left .dpad-sub-lbl');
        if (strafeL) strafeL.textContent = active ? '⇧A' : 'Strafe';
        const strafeR = document.querySelector('#dpad-right .dpad-sub-lbl');
        if (strafeR) strafeR.textContent = active ? '⇧D' : 'Strafe';
        const remappedBtnIds = ['btn-wield', 'btn-drop', 'btn-search', 'btn-fire', 'btn-cast', 'btn-inventory', 'btn-equipment'];
        for (const id of remappedBtnIds) {
            const b = document.getElementById(id);
            if (b) {
                b.classList.toggle('wasd-remapped-highlight', active);
            }
        }
    }

    sendMoveOrRun(dir, isRunning) {
        const run = (isRunning !== undefined) ? Boolean(isRunning) : this.isRunningActive();
        if (run && dir !== 5) {
            this.sendRunMove(dir);
        } else {
            const moveKey = this.getRelativeDirectionKey(dir);
            if (moveKey) this.sendMovementKey(moveKey);
        }
    }

    clearDirectionHint() {
        const el = document.getElementById('footer-diagonal-hint');
        if (el) el.style.display = 'none';
    }

    syncCompass() {
        const hud = (this.app && this.app.hud) || (window.__app && window.__app.hud);
        if (hud && typeof hud.updateFooterFacing === 'function') {
            const yaw = (this.dungeon && typeof this.dungeon.yaw === 'number') ? this.dungeon.yaw : 0;
            hud.updateFooterFacing(yaw);
        }
    }

    openContextualMenu(actionName) {
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function')
                ? window.__app.getActiveRealm()
                : 'angband');
        let keyToSend = null;
        if (actionName === 'wield') {
            keyToSend = (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla)
                ? RealmKeys.fromVanilla('w', realm)
                : 'w';
            if (this.audio && typeof this.audio.playEquipWeapon === 'function') {
                this.audio.playEquipWeapon();
            }
        } else if (actionName === 'drop') {
            keyToSend = (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla)
                ? RealmKeys.fromVanilla('d', realm)
                : 'd';
            if (this.audio && typeof this.audio.playItemDrop === 'function') {
                this.audio.playItemDrop();
            }
        } else if (actionName === 'search') {
            keyToSend = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? RealmKeys.realmKey('search', realm)
                : null;
        }
        if (keyToSend) {
            const lastFrame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
            if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                if (window.MenuRouter.route(keyToSend, lastFrame, realm)) {
                    if (this.app && typeof this.app.updateTerminalToolbar === 'function') {
                        this.app.updateTerminalToolbar(lastFrame);
                    }
                    return;
                }
            }
            this.network.sendKey(keyToSend);
        }
    }

    resolveHeroAction(frame) {
        if (!frame || !frame.player || !frame.map) {
            const realm = (this.app && typeof this.app.getActiveRealm === 'function')
                ? this.app.getActiveRealm()
                : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            return { id: 'wait', label: 'Wait', icon: '⏳', key: holdKey };
        }
        const player = frame.player;
        const px = player.x;
        const py = player.y;
        if (px === undefined || py === undefined) {
            const realm = (this.app && typeof this.app.getActiveRealm === 'function')
                ? this.app.getActiveRealm()
                : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            return { id: 'wait', label: 'Wait', icon: '⏳', key: holdKey };
        }

        const currentFeat = (this.getFeatAt && frame.map) ? this.getFeatAt(frame.map, px, py) : 0;
        const items = frame.items || frame.objects || [];
        const itemOnTile = items.find(it => it.x === px && it.y === py);

        const yaw = -(this.dungeon && typeof this.dungeon.yaw === 'number' ? this.dungeon.yaw : 0);
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const forwardOffsets = [
            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
            { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
        ];
        const fwd = forwardOffsets[sector] || { dx: 0, dy: -1 };
        const rayTarget = (this.raycastTargetAhead) ? this.raycastTargetAhead(frame, px, py, fwd) : null;

        if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist === 1) {
            return { id: 'attack', label: 'Attack', icon: '⚔', key: 'Space', target: rayTarget.data };
        }
        if (currentFeat === 6) {
            return { id: 'stair-down', label: 'Descend', icon: '⬇', key: '>' };
        }
        if (currentFeat === 5) {
            return { id: 'stair-up', label: 'Ascend', icon: '⬆', key: '<' };
        }
        if (itemOnTile) {
            return { id: 'pickup', label: 'Get', icon: '🎒', key: 'g', item: itemOnTile };
        }
        if (rayTarget && rayTarget.type === 'door' && rayTarget.dist === 1 && rayTarget.feat === 2) {
            return { id: 'open-door', label: 'Open', icon: '🚪', key: 'o' };
        }
        if (rayTarget && rayTarget.type === 'wall' && rayTarget.dist === 1 && (rayTarget.feat === 16 || rayTarget.feat === 17 || rayTarget.feat === 18)) {
            return { id: 'tunnel', label: 'Tunnel', icon: '⛏️', key: 'Shift+T' };
        }
        if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist > 1 && this.canPlayerShootRanged && this.canPlayerShootRanged(frame)) {
            return { id: 'shoot', label: 'Shoot', icon: '🏹', key: 'f', target: rayTarget.data };
        }
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
        const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
            ? (RealmKeys.realmKey('hold', realm) || ',')
            : ',';
        return { id: 'wait', label: 'Wait', icon: '⏳', key: holdKey };
    }

    updateContextButtons(frame) {
        if (!frame || !frame.player) return;
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
        this.evaluateActionBarContext(frame, realm);
    }

    /**
     * Fast Bresenham line-of-sight raycaster stepping from (px, py) to (mx, my) on frame.map.
     * Returns false if any intermediate tile is a solid wall or closed door.
     */
    _hasClearLOS(px, py, mx, my, map) {
        if (!map) return true;
        let x0 = Math.round(px);
        let y0 = Math.round(py);
        const x1 = Math.round(mx);
        const y1 = Math.round(my);

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (!(x0 === px && y0 === py) && !(x0 === x1 && y0 === y1)) {
                const feat = (this.getFeatAt && map) ? this.getFeatAt(map, x0, y0) : 0;
                let ch = ' ';
                if (map.rows && map.rows[y0] && map.rows[y0].g && x0 >= 0 && x0 < map.rows[y0].g.length) {
                    ch = map.rows[y0].g[x0];
                }
                const isWall = (feat >= 15 && feat <= 22) || feat === 30 || ch === '#' || ch === '%';
                const isClosedDoor = feat === 2 || ch === '+';
                if (isWall || isClosedDoor) return false;
            }

            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
        return true;
    }

    /**
     * Context-filters `#action-bar` buttons so only possible actions are shown,
     * highlights contextually recommended actions with `.is-suggested`, and
     * updates the 4-button `#quick-slot-bar` (gated on state signature per L25).
     */
    evaluateActionBarContext(frame, realm = 'angband') {
        if (!frame || !frame.player) return;
        const r = String(realm || 'angband').toLowerCase();
        const lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';
        const isJp = r === 'hengband' && lang === 'jp';
        const player = frame.player;

        if (typeof window !== 'undefined' && window.QuickActionManager && typeof window.QuickActionManager.renderBar === 'function') {
            window.QuickActionManager.renderBar(frame, r, lang);
        }

        const heroAction = this.resolveHeroAction ? this.resolveHeroAction(frame) : null;
        const btnHero = document.getElementById('btn-hero-action');
        const heroActive = Boolean(btnHero && btnHero.style.display !== 'none' && heroAction && heroAction.id !== 'wait');

        const px = player.x;
        const py = player.y;
        const map = frame.map;
        const inv = Array.isArray(player.inventory) ? player.inventory : [];
        const eq = Array.isArray(player.equipment) ? player.equipment : [];
        const quiv = Array.isArray(player.quiver) ? player.quiver : [];
        const monsters = Array.isArray(frame.monsters) ? frame.monsters.filter((m) => m && m.visible !== false) : [];
        const items = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);

        // 1. Scan inventory & equipment categories in a single O(N) pass
        let potionCount = 0;
        let scrollCount = 0;
        let tomeCount = 0;
        let matchingTomeCount = 0;
        let deviceCount = 0;
        let rangedInPack = 0;
        let wearableInPack = 0;
        let weaponInPack = 0;

        const isVanilla = r === 'angband';
        const pClassEarly = String(player.class || '').toLowerCase();
        const isPriestClass = /priest|paladin|monk|僧侶|パラディン/.test(pClassEarly);
        const isMageClass = /mage|wizard|sorcer|rogue|ranger|necromancer|魔道士|メイジ|レンジャー|盗賊/.test(pClassEarly);

        for (const it of inv) {
            const name = String((it && it.name) || '');
            const lower = name.toLowerCase();
            const tval = Number(it && it.tval) || 0;
            const isPotionTval = isVanilla ? (tval === 26) : (tval === 75 || tval === 71);
            const isScrollTval = isVanilla ? (tval === 25) : (tval === 70 || tval === 50);
            const isTomeTval = isVanilla ? (tval >= 30 && tval <= 34) : (tval >= 90 && tval <= 115);
            const isDeviceTval = isVanilla ? (tval >= 22 && tval <= 24) : (tval === 55 || tval === 65 || tval === 66);
            const isAmmoTval = isVanilla ? (tval >= 2 && tval <= 4) : (tval >= 16 && tval <= 18);
            const isWeaponTval = isVanilla ? (tval >= 6 && tval <= 9) : (tval >= 20 && tval <= 23);
            const isArmorTval = isVanilla ? (tval >= 10 && tval <= 21) : (tval >= 30 && tval <= 45);

            if (/\b(potion|phial|draught|elixir)\b/.test(lower) || /(の薬|水薬|霊薬|丸薬|薬$)/.test(name) || isPotionTval) {
                potionCount++;
            } else if (/\b(scroll|parchment|card|trump)\b/.test(lower) || /(の巻物|巻物|カード)/.test(name) || isScrollTval) {
                scrollCount++;
            } else if (/\b(book|tome|grimoire|manual|hymnal|songbook)\b/.test(lower) || /(魔法書|仙術書|経典|教本|『[^』]+』|\[[^\]]+の魔法書\])/.test(name) || isTomeTval) {
                tomeCount++;
                let matchesClass = true;
                if (isVanilla) {
                    if (isPriestClass && (tval === 30 || /magic|arcane|sorcery/.test(lower))) matchesClass = false;
                    if (isMageClass && (tval === 31 || /prayer|holy|piety/.test(lower))) matchesClass = false;
                }
                if (matchesClass) matchingTomeCount++;
            } else if (/\b(wand|rod|staff)\b/.test(lower) || /(魔法棒|ロッド|スタッフ|の杖)/.test(name) || isDeviceTval) {
                deviceCount++;
            }
            if ((/\b(arrow|bolt|shot|pebble|seeker|sheaf)\b/.test(lower) && !/\b(bow|crossbow|sling)\b/.test(lower)) || /(矢|弾|丸石)/.test(name) || isAmmoTval) {
                rangedInPack++;
            }
            if (/\b(sword|dagger|blade|rapier|sabre|katana|spear|lance|halberd|axe|mace|flail|hammer|whip|club)\b/.test(lower) ||
                /(剣|刀|脇差|ダガー|槍|斧|槌|メイス|フレイル|ハンマー|ムチ|棍棒)/.test(name) ||
                isWeaponTval) {
                weaponInPack++;
                wearableInPack++;
            } else if (/\b(armour|armor|mail|plate|robe|cloak|shield|helm|crown|cap|gloves|gauntlets|boots|ring|amulet|torch|lantern|bow|crossbow|sling)\b/.test(lower) ||
                       /(鎧|メイル|ローブ|クローク|盾|兜|冠|帽子|篭手|靴|指輪|アミュレット|松明|ランタン|ボウ|スリング|弓)/.test(name) ||
                       isArmorTval) {
                wearableInPack++;
            }
        }

        const hasWeaponEquipped = Boolean(player.weapon_item) || eq.some((it) => {
            const n = String((it && it.name) || '').toLowerCase();
            return /\b(sword|dagger|blade|axe|mace|spear|hammer|katana|whip|club)\b/.test(n) || Number(it && it.slot) === 0;
        });
        const hasBowEquipped = Boolean(player.bow_item) || eq.some((it) => /\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(String((it && it.name) || '')) || /(ボウ|スリング|弓)/.test(String((it && it.name) || '')) || Number(it && it.tval) === (isVanilla ? 5 : 19));
        const hasEquipQuiver = eq.some((it) => /\b(arrow|bolt|shot|pebble|seeker|sheaf)\b/i.test(String((it && it.name) || '')) || (!isVanilla && (Number(it && it.tval) >= 16 && Number(it && it.tval) <= 18)));
        const hasAmmo = quiv.length > 0 || Boolean(player.quiver_item) || hasEquipQuiver || rangedInPack > 0;

        // 2. Scan adjacent map tiles & monster distances
        let adjClosedDoors = 0;
        let adjAnyDoors = 0;
        const standingOnItem = Boolean(px !== undefined && py !== undefined && items.some((it) => it && it.x === px && it.y === py));
        const currentFeat = (this.getFeatAt && map && px !== undefined) ? this.getFeatAt(map, px, py) : 0;
        const standingStair = (currentFeat === 5 || currentFeat === 6 || (currentFeat >= 7 && currentFeat <= 14) || (currentFeat >= 32 && currentFeat <= 40));

        if (map && px !== undefined && py !== undefined) {
            const neighbors = [
                { x: px + 1, y: py }, { x: px - 1, y: py },
                { x: px, y: py + 1 }, { x: px, y: py - 1 },
                { x: px + 1, y: py - 1 }, { x: px - 1, y: py - 1 },
                { x: px + 1, y: py + 1 }, { x: px - 1, y: py + 1 }
            ];
            for (const n of neighbors) {
                const feat = this.getFeatAt ? this.getFeatAt(map, n.x, n.y) : 0;
                const row = map.rows && map.rows[n.y];
                const ch = (row && row.g && n.x >= 0 && n.x < row.g.length) ? row.g[n.x] : ' ';
                if (ch === '+' || feat === 2) {
                    adjClosedDoors++;
                    adjAnyDoors++;
                } else if (ch === '\'' || feat === 3 || feat === 4) {
                    adjAnyDoors++;
                }
            }
        }

        // 2b. Hostile Monster vs Peaceful Town NPC Filter (unified with isHostileMonster)
        const isHostile = (m) => this.isHostileMonster(m, frame);

        const hostileMonsters = monsters.filter(isHostile);
        let adjHostiles = 0;
        if (px !== undefined && py !== undefined) {
            for (const m of hostileMonsters) {
                const dist = Math.max(Math.abs(m.x - px), Math.abs(m.y - py));
                if (dist === 1) adjHostiles++;
            }
        }

        const rangedHostilesInLOS = (px !== undefined && py !== undefined && frame.map)
            ? hostileMonsters.filter(m => {
                const d = Math.max(Math.abs(m.x - px), Math.abs(m.y - py));
                return d >= 2 && d <= 10 && this._hasClearLOS(px, py, m.x, m.y, frame.map);
            }).length
            : 0;

        // 3. Player vitals & status conditions
        const curHp = Number(player.hp ?? 0);
        const maxHp = Math.max(1, Number(player.hp_max ?? 1));
        const hpPct = Math.round((curHp / maxHp) * 100);
        const curSp = Number(player.sp ?? player.csp ?? 0);
        const maxSp = Number(player.sp_max ?? player.max_sp ?? player.msp ?? 0);
        const spPct = maxSp > 0 ? Math.round((curSp / maxSp) * 100) : 100;
        const studyCount = Number(player.study || 0);
        const statuses = Array.isArray(player.statuses) ? player.statuses : [];
        const hasBadStatus = statuses.some((st) => {
            const nm = String((st && (st.name || st)) || '');
            return /(poison|confus|blind|cut|bleed|stun|afraid|fear|halluc|paralyz|毒|混乱|盲目|切傷|朦朧|恐怖|幻覚)/i.test(nm);
        });

        // 3b. Class and spell matching heuristics
        const pClass = String(player.class || '').toLowerCase();
        const isNonCaster = /warrior|berserker|archer|cavalry|sniper|ninja|smith|weaponsmith|戦士|狂戦士|アーチャー|騎兵|鍛冶師/.test(pClass) || (pClass.includes('samurai') && maxSp === 0);
        const canCastFromTome = !isNonCaster && maxSp > 0;
        const hasStudyStatus = statuses.some((s) => /\bstudy\b|学習/i.test(String((s && (s.name || s)) || '')));
        const effectiveStudyCount = studyCount || (hasStudyStatus ? 1 : 0);

        if (Array.isArray(frame.messages)) {
            const hasZeroSpellsMsg = frame.messages.some(m => {
                const text = String((m && (m.text || m)) || '');
                return /don't know any spells|cannot cast|no spells|呪文を覚えていない|呪文を唱えられない/i.test(text);
            });
            if (hasZeroSpellsMsg) {
                this._zeroSpellsSeq = effectiveStudyCount;
                this._zeroSpellsLevel = player.level || 1;
                this._zeroSpellsFlag = true;
            }
        }
        if (this._zeroSpellsFlag) {
            if (effectiveStudyCount < (this._zeroSpellsSeq || 0) || (player.level || 1) > (this._zeroSpellsLevel || 1)) {
                this._zeroSpellsFlag = false;
            }
        }
        if (curSp < maxSp && maxSp > 0) {
            this._hasCastSuccess = true;
        }

        const isFreshL1WithSlots = (player.level || 1) === 1 && effectiveStudyCount > 0 && curSp === maxSp && !this._hasCastSuccess;
        const hasKnownSpells = r === 'silq'
            ? Boolean(this._hasCastSuccess || Number(player.songs_known || 0) > 0)
            : (canCastFromTome && matchingTomeCount > 0 && !this._zeroSpellsFlag && !isFreshL1WithSlots);
        const isDisablingStatus = statuses.some(s => {
            const name = String((s && (s.name || s)) || '');
            return /blind|confus|paralyz|stun|hallucinat|盲目|混乱|麻痺|朦朧|幻覚/i.test(name);
        });

        // 4. Compute compact state signature (L25)
        const hasFullData = player.inventory !== undefined || player.hp_max !== undefined;
        const stateSig = `${r}:${lang}:${hasFullData ? 1 : 0}:${inv.length}:${eq.length}:${potionCount}:${scrollCount}:${tomeCount}:${matchingTomeCount}:${deviceCount}:${hasBowEquipped ? 1 : 0}:${hasAmmo ? 1 : 0}:${wearableInPack}:${weaponInPack}:${hasWeaponEquipped ? 1 : 0}:${adjClosedDoors}:${adjAnyDoors}:${adjHostiles}:${rangedHostilesInLOS}:${hostileMonsters.length}:${standingOnItem ? 1 : 0}:${standingStair ? 1 : 0}:${Math.floor(hpPct / 10)}:${Math.floor(spPct / 15)}:${maxSp > 0 ? 1 : 0}:${curSp}:${effectiveStudyCount}:${hasBadStatus ? 1 : 0}:${hasKnownSpells ? 1 : 0}:${isDisablingStatus ? 1 : 0}:${heroActive ? heroAction.id : 'none'}`;

        if (stateSig === this._lastActionBarContextSig) return;
        this._lastActionBarContextSig = stateSig;

        // If frame is a minimal test stub without full inventory array, keep standard buttons visible
        const hasInvTelemetry = Array.isArray(player.inventory);

        const rules = {
            'btn-attack': {
                show: adjHostiles > 0 && (!heroActive || heroAction.id !== 'attack'),
                suggest: adjHostiles > 0,
                reason: isJp ? '隣接する敵を攻撃！' : 'Adjacent enemy in melee range!'
            },
            'btn-fire': {
                show: (!hasInvTelemetry || (hasBowEquipped && hasAmmo)) && (!heroActive || heroAction.id !== 'shoot'),
                suggest: hasBowEquipped && hasAmmo && rangedHostilesInLOS > 0 && adjHostiles === 0 && !isDisablingStatus,
                reason: isJp ? '射程内に敵 — 射撃推奨' : 'Enemy in range — Shoot!'
            },
            'btn-throw': {
                show: !hasInvTelemetry || (inv.length > 0 && (hostileMonsters.length > 0 || r === 'silq')),
                suggest: r === 'silq' && rangedInPack > 0 && rangedHostilesInLOS > 0 && adjHostiles === 0,
                reason: 'Throw weapon at ranged target'
            },
            'btn-cast': {
                show: maxSp > 0 && hasKnownSpells && (!hasInvTelemetry || r === 'silq' || matchingTomeCount > 0),
                dim: !hasKnownSpells || curSp <= 0 || isDisablingStatus,
                suggest: hasKnownSpells && !isDisablingStatus && maxSp > 0 && (r === 'silq' || matchingTomeCount > 0) && (adjHostiles > 0 || rangedHostilesInLOS > 0) && curSp >= Math.max(1, maxSp * 0.20),
                reason: isJp ? '魔力あり — 呪文詠唱' : 'Mana available — Cast spell'
            },
            'btn-browse': {
                show: r !== 'silq' && maxSp > 0 && (!hasInvTelemetry || matchingTomeCount > 0),
                suggest: false
            },
            'btn-study': {
                show: r !== 'silq' && maxSp > 0 && effectiveStudyCount > 0 && (!hasInvTelemetry || matchingTomeCount > 0),
                suggest: effectiveStudyCount > 0 && matchingTomeCount > 0 && adjHostiles === 0,
                reason: isJp ? `新しい呪文を学習可能 (${effectiveStudyCount})` : `Learn new spell (${effectiveStudyCount} ready)!`
            },
            'btn-skills': {
                show: r === 'silq',
                suggest: r === 'silq' && Number(player.exp || 0) >= 500 && hostileMonsters.length === 0,
                reason: 'Spend XP on Sil-Q Abilities [Tab]'
            },
            'btn-power': {
                show: r === 'frogcomposband' || r === 'hengband',
                suggest: false,
                reason: isJp ? '特殊能力・レイシャル発動' : 'Invoke Racial/Class Power'
            },
            'btn-quaff': {
                show: !hasInvTelemetry || potionCount > 0,
                suggest: potionCount > 0 && (hpPct < 50 || hasBadStatus),
                reason: isJp ? '体力低下/状態異常 — 薬を飲む！' : 'Low HP or ailment — Drink Potion!'
            },
            'btn-read': {
                show: r !== 'silq' && (!hasInvTelemetry || scrollCount > 0),
                suggest: scrollCount > 0 && !isDisablingStatus && ((hpPct < 35 && hostileMonsters.length > 0) || adjHostiles >= 2),
                reason: isJp ? '危険 — 巻物で脱出・対処！' : 'Danger — Read Scroll!'
            },
            'btn-door': {
                show: adjClosedDoors > 0 && (!heroActive || heroAction.id !== 'open-door'),
                suggest: adjClosedDoors > 0 && adjHostiles === 0,
                reason: isJp ? '隣接する扉を開ける' : 'Open adjacent closed door'
            },
            'btn-pickup': {
                show: standingOnItem && (!heroActive || heroAction.id !== 'pickup'),
                suggest: standingOnItem,
                reason: isJp ? '足元のアイテムを拾う' : 'Item underfoot — Pick up!'
            },
            'btn-stair': {
                show: standingStair && (!heroActive || (heroAction.id !== 'stair-down' && heroAction.id !== 'stair-up')),
                suggest: standingStair && adjHostiles === 0,
                reason: isJp ? '階段・入口を使用' : 'Use stairs / entrance underfoot'
            },
            'btn-rest': {
                show: !hasInvTelemetry || ((hpPct < 100 || (maxSp > 0 && spPct < 100) || hasBadStatus) && adjHostiles === 0),
                suggest: (hpPct < 75 || (maxSp > 0 && spPct < 45) || hasBadStatus) && hostileMonsters.length === 0,
                reason: isJp ? '周囲安全 — 休憩して回復' : 'Area clear — Rest to recover HP/Mana'
            },
            'btn-inventory': {
                show: !hasInvTelemetry || inv.length > 0 || eq.length > 0,
                suggest: false
            },
            'btn-equipment': {
                show: !hasInvTelemetry || eq.length > 0,
                suggest: false
            },
            'btn-wield': {
                show: !hasInvTelemetry || wearableInPack > 0,
                suggest: !hasWeaponEquipped && weaponInPack > 0,
                reason: isJp ? '武器未装備 — 武器を装備！' : 'Unarmed — Wield weapon from pack!'
            },
            'btn-drop': {
                show: !hasInvTelemetry || inv.length > 0,
                suggest: false
            },
            'btn-search': {
                show: (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                    ? RealmKeys.realmKey('search', r) !== null
                    : (r === 'frogcomposband' || r === 'hengband'),
                suggest: false
            },
            'btn-overland': {
                show: r === 'frogcomposband' || r === 'hengband',
                suggest: false
            },
            'btn-quests': {
                show: r === 'frogcomposband' || r === 'hengband',
                suggest: false
            }
        };

        const SUGGEST_PRIORITY = [
            'btn-quaff',
            'btn-read',
            'btn-attack',
            'btn-cast',
            'btn-fire',
            'btn-power',
            'btn-pickup',
            'btn-stair',
            'btn-door',
            'btn-study',
            'btn-wield',
            'btn-skills',
            'btn-rest'
        ];

        const candidateSuggested = [];
        for (const id of SUGGEST_PRIORITY) {
            const rule = rules[id];
            if (rule && rule.show && rule.suggest) {
                const btn = document.getElementById(id);
                const visible = Boolean(rule.show) && (!btn || btn.dataset.realmHidden !== '1');
                if (visible) {
                    candidateSuggested.push(id);
                }
            }
        }
        const activeSuggested = new Set(candidateSuggested.slice(0, 2));
        const nestedUnlessSuggested = new Set([
            'btn-throw', 'btn-fire', 'btn-skills', 'btn-power', 'btn-overland',
            'btn-quests', 'btn-browse', 'btn-study', 'btn-quaff', 'btn-read',
            'btn-equipment', 'btn-wield', 'btn-drop', 'btn-search',
            'btn-run-toggle', 'btn-guide-hud'
        ]);

        let visMask = '';
        for (const [id, rule] of Object.entries(rules)) {
            const btn = document.getElementById(id);
            if (!btn) continue;
            const visible = Boolean(rule.show) && btn.dataset.realmHidden !== '1';
            visMask += visible ? '1' : '0';
            if (visible) {
                delete btn.dataset.contextHidden;
                if (!btn.dataset.overflowHidden) {
                    btn.style.display = id === 'btn-door' || id === 'btn-pickup' || id === 'btn-stair' || id === 'btn-attack' ? 'flex' : '';
                }
            } else {
                btn.dataset.contextHidden = '1';
                btn.style.display = 'none';
            }

            const isSuggested = Boolean(visible && activeSuggested.has(id));
            btn.classList.toggle('is-suggested', isSuggested);
            if (isSuggested && rule.reason) {
                btn.setAttribute('data-suggest-reason', rule.reason);
                if (!btn._baseTitle) btn._baseTitle = btn.title || '';
                btn.title = `★ Suggested: ${rule.reason} • ${btn._baseTitle}`;
            } else {
                btn.removeAttribute('data-suggest-reason');
                if (btn._baseTitle) btn.title = btn._baseTitle;
            }

            btn.classList.toggle('is-contextual-dim', Boolean(visible && rule.dim));
            btn.classList.toggle('is-nested-action', Boolean(nestedUnlessSuggested.has(id) && !isSuggested));
        }

        if (visMask !== this._lastActionBarVisMask) {
            for (const staticNestedId of ['btn-run-toggle', 'btn-guide-hud']) {
                const sBtn = document.getElementById(staticNestedId);
                if (sBtn) sBtn.classList.add('is-nested-action');
            }
            this._lastActionBarVisMask = visMask;
            if (typeof window !== 'undefined' && typeof window.__updateActionBarOverflow === 'function') {
                window.__updateActionBarOverflow();
            }
        }
    }

    syncRealmButtons(realm) {
        const activeRealm = realm || ((this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function')
                ? window.__app.getActiveRealm()
                : 'angband'));

        const keyBadges = {
            'btn-wield': (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla) ? RealmKeys.fromVanilla('w', activeRealm) : 'w',
            'btn-drop': (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla) ? RealmKeys.fromVanilla('d', activeRealm) : 'd',
            'btn-search': (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? RealmKeys.realmKey('search', activeRealm) : null
        };

        for (const [id, key] of Object.entries(keyBadges)) {
            const btn = document.getElementById(id);
            if (!btn) continue;
            if (id === 'btn-search') {
                const searchKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? RealmKeys.realmKey('search', activeRealm) : null;
                if (!searchKey) {
                    btn.classList.add('hidden');
                    continue;
                } else {
                    btn.classList.remove('hidden');
                }
            }
            let kbd = btn.querySelector('kbd');
            if (!kbd) {
                kbd = document.createElement('kbd');
                btn.appendChild(kbd);
            }
            if (kbd) kbd.textContent = key || '';
        }

        this.syncWasdUiState();
    }

    setupInvertControls() {
        const btnToggleInvert = document.getElementById('btn-toggle-invert');
        if (btnToggleInvert) {
            btnToggleInvert.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleInvertDragLook();
            });
        }
        const btnPauseInvert = document.getElementById('btn-pause-invert');
        if (btnPauseInvert) {
            btnPauseInvert.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleInvertDragLook();
            });
        }
        this.updateInvertButtons();
    }

    toggleInvertDragLook() {
        this.invertDragLook = !this.invertDragLook;
        try {
            localStorage.setItem('angband3d_invert_drag', String(this.invertDragLook));
        } catch (_) {}
        this.updateInvertButtons();
        if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) {
            window.DeviceProfile.triggerHaptic('medium');
        }
        return this.invertDragLook;
    }

    setInvertDragLook(invert) {
        this.invertDragLook = Boolean(invert);
        try {
            localStorage.setItem('angband3d_invert_drag', String(this.invertDragLook));
        } catch (_) {}
        this.updateInvertButtons();
    }

    updateInvertButtons() {
        const btnToggleInvert = document.getElementById('btn-toggle-invert');
        if (btnToggleInvert) {
            btnToggleInvert.classList.toggle('active', this.invertDragLook);
            btnToggleInvert.title = `Toggle Invert Y-Axis Drag Look (Current: ${this.invertDragLook ? 'Inverted Y' : 'Normal'})`;
        }
        const btnPauseInvert = document.getElementById('btn-pause-invert');
        if (btnPauseInvert) {
            btnPauseInvert.classList.toggle('active', this.invertDragLook);
            btnPauseInvert.textContent = `🔄 Invert Y: ${this.invertDragLook ? 'Inverted' : 'Normal'}`;
        }
    }

    /**
     * Check if Run mode is currently engaged via keyboard Shift modifier or D-Pad / Global Run Toggle.
     */
    isRunningActive(e = null) {
        return Boolean((e && e.shiftKey) || this.dpadRunMode);
    }

    /**
     * Get the absolute world direction digit (1-9) for a relative local direction (numpad 1-9)
     * based on current camera facing in 3D world view, or 1:1 in terminal view.
     */
    getRelativeWorldDirectionDigit(numpadDir) {
        if (numpadDir === 5) return 5;
        const localIndexMap = {
            8: 0,
            9: 1,
            6: 2,
            3: 3,
            2: 4,
            1: 5,
            4: 6,
            7: 7
        };
        const localIndex = localIndexMap[numpadDir];
        if (localIndex === undefined) return numpadDir;

        // In 3D world mode, apply camera facing rotation; in 2D terminal mode, top-down is fixed North
        const facing = (!this.inTerminal && this.dungeon && typeof this.dungeon.facing === 'number')
            ? this.dungeon.facing
            : 0;
        const targetWorldSector = (localIndex + facing * 2) % 8;
        const sectorToDigit = [8, 9, 6, 3, 2, 1, 4, 7];
        return sectorToDigit[targetWorldSector];
    }

    /**
     * Send run movement in a given local direction (8=fwd, 2=back, 4=strafe left, 6=strafe right, diagonals).
     * Dispatches atomic run command sequence to engine bridge.
     */
    sendRunMove(localDir) {
        const now = Date.now();
        if (this._lastRunSendTime && now - this._lastRunSendTime < 300) {
            return;
        }
        this._lastRunSendTime = now;

        if (this.dungeon && typeof this.dungeon.snapCameraToDefault === 'function') {
            this.dungeon.snapCameraToDefault();
        }
        const worldDigit = this.getRelativeWorldDirectionDigit(localDir);
        if (!worldDigit || worldDigit === 5) return;

        // Multi-realm atomic run: "keys .<digit>" sends '.' (CMD_RUN) immediately followed by
        // direction digit. This bypasses bridge walk-key interception (';' in FCB/Hengband)
        // and guarantees seamless running across Vanilla Angband, FrogComposBand, Hengband, and Sil-Q.
        this.network.sendCommand(`keys .${worldDigit}`);
    }

    toggleDpadRunMode() {
        this.dpadRunMode = !this.dpadRunMode;
        try {
            localStorage.setItem('angband3d_dpad_run', this.dpadRunMode ? '1' : '0');
        } catch (_) {}
        this.updateRunToggleUI();
        if (this.audio && typeof this.audio.playMenuNav === 'function') {
            this.audio.playMenuNav();
        }
        if (window.DeviceProfile && typeof window.DeviceProfile.triggerHaptic === 'function') {
            window.DeviceProfile.triggerHaptic('medium');
        }
        return this.dpadRunMode;
    }

    updateRunToggleUI() {
        const isRun = Boolean(this.dpadRunMode);
        const lang = window.__langMode || 'en';
        const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
        const isHeng = realm === 'hengband';
        let runWord = isRun ? 'Run' : 'Walk';
        if (isHeng && lang === 'jp') {
            runWord = isRun ? '走る' : '歩く';
        } else if (isHeng && lang === 'bilingual') {
            runWord = isRun ? 'Run (走る)' : 'Walk (歩く)';
        }

        // 1. 3D On-Screen D-Pad Run Toggle
        const dpadRunBtn = document.getElementById('dpad-run-toggle');
        const dpadRunIcon = document.getElementById('dpad-run-icon');
        const dpadRunText = document.getElementById('dpad-run-text');
        if (dpadRunBtn) {
            dpadRunBtn.classList.toggle('dpad-run-active', isRun);
            dpadRunBtn.title = isRun
                ? 'D-Pad in RUN Mode [Alt+R] (Dash / Sprint in selected direction)'
                : 'D-Pad in WALK Mode [Alt+R] (Single-Step Precision)';
        }
        if (dpadRunIcon) dpadRunIcon.textContent = isRun ? '🏃' : '🚶';
        if (dpadRunText) dpadRunText.textContent = runWord;

        // 2. Action Bar Run Toggle Pill
        const actionRunBtn = document.getElementById('btn-run-toggle');
        const actionRunIcon = document.getElementById('action-run-icon');
        const actionRunText = document.getElementById('action-run-text');
        if (actionRunBtn) {
            actionRunBtn.classList.toggle('run-active', isRun);
            actionRunBtn.title = isRun
                ? 'RUN Mode Active [Alt+R] (Move keys sprint in selected direction)'
                : 'WALK Mode Active [Alt+R] (Move keys step one tile at a time)';
        }
        if (actionRunIcon) actionRunIcon.textContent = isRun ? '🏃' : '🚶';
        if (actionRunText) actionRunText.textContent = runWord;

        // 3. Classic Terminal Touch Controls Run Toggle
        const termRunBtn = document.getElementById('term-run-toggle');
        if (termRunBtn) {
            termRunBtn.classList.toggle('active', isRun);
            termRunBtn.title = isRun
                ? 'Terminal in RUN Mode [Alt+R] (Direction buttons sprint)'
                : 'Terminal in WALK Mode [Alt+R] (Direction buttons step 1 tile)';
            const termRunIcon = termRunBtn.querySelector('.term-run-icon');
            const termRunText = termRunBtn.querySelector('.term-run-text');
            if (termRunIcon) termRunIcon.textContent = isRun ? '🏃' : '🚶';
            if (termRunText) termRunText.textContent = runWord;
        }
    }

    setTerminalMode(active) {
        this.inTerminal = active;
    }

    setupKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            // Unlock audio on first user key interaction
            if (this.audio && typeof this.audio.unlock === 'function') this.audio.unlock();

            const appState = (window.__app && typeof window.__app.getAppState === 'function')
                ? window.__app.getAppState()
                : 'game';

            // If typing in a text input or textarea (e.g. character name entry), don't intercept typing
            // Exception: In #chronicle-query-input, Escape or movement/navigation keys take gameplay precedence!
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                if (e.key === 'Escape' || (e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)) {
                    e.target.blur();
                    if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
                        window.chronicleManager.preemptForGameplay('escape');
                    }
                    return;
                }
                if (e.target.id === 'chronicle-query-input') {
                    const isNavMoveKey = e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                        e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End' ||
                        (e.code && e.code.startsWith('Numpad')) ||
                        (!e.target.value && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'));
                    if (isNavMoveKey) {
                        e.target.blur();
                        if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
                            window.chronicleManager.preemptForGameplay('movement_key');
                        }
                        // Fall through so gameplay movement executes immediately!
                    } else {
                        return;
                    }
                } else {
                    return;
                }
            }

            // Global Sound Mute Toggle (Ctrl+M or Cmd+M) available at any game state or menu
            if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
                e.preventDefault();
                const soundBtn = document.getElementById('btn-sound');
                if (soundBtn) {
                    soundBtn.click();
                } else if (this.audio) {
                    this.audio.toggleMute();
                    if (window.__syncAudioUI) window.__syncAudioUI();
                }
                return;
            }

            // Global Roguelike Command Palette (Ctrl+K or Cmd+K)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                if (window.__app && typeof window.__app.showCommandPalette === 'function') {
                    window.__app.showCommandPalette(appState);
                }
                return;
            }

            if (e.key === 'F10' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (typeof window !== 'undefined' && window.RealmGrimoireDeck && typeof window.RealmGrimoireDeck.toggleMode === 'function') {
                    e.preventDefault();
                    window.RealmGrimoireDeck.toggleMode();
                    if (window.__app && typeof window.__app.updateTerminalToolbar === 'function') {
                        const lf = typeof window.__app.getLastFrame === 'function' ? window.__app.getLastFrame() : null;
                        window.__app.updateTerminalToolbar(lf);
                    }
                    return;
                }
            }
            // Toggle Fullscreen (F11 or Alt+Enter)
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
                e.preventDefault();
                this.toggleFullscreen();
                return;
            }

            // Global Alt+L: Toggle Language Mode (English / Kanji / Bilingual)
            if (e.altKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                if (window.__app && typeof window.__app.toggleLanguageMode === 'function') {
                    window.__app.toggleLanguageMode();
                }
                return;
            }

            // Global Alt+R: Toggle Virtual D-Pad Run / Walk Mode
            if (e.altKey && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault();
                if (typeof this.toggleDpadRunMode === 'function') {
                    this.toggleDpadRunMode();
                }
                return;
            }

            // Global Alt+W: Toggle WASD Keyboard Movement Mode
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'w' || e.key === 'W')) {
                e.preventDefault();
                this.toggleWasdMode();
                return;
            }


            // In Death Screen Modal: support tabs 1-5, [R] reload, [N] reroll, [M / Esc] menu, [u] identify, and full interactive terminal on Tab 0
            const deathModal = document.getElementById('death-modal');
            const isDeadModal = Boolean(deathModal && !deathModal.classList.contains('hidden'));
            const lastFrame = (window.__app && typeof window.__app.getLastFrame === 'function')
                ? window.__app.getLastFrame()
                : (window.__app ? window.__app.lastFrame : null);
            const isDeadFrame = Boolean(lastFrame && lastFrame.player && (lastFrame.player.dead || (lastFrame.player.hp !== undefined && lastFrame.player.hp <= 0 && lastFrame.player.hp_max > 0)));

            if (isDeadModal || isDeadFrame) {
                if (!isDeadModal && window.__app && window.__app.hud && lastFrame) {
                    window.__app.hud.showDeathModal(lastFrame);
                }
                const activeTab = (window.__app && window.__app.hud) ? (window.__app.hud.activeDeathTab || 0) : 0;

                // 1-5 direct tab jump
                if (['1', '2', '3', '4', '5'].includes(e.key)) {
                    e.preventDefault();
                    if (window.__app && window.__app.hud) {
                        window.__app.hud.switchDeathTab(parseInt(e.key, 10) - 1);
                    }
                    return;
                }

                // Tab or ArrowRight to cycle forward; ArrowLeft to cycle backward (matches Godot Main.cs:1696-1709)
                if (e.key === 'Tab' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (window.__app && window.__app.hud) {
                        window.__app.hud.switchDeathTab((activeTab + 1) % 5);
                    }
                    return;
                }
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (window.__app && window.__app.hud) {
                        window.__app.hud.switchDeathTab((activeTab + 4) % 5);
                    }
                    return;
                }

                // Identify items in death screen (matches Godot Main.cs:1680)
                if (e.key === 'u' || e.key === 'U') {
                    e.preventDefault();
                    this.network.sendKey('u');
                    return;
                }

                // [R] Reload save / restart game (matches Godot Main.cs:1684)
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    if (window.__app && window.__app.reloadLastSave) {
                        window.__app.reloadLastSave();
                    } else if (window.__app && window.__app.hud && window.__app.hud.hideDeathModal) {
                        window.__app.hud.hideDeathModal();
                        window.location.reload();
                    }
                    return;
                }

                // [N] Reroll new character (matches Godot Main.cs:1688)
                if (e.key === 'n' || e.key === 'N') {
                    e.preventDefault();
                    if (window.__app && window.__app.startNewRandomHero) {
                        window.__app.startNewRandomHero();
                    } else if (window.__app && window.__app.hud && window.__app.hud.rerollCharacter) {
                        window.__app.hud.rerollCharacter();
                    } else {
                        const heroName = (window.__app && typeof window.__app.generateHeroName === 'function')
                            ? window.__app.generateHeroName()
                            : ('Hero_' + Math.random().toString(36).substring(2, 6).toUpperCase());
                        const realmParam = (window.__app && typeof window.__app.getActiveRealm === 'function')
                            ? `&realm=${encodeURIComponent(window.__app.getActiveRealm())}`
                            : '';
                        window.location.href = `/?char=${encodeURIComponent(heroName)}&new=1${realmParam}`;
                    }
                    return;
                }

                // [M / Esc] Main menu: Escape always returns to main menu; 'M' returns to main menu on non-terminal tabs
                if (e.key === 'Escape' || (activeTab !== 0 && (e.key === 'm' || e.key === 'M'))) {
                    e.preventDefault();
                    if (window.__app && window.__app.returnToMainMenu) {
                        window.__app.returnToMainMenu();
                    } else {
                        window.location.href = '/';
                    }
                    return;
                }

                // On Tab 0 (Tombstone & Menus), forward all navigation, arrow keys, and prompt answers (y, n, Enter, Space) to terminal
                if (activeTab === 0) {
                    this.handleTerminalKey(e);
                    return;
                }

                // On Tabs 1-4 (Equipment, Inventory, Quiver, Stats), handle scrolling (matches Godot Main.cs:1731, 1743, 1755, 1767)
                if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
                    e.preventDefault();
                    const activeContent = document.querySelector('.death-tab-content.active');
                    if (activeContent) {
                        const delta = (e.key === 'ArrowUp' ? -40 : e.key === 'ArrowDown' ? 40 : e.key === 'PageUp' ? -200 : 200);
                        activeContent.scrollTop += delta;
                    }
                    return;
                }

                // In other tabs, consume unhandled keys so they don't leak into world
                return;
            }

            // 1. Splash Screen Mode: Realm selection & entry
            if (appState === 'splash') {
                if (e.key === '1') {
                    e.preventDefault();
                    if (window.__app && window.__app.selectRealm) window.__app.selectRealm('angband', false);
                    return;
                }
                if (e.key === '2') {
                    e.preventDefault();
                    if (window.__app && window.__app.selectRealm) window.__app.selectRealm('frogcomposband', false);
                    return;
                }
                if (e.key === '3') {
                    e.preventDefault();
                    if (window.__app && window.__app.selectRealm) window.__app.selectRealm('hengband', false);
                    return;
                }
                if (e.key === '4') {
                    e.preventDefault();
                    if (window.__app && window.__app.selectRealm) window.__app.selectRealm('silq', false);
                    return;
                }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.code === 'Numpad4' || e.code === 'Numpad8') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) window.__app.cycleRealm(-1);
                    return;
                }
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.code === 'Numpad6' || e.code === 'Numpad2') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) window.__app.cycleRealm(1);
                    return;
                }
                if (e.key === 'l' || e.key === 'L') {
                    e.preventDefault();
                    if (window.__app && window.__app.toggleLanguageMode) window.__app.toggleLanguageMode();
                    return;
                }
                if (e.key === 'd' || e.key === 'D') {
                    e.preventDefault();
                    if (window.__app && window.__app.showDemoModal) window.__app.showDemoModal('splash');
                    return;
                }
                if (e.key === 'g' || e.key === 'G') {
                    e.preventDefault();
                    if (window.__app) window.__app.showGuide(0, 'splash');
                    return;
                }
                if (e.key === 'a' || e.key === 'A') {
                    e.preventDefault();
                    if (window.__app && window.__app.showPWAModal) window.__app.showPWAModal('splash');
                    return;
                }
                if (e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    if (window.__app) window.__app.showGuide(6, 'splash');
                    return;
                }
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) window.__app.cycleRealm(1);
                    return;
                }
                if (e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    if (window.__app && window.__app.showCommandPalette) window.__app.showCommandPalette('splash');
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app) window.__app.showMainMenu();
                    return;
                }
                return;
            }

            // 2. Main Menu Mode
            if (appState === 'mainMenu') {
                if (e.key === 'Escape' || (e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)) {
                    e.preventDefault();
                    if (window.__app) window.__app.showSplash();
                    return;
                }
                if (e.key === 'ArrowUp' || e.code === 'Numpad8') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigateMenu(-1);
                    return;
                }
                if (e.key === 'ArrowDown' || e.code === 'Numpad2') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigateMenu(1);
                    return;
                }
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    if (window.__app) window.__app.showSplash();
                    return;
                }
                if (e.key === 'd' || e.key === 'D') {
                    e.preventDefault();
                    if (window.__app && window.__app.showDemoModal) window.__app.showDemoModal('mainMenu');
                    return;
                }
                if (e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    if (window.__app && window.__app.showCommandPalette) window.__app.showCommandPalette('mainMenu');
                    return;
                }
                if (['1', '2', '3', '4'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) {
                        window.__app.selectMenuItem(idx);
                        window.__app.activateMenuItem(idx);
                    }
                    return;
                }
                if (['5', '6', '7', '8'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) {
                        window.__app.activateMenuItem(idx);
                    }
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app) window.__app.activateMenuItem();
                    return;
                }
                return;
            }

            // Demo Showcase Modal Keyboard Routing
            if (appState === 'demoModal') {
                if (e.key === 'Escape' || (e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)) {
                    e.preventDefault();
                    if (window.__app && window.__app.hideDemoModal) window.__app.hideDemoModal();
                    return;
                }
                if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.togglePlay();
                    return;
                }
                if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.seekDelta(-5);
                    return;
                }
                if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.seekDelta(5);
                    return;
                }
                if (e.key === 'm' || e.key === 'M') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.toggleMute();
                    return;
                }
                if (e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.toggleCaptions();
                    return;
                }
                if (e.key === 'f' || e.key === 'F') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.toggleFullscreen();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (window.demoPlayer) window.demoPlayer.jumpInAndPlay();
                    return;
                }
                if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
                    e.preventDefault();
                    const chapIdx = parseInt(e.key, 10) - 1;
                    if (window.demoPlayer) window.demoPlayer.jumpToChapter(chapIdx);
                    return;
                }
                return;
            }

            // PWA Modal Escape & Return handling
            if (appState === 'pwaModal') {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app && window.__app.hidePWAModal) window.__app.hidePWAModal();
                    return;
                }
                return;
            }

            // Multi-Realm Modal Keyboard Routing
            if (appState === 'realmModal') {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app && window.__app.hideRealmSelector) window.__app.hideRealmSelector();
                    return;
                }
                const realms = ['angband', 'frogcomposband', 'hengband', 'silq'];
                if (['1', '2', '3', '4'].includes(e.key)) {
                    e.preventDefault();
                    const chosen = realms[parseInt(e.key, 10) - 1];
                    if (chosen && window.__app) {
                        if (window.__app.selectRealm) {
                            window.__app.selectRealm(chosen, false);
                        } else if (window.__app.setActiveRealm) {
                            window.__app.setActiveRealm(chosen);
                        }
                    }
                    return;
                }
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) {
                        window.__app.cycleRealm(1);
                    }
                    return;
                }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (window.__app && window.__app.cycleRealm) {
                        window.__app.cycleRealm(-1);
                    }
                    return;
                }
                return;
            }

            // Command Palette Modal Keyboard Routing
            if (appState === 'cmdPaletteModal') {
                if (e.key === 'Escape' || (e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)) {
                    e.preventDefault();
                    if (window.__app && window.__app.hideCommandPalette) window.__app.hideCommandPalette();
                    return;
                }
                return;
            }

            // 3. Load Saved Game Menu Mode
            if (appState === 'loadMenu') {
                if (e.key === 'Escape' || (e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)) {
                    e.preventDefault();
                    if (window.__app) window.__app.hideLoadMenu();
                    return;
                }
                if (e.key === 'ArrowUp' || e.code === 'Numpad8') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigateLoadList(-1);
                    return;
                }
                if (e.key === 'ArrowDown' || e.code === 'Numpad2') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigateLoadList(1);
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app) window.__app.loadSelectedSave();
                    return;
                }
                if (e.key === 'Delete') {
                    e.preventDefault();
                    if (window.__app) window.__app.deleteSelectedSave();
                    return;
                }
                if (e.key === 'u' || e.key === 'U') {
                    e.preventDefault();
                    if (window.__app) window.__app.triggerSaveUpload();
                    return;
                }
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    if (window.__app && window.__app.showRealmSelector) window.__app.showRealmSelector('loadMenu');
                    return;
                }
                if (e.key === 'x' || e.key === 'X' || e.key === 'e' || e.key === 'E') {
                    e.preventDefault();
                    if (window.__app) window.__app.downloadSelectedSave();
                    return;
                }
                return;
            }

            // 4. In-Game Pause Menu Mode (Game Menu)
            if (appState === 'pauseMenu') {
                if (e.key === 'Escape' || (e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)) {
                    e.preventDefault();
                    if (window.__app) window.__app.resumeGame();
                    return;
                }
                if (e.key === 'ArrowUp' || e.code === 'Numpad8') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigatePauseMenu(-1);
                    return;
                }
                if (e.key === 'ArrowDown' || e.code === 'Numpad2') {
                    e.preventDefault();
                    if (window.__app) window.__app.navigatePauseMenu(1);
                    return;
                }
                if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) {
                        window.__app.selectPauseMenuItem(idx);
                        window.__app.activatePauseMenuItem();
                    }
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (window.__app) window.__app.activatePauseMenuItem();
                    return;
                }
                return;
            }

            // 5. Game Guide & Primer Mode
            if (appState === 'guide') {
                if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (window.__app) window.__app.hideGuide();
                    return;
                }
                if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
                    e.preventDefault();
                    const idx = parseInt(e.key, 10) - 1;
                    if (window.__app) window.__app.switchGuideTab(idx);
                    return;
                }
                if (e.key === 'Tab' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (window.__app) window.__app.cycleGuideTab(1);
                    return;
                }
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (window.__app) window.__app.cycleGuideTab(-1);
                    return;
                }
                if (e.key === 'w' || e.key === 'W') {
                    e.preventDefault();
                    if (typeof window.openExternalUrl === 'function') {
                        window.openExternalUrl('https://angband.readthedocs.io/');
                    } else {
                        window.open('https://angband.readthedocs.io/', '_blank');
                    }
                    return;
                }
                if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
                    e.preventDefault();
                    const guideBody = document.getElementById('guide-body');
                    if (guideBody) {
                        const delta = (e.key === 'ArrowUp' ? -40 : e.key === 'ArrowDown' ? 40 : e.key === 'PageUp' ? -200 : 200);
                        guideBody.scrollTop += delta;
                    }
                    return;
                }
                return;
            }

            // Any manual key cancels automated quick birth or minimap auto-navigation
            if (window.__app && window.__app.cancelQuickBirth) {
                window.__app.cancelQuickBirth();
            }
            if (this.isAutoNavigating && this.isAutoNavigating()) {
                this.stopMinimapAutoNav('Manual key press');
                if (e.key === 'Escape' || (e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)) {
                    e.preventDefault();
                    return;
                }
            }

            // F1–F4 or Alt+1–Alt+4: Trigger 4-Slot Bindable Quick-Action Bar (only during active 3D gameplay)
            const isFKeySlot = false; // WS37: Removed F1-F4 interception to prevent browser hotkey conflicts
            const isAltNumSlot = e.altKey && !e.ctrlKey && !e.metaKey && (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4' || e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4');
            const isGameActive = !window.__app || (typeof window.__app.getAppState === 'function' ? window.__app.getAppState() === 'game' : (!window.__app.state || window.__app.state === 'playing' || window.__app.state === 'game'));
            const inClassicPlay = Boolean(window.__app && window.__app.lastFrame && window.__app.lastFrame.phase === 'play' && (window.__app.lastFrame.ui?.overlay || 0) === 0 && window.__app.lastFrame.ui?.awaiting_command);
            if ((isFKeySlot || isAltNumSlot) && isGameActive && (!this.inTerminal || inClassicPlay)) {
                e.preventDefault();
                const slotDigit = (e.code && e.code.startsWith('Digit')) ? parseInt(e.code.slice(5), 10) : parseInt(e.key, 10);
                const slotIdx = Math.max(0, Math.min(3, (slotDigit || 1) - 1));
                this.triggerQuickSlot(slotIdx);
                return;
            }

            // Guide Modal Active: handle tab navigation and close
            if (window.__app && window.__app.isGuideOpen && window.__app.isGuideOpen()) {
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    if (this.audio) this.audio.playMenuNav();
                    window.__app.hideGuide();
                    return;
                }
                if (e.key >= '1' && e.key <= '6') {
                    e.preventDefault();
                    window.__app.switchGuideTab(parseInt(e.key, 10) - 1);
                    return;
                }
                if (e.key === 'Tab' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    window.__app.cycleGuideTab(1);
                    return;
                }
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    window.__app.cycleGuideTab(-1);
                    return;
                }
            }

            // Quick toggle between 3D world and Classic CRT Terminal (or Sil-Q Skills)
            if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                if (realm === 'silq') {
                    e.preventDefault();
                    if (this.audio) this.audio.playMenuOpen();
                    this.network.sendKey('tab');
                    return;
                }
                e.preventDefault();
                if (this.audio) this.audio.playMenuNav();
                if (this.toggleTerminalView) this.toggleTerminalView();
                return;
            }

            // Alt+L: Toggle Language Mode (English / Kanji / Bilingual)
            if (e.altKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                if (window.__app && typeof window.__app.toggleLanguageMode === 'function') {
                    window.__app.toggleLanguageMode();
                }
                return;
            }

            // Alt+R: Toggle Virtual D-Pad Run / Walk Mode
            if (e.altKey && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault();
                if (typeof this.toggleDpadRunMode === 'function') {
                    this.toggleDpadRunMode();
                }
                return;
            }

            // Escape: reliably cancel prompts, dismiss menus/overlays, or open Pause Menu (1:1 with Godot Main.cs:1820-1835)
            const lastFrameEarly = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
            const inPlayEarly = Boolean(lastFrameEarly && lastFrameEarly.phase === 'play' && (lastFrameEarly.map || (lastFrameEarly.player && lastFrameEarly.player.name)));
            if (e.key === 'Escape' || (!inPlayEarly && e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)) {
                e.preventDefault();
                if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();

                // If entity inspection popover is open, Escape dismisses it first without opening Pause Menu
                const qsPopover = document.getElementById('quick-slot-popover');
                if (qsPopover && qsPopover.classList.contains('is-open')) {
                    qsPopover.classList.remove('is-open');
                    return;
                }
                const morePopover = document.getElementById('action-more-popover');
                if (morePopover && morePopover.classList.contains('is-open')) {
                    morePopover.classList.remove('is-open');
                    return;
                }
                const inspectPopover = document.getElementById('entity-inspect-popover');
                if (inspectPopover && !inspectPopover.classList.contains('hidden')) {
                    if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
                        window.chronicleManager.preemptForGameplay('escape');
                    } else {
                        inspectPopover.classList.add('hidden');
                    }
                    return;
                }

                if (window.__app && window.__app.cancelQuickBirth) {
                    window.__app.cancelQuickBirth();
                }

                const lastFrame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
                const realm = (this.app && this.app.realm) || (window.__app && window.__app.getActiveRealm ? window.__app.getActiveRealm() : 'angband');

                if (typeof MenuRouter !== 'undefined' && MenuRouter && typeof MenuRouter.getPending === 'function' && MenuRouter.getPending()) {
                    if (MenuRouter.route('escape', lastFrame, realm, (k) => this.network.sendKey(k))) {
                        if (this.app && typeof this.app.updateTerminalToolbar === 'function' && lastFrame) {
                            this.app.updateTerminalToolbar(lastFrame);
                        }
                        return;
                    }
                } else if (typeof window !== 'undefined' && window.MenuRouter && typeof window.MenuRouter.getPending === 'function' && window.MenuRouter.getPending()) {
                    if (window.MenuRouter.route('escape', lastFrame, realm, (k) => this.network.sendKey(k))) {
                        if (this.app && typeof this.app.updateTerminalToolbar === 'function' && lastFrame) {
                            this.app.updateTerminalToolbar(lastFrame);
                        }
                        return;
                    }
                }

                const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && (lastFrame.map || (lastFrame.player && lastFrame.player.name)));
                const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
                    ? window.ScreenContext.screenTextOf(lastFrame)
                    : (lastFrame && lastFrame.term && lastFrame.term.rows ? lastFrame.term.rows.map(r => r.g || '').join('\n').toLowerCase() : '');
                const isReviewActive = Boolean(window.__app && typeof window.__app.isBirthReviewActive === 'function' && window.__app.isBirthReviewActive());
                const isReviewScreen = (window.ScreenContext && typeof window.ScreenContext.inputEscapeReview === 'function')
                    ? window.ScreenContext.inputEscapeReview(screenText, inPlay, isReviewActive)
                    : isReviewActive;

                if (!inPlay) {
                    if (isReviewScreen) {
                        if (window.__app && window.__app.rerollHero) {
                            window.__app.rerollHero();
                        } else {
                            this.network.sendKey('s');
                        }
                    } else {
                        // Forward Escape to engine to step back one question in character birth
                        this.network.sendKey('escape');
                    }
                    return;
                }

                const ui = lastFrame ? lastFrame.ui : null;
                const isForcedTerm = window.__app && window.__app.isForceTerminal && window.__app.isForceTerminal();
                const inContextMenu = (ui && (ui.overlay > 0 || ui.more || !ui.awaiting_command)) || this.inTerminal || isForcedTerm;

                if (inContextMenu) {
                    // Always forward Escape to the engine to exit store/menu/prompt
                    this.network.sendKey('escape');
                    if (window.__app && window.__app.setForceTerminal) {
                        window.__app.setForceTerminal(false);
                    }
                } else {
                    // In free 3D exploration with no sub-menus open, Escape opens Game Menu
                    if (window.__app && window.__app.showPauseMenu) {
                        window.__app.showPauseMenu();
                    }
                }
                return;
            }

            // Global Alt+W: Toggle WASD Keyboard Movement Mode
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'w' || e.key === 'W')) {
                e.preventDefault();
                this.toggleWasdMode();
                return;
            }

            // In Terminal Mode (Character creation, birth choices, help, shops, inventory, equipment)
            const termContainer = document.getElementById('terminal-container');
            const isTermVisible = Boolean(termContainer && !termContainer.classList.contains('hidden'));
            if (this.inTerminal || isTermVisible) {
                this.handleTerminalKey(e);
                return;
            }

            // In 3D World Exploration Mode
            this.handleWorldKey(e);
        });
    }

    handleTerminalKey(e) {
        const lastFrame = (window.__app && typeof window.__app.getLastFrame === 'function')
            ? window.__app.getLastFrame()
            : (window.__app ? window.__app.lastFrame : null);
        const inPlay = Boolean(lastFrame && lastFrame.phase === 'play' && lastFrame.map);
        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
            ? window.ScreenContext.screenTextOf(lastFrame)
            : (lastFrame && lastFrame.term && lastFrame.term.rows ? lastFrame.term.rows.map(r => r.g || '').join('\n').toLowerCase() : '');
        const isReviewActive = Boolean(window.__app && typeof window.__app.isBirthReviewActive === 'function' && window.__app.isBirthReviewActive());
        const { isChoiceMenu, isNamePrompt, isReviewScreen } = (window.ScreenContext && typeof window.ScreenContext.inputTerminalKeyFlags === 'function')
            ? window.ScreenContext.inputTerminalKeyFlags(screenText, inPlay, isReviewActive)
            : { isChoiceMenu: false, isNamePrompt: false, isReviewScreen: false };
        const pf = (window.ScreenContext && typeof window.ScreenContext.promptFlags === 'function')
            ? window.ScreenContext.promptFlags(screenText)
            : { isYesNoPrompt: false, isQuantityPrompt: false };
        const tf = {
            isQuantityPrompt: Boolean(pf.isQuantityPrompt || screenText.includes('how many') || screenText.includes('quantity') || screenText.includes('how much')),
            isNamePrompt: Boolean(isNamePrompt),
            isInscriptionPrompt: Boolean(screenText.includes('inscription:') || screenText.includes('inscribe:'))
        };

        // Reroll hotkey on review screen ('R') -> Re-randomize
        if (isReviewScreen && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
            if (window.__app && window.__app.rerollHero) {
                window.__app.rerollHero();
            } else {
                const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
                this.network.sendKey(realm === 'silq' || realm === 'hengband' ? 'r' : 's');
            }
            return;
        }

        // Previous roll hotkey on review/stat screen ('P') -> Step back to previous rolled stats (Hengband)
        if (isReviewScreen && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
            this.network.sendKey('p');
            return;
        }

        // Custom creation hotkey on review screen ('C' or 'S') -> Start over without autoBirth to choose race/class
        if (isReviewScreen && (e.key === 'c' || e.key === 'C' || e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            if (this.audio) this.audio.playMenuNav();
            if (window.__app && window.__app.startCustomHeroCreation) {
                window.__app.startCustomHeroCreation();
            } else {
                if (window.__app && window.__app.cancelQuickBirth) window.__app.cancelQuickBirth();
                this.network.sendKey('s');
            }
            return;
        }

        // Confirmation on review screen (Enter, Space, or 'y') — jump straight into 3D!
        if (isReviewScreen && (e.key === 'Enter' || e.key === 'y' || e.key === 'Y' || e.key === ' ')) {
            e.preventDefault();
            if (this.audio) this.audio.playWhoosh();
            if (window.__app && window.__app.confirmHeroBirth) {
                window.__app.confirmHeroBirth();
            } else {
                this.network.sendKey(e.key === 'y' || e.key === 'Y' ? 'y' : 'enter');
            }
            return;
        }

        // Terminal Zoom Shortcuts (Ctrl + / - or direct + / - on non-input)
        if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
            e.preventDefault();
            if (window.__app && window.__app.terminal && window.__app.terminal.zoomIn) {
                window.__app.terminal.zoomIn();
            }
            return;
        }
        if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
            e.preventDefault();
            if (window.__app && window.__app.terminal && window.__app.terminal.zoomOut) {
                window.__app.terminal.zoomOut();
            }
            return;
        }
        if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            if (window.__app && window.__app.terminal && window.__app.terminal.resetZoom) {
                window.__app.terminal.resetZoom();
            }
            return;
        }

        const isAwaitingCmd = inPlay && Boolean(
            (lastFrame.awaiting_command || (lastFrame.ui && lastFrame.ui.awaiting_command)) &&
            (!lastFrame.ui || !lastFrame.ui.more) &&
            (!lastFrame.ui || !lastFrame.ui.overlay)
        );

        if (isAwaitingCmd && this.isRunningActive(e)) {
            let termDir = 0;
            if (e.key === 'ArrowUp' || e.code === 'Numpad8') termDir = 8;
            else if (e.key === 'ArrowDown' || e.code === 'Numpad2') termDir = 2;
            else if (e.key === 'ArrowLeft' || e.code === 'Numpad4') termDir = 4;
            else if (e.key === 'ArrowRight' || e.code === 'Numpad6') termDir = 6;
            else if (e.key === 'Home' || e.code === 'Numpad7') termDir = 7;
            else if (e.key === 'PageUp' || e.code === 'Numpad9') termDir = 9;
            else if (e.key === 'End' || e.code === 'Numpad1') termDir = 1;
            else if (e.key === 'PageDown' || e.code === 'Numpad3') termDir = 3;

            if (termDir > 0) {
                e.preventDefault();
                this.network.sendCommand(`keys .${termDir}`);
                return;
            }
        }

        let keySpec = null;

        const isNumpadDigit = Boolean(e.code && /^Numpad[0-9]$/.test(e.code));
        if (isNumpadDigit && (tf.isQuantityPrompt || tf.isNamePrompt || tf.isInscriptionPrompt)) {
            keySpec = e.code.slice(6);
        } else if (e.key === 'ArrowUp' || e.code === 'Numpad8') keySpec = 'up';
        else if (e.key === 'ArrowDown' || e.code === 'Numpad2') keySpec = 'down';
        else if (e.key === 'ArrowLeft' || e.code === 'Numpad4') keySpec = 'left';
        else if (e.key === 'ArrowRight' || e.code === 'Numpad6') keySpec = 'right';
        else if (e.code === 'Numpad5') keySpec = 'enter';
        else if (e.key === 'PageUp') keySpec = 'pageup';
        else if (e.key === 'PageDown') keySpec = 'pagedown';
        else if (e.key === 'Home') keySpec = 'home';
        else if (e.key === 'End') keySpec = 'end';
        else if (e.key === 'Delete') keySpec = 'delete';
        else if (e.key === 'Enter') keySpec = 'enter';
        else if (e.key === 'Escape') {
            keySpec = 'escape';
        }
        else if (e.key === 'Backspace') keySpec = 'backspace';
        else if (e.key === 'Tab') keySpec = 'tab';
        else if (e.key === ' ') keySpec = 'space';
        else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) keySpec = e.key;
        else if (e.key.length === 1 && e.ctrlKey && !e.altKey && !e.metaKey) keySpec = `C-${e.key.toLowerCase()}`;

        if (keySpec) {
            e.preventDefault();
            const realm = (window.__app && typeof window.__app.getActiveRealm === 'function')
                ? window.__app.getActiveRealm()
                : ((window.__app && window.__app.currentRealm) || (lastFrame && lastFrame.realm) || 'angband');

            // Virtual cursor Up/Down navigation when Action Chooser is open or in non-Angband item lists
            if ((keySpec === 'up' || keySpec === 'down') && this.terminal && typeof this.terminal.moveSelection === 'function') {
                const pending = (window.MenuRouter && typeof window.MenuRouter.getPending === 'function')
                    ? window.MenuRouter.getPending()
                    : null;
                const scClass = (window.ScreenContext && typeof window.ScreenContext.classify === 'function' && lastFrame)
                    ? window.ScreenContext.classify(lastFrame, realm)
                    : null;
                const inNonNativeItemList = Boolean(scClass && scClass.mode === 'item-list' && realm !== 'angband');
                if ((pending && pending.step === 'chooser') || inNonNativeItemList) {
                    const nextKey = this.terminal.moveSelection(keySpec === 'up' ? -1 : 1);
                    if (nextKey) {
                        if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                        if (window.__app && typeof window.__app.updateTerminalToolbar === 'function') {
                            window.__app.updateTerminalToolbar(lastFrame);
                        }
                        return;
                    }
                }
            }

            // In non-Angband item lists (Sil-Q, FrogComposBand, Hengband), pressing Enter when chooser is not open
            // activates the currently highlighted item key from the virtual cursor.
            if (keySpec === 'enter' && this.terminal && typeof this.terminal.getSelectedKey === 'function') {
                const pending = (window.MenuRouter && typeof window.MenuRouter.getPending === 'function')
                    ? window.MenuRouter.getPending()
                    : null;
                const scClass = (window.ScreenContext && typeof window.ScreenContext.classify === 'function' && lastFrame)
                    ? window.ScreenContext.classify(lastFrame, realm)
                    : null;
                if ((!pending || pending.step !== 'chooser') && scClass && scClass.mode === 'item-list' && realm !== 'angband') {
                    const selKey = this.terminal.getSelectedKey();
                    if (selKey) {
                        keySpec = selKey;
                    }
                }
            }

            if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                if (window.MenuRouter.route(keySpec, lastFrame, realm)) {
                    if (this.terminal && typeof this.terminal.setSelectedKey === 'function' && keySpec.length === 1) {
                        this.terminal.setSelectedKey(keySpec);
                    }
                    if (window.__app && typeof window.__app.updateTerminalToolbar === 'function') {
                        window.__app.updateTerminalToolbar(lastFrame);
                    }
                    if (this.terminal && lastFrame && lastFrame.term && typeof this.terminal.render === 'function') {
                        this.terminal.render(lastFrame.term);
                    }
                    return;
                }
            }

            if (keySpec === 'escape') {
                if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') {
                    window.MenuRouter.clearPending();
                }
                if (window.__app && window.__app.setForceTerminal) {
                    window.__app.setForceTerminal(false);
                }
                window.__manualTerminalOpen = false;
            }
            this.network.sendKey(keySpec);
        }
    }

    sendMovementKey(key) {
        if (this.dungeon && typeof this.dungeon.snapCameraToDefault === 'function') {
            this.dungeon.snapCameraToDefault();
        }
        this.network.sendKey(key);
    }

    handleWorldKey(e) {
        // Alt key combos are UI/application shortcuts (e.g. Alt+C toggle chronicle, Alt+P play/pause, Alt+[, Alt+]); ignore in world
        if (e.altKey) return;

        // Gameplay takes absolute precedence over entity inspection popovers and interactive Tome conversation
        if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
            window.chronicleManager.preemptForGameplay('world_key');
        }

        let skipWasdRemap = false;
        if (this._wasdLiteralNext) {
            this._wasdLiteralNext = false;
            skipWasdRemap = true;
        }

        if (this.wasdMode && !skipWasdRemap && !e.ctrlKey && !e.altKey && !e.metaKey && e.key === '\\') {
            e.preventDefault();
            this._wasdLiteralNext = true;
            this.network.sendKey('\\');
            return;
        }

        // Minimap controls: Screen size ([ / ]) and Grid scale zoom (+ / -)
        if (e.key === '[') {
            e.preventDefault();
            if (window.__app && window.__app.hud) {
                window.__app.hud.cycleMinimapSize(-1);
            }
            return;
        }

        if (e.key === ']') {
            e.preventDefault();
            if (window.__app && window.__app.hud) {
                window.__app.hud.cycleMinimapSize(1);
            }
            return;
        }

        // Head Tilt Up (Ctrl+PageUp) & Tilt Down (Ctrl+PageDown) & Recenter (Ctrl+Home)
        if (e.ctrlKey || e.altKey) {
            if (e.key === 'PageUp') {
                e.preventDefault();
                if (this.dungeon) {
                    this.dungeon.userPitchOffset = Math.min(1.25, (this.dungeon.userPitchOffset || 0) + 0.12);
                }
                return;
            }

            if (e.key === 'PageDown') {
                e.preventDefault();
                if (this.dungeon) {
                    this.dungeon.userPitchOffset = Math.max(-0.65, (this.dungeon.userPitchOffset || 0) - 0.12);
                }
                return;
            }

            if (e.key === 'Home') {
                e.preventDefault();
                if (this.dungeon) {
                    this.dungeon.userPitchOffset = 0.0;
                }
                return;
            }
        }

        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            if (window.__app && window.__app.hud) {
                window.__app.hud.adjustMinimapZoom(0.15);
            }
            return;
        }

        if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            if (window.__app && window.__app.hud) {
                window.__app.hud.adjustMinimapZoom(-0.15);
            }
            return;
        }

        // Relative directional movement via number pad, top-row numbers, or navigation keys
        // 8 = forward, 2 = back, 4 = strafe left, 6 = strafe right, diagonals 7,9,1,3, 5 = stay.
        const numpadDirMap = {
            'Numpad8': 8, 'Digit8': 8,
            'Numpad2': 2, 'Digit2': 2,
            'Numpad4': 4, 'Digit4': 4,
            'Numpad6': 6, 'Digit6': 6,
            'Numpad7': 7, 'Digit7': 7, 'Home': 7,
            'Numpad9': 9, 'Digit9': 9, 'PageUp': 9,
            'Numpad1': 1, 'Digit1': 1, 'End': 1,
            'Numpad3': 3, 'Digit3': 3, 'PageDown': 3,
            'Numpad5': 5, 'Digit5': 5, 'NumpadClear': 5, 'Clear': 5
        };

        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
        const ui = lastFrame ? lastFrame.ui : null;

        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
            ? window.ScreenContext.screenTextOf(lastFrame)
            : '';
        const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
        const isHeng = realm === 'hengband';
        const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
        const ntFlags = {
            isDirectionalTargeting: Boolean(
                (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
                (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay))
            )
        };
        const isTargeting = Boolean(ntFlags && ntFlags.isDirectionalTargeting);

        if (isTargeting) {
            if (e.code === 'Digit5' || e.code === 'Numpad5' || e.key === '.' || e.key === 't' || e.key === 'T') {
                e.preventDefault();
                this.network.sendKey('t');
                return;
            }
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                this.network.sendKey('space');
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const moveKey = this.getRelativeDirectionKey(8);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const moveKey = this.getRelativeDirectionKey(2);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const moveKey = this.getRelativeDirectionKey(4);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const moveKey = this.getRelativeDirectionKey(6);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (this.wasdMode && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const lowerK = e.key.toLowerCase();
                if (lowerK === 'w') {
                    e.preventDefault();
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(1, 0)
                        : 8;
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
                if (lowerK === 's') {
                    e.preventDefault();
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(-1, 0)
                        : 2;
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
                if (lowerK === 'a') {
                    e.preventDefault();
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(0, -1)
                        : 4;
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
                if (lowerK === 'd') {
                    e.preventDefault();
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(0, 1)
                        : 6;
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
            }
        }

        // Context prompt (-more-) active: immediately dismiss with space (1:1 with Angband msg_flush)
        // and if a move or turn key was pressed, execute it so the character never gets stuck on stairs!
        if (ui && ui.more) {
            e.preventDefault();
            this.network.sendKey('space');

            const lowerMoreK = (this.wasdMode && !e.ctrlKey && !e.altKey && !e.metaKey) ? e.key.toLowerCase() : '';
            if (e.key === 'ArrowLeft' || (lowerMoreK === 'a' && !e.shiftKey)) {
                this.dungeon.turn(-1);
                this.syncCompass();
            } else if (e.key === 'ArrowRight' || (lowerMoreK === 'd' && !e.shiftKey)) {
                this.dungeon.turn(1);
                this.syncCompass();
            } else {
                const wasdMoreDir = lowerMoreK === 'w' ? 8 : (lowerMoreK === 's' ? 2 : (lowerMoreK === 'a' && e.shiftKey ? 4 : (lowerMoreK === 'd' && e.shiftKey ? 6 : 0)));
                const dir = wasdMoreDir || numpadDirMap[e.code] || numpadDirMap[e.key];
                if (dir) {
                    if (this.isRunningActive(e) && dir !== 5 && !wasdMoreDir) {
                        setTimeout(() => this.sendRunMove(dir), 35);
                    } else if (wasdMoreDir && this.isRunningActive(e) && (dir === 8 || dir === 2)) {
                        setTimeout(() => this.sendRunMove(dir), 35);
                    } else {
                        const moveKey = this.getRelativeDirectionKey(dir);
                        if (moveKey) setTimeout(() => this.sendMovementKey(moveKey), 35);
                    }
                } else if (e.key === 'ArrowUp') {
                    if (this.isRunningActive(e)) {
                        setTimeout(() => this.sendRunMove(8), 35);
                    } else {
                        const moveKey = this.getRelativeDirectionKey(8);
                        if (moveKey) setTimeout(() => this.sendMovementKey(moveKey), 35);
                    }
                } else if (e.key === 'ArrowDown') {
                    if (this.isRunningActive(e)) {
                        setTimeout(() => this.sendRunMove(2), 35);
                    } else {
                        const moveKey = this.getRelativeDirectionKey(2);
                        if (moveKey) setTimeout(() => this.sendMovementKey(moveKey), 35);
                    }
                }
            }
            return;
        }

        const isMore = Boolean(ui && ui.more);
        const isTopLevelCommandPrompt = Boolean(
            ui && ui.awaiting_command && !ui.more && (ui.overlay || 0) === 0
        );
        let isPromptActive = false;
        if (window.ScreenContext) {
            if (typeof window.ScreenContext.promptFlags === 'function') {
                const pf = window.ScreenContext.promptFlags(screenText);
                if (pf && (pf.isYesNoPrompt || pf.isQuantityPrompt)) isPromptActive = true;
            }
            if (typeof window.ScreenContext.classify === 'function') {
                const cls = window.ScreenContext.classify(lastFrame, realm);
                if (cls && (cls.isItemPrompt || cls.isStore || cls.isYesNoPrompt || cls.isQuantityPrompt || cls.isChoiceMenu || cls.isNamePrompt || cls.isMenuOrInteractive)) {
                    isPromptActive = true;
                }
            }
        }
        if (this.wasdMode && !skipWasdRemap && !isTargeting && !isMore && isTopLevelCommandPrompt && !isPromptActive && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const lowerK = e.key.toLowerCase();
            if (lowerK === 'w' || lowerK === 's' || lowerK === 'a' || lowerK === 'd') {
                e.preventDefault();
                this.clearDirectionHint();
                const runActive = this.isRunningActive(e);
                if (lowerK === 'w') {
                    if (runActive && e.repeat) return;
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(1, 0)
                        : 8;
                    if (dir) this.sendMoveOrRun(dir, runActive);
                } else if (lowerK === 's') {
                    if (runActive && e.repeat) return;
                    const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                        ? this.dungeon.getRelativeDirection(-1, 0)
                        : 2;
                    if (dir) this.sendMoveOrRun(dir, runActive);
                } else if (lowerK === 'a') {
                    if (e.shiftKey) {
                        const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                            ? this.dungeon.getRelativeDirection(0, -1)
                            : 4;
                        if (dir) this.sendMoveOrRun(dir, false);
                    } else {
                        if (this.dungeon && typeof this.dungeon.turnLeft === 'function') {
                            this.dungeon.turnLeft();
                        } else if (this.dungeon && typeof this.dungeon.turn === 'function') {
                            this.dungeon.turn(-1);
                        }
                        this.syncCompass();
                    }
                } else if (lowerK === 'd') {
                    if (e.shiftKey) {
                        const dir = (this.dungeon && typeof this.dungeon.getRelativeDirection === 'function')
                            ? this.dungeon.getRelativeDirection(0, 1)
                            : 6;
                        if (dir) this.sendMoveOrRun(dir, false);
                    } else {
                        if (this.dungeon && typeof this.dungeon.turnRight === 'function') {
                            this.dungeon.turnRight();
                        } else if (this.dungeon && typeof this.dungeon.turn === 'function') {
                            this.dungeon.turn(1);
                        }
                        this.syncCompass();
                    }
                }
                return;
            }
        }

        const dirKey = numpadDirMap[e.code] || numpadDirMap[e.key];
        if (dirKey) {
            const isDigitShift = e.shiftKey && e.code && e.code.startsWith('Digit');
            if (!isDigitShift) {
                e.preventDefault();
                const dir = dirKey;
                if (dir === 5) {
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? (RealmKeys.realmKey('hold', realm) || ',')
                        : ',';
                    this.network.sendKey(holdKey);
                    return;
                }
                if (this.isRunningActive(e)) {
                    if (e.repeat) return;
                    this.sendRunMove(dir);
                } else {
                    const moveKey = this.getRelativeDirectionKey(dir);
                    if (moveKey) this.sendMovementKey(moveKey);
                }
                return;
            }
        }

        // Turning is instant camera yaw (0 engine turns)
        // Holding Shift with ArrowLeft / ArrowRight executes Strafe Run Left / Strafe Run Right
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (this.isRunningActive(e) && e.shiftKey) {
                if (e.repeat) return;
                this.sendRunMove(4); // Strafe Run Left
            } else {
                this.dungeon.turn(-1);
            }
            return;
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (this.isRunningActive(e) && e.shiftKey) {
                if (e.repeat) return;
                this.sendRunMove(6); // Strafe Run Right
            } else {
                this.dungeon.turn(1);
            }
            return;
        }

        // Forward / Backward in current camera facing direction
        // If Shift is held or Run Toggle is active, runs forward or backward
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.isRunningActive(e)) {
                if (e.repeat) return;
                this.sendRunMove(8);
            } else {
                const moveKey = this.getRelativeDirectionKey(8);
                if (moveKey) this.sendMovementKey(moveKey);
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.isRunningActive(e)) {
                if (e.repeat) return;
                this.sendRunMove(2);
            } else {
                const moveKey = this.getRelativeDirectionKey(2);
                if (moveKey) this.sendMovementKey(moveKey);
            }
            return;
        }

        if (e.key === '.' && !e.shiftKey) {
            e.preventDefault();
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            this.network.sendKey(holdKey);
            return;
        }

        if (e.key === ',') {
            e.preventDefault();
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            this.network.sendKey(holdKey);
            return;
        }

        // Contextual Hero Action on Space / Enter
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (this.smartAction) {
                this.executeSmartAction(this.smartAction);
            } else {
                this.dungeon.triggerAttackAnimation();
                if (this.audio) this.audio.playWhoosh();
                const fwdKey = this.getRelativeDirectionKey(8) || 'up';
                this.network.sendKey(fwdKey);
            }
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            this.network.sendKey('enter');
            return;
        }

        // Forward Ctrl+letter combinations to engine (e.g. C-s save, C-x quit, C-d debug)
        if (e.key.length === 1 && e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            this.network.sendKey(`C-${e.key.toLowerCase()}`);
            return;
        }

        // General keys (e.g. 'i' for inventory, 'm' for cast spell, 'd' for drop, 'g' for pickup, 'q' for quaff, 'r' for read, 'w' for wear, 's' for sell/spike)
        // ALL single-character keys pass through to the Angband engine without interception!
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            let keyToSend = e.key;
            const isTopLevelWorldCmd = Boolean(
                ui && ui.awaiting_command && (ui.overlay || 0) === 0 && !ui.more
            );
            if (isTopLevelWorldCmd && typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla) {
                const mapped = RealmKeys.fromVanilla(e.key, realm);
                if (mapped === null && realm === 'silq' && (e.key === 'r' || e.key === 'b')) {
                    this.network.sendKey(e.key);
                    return;
                }
                if (mapped === null) {
                    return; // Verb does not exist in active realm (e.g. read in Sil-Q)
                }
                if (mapped !== undefined) {
                    keyToSend = mapped;
                }
            }
            if (this.audio) {
                const k = keyToSend;
                const kl = k.toLowerCase();
                if (k === 'T') {
                    if (typeof this.audio.playWallBump === 'function') this.audio.playWallBump(0.9);
                    else this.audio.playWhoosh();
                } else if (k === 'B') {
                    if (typeof this.audio.playDoorBreak === 'function') this.audio.playDoorBreak();
                    else this.audio.playWhoosh();
                } else if (k === 'D') {
                    if (typeof this.audio.playTrapDisarm === 'function') this.audio.playTrapDisarm();
                    else this.audio.playDoor(true);
                } else if (k === 'R' || k === '%') {
                    if (typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                } else if (k === '>' || k === '<') {
                    if (typeof this.audio.playStairs === 'function') this.audio.playStairs(k === '>');
                } else if (kl === 'm' || kl === 'b' || kl === 'p') this.audio.playMenuOpen();
                else if (kl === 's') {
                    if (typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                }
                else if (kl === 'q') this.audio.playQuaff();
                else if (kl === 'r') this.audio.playScroll();
                else if (kl === 'g' || kl === ',') this.audio.playItemPickup();
                else if (kl === 'd') this.audio.playItemDrop();
                else if (k === 'E') this.audio.playEat();
                else if (k === 'w') this.audio.playEquipWeapon();
                else if (k === 'W') this.audio.playEquipArmor();
                else if (k === 't') this.audio.playBowShoot();
                else if (kl === 'o') this.audio.playDoor(true);
                else if (kl === 'c') this.audio.playDoor(false);
                else if (kl === 'f' || kl === 'v') this.audio.playBowShoot();
                else if (kl === 'i' || kl === 'e') this.audio.playMenuOpen();
            }
            this.network.sendKey(keyToSend);
        }
    }

    /**
     * Angband movement key for a local direction (numpad 1-9) relative to current camera facing.
     * 1:1 mathematical parity with Godot client DungeonWorld.RelativeMoveKey.
     * 8 = Forward, 2 = Backward, 4 = Strafe Left, 6 = Strafe Right,
     * 7 = Forward-Left, 9 = Forward-Right, 1 = Backward-Left, 3 = Backward-Right, 5 = Stay.
     */
    getRelativeDirectionKey(numpadDir) {
        if (numpadDir === 5) {
            const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
            return (typeof RealmKeys !== 'undefined' && typeof RealmKeys.realmKey === 'function') ? (RealmKeys.realmKey('hold', realm) || ',') : ',';
        }
        const localIndexMap = {
            8: 0,
            9: 1,
            6: 2,
            3: 3,
            2: 4,
            1: 5,
            4: 6,
            7: 7
        };
        const localIndex = localIndexMap[numpadDir];
        if (localIndex === undefined) return null;
        // Cardinal and diagonal Angband movement keys (1:1 with Godot DungeonWorld.cs)
        const dirKeys = ['up', 'pageup', 'right', 'pagedown', 'down', 'end', 'left', 'home'];
        const facing = (this.dungeon && typeof this.dungeon.facing === 'number') ? this.dungeon.facing : 0;
        const targetWorldSector = (localIndex + facing * 2) % 8;
        return dirKeys[targetWorldSector];
    }

    isDirectionalTargeting() {
        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
        if (!lastFrame) return false;
        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
            ? window.ScreenContext.screenTextOf(lastFrame)
            : '';
        const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
        const isHeng = realm === 'hengband';
        const inPlay = Boolean(lastFrame.phase === 'play');
        return Boolean(
            (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
            (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay))
        );
    }

    setupActionButtons() {
        // Universal helper for reliable mobile touch + desktop click handling:
        // - Tracks displacement during touchmove (>10px cancels activation if user was scrolling/swiping)
        // - Prevents default on touchend to eliminate 300ms tap latency and block emulated clicks
        // - Enforces a 500ms suppression window on click events to guarantee 1 tap = 1 action
        const bindReliableAction = (btn, onTrigger) => {
            let startX = 0;
            let startY = 0;
            let moved = false;
            let lastTouchEndTime = 0;

            btn.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches.length > 0) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    moved = false;
                }
            }, { passive: true });

            btn.addEventListener('touchmove', (e) => {
                if (e.touches && e.touches.length > 0) {
                    const dx = Math.abs(e.touches[0].clientX - startX);
                    const dy = Math.abs(e.touches[0].clientY - startY);
                    if (dx > 10 || dy > 10) {
                        moved = true; // Dragging or scrolling
                    }
                }
            }, { passive: true });

            btn.addEventListener('touchend', (e) => {
                lastTouchEndTime = Date.now();
                if (!moved) {
                    if (e.cancelable) e.preventDefault();
                    onTrigger(e);
                }
            }, { passive: false });

            btn.addEventListener('touchcancel', () => {
                lastTouchEndTime = Date.now();
            }, { passive: true });

            btn.addEventListener('click', (e) => {
                // Suppress synthetic clicks emitted by mobile browsers after touch
                if (Date.now() - lastTouchEndTime < 500) {
                    if (e.cancelable) e.preventDefault();
                    return;
                }
                onTrigger(e);
            });
        };

        const bind = (id, verb) => {
            const btn = document.getElementById(id);
            if (btn) {
                let lastTriggerTime = 0;
                const fire = (ev, attempt = 0) => {
                    const now = Date.now();
                    if (now - lastTriggerTime < 280) return; // Debounce rapid triggers
                    lastTriggerTime = now;

                    if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                    if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');
                    if (this.audio) this.audio.unlock();

                    const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                    if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                        this.network.sendKey('space');
                        if (attempt < 3) {
                            lastTriggerTime = 0;
                            setTimeout(() => {
                                fire(ev, attempt + 1);
                            }, 45);
                        }
                        return;
                    }

                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';

                    if (verb === 'toggle-run') {
                        this.toggleDpadRunMode();
                        return;
                    } else if (verb === 'attack') {
                        this.dungeon.triggerAttackAnimation();
                        if (this.audio) this.audio.playWhoosh();
                        const lastFrame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
                        const px = lastFrame?.player?.x;
                        const py = lastFrame?.player?.y;
                        const yaw = -(this.dungeon && typeof this.dungeon.yaw === 'number' ? this.dungeon.yaw : 0);
                        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
                        const forwardOffsets = [
                            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
                            { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
                        ];
                        const fwd = forwardOffsets[sector] || { dx: 0, dy: -1 };
                        const deltaToDirKey = (dx, dy) => {
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
                        let targetDirKey = null;
                        const monsters = (lastFrame && Array.isArray(lastFrame.monsters)) ? lastFrame.monsters : [];
                        if (px !== undefined && py !== undefined) {
                            const facingMonster = monsters.find(m => m && m.x === px + fwd.dx && m.y === py + fwd.dy && this.isHostileMonster(m, lastFrame));
                            if (facingMonster) {
                                targetDirKey = deltaToDirKey(fwd.dx, fwd.dy);
                            } else {
                                const neighbors = [
                                    { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
                                    { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
                                ];
                                for (const n of neighbors) {
                                    const m = monsters.find(mon => mon && mon.x === px + n.dx && mon.y === py + n.dy && this.isHostileMonster(mon, lastFrame));
                                    if (m) {
                                        targetDirKey = deltaToDirKey(n.dx, n.dy);
                                        break;
                                    }
                                }
                            }
                        }
                        if (!targetDirKey) {
                            targetDirKey = this.getRelativeDirectionKey(8) || 'up';
                        }
                        this.network.sendKey(targetDirKey);
                        return;
                    } else if (verb === 'terminal') {
                        if (this.toggleTerminalView) this.toggleTerminalView();
                        return;
                    } else if (verb === 'wield') {
                        this.openContextualMenu('wield');
                        return;
                    } else if (verb === 'drop') {
                        this.openContextualMenu('drop');
                        return;
                    } else if (verb === 'search') {
                        const sKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                            ? RealmKeys.realmKey('search', realm)
                            : null;
                        if (sKey) {
                            this.network.sendKey(sKey);
                        }
                        return;
                    }

                    const effKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? RealmKeys.realmKey(verb, realm)
                        : null;

                    if (!effKey) {
                        // Verb does not exist in active realm (e.g. read in Sil-Q)
                        return;
                    }

                    if (this.isDirectionalTargeting && this.isDirectionalTargeting() && (verb !== 'attack' && verb !== 'fire' && verb !== 'throw')) {
                        this.network.sendKey('escape');
                        setTimeout(() => {
                            if (this.audio) {
                                if (effKey === 's' && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                                else if (effKey === 'm' || effKey === 'i' || effKey === 'e' || effKey === 'v' || effKey === 't' || effKey === 'N' || effKey === 'tab' || effKey === 'U' || effKey === 'O' || effKey === 'Q' || effKey === 'b' || effKey === 'G') this.audio.playMenuOpen();
                                else if (effKey === 'g') this.audio.playItemPickup();
                                else if (effKey === 'q') (typeof this.audio.playQuaff === 'function') ? this.audio.playQuaff() : this.audio.playMenuOpen();
                                else if (effKey === 'r') (typeof this.audio.playScroll === 'function') ? this.audio.playScroll() : this.audio.playMenuOpen();
                                else if (effKey === 'f') (typeof this.audio.playBowShoot === 'function') ? this.audio.playBowShoot() : this.audio.playWhoosh();
                            }
                            this.network.sendKey(effKey);
                        }, 40);
                        return;
                    }

                    if (verb === 'rest') {
                        if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                        this.network.sendKey(effKey);
                        // If the realm's rest key is 'R', follow with enter (prompting for duration)
                        if (effKey === 'R') {
                            setTimeout(() => {
                                const lf = window.__app && window.__app.lastFrame;
                                if (!lf || lf.phase !== 'play') return;
                                this.network.sendKey('enter');
                            }, 80);
                        }
                        return;
                    } else if (verb === 'open') {
                        // Open door in front of camera facing or adjacent closed door
                        if (this.audio) this.audio.playDoor();
                        const lastFrame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
                        const px = lastFrame?.player?.x;
                        const py = lastFrame?.player?.y;
                        const yaw = -(this.dungeon && typeof this.dungeon.yaw === 'number' ? this.dungeon.yaw : 0);
                        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
                        const forwardOffsets = [
                            { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
                            { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
                        ];
                        const fwd = forwardOffsets[sector] || { dx: 0, dy: -1 };
                        const deltaToDirKey = (dx, dy) => {
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
                        let doorDirKey = null;
                        if (lastFrame && lastFrame.map && px !== undefined && py !== undefined) {
                            const isClosedDoor = (x, y) => {
                                const feat = this.getFeatAt ? this.getFeatAt(lastFrame.map, x, y) : 0;
                                const row = lastFrame.map.rows && lastFrame.map.rows[y];
                                const ch = (row && row.g && x >= 0 && x < row.g.length) ? row.g[x] : ' ';
                                return feat === 2 || ch === '+';
                            };
                            if (isClosedDoor(px + fwd.dx, py + fwd.dy)) {
                                doorDirKey = deltaToDirKey(fwd.dx, fwd.dy);
                            } else {
                                const neighbors = [
                                    { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
                                    { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
                                ];
                                for (const n of neighbors) {
                                    if (isClosedDoor(px + n.dx, py + n.dy)) {
                                        doorDirKey = deltaToDirKey(n.dx, n.dy);
                                        break;
                                    }
                                }
                            }
                        }
                        if (!doorDirKey) {
                            doorDirKey = this.getRelativeDirectionKey(8) || 'up';
                        }
                        this.network.sendKey(effKey);
                        setTimeout(() => {
                            const lf = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame);
                            if (!lf || lf.phase !== 'play') return;
                            this.network.sendKey(doorDirKey);
                        }, 80);
                        return;
                    }

                    if (this.audio) {
                        if (effKey === 's' && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                        else if (effKey === 'm' || effKey === 'i' || effKey === 'e' || effKey === 'v' || effKey === 't' || effKey === 'N' || effKey === 'tab' || effKey === 'U' || effKey === 'O' || effKey === 'Q' || effKey === 'b' || effKey === 'G') this.audio.playMenuOpen();
                        else if (effKey === 'g') this.audio.playItemPickup();
                        else if (effKey === 'q') (typeof this.audio.playQuaff === 'function') ? this.audio.playQuaff() : this.audio.playMenuOpen();
                        else if (effKey === 'r') (typeof this.audio.playScroll === 'function') ? this.audio.playScroll() : this.audio.playMenuOpen();
                        else if (effKey === 'f') (typeof this.audio.playBowShoot === 'function') ? this.audio.playBowShoot() : this.audio.playWhoosh();
                    }
                    this.network.sendKey(effKey);
                };

                bindReliableAction(btn, fire);
            }
        };

        bind('btn-attack', 'attack');
        bind('btn-throw', 'throw');
        bind('btn-fire', 'fire');
        bind('btn-cast', 'cast');
        bind('btn-skills', 'skills');
        bind('btn-power', 'power');
        bind('btn-overland', 'overland');
        bind('btn-quests', 'quests');
        bind('btn-browse', 'browse');
        bind('btn-study', 'study');
        bind('btn-quaff', 'quaff');
        bind('btn-read', 'read');
        bind('btn-door', 'open');
        bind('btn-pickup', 'pickup');
        bind('btn-rest', 'rest');
        bind('btn-inventory', 'inven');
        bind('btn-equipment', 'equip');
        bind('btn-wield', 'wield');
        bind('btn-drop', 'drop');
        bind('btn-search', 'search');
        bind('btn-terminal', 'terminal');
        bind('btn-run-toggle', 'toggle-run');

        // Dynamic Hero Context Action Button (#btn-hero-action)
        const btnHero = document.getElementById('btn-hero-action');
        if (btnHero) {
            bindReliableAction(btnHero, () => {
                const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                    this.network.sendKey('space');
                    return;
                }
                if (this.smartAction) {
                    this.executeSmartAction(this.smartAction);
                } else {
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? (RealmKeys.realmKey('hold', realm) || ',')
                        : ',';
                    this.network.sendKey(holdKey);
                }
            });
        }

        // Non-Intrusive Context Action Cue (#context-action-cue)
        const actionCue = document.getElementById('context-action-cue');
        if (actionCue) {
            bindReliableAction(actionCue, () => {
                const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                    this.network.sendKey('space');
                    return;
                }
                if (this.smartAction) {
                    this.executeSmartAction(this.smartAction);
                } else {
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? (RealmKeys.realmKey('hold', realm) || ',')
                        : ',';
                    this.network.sendKey(holdKey);
                }
            });
        }

        // 8-Way Directional Aim Rosette
        const rosette = document.getElementById('directional-aim-rosette');
        if (rosette) {
            const backdrop = rosette.querySelector('.rosette-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    rosette.classList.add('hidden');
                    this.network.sendKey('escape');
                });
            }
            const sectors = rosette.querySelectorAll('.rosette-sector');
            sectors.forEach(sec => {
                bindReliableAction(sec, () => {
                    const dir = parseInt(sec.dataset.dir, 10);
                    const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                    const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
                        ? window.ScreenContext.screenTextOf(lastFrame)
                        : '';
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const isHeng = realm === 'hengband';
                    const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
                    const ntFlags = {
                        isDirectionalTargeting: Boolean(
                            (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
                            (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay))
                        )
                    };
                    const isTargeting = Boolean(ntFlags && ntFlags.isDirectionalTargeting);

                    if (dir === 5) {
                        if (isTargeting) {
                            this.network.sendKey('t');
                        } else {
                            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                                ? (RealmKeys.realmKey('hold', realm) || ',')
                                : ',';
                            this.network.sendKey(holdKey);
                        }
                    } else if (!isNaN(dir)) {
                        const moveKey = this.getRelativeDirectionKey(dir);
                        if (moveKey) this.network.sendKey(moveKey);
                    }
                    rosette.classList.add('hidden');
                });
            });
        }

        // Dynamic Staircase Action Button
        const stairBtn = document.getElementById('btn-stair');
        if (stairBtn) {
            let lastStairTime = 0;
            const fireStair = (ev) => {
                const now = Date.now();
                if (now - lastStairTime < 280) return;
                lastStairTime = now;
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('medium');
                if (this.audio) this.audio.unlock();
                const key = stairBtn.dataset.key || '>';
                this.network.sendKey(key);
            };
            bindReliableAction(stairBtn, fireStair);
        }

        // Action Bar Overflow & Mobile Drawer (§9.1 / WS9.1)
        const actionMoreBtn = document.getElementById('btn-action-more');
        const actionBar = document.getElementById('action-bar');
        const actionPopover = document.getElementById('action-more-popover');

        const ACTION_PRIORITY = [
            'btn-hero-action',
            'btn-attack',
            'btn-cast',
            'btn-fire',
            'btn-throw',
            'btn-quaff',
            'btn-read',
            'btn-pickup',
            'btn-rest',
            'btn-inventory',
            'btn-equipment',
            'btn-wield',
            'btn-drop',
            'btn-search',
            'btn-door',
            'btn-power',
            'btn-browse',
            'btn-study',
            'btn-skills',
            'btn-quests',
            'btn-overland',
            'btn-stair',
            'btn-run-toggle',
            'btn-terminal',
            'btn-guide-hud',
            'btn-command-palette'
        ];

        if (actionMoreBtn && actionBar) {
            let lastMoreTime = 0;

            const updateActionBarOverflow = () => {
                const isSmallOrCoarse = window.innerWidth <= 900 || window.matchMedia('(pointer: coarse)').matches;
                const allButtons = ACTION_PRIORITY.map(id => document.getElementById(id)).filter(Boolean);

                if (isSmallOrCoarse) {
                    // Mobile / coarse pointer: keep all buttons inside #action-bar (before #btn-action-more)
                    // so mobile CSS (#action-bar:not(.drawer-open) vs #action-bar.drawer-open) always displays
                    // the 6 primary thumb buttons (Attack, Get, Potion, Pack, Classic, More) and expands cleanly.
                    for (const btn of allButtons) {
                        if (btn.parentElement !== actionBar) {
                            actionBar.insertBefore(btn, actionMoreBtn);
                        }
                        btn.removeAttribute('data-overflow-hidden');
                        if (btn.dataset.realmHidden === '1' || btn.dataset.contextHidden === '1') {
                            btn.style.display = 'none';
                        }
                    }
                    if (actionPopover) actionPopover.classList.remove('is-open');
                    actionMoreBtn.classList.add('is-needed');
                    actionMoreBtn.style.display = 'inline-flex';
                } else {
                    // Desktop fine pointer: restore all visible buttons into actionBar before actionMoreBtn
                    for (const btn of allButtons) {
                        if (btn.parentElement !== actionBar) {
                            actionBar.insertBefore(btn, actionMoreBtn);
                        }
                        btn.removeAttribute('data-overflow-hidden');
                        if (btn.dataset.realmHidden === '1' || btn.dataset.contextHidden === '1') {
                            btn.style.display = 'none';
                        }
                    }

                    // Check row count (2 rows max)
                    const firstBtn = actionBar.querySelector('.action-btn:not(#btn-action-more)');
                    const btnHeight = (firstBtn && firstBtn.offsetHeight > 0) ? firstBtn.offsetHeight : 34;
                    const maxTwoRowHeight = btnHeight * 2 + 10;

                    if (actionBar.offsetHeight > 0 && actionBar.scrollHeight > maxTwoRowHeight) {
                        actionMoreBtn.classList.add('is-needed');
                        actionMoreBtn.style.display = 'inline-flex';

                        // Move trailing visible buttons by reverse priority into actionPopover until scrollHeight <= 2 rows
                        for (let i = allButtons.length - 1; i >= 0; i--) {
                            const btn = allButtons[i];
                            if (btn.dataset.realmHidden === '1' || btn.dataset.contextHidden === '1') continue;
                            if (btn.parentElement === actionBar) {
                                if (actionPopover) actionPopover.insertBefore(btn, actionPopover.firstChild);
                                btn.setAttribute('data-overflow-hidden', '1');
                                if (actionBar.scrollHeight <= maxTwoRowHeight) {
                                    break;
                                }
                            }
                        }
                    } else {
                        actionMoreBtn.classList.remove('is-needed');
                        actionMoreBtn.style.display = 'none';
                        if (actionPopover) actionPopover.classList.remove('is-open');
                    }
                }
            };

            const toggleDrawer = (ev) => {
                const now = Date.now();
                if (now - lastMoreTime < 100) return;
                lastMoreTime = now;
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');

                const isSmallOrCoarse = window.innerWidth <= 900 || window.innerHeight <= 500 || window.matchMedia('(pointer: coarse)').matches;
                let isOpen;
                if (isSmallOrCoarse) {
                    isOpen = actionBar.classList.toggle('drawer-open');
                    if (actionPopover) actionPopover.classList.remove('is-open');
                } else {
                    isOpen = actionPopover ? actionPopover.classList.toggle('is-open') : actionBar.classList.toggle('drawer-open');
                    actionBar.classList.toggle('drawer-open', isOpen);
                }
                actionMoreBtn.textContent = isOpen ? '✕ Close' : '⋯ More';
            };
            bindReliableAction(actionMoreBtn, toggleDrawer);

            const closeDrawer = () => {
                if (actionPopover && actionPopover.classList.contains('is-categorized-menu')) {
                    actionPopover.classList.remove('is-categorized-menu');
                    actionPopover.innerHTML = '';
                }
                if (actionPopover) actionPopover.classList.remove('is-open');
                actionBar.classList.remove('drawer-open');
                actionMoreBtn.textContent = '⋯ More';
            };

            if (actionPopover) {
                actionPopover.addEventListener('click', (ev) => {
                    const proxyBtn = ev.target ? ev.target.closest('[data-proxy-for]') : null;
                    if (proxyBtn) {
                        const targetId = proxyBtn.getAttribute('data-proxy-for');
                        closeDrawer();
                        const orig = targetId ? document.getElementById(targetId) : null;
                        if (orig) orig.click();
                        return;
                    }
                    const openModalBtn = ev.target ? ev.target.closest('[data-open-cmd-modal]') : null;
                    if (openModalBtn) {
                        closeDrawer();
                        if (window.__app && typeof window.__app.showCommandPalette === 'function') {
                            window.__app.showCommandPalette('game');
                        }
                        return;
                    }
                    const toggleInlineBtn = ev.target ? ev.target.closest('[data-toggle-inline-drawer]') : null;
                    if (toggleInlineBtn) {
                        const nextOpen = !actionBar.classList.contains('drawer-open');
                        closeDrawer();
                        actionBar.classList.toggle('drawer-open', nextOpen);
                        return;
                    }
                    const target = ev.target ? ev.target.closest('.action-btn') : null;
                    if (target) closeDrawer();
                });
            }

            document.addEventListener('click', (ev) => {
                if (!actionBar.contains(ev.target) && (!actionPopover || !actionPopover.contains(ev.target))) {
                    closeDrawer();
                }
            });

            if (typeof ResizeObserver !== 'undefined') {
                let roTimer = null;
                const ro = new ResizeObserver(() => {
                    if (roTimer) cancelAnimationFrame(roTimer);
                    roTimer = requestAnimationFrame(updateActionBarOverflow);
                });
                ro.observe(actionBar);
                if (actionBar.parentElement) ro.observe(actionBar.parentElement);
            }
            window.addEventListener('resize', updateActionBarOverflow);
            window.__updateActionBarOverflow = updateActionBarOverflow;
            for (const initNestedId of ['btn-throw', 'btn-fire', 'btn-skills', 'btn-power', 'btn-overland', 'btn-quests', 'btn-browse', 'btn-study', 'btn-quaff', 'btn-read', 'btn-equipment', 'btn-wield', 'btn-drop', 'btn-search', 'btn-run-toggle', 'btn-guide-hud']) {
                const nb = document.getElementById(initNestedId);
                if (nb) nb.classList.add('is-nested-action');
            }
            window.__toggleCategorizedActionPopover = () => {
                const isSmallOrCoarse = window.innerWidth <= 900 || window.matchMedia('(pointer: coarse)').matches;
                if (isSmallOrCoarse || !actionPopover) {
                    if (window.__app && typeof window.__app.showCommandPalette === 'function') {
                        window.__app.showCommandPalette('game');
                    }
                    return;
                }
                if (actionPopover.classList.contains('is-open') && actionPopover.classList.contains('is-categorized-menu')) {
                    closeDrawer();
                    return;
                }
                const groups = [
                    { title: '⚔ Combat & Magic', ids: ['btn-attack', 'btn-cast', 'btn-fire', 'btn-throw', 'btn-power', 'btn-skills', 'btn-browse', 'btn-study'] },
                    { title: '🎒 Pack & Items', ids: ['btn-quaff', 'btn-read', 'btn-inventory', 'btn-equipment', 'btn-wield', 'btn-drop', 'btn-pickup'] },
                    { title: '🧭 Explore & System', ids: ['btn-door', 'btn-stair', 'btn-search', 'btn-rest', 'btn-run-toggle', 'btn-overland', 'btn-quests', 'btn-guide-hud'] }
                ];
                let html = '';
                for (const g of groups) {
                    const itemsHtml = [];
                    for (const id of g.ids) {
                        const b = document.getElementById(id);
                        if (!b || b.dataset.realmHidden === '1' || b.dataset.contextHidden === '1') continue;
                        const sugCls = b.classList.contains('is-suggested') ? 'is-suggested' : '';
                        const dimCls = b.classList.contains('is-contextual-dim') ? 'is-contextual-dim' : '';
                        const ttl = String(b.title || '').replace(/"/g, '&quot;');
                        itemsHtml.push(`<button type="button" class="action-btn action-cat-proxy-btn ${sugCls} ${dimCls}" data-proxy-for="${id}" title="${ttl}">${b.innerHTML}</button>`);
                    }
                    if (itemsHtml.length > 0) {
                        html += `<div class="action-cat-group"><div class="action-cat-title">${g.title}</div><div class="action-cat-grid">${itemsHtml.join('')}</div></div>`;
                    }
                }
                const inlineExpanded = actionBar.classList.contains('drawer-open');
                html += `<div class="action-cat-footer">
                    <button type="button" class="action-btn action-cat-all-btn" data-open-cmd-modal="1" title="Open Full Searchable Command Palette [Ctrl+K]">🔍 Search All Commands... <kbd>Ctrl+K</kbd></button>
                    <button type="button" class="action-btn action-cat-expand-btn" data-toggle-inline-drawer="1">${inlineExpanded ? '▴ Collapse Inline Bar' : '▾ Expand All Inline'}</button>
                </div>`;
                actionPopover.innerHTML = html;
                actionPopover.classList.add('is-open', 'is-categorized-menu');
            };
            setTimeout(updateActionBarOverflow, 100);
        }

        // HUD Help / Controls Sheet Buttons
        const guideHudBtn = document.getElementById('btn-guide-hud');
        if (guideHudBtn) {
            guideHudBtn.addEventListener('click', (ev) => {
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.__app && window.__app.showGuide) {
                    window.__app.showGuide(1, 'game');
                }
            });
        }

        const quickHelpBtn = document.getElementById('btn-quick-help');
        if (quickHelpBtn) {
            quickHelpBtn.addEventListener('click', (ev) => {
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.__app && window.__app.showGuide) {
                    window.__app.showGuide(1, 'game');
                }
            });
        }

        // Minimap Explicit Size & Zoom Control Buttons
        const bindClick = (id, fn) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', (ev) => {
                    if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                    if (this.audio) this.audio.unlock();
                    fn();
                });
            }
        };

        // Minimap zoom buttons are bound in hud.js setupMinimapControls

        // Camera Head Tilt Buttons
        bindClick('btn-tilt-up', () => {
            if (this.dungeon) {
                this.dungeon.userPitchOffset = Math.min(1.25, (this.dungeon.userPitchOffset || 0) + 0.12);
            }
        });
        bindClick('btn-tilt-reset', () => {
            if (this.dungeon) {
                this.dungeon.userPitchOffset = 0.0;
            }
        });
        bindClick('btn-tilt-down', () => {
            if (this.dungeon) {
                this.dungeon.userPitchOffset = Math.max(-0.65, (this.dungeon.userPitchOffset || 0) - 0.12);
            }
        });

        // 4-Slot Bindable Quick-Action Bar (#quick-slot-bar)
        for (let i = 0; i < 4; i++) {
            const qBtn = document.getElementById(`quick-slot-btn-${i + 1}`);
            if (qBtn) {
                bindReliableAction(qBtn, (ev) => {
                    if (ev && ev.stopPropagation) ev.stopPropagation();
                    this.triggerQuickSlot(i);
                });
                qBtn.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const curRealm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    const curFrame = (window.__app && window.__app.lastFrame) || null;
                    if (window.QuickActionManager) {
                        window.QuickActionManager.openBinderPopover(i, curFrame, curRealm);
                    }
                });
            }
        }
        const qsConfigBtn = document.getElementById('btn-quick-slot-config');
        if (qsConfigBtn) {
            bindReliableAction(qsConfigBtn, (ev) => {
                if (ev && ev.stopPropagation) ev.stopPropagation();
                const pop = document.getElementById('quick-slot-popover');
                if (pop && pop.classList.contains('is-open')) {
                    pop.classList.remove('is-open');
                    return;
                }
                const curRealm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                const curFrame = (window.__app && window.__app.lastFrame) || null;
                if (window.QuickActionManager) {
                    window.QuickActionManager.openBinderPopover(0, curFrame, curRealm);
                }
            });
        }

        // Clicking anywhere in world exploration while -more- prompt is up dismisses prompt
        window.addEventListener('click', (e) => {
            if (e.target && e.target.closest && e.target.closest('#quick-slot-bar, #quick-slot-popover, #minimap-canvas, #grimoire-deck-container, #streetview-nav-rosette, #edge-turn-left, #edge-turn-right')) {
                return;
            }
            const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
            if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                const inModal = e.target.closest('#pause-modal, #load-modal, #guide-modal, #death-modal');
                if (!inModal) {
                    this.network.sendKey('space');
                }
            }
        });

        const fsBtn = document.getElementById('btn-fullscreen');
        if (fsBtn) fsBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    setupTouchEvents() {
        const bindTouch = (id, action, allowRepeat = false) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            let holdTimer = null;
            let repeatInterval = null;

            const startAction = (e) => {
                if (e && e.cancelable) e.preventDefault();
                if (this.audio) this.audio.unlock();
                if (window.DeviceProfile) window.DeviceProfile.vibrate(12);
                action();

                if (allowRepeat && !this.dpadRunMode) {
                    clearTimeout(holdTimer);
                    clearInterval(repeatInterval);
                    holdTimer = setTimeout(() => {
                        repeatInterval = setInterval(() => {
                            if (this.dpadRunMode) {
                                clearInterval(repeatInterval);
                                return;
                            }
                            if (window.DeviceProfile) window.DeviceProfile.vibrate(8);
                            action();
                        }, 140);
                    }, 300);
                }
            };

            const stopAction = () => {
                clearTimeout(holdTimer);
                clearInterval(repeatInterval);
                holdTimer = null;
                repeatInterval = null;
            };

            btn.addEventListener('touchstart', startAction, { passive: false });
            btn.addEventListener('touchend', stopAction, { passive: true });
            btn.addEventListener('touchcancel', stopAction, { passive: true });

            btn.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                startAction(e);
            });
            btn.addEventListener('mouseup', stopAction);
            btn.addEventListener('mouseleave', stopAction);
        };

        // D-Pad Run / Walk Mode Toggle Button & Persisted State
        const runToggleBtn = document.getElementById('dpad-run-toggle');
        if (runToggleBtn) {
            let lastToggleTime = 0;
            const doToggle = (e) => {
                if (e && e.cancelable) e.preventDefault();
                const now = Date.now();
                if (now - lastToggleTime < 250) return;
                lastToggleTime = now;
                this.toggleDpadRunMode();
            };
            runToggleBtn.addEventListener('click', doToggle);
            runToggleBtn.addEventListener('touchend', doToggle);
        }

        // Directional movement dispatcher with automatic continuous sprinting in Run mode
        const sendDirectionalMove = (dir) => {
            if (this.dpadRunMode) {
                this.sendRunMove(dir);
            } else {
                const key = this.getRelativeDirectionKey(dir);
                if (key) this.sendMovementKey(key);
            }
        };

        // Top Turning Shoulder Wings
        bindTouch('dpad-turn-left', () => {
            this.dungeon.turn(-1);
        }, false);

        bindTouch('dpad-turn-right', () => {
            this.dungeon.turn(1);
        }, false);

        // Directional cardinal and diagonal movement buttons support hold-to-repeat
        bindTouch('dpad-up', () => {
            sendDirectionalMove(8);
        }, true);

        bindTouch('dpad-down', () => {
            sendDirectionalMove(2);
        }, true);

        // Strafe Left & Strafe Right on primary D-pad cardinal wings
        bindTouch('dpad-left', () => {
            sendDirectionalMove(4);
        }, true);

        bindTouch('dpad-right', () => {
            sendDirectionalMove(6);
        }, true);

        // Smart Multifunction Center D-Pad Action
        bindTouch('dpad-center', () => {
            this.triggerContextCenterAction();
        }, false);

        // 3D StreetView Ground Navigation Rosette Buttons (#streetview-nav-rosette)
        bindTouch('sv-turn-left', () => {
            if (this.dungeon && typeof this.dungeon.turn === 'function') this.dungeon.turn(-1);
        }, false);

        bindTouch('sv-turn-right', () => {
            if (this.dungeon && typeof this.dungeon.turn === 'function') this.dungeon.turn(1);
        }, false);

        // Far-Left & Far-Right Viewport Edge Mouseover/Click Turn Chevrons (#edge-turn-left, #edge-turn-right)
        bindTouch('edge-turn-left', () => {
            if (this.dungeon && typeof this.dungeon.turn === 'function') this.dungeon.turn(-1);
        }, true);

        bindTouch('edge-turn-right', () => {
            if (this.dungeon && typeof this.dungeon.turn === 'function') this.dungeon.turn(1);
        }, true);

        for (const dir of [8, 9, 6, 3, 2, 1, 4, 7]) {
            bindTouch('sv-dir-' + dir, () => {
                if (this.isAutoNavigating()) this.stopMinimapAutoNav('Cancelled');
                sendDirectionalMove(dir);
            }, true);
        }

        bindTouch('sv-dir-5', () => {
            if (this.isAutoNavigating()) {
                this.stopMinimapAutoNav('Cancelled');
                return;
            }
            this.triggerContextCenterAction();
        }, false);

        // Diagonal Touch D-Pad buttons with hold-to-repeat
        bindTouch('dpad-ul', () => {
            sendDirectionalMove(7);
        }, true);

        bindTouch('dpad-ur', () => {
            sendDirectionalMove(9);
        }, true);

        bindTouch('dpad-dl', () => {
            sendDirectionalMove(1);
        }, true);

        bindTouch('dpad-dr', () => {
            sendDirectionalMove(3);
        }, true);
    }

    getFeatAt(map, x, y) {
        if (!map || !map.rows || y < 0 || y >= (map.h || map.rows.length) || x < 0) return 0;
        const row = map.rows[y];
        if (!row || !row.f) return 0;
        const idx = x * 2;
        if (idx + 1 >= row.f.length) return 0;
        const hi = parseInt(row.f[idx], 16) || 0;
        const lo = parseInt(row.f[idx + 1], 16) || 0;
        return (hi << 4) | lo;
    }

    isHostileMonster(m, frame) {
        if (!m || m.visible === false || m.ml === false || m.friendly || m.pet || m.peaceful) return false;
        const depth = (frame && frame.player && frame.player.depth !== undefined) ? frame.player.depth : 0;
        const r = String((frame && frame.realm) || (this.app && this.app.getActiveRealm && this.app.getActiveRealm()) || (typeof window !== 'undefined' && window.__app && window.__app.getActiveRealm && window.__app.getActiveRealm()) || 'angband').toLowerCase();
        if (depth === 0 && r !== 'silq') {
            if (typeof m.hp === 'number' && typeof m.hp_max === 'number' && m.hp < m.hp_max) return true;
            if (m.hostile || m.is_hostile) return true;
            const nm = String(m.name || '').toLowerCase();
            if (/towns|citizen|urchin|mercenary|drunk|blubbering|idiot|pitiful|beggar|mayor|agent|shopkeeper|villager|peasant|sailor|veteran|battle-scarred|mean-looking|tamer|bard|cat|dog|leper|squint-eyed|farmer|maggot|町人|市民|酔っ払い|乞食|傭兵|浮浪児|村人|野良猫|野良犬/.test(nm)) return false;
            if (m.glyph === 't' || m.glyph === '@' || m.glyph === 'p' || m.glyph === 'h') return false;
        }
        return true;
    }

    canPlayerShootRanged(frame) {
        if (!frame || !frame.player) return false;
        const player = frame.player;
        const r = String(frame.realm || (this.app && this.app.getActiveRealm && this.app.getActiveRealm()) || (typeof window !== 'undefined' && window.__app && window.__app.getActiveRealm && window.__app.getActiveRealm()) || 'angband').toLowerCase();
        const isVanilla = r === 'angband';
        const inv = Array.isArray(player.inventory) ? player.inventory : [];
        const eq = Array.isArray(player.equipment) ? player.equipment : [];
        const quiv = Array.isArray(player.quiver) ? player.quiver : [];
        const statuses = Array.isArray(player.statuses) ? player.statuses : [];
        const isDisabling = statuses.some((s) => /blind|confus|paralyz|stun|hallucinat|盲目|混乱|麻痺|朦朧|幻覚/i.test(String((s && (s.name || s)) || '')));
        if (isDisabling) return false;

        const hasBow = Boolean(player.bow_item) || eq.some((it) => /\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(String((it && it.name) || '')) || /(ボウ|スリング|弓)/.test(String((it && it.name) || '')) || Number(it && it.tval) === (isVanilla ? 5 : 19));
        if (!hasBow) return false;

        const hasEquipAmmo = eq.some((it) => /\b(arrow|bolt|shot|pebble|seeker|sheaf)\b/i.test(String((it && it.name) || '')) || (!isVanilla && (Number(it && it.tval) >= 16 && Number(it && it.tval) <= 18)));
        const hasInvAmmo = inv.some((it) => {
            const nm = String((it && it.name) || '');
            const lower = nm.toLowerCase();
            const tv = Number(it && it.tval) || 0;
            const isAmmoTv = isVanilla ? (tv >= 2 && tv <= 4) : (tv >= 16 && tv <= 18);
            return (/\b(arrow|bolt|shot|pebble|seeker|sheaf)\b/.test(lower) && !/\b(bow|crossbow|sling)\b/.test(lower)) || /(矢|弾|丸石)/.test(nm) || isAmmoTv;
        });
        return quiv.length > 0 || Boolean(player.quiver_item) || hasEquipAmmo || hasInvAmmo;
    }

    raycastTargetAhead(frame, px, py, fwd) {
        if (!frame || !frame.map) return null;
        for (let d = 1; d <= 8; d++) {
            const rx = px + fwd.dx * d;
            const ry = py + fwd.dy * d;

            if (frame.monsters && Array.isArray(frame.monsters)) {
                const m = frame.monsters.find(mon => mon && mon.x === rx && mon.y === ry);
                if (m && this.isHostileMonster(m, frame)) {
                    return { type: 'monster', data: m, dist: d, x: rx, y: ry };
                }
            }

            const feat = this.getFeatAt(frame.map, rx, ry);
            if (feat === 2) {
                return { type: 'door', feat, dist: d, x: rx, y: ry };
            }
            if (feat === 16 || feat === 17 || feat === 18) {
                return { type: 'wall', feat, dist: d, x: rx, y: ry };
            }
            if (feat === 1 || (feat >= 15 && feat <= 22) || feat === 30) {
                break;
            }
        }
        return null;
    }

    executeSmartAction(action) {
        if (action === 'descend') {
            if (this.audio) this.audio.playStairs();
            this.network.sendKey('>');
        } else if (action === 'ascend') {
            if (this.audio) this.audio.playStairs();
            this.network.sendKey('<');
        } else if (action === 'door') {
            if (this.audio) this.audio.playDoor();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey('o');
            setTimeout(() => {
                this.network.sendKey(fwdKey);
            }, 80);
        } else if (action === 'tunnel') {
            if (this.audio && typeof this.audio.playWallBump === 'function') {
                this.audio.playWallBump(0.9);
            }
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey('T');
            setTimeout(() => {
                this.network.sendKey(fwdKey);
            }, 80);
        } else if (action === 'pickup') {
            if (this.audio) this.audio.playItemPickup();
            this.network.sendKey('g');
        } else if (action === 'shoot') {
            if (this.audio) this.audio.playWhoosh();
            this.network.sendKey('f');
        } else if (action === 'attack') {
            this.dungeon.triggerAttackAnimation();
            if (this.audio) this.audio.playWhoosh();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey(fwdKey);
        } else {
            // Wait / Rest 1 Turn
            const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? (RealmKeys.realmKey('hold', realm) || ',')
                : ',';
            this.network.sendKey(holdKey);
        }
    }

    triggerContextCenterAction() {
        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : (this.app ? this.app.lastFrame : null);
        if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
            this.network.sendKey('space');
            return;
        }
        if (this.smartAction) {
            this.executeSmartAction(this.smartAction);
            return;
        }
        if (this.dungeon && typeof this.dungeon.triggerAttackAnimation === 'function') {
            this.dungeon.triggerAttackAnimation();
        }
        if (this.audio && typeof this.audio.playWhoosh === 'function') {
            this.audio.playWhoosh();
        }
        this.network.sendKey('enter');
    }

    getRelativeWorldDelta(dir) {
        const wk = this.getRelativeDirectionKey(dir);
        if (!wk) return { dx: 0, dy: 0 };
        switch (wk) {
            case 'up': return { dx: 0, dy: -1 };
            case 'pageup': return { dx: 1, dy: -1 };
            case 'right': return { dx: 1, dy: 0 };
            case 'pagedown': return { dx: 1, dy: 1 };
            case 'down': return { dx: 0, dy: 1 };
            case 'end': return { dx: -1, dy: 1 };
            case 'left': return { dx: -1, dy: 0 };
            case 'home': return { dx: -1, dy: -1 };
            default: return { dx: 0, dy: 0 };
        }
    }

    updateStreetViewRosette(frame) {
        if (!frame || !frame.player || !frame.map) return;
        const px = frame.player.x;
        const py = frame.player.y;
        if (px === undefined || py === undefined) return;

        const outdoors = Boolean((frame.player && frame.player.depth === 0) || frame.is_wild_mode);
        const monsters = Array.isArray(frame.monsters) ? frame.monsters : [];

        for (const dir of [8, 9, 6, 3, 2, 1, 4, 7]) {
            const btn = document.getElementById('sv-dir-' + dir);
            if (!btn) continue;
            const { dx, dy } = this.getRelativeWorldDelta(dir);
            const tx = px + dx;
            const ty = py + dy;
            const info = this._isTileWalkableForNav(frame.map, tx, ty, true, outdoors);
            const hasMonster = monsters.some(m => m && m.visible !== false && m.x === tx && m.y === ty);

            btn.classList.toggle('is-blocked', !info.walkable);
            btn.classList.toggle('is-interactive', Boolean(info.isClosedDoor || info.isStore || hasMonster));
            btn.classList.toggle('is-passable', Boolean(info.walkable));
        }
    }

    updateContextualControls(frame) {
        if (this.isAutoNavigating && this.isAutoNavigating() && frame && frame.seq !== this._lastAutoNavSeq) {
            this._lastAutoNavSeq = frame.seq;
            this.stepMinimapAutoNav(frame, false);
        }
        if (!frame || !frame.player || !frame.map) return;
        const player = frame.player;
        const px = player.x;
        const py = player.y;
        if (px === undefined || py === undefined) return;

        this.updateStreetViewRosette(frame);

        // Elements
        const dpadCenter = document.getElementById('dpad-center');
        const btnHero = document.getElementById('btn-hero-action');
        const heroIcon = document.getElementById('hero-action-icon');
        const heroText = document.getElementById('hero-action-text');
        const heroKey = document.getElementById('hero-action-key');

        const reticle = document.getElementById('diegetic-reticle');
        const targetCard = document.getElementById('reticle-target-card');
        const targetName = document.getElementById('target-card-name');
        const targetTier = document.getElementById('target-card-tier');
        const targetHpFill = document.getElementById('target-card-hp-fill');
        const targetAffinities = document.getElementById('target-card-affinities');
        const actionCue = document.getElementById('context-action-cue');
        const actionCueIcon = document.getElementById('action-cue-icon');
        const actionCueKey = document.getElementById('action-cue-key');
        const actionCueText = document.getElementById('action-cue-text');
        const rosette = document.getElementById('directional-aim-rosette');

        // Check 1: Standing on stairs
        const currentFeat = this.getFeatAt(frame.map, px, py);
        const depth = player.depth !== undefined ? player.depth : 0;

        // Check 2: Standing on items
        const items = frame.items || frame.objects || [];
        const itemOnTile = items.find(it => it.x === px && it.y === py);

        // Check 3: Camera facing yaw and 8-way directional sector
        const yaw = -(this.dungeon && typeof this.dungeon.yaw === 'number' ? this.dungeon.yaw : 0);
        const normYaw = (yaw % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const forwardOffsets = [
            { dx: 0, dy: -1 }, // 0: N
            { dx: 1, dy: -1 }, // 1: NE
            { dx: 1, dy: 0 },  // 2: E
            { dx: 1, dy: 1 },  // 3: SE
            { dx: 0, dy: 1 },  // 4: S
            { dx: -1, dy: 1 }, // 5: SW
            { dx: -1, dy: 0 }, // 6: W
            { dx: -1, dy: -1 } // 7: NW
        ];
        const fwd = forwardOffsets[sector] || { dx: 0, dy: -1 };

        // Raycast ahead along camera facing beam
        const rayTarget = this.raycastTargetAhead(frame, px, py, fwd);

        // Determine context action & target card state
        let action = 'wait';
        let icon = '⏳';
        let text = 'Wait';
        let key = '5';
        let title = 'Wait / Rest 1 Turn [5]';
        let cueText = '';
        let showCard = false;
        let cName = '';
        let cTier = '';
        let cTierCls = '';
        let cHpPct = 100;
        let cAffinityHtml = '';
        let isTargeted = false;

        if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist === 1) {
            // Adjacent monster (melee attack)
            const m = rayTarget.data;
            action = 'attack';
            icon = '⚔';
            text = 'Attack';
            key = 'Space';
            title = `Attack ${m.name || 'Monster'} in Front [Space]`;
            cueText = `Attack ${m.name || 'Monster'}`;
            isTargeted = true;
            showCard = true;
            cName = `${m.name || 'Monster'} ('${m.glyph || m.c || 'm'}')`;
            cTier = m.unique ? 'Unique' : 'Monster';
            cTierCls = m.unique ? 'badge-unique' : 'badge-monster';
            cHpPct = m.pct !== undefined ? m.pct : (m.hp_max ? Math.round((m.hp / m.hp_max) * 100) : 100);
            const asleepBadge = m.asleep ? '<span class="target-affinity-chip">💤 Asleep</span>' : '';
            const afraidBadge = m.afraid ? '<span class="target-affinity-chip">😱 Afraid</span>' : '';
            cAffinityHtml = `<span class="target-affinity-chip">⚔ Melee Range</span>${asleepBadge}${afraidBadge}`;
        } else if (currentFeat === 6) {
            // Stairs Down
            action = 'descend';
            icon = '⬇';
            text = 'Descend';
            key = '>';
            title = depth === 0 ? 'Enter Dungeon [>]' : `Descend to ${(depth + 1) * 50}ft [>]`;
            cueText = depth === 0 ? 'Enter Dungeon [>]' : `Descend to ${(depth + 1) * 50}ft [>]`;
            showCard = false;
            cName = depth === 0 ? 'Dungeon Entrance (50\')' : `Staircase Down (${(depth + 1) * 50}ft)`;
            cTier = 'Portal';
            cTierCls = 'badge-portal';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">⬇ Descend [>]</span>';
        } else if (currentFeat === 5) {
            // Stairs Up
            action = 'ascend';
            icon = '⬆';
            text = 'Ascend';
            key = '<';
            title = depth === 1 ? 'Ascend to Town [<]' : `Ascend to ${(depth - 1) * 50}ft [<]`;
            cueText = depth === 1 ? 'Ascend to Town [<]' : `Ascend to ${(depth - 1) * 50}ft [<]`;
            showCard = false;
            cName = depth === 1 ? 'Staircase Up to Town' : `Staircase Up (${(depth - 1) * 50}ft)`;
            cTier = 'Portal';
            cTierCls = 'badge-portal';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">⬆ Ascend [<]</span>';
        } else if (itemOnTile) {
            // Item on floor
            action = 'pickup';
            icon = '🎒';
            text = 'Get';
            key = 'g';
            title = `Pick Up ${itemOnTile.name || 'Item'} [g]`;
            cueText = `Pick Up ${itemOnTile.name || 'Item'}`;
            showCard = false;
            cName = itemOnTile.name || 'Item on Floor';
            cTier = 'Loot';
            cTierCls = 'badge-item';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">🎒 Pickup [g]</span>';
        } else if (rayTarget && rayTarget.type === 'door' && rayTarget.dist === 1) {
            // Door in front
            action = 'door';
            icon = '🚪';
            text = 'Open';
            key = 'o';
            title = 'Open Door in Front [o]';
            cueText = 'Open Closed Door';
            showCard = false;
            cName = 'Closed Door';
            cTier = 'Door';
            cTierCls = 'badge-door';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">🚪 Open [o]</span>';
        } else if (rayTarget && rayTarget.type === 'wall' && rayTarget.dist === 1 && (rayTarget.feat === 16 || rayTarget.feat === 17 || rayTarget.feat === 18)) {
            // Tunnelable wall / mineral vein / rubble
            action = 'tunnel';
            icon = '⛏️';
            text = 'Tunnel';
            key = 'Shift+T';
            title = 'Tunnel / Dig Wall in Front [T]';
            const wallName = rayTarget.feat === 16 ? 'Rubble Pile' : (rayTarget.feat === 17 || rayTarget.feat === 19 ? 'Magma Vein' : (rayTarget.feat === 18 || rayTarget.feat === 20 ? 'Quartz Vein' : 'Granite Wall'));
            cueText = `Tunnel ${wallName}`;
            showCard = false;
            cName = wallName;
            cTier = 'Wall';
            cTierCls = 'badge-wall';
            cHpPct = 100;
            cAffinityHtml = '<span class="target-affinity-chip">⛏️ Tunnel [T]</span>';
        } else if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist > 1 && this.canPlayerShootRanged(frame)) {
            // Ranged monster in line of sight
            const m = rayTarget.data;
            action = 'shoot';
            icon = '🏹';
            text = 'Shoot';
            key = 'f';
            title = `Shoot at ${m.name || 'Target'} [f]`;
            cueText = `Shoot ${m.name || 'Target'} (${rayTarget.dist}sq away)`;
            isTargeted = true;
            showCard = true;
            cName = `${m.name || 'Target'} ('${m.glyph || m.c || 'm'}')`;
            cTier = m.unique ? 'Unique' : 'Monster';
            cTierCls = m.unique ? 'badge-unique' : 'badge-monster';
            cHpPct = m.pct !== undefined ? m.pct : (m.hp_max ? Math.round((m.hp / m.hp_max) * 100) : 100);
            cAffinityHtml = `<span class="target-affinity-chip">🏹 ${rayTarget.dist}sq away</span>`;
        }

        const lang = window.__langMode || 'en';
        const isHeng = (frame.realm === 'hengband') || (window.__app && typeof window.__app.getActiveRealm === 'function' && window.__app.getActiveRealm() === 'hengband');
        if (isHeng) {
            const rawMName = (rayTarget && rayTarget.data && rayTarget.data.name) ? rayTarget.data.name : '';
            const rawItemName = (itemOnTile && itemOnTile.name) ? itemOnTile.name : '';
            const mName = rawMName ? (typeof window.getLocalizedMonsterName === 'function' ? window.getLocalizedMonsterName(rawMName, 'hengband', lang) : rawMName) : '';
            const itemName = rawItemName ? (typeof window.getLocalizedItemName === 'function' ? window.getLocalizedItemName(rawItemName, 'hengband', lang) : rawItemName) : '';

            if (rawMName) {
                const glyph = (rayTarget.data && (rayTarget.data.glyph || rayTarget.data.c)) || 'm';
                cName = `${mName || rawMName} ('${glyph}')`;
            } else if (rawItemName) {
                cName = itemName || rawItemName;
            }

            if (lang === 'jp') {
                if (action === 'attack') {
                    text = '攻撃';
                    cueText = mName ? `攻撃: ${mName}` : '近接攻撃';
                    title = mName ? `前方の${mName}を攻撃 [Space]` : '攻撃 [Space]';
                } else if (action === 'descend') {
                    text = '降りる';
                    cueText = depth === 0 ? 'ダンジョンに入る [>]' : '地下へ降りる [>]';
                    title = cueText;
                } else if (action === 'ascend') {
                    text = '登る';
                    cueText = depth === 1 ? '地上へ戻る [<]' : '上層へ登る [<]';
                    title = cueText;
                } else if (action === 'pickup') {
                    text = '拾う';
                    cueText = itemName ? `拾う: ${itemName}` : '拾う';
                    title = cueText + ' [g]';
                } else if (action === 'door') {
                    text = '開閉';
                    cueText = '扉を開ける';
                    title = '扉を開ける [o]';
                } else if (action === 'tunnel') {
                    text = '掘削';
                    cueText = '壁を掘る';
                    title = '壁を掘る [T]';
                } else if (action === 'shoot') {
                    text = '射撃';
                    cueText = mName ? `射撃: ${mName}` : '遠距離射撃';
                    title = cueText + ' [f]';
                } else if (action === 'wait') {
                    text = '待機';
                    cueText = '待機';
                    title = '待機 [5]';
                }
            } else if (lang === 'bilingual') {
                if (action === 'attack') {
                    text = 'Attack (攻撃)';
                    cueText = mName ? `Attack (攻撃): ${mName}` : 'Attack (攻撃)';
                    title = 'Attack (攻撃) [Space]';
                } else if (action === 'descend') {
                    text = 'Descend (降りる)';
                    cueText = depth === 0 ? 'Enter Dungeon (入山) [>]' : 'Descend (降りる) [>]';
                    title = cueText;
                } else if (action === 'ascend') {
                    text = 'Ascend (登る)';
                    cueText = depth === 1 ? 'Ascend to Town (帰還) [<]' : 'Ascend (登る) [<]';
                    title = cueText;
                } else if (action === 'pickup') {
                    text = 'Get (拾う)';
                    cueText = itemName ? `Get (拾う): ${itemName}` : 'Get (拾う)';
                    title = cueText + ' [g]';
                } else if (action === 'door') {
                    text = 'Open (開閉)';
                    cueText = 'Open Door (扉を開ける)';
                    title = 'Open Door (開閉) [o]';
                } else if (action === 'tunnel') {
                    text = 'Tunnel (掘削)';
                    cueText = 'Tunnel (壁を掘る)';
                    title = 'Tunnel (掘削) [T]';
                } else if (action === 'shoot') {
                    text = 'Shoot (射撃)';
                    cueText = mName ? `Shoot (射撃): ${mName}` : 'Shoot (射撃)';
                    title = cueText + ' [f]';
                } else if (action === 'wait') {
                    text = 'Wait (待機)';
                    cueText = 'Wait (待機)';
                    title = 'Wait (待機) [5]';
                }
            } else {
                if (action === 'attack') {
                    text = 'Attack';
                    cueText = mName ? `Attack ${mName}` : 'Attack Monster';
                    title = mName ? `Attack ${mName} in Front [Space]` : 'Attack Monster in Front [Space]';
                } else if (action === 'pickup') {
                    text = 'Get';
                    cueText = itemName ? `Pick Up ${itemName}` : 'Pick Up Item';
                    title = itemName ? `Pick Up ${itemName} [g]` : 'Pick Up Item [g]';
                } else if (action === 'shoot') {
                    text = 'Shoot';
                    cueText = mName ? `Shoot ${mName} (${rayTarget.dist}sq away)` : `Shoot Target (${rayTarget.dist}sq away)`;
                    title = mName ? `Shoot at ${mName} [f]` : 'Shoot at Target [f]';
                }
            }
        }

        this.smartAction = action;

        // Update D-Pad Center Button
        if (dpadCenter) {
            dpadCenter.textContent = icon;
            dpadCenter.title = title;
            dpadCenter.classList.toggle('smart-active', action !== 'wait');
            dpadCenter.classList.toggle('smart-stairs', action === 'descend' || action === 'ascend');
            dpadCenter.classList.toggle('smart-door', action === 'door');
            dpadCenter.classList.toggle('smart-attack', action === 'attack');
        }

        // Update Hero Context Action Button (#btn-hero-action)
        if (btnHero) {
            if (heroIcon) heroIcon.textContent = icon;
            if (heroText) heroText.textContent = text;
            if (heroKey) heroKey.textContent = key;
            btnHero.title = title;
            btnHero.setAttribute('data-action', action);
            btnHero.classList.toggle('action-suggested', action !== 'wait');
        }

        const btnAttack = document.getElementById('btn-attack');
        if (btnHero && btnHero.style.display !== 'none' && action === 'attack') {
            if (btnAttack) btnAttack.style.display = 'none';
        } else {
            if (btnAttack) btnAttack.style.display = '';
        }
        if (typeof this.updateContextButtons === 'function') {
            this.updateContextButtons(frame);
        }

        // Update In-Play & Terminal Overlay Status
        const inPlay = Boolean(frame && (frame.phase === 'play' || (frame.player && frame.player.name)));
        const inTerminalOverlay = Boolean(frame && frame.ui && (frame.ui.overlay || 0) > 0) ||
                                 Boolean(window.__app && window.__app.needsTerminal && window.__app.needsTerminal(frame)) ||
                                 this.inTerminal;
        const isDead = Boolean(player.dead || (player.hp !== undefined && player.hp <= 0 && player.hp_max > 0));

        // Update HUD Status Bar Alert (#footer-target) - Perfectly docked outside 3D line of sight
        const footerTarget = document.getElementById('footer-target');
        if (footerTarget) {
            const isMonsterTarget = Boolean(rayTarget && rayTarget.type === 'monster');
            if (action !== 'wait' && inPlay && !inTerminalOverlay && !isDead && !isMonsterTarget) {
                footerTarget.style.display = 'inline-flex';
                const label = (rayTarget && rayTarget.label) || cueText || text;
                footerTarget.innerHTML = `<span class="target-alert-icon">${escapeHtml(icon)}</span> <span class="target-alert-text">${escapeHtml(label)}</span>`;
            } else {
                footerTarget.style.display = 'none';
            }
        }

        // Update Diegetic Reticle & Target Card

        if (reticle) {
            if (inPlay && !inTerminalOverlay && !isDead) {
                reticle.style.display = 'flex';
                reticle.classList.toggle('reticle-targeted', isTargeted);
                reticle.classList.toggle('reticle-interactive', !isTargeted && action !== 'wait');
            } else {
                reticle.style.display = 'none';
            }
        }

        // Context Action Cue & Top-Center Target Plaque: Keep strictly hidden from 3D viewport
        // Action bar highlights, hero button, and footer status bar provide 100% of contextual cues
        if (actionCue) {
            actionCue.classList.add('hidden');
            actionCue.style.display = 'none';
        }
        if (targetCard) {
            targetCard.classList.add('hidden');
            targetCard.style.display = 'none';
        }

        // Update Directional Aim Rosette (Visibility & Active Yaw Highlight)
        if (rosette) {
            const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
                ? window.ScreenContext.screenTextOf(frame)
                : (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n').toLowerCase() : '');
            const isTargetingPrompt = (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function')
                ? window.ScreenContext.inputTargetingPrompt(screenText, inPlay)
                : false;

            if (isTargetingPrompt && inPlay && !inTerminalOverlay && !isDead) {
                rosette.classList.remove('hidden');
            } else {
                rosette.classList.add('hidden');
            }

            // Highlight sector corresponding to current camera yaw
            const sectorToDir = [8, 9, 6, 3, 2, 1, 4, 7];
            const activeDir = sectorToDir[sector] || 8;
            const sectors = rosette.querySelectorAll('.rosette-sector');
            sectors.forEach(sec => {
                const sDir = parseInt(sec.dataset.dir, 10);
                sec.classList.toggle('active-yaw', sDir === activeDir);
            });
        }
    }

    setupViewportGestures() {
        const canvas = document.getElementById('viewport-canvas');
        if (!canvas) return;

        canvas.style.touchAction = 'none';

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startTime = 0;
        let lastX = 0;
        let lastY = 0;
        let activePointerId = null;

        const onStart = (clientX, clientY, pointerId = null) => {
            isDragging = true;
            startX = clientX;
            startY = clientY;
            startTime = performance.now();
            lastX = clientX;
            lastY = clientY;
            activePointerId = pointerId;
        };

        const onMove = (clientX, clientY) => {
            if (!isDragging) return;
            const dx = clientX - lastX;
            const dy = clientY - lastY;
            lastX = clientX;
            lastY = clientY;

            if (Math.hypot(clientX - startX, clientY - startY) > 8) {
                if (window.chronicleManager && typeof window.chronicleManager.dismissEntityPopover === 'function') {
                    window.chronicleManager.dismissEntityPopover();
                }
            }

            if (this.dungeon && typeof this.dungeon.rotateFreelook === 'function') {
                // Smooth 360-degree rotation horizontally (always normal) and clamped vertical pitch (Y-axis invert toggle)
                const deltaYaw = -1 * dx * 0.0055;
                const multY = this.invertDragLook ? -1 : 1;
                const deltaPitch = multY * dy * 0.0035;
                this.dungeon.rotateFreelook(deltaYaw, deltaPitch);
            }
        };

        const onEnd = (endX = null, endY = null) => {
            if (!isDragging) return;
            isDragging = false;
            activePointerId = null;

            const finalX = endX !== null ? endX : lastX;
            const finalY = endY !== null ? endY : lastY;
            const elapsed = performance.now() - startTime;
            const totalDx = finalX - startX;
            const totalDy = finalY - startY;

            // Fast horizontal swipe completed within 450ms (always normal turn direction)
            if (elapsed < 450 && Math.abs(totalDx) > 40 && Math.abs(totalDx) > Math.abs(totalDy) * 1.5) {
                if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
                    window.chronicleManager.preemptForGameplay('swipe_turn');
                }
                if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) {
                    window.DeviceProfile.triggerHaptic('light');
                }
                if (this.dungeon && typeof this.dungeon.turn === 'function') {
                    const turnDir = (totalDx > 0 ? 1 : -1);
                    this.dungeon.turn(turnDir);
                }
            } else if (elapsed < 380 && Math.abs(totalDx) < 18 && Math.abs(totalDy) < 18) {
                // Single Click / Tap in 3D:
                // 1) If clicking a creature or floor item, open non-modal entity inspection popover without moving.
                // 2) Otherwise, raycast against 3D floor/door tiles and auto-navigate there if reachable.
                if (this.dungeon) {
                    const monster = (typeof this.dungeon.getMonsterAtScreenCoords === 'function')
                        ? this.dungeon.getMonsterAtScreenCoords(finalX, finalY)
                        : null;
                    if (monster) {
                        if (window.chronicleManager && typeof window.chronicleManager.interactWithCreature === 'function') {
                            window.chronicleManager.interactWithCreature(monster, { mode: 'popover', clientX: finalX, clientY: finalY });
                        }
                        return;
                    }
                    const item = (typeof this.dungeon.getItemAtScreenCoords === 'function')
                        ? this.dungeon.getItemAtScreenCoords(finalX, finalY)
                        : null;
                    if (item) {
                        if (window.chronicleManager && typeof window.chronicleManager.inspectObject === 'function') {
                            window.chronicleManager.inspectObject(item, { mode: 'popover', clientX: finalX, clientY: finalY });
                        }
                        return;
                    }
                    if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
                        window.chronicleManager.preemptForGameplay('canvas_click');
                    }
                    if (typeof this.dungeon.getTileAtScreenCoords === 'function' && !this.inTerminal) {
                        const hitTile = this.dungeon.getTileAtScreenCoords(finalX, finalY);
                        if (hitTile) {
                            const frame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || this.dungeon.lastFrame;
                            if (frame) {
                                const mons = Array.isArray(frame.monsters) ? frame.monsters : [];
                                const monOnTile = mons.find((m) => m && m.visible !== false && m.x === hitTile.x && m.y === hitTile.y);
                                if (monOnTile) {
                                    if (window.chronicleManager && typeof window.chronicleManager.interactWithCreature === 'function') {
                                        window.chronicleManager.interactWithCreature(monOnTile, { mode: 'popover', clientX: finalX, clientY: finalY });
                                    }
                                    return;
                                }
                                const its = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);
                                const itemOnTile = its.find((it) => it && it.x === hitTile.x && it.y === hitTile.y);
                                if (itemOnTile) {
                                    if (window.chronicleManager && typeof window.chronicleManager.inspectObject === 'function') {
                                        window.chronicleManager.inspectObject(itemOnTile, { mode: 'popover', clientX: finalX, clientY: finalY });
                                    }
                                    return;
                                }
                                this.startMinimapAutoNav(hitTile.x, hitTile.y, frame);
                            }
                        }
                    }
                }
            }
        };

        canvas.addEventListener('pointerdown', (e) => {
            if (e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
            if (e.target && e.target.closest && e.target.closest('#quick-slot-bar, #quick-slot-popover, #minimap-canvas, #grimoire-deck-container, #streetview-nav-rosette')) return;
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            onStart(e.clientX, e.clientY, e.pointerId);
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!isDragging) {
                if (!this.inTerminal && this.dungeon && typeof this.dungeon.setHoverScreenCoords === 'function') {
                    this.dungeon.setHoverScreenCoords(e.clientX, e.clientY, this);
                }
            }
            if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
            onMove(e.clientX, e.clientY);
        });

        canvas.addEventListener('pointerleave', () => {
            if (!this.inTerminal && this.dungeon && typeof this.dungeon.setHoverScreenCoords === 'function') {
                this.dungeon.setHoverScreenCoords(-1, -1, this);
            }
        });

        const finishPointer = (e) => {
            if (activePointerId !== null && e.pointerId === activePointerId) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
                onEnd(e.clientX, e.clientY);
            }
        };
        canvas.addEventListener('pointerup', finishPointer);
        canvas.addEventListener('pointercancel', finishPointer);

        // Touch event fallback
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && !isDragging) {
                onStart(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                onMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        canvas.addEventListener('touchend', (e) => {
            const finalTouch = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
            onEnd(finalTouch ? finalTouch.clientX : null, finalTouch ? finalTouch.clientY : null);
        }, { passive: true });
        canvas.addEventListener('touchcancel', () => { onEnd(); }, { passive: true });
    }

    toggleFullscreen() {
        const doc = document;
        const elem = doc.documentElement;
        const isFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
        try {
            if (!isFs) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen().then(() => {
                        if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
                            navigator.keyboard.lock(['Escape']).catch(() => {});
                        }
                    }).catch(() => {});
                } else if (elem.webkitRequestFullscreen) {
                    try {
                        const p = elem.webkitRequestFullscreen();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    } catch (_) {}
                } else if (elem.mozRequestFullScreen) {
                    elem.mozRequestFullScreen();
                } else if (elem.msRequestFullscreen) {
                    elem.msRequestFullscreen();
                }
            } else {
                if (doc.exitFullscreen) {
                    if (typeof navigator !== 'undefined' && navigator.keyboard && typeof navigator.keyboard.unlock === 'function') {
                        try { navigator.keyboard.unlock(); } catch (_) {}
                    }
                    doc.exitFullscreen().catch(() => {});
                } else if (doc.webkitExitFullscreen) {
                    try {
                        const p = doc.webkitExitFullscreen();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    } catch (_) {}
                } else if (doc.mozCancelFullScreen) {
                    doc.mozCancelFullScreen();
                } else if (doc.msExitFullscreen) {
                    doc.msExitFullscreen();
                }
            }
        } catch (err) {
            console.warn('[Input] Fullscreen toggle error:', err);
        }
    }

    /**
     * Triggers Quick-Action Slot `slotIdx` (0..3).
     */
    triggerQuickSlot(slotIdx) {
        if (!window.QuickActionManager) return false;
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
        const frame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
        if (this.audio && typeof this.audio.playMenuSelect === 'function') {
            this.audio.playMenuSelect();
        }
        const toastFn = (msg) => {
            const hud = (this.app && this.app.hud) || (window.__app && window.__app.hud);
            if (hud && typeof hud.showToast === 'function') hud.showToast(msg);
            else if (window.__app && typeof window.__app.showRealmToast === 'function') window.__app.showRealmToast(msg);
        };
        return window.QuickActionManager.executeSlot(slotIdx, frame, realm, (k) => {
            if (this.network && typeof this.network.sendKey === 'function') {
                this.network.sendKey(k);
            }
        }, toastFn);
    }

    /* =========================================================================
     * Minimap Click-to-Auto-Navigate (8-Way Octile A* with Rest-Like Interrupts)
     * ========================================================================= */
    isAutoNavigating() {
        return Boolean(this._autoNav && this._autoNav.active);
    }

    getWorldDirectionKey(dx, dy) {
        if (dx === 0 && dy === -1) return 'up';
        if (dx === 1 && dy === -1) return 'pageup';
        if (dx === 1 && dy === 0) return 'right';
        if (dx === 1 && dy === 1) return 'pagedown';
        if (dx === 0 && dy === 1) return 'down';
        if (dx === -1 && dy === 1) return 'end';
        if (dx === -1 && dy === 0) return 'left';
        if (dx === -1 && dy === -1) return 'home';
        return null;
    }

    _isTileWalkableForNav(map, x, y, allowUnexplored = false, outdoors = false) {
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

        // Solid walls (15..23), Sil-Q chasm (41), variant lava/deep water/mountains (29..30), or variant wall (25 when not '.'/',')
        if (ch === '#' || ch === '%' || ch === '*' || feat === 0 || (feat >= 15 && feat <= 23) || (feat === 25 && ch !== '.' && ch !== ',' && ch !== '\'') || feat === 29 || feat === 30 || feat === 41) {
            return { walkable: false, cost: Infinity, isClosedDoor: false, isTrap: false, isStore: false };
        }
        // Known trap: high traversal penalty so A* routes around traps whenever possible
        if (ch === '^') {
            return { walkable: true, cost: 12.0, isClosedDoor: false, isTrap: true, isStore: false };
        }
        // Town store/building portal (feat 7..14 or 32..40): walkable when targeted, but higher cost so A* routes around shop doors
        if ((feat >= 7 && feat <= 14) || (feat >= 32 && feat <= 40)) {
            return { walkable: true, cost: 8.0, isClosedDoor: false, isTrap: false, isStore: true };
        }
        // Closed door (feat === 2 in all 4 C engines, or '+' glyph)
        if (ch === '+' || feat === 2) {
            return { walkable: true, cost: 1.4, isClosedDoor: true, isTrap: false, isStore: false };
        }
        return { walkable: true, cost: 1.0, isClosedDoor: false, isTrap: false, isStore: false };
    }

    /**
     * Computes an 8-way Octile A* path from (startX, startY) to (goalX, goalY) over explored map tiles.
     * Routes around visible creatures/townspeople and known traps.
     * Supports both (frame, startX, startY, goalX, goalY) and (startX, startY, goalX, goalY, frame).
     * Returns an array of `{ x, y, isClosedDoor, isTrap }` steps (excluding start tile), or `[]` if unreachable.
     */
    computeMinimapPath(arg1, arg2, arg3, arg4, arg5) {
        let frame, startX, startY, goalX, goalY;
        if (arg1 && typeof arg1 === 'object' && arg1.map) {
            frame = arg1; startX = arg2; startY = arg3; goalX = arg4; goalY = arg5;
        } else if (arg5 && typeof arg5 === 'object' && arg5.map) {
            startX = arg1; startY = arg2; goalX = arg3; goalY = arg4; frame = arg5;
        } else {
            frame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
            startX = arg1; startY = arg2; goalX = arg3; goalY = arg4;
        }
        if (!frame || !frame.map || !Array.isArray(frame.map.rows)) return [];
        const map = frame.map;
        const outdoors = Boolean((frame.player && frame.player.depth === 0) || frame.is_wild_mode);
        const sx = Math.round(Number(startX));
        const sy = Math.round(Number(startY));
        let gx = Math.round(Number(goalX));
        let gy = Math.round(Number(goalY));
        if (sx === gx && sy === gy) return [];

        const w = map.w || (map.rows[0] && map.rows[0].g ? map.rows[0].g.length : 80);
        const keyOf = (x, y) => y * w + x;

        // Visible creatures/townspeople occupy tiles and must be routed around (never walked into during auto-nav)
        const occupiedByCreature = new Set();
        if (Array.isArray(frame.monsters)) {
            for (const m of frame.monsters) {
                if (m && m.visible !== false && typeof m.x === 'number' && typeof m.y === 'number') {
                    if (!(m.x === sx && m.y === sy)) {
                        occupiedByCreature.add(keyOf(m.x, m.y));
                    }
                }
            }
        }

        // Do not auto-navigate directly onto a creature tile
        if (occupiedByCreature.has(keyOf(gx, gy))) return [];

        let goalCheck = this._isTileWalkableForNav(map, gx, gy, false, outdoors);
        if (!goalCheck.walkable) {
            // If user clicked a wall/unexplored tile right next to an explored floor tile, snap to closest walkable neighbor
            const adj = [
                { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
                { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }
            ];
            let bestNeighbor = null;
            let bestDist = Infinity;
            for (const d of adj) {
                const nx = gx + d.dx;
                const ny = gy + d.dy;
                if (occupiedByCreature.has(keyOf(nx, ny))) continue;
                const nc = this._isTileWalkableForNav(map, nx, ny, false, outdoors);
                if (nc.walkable && !nc.isTrap && !nc.isStore) {
                    const dist = Math.hypot(nx - sx, ny - sy);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestNeighbor = { x: nx, y: ny, check: nc };
                    }
                }
            }
            if (!bestNeighbor) return [];
            gx = bestNeighbor.x;
            gy = bestNeighbor.y;
            if (sx === gx && sy === gy) return [];
        }

        const octile = (x1, y1, x2, y2) => {
            const dx = Math.abs(x1 - x2);
            const dy = Math.abs(y1 - y2);
            return (dx + dy) + (1.41421356 - 2) * Math.min(dx, dy);
        };

        const open = [{ x: sx, y: sy, g: 0, f: octile(sx, sy, gx, gy) }];
        const gScore = new Map();
        const cameFrom = new Map();
        const stepMeta = new Map();
        gScore.set(keyOf(sx, sy), 0);
        const closed = new Set();

        const dirs = [
            { dx: 0, dy: -1, w: 1.0 },
            { dx: 1, dy: 0, w: 1.0 },
            { dx: 0, dy: 1, w: 1.0 },
            { dx: -1, dy: 0, w: 1.0 },
            { dx: 1, dy: -1, w: 1.4142 },
            { dx: 1, dy: 1, w: 1.4142 },
            { dx: -1, dy: 1, w: 1.4142 },
            { dx: -1, dy: -1, w: 1.4142 }
        ];

        let iterations = 0;
        const maxIterations = 4500;

        while (open.length > 0 && iterations++ < maxIterations) {
            // Pop lowest f-score
            let bestIdx = 0;
            for (let i = 1; i < open.length; i++) {
                if (open[i].f < open[bestIdx].f) bestIdx = i;
            }
            const cur = open.splice(bestIdx, 1)[0];
            const curKey = keyOf(cur.x, cur.y);

            if (cur.x === gx && cur.y === gy) {
                const path = [];
                let k = curKey;
                while (cameFrom.has(k)) {
                    const meta = stepMeta.get(k);
                    path.push(meta);
                    k = cameFrom.get(k);
                }
                path.reverse();
                return path;
            }

            if (closed.has(curKey)) continue;
            closed.add(curKey);

            for (const d of dirs) {
                const nx = cur.x + d.dx;
                const ny = cur.y + d.dy;
                const nKey = keyOf(nx, ny);
                if (closed.has(nKey)) continue;
                if (occupiedByCreature.has(nKey)) continue;

                const tileInfo = this._isTileWalkableForNav(map, nx, ny, false, outdoors);
                if (!tileInfo.walkable) continue;
                // Do not step onto a known trap unless the user explicitly clicked the trap tile
                if (tileInfo.isTrap && !(nx === gx && ny === gy)) continue;
                // Do not enter a store/building portal unless it is the destination tile
                if (tileInfo.isStore && !(nx === gx && ny === gy)) continue;

                const tentativeG = cur.g + d.w * tileInfo.cost;
                const prevG = gScore.get(nKey);
                if (prevG === undefined || tentativeG < prevG) {
                    gScore.set(nKey, tentativeG);
                    cameFrom.set(nKey, curKey);
                    stepMeta.set(nKey, {
                        x: nx,
                        y: ny,
                        isClosedDoor: tileInfo.isClosedDoor,
                        isTrap: tileInfo.isTrap
                    });
                    open.push({
                        x: nx,
                        y: ny,
                        g: tentativeG,
                        f: tentativeG + octile(nx, ny, gx, gy)
                    });
                }
            }
        }
        return [];
    }

    _statusSignatureOf(player) {
        if (!player) return '';
        const st = Array.isArray(player.statuses)
            ? player.statuses.map((s) => `${s.name || ''}:${s.val || 0}`).sort().join('|')
            : '';
        return `${st}::${player.blind ? 1 : 0}:${player.confused ? 1 : 0}:${player.poisoned ? 1 : 0}:${player.afraid ? 1 : 0}:${player.cut ? 1 : 0}:${player.stun ? 1 : 0}`;
    }

    _itemSignatureOf(frame) {
        const items = (frame && Array.isArray(frame.items)) ? frame.items : ((frame && Array.isArray(frame.objects)) ? frame.objects : []);
        return items.map((it) => `${it.x},${it.y}:${it.name || it.glyph || ''}`).sort().join('|');
    }

    get _minimapNavPath() {
        return (this._autoNav && this._autoNav.active && Array.isArray(this._autoNav.path)) ? this._autoNav.path : null;
    }

    canEngageStreetViewNav(frame = null) {
        const effFrame = frame || (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
        if (this.dungeon && this.dungeon.canEngageStreetViewNav !== this._boundDungeonCanEngage) {
            this._boundDungeonCanEngage = (f) => this.canEngageStreetViewNav(f);
            this.dungeon.canEngageStreetViewNav = this._boundDungeonCanEngage;
        }
        if (!effFrame || !effFrame.player || !effFrame.map) return false;
        if (effFrame.phase !== 'play') return false;
        if ((effFrame.ui?.overlay || 0) > 0) return false;
        if (!effFrame.ui?.awaiting_command && !effFrame.ui?.more) return false;

        const player = effFrame.player;
        const statuses = Array.isArray(player.statuses) ? player.statuses : [];
        const isDisabling = statuses.some(s => {
            const name = typeof s === 'string' ? s : (s && s.name ? s.name : '');
            return /blind|confus|paralyz|stun|afraid|hallucinat|盲目|混乱|麻痺|朦朧|恐怖|幻覚/i.test(name);
        });
        if (isDisabling) return false;

        const px = player.x;
        const py = player.y;
        if (px === undefined || py === undefined) return false;

        const monsters = Array.isArray(effFrame.monsters) ? effFrame.monsters : [];
        const r = (this.realm || (effFrame && effFrame.realm) || 'angband').toLowerCase();
        const depth = player.depth || 0;

        for (const m of monsters) {
            if (!m || m.visible === false || m.ml === false || m.friendly || m.pet || m.peaceful) continue;
            if (depth === 0 && r !== 'silq') {
                const isDamaged = (typeof m.hp === 'number' && typeof m.hp_max === 'number' && m.hp < m.hp_max);
                const hasHostileFlag = Boolean(m.hostile || m.is_hostile || (m.status && /hostile|anger|alert/i.test(m.status)));
                if (!isDamaged && !hasHostileFlag) continue;
            }
            const d = Math.max(Math.abs(m.x - px), Math.abs(m.y - py));
            if (d <= 2) return false;
        }

        return true;
    }

    startMinimapAutoNav(goalX, goalY, frameOverride = null) {
        const winApp = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
        const frame = frameOverride || (this.app && this.app.lastFrame) || (winApp && winApp.lastFrame) || null;
        if (!frame || !frame.player || !frame.map) return false;

        const px = frame.player.x;
        const py = frame.player.y;
        const rxGoal = Math.round(Number(goalX));
        const ryGoal = Math.round(Number(goalY));

        // If already auto-navigating: clicking the current tile or current goal cancels; clicking a new goal re-routes
        if (this.isAutoNavigating()) {
            const curGoalX = this._autoNav.goalX;
            const curGoalY = this._autoNav.goalY;
            if ((rxGoal === px && ryGoal === py) || (rxGoal === curGoalX && ryGoal === curGoalY)) {
                this.stopMinimapAutoNav('Cancelled');
                return false;
            }
            this.stopMinimapAutoNav('');
        }

        const path = this.computeMinimapPath(frame, px, py, rxGoal, ryGoal);
        const hud = (this.app && this.app.hud) || (winApp && winApp.hud);

        if (!path || path.length === 0) {
            if (Math.abs(rxGoal - px) <= 1 && Math.abs(ryGoal - py) <= 1 && (rxGoal !== px || ryGoal !== py)) {
                const wk = this.getWorldDirectionKey(rxGoal - px, ryGoal - py);
                if (wk) {
                    this.sendMovementKey(wk);
                    return true;
                }
            }
            if (this.audio && typeof this.audio.playWallBump === 'function') {
                this.audio.playWallBump(0.45);
            }
            if (hud && typeof hud.showToast === 'function') {
                hud.showToast(`No clear explored route to (${rxGoal}, ${ryGoal})`);
            }
            return false;
        }

        const visibleMonsters = Array.isArray(frame.monsters) ? frame.monsters.filter((m) => m && m.visible !== false) : [];
        const baselineMonsterKeys = new Set(visibleMonsters.map((m) => `${m.name || ''}|${m.glyph || ''}`));
        const hadAdjacentMonsterAtStart = visibleMonsters.some((m) => Math.max(Math.abs(m.x - px), Math.abs(m.y - py)) <= 1);

        this._autoNav = {
            active: true,
            goalX: path[path.length - 1].x,
            goalY: path[path.length - 1].y,
            path: path.slice(),
            lastHp: Number(frame.player.hp ?? 0),
            startStatusesSig: this._statusSignatureOf(frame.player),
            baselineItemSig: this._itemSignatureOf(frame),
            baselineMonsterCount: visibleMonsters.length,
            baselineMonsterKeys,
            hadAdjacentMonsterAtStart,
            startDepth: frame.player.depth,
            lastPlayerX: px,
            lastPlayerY: py,
            expectedX: null,
            expectedY: null,
            openingDoorAt: null,
            stepTimer: null
        };

        if (hud && typeof hud.updateMinimap === 'function') {
            hud._lastMinimapSig = '';
            hud.updateMinimap(frame);
        }
        const term = this.terminal || (this.app && this.app.terminal) || (winApp && winApp.terminal);
        if (term && typeof term.render === 'function' && frame && frame.term) {
            term.render(frame.term);
        }

        this.stepMinimapAutoNav(frame, true);
        return true;
    }

    stopMinimapAutoNav(reason = '') {
        if (!this._autoNav || !this._autoNav.active) return;
        if (this._autoNav.stepTimer) {
            clearTimeout(this._autoNav.stepTimer);
        }
        this._autoNav.active = false;
        this._autoNav.path = [];
        this._autoNav = null;

        const winApp = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
        const hud = (this.app && this.app.hud) || (winApp && winApp.hud);
        const frame = (this.app && this.app.lastFrame) || (winApp && winApp.lastFrame) || null;
        if (hud && frame && typeof hud.updateMinimap === 'function') {
            hud._lastMinimapSig = '';
            hud.updateMinimap(frame);
        }
        const term = this.terminal || (this.app && this.app.terminal) || (winApp && winApp.terminal);
        if (term && typeof term.render === 'function' && frame && frame.term) {
            term.render(frame.term);
        }
        if (reason && reason !== 'Reached destination' && reason !== 'Cancelled' && hud && typeof hud.showToast === 'function') {
            hud.showToast(`Auto-travel stopped: ${reason}`);
        }
    }

    stepMinimapAutoNav(frame, isInitial = false) {
        if (!this._autoNav || !this._autoNav.active || !frame || !frame.player) return;
        const nav = this._autoNav;
        const player = frame.player;
        const px = player.x;
        const py = player.y;

        // 1. Prompt / Overlay / Phase Interrupt
        const ui = frame.ui || {};
        if (frame.phase !== 'play' || (ui.overlay || 0) > 0 || ui.awaiting_command === false) {
            this.stopMinimapAutoNav('Prompt requires attention');
            return;
        }
        if (ui.more) {
            if (isInitial && this.network && typeof this.network.sendKey === 'function') {
                this.network.sendKey('space');
                if (nav.stepTimer) clearTimeout(nav.stepTimer);
                nav.stepTimer = setTimeout(() => {
                    const winApp = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
                    const latest = (this.app && this.app.lastFrame) || (winApp && winApp.lastFrame) || frame;
                    this.stepMinimapAutoNav(latest, true);
                }, 48);
                return;
            }
            this.stopMinimapAutoNav('Prompt requires attention');
            return;
        }

        // 2. Depth Change Interrupt
        if (player.depth !== nav.startDepth) {
            this.stopMinimapAutoNav('Entered new level');
            return;
        }

        // 3. HP Loss or Status Change Interrupt (Rest-like interrupt)
        const curHp = Number(player.hp ?? 0);
        if (curHp < nav.lastHp) {
            this.stopMinimapAutoNav('Took damage!');
            return;
        }
        nav.lastHp = curHp;

        const curStatusSig = this._statusSignatureOf(player);
        if (curStatusSig !== nav.startStatusesSig) {
            this.stopMinimapAutoNav('Status condition changed!');
            return;
        }

        // 4. Creature Spotted / Approached Interrupt (on dungeon levels depth > 0, or if a creature steps adjacent)
        const visibleMonsters = Array.isArray(frame.monsters) ? frame.monsters.filter((m) => m && m.visible !== false) : [];
        if (!isInitial && visibleMonsters.length > 0) {
            const isDungeon = (player.depth || 0) > 0;
            const newlySpotted = visibleMonsters.find((m) => !nav.baselineMonsterKeys || !nav.baselineMonsterKeys.has(`${m.name || ''}|${m.glyph || ''}`));
            const countIncreased = visibleMonsters.length > (nav.baselineMonsterCount || 0);
            const adjacentMon = visibleMonsters.find((m) => Math.max(Math.abs(m.x - px), Math.abs(m.y - py)) <= 1);
            if (isDungeon && (newlySpotted || countIncreased || (adjacentMon && !nav.hadAdjacentMonsterAtStart))) {
                const targetMon = newlySpotted || adjacentMon || visibleMonsters[0];
                this.stopMinimapAutoNav(`Spotted ${targetMon.name || 'a creature'}!`);
                return;
            }
        }

        // 5. New Item Discovered or Stepped On Interrupt
        const items = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);
        const curItemSig = this._itemSignatureOf(frame);
        const steppedOnItem = !isInitial && items.some((it) => it && it.x === px && it.y === py);
        if (steppedOnItem || (!isInitial && curItemSig !== nav.baselineItemSig && items.length > 0)) {
            this.stopMinimapAutoNav('Discovered an item!');
            return;
        }

        // 6. Destination Reached
        if (px === nav.goalX && py === nav.goalY) {
            this.stopMinimapAutoNav('Reached destination');
            return;
        }

        const outdoors = Boolean((player.depth === 0) || frame.is_wild_mode);

        // 7. Verify previous step progress
        if (!isInitial) {
            if (nav.openingDoorAt) {
                const doorTile = this._isTileWalkableForNav(frame.map, nav.openingDoorAt.x, nav.openingDoorAt.y, false, outdoors);
                nav.openingDoorAt = null;
                if (doorTile.isClosedDoor) {
                    // Door remained closed (locked or jammed)
                    this.stopMinimapAutoNav('Door is locked or blocked');
                    return;
                }
            } else if (nav.expectedX !== null && nav.expectedY !== null) {
                if (px === nav.expectedX && py === nav.expectedY) {
                    nav.path.shift();
                } else {
                    this.stopMinimapAutoNav('Path blocked');
                    return;
                }
            }
        }

        if (nav.path.length === 0) {
            this.stopMinimapAutoNav('Reached destination');
            return;
        }

        // If a creature or townsperson moved onto nextStep, try to dynamically route around them
        let nextStep = nav.path[0];
        if (visibleMonsters.some((m) => m.x === nextStep.x && m.y === nextStep.y)) {
            const detour = this.computeMinimapPath(frame, px, py, nav.goalX, nav.goalY);
            if (!detour || detour.length === 0) {
                this.stopMinimapAutoNav('Path blocked');
                return;
            }
            nav.path = detour;
            nextStep = nav.path[0];
        }

        const dx = nextStep.x - px;
        const dy = nextStep.y - py;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
            this.stopMinimapAutoNav('Route diverged');
            return;
        }

        const worldKey = this.getWorldDirectionKey(dx, dy);
        if (!worldKey) {
            this.stopMinimapAutoNav('Invalid step direction');
            return;
        }

        if (nav.stepTimer) clearTimeout(nav.stepTimer);
        const dispatchStep = () => {
            if (!this._autoNav || !this._autoNav.active) return;
            const liveTile = this._isTileWalkableForNav(frame.map, nextStep.x, nextStep.y, false, outdoors);
            if (liveTile.isClosedDoor) {
                nav.openingDoorAt = { x: nextStep.x, y: nextStep.y };
                nav.expectedX = px;
                nav.expectedY = py;
            } else {
                nav.expectedX = nextStep.x;
                nav.expectedY = nextStep.y;
            }
            if (typeof this.sendMovementKey === 'function') {
                this.sendMovementKey(worldKey);
            } else if (this.network) {
                this.network.sendKey(worldKey);
            }
        };

        if (isInitial) {
            dispatchStep();
        } else {
            nav.stepTimer = setTimeout(dispatchStep, 42);
        }
    }
}

if (typeof window !== 'undefined') {
    window.InputController = InputController;
    window.InputManager = InputController;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InputController, InputManager: InputController };
}

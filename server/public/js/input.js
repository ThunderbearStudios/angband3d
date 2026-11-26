/**
 * Angband3D Input Controller — Keyboard, Mouse, and Touch Navigation
 * Provides 1:1 parity with the Godot C# desktop client.
 */

class InputController {
    constructor(network, dungeon, terminal, audio, toggleTerminalView) {
        this._fallbackNetwork = network;
        Object.defineProperty(this, 'network', {
            configurable: true,
            enumerable: true,
            get() {
                return (typeof window !== 'undefined' && window.__app && window.__app.network)
                    ? window.__app.network
                    : this._fallbackNetwork;
            },
            set(v) {
                this._fallbackNetwork = v;
            }
        });
        this.attachDungeon(dungeon);
        if (audio && (audio.hud || audio.lastFrame || audio.getActiveRealm)) {
            this.app = audio;
            this.audio = audio.audio || null;
            this.toggleTerminalView = toggleTerminalView || (this.app ? () => this.app.toggleTerminalView() : null);
        } else {
            this.audio = audio;
            this.toggleTerminalView = toggleTerminalView;
            this.app = (typeof window !== 'undefined' && window.__app) ? window.__app : null;
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
        this.viKeyMode = (function() { try { return localStorage.getItem('angband3d_vi_keys'); } catch (_) { return null; } })();
        this.autoPickupOnClick = (function() { try { return localStorage.getItem('angband3d_click_auto_pickup') !== 'false'; } catch (_) { return true; } })();
        this._wasdLiteralNext = false;
        this._lastRealm = null;
        this._lastCharName = null;
        this._lastCtxControlsSig = null;
        this._pendingMoreMove = null;
        this._pendingFollowUp = null;
        this._pendingFollowUpKey = null;
        this._pendingMoreAction = null;

        this.setupKeyboardEvents();
        this.setupActionButtons();
        this.setupTouchEvents();
        this.setupViewportGestures();
        this.setupInvertControls();
        this.updateRunToggleUI();
    }

    init() {
        const hash = window.location.hash;
        if (hash.includes('screen=character') || hash.includes('screen=splash')) {
            this.inTerminal = true;
        }
        this.attachDungeon(this.dungeon);
        this.setupTouchControls();
        this.syncWasdUiState();
    }

    attachDungeon(dungeon) {
        this.dungeon = dungeon;
        if (!this.dungeon) return;
        if (typeof this.dungeon.turnLeft !== 'function') {
            this.dungeon.turnLeft = () => this.dungeon.turn(-1);
        }
        if (typeof this.dungeon.turnRight !== 'function') {
            this.dungeon.turnRight = () => this.dungeon.turn(1);
        }
        if (typeof this.dungeon.getRelativeDirection !== 'function') {
            this.dungeon.getRelativeDirection = (fwd, strafe) => (fwd > 0 ? 8 : (fwd < 0 ? 2 : (strafe < 0 ? 4 : 6)));
        }
        if (typeof this.dungeon.turn === 'function' && !this.dungeon._inputTurnWrapped) {
            const origTurn = this.dungeon.turn.bind(this.dungeon);
            this.dungeon.turn = (dir) => {
                const res = origTurn(dir);
                this.onCameraTurn();
                return res;
            };
            this.dungeon._inputTurnWrapped = true;
        }
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
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('wasd-mode-active', active);
        }
        const btn = document.getElementById('btn-wasd-toggle');
        if (btn) {
            btn.classList.toggle('wasd-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.textContent = active ? '⌨ WASD: ON' : '⌨ WASD';
            btn.title = active
                ? 'WASD Movement Active (Alt+W to toggle off). W/S: Move, A/D: Turn, Shift+A/D: Strafe. W/A/S/D commands available on HUD & Actions menu.'
                : 'WASD Movement Inactive (Alt+W to toggle on). Classic Roguelike Keys active: W=Wield, A=Aim, S=Search, D=Drop.';
        }
        const cluster = document.getElementById('wasd-shadow-cluster');
        if (cluster) {
            cluster.style.display = active ? 'flex' : 'none';
        }
        const badges = document.querySelectorAll('.wasd-hint-badge');
        badges.forEach(b => {
            b.style.display = active ? 'inline-block' : 'none';
        });
        for (const id of ['btn-wield', 'btn-aim', 'btn-cast', 'btn-search', 'btn-drop']) {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('wasd-shadow-active', active);
        }
        if (typeof window !== 'undefined' && typeof window.__updateActionBarOverflow === 'function') {
            window.__updateActionBarOverflow();
        }
    }

    sendMoveOrRun(dir, isRunning) {
        if (isRunning) {
            this.sendRunMove(dir);
        } else {
            const moveKey = this.getRelativeDirectionKey(dir);
            if (moveKey) this.sendMovementKey(moveKey);
        }
    }

    clearDirectionHint() {
        const hint = document.getElementById('streetview-dir-hint');
        if (hint) hint.textContent = '';
    }

    syncCompass() {
        if (this.dungeon && typeof this.dungeon.syncCompass === 'function') {
            this.dungeon.syncCompass();
        }
    }

    onCameraTurn() {
        this.syncCompass();
        const frame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame);
        if (frame) {
            this.updateContextualControls(frame);
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
        } else if (actionName === 'aim') {
            const devVerb = this._adaptiveDeviceVerb || (realm === 'silq' ? 'use_staff' : 'aim');
            if (typeof ActionCatalog !== 'undefined' && typeof ActionCatalog.keyFor === 'function') {
                keyToSend = ActionCatalog.keyFor(devVerb, realm);
            }
            if (!keyToSend) {
                keyToSend = (typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla)
                    ? RealmKeys.fromVanilla('a', realm)
                    : (realm === 'silq' ? 'a' : 'a');
            }
            if (this.audio && typeof this.audio.playMenuOpen === 'function') {
                this.audio.playMenuOpen();
            }
        } else if (actionName === 'search') {
            keyToSend = ((typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                ? RealmKeys.realmKey('search', realm)
                : null) || (realm === 'silq' ? 'S' : (realm === 'angband' ? 'I' : 'S'));
        }
        if (keyToSend) {
            const lastFrame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
            const dispatcher = (this.app && this.app.dispatcher) || (window.__app && window.__app.dispatcher);
            if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                if (window.MenuRouter.route(keyToSend, lastFrame, realm)) {
                    if (this.app && typeof this.app.updateTerminalToolbar === 'function' && lastFrame) {
                        this.app.updateTerminalToolbar(lastFrame);
                    }
                    return;
                }
            }
            if (dispatcher && typeof dispatcher.run === 'function' && lastFrame && lastFrame.ui && !lastFrame.ui.awaiting_command) {
                dispatcher.run({ verb: actionName === 'aim' ? (this._adaptiveDeviceVerb || 'aim') : actionName, key: keyToSend });
                return;
            }
            this.network.sendKey(keyToSend);
        }
    }

    resolveSmartAction(frame, facing) {
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : (frame?.realm || 'angband'));
        const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
            ? (RealmKeys.realmKey('hold', realm) || ',')
            : ',';

        if (!frame || !frame.player || !frame.map) {
            return { id: 'wait', icon: '⏳', text: 'Wait', key: holdKey, title: `Wait / Rest 1 Turn [${holdKey}]` };
        }

        const player = frame.player;
        const px = player.x;
        const py = player.y;
        if (px === undefined || py === undefined) {
            return { id: 'wait', icon: '⏳', text: 'Wait', key: holdKey, title: `Wait / Rest 1 Turn [${holdKey}]` };
        }

        let fwd;
        if (typeof facing === 'number' && facing >= 0 && facing <= 7) {
            const forwardOffsets = [
                { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
                { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
            ];
            fwd = forwardOffsets[facing] || { dx: 0, dy: -1 };
        } else {
            fwd = this.getFacingForward().fwd;
        }

        const depth = player.depth !== undefined ? player.depth : 0;
        const currentFeat = this.getFeatAt(frame.map, px, py);
        const curDef = (this.dungeon && this.dungeon.featureDefs) ? this.dungeon.featureDefs[currentFeat] : null;
        const items = frame.items || frame.objects || [];
        const itemOnTile = items.find(it => it && it.x === px && it.y === py);

        const rayTarget = this.raycastTargetAhead(frame, px, py, fwd);

        // 1. Melee attack hostile in front
        if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist === 1) {
            const m = rayTarget.data;
            return {
                id: 'attack',
                icon: '⚔',
                text: 'Attack',
                key: 'Space',
                title: `Attack ${m.name || 'Monster'} in Front [Space]`,
                target: m
            };
        }

        // 1b. Chained Captive Ally in front (Brogue / Dungeon Rescue)
        const captiveAhead = Array.isArray(frame.monsters) ? frame.monsters.find(m => m && m.captive && m.x === px + fwd.dx && m.y === py + fwd.dy) : null;
        if (captiveAhead) {
            return { id: 'free-ally', icon: '⛓️', text: 'Free Ally', key: 'Space', title: `Shatter Chains & Free ${captiveAhead.name || 'Captive Ally'} [Space]` };
        }

        // 1c. Sil-Q Forge, Altar, or Magic Fountain underfoot
        const curGlyph = (frame.map.rows && frame.map.rows[py] && frame.map.rows[py].g) ? frame.map.rows[py].g[px] : '';
        const isForgeUnderfoot = realm === 'silq' && (curGlyph === '0' || (curDef && /forge/i.test(curDef.name || '')));
        if (isForgeUnderfoot) {
            return { id: 'smithing', icon: '⚒', text: 'Forge', key: '0', title: 'Use Enchanted Forge (Smithing) [0]' };
        }
        if (currentFeat === 43 || curGlyph === '_' || (curDef && /altar/i.test(curDef.name || ''))) {
            return { id: 'pray', icon: '⛩️', text: 'Pray', key: 'p', title: `Pray at Sacred Altar [p]` };
        }
        if (currentFeat === 44 || curGlyph === '{' || (curDef && /fountain/i.test(curDef.name || ''))) {
            return { id: 'fountain', icon: '⛲', text: 'Quaff', key: 'q', title: 'Drink from Magic Fountain [q]' };
        }

        // 2. Stairs down underfoot
        const isStairDown = currentFeat === 6 || (curDef && (curDef.isStairDown || /down/i.test(curDef.name || '')));
        if (isStairDown) {
            const descKey = (typeof ActionCatalog !== 'undefined' && ActionCatalog.getKey ? ActionCatalog.getKey('descend', realm) : null) || '>';
            return {
                id: 'descend',
                icon: '⬇',
                text: 'Descend',
                key: descKey,
                title: depth === 0 ? `Enter Dungeon [${descKey}]` : `Descend to ${(depth + 1) * 50}ft [${descKey}]`
            };
        }

        // 3. Stairs up underfoot
        const isStairUp = currentFeat === 5 || (curDef && (curDef.isStairUp || /up/i.test(curDef.name || '')));
        const noTownRealm = realm === 'nethack' || realm === 'dcss' || realm === 'brogue' || realm === 'rogue' || realm === 'silq';
        const canWinExit = Boolean(player.hasAmulet || player.victory || (Number(player.runes || 0) >= 3));
        if (isStairUp && !(depth <= 1 && noTownRealm && !canWinExit)) {
            const ascKey = (typeof ActionCatalog !== 'undefined' && ActionCatalog.getKey ? ActionCatalog.getKey('ascend', realm) : null) || '<';
            return {
                id: 'ascend',
                icon: '⬆',
                text: 'Ascend',
                key: ascKey,
                title: depth === 1 ? (noTownRealm ? `Exit Dungeon [${ascKey}]` : `Ascend to Town [${ascKey}]`) : `Ascend to ${(depth - 1) * 50}ft [${ascKey}]`
            };
        }

        // 4. Item underfoot
        if (itemOnTile) {
            const pickupKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey ? RealmKeys.realmKey('pickup', realm) : null) ||
                (typeof ActionCatalog !== 'undefined' && ActionCatalog.getKey ? ActionCatalog.getKey('pickup', realm) : null) || 'g';
            return {
                id: 'pickup',
                icon: '🎒',
                text: 'Get',
                key: pickupKey,
                title: `Pick Up ${itemOnTile.name || 'Item'} [${pickupKey}]`,
                item: itemOnTile
            };
        }

        // 5. Door in front
        if (rayTarget && rayTarget.type === 'door' && rayTarget.dist === 1) {
            const openKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey ? RealmKeys.realmKey('open', realm) : null) ||
                (typeof ActionCatalog !== 'undefined' && ActionCatalog.getKey ? ActionCatalog.getKey('open', realm) : null) || 'o';
            return {
                id: 'door',
                icon: '🚪',
                text: 'Open',
                key: openKey,
                title: `Open Door in Front [${openKey}]`
            };
        }

        // 5b. Known trap in front
        if (rayTarget && rayTarget.type === 'trap' && rayTarget.dist === 1) {
            return {
                id: 'disarm',
                icon: '🖐',
                text: 'Disarm',
                key: 'D',
                title: 'Disarm Trap in Front [D]'
            };
        }

        // 6. Tunnelable wall / mineral vein / rubble in front
        if (rayTarget && rayTarget.type === 'wall' && rayTarget.dist === 1) {
            const tunnelKey = (typeof ActionCatalog !== 'undefined' && ActionCatalog.getKey ? ActionCatalog.getKey('tunnel', realm) : null) ||
                (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey ? RealmKeys.realmKey('tunnel', realm) : null) || 'Shift+T';
            return {
                id: 'tunnel',
                icon: '⛏️',
                text: 'Tunnel',
                key: tunnelKey,
                title: `Tunnel / Dig Wall in Front [${tunnelKey}]`
            };
        }

        // 7. Ranged monster in line of sight
        if (rayTarget && rayTarget.type === 'monster' && rayTarget.dist > 1 && this.canPlayerShootRanged(frame)) {
            const m = rayTarget.data;
            const fireKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey ? RealmKeys.realmKey('fire', realm) : null) ||
                (typeof ActionCatalog !== 'undefined' && ActionCatalog.getKey ? ActionCatalog.getKey('fire', realm) : null) || 'f';
            return {
                id: 'shoot',
                icon: '🏹',
                text: 'Shoot',
                key: fireKey,
                title: `Shoot at ${m.name || 'Target'} [${fireKey}]`,
                target: m
            };
        }

        // 8. Default: hold / wait 1 turn
        return {
            id: 'wait',
            icon: '⏳',
            text: 'Wait',
            key: holdKey,
            title: `Wait / Rest 1 Turn [${holdKey}]`
        };
    }

    resolveHeroAction(frame) {
        return this.resolveSmartAction(frame);
    }

    updateContextButtons(frame) {
        if (!frame || !frame.player) return;
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband');
        this.evaluateActionBarContext(frame, realm);
    }

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

    evaluateActionBarContext(frame, realm = 'angband') {
        if (!frame || !frame.player) return;
        const r = String(realm || 'angband').toLowerCase();
        const lang = (typeof window !== 'undefined' && window.__langMode) ? window.__langMode : 'en';
        const isJp = r === 'hengband' && lang === 'jp';
        const player = frame.player;

        const heroAction = this.resolveHeroAction ? this.resolveHeroAction(frame) : null;
        const btnHero = document.getElementById('btn-hero-action');
        const heroActive = Boolean(btnHero && btnHero.style.display !== 'none' && heroAction && heroAction.id !== 'wait');

        const px = player.x;
        const py = player.y;
        const map = frame.map;
        const inv = Array.isArray(player.inventory) ? player.inventory : (Array.isArray(frame.inventory) ? frame.inventory : []);
        const eq = Array.isArray(player.equipment) ? player.equipment : (Array.isArray(frame.equipment) ? frame.equipment : []);
        const quiv = Array.isArray(player.quiver) ? player.quiver : [];
        const monsters = Array.isArray(frame.monsters) ? frame.monsters.filter((m) => m && m.visible !== false) : [];
        const items = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);

        let potionCount = 0;
        let scrollCount = 0;
        let foodCount = 0;
        let tomeCount = 0;
        let matchingTomeCount = 0;
        let wandCount = 0;
        let staffCount = 0;
        let rodCount = 0;
        let hornCount = 0;
        let activatableCount = 0;
        let deviceCount = 0;
        let rangedInPack = 0;
        let wearableInPack = 0;
        let weaponInPack = 0;

        const isVanilla = r === 'angband';
        const pClassEarly = String(player.class || '').toLowerCase();
        const isPriestClass = /priest|paladin|monk|僧侶|パラディン/.test(pClassEarly);
        const isMageClass = /mage|wizard|sorcer|rogue|ranger|necromancer|魔道士|メイジ|レンジャー|盗賊/.test(pClassEarly);

        for (const it of inv) {
            const name = String((it && (it.name || it.dname || it.label)) || '');
            const lower = name.toLowerCase();
            const tval = Number(it && it.tval) || 0;
            const vm = (it && typeof it.vm === 'number' && Number.isFinite(it.vm)) ? it.vm : 0;
            const isPotionTval = isVanilla ? (tval === 26) : (tval === 75 || tval === 71);
            const isScrollTval = isVanilla ? (tval === 25) : (tval === 70 || tval === 50);
            const isFoodTval = isVanilla ? (tval === 27 || tval === 28) : (tval === 80);
            const isTomeTval = isVanilla ? (tval >= 30 && tval <= 34) : (tval >= 90 && tval <= 115);
            const isWandTval = isVanilla ? (tval === 23) : (tval === 65);
            const isStaffTval = isVanilla ? (tval === 22) : (tval === 55);
            const isRodTval = isVanilla ? (tval === 24) : (tval === 66);
            const isAmmoTval = isVanilla ? (tval >= 2 && tval <= 4) : (tval >= 16 && tval <= 18);
            const isWeaponTval = isVanilla ? (tval >= 6 && tval <= 9) : (tval >= 20 && tval <= 23);
            const isArmorTval = isVanilla ? (tval >= 10 && tval <= 21) : (tval >= 30 && tval <= 45);

            if ((vm & (1 << 0)) !== 0 || /\b(potion|phial|draught|elixir)\b/.test(lower) || /(の薬|水薬|霊薬|丸薬|薬$)/.test(name) || isPotionTval) {
                potionCount++;
            } else if ((vm & (1 << 1)) !== 0 || /\b(scroll|parchment|card|trump)\b/.test(lower) || /(の巻物|巻物|カード)/.test(name) || isScrollTval) {
                scrollCount++;
            } else if ((vm & (1 << 2)) !== 0 || /\b(ration|food|mushroom|bread|wafer|jerky|slime mold|waybread|hardtack|meat|pie|biscuit)\b/.test(lower) || /(食料|レーション|キノコ|パン|干し肉|ビスケット)/.test(name) || isFoodTval) {
                foodCount++;
            } else if ((vm & ((1 << 15) | (1 << 16) | (1 << 17))) !== 0 || /\b(book|tome|grimoire|manual|hymnal|songbook)\b/.test(lower) || /\[[a-z0-9\s\-'&:]+\]/i.test(name) || /(魔法書|仙術書|経典|教本|『[^』]+』|\[[^\]]+の魔法書\])/.test(name) || isTomeTval) {
                tomeCount++;
                let matchesClass = true;
                if ((vm & ((1 << 15) | (1 << 16) | (1 << 17))) !== 0) {
                    matchesClass = true;
                } else if (isVanilla) {
                    if (isPriestClass && (tval === 30 || /magic|arcane|sorcery/.test(lower))) matchesClass = false;
                    if (isMageClass && (tval === 31 || /prayer|holy|piety/.test(lower))) matchesClass = false;
                }
                if (matchesClass) matchingTomeCount++;
            }

            if (r === 'silq' && ((vm & (1 << 6)) !== 0 || /\bhorn\b/.test(lower))) {
                hornCount++;
                deviceCount++;
            } else if ((vm & (1 << 3)) !== 0 || /\bwand\b/.test(lower) || /魔法棒/.test(name) || isWandTval) {
                wandCount++;
                deviceCount++;
            } else if ((vm & (1 << 4)) !== 0 || /\b(staff|stave)\b/.test(lower) || /(スタッフ|の杖)/.test(name) || isStaffTval) {
                staffCount++;
                deviceCount++;
            } else if ((vm & (1 << 5)) !== 0 || /\brod\b/.test(lower) || /ロッド/.test(name) || isRodTval) {
                rodCount++;
                deviceCount++;
            } else if ((vm & (1 << 6)) !== 0) {
                activatableCount++;
                deviceCount++;
            }

            if ((vm & (1 << 7)) !== 0 || (/\b(arrow|bolt|shot|pebble|seeker|sheaf)\b/.test(lower) && !/\b(bow|crossbow|sling)\b/.test(lower)) || /(矢|弾|丸石)/.test(name) || isAmmoTval) {
                rangedInPack++;
            }
            if ((vm & (1 << 9)) !== 0 || /\b(sword|dagger|blade|rapier|sabre|katana|spear|lance|halberd|axe|mace|flail|hammer|whip|club)\b/.test(lower) ||
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
        for (const eqIt of eq) {
            if (!eqIt) continue;
            const eqVm = (typeof eqIt.vm === 'number' && Number.isFinite(eqIt.vm)) ? eqIt.vm : 0;
            if ((eqVm & (1 << 6)) !== 0 || eqIt.activate) {
                if (r === 'silq') hornCount++;
                else activatableCount++;
                deviceCount++;
            }
        }

        const hasWeaponEquipped = Boolean(player.weapon_item) || eq.some((it) => {
            const n = String((it && it.name) || '').toLowerCase();
            return /\b(sword|dagger|blade|axe|mace|spear|hammer|katana|whip|club)\b/.test(n) || Number(it && it.slot) === 0;
        });
        const hasBowEquipped = Boolean(player.bow_item) || eq.some((it) => /\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(String((it && it.name) || '')) || /(ボウ|スリング|弓)/.test(String((it && it.name) || '')) || Number(it && it.tval) === (isVanilla ? 5 : 19));
        const hasEquipQuiver = eq.some((it) => /\b(arrow|bolt|shot|pebble|seeker|sheaf)\b/i.test(String((it && it.name) || '')) || (!isVanilla && (Number(it && it.tval) >= 16 && Number(it && it.tval) <= 18)));
        const hasAmmo = quiv.length > 0 || Boolean(player.quiver_item) || hasEquipQuiver || rangedInPack > 0;

        let adjClosedDoors = 0;
        let adjAnyDoors = 0;
        const standingOnItem = Boolean(px !== undefined && py !== undefined && items.some((it) => it && it.x === px && it.y === py));
        const currentFeat = (this.getFeatAt && map && px !== undefined) ? this.getFeatAt(map, px, py) : 0;
        const curTileGlyph = (map && map.rows && map.rows[py] && map.rows[py].g && px !== undefined) ? map.rows[py].g[px] : ' ';
        const standingFountain = Boolean(currentFeat === 44 || curTileGlyph === '{');
        const standingStair = (currentFeat === 5 || currentFeat === 6 || (currentFeat >= 7 && currentFeat <= 14) || (currentFeat >= 32 && currentFeat <= 40));
        let hasAdjAnvil = false;
        let hasAdjCage = false;
        const hasAdjNpc = Boolean(px !== undefined && py !== undefined && (frame.monsters || []).some((m) => m && (m.isPet || m.friendly) && Math.max(Math.abs(m.x - px), Math.abs(m.y - py)) <= 1));

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
                if (feat === 46) hasAdjAnvil = true;
                if (feat === 47) hasAdjCage = true;
                if (ch === '+' || feat === 2) {
                    adjClosedDoors++;
                    adjAnyDoors++;
                } else if (ch === '\'' || feat === 3 || feat === 4) {
                    adjAnyDoors++;
                }
            }
        }

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

        const pClass = String(player.class || '').toLowerCase();
        const isNonCaster = /warrior|berserker|archer|cavalry|sniper|ninja|smith|weaponsmith|戦士|狂戦士|アーチャー|騎兵|鍛冶師/.test(pClass) || (pClass.includes('samurai') && maxSp === 0);
        const isIntrinsicCaster = /mindcrafter|psion|warlock|mirror|blue[-\s]?mage|imitator|bard|monk|mystic|wild[-\s]?talent|possessor|red[-\s]?mage|samurai|force[-\s]?trainer|超能力者|青魔道師|ものまね師|吟遊詩人|修行僧|練気術師|鏡使い/.test(pClass);
        const canCastFromTome = !isNonCaster && (maxSp > 0 || matchingTomeCount > 0 || isIntrinsicCaster);
        const hasStudyStatus = statuses.some((s) => /\bstudy\b|学習/i.test(String((s && (s.name || s)) || '')));
        const effectiveStudyCount = studyCount || (Number(player.newSpells || player.new_spells || 0)) || (hasStudyStatus ? 1 : 0);
        const isHungry = Boolean(
            (typeof player.food === 'string' && /hungry|weak|faint|starv|空腹|衰弱|飢餓/i.test(player.food)) ||
            (typeof player.hunger === 'string' && /hungry|weak|faint|starv|空腹|衰弱|飢餓/i.test(player.hunger)) ||
            statuses.some((s) => /hungry|weak|faint|starv|空腹|衰弱|飢餓/i.test(String((s && (s.name || s)) || '')))
        );

        const mir = (typeof window !== 'undefined' && window.MASTER_ITEM_REGISTRY) || null;
        const devCfg = (mir && typeof mir.resolveDeviceButtonConfig === 'function')
            ? mir.resolveDeviceButtonConfig({ wandCount, rodCount, staffCount, hornCount, activatableCount }, r, isJp)
            : { verb: r === 'silq' ? 'use_staff' : 'aim', label: r === 'silq' ? 'Staff' : (isJp ? '魔法棒' : 'Wand'), key: r === 'dcss' ? 'V' : (r === 'nethack' || r === 'rogue' ? 'z' : 'a') };
        const primaryDeviceVerb = devCfg.verb;
        const primaryDeviceLabel = devCfg.label;
        const primaryDeviceKey = devCfg.key;
        this._adaptiveDeviceVerb = primaryDeviceVerb;
        const btnAimEl = document.getElementById('btn-aim');
        if (btnAimEl) {
            const aimLbl = btnAimEl.querySelector('.act-label');
            const aimKbd = btnAimEl.querySelector('kbd');
            if (aimLbl) aimLbl.textContent = primaryDeviceLabel;
            if (aimKbd) aimKbd.textContent = primaryDeviceKey;
            btnAimEl.dataset.baseTitle = `${primaryDeviceLabel} [${primaryDeviceKey}]`;
            btnAimEl.title = btnAimEl.dataset.baseTitle;
        }

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
            ? true
            : (canCastFromTome && (matchingTomeCount > 0 || isIntrinsicCaster) && !this._zeroSpellsFlag && !isFreshL1WithSlots);
        const isDisablingStatus = statuses.some(s => {
            const name = String((s && (s.name || s)) || '');
            return /blind|confus|paralyz|stun|hallucinat|盲目|混乱|麻痺|朦朧|幻覚/i.test(name);
        });

        const hasFullData = player.inventory !== undefined || frame.inventory !== undefined || player.hp_max !== undefined;
        const hasEnoughCastSp = maxSp === 0 || curSp >= Math.max(1, maxSp * 0.20);
        const stateSig = `${r}:${lang}:${this.wasdMode ? 1 : 0}:${hasFullData ? 1 : 0}:${inv.length}:${eq.length}:${potionCount}:${scrollCount}:${foodCount}:${tomeCount}:${matchingTomeCount}:${deviceCount}:${primaryDeviceVerb}:${hasBowEquipped ? 1 : 0}:${hasAmmo ? 1 : 0}:${wearableInPack}:${weaponInPack}:${hasWeaponEquipped ? 1 : 0}:${adjClosedDoors > 0 ? 1 : 0}:${adjAnyDoors > 0 ? 1 : 0}:${adjHostiles > 0 ? (adjHostiles >= 2 ? 2 : 1) : 0}:${rangedHostilesInLOS > 0 ? 1 : 0}:${hostileMonsters.length > 0 ? 1 : 0}:${standingOnItem ? 1 : 0}:${standingStair ? 1 : 0}:${standingFountain ? 1 : 0}:${Math.floor(hpPct / 10)}:${Math.floor(spPct / 15)}:${maxSp > 0 ? 1 : 0}:${curSp > 0 ? 1 : 0}:${hasEnoughCastSp ? 1 : 0}:${effectiveStudyCount}:${isHungry ? 1 : 0}:${hasBadStatus ? 1 : 0}:${hasKnownSpells ? 1 : 0}:${isDisablingStatus ? 1 : 0}:${heroActive ? heroAction.id : 'none'}`;

        if (stateSig === this._lastActionBarContextSig) return;
        this._lastActionBarContextSig = stateSig;

        const hasInvTelemetry = Array.isArray(player.inventory) || Array.isArray(frame.inventory);

        const btnStudyEl = document.getElementById('btn-study');
        if (btnStudyEl) {
            const stLbl = btnStudyEl.querySelector('.act-label');
            if (stLbl) {
                stLbl.textContent = effectiveStudyCount > 0
                    ? (isJp ? `学習(${effectiveStudyCount})` : `Study (${effectiveStudyCount})`)
                    : (isJp ? '学習' : 'Study');
            }
        }

        const btnStairEl = document.getElementById('btn-stair');
        if (btnStairEl && standingStair) {
            const isUp = currentFeat === 5 || curTileGlyph === '<';
            btnStairEl.dataset.key = isUp ? '<' : '>';
            btnStairEl.textContent = isUp ? '⬆ Ascend [<]' : '⬇ Descend [>]';
        }

        const rules = {
            'btn-attack': { show: adjHostiles > 0 && (!heroActive || heroAction.id !== 'attack'), suggest: adjHostiles > 0, reason: isJp ? '隣接する敵を攻撃！' : 'Adjacent enemy in melee range!' },
            'btn-fire': { show: (!hasInvTelemetry || (hasBowEquipped && hasAmmo)) && (!heroActive || heroAction.id !== 'shoot'), suggest: hasBowEquipped && hasAmmo && rangedHostilesInLOS > 0 && adjHostiles === 0 && !isDisablingStatus, reason: isJp ? '射程内に敵 — 射撃推奨' : 'Enemy in range — Shoot!' },
            'btn-throw': { show: !hasInvTelemetry || (inv.length > 0 && (hostileMonsters.length > 0 || r === 'silq' || r === 'brogue' || r === 'rogue' || r === 'dcss' || r === 'nethack')), suggest: (r === 'silq' || r === 'brogue' || r === 'rogue') && rangedInPack > 0 && rangedHostilesInLOS > 0 && adjHostiles === 0, reason: 'Throw weapon at ranged target' },
            'btn-cast': { show: r === 'silq' || r === 'dcss' || r === 'nethack' || (!isNonCaster && r !== 'brogue' && r !== 'rogue' && (!hasInvTelemetry || matchingTomeCount > 0 || isIntrinsicCaster)), dim: r !== 'silq' && r !== 'dcss' && r !== 'nethack' && (!hasKnownSpells || (maxSp > 0 && curSp <= 0) || isDisablingStatus), suggest: hasKnownSpells && !isDisablingStatus && (r === 'silq' || r === 'dcss' || r === 'nethack' || matchingTomeCount > 0 || isIntrinsicCaster) && (adjHostiles > 0 || rangedHostilesInLOS > 0) && (maxSp === 0 || curSp >= Math.max(1, maxSp * 0.20)), reason: isJp ? '魔力あり — 呪文詠唱' : 'Mana available — Cast spell' },
            'btn-browse': { show: r !== 'silq' && r !== 'brogue' && r !== 'rogue' && (!hasInvTelemetry || tomeCount > 0 || r === 'dcss'), suggest: false },
            'btn-study': { show: r !== 'silq' && r !== 'brogue' && r !== 'rogue' && !isNonCaster && (effectiveStudyCount > 0 || !hasInvTelemetry || matchingTomeCount > 0 || r === 'dcss'), suggest: effectiveStudyCount > 0 && (!hasInvTelemetry || matchingTomeCount > 0), reason: isJp ? `新しい呪文を学習可能 (${effectiveStudyCount}) [G]` : `Can learn ${effectiveStudyCount || 'new'} spell(s) right now!` },
            'btn-skills': { show: r === 'silq' || r === 'dcss', suggest: r === 'silq' && Number(player.new_exp !== undefined ? player.new_exp : (player.exp || 0)) >= 500 && hostileMonsters.length === 0, reason: r === 'dcss' ? 'Manage Skills & Aptitudes [m]' : 'Spend XP on Sil-Q Abilities [Tab]' },
            'btn-power': { show: r === 'frogcomposband' || r === 'hengband' || r === 'nethack' || r === 'dcss' || r === 'ryod', suggest: false, reason: r === 'nethack' ? 'Extended Command [#]' : (r === 'dcss' ? 'Invoke Divine/Evoke Ability [a]' : (r === 'ryod' ? 'Invoke Power / Stance [m]' : (isJp ? '特殊能力・レイシャル発動' : 'Invoke Racial/Class Power'))) },
            'btn-quaff': { show: !hasInvTelemetry || potionCount > 0 || standingFountain, suggest: standingFountain || (potionCount > 0 && (hpPct < 50 || hasBadStatus)), reason: standingFountain ? 'Magic Fountain underfoot — Quaff [q]!' : (isJp ? '体力低下/状態異常 — 薬を飲む！' : 'Low HP or ailment — Drink Potion!') },
            'btn-eat': { show: !hasInvTelemetry || foodCount > 0 || isHungry, suggest: (foodCount > 0 || !hasInvTelemetry) && isHungry, reason: isJp ? '空腹 — 食料を食べる [E]！' : 'Hungry — Eat Ration!' },
            'btn-read': { show: r !== 'silq' && (!hasInvTelemetry || scrollCount > 0), suggest: scrollCount > 0 && !isDisablingStatus && ((hpPct < 35 && hostileMonsters.length > 0) || adjHostiles >= 2), reason: isJp ? '危険 — 巻物で脱出・対処！' : 'Danger — Read Scroll!' },
            'btn-door': { show: adjClosedDoors > 0 && (!heroActive || heroAction.id !== 'open-door'), suggest: adjClosedDoors > 0 && adjHostiles === 0, reason: isJp ? '隣接する扉を開ける' : 'Open adjacent closed door' },
            'btn-pickup': { show: standingOnItem && (!heroActive || heroAction.id !== 'pickup'), suggest: standingOnItem, reason: isJp ? '足元のアイテムを拾う' : 'Item underfoot — Pick up!' },
            'btn-stair': { show: standingStair && (!heroActive || (heroAction.id !== 'descend' && heroAction.id !== 'ascend')), suggest: standingStair && adjHostiles === 0, reason: isJp ? '階段・入口を使用' : 'Use stairs / entrance underfoot' },
            'btn-rest': { show: !hasInvTelemetry || ((hpPct < 100 || (maxSp > 0 && spPct < 100) || hasBadStatus) && adjHostiles === 0), suggest: (hpPct < 75 || (maxSp > 0 && spPct < 45) || hasBadStatus) && hostileMonsters.length === 0, reason: isJp ? '周囲安全 — 休憩して回復' : 'Area clear — Rest to recover HP/Mana' },
            'btn-inventory': { show: !hasInvTelemetry || inv.length > 0 || eq.length > 0, suggest: false },
            'btn-equipment': { show: !hasInvTelemetry || eq.length > 0, suggest: false },
            'btn-wield': { show: !hasInvTelemetry || wearableInPack > 0, suggest: !hasWeaponEquipped && weaponInPack > 0, reason: 'Equip weapon from pack [w]' },
            'btn-drop': { show: !hasInvTelemetry || inv.length > 0, suggest: false },
            'btn-aim': { show: !hasInvTelemetry || deviceCount > 0, suggest: deviceCount > 0 && (adjHostiles > 0 || rangedHostilesInLOS > 0) && hpPct < 75, reason: `Use ${primaryDeviceLabel} [${primaryDeviceKey}]` },
            'btn-search': { show: Boolean(this.wasdMode) || r !== 'angband', suggest: false },
            'btn-quests': { show: r === 'frogcomposband' || r === 'hengband', suggest: false },
            'btn-overland': { show: (r === 'frogcomposband' || r === 'hengband') && Number(player.depth || 0) === 0, suggest: false }
        };

        for (const [id, cfg] of Object.entries(rules)) {
            const btn = document.getElementById(id);
            if (!btn) continue;
            if (cfg.show !== undefined) {
                if (btn.dataset.realmHidden !== '1') {
                    btn.style.display = cfg.show ? '' : 'none';
                    btn.dataset.contextHidden = cfg.show ? '0' : '1';
                }
            }
            if (cfg.dim !== undefined) {
                btn.classList.toggle('is-contextual-dim', Boolean(cfg.dim));
            }
            if (cfg.suggest !== undefined) {
                btn.classList.toggle('is-suggested', Boolean(cfg.suggest));
                if (cfg.suggest && cfg.reason) {
                    if (!btn.dataset.baseTitle) btn.dataset.baseTitle = btn.title || '';
                    btn.title = `${btn.dataset.baseTitle} — ⭐ ${cfg.reason}`;
                } else if (btn.dataset.baseTitle) {
                    btn.title = btn.dataset.baseTitle;
                }
            }
        }

        // Contextual tile / adjacent interaction pills (WS-6) — NO frame.seq in signature
        const curRealm = String(r || 'angband');
        const standingAltar = Boolean(currentFeat === 43 || curTileGlyph === '_');
        const standingForge = Boolean(curRealm === 'silq' && currentFeat === 60 && curTileGlyph === '0');
        const onAnvil = Boolean(curRealm === 'ryod' && (currentFeat === 46 || hasAdjAnvil));
        const nearCage = Boolean((curRealm === 'brogue' || curRealm === 'ryod') && hasAdjCage);
        const nearNpc = Boolean(curRealm === 'nethack' && hasAdjNpc);

        let ctxPrimary = null;
        let ctxAlt = null;
        if (standingAltar && (curRealm === 'nethack' || curRealm === 'dcss' || curRealm === 'ryod')) {
            ctxPrimary = curRealm === 'nethack'
                ? { icon: '🙏', label: 'Pray', key: '#pray', keyLabel: '#pray', title: 'Pray at this altar (#pray)' }
                : { icon: '🙏', label: 'Pray', key: 'p', keyLabel: 'p', title: 'Pray at this altar (p)' };
            if (curRealm === 'nethack') {
                ctxAlt = { icon: '🕯️', label: 'Offer', key: '#offer', keyLabel: '#offer', title: 'Offer a corpse or item at this altar (#offer)' };
            }
        } else if (standingFountain && (curRealm === 'nethack' || curRealm === 'dcss' || curRealm === 'ryod' || curRealm === 'brogue')) {
            ctxPrimary = { icon: '⛲', label: 'Drink', key: 'q', keyLabel: 'q', title: 'Drink from this fountain (q)' };
            if (curRealm === 'nethack') {
                ctxAlt = { icon: '🧪', label: 'Dip', key: '#dip', keyLabel: '#dip', title: 'Dip an item into this fountain (#dip)' };
            }
        } else if (standingForge) {
            ctxPrimary = { icon: '⚒️', label: 'Forge', key: '0', keyLabel: '0', title: 'Smith at the Forge (0)' };
        } else if (onAnvil) {
            ctxPrimary = { icon: '⚒️', label: 'Anvil', key: 'y', keyLabel: 'y', title: 'Use Forging Anvil (y)' };
        } else if (nearCage) {
            ctxPrimary = { icon: '🔓', label: 'Free', key: 'y', keyLabel: 'y', title: 'Free captive ally from cage (y)' };
        }

        if (nearNpc) {
            const chatSpec = { icon: '💬', label: 'Chat', key: '#chat', keyLabel: '#chat', title: 'Talk to adjacent peaceful NPC (#chat)' };
            if (!ctxPrimary) ctxPrimary = chatSpec;
            else if (!ctxAlt) ctxAlt = chatSpec;
        }

        const ctxTileSig = `${curRealm}|${ctxPrimary ? ctxPrimary.key + ':' + ctxPrimary.label : '-'}|${ctxAlt ? ctxAlt.key + ':' + ctxAlt.label : '-'}`;
        if (this._lastContextTileSig !== ctxTileSig) {
            this._lastContextTileSig = ctxTileSig;
            const applyCtxPill = (id, spec) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (!spec) {
                    el.style.display = 'none';
                    el.dataset.contextKey = '';
                    return;
                }
                el.style.display = '';
                el.dataset.contextKey = spec.key;
                el.title = spec.title;
                const iconEl = el.querySelector('.act-icon');
                const labelEl = el.querySelector('.act-label');
                const keyEl = el.querySelector('.act-key');
                if (iconEl) iconEl.textContent = spec.icon;
                if (labelEl) labelEl.textContent = spec.label;
                if (keyEl) keyEl.textContent = spec.keyLabel;
                if (!iconEl && !labelEl) el.textContent = `${spec.icon} ${spec.label} (${spec.keyLabel})`;
            };
            applyCtxPill('btn-context-tile', ctxPrimary);
            applyCtxPill('btn-context-alt', ctxAlt);
        }

        if (typeof window.__updateActionBarOverflow === 'function') {
            window.__updateActionBarOverflow();
        }
    }

    syncRealmButtons(realm) {
        const activeRealm = realm || ((this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function')
                ? window.__app.getActiveRealm()
                : 'angband'));

        this._lastRealm = activeRealm;

        const btnSearch = document.getElementById('btn-search');
        if (btnSearch) {
            btnSearch.classList.remove('hidden');
            const lbl = btnSearch.querySelector('.act-label');
            const kbd = btnSearch.querySelector('.act-key');
            if (activeRealm === 'silq') {
                if (lbl) lbl.textContent = 'Stealth';
                if (kbd) kbd.textContent = 'S';
                btnSearch.title = 'Toggle Stealth Mode [S]';
            } else if (activeRealm === 'angband') {
                if (lbl) lbl.textContent = 'Inspect';
                if (kbd) kbd.textContent = 'I';
                btnSearch.title = 'Inspect Item / Steal [I / s]';
            } else {
                const sKey = ((typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? RealmKeys.realmKey('search', activeRealm) : null) || 'S';
                if (lbl) lbl.textContent = 'Search';
                if (kbd) kbd.textContent = sKey;
                btnSearch.title = `Search Surroundings [${sKey}]`;
            }
        }
        const btnAim = document.getElementById('btn-aim');
        if (btnAim) {
            const lbl = btnAim.querySelector('.act-label');
            const kbd = btnAim.querySelector('.act-key');
            const aimKey = ((typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? (RealmKeys.realmKey('aim', activeRealm) || RealmKeys.realmKey('use_staff', activeRealm)) : null) || 'a';
            const fallbackVerb = activeRealm === 'silq' || activeRealm === 'brogue' ? 'Staff' : 'Aim';
            if (lbl) lbl.textContent = this._adaptiveDeviceVerb || fallbackVerb;
            if (kbd) kbd.textContent = aimKey;
            btnAim.title = `${fallbackVerb} [${aimKey}]`;
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
        const msg = this.invertDragLook ? 'Drag Look Invert Y: ON' : 'Drag Look Invert Y: OFF (Normal)';
        const hud = (this.app && this.app.hud) || (window.__app && window.__app.hud);
        if (hud && typeof hud.showToast === 'function') hud.showToast(msg);
        else if (window.__app && typeof window.__app.showRealmToast === 'function') window.__app.showRealmToast(msg);
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
        const active = Boolean(this.invertDragLook);
        const update = (id) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.toggle('invert-active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
                btn.textContent = active ? '↕ Invert: ON' : '↕ Invert: OFF';
                btn.title = active ? 'Invert Y Freelook is ON (Drag down looks up). Click to toggle normal.' : 'Invert Y Freelook is OFF (Normal drag look). Click to invert.';
            }
        };
        update('btn-toggle-invert');
        update('btn-pause-invert');
    }

    isRunningActive(e = null) {
        if (e && e.shiftKey) return true;
        return Boolean(this.dpadRunMode);
    }

    getRelativeWorldDirectionDigit(numpadDir) {
        const wk = this.getRelativeDirectionKey(numpadDir);
        if (!wk) return null;
        switch (wk) {
            case 'up': return 8;
            case 'pageup': return 9;
            case 'right': return 6;
            case 'pagedown': return 3;
            case 'down': return 2;
            case 'end': return 1;
            case 'left': return 4;
            case 'home': return 7;
            default: return null;
        }
    }

    sendRunMove(localDir) {
        if (this.dungeon && typeof this.dungeon.commitFreelookFacing === 'function') this.dungeon.commitFreelookFacing();
        const worldDir = this.getRelativeWorldDirectionDigit(localDir);
        if (!worldDir) return;
        const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
        const cat = (typeof ActionCatalog !== 'undefined' && ActionCatalog) || (typeof window !== 'undefined' && window.ActionCatalog) || null;
        const runPrefix = (cat && typeof cat.keyFor === 'function' && cat.keyFor('run', realm)) || (realm === 'nethack' ? 'g' : '.');
        this.network.sendCommand(`keys ${runPrefix}${worldDir}`);
    }

    handleRelativeDirection(numpadDir, isRunning = false) {
        if (this.isDirectionalTargeting()) {
            const k = numpadDir === 5 ? (((window.__app && window.__app.getActiveRealm && window.__app.getActiveRealm()) === 'silq') ? 'f' : 't') : this.getRelativeDirectionKey(numpadDir);
            if (k) this.network.sendKey(k);
            return;
        }
        this.sendMoveOrRun(numpadDir, isRunning);
    }

    toggleDpadRunMode() {
        this.dpadRunMode = !this.dpadRunMode;
        try {
            localStorage.setItem('angband3d_dpad_run', this.dpadRunMode ? '1' : '0');
        } catch (_) {}
        this.updateRunToggleUI();
        const msg = this.dpadRunMode ? '🏃 Run Mode ON (Tap D-Pad to Sprint)' : '🚶 Walk Mode ON (Normal movement)';
        const hud = (this.app && this.app.hud) || (window.__app && window.__app.hud);
        if (hud && typeof hud.showToast === 'function') hud.showToast(msg);
        else if (window.__app && typeof window.__app.showRealmToast === 'function') window.__app.showRealmToast(msg);
        return this.dpadRunMode;
    }

    updateRunToggleUI() {
        const active = Boolean(this.dpadRunMode);
        const dpadBtn = document.getElementById('dpad-run-toggle');
        if (dpadBtn) {
            dpadBtn.classList.toggle('is-running', active);
            dpadBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
            dpadBtn.textContent = active ? '🏃 RUN' : '🚶 WALK';
            dpadBtn.title = active ? 'Run Mode Active (Sprinting enabled). Tap or Alt+R for Walk.' : 'Walk Mode Active (Normal movement). Tap or Alt+R for Run.';
        }
        const actionBtn = document.getElementById('btn-run-toggle');
        if (actionBtn) {
            actionBtn.classList.toggle('is-running', active);
            actionBtn.classList.toggle('action-suggested', active);
            actionBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
            actionBtn.innerHTML = active ? '🏃 Run <kbd>Alt+R</kbd>' : '🚶 Walk <kbd>Alt+R</kbd>';
            actionBtn.title = active ? 'Run Mode: ON (Sprinting enabled). Click or Alt+R to switch to Walk.' : 'Run Mode: OFF (Normal pace). Click or Alt+R to switch to Run.';
        }
    }

    setTerminalMode(active) {
        this.inTerminal = active;
    }

    setupKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            if (this.audio && typeof this.audio.unlock === 'function') this.audio.unlock();
            const isBareBacktick = Boolean(e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey);

            // 1. Text inputs & selects -> browser default (WCAG 2.1.4)
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                if (e.key === 'Escape' || isBareBacktick) {
                    if ((e.target.id === 'command-palette-input' || e.target.id === 'cmd-search-input') && window.__app && typeof window.__app.hideCommandPalette === 'function') {
                        e.preventDefault();
                        window.__app.hideCommandPalette();
                        return;
                    }
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
                    } else {
                        return;
                    }
                } else {
                    return;
                }
            }

            if (window.ItemSheet && typeof window.ItemSheet.isOpen === 'function' && window.ItemSheet.isOpen()) {
                if (isBareBacktick) {
                    e.preventDefault();
                    if (typeof window.ItemSheet.close === 'function') window.ItemSheet.close();
                    else if (typeof window.ItemSheet.hide === 'function') window.ItemSheet.hide();
                    return;
                }
                if (typeof window.ItemSheet.handleKeyDown === 'function' && window.ItemSheet.handleKeyDown(e)) {
                    return;
                }
            }

            const appState = (window.__app && typeof window.__app.getAppState === 'function') ? window.__app.getAppState() : 'game';

            // Global Shortcuts
            if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
                e.preventDefault();
                const soundBtn = document.getElementById('btn-sound');
                if (soundBtn) soundBtn.click();
                else if (this.audio) { this.audio.toggleMute(); if (window.__syncAudioUI) window.__syncAudioUI(); }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                if (window.__app && typeof window.__app.showCommandPalette === 'function') window.__app.showCommandPalette(appState);
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
            if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
                e.preventDefault();
                this.toggleFullscreen();
                return;
            }
            // # ROOT-CAUSE: Route Alt+L to hud.resetHudLayout() outside Hengband (or with Shift in Hengband), support Tab 7 in #guide-modal, add [9] ryod to #realm-selector-modal, support 2D grid arrows in #pause-modal, and dismiss #quick-volume-popover first on Escape.
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                const curRealm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
                if (curRealm === 'hengband' && !e.shiftKey) {
                    if (window.__app && typeof window.__app.toggleLanguageMode === 'function') window.__app.toggleLanguageMode();
                } else {
                    if (typeof window !== 'undefined') window.__dpadUserVisible = false;
                    if (document.body && document.body.classList) document.body.classList.remove('force-dpad-visible');
                    if (this.hud && typeof this.hud.resetHudLayout === 'function') this.hud.resetHudLayout();
                    else if (window.__app && window.__app.hud && typeof window.__app.hud.resetHudLayout === 'function') window.__app.hud.resetHudLayout();
                }
                return;
            }
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); this.toggleDpadRunMode(); return; }
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); this.toggleAutoExplore(); return; }
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); this.toggleWasdMode(); return; }
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); const on = this.viKeyMode !== 'on' && !(this.viKeyMode === null && window.YasdPrimitives?.isViDefaultRealm?.((window.__app?.getActiveRealm?.()) || 'angband')); this.viKeyMode = on ? 'on' : 'off'; try { localStorage.setItem('angband3d_vi_keys', this.viKeyMode); } catch (_) {} window.__app?.showRealmToast?.('Vi-Keys (HJKL/YUBN): ' + (on ? 'ON' : 'OFF')); return; }
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'i' || e.key === 'I')) {
                e.preventDefault();
                if (window.__app && typeof window.__app.toggleItemSheet === 'function') window.__app.toggleItemSheet();
                else if (typeof window.toggleItemSheet === 'function') window.toggleItemSheet();
                return;
            }
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'h' || e.key === 'H')) {
                e.preventDefault(); if (this.hud && typeof this.hud.cycleImmersionMode === 'function') this.hud.cycleImmersionMode(); return;
            }
            if (e.altKey && !e.ctrlKey && !e.metaKey && ['1', '2', '3', '4'].includes(e.key) && appState === 'game') {
                e.preventDefault();
                const curRealm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
                const lf = (window.__app && typeof window.__app.getLastFrame === 'function') ? window.__app.getLastFrame() : (window.__app ? window.__app.lastFrame : null);
                if (this.quickActions && typeof this.quickActions.executeSlot === 'function') {
                    this.quickActions.executeSlot(parseInt(e.key, 10) - 1, lf, curRealm, (k) => this.network?.sendKey?.(k), window.__app?.showToast);
                }
                return;
            }
            // 2. Client modal surface open -> modal handles keys; Escape / bare backtick closes it
            const sketchModal = document.getElementById('chronicle-sketch-modal');
            if ((e.key === 'Escape' || isBareBacktick) && sketchModal && !sketchModal.classList.contains('hidden') && sketchModal.style.display !== 'none') {
                e.preventDefault(); if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                if (window.chronicleManager && typeof window.chronicleManager.closeSketchLightbox === 'function') window.chronicleManager.closeSketchLightbox();
                else sketchModal.classList.add('hidden');
                return;
            }
            const ryodModalEl = document.getElementById('ryod-forge-modal');
            const isRyodForgeOpen = Boolean(
                (ryodModalEl && !ryodModalEl.classList.contains('hidden')) ||
                (window.RyodForge && typeof window.RyodForge.isOpen === 'function' && window.RyodForge.isOpen())
            );
            if (isRyodForgeOpen) {
                if (e.key === 'Escape' || isBareBacktick) {
                    e.preventDefault();
                    if (typeof e.stopPropagation === 'function') e.stopPropagation();
                    if (window.RyodForge && typeof window.RyodForge.close === 'function') window.RyodForge.close();
                    else if (ryodModalEl) ryodModalEl.classList.add('hidden');
                }
                return;
            }
            const deathModal = document.getElementById('death-modal'), isDeadModal = Boolean(deathModal && !deathModal.classList.contains('hidden'));
            const lastFrame = (window.__app && typeof window.__app.getLastFrame === 'function') ? window.__app.getLastFrame() : (window.__app ? window.__app.lastFrame : null);
            const fRealmDeath = String((lastFrame && lastFrame.realm) || (this.app && this.app.currentRealm) || (window.__app && window.__app.currentRealm) || 'angband').toLowerCase();
            const hpDead = ['angband', 'silq', 'frogcomposband', 'hengband'].includes(fRealmDeath) ? (lastFrame && lastFrame.player && lastFrame.player.hp < 0) : (lastFrame && lastFrame.player && lastFrame.player.hp <= 0);
            const isDeadFrame = Boolean(lastFrame && lastFrame.player && (lastFrame.player.dead || (lastFrame.player.hp !== undefined && hpDead && lastFrame.player.hp_max > 0)));
            if (isDeadModal || isDeadFrame) { this._handleDeathModalKey(e, lastFrame, isDeadModal); return; }
            if (appState !== 'game' && this._handleAppStateModalKey(e, appState)) return;
            const helpModal = document.getElementById('help-modal');
            const isHelpOpen = Boolean(helpModal && !helpModal.classList.contains('hidden'));
            if ((window.__app && window.__app.isGuideOpen && window.__app.isGuideOpen()) || isHelpOpen) {
                const inField = e.target && e.target.closest && e.target.closest('input, select, textarea');
                if (inField) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        if (inField.value) { inField.value = ''; inField.dispatchEvent(new Event('input', { bubbles: true })); }
                        else inField.blur();
                    }
                    return;
                }
                if (e.key === 'Escape' || isBareBacktick || e.key === 'Enter') {
                    e.preventDefault();
                    if (this.audio) this.audio.playMenuNav();
                    if (isHelpOpen) helpModal.classList.add('hidden');
                    if (window.__app && window.__app.hideGuide) window.__app.hideGuide();
                    return;
                }
                if (e.key >= '1' && e.key <= '8') { e.preventDefault(); window.__app.switchGuideTab(parseInt(e.key, 10) - 1); return; }
                if (e.key === 'Tab' || e.key === 'ArrowRight') { e.preventDefault(); window.__app.cycleGuideTab(1); return; }
                if (e.key === 'ArrowLeft') { e.preventDefault(); window.__app.cycleGuideTab(-1); return; }
            }
            // 3. Active CommandDispatcher plan or minimap auto-nav -> cancel on manual keydown (ignore bare modifier presses)
            if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
                const dispatcher = (this.app && this.app.dispatcher) || (window.__app && window.__app.dispatcher);
                if (dispatcher && typeof dispatcher.cancel === 'function') dispatcher.cancel('user-key');
                if (window.__app && window.__app.cancelQuickBirth) window.__app.cancelQuickBirth();
                if (this.isAutoNavigating && this.isAutoNavigating()) {
                    this.stopMinimapAutoNav('Manual key press');
                    if (e.key === 'Escape' || isBareBacktick) { e.preventDefault(); return; }
                }
            }

            const lastFrameEarly = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
            const inPlayEarly = Boolean(lastFrameEarly && lastFrameEarly.phase === 'play' && (lastFrameEarly.map || (lastFrameEarly.player && lastFrameEarly.player.name)));
            const isAltT = Boolean(e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyT' || e.key === 't' || e.key === 'T'));
            const isShiftTab = Boolean(e.key === 'Tab' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey);
            if (isAltT || isShiftTab) {
                e.preventDefault(); if (this.audio) this.audio.playMenuNav();
                if (this.toggleTerminalView) this.toggleTerminalView();
                return;
            }
            if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                if (realm === 'silq' || (inPlayEarly && realm === 'dcss') || (!inPlayEarly && realm === 'frogcomposband')) {
                    e.preventDefault(); if (this.audio) this.audio.playMenuOpen(); this.network.sendKey('tab'); return;
                }
                e.preventDefault(); if (this.audio) this.audio.playMenuNav();
                if (this.toggleTerminalView) this.toggleTerminalView();
                return;
            }

            if (e.key === 'Escape' || (isBareBacktick && this._shouldBacktickCancel(lastFrameEarly, inPlayEarly))) {
                this._handleEscapeKey(e, lastFrameEarly, inPlayEarly);
                return;
            }

            // 4. In Terminal Mode
            const termContainer = document.getElementById('terminal-container');
            const isTermVisible = Boolean(termContainer && !termContainer.classList.contains('hidden'));
            if (this.inTerminal || isTermVisible) { this.handleTerminalKey(e); return; }

            // 5. In 3D World Exploration Mode
            this.handleWorldKey(e);
        });
    }

    _handleDeathModalKey(e, lastFrame, isDeadModal) {
        if (!isDeadModal && window.__app && window.__app.hud && lastFrame) {
            window.__app.hud.showDeathModal(lastFrame);
        }
        const activeTab = (window.__app && window.__app.hud) ? (window.__app.hud.activeDeathTab || 0) : 0;

        // Tab switching: Alt+1..5 or Tab always switches tabs; on non-terminal tabs (1..4), bare 1..5 and Left/Right also switch tabs.
        // On Tab 0 (Classic Tombstone & Menus), bare keys (a-z, 1-5, Space, Enter, Escape, arrows) pass directly to the C engine!
        if ((e.altKey || activeTab !== 0) && ['1', '2', '3', '4', '5'].includes(e.key)) {
            e.preventDefault();
            window.__app?.hud?.switchDeathTab(parseInt(e.key, 10) - 1);
            return;
        }
        if (e.key === 'Tab' || (activeTab !== 0 && e.key === 'ArrowRight')) {
            e.preventDefault();
            window.__app?.hud?.switchDeathTab((activeTab + 1) % 5);
            return;
        }
        if (activeTab !== 0 && e.key === 'ArrowLeft') {
            e.preventDefault();
            window.__app?.hud?.switchDeathTab((activeTab + 4) % 5);
            return;
        }
        if (activeTab === 0 && !e.altKey && !e.ctrlKey && !e.metaKey) {
            this.handleTerminalKey(e);
            return;
        }
        if (e.key === 'u' || e.key === 'U') {
            e.preventDefault();
            this.network.sendKey('u');
            return;
        }
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
        if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            if (window.__app && window.__app.startNewRandomHero) window.__app.startNewRandomHero();
            else if (window.__app && window.__app.hud && window.__app.hud.rerollCharacter) window.__app.hud.rerollCharacter();
            else {
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
        if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            if (window.__app && window.__app.returnToMainMenu) window.__app.returnToMainMenu();
            else window.location.href = '/';
            return;
        }
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
            e.preventDefault();
            const activeContent = document.querySelector('.death-tab-content.active');
            if (activeContent) {
                const delta = (e.key === 'ArrowUp' ? -40 : e.key === 'ArrowDown' ? 40 : e.key === 'PageUp' ? -200 : 200);
                activeContent.scrollTop += delta;
            }
            return;
        }
    }

    _handleAppStateModalKey(e, appState) {
        const app = window.__app;
        if (!app) return false;
        const isCancelKey = Boolean(e.key === 'Escape' || (e.key === '`' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey));

        // # ROOT-CAUSE: Dismiss #quick-volume-popover first on Escape, support [9] ryod in #realm-selector-modal, support 2D arrow navigation in #pause-modal, and support Tab [7] in #guide-modal.
        const qvPop = document.getElementById('quick-volume-popover');
        if (isCancelKey && qvPop && !qvPop.classList.contains('hidden')) {
            e.preventDefault();
            qvPop.classList.add('hidden');
            const cfgBtn = document.getElementById('btn-sound-config');
            if (cfgBtn) {
                cfgBtn.classList.remove('active');
                cfgBtn.setAttribute('aria-expanded', 'false');
            }
            return true;
        }

        if (window.RyodForge && typeof window.RyodForge.isOpen === 'function' && window.RyodForge.isOpen()) {
            if (isCancelKey) {
                e.preventDefault();
                window.RyodForge.close();
                return true;
            }
            return true;
        }

        if (appState === 'splash') {
            if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return false;
            e.preventDefault();
            app.showMainMenu?.();
            return true;
        }

        if (appState === 'mainMenu') {
            if (isCancelKey) { e.preventDefault(); app.showSplash?.(); return true; }
            if (e.key === 'ArrowUp' || e.code === 'Numpad8') { e.preventDefault(); app.navigateMenu?.(-1); return true; }
            if (e.key === 'ArrowDown' || e.code === 'Numpad2') { e.preventDefault(); app.navigateMenu?.(1); return true; }
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                app.cycleRealm?.(1);
                const sel = document.getElementById('main-menu-realm-select');
                if (sel) sel.focus();
                return true;
            }
            if (e.key === 'k' || e.key === 'K') { e.preventDefault(); app.showCommandPalette?.('mainMenu'); return true; }
            if (['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); const idx = parseInt(e.key, 10) - 1; app.selectMenuItem?.(idx); app.activateMenuItem?.(idx); return true; }
            if (['5', '6', '7', '8'].includes(e.key)) { e.preventDefault(); app.activateMenuItem?.(parseInt(e.key, 10) - 1); return true; }
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); app.activateMenuItem?.(); return true; }
            return true;
        }

        if (appState === 'demoModal') {
            if (isCancelKey) {
                e.preventDefault();
                app.hideDemoModal?.();
                return true;
            }
            const dp = window.demoPlayer;
            if (e.key === ' ' || e.key === 'k' || e.key === 'K') { e.preventDefault(); dp?.togglePlay(); return true; }
            if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') { e.preventDefault(); dp?.seekDelta(-5); return true; }
            if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') { e.preventDefault(); dp?.seekDelta(5); return true; }
            if (e.key === 'm' || e.key === 'M') { e.preventDefault(); dp?.toggleMute(); return true; }
            if (e.key === 'c' || e.key === 'C') { e.preventDefault(); dp?.toggleCaptions(); return true; }
            if (e.key === 'f' || e.key === 'F') { e.preventDefault(); dp?.toggleFullscreen(); return true; }
            if (e.key === 'Enter') { e.preventDefault(); dp?.jumpInAndPlay(); return true; }
            if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
                e.preventDefault();
                dp?.jumpToChapter(parseInt(e.key, 10) - 1);
                return true;
            }
            return true;
        }

        if (appState === 'pwaModal') {
            if (isCancelKey || e.key === 'Enter') { e.preventDefault(); app.hidePWAModal?.(); return true; }
            return true;
        }

        if (appState === 'realmModal') {
            if (isCancelKey || e.key === 'Enter') { e.preventDefault(); app.hideRealmSelector?.(); return true; }
            const realms = ['nethack', 'dcss', 'angband', 'brogue', 'rogue', 'silq', 'frogcomposband', 'hengband', 'ryod'];
            if (e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const chosen = realms[parseInt(e.key, 10) - 1];
                if (chosen) (app.selectRealm ? app.selectRealm(chosen, false) : app.setActiveRealm?.(chosen));
                return true;
            }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); app.cycleRealm?.(1); return true; }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); app.cycleRealm?.(-1); return true; }
            return true;
        }

        if (appState === 'cmdPaletteModal') {
            if (isCancelKey) { e.preventDefault(); app.hideCommandPalette?.(); return true; }
            return true;
        }

        if (appState === 'loadMenu') {
            if (isCancelKey) { e.preventDefault(); app.hideLoadMenu?.(); return true; }
            if (e.key === 'ArrowUp' || e.code === 'Numpad8') { e.preventDefault(); app.navigateLoadList?.(-1); return true; }
            if (e.key === 'ArrowDown' || e.code === 'Numpad2') { e.preventDefault(); app.navigateLoadList?.(1); return true; }
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); app.loadSelectedSave?.(); return true; }
            if (e.key === 'Delete') { e.preventDefault(); app.deleteSelectedSave?.(); return true; }
            if (e.key === 'u' || e.key === 'U') { e.preventDefault(); app.triggerSaveUpload?.(); return true; }
            if (e.key === 'r' || e.key === 'R') { e.preventDefault(); app.showRealmSelector?.('loadMenu'); return true; }
            if (e.key === 'x' || e.key === 'X' || e.key === 'e' || e.key === 'E') { e.preventDefault(); app.downloadSelectedSave?.(); return true; }
            return true;
        }

        if (appState === 'pauseMenu') {
            if (isCancelKey) { e.preventDefault(); app.resumeGame?.(); return true; }
            const isTwoCol = typeof window !== 'undefined' && window.innerWidth >= 720;
            if (e.key === 'ArrowLeft' || e.code === 'Numpad4') { e.preventDefault(); app.navigatePauseMenu?.(-1); return true; }
            if (e.key === 'ArrowRight' || e.code === 'Numpad6') { e.preventDefault(); app.navigatePauseMenu?.(1); return true; }
            if (e.key === 'ArrowUp' || e.code === 'Numpad8') { e.preventDefault(); app.navigatePauseMenu?.(isTwoCol ? -2 : -1); return true; }
            if (e.key === 'ArrowDown' || e.code === 'Numpad2') { e.preventDefault(); app.navigatePauseMenu?.(isTwoCol ? 2 : 1); return true; }
            if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) { e.preventDefault(); app.selectPauseMenuItem?.(parseInt(e.key, 10) - 1); app.activatePauseMenuItem?.(); return true; }
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); app.activatePauseMenuItem?.(); return true; }
            return true;
        }

        if (appState === 'guide') {
            const inField = e.target && e.target.closest && e.target.closest('input, select, textarea');
            if (inField) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (inField.value) { inField.value = ''; inField.dispatchEvent(new Event('input', { bubbles: true })); }
                    else inField.blur();
                }
                return true;
            }
            if (isCancelKey || e.key === 'Enter') { e.preventDefault(); app.hideGuide?.(); return true; }
            if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(e.key)) { e.preventDefault(); app.switchGuideTab?.(parseInt(e.key, 10) - 1); return true; }
            if (e.key === 'Tab' || e.key === 'ArrowRight') { e.preventDefault(); app.cycleGuideTab?.(1); return true; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); app.cycleGuideTab?.(-1); return true; }
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(e.key)) {
                e.preventDefault();
                const gb = document.getElementById('guide-body');
                if (gb) gb.scrollTop += (e.key === 'ArrowUp' ? -40 : e.key === 'ArrowDown' ? 40 : e.key === 'PageUp' ? -200 : 200);
                return true;
            }
            return true;
        }

        return false;
    }

    _shouldBacktickCancel(lastFrameEarly, inPlayEarly) {
        if (!inPlayEarly) return true;
        const realm = (window.__app && typeof window.__app.getActiveRealm === 'function')
            ? window.__app.getActiveRealm()
            : ((lastFrameEarly && lastFrameEarly.realm) || 'angband');
        if (realm !== 'frogcomposband' && realm !== 'hengband' && realm !== 'dcss') return true;
        const ui = lastFrameEarly ? lastFrameEarly.ui : null;
        if (!ui || (ui.overlay || 0) > 0 || ui.more || !ui.awaiting_command) return true;
        const termEl = document.getElementById('terminal-container');
        if (this.inTerminal || (termEl && !termEl.classList.contains('hidden'))) return true;
        if (this.isDirectionalTargeting && this.isDirectionalTargeting()) return true;
        if (window.ItemSheet && typeof window.ItemSheet.isOpen === 'function' && window.ItemSheet.isOpen()) return true;
        if ((window.radialMenu && window.radialMenu.isOpen) || (this.app && this.app.radialMenu && this.app.radialMenu.isOpen)) return true;
        const hiddenModals = ['pause-modal', 'ryod-forge-modal', 'realm-selector-modal', 'help-modal', 'guide-modal', 'command-palette-modal', 'entity-inspect-popover', 'quick-volume-popover', 'chronicle-sketch-modal', 'directional-aim-rosette'];
        if (hiddenModals.some((id) => { const el = document.getElementById(id); return Boolean(el && !el.classList.contains('hidden')); })) return true;
        return ['quick-slot-popover', 'action-more-popover'].some((id) => { const el = document.getElementById(id); return Boolean(el && el.classList.contains('is-open')); });
    }

    _handleEscapeKey(e, lastFrameEarly, inPlayEarly) {
        e.preventDefault();
        if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
        const sketchModal = document.getElementById('chronicle-sketch-modal');
        if (sketchModal && !sketchModal.classList.contains('hidden')) {
            sketchModal.classList.add('hidden');
            if (window.chronicleManager) window.chronicleManager._sketchModalDismissedByUser = true;
            return;
        }
        const qvPopover = document.getElementById('quick-volume-popover');
        if (qvPopover && !qvPopover.classList.contains('hidden')) {
            qvPopover.classList.add('hidden');
            const cfgBtn = document.getElementById('btn-sound-config');
            if (cfgBtn) { cfgBtn.classList.remove('active'); cfgBtn.setAttribute('aria-expanded', 'false'); }
            return;
        }
        const rad = (this.app && this.app.radialMenu) || window.radialMenu;
        if (rad && rad.isOpen && typeof rad.close === 'function') { rad.close(); return; }
        const cmdModal = document.getElementById('command-palette-modal');
        if (cmdModal && !cmdModal.classList.contains('hidden')) {
            if (window.__app && typeof window.__app.hideCommandPalette === 'function') window.__app.hideCommandPalette();
            else if (window.CommandPalette && typeof window.CommandPalette.hide === 'function') window.CommandPalette.hide();
            else cmdModal.classList.add('hidden');
            return;
        }
        if (window.ItemSheet && typeof window.ItemSheet.isOpen === 'function' && window.ItemSheet.isOpen()) { window.ItemSheet.close(); return; }
        const ryodModal = document.getElementById('ryod-forge-modal');
        if ((ryodModal && !ryodModal.classList.contains('hidden')) || (window.RyodForge && typeof window.RyodForge.isOpen === 'function' && window.RyodForge.isOpen())) {
            if (window.RyodForge && typeof window.RyodForge.close === 'function') window.RyodForge.close();
            else if (ryodModal) ryodModal.classList.add('hidden');
            return;
        }
        const realmModal = document.getElementById('realm-selector-modal');
        if (realmModal && !realmModal.classList.contains('hidden')) {
            if (window.__app && typeof window.__app.hideRealmSelector === 'function') window.__app.hideRealmSelector();
            else realmModal.classList.add('hidden');
            return;
        }
        const helpModal = document.getElementById('help-modal');
        const guideModal = document.getElementById('guide-modal');
        if ((helpModal && !helpModal.classList.contains('hidden')) || (guideModal && !guideModal.classList.contains('hidden'))) {
            if (helpModal) helpModal.classList.add('hidden');
            if (window.__app && typeof window.__app.hideGuide === 'function') window.__app.hideGuide();
            else if (guideModal) guideModal.classList.add('hidden');
            return;
        }
        const chronicleWin = document.getElementById('chronicle-window');
        const chronicleOpen = Boolean(window.chronicleManager && (window.chronicleManager.visible || (chronicleWin && chronicleWin.classList.contains('active'))));
        if (chronicleOpen && (!chronicleWin || !chronicleWin.classList.contains('is-pinned')) &&
            typeof window.chronicleManager.hideWindow === 'function') {
            window.chronicleManager.hideWindow();
            return;
        }
        const pauseModal = document.getElementById('pause-modal');
        if (pauseModal && !pauseModal.classList.contains('hidden')) {
            if (window.__app && typeof window.__app.resumeGame === 'function') window.__app.resumeGame();
            else pauseModal.classList.add('hidden');
            return;
        }
        const qsPopover = document.getElementById('quick-slot-popover');
        if (qsPopover && qsPopover.classList.contains('is-open')) { qsPopover.classList.remove('is-open'); return; }
        const morePopover = document.getElementById('action-more-popover');
        if (morePopover && morePopover.classList.contains('is-open')) { morePopover.classList.remove('is-open'); return; }
        const inspectPopover = document.getElementById('entity-inspect-popover');
        if (inspectPopover && !inspectPopover.classList.contains('hidden')) {
            if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') window.chronicleManager.preemptForGameplay('escape');
            else inspectPopover.classList.add('hidden');
            return;
        }
        const rosette = document.getElementById('directional-aim-rosette');
        if (rosette && !rosette.classList.contains('hidden')) { rosette.classList.add('hidden'); }
        if (window.__app && window.__app.cancelQuickBirth) window.__app.cancelQuickBirth();

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
                if (isReviewActive && window.__app && typeof window.__app.returnToMainMenu === 'function') {
                    window.__app.returnToMainMenu();
                } else if (window.__app && window.__app.rerollHero) {
                    window.__app.rerollHero();
                } else {
                    this.network.sendKey('s');
                }
            } else {
                this.network.sendKey('escape');
            }
            return;
        }

        const ui = lastFrame ? lastFrame.ui : null;
        const isForcedTerm = window.__app && window.__app.isForceTerminal && window.__app.isForceTerminal();
        const inContextMenu = (ui && (ui.overlay > 0 || ui.more || !ui.awaiting_command)) || this.inTerminal || isForcedTerm;

        if (inContextMenu) {
            this._pendingMoreMove = null;
            this._pendingFollowUp = null;
            this._pendingFollowUpKey = null;
            this._pendingMoreAction = null;
            this.network.sendKey('escape');
            if (window.__app && window.__app.setForceTerminal) window.__app.setForceTerminal(false);
        } else {
            if (window.__app && window.__app.showPauseMenu) window.__app.showPauseMenu();
        }
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

        if (isReviewScreen && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
            if (window.__app && window.__app.rerollHero) window.__app.rerollHero();
            else {
                const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
                this.network.sendKey(realm === 'silq' || realm === 'hengband' ? 'r' : 's');
            }
            return;
        }
        if (isReviewScreen && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
            this.network.sendKey('p');
            return;
        }
        if (isReviewScreen && (e.key === 'c' || e.key === 'C' || e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            if (this.audio) this.audio.playMenuNav();
            if (window.__app && window.__app.startCustomHeroCreation) window.__app.startCustomHeroCreation();
            else { if (window.__app && window.__app.cancelQuickBirth) window.__app.cancelQuickBirth(); this.network.sendKey('s'); }
            return;
        }
        if (isReviewScreen && (e.key === 'Enter' || e.key === 'y' || e.key === 'Y' || e.key === ' ')) {
            e.preventDefault();
            if (this.audio) this.audio.playWhoosh();
            if (window.__app && window.__app.confirmHeroBirth) window.__app.confirmHeroBirth();
            else this.network.sendKey(e.key === 'y' || e.key === 'Y' ? 'y' : 'enter');
            return;
        }
        if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); window.__app?.terminal?.zoomIn?.(); return; }
        if (e.ctrlKey && (e.key === '-' || e.key === '_')) { e.preventDefault(); window.__app?.terminal?.zoomOut?.(); return; }
        if (e.ctrlKey && e.key === '0') { e.preventDefault(); window.__app?.terminal?.resetZoom?.(); return; }

        const isAwaitingCmd = inPlay && Boolean(
            (lastFrame.awaiting_command || (lastFrame.ui && lastFrame.ui.awaiting_command)) &&
            (!lastFrame.ui || !lastFrame.ui.more) && (!lastFrame.ui || !lastFrame.ui.overlay)
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
            if (termDir > 0) { e.preventDefault(); this.network.sendCommand(`keys .${termDir}`); return; }
        }

        let keySpec = null;
        const isNumpadDigit = Boolean(e.code && /^Numpad[0-9]$/.test(e.code));
        if (isNumpadDigit && (tf.isQuantityPrompt || tf.isNamePrompt || tf.isInscriptionPrompt)) keySpec = e.code.slice(6);
        else if (e.key === 'ArrowUp' || e.code === 'Numpad8') keySpec = 'up';
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
        else if (e.key === 'Escape') keySpec = 'escape';
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
            const isTermTargeting = Boolean(
                (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay)) ||
                (lastFrame && lastFrame.ui && lastFrame.ui.prompt && lastFrame.ui.prompt.kind === 'direction')
            );
            if (isTermTargeting && this.wasdMode && keySpec.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const mappedDir = { 'w': 8, 's': 2, 'a': 4, 'd': 6, 'q': 7, 'e': 9, 'z': 1, 'c': 3 }[keySpec.toLowerCase()];
                if (mappedDir) {
                    const moveKey = this.getRelativeDirectionKey(mappedDir);
                    if (moveKey) { this.network.sendKey(moveKey); return; }
                }
            }
            if ((keySpec === 'up' || keySpec === 'down') && this.terminal && typeof this.terminal.moveSelection === 'function') {
                const pending = (window.MenuRouter && typeof window.MenuRouter.getPending === 'function') ? window.MenuRouter.getPending() : null;
                const scClass = (window.ScreenContext && typeof window.ScreenContext.classify === 'function' && lastFrame) ? window.ScreenContext.classify(lastFrame, realm) : null;
                const inSelectableList = Boolean(
                    (scClass && (scClass.mode === 'item-list' || scClass.mode === 'item-actions')) ||
                    (this.terminal.currentMode === 'item_prompt' && Array.isArray(this.terminal.selectableRegions) && this.terminal.selectableRegions.length > 0)
                );
                if ((pending && pending.step === 'chooser') || inSelectableList) {
                    const nextKey = this.terminal.moveSelection(keySpec === 'up' ? -1 : 1);
                    if (nextKey) {
                        if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                        if (window.__app && typeof window.__app.updateTerminalToolbar === 'function') window.__app.updateTerminalToolbar(lastFrame);
                        return;
                    }
                }
            }
            if (keySpec === 'enter' && this.terminal && typeof this.terminal.getSelectedKey === 'function') {
                const pending = (window.MenuRouter && typeof window.MenuRouter.getPending === 'function') ? window.MenuRouter.getPending() : null;
                const scClass = (window.ScreenContext && typeof window.ScreenContext.classify === 'function' && lastFrame) ? window.ScreenContext.classify(lastFrame, realm) : null;
                const inSelectableList = Boolean(
                    (scClass && (scClass.mode === 'item-list' || scClass.mode === 'item-actions')) ||
                    (this.terminal.currentMode === 'item_prompt' && Array.isArray(this.terminal.selectableRegions) && this.terminal.selectableRegions.length > 0)
                );
                if ((!pending || pending.step !== 'chooser') && inSelectableList) {
                    const selKey = this.terminal.getSelectedKey();
                    if (selKey) keySpec = selKey;
                }
            }
            if (window.MenuRouter && typeof window.MenuRouter.route === 'function') {
                if (window.MenuRouter.route(keySpec, lastFrame, realm, { source: 'keyboard' })) {
                    if (this.terminal && typeof this.terminal.setSelectedKey === 'function' && keySpec.length === 1) this.terminal.setSelectedKey(keySpec);
                    if (window.__app && typeof window.__app.updateTerminalToolbar === 'function') window.__app.updateTerminalToolbar(lastFrame);
                    if (this.terminal && lastFrame && lastFrame.term && typeof this.terminal.render === 'function') this.terminal.render(lastFrame.term);
                    return;
                }
            }
            if (keySpec === 'escape') {
                if (window.MenuRouter && typeof window.MenuRouter.clearPending === 'function') window.MenuRouter.clearPending();
                if (window.__app && window.__app.setForceTerminal) window.__app.setForceTerminal(false);
                window.__manualTerminalOpen = false;
            }
            this.network.sendKey(keySpec);
        }
    }

    sendMovementKey(key) {
        if (this.dungeon && typeof this.dungeon.snapCameraToDefault === 'function') this.dungeon.snapCameraToDefault();
        const lf = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
        this._lastMoveSentSeq = (lf && lf.seq !== undefined) ? lf.seq : -1;
        this._lastMoveSentAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        this._inFlightMoves = (this._inFlightMoves || 0) + 1;
        if (lf && lf.player && lf.map && lf.map.rows && this.dungeon) {
            const deltaMap = { up: [0, -1], pageup: [1, -1], right: [1, 0], pagedown: [1, 1], down: [0, 1], end: [-1, 1], left: [-1, 0], home: [-1, -1] };
            const d = deltaMap[String(key || '').toLowerCase()];
            if (d) {
                const nx = lf.player.x + d[0], ny = lf.player.y + d[1], feat = this.getFeatAt(lf.map, nx, ny);
                const monBlocking = Array.isArray(lf.monsters) && lf.monsters.some((m) => m && m.x === nx && m.y === ny && m.hp > 0);
                const fDef = this.dungeon.featureDefs && this.dungeon.featureDefs[feat];
                const featPassable = fDef ? fDef.passable !== false : ![0, 2, 15, 16, 17, 18, 19, 20, 21, 22, 29, 30, 32, 41, 60, 61].includes(feat);
                if (!monBlocking && feat > 0 && featPassable && this.dungeon.targetCamPos) {
                    const logPos = this.dungeon._logicalCamPos || this.dungeon.currentCamPos;
                    if (this.dungeon.isStepping && logPos) this.dungeon.currentCamPos.copy(logPos);
                    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    this.dungeon._strideChain = (nowMs - (this.dungeon._lastStepEndMs || 0)) < 85;
                    this.dungeon.targetCamPos.set(nx * this.dungeon.cellSize, this.dungeon.eyeHeight + (this.dungeon.playerWaterYOffset || 0), ny * this.dungeon.cellSize);
                    this.dungeon.isStepping = true; this.dungeon.stepTime = 0;
                }
            }
        }
        this.network.sendKey(key);
    }

    _playKeyAudio(key) {
        if (!this.audio || !key) return;
        const k = key, kl = typeof k === 'string' ? k.toLowerCase() : '';
        if (k === 'T') {
            if (typeof this.audio.playWallBump === 'function') this.audio.playWallBump(0.9);
            else if (typeof this.audio.playWhoosh === 'function') this.audio.playWhoosh();
        } else if (k === 'B') {
            if (typeof this.audio.playDoorBreak === 'function') this.audio.playDoorBreak();
            else if (typeof this.audio.playWhoosh === 'function') this.audio.playWhoosh();
        } else if (k === 'D') {
            if (typeof this.audio.playTrapDisarm === 'function') this.audio.playTrapDisarm();
            else if (typeof this.audio.playDoor === 'function') this.audio.playDoor(true);
        } else if (k === 'R' || k === '%') {
            if (typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
        } else if (k === '>' || k === '<') {
            if (typeof this.audio.playStairs === 'function') this.audio.playStairs(k === '>');
        } else if (kl === 'm' || kl === 'b' || kl === 'p' || kl === 'i' || kl === 'e' || kl === 'g' || kl === 'u' || kl === 'o' || kl === 'q' || kl === 'tab' || kl === 'n') {
            if (kl === 'q' && typeof this.audio.playQuaff === 'function') this.audio.playQuaff();
            else if (kl === 'r' && typeof this.audio.playScroll === 'function') this.audio.playScroll();
            else if (kl === 'g' && typeof this.audio.playItemPickup === 'function') this.audio.playItemPickup();
            else if (typeof this.audio.playMenuOpen === 'function') this.audio.playMenuOpen();
        } else if (kl === 's') { if (typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav(); }
        else if (kl === 'd') { if (typeof this.audio.playItemDrop === 'function') this.audio.playItemDrop(); }
        else if (k === 'E') { if (typeof this.audio.playEat === 'function') this.audio.playEat(); }
        else if (k === 'w') { if (typeof this.audio.playEquipWeapon === 'function') this.audio.playEquipWeapon(); }
        else if (k === 'W') { if (typeof this.audio.playEquipArmor === 'function') this.audio.playEquipArmor(); }
        else if (k === 't' || kl === 'f' || kl === 'v') {
            if (typeof this.audio.playBowShoot === 'function') this.audio.playBowShoot();
            else if (typeof this.audio.playWhoosh === 'function') this.audio.playWhoosh();
        } else if (kl === 'o' || kl === 'c') { if (typeof this.audio.playDoor === 'function') this.audio.playDoor(kl === 'o'); }
    }

    handleWorldKey(e) {
        if (e.altKey) return;
        if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
            window.chronicleManager.preemptForGameplay('world_key');
        }
        let skipWasdRemap = false;
        if (this._wasdLiteralNext) { this._wasdLiteralNext = false; skipWasdRemap = true; }
        if (this.wasdMode && !skipWasdRemap && !e.ctrlKey && !e.altKey && !e.metaKey && e.key === '\\') {
            e.preventDefault(); this._wasdLiteralNext = true; this.network.sendKey('\\'); return;
        }
        if (e.altKey && (e.key === '[' || e.key === ']')) {
            e.preventDefault(); window.__app?.hud?.cycleMinimapSize(e.key === '[' ? -1 : 1); return;
        }
        if (e.ctrlKey || e.altKey) {
            if (e.key === 'PageUp') { e.preventDefault(); if (this.dungeon) this.dungeon.userPitchOffset = Math.min(1.25, (this.dungeon.userPitchOffset || 0) + 0.12); return; }
            if (e.key === 'PageDown') { e.preventDefault(); if (this.dungeon) this.dungeon.userPitchOffset = Math.max(-0.65, (this.dungeon.userPitchOffset || 0) - 0.12); return; }
            if (e.key === 'Home') { e.preventDefault(); if (this.dungeon) this.dungeon.userPitchOffset = 0.0; return; }
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) {
            e.preventDefault(); window.__app?.hud?.adjustMinimapZoom((e.key === '+' || e.key === '=') ? 0.15 : -0.15); return;
        }

        const numpadDirMap = {
            'Numpad8': 8, 'Digit8': 8, 'Numpad2': 2, 'Digit2': 2, 'Numpad4': 4, 'Digit4': 4, 'Numpad6': 6, 'Digit6': 6,
            'Numpad7': 7, 'Digit7': 7, 'Home': 7, 'Numpad9': 9, 'Digit9': 9, 'PageUp': 9, 'Numpad1': 1, 'Digit1': 1, 'End': 1,
            'Numpad3': 3, 'Digit3': 3, 'PageDown': 3, 'Numpad5': 5, 'Digit5': 5, 'NumpadClear': 5, 'Clear': 5
        };
        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
        const ui = lastFrame ? lastFrame.ui : null;
        const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
        const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function') ? window.ScreenContext.screenTextOf(lastFrame) : '';
        const isHeng = realm === 'hengband';
        const isTargeting = Boolean(
            (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
            (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay)) ||
            (ui && ui.prompt && ui.prompt.kind === 'direction')
        );

        // Directional targeting prompt remaps (L29, D22)
        if (isTargeting) {
            if (e.code === 'Digit5' || e.code === 'Numpad5' || e.key === '.' || e.key === 't' || e.key === 'T') {
                e.preventDefault(); this.network.sendKey(realm === 'silq' ? 'f' : 't'); return;
            }
            if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); this.network.sendKey('space'); return; }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const numDir = e.key === 'ArrowUp' ? 8 : (e.key === 'ArrowDown' ? 2 : (e.key === 'ArrowLeft' ? 4 : 6));
                const moveKey = this.getRelativeDirectionKey(numDir);
                if (moveKey) this.network.sendKey(moveKey);
                return;
            }
            if (this.wasdMode && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const mapped = { 'w': 8, 's': 2, 'a': 4, 'd': 6, 'q': 7, 'e': 9, 'z': 1, 'c': 3 }[e.key.toLowerCase()];
                if (mapped) {
                    e.preventDefault();
                    const moveKey = this.getRelativeDirectionKey(mapped);
                    if (moveKey) this.network.sendKey(moveKey);
                    return;
                }
            }
            const viTarg = !this.wasdMode && !e.ctrlKey && !e.altKey && !e.metaKey && window.YasdPrimitives?.resolveViKeyDir?.(e.key, { viMode: this.viKeyMode, realm, shiftKey: e.shiftKey });
            if (viTarg) { e.preventDefault(); const mk = this.getRelativeDirectionKey(viTarg.dir); if (mk) this.network.sendKey(mk); return; }
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); this.network.sendKey(e.key); }
            return;
        }

        // Context prompt (-more-) active: dismiss with space & queue move if requested
        if (ui && ui.more) {
            e.preventDefault();
            const lowerMoreK = (this.wasdMode && !e.ctrlKey && !e.altKey && !e.metaKey) ? e.key.toLowerCase() : '';
            if (e.key === 'ArrowLeft' || (lowerMoreK === 'a' && !e.shiftKey)) {
                this.network.sendKey('space'); this.dungeon.turn(-1); this.syncCompass(); return;
            }
            if (e.key === 'ArrowRight' || (lowerMoreK === 'd' && !e.shiftKey)) {
                this.network.sendKey('space'); this.dungeon.turn(1); this.syncCompass(); return;
            }
            const wasdMoreDir = lowerMoreK === 'w' ? 8 : (lowerMoreK === 's' ? 2 : (lowerMoreK === 'a' && e.shiftKey ? 4 : (lowerMoreK === 'd' && e.shiftKey ? 6 : 0)));
            const dir = wasdMoreDir || numpadDirMap[e.code] || numpadDirMap[e.key];
            let moveDir = 0, isRun = false;
            if (dir) { moveDir = dir; isRun = this.isRunningActive(e) && (dir !== 5 || wasdMoreDir); }
            else if (e.key === 'ArrowUp') { moveDir = 8; isRun = this.isRunningActive(e); }
            else if (e.key === 'ArrowDown') { moveDir = 2; isRun = this.isRunningActive(e); }
            if (moveDir) {
                const moveKey = this.getRelativeDirectionKey(moveDir);
                const dispatcher = (this.app && this.app.dispatcher) || (window.__app && window.__app.dispatcher);
                if (dispatcher && typeof dispatcher.run === 'function' && !isRun && moveKey) dispatcher.run({ verb: 'more_move', dirKey: moveKey });
                else { this.network.sendKey('space'); this._pendingMoreMove = { isRun, dir: moveDir, moveKey }; }
            } else this.network.sendKey('space');
            return;
        }

        const isTopLevelCommandPrompt = Boolean(ui && ui.awaiting_command && !ui.more && (ui.overlay || 0) === 0);
        let isPromptActive = false;
        if (window.ScreenContext) {
            if (typeof window.ScreenContext.promptFlags === 'function') {
                const pf = window.ScreenContext.promptFlags(screenText);
                if (pf && (pf.isYesNoPrompt || pf.isQuantityPrompt)) isPromptActive = true;
            }
            if (typeof window.ScreenContext.classify === 'function') {
                const cls = window.ScreenContext.classify(lastFrame, realm);
                if (cls && (cls.isItemPrompt || cls.isStore || cls.isYesNoPrompt || cls.isQuantityPrompt || cls.isChoiceMenu || cls.isNamePrompt || cls.isMenuOrInteractive)) isPromptActive = true;
            }
        }
        // Forward keyboard input directly to engine whenever a 3D prompt overlay / non-idle prompt is active (never hijack digits/arrows/space into movement or camera turn)
        if (ui && (!isTopLevelCommandPrompt || isPromptActive) && !e.altKey && !e.metaKey) {
            const pMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter', Backspace: 'backspace', Delete: 'delete', ' ': 'space' };
            const pKey = pMap[e.key] || (e.key.length === 1 ? (e.ctrlKey ? `C-${e.key.toLowerCase()}` : e.key) : null);
            if (pKey) { e.preventDefault(); this.network.sendKey(pKey); return; }
        }

        const curSeq = (lastFrame && lastFrame.seq !== undefined) ? lastFrame.seq : -1;
        if (curSeq !== this._lastMoveSentSeq) this._inFlightMoves = 0;
        const rttWindowMs = Math.min(180, Math.max(65, (((this.network && this.network.pingMs) || 40) * 1.6)));
        const elapsedMs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - (this._lastMoveSentAt || 0));
        const moveSeqPending = Boolean(e.repeat && ((this._inFlightMoves || 0) >= 2 || (curSeq === this._lastMoveSentSeq && elapsedMs < rttWindowMs)));
        if (this.wasdMode && !skipWasdRemap && !isTargeting && isTopLevelCommandPrompt && !isPromptActive && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const lowerK = e.key.toLowerCase();
            const diagMap = { q: 7, e: 9, z: 1, c: 3 };
            const isAdStrafe = (lowerK === 'a' || lowerK === 'd');
            if (isAdStrafe || (!e.shiftKey && (lowerK === 'w' || lowerK === 's' || diagMap[lowerK]))) {
                e.preventDefault();
                this.clearDirectionHint();
                const runActive = this.isRunningActive(e);
                if (diagMap[lowerK]) {
                    if (moveSeqPending || (runActive && e.repeat)) return;
                    if (this.dungeon && typeof this.dungeon.commitFreelookFacing === 'function') this.dungeon.commitFreelookFacing();
                    this.sendMoveOrRun(diagMap[lowerK], false);
                } else if (lowerK === 'w' || lowerK === 's') {
                    if (moveSeqPending || (runActive && e.repeat)) return;
                    if (this.dungeon && typeof this.dungeon.commitFreelookFacing === 'function') this.dungeon.commitFreelookFacing();
                    this.sendMoveOrRun(lowerK === 'w' ? 8 : 2, false);
                } else if (e.shiftKey) {
                    if (moveSeqPending) return;
                    if (this.dungeon && typeof this.dungeon.commitFreelookFacing === 'function') this.dungeon.commitFreelookFacing();
                    this.sendMoveOrRun(lowerK === 'a' ? 4 : 6, false);
                } else {
                    this.dungeon.turn(lowerK === 'a' ? -1 : 1); this.syncCompass();
                }
                return;
            }
        }
        const viMove = (!this.wasdMode && isTopLevelCommandPrompt && !isPromptActive && !e.ctrlKey && !e.altKey && !e.metaKey) ? window.YasdPrimitives?.resolveViKeyDir?.(e.key, { viMode: this.viKeyMode, realm, shiftKey: e.shiftKey }) : null;
        if (viMove) {
            e.preventDefault(); if (moveSeqPending) return;
            this.handleRelativeDirection(viMove.dir, viMove.isRun); return;
        }

        const dirKey = numpadDirMap[e.code] || numpadDirMap[e.key];
        if (dirKey && !(e.shiftKey && e.code && e.code.startsWith('Digit'))) {
            e.preventDefault();
            if (dirKey === 5) {
                const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? (RealmKeys.realmKey('hold', realm) || ',') : ',';
                this.network.sendKey(holdKey); return;
            }
            if (moveSeqPending) return;
            if (this.dungeon && typeof this.dungeon.commitFreelookFacing === 'function') this.dungeon.commitFreelookFacing();
            if (this.isRunningActive(e)) { if (!e.repeat) this.sendRunMove(dirKey); }
            else { const moveKey = this.getRelativeDirectionKey(dirKey); if (moveKey) this.sendMovementKey(moveKey); }
            return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (this.isRunningActive(e) && e.shiftKey) { if (!e.repeat) this.sendRunMove(e.key === 'ArrowLeft' ? 4 : 6); }
            else this.dungeon.turn(e.key === 'ArrowLeft' ? -1 : 1);
            return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (moveSeqPending) return;
            if (this.dungeon && typeof this.dungeon.commitFreelookFacing === 'function') this.dungeon.commitFreelookFacing();
            const dir = e.key === 'ArrowUp' ? 8 : 2;
            if (this.isRunningActive(e)) { if (!e.repeat) this.sendRunMove(dir); }
            else { const moveKey = this.getRelativeDirectionKey(dir); if (moveKey) this.sendMovementKey(moveKey); }
            return;
        }

        if (e.key === 'Home' || e.key === 'PageUp' || e.key === 'End' || e.key === 'PageDown') {
            const diagDir = { 'Home': 7, 'PageUp': 9, 'End': 1, 'PageDown': 3 }[e.key];
            if (diagDir) {
                e.preventDefault();
                if (moveSeqPending) return;
                if (this.dungeon && typeof this.dungeon.commitFreelookFacing === 'function') this.dungeon.commitFreelookFacing();
                if (this.isRunningActive(e)) { if (!e.repeat) this.sendRunMove(diagDir); }
                else { const moveKey = this.getRelativeDirectionKey(diagDir); if (moveKey) this.sendMovementKey(moveKey); }
                return;
            }
        }

        const pickupIsComma = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? (RealmKeys.realmKey('pickup', realm) === ',') : false;
        if ((e.key === '.' && !e.shiftKey) || (e.key === ',' && !pickupIsComma)) {
            e.preventDefault();
            this.network.sendKey((typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? (RealmKeys.realmKey('hold', realm) || ',') : ',');
            return;
        }
        if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); this.executeSmartAction(this.smartAction || 'wait'); return; }
        if (e.key === 'Enter') { e.preventDefault(); this.network.sendKey('enter'); return; }
        if (e.key.length === 1 && e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); this.network.sendKey(`C-${e.key.toLowerCase()}`); return; }

        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            if (isTopLevelCommandPrompt && realm === 'dcss' && e.key === 'o') {
                const lf = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
                const px = lf?.player?.x, py = lf?.player?.y;
                const hasAdjDoor = px !== undefined && py !== undefined && [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]].some(([dx, dy]) => this.getFeatAt(lf.map, px + dx, py + dy) === 2);
                if (!hasAdjDoor) { this.toggleAutoExplore(lf); return; }
            }
            let keyToSend = e.key;
            if (isTopLevelCommandPrompt && (realm === 'silq' || realm === 'frogcomposband' || realm === 'hengband') && typeof RealmKeys !== 'undefined' && RealmKeys.fromVanilla) {
                const mapped = RealmKeys.fromVanilla(e.key, realm);
                if (mapped === null && realm === 'silq' && (e.key === 'r' || e.key === 'b')) {
                    this.network.sendKey(e.key);
                    return;
                }
                if (mapped === null) return;
                if (mapped !== undefined) keyToSend = mapped;
            }
            this._playKeyAudio(keyToSend);
            this.network.sendKey(keyToSend);
        }
    }

    getRelativeDirectionKey(numpadDir) {
        if (numpadDir === 5) {
            const realm = (window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : 'angband';
            return (typeof RealmKeys !== 'undefined' && typeof RealmKeys.realmKey === 'function') ? (RealmKeys.realmKey('hold', realm) || ',') : ',';
        }
        if (this.dungeon && typeof this.dungeon.getFacingKey === 'function') {
            return this.dungeon.getFacingKey(numpadDir);
        }
        const localIndexMap = { 8: 0, 9: 1, 6: 2, 3: 3, 2: 4, 1: 5, 4: 6, 7: 7 };
        const localIndex = localIndexMap[numpadDir];
        if (localIndex === undefined) return null;
        const dirKeys = ['up', 'pageup', 'right', 'pagedown', 'down', 'end', 'left', 'home'];
        let facing = 0;
        if (this.dungeon) {
            if (typeof this.dungeon.facing === 'number') {
                facing = this.dungeon.facing;
            } else if (typeof this.dungeon.yaw === 'number') {
                const normYaw = ((this.dungeon.yaw % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
                facing = Math.round(normYaw / (Math.PI / 2)) % 4;
            }
        }
        return dirKeys[(localIndex + facing * 2) % 8];
    }

    isDirectionalTargeting() {
        const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
        if (!lastFrame) return false;
        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
            ? window.ScreenContext.screenTextOf(lastFrame)
            : '';
        const inPlay = Boolean(lastFrame && lastFrame.phase === 'play');
        const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
        const isHeng = realm === 'hengband';
        return Boolean(
            (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
            (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay)) ||
            (lastFrame.ui && lastFrame.ui.prompt && lastFrame.ui.prompt.kind === 'direction')
        );
    }

    setupActionButtons() {
        const bindReliableAction = (btn, onTrigger) => {
            if (!btn) return;
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
                    if (dx > 10 || dy > 10) moved = true;
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
                    if (now - lastTriggerTime < 280) return;
                    lastTriggerTime = now;

                    if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                    if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');
                    if (this.audio) this.audio.unlock();

                    const lastFrame = (window.__app && window.__app.lastFrame) ? window.__app.lastFrame : null;
                    if (lastFrame && lastFrame.ui && lastFrame.ui.more) {
                        const dispatcher = (this.app && this.app.dispatcher) || (window.__app && window.__app.dispatcher);
                        if (dispatcher && typeof dispatcher.run === 'function') {
                            dispatcher.run({ verb });
                            return;
                        }
                        this.network.sendKey('space');
                        this._pendingMoreAction = () => fire(ev, attempt + 1);
                        return;
                    }

                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';

                    if (verb === 'toggle-run') {
                        this.toggleDpadRunMode();
                        return;
                    } else if (verb === 'explore' || verb === 'toggle-explore') {
                        this.toggleAutoExplore();
                        return;
                    } else if (verb === 'attack') {
                        this.dungeon.triggerAttackAnimation();
                        if (this.audio) this.audio.playWhoosh();
                        const lf = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
                        const px = lf?.player?.x;
                        const py = lf?.player?.y;
                        const { fwd } = this.getFacingForward();
                        let targetDirKey = null;
                        const monsters = (lf && Array.isArray(lf.monsters)) ? lf.monsters : [];
                        if (px !== undefined && py !== undefined) {
                            const facingMonster = monsters.find(m => m && m.x === px + fwd.dx && m.y === py + fwd.dy && this.isHostileMonster(m, lf));
                            if (facingMonster) {
                                targetDirKey = this.getWorldDirectionKey(fwd.dx, fwd.dy);
                            } else {
                                const neighbors = [
                                    { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
                                    { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
                                ];
                                for (const n of neighbors) {
                                    if (monsters.some(mon => mon && mon.x === px + n.dx && mon.y === py + n.dy && this.isHostileMonster(mon, lf))) {
                                        targetDirKey = this.getWorldDirectionKey(n.dx, n.dy);
                                        break;
                                    }
                                }
                            }
                        }
                        if (!targetDirKey) targetDirKey = this.getRelativeDirectionKey(8) || 'up';
                        this.network.sendKey(targetDirKey);
                        return;
                    } else if (verb === 'terminal') {
                        if (this.toggleTerminalView) this.toggleTerminalView();
                        return;
                    } else if (verb === 'wield' || verb === 'drop' || verb === 'aim') {
                        this.openContextualMenu(verb);
                        return;
                    } else if (verb === 'search') {
                        const sKey = ((typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? RealmKeys.realmKey('search', realm) : null) || (realm === 'silq' ? 'S' : (realm === 'angband' ? 'I' : 'S'));
                        if (sKey) this.network.sendKey(sKey);
                        return;
                    } else if (verb === 'quests') {
                        this.network.sendKey('C-q');
                        return;
                    } else if (verb === 'overland') {
                        this.network.sendKey('<');
                        return;
                    } else if ((verb === 'inven' || verb === 'equip') &&
                        window.DeviceProfile && typeof window.DeviceProfile.isHandheld === 'function' && window.DeviceProfile.isHandheld() &&
                        window.__MobileConsole && typeof window.__MobileConsole.openItemSheetTab === 'function') {
                        window.__MobileConsole.openItemSheetTab(verb === 'equip' ? 'gear' : 'pack', btn);
                        return;
                    }

                    let effKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey)
                        ? RealmKeys.realmKey(verb, realm)
                        : null;
                    if (verb === 'eat' && effKey === 'e' && (realm === 'angband' || realm === 'frogcomposband' || realm === 'hengband')) effKey = 'E';
                    if (!effKey) return;

                    if (this.isDirectionalTargeting && this.isDirectionalTargeting() && (verb !== 'attack' && verb !== 'fire' && verb !== 'throw')) {
                        const dispatcher = (this.app && this.app.dispatcher) || (window.__app && window.__app.dispatcher);
                        if (dispatcher && typeof dispatcher.run === 'function') {
                            dispatcher.run({ verb });
                            return;
                        }
                        this.network.sendKey('escape');
                        this._pendingFollowUpKey = effKey;
                        return;
                    }

                    if (verb === 'rest') {
                        if (this.audio && typeof this.audio.playMenuNav === 'function') this.audio.playMenuNav();
                        const dispatcher = (this.app && this.app.dispatcher) || (window.__app && window.__app.dispatcher);
                        if (dispatcher && typeof dispatcher.run === 'function') {
                            dispatcher.run({ verb: 'rest', qty: 'enter' });
                            return;
                        }
                        this.network.sendKey(effKey);
                        if (effKey === 'R') this._pendingFollowUp = 'enter';
                        return;
                    } else if (verb === 'open') {
                        if (this.audio) this.audio.playDoor();
                        const lf = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || null;
                        const px = lf?.player?.x;
                        const py = lf?.player?.y;
                        const { fwd } = this.getFacingForward();
                        let doorDirKey = null;
                        if (lf && lf.map && px !== undefined && py !== undefined) {
                            const isDoorAt = (x, y) => {
                                const feat = this.getFeatAt ? this.getFeatAt(lf.map, x, y) : 0;
                                const fDef = (this.dungeon && this.dungeon.featureDefs) ? this.dungeon.featureDefs[feat] : null;
                                return feat === 2 || (fDef && (fDef.isDoor || /door/i.test(fDef.name || '')));
                            };
                            if (isDoorAt(px + fwd.dx, py + fwd.dy)) {
                                doorDirKey = this.getWorldDirectionKey(fwd.dx, fwd.dy);
                            } else {
                                const neighbors = [
                                    { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
                                    { dx: 0, dy: 1 },  { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }
                                ];
                                for (const n of neighbors) {
                                    if (isDoorAt(px + n.dx, py + n.dy)) {
                                        doorDirKey = this.getWorldDirectionKey(n.dx, n.dy);
                                        break;
                                    }
                                }
                            }
                        }
                        if (!doorDirKey) doorDirKey = this.getRelativeDirectionKey(8) || 'up';

                        const dispatcher = (this.app && this.app.dispatcher) || (window.__app && window.__app.dispatcher);
                        if (dispatcher && typeof dispatcher.run === 'function') {
                            dispatcher.run({ verb: 'open', dir: doorDirKey });
                            return;
                        }
                        this.network.sendKey(effKey);
                        this._pendingFollowUp = doorDirKey;
                        return;
                    }

                    this._playKeyAudio(effKey);
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
        bind('btn-eat', 'eat');
        bind('btn-read', 'read');
        bind('btn-door', 'open');
        bind('btn-pickup', 'pickup');
        bind('btn-rest', 'rest');
        bind('btn-inventory', 'inven');
        bind('btn-equipment', 'equip');
        bind('btn-wield', 'wield');
        bind('btn-drop', 'drop');
        bind('btn-aim', 'aim');
        bind('btn-search', 'search');
        bind('btn-terminal', 'terminal');
        bind('btn-explore', 'explore');
        bind('btn-run-toggle', 'toggle-run');
        const bindCtx = (id) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const key = btn.dataset.contextKey;
                if (key && this.network && typeof this.network.sendKey === 'function') {
                    this.network.sendKey(key);
                }
                btn.blur();
            });
        };
        bindCtx('btn-context-tile');
        bindCtx('btn-context-alt');

        const wBtn = document.getElementById('btn-wasd-toggle');
        if (wBtn) {
            const stopDrag = (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); };
            wBtn.addEventListener('pointerdown', stopDrag);
            wBtn.addEventListener('mousedown', stopDrag);
            wBtn.addEventListener('touchstart', stopDrag, { passive: true });
            bindReliableAction(wBtn, (ev) => {
                if (ev && ev.stopPropagation) ev.stopPropagation();
                this.toggleWasdMode();
            });
        }

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
                    const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? (RealmKeys.realmKey('hold', realm) || ',') : ',';
                    this.network.sendKey(holdKey);
                }
            });
        }

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
                    const isTargeting = Boolean(
                        (window.ScreenContext && typeof window.ScreenContext.toolbarFlags === 'function' && window.ScreenContext.toolbarFlags(lastFrame, screenText, isHeng).isTargeting) ||
                        (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function' && window.ScreenContext.inputTargetingPrompt(screenText, inPlay))
                    );

                    if (dir === 5) {
                        if (isTargeting) {
                            const targetKey = realm === 'silq' ? 'f' : 't';
                            this.network.sendKey(targetKey);
                        } else {
                            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? (RealmKeys.realmKey('hold', realm) || ',') : ',';
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

        const stairBtn = document.getElementById('btn-stair');
        if (stairBtn) {
            let lastStairTime = 0;
            bindReliableAction(stairBtn, (ev) => {
                const now = Date.now();
                if (now - lastStairTime < 280) return;
                lastStairTime = now;
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('medium');
                if (this.audio) this.audio.unlock();
                const key = stairBtn.dataset.key || '>';
                this.network.sendKey(key);
            });
        }

        const actionMoreBtn = document.getElementById('btn-action-more');
        const actionBar = document.getElementById('action-bar');
        const actionPopover = document.getElementById('action-more-popover');

        const ACTION_PRIORITY = ['btn-command-palette', 'btn-hero-action', 'btn-attack', 'btn-cast', 'btn-study', 'btn-browse', 'btn-fire', 'btn-throw', 'btn-quaff', 'btn-eat', 'btn-read', 'btn-pickup', 'btn-rest', 'btn-inventory', 'btn-equipment', 'btn-wield', 'btn-drop', 'btn-aim', 'btn-search', 'btn-door', 'btn-power', 'btn-skills', 'btn-quests', 'btn-overland', 'btn-stair', 'btn-context-tile', 'btn-context-alt', 'btn-explore', 'btn-run-toggle', 'btn-terminal', 'btn-guide-hud'];

        if (actionMoreBtn && actionBar) {
            let lastMoreTime = 0;
            const updateActionBarOverflow = () => {
                const isHandheld = Boolean(window.DeviceProfile && typeof window.DeviceProfile.isHandheld === 'function' && window.DeviceProfile.isHandheld());
                const fineHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
                const isSmallOrCoarse = isHandheld || (window.innerWidth <= 900) || actionBar.classList.contains('hotbar-8slot') || (window.matchMedia('(pointer: coarse)').matches && !fineHover);
                const allButtons = ACTION_PRIORITY.map(id => document.getElementById(id)).filter(Boolean);
                const overflowSig = `${window.innerWidth}:${isSmallOrCoarse ? 1 : 0}:` + allButtons.map(b => `${b.id}:${b.dataset.realmHidden || 0}:${b.dataset.contextHidden || 0}:${b.classList && b.classList.contains('is-suggested') ? 1 : 0}`).join('|');
                if (actionBar._lastOverflowSig === overflowSig) return;
                actionBar._lastOverflowSig = overflowSig;

                if (isSmallOrCoarse) {
                    for (const btn of allButtons) {
                        if (btn.parentElement !== actionBar) actionBar.insertBefore(btn, actionMoreBtn);
                        btn.removeAttribute('data-overflow-hidden');
                        if (btn.dataset.realmHidden === '1' || btn.dataset.contextHidden === '1') btn.style.display = 'none';
                    }
                    if (actionPopover) actionPopover.classList.remove('is-open');
                    actionMoreBtn.classList.add('is-needed');
                    actionMoreBtn.style.display = 'inline-flex';
                } else {
                    for (const btn of allButtons) {
                        if (btn.parentElement !== actionBar) actionBar.insertBefore(btn, actionMoreBtn);
                        btn.removeAttribute('data-overflow-hidden');
                        if (btn.dataset.realmHidden === '1' || btn.dataset.contextHidden === '1') btn.style.display = 'none';
                    }
                    const firstBtn = actionBar.querySelector('.action-btn:not(#btn-action-more)');
                    const btnHeight = (firstBtn && firstBtn.offsetHeight > 0) ? firstBtn.offsetHeight : 34;
                    const maxTwoRowHeight = btnHeight * 2 + 28;

                    if (actionBar.offsetHeight > 0 && actionBar.scrollHeight > maxTwoRowHeight) {
                        actionMoreBtn.classList.add('is-needed');
                        actionMoreBtn.style.display = 'inline-flex';
                        for (let i = allButtons.length - 1; i >= 0; i--) {
                            const btn = allButtons[i];
                            if (btn.dataset.realmHidden === '1' || btn.dataset.contextHidden === '1') continue;
                            if (btn.classList && btn.classList.contains('is-suggested')) continue;
                            if (btn.parentElement === actionBar) {
                                if (actionPopover) actionPopover.insertBefore(btn, actionPopover.firstChild);
                                btn.setAttribute('data-overflow-hidden', '1');
                                if (actionBar.scrollHeight <= maxTwoRowHeight) break;
                            }
                        }
                    } else if (!actionBar.classList.contains('hotbar-8slot')) {
                        actionMoreBtn.classList.remove('is-needed');
                        actionMoreBtn.style.display = 'none';
                        if (actionPopover) actionPopover.classList.remove('is-open');
                    } else {
                        actionMoreBtn.classList.add('is-needed');
                        actionMoreBtn.style.display = '';
                    }
                }
            };

            const toggleDrawer = (ev) => {
                const now = Date.now();
                if (now - lastMoreTime < 100) return;
                lastMoreTime = now;
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');

                const isHandheld = Boolean(window.DeviceProfile && typeof window.DeviceProfile.isHandheld === 'function' && window.DeviceProfile.isHandheld());
                const fineHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
                const isSmallOrCoarse = isHandheld || (window.innerWidth <= 900) || actionBar.classList.contains('hotbar-8slot') || (window.matchMedia('(pointer: coarse)').matches && !fineHover);
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
            bindReliableAction(actionMoreBtn, (ev) => {
                const isHh = Boolean(window.DeviceProfile?.isHandheld?.() || window.innerWidth <= 900);
                if (isHh || !('commandForElement' in HTMLButtonElement.prototype)) toggleDrawer(ev);
            });

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
        }

        const guideHudBtn = document.getElementById('btn-guide-hud');
        if (guideHudBtn) {
            guideHudBtn.addEventListener('click', (ev) => {
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.__app && window.__app.showGuide) window.__app.showGuide(1, 'game');
            });
        }
        const quickHelpBtn = document.getElementById('btn-quick-help');
        if (quickHelpBtn) {
            quickHelpBtn.addEventListener('click', (ev) => {
                if (ev && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
                if (window.__app && window.__app.showGuide) window.__app.showGuide(1, 'game');
            });
        }

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

        bindClick('btn-tilt-up', () => { if (this.dungeon) this.dungeon.userPitchOffset = Math.min(1.25, (this.dungeon.userPitchOffset || 0) + 0.12); });
        bindClick('btn-tilt-reset', () => { if (this.dungeon) this.dungeon.userPitchOffset = 0.0; });
        bindClick('btn-tilt-down', () => { if (this.dungeon) this.dungeon.userPitchOffset = Math.max(-0.65, (this.dungeon.userPitchOffset || 0) - 0.12); });

        window.addEventListener('click', (e) => {
            if (e.target && e.target.closest && e.target.closest('#minimap-canvas, #grimoire-deck-container, #streetview-nav-rosette, #edge-turn-left, #edge-turn-right')) {
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

        this._bindFullscreenButtons();
        this._setupFullscreenSync();
    }

    setupTouchEvents() {
        const bindTouch = (id, action, allowRepeat = true) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            let holdTimer = null;
            let repeatInterval = null;

            const startAction = (e) => {
                if (e.cancelable) e.preventDefault();
                if (window.DeviceProfile) window.DeviceProfile.triggerHaptic('light');
                if (this.audio) this.audio.unlock();
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

        const sendDirectionalMove = (dir) => {
            if (this.dpadRunMode) {
                this.sendRunMove(dir);
            } else {
                const key = this.getRelativeDirectionKey(dir);
                if (key) this.sendMovementKey(key);
            }
        };

        bindTouch('dpad-turn-left', () => { this.dungeon.turn(-1); }, false);
        bindTouch('dpad-turn-right', () => { this.dungeon.turn(1); }, false);

        bindTouch('dpad-up', () => { sendDirectionalMove(8); }, true);
        bindTouch('dpad-down', () => { sendDirectionalMove(2); }, true);
        bindTouch('dpad-left', () => { sendDirectionalMove(4); }, true);
        bindTouch('dpad-right', () => { sendDirectionalMove(6); }, true);

        bindTouch('dpad-center', () => { this.triggerContextCenterAction(); }, false);

        bindTouch('sv-turn-left', () => {
            if (this.dungeon && typeof this.dungeon.turn === 'function') this.dungeon.turn(-1);
        }, false);
        bindTouch('sv-turn-right', () => {
            if (this.dungeon && typeof this.dungeon.turn === 'function') this.dungeon.turn(1);
        }, false);

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

        bindTouch('dpad-ul', () => { sendDirectionalMove(7); }, true);
        bindTouch('dpad-ur', () => { sendDirectionalMove(9); }, true);
        bindTouch('dpad-dl', () => { sendDirectionalMove(1); }, true);
        bindTouch('dpad-dr', () => { sendDirectionalMove(3); }, true);
    }

    getFeatAt(map, x, y) {
        if (!map || !map.rows) return 0;
        const row = map.rows[y];
        if (!row || !row.f) return 0;
        const idx = x * 2;
        if (idx >= row.f.length) return 0;
        return parseInt(row.f.substring(idx, idx + 2), 16) || 0;
    }

    isHostileMonster(m, frame) {
        if (!m || m.visible === false || m.ml === false) return false;
        if (m.captive || m.friendly || m.pet || m.isPet || m.peaceful || m.isPeaceful || m.hostile === false || m.is_hostile === false || /\((?:tame|pet|friendly|peaceful|chained)\)/i.test(m.name || m.race || '')) return false;
        const depth = frame?.player?.depth || 0;
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((typeof window !== 'undefined' && window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : (frame?.realm || 'angband'));
        if (depth === 0 && realm !== 'silq') {
            const isDamaged = (typeof m.hp === 'number' && typeof m.hp_max === 'number' && m.hp < m.hp_max);
            const hasHostileFlag = Boolean(m.hostile || m.is_hostile || (m.status && /hostile|anger|alert/i.test(m.status)));
            return isDamaged || hasHostileFlag;
        }
        return true;
    }

    canPlayerShootRanged(frame) {
        if (!frame || !frame.player) return false;
        const player = frame.player;
        const realm = (this.app && typeof this.app.getActiveRealm === 'function')
            ? this.app.getActiveRealm()
            : ((window.__app && typeof window.__app.getActiveRealm === 'function') ? window.__app.getActiveRealm() : (frame.realm || 'angband'));
        const quiv = Array.isArray(player.quiver) ? player.quiver : [];
        if ((realm === 'brogue' || realm === 'rogue' || realm === 'dcss' || realm === 'nethack') && quiv.length > 0) return true;
        const isVanilla = realm === 'angband';
        const eq = Array.isArray(player.equipment) ? player.equipment : [];
        const hasBowEquipped = Boolean(player.bow_item) || eq.some((it) => /\b(bow|longbow|shortbow|crossbow|sling)\b/i.test(String((it && it.name) || '')) || /(ボウ|スリング|弓)/.test(String((it && it.name) || '')) || Number(it && it.tval) === (isVanilla ? 5 : 19));
        if (!hasBowEquipped) return false;

        const hasEquipAmmo = eq.some((it) => /\b(arrow|bolt|shot|pebble|seeker|sheaf)\b/i.test(String((it && it.name) || '')) || (!isVanilla && (Number(it && it.tval) >= 16 && Number(it && it.tval) <= 18)));
        const inv = Array.isArray(player.inventory) ? player.inventory : [];
        const hasInvAmmo = inv.some((it) => {
            const tval = Number(it && it.tval) || 0;
            const isAmmoTval = isVanilla ? (tval >= 2 && tval <= 4) : (tval >= 16 && tval <= 18);
            const lower = String((it && it.name) || '').toLowerCase();
            return isAmmoTval || (/\b(arrow|bolt|shot|pebble|seeker|sheaf)\b/.test(lower) && !/\b(bow|crossbow|sling)\b/.test(lower));
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
            const featDef = (this.dungeon && this.dungeon.featureDefs) ? this.dungeon.featureDefs[feat] : null;
            const rowObj = (frame.map.rows && frame.map.rows[ry]) ? frame.map.rows[ry] : null;
            const ch = (rowObj && rowObj.g && rx >= 0 && rx < rowObj.g.length) ? rowObj.g[rx] : ' ';
            const isTrap = ch === '^' || (featDef && /trap/i.test(featDef.name || ''));
            if (isTrap && d === 1) {
                return { type: 'trap', feat, dist: d, x: rx, y: ry };
            }
            const isDoor = feat === 2 || ch === '+' || (featDef && (featDef.isDoor || /door/i.test(featDef.name || '')));
            if (isDoor) {
                return { type: 'door', feat, dist: d, x: rx, y: ry };
            }
            const isTunnelable = (feat === 17 || feat === 18) || (ch === ':' && feat !== 32) || ch === '%' || (featDef && (featDef.isTunnelable || /rubble|vein/i.test(featDef.name || '')));
            if (isTunnelable) {
                return { type: 'wall', feat, dist: d, x: rx, y: ry };
            }
            if (feat === 1 || (feat >= 15 && feat <= 22) || feat === 30 || (featDef && (featDef.isWall || featDef.blocksLos))) {
                break;
            }
        }
        return null;
    }

    executeSmartAction(action) {
        const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
        const dispatcher = (this.app && this.app.dispatcher) || (window.__app && window.__app.dispatcher);

        if (action === 'descend') {
            if (this.audio) this.audio.playStairs(true);
            if (dispatcher && typeof dispatcher.run === 'function') dispatcher.run({ sequence: ['>'] });
            else this.network.sendKey('>');
        } else if (action === 'ascend') {
            if (this.audio) this.audio.playStairs(false);
            if (dispatcher && typeof dispatcher.run === 'function') dispatcher.run({ sequence: ['<'] });
            else this.network.sendKey('<');
        } else if (action === 'door' || action === 'open-door') {
            if (this.audio) this.audio.playDoor();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            if (dispatcher && typeof dispatcher.run === 'function') {
                dispatcher.run({ verb: 'open', dir: fwdKey });
            } else {
                this._pendingFollowUp = fwdKey;
                const openKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey ? RealmKeys.realmKey('open', realm) : null) || 'o';
                this.network.sendKey(openKey);
            }
        } else if (action === 'smithing') {
            if (this.audio && typeof this.audio.playMenuOpen === 'function') this.audio.playMenuOpen();
            this.network.sendKey('0');
        } else if (action === 'pray') {
            if (this.audio && typeof this.audio.playMenuOpen === 'function') this.audio.playMenuOpen();
            this.network.sendKey('p');
        } else if (action === 'fountain') {
            if (this.audio && typeof this.audio.playQuaff === 'function') this.audio.playQuaff();
            this.network.sendKey('q');
        } else if (action === 'free-ally') {
            if (this.audio) this.audio.playWhoosh();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey(fwdKey);
        } else if (action === 'disarm') {
            if (this.audio && typeof this.audio.playTrapDisarm === 'function') this.audio.playTrapDisarm();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            if (dispatcher && typeof dispatcher.run === 'function') dispatcher.run({ verb: 'disarm', dir: fwdKey });
            else { this._pendingFollowUp = fwdKey; this.network.sendKey('D'); }
        } else if (action === 'tunnel') {
            if (this.audio && typeof this.audio.playWallBump === 'function') this.audio.playWallBump(0.9);
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            if (dispatcher && typeof dispatcher.run === 'function') dispatcher.run({ verb: 'tunnel', dir: fwdKey });
            else {
                this._pendingFollowUp = fwdKey;
                const tunnelKey = (typeof ActionCatalog !== 'undefined' && ActionCatalog.getKey ? ActionCatalog.getKey('tunnel', realm) : null) || 'T';
                this.network.sendKey(tunnelKey);
            }
        } else if (action === 'pickup') {
            if (this.audio) this.audio.playItemPickup();
            const pickupKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey ? RealmKeys.realmKey('pickup', realm) : null) || 'g';
            if (dispatcher && typeof dispatcher.run === 'function') dispatcher.run({ verb: 'pickup' });
            else this.network.sendKey(pickupKey);
        } else if (action === 'shoot') {
            if (this.audio) this.audio.playWhoosh();
            const fireKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey ? RealmKeys.realmKey('fire', realm) : null) || 'f';
            if (dispatcher && typeof dispatcher.run === 'function') dispatcher.run({ verb: 'fire', target: 'nearest' });
            else this.network.sendKey(fireKey);
        } else if (action === 'attack') {
            if (this.dungeon && typeof this.dungeon.triggerAttackAnimation === 'function') this.dungeon.triggerAttackAnimation();
            if (this.audio) this.audio.playWhoosh();
            const fwdKey = this.getRelativeDirectionKey(8) || 'up';
            this.network.sendKey(fwdKey);
        } else {
            const holdKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? (RealmKeys.realmKey('hold', realm) || ',') : ',';
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

    getFacingForward() {
        const rawYaw = (this.dungeon && typeof this.dungeon.yaw === 'number')
            ? this.dungeon.yaw
            : ((this.dungeon && typeof this.dungeon.facing === 'number') ? -(this.dungeon.facing * (Math.PI / 2)) : 0);
        const normYaw = ((-rawYaw) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const offsets = [{ dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }];
        return { sector, normYaw, fwd: offsets[sector] || { dx: 0, dy: -1 } };
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
        // Dead per-frame walkability/monster scan on permanently hidden .sv-chevron-disc removed per CMD-P2-09.
        // #sv-turn-left and #sv-turn-right turn paddles remain bound in setupTouchEvents.
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

        const realm = frame.realm || (this.app && typeof this.app.getActiveRealm === 'function' && this.app.getActiveRealm()) || 'angband';
        const charName = (frame.player && frame.player.name) || '';
        if (realm !== this._lastRealm || (charName && charName !== this._lastCharName)) {
            this._lastRealm = realm;
            this._lastCharName = charName;
            const qa = this.quickActions || (this.app && this.app.quickActions) || (typeof window !== 'undefined' && window.__app && window.__app.quickActions);
            if (qa && typeof qa.resetForCharacter === 'function') {
                qa.resetForCharacter(realm, charName);
            }
        }

        if (this._pendingMoreMove && frame.ui && !frame.ui.more) {
            const pending = this._pendingMoreMove;
            this._pendingMoreMove = null;
            if (pending.isRun) this.sendRunMove(pending.dir);
            else if (pending.moveKey) this.sendMovementKey(pending.moveKey);
        }
        if (this._pendingFollowUp && frame.ui && !frame.ui.more) {
            const nextKey = this._pendingFollowUp;
            this._pendingFollowUp = null;
            this.network.sendKey(nextKey);
        }
        if (this._pendingFollowUpKey && frame.ui && !frame.ui.more) {
            const nextKey = this._pendingFollowUpKey;
            this._pendingFollowUpKey = null;
            this.network.sendKey(nextKey);
        }
        if (this._pendingMoreAction && frame.ui && !frame.ui.more) {
            const cb = this._pendingMoreAction;
            this._pendingMoreAction = null;
            cb();
        }

        const smart = this.resolveSmartAction(frame);
        this.smartAction = smart.id;

        // Gate DOM updates on state signature (L25)
        const rawYaw = (this.dungeon && typeof this.dungeon.yaw === 'number') ? this.dungeon.yaw : 0;
        const normYaw = ((-rawYaw) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const sector = Math.round(normYaw / (Math.PI / 4)) % 8;
        const inPlay = Boolean(frame && (frame.phase === 'play' || (frame.player && frame.player.name)));
        const inTerminalOverlay = Boolean(frame.ui && (frame.ui.overlay || 0) > 0) ||
                                 Boolean(window.__app && window.__app.needsTerminal && window.__app.needsTerminal(frame)) ||
                                 this.inTerminal;
        const isCBridgeDead = ['angband', 'silq', 'frogcomposband', 'hengband'].includes(realm) ? (player.hp < 0) : (player.hp <= 0);
        const isDead = Boolean(player.dead || (player.hp !== undefined && isCBridgeDead && player.hp_max > 0));

        const screenText = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function')
            ? window.ScreenContext.screenTextOf(frame)
            : (frame.term && frame.term.rows ? frame.term.rows.map(r => r.g || '').join('\n').toLowerCase() : '');
        const isTargetingPrompt = (window.ScreenContext && typeof window.ScreenContext.inputTargetingPrompt === 'function')
            ? window.ScreenContext.inputTargetingPrompt(screenText, inPlay)
            : false;

        const sig = `${px},${py},${player.depth || 0}:${sector}:${smart.id}:${smart.key}:${smart.text}:${inPlay}:${inTerminalOverlay}:${isDead}:${isTargetingPrompt}`;
        if (sig === this._lastCtxControlsSig) {
            return;
        }
        this._lastCtxControlsSig = sig;

        const dpadCenter = document.getElementById('dpad-center');
        if (dpadCenter) {
            dpadCenter.textContent = smart.icon;
            dpadCenter.title = smart.title;
            dpadCenter.classList.toggle('smart-active', smart.id !== 'wait');
            dpadCenter.classList.toggle('smart-stairs', smart.id === 'descend' || smart.id === 'ascend');
            dpadCenter.classList.toggle('smart-door', smart.id === 'door');
            dpadCenter.classList.toggle('smart-attack', smart.id === 'attack');
        }

        const btnHero = document.getElementById('btn-hero-action');
        if (btnHero) {
            const heroIcon = document.getElementById('hero-action-icon');
            const heroText = document.getElementById('hero-action-text');
            const heroKey = document.getElementById('hero-action-key');
            const jpHero = (typeof window !== 'undefined' && window.__activeRealm === 'hengband' && window.__langMode === 'jp')
                ? ({ wait: '待機', attack: '攻撃', descend: '降りる', ascend: '昇る', pickup: '拾う', door: '扉', shoot: '射撃' }[smart.id] || smart.text)
                : smart.text;
            if (heroIcon) heroIcon.textContent = smart.icon;
            if (heroText) heroText.textContent = jpHero;
            if (heroKey) heroKey.textContent = smart.key;
            btnHero.title = smart.title;
            btnHero.setAttribute('data-action', smart.id);
            btnHero.classList.toggle('action-suggested', smart.id !== 'wait');
        }

        const btnAttack = document.getElementById('btn-attack');
        if (btnAttack) {
            const hideAttack = (btnHero && btnHero.style.display !== 'none' && smart.id === 'attack') || btnAttack.dataset.contextHidden === '1' || btnAttack.dataset.realmHidden === '1';
            btnAttack.style.display = hideAttack ? 'none' : '';
        }

        if (typeof this.updateContextButtons === 'function') {
            this.updateContextButtons(frame);
        }
        const hudRef = this.hud || (this.app && this.app.hud) || (window.__app && window.__app.hud);
        if (hudRef && typeof hudRef.updateReticleTargetCard === 'function') {
            hudRef.updateReticleTargetCard(frame);
        }

        const reticle = document.getElementById('diegetic-reticle');
        if (reticle) {
            if (inPlay && !inTerminalOverlay && !isDead) {
                reticle.style.display = 'flex';
                reticle.classList.toggle('reticle-targeted', smart.id === 'attack' || smart.id === 'shoot');
                reticle.classList.toggle('reticle-interactive', smart.id !== 'attack' && smart.id !== 'shoot' && smart.id !== 'wait');
            } else {
                reticle.style.display = 'none';
            }
        }

        const rosette = document.getElementById('directional-aim-rosette');
        if (rosette) {
            if (isTargetingPrompt && inPlay && !inTerminalOverlay && !isDead) {
                rosette.classList.remove('hidden');
            } else {
                rosette.classList.add('hidden');
            }
            const sectorToDir = [8, 9, 6, 3, 2, 1, 4, 7];
            const activeDir = sectorToDir[sector] || 8;
            const sectors = rosette.querySelectorAll('.rosette-sector');
            sectors.forEach(sec => {
                sec.classList.toggle('active-yaw', parseInt(sec.dataset.dir, 10) === activeDir);
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

            if (Math.hypot(clientX - startX, clientY - startY) > 6) {
                const cap = document.getElementById('cursor-action-pill');
                if (cap) cap.classList.add('hidden');
                if (canvas.style.cursor !== 'grabbing') canvas.style.cursor = 'grabbing';
                if (window.chronicleManager && typeof window.chronicleManager.dismissEntityPopover === 'function') {
                    window.chronicleManager.dismissEntityPopover();
                }
            }

            if (this.dungeon && typeof this.dungeon.rotateFreelook === 'function') {
                const deltaYaw = -1 * dx * 0.0055;
                const multY = this.invertDragLook ? -1 : 1;
                const deltaPitch = multY * dy * 0.0035;
                this.dungeon.rotateFreelook(deltaYaw, deltaPitch);
            }
        };

        let longPressTimer = null;
        let longPressFired = false;

        const openEntityInspectAt = (cx, cy) => {
            const cap = document.getElementById('cursor-action-pill');
            if (cap) cap.classList.add('hidden');
            if (!this.dungeon || this.inTerminal) return false;
            const frame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || this.dungeon.lastFrame;
            const monster = (typeof this.dungeon.getMonsterAtScreenCoords === 'function') ? this.dungeon.getMonsterAtScreenCoords(cx, cy) : null;
            if (monster && window.chronicleManager && typeof window.chronicleManager.interactWithCreature === 'function') {
                window.chronicleManager.interactWithCreature(monster, { mode: 'popover', clientX: cx, clientY: cy });
                return true;
            }
            const item = (typeof this.dungeon.getItemAtScreenCoords === 'function') ? this.dungeon.getItemAtScreenCoords(cx, cy) : null;
            if (item && window.chronicleManager && typeof window.chronicleManager.inspectObject === 'function') {
                window.chronicleManager.inspectObject(item, { mode: 'popover', clientX: cx, clientY: cy });
                return true;
            }
            if (typeof this.dungeon.getTileAtScreenCoords === 'function' && frame) {
                const hitTile = this.dungeon.getTileAtScreenCoords(cx, cy);
                if (hitTile) {
                    const monOnTile = (Array.isArray(frame.monsters) ? frame.monsters : []).find((m) => m && m.visible !== false && m.x === hitTile.x && m.y === hitTile.y);
                    if (monOnTile && window.chronicleManager && typeof window.chronicleManager.interactWithCreature === 'function') {
                        window.chronicleManager.interactWithCreature(monOnTile, { mode: 'popover', clientX: cx, clientY: cy });
                        return true;
                    }
                    const its = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);
                    const itemOnTile = its.find((it) => it && it.x === hitTile.x && it.y === hitTile.y);
                    if (itemOnTile && window.chronicleManager && typeof window.chronicleManager.inspectObject === 'function') {
                        window.chronicleManager.inspectObject(itemOnTile, { mode: 'popover', clientX: cx, clientY: cy });
                        return true;
                    }
                    const feat = this.dungeon.describeMapFeature?.(frame, hitTile.x, hitTile.y);
                    if (feat && window.chronicleManager?.showEntityPopover) {
                        window.chronicleManager.showEntityPopover('feature', feat, cx, cy);
                        return true;
                    }
                }
            }
            window.chronicleManager?.dismissEntityPopover?.();
            return false;
        };

        const clearLongPress = () => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        };

        const origOnStart = onStart;
        const startWithLongPress = (clientX, clientY, pointerId = null, isTouch = false) => {
            clearLongPress();
            longPressFired = false;
            origOnStart(clientX, clientY, pointerId);
            if (isTouch) {
                longPressTimer = setTimeout(() => {
                    if (isDragging && Math.hypot(lastX - startX, lastY - startY) < 16) {
                        if (openEntityInspectAt(lastX, lastY)) {
                            longPressFired = true;
                            isDragging = false;
                            activePointerId = null;
                        }
                    }
                }, 430);
            }
        };

        const onEnd = (endX = null, endY = null) => {
            clearLongPress();
            if (canvas.style.cursor === 'grabbing') canvas.style.cursor = '';
            if (longPressFired) { longPressFired = false; return; }
            if (!isDragging) return;
            isDragging = false;
            activePointerId = null;

            const finalX = endX !== null ? endX : lastX;
            const finalY = endY !== null ? endY : lastY;
            const elapsed = performance.now() - startTime;
            const totalDx = finalX - startX;
            const totalDy = finalY - startY;

            if (elapsed < 450 && Math.abs(totalDx) > 40 && Math.abs(totalDx) > Math.abs(totalDy) * 1.5) {
                if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') {
                    window.chronicleManager.preemptForGameplay('swipe_turn');
                }
                if (window.DeviceProfile && window.DeviceProfile.triggerHaptic) {
                    window.DeviceProfile.triggerHaptic('light');
                }
                if (this.dungeon && typeof this.dungeon.turn === 'function') {
                    this.dungeon.turn(totalDx > 0 ? 1 : -1);
                }
            } else if (elapsed < 380 && Math.abs(totalDx) < 18 && Math.abs(totalDy) < 18) {
                if (this.dungeon) {
                    const frame = (this.app && this.app.lastFrame) || (window.__app && window.__app.lastFrame) || this.dungeon.lastFrame;
                    const worldKeyMap = { '0,-1': 'up', '1,-1': 'pageup', '1,0': 'right', '1,1': 'pagedown', '0,1': 'down', '-1,1': 'end', '-1,0': 'left', '-1,-1': 'home' };
                    const realm = (window.__app && window.__app.getActiveRealm) ? window.__app.getActiveRealm() : 'angband';
                    if (this.isDirectionalTargeting() && frame && frame.player) {
                        const monster = (typeof this.dungeon.getMonsterAtScreenCoords === 'function') ? this.dungeon.getMonsterAtScreenCoords(finalX, finalY) : null;
                        const hitTile = (!monster && typeof this.dungeon.getTileAtScreenCoords === 'function') ? this.dungeon.getTileAtScreenCoords(finalX, finalY) : null;
                        const tx = monster ? monster.x : (hitTile ? hitTile.x : null), ty = monster ? monster.y : (hitTile ? hitTile.y : null);
                        if (tx !== null && ty !== null) {
                            const dxRaw = tx - frame.player.x, dyRaw = ty - frame.player.y;
                            const dx = Math.sign(dxRaw), dy = Math.sign(dyRaw);
                            const cheb = Math.max(Math.abs(dxRaw), Math.abs(dyRaw));
                            const on8Way = (dxRaw === 0 || dyRaw === 0 || Math.abs(dxRaw) === Math.abs(dyRaw));
                            if (cheb === 0) {
                                this.network.sendKey('.');
                            } else if (cheb > 1 && !on8Way && ['angband', 'silq', 'frogcomposband', 'hengband'].includes(realm) && cheb <= 24) {
                                const st = (window.ScreenContext && typeof window.ScreenContext.screenTextOf === 'function') ? window.ScreenContext.screenTextOf(frame) : '';
                                if (!/\btarget\b|\blook\b|'p'|\[p,|press '\?'/i.test(st)) this.network.sendKey('*');
                                this.network.sendKey('p');
                                let rx = dxRaw, ry = dyRaw;
                                while (rx !== 0 || ry !== 0) {
                                    const sx = Math.sign(rx), sy = Math.sign(ry);
                                    const sk = worldKeyMap[`${sx},${sy}`];
                                    if (!sk) break;
                                    this.network.sendKey(sk);
                                    rx -= sx; ry -= sy;
                                }
                                this.network.sendKey(realm === 'silq' ? 'f' : 't');
                            } else {
                                this.network.sendKey(worldKeyMap[`${dx},${dy}`] || (realm === 'silq' ? 'f' : 't'));
                            }
                            return;
                        }
                    }
                    if (window.chronicleManager && typeof window.chronicleManager.preemptForGameplay === 'function') window.chronicleManager.preemptForGameplay('canvas_click');
                    if (!this.inTerminal && frame && frame.player) {
                        const hitTile = (typeof this.dungeon.getTileAtScreenCoords === 'function') ? this.dungeon.getTileAtScreenCoords(finalX, finalY) : null;
                        const monster = ((typeof this.dungeon.getMonsterAtScreenCoords === 'function') ? this.dungeon.getMonsterAtScreenCoords(finalX, finalY) : null) ||
                            (hitTile && Array.isArray(frame.monsters) ? frame.monsters.find((m) => m && m.visible !== false && m.x === hitTile.x && m.y === hitTile.y) : null);
                        if (monster) {
                            const hostile = this.isHostileMonster(monster, frame);
                            const dxRaw = monster.x - frame.player.x, dyRaw = monster.y - frame.player.y;
                            const cheb = Math.max(Math.abs(dxRaw), Math.abs(dyRaw));
                            if (!hostile && cheb <= 2) { openEntityInspectAt(finalX, finalY); return; }
                            if (hostile && cheb === 1) {
                                const atkKey = worldKeyMap[`${Math.sign(dxRaw)},${Math.sign(dyRaw)}`];
                                if (atkKey) { this.sendMovementKey(atkKey); return; }
                            }
                            this.startMinimapAutoNav(monster.x, monster.y, frame, { stopAdjacent: true });
                            return;
                        }
                        const its = Array.isArray(frame.items) ? frame.items : (Array.isArray(frame.objects) ? frame.objects : []);
                        const item = ((typeof this.dungeon.getItemAtScreenCoords === 'function') ? this.dungeon.getItemAtScreenCoords(finalX, finalY) : null) ||
                            (hitTile ? its.find((it) => it && it.x === hitTile.x && it.y === hitTile.y) : null);
                        if (item) {
                            if (item.x === frame.player.x && item.y === frame.player.y) {
                                const gKey = (typeof RealmKeys !== 'undefined' && RealmKeys.realmKey) ? (RealmKeys.realmKey('pickup', realm) || 'g') : 'g';
                                this.network.sendKey(gKey);
                            } else {
                                this.startMinimapAutoNav(item.x, item.y, frame, { pickupOnArrival: this.autoPickupOnClick !== false });
                            }
                            return;
                        }
                        if (hitTile) {
                            if (hitTile.x === frame.player.x && hitTile.y === frame.player.y) {
                                const ch = frame.map?.rows?.[hitTile.y]?.g?.[hitTile.x];
                                if (ch === '>' || ch === '<') { this.network.sendKey(ch); return; }
                            }
                            this.startMinimapAutoNav(hitTile.x, hitTile.y, frame);
                        }
                    }
                }
            }
        };

        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const cap = document.getElementById('cursor-action-pill');
            if (cap) cap.classList.add('hidden');
            if (this.isDirectionalTargeting()) { this.network?.sendKey?.('escape'); return; }
            openEntityInspectAt(e.clientX, e.clientY);
        });

        canvas.addEventListener('pointerdown', (e) => {
            if (e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
            if (e.target && e.target.closest && e.target.closest('#quick-slot-bar, #quick-slot-popover, #minimap-canvas, #grimoire-deck-container, #streetview-nav-rosette')) return;
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            startWithLongPress(e.clientX, e.clientY, e.pointerId, e.pointerType === 'touch');
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

    _bindFullscreenButtons() {
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
        const ids = ['btn-global-fullscreen', 'btn-fullscreen', 'btn-term-fullscreen', 'btn-hh-fullscreen'];
        for (const id of ids) {
            const btn = document.getElementById(id);
            if (!btn || btn._fsBound) continue;
            btn._fsBound = true;
            btn.addEventListener('click', (ev) => {
                if (ev) {
                    if (ev._fsHandled) return;
                    ev._fsHandled = true;
                    if (typeof ev.preventDefault === 'function') ev.preventDefault();
                    if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    if (ev.currentTarget && typeof ev.currentTarget.blur === 'function') ev.currentTarget.blur();
                }
                if (this.audio && typeof this.audio.unlock === 'function') this.audio.unlock();
                if (window.DeviceProfile && typeof window.DeviceProfile.triggerHaptic === 'function') window.DeviceProfile.triggerHaptic('light');
                this.toggleFullscreen();
            });
        }
    }

    _setupFullscreenSync() {
        if (this._fsSyncBound || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
        this._fsSyncBound = true;
        this._wasFsActive = false;
        const onFsChange = () => this._syncFullscreenState();
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
        document.addEventListener('click', (ev) => {
            const target = ev && ev.target && typeof ev.target.closest === 'function'
                ? ev.target.closest('#btn-global-fullscreen, #btn-fullscreen, #btn-term-fullscreen, #btn-hh-fullscreen')
                : null;
            if (!target || ev._fsHandled) return;
            ev._fsHandled = true;
            if (typeof ev.preventDefault === 'function') ev.preventDefault();
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
            this._bindFullscreenButtons();
            if (typeof target.blur === 'function') target.blur();
            if (this.audio && typeof this.audio.unlock === 'function') this.audio.unlock();
            if (window.DeviceProfile && typeof window.DeviceProfile.triggerHaptic === 'function') window.DeviceProfile.triggerHaptic('light');
            this.toggleFullscreen();
        });
        this._syncFullscreenState();
    }

    _showFullscreenCoachmark() {
        const msg = 'Fullscreen active — press ` (backtick) to cancel menus without exiting fullscreen';
        const hud = (this.app && this.app.hud) || (window.__app && window.__app.hud);
        if (hud && typeof hud.showToast === 'function') {
            hud.showToast(msg);
        } else if (window.__app && typeof window.__app.showRealmToast === 'function') {
            window.__app.showRealmToast(msg);
        } else if (typeof document !== 'undefined' && document.body && typeof document.createElement === 'function') {
            let toast = document.getElementById('yasd-fs-coachmark');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'yasd-fs-coachmark';
                toast.className = 'realm-toast';
                toast.setAttribute('role', 'status');
                toast.setAttribute('aria-live', 'polite');
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.classList.add('show');
            clearTimeout(this._fsToastTimer);
            this._fsToastTimer = setTimeout(() => { if (toast) toast.classList.remove('show'); }, 3800);
        }
    }

    _syncFullscreenState() {
        if (typeof document === 'undefined') return;
        this._bindFullscreenButtons();
        const doc = document, elem = doc.documentElement;
        const nativeFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
        const dvhFs = Boolean(elem && elem.classList && elem.classList.contains('yasd-immersive-dvh'));
        const isFs = nativeFs || dvhFs;
        if (elem && elem.classList) elem.classList.toggle('yasd-fullscreen-active', isFs);
        const ids = ['btn-global-fullscreen', 'btn-fullscreen', 'btn-term-fullscreen', 'btn-hh-fullscreen'];
        for (const id of ids) {
            const btn = typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
            if (!btn) continue;
            if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-pressed', isFs ? 'true' : 'false');
            if (btn.classList) {
                btn.classList.toggle('is-fullscreen', isFs);
                btn.classList.toggle('active', isFs);
            }
            btn.title = isFs ? 'Exit Fullscreen [F11]' : 'Enter Fullscreen [F11]';
            const iconEl = typeof btn.querySelector === 'function' ? btn.querySelector('.fs-icon') : null;
            const labelEl = typeof btn.querySelector === 'function' ? btn.querySelector('.fs-label') : null;
            if (iconEl || labelEl) {
                if (iconEl) iconEl.textContent = isFs ? '⤓' : '⛶';
                if (labelEl) labelEl.textContent = isFs ? 'Exit Full' : 'Fullscreen';
            } else {
                if (!btn.dataset) btn.dataset = {};
                if (!btn.dataset.fsOrigText) btn.dataset.fsOrigText = (btn.textContent || '⛶').trim();
                const orig = btn.dataset.fsOrigText;
                const hasWords = /[a-z]/i.test(orig);
                btn.textContent = isFs ? (hasWords ? '⤓ Exit Full' : '⤓') : orig;
            }
        }
        if (!this._wasFsActive && isFs) this._showFullscreenCoachmark();
        this._wasFsActive = isFs;
    }

    toggleFullscreen() {
        const doc = document, elem = doc.documentElement;
        const nativeFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
        const dvhFs = Boolean(elem && elem.classList && elem.classList.contains('yasd-immersive-dvh'));
        const setDvhFallback = (active) => {
            if (elem && elem.classList) elem.classList.toggle('yasd-immersive-dvh', active);
            this._syncFullscreenState();
        };
        try {
            if (!nativeFs && !dvhFs) {
                const req = elem && (elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen);
                if (req) {
                    const p = req.call(elem);
                    if (p && typeof p.then === 'function') {
                        p.then(() => {
                            try { navigator?.keyboard?.lock?.(['Escape'])?.catch?.(() => {}); } catch (_) {}
                            this._syncFullscreenState();
                        }).catch(() => { setDvhFallback(true); });
                    } else {
                        this._syncFullscreenState();
                    }
                } else {
                    setDvhFallback(!dvhFs);
                }
            } else if (nativeFs) {
                const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
                if (exit) {
                    try { navigator?.keyboard?.unlock?.(); } catch (_) {}
                    const p = exit.call(doc);
                    if (p && typeof p.then === 'function') p.then(() => this._syncFullscreenState()).catch(() => this._syncFullscreenState());
                    else this._syncFullscreenState();
                }
                if (dvhFs && elem && elem.classList) elem.classList.remove('yasd-immersive-dvh');
            } else {
                setDvhFallback(false);
            }
        } catch (err) {
            console.warn('[Input] Fullscreen toggle error:', err);
            setDvhFallback(!dvhFs);
        }
    }

}

if (typeof window !== 'undefined') {
    window.InputController = InputController;
    window.InputManager = InputController;
    if (window.InputAutoNav && typeof window.InputAutoNav.attach === 'function') {
        window.InputAutoNav.attach(InputController);
    }
}
if (typeof module !== 'undefined' && module.exports) {
    try { require('./input-autonav.js').attach(InputController); } catch (_) {}
    module.exports = { InputController, InputManager: InputController };
}

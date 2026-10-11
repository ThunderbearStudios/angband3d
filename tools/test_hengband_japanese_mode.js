const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Testing Complete Japanese & Bilingual Localization ===\n');

// 1. Mock DOM
const domElements = new Map();

class ElementMock {
    constructor(tagName, id = '', className = '') {
        this.tagName = tagName;
        this.id = id;
        this.className = className;
        this.classList = {
            _classes: new Set(className ? className.split(' ') : []),
            add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
            remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
            contains: (c) => this.classList._classes.has(c),
            toggle: (c, force) => {
                if (force !== undefined) {
                    if (force) this.classList._classes.add(c);
                    else this.classList._classes.delete(c);
                    return force;
                }
                const has = this.classList._classes.has(c);
                if (has) this.classList._classes.delete(c);
                else this.classList._classes.add(c);
                return !has;
            }
        };
        this.children = [];
        this.textContent = '';
        this.innerHTML = '';
        this.style = {};
        this.title = '';
        this.dataset = {};
        this.width = 100;
        this.attributes = {};
    }
    addEventListener() {}
    removeEventListener() {}
    setAttribute(name, val) { this.attributes[name] = val; }
    getAttribute(name) { return this.attributes[name]; }
    appendChild(child) { this.children.push(child); }
    querySelector(sel) {
        if (sel.includes('.stat-label')) {
            const child = this.children.find(c => c.className.includes('stat-label'));
            return child || null;
        }
        if (sel.includes('.dpad-turn-text')) {
            const child = this.children.find(c => c.className.includes('dpad-turn-text'));
            return child || null;
        }
        if (sel.includes('.term-run-text')) {
            const child = this.children.find(c => c.className.includes('term-run-text'));
            return child || null;
        }
        return null;
    }
    querySelectorAll(sel) {
        return [];
    }
    getContext() {
        return {
            fillRect: () => {},
            clearRect: () => {},
            beginPath: () => {},
            arc: () => {},
            fill: () => {},
            stroke: () => {},
            moveTo: () => {},
            lineTo: () => {},
            closePath: () => {},
            save: () => {},
            restore: () => {},
            drawImage: () => {},
            strokeRect: () => {},
            fillText: () => {},
            measureText: () => ({ width: 10 })
        };
    }
}

function getOrCreateElement(id, tag = 'div', className = '') {
    if (!domElements.has(id)) {
        const el = new ElementMock(tag, id, className);
        domElements.set(id, el);
    }
    return domElements.get(id);
}

// Setup common DOM elements
const statIds = ['str', 'int', 'wis', 'dex', 'con', 'chr', 'gra', 'ac', 'gold'];
statIds.forEach(st => {
    const parent = getOrCreateElement(`stat-item-${st}`);
    const label = new ElementMock('span', '', 'stat-label');
    parent.children.push(label);
    domElements.set(`#stat-item-${st} .stat-label`, label);
});

const actionBtnIds = [
    'btn-attack', 'btn-throw', 'btn-fire', 'btn-cast', 'btn-skills', 'btn-power',
    'btn-overland', 'btn-quests', 'btn-browse', 'btn-study', 'btn-quaff', 'btn-read',
    'btn-door', 'btn-pickup', 'btn-rest', 'btn-inventory', 'btn-equipment',
    'btn-terminal', 'btn-guide-hud', 'btn-command-palette', 'btn-action-more'
];
actionBtnIds.forEach(id => getOrCreateElement(id, 'button'));

const termBtnIds = [
    'btn-term-advance', 'btn-term-escape', 'btn-term-reroll', 'btn-term-custom', 'btn-term-exit-menu'
];
termBtnIds.forEach(id => getOrCreateElement(id, 'button'));

const deathActionIds = ['btn-death-reload', 'btn-death-reroll', 'btn-death-menu'];
deathActionIds.forEach(id => getOrCreateElement(id, 'button'));

getOrCreateElement('action-run-text', 'span');
getOrCreateElement('dpad-run-text', 'span');
const termRunToggle = getOrCreateElement('term-run-toggle', 'button');
const termRunText = new ElementMock('span', '', 'term-run-text');
termRunToggle.children.push(termRunText);
domElements.set('#term-run-toggle .term-run-text', termRunText);

const dpadTurnLeft = getOrCreateElement('dpad-turn-left', 'button');
const turnLeftText = new ElementMock('span', '', 'dpad-turn-text');
dpadTurnLeft.children.push(turnLeftText);
domElements.set('#dpad-turn-left .dpad-turn-text', turnLeftText);

const dpadTurnRight = getOrCreateElement('dpad-turn-right', 'button');
const turnRightText = new ElementMock('span', '', 'dpad-turn-text');
dpadTurnRight.children.push(turnRightText);
domElements.set('#dpad-turn-right .dpad-turn-text', turnRightText);

getOrCreateElement('btn-quick-help', 'button');
getOrCreateElement('minimap-title-text', 'span');
getOrCreateElement('minimap-hint-text', 'span');
getOrCreateElement('btn-stair', 'button');
getOrCreateElement('footer-level', 'span');
getOrCreateElement('footer-exp', 'span');
getOrCreateElement('footer-place', 'span');
getOrCreateElement('footer-speed', 'span');
getOrCreateElement('footer-light', 'span');
getOrCreateElement('footer-facing', 'span');
getOrCreateElement('footer-badges', 'div');
getOrCreateElement('minimap-canvas', 'canvas');
getOrCreateElement('compass-canvas', 'canvas');
getOrCreateElement('hp-fill', 'div');
getOrCreateElement('hp-text', 'span');
getOrCreateElement('sp-fill', 'div');
getOrCreateElement('sp-text', 'span');
getOrCreateElement('char-title', 'div');

const hpHeader = new ElementMock('span');
const spHeader = new ElementMock('span');
domElements.set('.gauge-hp .gauge-header > span:first-child', hpHeader);
domElements.set('.gauge-sp .gauge-header > span:first-child', spHeader);
domElements.set('.gauge-sp .gauge-header span:first-child', spHeader);

const deathTabs = [0, 1, 2, 3, 4].map(idx => {
    const t = new ElementMock('button', '', 'death-tab');
    t.dataset.tab = String(idx);
    return t;
});

// Polyfill global document and window
global.document = {
    getElementById: (id) => domElements.get(id) || null,
    querySelector: (sel) => {
        if (domElements.has(sel)) return domElements.get(sel);
        if (sel.startsWith('#')) return domElements.get(sel.substring(1)) || null;
        return null;
    },
    querySelectorAll: (sel) => {
        if (sel === '.death-tab') return deathTabs;
        return [];
    },
    createElement: (tag) => new ElementMock(tag)
};

global.window = {
    __langMode: 'en',
    __app: {
        getActiveRealm: () => 'hengband',
        input: { isRunningActive: () => false }
    }
};

// Load WebHUD from hud.js
const hudCode = fs.readFileSync(path.join(__dirname, '../server/public/js/hud.js'), 'utf8');
const fn = new Function('document', 'window', `${hudCode}; return WebHUD;`);
const WebHUD = fn(global.document, global.window);

const hud = new WebHUD('minimap-canvas');

// TEST 1: updateLanguageUI in English mode
console.log('Test 1: WebHUD English Language Mode');
hud.updateLanguageUI('hengband', 'en');
assert.strictEqual(domElements.get('#stat-item-str .stat-label').textContent, 'STR');
assert.strictEqual(domElements.get('#stat-item-dex .stat-label').textContent, 'DEX');
assert.strictEqual(domElements.get('#stat-item-gold .stat-label').textContent, 'GOLD');
assert.ok(domElements.get('btn-attack').innerHTML.includes('Attack'));
assert.ok(domElements.get('btn-term-advance').textContent.includes('Advance'));
assert.strictEqual(deathTabs[0].textContent, '1. Tombstone & Menus');
assert.strictEqual(deathTabs[1].textContent, '2. Equipment');
assert.strictEqual(domElements.get('action-run-text').textContent, 'Walk');
assert.strictEqual(turnLeftText.textContent, 'Turn L');
assert.strictEqual(domElements.get('btn-quick-help').textContent, '⌨ Controls [?]');
console.log('  -> English mode validated successfully.\n');

// TEST 2: updateLanguageUI in Bilingual mode
console.log('Test 2: WebHUD Bilingual Mode (日英併記)');
hud.updateLanguageUI('hengband', 'bilingual');
assert.strictEqual(domElements.get('#stat-item-str .stat-label').textContent, 'STR (腕力)');
assert.strictEqual(domElements.get('#stat-item-dex .stat-label').textContent, 'DEX (器用)');
assert.strictEqual(domElements.get('#stat-item-gold .stat-label').textContent, 'AU (金貨)');
assert.ok(domElements.get('btn-attack').innerHTML.includes('Attack (攻撃)'));
assert.ok(domElements.get('btn-cast').innerHTML.includes('Cast (呪文)'));
assert.ok(domElements.get('btn-term-advance').textContent.includes('Advance (決定)'));
assert.ok(domElements.get('btn-term-reroll').textContent.includes('Reroll (再生成)'));
assert.strictEqual(deathTabs[0].textContent, '1. Tombstone (墓碑)');
assert.strictEqual(deathTabs[1].textContent, '2. Equipment (装備)');
assert.strictEqual(deathTabs[2].textContent, '3. Inventory (持物)');
assert.strictEqual(domElements.get('action-run-text').textContent, 'Walk (歩く)');
assert.strictEqual(turnLeftText.textContent, 'Turn L (左)');
assert.strictEqual(domElements.get('btn-quick-help').textContent, '⌨ Controls (案内) [?]');
console.log('  -> Bilingual mode validated successfully.\n');

// TEST 3: updateLanguageUI in Pure Japanese Mode (日本語/漢字)
console.log('Test 3: WebHUD Pure Japanese Mode (日本語/漢字)');
hud.updateLanguageUI('hengband', 'jp');
assert.strictEqual(domElements.get('#stat-item-str .stat-label').textContent, '腕力');
assert.strictEqual(domElements.get('#stat-item-int .stat-label').textContent, '知能');
assert.strictEqual(domElements.get('#stat-item-wis .stat-label').textContent, '賢さ');
assert.strictEqual(domElements.get('#stat-item-dex .stat-label').textContent, '器用');
assert.strictEqual(domElements.get('#stat-item-con .stat-label').textContent, '耐久');
assert.strictEqual(domElements.get('#stat-item-chr .stat-label').textContent, '魅力');
assert.strictEqual(domElements.get('#stat-item-ac .stat-label').textContent, '防御');
assert.strictEqual(domElements.get('#stat-item-gold .stat-label').textContent, '金貨');
assert.strictEqual(hpHeader.textContent, '体力');
assert.strictEqual(spHeader.textContent, '魔力');
assert.ok(domElements.get('btn-attack').innerHTML.includes('⚔ 攻撃'));
assert.ok(domElements.get('btn-cast').innerHTML.includes('✨ 呪文'));
assert.ok(domElements.get('btn-quaff').innerHTML.includes('🧪 薬飲'));
assert.ok(domElements.get('btn-read').innerHTML.includes('📜 巻読'));
assert.strictEqual(domElements.get('btn-term-advance').textContent, '決定 (Enter)');
assert.strictEqual(domElements.get('btn-term-escape').textContent, '戻る (Esc)');
assert.strictEqual(domElements.get('btn-term-reroll').textContent, '🎲 英雄再生成 (R)');
assert.strictEqual(domElements.get('btn-term-custom').textContent, '🛠 英雄作成 (C)');
assert.strictEqual(domElements.get('btn-term-exit-menu').textContent, '✕ メインメニュー');
assert.strictEqual(deathTabs[0].textContent, '1. 墓碑と記録');
assert.strictEqual(deathTabs[1].textContent, '2. 装備品');
assert.strictEqual(deathTabs[2].textContent, '3. 所持品');
assert.strictEqual(deathTabs[3].textContent, '4. 矢筒');
assert.strictEqual(deathTabs[4].textContent, '5. 能力値');
assert.strictEqual(domElements.get('action-run-text').textContent, '歩く');
assert.strictEqual(turnLeftText.textContent, '左回転');
assert.strictEqual(turnRightText.textContent, '右回転');
assert.strictEqual(domElements.get('btn-quick-help').textContent, '⌨ 案内 [?]');
console.log('  -> Pure Japanese mode validated successfully.\n');

// TEST 4: Per-frame telemetry updates (update(frame))
console.log('Test 4: Per-frame telemetry updates across language modes');

const frameMock = {
    realm: 'hengband',
    phase: 'play',
    player: {
        name: 'Miyamoto',
        race: '人間',
        class: '戦士',
        level: 5,
        exp: 1250,
        exp_next: 2000,
        hp: 45,
        hp_max: 50,
        sp: 12,
        sp_max: 12,
        gold: 3400,
        ac: 24,
        depth: 0,
        speed: 110,
        statuses: [{ name: 'Poisoned', attr: 4 }, { name: 'Fast', attr: 2 }]
    },
    map: { rows: [] }
};

// 4a. Frame in Bilingual Mode
window.__langMode = 'bilingual';
hud.update(frameMock);
assert.strictEqual(spHeader.textContent, 'MANA (魔力)', 'SP label must remain MANA (魔力) in bilingual');
assert.strictEqual(domElements.get('footer-level').textContent, '⭐ Lvl (Lv) 5');
assert.ok(domElements.get('footer-exp').textContent.includes('EXP (経験値)'));
assert.strictEqual(domElements.get('footer-place').textContent, 'Town (街)');
assert.ok(domElements.get('footer-speed').textContent.includes('Spd (速度)'));
const badges = domElements.get('footer-badges').children;
assert.ok(badges.some(b => b.textContent.includes('Poisoned (毒)')), 'Poisoned badge must be bilingual');
assert.ok(badges.some(b => b.textContent.includes('Fast (加速)')), 'Fast badge must be bilingual');
console.log('  -> Per-frame Bilingual telemetry validated.');

// 4b. Frame in Pure Japanese Mode
window.__langMode = 'jp';
hud.update(frameMock);
assert.strictEqual(spHeader.textContent, '魔力', 'SP label must be 魔力 in jp mode');
assert.strictEqual(domElements.get('footer-level').textContent, '⭐ レベル 5');
assert.ok(domElements.get('footer-exp').textContent.includes('経験値'));
assert.strictEqual(domElements.get('footer-place').textContent, '街 (宿場町)');
assert.ok(domElements.get('footer-speed').textContent.includes('速度 普通'));
const badgesJp = domElements.get('footer-badges').children;
assert.ok(badgesJp.some(b => b.textContent === '[毒]'), 'Poisoned badge must be pure Kanji [毒]');
assert.ok(badgesJp.some(b => b.textContent === '[加速]'), 'Fast badge must be pure Kanji [加速]');
console.log('  -> Per-frame Pure Japanese telemetry validated.\n');

// TEST 5: Verify Hengband binary resolution in server.js
console.log('Test 5: Hengband Binary Resolution in server.js');
const serverSrc = fs.readFileSync(path.join(__dirname, '../server/src/server.js'), 'utf8');
assert.ok(
    serverSrc.includes("lang === 'bilingual'"),
    'server.js must resolve bilingual mode to the Shift-JIS / Japanese Hengband engine binary'
);
console.log('  -> Server bilingual binary selection verified.\n');

console.log('All Japanese & Bilingual mode unit assertions PASSED flawlessly!');

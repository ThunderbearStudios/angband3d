const fs = require('fs');
const path = require('path');

console.log('Extracting Hengband translation dictionary...');

// 1. Monsters from MonraceDefinitions.jsonc
const monPath = path.resolve(__dirname, '../variants/hengband/lib/edit/MonraceDefinitions.jsonc');
const monContent = fs.readFileSync(monPath, 'utf8');
const monstersJaToEn = {};
const monstersEnToJa = {};

const monLines = monContent.split('\n');
let curJa = null, curEn = null, inName = false;
for (let i = 0; i < monLines.length; i++) {
    const line = monLines[i];
    if (line.includes('"name":')) {
        inName = true;
        curJa = null;
        curEn = null;
        continue;
    }
    if (inName) {
        const mJa = line.match(/"ja":\s*"([^"]+)"/);
        if (mJa) curJa = mJa[1];
        const mEn = line.match(/"en":\s*"([^"]+)"/);
        if (mEn) curEn = mEn[1];
        if (line.includes('}') || (curJa && curEn)) {
            if (curJa && curEn) {
                monstersJaToEn[curJa] = curEn;
                monstersEnToJa[curEn] = curJa;
            }
            inName = false;
        }
    }
}
console.log('Monsters extracted:', Object.keys(monstersJaToEn).length);

// 2. Base items & Artifacts
const itemsJaToEn = {};
const itemsEnToJa = {};
function extractItemDefs(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let cJa = null, cEn = null, inN = false;
    for (const line of lines) {
        if (line.includes('"name":')) {
            inN = true;
            cJa = null;
            cEn = null;
            continue;
        }
        if (inN) {
            const mJa = line.match(/"ja":\s*"([^"]+)"/);
            if (mJa) cJa = mJa[1];
            const mEn = line.match(/"en":\s*"([^"]+)"/);
            if (mEn) cEn = mEn[1];
            if (line.includes('}') || (cJa && cEn)) {
                if (cJa && cEn) {
                    itemsJaToEn[cJa] = cEn;
                    itemsEnToJa[cEn] = cJa;
                }
                inN = false;
            }
        }
    }
}
extractItemDefs(path.resolve(__dirname, '../variants/hengband/lib/edit/BaseitemDefinitions.jsonc'));
extractItemDefs(path.resolve(__dirname, '../variants/hengband/lib/edit/ArtifactDefinitions.jsonc'));
extractItemDefs(path.resolve(__dirname, '../variants/hengband/lib/edit/EgoDefinitions.jsonc'));
console.log('Items & artifacts extracted:', Object.keys(itemsJaToEn).length);

// 3. Terrains
const terrainsJaToEn = {};
const terrainsEnToJa = {};
function extractTerrainDefs(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let cJa = null, cEn = null, inN = false;
    for (const line of lines) {
        if (line.includes('"name":')) {
            inN = true;
            cJa = null;
            cEn = null;
            continue;
        }
        if (inN) {
            const mJa = line.match(/"ja":\s*"([^"]+)"/);
            if (mJa) cJa = mJa[1];
            const mEn = line.match(/"en":\s*"([^"]+)"/);
            if (mEn) cEn = mEn[1];
            if (line.includes('}') || (cJa && cEn)) {
                if (cJa && cEn) {
                    terrainsJaToEn[cJa] = cEn;
                    terrainsEnToJa[cEn] = cJa;
                }
                inN = false;
            }
        }
    }
}
extractTerrainDefs(path.resolve(__dirname, '../variants/hengband/lib/edit/TerrainDefinitions.jsonc'));
extractTerrainDefs(path.resolve(__dirname, '../variants/hengband/lib/edit/DungeonDefinitions.jsonc'));
console.log('Terrains & dungeons extracted:', Object.keys(terrainsJaToEn).length);

// 4. Monster speech messages from MonsterMessages.jsonc
const msgPath = path.resolve(__dirname, '../variants/hengband/lib/edit/MonsterMessages.jsonc');
const monsterSpeech = {};
if (fs.existsSync(msgPath)) {
    const msgContent = fs.readFileSync(msgPath, 'utf8');
    // Extract "ja": [ ... ], "en": [ ... ]
    const reJa = /"ja":\s*\[([\s\S]*?)\]/;
    const reEn = /"en":\s*\[([\s\S]*?)\]/;
    
    // Split into message objects
    const msgBlocks = msgContent.split('"action":');
    for (let b = 1; b < msgBlocks.length; b++) {
        const block = msgBlocks[b];
        const mJa = block.match(reJa);
        const mEn = block.match(reEn);
        if (mJa && mEn) {
            const parseArray = (str) => {
                const arr = [];
                const lines = str.split('\n');
                for (const l of lines) {
                    const m = l.match(/"((?:[^"\\]|\\.)*)"/);
                    if (m) arr.push(m[1].replace(/\\"/g, '"'));
                }
                return arr;
            };
            const listJa = parseArray(mJa[1]);
            const listEn = parseArray(mEn[1]);
            const count = Math.min(listJa.length, listEn.length);
            for (let k = 0; k < count; k++) {
                if (listJa[k] && listEn[k]) {
                    monsterSpeech[listJa[k]] = listEn[k];
                }
            }
        }
    }
    console.log('Monster speech lines extracted:', Object.keys(monsterSpeech).length);
}

// 5. C++ engine _("ja", "en") messages
const engineMsgs = {};
function walkFiles(dir, exts) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkFiles(fullPath, exts));
        } else if (exts.some(ext => file.endsWith(ext))) {
            results.push(fullPath);
        }
    }
    return results;
}

const cppFiles = walkFiles(path.resolve(__dirname, '../variants/hengband-src/src'), ['.c', '.cpp', '.h']);
const reUnderscore = /_\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g;

for (const file of cppFiles) {
    const code = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = reUnderscore.exec(code)) !== null) {
        const jaStr = match[1].replace(/\\"/g, '"');
        const enStr = match[2].replace(/\\"/g, '"');
        if (jaStr && enStr && jaStr.length > 1) {
            engineMsgs[jaStr] = enStr;
        }
    }
}
console.log('Engine _(ja, en) messages extracted:', Object.keys(engineMsgs).length);

// 6. Common gameplay phrase patterns (regex replacements)
const phrasePatterns = [
    { ja: /^(.*?)を倒した。$/i, en: 'You have slain $1.' },
    { ja: /^(.*?)を破壊した。$/i, en: 'You have destroyed $1.' },
    { ja: /^(.*?)を全滅させた！$/i, en: 'You have exterminated $1!' },
    { ja: /^(.*?)に命中した。$/i, en: 'You hit $1.' },
    { ja: /^(.*?)に大打撃を与えた！$/i, en: 'You strike $1 with great force!' },
    { ja: /^(.*?)に会心の一撃を与えた！$/i, en: 'Critical hit against $1!' },
    { ja: /^(.*?)に致命的な一撃を与えた！$/i, en: 'You score a fatal hit on $1!' },
    { ja: /^(.*?)は逃げ出した！$/i, en: '$1 flees in terror!' },
    { ja: /^(.*?)は恐怖から立ち直った。$/i, en: '$1 recovers its courage.' },
    { ja: /^(.*?)は怒り狂った！$/i, en: '$1 becomes enraged!' },
    { ja: /^(.*?)は眠ってしまった。$/i, en: '$1 falls asleep.' },
    { ja: /^(.*?)は目を覚ました。$/i, en: '$1 wakes up.' },
    { ja: /^(.*?)は混乱した！$/i, en: '$1 is confused!' },
    { ja: /^(.*?)は混乱から立ち直った。$/i, en: '$1 is no longer confused.' },
    { ja: /^(.*?)は麻痺した！$/i, en: '$1 is paralyzed!' },
    { ja: /^(.*?)の動きが止まった。$/i, en: '$1 stops moving.' },
    { ja: /^(.*?)は消滅した。$/i, en: '$1 disappeared.' },
    { ja: /^(.*?)は死んだ。$/i, en: '$1 is dead.' },
    { ja: /^(.*?)を拾った。$/i, en: 'You have $1.' },
    { ja: /^(.*?)を落とした。$/i, en: 'You drop $1.' },
    { ja: /^(.*?)を身につけた。$/i, en: 'You are wearing $1.' },
    { ja: /^(.*?)を装備した。$/i, en: 'You wield $1.' },
    { ja: /^(.*?)を外した。$/i, en: 'You took off $1.' },
    { ja: /^(.*?)を読んだ。$/i, en: 'You read $1.' },
    { ja: /^(.*?)を飲んだ。$/i, en: 'You drink $1.' },
    { ja: /^(.*?)を食べた。$/i, en: 'You eat $1.' },
    { ja: /^(.*?)を振った。$/i, en: 'You aim $1.' },
    { ja: /^(.*?)を使った。$/i, en: 'You use $1.' },
    { ja: /^(.*?)の発動に成功した！$/i, en: 'You activate $1!' },
    { ja: /^扉を開けた。$/i, en: 'You open the door.' },
    { ja: /^扉を閉めた。$/i, en: 'You close the door.' },
    { ja: /^階段を下りた。$/i, en: 'You enter a maze of down staircases.' },
    { ja: /^階段を上った。$/i, en: 'You enter a maze of up staircases.' },
    { ja: /^階段を下りる。$/i, en: 'You descend the staircase.' },
    { ja: /^階段を上る。$/i, en: 'You ascend the staircase.' },
    { ja: /^そこには階段はない。$/i, en: 'I see no staircase here.' },
    { ja: /^そこには扉はない。$/i, en: 'I see no door here.' },
    { ja: /^その方向には扉はない。$/i, en: 'There is no door in that direction.' },
    { ja: /^攻撃が外れた。$/i, en: 'You miss.' },
    { ja: /^攻撃をかわされた。$/i, en: 'Your attack is dodged.' },
    { ja: /^(.*?)の攻撃をかわした。$/i, en: 'You dodge the attack of $1.' },
    { ja: /^(.*?)の攻撃は外れた。$/i, en: '$1 misses you.' },
    { ja: /^何もない。$/i, en: 'There is nothing there.' },
    { ja: /^何も起こらなかった。$/i, en: 'Nothing happens.' },
    { ja: /^体力が回復した。$/i, en: 'You feel better.' },
    { ja: /^傷口が塞がった。$/i, en: 'Your wounds heal.' },
    { ja: /^毒が消えた。$/i, en: 'You are no longer poisoned.' },
    { ja: /^視界が元に戻った。$/i, en: 'You can see again.' },
    { ja: /^頭がすっきりした。$/i, en: 'You feel clear-headed.' },
    { ja: /^空腹を覚えた。$/i, en: 'You are getting hungry.' },
    { ja: /^飢え死にしそうだ！$/i, en: 'You are starving!' },
    { ja: /^レベルが上がった！$/i, en: 'Welcome to level up!' },
    { ja: /^おめでとう！レベル (.*?) に上がった！$/i, en: 'Congratulations! Welcome to level $1!' },
    { ja: /^呪文を唱えた。$/i, en: 'You cast a spell.' },
    { ja: /^祈りを捧げた。$/i, en: 'You pray.' },
    { ja: /^魔力が尽きている！$/i, en: 'You do not have enough mana.' },
    { ja: /^呪文の詠唱に失敗した！$/i, en: 'You failed to get the spell off!' }
];

const serializedPatterns = phrasePatterns.map(p => ({
    source: p.ja.source,
    flags: p.ja.flags,
    en: p.en
}));

const outObj = {
    monsters: monstersJaToEn,
    monstersEnToJa: monstersEnToJa,
    items: itemsJaToEn,
    itemsEnToJa: itemsEnToJa,
    terrains: terrainsJaToEn,
    terrainsEnToJa: terrainsEnToJa,
    monsterSpeech: monsterSpeech,
    engineMsgs: engineMsgs,
    patterns: serializedPatterns
};

const outJs = `// Auto-generated Hengband translation dictionary (Monsters, Items, Terrains, Messages)
(function(root) {
    const DATA = ${JSON.stringify(outObj)};
    
    // Compile regex patterns
    const compiledPatterns = (DATA.patterns || []).map(p => ({
        re: new RegExp(p.source, p.flags),
        en: p.en
    }));

    function getLocalizedMonsterName(name, realm, langMode) {
        if (!name) return '';
        if (realm !== 'hengband') return name;
        const mode = langMode || (typeof window !== 'undefined' && window.__langMode) || 'en';
        
        let en = DATA.monsters[name];
        let ja = DATA.monstersEnToJa[name];
        
        if (!en && !ja) {
            // Check prefix or suffixes like "乗用馬 'h'"
            for (const [jKey, eVal] of Object.entries(DATA.monsters)) {
                if (name.startsWith(jKey)) {
                    en = name.replace(jKey, eVal);
                    ja = jKey;
                    break;
                }
            }
        }
        
        if (!en && ja) {
            en = name;
        } else if (en && !ja) {
            ja = name;
        }

        if (!en) return name; // Unknown, return as-is

        if (mode === 'jp') {
            return ja || name;
        } else if (mode === 'bilingual') {
            return (ja && ja !== en) ? \`\${en} (\${ja})\` : en;
        } else {
            return en;
        }
    }

    function localizeGameMessage(msg, realm, langMode) {
        if (!msg || typeof msg !== 'string') return msg;
        if (realm !== 'hengband') return msg;
        const mode = langMode || (typeof window !== 'undefined' && window.__langMode) || 'en';
        if (mode === 'jp') return msg; // Keep native Japanese
        
        let text = msg.trim();
        let translated = null;

        // 1. Direct engine message match
        if (DATA.engineMsgs[text]) {
            translated = DATA.engineMsgs[text];
        } else if (DATA.monsterSpeech[text]) {
            translated = DATA.monsterSpeech[text];
        }

        // 2. Regex pattern templates
        if (!translated) {
            for (const pat of compiledPatterns) {
                if (pat.re.test(text)) {
                    translated = text.replace(pat.re, (match, p1, p2, p3) => {
                        let tP1 = p1 ? getLocalizedMonsterName(p1, 'hengband', 'en') : '';
                        if (tP1 === p1 && DATA.items[p1]) tP1 = DATA.items[p1];
                        let out = pat.en.replace('$1', tP1);
                        if (p2) out = out.replace('$2', p2);
                        if (p3) out = out.replace('$3', p3);
                        return out;
                    });
                    break;
                }
            }
        }

        // 3. Substring monster/item replacement if not fully matched
        if (!translated) {
            let replaced = text;
            for (const [ja, en] of Object.entries(DATA.monsters)) {
                if (ja.length >= 2 && replaced.includes(ja)) {
                    replaced = replaced.split(ja).join(en);
                }
            }
            if (replaced !== text) {
                translated = replaced;
            }
        }

        if (!translated) return msg;

        if (mode === 'bilingual') {
            return \`\${translated} (\${text})\`;
        }
        return translated;
    }

    const HENG_DICT = {
        data: DATA,
        getLocalizedMonsterName,
        localizeGameMessage
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HENG_DICT;
    } else {
        root.HENG_DICT = HENG_DICT;
        root.getLocalizedMonsterName = getLocalizedMonsterName;
        root.localizeGameMessage = localizeGameMessage;
    }
})(typeof window !== 'undefined' ? window : globalThis);
`;

const destPath = path.resolve(__dirname, '../server/public/js/heng-dict.js');
fs.writeFileSync(destPath, outJs, 'utf8');
console.log('Successfully written heng-dict.js to:', destPath, 'Size:', fs.statSync(destPath).size, 'bytes');

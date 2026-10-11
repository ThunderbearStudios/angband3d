const tdSjis = new TextDecoder('shift-jis');

function decodeHengbandText(str) {
    if (!str) return '';
    if (/[\u3000-\u9faf]/.test(str)) return str; // Already UTF-8 Japanese
    let hasSjis = false;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if ((code >= 0x81 && code <= 0x9f) || (code >= 0xe0 && code <= 0xfc)) {
            hasSjis = true;
            break;
        }
    }
    if (!hasSjis) return str;

    let result = '';
    for (let i = 0; i < str.length; i++) {
        const b1 = str.charCodeAt(i) & 0xff;
        if (((b1 >= 0x81 && b1 <= 0x9f) || (b1 >= 0xe0 && b1 <= 0xfc)) && i + 1 < str.length) {
            const b2 = str.charCodeAt(i + 1) & 0xff;
            try {
                result += tdSjis.decode(new Uint8Array([b1, b2]));
            } catch (_) {
                result += String.fromCharCode(b1, b2);
            }
            i++;
        } else if (b1 >= 0xa1 && b1 <= 0xdf) {
            try {
                result += tdSjis.decode(new Uint8Array([b1]));
            } catch (_) {
                result += String.fromCharCode(b1);
            }
        } else {
            result += String.fromCharCode(b1);
        }
    }
    return result;
}

const JP_TERM_TRANSLATIONS = {
    // Sex
    '女性': 'Female',
    '男性': 'Male',
    // Races
    '人間': 'Human',
    'ハーフエルフ': 'Half-Elf',
    'エルフ': 'Elf',
    'ホビット': 'Hobbit',
    'ノーム': 'Gnome',
    'ドワーフ': 'Dwarf',
    'ハーフオーク': 'Half-Orc',
    'ハーフトロル': 'Half-Troll',
    'ハーフトロール': 'Half-Troll',
    'アンバライト': 'Amberite',
    'ハイエルフ': 'High-Elf',
    '野蛮人': 'Barbarian',
    'ハーフオーガ': 'Half-Ogre',
    '半巨人': 'Half-Giant',
    '半タイタン': 'Half-Titan',
    'サイクロプス': 'Cyclops',
    'イーク': 'Yeek',
    'クラッコン': 'Klackon',
    'コボルド': 'Kobold',
    'ニーベルング': 'Nibelung',
    'ダークエルフ': 'Dark-Elf',
    'ドラコニアン': 'Draconian',
    'マインドフレア': 'Mindflayer',
    'インプ': 'Imp',
    'ゴーレム': 'Golem',
    '骸骨': 'Skeleton',
    'ゾンビ': 'Zombie',
    '吸血鬼': 'Vampire',
    '幽霊': 'Spectre',
    '妖精': 'Sprite',
    '獣人': 'Beastman',
    'エント': 'Ent',
    'アルコン': 'Archon',
    'バルログ': 'Balrog',
    'ドゥナダン': 'Dúnadan',
    '影フェアリー': 'Shadow-Fairy',
    'クター': 'Kutar',
    'アンドロイド': 'Android',
    'マーフォーク': 'Merfolk',
    // Classes
    '戦士': 'Warrior',
    'メイジ': 'Mage',
    'プリースト': 'Priest',
    '盗賊': 'Rogue',
    'レンジャー': 'Ranger',
    'パラディン': 'Paladin',
    '魔法戦士': 'Warrior-Mage',
    '混沌の戦士': 'Chaos-Warrior',
    '修行僧': 'Monk',
    '超能力者': 'Mindcrafter',
    'ハイ=メイジ': 'High-Mage',
    'ハイメイジ': 'High-Mage',
    '観光客': 'Tourist',
    'ものまね師': 'Imitator',
    '魔獣使い': 'Beastmaster',
    'スペルマスター': 'Sorcerer',
    'アーチャー': 'Archer',
    '魔道具術師': 'Magic-Eater',
    '吟遊詩人': 'Bard',
    '赤魔道師': 'Red-Mage',
    '剣術家': 'Swordsman',
    '練気術師': 'Ki-Master',
    '青魔道師': 'Blue-Mage',
    '騎兵': 'Cavalry',
    '狂戦士': 'Berserker',
    '鍛冶師': 'Weaponsmith',
    '鏡使い': 'Mirror-Master',
    '忍者': 'Ninja',
    'スナイパー': 'Sniper',
    '元素使い': 'Elementalist',
    // Personalities
    'ふつう': 'Ordinary',
    'ちからじまん': 'Strong',
    'きれもの': 'Clever',
    'しあわせもの': 'Lucky',
    'すばしっこい': 'Nimble',
    'いのちしらず': 'Fearless',
    'コンバット': 'Combatant',
    'なまけもの': 'Lazy',
    'セクシーギャル': 'Sexy',
    'がまんづよい': 'Patient',
    'いかさま': 'Trickster',
    'チャージマン': 'Chargeman',
    // Magic Realms
    '生命': 'Life',
    '仙術': 'Sorcery',
    '自然': 'Nature',
    'カオス': 'Chaos',
    '暗黒': 'Death',
    'トランプ': 'Trump',
    '秘術': 'Arcane',
    '匠': 'Craft',
    '悪魔': 'Daemon',
    '破邪': 'Crusade',
    // General
    'ランダム': 'Random',
    '決定': 'Accept',
    'やり直し': 'Reroll'
};

function parseOptionsFromLines(lines) {
    const options = [];
    const seen = new Set();

    const regexes = [
        /(?:^|\s+)\(([a-zA-Z0-9*@?])\)\s*([^\s\(\)\[\]]{1,20})?/g,
        /(?:^|\s+)\[([a-zA-Z0-9*@?])\]\s*([^\s\(\)\[\]]{1,20})?/g,
        /(?:^|\s+)([a-zA-Z0-9*@?])[\)\.\:\-]\s*([^\s\(\)\[\]]{1,20})?/g,
        /(?:^|\s+)(\*)\s*(ランダム|random|Random)/gi
    ];

    for (const rawLine of lines) {
        const line = decodeHengbandText(rawLine);
        // Exclude prompt instructions like "(a-b)" or "(a-C)" or "注意："
        if (line.includes('選んで下さい') || line.includes('注意：')) continue;

        for (const re of regexes) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(line)) !== null) {
                const key = m[1];
                let label = (m[2] || '').trim();
                // If label starts with a paren or bracket, strip it
                label = label.replace(/^[\(\[\{]/, '').replace(/[\)\]\}]$/, '');

                if (key && !seen.has(key)) {
                    seen.add(key);
                    let display = `[${key}]`;
                    if (label) {
                        const enTrans = JP_TERM_TRANSLATIONS[label];
                        if (enTrans) {
                            display = `[${key}] ${label} (${enTrans})`;
                        } else {
                            display = `[${key}] ${label}`;
                        }
                    } else if (key === '*') {
                        display = `[*] ランダム (Random)`;
                    }
                    options.push({ key, label, display });
                }
            }
        }
    }
    return options;
}

const sexTestLines = [
    "  性別を選んで下さい (a-b) ('='初期オプション設定):",
    "  a)女性         b)男性         *)ランダム",
    "  注意：《性別》の違いはゲーム上ほとんど影響を及ぼしません。"
];
console.log("Hengband Sex Options:");
parseOptionsFromLines(sexTestLines).forEach(o => console.log(' ', o.display));

const raceTestLines = [
    "  種族を選んで下さい (a-L) ('='初期オプション設定):",
    "  a)人間          b)ハーフエルフ  c)エルフ        d)ホビット      e)ノーム",
    "  f)ドワーフ      g)ハーフオーク  h)ハーフトロル  i)アンバライト  j)ハイエルフ",
    "  k)野蛮人        l)ハーフオーガ  m)半巨人        n)半タイタン    o)サイクロプス",
    "  J)クター        K)アンドロイド  L)マーフォーク  *)ランダム"
];
console.log("\nHengband Race Options:");
parseOptionsFromLines(raceTestLines).forEach(o => console.log(' ', o.display));

const classTestLines = [
    "  職業を選んで下さい (a-C) ('='初期オプション設定, 灰色:勝利済):",
    "  ()で囲まれた選択肢はこの種族には似合わない職業です。",
    "  a)戦士             b)メイジ           c)プリースト       d)盗賊",
    "  e)レンジャー       f)パラディン       g)魔法戦士         h)混沌の戦士",
    "  A)忍者             B)スナイパー       C)元素使い         *)ランダム"
];
console.log("\nHengband Class Options:");
parseOptionsFromLines(classTestLines).forEach(o => console.log(' ', o.display));

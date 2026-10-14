// server/public/js/heng/heng-translate.js
// HengTranslate Pure UMD Module — WS3.2
// High-performance, atomic translations for Hengband (JP -> EN, Bilingual)

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HengTranslate = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CJK = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/;

  let NAMES = null;       // { "ja": ["en1", "enN"] }
  let KINDS = [];         // [ { jaSuffix, en, tval }, ... ]
  let BUCKETS = null;     // { [bucketKey]: [ [pattern, enFormat, argTypes], ... ] }
  let OVERRIDES = {};     // { [ja]: en }
  const COMPILED_BUCKETS = new Map(); // bucketKey -> [ [RegExp, enFormat, argTypes], ... ]

  const lru = new Map();
  const LRU_MAX = 2000;

  function memo(key, fn) {
    if (lru.has(key)) {
      const v = lru.get(key);
      lru.delete(key);
      lru.set(key, v);
      return v;
    }
    const v = fn();
    lru.set(key, v);
    if (lru.size > LRU_MAX) {
      lru.delete(lru.keys().next().value);
    }
    return v;
  }

  // Visual width calculator (CJK = 2 columns, ASCII = 1 column)
  function visualWidth(str) {
    if (!str) return 0;
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.codePointAt(i);
      if ((c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
          (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff01 && c <= 0xff60) ||
          (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x20000 && c <= 0x3fffd)) {
        w += 2;
        if (c > 0xffff) i++;
      } else {
        w += 1;
      }
    }
    return w;
  }

  // Default row term overrides (L7 and core terminal screen terms)
  const RAW_DEFAULT_ROW_TERMS = [
    ['修正の合計値', 'Total Modifiers '],
    ['スコアに影響', 'Affects Score'],
    ['リターン:次', 'Return: Next'],
    ['リターンで次へ', 'Return: Next'],
    ['y/n:変更', 'y/n: Change'],
    ['y/n でセット', 'y/n: Set'],
    ['ESC:終了', 'ESC: Done'],
    ['ESC で決定', 'ESC: Done'],
    ['?:ヘルプ', '?: Help'],
    ['基本値', 'Base  '],
    ['合計値', 'Total '],
    ['最大値', 'Max   '],
    ['確率: 約', 'Chance: approx'],
    ['能力値決定', 'Stat Decision'],
    ['次の数値', 'Next Roll'],
    ['前の数値', 'Prev Roll'],
    ['初めから', 'Start Over'],
    ['決定する', 'Accept   '],
    ['ふつうのAdventurer', 'Ordinary Adventurer'],
    ['ふつうの', 'Ordinary '],
    ['しあわせものの', 'Lucky '],
    ['ちからじまんの', 'Strong '],
    ['きれものの', 'Clever '],
    ['すばしっこいの', 'Nimble '],
    ['いのちしらずの', 'Fearless '],
    ['コンバットの', 'Combat '],
    ['なまけものの', 'Lazy '],
    ['セクシーギャルの', 'Sexy '],
    ['がまんづよいの', 'Patient '],
    ['いかさまの', 'Trickster '],
    ['チャージマンの', 'Chargeman '],
    ['クローンの', 'Clone '],
    ['アンドロイドの', 'Android '],
    ['変愚蛮怒', 'Hengband'],
    ['キャラクターを作成します。', 'Make your character. '],
    ['能力値を抽選します。最低限得たい能力値を設定して下さい。', 'Set minimum stats for character generation. '],
    ['2/8で項目選択、4/6で値の増減、Enterで次へ', '2/8: Select, 4/6: Adjust, Enter: Next     '],
    ['()で囲まれた選択肢はこの種族には似合わない職業です。', 'Parenthesized choices are poorly suited for this race.   '],
    ['注意：《性別》の違いはゲーム上ほとんど影響を及ぼしません。', 'Note: Your \'sex\' has almost no effect on gameplay.       '],
    ['注意：《種族》によってキャラクターの先天的な資質やボーナスが変化します。', 'Note: Your \'race\' determines intrinsic traits and bonuses. '],
    ['注意：《職業》によってキャラクターの先天的な能力やボーナスが変化します。', 'Note: Your \'class\' determines abilities, skills, and spells.'],
    ['注意：《性格》によってキャラクターの能力やボーナスが変化します。', 'Note: Your \'trait\' modifies your core stats and abilities. '],
    ['性別を選んで下さい (a-b) (\'=\'初期オプション設定):', 'Choose a sex (a-b) (\'=\' for options):            '],
    ['性別を選んで下さい', 'Choose character\'s sex     '],
    ['種族を選んで下さい (a-L) (\'=\'初期オプション設定):', 'Choose a race (a-L) (\'=\' for options):           '],
    ['種族を選んで下さい', 'Choose character\'s race    '],
    ['職業を選んで下さい (a-C) (\'=\'初期オプション設定, 灰色:勝利済):', 'Choose a class (a-C) (\'=\' for options, Grey: Won):   '],
    ['職業を選んで下さい', 'Choose character\'s class   '],
    ['性格を選んで下さい (a-m) (\'=\'初期オプション設定):', 'Choose a trait (a-m) (\'=\' for options):          '],
    ['性格を選んで下さい', 'Choose character\'s trait   '],
    ['魔法領域を選んで下さい (a-j):', 'Choose magic realm (a-j):             '],
    ['魔法領域を選んで下さい', 'Choose magic realm         '],
    ['領域を選んで下さい', 'Choose magic realm     '],
    ['この数値に決定しますか？', 'Accept these stats? [y/n] '],
    ['名前を入力して下さい', 'Enter character\'s name    '],
    ['生い立ちを表示します。何かキーを押して下さい。', 'Displaying character history. Press any key.     '],
    ['生い立ちを表示します', 'Display character history  '],
    ['何かキーを押して下さい', 'Press any key to continue'],
    ['ゲームを開始します。よろしいですか？', 'Begin game. Are you sure? [y/n] '],
    ['ゲームを開始します。', 'Begin game.              '],
    ['よろしいですか？[y/n]', 'Are you sure? [y/n]     '],
    ['よろしいですか？[Y/n]', 'Are you sure? [y/n]     '],
    ['よろしいですか？', 'Are you sure? '],
    ['本当に終了しますか？', 'Really quit? [y/n]   '],
    ['本当にセーブして終了しますか？', 'Save and quit? [y/n]          '],
    ['辺境の地', 'Outpost '],
    ['宿場町', 'Outpost'],
    ['街 (宿場町)', 'Town (Outpost)'],
    ['狂乱', 'Berserk'],
    ['地上', 'Surface'],
    ['普通', 'Normal'],
    ['速度 普通', 'Speed Normal'],
    ['経験値', 'Exp '],
    ['学習', 'Study'],
    ['腕力', 'STR '],
    ['知能', 'INT '],
    ['賢さ', 'WIS '],
    ['器用', 'DEX '],
    ['耐久', 'CON '],
    ['魅力', 'CHR '],
    ['打撃', 'AC  '],
    ['射撃', 'SHT '],
    ['防御', 'DEF '],
    ['経験', 'EXP '],
    ['最大', 'MAX '],
    ['必要', 'NEED'],
    ['レベル', 'LEVEL'],
    ['ＨＰ', 'HP  '],
    ['ＭＰ', 'SP  '],
    ['所持金', 'AU    '],
    ['日付', 'DAY '],
    ['時刻', 'TIME'],
    ['ターン', 'TURN '],
    ['名前', 'Name'],
    ['性別', 'Sex '],
    ['種族', 'Race'],
    ['職業', 'Class'],
    ['性格', 'Trait'],
    ['魔法領域', 'Realm   '],
    ['領域', 'Realm'],
    ['魔法', 'Magic '],
    ['年齢', 'Age '],
    ['才', '  '],
    ['身長', 'Height'],
    ['体重', 'Weight'],

    // Birth options (sex, race, class, personality, magic realms)
    ['女性', 'Female'], ['男性', 'Male'],
    ['人間', 'Human'], ['ハーフエルフ', 'Half-Elf'], ['エルフ', 'Elf'], ['ホビット', 'Hobbit'], ['ノーム', 'Gnome'],
    ['ドワーフ', 'Dwarf'], ['ハーフオーク', 'Half-Orc'], ['ハーフトロル', 'Half-Troll'], ['ハーフトロール', 'Half-Troll'],
    ['アンバライト', 'Amberite'], ['ハイエルフ', 'High-Elf'], ['野蛮人', 'Barbarian'], ['ハーフオーガ', 'Half-Ogre'],
    ['半巨人', 'Half-Giant'], ['半タイタン', 'Half-Titan'], ['サイクロプス', 'Cyclops'], ['イーク', 'Yeek'],
    ['クラッコン', 'Klackon'], ['コボルド', 'Kobold'], ['ニーベルング', 'Nibelung'], ['ダークエルフ', 'Dark-Elf'],
    ['ドラコニアン', 'Draconian'], ['マインドフレア', 'Mindflayer'], ['インプ', 'Imp'], ['ゴーレム', 'Golem'],
    ['骸骨', 'Skeleton'], ['ゾンビ', 'Zombie'], ['吸血鬼', 'Vampire'], ['幽霊', 'Spectre'], ['妖精', 'Sprite'],
    ['獣人', 'Beastman'], ['エント', 'Ent'], ['アルコン', 'Archon'], ['バルログ', 'Balrog'], ['ドゥナダン', 'Dúnadan'],
    ['影フェアリー', 'Shadow-Fairy'], ['クター', 'Kutar'], ['アンドロイド', 'Android'], ['マーフォーク', 'Merfolk'],
    ['戦士', 'Warrior'], ['メイジ', 'Mage'], ['プリースト', 'Priest'], ['盗賊', 'Rogue'], ['レンジャー', 'Ranger'],
    ['パラディン', 'Paladin'], ['魔法戦士', 'Warrior-Mage'], ['混沌の戦士', 'Chaos-Warrior'], ['修行僧', 'Monk'],
    ['超能力者', 'Mindcrafter'], ['ハイ=メイジ', 'High-Mage'], ['ハイメイジ', 'High-Mage'], ['観光客', 'Tourist'],
    ['ものまね師', 'Imitator'], ['魔獣使い', 'Beastmaster'], ['スペルマスター', 'Sorcerer'], ['アーチャー', 'Archer'],
    ['魔道具術師', 'Magic-Eater'], ['吟遊詩人', 'Bard'], ['赤魔道師', 'Red-Mage'], ['剣術家', 'Swordsman'],
    ['練気術師', 'Ki-Master'], ['青魔道師', 'Blue-Mage'], ['騎兵', 'Cavalry'], ['狂戦士', 'Berserker'],
    ['バーサーカー', 'Berserker'],
    ['鍛冶師', 'Weaponsmith'], ['鏡使い', 'Mirror-Master'], ['忍者', 'Ninja'], ['スナイパー', 'Sniper'],
    ['元素使い', 'Elementalist'],
    ['ふつう', 'Ordinary'], ['ちからじまん', 'Strong'], ['きれもの', 'Clever'], ['しあわせもの', 'Lucky'],
    ['すばしっこい', 'Nimble'], ['いのちしらず', 'Fearless'], ['コンバット', 'Combatant'], ['なまけもの', 'Lazy'],
    ['セクシーギャル', 'Sexy'], ['がまんづよい', 'Patient'], ['いかさま', 'Trickster'], ['チャージマン', 'Chargeman'],
    ['ラッキーマン', 'Lucky-Man'],
    ['生命', 'Life'], ['仙術', 'Sorcery'], ['自然', 'Nature'], ['カオス', 'Chaos'], ['暗黒', 'Death'],
    ['トランプ', 'Trump'], ['秘術', 'Arcane'], ['匠', 'Craft'], ['悪魔', 'Daemon'], ['破邪', 'Crusade'],
    ['ランダム', 'Random'], ['決定', 'Accept'], ['やり直し', 'Reroll'],

    // In-game messages and equipment status
    ['なし', 'nothing'], ['(なし)', '(nothing)'], ['(武器を両手持ち)', '(wielding with both hands)'],
    ['永久岩の壁が行く手をはばんでいる。', 'There is a permanent wall blocking your way.'],
    ['体力回復の薬', 'Potion of Healing'], ['重鎖かたびら', 'Augmented Chain Mail'],
    ['持ち物： 合計', 'Inven: Total'], ['装備： 合計', 'Equip: Total'],
    ['赤外線視力', 'Infra'], ['隠密行動', 'Stealth'], ['隠密', 'Stealth'],
    ['属性', 'Align'], ['中立', 'Neutral'], ['社会的地位', 'Social Class'],
    ['打撃修正', 'Melee Mod'], ['格闘', 'Brawl'], ['打撃命中', 'Melee Hit'], ['英雄的', 'Heroic'],
    ['魔法防御', 'MagicRes'], ['最低', 'Bad '], ['射撃回数', 'Shots/T '], ['射撃攻撃修正', 'SHT Att Mod '],
    ['射撃武器倍率', 'SHT Weapon Mult'], ['次レベル', 'Next Level'], ['平均ダメージ', 'Avg Damage  '],
    ['知覚', 'Perception'], ['探索', 'Search'], ['解除', 'Disarm'], ['加速', 'Fast'],
    ['プレイ時間', 'Play Time'], ['次の数値', 'Next Roll'], ['生い立ちを表示', 'Show History'],
    ['この数値に決定', 'Accept Roll'], ['この数値にAccept', 'Accept Roll'],
    ['初期オプション', 'Birth Options'],
    ['キャラクターの名前を入力して下さい:', 'Enter character\'s name:'],
    ['やり直す', 'Restart'], ['終了', 'Quit'], ['ヘルプ', 'Help'], ['変更', 'Change'], ['次へ', 'Next'],
    ['の性格修正', ' Trait Modifiers'],
    ['の種族修正', ' Race Modifiers'],
    ['の職業修正', ' Class Modifiers'],
    ['性格修正', 'Trait Modifiers'],
    ['種族修正', 'Race Modifiers'],
    ['職業修正', 'Class Modifiers'],
    ['打撃回数', 'Blows/T '],
    ['魔法道具', 'Device  '],
    ['射撃命中', 'SHT Hit '],
    ['最大経験', 'Max Exp '],
    ['ＡＣ', 'AC  '],
    ['1日目', 'Day 1'],
    ['掘削', 'Dig  '],
    ['伝説的', 'Legendary'],
    ['(限界の', '(Cap: '],
    ['コマンド:', 'Command:'],

    // Upstream character background paragraphs
    ['あなたの母親はオーガでしたが、それは秘密にされています。あ', 'Your mother was an Ogre, though that is kept secret. You'],
    ['なたは自作農の養子です。あなたは一家のお荷物です。あなたは', 'are the adopted child of a yeoman farmer. You are the family burden. You'],
    ['青い瞳とカールした黒髪を持ち、普通の肌色をしています。', 'have blue eyes, curling black hair, and an ordinary complexion.'],
    ['ハーフオーガはハーフオークに似ていますが、それだけではありません。彼らは', 'Half-Ogres are similar to Half-Orcs, but are not just that. They are'],
    ['大きく、邪悪で愚かです。戦士としては彼らは必要な資質を全て持っており、ま', 'large, evil, and stupid. As warriors they have all required qualities, and'],
    ['た魔法使いになることさえできます。結局、彼らはオーガ・メイジに関係があ', 'can even become mages. After all, they are related to Ogre-Mages,'],
    ['り、レベルが十分に上がったら彼らから罠のルーンをセットするスキルを学ぶの', 'and when high enough in level, learn to set trap runes like them.'],
    ['です。ハーフオークのように、彼らは暗闇に対する耐性を持ち、ハーフトロル同', 'Like Half-Orcs they resist darkness, and like Half-Trolls their strength'],
    ['様に腕力が下がることはありません。', 'cannot be reduced.'],
    ['狂戦士は怒り狂って武器を振るう恐るべき戦士です。全職業中最高の肉体能力を', 'Berserkers are terrifying warriors who wield weapons in a mad frenzy. They boast'],
    ['誇り、恐怖と麻痺に対する耐性を持ち、レベルが上がればその強靭な肉体で矢の', 'the highest physical stats, resist fear and paralysis, and in time deflect arrows'],
    ['呪文を跳ね返すことができます。さらに武器なしで戦うことや、呪いのかけられ', 'and spells with their tough bodies. They can fight unarmed, rip cursed gear'],
    ['た装備を力づくで剥がすことができ、いくつかの技を(反魔法状態でも)使うこと', 'off by brute force, and use various techniques even in anti-magic fields.'],
    ['ができます。しかし、巻物や魔法道具は全く使うことができず、罠の解除や隠密', 'However, they cannot use scrolls or magic devices at all, and their skills in'],
    ['行動、探索、魔法防御、飛び道具の技能に関しては絶望的です。ひたすら殴って', 'disarming, stealth, searching, magic defense, and missiles are hopeless.'],
    ['道を開くしかありません。幽霊は非常に勝利しやすいですがスコアがかなり低く', 'They can only smash a path forward. Spectres win easily, but scores are'],
    ['修正されます。', 'reduced.'],
    ['すばしっこいは、どのスキルも比較的うまくこなしますが、肉体的な能力は低く', 'Nimble characters handle any skill fairly well, but their physical prowess is'],
    ['なります。', 'lowered.'],

    // Ratings, skills & item defaults
    ['練習生', 'Apprentice'],
    ['大変良い', 'Very Good'],
    ['良い', 'Good'],
    ['卓越', 'Superb'],
    ['劣る', 'Poor'],
    ['スピードの薬', 'Potion of Speed'],
    ['スピード', 'Speed'],
    ['軟革よろい', 'Soft Leather Armour'],

    // Race, class, trait & lore wrapped lines
    ['あなたは自作農の幾人かの子供のうちの一人です。あなたは家族', 'You are one of several children of a Yeoman. You are'],
    ['に大切にされています。あなたはブラウンの瞳となめらかな黒髪', 'a well liked child. You have brown eyes, straight black hair,'],
    ['を持ち、白い肌をしています。', 'and a fair complexion.'],

    ['ドゥナダンは西方から来た屈強な種族です。このいにしえの種族は全ての領域に', 'Dunedain are a race of hardy men from the West. This elder race'],
    ['おいて人間の能力を凌駕し、特に耐久力に関してはそれが顕著です。しかしなが', 'surpasses human abilities in every field, especially constitution. However,'],
    ['らこの種族は全てに卓越していることが災いして、この世界には新しい経験と', 'being men of the world, very little is new to them, and levels are'],
    ['いったものがほとんどなく、レベルを上げることが非常に困難です。彼らはとて', 'very hard for them to gain. They are very tough and hardy, and'],
    ['もタフで頑強であり、彼らの耐久力が下がることはありません。', 'their constitution cannot be reduced.'],

    ['超能力者は魔法のかわりにその精神の力を使う唯一の職業です。この力は超能力', 'The Mindcrafter is a unique class that uses mental powers instead'],
    ['者独特のもので、単に超感覚的なものから他人の精神を支配するものまで様々で', 'of magic, ranging from ESP to mental domination of others. Since'],
    ['す。彼らの力はある種の訓練によって開発されるものなので、超能力者は力を使', 'these powers develop by discipline, no spellbooks are needed.'],
    ['うのに呪文書を必要としません。使える力は単純にキャラクタのレベルによって', 'Available powers are determined by level. Wisdom determines a'],
    ['決まります。超能力に必要な能力値は賢さです。', "Mindcrafter's ability to use mind powers."],

    ['がまんづよいは、じっくりと物事にとりくむ慎重な性格で、他の性格に比べて高', 'Patient characters act carefully and gain high constitution,'],
    ['い耐久力を得ることができます。しかし、自分から行動するのは苦手で、多くの', 'resilience, and HP, but have poor abilities in most other skills.'],
    ['技能は低くなってしまいます。', ' '],
    ["大変劣る", "Very Poor"],
    ["悪い", "Bad"],
    ["SHT 攻撃修正", "SHT Att Mod"],
    ["射撃攻撃修正", "SHT Att Mod "],
    ["射撃回数", "Shots/T "],
    ["プー太郎", "Rambler"],
    ["新参兵", "Rookie"],
    ["信者", "Believer"],
    ["すり", "Cutpurse"],
    ["使い走り", "Runner"],
    ["勇士", "Gallant"],
    ["入門者", "Initiate"],
    ["熟練士", "Adept"],
    ["放浪者", "Traveler"],
    ["見習い", "Novice"],
    ["徒弟", "Apprentice"],
    ["乾し肉", "Dried Meat"],
    ["鹿肉の干し肉", "Strip of Venison"],
    ["所持金", "AU    "],
    ["最大経験", "Max Exp "],
    ["知覚", "Perception"],
    ["解除", "Disarm"],
    ["魔法道具", "Device  "],
    ["あなたは農奴の幾人かの子供のうちの一人です。あなたは一家の", "You are one of several children of a Serf. You are a credit"],
    ["誇りです。あなたはブルーグレイの瞳となめらかな赤い髪を持", "to the family. You have blue-gray eyes, straight red hair,"],
    ["ち、普通の肌色をしています。", "and an average complexion."],
    ["ち、Normの肌色をしています。", "and an average complexion."],
    ["に必要な能力値は知能です。", "Intelligence determines a tourist's spell casting ability."],
    ["人間は基本となるキャラクタです。他の全ての種族は人間と比較されます。人間", "The human is the base character. All other races are compared to them."],
    ["はどんな職業に就くこともでき、どの職業でも平均的にこなせます。人間は寿命", "Humans can choose any class and are average at everything. Humans tend to"],
    ["が短いため、レベル上昇が他のどんな種族よりも早くなる傾向があります。また", "go up levels faster than most other races because of their shorter life"],
    ["、特別な修正や特性は持っていません。", "spans. No racial adjustments or intrinsics occur to characters choosing"],
    ["ハーフエルフは人間より賢いですが、強くはありません。彼らは探索, 解除, 魔", "Half-elves tend to be smarter and faster than humans, but not as strong."],
    ["法防御, 隠密行動, 射撃, そして魔法道具使用でわずかに優れています。しかし", "Half-elves are slightly better at searching, disarming, saving throws,"],
    ["武器の取り扱いはそう得意ではありません。ハーフエルフはどの職業に就くこと", "stealth, bows, and magic, but they are not as good at hand weapons."],
    ["もでき、生まれつきの特性はありません。", "Half-elves may choose any class and do not receive any intrinsic"],
    ["エルフは人間より良い魔法使いになれますが、戦闘は苦手です。彼らは人間やハ", "Elves are better magicians then humans, but not as good at fighting. They"],
    ["ーフエルフよりも頭が良く、高い賢さを持っています。エルフは探索, 解除, 知", "tend to be smarter and faster than either humans or half-elves and also"],
    ["覚, 隠密行動, 射撃, そして魔法道具使用で優れていますが、武器の扱いは得意", "have better wisdom. Elves are better at searching, disarming, perception,"],
    ["ではありません。彼らは生まれつき光に対する耐性を持っています。", "stealth, bows, and magic, but they are not as good at hand weapons. They"],
    ["ホビット、またはハーフリングは弓や投擲に長け、魔法防御も優れています。ま", "Hobbits, or Halflings, are very good at bows, throwing, and have good"],
    ["た、探索, 解除, 知覚, そして隠密行動でもとても良い能力を示します。そのた", "saving throws. They also are very good at searching, disarming,"],
    ["め、彼らは優れた盗賊となることができます（しかし、「忍びの者」と呼ばれる", "perception, and stealth; so they make excellent rogues, but prefer to be"],
    ["ことを好みます）。ホビットは人間より遥かに貧弱で、戦士としてはてんでダメ", "called burglars. They are much weaker than humans and no good at melee"],
    ["です。彼らはかなり良い赤外線視力を持っており、温血動物を離れた場所から見", "fighting. Halflings have fair infravision, so they can detect warm"],
    ["つけることができます。彼らは経験値を保持する力が強く、経験値吸収攻撃に対", "creatures at a distance. They have a strong hold on their life force and"],
    ["して耐性を持っています。", "are thus intrinsically resistant to life draining."],
    ["ノームはドワーフより小さいですが、ホビットよりは大きい種族です。彼らはホ", "Gnomes are smaller than dwarves but larger than Halflings. They, like the"],
    ["ビット同様地表の洞穴のような家に住んでいます。ノームはとても良い魔法防御", "hobbits, live in the earth in burrow-like homes. Gnomes make excellent"],
    ["を持ち、探索, 解除, 知覚, 隠密行動でも優れています。彼らは人間より低い腕", "mages and have very good saving throws. They are good at searching,"],
    ["力を持ち、武器を持っての戦闘は苦手です。ノームはかなり良い赤外線視力を持", "disarming, perception, and stealth. They have lower strength than humans"],
    ["っており、温血動物を離れた場所から見つけることができます。ノームは生まれ", "so they are not very good at fighting with hand weapons. Gnomes have fair"],
    ["つき麻痺に対する耐性を持っています。", "infravision, so they can detect warm-blooded creatures at a distance."],
    ["ドワーフは頑固な坑夫であり、伝説の戦士です。彼らは人間にくらべ強くタフで", "Dwarves are the headstrong miners and fighters of legend. Dwarves tend to"],
    ["すが、知能は劣ります。しかし、長命ゆえに彼らは非常に賢いです。彼らは良い", "be stronger and tougher but slower and less intelligent than humans."],
    ["魔法防御を持ち、探索, 知覚, 戦闘, 射撃では優れています。彼らは一つ大きな", "Because they are so headstrong and are somewhat wise, they resist spells"],
    ["欠点を持っています。ドワーフの隠密行動は絶望的に悪いです。彼らは決して盲", "which are cast on them. They are very good at searching, perception,"],
    ["ハーフオークはよい戦士になれますが、魔法は期待できません。彼らはドワーフ", "Half-orcs make excellent warriors, but are terrible at magic. They are as"],
    ["と同じくらい隠密行動が悪く、また探索や解除, 知覚もひどいです。ハーフオー", "bad as dwarves at stealth, and horrible at searching, disarming, and"],
    ["クは醜く、店での買い物ではより高い金額を要求されがちです。彼らは地下に住", "perception. Half-orcs are quite ugly and tend to pay more for goods in"],
    ["むことを好むため、ハーフオークは暗闇に対する耐性を備えています。", "town. Because of their preference to living underground to on the surface,"],
    ["ハーフトロルは信じられないほど強く、他の大部分の種族より大きなＨＰを持ち", "Half-Trolls are incredibly strong and have more hit points than most other"],
    ["ます。彼らは不運にもとても愚かです。彼らの探索, 解除, 知覚, 隠密行動は悪", "races. They are also very stupid and slow. They are bad at searching,"],
    ["く、その外見はハーフオークがしかめっ面をするほど醜悪です。ハーフトロルは", "disarming, perception, and stealth. They are so ugly that a Half-Orc"],
    ["腕力が下がることがありません。レベルが上がると、彼らは再生能力を手にいれ", "grimaces in their presence. They also happen to be fun to run..."],
    ["、戦士ならばさらに遅消化能力も獲得します。", "Half-trolls always have their strength sustained. At higher levels,"],
    ["アンバライトは多くのアドバンテージを授けられた、うわさによれば不死の種族", "The Amberites are a reputedly immortal race, who are endowed with numerous"],
    ["です。彼らは知覚, 戦闘, 射撃に優れており、他の面でもかなり熟練しています", "advantages in addition to their longevity. They are very tough and their"],
    ["。事実上あらゆるものを見てきており、新鮮なものはほとんどないため、彼らの", "constitution cannot be reduced. Their ability to heal wounds far surpasses"],
    ["成長は他のどの種族より遅いものです。彼らはとてもタフで頑強であり、彼らの", "that of any other race. Having seen virtually everything, very little is"],
    ["耐久力が下がることはありません。また、怪我をすぐに治す再生能力があります", "new to them, and they gain levels much more slowly than the other races."],
    ["ハイエルフは世界の始まりから存在する不死の種族です。彼らは全てのスキルに", "High-elves are a race of immortal beings dating from the beginning of"],
    ["熟達しており、強く、知的で非常に人気があります - 誰もが彼らのことを好いて", "time. They are masters of all skills, and are strong and intelligent,"],
    ["います。ハイエルフは見えないものを見ることができ、普通のエルフ同様光に対", "although their wisdom is sometimes suspect. High-elves begin their lives"],
    ["する耐性を持っています。しかし、彼らにとって未知のものはほとんどなく、経", "able to see the unseen, and resist light effects just like regular elves."],
    ["験を得ることは大変に困難です。", "However, there are few things that they have not seen already, and"],
    ["野蛮人は北方から来た頑強な種族です。彼らは激しく戦い、彼らの激怒は世界中", "Barbarians are hardy men of the north. They are fierce in combat, and"],
    ["で恐れられています。戦闘が彼らの人生です。彼らは恐れを知らず、ハーフトロ", "their wrath is feared throughout the world. Combat is their life: they"],
    ["ルよりもすぐに狂暴に戦闘に入ってしまうことを学びます。しかし、野蛮人は魔", "feel no fear, and they learn to enter battle frenzy at will even sooner"],
    ["法を疑っており、そのため魔法の道具を使うことはかなり大変なこととなってい", "than half-trolls. Barbarians are, however, suspicious of magic, which"],
    ["ハーフオーガはハーフオークに似ていますが、それだけではありません。彼らは", "Half-Ogres are like Half-Orcs, only more so. They are big, bad, and"],
    ["大きく、邪悪で愚かです。戦士としては彼らは必要な資質を全て持っており、ま", "stupid. For warriors, they have all the necessary attributes, and they can"],
    ["た魔法使いになることさえできます。結局、彼らはオーガ・メイジに関係があり", "even become wizards: after all, they are related to Ogre Magi, from whom"],
    ["、レベルが十分に上がったら彼らから罠のルーンをセットするスキルを学ぶので", "they have learned the skill of setting trapped runes once their level is"],
    ["す。ハーフオークのように、彼らは暗闇に対する耐性を持ち、ハーフトロル同様", "high enough. Like Half-Orcs, they resist darkness, and like Half-Trolls,"],
    ["に腕力が下がることはありません。", "they have their strength sustained."],
    ["半巨人は大変力強いのですが、呪文を唱えられるほど利口ではありません。彼ら", "Half-Giants' limited intelligence makes it difficult for them to become"],
    ["はよい戦闘能力を持ちますが、それ以外のことは苦手です。彼らの厚い皮膚は破", "full spellcasters, but, with their great strength, they make excellent"],
    ["片に対する耐性を持ちます。また、ハーフオーガやハーフトロル同様腕力を下げ", "warriors. Their thick skin makes them resistant to shards, and, like"],
    ["られることがありません。", "Half-Ogres and Half-Trolls, they have their strength sustained."],
    ["巨大なタイタンと人間の子孫であり、この強大な生物は他のほぼ全ての種族より", "Half-mortal descendants of the mighty titans, these immensely powerful"],
    ["はるかに勝っています。彼らは多種族にみられるような魅力的な特殊能力は持っ", "creatures put almost any other race to shame. They may lack the"],
    ["ていませんが、その大変大きなＨＰはそれを補ってあまりあります。半タイタン", "fascinating special powers of certain other races, but their enhanced"],
    ["はそこそこのスキルを持っていますが、その巨大さゆえに罠の解除やこっそり歩", "attributes more than make up for that. They learn to estimate the"],
    ["くことは困難です。法と秩序を愛する彼らは、カオスに対する耐性を持っていま", "strengths of their foes, and their love for law and order makes them"],
    ["一つ目ではありますが、サイクロプスは多くの二つの目を持つ生物以上に見るこ", "With but one eye, a Cyclops can see more than many with two eyes. They are"],
    ["とができます。サイクロプスは非常に力強いのですが、知的であるとはちょっと", "headstrong, and loud noises bother them very little. They are not quite"],
    ["言えません。彼らに比べれば、ハーフトロルの方がハンサムに見えるということ", "qualified for the magic using professions, but as a certain Mr. Ulysses"],
    ["は言うまでもありません。サイクロプスは戦闘, 射撃に優れていますが、その他", "can testify, their accuracy with thrown rocks can be deadly..."],
    ["の大部分のスキルは苦手です。サイクロプスは音に対する耐性を持っています。", ""],
    ["イークは最も哀れな生物の一つであり、並のモンスターであっても不注意なイー", "Yeeks are among the most pathetic creatures. Fortunately, their horrible"],
    ["クならば徹底的に打ちのめせるほど肉体的には強くありませんが、彼らはかなり", "screams can scare away less confident foes, and their skin becomes more"],
    ["知的でいくらか賢い生物です。イークは戦闘スキルは苦手ですが、他の分野では", "and more resistant to acid, as they gain experience. But having said that,"],
    ["優れています。彼らの皮膚は、時間とともに酸への耐性を増していき、レベルが", "even a mediocre monster can wipe the proverbial floor with an unwary Yeek."],
    ["十分に上がれば完全に免疫を持つようになります。", ""],
    ["クラッコンは奇怪な半知的の昆虫型生物です。彼らはすばらしい戦士になれます", "Klackons are bizarre semi-intelligent ant-like insectoid creatures. They"],
    ["が、精神的な能力はひどく制限されています。彼らは探索を除けば大部分のスキ", "make great fighters, but their mental abilities are severely limited."],
    ["ルをそこそこにこなします。クラッコンは決して混乱させられることがなく、レ", "Obedient and well-ordered, they can never be confused. They are also very"],
    ["ベルが上がるごとに速くなります。", "nimble, and become faster as they advance levels. They are also very"],
    ["コボルドは弱いゴブリンの種族です。彼らは毒を持った武器を好み、毒矢（無制", "Kobolds are a weak goblin race. They love poisoned weapons, and can learn"],
    ["限に供給されます）を投げる能力を身につけることができます。コボルドはそこ", "to throw poisoned darts (of which they carry an unlimited supply). They"],
    ["そこの戦士になれますが、その他のスキルは軒並み悪いです。彼らは生まれつき", "are also inherently resistant to poison, although they are not one of the"],
    ["毒に対する耐性を持っています。", "more powerful races."],
    ["嫌われ、迫害されてきた小人族です。彼らは大抵のスキルをそつなくこなします", "The hated and persecuted race of nocturnal dwarves, these cavedwellers are"],
    ["。洞穴居住者である彼らは、暗闇に悩まされることはありませんし、生まれつき", "not much bothered by darkness. Their natural inclination to magical items"],
    ["持っている魔法のアイテムに対する嗜好のため、彼らは装備による魔法のボーナ", "has made them immune to effects which could drain away magical energy."],
    ["スを奪う効果に耐性を持っています。", ""],
    ["闇の、洞穴に住む種族であるダークエルフは魔法の知識に対する長い伝統を持っ", "Another dark, cavedwelling race, likewise unhampered by darkness attacks,"],
    ["ています。ダークエルフは魔法の道具をうまく使うことができ、他の多くの種族", "the Dark Elves have a long tradition and knowledge of magic. They have an"],
    ["より簡単に呪文を唱えられるだけの知能を持っています。その鋭い視覚によって", "inherent magic missile attack available to them at a low level. With their"],
    ["、彼らはハイエルフ同様見えないものをみる能力を学びますが、それはある程度", "keen sight, they also learn to see invisible things as their relatives"],
    ["レベルが上がったときです。ダークエルフは暗闇に対する耐性を持っています。", "High-Elves do, but at a higher level."],
    ["ドラゴンのような特性を持った人間型種族です。彼らはレベルが上がるにつれ、", "A humanoid race with dragon-like attributes. As they advance levels, they"],
    ["新しい元素への耐性を手にいれます。ドラコニアンは優れた能力値を持ってゲー", "gain new elemental resistances (up to Poison Resistance), and they also"],
    ["ムを開始でき、大抵のスキルをうまくこなせます。その翼で、彼らは簡単に落と", "have a breath weapon, which becomes more powerful with experience. The"],
    ["し穴や溶岩、水を無傷で飛び越えることができます。", "exact type of the breath weapon depends on the Draconian's class and"],
    ["秘密主義の神秘的な古代種族です。彼らの文明はこの惑星上の何よりも古いかも", "A secretive and mysterious ancient race. Their civilization may well be"],
    ["しれません。その肉体的資質は決して誉められたものではありませんが、彼らの", "older than any other on our planet, and their intelligence and wisdom are"],
    ["知能と賢さはマインドフレアを他のどんな種族よりも強力な魔法使いにします。", "naturally sustained, and are so great that they enable Mind Flayers to"],
    ["マインドフレアの知能と賢さは下がることがなく、レベルが上がれば見えないも", "become more powerful spellcasters than any other race, even if their"],
    ["のをみる能力、テレパシー能力を獲得します。", "physical attributes are a good deal less admirable. As they advance"],
    ["地獄からやってきた悪魔的な生物です。彼らは他の種族から毛嫌いされています", "Demon-creatures from the nether-world, imps are naturally resistant to"],
    ["が、大抵の職業をかなりうまくこなすことができます。インプは生まれつき火に", "fire attacks and capable of learning fire bolt and fire ball attacks. They"],
    ["耐性を持っており、レベルが上がれば見えないものを見る能力を獲得します。", "are little loved by other races but can perform fairly well in most"],
    ["ゴーレムは泥のような生命のない材料からつくられ、生命を吹き込まれた人工的", "A Golem is an artificial creature, built from a lifeless raw material like"],
    ["な生物です。彼らには思考というものがほとんどなく、そのため魔法に依存する", "clay, and awakened to life. They are nearly mindless, making them useless"],
    ["職業では役立たずです。しかし戦士としては大変にタフです。彼らは毒に耐性を", "for professions which rely on magic, but as warriors they are very tough."],
    ["持ち、見えないものを見ることができ、さらに麻痺知らずです。レベルが上がれ", "They are resistant to poison, they can see invisible things, and move"],
    ["ば、彼らは生命力吸収攻撃に耐性を持つようになります。ゴーレムは通常の食物", "freely. At higher levels, they also become resistant to attacks which"],
    ["からはほとんど栄養を摂取できませんが、代わりに魔法棒や杖から魔力を吸収し", "threaten to drain away their experience. Golems gain very little nutrition"],
    ["て動力源にする事ができます。また、その頑丈な身体のため、ACにボーナスを得", "from ordinary food, but can absorb mana from staffs and wands as their"],
    ["ることができ、さらに決して気絶させられることがありません。", "power source. Golems also gain a natural armor class bonus from their"],
    ["スケルトンには2つのタイプが存在します。普通の戦士タイプと、リッチと呼ばれ", "There are two types of skeletons: the ordinary, warrior-like skeletons,"],
    ["る呪文を使うスケルトンです。アンデッドである彼らは、毒や生命力吸収攻撃を", "and the spell-using skeletons, which are also called liches. As undead"],
    ["心配する必要はありません。彼らは物体を知覚するのに眼を利用していないため", "beings, skeletons need to worry very little about poison or attacks that"],
    ["、見えない物に騙されません。彼らの骨はとがった破片のようなものに耐性を持", "can drain life. They do not really use eyes for perceiving things, and are"],
    ["ち、レベルが上がれば冷気に対する耐性を獲得します。薬や食物の持つ効果はス", "thus not fooled by invisibility. Their bones are resistant to sharp"],
    ["ケルトンの胃（存在しませんが）を通過することなくその力を発揮しますが、薬", "shrapnel, and they will quickly become resistant to cold. Although the"],
    ["や食物自体は彼の顎を通り抜けて落ちてしまい、栄養を吸収することはできませ", "magical effects of these will affect the skeleton even without entering"],
    ["ん。その代わりに魔法棒や杖から魔力を吸収してエネルギー源にする事ができま", "the skeleton's (non-existent) belly, the potion or food itself will fall"],
    ["ゾンビはアンデッドであり、生命力吸収攻撃に耐性を持ち、スケルトンのように", "Much like Skeletons, Zombies too are undead horrors: they are resistant to"],
    ["レベルが上がれば冷気の耐性を獲得します。また、毒に耐性を持ち見えないもの", "exp-draining attacks, and can learn to restore their experience. Like"],
    ["を見ることができます。（スケルトンとは違い）切る攻撃には弱いですが、地獄", "skeletons, they become resistant to cold-based attacks (actually earlier"],
    ["に対する耐性を持っています。ゴーレムのように、彼らは食物からほとんど栄養", "than skeletons), resist poison and can see invisible. While still"],
    ["を摂取できませんが、代わりに魔法棒や杖から魔力を吸収してエネルギー源にす", "vulnerable to cuts (unlike skeletons), Zombies are resistant to Nether."],
    ["強力なアンデッドの一種である吸血鬼は、畏敬の念を呼び起こす外見をしていま", "One of the mightier undead creatures, the Vampire is an awe-inspiring"],
    ["す。アンデッドの例にもれず、彼らも生命力を吸収されることがなく、地獄に対", "sight. Yet this dread creature has a serious weakness: the bright rays of"],
    ["する耐性を持っています。また、冷気と毒に対する耐性も備えています。しかし", "sun are its bane, and it will need to flee the surface to the deep"],
    ["、新鮮な血液に常に飢えており、それは近くにいる生物から血液を吸うことによ", "recesses of earth until the sun finally sets. Darkness, on the other hand,"],
    ["ってのみ満たされます。この強力な生物は深刻な弱点を持っています。太陽光線", "only makes the Vampire stronger. As undead, the Vampire has a firm hold on"],
    ["（や光源）は彼らの破滅を意味します。幸運にも、吸血鬼はその身体から「暗黒", "its experience, and resists nether attacks. The Vampire also resists cold"],
    ["の光」のオーラを放出しています。一方、暗闇は彼らをより強力にするものです", "and poison based attacks. It is, however, susceptible to its perpetual"],
    ["幽霊は強力なアンデッドの一種です。彼らは不気味な緑色の光に包まれています", "Another powerful undead creature: the Spectre is a ghastly apparition,"],
    ["。半物質的な存在である彼らは、壁を通り抜けることができますが、そのときに", "surrounded by an unearthly green glow. They exist only partially on our"],
    ["は壁の密度によって傷つけられてしまいます。他のアンデッド同様、彼らも生命", "plane of existence: half-corporeal, they can pass through walls, although"],
    ["力を吸収されることがなく、見えないものを見ることができ、毒と冷気に対して", "the density of the wall will hurt them in the process of doing this. As"],
    ["耐性を備え、さらに地獄に対する耐性も持っています。レベルが十分に上がると", "undead, they have a firm hold on their experience, see invisible, and"],
    ["彼らはテレパシーを獲得します。幽霊は卓越した魔法使いになることができます", "resist poison and cold. They also resist nether. At higher levels they"],
    ["が、その身体的特性は非常に貧弱です。彼らは食物からほとんど栄養を摂取でき", "develop telepathic abilities. Spectres make superb spellcasters, but their"],
    ["ませんが、代わりに魔法棒や杖から魔力を吸収してエネルギー源にする事ができ", "physical form is very weak. They gain very little nutrition from the food"],
    ["妖精は非常に小さいです。彼らは小さな翼を持ち、罠や危険な地形を飛び越える", "One of several fairy races, Sprites are very small. They have tiny wings"],
    ["ことができます。彼らは日光を大変好み、光に対する耐性を持っています。身体", "and can fly over traps that may open up beneath them. They enjoy sunlight"],
    ["的にはもっとも貧弱な種族の一つですが、妖精は魔法の面で大変な才能を持って", "intensely, and need worry little about light based attacks. Although"],
    ["おり、非常に熟練した魔法使いになることができます。高レベルではより速く飛", "physically among the weakest races, Sprites are very talented in magic,"],
    ["ぶことができるようになります。", "and can become highly skilled wizards. Sprites have the special power of"],
    ["この種族はカオスによってつくられた冒涜的で嫌悪される存在です。彼らは独立", "This race is a blasphemous abomination produced by Chaos. It is not an"],
    ["した種族ではなく、人間型種族、大抵は人間がカオスによって歪められた存在、", "independent race but rather a humanoid creature, most often a human,"],
    ["もしくは人間と獣の悪夢のような交配種です。全ての獣人はカオスに盲従してお", "twisted by the Chaos, or a nightmarish crossbreed of a human and a beast."],
    ["り、そのため混乱と音に対して耐性を備えていますが、純粋なログルスはまだ彼", "All Beastmen are accustomed to Chaos so much that they are untroubled by"],
    ["らに対し効果を持っています。獣人は混沌を好み、それは彼らをさらに歪めます", "confusion and sound, although raw logrus can still have effects on them."],
    ["。獣人は突然変異を起こしやすい性質を持っています。彼らがつくられたとき、", "Beastmen revel in chaos, as it twists them more and more. Beastmen are"],
    ["ランダムな変異を受けます。その後、レベルが上がるごとに違う変異を受ける可", "subject to mutations: when they have been created, they receive a random"],
    ["エントは非常に強く、賢いですが、その巨大さゆえに罠の解除やこっそりと歩く", "The Ents are a powerful race dating from the beginning of the world,"],
    ["ことは苦手です。成長するにつれて腕力や耐久力が上がりますが、器用さは下が", "oldest of all animals or plants who inhabit Arda. Spirits of the land,"],
    ["っていきます。彼らには大きな欠点があり、炎によって通常よりも大きなダメー", "they were summoned to guard the forests of Middle-earth. Being much like"],
    ["ジを受けてしまいます。彼らは食物からほとんど栄養を摂取できませんが、代わ", "trees they are very clumsy but strong, and very susceptible to fire. They"],
    ["りに薬等から水分を摂取する事で活動できます。", "gain very little nutrition from the food of mortals, but they can absorb"],
    ["天使の上位種であるアルコンは、全てのスキルに熟達しており、強くて賢く、非", "Archons are a higher class of angels. They are good at all skills, and are"],
    ["常に人気があります。彼らは目に見えないものを見ることができ、その翼で罠や", "strong, wise, and are a favorite with any people. They are able to see the"],
    ["危険な地形を飛び越えることができます。しかし、非常に成長が遅いという欠点", "unseen, and their wings allow them to safely fly over traps and other"],
    ["悪魔の上位種であるバルログは、強く、知的で、またタフでもあります。しかし", "Balrogs are a higher class of demons. They are strong, intelligent and"],
    ["、彼らは神を信じようとはせず、プリーストには全く向いていません。炎と地獄", "tough. They do not believe in gods, and are not suitable for priest at"],
    ["、経験値吸収への耐性を持っており、レベルが上がれば見えないものを見る能力", "all. Balrogs are resistant to fire and nether, and have a firm hold on"],
    ["を獲得します。また、地獄や火炎のブレスを吐くこともできます。彼等はほとん", "their experience. They also eventually learn to see invisible things. They"],
    ["どの技能で優れていますが、静かに歩くことは苦手です。彼らは食物からほとん", "are good at almost all skills except stealth. They gain very little"],
    ["ど栄養を摂取できませんが、人間タイプを生贄にする事で精力を回復する事がで", "nutrition from the food of mortals, and need human corpses as sacrifices"],
    ["ドゥナダンは西方から来た屈強な種族です。このいにしえの種族は全ての領域に", "Dunedain are a race of hardy men from the West. This elder race surpasses"],
    ["おいて人間の能力を凌駕し、特に耐久力に関してはそれが顕著です。しかしなが", "human abilities in every field, especially constitution. However, being"],
    ["らこの種族は全てに卓越していることが災いして、この世界には新しい経験とい", "men of the world, very little is new to them, and levels are very hard for"],
    ["ったものがほとんどなく、レベルを上げることが非常に困難です。彼らはとても", "them to gain. Their constitution cannot be reduced."],
    ["タフで頑強であり、彼らの耐久力が下がることはありません。", ""],
    ["影フェアリーは人間よりやや大きい妖精族で、翼を持ち、罠や危険な地形を飛び", "Shadow Fairies are one of several fairy races. They have wings, and can"],
    ["越えることができます。しかし、彼らは日光を嫌い、閃光によって通常よりも大", "fly over traps that may open up beneath them. Shadow Fairies must beware"],
    ["きなダメージを受けてしまいます。肉体的には非常に貧弱ですが、魔法の面では", "of sunlight, as they are vulnerable to bright light. They are physically"],
    ["優れた能力を持っています。彼らにはすばらしい長所が一つあり、モンスターの", "weak, but have advantages in using magic and are amazingly stealthy."],
    ["反感をかうような強力なアイテムを装備してもモンスターを怒らせることがあり", "Shadow Fairies have a wonderful advantage in that they never aggravate"],
    ["ません。ただしその場合でも隠密行動能力が下がり、また、自分自身の性格によ", "monsters (If their equipment normally aggravates monsters, they only"],
    ["って反感をかっている場合には効果がありません。", "suffer a penalty to stealth, but if they aggravate by their personality"],
    ["クターとしている無表情の謎の生物です。彼らは外見がかわいらしいため、魅力", "A Kutar is an expressionless animal-like living creature. The word 'kuta'"],
    ["が高いです。彼らは混乱しません。なぜなら、混乱してもクターとしているため", "means 'absentmindedly' or 'vacantly'. Their absentmindedness hurts their"],
    ["変わりないからです。しかも、そのクターとしている外見から敵に見つかりにく", "searching and perception skills, but renders them incapable of being"],
    ["いです。しかし、彼らは注意力が少ないため探索や知覚能力は悪いです。彼らは", "confused. Their unearthly calmness and serenity make them among the most"],
    ["レベルが上がると横に伸びてACを上げる技を覚えますが、伸びている間は魔法防", "stealthy of any race. Kutars, although expressionless, are beautiful and"],
    ["御能力は低くなってしまいます。", "so have a high charisma. Members of this race can learn to expand their"],
    ["アンドロイドは機械の身体を持つ人工的な存在です。魔法をうまく使うことはで", "An android is a artificial creation with a body of machinery. They are"],
    ["きませんが、戦士としては非常に優れています。彼らは他の種族のように経験値", "poor at spell casting, but they make excellent warriors. They don't"],
    ["を得て成長するということはありません。身体に身につける装備によって成長し", "acquire experience like other races, but rather gain in power as they"],
    ["ます。ただし、指輪、アミュレット、光源は成長に影響しません。彼らは毒の耐", "attach new equipment to their frame. Rings, amulets, and lights do not"],
    ["性を持ち、麻痺知らずで、生命力を吸収されることがありません。また、身体が", "influence growth. Androids are resistant to poison, can move freely, and"],
    ["頑丈なのでACにボーナスを得ます。しかし身体のいたるところに電子回路が組み", "are immune to exp-draining attacks. Moreover, because of their hard"],
    ["込まれているため、電撃によって通常よりも大きなダメージを受けてしまいます", "metallic bodies, they get a bonus to AC. Androids have electronic circuits"],
    ["。彼らは食物からほとんど動力を得られませんが、油を補給する事で動力源を得", "throughout their body and must beware of electric shocks. They gain very"],
    ["マーフォークは人型生物と水棲生物の合いの子たちの総称です。彼らは知的であ", "Merfolk is a general term for children of humanoids and aquatic creatures."],
    ["り、陸上よりも水中での営みに適応している点で共通しています。彼らの真価は", "They have in common that they are intelligent and adapted to working"],
    ["水中でこそ発揮されますが、彼らの文明は大抵陸上に長く滞在する何らかの術も", "underwater rather than on land. Their true value comes in water, but their"],
    ["有しています。それを失わない限り、陸上でも不自由はないでしょう。また、彼", "civilizations also have some form of staying longer on land. As long as"],
    ["らは致命的な水難にも抗える能力を生まれつき持っています。", "you do not lose it, there will be no inconvenience on land. They also have"],
    ["戦士は、直面する問題のほとんどを細切れに叩き切ることで解決するキャラクタ", "A Warrior is a hack-and-slash character, who solves most of his or her"],
    ["です。が、時折退却して魔法の道具の世話になることもあります。不運にも、高", "problems by cutting them to pieces, but will occasionally fall back on the"],
    ["レベルなアイテムの多くは彼らが扱える範囲を越えています。", "help of a magical device. Unfortunately, many high-level devices may be"],
    ["メイジは魔法使いであり、その機知によって生き延びなければなりません。戦士", "A Mage is a spell caster that must live by his or her wits as a mage"],
    ["のように、単純に切りまくることで道を開くことは望めません。呪文書に加えて", "cannot hope to simply hack his or her way through the dungeon like a"],
    ["、メイジは助けになる魔法の道具を持ち運ぶべきです。これは他の何よりも遥か", "warrior. In addition to spellbooks, a mage should carry a range of magical"],
    ["に簡単にマスターできます。魔法に必要な能力値は知能です。", "devices to help his or her endeavors. A mage can master those devices far"],
    ["プリーストは高貴な力を使うことに専念したキャラクタです。彼らは自身の神の", "A Priest is a character devoted to serving a higher power. He or she"],
    ["ためにダンジョンを探索し、もし宝を手にいれたなら、それは彼が信仰する宗教", "explores the dungeon in the service of a God. Since Priests receive new"],
    ["の栄光となります。プリーストは新しい祈りを神からの贈り物という形で受け取", "prayers as gifts from their patron deity, they cannot choose which ones"],
    ["るため、どれを学ぶのか自分で選ぶことはできません。プリーストは魔法の道具", "they will learn. Priests are familiar with magical devices which they"],
    ["の使い方をよく知っていますが、メイジほどうまくは使えません。刃のついた武", "believe act as foci for divine intervention in the natural order of"],
    ["器より鈍器を好み、祝福されていない刃のついた武器を装備すると不愉快な感覚", "things. A priest wielding an edged weapon will be so uncomfortable with it"],
    ["に襲われ、戦闘能力が落ちてしまいます。魔法に必要な能力値は賢さです。", "that his or her fighting ability decreases. A Priest's primary stat is"],
    ["盗賊はその狡猾さで生き抜くことを好むキャラクタですが、肝心なときには戦闘", "A Rogue is a character that prefers to live by his or her cunning, but is"],
    ["で道を切り開くことができます、盗賊は罠やドアを見つける能力に優れ、罠の解", "capable of fighting out of a tight spot. Rogues are good at locating"],
    ["除や鍵開けに熟達しています。盗賊は高い隠密行動を持ち、たくさんのモンスタ", "hidden traps and doors and are the masters of disarming traps and picking"],
    ["ーの群れのそばを起こすことなく通り抜けたり、忍び寄って先制攻撃することが", "locks. A rogue is very stealthy, allowing him or her to sneak around many"],
    ["できます。魔法に必要な能力値は知能です。", "creatures without having to fight or to get in a telling first blow. A"],
    ["レンジャーは戦士とメイジを合わせたような職業で、身の回りの自然と特別な関", "A Ranger is a combination of a warrior and a mage who has developed a"],
    ["係を作り上げています。彼はより戦士であり、弓のような遠距離武器を巧く使え", "special affinity for the natural world. He or she is a good fighter and"],
    ["る職業です。レンジャーはよい隠密行動、よい知覚、よい探索、よい魔法防御を", "also good with missile weapons such as bows. A ranger has good stealth,"],
    ["持ち、魔法の道具の使用にも長けています。魔法に必要な能力値は知能です。", "good perception, good searching, good saving throws and is good with"],
    ["パラディンは戦士とプリーストを合わせた職業です。パラディンはとてもよい戦", "A Paladin is a combination of a warrior and a priest. Paladins are very"],
    ["士ですが、遠距離武器を扱うのは得意ではありません。パラディンには多くの能", "good fighters, but not very good at missile weapons. A paladin lacks much"],
    ["力が欠けています。隠密行動, 知覚, 探索, そして魔法道具使用が苦手ですが、", "in the way of abilities. He or she is poor at stealth, perception,"],
    ["その神との提携によって魔法防御はそこそこです。魔法に必要な能力値は賢さで", "searching, and magical devices but has a decent saving throw due to his or"],
    ["魔法戦士はその名称が意味する通りの職業であり、戦士とメイジの資質をあわせ", "A Warrior-Mage is precisely what the name suggests: a cross between the"],
    ["持ちます。彼らの同業者であるレンジャーが自然の魔法と生き抜くためのスキル", "warrior and mage classes. Unlike rangers who specialize in Nature magic"],
    ["に特化している一方、本当の魔法剣士はどちらの世界でも一番になろうとしてい", "and survival skills, true Warrior-Mages attempt to reach the best of both"],
    ["ます。戦士としては普通のメイジとは比べ物にならないほど優れています。しか", "worlds. As warriors they are much superior to the usual Mage class."],
    ["し、実際には魔法でも戦闘でも専門の職業には及ばず、戦士とメイジの中間に位", "Intelligence determines a Warrior-Mage's spell casting ability."],
    ["置するような職業です。魔法に必要な能力値は知能です。", ""],
    ["混沌の戦士は恐るべきカオスの魔王の使いとして恐れられる存在です。混沌の戦", "Chaos Warriors are the feared servants of the terrible Demon Lords of"],
    ["士はパトロンとなる悪魔を持ち、レベルが上がる度に報酬を得ることがあります", "Chaos. Every Chaos Warrior has a Patron Demon and, when gaining a level,"],
    ["。彼は治療してくれたり、こちらを変化させたり、能力値を上げてくれるかもし", "may receive a reward from his or her Patron. He or she might be healed or"],
    ["れませんし、回りに怪物達を出現させたり、能力値や装備を奪うかも知れません", "polymorphed, given an awesome weapon, or have his or her stats increased."],
    ["。もしくは単にこちらを無視するだけかもしれません。カオスの魔王は無秩序で", "On the other hand, the Patron might surround the Chaos Warrior with"],
    ["予測のつかない存在です。報酬の種類はパトロンとなる悪魔と偶然に依存します", "monsters, drain his or her stats, wreck his or her equipment, or simply"],
    ["（違う悪魔は異なる報酬を与えます）。魔法に必要な能力値は知能です。", "ignore the Chaos Warrior. The Demon Lords of Chaos are chaotic and"],
    ["修行僧は他の職業とは著しく異なる職業です。彼らは他の職業同様武器と防具を", "The Monk character class is very different from all other classes. Their"],
    ["使えますが、マーシャルアーツの訓練を積んでいるため、武器、防具なしでより", "training in martial arts makes them much more powerful with no armor or"],
    ["強力な存在となります。高レベルでは、必要な耐性を身につけるためある種の防", "weapons. To gain the resistances necessary for survival a monk may need to"],
    ["具を装備する必要がありますが、もしあまりに重すぎる防具を装備してしまうと", "wear some kind of armor, but if the armor he or she wears is too heavy, it"],
    ["、その体術に深刻な妨げとなります。レベルが上がると、彼らは新しい強力な攻", "will severely disturb his or her martial arts maneuvers. As the monk"],
    ["撃法を学び、防御能力も上昇します。魔法に必要な能力値は賢さです。", "advances levels, new, powerful forms of attack become available. Their"],
    ["超能力者は魔法のかわりにその精神の力を使う唯一の職業です。この力は超能力", "The Mindcrafter is a unique class that uses the powers of the mind instead"],
    ["者独特のもので、単に超感覚的なものから他人の精神を支配するものまで様々で", "of magic. These powers are unique to Mindcrafters, and vary from simple"],
    ["す。彼らの力はある種の訓練によって開発されるものなので、超能力者は力を使", "extrasensory powers to mental domination of others. Since these powers are"],
    ["うのに呪文書を必要としません。使える力は単純にキャラクタのレベルによって", "developed by the practice of certain disciplines, a Mindcrafter requires"],
    ["決まります。超能力に必要な能力値は賢さです。", "no spellbooks to use them. The available powers are simply determined by"],
    ["ハイメイジは一つの領域に特化し、その領域を通常のメイジよりはるかに深く学", "High-mages are mages who specialize in one particular field of magic and"],
    ["んだメイジです。１つの領域に特化したおかげで、彼らは自らが選択した領域の", "learn it very well - much better than the ordinary mage. For the price of"],
    ["呪文を唱える際の消費ＭＰ、最低レベル、失敗率で相当な恩恵を受けます。しか", "giving up a second realm of magic, they gain substantial benefits in the"],
    ["し、生命の領域ではプリーストほどうまくはなれないことには注意すべきです。", "mana costs, minimum levels, and failure rates in the spells of the realm"],
    ["魔法に必要な能力値は知能です。", "of their specialty. A high mage's prime statistic is intelligence as this"],
    ["観光客は観光のためにこの世界にやってきました。戦闘力が低く、強力な呪文を", "Tourists visit this world for the purpose of sightseeing. Their fighting"],
    ["使うこともできないため、最も生きぬいていくのが厳しい職業と言えます。魔法", "skills are bad, and they cannot cast powerful spells. They are the most"],
    ["ものまね師は戦闘力はそこそこありますが、自分から特殊な能力を使うことは全", "Imitators have enough fighting skills to survive, but rely on their"],
    ["くできません。しかし、自分の目の前にいる相手が特殊能力を使った場合、その", "ability to imitate monster spells. When monsters in line of sight use"],
    ["能力と全く同じ能力をそっくりそのまま使うことができます。ものまねに必要な", "spells, they are added to a temporary spell list which the imitator can"],
    ["能力は基本的に器用さですが、まねる特殊能力に関係ある他の能力も必要です。", "choose among. Spells should be imitated quickly, because timing and"],
    ["魔獣使いは変愚蛮怒世界のダンジョンに住む生物と心を通い合わせられます。彼", "Beastmasters are in tune with the minds of the creatures of the world of"],
    ["らは最もうまくモンスターを乗りこなすことができ、召喚したり手なづけたりし", "Hengband. They are very good at riding and have enough fighting ability."],
    ["たモンスターを自分の手足のように使います。魔法に必要な能力は魅力です。", "The monsters that a beastmaster summons or dominates become the"],
    ["スペルマスターは全ての魔法を極める者です。彼らは全分野において非常に優れ", "Sorcerers are the all-around best magicians, being able to cast any spell"],
    ["た魔法使いであり、あらゆる魔法書のすべての呪文を学習の手間なく使いこなす", "from most magic realms without having to learn it. On the downside, they"],
    ["ことができます。その反面、彼らは戦士としては最低で、どんな武器も満足に扱", "are the worst fighters in the dungeon, being unable to use any weapon but"],
    ["えません。魔術師の杖だけは例外ですが、武器としては使い物にならないでしょ", "a Wizardstaff."],
    ["う。すべての魔法をうまく生かさなければならないため、非常に上級者向けな職", ""],
    ["業と言えます。魔法に必要な能力は知能です。", ""],
    ["アーチャーは魔法を使うことはできませんが、どんな職業よりも巧みに弓やスリ", "Archers are to bows what warriors are to melee. They are the best class"],
    ["ングを使いこなします。大量の矢や弾を必要とするのは確かですが、岩石からス", "around with any bow, crossbow, or sling. They need a lot of ammunition,"],
    ["リング用の弾を作ったり、レベルが上がるとモンスターの骨やがらくたから矢を", "but will learn how to make it from junk found in the dungeon. An archer is"],
    ["作ったりする技術を身につけます。また、戦士と比べて隠密行動、知覚、探索、", "better than a warrior at stealth, perception, searching and magical"],
    ["魔法道具の使用などにも優れており、いざというときには魔法の道具に頼ること", "devices."],
    ["魔道具術師は杖、魔法棒、ロッドといった魔法のアイテムから魔力を取り込むこ", "Magic-Eaters can absorb the energy of wands, staffs, and rods, and can"],
    ["とによって魔法を使います。魔法のアイテムを発見することが他の職業よりもは", "then use these magics as if they were carrying all of these absorbed"],
    ["るかに重要になります。戦闘力は高くはないですが、そこそこの強さがあります", "devices. They are middling-poor at fighting. A Magic-Eater's prime"],
    ["。魔法に必要な能力は知能です。", "statistic is intelligence."],
    ["吟遊詩人は魔力を帯びた歌を歌うことができます。多くの歌は普通の魔法と異な", "Bards are something like traditional musicians. Their magical attacks are"],
    ["り、歌を歌っている間継続して効果を発揮します。しかし、同時に2つの歌を歌う", "sound-based, and last as long as the Bard has mana. Although a bard cannot"],
    ["ことができない、という欠点もあります。視界内全体に影響を及ぼす歌が多い、", "sing two or more songs at the same time, he or she does have the advantage"],
    ["という特徴もあります。肉体的な能力は貧弱で、単純に切りまくることで道を開", "that many songs affect all areas in sight. A bard's prime statistic is"],
    ["くことはできません。魔法に必要な能力は魅力です。", "charisma."],
    ["赤魔道師は全ての下級魔法を使うことができ、戦闘力も十分にあります。レベル", "Red-Mages can use almost all spells from lower rank spellbooks of most"],
    ["が上がると強力な能力「連続魔」を身につけることができます。しかし、魔法を", "realms without having to learn it. At higher level, they develop the"],
    ["覚えるスピードは遅く、上級魔法を使えないので、メイジほどには魔法を頼りに", "powerful ability \"Double Magic\". However, they have large penalties in the"],
    ["することができません。魔法道具使用と魔法防御はそこそこですが、それ以外の", "mana costs, minimum levels, and failure rates of spells, and they cannot"],
    ["技能は苦手です。魔法に必要な能力は知能です。", "use any spells from higher rank spellbooks. They are not bad at using"],
    ["剣術家は戦士に次ぐ戦闘力があり、様々な技を使うことができます。彼らのMPは", "Samurai, masters of the art of the blade, are the next strongest fighters"],
    ["レベルに依存せず、賢さだけで決まり、気合いをためることにより、最大値を越", "after Warriors. Their spellpoints do not depend on level, but depend"],
    ["えてMPを増やすことができます。しかし、戦士と同様、高レベルの魔法のアイテ", "solely on wisdom, and they can use the technique Concentration to"],
    ["ムは彼らの扱える範囲を越えており、罠の解除や探索の能力も高いとはいえませ", "temporarily increase SP beyond its usual maximum value. Samurai are not"],
    ["ん。必殺技の使用に必要な能力は賢さです。", "good at most other skills, and many magical devices may be too difficult"],
    ["練気術師は「気」を使う達人です。修行僧と同様、武器や防具を持たずに戦うこ", "A ForceTrainer is a master of the spiritual Force. They prefer fighting"],
    ["とを好み、武器・防具なしでより強力な存在となります。修行僧ほどの戦闘能力", "with neither weapons nor armor. They are not as good fighters as are"],
    ["はありませんが、修行僧と同様の魔法が使え、さらに「気」の力を操ります。武", "Monks, but they can use both magic and the spiritual Force. Wielding"],
    ["器を持つことや、重すぎる防具を装備することは、「気」の力の使用を妨げます", "weapons or wearing heavy armor disturbs use of the Force. Wisdom is a"],
    ["。魔法と練気術に必要な能力は賢さです。", "ForceTrainer's primary stat."],
    ["青魔道師は優れた魔法使いであり、その機知によって生き延びなければなりませ", "A Blue-Mage is a spell caster that must live by his or her wits, as a"],
    ["ん。メイジ等の他の魔法使いとの違いは魔法の覚え方で、青魔道師はモンスター", "Blue-Mage cannot hope to simply hack his or her way through the dungeon"],
    ["の魔法の効果を受けることでその魔法を覚えます。覚えるためには「ラーニング", "like a warrior. A major difference between the Mage and the Blue-Mage is"],
    ["」の状態になっていないといけません。魔法に必要な能力は知能です。", "the method of learning spells: a Blue-Mage may learn spells from monsters"],
    ["騎兵は馬に乗り戦場を駆け抜けるエリート戦士です。魔法は使えませんが、馬上", "Cavalry ride on horses into battle. Although they cannot cast spells, they"],
    ["からの圧倒的な攻撃力を誇る上に、高い機動力を生かした射撃をも得意としてい", "are proud of their overwhelming offensive strength on horseback. They are"],
    ["ます。レベルが上がれば、野生のモンスターにまたがり無理矢理手なずけること", "good at shooting. At high levels, they learn to forcibly saddle and tame"],
    ["ができます。彼らは己の肉体と精神に誇りを持ち、魔法道具にはあまり頼ろうと", "wild monsters. Since they take pride in the body and the soul, they don't"],
    ["狂戦士は怒り狂って武器を振るう恐るべき戦士です。全職業中最高の肉体能力を", "A Berserker is a fearful fighter indeed, immune to fear and paralysis. At"],
    ["誇り、恐怖と麻痺に対する耐性を持ち、レベルが上がればその強靭な肉体で矢の", "high levels, Berserkers can reflect bolt spells with their tough flesh."],
    ["呪文を跳ね返すことができます。さらに武器なしで戦うことや、呪いのかけられ", "Furthermore, they can fight without weapons, can remove cursed equipment"],
    ["た装備を力づくで剥がすことができ、いくつかの技を(反魔法状態でも)使うこと", "by force, and can even use their special combat techniques when surrounded"],
    ["ができます。しかし、巻物や魔法道具は全く使うことができず、罠の解除や隠密", "by an anti-magic barrier. Berserkers, however, cannot use any magical"],
    ["行動、探索、魔法防御、飛び道具の技能に関しては絶望的です。ひたすら殴って", "devices or read any scrolls, and are hopeless at all non-combat skills."],
    ["道を開くしかありません。幽霊は非常に勝利しやすいですがスコアがかなり低く", "Since Berserker Spectres are quite easy to *win* with, their scores are"],
    ["鍛冶師は武器や防具を自分で強化することができます。特殊効果を持つ武器や防", "A Weaponsmith can improve weapons and armor for him or herself. They can"],
    ["具から特殊効果の元となるエッセンスを取り出し、別の武器や防具にエッセンス", "extract the essences of special effects from weapons or armor which have"],
    ["を付加することによってその特殊効果を付加できます。ある程度の戦闘能力も持", "various special abilities, and can add these essences to another weapon or"],
    ["ちますが、魔法は一切使用できず、隠密や魔法防御の技能も低くなります。", "armor. They are good at fighting, but cannot cast spells, and are poor at"],
    ["鏡使いは、魔力の込められた鏡を作り出して、それを触媒として攻撃を行なうこ", "Mirror-Masters are spell casters; like other mages, they must live by"],
    ["とができる鏡魔法を使います。鏡使いは鏡の上で実力を発揮し、鏡の上では素早", "their wits. They can create magical mirrors, and employ them in the"],
    ["いテレポートが可能となります。魔法の鏡は、レベルによって一度に制御できる", "casting of Mirror-Magic spells. A Mirror-Master standing on a mirror has"],
    ["数が制限されます。鏡魔法に必要な能力は知能です。", "greater ability and, for example, can perform quick teleports. The maximum"],
    ["忍者は暗闇に潜む恐るべき暗殺者であり、光源を持たずに行動し、相手の不意を", "A Ninja is a fearful assassin lurking in darkness. He or she can navigate"],
    ["つき一撃で息の根を止めます。また、相手を惑わすための忍術も身につけます。", "effectively with no light source, catch enemies unawares, and kill with a"],
    ["罠やドアを見つける能力に優れ、罠の解除や鍵開けに熟達しています。軽装を好", "single blow. Ninjas can use Ninjutsu, and are good at locating hidden"],
    ["み、重い鎧や武器を装備すると著しく動きが制限され、また、盾を装備しようと", "traps and doors, disarming traps and picking locks. Since heavy armor,"],
    ["はしません。軽装ならば、レベルが上がるにつれより速くより静かに行動できま", "heavy weapons, or shields will restrict their motion greatly, they prefer"],
    ["す。さらに忍者は恐怖せず、成長すれば毒がほとんど効かなくなり、透明なもの", "light clothes, and become faster and more stealthy as they gain levels. A"],
    ["を見ることができるようになります。忍術に必要な能力は器用さです。", "Ninja knows no fear and, at high level, becomes almost immune to poison"],
    ["スナイパーは一撃必殺を狙う恐るべき射手です。精神を高めることにより、射撃", "Snipers are good at shooting, and they can kill targets by a few shots."],
    ["の威力と精度を高めます。また、魔法を使うことはできませんが、研ぎ澄まされ", "After they concentrate deeply, they can demonstrate their shooting"],
    ["た精神から繰り出される射撃術はさらなる威力をもたらすことでしょう。テクニ", "talents. You can see the incredible firepower of their shots."],
    ["ックが必要とされる職業です。", ""],
    ["元素使いはエレメンタルの力を駆使して戦う魔法使いです。扱える属性は限られ", "An Elementalist is a spell caster that specializes in tapping elemental"],
    ["ますが、その力を十二分に引き出すことができます。魔法に必要な能力は賢さで", "forces. They have a limited, but powerful, repertoire of spells. Wisdom"],
    ["ふつうは、特に特筆するべき部分がない性格です。あらゆる技能を平均的にこな", "\"Ordinary\" is a personality with no special skills or talents, with"],
    ["ちからじまんは、肉体的な能力や技能が上昇します。しかし、魔法に関係する能", "\"Mighty\" raises your physical stats and skills, but reduces stats and"],
    ["力や技能は劣り、戦士よりのステータスを持ちます。", "skills which influence magic. It makes your stats suitable for a warrior."],
    ["きれものは、肉体的な能力は下がりますが、知能や魔法に関係する技能は上昇し", "\"Shrewd\" reduces your physical stats, and raises your intelligence and"],
    ["、メイジよりのステータスを持ちます。", "magical skills. It makes your stats suitable for a mage. Also it directly"],
    ["しあわせものは、神を信仰する能力が高くなります。肉体的には平均的な能力を", "\"Pious\" deepens your faith in your God. It makes your physical ability"],
    ["持ち、プリーストに近いステータスとなります。", "average, and your stats suitable for priest."],
    ["すばしっこいは、どのスキルも比較的うまくこなしますが、肉体的な能力は低く", "\"Nimble\" improves most skills except for melee combat."],
    ["いのちしらずは、戦闘力、魔法能力の両方が上昇しますが、魔法防御、ＨＰとい", "\"Fearless\" raises both your melee and magical ability. Stats such as magic"],
    ["った能力は悪くなります。", "defense and constitution are reduced. Also it has a direct bad influence"],
    ["好きな食べ物は焼きビーフン。抑えてはいるが、冒険心旺盛な一匹狼。正義感、", "\"Combat\" gives you comparatively high melee and shooting abilities, and"],
    ["勇気とも平均以上だがカッとしやすい所もある。計画的人生より行き当たりばっ", "average constitution. Other skills such as stealth, magic defence, and"],
    ["たりの人生を選んでしまうタイプで、異性の扱いは苦手。", "magical devices are weakened. All \"Combat\" people have great respect for"],
    ["なまけものは、あらゆるスキルが低く、何をやってもうまくいきません。", "A \"Lazy\" person has no good stats and can do no action well. Also it has a"],
    ["セクシーギャルは、あらゆるスキルをうまくこなすことができます。しかし、そ", "\"Sexy\" rises all of your abilities, but your haughty attitude will"],
    ["の人をなめた性格は全てのモンスターを怒らせることになるでしょう。この性格", "aggravate all monsters. Only females can choose this personality."],
    ["は女性しか選ぶことができません。", ""],
    ["ラッキーマンは、能力値はなまけものに匹敵するくらい低いにもかかわらず、ど", "A \"Lucky\" man has poor stats, equivalent to a \"Lazy\" person. Mysteriously,"],
    ["んなことをしてもなぜかうまくいってしまいます。この性格は男性しか選ぶこと", "however, he can do all things well. Only males can choose this"],
    ["がまんづよいは、じっくりと物事にとりくむ慎重な性格で、他の性格に比べて高", "A \"Patient\" person does things carefully. Patient people have high"],
    ["い耐久力を得ることができます。しかし、自分から行動するのは苦手で、多くの", "constitution, and high resilience, but poor abilities in most other"],
    ["技能は低くなってしまいます。", "skills. Also it directly influences your hit-points."],
    ["いかさまは、初心者の練習用の性格です。あらゆる能力が高くなっています。こ", "\"Munchkin\" is a personality for beginners. It raises all your stats and"],
    ["の性格を使えば勝利者になることは容易ですが、勝利しても全く自慢になりませ", "skills. With this personality, you can win the game easily, but gain"],
    ["チャージマンは「こんなところ」に連れて行かれても仕方のない可愛そうなお友", "\"ChargeMan\" is a crazy killer. You are strong and tough but have poor"],
    ["達なんＤＡ。腕っ節やタフさはマンモス並みに強いのだけれど知能面はまるで駄", "intelligence. Since you're already insane, confusion and hallucinations do"],
    ["目なのが分かるだろう？この性格は最初から気が狂っているので、混乱したり幻", "not affect you."],
    ["覚を見る心配がないのです。", ""],
    ["生命は回復能力に優れた魔法です。治療や防御、感知魔法が多く含まれています", "Life magic is very good for healing; it relies mostly on healing,"],
    ["が、攻撃呪文もわずかに持っています。特に高レベルの呪文にはアンデッドを塵", "protection and detection spells. Also life magic has a few attack spells"],
    ["に帰す力をあると言われています。", "as well. It's said that some high level spells of life magic can"],
    ["仙術は「meta」領域であり、感知や鑑定、さらに退却用の呪文や自身の能力を高", "Sorcery is a `meta` realm, including enchantment and general spells. It"],
    ["める呪文などの便利な呪文が含まれています。しかし、直接攻撃用の呪文は持っ", "provides superb protection spells, spells to enhance your odds in combat"],
    ["自然の魔法は使用者を元素のマスターにします。これには防御、探知、治療と攻", "Nature magic makes you a master of the elements; it provides protection,"],
    ["撃呪文が含まれています。また、生命以外の領域で最高の治療呪文もこの領域に", "detection, curing and attack spells. Nature also has a spell of Herbal"],
    ["カオスの魔法は制御が困難で、予測のできない魔法もあります。カオスは非常に", "There are few types of magic more unpredictable and difficult to control"],
    ["非元素的であり、カオスの呪文は想像できる最も恐るべき破壊兵器です。この呪", "than Chaos magic. Chaos is the very element of unmaking, and the Chaos"],
    ["文を唱えるものはカオスの尖兵に対し、敵や自分自身さえも変異させるよう要求", "spells are the most terrible weapons of destruction imaginable. The caster"],
    ["黒魔術である暗黒の魔法ほど邪悪なカテゴリーはありません。これらの呪文は比", "There is no fouler nor more evil category of spells than the necromantic"],
    ["較的学ぶのが困難ですが、高レベルになると術者に生物とアンデッドを自由に操", "spells of Death Magic. These spells are relatively hard to learn, but at"],
    ["る能力を与えます。残念なことに、もっとも強力な呪文はその触媒として術者自", "higher levels the spells give the caster power over living and the"],
    ["身の血を必要とし、詠唱中にしばしば術者を傷つけます。", "(un)dead, but the most powerful spells need his / her own blood as the"],
    ["トランプの魔法はテレポート系の呪文で精選されたものを持っており、その出入", "Trump magic has, indeed, an admirable selection of teleportation spells."],
    ["り口は他の生物を召喚するためにも使えるため、召喚呪文から選りすぐられたも", "Since the Trump gateways can also be used to summon other creatures, Trump"],
    ["のも同様に持っています。しかし、この魔法によって全ての怪物が別の場所へ呼", "magic has an equally impressive selection of summoning spells. However,"],
    ["ばれるのを理解するわけではなく、もし召喚呪文に失敗するとその生物は敵とな", "not all monsters appreciate being drawn to another place by Trump user."],
    ["秘術の魔法は、全ての領域から有用な呪文だけを取り入れようとした多用途領域", "Arcane magic is a general purpose realm of magic. It attempts to encompass"],
    ["です。必要な「道具」的呪文を持っていても高レベルの強力な呪文は持っていま", "all 'useful' spells from all realms. This is the downside of Arcane magic:"],
    ["せん。結果として、全ての呪文書は街で買い求めることができます。また、他の", "while Arcane does have all the necessary 'tool' spells for a dungeon"],
    ["領域に存在する同様な呪文の方がより低レベル、低コストで唱えることができま", "delver, it has no ultra-powerful high level spells. As a consequence, all"],
    ["匠の魔法は、自分や道具を強化するための魔法が含まれています。魔法によって", "Craft magic can strengthen the caster or his or her equipment. These"],
    ["自分自身の戦闘力を非常に高めることができますが、相手を直接攻撃するような", "spells can greatly improve the caster's fighting ability. Using them"],
    ["呪文は含まれていません。", "against opponents directly is not possible."],
    ["悪魔の魔法は暗黒と同様非常に邪悪なカテゴリーです。様々な攻撃魔法に優れ、", "Demon is a very evil realm, same as Death. It provides various attack"],
    ["また悪魔のごとき知覚能力を得ることができます。高レベルの呪文は悪魔を自在", "spells and devilish detection spells. At higher levels, Demon magic"],
    ["に操り、自分自身の肉体をも悪魔化させることができます。", "provides the ability to dominate demons and to polymorph yourself into a"],
    ["破邪は「正義」の魔法です。直接敵を傷つける魔法が多く含まれ、特に邪悪な敵", "Crusade is a magic of 'Justice'. It includes damage spells, which are"],
    ["に対する力は恐るべきものがあります。しかし、善良な敵にはあまり効果があり", "greatly effective against foul and evil monsters, but have poor effects"],
    ["歌集は、歌によって効果を発揮する魔法です。魔法と同様、使った時に効果のあ", "Music magic works through the caster singing songs. There are two types of"],
    ["るものと、歌い続けることによって持続して効果を発揮するものがあります。後", "songs; one which shows effects instantly and another which shows effects"],
    ["者の場合は、MPの続く限り効果を発揮することができますが、同時に歌える歌は1", "continuously until SP runs out. The latter type has a limit: only one song"],
    ["つだけという制限もあります。", "can be sung at a time."],
    ["武芸の書は、様々な戦闘の技について書かれています。この本は技を覚えるとき", "The books of Kenjutsu describe various combat techniques. When learning"],
    ["に読む必要がありますが、一度覚えた技は使うのに本を持つ必要はありません。", "new techniques, you are required to carry the books, but once you memorize"],
    ["技を使うときには必ず武器を装備していなければいけません。", "them, you don't have to carry them. When using a technique, wielding a"],
    ["呪術は忌むべき領域です。複数の呪いの言葉を歌のように紡ぎながら詠唱します", "Hex is an unsavory realm, like the death and demon realms. Some of the"],
    ["。多くの呪文は詠唱し続けることによって効果が持続されます。呪文には相手の", "spells can act continuously by stringing together curses like a song."],
    ["行動を束縛するもの、ダメージを与えるもの、攻撃に対して反撃するものが多く", "Spells may obstruct monsters' actions, deal damage to monsters in sight,"],
    ["感知と防御と回復に優れています", "Good at detection and healing."],
    ["攻撃はできませんが非常に便利です", "Utility and protective spells."],
    ["感知と防御に優れています", "Good at detection and defence."],
    ["破壊的な攻撃に優れています", "Offensive and destructive."],
    ["生命のある敵への攻撃に優れています", "Ruins living creatures."],
    ["召喚とテレポートに優れています", "Good at summoning and teleportation."],
    ["やや弱いながらも非常に便利です", "Very useful but not as potent."],
    ["直接戦闘の補助に優れています", "Support for melee fighting."],
    ["攻撃と防御の両面に優れています", "Good at both offence and defence."],
    ["邪悪な怪物に対する攻撃に優れています", "Destroys evil creatures."],
    ["様々な魔法効果を持った歌を歌います", "Songs with magical effects."],
    ["打撃攻撃に特殊能力を付加します", "Special abilities for melee."],
    ["敵を邪魔しつつ復讐を狙います", "Good at obstacle and revenge."],
    // Character birth history & class explanation wrapped phrases
    ["あなたは呪いから生まれました。あなたはベトつくような緑の瞳", "You were born from a curse. You have sticky green eyes,"],
    ["と汚らしいワカメの様な髪を持ち、黒いガサガサの肌をしていま", "dirty seaweed-like hair, and rough black skin."],
    ["た精神から繰り出される射撃術はさらなる威力をもたらすことでしょう。テク", "disciplined mind brings even greater power to archery. It is"],
    ["た精神から繰り出されるSHT 術はさらなる威力をもたらすことでしょう。テク", "disciplined mind brings even greater power to archery. It is"],
    ["ニックが必要とされる職業です。", "a technical class requiring skill."],
    ["ニックがNEEDとされるClassです。", "a technical class requiring skill."],
    ["る事ができます。", "can perform."],
    ["きれものは、肉体的な能力は下がりますが、知能や魔法に関係する技能は上昇", "Clever characters have lower physical stats, but gain intelligence"],
    ["Clever  は、肉体的な能力は下がりますが、INT やMagic に関係する技能は上昇", "Clever characters have lower physical stats, but gain intelligence"],
    ["し、メイジよりのステータスを持ちます。", "and magic skills, leaning towards Mage abilities."],
    ["し、Mage  よりのステータスを持ちます。", "and magic skills, leaning towards Mage abilities."],
    ["お荷物です。あなたはグリーンの瞳となめらかな黒髪を持ち、漆", "black sheep of the family. You have green eyes, straight black hair, and a very"],
    ["黒の肌をしています。", "dark complexion."],
    ["of Speed薬", "Potion of Speed"],
    ["あなたの祖先は心を持たないof Hell低級な生物でした。あなたは", "Your ancestor was a mindless demonic spawn. You have"],
    ["あなたの祖先は心を持たない地獄の低級な生物でした。あなたは", "Your ancestor was a mindless demonic spawn. You have"],
    ["赤い肌と赤く燃える瞳をしていて、鉤爪と牙と刺が生えていま", "red skin, eyes like burning coals, claws, fangs, and spikes."],
    ["赤く燃える瞳をしていて、鉤爪と牙と刺が生えています。", "eyes like burning coals, claws, fangs, and spikes."],
    ["Sorceryの特徴", "Characteristics of Sorcery"],
    ["仙術の特徴", "Characteristics of Sorcery"],
    ["持ち物：", "Inven: "],
    ["装備：", "Equip: "],
    ["コマンド：", "Command:"],
    ["コマンド:", "Command:"],
    ["あなたは名の知れぬサイクロプスの子孫です。あなたは褐色の", "You are the offspring of an unknown Cyclops. You have brown"],
    ["あなたは名の知れぬCyclops     の子孫です。あなたは褐色の", "You are the offspring of an unknown Cyclops. You have brown"],
    ["瞳、なめらかな茶色い髪、そして暗い肌をしています。", "eyes, straight brown hair, and dark skin."],
    ["あなたは偉大なる長老たちの脳味噌が浮かんでいる母なる池でオ", "You were born in the elder brain spawning pool as a"],
    ["タマジャクシとして生まれました。あなたはヌルヌルした肌と輝", "tadpole. You have slimy skin, empty glowing eyes, and"],
    ["く空虚な目をしていて、口の周りに四x 触手が生えています。", "four tentacles around your mouth."],
    ["く空虚な目をしていて、口の周りに四本の触手が生えています。", "four tentacles around your mouth."],
    ["く空虚な目をしていて、口の周りに三x 触手が生えています。", "three tentacles around your mouth."],
    ["く空虚な目をしていて、口の周りに三本の触手が生えています。", "three tentacles around your mouth."],
    ["く空虚な目をしていて、口の周りに五x 触手が生えています。", "five tentacles around your mouth."],
    ["く空虚な目をしていて、口の周りに五本の触手が生えています。", "five tentacles around your mouth."],
    ["Magic 道具", "Magic Devices"],
    ["超越", "Transcend"],
    ["マインドフレ", "Mindflayer"],
    ["のMagic のEffectを受けることでそのMagic を覚えます。覚えるためには「ラーニン", "learn spells from monster magic. To learn, you must be in 'Learning'"],
    ["の魔法の効果を受けることでその魔法を覚えます。覚えるためには「ラーニン", "learn spells from monster magic. To learn, you must be in 'Learning'"],
    ["グ」の状態になっていないといけません。Magic にNEEDな能力はINT です。", "state. The primary stat for magic is Intelligence."],
    ["グ」の状態になっていないといけません。魔法に必要な能力は知能です。", "state. The primary stat for magic is Intelligence."],
    ["Lifeの特徴", "Characteristics of Life"],
    ["生命の特徴", "Characteristics of Life"],
    ["あなたは呪いから生まれました。あなたはうす汚れた茶色い骨で", "You were born from a curse. You are made of dirty brown bones,"],
    ["出来ていて、眼窩はからっぽです。", "and your eye sockets are empty."],
    ["あと 1 つの呪文を学べる。", "You can learn 1 more spell."],
    ["あと 2 つの呪文を学べる。", "You can learn 2 more spells."],
    ["あと 3 つの呪文を学べる。", "You can learn 3 more spells."],
    ["心配する必要はありません。彼らは物体を知覚するのに眼を利用していないた", "need to worry little about attacks. They do not use eyes for perceiving things,"],
    ["心配するNEEDはありません。彼らは物体を知覚するのに眼を利用していないた", "need to worry little about attacks. They do not use eyes for perceiving things,"],
    ["め、見えない物に騙されません。彼らの骨はとがった破片のようなものに耐性を", "and are thus not fooled by invisibility. Skeleton bones resist sharp shrapnel,"],
    ["め、見えない物に騙されません。彼らSkeletonはとがった破片のようなものにRestを", "and are thus not fooled by invisibility. Skeleton bones resist sharp shrapnel,"],
    ["持ち、レベルが上がれば冷気に対する耐性を獲得します。薬や食物の持つ効果は", "and they resist cold. Although the magical effects of potions and food"],
    ["持ち、LEVELが上がれば冷気に対するRestをAcquirementします。薬や食物の持つEffect", "and they resist cold. Although the magical effects of potions and food"],
    ["スケルトンの胃（存在しませんが）を通過することなくその力を発揮しますが、", "affect the skeleton even without entering a belly (which they lack),"],
    ["Skeleton humanの胃（存在しませんが）を通過することなくその力を発揮しますが、", "affect the skeleton even without entering a belly (which they lack),"],
    ["薬や食物自体は彼の顎を通り抜けて落ちてしまい、栄養を吸収することはできま", "the potion or food will fall through the jaws, giving no nutrition."],
    ["せん。その代わりに魔法棒や杖から魔力を吸収してエネルギー源にする事ができ", "Instead, they absorb mana from wands and staffs as an energy source."],
    ["せん。その代わりにMagic 棒や杖から魔力を吸収してエネルギー源にする事ができ", "Instead, they absorb mana from wands and staffs as an energy source."],
    ["あなたは名の知れぬサイクロプスの子孫です。あなたは暗褐色の", "You are the offspring of an unknown Cyclops. You have dark brown"],
    ["あなたは名の知れぬCyclops     の子孫です。あなたは暗褐色の", "You are the offspring of an unknown Cyclops. You have dark brown"],
    ["瞳、なめらかな黒い髪、そしてとても暗い肌をしています。", "eyes, straight black hair, and a very dark complexion."],
    ["あと 1 つの祈りを学べる。", "You can learn 1 more prayer."],
    ["あと 2 つの祈りを学べる。", "You can learn 2 more prayers."],
    ["あと 3 つの祈りを学べる。", "You can learn 3 more prayers."],
    ["器を持つことや、重すぎる防具を装備することは、「気」の力の使用を妨げま", "weapons or wearing heavy armor disturbs the use of the Force."],
    ["器を持つことや、重すぎる防具を装備することは、「気」のof Might使用を妨げま", "weapons or wearing heavy armor disturbs the use of the Force."],
    ["す。魔法と練気術に必要な能力は賢さです。", "Wisdom is a ForceTrainer's primary stat."],
    ["す。Magic と練気術にNEEDな能力はWIS です。", "Wisdom is a ForceTrainer's primary stat."],
    ["あなたは天界の主人です。あなたは悪を滅ぼすためにこの地に送", "You are a master of the celestials, sent to this land to"],
    ["られてきました。この目的を成し遂げるまでは休むことは許され", "exterminate evil. You are not allowed to rest until this deed is done."],
    ["大善", "Good"],
    ["大悪", "Evil"],
    ["これから", "Yet       "],
    ["あなたは地獄の呪われた子です。あなたはグレーター・デーモン", "You are a cursed child of Hell, born from the whim of a"],
    ["あなたはof Hell呪われた子です。あなたはグレーター・デーモン", "You are a cursed child of Hell, born from the whim of a"],
    ["の気まぐれによって生まれました。あなたは復讐の機会をうか", "Greater Daemon. You wait for an opportunity for revenge."],
    ["悪魔の上位種であるバルログは、強く、知的で、またタフでもあります。しか", "Balrogs are a higher class of demons. They are strong, intelligent and tough."],
    ["Daemonの上位種であるBalrog  は、強く、知的で、またタフでもあります。しか", "Balrogs are a higher class of demons. They are strong, intelligent and tough."],
    ["し、彼らは神を信じようとはせず、プリーストには全く向いていません。炎と地", "They do not believe in gods, and are not suitable for priest at all. Balrogs"],
    ["し、彼らは神を信じようとはせず、Priest    には全く向いていません。炎と地", "They do not believe in gods, and are not suitable for priest at all. Balrogs"],
    ["獄、経験値吸収への耐性を持っており、レベルが上がれば見えないものを見る能", "resist fire and nether, have a firm hold on their exp, and see invisible."],
    ["獄、EXP 値吸収へのRestを持っており、LEVELが上がれば見えないものを見る能", "resist fire and nether, have a firm hold on their exp, and see invisible."],
    ["力を獲得します。また、地獄や火炎のブレスを吐くこともできます。彼等はほと", "They can also breathe nether and fire. They are good at most skills"],
    ["力をAcquirementします。また、地獄やof Flameブレスを吐くこともできます。彼等はほ", "They can also breathe nether and fire. They are good at most skills"],
    ["んどの技能で優れていますが、静かに歩くことは苦手です。彼らは食物からほと", "except stealth. They gain very little nutrition from normal food,"],
    ["んど栄養を摂取できませんが、人間タイプを生贄にする事で精力を回復する事が", "and need human corpses as sacrifices to restore their energy."],
    ["んど栄養を摂取できませんが、Humanタイプを生贄にする事で精力を回復する事が", "and need human corpses as sacrifices to restore their energy."],
    ["あなたは第二世代のアンバー王族の認知されていない子供です。", "You are the unrecognized child of an Amberite royal."],
    ["あなたはブラウンの瞳と波打った茶髪を持ち、普通の肌色をして", "You have brown eyes, wavy brown hair, and an ordinary complexion."],
    ["あなたはブラウンの瞳と波打った茶髪を持ち、Normの肌色をして", "You have brown eyes, wavy brown hair, and an ordinary complexion."],
    ["です。彼らは知覚, 戦闘, 射撃に優れており、他の面でもかなり熟練していま", "Amberites excel in perception, combat, shooting, and are skilled in most ways."],
    ["です。彼らは知覚, 戦闘, SHT に優れており、他の面でもかなり熟練していま", "Amberites excel in perception, combat, shooting, and are skilled in most ways."],
    ["す。事実上あらゆるものを見てきており、新鮮なものはほとんどないため、彼ら", "Having seen virtually everything in existence, very little is new to them, so"],
    ["の成長は他のどの種族より遅いものです。彼らはとてもタフで頑強であり、彼ら", "they advance much slower than other races. They are very tough and hardy, and"],
    ["の成長は他のどのRaceより遅いものです。彼らはとてもタフで頑強であり、彼ら", "they advance much slower than other races. They are very tough and hardy, and"],
    ["の耐久力が下がることはありません。また、怪我をすぐに治す再生能力がありま", "their constitution cannot be reduced. They also regenerate wounds quickly."],
    ["のCON 力が下がることはありません。また、怪我をすぐに治す再生能力がありま", "their constitution cannot be reduced. They also regenerate wounds quickly."],
    ["構えなし", "No Stance"],
    ["あなたはニーベルングの鍛冶屋の何人かの子供のうちの一人で", "You are one of several children of a Nibelung smith."],
    ["あなたはNibelung    の鍛冶屋の何人かの子供のうちの一人で", "You are one of several children of a Nibelung smith."],
    ["す。あなたは一家のお荷物です。あなたは深いブラウンの瞳とな", "You are the family burden. You have deep brown eyes,"],
    ["めらかな黒髪、そして 1m20cm ほどのヒゲを持ち、 黒い肌をして", "straight black hair, a 1m20cm beard, and dark skin."],
    ["嫌われ、迫害されてきた小人族です。彼らは大抵のスキルをそつなくこなしま", "The hated and persecuted race of nocturnal dwarves, these cavedwellers are"],
    ["す。洞穴居住者である彼らは、暗闇に悩まされることはありませんし、生まれつ", "not much bothered by darkness. Their natural inclination to magical items"],
    ["す。洞穴居住者である彼らは、Darknessに悩まされることはありませんし、生まれつ", "not much bothered by darkness. Their natural inclination to magical items"],
    ["き持っている魔法のアイテムに対する嗜好のため、彼らは装備による魔法のボー", "has made them immune to effects which could drain away magical energy."],
    ["き持っているMagic のアイテムに対する嗜好のため、彼らは装備によるMagic のボー", "has made them immune to effects which could drain away magical energy."],
    ["ナスを奪う効果に耐性を持っています。", "They resist magical dis-enhancements and energy drain."],
    ["ナスを奪うEffectにRestを持っています。", "They resist magical dis-enhancements and energy drain."],
    ["具を装備する必要がありますが、もしあまりに重すぎる防具を装備してしまう", "armor to gain resistances, but wearing armor that is too heavy"],
    ["具を装備するNEEDがありますが、もしあまりに重すぎる防具を装備してしまう", "armor to gain resistances, but wearing armor that is too heavy"],
    ["と、その体術に深刻な妨げとなります。レベルが上がると、彼らは新しい強力な", "will severely disturb their martial arts maneuvers. As they gain levels,"],
    ["と、その体術に深刻な妨げとなります。LEVELが上がると、彼らは新しい強力な", "will severely disturb their martial arts maneuvers. As they gain levels,"],
    ["攻撃法を学び、防御能力も上昇します。魔法に必要な能力値は賢さです。", "they learn new attack forms and gain AC. Wisdom is a Monk's primary stat."],
    ["攻撃法を学び、DEF 能力も上昇します。Magic にNEEDな能力値はWIS です。", "they learn new attack forms and gain AC. Wisdom is a Monk's primary stat."],
    ["秘術の魔法書", "Arcane Spellbook"],
    ["生命の魔法書", "Life Spellbook"],
    ["仙術の魔法書", "Sorcery Spellbook"],
    ["自然の魔法書", "Nature Spellbook"],
    ["カオスの魔法書", "Chaos Spellbook"],
    ["暗黒の魔法書", "Death Spellbook"],
    ["トランプの魔法書", "Trump Spellbook"],
    ["匠の魔法書", "Craft Spellbook"],
    ["悪魔の魔法書", "Daemon Spellbook"],
    ["破邪の魔法書", "Crusade Spellbook"],
    ["(キャラクターの生い立ち - 編集済み)", "(Character Background - Edited)"],
    ["(キャラクターの生い立ち - 編集モード)", "(Character Background - Edit Mode)"],
    ["[ 'Q' 中断, 'S' 初めから, Enter ゲーム開始 ]", "[ 'Q' Abort, 'S' Restart, Enter Start Game ]"],
    ["[ カーソルキーで移動、Enterで終了、Ctrl-Aでファイル読み込み ]", "[ Cursor: Move, Enter: Done, Ctrl-A: Load File ]"],
    ["領域を選んで下さい(a-i) ('='初期オプション設定):", "Choose magic realm (a-i) ('=' for options):"],
    ["領域を選んで下さい(a-j) ('='初期オプション設定):", "Choose magic realm (a-j) ('=' for options):"],
    ["注意：魔法の領域の選択によりあなたが習得する呪文のタイプが決まります。", "Note: Your magic realm determines the spells you will learn."],
    ["何かキーを押してください", "Press any key to continue"],
    ["あなたは坑夫のドワーフの一粒種です。あなたは一家のお荷物で", "You are the only child of a Dwarven miner. You are the family"],
    ["す。あなたは深いブラウンの瞳となめらかな黒髪、そして 30cm", "burden. You have deep brown eyes, straight black hair, and a 30cm"],
    ["ほどのヒゲを持ち、黒い肌をしています。", "beard, and dark skin."],
    ["あなたは捕虜の影フェアリーの第二子です。あなたはグリーンの", "You are the second child of a captive Shadow Fairy. You have green"],
    ["瞳とわずかに肩にかかるくらいのなめらかなグレーの髪を持ち、", "eyes, straight grey hair that barely reaches your shoulders, and"],
    ["真珠色の肌をしています。", "pearlescent skin."],
    ["ません。ただしその場合でも隠密行動能力が下がり、また、自分自身の性格に", "monsters. Even then, their stealth is reduced, and it has no effect if"],
    ["よって反感をかっている場合には効果がありません。", "aggravation is caused by their own personality."],
    ["あなたの父はオークでしたが、それは秘密にされています。あな", "Your father was an Orc, but it is unacknowledged. You are the "],
    ["たは町人の養子です。あなたは家族に大切にされています。あな", "adopted child of a townsman. You are a well liked child. You  "],
    ["たはブラウンの瞳となめらかな黒髪を持ち、透き通るような白い", "have brown eyes, straight black hair, and a very fair "],
    ["肌をしています。", "complexion.    "],
    ["あなたは生前はバンパイア・ハンターでしたが、彼らの餌食と", "In life you were a Vampire Hunter, but they got you. You "],
    ["なってしまいました。あなたは白い髪、凶暴な黄色い瞳、そして", "have white hair, fierce yellow eyes, and a complexion as "],
    ["死人のように青ざめた肌をしています。", "pale as death. "],
    ["する耐性を持っています。また、冷気と毒に対する耐性も備えています。しか", "attacks. The Vampire also resists cold and poison based attacks. It is, "],
    ["し、新鮮な血液に常に飢えており、それは近くにいる生物から血液を吸うことに", "however, susceptible to its perpetual hunger for fresh blood, which can "],
    ["よってのみ満たされます。この強力な生物は深刻な弱点を持っています。太陽光", "only be satiated by sucking blood from nearby monsters. The bright rays "],
    ["線（や光源）は彼らの破滅を意味します。幸運にも、吸血鬼はその身体から「暗", "of sun are its bane, but it emits an aura of Dark Light. Darkness, on   "],
    ["黒の光」のオーラを放出しています。一方、暗闇は彼らをより強力にするもので", "the other hand, only makes the Vampire stronger.                        "],
    ["銅を鍛えし者", "Coppersmith"],
    ["鉄を鍛えし者", "Ironsmith"],
    ["鋼を鍛えし者", "Steelsmith"],
    ["銀を鍛えし者", "Silversmith"],
    ["竜を鍛えし者", "Dragonsmith"],
    ["霊を鍛えし者", "Spiritsmith"],
    ["魔を鍛えし者", "Magicsmith"],
    ["魂を鍛えし者", "Soulsmith"],
    ["神を鍛えし者", "Godsmith"],
    ["全を鍛えし者", "AlmightySmith"],
    ["領域を選んで下さい(a-a) ('='初期オプション設定):", "Choose magic realm (a-a) ('=' for options):"],
    ["領域を選んで下さい(a-b) ('='初期オプション設定):", "Choose magic realm (a-b) ('=' for options):"],
    ["領域を選んで下さい(a-c) ('='初期オプション設定):", "Choose magic realm (a-c) ('=' for options):"],
    ["領域を選んで下さい(a-d) ('='初期オプション設定):", "Choose magic realm (a-d) ('=' for options):"],
    ["領域を選んで下さい(a-e) ('='初期オプション設定):", "Choose magic realm (a-e) ('=' for options):"],
    ["領域を選んで下さい(a-f) ('='初期オプション設定):", "Choose magic realm (a-f) ('=' for options):"],
    ["領域を選んで下さい(a-g) ('='初期オプション設定):", "Choose magic realm (a-g) ('=' for options):"],
    ["領域を選んで下さい(a-h) ('='初期オプション設定):", "Choose magic realm (a-h) ('=' for options):"],
    ["暗黒の特徴", "Death Characteristic"],
    ["生命の特徴", "Life Characteristic "],
    ["仙術の特徴", "Sorcery Characteristic"],
    ["自然の特徴", "Nature Characteristic "],
    ["カオスの特徴", "Chaos Characteristic "],
    ["トランプの特徴", "Trump Characteristic "],
    ["匠の特徴", "Craft Characteristic "],
    ["悪魔の特徴", "Daemon Characteristic"],
    ["破邪の特徴", "Crusade Characteristic"],
    ["秘術の特徴", "Arcane Characteristic "],
    ["の特徴", ": Characteristic"],
    ["あなたは混沌の宮廷の爵位ある貴族の幾人かの子供のうちの一人", "You are one of several children of a Noble Family in the Courts"],
    ["です。あなたは一家の誇りです。あなたは淡い色の瞳と波打った", "of Chaos. You are a credit to the family. You have hazel eyes, "],
    ["茶髪を持ち、白い肌をしています。", "wavy brown hair, and a fair complexion. "],
    ["あなたの父親はクラウド・ジャイアントでした。あなたは自作農", "Your father was a Cloud Giant. You are the adopted child "],
    ["の養子です。あなたは一家の誇りです。あなたはブラウンの瞳と", "of a Yeoman. You are a credit to the family. You have brown "],
    ["なめらかな赤い髪を持ち、普通の肌色をしています。", "eyes, straight red hair, and an average complexion. "],
    ["秘術の魔法書", "Arcane Spellbook"],
    ["生命の魔法書", "Life Spellbook"],
    ["仙術の魔法書", "Sorcery Spellbook"],
    ["自然の魔法書", "Nature Spellbook"],
    ["カオスの魔法書", "Chaos Spellbook"],
    ["暗黒の魔法書", "Death Spellbook"],
    ["トランプの魔法書", "Trump Spellbook"],
    ["匠の魔法書", "Craft Spellbook"],
    ["悪魔の魔法書", "Daemon Spellbook"],
    ["破邪の魔法書", "Crusade Spellbook"],
    ["歌集", "Songbook"],
    ["(キャラクターの生い立ち - 編集済み)", "(Character Background - Edited)"],
    ["(キャラクターの生い立ち - 編集モード)", "(Character Background - Edit Mode)"],
    ["[ 'Q' 中断, 'S' 初めから, Enter ゲーム開始 ]", "[ 'Q' Abort, 'S' Restart, Enter Start Game ]"],
    ["[ カーソルキーで移動、Enterで終了、Ctrl-Aでファイル読み込み ]", "[ Cursor: Move, Enter: Done, Ctrl-A: Load File ]"],
    ["領域を選んで下さい(a-i) ('='初期オプション設定):", "Choose magic realm (a-i) ('=' for options):"],
    ["領域を選んで下さい(a-j) ('='初期オプション設定):", "Choose magic realm (a-j) ('=' for options):"],
    ["注意：魔法の領域の選択によりあなたが習得する呪文のタイプが決まります。", "Note: Your magic realm determines the spells you will learn."],
    ["何かキーを押してください", "Press any key to continue"],
    ["あなたは坑夫のドワーフの一粒種です。あなたは一家のお荷物で", "You are the only child of a Dwarven miner. You are the family"],
    ["す。あなたは深いブラウンの瞳となめらかな黒髪、そして 30cm", "burden. You have deep brown eyes, straight black hair, and a 30cm"],
    ["ほどのヒゲを持ち、黒い肌をしています。", "beard, and dark skin."],
    ["あなたはカバラの秘術によって木から作り出されました。", "You were shaped from wood by Cabbalistic magic."],
    ["あなたは職人の幾人かの子供のうちの一人です。あなたは一家の", "You are one of several children of a Craftsman. You are the"],
    ["誇りです。あなたはブルーグレイの瞳となめらかな茶髪を持ち、", "pride of the family. You have blue-gray eyes, straight brown hair,"],
    ["普通の肌色をしています。", "and an average complexion."],
    ["あなたはウラノスの子供です。あなたは褐色の瞳、波打った茶色", "You are the child of Uranus. You have hazel eyes, wavy brown"],
    ["い髪、そして平均的な肌の色をしています。", "hair, and an average complexion."],
  ];

  // Pre-sort by descending Japanese phrase length to avoid substring collisions
  const DEFAULT_ROW_TERMS = RAW_DEFAULT_ROW_TERMS.slice().sort((a, b) => b[0].length - a[0].length);

  const EQUIP_SLOTS = {
    '両手': 'Wielding',
    '右手': 'Right hand',
    '左手': 'Left hand',
    '射撃用': 'Shooting',
    '右手指': 'Right ring',
    '左手指': 'Left ring',
    '首': 'Neck',
    '光源': 'Light',
    '体': 'Body',
    '体の上': 'Cloak',
    '盾': 'Shield',
    '頭': 'Head',
    '手': 'Hands',
    '足': 'Feet'
  };

  for (const [ja, en] of DEFAULT_ROW_TERMS) {
    OVERRIDES[ja] = en;
  }
  let SORTED_OVERRIDE_KEYS = Object.keys(OVERRIDES).sort((a, b) => b.length - a.length);

  function load(data) {
    if (!data) return;
    NAMES = data.names || NAMES || {};
    KINDS = data.kinds || KINDS || [];
    BUCKETS = (data.templates && data.templates.buckets) ? data.templates.buckets : (data.buckets || BUCKETS || {});
    OVERRIDES = Object.assign({}, data.overrides || {});
    for (const [ja, en] of DEFAULT_ROW_TERMS) {
      if (!OVERRIDES[ja]) OVERRIDES[ja] = en;
    }
    SORTED_OVERRIDE_KEYS = Object.keys(OVERRIDES).sort((a, b) => b.length - a.length);
    COMPILED_BUCKETS.clear();
    lru.clear();
  }

  function isLoaded() {
    return Boolean(NAMES && (KINDS.length > 0 || Object.keys(NAMES).length > 0));
  }

  let assetsPromise = null;
  function loadAssets() {
    if (assetsPromise) return assetsPromise;
    if (typeof fetch === 'undefined') return Promise.resolve(false);
    const v = (typeof window !== 'undefined' && window.__ASSET_V) ? ('?v=' + window.__ASSET_V) : '';
    assetsPromise = Promise.all(['names', 'templates', 'kinds'].map(n =>
      fetch(`/js/heng/heng-${n}.json${v}`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching heng-${n}.json`);
        return r.json();
      })
    )).then(([names, templates, kinds]) => {
      load({ names, templates, kinds });
      return true;
    }).catch(err => {
      console.warn('[HengTranslate] Failed to load JSON assets:', err);
      return false;
    });
    return assetsPromise;
  }

  if (typeof window !== 'undefined') {
    window.loadHengLang = loadAssets;
    loadAssets();
  }

  function getCompiledBucket(key) {
    if (COMPILED_BUCKETS.has(key)) {
      return COMPILED_BUCKETS.get(key);
    }
    const rawList = BUCKETS && BUCKETS[key];
    if (!rawList || rawList.length === 0) {
      COMPILED_BUCKETS.set(key, []);
      return [];
    }
    const compiled = [];
    for (const item of rawList) {
      try {
        const re = new RegExp(item[0]);
        compiled.push([re, item[1], item[2]]);
      } catch (e) {
        // Skip malformed regex
      }
    }
    COMPILED_BUCKETS.set(key, compiled);
    return compiled;
  }

  function formatEn(enFormat, args, argTypes) {
    let argIdx = 0;
    return enFormat.replace(/%([0-9.]*)?([a-zA-Z^]+)|\{:[^}]*\}|\{\}/g, (match, width, spec) => {
      if (argIdx >= args.length) return match;
      let val = args[argIdx];
      const type = argTypes && argTypes[argIdx];
      argIdx++;
      if (type === 'cap_string' || (spec && spec.startsWith('^'))) {
        if (typeof val === 'string' && val.length > 0) {
          val = val.charAt(0).toUpperCase() + val.slice(1);
        }
      }
      return val !== undefined ? val : match;
    });
  }

  // --- translateName (§3.5.2) ---
  function translateName(ja, n, mode) {
    if (typeof ja !== 'string' || !ja) return ja;
    if (mode === 'jp') return ja;
    if (!CJK.test(ja)) return ja;

    const glyphMatch = ja.match(/^([!~()[\]/|?="$&*,.-])\s+(.*)$/);
    if (glyphMatch) {
      const glyph = glyphMatch[1];
      const sub = glyphMatch[2];
      const trSub = translateName(sub, n, mode);
      if (trSub !== sub && (mode === 'bilingual' || !CJK.test(trSub))) {
        return `${glyph} ${trSub}`;
      }
    }

    if (mode === 'bilingual') {
      const en = translateName(ja, n, 'en');
      if (en && en !== ja && !CJK.test(en)) {
        return `${ja}(${en})`;
      }
      return ja;
    }

    const cacheKey = `name:${ja}:${n || ''}`;
    return memo(cacheKey, () => {
      if (OVERRIDES[ja]) return OVERRIDES[ja];

      // 1. Strip trailing suffixes: (2d6), (+0,+0), [3,+0], {@q1}, (2,500ターンの寿命), etc.
      let base = ja;
      const suffixes = [];
      const suffixGroupMatch = base.match(/(?:\s*(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|<[^>]*>))+$/);
      if (suffixGroupMatch) {
        const rawSuffixGroup = suffixGroupMatch[0];
        base = base.slice(0, suffixGroupMatch.index).trimEnd();

        const segMatch = rawSuffixGroup.match(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|<[^>]*>/g);
        if (segMatch) {
          for (const seg of segMatch) {
            const turnMatch = seg.match(/^\(([\d,]+)\s*ターンの寿命\)$/);
            if (turnMatch) {
              suffixes.push(`(${turnMatch[1]} turns)`);
              continue;
            }
            const chargeMatch = seg.match(/^\(([\d,]+)\s*回分\)$/);
            if (chargeMatch) {
              suffixes.push(`(${chargeMatch[1]} charges)`);
              continue;
            }
            if (NAMES && NAMES[seg]) {
              const segEntry = NAMES[seg];
              suffixes.push(Array.isArray(segEntry) ? segEntry[0] : segEntry);
              continue;
            }
            // Retain dice, bonus, AC, inscriptions verbatim
            suffixes.push(seg);
          }
        }
      }

      let lvPrefix = '';
      const lvM = base.match(/^(Lv\d+\s+)(.*)$/);
      if (lvM) {
        lvPrefix = lvM[1];
        base = lvM[2];
      }

      // 2. Extract JP counter prefix: e.g. 6つの食料, 6つの 松明, 1つの食料, 3個の...
      let count = typeof n === 'number' ? n : 1;
      let hasExplicitCount = typeof n === 'number' && n > 1;
      const counterMatch = base.match(/^(\d+)\s*(?:つの|個|本|冊|枚|巻|匹|服|切れ|袋|組|振り|着|足|対|発|束)の?\s*(.+)$/);
      if (counterMatch) {
        count = parseInt(counterMatch[1], 10);
        hasExplicitCount = true;
        base = counterMatch[2].trim();
      }

      let enBase = null;

      // 3. Monster remains (corpse, skeleton, head, statue, figurine)
      const corpseM = base.match(/^(.+?)の(?:死体|死骸)$/);
      const skelM = !corpseM ? base.match(/^(.+?)の骨$/) : null;
      const headM = !corpseM && !skelM ? base.match(/^(.+?)の頭$/) : null;
      const statueM = !corpseM && !skelM && !headM ? base.match(/^(.+?)の像$/) : null;
      const figM = !corpseM && !skelM && !headM && !statueM ? base.match(/^(.+?)の人形$/) : null;

      if (corpseM) {
        const monJa = corpseM[1];
        const monEntry = NAMES && NAMES[monJa];
        if (monEntry) {
          const monEn = Array.isArray(monEntry) ? monEntry[0] : monEntry;
          enBase = (count > 1) ? `Corpses of ${monEn}` : `Corpse of ${monEn}`;
        }
      } else if (skelM) {
        const monJa = skelM[1];
        const monEntry = NAMES && NAMES[monJa];
        if (monEntry) {
          const monEn = Array.isArray(monEntry) ? monEntry[0] : monEntry;
          enBase = (count > 1) ? `Skeletons of ${monEn}` : `Skeleton of ${monEn}`;
        }
      } else if (headM) {
        const monJa = headM[1];
        const monEntry = NAMES && NAMES[monJa];
        if (monEntry) {
          const monEn = Array.isArray(monEntry) ? monEntry[0] : monEntry;
          enBase = (count > 1) ? `Heads of ${monEn}` : `Head of ${monEn}`;
        }
      } else if (statueM) {
        const monJa = statueM[1];
        const monEntry = NAMES && NAMES[monJa];
        if (monEntry) {
          const monEn = Array.isArray(monEntry) ? monEntry[0] : monEntry;
          enBase = (count > 1) ? `Statues of ${monEn}` : `Statue of ${monEn}`;
        }
      } else if (figM) {
        const monJa = figM[1];
        const monEntry = NAMES && NAMES[monJa];
        if (monEntry) {
          const monEn = Array.isArray(monEntry) ? monEntry[0] : monEntry;
          enBase = (count > 1) ? `Magical Figurines of ${monEn}` : `Magical Figurine of ${monEn}`;
        }
      }

      // 4. Flavored kind forms (e.g. スピードの薬 -> Potion of Speed)
      if (!enBase && KINDS && KINDS.length > 0) {
        for (const k of KINDS) {
          if (base.endsWith(k.jaSuffix)) {
            const stemJa = base.slice(0, -k.jaSuffix.length);
            const stemEntry = NAMES && NAMES[stemJa];
            if (stemEntry) {
              const stemEn = Array.isArray(stemEntry) ? stemEntry[0] : stemEntry;
              const tildePlural = (count > 1) ? 's' : '';
              enBase = k.en.replace(/~/g, tildePlural).replace('%s', stemEn);
              break;
            }
          }
        }
      }

      // 4b. Direct lookup in OVERRIDES (for compiled items with bonus suffixes)
      if (!enBase && OVERRIDES[base]) {
        enBase = OVERRIDES[base];
      }

      // 5. Direct lookup in NAMES
      if (!enBase && NAMES) {
        const entry = NAMES[base];
        if (entry) {
          if (Array.isArray(entry)) {
            enBase = (count > 1) ? entry[1] : entry[0];
          } else {
            enBase = entry;
          }
        }
      }

      // Atomic fallback: if base cannot be fully resolved, return original ja
      if (!enBase) return ja;

      let result = hasExplicitCount ? `${count} ${enBase}` : enBase;

      if (suffixes.length > 0) {
        result = `${result} ${suffixes.join(' ')}`;
      }
      if (lvPrefix) {
        result = `${lvPrefix}${result}`;
      }

      return result;
    });
  }

  // --- Helper to translate a single clause ---
  function translateClause(clause) {
    if (!CJK.test(clause)) return clause;
    if (OVERRIDES[clause]) return OVERRIDES[clause];

    // Determine bucket: leading 2 characters
    const leading2 = clause.slice(0, 2);
    const candidateBuckets = [leading2, '*'];

    for (const bKey of candidateBuckets) {
      const templates = getCompiledBucket(bKey);
      for (const [re, enFormat, argTypes] of templates) {
        const match = re.exec(clause);
        if (match) {
          const rawArgs = match.slice(1);
          const translatedArgs = [];
          for (let i = 0; i < rawArgs.length; i++) {
            const rawArg = rawArgs[i];
            const type = argTypes[i];
            if (type === 'string' || type === 'cap_string') {
              const trName = translateName(rawArg, 1, 'en');
              translatedArgs.push(trName);
            } else {
              translatedArgs.push(rawArg);
            }
          }
          return formatEn(enFormat, translatedArgs, argTypes);
        }
      }
    }

    // Try without trailing punctuation (。 or ！ or !)
    if (clause.endsWith('。') || clause.endsWith('！') || clause.endsWith('!')) {
      const stripped = clause.slice(0, -1);
      const punct = clause.slice(-1);
      const enPunct = (punct === '。') ? '.' : '!';
      const trStripped = translateClause(stripped);
      if (trStripped !== stripped && !CJK.test(trStripped)) {
        return trStripped.endsWith('.') || trStripped.endsWith('!') ? trStripped : trStripped + enPunct;
      }
    }

    // Generic item found pattern: e.g. "6つの食料を見つけた。" -> "You have found 6 Rations of Food."
    const foundMatch = clause.match(/^(.+?)を見つけた(?:。)?$/);
    if (foundMatch) {
      const item = translateName(foundMatch[1], undefined, 'en');
      if (item && !CJK.test(item)) {
        return `You have found ${item}.`;
      }
    }

    // Spell or prayer learning pattern: e.g. "あと 1 つの呪文を学べる。" -> "You can learn 1 more spell."
    const spM = clause.match(/^あと\s*(\d+)\s*つの(呪文|祈り)を学べる。?$/);
    if (spM) {
      const noun = (spM[2] === '祈り') ? 'prayer' : 'spell';
      return (spM[1] === '1') ? `You can learn 1 more ${noun}.` : `You can learn ${spM[1]} more ${noun}s.`;
    }

    return clause;
  }

  // --- translateLine (§3.5.1) ---
  function translateLine(ja, mode) {
    if (typeof ja !== 'string' || !ja) return ja;
    if (mode === 'jp') return ja;
    if (!CJK.test(ja)) return ja;

    const cacheKey = `line:${ja}:${mode}`;
    return memo(cacheKey, () => {
      if (OVERRIDES[ja]) return OVERRIDES[ja];

      // Option row check: e.g. "モンスターは失敗を学習する(*) : はい (smart_learn)"
      const optMatch = ja.match(/^(\s*)(.*?)\s*:\s*(はい|いいえ)(\s*\(.*?\))?(\s*)$/);
      if (optMatch) {
        const lead = optMatch[1];
        const promptJa = optMatch[2].trim();
        const valJa = optMatch[3];
        const rawOptVar = optMatch[4] ? optMatch[4].trim() : '';

        const promptEn = translateClause(promptJa);
        if (promptEn !== promptJa && !CJK.test(promptEn)) {
          let valEn = valJa === 'はい' ? 'Yes' : 'No';
          if (mode === 'bilingual') {
            valEn = valJa === 'はい' ? 'Yes(はい)' : 'No(いいえ)';
          }
          let leftPart = `${lead}${promptEn}`;
          if (leftPart.length < 47) leftPart = leftPart.padEnd(47, ' ');
          let valPart = `: ${valEn}`;
          let res;
          if (rawOptVar) {
            if (valPart.length < 9) valPart = valPart.padEnd(9, ' ');
            res = `${leftPart} ${valPart} ${rawOptVar}`;
          } else {
            res = `${leftPart} ${valPart}`;
          }
          if (!CJK.test(res)) return res;
        }
      }

      // Split chained sentences on Japanese delimiters 。 and ！
      const clauses = [];
      let last = 0;
      for (let i = 0; i < ja.length; i++) {
        const ch = ja[i];
        if (ch === '。' || ch === '！' || ch === '!') {
          clauses.push(ja.slice(last, i + 1));
          last = i + 1;
        }
      }
      if (last < ja.length) {
        clauses.push(ja.slice(last));
      }

      const translatedClauses = [];
      for (const clause of clauses) {
        translatedClauses.push(translateClause(clause));
      }

      let lineResult = translatedClauses.join(' ');

      // Atomicity Rule (D8):
      // If clauses didn't translate, try token-level row translation
      if (CJK.test(lineResult)) {
        let tokLine = ja;
        for (const [jTerm, eTerm] of DEFAULT_ROW_TERMS) {
          if (tokLine.includes(jTerm)) {
            tokLine = tokLine.split(jTerm).join(eTerm);
          }
        }
        if (!CJK.test(tokLine)) {
          return tokLine;
        }
        // If ANY CJK remains in the line, discard and return raw ja untouched
        return ja;
      }

      return lineResult;
    });
  }

  // --- translateRow (§3.5.3) ---
  function translateRow(text, attrs, mode, rowIdx) {
    if (typeof text !== 'string' || !text) return { text, attrs: attrs || '' };
    if (mode === 'jp') return { text, attrs: attrs || '' };
    if (!CJK.test(text)) return { text, attrs: attrs || '' };

    const cacheKey = `r:${mode}:${rowIdx !== undefined ? rowIdx : ''}:${text}:${attrs || ''}`;
    return memo(cacheKey, () => _translateRowInner(text, attrs, mode, rowIdx));
  }

  function _translateRowInner(text, attrs, mode, rowIdx) {

    function makeAttrs(newText, defaultAttr) {
      if (!attrs || attrs.length === 0) return '';
      if (attrs.length === newText.length) return attrs;
      const fillChar = defaultAttr || attrs[0] || '1';
      return attrs.slice(0, newText.length).padEnd(newText.length, fillChar);
    }

    // 1. Direct overrides check (full string or trimmed match)
    const trimmed = text.trim();
    if (trimmed === 'す。' || trimmed === 'ます。' || trimmed === 'あります。' || trimmed === 'ていません。' || trimmed === 'ありません。' || trimmed === 'できます。' || trimmed === 'します。' || trimmed === 'ません。' || trimmed === 'もあります。' || trimmed === 'る事もできます。' || trimmed === 'こともあります。' || trimmed === 'がっています。' || trimmed === 'しています。' || trimmed === 'います。' || trimmed === 'でしょう。' || trimmed === 'となります。' || trimmed === 'になります。' || trimmed === 'ん。' || trimmed === '目にはなりません。') {
      return { text: text.replace(trimmed, '.'), attrs: makeAttrs(text.replace(trimmed, '.')) };
    }
    if (OVERRIDES[trimmed]) {
      const replaced = text.replace(trimmed, OVERRIDES[trimmed]);
      if (!CJK.test(replaced)) {
        return { text: replaced, attrs: makeAttrs(replaced) };
      }
    }

    // 2. Wall message with optional multiplier
    const wallM = text.match(/^永久岩の壁が行く手をはばんでいる。(.*)$/);
    if (wallM) {
      const newText = `There is a permanent wall blocking your way.${wallM[1]}`;
      return { text: newText, attrs: makeAttrs(newText) };
    }

    // 3. Character prompts
    const namePrompt = text.match(/^キャラクターの名前を入力して下さい:\s*(.*)$/);
    if (namePrompt) {
      const newText = `Enter character's name: ${namePrompt[1]}`;
      return { text: newText, attrs: makeAttrs(newText) };
    }
    const createPrompt = text.match(/^キャラクターを作成します。\(.*?\)$/);
    if (createPrompt) {
      const newText = "Make your character. ('S' Restart, 'Q' Quit, '?' Help)";
      return { text: newText, attrs: makeAttrs(newText) };
    }
    const optPrompt = text.match(/^初期オプション.*$/);
    if (optPrompt) {
      const newText = "Birth Options ((*) affects score) (Return: Next, y/n: Change, ESC: Done, ?: Help)";
      return { text: newText, attrs: makeAttrs(newText) };
    }

    // 4. Multi-option choice rows (e.g. "a) 人間  b) ハーフエルフ  c) エルフ")
    const opts = text.match(/([a-zA-Z0-9*])\)\s*([\(\[\{]?[^\s\(\)\[\]]+[\)\]\}]?)/g);
    if (opts && opts.length >= 2) {
      let replaced = text;
      for (const opt of opts) {
        const m = opt.match(/^([a-zA-Z0-9*])\)\s*([\(\[\{]?)([^\s\(\)\[\]]+)([\)\]\}]?)$/);
        if (m) {
          const k = m[1];
          const lp = m[2];
          const lbl = m[3];
          const rp = m[4];
          const trans = OVERRIDES[lbl] || translateName(lbl, 1, mode);
          if (trans && trans !== lbl && !CJK.test(trans)) {
            replaced = replaced.replace(opt, `${k})${lp}${trans}${rp}`);
          }
        }
      }
      if (!CJK.test(replaced)) {
        return { text: replaced, attrs: makeAttrs(replaced) };
      }
    }

    // 5. List or equipment item with potential left sidebar
    const listSidebar = text.match(/^(.*?)(\s*[a-zA-Z]\))\s*(\S\s+)?(?:(両手|右手|左手|射撃用|右手指|左手指|首|光源|体の上|体|盾|頭|手|足)\s*:\s*)?(.*)$/);
    if (listSidebar && listSidebar[2]) {
      let leftSide = listSidebar[1];
      const letter = listSidebar[2];
      const sym = listSidebar[3] ? listSidebar[3].trim() : '';
      const slotJa = listSidebar[4];
      const rest = listSidebar[5];

      for (const [ja, en] of DEFAULT_ROW_TERMS) {
        if (leftSide.includes(ja)) {
          leftSide = leftSide.split(ja).join(en);
        }
      }
      if (CJK.test(leftSide)) {
        const leadWordMatch = leftSide.match(/^(\S+)(\s+)(.*)$/);
        if (leadWordMatch) {
          const transWord = translateLine(leadWordMatch[1], mode);
          if (transWord !== leadWordMatch[1] && !CJK.test(transWord)) {
            const wDiff = visualWidth(leadWordMatch[1]) - visualWidth(transWord);
            const spaces = Math.max(1, leadWordMatch[2].length + wDiff);
            leftSide = `${transWord}${' '.repeat(spaces)}${leadWordMatch[3]}`;
          }
        }
      }

      const origVw = visualWidth(text);
      const slotEn = slotJa ? (EQUIP_SLOTS[slotJa] || OVERRIDES[slotJa] || slotJa) : '';
      const prefix = `${leftSide}${letter} ${sym ? sym + ' ' : ''}${slotEn ? slotEn + ': ' : ''}`;

      let itemEn = rest;
      let tailTrimmed = '';
      if (rest.includes('(なし)')) {
        itemEn = rest.replace('(なし)', '(nothing)');
      } else if (rest.includes('(武器を両手持ち)')) {
        itemEn = rest.replace('(武器を両手持ち)', '(wielding with both hands)');
      } else {
        const wMatch = rest.match(/^(.*?)((\s{2,}[\d.]+\s?(?:kg|lb)\.?)?\s*)$/);
        if (wMatch) {
          const rawItem = wMatch[1].trim();
          tailTrimmed = (wMatch[2] || '').trim();
          itemEn = translateName(rawItem, 1, mode);
        }
      }

      let newRight;
      if (tailTrimmed) {
        const spacesNeeded = origVw - visualWidth(prefix) - visualWidth(itemEn) - visualWidth(tailTrimmed);
        const pad = ' '.repeat(Math.max(2, spacesNeeded));
        newRight = `${letter} ${sym ? sym + ' ' : ''}${slotEn ? slotEn + ': ' : ''}${itemEn}${pad}${tailTrimmed}`;
      } else {
        const spacesNeeded = origVw - visualWidth(prefix) - visualWidth(itemEn);
        const pad = spacesNeeded > 0 ? ' '.repeat(spacesNeeded) : '';
        newRight = `${letter} ${sym ? sym + ' ' : ''}${slotEn ? slotEn + ': ' : ''}${itemEn}${pad}`;
      }

      const combined = `${leftSide}${newRight}`;
      if (!CJK.test(combined)) {
        return { text: combined, attrs: makeAttrs(combined) };
      }
    }

    // 6. Simple list row matching (fallback for items without equipment slots)
    const listMatch = text.match(/^(\s*)([a-zA-Z])\)\s(.*?)((\s{2,}[\d.]+\s?(?:kg|lb)\.?)?\s*)$/);
    if (listMatch) {
      const indent = listMatch[1];
      const letter = listMatch[2];
      const itemJa = listMatch[3];
      const tail = listMatch[4];

      const itemEn = translateName(itemJa, undefined, mode);
      if (itemEn !== itemJa && !CJK.test(itemEn)) {
        const origVw = visualWidth(text);
        const prefix = indent + letter + ') ';
        const tailTrimmed = tail.trim();
        let newText;

        if (tailTrimmed) {
          const spacesNeeded = origVw - visualWidth(prefix) - visualWidth(itemEn) - visualWidth(tailTrimmed);
          const pad = ' '.repeat(Math.max(2, spacesNeeded));
          newText = prefix + itemEn + pad + tailTrimmed;
        } else {
          const spacesNeeded = origVw - visualWidth(prefix) - visualWidth(itemEn);
          const pad = spacesNeeded > 0 ? ' '.repeat(spacesNeeded) : '';
          newText = prefix + itemEn + pad;
        }
        return { text: newText, attrs: makeAttrs(newText) };
      }
    }

    // 7. Sidebar date row: e.g. "1日目  6:00 ...#########..."
    const dayMatch = text.match(/^(\d+)日目(\s+[\d:]+)(.*)$/);
    if (dayMatch) {
      const dayNum = dayMatch[1];
      const timeStr = dayMatch[2];
      const rest = dayMatch[3];
      const newHeader = `Day ${dayNum}${timeStr}`;
      const spacesNeeded = visualWidth(`${dayNum}日目${timeStr}`) - visualWidth(newHeader);
      const pad = spacesNeeded > 0 ? ' '.repeat(spacesNeeded) : '';
      const newText = newHeader + pad + rest;
      return { text: newText, attrs: makeAttrs(newText) };
    }

    // 8. General line / clause translation
    const translated = translateLine(text, mode);
    if (translated !== text && !CJK.test(translated)) {
      return { text: translated, attrs: makeAttrs(translated) };
    }

    // 9. Token-level replacement for stats & headers using pre-sorted DEFAULT_ROW_TERMS
    let tokRow = text;
    for (const [ja, en] of DEFAULT_ROW_TERMS) {
      if (tokRow.includes(ja)) {
        tokRow = tokRow.split(ja).join(en);
      }
    }
    if (!CJK.test(tokRow)) {
      return { text: tokRow, attrs: makeAttrs(tokRow) };
    }

    return { text, attrs: attrs || '' };
  }

  return {
    load,
    isLoaded,
    loadAssets,
    translateName,
    translateLine,
    translateRow,
    _lru: lru,
    visualWidth
  };
}));

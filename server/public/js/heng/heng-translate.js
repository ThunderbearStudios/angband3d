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
  const DEFAULT_ROW_TERMS = [
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
    ['体重', 'Weight']
  ];

  function load(data) {
    if (!data) return;
    NAMES = data.names || NAMES || {};
    KINDS = data.kinds || KINDS || [];
    BUCKETS = (data.templates && data.templates.buckets) ? data.templates.buckets : (data.buckets || BUCKETS || {});
    OVERRIDES = Object.assign({}, data.overrides || {});
    for (const [ja, en] of DEFAULT_ROW_TERMS) {
      if (!OVERRIDES[ja]) OVERRIDES[ja] = en;
    }
    COMPILED_BUCKETS.clear();
    lru.clear();
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
            // Retain dice, bonus, AC, inscriptions verbatim
            suffixes.push(seg);
          }
        }
      }

      // 2. Extract JP counter prefix: e.g. 6つの食料, 6つの 松明, 1つの食料, 3個の...
      let count = typeof n === 'number' ? n : 1;
      let hasExplicitCount = typeof n === 'number';
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
      // If ANY CJK remains in the line, discard and return raw ja untouched
      if (CJK.test(lineResult)) {
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

    // 1. List row matching: e.g. "  a) 6つの食料          3.0 kg"
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

        // Align attrs length to newText length
        let newAttrs = attrs || '';
        if (attrs && attrs.length > 0) {
          const itemAttrChar = attrs[prefix.length] || attrs[0] || '1';
          newAttrs = attrs.slice(0, prefix.length) +
            itemAttrChar.repeat(itemEn.length) +
            '1'.repeat(Math.max(0, newText.length - prefix.length - itemEn.length));
          if (newAttrs.length > newText.length) {
            newAttrs = newAttrs.slice(0, newText.length);
          }
        }
        return { text: newText, attrs: newAttrs };
      }
    }

    // 2. Sidebar date row: e.g. "1日目  6:00 ...#########..."
    const dayMatch = text.match(/^(\d+)日目(\s+[\d:]+)(.*)$/);
    if (dayMatch) {
      const dayNum = dayMatch[1];
      const timeStr = dayMatch[2];
      const rest = dayMatch[3];
      const newHeader = `Day ${dayNum}${timeStr}`;
      const spacesNeeded = visualWidth(`${dayNum}日目${timeStr}`) - visualWidth(newHeader);
      const pad = spacesNeeded > 0 ? ' '.repeat(spacesNeeded) : '';
      const newText = newHeader + pad + rest;
      const newAttrs = attrs ? attrs.slice(0, newText.length).padEnd(newText.length, '1') : '';
      return { text: newText, attrs: newAttrs };
    }

    // 3. Exact row terms or general line translation
    const translated = translateLine(text, mode);
    if (translated !== text) {
      const newAttrs = attrs ? (attrs.length === translated.length ? attrs : attrs[0].repeat(translated.length)) : '';
      return { text: translated, attrs: newAttrs };
    }

    return { text, attrs: attrs || '' };
  }

  return {
    load,
    translateName,
    translateLine,
    translateRow,
    _lru: lru,
    visualWidth
  };
}));

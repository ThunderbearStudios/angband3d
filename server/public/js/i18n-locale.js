/**
 * i18n-locale.js — Forward-Compatible Multilingual LocaleSpine & Hengband Kanji-Tutor Aid (WS82 Pillar 5)
 *
 * Unifies UI/Terminal language mode ('en' | 'bilingual' | 'jp' + future BCP-47 locales),
 * synchronizes Chronicle Narrator voice & language, normalizes Japanese engine messages for
 * ChronicleFilter's 37 story-beat classifiers, and powers interactive Kanji/Kana/Romaji
 * vocabulary hover/tap cards in Bilingual mode.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LocaleSpine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff]/;

  const LOCALE_REGISTRY = Object.freeze({
    en: {
      code: 'en',
      bcp47: 'en-GB',
      label: 'English',
      narratorLang: 'en',
      geminiVoice: 'Enceladus',
      directorStyle: 'British RP mythic chronicler'
    },
    bilingual: {
      code: 'bilingual',
      bcp47: 'ja-JP',
      label: 'Bilingual Study (EN + 日本語)',
      narratorLang: 'en',
      geminiVoice: 'Enceladus',
      directorStyle: 'Bilingual Bushido study mode'
    },
    jp: {
      code: 'jp',
      bcp47: 'ja-JP',
      label: '日本語 (Native Kanji)',
      narratorLang: 'jp',
      geminiVoice: 'Charon',
      directorStyle: '時代小説・五輪書風の落ち着いた語り部'
    }
  });

  // High-frequency Hengband Kanji reading & romaji glossary for the Kanji-Tutor learning aid
  const KANJI_TUTOR_READINGS = Object.freeze({
    '腕力': ['わんりょく', 'wanryoku', 'Strength (STR)'],
    '知能': ['ちのう', 'chinou', 'Intelligence (INT)'],
    '賢さ': ['かしこさ', 'kashikosa', 'Wisdom (WIS)'],
    '器用': ['きよう', 'kiyou', 'Dexterity (DEX)'],
    '耐久': ['たいきゅう', 'taikyuu', 'Constitution (CON)'],
    '魅力': ['みりょく', 'miryoku', 'Charisma (CHR)'],
    '体力': ['たいりょく', 'tairyoku', 'Hit Points / Stamina'],
    '魔力': ['まりょく', 'maryoku', 'Mana / Spell Power'],
    '防御': ['ぼうぎょ', 'bougyo', 'Armor Class (AC)'],
    '金貨': ['きんか', 'kinka', 'Gold Pieces (AU)'],
    '経験値': ['けいけんち', 'keikenchi', 'Experience Points'],
    '速度': ['そくど', 'sokudo', 'Movement & Action Speed'],
    '攻撃': ['こうげき', 'kougeki', 'Attack'],
    '呪文': ['じゅもん', 'jumon', 'Spell / Incantation'],
    '装備': ['そうび', 'soubi', 'Equipment'],
    '所持品': ['しょじひん', 'shojihin', 'Inventory'],
    '持物': ['もちもの', 'mochimono', 'Pack / Belongings'],
    '墓碑': ['ぼひ', 'bohi', 'Tombstone'],
    '薬': ['くすり', 'kusuri', 'Potion / Medicine'],
    '巻物': ['まきもの', 'makimono', 'Scroll'],
    '杖': ['つえ', 'tsue', 'Staff / Wand'],
    'たいまつ': ['たいまつ', 'taimatsu', 'Wooden Torch'],
    '毒': ['どく', 'doku', 'Poisoned'],
    '加速': ['かそく', 'kasoku', 'Hasted / Fast'],
    '盲目': ['もうもく', 'moumoku', 'Blind'],
    '混乱': ['こんらん', 'konran', 'Confused'],
    '朦朧': ['もうろう', 'mourou', 'Stunned'],
    '恐怖': ['きょうふ', 'kyoufu', 'Afraid / Terrified'],
    '麻痺': ['まひ', 'mahi', 'Paralyzed'],
    '空腹': ['くうふく', 'kuufuku', 'Hungry'],
    '街': ['まち', 'machi', 'Town'],
    '宿場町': ['しゅくばまち', 'shukubamachi', 'Post Town / Outpost'],
    '迷宮': ['めいきゅう', 'meikyuu', 'Dungeon / Labyrinth'],
    '階段': ['かいだん', 'kaidan', 'Stairs'],
    '武器': ['ぶき', 'buki', 'Weapon'],
    '鎧': ['よろい', 'yoroi', 'Armor'],
    '盾': ['たて', 'tate', 'Shield'],
    '弓': ['ゆみ', 'yumi', 'Bow'],
    '刀': ['かたな', 'katana', 'Katana / Blade'],
    '人間': ['にんげん', 'ningen', 'Human'],
    '戦士': ['せんし', 'senshi', 'Warrior'],
    '魔法使い': ['まほうつかい', 'mahoutsukai', 'Mage'],
    '僧侶': ['そうりょ', 'souryo', 'Priest'],
    '盗賊': ['とうぞく', 'touzoku', 'Rogue'],
    '侍': ['さむらい', 'samurai', 'Samurai'],
    '忍者': ['にんじゃ', 'ninja', 'Ninja'],
    '混沌のサーペント': ['こんとんのさーぺんと', 'Konton no Saapento', 'The Serpent of Chaos (Final Boss)'],
    'オベロン': ['おべろん', 'Oberon', 'Oberon, King of Amber'],
    'クエスト': ['くえすと', 'kuesuto', 'Quest / Royal Contract'],
    '賞金首': ['しょうきんくび', 'shoukin-kubi', 'Wanted Bounty Monster'],
    '闘技場': ['とうぎじょう', 'tougijou', 'Monster Arena'],
    '変愚蛮怒': ['へんぐばんど', 'Hengband', 'Hengband ("Strange Foolish Savage Fury")']
  });

  let _activeLang = 'en';
  let _narratorOverride = null; // null = follow mode ('jp'->'jp', 'en'/'bilingual'->'en'); or explicit 'en'|'jp'
  let _popoverEl = null;
  let _popoverBound = false;
  const _listeners = new Set();

  function getActiveRealm() {
    if (typeof window !== 'undefined') {
      if (window.__app && typeof window.__app.getActiveRealm === 'function') {
        return String(window.__app.getActiveRealm() || 'angband').toLowerCase();
      }
      if (window.__activeRealm) return String(window.__activeRealm).toLowerCase();
    }
    return 'angband';
  }

  function normalizeMode(mode) {
    const m = String(mode || 'en').toLowerCase().trim();
    if (m === 'jp' || m === 'ja' || m === 'ja-jp') return 'jp';
    if (m === 'bilingual' || m === 'bi' || m === 'study') return 'bilingual';
    return 'en';
  }

  function getMode() {
    if (typeof window !== 'undefined' && window.__langMode) {
      _activeLang = normalizeMode(window.__langMode);
    }
    return _activeLang;
  }

  function getNarratorLanguage(realmKey) {
    const rk = String(realmKey || getActiveRealm() || 'angband').toLowerCase();
    if (rk !== 'hengband') return 'en';
    if (_narratorOverride === 'jp' || _narratorOverride === 'en') return _narratorOverride;
    const mode = getMode();
    return mode === 'jp' ? 'jp' : 'en';
  }

  function setNarratorOverride(langOrNull) {
    _narratorOverride = (langOrNull === 'jp' || langOrNull === 'en') ? langOrNull : null;
    if (typeof window !== 'undefined') {
      window.__narratorLangOverride = _narratorOverride;
      try {
        if (window.localStorage) {
          if (_narratorOverride) localStorage.setItem('angband3d_narrator_lang_override', _narratorOverride);
          else localStorage.removeItem('angband3d_narrator_lang_override');
        }
      } catch (_) {}
    }
    syncChronicleNarrator(getActiveRealm(), getMode());
    return getNarratorLanguage();
  }

  function getNarratorVoiceForLocale(realmKey, gender = 'male', explicitLang = null) {
    const rk = String(realmKey || 'angband').toLowerCase();
    const effLang = explicitLang ? normalizeMode(explicitLang) : null;
    if (rk === 'hengband' && effLang === 'jp') {
      return gender === 'female' ? 'Aoede' : 'Enceladus';
    }
    if (gender === 'female') {
      if (rk === 'silq') return 'Despina';
      if (rk === 'frogcomposband') return 'Kore';
      if (rk === 'hengband') return 'Sulafat';
      return 'Zephyr';
    }
    return 'Enceladus';
  }

  function syncChronicleNarrator(realmKey, mode) {
    if (typeof window === 'undefined') return;
    const rk = String(realmKey || getActiveRealm() || 'angband').toLowerCase();
    const normMode = normalizeMode(mode || getMode());
    const narrLang = (rk === 'hengband') ? (_narratorOverride || (normMode === 'jp' ? 'jp' : 'en')) : 'en';
    window.__narratorLang = narrLang;
    const cm = window.chronicleManager;
    if (cm) {
      if (cm.audio) {
        cm.audio.activeRealm = rk;
        cm.audio.langMode = narrLang;
      }
      if (typeof cm.updateLanguageUI === 'function') {
        try { cm.updateLanguageUI(); } catch (_) {}
      }
    }
  }

  function setMode(mode, options = {}) {
    const norm = normalizeMode(mode);
    _activeLang = norm;
    if (typeof window !== 'undefined') {
      window.__langMode = norm;
      window.__currentLanguage = norm;
      try {
        if (window.localStorage && options.persist !== false) {
          localStorage.setItem('hengband_lang', norm);
        }
      } catch (_) {}
      ['hengband-lang-select', 'main-menu-hengband-lang-select', 'rc-hengband-lang-select'].forEach((id) => {
        const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
        if (el && el.value !== norm) el.value = norm;
      });
    }
    const rk = options.realm || getActiveRealm();
    syncChronicleNarrator(rk, norm);
    for (const fn of _listeners) {
      try { fn(norm, rk); } catch (_) {}
    }
    return norm;
  }

  function onModeChange(fn) {
    if (typeof fn === 'function') _listeners.add(fn);
    return () => _listeners.delete(fn);
  }

  /**
   * Normalizes raw Japanese Hengband messages to English strictly for ChronicleFilter
   * regex classification so all 37 narrative beat detectors fire in JP and Bilingual modes.
   */
  function normalizeMessageForChronicle(rawMsg, realmKey) {
    const s = String(rawMsg || '');
    if (!s || !CJK_RE.test(s)) return s;
    const rk = String(realmKey || getActiveRealm() || '').toLowerCase();
    if (rk && rk !== 'hengband') return s;
    const ht = (typeof window !== 'undefined' && window.HengTranslate) ||
      (typeof globalThis !== 'undefined' && globalThis.HengTranslate) || null;
    if (ht && typeof ht.translateLine === 'function' && (!ht.isLoaded || ht.isLoaded())) {
      try {
        const en = ht.translateLine(s, 'en');
        if (en && en !== s) return en.replace(/\s*\[[^\]]*[\u3040-\u30ff\u3400-\u9fff][^\]]*\]/g, '').trim();
      } catch (_) {}
    }
    return s;
  }

  /**
   * Looks up Kanji/Kana reading + English meaning for a Japanese token or bilingual phrase.
   */
  function lookupVocabTerm(term) {
    const raw = String(term || '').trim();
    if (!raw) return null;
    // Extract CJK portion if given "Attack (攻撃)" or "たいまつ [Wooden Torch]"
    const parenMatch = raw.match(/\(([\u3040-\u30ff\u3400-\u9fff]+)\)/) || raw.match(/([\u3040-\u30ff\u3400-\u9fff]{1,14})/);
    const jaKey = parenMatch ? parenMatch[1] : raw;
    if (!CJK_RE.test(jaKey)) return null;

    if (KANJI_TUTOR_READINGS[jaKey]) {
      const [kana, romaji, gloss] = KANJI_TUTOR_READINGS[jaKey];
      return { kanji: jaKey, kana, romaji, gloss };
    }

    // Check longest matching substring in KANJI_TUTOR_READINGS
    let bestSub = null;
    for (const k of Object.keys(KANJI_TUTOR_READINGS)) {
      if (jaKey.includes(k) && (!bestSub || k.length > bestSub.length)) {
        bestSub = k;
      }
    }

    const ht = (typeof window !== 'undefined' && window.HengTranslate) ||
      (typeof globalThis !== 'undefined' && globalThis.HengTranslate) || null;
    let dictGloss = '';
    if (ht && typeof ht.translateName === 'function') {
      try {
        const tr = ht.translateName(jaKey, 1, 'en');
        if (tr && tr !== jaKey) dictGloss = tr;
      } catch (_) {}
    }
    if (!dictGloss && ht && typeof ht.translateLine === 'function') {
      try {
        const tr = ht.translateLine(jaKey, 'en');
        if (tr && tr !== jaKey) dictGloss = tr;
      } catch (_) {}
    }

    if (bestSub) {
      const [kana, romaji, subGloss] = KANJI_TUTOR_READINGS[bestSub];
      return {
        kanji: jaKey,
        kana: jaKey === bestSub ? kana : `${bestSub}: ${kana}`,
        romaji,
        gloss: dictGloss || subGloss
      };
    }

    if (dictGloss) {
      return { kanji: jaKey, kana: '', romaji: '', gloss: dictGloss };
    }
    return null;
  }

  function ensurePopoverBound() {
    if (_popoverBound || typeof document === 'undefined' || !document.body) return;
    _popoverBound = true;
    _popoverEl = document.createElement('div');
    _popoverEl.id = 'heng-vocab-popover';
    _popoverEl.className = 'heng-vocab-popover hidden';
    _popoverEl.setAttribute('role', 'tooltip');
    document.body.appendChild(_popoverEl);

    const showForTarget = (target, clientX, clientY) => {
      if (getMode() === 'en' && getActiveRealm() !== 'hengband') {
        _popoverEl.classList.add('hidden');
        return;
      }
      const chip = target && target.closest ? target.closest('[data-kanji-term], .heng-kanji-chip, .stat-item, .footer-badge') : null;
      const text = chip ? (chip.getAttribute('data-kanji-term') || chip.textContent || '') : '';
      if (!text || !CJK_RE.test(text)) {
        _popoverEl.classList.add('hidden');
        return;
      }
      const info = lookupVocabTerm(text);
      if (!info) {
        _popoverEl.classList.add('hidden');
        return;
      }
      _popoverEl.textContent = '';
      const topRow = document.createElement('div');
      const kSpan = document.createElement('span');
      kSpan.className = 'heng-vocab-kanji';
      kSpan.textContent = info.kanji;
      topRow.appendChild(kSpan);
      if (info.kana || info.romaji) {
        const rSpan = document.createElement('span');
        rSpan.className = 'heng-vocab-reading';
        rSpan.textContent = [info.kana, info.romaji].filter(Boolean).join(' · ');
        topRow.appendChild(rSpan);
      }
      const gDiv = document.createElement('div');
      gDiv.className = 'heng-vocab-gloss';
      gDiv.textContent = info.gloss;
      _popoverEl.appendChild(topRow);
      _popoverEl.appendChild(gDiv);
      _popoverEl.classList.remove('hidden');

      const x = Math.min((window.innerWidth || 1024) - 304, Math.max(8, (clientX || 120) + 12));
      const y = Math.min((window.innerHeight || 768) - 96, Math.max(8, (clientY || 120) - 56));
      _popoverEl.style.left = `${x}px`;
      _popoverEl.style.top = `${y}px`;
    };

    document.addEventListener('mouseover', (e) => {
      if (getActiveRealm() !== 'hengband') return;
      showForTarget(e.target, e.clientX, e.clientY);
    }, { passive: true });

    document.addEventListener('mouseout', (e) => {
      if (!_popoverEl || _popoverEl.classList.contains('hidden')) return;
      const rel = e.relatedTarget;
      if (!rel || !rel.closest || !rel.closest('[data-kanji-term], .heng-kanji-chip, .stat-item, .footer-badge')) {
        _popoverEl.classList.add('hidden');
      }
    }, { passive: true });
  }

  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage && localStorage.getItem('hengband_lang');
      if (saved) _activeLang = normalizeMode(saved);
      const savedNarr = window.localStorage && localStorage.getItem('angband3d_narrator_lang_override');
      if (savedNarr === 'jp' || savedNarr === 'en') _narratorOverride = savedNarr;
    } catch (_) {}
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensurePopoverBound, { once: true });
      } else {
        ensurePopoverBound();
      }
    }
  }

  return {
    LOCALE_REGISTRY,
    KANJI_TUTOR_READINGS,
    normalizeMode,
    getMode,
    setMode,
    onModeChange,
    onChange: onModeChange,
    getNarratorLanguage,
    setNarratorOverride,
    getNarratorVoiceForLocale,
    syncChronicleNarrator,
    normalizeMessageForChronicle,
    lookupVocabTerm,
    ensurePopoverBound
  };
});

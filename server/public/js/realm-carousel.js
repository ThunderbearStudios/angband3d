/**
 * realm-carousel.js — Nostalgia RPG Collector Card Carousel & Top-Level Onboarding Flow (WS82 Pillar 8)
 *
 * Implements the streamlined RPG onboarding hierarchy:
 *   Splash Screen -> Realm Collector Card Carousel ([◀ Prev] [Card] [Next ▶] + [Select Realm] + [▶ Resume])
 *   -> Realm-Attuned Main Menu -> Character Creation (Random or Custom) -> Play
 *
 * Preserves canonical `#realm-selector-modal` and `#btn-close-realm-modal` IDs for full UI contract parity,
 * uses authentic license-clean nostalgia plates for all 8 classic realms (custom plate strictly for RYOD),
 * and eliminates engine subprocess/WASM prewarm thrashing while browsing cards.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RealmCarousel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REALM_CARDS = Object.freeze([
    {
      id: 'angband',
      crest: '👑',
      title: 'Vanilla Angband 4.2.6',
      subtitle: 'Beneath the Iron Hell of Thangorodrim',
      era: '1990 • Tolkien High Fantasy',
      engineBadge: 'Instant Browser WASM + Cloud Vault',
      depthSpan: '100 Floors (5,000 ft)',
      goal: 'Fell Sauron & Morgoth',
      cadence: 'Strategic Deep Delve',
      art: '/assets/realms/angband.webp',
      fit: 'cover',
      hook: 'Descend a hundred floors beneath Middle-earth into Morgoth’s Iron Fortress. Master town logistics, legendary Tolkienean artifacts, elemental resistance puzzles, and deadlier vaults at your own pace.',
      pillars: [
        ['100-Floor Ascent of Power', 'Return freely to Town shops, stockpile potions and scrolls, and prepare before challenging Sauron (DL 99) and Morgoth (DL 100).'],
        ['Artifact & Resistance Mastery', 'Wield Glamdring, Ringil, and the Phial of Galadriel while weaving Acid, Fire, Poison, Chaos, and Nether wards.'],
        ['6-Book Arcane & Divine Tomes', 'Eleven classic races and nine classes with distinct spellbooks, prayers, rods, wands, and monster-memory lore.']
      ]
    },
    {
      id: 'silq',
      crest: '💎',
      title: 'Sil-Q 1.5.0',
      subtitle: 'Stealth, Song & Smithing in the First Age',
      era: 'First Age Beleriand • Tactical',
      engineBadge: 'Native C Engine • Tight 20 Floors',
      depthSpan: '50 ft – 1,000 ft + Escape',
      goal: 'Wrest a Silmaril from the Crown',
      cadence: 'No Town • Every Turn Matters',
      art: '/assets/realms/silq.webp',
      fit: 'cover',
      hook: 'Infiltrate Angband in the Elder Days not to conquer Morgoth, but to cut a single Silmaril from his Iron Crown with the knife Angrist—and survive the collapsing ascent back to the stars.',
      pillars: [
        ['Stealth & Sound Ecology', 'Slip past sleeping balrogs and orc patrols unspotted; light, armor weight, and song reverberation govern awareness.'],
        ['Woven Songs & Mithril Smithing', 'Chant First-Age Elven songs of Lorien, Silence, and Sharpness, and forge bespoke runes at subterranean anvils.'],
        ['Opposed 2d10 Combat Rolls', 'Transparent tactical dice math where positioning, flanking, weapon weight, and poise decide every clash.']
      ]
    },
    {
      id: 'dcss',
      crest: '🐙',
      title: 'Dungeon Crawl Stone Soup',
      subtitle: 'Runes of Zot & the Twenty-Six Gods',
      era: '1997 • Linley’s Dungeon Crawl',
      engineBadge: 'Instant Browser Worker + Cloud Vault',
      depthSpan: 'Multi-Branch + Zot:5 + Ascent',
      goal: 'Claim 3+ Runes & the Orb of Zot',
      cadence: 'Anti-Grind Tactical Action',
      art: '/assets/realms/dcss.webp',
      fit: 'contain',
      hook: 'Pledge yourself to eccentric gods in the Ecumenical Temple, branch into the Lair, Orcish Mines, Snake Pit, and Vaults, claim three Runes of Zot, and sprint upward with the Orb.',
      pillars: [
        ['Living Pantheon & Piety', 'Serve Okawaru, Trog, Vehumet, Sif Muna, Yredelemnul, or Xom—unlocking divine invocations and risking divine wrath.'],
        ['27 Wild Species & Auto-Explore', 'Play Minotaur Berserkers, Deep Elf Conjurers, Gargoyles, or Octopodes with zero tedious grinding (`o` auto-explore).'],
        ['Multi-Branch Rune Architecture', 'Choose which deadly side-branches to raid for the three Runes required to unseal the Realm of Zot.']
      ]
    },
    {
      id: 'nethack',
      crest: '🔮',
      title: 'NetHack 3.6.7',
      subtitle: 'The Mazes of Menace & Amulet of Yendor',
      era: '1987 • The DevTeam Thinks of Everything',
      engineBadge: 'Instant Browser Worker + Cloud Vault',
      depthSpan: 'Dungeons, Mines, Sokoban & Gehennom',
      goal: 'Offer the Amulet on the Astral Plane',
      cadence: 'Emergent Sandbox Alchemy',
      art: '/assets/realms/nethack.webp',
      fit: 'contain',
      hook: 'Every potion, altar, fountain, cockatrice corpse, and faithful pet obeys interlocking physical laws. Outsmart shopkeepers, solve Sokoban, and ascend to the Astral Plane.',
      pillars: [
        ['Blessed, Uncursed & Cursed (BUC)', 'Test items on faithful pets or co-aligned altars, dip blades into sparkling fountains for Excalibur, and write scrolls with magic markers.'],
        ['Polymorph, Wishes & Intrinsics', 'Gain telepathy, fire resistance, and reflection from monster traits—or rub a magic lamp for a game-changing Wish.'],
        ['Iconic Multi-Branch Quest', 'Delve the Gnomish Mines, Oracle of Delphi, Sokoban puzzles, Medusa’s Island, the Castle, and fiery Gehennom.']
      ]
    },
    {
      id: 'brogue',
      crest: '🔥',
      title: 'Brogue (Community Edition)',
      subtitle: 'Luminous Chasms, Staves & Emergent Physics',
      era: '2009 • Brian Walker Masterpiece',
      engineBadge: 'Instant Browser Worker + Cloud Vault',
      depthSpan: '26 Floors + Lumenstone Depths',
      goal: 'Retrieve the Amulet on Depth 26',
      cadence: 'Classless Build-By-Enchantment',
      art: '/assets/realms/brogue.webp',
      fit: 'cover',
      hook: 'No character classes, no XP grinding—your build is forged entirely by where you invest precious Scrolls of Enchantment amid subterranean lakes, explosive bog gas, and chasm bridges.',
      pillars: [
        ['Universal Enchantment Economy', 'Pour Enchantment scrolls into a Broadsword, Staff of Lightning, Ring of Clairvoyance, or Wand of Polymorph to define your build.'],
        ['Ignitable Gas, Lava & Chasms', 'Spark explosive swamp gas, burn wooden bridges beneath ogres, leap chasms, and use bioluminescent fungi for tactical sightlines.'],
        ['Liberated Captive Allies', 'Free chained monkeys, mystic dar priestesses, ogres, and dragons who fight beside you and learn new powers.']
      ]
    },
    {
      id: 'frogcomposband',
      crest: '🐸',
      title: 'FrogComposBand 7.1.1',
      subtitle: 'Chronicles of Amber & Playable Monster Kin',
      era: 'ZAngband • PosChengband Epic',
      engineBadge: 'Native C Engine • Overland + 18 Dungeons',
      depthSpan: 'Overland World + 100-Level Chaos',
      goal: 'Defeat Oberon & Serpent of Chaos',
      cadence: 'Grand Multiverse Sandbox',
      art: '/assets/realms/frogcomposband.webp',
      fit: 'cover',
      hook: 'Roam a sprawling overland wilderness connecting towns, bounty halls, and eighteen themed dungeons—playing not only mortal heroes, but Dragons, Beholders, Liches, Rings, and Swords.',
      pillars: [
        ['Playable Monster Races & Evolution', 'Evolve from a Baby Dragon to an Ancient Wyrm, or play a multi-ringed Beholder or sentient magical Ring.'],
        ['Overland Wilderness & Town Quests', 'Travel between Outpost, Morivant, Angwil, and Telmora while completing royal bounties and dungeon guardian contracts.'],
        ['Unmatched Class Specialization', 'Wield Chaos-Warriors, Time-Lords, Weaponsmiths, Duelists, Blood-Knights, and Psions across Zelazny’s Courts of Chaos.']
      ]
    },
    {
      id: 'hengband',
      crest: '⛩️',
      title: 'Hengband 3.0.1 (変愚蛮怒)',
      subtitle: 'Sengoku Bushido, Yokai & Bilingual Study',
      era: '2000 • Legendary Japanese Variant',
      engineBadge: 'Native C++ • EN / Bilingual / 日本語',
      depthSpan: 'Wilderness + Castle + 100 Floors',
      goal: 'Vanquish the Serpent of Chaos',
      cadence: 'High-Octane Eastern Fantasy + Kanji Aid',
      art: '/assets/realms/hengband.webp',
      fit: 'cover',
      hook: 'Japan’s celebrated grand roguelike of Samurai stances, Ninja stealth, Onmyo talismans, and folklore yokai—featuring live instant switching between English, Bilingual Kanji-Tutor, and Japanese.',
      pillars: [
        ['Seamless EN ↔ Bilingual ↔ 日本語', 'Toggle live mid-run with interactive Kanji/Kana/Romaji hover cards and synchronized Miyamoto Musashi Chronicle narration.'],
        ['Samurai Kata, Ninjutsu & Blue Magic', 'Master Bushido sword stances (Iai, Musou), shadow-stepping Kawarimi, Mirror-Master seals, and learned monster abilities.'],
        ['Arena Championships & Bounties', 'Rise through the Monster Arena ranks, hunt daily Wanted Yokai bounties, and conquer specialized elemental labyrinths.']
      ]
    },
    {
      id: 'rogue',
      crest: '🕯️',
      title: 'Classic Rogue 5.4 (1980)',
      subtitle: 'Exploring the Dungeons of Doom',
      era: '1980 • UC Berkeley Originator',
      engineBadge: 'Instant Browser Worker + Cloud Vault',
      depthSpan: '26 Floors + Daylight Escape',
      goal: 'Recover the Amulet of Yendor',
      cadence: 'Pure 20-Minute Arcade Tension',
      art: '/assets/realms/rogue.webp',
      fit: 'contain',
      hook: 'Where the entire genre began on 1980 BSD Unix terminals. Ration scarce food, test unidentified potions by quaffing them, survive Aquators and Dragons, and climb back to daylight.',
      pillars: [
        ['The Original Unidentified Pack', 'Every run scrambles potion colors, scroll syllables, ring stones, and wand woods—rewarding deduction and nerve.'],
        ['Tight Food Clock & Torchlight', 'No town, no shops, no filler: balance hunger, armor rust from Aquators, and precious Enchant Armor scrolls.'],
        ['26-Floor Yendor Gauntlet', 'Fight past Jabberwocks, Medusas, and fire-breathing Dragons to seize the Amulet and ascend every floor in reverse.']
      ]
    },
    {
      id: 'ryod',
      crest: '⚒️',
      title: 'Roll Your Own Dungeon 2.0',
      subtitle: 'The Chimera Forge • Custom 8-Realm Synthesis',
      era: 'Yendor Engine™ Original',
      engineBadge: 'Instant Browser Worker • Shareable Seeds',
      depthSpan: 'Custom 10–50 Floors • 7 3D Biomes',
      goal: 'Forge, Seed & Share Your Own World',
      cadence: 'Tabletop Roll-or-Pick + Masterwork Presets',
      art: '/assets/realms/ryod.webp',
      fit: 'cover',
      hook: 'Fuse the signature mechanics of all eight legendary realms into one deterministic `RYOD-XXXXXXXX` blueprint—complete with 7 bespoke 3D biomes, playable monster avatars, and shareable run links.',
      pillars: [
        ['8-Realm Chimera Disciplines', 'Combine Sil-Q Woven Songs & Smithing, Brogue Gas/Chasm Physics & Enchanting, DCSS Gods, NetHack BUC Altars, and Hengband Kata.'],
        ['Playable Heroes or Monster Avatars', 'Delve as classic adventurers OR embody an Ancient Dragon, Beholder, Arch-Lich, or Vampire Lord with bespoke 3D anatomy.'],
        ['Deterministic Seeds & Masterworks', 'Launch curated Masterwork Presets in one click, roll tabletop fate dice, or share exact `RYOD-XXXXXXXX` challenge seeds.']
      ]
    }
  ]);

  let _currentIndex = 0;
  let _openContext = 'menu'; // 'splash' | 'menu' | 'ingame'
  let _gridView = false;
  let _mounted = false;
  let _touchStartX = null;
  let _latestSaveCandidate = null;
  let _onSelectRealmCallback = null;
  let _onResumeHeroCallback = null;

  function getCardById(realmId) {
    const rk = String(realmId || 'angband').toLowerCase();
    return REALM_CARDS.find(c => c.id === rk) || REALM_CARDS[0];
  }

  function _findIndex(realmId) {
    const rk = String(realmId || 'angband').toLowerCase();
    const idx = REALM_CARDS.findIndex(c => c.id === rk);
    return idx >= 0 ? idx : 0;
  }

  function mount(options = {}) {
    if (typeof options.onSelectRealm === 'function') _onSelectRealmCallback = options.onSelectRealm;
    if (typeof options.onResumeHero === 'function') _onResumeHeroCallback = options.onResumeHero;
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('realm-selector-modal');
    if (!modal || _mounted) return;
    _mounted = true;

    // Build Collector Card Carousel DOM inside canonical #realm-selector-modal (preserving #btn-close-realm-modal!)
    modal.innerHTML = `
      <div class="rc-shell" role="dialog" aria-modal="true" aria-labelledby="rc-modal-heading">
        <div class="rc-topbar">
          <div class="rc-topbar-brand">
            <span class="rc-topbar-kicker" id="rc-topbar-kicker">Yendor Engine™ • Choose Your Realm</span>
            <h2 class="rc-topbar-title" id="rc-modal-heading">Select a Roguelike Realm</h2>
          </div>
          <div class="rc-topbar-actions">
            <button type="button" id="btn-rc-resume-hero" class="rc-resume-pill hidden" title="Jump straight back into your most recent living adventurer">
              <span>▶</span>
              <span id="rc-resume-hero-label">Resume Last Hero</span>
            </button>
            <button type="button" id="btn-rc-toggle-grid" class="rc-view-btn" title="Switch between Collector Card view and 9-Realm Grid overview">
              ⊞ All 9 Grid
            </button>
            <button type="button" id="btn-realm-modal-close" class="rc-close-btn" title="Close Realm Selector [Esc]">✕ Close</button>
          </div>
        </div>
        <div id="realm-selection-status-bar" style="display:none;" aria-hidden="true">
          <strong id="realm-modal-active-title">Vanilla Angband 4.2.6</strong>
          <span id="realm-modal-active-voice">Master Elrond</span>
          <span id="realm-modal-status-badge">ACTIVE</span>
          <button type="button" id="btn-realm-modal-return">Return</button>
        </div>

        <div class="rc-stage" id="rc-carousel-stage">
          <button type="button" id="btn-realm-prev" class="rc-nav-arrow" aria-label="Previous Realm">
            ◀<span>Prev</span>
          </button>

          <article class="rc-collector-card" id="rc-active-card">
            <div class="rc-art-column">
              <div class="rc-plate-frame">
                <img id="rc-card-art" class="rc-plate-img" src="/assets/realms/angband.webp" alt="Realm Artwork" width="800" height="450" decoding="async" />
                <span class="rc-plate-era-badge" id="rc-card-era">1990 • High Fantasy</span>
                <span class="rc-plate-engine-badge" id="rc-card-engine">Browser WASM</span>
              </div>
              <div class="rc-meta-strip">
                <div class="rc-meta-cell">
                  <span class="rc-meta-label">Span</span>
                  <span class="rc-meta-val" id="rc-meta-span">100 Floors</span>
                </div>
                <div class="rc-meta-cell">
                  <span class="rc-meta-label">Victory Goal</span>
                  <span class="rc-meta-val" id="rc-meta-goal">Fell Morgoth</span>
                </div>
                <div class="rc-meta-cell">
                  <span class="rc-meta-label">Pacing</span>
                  <span class="rc-meta-val" id="rc-meta-cadence">Deep Delve</span>
                </div>
              </div>
            </div>

            <div class="rc-lore-column">
              <div>
                <div class="rc-card-header">
                  <div>
                    <h3 class="rc-card-title" id="rc-card-title">Vanilla Angband 4.2.6</h3>
                    <p class="rc-card-subtitle" id="rc-card-subtitle">Beneath the Iron Hell of Thangorodrim</p>
                  </div>
                  <span class="rc-card-index-pill" id="rc-card-index-pill">1 / 9</span>
                </div>
                <p class="rc-card-hook" id="rc-card-hook" style="margin-top:8px;"></p>
              </div>

              <ul class="rc-pillars-list" id="rc-card-pillars"></ul>

              <div class="rc-heng-inline hidden" id="hengband-lang-container">
                <label for="hengband-lang-select" style="font-weight:700; color:#ebe3d0;">🈯 Hengband Language & Study Aid:</label>
                <select id="hengband-lang-select">
                  <option value="en">English (Localized)</option>
                  <option value="bilingual">Bilingual Study (EN + 日本語 Kanji Aid)</option>
                  <option value="jp">日本語 (Native Kanji + JP Narrator)</option>
                </select>
              </div>

              <div class="rc-mobile-nav-row">
                <button type="button" id="btn-realm-prev-mobile" class="rc-view-btn" style="flex:1;">◀ Previous</button>
                <button type="button" id="btn-realm-next-mobile" class="rc-view-btn" style="flex:1;">Next ▶</button>
              </div>

              <div class="rc-card-cta-row">
                <button type="button" id="btn-realm-select-confirm" class="rc-select-btn">
                  ⚔ Enter Vanilla Angband Menu
                </button>
              </div>
            </div>
          </article>

          <button type="button" id="btn-realm-next" class="rc-nav-arrow" aria-label="Next Realm">
            ▶<span>Next</span>
          </button>
        </div>

        <div class="rc-grid-drawer hidden" id="rc-grid-drawer"></div>

        <div class="rc-pip-strip" id="rc-pip-strip" role="tablist" aria-label="Realm Shortcuts"></div>
      </div>
    `;

    // Populate 9 Crest Pips + 9 Compact Grid Cards (preserve `.realm-card[data-realm]` inside grid for backward compatibility!)
    const pipStrip = document.getElementById('rc-pip-strip');
    const gridDrawer = document.getElementById('rc-grid-drawer');
    REALM_CARDS.forEach((card, idx) => {
      const pip = document.createElement('button');
      pip.type = 'button';
      pip.className = 'rc-pip-btn';
      pip.dataset.realmIndex = String(idx);
      pip.dataset.realmId = card.id;
      pip.textContent = `${card.crest} ${card.id === 'frogcomposband' ? 'FCB' : (card.id === 'ryod' ? 'RYOD' : card.title.split(' ')[0])}`;
      pip.title = `${idx + 1}. ${card.title}`;
      pip.addEventListener('click', () => setIndex(idx));
      pipStrip.appendChild(pip);

      const mini = document.createElement('button');
      mini.type = 'button';
      mini.className = 'rc-mini-card realm-card';
      mini.dataset.realm = card.id;
      const img = document.createElement('img');
      img.className = 'rc-mini-thumb';
      img.src = card.art;
      img.alt = card.title;
      img.loading = 'lazy';
      const info = document.createElement('div');
      info.className = 'rc-mini-info';
      const t = document.createElement('span');
      t.className = 'rc-mini-title';
      t.textContent = `${card.crest} ${card.title}`;
      const sub = document.createElement('span');
      sub.className = 'rc-mini-sub';
      sub.textContent = card.subtitle;
      info.appendChild(t);
      info.appendChild(sub);
      mini.appendChild(img);
      mini.appendChild(info);
      mini.addEventListener('click', () => {
        setIndex(idx);
        confirmCurrentRealm();
      });
      gridDrawer.appendChild(mini);
    });

    // Wire buttons
    document.getElementById('btn-realm-prev').addEventListener('click', () => step(-1));
    document.getElementById('btn-realm-next').addEventListener('click', () => step(1));
    document.getElementById('btn-realm-prev-mobile').addEventListener('click', () => step(-1));
    document.getElementById('btn-realm-next-mobile').addEventListener('click', () => step(1));
    document.getElementById('btn-realm-select-confirm').addEventListener('click', () => confirmCurrentRealm());
    document.getElementById('btn-rc-toggle-grid').addEventListener('click', () => toggleGridView());
    document.getElementById('btn-realm-modal-close').addEventListener('click', () => close());
    const retBtn = document.getElementById('btn-realm-modal-return');
    if (retBtn) retBtn.addEventListener('click', () => close());

    const resumeBtn = document.getElementById('btn-rc-resume-hero');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        if (_latestSaveCandidate && typeof _onResumeHeroCallback === 'function') {
          const cand = _latestSaveCandidate;
          modal.classList.add('hidden');
          _onResumeHeroCallback(cand);
        }
      });
    }

    const hengSel = document.getElementById('hengband-lang-select');
    if (hengSel) {
      if (typeof window !== 'undefined' && window.LocaleSpine) {
        hengSel.value = window.LocaleSpine.getMode();
      }
      hengSel.addEventListener('change', (e) => {
        const val = e.target.value || 'en';
        if (typeof window !== 'undefined' && window.LocaleSpine) {
          window.LocaleSpine.setMode(val, { realm: 'hengband' });
        } else if (typeof window !== 'undefined') {
          window.__langMode = val;
        }
      });
    }

    // Touch swipe & horizontal wheel navigation on Collector Card
    const cardEl = document.getElementById('rc-active-card');
    cardEl.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) _touchStartX = e.touches[0].clientX;
    }, { passive: true });
    cardEl.addEventListener('touchend', (e) => {
      if (_touchStartX === null || !e.changedTouches || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - _touchStartX;
      _touchStartX = null;
      if (Math.abs(dx) >= 44) step(dx < 0 ? 1 : -1);
    }, { passive: true });

    // Keyboard navigation when Realm Selector Modal is open
    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        step(1);
      } else if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        setIndex(Number(e.key) - 1);
      } else if (e.key === 'Enter') {
        if (document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.id !== 'btn-realm-select-confirm') {
          return;
        }
        e.preventDefault();
        confirmCurrentRealm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    renderCurrentCard();
  }

  function isOpen() {
    if (typeof document === 'undefined') return false;
    const modal = document.getElementById('realm-selector-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
  }

  function setIndex(idx) {
    const n = REALM_CARDS.length;
    _currentIndex = ((idx % n) + n) % n;
    renderCurrentCard();
    // Preload adjacent card images only (zero engine subprocess/WASM prewarm thrashing!)
    if (typeof Image !== 'undefined') {
      const nextArt = REALM_CARDS[(_currentIndex + 1) % n].art;
      const prevArt = REALM_CARDS[(_currentIndex - 1 + n) % n].art;
      const i1 = new Image(); i1.src = nextArt;
      const i2 = new Image(); i2.src = prevArt;
    }
  }

  function step(delta) {
    setIndex(_currentIndex + delta);
  }

  function toggleGridView(force) {
    _gridView = typeof force === 'boolean' ? force : !_gridView;
    const stage = document.getElementById('rc-carousel-stage');
    const grid = document.getElementById('rc-grid-drawer');
    const btn = document.getElementById('btn-rc-toggle-grid');
    if (stage) stage.classList.toggle('hidden', _gridView);
    if (grid) grid.classList.toggle('hidden', !_gridView);
    if (btn) btn.textContent = _gridView ? '🃏 Card Carousel' : '⊞ All 9 Grid';
  }

  function renderCurrentCard() {
    if (typeof document === 'undefined') return;
    const card = REALM_CARDS[_currentIndex] || REALM_CARDS[0];
    const artEl = document.getElementById('rc-card-art');
    if (artEl) {
      artEl.src = card.art;
      artEl.alt = `${card.title} Collector Artwork`;
      artEl.classList.toggle('rc-fit-contain', card.fit === 'contain');
    }
    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    setTxt('rc-card-era', card.era);
    setTxt('rc-card-engine', card.engineBadge);
    setTxt('rc-meta-span', card.depthSpan);
    setTxt('rc-meta-goal', card.goal);
    setTxt('rc-meta-cadence', card.cadence);
    setTxt('rc-card-title', `${card.crest} ${card.title}`);
    setTxt('rc-card-subtitle', card.subtitle);
    setTxt('rc-card-index-pill', `Realm ${_currentIndex + 1} of ${REALM_CARDS.length}`);
    setTxt('rc-card-hook', card.hook);

    const pillarsUl = document.getElementById('rc-card-pillars');
    if (pillarsUl) {
      pillarsUl.textContent = '';
      card.pillars.forEach(([head, body]) => {
        const li = document.createElement('li');
        li.className = 'rc-pillar-item';
        const g = document.createElement('span');
        g.className = 'rc-pillar-glyph';
        g.textContent = '◆';
        const copy = document.createElement('span');
        const st = document.createElement('strong');
        st.textContent = `${head}: `;
        copy.appendChild(st);
        copy.appendChild(document.createTextNode(body));
        li.appendChild(g);
        li.appendChild(copy);
        pillarsUl.appendChild(li);
      });
    }

    const hengRow = document.getElementById('hengband-lang-container');
    if (hengRow) hengRow.classList.toggle('hidden', card.id !== 'hengband');

    const cta = document.getElementById('btn-realm-select-confirm');
    if (cta) {
      cta.textContent = card.id === 'ryod'
        ? '⚒ Select RYOD — Open Chimera Forge & Menu'
        : `⚔ Select ${card.title.replace(/\s+\d.*$/, '')}`;
      cta.dataset.selectedRealm = card.id;
    }

    document.querySelectorAll('#rc-pip-strip .rc-pip-btn').forEach((pip, idx) => {
      pip.classList.toggle('active', idx === _currentIndex);
      pip.setAttribute('aria-selected', idx === _currentIndex ? 'true' : 'false');
    });
    document.querySelectorAll('#rc-grid-drawer .rc-mini-card').forEach((mc) => {
      mc.classList.toggle('active', mc.dataset.realm === card.id);
    });
  }

  function setResumeCandidate(candidate) {
    const cName = candidate && (candidate.characterName || candidate.name || candidate.filename);
    const cRealm = candidate && candidate.realm;
    _latestSaveCandidate = (cName && cRealm) ? Object.assign({}, candidate, { name: cName, realm: cRealm }) : null;
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('btn-rc-resume-hero');
    const lbl = document.getElementById('rc-resume-hero-label');
    if (!btn || !lbl) return;
    if (_latestSaveCandidate) {
      const rCard = getCardById(_latestSaveCandidate.realm);
      lbl.textContent = `Resume ${_latestSaveCandidate.name} (${rCard.crest} ${_latestSaveCandidate.realm.toUpperCase()})`;
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }

  function open(context = 'menu', activeRealm = 'angband') {
    mount();
    _openContext = context || 'menu';
    _currentIndex = _findIndex(activeRealm);
    toggleGridView(false);
    renderCurrentCard();

    if (typeof document === 'undefined') return;
    const modal = document.getElementById('realm-selector-modal');
    const closeBtn = document.getElementById('btn-realm-modal-close');
    const kicker = document.getElementById('rc-topbar-kicker');
    if (kicker) {
      kicker.textContent = _openContext === 'splash'
        ? 'Step 1 of 3 • Choose Your Realm Card (◀ / ▶ or 1–9)'
        : 'Yendor Engine™ • Switch Roguelike Realm';
    }
    if (closeBtn) {
      closeBtn.textContent = _openContext === 'splash' ? 'Skip to Menu ▸' : '✕ Close';
    }
    if (modal) modal.classList.remove('hidden');
  }

  function close() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('realm-selector-modal');
    if (modal) modal.classList.add('hidden');
    if (_openContext === 'splash' && typeof _onSelectRealmCallback === 'function') {
      const card = REALM_CARDS[_currentIndex] || REALM_CARDS[0];
      _onSelectRealmCallback(card.id, { fromSplashSkip: true, openContext: _openContext });
    }
  }

  function confirmCurrentRealm() {
    const card = REALM_CARDS[_currentIndex] || REALM_CARDS[0];
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('realm-selector-modal');
      if (modal) modal.classList.add('hidden');
    }
    if (typeof _onSelectRealmCallback === 'function') {
      _onSelectRealmCallback(card.id, { openContext: _openContext });
    }
  }

  return {
    REALM_CARDS,
    getCardById,
    mount,
    open,
    close,
    isOpen,
    setIndex,
    step,
    toggleGridView,
    setResumeCandidate,
    confirmCurrentRealm
  };
});

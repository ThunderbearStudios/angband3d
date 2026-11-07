/**
 * c:\Dev\angband3d\server\public\js\master-bestiary.js
 * MASTER_BESTIARY — Universal Roguelike 3D Monster Resolution & Inspection Taxonomy (v11.7.0)
 *
 * Strict 4-Tier Resolution Pipeline:
 *  - Tier 0: O(1) Bounded LRU Memoization Cache (2048 entries, <0.001 ms hit time)
 *  - Tier 1: Pluggable Realm Manifest Overrides & Semantic Bridge Hints (registerRealm API)
 *  - Tier 2: Universal Morphological Species & Head-Noun Matcher (Status stripped, modifier scaling)
 *  - Tier 3: Isolated Realm-Contextual ASCII Glyph Fallback (Evaluated ONLY when Tier 1 & 2 do not match)
 *
 * Eliminates Cross-Realm Glyph Hijacking & Monochrome ASCII Over-Tinting Forever.
 * Zero-Bloat, Maximum Runtime Speed, Zero-Dependency (Node + Browser compatible).
 */

(function (root) {
    'use strict';

    // ---------------------------------------------------------------------------
    // 1. Constants & Color Palette Helpers
    // ---------------------------------------------------------------------------
    const ANGBAND_COLOR_TABLE = [
        '#000000', '#ffffff', '#808080', '#ff8000', '#c00000', '#008c47', '#0000ff', '#80590d',
        '#595959', '#c0c0c0', '#9900ff', '#ffff00', '#ff4040', '#00ff00', '#00ffff', '#c4a161',
        '#990099', '#99004d', '#009999', '#6b5933', '#ffff99', '#e600e6', '#33e6e6', '#b366ff',
        '#4c4c4c', '#999999', '#ff9933', '#ff3333', '#33cc66', '#3366ff', '#a67326', '#d9b3ff'
    ];

    function resolveColorHex(attr, fallback) {
        if (typeof attr === 'string' && attr.charAt(0) === '#') return attr;
        if (typeof root !== 'undefined' && typeof root.getAngbandColorString === 'function') {
            const c = root.getAngbandColorString(attr);
            if (c) return c;
        }
        if (typeof attr === 'number' && attr >= 0 && attr < ANGBAND_COLOR_TABLE.length) {
            return ANGBAND_COLOR_TABLE[attr];
        }
        return fallback || null;
    }

    function computeSeed(m) {
        if (!m) return 0;
        const raw = m.id !== undefined ? m.id : ((m.x || 0) * 7 + (m.y || 0) * 13);
        if (typeof raw === 'number') return Math.abs(raw | 0);
        let s = 0;
        const str = String(raw);
        for (let i = 0; i < str.length; i++) {
            s = (s * 31 + str.charCodeAt(i)) | 0;
        }
        return Math.abs(s);
    }

    function cleanMonsterName(name) {
        if (!name) return '';
        let s = String(name).trim();
        if (typeof root !== 'undefined' && root.HengTranslate && typeof root.HengTranslate.translateName === 'function') {
            try {
                const tr = root.HengTranslate.translateName(s);
                if (tr) s = tr;
            } catch (_) {}
        }
        return s
            .replace(/\s*\((?:tame|peaceful|asleep|hostile|pet|unwary|fleeing|friendly|companion|sleeping|charmed|ally|unhostile|neutral|stunned|confused|afraid)\)/gi, '')
            .replace(/\s*\[(?:tame|peaceful|asleep|hostile|pet|unwary|fleeing|friendly)\]/gi, '')
            .trim();
    }

    function normalizeRealm(realm) {
        if (!realm) return 'angband';
        const r = String(realm).toLowerCase().trim();
        if (r === 'sil' || r === 'sil-q' || r === 'sil_q') return 'silq';
        if (r === 'frog' || r === 'compos' || r === 'frogcompos') return 'frogcomposband';
        if (r === 'heng' || r === 'heng_band') return 'hengband';
        if (r === 'crawl' || r === 'stone_soup') return 'dcss';
        return r;
    }

    // ---------------------------------------------------------------------------
    // 2. Tier 0 — Bounded LRU Memoization Cache (Max 2048 entries)
    // ---------------------------------------------------------------------------
    const CACHE_MAX_SIZE = 2048;
    const _cache = new Map();

    function cacheGet(key) {
        if (!_cache.has(key)) return null;
        const val = _cache.get(key);
        _cache.delete(key);
        _cache.set(key, val);
        return val;
    }

    function cacheSet(key, val) {
        if (_cache.has(key)) {
            _cache.delete(key);
        } else if (_cache.size >= CACHE_MAX_SIZE) {
            const oldestKey = _cache.keys().next().value;
            if (oldestKey !== undefined) _cache.delete(oldestKey);
        }
        _cache.set(key, val);
    }

    function applyInstanceSeed(cfg, seed) {
        const out = Object.assign({}, cfg);
        out.seed = seed;
        if (out._seedTemplates && out._seedTemplates.length > 0) {
            out.templateKey = out._seedTemplates[seed % out._seedTemplates.length];
        }
        if (out._seedWeapons && out._seedWeapons.length > 0) {
            out.weaponKey = out._seedWeapons[seed % out._seedWeapons.length];
        }
        if (out._seedShields && out._seedShields.length > 0) {
            out.shieldKey = out._seedShields[(seed >> 1) % out._seedShields.length];
        }
        if (out._seedCoatVariants && out._seedCoatVariants.length > 0 && !out.tintHex) {
            out.tintHex = out._seedCoatVariants[seed % out._seedCoatVariants.length];
        }
        if (out._tunicPalette && out._tunicPalette.length > 0) {
            out.tintHex = out._tunicPalette[seed % out._tunicPalette.length];
            out.tunicOnlyTint = true;
        }
        if (!out.gender) {
            out.gender = (out.templateKey && out.templateKey.indexOf('female') !== -1) ? 'female' : 'male';
        }
        return out;
    }

    // ---------------------------------------------------------------------------
    // 3. Pluggable Realm Manifests & Semantic Hints (Tier 1)
    // ---------------------------------------------------------------------------
    const REALM_MANIFESTS = Object.create(null);

    function registerRealm(realmId, manifest) {
        if (!realmId || !manifest) return;
        const norm = normalizeRealm(realmId);
        const merged = Object.assign(REALM_MANIFESTS[norm] || {}, manifest);
        if (manifest.exactNames || manifest.exact) {
            merged.exact = Object.assign({}, merged.exact || {}, manifest.exact || {}, manifest.exactNames || {});
        }
        const baseProfile = normalizeRealm(manifest.baseGlyphProfile || manifest.inheritsGlyphsFrom || 'angband');
        const glyphMap = manifest.glyphTable || manifest.glyphOverrides;
        if (glyphMap) {
            const parentGlyphs = REALM_GLYPH_TABLES[baseProfile] || REALM_GLYPH_TABLES.angband || {};
            REALM_GLYPH_TABLES[norm] = Object.assign({}, parentGlyphs, glyphMap);
        } else if ((manifest.baseGlyphProfile || manifest.inheritsGlyphsFrom) && !REALM_GLYPH_TABLES[norm]) {
            REALM_GLYPH_TABLES[norm] = Object.assign({}, REALM_GLYPH_TABLES[baseProfile] || REALM_GLYPH_TABLES.angband);
        }
        REALM_MANIFESTS[norm] = merged;
        _cache.clear();
    }

    REALM_MANIFESTS['silq'] = {
        baseGlyphProfile: 'silq',
        patterns: [
            { regex: /\b(balrog|rauko|gothmog|lungorthin|ururauko|sulrauko|ringrauko|kemenrauko|gwathrauko)\b/i, config: { templateKey: 'bestiary_imp', scale: 1.62, weaponKey: 'ph_sledgehammer', isBalrog: true, isBoss: true, emissiveHex: '#ff3300', taxonomy: 'Rauko / Balrog' } },
            { regex: /\b(morgoth|bauglir)\b/i, config: { templateKey: 'char_male_ranger', scale: 1.75, weaponKey: 'ph_sledgehammer', isMorgoth: true, isBoss: true, taxonomy: 'Dark Valar / Boss' } },
            { regex: /\b(ungoliant|gloomweaver)\b/i, config: { templateKey: 'obj_spider', scale: 1.85, isBoss: true, taxonomy: 'Great Spider / Boss' } },
            { regex: /\b(thorn|tanglethorn|madthorn|nightthorn)\b/i, config: { templateKey: 'env_tanglethorn', scale: 1.05, taxonomy: 'Thorn / Flora' } },
            { regex: /\bmewlip\b/i, config: { templateKey: 'bestiary_zombie', scale: 0.98, taxonomy: 'Undead / Mewlip' } },
            { regex: /\b(naugrim|mim|ibun|khim|azaghal)\b/i, config: { templateKey: 'char_male_ranger', scaleY: 0.78, scaleXZ: 1.12, weaponKey: 'ph_axe', shieldKey: 'ph_shield', taxonomy: 'Dwarf / Naugrim' } },
            { regex: /\b(crebain|gorcrow)\b/i, config: { templateKey: 'bestiary_bird', scale: 0.92, isFloating: true, taxonomy: 'Avian / Crebain' } },
            { regex: /\bbarrow[- ]?wight\b/i, config: { templateKey: 'bestiary_skeleton_knight', scale: 1.05, weaponKey: 'item_longsword', shieldKey: 'item_shield_wooden', taxonomy: 'Undead / Wight' } },
            { regex: /\b(carcharoth|draugluin|huan|werewolf)\b/i, config: { templateKey: 'bestiary_wolf', scale: 1.46, isBoss: true, taxonomy: 'Great Wolf / Boss' } },
            { regex: /\blurking horror\b/i, config: { templateKey: 'bestiary_wraith', scale: 1.15, isFloating: true, taxonomy: 'Horror / Wraith' } },
            { regex: /\bvampire lord\b/i, config: { templateKey: 'char_male_priest', scale: 1.12, weaponKey: 'item_staff', taxonomy: 'Undead / Vampire Lord' } },
            { regex: /\bgorlim\b/i, config: { templateKey: 'char_male_ranger', scale: 1.0, weaponKey: 'ph_dagger', isBoss: true, taxonomy: 'Human / Traitor' } },
            { regex: /\bthuringwethil\b/i, config: { templateKey: 'bestiary_bat', scale: 1.25, isFloating: true, isBoss: true, taxonomy: 'Vampire Bat / Boss' } },
            { regex: /\bnameless\b/i, config: { templateKey: 'bestiary_horror', scale: 1.45, taxonomy: 'Nameless Thing' } },
            { regex: /\b(sauron|gorthaur)\b/i, config: { templateKey: 'char_male_ranger', scale: 1.42, weaponKey: 'ph_mace', isBoss: true, taxonomy: 'Maia / Boss' } },
            { regex: /\b(easterling|ulfast|ulwarth|uldor|ulfang)\b/i, config: { templateKey: 'char_male_ranger', scale: 1.02, weaponKey: 'item_longsword', shieldKey: 'ph_shield', taxonomy: 'Human / Easterling' } },
            { regex: /\b(thrall|captive)\b/i, config: { templateKey: 'char_male_peasant', scale: 0.96, weaponKey: 'item_staff_branch', taxonomy: 'Human / Thrall' } }
        ]
    };

    REALM_MANIFESTS['frogcomposband'] = {
        baseGlyphProfile: 'angband',
        patterns: [
            { regex: /serpent of chaos/i, config: { templateKey: 'bestiary_dragon', scale: 1.90, isBoss: true, emissiveHex: '#a855f7', taxonomy: 'Chaos Dragon / Boss' } },
            { regex: /\b(cyberdemon|oremorj)\b/i, config: { templateKey: 'bestiary_imp', scale: 1.70, weaponKey: 'ph_sledgehammer', isBoss: true, taxonomy: 'Cyberdemon / Boss' } },
            { regex: /\bcthulhu\b/i, config: { templateKey: 'bestiary_imp', scale: 1.82, isBoss: true, taxonomy: 'Great Old One / Boss' } }
        ]
    };

    REALM_MANIFESTS['hengband'] = {
        baseGlyphProfile: 'angband',
        patterns: [
            { regex: /混沌のサーペント|serpent of chaos/i, config: { templateKey: 'bestiary_dragon', scale: 1.90, isBoss: true, emissiveHex: '#a855f7', taxonomy: 'Chaos Dragon / Boss' } },
            { regex: /サイバーデーモン|デーモン|\b(cyberdemon|demon)\b/i, config: { templateKey: 'bestiary_imp', scale: 1.55, weaponKey: 'ph_sledgehammer', taxonomy: 'Demon' } },
            { regex: /サムライ|浪人|剣聖|ニンジャ|ヤクザ|\b(samurai|ronin|kensei|ninja|shinobi|yakuza)\b/i, config: { templateKey: 'char_male_ranger', scale: 1.02, weaponKey: 'ph_katana', taxonomy: 'Humanoid / Samurai' } },
            { regex: /八岐大蛇|\borochi\b/i, config: { templateKey: 'bestiary_dragon', scale: 1.85, isBoss: true, taxonomy: 'Great Serpent / Orochi' } },
            { regex: /酒呑童子|\bshuten\b/i, config: { templateKey: 'bestiary_yeti', scale: 1.50, weaponKey: 'ph_sledgehammer', isBoss: true, taxonomy: 'Oni / Shuten-douji' } },
            { regex: /鬼|\boni\b/i, config: { templateKey: 'bestiary_ogre', scale: 1.45, weaponKey: 'ph_sledgehammer', taxonomy: 'Oni / Ogre' } },
            { regex: /天狗|\btengu\b/i, config: { templateKey: 'bestiary_owl', scale: 1.20, isFloating: true, taxonomy: 'Avian / Tengu' } },
            { regex: /河童|\bkappa\b/i, config: { templateKey: 'obj_frog', scale: 1.05, taxonomy: 'Amphibian / Kappa' } },
            { regex: /九尾|\b(kitsune|nine-tailed)\b/i, config: { templateKey: 'bestiary_fox', scale: 1.22, taxonomy: 'Canine / Kitsune' } },
            { regex: /野良犬|子犬|番犬/, config: { templateKey: 'bestiary_shiba', scale: 0.78, taxonomy: 'Canine / Dog' } },
            { regex: /犬|ハウンド|狼/, config: { templateKey: 'bestiary_wolf', scale: 1.0, taxonomy: 'Canine' } },
            { regex: /猫|虎|獅子|豹/, config: { templateKey: 'bestiary_lion', scale: 0.95, taxonomy: 'Feline' } },
            { regex: /竜|ドラゴン|ワイアーム/, config: { templateKey: 'bestiary_dragon', scale: 1.35, useAsciiTint: true, taxonomy: 'Dragon' } },
            { regex: /蜘蛛/, config: { templateKey: 'obj_spider', scale: 0.95, taxonomy: 'Spider' } },
            { regex: /蛇|巳/, config: { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake' } },
            { regex: /蛙|ガマ/, config: { templateKey: 'obj_frog', scale: 0.95, taxonomy: 'Frog' } },
            { regex: /蝙蝠/, config: { templateKey: 'bestiary_bat', scale: 0.85, isFloating: true, taxonomy: 'Bat' } },
            { regex: /鳥|鷲|鷹|鴉|フクロウ/, config: { templateKey: 'bestiary_bird', scale: 0.92, isFloating: true, taxonomy: 'Bird' } },
            { regex: /骸骨|スケルトン/, config: { templateKey: 'bestiary_skeleton_warrior', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Skeleton' } },
            { regex: /ゾンビ|ミイラ|グール/, config: { templateKey: 'bestiary_zombie', scale: 1.0, taxonomy: 'Zombie' } },
            { regex: /幽霊|亡霊|レイス|リッチ/, config: { templateKey: 'bestiary_wraith', scale: 1.08, isFloating: true, taxonomy: 'Wraith' } },
            { regex: /オーク/, config: { templateKey: 'bestiary_orc', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Orc' } },
            { regex: /ゴブリン/, config: { templateKey: 'bestiary_goblin', scale: 0.85, weaponKey: 'ph_dagger', taxonomy: 'Goblin' } },
            { regex: /トロル/, config: { templateKey: 'bestiary_troll', scale: 1.25, weaponKey: 'item_greatclub', taxonomy: 'Troll' } },
            { regex: /オーガ/, config: { templateKey: 'bestiary_ogre', scale: 1.25, weaponKey: 'item_greatclub', taxonomy: 'Ogre' } },
            { regex: /巨人|ジャイアント|サイクロプス|タイタン/, config: { templateKey: 'bestiary_cyclops', scale: 1.35, weaponKey: 'ph_sledgehammer', taxonomy: 'Giant' } },
            { regex: /ゴーレム|像/, config: { templateKey: 'bestiary_golem', scale: 1.15, taxonomy: 'Golem' } },
            { regex: /目|アイ|ビホルダー/, config: { templateKey: 'bestiary_eye', scale: 0.95, isFloating: true, taxonomy: 'Eye' } },
            { regex: /渦|ボルテックス|エレメンタル/, config: { templateKey: 'bestiary_vortex', scale: 0.95, isFloating: true, useAsciiTint: true, taxonomy: 'Vortex' } },
            { regex: /ゼリー|ウーズ|スライム|カビ|キノコ/, config: { templateKey: 'env_ooze_mound', scale: 0.95, useAsciiTint: true, taxonomy: 'Ooze / Fungi' } },
            { regex: /盗賊|シーフ/, config: { templateKey: 'char_male_rogue', scale: 1.0, weaponKey: 'ph_dagger', taxonomy: 'Rogue' } },
            { regex: /魔道士|メイジ|魔法使い|プリースト|僧侶/, config: { templateKey: 'char_male_priest', scale: 1.0, weaponKey: 'ph_mace', taxonomy: 'Spellcaster' } },
            { regex: /騎士|パラディン|戦士|ガード/, config: { templateKey: 'char_male_guard', scale: 1.02, weaponKey: 'item_longsword', shieldKey: 'item_shield_wooden', taxonomy: 'Guard' } }
        ]
    };

    REALM_MANIFESTS['nethack'] = {
        baseGlyphProfile: 'nethack',
        patterns: [
            { regex: /\b(little dog|small dog|puppy)\b/i, config: { templateKey: 'bestiary_shiba', scale: 0.78, taxonomy: 'Canine / Companion' } },
            { regex: /\b(large dog|pit bull|hooray dog|\bdog\b)\b/i, config: { templateKey: 'bestiary_husky', scale: 1.02, taxonomy: 'Canine / Companion' } },
            { regex: /\b(dingo|coyote|jackal|fox)\b/i, config: { templateKey: 'bestiary_fox', scale: 0.88, taxonomy: 'Canine / Wild' } },
            { regex: /\b(winter wolf|winter wolf cub|warg|\bwolf\b)\b/i, config: { templateKey: 'bestiary_wolf', scale: 1.05, taxonomy: 'Canine / Wolf' } },
            { regex: /\b(hell hound pup|hell hound|cerberus)\b/i, config: { templateKey: 'bestiary_hellhound', scale: 1.15, emissiveHex: '#ff4500', taxonomy: 'Canine / Hellhound' } },
            { regex: /\b(kitten|housecat)\b/i, config: { templateKey: 'bestiary_lion', scale: 0.46, taxonomy: 'Feline / Companion' } },
            { regex: /\b(large cat|jaguar|lynx|panther|tiger|leopard)\b/i, config: { templateKey: 'bestiary_lion', scale: 0.95, taxonomy: 'Feline / Big Cat' } },
            { regex: /\b(pony|horse|warhorse)\b/i, config: { templateKey: 'bestiary_horse', scale: 1.05, taxonomy: 'Equine / Steed' } },
            { regex: /\bunicorn\b/i, config: { templateKey: 'bestiary_horse', scale: 1.08, taxonomy: 'Equine / Unicorn' } },
            { regex: /wizard of yendor/i, config: { templateKey: 'char_male_priest', scale: 1.25, weaponKey: 'item_staff', isBoss: true, taxonomy: 'Human / Boss' } },
            { regex: /\b(shopkeeper|izchak)\b/i, config: { templateKey: 'char_male_peasant', scale: 1.02, taxonomy: 'Human / Shopkeeper' } },
            { regex: /\boracle\b/i, config: { templateKey: 'char_female_peasant', scale: 1.0, taxonomy: 'Human / Oracle' } },
            { regex: /\b(aligned priest|high priest|priest|priestess|monk|abbot|acolyte)\b/i, config: { templateKey: 'char_male_priest', scale: 1.02, weaponKey: 'ph_mace', taxonomy: 'Human / Cleric' } },
            { regex: /\b(watchman|watch captain|soldier|sergeant|lieutenant|captain|guard|mercenary|kop|keystone kop)\b/i, config: { templateKey: 'char_male_guard', scale: 1.02, weaponKey: 'item_longsword', shieldKey: 'item_shield_wooden', taxonomy: 'Human / Guard' } },
            { regex: /\bnurse\b/i, config: { templateKey: 'char_female_peasant', scale: 0.98, taxonomy: 'Human / Healer' } },
            { regex: /\bmedusa\b/i, config: { templateKey: 'bestiary_naga', scale: 1.22, weaponKey: 'item_bow', isBoss: true, taxonomy: 'Monstrosity / Medusa' } },
            { regex: /\bvlad the impaler\b/i, config: { templateKey: 'char_male_ranger', scale: 1.15, weaponKey: 'item_longsword', isBoss: true, taxonomy: 'Undead / Vampire' } },
            { regex: /\bcroesus\b/i, config: { templateKey: 'char_male_peasant', scale: 1.12, weaponKey: 'ph_mace', isBoss: true, taxonomy: 'Human / Boss' } },
            { regex: /\b(grid bug|xan)\b/i, config: { templateKey: 'bestiary_beetle', scale: 0.76, taxonomy: 'Insect / Grid Bug' } },
            { regex: /\b(killer bee|queen bee)\b/i, config: { templateKey: 'obj_wasp', scale: 0.85, isFloating: true, taxonomy: 'Insect / Bee' } },
            { regex: /\b(cockatrice|chickatrice|pyrolisk)\b/i, config: { templateKey: 'bestiary_flamingo', scale: 0.92, taxonomy: 'Avian / Petrifier' } },
            { regex: /\b(rust monster|disenchanter)\b/i, config: { templateKey: 'bestiary_scorpion', scale: 0.95, taxonomy: 'Monstrosity / Rust Monster' } },
            { regex: /\b(floating eye|freezing sphere|flaming sphere|shocking sphere|gas spore)\b/i, config: { templateKey: 'bestiary_eye', scale: 0.92, isFloating: true, taxonomy: 'Eye / Sphere' } },
            { regex: /\b(acid blob|quivering blob|gelatinous cube|black pudding|brown pudding|green slime|gray ooze)\b/i, config: { templateKey: 'env_ooze_mound', scale: 1.05, useAsciiTint: true, taxonomy: 'Ooze / Blob' } },
            { regex: /\b(shrieker|violet fungus|\bmold\b)\b/i, config: { templateKey: 'env_fungi_cluster', scale: 0.92, useAsciiTint: true, taxonomy: 'Fungi / Plant' } },
            { regex: /\b(mind flayer|master mind flayer)\b/i, config: { templateKey: 'char_male_priest', scale: 1.06, isFloating: true, weaponKey: 'item_staff', taxonomy: 'Illithid / Mind Flayer' } },
            { regex: /\bleprechaun\b/i, config: { templateKey: 'bestiary_goblin', scale: 0.74, taxonomy: 'Fey / Leprechaun' } },
            { regex: /\bnymph\b/i, config: { templateKey: 'char_female_peasant', scale: 0.95, taxonomy: 'Fey / Nymph' } },
            { regex: /\b(xorn|umber hulk|zruty|rock mole)\b/i, config: { templateKey: 'bestiary_golem', scale: 1.15, taxonomy: 'Earth / Burrower' } },
            { regex: /\b(trapper|lurker above)\b/i, config: { templateKey: 'bestiary_horror', scale: 1.25, taxonomy: 'Monstrosity / Lurker' } },
            { regex: /\b(long worm|baby long worm|purple worm|baby purple worm)\b/i, config: { templateKey: 'bestiary_worm_mass', scale: 1.15, taxonomy: 'Worm / Giant Worm' } },
            { regex: /\bcouatl\b/i, config: { templateKey: 'obj_snake', scale: 1.15, isFloating: true, taxonomy: 'Celestial / Couatl' } },
            { regex: /\bjabberwock\b/i, config: { templateKey: 'bestiary_dragon', scale: 1.35, taxonomy: 'Dragon / Jabberwock' } },
            { regex: /\b(angel|aleax|archon|ki-rin|planetar|solar|deva)\b/i, config: { templateKey: 'char_valkyrie', scale: 1.18, isFloating: true, taxonomy: 'Celestial / Angel' } },
            { regex: /\bquantum mechanic\b/i, config: { templateKey: 'char_male_priest', scale: 0.95, taxonomy: 'Human / Out-of-Place' } }
        ]
    };

    REALM_MANIFESTS['dcss'] = {
        baseGlyphProfile: 'dcss',
        patterns: [
            { regex: /\b(gnoll|igmund|grinder|crazy yiuf)\b/i, config: { templateKey: 'bestiary_gnoll', scale: 1.02, weaponKey: 'ph_axe', shieldKey: 'item_shield_wooden', taxonomy: 'Gnoll' } },
            { regex: /\b(ijyb|robin|goblin)\b/i, config: { templateKey: 'bestiary_goblin', scale: 0.82, weaponKey: 'ph_dagger', taxonomy: 'Goblin' } },
            { regex: /\bhobgoblin\b/i, config: { templateKey: 'bestiary_hobgoblin', scale: 0.98, weaponKey: 'item_greatclub', taxonomy: 'Hobgoblin' } },
            { regex: /\b(kobold|sonja|pikel)\b/i, config: { templateKey: 'bestiary_kobold', scale: 0.88, weaponKey: 'ph_dagger', taxonomy: 'Kobold' } },
            { regex: /\b(adder|ball python|water moccasin|black mamba|anaconda|sea snake|shock serpent|guardian serpent)\b/i, config: { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake' } },
            { regex: /\b(hydra|lernaean hydra)\b/i, config: { templateKey: 'bestiary_hydra', scale: 1.32, taxonomy: 'Hydra' } },
            { regex: /\b(ooze|jelly|slime creature|acid blob|azure jelly|dissolution|royal jelly)\b/i, config: { templateKey: 'env_ooze_mound', scale: 1.0, useAsciiTint: true, taxonomy: 'Ooze / Slime' } },
            { regex: /\b(giant eyeball|shining eye|eye of devastation|great orb of eyes|golden eye|floating eye|eye of draining)\b/i, config: { templateKey: 'bestiary_eye', scale: 1.05, isFloating: true, taxonomy: 'Eye' } },
            { regex: /\b(draconian|bai suzhen|tiamat)\b/i, config: { templateKey: 'bestiary_lizardfolk', scale: 1.12, weaponKey: 'item_spear', shieldKey: 'item_shield_wooden', taxonomy: 'Draconian' } },
            { regex: /\b(spriggan|boggart|the enchantress|agnes)\b/i, config: { templateKey: 'bestiary_goblin', scale: 0.72, weaponKey: 'ph_dagger', taxonomy: 'Fey / Spriggan' } },
            { regex: /\bdeep elf\b/i, config: { templateKey: 'char_male_ranger', scale: 1.0, weaponKey: 'item_bow', taxonomy: 'Elf / Deep Elf' } },
            { regex: /\b(merfolk|siren|ilsuiw)\b/i, config: { templateKey: 'bestiary_naga', scale: 1.08, weaponKey: 'item_spear', taxonomy: 'Aquatic / Merfolk' } },
            { regex: /\b(tengu|sojobo)\b/i, config: { templateKey: 'bestiary_owl', scale: 1.15, isFloating: true, taxonomy: 'Avian / Tengu' } },
            { regex: /\b(minotaur|asterion)\b/i, config: { templateKey: 'bestiary_guardian', scale: 1.28, weaponKey: 'ph_axe', taxonomy: 'Monstrosity / Minotaur' } },
            { regex: /\b(centaur|yaktaur|nessos)\b/i, config: { templateKey: 'bestiary_guardian', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Hybrid / Centaur' } },
            { regex: /\b(octopode|kraken)\b/i, config: { templateKey: 'bestiary_kraken', scale: 1.35, isFloating: true, taxonomy: 'Aquatic / Cephalopod' } },
            { regex: /\borb guardian\b/i, config: { templateKey: 'bestiary_guardian', scale: 1.25, weaponKey: 'ph_sledgehammer', taxonomy: 'Construct / Guardian' } },
            { regex: /\b(executioner|pandemonium lord|tzitzimitl|balrug|hellion|tormentor|cacodemon|neqoxec|brimstone fiend|ice fiend|cerebov|lom lobon|mnoleg|gloorx vloq|asmodeus|ereskigal|dispater|antaeus)\b/i, config: { templateKey: 'bestiary_imp', scale: 1.48, weaponKey: 'ph_sledgehammer', taxonomy: 'Demon / Fiend' } },
            { regex: /\b(boulder beetle|boring beetle|radroach)\b/i, config: { templateKey: 'bestiary_beetle', scale: 1.05, taxonomy: 'Insect / Beetle' } },
            { regex: /\b(cane toad|blink frog|giant frog|bullfrog|prince ribbit)\b/i, config: { templateKey: 'obj_frog', scale: 0.98, taxonomy: 'Amphibian / Frog' } },
            { regex: /\b(plant|bush|oklob plant|fungus|wandering mushroom|briar patch|thorn hunter|shambling mangrove)\b/i, config: { templateKey: 'env_tanglethorn', scale: 0.95, taxonomy: 'Flora / Plant' } }
        ]
    };

    REALM_MANIFESTS['brogue'] = {
        baseGlyphProfile: 'brogue',
        patterns: [
            { regex: /\b(dar blademaster|dar priestess|dar battlemage)\b/i, config: { templateKey: 'char_male_ranger', scale: 1.0, weaponKey: 'ph_saber', taxonomy: 'Humanoid / Dar' } },
            { regex: /\b(bloat|pit bloat)\b/i, config: { templateKey: 'bestiary_eye', scale: 1.08, isFloating: true, taxonomy: 'Aberration / Bloat' } },
            { regex: /\b(pink jelly|acid mound)\b/i, config: { templateKey: 'env_ooze_mound', scale: 0.95, useAsciiTint: true, taxonomy: 'Ooze / Jelly' } },
            { regex: /\b(goblin|goblin conjurer|goblin mystic|goblin warlord)\b/i, config: { templateKey: 'bestiary_goblin', scale: 0.85, weaponKey: 'item_spear', taxonomy: 'Goblin' } },
            { regex: /\b(goblin totem|ogre totem|arrow turret|flame turret|spark turret|dart turret|sentinel|guardian)\b/i, config: { templateKey: 'bestiary_statue', scale: 1.15, taxonomy: 'Construct / Totem' } },
            { regex: /\bmonkey\b/i, config: { templateKey: 'bestiary_puglin', scale: 0.72, taxonomy: 'Beast / Monkey' } },
            { regex: /\btentacle horror\b/i, config: { templateKey: 'bestiary_horror', scale: 1.32, taxonomy: 'Aberration / Horror' } },
            { regex: /\b(eel|kraken|bog monster|underworm)\b/i, config: { templateKey: 'bestiary_aquatic', scale: 1.22, isFloating: true, taxonomy: 'Aquatic Horror' } },
            { regex: /\bspectral blade\b/i, config: { templateKey: 'item_greatsword', scale: 1.12, isFloating: true, taxonomy: 'Animated Weapon' } },
            { regex: /\b(wisp|will-o-the-wisp)\b/i, config: { templateKey: 'bestiary_vortex', scale: 0.82, isFloating: true, emissiveHex: '#ff6b00', taxonomy: 'Elemental / Wisp' } },
            { regex: /\bpixie\b/i, config: { templateKey: 'char_female_peasant', scale: 0.65, isFloating: true, taxonomy: 'Fey / Pixie' } },
            { regex: /\bwarden of yendor\b/i, config: { templateKey: 'bestiary_guardian', scale: 1.38, weaponKey: 'ph_axe', isBoss: true, taxonomy: 'Construct / Boss' } },
            { regex: /\bphylactery\b/i, config: { templateKey: 'ph_crystal', scale: 0.95, taxonomy: 'Relic / Phylactery' } }
        ]
    };

    REALM_MANIFESTS['rogue'] = {
        baseGlyphProfile: 'rogue',
        patterns: [
            { regex: /\baquator\b/i, config: { templateKey: 'bestiary_aquatic', scale: 1.0, taxonomy: 'Aquatic / Rust Beast' } },
            { regex: /\bbat\b/i, config: { templateKey: 'bestiary_bat', scale: 0.82, isFloating: true, taxonomy: 'Bat' } },
            { regex: /\bcentaur\b/i, config: { templateKey: 'bestiary_guardian', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Hybrid / Centaur' } },
            { regex: /\bdragon\b/i, config: { templateKey: 'bestiary_dragon', scale: 1.55, taxonomy: 'Dragon' } },
            { regex: /\bemu\b/i, config: { templateKey: 'bestiary_stork', scale: 1.05, taxonomy: 'Avian / Emu' } },
            { regex: /\bvenus flytrap\b/i, config: { templateKey: 'env_tanglethorn', scale: 1.02, taxonomy: 'Flora / Flytrap' } },
            { regex: /\bgriffin\b/i, config: { templateKey: 'bestiary_owl', scale: 1.25, isFloating: true, taxonomy: 'Hybrid / Griffin' } },
            { regex: /\bhobgoblin\b/i, config: { templateKey: 'bestiary_hobgoblin', scale: 0.98, weaponKey: 'item_greatclub', taxonomy: 'Hobgoblin' } },
            { regex: /\bice monster\b/i, config: { templateKey: 'bestiary_yeti', scale: 1.08, emissiveHex: '#38bdf8', taxonomy: 'Construct / Ice Monster' } },
            { regex: /\bjabberwock\b/i, config: { templateKey: 'bestiary_dragon', scale: 1.38, taxonomy: 'Dragon / Jabberwock' } },
            { regex: /\bkestrel\b/i, config: { templateKey: 'bestiary_bird', scale: 0.82, isFloating: true, taxonomy: 'Avian / Falcon' } },
            { regex: /\bleprechaun\b/i, config: { templateKey: 'bestiary_goblin', scale: 0.72, taxonomy: 'Fey / Leprechaun' } },
            { regex: /\bmedusa\b/i, config: { templateKey: 'bestiary_naga', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Monstrosity / Medusa' } },
            { regex: /\bnymph\b/i, config: { templateKey: 'char_female_peasant', scale: 0.95, taxonomy: 'Fey / Nymph' } },
            { regex: /\borc\b/i, config: { templateKey: 'bestiary_orc', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Orc' } },
            { regex: /\bphantom\b/i, config: { templateKey: 'bestiary_wraith', scale: 1.05, isFloating: true, taxonomy: 'Undead / Phantom' } },
            { regex: /\bquagga\b/i, config: { templateKey: 'bestiary_horse', scale: 1.02, taxonomy: 'Equine / Quagga' } },
            { regex: /\b(rattlesnake|snake)\b/i, config: { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake' } },
            { regex: /\btroll\b/i, config: { templateKey: 'bestiary_troll', scale: 1.28, weaponKey: 'item_greatclub', taxonomy: 'Troll' } },
            { regex: /\b(black unicorn|unicorn)\b/i, config: { templateKey: 'bestiary_horse', scale: 1.08, taxonomy: 'Equine / Unicorn' } },
            { regex: /\bvampire\b/i, config: { templateKey: 'char_male_ranger', scale: 1.08, weaponKey: 'item_longsword', taxonomy: 'Undead / Vampire' } },
            { regex: /\bwraith\b/i, config: { templateKey: 'bestiary_wraith', scale: 1.10, isFloating: true, taxonomy: 'Undead / Wraith' } },
            { regex: /\bxeroc\b/i, config: { templateKey: 'ph_chest', scale: 0.95, taxonomy: 'Mimic / Xeroc' } },
            { regex: /\byeti\b/i, config: { templateKey: 'bestiary_yeti', scale: 1.22, taxonomy: 'Beast / Yeti' } },
            { regex: /\bzombie\b/i, config: { templateKey: 'bestiary_zombie', scale: 1.0, taxonomy: 'Undead / Zombie' } }
        ]
    };

    REALM_MANIFESTS['angband'] = {
        baseGlyphProfile: 'angband',
        patterns: [
            { regex: /\bmorgoth\b/i, config: { templateKey: 'char_male_ranger', scale: 1.75, weaponKey: 'ph_sledgehammer', isMorgoth: true, isBoss: true, taxonomy: 'Dark Valar / Boss' } },
            { regex: /\bsauron\b/i, config: { templateKey: 'char_male_ranger', scale: 1.42, weaponKey: 'ph_mace', isBoss: true, taxonomy: 'Maia / Boss' } },
            { regex: /\b(gothmog|lungorthin|balrog)\b/i, config: { templateKey: 'bestiary_imp', scale: 1.62, weaponKey: 'ph_sledgehammer', isBalrog: true, isBoss: true, emissiveHex: '#ff3300', taxonomy: 'Balrog / Boss' } },
            { regex: /\b(glaurung|ancalagon|smaug|scatha|tiamat)\b/i, config: { templateKey: 'bestiary_dragon', scale: 1.85, isBoss: true, useAsciiTint: true, taxonomy: 'Great Dragon / Boss' } },
            { regex: /\bfarmer maggot\b/i, config: { templateKey: 'char_male_peasant_bearded', scaleY: 0.78, scaleXZ: 1.05, weaponKey: 'item_staff_branch', taxonomy: 'Townsperson' } },
            { regex: /\b(bullroarer|golfimbul|bolg|azog|ugluk|grishnakh|shagrat|gorbag|lugdush|mauhur)\b/i, config: { templateKey: 'bestiary_orc', scale: 1.18, weaponKey: 'ph_saber', shieldKey: 'item_shield_wooden', isBoss: true, taxonomy: 'Orc Captain / Unique' } },
            { regex: /\b(bert|bill|tom)\b.*troll/i, config: { templateKey: 'bestiary_troll', scale: 1.38, weaponKey: 'item_greatclub', isBoss: true, taxonomy: 'Stone Troll / Unique' } }
        ]
    };

    // ---------------------------------------------------------------------------
    // 4. Isolated Realm Glyph Tables (Tier 3)
    // ---------------------------------------------------------------------------
    const REALM_GLYPH_TABLES = Object.create(null);

    REALM_GLYPH_TABLES['angband'] = {
        'a': { templateKey: 'bestiary_ant', scale: 0.88, taxonomy: 'Ant / Insectoid' },
        'b': { templateKey: 'bestiary_bat', scale: 0.85, isFloating: true, taxonomy: 'Bat' },
        'B': { templateKey: 'bestiary_bird', scale: 0.92, isFloating: true, taxonomy: 'Bird' },
        'c': { templateKey: 'bestiary_centipede', scale: 0.92, taxonomy: 'Centipede' },
        'C': { templateKey: 'bestiary_wolf', scale: 1.0, taxonomy: 'Canine / Hound' },
        'd': { templateKey: 'bestiary_dragon', scale: 1.15, useAsciiTint: true, taxonomy: 'Young Dragon' },
        'D': { templateKey: 'bestiary_dragon', scale: 1.55, useAsciiTint: true, taxonomy: 'Ancient Dragon' },
        'e': { templateKey: 'bestiary_eye', scale: 0.92, isFloating: true, taxonomy: 'Floating Eye' },
        'E': { templateKey: 'bestiary_vortex', scale: 1.15, isFloating: true, useAsciiTint: true, taxonomy: 'Elemental / Stalker' },
        'f': { templateKey: 'bestiary_lion', scale: 0.85, taxonomy: 'Feline' },
        'F': { templateKey: 'obj_wasp', scale: 0.85, isFloating: true, taxonomy: 'Dragon Fly / Insect' },
        'g': { templateKey: 'bestiary_golem', scale: 1.15, taxonomy: 'Golem (Construct)' },
        'G': { templateKey: 'bestiary_wraith', scale: 1.05, isFloating: true, taxonomy: 'Ghost (Undead)' },
        'h': { templateKey: 'bestiary_hobgoblin', scale: 0.98, weaponKey: 'item_greatclub', taxonomy: 'Humanoid' },
        'H': { templateKey: 'bestiary_guardian', scale: 1.25, weaponKey: 'ph_axe', taxonomy: 'Hybrid Beast' },
        'i': { templateKey: 'bestiary_imp', scale: 0.78, taxonomy: 'Icky Thing' },
        'I': { templateKey: 'obj_wasp', scale: 0.85, isFloating: true, taxonomy: 'Insect' },
        'j': { templateKey: 'env_ooze_mound', scale: 0.95, useAsciiTint: true, taxonomy: 'Jelly / Ooze' },
        'J': { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake / Serpent' },
        'k': { templateKey: 'bestiary_kobold', scale: 0.95, weaponKey: 'ph_dagger', taxonomy: 'Kobold' },
        'K': { templateKey: 'bestiary_beetle', scale: 0.92, taxonomy: 'Killer Beetle' },
        'l': { templateKey: 'bestiary_aquatic', scale: 0.98, isFloating: true, taxonomy: 'Aquatic Creature' },
        'L': { templateKey: 'bestiary_wraith', scale: 1.10, isFloating: true, weaponKey: 'item_staff', taxonomy: 'Lich (Undead)' },
        'm': { templateKey: 'env_fungi_cluster', scale: 0.92, useAsciiTint: true, taxonomy: 'Mold / Fungi' },
        'M': { templateKey: 'bestiary_hydra', scale: 1.28, taxonomy: 'Multi-Headed Hydra' },
        'n': { templateKey: 'bestiary_naga', scale: 1.08, weaponKey: 'ph_saber', taxonomy: 'Naga' },
        'N': { templateKey: 'bestiary_imp', scale: 1.35, taxonomy: 'Demon / Nexus' },
        'o': { templateKey: 'bestiary_orc', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Orc' },
        'O': { templateKey: 'bestiary_ogre', scale: 1.25, weaponKey: 'item_greatclub', taxonomy: 'Ogre' },
        'p': { templateKey: 'char_male_ranger', scale: 1.0, weaponKey: 'item_longsword', taxonomy: 'Human' },
        'P': { templateKey: 'bestiary_cyclops', scale: 1.35, weaponKey: 'ph_sledgehammer', taxonomy: 'Giant' },
        'q': { templateKey: 'bestiary_bear', scale: 1.12, taxonomy: 'Quadruped Beast' },
        'Q': { templateKey: 'bestiary_quylthulg', scale: 0.95, useAsciiTint: true, taxonomy: 'Quylthulg' },
        'r': { templateKey: 'ph_street_rat', scale: 1.0, taxonomy: 'Rodent' },
        'R': { templateKey: 'bestiary_lizard', scale: 0.95, taxonomy: 'Reptile / Amphibian' },
        's': { templateKey: 'bestiary_skeleton_warrior', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Skeleton (Undead)' },
        'S': { templateKey: 'obj_spider', scale: 0.95, taxonomy: 'Spider / Arachnid' },
        't': { templateKey: 'char_male_peasant', scale: 0.98, _tunicPalette: ['#7a684d', '#4d5d6b', '#5a6b4c', '#6e4f47', '#63566e'], taxonomy: 'Townsperson' },
        'T': { templateKey: 'bestiary_troll', scale: 1.28, weaponKey: 'item_greatclub', taxonomy: 'Troll' },
        'u': { templateKey: 'bestiary_imp', scale: 0.88, taxonomy: 'Minor Demon' },
        'U': { templateKey: 'bestiary_imp', scale: 1.48, weaponKey: 'ph_sledgehammer', taxonomy: 'Major Demon' },
        'v': { templateKey: 'bestiary_vortex', scale: 0.95, isFloating: true, useAsciiTint: true, taxonomy: 'Elemental Vortex' },
        'V': { templateKey: 'char_male_ranger', scale: 1.08, weaponKey: 'item_longsword', taxonomy: 'Vampire (Undead)' },
        'w': { templateKey: 'bestiary_worm_mass', scale: 1.0, taxonomy: 'Worm / Crawler' },
        'W': { templateKey: 'bestiary_wraith', scale: 1.05, isFloating: true, weaponKey: 'item_rune_blade', taxonomy: 'Wight / Wraith (Undead)' },
        'x': { templateKey: 'bestiary_golem', scale: 1.18, taxonomy: 'Xorn / Umber Hulk' },
        'X': { templateKey: 'bestiary_imp', scale: 1.15, taxonomy: 'Extradimensional' },
        'y': { templateKey: 'bestiary_puglin', scale: 0.72, taxonomy: 'Yeek' },
        'Y': { templateKey: 'bestiary_yeti', scale: 1.15, taxonomy: 'Yeti / Ape' },
        'z': { templateKey: 'bestiary_zombie', scale: 1.02, taxonomy: 'Zombie (Undead)' },
        'Z': { templateKey: 'bestiary_wolf', scale: 1.12, useAsciiTint: true, taxonomy: 'Zephyr Hound' },
        ',': { templateKey: 'env_fungi_cluster', scale: 0.92, useAsciiTint: true, taxonomy: 'Mushroom Patch' },
        '$': { templateKey: 'ph_chest', scale: 0.95, taxonomy: 'Creeping Coins' },
        '!': { templateKey: 'ph_potion_flask', scale: 1.0, taxonomy: 'Potion Mimic' },
        '?': { templateKey: 'ph_book', scale: 1.0, taxonomy: 'Scroll Mimic' },
        '=': { templateKey: 'ph_crystal', scale: 0.85, taxonomy: 'Ring Mimic' },
        '~': { templateKey: 'ph_chest', scale: 0.95, taxonomy: 'Chest Mimic' },
        '/': { templateKey: 'ph_sledgehammer', scale: 1.15, isFloating: true, floatHeight: 0.35, taxonomy: 'Animated Weapon' },
        '|': { templateKey: 'item_greatsword', scale: 1.15, isFloating: true, floatHeight: 0.35, taxonomy: 'Animated Blade' }
    };

    REALM_GLYPH_TABLES['silq'] = {
        'b': { templateKey: 'bestiary_bat', scale: 0.85, isFloating: true, taxonomy: 'Bat' },
        'c': { templateKey: 'bestiary_centipede', scale: 0.92, taxonomy: 'Centipede' },
        'C': { templateKey: 'bestiary_wolf', scale: 1.05, taxonomy: 'Canine / Wolf / Hound' },
        'd': { templateKey: 'bestiary_dragon', scale: 1.25, taxonomy: 'Dragon / Drake' },
        'D': { templateKey: 'bestiary_dragon', scale: 1.65, taxonomy: 'Great Dragon' },
        'e': { templateKey: 'bestiary_eye', scale: 0.92, isFloating: true, taxonomy: 'Eye' },
        'f': { templateKey: 'bestiary_lion', scale: 0.85, taxonomy: 'Cat / Feline' },
        'g': { templateKey: 'char_male_ranger', scale: 1.0, weaponKey: 'item_longsword', shieldKey: 'ph_shield', taxonomy: 'Easterling' },
        'G': { templateKey: 'bestiary_cyclops', scale: 1.48, weaponKey: 'item_greatclub', taxonomy: 'Giant' },
        'H': { templateKey: 'bestiary_wraith', scale: 1.22, isFloating: true, taxonomy: 'Lurking Horror' },
        'k': { templateKey: 'bestiary_kobold', scale: 0.95, weaponKey: 'ph_dagger', taxonomy: 'Kobold' },
        'm': { templateKey: 'obj_spider', scale: 0.92, taxonomy: 'Spider / Attercop' },
        'M': { templateKey: 'obj_spider', scale: 1.85, isBoss: true, taxonomy: 'Great Spider (Ungoliant)' },
        'N': { templateKey: 'bestiary_horror', scale: 1.45, taxonomy: 'Nameless Thing' },
        'o': { templateKey: 'bestiary_orc', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Orc' },
        'O': { templateKey: 'bestiary_ogre', scale: 1.25, weaponKey: 'item_greatclub', taxonomy: 'Ogre' },
        'p': { templateKey: 'char_male_peasant', scale: 0.95, taxonomy: 'Thrall' },
        'q': { templateKey: 'bestiary_bear', scale: 1.15, taxonomy: 'Quadruped / Beast' },
        'r': { templateKey: 'ph_street_rat', scale: 1.0, taxonomy: 'Rat / Rodent' },
        'R': { templateKey: 'bestiary_imp', scale: 1.62, weaponKey: 'ph_sledgehammer', isBalrog: true, isBoss: true, taxonomy: 'Rauko / Balrog' },
        's': { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Serpent' },
        'S': { templateKey: 'obj_snake', scale: 1.25, taxonomy: 'Great Serpent' },
        't': { templateKey: 'bestiary_troll', scale: 1.28, weaponKey: 'item_greatclub', taxonomy: 'Troll' },
        'T': { templateKey: 'bestiary_troll', scale: 1.45, weaponKey: 'item_greatclub', taxonomy: 'Great Troll' },
        'u': { templateKey: 'char_male_ranger', scale: 1.02, weaponKey: 'item_bow', taxonomy: 'Dark Elf / Glamhoth' },
        'v': { templateKey: 'char_male_priest', scale: 1.08, isFloating: true, taxonomy: 'Vampire' },
        'V': { templateKey: 'char_male_ranger', scale: 1.75, weaponKey: 'ph_sledgehammer', isMorgoth: true, isBoss: true, taxonomy: 'Valar / Morgoth' },
        'w': { templateKey: 'bestiary_wraith', scale: 1.08, isFloating: true, taxonomy: 'Shadow / Phantom' },
        'W': { templateKey: 'bestiary_wraith', scale: 1.15, isFloating: true, taxonomy: 'Wraith' },
        'y': { templateKey: 'bestiary_bird', scale: 0.92, isFloating: true, taxonomy: 'Gorcrow / Crebain' },
        'z': { templateKey: 'bestiary_zombie', scale: 1.0, taxonomy: 'Mewlip (Undead)' },
        '&': { templateKey: 'env_tanglethorn', scale: 1.05, taxonomy: 'Thorn / Dead Bush' }
    };

    REALM_GLYPH_TABLES['nethack'] = {
        '@': { templateKey: 'char_male_guard', scale: 1.02, weaponKey: 'item_longsword', shieldKey: 'item_shield_wooden', taxonomy: 'Human / NPC' },
        'a': { templateKey: 'bestiary_ant', scale: 0.88, taxonomy: 'Ant / Insectoid' },
        'b': { templateKey: 'env_ooze_mound', scale: 0.95, useAsciiTint: true, taxonomy: 'Acidic Blob / Cube' },
        'c': { templateKey: 'bestiary_flamingo', scale: 0.92, taxonomy: 'Cockatrice (Petrifying)' },
        'd': { templateKey: 'bestiary_husky', scale: 1.02, taxonomy: 'Canine / Pet' },
        'e': { templateKey: 'bestiary_eye', scale: 0.92, isFloating: true, taxonomy: 'Eye / Floating Sphere' },
        'f': { templateKey: 'bestiary_lion', scale: 0.85, taxonomy: 'Feline' },
        'g': { templateKey: 'bestiary_goblin', scale: 0.78, taxonomy: 'Gremlin / Gargoyle' },
        'h': { templateKey: 'char_male_priest', scale: 1.02, weaponKey: 'ph_mace', taxonomy: 'Humanoid / Mind Flayer' },
        'i': { templateKey: 'bestiary_imp', scale: 0.78, taxonomy: 'Imp / Minor Demon' },
        'j': { templateKey: 'env_ooze_mound', scale: 0.95, useAsciiTint: true, taxonomy: 'Jelly / Ooze' },
        'k': { templateKey: 'obj_wasp', scale: 0.85, isFloating: true, taxonomy: 'Killer Bee / Insect' },
        'l': { templateKey: 'bestiary_goblin', scale: 0.74, taxonomy: 'Leprechaun' },
        'm': { templateKey: 'ph_chest', scale: 0.95, taxonomy: 'Mimic' },
        'n': { templateKey: 'char_female_peasant', scale: 0.95, taxonomy: 'Nymph' },
        'o': { templateKey: 'bestiary_orc', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Orc' },
        'p': { templateKey: 'bestiary_golem', scale: 0.88, taxonomy: 'Piercer' },
        'q': { templateKey: 'bestiary_bear', scale: 1.12, taxonomy: 'Quadruped / Leocrotta' },
        'r': { templateKey: 'ph_street_rat', scale: 1.0, taxonomy: 'Rodent' },
        's': { templateKey: 'obj_spider', scale: 0.92, taxonomy: 'Arachnid / Scorpion' },
        't': { templateKey: 'bestiary_horror', scale: 1.25, taxonomy: 'Trapper / Lurker' },
        'u': { templateKey: 'bestiary_horse', scale: 1.08, taxonomy: 'Unicorn / Equine' },
        'v': { templateKey: 'bestiary_vortex', scale: 0.95, isFloating: true, useAsciiTint: true, taxonomy: 'Vortex / Cloud' },
        'w': { templateKey: 'bestiary_worm_mass', scale: 1.0, taxonomy: 'Worm' },
        'x': { templateKey: 'bestiary_beetle', scale: 0.76, taxonomy: 'Grid Bug / Xan' },
        'y': { templateKey: 'bestiary_vortex', scale: 0.85, isFloating: true, taxonomy: 'Floating Light' },
        'z': { templateKey: 'bestiary_golem', scale: 1.15, taxonomy: 'Zruty' },
        'A': { templateKey: 'char_valkyrie', scale: 1.18, isFloating: true, taxonomy: 'Angel / Archon' },
        'B': { templateKey: 'bestiary_bat', scale: 0.85, isFloating: true, taxonomy: 'Bat / Bird' },
        'C': { templateKey: 'bestiary_guardian', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Centaur' },
        'D': { templateKey: 'bestiary_dragon', scale: 1.55, useAsciiTint: true, taxonomy: 'Dragon' },
        'E': { templateKey: 'bestiary_vortex', scale: 1.15, isFloating: true, useAsciiTint: true, taxonomy: 'Elemental' },
        'F': { templateKey: 'env_fungi_cluster', scale: 0.92, useAsciiTint: true, taxonomy: 'Fungus / Mold' },
        'G': { templateKey: 'bestiary_goblin', scale: 0.82, weaponKey: 'item_pickaxe', taxonomy: 'Gnome (Humanoid)' },
        'H': { templateKey: 'bestiary_cyclops', scale: 1.35, weaponKey: 'ph_sledgehammer', taxonomy: 'Giant / Minotaur' },
        'J': { templateKey: 'bestiary_dragon', scale: 1.35, taxonomy: 'Jabberwock' },
        'K': { templateKey: 'char_male_guard', scale: 1.02, weaponKey: 'ph_mace', taxonomy: 'Keystone Kop' },
        'L': { templateKey: 'bestiary_wraith', scale: 1.10, isFloating: true, weaponKey: 'item_staff', taxonomy: 'Lich (Undead)' },
        'M': { templateKey: 'bestiary_zombie', scale: 1.05, taxonomy: 'Mummy (Undead)' },
        'N': { templateKey: 'bestiary_naga', scale: 1.08, taxonomy: 'Naga' },
        'O': { templateKey: 'bestiary_ogre', scale: 1.25, weaponKey: 'item_greatclub', taxonomy: 'Ogre' },
        'P': { templateKey: 'env_ooze_mound', scale: 1.05, useAsciiTint: true, taxonomy: 'Pudding / Ooze' },
        'Q': { templateKey: 'char_male_priest', scale: 0.95, taxonomy: 'Quantum Mechanic' },
        'R': { templateKey: 'bestiary_scorpion', scale: 0.95, taxonomy: 'Rust Monster / Disenchanter' },
        'S': { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake / Serpent' },
        'T': { templateKey: 'bestiary_troll', scale: 1.28, weaponKey: 'item_greatclub', taxonomy: 'Troll' },
        'U': { templateKey: 'bestiary_golem', scale: 1.18, taxonomy: 'Umber Hulk' },
        'V': { templateKey: 'char_male_ranger', scale: 1.08, weaponKey: 'item_longsword', taxonomy: 'Vampire (Undead)' },
        'W': { templateKey: 'bestiary_wraith', scale: 1.05, isFloating: true, taxonomy: 'Wraith (Undead)' },
        'X': { templateKey: 'bestiary_golem', scale: 1.18, taxonomy: 'Xorn' },
        'Y': { templateKey: 'bestiary_bear', scale: 1.18, taxonomy: 'Owlbear / Ape' },
        'Z': { templateKey: 'bestiary_zombie', scale: 1.02, taxonomy: 'Zombie (Undead)' },
        '&': { templateKey: 'bestiary_imp', scale: 1.55, weaponKey: 'ph_sledgehammer', isBoss: true, taxonomy: 'Major Demon' },
        ';': { templateKey: 'bestiary_aquatic', scale: 1.25, isFloating: true, taxonomy: 'Sea Monster' },
        ':': { templateKey: 'bestiary_lizard', scale: 0.95, taxonomy: 'Lizard / Reptile' },
        "'": { templateKey: 'bestiary_golem', scale: 1.15, taxonomy: 'Golem (Construct)' }
    };

    REALM_GLYPH_TABLES['dcss'] = {
        'g': { templateKey: 'bestiary_goblin', scale: 0.85, weaponKey: 'ph_dagger', taxonomy: 'Goblin / Gnoll' },
        'h': { templateKey: 'bestiary_hobgoblin', scale: 0.98, weaponKey: 'item_greatclub', taxonomy: 'Hobgoblin' },
        'k': { templateKey: 'bestiary_kobold', scale: 0.88, weaponKey: 'ph_dagger', taxonomy: 'Kobold' },
        'o': { templateKey: 'bestiary_orc', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Orc' },
        'O': { templateKey: 'bestiary_ogre', scale: 1.25, weaponKey: 'item_greatclub', taxonomy: 'Ogre' },
        'T': { templateKey: 'bestiary_troll', scale: 1.28, weaponKey: 'item_greatclub', taxonomy: 'Troll' },
        'P': { templateKey: 'env_tanglethorn', scale: 0.95, taxonomy: 'Plant / Bush' },
        'f': { templateKey: 'env_fungi_cluster', scale: 0.92, useAsciiTint: true, taxonomy: 'Fungus' },
        'C': { templateKey: 'bestiary_guardian', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Centaur' },
        'd': { templateKey: 'bestiary_lizardfolk', scale: 1.12, weaponKey: 'item_spear', taxonomy: 'Draconian' },
        'D': { templateKey: 'bestiary_dragon', scale: 1.55, useAsciiTint: true, taxonomy: 'Dragon' },
        'E': { templateKey: 'bestiary_imp', scale: 1.48, weaponKey: 'ph_sledgehammer', taxonomy: 'Executioner / Demon' },
        'e': { templateKey: 'bestiary_eye', scale: 1.05, isFloating: true, taxonomy: 'Eye / Elf' },
        'H': { templateKey: 'bestiary_hydra', scale: 1.32, taxonomy: 'Hydra' },
        'J': { templateKey: 'env_ooze_mound', scale: 1.0, useAsciiTint: true, taxonomy: 'Jelly / Slime' },
        's': { templateKey: 'obj_spider', scale: 0.95, taxonomy: 'Spider' },
        'S': { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake' },
        'w': { templateKey: 'bestiary_worm_mass', scale: 1.0, taxonomy: 'Worm' },
        'W': { templateKey: 'bestiary_wraith', scale: 1.05, isFloating: true, taxonomy: 'Wraith' },
        'z': { templateKey: 'bestiary_zombie', scale: 1.0, taxonomy: 'Zombie' },
        'Z': { templateKey: 'bestiary_skeleton_warrior', scale: 1.0, weaponKey: 'item_goblin_sword', taxonomy: 'Skeleton' },
        'B': { templateKey: 'bestiary_beetle', scale: 1.05, taxonomy: 'Beetle' },
        'F': { templateKey: 'obj_frog', scale: 0.98, taxonomy: 'Frog' },
        'N': { templateKey: 'bestiary_naga', scale: 1.08, weaponKey: 'item_spear', taxonomy: 'Naga' },
        'M': { templateKey: 'bestiary_zombie', scale: 1.05, taxonomy: 'Mummy' },
        'V': { templateKey: 'char_male_ranger', scale: 1.08, weaponKey: 'item_longsword', taxonomy: 'Vampire' },
        'L': { templateKey: 'bestiary_wraith', scale: 1.12, isFloating: true, weaponKey: 'item_staff', taxonomy: 'Lich' },
        'K': { templateKey: 'bestiary_kobold', scale: 1.02, weaponKey: 'ph_saber', taxonomy: 'Kobold Demonologist' },
        '8': { templateKey: 'bestiary_golem', scale: 1.22, taxonomy: 'Golem / Statue' }
    };

    REALM_GLYPH_TABLES['brogue'] = {
        'g': { templateKey: 'bestiary_goblin', scale: 0.85, weaponKey: 'item_spear', taxonomy: 'Goblin' },
        'k': { templateKey: 'bestiary_kobold', scale: 0.88, weaponKey: 'ph_dagger', taxonomy: 'Kobold' },
        'o': { templateKey: 'bestiary_ogre', scale: 1.25, weaponKey: 'item_greatclub', taxonomy: 'Ogre' },
        'd': { templateKey: 'char_male_ranger', scale: 1.0, weaponKey: 'ph_saber', taxonomy: 'Dar' },
        'C': { templateKey: 'bestiary_guardian', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Centaur' },
        'j': { templateKey: 'env_ooze_mound', scale: 0.95, useAsciiTint: true, taxonomy: 'Pink Jelly' },
        'a': { templateKey: 'env_ooze_mound', scale: 0.90, useAsciiTint: true, taxonomy: 'Acid Mound' },
        'b': { templateKey: 'bestiary_eye', scale: 1.08, isFloating: true, taxonomy: 'Bloat' },
        'e': { templateKey: 'bestiary_aquatic', scale: 1.22, isFloating: true, taxonomy: 'Eel' },
        'K': { templateKey: 'bestiary_kraken', scale: 1.35, isFloating: true, taxonomy: 'Kraken' },
        'p': { templateKey: 'char_female_peasant', scale: 0.65, isFloating: true, taxonomy: 'Pixie' },
        'm': { templateKey: 'bestiary_puglin', scale: 0.72, taxonomy: 'Monkey' },
        'w': { templateKey: 'bestiary_wraith', scale: 1.05, isFloating: true, taxonomy: 'Wraith' },
        'W': { templateKey: 'bestiary_guardian', scale: 1.38, weaponKey: 'ph_axe', isBoss: true, taxonomy: 'Warden of Yendor' },
        'z': { templateKey: 'bestiary_zombie', scale: 1.0, taxonomy: 'Zombie' },
        'D': { templateKey: 'bestiary_dragon', scale: 1.55, taxonomy: 'Dragon' },
        'T': { templateKey: 'bestiary_troll', scale: 1.28, weaponKey: 'item_greatclub', taxonomy: 'Troll' },
        'H': { templateKey: 'bestiary_horror', scale: 1.32, taxonomy: 'Tentacle Horror' },
        'I': { templateKey: 'bestiary_vortex', scale: 1.15, isFloating: true, emissiveHex: '#ff4500', taxonomy: 'Elemental / Ifrit' },
        'G': { templateKey: 'bestiary_golem', scale: 1.22, taxonomy: 'Golem' }
    };

    REALM_GLYPH_TABLES['rogue'] = {
        'A': { templateKey: 'bestiary_aquatic', scale: 1.0, taxonomy: 'Aquatic / Aquator' },
        'B': { templateKey: 'bestiary_bat', scale: 0.82, isFloating: true, taxonomy: 'Bat' },
        'C': { templateKey: 'bestiary_guardian', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Hybrid / Centaur' },
        'D': { templateKey: 'bestiary_dragon', scale: 1.55, taxonomy: 'Dragon' },
        'E': { templateKey: 'bestiary_stork', scale: 1.05, taxonomy: 'Avian / Emu' },
        'F': { templateKey: 'env_tanglethorn', scale: 1.02, taxonomy: 'Flora / Venus Flytrap' },
        'G': { templateKey: 'bestiary_owl', scale: 1.25, isFloating: true, taxonomy: 'Hybrid / Griffin' },
        'H': { templateKey: 'bestiary_hobgoblin', scale: 0.98, weaponKey: 'item_greatclub', taxonomy: 'Hobgoblin' },
        'I': { templateKey: 'bestiary_yeti', scale: 1.08, emissiveHex: '#38bdf8', taxonomy: 'Construct / Ice Monster' },
        'J': { templateKey: 'bestiary_dragon', scale: 1.38, taxonomy: 'Dragon / Jabberwock' },
        'K': { templateKey: 'bestiary_bird', scale: 0.82, isFloating: true, taxonomy: 'Avian / Kestrel' },
        'L': { templateKey: 'bestiary_goblin', scale: 0.72, taxonomy: 'Fey / Leprechaun' },
        'M': { templateKey: 'bestiary_naga', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Monstrosity / Medusa' },
        'N': { templateKey: 'char_female_peasant', scale: 0.95, taxonomy: 'Fey / Nymph' },
        'O': { templateKey: 'bestiary_orc', scale: 1.0, weaponKey: 'item_goblin_sword', shieldKey: 'item_shield_wooden', taxonomy: 'Orc' },
        'P': { templateKey: 'bestiary_wraith', scale: 1.05, isFloating: true, taxonomy: 'Undead / Phantom' },
        'Q': { templateKey: 'bestiary_horse', scale: 1.02, taxonomy: 'Equine / Quagga' },
        'R': { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake / Rattlesnake' },
        'S': { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake' },
        'T': { templateKey: 'bestiary_troll', scale: 1.28, weaponKey: 'item_greatclub', taxonomy: 'Troll' },
        'U': { templateKey: 'bestiary_horse', scale: 1.08, taxonomy: 'Equine / Black Unicorn' },
        'V': { templateKey: 'char_male_ranger', scale: 1.08, weaponKey: 'item_longsword', taxonomy: 'Undead / Vampire' },
        'W': { templateKey: 'bestiary_wraith', scale: 1.10, isFloating: true, taxonomy: 'Undead / Wraith' },
        'X': { templateKey: 'ph_chest', scale: 0.95, taxonomy: 'Mimic / Xeroc' },
        'Y': { templateKey: 'bestiary_yeti', scale: 1.22, taxonomy: 'Beast / Yeti' },
        'Z': { templateKey: 'bestiary_zombie', scale: 1.0, taxonomy: 'Undead / Zombie' }
    };

    REALM_GLYPH_TABLES['frogcomposband'] = REALM_GLYPH_TABLES['angband'];
    REALM_GLYPH_TABLES['hengband'] = REALM_GLYPH_TABLES['angband'];

    // ---------------------------------------------------------------------------
    // 5. Tier 2 — Universal Morphological Species & Head-Noun Matcher
    // ---------------------------------------------------------------------------
    function matchUniversalSpecies(lower) {
        // 1. Canines (Wolves, Dogs, Foxes, Hounds, Werewolves)
        if (/\b(wolf|wolves|warg|hound|jackal|coyote|fox|vixen|kitsune|dingo|canine|dog|puppy|shiba|terrier|husky|mastiff|pit bull|cerberus|fenrir|hellhound|hell hound|dhole|werewolf|wolfman|lycanthrope)\b/.test(lower)) {
            if (/\b(werewolf|wolfman|lycanthrope)\b/.test(lower)) {
                return { templateKey: 'bestiary_werewolf', scale: 1.12, weaponKey: 'ph_axe', taxonomy: 'Canine / Werewolf' };
            }
            if (/\b(hell hound|hellhound|cerberus|fire hound|plasma hound|lava hound|carcharoth|draugluin)\b/.test(lower)) {
                return { templateKey: 'bestiary_hellhound', scale: 1.15, emissiveHex: '#ff4500', isBoss: /cerberus|carcharoth|draugluin/i.test(lower), taxonomy: 'Canine / Hellhound' };
            }
            if (/\b(fox|vixen|kitsune|jackal|coyote|dingo)\b/.test(lower)) {
                return { templateKey: 'bestiary_fox', scale: 0.90, taxonomy: 'Canine / Wild' };
            }
            if (/\b(little dog|small dog|puppy|shiba|terrier|scrawny dog)\b/.test(lower)) {
                return { templateKey: 'bestiary_shiba', scale: 0.80, taxonomy: 'Canine / Companion' };
            }
            if (/\b(husky|large dog|dog|mastiff|pit bull|blink dog|frost hound|cold hound|ice hound|winter hound)\b/.test(lower)) {
                return { templateKey: 'bestiary_husky', scale: 1.02, taxonomy: 'Canine / Hound' };
            }
            const isElementalHound = /\b(hound)\b/.test(lower) && /\b(light|shadow|dark|air|water|earth|energy|ether|nexus|chaos|time|gravity|inertia|sound|shards|mana|multi-hued|aether|vibration|impact|acid|venom)\b/.test(lower);
            return { templateKey: 'bestiary_wolf', scale: 1.0, useAsciiTint: isElementalHound, taxonomy: 'Canine / Wolf' };
        }

        // 2. Felines (Cats, Panthers, Tigers, Lions, Sabre-tooths)
        if (/\b(cat|kitten|housecat|panther|tiger|lion|leopard|cougar|cheetah|lynx|jaguar|puma|smilodon|sabre-tooth|feline|manticore)\b/.test(lower)) {
            const isSmall = /\b(kitten|housecat|wild cat|scrawny cat)\b/.test(lower);
            const isLarge = /\b(sabre-tooth|smilodon|tiger|lion|manticore)\b/.test(lower);
            return { templateKey: 'bestiary_lion', scale: isSmall ? 0.46 : (isLarge ? 1.18 : 0.95), taxonomy: 'Feline' };
        }

        // 3. Bears & Heavy Quadrupeds
        if (/\b(bear|grizzly|polar bear|werebear|beorn|owlbear|badger|wolverine|boar|pig|swine|warthog|mammoth|mastodon|rhino|elephant|mumak|hippo|leocrotta|baluchitherium|titanother)\b/.test(lower)) {
            const isArmored = /\b(armored|war|battle|iron|siege)\b/.test(lower);
            return { templateKey: isArmored ? 'bestiary_bear_armored' : 'bestiary_bear', scale: 1.15, taxonomy: 'Beast / Quadruped' };
        }

        // 4. Equines & Hybrids (Horses, Unicorns, Centaurs)
        if (/\b(horse|pony|steed|stallion|mare|unicorn|pegasus|donkey|mule|zebra|centaur|yaktaur|quagga|hippogriff)\b/.test(lower)) {
            if (/\b(centaur|yaktaur)\b/.test(lower)) {
                return { templateKey: 'bestiary_guardian', scale: 1.18, weaponKey: 'item_bow', taxonomy: 'Hybrid / Centaur' };
            }
            return { templateKey: 'bestiary_horse', scale: 1.05, taxonomy: 'Equine' };
        }

        // 5. Rodents
        if (/\b(rat|mouse|mice|rodent|vole|mole|shrew|beaver|muskrat|ferret|weasel|stoat|rabid|vermin)\b/.test(lower)) {
            return { templateKey: 'ph_street_rat', scale: 1.0, taxonomy: 'Rodent' };
        }

        // 6. Bats
        if (/\b(bat|vampire bat|megabat|fruit bat|doombat|stirge)\b/.test(lower)) {
            return { templateKey: 'bestiary_bat', scale: 0.85, isFloating: true, taxonomy: 'Bat' };
        }

        // 7. Birds / Avian
        if (/\b(bird|crow|raven|crebain|gorcrow|eagle|falcon|hawk|kestrel|owl|vulture|buzzard|condor|harpy|roc|seagull|crane|heron|swan|flamingo|stork|emu|ostrich|phoenix|cockatrice|chickatrice|pyrolisk|tengu|griffin|griffon)\b/.test(lower)) {
            if (/\b(owl|tengu|griffin|griffon|harpy)\b/.test(lower)) return { templateKey: 'bestiary_owl', scale: 1.05, isFloating: true, taxonomy: 'Avian / Owl' };
            if (/\b(flamingo|cockatrice|chickatrice|pyrolisk)\b/.test(lower)) return { templateKey: 'bestiary_flamingo', scale: 0.92, taxonomy: 'Avian / Petrifier' };
            if (/\b(stork|crane|heron|swan|emu|ostrich)\b/.test(lower)) return { templateKey: 'bestiary_stork', scale: 1.05, taxonomy: 'Avian / Stork' };
            return { templateKey: 'bestiary_bird', scale: 0.92, isFloating: true, taxonomy: 'Avian / Bird' };
        }

        // 8. Spiders & Arachnids
        if (/\b(spider|tarantula|attercop|arachnid|shelob|ungoliant|drider|black widow|recluse|weaver|spinner)\b/.test(lower)) {
            return { templateKey: 'obj_spider', scale: 0.95, taxonomy: 'Spider / Arachnid' };
        }

        // 9. Scorpions & Rust Beasts
        if (/\b(scorpion|pedipalp|rust monster|disenchanter)\b/.test(lower)) {
            return { templateKey: 'bestiary_scorpion', scale: 0.95, taxonomy: 'Arachnid / Scorpion' };
        }

        // 10. Beetles, Ants, Centipedes, Wasps/Insects
        if (/\b(beetle|scarab|stag|weevil|cockroach|roach|radroach|bug|grid bug|xan|tick|flea|louse|lice|mite)\b/.test(lower)) {
            return { templateKey: 'bestiary_beetle', scale: 0.92, taxonomy: 'Insect / Beetle' };
        }
        if (/\b(ant|formic|termite|myrmex)\b/.test(lower)) {
            return { templateKey: 'bestiary_ant', scale: 0.88, taxonomy: 'Insect / Ant' };
        }
        if (/\b(centipede|millipede|earwig|crawler)\b/.test(lower)) {
            return { templateKey: 'bestiary_centipede', scale: 0.92, taxonomy: 'Insect / Centipede' };
        }
        if (/\b(wasp|bee|hornet|bumblebee|yellowjacket|fly|dragonfly|firefly|hummerhorn|moth|butterfly|mosquito|gnat|locust|mantis)\b/.test(lower)) {
            return { templateKey: 'obj_wasp', scale: 0.85, isFloating: true, taxonomy: 'Insect / Flyer' };
        }

        // 11. Snakes & Serpents
        if (/\b(snake|serpent|viper|cobra|asp|python|boa|mamba|adder|rattlesnake|sidewinder|constrictor|anaconda|copperhead|krait|moccasin|couatl)\b/.test(lower)) {
            return { templateKey: 'obj_snake', scale: 0.95, taxonomy: 'Snake / Serpent' };
        }

        // 12. Nagas, Medusas & Merfolk
        if (/\b(naga|medusa|gorgon|siren|merfolk|mermaid|triton|lamia)\b/.test(lower)) {
            return { templateKey: 'bestiary_naga', scale: 1.08, weaponKey: /archer|medusa|bow/i.test(lower) ? 'item_bow' : 'ph_saber', taxonomy: 'Naga / Merfolk' };
        }

        // 13. Hydras
        if (/\b(hydra|lernaean|orochi)\b/.test(lower)) {
            return { templateKey: 'bestiary_hydra', scale: 1.32, taxonomy: 'Multi-Headed Hydra' };
        }

        // 14. Dragons, Drakes & Wyrms
        if (/\b(dragon|drake|wyrm|wyvern|dragonet|fyrdrake|lindworm|amphiptere|jabberwock)\b/.test(lower)) {
            const isAncient = /\b(ancient|great|elder|lord|king|emperor|arch|sky|ethereal)\b/.test(lower);
            return { templateKey: 'bestiary_dragon', scale: isAncient ? 1.55 : 1.22, useAsciiTint: true, taxonomy: 'Dragon' };
        }

        // 15. Frogs & Toads
        if (/\b(frog|toad|bullfrog|cane toad|treefrog|tadpole|kappa)\b/.test(lower)) {
            return { templateKey: 'obj_frog', scale: 0.95, taxonomy: 'Amphibian / Frog' };
        }

        // 16. Lizards, Newts, Reptiles & Dinosaurs
        if (/\b(lizard|newt|axolotl|gecko|iguana|chameleon|basilisk|komodo|gila|crocodile|alligator|caiman|salamander|tuatara|skink|monitor|raptor|velociraptor|tyrannosaur|triceratops|stegosaur|ankylosaur|dinosaur|turtle|tortoise|snapping)\b/.test(lower)) {
            return { templateKey: 'bestiary_lizard', scale: 0.95, taxonomy: 'Reptile / Lizard' };
        }

        // 17. Aquatic & Cephalopods
        if (/\b(kraken|octopus|squid|octopode|cuttlefish|leviathan|mindwitness|watcher in the water)\b/.test(lower)) {
            return { templateKey: 'bestiary_kraken', scale: 1.35, isFloating: true, taxonomy: 'Aquatic / Cephalopod' };
        }
        if (/\b(fish|eel|shark|piranha|barracuda|pike|carp|trout|salmon|catfish|angler|crab|lobster|crayfish|jellyfish|seahorse|manta|ray|aquator)\b/.test(lower)) {
            return { templateKey: 'bestiary_aquatic', scale: 0.98, isFloating: true, taxonomy: 'Aquatic Creature' };
        }

        // 18. Eyes, Beholders & Spheres
        if (/\b(eye|eyeball|beholder|gazer|spectator|death Tyrant|director|observer|sphere|lens|orb of eyes|bloat)\b/.test(lower)) {
            return { templateKey: 'bestiary_eye', scale: 0.95, isFloating: true, floatHeight: 0.40, taxonomy: 'Floating Eye' };
        }

        // 19. Vortices & Elementals
        if (/\b(vortex|elemental|ifrit|efreet|efreeti|djinn|djinni|genie|whirlwind|tornado|cyclone|maelstrom|tempest|dust devil|wisp|will-o-the-wisp|ball lightning|nexus|plasma|mana storm|spark|orb of)\b/.test(lower)) {
            return { templateKey: 'bestiary_vortex', scale: 0.95, isFloating: true, floatHeight: 0.25, useAsciiTint: true, taxonomy: 'Elemental / Vortex' };
        }

        // 20. Jellies, Oozes, Slimes & Puddings
        if (/\b(jelly|ooze|slime|blob|pudding|cube|gelatinous|amoeba|protoplasm|mucus|goop|ichor|shoggoth|icky thing)\b/.test(lower)) {
            return { templateKey: 'env_ooze_mound', scale: 0.95, useAsciiTint: true, taxonomy: 'Ooze / Slime' };
        }

        // 21. Mushrooms, Molds & Fungi
        if (/\b(mushroom|fungus|fungi|mold|mould|shrieker|spore|myconid|puffball|toadstool|lichen)\b/.test(lower)) {
            return { templateKey: 'env_fungi_cluster', scale: 0.92, useAsciiTint: true, taxonomy: 'Fungi / Mushroom' };
        }

        // 22. Trees, Bushes, Thorns & Flora
        if (/\bhuorn\b/.test(lower)) {
            return { templateKey: 'env_tree', scale: 1.25, taxonomy: 'Flora / Huorn' };
        }
        if (/\b(treant|ent|treeman|shambling mangrove)\b/.test(lower)) {
            return { templateKey: 'bestiary_treeman', scale: 1.32, taxonomy: 'Flora / Treant' };
        }
        if (/\b(plant|bush|tree|tanglethorn|thorn|briar|vine|creeper|strangler|triffid|mandrake|shambling mound|kelp|flytrap|weed)\b/.test(lower)) {
            return { templateKey: 'env_tanglethorn', scale: 1.0, taxonomy: 'Flora / Plant' };
        }

        // 23. Worms, Maggots & Crawlers
        if (/\b(worm|maggot|grub|larva|leech|slug|snail|nematode|tapeworm|hookworm|rotifer|caterpillar)\b/.test(lower)) {
            return { templateKey: 'bestiary_worm_mass', scale: 1.0, taxonomy: 'Worm / Crawler' };
        }

        // 24. Quylthulgs
        if (/\bquylthulg\b/.test(lower)) {
            return { templateKey: 'bestiary_quylthulg', scale: 0.95, useAsciiTint: true, taxonomy: 'Quylthulg' };
        }

        // 25. Mimics, Creeping Coins & Animated Weapons
        if (/\bcreeping.*coins\b/.test(lower)) {
            return { templateKey: 'item_gold', scale: 1.0, taxonomy: 'Creeping Coins' };
        }
        if (/\b(mimic|xeroc)\b/.test(lower)) {
            if (/potion/.test(lower)) return { templateKey: 'ph_potion_flask', scale: 1.0, taxonomy: 'Potion Mimic' };
            if (/scroll|book/.test(lower)) return { templateKey: 'ph_book', scale: 1.0, taxonomy: 'Scroll Mimic' };
            if (/ring|crystal|orb/.test(lower)) return { templateKey: 'ph_crystal', scale: 0.85, taxonomy: 'Relic Mimic' };
            return { templateKey: 'ph_chest', scale: 0.95, taxonomy: 'Chest Mimic / Coins' };
        }
        if (/animated.*(?:axe|pike|staff|blade|sword)|death scythe|death sword|spectral blade|dancing sword/.test(lower)) {
            return { templateKey: 'item_greatsword', scale: 1.15, isFloating: true, floatHeight: 0.35, taxonomy: 'Animated Weapon' };
        }

        // 26. Skeletons & Undead Skulls
        if (/\b(skull druj|floating skull|flaming skull|burning skull|demilich)\b/.test(lower)) {
            return { templateKey: 'bestiary_skull', scale: 1.05, isFloating: true, taxonomy: 'Undead / Skull' };
        }
        if (/\b(skeleton|skeletal|druj|bone|osteon)\b/.test(lower)) {
            const isKnight = /\b(armored|armoured|knight|warrior|lord|champion|king|guard|paladin|general|captain|druj|hero|halberdier|pikeman)\b/.test(lower);
            const explicitWeapon = /\b(pikeman|halberdier|lancer|spearman)\b/.test(lower)
                ? 'item_spear'
                : (/\b(archer|bowman|marksman)\b/.test(lower) ? 'item_bow' : null);
            return {
                templateKey: isKnight ? 'bestiary_skeleton_knight' : 'bestiary_skeleton_warrior',
                scale: 1.0,
                weaponKey: explicitWeapon,
                _seedWeapons: explicitWeapon ? null : (isKnight
                    ? ['item_longsword', 'ph_axe', 'ph_mace', 'ph_hammer', 'item_spear', 'item_greatsword']
                    : ['item_goblin_sword', 'ph_hatchet', 'ph_dagger', 'item_spear', 'ph_saber', 'ph_mace']),
                _seedShields: isKnight
                    ? ['item_shield_raven', 'item_shield_metal', 'ph_shield', null]
                    : ['item_shield_wooden', 'item_shield_wicker', null, null],
                taxonomy: 'Skeleton (Undead)'
            };
        }

        // 27. Zombies, Mummies & Ghouls
        if (/\b(zombie|ghoul|ghast|wight|barrow-wight|mummy|mummified|revenant|draugr|cadaver|corpse|rotter|shambler|walker|undead|mewlip)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_zombie',
                scale: 1.02,
                _seedWeapons: /wight|draugr|revenant/i.test(lower) ? ['item_longsword', 'ph_axe', 'ph_mace'] : null,
                taxonomy: 'Zombie / Mummy (Undead)'
            };
        }

        // 28. Wraiths, Spectres, Ghosts, Liches & Nazgul
        if (/\b(wraith|ghost|spectre|specter|shade|shadow|phantom|phantasm|apparition|poltergeist|banshee|eidolon|spirit|haunt|nightmare|dread|lich|archlich|nazgul|ringwraith)\b/.test(lower)) {
            const isLich = /\b(lich|archlich)\b/.test(lower);
            return {
                templateKey: 'bestiary_wraith',
                scale: isLich ? 1.10 : 1.05,
                isFloating: true,
                _seedWeapons: isLich ? ['item_staff', 'item_wand', 'item_rod'] : ['item_rune_blade', 'item_greatsword', 'ph_estoc'],
                taxonomy: isLich ? 'Lich (Undead)' : 'Wraith / Ghost (Undead)'
            };
        }

        // 29. Golems, Statues, Gargoyles & Constructs
        if (/\b(golem|gargoyle|statue|idol|automaton|construct|colossus|caryatid|sentinel|totem|turret|piercer|xorn|umber hulk|zruty)\b/.test(lower)) {
            const isStatue = /\b(statue|idol|gargoyle|caryatid|totem|turret|sentinel)\b/.test(lower) && !/\bgolem\b/.test(lower);
            return {
                templateKey: isStatue ? 'bestiary_statue' : 'bestiary_golem',
                scale: 1.18,
                taxonomy: isStatue ? 'Statue / Construct' : 'Golem (Construct)'
            };
        }

        // 30. Demons, Imps, Balrogs & Devils
        if (/\b(demon|imp|quasit|homunculus|devil|fiend|balrog|rauko|succubus|incubus|erinyes|marilith|vrock|hezrou|glabrezu|nalfeshnee|balor|pit fiend|lemure|maneh|dretch|hellion|tormentor|cacodemon|executioner)\b/.test(lower)) {
            const isMajor = /\b(balrog|rauko|balor|pit fiend|marilith|glabrezu|nalfeshnee|arch-demon|demon lord|greater|executioner)\b/.test(lower);
            return {
                templateKey: 'bestiary_imp',
                scale: isMajor ? 1.48 : 0.88,
                weaponKey: isMajor ? 'ph_sledgehammer' : null,
                isBalrog: /\b(balrog|rauko)\b/.test(lower),
                taxonomy: isMajor ? 'Major Demon' : 'Minor Demon'
            };
        }

        // 31. Angels, Archons & Valkyries
        if (/\b(angel|archon|seraph|cherub|deva|planetar|solar|valkyrie|einherjar|ainur|maia|ki-rin)\b/.test(lower)) {
            return { templateKey: 'char_valkyrie', scale: 1.18, isFloating: true, taxonomy: 'Celestial / Angel' };
        }

        // 32. Kobolds
        if (/\bkobold\b/.test(lower)) {
            return {
                templateKey: 'bestiary_kobold',
                scale: 0.95,
                _seedWeapons: ['ph_dagger', 'item_spear', 'ph_hatchet', 'item_goblin_sword', 'item_bow'],
                _seedShields: ['item_shield_wicker', 'item_shield_wooden', null],
                taxonomy: 'Kobold'
            };
        }

        // 33. Yeeks, Gremlins & Monkeys
        if (/\b(yeek|gremlin|grue|boggart|brownie|pixie|sprite|quickling|monkey|ape)\b/.test(lower)) {
            return { templateKey: 'bestiary_puglin', scale: 0.74, taxonomy: 'Yeek / Creature' };
        }

        // 34. Hobgoblins, Orcs, Uruks & Goblins
        if (/\b(hobgoblin|bugbear|uruk)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_hobgoblin',
                scale: 1.05,
                _seedWeapons: ['item_greatclub', 'ph_mace', 'ph_axe', 'item_morningstar', 'item_spear', 'item_longsword'],
                _seedShields: ['item_shield_wooden', 'item_shield_leather', 'item_shield_metal', null],
                taxonomy: 'Hobgoblin / Uruk'
            };
        }
        if (/\b(orc|snaga)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_orc',
                scale: 1.0,
                _seedWeapons: ['item_goblin_sword', 'ph_saber', 'ph_axe', 'item_spear', 'item_morningstar', 'ph_mace'],
                _seedShields: ['item_shield_wooden', 'item_shield_leather', 'item_shield_metal', null],
                taxonomy: 'Orc'
            };
        }
        if (/\b(goblin|nibelung|gnome|leprechaun|spriggan)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_goblin',
                scale: 0.85,
                _seedWeapons: /gnome/i.test(lower) ? ['item_pickaxe', 'ph_hammer', 'ph_dagger'] : ['ph_dagger', 'ph_hatchet', 'item_goblin_sword', 'item_spear'],
                _seedShields: ['item_shield_wicker', null],
                taxonomy: /gnome/i.test(lower) ? 'Gnome' : 'Goblin'
            };
        }

        // 35. Gnolls
        if (/\b(gnoll|flind)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_gnoll',
                scale: 1.02,
                _seedWeapons: ['ph_axe', 'item_morningstar', 'item_spear', 'item_greatclub'],
                _seedShields: ['item_shield_leather', 'item_shield_wooden', null],
                taxonomy: 'Gnoll'
            };
        }

        // 36. Lizardfolk & Draconians
        if (/\b(lizardfolk|lizardman|saurian|draconian|troglodyte|skink)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_lizardfolk',
                scale: 1.05,
                _seedWeapons: ['item_spear', 'ph_hatchet', 'item_greatclub', 'ph_saber'],
                _seedShields: ['item_shield_wicker', 'item_shield_wooden', null],
                taxonomy: 'Lizardfolk / Draconian'
            };
        }

        // 37. Trolls, Ogres, Yetis, Giants, Cyclopes & Minotaurs
        if (/\b(yeti|sasquatch|abominable|wendigo|snow beast)\b/.test(lower)) {
            return { templateKey: 'bestiary_yeti', scale: 1.22, taxonomy: 'Yeti / Beast' };
        }
        if (/\b(cyclops|giant|titan|ettin|jotun|goliath|colossus)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_cyclops',
                scale: 1.38,
                _seedWeapons: ['ph_sledgehammer', 'item_greatclub', 'ph_axe', 'item_greatsword'],
                taxonomy: 'Giant / Cyclops'
            };
        }
        if (/\b(ogre|oni)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_ogre',
                scale: 1.25,
                _seedWeapons: ['item_greatclub', 'item_morningstar', 'ph_sledgehammer', 'ph_axe'],
                taxonomy: 'Ogre'
            };
        }
        if (/\b(troll|olog|half-troll)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_troll',
                scale: 1.28,
                _seedWeapons: ['item_greatclub', 'ph_sledgehammer', 'ph_axe', 'item_morningstar'],
                taxonomy: 'Troll'
            };
        }
        if (/\b(minotaur|chimera|manticore|gorgon|guardian)\b/.test(lower)) {
            return {
                templateKey: 'bestiary_guardian',
                scale: 1.26,
                weaponKey: 'ph_axe',
                taxonomy: 'Hybrid / Guardian'
            };
        }

        // 38. Dwarves, Elves, Halflings & Humanoid Classes/Townsfolk
        if (/\b(dwarf|dwarven|dwarvish|duergar|naugrim)\b/.test(lower)) {
            return {
                templateKey: 'char_male_ranger',
                scaleY: 0.78,
                scaleXZ: 1.12,
                _seedWeapons: ['ph_axe', 'ph_hammer', 'ph_sledgehammer', 'item_pickaxe'],
                _seedShields: ['ph_shield', 'item_shield_metal', 'item_shield_wooden'],
                taxonomy: 'Humanoid / Dwarf'
            };
        }
        if (/\b(elf|elven|elvish|drow|dark elf|deep elf|wood elf|high elf|glamhoth|nandor|sindar|noldor)\b/.test(lower)) {
            return {
                templateKey: 'char_male_ranger',
                scaleY: 1.06,
                scaleXZ: 0.92,
                _seedWeapons: ['item_bow', 'ph_saber', 'item_longsword', 'item_spear'],
                taxonomy: 'Humanoid / Elf'
            };
        }
        if (/\b(hobbit|halfling)\b/.test(lower)) {
            return {
                templateKey: 'char_male_rogue',
                scaleY: 0.72,
                scaleXZ: 0.90,
                weaponKey: 'ph_dagger',
                taxonomy: 'Humanoid / Halfling'
            };
        }
        if (/\b(samurai|ronin|kensei|ninja|shinobi|yakuza)\b/.test(lower)) {
            return {
                templateKey: 'char_male_ranger',
                scale: 1.02,
                weaponKey: 'ph_katana',
                taxonomy: 'Human / Samurai'
            };
        }
        if (/\b(guard|soldier|veteran|mercenary|watchman|sentry|sergeant|lieutenant|captain|man-at-arms|kop)\b/.test(lower)) {
            const isVeteran = /\bveteran\b/.test(lower);
            return {
                templateKey: 'char_male_guard',
                scale: 1.02,
                weaponKey: isVeteran ? 'item_longsword' : null,
                _seedWeapons: isVeteran ? null : ['item_longsword', 'item_spear', 'ph_axe', 'ph_mace', 'ph_hammer'],
                _seedShields: ['ph_shield', 'item_shield_raven', 'item_shield_wooden', 'item_shield_metal'],
                taxonomy: 'Human / Guard'
            };
        }
        if (/\b(paladin|knight|crusader|templar|champion|cavalier|defender|justiciar|lord|prince|king|warlord|berserker|barbarian|gladiator|weaponmaster)\b/.test(lower)) {
            const is2H = /\b(berserker|barbarian|warlord|weaponmaster)\b/.test(lower);
            return {
                templateKey: 'char_male_guard',
                scale: 1.04,
                _seedWeapons: is2H ? ['item_greatsword', 'ph_sledgehammer', 'ph_axe'] : ['item_longsword', 'ph_hammer', 'ph_mace', 'item_rune_blade'],
                _seedShields: is2H ? [null] : ['item_shield_raven', 'item_shield_metal', 'ph_shield'],
                taxonomy: 'Human / Warrior'
            };
        }
        if (/\b(rogue|thief|cutpurse|brigand|bandit|highwayman|assassin|mugger|outlaw|pirate|buccaneer|corsair|smuggler|prowler|stalker|pickpocket|burglar|filcher|footpad|ruffian|Vampire)\b/i.test(lower)) {
            const isSquint = /squint-eyed/i.test(lower);
            return {
                templateKey: 'char_male_rogue',
                scale: 0.98,
                weaponKey: isSquint ? 'ph_dagger' : null,
                _seedWeapons: isSquint ? null : ['ph_dagger', 'ph_saber', 'ph_estoc', 'item_goblin_sword'],
                taxonomy: 'Human / Rogue'
            };
        }
        if (/\b(priest|cleric|monk|abbot|friar|acolyte|prophet|zealot|inquisitor|bishop|druid|shaman|healer|mage|wizard|sorcerer|necromancer|archmage|conjurer|illusionist|enchanter|warlock|summoner|alchemist|magician|scholar|sage|cultist|mind flayer)\b/.test(lower)) {
            const isArcane = /\b(mage|wizard|sorcerer|necromancer|archmage|conjurer|illusionist|enchanter|warlock|summoner|alchemist|magician|scholar|sage|cultist|mind flayer)\b/.test(lower);
            return {
                templateKey: 'char_male_priest',
                scale: 0.98,
                _seedWeapons: isArcane ? ['item_staff', 'item_wand', 'item_rod', 'ph_dagger'] : ['ph_mace', 'ph_hammer', 'item_morningstar', 'item_staff'],
                taxonomy: isArcane ? 'Human / Mage' : 'Human / Cleric'
            };
        }
        if (/\b(ranger|archer|bowman|marksman|hunter|huntsman|tracker|scout|forester|warden|woodsman|dar)\b/.test(lower)) {
            return {
                templateKey: 'char_male_ranger',
                scale: 1.0,
                _seedWeapons: ['item_bow', 'item_spear', 'ph_saber', 'ph_hatchet'],
                taxonomy: 'Human / Ranger'
            };
        }
        if (/\b(shopkeeper|merchant|trader|peddler|innkeeper|barkeep|steward|mayor|banker|bailiff|noble|aristocrat|courtier)\b/.test(lower)) {
            return {
                templateKey: 'char_male_peasant',
                scale: 1.0,
                taxonomy: 'Human / Merchant'
            };
        }
        if (/\b(woman|maiden|lady|matron|barmaid|witch|hag|crone|enchantress|sorceress|priestess|gypsy|milkmaid|lass|girl|sister|queen|princess|duchess|nymph|oracle|nurse)\b/.test(lower)) {
            return {
                templateKey: 'char_female_peasant',
                gender: 'female',
                scale: 0.98,
                _tunicPalette: ['#7a684d', '#4d5d6b', '#5a6b4c', '#6e4f47', '#63566e'],
                taxonomy: 'Human / Townsperson'
            };
        }
        if (/\b(peasant|villager|townsman|townsperson|citizen|commoner|farmer|laborer|miner|beggar|drunk|idiot|urchin|vagrant|leper|madman|lunatic|fool|jester|minstrel|bard|sailor|fencer|novice|initiate|apprentice|squint-eyed|mean-looking|scruffy|singing|blubbering|mangy|pitiful|battle-scarred|boil-covered|filthy)\b/.test(lower)) {
            const isBearded = /\b(farmer|miner|beggar|drunk|battle-scarred|elder|old|veteran|sailor)\b/.test(lower);
            const isHunched = /\b(leper|idiot|beggar|mangy|blubbering|pitiful|boil-covered)\b/.test(lower);
            const isUnarmed = /\b(idiot|leper|beggar|urchin|blubbering)\b/.test(lower);
            return {
                templateKey: isBearded ? 'char_male_peasant_bearded' : 'char_male_peasant',
                scale: 0.98,
                hunched: isHunched,
                weaponKey: null,
                _seedWeapons: isUnarmed ? null : ['item_staff_branch', 'ph_dagger', 'item_shovel', null],
                _tunicPalette: ['#7a684d', '#4d5d6b', '#5a6b4c', '#6e4f47', '#63566e'],
                taxonomy: 'Townsperson'
            };
        }

        return null;
    }

    // ---------------------------------------------------------------------------
    // 6. Master Bestiary Resolution Engine
    // ---------------------------------------------------------------------------
    function resolve(m, glyph, realm, colorHexOverride) {
        const normRealm = normalizeRealm(realm || (m && m.realm));
        const rawName = String((m && (m.race || m.name)) || '').trim();
        const g = (glyph || (m && m.glyph) || '?').trim() || '?';
        const attr = m && m.attr !== undefined ? m.attr : '';
        const colorHex = colorHexOverride || resolveColorHex(attr);

        // Tier 0: LRU Cache Lookup
        const sig = `${normRealm}|${rawName}|${g}|${attr}`;
        const seed = computeSeed(m);
        const cached = cacheGet(sig);
        if (cached) {
            return applyInstanceSeed(cached, seed);
        }

        let baseCfg = null;
        let sourceTier = 3;
        const cleanName = cleanMonsterName(rawName);
        const lower = cleanName.toLowerCase();

        // Tier 1: Pluggable Realm Manifest Overrides & Semantic Bridge Hints
        if (m && m.family) {
            const famMatch = matchUniversalSpecies(String(m.family).toLowerCase());
            if (famMatch) {
                baseCfg = Object.assign({}, famMatch);
                sourceTier = 1;
            }
        }

        if (!baseCfg && REALM_MANIFESTS[normRealm]) {
            const manifest = REALM_MANIFESTS[normRealm];
            if (manifest.exact && manifest.exact[lower]) {
                baseCfg = Object.assign({}, manifest.exact[lower]);
                sourceTier = 1;
            } else if (manifest.patterns) {
                const patterns = manifest.patterns;
                for (let i = 0; i < patterns.length; i++) {
                    if (patterns[i].regex.test(cleanName)) {
                        baseCfg = Object.assign({}, patterns[i].config);
                        sourceTier = 1;
                        break;
                    }
                }
            }
        }

        // Tier 2: Universal Morphological Species & Head-Noun Matcher
        if (!baseCfg && cleanName.length > 0) {
            const match = matchUniversalSpecies(lower);
            if (match) {
                baseCfg = Object.assign({}, match);
                sourceTier = 2;

                // Apply automatic modifier scaling
                if (/\b(pup|little|small|young|baby|mini|tiny|scrawny|hatchling|cub)\b/.test(lower)) {
                    baseCfg.scale = Math.max(0.45, (baseCfg.scale || 1.0) * 0.80);
                } else if (/\b(ancient|titan|emperor|dragon lord|great wyrm)\b/.test(lower)) {
                    baseCfg.scale = (baseCfg.scale || 1.0) * 1.32;
                } else if (/\b(large|giant|great|dire|elder|master|king|lord|queen|alpha|chieftain|captain)\b/.test(lower)) {
                    baseCfg.scale = (baseCfg.scale || 1.0) * 1.18;
                }

                // Apply elemental emissive modulation if not already set
                if (!baseCfg.emissiveHex) {
                    if (/\b(fire|flame|flaming|hell|lava|magma|inferno|burning|incandescent|plasma|red|solar)\b/.test(lower) && /\b(hound|wolf|vortex|elemental|sphere|eye|dragon|drake|wyrm|golem|demon|spirit)\b/.test(lower)) {
                        baseCfg.emissiveHex = '#ff4500';
                    } else if (/\b(cold|frost|freezing|ice|winter|blizzard|arctic|white)\b/.test(lower) && /\b(hound|wolf|vortex|elemental|sphere|eye|dragon|drake|wyrm)\b/.test(lower)) {
                        baseCfg.emissiveHex = '#38bdf8';
                    } else if (/\b(energy|lightning|shocking|thunder|spark|storm|electric|blue)\b/.test(lower) && /\b(hound|wolf|vortex|elemental|sphere|eye|dragon|drake|wyrm)\b/.test(lower)) {
                        baseCfg.emissiveHex = '#fde047';
                    } else if (/\b(acid|venom|poison|toxic|green)\b/.test(lower) && /\b(hound|wolf|vortex|elemental|sphere|eye|dragon|drake|wyrm|ooze|blob|jelly)\b/.test(lower)) {
                        baseCfg.emissiveHex = '#a3e635';
                    } else if (/\b(aether|chaos|nether|mana|time|tindalos|ethereal|nexus)\b/.test(lower)) {
                        baseCfg.emissiveHex = '#c084fc';
                    }
                }
            }
        }

        // Tier 3: Isolated Realm-Contextual ASCII Glyph Fallback
        if (!baseCfg) {
            const realmTable = REALM_GLYPH_TABLES[normRealm] || REALM_GLYPH_TABLES['angband'];
            if (realmTable && realmTable[g]) {
                baseCfg = Object.assign({}, realmTable[g]);
                sourceTier = 3;
            } else if (REALM_GLYPH_TABLES['angband'][g]) {
                baseCfg = Object.assign({}, REALM_GLYPH_TABLES['angband'][g]);
                sourceTier = 3;
            } else {
                baseCfg = {
                    templateKey: 'bestiary_horror',
                    scale: 1.0,
                    taxonomy: 'Dungeon Creature'
                };
                sourceTier = 3;
            }
        }

        // CRITICAL VISUAL FIDELITY INVARIANT:
        // Only apply ASCII colorHex tinting to chromatic/elemental species (Dragons, Oozes, Jellies, Molds, Vortices, Elemental Hounds)
        // where `useAsciiTint: true` is set! Natural creatures (Wolves, Dogs, Foxes, Bears, Lions, Horses, Birds, Spiders, Humans, Undead, Orcs)
        // keep `tintHex: null` so their multi-material / PBR textures render with 100% authentic Skyrim-grade fidelity!
        if (baseCfg.useAsciiTint && !baseCfg.tintHex && colorHex) {
            baseCfg.tintHex = colorHex;
        } else if (!baseCfg.tintHex) {
            baseCfg.tintHex = null;
        }

        baseCfg.sourceTier = sourceTier;
        baseCfg.realm = normRealm;
        baseCfg.glyph = g;

        cacheSet(sig, Object.assign({}, baseCfg));
        return applyInstanceSeed(baseCfg, seed);
    }

    // ---------------------------------------------------------------------------
    // 7. Unified Inspection Taxonomy Helper
    // ---------------------------------------------------------------------------
    function resolveInspectionTaxonomy(m, realm) {
        if (!m) {
            return {
                coreType: 'Unknown',
                alignment: 'Neutral',
                typeLabel: 'Unknown',
                alignmentLabel: 'Neutral',
                isBoss: false,
                templateKey: 'bestiary_horror'
            };
        }

        const r = normalizeRealm(realm || m.realm);
        const resolved = resolve(m, m.glyph, r, m.attr);
        const rawName = cleanMonsterName(m.name || m.race || '');
        const lower = rawName.toLowerCase();
        const g = (m.glyph || '?').charAt(0);

        const isPet = Boolean(
            m.isPet || m.pet || m.friendly ||
            /\((?:tame|pet|friendly|companion)\)/i.test(m.name || '') ||
            (r === 'nethack' && /\b(little dog|small dog|large dog|dog|puppy|kitten|housecat|large cat|pony|horse|warhorse)\b/i.test(lower) && m.hostile !== true && m.is_hostile !== true)
        );

        const isTownNpc = (m.depth === 0 && r !== 'silq' && !m.hostile && !m.is_hostile && (g === 't' || /towns|citizen|urchin|mercenary|drunk|idiot|beggar|mayor|agent|shopkeeper|villager|peasant|sailor|veteran|tamer|bard|farmer maggot|woodsman|hobo/i.test(lower)));

        const isPeacefulNpc = Boolean(
            !isPet && (
                isTownNpc || m.peaceful || m.isPeaceful ||
                m.hostile === false || m.is_hostile === false ||
                /\((?:peaceful|unhostile|ally)\)/i.test(m.name || '') ||
                /\b(shopkeeper|izchak|aligned priest|temple priest|high priest|oracle|watchman|watch captain|guard)\b/i.test(lower)
            )
        );

        let alignmentLabel = resolved.alignment || 'Neutral';
        if (isPet) {
            alignmentLabel = 'Loyal Companion';
        } else if (isTownNpc) {
            alignmentLabel = 'Neutral (Town)';
        } else if (isPeacefulNpc) {
            alignmentLabel = 'Peaceful / Co-Aligned';
        } else if (!resolved.alignment) {
            if (/angel|archon|seraph|cherub|unicorn|valkyrie|ki-rin/i.test(lower)) {
                alignmentLabel = 'Good';
            } else if (/undead|skeleton|zombie|mummy|wraith|vampire|lich|ghost|demon|balrog|rauko|orc|troll|ogre|goblin|kobold|uruk|thief|bandit|brigand|cultist|dragon|wyrm/i.test(lower)) {
                alignmentLabel = 'Evil';
            } else {
                alignmentLabel = 'Neutral';
            }
        }

        const typeLabel = resolved.taxonomy || 'Dungeon Creature';
        const isBoss = Boolean(resolved.isBoss || m.unique || m.isBoss || /morgoth|sauron|ungoliant|gothmog|carcharoth|yendor|serpent of chaos|cyberdemon|cthulhu|orochi|shuten|vlad the impaler|medusa|croesus/i.test(rawName));

        return {
            coreType: typeLabel,
            alignment: alignmentLabel,
            typeLabel,
            alignmentLabel,
            isBoss,
            templateKey: resolved.templateKey
        };
    }

    // # ROOT-CAUSE: Export both window.MASTER_BESTIARY and window.MasterBestiary and provide describeVisualAnatomy(m, glyph, realm) so Chronicle & Tome Sketch prompts get exact 3D model anatomy descriptions.
    function describeVisualAnatomy(m, glyph, realm) {
        const res = resolve(m, glyph, realm);
        const tk = (res && res.templateKey) || '';
        const tax = (res && res.taxonomy) || 'Dungeon Creature';
        const name = cleanMonsterName((m && (m.name || m.race)) || '').toLowerCase();
        if (/\b(little dog|small dog|large dog|dog|puppy|hound)\b/i.test(name) || tk === 'bestiary_husky') {
            return 'alert white-and-charcoal terrier/husky hound with pointed ears, curled tail, and four paws';
        }
        if (/\b(kitten|cat|housecat|large cat)\b/i.test(name)) {
            return 'sleek, agile feline cat with luminous eyes, whiskers, and upright tail';
        }
        if (/\b(pony|horse|warhorse)\b/i.test(name) || tk === 'bestiary_horse') {
            return 'sturdy, muscular equine steed with flowing mane and shod hooves';
        }
        if (/floating eye|eye/i.test(name) || tk === 'bestiary_eye') {
            return 'levitating disembodied spherical eyeball with a single hypnotic glowing iris';
        }
        if (/grid bug/i.test(name)) {
            return 'crackling neon-violet geometric grid-lined bug with glowing electric carapace';
        }
        if (/cockatrice|chickatrice|pyrolisk/i.test(name) || tk === 'bestiary_flamingo') {
            return 'serpent-tailed, bat-winged scaled cockatrice rooster with a petrifying gaze';
        }
        if (/rust monster|aquator/i.test(name)) {
            return 'armadillo-shelled chitinous rust monster with two long feathery metal-sensing antennae and a propeller-tipped tail';
        }
        if (/mimic|xeroc/i.test(name)) {
            return 'tooth-lined shapeshifting mimic chest with pseudopods and glowing eyes';
        }
        if (tk === 'env_ooze_mound' || /jelly|ooze|slime|blob|pudding/i.test(name)) {
            return 'translucent, bubbling gelatinous ooze mound glistening on the stone floor';
        }
        if (tk === 'env_fungi_cluster' || /mold|mushroom|fungus|shrieker|spore/i.test(name)) {
            return 'bioluminescent subterranean fungal mushroom cluster sprouting from damp stone';
        }
        if (tk === 'bestiary_dragon') {
            return 'towering winged, horned wyrm with armoured scales and smoldering jaws';
        }
        return `${tax} (${tk.replace(/^(bestiary_|char_|obj_|env_|ph_)/, '').replace(/_/g, ' ')})`;
    }

    // ---------------------------------------------------------------------------
    // 8. Public API & Universal Module Export
    // ---------------------------------------------------------------------------
    const MASTER_BESTIARY = {
        resolve,
        resolveInspectionTaxonomy,
        describeVisualAnatomy,
        registerRealm,
        cleanMonsterName,
        normalizeRealm,
        computeSeed,
        resolveColorHex,
        REALM_MANIFESTS,
        REALM_GLYPH_TABLES,
        _cache
    };

    if (typeof root !== 'undefined') {
        root.MASTER_BESTIARY = MASTER_BESTIARY;
        root.MasterBestiary = MASTER_BESTIARY;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MASTER_BESTIARY;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));

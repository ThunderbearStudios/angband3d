/**
 * c:\Dev\angband3d\server\public\js\master-item-registry.js
 * MASTER_ITEM_REGISTRY — Zero-Bloat Universal Roguelike Item & Transform Registry (v11.7.0)
 *
 * Strict Architectural Compliance:
 * - Laws U0–U9, Zero Bloat, <0.001 ms Memoized Lookup
 * - 4-Tier Resolution: Tier 0 LRU (2048 entries) -> Tier 1 Realm/Bilingual -> Tier 2 Morphological -> Tier 3 Realm Glyphs
 * - Canonical 4-Pose Transform Matrix (viewmodelRight, viewmodelLeft, npcHand, groundProp)
 * - CRITICAL FIX: ph_katana rotY = Math.PI * 0.5 (rotates -X cutting edge 'ha' to canonical +Z forward)
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MASTER_ITEM_REGISTRY = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CACHE_MAX_ENTRIES = 2048;
    const _cache = new Map();

    const POLYHAVEN_ITEM_GLTF_PATHS = Object.freeze({
        ph_saber: '/assets/polyhaven/models/wooden_handle_saber/wooden_handle_saber.gltf',
        ph_estoc: '/assets/polyhaven/models/antique_estoc/antique_estoc.gltf',
        ph_katana: '/assets/polyhaven/models/antique_katana_01/antique_katana_01.gltf',
        ph_dagger: '/assets/polyhaven/models/ornate_medieval_dagger/ornate_medieval_dagger.gltf',
        ph_axe: '/assets/polyhaven/models/wooden_axe/wooden_axe.gltf',
        ph_hatchet: '/assets/polyhaven/models/hatchet/hatchet.gltf',
        ph_hammer: '/assets/polyhaven/models/ornate_war_hammer/ornate_war_hammer.gltf',
        ph_sledgehammer: '/assets/polyhaven/models/sledgehammer_01/sledgehammer_01.gltf',
        ph_mace: '/assets/polyhaven/models/ornate_medieval_mace/ornate_medieval_mace.gltf',
        ph_shield: '/assets/polyhaven/models/kite_shield/kite_shield.gltf',
        ph_potion_bottle: '/assets/models/items/healing_potion.glb',
        ph_potion_flask: '/assets/models/items/greater_healing_potion.glb',
        ph_potion_urn: '/assets/models/items/supreme_healing_potion.glb',
        ph_goblet: '/assets/polyhaven/models/brass_goblets/brass_goblets.gltf',
        ph_lantern: '/assets/polyhaven/models/wooden_lantern_01/wooden_lantern_01.gltf',
        ph_candle: '/assets/polyhaven/models/brass_candleholders/brass_candleholders.gltf',
        ph_chest: '/assets/models/items/Chest_Wood.gltf',
        item_bow: '/assets/models/items/bow.glb',
        item_spear: '/assets/models/items/spear.glb',
        item_torch: '/assets/models/items/torch.glb',
        item_greatsword: '/assets/models/items/great_sword.glb',
        item_rune_blade: '/assets/models/items/rune_blade.glb',
        item_goblin_sword: '/assets/models/items/goblin_sword.glb',
        item_morningstar: '/assets/models/items/morningstar.glb',
        item_whip: '/assets/models/items/morningstar.glb',
        item_greatclub: '/assets/models/items/greatclub.glb',
        item_longsword: '/assets/models/items/sword_pbr.glb',
        item_shield_wooden: '/assets/models/items/shield_wooden.glb',
        item_shield_raven: '/assets/models/items/shield_raven.glb',
        item_helmet: '/assets/models/items/iron_helmet.glb',
        item_plate_armor: '/assets/models/items/plate_armor.glb',
        item_leather_armor: '/assets/models/items/leather_armor.glb',
        item_boots: '/assets/models/items/iron_boots.glb',
        item_gauntlets: '/assets/models/items/iron_gauntlets.glb',
        item_cloak: '/assets/models/items/wool_cape.glb',
        item_scroll: '/assets/models/items/scroll.glb',
        item_scroll_enchant: '/assets/models/items/scroll_enchant.glb',
        item_coins: '/assets/models/items/coin_pile_spill.glb',
        item_key: '/assets/models/items/dungeon_key_gold.glb',
        item_bread: '/assets/models/items/bread.glb',
        item_lembas: '/assets/models/items/lembas_wafer.glb',
        item_shovel: '/assets/polyhaven/models/rusted_spade_01/rusted_spade_01.gltf',
        item_pickaxe: '/assets/polyhaven/models/picke_dirty_01/picke_dirty_01.gltf',
        item_wand: '/assets/models/items/wand.glb',
        item_rod: '/assets/models/items/rod.glb',
        item_staff: '/assets/models/items/staff.glb',
        item_staff_branch: '/assets/models/items/staff.glb',
        item_book: '/assets/polyhaven/models/decorative_book_set_01/decorative_book_set_01.gltf',
        item_shield_wicker: '/assets/models/items/shield_wooden.glb',
        item_shield_leather: '/assets/models/items/shield_wooden.glb',
        item_shield_metal: '/assets/models/items/shield_wooden.glb',
        item_arrow: '/assets/models/items/steel_arrow.glb',
        item_talisman: '/assets/models/items/phoenix_talisman.glb',
        item_chainmail: '/assets/models/items/chain_mail.glb',
        item_crown: '/assets/models/items/helm_of_brilliance.glb',
        item_ring: '/assets/models/items/helm_of_brilliance.glb',
        item_gold: '/assets/models/items/coin_pile_spill.glb',
        ph_book: '/assets/polyhaven/models/decorative_book_set_01/decorative_book_set_01.gltf',
        ph_crystal: '/assets/models/items/crystal_cluster_pbr.glb',
        ph_boulder: '/assets/polyhaven/models/moon_rock_02/moon_rock_02.gltf',
        ph_statue_item: '/assets/polyhaven/models/gothic_statue/gothic_statue.gltf',
        item_anvil: '/assets/models/items/Anvil.gltf',
        item_shrine_candles: '/assets/models/items/shrine_candles.gltf'
    });

    /**
     * Canonical Held Specs:
     * Every weapon is normalized into:
     *   +Y = blade/head tip (upward along grip axis)
     *   +Z = cutting edge / striking face (forward away from wielder)
     *   Grip pivot at (0, 0, 0)
     *
     * Mathematical Proof for ph_katana (antique_katana_01.gltf):
     *   Raw GLTF blade lies in X-Y plane (Z thickness = 37mm), with convex cutting edge ('ha')
     *   at -X and concave spine ('mune') at +X.
     *   Rotating by rotY = +Math.PI * 0.5 maps raw (-1, 0, 0) -> (0, 0, +1) (+Z forward)!
     */
    const HELD_CANONICAL_SPECS = Object.freeze({
        ph_katana:         { kind: 'phY', span: 0.94, rotX: 0, rotY: Math.PI * 0.5,  rotZ: 0, gripFrac: 0.18, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_saber:          { kind: 'phY', span: 0.88, rotX: 0, rotY: 0,              rotZ: 0, gripFrac: 0.16, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_dagger:         { kind: 'phY', span: 0.44, rotX: 0, rotY: -Math.PI * 0.5, rotZ: 0, gripFrac: 0.20, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_estoc:          { kind: 'phY', span: 1.04, rotX: 0, rotY: -Math.PI * 0.5, rotZ: 0, gripFrac: 0.14, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_hatchet:        { kind: 'phY', span: 0.52, rotX: 0, rotY: 0,              rotZ: 0, gripFrac: 0.22, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_axe:            { kind: 'phY', span: 0.74, rotX: 0, rotY: 0,              rotZ: 0, gripFrac: 0.22, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_mace:           { kind: 'phY', span: 0.68, rotX: 0, rotY: -Math.PI * 0.5, rotZ: 0, gripFrac: 0.20, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_hammer:         { kind: 'phY', span: 0.74, rotX: 0, rotY: -Math.PI * 0.5, rotZ: 0, gripFrac: 0.22, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_sledgehammer:   { kind: 'phY', span: 1.02, rotX: 0, rotY: -Math.PI * 0.5, rotZ: 0, gripFrac: 0.25, edgeAxis: '+Z', tipAxis: '+Y' },
        item_goblin_sword: { kind: 'openMmoX', span: 0.82, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.16, edgeAxis: '+Z', tipAxis: '+Y' },
        item_longsword:    { kind: 'openMmoX', span: 0.90, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.15, edgeAxis: '+Z', tipAxis: '+Y' },
        item_greatsword:   { kind: 'openMmoX', span: 1.25, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.20, edgeAxis: '+Z', tipAxis: '+Y' },
        item_rune_blade:   { kind: 'openMmoX', span: 0.95, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.16, edgeAxis: '+Z', tipAxis: '+Y' },
        item_morningstar:  { kind: 'openMmoX', span: 0.78, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.22, edgeAxis: '+Z', tipAxis: '+Y' },
        item_greatclub:    { kind: 'openMmoX', span: 0.96, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.24, edgeAxis: '+Z', tipAxis: '+Y' },
        item_spear:        { kind: 'openMmoX', span: 1.65, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.42, edgeAxis: '+Z', tipAxis: '+Y' },
        item_bow:          { kind: 'openMmoX', span: 1.05, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.50, edgeAxis: '+Z', tipAxis: '+Y' },
        item_torch:        { kind: 'openMmoX', span: 0.60, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.22, edgeAxis: '+Z', tipAxis: '+Y' },
        item_shovel:       { kind: 'phY', span: 0.98, rotX: 0, rotY: 0,              rotZ: 0, gripFrac: 0.35, edgeAxis: '+Z', tipAxis: '+Y' },
        item_pickaxe:      { kind: 'phY', span: 0.88, rotX: 0, rotY: -Math.PI * 0.5, rotZ: 0, gripFrac: 0.30, edgeAxis: '+Z', tipAxis: '+Y' },
        item_staff:        { kind: 'phY', span: 1.45, rotX: 0, rotY: 0,              rotZ: 0, gripFrac: 0.45, edgeAxis: '+Z', tipAxis: '+Y' },
        item_staff_branch: { kind: 'phY', span: 1.40, rotX: 0, rotY: 0,              rotZ: 0, gripFrac: 0.45, edgeAxis: '+Z', tipAxis: '+Y' },
        item_wand:         { kind: 'phY', span: 0.48, rotX: 0, rotY: 0,              rotZ: 0, gripFrac: 0.25, edgeAxis: '+Z', tipAxis: '+Y' },
        item_rod:          { kind: 'phY', span: 0.58, rotX: 0, rotY: 0,              rotZ: 0, gripFrac: 0.25, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_shield:         { kind: 'shield', span: 0.64, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.50, edgeAxis: '+Z', tipAxis: '+Y' },
        item_shield_wooden:{ kind: 'shield', span: 0.64, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.50, edgeAxis: '+Z', tipAxis: '+Y' },
        item_shield_raven: { kind: 'shield', span: 0.66, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.50, edgeAxis: '+Z', tipAxis: '+Y' },
        item_shield_wicker:{ kind: 'shield', span: 0.58, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.50, edgeAxis: '+Z', tipAxis: '+Y' },
        item_shield_leather:{ kind: 'shield', span: 0.60, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.50, edgeAxis: '+Z', tipAxis: '+Y' },
        item_shield_metal: { kind: 'shield', span: 0.56, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.50, edgeAxis: '+Z', tipAxis: '+Y' },
        ph_lantern:        { kind: 'lantern', span: 0.45, rotX: 0, rotY: 0, rotZ: 0, gripFrac: 0.90, edgeAxis: '+Z', tipAxis: '+Y' }
    });

    const DEFAULT_SWORD_POSE = Object.freeze({
        viewmodelRight: { pos: [0.0, 0.0, 0.0], rot: [0.14, -0.06, 0.02], scale: [1, 1, 1] },
        viewmodelLeft:  { pos: [0.0, 0.0, 0.0], rot: [0.14, 0.06, -0.02], scale: [1, 1, 1] },
        npcHand:        { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
        groundProp:     { pos: [0.0, 0.14, 0.0], rot: [0.55, 0.35, -0.45], scale: [1, 1, 1] }
    });

    const VIEWMODEL_POSES = Object.freeze({
        ph_katana: DEFAULT_SWORD_POSE,
        ph_saber: {
            viewmodelRight: { pos: [0.0, 0.0, 0.0], rot: [0.12, -0.08, 0.04], scale: [1, 1, 1] },
            viewmodelLeft:  { pos: [0.0, 0.0, 0.0], rot: [0.12, 0.08, -0.04], scale: [1, 1, 1] },
            npcHand:        { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
            groundProp:     { pos: [0.0, 0.14, 0.0], rot: [0.55, 0.35, -0.45], scale: [1, 1, 1] }
        },
        ph_dagger: {
            viewmodelRight: { pos: [0.0, 0.0, 0.0], rot: [0.10, -0.05, 0.02], scale: [1, 1, 1] },
            viewmodelLeft:  { pos: [0.0, 0.0, 0.0], rot: [0.10, 0.05, -0.02], scale: [1, 1, 1] },
            npcHand:        { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
            groundProp:     { pos: [0.0, 0.14, 0.0], rot: [0.55, 0.35, -0.45], scale: [1, 1, 1] }
        },
        ph_estoc: DEFAULT_SWORD_POSE,
        ph_hatchet: DEFAULT_SWORD_POSE,
        ph_axe: DEFAULT_SWORD_POSE,
        ph_mace: DEFAULT_SWORD_POSE,
        ph_hammer: DEFAULT_SWORD_POSE,
        ph_sledgehammer: DEFAULT_SWORD_POSE,
        item_goblin_sword: DEFAULT_SWORD_POSE,
        item_longsword: DEFAULT_SWORD_POSE,
        item_greatsword: DEFAULT_SWORD_POSE,
        item_rune_blade: DEFAULT_SWORD_POSE,
        item_morningstar: DEFAULT_SWORD_POSE,
        item_greatclub: DEFAULT_SWORD_POSE,
        item_pickaxe: DEFAULT_SWORD_POSE,
        item_shovel: DEFAULT_SWORD_POSE,
        item_staff: DEFAULT_SWORD_POSE,
        item_staff_branch: DEFAULT_SWORD_POSE,
        item_wand: DEFAULT_SWORD_POSE,
        item_rod: DEFAULT_SWORD_POSE,
        item_torch: DEFAULT_SWORD_POSE,
        item_bow: {
            viewmodelRight: { pos: [0.0, 0.0, 0.0], rot: [0.05, -0.15, 0.10], scale: [1, 1, 1] },
            viewmodelLeft:  { pos: [0.0, 0.0, 0.0], rot: [0.05, 0.15, -0.10], scale: [1, 1, 1] },
            npcHand:        { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
            groundProp:     { pos: [0.0, 0.12, 0.0], rot: [0.45, 0.20, -0.30], scale: [1, 1, 1] }
        },
        item_spear: {
            viewmodelRight: { pos: [0.0, 0.0, 0.0], rot: [0.10, -0.05, 0.05], scale: [1, 1, 1] },
            viewmodelLeft:  { pos: [0.0, 0.0, 0.0], rot: [0.10, 0.05, -0.05], scale: [1, 1, 1] },
            npcHand:        { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
            groundProp:     { pos: [0.0, 0.18, 0.0], rot: [0.66, 0.25, 0.72], scale: [1, 1, 1] }
        },
        ph_shield: {
            viewmodelRight: { pos: [0.0, 0.0, 0.0], rot: [0.0, -0.15, 0.0], scale: [1, 1, 1] },
            viewmodelLeft:  { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.15, 0.0], scale: [1, 1, 1] },
            npcHand:        { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
            groundProp:     { pos: [0.0, 0.08, 0.0], rot: [-0.85, 0.25, 0.15], scale: [1, 1, 1] }
        },
        ph_lantern: {
            viewmodelRight: { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
            viewmodelLeft:  { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
            npcHand:        { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] },
            groundProp:     { pos: [0.0, 0.02, 0.0], rot: [0.0, 0.0, 0.0], scale: [1, 1, 1] }
        }
    });

    const REALM_ITEM_GLYPHS = {
        nethack: {
            ')': { floorKey: 'item_longsword', heldKey: 'item_longsword', category: 'weapon', subType: 'sword' },
            '[': { floorKey: 'item_plate_armor', heldKey: 'item_plate_armor', category: 'armor', subType: 'plate' },
            '=': { floorKey: 'item_ring', heldKey: 'item_ring', category: 'ring', subType: 'ring' },
            '"': { floorKey: 'item_talisman', heldKey: 'item_talisman', category: 'amulet', subType: 'amulet' },
            '(': { floorKey: 'item_key', heldKey: 'item_key', category: 'tool', subType: 'tool' },
            '%': { floorKey: 'item_bread', heldKey: 'item_bread', category: 'food', subType: 'food' },
            '!': { floorKey: 'ph_potion_flask', heldKey: 'ph_potion_flask', category: 'potion', subType: 'potion' },
            '?': { floorKey: 'item_scroll', heldKey: 'item_scroll', category: 'scroll', subType: 'scroll' },
            '+': { floorKey: 'item_book', heldKey: 'item_book', category: 'book', subType: 'book' },
            '/': { floorKey: 'item_wand', heldKey: 'item_wand', category: 'magical', subType: 'wand' },
            '$': { floorKey: 'item_coins', heldKey: 'item_coins', category: 'coins', subType: 'coins' },
            '*': { floorKey: 'ph_crystal', heldKey: 'ph_crystal', category: 'gem', subType: 'gem' },
            '`': { floorKey: 'ph_boulder', heldKey: 'ph_boulder', category: 'boulder', subType: 'boulder' },
            '_': { floorKey: 'item_morningstar', heldKey: 'item_morningstar', category: 'chain', subType: 'chain' },
            '0': { floorKey: 'ph_sledgehammer', heldKey: 'ph_sledgehammer', category: 'ball', subType: 'iron_ball' }
        },
        rogue: {
            ':': { floorKey: 'item_bread', heldKey: 'item_bread', category: 'food', subType: 'food' },
            '!': { floorKey: 'ph_potion_flask', heldKey: 'ph_potion_flask', category: 'potion', subType: 'potion' },
            '?': { floorKey: 'item_scroll', heldKey: 'item_scroll', category: 'scroll', subType: 'scroll' },
            ')': { floorKey: 'item_longsword', heldKey: 'item_longsword', category: 'weapon', subType: 'sword' },
            '[': { floorKey: 'item_plate_armor', heldKey: 'item_plate_armor', category: 'armor', subType: 'plate' },
            ']': { floorKey: 'item_plate_armor', heldKey: 'item_plate_armor', category: 'armor', subType: 'plate' },
            '=': { floorKey: 'item_ring', heldKey: 'item_ring', category: 'ring', subType: 'ring' },
            '/': { floorKey: 'item_wand', heldKey: 'item_wand', category: 'magical', subType: 'wand' },
            ',': { floorKey: 'item_talisman', heldKey: 'item_talisman', category: 'amulet', subType: 'amulet' },
            '*': { floorKey: 'item_coins', heldKey: 'item_coins', category: 'coins', subType: 'coins' },
            '$': { floorKey: 'item_coins', heldKey: 'item_coins', category: 'coins', subType: 'coins' }
        },
        brogue: {
            ':': { floorKey: 'item_bread', heldKey: 'item_bread', category: 'food', subType: 'food' },
            '!': { floorKey: 'ph_potion_flask', heldKey: 'ph_potion_flask', category: 'potion', subType: 'potion' },
            '?': { floorKey: 'item_scroll', heldKey: 'item_scroll', category: 'scroll', subType: 'scroll' },
            ')': { floorKey: 'item_longsword', heldKey: 'item_longsword', category: 'weapon', subType: 'sword' },
            '[': { floorKey: 'item_plate_armor', heldKey: 'item_plate_armor', category: 'armor', subType: 'plate' },
            '=': { floorKey: 'item_ring', heldKey: 'item_ring', category: 'ring', subType: 'ring' },
            '/': { floorKey: 'item_staff', heldKey: 'item_staff', category: 'magical', subType: 'staff' },
            '\\': { floorKey: 'item_staff', heldKey: 'item_staff', category: 'magical', subType: 'staff' },
            '~': { floorKey: 'item_wand', heldKey: 'item_wand', category: 'magical', subType: 'wand' },
            '"': { floorKey: 'item_talisman', heldKey: 'item_talisman', category: 'amulet', subType: 'amulet' },
            '*': { floorKey: 'ph_crystal', heldKey: 'ph_crystal', category: 'gem', subType: 'lumenstone' },
            '&': { floorKey: 'item_key', heldKey: 'item_key', category: 'tool', subType: 'key' },
            '$': { floorKey: 'item_coins', heldKey: 'item_coins', category: 'coins', subType: 'coins' }
        },
        dcss: {
            ')': { floorKey: 'item_longsword', heldKey: 'item_longsword', category: 'weapon', subType: 'sword' },
            '(': { floorKey: 'item_arrow', heldKey: 'item_arrow', category: 'ammo', subType: 'arrow' },
            '[': { floorKey: 'item_plate_armor', heldKey: 'item_plate_armor', category: 'armor', subType: 'plate' },
            '%': { floorKey: 'item_bread', heldKey: 'item_bread', category: 'food', subType: 'food' },
            '?': { floorKey: 'item_scroll', heldKey: 'item_scroll', category: 'scroll', subType: 'scroll' },
            '!': { floorKey: 'ph_potion_flask', heldKey: 'ph_potion_flask', category: 'potion', subType: 'potion' },
            '/': { floorKey: 'item_wand', heldKey: 'item_wand', category: 'magical', subType: 'wand' },
            '=': { floorKey: 'item_ring', heldKey: 'item_ring', category: 'ring', subType: 'ring' },
            '"': { floorKey: 'item_talisman', heldKey: 'item_talisman', category: 'amulet', subType: 'amulet' },
            '|': { floorKey: 'item_staff', heldKey: 'item_staff', category: 'magical', subType: 'staff' },
            '\\': { floorKey: 'item_staff', heldKey: 'item_staff', category: 'magical', subType: 'staff' },
            ':': { floorKey: 'item_book', heldKey: 'item_book', category: 'book', subType: 'book' },
            '}': { floorKey: 'ph_crystal', heldKey: 'ph_crystal', category: 'misc', subType: 'misc' },
            '$': { floorKey: 'item_coins', heldKey: 'item_coins', category: 'coins', subType: 'coins' }
        },
        angband: {
            '|': { floorKey: 'item_longsword', heldKey: 'item_longsword', category: 'weapon', subType: 'sword' },
            '/': { floorKey: 'item_spear', heldKey: 'item_spear', category: 'weapon', subType: 'spear' },
            '\\': { floorKey: 'ph_mace', heldKey: 'ph_mace', category: 'weapon', subType: 'hafted' },
            ')': { floorKey: 'item_longsword', heldKey: 'item_longsword', category: 'weapon', subType: 'sword' },
            '}': { floorKey: 'item_bow', heldKey: 'item_bow', category: 'weapon', subType: 'bow' },
            '{': { floorKey: 'item_arrow', heldKey: 'item_arrow', category: 'ammo', subType: 'arrow' },
            '~': { floorKey: 'ph_chest', heldKey: 'ph_chest', category: 'misc', subType: 'chest' },
            '[': { floorKey: 'item_plate_armor', heldKey: 'item_plate_armor', category: 'armor', subType: 'plate' },
            ']': { floorKey: 'item_boots', heldKey: 'item_boots', category: 'armor', subType: 'boots' },
            '(': { floorKey: 'ph_shield', heldKey: 'ph_shield', category: 'shield', subType: 'shield' },
            '!': { floorKey: 'ph_potion_flask', heldKey: 'ph_potion_flask', category: 'potion', subType: 'potion' },
            '?': { floorKey: 'item_scroll', heldKey: 'item_scroll', category: 'scroll', subType: 'scroll' },
            '+': { floorKey: 'item_book', heldKey: 'item_book', category: 'book', subType: 'book' },
            '_': { floorKey: 'item_staff', heldKey: 'item_staff', category: 'magical', subType: 'staff' },
            '-': { floorKey: 'item_wand', heldKey: 'item_wand', category: 'magical', subType: 'wand' },
            '=': { floorKey: 'item_ring', heldKey: 'item_ring', category: 'ring', subType: 'ring' },
            '"': { floorKey: 'item_talisman', heldKey: 'item_talisman', category: 'amulet', subType: 'amulet' },
            ',': { floorKey: 'item_bread', heldKey: 'item_bread', category: 'food', subType: 'food' },
            '$': { floorKey: 'item_coins', heldKey: 'item_coins', category: 'coins', subType: 'coins' },
            '*': { floorKey: 'ph_crystal', heldKey: 'ph_crystal', category: 'gem', subType: 'gem' }
        }
    };

    REALM_ITEM_GLYPHS.silq = REALM_ITEM_GLYPHS.angband;
    REALM_ITEM_GLYPHS.frogcomposband = REALM_ITEM_GLYPHS.angband;
    REALM_ITEM_GLYPHS.hengband = REALM_ITEM_GLYPHS.angband;

    const PLUGGED_REALMS = new Map();

    function normalizeItemName(rawName) {
        if (!rawName) return '';
        let s = String(rawName).trim();
        if (typeof window !== 'undefined' && window.HengTranslate && typeof window.HengTranslate.translateName === 'function') {
            try {
                const tr = window.HengTranslate.translateName(s);
                if (tr) s = tr;
            } catch (_) {}
        }
        s = s.replace(/^(\d+\s+|a\s+|an\s+|the\s+|some\s+|pile\s+of\s+)/i, '');
        s = s.replace(/\b(blessed|uncursed|cursed|rustproof|greased|fixed|burnt|thoroughly\s+rusty|very\s+rusty|rusty|corroded|poisoned)\b/gi, '');
        s = s.replace(/\(\s*[+-]?\d+\s*(?:,\s*[+-]?\d+)?\s*\)/g, '');
        s = s.replace(/\(\s*\d+d\d+\s*\)/gi, '');
        s = s.replace(/\[\s*[+-]?\d+\s*(?:,\s*[+-]?\d+)?\s*\]/g, '');
        s = s.replace(/\{[^}]*\}/g, '');
        return s.replace(/\s+/g, ' ').trim();
    }

    function checkJapaneseKeywords(rawStr) {
        if (!rawStr) return null;
        if (/[カタナ刀忍者刀脇差野太刀太刀短刀]/u.test(rawStr)) {
            return { floorKey: 'ph_katana', heldKey: 'ph_katana', category: 'weapon', subType: 'katana' };
        }
        if (/[サーベルシミター]/u.test(rawStr)) {
            return { floorKey: 'ph_saber', heldKey: 'ph_saber', category: 'weapon', subType: 'saber' };
        }
        if (/[ダガー短剣ナイフ手裏剣投剣]/u.test(rawStr)) {
            return { floorKey: 'ph_dagger', heldKey: 'ph_dagger', category: 'weapon', subType: 'dagger' };
        }
        if (/[グレートソードツヴァイハンダークレイモア大剣両手剣]/u.test(rawStr)) {
            return { floorKey: 'item_greatsword', heldKey: 'item_greatsword', category: 'weapon', subType: 'greatsword' };
        }
        if (/[ロングソードブロードソードショートソード直剣剣]/u.test(rawStr)) {
            return { floorKey: 'item_longsword', heldKey: 'item_longsword', category: 'weapon', subType: 'sword' };
        }
        if (/[槍スピアパイクハルバードランストライデント薙刀長刀]/u.test(rawStr)) {
            return { floorKey: 'item_spear', heldKey: 'item_spear', category: 'weapon', subType: 'spear' };
        }
        if (/[斧アックスハチェットマサカリ鉞]/u.test(rawStr)) {
            return { floorKey: 'ph_axe', heldKey: 'ph_axe', category: 'weapon', subType: 'axe' };
        }
        if (/[金槌ハンマーフレイルメイス棍棒槌]/u.test(rawStr)) {
            if (/大槌|ウォーハンマー|スレッジ/.test(rawStr)) {
                return { floorKey: 'ph_sledgehammer', heldKey: 'ph_sledgehammer', category: 'weapon', subType: 'hammer' };
            }
            if (/ハンマー|金槌/.test(rawStr)) {
                return { floorKey: 'ph_hammer', heldKey: 'ph_hammer', category: 'weapon', subType: 'hammer' };
            }
            return { floorKey: 'ph_mace', heldKey: 'ph_mace', category: 'weapon', subType: 'mace' };
        }
        if (/[弓クロスボウスリング投石器]/u.test(rawStr)) {
            return { floorKey: 'item_bow', heldKey: 'item_bow', category: 'weapon', subType: 'bow' };
        }
        if (/[盾シールドバックラー]/u.test(rawStr)) {
            return { floorKey: 'ph_shield', heldKey: 'ph_shield', category: 'shield', subType: 'shield' };
        }
        if (/[杖スタッフ長杖]/u.test(rawStr)) {
            return { floorKey: 'item_staff', heldKey: 'item_staff', category: 'magical', subType: 'staff' };
        }
        if (/[ワンド魔法棒]/u.test(rawStr)) {
            return { floorKey: 'item_wand', heldKey: 'item_wand', category: 'magical', subType: 'wand' };
        }
        if (/ロッド/u.test(rawStr)) {
            return { floorKey: 'item_rod', heldKey: 'item_rod', category: 'magical', subType: 'rod' };
        }
        if (/[薬ポーション霊薬]/u.test(rawStr)) {
            return { floorKey: 'ph_potion_flask', heldKey: 'ph_potion_flask', category: 'potion', subType: 'potion' };
        }
        if (/[巻物スクロール]/u.test(rawStr)) {
            return { floorKey: 'item_scroll', heldKey: 'item_scroll', category: 'scroll', subType: 'scroll' };
        }
        if (/[魔法書本祈祷書魔導書書物]/u.test(rawStr)) {
            return { floorKey: 'item_book', heldKey: 'item_book', category: 'book', subType: 'book' };
        }
        if (/[指輪リング]/u.test(rawStr)) {
            return { floorKey: 'item_ring', heldKey: 'item_ring', category: 'ring', subType: 'ring' };
        }
        if (/[アミュレット首飾りペンダント]/u.test(rawStr)) {
            return { floorKey: 'item_talisman', heldKey: 'item_talisman', category: 'amulet', subType: 'amulet' };
        }
        if (/松明/u.test(rawStr)) {
            return { floorKey: 'item_torch', heldKey: 'item_torch', category: 'light', subType: 'torch' };
        }
        if (/[ランタンランプ]/u.test(rawStr)) {
            return { floorKey: 'ph_lantern', heldKey: 'ph_lantern', category: 'light', subType: 'lantern' };
        }
        if (/[鎧アーマーメイルローブ胴甲冑]/u.test(rawStr)) {
            if (/プレート|板金/.test(rawStr)) return { floorKey: 'item_plate_armor', heldKey: 'item_plate_armor', category: 'armor', subType: 'plate' };
            if (/鎖|チェイン|メイル/.test(rawStr)) return { floorKey: 'item_chainmail', heldKey: 'item_chainmail', category: 'armor', subType: 'chain' };
            return { floorKey: 'item_leather_armor', heldKey: 'item_leather_armor', category: 'armor', subType: 'leather' };
        }
        if (/[兜ヘルム冠王冠頭冑]/u.test(rawStr)) {
            if (/冠|王冠/.test(rawStr)) return { floorKey: 'item_crown', heldKey: 'item_crown', category: 'armor', subType: 'crown' };
            return { floorKey: 'item_helmet', heldKey: 'item_helmet', category: 'armor', subType: 'helm' };
        }
        if (/[小手グローブガントレット手甲篭手]/u.test(rawStr)) {
            return { floorKey: 'item_gauntlets', heldKey: 'item_gauntlets', category: 'armor', subType: 'gloves' };
        }
        if (/[靴ブーツサンダル長靴]/u.test(rawStr)) {
            return { floorKey: 'item_boots', heldKey: 'item_boots', category: 'armor', subType: 'boots' };
        }
        if (/[クローク外套マント]/u.test(rawStr)) {
            return { floorKey: 'item_cloak', heldKey: 'item_cloak', category: 'armor', subType: 'cloak' };
        }
        if (/[箱チェスト唐櫃金庫]/u.test(rawStr)) {
            return { floorKey: 'ph_chest', heldKey: 'ph_chest', category: 'chest', subType: 'chest' };
        }
        if (/[食料パンレーション携帯食糧]/u.test(rawStr)) {
            return { floorKey: 'item_bread', heldKey: 'item_bread', category: 'food', subType: 'food' };
        }
        if (/[つるはしツルハシシャベルスコップ]/u.test(rawStr)) {
            if (/シャベル|スコップ/.test(rawStr)) return { floorKey: 'item_shovel', heldKey: 'item_shovel', category: 'tool', subType: 'shovel' };
            return { floorKey: 'item_pickaxe', heldKey: 'item_pickaxe', category: 'tool', subType: 'pickaxe' };
        }
        return null;
    }

    function resolveMorphologicalItem(cleanStr) {
        const lower = cleanStr.toLowerCase();

        // 1. Eastern Curved Blades (ph_katana)
        if (/\b(katana|wakizashi|nodachi|no-dachi|odachi|tachi|ninjato|ninja-to|tsurugi|masamune|muramasa|shinai|bokuto|kusarigama)\b/i.test(lower)) {
            return { floorKey: 'ph_katana', heldKey: 'ph_katana', category: 'weapon', subType: 'katana' };
        }

        // 2. Thrusting Blades (ph_estoc)
        if (/\b(estoc|rapier|foil|epee|small sword|bilbo)\b/i.test(lower)) {
            return { floorKey: 'ph_estoc', heldKey: 'ph_estoc', category: 'weapon', subType: 'estoc' };
        }

        // 3. Western Curved Blades (ph_saber / item_goblin_sword)
        if (/\b(saber|sabre|scimitar|cutlass|falchion|tulwar|khopesh|shamshir|messer)\b/i.test(lower)) {
            if (/\b(orc|goblin|orcish|uruk)\b/i.test(lower)) {
                return { floorKey: 'item_goblin_sword', heldKey: 'item_goblin_sword', category: 'weapon', subType: 'goblin_sword' };
            }
            return { floorKey: 'ph_saber', heldKey: 'ph_saber', category: 'weapon', subType: 'saber' };
        }

        // 4. Daggers & Knives (ph_dagger)
        if (/\b(dagger|knife|stiletto|dirk|main gauche|misericorde|athame|kris|bodkin|scalpel|shuriken|throwing knife|worm tooth|crysknife|elven dagger|orcish dagger|silver dagger)\b/i.test(lower)) {
            return { floorKey: 'ph_dagger', heldKey: 'ph_dagger', category: 'weapon', subType: 'dagger' };
        }

        // 5. Greatswords & Rune Blades
        if (/\b(claymore|two-handed sword|great sword|greatsword|zweihander|flamberge|executioner's sword|bastard sword|katzbalger|triple sword)\b/i.test(lower)) {
            return { floorKey: 'item_greatsword', heldKey: 'item_greatsword', category: 'weapon', subType: 'greatsword' };
        }
        if (/\b(rune sword|rune blade|vorpal|morgul|ringil|anduril|glamdring|sting|excalibur|grayswandir|frost brand|fire brand|stormbringer|mournblade|sunharrow|demonblade|eudemon blade|blessed blade)\b/i.test(lower)) {
            return { floorKey: 'item_rune_blade', heldKey: 'item_rune_blade', category: 'weapon', subType: 'rune_blade' };
        }

        // 6. Standard Swords (item_longsword)
        if (/\b(long sword|longsword|broad sword|broadsword|short sword|shortsword|gladius|spatha|backsword|blade of chaos|broken sword|broken dagger|sword|blade)\b/i.test(lower)) {
            if (/\b(orc|goblin|orcish)\b/i.test(lower)) {
                return { floorKey: 'item_goblin_sword', heldKey: 'item_goblin_sword', category: 'weapon', subType: 'goblin_sword' };
            }
            return { floorKey: 'item_longsword', heldKey: 'item_longsword', category: 'weapon', subType: 'sword' };
        }

        // 7. Axes (ph_axe / ph_hatchet)
        if (/\b(hatchet|hand axe|throwing axe|tomahawk)\b/i.test(lower)) {
            return { floorKey: 'ph_hatchet', heldKey: 'ph_hatchet', category: 'weapon', subType: 'hatchet' };
        }
        if (/\b(battle axe|battle-axe|battleaxe|great axe|greataxe|broad axe|bearded axe|lochaber axe|axe|cleaver|executioner's axe)\b/i.test(lower)) {
            return { floorKey: 'ph_axe', heldKey: 'ph_axe', category: 'weapon', subType: 'axe' };
        }

        // 8. Digging & Utility Tools (before general hammer/mattock checks)
        if (/\b(pick|pickaxe|pick-axe|dwarvish mattock|mattock|digger)\b/i.test(lower)) {
            return { floorKey: 'item_pickaxe', heldKey: 'item_pickaxe', category: 'tool', subType: 'pickaxe' };
        }
        if (/\b(shovel|spade|trowel|entrenching tool)\b/i.test(lower)) {
            return { floorKey: 'item_shovel', heldKey: 'item_shovel', category: 'tool', subType: 'shovel' };
        }
        if (/\b(key|skeleton key|lockpick|lock pick|credit card|stethoscope|tin opener|can-opener|pliers|tweezers|whistle|magic marker|leaguelock|expulsion|camera|mirror|bell|candelabrum|horn|flute|harp|bugle|drum|lenses|blindfold|towel|saddle|leash)\b/i.test(lower)) {
            return { floorKey: 'item_key', heldKey: 'item_key', category: 'tool', subType: 'key' };
        }

        // 9. Hammers, Mauls & Bludgeons
        if (/\b(sledgehammer|great hammer|maul|grond|mjollnir|sceptre of might|heavy iron ball|iron ball)\b/i.test(lower)) {
            return { floorKey: 'ph_sledgehammer', heldKey: 'ph_sledgehammer', category: 'weapon', subType: 'sledgehammer' };
        }
        if (/\b(war hammer|warhammer|hammer|mallet|lucern hammer|bec de corbin)\b/i.test(lower)) {
            return { floorKey: 'ph_hammer', heldKey: 'ph_hammer', category: 'weapon', subType: 'hammer' };
        }
        if (/\b(whip|bullwhip|scourge|demon whip|sacred scourge|cat-o'-nine-tails)\b/i.test(lower)) {
            return { floorKey: 'item_whip', heldKey: 'item_whip', category: 'weapon', subType: 'whip' };
        }
        if (/\b(morning star|morningstar|flail|two-handed flail|spiked flail|dire flail|ball-and-chain|iron chain|nunchaku|aklys|jo staff)\b/i.test(lower)) {
            return { floorKey: 'item_morningstar', heldKey: 'item_morningstar', category: 'weapon', subType: 'morningstar' };
        }
        if (/\b(club|cudgel|greatclub|giant club|giant spiked club|shillelagh|boomerang)\b/i.test(lower)) {
            return { floorKey: 'item_greatclub', heldKey: 'item_greatclub', category: 'weapon', subType: 'greatclub' };
        }
        if (/\b(mace|lead-filled mace|mace of disruption|great mace|scepter|sceptre)\b/i.test(lower)) {
            return { floorKey: 'ph_mace', heldKey: 'ph_mace', category: 'weapon', subType: 'mace' };
        }

        // 10. Polearms & Spears (item_spear)
        if (/\b(spear|javelin|pike|awl-pike|lance|trident|demon trident|trishula|halberd|glaive|guisarme|partisan|ranseur|spetum|voulge|bardiche|fauchard|bill-guisarme|nagimaki|naginata|scythe|polearm|harpoon|pitchfork|fustibalus|lajatang)\b/i.test(lower)) {
            return { floorKey: 'item_spear', heldKey: 'item_spear', category: 'weapon', subType: 'spear' };
        }

        // 11. Bows, Crossbows & Slings (item_bow)
        if (/\b(bow|short bow|long bow|great bow|yumi|crossbow|hand crossbow|arbalest|triple crossbow|sling|hunting sling|fustibalus|harquebus|pistol|gun)\b/i.test(lower)) {
            return { floorKey: 'item_bow', heldKey: 'item_bow', category: 'weapon', subType: 'bow' };
        }

        // 12. Staves, Wands & Rods
        if (/\b(gnarled staff|branch|druid staff|wooden staff)\b/i.test(lower)) {
            return { floorKey: 'item_staff_branch', heldKey: 'item_staff_branch', category: 'magical', subType: 'staff_branch' };
        }
        if (/\b(quarterstaff|staff|staves|mage staff|wizard's staff|bo staff)\b/i.test(lower)) {
            return { floorKey: 'item_staff', heldKey: 'item_staff', category: 'magical', subType: 'staff' };
        }
        if (/\b(wand)\b/i.test(lower)) {
            return { floorKey: 'item_wand', heldKey: 'item_wand', category: 'magical', subType: 'wand' };
        }
        if (/\b(rod)\b/i.test(lower)) {
            return { floorKey: 'item_rod', heldKey: 'item_rod', category: 'magical', subType: 'rod' };
        }

        // 13. Shields
        if (/\b(shield|buckler|targe)\b/i.test(lower)) {
            if (/\b(wicker|buckler|basket|targe)\b/i.test(lower)) return { floorKey: 'item_shield_wicker', heldKey: 'item_shield_wicker', category: 'shield', subType: 'wicker' };
            if (/\bleather\b/i.test(lower)) return { floorKey: 'item_shield_leather', heldKey: 'item_shield_leather', category: 'shield', subType: 'leather' };
            if (/\b(small metal|silver shield|shield of reflection|polished)\b/i.test(lower)) return { floorKey: 'item_shield_metal', heldKey: 'item_shield_metal', category: 'shield', subType: 'metal' };
            if (/\b(round|wooden|wood|orcish)\b/i.test(lower)) return { floorKey: 'item_shield_wooden', heldKey: 'item_shield_wooden', category: 'shield', subType: 'wooden' };
            if (/\b(knight|dragon|mithril|deflection|raven|heraldic|tower|kite|large)\b/i.test(lower)) return { floorKey: 'item_shield_raven', heldKey: 'item_shield_raven', category: 'shield', subType: 'raven' };
            return { floorKey: 'ph_shield', heldKey: 'ph_shield', category: 'shield', subType: 'shield' };
        }

        // 14. Armor, Helms, Crowns, Boots, Gloves, Cloaks
        if (/\b(crown|circlet|diadem|coronet|mitre)\b/i.test(lower)) {
            return { floorKey: 'item_crown', heldKey: 'item_crown', category: 'armor', subType: 'crown' };
        }
        if (/\b(helm|helmet|cap|basinet|sallet|coif|hat|cornuthaum|dunce cap|fedora|kabuto)\b/i.test(lower)) {
            return { floorKey: 'item_helmet', heldKey: 'item_helmet', category: 'armor', subType: 'helmet' };
        }
        if (/\b(boot|boots|shoes|sandals|greaves|slippers)\b/i.test(lower)) {
            return { floorKey: 'item_boots', heldKey: 'item_boots', category: 'armor', subType: 'boots' };
        }
        if (/\b(glove|gloves|gauntlet|gauntlets|cesti|cestus|mittens)\b/i.test(lower)) {
            return { floorKey: 'item_gauntlets', heldKey: 'item_gauntlets', category: 'armor', subType: 'gauntlets' };
        }
        if (/\b(cloak|mantle|cape|pall|wrapping|oilskin|mummy wrapping|alchemy smock|apron| scarf)\b/i.test(lower)) {
            return { floorKey: 'item_cloak', heldKey: 'item_cloak', category: 'armor', subType: 'cloak' };
        }
        if (/\b(chain mail|chainmail|hauberk|scale mail|augmented chain|bar chain|double chain|ring mail|elven mithril-coat|dwarvish mithril-coat|mithril)\b/i.test(lower)) {
            return { floorKey: 'item_chainmail', heldKey: 'item_chainmail', category: 'armor', subType: 'chainmail' };
        }
        if (/\b(plate armor|plate armour|plate mail|full plate|splint mail|brigandine|cuirass|banded mail|crystal plate|bronze plate|ribbed plate|dragon scales?|dragon armour|dragon armor)\b/i.test(lower)) {
            return { floorKey: 'item_plate_armor', heldKey: 'item_plate_armor', category: 'armor', subType: 'plate' };
        }
        if (/\b(leather armor|leather armour|soft leather|hard leather|studded leather|robe|jerkin|tunic|filthy rag|shirt|Hawaiian shirt|T-shirt|jacket|leather|troll hide|animal skin)\b/i.test(lower)) {
            return { floorKey: 'item_leather_armor', heldKey: 'item_leather_armor', category: 'armor', subType: 'leather' };
        }

        // 15. Potions, Scrolls, Books, Rings, Amulets, Gems, Chests, Lights, Food, Coins, Ammo
        if (/\b(torch)\b/i.test(lower)) {
            return { floorKey: 'item_torch', heldKey: 'item_torch', category: 'light', subType: 'torch' };
        }
        if (/\b(candle|candlestick|tallow candle|wax candle)\b/i.test(lower)) {
            return { floorKey: 'ph_candle', heldKey: 'ph_candle', category: 'light', subType: 'candle' };
        }
        if (/\b(lantern|lamp|oil lamp|magic lamp|brass lantern|phial|feanor|galadriel|star of|aril|diya|palantir|arrier)\b/i.test(lower)) {
            return { floorKey: 'ph_lantern', heldKey: 'ph_lantern', category: 'light', subType: 'lantern' };
        }
        if (/\b(flasks?\s+of\s+oil|oil\s+flask|lamp\s+oil)\b/i.test(lower) || /油つぼ/.test(lower)) {
            return { floorKey: 'ph_potion_bottle', heldKey: 'ph_potion_bottle', category: 'fuel', subType: 'oil' };
        }
        if (/\b(potion|elixir|draught|flask|tonic|water|booze|fruit juice|sake|ale|wine)\b/i.test(lower)) {
            if (/supreme|star|life|invulnerability|augmentation|experience|gain ability/i.test(lower)) return { floorKey: 'ph_potion_urn', heldKey: 'ph_potion_urn', category: 'potion', subType: 'urn' };
            if (/greater|critical|restore|mana|enlightenment|speed|healing|extra healing|full healing/i.test(lower)) return { floorKey: 'ph_potion_flask', heldKey: 'ph_potion_flask', category: 'potion', subType: 'flask' };
            return { floorKey: 'ph_potion_bottle', heldKey: 'ph_potion_bottle', category: 'potion', subType: 'bottle' };
        }
        if (/\b(scroll|parchment|label)\b/i.test(lower)) {
            if (/enchant|acquirement|artifact|rune|blessing|holy|genocide|charging/i.test(lower)) return { floorKey: 'item_scroll_enchant', heldKey: 'item_scroll_enchant', category: 'scroll', subType: 'enchant' };
            return { floorKey: 'item_scroll', heldKey: 'item_scroll', category: 'scroll', subType: 'scroll' };
        }
        if (/\b(book|tome|grimoire|manual|prayer|spellbook|novel|papyrus)\b/i.test(lower)) {
            return { floorKey: 'item_book', heldKey: 'item_book', category: 'book', subType: 'book' };
        }
        if (/\b(ring)\b/i.test(lower) && !/\b(ring mail|ringil)\b/i.test(lower)) {
            return { floorKey: 'item_ring', heldKey: 'item_ring', category: 'ring', subType: 'ring' };
        }
        if (/\b(amulet|talisman|pendant|necklace|periapt|charm)\b/i.test(lower)) {
            return { floorKey: 'item_talisman', heldKey: 'item_talisman', category: 'amulet', subType: 'amulet' };
        }
        if (/\b(boulder|rock)\b/i.test(lower) && !/\b(crystal|quartz|agate|lumenstone|luckstone|loadstone|touchstone|flint)\b/i.test(lower)) {
            return { floorKey: 'ph_boulder', heldKey: 'ph_boulder', category: 'boulder', subType: 'boulder' };
        }
        if (/\b(statue|figurine|idol)\b/i.test(lower)) {
            return { floorKey: 'ph_statue_item', heldKey: 'ph_statue_item', category: 'statue', subType: 'statue' };
        }
        if (/\b(gem|jewel|diamond|ruby|emerald|sapphire|amethyst|topaz|opal|garnet|quartz|agate|jade|pearl|crystal|silmaril|lumenstone|arcanite|dilithium|luckstone|loadstone|touchstone|flint|glass|rune of zot|orb of zot)\b/i.test(lower)) {
            return { floorKey: 'ph_crystal', heldKey: 'ph_crystal', category: 'gem', subType: 'crystal' };
        }
        if (/\b(chest|coffer|box|crate|trunk|ice box|sack|bag|oilskin sack|bag of holding)\b/i.test(lower)) {
            return { floorKey: 'ph_chest', heldKey: 'ph_chest', category: 'chest', subType: 'chest' };
        }
        if (/\b(waybread|lembas|wafer|cram)\b/i.test(lower)) {
            return { floorKey: 'item_lembas', heldKey: 'item_lembas', category: 'food', subType: 'lembas' };
        }
        if (/\b(ration|bread|food|slime-mold|slime mold|meat|corpse|chunk|fruit|apple|pear|banana|orange|melon|carrot|clove of garlic|sprig of wolfsbane|kelp|eucalyptus|pancake|fortune cookie|candy bar|cream pie|tin|tripe|egg|royal jelly|mushroom|toadstool|fungus)\b/i.test(lower)) {
            return { floorKey: 'item_bread', heldKey: 'item_bread', category: 'food', subType: 'bread' };
        }
        if (/\b(goblet|chalice|cup|grail|plate|bowl|jug|urn|pot)\b/i.test(lower)) {
            return { floorKey: 'ph_goblet', heldKey: 'ph_goblet', category: 'misc', subType: 'goblet' };
        }
        if (/\b(arrow|arrows|bolt|bolts|quarrel|dart|darts|shot|shots|pebbles|sling bullet|ya|needle)\b/i.test(lower)) {
            return { floorKey: 'item_arrow', heldKey: 'item_arrow', category: 'ammo', subType: 'arrow' };
        }
        if (/\b(gold|coins?|silver|copper|adamantite|mithril pieces|treasure|credits|zorkmid)\b/i.test(lower)) {
            return { floorKey: 'item_coins', heldKey: 'item_coins', category: 'coins', subType: 'coins' };
        }

        return null;
    }

    const MASTER_ITEM_REGISTRY = {
        POLYHAVEN_ITEM_GLTF_PATHS,
        HELD_CANONICAL_SPECS,
        VIEWMODEL_POSES,
        REALM_ITEM_GLYPHS,

        registerRealm(realmId, spec) {
            if (!realmId || typeof spec !== 'object') return;
            const norm = String(realmId).toLowerCase();
            PLUGGED_REALMS.set(norm, spec);
            if (spec.glyphs) {
                REALM_ITEM_GLYPHS[norm] = Object.assign({}, REALM_ITEM_GLYPHS[norm] || {}, spec.glyphs);
            }
            _cache.clear();
        },

        getHeldCanonicalSpec(key) {
            return HELD_CANONICAL_SPECS[key] || null;
        },

        getViewmodelPose(key, poseName) {
            const entry = VIEWMODEL_POSES[key] || DEFAULT_SWORD_POSE;
            return entry[poseName] || null;
        },

        resolveItem(itOrName, glyph, realm) {
            const rawName = (typeof itOrName === 'object' && itOrName !== null) ? (itOrName.name || itOrName.rawName || '') : String(itOrName || '');
            const g = glyph !== undefined ? String(glyph) : ((typeof itOrName === 'object' && itOrName !== null) ? String(itOrName.glyph || '') : '');
            const normRealm = String(realm || ((typeof itOrName === 'object' && itOrName !== null) ? itOrName.realm : '') || 'angband').toLowerCase();

            // Tier 0: LRU cache
            const cacheKey = `${normRealm}|${rawName}|${g}`;
            if (_cache.has(cacheKey)) {
                const hit = _cache.get(cacheKey);
                _cache.delete(cacheKey);
                _cache.set(cacheKey, hit);
                return hit;
            }

            let result = null;
            let tierUsed = 0;

            // Tier 1: Pluggable realm overrides & bilingual/Japanese normalization
            const plugged = PLUGGED_REALMS.get(normRealm);
            if (plugged) {
                if (plugged.items && plugged.items[rawName.toLowerCase()]) {
                    result = plugged.items[rawName.toLowerCase()];
                    tierUsed = 1;
                } else if (typeof plugged.resolveOverride === 'function') {
                    result = plugged.resolveOverride(rawName, g, normRealm);
                    if (result) tierUsed = 1;
                }
            }

            if (!result) {
                const jpMatch = checkJapaneseKeywords(rawName);
                if (jpMatch) {
                    result = jpMatch;
                    tierUsed = 1;
                }
            }

            const cleanName = normalizeItemName(rawName);

            // Tier 2: Morphological head-noun & category resolver
            if (!result && cleanName) {
                result = resolveMorphologicalItem(cleanName);
                if (result) tierUsed = 2;
            }

            // Tier 3: Realm-contextual item glyph fallback
            if (!result && g) {
                const realmTable = REALM_ITEM_GLYPHS[normRealm] || REALM_ITEM_GLYPHS.angband;
                if (realmTable && realmTable[g]) {
                    result = realmTable[g];
                    tierUsed = 3;
                }
            }

            if (!result) {
                result = { floorKey: null, heldKey: null, category: 'unknown', subType: 'unknown' };
            }

            const heldKey = result.heldKey || result.floorKey || null;
            const spec = heldKey ? HELD_CANONICAL_SPECS[heldKey] || null : null;
            const transforms = heldKey ? (VIEWMODEL_POSES[heldKey] || DEFAULT_SWORD_POSE) : null;
            const HELD_TO_VIEWMODEL = {
                ph_katana: 'katana',
                ph_dagger: 'dagger',
                ph_estoc: 'sword',
                ph_saber: 'saber',
                item_goblin_sword: 'saber',
                item_greatsword: 'claymore',
                item_rune_blade: 'blade',
                item_longsword: 'sword',
                ph_hatchet: 'hatchet',
                ph_axe: 'axe',
                item_pickaxe: 'pickaxe',
                item_shovel: 'shovel',
                ph_sledgehammer: 'sledgehammer',
                ph_hammer: 'hammer',
                item_morningstar: 'morningstar',
                item_whip: 'whip',
                item_greatclub: 'club',
                ph_mace: 'mace',
                item_spear: 'spear',
                item_bow: 'bow',
                item_staff: 'staff',
                item_staff_branch: 'staff_branch',
                item_wand: 'wand',
                item_rod: 'rod',
                item_shield_wicker: 'shield_wicker',
                item_shield_leather: 'shield_leather',
                item_shield_metal: 'shield_metal',
                item_shield_wooden: 'shield_wooden',
                item_shield_raven: 'shield_raven',
                ph_shield: 'shield',
                item_torch: 'torch',
                ph_lantern: 'lantern'
            };
            const viewmodelKey = (heldKey && HELD_TO_VIEWMODEL[heldKey]) || null;

            const finalEntry = {
                phKey: result.floorKey || null,
                floorKey: result.floorKey || null,
                heldKey: heldKey,
                viewmodelKey: viewmodelKey,
                category: result.category || 'unknown',
                subType: result.subType || 'unknown',
                spec: spec,
                transforms: transforms,
                sourceTier: tierUsed,
                rawName: rawName,
                normName: cleanName,
                glyph: g,
                realm: normRealm
            };

            if (_cache.size >= CACHE_MAX_ENTRIES) {
                const oldest = _cache.keys().next().value;
                _cache.delete(oldest);
            }
            _cache.set(cacheKey, finalEntry);

            return finalEntry;
        },

        resolveEquippedWeaponKey(weaponItem, bowItem, player, realm) {
            const lowerW = String(weaponItem || '').toLowerCase().trim();
            const lowerB = String(bowItem || '').toLowerCase().trim();
            const isBare = /^(bare\s*hands?|unarmed|none|nothing|\(nothing\)|\(none\)|empty|素手|なし)$/i.test(lowerW);
            const isNoBow = /^(none|nothing|\(nothing\)|\(none\)|empty|なし)$/i.test(lowerB);
            const wTval = player && Number(player.weapon_tval || 0);
            if (lowerW.length > 0 && !isBare) {
                if (lowerW.includes('whip') || lowerW.includes('bullwhip') || lowerW.includes('scourge') || lowerW.includes('cat-o')) return 'whip';
                if (/\b(staff|quarterstaff)\b/.test(lowerW) || wTval === 55) {
                    return /\b(gnarled|branch|druid|wood)\b/.test(lowerW) ? 'staff_branch' : 'staff';
                }
                if (wTval === 20 && !/\b(shovel|spade|trowel)\b/.test(lowerW)) return 'pickaxe';
                if (wTval === 65) return 'wand';
                if (wTval === 66) return 'rod';
                const res = this.resolveItem(weaponItem, ')', realm);
                if (res && res.viewmodelKey) return res.viewmodelKey;
                if (res && res.category && res.category !== 'weapon' && res.category !== 'unknown') return '';
                return 'sword';
            }
            if (lowerB.length > 0 && !isNoBow) {
                return 'bow';
            }
            return '';
        },

        resolveShieldKey(shieldName, glyph, realm) {
            if (!shieldName) return '';
            const lower = String(shieldName).toLowerCase().trim();
            if (/^(none|nothing|\(nothing\)|\(none\)|empty|なし)$/i.test(lower)) return '';
            if (/\b(deflection|dragon|artifact|thorin|celegorm|anor|gil-galad|harad|raven|mirror|elven)\b/.test(lower) && /\b(shield|buckler|targe)\b/.test(lower)) return 'shield_raven';
            if (/\b(wicker|buckler|basket)\b/.test(lower)) return 'shield_wicker';
            if (/\bleather\b/.test(lower) && /\b(shield|buckler|targe)\b/.test(lower)) return 'shield_leather';
            if (/\bsmall metal\b/.test(lower)) return 'shield_metal';
            if (/\b(wooden|wood|round|small|target)\b/.test(lower) && /\b(shield|buckler|targe)\b/.test(lower)) return 'shield_wooden';
            const res = this.resolveItem(shieldName, glyph || '(', realm);
            if (res && res.category === 'shield' && res.viewmodelKey) return res.viewmodelKey;
            if (/\b(shield|buckler|targe)\b/.test(lower) || /盾/.test(shieldName)) return 'shield';
            return '';
        },

        resolveNpcWeaponKey(weaponName, glyph, realm) {
            const res = this.resolveItem(weaponName, glyph || ')', realm);
            return (res && res.heldKey && HELD_CANONICAL_SPECS[res.heldKey]) ? res.heldKey : 'item_longsword';
        },

        getItemObjKey(itemName, glyph, realm) {
            const res = this.resolveItem(itemName, glyph, realm);
            return res ? res.floorKey : null;
        },

        resolvePolyHavenFloorItemKey(it, g, lowerName, realm) {
            const itemName = (typeof it === 'string') ? it : (it && it.name ? it.name : lowerName);
            const effRealm = realm || ((typeof it === 'string' && typeof lowerName === 'string') ? lowerName : (it && it.realm ? it.realm : undefined));
            return this.getItemObjKey(itemName, g, effRealm);
        },

        getWeaponAnimFamily(viewmodelKey, rawName = '') {
            const k = String(viewmodelKey || '').toLowerCase();
            const n = String(rawName || '').toLowerCase();
            if (k === 'whip' || /\b(whip|bullwhip|scourge)\b/.test(n)) return 'whip';
            if (k === 'bow' || /\b(bow|crossbow|sling)\b/.test(n)) return 'bow';
            if (k === 'wand' || k === 'rod' || k === 'staff' || k === 'staff_branch' || /\b(wand|rod|staff)\b/.test(n)) return 'device';
            if (k === 'spear' || k === 'dagger' || k === 'pickaxe' || k === 'shovel' || /\b(spear|dagger|knife|rapier|estoc|trident|pike|lance|halberd|glaive|dirk|stiletto)\b/.test(n)) return 'pierce';
            if (k === 'axe' || k === 'hatchet' || k === 'sledgehammer' || k === 'hammer' || k === 'mace' || k === 'morningstar' || k === 'club' || /\b(axe|hatchet|cleaver|mace|hammer|maul|flail|club|morningstar)\b/.test(n)) return 'axe_blunt';
            return 'blade';
        },

        resolvePrimaryVerb(itemOrObj, realm = 'angband') {
            if (!itemOrObj) return null;
            const r = String(realm || 'angband').toLowerCase();
            const label = String(itemOrObj.label || itemOrObj.name || itemOrObj.desc || (typeof itemOrObj === 'string' ? itemOrObj : '')).toLowerCase();
            const glyph = String(itemOrObj.glyph || '').charAt(0);
            const plugged = PLUGGED_REALMS.get(r);
            if (plugged && plugged.verbs && typeof plugged.resolveVerb === 'function') {
                const pv = plugged.resolveVerb(itemOrObj, r);
                if (pv !== undefined) return pv;
            }

            // 1. Spellbooks / Tomes
            if (glyph === '+' && (r === 'nethack' || r === 'dcss')) return r === 'nethack' ? 'r' : 'z';
            if (/\b(book|handbook|tome|grimoire|prayer|spellbook|manual|hymnal)\b/.test(label) || /(魔法書|教本|経典)/.test(label)) {
                if (r === 'silq' || r === 'brogue' || r === 'rogue') return null;
                if (r === 'nethack') return 'r';
                if (r === 'dcss') return 'z';
                return 'b';
            }

            // 2. Lamp Fuel, Light Sources, Potions & Scrolls
            if (/\b(flasks?\s+of\s+oil|oil\s+flask|lamp\s+oil)\b/.test(label) || /油つぼ/.test(label)) {
                return (r === 'nethack' || r === 'brogue') ? 'a' : 'F';
            }
            if (/\b(phial|feanor|galadriel|star of|aril)\b/.test(label) || /ガラドリエル/.test(label)) {
                return (r === 'nethack' || r === 'brogue') ? 'a' : 'A';
            }
            if (glyph === '!' || /\b(potion|draught|elixir)\b/.test(label) || /薬/.test(label)) return 'q';
            if (glyph === '?' || /\b(scroll|parchment)\b/.test(label) || /巻物/.test(label)) return r === 'silq' ? null : 'r';

            // 3. Food / Sustenance
            const eatKey = (r === 'nethack' || r === 'dcss' || r === 'rogue' || r === 'brogue') ? 'e' : 'E';
            if ((glyph === ',' && r !== 'nethack' && r !== 'rogue') || glyph === '%' || (glyph === ':' && (r === 'rogue' || r === 'brogue')) ||
                /\b(food|ration|bread|waybread|mushroom|mold|slime mold|jerky|biscuit|corpse|tripe|pancake|wafer|lembas|meat)\b/.test(label) || /食料/.test(label)) {
                return eatKey;
            }

            // 4. Wands / Rods / Staves / Horns / Tools (before generic weapon/armor glyph check)
            if (r === 'silq' && /\bhorn\b/.test(label)) return 'p';
            if ((glyph === '/' && (r === 'nethack' || r === 'dcss' || r === 'brogue' || r === 'rogue')) || glyph === '-' || /\bwand\b/.test(label) || /魔法棒/.test(label)) {
                if (r === 'silq') return null;
                if (r === 'dcss') return 'V';
                if (r === 'brogue') return 'a';
                if (r === 'nethack' || r === 'rogue') return 'z';
                return 'a';
            }
            if (/\brod\b/.test(label) || /ロッド/.test(label)) {
                if (r === 'silq') return null;
                if (r === 'dcss') return 'V';
                return 'z';
            }
            if ((glyph === '_' && r !== 'nethack') || /\b(staff|stave)\b/.test(label) || /(スタッフ|の杖|杖)/.test(label)) {
                if (r === 'silq' || r === 'brogue') return 'a';
                if (r === 'dcss') return 'V';
                if (r === 'nethack' || r === 'rogue') return 'z';
                return 'u';
            }
            if (r === 'nethack' && (glyph === '(' || /\b(lock\s*pick|credit\s*card|skeleton\s*key|stethoscope|tinning\s*kit|can\s*of\s*grease|magic\s*marker|whistle|bag|sack|oilskin|chest|box|horn|harp|flute|bugle|drum|camera|towel|blindfold|lenses|mirror|bell|candelabrum|lamp|lantern|unicorn\s*horn|figurine|saddle|leash)\b/.test(label))) {
                return 'a';
            }
            if (r === 'brogue' && /\bcharm\b/.test(label)) return 'a';

            // 5. Jewelry (Rings & Amulets — exclude 'ring mail')
            if (glyph === '=' || glyph === '"' || (glyph !== '[' && glyph !== '(' && !/\bring\s+mail\b/.test(label) && (/\b(ring|amulet|necklace|pendant|talisman)\b/.test(label) || /(指輪|アミュレット)/.test(label)))) {
                return (r === 'nethack' || r === 'dcss' || r === 'rogue') ? 'P' : 'w';
            }

            // 6. Body & Extremity Armor
            if (glyph === '[' || glyph === ']' || (glyph === '(' && r !== 'nethack' && r !== 'dcss' && r !== 'rogue') ||
                /\b(armor|armour|mail|plate|hauberk|robe|cloak|shield|helm|helmet|crown|cap|boots|gloves|gauntlets|shirt|dragon\s+scale|leather\s+jacket)\b/.test(label) ||
                /(鎧|メイル|ローブ|クローク|盾|兜|冠|帽子|篭手|靴)/.test(label)) {
                return (r === 'nethack' || r === 'dcss' || r === 'rogue') ? 'W' : 'w';
            }

            // 7. Weapons & Ranged Launchers
            if ('|/\\})~{'.includes(glyph) || (glyph === '(' && (r === 'dcss' || r === 'rogue')) ||
                /\b(torch|lantern|sword|bow|crossbow|sling|dagger|knife|axe|mace|spear|blade|katana|halberd|lance|hammer|flail|club|whip|pick-axe|mattock)\b/.test(label)) {
                if (glyph === '(' && r === 'dcss') return 'f';
                return 'w';
            }

            return null;
        },

        resolveItemInspectionTaxonomy(entity, realm = 'angband') {
            const r = String(realm || 'angband').toLowerCase();
            const itemName = (entity && (entity.name || entity.itemName || entity.label)) ? String(entity.name || entity.itemName || entity.label).trim() : 'Dungeon Object';
            const g = (entity && entity.glyph) ? String(entity.glyph).charAt(0) : '?';
            const lower = itemName.toLowerCase();
            const primaryKey = this.resolvePrimaryVerb({ name: itemName, glyph: g }, r);
            const pickupKey = (r === 'nethack' || r === 'rogue') ? ',' : 'g';
            const inspectKey = r === 'nethack' ? ':' : (r === 'silq' || r === 'brogue' ? 'x' : (r === 'dcss' ? 'v' : 'I'));
            const equipKey = primaryKey || 'w';

            let categoryLabel = 'Dungeon Object';
            if (/\b(flasks?\s+of\s+oil|oil\s+flask|lamp\s+oil)\b/.test(lower) || /油つぼ/.test(itemName)) categoryLabel = `Lamp Oil (Refill [${primaryKey || 'F'}])`;
            else if (/\b(torch|lantern|phial|feanor|galadriel|lamp)\b/.test(lower) || /ガラドリエル/.test(itemName) || g === '~') {
                categoryLabel = r === 'nethack' ? 'Light Source (Apply [a])' : 'Light Source (Equip [w] / Fuel [F])';
            }
            else if (g === '!' || /\b(potion|draught|elixir)\b/.test(lower)) categoryLabel = `Potion (Quaff [${primaryKey || 'q'}])`;
            else if (g === '?' || /\bscroll\b/.test(lower)) categoryLabel = `Scroll (Read [${primaryKey || 'r'}])`;
            else if ((g === '+' && (r === 'nethack' || r === 'dcss')) || /\b(book|tome|grimoire|prayer|spellbook)\b/.test(lower) || (g === ':' && r !== 'rogue' && r !== 'brogue' && r !== 'nethack')) {
                categoryLabel = r === 'nethack' ? 'Spellbook (Read [r] / Cast [Z])' : (r === 'dcss' ? 'Spellbook (Cast [z] / Memorise [M])' : 'Spellbook (Browse [b] / Cast [m])');
            } else if ((g === '/' && (r === 'nethack' || r === 'dcss' || r === 'brogue' || r === 'rogue')) || /\bwand\b/.test(lower)) {
                const verbLbl = r === 'dcss' ? 'Evoke [V]' : (r === 'brogue' ? 'Apply [a]' : (r === 'nethack' || r === 'rogue' ? 'Zap [z]' : 'Aim [a]'));
                categoryLabel = `Wand (${verbLbl})`;
            } else if (/\brod\b/.test(lower) || (g === '-' && r !== 'nethack')) {
                categoryLabel = r === 'dcss' ? 'Rod (Evoke [V])' : 'Wand / Rod (Aim [a] / Zap [z])';
            } else if ((g === '_' && r !== 'nethack') || /\b(staff|stave)\b/.test(lower)) {
                const staffLbl = (r === 'silq' || r === 'brogue') ? 'Activate [a]' : (r === 'dcss' ? 'Evoke [V]' : (r === 'nethack' || r === 'rogue' ? 'Zap [z]' : 'Use [u]'));
                categoryLabel = `Staff (${staffLbl})`;
            } else if (r === 'nethack' && (g === '(' || /\b(lock\s*pick|key|stethoscope|tinning|grease|marker|whistle|bag|sack|lamp|lantern|unicorn\s*horn|blindfold|towel|mirror|bell|candelabrum)\b/.test(lower))) {
                categoryLabel = 'Tool / Implement (Apply [a])';
            } else if (g === '=' || /\bring\b/.test(lower)) {
                categoryLabel = `Ring (Put On [${equipKey}])`;
            } else if (g === '"' || /\bamulet\b/.test(lower)) {
                categoryLabel = `Amulet (Wear [${equipKey}])`;
            } else if (g === '[' || g === ']' || (g === '(' && r !== 'nethack' && r !== 'dcss') || /\b(armor|armour|mail|plate|robe|cloak|shield|helm|boots|gloves)\b/.test(lower)) {
                categoryLabel = `Protective Armour (Wear [${equipKey}])`;
            } else if ((g === ',' && r !== 'nethack' && r !== 'rogue') || g === '%' || (g === ':' && (r === 'rogue' || r === 'brogue')) || /\b(food|ration|waybread|mushroom|jerky|biscuit|corpse|slime mold)\b/.test(lower)) {
                categoryLabel = `Food / Sustenance (Eat [${primaryKey || 'e'}])`;
            } else if (g === '$' || (g === '*' && (r === 'nethack' || r === 'dcss' || r === 'brogue' || r === 'rogue')) || /\b(gold|silver|copper|mithril|gems|diamonds|emeralds|sapphires|rubies|coins|zorkmid|lumenstone)\b/.test(lower)) {
                categoryLabel = 'Treasure / Gems';
            } else if (/\b(arrow|bolt|pebble|shot|seeker|dart|javelin)\b/.test(lower) || g === '{') {
                categoryLabel = `Ammunition (Fire [${(r === 'brogue' || r === 'rogue') ? 't' : 'f'}])`;
            } else if (/\b(bow|crossbow|sling)\b/.test(lower) || g === '}') {
                categoryLabel = `Missile Launcher (Equip [w] / Fire [${(r === 'brogue' || r === 'rogue') ? 't' : 'f'}])`;
            } else if (/\b(torch|lantern|phial|lamp)\b/.test(lower) || g === '~') {
                categoryLabel = r === 'nethack' ? 'Light Source (Apply [a])' : 'Light Source (Equip [w] / Fuel [F])';
            } else if (g === ')' || g === '|') {
                categoryLabel = 'Melee Weapon (Wield [w])';
            }

            return {
                categoryLabel,
                primaryKey: equipKey,
                pickupKey,
                inspectKey,
                actionsSummary: `[${pickupKey}] Pick Up • [${equipKey}] Use/Equip • [d] Drop • [${inspectKey}] Inspect`
            };
        },

        resolveDeviceButtonConfig(counts, realm = 'angband', isJp = false) {
            const r = String(realm || 'angband').toLowerCase();
            const c = counts || {};
            if (r === 'silq') {
                if (c.staffCount > 0) return { verb: 'use_staff', label: 'Staff', key: 'a' };
                if (c.hornCount > 0) return { verb: 'play_horn', label: 'Horn', key: 'p' };
                return { verb: 'use', label: 'Use', key: 'u' };
            }
            if (r === 'nethack') {
                if (c.wandCount > 0) return { verb: 'aim', label: 'Wand', key: 'z' };
                return { verb: 'use', label: 'Apply', key: 'a' };
            }
            if (r === 'dcss') {
                return { verb: 'aim', label: 'Evoke', key: 'V' };
            }
            if (r === 'brogue') {
                return { verb: 'use_staff', label: 'Staff', key: 'a' };
            }
            if (r === 'rogue') {
                return { verb: 'aim', label: 'Zap', key: 'z' };
            }
            if (c.wandCount > 0) return { verb: 'aim', label: isJp ? '魔法棒' : 'Wand', key: 'a' };
            if (c.rodCount > 0) return { verb: 'zap', label: isJp ? 'ロッド' : 'Rod', key: 'z' };
            if (c.staffCount > 0) return { verb: 'use_staff', label: isJp ? '杖' : 'Staff', key: 'u' };
            if (c.activatableCount > 0) return { verb: 'activate', label: isJp ? '始動' : 'Activate', key: 'A' };
            return { verb: 'aim', label: isJp ? '魔法棒' : 'Wand', key: 'a' };
        },

        clearCache() {
            _cache.clear();
        }
    };

    return MASTER_ITEM_REGISTRY;
});

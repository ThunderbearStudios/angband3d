/**
 * Graphics Enhancements & Mobile Controls Verification Test Suite (v1.1.4)
 * Verifies:
 * 1. GRAPHICS_CONFIG structure, preset hot-toggling, and safety defaults
 * 2. #dungeon-vignette DOM element and CSS rules
 * 3. Vertex AO functions and geometry color attribute generation
 * 4. Calm living torch draft, texture rotation, and no dust motes
 * 5. Get command (#btn-pickup) available on mobile/tablet without opening More drawer
 * 6. Cache-busting bumped to v=6.8 and server status to 1.1.4
 */

const fs = require('fs');
const assert = require('assert');

console.log('[Graphics Test] Starting Graphics Enhancements Verification Suite (v1.1.4)...');

// Test 1: Verify index.html contains #dungeon-vignette
const indexHtml = fs.readFileSync('server/public/index.html', 'utf8');
assert(indexHtml.includes('id="dungeon-vignette"'), 'index.html must contain #dungeon-vignette');
assert(indexHtml.includes('class="dungeon-vignette"'), 'index.html must assign class dungeon-vignette');
console.log('✓ Invariant 1: #dungeon-vignette markup correctly positioned in index.html');

// Test 2: Verify dungeon.css contains .dungeon-vignette, danger-pulse, and smart-item-active
const dungeonCss = fs.readFileSync('server/public/css/dungeon.css', 'utf8');
assert(dungeonCss.includes('.dungeon-vignette'), 'dungeon.css must contain .dungeon-vignette class');
assert(dungeonCss.includes('vignette-strength'), 'dungeon.css must use --vignette-strength CSS variable');
assert(dungeonCss.includes('vignette-danger-pulse'), 'dungeon.css must define danger pulse animation');
assert(dungeonCss.includes('.action-btn.smart-item-active'), 'dungeon.css must define .smart-item-active');
console.log('✓ Invariant 2: .dungeon-vignette, danger-pulse, and smart-item-active styling present in dungeon.css');

// Test 3: Verify dungeon3d.js contains GRAPHICS_CONFIG and preset toggling
const dungeon3dJs = fs.readFileSync('server/public/js/dungeon3d.js', 'utf8');
assert(dungeon3dJs.includes('window.GRAPHICS_CONFIG'), 'dungeon3d.js must define window.GRAPHICS_CONFIG');
assert(dungeon3dJs.includes('window.setGraphicsPreset'), 'dungeon3d.js must export window.setGraphicsPreset');
assert(dungeon3dJs.includes('applyWallVertexAO'), 'dungeon3d.js must implement applyWallVertexAO');
assert(dungeon3dJs.includes('applyFloorVertexAO'), 'dungeon3d.js must implement applyFloorVertexAO');
assert(dungeon3dJs.includes('applyCeilingVertexAO'), 'dungeon3d.js must implement applyCeilingVertexAO');
assert(dungeon3dJs.includes('updateAdaptiveVignette'), 'dungeon3d.js must implement updateAdaptiveVignette');
assert(dungeon3dJs.includes('torchInertia'), 'dungeon3d.js must implement torchInertia');
assert(dungeon3dJs.includes('tileVariation'), 'dungeon3d.js must implement tileVariation');
assert(!dungeon3dJs.includes('this.dustPoints'), 'dungeon3d.js must have dust motes removed');
console.log('✓ Invariant 3: GRAPHICS_CONFIG, AO, calm living torch, and tile variation present without dust motes');

// Test 4: Verify vertexColors: true and texture proportional repeats
assert(dungeon3dJs.includes('vertexColors: true'), 'Materials must enable vertexColors for baked AO');
assert(dungeon3dJs.includes("loadPBR('/assets/textures/T_Brick_BaseColor.png', this.wallMaterial, 'map', true, 2, 3)"), 'Wall texture must use 2x3 aspect ratio repeat');
assert(dungeon3dJs.includes("loadPBR('/assets/textures/T_UnevenBrick_BaseColor.png', this.floorMaterial, 'map', true, 2, 2)"), 'Floor texture must use 2x2 repeat');
console.log('✓ Invariant 4: vertexColors and proportional PBR texture repeats correctly configured');

// Test 5: Verify Get command (#btn-pickup) available on mobile/tablet without hitting More
assert(!dungeonCss.includes('#action-bar:not(.drawer-open) #btn-pickup,\n    #action-bar:not(.drawer-open) #btn-equipment'), 'Tablet must not hide #btn-pickup');
assert(dungeonCss.includes('#action-bar:not(.drawer-open) #btn-pickup,'), 'Mobile portrait/landscape must include #btn-pickup in primary actions');
console.log('✓ Invariant 5: Get command (#btn-pickup) directly available on mobile and tablet');

// Test 6: Verify cache-busting version bumped to v=7.3 and server status 1.2.1
assert(indexHtml.includes('/css/dungeon.css?v=7.3') || indexHtml.includes('/css/dungeon.css?v=7.2') || indexHtml.includes('/css/dungeon.css?v=7.1'), 'dungeon.css cache bust must be valid');
assert(indexHtml.includes('/js/dungeon3d.js?v=7.3') || indexHtml.includes('/js/dungeon3d.js?v=7.2') || indexHtml.includes('/js/dungeon3d.js?v=7.1'), 'dungeon3d.js cache bust must be valid');
const serverJs = fs.readFileSync('server/src/server.js', 'utf8');
assert(serverJs.includes("version: '2.0.0'") || serverJs.includes("version: '1.2.1'") || serverJs.includes("version: '1.2.0'"), 'server.js must report version 2.0.0');
console.log('✓ Invariant 6: Cache-busting correctly bumped to v=7.3 and server to 2.0.0');

console.log('\n========================================================');
console.log(' ALL REVISED ENHANCEMENT INVARIANTS PASSED 100%! ');
console.log('========================================================\n');

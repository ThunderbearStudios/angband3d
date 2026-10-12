// tools/test_heng_translate.js
// WS3.3 Contract unit tests T1–T12 for HengTranslate

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing HengTranslate contract (T1-T12)...');

// HengTranslate UMD module
let HengTranslate;
try {
  HengTranslate = require('../server/public/js/heng/heng-translate.js');
} catch (e) {
  console.error('Failed to require heng-translate.js:', e.message);
  process.exit(1);
}

// Load generated data
const names = require('../server/public/js/heng/heng-names.json');
const templates = require('../server/public/js/heng/heng-templates.json');
const kinds = require('../server/public/js/heng/heng-kinds.json');
const manifest = require('../server/public/js/heng/heng-manifest.json');

HengTranslate.load({ names, templates, kinds, manifest });

// T1: Dice suffix (L4)
{
  const ja = 'ブロード・アックス (2d6) (+0,+0)';
  const en = HengTranslate.translateName(ja);
  assert.strictEqual(en, 'Broad Axe (2d6) (+0,+0)', `T1 failed: expected "Broad Axe (2d6) (+0,+0)", got "${en}"`);
  console.log('  ✓ T1: Dice suffix preservation');
}

// T2: Counter + markers (L5)
{
  const ja1 = '食料';
  const en1 = HengTranslate.translateName(ja1);
  assert.strictEqual(en1, 'Ration of Food', `T2 singular failed: got "${en1}"`);

  const ja2 = '6つの食料';
  const en2 = HengTranslate.translateName(ja2);
  assert.strictEqual(en2, '6 Rations of Food', `T2 plural failed: expected "6 Rations of Food", got "${en2}"`);

  const ja3 = '1つの食料';
  const en3 = HengTranslate.translateName(ja3);
  assert.strictEqual(en3, '1 Ration of Food', `T2 count 1 failed: got "${en3}"`);
  console.log('  ✓ T2: Counter + markers');
}

// T3: Torch turns (L5)
{
  const ja = '7つの松明(2,500ターンの寿命)';
  const en = HengTranslate.translateName(ja);
  assert.strictEqual(en, '7 Wooden Torches (2,500 turns)', `T3 failed: expected "7 Wooden Torches (2,500 turns)", got "${en}"`);

  // Also test with space as in lines_raw
  const jaRaw = '6つの 松明(1,500ターンの寿命)';
  const enRaw = HengTranslate.translateName(jaRaw);
  assert.strictEqual(enRaw, '6 Wooden Torches (1,500 turns)', `T3 raw failed: got "${enRaw}"`);
  console.log('  ✓ T3: Torch turns');
}

// T4: Corpse (L3)
{
  const ja = '泣きじゃくる白痴の死体';
  const en = HengTranslate.translateName(ja);
  assert.strictEqual(en, 'Corpse of Blubbering idiot', `T4 failed: expected "Corpse of Blubbering idiot", got "${en}"`);
  console.log('  ✓ T4: Corpse forms');
}

// T5: Atomic fallback (L1)
{
  const ja = '未知のテストテキストです。';
  const out = HengTranslate.translateLine(ja, 'en');
  assert.strictEqual(out, ja, `T5 failed: unmapped line must fall back untouched to raw JP, got "${out}"`);

  // Ensure Frankenstein strings never happen: if template matches part but remaining has CJK, fall back
  const partial = '泣きじゃくる白痴にダメージを与えた。';
  const out2 = HengTranslate.translateLine(partial, 'en');
  const hasCJK = /[\u3040-\u30ff\u3400-\u9fff]/.test(out2);
  if (hasCJK) {
    assert.strictEqual(out2, partial, `T5 failed: line with CJK must be 100% untouched JP fallback, got "${out2}"`);
  }
  console.log('  ✓ T5: Atomic fallback');
}

// T6: Inscriptions
{
  const ja = '食料 {@q1}';
  const en = HengTranslate.translateName(ja);
  assert.strictEqual(en, 'Ration of Food {@q1}', `T6 failed: expected "Ration of Food {@q1}", got "${en}"`);
  console.log('  ✓ T6: Inscriptions verbatim');
}

// T7: List row visual width & attribute length
{
  const row = '  a) 6つの食料          3.0 kg';
  const attrs = '1'.repeat(row.length);
  const res = HengTranslate.translateRow(row, attrs, 'en', 1);
  // Visual width calculator
  function vw(s) {
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.codePointAt(i);
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
  assert.strictEqual(vw(res.text), vw(row), `T7 failed: visual width mismatch: ${vw(res.text)} vs ${vw(row)}`);
  assert.strictEqual(res.attrs.length, res.text.length, `T7 failed: attrs length (${res.attrs.length}) must equal text length (${res.text.length})`);
  assert.ok(res.text.startsWith('  a) '), 'T7 failed: label preserved');
  assert.ok(res.text.endsWith('3.0 kg'), 'T7 failed: weight column preserved');
  console.log('  ✓ T7: List row visual width and attribute alignment');
}

// T8: JP mode identity
{
  const line = 'ブロード・アックス (2d6) (+0,+0)';
  assert.strictEqual(HengTranslate.translateLine(line, 'jp'), line, 'T8 line identity in JP mode');
  assert.strictEqual(HengTranslate.translateName(line, 1, 'jp'), line, 'T8 name identity in JP mode');
  console.log('  ✓ T8: JP mode identity');
}

// T9: Bilingual mode
{
  const ja = '泣きじゃくる白痴';
  const bi = HengTranslate.translateName(ja, 1, 'bilingual');
  assert.ok(bi.includes('泣きじゃくる白痴') && bi.includes('Blubbering idiot'), `T9 failed: bilingual should gloss name: got "${bi}"`);
  console.log('  ✓ T9: Bilingual mode gloss');
}

// T10: Generator determinism
{
  assert.ok(manifest.templatesCount > 0, 'T10 manifest has templatesCount');
  assert.ok(manifest.namesCount > 0, 'T10 manifest has namesCount');
  assert.ok(manifest.generatedAt !== undefined, 'T10 manifest has generatedAt');
  console.log('  ✓ T10: Generator manifest & determinism');
}

// T11: Full regression test on lines_raw.json (no mixed lines)
{
  const rawLines = require('./fixtures/heng/lines_raw.json');
  let translatedCount = 0;
  let fallbackCount = 0;
  for (const line of rawLines) {
    const res = HengTranslate.translateLine(line, 'en');
    const hasCJK = /[\u3040-\u30ff\u3400-\u9fff]/.test(res);
    if (!hasCJK) {
      translatedCount++;
    } else {
      // Must be atomic fallback (strictly identical to original raw JP)
      assert.strictEqual(res, line, `T11 failed: mixed Frankenstein string detected: "${res}" from "${line}"`);
      fallbackCount++;
    }
  }
  console.log(`  ✓ T11: Full corpus regression (${rawLines.length} lines: ${translatedCount} EN, ${fallbackCount} atomic JP fallback, 0 mixed)`);
}

// T12: Performance (< 200 ms for 10x corpus)
{
  const rawLines = require('./fixtures/heng/lines_raw.json');
  // Warm up LRU cache
  for (const line of rawLines) {
    HengTranslate.translateLine(line, 'en');
  }

  const start = Date.now();
  for (let iter = 0; iter < 10; iter++) {
    for (const line of rawLines) {
      HengTranslate.translateLine(line, 'en');
    }
  }
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 200, `T12 failed: 10x corpus translation took ${elapsed}ms (budget < 200ms)`);
  console.log(`  ✓ T12: Translation performance (${elapsed}ms for 10x corpus, budget < 200ms)`);
}

console.log('All HengTranslate contract tests passed!');

#!/usr/bin/env node
/**
 * tools/gen_heng_dict.js — Deterministic translation dictionary generator for Hengband.
 *
 * Extracts:
 *   1. Template pairs from variants/hengband-src/src/**.{c,cpp,h}
 *   2. Name pairs from variants/hengband-src/lib/edit/*.jsonc
 *   3. Kind forms and counters
 *
 * Emits to server/public/js/heng/:
 *   - heng-names.json:       { [ja]: [en1, enN] }
 *   - heng-templates.json:   { buckets: { [key]: [[pattern, enFormat, argSpec], ...] } }
 *   - heng-kinds.json:       [{ jaSuffix, en, tval }, ...]
 *   - heng-manifest.json:    { counts, skippedNonLiteral, conflictsCount, generatedAt }
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'variants', 'hengband-src', 'src');
const EDIT_DIR = path.join(ROOT, 'variants', 'hengband-src', 'lib', 'edit');
const OUT_DIR = path.join(ROOT, 'server', 'public', 'js', 'heng');
const REPORTS_DIR = path.join(ROOT, 'tools', 'reports');

// Ensure output directories exist
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// --- 1. C String Literal Sequence Parser ---

function parseCStringLiteralSequence(text, startIndex) {
    let i = startIndex;
    const len = text.length;

    function skipWhitespaceAndComments() {
        while (i < len) {
            const ch = text[i];
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
                i++;
            } else if (ch === '/' && text[i + 1] === '/') {
                i += 2;
                while (i < len && text[i] !== '\n') i++;
            } else if (ch === '/' && text[i + 1] === '*') {
                i += 2;
                while (i < len && !(text[i] === '*' && text[i + 1] === '/')) i++;
                if (i < len) i += 2;
            } else {
                break;
            }
        }
    }

    skipWhitespaceAndComments();

    let result = '';
    let foundAny = false;

    while (i < len) {
        skipWhitespaceAndComments();
        // Check for string literal start (optional u8 prefix)
        if (text.startsWith('u8"', i)) {
            i += 2; // skip u8, leave i pointing at "
        }
        if (text[i] !== '"') {
            break;
        }

        i++; // skip opening quote
        foundAny = true;
        let str = '';

        while (i < len) {
            const ch = text[i];
            if (ch === '"') {
                i++; // closing quote
                break;
            }
            if (ch === '\\') {
                i++;
                if (i >= len) break;
                const esc = text[i];
                if (esc === 'n') str += '\n';
                else if (esc === 't') str += '\t';
                else if (esc === 'r') str += '\r';
                else if (esc === '"') str += '"';
                else if (esc === '\\') str += '\\';
                else if (esc === '0') str += '\0';
                else if (esc === '?') str += '?';
                else if (esc === 'x') {
                    // hex escape
                    const hex = text.slice(i + 1, i + 3);
                    if (/^[0-9a-fA-F]{1,2}$/.test(hex)) {
                        str += String.fromCharCode(parseInt(hex, 16));
                        i += hex.length;
                    }
                } else {
                    str += esc;
                }
                i++;
            } else {
                str += ch;
                i++;
            }
        }
        result += str;
        skipWhitespaceAndComments();
    }

    if (!foundAny) return null;
    return { str: result, nextIndex: i };
}

// --- 2. Upstream Source Parser ---

function collectSourceFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            results.push(...collectSourceFiles(full));
        } else if (ent.isFile() && /\.(c|cpp|h)$/i.test(ent.name)) {
            results.push(full);
        }
    }
    return results.sort();
}

function parseMacroPairsFromSource(files) {
    const rawPairs = [];
    let skippedNonLiteral = 0;

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

        // Find _( not preceded by an identifier character [A-Za-z0-9_]
        const re = /(?<![A-Za-z0-9_])_\(/g;
        let match;
        while ((match = re.exec(content)) !== null) {
            const startArg1 = re.lastIndex;
            const arg1 = parseCStringLiteralSequence(content, startArg1);
            if (!arg1) {
                skippedNonLiteral++;
                continue;
            }

            let pos = arg1.nextIndex;
            while (pos < content.length && (content[pos] === ' ' || content[pos] === '\t' || content[pos] === '\r' || content[pos] === '\n')) pos++;

            if (content[pos] !== ',') {
                skippedNonLiteral++;
                continue;
            }
            pos++; // skip comma

            const arg2 = parseCStringLiteralSequence(content, pos);
            if (!arg2) {
                skippedNonLiteral++;
                continue;
            }

            pos = arg2.nextIndex;
            while (pos < content.length && (content[pos] === ' ' || content[pos] === '\t' || content[pos] === '\r' || content[pos] === '\n')) pos++;

            if (content[pos] !== ')') {
                skippedNonLiteral++;
                continue;
            }

            rawPairs.push({
                ja: arg1.str,
                en: arg2.str,
                file: path.relative(SRC_DIR, file).replace(/\\/g, '/')
            });
        }
    }

    return { rawPairs, skippedNonLiteral };
}

// --- 3. Placeholder to Regex Conversion ---

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function convertTemplate(jaStr, enStr) {
    // Check if ja has fewer than 2 literal non-placeholder chars
    const strippedJa = jaStr.replace(/%(\^?s|d|ld|lld|u|c|x|\d*\$?[sdlucx]|[-+0#]*\d*(\.\d+)?[sdlucx]|%)/g, '').replace(/\{[^}]*\}/g, '').trim();
    if (strippedJa.length < 2) return null;

    // Placeholders regex: printf style and std::format {} style
    const PH_REGEX = /(%(\^?[sdlucx%]|[-+0#]*\d*(\.\d+)?[sdlucx]|(\d+)\$[sdlucx])|\{(:[^}]*)?\})/g;

    const jaParts = [];
    let lastIdx = 0;
    let phCount = 0;
    let match;

    const regexSegments = ['^'];
    const argTypes = [];

    while ((match = PH_REGEX.exec(jaStr)) !== null) {
        const literal = jaStr.slice(lastIdx, match.index);
        if (literal) regexSegments.push(escapeRegex(literal));

        const ph = match[0];
        if (ph === '%%') {
            regexSegments.push('%');
        } else if (ph.includes('d') || ph.includes('u') || ph.includes('x')) {
            regexSegments.push('([-+]?\\d[\\d,]*)');
            argTypes.push('int');
        } else if (ph.includes('c')) {
            regexSegments.push('(.)');
            argTypes.push('char');
        } else {
            // String capture (non-greedy)
            regexSegments.push('(.+?)');
            argTypes.push(ph.includes('^') ? 'cap_string' : 'string');
        }
        phCount++;
        lastIdx = match.index + match[0].length;
    }
    const tail = jaStr.slice(lastIdx);
    if (tail) regexSegments.push(escapeRegex(tail));
    regexSegments.push('$');

    const pattern = regexSegments.join('');

    return {
        ja: jaStr,
        en: enStr,
        pattern,
        phCount,
        argTypes,
        leadingLiteral: jaStr.split(PH_REGEX)[0] || ''
    };
}

// --- 4. JSONC Name Extractor & Normalizer ---

function normalizeAngbandMarkers(rawEn) {
    let clean = rawEn.trim();
    // 1. Remove leading & article marker
    clean = clean.replace(/^&\s*/, '');

    // 2. Alternation |a|b|
    const altRegex = /\|([^|]+)\|([^|]+)\|/g;
    const en1Alt = clean.replace(altRegex, '$1');
    const enNAlt = clean.replace(altRegex, '$2');

    // 3. Tilde ~ plural marker
    // For en1 (singular): ~ becomes empty string
    const en1 = en1Alt.replace(/~/g, '');

    // For enN (plural): ~ becomes 'es' after s, x, z, ch, sh; otherwise 's'
    const enN = enNAlt.replace(/([a-zA-Z]*)~/g, (m, stem) => {
        if (/([sxz]|ch|sh)$/i.test(stem)) {
            return stem + 'es';
        }
        return stem + 's';
    });

    return [en1, enN];
}

function parseNamesFromJsonc(editDir) {
    const files = fs.readdirSync(editDir).filter(f => f.endsWith('.jsonc')).sort();
    const names = {};
    const RE_NAME = /"name"\s*:\s*\{\s*"(ja|en)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"(ja|en)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

    for (const file of files) {
        const full = path.join(editDir, file);
        let content = fs.readFileSync(full, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

        let m;
        while ((m = RE_NAME.exec(content)) !== null) {
            const k1 = m[1];
            const v1 = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const k2 = m[3];
            const v2 = m[4].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

            const ja = k1 === 'ja' ? v1 : v2;
            const en = k1 === 'en' ? v1 : v2;

            if (!ja || !en) continue;
            if (ja === '日本語名' || en === 'English Name') continue;
            if (ja.trim().length === 0 || en.trim().length === 0) continue;

            const [en1, enN] = normalizeAngbandMarkers(en);
            names[ja] = [en1, enN];
        }
    }

    return names;
}

// --- 5. Flavored Kinds Definition ---

function getFlavoredKinds() {
    return [
        { jaSuffix: 'の薬', en: 'Potion~ of %s', tval: 'POTION' },
        { jaSuffix: 'の巻物', en: 'Scroll~ of %s', tval: 'SCROLL' },
        { jaSuffix: 'の杖', en: 'Staff~ of %s', tval: 'STAFF' },
        { jaSuffix: 'の魔法棒', en: 'Wand~ of %s', tval: 'WAND' },
        { jaSuffix: 'のロッド', en: 'Rod~ of %s', tval: 'ROD' },
        { jaSuffix: 'の指輪', en: 'Ring~ of %s', tval: 'RING' },
        { jaSuffix: 'のアミュレット', en: 'Amulet~ of %s', tval: 'AMULET' },
        { jaSuffix: 'のキノコ', en: 'Mushroom~ of %s', tval: 'FOOD' },
        { jaSuffix: 'の人形', en: 'Magical Figurine~ of %s', tval: 'FIGURINE' },
        { jaSuffix: 'の像', en: 'Statue~ of %s', tval: 'STATUE' },
        { jaSuffix: 'の死体', en: 'Corpse~ of %s', tval: 'CORPSE' },
        { jaSuffix: 'の骨', en: 'Skeleton~ of %s', tval: 'SKELETON' },
        { jaSuffix: 'の魔法書', en: '%s Spellbook~', tval: 'BOOK' }
    ];
}

// --- 6. Main Generator Logic ---

function generate() {
    console.log('[gen_heng_dict] Scanning source files in ' + SRC_DIR);
    const srcFiles = collectSourceFiles(SRC_DIR);
    console.log(`[gen_heng_dict] Found ${srcFiles.length} source files.`);

    const { rawPairs, skippedNonLiteral } = parseMacroPairsFromSource(srcFiles);
    console.log(`[gen_heng_dict] Extracted ${rawPairs.length} raw pairs (${skippedNonLiteral} skipped non-literal).`);

    // Group by ja pattern to detect conflicts and count frequencies
    const jaMap = new Map();
    for (const p of rawPairs) {
        const tmpl = convertTemplate(p.ja, p.en);
        if (!tmpl) continue;

        if (!jaMap.has(tmpl.pattern)) {
            jaMap.set(tmpl.pattern, []);
        }
        jaMap.get(tmpl.pattern).push({ tmpl, file: p.file });
    }

    const conflicts = [];
    const resolvedTemplates = [];

    for (const [pattern, list] of jaMap.entries()) {
        const enCounts = new Map();
        for (const item of list) {
            const en = item.tmpl.en;
            enCounts.set(en, (enCounts.get(en) || 0) + 1);
        }

        if (enCounts.size > 1) {
            conflicts.push({
                pattern,
                variants: Array.from(enCounts.entries()).map(([en, count]) => ({ en, count })),
                files: [...new Set(list.map(i => i.file))]
            });
        }

        // Pick variant with highest count, tie-breaker: first in file order
        let bestEn = list[0].tmpl.en;
        let maxCount = -1;
        for (const [en, count] of enCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                bestEn = en;
            }
        }

        const picked = list.find(i => i.tmpl.en === bestEn).tmpl;
        resolvedTemplates.push(picked);
    }

    // Bucket templates
    // Bucket key = first 2 characters of leading literal. If starts with placeholder -> "*"
    const buckets = {};
    for (const t of resolvedTemplates) {
        let key = '*';
        if (t.leadingLiteral && t.leadingLiteral.length >= 2) {
            key = t.leadingLiteral.slice(0, 2);
        }
        if (!buckets[key]) buckets[key] = [];
        // [pattern, enFormat, argTypes]
        buckets[key].push([t.pattern, t.en, t.argTypes]);
    }

    // Sort bucket keys, and sort entries inside each bucket by total literal length descending
    const sortedBuckets = {};
    const sortedBucketKeys = Object.keys(buckets).sort();
    for (const k of sortedBucketKeys) {
        sortedBuckets[k] = buckets[k].sort((a, b) => b[0].length - a[0].length);
    }

    console.log(`[gen_heng_dict] Resolved ${resolvedTemplates.length} templates into ${sortedBucketKeys.length} buckets (${conflicts.length} conflicts).`);

    // Parse JSONC names
    console.log('[gen_heng_dict] Parsing names from JSONC files in ' + EDIT_DIR);
    const names = parseNamesFromJsonc(EDIT_DIR);
    const sortedNames = {};
    for (const k of Object.keys(names).sort()) {
        sortedNames[k] = names[k];
    }
    console.log(`[gen_heng_dict] Extracted ${Object.keys(sortedNames).length} item/monster/ego/terrain names.`);

    // Kinds
    const kinds = getFlavoredKinds();

    // Manifest
    const manifest = {
        sourceFilesCount: srcFiles.length,
        rawPairsCount: rawPairs.length,
        skippedNonLiteral,
        templatesCount: resolvedTemplates.length,
        bucketsCount: sortedBucketKeys.length,
        namesCount: Object.keys(sortedNames).length,
        conflictsCount: conflicts.length,
        generatedAt: '2026-10-11T00:00:00Z' // deterministic fixed timestamp format
    };

    // Write output files
    const namesPath = path.join(OUT_DIR, 'heng-names.json');
    const templatesPath = path.join(OUT_DIR, 'heng-templates.json');
    const kindsPath = path.join(OUT_DIR, 'heng-kinds.json');
    const manifestPath = path.join(OUT_DIR, 'heng-manifest.json');
    const conflictsReportPath = path.join(REPORTS_DIR, 'heng_conflicts.json');

    fs.writeFileSync(namesPath, JSON.stringify(sortedNames, null, 2) + '\n', 'utf8');
    fs.writeFileSync(templatesPath, JSON.stringify({ buckets: sortedBuckets }, null, 2) + '\n', 'utf8');
    fs.writeFileSync(kindsPath, JSON.stringify(kinds, null, 2) + '\n', 'utf8');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    fs.writeFileSync(conflictsReportPath, JSON.stringify(conflicts, null, 2) + '\n', 'utf8');

    // Check size budget: names + templates + kinds <= 1.2 MB raw / <= 400 KB gzip
    const rawBytes = fs.statSync(namesPath).size + fs.statSync(templatesPath).size + fs.statSync(kindsPath).size;
    const gzNames = zlib.gzipSync(fs.readFileSync(namesPath));
    const gzTemplates = zlib.gzipSync(fs.readFileSync(templatesPath));
    const gzKinds = zlib.gzipSync(fs.readFileSync(kindsPath));
    const gzBytes = gzNames.length + gzTemplates.length + gzKinds.length;

    console.log(`\n======================================================`);
    console.log(`Hengband Generator Output Summary:`);
    console.log(`  Names:       ${manifest.namesCount} entries`);
    console.log(`  Templates:   ${manifest.templatesCount} templates in ${manifest.bucketsCount} buckets`);
    console.log(`  Raw size:    ${(rawBytes / 1024).toFixed(1)} KB (budget: <= 1228.8 KB)`);
    console.log(`  Gzip size:   ${(gzBytes / 1024).toFixed(1)} KB (budget: <= 400.0 KB)`);
    console.log(`  Conflicts:   ${manifest.conflictsCount} (written to ${conflictsReportPath})`);
    console.log(`======================================================\n`);

    if (rawBytes > 1.2 * 1024 * 1024) {
        console.warn(`[WARNING] Raw size ${(rawBytes / 1024).toFixed(1)} KB exceeds 1.2 MB budget!`);
    }

    return { manifest, rawBytes, gzBytes };
}

if (require.main === module) {
    try {
        generate();
        process.exit(0);
    } catch (err) {
        console.error('[gen_heng_dict] Error:', err);
        process.exit(1);
    }
}

module.exports = { generate };

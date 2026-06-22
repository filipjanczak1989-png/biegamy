#!/usr/bin/env node
// build-ef — składa EF detect-moment: wstawia surowe js/silnik-momentu.js (inline, IIFE → globalThis.SilnikMomentu)
// w miejsce markera /* __ENGINE_SRC__ */ w tools/detect-moment.template.ts → build/detect-moment.ts (gitignored, do wklejenia w Dashboard).
// ⚠️ REGUŁA SYNC: po zmianie js/silnik-momentu.js (logika LUB RUN_TYPES) URUCHOM ten skrypt + REDEPLOY EF przez Dashboard.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const engine = fs.readFileSync(path.join(ROOT, 'js', 'silnik-momentu.js'), 'utf8');
const tmpl   = fs.readFileSync(path.join(__dirname, 'detect-moment.template.ts'), 'utf8');

const MARK = '/* __ENGINE_SRC__ */';
if (!tmpl.includes(MARK)) { console.error('BUILD FAIL: brak markera ' + MARK + ' w template'); process.exit(1); }
const out = tmpl.replace(MARK, '// ===== INLINE silnik-momentu.js (NIE edytuj tu — edytuj js/silnik-momentu.js + rebuild) =====\n' + engine + '\n// ===== /INLINE silnik =====');

// sanity PRZED deployem (łapie zepsuty build, nie runtime)
if (!out.includes('SilnikMomentu') || !out.includes('detect') || !out.includes('isRunType')) {
  console.error('BUILD FAIL: output nie zawiera markerów silnika (SilnikMomentu/detect/isRunType)'); process.exit(1);
}
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
const outPath = path.join(ROOT, 'build', 'detect-moment.ts');
fs.writeFileSync(outPath, out);
console.log('OK → build/detect-moment.ts (' + out.length + ' znaków). Wklej do Dashboard EF detect-moment.');

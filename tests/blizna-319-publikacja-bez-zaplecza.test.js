/* BLIZNA 319 / 20.11.2026 (PILNE, produkcja): https://biegamy.run/CLAUDE.md i /.claude/settings.local.json dawały HTTP 200. deploy.yml wycinał tylko .git, .github,
   tests, tools, docs, .ai, supabase i journal.txt (CLAUDE.md „świadomie” zostawał), a upload-pages-artifact publikuje też pliki z kropką. Skan (same liczby): zero
   tokenów i kluczy w tych plikach i w ich historii. Teraz deploy wycina KAŻDĄ ścieżkę z kropką w korzeniu (/.*) i KAŻDY *.md (strona nie ładuje żadnego .md),
   a artefakt jest sprawdzany find-em; .claude/settings.local.json poza gitem (.gitignore). Ścieżki, które muszą dawać 404: tools/sciezki-niepubliczne.txt
   (sprawdz-po-pushu, tryb „po”). Test odtwarza wzorce rsync z deploy.yml na `git ls-files`. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const deploy = () => czytaj('.github/workflows/deploy.yml');
/* wzorce --exclude z kroku „Stage site” w kolejności z pliku */
function wzorce() {
  const d = deploy(), blok = d.slice(d.indexOf('rsync -a \\'), d.indexOf('./ /tmp/site/'));
  return [...blok.matchAll(/--exclude '([^']+)'/g)].map((m) => m[1]);
}
/* rsync: wzorzec z wiodącym „/” kotwiczy do korzenia (pierwszy człon ścieżki), bez ukośnika pasuje do nazwy na każdym poziomie; „*” jak w powłoce */
function wycieta(sciezka, w) {
  const czlony = sciezka.split('/'), nazwa = czlony[czlony.length - 1];
  const re = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
  return w.some((p) => p.startsWith('/') ? re(p.slice(1)).test(czlony[0]) : czlony.some((c) => re(p).test(c)) || re(p).test(nazwa));
}
const lista = () => czytaj('tools/sciezki-niepubliczne.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

test('deploy.yml: wycina każdą ścieżkę z kropką w korzeniu i każdy *.md; artefakt sprawdzany (kropka, .md, lista znanych)', () => {
  const w = wzorce();
  for (const p of ['/.*', '*.md', '/tests', '/tools', '/docs', '/supabase', '/journal.txt']) assert.ok(w.includes(p), 'brak --exclude ' + p);
  const d = deploy();
  assert.match(d, /for k in tests tools docs \.ai supabase journal\.txt \.claude CLAUDE\.md README\.md \.gitignore \.git \.github; do\n\s+test ! -e "\/tmp\/site\/\$k"/);
  assert.match(d, /kropka="\$\(find \/tmp\/site -mindepth 1 -maxdepth 1 -name '\.\*' \| head -5\)"\n\s+test -z "\$kropka" \|\| \{ echo "BLAD: sciezka z kropka w korzeniu artefaktu/);
  assert.match(d, /md="\$\(find \/tmp\/site -name '\*\.md' \| head -5\)"\n\s+test -z "\$md" \|\| \{ echo "BLAD: plik \.md w artefakcie/);
  assert.match(d, /test -f \/tmp\/site\/CNAME \|\| \{ echo "BLAD: brak CNAME/);
  assert.doesNotMatch(d, /README\*\.md CLAUDE\.md — dokumentacja w korzeniu repo, nieszkodliwa/, 'stary wyjątek usunięty');
});

test('każda ścieżka z tools/sciezki-niepubliczne.txt wycięta; strona (html, sw.js, sb.js, js/, vendor/, assets/, CNAME) zostaje; nic z kropką ani .md w artefakcie', () => {
  const w = wzorce(), l = lista();
  for (const p of ['CLAUDE.md', '.claude/settings.local.json', '.gitignore', 'README.md', 'docs/akcja-f-spec.md', '.ai/LEKCJE.md', 'assets/gra/dzwieki/zrodla.md']) assert.ok(l.includes(p), 'lista bez ' + p);
  for (const p of l) assert.ok(wycieta(p, w), 'deploy publikuje ' + p);
  const sledzone = execFileSync('git', ['-C', KORZEN, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const publikowane = sledzone.filter((p) => !wycieta(p, w));
  for (const p of ['CNAME', 'zawodnik.html', 'bieg.html', 'sw.js', 'sb.js', 'js/bieg.mjs', 'manifest.json']) assert.ok(publikowane.includes(p) || !sledzone.includes(p), 'strona straciła ' + p);
  assert.ok(publikowane.some((p) => p.startsWith('vendor/')) && publikowane.some((p) => p.startsWith('assets/')) && publikowane.some((p) => p.startsWith('js/')));
  const zle = publikowane.filter((p) => p.startsWith('.') || /\.md$/i.test(p) || /^(tests|tools|docs|supabase)\//.test(p));
  assert.deepEqual(zle, [], 'w artefakcie: ' + zle.slice(0, 5).join(', '));
  assert.equal(publikowane.filter((p) => /\.html$/.test(p) && !p.includes('/')).length > 20, true, 'strony .html w korzeniu zostają');
});

test('.claude/settings.local.json poza gitem (.gitignore), plik może zostać lokalnie', () => {
  assert.match(czytaj('.gitignore'), /^\.claude\/settings\.local\.json$/m);
  const w = execFileSync('git', ['-C', KORZEN, 'ls-files', '--', '.claude/settings.local.json'], { encoding: 'utf8' }).trim();
  assert.equal(w, '', 'plik nadal śledzony');
});

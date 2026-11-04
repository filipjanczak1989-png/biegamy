/* BLIZNA 155 (4.11.2026): rysunek postaci w koparce jest tajny do startu, a repo jest publiczne. Zgodę daje rodzic, wartość `wizerunek_zgoda` ustawia Filip po zgodzie na piśmie.
   Przed startem grafika nie może być osiągalna ani z przeglądarki, ani z repo:
   - w repo nie ma pliku graficznego postaci ani adresu podpisanego z prywatnego kubełka; narzędzie obróbki nie zapisuje do repo;
   - strona guzika i scena biorą adres WYŁĄCZNIE z odpowiedzi licznika po starcie, bez preloadu i bez stałej w kodzie;
   - licznik oddaje adres tylko po starcie, przy zgodzie, nigdy dla akcji testowej (licznik próby może wywołać każde zalogowane konto, a próbę można uruchomić wcześniej). Zachowanie bazy sprawdza tools/akcja-koparka-test.sh.
   Plakat NIE jest wzorem: leży w publicznym kubełku share-assets. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261105_akcja_koparka.sql';
const bezSql = (s) => s.replace(/--[^\n]*/g, '');
const bezJs = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const WZOR = 'https:\\/\\/afqojgkaveykxbltxzwm\\.supabase\\.co\\/storage\\/v1\\/object\\/sign\\/akcja-wizerunek\\/[A-Za-z0-9._-]+\\.webp\\?token=[A-Za-z0-9._-]+$';

function pliki(kat, wynik = []) {
  for (const n of fs.readdirSync(kat, { withFileTypes: true })) {
    if (n.name === '.git' || n.name === 'node_modules' || n.name === '__pycache__') continue;
    const p = path.join(kat, n.name);
    if (n.isDirectory()) pliki(p, wynik); else wynik.push(p);
  }
  return wynik;
}

test('w repo nie ma pliku z rysunkiem postaci', () => {
  const zle = pliki(KORZEN).map((p) => path.relative(KORZEN, p)).filter((p) => /\.(png|jpe?g|webp|gif|avif|svg|psd|mp4|webm|mov)$/i.test(p) && /fabian|koparka[-_]?postac|koparka[-_]?rysunek/i.test(p));
  assert.deepEqual(zle, []);
  const ign = czytaj('.gitignore');
  assert.match(ign, /^fabianek\*$/m, '.gitignore odrzuca plik, nawet gdy ktoś wrzuci go do drzewa');
});

test('w repo nie ma adresu podpisanego: token istnieje tylko w bazie', () => {
  const zle = [];
  for (const p of pliki(KORZEN)) {
    if (!/\.(html|js|mjs|ts|sql|md|json|py|sh|txt|yml|toml|css)$/i.test(p) || fs.statSync(p).size > 3e6) continue;
    const t = fs.readFileSync(p, 'utf8');
    /* Prawdziwy token to długi JWT (eyJ…); testy używają krótkich, zmyślonych napisów. */
    for (const m of t.matchAll(/object\/sign\/akcja-wizerunek\/[^\s'"`?]+\?token=([^\s'"`)]+)/g)) if (/^eyJ/.test(m[1]) || m[1].length >= 40) zle.push(path.relative(KORZEN, p));
  }
  assert.deepEqual(zle, []);
});

test('migracja: kubełek prywatny, niczego nie ustawia sama (brak polityk: asercja w migracji i krok 6 testu bazy)', () => {
  const t = bezSql(czytaj(MIG));
  assert.match(t, /values \('akcja-wizerunek', 'akcja-wizerunek', false,/);
  assert.doesNotMatch(t, /update\s+public\.akcje/i, 'zgodę, postać i adres ustawia Filip, nie migracja');
  assert.doesNotMatch(t, /wizerunek_zgoda\s*=\s*true/i);
  assert.match(t, /a\.wizerunek_zgoda and not a\.testowa and a\.koparka_postac is not null then a\.koparka_url/, 'adres: zgoda, nie próba, ustawiona postać');
});

test('licznik: pola dopisane do gałęzi po starcie, nie do odpowiedzi sprzed startu', () => {
  const t = bezSql(czytaj(MIG));
  assert.match(t, /v_wzor text := \$r\$'testowa',\\s\+a\\\.testowa\\\)\$r\$/, 'wpis przy końcowym jsonb_build_object, który wykonuje się dopiero po gałęzi „przed startem”');
});

test('strona guzika: adres tylko z odpowiedzi serwera, bez preloadu, bez stałej', () => {
  const html = czytaj('start-akcji.html'), kod = bezJs(html);
  assert.doesNotMatch(html, /<link[^>]+rel=["']?(preload|prefetch|preconnect)[^>]*(akcja-wizerunek|sign)/i);
  assert.doesNotMatch(html.split('<script>')[0], /id="postac"/, 'obrazka nie ma w stronie do chwili odsłony');
  assert.doesNotMatch(kod, /akcja-wizerunek\/[A-Za-z0-9._-]+\.webp/, 'nazwa pliku nie w kodzie');
  assert.match(kod, /d\.testowa === true\) return ZWYKLA_KOPARKA/, 'próba: zwykła koparka');
  assert.match(kod, /if \(!d \|\| !d\.wystartowala\) return ''/, 'przed startem brak adresu, nawet gdyby serwer się pomylił');
  assert.ok(kod.includes(WZOR), 'to samo sito co w ulicy');
  assert.match(kod, /p\.src = url/);
  const wywolania = [...kod.matchAll(/\bodslon\(/g)].length;
  assert.equal(wywolania, 2, 'definicja i jedno wywołanie, tylko z potwierdzonej odpowiedzi');
  assert.match(kod, /if \(potwierdzone\) odslon\(d\)/);
});

test('narzędzie obróbki odmawia zapisu w repo', () => {
  const t = czytaj('tools/rysunek-koparki.py');
  assert.match(t, /os\.path\.join\(kat, "\.git"\)/);
  assert.match(t, /ODMOWA/);
});

test('arkusz animacji koparki: te same warunki co rysunek, adres tylko z prywatnego kubełka', () => {
  const m = fs.readFileSync(path.join(KORZEN, 'supabase/migrations/20261105_akcja_koparka_arkusz.sql'), 'utf8');
  assert.match(m, /'koparka_arkusz_url', case when a\.wizerunek_zgoda and not a\.testowa and a\.koparka_postac is not null then a\.koparka_arkusz_url end/);
  assert.match(m, /object\/sign\/akcja-wizerunek\/\[A-Za-z0-9\._-\]\+\\\.webp/);
  assert.doesNotMatch(m, /storage\.buckets/, 'kubełek ten sam');
});

test('film akcji: te same warunki co rysunek, kubełek przyjmuje mp4 i zostaje prywatny', () => {
  const m = fs.readFileSync(path.join(KORZEN, 'supabase/migrations/20261105_akcja_film.sql'), 'utf8');
  assert.match(m, /'film_akcji_url', case when a\.wizerunek_zgoda and not a\.testowa then a\.film_akcji_url end/);
  assert.match(m, /object\/sign\/akcja-wizerunek\/\[A-Za-z0-9\._-\]\+\\\.mp4/);
  assert.match(m, /array\['image\/webp', 'video\/mp4'\], file_size_limit = 5242880/);
  assert.doesNotMatch(m, /set public = true/);
});

test('ulica: adres tylko przez sito z licznika, bez imienia w kodzie', async () => {
  const u = czytaj('js/ulica.mjs'), sc = bezJs(czytaj('js/ulica-scena.mjs'));
  assert.ok(u.includes(WZOR));
  assert.match(sc, /!przed \? U\.rysunekKoparki\(licznik\)/);
  assert.doesNotMatch(sc, /akcja-wizerunek/);
  require('node:module');
  await import(require('node:url').pathToFileURL(path.join(KORZEN, 'js/ulica.mjs')).href + '?rys');
  const R = globalThis.BM_ULICA.rysunekKoparki;
  const dobry = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/a.webp?token=x.y-z';
  assert.equal(R({ wystartowala: true, koparka_url: dobry }), dobry);
  assert.equal(R({ wystartowala: false, koparka_url: dobry }), '', 'przed startem nic, nawet gdyby serwer się pomylił');
  assert.equal(R(null), '');
  for (const zly of ['https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/share-assets/a.webp', 'javascript:alert(1)', dobry + '"><img src=x onerror=alert(1)>', dobry.replace('https', 'http'), dobry.replace('a.webp', 'a.png'), 123, {}]) {
    assert.equal(R({ wystartowala: true, koparka_url: zly }), '', String(zly));
  }
});

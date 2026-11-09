/* BLIZNA 101 (2.11.2026) — PROJEKT F dzień 5, część bez bazy: film akcji po starcie, wiersz wyprawy, karta akcji do
   udostępnienia (EF share-card {akcja}). Część z bazą (pushe, zamknięcie, dotarcie) — blizna-102 + tools/akcja-dzien5-test.sh.

   Pilnuje:
   - film akcji: domyślnie brak (film-02 zostaje), po starcie gra RAZ u każdego (osobny znacznik), także gdy dziś już był teaser;
   - wyprawa: tylko gdy Filip ustawi cel; tekst bez imienia dziecka;
   - share-card akcja: liczby i nazwa z bazy, klient podaje sam slug; plik z dniem i liczbami (zamrożenie nie pokaże starej
     liczby); akcja testowa tylko jej kontom; kod EF bez imienia dziecka. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('film akcji: domyślnie null, po starcie wybierany i grany raz (znacznik film_akcji), omija „raz dziennie"', () => {
  const sb = czytaj('sb.js');
  assert.match(sb, /window\.FILM_AKCJI = null;/);
  /* 9.11 (blizna-201): film akcji raz na KONTO, nie raz dziennie; w czasie akcji promo nie gra */
  assert.match(sb, /function filmDnia\(teraz\) \{ if \(akcjaRuszyla\(\) \|\| okresAkcji\(teraz\)\) return filmAkcjiDoObejrzenia\(\) \|\| window\.FILM_AKCJI \|\| null;/);
  assert.match(sb, /if \(!wymuszony\(\) && \(akcjaRuszyla\(\) \|\| okresAkcji\(teraz\)\)\) return filmAkcjiDoObejrzenia\(\) \? null : 'akcja-widziana';/);
  assert.match(sb, /if \(A && typeof A\.oznaczFilm === 'function'\) A\.oznaczFilm\(film\.id \|\| 'film-akcja'\);\s+else if \(\(film\.id \|\| 'film-akcja'\) === 'film-akcja'\) \{ try \{ window\.localStorage\.setItem\(KLUCZ_AKCJI, '1'\); \} catch \(e\) \{\} \}/);
  assert.match(sb, /A\.czyAkcjaRuszyla\(\)/, 'stan akcji z jednego źródła (js/akcja-cytaty.mjs)');
  const z = czytaj('zawodnik.html');
  assert.match(z, /if \(window\.FILM_DZIS && window\.FILM_DZIS\.czekaFilmAkcji && window\.FILM_DZIS\.czekaFilmAkcji\(\)\) \{/);
});

test('wyprawa: tylko z celem; tekst bez imienia; dla-fabianka i karta Dziś', async () => {
  globalThis.escapeHtml = (s) => String(s);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = globalThis.BM_AKCJA;
  /* 4.11 (komenda Filipa, blizna-116): cel TAJNY do dotarcia — tekst bez nazwy celu i bez cel_km; po dotarciu nazwa z BAZY (wyprawa_cel_nazwa). */
  assert.equal(A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: false, wyprawa_dotarla_at: null }), '', 'akcja bez wyprawy');
  assert.equal(A.tekstWyprawy({ wystartowala: false, wyprawa_trwa: true }), '', 'przed startem nic');
  const t = A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: true, wyprawa_km: 42.4, wyprawa_dotarla_at: null }).replace(/ /g, ' ');
  assert.equal(t, 'Wyprawa etapami · Filip i Kasia: 42 km (już w liczniku) · cel: tajemnica');
  assert.equal(A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: false, wyprawa_km: 241, wyprawa_dotarla_at: '2026-11-08T16:00:00Z', wyprawa_cel_nazwa: 'Cel Z Bazy' }).replace(/ /g, ' '), 'Wyprawa · dotarli: Cel Z Bazy ✓ · 241 km (już w liczniku)');
  assert.equal(A.linkTrasy, undefined, '9.11: mapy wyprawy nie ma (blizna-200)');
  assert.doesNotMatch(czytaj('js/akcja.mjs').replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, 'imię poza nazwą pliku strony');
  assert.match(czytaj('dla-fabianka.html'), /var wy = A\.tekstWyprawy\(d\);/);
});

test('karta akcji: przycisk tylko z wkładem > 0, EF share-card {akcja} — liczby z bazy, plik z dniem i liczbami', () => {
  const kod = czytaj('js/akcja.mjs');
  assert.match(kod, /wklad && Number\(wklad\.km\) > 0 \? '<button type="button" class="akcja-link" data-akcja="udostepnij">Udostępnij<\/button>'/);
  const z = czytaj('zawodnik.html');
  assert.match(z, /body: JSON\.stringify\(\{ akcja: slug \}\)/);
  const ef = czytaj('supabase/functions/share-card/index.ts');
  const f = ef.slice(ef.indexOf('async function kartaAkcji'), ef.indexOf('Deno.serve('));
  assert.match(f, /\/\^\[a-z0-9-\]\{2,40\}\$\/\.test\(slug\)/);
  assert.match(f, /\.eq\("user_id", userId\)/, 'karta osoby z tokena, nie z parametru');
  assert.match(f, /a\.testowa && !\(\(a\.konta_testowe \|\| \[\]\) as string\[\]\)\.includes\(ath\.id\)/);
  assert.match(f, /admin\.rpc\("akcja_licznik"/);
  assert.match(f, /admin\.rpc\("akcja_km_okna"/);
  assert.match(f, /const plik = `akcja-\$\{slug\}-\$\{ath\.id\}-\$\{dzis\}-\$\{Math\.round\(mojeKm \* 10\)\}-\$\{Math\.round\(suma\)\}\.jpg`;/);
  assert.doesNotMatch(f, /fabian/i, 'imię w kodzie EF — repo publiczne');
  assert.match(ef, /if \(akcja\) return await kartaAkcji\(admin, user\.id, akcja\);/);
});

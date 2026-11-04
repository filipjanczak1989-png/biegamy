/* BLIZNA 158 / FAQ AKCJI w Okienku (Filip 4.11): 40 pytań i zdania o grze jako stałe zdania, 0 tokenów.
   - przed startem każde pytanie z FAQ dostaje zagadkę, nigdy treść akcji (wyjątek: `zawsze`, zdania bez akcji);
   - „jak dołączyć” przed startem nie idzie do sieci;
   - po starcie „ile już km” to licznik akcji, nie tydzień pytającego;
   - cegiełki to tylko gra: FAQ i panel nie nazywają tak wpisów osób wpłacających;
   - pytania o własny trening i ogólne nie mogą zostać przechwycone;
   - żadnego celu wyprawy ani słowa o chorobie w treści. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');

test('każde pytanie FAQ trafia w swoje zdanie po starcie, a przed startem w zagadkę', async () => {
  await zaladuj('js/akcja-cytaty.mjs');
  const A = globalThis.BM_AKCJA_CYTATY;
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const { FAQ } = await zaladuj('supabase/functions/okienko/faq-akcji.mjs');
  assert.ok(FAQ.length >= 49);
  for (const f of FAQ) {
    if (f.zywe) continue;
    A.ustawStan({ ruszyla: true, proba: false });
    const po = R.dopasuj(f.p, new Date('2026-11-08T12:00:00Z'));
    assert.ok(po, 'po starcie bez trafienia: ' + f.p);
    assert.equal(po.zdanie, f.o, 'po starcie: ' + f.p);
    A.ustawStan({ ruszyla: false, proba: false });
    const przed = R.dopasuj(f.p, new Date('2026-11-05T12:00:00Z'));
    assert.ok(przed, 'przed startem bez trafienia: ' + f.p);
    if (f.zawsze) assert.equal(przed.zdanie, f.o, f.p);
    else assert.ok(A.ZAGADKI.includes(przed.zdanie), 'przed startem ma być zagadka: ' + f.p + ' → ' + przed.zdanie);
  }
});

test('B2: „jak dołączyć” przed startem to zdanie akcji, „ile już km” po starcie to licznik', async () => {
  await zaladuj('js/akcja-cytaty.mjs');
  const A = globalThis.BM_AKCJA_CYTATY;
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  A.ustawStan({ ruszyla: false, proba: false });
  for (const q of ['jak dołączyć', 'Jak dołączyć?', 'jak się dołączyć', 'jak mogę dołączyć', 'jak dołączyć do akcji']) {
    const w = R.dopasuj(q, new Date('2026-11-05T12:00:00Z'));
    assert.equal(w && w.log, 'zagadka', q);
  }
  A.ustawStan({ ruszyla: true, proba: false });
  for (const q of ['ile już km', 'ile km', 'ile już kilometrów', 'ile km już']) {
    const w = R.dopasuj(q, new Date('2026-11-08T12:00:00Z'));
    assert.equal(w && w.rodzaj, 'km', q);
  }
  const { zdanieAkcji } = await zaladuj('supabase/functions/okienko-v2/akcja-v2.mjs');
  await zaladuj('js/akcja.mjs');
  assert.match(zdanieAkcji('km', { wystartowala: true, suma_km: 4322, cel_km: 12500 }, globalThis.BM_AKCJA), /Razem już 4\s322 km z 12\s500/);
});

test('pytania o własny trening i ogólne zostają poza FAQ', async () => {
  const { dopasujFaq } = await zaladuj('supabase/functions/okienko/faq-akcji.mjs');
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const q of ['ile km przebiegłem w tym tygodniu', 'jak dołączyć do klubu na stravie', 'czy rower jest dobry na regenerację', 'czy spacer po bieganiu pomaga', 'jaki jest mój plan', 'jak dostać się na bieżnię na stadionie', 'co to jest VO2max', 'jaki rower kupić', 'jak działa zegarek garmin', 'ile kosztuje start w maratonie', 'gdzie jest najbliższy bieg']) {
    assert.equal(dopasujFaq(R.normalizuj(q)), null, q);
  }
});

test('treść: bez celu wyprawy i choroby; cegiełki to gra; decyzje Filipa zapisane', async () => {
  const { FAQ } = await zaladuj('supabase/functions/okienko/faq-akcji.mjs');
  const calosc = FAQ.map((f) => f.p + ' ' + f.o).join('\n');
  assert.doesNotMatch(calosc, /częstochow|jasn\w+ gór|chor(ob|uj)|nowotw|białacz|szpital/i);
  const nr = (n) => FAQ.find((f) => f.nr === n);
  assert.match(nr(34).o, /Cegiełki to gra w aplikacji/);
  assert.match(nr(34).o, /wpis w murze/);
  assert.match(nr(33).o, /formularz „Twoja firma na Ulicy”/, 'formularz firm istnieje');
  assert.match(nr(36).o, /Zagraj w Cegiełki/, 'gra jest');
  assert.doesNotMatch(nr(36).o, /szykuje/);
  assert.equal(nr(3).o, 'Udział w akcji nic nie kosztuje: wystarczy konto w BiegaMy i zapisany trening. Wpłata na zbiórkę jest dobrowolna i idzie bezpośrednio na oficjalną stronę zbiórki.', 'słowa Filipa 4.11');
  assert.match(nr(19).o, /Ranking ma tylko gra/);
  assert.match(nr(14).o, /Jeden trening zapisz raz/); assert.match(nr(38).o, /O jego zdrowiu nie piszemy/);
  const panel = czytaj('js/ulica.mjs');
  assert.match(panel, /Wpis osoby wpłacającej/); assert.doesNotMatch(panel, /Cegiełka osoby prywatnej|Dodaj cegiełkę/);
  const { ZDANIE_ULICA } = await zaladuj('supabase/functions/okienko-v2/akcja-v2.mjs');
  assert.doesNotMatch(ZDANIE_ULICA, /cegiełk/i, 'cegiełki to tylko gra');
});

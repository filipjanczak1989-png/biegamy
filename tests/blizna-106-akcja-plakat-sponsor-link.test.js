/* BLIZNA 106 (2.11.2026, Filip 19:00) — plakat akcji, sponsor z zewnątrz, podmiana linku zbiórki.
   B) akcje.plakat_url: licznik zwraca go WYŁĄCZNIE po starcie (migawka funkcji z prod); front tylko przez safeUrlAttr (biała lista
      hostów = Storage), miniatura → pełny ekran, pod nim „Wpłać na zbiórkę" (url_zbiorki, https); bez plakatu — pusty napis.
   C) dla-fabianka „Zostań sponsorem kilometrów" → index.html#sponsor → po logowaniu/rejestracji/sesji zawodnik.html#sponsor →
      formularz sponsora otwarty i przewinięty. Trener nie dostaje hasha.
   D) RPC akcja_url_zbiorki tylko dla startującego, tylko https://www.siepomaga.pl/…; start-akcji „⋯" po starcie; tekst formularza
      sponsora z imieniem z bazy (dopełniacz), imienia nie ma w kodzie (blizna-101). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const STORAGE = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/share-assets/akcja/abc.jpg';

test('B: plakat tylko po starcie (baza), tylko z białej listy (front), układ bez dziury bez plakatu', async () => {
  const lic = czytaj('supabase/schema/funkcje/akcja_licznik.sql');
  const przed = lic.slice(lic.indexOf('wystartowala_at is null then'), lic.indexOf('end if;'));
  assert.doesNotMatch(przed, /plakat/, 'licznik przed startem nie zna plakatu');
  assert.match(lic, /'plakat_url',\s+case when a\.wizerunek_zgoda then a\.plakat_url end/, 'plakat tylko ze zgodą mamy (Filip 2.11 19:20)');
  assert.match(czytaj('supabase/migrations/20261102_akcja_plakat_zgoda.sql'), /raise exception 'plakat: brak bramki zgody'/);
  const mig = czytaj('supabase/migrations/20261102_akcja_plakat_url.sql');
  assert.match(mig, /raise exception 'plakat: licznik zdradza plakat przed startem'/, 'asercja w migracji');
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261102_WYCOFANIE_akcja_plakat_url.sql')));

  globalThis.window = globalThis; globalThis.document = undefined;
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = globalThis.BM_AKCJA;
  globalThis.safeUrlAttr = (u) => (/^https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\//.test(u) ? u : '');
  globalThis.safeExternalHref = (u) => (/^https:\/\//.test(u) ? u : '');
  const d = { wystartowala: true, nazwa: 'Test', cel_km: 100, suma_km: 1, pct: 1, start: '2026-11-07', stawka_filip_gr: 10, filip_gr: 10, filip_max_gr: 1000, url_zbiorki: 'https://www.siepomaga.pl/x', imie: 'Marek' };
  assert.equal(A.plakatHtml(d), '', 'bez plakatu — pusty napis');
  assert.equal(A.plakatHtml({ ...d, plakat_url: 'https://evil.example/p.jpg' }), '', 'obcy host — nic');
  assert.equal(A.plakatHtml({ ...d, wystartowala: false, plakat_url: STORAGE }), '', 'przed startem — nic');
  const h = A.plakatHtml({ ...d, plakat_url: STORAGE }, 'akcja-plakat--mini');
  assert.match(h, /data-plakat="https:\/\/afqojgkaveykxbltxzwm/); assert.match(h, /<img src="https:\/\/afqojgkaveykxbltxzwm[^"]+" alt="Plakat akcji"/);
  assert.match(h, /class="akcja-wiecej akcja-wplac" href="https:\/\/www\.siepomaga\.pl\/x"[^>]*>Zbiórka</);
  assert.doesNotMatch(A.plakatHtml({ ...d, plakat_url: STORAGE, url_zbiorki: 'javascript:alert(1)' }), /Zbiórka/);
  const karta = A.kartaDzisHtml({ ...d, plakat_url: STORAGE }, { km: 1 }, new Date('2026-11-08T12:00:00Z'));
  assert.doesNotMatch(karta, /akcja-plakat--mini/, 'na Dziś Centrum Akcji zamiast grafiki (Filip 4.11); plakat zostaje na stronie akcji');
  assert.match(czytaj('dla-fabianka.html'), /<div id="plakat"><\/div>/);
  assert.match(czytaj('dla-fabianka.html'), /\$\('plakat'\)\.innerHTML = A\.plakatHtml\(d\);/);
  assert.match(czytaj('js/akcja.mjs'), /closest\("\[data-plakat\]"\)/, 'klik → pełny ekran');
});

test('C: sponsor z zewnątrz — dla-fabianka → index.html#sponsor → zawodnik.html#sponsor → formularz otwarty', () => {
  const f = czytaj('dla-fabianka.html');
  /* 12.11 (blizna-231): wejście ze strony akcji schowane do czasu wersji z potwierdzeniem stawki; ścieżka index.html → zawodnik.html#sponsor zostaje (zamrożone pliki) */
  assert.doesNotMatch(f, /id="sponsor"|Zostań sponsorem kilometrów|\$\('sponsor'\)/, 'bez wejścia sponsora na stronie akcji');
  const ix = czytaj('index.html');
  assert.match(ix, /location\.hash === '#sponsor'/, 'hash omija hero');
  assert.match(ix, /function celZawodnika\(onboarding\) \{[\s\S]*?location\.hash === '#sponsor'[\s\S]*?'zawodnik\.html'[\s\S]*?'#sponsor'/);
  const red = ix.slice(ix.indexOf('async function redirectUser'), ix.indexOf('function switchTab'));
  assert.match(red, /window\.location\.href = celZawodnika\(false\);/, 'logowanie i sesja → cel z hashem');
  assert.match(red, /window\.location\.href = 'trener\.html';/, 'trener bez hasha');
  assert.match(ix, /selectedRole === 'coach' \? 'trener\.html' : celZawodnika\(true\)/, 'rejestracja → onboarding + #sponsor');
  const z = czytaj('zawodnik.html'), i = z.indexOf('window._renderKartyAkcji = async function'), r = z.slice(i, z.indexOf('\n};\n', i));
  assert.match(r, /window\.location\.hash === '#sponsor'/); assert.match(r, /querySelector\('\.akcja-form'\); if \(f\) f\.hidden = false;/);
  assert.match(r, /history\.replaceState/, 'hash zdjęty — odświeżenie nie otwiera formularza drugi raz');
});

test('D: podmiana linku zbiórki — RPC tylko startujący, tylko siepomaga https; „⋯" po starcie; tekst z imieniem z bazy', async () => {
  const fn = czytaj('supabase/migrations/20261102_akcja_plakat_url.sql');
  assert.match(fn, /create function public\.akcja_url_zbiorki\(p_slug text, p_url text\)/);
  assert.match(fn, /akcja_startujacy s where s\.akcja_id = a\.id and s\.athlete_id = public\.auth_my_athlete_id\(\)/);
  assert.match(fn, /'\^https:\/\/www\\\.siepomaga\\\.pl\/\[A-Za-z0-9\._~\/-\]\{1,200\}\$'/, 'tylko siepomaga, bez ?/#/<');
  assert.match(fn, /revoke all on function public\.akcja_url_zbiorki\(text, text\) from public, anon, authenticated;/);
  assert.match(fn, /grant execute on function public\.akcja_url_zbiorki\(text, text\) to authenticated;/);
  assert.match(czytaj('tools/akcje-test-transakcji.sql'), /FAIL 11h/, 'test transakcyjny na prod');
  globalThis.window = globalThis;
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = globalThis.BM_AKCJA;
  assert.equal(A.dopelniacz('Marek'), 'Marka'); assert.equal(A.dopelniacz('Kuba'), 'Kuby'); assert.equal(A.dopelniacz('Jan'), 'Jana'); assert.equal(A.dopelniacz(''), '');
  assert.equal(A.tekstDeklaracji({ imie: 'Marek' }), 'Po zakończeniu akcji wpłacasz sam na zbiórkę Marka — aktualny link będzie zawsze tutaj. Aplikacja tylko liczy.');
  assert.equal(A.tekstDeklaracji(null), 'Po zakończeniu akcji wpłacasz sam na zbiórkę — aktualny link będzie zawsze tutaj. Aplikacja tylko liczy.');
  globalThis.safeExternalHref = (u) => (/^https:\/\//.test(u) ? u : '');
  const s = A.sponsorHtml({ km: 0, stawka_gr: null }, { imie: 'Marek', url_zbiorki: 'https://www.siepomaga.pl/x' });
  assert.equal(s, '', 'bez deklaracji: wejście schowane (12.11, blizna-231)');
  assert.match(A.sponsorHtml({ km: 0, stawka_gr: 6 }, { imie: 'Marek' }), /Twoja stawka: <b>6 gr<\/b> za każdy kilometr · <button type="button" class="akcja-tekstowy" data-akcja="wycofaj">Wycofaj<\/button>/, 'z deklaracją jak dotąd');
  assert.doesNotMatch(czytaj('js/akcja.mjs').replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, 'imienia nie ma w kodzie');
});

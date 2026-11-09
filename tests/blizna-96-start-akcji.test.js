/* BLIZNA 96 (3.11.2026) — PROJEKT F dzień 2: guzik startu (start-akcji.html) i podpięcie czyAkcjaRuszyla.
   Spec v3 pkt 1, 2, 4, 7. Serwerowa strona guzika (okno, czas klienta, idempotencja, 42501) jest w
   tools/akcje-test-transakcji.sh — tu klient: stan z bazy w js/akcja-cytaty.mjs i ekran guzika.

   Pilnuje:
   - odswiezStan: jedno źródło (RPC akcja_licznik), cache 60 s, brak sieci → stan z tej sesji albo „nie ruszyła";
   - konto testowe czyta 'proba' (PROBA_KONTA = konta_testowe z migracji) i po starcie próby widzi cytat dnia startu
     niezależnie od daty — nikt inny nie;
   - guzik: okno = okno z migracji, przytrzymanie 1 s, bez „Czy na pewno?", czas naciśnięcia w localStorage + IndexedDB,
     ponawianie co 5 s i przy `online`, reset tylko w trybie próby, nic innego do tapnięcia;
   - skrót na ekran główny przez osobny manifest strony (główny manifest bez skrótu — widziałby go każdy). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const GLOWNE = '56092926-2cf1-44b6-952f-38614497fdc2';   // główne konto Filipa (startujący)
const TESTOWE = '9c2df65c-6a46-410e-ad5f-474e5d973ec9';  // konto testowe próby (poprawka 2.11)
let A;
test.before(async () => {
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja-cytaty.mjs')).href);
  A = globalThis.BM_AKCJA_CYTATY;
});
const sbFake = (odp) => { const s = { wolania: [], rpc: async (fn, a) => { s.wolania.push([fn, a]); if (odp instanceof Error) throw odp; return odp; } }; return s; };
const pamiec = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('slugDla: konto testowe → proba, reszta (także główne konto Filipa) → dla-fabianka; PROBA_KONTA = poprawka', () => {
  assert.equal(A.slugDla(TESTOWE), 'proba');
  assert.equal(A.slugDla(GLOWNE), 'dla-fabianka', 'główne konto Filipa nie może czytać próby (błąd z 2.11)');
  assert.equal(A.slugDla(null), 'dla-fabianka');
  const m = czytaj('supabase/migrations/20261102_akcje_startujacy_poprawka.sql').match(/set konta_testowe = array\[([^\]]*)\]/);
  assert.ok(m, 'brak konta_testowe w poprawce');
  const zPoprawki = [...m[1].matchAll(/'([0-9a-f-]{36})'/g)].map((x) => x[1]);
  assert.deepEqual(A.PROBA_KONTA, zPoprawki);
});

test('odswiezStan: RPC akcja_licznik, cache 60 s, wymus, brak sieci → stan sesji albo false', async () => {
  globalThis.sessionStorage = pamiec();
  try {
    const sb = sbFake({ data: { wystartowala: true, koniec: null, suma_km: 3 }, error: null });
    const d = await A.odswiezStan(sb, 'ktos', { teraz: 1_000_000 });
    assert.equal(d.wystartowala, true);
    const licz = () => sb.wolania.filter((w) => w[0] === 'akcja_licznik');
    assert.deepEqual(licz(), [['akcja_licznik', { p_slug: 'dla-fabianka' }]]);
    assert.deepEqual(sb.wolania.filter((w) => w[0] !== 'akcja_licznik'), [['akcja_filmy_konta', { p_slug: 'dla-fabianka' }]], '9.11: po starcie także filmy konta (blizna-201), nic więcej');
    assert.equal(A.czyAkcjaRuszyla(), true);
    await A.odswiezStan(sb, 'ktos', { teraz: 1_000_000 + 59_000 });
    assert.equal(licz().length, 1, 'w 60 s drugi raz do bazy');
    await A.odswiezStan(sb, 'ktos', { teraz: 1_000_000 + 61_000 });
    assert.equal(licz().length, 2, 'po 60 s bez odświeżenia');
    await A.odswiezStan(sb, 'ktos', { teraz: 1_000_000 + 61_500, wymus: true });
    assert.equal(licz().length, 3);
    // brak sieci przy przeterminowanym cache → stan z sesji (nie cofa startu)
    await A.odswiezStan(sbFake(new Error('offline')), 'ktos', { teraz: 1_000_000 + 999_000 });
    assert.equal(A.czyAkcjaRuszyla(), true);
    // brak sieci bez żadnego stanu → nie ruszyła
    globalThis.sessionStorage = pamiec();
    await A.odswiezStan(sbFake(new Error('offline')), 'ktos', { teraz: 5 });
    assert.equal(A.czyAkcjaRuszyla(), false);
    // błąd RPC (np. 42501) traktowany jak brak danych
    await A.odswiezStan(sbFake({ data: null, error: { code: '42501' } }), 'ktos', { teraz: 6 });
    assert.equal(A.czyAkcjaRuszyla(), false);
    // bez sessionStorage (Deno w okienku) — działa, bez cache
    delete globalThis.sessionStorage;
    const sb2 = sbFake({ data: { wystartowala: false }, error: null });
    await A.odswiezStan(sb2, 'ktos', { teraz: 7 }); await A.odswiezStan(sb2, 'ktos', { teraz: 8 });
    assert.equal(sb2.wolania.length, 2);
  } finally { delete globalThis.sessionStorage; A.ustawStan({ ruszyla: false, zamknieta: false, proba: false }); }
});

test('próba: konto testowe po starcie próby widzi cytat dnia startu w dowolny dzień; inni nadal teaser', async () => {
  const d3 = new Date('2026-11-03T10:00:00Z');
  try {
    await A.odswiezStan(sbFake({ data: { wystartowala: true, koniec: null }, error: null }), TESTOWE, { teraz: 1 });
    assert.equal(A.cytat(d3).tekst, A.W_DNIU_STARTU);
    A.ustawStan({ ruszyla: false, proba: true });
    assert.equal(A.cytat(d3).tekst, A.TEASER['2026-11-03'], 'próba przed naciśnięciem = teaser');
    await A.odswiezStan(sbFake({ data: { wystartowala: true, koniec: null }, error: null }), 'zwykly', { teraz: 1 });
    assert.equal(A.cytat(d3).tekst, A.TEASER['2026-11-03'], 'zwykłe konto przed 7.11 = teaser mimo startu');
    assert.equal(A.cytat(new Date('2026-11-07T12:00:00Z')).tekst, A.W_DNIU_STARTU);
  } finally { A.ustawStan({ ruszyla: false, zamknieta: false, proba: false }); }
});

test('zawodnik.html: stan z bazy po initAuth (obie ścieżki) i przy powrocie karty, bez pollingu', () => {
  const z = czytaj('zawodnik.html');
  assert.equal((z.match(/initAuth\(\)\.then\(\(\) => \{[^\n]*window\._odswiezStanAkcji\(\);/g) || []).length, 2);
  const i = z.indexOf('window._odswiezStanAkcji = function'), f = z.slice(i, z.indexOf('\n};\n', i));
  assert.match(f, /BM_AKCJA_CYTATY\.odswiezStan\(window\.sb, _athleteId\)/);
  assert.doesNotMatch(f, /setInterval|setTimeout/);
});

test('start-akcji.html: okno z migracji, przytrzymanie 1 s, offline, ponawianie, próba, nic innego do tapnięcia', () => {
  const h = czytaj('start-akcji.html');
  const s = h.slice(h.indexOf('<script>\n(function'));
  // okno: dzień startu 06:00–23:59:59 Europe/Warsaw = akcje.okno_startu_od/do (migracja 7.11) — z jednej stałej (akcja-cytaty)
  assert.ok(czytaj('supabase/migrations/20261102_akcja_start_7_11.sql').includes("okno_startu_od = timestamp '2026-11-07 06:00:00' at time zone 'Europe/Warsaw'"));
  assert.match(s, /var OKNO_OD = AKC\.OKNO_STARTU \? AKC\.OKNO_STARTU\.od : NaN;/);
  assert.match(s, /var OKNO_DO = AKC\.OKNO_STARTU \? AKC\.OKNO_STARTU\.do : NaN;/);
  assert.match(h, /<script src="js\/akcja-cytaty\.mjs"><\/script>/);
  assert.doesNotMatch(h, /2026-11-0[78]|8 listopada|8\.11/, 'data startu wpisana w stronie guzika');
  assert.match(s, /PRZYTRZYMAJ_MS = 1000, PONOW_MS = 5000/);
  assert.match(s, /rpc\('akcja_start', \{ p_slug: SLUG, p_nacisnieto_at: t \}\)/);
  assert.match(s, /localStorage\.setItem\(KLUCZ, w\)/);
  assert.match(s, /indexedDB\.open\('bm-akcja', 1\)/);
  assert.match(s, /window\.addEventListener\('online', wyslij\)/);
  assert.match(s, /ponowTimer = setTimeout\(wyslij, PONOW_MS\)/);
  assert.match(s, /var SLUG = PROBA \? 'proba' : 'dla-fabianka';/);
  assert.match(s, /rpc\('akcja_proba_reset'\)/);
  assert.match(s, /\$\('reset'\)\.hidden = !\(PROBA && !SCIEZKA && nowy === 'zapisane'\)/);
  assert.match(s, /if \(stan !== 'uzbrojony'\) return;/);
  assert.doesNotMatch(s, /confirm\(|alert\(/, 'pytanie „Czy na pewno?" psuje moment');
  assert.doesNotMatch(h, /<a\s/i, 'link na ekranie guzika');
  // Filip 2.11 19:00: „⋯" z panelem linku zbiórki — wszystkie przyciski w HTML ukryte; „⋯" odsłania się dopiero PO starcie (panelLinku)
  const przyciski = [...h.matchAll(/<button([^>]*)>/g)].map((m) => m[1]);
  assert.equal(przyciski.length, 3, 'reset próby, „⋯" i zapis linku — nic więcej do tapnięcia');
  assert.ok(przyciski.filter((a) => /\bhidden\b/.test(a)).length === 2 && /id="zapisz-url"/.test(przyciski[2]), 'reset i „⋯" ukryte; zapis w ukrytym panelu');
  assert.match(h, /<div id="panel" hidden>/);
  assert.match(s, /\$\('wiecej'\)\.hidden = !\(d && d\.wystartowala\);/, '„⋯" tylko po starcie');
  assert.match(s, /rpc\('akcja_url_zbiorki', \{ p_slug: SLUG, p_url: url \}\)/);
  // błąd uprawnień i okna kończą ponawianie (bez pętli wysyłek bez końca)
  assert.match(s, /kod === '42501'\) \{/);
  assert.match(s, /if \(uzytk\) \{ await wyczyscLokalnie\(\); ustaw\('brak'/, 'odmowa kasuje naciśnięcie tylko przy działającej sesji (luka 6): ten sam kod przychodzi przy wygasłej');
  assert.match(s, /zLimitem\(window\.sb\.rpc\('akcja_start'/, 'wysyłka z limitem czasu');
  assert.match(s, /LIMIT_RPC_MS = 8000/);
  // audyt 2.11: 22023 (serwer: przed 06:00) NIE kasuje naciśnięcia, póki okno trwa — ponawia co 30 s; po oknie czyści
  assert.match(s, /kod === '22023'\) \{[\s\S]{0,400}?if \(Date\.now\(\) <= OKNO_DO\) \{[^\n]*setTimeout\(wyslij, 30000\); return; \}[\s\S]{0,80}?await wyczyscLokalnie\(\);/);
  // audyt 2.11: wygasły token bez sieci → guzik zostaje (sesja w pamięci telefonu); brak sesji w pamięci → „Zaloguj się"
  assert.match(s, /if \(!sesja && !sesjaWPamieci\(\)\) \{ ustaw\('brak'/);
  assert.match(s, /function sesjaWPamieci\(\) \{[\s\S]*?\/\^sb-\.\*-auth-token\$\//);
  // audyt 2.11: ?proba=1 w oknie startu odmawia (zakładka po próbie generalnej nie wystartuje próby zamiast akcji); bez modułu — błąd, nie pętla
  assert.match(s, /if \(PROBA && teraz >= OKNO_OD && teraz <= OKNO_DO\) \{ ustaw\('poza'/);
  assert.match(s, /if \(!isFinite\(OKNO_OD\) \|\| !isFinite\(OKNO_DO\)\) \{ ustaw\('blad'/);
  assert.match(czytaj('sw.js'), /\\.\(html\|css\|m\?js\|/, 'SW: .mjs z precache serwowane offline jak .js');
  assert.match(czytaj('supabase/functions/akcja-licznik/index.ts'), /if \(data\.testowa === true\) return new Response\('\{"error":"nie ma takiej akcji"\}', \{ status: 404/, 'próba nie jest publiczna');
});

test('instalacja: strona i logo w precache SW; osobny manifest strony; główny manifest bez skrótu „Start akcji"', () => {
  const sw = czytaj('sw.js');
  for (const u of ['/start-akcji.html', '/manifest-start-akcji.json', '/assets/ui/logo-b-biale-alfa.webp']) {
    assert.ok(sw.includes(`'${u}',`), 'precache bez ' + u);
    assert.ok(fs.existsSync(path.join(KORZEN, u.slice(1))), 'brak pliku ' + u + ' (addAll wywróci instalację SW)');
  }
  const m = JSON.parse(czytaj('manifest-start-akcji.json'));
  assert.equal(m.start_url, '/start-akcji.html');
  assert.notEqual(m.scope, '/', 'zakres „/" zlałby się z główną aplikacją');
  assert.ok(m.start_url.startsWith(m.scope));
  assert.doesNotMatch(czytaj('manifest.json'), /start-akcji/);
  assert.match(czytaj('start-akcji.html'), /<link rel="manifest" href="manifest-start-akcji\.json">/);
  // logo (Filip 2.11 18:08): B białe z cieniem, pierścień biały 40% — z pliku z alfą, bez filtrów i bez ciemnego krążka
  const html = czytaj('start-akcji.html');
  assert.equal((html.match(/<img /g) || []).length, 1, 'jeden plik logo we wszystkich stanach i w próbie');
  assert.match(html, /<img src="assets\/ui\/logo-b-biale-alfa\.webp" alt="">/);
  assert.doesNotMatch(html + czytaj('sw.js'), /logo-b-ring-alfa\.webp/, 'wróciło stare logo (zlewało się z kołem, Filip 2.11 17:43)');
  const webp = fs.readFileSync(path.join(KORZEN, 'assets/ui/logo-b-biale-alfa.webp'));
  assert.ok(webp.toString('latin1', 12, 16) === 'VP8X' && (webp[20] & 0x10), 'logo bez kanału alfa = biały kwadrat na guziku');
  assert.doesNotMatch(html, /mix-blend-mode|#krag::before|invert\(|filter:/);
});

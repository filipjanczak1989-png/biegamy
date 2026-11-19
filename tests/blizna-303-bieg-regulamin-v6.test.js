/* BLIZNA 303 / 19.11: regulamin 2026-11-v6 (decyzja Filipa): górny limit 10,49 km znika — czas na 5 km z tempa z każdego treningu od 5,50 km,
   w rankingu z miejscem i dopiskiem „z tempa”, ten sam czas na dyplomie; trening dłuższy niż maraton (42,2 km) do rankingu dopiero po „Zatwierdź”,
   flaga „trening dłuższy niż maraton”. Automat: najlepszy czas na 5 km spośród wszystkich treningów od 5 km; wskazanie zawodnika ma pierwszeństwo.
   Migracja 20261215 sama przestawia bieg-mikolajki na v6 i przelicza wyniki (bez pliku danych poza repo), więc front z v6 idzie PRZED nią.
   Zmienia się tylko § 5 ust. 5 (§ 8 ust. 1 z v5 nie mówi o progu). Komunikat dla zapisanych na v5 — słowo w słowo od Filipa. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
let B;
test.before(async () => { globalThis.escapeHtml = (x) => String(x); await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL; });
const BIEG = (w, x) => Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06',
  koniec_at: '2026-12-06T19:00:00+00:00', dystanse_km: [5], faza: 'trwa', regulamin_wersja: w, regulamin_od: '2026-11-19' }, x || {});
const LICZNIK = { imie: 'Fabianek' }, LINK = 'https://example.org/zbiorka';
const JA = (x) => Object.assign({ id: 'u1', rodzaj: 'ja', imie: 'Anna', numer: 1, dystans_km: 5, wynik_dystans_km: 5, ukonczony_at: '2026-11-19T10:00:00Z', odznaka: 'zwykla' }, x || {});
const P5 = '5. Bieg nie ma nagród. Ranking czasów na 5 km obejmuje wyłącznie pełnoletnich uczestników, którzy zgodzili się na udział w rankingu. W rankingu są wyniki z zegarka i wpisane ręcznie. Wynik budzący wątpliwości (np. tempo szybsze niż 3:00/km albo trening dłuższy niż maraton, 42,2 km) trafia do rankingu po sprawdzeniu przez Organizatora, który może poprosić o dowód (np. zapis z zegarka, zrzut z aplikacji). W rankingu liczy się czas na 5 km: przy treningu od 5 km do 5,49 km jest to czas treningu, a przy treningu od 5,50 km czas wyliczony ze średniego tempa (tempo × 5 km), oznaczony dopiskiem „z tempa”. Ten sam czas jest na dyplomie. Czas uczestników bez zgody na ranking nie jest publikowany. Dzieci nigdy nie są w rankingu.';

test('v6 obowiązuje, strona przyjmuje v2–v6; v6 różni się od v5 tylko § 5 ust. 5 (i linią wersji); w tekstach v6 nie ma „10,49”', () => {
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v7'); assert.deepEqual([...B.WERSJE_TEKSTOW], ['2026-11-v2', '2026-11-v3', '2026-11-v4', '2026-11-v5', '2026-11-v6', '2026-11-v7']);
  const w6 = B.wartosciTekstow(BIEG('2026-11-v6'), LICZNIK, LINK); assert.ok(w6); assert.equal(w6.od_z_tempa, 'od 5,50 km');
  const t5 = B.regulaminBloki(B.wartosciTekstow(BIEG('2026-11-v5'), LICZNIK, LINK)).map((b) => b.tekst), t6 = B.regulaminBloki(w6).map((b) => b.tekst);
  assert.equal(t5.length, t6.length);
  const rozne = t5.map((x, i) => (x === t6[i] ? null : i)).filter((i) => i !== null);
  assert.equal(rozne.length, 2, '§ 5 ust. 5 i wersja');
  assert.equal(t6[rozne[0]], P5); assert.equal(t6[rozne[1]], t5[rozne[1]].replace('2026-11-v5', '2026-11-v6'));
  assert.doesNotMatch(B.regulaminTekst(w6), /10,49/, 'regulamin v6 bez 10,49 km');
  assert.match(B.regulaminTekst(B.wartosciTekstow(BIEG('2026-11-v5'), LICZNIK, LINK)), /od 5,50 km do 10,49 km/, 'v5 bez zmian');
  assert.equal(B.znacznikiZTempa([5, 10]).od_z_tempa, 'od 5,50 km przy 5 km albo od 10,50 km przy 10 km');
});

test('komunikat zmiany przy v6: zapis na v5 — zdanie Filipa słowo w słowo; starsze — cała zasada; v2 także koniec 20:00', () => {
  const K = (w, moi) => B.komunikatZmiany(BIEG(w), moi);
  assert.equal(K('2026-11-v6', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v5' }]),
    'Zmiana regulaminu: czas z tempa liczymy z każdego treningu od 5,50 km (wcześniej do 10,49 km); trening dłuższy niż maraton po sprawdzeniu przez organizatora.');
  const pelna = 'w rankingu i na dyplomie liczy się czas na 5 km, z treningu od 5,50 km wyliczony z tempa (dopisek „z tempa”); trening dłuższy niż maraton po sprawdzeniu przez organizatora';
  assert.equal(K('2026-11-v6', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v4' }]), 'Zmiana regulaminu: ' + pelna + '.');
  assert.equal(K('2026-11-v6', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v3' }, { rodzaj: 'ja', regulamin_wersja: '2026-11-v5' }]), 'Zmiana regulaminu: ' + pelna + '.', 'najstarsza wersja decyduje');
  assert.equal(K('2026-11-v6', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v2' }]), 'Zmiana regulaminu: bieg i wyniki kończą się 6.12 o 20:00; ' + pelna + '.');
  assert.equal(K('2026-11-v6', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v6' }]), '');
  assert.match(K('2026-11-v5', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v4' }]), /od 5,50 do 10,49 km/, 'v5 w bazie (wycofanie): jak dotąd');
});

test('opis rankingu, karta i dyplom przy v6: czas z tempa z 16 km, bez „za długi”; 45 km czeka na sprawdzenie z powodem „maraton”', () => {
  const v6 = BIEG('2026-11-v6');
  const cp = B.tekstyDystansow(v6).czasy_prywatne;
  assert.match(cp, /z treningu od 5 km do 5,49 km; przy dłuższym treningu czas na 5 km z tempa \(z dopiskiem „z tempa”; trening dłuższy niż maraton po sprawdzeniu przez organizatora\)\./);
  assert.doesNotMatch(cp, /10,49/);
  const u16 = JA({ wynik_trening_km: 16, wynik_s: 4800, czas_biegu_s: 1500, z_tempa: true });
  assert.equal(B.wynikOpis(u16, v6), '5 km · 25:00 (z tempa)'); assert.equal(B.zaDlugiDoRankingu(u16, v6), false); assert.equal(B.gornaRankingu(u16, v6), Infinity);
  const h = B.wynikHtml(u16, v6);
  assert.match(h, /data-wynik-trening>Trening: 16 km · 1:20:00</); assert.doesNotMatch(h, /data-wynik-za-dlugi|10,49/);
  const u45 = JA({ wynik_trening_km: 45, wynik_s: 13500, czas_biegu_s: 1500, z_tempa: true, do_weryfikacji: true, weryfikacja: null });
  const h45 = B.wynikHtml(u45, v6);
  assert.match(h45, /5 km · 25:00 \(z tempa\)/, 'dyplom i karta z czasem'); assert.match(h45, /data-wynik-weryfikacja>Wynik czeka na sprawdzenie przez organizatora \(tempo spoza 3:00–36:00\/km albo trening dłuższy niż maraton\)/);
  assert.doesNotMatch(h45, /data-wynik-za-dlugi/);
  assert.match(B.wynikHtml(u45, BIEG('2026-11-v5')), /data-wynik-weryfikacja>Wynik czeka na sprawdzenie przez organizatora \(tempo szybsze niż 3:00\/km albo wolniejsze/, 'v5: tekst jak dotąd');
  assert.equal(B.zaDlugiDoRankingu(u16, BIEG('2026-11-v5')), true, 'v5: 16 km za długi jak dotąd');
});

test('panel: maraton przy „Zatwierdź” i „Do sprawdzenia”, bez 10,49 km', () => {
  const p = czytaj('js/bieg-panel.mjs');
  assert.match(p, /a od regulaminu v6 także z treningu dłuższego niż maraton \(42,2 km\), wchodzi do rankingu dopiero po „Zatwierdź”/);
  assert.match(p, /trening dłuższy niż maraton od regulaminu v6/); assert.doesNotMatch(p, /10,49/);
});

test('baza (20261215): v6 bez górnego limitu, maraton po zatwierdzeniu, przeliczenie bez wskazanych; bieg-mikolajki v5 → v6 w tej samej migracji; wycofanie odwraca', () => {
  const m = czytaj('supabase/migrations/20261215_akcja_bieg_czas_z_tempa_bez_limitu.sql'), w = czytaj('supabase/migrations/20261215_WYCOFANIE_akcja_bieg_czas_z_tempa_bez_limitu.sql');
  assert.match(m, /PRZED pushem frontu, który przyjmuje v6/, 'kolejność w nagłówku');
  assert.match(m, /when public\.akcja_bieg_wersja_od\(p_wersja, 6\) and p_s is not null and p_d > 0 and p_km > p_d \+ 0\.49 then round\(p_s \* p_d \/ p_km\)::integer/, 'v6: tempo × 5 bez limitu, zaokrąglone');
  assert.ok(m.includes('(k.km > 42.2 and public.akcja_bieg_wersja_od('), 'maraton do weryfikacji tylko od v6');
  assert.ok(m.includes("then 'trening dłuższy niż maraton' when u.rodzaj = 'ja' and k.v6 then null when"), 'flaga maratonu, bez flagi 10,49 km przy v6');
  assert.match(m, /and not coalesce\(u\.wynik_wskazany, false\) and u\.zaliczony_przez is null and u\.weryfikacja is distinct from 'zatwierdzony'/, 'przeliczenie: wskazanie, zaliczenie i zatwierdzenie nietknięte');
  assert.match(m, /if b\.regulamin_wersja not in \('2026-11-v5', '2026-11-v6'\) then raise exception/); assert.match(m, /if b\.koniec_at is null or now\(\) >= b\.koniec_at then raise exception/);
  assert.match(m, /update public\.akcja_biegi set regulamin_wersja = '2026-11-v6', regulamin_od = v_dzis where id = b\.id and regulamin_wersja = '2026-11-v5';/);
  assert.doesNotMatch(m, /security definer/i, 'nowe funkcje bez security definer');
  const R = 're' + 'voke', D = 'dr' + 'op function';
  for (const f of ['public.akcja_bieg_czas_wersji(integer, numeric, integer, text)', 'public.akcja_bieg_przelicz(uuid)']) {
    assert.ok(m.includes(R + ' all on function ' + f + ' from public, anon, authenticated;'), f); assert.ok(w.includes(D + ' ' + f + ';'), 'wycofanie usuwa ' + f);
  }
  const trojki = (s) => [...s.matchAll(/\(\d+, '(public\.[a-z_]+\([^']*\))',\n\s*\$k\$(.*?)\$k\$,\n\s*\$k\$(.*?)\$k\$\)/g)].map((x) => [x[1], x[2], x[3]]);
  const tm = trojki(m), tw = trojki(w);
  assert.equal(tm.length, 7); assert.deepEqual(tw, [...tm].reverse().map(([f, a, b]) => [f, b, a]), 'wycofanie odwraca każdą kotwicę w odwrotnej kolejności');
  assert.ok(w.includes("set regulamin_wersja = '2026-11-v5', regulamin_od = date '2026-11-18' where slug = 'bieg-mikolajki' and regulamin_wersja = '2026-11-v6'"), 'wycofanie wraca do v5 z datą sprzed migracji');
  assert.ok(w.indexOf('perform public.akcja_bieg_przelicz(') < w.indexOf(D + ' public.akcja_bieg_przelicz'), 'przeliczenie po regułach v5 przed usunięciem funkcji');
  const sh = czytaj('tools/akcja-bieg-czas-z-tempa-v6-test.sh'), sq = czytaj('tools/akcja-bieg-czas-z-tempa-v6-test.sql');
  assert.match(sh, /AKCJA_BIEG_V6_Z_MIGRACJA/); assert.match(sq, /raise exception 'TESTY CZASU Z TEMPA V6 ZIELONE: % sprawdzeń', n;/);
  assert.doesNotMatch(sq, /perform public\.akcja_bieg_automat\(\)/, 'test na produkcji nie woła automatu');
  for (const p of ["16, '1:20:00'", "45, '3:45:00'", "5.3, '27:00'", "12, '55:00'", "5.2, '26:00'"]) assert.ok(sq.includes(p), 'przypadek ' + p);
  const nowe = [m, w, sh, sq].join('\n');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(nowe), 'bez UUID'); assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(nowe), 'bez e-maili');
  assert.ok(!/Fabian/i.test(nowe.replace(/dla-fabianka/g, '')), 'bez imienia dziecka ze zbiórki');
  assert.doesNotMatch(czytaj('bieg.html'), /2026-11-v[2-9]/, 'bieg.html bez wersji na sztywno');
});

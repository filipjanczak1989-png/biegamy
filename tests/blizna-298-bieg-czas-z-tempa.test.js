/* BLIZNA 298 / 18.11 noc: bieg jest na 5 km, więc lista, ranking i dyplom pokazują CZAS NA 5 KM (decyzja Filipa, regulamin 2026-11-v5, migracja 20261214).
   Trening 5,00–5,49 km: czas treningu; 5,50–10,49 km: tempo × 5 zaokrąglone do sekundy, w rankingu Z MIEJSCEM i z dopiskiem „z tempa”; dłuższy: ukończenie
   i dyplom „5 km · ukończone” bez czasu, flaga w panelu. Dyplom: czas z tempa bez względu na zgodę. Automat: najlepszy czas na 5 km spośród 5,00–10,49 km,
   wskazanie zawodnika ma pierwszeństwo. Wszystko TYLKO przy v5 w bazie (dane: noc-1311\prawdziwy\34g-regulamin-v5.sql); v4 jak po 20261213. */
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
  koniec_at: '2026-12-06T19:00:00+00:00', dystanse_km: [5], faza: 'trwa', regulamin_wersja: w, regulamin_od: '2026-11-18' }, x || {});
const LICZNIK = { imie: 'Fabianek' }, LINK = 'https://example.org/zbiorka';
const JA = (x) => Object.assign({ id: 'u1', rodzaj: 'ja', imie: 'Anna', numer: 1, dystans_km: 5, wynik_dystans_km: 5, ukonczony_at: '2026-11-18T20:00:00Z', odznaka: 'zwykla' }, x || {});
const Z_TEMPA = JA({ wynik_trening_km: 10.01, wynik_s: 2946, czas_biegu_s: 1472, z_tempa: true });
const ZA_DLUGI = JA({ wynik_trening_km: 12, wynik_s: 3480, czas_biegu_s: null, z_tempa: false });
const W_ZAKRESIE = JA({ wynik_trening_km: 5.2, wynik_s: 1560, czas_biegu_s: 1560, z_tempa: false });

const P5 = '5. Bieg nie ma nagród. Ranking czasów na 5 km obejmuje wyłącznie pełnoletnich uczestników, którzy zgodzili się na udział w rankingu. W rankingu są wyniki z zegarka i wpisane ręcznie. Wynik budzący wątpliwości (np. tempo szybsze niż 3:00/km) trafia do rankingu po sprawdzeniu przez Organizatora, który może poprosić o dowód (np. zapis z zegarka, zrzut z aplikacji). W rankingu liczy się czas na 5 km: przy treningu od 5 km do 5,49 km jest to czas treningu, a przy treningu od 5,50 km do 10,49 km czas wyliczony ze średniego tempa (tempo × 5 km), oznaczony dopiskiem „z tempa”. Ten sam czas jest na dyplomie. Trening dłuższy niż 10,49 km daje ukończenie i dyplom bez czasu, poza rankingiem. Czas uczestników bez zgody na ranking nie jest publikowany. Dzieci nigdy nie są w rankingu.';
const P8 = '1. Na stronie biegu widoczne są liczby zbiorcze oraz lista osób, które ukończyły: imię, numer startowy i dystans. Imię pojawia się tylko za zgodą uczestnika, a imię dziecka tylko za zgodą rodzica. U osób, które zgodziły się na ranking, lista pokazuje także czas na 5 km i miejsce na zasadach z § 5 ust. 5; czas wyliczony z tempa ma dopisek „z tempa”. Przy wyniku wpisanym ręcznie lista pokazuje dopisek „wynik ręczny”. Zgodę na ranking można wycofać w aplikacji w każdej chwili.';
const ZMIANA_V5 = 'przy treningu od 5,50 do 10,49 km w rankingu i na dyplomie liczy się czas na 5 km wyliczony z tempa (dopisek „z tempa”)';

test('v5 (od v6: blizna-303) różni się od v4 tylko § 5 ust. 5 i § 8 ust. 1 (i linią wersji), słowo w słowo jak zatwierdzone 18.11', () => {
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v6'); assert.ok(B.WERSJE_TEKSTOW.includes('2026-11-v4') && B.WERSJE_TEKSTOW.includes('2026-11-v2'), 'v4 i v2 (bieg próbny) dalej przyjmowane');
  const w5 = B.wartosciTekstow(BIEG('2026-11-v5'), LICZNIK, LINK); assert.ok(w5);
  assert.deepEqual([w5.czas_na, w5.tempo_razy, w5.zakres_z_tempa, w5.limit_z_tempa], ['na 5 km', 'tempo × 5 km', 'od 5,50 km do 10,49 km', '10,49 km'], 'liczby z dystansu biegu w bazie');
  const t4 = B.regulaminBloki(B.wartosciTekstow(BIEG('2026-11-v4'), LICZNIK, LINK)).map((b) => b.tekst), t5 = B.regulaminBloki(w5).map((b) => b.tekst);
  assert.equal(t4.length, t5.length);
  const rozne = t4.map((x, i) => (x === t5[i] ? null : i)).filter((i) => i !== null);
  assert.equal(rozne.length, 3, 'trzy bloki: § 5 ust. 5, § 8 ust. 1, wersja');
  assert.equal(t5[rozne[0]], P5); assert.equal(t5[rozne[1]], P8);
  assert.equal(t5[rozne[2]], t4[rozne[2]].replace('2026-11-v4', '2026-11-v5'));
  assert.equal(t5[rozne[0] - 5], '§ 5. Wynik i ukończenie'); assert.ok(t5.slice(0, rozne[1]).lastIndexOf('§ 8. Lista osób, które ukończyły, i dane osobowe') === rozne[1] - 1);
  assert.ok(B.regulaminTekst(w5).includes('oznaczony dopiskiem „z tempa”'), 'plik .txt z tymi samymi tekstami');
  const w10 = B.znacznikiZTempa([5, 10]);
  assert.equal(w10.zakres_z_tempa, 'od 5,50 km do 10,49 km albo od 10,50 km do 20,49 km'); assert.equal(w10.czas_na, 'na dystansie biegu');
});

test('komunikat zmiany (§ 12 ust. 2) przy v5: zdanie o czasie z tempa zastępuje zmianę z v4; v2 dostaje też koniec 20:00', () => {
  const K = (w, moi) => B.komunikatZmiany(BIEG(w), moi);
  assert.equal(K('2026-11-v5', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v4' }]), 'Zmiana regulaminu: ' + ZMIANA_V5 + '.');
  assert.equal(K('2026-11-v5', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v3' }]), 'Zmiana regulaminu: ' + ZMIANA_V5 + '.', 'v3: bez zdania z v4 (czas bez miejsca), bo v5 je zastępuje');
  assert.equal(K('2026-11-v5', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v2' }]), 'Zmiana regulaminu: bieg i wyniki kończą się 6.12 o 20:00; ' + ZMIANA_V5 + '.');
  assert.equal(K('2026-11-v5', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v5' }]), '');
  assert.equal(K('2026-11-v4', [{ rodzaj: 'ja', regulamin_wersja: '2026-11-v3' }]), 'Zmiana regulaminu: przy dłuższym treningu osoby ze zgodą na ranking są na liście z prawdziwym dystansem i czasem, bez miejsca.', 'v4 w bazie (przed 34g): jak dotąd');
  assert.match(B.tekstyDystansow(BIEG('2026-11-v5')).czasy_prywatne, /z treningu od 5 km do 5,49 km; przy treningu od 5,50 km do 10,49 km czas na 5 km z tempa \(z dopiskiem „z tempa”\)\. Wynik budzący/);
  assert.match(B.tekstyDystansow(BIEG('2026-11-v4')).czasy_prywatne, /przy dłuższym treningu lista pokazuje prawdziwy dystans i czas, bez miejsca/, 'v4: opis listy jak dotąd');
});

test('karta i dyplom: „5 km · 24:32 (z tempa)”, „5 km · ukończone”, pod spodem prawdziwy trening; przed migracją albo przy v4 jak dotąd', () => {
  const v5 = BIEG('2026-11-v5'), v4 = BIEG('2026-11-v4');
  assert.equal(B.wynikOpis(Z_TEMPA, v5), '5 km · 24:32 (z tempa)'); assert.equal(B.wynikOpis(ZA_DLUGI, v5), '5 km · ukończone');
  assert.equal(B.wynikOpis(W_ZAKRESIE, v5), '5,2 km · 26:00 · 5:00 /km', '5,00–5,49 km: jak dotąd');
  assert.equal(B.wynikOpis(Z_TEMPA, v4), '10,01 km · 49:06 · 4:54 /km', 'v4: prawdziwy dystans i czas');
  const { czas_biegu_s, z_tempa, ...przedMigracja } = Z_TEMPA;
  assert.equal(B.wynikOpis(przedMigracja, v5), '10,01 km · 49:06 · 4:54 /km', 'v5 w bazie, migracja jeszcze nie: jak dotąd'); assert.equal(B.wynikOpis(Z_TEMPA), '10,01 km · 49:06 · 4:54 /km', 'bez biegu: jak dotąd');
  assert.deepEqual(B.wynikNaDystans(Z_TEMPA, v5), { km: 5, s: 1472, z_tempa: true }); assert.deepEqual(B.wynikNaDystans(ZA_DLUGI, v5), { km: 5, s: 0, z_tempa: false });
  assert.equal(B.wynikNaDystans(W_ZAKRESIE, v5), null); assert.equal(B.wynikNaDystans(Z_TEMPA, v4), null); assert.equal(B.wynikNaDystans(JA({ rodzaj: 'dziecko', czas_biegu_s: null }), v5), null);
  assert.equal(B.zaDlugiDoRankingu(Z_TEMPA, v5), false); assert.equal(B.zaDlugiDoRankingu(ZA_DLUGI, v5), true); assert.equal(B.zaDlugiDoRankingu(Z_TEMPA, v4), true);
  assert.equal(B.zaDlugiDoRankingu(JA({ wynik_trening_km: 10.49, czas_biegu_s: 1 }), v5), false); assert.equal(B.zaDlugiDoRankingu(JA({ wynik_trening_km: 10.5, czas_biegu_s: null }), v5), true);
  const h = B.wynikHtml(Z_TEMPA, v5);
  assert.match(h, /Ukończony: <b>5 km · 24:32 \(z tempa\)<\/b>/); assert.match(h, /<p class="bw-drobne" data-wynik-trening>Trening: 10,01 km · 49:06<\/p>/); assert.doesNotMatch(h, /data-wynik-za-dlugi/);
  const h2 = B.wynikHtml(ZA_DLUGI, v5);
  assert.match(h2, /5 km · ukończone/); assert.match(h2, /Trening: 12 km · 58:00/);
  assert.match(h2, /data-wynik-za-dlugi>Trening dłuższy niż 10,49 km: masz ukończenie i dyplom bez czasu, na liście też jesteś bez czasu\. Czas na 5 km \(także z tempa\) liczy się z treningu do 10,49 km\./);
  assert.doesNotMatch(B.wynikHtml(W_ZAKRESIE, v5), /data-wynik-trening|data-wynik-za-dlugi/);
  assert.match(B.wynikHtml(Z_TEMPA, v4), /data-wynik-za-dlugi>Trening dłuższy niż 5,49 km/, 'v4 jak dotąd');
  assert.notEqual(B.podpisDyplomu(Z_TEMPA, v5), B.podpisDyplomu(przedMigracja, v5), 'dyplom rysuje się na nowo po migracji');
  assert.notEqual(B.podpisDyplomu(Z_TEMPA, v5), B.podpisDyplomu(Z_TEMPA, v4), 'i po zmianie wersji biegu');
  const src = czytaj('js/bieg.mjs'), dy = src.slice(src.indexOf('function dyplom('), src.indexOf('/** ODZNAKA jako SVG'));
  assert.match(dy, /w5 = dziecko \? null : wynikNaDystans\(u, bieg\)/); assert.match(dy, /if \(w5\) \{ dyst = w5\.km; s = w5\.s; \}/); assert.match(dy, /w5 && w5\.z_tempa \? "czas z tempa" : "czas"/);
});

test('lista „ukończyli”: czas z tempa z miejscem i dopiskiem „z tempa” (obok „wynik ręczny”)', () => {
  const h = B.ukonczyliHtml({ razem: 3, lista: [{ numer: 1, imie: 'Damian', dystans_km: 5, czas_s: 1472, miejsce: 1, z_tempa: true, reczny: false },
    { numer: 7, imie: 'Filip', dystans_km: 5, czas_s: 1665, miejsce: 2, z_tempa: true, reczny: true }, { numer: 3, imie: null, dystans_km: 5, czas_s: 1560, miejsce: 3 }] }, []);
  assert.match(h, /aria-label="miejsce 1">1\.<\/span><span class="bw-nr">1<\/span><span class="bw-imie">Damian<\/span><span class="bw-dyst"><b class="bw-czas">24:32<\/b> · 5 km · <small class="bw-z-tempa">z tempa<\/small><\/span>/);
  assert.match(h, /<b class="bw-czas">27:45<\/b> · 5 km · <small class="bw-z-tempa">z tempa<\/small> · <small class="bw-reczny">wynik ręczny<\/small>/);
  assert.equal((h.match(/bw-z-tempa/g) || []).length, 2, 'bez dopisku przy czasie treningu 5,00–5,49 km');
  assert.doesNotMatch(B.wierszUkonczyl({ numer: 4, dystans_km: 5, z_tempa: true }, false, true), /z tempa/, 'bez czasu bez dopisku');
});

test('baza (20261214): czas z tempa tylko przy v5, czas bez miejsca tylko przy v4; kotwice jednoliniowe, wycofanie odwraca, testy i plik danych na miejscu', () => {
  const m = czytaj('supabase/migrations/20261214_akcja_bieg_czas_z_tempa.sql'), w = czytaj('supabase/migrations/20261214_WYCOFANIE_akcja_bieg_czas_z_tempa.sql');
  assert.match(m, /when p_z_tempa and p_km <= 2 \* p_d \+ 0\.49 then round\(p_s \* p_d \/ p_km\)::integer end;/, 'tempo × 5 zaokrąglone do sekundy, do 10,49 km');
  assert.ok(m.includes('public.akcja_bieg_czas_na_dystans(u.wynik_s, public.akcja_bieg_km_wyniku(u), u.wynik_dystans_km, public.akcja_bieg_wersja_od(b.regulamin_wersja, 5))'), 'z tempa tylko przy v5');
  assert.ok(m.includes('$k$and public.akcja_bieg_wersja_od(b.regulamin_wersja, 4) and not public.akcja_bieg_wersja_od(b.regulamin_wersja, 5)$k$'), 'czas bez miejsca (20261213) tylko przy v4');
  assert.ok(m.includes("$k$then public.akcja_bieg_czas_biegu(u, b) end;$k$"), 'ranking liczy czas na 5 km'); assert.match(m, /'czas_biegu_s', public\.akcja_bieg_czas_biegu\(u, b\), 'z_tempa', public\.akcja_bieg_z_tempa\(u, b\)/, 'dyplom bez względu na zgodę');
  assert.match(m, / km: bez czasu w rankingu/); assert.doesNotMatch(m, /security definer/i, 'nowe funkcje bez security definer (wołają je funkcje z definer)');
  const trojki = (s) => [...s.matchAll(/\(\d+, '(public\.[a-z_]+\([^']*\))',\n\s*\$k\$(.*?)\$k\$,\n\s*\$k\$(.*?)\$k\$\)/g)].map((x) => [x[1], x[2], x[3]]);
  const tm = trojki(m), tw = trojki(w);
  assert.equal(tm.length, 11); assert.deepEqual(tw, [...tm].reverse().map(([f, a, b]) => [f, b, a]), 'wycofanie odwraca każdą kotwicę w odwrotnej kolejności');
  const R = 're' + 'voke', D = 'dr' + 'op function';
  for (const f of ['public.akcja_bieg_wersja_od(text, integer)', 'public.akcja_bieg_czas_na_dystans(integer, numeric, integer, boolean)', 'public.akcja_bieg_gorna_rankingu(public.akcja_bieg_uczestnicy)',
    'public.akcja_bieg_czas_biegu(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'public.akcja_bieg_z_tempa(public.akcja_bieg_uczestnicy, public.akcja_biegi)']) {
    assert.ok(m.includes(R + ' all on function ' + f + ' from public, anon, authenticated;'), f); assert.ok(w.includes(D + ' ' + f + ';'), 'wycofanie usuwa ' + f);
  }
  assert.match(m, /34g-regulamin-v5\.sql/);
  const sh = czytaj('tools/akcja-bieg-czas-z-tempa-test.sh'), sq = czytaj('tools/akcja-bieg-czas-z-tempa-test.sql');
  assert.match(sh, /AKCJA_BIEG_TEMPO_Z_MIGRACJA/); assert.match(sh, /_licznik_przed/); assert.match(sq, /raise exception 'TESTY CZASU Z TEMPA ZIELONE: % sprawdzeń', n;/);
  assert.doesNotMatch(sq, /perform public\.akcja_bieg_automat\(\)/, 'test na produkcji nie woła automatu (przechodzi po prawdziwym biegu)');
  const nowe = [m, w, sh, sq].join('\n');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(nowe), 'bez UUID'); assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(nowe), 'bez e-maili');
  assert.ok(!/Fabian/i.test(nowe.replace(/dla-fabianka/g, '')), 'bez imienia dziecka ze zbiórki');
  assert.doesNotMatch(czytaj('bieg.html'), /2026-11-v[2-9]/, 'bieg.html bez wersji na sztywno');
  assert.match(czytaj('js/bieg-panel.mjs'), /trening dłuższy niż maraton od regulaminu v6/, 'opis flag w panelu = próg w bazie (v6: blizna-303)');
  assert.doesNotMatch(czytaj('js/bieg-panel.mjs'), /Czasy są prywatne: panel ich nie pokazuje/, 'panel pokazuje wynik od 20261213');
});

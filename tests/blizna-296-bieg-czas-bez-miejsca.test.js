/* BLIZNA 296 / 18.11 wieczór: na prawdziwym biegu dwie osoby ze zgodą na ranking były na liście „ukończyli” bez czasu, bo trening był dłuższy niż 5,49 km
   (odczyt 18.11 20:30: nr 1 zegarek 10,01 km, nr 7 wpis ręczny 6 km). Decyzja Filipa (migracja 20261213):
   - lista: ze zgodą i treningiem dłuższym niż dystans + 0,49 km — prawdziwy dystans i czas („10,2 km · 52:10”), BEZ miejsca; miejsca tylko 5,00–5,49 km; bez zgody bez czasu;
     pod listą jedno zdanie zachęty do rankingu;
   - panel organizatora: dystans treningu, czas, tempo i źródło (zegarek / wpis ręczny / organizator) — tylko w RPC panelu.
   Regulamin v3 (§ 5 ust. 5, § 9 ust. 1) nie zmieniony; tekst do decyzji Filipa. Skutek w bazie: tools/akcja-bieg-czas-bez-miejsca-test.sh (flaga AKCJA_BIEG_CZAS_Z_MIGRACJA=1). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = czytaj('supabase/migrations/20261213_akcja_bieg_czas_bez_miejsca.sql'), WYC = czytaj('supabase/migrations/20261213_WYCOFANIE_akcja_bieg_czas_bez_miejsca.sql');
const RV = 're' + 'voke all on function public.', DR = 'dr' + 'op function public.';
let B, P;
test.before(async () => {
  globalThis.escapeHtml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href); B = globalThis.BM_BIEG_REAL;
  const pk = czytaj('js/bieg-panel.mjs'), wytnij = (n) => { const i = pk.indexOf('  function ' + n + '('); return pk.slice(i, pk.indexOf('\n  function ', i + 10)); };
  P = new Function(wytnij('km') + '\n' + wytnij('czasPl') + '\n' + wytnij('szczegolyWyniku') + '\n return { szczegolyWyniku: szczegolyWyniku };')();   // moduł panelu potrzebuje DOM przy ładowaniu
});

test('migracja: czas bez miejsca na tych samych warunkach co ranking (zgoda, pełnoletni, weryfikacja), tylko dłuższy trening; panel z wynikiem i źródłem', () => {
  const f = MIG.slice(MIG.indexOf('create function public.akcja_bieg_czas_bez_miejsca'), MIG.indexOf('create function public.akcja_bieg_zrodlo_wyniku'));
  for (const w of ["u.rodzaj = 'ja' and u.ranking_zgoda_at is not null", 'public.akcja_bieg_km_wyniku(u) > u.wynik_dystans_km + 0.49', "coalesce(u.weryfikacja = 'zatwierdzony', not public.akcja_bieg_do_weryfikacji(u))", 'not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)']) assert.ok(f.includes(w), w);
  assert.ok(MIG.includes("when p.czas_bez_miejsca is not null then jsonb_build_object('czas_s', p.czas_bez_miejsca, 'trening_km', round(p.km_treningu, 2))"), 'bez klucza miejsce');
  assert.ok(MIG.includes("'zrodlo', public.akcja_bieg_zrodlo_wyniku(u)) order by u.numer)$k$"), 'panel');
  for (const x of ['akcja_bieg_czas_bez_miejsca(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'akcja_bieg_zrodlo_wyniku(public.akcja_bieg_uczestnicy)']) { assert.ok(MIG.includes(RV + x + ' from public, anon, authenticated;'), x); assert.ok(WYC.includes(DR + x + ';'), x); }
  assert.ok(MIG.includes('REGULAMIN: v3 (§ 5 ust. 5, § 8 ust. 1)')); assert.ok(MIG.includes("and b.regulamin_wersja is not null and b.regulamin_wersja not in ('2026-11-v1', '2026-11-v2', '2026-11-v3')"), 'czas bez miejsca tylko przy v4');
  for (const k of [...MIG.matchAll(/\$k\$([^$]*)\$k\$/g)].map((x) => x[1])) assert.doesNotMatch(k, /\n/, 'kotwice jednoliniowe');
});

test('lista: dłuższy trening ze zgodą = „10,2 km · 52:10” bez miejsca; ranking i wiersz bez czasu jak dotąd', () => {
  const t = (u, kol) => B.wierszUkonczyl(u, false, kol).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
  assert.equal(t({ numer: 2, imie: 'Bogna', dystans_km: 5, czas_s: 3130, trening_km: 10.2, reczny: true }), '|2|Bogna|10,2 km · 52:10 · |wynik ręczny|');
  assert.equal(t({ numer: 1, imie: 'Ola', dystans_km: 5, czas_s: 2945, trening_km: 10.01 }), '|1|Ola|10 km · 49:05|');
  assert.doesNotMatch(B.wierszUkonczyl({ numer: 2, imie: 'B', dystans_km: 5, czas_s: 3130, trening_km: 10.2 }, false, true), /aria-label="miejsce/, 'bez miejsca także w liście z kolumną miejsc');
  assert.match(B.wierszUkonczyl({ numer: 1, imie: 'A', dystans_km: 5, czas_s: 1560, miejsce: 1 }, false), /miejsce 1.*<b class="bw-czas">26:00<\/b> · 5 km/);
  assert.equal(t({ numer: 3, imie: 'C', dystans_km: 5 }), '|3|C|5 km|');
  assert.equal(t({ numer: 5, imie: 'Zosia', dystans_km: 1, dziecko: true, czas_s: 600, trening_km: 1 }).includes('10:00'), false, 'dziecko nigdy z czasem');
});

test('strona: tekst o rankingu pod listą zgodny z nową regułą; zdanie zachęty pod listą', () => {
  const s = B.tekstyDystansow({ slug: 'b', nazwa: 'Bieg', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06', dystanse_km: [5], faza: 'trwa' }).czasy_prywatne;
  assert.doesNotMatch(B.tekstyDystansow(null).czasy_prywatne, /przy dłuższym treningu/, 'bez biegu (bez zakresu) bez zdania o dłuższym treningu');
  assert.match(s, /przy dłuższym treningu lista pokazuje prawdziwy dystans i czas, bez miejsca\./); assert.match(s, /Bez zgody na ranking czasu na liście nie ma, jest na dyplomie\./);
  assert.doesNotMatch(s, /Pozostali są na liście bez czasu/);
  const h = czytaj('bieg.html');
  assert.match(h, /<div id="bw-ukonczyli"><\/div>\n[^\n]*\n    <p class="bw-drobne" id="bw-ranking-zacheta">Chcesz mieć swój czas na liście\? Zaznacz „Pokaż mnie w rankingu” przy swoim numerze\.<\/p>/);
});

test('panel organizatora: dystans treningu, czas, tempo i źródło; dziecko i brak wyniku bez szczegółów', () => {
  assert.equal(P.szczegolyWyniku({ rodzaj: 'ja', ukonczony: true, trening_km: 10.01, wynik_s: 2945, zrodlo: 'zegarek' }), '10,01 km · 49:05 · 4:54/km · zegarek');
  assert.equal(P.szczegolyWyniku({ rodzaj: 'ja', ukonczony: true, trening_km: 6, wynik_s: 1998, zrodlo: 'wpis ręczny' }), '6 km · 33:18 · 5:33/km · wpis ręczny');
  assert.equal(P.szczegolyWyniku({ rodzaj: 'ja', ukonczony: true, trening_km: 5, wynik_s: null, zrodlo: 'organizator' }), '5 km · zaliczone przez organizatora');
  assert.equal(P.szczegolyWyniku({ rodzaj: 'ja', ukonczony: true, trening_km: 5, wynik_s: 3700, zrodlo: '<b>' }), '5 km · 1:01:40 · 12:20/km');
  for (const u of [{ rodzaj: 'dziecko', ukonczony: true }, { rodzaj: 'ja', ukonczony: false }, { rodzaj: 'ja', ukonczony: true, wycofany: true, trening_km: 5, wynik_s: 1500 }, null]) assert.equal(P.szczegolyWyniku(u), '');
  const pk = czytaj('js/bieg-panel.mjs');
  assert.match(pk, /var sz = szczegolyWyniku\(x\);\n\s+if \(sz\) \{ var sze = el\("div", [^,]+, srodek, sz\); sze\.setAttribute\("data-wynik-szczegoly", "1"\); \}/, 'textContent przez el(), nie innerHTML');
});

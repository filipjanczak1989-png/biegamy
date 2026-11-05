/* BLIZNA 164 / POZIOMY GRY (Filip 4.11, pkt 1–8 fabuły): poziom z łącznych cegieł to trudność i wartość cegły.
   - tempo +4% za poziom z sufitem +70%, w rundzie co 15 s +8%; mnożnik 1 + 0,05 × poziom z sufitem ×2, ten sam w grze i na serwerze;
   - serwer: limit 45/s × mnożnik poziomu rundy, poziom ponad konto = podejrzana (po skutku: tools/gra-poziomy-test.sql);
   - pary przeszkód zawsze do przejścia, cegły zawsze w zasięgu postaci;
   - Mały budowniczy: bez przyspieszania, bez poziomów, zawsze łatwo. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;
const POSTACIE = ['kasia', 'filip', 'rowerzysta', 'koparka'];
const MIG = 'supabase/migrations/20261106_gra_poziomy.sql', WYC = 'supabase/migrations/20261106_WYCOFANIE_gra_poziomy.sql';

test('poziom z łącznych cegieł, progi Filipa 5.11, bez konta na urządzeniu', () => {
  assert.equal(L.poziom(0), 1); assert.equal(L.poziom(99), 1); assert.equal(L.poziom(100), 2); assert.equal(L.poziom(699), 3); assert.equal(L.poziom(700), 4); assert.equal(L.poziom(10399), 9); assert.equal(L.poziom(10400), 10); assert.equal(L.poziom(52200), 20); assert.equal(L.poziom(9e9), 20);
  assert.ok(L.POZIOMY[3] <= 5 * 150, 'trzy awanse w 5 rundach także przy 150 cegłach na rundę');
  assert.equal(L.POSTACIE.rowerzysta.poziom, 10); assert.equal(L.POSTACIE.koparka.poziom, 20);
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /stan\.cegly \+= w\.cegly; if \(!przyklad\) zapiszJson\("cegielki_suma", stan\.cegly\)/, 'bez konta suma cegieł na urządzeniu');
  assert.match(k, /stan\.cegly = po && !po\.error && po\.data && typeof po\.data\.cegly === "number" \? po\.data\.cegly : 0;/, 'z kontem poziom z serwera, bez odpowiedzi poziom 1, nie suma z urządzenia');
  assert.match(k, /poziom: poziomGracza/);
});

test('tempo: +4% za poziom, sufit +70%; w rundzie co 15 s +8%', () => {
  assert.equal(L.tempoPoziomu(1), 1); assert.ok(Math.abs(L.tempoPoziomu(2) - 1.04) < 1e-9); assert.ok(Math.abs(L.tempoPoziomu(10) - 1.36) < 1e-9);
  assert.equal(L.tempoPoziomu(19), 1.7); assert.equal(L.tempoPoziomu(20), 1.7); assert.equal(L.tempoPoziomu(40), 1.7);
  assert.deepEqual([0, 14.9, 15, 30, 45, 59.9].map((t) => L.krokiTempa(t, false)), [0, 0, 1, 2, 3, 3]);
  assert.equal(L.tempoRundy(14, false), 1); assert.ok(Math.abs(L.tempoRundy(15, false) - 1.08) < 1e-9); assert.ok(Math.abs(L.tempoRundy(30, false) - 1.1664) < 1e-9);
  const s = czytaj('js/cegielki.js');
  assert.match(s, /g\.predBaza = PRED_START \* g\.plan\.tempo \* L\.tempoRundy\(g\.t, g\.maly\) \* \(g\.maly \? L\.MALY_TEMPO : 1\) \* \(cechy\(\)\.tempo \|\| 1\);/);
  assert.doesNotMatch(s, /PRED_KONIEC/, 'bez starego płynnego przyspieszania');
  assert.match(s, /dodajNapis\("Szybciej!"/); assert.match(s, /D\.graj\("szybciej"\)/); assert.match(s, /navigator\.vibrate\(30\)/); assert.match(s, /g\.drganie = 0\.22/);
  assert.match(s, /prefers-reduced-motion: reduce/, 'drgnięcie szanuje ustawienie systemu');
});

test('punkty: mnożnik i sufit w grze i na serwerze te same; limit 45 cegieł/s, w punktach razy mnożnik; punkty liczy serwer', () => {
  assert.deepEqual([1, 2, 5, 10, 19, 20, 30].map(L.mnoznikPoziomu), [1, 1.17, 1.68, 2.53, 4.06, 4.23, 4.23]);
  for (let n = 2; n <= 20; n++) assert.ok(L.mnoznikPoziomu(n) > L.mnoznikPoziomu(n - 1), 'poziom ' + n);
  assert.equal(L.punktyRundy(200, 1), 200, 'poziom 1 bez zmian'); assert.equal(L.punktyRundy(133, 20), 563); assert.equal(L.punktyRundy(0, 20), 0); assert.equal(L.punktyRundy(50, 2), 59, 'zaokrąglenie jak na serwerze: 58,5 w górę');
  assert.equal(L.limitCegiel(60), 2700); assert.equal(L.limitPunktow(1, 60), 2700); assert.equal(L.limitPunktow(10, 60), 6831); assert.equal(L.limitPunktow(20, 60), 11421);
  const m = czytaj(MIG);
  assert.match(m, /GRA_MAKS_NA_S constant numeric := 45;/);
  assert.match(m, /select least\(4\.23, 1 \+ 0\.17 \* \(greatest\(coalesce\(p_poziom, 1\), 1\) - 1\)\)/);
  assert.match(m, /when v_poziom_st > v_poziom then 'poziom_ponad_konto'/);
  assert.match(m, /when p_cegly > GRA_MAKS_NA_S \* p_czas then 'ponad_pulap'/);
  assert.match(m, /v_punkty := round\(p_cegly \* public\.gra_mnoznik_poziomu\(least\(coalesce\(v_poziom_st::integer, v_poziom\), v_poziom\)\)\);/, 'punkty z poziomu rundy, wyższa deklaracja nic nie daje');
  assert.match(m, /insert into public\.gra_rundy \(athlete_id, ulepszenie, poziom\)/);
  assert.match(m, /'mur',\s+public\.gra_mur\(\)/); assert.match(m, /as \$\$ select \(select coalesce\(sum\(w\.cegly\), 0\) from public\.gra_wyniki w\)::bigint/, 'mur liczy zebrane cegły, nie punkty');
  assert.match(m, /group by w\.athlete_id having max\(w\.punkty\) > m\.punkty/, 'miejsce po punktach');
  assert.match(m, /order by w\.athlete_id, w\.punkty desc, w\.kiedy/, 'ranking po punktach');
  assert.match(m, /or public\.gra_mur\(\) >= 1250000\b/, 'koparka za mur w cegłach'); assert.match(m, /'mur_cel', 1250000,/, '100 cegieł na km akcji'); assert.doesNotMatch(m, /sum\(w\.punkty\)[^\n]*12500000/);
  assert.doesNotMatch(m, /create or replace function public\.gra_zapisz_wynik\(p_runda uuid, p_postac text, p_cegly integer, p_czas numeric, p_st jsonb, /, 'sygnatura bez zmian: front i baza w dowolnej kolejności');
  const s = czytaj('js/cegielki.js');
  assert.match(s, /g\.punkty = L\.punktyRundy\(g\.cegly, g\.poziom\);/);
  assert.match(s, /cegly: g\.cegly, punkty: g\.punkty,/);
  assert.match(s, /tekst\(String\(g\.cegly\), m \+ 54/, 'na ekranie rundy zebrane cegły'); assert.match(s, /if \(!g\.maly\) tekst\(wynikTeraz \+ " pkt"/, 'i osobno punkty');
  const h = czytaj('gra-cegielki.html'); assert.match(h, /id="k-punkty"/); assert.match(h, /<b id="k-cegly">0<\/b>cegły/);
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /p_cegly: w\.cegly,/, 'do serwera zebrane cegły, nie punkty'); assert.match(k, /bidony: w\.st\.bidony, poziom: w\.poziom \}/);
  assert.match(k, /w\.punkty != null \? w\.punkty : w\.cegly/, 'ranking pokazuje punkty');
  assert.equal(L.tekstMuru(5, 10), 'Wspólny mur: 5 z 10 cegieł'); assert.match(k, /\|\| 0\) \+ " pkt"; \};/, 'ranking w pkt');
  assert.deepEqual([1, 2, 5, 12, 22].map(L.odmianaPunktow), ['punkt', 'punkty', 'punktów', 'punktów', 'punkty']);
  const w = czytaj(WYC);
  assert.match(w, /GRA_MAKS_NA_S constant numeric := 40;/, 'wycofanie przywraca stary pułap');
  assert.match(w, /drop column if exists poziom/); assert.match(w, /drop column if exists punkty/); assert.match(w, /20000, 28000/, 'stare progi');
  assert.doesNotMatch(czytaj('tools/gra-poziomy-test.sh'), /db push/);
});

test('z poziomu na poziom trudniej: gęściej, w parach, wyżej; złote i kaski rzadziej', () => {
  const a = L.planPoziomu(1), b = L.planPoziomu(10), c = L.planPoziomu(20);
  assert.equal(a.para, 0, 'pierwsze poziomy bez par');
  assert.ok(a.odstep > b.odstep && b.odstep > c.odstep);
  assert.ok(b.para < c.para && c.para > 0.3);
  assert.ok(a.luk > c.luk && a.rzad > c.rzad);
  assert.equal(a.rzadWysoko, 0); assert.equal(a.lukSalto, 0); assert.ok(c.rzadSalto > 0 && c.lukSalto > 0);
  assert.ok(a.zlota > c.zlota); assert.equal(c.zlotaNaZiemi, 0); assert.ok(a.zlotaNaZiemi > 0); assert.ok(c.zlotaPara > 0);
  assert.equal(a.kaski, 2); assert.equal(c.kaski, 1); assert.ok(a.pierwszyKask && !c.pierwszyKask); assert.ok(c.odstepBonusu > a.odstepBonusu);
  assert.equal(L.kolejkaBonusow(a).filter((x) => x === 'kask').length, 2); assert.equal(L.kolejkaBonusow(c).filter((x) => x === 'kask').length, 1);
  assert.deepEqual(L.PARY, [['pacholek', 'barierka'], ['kamien', 'kaluza']]);
});

test('cegły zawsze w zasięgu postaci, na każdym poziomie', () => {
  for (const p of POSTACIE) for (let n = 1; n <= 20; n++) {
    const z = L.zasiegPostaci(p), plan = L.planPoziomu(n);
    for (const los of [0, 0.1, 0.3, 0.5, 0.7, 0.99]) {
      assert.ok(L.wysokoscRzedu(p, plan, los) <= z.maks, p + ' rząd poziom ' + n);
      for (let i = -2; i <= 2; i++) assert.ok(L.wysokoscLuku(p, i, plan, los) <= z.maks, p + ' łuk poziom ' + n);
    }
  }
  assert.equal(L.wysokoscRzedu('kasia', L.planPoziomu(1), 0.5), 44, 'poziom 1: rząd przy ziemi');
});

test('pary zawsze do przejścia: kałuża tuż za kamieniem tylko, gdy skok nad oboma się mieści', () => {
  const F = L.FIZYKA;
  for (const p of ['kasia', 'filip', 'rowerzysta']) for (const v of [300, 350, 400, 450, 500, 560, 640]) {
    const c = L.POSTACIE[p], v0 = F.SKOK * (c.skok || 1), lot = 2 * v0 / F.GRAW;
    const d = L.odstepPary(['kamien', 'kaluza'], p, v);
    if (d === 104) {
      const czas = (x) => (v0 + Math.sqrt(v0 * v0 - 2 * F.GRAW * x)) / F.GRAW, od = (v0 - Math.sqrt(v0 * v0 - 2 * F.GRAW * 50)) / F.GRAW;
      assert.ok((czas(8) - od) * v >= 64 + d + 74, p + ' v=' + v + ': jeden skok nad kamieniem i kałużą');
    } else assert.ok(d >= v * lot + 22, p + ' v=' + v + ': lądowanie przed kałużą');
    assert.ok(L.odstepPary(['pacholek', 'barierka'], p, v) >= v * lot + 22, p + ' v=' + v + ': lądowanie między pachołkiem a barierką');
  }
});

test('Mały budowniczy: bez przyspieszania, bez poziomów, stare progi serii', () => {
  assert.equal(L.tempoPoziomu(0), 1); assert.equal(L.mnoznikPoziomu(0), 1); assert.equal(L.punktyRundy(123, 0), 123);
  assert.equal(L.krokiTempa(45, true), 0); assert.equal(L.tempoRundy(45, true), 1);
  const p = L.planPoziomu(0);
  assert.equal(p.para, 0); assert.equal(p.odstep, 1); assert.equal(p.rzadWysoko, 0); assert.equal(p.lukSalto, 0); assert.equal(p.kaski, 2);
  assert.deepEqual([L.mnoznikSerii(4, true, 20), L.mnoznikSerii(5, true, 20), L.mnoznikSerii(12, true, 20)], [1, 2, 3], 'poziom gracza nie ma wpływu');
  const s = czytaj('js/cegielki.js');
  assert.match(s, /if \(trybMaly\) return 0;/);
  assert.match(s, /post = G\.maly \? 0 : postepRundy\(\)/, 'odstępy też bez przyspieszania');
  assert.match(s, /var K = window\.BM_CEGIELKI_KONTO, n = poziomRundy\(\), e = \$\("przed"\);\s+if \(!e \|\| !n \|\|/, 'bez ekranu poziomu');
  assert.match(czytaj('js/cegielki-konto.js'), /if \(w\.maly\) \{ await odswiezRanking\(\); return; \}/, 'bez zapisu wyniku');
  assert.ok(L.MALY_TEMPO < 1);
});

test('seria: progi rosną z poziomem, wynik zależy od cegieł', () => {
  assert.deepEqual(L.progiSerii(1, false), { x2: 20, x3: 40 }); assert.deepEqual(L.progiSerii(20, false), { x2: 40, x3: 80 });
  assert.equal(L.mnoznikSerii(19, false, 1), 1); assert.equal(L.mnoznikSerii(20, false, 1), 2); assert.equal(L.mnoznikSerii(39, false, 20), 1); assert.equal(L.mnoznikSerii(80, false, 20), 3);
  assert.equal(L.ceglyKoparki(1), 1); assert.equal(L.ceglyKoparki(20), 0.5); assert.equal(L.ceglyKoparki(0), 1);
});

test('ekrany: przed rundą poziom i rozdział, po rundzie awans z odblokowaniami; imiona tylko z bazy', () => {
  const s = czytaj('js/cegielki.js'), h = czytaj('gra-cegielki.html'), k = czytaj('js/cegielki-konto.js');
  assert.match(h, /<div id="przed" class="ekran" role="status" hidden>/); assert.match(h, /id="p-poziom"/); assert.match(h, /id="p-rozdzial"/);
  assert.match(s, /return new Promise\(ekranPrzedRunda\);/);
  assert.match(k, /e\.textContent = L\.tekstAwansu\(poziomPrzed, teraz, opcjeRozdzialu\(\)\);/);
  assert.deepEqual([1, 3, 4, 6, 7, 9, 11, 14, 15, 19].map((n) => L.rozdzial(n)), ['Pod domem', 'Pod domem', 'Pierwsze kilometry', 'Pierwsze kilometry', 'Budowa', 'Budowa', 'Noc', 'Noc', 'Wszyscy razem', 'Wszyscy razem']);
  assert.equal(L.rozdzial(10), 'Ktoś dołącza'); assert.equal(L.rozdzial(10, { rower: 'Olek' }), 'Olek dołącza');
  assert.equal(L.rozdzial(20), 'Wszyscy razem', 'bez zgody i przełącznika nie ma Mety'); assert.equal(L.rozdzial(20, { meta: true }), 'Wszyscy razem', 'bez imienia z licznika też'); assert.equal(L.rozdzial(20, { meta: true, imie: 'Ala' }), 'Meta: Ala w koparce');
  assert.equal(L.tekstAwansu(5, 5), ''); assert.equal(L.tekstAwansu(5, 6), 'Awans na poziom 6! Cegła warta ×1,85.');
  assert.equal(L.tekstAwansu(9, 10, { rower: 'Olek' }), 'Awans na poziom 10! Odblokowano: Olek. Nowy rozdział: Olek dołącza. Nagroda: Kamizelka odblaskowa. Cegła warta ×2,53.');
  assert.match(L.tekstAwansu(19, 20, { koparka: true, meta: true, imie: 'Ala' }), /Odblokowano: koparka\. Nowy rozdział: Meta: Ala w koparce\. Nagroda: Medal, Złota czapka z daszkiem\. Cegła warta ×4,23\./);
  assert.doesNotMatch(czytaj('js/cegielki-logika.mjs'), /Sławek|Slawek/);
  assert.match(czytaj(MIG), /'rozdzial_meta', coalesce\(\(select a\.fabianek_postac_gra and a\.wizerunek_zgoda from public\.akcje a where a\.slug = 'dla-fabianka'\), false\)/);
  assert.match(s, /parametry\.get\("poziom_gry"\)/); assert.match(s, /z >= 1 && parametry\.has\("test"\) && location\.hostname !== "biegamy\.run" && location\.hostname !== "run\.biegamy\.app"/, 'pomiar poziomu tylko poza produkcją');
});

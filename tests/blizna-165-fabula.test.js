/* BLIZNA 165 / FABUŁA GRY (Filip 4.11, pkt 9): rozdziały z planszami, kartki z dziennika, bonusy za mur, kibice z pseudonimem, dodatek za rozdział.
   - bez choroby, nazwiska, trasy i pieniędzy, imiona wyłącznie z bazy;
   - Meta tylko przy zgodzie i włączonej postaci;
   - nagroda przyznawana przez serwer po przyjętej rundzie, listy w grze i w bazie te same (po skutku: tools/gra-poziomy-test.sql);
   - plansze omijają Małego budowniczego i pomiary. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const czytaj = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');
new Function(czytaj('js/cegielki-logika.mjs'))();
const L = globalThis.BM_CEGIELKI;
const ZAKAZANE = /chor|nowotw|guz|szpital|leczen|nazwisk|(?<!\p{L})zł(?!\p{L})|złot(ych|e) ?\d|pomagasz|przelew|wież|kościół|kościoł|kierunk|(?<!\p{L})km(?!\p{L})|kilometr[óo]w \d/iu;
const WSZYSTKIE = () => [...L.PLANSZE.flatMap((p) => [p.tekst, p.bezImienia || '']), ...L.KARTKI, ...L.BONUSY_MURU.flatMap((b) => [b.tytul, b.tekst])];

test('rozdziały: progi Filipa, imiona tylko z bazy', () => {
  assert.deepEqual(L.PLANSZE.map((p) => p.od), [1, 4, 7, 10, 11, 15, 20]);
  assert.equal(L.planszaRozdzialu(2).id, 'r1'); assert.equal(L.planszaRozdzialu(6).id, 'r4'); assert.equal(L.planszaRozdzialu(9).id, 'r7'); assert.equal(L.planszaRozdzialu(14).id, 'r11'); assert.equal(L.planszaRozdzialu(19).id, 'r15');
  const logika = czytaj('js/cegielki-logika.mjs');
  assert.doesNotMatch(logika, /Fabian|Sławek|Slawek|wigr/i, 'imię dziecka, imię rowerzysty i nazwa roweru tylko z bazy');
  const r = L.planszaRozdzialu(1, { imie: 'Janek' }); assert.match(r.tekst, /^Szef Janek wydał pierwsze polecenie/);
  assert.equal(L.planszaRozdzialu(1, {}).tekst, 'Szef wydał pierwsze polecenie: droga ma powstać. Kasia i Filip wiążą buty i zbierają cegły.', 'przed startem bez imienia');
  for (const t of WSZYSTKIE()) assert.doesNotMatch(t, ZAKAZANE, t);
});

test('poziom 10 z rowerzystą i bez; Meta tylko przy obu przełącznikach i imieniu', () => {
  const z = L.planszaRozdzialu(10, { rower: 'Olek' });
  assert.equal(z.tytul, 'Olek dołącza'); assert.match(z.tekst, /To Olek, nasz elektryk\. Dołącza na rowerze,/); assert.ok(z.scena.some((e) => e.n === 'rowerzysta_bieg'));
  const b = L.planszaRozdzialu(10, {});
  assert.equal(b.tytul, 'Ktoś dołącza'); assert.equal(b.tekst, 'Na drodze robi się tłoczniej. Nikt tu nie biegnie sam.'); assert.ok(!b.scena.some((e) => e.n === 'rowerzysta_bieg'), 'bez przełącznika nie ma roweru');
  assert.equal(L.planszaRozdzialu(20, {}), null); assert.equal(L.planszaRozdzialu(20, { meta: true }), null); assert.equal(L.planszaRozdzialu(20, { imie: 'Janek' }), null);
  const m = L.planszaRozdzialu(20, { meta: true, imie: 'Janek' }); assert.equal(m.tytul, 'Meta: Janek w koparce'); assert.match(m.tekst, /a w niej Szef Janek\./);
});

test('kartki: 20 krótkich, bez imion dziecka i rowerzysty, przy pierwszej rundzie i za awans', () => {
  assert.equal(L.KARTKI.length, 20);
  for (const k of L.KARTKI) { assert.ok(k.length <= 90, k); assert.doesNotMatch(k, /\{|\d/, k); }
  assert.match(L.kartka(1), /^Kartka 1 z dziennika\. Buty zawiązane/); assert.equal(L.kartka(21), '');
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /var nr = teraz > przed \? teraz : !czytajJson\("cegielki_kartka1", false\) \? 1 : 0;/);
  assert.match(k, /L\.tekstAwansu\(poziomPrzed, teraz, opcjeRozdzialu\(\)\); pokazKartke\(poziomPrzed, teraz\);/);
  assert.match(czytaj('gra-cegielki.html'), /<p id="k-kartka" hidden><\/p>/);
});

test('bonusy za mur: 25% i 50%, raz na urządzenie; każda plansza raz', () => {
  assert.deepEqual(L.BONUSY_MURU.map((b) => b.prog), [L.MUR_CEL * 0.25, L.MUR_CEL * 0.5]);
  assert.deepEqual(L.bonusyMuru(312499), []); assert.deepEqual(L.bonusyMuru(312500).map((b) => b.id), ['mur25']); assert.deepEqual(L.bonusyMuru(9e6).map((b) => b.id), ['mur25', 'mur50']); assert.deepEqual(L.bonusyMuru(undefined), []);
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /if \(r && znane\.indexOf\(r\.id\) < 0\) lista\.push\(r\);/); assert.match(k, /zapiszJson\("cegielki_plansze", znane\.concat/);
});

test('sceny tylko z grafik, które gra ma; plansze omijają Małego budowniczego i pomiary', () => {
  const atlas = JSON.parse(czytaj('assets/gra/atlas.json'));
  for (const p of [...L.PLANSZE, ...L.BONUSY_MURU]) for (const e of p.scena) assert.ok(atlas[e.n], 'brak w atlasie: ' + e.n);
  const s = czytaj('js/cegielki.js');
  assert.match(s, /if \(!n \|\| parametry\.has\("test"\) \|\| !K \|\| !K\.planszeDoPokazania \|\| K\.premiera\(\)\) return Promise\.resolve\(\);/, 'poziom 0 = Mały budowniczy');
  assert.match(s, /czystaDroga\(\);\s+return planszeRundy\(\);/);
  assert.match(s, /e\.koparka && OBR\.koparka_ark && A\.koparka_ark/, 'rysunek tylko, gdy licznik oddał arkusz po starcie i przy zgodzie');
  const h = czytaj('gra-cegielki.html');
  assert.match(h, /<div id="plansza" class="ekran" hidden>/); assert.match(h, /id="pl-dalej"/);
});

test('kibice: pseudonim po moderacji, Mały budowniczy bez rankingu', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /napis: n === "k2" \? napisKibica\(\) : null/);
  assert.match(s, /var p = !G\.maly && K && K\.pseudonimKibica && Math\.random\(\) < 0\.5 \? K\.pseudonimKibica\(\) : "";\s+return M\.imieNaKarton\(p \|\| imieGracza, "Dawaj!"\);/, 'ostatnie sito moderacji przed ekranem');
  assert.match(czytaj('js/cegielki-konto.js'), /\.map\(function \(w\) \{ return w && w\.pseudonim; \}\)/);
});

test('nagroda za rozdział: te same pary w grze i bazie, tylko przedmioty ze sklepiku, serwer przyznaje', () => {
  const m = czytaj('supabase/migrations/20261106_gra_poziomy.sql');
  const zBazy = [...m.match(/from \(values (\(.*?\))\) n\(po, przedmiot\)/)[1].matchAll(/\((\d+), '([a-z-]+)'\)/g)].map((x) => ({ po: Number(x[1]), przedmiot: x[2] }));
  assert.deepEqual(zBazy, L.NAGRODY);
  const ceny = L.SKLEP.filter((p) => p.cena != null).map((p) => p.id);
  for (const n of L.NAGRODY) assert.ok(ceny.includes(n.przedmiot), 'poza sklepikiem: ' + n.przedmiot);
  assert.equal(L.nagrodyDoPoziomu(3).length, 0); assert.deepEqual(L.nagrodyDoPoziomu(4), ['opaska']); assert.equal(L.nagrodyDoPoziomu(20).length, 7);
  assert.match(L.tekstAwansu(3, 4), /Nagroda: Opaska\./); assert.doesNotMatch(L.tekstAwansu(4, 5), /Nagroda/);
  assert.match(m, /update public\.gra_konto set kupione = kupione \|\| v_nagrody where athlete_id = v_konto/);
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /ustawKonto\(odp\.saldo, odp\.kupione\);/); assert.match(k, /zapiszJson\("cegielki_suma", stan\.cegly\); nagrodyNaUrzadzeniu\(\);/);
});

test('ekipa: Szef, Kasia i Filip, elektryk z bazy; kartki 5 i 8 bez zmian do decyzji Kasi', () => {
  const r10 = L.planszaRozdzialu(10, { rower: 'Olek', rowerNa: 'na Składaku' });
  assert.equal(r10.tekst, 'Na drodze słychać dzwonek. To Olek, nasz elektryk. Dołącza na Składaku, a Ty możesz wsiąść na rower.');
  assert.equal(L.rowerZPodpisu('Olek Iksiński na Składaku'), 'na Składaku', 'bez nazwiska');
  assert.equal(L.rowerZPodpisu('Olek Iksiński'), ''); assert.equal(L.rowerZPodpisu(null), '');
  const noc = L.planszaRozdzialu(12, { rower: 'Olek' });
  assert.ok(noc.noc); assert.match(noc.tekst, /Olek zapala latarnie/);
  assert.equal(L.planszaRozdzialu(12, {}).tekst, 'Słońce zaszło, a droga nie. Biegnij od latarni do latarni.', 'bez rowerzysty bez imienia');
  assert.ok(L.KARTKI.some((k) => /Szef/.test(k)) && L.KARTKI.some((k) => /elektryk/i.test(k)) && L.KARTKI.some((k) => /Filip/.test(k)));
  assert.match(L.KARTKI[4], /^Kasia mówi, że bolą nogi/); assert.match(L.KARTKI[7], /^Dostaliśmy kaski\. Kasia twierdzi/);
});

test('latarnie: od dołączenia elektryka w fabule albo przy grze nim; bez przełącznika jak dotąd', () => {
  assert.equal(L.latarnieZapalone('kasia', 9, true), false); assert.equal(L.latarnieZapalone('kasia', 10, true), true);
  assert.equal(L.latarnieZapalone('rowerzysta', 1, true), true); assert.equal(L.latarnieZapalone('kasia', 1, false), true);
  const s = czytaj('js/cegielki.js'), k = czytaj('js/cegielki-konto.js');
  assert.match(s, /swieca = !KL \|\| !KL\.latarnie \|\| KL\.latarnie\(G\.postac\);/);
  assert.match(k, /latarnie: function \(po\) \{ return L\.latarnieZapalone\(po, poziomGracza\(\), !!stan\.rower\); \}/);
});

test('finał: mur albo zamknięta akcja, raz na urządzenie, cała ekipa i koparka, tylko grafiki z atlasu', () => {
  const pl = L.planszaFinalu({ rower: 'Olek' }), bez = L.planszaFinalu({});
  assert.equal(pl.tytul, 'Ulica gotowa. Szef zadowolony.');
  assert.ok(pl.scena.some((e) => e.koparka) && pl.scena.some((e) => e.n === 'kasia_I') && pl.scena.some((e) => e.n === 'filip_I') && pl.scena.some((e) => e.n === 'rowerzysta_bieg'));
  assert.ok(!bez.scena.some((e) => e.n === 'rowerzysta_bieg'), 'bez przełącznika bez rowerzysty');
  const atlas = JSON.parse(czytaj('assets/gra/atlas.json'));
  for (const e of pl.scena) assert.ok(atlas[e.n], 'brak w atlasie: ' + e.n);
  assert.equal(L.odblokowana('koparka', 0, 0, true), true, 'zamknięta akcja otwiera koparkę'); assert.equal(L.odblokowana('koparka', 0, 1250000), true, 'gotowy mur'); assert.equal(L.odblokowana('koparka', 0, 1249999), false); assert.equal(L.odblokowana('rowerzysta', 0, 0, true), false, 'rower dalej za poziom');
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /if \(!\(mur \|\| \(d && d\.zamknieta === true\)\) \|\| czytajJson\("cegielki_final", false\)\) return;/);
  assert.match(k, /rysujPlansze\(\$\("f-plansza"\), pl\)/);
});

test('plansza mieści się na telefonie w poziomie: obrazek obok tekstu, góra nie ginie poza ekranem', () => {
  const h = czytaj('gra-cegielki.html');
  assert.doesNotMatch(h, /#plansza \{[^}]*justify-content:center/, 'centrowanie w przewijanym ekranie ucina górę bez możliwości przewinięcia');
  assert.match(h, /\.pl-ramka \{ margin:auto; flex:none;/);
  assert.match(h, /@media \(max-height:500px\) and \(orientation:landscape\) \{\s+\.pl-ramka \{ display:grid;/);
});


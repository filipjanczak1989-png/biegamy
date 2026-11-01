/* BLIZNA 84 (1.11.2026, M3-2) — luki ławki, które da się zamknąć danymi i tekstami JUŻ OBECNYMI w aplikacji, 0 tokenów.

   (a) moja_forma: TSB/CTL/ATL z _shared/reguly-treningow.mjs (formaSeria), zdania WYŁĄCZNIE ze słownika stanów kafla
       Forma (js/forma-stany.mjs = teksty tarczy w sb.js + etykieta formaZoneLabel); znajomi_tydzien: friendships +
       public_training_logs — prywatne logi nigdy w sumie; osoby_z_miasta: publiczni z tym samym miastem, ≤ 5, bez mnie.
   (b) katalog „pojęcia" z window.METRIC_TOOLTIPS (sb.js) — kopia _shared/pojecia.mjs równa źródłu; brak opisu w aplikacji
       (strefy, interwały) = brak hasła. Fakt o aplikacji: zmiany hasła NIE MA (zero updateUser/PASSWORD_RECOVERY).
   (c) słowa-klucze ekranów (zegarek/ustawienia/zdjęcie → Profil) w katalogu i routerze.
   (d) kalkulator tempo ↔ prędkość ↔ czas — liczby tylko z pytania; bez liczb tylko na jawne „przelicz".
   (e) „biegi za granicą" → jedno zdanie; opis odznaki w karcie z odznaki.html (kopia pilnowana). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { tekstDlaOkna } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (...p) => fs.readFileSync(path.join(KORZEN, ...p), 'utf8').replace(/\r/g, '');
const DZIS = '2026-11-01', TERAZ = new Date('2026-11-01T10:00:00Z');   // niedziela; tydzień = 26.10–1.11
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333';
const bez = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

function logiFormy() {
  const out = [];
  for (let i = 1; i <= 60; i += 2) out.push({ athlete_id: JA, logged_at: `2026-${i > 31 ? '09' : '10'}-${String(i > 31 ? i - 31 : 32 - i).padStart(2, '0')}T07:00:00Z`, training_type: i % 6 === 1 ? 'Interwały' : 'Spokojny', distance_km: '10', duration: '0:55:00', feel: 'good' });
  return out;
}

test('(a) moja_forma: router 0 tokenów; liczby = formaSeria; zdania tylko ze słownika stanów; brak logów → jedno zdanie', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const G = await zaladuj('supabase/functions/_shared/reguly-treningow.mjs');
  await zaladuj('js/forma-stany.mjs');
  const STANY = globalThis.BM_FORMA_STANY;
  for (const t of ['jaka mam forme', 'moja forma', 'jaki mam tsb', 'sprawdz forme', 'mój TSB dzisiaj']) assert.equal(R.dopasuj(t, DZIS).narzedzie, 'moja_forma', t);
  assert.equal(R.dopasuj('pokaz forme', DZIS).ekran, 'forma', 'nawigacja zostaje');
  assert.equal(R.dopasuj('co to jest forma', DZIS), null, 'pojęcie → katalog, nie narzędzie');
  const logi = logiFormy();
  const w = await N.wykonaj(atrapa({ training_logs: logi }), JA, 'moja_forma', {}, TERAZ);
  const f = G.formaSeria(logi, { koniec: TERAZ, dni: 90 });
  assert.deepEqual([w.tsb, w.ctl, w.atl, w.forma], [f.tsb, f.ctl, f.atl, f.forma]);
  assert.equal(w.tytul, STANY[f.forma].tytul); assert.equal(w.etykieta, STANY[f.forma].etykieta);
  const o = zWyniku('moja_forma', w, {});
  assert.equal(o.zdania[0], `Forma: TSB ${f.tsb >= 0 ? '+' : ''}${f.tsb} (${STANY[f.forma].etykieta}), CTL ${f.ctl}, ATL ${f.atl}.`);
  assert.equal(o.zdania[1], STANY[f.forma].tytul);
  assert.equal(o.karty[0].typ, 'forma'); assert.equal(o.karty[0].dane.pod, STANY[f.forma].pod);
  const slownik = new Set(Object.values(STANY).flatMap((s) => [s.tytul, s.pod]));
  assert.ok(o.zdania.slice(1).every((z) => slownik.has(z)), 'każde zdanie poza liczbami ze słownika');
  assert.deepEqual(zWyniku('moja_forma', await N.wykonaj(atrapa({ training_logs: [] }), JA, 'moja_forma', {}, TERAZ), {}), { zdania: ['Za mało treningów z ostatnich 90 dni, żeby policzyć formę.'], karty: [] });
  assert.ok(N.nawigacja(['moja_forma']).nawiguj.includes('tab=forma'));
});

test('(a) słownik stanów = kafel Forma w sb.js (tarcza + formaZoneLabel) i klucze = opisFormy', async () => {
  await zaladuj('js/forma-stany.mjs');
  const G = await zaladuj('supabase/functions/_shared/reguly-treningow.mjs');
  const STANY = globalThis.BM_FORMA_STANY;
  const sb = czytaj('sb.js'), sbBez = bez(sb);
  assert.deepEqual(Object.keys(STANY).sort(), [...new Set([-40, -20, 0, 10, 20].map(G.opisFormy))].sort());
  for (const s of Object.values(STANY)) { assert.ok(sbBez.includes("'" + bez(s.tytul) + "'"), s.tytul); assert.ok(sbBez.includes("'" + bez(s.pod) + "'"), s.pod); }
  const i = sb.indexOf('window.formaZoneLabel = function'), j = sb.indexOf('};', i);
  const okno = {}; vm.runInNewContext(sb.slice(i, j + 2), { window: okno });
  for (const tsb of [-40, -20, 0, 10, 20]) assert.equal(STANY[G.opisFormy(tsb)].etykieta.toUpperCase(), okno.formaZoneLabel(tsb), 'tsb ' + tsb);
});

test('(a) znajomi_tydzien: tylko profile publiczne i widok publiczny; prywatne logi nigdy w sumie; 0 znajomych → zdanie', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  for (const t of ['moi znajomi co biegali', 'kto ze znajomych biegal w tym tygodniu', 'znajomi']) assert.equal(R.dopasuj(t, DZIS).narzedzie, 'znajomi_tydzien', t);
  for (const t of ['dodaj Jana Kowalskiego do znajomych', 'jak dodac znajomego']) assert.notEqual((R.dopasuj(t, DZIS) || {}).narzedzie, 'znajomi_tydzien', t);
  const sb = atrapa({
    friendships: [{ requester_id: JA, addressee_id: U1, status: 'accepted' }, { requester_id: U2, addressee_id: JA, status: 'accepted' }, { requester_id: U3, addressee_id: JA, status: 'pending' }],
    athletes: [{ id: U1, full_name: 'Anna Publiczna', is_public: true }, { id: U2, full_name: 'Piotr Prywatny', is_public: false }],
    public_training_logs: [{ athlete_id: U1, logged_at: '2026-10-28T07:00:00Z', training_type: 'Spokojny', distance_km: '12.5' }, { athlete_id: U1, logged_at: '2026-10-30T07:00:00Z', training_type: 'Rower', distance_km: '40' },
      { athlete_id: U1, logged_at: '2026-10-20T07:00:00Z', training_type: 'Spokojny', distance_km: '99' }],
    training_logs: [{ athlete_id: U2, logged_at: '2026-10-29T07:00:00Z', training_type: 'Spokojny', distance_km: '30' }],
  });
  const w = await N.wykonaj(sb, JA, 'znajomi_tydzien', {}, TERAZ);
  assert.deepEqual([w.znajomi, w.publiczni, w.biegali], [2, 1, 1]);
  assert.deepEqual(w.osoby, [{ id: U1, nazwa: 'Anna Publiczna', km: 12.5, treningi: 2 }], 'rower bez km, trening sprzed tygodnia poza sumą');
  assert.ok(!sb.zapytania.some((z) => z.nazwa === 'training_logs'), 'nigdy z tabeli logów — tylko widok publiczny');
  const o = zWyniku('znajomi_tydzien', w, {});
  assert.deepEqual(o.zdania, ['Od 26.10 trenowało 1 z 2 znajomych (profile publiczne): Anna Publiczna 12,5 km.']);
  assert.equal(o.karty[0].typ, 'znajomy');
  assert.deepEqual(zWyniku('znajomi_tydzien', await N.wykonaj(atrapa({ friendships: [] }), JA, 'znajomi_tydzien', {}, TERAZ), {}).zdania, ['Nie masz jeszcze znajomych w BiegaMy.']);
  const p = await N.wykonaj(atrapa({ friendships: [{ requester_id: JA, addressee_id: U2, status: 'accepted' }], athletes: [{ id: U2, is_public: false }], public_training_logs: [] }), JA, 'znajomi_tydzien', {}, TERAZ);
  assert.deepEqual(zWyniku('znajomi_tydzien', p, {}).zdania, ['Twoi znajomi mają prywatne profile — ich treningów nie widzę.']);
  assert.ok(N.nawigacja(['znajomi_tydzien']).nawiguj.includes('tab=social'));
});

test('(a) osoby_z_miasta: publiczni z moim miastem, bez mnie, ≤ 5 kart osoby; bez miasta → Profil', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  for (const t of ['kto biega z mojego miasta', 'biegacze w moim miescie', 'kto biega blisko mnie']) assert.equal(R.dopasuj(t, DZIS).narzedzie, 'osoby_z_miasta', t);
  assert.equal(R.dopasuj('jakie biegi w moim miescie', DZIS).narzedzie, 'biegi_nadchodzace');
  assert.equal(R.dopasuj('jakie biegi w moim miescie', DZIS).args.miejsce, undefined, '„moim" to nie miejscowość');
  const ludzie = Array.from({ length: 7 }, (_, i) => ({ id: `5555555${i}-5555-4555-8555-555555555555`, full_name: 'Osoba ' + i, is_public: i !== 6, city: i === 5 ? 'Kraków' : 'Poznań' }));
  const sb = atrapa({ athletes: [{ id: JA, city: 'Poznań', is_public: true, full_name: 'Ja' }, ...ludzie] });
  const w = await N.wykonaj(sb, JA, 'osoby_z_miasta', {}, TERAZ);
  assert.equal(w.miasto, 'Poznań'); assert.equal(w.liczba, 5, 'bez mnie, bez prywatnego, bez Krakowa'); assert.equal(w.osoby.length, 5);
  assert.ok(w.osoby.every((o) => o.id !== JA && o.prywatny === false));
  const o = zWyniku('osoby_z_miasta', w, {});
  assert.deepEqual(o.zdania, ['Z miasta Poznań biega w BiegaMy 5 osób z publicznym profilem.']); assert.ok(o.karty.every((k) => k.typ === 'osoba'));
  const b = zWyniku('osoby_z_miasta', await N.wykonaj(atrapa({ athletes: [{ id: JA, city: null }] }), JA, 'osoby_z_miasta', {}, TERAZ), {});
  assert.deepEqual(b.akcja, { nawiguj: 'profil.html' });
  assert.deepEqual(zWyniku('osoby_z_miasta', { miasto: 'Nysa', liczba: 0, osoby: [] }, {}).zdania, ['W BiegaMy nikt inny z publicznym profilem nie podał miasta Nysa.']);
});

test('(b) pojęcia: kopia _shared/pojecia.mjs = METRIC_TOOLTIPS w sb.js; „jak dziala tsb" → karta pojęcia; strefy bez opisu = bez hasła; hasło = fakt', async () => {
  const { POJECIA } = await zaladuj('supabase/functions/_shared/pojecia.mjs');
  const K = await zaladuj('supabase/functions/okienko/katalog.mjs');
  const sb = czytaj('sb.js');
  const i = sb.indexOf('  window.METRIC_TOOLTIPS = {'), j = sb.indexOf('\n  };', i);
  const okno = {}; vm.runInNewContext(sb.slice(i, j + 5), { window: okno });
  const czysty = (h) => String(h).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  assert.deepEqual(Object.keys(POJECIA), Object.keys(okno.METRIC_TOOLTIPS), 'kopia rozjechana — node tools/kopie-okienka.js');
  for (const [k, v] of Object.entries(okno.METRIC_TOOLTIPS)) {
    assert.equal(POJECIA[k].tytul, v.title, k);
    assert.equal(POJECIA[k].co_to, czysty(v.sections.find((s) => s.heading === 'Co to jest').body), k);
  }
  const baza = () => atrapa({ radio_tracks: [], recipes: [] });
  for (const [q, klucz] of [['jak dziala tsb', 'tsb'], ['co to jest ctl', 'ctl'], ['co znaczy trimp', 'trimp'], ['mapa cieplna co to', 'heatmap']]) {
    const o = await K.szukajWKatalogu(baza(), q);
    assert.ok(o && o.karty[0].typ === 'kat_pojecie' && o.karty[0].dane.klucz === klucz, q + ' → ' + JSON.stringify(o));
    assert.equal(o.karty[0].dane.co_to, POJECIA[klucz].co_to); assert.equal(o.karty[0].dane.cel, 'zawodnik.html?tab=forma');
  }
  for (const q of ['co to sa strefy tetna', 'czym sa interwaly', 'co to jest rozbieganie', 'ile spalilem kalorii w tym tygodniu']) {
    const o = await K.szukajWKatalogu(baza(), q);
    assert.ok(!o || !o.karty.some((k) => k.typ === 'kat_pojecie'), 'bez opisu w aplikacji = bez hasła: ' + q);
  }
  const h = await K.szukajWKatalogu(baza(), 'gdzie zmienic haslo');
  assert.ok(h && h.karty[0].typ === 'kat_pojecie' && h.karty[0].dane.klucz === 'haslo' && h.karty[0].dane.cel === null, JSON.stringify(h));
  assert.match(h.karty[0].dane.co_to, /nie ma dziś zmiany hasła/);
  for (const plik of ['profil.html', 'zawodnik.html', 'sb.js']) assert.ok(!/updateUser\(|PASSWORD_RECOVERY/.test(czytaj(plik)), plik + ': pojawiła się zmiana hasła — popraw O_APLIKACJI w katalog.mjs');
  assert.ok(!/\.(insert|upsert|update|delete|rpc)\(/.test(czytaj('supabase', 'functions', 'okienko', 'katalog.mjs')));
});

test('(c) słowa-klucze ekranów: zegarek / zdjecie / ustawienia → Profil (katalog i router); tylko ekrany, na których to jest', async () => {
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const K = await zaladuj('supabase/functions/okienko/katalog.mjs');
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const k of Object.keys(N.SYNONIMY_EKRANOW)) assert.ok(N.EKRANY[k], 'synonim do nieistniejącego ekranu: ' + k);
  const baza = () => atrapa({ radio_tracks: [], recipes: [] });
  for (const [q, ekran] of [['gdzie podlaczyc zegarek', 'profil'], ['zmiana zdjecia', 'profil'], ['ustawienia', 'profil'], ['muzyka', 'radio'], ['zapisz trening', 'log']]) {
    const o = await K.szukajWKatalogu(baza(), q);
    assert.ok(o && o.karty.some((k) => k.typ === 'kat_ekran' && k.dane.ekran === ekran), q + ' → ' + JSON.stringify(o));
  }
  assert.equal(R.dopasuj('otworz ustawienia', DZIS).ekran, 'profil');
  assert.equal(R.dopasuj('pokaz zegarek', DZIS).ekran, 'profil');
  const profil = czytaj('profil.html');
  assert.ok(/intervals/i.test(profil) && /avatar/i.test(profil) && /profile-city/.test(profil), 'Profil ma zegarek, zdjęcie i miasto');
});

test('(d) kalkulator: liczby tylko z pytania; tempo ↔ km/h ↔ czas; bez liczb tylko „przelicz"; „moje tempo" i porady → nie kalkulator', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const z = (q) => (R.dopasuj(q, DZIS) || {});
  assert.equal(z('tempo 5:30 na predkosc').zdanie, 'Tempo 5:30/km to 10,9 km/h.');
  assert.equal(z('12 km/h jakie tempo').zdanie, '12 km/h to tempo 5:00/km.');
  assert.equal(z('polmaraton w 1:45 jakie tempo').zdanie, 'Półmaraton w 1:45:00 to tempo 4:59/km (12,1 km/h).');
  assert.equal(z('maraton w 3:29:59 tempo').zdanie, 'Maraton w 3:29:59 to tempo 4:59/km (12,1 km/h).');
  assert.equal(z('jaki czas na 10 km w tempie 5:00').zdanie, '10 km w tempie 5:00/km to 50:00 (12 km/h).');
  assert.equal(z('5 km w 25:00 jakie to tempo').zdanie, '5 km w 25:00 to tempo 5:00/km (12 km/h).');
  assert.equal(z('ile to km/h tempo 4:00').zdanie, 'Tempo 4:00/km to 15 km/h.');
  assert.equal(z('jak przeliczyc tempo na predkosc').zdanie, R.ODP_KALKULATOR_PUSTY);
  assert.equal(z('jak przeliczyc tempo na predkosc').log, 'kalkulator');
  for (const q of ['jakie tempo na polmaraton', 'moje tempo', 'jakie mam tempo', 'plan na jutro w tempie 5:30', 'rekord 10 km 45:00']) assert.notEqual(z(q).log, 'kalkulator', q);
  for (const q of ['tempo 5:30 na predkosc', 'jaki czas na 10 km w tempie 5:00']) assert.ok(!/\d/.test(z(q).zdanie.replace(/5:30|10,9|12|5:00|10 km|50:00/g, '')), 'tylko liczby z pytania i wyniku: ' + q);
});

test('(e) biegi za granicą → jedno zdanie; EF loguje zdania routera z nazwą (powitanie / kalkulator / biegi_zagranica); opis odznaki z odznaki.html', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const q of ['biegi za granica w styczniu', 'maratony zagraniczne 2027', 'jakie biegi poza polska']) assert.deepEqual(R.dopasuj(q, DZIS), { zdanie: R.ODP_TYLKO_POLSKA, log: 'biegi_zagranica' }, q);
  assert.equal(R.dopasuj('jakie biegi w styczniu', DZIS).narzedzie, 'biegi_nadchodzace');
  const ef = czytaj('supabase', 'functions', 'okienko', 'index.ts');
  assert.match(ef, /tryb: "router", narzedzia: \[traf\.log\]/);
  const { NAZWY_ODZNAK, OPISY_ODZNAK, opisOdznaki } = await zaladuj('supabase/functions/_shared/odznaki-nazwy.mjs');
  const h = czytaj('odznaki.html');
  const i = h.indexOf('const BADGES = ['), j = h.indexOf('\n];', i);
  const B = vm.runInNewContext(h.slice(i + 15, j + 3));
  assert.deepEqual(OPISY_ODZNAK, Object.fromEntries(B.map((b) => [b.id, b.desc])), 'opisy rozjechane z odznaki.html — node tools/kopie-okienka.js');
  assert.deepEqual(Object.keys(OPISY_ODZNAK), Object.keys(NAZWY_ODZNAK));
  assert.equal(opisOdznaki('wracam_do_gry'), 'Powrót po 7 dniach przerwy'); assert.equal(opisOdznaki('nie_ma_takiej'), null);
  const K = await zaladuj('supabase/functions/okienko/katalog.mjs');
  const o = await K.szukajWKatalogu(atrapa({ radio_tracks: [], recipes: [] }), 'co to jest odznaka wracam do gry');
  assert.equal(o.karty[0].dane.opis, 'Powrót po 7 dniach przerwy');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const m = await N.wykonaj(atrapa({ achievements: [{ athlete_id: JA, badge_id: 'wracam_do_gry', earned_at: '2026-10-01T10:00:00Z' }] }), JA, 'odznaki_moje', {}, TERAZ);
  assert.equal(m.ostatnie[0].opis, 'Powrót po 7 dniach przerwy');
  assert.equal(N.DEKLARACJE.length, 12);
});

test('UI: karty forma / znajomy / pojęcie / odznaka z opisem — przez data-*, bez onclick, UUID sprawdzany', () => {
  const okno = { escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), BM_TEKST: tekstDlaOkna() };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(czytaj('js', 'okienko.js'), ctx);
  const html = okno.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: ['x'], karty: [
    { typ: 'forma', dane: { tsb: 7, ctl: 45, atl: 38, etykieta: 'optimum', tytul: 'Forma świeża.', pod: 'Dobry moment na mocniejszy akcent albo start.' } },
    { typ: 'znajomy', dane: { id: U1, nazwa: 'Anna <b>', km: 12.5, treningi: 2 } }, { typ: 'znajomy', dane: { id: 'nie-uuid', nazwa: 'X', km: 1, treningi: 1 } },
    { typ: 'kat_pojecie', dane: { klucz: 'tsb', tytul: 'TSB · Forma świeża', co_to: 'TSB to wskaźnik', cel: 'zawodnik.html?tab=forma', ekran_nazwa: 'Forma' } },
    { typ: 'kat_odznaka', dane: { nazwa: 'Wracam do gry', opis: 'Powrót po 7 dniach przerwy' } }] });
  assert.match(html, /<b>TSB \+7<\/b><span class="okn-meta">optimum · CTL 45 · ATL 38<\/span><span class="okn-meta">Dobry moment/);
  assert.match(html, /<b>Anna &lt;b&gt;<\/b><span class="okn-meta">12,5 km · 2 treningi<\/span><button type="button" class="okn-chip" data-osoba="profil" data-id="11111111-1111-4111-8111-111111111111">Zobacz profil<\/button>/);
  assert.ok(!html.includes('>X<'), 'znajomy bez UUID = brak karty');
  assert.match(html, /<b>TSB · Forma świeża<\/b><span class="okn-meta">TSB to wskaźnik<\/span><button type="button" class="okn-otworz" data-cel="zawodnik\.html\?tab=forma">Otwórz Forma ›<\/button>/);
  assert.match(html, /<b>Wracam do gry<\/b><span class="okn-meta">odznaka · Powrót po 7 dniach przerwy<\/span>/);
  assert.ok(!/onclick/i.test(html));
  const bezCelu = okno.OKIENKO.htmlOdpowiedzi(200, { tryb: 'router', zdania: ['x'], karty: [{ typ: 'kat_pojecie', dane: { klucz: 'haslo', tytul: 'Hasło', co_to: 'brak', cel: null } }] });
  assert.ok(bezCelu.includes('<b>Hasło</b>') && !bezCelu.includes('data-cel'), 'fakt bez ekranu = bez przycisku');
});

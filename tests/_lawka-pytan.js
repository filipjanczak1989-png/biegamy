// ŁAWKA PYTAŃ (1.11.2026) — zwiad luk okienka, NIE test blokujący (nazwa bez .test.js, uruchamiać ręcznie):
//   node tests/_lawka-pytan.js            → tabela w konsoli + raport docs/lawka-pytan-<data>.md
//   node tests/_lawka-pytan.js --md       → tylko plik .md
//   node tests/_lawka-pytan.js --etap 1   → plik docs/lawka-pytan-<data>-<etap>.md (po każdym etapie M3-1)
// 50 pytań, jakie realnie zadaje biegacz (po polsku, z literówkami, bez polskich znaków, w odmianie), po 10 na kategorię:
// własne dane · osoby · imprezy · treści aplikacji · spoza aplikacji. Nazwiska tylko publicznych sportowców (albo zmyślone).
// Każde pytanie przechodzi LOKALNIE tę samą ścieżkę co EF: router → osoba → impreza → katalog → (model/sieć SYMULOWANE:
// zapisujemy, że „poszłoby do modelu / sieci" i ile by kosztowało wg średnich z okienko_log 1.11: flash 2143/63 tok,
// siec +1842/157 tok i 1,44 zapytania × 0,014 USD; cena gemini-3.5-flash-lite 0,30/2,50 USD za 1M).
// Atrapy danych = kształt KONTA TESTOWEGO (1.11): imię i nazwisko, bez rocznika, bez trenera, profil prywatny, plan na
// przód 0, 1 log, 44 odznaki, 0 rekordów, 1 cel startowy. F6: atrapa z kalendarzem i jednym publicznym biegaczem.
// Ocena (ręczna, w tabeli PYTANIA): dobra / pusta / zla / za_droga + „co trzeba". Raport = tabela + 10 luk wg wagi.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const DZIS = '2026-11-01', TERAZ = new Date('2026-11-01T10:00:00Z');
const CENA = { we: 0.30 / 1e6, wy: 2.50 / 1e6, zapytanie: 0.014 };
const SR = { flash: { we: 2143, wy: 63 }, siec: { we: 1842, wy: 157, zapytania: 1.44 } };
const usd = (x) => '$' + x.toFixed(4);
const kosztModel = SR.flash.we * CENA.we + SR.flash.wy * CENA.wy;
const kosztSiec = kosztModel + SR.siec.we * CENA.we + SR.siec.wy * CENA.wy + SR.siec.zapytania * CENA.zapytanie;

/* pytanie, kategoria, waga „ile osób o to zapyta" (1–5), ocena, co trzeba (ocena ręczna po przebiegu z 1.11) */
const PYTANIA = [
  // ── własne dane ──
  ['co mam dzis', 'wlasne', 5, 'dobra', ''],
  ['plan na jutro', 'wlasne', 5, 'dobra', 'konto testowe bez trenera i planu → karta „Ułóż plan” (M3b)'],
  ['ile przebieglam w pazdzierniku', 'wlasne', 5, 'dobra', ''],
  ['ile km w tym tygodniu', 'wlasne', 5, 'dobra', ''],
  ['kiedy mam nastepny start', 'wlasne', 4, 'dobra', ''],
  ['jakie mam odznaki', 'wlasne', 3, 'dobra', ''],
  ['moje rekordy', 'wlasne', 4, 'dobra', 'M3-1 (3): puste pb_* → najlepsze czasy z WYNIKÓW ZAWODÓW (F6), z etykietą; bez treningów'],
  ['jaka mam forme', 'wlasne', 4, 'dobra', 'M3-2: moja_forma — TSB/CTL/ATL z formaSeria, zdanie ze słownika kafla Forma, 0 tokenów'],
  ['ile spalilem kalorii w tym tygodniu', 'wlasne', 2, 'za_droga', 'model, brak narzędzia; kcal są w nutrition — osobna decyzja (produkty poza katalogiem)'],
  ['czy dzis moge biegac po kontuzji', 'wlasne', 3, 'dobra', 'etap 5 (c): stałe zdanie „Przy bólu lub kontuzji decyzję podejmij z trenerem albo fizjoterapeutą.” + „Napisz do trenera” (gdy jest), 0 tokenów, bez porad'],
  // ── osoby ──
  ['Robert Korzeniowski', 'osoby', 2, 'dobra', 'tryb osoby: F6 + (publiczny) sieć'],
  ['kim jest Marcin Lewandowski', 'osoby', 2, 'dobra', 'wprost → sieć'],
  ['wyniki Katarzyny Chojnackiej', 'osoby', 3, 'dobra', 'M3-1 (2): 0 trafień → drugie wywołanie z rdzeniami („katarz chojnack”); na prod search_runners daje 4'],
  ['jak pobiegl Jan Kowalski w Poznaniu', 'osoby', 3, 'dobra', 'M3-1 (1): osoba w zdaniu, q „Jan Kowalski”, kontekst „Poznaniu” → filtr wyników; do 1.11 nazwisko szło do Google'],
  ['kasia nowak', 'osoby', 3, 'dobra', 'odpowiedź informacyjna gdy brak (M3-0b)'],
  ['czy Anna Kowalska jest w aplikacji', 'osoby', 3, 'dobra', 'M3-1 (1): osoba w zdaniu → tryb osoby, nie model/sieć'],
  ['kto biega z mojego miasta', 'osoby', 3, 'dobra', 'M3-2: osoby_z_miasta — publiczni z miastem z profilu (RLS), ≤ 5 kart osoby; bez miasta → Profil'],
  ['moi znajomi co biegali', 'osoby', 3, 'dobra', 'M3-2: znajomi_tydzien — friendships + public_training_logs, tylko profile publiczne, 0 tokenów'],
  ['kto jest moim trenerem', 'osoby', 4, 'dobra', 'M3-1 (3): moj_trener (0 tokenów) — karta trenera z „Napisz” albo „Trenujesz bez trenera w BiegaMy.”'],
  ['dodaj Jana Kowalskiego do znajomych', 'osoby', 2, 'dobra', 'M3-1 (1): osoba w zdaniu → karta osoby z „Dodaj do znajomych” (akcja po tapnięciu); odmiana → (2)'],
  // ── imprezy ──
  ['jakie biegi w listopadzie w poznaniu', 'imprezy', 5, 'dobra', ''],
  ['gdzie pobiec dyche w grudniu', 'imprezy', 4, 'dobra', ''],
  ['ultrakotlina', 'imprezy', 3, 'dobra', 'przez trafienie w kalendarzu'],
  ['kiedy jest maraton warszawski 2027', 'imprezy', 4, 'dobra', 'M3-1 (2): „maraton <nazwa>” → impreza (events_search), nie lista'],
  ['polmaraton w krakowie', 'imprezy', 4, 'dobra', 'etap 5 (a): miasto/dystans bez miesiąca → 365 dni — kwietniowy Półmaraton Krakowski w liście'],
  ['jakie biegi w weekend', 'imprezy', 4, 'dobra', 'M3-1 (2): weekend = najbliższe sb–nd'],
  ['zapisy na bieg niepodleglosci', 'imprezy', 4, 'dobra', 'etap 5 (b): karta z kalendarza + „Strona imprezy ›” (url zapisów z maszyny), bez sieci — 0 zł zamiast ~$0,02'],
  ['trasa polmaratonu poznanskiego', 'imprezy', 3, 'dobra', 'impreza (słowo z listy) + sieć ze źródłami'],
  ['biegi za granica w styczniu', 'imprezy', 2, 'dobra', 'M3-2 (e): jedno zdanie z routera „Maszyna wyników zna tylko biegi w Polsce.”, 0 tokenów'],
  ['ile kosztuje wpisowe na maraton w debnie', 'imprezy', 3, 'dobra', 'etap 5 (b): tryb impreza — karta „52. Maraton Dębno” + „Maszyna wyników nie zna strony tej imprezy — cenę i zapisy podaje organizator.” (prod: brak url), bez sieci'],
  // ── treści aplikacji ──
  ['czwarta godzina', 'tresci', 3, 'dobra', 'utwór z radia'],
  ['puść boso', 'tresci', 3, 'dobra', '„pusc” pominięte → utwór „Boso”'],
  ['przepis na omlet', 'tresci', 3, 'dobra', ''],
  ['cwiczenia na core', 'tresci', 4, 'dobra', 'M3-1 (2): „cwiczenia” pominięte jak „przepis” → program Core'],
  ['oddech 4-7-8', 'tresci', 2, 'dobra', 'M3-1 (2): „oddech” = słowo kategorii, cyfry liczą się jako słowa → technika 4-7-8'],
  ['jak dziala tsb', 'tresci', 3, 'dobra', 'M3-2 (b): katalog pojęć z METRIC_TOOLTIPS (sb.js) — karta „Co to jest” + Otwórz Forma; strefy/interwały bez opisu w aplikacji = bez hasła'],
  ['gdzie zmienic haslo', 'tresci', 3, 'dobra', 'M3-2: fakt o aplikacji — zmiany hasła NIE MA (zwiad: zero updateUser/PASSWORD_RECOVERY), tylko „Zapomniałem hasła” na logowaniu; 0 tokenów'],
  ['pokaz wyzwania', 'tresci', 3, 'dobra', ''],
  ['co to jest odznaka wracam do gry', 'tresci', 2, 'dobra', 'M3-2: karta odznaki z opisem z odznaki.html („Powrót po 7 dniach przerwy”)'],
  ['radio', 'tresci', 3, 'dobra', ''],
  // ── spoza aplikacji ──
  ['kto wygral maraton w berlinie', 'poza', 3, 'dobra', 'sieć ze źródłami (~$0,02)'],
  ['jaka pogoda jutro w poznaniu', 'poza', 4, 'dobra', 'M3-1 (3): po stronie klienta z kafla Dziś (sessionStorage), 0 tokenów, bez EF'],
  ['ile kalorii ma banan', 'poza', 2, 'za_droga', 'sieć; baza produktów w Jedzeniu ma to za 0 — osobna decyzja'],
  ['jak przeliczyc tempo na predkosc', 'poza', 2, 'dobra', 'M3-2 (d): kalkulator w routerze — bez liczb prosi o tempo/prędkość/czas+dystans; z liczbami przelicza (tylko liczby z pytania)'],
  ['rekord swiata w maratonie', 'poza', 2, 'dobra', 'M3-1 (2): „świata” wyklucza moje_rekordy → sieć ze źródłami (~$0,02)'],
  ['co jesc przed polmaratonem', 'poza', 4, 'za_droga', 'M3-1 (2): „co jeść” omija listę → sieć ~$0,02 za poradę ogólną; brak własnej treści'],
  ['jak dobrac buty do biegania', 'poza', 3, 'za_droga', 'sieć'],
  ['czy biegac z katarem', 'poza', 3, 'za_droga', 'sieć — porada zdrowotna bez zastrzeżenia'],
  ['ile powinienem biegac tygodniowo', 'poza', 4, 'za_droga', 'model/sieć — a plan generatora to liczy; odpowiedź z planu/bazy'],
  ['dzien dobry', 'poza', 3, 'dobra', 'M3-1 (3): powitanie → jedno zdanie z routera, 0 tokenów'],
  // ── zagadka akcji (2.11.2026) ──
  ['co sie dzieje 8 listopada', 'akcja', 4, 'dobra', 'zagadka akcji: router, 0 tokenów, losowa z ZAGADKI (js/akcja-cytaty.mjs)'],
  ['kim jest Fabianek', 'akcja', 4, 'dobra', 'zagadka akcji — NIE tryb osoby, NIE sieć (przed i po starcie)'],
  ['jaka akcja sie szykuje', 'akcja', 3, 'dobra', 'zagadka akcji; po starcie „Akcja trwa — szczegóły na Dziś.”'],
];

/* kształt konta testowego + F6 z atrapy */
const U1 = '11111111-1111-4111-8111-111111111111';
function baza() {
  return {
    athletes: [{ id: JA, user_id: 'u-ja', full_name: 'Testowa Osoba', is_public: false, coach_id: null, date_of_birth: '1990-05-05', city: 'Poznań', race_goals: JSON.stringify([{ name: 'Bieg Niepodległości', date: '2026-11-11', distance_km: 10 }]) },
      { id: U1, full_name: 'Robert Korzeniowski', is_public: true, city: 'Poznań' }],   // etap 4: miasto i jeden znajomy publiczny (odstępstwo od konta testowego, żeby ścieżki M3-2 miały co pokazać)
    trainings: [], training_logs: [{ athlete_id: JA, logged_at: '2026-10-27T07:00:00Z', training_type: 'Spokojny', distance_km: '10.2', duration: '1:00:00' }],
    achievements: Array.from({ length: 44 }, (_, i) => ({ athlete_id: JA, badge_id: 'b' + i, earned_at: '2026-10-01T10:00:00Z' })),
    races: [], friendships: [{ requester_id: JA, addressee_id: U1, status: 'accepted' }],
    public_training_logs: [{ athlete_id: U1, logged_at: '2026-10-28T07:00:00Z', training_type: 'Spokojny', distance_km: '12.5' }], radio_tracks: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Czwarta Godzina', artist: 'X' }, { id: '33333333-3333-4333-8333-333333333333', title: 'Boso', artist: 'Y' }],
    recipes: [{ id: '44444444-4444-4444-8444-444444444444', title: 'Omlet z mozzarellą i pomidorem', tags: ['śniadanie'], ingredients: [] }],
  };
}
const F6 = {
  search_runners: (a) => (/korzeniowsk|lewandowsk/i.test(a.q) ? [{ runner_key: 'datasport:1', display_name: 'KORZENIOWSKI ROBERT', yob: 1968, results_count: 40 }]
    : /testowa osoba/i.test(a.q) ? [{ runner_key: 'datasport:9', display_name: 'TESTOWA OSOBA', yob: 1990, results_count: 2 }] : []),
  runner_results: (a) => (a.p_runner_key === 'datasport:9' ? [{ event_name: 'Bieg Testowy 10 km', event_date: '2026-09-10', distance_km: 10, time_seconds: 2890, position_total: 80 }, { event_name: 'Półmaraton Testowy', event_date: '2026-04-10', distance_km: 21.0975, time_seconds: 6400, position_total: 120 }]
    : [{ event_name: 'Mistrzostwa Polski w chodzie', event_date: '2026-06-01', distance_km: 20, time_seconds: 5000, position_total: 1 }]),
  events_search: (a) => (/kotlin/i.test(a.p_q) ? [{ nazwa: 'UltraKotlina', data: '2027-10-09', miejscowosc: 'Szklarska Poręba', dystanse: '100 km', zrodlo: 'kalendarz', przeszla: false }]
    : /warszaw/i.test(a.p_q) ? [{ nazwa: '49. Maraton Warszawski', data: '2027-09-26', miejscowosc: 'Warszawa', dystanse: '42.195', zrodlo: 'kalendarz' }]
    : /niepodleg/i.test(a.p_q) ? [{ nazwa: 'Bieg Niepodległości', data: '2026-11-11', miejscowosc: 'Poznań', dystanse: '10', zrodlo: 'kalendarz', url_zapisy: 'https://dostartu.pl/bieg-niepodleglosci-poznan' }]
    : /debn/i.test(a.p_q) ? [{ nazwa: '52. Maraton Dębno', data: '2026-10-18', miejscowosc: 'Dębno', dystanse: '42.195', zrodlo: 'kalendarz', przeszla: true }]   // jak prod 1.11: bez url
    : /poznan/i.test(a.p_q) ? [{ nazwa: 'Półmaraton Poznański', data: '2027-04-11', miejscowosc: 'Poznań', dystanse: '21.0975', zrodlo: 'kalendarz' }] : []),
  upcoming_races: (a) => [{ group_key: 'g1', name: 'Bieg Niepodległości', event_date: '2026-11-11', city: 'Poznań', distances: [10] }, { group_key: 'g2', name: 'Bieg Mikołajkowy', event_date: '2026-12-06', city: 'Poznań', distances: [5, 10] },
    { group_key: 'g3', name: 'Półmaraton Krakowski', event_date: '2027-04-18', city: 'Kraków', distances: [21.0975] }].filter((r) => !a.p_q || (r.name + ' ' + r.city).toLowerCase().includes(String(a.p_q).toLowerCase())),
};
const fetchF6 = async (url, init) => { const rpc = url.split('/rpc/')[1]; const a = JSON.parse(init.body); return { ok: true, status: 200, json: async () => (F6[rpc] ? F6[rpc](a) : []) }; };

/* M3-1 (3): pogoda odpowiada po stronie klienta (js/okienko.js, kafel Dziś w sessionStorage) — przed EF; tu ta sama funkcja w vm. */
function okienkoKlienta() {
  const vm = require('node:vm');
  const mag = new Map([['weather:poznań', JSON.stringify({ ts: Date.now(), data: { city: 'Poznań', days: [{ date: DZIS, temp_max: 9, weather_code: 3, precip_pct: 20 }, { date: '2026-11-02', temp_max: 11, weather_code: 61, precip_pct: 70 }] } })]]);
  const okno = { escapeHtml: (s) => String(s), BM_TEKST: require('./_srodowisko.js').tekstDlaOkna() };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { get length() { return mag.size; }, key: (i) => [...mag.keys()][i], getItem: (k) => (mag.has(k) ? mag.get(k) : null), setItem() {} },
    location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(fs.readFileSync(path.join(KORZEN, 'js', 'okienko.js'), 'utf8'), ctx);
  return okno.OKIENKO;
}
async function przebieg() {
  const KLIENT = okienkoKlienta();
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const Odp = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  const Os = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const Im = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const Kat = await zaladuj('supabase/functions/okienko/katalog.mjs');
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  const P = await zaladuj('supabase/functions/okienko/pamiec.mjs');
  const wiersze = [];
  for (const [pyt, kat, waga, ocena, co] of PYTANIA) {
    (await zaladuj('supabase/functions/okienko/f6.mjs'))._wyczyscPamiecF6();
    const sb = atrapa(baza());
    let sciezka = '', typ = '', koszt = 0, siec = false;
    const lok = KLIENT.pogodaLokalnie(pyt);
    const traf = lok ? null : R.dopasuj(pyt, DZIS);
    if (lok) { sciezka = 'KLIENT (bez EF)'; typ = 'zdanie: „' + lok.replace(/<[^>]+>/g, '').slice(0, 70) + '”'; }
    else if (traf && 'zdanie' in traf) { sciezka = 'router→zdanie'; typ = 'zdanie: „' + traf.zdanie.slice(0, 60) + '”'; }
    else if (traf && 'nawiguj' in traf) { sciezka = 'router→nawigacja'; typ = 'ekran ' + traf.nawiguj; }
    else if (traf) {
      sciezka = 'router→' + traf.narzedzie;
      const w = N.waliduj(traf.narzedzie, traf.args);
      const wynik = await N.wykonaj(sb, JA, traf.narzedzie, w.args, TERAZ, { fetchFn: fetchF6, token: 'T' });
      const z = Odp.zWyniku(traf.narzedzie, wynik, w.args);
      typ = (z.karty.length ? `${z.karty.length} kart` : 'zdanie') + ': „' + (z.zdania[0] || '').slice(0, 70) + '”';
    } else {
      const os = Os.osobaZPytania(pyt);
      const sieciSym = async (t) => { siec = true; return { zdania: ['(sieć)'], zrodla: [{ tytul: 'x', url: 'https://x' }], tok: { we: SR.siec.we, wy: SR.siec.wy }, zapytania: SR.siec.zapytania }; };
      if (os) {
        const o = await Os.odpowiedzOsoba({ sb, athleteId: JA, fetchFn: fetchF6, token: 'T', q: os.q, wprost: os.wprost, sieciDozwolona: async () => true, siec: sieciSym });
        sciezka = 'osoba' + (siec ? '→sieć' : ''); koszt = siec ? kosztSiec - kosztModel : 0;
        typ = (o.karty.length ? `${o.karty.length} kart` : '') + (o.zdania.length ? ' zdania: „' + o.zdania[0].slice(0, 60) + '”' : '');
      } else {
        const imp = Im.imprezaZPytania(pyt);
        let o = null;
        if (imp) o = await Im.odpowiedzImpreza({ sb, fetchFn: fetchF6, token: 'T', q: imp.q, jawne: imp.jawne, cena: !!imp.cena, dzis: DZIS, sieciDozwolona: async () => true, siec: sieciSym,
          zPamieci: async () => null, doPamieci: async () => {}, znaleziska: async () => {} });
        if (o) { sciezka = 'impreza' + (siec ? '→sieć' : ''); koszt = siec ? kosztSiec - kosztModel : 0; typ = (o.karty.length ? `${o.karty.length} kart` : '') + ' „' + (o.zdania[0] || '').slice(0, 60) + '”'; }
        else {
          let k = null; try { k = await Kat.szukajWKatalogu(sb, pyt); } catch { k = null; }
          if (k) { sciezka = 'katalog'; typ = `${k.karty.length} kart: ` + k.karty.map((x) => x.typ).join(','); }
          else {
            // model (symulacja): heurystyka EF — pytanie „o mnie" zostaje w modelu, inne → poza_danymi → sieć (jeśli strażnik puści)
            const n = R.normalizuj(pyt);
            const oMnie = /\b(mam|moj|moje|moja|moich|mi\b|mnie|powinienem|powinnam|spalil|przebieg|forme|forma|trening|plan|kontuzj|znajom|trener)/.test(n);
            const blokada = P.wygladaNaOsobe(pyt);
            if (oMnie || blokada) { sciezka = 'MODEL (sym.)'; koszt = kosztModel; typ = 'poza danymi / „Nie mam tego w Twoich danych.”'; }
            else { sciezka = 'MODEL→SIEĆ (sym.)'; koszt = kosztSiec; typ = 'zdania z sieci ze źródłami (jeśli znajdzie)'; }
          }
        }
      }
    }
    wiersze.push({ pyt, kat, waga, sciezka, typ, koszt, ocena, co });
  }
  return wiersze;
}

function raport(w) {
  const ocenaTxt = { dobra: 'dobra', pusta: 'PUSTA', zla: 'ZŁA', za_droga: 'ZA DROGA' };
  const md = ['# Ławka pytań okienka — ' + new Date().toISOString().slice(0, 10), '',
    'Ścieżki lokalne na atrapach (kształt konta testowego); MODEL/SIEĆ symulowane (koszt ze średnich okienko_log 1.11).', '',
    '| # | pytanie | kat. | ścieżka | odpowiedź | koszt | ocena | co trzeba |', '|---|---|---|---|---|---|---|---|'];
  w.forEach((r, i) => md.push(`| ${i + 1} | ${r.pyt} | ${r.kat} | ${r.sciezka} | ${r.typ.replace(/\|/g, '/')} | ${r.koszt ? usd(r.koszt) : '0' } | ${ocenaTxt[r.ocena]} | ${r.co} |`));
  const kara = { dobra: 0, pusta: 2, zla: 3, za_droga: 2 };
  const luki = w.filter((r) => r.ocena !== 'dobra').map((r) => ({ ...r, w: r.waga * kara[r.ocena] })).sort((a, b) => b.w - a.w).slice(0, 10);
  md.push('', '## 10 najważniejszych luk (waga „ile osób zapyta” 1–5 × kara: pusta 2, za droga 2, zła 3)', '');
  luki.forEach((r, i) => md.push(`${i + 1}. **${r.pyt}** (${r.waga}×${kara[r.ocena]}=${r.w}) — ${ocenaTxt[r.ocena]}: ${r.co}`));
  const sumy = {};
  for (const r of w) sumy[r.ocena] = (sumy[r.ocena] || 0) + 1;
  md.push('', 'Podsumowanie: ' + Object.entries(sumy).map(([k, v]) => `${ocenaTxt[k]} ${v}`).join(', ') + ' z ' + w.length + '; koszt sumy 50 pytań (symulacja): ' + usd(w.reduce((s, r) => s + r.koszt, 0)) + '.', '');
  return md.join('\n');
}

(async () => {
  const w = await przebieg();
  const md = raport(w);
  const ie = process.argv.indexOf('--etap');
  const etap = ie > 0 && process.argv[ie + 1] ? '-' + process.argv[ie + 1].replace(/[^a-z0-9-]/gi, '') : '';
  const plik = path.join(KORZEN, 'docs', 'lawka-pytan-' + new Date().toISOString().slice(0, 10) + etap + '.md');
  fs.writeFileSync(plik, md, 'utf8');
  if (!process.argv.includes('--md')) console.log(md);
  console.error('zapisano', path.relative(KORZEN, plik));
})();

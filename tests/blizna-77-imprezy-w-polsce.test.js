/* BLIZNA 77 (1.11.2026, K4): „W Polsce" w races.html — kalendarz maszyny wyników przez window.IMPREZY (sb.js).

   Ryzyka:
   1) WYWOŁANIA. Lista okresu = upcoming_races (do 300; więcej → „uciete", licznik z plusem); szukaj (≥ 3 znaki) =
      events_search (K-API 017, ≤ 20). events_search bez słów zapytania nic nie zwraca — lista okresu nie może przez nie iść.
   2) PAMIĘĆ 1 h w sessionStorage (klucz = okres + szukaj); po godzinie świeże zapytanie.
   3) DUBLE. Impreza, która jest w naszych startach (races approved: data ±1, nazwa bez cyfr/znaków), nie pokazuje się drugi raz.
   4) AWARIA. Brak sieci → zdanie „Brak połączenia — nie można wczytać kalendarza." (bmStanOffline, lista blizna-49);
      inne błędy (wyłączone, bez sesji, serwer) → sekcja znika. Nigdy „0 imprez", gdy nie wiadomo.
   5) LINKI zewnętrzne tylko przez safeExternalHref {tylkoHttps}, rel noopener; tekst przez escapeHtml. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladujSb } = require('./_srodowisko.js');

const RACES = fs.readFileSync(path.join(__dirname, '..', 'races.html'), 'utf8').replace(/\r/g, '');
const TERAZ = new Date('2026-11-01T10:00:00Z');

function swiat({ dostepne = true, odp = null } = {}) {
  const ctx = zaladujSb();
  const mag = new Map();
  ctx.sessionStorage = { getItem: (k) => (mag.has(k) ? mag.get(k) : null), setItem: (k, v) => mag.set(k, String(v)), removeItem: (k) => mag.delete(k) };
  const wolania = [];
  ctx.wynikiApiDostepne = () => dostepne;
  ctx.wynikiApi = () => ({ rpc: async (nazwa, args) => { wolania.push({ nazwa, args }); return typeof odp === 'function' ? odp(nazwa, args) : odp || { data: [], error: null }; } });
  return { I: ctx.IMPREZY, wolania, mag, ctx };
}
const UR = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ group_key: 'g' + i, name: 'Bieg ' + i, event_date: '2026-11-1' + (i % 9), city: 'Poznań', distances: [10], source_url: 'https://dostartu.pl/' + i, ...extra }));

test('lista okresu → upcoming_races (p_from/p_to, lim 300); szukaj ≥ 3 znaki → events_search (p_limit 20)', async () => {
  const s = swiat({ odp: { data: UR(3), error: null } });
  const w = await s.I.szukaj({}, { okres: '30', teraz: TERAZ });
  assert.equal(JSON.stringify(s.wolania[0]), JSON.stringify({ nazwa: 'upcoming_races', args: { p_from: '2026-11-01', p_to: '2026-12-01', lim: 300 } }));
  assert.equal(w.liczba, 3); assert.equal(w.uciete, false);
  await s.I.szukaj({}, { okres: '90', q: 'kotlina', teraz: TERAZ });
  assert.equal(JSON.stringify(s.wolania[1]), JSON.stringify({ nazwa: 'events_search', args: { p_q: 'kotlina', p_from: '2026-11-01', p_to: '2027-01-31', p_limit: 20 } }));
  await s.I.szukaj({}, { okres: '365', q: 'ab', teraz: TERAZ });
  assert.equal(s.wolania[2].nazwa, 'upcoming_races', '< 3 znaki = lista okresu');
  assert.equal(s.wolania[2].args.p_to, '2027-11-01');
});

test('300 wierszy → uciete (licznik „300+"); pamięć 1 h: drugie wejście bez zapytania, po godzinie świeże', async () => {
  const s = swiat({ odp: { data: UR(300), error: null } });
  const w = await s.I.szukaj({}, { okres: '30', teraz: TERAZ });
  assert.equal(w.uciete, true); assert.equal(w.liczba, 300);
  await s.I.szukaj({}, { okres: '30', teraz: TERAZ });
  assert.equal(s.wolania.length, 1, 'z pamięci');
  const [k, v] = [...s.mag.entries()][0];
  assert.match(k, /^imprezy:30\|$/);
  const st = JSON.parse(v); st.t -= 3600 * 1000 + 1; s.mag.set(k, JSON.stringify(st));
  await s.I.szukaj({}, { okres: '30', teraz: TERAZ });
  assert.equal(s.wolania.length, 2, 'po godzinie świeże');
});

test('dedup z naszymi startami: data ±1 i nazwa bez cyfr/polskich znaków; inna data albo nazwa zostaje', async () => {
  const dane = [
    { name: '12. Poznański Bieg Niepodległości', event_date: '2026-11-11', city: 'Poznań', distances: [10] },
    { name: 'Bieg Mikołajkowy', event_date: '2026-12-06', city: 'Poznań', distances: [5] },
    { name: 'Inny Bieg', event_date: '2026-11-20', city: 'Kraków', distances: [] },
  ];
  const s = swiat({ odp: { data: dane, error: null } });
  const nasze = [{ name: 'Poznanski Bieg Niepodleglosci', date: '2026-11-10', status: 'approved' }, { name: 'Bieg Mikołajkowy', date: '2026-12-10' }];
  const w = await s.I.szukaj({}, { okres: '90', naszeStarty: nasze, teraz: TERAZ });
  assert.equal(JSON.stringify(w.lista.map((x) => x.nazwa)), JSON.stringify(['Bieg Mikołajkowy', 'Inny Bieg']));
  assert.equal(w.liczba, 2, 'licznik po dedupie = prawdziwa liczba na liście');
});

test('błędy: brak API → wylaczone bez zapytania; kod z wyniki-api przechodzi do strony', async () => {
  const s = swiat({ dostepne: false });
  assert.equal(JSON.stringify(await s.I.szukaj({}, { okres: '30', teraz: TERAZ })), JSON.stringify({ blad: 'wylaczone' }));
  assert.equal(s.wolania.length, 0);
  const o = swiat({ odp: { data: null, error: { kod: 'offline' } } });
  assert.equal(JSON.stringify(await o.I.szukaj({}, { okres: '30', teraz: TERAZ })), JSON.stringify({ blad: 'offline' }));
  assert.equal(o.mag.size, 0, 'błąd nie trafia do pamięci');
});

test('races.html: sekcja hidden, start tylko przy dostępnym API; offline → bmStanOffline(„kalendarza"), inne błędy → sekcja znika', () => {
  assert.match(RACES, /<section class="st-card" id="imprezy-sekcja" hidden/);
  assert.match(RACES, /if \(apiWynikow && window\.IMPREZY\) imprezyStart\(\);/);
  assert.match(RACES, /if \(w\.blad === 'offline' \|\| w\.blad === 'siec' \|\| w\.blad === 'timeout'\) \{[^}]*window\.bmStanOffline\(lista, 'kalendarza'\); \}\s*\n\s*else if \(sekcja\) sekcja\.hidden = true;/);
  assert.match(RACES, /data-okres="30">30 dni</); assert.match(RACES, /data-okres="90">3 mies\.</); assert.match(RACES, /data-okres="365">rok</);
  assert.match(RACES, /placeholder="Szukaj po nazwie lub mieście"/);
  const sb = fs.readFileSync(path.join(__dirname, '..', 'sb.js'), 'utf8');
  assert.match(sb, /t\.textContent = 'Brak połączenia — nie można wczytać ' \+ \(co \|\| 'danych'\) \+ '\.';/, 'zdanie z listy blizna-49');
});

test('races.html: linki tylko safeExternalHref {tylkoHttps} + rel noopener; tekst przez escapeHtml; licznik z prawdziwej liczby', () => {
  const f = RACES.slice(RACES.indexOf('async function imprezyLaduj()'), RACES.indexOf('// ── INIT'));
  assert.match(f, /window\.safeExternalHref\(i\.url, \{ tylkoHttps: true \}\)/);
  assert.match(f, /rel="noopener noreferrer"/);
  assert.match(f, /escapeHtml\(i\.nazwa\)/); assert.match(f, /escapeHtml\(meta\)/);
  assert.match(f, /\(w\.uciete \? w\.liczba \+ '\+' : w\.liczba\)/);
  assert.match(f, /if \(nr !== _imprezyNr\) return;/, 'starsza odpowiedź nie nadpisuje nowszej');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'wyniki-api.js'), 'utf8'), /'event_course_status', 'events_search',/);
});

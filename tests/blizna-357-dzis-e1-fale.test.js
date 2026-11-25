// Blizna #357 (25.11.2026) — nowe Dziś, etap E1, commit 2: dane w falach.
//
// Stare Dziś robi przy wejściu ok. 90 zapytań w ok. 12 falach i pyta o profil zawodnika 7 razy (bot dymny 25.11).
// Nowe ma od początku stały budżet i ten test go pilnuje: 2 fale, 5 zapytań, profil RAZ.
//   fala 1: profil zawodnika + akcja_licznik + akcja_moj_wklad (żadne nie czeka na drugie),
//   fala 2: trening na dziś + ostatnie wpisy (potrzebują id zawodnika z fali 1).
// „Fala” = zapytania wysłane, zanim przyszła odpowiedź na którekolwiek z poprzedniej fali. Atrapa klienta bazy trzyma
// każde zapytanie otwarte, aż test sam na nie odpowie, więc numer fali jest policzony, a nie zgadnięty z czasu.
// Reguła 14 dni (Filip 25.11): ostatni trening do 14 dni „N dni temu”, starszy „X tygodni temu”.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MODUL = fs.readFileSync(path.join(__dirname, '..', 'js', 'dzis-nowy.mjs'), 'utf8').replace(/\r\n/g, '\n');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tik = async (n = 12) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const KONTO_PROBY = 'konto-proby';

const WPISY = [
  { id: 'l1', logged_at: '2026-11-24T17:10:00', training_type: 'Spokojny', distance_km: 8.21, duration: '44:36', pace: '5:26', heart_rate: 142, elevation_gain: 35, feel: null },
  { id: 'l2', logged_at: '2026-11-22T09:00:00', training_type: 'Wybieganie', distance_km: 16.4, duration: '1:32:05', pace: '5:37/km', heart_rate: null, elevation_gain: 120, feel: null },
  { id: 'l3', logged_at: '2026-11-20T18:00:00', training_type: 'Interwały', distance_km: 9, duration: '47:10', pace: '5:14', heart_rate: 158, elevation_gain: null, feel: null },
];
const ODPOWIEDZI = {
  athletes: { data: { id: 'a-1', full_name: 'Ola Nowak', coach_id: 'c-1' }, error: null },
  'rpc akcja_licznik': { data: { wystartowala: true, nazwa: 'Ulica próbna', suma_km: 12345.6, cel_km: 20000, pct: 61.7 }, error: null },
  'rpc akcja_moj_wklad': { data: { km: 42.3 }, error: null },
  trainings: { data: [{ id: 't1', date: '2026-11-25', type: 'Interwały', distance_km: 8, duration_min: null, pace: '4:30', description: 'Rozgrzewka 2 km, potem 4 × 1 km.', status: 'planned', plan_source: null, coach_id: 'c-1' }], error: null },
  training_logs: { data: WPISY, error: null },
};

/* Atrapa strony z klientem bazy, który zapisuje każde zapytanie (kolejność, fala, łańcuch) i odpowiada dopiero na polecenie testu. */
function strona({ search = '', odpowiedzi = {}, sesja = { user: { id: 'u-1' } }, online = true, bezKlienta = false, bezAkcji = false } = {}) {
  const klasy = new Set(['dzis-nowy']);
  const wezly = {};
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', hidden: sel.includes('licznik'), _a: { 'aria-busy': 'true' }, removeAttribute(k) { delete this._a[k]; },
    querySelector(s2) { return wezel(sel + ' ' + s2); } });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; },
    querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; } };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: '—' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'nav-mount': { querySelectorAll: () => [] } };
  const zapytania = [], wpisy = [], czasomierze = [], sluchacze = {};
  let fala = 1, otwarte = 0, odebraneWFali = false, zegar = 1e12;
  function wyslij(nazwa, opis) {
    if (odebraneWFali) { fala++; odebraneWFali = false; }
    const z = { nazwa, opis, fala, stan: 'czeka' }; zapytania.push(z); otwarte++;
    return new Promise((ok, zle) => { z.odpowiedz = (r) => { if (z.stan !== 'czeka') return; z.stan = 'jest'; otwarte--; odebraneWFali = true; if (r instanceof Error) zle(r); else ok(r); }; });
  }
  function lancuch(tabela) {
    const kroki = []; let p = null;
    const q = new Proxy({}, { get(_, k) {
      if (k === 'then') return (a, b) => (p = p || wyslij(tabela, kroki.join('.'))).then(a, b);
      return (...arg) => { kroki.push(k + '(' + arg.map((x) => JSON.stringify(x)).join(',') + ')'); return q; };
    } });
    return q;
  }
  const sb = { from: (t) => lancuch(t), rpc: (n, a) => { let p = null; return { then: (x, y) => (p = p || wyslij('rpc ' + n, JSON.stringify(a))).then(x, y) }; },
    auth: { getSession: async () => ({ data: { session: sesja } }) } };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, showSection(n) { this._currentSection = n; }, _logKlienta(o) { wpisy.push(o); },
    navigator: { onLine: online }, setTimeout(f, ms) { czasomierze.push({ f, ms, zywy: true }); return czasomierze.length; }, clearTimeout(i) { if (czasomierze[i - 1]) czasomierze[i - 1].zywy = false; },
    BM_AKCJA_CYTATY: bezAkcji ? undefined : { slugDla: (id) => (id === KONTO_PROBY ? 'proba' : 'ulica-glowna') } };
  if (!bezKlienta) w.sb = sb;
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener(n, f) { sluchacze[n] = f; } };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(2026, 10, 25, 12, 0, 0); } static now() { return zegar; }
    toISOString() { return '1999-01-01T00:00:00.000Z'; } };   // klucz dnia ma iść z lokalnych pól daty: kto sięgnie po UTC, dostanie rok 1999 i test (1) to złapie
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  /** Odpowiada na wszystko, co czeka, falami, aż nic nie zostanie. → liczba fal. */
  async function doKonca() {
    await tik();
    for (let i = 0; i < 10 && otwarte; i++) {
      for (const z of zapytania.filter((x) => x.stan === 'czeka')) { const r = z.nazwa in odpowiedzi ? odpowiedzi[z.nazwa] : ODPOWIEDZI[z.nazwa]; z.odpowiedz(typeof r === 'function' ? r(z) : r); }
      await tik();
    }
    return fala;
  }
  return { w, d, klasy, korzen, wezly, wezel, zapytania, wpisy, czasomierze, sluchacze, doKonca, tik, B: w.BM_DZIS, przesunZegar: (ms) => { zegar += ms; }, kafel: (n) => wezel('[data-kafel="' + n + '"]') };
}

test('(1) budżet pierwszego ekranu: 2 fale, 5 zapytań, profil raz; fala 1 = profil + licznik + mój wkład, fala 2 = trening + wpisy', async () => {
  const s = strona();
  s.B.start(); await s.tik();
  assert.deepEqual(s.zapytania.map((z) => z.nazwa), ['rpc akcja_licznik', 'rpc akcja_moj_wklad', 'athletes'], 'fala 1 wychodzi razem, zanim cokolwiek odpowie');
  assert.equal(await s.doKonca(), 2, 'dokładnie dwie fale');
  assert.deepEqual(s.zapytania.map((z) => [z.fala, z.nazwa]), [[1, 'rpc akcja_licznik'], [1, 'rpc akcja_moj_wklad'], [1, 'athletes'], [2, 'trainings'], [2, 'training_logs']]);
  assert.equal(s.zapytania.filter((z) => z.nazwa === 'athletes').length, 1, 'profil zawodnika pytany RAZ');
  const [licznik, wklad, profil, trening, wpisy] = s.zapytania;
  assert.equal(licznik.opis, '{"p_slug":"ulica-glowna"}'); assert.equal(wklad.opis, '{"p_slug":"ulica-glowna"}');
  assert.equal(profil.opis, 'select("id,full_name,coach_id").eq("user_id","u-1").maybeSingle()');
  assert.equal(trening.opis, 'select("id,date,type,distance_km,duration_min,pace,description,status,plan_source,coach_id").eq("athlete_id","a-1").eq("date","2026-11-25").order("created_at").limit(3)', 'dzień z LOKALNEGO zegara');
  assert.equal(wpisy.opis, 'select("id,logged_at,training_type,distance_km,duration,pace,heart_rate,elevation_gain,feel").eq("athlete_id","a-1").not("training_type","like","__badge__%").order("logged_at",{"ascending":false}).limit(6)', 'jedno zapytanie na ostatni trening i listę, bez odznak');
  assert.deepEqual(plain(await s.B.profil()), ODPOWIEDZI.athletes.data, 'BM_DZIS.profil() oddaje ten sam profil kolejnym kaflom, bez nowego zapytania');
  assert.equal(s.zapytania.length, 5);
  assert.deepEqual(s.wpisy, [], 'udane wczytanie niczego nie zgłasza');
  assert.equal(s.czasomierze.every((c) => !c.zywy), true, 'limity czasu zdjęte po odpowiedziach');
});

test('(2) ponowny start (initAuth, powrót do aplikacji) nie pyta drugi raz przez 60 s; po 60 s i po „Spróbuj ponownie” pyta', async () => {
  const s = strona();
  s.B.start(); s.B.start(); await s.doKonca(); s.B.start(); await s.doKonca();
  assert.equal(s.zapytania.length, 5, 'trzy starty, jedno wczytanie');
  s.przesunZegar(59000); s.B.start(); await s.doKonca();
  assert.equal(s.zapytania.length, 5);
  s.przesunZegar(2000); s.B.start(); await s.doKonca();
  assert.equal(s.zapytania.length, 10, 'po minucie świeże dane');
  s.korzen._zd.click({ target: { closest: () => ({ getAttribute: (k) => (k === 'data-dn' ? 'ponow' : null) }) } }); await s.doKonca();
  assert.equal(s.zapytania.length, 15, 'przycisk wymusza wczytanie');
});

test('(3) kafle z danymi: Ulica z licznikiem i wkładem, Trening na dziś, Ostatni trening, lista od przedostatniego; imię z profilu', async () => {
  const s = strona();
  s.B.start(); await s.tik();
  s.zapytania[0].odpowiedz(ODPOWIEDZI['rpc akcja_licznik']); await s.tik();
  assert.equal(s.kafel('ulica').innerHTML, '', 'licznik czeka na profil: dopiero on mówi, czyja to akcja');
  await s.doKonca();
  const u = s.kafel('ulica');
  assert.match(u.innerHTML, /<h2 class="dn-etykieta">Ulica<\/h2><div class="dn-kto">Ulica próbna<\/div>/);
  assert.match(u.innerHTML, /<b>12 346<\/b><span>z 20 000 km · 62%<\/span>/, 'procent jak na starej karcie: od 10% bez ułamka');
  assert.match(u.innerHTML, /href="ulica-glowna\.html#ulica-po">Zobacz ulicę ›<\/a>/);
  assert.match(u.innerHTML, /aria-valuenow="62"><i style="width:61\.7%">/);
  assert.equal(s.wezel('[data-kafel="ulica"] [data-dn="wklad"]').innerHTML, 'Twój wkład: <b>42 km</b>');
  assert.equal(u.hidden, false); assert.equal('aria-busy' in u._a, false);
  const t = s.kafel('trening').innerHTML;
  assert.match(t, /<h2 class="dn-etykieta">Trening na dziś<\/h2><div class="dn-kto">od trenera<\/div>/);
  assert.match(t, /<span class="dn-typ">Interwały<\/span><span class="dn-cel">8 km · 4:30 \/km<\/span>/);
  assert.match(t, /<p class="dn-tekst">Rozgrzewka 2 km, potem 4 × 1 km\.<\/p>/);
  assert.match(t, /href="kalendarz\.html\?role=athlete">Plan ›/);
  const o = s.kafel('ostatni').innerHTML;
  assert.match(o, /<div class="dn-kto">Spokojny · wczoraj<\/div>/);
  assert.deepEqual([...o.matchAll(/<b[^>]*>([^<]*)(?:<small>([^<]*)<\/small>)?<\/b><span>([^<]*)<\/span>/g)].map((m) => [m[1], m[2] || '', m[3]]), [['8,21', 'km', 'dystans'], ['44:36', '', 'czas'], ['5:26', '/km', 'tempo'], ['142', 'bpm', 'tętno śr.']]);
  const l = s.kafel('lista').innerHTML;
  assert.deepEqual([...l.matchAll(/<span class="dn-w-co">([^<]*)<small>([^<]*)<\/small>/g)].map((m) => [m[1], m[2]]), [['Wybieganie', 'nd 22.11'], ['Interwały', 'pt 20.11']], 'lista zaczyna się od przedostatniego');
  assert.match(l, /<b>16,4 km<\/b> · 1:32:05 · 5:37 \/km/);
  assert.equal(s.wezel('[data-dn="powitanie"]').textContent, 'Cześć, Ola');
});

test('(4) stany puste i brzegowe: bez planu, dzień wolny, zero wpisów, jeden wpis, akcja przed startem, wkład 0 km, brak modułu akcji', async () => {
  const pusty = strona({ odpowiedzi: { trainings: { data: [], error: null }, training_logs: { data: [], error: null }, 'rpc akcja_licznik': { data: { wystartowala: false }, error: null } } });
  pusty.B.start(); await pusty.doKonca();
  assert.match(pusty.kafel('trening').innerHTML, /<div class="dn-kto">bez planu<\/div>.*<h3 class="dn-tytul">Dziś bez planu<\/h3>/);
  assert.match(pusty.kafel('ostatni').innerHTML, /<h3 class="dn-tytul">Jeszcze pusto<\/h3>/);
  assert.equal(pusty.kafel('lista').hidden, true, 'pusta lista schowana');
  assert.equal(pusty.kafel('ulica').hidden, true, 'akcja przed startem: kafel schowany');
  assert.deepEqual(pusty.wpisy, []);
  const jeden = strona({ odpowiedzi: { training_logs: { data: WPISY.slice(0, 1), error: null }, 'rpc akcja_moj_wklad': { data: { km: 0 }, error: null },
    trainings: { data: [{ type: 'Wolne', description: '' }, { type: 'Spokojny', distance_km: 5, duration_min: 30, status: 'done', plan_source: 'generator', description: 'x'.repeat(200) }], error: null } } });
  jeden.B.start(); await jeden.doKonca();
  assert.equal(jeden.kafel('lista').hidden, true, 'jeden wpis stoi w „Ostatni trening”, lista schowana');
  assert.equal(jeden.wezel('[data-kafel="ulica"] [data-dn="wklad"]').innerHTML, 'Twój wkład: <b>0 km</b>. Spacer też buduje ulicę.');
  const t = jeden.kafel('trening').innerHTML;
  assert.match(t, /<h3 class="dn-tytul">Dzień wolny<\/h3><p class="dn-tekst">Odpoczynek też buduje formę\.<\/p>/);
  assert.match(t, /<span class="dn-cel">5 km · 30 min<\/span><span class="dn-zrobione">zrobione<\/span>/);
  assert.match(t, /<p class="dn-tekst">x{157}…<\/p>/, 'długi opis ucięty');
  const bezAkcji = strona({ bezAkcji: true });
  bezAkcji.B.start(); await bezAkcji.doKonca();
  assert.deepEqual(bezAkcji.zapytania.map((z) => z.nazwa), ['athletes', 'trainings', 'training_logs'], 'bez modułu akcji nie zgadujemy, o którą akcję pytać');
  assert.equal(bezAkcji.kafel('ulica').hidden, true);
  const xss = strona({ odpowiedzi: { athletes: { data: { id: 'a-1', full_name: '<i>x</i>' }, error: null }, 'rpc akcja_licznik': { data: { wystartowala: true, nazwa: '<img src=x>', suma_km: 1, cel_km: 2 }, error: null },
    trainings: { data: [{ type: '<b>t</b>', description: '<script>1</script>' }], error: null }, training_logs: { data: [{ training_type: '<u>l</u>', feel: '<s>f</s>', logged_at: 'zła data' }, { training_type: '<u>l2</u>' }], error: null } } });
  xss.B.start(); await xss.doKonca();
  for (const n of ['ulica', 'trening', 'ostatni', 'lista']) assert.doesNotMatch(xss.kafel(n).innerHTML, /<img src=x>|<b>t<\/b>|<script>|<u>l|<s>f<\/s>/, n + ': tekst z bazy escapowany');
  assert.match(xss.kafel('ulica').innerHTML, /&lt;img src=x&gt;/); assert.match(xss.kafel('trening').innerHTML, /&lt;b&gt;t&lt;\/b&gt;.*&lt;script&gt;/);
  assert.match(xss.kafel('ostatni').innerHTML, /&lt;u&gt;l&lt;\/u&gt;/); assert.doesNotMatch(xss.kafel('ostatni').innerHTML, /s&gt;f|<s>/, 'odczucie spoza słownika w ogóle nie trafia na ekran (blizna-359)'); assert.match(xss.kafel('lista').innerHTML, /&lt;u&gt;l2&lt;\/u&gt;/);
  assert.equal(xss.wezel('[data-dn="powitanie"]').textContent, 'Cześć, <i>x</i>', 'imię idzie przez textContent, nie przez HTML');
  assert.match(xss.kafel('ulica').innerHTML, /<b>1<\/b><span>z 2 km · 50%/, 'bez pct z bazy procent liczony z sumy i celu');
});

test('(5) reguła 14 dni: do 14 dni „N dni temu”, starszy „X tygodni temu”; dni liczone po lokalnym kalendarzu', () => {
  const B = strona().B, teraz = new Date(2026, 10, 25, 8, 0, 0), wstecz = (dni, h = 12) => new Date(2026, 10, 25 - dni, h, 0, 0).toISOString();
  assert.deepEqual([0, 1, 2, 7, 13, 14].map((n) => B.kiedy(wstecz(n), teraz)), ['dziś', 'wczoraj', '2 dni temu', '7 dni temu', '13 dni temu', '14 dni temu']);
  assert.deepEqual([15, 20, 21, 28, 34, 35, 84, 154, 363].map((n) => B.kiedy(wstecz(n), teraz)), ['2 tygodnie temu', '2 tygodnie temu', '3 tygodnie temu', '4 tygodnie temu', '4 tygodnie temu', '5 tygodni temu', '12 tygodni temu', '22 tygodnie temu', '51 tygodni temu']);
  assert.equal(B.kiedy(wstecz(364), teraz), 'ponad rok temu'); assert.equal(B.kiedy(wstecz(2000), teraz), 'ponad rok temu');
  assert.equal(B.kiedy(new Date(2026, 10, 24, 23, 59).toISOString(), new Date(2026, 10, 25, 0, 1)), 'wczoraj', 'dwie minuty przez północ to już wczoraj');
  assert.equal(B.kiedy(new Date(2026, 10, 25, 0, 5).toISOString(), new Date(2026, 10, 25, 23, 50)), 'dziś');
  assert.equal(B.kiedy('zła data', teraz), ''); assert.equal(B.kiedy(wstecz(-1), teraz), 'dziś', 'zegar telefonu do tyłu nie daje „-1 dni temu”');
  assert.match(B.ostatniHtml({ training_type: 'Tempo', logged_at: wstecz(14) }, teraz), /<div class="dn-kto">Tempo · 14 dni temu<\/div>/);
  assert.match(B.ostatniHtml({ training_type: 'Tempo', logged_at: wstecz(15) }, teraz), /<div class="dn-kto">Tempo · 2 tygodnie temu<\/div>/);
  assert.equal(B.kluczDnia(new Date(2026, 0, 5, 0, 30)), '2026-01-05'); assert.equal(B.kluczDnia(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.deepEqual(['44:36', '1:02:05', '0:00', 'ok. 40 min', null].map(B.czas), ['44:36', '1:02:05', '—', '—', '—']);
  assert.deepEqual(['5:26', '5:07/km', '0:00', 'szybko', undefined].map(B.tempo), ['5:26', '5:07', '—', '—', '—']);
  assert.deepEqual([8.214, 16.44, 0, null, 'x'].map(B.km), ['8,21', '16,4', '—', '—', '—']);
  assert.match(B.ostatniHtml({ training_type: 'Spacer', distance_km: 3, feel: 'good', logged_at: wstecz(0) }, teraz), /<b class="dn-slowo">Dobrze<\/b><span>odczucie<\/span>/, 'bez tętna i przewyższenia czwartą liczbą jest odczucie');
  assert.match(B.ostatniHtml({ distance_km: 3, elevation_gain: 80, logged_at: wstecz(0) }, teraz), /<b>80<small>m<\/small><\/b><span>w górę<\/span>/);
});

test('(6) błędy: kafel z „Spróbuj ponownie” i jedno zgłoszenie etapu; brak sieci nie zgłasza; limit 10 s; profil pada, licznik zostaje', async () => {
  const blad = { data: null, error: { message: 'x' } };
  const a = strona({ odpowiedzi: { trainings: blad, training_logs: new Error('sieć'), 'rpc akcja_licznik': blad } });
  a.B.start(); await a.doKonca();
  assert.match(a.kafel('trening').innerHTML, /Nie udało się wczytać\.<\/p><button type="button" class="dn-ponow" data-dn="ponow">Spróbuj ponownie<\/button>/);
  assert.match(a.kafel('ostatni').innerHTML, /data-dn="ponow"/); assert.equal(a.kafel('lista').hidden, true); assert.equal(a.kafel('ulica').hidden, true, 'licznik nie jest konieczny: przy błędzie kafel znika');
  assert.deepEqual(plain(a.wpisy).map((x) => [x.kind, x.message, x.url]).sort(), [['dzis-nowy', 'akcja', '/zawodnik.html'], ['dzis-nowy', 'trening', '/zawodnik.html'], ['dzis-nowy', 'wpisy', '/zawodnik.html']]);
  const off = strona({ online: false, odpowiedzi: { athletes: new Error('sieć') } });
  off.B.start(); await off.doKonca();
  assert.match(off.kafel('trening').innerHTML, /data-dn="ponow"/); assert.deepEqual(off.wpisy, [], 'telefon wie, że nie ma sieci: bez wpisu');
  const p = strona({ odpowiedzi: { athletes: blad } });
  p.B.start(); await p.doKonca();
  assert.deepEqual(p.zapytania.map((z) => z.nazwa), ['rpc akcja_licznik', 'rpc akcja_moj_wklad', 'athletes'], 'bez profilu fala 2 nie wychodzi');
  assert.match(p.kafel('ulica').innerHTML, /12 346/, 'licznik nie zależy od profilu');
  assert.match(p.kafel('trening').innerHTML, /data-dn="ponow"/); assert.match(p.kafel('ostatni').innerHTML, /data-dn="ponow"/);
  assert.deepEqual(plain(p.wpisy).map((x) => x.message), ['profil']);
  assert.equal(await p.B.profil(), null);
  const wisi = strona();
  wisi.B.start(); await wisi.tik();
  assert.deepEqual(wisi.czasomierze.map((c) => c.ms), [10000, 10000, 10000], 'każde zapytanie ma limit 10 s');
  wisi.czasomierze[2].f(); await wisi.tik();   // profil nie odpowiedział w 10 s
  assert.match(wisi.kafel('trening').innerHTML, /data-dn="ponow"/); assert.deepEqual(plain(wisi.wpisy).map((x) => x.message), ['profil']);
  const bezKlienta = strona({ bezKlienta: true });
  bezKlienta.B.start(); await bezKlienta.tik();
  assert.match(bezKlienta.kafel('trening').innerHTML, /data-dn="ponow"/); assert.deepEqual(plain(bezKlienta.wpisy).map((x) => x.message), ['klient']);
});

test('(7) kto nie pyta wcale: podgląd trenera, brak sesji; konto bez wiersza zawodnika wraca na stary ekran; spóźniona odpowiedź nie nadpisuje nowszej', async () => {
  const trener = strona({ search: '?from=trener' });
  trener.B.start(); await trener.doKonca();
  assert.equal(trener.zapytania.length, 0, 'podgląd trenera zostaje na starym ekranie, nowe Dziś nie pyta');
  const bezSesji = strona({ sesja: null });
  bezSesji.B.start(); await bezSesji.doKonca();
  assert.equal(bezSesji.zapytania.length, 0); assert.deepEqual(bezSesji.wpisy, []);
  const nowe = strona({ odpowiedzi: { athletes: { data: null, error: null } } });
  nowe.B.start(); await nowe.doKonca();
  assert.deepEqual(nowe.zapytania.map((z) => z.nazwa), ['rpc akcja_licznik', 'rpc akcja_moj_wklad', 'athletes']);
  assert.equal(nowe.korzen.hidden, true); assert.equal(nowe.klasy.has('dzis-gotowy'), false, 'pierwsze kroki zostają na starym ekranie');
  nowe.w.showSection('home'); nowe.B.start();
  assert.equal(nowe.klasy.has('dzis-gotowy'), false, 'i nie wracają przy kolejnym starcie'); assert.deepEqual(nowe.wpisy, []);
  const s = strona();
  s.B.start(); await s.tik();
  const stare = s.zapytania.slice();
  s.B.wczytaj(true); await s.tik();
  assert.equal(s.zapytania.length, 6);
  stare[2].odpowiedz({ data: { id: 'stary', full_name: 'Stary Profil' }, error: null }); stare[0].odpowiedz(ODPOWIEDZI['rpc akcja_licznik']); await s.tik();
  assert.equal(s.zapytania.length, 6, 'odpowiedź z porzuconego wczytania nie uruchamia fali 2');
  assert.equal(s.kafel('ulica').innerHTML, ''); assert.notEqual(s.wezel('[data-dn="powitanie"]').textContent, 'Cześć, Stary');
});

test('(8) konto próby akcji: w fali 2 pyta o swoją akcję i nie pokazuje cudzego licznika; dalej 2 fale', async () => {
  const s = strona({ odpowiedzi: { athletes: { data: { id: KONTO_PROBY, full_name: 'Test' }, error: null },
    'rpc akcja_licznik': (z) => ({ data: { wystartowala: true, nazwa: z.opis.includes('proba') ? 'Próba' : 'Główna', suma_km: z.opis.includes('proba') ? 7 : 999, cel_km: 100 }, error: null }) } });
  s.B.start();
  assert.equal(await s.doKonca(), 2);
  assert.deepEqual(s.zapytania.map((z) => [z.fala, z.nazwa, z.nazwa.startsWith('rpc') ? z.opis : '']), [[1, 'rpc akcja_licznik', '{"p_slug":"ulica-glowna"}'], [1, 'rpc akcja_moj_wklad', '{"p_slug":"ulica-glowna"}'], [1, 'athletes', ''],
    [2, 'rpc akcja_licznik', '{"p_slug":"proba"}'], [2, 'rpc akcja_moj_wklad', '{"p_slug":"proba"}'], [2, 'trainings', ''], [2, 'training_logs', '']]);
  assert.match(s.kafel('ulica').innerHTML, /<div class="dn-kto">Próba<\/div>.*<b>7<\/b>/);
  assert.doesNotMatch(s.kafel('ulica').innerHTML, /Główna|999/);
  assert.match(s.kafel('ulica').innerHTML, /href="ulica-glowna\.html\?proba=1#ulica-po"/);
});

test('(9) wczesny start: gdy strona jeszcze się czyta i korzenia nie ma, moduł czeka na DOMContentLoaded zamiast zgłaszać błąd', async () => {
  const s = strona();
  const korzen = s.d.getElementById('dzis-nowy'); const oryg = s.d.getElementById;
  s.d.readyState = 'loading'; s.d.getElementById = (id) => (id === 'dzis-nowy' ? null : oryg(id));
  s.B.start(); s.B.start(); await s.tik();
  assert.equal(s.zapytania.length, 0); assert.deepEqual(s.wpisy, [], 'to nie błąd, tylko za wcześnie');
  assert.equal(typeof s.sluchacze.DOMContentLoaded, 'function');
  s.d.readyState = 'interactive'; s.d.getElementById = oryg;
  s.sluchacze.DOMContentLoaded(); await s.doKonca();
  assert.equal(korzen.hidden, false); assert.equal(s.zapytania.length, 5, 'po wczytaniu strony zwykłe dwie fale');
});

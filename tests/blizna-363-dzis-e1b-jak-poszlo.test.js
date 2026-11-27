// Blizna #363 (25.11.2026) — nowe Dziś, E1b: „Jak poszło?”.
//
// Zasada Filipa z 25.11: nikt poza listą obecnych kont nie dostaje nowego Dziś, dopóki nie ma w nim „Jak poszło?”.
// Stare Dziś ma kartę FEEL-REPORT: wpis z zegarka z ostatnich 48 h bez odczucia → cztery miny, notatka, „Zapisz raport”, „Pomiń”.
// Odczucie idzie do trenera i do liczenia formy, więc bez tej karty nowe Dziś po cichu zabierałoby dane.
// Tu to samo w kaflu „Ostatni trening”, z tych samych sześciu wpisów fali 2 (zero nowych zapytań przy wejściu).
// To pierwszy ZAPIS z nowego ekranu. Przed commitem ten sam update przeszedł na prawdziwej bazie w wycofanej transakcji
// (rola właściciela wpisu: 1 wiersz; cudzy wpis: 0 wierszy bez błędu; kod spoza czwórki: odmowa ograniczenia).
// Wiersze w atrapie mają kształt z bazy: feel = null albo kod, external_source = 'intervals' albo null, comment tekst albo null.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const MODUL = czytaj('js/dzis-nowy.mjs');
const HTML = czytaj('zawodnik.html');
const plain = (x) => JSON.parse(JSON.stringify(x));
const tik = async (n = 16) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const TERAZ = new Date(2026, 10, 25, 12, 0, 0).getTime();
const temu = (h) => new Date(TERAZ - h * 3600000).toISOString();
const wpis = (id, h, zmiany) => Object.assign({ id, logged_at: temu(h), training_type: 'Spokojny', distance_km: 8.21, duration: '44:36', pace: '5:26', heart_rate: 142, elevation_gain: 35, feel: null, external_source: 'intervals', comment: null }, zmiany);

function strona({ wpisy = [wpis('l1', 20)], trener = null, pominiete = [], zapis = null, bezPamieci = false } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], zgloszenia = [], czasomierze = [], pamiec = new Map(pominiete.map((id) => ['fr_skip_' + id, '1'])), zapisy = [];
  const stan = { zegar: TERAZ, odswiezen: 0 };
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', value: '', className: '', hidden: /zegarek|zdarzenie|licznik|menu"|foto|trener|jp-kom/.test(sel), disabled: false, _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return k in this._a ? this._a[k] : null; }, removeAttribute(k) { delete this._a[k]; },
    querySelector(s2) { return wezel(sel + ' ' + s2); }, querySelectorAll(s2) { return /jp-mina/.test(s2) ? ['great', 'good', 'mid', 'bad'].map((k) => { const m = wezel(sel + ' mina-' + k); m._a['data-kod'] = k; return m; }) : []; } });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: () => true };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } } };
  const DANE = { athletes: { id: 'a-1', full_name: 'Ola Nowak', coach_id: trener, intervals_athlete_id: null, intervals_connected_at: null, intervals_can_write: null, intervals_token_dead_at: null },
    'rpc akcja_licznik': { wystartowala: false }, 'rpc akcja_moj_wklad': { km: 0 }, trainings: [], training_logs: wpisy };
  const wyslij = (nazwa, opis, tresc) => { const z = { nazwa, opis, tresc, stan: 'czeka' }; zapytania.push(z);
    return new Promise((ok, zle) => { z.odpowiedz = () => { if (z.stan !== 'czeka') return; z.stan = 'jest';
      if (/\.update\(/.test(opis)) { zapisy.push(z); const r = zapis ? zapis(z, stan) : { data: [{ id: 'l1' }], error: null, status: 200 }; if (r instanceof Error) zle(r); else ok(r); }
      else ok({ data: DANE[nazwa], error: null, status: 200 }); }; }); };
  const lancuch = (t) => { const kroki = []; let p = null, tresc = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || wyslij(t, kroki.join(''), tresc)).then(a, b);
    return (...arg) => { if (k === 'update') tresc = plain(arg[0]); kroki.push('.' + k + '(' + arg.map((x) => JSON.stringify(x)).join(',') + ')'); return q; }; } }); return q; };
  const w = { _currentSection: 'home', location: { search: '', hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: { onLine: true }, showSection(n) { this._currentSection = n; }, _logKlienta(o) { zgloszenia.push(o.message); },
    setTimeout(f, ms) { czasomierze.push({ f, ms, zywy: true }); return czasomierze.length; }, clearTimeout(i) { if (czasomierze[i - 1]) czasomierze[i - 1].zywy = false; },
    BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' }, SHARECARD: { otworz: () => Promise.resolve(true) },   // karta dnia z sb.js, jak na prawdziwej stronie (P1d, blizna-411)
    feelSvg: (kod, px) => '<svg data-mina="' + kod + '" width="' + px + '"></svg>', FEEL_ETYKIETY: { bad: 'Ciężko', mid: 'Przeciętnie', good: 'Dobrze', great: 'Świetnie' },
    sb: { from: lancuch, rpc: (n) => { let p = null; return { then: (a, b) => (p = p || wyslij('rpc ' + n, '')).then(a, b) }; },
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }), refreshSession: async () => { stan.odswiezen++; return { data: { session: {} }, error: null }; }, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } };
  if (bezPamieci) Object.defineProperty(w, 'localStorage', { get() { throw new Error('zablokowane'); } });
  else w.localStorage = { getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null), setItem: (k, v) => pamiec.set(k, String(v)) };
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(stan.zegar); } static now() { return stan.zegar; } };
  vm.runInNewContext(MODUL, { window: w, document: d, URLSearchParams, Date: DataT, Promise, encodeURIComponent });
  async function doKonca() { await tik(); for (let i = 0; i < 12 && zapytania.some((z) => z.stan === 'czeka'); i++) { for (const z of zapytania.filter((x) => x.stan === 'czeka')) z.odpowiedz(); await tik(); } }
  const ostatni = wezel('[data-kafel="ostatni"]'), cz = (n) => wezel('[data-kafel="ostatni"] [data-dn="' + n + '"]');
  const dotknij = (co, kod) => korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? co : k === 'data-kod' ? kod : null) } : null) } });
  const miny = () => Object.fromEntries(['great', 'good', 'mid', 'bad'].map((k) => [k, wezel('[data-kafel="ostatni"] mina-' + k)._a['aria-pressed'] || 'false']));
  return { w, korzen, zapytania, zapisy, zgloszenia, czasomierze, pamiec, stan, doKonca, tik, ostatni, cz, dotknij, miny, B: w.BM_DZIS, lista: wezel('[data-kafel="lista"]') };
}

test('(1) kiedy pytamy: wpis z zegarka, do 48 h, bez odczucia, niepominięty; najnowszy taki, nawet gdy nie jest ostatnim treningiem', () => {
  const B = strona().B, k = (wpisy) => { const r = B.kandydatOdczucia(wpisy, TERAZ); return r ? r.id : null; };
  assert.equal(B.OKNO_ODCZUCIA_MS, 48 * 3600 * 1000);
  assert.equal(k([wpis('a', 1)]), 'a');
  assert.equal(k([wpis('a', 47.9)]), 'a'); assert.equal(k([wpis('a', 48.1)]), null, 'starszy niż 48 h: nie pytamy');
  for (const kod of ['bad', 'mid', 'good', 'great']) assert.equal(k([wpis('a', 1, { feel: kod })]), null, 'ma już odczucie: ' + kod);
  assert.equal(k([wpis('a', 1, { external_source: null })]), null, 'wpis ręczny: stare Dziś o niego nie pyta, nowe też nie (decyzja 25.11)');
  assert.equal(k([wpis('a', 1, { external_source: 'strava' })]), null);
  assert.equal(k([wpis('a', 1, { logged_at: 'zła data' })]), null);
  assert.equal(k([wpis('reczny', 2, { external_source: null, feel: 'good' }), wpis('zegarek', 20)]), 'zegarek', 'ostatni trening jest ręczny, wczorajszy z zegarka czeka');
  assert.equal(k([wpis('a', 1, { feel: 'good' }), wpis('b', 5), wpis('c', 30)]), 'b', 'najnowszy pasujący');
  assert.equal(k([]), null); assert.equal(k(null), null);
  assert.equal(strona({ pominiete: ['a'] }).B.kandydatOdczucia([wpis('a', 1), wpis('b', 3)], TERAZ), null, 'po „Pomiń” cisza: starszy wpis nie wskakuje na miejsce pominiętego (blizna-370)');
  assert.equal(strona({ bezPamieci: true }).B.kandydatOdczucia([wpis('a', 1)], TERAZ).id, 'a', 'zablokowana pamięć telefonu nie wywraca ekranu');
  assert.match(HTML, /\.eq\('external_source','intervals'\)\.is\('feel', null\)/, 'te same warunki co stara karta');
  assert.match(HTML, /var od=new Date\(Date\.now\(\)-48\*3600\*1000\)/); assert.match(HTML, /localStorage\.setItem\('fr_skip_'\+_frId,'1'\)/, 'ten sam klucz pominięcia');
});

test('(2) blok w kaflu „Ostatni trening”: cztery miny kreską w kolejności starej karty, notatka, „Zapisz raport”, „Pomiń”; bez nowych zapytań', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  assert.deepEqual(s.zapytania.map((z) => z.nazwa), ['rpc akcja_licznik', 'rpc akcja_moj_wklad', 'athletes', 'trainings', 'training_logs'], 'budżet bez zmian: 5 zapytań');
  assert.match(s.zapytania[4].opis, /^\.select\("id,logged_at,training_type,distance_km,duration,pace,heart_rate,elevation_gain,feel,external_source,comment,card_bg_url"\)/);   // card_bg_url: karta dnia (P1d, blizna-411)
  const h = s.ostatni.innerHTML;
  assert.match(h, /<div class="dn-liczby">.*<\/div><div class="dn-jp" data-dn="jp"><div class="dn-jp-t">Jak poszło\?<small>zegarek tego nie wie<\/small><\/div>/, 'pod czterema liczbami');
  assert.deepEqual([...h.matchAll(/data-dn="jp-mina" data-kod="([a-z]+)" aria-pressed="false"><svg data-mina="([a-z]+)" width="22"><\/svg><span>([^<]+)<\/span>/g)].map((m) => [m[1], m[2], m[3]]),
    [['great', 'great', 'Świetnie'], ['good', 'good', 'Dobrze'], ['mid', 'mid', 'Przeciętnie'], ['bad', 'bad', 'Ciężko']], 'stare miny kreską (feelSvg), kolejność starej karty');
  assert.deepEqual([...HTML.matchAll(/class="feel-btn" data-fr="([a-z]+)"/g)].map((m) => m[1]), ['great', 'good', 'mid', 'bad']);
  assert.match(h, /<div class="dn-jp-pole" data-dn="jp-pole" hidden><textarea data-dn="jp-notatka" rows="3" maxlength="500"[^>]*placeholder="Jak się czułeś\? Co cieszyło, co bolało… \(opcjonalnie\)"><\/textarea>/, 'od blizna-404: pole odczuć schowane do wyboru miny');
  assert.match(h, /data-dn="jp-zapisz">Zapisz raport<\/button><button type="button" class="dn-jp-pomin" data-dn="jp-pomin">Pomiń<\/button>/);
  assert.doesNotMatch(h, /dn-jp-kt/, 'pytamy o trening z kafla: nie trzeba go nazywać drugi raz');
  const inny = strona({ wpisy: [wpis('reczny', 2, { external_source: null, feel: 'good', training_type: 'Spacer' }), wpis('l1', 26, { training_type: 'Wybieganie', distance_km: 16.4 })] }); inny.B.start(); await inny.doKonca();
  assert.match(inny.ostatni.innerHTML, /<div class="dn-kto">Spacer · dziś<\/div>/);
  assert.match(inny.ostatni.innerHTML, /<div class="dn-jp-kt">Wybieganie · wczoraj · 16,4 km<\/div>/, 'pytanie o inny wpis niż w kaflu: nazwany wprost');
  const zKomentarzem = strona({ wpisy: [wpis('l1', 3, { comment: 'Mój opis z zegarka' })] }); zKomentarzem.B.start(); await zKomentarzem.doKonca();
  assert.match(zKomentarzem.ostatni.innerHTML, /<p class="dn-jp-zeg">Z zegarka: Mój opis z zegarka<\/p><textarea[^>]*><\/textarea>/, 'od blizna-404 (decyzja Filipa 26.11): komentarz z zegarka jako szary podpis nad pustym polem');
  for (const [opis, wp] of [['ma odczucie', [wpis('l1', 3, { feel: 'good' })]], ['ręczny', [wpis('l1', 3, { external_source: null })]], ['stary', [wpis('l1', 60)]], ['brak wpisów', []]]) {
    const x = strona({ wpisy: wp }); x.B.start(); await x.doKonca();
    assert.doesNotMatch(x.ostatni.innerHTML, /dn-jp/, opis + ': bez pytania');
  }
  const xss = strona({ wpisy: [wpis('r', 1, { external_source: null, feel: 'good' }), wpis('l1', 5, { training_type: '<img src=x>' })] }); xss.B.start(); await xss.doKonca();
  assert.match(xss.ostatni.innerHTML, /<div class="dn-jp-kt">&lt;img src=x&gt; · dziś/);
});

test('(3) zapis jak w starym: mina → (notatka) → „Zapisz raport” = jeden update po id; potem podziękowanie i odczucie w kaflu', async () => {
  // wpis bez dystansu: karty dnia do niego nie ma (share-card odrzuca), więc to ścieżka „jak w starym” (podziękowanie znika po 2,6 s); z kartą: blizna-411
  const s = strona({ wpisy: [wpis('l1', 20, { heart_rate: null, elevation_gain: null, distance_km: null }), wpis('l0', 70, { feel: 'good' })] }); s.B.start(); await s.doKonca();
  s.dotknij('jp-zapisz'); await s.tik();
  assert.equal(s.zapisy.length, 0); assert.equal(s.cz('jp-kom').textContent, 'Wybierz, jak poszło.', 'bez miny nie zapisujemy (stare: okienko alert)'); assert.equal(s.cz('jp-kom').hidden, false);
  s.dotknij('jp-mina', 'mid'); assert.deepEqual(s.miny(), { great: 'false', good: 'false', mid: 'true', bad: 'false' }); assert.equal(s.cz('jp-kom').hidden, true);
  s.dotknij('jp-mina', 'good'); assert.deepEqual(s.miny(), { great: 'false', good: 'true', mid: 'false', bad: 'false' }, 'wybór można zmienić');
  s.dotknij('jp-mina', 'super'); assert.deepEqual(s.miny().good, 'true', 'kod spoza czwórki ignorowany');
  s.cz('jp-notatka').value = '  nogi ciężkie po wczoraj  ';
  s.dotknij('jp-zapisz'); s.dotknij('jp-zapisz'); await s.tik();
  assert.equal(s.zapytania.filter((z) => /update/.test(z.opis)).length, 1, 'podwójne dotknięcie = jeden zapis');
  const z = s.zapytania.find((x) => /update/.test(x.opis));
  assert.equal(z.nazwa, 'training_logs');
  assert.equal(z.opis, '.update({"feel":"good","comment":"nogi ciężkie po wczoraj"}).eq("id","l1").select("id")', 'te same pola co stara karta, jeden wiersz po id, z odesłaniem id');
  assert.equal(s.cz('jp-zapisz').disabled, true);
  await s.doKonca();
  assert.equal(s.cz('jp').className, 'dn-jp-ok');
  assert.equal(s.cz('jp').innerHTML, '<b>Zapisane — dzięki!</b><p>Forma policzy się dokładniej.</p>');
  const t = s.czasomierze.filter((c) => c.zywy && c.ms === 2600); assert.equal(t.length, 1, 'podziękowanie znika po 2,6 s, jak w starym');
  t[0].f(); await s.tik();
  assert.doesNotMatch(s.ostatni.innerHTML, /dn-jp/, 'blok znika');
  assert.match(s.ostatni.innerHTML, /<b class="dn-slowo">Dobrze<\/b><span>odczucie<\/span>/, 'odczucie od razu widać w kaflu, bez ponownego pytania bazy');
  assert.equal(s.zapytania.length, 6, '5 przy wejściu + 1 zapis; żadnego odświeżania po zapisie');
  assert.deepEqual(s.zgloszenia, []);
});

test('(4) notatka: pusta nie idzie; komentarz z zegarka zostaje, nowy tekst się dokleja; trzy zdania po zapisie co do słowa jak w starym', async () => {
  const pusta = strona(); pusta.B.start(); await pusta.doKonca();
  pusta.cz('jp-notatka').value = '   '; pusta.dotknij('jp-mina', 'great'); pusta.dotknij('jp-zapisz'); await pusta.tik();
  assert.equal(pusta.zapytania.find((x) => /update/.test(x.opis)).opis, '.update({"feel":"great"}).eq("id","l1").select("id")');
  // od blizna-404 (decyzja Filipa 26.11): komentarz z zegarka nie stoi w polu; pusty tekst nie idzie, nowy dokleja się po \n
  const bezTekstu = strona({ wpisy: [wpis('l1', 3, { comment: 'Opis z zegarka' })] }); bezTekstu.B.start(); await bezTekstu.doKonca();
  bezTekstu.cz('jp-notatka').value = ''; bezTekstu.dotknij('jp-mina', 'bad'); bezTekstu.dotknij('jp-zapisz'); await bezTekstu.tik();
  assert.equal(bezTekstu.zapytania.find((x) => /update/.test(x.opis)).opis, '.update({"feel":"bad"}).eq("id","l1").select("id")', 'bez nowego tekstu: pola comment nie wysyłamy, komentarz z zegarka nietknięty');
  const zKom = strona({ wpisy: [wpis('l1', 3, { comment: 'Opis z zegarka' })] }); zKom.B.start(); await zKom.doKonca();
  zKom.cz('jp-notatka').value = 'potem kolka'; zKom.dotknij('jp-mina', 'bad'); zKom.dotknij('jp-zapisz'); await zKom.tik();
  assert.equal(zKom.zapytania.find((x) => /update/.test(x.opis)).opis, '.update({"feel":"bad","comment":"Opis z zegarka\\npotem kolka"}).eq("id","l1").select("id")', 'doklejony po \\n, nie nadpisany');
  const B = strona().B;
  assert.equal(B.podpisPoZapisie('good', true), 'Trener to zobaczy, a forma policzy się dokładniej.');
  assert.equal(B.podpisPoZapisie('bad', true), 'Trener to zobaczy, a forma policzy się dokładniej.');
  assert.equal(B.podpisPoZapisie('good', false), 'Forma policzy się dokładniej.');
  assert.equal(B.podpisPoZapisie('bad', false), 'Zwolnij i przyjrzyj się regeneracji — a jeśli zmęczenie nie mija, to sygnał, żeby poszukać wsparcia trenera.');
  for (const zdanie of ['Trener to zobaczy, a forma policzy się dokładniej.', 'Forma policzy się dokładniej.', 'Zwolnij i przyjrzyj się regeneracji — a jeśli zmęczenie nie mija, to sygnał, żeby poszukać wsparcia trenera.'])
    assert.ok(HTML.includes("'" + zdanie + "'"), 'zdanie ze starej karty (decyzja 19.08.2026): ' + zdanie);
  // z trenerem / bez trenera: to samo źródło co stara flaga _brakTrenera (athletes.coach_id), tylko z profilu fali 1
  assert.match(HTML, /let _maTrenera = !!\(ath && ath\.coach_id\)/); assert.match(HTML, /window\._brakTrenera = _trenerZnany \? !_maTrenera : null;/);
  for (const [trener, kod, oczek] of [['c-1', 'bad', 'Trener to zobaczy, a forma policzy się dokładniej.'], [null, 'bad', 'Zwolnij i przyjrzyj się regeneracji — a jeśli zmęczenie nie mija, to sygnał, żeby poszukać wsparcia trenera.'], [null, 'mid', 'Forma policzy się dokładniej.']]) {
    const s = strona({ trener }); s.B.start(); await s.doKonca(); s.dotknij('jp-mina', kod); s.dotknij('jp-zapisz'); await s.doKonca();
    assert.ok(s.cz('jp').innerHTML.startsWith('<b>Zapisane — dzięki!</b><p>' + oczek + '</p>'), String(trener) + ' / ' + kod);   // pod zdaniem link do karty dnia (blizna-411)
  }
});

test('(5) „Pomiń”: klucz fr_skip_<id> w pamięci telefonu (wspólny ze starym Dziś), blok znika i nie wraca; bez zapisu do bazy', async () => {
  const s = strona({ wpisy: [wpis('l1', 2), wpis('l2', 30)] }); s.B.start(); await s.doKonca();
  s.dotknij('jp-pomin'); await s.tik();
  assert.deepEqual([...s.pamiec.entries()].filter((x) => x[0] !== 'dn_kadr'), [['fr_skip_l1', '1']]);   // dn_kadr = pamięć kadrów nagłówka (blizna-384)
  assert.equal(s.zapisy.length, 0);
  assert.doesNotMatch(s.ostatni.innerHTML, /dn-jp/, 'po „Pomiń” cisza, choć w oknie 48 h jest drugi wpis z zegarka (jak stara karta, blizna-370)'); assert.equal([...s.pamiec.keys()].filter((k) => k !== 'dn_kadr').length, 1);
  s.B.wczytaj(true); await s.doKonca();
  assert.doesNotMatch(s.ostatni.innerHTML, /dn-jp/, 'po ponownym wczytaniu pominięte nie wracają');
  const bez = strona({ bezPamieci: true }); bez.B.start(); await bez.doKonca();
  bez.dotknij('jp-pomin'); await bez.tik();
  assert.equal(bez.korzen.hidden, false, 'zablokowana pamięć: „Pomiń” nie wywraca ekranu');
});

test('(6) błędy zapisu: 0 wierszy z RLS to NIE sukces; komunikat w kaflu, jedno zgłoszenie „odczucie”, wybór zostaje; odrzucony token ponawia raz', async () => {
  for (const [opis, odp] of [['RLS: 200 z pustą tablicą', { data: [], error: null, status: 200 }], ['błąd bazy', { data: null, error: { code: '23514', message: 'check' }, status: 400 }], ['sieć', new Error('sieć')], ['null', { data: null, error: null, status: 204 }]]) {
    const s = strona({ zapis: () => odp }); s.B.start(); await s.doKonca();
    s.dotknij('jp-mina', 'bad'); s.cz('jp-notatka').value = 'x'; s.dotknij('jp-zapisz'); await s.doKonca();
    assert.equal(s.cz('jp-kom').textContent, 'Nie udało się zapisać. Spróbuj ponownie.', opis); assert.equal(s.cz('jp-kom').hidden, false);
    assert.notEqual(s.cz('jp').className, 'dn-jp-ok', opis + ': bez fałszywego „Zapisane”');
    assert.equal(s.cz('jp-zapisz').disabled, false, 'można spróbować jeszcze raz'); assert.equal(s.miny().bad, 'true', 'wybór zostaje');
    assert.deepEqual(s.zgloszenia, ['odczucie'], opis);
    assert.equal(s.czasomierze.filter((c) => c.zywy && c.ms === 2600).length, 0);
    s.dotknij('jp-zapisz'); await s.doKonca();
    assert.equal(s.zapisy.length, 2, 'druga próba idzie'); assert.deepEqual(s.zgloszenia, ['odczucie'], 'zgłoszenie raz na stronę');
  }
  const token = strona({ zapis: (z, st) => (st.odswiezen === 0 ? { data: null, error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 } : { data: [{ id: 'l1' }], error: null, status: 200 }) });
  token.B.start(); await token.doKonca(); token.dotknij('jp-mina', 'good'); token.dotknij('jp-zapisz'); await token.doKonca();
  assert.equal(token.stan.odswiezen, 1); assert.equal(token.zapisy.length, 2, 'odświeżenie sesji i jedno ponowienie');
  assert.equal(token.cz('jp').className, 'dn-jp-ok'); assert.deepEqual(token.zgloszenia, []);
  const martwy = strona({ zapis: () => ({ data: null, error: { message: 'JWT expired' }, status: 401 }) });
  martwy.B.start(); await martwy.doKonca(); martwy.dotknij('jp-mina', 'good'); martwy.dotknij('jp-zapisz'); await martwy.doKonca();
  assert.equal(martwy.zapisy.length, 2, 'bez pętli'); assert.equal(martwy.cz('jp-kom').textContent, 'Nie udało się zapisać. Spróbuj ponownie.');
  const offline = strona({ zapis: () => new Error('sieć') }); offline.w.navigator.onLine = false;
  offline.B.start(); await offline.doKonca(); offline.dotknij('jp-mina', 'good'); offline.dotknij('jp-zapisz'); await offline.doKonca();
  assert.deepEqual(offline.zgloszenia, [], 'bez sieci komunikat jest, zgłoszenia nie ma');
});

test('(7) ponowne wczytanie danych (powrót do aplikacji, ↺) nie kasuje wybranej miny ani notatki; czysty blok odświeża się normalnie', async () => {
  const s = strona(); s.B.start(); await s.doKonca();
  s.dotknij('jp-mina', 'mid'); s.cz('jp-notatka').value = 'piszę…';
  const przed = s.ostatni.innerHTML;
  s.ostatni.innerHTML = przed + '<!-- znacznik -->';
  s.B.wczytaj(true); await s.doKonca();
  assert.match(s.ostatni.innerHTML, /<!-- znacznik -->$/, 'kafel nieprzerysowany: ktoś właśnie odpowiada');
  s.dotknij('jp-zapisz'); await s.tik();
  assert.equal(s.zapytania.filter((z) => /update/.test(z.opis)).pop().opis, '.update({"feel":"mid","comment":"piszę…"}).eq("id","l1").select("id")');
  const czysty = strona(); czysty.B.start(); await czysty.doKonca();
  czysty.ostatni.innerHTML += '<!-- znacznik -->';
  czysty.B.wczytaj(true); await czysty.doKonca();
  assert.doesNotMatch(czysty.ostatni.innerHTML, /znacznik/, 'bez wyboru i notatki kafel odświeża się jak zwykle');
});

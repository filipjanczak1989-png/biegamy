/* BLIZNA 418 / 27.11.2026: wyniki biegu stacjonarnego dla osób bez aplikacji, wpisuje organizator (migracja 20261233).
   Zwiad: akcja_bieg_uczestnicy ma konto_id NOT NULL (FK athletes), numer wymagany, imię jednym słowem; czyta ją 28 funkcji (dyplom, odznaka,
   powiadomienia, przypomnienia, panel). Dlatego osobna tabela akcja_bieg_wyniki_org, a ranking (akcja_bieg_ukonczyli) ją dokleja.
   - panel trenera (js/bieg-panel.mjs): sekcja „Wyniki osób bez aplikacji” zwinięta (zero zapytań do rozwinięcia), formularz: imię albo imię + inicjał,
     dystans z listy biegu, czas, dwa wymagane pola (pełnoletnia, zgoda na imię i czas); poprawka i usunięcie tylko przy własnych wpisach;
   - ranking (js/bieg.mjs): dopisek „wpisane przez organizatora”, bez numeru i bez linku do profilu, czas i miejsce jak u innych;
   - migracja: tabela bez polityk i bez uprawnień anon/authenticated, trzy funkcje SECURITY DEFINER z bramką trenera i pustym search_path,
     poprawka i usunięcie tylko autora, ranking i sprzątanie z wpisami organizatora, WYCOFANIE przywraca obie funkcje co do znaku. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = czytaj('supabase/migrations/20261233_akcja_bieg_wyniki_organizatora.sql'), WYC = czytaj('supabase/migrations/20261233_WYCOFANIE_akcja_bieg_wyniki_organizatora.sql');
const czekaj = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

class El {   // mały DOM jak w blizna-281
  constructor(tag) { this.tag = tag; this.dzieci = []; this.attrs = {}; this.style = {}; this.h = {}; this._t = ''; this.rodzic = null; this.checked = false; this.disabled = false; this.value = ''; this.hidden = false; }
  set textContent(v) { this._t = String(v); this.dzieci = []; }
  get textContent() { return this._t + this.dzieci.map((c) => c.textContent).join(''); }
  appendChild(c) { c.rodzic = this; this.dzieci.push(c); return c; }
  remove() { if (this.rodzic) this.rodzic.dzieci = this.rodzic.dzieci.filter((x) => x !== this); }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.h[t] = this.h[t] || []).push(f); }
  wywolaj(t) { (this.h[t] || []).forEach((f) => f.call(this, { target: this })); }
  wszystkie() { return [this, ...this.dzieci.flatMap((c) => c.wszystkie())]; }
  querySelector(s) { const m = /^\[([a-z-]+)\]$/.exec(s); return (m && this.wszystkie().slice(1).find((e) => e.getAttribute(m[1]) != null)) || null; }
}
let P, B;
test.before(async () => {
  globalThis.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: (t) => new El(t) };
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg-panel.mjs')).href);
  P = globalThis.BM_BIEG_PANEL;
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  B = globalThis.BM_BIEG_REAL;
});
test.after(() => { delete globalThis.document; delete globalThis.sb; delete globalThis.BM_OKIENKO; delete globalThis.confirm; });

const BIEG = { slug: 'bieg-mikolajki', nazwa: 'Bieg', dzien_od: '2026-11-18', dzien_do: '2026-12-06', wynik_do: '2026-12-06', zalicz_do: '2099-01-01', faza: 'trwa', dystanse_km: [5, 10], zgody_email: 0 };
/** sb z kolejką odpowiedzi; zapisuje każde wywołanie. */
function klient(odp) {
  const wolania = [];
  globalThis.sb = { rpc: (n, a) => { wolania.push([n, JSON.parse(JSON.stringify(a))]); const f = odp[n]; return Promise.resolve(typeof f === 'function' ? f(a) : f || { data: null, error: null }); } };
  return wolania;
}
const pole = (k, nazwa) => k.wszystkie().find((e) => e.getAttribute('data-org') === nazwa) || null;

test('(1) imię: samo imię albo imię + inicjał (poprawiany do „X.”), z polskimi znakami i łącznikiem; nic więcej', () => {
  const ok = { 'Anna': 'Anna', '  anna   k ': 'anna K.', 'Anna K.': 'Anna K.', 'Zbigniew ż': 'Zbigniew Ż.', 'Anna-Maria': 'Anna-Maria', 'Łucja': 'Łucja', 'Ewa e.': 'Ewa E.' };
  for (const [w, o] of Object.entries(ok)) assert.equal(P.imieOrg(w), o, w);
  for (const zly of ['A', 'Anna Kowalska', 'Anna K. L.', 'Anna 7', 'Anna@x', 'Jan  Kowalski Junior', '', null, 'a'.repeat(25), 'Anna KK', '<b>Ala</b>']) assert.equal(P.imieOrg(zly), null, String(zly));
});

test('(2) wzorzec imienia ten sam w przeglądarce i w bazie (CHECK tabeli i funkcja): te same werdykty na liście imion', () => {
  const m = /imie ~ '(\^\[[^']+\$)'\)/.exec(MIG);
  assert.ok(m, 'CHECK imienia w migracji');
  const sql = new RegExp(m[1]);
  assert.ok(MIG.includes("v_imie !~ '" + m[1] + "'"), 'funkcja sprawdza ten sam wzorzec co CHECK');
  // imiona w postaci, w jakiej trafiają do bazy (po normalizacji: inicjał wielką literą z kropką), bo tylko taka postać dochodzi do CHECK
  for (const t of ['Anna', 'Anna K.', 'Anna K', 'Anna-Maria', 'Łucja Ż.', 'Anna Kowalska', 'A', 'Ąę', 'Anna K. L.', 'Zoë', 'Anna-', 'Jan Ł.', 'Ewa E. ']) {
    const js = P.imieOrg(t) === t;
    assert.equal(sql.test(t) && t.length >= 2 && t.length <= 24, js, t);
  }
});

test('(3) sekcja zwinięta: zwykłe otwarcie panelu bez dodatkowego zapytania; po rozwinięciu formularz i jedno zapytanie o listę', async () => {
  const w = klient({ akcja_bieg_org_lista: { data: [], error: null } });
  const kont = new El('div');
  P.rysuj(kont, { biegi: [], bieg: BIEG, uczestnicy: [] }, () => {});
  await czekaj();
  const sek = kont.querySelector('[data-wyniki-org]');
  assert.ok(sek, 'sekcja jest');
  assert.equal(w.length, 0, 'bez rozwinięcia zero zapytań');
  assert.equal(pole(kont, 'imie'), null);
  const nag = pole(kont, 'rozwin'); assert.equal(nag.getAttribute('aria-expanded'), 'false');
  nag.wywolaj('click'); await czekaj();
  assert.equal(nag.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(w, [['akcja_bieg_org_lista', { p_slug: 'bieg-mikolajki' }]]);
  assert.ok(pole(kont, 'imie') && pole(kont, 'czas') && pole(kont, 'pelnoletnia') && pole(kont, 'zgoda'));
  assert.match(sek.textContent, /Jeszcze nikt nie wpisał wyniku osoby bez aplikacji\./);
  assert.match(sek.textContent, /bez nazwiska, e-maila i telefonu/);
  nag.wywolaj('click'); nag.wywolaj('click'); await czekaj();
  assert.equal(w.length, 1, 'ponowne rozwinięcie nie pyta drugi raz');
  for (const faza of ['zapisy', 'szkic']) { const k2 = new El('div'); P.rysuj(k2, { biegi: [], bieg: Object.assign({}, BIEG, { faza }), uczestnicy: [] }, () => {}); assert.equal(k2.querySelector('[data-wyniki-org]'), null, faza); }
  const k3 = new El('div'); P.rysuj(k3, { biegi: [], bieg: Object.assign({}, BIEG, { zalicz_do: '2020-01-01' }), uczestnicy: [] }, () => {}); assert.equal(k3.querySelector('[data-wyniki-org]'), null, 'po terminie zaliczania');
});

test('(4) formularz: imię, czas, dystans i obie zgody sprawdzane przed wysłaniem; wysyła znormalizowane imię, sekundy, dystans, true/true', async () => {
  const w = klient({ akcja_bieg_org_wpisz: (a) => ({ data: { ok: true, id: 'n1', imie: a.p_imie }, error: null }) });
  const kont = new El('div'); let po = 0;
  P.formularzOrg(kont, BIEG, null, () => { po++; });
  const zapisz = () => { pole(kont, 'zapisz').wywolaj('click'); };
  const info = () => pole(kont, 'info').textContent;
  pole(kont, 'imie').value = 'Anna Kowalska'; pole(kont, 'czas').value = '25:30'; pole(kont, 'dystans').value = '5';
  zapisz(); assert.match(info(), /bez nazwiska/); assert.equal(w.length, 0);
  pole(kont, 'imie').value = 'anna k'; pole(kont, 'czas').value = '0:30'; zapisz(); assert.match(info(), /Czas wpisz jak 25:30/); assert.equal(w.length, 0);
  pole(kont, 'czas').value = '25:30'; zapisz(); assert.match(info(), /osoba pełnoletnia i zgoda na imię i czas/); assert.equal(w.length, 0, 'bez zgód nic nie idzie');
  pole(kont, 'pelnoletnia').checked = true; zapisz(); assert.match(info(), /Zaznacz oba pola/); assert.equal(w.length, 0, 'jedna zgoda to za mało');
  pole(kont, 'zgoda').checked = true; zapisz(); await czekaj();
  assert.deepEqual(w, [['akcja_bieg_org_wpisz', { p_slug: 'bieg-mikolajki', p_imie: 'anna K.', p_dystans_km: 5, p_wynik_s: 1530, p_pelnoletnia: true, p_zgoda_imie: true, p_id: null }]]);
  assert.equal(po, 1, 'po zapisie lista się odświeża');
  assert.equal(pole(kont, 'imie').value, '', 'formularz czysty po zapisie');
  assert.equal(pole(kont, 'pelnoletnia').checked, false, 'zgody trzeba zaznaczyć przy następnym wpisie');
  assert.equal(pole(kont, 'zapisane').textContent, 'Dodane: anna K.', 'jedna kropka po inicjale');
});

test('(5) odmowa bazy po polsku; poprawka: dane w polach, wysyła id wpisu; „Anuluj” wraca do pustego formularza', async () => {
  const w = klient({ akcja_bieg_org_wpisz: { data: { ok: false, powod: 'za_pozno' }, error: null } });
  const kont = new El('div');
  P.formularzOrg(kont, BIEG, { id: 'w1', imie: 'Ewa E.', dystans_km: 10, wynik_s: 3725, moj: true }, () => {});
  assert.equal(kont.querySelector('[data-org-form]').getAttribute('data-org-form'), 'popraw');
  assert.equal(pole(kont, 'imie').value, 'Ewa E.'); assert.equal(pole(kont, 'czas').value, '1:02:05');
  assert.equal(pole(kont, 'pelnoletnia').checked, true); assert.equal(pole(kont, 'zgoda').checked, true);
  pole(kont, 'dystans').value = '10'; pole(kont, 'zapisz').wywolaj('click'); await czekaj();
  assert.equal(w[0][1].p_id, 'w1'); assert.equal(w[0][1].p_wynik_s, 3725);
  assert.match(pole(kont, 'info').textContent, /Po terminie zaliczania ręcznego/);
  const an = kont.wszystkie().find((e) => e.tag === 'button' && e.textContent === 'Anuluj'); an.wywolaj('click');
  assert.equal(kont.querySelector('[data-org-form]').getAttribute('data-org-form'), 'nowy');
  globalThis.sb = { rpc: () => Promise.reject(Object.assign(new Error('akcja_bieg_org_wpisz: tylko trener'), { code: '42501' })) };
  pole(kont, 'imie').value = 'Ola'; pole(kont, 'czas').value = '30:00'; pole(kont, 'dystans').value = '5'; pole(kont, 'pelnoletnia').checked = true; pole(kont, 'zgoda').checked = true;
  pole(kont, 'zapisz').wywolaj('click'); await czekaj();
  assert.equal(pole(kont, 'info').textContent, 'To konto nie jest kontem trenera.');
});

test('(6) lista: „Popraw” i „Usuń” tylko przy własnych; usunięcie po potwierdzeniu; „Anuluj” nic nie wysyła', async () => {
  const w = klient({ akcja_bieg_org_usun: { data: { ok: true }, error: null } });
  const lista = new El('div'); let edyt = null, odsw = 0;
  P.rysujListeOrg(lista, [{ id: 'm1', imie: 'Anna K.', dystans_km: 5, wynik_s: 1530, moj: true }, { id: 'c1', imie: 'Bogna', dystans_km: 5, wynik_s: 1600, moj: false }], (x) => { edyt = x; }, () => { odsw++; });
  const wiersz = (id) => lista.wszystkie().find((e) => e.getAttribute('data-org-wpis') === id);
  assert.match(wiersz('m1').textContent, /^Anna K\. · 5 km · 25:30PoprawUsuń$/);
  assert.equal(wiersz('c1').textContent, 'Bogna · 5 km · 26:40 · wpis innego trenera');
  wiersz('m1').wszystkie().find((e) => e.textContent === 'Popraw').wywolaj('click'); assert.equal(edyt.id, 'm1');
  globalThis.confirm = () => false;
  wiersz('m1').querySelector('[data-org-usun]').wywolaj('click'); await czekaj();
  assert.equal(w.length, 0, 'Anuluj: nic');
  globalThis.confirm = () => true;
  wiersz('m1').querySelector('[data-org-usun]').wywolaj('click'); await czekaj();
  assert.deepEqual(w, [['akcja_bieg_org_usun', { p_id: 'm1' }]]); assert.equal(odsw, 1);
  assert.match(P.pytanieUsunieciaOrg({ imie: 'Anna K.', dystans_km: 5, wynik_s: 1530 }), /^Usunąć wynik: Anna K\., 5 km, 25:30\? Zniknie z rankingu\.$/);
  const pusta = new El('div'); P.rysujListeOrg(pusta, [], () => {}, () => {}); assert.match(pusta.textContent, /Jeszcze nikt nie wpisał/);
});

test('(7) ranking: „wpisane przez organizatora”, bez numeru i bez profilu; czas i miejsce jak u innych; dziecko nigdy z tym dopiskiem', () => {
  const r = B.wierszUkonczyl({ imie: 'Anna K.', numer: null, dystans_km: 5, dziecko: false, reczny: false, czas_s: 1530, miejsce: 3, organizator: true, profil: '11111111-2222-4333-8444-555555555555' }, false, true);
  assert.match(r, /<span class="bw-pozycja" aria-label="miejsce 3">3\.<\/span><span class="bw-nr"><\/span><span class="bw-imie">Anna K\.<\/span>/);
  assert.match(r, /<b class="bw-czas">25:30<\/b> · 5 km<small class="bw-org">wpisane przez organizatora<\/small><\/span><\/li>$/, 'dopisek w osobnym wierszu pod czasem (display:block), bez wiszącej kropki');
  assert.match(czytaj('bieg.html'), /\.bw-org \{ display: block; white-space: normal; line-height: 1\.25; \}/, 'dopisek się łamie: imię nie ściska się w wąskiej kolumnie');
  assert.doesNotMatch(r, /profil\.html|bw-reczny|null/);
  assert.doesNotMatch(B.wierszUkonczyl({ imie: 'Zosia', numer: 4, dystans_km: 1.5, dziecko: true, organizator: true }, false, false), /organizatora/);
  assert.doesNotMatch(B.wierszUkonczyl({ imie: 'Ola', numer: 7, dystans_km: 5, dziecko: false, reczny: true }, false, false), /organizatora/, 'zwykły wynik bez dopisku');
  assert.match(czytaj('bieg.html'), /\.bw-reczny, \.bw-org \{ font-size: 11px; color: var\(--fg2\); white-space: nowrap; \}/);
});

test('(8) migracja: tabela bez polityk i uprawnień dla klientów, zgody wymagane CHECK-iem, trzy funkcje z bramką trenera, poprawka i usunięcie tylko autora', () => {
  assert.match(MIG, /pelnoletnia boolean not null check \(pelnoletnia\),\n\s+zgoda_imie\s+boolean not null check \(zgoda_imie\),/);
  assert.match(MIG, /alter table public\.akcja_bieg_wyniki_org enable row level security;\n\s+revoke all on table public\.akcja_bieg_wyniki_org from public, anon, authenticated;/);
  assert.doesNotMatch(MIG, /create\s+policy/i);
  for (const f of ['akcja_bieg_org_wpisz', 'akcja_bieg_org_usun', 'akcja_bieg_org_lista']) {
    const t = MIG.slice(MIG.indexOf('create function public.' + f), MIG.indexOf('end $o$;', MIG.indexOf('create function public.' + f)));
    assert.match(t, /security definer set search_path = ''/, f); assert.match(t, /if auth\.uid\(\) is null or not public\.auth_is_coach\(\) then raise exception '[a-z_]+: tylko trener' using errcode = '42501'/, f);
    assert.match(MIG, new RegExp('revoke all on function public\\.' + f + '\\([^)]*\\) from public, anon;'), f + ': bez anon i PUBLIC');
    assert.match(MIG, new RegExp('grant execute on function public\\.' + f + '\\([^)]*\\) to authenticated;'), f);
  }
  assert.match(MIG, /where o\.id = p_id and o\.bieg_id = b\.id and o\.wpisal = auth\.uid\(\) returning o\.id into v_id;/, 'poprawka tylko autora');
  assert.match(MIG, /delete from public\.akcja_bieg_wyniki_org o where o\.id = p_id and o\.wpisal = auth\.uid\(\) returning o\.id into v_id;/, 'usunięcie tylko autora');
  assert.match(MIG, /if p_pelnoletnia is not true or p_zgoda_imie is not true then return jsonb_build_object\('ok', false, 'powod', 'zgoda'\);/);
  assert.doesNotMatch(MIG + WYC, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|@[a-z]/i, 'bez identyfikatorów i e-maili');
  assert.ok(fs.existsSync(path.join(KORZEN, 'tools/akcja-bieg-org-test.sh')) && /TESTY AKCJA_BIEG_ORG ZIELONE/.test(czytaj('tools/akcja-bieg-org-test.sql')));
});

test('(9) ranking i sprzątanie: wstawki tylko oznaczone 20261233; WYCOFANIE = treść sprzed zmiany co do znaku', () => {
  const tresc = (t, f) => { const a = t.indexOf('CREATE OR REPLACE FUNCTION public.' + f); return t.slice(a, t.indexOf('end $function$', a) + 14); };
  const uk = tresc(MIG, 'akcja_bieg_ukonczyli'), sp = tresc(MIG, 'akcja_bieg_sprzatanie'), uk0 = tresc(WYC, 'akcja_bieg_ukonczyli'), sp0 = tresc(WYC, 'akcja_bieg_sprzatanie');
  assert.ok(uk0.length > 500 && sp0.length > 300);
  assert.equal(uk.replace(', false as org', '').replace(/\n    union all   -- 20261233[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n/, '\n').replace(" || case when p.org then jsonb_build_object('organizator', true) else '{}'::jsonb end", ''), uk0, 'ranking: poza wstawkami bez zmian');
  assert.equal(sp.replace(/\n\s+or exists \(select 1 from public\.akcja_bieg_wyniki_org o where o\.bieg_id = x\.id\)\)/, ')').replace(/\n    delete from public\.akcja_bieg_wyniki_org where bieg_id = b\.id;[^\n]*/, ''), sp0, 'sprzątanie: poza wstawkami bez zmian');
  assert.match(uk, /select o\.imie, true, null::integer, 'ja'::text, o\.utworzono, o\.dystans_km, o\.dystans_km::numeric, o\.wynik_s, null::integer, false, null::numeric, false, null::uuid, true\n\s+from public\.akcja_bieg_wyniki_org o\n\s+where o\.bieg_id = b\.id and \(p_dystans is null or o\.dystans_km = p_dystans\)/);
  assert.match(WYC, /drop table public\.akcja_bieg_wyniki_org;/);
  assert.match(MIG, /if to_regclass\('public\.akcja_bieg_wyniki_org'\) is not null then\n\s+insert into _org_komunikat values \('bez zmian/);
});

test('(10) liczby biegu (decyzja 27.11): „ukończyli” dolicza wpisy organizatora TEGO biegu, reszta bez zmian; WYCOFANIE co do znaku, przed usunięciem tabeli', () => {
  const li = (t) => { const a = t.indexOf('CREATE OR REPLACE FUNCTION public.akcja_bieg_liczby'); const k = t.indexOf('$function$', t.indexOf('AS $function$', a) + 13); return t.slice(a, k + 10); };
  const l = li(MIG), l0 = li(WYC);
  assert.ok(l0.length > 300 && l0.includes("'ukonczyli_n', count(*) filter (where u.wycofany_at is null and u.ukonczony_at is not null),"));
  assert.equal(l.replace(/\n\s+\+ \(select count\(\*\) from public\.akcja_bieg_wyniki_org o where o\.bieg_id = p_bieg\),[^\n]*/, ','), l0, 'liczby: poza jedną wstawką bez zmian');
  assert.match(l, /'ukonczyli_n', count\(\*\) filter \(where u\.wycofany_at is null and u\.ukonczony_at is not null\)\n\s+\+ \(select count\(\*\) from public\.akcja_bieg_wyniki_org o where o\.bieg_id = p_bieg\),/);
  assert.equal((l.match(/akcja_bieg_wyniki_org/g) || []).length, 1, 'tylko „ukończyli”, nie zapisani, dzieci ani złote');
  assert.ok(WYC.indexOf('CREATE OR REPLACE FUNCTION public.akcja_bieg_liczby') < WYC.indexOf('drop table public.akcja_bieg_wyniki_org;'), 'najpierw stara treść liczb, potem usunięcie tabeli');
  assert.match(czytaj('tools/akcja-bieg-org-test.sql'), /FAIL 3i: liczba „ukończyli” % ≠ wierszy listy %/);
});

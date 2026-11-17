/* BLIZNA 281 / 17.11: panel trenera biegu wirtualnego (js/bieg-panel.mjs, migracja 20261206):
   - flaga „do sprawdzenia” liczona w bazie (akcja_bieg_do_sprawdzenia): przy uczestniku tylko powód słownie, bez czasu; licznik w nagłówku (bez wycofanych), filtr;
   - „Usuń wynik” (§ 9 ust. 3–4 regulaminu v2) tylko przy ukończonym wyniku i w oknie zaliczania, z powodem i potwierdzeniem; bez powodu albo po „Anuluj” nic nie wysyła;
   - migracja: kotwice 1:1 z wycofaniem, progi te same w bazie i w opisie panelu, uprawnienia, bez danych osób. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261206_akcja_bieg_dyplom_flagi.sql', WYC = 'supabase/migrations/20261206_WYCOFANIE_akcja_bieg_dyplom_flagi.sql';
const czekaj = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/* mały DOM: tyle, ile używa panel (createElement, textContent, appendChild, atrybuty, zdarzenia, querySelector po atrybucie) */
class El {
  constructor(tag) { this.tag = tag; this.dzieci = []; this.attrs = {}; this.style = {}; this.h = {}; this._t = ''; this.rodzic = null; this.checked = false; this.disabled = false; this.value = ''; }
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
let P;
test.before(async () => {
  globalThis.document = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: (t) => new El(t) };
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg-panel.mjs')).href);
  P = globalThis.BM_BIEG_PANEL;
});
test.after(() => { delete globalThis.document; delete globalThis.sb; delete globalThis.BM_OKIENKO; });

const DANE = () => ({
  biegi: [], bieg: { slug: 'proba-bieg', nazwa: 'Bieg próbny', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', zalicz_do: '2099-01-01', faza: 'wyniki', dystanse_km: [5], zgody_email: 0 },
  uczestnicy: [
    { id: 'a', numer: 1, imie: 'Anna', rodzaj: 'ja', dystans_km: 5, wynik_dystans_km: 5, ukonczony: true, z_treningu: true, do_sprawdzenia: [] },
    { id: 'b', numer: 2, imie: 'Bogna', rodzaj: 'ja', dystans_km: 5, wynik_dystans_km: 5, ukonczony: true, z_treningu: true, do_sprawdzenia: ['tempo szybsze niż 3:00/km'] },
    { id: 'c', numer: 3, imie: 'Celina', rodzaj: 'dziecko', dystans_wlasny_km: 25, ukonczony: true, do_sprawdzenia: ['dziecko: ponad 21 km'] },
    { id: 'd', numer: 4, imie: 'Dawid', rodzaj: 'ja', dystans_km: 5, ukonczony: false, wynik_usuniety: true, wynik_usuniety_powod: 'brak potwierdzenia', do_sprawdzenia: [] },
    { id: 'e', numer: 5, imie: 'Edek', rodzaj: 'ja', dystans_km: 5, ukonczony: true, wycofany: true, do_sprawdzenia: ['tempo szybsze niż 3:00/km'] }],
});
function panel(d) {
  const kont = new El('div'), wczytane = [];
  P.rysuj(kont, d || DANE(), (slug) => { wczytane.push(slug); });
  const wiersz = (id) => kont.wszystkie().find((e) => e.getAttribute('data-uczestnik') === id) || null;
  const przyciski = (id) => wiersz(id).wszystkie().filter((e) => e.tag === 'button').map((e) => e.textContent);
  return { kont, wczytane, wiersz, przyciski };
}

test('flagi: powód słownie przy uczestniku, licznik w nagłówku bez wycofanych, filtr „Tylko do sprawdzenia”, bez czasów', () => {
  const p = panel();
  const licznik = p.kont.wszystkie().find((e) => e.getAttribute('data-licznik-flag') != null);
  assert.equal(licznik.getAttribute('data-licznik-flag'), '2'); assert.equal(licznik.textContent, 'Do sprawdzenia: 2');
  const flaga = (id) => { const f = p.wiersz(id).wszystkie().find((e) => e.getAttribute('data-do-sprawdzenia') != null); return f ? f.textContent : null; };
  assert.equal(flaga('b'), 'Do sprawdzenia: tempo szybsze niż 3:00/km'); assert.equal(flaga('c'), 'Do sprawdzenia: dziecko: ponad 21 km');
  assert.equal(flaga('a'), null); assert.equal(flaga('e'), null, 'wycofany bez flagi');
  assert.equal(P.liczbaDoSprawdzenia(DANE().uczestnicy), 2); assert.deepEqual(P.doSprawdzenia({ do_sprawdzenia: ['x', '', 3, null] }), ['x']); assert.deepEqual(P.doSprawdzenia({}), []);
  assert.doesNotMatch(p.kont.textContent.replace(/[23]:[03]0\/km/g, ''), /\d:\d\d/, 'panel bez czasów');
  const filtr = p.kont.wszystkie().find((e) => e.getAttribute('data-filtr-flag') != null);
  filtr.checked = true; filtr.wywolaj('change');
  assert.deepEqual(p.kont.wszystkie().filter((e) => e.getAttribute('data-uczestnik') != null).map((e) => e.getAttribute('data-uczestnik')), ['b', 'c']);
  const bez = panel({ ...DANE(), uczestnicy: DANE().uczestnicy.map((u) => ({ ...u, do_sprawdzenia: [] })) });
  assert.equal(bez.kont.wszystkie().find((e) => e.getAttribute('data-licznik-flag') != null).textContent, 'Do sprawdzenia: 0');
});

test('„Usuń wynik”: tylko przy ukończonym wyniku w oknie zaliczania; usunięty wynik w stanie z powodem i z „Zalicz ręcznie”', () => {
  const p = panel();
  assert.deepEqual(p.przyciski('a'), ['Popraw', 'Usuń wynik']); assert.deepEqual(p.przyciski('c'), ['Popraw', 'Usuń wynik']);
  assert.deepEqual(p.przyciski('d'), ['Zalicz ręcznie'], 'usunięty: przywraca „Zalicz ręcznie”'); assert.deepEqual(p.przyciski('e'), [], 'wycofany bez przycisków');
  assert.match(p.wiersz('d').textContent, /wynik usunięty: brak potwierdzenia/);
  assert.equal(P.stanTekst({ wycofany: true, wynik_usuniety: true }), 'wycofany (wynik usunięty)'); assert.equal(P.stanTekst({ wynik_usuniety: true }), 'wynik usunięty');
  const po = panel({ ...DANE(), bieg: { ...DANE().bieg, zalicz_do: '2020-01-01' } });
  assert.deepEqual(po.przyciski('a'), [], 'po terminie zaliczania bez przycisków');
});

test('„Usuń wynik”: okienko z powodem i potwierdzeniem; bez powodu albo „Anuluj” nic nie wysyła; po sukcesie odświeżenie, odmowa po polsku', async () => {
  const rpc = []; let odp = { data: { ok: true }, error: null };
  globalThis.sb = { rpc: (n, a) => { rpc.push([n, a]); return Promise.resolve(odp); } };
  const okienka = []; let wynik = null;
  globalThis.BM_OKIENKO = (o) => { okienka.push(o); return Promise.resolve(wynik); };
  const p = panel(), us = () => p.wiersz('b').wszystkie().find((e) => e.getAttribute('data-usun-wynik') === 'b');
  us().wywolaj('click'); await czekaj();
  assert.equal(rpc.length, 0, 'Anuluj: nic'); const o = okienka[0];
  assert.equal(o.grozne, true); assert.equal(o.tak, 'Usuń wynik'); assert.equal(o.pola[0].klucz, 'powod'); assert.equal(o.pola[0].maks, 200);
  assert.match(o.tekst, /^Usunąć wynik: Bogna, numer 2\? Dyplom i miejsce na liście znikną, uczestnik dostanie powiadomienie z powodem\./);
  assert.notEqual(o.sprawdz({ powod: 'ab' }), ''); assert.notEqual(o.sprawdz({ powod: 'x'.repeat(201) }), ''); assert.equal(o.sprawdz({ powod: 'abc' }), '');
  wynik = { powod: 'ab' }; us().wywolaj('click'); await czekaj();
  assert.equal(rpc.length, 0, 'za krótki powód: nic');
  wynik = { powod: '  brak potwierdzenia z zegarka  ' }; us().wywolaj('click'); await czekaj();
  assert.deepEqual(rpc[0], ['akcja_bieg_usun_wynik', { p_id: 'b', p_powod: 'brak potwierdzenia z zegarka' }]); assert.deepEqual(p.wczytane, ['proba-bieg'], 'po usunięciu lista od nowa');
  odp = { data: { ok: false, powod: 'za_pozno' }, error: null }; us().wywolaj('click'); await czekaj();
  assert.match(p.wiersz('b').textContent, /Po terminie: zaliczać można do 7 dni po końcu dopisywania wyników\./); assert.equal(p.wczytane.length, 1);
  odp = { data: null, error: { message: 'akcja_bieg_usun_wynik: tylko trener', code: '42501' } }; us().wywolaj('click'); await czekaj();
  assert.match(p.wiersz('b').textContent, /To konto nie jest kontem trenera\./);
  assert.equal(P.komunikat(null, { powod: 'zly_powod' }), 'Wpisz powód: od 3 do 200 znaków, w jednej linii.'); assert.match(P.komunikat(null, { powod: 'bez_wyniku' }), /^Ten zapis nie ma wyniku/);
  delete globalThis.BM_OKIENKO;
  const pyt = []; globalThis.prompt = () => 'powód z prompt'; globalThis.confirm = (t) => { pyt.push(t); return false; };
  rpc.length = 0; odp = { data: { ok: true }, error: null };
  assert.equal(await P.usunWynik({ id: 'b', imie: 'Bogna', numer: 2 }), null); assert.equal(rpc.length, 0, 'bez okienka: confirm „Anuluj” = nic');
  globalThis.confirm = () => true;
  assert.deepEqual(await P.usunWynik({ id: 'b', imie: 'Bogna', numer: 2 }), { ok: true }); assert.deepEqual(rpc[0][1], { p_id: 'b', p_powod: 'powód z prompt' });
  delete globalThis.prompt; delete globalThis.confirm;
});

test('migracja 20261206: kotwice 1:1 z wycofaniem, progi zgodne z opisem panelu, uprawnienia, bez danych osób', () => {
  const m = czytaj(MIG), w = czytaj(WYC), panelSrc = czytaj('js/bieg-panel.mjs');
  const trojki = (s) => [...s.matchAll(/\('(public\.[a-z_]+\([^']*\))',\n\s*\$k\$([\s\S]*?)\$k\$,\n\s*\$k\$([\s\S]*?)\$k\$\)/g)].map((x) => [x[1], x[2], x[3]]);
  const tm = trojki(m), tw = trojki(w);
  assert.equal(tm.length, 5); assert.deepEqual(tw, tm.map(([f, a, b]) => [f, b, a]), 'wycofanie odwraca każdą kotwicę');
  const tylkoDopisek = (a, b) => { let p = 0, s = 0; while (p < a.length && a[p] === b[p]) p++; while (s < a.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++; return b.length > a.length && p + s === a.length; };
  for (const [, stare, nowe] of tm) { assert.ok(tylkoDopisek(stare, nowe), 'nowy tekst = kotwica z dopiskiem, nic z niej nie znika: ' + stare.slice(0, 40)); assert.doesNotMatch(stare + nowe, /\n/, 'kotwice w jednej linii (CRLF)'); }
  const R = 're' + 'voke', G = 'gr' + 'ant';
  assert.ok(m.includes(R + ' all on function public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy) from public, anon, authenticated;'));
  assert.ok(m.includes(R + ' all on function public.akcja_bieg_wynik_powiadom(public.akcja_bieg_uczestnicy) from public, anon, authenticated;'));
  assert.ok(m.includes(R + ' all on function public.akcja_bieg_usun_wynik(uuid, text) from public, anon;') && m.includes(G + ' execute on function public.akcja_bieg_usun_wynik(uuid, text) to authenticated;'));
  assert.match(m, /if auth\.uid\(\) is null or not public\.auth_is_coach\(\) then raise exception 'akcja_bieg_usun_wynik: tylko trener' using errcode = '42501'; end if;/, 'bramka jak akcja_bieg_zalicz_recznie');
  assert.match(m, /u\.wynik_s < k\.km \* 150 then 'szybciej niż 2:30\/km \(poniżej rekordu świata\)'/); assert.match(m, /u\.wynik_s < k\.km \* 180 then 'tempo szybsze niż 3:00\/km'/);
  assert.match(m, /k\.km > 2 \* coalesce\(u\.wynik_dystans_km, u\.dystans_km\) then 'trening ponad 2 razy dłuższy niż dystans biegu'/); assert.match(m, /u\.dystans_wlasny_km > 21 then 'dziecko: ponad 21 km'/);
  assert.match(panelSrc, /tempo szybsze niż 3:00\/km, trening ponad 2 razy dłuższy niż dystans, dziecko ponad 21 km/, 'opis w panelu = progi w bazie');
  const panelMig = /'do_sprawdzenia', to_jsonb\(public\.akcja_bieg_do_sprawdzenia\(u\)\)\) order by u\.numer\)\$k\$/.exec(m);
  assert.ok(panelMig, 'panel dostaje do_sprawdzenia'); assert.doesNotMatch(m.slice(m.indexOf("('public.akcja_bieg_panel(text)'")), /'wynik_s'|'czas/, 'panel bez czasu');
  const nowe = [MIG, WYC, 'tools/akcja-bieg-dyplom-flagi-test.sql', 'tools/akcja-bieg-dyplom-flagi-test.sh'].map(czytaj).join('\n');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(nowe), 'bez UUID'); assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.test(nowe), 'bez e-maili');
  assert.ok(!/Fabian/i.test(nowe.replace(/dla-fabianka/g, '')), 'bez imienia dziecka ze zbiórki');
  assert.match(czytaj('tools/akcja-bieg-dyplom-flagi-test.sh'), /AKCJA_BIEG_DYPLOM_FLAGI_Z_MIGRACJA/); assert.match(czytaj('tools/akcja-bieg-dyplom-flagi-test.sql'), /raise exception 'TESTY DYPLOMU I FLAG ZIELONE: % sprawdzeń', n;/);
});

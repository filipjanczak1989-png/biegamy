/* BLIZNA 201 / FILMY AKCJI RAZ NA KONTO (Filip 9.11). Film startu grał na Dziś codziennie: po starcie FILM_DZIS zwracał film akcji przy każdym nowym dniu.
   - film startu raz na konto (profil: akcja_filmy_obejrzane, kopia w telefonie), potem baner nie gra nic sam; ▶ i „Zobacz film startu” na kaflu zostają;
   - filmy kamieni milowych: każdy raz, pierwszy raz po przekroczeniu progu (km albo % celu), adres z profilu (akcja_filmy_konta) albo na próbie z funkcji próby;
   - od dnia startu promo nie gra, także zanim przyjdzie stan z bazy; po zamknięciu akcji wraca.
   Migracja: tools/akcja-filmy-test.sh (19 asercji na atrapie, 8/8 mutacji). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const ADR = (n) => 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/' + n + '.mp4?token=abc.def-1';
const DZIEN = new Date('2026-11-09T10:00:00'), JUTRO = new Date('2026-11-10T10:00:00');

function el(tag) {
  const e = { tag, style: {}, dataset: {}, dzieci: [], atrybuty: {}, h: {}, parentNode: null,
    setAttribute(k, v) { this.atrybuty[k] = v; }, appendChild(c) { c.parentNode = this; this.dzieci.push(c); return c; },
    removeChild(c) { this.dzieci = this.dzieci.filter((x) => x !== c); c.parentNode = null; },
    addEventListener(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); }, removeEventListener(ev, fn) { this.h[ev] = (this.h[ev] || []).filter((f) => f !== fn); },
    emit(ev, x) { (this.h[ev] || []).slice().forEach((f) => f(x || {})); },
    querySelector(s) { return s[0] === '.' ? this.dzieci.find((d) => d.className === s.slice(1)) || null : null; } };
  return e;
}
/* sb.js w piaskownicy jak blizna-88; akcja: atrapa BM_AKCJA_CYTATY z „widzianymi” w zbiorze */
function srodowisko({ ruszyla = true, zamknieta = false, widziane = [], filmy } = {}) {
  const ctx = zaladujSb();
  const mag = new Map();
  ctx.localStorage = { getItem: (k) => (mag.has(k) ? mag.get(k) : null), setItem: (k, v) => mag.set(k, v) };
  ctx.matchMedia = () => ({ matches: false });
  ctx.navigator = { onLine: true, connection: { saveData: false } };
  ctx.document.createElement = (t) => { const e = el(t); if (t === 'video') { e.pause = () => {}; e.load = () => {}; e.play = () => Promise.resolve(); } return e; };
  ctx.setTimeout = () => 0; ctx.requestAnimationFrame = (fn) => fn();
  const zbior = new Set(widziane), oznaczone = [];
  ctx.BM_AKCJA_CYTATY = { czyAkcjaRuszyla: () => ruszyla, czyAkcjaZamknieta: () => zamknieta, DZIEN_STARTU: '2026-11-07',
    filmWidziany: (id) => zbior.has(id), oznaczFilm: (id) => { oznaczone.push(id); zbior.add(id); } };
  const start = { id: 'film-akcja', mp4: ADR('film-akcja'), dzwiek: true, pozycje: [{ od: 0, pos: '50% 45%' }] };
  ctx.FILM_AKCJI = ruszyla ? start : null;
  ctx.FILMY_AKCJI = filmy || (ruszyla ? [start] : []);
  return { ctx, mag, oznaczone, zbior, baner: el('div'), start };
}
const zagraj = (s, teraz) => { const v = s.ctx.FILM_DZIS.start(s.baner, teraz); if (v) v.emit('playing'); return v; };

test('film startu: pierwsze wejście gra i zapisuje „widziane”, kolejne wejście (dziś i jutro) już nie; ▶ zostaje i nie zapisuje drugi raz', () => {
  const s = srodowisko();
  assert.equal(s.ctx.FILM_DZIS.czekaFilmAkcji(), true);
  const v = zagraj(s, DZIEN);
  assert.ok(v, 'pierwsze wejście po starcie: film startu');
  assert.deepEqual([...s.oznaczone], ['film-akcja'], 'widziane w profilu (oznaczFilm → akcja_film_obejrzany)');
  for (const kiedy of [DZIEN, JUTRO, new Date('2026-11-20T10:00:00')]) {
    const t = srodowisko({ widziane: ['film-akcja'] });
    assert.equal(t.ctx.FILM_DZIS.czekaFilmAkcji(), false);
    assert.equal(t.ctx.FILM_DZIS.powodBlokady(kiedy), 'akcja-widziana');
    assert.equal(t.ctx.FILM_DZIS.start(t.baner, kiedy), null, kiedy.toISOString() + ': nie gra sam');
    assert.ok(t.baner.dzieci.some((d) => d.className === 'film-powtorz'), '▶ zostaje');
    const r = t.ctx.FILM_DZIS.start(t.baner, kiedy, { recznie: true });
    assert.ok(r, '▶ gra film startu'); r.emit('playing');
    assert.equal(t.oznaczone.length, 0, '▶ nie zapisuje');
  }
});

test('kamienie milowe: niewidziany film progu gra raz (także tego samego dnia co start), potem nic; kolejność z kolejki', () => {
  const start = { id: 'film-akcja', mp4: ADR('film-akcja'), dzwiek: true, pozycje: [{ od: 0, pos: '50% 45%' }] };
  const km = { id: 'km-1000', mp4: ADR('km'), dzwiek: true, pozycje: [{ od: 0, pos: '50% 50%' }] }, pct = { id: 'pct-25', mp4: ADR('pct'), dzwiek: true, pozycje: [{ od: 0, pos: '50% 50%' }] };
  const s = srodowisko({ widziane: ['film-akcja'], filmy: [start, km, pct] });
  assert.equal(s.ctx.FILM_DZIS.filmAkcjiDoObejrzenia().id, 'km-1000');
  zagraj(s, DZIEN);
  assert.deepEqual([...s.oznaczone], ['km-1000']);
  assert.equal(s.ctx.FILM_DZIS.filmAkcjiDoObejrzenia().id, 'pct-25', 'następny próg');
  s.baner = el('div'); zagraj(s, DZIEN);
  assert.deepEqual([...s.oznaczone], ['km-1000', 'pct-25']);
  s.baner = el('div');
  assert.equal(s.ctx.FILM_DZIS.start(s.baner, DZIEN), null, 'wszystko widziane: cisza');
});

test('promo: od dnia startu nie gra, także zanim przyjdzie stan z bazy; po zamknięciu akcji wraca; przed startem bez zmian', () => {
  const nieznany = srodowisko({ ruszyla: false });
  assert.equal(nieznany.ctx.FILM_DZIS.filmDnia(DZIEN), null, 'stan jeszcze nie przyszedł: bez promo');
  assert.equal(nieznany.ctx.FILM_DZIS.start(nieznany.baner, DZIEN), null);
  const zamk = srodowisko({ ruszyla: false, zamknieta: true });
  assert.ok(zamk.ctx.FILM_DZIS.filmDnia(DZIEN), 'po zamknięciu: rotacja jak dawniej');
  const przed = srodowisko({ ruszyla: false });
  assert.equal(przed.ctx.FILM_DZIS.filmDnia(new Date('2026-11-05T10:00:00')).id, 'film-05', 'kampania przed startem bez zmian');
});

test('akcja-cytaty: progi z adresem z kubełka i po przekroczeniu; widziane z profilu i telefonu, stary znacznik = film startu; zapis do profilu, dosyłka po braku sieci', async () => {
  const mag = new Map([['sb-afqojgkaveykxbltxzwm-auth-token', JSON.stringify({ user: { id: 'u1' } })], ['film_akcji', '1']]), wolania = [];
  let odp = { data: { progi: [{ id: 'km-1000', km: 1000, url: ADR('km') }], obejrzane: [] }, error: null };
  const sb = { rpc: (n, a) => { wolania.push([n, JSON.stringify(a)]); return Promise.resolve(n === 'akcja_filmy_konta' ? odp : { data: true, error: null }); } };
  const piask = { localStorage: { getItem: (k) => (mag.has(k) ? mag.get(k) : null), setItem: (k, v) => mag.set(k, String(v)), removeItem: (k) => mag.delete(k) }, console, JSON, Promise, Date, Math, Number, String };
  piask.globalThis = piask;
  vm.runInNewContext(czytaj('js/akcja-cytaty.mjs'), piask);
  const A = piask.BM_AKCJA_CYTATY;
  const progi = [{ id: 'km-1000', km: 1000, url: ADR('km') }, { id: 'pct-25', pct: 25, url: ADR('pct') }, { id: 'zly', km: 1, url: 'https://zly.example/f.mp4' }, { id: 'Zły!', km: 1, url: ADR('x') }];
  const ids = (x) => JSON.stringify(x.map((f) => f.id));
  assert.equal(ids(A.filmyProgow({ wystartowala: true, suma_km: 999, pct: 8 }, progi)), '[]', 'przed progiem nic');
  assert.equal(ids(A.filmyProgow({ wystartowala: true, suma_km: 1000, pct: 8 }, progi)), '["km-1000"]');
  assert.equal(ids(A.filmyProgow({ wystartowala: true, suma_km: 3200, pct: 25.6 }, progi)), '["km-1000","pct-25"]', 'obcy adres i zły identyfikator odpadają');
  assert.equal(ids(A.filmyProgow({ wystartowala: false, suma_km: 5000, pct: 50 }, progi)), '[]');
  const p = await A.filmyKonta(sb, 'dla-fabianka', { wystartowala: true });
  assert.equal(p.length, 1);
  assert.ok(A.filmWidziany('film-akcja'), 'stary znacznik z telefonu = film startu widziany');
  assert.ok(wolania.some((w) => w[0] === 'akcja_film_obejrzany' && w[1] === JSON.stringify({ p_slug: 'dla-fabianka', p_film: 'film-akcja' })), 'widziany w telefonie, a nie w profilu: dosłany do profilu');
  assert.ok(!A.filmWidziany('km-1000'));
  A.oznaczFilm('km-1000');
  assert.ok(A.filmWidziany('km-1000'));
  assert.deepEqual(JSON.parse(mag.get('bm_filmy_akcji_dla-fabianka_u1')), ['film-akcja', 'km-1000'], 'kopia w telefonie per konto i akcja');
  assert.ok(wolania.some((w) => w[0] === 'akcja_film_obejrzany' && w[1].includes('km-1000')));
  A.oznaczFilm('Zły!'); assert.ok(!A.filmWidziany('Zły!'));
  odp = { data: null, error: { message: 'function does not exist' } };
  assert.equal(JSON.stringify(await A.filmyKonta(sb, 'dla-fabianka', { wystartowala: true })), '[]', 'stara baza: bez progów, film startu dalej raz na telefon');
  /* profil z innego telefonu */
  mag.clear(); mag.set('sb-afqojgkaveykxbltxzwm-auth-token', JSON.stringify({ user: { id: 'u2' } }));
  odp = { data: { progi: [], obejrzane: ['film-akcja'] }, error: null };
  await A.filmyKonta(sb, 'dla-fabianka', { wystartowala: true });
  assert.ok(A.filmWidziany('film-akcja'), 'widziany na innym telefonie: tu nie gra');
});

test('kafel: „▶ Zobacz film startu” tylko z filmem; ta sama nakładka co w karcie; Dziś czeka na kolejkę; funkcja próby podpisuje tylko proste .mp4', async () => {
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja-cytaty.mjs')).href);
  globalThis.escapeHtml = (x) => String(x); globalThis.safeUrlAttr = (u) => u; globalThis.safeExternalHref = (u) => u;
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = globalThis.BM_AKCJA;
  const d = { wystartowala: true, nazwa: 'A', suma_km: 10, cel_km: 100, url_zbiorki: 'https://www.siepomaga.pl/x', firmy: [] };
  assert.match(A.daneKaflaHtml({ ...d, film_akcji_url: ADR('film-akcja') }), /<button type="button" class="akcja-dzis-film" data-film-akcji="1">▶ Zobacz film startu<\/button>/);
  assert.doesNotMatch(A.daneKaflaHtml(d), /Zobacz film startu/, 'bez filmu bez przycisku');
  const cyt = czytaj('js/akcja-cytaty.mjs');
  assert.match(cyt, /g\.FILMY_AKCJI = \(film \? \[film\] : \[\]\)\.concat\(filmyProgow\(d, progi\)\);/);
  assert.match(cyt, /if \(d && d\.wystartowala && athleteId\) \{ var progi = await filmyKonta\(sb, slug, d\);/, 'kolejka gotowa, zanim Dziś zapyta czekaFilmAkcji');
  const W = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/proba-wizerunek.mjs')).href);
  const podpisane = [];
  const sb = { from: () => { const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: { filmy_progow: [{ id: 'test-1000km', km: 1000, plik: 'film-akcja.mp4' }, { id: 'zly', km: 1, plik: '../tajne.mp4' }, { id: 'obraz', km: 1, plik: 'fabianek-koparka.webp' }, { id: 'bez-progu', plik: 'a.mp4' }] }, error: null }) }; return b; },
    storage: { from: () => ({ createSignedUrl: async (p, s) => { podpisane.push([p, s]); return { data: { signedUrl: 'https://x/' + p } }; } }) } };
  assert.deepEqual(await W.filmyProgowProby(sb), [{ id: 'test-1000km', url: 'https://x/film-akcja.mp4', km: 1000 }]);
  assert.deepEqual(podpisane, [['film-akcja.mp4', 900]], 'tylko prosty plik .mp4, adres na 15 minut');
  const blad = { from: () => { const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: null, error: { message: 'column does not exist' } }) }; return b; } };
  assert.deepEqual(await W.filmyProgowProby(blad), [], 'baza bez migracji: pusta lista');
});

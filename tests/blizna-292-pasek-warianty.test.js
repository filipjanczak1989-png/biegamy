/* BLIZNA 292 / 18.11 wieczór: pasek biegu na Dziś także dla zapisanych (decyzja Filipa: droga do numeru, wyniku i dyplomu). Warianty z akcja_bieg_moi:
   bez zapisu „🎅 {nazwa} · Zapisz się ›” (zapisy/trwa); „ja” bez wyniku „🎅 Twój numer {numer} · Twój bieg ›”; „ja” z wynikiem „🏅 Ukończone · Twój dyplom ›”;
   same dzieci „🎅 Bieg Twoich dzieci ›”; faza zakonczony: 7 dni od koniec_at wariant z dyplomem, tylko gdy ktoś z konta ukończył; potem nic.
   Link zawsze bieg.html (konto testowe ?proba=1). Krzyżyk chowa na ten bieg i wariant (po ukończeniu pasek wraca raz); „Zapisz się” przy kluczu z 65a96e43.
   Pamięć telefonu (blizna-291) trzyma wariant i numer. Tekst przez textContent, nazwa i numer z bazy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const KONIEC = '2026-12-06T19:00:00+00:00', K = Date.parse(KONIEC), T = Date.parse('2026-11-20T10:00:00Z'), DZIEN = 864e5, KLUCZ = 'bm_bieg_pasek_ostatni';
const BIEG = (x) => Object.assign({ slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', faza: 'trwa', koniec_at: KONIEC }, x || {});
const L = (bieg, x) => Object.assign({ wystartowala: true, testowa: false, bieg }, x || {});
const JA = (x) => Object.assign({ id: 'u1', rodzaj: 'ja', numer: 7, dystans_km: 5, ukonczony_at: null }, x || {});
const DZ = (x) => Object.assign({ id: 'u2', rodzaj: 'dziecko', numer: 12, dystans_km: 1, ukonczony_at: null }, x || {});
const UK = '2026-11-25T08:00:00+00:00';
function el(tag) {
  const e = { tag, dzieci: [], attrs: {}, style: { cssText: '' }, hidden: true, href: '', type: '', h: {},
    appendChild(c) { this.dzieci.push(c); return c; }, setAttribute(n, v) { this.attrs[n] = String(v); }, addEventListener(t, f) { this.h[t] = f; } };
  let t = ''; Object.defineProperty(e, 'textContent', { get: () => t + e.dzieci.map((c) => c.textContent).join(''), set: (v) => { t = String(v); e.dzieci = []; } });
  Object.defineProperty(e, 'innerHTML', { set: () => { throw new Error('pasek nie używa innerHTML'); } });
  return e;
}
function srodowisko(start) {
  const m = new Map(Object.entries(start || {}));
  globalThis.document = { createElement: el };
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  return { m, pasek: el('div') };
}
const rpc = (moi, wolania) => ({ rpc: async (n, a) => { if (wolania) wolania.push([n, a]); return { data: moi }; } });
let A;
test.before(async () => {
  const SB = zaladujSb(); for (const k of ['escapeHtml', 'safeExternalHref', 'safeUrlAttr', 'SB_URL']) globalThis[k] = SB[k];
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href); A = globalThis.BM_AKCJA;
});

test('warianty w trakcie biegu: zapis, numer, dyplom, dzieci; „ja” rozstrzyga; wycofani się nie liczą', () => {
  const w = (moi, bieg, t) => { const s = A.stanPaskaBiegu(L(BIEG(bieg)), moi, t || T); return s && [s.wariant, s.numer]; };
  assert.deepEqual(w([]), ['zapis', null]);
  assert.deepEqual(w([JA()]), ['numer', 7]);
  assert.deepEqual(w([JA({ ukonczony_at: UK })]), ['dyplom', null]);
  assert.deepEqual(w([DZ()]), ['dzieci', null]); assert.deepEqual(w([DZ({ ukonczony_at: UK })]), ['dzieci', null], 'same dzieci w trakcie: zawsze „Bieg Twoich dzieci”');
  assert.deepEqual(w([DZ(), JA()]), ['numer', 7], 'ja + dzieci: wariant „ja”');
  assert.deepEqual(w([JA({ wycofany_at: UK })]), ['zapis', null], 'wycofany zapis = bez zapisu');
  assert.deepEqual(w([JA()], { faza: 'zapisy' }), ['numer', 7]);
  assert.deepEqual(w([], { faza: 'wyniki' }), null, 'faza wyniki bez zapisu: nic (jak dotąd)');
  assert.deepEqual(w([JA()], { faza: 'wyniki' }), ['numer', 7]); assert.deepEqual(w([DZ()], { faza: 'wyniki' }), ['dzieci', null]);
  for (const zly of [null, '7<b>', 0, 1.5, -3, 100000]) assert.equal(A.stanPaskaBiegu(L(BIEG()), [JA({ numer: zly })], T), null, 'zły numer: ' + JSON.stringify(zly));
  const s = A.stanPaskaBiegu(L(BIEG()), [JA()], T);
  assert.equal(s.wazny_do, K, 'ważny do końca biegu'); assert.equal(s.href, 'bieg.html');
  for (const moi of [[], [JA()], [JA({ ukonczony_at: UK })], [DZ()]]) assert.equal(A.stanPaskaBiegu(L(BIEG(), { testowa: true }), moi, T).href, 'bieg.html?proba=1', 'konto testowe');
});

test('po końcu biegu: 7 dni od koniec_at tylko dyplom i tylko gdy ktoś z konta ukończył; potem nic', () => {
  const Z = BIEG({ faza: 'zakonczony' }), w = (moi, t) => { const s = A.stanPaskaBiegu(L(Z), moi, t); return s && [s.wariant, s.wazny_do]; };
  assert.deepEqual(w([JA({ ukonczony_at: UK })], K + 3600e3), ['dyplom', K + 7 * DZIEN]);
  assert.deepEqual(w([DZ({ ukonczony_at: UK })], K + 3600e3), ['dyplom', K + 7 * DZIEN], 'dziecko ukończyło: dyplom');
  assert.equal(w([JA()], K + 3600e3), null, 'zapisany bez wyniku: bez dyplomu nic'); assert.equal(w([], K + 3600e3), null, 'niezapisany po końcu: nic');
  assert.deepEqual(w([JA({ ukonczony_at: UK })], K + 7 * DZIEN - 1), ['dyplom', K + 7 * DZIEN]); assert.equal(w([JA({ ukonczony_at: UK })], K + 7 * DZIEN), null, 'po 7 dniach nic');
  assert.equal(A.stanPaskaBiegu(L(BIEG({ faza: 'zakonczony', koniec_at: null })), [JA({ ukonczony_at: UK })], K + 3600e3), null, 'bez koniec_at po końcu nic');
});

test('rysowanie: tekst wariantu przez textContent, link bieg.html, numer z bazy; po 7 dniach od końca bez zapytania', async () => {
  for (const [moi, bieg, tekst] of [[[], {}, '🎅 Wirtualny Bieg Mikołajkowy dla Fabianka ·Zapisz się ›×'], [[JA()], {}, '🎅 Twój numer 7 ·Twój bieg ›×'],
    [[JA({ ukonczony_at: UK })], {}, '🏅 Ukończone ·Twój dyplom ›×'], [[DZ()], {}, '🎅Bieg Twoich dzieci ›×'], [[JA({ ukonczony_at: UK })], { faza: 'zakonczony' }, '🏅 Ukończone ·Twój dyplom ›×']]) {
    const s = srodowisko(), t = bieg.faza === 'zakonczony' ? K + DZIEN : T;
    const st = await A.pasekBiegu(s.pasek, L(BIEG(bieg)), rpc(moi), t);
    assert.ok(st, tekst); assert.equal(s.pasek.hidden, false); assert.equal(s.pasek.textContent, tekst);
    assert.equal(s.pasek.dzieci[0].dzieci[0].href, 'bieg.html'); assert.equal(s.pasek.attrs['data-wariant'], st.wariant);
  }
  const s = srodowisko(), wol = [];
  assert.equal(await A.pasekBiegu(s.pasek, L(BIEG({ faza: 'zakonczony' })), rpc([JA({ ukonczony_at: UK })], wol), K + 8 * DZIEN), null);
  assert.equal(await A.pasekBiegu(s.pasek, L(BIEG({ faza: 'wkrotce' })), rpc([JA()], wol), T), null);
  assert.deepEqual(wol, [], 'poza oknem pokazywania: bez zapytania o zapisy');
});

test('krzyżyk na bieg i wariant: po ukończeniu nowy wariant wraca; stary klucz „Zapisz się” z 65a96e43 chowa dziś, numer po zapisie już widać (czasy: blizna-293)', async () => {
  const teraz = Date.now; Date.now = () => T;
  try {
    const s = srodowisko();
    await A.pasekBiegu(s.pasek, L(BIEG()), rpc([JA()]), T);
    s.pasek.dzieci[0].dzieci[1].h.click();
    assert.equal(s.pasek.hidden, true); assert.ok(Number(s.m.get('bm_bieg_pasek_ukryty_bieg-mikolajki_numer')) > T); assert.equal(s.m.has(KLUCZ), false, 'krzyżyk czyści pamięć');
    assert.equal(await A.pasekBiegu(s.pasek, L(BIEG()), rpc([JA()]), T), null, 'numer schowany zostaje (dziś)');
    const d = await A.pasekBiegu(s.pasek, L(BIEG()), rpc([JA({ ukonczony_at: UK })]), T);
    assert.equal(d && d.wariant, 'dyplom', 'po ukończeniu nowy wariant wraca'); assert.equal(s.pasek.textContent, '🏅 Ukończone ·Twój dyplom ›×');
    const st = srodowisko({ 'bm_bieg_pasek_ukryty_bieg-mikolajki': '1' });
    assert.equal(await A.pasekBiegu(st.pasek, L(BIEG()), rpc([]), T), null, 'klucz z 65a96e43 chowa „Zapisz się” (dziś)');
    assert.equal((await A.pasekBiegu(st.pasek, L(BIEG()), rpc([JA()]), T)).wariant, 'numer', 'po zapisie pasek z numerem wraca');
  } finally { Date.now = teraz; }
});

test('pamięć telefonu trzyma wariant i numer; dyplom po końcu ważny 7 dni od koniec_at', async () => {
  const s = srodowisko();
  await A.pasekBiegu(s.pasek, L(BIEG()), rpc([JA()]), T);
  const z = JSON.parse(s.m.get(KLUCZ));
  assert.deepEqual([z.wariant, z.numer, z.wazny_do], ['numer', 7, K]);
  const p = srodowisko({ [KLUCZ]: JSON.stringify(Object.assign({}, z, { t: T - 3600e3 })) });
  assert.equal(A.pasekZPamieci(p.pasek, T).wariant, 'numer'); assert.equal(p.pasek.textContent, '🎅 Twój numer 7 ·Twój bieg ›×');
  const dy = { slug: 'bieg-mikolajki', nazwa: 'Wirtualny Bieg Mikołajkowy dla Fabianka', href: 'bieg.html', wariant: 'dyplom', numer: null, wazny_do: K + 7 * DZIEN };
  const q = srodowisko({ [KLUCZ]: JSON.stringify(Object.assign({ t: K + 6 * DZIEN }, dy)) });
  assert.equal(A.pasekZPamieci(q.pasek, K + 7 * DZIEN - 60e3).wariant, 'dyplom'); assert.equal(q.pasek.textContent, '🏅 Ukończone ·Twój dyplom ›×');
  const r = srodowisko({ [KLUCZ]: JSON.stringify(Object.assign({ t: K + 6 * DZIEN }, dy)) });
  assert.equal(A.pasekZPamieci(r.pasek, K + 7 * DZIEN), null, 'po 7 dniach pamięć nie rysuje');
  const u = srodowisko({ [KLUCZ]: JSON.stringify(Object.assign({ t: T - 60e3 }, z)), 'bm_bieg_pasek_ukryty_bieg-mikolajki_numer': '1' });
  assert.equal(A.pasekZPamieci(u.pasek, T), null, 'schowany wariant nie wraca z pamięci');
});

test('kod: warianty tylko przez textContent; zawodnik.html bez zmian', () => {
  const kod = fs.readFileSync(path.join(KORZEN, 'js/akcja.mjs'), 'utf8').replace(/\r/g, '');
  const blok = kod.slice(kod.indexOf('18.11: PASEK BIEGU NA DZIŚ'), kod.indexOf('g.BM_AKCJA = {'));
  assert.ok(blok.includes('„🎅 Twój numer {numer} · Twój bieg ›”')); assert.doesNotMatch(blok, /innerHTML|fabian/i);
  for (const t of ['"🎅 Twój numer " + s.numer + " ·", "Twój bieg ›"', '"🏅 Ukończone ·", "Twój dyplom ›"', '"🎅", "Bieg Twoich dzieci ›"', '"🎅 " + s.nazwa + " ·", "Zapisz się ›"']) assert.ok(blok.includes(t), t);
  const z = fs.readFileSync(path.join(KORZEN, 'zawodnik.html'), 'utf8');
  assert.equal((z.match(/bieg-pasek/g) || []).length, 2); assert.doesNotMatch(z, /Twój numer|Twój dyplom|Bieg Twoich dzieci/);
});

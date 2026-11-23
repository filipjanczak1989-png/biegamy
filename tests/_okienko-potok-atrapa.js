// Wspólna atrapa dla testów Okienka z 22.11 (blizna-331…335): prawdziwy potok v2 i router na atrapach, sieć i model liczone, nigdy wołane naprawdę.
// Licznik akcji: syntetyczny (imię dziecka = atrapa), pole `bieg` jak w bazie. Nic z produkcji.
'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, fetchF6, DZIS, TERAZ } = require('./_lawka-pytan.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const LICZNIK = { wystartowala: true, wystartowala_at: '2026-11-07T06:01:00Z', nazwa: '#12500 km dla Fabianka', imie: 'Atrapek', start: '2026-11-07', cel_km: 12500,
  suma_km: 2815.2, pct: 22.5, zamknieta: false, url_zbiorki: 'https://zrzutka.pl/atrapa-zbiorki', wyprawa_trwa: true, wyprawa_km: 87.4, wyprawa_cel_km: null, wyprawa_cel_nazwa: null,
  wyprawa_dotarla_at: null };

let M = null;
async function moduly() {
  if (M) return M;
  for (const p of ['js/akcja-cytaty.mjs', 'js/akcja.mjs', 'js/bieg.mjs']) await zaladuj(p);
  M = { R: await zaladuj('supabase/functions/okienko/router.mjs'), potok: (await zaladuj('supabase/functions/okienko-v2/potok.mjs')).potok,
    AK: globalThis.BM_AKCJA_CYTATY, zaladuj };
  return M;
}

/** v2: { slad, body, sieci, modele }. opcje: { coach: true (zawodnik z trenerem), fetchF6: własny fetch maszyny wyników, nadpisz: (sieci, modele) => ({…}), licznik } */
async function przebiegV2(q, opcje = {}) {
  const M = await moduly();
  const adm = atrapa({ okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [], athletes: [] });
  const sieci = [], modele = [];
  const nad = { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, uzyteRozmowDzis: async () => 0,
    rozumienie: async () => { modele.push(q); return { intencja: 'nie_wiem', pewnosc: 0, dopytac: true, kandydaci: [], sloty: {}, tok: { we: 0, wy: 0 } }; },
    zapytajSiec: async () => { sieci.push(q); throw new Error('sieć niedozwolona'); },
    zapytajModel: async () => { modele.push(q); throw new Error('model niedozwolony'); },
    rozmowaModel: async () => { modele.push(q); return null; }, generujJson: async () => { modele.push(q); throw new Error('model niedozwolony'); },
    ...(opcje.nadpisz ? opcje.nadpisz(sieci, modele) : {}) };
  const f6 = opcje.fetchF6 || fetchF6;
  const fetchFn = async (url, init) => {
    if (String(url).includes('generativelanguage')) { (String((init && init.body) || '').includes('googleSearch') ? sieci : modele).push(q); throw new Error('atrapa: Gemini niedozwolone'); }
    return f6(url, init);
  };
  const b = baza();
  if (opcje.coach) b.athletes = b.athletes.map((a) => (a.id === JA ? { ...a, coach_id: 'coach-atrapa' } : a));
  const sb = atrapa(b);
  const licznik = opcje.licznik === undefined ? LICZNIK : opcje.licznik;
  sb.rpc = async (n) => (n === 'akcja_licznik' && licznik ? { data: licznik, error: null } : { data: null, error: { message: 'rpc' } });
  const r = await M.potok({ tekst: q, historia: [], ekran: 'home', athleteId: JA, sb, adm, jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: 'K', budzet: 0, fetchFn }, nad);
  return { slad: (r.slad || []).join('>'), body: r.body || {}, sieci: sieci.length, modele: modele.length, status: r.status };
}

/** v1: router w stanie „akcja trwa” → log / narzędzie / null */
async function trasaRoutera(q) {
  const M = await moduly();
  M.AK.ustawStan({ ruszyla: true, zamknieta: false, proba: false });
  const d = M.R.dopasuj(q, DZIS);
  return d ? (d.log || d.narzedzie || (d.nawiguj ? 'nawiguj' : '?')) : null;
}

module.exports = { moduly, przebiegV2, trasaRoutera, LICZNIK, DZIS, KORZEN };

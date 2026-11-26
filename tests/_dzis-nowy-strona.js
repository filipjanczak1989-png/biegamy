// Atrapa strony dla testów nowego Dziś z PRAWDZIWYM js/dzis-offline.js (pamięć bez sieci: blizna-374, blizna-375).
// Pamięć telefonu to mapa napisów, jak w przeglądarce: testy czytają z niej surowy JSON, nie obiekt z pamięci modułu.
// Zapytania odpowiadają dopiero na polecenie testu (doKonca), a każdemu można zadać awarię:
//   'siec'   → { data: null, error: { message: 'TypeError: Failed to fetch' } }   (tak odpowiada supabase-js bez połączenia)
//   'odmowa' → { data: null, error: { code: '42501', … }, status: 403 }            (prawdziwa odpowiedź serwera)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r\n/g, '\n');
const MODUL = czytaj('js/dzis-nowy.mjs');
const OFFLINE = czytaj('js/dzis-offline.js');
const tik = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const TERAZ = new Date(2026, 10, 26, 12, 0, 0).getTime();
const UID = 'u-1';
const wpis = (id, h, z) => Object.assign({ id, logged_at: new Date(TERAZ - h * 3600e3).toISOString(), training_type: 'Spokojny', distance_km: 10.01, duration: '55:10', pace: '5:31', heart_rate: 140, elevation_gain: 40, feel: null, external_source: 'intervals', comment: 'Morning Run' }, z);
const PROFIL = { id: 'a-1', full_name: 'Ola Nowak', coach_id: 'c-9', intervals_athlete_id: 'i123', intervals_connected_at: '2026-10-01T10:00:00Z', intervals_can_write: true, intervals_token_dead_at: null };
const TRENING = [{ id: 't1', date: '2026-11-26', type: 'Interwały', distance_km: 8, duration_min: null, pace: '4:30', description: 'Rozgrzewka 2 km, potem 4 × 1 km.', status: 'planned', plan_source: 'coach', coach_id: 'c-9' }];

/** Pamięć telefonu jak localStorage: tylko napisy. Ta sama mapa może przejść do następnej „strony” (ponowne wejście). */
function pamiecTelefonu(mapa) {
  const m = mapa || new Map(), zapisy = [];
  return { mapa: m, zapisy, get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { zapisy.push(k); m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

function strona({ wpisy = [wpis('l1', 23.8, { feel: 'good' }), wpis('l2', 76, { feel: 'mid' })], profil = PROFIL, trening = TRENING, wiadomosc = [{ body: 'Jutro luźno.', sent_at: new Date(TERAZ - 20 * 3600e3).toISOString() }],
  licznik = { wystartowala: true, km: 3607, cel_km: 12500, nazwa: 'Ulica próbna' }, wklad = { km: 196 }, awaria = {}, online = true, search = '', pamiec = null, sesja = true, teraz = TERAZ, bezOffline = false, zakladkaTrenera = false } = {}) {
  const klasy = new Set(['dzis-nowy']), wezly = {}, zapytania = [], czasomierze = [], sluchacze = {}, zgloszenia = [], st = { zegar: teraz, online, awaria: Object.assign({}, awaria), sesja };
  const tel = pamiecTelefonu(pamiec);
  const lista = () => { const k = new Set(); return { add: (c) => k.add(c), remove: (c) => k.delete(c), contains: (c) => k.has(c) }; };
  const wezel = (sel) => (wezly[sel] = wezly[sel] || { innerHTML: '', textContent: '', value: '', className: '', hidden: /zegarek|zdarzenie|licznik|jp-kom/.test(sel), disabled: false, _a: {}, classList: lista(), offsetWidth: 10,
    setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return k in this._a ? this._a[k] : null; }, removeAttribute(k) { delete this._a[k]; },
    getBoundingClientRect() { return { top: 100, height: this.hidden ? 0 : 56 }; }, scrollIntoView() {}, focus() {}, querySelector(s2) { return wezel(sel + ' ' + s2); }, querySelectorAll: () => [] });
  const korzen = { hidden: true, innerHTML: '', _a: {}, _zd: {}, getAttribute(k) { return k in this._a ? this._a[k] : null; }, setAttribute(k, v) { this._a[k] = v; }, querySelector: (s) => wezel(s), addEventListener(n, f) { this._zd[n] = f; }, contains: () => true };
  const el = { 'dzis-nowy': korzen, 'topbar-name': { textContent: 'Ola' }, 'zawodnik-bell-dot': { textContent: '', style: { display: 'none' } }, 'moment-baner': { style: { display: 'none' } }, 'watch-pasek-slot': { innerHTML: '' } };
  const nowyEl = () => ({ id: '', style: {}, textContent: '', appendChild(c) { if (c.id) el[c.id] = c; }, remove() { delete el[this.id]; } });
  const DANE = () => ({ athletes: profil, 'rpc akcja_licznik': licznik, 'rpc akcja_moj_wklad': wklad, trainings: trening, training_logs: wpisy, messages: wiadomosc });
  const odpowiedz = (nazwa) => {
    const a = st.awaria[nazwa] || st.awaria['*'];
    if (a === 'siec') return { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
    if (a === 'odmowa') return { data: null, error: { code: '42501', message: 'permission denied' }, status: 403 };
    return { data: DANE()[nazwa], error: null, status: 200 };
  };
  const wyslij = (nazwa, opis) => { const zq = { nazwa, opis, stan: 'czeka' }; zapytania.push(zq); return new Promise((ok) => { zq.odpowiedz = () => { if (zq.stan !== 'czeka') return; zq.stan = 'jest'; ok(odpowiedz(nazwa)); }; }); };
  const lancuch = (t) => { const kroki = []; let p = null; const q = new Proxy({}, { get(_, k) { if (k === 'then') return (a, b) => (p = p || wyslij(t, kroki.join(''))).then(a, b); return (...arg) => { kroki.push('.' + k + '(' + arg.map((x) => JSON.stringify(x)).join(',') + ')'); return q; }; } }); return q; };
  const nawigator = { get onLine() { return st.online; } };
  const w = { _currentSection: 'home', location: { search, hash: '', pathname: '/zawodnik.html' }, URLSearchParams, navigator: nawigator, showSection(n) { this._currentSection = n; }, _logKlienta(...a) { zgloszenia.push(a); },
    setTimeout(f, ms) { czasomierze.push({ f, ms, zywy: true }); return czasomierze.length; }, clearTimeout(i) { if (czasomierze[i - 1]) czasomierze[i - 1].zywy = false; },
    addEventListener(n, f) { (sluchacze[n] = sluchacze[n] || []).push(f); },
    localStorage: tel, matchMedia: () => ({ matches: false }), CSS: { supports: () => true }, scrollBy() {},
    BM_AKCJA_CYTATY: { slugDla: () => 'ulica-glowna' }, feelSvg: (kod) => '<svg data-mina="' + kod + '"></svg>', FEEL_ETYKIETY: { bad: 'Ciężko', mid: 'Przeciętnie', good: 'Dobrze', great: 'Świetnie' },
    WATCH: { stanZProfilu: (a) => ({ polaczony: !!a.intervals_athlete_id, id: a.id }), render: async (_, o) => '<span class="wc-badge" data-id="' + o.athleteId + '">' + (o.stan.polaczony ? 'ok' : 'brak') + '</span>' },
    MutationObserver: function () { this.observe = () => {}; },
    sb: { from: lancuch, rpc: (n) => { let p = null; return { then: (a, b) => (p = p || wyslij('rpc ' + n, '')).then(a, b) }; },
      auth: { getSession: async () => (st.sesja ? { data: { session: { user: { id: UID } } } } : { data: { session: null }, error: { message: 'TypeError: Failed to fetch' } }) } } };
  const d = { readyState: 'complete', documentElement: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    getElementById: (id) => el[id] || null, createElement: nowyEl, head: { appendChild() {} }, body: { appendChild(p) { el[p.id] = p; } }, addEventListener() {} };
  const DataT = class extends Date { constructor(...a) { if (a.length) super(...a); else super(st.zegar); } static now() { return st.zegar; } };
  const kontekst = { window: w, self: w, document: d, navigator: nawigator, location: w.location, localStorage: tel, sessionStorage: { getItem: (k) => (zakladkaTrenera && k === '_fromTrener' ? '1' : null) }, URLSearchParams, Date: DataT, Promise, encodeURIComponent, JSON, String, Number, Object, Array, Math, RegExp, Error, isFinite, isNaN, parseInt, parseFloat };
  vm.createContext(kontekst);
  if (!bezOffline) vm.runInContext(OFFLINE, kontekst);   // prawdziwy js/dzis-offline.js → w.DzisOffline, pamięć = mapa testu
  vm.runInContext(MODUL, kontekst);
  async function doKonca() { await tik(); for (let i = 0; i < 14 && zapytania.some((x) => x.stan === 'czeka'); i++) { for (const x of zapytania.filter((y) => y.stan === 'czeka')) x.odpowiedz(); await tik(); } await tik(); }
  const dotknij = (co, kod) => korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => (k === 'data-dn' ? co : k === 'data-kod' ? kod : null) } : null) } });
  /** Migawka tak, jak leży w telefonie: napis JSON spod klucza konta, rozpakowany dopiero tutaj. */
  const migawka = () => { const raw = tel.mapa.get('bm_dzis_migawka_' + UID); return raw ? JSON.parse(raw) : null; };
  return { w, d, el, korzen, zapytania, czasomierze, sluchacze, zgloszenia, st, tel, doKonca, tik, dotknij, migawka, B: w.BM_DZIS, D: w.DzisOffline,
    kafel: (n) => wezel('[data-kafel="' + n + '"]'), cz: (n) => wezel('[data-dn="' + n + '"]'), pasekOffline: () => (el['bm-offline-pasek'] && el['bm-offline-pasek-txt'] ? el['bm-offline-pasek-txt'].textContent : null) };
}

module.exports = { strona, wpis, tik, TERAZ, UID, PROFIL, TRENING, MODUL, OFFLINE, czytaj };

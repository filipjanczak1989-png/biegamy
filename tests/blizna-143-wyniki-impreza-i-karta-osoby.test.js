/* BLIZNA 143 (3.11.2026, testy Filipa): (1) „półmaraton w Poznaniu wyniki”: lista edycji bez kliknięcia, a ekranu imprezy nie było. Każda edycja prowadzi teraz do wyniki.html#/impreza/<klucz>/<rok>,
   ekran bierze dane tylko z maszyny (F6 019: event_info, event_results), a edycja bez wyników mówi to wprost. (2) „Filip Janczak”: pytanie trafiało w „o nas” PRZED trybem osoby, więc karta nie
   miała wyników ani zdjęcia; kartaOsoby w ogóle nie rysowała avatara. Zmierzone 3.11: f6_runner_key ma 0 z 91 kont, imię i nazwisko 10 z 91. Powiązanie zapisuje tylko sam zawodnik („To moje wyniki?”). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb } = require('./_srodowisko.js');
const { atrapa, JA } = require('./_okienko-atrapy.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
function okienko() {
  const ctx = zaladujSb(); ctx.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.runInContext(czytaj('js/okienko.js'), ctx, { filename: 'js/okienko.js' });
  return { O: ctx.OKIENKO, ctx };
}
async function wyniki() { globalThis.window = globalThis; await zaladuj('js/tekst.mjs'); await zaladuj('js/kalendarz-lista.mjs'); await zaladuj('js/riegel.js'); await zaladuj('js/wyniki-lista.mjs'); return globalThis.BM_WYNIKI; }
const INFO = [
  { event_id: 'e26', nazwa: 'XVIII Hunters Grodziski Półmaraton Słowaka – Półmaraton 21,0975 km', data: '2026-06-14', miejscowosc: 'Grodzisk Wielkopolski', dystans_km: 21.097, ukonczonych: 3382, kategorie: ['M30', 'K20', 'K30'], url_wyniki: 'https://wyniki.datasport.pl/x' },
  { event_id: 'e25a', nazwa: 'XVII – Bieg 5 km', data: '2025-06-08', dystans_km: 5, ukonczonych: 200, kategorie: [] },
  { event_id: 'e25b', nazwa: 'XVII – Półmaraton', data: '2025-06-08', dystans_km: 21.097, ukonczonych: 3358, kategorie: [] },
  { event_id: null, nazwa: 'XII Hunters Grodziski Półmaraton', data: '2018-06-10', miejscowosc: 'Grodzisk Wielkopolski', dystans_km: null, dystanse: '21.097 km', ukonczonych: 0, kategorie: [], url_wyniki: null, url_strony: 'https://organizator.pl' },
];

test('router: rok i dystans w hashu w obie strony; zły klucz odpada; link z Okienka trafia w ten sam ekran', async () => {
  const W = await wyniki();
  assert.deepEqual(W.parsuj('#/impreza/kalendarz%3A461ece06/2025'), { ekran: 'impreza', klucz: 'kalendarz:461ece06', rok: 2025 });
  assert.deepEqual(W.parsuj('#/impreza/wyniki%3Adatasport%3A6182/2025/21.097'), { ekran: 'impreza', klucz: 'wyniki:datasport:6182', rok: 2025, km: 21.097 });
  assert.equal(W.hashDla({ ekran: 'impreza', klucz: 'wyniki:datasport:6182', rok: 2025, km: 5 }), '#/impreza/wyniki%3Adatasport%3A6182/2025/5');
  assert.deepEqual(W.parsuj(W.hashDla({ ekran: 'impreza', klucz: 'k:1', rok: 2026 })), { ekran: 'impreza', klucz: 'k:1', rok: 2026 });
  assert.equal(W.parsuj('#/impreza/%3Cscript%3E/2025').ekran, 'szukaj', 'obce znaki w kluczu');
  assert.equal(W.parsuj('#/impreza/a/2025/x"y').km, undefined, 'zły dystans ignorowany');
});

test('edycje: lata malejąco, domyślnie najnowszy z wynikami, dystans najliczniejszy; rok bez wyników ma event_id null i jest uczciwie odróżniony', async () => {
  const W = await wyniki();
  const L = W.edycje(INFO);
  assert.deepEqual(L.map((l) => [l.rok, l.maWyniki]), [[2026, true], [2025, true], [2018, false]]);
  assert.equal(W.wybierzEdycje(L, null).rok, 2026, 'bez roku: najnowszy z wynikami');
  assert.equal(W.wybierzEdycje(L, 2025).pozycja.id, 'e25b', 'bez dystansu: najliczniejszy');
  assert.equal(W.wybierzEdycje(L, 2025, 5).pozycja.id, 'e25a', 'dystans z linku');
  assert.equal(W.wybierzEdycje(L, 2025).dystanse.length, 2, 'dwa dystanse do przełączenia');
  const b = W.wybierzEdycje(L, 2018);
  assert.equal(b.pozycja.id, null); assert.equal(b.pozycja.urlStrony, 'https://organizator.pl'); assert.equal(b.dystanse.length, 0);
  assert.equal(W.wybierzEdycje(L, 1999).rok, 2026, 'nieznany rok: najnowszy z wynikami');
  assert.equal(W.wybierzEdycje([], 2025), null);
  assert.equal(W.edycje(INFO)[0].pozycje[0].nazwa, 'XVIII Hunters Grodziski Półmaraton Słowaka', 'bez dopisku o dystansie');
  assert.equal(W.kmTxt(21.097), 'półmaraton'); assert.equal(W.kmTxt(42.195), 'maraton'); assert.equal(W.kmTxt(10.8), '10,8 km');
  assert.deepEqual(W.kategorieRosnaco(['M30', 'K30', 'K20', 'M100']), ['K20', 'K30', 'M30', 'M100']);
  assert.equal(W.PO_ILE, 100); assert.equal(W.zakresStrony(100, 100, 3382), '101–200 z 3382');
});

test('wiersz tabeli: klucz k: i źródłowy klikalne, n: (bez rocznika) i śmieci bez linku', async () => {
  const W = await wyniki();
  assert.equal(W.wierszImprezy({ runner_key: 'datasport:1', display_name: 'A B', time_seconds: 4000, position_total: 7, category: 'M30' }).klucz, 'datasport:1');
  assert.equal(W.wierszImprezy({ runner_key: 'k:jan kowalski|1990', display_name: 'J K' }).klucz, 'k:jan kowalski|1990');
  assert.equal(W.wierszImprezy({ runner_key: 'n:jan kowalski', display_name: 'J K' }).klucz, null);
  assert.equal(W.wierszImprezy({ runner_key: 'javascript:alert(1)', display_name: 'x' }).klucz, null);
});

test('ekran imprezy: tylko RPC maszyny z listy, strona 100, stopka „Usuń moje wyniki”, uczciwy brak wyników, wyróżnienie nie wywraca ekranu, zero magazynów z danymi osób', () => {
  const h = czytaj('wyniki.html'), api = czytaj('js/wyniki-api.js');
  for (const r of ['event_info', 'event_results']) { assert.match(h, new RegExp(`rpc\\('${r}'`)); assert.match(api, new RegExp(`'${r}'`)); }
  assert.match(h, /p_limit: W\.PO_ILE/);
  assert.match(h, /<a href="usun-dane\.html">Usuń moje wyniki<\/a>/);
  assert.match(h, /Maszyna nie ma jeszcze wyników tej edycji\./); assert.match(h, /Ta edycja jeszcze się nie odbyła\./);
  assert.match(h, /window\.safeExternalHref\(u, \{ tylkoHttps: true \}\)/, 'link organizatora przez safeExternalHref');
  assert.match(h, /_sb\.rpc\('nasi_po_kluczach_f6'/); assert.match(h, /if \(r\.error\) _nasiWylaczone = true;/, 'bez funkcji: tabela bez wyróżnienia');
  assert.match(h, /nr !== _imp\.zadanie/, 'starsze zapytanie nie nadpisuje nowszego');
  assert.doesNotMatch(h.slice(h.indexOf('EKRAN IMPREZY'), h.indexOf('function ekranSzukaj')), /localStorage|sessionStorage/);
  assert.doesNotMatch(h, /onclick=/, 'zero JS w atrybucie');
  const wiersz = h.slice(h.indexOf('function wierszImprezyHtml'), h.indexOf('zawodnicy BiegaMy: RPC'));
  assert.match(wiersz, /esc\(x\.nazwa\)/); assert.match(wiersz, /data-klucz="' \+ esc\(x\.klucz\)/);
});

test('Okienko: każda edycja z kluczem prowadzi do ekranu imprezy z rokiem; klik przechodzi przez bezpiecznyCel; zły klucz bez przycisku', async () => {
  const { O } = okienko(); const W = await wyniki();
  const karta = (d) => O.htmlOdpowiedzi(200, { tryb: 'impreza', zdania: [], karty: [{ typ: 'impreza', dane: { nazwa: 'Poznań Półmaraton', data: '2025-04-13', przeszla: true, dystanse: [21.097], ...d } }] });
  const cel = (h) => (h.match(/data-cel="([^"]*)">Wyniki ›/) || [])[1];
  const c = cel(karta({ klucz: 'kalendarz:461ece06-748a-49b8-bcb1-750f25fbf28c' }));
  assert.equal(c, 'wyniki.html#/impreza/kalendarz%3A461ece06-748a-49b8-bcb1-750f25fbf28c/2025');
  assert.equal(O.bezpiecznyCel(c), c, 'klik przechodzi');
  assert.deepEqual(W.parsuj(c.split('#')[1] ? '#' + c.split('#')[1] : ''), { ekran: 'impreza', klucz: 'kalendarz:461ece06-748a-49b8-bcb1-750f25fbf28c', rok: 2025 });
  assert.equal(cel(karta({ klucz: 'wyniki:datasport:6182' })), 'wyniki.html#/impreza/wyniki%3Adatasport%3A6182/2025');
  for (const z of [null, undefined, '"><script>', 'javascript:x', 'obce:abc']) assert.equal(cel(karta({ klucz: z })), undefined, String(z));
  assert.equal(O.bezpiecznyCel('wyniki.html#/impreza/a"onmouseover/2025'), null);
  assert.equal(O.bezpiecznyCel('https://zly.pl/wyniki.html#/impreza/a/2025'), null);
});

test('EF: edycje z biegów też niosą klucz (lista „jakie biegi”), a mapowanie kalendarza go nie gubi', async () => {
  const K = await zaladuj('supabase/functions/okienko/kalendarz.mjs');
  assert.equal(K.mapuj({ klucz: 'kalendarz:abc', nazwa: 'X', data: '2025-01-01' }).klucz, 'kalendarz:abc');
  assert.match(czytaj('supabase/functions/okienko/biegi.mjs'), /klucz: typeof b\.klucz === "string" \? b\.klucz\.slice\(0, 80\) : null/);
});

test('karta osoby w Okienku: zdjęcie tylko z zaufanego hosta, bez zdjęcia inicjały, wyniki w środku karty, „prawdopodobnie” dopóki zawodnik nie potwierdzi; XSS w nazwie martwy', () => {
  const { O } = okienko();
  const ID = '56092926-2cf1-44b6-952f-38614497fdc2';
  const karta = (d) => O.htmlOdpowiedzi(200, { tryb: 'osoba', zdania: [], karty: [{ typ: 'osoba', dane: { id: ID, nazwa: 'Filip Jańczak — trener', prywatny: false, bez_znajomosci: true, ...d } }] });
  const av = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/avatars/a.jpg';
  assert.match(karta({ avatar_url: av }), /<img src="https:\/\/afqojgkaveykxbltxzwm\.supabase\.co\/storage\/v1\/object\/public\/avatars\/a\.jpg"/);
  const obcy = karta({ avatar_url: 'https://zly.pl/x.jpg' });
  assert.doesNotMatch(obcy, /<img/, 'obcy host: bez obrazka'); assert.match(obcy, />FJ<\/span>/, 'inicjały');
  assert.doesNotMatch(karta({ avatar_url: 'javascript:alert(1)' }), /javascript:/);
  const w = { nazwa: 'Filip Janczak', rocznik: 1989, starty: 20, klucz: 'datasport:41118', ostatnie: [{ bieg: 'Maraton Dębno', data: '2026-10-18', czas_s: 10652 }], ostatni: { bieg: 'Maraton Dębno', data: '2026-10-18' }, inne: [{ nazwa: 'Filip Janczak', rocznik: 1989, starty: 3 }] };
  const z = karta({ wyniki: { ...w, prawdopodobnie: true } });
  assert.match(z, /prawdopodobnie ta osoba/); assert.match(z, /data-cel="wyniki\.html#\/zawodnik\/datasport%3A41118">Otwórz wyniki/); assert.match(z, /Maraton Dębno/); assert.match(z, /Też w wynikach/);
  assert.doesNotMatch(karta({ wyniki: { ...w, potwierdzone: true } }), /prawdopodobnie/);
  assert.doesNotMatch(karta({ prywatny: true, wyniki: w }), /Otwórz wyniki/, 'prywatny: bez wyników nawet gdyby EF je wysłało');
  const x = karta({ nazwa: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(x, /<img src=x/);
});

function f6Atrapa(kandydaci, wiersze = [{ event_name: 'Maraton Dębno', event_date: '2026-10-18', distance_km: 42.195, time_seconds: 10652, position_total: 80 }]) {
  const wolania = [];
  const fetchFn = async (url, init) => {
    const rpc = url.split('/rpc/')[1]; wolania.push({ rpc, args: JSON.parse(init.body) });
    if (rpc === 'search_runners') return { ok: true, status: 200, json: async () => kandydaci };
    if (rpc === 'runner_results') return { ok: true, status: 200, json: async () => wiersze };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, wolania };
}
const ludzie = (a) => atrapa({ athletes: [{ id: JA, user_id: 'u-ja', full_name: 'Testowa Osoba', is_public: false }, ...a], friendships: [] });
const pytaj = async (O, sb, f6, q = 'Damian Bolewski') => { O._wyczyscPamiecF6(); return O.odpowiedzOsoba({ sb, athleteId: JA, fetchFn: f6.fetchFn, token: 'T', q, wprost: false, sieciDozwolona: async () => false, siec: async () => ({}) }); };
const DAMIAN = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Damian Bolewski', is_public: true, avatar_url: 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/avatars/d.jpg', f6_runner_key: null, date_of_birth: '1989-03-01' };
const KAND = [{ runner_key: 'datasport:405371', display_name: 'BOLEWSKI DAMIAN', yob: 1989, results_count: 33 }, { runner_key: 'n:bolewski damian', display_name: 'BOLEWSKI DAMIAN', yob: null, results_count: 1 }];

test('EF osoba: profil publiczny bez klucza + imię, nazwisko i rocznik się zgadzają → wyniki w karcie jako „prawdopodobnie”; NIC nie zapisujemy; pola techniczne nie wychodzą', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const sb = ludzie([DAMIAN]), o = await pytaj(O, sb, f6Atrapa(KAND));
  assert.deepEqual(o.karty.map((k) => k.typ), ['osoba'], 'wyniki w karcie osoby, nie obok');
  const d = o.karty[0].dane;
  assert.equal(d.avatar_url, DAMIAN.avatar_url); assert.equal(d.wyniki.prawdopodobnie, true); assert.equal(d.wyniki.klucz, 'datasport:405371'); assert.equal(d.wyniki.starty, 33);
  const j = JSON.stringify(o);
  assert.doesNotMatch(j, /_klucz|_rocznik|date_of_birth|f6_runner_key|1989-03-01/, 'data urodzenia i pola techniczne nie idą do klienta');
  assert.match(czytaj('supabase/functions/okienko/osoba.mjs').slice(0, 200), /OKIENKO/);
  assert.doesNotMatch(czytaj('supabase/functions/okienko/osoba.mjs'), /ustaw_f6_runner_key|\.(insert|update|upsert)\(/, 'EF nie zapisuje powiązania');
});

test('EF osoba: klucz w profilu (potwierdzone) → wyniki po KLUCZU, nawet gdy wyszukiwarka daje kogoś innego; rocznik się nie zgadza → osobna karta, bez „to on”; profil prywatny bez zdjęcia i wyników', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const f = f6Atrapa(KAND), z = await pytaj(O, ludzie([{ ...DAMIAN, f6_runner_key: 'datasport:777' }]), f);
  assert.ok(f.wolania.some((w) => w.rpc === 'runner_results' && w.args.p_runner_key === 'datasport:777'));
  assert.equal(z.karty[0].dane.wyniki.potwierdzone, true); assert.equal(z.karty[0].dane.wyniki.klucz, 'datasport:777'); assert.equal(z.karty[0].dane.wyniki.prawdopodobnie, undefined);
  const inny = await pytaj(O, ludzie([{ ...DAMIAN, date_of_birth: '2001-01-01' }]), f6Atrapa(KAND));
  assert.deepEqual(inny.karty.map((k) => k.typ), ['osoba', 'wyniki'], 'imiennik z innego rocznika: nie w karcie tej osoby');
  assert.equal(inny.karty[0].dane.wyniki, undefined);
  const pryw = await pytaj(O, ludzie([{ ...DAMIAN, is_public: false, f6_runner_key: 'datasport:777' }]), f6Atrapa(KAND));
  assert.equal(pryw.karty[0].dane.prywatny, true); assert.ok(!('avatar_url' in pryw.karty[0].dane), 'bez zdjęcia'); assert.equal(pryw.karty[0].dane.wyniki, undefined);
  assert.doesNotMatch(JSON.stringify(pryw.karty[0]), /datasport:777/, 'klucz prywatnego nie wychodzi');
});

test('pasujeDoOsoby: odwrócona kolejność i bez znaków pasuje; samo imię nigdy; bez rocznika tylko, gdy maszyna zna jedną osobę o tej nazwie', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs');
  const w = (nazwa, rocznik, dop) => ({ najlepszy: { nazwa, rocznik }, dopasowania: dop || [{ nazwa, rocznik }] });
  assert.equal(O.pasujeDoOsoby(w('JANCZAK FILIP', 1989), 'Filip Jańczak', 1989), true);
  assert.equal(O.pasujeDoOsoby(w('JANCZAK FILIP', 1989), 'Filip Jańczak', 1990), false);
  assert.equal(O.pasujeDoOsoby(w('JANCZAK FILIP', 1989), 'Filip Jańczak', null), true, 'konto bez rocznika, jedna osoba');
  assert.equal(O.pasujeDoOsoby(w('JANCZAK FILIP', 1989, [{ nazwa: 'JANCZAK FILIP', rocznik: 1989 }, { nazwa: 'Filip Janczak', rocznik: 1970 }]), 'Filip Jańczak', null), false, 'dwóch imienników bez rocznika w profilu: nie zgadujemy');
  assert.equal(O.pasujeDoOsoby(w('FILIP', 1989), 'Filip', 1989), false, 'samo imię');
  assert.equal(O.pasujeDoOsoby(w('JAN KOWALSKI', 1989), 'Filip Jańczak', 1989), false);
  assert.equal(O.pasujeDoOsoby(null, 'Filip Jańczak', 1989), false);
});

test('„Filip Janczak” i „kim jest Filip”: karta z profilu, wyniki po nazwisku z „o nas” jako „prawdopodobnie”; Kasia bez nazwiska nie pyta maszyny po samym imieniu; awaria maszyny nie psuje odpowiedzi', async () => {
  const O = await zaladuj('supabase/functions/okienko/osoba.mjs'), N = await zaladuj('supabase/functions/_shared/o-nas.mjs');
  assert.equal(N.oNas('Filip Janczak').temat, 'filip'); assert.equal(N.PROFIL_TEMATU.filip.id, N.PROFILE.profil_filipa.id); assert.equal(N.PROFIL_TEMATU.kasia.szukaj, null);
  const baza = (a) => atrapa({ athletes: [{ id: N.PROFILE.profil_filipa.id, full_name: 'Filip', is_public: true, avatar_url: null, f6_runner_key: null, date_of_birth: null, ...a }, { id: N.PROFILE.profil_kasi.id, full_name: 'Kasia', is_public: true, avatar_url: null, f6_runner_key: null }] });
  const KF = [{ runner_key: 'datasport:41118', display_name: 'JANCZAK FILIP', yob: 1989, results_count: 20 }, { runner_key: 'k:filip janczak|1989', display_name: 'Janczak Filip', yob: 1989, results_count: 3 }];
  O._wyczyscPamiecF6();
  let f = f6Atrapa(KF);
  let k = await O.kartyProfilu({ sb: baza(), fetchFn: f.fetchFn, token: 'T', profil: N.PROFIL_TEMATU.filip });
  assert.equal(k.length, 1); assert.equal(k[0].typ, 'osoba'); assert.equal(k[0].dane.bez_znajomosci, true);
  assert.equal(k[0].dane.wyniki.prawdopodobnie, true); assert.equal(k[0].dane.wyniki.klucz, 'datasport:41118'); assert.equal(k[0].dane.wyniki.inne[0].starty, 3, 'drugi klucz tej samej osoby widać');
  O._wyczyscPamiecF6();
  k = await O.kartyProfilu({ sb: baza({ f6_runner_key: 'datasport:41118', avatar_url: 'https://a/b.jpg' }), fetchFn: f6Atrapa([]).fetchFn, token: 'T', profil: N.PROFIL_TEMATU.filip });
  assert.equal(k[0].dane.wyniki.potwierdzone, true); assert.equal(k[0].dane.avatar_url, 'https://a/b.jpg');
  O._wyczyscPamiecF6(); f = f6Atrapa(KF);
  k = await O.kartyProfilu({ sb: baza(), fetchFn: f.fetchFn, token: 'T', profil: N.PROFIL_TEMATU.kasia });
  assert.equal(f.wolania.length, 0, 'bez nazwiska: zero zapytań po samym imieniu'); assert.equal(k[0].dane.wyniki, undefined);
  O._wyczyscPamiecF6();
  k = await O.kartyProfilu({ sb: baza(), fetchFn: async () => { throw new Error('sieć'); }, token: 'T', profil: N.PROFIL_TEMATU.filip });
  assert.equal(k[0].dane.id, N.PROFILE.profil_filipa.id, 'karta zostaje'); assert.equal(k[0].dane.wyniki, undefined);
  k = await O.kartyProfilu({ sb: atrapa({ athletes: [] }), fetchFn: f.fetchFn, token: 'T', profil: N.PROFIL_TEMATU.filip });
  assert.equal(k[0].dane.nazwa, N.PROFILE.profil_filipa.nazwa, 'brak wiersza: karta z o-nas, bez wyniku');
  const p = czytaj('supabase/functions/okienko-v2/potok.mjs');
  assert.ok(p.indexOf('const on = oNas(tekst);') < p.indexOf('kartyProfilu({ sb, fetchFn, token: jwt, profil: PROFIL_TEMATU[on.temat] })') && p.indexOf('kartyProfilu({ sb') < p.indexOf('const os = osobaZPytania(tekst);'));
});

test('„To moje wyniki?”: te same słowa + rocznik, bez odrzuconych i kluczy n:; zapis dopiero po dotknięciu Tak (RPC) albo Nie (tabela); konto z samym imieniem dostaje podpowiedź; własny klucz = cisza', async () => {
  globalThis.window = globalThis; await zaladuj('js/tekst.mjs'); await zaladuj('js/moje-wyniki.mjs');
  const M = globalThis.BM_MOJE_WYNIKI;
  const L = [{ runner_key: 'datasport:405371', display_name: 'BOLEWSKI DAMIAN', yob: 1989, results_count: 33 }, { runner_key: 'n:bolewski damian', display_name: 'BOLEWSKI DAMIAN', yob: null, results_count: 1 },
    { runner_key: 'datasport:5', display_name: 'BOLEWSKI DAMIAN', yob: 1970, results_count: 2 }, { runner_key: 'datasport:6', display_name: 'BOLEWSKI ADAM', yob: 1989, results_count: 9 }];
  assert.deepEqual(M.kandydaci(L, 'Damian Bolewski', 1989, []).map((x) => x.runner_key), ['datasport:405371']);
  assert.deepEqual(M.kandydaci(L, 'Damian Bolewski', 1989, ['datasport:405371']), [], '„Nie” zapamiętane');
  assert.deepEqual(M.kandydaci(L, 'Damian Bolewski', null, []).map((x) => x.runner_key), ['datasport:405371', 'datasport:5'], 'bez rocznika: wszyscy imiennicy z kluczem, decyduje człowiek');
  assert.deepEqual(M.kandydaci(L, 'Damian', 1989, []), [], 'samo imię');
  assert.equal(M.RE_KLUCZ.test('n:bolewski damian'), false); assert.equal(M.RE_KLUCZ.test('k:jan kowalski|1990'), true);

  const zapisy = [], sluchacze = [];
  const sb = (dane, odrz = []) => ({
    from: (t) => t === 'athletes' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: dane, error: null }) }) }) }
      : { select: () => ({ eq: async () => ({ data: odrz.map((klucz) => ({ klucz })), error: null }) }), insert: async (w) => { zapisy.push(['insert', w]); return { error: null }; } },
    rpc: async (n, a) => { zapisy.push([n, a]); return { error: null }; } });
  const root = () => ({ hidden: true, innerHTML: '', addEventListener: (_, f) => sluchacze.push(f), querySelector: () => null });
  globalThis.wynikiApiDostepne = () => true; globalThis.escapeHtml = (s) => String(s).replace(/</g, '&lt;');
  const api = { rpc: async () => ({ data: L, error: null }) };
  let r = root(), s = await M.pokaz({ sb: sb({ full_name: 'Damian Bolewski', date_of_birth: '1989-03-01', f6_runner_key: null }), athleteId: 'a', root: r, api });
  assert.equal(s, 'pytanie'); assert.match(r.innerHTML, /To moje wyniki\?/); assert.match(r.innerHTML, /data-tak data-klucz="datasport:405371"/); assert.equal(r.hidden, false);
  assert.deepEqual(zapisy, [], 'samo pokazanie niczego nie zapisuje');
  const przycisk = (attr, klucz) => { const b = { disabled: false, hasAttribute: (a) => a === attr, getAttribute: () => klucz, closest: () => null }; return { target: { closest: () => b } }; };
  await sluchacze[0](przycisk('data-tak', 'datasport:405371'));
  assert.deepEqual(zapisy, [['ustaw_f6_runner_key', { p_key: 'datasport:405371' }]], 'Tak: wyłącznie istniejące RPC');
  assert.match(r.innerHTML, /wyniki\.html#\/zawodnik\/datasport%3A405371/);
  zapisy.length = 0; r = root(); sluchacze.length = 0;
  await M.pokaz({ sb: sb({ full_name: 'Damian Bolewski', date_of_birth: '1989-03-01', f6_runner_key: null }), athleteId: 'a', root: r, api });
  await sluchacze[0](przycisk('data-nie', 'datasport:405371'));
  assert.deepEqual(zapisy, [['insert', { athlete_id: 'a', klucz: 'datasport:405371' }]], 'Nie: zapamiętane, bez powiązania');
  assert.equal(await M.pokaz({ sb: sb({ full_name: 'Damian Bolewski', date_of_birth: '1989-03-01', f6_runner_key: null }, ['datasport:405371']), athleteId: 'a', root: root(), api }), 'pominiete', 'po „Nie” pytanie nie wraca');
  assert.equal(await M.pokaz({ sb: sb({ full_name: 'Damian Bolewski', f6_runner_key: 'datasport:405371' }), athleteId: 'a', root: root(), api }), 'pominiete', 'ma klucz: cisza');
  const r2 = root();
  assert.equal(await M.pokaz({ sb: sb({ full_name: 'Filip', date_of_birth: null, f6_runner_key: null }), athleteId: 'a', root: r2, api }), 'podpowiedz'); assert.match(r2.innerHTML, /To ja/);
  delete globalThis.wynikiApiDostepne; delete globalThis.escapeHtml;
  const prof = czytaj('profil.html');
  assert.match(prof, /<script src="js\/moje-wyniki\.mjs"><\/script>/); assert.match(prof, /if\(_isOwnProfile&&window\.BM_MOJE_WYNIKI\)/, 'tylko na własnym profilu');
});

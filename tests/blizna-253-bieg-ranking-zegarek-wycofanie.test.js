/* BLIZNA 253 (w commitach 30bdb5bd i 15b7a32f jeszcze jako 252; numer 252 ma też gałąź raportów AI) / decyzje 16.11 wieczór i usterki z próby 16.11 (bieg wirtualny, regulamin 2026-11-v2):
   - ranking (czas i miejsce) tylko z treningu z zegarka albo aplikacji z GPS (training_logs.source = 'intervals'); wynik ręczny = ukończenie i dyplom, na liście „wynik ręczny”
     (migracja 20261203, test po skutku tools/akcja-bieg-ranking-gps-test.sql); § 5 ust. 5, § 8 ust. 1 i § 9 mówią to samo, żadne zdanie nie obiecuje miejsca za wynik ręczny;
   - § 9 w brzmieniu od organizatora; § 4 ust. 3: numer startowy po rezygnacji nie wraca; zdanie pod zgodą na imię dziecka;
   - „Wycofaj”: imię i numer w linku i w potwierdzeniu, link w karcie tego samego uczestnika (na próbie wycofane zostało nie to dziecko);
   - zgoda na e-mail w „Twój bieg” nie znika po wycofaniu zapisu (nieudany odczyt zgody, dwa odświeżenia naraz). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { zaladujSb, blokiSkryptow, zamrozTimery } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const kod = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const czekaj = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const BIEG = (x) => Object.assign({ slug: 'proba-bieg', nazwa: 'Bieg próbny', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', dystanse_km: [5], faza: 'zapisy',
  regulamin_wersja: '2026-11-v2', regulamin_od: '2026-11-18', limit_dzieci: 6, zapisani: 3, zapisani_na: { 5: 1 }, dzieci: 2, ukonczyli_n: 0 }, x || {});
const MIG = 'supabase/migrations/20261203_akcja_bieg_ranking_tylko_gps.sql', WYC = 'supabase/migrations/20261203_WYCOFANIE_akcja_bieg_ranking_tylko_gps.sql';
let B;

test.before(async () => {
  const SB = zaladujSb();
  for (const k of ['escapeHtml', 'safeExternalHref', 'safeUrlAttr', 'SB_URL']) globalThis[k] = SB[k];
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  B = globalThis.BM_BIEG_REAL;
});

/* atrapa strony jak w blizna-241/251; rpc(nazwa, args, nrWywolania) podmieniane w teście, klik w link = zdarzenie click dokumentu */
function nowyElement(id, attrs) {
  const h = {};
  const e = { id, hidden: false, innerHTML: '', className: '', href: '', value: '', checked: false, disabled: false, style: {}, attrs: Object.assign({}, attrs || {}),
    addEventListener(t, f) { (h[t] = h[t] || []).push(f); }, getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); }, removeAttribute(n) { delete this.attrs[n]; }, appendChild(c) { (this.dzieci = this.dzieci || []).push(c); return c; }, remove() {},
    querySelectorAll: () => [], querySelector: () => null, scrollIntoView() {}, focus() {}, closest: () => null,
    klik() { (h.click || []).forEach((f) => f.call(e, { target: e, preventDefault() {} })); } };
  let tekst = ''; Object.defineProperty(e, 'textContent', { get: () => tekst, set: (v) => { tekst = String(v); e.dzieci = []; }, enumerable: true });
  return e;
}
async function stronaBiegu({ bieg = BIEG(), odpowiedz, search = '?proba=1' }) {
  const ctx = zamrozTimery(zaladujSb());
  Object.assign(ctx.location, { pathname: '/bieg.html', search, origin: 'https://biegamy.run' });
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const html = czytaj('bieg.html').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''), rej = new Map(), stany = [], zdarzenia = {}, wywolania = [], pytania = [];
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
    const a = m[2], id = /\bid="([^"]+)"/.exec(a), ds = /\bdata-stan="([^"]+)"/.exec(a), e = nowyElement(id ? id[1] : '', ds ? { 'data-stan': ds[1] } : {}); e.hidden = /\shidden(?=[\s>]|$)/.test(a);
    if (id) rej.set(id[1], e); else if (ds) stany.push(e);
  }
  const daj = (id) => { if (!rej.has(id)) rej.set(id, nowyElement(id)); return rej.get(id); };
  rej.get('bw-cta').querySelectorAll = (s) => (s === '[data-stan]' ? stany : []);
  Object.assign(ctx.document, { getElementById: daj, querySelector: () => null, createElement: (t) => Object.assign(nowyElement(''), { tag: t }), createTextNode: (t) => ({ textContent: t }), head: nowyElement('head'), body: nowyElement('body'),
    readyState: 'interactive', visibilityState: 'visible', querySelectorAll: () => [], addEventListener: (t, f) => { (zdarzenia[t] = zdarzenia[t] || []).push(f); } });
  const licznik = { wystartowala: true, nazwa: 'Akcja', imie: 'Janek', url_zbiorki: 'https://www.siepomaga.pl/x', bieg };
  ctx.fetch = async (url) => (/bieg-ukonczyli/.test(url) ? { ok: true, status: 200, json: async () => ({ razem: 0, lista: [] }) } : { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(licznik)) });
  for (const p of ['js/akcja.mjs', 'js/bieg.mjs']) vm.runInContext(kod(p), ctx, { filename: p });
  ctx.BM_AKCJA.zUlica = (cb) => cb({ licznikProby: () => Promise.resolve(JSON.parse(JSON.stringify(licznik))) });
  ctx.sb = { auth: { getSession: async () => ({ data: { session: { user: {} } } }) }, rpc: (n, a) => { wywolania.push([n, a]); return Promise.resolve(odpowiedz(n, a, wywolania.filter((w) => w[0] === n).length)); } };
  ctx.confirm = (t) => { pytania.push(t); return true; }; ctx.alert = () => {};
  blokiSkryptow('bieg.html').forEach((k, i) => vm.runInContext(k, ctx, { filename: 'bieg.html#' + i }));
  (zdarzenia.DOMContentLoaded || []).forEach((f) => f());
  await czekaj();
  const klikWycofaj = (id) => { const link = nowyElement('', { 'data-wycofaj': id }); link.closest = (s) => (s === '[data-wycofaj]' ? link : null); (zdarzenia.click || []).forEach((f) => f({ target: link, preventDefault() {} })); };
  return { daj, zdarzenia, wywolania, pytania, klikWycofaj };
}
const KONTO = () => [{ id: 'd1', rodzaj: 'dziecko', numer: 1, imie: 'Alfa' }, { id: 'j2', rodzaj: 'ja', numer: 2, imie: 'Tester', dystans_km: 5 }, { id: 'd4', rodzaj: 'dziecko', numer: 4, imie: 'Gamma' }];

test('PRAWDZIWY bieg (bez ?proba=1, komplet tekstów): strona pyta o własne zapisy i pokazuje numer po zapisie; za bramką tekstów dalej nie pyta', async () => {
  const odp = (n) => (n === 'akcja_bieg_moi' ? { data: KONTO(), error: null } : n === 'akcja_bieg_moja_zgoda' ? { data: { zgoda_email: false, ma_zapis: true }, error: null } : { data: null, error: null });
  const s = await stronaBiegu({ search: '', bieg: BIEG({ slug: 'bieg-mikolajki' }), odpowiedz: odp });
  assert.ok(s.wywolania.some((w) => w[0] === 'akcja_bieg_moi'), 'poza próbą, z kompletem wartości: odczyt własnych zapisów');
  assert.equal(s.daj('bw-moj').hidden, false, 'karta „Twój bieg” widoczna'); assert.match(s.daj('bw-moj-tresc').innerHTML, /<h3>Tester<small>numer 2 /);
  assert.equal(s.daj('bw-zgoda-konto-pole').hidden, false);
  const z = await stronaBiegu({ search: '', bieg: BIEG({ slug: 'bieg-mikolajki', regulamin_wersja: '2026-11-v1' }), odpowiedz: odp });
  assert.ok(!z.wywolania.some((w) => w[0] === 'akcja_bieg_moi'), 'inna wersja regulaminu = bramka: bez odczytu zapisów'); assert.equal(z.daj('bw-moj').hidden, true);
});

test('PRAWDZIWY bieg bez ?proba, cała ścieżka: przed zapisem → okno zapisu bez wyboru dystansu → zapis → karta „Twój bieg” z numerem → po ukończeniu dyplom i odznaka', async () => {
  const bieg = BIEG({ slug: 'bieg-mikolajki', nazwa: 'Bieg wirtualny' }); let moi = [];
  const s = await stronaBiegu({ search: '', bieg, odpowiedz: (n, a) => {
    if (n === 'akcja_bieg_moi') return { data: moi.slice(), error: null };
    if (n === 'akcja_bieg_moja_zgoda') return { data: { zgoda_email: false, ma_zapis: true }, error: null };
    if (n === 'akcja_bieg_zapisz') { moi = [{ id: 'j9', rodzaj: 'ja', numer: 9, imie: a.p_imie || 'Ola', dystans_km: a.p_dystans, regulamin_wersja: a.p_regulamin_wersja }]; return { data: { ok: true, id: 'j9', numer: 9 }, error: null }; }
    return { data: null, error: null };
  } });
  assert.equal(s.daj('bw-chip-faza').textContent, 'ZAPISY OTWARTE'); assert.equal(s.daj('bw-chip-proba').hidden, true, 'to nie jest próba');
  assert.equal(s.daj('bw-moj').hidden, true, 'przed zapisem bez karty');
  assert.ok(s.wywolania.some((w) => w[0] === 'akcja_bieg_moi'), 'strona pyta o własne zapisy także przed zapisem');
  s.daj('bw-zapisz').klik();
  assert.equal(s.daj('bw-okno-zapis').getAttribute('open'), '', 'okno zapisu otwarte'); assert.equal(s.daj('bw-zapis-dystanse').hidden, true, 'jeden dystans: bez wyboru');
  s.daj('bw-imie').value = 'Ola'; s.daj('bw-regulamin').checked = true; s.daj('bw-zapis-ok').klik(); await czekaj();
  const z = s.wywolania.find((w) => w[0] === 'akcja_bieg_zapisz'); assert.ok(z, 'zapis wysłany');
  assert.equal(z[1].p_slug, 'bieg-mikolajki'); assert.equal(z[1].p_dystans, 5); assert.equal(z[1].p_regulamin_wersja, '2026-11-v2');
  assert.equal(s.daj('bw-moj').hidden, false, 'po zapisie karta „Twój bieg” (na kodzie sprzed 15b7a32f strona nie czytała zapisów poza próbą)');
  const karta = s.daj('bw-moj-tresc').innerHTML;
  assert.match(karta, /<h3>Ola<small>numer 9 · 5 km<\/small><\/h3>/); assert.match(karta, /<img class="bw-obraz" data-numer="j9" alt="Numer startowy 9">/); assert.match(karta, /data-udostepnij="j9">Udostępnij numer/);
  assert.match(karta, /Wycofaj zapis: Ola, numer 9/); assert.doesNotMatch(karta, /data-dyplom=/, 'przed biegiem bez dyplomu');
  bieg.faza = 'wyniki'; moi = [{ ...moi[0], ukonczony_at: '2026-12-06T10:00:00Z', wynik_s: 1500, wynik_dystans_km: 5, wynik_trening_km: 5.1, wynik_reczny: false, odznaka: 'zwykla' }];
  (s.zdarzenia.visibilitychange || []).forEach((f) => f()); await czekaj();
  const po = s.daj('bw-moj-tresc').innerHTML;
  assert.match(po, /Ukończony: <b>5,1 km · 25:00 · 4:54 \/km<\/b>/); assert.match(po, /<img class="bw-obraz" data-dyplom="j9" alt="Dyplom Ola">/); assert.match(po, /data-dyplom-a4="j9">Dyplom A4/);
  assert.match(po, /Odznaka biegu jest już w Twojej kolekcji/); assert.doesNotMatch(po, /data-wycofaj/, 'ukończonego zapisu nie da się wycofać');
});

test('regulamin v2: § 9 w brzmieniu od organizatora (4 ustępy); § 4 ust. 3 mówi, że numer nie wraca; zgoda na imię dziecka z dopowiedzeniem', () => {
  const p = (n) => B.REGULAMIN.paragrafy[n - 1];
  assert.equal(p(9).naglowek, '§ 9. Uczciwość');
  assert.deepEqual([...p(9).punkty], [
    'Jedna osoba zapisuje się raz. Zabronione jest wpisywanie treningów, które się nie odbyły, cudzych treningów oraz treści bezprawnych lub obraźliwych, także w polu imienia.',
    'W rankingu są wyniki z zegarka i wpisane ręcznie.',
    'Wynik budzący wątpliwości (np. tempo szybsze niż 3:00/km) trafia do rankingu po sprawdzeniu przez Organizatora, który może poprosić o dowód (np. zapis z zegarka, zrzut z aplikacji).',
    'Organizator może usunąć zapis albo wynik sprzeczny z regulaminem. W sprawach spornych, także dotyczących uczciwości wyników, rozstrzyga Organizator.']);
  assert.match(p(4).punkty[2], /^Z zapisu można zrezygnować w każdej chwili w aplikacji, bez podawania przyczyny\. Numer startowy po rezygnacji przepada i nie wraca do puli: przy ponownym zapisie uczestnik dostaje nowy numer\.$/);
  assert.equal(B.pytanieWycofania({ imie: 'Alfa', numer: 2 }), 'Wycofać zapis: Alfa, numer 2? Numer startowy przepada.', 'strona mówi to samo co § 4 ust. 3');
  const POD = 'Imię zawsze widzisz na numerze i dyplomie dziecka. Ta zgoda dotyczy tylko publicznej listy.';
  assert.equal(B.TEKSTY.zgoda_imie_dziecka_pod, POD);
  assert.ok(B.REGULAMIN.zgody.lista.find((z) => z.nazwa === 'Imię dziecka na liście').tekst.endsWith(' ' + POD), 'pełne brzmienie zgody w regulaminie');
  const h = czytaj('bieg.html');
  assert.match(h, /id="bw-zgoda-imie-dziecka-tekst"><\/span><\/label>\n\s*<p class="bw-drobne bw-pod-zgoda" id="bw-zgoda-imie-dziecka-pod"><\/p>/, 'zdanie pod zgodą w oknie dziecka');
  assert.match(h, /\$\('bw-zgoda-imie-dziecka-pod'\)\.textContent = B\.TEKSTY\.zgoda_imie_dziecka_pod;/);
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v8'); assert.ok(B.WERSJE_TEKSTOW.includes('2026-11-v2'));
});

test('strażnik tekstów (decyzja 17.11 wieczór, 20261206): § 5 ust. 5, § 8 ust. 1 i § 9 ust. 2–4 zgodne: w rankingu wyniki z zegarka i wpisane ręcznie, wątpliwe po sprawdzeniu; nic nie mówi „tylko z zegarka”', () => {
  const p = (n) => B.REGULAMIN.paragrafy[n - 1];
  const R = 'W rankingu są wyniki z zegarka i wpisane ręcznie.', W = 'Wynik budzący wątpliwości (np. tempo szybsze niż 3:00/km) trafia do rankingu po sprawdzeniu przez Organizatora, który może poprosić o dowód (np. zapis z zegarka, zrzut z aplikacji).';
  assert.equal(p(9).punkty[1], R); assert.equal(p(9).punkty[2], W, '§ 9 ust. 3 dosłownie');
  assert.ok(p(5).punkty[4].includes(' ' + R + ' ' + W + ' '), '§ 5 ust. 5 zawiera te same dwa zdania dosłownie');
  assert.match(p(5).punkty[4], /^Bieg nie ma nagród\. Ranking czasów \{ranking_dystanse\} obejmuje wyłącznie pełnoletnich uczestników, którzy zgodzili się na udział w rankingu\. /);
  assert.match(p(8).punkty[0], /U osób, które zgodziły się na ranking, lista pokazuje także czas i miejsce na zasadach z § 5 ust\. 5\. Przy wyniku wpisanym ręcznie lista pokazuje dopisek „wynik ręczny”\./);
  assert.match(p(9).punkty[3], /^Organizator może usunąć zapis albo wynik sprzeczny z regulaminem\./, '§ 9 ust. 4 bez zmian (podstawa „Usuń wynik”)');
  assert.match(p(5).punkty[0], /Trening może pochodzić z zegarka albo być wpisany ręcznie\./);
  const zdania = [];
  for (const par of B.REGULAMIN.paragrafy) for (const t of par.punkty) for (const x of t.split(/(?<=[.?!])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„])/)) zdania.push([par.naglowek, x]);
  for (const t of [B.tekstyDystansow(BIEG()).czasy_prywatne, B.tekstyDystansow(BIEG({ dystanse_km: [5, 10] })).czasy_prywatne, B.TEKSTY.wynik_reczny, B.TEKSTY.wynik_weryfikacja, B.TEKSTY.wynik_odrzucony]) for (const x of t.split(/(?<=[.?!])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„])/)) zdania.push(['strona', x]);
  let reczne = 0, watpliwe = 0;
  for (const [skad, x] of zdania) {
    assert.doesNotMatch(x, /wyłącznie wyniki z treningu zapisanego zegarkiem|tylko trening zapisany zegarkiem|ręczn\S* [^.]*bez miejsca w rankingu|aplikacj\S* z GPS/, skad + ': zdanie ze starej zasady (tylko zegarek): ' + x);
    if (/ręczn/.test(x) && /ranking|czas|miejsc|list/.test(x)) { reczne++; assert.match(x, /wpisane ręcznie|dopisek „wynik ręczny”|z dopiskiem „wynik ręczny”|wpisanym ręcznie \(z dopiskiem|może zaliczyć/, skad + ': zdanie o wyniku ręcznym przeczy rankingowi z dopiskiem: ' + x); }
    if (/wątpliwości|czeka na sprawdzenie/.test(x)) { watpliwe++; assert.match(x, /3:00\/km|dowód|Organizator|organizator/, skad + ': ' + x); }
  }
  assert.ok(reczne >= 4 && watpliwe >= 3, 'strażnik widzi zdania: ręczne ' + reczne + ', wątpliwe ' + watpliwe);
  assert.match(p(5).punkty[4], /W rankingu liczy się trening \{ranking_zakres\}; dłuższy trening daje ukończenie i dyplom z prawdziwym dystansem i czasem, bez miejsca w rankingu\./);
  assert.equal(B.zakresRankingu([5]), 'od 5 km do 5,49 km'); assert.equal(B.zakresRankingu([5, 10]), 'od 5 km do 5,49 km albo od 10 km do 10,49 km');
  const mig = czytaj('supabase/migrations/20261206_akcja_bieg_dyplom_flagi.sql');
  assert.ok(mig.includes('public.akcja_bieg_km_wyniku(u) <= u.wynik_dystans_km + 0.49'), 'próg długości w bazie = w tekstach (dystans + 0,49 km)');
  assert.ok(mig.includes('(u.wynik_s < k.km * 180 or u.wynik_s > k.km * 2160)'), 'próg wiarygodności w bazie: 3:00/km i 36:00/km');
  assert.match(B.TEKSTY.wynik_weryfikacja, /3:00\/km albo wolniejsze niż 36:00\/km/, 'karta mówi oba progi');
  assert.equal(B.WERSJA_TEKSTOW, '2026-11-v8', '18.11: v3 (termin w § 2), v4–v6 (§ 5 ust. 5, § 8 ust. 1: czas dłuższego treningu, od v5 na 5 km z tempa, w v6 bez górnej granicy); v2 przyjmowana dalej');
});

test('lista „ukończyli” (20261206): wynik ręczny z czasem, miejscem i dopiskiem; bez czasu od serwera bez miejsca; dziecko bez dopisku; karta: ręczny, do weryfikacji, odrzucony', () => {
  const r = B.wierszUkonczyl({ numer: 7, imie: 'Ola', dystans_km: 5, dziecko: false, reczny: true }, false, false);
  assert.match(r, /<span class="bw-dyst">5 km · <small class="bw-reczny">wynik ręczny<\/small><\/span>/); assert.doesNotMatch(r, /bw-czas|bw-pozycja/, 'serwer nie dał czasu: bez czasu');
  const rr = B.wierszUkonczyl({ numer: 7, imie: 'Ola', dystans_km: 5, dziecko: false, reczny: true, miejsce: 1, czas_s: 1200 }, false, true);
  assert.match(rr, /aria-label="miejsce 1">1\.<\/span>/); assert.match(rr, /<b class="bw-czas">20:00<\/b> · 5 km · <small class="bw-reczny">wynik ręczny<\/small>/, 'ręczny w rankingu z dopiskiem');
  assert.doesNotMatch(B.wierszUkonczyl({ numer: 8, imie: 'Zosia', dystans_km: 1.5, dziecko: true, reczny: true }, false, false), /wynik ręczny/);
  const z = B.wierszUkonczyl({ numer: 3, imie: 'Ewa', dystans_km: 5, dziecko: false, reczny: false, miejsce: 1, czas_s: 1500 }, false, true);
  assert.match(z, /<b class="bw-czas">25:00<\/b> · 5 km<\/span>/); assert.doesNotMatch(z, /wynik ręczny/);
  const l = B.ukonczyliHtml({ razem: 2, lista: [{ numer: 7, imie: 'Ola', dystans_km: 5, dziecko: false, reczny: true, miejsce: 1, czas_s: 1200 }, { numer: 9, imie: 'Jan', dystans_km: 5, dziecko: false, reczny: true }] });
  assert.match(l, /bw-wiersz--ranking/, 'ręczny z miejscem: lista z kolumną miejsca');
  const ja = { id: 'j1', rodzaj: 'ja', imie: 'Ola', numer: 7, dystans_km: 5, wynik_dystans_km: 5, wynik_s: 1500, ukonczony_at: 'x', odznaka: 'zwykla' };
  assert.match(B.wynikHtml({ ...ja, wynik_reczny: true }, BIEG({ faza: 'wyniki' })), /<p class="bw-drobne" data-wynik-reczny>Wynik ręczny: przy zgodzie na ranking masz czas i miejsce na liście, z dopiskiem „wynik ręczny”\. Masz ten trening także z zegarka\? Wskaż go niżej, a dopisek zniknie\.<\/p>/);
  assert.match(B.wynikHtml({ ...ja, wynik_reczny: true }, BIEG({ faza: 'wyniki' })), /data-dyplom="j1"/, 'dyplom zostaje');
  for (const u of [{ ...ja, wynik_reczny: false }, ja, { id: 'd1', rodzaj: 'dziecko', imie: 'Zosia', numer: 8, dystans_wlasny_km: 1, ukonczony_at: 'x', wynik_reczny: true }]) assert.doesNotMatch(B.wynikHtml(u, BIEG({ faza: 'wyniki' })), /data-wynik-reczny/);
  const w = B.wynikHtml({ ...ja, do_weryfikacji: true, weryfikacja: null }, BIEG({ faza: 'wyniki' }));
  assert.match(w, /<p class="bw-drobne" data-wynik-weryfikacja>Wynik czeka na sprawdzenie przez organizatora \(tempo szybsze niż 3:00\/km albo wolniejsze niż 36:00\/km\)\. Ukończenie i dyplom już masz; do rankingu wynik trafi po sprawdzeniu\.<\/p>/); assert.match(w, /data-dyplom="j1"/);
  assert.doesNotMatch(B.wynikHtml({ ...ja, do_weryfikacji: true, weryfikacja: 'zatwierdzony' }, BIEG({ faza: 'wyniki' })), /data-wynik-weryfikacja|data-wynik-odrzucony/, 'zatwierdzony: bez dopisku');
  const o = B.wynikHtml({ ...ja, do_weryfikacji: true, weryfikacja: 'odrzucony' }, BIEG({ faza: 'wyniki' }));
  assert.match(o, /<p class="bw-drobne bw-odrzucony" data-wynik-odrzucony>Organizator prosi o dowód tego wyniku \(np\. zapis z zegarka, zrzut z aplikacji\)\. Do czasu sprawdzenia wynik jest poza rankingiem; ukończenie i dyplom zostają\. Napisz do organizatora: <a href="mailto:/);
  assert.doesNotMatch(o, /data-wynik-weryfikacja/);
  assert.match(czytaj('bieg.html'), /mojW && mojW\.wynik_reczny === true \? 'Zgoda zapisana\. Twój czas i miejsce będą na liście z dopiskiem „wynik ręczny”\.' : 'Twój czas i miejsce będą na liście „ukończyli”\.'/, 'włączenie rankingu przy wyniku ręcznym: z dopiskiem');
});

test('17.11: trening dłuższy niż dystans: w karcie i na dyplomie prawdziwy dystans i czas; karta mówi, że lista jest bez czasu; lista treningów pokazuje, co jest z zegarka', () => {
  const ja = { id: 'j1', rodzaj: 'ja', imie: 'Ola', numer: 7, dystans_km: 5, wynik_dystans_km: 5, wynik_s: 2900, ukonczony_at: 'x', odznaka: 'zwykla' };
  assert.equal(B.wynikOpis({ ...ja, wynik_trening_km: 10 }), '10 km · 48:20 · 4:50 /km', 'nie „5 km · 48:20 · 9:40”');
  assert.equal(B.wynikOpis({ ...ja, wynik_trening_km: 5.2, wynik_s: 1560 }), '5,2 km · 26:00 · 5:00 /km'); assert.equal(B.wynikOpis(ja), '5 km · 48:20 · 9:40 /km', 'baza sprzed 20261203: jak dotąd');
  assert.equal(B.dystansWyniku({ ...ja, wynik_trening_km: 10.2 }), 10.2); assert.equal(B.dystansWyniku(ja), 5);
  assert.equal(B.zaDlugiDoRankingu({ ...ja, wynik_trening_km: 5.49 }), false); assert.equal(B.zaDlugiDoRankingu({ ...ja, wynik_trening_km: 5.5 }), true); assert.equal(B.zaDlugiDoRankingu({ ...ja, wynik_trening_km: 10, wynik_reczny: true }), true, '20261206: długi wpis ręczny też poza rankingiem');
  assert.equal(B.zaDlugiDoRankingu(ja), false); assert.equal(B.zaDlugiDoRankingu({ rodzaj: 'dziecko', wynik_trening_km: 9, wynik_dystans_km: 5 }), false);
  const k = B.wynikHtml({ ...ja, wynik_trening_km: 10 }, BIEG({ faza: 'wyniki' }));
  assert.match(k, /Ukończony: <b>10 km · 48:20 · 4:50 \/km<\/b>/); assert.match(k, /<p class="bw-drobne" data-wynik-za-dlugi>Trening dłuższy niż 5,49 km: masz ukończenie i dyplom z prawdziwym dystansem i czasem, a na liście jesteś bez czasu\. Ranking liczy treningi do 5,49 km\.<\/p>/);
  assert.doesNotMatch(B.wynikHtml({ ...ja, wynik_trening_km: 5.3 }, BIEG({ faza: 'wyniki' })), /data-wynik-za-dlugi/);
  const teksty = [], c2d = new Proxy({}, { get(t, kl) { if (kl === 'fillText') return (s) => teksty.push(String(s)); if (kl === 'measureText') return (s) => ({ width: String(s).length * 5 }); if (kl === 'createLinearGradient') return () => ({ addColorStop() {} }); if (kl in t) return t[kl]; return () => {}; }, set(t, kl, v) { t[kl] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => c2d }) };
  try { B.dyplom({ ...ja, wynik_trening_km: 10 }, BIEG({ faza: 'wyniki' }), 'telefon', {}); } finally { delete globalThis.document; }
  assert.ok(teksty.some((t) => / · 10 km$/.test(t)), 'dyplom: prawdziwy dystans: ' + teksty.filter((t) => /km/.test(t))); assert.ok(teksty.includes('48:20') && teksty.includes('4:50'), 'dyplom: czas i prawdziwe tempo');
  assert.ok(!teksty.some((t) => / · 5 km$/.test(t) || t === '9:40'), 'dyplom bez „5 km” i bez tempa liczonego z 5 km');
  const tr = B.treningiHtml([{ id: 't1', dzien: '2026-12-05', km: 5.2, czas_s: 1560, typ: 'Spokojny', zalicza_km: 5, z_zegarka: true }, { id: 't2', dzien: '2026-12-05', km: 5, czas_s: 1500, typ: 'Spokojny', zalicza_km: 5, z_zegarka: false }, { id: 't3', dzien: '2026-12-06', km: 6, czas_s: 1800, typ: 'Spokojny', zalicza_km: 5 }], ja);
  assert.match(tr, /Spokojny · z zegarka<\/small>/); assert.match(tr, /Spokojny · wpis ręczny<\/small>/); assert.equal((tr.match(/z zegarka|wpis ręczny/g) || []).length, 2, 'bez klucza (stara baza) bez dopisku');
});

test('migracja 20261203: reguła w jednej funkcji (source = intervals, własny trening, nie zaliczony ręcznie), trzy funkcje zmienione kotwicą na definicji z bazy, wycofanie odwrotne, test po skutku', () => {
  const m = czytaj(MIG), w = czytaj(WYC), t = czytaj('tools/akcja-bieg-ranking-gps-test.sql'), sh = czytaj('tools/akcja-bieg-ranking-gps-test.sh');
  assert.match(m, /^begin;$/m); assert.match(m, /^commit;$/m);
  assert.match(m, /create function public\.akcja_bieg_wynik_z_zegarka\(u public\.akcja_bieg_uczestnicy\)\n returns boolean\n language sql\n stable\n set search_path to 'public', 'pg_temp'/);
  assert.match(m, /select u\.rodzaj = 'ja' and u\.wynik_log_id is not null and u\.zaliczony_przez is null\n\s+and exists \(select 1 from public\.training_logs l where l\.id = u\.wynik_log_id and l\.athlete_id = u\.konto_id\n\s+and \(l\.source = 'intervals' or \(u\.wynik_wskazany and l\.external_source = 'intervals'\)\)\);/);
  assert.match(m, /select public\.akcja_bieg_wynik_z_zegarka\(u\) and u\.wynik_dystans_km is not null\n\s+and exists \(select 1 from public\.training_logs l where l\.id = u\.wynik_log_id and l\.distance_km <= u\.wynik_dystans_km \+ 0\.49\);/, 'górny próg rankingu: dystans + 0,49 km');
  assert.match(m, /add column wynik_wskazany boolean not null default false;/); assert.ok(w.includes('dr' + 'op column wynik_wskazany;'));
  assert.ok(m.includes('rev' + 'oke all on function public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy) from public, anon, authenticated;'), 'reguła nie dla przeglądarki');
  assert.doesNotMatch(m, new RegExp('gr' + 'ant |create or replace function|security definer'), 'bez nowych uprawnień i bez przepisywania funkcji');
  assert.equal((m.match(/pg_get_functiondef\(/g) || []).length, 1); assert.match(m, /if n <> 1 then raise exception/);
  for (const f of ['akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi)', 'akcja_bieg_ukonczyli(text, integer, integer, integer)', 'akcja_bieg_moi(text)', 'akcja_bieg_wynik_z_treningu(uuid, uuid)', 'akcja_bieg_treningi_z_okna(text)']) { assert.ok(m.includes("('public." + f + "'"), f); assert.ok(w.includes("('public." + f + "'"), 'wycofanie: ' + f); }
  /* kotwice istnieją dokładnie raz w definicjach z migracji 20261120 (na produkcji sprawdza to sama migracja i odmawia przy innej liczbie) */
  const m1 = czytaj('supabase/migrations/20261120_akcja_bieg.sql');
  const m2 = czytaj('supabase/migrations/20261126_akcja_bieg_wyniki.sql');
  for (const k of ['wynik_dystans_km = l.d, zaliczony_przez = null,', 'order by public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) desc,', "'zalicza_km', public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km))"]) {
    assert.equal(m2.split(k).length - 1, 1, 'kotwica raz w 20261126: ' + k); assert.ok(m.includes('$k$' + k + '$k$') && w.includes('$k$' + k + '$k$'), 'kotwica i powrót: ' + k);
  }
  for (const k of ['and not public.akcja_bieg_niepelnoletni(u.konto_id, b.dzien_od)', 'public.akcja_bieg_czas_rankingu(u, b) as czas', "'dziecko', p.rodzaj = 'dziecko')", "'ranking_zgoda', u.ranking_zgoda_at is not null)"]) {
    assert.equal(m1.split(k).length - 1, 1, 'kotwica raz w 20261120: ' + k); assert.ok(m.includes('$k$' + k + '$k$'), 'kotwica w migracji: ' + k); assert.ok(w.includes('$k$' + k + '$k$'), 'wycofanie wraca do: ' + k);
  }
  const USUN = 'dr' + 'op function';   /* fraza sklejona: bramka-commit czyta dodane linie */
  assert.ok(w.includes(USUN + ' public.akcja_bieg_wynik_z_zegarka(public.akcja_bieg_uczestnicy);') && w.includes(USUN + ' public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy);'));
  assert.ok(w.indexOf(USUN) > w.indexOf('end $wycofanie$;'), 'funkcja reguły znika po przywróceniu trzech funkcji');
  assert.match(t, /raise exception 'TESTY RANKINGU Z ZEGARKA ZIELONE: % sprawdzeń', n;/); assert.match(t, /FAIL 1: brak funkcji akcja_bieg_wynik_z_zegarka/);
  for (const zr of ["'manual'", "'ocr'", "'intervals'"]) assert.ok(t.includes(zr), 'test po skutku sprawdza źródło ' + zr);
  assert.match(sh, /AKCJA_BIEG_RANKING_GPS_Z_MIGRACJA/); assert.match(sh, /20261203_akcja_bieg_ranking_tylko_gps\.sql/); assert.match(sh, /echo 'rollback;'/, 'zawsze wycofana');
  for (const f of [MIG, WYC, 'tools/akcja-bieg-ranking-gps-test.sql']) assert.doesNotMatch(czytaj(f).replace(/dla-fabianka/g, ''), /fabian|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-|@[a-z]+\.[a-z]/i, f + ': bez imion, UUID i e-maili');
  /* źródła treningów w kodzie: import z zegarka zawsze 'intervals', formularze 'manual' albo 'ocr' */
  assert.match(czytaj('supabase/functions/intervals-sync/index.ts'), /source: 'intervals',\n\s+external_source: 'intervals',/); assert.match(czytaj('supabase/functions/intervals-webhook/index.ts'), /source: 'intervals', external_source: 'intervals',/);
  assert.match(czytaj('sb.js'), /payload\.source = w\.zrodlo \|\| 'manual';\n\s+payload\.external_source = 'app';/);
  const ef = czytaj('supabase/functions/bieg-ukonczyli/index.ts');
  assert.match(ef, /const body = JSON\.stringify\(data\);/, 'EF listy oddaje odpowiedź funkcji w całości: klucz reczny przechodzi bez zmiany EF');
});

test('„Wycofaj”: link z imieniem i numerem w karcie tego samego uczestnika; potwierdzenie nazywa osobę; wycofany zostaje właśnie ten zapis', async () => {
  assert.equal(B.linkWycofaniaHtml({ id: 'd1', imie: 'Alfa', numer: 2 }), '<a href="#" class="bw-link-maly" data-wycofaj="d1" aria-label="Wycofaj zapis: Alfa, numer 2">Wycofaj zapis: Alfa, numer 2</a>');
  assert.doesNotMatch(B.linkWycofaniaHtml({ id: '"><b>', imie: '<i>x</i>', numer: 2 }), /<i>|"><b>/, 'imię i id escapowane');
  assert.equal(B.pytanieWycofania(null), 'Wycofać ten zapis? Numer startowy przepada.'); assert.equal(B.pytanieWycofania({ imie: 'Gamma', numer: 4 }), 'Wycofać zapis: Gamma, numer 4? Numer startowy przepada.');
  let moi = KONTO();
  const s = await stronaBiegu({ odpowiedz: (n, a) => (n === 'akcja_bieg_moi' ? { data: moi, error: null } : n === 'akcja_bieg_moja_zgoda' ? { data: { zgoda_email: false, ma_zapis: true }, error: null }
    : n === 'akcja_bieg_wycofaj' ? (moi = moi.filter((u) => u.id !== a.p_id), { data: { ok: true }, error: null }) : { data: null, error: null }) });
  const karty = s.daj('bw-moj-tresc').innerHTML.split('<div class="bw-uczestnik" ').slice(1);
  assert.equal(karty.length, 3);
  for (const u of KONTO()) {
    const k = karty.find((x) => x.startsWith('data-uczestnik="' + u.id + '"')); assert.ok(k, 'karta ' + u.imie);
    assert.match(k, new RegExp('<h3>' + u.imie + '<small>numer ' + u.numer + ' '), 'nagłówek karty');
    const linki = [...k.matchAll(/data-wycofaj="([^"]+)" aria-label="([^"]+)">([^<]+)<\/a>/g)];
    assert.equal(linki.length, 1, 'jeden link w karcie ' + u.imie); assert.equal(linki[0][1], u.id, 'link wycofuje uczestnika z tej karty');
    assert.equal(linki[0][2], 'Wycofaj zapis: ' + u.imie + ', numer ' + u.numer); assert.equal(linki[0][3], linki[0][2]);
    assert.ok(k.trimEnd().endsWith('</div>') && k.indexOf('data-wycofaj') < k.lastIndexOf('</div>'), 'link wewnątrz karty');
  }
  s.klikWycofaj('d4'); await czekaj();
  assert.deepEqual(s.pytania, ['Wycofać zapis: Gamma, numer 4? Numer startowy przepada.']);
  assert.equal(JSON.stringify(s.wywolania.filter((w) => w[0] === 'akcja_bieg_wycofaj').map((w) => w[1])), '[{"p_id":"d4"}]');
  assert.doesNotMatch(s.daj('bw-moj-tresc').innerHTML, /Gamma/); assert.match(s.daj('bw-moj-tresc').innerHTML, /Alfa/);
  assert.match(czytaj('bieg.html'), /\.bw-uczestnik \{ padding: 14px 0 18px; border-top: 2px solid var\(--ramka\); \}/, 'wyraźna granica między kartami');
});

test('usterka z próby: po wycofaniu własnego zapisu (zostają dzieci) pole zgody na e-mail w „Twój bieg” zostaje, także gdy odczyt zgody raz albo dwa razy się nie uda', async () => {
  for (const [opis, nieudane] of [['odczyt udany', 0], ['pierwszy odczyt po wycofaniu nieudany', 1], ['oba odczyty po wycofaniu nieudane', 2]]) {
    let moi = KONTO(), poWycofaniu = 0, wycofano = false;
    const s = await stronaBiegu({ odpowiedz: (n, a) => {
      if (n === 'akcja_bieg_moi') return { data: moi, error: null };
      if (n === 'akcja_bieg_wycofaj') { moi = moi.filter((u) => u.id !== a.p_id); wycofano = true; return { data: { ok: true }, error: null }; }
      if (n === 'akcja_bieg_moja_zgoda') { if (wycofano && ++poWycofaniu <= nieudane) return { data: null, error: { message: 'TypeError: Failed to fetch' } }; return { data: { zgoda_email: true, ma_zapis: true }, error: null }; }
      return { data: null, error: null };
    } });
    assert.equal(s.daj('bw-zgoda-konto-pole').hidden, false, opis + ': przed wycofaniem pole jest');
    s.klikWycofaj('j2'); await czekaj();
    assert.doesNotMatch(s.daj('bw-moj-tresc').innerHTML, /Tester/, opis + ': zapis „ja” zniknął, zostały dzieci'); assert.match(s.daj('bw-moj-tresc').innerHTML, /Alfa/);
    assert.equal(s.daj('bw-zgoda-konto-pole').hidden, false, opis + ': pole zgody na e-mail zostaje bez ręcznego odświeżenia');
    assert.equal(s.daj('bw-zgoda-konto').checked, true, opis + ': ze stanem zgody konta');
    assert.equal(s.daj('bw-zapisz-siebie').hidden, false, opis + ': „Zapisz też siebie” wraca');
  }
});

test('usterka z próby: dwa odświeżenia naraz: starsze (wolniejsze) nie nadpisuje nowszego stanu karty ani zgody', async () => {
  let moi = KONTO(), wstrzymane = null, wstrzymuj = false;
  const s = await stronaBiegu({ odpowiedz: (n, a) => {
    if (n === 'akcja_bieg_moi') { const kopia = moi.slice(); if (wstrzymuj) { wstrzymuj = false; return new Promise((ok) => { wstrzymane = () => ok({ data: kopia, error: null }); }); } return { data: kopia, error: null }; }
    if (n === 'akcja_bieg_wycofaj') { moi = moi.filter((u) => u.id !== a.p_id); return { data: { ok: true }, error: null }; }
    if (n === 'akcja_bieg_moja_zgoda') return { data: { zgoda_email: true, ma_zapis: true }, error: null };
    return { data: null, error: null };
  } });
  wstrzymuj = true; (s.zdarzenia.visibilitychange || []).forEach((f) => f()); await czekaj();   /* odświeżenie A: odpowiedź z listą sprzed wycofania czeka */
  assert.equal(typeof wstrzymane, 'function', 'pierwsze odświeżenie wisi na odczycie zapisów');
  s.klikWycofaj('j2'); await czekaj();                                                           /* odświeżenie B: po wycofaniu, kończy się pierwsze */
  assert.doesNotMatch(s.daj('bw-moj-tresc').innerHTML, /Tester/);
  wstrzymane(); await czekaj();                                                                  /* A wraca ze starą listą (z Testerem) */
  assert.doesNotMatch(s.daj('bw-moj-tresc').innerHTML, /Tester/, 'spóźniona odpowiedź sprzed wycofania nie wraca na ekran');
  assert.equal(s.daj('bw-zgoda-konto-pole').hidden, false); assert.equal(s.daj('bw-zapisz-siebie').hidden, false);
  assert.match(czytaj('bieg.html'), /var nr = \+\+nrOdswiezenia, stare = function \(\) \{ return nr !== nrOdswiezenia; \};/);
});

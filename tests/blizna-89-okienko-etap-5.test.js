/* BLIZNA 89 (1.11.2026, ławka etap 5) — resztki z ławki pytań.

   (a) lista biegów z miastem albo dystansem, bez miesiąca → 365 dni („półmaraton w krakowie" ma znaleźć kwiecień); bez
       miasta i dystansu zostaje 90;
   (b) „ile kosztuje wpisowe / zapisy na X / cena X" → tryb impreza: karta z kalendarza + „Strona imprezy ›" (tylko https,
       w UI przez safeExternalHref), sieć TYLKO gdy karty brak; „zapisz trening" to NIE pytanie o cenę;
   (c) ból / kontuzja → jedno stałe zdanie bez modelu i bez porad + „Napisz do trenera" tylko, gdy jest trener;
   (d) modale celu w profil.html i kalendarz.html: podpowiedź z kalendarza (IMPREZY.podepnijPodpowiedz, data-*), wybór
       wiąże cel kluczem — i NIC nie zgłasza (zgłasza tylko sam zawodnik w zawodnik.html, blizna-87). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { zaladujSb, tekstDlaOkna } = require('./_srodowisko.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const DZIS = '2026-11-01', TERAZ = new Date('2026-11-01T10:00:00Z');
const UUID = '50bed7d3-1736-43d8-bcac-3c85b3939547';

test('(a) zakres: miasto albo dystans bez miesiąca → 365 dni; bez nich 90; miesiąc wygrywa', async () => {
  const B = await zaladuj('supabase/functions/okienko/biegi.mjs');
  const N = await zaladuj('supabase/functions/okienko/narzedzia.mjs');
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  assert.deepEqual(B.domyslnyZakres(DZIS), { od: DZIS, do: '2027-01-30' });
  assert.deepEqual(B.domyslnyZakres(DZIS, { miejsce: 'krakowie' }), { od: DZIS, do: '2027-11-01' });
  assert.deepEqual(B.domyslnyZakres(DZIS, { dystans: '21' }), { od: DZIS, do: '2027-11-01' });
  const wolania = [];
  const fetchFn = async (url, init) => { wolania.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => [{ group_key: 'g3', name: 'Półmaraton Krakowski', event_date: '2027-04-18', city: 'Kraków', distances: [21.0975] }] }; };
  (await zaladuj('supabase/functions/okienko/f6.mjs'))._wyczyscPamiecF6();
  const traf = R.dopasuj('polmaraton w krakowie', DZIS);
  const w = await N.wykonaj(atrapa({}), JA, traf.narzedzie, N.waliduj(traf.narzedzie, traf.args).args, TERAZ, { fetchFn, token: 'T' });
  assert.equal(wolania[0].p_to, '2027-11-01');
  assert.equal(w.liczba, 1, 'kwietniowy półmaraton w liście');
  const { zWyniku } = await zaladuj('supabase/functions/okienko/odpowiedz.mjs');
  assert.deepEqual(zWyniku('biegi_nadchodzace', w, {}).zdania, ['W najbliższym roku w Krakowie na półmaratonie maszyna wyników zna 1 bieg.'], 'nie „od 1.11 do 1.11"');
  assert.deepEqual(R.dopasuj('jakie biegi w grudniu w poznaniu', DZIS).args.do, '2026-12-31', 'miesiąc ma pierwszeństwo');
});

test('(b) cena / wpisowe / zapisy → impreza z „cena"; „zapisz trening" nie', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  for (const [q, nazwa] of [['ile kosztuje wpisowe na maraton w debnie', 'maraton debnie'], ['zapisy na bieg niepodleglosci', 'niepodleglosci'],
    ['jak sie zapisac na maraton warszawski', 'maraton warszawski'], ['cena biegu niepodleglosci', 'niepodleglosci']]) {
    const r = I.imprezaZPytania(q);
    assert.ok(r && r.cena === true && r.q === nazwa, q + ' → ' + JSON.stringify(r));
  }
  for (const q of ['zapisz trening', 'moje wyniki w debnie']) assert.ok(!(I.imprezaZPytania(q) || {}).cena, q);
  assert.equal(I.imprezaZPytania('ile kosztuje para butow').jawne, false, 'bez słowa biegu: impreza tylko po trafieniu w kalendarz, inaczej dalej (model/sieć)');
  assert.equal(I.imprezaZPytania('zapisz trening'), null);
});

test('(b) karta z linkiem → zdanie „strona imprezy", BEZ sieci; bez linku → zdanie o organizatorze, bez sieci; bez karty → sieć', async () => {
  const I = await zaladuj('supabase/functions/okienko/impreza.mjs');
  const F = await zaladuj('supabase/functions/okienko/f6.mjs');
  const deps = (wiersze, siecLicznik) => ({ sb: atrapa({ races: [] }), fetchFn: async () => ({ ok: true, status: 200, json: async () => wiersze }), token: 'T', dzis: DZIS,
    sieciDozwolona: async () => true, siec: async () => { siecLicznik.n++; return { zdania: ['z sieci'], zrodla: [{ tytul: 'x', url: 'https://x.pl' }], tok: { we: 1, wy: 1 }, zapytania: 1 }; },
    zPamieci: async () => null, doPamieci: async () => {}, znaleziska: async () => {} });
  const L = { n: 0 };
  F._wyczyscPamiecF6();
  const z = await I.odpowiedzImpreza({ ...deps([{ nazwa: 'Bieg Niepodległości', data: '2026-11-11', miejscowosc: 'Poznań', url_zapisy: 'https://dostartu.pl/bn', klucz: 'kalendarz:' + UUID }], L), q: 'niepodleglosci', jawne: true, cena: true });
  assert.deepEqual(z.zdania, [I.ODP_CENA_LINK]); assert.equal(z.karty[0].dane.url, 'https://dostartu.pl/bn'); assert.equal(L.n, 0, 'karta jest → bez sieci');
  F._wyczyscPamiecF6();
  const b = await I.odpowiedzImpreza({ ...deps([{ nazwa: '52. Maraton Dębno', data: '2026-10-18', miejscowosc: 'Dębno', przeszla: true }], L), q: 'maraton debnie', jawne: true, cena: true });
  assert.deepEqual(b.zdania, [I.ODP_CENA_BEZ_LINKU]); assert.equal(L.n, 0);
  F._wyczyscPamiecF6();
  const s = await I.odpowiedzImpreza({ ...deps([], L), q: 'bieg nieznany', jawne: true, cena: true });
  assert.equal(L.n, 1, 'bez karty → sieć'); assert.deepEqual(s.zdania, ['z sieci']);
  F._wyczyscPamiecF6();
  const K = await zaladuj('supabase/functions/okienko/kalendarz.mjs');
  assert.equal(K.mapuj({ nazwa: 'X', data: '2027-01-01', url_organizer: 'javascript:alert(1)' }).url, null);
  assert.equal(K.mapuj({ nazwa: 'X', data: '2027-01-01', url_organizer: 'http://x.pl' }).url, null, 'tylko https');
  assert.match(czytaj('supabase/functions/okienko/index.ts'), /cena: !!\(imp as \{ cena\?: boolean \}\)\.cena/);
});

test('(b) UI: „Strona imprezy ›" przez safeExternalHref {tylkoHttps}, nowa karta, noopener; bez url — brak linku', () => {
  const okno = { escapeHtml: (s) => String(s), BM_TEKST: tekstDlaOkna(), safeExternalHref: (u, o) => (o && o.tylkoHttps && /^https:\/\//.test(u) ? u : '') };
  const ctx = vm.createContext({ window: okno, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: {}, setTimeout, console });
  vm.runInContext(czytaj('js/okienko.js'), ctx);
  const html = okno.OKIENKO.htmlOdpowiedzi(200, { tryb: 'impreza', zdania: ['x'], karty: [{ typ: 'impreza', dane: { nazwa: 'Bieg', data: '2026-11-11', url: 'https://dostartu.pl/bn' } },
    { typ: 'impreza', dane: { nazwa: 'Dębno', data: '2026-10-18', url: null } }] });
  assert.equal((html.match(/Strona imprezy ›/g) || []).length, 1);
  assert.match(html, /<a class="okn-link" href="https:\/\/dostartu\.pl\/bn" target="_blank" rel="noopener noreferrer">Strona imprezy ›<\/a>/);
  assert.ok(!/onclick/i.test(html));
});

test('(c) ból / kontuzja → stałe zdanie (0 tokenów), „Napisz do trenera" tylko z trenerem; odznaka „powrót po kontuzji" zostaje odznakami', async () => {
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  for (const q of ['czy dzis moge biegac po kontuzji', 'boli mnie kolano', 'naciagnalem lydke co robic', 'mam uraz kostki', 'czy biegac jak boli piszczel'])
    assert.deepEqual(R.dopasuj(q, DZIS), { zdanie: R.ODP_ZDROWIE, log: 'zdrowie', trener: true }, q);
  assert.equal(R.ODP_ZDROWIE, 'Przy bólu lub kontuzji decyzję podejmij z trenerem albo fizjoterapeutą.');
  assert.equal(R.dopasuj('odznaka powrot po kontuzji', DZIS).narzedzie, 'odznaki_moje');
  assert.deepEqual(R.dopasuj('czy biegac z katarem', DZIS), { zdanie: R.ODP_CHOROBA, log: 'zdrowie' }, 'od 3.11 (decyzja Filipa 2.11, ławka v2): katar/choroba = stały tekst bez sieci; do 3.11 szło do Google');
  assert.equal(R.dopasuj('wyniki Katarzyny Chojnackiej', DZIS), null, '„Katarzyny” to nie katar');
  const ef = czytaj('supabase/functions/okienko/index.ts');
  const i = ef.indexOf('if (traf && "zdanie" in traf)');
  const blok = ef.slice(i, ef.indexOf('\n  }\n', i));
  assert.ok(i > 0 && i < ef.indexOf('zapytajModel({'), 'przed modelem');
  assert.match(blok, /if \(a && a\.coach_id\) kartyZd = \[\{ typ: "plan_pusty", dane: \{ stan: "trener" \} \}\];/);
  assert.match(blok, /zdania: \[traf\.zdanie\], karty: kartyZd/);
});

test('(d) sb.js IMPREZY.podepnijPodpowiedz: data-*, delegowany klik → onPick, klucz spoza wzorca odrzucony, zero zgłoszeń', async () => {
  const ctx = zaladujSb();
  const ZLA = "x\"><img src=x onerror=alert(1)>";
  ctx.wynikiApiDostepne = () => true;
  ctx.wynikiApi = () => ({ rpc: async (n, a) => ({ data: [{ nazwa: ZLA, data: '2027-04-18', miejscowosc: 'Kraków', klucz: 'kalendarz:' + UUID, status: 'zgloszona' }, { nazwa: 'Zły', data: '2027-01-01', klucz: 'javascript:x' }], error: null }) });
  let zgloszenia = 0;
  ctx.zglosImpreze = async () => { zgloszenia++; return {}; };
  const sl = (el) => { el.h = {}; el.addEventListener = (ev, fn) => { el.h[ev] = fn; }; return el; };
  const pole = sl({ value: '' }), lista = sl({ innerHTML: '', style: {} });
  const picks = [];
  ctx.IMPREZY.podepnijPodpowiedz(pole, lista, (d) => picks.push(d));
  pole.value = 'polmaraton krak'; pole.h.input();
  await new Promise((r) => setTimeout(r, 320));
  assert.equal(lista.style.display, 'block');
  assert.equal((lista.innerHTML.match(/class="imp-podp"/g) || []).length, 1, 'klucz spoza wzorca odpada już w mapuj');
  assert.match(lista.innerHTML, /data-klucz="kalendarz:50bed7d3-1736-43d8-bcac-3c85b3939547" data-nazwa="x&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.ok(!/onclick|<img/i.test(lista.innerHTML));
  const wiersz = { getAttribute: (k) => ({ 'data-klucz': 'kalendarz:' + UUID, 'data-nazwa': 'Półmaraton', 'data-data': '2027-04-18', 'data-miejsce': 'Kraków' })[k] };
  lista.h.click({ target: { closest: () => wiersz } });
  assert.deepEqual(JSON.parse(JSON.stringify(picks)), [{ klucz: 'kalendarz:' + UUID, nazwa: 'Półmaraton', data: '2027-04-18', miejscowosc: 'Kraków' }]);
  lista.h.click({ target: { closest: () => ({ getAttribute: (k) => (k === 'data-klucz' ? 'javascript:x' : '2027-01-01') }) } });
  assert.equal(picks.length, 1);
  assert.equal(zgloszenia, 0);
});

test('(d) profil.html i kalendarz.html: skrypty, powiązanie impreza_klucz przy zgodnej nazwie, ŻADNEGO zgłaszania', () => {
  for (const [p, pole, lista] of [['profil.html', 'goal-name-inp', 'goal-imprezy-list'], ['kalendarz.html', 'goal-name', 'goal-imprezy-list']]) {
    const h = czytaj(p);
    assert.ok(/<script src="js\/tekst\.mjs"><\/script>/.test(h) && /<script src="js\/wyniki-api\.js"><\/script>/.test(h), p + ': skrypty');
    assert.ok(h.indexOf('src="sb.js"') < h.indexOf('src="js/wyniki-api.js"'), p + ': wyniki-api po sb.js');
    assert.match(h, new RegExp(`podepnijPodpowiedz\\(document\\.getElementById\\('${pole}'\\), document\\.getElementById\\('${lista}'\\)`), p);
    assert.match(h, new RegExp(`id="${lista}"`), p);
    assert.ok(!/zglosImpreze|impreza-zglos|event_propose/.test(h), p + ': zgłasza tylko zawodnik w zawodnik.html');
  }
  assert.match(czytaj('profil.html'), /\} else if \(_goalImpreza && _goalImpreza\.nazwa === name\) \{\n\s*newGoal\.impreza_klucz = _goalImpreza\.klucz;/);
  assert.match(czytaj('kalendarz.html'), /const powiaz = \(_goalImprezaK && _goalImprezaK\.nazwa === name\) \? \{ impreza_klucz: _goalImprezaK\.klucz \} : \{\};/);
});

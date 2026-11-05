/* BLIZNA 182 / KAFEL AKCJI NA DZIŚ I PRÓBA JAK SOBOTA (Filip 5.11).
   - gdy akcja trwa, duży kafel z cytatem ustępuje Ulicy z licznikiem i czterema przyciskami; zawodnik.html zamrożony, podmiana z js/akcja.mjs;
   - przed startem i po zamknięciu wraca zwykły kafel;
   - konto testowe po guziku widzi to, co zawodnik w sobotę: nazwa, imię i zbiórka dochodzą osobną funkcją, a nie z wiersza próby, który czyta każdy zalogowany;
   - licznik próby liczy treningi, prawdziwa akcja bez zmian;
   - odznaka akcji od razu po logu, także w kalendarzu, do którego Dziś przekierowuje po zapisie;
   - kategoria akcji w Odznakach od guzika, niezdobyte przygaszone. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const ZB = 'https://www.siepomaga.pl/atrapa', PLAKAT = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/plakat-akcji.webp?token=t';
const LICZNIK = { wystartowala: true, nazwa: 'Akcja', imie: 'Ala', start: '2026-11-07', koniec: null, cel_km: 12500, suma_km: 3050, pct: 24.4, filip_gr: 30500, filip_max_gr: 125000, stawka_filip_gr: 10, url_zbiorki: ZB, plakat_url: PLAKAT, wyprawa_trwa: true };
const PROBA = { ...LICZNIK, testowa: true };
let A, C, O;
test.before(async () => {
  globalThis.escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  globalThis.safeExternalHref = (u) => (/^https:\/\//.test(u) ? u : '');
  globalThis.safeUrlAttr = (u) => (/^https:\/\//.test(u) ? u : '');
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja-cytaty.mjs')).href);
  await import(pathToFileURL(path.join(KORZEN, 'js/odznaki-akcji.mjs')).href);
  A = globalThis.BM_AKCJA; C = globalThis.BM_AKCJA_CYTATY; O = globalThis.BM_ODZNAKI_AKCJI;
});

test('kafel: licznik, wkład, pasek, procent, zdanie o kwocie i 4 przyciski', () => {
  const l = A.liczbyKaflaHtml(LICZNIK, { km: 1 }), dane = A.daneKaflaHtml(LICZNIK).replace(/ /g, ' ');
  assert.match(l.replace(/ /g, ' '), /<b>3 050<\/b>z 12 500 km/);
  assert.match(l, /Twój wkład: <b>1 km<\/b>/);
  assert.match(A.liczbyKaflaHtml(LICZNIK, null), /Twój wkład: <b>0 km<\/b>/, 'bez wkładu zero, nie dziura');
  assert.match(dane, /role="progressbar"/);
  assert.match(dane, /24,4% celu|24% celu/);
  assert.match(dane, /BiegaMy, czyli Filip i Kasia, dokłada 10 gr za każdy kilometr biegu i spaceru · dotąd 305 zł z 1 250 zł/);
  assert.match(dane, /data-plakat="[^"]+plakat-akcji\.webp[^"]*" data-zbiorka="https:\/\/www\.siepomaga\.pl\/atrapa"/, 'plakat na pełny ekran z przyciskiem Zbiórka');
  assert.match(dane, />Gra</); assert.match(dane, />Mapa wyprawy</); assert.match(dane, />Zbiórka</);
  assert.match(dane, /data-gra-link href="gra-cegielki\.html" hidden/, 'prawdziwa akcja: Gra dopiero po potwierdzeniu przełącznika');
});

test('kafel: obce adresy odpadają, nazwa nie wchodzi do HTML surowa', () => {
  const zly = A.daneKaflaHtml({ ...LICZNIK, url_zbiorki: 'javascript:alert(1)', plakat_url: 'javascript:alert(2)', stawka_filip_gr: 10 });
  assert.doesNotMatch(zly, /javascript:/);
  assert.doesNotMatch(zly, /Plakat</, 'bez adresu plakatu nie ma przycisku');
  assert.doesNotMatch(zly, />Zbiórka</, 'bez adresu zbiórki nie ma przycisku');
  assert.doesNotMatch(A.daneKaflaHtml({ ...LICZNIK, wyprawa_trwa: false, wyprawa_dotarla_at: null }), /Mapa wyprawy/);
});

test('linki: konto testowe zostaje na próbie, prawdziwa akcja bez parametrów', () => {
  assert.equal(A.adresStrony(LICZNIK, '#ulica-po'), 'dla-fabianka.html#ulica-po');
  assert.equal(A.adresStrony(PROBA, '#ulica-po'), 'dla-fabianka.html?proba=1#ulica-po');
  assert.equal(A.linkGry(LICZNIK), 'gra-cegielki.html'); assert.equal(A.linkGry(PROBA), 'gra-cegielki.html?sciezka=1&podglad=1');
  assert.equal(A.linkTrasy(LICZNIK), 'mapa-wyprawy.html'); assert.equal(A.linkTrasy(PROBA), 'mapa-wyprawy.html?slug=proba');
  const dane = A.daneKaflaHtml(PROBA);
  assert.match(dane, /data-gra-link href="gra-cegielki\.html\?sciezka=1&podglad=1">Gra/, 'próba: Gra widoczna mimo wyłączonego przełącznika prawdziwej akcji');
  const karta = A.kartaDzisHtml({ ...PROBA, firmy_zgloszenia: true }, { km: 1 });
  assert.match(karta, /href="dla-fabianka\.html\?proba=1">Szczegóły/); assert.match(karta, /href="dla-fabianka\.html\?proba=1#firma"/);
  const realna = A.kartaDzisHtml({ ...LICZNIK, firmy_zgloszenia: true }, { km: 1 });
  assert.match(realna, /href="dla-fabianka\.html">Szczegóły/); assert.match(realna, /href="dla-fabianka\.html#firma"/);
  assert.doesNotMatch(realna, /proba=1|slug=proba|sciezka=1/, 'prawdziwa karta nie zna parametrów próby');
});

test('podmiana bez ruszania zamrożonego zawodnik.html, kafel tylko gdy akcja trwa', () => {
  const k = czytaj('js/akcja.mjs'), c = czytaj('js/akcja-cytaty.mjs'), z = czytaj('zawodnik.html');
  assert.doesNotMatch(z, /akcja-dzis|akcja-baner|naKaflu/, 'zawodnik.html nietknięty');
  assert.match(k, /if \(s === "trwa"\) wstawKafel\(d, wklad\); else zdejmijKafel\(\);/);
  assert.match(c, /g\.BM_AKCJA\.stanKarty\(d\) !== "trwa"\) g\.BM_AKCJA\.zdejmijKafel\(\)/, 'stan „brak” karta kończy wcześniej, więc zdjęcie idzie też ze stanu');
  assert.match(k, /b\.classList\.remove\("akcja-baner"\)/, 'cytat wraca');
  assert.match(k, /#daily-motivation\.akcja-baner>#motiv-content\{display:none!important\}|#daily-motivation\.akcja-baner>#motiv-content/, 'cytat tylko schowany');
  assert.match(k, /liczbyKaflaHtml\(d, wklad \|\| _ostatniWklad\)/, 'nieudane zapytanie nie zeruje wkładu na kaflu');
  assert.equal(A.kartaDzisHtml({ wystartowala: false }), '', 'przed startem nic');
  assert.equal(A.stanKarty({ wystartowala: true, koniec: null }), 'trwa');
});

test('scena na kaflu: cicha, bez gestów, bez nowego odpytywania, wjazd zostaje dla pełnej Ulicy', () => {
  const s = czytaj('js/ulica-scena.mjs'), u = czytaj('js/ulica.mjs');
  assert.match(s, /glosno = !o\.kafel && czytajDzwiek\(\)/);
  assert.match(s, /if \(o\.kafel\) \{ okno\.removeAttribute\("role"\); okno\.removeAttribute\("tabindex"\);[^\n]*okno\.style\.pointerEvents = "none"; \}/);
  assert.match(s, /if \(o\.kafel \|\| przed \|\| !elKoparka/);
  assert.match(s, /if \(!przed && !o\.kafel && g\.SB_URL && g\.fetch\)/, 'bez drugiego pytania o grę z każdego Dziś');
  assert.match(u, /S\.zamontuj\(tu, ost, \{ kafel: true \}\)/, 'kafel bez o.pokaz, czyli bez zegara licznika');
  assert.doesNotMatch(u.slice(u.indexOf('function naKaflu'), u.indexOf('function naStronie')), /pokaz/);
  assert.match(u, /if \(!ost\) return false;/, 'kafel zdjęty w trakcie ładowania nie zostawia działającej sceny');
});

test('scalanie próby: dane dochodzą z funkcji, pusta odpowiedź niczego nie psuje', () => {
  const d = { wystartowala: true, nazwa: 'Próba guzika', imie: null, url_zbiorki: null };
  C.scalProbe(d, { koparka_url: 'k', koparka_arkusz_url: 'a', film_akcji_url: 'f', plakat_url: 'p', nazwa: 'Prawdziwa', imie: 'Ala', url_zbiorki: ZB });
  assert.deepEqual(d, { wystartowala: true, nazwa: 'Prawdziwa', imie: 'Ala', url_zbiorki: ZB, koparka_url: 'k', koparka_arkusz_url: 'a', film_akcji_url: 'f', plakat_url: 'p' });
  const e = { nazwa: 'Próba guzika' }; C.scalProbe(e, null);
  assert.deepEqual(e, { nazwa: 'Próba guzika' }, 'odmowa funkcji: reszta próby działa');
  const u = czytaj('js/ulica.mjs'), c = czytaj('js/akcja-cytaty.mjs');
  assert.match(c, /scalProbe\(d, w\);/); assert.match(u, /g\.BM_AKCJA_CYTATY\.scalProbe\(lt\.data,/, 'ścieżka trenera przez to samo scalanie');
  assert.doesNotMatch(u, /lt\.data\.koparka_url =/, 'bez drugiej kopii scalania');
  assert.match(u, /proba: !!dp && _idProby === "trener"/, 'znak PRÓBA tylko w ścieżce trenera');
  assert.match(u, /pokaz: dp && k\.pokaz \? function \(\) \{ licznikProby\(\)/, 'zegar sceny na próbie nie wraca do zapowiedzi prawdziwej akcji');
});

test('funkcja próby: nazwa, imię i zbiórka tylko dla uprawnionych, a imienia i adresu nie ma w kodzie', async () => {
  const W = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/proba-wizerunek.mjs')).href);
  const TESTOWY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ZWYKLY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ATH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const sb = { from: (t) => { const f = {}; const b = { select: () => b, eq: (k, v) => { f[k] = v; return b; }, maybeSingle: async () => {
    if (t === 'coaches') return { data: null };
    if (t === 'athletes') return { data: f.user_id === TESTOWY ? { id: ATH } : { id: 'inny' } };
    if (t === 'akcje' && f.slug === 'proba') return { data: { konta_testowe: [ATH] } };
    if (t === 'akcje' && f.slug === 'dla-fabianka') return { data: { nazwa: 'Prawdziwa', imie_zbiorki: 'Ala', url_zbiorki: ZB } };
    return { data: null }; } }; return b; },
    storage: { from: () => ({ createSignedUrl: async (p) => ({ data: { signedUrl: 'https://x/' + p } }) }) }, rpc: async () => ({ data: { firmy: [] } }) };
  const ok = await W.odpowiedzWizerunku(sb, { id: TESTOWY });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.nazwa, 'Prawdziwa'); assert.equal(ok.body.imie, 'Ala'); assert.equal(ok.body.url_zbiorki, ZB);
  const nie = await W.odpowiedzWizerunku(sb, { id: ZWYKLY });
  assert.deepEqual(nie, { status: 403, body: { ok: false } }, 'zwykłe konto bez nazwy, imienia i zbiórki');
  assert.deepEqual(await W.odpowiedzWizerunku(sb, null), { status: 401, body: { ok: false } });
  const kod = czytaj('supabase/functions/_shared/proba-wizerunek.mjs');
  assert.doesNotMatch(kod, /siepomaga/i, 'adres zbiórki tylko w bazie');
});

test('push próby: ta sama treść co w sobotę, tylko do kont testowych, prawdziwa ścieżka bez zmian', () => {
  const p = czytaj('supabase/functions/akcja-push/index.ts');
  assert.match(p, /if \(a\.testowa\) \{ const \{ data: p \} = await sb\.from\("akcje"\)\.select\("nazwa"\)\.eq\("testowa", false\)/);
  assert.match(p, /`Ruszyło\. \$\{nazwa \|\| "Akcja"\}\. Każdy krok się liczy\.`/);
  assert.match(p, /if \(a\.testowa\) return \(a\.konta_testowe \|\| \[\]\)\.slice\(\);/);
});

test('licznik próby: migracja, wycofanie i test po skutku istnieją, bez starej formuły w nowej', () => {
  const m = czytaj('supabase/migrations/20261107_akcja_proba_licznik.sql'), w = czytaj('supabase/migrations/20261107_WYCOFANIE_akcja_proba_licznik.sql'), t = czytaj('tools/akcja-proba-licznik-test.sql');
  assert.match(m, /coalesce\(case when a\.testowa then a\.proba_sym_km end, 0\) \+ public\.akcja_km_okna\(a\.id, a\.start, v_dzis\);/);
  assert.match(m, /j_po is distinct from j_przed/, 'odpowiedź prawdziwej akcji pilnowana w migracji');
  assert.match(w, /coalesce\(case when a\.testowa then a\.proba_sym_km end, public\.akcja_km_okna\(a\.id, a\.start, v_dzis\)\);/);
  assert.doesNotMatch(m, /\bgrant\b/i, 'create or replace zachowuje uprawnienia');
  assert.match(t, /FAIL 3a: po logu 1 km/); assert.match(t, /TESTY LICZNIKA PROBY ZIELONE/);
  assert.match(czytaj('tools/akcja-proba-licznik-test.sh'), /TESTY LICZNIKA PROBY ZIELONE/);
  assert.match(czytaj('tools/akcja-sciezka-test.sql'), /round\(3125 \+ km, 2\)/, 'stary test wie, że suwak się dokłada');
});

test('stan przed startem: krótka pamięć, po naciśnięciu Dziś pokazuje akcję od razu', async () => {
  const rpc = []; let wynik = { wystartowala: false, start: '2026-11-07', cel_km: 12500 };
  const sb = { rpc: async (n) => { rpc.push(n); return { data: wynik }; } }, ss = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, v), removeItem: (k) => ss.delete(k) } });
  try {
    const t0 = 1800000000000, ATH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await C.odswiezStan(sb, ATH, { teraz: t0 });
    await C.odswiezStan(sb, ATH, { teraz: t0 + 3000 });
    assert.equal(rpc.length, 1, 'do 5 s z pamięci');
    wynik = { ...LICZNIK };
    const d = await C.odswiezStan(sb, ATH, { teraz: t0 + 6000 });
    assert.equal(rpc.length, 2, 'po 5 s przed startem pyta znowu');
    assert.equal(d.wystartowala, true);
    await C.odswiezStan(sb, ATH, { teraz: t0 + 30000 });
    assert.equal(rpc.length, 2, 'po starcie 60 s jak dotąd');
    await C.odswiezStan(sb, ATH, { teraz: t0 + 70000 });
    assert.equal(rpc.length, 3);
  } finally { delete globalThis.sessionStorage; }
});

function atrapaOdznak({ wklad, dni = [], ma = [], licznik = { ...LICZNIK, start: '2026-11-05', testowa: true } }) {
  const s = { ach: [], notif: [], rpc: [], wyniki: { insertBlad: null } };
  s.sb = {
    rpc: async (n) => {
      s.rpc.push(n);
      if (n === 'akcja_licznik') return { data: licznik };
      if (n === 'akcja_moj_wklad') return { data: wklad };
      if (n === 'akcja_moje_dni') return { data: dni };
      return { data: null };
    },
    functions: { invoke: async () => ({ data: null }) },
    from: (t) => ({
      select: () => { const b = { eq: () => b, in: async () => ({ data: ma.map((x) => ({ badge_id: x })) }) }; return b; },
      insert: async (w) => { if (t === 'achievements') { if (s.wyniki.insertBlad) return { error: s.wyniki.insertBlad }; s.ach.push(w); } else s.notif.push(w); return { error: null }; },
    }),
  };
  return s;
}
const ATH_T = '9c2df65c-6a46-410e-ad5f-474e5d973ec9', W_OKNIE = new Date('2026-11-05T12:00:00+01:00');

test('odznaka po logu: pierwszy kilometr od razu, z wierszem w dzwonku, raz', async () => {
  const s = atrapaOdznak({ wklad: { km: 1 } });
  assert.deepEqual(await O.przyznajPoLogu(s.sb, ATH_T, W_OKNIE), ['akcja-1km']);
  assert.deepEqual(s.ach, [{ athlete_id: ATH_T, badge_id: 'akcja-1km' }]);
  assert.equal(s.notif.length, 1); assert.match(s.notif[0].message, /Pierwszy kilometr/); assert.equal(s.notif[0].type, 'badge');
  const druga = atrapaOdznak({ wklad: { km: 1 }, ma: ['akcja-1km'] });
  assert.deepEqual(await O.przyznajPoLogu(druga.sb, ATH_T, W_OKNIE), [], 'już jest: bez drugiego wpisu i bez dzwonka');
  assert.equal(druga.notif.length, 0);
});

test('odznaka po logu: poza oknem, za mało km i odmowa bazy nic nie psują', async () => {
  const mala = atrapaOdznak({ wklad: { km: 0.5 } });
  assert.deepEqual(await O.przyznajPoLogu(mala.sb, ATH_T, W_OKNIE), []);
  const przed = atrapaOdznak({ wklad: { km: 5 }, licznik: { wystartowala: false } });
  assert.deepEqual(await O.przyznajPoLogu(przed.sb, ATH_T, W_OKNIE), []); assert.equal(przed.ach.length, 0);
  assert.deepEqual(przed.rpc, ['akcja_licznik'], 'poza oknem kalendarz nie woła wkładu ani dni');
  const odmowa = atrapaOdznak({ wklad: { km: 5 } }); odmowa.wyniki.insertBlad = { code: '42501' };
  assert.deepEqual(await O.przyznajPoLogu(odmowa.sb, ATH_T, W_OKNIE), [], 'okno w bazie odmówiło: bez pop-upu i bez dzwonka');
  assert.equal(odmowa.notif.length, 0);
  assert.deepEqual(await O.przyznajPoLogu(null, ATH_T), []); assert.deepEqual(await O.przyznajPoLogu(atrapaOdznak({ wklad: {} }).sb, null), []);
  const k = czytaj('kalendarz.html');
  assert.match(k, /<script src="js\/akcja-cytaty\.mjs"><\/script>\n<script src="js\/odznaki-akcji\.mjs"><\/script>/);
  assert.equal((k.match(/window\._odznakiAkcjiPoLogu\(\);/g) || []).length, 3, 'wejście po zapisie na Dziś i oba zapisy w kalendarzu');
  assert.match(k, /eq\('user_id', session\.user\.id\)\.maybeSingle\(\);\n    if \(ja\) await window\.BM_ODZNAKI_AKCJI\.przyznajPoLogu\(sb, ja\.id\);/, 'zawsze własne konto, także gdy trener ogląda cudzy kalendarz');
});

test('Odznaki: kategoria akcji od guzika, zdobyte w kolorze, niezdobyte przygaszone, bez dublowania na dole', () => {
  const o = czytaj('odznaki.html');
  assert.match(o, /if \(_OA\(\) && _OA\(\)\.katalogWidoczny\(window\._akcjaStan\)\) \{\n    const lista = _OA\(\)\.LISTA/);
  assert.match(o, /data-zdobyta="\$\{zdobyta \? 1 : 0\}"/);
  assert.match(o, /\$\{zdobyta \? '' : 'opacity:0\.45;'\}/);
  assert.match(o, /window\.escapeHtml\(tytulAkcji\)/, 'nazwa z bazy przez escape');
  assert.match(o, /b\.cat !== 'Akcja'\);\n/, 'lista „Do zdobycia” bez odznak akcji');
  assert.equal(O.LISTA.length, 6);
  assert.deepEqual(O.LISTA.map((b) => b.id), ['akcja-1km', 'akcja-100', 'akcja-200', 'akcja-500', 'akcja-co-tydzien', 'akcja-sponsor']);
});

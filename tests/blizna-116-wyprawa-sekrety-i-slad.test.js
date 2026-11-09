/* BLIZNA 116 (4.11.2026, WYPRAWA — komenda Filipa 4.11, punkty A–D) — SEKRETY AKCJI + ŚLAD GPS + PRYWATNOŚĆ.
   A) SEKRETY: nazwa celu wyprawy (jasn* gór* / częstochow* / jasnogórsk*) i NAZWISKO dziecka NIE występują w niczym, co trafia do użytkownika:
      html, teksty js (sb.js, js/*), zdania/karty/cytaty/zagadki EF obu okienek, pushe (EF), mapa — poza wzorcami WEJŚCIA (regexy
      rozpoznające pytania w routerze) i komentarzami. Nazwa celu żyje w bazie (akcje.wyprawa_cel_nazwa), licznik oddaje ją dopiero
      po dotarciu; teksty z jednej funkcji (tekstWyprawy); guzik „Dotarliśmy” bez nazwy celu. Jeden test łączy strażnika nazwiska
      dziecka (blizna-101) i sekret celu.
   B/C) ŚLAD: slad.mjs — ≤ 1 pkt/50 m; strefy: 2 000 m od startu NA ZAWSZE, 2 000 m przed/po przerwie > 3 h (nocleg) na zawsze,
      500 m końcówek dopóki trwa (po dotarciu widoczne), brak punktu „teraz”; test na danych z przerwą nocną i ze startem.
      EF: tabela bez dostępu z przeglądarki, odczyt tylko po starcie, surowe punkty nigdy nie wychodzą, odświeżanie tylko z sekretem.
   D) MAPA: mapa-wyprawy.html — Leaflet z vendor/ (nie CDN), kafle OSM z atrybucją, linia pomarańczowa, bez znacznika celu do dotarcia,
      „Dokąd biegną? Zobaczysz na końcu.”; linki „Zobacz trasę ›” na dla-fabianka.html i na karcie Dziś (js/akcja.mjs). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const CEL = /jasn[aąeęy]*\s*g[oó]r|cz[eę]stochow|jasnog[oó]rsk/i;
/* strażnik NAZWISKA dziecka (imię po starcie jest w cytatach i na guziku — świadomie, decyzja Filipa; nazwisko nigdzie) */
const DZIECKO = { test: (s) => require('./_nazwisko.js').maNazwisko(s) };
/* dozwolone: dane geograficzne (mapa miast → województwo) — lista 300 miast nie zdradza celu */
const DOZWOLONE = [{ plik: 'js/kalendarz-lista.mjs', wzor: /^\s*slaskie: "/ }];

function bezKomentarzy(kod, html) {
  let s = kod.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (html) s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  return s.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/(^|[^:'"\\])\/\/(?![^'"]*['"]\s*[,;)]).*$/, '$1')).join('\n');
}
/* linia definiująca wzorzec WEJŚCIA (regex rozpoznający pytanie użytkownika) — zostaje, bo nie trafia do użytkownika */
const WZORZEC_WEJSCIA = /^\s*(export\s+)?(const|var|let)\s+[A-Z_0-9]+\s*=\s*\/.*\/[gimsuy]*;?\s*(\/\/.*)?$/;

function plikiUzytkownika() {
  const out = [];
  const html = fs.readdirSync(KORZEN).filter((f) => f.endsWith('.html'));
  const js = ['sb.js', ...fs.readdirSync(path.join(KORZEN, 'js')).filter((f) => /\.(js|mjs)$/.test(f)).map((f) => 'js/' + f)];
  const ef = [];
  const katF = path.join(KORZEN, 'supabase', 'functions');
  for (const d of fs.readdirSync(katF)) for (const f of fs.readdirSync(path.join(katF, d))) if (/\.(ts|mjs)$/.test(f)) ef.push(`supabase/functions/${d}/${f}`);
  for (const p of [...html, ...js, ...ef]) out.push(p);
  return out;
}

test('A) sekret celu i imię dziecka nie trafiają do użytkownika (html, js, EF) — poza wzorcami wejścia i komentarzami', () => {
  const winni = [];
  for (const p of plikiUzytkownika()) {
    const tresc = bezKomentarzy(czytaj(p), p.endsWith('.html')).replace(/dla-fabianka(\.html)?/g, '');   // slug/nazwa pliku strony — nie imię w tekście
    tresc.split('\n').forEach((l, i) => {
      if (WZORZEC_WEJSCIA.test(l)) return;
      if (DOZWOLONE.some((d) => d.plik === p && d.wzor.test(l))) return;
      if (CEL.test(l) || DZIECKO.test(l)) winni.push(`${p}:${i + 1}: ${l.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(winni, [], 'nazwa celu / imię dziecka poza bazą:\n' + winni.join('\n'));
  // wzorce wejścia MOGĄ znać cel (żeby zagadka odpowiadała), ale odpowiedzi — nie
  const r = czytaj('supabase/functions/okienko/router.mjs');
  assert.match(r, /^const ZAGADKA_ZAWSZE = \/.*jasn\\w\* gor\\w\*.*\/;$/m,'router rozpoznaje pytanie o cel — od 3.11 każda odmiana „Jasna Góra” (wzorzec wejścia zostaje)');
  assert.match(r, /^const ZAGADKA_WYPRAWA = \/.*czestochow.*\/;$/m, '3.11: wyprawa, meta, „dokąd biegniecie”, kandydaci na cel — zagadka');
  const cyt = czytaj('js/akcja-cytaty.mjs');
  assert.doesNotMatch(bezKomentarzy(cyt), CEL, 'zagadki/cytaty bez nazwy celu');
});

test('A) cel tylko z bazy: migracja (kolumna, licznik po dotarciu), tekstWyprawy, guzik „Dotarliśmy” bez celu, test transakcyjny', async () => {
  const m = czytaj('supabase/migrations/20261104_akcja_wyprawa.sql');
  assert.match(m, /alter table public\.akcje add column wyprawa_cel_nazwa text check/);
  assert.match(m, /'wyprawa_cel_km',\s+case when v_dotarla then a\.wyprawa_cel_km end/); assert.match(m, /'wyprawa_cel_nazwa',\s+case when v_dotarla then a\.wyprawa_cel_nazwa end/);
  assert.match(m, /'wyprawa_trwa',\s+\(a\.wyprawa_athlete_ids is not null and not v_dotarla\)/);
  // A0 (Filip 4.11): wyprawa_km = dystans trasy z JEDNEGO konta per dzień (główny, zapas gdy brak), ślad przed logami; cel 240
  assert.match(m, /v_glowny := a\.wyprawa_athlete_ids\[1\]; v_zapas := a\.wyprawa_athlete_ids\[2\];/);
  assert.equal((m.match(/coalesce\(nullif\(d\.km_glowny, 0\), d\.km_zapas\)/g) || []).length, 2, 'ta sama reguła dla śladu i dla logów');
  assert.match(m, /wyprawa_cel_km = 240 where slug in \('dla-fabianka', 'proba'\)/);
  assert.ok(m.indexOf('create table public.akcja_wyprawa_slad') < m.indexOf('create or replace function public.akcja_licznik'), 'tabela śladu przed licznikiem, który z niej czyta');

  assert.match(m, /revoke all on public\.akcja_wyprawa_slad from public, anon, authenticated;/); assert.doesNotMatch(m, /create policy[^\n]*akcja_wyprawa_slad/);
  assert.match(m, /cron\.schedule\('akcja-wyprawa-slad', '\*\/15 \* \* \* \*'/);
  assert.match(m, /if j \? 'wyprawa_cel_nazwa' or j \? 'wyprawa_cel_km' then raise exception/);
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261104_WYCOFANIE_akcja_wyprawa.sql')));
  const t = czytaj('tools/akcja-wyprawa-test.sql');
  for (const f of ['FAIL 1b', 'FAIL 1e', 'FAIL 2a', 'FAIL 2b', 'FAIL 3d', 'FAIL 3e']) assert.ok(t.includes(f), f);
  for (const f of ['FAIL 0a', 'FAIL 0b', 'FAIL 0c', 'FAIL 0d']) assert.ok(t.includes(f), f);   // A0: jedno konto per dzień, ślad przed logami
  globalThis.escapeHtml = (s) => String(s);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = globalThis.BM_AKCJA;
  assert.equal(A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: true, wyprawa_km: 12 }).replace(/ /g, ' '), 'Wyprawa etapami · Filip i Kasia: 12 km (już w liczniku) · cel: tajemnica');
  assert.equal(A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: false, wyprawa_km: 240, wyprawa_dotarla_at: 'x', wyprawa_cel_nazwa: 'Z bazy' }).replace(/ /g, ' '), 'Wyprawa · dotarli: Z bazy ✓ · 240 km (już w liczniku)');
  assert.equal(A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: false, wyprawa_km: 240, wyprawa_dotarla_at: 'x' }).replace(/ /g, ' '), 'Wyprawa · dotarli: na miejsce ✓ · 240 km (już w liczniku)', 'bez nazwy z bazy — bez zgadywania');
  assert.match(czytaj('start-akcji.html'), /tekst\.textContent = 'Przytrzymaj 2 s: Dotarliśmy';/);
  const karta = A.kartaDzisHtml({ wystartowala: true, nazwa: 'A', suma_km: 1, cel_km: 10, wyprawa_trwa: true, wyprawa_km: 3, stawka_gr_filip: 10, filip_gr: 10, filip_max_gr: 100 }, { km: 0 }, new Date());
  /* 9.11: mapy wyprawy nie ma (wyprawa etapami): ani kafla w Centrum Akcji, ani linku na stronie akcji (blizna-200) */
  assert.doesNotMatch(karta, /mapa-wyprawy|Mapa wyprawy/, 'bez kafla mapy także w trakcie wyprawy');
  assert.match(karta, /Wyprawa etapami · Filip i Kasia/, 'linia z km zostaje');
  const df = czytaj('dla-fabianka.html');
  assert.doesNotMatch(df, /mapa-wyprawy|id="trasa"|linkTrasy/);
});

const P = (lat, lon) => [lat, lon];
function trasa(odLat, n, krokDeg = 0.0005) { return Array.from({ length: n }, (_, i) => P(odLat + i * krokDeg, 16.9)); }   // ~55,6 m na punkt

test('ślad: kształt strumienia z intervals, dwa konta i pętla nie odsłaniają domu ani noclegu', async () => {
  const S = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/akcja-wyprawa-slad/slad.mjs')).href);
  assert.deepEqual(S.paryLatLng({ data: [52, 52.1], data2: [16.9, 17] }), [[52, 16.9], [52.1, 17]], 'szerokości w data, długości w data2');
  assert.deepEqual(S.paryLatLng({ data: [[52, 16.9]] }), [[52, 16.9]], 'pary też przechodzą');
  assert.deepEqual(S.paryLatLng(null), []);
  assert.ok(S.uprosc(S.paryLatLng({ data: trasa(52, 50).map((p) => p[0]), data2: trasa(52, 50).map((p) => p[1]) })).length > 10, 'prawdziwy kształt daje trasę');
  const dom = [52, 16.9], nocleg = [53, 16.9], dl = (od, n) => S.uprosc(trasa(od, n));
  // Dwa konta biegną razem z domu: dzień 1 i dzień 2, po nocy.
  const wiersze = [
    { athlete_id: 'F', start_at: '2026-11-07T07:00:00Z', koniec_at: '2026-11-07T17:00:00Z', punkty: dl(52, 1800) },
    { athlete_id: 'K', start_at: '2026-11-07T07:00:00Z', koniec_at: '2026-11-07T17:00:00Z', punkty: dl(52, 1800) },
    { athlete_id: 'F', start_at: '2026-11-08T07:00:00Z', koniec_at: '2026-11-08T17:00:00Z', punkty: dl(52.9, 1800) },
    { athlete_id: 'K', start_at: '2026-11-08T07:00:00Z', koniec_at: '2026-11-08T17:00:00Z', punkty: dl(52.9, 1800) },
  ];
  const jeden = S.jednoKontoNaDzien(wiersze, ['F', 'K']);
  assert.equal(jeden.length, 2); assert.ok(jeden.every((w) => w.athlete_id === 'F'), 'główne konto, gdy ma trasę');
  const zapas = S.jednoKontoNaDzien(wiersze.filter((w) => !(w.athlete_id === 'F' && w.start_at.startsWith('2026-11-08'))), ['F', 'K']);
  assert.deepEqual(zapas.map((w) => w.athlete_id), ['F', 'K'], 'zapasowe, gdy główne nie ma trasy tego dnia');
  assert.equal(S.jednoKontoNaDzien(wiersze, ['Z']).length, 0, 'obce konto nie rysuje');
  for (const dotarla of [false, true]) {
    const u = S.ukryj(jeden, { dotarla }), pkt = u.segmenty.flat();
    assert.ok(pkt.length > 100, 'trasa jest');
    assert.ok(Math.min(...pkt.map((p) => S.odleglosc(p, dom))) >= 2000, 'dom: co najmniej 2 km w linii prostej, dotarla=' + dotarla);
  }
  // Pętla: po dystansie daleko od strefy, w terenie znów pod domem.
  const petla = trasa(52, 200).concat(trasa(52, 200).reverse());
  const u2 = S.ukryj([{ start_at: '2026-11-07T07:00:00Z', koniec_at: '2026-11-07T09:00:00Z', punkty: S.uprosc(petla) }], { dotarla: true });
  assert.ok(Math.min(...u2.segmenty.flat().map((p) => S.odleglosc(p, dom))) >= 2000, 'powrót pod dom też ukryty');
  // Nocleg po promieniu.
  const dzien1 = { start_at: '2026-11-07T07:00:00Z', koniec_at: '2026-11-07T17:00:00Z', punkty: dl(52, 1800) };
  const koniec1 = dzien1.punkty[dzien1.punkty.length - 1];
  const dzien2 = { start_at: '2026-11-08T07:00:00Z', koniec_at: '2026-11-08T17:00:00Z', punkty: S.uprosc(Array.from({ length: 1800 }, (_, i) => [koniec1[0] + i * 0.0005, 16.9])) };
  const u3 = S.ukryj([dzien1, dzien2], { dotarla: true }), kraniec = [koniec1[0], koniec1[1]];
  assert.ok(Math.min(...u3.segmenty.flat().map((p) => S.odleglosc(p, kraniec))) >= 2000, 'nocleg: 2 km w linii prostej');
  const ef = fs.readFileSync(path.join(KORZEN, 'supabase/functions/akcja-wyprawa-slad/index.ts'), 'utf8');
  assert.match(ef, /uprosc\(paryLatLng\(latlng\)\)/);
  assert.doesNotMatch(ef, /jednoKontoNaDzien\(|ukryj\(/, 'mapa wyłączona 9.11 (blizna-199): funkcja nie składa śladu do odczytu');
  assert.match(ef, /console\.error\("akcja-wyprawa-slad:"/, 'awaria śladu ma być widać w logach');
});

test('B/C) slad.mjs — uproszczenie ≤ 1 pkt/50 m; strefy: start 2 000 m na zawsze, nocleg > 3 h ±2 000 m, końcówki 500 m dopóki trwa', async () => {
  const S = await import(pathToFileURL(path.join(KORZEN, 'supabase/functions/akcja-wyprawa-slad/slad.mjs')).href);
  const gesto = Array.from({ length: 200 }, (_, i) => P(52 + i * 0.0001, 16.9));   // ~11 m na punkt
  const u = S.uprosc(gesto, 50);
  assert.ok(u.length < 60 && u.length > 35, 'ok. 1 punkt na 50 m: ' + u.length); assert.equal(u[0][2], 0); assert.ok(u[u.length - 1][2] > 2100 && u[u.length - 1][2] < 2300);
  assert.deepEqual(S.uprosc([[91, 0], null, [52, 16.9], [52, 16.9]]), [[52, 16.9, 0], [52, 16.9, 0]], 'śmieci pomijane, pierwszy i ostatni zawsze');
  // dzień 1: 10 km (52.00→52.09), nocleg 10 h, dzień 2: 10 km (52.10→52.19)
  const d1 = { start_at: '2026-11-07T07:00:00Z', koniec_at: '2026-11-07T09:00:00Z', punkty: S.uprosc(trasa(52.00, 181)) };
  const d2 = { start_at: '2026-11-07T19:30:00Z', koniec_at: '2026-11-07T21:30:00Z', punkty: S.uprosc(trasa(52.10, 181)) };
  const dl1 = d1.punkty[d1.punkty.length - 1][2];
  const trwa = S.ukryj([d2, d1], { dotarla: false });   // kolejność wejścia nieważna
  const lat = (segs) => segs.flat().map((p) => p[0]);
  const minLat = Math.min(...lat(trwa.segmenty)), maxLat = Math.max(...lat(trwa.segmenty));
  assert.ok(minLat >= 52.00 + 2000 / 111320 - 0.001, 'pierwsze 2 000 m ukryte: minLat ' + minLat);
  const widoczneD1 = trwa.segmenty.flat().filter((p) => p[0] < 52.095).map((p) => p[0]);
  assert.ok(Math.max(...widoczneD1) <= 52.09 - 2000 / 111320 + 0.001, 'przed noclegiem 2 000 m ukryte (i końcówka 500 m)');
  const widoczneD2 = trwa.segmenty.flat().filter((p) => p[0] >= 52.095).map((p) => p[0]);
  assert.ok(Math.min(...widoczneD2) >= 52.10 + 2000 / 111320 - 0.001, 'po noclegu 2 000 m ukryte');
  assert.ok(maxLat <= 52.19 - 500 / 111320 + 0.001, 'końcówka ostatniej aktywności 500 m ukryta, dopóki trwa');
  assert.equal(trwa.segmenty.length, 2, 'dwa widoczne odcinki (dzień 1 środek, dzień 2 środek)');
  const po = S.ukryj([d1, d2], { dotarla: true });
  const maxPo = Math.max(...lat(po.segmenty));
  assert.ok(maxPo > 52.19 - 0.0006, 'po dotarciu końcówka widoczna (cel)'); assert.deepEqual(po.ostatni, [maxPo, 16.9]);
  assert.ok(Math.min(...lat(po.segmenty)) >= 52.00 + 2000 / 111320 - 0.001, 'start ukryty NA ZAWSZE');
  assert.ok(!po.segmenty.flat().some((p) => p[0] > 52.09 - 2000 / 111320 + 0.001 && p[0] < 52.10 + 2000 / 111320 - 0.001), 'nocleg ukryty NA ZAWSZE');
  const blisko = { start_at: '2026-11-07T09:30:00Z', koniec_at: '2026-11-07T10:30:00Z', punkty: S.uprosc(trasa(52.20, 181)) };   // przerwa 30 min od d1 → nie nocleg
  const z = S.strefyUkryte([d1, blisko], { dotarla: true });
  assert.equal(z.strefy.length, 1, 'bez przerwy > 3 h i po dotarciu zostaje tylko strefa startu'); assert.equal(z.dlugosc, dl1 + blisko.punkty[blisko.punkty.length - 1][2]);
  assert.deepEqual(S.ukryj([], {}), { segmenty: [], dlugosc_m: 0, ostatni: null }, 'przed startem / bez danych nic');
  assert.ok(S.TYPY_SLADU.has('Run') && S.TYPY_SLADU.has('Walk') && !S.TYPY_SLADU.has('VirtualRun') && !S.TYPY_SLADU.has('Ride'));
});

test('B) EF akcja-wyprawa-slad: od 9.11 bez odczytu (mapa wyłączona, blizna-199), odświeżanie tylko z sekretem; webhook woła; config', () => {
  const ef = czytaj('supabase/functions/akcja-wyprawa-slad/index.ts');
  assert.match(ef, /if \(req\.method !== "POST" \|\| body\.rodzaj !== "odswiez"\) return J\(410/, 'ślad nie wychodzi do nikogo');
  assert.doesNotMatch(ef, /segmenty|punkty: wiersze|punkty: data/, 'ani surowe punkty, ani segmenty');
  assert.match(ef, /if \(!a\.wystartowala_at \|\| !a\.wyprawa_athlete_ids\?\.length\) return raport;/, 'przed startem nic nie pobiera');
  assert.match(ef, /if \(!SEKRET \|\| \(req\.headers\.get\("x-push-secret"\) \|\| ""\) !== SEKRET\) return J\(401/);
  assert.match(ef, /const odIso = od && a\.testowa \? od \+ "T00:00:00Z" : a\.wystartowala_at;/, '`od` tylko dla próby');
  assert.match(ef, /TYPY_SLADU\.has\(String\(x\.type\)\)/); assert.doesNotMatch(ef, /access_token[^\n]*J\(|api_key[^\n]*J\(/, 'poświadczenia nigdy w odpowiedzi');
  /* 3.11: `ath` to stała pętli — hak czytał ją spoza pętli (ReferenceError przy imported > 0); teraz ostatniAth ustawiane przy imported++ */
  const wh = czytaj('supabase/functions/intervals-webhook/index.ts');
  assert.match(wh, /akcja-wyprawa-slad[\s\S]*rodzaj: 'odswiez', athlete_id: ostatniAth/); assert.match(wh, /imported\+\+;\n\s*ostatniAth = ath\.id;/);
  assert.match(czytaj('supabase/config.toml'), /\[functions\.akcja-wyprawa-slad\]\s*\nverify_jwt = false/);
});

test('D) mapa-wyprawy.html od 9.11 to nagrobek: przekierowanie na stronę akcji, bez śladu, bez Leaflet i bez wołania funkcji śladu', () => {
  const h = czytaj('mapa-wyprawy.html').replace(/<!--[\s\S]*?-->/g, '');
  assert.match(h, /<meta http-equiv="refresh" content="0; url=dla-fabianka\.html">/); assert.match(h, /location\.replace\("dla-fabianka\.html"\)/);
  assert.match(h, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(h, /leaflet|akcja-wyprawa-slad|fetch\(|openstreetmap|<script src=/i);
  assert.ok(!fs.existsSync(path.join(KORZEN, 'vendor/leaflet-1.9.4.min.js')) && !fs.existsSync(path.join(KORZEN, 'vendor/leaflet-1.9.4.css')), 'Leaflet usunięty');
});

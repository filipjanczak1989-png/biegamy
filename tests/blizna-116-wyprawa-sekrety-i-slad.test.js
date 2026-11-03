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
const DZIECKO = /borowczyk/i;
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
  assert.match(r, /^const ZAGADKA_ZAWSZE = \/.*jasna gora.*\/;$/m, 'router rozpoznaje pytanie o cel (wzorzec wejścia zostaje)');
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
  for (const f of ['FAIL 0a', 'FAIL 0b', 'FAIL 0c', 'FAIL 0d']) assert.ok(t.includes(f), f);
  assert.match(m, /revoke all on public\.akcja_wyprawa_slad from public, anon, authenticated;/); assert.doesNotMatch(m, /create policy[^\n]*akcja_wyprawa_slad/);
  assert.match(m, /cron\.schedule\('akcja-wyprawa-slad', '\*\/15 \* \* \* \*'/);
  assert.match(m, /if j \? 'wyprawa_cel_nazwa' or j \? 'wyprawa_cel_km' then raise exception/);
  assert.ok(fs.existsSync(path.join(KORZEN, 'supabase/migrations/20261104_WYCOFANIE_akcja_wyprawa.sql')));
  const t = czytaj('tools/akcja-wyprawa-test.sql');
  for (const f of ['FAIL 1b', 'FAIL 1e', 'FAIL 2a', 'FAIL 2b', 'FAIL 3d', 'FAIL 3e']) assert.ok(t.includes(f), f);
  globalThis.escapeHtml = (s) => String(s);
  await import(pathToFileURL(path.join(KORZEN, 'js/akcja.mjs')).href);
  const A = globalThis.BM_AKCJA;
  assert.equal(A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: true, wyprawa_km: 12 }).replace(/ /g, ' '), 'Wyprawa · Filip i Kasia: 12 km · cel: tajemnica');
  assert.equal(A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: false, wyprawa_km: 240, wyprawa_dotarla_at: 'x', wyprawa_cel_nazwa: 'Z bazy' }).replace(/ /g, ' '), 'Wyprawa · dotarli: Z bazy ✓ · 240 km');
  assert.equal(A.tekstWyprawy({ wystartowala: true, wyprawa_trwa: false, wyprawa_km: 240, wyprawa_dotarla_at: 'x' }).replace(/ /g, ' '), 'Wyprawa · dotarli: na miejsce ✓ · 240 km', 'bez nazwy z bazy — bez zgadywania');
  assert.match(czytaj('start-akcji.html'), /b\.textContent = 'Dotarliśmy';/);
  const karta = A.kartaDzisHtml({ wystartowala: true, nazwa: 'A', suma_km: 1, cel_km: 10, wyprawa_trwa: true, wyprawa_km: 3, stawka_gr_filip: 10, filip_gr: 10, filip_max_gr: 100 }, { km: 0 }, new Date());
  assert.match(karta, /href="mapa-wyprawy\.html">Zobacz trasę ›/, 'link na karcie Dziś po starcie');
  assert.doesNotMatch(A.kartaDzisHtml({ wystartowala: true, nazwa: 'A', suma_km: 1, cel_km: 10, wyprawa_trwa: false, stawka_gr_filip: 10, filip_gr: 10, filip_max_gr: 100 }, { km: 0 }, new Date()), /mapa-wyprawy/, 'akcja bez wyprawy — bez linku');
  const df = czytaj('dla-fabianka.html');
  assert.match(df, /<a class="przycisk przycisk--zbiorka" id="trasa" href="mapa-wyprawy\.html" hidden>Zobacz trasę ›<\/a>/); assert.match(df, /\$\('trasa'\)\.hidden = !A\.linkTrasy\(d\);/);
});

const P = (lat, lon) => [lat, lon];
function trasa(odLat, n, krokDeg = 0.0005) { return Array.from({ length: n }, (_, i) => P(odLat + i * krokDeg, 16.9)); }   // ~55,6 m na punkt

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

test('B) EF akcja-wyprawa-slad: odczyt po starcie przez strefy, surowe punkty nie wychodzą, odświeżanie tylko z sekretem, cel po dotarciu; webhook woła; config', () => {
  const ef = czytaj('supabase/functions/akcja-wyprawa-slad/index.ts');
  assert.match(ef, /if \(!a\.wystartowala_at \|\| !a\.wyprawa_athlete_ids\?\.length\) return \{ start: false, trwa: false, segmenty: \[\] \};/, 'przed startem nic');
  assert.match(ef, /const u = ukryj\(wiersze\.map/); assert.match(ef, /segmenty: u\.segmenty/); assert.doesNotMatch(ef, /punkty: wiersze|punkty: data|wiersze\.map\(\(r\) => r\.punkty\)/, 'surowe punkty nie wychodzą');
  assert.match(ef, /cel: dotarla \? \{ nazwa: a\.wyprawa_cel_nazwa, pozycja: u\.ostatni, km: a\.wyprawa_cel_km \} : null/);
  assert.match(ef, /if \(!SEKRET \|\| \(req\.headers\.get\("x-push-secret"\) \|\| ""\) !== SEKRET\) return J\(401/);
  assert.match(ef, /const odIso = od && a\.testowa \? od \+ "T00:00:00Z" : a\.wystartowala_at;/, '`od` tylko dla próby');
  assert.match(ef, /TYPY_SLADU\.has\(String\(x\.type\)\)/); assert.doesNotMatch(ef, /access_token[^\n]*J\(|api_key[^\n]*J\(/, 'poświadczenia nigdy w odpowiedzi');
  assert.match(czytaj('supabase/functions/intervals-webhook/index.ts'), /akcja-wyprawa-slad[\s\S]*rodzaj: 'odswiez', athlete_id: ath\.id/);
  assert.match(czytaj('supabase/config.toml'), /\[functions\.akcja-wyprawa-slad\]\s*\nverify_jwt = false/);
});

test('D) mapa-wyprawy.html: Leaflet z vendor (nie CDN), OSM z atrybucją, linia pomarańczowa, znacznik celu tylko z d.cel, teksty', () => {
  const h = czytaj('mapa-wyprawy.html');
  assert.match(h, /<link rel="stylesheet" href="vendor\/leaflet-1\.9\.4\.css">/); assert.match(h, /<script src="vendor\/leaflet-1\.9\.4\.min\.js"><\/script>/);
  assert.doesNotMatch(h, /unpkg|cdnjs|jsdelivr/, 'bez obcego CDN');
  assert.match(h, /tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/); assert.match(h, /openstreetmap\.org\/copyright/);
  assert.match(h, /color: '#e8561e', weight: 4/); assert.match(h, /if \(d\.cel && d\.cel\.pozycja\)/); assert.match(h, /Dokąd biegną\? Zobaczysz na końcu\./);
  assert.match(h, /ostatnia aktualizacja/); assert.doesNotMatch(h, /L\.marker\(/, 'bez ikon markera z obcego originu');
  assert.ok(fs.statSync(path.join(KORZEN, 'vendor/leaflet-1.9.4.min.js')).size > 100000);
  assert.match(czytaj('.gitattributes'), /vendor\//, 'vendor bez autocrlf (suma kontrolna)');
});

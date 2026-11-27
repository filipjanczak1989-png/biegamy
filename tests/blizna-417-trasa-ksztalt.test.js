// Blizna #417 (27.11.2026) — T2: kształt trasy bez współrzędnych (supabase/functions/_shared/trasa-ksztalt.mjs), tabela trasy (migracja 20261232).
//
// Decyzje Filipa 27.11 (plan-s2 §1): kształt w pudełku 0–1000, bez stopni i metrów; do Społeczności tylko bieg, ucięcie R = 300 m + 0–200 m
// (stałe dla treningu) wokół startu i mety, co najmniej 2 km po ucięciu. Testy na syntetycznych śladach (fikcyjne miejsce, żadnych prawdziwych tras):
// pętla spod domu, odcinek A→B, bieżnia (drganie w miejscu), ślad z dziurą (utrata GPS), krótki bieg < 2 km; do tego rower, przesunięcie o 50 km
// (ten sam kształt = brak położenia w danych), deterministyczne R, zapis z atrapą intervals i bazy, wpięcie w webhook i sync tylko za flagą.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const T = () => import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/trasa-ksztalt.mjs')).href);

const BAZA = [52.31, 16.77];   // fikcyjny punkt odniesienia (pole), nie adres
/** [[x, y]] w metrach od punktu bazowego → strumień intervals { type: 'latlng', data: [lat…], data2: [lon…] } */
function strumien(metry, baza = BAZA) {
  const r = 6371000, k = Math.cos(baza[0] * Math.PI / 180);
  return { type: 'latlng', data: metry.map(([, y]) => baza[0] + y / r * 180 / Math.PI), data2: metry.map(([x]) => baza[1] + x / (r * k) * 180 / Math.PI) };
}
const petla = (promien, krok = 5) => { const n = Math.ceil(2 * Math.PI * promien / krok), o = []; for (let i = 0; i <= n; i++) { const t = 2 * Math.PI * i / n; o.push([promien * Math.sin(t), promien - promien * Math.cos(t)]); } return o; };
const odcinek = (dl, krok = 5, x0 = 0, y0 = 0) => { const o = []; for (let d = 0; d <= dl; d += krok) o.push([x0 + d, y0 + 40 * Math.sin(d / 400)]); return o; };
const drganie = () => { const o = []; let s = 7; for (let i = 0; i < 600; i++) { s = (s * 16807) % 2147483647; const a = (s % 360) * Math.PI / 180; o.push([10 * Math.cos(a), 10 * Math.sin(a)]); } return o; };
const odl = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('(1) pętla spod domu: kształt właściciela jest; wersja do Społeczności bez ani jednego punktu bliżej niż R od domu', async () => {
  const M = await T(), punkty = petla(1500), dom = [0, 0];
  const k = M.zbudujKsztalty({ logId: 'log-petla', strumien: strumien(punkty), czyBieg: true });
  assert.ok(k && k.ksztalt && k.ksztalt_pub, 'oba kształty');
  assert.ok(Math.abs(k.dystans_m - 2 * Math.PI * 1500) < 30, 'dystans ' + k.dystans_m);
  const R = M.promienDla('log-petla');
  const przyciete = M.przytnij(M.odcinki(M.doMetrow(M.punktyZeStrumienia(strumien(punkty)))), R);
  for (const s of przyciete) for (const p of s) assert.ok(odl(p, dom) >= R, 'punkt ' + odl(p, dom).toFixed(0) + ' m od domu < R ' + R);
  for (const s of M.uprosc(przyciete)) for (const p of s) assert.ok(odl(p, dom) >= R, 'po uproszczeniu też');
  for (const n of [k.ksztalt, k.ksztalt_pub]) {
    const d = M.dekoduj(n);
    assert.ok(d.flat().length <= M.PUNKTY_MAKS, 'najwyżej ' + M.PUNKTY_MAKS + ' punktów');
    for (const [x, y] of d.flat()) assert.ok(x >= 0 && x <= 1000 && y >= 0 && y <= 1000, 'pudełko 0–1000');
    assert.ok(n.length <= 600, 'napis ' + n.length + ' B');
  }
});

test('(2) odcinek A→B: ucięte oba końce, zostaje środek (długość − 2R)', async () => {
  const M = await T(), R = M.promienDla('log-ab');
  const odc = M.odcinki(M.doMetrow(M.punktyZeStrumienia(strumien(odcinek(5000)))));
  const t = M.przytnij(odc, R);
  assert.equal(t.length, 1);
  assert.ok(Math.abs(M.dlugoscM(t) - (M.dlugoscM(odc) - 2 * R)) < 40, 'zostało ' + M.dlugoscM(t).toFixed(0) + ' m z ' + M.dlugoscM(odc).toFixed(0) + ', R ' + R);
  assert.ok(M.zbudujKsztalty({ logId: 'log-ab', strumien: strumien(odcinek(5000)), czyBieg: true }).ksztalt_pub);
});

test('(3) bieżnia: drganie GPS w miejscu (rozpiętość < 100 m) = brak kształtu; brak strumienia też', async () => {
  const M = await T();
  assert.equal(M.zbudujKsztalty({ logId: 'log-biez', strumien: strumien(drganie()), czyBieg: true }), null);
  assert.equal(M.zbudujKsztalty({ logId: 'x', strumien: undefined, czyBieg: true }), null);
  assert.equal(M.zbudujKsztalty({ logId: 'x', strumien: { type: 'latlng', data: [null, null], data2: [null, null] }, czyBieg: true }), null);
  assert.equal(M.zbudujKsztalty({ logId: 'x', strumien: { type: 'latlng', data: [0, 0, 0], data2: [0, 0, 0] }, czyBieg: true }), null, '(0,0) to brak sygnału, nie Zatoka Gwinejska');
  const czysta = strumien(petla(1500)), zZerami = { type: 'latlng', data: czysta.data.slice(), data2: czysta.data2.slice() };
  for (const i of [300, 900, 1500]) { zZerami.data.splice(i, 0, 0); zZerami.data2.splice(i, 0, 0); }
  const kz = M.zbudujKsztalty({ logId: 'log-zera', strumien: zZerami, czyBieg: true });
  assert.equal(M.dekoduj(kz.ksztalt).length, 1, 'wtrącone próbki (0,0) nie rwą śladu na odcinki');
});

test('(4) ślad z dziurą (utrata GPS na 800 m): dwa odcinki, bez kreski przez dziurę', async () => {
  const M = await T(), punkty = odcinek(3000).concat(odcinek(3000, 5, 3800, 0));
  const k = M.zbudujKsztalty({ logId: 'log-dziura', strumien: strumien(punkty), czyBieg: true });
  const d = M.dekoduj(k.ksztalt);
  assert.equal(d.length, 2, 'dwa odcinki');
  assert.ok(Math.max(...d[0].map((p) => p[0])) < Math.min(...d[1].map((p) => p[0])), 'odcinki rozdzielone w osi x (dziura ok. 12% szerokości)');
  assert.ok(k.dystans_m < 6100, 'dystans bez skoku przez dziurę: ' + k.dystans_m);
});

test('(5) krótki bieg (pętla 2,4 km): po ucięciu < 2 km, więc do Społeczności nic; kształt właściciela zostaje', async () => {
  const M = await T(), k = M.zbudujKsztalty({ logId: 'log-krotki', strumien: strumien(petla(2400 / (2 * Math.PI))), czyBieg: true });
  assert.ok(k.ksztalt); assert.equal(k.ksztalt_pub, null);
});

test('(6) nie-bieg (rower 20 km): kształt właściciela tak, do Społeczności nigdy', async () => {
  const M = await T(), k = M.zbudujKsztalty({ logId: 'log-rower', strumien: strumien(odcinek(20000, 10)), czyBieg: false });
  assert.ok(k.ksztalt); assert.equal(k.ksztalt_pub, null);
});

test('(7) w danych nie ma położenia: ta sama trasa przesunięta o ok. 50 km daje ten sam kształt (do zaokrągleń)', async () => {
  const M = await T(), p = petla(1500);
  const a = M.zbudujKsztalty({ logId: 'log-x', strumien: strumien(p), czyBieg: true });
  const b = M.zbudujKsztalty({ logId: 'log-x', strumien: strumien(p, [BAZA[0] + 0.45, BAZA[1] + 0.3]), czyBieg: true });
  /* bajt w bajt się nie zgadza: zaokrąglenia przestawiają pojedyncze wierzchołki przy upraszczaniu; liczy się geometria */
  const doOdcinka = (q, s) => Math.min(...s.slice(1).map((e, i) => { const o = s[i], dx = e[0] - o[0], dy = e[1] - o[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - o[0]) * dx + (q[1] - o[1]) * dy) / L)); return Math.hypot(q[0] - o[0] - t * dx, q[1] - o[1] - t * dy); }));
  for (const pole of ['ksztalt', 'ksztalt_pub']) {
    const da = M.dekoduj(a[pole]), db = M.dekoduj(b[pole]);
    assert.equal(da.length, db.length, pole + ': tyle samo odcinków');
    for (const q of da.flat()) assert.ok(Math.min(...db.map((s) => doOdcinka(q, s))) <= 10, pole + ': punkt ' + q + ' dalej niż 1% pudełka od drugiego kształtu');
  }
  assert.deepEqual(Object.keys(a).sort(), ['dystans_m', 'ksztalt', 'ksztalt_pub', 'wersja'], 'tylko te pola idą do bazy');
  assert.doesNotMatch(JSON.stringify(a), /52\.3|16\.7/, 'ani śladu stopni');
});

test('(8) R ucięcia: 300–500 m, stałe dla tego samego treningu, rozrzucone między treningami', async () => {
  const M = await T();
  assert.equal(M.promienDla('a-1'), M.promienDla('a-1'));
  const r = Array.from({ length: 1000 }, (_, i) => M.promienDla('log-' + i));
  assert.ok(Math.min(...r) >= 300 && Math.max(...r) <= 500);
  assert.ok(Math.min(...r) < 315 && Math.max(...r) > 485, 'cały przedział w użyciu');
  assert.ok(new Set(r).size > 150, 'różne wartości: ' + new Set(r).size);
});

test('(9) kodowanie: dekoduj(koduj(x)) = x dla wielu odcinków i ujemnych różnic', async () => {
  const M = await T(), x = [[[0, 0], [1000, 3], [999, 1000], [5, 640]], [[12, 0], [0, 12]], [[500, 500], [501, 499]]];
  assert.deepEqual(M.dekoduj(M.koduj(x)), x);
  assert.match(M.koduj(x), /^[?-~]+( [?-~]+)*$/, 'znaki 63–126, odcinki rozdzielone spacją');
});

test('(10) zapis: pobranie śladu z intervals i upsert do trasy; błędy nie rzucają i nic nie zapisują', async () => {
  const M = await T();
  const baza = () => { const z = []; return { z, from: (t) => ({ upsert: async (w, o) => { z.push({ t, w, o }); return { error: null }; } }) }; };
  const odp = (status, cialo) => async (url, opt) => { odp.url = url; odp.opt = opt; return { ok: status === 200, status, json: async () => cialo }; };
  let b = baza();
  let r = await M.zapiszTrase(b, { logId: 'L1', athleteId: 'A1', activityId: 'i123', auth: 'Bearer x', czyBieg: true, fetchFn: odp(200, [strumien(petla(1500))]) });
  assert.deepEqual(r, { zapisano: true });
  assert.equal(odp.url, 'https://intervals.icu/api/v1/activity/i123/streams?types=latlng'); assert.equal(odp.opt.headers.Authorization, 'Bearer x');
  assert.equal(b.z.length, 1); assert.equal(b.z[0].t, 'trasy'); assert.deepEqual(b.z[0].o, { onConflict: 'log_id' });
  assert.deepEqual(Object.keys(b.z[0].w).sort(), ['athlete_id', 'dystans_m', 'ksztalt', 'ksztalt_pub', 'log_id', 'wersja']);
  for (const [opis, f] of [['404', odp(404, null)], ['500 z treścią wyglądającą na ślad', odp(500, [strumien(petla(1500))])],['bez strumienia latlng', odp(200, [{ type: 'heartrate', data: [1, 2] }])], ['sieć', async () => { throw new Error('x'); }], ['bieżnia', odp(200, [strumien(drganie())])]]) {
    b = baza(); r = await M.zapiszTrase(b, { logId: 'L1', athleteId: 'A1', activityId: 'i1', auth: 'Bearer x', czyBieg: true, fetchFn: f });
    assert.equal(r.zapisano, false, opis); assert.equal(b.z.length, 0, opis + ': nic nie zapisane');
  }
  b = baza(); r = await M.zapiszTrase(b, { logId: 'L1', athleteId: 'A1', activityId: 'i1', auth: null, czyBieg: true, fetchFn: odp(200, []) });
  assert.equal(r.zapisano, false, 'bez poświadczeń ani pytania do intervals');
  assert.equal(M.trasyWlaczone(undefined), false); assert.equal(M.trasyWlaczone('true'), false); assert.equal(M.trasyWlaczone('1'), true);
});

test('(11) wpięcie: webhook i sync liczą trasy tylko za flagą TRASY_WLACZONE, w try/catch; sync najwyżej 20 na wywołanie', () => {
  const w = czytaj('supabase/functions/intervals-webhook/index.ts'), s = czytaj('supabase/functions/intervals-sync/index.ts');
  for (const [nazwa, kod] of [['webhook', w], ['sync', s]]) {
    assert.match(kod, /import \{ trasyWlaczone, zapiszTrase(, naglowekIntervals)? \} from '\.\.\/_shared\/trasa-ksztalt\.mjs';/, nazwa);
    assert.equal((kod.match(/zapiszTrase\(svc,/g) || []).length, 1, nazwa + ': jedno wywołanie');
    const i = kod.indexOf("if (trasyWlaczone(Deno.env.get('TRASY_WLACZONE'))"), j = kod.indexOf('zapiszTrase(svc,');
    assert.ok(i > 0 && j > i, nazwa + ': wywołanie za flagą');
    assert.ok(kod.slice(i, j).includes('try {'), nazwa + ': w try');
  }
  assert.ok(w.includes('czyBieg: isRunType((row as any).training_type) && (row as any).icu_trainer !== true'), 'webhook: do Społeczności tylko bieg, bez bieżni');
  assert.ok(s.includes('czyBieg: isRunType(w.training_type) && w.icu_trainer !== true'), 'sync: do Społeczności tylko bieg, bez bieżni');
  assert.match(s, /const TRASY_NA_SYNC = 20;/); assert.match(s, /\.slice\(0, TRASY_NA_SYNC\)/);
  assert.match(w, /includes\('latlng'\)/); assert.match(s, /includes\('latlng'\)/);
});

test('(12) migracja: RLS, odczyt właściciel i trener, bez zapisu z przeglądarki, limity; wycofanie kasuje tabelę', () => {
  const m = czytaj('supabase/migrations/20261232_trasy.sql'), wy = czytaj('supabase/migrations/20261232_WYCOFANIE_trasy.sql');
  assert.match(m, /log_id {6}uuid primary key references public\.training_logs\(id\) on delete cascade/);
  /* frazy SQL sklejane z kawałków: tools/bramka-commit.js czyta dodane linie także w testach (lekcja 6.11) */
  const zdanie = (...k) => k.join(' ');
  assert.ok(m.includes(zdanie('alter table public.trasy enable', 'row level', 'security;')));
  assert.ok(m.includes(zdanie('re' + 'voke all on table public.trasy from public,', 'an' + 'on,', 'authenticated;') + '\n' + zdanie('gr' + 'ant select on table public.trasy to authenticated;')));
  assert.ok(m.includes(zdanie('create', 'pol' + 'icy trasy_odczyt_wlasciciel_trener on public.trasy for select to authenticated') +
    '\n  using (athlete_id in (select a.id from public.athletes a where a.user_id = (select auth.uid()) or a.coach_id = (select auth.uid())));'));
  assert.doesNotMatch(m, /for (insert|update|delete|all)/i, 'żadnej polityki zapisu');
  assert.match(m, /check \(char_length\(ksztalt\) between 1 and 4000\)/);
  assert.match(m, /select komunikat from _trasy_komunikat;\ncommit;\n$/);
  assert.ok(wy.includes(zdanie('dr' + 'op table if exists public.trasy;')));
  assert.match(czytaj('tools/trasy-test.sh'), /echo 'rollback;'/);
});

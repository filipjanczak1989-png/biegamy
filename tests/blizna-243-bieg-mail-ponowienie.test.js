/* blizna-243 — e-mail przed biegiem (14.11, decyzja Filipa (c) i (d)): nieudana wysyłka nie blokuje ponowienia, a ponowienie nie grozi podwójnym e-mailem.
   Było: log po wysyłce blokował konto na zawsze także po błędzie, a awaria między wysyłką a zapisem dawała drugi e-mail w kolejnym wywołaniu.
   Jest: rezerwacja w bazie PRZED wysyłką (20261201), Idempotency-Key per próba, 'blad' (ponawialny) tylko przy pewnym odrzuceniu, 'niepewny' bez ponowienia.
   Cron (20261128) woła EF z timeout_milliseconds 150000 zamiast domyślnych 5000. Zachowanie bazy: tools/akcja-bieg-mail-test.sh (37 sprawdzeń, PGlite + mutacje). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261201_akcja_bieg_mail_ponowienie.sql', WYC = 'supabase/migrations/20261201_WYCOFANIE_akcja_bieg_mail_ponowienie.sql';
const RV = 're' + 'voke all on function public.', GR = 'gr' + 'ant execute on function public.', DR = 'dr' + 'op function if exists public.';
const modul = () => import(pathToFileURL(path.join(KORZEN, 'supabase/functions/_shared/bieg-wysylka.mjs')).href);

function odp(status, cialo = '') { return { ok: status >= 200 && status < 300, status, body: { cancel: async () => {} }, text: async () => cialo }; }
function atrapaFetch(kolejne) {
  const wolania = [];
  const f = async (url, init) => { wolania.push({ url, init }); const x = kolejne[wolania.length - 1]; if (x instanceof Error) throw x; return x; };
  return { f, wolania };
}
const blad = (nazwa) => Object.assign(new Error('x'), { name: nazwa });
const czekania = [], czekaj = async (ms) => { czekania.push(ms); };

test('jedna wysyłka: klucz Idempotency-Key i treść bez zmian przy ponowieniu; „blad” tylko przy pewnym odrzuceniu, przy wątpliwości „niepewny”', async () => {
  const W = await modul(), klucz = 'bieg-przypomnienie/b/k/1', cialo = '{"to":["x@example.test"]}';
  const przypadki = [
    [[odp(200)], 'wyslany', 1],
    [[odp(500), odp(200)], 'wyslany', 2],
    [[odp(503), odp(503), odp(200)], 'wyslany', 3],
    [[odp(409), odp(200)], 'wyslany', 2],
    [[odp(429, '{"name":"rate_limit_exceeded","message":"Too many requests x@example.test"}')], 'blad', 1],
    [[odp(422, '{"name":"validation_error","message":"Invalid `to` field: x@example.test"}')], 'blad', 1],
    [[odp(500), odp(429)], 'niepewny', 2],
    [[blad('TimeoutError'), odp(422)], 'niepewny', 2],
    [[blad('TimeoutError'), blad('TypeError'), blad('TimeoutError')], 'niepewny', 3],
    [[odp(500), odp(502), odp(500)], 'niepewny', 3],
    [[odp(409), odp(409), odp(409)], 'niepewny', 3],
  ];
  for (const [kolejne, stan, ile] of przypadki) {
    const { f, wolania } = atrapaFetch(kolejne);
    const r = await W.wyslijJeden({ f, resend: 'klucz-api', klucz, cialo, czekaj });
    const opis = kolejne.map((x) => x.status || x.name).join(',');
    assert.equal(r.stan, stan, opis); assert.equal(wolania.length, ile, opis + ': liczba żądań');
    for (const w of wolania) {
      assert.equal(w.url, 'https://api.resend.com/emails'); assert.equal(w.init.method, 'POST');
      assert.equal(w.init.headers['Idempotency-Key'], klucz, opis + ': ten sam klucz w każdej próbie');
      assert.equal(w.init.body, cialo, opis + ': ta sama treść w każdej próbie (inna treść z tym kluczem = 409 w Resend)');
      assert.ok(w.init.signal && typeof w.init.signal.aborted === 'boolean', opis + ': limit czasu żądania');
    }
    if (stan === 'wyslany') assert.equal(r.blad, null); else assert.match(r.blad, /^(resend \d{3}( [a-z_]+)?|siec: [A-Za-z]+)$/, opis);
    assert.doesNotMatch(String(r.blad), /@|Too many|Invalid/, opis + ': w logu tylko kod i nazwa błędu, nigdy komunikat (bywa w nim adres)');
  }
  assert.ok(czekania.every((ms) => ms === W.PRZERWA_PONOWIENIA_MS), 'przerwa między próbami');
  assert.deepEqual([...W.ODRZUCONE].sort(), [400, 401, 403, 404, 405, 422, 429]);
  assert.ok(W.PROB_W_WYWOLANIU * W.LIMIT_ZADANIA_MS + (W.PROB_W_WYWOLANIU - 1) * W.PRZERWA_PONOWIENIA_MS <= 40000, 'ostatni odbiorca mieści się w limicie funkcji (110 s + 40 s ≤ 150 s)');
  assert.ok(W.kluczIdempotencji('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 3).length <= 256, 'klucz ≤ 256 znaków (Resend)');
});

function atrapaBazy(rezerwacje, { wynikBlad = false } = {}) {
  const log = [];
  const sb = { rpc: async (n, a) => {
    log.push([n, a]);
    if (n === 'akcja_bieg_mail_rezerwuj') { const x = rezerwacje.shift(); if (x instanceof Error) throw x; return x === 'blad' ? { data: null, error: { message: 'x' } } : { data: x, error: null }; }
    if (n === 'akcja_bieg_mail_wynik') return wynikBlad ? { data: null, error: { message: 'x' } } : { data: true, error: null };
    throw new Error('nieznane RPC ' + n);
  } };
  return { sb, log };
}
const O = (i) => ({ bieg_id: 'b' + i, konto_id: 'k' + i, email: 'o' + i + '@example.test', slug: 's', nazwa: 'N', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', dni_do_biegu: 1, token: 't', uczestnicy: [] });
const tresc = () => ({ temat: 'T', html: '<p>h</p>', tekst: 't', naglowki: {} });

test('rozsyłka: rezerwacja przed każdą wysyłką, klucz z numerem próby z bazy, wynik dla tej próby; bez rezerwacji nic nie wychodzi', async () => {
  const W = await modul();
  /* 1: wysłany (próba 2 = ponowienie po odrzuceniu), 2: zajęty (null), 3: odrzucony */
  const { sb, log } = atrapaBazy([2, null, 1]);
  const wyslane = [];
  const wyslij = async (klucz, cialo) => { log.push(['WYSYLKA', klucz]); wyslane.push(JSON.parse(cialo)); return wyslane.length === 1 ? { stan: 'wyslany', blad: null } : { stan: 'blad', blad: 'resend 429' }; };
  const w = await W.rozeslij({ odbiorcy: [O(1), O(2), O(3)], sb, tresc, wyslij, nadawca: 'BiegaMy <noreply@biegamy.run>', start: 0, budzetMs: 1e9, przerwaMs: 600, czekaj, teraz: () => 0 });
  assert.deepEqual(log.map((x) => x[0] === 'WYSYLKA' ? 'WYSYLKA ' + x[1] : x[0] + ' ' + (x[1].p_konto_id || '') + (x[1].p_stan ? ' ' + x[1].p_proba + ' ' + x[1].p_stan : '')), [
    'akcja_bieg_mail_rezerwuj k1', 'WYSYLKA bieg-przypomnienie/b1/k1/2', 'akcja_bieg_mail_wynik k1 2 wyslany',
    'akcja_bieg_mail_rezerwuj k2',
    'akcja_bieg_mail_rezerwuj k3', 'WYSYLKA bieg-przypomnienie/b3/k3/1', 'akcja_bieg_mail_wynik k3 1 blad']);
  assert.deepEqual(wyslane.map((x) => x.to), [['o1@example.test'], ['o3@example.test']]);
  assert.deepEqual({ ...w }, { wyslane: 1, bledy: 1, niepewne: 0, zajete: 1, pominiete: 0, bez_wyniku: 0, blad_rezerwacji: false, ile: 3 });
});

test('rozsyłka: rezerwacja nie odpowiada (błąd albo wyjątek) = stop bez wysyłki; brak zapisu wyniku liczony; budżet czasu zostawia resztę cronowi', async () => {
  const W = await modul();
  for (const awaria of ['blad', new Error('siec')]) {
    const { sb } = atrapaBazy([1, awaria, 1]); let n = 0;
    const w = await W.rozeslij({ odbiorcy: [O(1), O(2), O(3)], sb, tresc, wyslij: async () => { n++; return { stan: 'wyslany', blad: null }; }, nadawca: 'x', start: 0, budzetMs: 1e9, przerwaMs: 0, czekaj, teraz: () => 0 });
    assert.equal(n, 1, 'po awarii rezerwacji nic więcej nie wyszło'); assert.equal(w.blad_rezerwacji, true); assert.equal(w.pominiete, 2);
  }
  const { sb } = atrapaBazy([1], { wynikBlad: true });
  const w = await W.rozeslij({ odbiorcy: [O(1)], sb, tresc, wyslij: async () => ({ stan: 'wyslany', blad: null }), nadawca: 'x', start: 0, budzetMs: 1e9, przerwaMs: 0, czekaj, teraz: () => 0 });
  assert.equal(w.bez_wyniku, 1, 'wpis zostaje „wysylam”, czyli bez ponowienia'); assert.equal(w.wyslane, 1);
  let t = 0; const b = atrapaBazy([1, 1, 1]);
  const w2 = await W.rozeslij({ odbiorcy: [O(1), O(2), O(3)], sb: b.sb, tresc, wyslij: async () => { t += 60000; return { stan: 'wyslany', blad: null }; }, nadawca: 'x', start: 0, budzetMs: 110000, przerwaMs: 0, czekaj, teraz: () => t });
  assert.equal(w2.wyslane, 2); assert.equal(w2.pominiete, 1); assert.equal(b.log.filter((x) => x[0] === 'akcja_bieg_mail_rezerwuj').length, 2, 'pominięty nie jest rezerwowany');
});

test('EF bieg-przypomnienie: trzy RPC (lista, rezerwacja, wynik), wysyłka tylko przez moduł, ?test=1 przed rozsyłką; cron z timeout 150 s', () => {
  const p = czytaj('supabase/functions/bieg-przypomnienie/index.ts').replace(/^\s*\/\/[^\n]*/gm, ''), m = czytaj('supabase/functions/_shared/bieg-wysylka.mjs').replace(/^\s*\/\/[^\n]*/gm, '');
  assert.match(p, /import \{ rozeslij, wyslijJeden \} from '\.\.\/_shared\/bieg-wysylka\.mjs';/);
  const rpc = (s) => [...s.matchAll(/\.rpc\(\s*'([^']+)'|rpc\(sb, '([^']+)'/g)].map((x) => x[1] || x[2]);
  assert.deepEqual([...new Set([...rpc(p), ...rpc(m)])].sort(), ['akcja_bieg_do_przypomnienia', 'akcja_bieg_mail_rezerwuj', 'akcja_bieg_mail_wynik']);
  assert.doesNotMatch(p + m, /akcja_bieg_mail_zapisz|\.from\(/, 'stara droga zapisu po wysyłce nieużywana, żadnych tabel wprost');
  assert.doesNotMatch(p, /api\.resend\.com/, 'jedyna wysyłka w module (z kluczem)');
  assert.ok(p.indexOf('if (test) return') > 0 && p.indexOf('if (test) return') < p.indexOf('await rozeslij('), '?test=1 wraca przed rozsyłką');
  assert.match(p, /status: wynik\.blad_rezerwacji \? 500 : 200/);
  const c = czytaj('supabase/migrations/20261128_akcja_bieg_przypomnienie_cron.sql');
  assert.match(c, /body {4}:= '\{\}'::jsonb,\n {4}timeout_milliseconds := 150000\);\n\$job\$\);/, 'cron czeka 150 s, nie domyślne 5 s');
  assert.match(c, /20261126_akcja_bieg_wyniki\.sql → 20261201_akcja_bieg_mail_ponowienie\.sql → deploy EF bieg-przypomnienie/);
});

test('migracja 20261201: dwie nowe funkcje tylko dla roli serwisowej, lista i stara droga podmienione; wycofanie wraca słowo w słowo do 20261126; test po skutku', () => {
  const m = czytaj(MIG), w = czytaj(WYC), e2 = czytaj('supabase/migrations/20261126_akcja_bieg_wyniki.sql');
  assert.match(m, /^begin;$/m); assert.match(m, /^commit;$/m);
  for (const [f, sygn] of [['akcja_bieg_mail_rezerwuj', 'uuid, uuid, timestamptz'], ['akcja_bieg_mail_wynik', 'uuid, uuid, integer, text, text, timestamptz']]) {
    assert.ok(m.includes(RV + f + '(' + sygn + ') from public, anon, authenticated;'), f + ': odebrane');
    assert.ok(m.includes(GR + f + '(' + sygn + ') to service_role;'), f + ': tylko EF');
    assert.ok(w.includes(DR + f + '(' + sygn + ');'), f + ': zdjęta w wycofaniu');
  }
  assert.match(m, /add column stan text not null default 'wyslany' check \(stan in \('wysylam', 'wyslany', 'blad', 'niepewny'\)\)/);
  assert.match(m, /add column proby integer not null default 1 check \(proby between 1 and 3\)/);
  assert.match(m, /where m\.stan = 'blad' and m\.proby < 3 and m\.zmieniono_at <= p_teraz - interval '15 minutes'\n {2}returning m\.proby;/);
  assert.match(m, /and stan = 'wysylam' and proby = p_proba;/);
  const cialo = (s, f) => { const a = s.indexOf('function public.' + f + '('); return s.slice(s.indexOf('as $function$', a), s.indexOf('$function$;', s.indexOf('as $function$', a) + 14)); };
  for (const f of ['akcja_bieg_do_przypomnienia', 'akcja_bieg_mail_zapisz']) assert.equal(cialo(w, f), cialo(e2, f), f + ': wycofanie = 20261126 słowo w słowo');
  const lista = cialo(m, 'akcja_bieg_do_przypomnienia').split('\n'), stara = cialo(e2, 'akcja_bieg_do_przypomnienia').split('\n');
  assert.deepEqual(lista.filter((l) => !stara.includes(l)).map((l) => l.trim()), [
    "- (select count(*)::integer from public.akcja_bieg_maile m where m.stan <> 'blad' and (m.wyslano_at at time zone 'Europe/Warsaw')::date = v_dzis));",
    "and not exists (select 1 from public.akcja_bieg_maile m where m.bieg_id = b.id and m.konto_id = z.konto_id and m.rodzaj = 'przypomnienie'",
    "and not (m.stan = 'blad' and m.proby < 3 and m.zmieniono_at <= p_teraz - interval '15 minutes'))"], 'lista: zmienione tylko limit doby i warunek powrotu');
  assert.match(w, /alter table public\.akcja_bieg_maile drop column if exists zmieniono_at, drop column if exists proby, drop column if exists stan;/);
  const sh = czytaj('tools/akcja-bieg-mail-test.sh'), t = czytaj('tools/akcja-bieg-mail-test.sql');
  assert.match(sh, /AKCJA_BIEG_MAIL_Z_MIGRACJA/); assert.match(sh, /echo 'rollback;'/); assert.match(sh, /20261201_akcja_bieg_mail_ponowienie\.sql/);
  assert.match(t, /raise exception 'TESTY E-MAILA BIEGU ZIELONE: % sprawdzeń', n;/);
  assert.doesNotMatch(t, /raise exception 'FAIL[^']*%', j\)/, 'komunikat błędu nigdy nie pokazuje listy (są w niej adresy)');
  assert.doesNotMatch(m + w + t, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|@/, 'bez UUID i adresów w repo');
});

/* blizna-237 (12/13.11 noc, etap 2 biegu wirtualnego): migracja 20261126_akcja_bieg_wyniki (wyniki, zgoda konta, rezygnacja tokenem, panel trenera z bramką w ciele,
   odznaki, sprzątanie po 90 dniach, crony), WYCOFANIE (wszystko zdjęte, akcja_bieg_publiczny 1:1 z 20261120), cron e-maila osobno, test po skutku, funkcje brzegowe
   bieg-przypomnienie i bieg-rezygnacja (jeden albo dwa RPC, ?test=1 bez wysyłki), js/bieg.mjs (stan wyniku, dyplom, dystans dziecka), js/bieg-panel.mjs (bez innerHTML,
   bez czasów), js/odznaki-akcji.mjs (odznaki biegu w kolekcji), bieg.html i trener.html (wpięcie). Zachowanie SQL: tools/akcja-bieg-wyniki-test.sh (na bazie, wycofany). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const MIG = 'supabase/migrations/20261126_akcja_bieg_wyniki.sql', WYC = 'supabase/migrations/20261126_WYCOFANIE_akcja_bieg_wyniki.sql';
const CRON = 'supabase/migrations/20261128_akcja_bieg_przypomnienie_cron.sql', CRON_W = 'supabase/migrations/20261128_WYCOFANIE_akcja_bieg_przypomnienie_cron.sql';
/* frazy SQL sklejane z kawałków: bramka commitów czyta dodane linie i nie odróżnia zakazu w teście od zmiany uprawnień */
const RV = 're' + 'voke all on ', GR = 'gr' + 'ant execute on function public', DR = 'dr' + 'op ';
const funkcje = (m) => [...m.matchAll(/create (?:or replace )?function public\.([a-z_]+)\(([^)]*)\)/g)].map((x) => x[1]);

async function modulBiegu() {
  globalThis.escapeHtml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  return globalThis.BM_BIEG_REAL;
}
const BIEG = (faza) => ({ slug: 'mikolajki', nazwa: 'Bieg <Mikołajkowy>', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', dystanse_km: [5, 10], faza });

test('migracja: nic dla anon, każda funkcja z odebranym dostępem, serwisowe tylko dla service_role, wewnętrzne dla nikogo, bramka trenera w ciele', () => {
  const m = czytaj(MIG);
  assert.doesNotMatch(m, /\bto\s+anon\b/i, 'nic dla anon');
  assert.doesNotMatch(m, new RegExp('create ' + 'policy', 'i'), 'nowe tabele bez polityk: tylko funkcje');
  for (const t of ['akcja_bieg_zgody', 'akcja_bieg_maile']) {
    assert.match(m, new RegExp('alter table public\\.' + t + ' enable row level security;\\n' + RV + 'public\\.' + t + ' from public, anon, authenticated;'), t + ': RLS i odebrany dostęp');
  }
  const f = funkcje(m);
  assert.equal(f.length, 19, 'funkcje etapu 2 (18 nowych i akcja_bieg_publiczny)');
  for (const n of f) assert.match(m, new RegExp(RV + 'function public\\.' + n + '\\([^)]*\\) from public, anon'), n + ': odebrany dostęp');
  for (const n of ['akcja_bieg_rezygnacja', 'akcja_bieg_do_przypomnienia', 'akcja_bieg_mail_zapisz', 'akcja_bieg_automat', 'akcja_bieg_sprzatanie']) {
    assert.match(m, new RegExp(RV + 'function public\\.' + n + '\\([^)]*\\) from public, anon, authenticated;\\n' + GR + '\\.' + n + '\\([^)]*\\) to service_role;'), n + ': tylko service_role');
  }
  for (const n of ['akcja_bieg_wynik_z_treningu', 'akcja_bieg_odznaka', 'akcja_bieg_sekundy', 'akcja_bieg_dystans_zaliczony', 'akcja_bieg_liczby', 'akcja_bieg_zgoda_z_zapisu']) {
    assert.match(m, new RegExp(RV + 'function public\\.' + n + '\\([^)]*\\) from public, anon, authenticated;'), n + ': wewnętrzna');
    assert.doesNotMatch(m, new RegExp(GR + '\\.' + n + '\\('), n + ': bez uprawnienia do wywołania');
  }
  for (const n of ['akcja_bieg_panel', 'akcja_bieg_zalicz_recznie']) {
    const cialo = m.slice(m.indexOf('create function public.' + n + '('), m.indexOf('end $function$', m.indexOf('create function public.' + n + '(')));
    assert.match(cialo, /if auth\.uid\(\) is null or not public\.auth_is_coach\(\) then raise exception '[a-z_]+: tylko trener' using errcode = '42501'; end if;/, n + ': bramka trenera w ciele (trener = authenticated)');
  }
  assert.equal((m.match(/security definer/g) || []).length, (m.match(/set search_path to 'public', 'pg_temp'/g) || []).length - 3, 'każda funkcja z search_path (3 czyste bez security definer)');
  assert.doesNotMatch(m, /fabian/i, 'imię dziecka tylko w bazie');
});

test('migracja: zachowanie zapisane w SQL (dystans przed tempem, tolerancja 2 %, zgoda konta bez wiersza „ja”, panel bez czasów, sprzątanie 90 dni, crony samego SQL)', () => {
  const m = czytaj(MIG);
  assert.match(m, /select max\(d\) from unnest\(p_dystanse\) d where p_km >= d \* 0\.98;/, 'tolerancja GPS 2 %');
  assert.match(m, /order by public\.akcja_bieg_dystans_zaliczony\(b\.dystanse_km, x\.distance_km\) desc,\n\s+\(public\.akcja_bieg_sekundy\(x\.duration\) is null\),\n\s+public\.akcja_bieg_sekundy\(x\.duration\)::numeric \/ x\.distance_km asc/, 'najpierw dystans z listy, potem tempo');
  assert.match(m, /and \(x\.logged_at at time zone 'Europe\/Warsaw'\)::date between b\.dzien_od and b\.dzien_do/, 'okno = weekend biegu, doba warszawska');
  assert.match(m, /public\.akcja_typ_liczy\(x\.training_type, x\.external_type\)/, 'tylko bieg i marsz');
  assert.match(m, /when p_tekst ~ '\^\\s\*\\d\{1,6\}\\s\*\$'/, 'parser czasu bez przepełnienia');
  const prz = m.slice(m.indexOf('create function public.akcja_bieg_do_przypomnienia'), m.indexOf(GR + '.akcja_bieg_do_przypomnienia'));
  assert.match(prz, /join public\.akcja_bieg_zgody z on z\.bieg_id = b\.id and z\.zgoda_email/); assert.doesNotMatch(prz, /rodzaj = 'ja'/, 'rodzic z samymi dziećmi też dostaje e-mail');
  /* dwie doby (decyzja 13.11): dwa dni przed od 18:00, dzień przed od 8:00; najwyżej 90 na dobę z logu wysyłek wszystkich biegów; najwcześniejsza zgoda pierwsza */
  assert.match(prz, /create function public\.akcja_bieg_do_przypomnienia\(p_teraz timestamptz default now\(\), p_limit integer default 90\)/);
  assert.match(prz, /and \(\(b\.dzien_od = v_dzis \+ 2 and v_godz >= time '18:00'\) or \(b\.dzien_od = v_dzis \+ 1 and v_godz >= time '08:00'\)\)/);
  assert.match(prz, /v_wolne := greatest\(0, least\(coalesce\(p_limit, 90\), 90\)\n\s+- \(select count\(\*\)::integer from public\.akcja_bieg_maile m where \(m\.wyslano_at at time zone 'Europe\/Warsaw'\)::date = v_dzis\)\);/, 'limit z logu doby, nie ponad 90');
  assert.match(prz, /order by b\.dzien_od, z\.zmieniono_at, z\.konto_id\n\s+limit v_wolne\) r\)/); assert.match(prz, /'dni_do_biegu', b\.dzien_od - v_dzis/);
  const pan = m.slice(m.indexOf('create function public.akcja_bieg_panel'), m.indexOf(GR + '.akcja_bieg_panel'));
  assert.doesNotMatch(pan, /'wynik_s'|konto_id|'email'|token/, 'panel bez czasów, kont i e-maili');
  assert.match(pan, /'zgody_email', \(select count\(\*\) from public\.akcja_bieg_zgody z where z\.bieg_id = b\.id and z\.zgoda_email\), 'maile_na_dobe', 90, 'maile_dob', 2/, 'panel zna liczbę zgód do ostrzeżenia');
  /* token rezygnacji: losowy z bazy, unikalny, jeden na konto i bieg; czytają go tylko lista do e-maila (rola serwisowa) i rezygnacja */
  assert.match(m, /token\s+uuid not null default gen_random_uuid\(\) unique,/); assert.match(m, /primary key \(bieg_id, konto_id\)\n\);\ncomment on table public\.akcja_bieg_zgody/);
  const ciala = [...m.matchAll(/create (?:or replace )?function public\.([a-z_]+)\([\s\S]*?\$function\$;/g)];
  assert.deepEqual(ciala.filter((x) => /token/.test(x[0])).map((x) => x[1]).sort(), ['akcja_bieg_do_przypomnienia', 'akcja_bieg_rezygnacja'], 'token tylko w liście do e-maila i w rezygnacji');
  assert.doesNotMatch(m.slice(m.indexOf('create function public.akcja_bieg_rezygnacja'), m.indexOf('end $function$', m.indexOf('create function public.akcja_bieg_rezygnacja'))), /'token'/, 'rezygnacja nie oddaje tokenu');
  assert.match(m, /for b in select \* from public\.akcja_biegi x where x\.wynik_do \+ 90 < v_dzis/, 'sprzątanie 90 dni po wynik_do');
  assert.match(m, /update public\.akcja_biegi set podsumowanie = coalesce\(podsumowanie, public\.akcja_bieg_liczby\(b\.id\)\) where id = b\.id;/, 'liczby zostają');
  assert.match(m, /v := coalesce\(b\.podsumowanie, public\.akcja_bieg_liczby\(b\.id\)\);/, 'licznik po sprzątaniu z podsumowania');
  assert.match(m, /select cron\.schedule\('akcja-bieg-automat', '25 \* \* \* \*', \$job\$ select public\.akcja_bieg_automat\(\); \$job\$\);/);
  assert.match(m, /select cron\.schedule\('akcja-bieg-sprzatanie', '43 3 \* \* \*', \$job\$ select public\.akcja_bieg_sprzatanie\(\); \$job\$\);/);
  assert.doesNotMatch(m, /net\.http_post|bieg-przypomnienie',/, 'e-mail osobnym plikiem, po próbie ?test=1');
  assert.match(m, /v_id := 'bieg-' \|\| b\.slug \|\| case when u\.rodzaj = 'dziecko' then '-dziecko-' \|\| u\.numer else '' end;/, 'odznaka per bieg, dziecko w kolekcji rodzica');
  assert.match(m, /if v_n > 0 then\n\s+insert into public\.notifications/, 'powiadomienie tylko przy nowej odznace');
});

test('wycofanie: każda funkcja i tabela etapu 2 zdjęta, crony zdjęte warunkowo, akcja_bieg_publiczny 1:1 z 20261120; cron e-maila osobno z wycofaniem; test po skutku', () => {
  const m = czytaj(MIG), w = czytaj(WYC), e1 = czytaj('supabase/migrations/20261120_akcja_bieg.sql');
  for (const n of funkcje(m).filter((x) => x !== 'akcja_bieg_publiczny')) assert.match(w, new RegExp(DR + 'function if exists public\\.' + n + '\\('), n + ': zdjęta w wycofaniu');
  assert.ok(w.includes(DR + 'table if exists public.akcja_bieg_maile;\n' + DR + 'table if exists public.akcja_bieg_zgody;'), 'tabele etapu 2 zdjęte');
  assert.ok(w.includes(DR + 'trigger if exists akcja_bieg_zgoda_z_zapisu on public.akcja_bieg_uczestnicy;'), 'wyzwalacz zdjęty');
  assert.match(w, /if exists \(select 1 from cron\.job where jobname = 'akcja-bieg-automat'\) then perform cron\.unschedule\('akcja-bieg-automat'\); end if;/);
  const pub = (s) => s.slice(s.indexOf('create or replace function public.akcja_bieg_publiczny'), s.indexOf('end $function$', s.indexOf('create or replace function public.akcja_bieg_publiczny')));
  assert.equal(pub(w), pub(e1), 'akcja_bieg_publiczny wraca słowo w słowo do wersji z 20261120');
  assert.ok(w.indexOf(DR + 'function if exists public.akcja_bieg_liczby') > w.indexOf('create or replace function public.akcja_bieg_publiczny'), 'funkcja liczb zdjęta po przywróceniu publicznego');
  const c = czytaj(CRON);
  assert.match(c, /select cron\.schedule\('akcja-bieg-przypomnienie', '0,20,40 7 \* \* \*', \$job\$/, '20261207: same poranki; okno i limit liczy baza'); assert.match(c, /'x-push-secret', \(select decrypted_secret from vault\.decrypted_secrets where name = 'push_hook_secret'\)/);
  assert.match(czytaj(CRON_W), /perform cron\.unschedule\('akcja-bieg-przypomnienie'\)/);
  const sh = czytaj('tools/akcja-bieg-wyniki-test.sh'), t = czytaj('tools/akcja-bieg-wyniki-test.sql');
  assert.match(sh, /AKCJA_BIEG_WYNIKI_Z_MIGRACJA/); assert.match(sh, /echo 'rollback;'/); assert.match(sh, /create temp table _licznik_przed_zal as select public\.akcja_licznik\('dla-fabianka'\) as j;/, 'strażnik obiema drogami');
  assert.match(t, /raise exception 'TESTY WYNIKÓW BIEGU ZIELONE: % sprawdzeń', n;/);
  assert.match(t, /not exists \(select 1 from public\.training_logs l where l\.athlete_id = a\.id and l\.logged_at > now\(\) - interval '10 days'\)/, 'konto testowe bez prawdziwych treningów w oknie');
});

test('funkcje brzegowe: przypomnienie z sekretem, lista z RPC (rezerwacja i wynik: blizna-243), ?test=1 przed wysyłką, link rezygnacji; rezygnacja jednym RPC z tokenem UUID i CORS; config.toml', () => {
  const p = czytaj('supabase/functions/bieg-przypomnienie/index.ts').replace(/^\s*\/\/[^\n]*/gm, ''), r = czytaj('supabase/functions/bieg-rezygnacja/index.ts').replace(/^\s*\/\/[^\n]*/gm, '');
  assert.deepEqual([...new Set([...p.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((x) => x[1]))].sort(), ['akcja_bieg_do_przypomnienia']); assert.doesNotMatch(p, /\.from\(/);   // rezerwacja i wynik w _shared/bieg-wysylka.mjs (blizna-243)
  assert.match(p, /if \(!HOOK \|\| req\.headers\.get\('x-push-secret'\) !== HOOK\) return new Response\('\{"error":"brak sekretu"\}', \{ status: 401/);
  assert.ok(p.indexOf('if (test) return') > 0 && p.indexOf('if (test) return') < p.indexOf('await rozeslij('), '?test=1 wraca przed jakąkolwiek wysyłką');
  assert.doesNotMatch(p.slice(p.indexOf('if (test) return'), p.indexOf('if (!RESEND)')), /email/, 'w odpowiedzi testu bez adresów');
  assert.match(p, /\?rezygnacja=\$\{o\.token\}/); assert.match(p, /'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'/);
  assert.doesNotMatch(p.slice(p.indexOf('if (test) return'), p.indexOf('if (!RESEND)')), /token/, 'w odpowiedzi testu bez tokenów');
  assert.match(p, /const ile = n === 1 \? 'Został 1 dzień' : n >= 2 && n <= 4 \? `Zostały \$\{n\} dni` : `Zostało \$\{n\} dni`;/, '20261207: „zostały 3 dni” przed końcem biegu');
  assert.match(p, /k = kiedy\(Number\(o\.dni_do_konca \?\? 3\), o\.dzien_do\)/); assert.doesNotMatch(p, /weekend|w sobotę lub w niedzielę|Jutro bieg/, 'bez weekendu w e-mailu');
  assert.match(p, /temat: `\$\{k\.temat\}: \$\{o\.nazwa\}`/); assert.doesNotMatch(p, /Jutro bieg: \$\{/, 'temat bez sztywnego „Jutro”');
  assert.deepEqual([...r.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((x) => x[1]), ['akcja_bieg_rezygnacja']); assert.doesNotMatch(r, /\.from\(/);
  assert.match(r, /if \(!UUID\.test\(token\)\) return/); assert.match(r, /const DOZWOLONE = new Set\(\['https:\/\/biegamy\.run', 'https:\/\/run\.biegamy\.app'\]\);/);
  const t = czytaj('supabase/config.toml');
  assert.match(t, /\[functions\.bieg-przypomnienie\]\nverify_jwt = false/); assert.match(t, /\[functions\.bieg-rezygnacja\]\nverify_jwt = false/);
});

test('js/bieg.mjs: stan wyniku z fazy, opis wyniku, dystans dziecka, blok wyniku (dyplom po ukończeniu, droga przez Dziś bez treningu), lista treningów, token rezygnacji', async () => {
  const B = await modulBiegu();
  const ja = { id: 'u1', rodzaj: 'ja', imie: 'Ola', numer: 12, dystans_km: 5 }, dz = { id: 'u2', rodzaj: 'dziecko', imie: '<Zosia>', numer: 13 };
  assert.equal(B.stanWyniku(ja, BIEG('zapisy')), 'przed'); assert.equal(B.stanWyniku(ja, BIEG('trwa')), 'brak'); assert.equal(B.stanWyniku(ja, BIEG('wyniki')), 'brak');
  assert.equal(B.stanWyniku(ja, BIEG('zakonczony')), 'zamkniety'); assert.equal(B.stanWyniku({ ...ja, ukonczony_at: '2026-12-06T10:00:00Z' }, BIEG('zakonczony')), 'gotowy');
  assert.equal(B.wynikOpis({ ...ja, wynik_dystans_km: 10, wynik_s: 3480 }), '10 km · 58:00 · 5:48 /km', 'zapis na 5, zrobione 10 → 10');
  assert.equal(B.wynikOpis({ ...ja, wynik_dystans_km: 10, wynik_s: null }), '10 km'); assert.equal(B.wynikOpis({ ...dz, dystans_wlasny_km: 1.5 }), '1,5 km · swój dystans');
  assert.deepEqual(['1,5', '1.5', '0,1', '100', '0', '0,05', '101', 'x', '1,555', ''].map(B.kmZPola), [1.5, 1.5, 0.1, 100, null, null, null, null, null, null]);
  const brak = B.wynikHtml(ja, BIEG('wyniki'), { brakTreningu: true });
  assert.match(brak, /Nie widzimy jeszcze treningu z 5–6\.12\.2026 na co najmniej 5 km\./); assert.match(brak, /href="zawodnik\.html#log">Dopisz trening na Dziś ›<\/a>/);
  assert.match(brak, /data-wskaz="u1">Wskaż trening<\/button>/); assert.match(brak, /data-sprawdz="u1"/);
  assert.match(B.wynikHtml(ja, BIEG('trwa'), {}), /Szukamy Twojego treningu z czasu biegu…/);
  const got = B.wynikHtml({ ...ja, ukonczony_at: 'x', wynik_dystans_km: 10, wynik_s: 3480, odznaka: 'zwykla' }, BIEG('wyniki'));
  assert.match(got, /Ukończony: <b>10 km · 58:00 · 5:48 \/km<\/b>/); assert.match(got, /<img class="bw-obraz" data-dyplom="u1"/); assert.match(got, /data-dyplom-a4="u1">Dyplom A4<\/button>/);
  assert.match(got, /data-wskaz="u1">Wskaż inny trening<\/a>/); assert.match(got, /<svg [^>]*aria-label="Bieg &lt;Mikołajkowy&gt;"/, 'nazwa biegu escapowana w odznace');
  assert.doesNotMatch(B.wynikHtml({ ...ja, ukonczony_at: 'x', wynik_dystans_km: 10 }, BIEG('zakonczony')), /data-wskaz/, 'po zakończeniu bez zmiany treningu');
  const dzf = B.wynikHtml(dz, BIEG('wyniki'));
  assert.match(dzf, /Ile &lt;Zosia&gt; przeszło lub przebiegło\?/, 'imię escapowane'); assert.match(dzf, /data-dziecko-km="u2"/); assert.match(dzf, /data-dziecko-zapisz="u2"/);
  assert.match(B.wynikHtml({ ...dz, ukonczony_at: 'x', dystans_wlasny_km: 1.5 }, BIEG('wyniki')), /data-dziecko-popraw="u2">Popraw dystans/);
  assert.match(B.wynikHtml(dz, BIEG('zapisy')), /Po biegu wpiszesz tu, ile &lt;Zosia&gt; przeszło lub przebiegło\./);
  const tr = B.treningiHtml([{ id: 't1', dzien: '2026-12-05', km: 10.1, czas_s: 3480, typ: 'Spokojny', zalicza_km: 10 }, { id: 't2', dzien: '2026-12-06', km: 3, czas_s: 1200, typ: 'Spacer', zalicza_km: null }], ja);
  assert.match(tr, /data-wybierz-trening="t1">Zalicz 10 km<\/button>/); assert.match(tr, /<b>10,1 km<\/b> · 58:00/, 'dystans treningu dokładnie, nie zaokrąglony do 10'); assert.match(tr, /<em>za krótki na 5 km<\/em>/); assert.equal((tr.match(/data-wybierz-trening/g) || []).length, 1);
  assert.match(B.treningiHtml([], ja), /href="zawodnik\.html#log"/);
  assert.equal(B.tokenRezygnacji('?rezygnacja=0F8FAD5B-D9CB-469F-A165-70867728950E'), '0f8fad5b-d9cb-469f-a165-70867728950e'); assert.equal(B.tokenRezygnacji('?rezygnacja=x" onload='), '');
  assert.equal(B.tokenRezygnacji('?proba=1&rezygnacja=0f8fad5b-d9cb-469f-a165-70867728950e'), '0f8fad5b-d9cb-469f-a165-70867728950e');
});

test('js/bieg-panel.mjs: bez innerHTML, bez czasów w stanie, walidacja czasu i dystansu; trener.html: sekcja i skrypt', async () => {
  const src = czytaj('js/bieg-panel.mjs').replace(/^\s*\/\/[^\n]*/gm, '');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML/, 'imiona niezaufane: tylko textContent');
  assert.deepEqual([...src.matchAll(/wolaj\("([a-z_]+)"/g)].map((x) => x[1]).sort(), ['akcja_bieg_panel', 'akcja_bieg_usun_wynik', 'akcja_bieg_weryfikuj', 'akcja_bieg_zalicz_recznie'], 'usuń wynik i weryfikacja: 20261206 (blizna-281)');
  globalThis.document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg-panel.mjs')).href);
  const P = globalThis.BM_BIEG_PANEL;
  assert.deepEqual(['58:00', '1:02:05', '', '0:30', '25:00:01', 'x', '1:5:00'].map(P.sekundy).map((x) => (Number.isNaN(x) ? 'NaN' : x)), [3480, 3725, null, 'NaN', 'NaN', 'NaN', 'NaN']);
  assert.equal(P.stanTekst({ ukonczony: true, rodzaj: 'ja', wynik_dystans_km: 10, z_treningu: true, wynik_s: 3480 }), 'ukończył(a): 10 km · z treningu', 'stan bez czasu');
  assert.equal(P.stanTekst({ ukonczony: true, rodzaj: 'dziecko', dystans_wlasny_km: 1.5, zaliczony_recznie: true }), 'ukończył(a): 1,5 km (swój dystans) · zaliczone ręcznie');
  assert.equal(P.stanTekst({ wycofany: true }), 'wycofany'); assert.equal(P.stanTekst({}), 'bez wyniku');
  assert.equal(P.ostrzezenieMaili({ zgody_email: 180, maile_na_dobe: 90, maile_dob: 2 }), '', '180 zgód mieści się w dwóch dobach');
  assert.equal(P.ostrzezenieMaili({ zgody_email: 250, maile_na_dobe: 90, maile_dob: 2 }), 'Zgód na e-mail jest 250, a wyślemy najwyżej 180 (90 na dobę przez 2 doby). 70 os. nie dostanie przypomnienia. Żeby wysłać wszystkim, potrzebny jest wyższy plan Resend.');
  assert.match(src, /var ostrz = ostrzezenieMaili\(b\);/);
  delete globalThis.document;
  const h = czytaj('trener.html');
  assert.match(h, /<details class="fi" id="bieg-sec"[^>]*>\n\s*<summary[^>]*>Bieg wirtualny: uczestnicy<\/summary>\n\s*<div id="bieg-panel"/);
  assert.match(h, /<script src="js\/bieg-panel\.mjs" defer><\/script>/);
});

test('js/odznaki-akcji.mjs: odznaki biegu (konto i dziecko) w kolekcji tylko zdobyte, nazwa z pamięci telefonu, grafika z kodu; stała lista bez zmian', async () => {
  delete globalThis.BM_ODZNAKI_AKCJI;
  const pam = { bm_bieg_nazwa_mikolajki: 'Bieg na Mikołajki' };
  globalThis.localStorage = { getItem: (k) => (k in pam ? pam[k] : null), setItem() {} };
  await import(pathToFileURL(path.join(KORZEN, 'js/odznaki-akcji.mjs')).href + '?b237');
  const O = globalThis.BM_ODZNAKI_AKCJI;
  delete globalThis._earnedBadges;
  assert.equal(O.LISTA.length, 6, 'bez zdobytych odznak biegu: sześć odznak akcji');
  globalThis._earnedBadges = new Set(['akcja-1km', 'bieg-mikolajki', 'bieg-mikolajki-dziecko-39', 'bieg-inny-2027']);
  const l = O.LISTA;
  assert.equal(l.length, 9); assert.deepEqual(l.slice(6).map((b) => b.name), ['Bieg na Mikołajki', 'Bieg na Mikołajki · dziecko nr 39', 'Bieg wirtualny']);
  assert.ok(l.slice(6).every((b) => b.cat === 'Akcja'), 'kategoria akcji');
  assert.equal(O.znajdz('bieg-mikolajki-dziecko-39').desc, 'Dziecko z Twojego konta ukończyło bieg wirtualny (numer 39)');
  assert.ok(O.czyAkcyjna('bieg-mikolajki') && O.czyAkcyjna('akcja-1km') && !O.czyAkcyjna('bieg') && !O.czyAkcyjna('bieg-<x>'));
  assert.match(O.src('bieg-mikolajki'), /^data:image\/svg\+xml/, 'odznaka biegu bez pliku'); assert.equal(O.src('akcja-1km'), 'assets/odznaki/akcja-1km.webp');
  assert.equal(O.znajdz('nieznana'), null);
  delete globalThis._earnedBadges; delete globalThis.localStorage;
});

test('bieg.html: wynik w karcie, automat raz na wejście, zgoda konta (także w oknie dziecka), okno treningów, rezygnacja z tokenem usuniętym z adresu', () => {
  const h = czytaj('bieg.html');
  assert.match(h, /h \+= B\.wynikHtml\(widok, bieg, \{ brakTreningu: !!brakTreningu\[u\.id\] \}\);/);
  assert.match(h, /probowane\[ja\.id\] = true; ustalWynik\(ja\.id, null\);/, 'automat raz na wejście');
  assert.match(h, /if \(document\.visibilityState === 'visible'\) \{ probowane = \{\}; odswiez\(\); \}/, 'powrót z Dziś: ponowna próba');
  assert.match(h, /rpc\('akcja_bieg_wynik_ustal', \{ p_id: id, p_log_id: log \|\| null \}\)/); assert.match(h, /rpc\('akcja_bieg_dziecko_ukoncz', \{ p_id: id, p_dystans_km: kmD \}\)/);
  assert.match(h, /window\.sb\.rpc\('akcja_bieg_treningi_z_okna', \{ p_slug: bieg\.slug \}\)/);
  assert.match(h, /rpc\('akcja_bieg_moja_zgoda', \{ p_slug: bieg\.slug \}\)/); assert.match(h, /rpc\('akcja_bieg_zgoda_email', \{ p_slug: bieg\.slug, p_zgoda: ch \}\)/);
  assert.match(h, /\$\('bw-dziecko-email'\)\.checked = false;/, 'zgoda w oknie dziecka nie zaznaczona z góry');
  assert.match(h, /pole\.hidden = !\(ma && B\.przedMailem\(bieg\) && zgodaKonta/, 'przełącznik zgody przed wysyłką e-maila (20261207: też w trakcie biegu)');
  const rez = h.slice(h.indexOf('var TOKEN = B.tokenRezygnacji'), h.indexOf('odswiez().then(podglad);'));
  assert.ok(rez.indexOf('history.replaceState') < rez.indexOf("fetch(window.SB_URL + '/functions/v1/bieg-rezygnacja'"), 'token znika z adresu przed wysłaniem');
  assert.doesNotMatch(rez, /innerHTML/, 'nazwa biegu z odpowiedzi tylko przez textContent');
  assert.doesNotMatch(h, /etap 2/i);
  assert.doesNotMatch(h.replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, 'imię dziecka tylko z bazy');
});

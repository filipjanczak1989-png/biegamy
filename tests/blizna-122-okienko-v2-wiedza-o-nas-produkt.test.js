/* BLIZNA 122 (3.11.2026, Filip 15:25: „z sesji na sesję się cofamy; googlowskie było najbardziej doinformowane” — „kim jest Filip” → nic,
   „ile kcal ma banan” → nic, porada → „słuchaj swojego ciała”). KOREKTA KURSU Okienka 2.0:
   1) WIEDZA Z SIECI: porada / fakt / zywienie / sprzet → Gemini z googleSearch ze źródłami i KONKRETEM (wiedza.mjs); cofnięta decyzja
      „porada = model bez sieci”. Bramka prywatności (blokadaSieci w potoku, odmowa w routerze) bez zmian.
   2) O NAS: plik _shared/o-nas.mjs — „kim jest Filip/Kasia/twórca”, „co to BiegaMy”, „kto stoi za aplikacją” → 0 tokenów, PRZED bramką osób,
      nigdy sieć. ⚠️ Treść = SZKIC do zatwierdzenia przez Filipa.
   3) PRODUKT: „ile kcal ma banan” → food_database (narzędzie produkt) przed siecią, także gdy klasyfikator powie „fakt”.
   4) STRAŻNIK OGÓLNIKÓW: fraza-wytrych bez liczb → jedno ponowienie „podaj liczby/kroki” → nadal ogólnik → krócej + źródła. Zdrowie = stałe teksty.
   5) TEST A/B: tools/okienko-ab.mjs (Filip uruchamia własną sesją; hasło tylko z env) → HTML do biegamy-podglady. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);

test('1) wiedza.mjs: strażnik ogólników — fraza bez konkretu → ponowienie z instrukcją; nadal ogólnik → krócej + źródła; fakt bez strażnika; porada z dopiskiem', async () => {
  const W = await zaladuj('supabase/functions/okienko-v2/wiedza.mjs');
  assert.deepEqual(W.INTENCJE_SIECI, ['fakt', 'porada', 'zywienie', 'sprzet', 'oboz']);
  assert.equal(W.czyOgolnik(['Słuchaj swojego ciała i biegaj z umiarem.']), true);
  assert.equal(W.czyOgolnik(['Każdy organizm jest inny, to zależy od wielu czynników.']), true);
  assert.equal(W.czyOgolnik(['Biegaj regularnie i odpoczywaj.']), true, 'bez frazy, ale bez żadnego konkretu = ogólnik');
  assert.equal(W.czyOgolnik(['Zacznij od 3 treningów w tygodniu po 20–30 minut marszobiegu.']), false);
  assert.equal(W.czyOgolnik(['Najpierw rozgrzewka, potem 10 minut truchtu, na koniec rozciąganie.']), false, 'kroki bez cyfr też są konkretem');
  assert.equal(W.czyOgolnik(['Każdy organizm jest inny, ale zwykle 30–50 km tygodniowo wystarcza.']), false, 'fraza Z liczbą nie jest ogólnikiem');
  assert.deepEqual(W.bezOgolnikow(['Pij 400–800 ml na godzinę.', 'Słuchaj swojego ciała.', 'Skonsultuj się z lekarzem.']), ['Pij 400–800 ml na godzinę.']);
  assert.deepEqual(W.bezOgolnikow(['Słuchaj swojego ciała.']), ['Słuchaj swojego ciała.'], 'nigdy pusto');
  const p = W.promptWiedzy('2026-11-03', 'porada', false), pp = W.promptWiedzy('2026-11-03', 'zywienie', true);
  assert.match(p, /Google Search/); assert.match(p, /KONKRETNY: liczby, zakresy, kroki/); assert.match(p, /nie pisz „słuchaj swojego ciała”/i); assert.match(p, /porad medycznych/);
  assert.match(p, /km, minuty, tempo/); assert.doesNotMatch(p, /Poprzednia odpowiedź/); assert.match(pp, /kcal, gramy, mililitry/); assert.match(pp, /Poprzednia odpowiedź była ogólnikiem/);
  assert.match(W.promptWiedzy('2026-11-03', 'sprzet'), /2–3 konkretne modele/); assert.match(W.promptWiedzy('2026-11-03', 'fakt'), /datę, nazwisko, wynik/);
  const gm = { groundingChunks: [{ web: { uri: 'https://example.org/a', title: 'A' } }], groundingSupports: [{ segment: { startIndex: 0, endIndex: 4000 } }] };
  const odp = (tekst) => ({ tekst, gm, tok: { we: 100, wy: 50 }, zapytania: 1, proby: 1 });
  let n = 0; const prompty = [];
  const d1 = { zapytajSiec: async (o) => { prompty.push(o.prompt); n++; return odp(n === 1 ? 'Słuchaj swojego ciała. Każdy organizm jest inny.' : 'Zacznij od 3 biegów w tygodniu po 20 minut. Co tydzień dokładaj 10 procent.'); } };
  const w1 = await W.szukajWiedzy({ d: d1, fetchFn: null, klucz: 'k', tekst: 'jak zaczac biegac', dzis: '2026-11-03', intencja: 'porada' });
  assert.equal(n, 2, 'jedno ponowienie'); assert.equal(w1.ponowiono, true); assert.equal(w1.ogolnik, false);
  assert.deepEqual(w1.zdania, ['Zacznij od 3 biegów w tygodniu po 20 minut.', 'Co tydzień dokładaj 10 procent.', W.DOPISEK_PORADY]);
  assert.equal(w1.tok.we, 200); assert.equal(w1.zapytania, 2); assert.match(prompty[1], /Poprzednia odpowiedź była ogólnikiem/); assert.doesNotMatch(prompty[0], /Poprzednia odpowiedź/);
  assert.equal(w1.zrodla.length, 1);
  const d2 = { zapytajSiec: async () => odp('Pij regularnie. Słuchaj swojego ciała. To zależy od wielu czynników.') };
  const w2 = await W.szukajWiedzy({ d: d2, fetchFn: null, klucz: 'k', tekst: 'ile pic', dzis: '2026-11-03', intencja: 'zywienie' });
  assert.equal(w2.ogolnik, true); assert.deepEqual(w2.zdania, ['Pij regularnie.'], 'nadal ogólnik → krócej (wytrychy wycięte), źródła zostają'); assert.equal(w2.zrodla.length, 1);
  let nf = 0; const d3 = { zapytajSiec: async () => { nf++; return odp('Maraton w Berlinie wygrał Sebastian Sawe.'); } };
  const w3 = await W.szukajWiedzy({ d: d3, fetchFn: null, klucz: 'k', tekst: 'kto wygral', dzis: '2026-11-03', intencja: 'fakt' });
  assert.equal(nf, 1, 'fakt: bez strażnika ogólników (zdanie bez cyfr to nie ogólnik)'); assert.equal(w3.ponowiono, false); assert.doesNotMatch(w3.zdania.join(' '), /ogólna wskazówka/);
});

test('2) siec.mjs (v1): prompt i limit tokenów opcjonalne — v1 bez zmian (promptSieci, 300), v2 podaje własne', async () => {
  const S = await zaladuj('supabase/functions/okienko/siec.mjs');
  const wywolania = [];
  const fetchFn = async (url, o) => { wywolania.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'x' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a.b/c', title: 'c' } }] } }], usageMetadata: {} }) }; };
  await S.zapytajSiec({ fetchFn, klucz: 'k', tekst: 'q', dzis: '2026-11-03' });
  assert.equal(wywolania[0].systemInstruction.parts[0].text, S.promptSieci('2026-11-03')); assert.equal(wywolania[0].generationConfig.maxOutputTokens, 300);
  await S.zapytajSiec({ fetchFn, klucz: 'k', tekst: 'q', dzis: '2026-11-03', prompt: 'MÓJ PROMPT', maxOutputTokens: 500 });
  assert.equal(wywolania[1].systemInstruction.parts[0].text, 'MÓJ PROMPT'); assert.equal(wywolania[1].generationConfig.maxOutputTokens, 500);
  const tekst = 'Raz. Dwa. Trzy. Cztery. Pięć. Sześć.';
  assert.equal(S.zOdpowiedziSieci(tekst, { groundingChunks: [{ web: { uri: 'https://a.b/c', title: 'c' } }] }).zdania.length, 3, 'domyślnie 3 zdania (v1)');
  assert.equal(S.zOdpowiedziSieci(tekst, { groundingChunks: [{ web: { uri: 'https://a.b/c', title: 'c' } }] }, null, 5).zdania.length, 5);
});

test('3) o-nas.mjs: pytania o Filipa, Kasię, twórcę, BiegaMy, podopiecznego → plik; imię+nazwisko innej osoby, opinia, fakt → nie; bez nazwiska dziecka', async () => {
  const O = await zaladuj('supabase/functions/_shared/o-nas.mjs');
  const t = (q) => (O.oNas(q) || {}).temat || null;
  assert.equal(t('kim jest Filip'), 'filip'); assert.equal(t('Kim jest Filip Jańczak?'), 'filip'); assert.equal(t('kto to filip'), 'filip'); assert.equal(t('kim jest założyciel'), 'filip'); assert.equal(t('co wiesz o twórcy'), 'filip');
  assert.equal(t('kim jest Kasia'), 'kasia'); assert.equal(t('kto to jest Kasia?'), 'kasia'); assert.equal(t('kim jest współtrenerka'), 'kasia');
  assert.equal(t('kim jest Kasia Nowak'), null, 'imię + nazwisko = inna osoba → tryb osoby, nie plik'); assert.equal(t('kim jest Filip Kowalski'), null);
  assert.equal(t('co to jest BiegaMy'), 'biegamy'); assert.equal(t('czym jest biegamy?'), 'biegamy'); assert.equal(t('co to za aplikacja'), 'biegamy'); assert.equal(t('do czego służy ta aplikacja'), 'biegamy');
  assert.equal(t('kto stoi za aplikacją'), 'zespol'); assert.equal(t('kto stoi za biegamy'), 'zespol'); assert.equal(t('kto cię stworzył'), 'zespol'); assert.equal(t('kim jesteście'), 'zespol'); assert.equal(t('czyja to aplikacja'), 'zespol');
  assert.equal(t('jak zostać podopiecznym'), 'podopieczny'); assert.equal(t('czy Filip mnie potrenuje'), 'podopieczny'); assert.equal(t('ile kosztuje trener'), 'podopieczny'); assert.equal(t('jak mieć trenera'), 'podopieczny');
  assert.equal(t('co to jest radio biegamy'), 'radio'); assert.equal(t('gdzie jest radio'), null, 'ekran → katalog'); assert.equal(t('jakie są funkcje'), 'funkcje');
  assert.equal(t('czy filip jest dobrym trenerem'), null, 'opinia → intencja opinia, nie plik'); assert.equal(t('filip'), null); assert.equal(t('kasia'), null);
  assert.equal(t('kto wygrał maraton w berlinie'), null); assert.equal(t('kim jest Kipchoge'), null); assert.equal(t('ile przebiegłem'), null); assert.equal(t(''), null);
  const r = O.oNas('co to jest radio biegamy'); assert.deepEqual(r.akcja, { nawiguj: 'radio.html' }); assert.equal(O.oNas('kim jest Filip').akcja, null);
  const src = czytaj('supabase/functions/_shared/o-nas.mjs');
  assert.doesNotMatch(src, /SZKIC/, 'treść zatwierdzona 3.11 — znacznik szkicu zdjęty'); assert.doesNotMatch(src, /fabian/i, 'imię dziecka z akcji nie w pliku o nas');
  const fakty = Object.values(O.O_NAS).flat().join(' ');
  assert.doesNotMatch(fakty, /reprezentant\w*|zawodni\w* kadry|biega ultra/i, 'Filip = sztab szkoleniowy kadry, NIE zawodnik/reprezentant (poprawka Filipa 3.11) — to nie może wrócić');
  assert.match(fakty, /sztabu szkoleniowego kadry Polski na mistrzostwa świata IAU w biegu na 100 km/);
  assert.doesNotMatch(fakty, /bez firmy|bez reklam|sprzedawani|@/, 'niepotwierdzone obietnice i adres e-mail zdjęte (Filip 3.11) — kontakt tylko przez czat');
  assert.match(O.O_NAS.podopieczny.join(' '), /przez czat w aplikacji/); assert.match(O.O_NAS.radio.join(' '), /muzyka do biegania tworzona przez Filipa/);
  for (const k of ['filip', 'kasia', 'zespol', 'biegamy', 'funkcje', 'radio', 'podopieczny']) assert.ok(Array.isArray(O.O_NAS[k]) && O.O_NAS[k].length >= 1, k);
  assert.doesNotMatch(src, /Deno\.|googleapis|from\("/, 'plik czysty: bez Deno, bez sieci, bez bazy');
});

test('4) produkt.mjs: nazwa z pytania (nie „moje kalorie”), szukanie w food_database (dokładne → początek → gdziekolwiek), zdanie z 100 g', async () => {
  const P = await zaladuj('supabase/functions/okienko-v2/produkt.mjs');
  assert.equal(P.produktZPytania('ile kalorii ma banan'), 'banan'); assert.equal(P.produktZPytania('Ile kcal ma 100 g ryżu?'), 'ryzu'); assert.equal(P.produktZPytania('ile białka ma jajko'), 'jajko');
  assert.equal(P.produktZPytania('banan ile ma kcal'), 'banan'); assert.equal(P.produktZPytania('kaloryczność płatków owsianych'), 'platkow owsianych'); assert.equal(P.produktZPytania('ile kalorii jest w pomidorze'), 'pomidorze');
  assert.equal(P.produktZPytania('ile spaliłem kalorii w tym tygodniu'), null, 'moje kalorie → nie produkt'); assert.equal(P.produktZPytania('ile kalorii spalam na treningu'), null); assert.equal(P.produktZPytania('jak zacząć biegać'), null);
  const tabela = [{ display_name: 'Banan', brand: null, name_normalized: 'banan', kcal_per_100: 89, protein_g_per_100: 1.1, carbs_g_per_100: 22.8, fat_g_per_100: 0.3, hit_count: 5 },
    { display_name: 'Bananowy jogurt', brand: 'Marka', name_normalized: 'bananowy jogurt', kcal_per_100: 95, protein_g_per_100: 3, carbs_g_per_100: 14, fat_g_per_100: 2.5, hit_count: 1 }];
  const sb = { from: () => { const f = []; let lim = 50; const q = { select: () => q, eq: (k, v) => { f.push((r) => r[k] === v); return q; }, ilike: (k, wz) => { const re = new RegExp('^' + wz.replace(/%/g, '.*') + '$', 'i'); f.push((r) => re.test(String(r[k] || ''))); return q; }, order: () => q, limit: (n) => { lim = n; return q; }, then: (res) => res({ data: tabela.filter((r) => f.every((x) => x(r))).sort((a, b) => b.hit_count - a.hit_count).slice(0, lim), error: null }) }; return q; } };
  const b = await P.szukajProduktu(sb, 'banan'); assert.equal(b.display_name, 'Banan', 'dokładne trafienie przed „bananowy jogurt”');
  assert.equal(P.zdanieProduktu(b), 'Banan: 100 g to 89 kcal — białko 1,1 g, węglowodany 22,8 g, tłuszcz 0,3 g.');
  assert.equal((await P.szukajProduktu(sb, 'bananów')).display_name, 'Banan', 'odmiana → rdzeń');
  assert.equal((await P.szukajProduktu(sb, 'jogurt')).display_name, 'Bananowy jogurt', 'gdziekolwiek w nazwie');
  assert.equal(await P.szukajProduktu(sb, 'kebab'), null); assert.equal(await P.szukajProduktu({ from: () => { throw new Error('x'); } }, 'banan'), null, 'błąd bazy → null → sieć');
  assert.equal(P.zdanieProduktu({ display_name: 'X', brand: 'B', kcal_per_100: 10.4 }), 'X (B): 100 g to 10 kcal.');
});

test('5) klasyfikator i intencje: zywienie / sprzet / o_nas + slot produkt; porada/fakt/sprzet → null (sieć); zywienie → produkt; o_nas → plik, nigdy sieć', async () => {
  const R = await zaladuj('supabase/functions/okienko-v2/rozumienie.mjs');
  for (const k of ['zywienie', 'sprzet', 'o_nas', 'porada', 'fakt']) assert.ok(R.NAZWY_INTENCJI.includes(k), k);
  assert.match(R.promptRozumienia('2026-11-03'), /zywienie ze slotem produkt/); assert.match(R.promptRozumienia('2026-11-03'), /o_nas, nie osoba/);
  const I = await zaladuj('supabase/functions/okienko-v2/intencje.mjs');
  for (const k of ['zywienie', 'sprzet', 'o_nas']) assert.ok(I.CHIPY_INTENCJI[k], 'chip ' + k);
  const ctx = { tekst: 'x', sb: null, adm: null, athleteId: 'a', jwt: 'j', dzis: '2026-11-03', teraz: new Date('2026-11-03T12:00:00Z'), fetchFn: null, gemini: 'k', d: {} };
  for (const k of ['porada', 'sprzet', 'fakt']) assert.equal(await I.wykonajIntencje({ ...ctx, tekst: 'jak zaczac biegac' }, { intencja: k, sloty: {}, kandydaci: [] }), null, k + ' → null → sieć');
  const sb = { from: () => { const q = { select: () => q, eq: () => q, ilike: () => q, order: () => q, limit: () => q, then: (res) => res({ data: [{ display_name: 'Banan', kcal_per_100: 89, protein_g_per_100: 1.1, carbs_g_per_100: 22.8, fat_g_per_100: 0.3 }], error: null }) }; return q; } };
  const z = await I.wykonajIntencje({ ...ctx, sb, tekst: 'ile kcal ma banan' }, { intencja: 'zywienie', sloty: { produkt: 'banan' }, kandydaci: [] });
  assert.deepEqual(z.body.zdania, ['Banan: 100 g to 89 kcal — białko 1,1 g, węglowodany 22,8 g, tłuszcz 0,3 g.']); assert.deepEqual(z.log, { narzedzia: ['produkt'], tryb: 'v2' }); assert.equal(z.meta, null);
  assert.equal(await I.wykonajIntencje({ ...ctx, sb, tekst: 'co jesc przed biegiem' }, { intencja: 'zywienie', sloty: {}, kandydaci: [] }), null, 'żywienie bez produktu → sieć');
  const o = await I.wykonajIntencje({ ...ctx, tekst: 'kim jest Filip' }, { intencja: 'o_nas', sloty: {}, kandydaci: [] });
  assert.match(o.body.zdania[0], /^Filip Jańczak/); assert.deepEqual(o.log.narzedzia, ['o-nas']);
  const o2 = await I.wykonajIntencje({ ...ctx, tekst: 'opowiedz cos o aplikacji' }, { intencja: 'o_nas', sloty: {}, kandydaci: [] });
  assert.equal(o2.body.zdania[0], I.ODP_O_NAS_OGOLNIE, 'klasyfikator o_nas bez trafienia wzorca → podpowiedź, nie sieć'); assert.ok(o2.body.chipy.length >= 2);
  const S = await zaladuj('supabase/functions/okienko-v2/samosprawdzenie.mjs');
  assert.deepEqual(S.NARZEDZIA_INTENCJI.zywienie, ['produkt']); assert.deepEqual(S.NARZEDZIA_INTENCJI.o_nas, ['o-nas']);
});

test('6) potok: o-nas PRZED bramką osób (0 tokenów); INTENCJE_SIECI → produkt przed siecią → wiedza; blokadaSieci bez zmian; ławka: wiersze porad = siec', () => {
  const p = czytaj('supabase/functions/okienko-v2/potok.mjs');
  const iOnas = p.indexOf('const on = oNas(tekst);'), iOsoba = p.indexOf('const os = osobaZPytania(tekst);'), iRouter = p.search(/(const|let) traf = dopasuj\(tekst, dzis\);/);
  assert.ok(iRouter > 0 && iRouter < iOnas && iOnas < iOsoba, 'kolejność: router → o-nas → osoba');
  assert.match(p, /if \(INTENCJE_SIECI\.includes\(roz\.intencja\)\) \{/); assert.match(p, /if \(roz\.intencja === "zywienie" \|\| produktZPytania\(tekst\)\)/);
  assert.match(p, /if \(!blokadaSieci\) \{\s*const w = await przezSiec\(\{ tok: \{ we: 0, wy: 0 \} \}, roz\);/, 'sieć tylko gdy bramka prywatności przepuszcza');
  assert.match(p, /const blokadaSieci = wygladaNaOsobe\(tekst\) \|\| !!osobaWZdaniu\(tekst\) \|\| wygladaNaNazwisko\(tekst\);/, 'bramka prywatności nietknięta');
  assert.match(p, /wiedza \? await szukajWiedzy\(\{ d, fetchFn, klucz: gemini, tekst, dzis, intencja: roz\.intencja \}\) : await d\.zapytajSiec/);
  assert.match(p, /ogólnik mimo ponowienia: skrócono/);
  const i = czytaj('supabase/functions/okienko-v2/intencje.mjs');
  assert.doesNotMatch(i, /generujJson\(\{/, 'intencje nie wołają już modelu bez sieci (porada)'); assert.match(i, /case "porada": case "sprzet": case "fakt": return null;/);
  const l = czytaj('tests/_lawka-v2-pytania.js');
  for (const q of ['jak zaczac biegac', 'jak biegac szybciej', 'co jesc po treningu', 'ile wody pic na dlugim biegu', 'jak dobrac buty do biegania']) assert.match(l, new RegExp("W\\('" + q + "', 'poza', \\d, 'siec'"), q + ' → siec');
  assert.match(l, /W\('kim jest filip', 'o_nas', 4, 'router:o-nas'\)/); assert.match(l, /W\('kim jest Kasia Nowak', 'osoby', 3, 'osoba'/);
  assert.doesNotMatch(l, /'v2:porada'/, 'żaden wiersz nie oczekuje już modelu bez sieci');
});

test('7) narzędzie A/B: własna sesja Filipa, hasło tylko z env, wynik do biegamy-podglady, wyciek = osoba prywatna w sieci; 30 pytań', () => {
  const a = czytaj('tools/okienko-ab.mjs');
  assert.match(a, /process\.env\.OKIENKO_HASLO/); assert.doesNotMatch(a, /--haslo/, 'hasło nigdy argumentem'); assert.doesNotMatch(a, /sb_secret|service_role|eyJ[A-Za-z0-9_-]{20,}/, 'bez sekretów');
  assert.match(a, /Downloads", "biegamy-podglady"/); assert.match(a, /wygladaNaOsobe\(p\.p\) \|\| wygladaNaNazwisko\(p\.p\)/); assert.match(a, /okienko-v2/);
  const q = JSON.parse(czytaj('tools/okienko-ab-pytania.json'));
  assert.equal(q.length, 30); assert.ok(q.some((x) => /kim jest Filip/.test(x.p)) && q.some((x) => /banan/.test(x.p)) && q.some((x) => /zacząć biegać/.test(x.p)));
  assert.doesNotMatch(JSON.stringify(q), /fabian/i);
});

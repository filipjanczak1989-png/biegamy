// Blizna #375 (26.11.2026) — nowe Dziś bez sieci: „Nie udało się wczytać” zamiast ostatnich danych.
//
// Stare Dziś bez sieci rysuje ekran z migawki i pokazuje pasek „Offline · dane z HH:MM”. Nowe Dziś pokazywało
// komunikat o błędzie, a przy wygasłej sesji bez sieci zostawało na szkielecie bez słowa.
// Decyzje Filipa 26.11: ta sama migawka (część „dzisNowe”, zapis: blizna-374); trening na dziś tylko z dzisiejszej
// migawki; migawki nie pokazujemy przy zwykłym wejściu; bez limitu dni.
// Odczyt TYLKO przy błędzie sieci. Atrapa odpowiada tak jak supabase-js: bez połączenia { error: 'Failed to fetch' },
// przy odmowie prawdziwy kod serwera. Migawka w testach to napis z pamięci telefonu, zapisany wcześniej przez moduł.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, wpis, TERAZ, UID, MODUL } = require('./_dzis-nowy-strona.js');

const LICZNIK = { wystartowala: true, nazwa: 'Ulica próbna', suma_km: 3607.4, cel_km: 12500, pct: 28.86 };
const H = 3600e3;
/** Jedno wejście z siecią: zostawia w telefonie migawkę. Oddaje mapę pamięci telefonu do następnej „strony”. */
async function zSiecia(opcje) { const s = strona(Object.assign({ licznik: LICZNIK }, opcje)); s.B.start(); await s.doKonca(); return s.tel.mapa; }
async function bezSieci(pamiec, opcje) { const s = strona(Object.assign({ pamiec, online: false, awaria: { '*': 'siec' }, teraz: TERAZ + H, licznik: LICZNIK }, opcje)); s.B.start(); await s.doKonca(); return s; }

test('(1) bez sieci po wcześniejszym wejściu: wszystkie kafle z telefonu, plakietka zegarka, pasek „Offline · dane z 12:00”, zero zgłoszeń', async () => {
  const s = await bezSieci(await zSiecia());
  assert.match(s.kafel('ulica').innerHTML, /<b>3 607<\/b>/); assert.match(s.kafel('ulica').innerHTML, /Twój wkład: <b>196 km<\/b>/); assert.match(s.kafel('ulica').innerHTML, /ulica-glowna\.html#ulica-po/);
  assert.match(s.kafel('trening').innerHTML, /Rozgrzewka 2 km, potem 4 × 1 km\./, 'trening z dzisiejszej migawki');
  assert.match(s.kafel('trening').innerHTML, /Jutro luźno\./, 'świeża wiadomość trenera też');
  assert.match(s.kafel('ostatni').innerHTML, /<b>10<small>km/); assert.equal(s.kafel('lista').hidden, false);
  assert.match(s.cz('zegarek').innerHTML, /data-id="a-1">ok/, 'plakietka zegarka z profilu w telefonie, bez zapytania');
  for (const n of ['ulica', 'trening', 'ostatni', 'lista']) assert.doesNotMatch(s.kafel(n).innerHTML, /Nie udało się wczytać/, n);
  assert.equal(s.pasekOffline(), 'Offline · dane z 12:00');
  assert.equal(s.zgloszenia.length, 0, 'telefon wie, że nie ma sieci: nic nie zgłaszamy');
  assert.equal(s.tel.zapisy.length, 0, 'odczyt niczego nie zapisuje; godzina w telefonie zostaje z ostatniego udanego wejścia');
  assert.equal(s.migawka().czesci.dzisNowe.ts, TERAZ);
});

test('(2) tylko błąd SIECI sięga do telefonu: odmowa i błąd serwera pokazują usterkę; „Failed to fetch” przy „online” i brak odpowiedzi w 10 s liczą się jak brak sieci', async () => {
  const pamiec = await zSiecia();
  const odmowa = strona({ pamiec: new Map(pamiec), awaria: { '*': 'odmowa' }, teraz: TERAZ + H, licznik: LICZNIK }); odmowa.B.start(); await odmowa.doKonca();
  assert.match(odmowa.kafel('trening').innerHTML, /Nie udało się wczytać/); assert.match(odmowa.kafel('ostatni').innerHTML, /Nie udało się wczytać/);
  assert.equal(odmowa.kafel('ulica').hidden, true); assert.equal(odmowa.pasekOffline(), null, 'stare dane ukryłyby prawdziwą usterkę');
  assert.ok(odmowa.zgloszenia.length >= 1);
  const zerwane = strona({ pamiec: new Map(pamiec), online: true, awaria: { '*': 'siec' }, teraz: TERAZ + H, licznik: LICZNIK }); zerwane.B.start(); await zerwane.doKonca();
  assert.match(zerwane.kafel('ostatni').innerHTML, /<b>10<small>km/, 'przeglądarka mówi „online”, ale żądanie nie wyszło: też z telefonu');
  assert.equal(zerwane.pasekOffline(), 'Offline · dane z 12:00'); assert.ok(zerwane.zgloszenia.length >= 1, 'a usterka i tak jest zgłoszona');
  const cisza = strona({ pamiec: new Map(pamiec), teraz: TERAZ + H, licznik: LICZNIK }); cisza.B.start(); await cisza.tik();
  cisza.czasomierze.filter((c) => c.zywy && c.ms === 10000).forEach((c) => c.f()); await cisza.tik(); await cisza.tik();   // nikt nie odpowiedział przez 10 s
  assert.match(cisza.kafel('ostatni').innerHTML, /<b>10<small>km/); assert.match(cisza.kafel('trening').innerHTML, /Rozgrzewka/); assert.equal(cisza.pasekOffline(), 'Offline · dane z 12:00');
});

test('(3) trening na dziś tylko z dzisiejszej migawki; wpisy i ulica bez limitu dni; wiadomość trenera tylko świeża', async () => {
  const pamiec = await zSiecia();
  const jutro = await bezSieci(new Map(pamiec), { teraz: TERAZ + 24 * H });
  assert.match(jutro.kafel('trening').innerHTML, /Bez sieci nie wiem, co jest dziś w planie\./);
  assert.doesNotMatch(jutro.kafel('trening').innerHTML, /Rozgrzewka|Interwały|Jutro luźno|Dziś bez planu/, 'wczorajszy plan nie udaje dzisiejszego, a „bez planu” też byłoby zgadywaniem');
  assert.match(jutro.kafel('trening').innerHTML, /data-dn="ponow"/);
  assert.match(jutro.kafel('ostatni').innerHTML, /<b>10<small>km/); assert.match(jutro.kafel('ulica').innerHTML, /3 607/);
  assert.equal(jutro.pasekOffline(), 'Offline · dane z 26.11 12:00', 'pasek mówi, z kiedy są dane');
  const poMiesiacu = await bezSieci(new Map(pamiec), { teraz: TERAZ + 30 * 24 * H });
  assert.match(poMiesiacu.kafel('ostatni').innerHTML, /<b>10<small>km/, 'bez limitu dni, jak w starym');
  // ten sam dzień, ale wiadomość ma już ponad 7 dni: trening jest, rady nie ma
  const stara = await bezSieci(await zSiecia({ wiadomosc: [{ body: 'Dawna rada.', sent_at: new Date(TERAZ - 6.99 * 24 * H).toISOString() }] }), { teraz: TERAZ + 2 * H });
  assert.match(stara.kafel('trening').innerHTML, /Rozgrzewka/); assert.doesNotMatch(stara.kafel('trening').innerHTML, /Dawna rada/);
});

test('(4) „Jak poszło?” bez sieci się nie pokazuje (ani blok, ani pasek na górze); po powrocie sieci wraca', async () => {
  const czeka = [wpis('l1', 5), wpis('l2', 30, { feel: 'good' })];
  const s = await bezSieci(await zSiecia({ wpisy: czeka }), { wpisy: czeka });
  assert.match(s.kafel('ostatni').innerHTML, /<b>10<small>km/); assert.doesNotMatch(s.kafel('ostatni').innerHTML, /dn-jp/, 'odczucia nie dałoby się zapisać');
  assert.equal(s.cz('zdarzenie').hidden, true);
  // powrót sieci
  const przed = s.zapytania.length;
  s.st.online = true; s.st.awaria = {}; assert.equal(s.sluchacze.online.length, 1); s.sluchacze.online[0](); await s.doKonca();
  assert.ok(s.zapytania.length > przed, 'zdarzenie „online” wczytuje dane od nowa');
  assert.match(s.kafel('ostatni').innerHTML, /class="dn-jp" data-dn="jp"/); assert.equal(s.cz('zdarzenie').hidden, false);
  assert.equal(s.pasekOffline(), null, 'pasek „Offline” znika po pierwszym udanym odczycie');
  assert.equal(s.migawka().czesci.dzisNowe.ts, TERAZ + H);
  const ile = s.zapytania.length; s.sluchacze.online[0](); await s.doKonca();
  assert.equal(s.zapytania.length, ile, '„online” przy świeżych danych o nic nie pyta');
  s.B.start(); assert.equal(s.sluchacze.online.length, 1, 'nasłuch zakładany raz');
});

test('(5) bez migawki i w podglądzie trenera po staremu; pojedynczy kafel bez sieci bierze z telefonu tylko swoją część', async () => {
  const pusty = await bezSieci(new Map());
  assert.match(pusty.kafel('trening').innerHTML, /Nie udało się wczytać/); assert.match(pusty.kafel('ostatni').innerHTML, /Nie udało się wczytać/); assert.equal(pusty.pasekOffline(), null);
  const trener = await bezSieci(await zSiecia(), { zakladkaTrenera: true });   // z ?from=trener w adresie moduł w ogóle ustępuje staremu ekranowi
  assert.match(trener.kafel('ostatni').innerHTML, /Nie udało się wczytać/, 'podgląd trenera nie czyta migawki z tej przeglądarki'); assert.equal(trener.pasekOffline(), null);
  // sieć padła w połowie: wpisy nie doszły, reszta świeża
  const pol = strona({ pamiec: await zSiecia(), awaria: { training_logs: 'siec' }, teraz: TERAZ + H, licznik: LICZNIK, wklad: { km: 205 }, wpisy: [wpis('nowy', 1, { distance_km: 21.1, feel: 'good' })] }); pol.B.start(); await pol.doKonca();
  assert.match(pol.kafel('ostatni').innerHTML, /<b>10<small>km/, 'wpisy z telefonu'); assert.equal(pol.migawka().czesci.dzisNowe.ulica.wklad.km, 205, 'ulica świeża, a do telefonu trafia to, co doszło');
  assert.doesNotMatch(pol.kafel('ostatni').innerHTML, /Nie udało się wczytać/);
  // w telefonie jest tylko profil i wpisy (trening nigdy nie doszedł): kafel treningu mówi o błędzie, wpisy są
  const czesc = await bezSieci(await zSiecia({ awaria: { trainings: 'odmowa', messages: 'odmowa' } }));
  assert.match(czesc.kafel('trening').innerHTML, /Nie udało się wczytać/); assert.match(czesc.kafel('ostatni').innerHTML, /<b>10<small>km/); assert.equal(czesc.pasekOffline(), 'Offline · dane z 12:00');
});

test('(6) wygasła sesja bez sieci: konto jak w starym Dziś (pamięć strony) → migawka; bez niego komunikat, nie wieczny szkielet; z siecią bez zmian', async () => {
  const pamiec = await zSiecia();
  const zKontem = strona({ pamiec: new Map(pamiec), online: false, sesja: false, awaria: { '*': 'siec' }, teraz: TERAZ + H, licznik: LICZNIK });
  zKontem.D._userIdCache = UID;   // stary initAuth zapamiętał konto wcześniej na tej stronie
  zKontem.B.start(); await zKontem.doKonca();
  assert.match(zKontem.kafel('ostatni').innerHTML, /<b>10<small>km/); assert.equal(zKontem.pasekOffline(), 'Offline · dane z 12:00');
  const bezKonta = strona({ pamiec: new Map(pamiec), online: false, sesja: false, awaria: { '*': 'siec' }, teraz: TERAZ + H }); bezKonta.B.start(); await bezKonta.doKonca();
  assert.match(bezKonta.kafel('trening').innerHTML, /Nie udało się wczytać/, 'przed poprawką: szkielet bez końca i bez słowa');
  assert.match(bezKonta.kafel('ostatni').innerHTML, /Nie udało się wczytać/); assert.equal(bezKonta.zapytania.length, 0);
  const zSiecia2 = strona({ pamiec: new Map(pamiec), online: true, sesja: false }); zSiecia2.B.start(); await zSiecia2.doKonca();
  assert.equal(zSiecia2.kafel('trening').innerHTML, '', 'z siecią bez sesji nic się nie zmienia: stary kod odsyła do logowania'); assert.equal(zSiecia2.zapytania.length, 0);
});

test('(7) ekran z telefonu nie blokuje następnej próby; granice: moduł czyta migawkę tylko przez DzisOffline', async () => {
  const s = await bezSieci(await zSiecia());
  const przed = s.zapytania.length; s.st.online = true; s.st.awaria = {};
  s.B.start(); await s.doKonca();
  assert.ok(s.zapytania.length > przed, 'ponowne wejście na Dziś próbuje sieci od razu, bez czekania 60 s'); assert.equal(s.pasekOffline(), null);
  const kod = MODUL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((kod.match(/localStorage/g) || []).length, 2); assert.doesNotMatch(kod, /bm_dzis_migawka|bm-offline-pasek/);
  assert.match(kod, /e\.siec && awaryjnieTrening\(nr\)/); assert.match(kod, /e\.siec && awaryjnieWpisy\(nr, sb\)/); assert.match(kod, /e\.siec && awaryjnieUlica\(nr\)/); assert.match(kod, /e\.siec && awaryjnieWszystko\(nr, sb\)/);
});

test('(8) stan mieszany i próba w toku (wykryte próbą w przeglądarce 26.11): kafel z telefonu nie zaczyna wczytywania od nowa, pasek „Offline” zostaje, „Jak poszło?” przy świeżych wpisach jest', async () => {
  const czeka = [wpis('l1', 5), wpis('l2', 30, { feel: 'good' })];
  const s = strona({ pamiec: await zSiecia({ wpisy: czeka }), awaria: { 'rpc akcja_licznik': 'siec', 'rpc akcja_moj_wklad': 'siec' }, teraz: TERAZ + H, licznik: LICZNIK, wpisy: czeka });
  s.B.start(); await s.tik();
  // licznik ulicy odpada od razu, profil jeszcze w drodze
  s.zapytania.filter((z) => z.nazwa.startsWith('rpc ')).forEach((z) => z.odpowiedz()); await s.tik();
  const wDrodze = s.zapytania.length;
  s.B.start(); s.B.start(); await s.tik();
  assert.equal(s.zapytania.length, wDrodze, 'kolejne wejścia na Dziś nie zaczynają wczytywania od nowa, dopóki poprzednie ma otwarte zapytania');
  await s.doKonca();
  assert.match(s.kafel('ulica').innerHTML, /3 607/, 'ulica z telefonu');
  assert.match(s.kafel('ostatni').innerHTML, /class="dn-jp" data-dn="jp"/, 'wpisy doszły z sieci, więc pytanie o odczucie jest');
  assert.equal(s.pasekOffline(), 'Offline · dane z 12:00', 'świeży zapis migawki nie zdejmuje paska, dopóki jakiś kafel stoi na danych z telefonu');
  assert.equal(s.zapytania.filter((z) => z.nazwa === 'athletes').length, 1, 'profil pytany raz');
  // wszystko doszło poza ulicą; następne wejście próbuje od razu (nic już nie jest w drodze)
  const ile = s.zapytania.length; s.st.awaria = {}; s.B.start(); await s.doKonca();
  assert.ok(s.zapytania.length > ile); assert.equal(s.pasekOffline(), null);
});

test('(9) domknięcia po mutacjach: odmowa samej wiadomości nie sięga do telefonu; kafel z telefonu w drugiej fali nie zaczyna wczytywania od nowa', async () => {
  const pamiec = await zSiecia();
  const odm = strona({ pamiec: new Map(pamiec), awaria: { messages: 'odmowa' }, teraz: TERAZ + H, licznik: LICZNIK }); odm.B.start(); await odm.doKonca();
  assert.match(odm.kafel('trening').innerHTML, /Rozgrzewka/); assert.doesNotMatch(odm.kafel('trening').innerHTML, /Jutro luźno/, 'odmowa to odpowiedź serwera: rady z telefonu nie pokazujemy');
  assert.equal(odm.pasekOffline(), null);
  const s = strona({ pamiec: new Map(pamiec), awaria: { trainings: 'siec' }, teraz: TERAZ + H, licznik: LICZNIK }); s.B.start(); await s.tik();
  s.zapytania.filter((z) => z.stan === 'czeka').forEach((z) => z.odpowiedz()); await s.tik();           // fala 1 w całości
  s.zapytania.filter((z) => z.nazwa === 'trainings').forEach((z) => z.odpowiedz()); await s.tik();     // z fali 2 wraca tylko trening, i to błędem sieci
  assert.match(s.kafel('trening').innerHTML, /Rozgrzewka/); assert.equal(s.pasekOffline(), 'Offline · dane z 12:00');
  assert.ok(s.zapytania.some((z) => z.nazwa === 'training_logs' && z.stan === 'czeka'), 'wpisy jeszcze w drodze');
  const ile = s.zapytania.length; s.B.start(); s.B.start(); await s.tik();
  assert.equal(s.zapytania.length, ile, 'nowa próba nie startuje, dopóki poprzednia ma otwarte zapytania');
  await s.doKonca(); s.st.awaria = {}; s.B.start(); await s.doKonca();
  assert.ok(s.zapytania.length > ile, 'a gdy nic nie jest w drodze, następne wejście próbuje od razu'); assert.equal(s.pasekOffline(), null);
});

// Blizna #406 (27.11.2026) — nowe Dziś: kafel „Społeczność” (K2; plan dzis\spolecznosc\plan-spolecznosc.md, decyzje Filipa 27.11).
//
// Stare Dziś pokazywało podgląd Społeczności 5–6 zapytaniami przy każdym wejściu, z pełnymi imionami i własnymi treningami.
// Nowy kafel: JEDNO zapytanie (rpc spolecznosc_dzis, migracja 20261228), i to dopiero, gdy kafel jest 400 px od ekranu,
// więc pierwszy ekran zostaje 6/7. Odświeża się tylko z całym Dziś, bez własnego zegara. Funkcja oddaje same profile publiczne
// (pierwsze imię, miasto, rodzaj, km, czas, id); kafel escapuje wszystko i przyjmuje tylko id w kształcie UUID.
// Decyzje: 4 „dziś”, gdy wszystkie biegi od północy, inaczej „w ostatniej dobie”; 7 pusto = zdanie z linkiem, kafel nie znika.
// Brak funkcji na bazie (moduł wdrożony przed migracją), błąd albo zły kształt = kafel schowany + jeden wpis client_errors „spolecznosc”.
// Cudzych danych nie zapisujemy w pamięci telefonu; bez sieci kafla nie ma.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, MODUL, TERAZ } = require('./_dzis-nowy-strona.js');

const U = (n) => '0000000' + n + '-1111-4222-8333-44444444444' + n;
const temuIso = (min) => new Date(TERAZ - min * 60000).toISOString();
const DANE = { osob: 5, km: 41.2, miasta: ['Poznań', 'Gniezno', 'Swarzędz'], od_polnocy: true,
  biegi: [{ id: U(1), imie: 'Kasia', miasto: 'Poznań', rodzaj: 'Wybieganie', km: 10.2, kiedy: temuIso(125) }, { id: U(2), imie: 'Piotr', miasto: 'Gniezno', rodzaj: 'Interwały', km: 6.4, kiedy: temuIso(250) }],
  odznaka: { id: U(3), imie: 'Tomek', odznaka: 'zly_kod_nieznany', akcji: false, kiedy: temuIso(190) } };
/** IntersectionObserver jak w przeglądarce: test mówi, kiedy kafel jest blisko ekranu. */
function widok(s) {
  const v = { obs: [], wZasiegu: false };   // wZasiegu: jak w przeglądarce, observe() od razu zgłasza bieżący stan
  s.w.IntersectionObserver = function (f, o) { const ob = { f, o, cele: [] }; v.obs.push(ob); this.observe = (el) => { ob.cele.push(el); if (v.wZasiegu) Promise.resolve().then(() => f([{ target: el, isIntersecting: true }])); }; this.unobserve = (el) => { ob.cele = ob.cele.filter((x) => x !== el); }; this.disconnect = () => { ob.cele = []; }; };
  v.spol = () => v.obs.filter((x) => x.o && x.o.rootMargin === '400px 0px');
  v.blisko = () => v.spol().forEach((x) => x.f(x.cele.map((t) => ({ target: t, isIntersecting: true }))));
  return v;
}
const spolZapytania = (s) => s.zapytania.filter((q) => q.nazwa === 'rpc spolecznosc_dzis');
const pokaz = async (o) => { const s = strona(o); const v = widok(s); s.B.start(); await s.doKonca(); return { s, v }; };
const kafel = (s) => s.kafel('spol');

test('(1) pierwszy ekran bez zapytania o Społeczność: budżet bez zmian (7 z trenerem, 6 bez); kafel stoi jako szkielet', async () => {
  for (const [opis, o, ile] of [['z trenerem', {}, 7], ['bez trenera', { profil: { id: 'a-1', full_name: 'Ola Nowak', coach_id: null, intervals_athlete_id: null } , wiadomosc: [] }, 6]]) {
    const { s, v } = await pokaz(Object.assign({ spol: DANE }, o));
    s.czasomierze.filter((c) => c.zywy && c.ms === 0).forEach((c) => c.f()); await s.doKonca();   // także nic odłożonego „na zaraz”
    assert.equal(spolZapytania(s).length, 0, opis + ': zanim kafel jest blisko ekranu, zapytania nie ma');
    assert.equal(s.zapytania.length, ile, opis + ': budżet pierwszego ekranu');
    assert.equal(v.spol().length, 1); assert.deepEqual(v.spol()[0].cele, [kafel(s)], 'obserwowany jest kafel Społeczność, z zapasem 400 px');
  }
  // na szkielecie kafle są niskie i Społeczność mieści się w zasięgu: obserwator dopiero po falach pierwszego ekranu (pomiar 27.11 na prawdziwej stronie)
  const wcz = strona({ spol: DANE }), vw = widok(wcz); vw.wZasiegu = true; wcz.B.start(); await wcz.tik();
  wcz.zapytania.forEach((q) => q.odpowiedz()); await wcz.tik();   // fala 1 gotowa, fala 2 w drodze
  assert.equal(vw.spol().length, 0, 'w trakcie fal pierwszego ekranu kafel nie jest obserwowany');
  const czeka = wcz.zapytania.filter((q) => q.stan === 'czeka'); assert.ok(czeka.length >= 2, 'fala 2 ma kilka zapytań');
  czeka[0].odpowiedz(); await wcz.tik();
  assert.equal(vw.spol().length, 0, 'jedno skończone zapytanie fali 2 to jeszcze nie koniec pierwszego ekranu');
  await wcz.doKonca(); await wcz.tik();
  assert.equal(vw.spol().length, 1, 'po ostatniej fali: obserwowany');
  assert.equal(spolZapytania(wcz).length, 1, 'kafel w zasięgu po ułożeniu pierwszego ekranu (np. wysoki ekran): jedno zapytanie');
  const bezObs = strona({ spol: DANE }); bezObs.B.start(); await bezObs.doKonca();
  assert.equal(spolZapytania(bezObs).length, 0, 'bez IntersectionObservera też nic, dopóki strona się nie przewinie');
  assert.ok((bezObs.sluchacze.scroll || []).length >= 1, 'zapas: nasłuch przewijania');
  bezObs.sluchacze.scroll.forEach((f) => f()); await bezObs.doKonca();
  assert.equal(spolZapytania(bezObs).length, 1, 'po przewinięciu jedno zapytanie');
});

test('(2) blisko ekranu: dokładnie JEDNO zapytanie, bez argumentów; kolejne przewinięcia nic nie dokładają; bez własnego zegara', async () => {
  const { s, v } = await pokaz({ spol: DANE });
  const zegary = s.czasomierze.length;
  v.blisko(); v.blisko(); await s.doKonca(); v.blisko(); await s.doKonca();
  assert.equal(spolZapytania(s).length, 1); assert.equal(spolZapytania(s)[0].opis, '', 'rpc bez parametrów');
  assert.deepEqual(s.czasomierze.slice(zegary).map((c) => c.ms), [10000], 'jedyny czasomierz to limit 10 s samego zapytania');
  assert.doesNotMatch(MODUL, /setInterval/, 'żadnego odpytywania co jakiś czas');
});

test('(3) odświeżenie z całym Dziś (powrót do aplikacji): kafel w zasięgu = jedno nowe zapytanie; daleko = nic', async () => {
  const { s, v } = await pokaz({ spol: DANE });
  v.blisko(); await s.doKonca();
  s.B.wczytaj(true); await s.doKonca();
  assert.equal(spolZapytania(s).length, 1, 'samo odświeżenie nie pyta, dopóki kafel nie jest blisko');
  v.blisko(); await s.doKonca();
  assert.equal(spolZapytania(s).length, 2, 'po odświeżeniu i w zasięgu: jedno');
  assert.equal(v.spol().length, 1, 'ten sam obserwator, bez dokładania');
  v.wZasiegu = true;   // kafel stoi na ekranie w chwili odświeżenia: bez przewijania obserwator musi zgłosić go jeszcze raz
  s.B.wczytaj(true); await s.doKonca();
  assert.equal(spolZapytania(s).length, 3, 'kafel na ekranie przy odświeżeniu: jedno nowe zapytanie bez przewijania');
});

test('(4) treść: nagłówek, podsumowanie (dziś / w ostatniej dobie, odmiana), dwa biegi z inicjałem, rodzajem i „x h temu”, odznaka', async () => {
  const { s, v } = await pokaz({ spol: DANE }); v.blisko(); await s.doKonca();
  const h = kafel(s).innerHTML;
  assert.equal(kafel(s).hidden, false);
  assert.match(h, /^<div class="dn-gora"><div><h2 class="dn-etykieta">Społeczność<\/h2><div class="dn-kto">profile publiczne<\/div><\/div><button type="button" class="dn-link" data-sekcja="social">Wszystko ›<\/button><\/div>/);
  assert.match(h, /<span class="dn-sp-av dn-sp-licz" aria-hidden="true">5<\/span><span class="dn-sp-t"><b>5 osób biegało dziś<\/b>, razem 41 km<small>Poznań, Gniezno, Swarzędz<\/small><\/span>/);
  assert.match(h, /<button type="button" class="dn-sp-w" data-dn="sp-profil" data-id="00000001-[^"]+"><span class="dn-sp-av" style="background:#[0-9a-f]{6}" aria-hidden="true">K<\/span><span class="dn-sp-t"><b>Kasia<\/b> · wybieganie 10,2 km<small>Poznań · 2 h temu<\/small><\/span><\/button>/);
  assert.match(h, /<b>Piotr<\/b> · interwały 6,4 km<small>Gniezno · 4 h temu<\/small>/);
  assert.match(h, /<span class="dn-sp-av dn-sp-medal" aria-hidden="true"><img[^>]*medal-64\.webp[^>]*><\/span><span class="dn-sp-t"><b>Tomek<\/b> · nowa odznaka<small>3 h temu<\/small>/, 'nieznana odznaka: bez surowego kodu');
  assert.doesNotMatch(h, /zly_kod_nieznany/);
  const B = s.B;
  for (const [n, t] of [[1, '1 osoba biegała'], [2, '2 osoby biegały'], [4, '4 osoby biegały'], [5, '5 osób biegało'], [12, '12 osób biegało'], [22, '22 osoby biegały']]) assert.match(B.spolHtml({ osob: n, km: 3, biegi: [], miasta: [], od_polnocy: true }), new RegExp('<b>' + t + ' dziś</b>'));
  assert.match(B.spolHtml({ osob: 3, km: 7.25, biegi: [], miasta: [], od_polnocy: false }), /<b>3 osoby biegały w ostatniej dobie<\/b>, razem 7,3 km<\/span>/, 'decyzja 4: nie wszystkie od północy');
  assert.match(B.spolHtml({ osob: 3, km: 7, biegi: [], miasta: [] }), /w ostatniej dobie<\/b>/, 'bez pola od_polnocy: bezpieczniej „w ostatniej dobie” niż „dziś”');
});

test('(5) escapowanie i tylko id w kształcie UUID; pola spoza funkcji nie wchodzą do kafla', async () => {
  const zle = { osob: 1, km: 5, od_polnocy: true, miasta: ['"><img src=x onerror=1>'],
    biegi: [{ id: U(1), imie: '<img src=x onerror=1>', miasto: '<script>x</script>', rodzaj: '<b>Spokojny</b>', km: 5, kiedy: temuIso(5), nazwisko: 'Kowalska-Ukryta' },
            { id: 'javascript:alert(1)', imie: 'Zły', miasto: 'X', rodzaj: 'Spokojny', km: 1, kiedy: temuIso(6) }],
    odznaka: { id: '"><x', imie: 'Ktoś', odznaka: 'pierwszy_krok', kiedy: temuIso(9) } };
  const { s, v } = await pokaz({ spol: zle }); v.blisko(); await s.doKonca();
  const h = kafel(s).innerHTML;
  assert.doesNotMatch(h, /<img src=x|<script>|<b>spokojny|onerror=1>/i, 'imię, miasto, rodzaj tylko jako tekst');
  assert.match(h, /&lt;img src=x onerror=1&gt;/); assert.match(h, /&lt;script&gt;x&lt;\/script&gt;/); assert.match(h, /&lt;b&gt;spokojny&lt;\/b&gt;/);
  assert.doesNotMatch(h, /javascript:|Zły|Ktoś/, 'wiersze z id innym niż UUID odpadają');
  assert.doesNotMatch(h, /Kowalska/, 'pola spoza funkcji (np. nazwisko) nie wchodzą');
});

test('(6) pusto (decyzja 7): zdanie z linkiem do Społeczności, kafel NIE znika; odznaka z 7 dni zostaje pod zdaniem', async () => {
  const { s, v } = await pokaz({ spol: { osob: 0, km: 0, miasta: [], od_polnocy: true, biegi: [], odznaka: null } }); v.blisko(); await s.doKonca();
  assert.equal(kafel(s).hidden, false);
  assert.match(kafel(s).innerHTML, /<p class="dn-tekst dn-sp-pusto">Jeszcze nikt publiczny nie biegał w tej dobie\. <button type="button" class="dn-link" data-sekcja="social">Zobacz Społeczność ›<\/button><\/p>$/);
  const z = s.B.spolHtml({ osob: 0, km: 0, miasta: [], biegi: [], odznaka: { id: U(3), imie: 'Tomek', odznaka: 'x', kiedy: temuIso(60 * 30) } });
  assert.match(z, /Jeszcze nikt publiczny nie biegał w tej dobie\.[\s\S]*<b>Tomek<\/b> · nowa odznaka<small>wczoraj<\/small>/);
});

test('(7) dotknięcia: wiersz osoby → jej profil (tylko UUID), „Wszystko ›” i „Zobacz Społeczność ›” → sekcja Społeczność', async () => {
  const { s, v } = await pokaz({ spol: DANE }); v.blisko(); await s.doKonca();
  const otwarte = []; s.w.openAthleteProfile = (id) => otwarte.push(id);
  const dotknij = (atr) => s.korzen._zd.click({ target: { closest: (sel) => (sel === '[data-dn],[data-sekcja]' ? { getAttribute: (k) => atr[k] || null } : null) } });
  dotknij({ 'data-dn': 'sp-profil', 'data-id': U(1) }); dotknij({ 'data-dn': 'sp-profil', 'data-id': 'zly' });
  assert.deepEqual(otwarte, [U(1)]);
  dotknij({ 'data-sekcja': 'social' }); assert.ok(s.stare.includes('showSection social'));
});

test('(8) funkcji nie ma na bazie (moduł przed migracją), błąd albo zły kształt: kafel schowany, JEDEN wpis client_errors „spolecznosc”; bez sieci bez wpisu i bez zapytania', async () => {
  for (const [opis, o] of [['brak funkcji (404)', { awaria: { 'rpc spolecznosc_dzis': 'brak' } }], ['odmowa', { awaria: { 'rpc spolecznosc_dzis': 'odmowa' } }], ['null', { spol: null }], ['zły kształt', { spol: { osob: 'x' } }]]) {
    const { s, v } = await pokaz(Object.assign({ spol: DANE }, o)); v.blisko(); await s.doKonca();
    assert.equal(kafel(s).hidden, true, opis + ': kafel schowany');
    assert.deepEqual(s.zgloszenia.map((z) => z[0].message).filter((m) => m === 'spolecznosc'), ['spolecznosc'], opis + ': jeden wpis');
    s.B.wczytaj(true); await s.doKonca(); assert.equal(kafel(s).hidden, false, opis + ': następne wczytanie próbuje jeszcze raz (szkielet)');
    v.blisko(); await s.doKonca(); assert.equal(s.zgloszenia.filter((z) => z[0].message === 'spolecznosc').length, 1, opis + ': dalej jeden wpis na stronę');
  }
  const off = strona({ spol: DANE }); const v = widok(off); off.B.start(); await off.doKonca();
  off.st.online = false; v.blisko(); await off.doKonca();
  assert.equal(spolZapytania(off).length, 0, 'bez sieci nie pytamy'); assert.equal(kafel(off).hidden, true, 'bez sieci kafla nie ma');
  assert.equal(off.zgloszenia.filter((z) => z[0].message === 'spolecznosc').length, 0);
  assert.ok(off.B.ETAPY.includes('spolecznosc'));
});

test('(9) cudzych danych nie zapisujemy w pamięci telefonu', async () => {
  const { s, v } = await pokaz({ spol: DANE }); v.blisko(); await s.doKonca();
  const pamiec = JSON.stringify([...s.tel.mapa.values()]);
  assert.doesNotMatch(pamiec, /Kasia|Piotr|Tomek|Gniezno|Swarzędz|spolecznosc/);
  assert.doesNotMatch(MODUL.match(/function spolLaduj\(\) \{[\s\S]*?\n  \}/)[0], /zapamietaj|localStorage|DzisOffline/);
});

test('(10) style w duchu A1/A3: wiersze 56 px (cel dotyku), szare podpisy, bez nowego pomarańczu', () => {
  const nowe = (MODUL.match(/#dzis-nowy (\.dn-sp|button\.dn-link)[^{]*\{[^}]*\}/g) || []).join('');
  assert.ok(nowe.length > 200); assert.doesNotMatch(nowe, /#ff7a45|#c44a13/);
  assert.match(MODUL, /#dzis-nowy \.dn-sp-w\{[^}]*min-height:56px;/);
  assert.match(MODUL, /#dzis-nowy \.dn-sp-t small\{[^}]*color:#8f8c97;[^}]*text-overflow:ellipsis\}/);
});

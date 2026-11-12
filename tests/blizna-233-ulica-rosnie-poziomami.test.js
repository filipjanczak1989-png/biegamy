/* BLIZNA 233 / MIASTO DOBRA: „ULICA ROŚNIE POZIOMAMI” (12.11.2026, decyzja Filipa). Zamiast pięciu form akcji jedna droga: 1 Bieg → 2 Ulica → 3 Firmy → 4 Drużyny → 5 Zbudowana.
   Pilnuje: (1) pięć poziomów w jednym miejscu, przykłady przypisane (bieg 1, urodzinowa 2, szkolna 4, słoneczna 5), prawdziwa = wzorcowa z poziomem z licznika; znaczek poziomu na
   każdej działce; działka poziomu 1 to sama brama i kawałek drogi, bogactwo rośnie z poziomem; (2) karta: drabinka 5 szczebli z zaznaczonym obecnym i zdaniem „co odblokowuje następny”,
   pod spodem zasada „nigdy opłata”; bohater jako rysunkowa postać ze świata (bez zdjęć, bez imion dzieci), jedno zdanie o celu oznaczone „od organizacji”, przycisk „Poznaj historię u organizacji”;
   na prawdziwej ulicy ani bohatera, ani zdania (nie ma ich w liczniku); (3) kreator od nowa: jeden ekran „Załóż bieg w minutę” (link, termin = najbliższy weekend, bohater), po zatwierdzeniu
   podgląd z bramą, plakatem i kodem QR oraz komunikat o potwierdzeniu; stary kreator z listą form zniknął; (4) „Dla firm” i drużyny z dopiskiem, od którego poziomu; (5) ekran „Tak będzie
   w aplikacji”: trzy stany, jedno dotknięcie = dołączenie, zasada jednej ulicy; krok scenariusza zaraz po mapie; (6) zasady bez zmian: PRZYKŁAD przy wymyślonych danych, bez imion i nazwisk,
   „organizacja prowadząca zbiórkę”, BiegaMy nic nie przyjmuje, noindex, bez sieci po ekranie gotowości. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const HTML = czytaj('miasto.html'), MJS = czytaj('js/miasto.mjs'), POKAZ = czytaj('js/miasto-pokaz.mjs');
function modul() {
  const ctx = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite, localStorage: null };
  ctx.globalThis = ctx; ctx.window = ctx; vm.runInNewContext(czytaj('js/akcja.mjs'), ctx); vm.runInNewContext(MJS, ctx); return ctx.BM_MIASTO;
}
const LICZNIK = { wystartowala: true, nazwa: 'Kilometry dla Marka', imie: 'Marek', cel_km: 12500, suma_km: 721.39, pct: 5.77, koniec: null, zamknieta: false, firmy: [], ulica: { cegly_n: 1 } };

test('(1) pięć poziomów; przykłady 1/2/4/5; prawdziwa wzorcowa z poziomem z licznika; znaczek poziomu na każdej działce; grafika rośnie z poziomem', () => {
  const M = modul();
  assert.deepEqual(Array.from(M.POZIOMY.map((p) => p.nr + ' ' + p.nazwa)), ['1 Bieg', '2 Ulica', '3 Firmy', '4 Drużyny', '5 Zbudowana']);
  for (const p of M.POZIOMY.slice(0, 4)) { assert.ok(p.odblokowuje.length > 20, p.nazwa + ': zdanie o odblokowaniu'); assert.match(p.odblokowuje, /potwierdzenie organizacji|zgoda organizacji|zamyka organizacja/, p.nazwa + ': odblokowuje aktywność i organizacja'); assert.doesNotMatch(p.odblokowuje, /opłat|zł|wpłat/i, p.nazwa + ': nigdy opłata'); }
  assert.equal(M.ZASADA_POZIOMOW, 'Poziom odblokowuje aktywność ludzi i potwierdzenie organizacji, nigdy opłata.');
  assert.deepEqual(Array.from(M.PRZYKLADY.map((p) => p.id + '=' + M.poziomUlicy(p))), ['bieg=1', 'szkolna=4', 'urodzinowa=2', 'sloneczna=5']);
  const u = M.ulicaZLicznika(LICZNIK);
  assert.equal(M.poziomUlicy(u), 2, 'prawdziwa: cel i mur → 2'); assert.equal(M.poziomUlicy(M.ulicaZLicznika({ ...LICZNIK, firmy: [{ nazwa: 'A' }] })), 3, 'firmy → 3');
  assert.equal(M.poziomUlicy(M.ulicaZLicznika({ ...LICZNIK, koniec: '2026-12-01' })), 5, 'zbudowana → 5'); assert.equal(M.poziomUlicy(M.ulicaZLicznika(null)), null); assert.equal(M.poziomUlicy(M.WOLNA), null);
  assert.equal(M.etykietaMapy(u).poziom, 'wzorcowa · poziom 2 z 5'); assert.equal(M.etykietaMapy(M.PRZYKLADY[0]).poziom, 'poziom 1 z 5'); assert.equal(M.etykietaMapy(M.WOLNA).poziom, '');
  assert.match(M.kartaHtml(u), /md-chip--wzor">WZORCOWA<\/span><span class="md-chip md-chip--poziom">POZIOM 2 Z 5</); assert.match(M.kartaHtml(u), /Ulica wzorcowa: prawdziwa zbiórka, prawdziwe kilometry\. Tak może wyglądać Twoja\./);
  /* mapa: znaczek na każdej działce (prócz wolnej), bieg = brama + kawałek drogi w najmniejszej działce, urodzinowa z murem, szkolna z domkiem firmy, słoneczna największa z przykładów */
  assert.equal((HTML.match(/<span class="dz-poziom"><\/span>/g) || []).length, 5, 'znaczek poziomu: 4 przykłady + prawdziwa');
  assert.match(HTML, /var zp = dz\.querySelector\('\.dz-poziom'\); if \(zp\) zp\.textContent = e\.poziom \|\| '';/);
  const dz = (id) => HTML.slice(HTML.lastIndexOf('<button', HTML.indexOf('data-id="' + id + '"')), HTML.indexOf('</button>', HTML.indexOf('data-id="' + id + '"')));
  assert.match(dz('bieg'), /dz--poziom-1/); assert.match(dz('bieg'), /brama-start-meta\.webp/); assert.match(dz('bieg'), /class="dz-droga" src="assets\/ulica\/droga\.webp"/); assert.doesNotMatch(dz('bieg'), /barierka|drzewo|domek/, 'poziom 1: sama brama i droga');
  assert.match(dz('urodzinowa'), /mur\.webp/); assert.match(dz('szkolna'), /domek-4\.webp/);
  const w = (id) => Number(/width:(\d+(?:\.\d+)?)%/.exec(dz(id))[1]) * Number(/height:(\d+(?:\.\d+)?)%/.exec(dz(id))[1]);
  assert.ok(w('bieg') < w('urodzinowa') && w('urodzinowa') < w('szkolna') && w('szkolna') <= w('sloneczna'), 'wielkość działki rośnie z poziomem: ' + [w('bieg'), w('urodzinowa'), w('szkolna'), w('sloneczna')].join(' < '));
  assert.ok(w('sloneczna') < Number(/width:(\d+)%/.exec(dz('prawdziwa'))[1]) * Number(/height:(\d+)%/.exec(dz('prawdziwa'))[1]), 'prawdziwa największa');
});

test('(2) karta: drabinka 5 szczebli, obecny zaznaczony, zdanie o następnym, zasada; bohater tylko w przykładach, zdanie „od organizacji”, przycisk historii; prawdziwa bez bohatera', () => {
  const M = modul();
  for (const p of M.PRZYKLADY) {
    const k = M.kartaHtml(p), tu = M.poziomUlicy(p);
    assert.equal((k.match(/class="md-szczebel /g) || []).length, 5, p.id + ': 5 szczebli'); assert.equal((k.match(/md-szczebel--tu/g) || []).length, 1); assert.match(k, new RegExp('md-szczebel--tu" aria-current="step"><b>' + tu + '</b>'));
    assert.equal((k.match(/md-szczebel--byl/g) || []).length, tu - 1, p.id + ': poprzednie szczeble wypełnione');
    if (tu < 5) assert.match(k, new RegExp('<p class="md-odblokuj">Następny poziom, <b>' + M.POZIOMY[tu].nazwa + '</b>, odblokowuje: ')); else assert.match(k, /Najwyższy poziom: ulica zbudowana zostaje w mieście na stałe\./);
    assert.match(k, /<p class="md-zasada">Poziom odblokowuje aktywność ludzi i potwierdzenie organizacji, nigdy opłata\.<\/p>/);
    assert.match(k, /<div class="md-bohater"><img src="assets\/(miasto\/swiat-[a-z]+|ulica\/koparka)\.webp" alt=""><div><b>Mał[yа] [A-ZŁŚŻ][a-ząęółśżźćń]+( [A-ZŁŚŻ][a-ząęółśżźćń]+)?<\/b>/, p.id + ': avatar ze świata i postać');
    assert.match(k, /<span class="md-od-org">od organizacji<\/span> Zbieramy na leczenie i rehabilitację\./); assert.match(k, /data-historia>Poznaj historię u organizacji ›/);
    assert.ok(k.indexOf('md-bohater') < k.indexOf('md-liczby') && k.indexOf('md-liczby') < k.indexOf('md-drabinka'), p.id + ': bohater, liczby, drabinka w tej kolejności');
  }
  const kp = M.kartaHtml(M.ulicaZLicznika(LICZNIK));
  assert.doesNotMatch(kp, /md-bohater|od organizacji|Zbieramy|data-historia/, 'prawdziwa: nic, czego nie ma w liczniku'); assert.match(kp, /md-drabinka/);
  assert.doesNotMatch(M.kartaHtml(M.ulicaZLicznika(null)) + M.kartaHtml(M.WOLNA), /md-drabinka|md-bohater/, 'bez licznika i na wolnej działce drabinki nie ma');
  assert.doesNotMatch(JSON.stringify(M.PRZYKLADY.map((p) => p.bohater)), /\b[A-ZŁŚŻ][a-ząęółśżźćń]+ [A-ZŁŚŻ][a-ząęółśżźćń]+(ski|cka|wicz|czyk|ak)\b|Kasia|Filip|Fabian/i, 'postacie, nie dzieci');
  assert.doesNotMatch(M.CEL_PRZYKLADU + JSON.stringify(M.POZIOMY), /chor(ob|y|uje)|diagnoz|nowotw|szpital|onkolog/i, 'bez nazw chorób');
  assert.match(HTML, /\[data-historia\]/, 'przycisk historii obsłużony'); assert.match(HTML, /W pokazie nic nie otwiera\./);
});

test('(3) kreator od nowa i podgląd; (4) dopiski o poziomie na stronach firm i drużyn; (5) ekran „Tak będzie w aplikacji” i krok pokazu po mapie', () => {
  const M = modul();
  assert.equal(M.KREATOR.tytul, 'Załóż bieg w minutę'); assert.doesNotMatch(MJS, /var KROKI = \[|polaBiegu|Wirtualny bieg charytatywny \(5 lub 10 km\)|Osobista zbiórka \(np\. urodzinowa\)/, 'stary kreator z listą form zniknął');
  const k = M.kreatorHtml({ teraz: new Date('2026-11-12T10:00:00') });
  assert.match(k, /id="md-pole-link" type="url"/); assert.match(k, /id="md-pole-termin" type="date" value="2026-11-14"/); assert.equal((k.match(/name="md-swiat"/g) || []).length, 6); assert.match(k, /id="md-zgoda-org"/);
  assert.match(k, /Organizacja prowadząca zbiórkę wie o tym biegu i go potwierdzi\./); assert.doesNotMatch(k, /opłat|wpisowe/i);
  const pg = M.podgladBieguHtml({ swiat: 'bez', termin: '2026-11-14', link: 'javascript:alert(1)' }, '');
  assert.match(pg, /<h3>Bieg przez Miasto Dobra<\/h3>/); assert.doesNotMatch(pg, /javascript:/, 'tylko https w podglądzie linku'); assert.match(pg, /md-qr-puste">kod QR</, 'bez kodera: miejsce na QR, nie błąd');
  assert.match(pg, /md-brama-znak" src="assets\/miasto\/brama-start-meta\.webp"/); assert.match(pg, /md-brama-droga/); assert.match(pg, /md-plakat-karta/);
  assert.match(pg, /<p class="md-potwierdzenie">Bieg będzie widoczny dla wszystkich po potwierdzeniu przez opiekuna albo organizację\.<\/p>/);
  assert.match(HTML, /<script src="js\/miasto-bieg\.mjs" defer><\/script>/, 'koder QR z modułu biegu'); assert.doesNotMatch(czytaj('js/miasto-bieg.mjs'), /DOMContentLoaded|readyState/, 'moduł biegu bez auto-startu');
  assert.match(HTML, /id="md-zaloz">Załóż bieg w minutę ›/); assert.match(HTML, /if \(e\.target\.closest\('\[data-zatwierdz\]'\)\) zatwierdzBieg\(\);/); assert.doesNotMatch(HTML, /data-krok-dalej|name="md-forma"|M\.KROKI/);
  /* (4) */
  assert.match(czytaj('miasto-firmy.html'), /class="fm-poziom"[^>]*>Dostępne od <b[^>]*>poziomu 3<\/b> ulicy/); assert.match(czytaj('miasto-druzyny.html'), /class="dr-poziom"[^>]*>Dostępne od <b[^>]*>poziomu 4<\/b> ulicy/);
  /* (5) */
  const u = M.ulicaZLicznika(LICZNIK), lista = M.ulice(u).concat([M.WOLNA]);
  const a = M.aplikacjaHtml('a', lista, 'bieg'), b = M.aplikacjaHtml('b', lista, 'bieg'), c = M.aplikacjaHtml('c', lista, 'urodzinowa');
  assert.match(a, /Wybierz ulicę, dla której biegasz/); assert.equal((a.match(/data-apl-dolacz="/g) || []).length, M.trwajace(lista).length, 'lista trwających ulic'); assert.doesNotMatch(a, /data-apl-dolacz="(sloneczna|wolna)"/, 'zbudowana i wolna nie do wyboru');
  assert.match(a, /md-apl-avatar/); assert.match(a, /poziom 1 z 5 · 36,8 % celu/);
  assert.match(b, /Bieg Wirtualny/); assert.match(b, /Twój wkład · 4 dni <i class="md-przyklad">przykład<\/i>/); assert.match(b, /data-apl="a">Zmień ulicę ›/); assert.match(b, /md-apl-scena/);
  assert.match(c, /Wejście z linku ulicy/); assert.match(c, /md-apl-ulica--tu" data-apl-dolacz="urodzinowa"/); assert.match(c, /data-apl-potwierdz="urodzinowa">Biegam dla tej ulicy ›/);
  for (const h of [a, b, c]) { assert.match(h, /Jedna ulica naraz, kilometry liczą się od chwili wyboru, bez wyboru nie liczą się nigdzie\./); assert.match(h, /Atrapa ekranu aplikacji/); assert.doesNotMatch(h, /<form|fetch\(|\.from\(/); }
  assert.match(HTML, /<dialog id="md-apl" aria-label="Tak będzie w aplikacji">/); assert.match(HTML, /id="md-aplikacja"[^>]*>Tak będzie w aplikacji ›/);
  assert.match(HTML, /var d = e\.target\.closest\('\[data-apl-dolacz\]'\); if \(d\) \{ aplWybrana = d\.getAttribute\('data-apl-dolacz'\); aplStan = 'b'; rysujAplikacje\(\); return; \}/, 'jedno dotknięcie = dołączenie');
  /* scenariusz: 12 kroków, 7 w skrócie, ekran aplikacji zaraz po mapie, drabinka, kreator i podgląd, koniec na mapie */
  const ctx = { console, Promise, JSON, Math, Number, String, Object, Array, Date, RegExp, isFinite }; ctx.globalThis = ctx; ctx.window = ctx; vm.runInNewContext(POKAZ, ctx);
  const P = ctx.BM_POKAZ, co = P.KROKI.map((x) => x.co);
  assert.equal(P.KROKI.length, 12); assert.equal(P.lista('krotki').length, 7);
  assert.equal(co[1], 'Tak będzie w aplikacji'); assert.equal(P.KROKI[1].klik, '#md-aplikacja'); assert.equal(JSON.stringify(P.KROKI[4].klik), JSON.stringify(['#md-zaloz', '[data-zatwierdz]']));
  assert.ok(co.some((x) => /drabinka/i.test(x)) && co.some((x) => /kreator/i.test(x)) && co.some((x) => /Poziom 3/.test(x)) && co.some((x) => /Poziom 4/.test(x)) && /Zakończenie na mapie/.test(co[11]));
  assert.match(POKAZ, /var sel = Array\.isArray\(k\.klik\) \? k\.klik\.slice\(\) : \(k\.klik \? \[k\.klik\] : \[\]\);/, 'lista selektorów po kolei');
  assert.ok(P.KROKI.some((x) => /nigdy opłata/.test(x.zdanie)) && P.KROKI.some((x) => /bez wyboru nie liczą się nigdzie/.test(x.zdanie)));
});

test('(6) zasady bez zmian: oznaczenia przykładów, bez imion dzieci, organizacja prowadząca zbiórkę, BiegaMy nic nie przyjmuje, noindex; grafiki istnieją', () => {
  const M = modul();
  for (const p of M.PRZYKLADY) { const k = M.kartaHtml(p); assert.match(k, /md-chip--przyklad">PRZYKŁAD</); assert.equal((k.match(/class="md-liczba"/g) || []).length, (k.match(/class="md-przyklad"/g) || []).length, p.id + ': przykład przy każdej liczbie'); }
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/); assert.match(HTML, /BiegaMy nic nie przyjmuje\./);
  assert.match(MJS, /organizacji prowadzącej zbiórkę/);
  for (const g of new Set([...HTML.matchAll(/src="(assets\/[^"]+)"/g)].map((m) => m[1]).concat([...MJS.matchAll(/"(assets\/[^"]+\.webp)"/g)].map((m) => m[1])))) assert.ok(fs.existsSync(path.join(KORZEN, g)), g + ' istnieje');
  assert.doesNotMatch((HTML + MJS + POKAZ).replace(/dla-fabianka(\.html)?/g, ''), /Kasia|Filip\b|fabian/i, 'bez imion organizatorów i bohatera w kodzie (slug akcji to identyfikator techniczny)');
});

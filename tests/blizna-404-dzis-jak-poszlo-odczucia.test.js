// Blizna #404 (26.11.2026) — nowe Dziś, „Jak poszło?”: pole na odczucia (decyzja Filipa 26.11, E3 commit 5, z poprawką tego samego dnia).
//
// Do 26.11 pole notatki stało od razu, miało 1000 znaków, a przy wpisie z komentarzem w ogóle go nie było (zasada z 19.08).
// Synchronizacja z zegarka wpisuje do comment nazwę aktywności (intervals-sync, intervals-webhook: comment = a.name, np. „Morning Run”),
// więc przy wpisach z zegarka pola prawie nigdy nie było. Teraz: pole pojawia się po wyborze buzki, 3 linie, 16 px (iOS nie powiększa),
// 500 znaków, licznik od 400. Wpis z zegarka z komentarzem: komentarz jako szary podpis „Z zegarka: …” nad PUSTYM polem, nowy tekst
// doklejany po \n, limit liczy tylko nowy tekst. Wpis ręczny: komentarz stoi w polu do edycji (dziś „Jak poszło?” pyta tylko o wpisy
// z zegarka, więc to zabezpieczenie; sprawdzane na czystej funkcji i na HTML). Pusty tekst = pola comment nie wysyłamy.
// Bez sieci nic nie ginie: do 26.11 buzka (a z nią notatka) znikała przy pierwszym przerysowaniu z pamięci telefonu
// (powrót do aplikacji, ↺ zegarka). Teraz rozpoczęta odpowiedź zostaje na ekranie, a szkic (buzka i NOWY tekst) leży w pamięci telefonu.
// Widoczność komentarza sprawdzona w bazie 26.11 (metadane): SELECT na training_logs tylko właściciel i trener, widok
// public_training_logs bez comment, żadna funkcja w public nie czyta comment z training_logs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { strona, wpis, MODUL } = require('./_dzis-nowy-strona.js');

const Z_ZEGARKA = (z) => [wpis('l1', 3, Object.assign({ comment: null }, z || {}))];   // atrapa domyślnie ma comment = nazwa aktywności („Morning Run”)
const pokaz = async (o) => { const s = strona(o); s.B.start(); await s.doKonca(); return s; };
const pisz = (s, tekst) => { const p = s.jp('jp-notatka'); p.setAttribute('data-dn', 'jp-notatka'); p.value = tekst; s.korzen._zd.input({ target: { closest: () => p } }); };
const aktualizacje = (s) => s.zapytania.filter((q) => /update/.test(q.opis)).map((q) => q.opis);
const szkic = (s) => { const v = s.tel.mapa.get('dn_jp_szkic_l1'); return v ? JSON.parse(v) : null; };
const PUSTE_POLE = '<textarea data-dn="jp-notatka" rows="3" maxlength="500" aria-label="[^"]+" placeholder="Jak się czułeś\\? Co cieszyło, co bolało… \\(opcjonalnie\\)"><\\/textarea>';

test('(1) pole odczuć pod buzkami, przed „Zapisz raport”, schowane do wyboru buzki; po wyborze widać je', async () => {
  const s = await pokaz({ wpisy: Z_ZEGARKA() }), h = s.kafel('ostatni').innerHTML;
  assert.match(h, new RegExp('</div><div class="dn-jp-pole" data-dn="jp-pole" hidden>' + PUSTE_POLE + '<span class="dn-jp-licznik" data-dn="jp-licznik" aria-live="polite" hidden>0/500</span></div><div class="dn-jp-akcje">'),
    'kolejność: miny, pole, przyciski; bez komentarza bez podpisu');
  s.jp('jp-pole').hidden = true;   // atrapa węzła nie czyta atrybutu z HTML: ustawiamy jak przeglądarka
  s.dotknij('jp-mina', 'good');
  assert.equal(s.jp('jp-pole').hidden, false, 'po buzce pole widać');
});

test('(2) licznik od 400 znaków, ponad 500 na czerwono; tekst ponad 500 nie idzie (komunikat), buzka czeka', async () => {
  const s = await pokaz({ wpisy: Z_ZEGARKA() }); s.dotknij('jp-mina', 'mid');
  pisz(s, 'a'.repeat(399)); assert.equal(s.jp('jp-licznik').hidden, true);
  pisz(s, 'a'.repeat(400)); assert.equal(s.jp('jp-licznik').hidden, false); assert.equal(s.jp('jp-licznik').textContent, '400/500'); assert.equal(s.jp('jp-licznik').className, 'dn-jp-licznik');
  pisz(s, 'a'.repeat(501)); assert.equal(s.jp('jp-licznik').className, 'dn-jp-licznik dn-za-duzo');
  s.dotknij('jp-zapisz'); await s.tik();
  assert.deepEqual(aktualizacje(s), [], 'nic nie poszło'); assert.equal(s.jp('jp-kom').textContent, 'Notatka może mieć najwyżej 500 znaków. Skróć ją.');
  pisz(s, 'b'.repeat(500)); s.dotknij('jp-zapisz'); await s.tik();
  assert.deepEqual(aktualizacje(s), ['.update({"feel":"mid","comment":"' + 'b'.repeat(500) + '"}).eq("id","l1").select("id")']);
});

test('(3) zapis w tym samym update co buzka, to samo pole comment co kalendarz; pusty tekst = bez pola comment; zero nowych zapytań', async () => {
  const s = await pokaz({ wpisy: Z_ZEGARKA() }), przed = s.zapytania.length;
  s.dotknij('jp-mina', 'great'); pisz(s, '  lekko, nogi świeże  '); s.dotknij('jp-zapisz'); await s.doKonca();
  assert.deepEqual(aktualizacje(s), ['.update({"feel":"great","comment":"lekko, nogi świeże"}).eq("id","l1").select("id")']);
  assert.equal(s.zapytania.length, przed + 1, 'jedno zapytanie: ten sam update, który zapisuje buzkę');
  const p = await pokaz({ wpisy: Z_ZEGARKA() }); p.dotknij('jp-mina', 'good'); pisz(p, '    '); p.dotknij('jp-zapisz'); await p.tik();
  assert.deepEqual(aktualizacje(p), ['.update({"feel":"good"}).eq("id","l1").select("id")']);
});

test('(4) wpis z zegarka z komentarzem („Morning Run”): podpis „Z zegarka: …” (escape) nad PUSTYM polem; nowy tekst DOKLEJONY po \\n, pusty nie idzie', async () => {
  const m = await pokaz({ wpisy: Z_ZEGARKA({ comment: 'Morning Run' }) }), h = m.kafel('ostatni').innerHTML;
  assert.match(h, new RegExp('<div class="dn-jp-pole" data-dn="jp-pole" hidden><p class="dn-jp-zeg">Z zegarka: Morning Run</p>' + PUSTE_POLE + '<span class="dn-jp-licznik"[^>]*hidden>0/500</span>'), 'komentarz nie stoi w polu');
  m.dotknij('jp-mina', 'good'); pisz(m, '  Lekko, w końcu bez kolki '); m.dotknij('jp-zapisz'); await m.tik();
  assert.deepEqual(aktualizacje(m), ['.update({"feel":"good","comment":"Morning Run\\nLekko, w końcu bez kolki"}).eq("id","l1").select("id")'], 'doklejony, nie nadpisany');
  const pusty = await pokaz({ wpisy: Z_ZEGARKA({ comment: 'Morning Run' }) }); pusty.dotknij('jp-mina', 'mid'); pisz(pusty, '   '); pusty.dotknij('jp-zapisz'); await pusty.tik();
  assert.deepEqual(aktualizacje(pusty), ['.update({"feel":"mid"}).eq("id","l1").select("id")'], 'pusty: pola comment nie wysyłamy, „Morning Run” zostaje');
  const tenSam = await pokaz({ wpisy: Z_ZEGARKA({ comment: 'Morning Run' }) }); tenSam.dotknij('jp-mina', 'mid'); pisz(tenSam, 'Morning Run'); tenSam.dotknij('jp-zapisz'); await tenSam.tik();
  assert.deepEqual(aktualizacje(tenSam), ['.update({"feel":"mid","comment":"Morning Run\\nMorning Run"}).eq("id","l1").select("id")'], 'przy zegarku każdy niepusty tekst jest nowy: doklejamy');
  const x = await pokaz({ wpisy: Z_ZEGARKA({ comment: 'Bieg <b>poranny</b> & "wiatr"' }) });
  assert.match(x.kafel('ostatni').innerHTML, /<p class="dn-jp-zeg">Z zegarka: Bieg &lt;b&gt;poranny&lt;\/b&gt; &amp; &quot;wiatr&quot;<\/p>/);
  assert.match(MODUL, /#dzis-nowy \.dn-jp-zeg\{margin:10px 0 0;color:#8f8c97;font:400 13px\/1\.4 'DM Sans',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/, 'szary, 13 px, jedna linia z wielokropkiem');
});

test('(5) limit przy zegarku liczy tylko nowy tekst: długi komentarz z zegarka + 500 znaków idzie, 501 nie', async () => {
  const STARY = 'x'.repeat(480);
  const ok = await pokaz({ wpisy: Z_ZEGARKA({ comment: STARY }) }); ok.dotknij('jp-mina', 'good'); pisz(ok, 'y'.repeat(500));
  assert.equal(ok.jp('jp-licznik').textContent, '500/500', 'licznik liczy tylko pole'); ok.dotknij('jp-zapisz'); await ok.tik();
  assert.deepEqual(aktualizacje(ok), ['.update({"feel":"good","comment":"' + STARY + '\\n' + 'y'.repeat(500) + '"}).eq("id","l1").select("id")']);
  const za = await pokaz({ wpisy: Z_ZEGARKA({ comment: STARY }) }); za.dotknij('jp-mina', 'good'); pisz(za, 'y'.repeat(501)); za.dotknij('jp-zapisz'); await za.tik();
  assert.deepEqual(aktualizacje(za), []); assert.equal(za.jp('jp-kom').textContent, 'Notatka może mieć najwyżej 500 znaków. Skróć ją.');
});

test('(6) wpis ręczny (bez zegarka) z komentarzem: bez zmian, komentarz stoi w polu do edycji; czysta reguła zapisu dla obu rodzajów', () => {
  const B = strona().B, r = (z) => Object.assign(wpis('r1', 3, { comment: null }), { external_source: null }, z);
  const h = B.jakPoszloHtml(r({ comment: 'Kolka <b>na</b> 5 km' }), false, undefined, 'good');
  assert.match(h, /<div class="dn-jp-pole" data-dn="jp-pole"><textarea[^>]*>Kolka &lt;b&gt;na&lt;\/b&gt; 5 km<\/textarea>/, 'ręczny: komentarz w polu (escape), bez podpisu');
  assert.doesNotMatch(h, /dn-jp-zeg/);
  assert.doesNotMatch(B.jakPoszloHtml(r({ comment: '   ', external_source: 'intervals' }), false, undefined, 'good'), /dn-jp-zeg/, 'zegarek z pustym komentarzem: bez podpisu');
  const K = B.komentarzDoZapisu;
  // ręczny (doklej = false): jak było
  assert.equal(K('stary', '', false), null, 'pusty: nie wysyłamy');
  assert.equal(K('stary', '  stary ', false), null, 'bez zmian: nie ruszamy');
  assert.equal(K('stary', 'nowy', false), 'nowy', 'zmieniony: nowa wartość (zawodnik widział stary w polu)');
  assert.equal(K('x'.repeat(620), 'x'.repeat(620), false), null, 'długi bez zmian nie blokuje zapisu buzki');
  assert.equal(K('stary', 'y'.repeat(501), false), false);
  // zegarek (doklej = true)
  assert.equal(K('Morning Run', '', true), null); assert.equal(K('Morning Run', '  ', true), null);
  assert.equal(K('Morning Run', ' lekko ', true), 'Morning Run\nlekko');
  assert.equal(K('z'.repeat(900), 'y'.repeat(500), true), 'z'.repeat(900) + '\n' + 'y'.repeat(500), 'limit liczy tylko nowy tekst');
  assert.equal(K('Morning Run', 'y'.repeat(501), true), false);
});

test('(7) bez sieci: rozpoczęta odpowiedź zostaje przy przerysowaniu z pamięci telefonu (do 26.11 buzka i notatka ginęły), potem zapis się udaje', async () => {
  const s = await pokaz({ wpisy: Z_ZEGARKA({ comment: 'Morning Run' }) });
  s.dotknij('jp-mina', 'mid'); pisz(s, 'w pociągu, bez zasięgu');
  s.st.online = false; s.st.awaria = { '*': 'siec' };
  s.dotknij('jp-zapisz'); await s.doKonca();
  assert.equal(s.jp('jp-kom').textContent, 'Nie udało się zapisać. Spróbuj ponownie.', 'jak buzka: komunikat, wybór zostaje');
  const kafel = s.kafel('ostatni').innerHTML;
  s.B.wczytaj(true); await s.doKonca();
  assert.equal(s.kafel('ostatni').innerHTML, kafel, 'kafel nieprzerysowany z pamięci telefonu: buzka i tekst na ekranie');
  s.st.online = true; s.st.awaria = {};
  s.dotknij('jp-zapisz'); await s.doKonca();
  assert.equal(aktualizacje(s).pop(), '.update({"feel":"mid","comment":"Morning Run\\nw pociągu, bez zasięgu"}).eq("id","l1").select("id")');
  assert.equal(szkic(s), null, 'po udanym zapisie szkicu nie ma');
});

test('(8) szkic w pamięci telefonu trzyma tylko NOWY tekst: po zamknięciu aplikacji buzka i tekst wracają, podpis z zegarka osobno; „Pomiń” kasuje szkic', async () => {
  const s = await pokaz({ wpisy: Z_ZEGARKA({ comment: 'Morning Run' }) });
  s.dotknij('jp-mina', 'bad'); assert.deepEqual(szkic(s), { k: 'bad', t: '' }, 'pole puste także w przeglądarce');
  pisz(s, 'ból łydki');
  assert.deepEqual(szkic(s), { k: 'bad', t: 'ból łydki' }, 'w szkicu bez „Morning Run”');
  const p = await pokaz({ wpisy: Z_ZEGARKA({ comment: 'Morning Run' }), pamiec: s.tel.mapa });
  const h = p.kafel('ostatni').innerHTML;
  assert.match(h, /data-kod="bad" aria-pressed="true"/);
  assert.match(h, /<div class="dn-jp-pole" data-dn="jp-pole"><p class="dn-jp-zeg">Z zegarka: Morning Run<\/p><textarea[^>]*>ból łydki<\/textarea>/, 'pole widać, w nim tylko nowy tekst');
  assert.match(h, /class="dn-jp-zapisz dn-pelny"/);
  pisz(p, 'ból łydki'); p.dotknij('jp-zapisz'); await p.tik();
  assert.deepEqual(aktualizacje(p), ['.update({"feel":"bad","comment":"Morning Run\\nból łydki"}).eq("id","l1").select("id")'], 'zapis bez ponownego wyboru buzki, doklejony');
  const q = await pokaz({ wpisy: Z_ZEGARKA() }); q.dotknij('jp-mina', 'good'); assert.ok(szkic(q)); q.dotknij('jp-pomin'); assert.equal(szkic(q), null);
  const zly = await pokaz({ wpisy: Z_ZEGARKA({ comment: 'Morning Run' }), pamiec: new Map([['dn_jp_szkic_l1', '{"k":"<img>","t":5}']]) });
  assert.doesNotMatch(zly.kafel('ostatni').innerHTML, /aria-pressed="true"|<img>/, 'zepsuty szkic: mina spoza czwórki ignorowana');
  assert.match(zly.kafel('ostatni').innerHTML, /<div class="dn-jp-pole" data-dn="jp-pole" hidden><p class="dn-jp-zeg">Z zegarka: Morning Run<\/p><textarea[^>]*><\/textarea>/, 'tekst nie-napis: puste pole');
});

test('(9) style w duchu A3: 16 px (iOS bez powiększania), tło kafla, szare podpowiedź, podpis i licznik; licznik [hidden] naprawdę schowany', () => {
  assert.match(MODUL, /#dzis-nowy \.dn-jp textarea\{[^}]*background:#0f0f13;[^}]*font:400 16px\/1\.4 'DM Sans',sans-serif;/);
  assert.match(MODUL, /#dzis-nowy \.dn-jp textarea::placeholder\{color:#8f8c97\}/);
  assert.match(MODUL, /#dzis-nowy \.dn-jp-licznik\{display:block;[^}]*color:#8f8c97;/);
  assert.match(MODUL, /#dzis-nowy \.dn-jp-licznik\[hidden\]\{display:none\}/, 'display:block przebiłby atrybut hidden');
  assert.doesNotMatch(MODUL.match(/#dzis-nowy \.dn-jp(-licznik|-zeg| textarea)[^{]*\{[^}]*\}/g).join(''), /#ff7a45/, 'bez nowego pomarańczu');
});

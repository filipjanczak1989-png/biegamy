/* BLIZNA 187 / ZGŁOSZENIA TESTERA (6.11), bez zmian w zawodnik.html:
   2) karta i kafel akcji na Dziś od pierwszego obrazu z ostatniego stanu tego konta, bez adresów plików, potem dane z bazy w tym samym miejscu;
   6) konto testowe w grze zawsze na próbie, z każdego wejścia: cegły, złote i poziom lokalnie, Magazyn za złote z próby, mur ze wspólną sumą i próbą;
   5) dolny pasek zawsze, poza klawiaturą: okno Logu i arkusze kończą się nad nim (theme.css);
   7) menu gry od pierwszego obrazu z ostatnim znanym stanem konta;
   8) jedno tempo kroku Kasi i Filipa na kartach, rower według prędkości jazdy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const UID = '11111111-2222-3333-4444-555555555555';
const D = { wystartowala: true, wystartowala_at: '2026-11-07T08:00:00Z', start: '2026-11-07', nazwa: 'Akcja', imie: 'Fabianek', cel_km: 12500, suma_km: 1900, pct: 15.2,
  stawka_filip_gr: 10, filip_gr: 19000, filip_max_gr: 125000, url_zbiorki: 'https://www.siepomaga.pl/x', firmy: [],
  plakat_url: 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/plakat-akcji.webp?token=t', film_akcji_url: 'https://x/f.mp4?token=t', koparka_url: 'https://x/k.webp?token=t' };

function element(id) {
  const dzieci = {}, e = { id, innerHTML: '', style: {}, hidden: false, children: [], classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, appendChild(x) { e.children.push(x); x.parentNode = e; return x; }, removeChild(x) { e.children = e.children.filter((y) => y !== x); }, addEventListener() {},
    querySelector: (s) => (s === '.akcja-dzis' ? e.children.find((x) => x.className === 'akcja-dzis') || null : (dzieci[s] = dzieci[s] || element(s))), querySelectorAll: () => [] };
  return e;
}
function swiat(zapis) {
  const el = { 'akcja-karta': element('akcja-karta'), 'daily-motivation': element('daily-motivation') }, magazyn = Object.assign({}, zapis);
  const localStorage = { getItem: (k) => (k in magazyn ? magazyn[k] : null), setItem: (k, v) => { magazyn[k] = String(v); }, removeItem: (k) => { delete magazyn[k]; } };
  const document = { readyState: 'loading', addEventListener() {}, getElementById: (id) => el[id] || null, querySelectorAll: () => [], createElement: (t) => element(t), head: element('head') };
  const ctx = { document, localStorage, Date, JSON, Math, Number, String, Intl, setTimeout: () => 0, console };
  ctx.globalThis = ctx;
  vm.runInNewContext(czytaj('js/akcja.mjs'), ctx);
  return { ctx, el, magazyn };
}
const sesja = (uid) => ({ 'sb-afqojgkaveykxbltxzwm-auth-token': JSON.stringify({ user: { id: uid } }) });

test('Dziś: karta z bazy zapamiętana bez adresów plików, a następne wejście rysuje ją przed sb.js', () => {
  const a = swiat(sesja(UID));
  const html = a.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 42 });
  assert.ok(html.length > 0);
  const z = JSON.parse(a.magazyn[a.ctx.BM_AKCJA.KLUCZ_KARTY]);
  assert.equal(z.uid, UID); assert.equal(z.wklad.km, 42); assert.equal(z.d.suma_km, 1900);
  for (const k of ['film_akcji_url', 'koparka_url']) assert.ok(!(k in z.d), k + ': adres na 15 minut nie zostaje w pamięci');
  assert.equal(z.d.plakat_url, D.plakat_url, 'plakat prawdziwej akcji (adres roczny) zostaje, bo inaczej karta rośnie o plakat');
  a.ctx.BM_AKCJA.kartaDzisHtml(Object.assign({}, D, { testowa: true }), { km: 1 });
  assert.ok(!('plakat_url' in JSON.parse(a.magazyn[a.ctx.BM_AKCJA.KLUCZ_KARTY]).d), 'próba: plakat na 15 minut nie zostaje');
  a.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 42 });

  const b = swiat(Object.assign(sesja(UID), { [a.ctx.BM_AKCJA.KLUCZ_KARTY]: a.magazyn[a.ctx.BM_AKCJA.KLUCZ_KARTY] }));
  assert.ok(b.el['akcja-karta'].innerHTML.includes('Twój wkład') || b.el['akcja-karta'].innerHTML.length > 100, 'karta stoi od razu, w trakcie ładowania strony');
  assert.equal(b.el['akcja-karta'].style.display, '');
  const zW = JSON.parse(a.magazyn[a.ctx.BM_AKCJA.KLUCZ_KARTY]); zW.wys = 875;
  const c2 = swiat(Object.assign(sesja(UID), { [a.ctx.BM_AKCJA.KLUCZ_KARTY]: JSON.stringify(zW) }));
  assert.equal(c2.el['akcja-karta'].style.minHeight, '875px', 'szkielet ostatniej wysokości');
  c2.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 43 });
  assert.equal(c2.el['akcja-karta'].style.minHeight, '', 'dane z bazy zdejmują szkielet');
  assert.ok(b.el['daily-motivation'].children.length > 0, 'kafel w banerze też');
});

test('Dziś: karty z pamięci nie ma dla innego konta, po dobie, przed startem i po „od zera”', () => {
  const a = swiat(sesja(UID)); a.ctx.BM_AKCJA.kartaDzisHtml(D, { km: 1 }); const K = a.ctx.BM_AKCJA.KLUCZ_KARTY, zapis = a.magazyn[K];
  assert.equal(swiat(Object.assign(sesja('inne-konto'), { [K]: zapis })).el['akcja-karta'].innerHTML, '', 'inne konto na tym telefonie');
  assert.equal(swiat({ [K]: zapis }).el['akcja-karta'].innerHTML, '', 'bez sesji');
  const stary = JSON.parse(zapis); stary.t -= 25 * 3600 * 1000;
  assert.equal(swiat(Object.assign(sesja(UID), { [K]: JSON.stringify(stary) })).el['akcja-karta'].innerHTML, '', 'starsze niż doba');
  a.ctx.BM_AKCJA.kartaDzisHtml({ wystartowala: false, start: '2026-11-07' }, null);
  assert.ok(!(K in a.magazyn), 'stan inny niż „trwa” kasuje pamięć');
  const s = czytaj('js/akcja.mjs');
  assert.match(s, /if \(!g\.document \|\| !g\.fetch \|\| !g\.SB_URL\) return null;/, 'przed sb.js nie pytamy o grę pod zły adres');
  assert.ok(czytaj('zawodnik.html').indexOf('<script src="js/akcja.mjs">') > czytaj('zawodnik.html').indexOf('<div id="akcja-karta"'), 'skrypt pod znacznikiem karty');
});

test('gra: konto testowe na próbie z każdego wejścia, złote i mur z próby, Magazyn lokalnie', () => {
  const K = czytaj('js/cegielki-konto.js'), A = czytaj('js/akcja.mjs'), F = czytaj('dla-fabianka.html');
  assert.match(K, /if \(parametry\.get\("proba"\) === "1"\) try \{ localStorage\.setItem\(KLUCZ_KONTA_PROBY, sesja\.user\.id\); \}/, 'wejście z kafla zapamiętuje konto od razu');
  const p = K.slice(K.indexOf('if (kontoProbyZPamieci(sesja.user.id)) {'), K.indexOf('else if (parametry.get("sciezka") === "1") await sciezkaGry();'));
  assert.ok(p.indexOf('stan.podglad = true;') >= 0 && p.indexOf('stan.podglad = true;') < p.indexOf('await sciezkaGry(true'), 'na próbie przed odpowiedzią funkcji: wczesna runda liczy się lokalnie');
  assert.match(p, /if \(!\(await sciezkaGry\(true, sesja\.user\.id\)\)\) \{ stan\.podglad = false; stan\.kontoProby = false; stan\.cegly = ceglySerwera;/, 'odmowa funkcji: z powrotem zwykłe konto');
  assert.match(K, /if \(bylo !== null && bylo !== String\(od\)\) Object\.keys\(localStorage\)/, 'kasuje tylko zmiana chwili startu (Od zera), nie pierwsza odpowiedź');
  assert.match(K, /status === 403\) try \{ localStorage\.removeItem\(KLUCZ_KONTA_PROBY\); \}/, 'odmowa funkcji kasuje znacznik');
  assert.doesNotMatch(K, /from\("athletes"\)/, 'gra nie czyta athletes (blizna-154)');
  assert.match(A, /czyProba\(d\) \? "gra-cegielki\.html\?sciezka=1&podglad=1&proba=1"/, 'kafel konta testowego');
  assert.match(czytaj('start-akcji.html'), /\['gra-cegielki\.html\?sciezka=1', 'Gra ›'\]/, 'trener ze ścieżki bez znacznika próby');
  assert.match(F, /if \(A\.linkGry\) \{ \$\('gra'\)\.href = A\.linkGry\(d\);/, 'strona próby prowadzi do gry na próbie');
  assert.match(K, /if \(kontoTestowe\) \{ ustawPodglad\(w\); return true; \}/, 'bez przełącznika, którego odznaczenie wracało do 0 z bazy');
  assert.match(K, /KLUCZE_PROBY = \/\^cegielki_\(suma\|saldo\|/);
  assert.match(K, /ustawKonto\(\(stan\.saldo \|\| 0\) \+ \(\(w\.st && w\.st\.zlote\) \|\| 0\)\); zapiszJson\("cegielki_saldo", stan\.saldo\);/, 'złote z rundy próby');
  assert.match(K, /stan\.ranking = murProby\(await pobierzRanking\(\)\)/); assert.match(K, /stan\.ranking = murProby\(d\)/);
  assert.match(K, /!premiera && !stan\.kontoProby\) document\.body\.classList\.add\("gra-zamknieta"\)/, 'gra przed startem nie zamyka się kontu testowemu');
  assert.match(K, /if \(przyklad \|\| stan\.podglad\) \{   \/\/ próba: wymiana na tym urządzeniu/);
  assert.doesNotMatch(K, /Podgląd postaci: bez wymiany\./);
  assert.ok(!/rpc\("gra_(zapisz_wynik|start_rundy|kup)"/.test(K.slice(K.indexOf('if (stan.podglad) {'), K.indexOf('/* Bez konta suma żyje tylko'))), 'próba nic nie zapisuje w bazie');
});

test('gra: menu od pierwszego obrazu z ostatnim stanem tego konta', () => {
  const K = czytaj('js/cegielki-konto.js');
  assert.match(K, /if \(o && o\.uid === uid\) \{ stan\.cegly = Number\(o\.cegly\) \|\| 0;/, 'tylko to samo konto');
  assert.ok(K.lastIndexOf('ostatniStan();') < K.lastIndexOf('rysujPostacie();\n  window.BM_CEGIELKI_KONTO'), 'stan z pamięci przed pierwszym rysowaniem menu');
  assert.match(K, /function zapamietajStan\(\) \{\n\s+if \(!stan\.zalogowany \|\| przyklad\) return;/);
  assert.match(K, /podpowiedzImie\(\); rysujPostacie\(\); zapamietajStan\(\);/, 'po odczycie z bazy');
  assert.match(K, /if \(o\.proba\) stan\.kontoProby = true; \} \} catch/, 'konto próby: gra otwarta od razu, zanim odpowie funkcja');
});

test('gra: jedno tempo kroku Kasi i Filipa, rower szybciej o tempo jazdy', () => {
  const h = czytaj('gra-cegielki.html'), L = czytaj('js/cegielki-logika.mjs');
  const krok = (p) => Number(new RegExp('\\.postac\\[data-postac="' + p + '"\\] \\{ --krok:([0-9.]+)s').exec(h)[1]);
  assert.equal(krok('kasia'), krok('filip'));
  const tempo = Number(/rowerzysta: \{ tempo: ([0-9.]+),/.exec(L)[1]);
  assert.ok(Math.abs(krok('rowerzysta') - krok('filip') / tempo) < 0.01, 'rower: ' + krok('rowerzysta'));
  assert.match(czytaj('js/cegielki.js'), /g\.anim \+= dt \* \(9 \+ g\.v \/ 34\);/, 'w rundzie klatki od prędkości, jedna reguła dla wszystkich');
});

test('dolny pasek: okno Logu i arkusze kończą się nad nim, a pasek stoi nad nakładką', () => {
  const T = czytaj('theme.css').replace(/\r/g, '');
  assert.match(T, /body:has\(#nav-mount \.bottom-nav\) \.modal-bg,\nbody:has\(#nav-mount \.bottom-nav\) \.add-overlay\{ bottom:calc\(89px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
  assert.match(T, /body:has\(\.modal-bg\.open\) #nav-mount,\nbody:has\(\.add-overlay\.open\) #nav-mount\{ z-index:310; \}/);
  assert.match(T, /\.modal-bg \.modal\{ max-height:calc\(90vh - 89px/, 'góra okna Logu tam, gdzie była');
  assert.ok(Number(/\.add-overlay\{position:fixed;inset:0;z-index:(\d+)/.exec(T)[1]) < 310, 'pasek nad arkuszem');
  assert.ok(Number(/\.modal-bg\{position:fixed;inset:0;background:rgba\(0,0,0,0\.82\);z-index:(\d+)/.exec(czytaj('zawodnik.html'))[1]) < 310, 'pasek nad oknem Logu');
});

test('gra: napisy z obrysem z pamięci, liczby wprost, napisy skoków gotowe przed rundą', () => {
  const G = czytaj('js/cegielki.js');
  const t = G.slice(G.indexOf('function tekst(t, xs, ys, roz, kol, wyr)'), G.indexOf('function rysujNiebo'));
  assert.match(t, /if \(!o && \(\/\[0-9\]\/\.test\(t\) && !rozgrzewka\)\) \{ x\.strokeText\(t, xs, ys\); x\.fillText\(t, xs, ys\); return; \}/, 'wynik i czas bez tworzenia płócien');
  assert.match(t, /x\.drawImage\(o\.cv, x0, ys - o\.h \/ 2, o\.w, o\.h\);/);
  assert.match(t, /x\.font = font; x\.textAlign = wyr \|\| "left";/, 'stan kontekstu jak dawniej (measureText wyzwania dnia)');
  assert.match(G, /NAPISY\.size >= MAKS_NAPISOW \? NAPISY\.keys\(\)\.next\(\)\.value : null/, 'płótno najdawniej użytego idzie pod nowy');
  const r = G.slice(G.indexOf('function rozgrzejObrazy'), G.indexOf('function bitmapyPostaci'));
  assert.match(r, /rozgrzejNapisy\(\);/, 'przed rundą');
  assert.match(G, /lista\.push\(\[\(k > 1 \? "Combo ×" \+ k \+ ": " : ""\) \+ n \+ "!", 26, "#9df0a8"\]\)/, 'te same napisy, rozmiar i kolor co przy lądowaniu');
  assert.match(G, /\(combo > 1 \? "Combo ×" \+ combo \+ ": " : ""\) \+ \(g\.postac === "rowerzysta" \? "Podbicie" : nrTriku >= 0 \? L\.NAZWY_TRIKOW\[nrTriku\] : "Salto"\) \+ "!", graczX\(\) \+ 20, stopy\(\) - 150, "#9df0a8", 26\)/);
});

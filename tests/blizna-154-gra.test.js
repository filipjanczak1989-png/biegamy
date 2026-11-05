/* BLIZNA 154 (4.11.2026) — GRA „CEGIEŁKI”. Strażnik tekstu i czystej logiki, bez bazy; zachowanie bazy sprawdza tools/gra-test.sh.
   Pilnuje decyzji Filipa, które łatwo zepsuć poprawką „przy okazji”:
   - gra NIGDY nie zmienia licznika akcji ani statystyk treningowych: front woła tylko RPC gra_*, migracja pisze tylko do tabel gra_*;
   - anon nie dostaje niczego: ranking dla niezalogowanych idzie przez EF z kluczem serwisowym do jednego RPC;
   - pseudonim wyłącznie po moderacji, tym samym filtrem w przeglądarce i w EF (kopia pliku, bo w Deno nie ma <script src>);
   - dane z rankingu są niezaufane: bez innerHTML;
   - pułap wyniku na serwerze wynika z pomiaru przy danym balansie: zmiana COMBO_MAKS = nowy pomiar;
   - żadnych znaków kierunku ani celu wyprawy w grze (sekret). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8').replace(/\r/g, '');
const vm = require('node:vm');
const FRONT = ['gra-cegielki.html', 'js/cegielki.js', 'js/cegielki-logika.mjs', 'js/cegielki-konto.js', 'js/cegielki-stroj.js', 'js/cegielki-przypiecia.js'];
const MIG = 'supabase/migrations/20261105_gra_cegielki.sql';
const bezKomentarzySql = (s) => s.replace(/--[^\n]*/g, '');
const bezKomentarzyJs = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
require(path.join(KORZEN, 'js/moderacja.mjs'));
require(path.join(KORZEN, 'js/cegielki-logika.mjs'));
const M = globalThis.BM_MODERACJA, L = globalThis.BM_CEGIELKI;

test('front gry woła wyłącznie RPC gra_* i czyta wyłącznie gra_konto', () => {
  for (const p of FRONT) {
    const t = bezKomentarzyJs(czytaj(p));
    for (const m of t.matchAll(/\.rpc\(\s*["'`]([^"'`]+)/g)) assert.ok(/^gra_/.test(m[1]) || ['premiera_szefa_zapisz', 'bonus_treningu_odbierz'].includes(m[1]), `${p}: rpc ${m[1]}`);   // dwa wyjątki: premiera (blizna-166) i bonus za trening (blizna-172) czytają akcję albo treningi, piszą wyłącznie do tabel gry
    for (const m of t.matchAll(/\.from\(\s*["'`]([^"'`]+)/g)) assert.equal(m[1], 'gra_konto', `${p}: from ${m[1]}`);
    for (const m of t.matchAll(/functions\.invoke\(\s*["'`]([^"'`]+)/g)) assert.ok(['gra-pseudonim', 'akcja-proba-wizerunek'].includes(m[1]), `${p}: invoke ${m[1]}`);   // akcja-proba-wizerunek: tylko podgląd postaci w ścieżce próby, odczyt
    assert.doesNotMatch(t, /training_logs|athlete_stats|akcja_(?:deklaruj|startujacy|sponsorzy|licznik\b)|\.from\(\s*["'`]akcj/, p);
  }
});

test('migracja pisze tylko do tabel gra_* i nie zna treningów ani akcji', () => {
  const t = bezKomentarzySql(czytaj(MIG));
  for (const m of t.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+([a-z_.]+)/gi)) {
    if (/^(set|of)$/i.test(m[1])) continue;
    assert.match(m[1], /^public\.gra_/, `zapis do ${m[1]}`);
  }
  assert.doesNotMatch(t, /training_logs|achievements|public\.akcja_/i);
  assert.match(t, /add column gra_aktywna boolean not null default false/, 'gra domyślnie zamknięta');
});

/* Uprawnienia zapisu i zapis pseudonimu tylko dla service_role sprawdzają po skutku asercje na końcu migracji i tools/gra-test.sql (kroki 1, 2). */
test('anon nie dostaje niczego; RLS włączone', () => {
  const t = bezKomentarzySql(czytaj(MIG));
  for (const m of t.matchAll(/\bgrant\b[^;]*;/gi)) assert.doesNotMatch(m[0], /\banon\b|\bpublic\s*;/i, m[0]);
  for (const tab of ['gra_konto', 'gra_rundy', 'gra_wyniki', 'gra_podejrzane']) assert.ok(t.includes(`alter table public.${tab} enable row level security`), tab);
  assert.doesNotMatch(t, /jsonb_build_object\('miejsce', x\.miejsce[^)]*athlete/, 'ranking bez identyfikatorów');
});

test('EF rankingu: dwa RPC, bez .from(), publiczna; EF pseudonimu: użytkownik z tokena, filtr, jedno RPC', () => {
  const r = czytaj('supabase/functions/gra-ranking/index.ts'), p = czytaj('supabase/functions/gra-pseudonim/index.ts'), bezKom = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.deepEqual([...bezKom(r).matchAll(/\.rpc\(\s*'([^']+)/g)].map((m) => m[1]), ['gra_ranking', 'gra_token_ok']);
  assert.doesNotMatch(bezKom(r), /\.from\(/);
  assert.deepEqual([...bezKom(p).matchAll(/\.rpc\(\s*'([^']+)/g)].map((m) => m[1]), ['gra_ustaw_pseudonim']);
  assert.doesNotMatch(bezKom(p), /\.from\(/);
  assert.match(p, /auth\.getUser\(jwt\)/);
  assert.match(p, /p_user: user\.id/);
  assert.match(p, /MODERACJA\.pseudonim\(/);
  assert.match(p, /import '\.\.\/_shared\/moderacja\.mjs'/);
  const k = czytaj('supabase/config.toml');
  assert.match(k, /\[functions\.gra-ranking\]\nverify_jwt = false/);
  assert.match(k, /\[functions\.gra-pseudonim\]\nverify_jwt = true/);
});

test('filtr w EF to dokładna kopia filtra z przeglądarki', () => {
  assert.equal(czytaj('supabase/functions/_shared/moderacja.mjs'), czytaj('js/moderacja.mjs'));
});

test('dane z rankingu nie przechodzą przez innerHTML', () => {
  for (const p of ['js/cegielki-konto.js', 'js/cegielki-stroj.js']) assert.doesNotMatch(bezKomentarzyJs(czytaj(p)), /innerHTML|insertAdjacentHTML|document\.write/, p);
});

test('sb.js tylko przy sesji: gracz z Facebooka nie pobiera reszty aplikacji', () => {
  const t = czytaj('js/cegielki-konto.js');
  assert.match(t, /if \(!czyJestSesja\(\)\) return;\n\s*await skrypt\("vendor\/supabase-js/);
  assert.doesNotMatch(czytaj('gra-cegielki.html'), /<script[^>]+sb\.js/);
});

test('podgląd rankingu z atrapą nigdy na produkcji', () => {
  assert.match(czytaj('js/cegielki-konto.js'), /=== "przyklad" && location\.hostname !== "biegamy\.run" && location\.hostname !== "run\.biegamy\.app"/);
});

test('pułapy wyniku i balans idą w parze: zmiana balansu = nowy pomiar', () => {
  assert.equal(L.COMBO_MAKS, 5);
  assert.match(czytaj(MIG), /GRA_MAKS_NA_S constant numeric := 40;/);
  assert.match(czytaj(MIG), /ZLOTE_MAKS_NA_S constant numeric := 0\.5;/);
  assert.match(czytaj('js/cegielki.js'), /Math\.min\(g\.comboSalt, L\.COMBO_MAKS\)/);
  assert.match(czytaj('js/cegielki.js'), /BIDON_S = 5\b/);
  assert.match(czytaj(MIG), /BIDON_S constant numeric := 5;/);
});

test('sklepik: ceny w grze i w bazie są te same, wszystko za złote cegły z gry', () => {
  const sql = czytaj(MIG);
  const wBazie = Object.fromEntries([...sql.matchAll(/when '([a-z-]+)' then (\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const naSprzedaz = L.SKLEP.filter((p) => !p.tylkoCzolowka && !p.tylkoSeria);
  for (const p of naSprzedaz) assert.equal(wBazie[p.id], p.cena, p.id);
  assert.equal(wBazie.korona, undefined, 'korona nie jest na sprzedaż: tylko czołówka rankingu dnia');
  for (const u of L.ULEPSZENIA) assert.equal(wBazie[u.id], u.cena, u.id);
  assert.equal(Object.keys(wBazie).length, naSprzedaz.length + L.ULEPSZENIA.length, 'przedmiot w bazie bez odpowiednika w grze');
  const id = L.SKLEP.map((p) => p.id); assert.equal(new Set(id).size, id.length);
  for (const p of L.SKLEP) {
    assert.ok(L.SLOTY.includes(p.slot), p.id);
    if (p.rodzaj === 'dodatek') { assert.ok(L.DODATKI[p.id], 'dodatek bez ułożenia: ' + p.id); assert.ok(fs.existsSync(path.join(KORZEN, 'assets/gra/dodatek_' + p.id + '.webp')), 'dodatek bez pliku: ' + p.id); }
    else assert.ok(Array.isArray(p.kolor) && p.kolor.length === 3, p.id);
  }
  const front = FRONT.map((p) => bezKomentarzyJs(czytaj(p))).join('\n');
  assert.doesNotMatch(front, /checkout|płatnoś|platnos|(?<!\p{L})(?:pln|zł|blik|przelew|stripe)(?!\p{L})/iu, 'żadnych prawdziwych pieniędzy w grze');
  const widoczne = FRONT.flatMap((p) => {
    const t = bezKomentarzyJs(czytaj(p));
    return p.endsWith('.html') ? [t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')] : (t.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) || []);
  });
  const przelicznik = /(?:cegł|cegie)\p{L}*[^.\n]{0,30}(?:=|warta|warte|wart|kosztuje)\s*\d/iu;
  assert.ok(przelicznik.test('1 cegła = 5') && przelicznik.test('cegiełka warta 10'), 'wzorzec przelicznika musi łapać przykład');
  for (const t of widoczne) assert.doesNotMatch(t, przelicznik, 'żadnego przelicznika cegła = pieniądze');
});

test('strój: zapis z przeglądarki nie zakłada czegoś, czego gracz nie ma', () => {
  const pusty = { tulow: null, spodenki: null, glowa: null, oczy: null, szyja: null, plecy: null };
  assert.deepEqual(L.poprawnyStroj({ tulow: 'koszulka-zlota', glowa: 'kask-rowerowy' }, ['kask-rowerowy']), { ...pusty, glowa: 'kask-rowerowy' });
  assert.deepEqual(L.poprawnyStroj({ tulow: 'kask-rowerowy' }, ['kask-rowerowy']), pusty, 'przedmiot na złym miejscu');
  assert.deepEqual(L.poprawnyStroj(null, null), pusty);
  assert.deepEqual(L.poprawnyStroj('śmieć', 'śmieć'), pusty);
  assert.deepEqual(L.poprawnyStroj({ oczy: 'okulary', plecy: 'peleryna' }, ['okulary', 'peleryna']), { ...pusty, oczy: 'okulary', plecy: 'peleryna' });
});

test('korona: nie do kupienia, tylko pierwsza dziesiątka rankingu dnia', () => {
  const pusty = { tulow: null, spodenki: null, glowa: null, oczy: null, szyja: null, plecy: null };
  assert.deepEqual(L.poprawnyStroj({ glowa: 'korona' }, ['korona'], false), pusty, 'wpis w zapisie nie daje korony');
  assert.deepEqual(L.poprawnyStroj({ glowa: 'korona' }, [], true), { ...pusty, glowa: 'korona' });
  const lista = Array.from({ length: 12 }, (_, i) => ({ miejsce: i + 1, pseudonim: 'Gracz' + 'abcdefghijkl'[i] }));
  assert.equal(L.maKorone({ dzien: lista }, 'Graczj'), true, 'miejsce 10');
  assert.equal(L.maKorone({ dzien: lista }, 'GRACZA'), true, 'bez znaczenia wielkość liter');
  assert.equal(L.maKorone({ dzien: lista }, 'Graczk'), false, 'miejsce 11');
  assert.equal(L.maKorone({ dzien: lista }, null), false);
  assert.equal(L.maKorone(null, 'Gracza'), false);
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /p\.tylkoCzolowka && czyKorona\(\)/, 'w sklepiku korona bez wymiany');
  assert.doesNotMatch(bezKomentarzySql(czytaj(MIG)).slice(bezKomentarzySql(czytaj(MIG)).indexOf('create function public.gra_kup')), /korona/);
});

test('punkty przypięcia: po jednym na każdą klatkę każdego arkusza, w granicach klatki', () => {
  const atlas = JSON.parse(czytaj('assets/gra/atlas.json'));
  const piaskownica = {}; vm.runInNewContext(czytaj('js/cegielki-przypiecia.js'), { window: piaskownica });
  const P = piaskownica.BM_CEGIELKI_PRZYPIECIA;
  let ile = 0;
  for (const postac of ['kasia', 'filip', 'rowerzysta']) {
    const arkusze = Object.keys(atlas).filter((k) => k.startsWith(postac + '_')).map((k) => k.slice(postac.length + 1));
    assert.ok(arkusze.length >= 2, postac);
    for (const ark of arkusze) {
      const at = atlas[postac + '_' + ark], pkt = P[postac][ark];
      assert.ok(pkt, postac + ark); assert.equal(pkt.length, at.n, postac + ark);
      pkt.forEach((p, i) => {
        ile++;
        assert.equal(p.length, 9, postac + ark + i);
        assert.ok(p[0] >= 0 && p[0] <= at.cw && p[1] >= 0 && p[1] <= at.ch, 'głowa poza klatką: ' + postac + ark + i);
        assert.ok(p[5] >= -5 && p[5] <= at.cw + 5 && p[6] >= -5 && p[6] <= at.ch + 5, 'szyja poza klatką: ' + postac + ark + i);
        assert.ok(p[2] > 8 && p[2] < 25, 'promień głowy: ' + postac + ark + i);
        assert.ok(Math.abs(p[3]) < 7 && Math.abs(p[7]) < 7);
        assert.ok(Math.hypot(p[0] - p[5], p[1] - p[6]) < p[2] * 2.2, 'szyja daleko od głowy: ' + postac + ark + i);
        if (ark === 'bud' || postac === 'rowerzysta') assert.equal(p[8], 1, 'kask: ' + postac + ark + i);
      });
    }
  }
  assert.equal(ile, 142);
  assert.deepEqual(Array.from(P.filip.G, (p) => p[8]), [0, 0, 0, 1, 1, 1], 'kask pojawia się w połowie przemiany');
  const st = czytaj('js/cegielki-stroj.js');
  assert.match(st, /\/_bud\$\/\.test\(n\)/, 'forma budowniczego bez przemalowania: to sygnał tarczy');
  assert.match(st, /d\.slot === "glowa" && pk\[8\]/, 'na kasku bez czapek');
  const s = czytaj('js/cegielki.js');
  assert.match(s, /x\.rotate\(obrot\); x0 = -w \/ 2/, 'w salcie dodatek w tym samym obrocie co postać');
});

test('poziomy: te same progi w grze i w bazie, krzywa rosnąca, 20 poziomów', () => {
  assert.equal(L.POZIOMY.length, 20);
  assert.equal(L.POZIOMY[0], 0);
  for (let i = 1; i < L.POZIOMY.length; i++) assert.ok(L.POZIOMY[i] > L.POZIOMY[i - 1], 'próg ' + i);
  const sql = bezKomentarzySql(czytaj('supabase/migrations/20261106_gra_poziomy.sql')), m = sql.match(/unnest\(array\[([0-9, ]+)\]::bigint\[\]\)/);
  assert.ok(m, 'progi w migracji');
  assert.deepEqual(m[1].split(',').map(Number), L.POZIOMY);
  assert.equal(L.poziom(0), 1); assert.equal(L.poziom(99), 1); assert.equal(L.poziom(100), 2); assert.equal(L.poziom(10400), 10); assert.equal(L.poziom(52199), 19); assert.equal(L.poziom(5e6), 20);
  assert.equal(L.postepPoziomu(5e6).nastepny, null);
  assert.equal(L.postepPoziomu(150).brakuje, 150);
});

test('postacie do odblokowania: poziom 10, poziom 20 albo mur, tylko za przełącznikami', () => {
  assert.equal(L.odblokowana('kasia', 0), true);
  assert.equal(L.odblokowana('rowerzysta', 10399), false); assert.equal(L.odblokowana('rowerzysta', 10400), true);
  assert.equal(L.odblokowana('rowerzysta', 0, 13000000), false, 'mur otwiera tylko koparkę');
  assert.equal(L.odblokowana('koparka', 52199), false); assert.equal(L.odblokowana('koparka', 52200), true);
  assert.equal(L.odblokowana('koparka', 0, 1249999), false); assert.equal(L.odblokowana('koparka', 0, 1250000), true);
  assert.equal(L.odblokowana('nie-ma', 9e9, 9e9), false);
  assert.equal(L.POSTACIE.rowerzysta.tempo, 1.1); assert.ok(Math.abs(L.POSTACIE.rowerzysta.skok ** 2 - 0.8) < 1e-9, 'wysokość skoku 80%');
  assert.equal(L.POSTACIE.koparka.tempo, 0.85); assert.equal(L.POSTACIE.koparka.skacze, false);
  const s = L.strojPostaci({ tulow: 'kamizelka', glowa: 'korona', oczy: 'okulary', szyja: 'medal', plecy: 'peleryna' }, 'rowerzysta');
  assert.deepEqual(s, { tulow: null, spodenki: null, glowa: null, oczy: 'okulary', szyja: 'medal', plecy: 'peleryna' }, 'na kasku tylko to, co pasuje');
  assert.deepEqual(L.strojPostaci({ oczy: 'okulary' }, 'koparka'), { tulow: null, spodenki: null, glowa: null, oczy: null, szyja: null, plecy: null }, 'na rysunku dziecka nic');
  assert.equal(L.imieZPodpisu('Imię Nazwisko na rowerze'), 'Imię'); assert.equal(L.imieZPodpisu(null), '');
  const silnik = czytaj('js/cegielki.js'), konto = czytaj('js/cegielki-konto.js'), html = czytaj('gra-cegielki.html');
  assert.match(silnik, /!\/\^\(kasia\|filip\|rowerzysta\|dodatek\)_\/\.test\(k\)/, 'arkusze roweru nie wczytują się same przy starcie strony');
  assert.match(konto, /d\.rowerzysta === true && window\.BM_CEGIELKI_GRA\) \{ window\.BM_CEGIELKI_GRA\.wlaczRowerzyste\(\); wlaczPostacRoweru/);
  assert.match(konto, /d\.postac_koparki === true/);
  for (const id of ['rowerzysta', 'koparka']) assert.match(html, new RegExp('data-postac="' + id + '" hidden'), 'karta ukryta do odblokowania: ' + id);
  assert.doesNotMatch(html + konto, /p-zamek|\.postac\.zablokowana|classList[^\n]*"zablokowana"/, 'zablokowanych postaci nie pokazujemy wcale, bez sylwetek i kłódek');
  assert.match(konto, /b\.hidden = !\(widoczna && gotowa\)/);
  assert.match(html, /Nowa postać odblokowana!/);
  assert.match(konto, /"cegielki_nowe"/, 'animacja raz na urządzenie');
  for (const p of ['kasia', 'filip', 'rowerzysta']) {
    const z = L.zasiegPostaci(p), k = L.wysokoscKasku(p, false);
    assert.ok(k > z.zwykly && k < z.maks, p + ': kask wymaga najmocniejszego ruchu i jest w zasięgu');
  }
  assert.ok(L.wysokoscKasku('koparka', false) > L.zasiegPostaci('koparka').zwykly && L.wysokoscKasku('koparka', false) < L.zasiegPostaci('koparka').maks, 'koparka sięga kasku łyżką');
  assert.equal(L.wysokoscKasku('kasia', true), 150, 'Mały budowniczy łatwiej');
  const mig = bezKomentarzySql(czytaj(MIG));
  assert.match(mig, /fabianek_postac_gra boolean not null default false/);
  assert.match(mig, /when not public\.gra_postac_odblokowana\(p_postac, v_konto\) then 'postac_zablokowana'/, 'serwer sprawdza odblokowanie');
});

test('rower i koparka nie mają związku z licznikiem akcji ani statystykami treningów', () => {
  const mig = bezKomentarzySql(czytaj(MIG)), zapis = mig.slice(mig.indexOf('create function public.gra_zapisz_wynik'), mig.indexOf('create function public.gra_token_ok'));
  assert.doesNotMatch(zapis, /training_logs|akcja_|achievements|athlete_stats|km\b|(?:update|insert into|delete from) public\.akcje/);
  for (const p of FRONT) assert.doesNotMatch(bezKomentarzyJs(czytaj(p)), /training_logs|akcja_licznik_dopisz|\.from\("akcj/, p);
});

test('koparka grywalna: arkusz tajny do startu, nie ma go w repo ani na obrazku do udostępnienia', () => {
  const dobry = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/a.webp?token=abc.def-1';
  assert.equal(L.arkuszKoparki({ wystartowala: true, koparka_arkusz_url: dobry }), dobry);
  assert.equal(L.arkuszKoparki({ wystartowala: false, koparka_arkusz_url: dobry }), '', 'przed startem nic');
  for (const zly of ['https://zly.example/storage/v1/object/sign/akcja-wizerunek/a.webp?token=a', 'assets/gra/x.webp', null, 5]) assert.equal(L.arkuszKoparki({ wystartowala: true, koparka_arkusz_url: zly }), '', String(zly));
  const atlas = JSON.parse(czytaj('assets/gra/atlas.json'));
  assert.ok(!Object.keys(atlas).some((k) => /koparka/.test(k)), 'arkusza nie ma w atlasie');
  assert.ok(!fs.readdirSync(path.join(KORZEN, 'assets/gra')).some((f) => f !== 'koparka.webp' && /koparka|fabian/i.test(f)), 'ani w assets; koparka.webp to zwykła maszyna bez postaci');
  assert.ok(fs.statSync(path.join(KORZEN, 'assets/gra/koparka.webp')).size < 30 * 1024, 'zwykła koparka, nie arkusz postaci');
  const s = bezKomentarzyJs(czytaj('js/cegielki.js')), ob = s.slice(s.indexOf('function obrazekWyniku'), s.indexOf('function info(t)'));
  assert.doesNotMatch(ob, /koparkaObraz|OBR\.koparka_ark/);
  assert.match(s, /if \(G\.postac === "koparka"\) return \{ n: "koparka_ark", ark: null/, 'pz.ark null: obrazek bez rysunku');
  assert.match(czytaj('tools/arkusz-z-kratki.py'), /ODMOWA: rysunek jest tajny/);
  assert.equal(L.KLATKI_KOPARKI.ile, 6);
  assert.deepEqual(L.KLATKI_KOPARKI.jazda, [0, 1]);
});

test('przemiana: praca na starcie rundy, nietykalność 1 s, świat nie zwalnia', () => {
  const s = bezKomentarzyJs(czytaj('js/cegielki.js'));
  assert.match(s, /CZAS_NIETYKALNY_PRZEMIANA = 1\b/);
  assert.doesNotMatch(s, /TEMPO_PRZEMIANY/, 'bez spowolnienia świata w czasie przemiany');
  assert.match(s, /bitmapyPostaci\(naz\)\.then\(function \(\) \{ return D\.przygotuj\(\); \}\)\.then\(rozgrzejObrazy\)/, 'bitmapy, dźwięk i rozgrzanie przed rundą');
  assert.match(s, /co === "przemiana" && this\.gotowe\.przemiana/, 'w chwili kasku gotowy bufor');
  assert.match(s, /buforSzumu: function/, 'szum liczony raz');
  assert.match(s, /parametry\.has\("diag"\)/, 'liczby z prawdziwego telefonu');
  const kl = s.slice(s.indexOf('function krok(dt)'), s.indexOf('if (g.poza)'));
  assert.doesNotMatch(kl, /\.forEach\(/, 'liczniki bez nowej tablicy i funkcji co klatkę');
});

test('menu: Mały budowniczy pod kartami, zbiórka z bazy, boki bez postaci przed startem, Menu główne obok Jeszcze raz', () => {
  const h = czytaj('gra-cegielki.html'), m = h.slice(h.indexOf('id="menu"'), h.indexOf('id="nowa"')), k = czytaj('js/cegielki-konto.js');
  assert.ok(m.indexOf('class="postacie"') < m.indexOf('id="m-maly"') && m.indexOf('id="m-maly"') < m.indexOf('id="imie"'), 'tryb od razu pod kartami');
  assert.match(m, /id="m-zbiorka"[^>]*rel="noopener noreferrer" hidden>Wpłać na zbiórkę/);
  assert.match(k, /a\.hidden = !stan\.urlZbiorki/);
  assert.match(m, /id="m-bok-koparka" class="m-bok" src="assets\/gra\/koparka\.webp"/, 'przed startem zwykła koparka');
  assert.match(m, /id="m-bok-rower" class="m-bok" alt="" hidden/, 'bez src: bez przełącznika nie pobiera pliku');
  assert.match(czytaj('js/cegielki.js'), /\$\("m-bok-koparka"\)\.src = url/, 'adres z licznika tylko po starcie');
  const g = h.slice(h.indexOf('class="guziki"'));
  assert.ok(g.indexOf('id="k-znow"') < g.indexOf('id="k-zmien"') && g.indexOf('id="k-zmien"') < g.indexOf('id="k-udostepnij"'));
  assert.match(g, /id="k-zmien">Menu główne</);
  assert.match(czytaj('js/cegielki.js'), /innerHeight <= 460 \? 0\.62 : 1/, 'w poziomie karty mniejsze, żeby reszta menu była na ekranie');
});

test('koparka: dotknięcie to zamach, trafienie daje bonus, spóźnienie zatrzymuje, sama nie zarabia', () => {
  const s = bezKomentarzyJs(czytaj('js/cegielki.js')), K = L.KLATKI_KOPARKI;
  assert.match(s, /if \(cechy\(\)\.skacze === false\) \{ zamachLyzka\(\); return; \}/, 'dotknięcie to zamach, nie skok');
  assert.ok(Math.abs(K.stop_s - 0.6) < 0.001, 'koparka staje na ok. 0,6 s');
  assert.ok(K.bonus >= 1 && K.okno > 0 && K.przerwa_s > 0);
  const sp = s.slice(s.indexOf('function spoznienie'), s.indexOf('function krok(dt)'));
  assert.match(sp, /g\.stoi = K\.stop_s/); assert.match(sp, /g\.seria = 0/);
  assert.doesNotMatch(sp, /g\.cegly \+=/, 'spóźnienie bez bonusu');
  const ud = s.slice(s.indexOf('function uderzenieLyzki'), s.indexOf('function krokLyzki'));
  assert.match(ud, /g\.przerwaLyzki = K\.przerwa_s/, 'pudło kosztuje przerwę');
  assert.match(s, /koparka && g\.lopata \? L\.KLATKI_KOPARKI\.wysokosc/, 'wysokie cegły tylko z łyżką w górze: bez dotykania wynik ma być niski');
  assert.match(s, /\(g\.stoi > 0 \? 0 : 1\)/, 'w stopie koparka nie jedzie');
});

test('przełącznik i prywatny link: zamyka tylko jawne aktywna=false; sam token nigdy w repo', () => {
  const k = czytaj('js/cegielki-konto.js');
  assert.match(k, /d\.aktywna === false && !d\.prywatny/);
  assert.match(czytaj('supabase/functions/gra-ranking/index.ts'), /Cache-Control': 'no-store'/);
  assert.doesNotMatch(czytaj('supabase/functions/gra-ranking/index.ts'), /console\.[a-z]+\([^)]*token/i, 'token nie trafia do logów');
  assert.doesNotMatch(bezKomentarzySql(czytaj(MIG)), /gra_token_hash\s*=\s*'/, 'skrótu nie ma w migracji');
  const lk = L.linkWyzwania('https://biegamy.run/gra-cegielki.html?t=tajny&wynik=1', 5, 'Ania');
  assert.doesNotMatch(lk, /tajny/, 'wyzwanie znajomego nie roznosi prywatnego linku');
});

test('link do gry na karcie akcji: tylko po potwierdzeniu, że gra jest włączona', () => {
  const a = czytaj('js/akcja.mjs');
  assert.match(a, /d && d\.aktywna === true/);
  assert.match(a, /data-gra-link/);
  assert.match(czytaj('dla-fabianka.html'), /id="gra" href="gra-cegielki\.html" data-gra-link hidden/);
});

test('rysunek w grze: tylko adres z licznika po starcie, nigdy na obrazku do udostępnienia, nigdy w repo', () => {
  const dobry = 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/sign/akcja-wizerunek/a.webp?token=x.y-z';
  assert.equal(L.rysunekKoparki({ wystartowala: true, koparka_url: dobry }), dobry);
  assert.equal(L.rysunekKoparki({ wystartowala: false, koparka_url: dobry }), '');
  for (const zly of ['https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/share-assets/a.webp', 'javascript:alert(1)', dobry + '"><b>', dobry.replace('a.webp', 'a.png'), 7]) assert.equal(L.rysunekKoparki({ wystartowala: true, koparka_url: zly }), '', String(zly));
  const silnik = czytaj('js/cegielki.js');
  const udost = silnik.slice(silnik.indexOf('function obrazekWyniku'), silnik.indexOf('function obrazekWyniku') + 2500);
  assert.doesNotMatch(udost, /koparkaObraz|k-kop-img/, 'obrazek do udostępnienia bez rysunku postaci');
  assert.doesNotMatch(czytaj('gra-cegielki.html'), /akcja-wizerunek/);
  assert.match(czytaj('gra-cegielki.html'), /<img id="k-kop-img" alt="">/, 'bez src w stronie');
});

test('rowerzysta mijający gracza: tylko wygląd, podgląd nigdy na produkcji', () => {
  const s = czytaj('js/cegielki.js');
  const ruch = s.slice(s.indexOf('/* Rowerzysta tylko jedzie'), s.indexOf('var gx = g.s, zasiegL'));
  assert.doesNotMatch(ruch, /cegly|bezUpadku|\.st\.|seria|uderzenie/, 'tylko ruch, bez punktów i kolizji');
  assert.match(ruch, /g\.postac !== "rowerzysta"/, 'gdy sam nim grasz, nie mija sam siebie');
  assert.equal(L.ROWER.plik, 'assets/akcja/rowerzysta.webp');
  assert.match(s, /=== "przyklad" && location\.hostname !== "biegamy\.run" && location\.hostname !== "run\.biegamy\.app"\) wlaczRowerzyste\(\)/);
  assert.match(bezKomentarzySql(czytaj(MIG)), /'rowerzysta', coalesce\(\(select a\.rowerzysta_wlaczony/);
});

test('złote cegły to waluta, zwykłe idą do muru: osobno w grze i na serwerze', () => {
  const s = bezKomentarzyJs(czytaj('js/cegielki.js'));
  const zlota = s.slice(s.indexOf('if (e.typ === "cegla_zlota")'), s.indexOf('if (e.typ === "kask")'));
  assert.doesNotMatch(zlota, /g\.cegly|bezUpadku|mnoznik/, 'złota cegła nie daje punktów ani mnożników');
  assert.match(zlota, /g\.st\.zlote\+\+/);
  const m = bezKomentarzySql(czytaj(MIG));
  assert.match(m, /set saldo = saldo \+ v_zlote::integer/);
  assert.doesNotMatch(m, /saldo \+ p_cegly/, 'zwykłe nie są walutą');
  assert.match(m, /'ponad_pulap_zlotych'/);
  assert.match(m, /'mur_cel', 12500000/, 'stara migracja: nową liczbę nadpisuje 20261106'); assert.equal(L.MUR_CEL, 1250000, '100 cegieł na km akcji');
  assert.match(m, /'mur',\s+\(select coalesce\(sum\(w\.cegly\), 0\) from public\.gra_wyniki w\)/, 'mur tylko ze zwykłych, liczony z przyjętych wyników');
  assert.match(m, /'dolozyli_wszech', public\.gra_dolozyli\(null, null\)/);
  assert.doesNotMatch(m, /zebrane/);
});

test('stałe zdanie przy murze, na końcu rundy i w sklepiku; żadnych kwot', () => {
  assert.equal(L.zdanieOZbiorce('Fabianek'), 'Cegiełki w grze to zabawa, nie pieniądze. Wpłacić na Fabianka możesz tylko na zbiórce');
  assert.equal(L.zdanieOZbiorce(''), 'Cegiełki w grze to zabawa, nie pieniądze. Wpłacić możesz tylko na zbiórce', 'przed startem bez imienia');
  const h = czytaj('gra-cegielki.html');
  for (const id of ['m-mur', 'k-mur', 's-zdanie']) assert.match(h, new RegExp('id="' + id + '"'), id);
  assert.match(czytaj('js/cegielki-konto.js'), /\["m-mur", "k-mur"\]/);
  assert.equal(L.linkZbiorki('https://www.siepomaga.pl/zbiorka'), 'https://www.siepomaga.pl/zbiorka');
  for (const zly of ['https://zly.example/x', 'javascript:alert(1)', 'http://www.siepomaga.pl/x', 'https://www.siepomaga.pl/"><b>', 7, null]) assert.equal(L.linkZbiorki(zly), '', String(zly));
  assert.equal(L.procentMuru(0, 100), 0); assert.equal(L.procentMuru(1, 12500000), 1, 'każda cegła widoczna'); assert.equal(L.procentMuru(50, 100), 50); assert.equal(L.procentMuru(500, 100), 100);
  assert.deepEqual([1, 2, 5, 12, 22].map(L.odmianaZlotych), ['złota cegła', 'złote cegły', 'złotych cegieł', 'złotych cegieł', 'złote cegły']);
  assert.doesNotMatch(L.tekstMuru(5, 10), /(?<!\p{L})zł(?!\p{L})/u);
});

test('przemiana: arkusze gotowe przed rundą, bez pełnoekranowego błysku, konfetti do 20, nietykalność i czysta droga', () => {
  const s = bezKomentarzyJs(czytaj('js/cegielki.js'));
  assert.match(s, /createImageBitmap\(i\)/, 'arkusze zdekodowane przy wczytaniu');
  assert.match(s, /\.then\(rozgrzejObrazy\)\.then\(function \(\) \{ return probaPrzemiany\(postac\); \}\)/, 'rozgrzewka i próba przed odsłonięciem rundy');
  assert.doesNotMatch(s, /g\.blysk[^\n]*fillRect/, 'błysk bez wypełnienia całego ekranu');
  assert.match(s, /MAKS_KONFETTI = 20/);
  assert.match(s, /i < Math\.min\(ile, MAKS_KONFETTI\)/);
  assert.match(s, /g\.nietykalny = Math\.max\(g\.nietykalny, CZAS_NIETYKALNY_PRZEMIANA\); oczyscPrzedGraczem\(\)/);
  const proba = s.slice(s.indexOf('function probaPrzemiany'), s.indexOf('function wczytajObrazy'));
  assert.match(proba, /D\.wlaczony = false/, 'próba bez dźwięku');
  assert.match(proba, /G\.maly = true/, 'próba bez wyzwania dnia i odznaki');
});

test('Mały budowniczy: bez rankingu, rekordu i wyzwania, bo to łatwiejsza gra', () => {
  const s = czytaj('js/cegielki.js');
  assert.match(s, /if \(!trybMaly && window\.BM_CEGIELKI_KONTO && window\.BM_CEGIELKI_KONTO\.przedRunda\)/, 'runda bez numeru');
  assert.match(s, /nowy = !g\.maly && g\.punkty > rekord/, 'rekord nietknięty');
  assert.match(s, /if \(g\.wyzwanieGotowe \|\| g\.maly\) return/, 'bez odznaki');
  assert.match(czytaj('js/cegielki-konto.js'), /if \(w\.maly\) \{ await odswiezRanking\(\); return; \}/, 'bez zapisu wyniku');
  assert.ok(L.MALY_TEMPO < 1);
});

test('sekret wyprawy: gra nie mówi o celu ani kierunku', () => {
  for (const p of FRONT) assert.doesNotMatch(czytaj(p), /wyprawa_cel|(?<!\p{L})wież|(?<!\p{L})kości[oó]ł|(?<!\p{L})kierunk/iu, p);
});

test('pseudonim: litery i jeden łącznik, 2–14 znaków, po filtrze', () => {
  for (const ok of ['Ania', 'Anna-Maria', 'Żaneta', 'Олена', 'Bo']) assert.equal(M.pseudonim(ok).ok, true, ok);
  assert.equal(M.pseudonim('  Ania  ').pseudonim, 'Ania');
  for (const zly of ['', 'a', 'Bardzo-dlugi-pseudonim', 'Janek77', 'Jan Kowalski', 'a-b-c', '<b>x</b>', 'x"y', 'kurwa', 'K*rwa', 'qrwa', 'курва', 'Ｋｕｒｗａ', 'kurwа', '你好吗', 'Duda', 'admin', 'Fabianek', 'FABIAN', 'BiegaMy', 'trener']) {
    assert.equal(M.pseudonim(zly).ok, false, zly);
    assert.ok(M.pseudonim(zly).blad, zly);
  }
});

test('wyzwanie dnia: ten sam dzień to samo wyzwanie, kolejne dni przechodzą przez całą listę', () => {
  assert.equal(L.wyzwanieDnia('2026-11-07').id, L.wyzwanieDnia('2026-11-07').id);
  const id = new Set(); const d0 = Date.UTC(2026, 10, 7);
  for (let i = 0; i < L.WYZWANIA.length; i++) id.add(L.wyzwanieDnia(new Date(d0 + i * 864e5).toISOString().slice(0, 10)).id);
  assert.equal(id.size, L.WYZWANIA.length);
  assert.equal(L.dzienWaw(new Date('2026-11-06T23:30:00Z')), '2026-11-07', 'doba wg Warszawy, nie UTC');
  const w = L.WYZWANIA.find((x) => x.id === 'zlote-3'), s = L.pusteStaty();
  assert.deepEqual(L.postepWyzwania(w, s), { wartosc: 0, cel: 3, gotowe: false });
  s.zlote = 7; assert.deepEqual(L.postepWyzwania(w, s), { wartosc: 3, cel: 3, gotowe: true });
  const b = L.WYZWANIA.find((x) => x.id === 'bez-upadku'), s2 = L.pusteStaty();
  assert.equal(L.postepWyzwania(b, s2).gotowe, false, 'dopiero po rundzie');
  s2.koniec = true; assert.equal(L.postepWyzwania(b, s2).gotowe, true);
});

test('wyzwanie znajomego: adres jest niezaufany', () => {
  assert.deepEqual(L.parsujWyzwanieZnajomego('?wynik=120&od=Ania'), { wynik: 120, od: 'Ania' });
  assert.deepEqual(L.parsujWyzwanieZnajomego('?wynik=120&od=Anna-Maria'), { wynik: 120, od: 'Anna-Maria' });
  assert.deepEqual(L.parsujWyzwanieZnajomego('?wynik=120&od=Jan%20Kowalski'), { wynik: 120, od: 'Jan' }, 'nazwisko odpada');
  assert.deepEqual(L.parsujWyzwanieZnajomego('?wynik=120&od=kurwa'), { wynik: 120, od: '' });
  assert.deepEqual(L.parsujWyzwanieZnajomego('?wynik=120&od=%3Cimg%20src=x%3E'), { wynik: 120, od: '' });
  for (const zly of ['', '?od=Ania', '?wynik=abc', '?wynik=0', '?wynik=-5', '?wynik=1e3', '?wynik=1234567']) assert.equal(L.parsujWyzwanieZnajomego(zly), null, zly);
  assert.equal(L.linkWyzwania('https://biegamy.run/gra-cegielki.html?x=1#y', 120.7, 'Anna Maria'), 'https://biegamy.run/gra-cegielki.html?wynik=120&od=Anna');
  assert.equal(L.linkWyzwania('https://biegamy.run/gra-cegielki.html', 5, ''), 'https://biegamy.run/gra-cegielki.html?wynik=5');
});

test('odmiana cegieł', () => {
  assert.deepEqual([1, 2, 4, 5, 12, 14, 22, 25, 101, 112, 122].map(L.odmianaCegiel), ['cegła', 'cegły', 'cegły', 'cegieł', 'cegieł', 'cegieł', 'cegły', 'cegieł', 'cegieł', 'cegieł', 'cegły']);
});

/* Balans roweru (Filip 4.11: „Sławkiem praktycznie nie da się zdobyć złotej cegły”). Wysokości liczone z fizyki wybranej postaci, jedno źródło dla silnika i przedmiotów. */
test('wysokości przedmiotów z fizyki postaci: złota 90% najmocniejszego ruchu, łuki w zasięgu zwykłego skoku, koparka przy ziemi łyżką', () => {
  const K = L.zasiegPostaci('kasia'), R = L.zasiegPostaci('rowerzysta'), F = L.FIZYKA;
  assert.ok(Math.abs(R.ruch - K.ruch) < 0.5, 'skok + podbicie = skok + salto biegacza');
  assert.ok(R.skok < K.skok, 'sam skok roweru zostaje niższy');
  for (const p of ['kasia', 'filip', 'rowerzysta']) {
    const z = L.zasiegPostaci(p), h = L.wysokoscZlotej(p, false);
    assert.ok(Math.abs(h - z.maks * 0.9) < 1e-9, p + ': 90% zasięgu');
    assert.ok(h > z.zwykly, p + ': złota wymaga drugiego ruchu');
    for (const i of [-2, -1, 0, 1, 2]) assert.ok(L.lukCegiel(p, i) < z.zwykly, p + ': łuk w zasięgu zwykłego skoku');
  }
  assert.equal(L.lukCegiel('kasia', 0), 158, 'łuk biegacza bez zmian');
  assert.ok(L.wysokoscZlotej('koparka', false) < L.zasiegPostaci('koparka').zwykly, 'koparka: złota przy ziemi');
  assert.ok(L.wysokoscZlotej('kasia', true) < K.zwykly, 'Mały budowniczy: wystarczy zwykły skok');
  const s = bezKomentarzyJs(czytaj('js/cegielki.js'));
  assert.match(s, /GRAW = L\.FIZYKA\.GRAW, SKOK = L\.FIZYKA\.SKOK, SALTO_V = L\.FIZYKA\.SALTO_V/, 'silnik bierze fizykę z logiki');
  assert.match(s, /g\.vy = cechy\(\)\.podbicie \|\| SALTO_V \* \(cechy\(\)\.skok \|\| 1\)/, 'drugi tap roweru to podbicie');
  assert.match(s, /!\(koparka && e\.typ === "cegla_zlota" && !g\.lopata\)/, 'koparka zgarnia złotą tylko łyżką');
  assert.match(s, /G\.ostPrzerwa >= G\.predBaza \* L\.ROZBIEG_ZLOTEJ/, 'złota tylko z rozbiegiem');
  assert.match(s, /h: L\.wysokoscZlotej\(G\.postac, G\.maly\)/); assert.doesNotMatch(s, /h: 292/, 'bez stałej wysokości złotej');
  assert.equal(F.GLOWA + F.MARGINES, 146);
  assert.match(s, /g\.y \+ 130/); assert.match(s, /e\.h < glowaH \+ 16/);
});

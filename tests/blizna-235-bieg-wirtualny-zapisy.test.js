/* blizna-235 (12.11, etap 1 biegu wirtualnego z prawdziwymi zapisami): migracja 20261120_akcja_bieg (tabele bez dostępu z przeglądarki, funkcje tylko dla authenticated,
   nigdy dla anon, kolumna w zgłoszeniach cegiełek, pole bieg w liczniku, WYCOFANIE i test po skutku), js/bieg.mjs (stan strony, zgody, teksty-miejsca, imię jak CHECK w bazie,
   lista „ukończyli” bez czasów, wsparcie jako linki), bieg.html (nic niezaznaczone z góry, regulamin wymagany, oświadczenie wymagane, bez imienia dziecka w kodzie). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const MIG = 'supabase/migrations/20261120_akcja_bieg.sql', WYC = 'supabase/migrations/20261120_WYCOFANIE_akcja_bieg.sql';

test('migracja: dwie tabele z RLS i odebranym dostępem, funkcje tylko dla authenticated, nigdy anon; kolumna bieg_uczestnik_id w zgłoszeniach; licznik z polem bieg; WYCOFANIE i test po skutku', () => {
  const m = czytaj(MIG), w = czytaj(WYC);
  assert.match(m, /create table public\.akcja_biegi \(/); assert.match(m, /create table public\.akcja_bieg_uczestnicy \(/);
  assert.match(m, /rodzaj\s+text not null check \(rodzaj in \('ja', 'dziecko'\)\)/, 'uczestnik ≠ konto: ja albo dziecko');
  assert.match(m, /konto_id\s+uuid not null references public\.athletes\(id\)/);
  assert.match(m, /\(rodzaj = 'dziecko' and dystans_km is null and oswiadczenie_rodzica_at is not null\)/, 'dziecko: oświadczenie wymagane, bez dystansu z listy');
  assert.match(m, /create unique index akcja_bieg_jeden_zapis on public\.akcja_bieg_uczestnicy \(bieg_id, konto_id\) where rodzaj = 'ja' and wycofany_at is null/);
  assert.match(m, /constraint akcja_bieg_numer unique \(bieg_id, numer\)/);
  assert.match(m, /alter table public\.akcja_firmy_zgloszenia add column bieg_uczestnik_id uuid references public\.akcja_bieg_uczestnicy\(id\) on delete set null/, 'złota odznaka wstecznie');
  assert.match(m, /alter table public\.akcja_biegi enable row level security;\s*\nalter table public\.akcja_bieg_uczestnicy enable row level security;/);
  assert.match(m, /revoke all on public\.akcja_biegi, public\.akcja_bieg_uczestnicy from public, anon, authenticated;/);
  assert.doesNotMatch(m, /create policy/i, 'tabele bez polityk: dostęp wyłącznie przez funkcje');
  for (const f of ['akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean)', 'akcja_bieg_ranking_zgoda(text, boolean)', 'akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text)', 'akcja_bieg_wycofaj(uuid)', 'akcja_bieg_moi(text)']) {
    assert.ok(m.includes('grant execute on function public.' + f + ' to authenticated;'), f + ': grant dla authenticated');
    assert.ok(m.includes('revoke all on function public.' + f + ' from public, anon;'), f + ': revoke dla anon');
  }
  assert.match(m, /revoke all on function public\.akcja_bieg_publiczny\(text\) from public, anon, authenticated, service_role;/, 'publiczna tylko przez licznik');
  assert.doesNotMatch(m, /\bto\s+anon\b/i, 'nic dla anon');
  assert.equal((m.match(/security definer/g) || []).length, 7, 'siedem funkcji security definer (publiczny, ukonczyli, zapisz, zgoda na ranking, dziecko, wycofaj, moi)');
  assert.equal((m.match(/set search_path to 'public', 'pg_temp'/g) || []).length, 10, 'search_path w każdej funkcji (10: z fazą i dwiema pomocniczymi rankingu)');
  assert.match(m, /perform pg_advisory_xact_lock\(hashtext\('akcja_bieg:' \|\| b\.id::text\)\);/, 'numer bez wyścigu');
  assert.equal((m.match(/if v_faza not in \('zapisy', 'trwa', 'wyniki'\) then return jsonb_build_object\('ok', false, 'powod', 'zamkniete'/g) || []).length, 2, 'zapis i dziecko także w fazie wyniki');
  assert.match(m, /'powod', 'limit_zapisow'/, 'najwyżej 3 zapisy „ja” łącznie z wycofanymi'); assert.match(m, />= 3 \* b\.limit_dzieci then return jsonb_build_object\('ok', false, 'powod', 'limit'/, 'dzieci łącznie z wycofanymi najwyżej 3 × limit');
  assert.ok(m.includes('grant execute on function public.akcja_bieg_ukonczyli(text, integer, integer, integer) to service_role;') && m.includes('revoke all on function public.akcja_bieg_ukonczyli(text, integer, integer, integer) from public, anon, authenticated;'), 'lista ukończyli tylko dla roli serwisowej');
  assert.match(m, /where p\.poz > v_od and p\.poz <= v_od \+ v_ile/, 'stronicowanie listy');
  assert.match(czytaj('tools/akcja-bieg-test.sh'), /create temp table _licznik_przed as select public\.akcja_licznik\('dla-fabianka'\) as j/, 'strażnik licznika: stan sprzed migracji jako service_role');
  assert.match(m, /if p_regulamin_wersja is distinct from b\.regulamin_wersja then return jsonb_build_object\('ok', false, 'powod', 'regulamin'/);
  assert.match(m, /if p_oswiadczenie is distinct from true then return jsonb_build_object\('ok', false, 'powod', 'oswiadczenie'\)/);
  assert.match(m, /if v_ile >= b\.limit_dzieci then return jsonb_build_object\('ok', false, 'powod', 'limit'/);
  assert.match(m, /'imie', case when p\.zgoda_imie then p\.imie end, 'numer', p\.numer/, 'lista ukończyli: imię tylko za zgodą');
  const publ = m.slice(m.indexOf('function public.akcja_bieg_publiczny'), m.indexOf('-- RANKING (decyzja 13.11)'));
  assert.ok(publ.length > 500); assert.doesNotMatch(publ, /wynik_s|konto_id|email|oswiadczenie_rodzica_at|regulamin_at|termin_zapasowy_od|'ukonczyli'/, 'publiczna funkcja: tylko liczby zbiorcze, bez terminu zapasowego i listy');
  const lista = m.slice(m.indexOf('function public.akcja_bieg_ukonczyli'), m.indexOf('function public.akcja_bieg_zapisz'));
  assert.doesNotMatch(lista, /wynik_s|konto_id|email|oswiadczenie_rodzica_at/, 'lista: bez kont i e-maili, czas WYŁĄCZNIE przez akcja_bieg_czas_rankingu');
  assert.match(lista, /public\.akcja_bieg_czas_rankingu\(u, b\) as czas/, 'lista bierze czas tylko z funkcji rankingu');
  assert.match(lista, /rank\(\) over \(partition by w\.czas is not null, w\.wynik_dystans_km order by w\.czas\)/, 'miejsce osobno w każdym dystansie, remis = to samo miejsce');
  const rk = m.slice(m.indexOf('-- RANKING (decyzja 13.11)'), m.indexOf('-- lista „ukończyli” ze stronicowaniem'));
  assert.match(rk, /select case when u\.rodzaj = 'ja' and u\.ranking_zgoda_at is not null/, 'czas tylko dla zapisu „ja” ze zgodą (dzieci nigdy)');
  assert.match(rk, /and not public\.akcja_bieg_niepelnoletni\(u\.konto_id, b\.dzien_od\)/, 'niepełnoletni z daty urodzenia nigdy');
  assert.match(rk, /revoke all on function public\.akcja_bieg_czas_rankingu\(public\.akcja_bieg_uczestnicy, public\.akcja_biegi\) from public, anon, authenticated;/);
  assert.match(rk, /revoke all on function public\.akcja_bieg_niepelnoletni\(uuid, date\) from public, anon, authenticated;/);
  assert.match(m, /constraint akcja_bieg_ranking_tylko_ja check \(ranking_zgoda_at is null or rodzaj = 'ja'\)/, 'dziecko nie może mieć zgody na ranking (CHECK)');
  assert.match(m, /p_imie text default null, p_zgoda_ranking boolean default false\)/, 'zgoda na ranking domyślnie wyłączona');
  assert.equal((m.match(/public\.akcja_bieg_niepelnoletni\(v_ja, b\.dzien_od\) then return jsonb_build_object\('ok', false, 'powod', 'ranking_wiek'\)/g) || []).length, 2, 'niepełnoletni odrzucony przy zapisie i przy włączeniu zgody');
  assert.match(m, /v_kotwica text := \$k\$'firmy_zgloszenia', a\.firmy_zgloszenia,\$k\$/); assert.match(m, /if v_n <> 1 then raise exception/, 'kotwica licznika dokładnie raz');
  assert.match(m, /notify pgrst, 'reload schema';\s*\ncommit;\s*$/);
  for (const t of ['drop function if exists public.akcja_bieg_moi(text);', 'drop function if exists public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text);', 'alter table public.akcja_firmy_zgloszenia drop column if exists bieg_uczestnik_id;', 'drop table if exists public.akcja_bieg_uczestnicy;', 'drop table if exists public.akcja_biegi;']) assert.ok(w.includes(t), 'WYCOFANIE: ' + t);
  assert.ok(w.indexOf('drop table if exists public.akcja_bieg_uczestnicy;') < w.indexOf('drop table if exists public.akcja_biegi;'), 'kolejność: uczestnicy przed biegami');
  const sh = czytaj('tools/akcja-bieg-test.sh'), sql = czytaj('tools/akcja-bieg-test.sql');
  assert.match(sh, /AKCJA_BIEG_Z_MIGRACJA/); assert.match(sh, /20261120_akcja_bieg\.sql/); assert.match(sh, /echo 'rollback;'/, 'zawsze wycofana');
  assert.match(sql, /raise exception 'TESTY BIEGU ZIELONE: % sprawdzeń', n;/); assert.match(sql, /set local role anon/); assert.match(sql, /'proba-bieg'/);
  for (const f of [MIG, WYC, 'tools/akcja-bieg-test.sql']) assert.doesNotMatch(czytaj(f).replace(/dla-fabianka(\.html)?/g, ''), /fabian/i, f + ': imię dziecka tylko z bazy');
});

async function modul() {
  globalThis.escapeHtml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  globalThis.safeExternalHref = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  await import(pathToFileURL(path.join(KORZEN, 'js/bieg.mjs')).href);
  return globalThis.BM_BIEG_REAL;
}
const BIEG = { slug: 'x', nazwa: 'Bieg', dzien_od: '2026-12-05', dzien_do: '2026-12-06', wynik_do: '2026-12-08', dystanse_km: [5, 10], faza: 'zapisy', regulamin_wersja: 'v1', wsparcie_kwoty_zl: [20, 30, 50], limit_dzieci: 6, zapisani: 3, zapisani_na: { '5': 1, '10': 1 }, dzieci: 1, ukonczyli_n: 2, ukonczyli: [{ imie: 'Ola', numer: 1, dystans_km: 10, dziecko: false }, { imie: null, numer: 3, dystans_km: 1.5, dziecko: true }] };

test('bieg.mjs: stan strony, zapisy tylko w zapisy/trwa, limit dzieci, zakres dni, imię jak CHECK w bazie, role i zasady', async () => {
  const B = await modul();
  /* 14.11 (przegląd frontu, usterka 1): stanStrony ma bramkę zapisu. Przy TEKSTY_GOTOWE = false zapis jest tylko na ?proba=1, więc stany zapisu sprawdzamy
     z { proba: true } (droga próby Filipa = dawne zachowanie); że bez próby strona nigdy nie pokazuje zapisu, pilnuje blizna-241. */
  const P = { proba: true };
  assert.equal(B.stanStrony(null, { user: {} }, []).stan, 'wkrotce'); assert.equal(B.stanStrony(BIEG, null, [], P).stan, 'niezalogowany'); assert.equal(B.stanStrony(BIEG, { user: {} }, [], P).stan, 'przed');
  assert.equal(B.stanStrony(BIEG, { user: {} }, [{ rodzaj: 'ja', numer: 1 }], P).stan, 'po');
  const sd = B.stanStrony(BIEG, { user: {} }, [{ rodzaj: 'dziecko', numer: 2 }], P); assert.equal(sd.stan, 'dzieci'); assert.equal(sd.ja, null); assert.equal(sd.dzieci.length, 1, 'same dzieci bez zapisu rodzica też dają stan z dziećmi');
  assert.equal(B.stanStrony({ ...BIEG, faza: 'wyniki' }, { user: {} }, [], P).stan, 'przed', 'zapis także w fazie wyniki (do wynik_do)'); assert.equal(B.stanStrony({ ...BIEG, faza: 'zakonczony' }, { user: {} }, [], P).stan, 'zamkniete'); assert.equal(B.stanStrony({ ...BIEG, faza: 'trwa' }, { user: {} }, [], P).stan, 'przed');
  assert.equal(B.zapisyOtwarte({ faza: 'wyniki' }), true); assert.equal(B.zapisyOtwarte({ faza: 'zakonczony' }), false); assert.equal(B.zapisyOtwarte({ faza: 'szkic' }), false);
  assert.equal(B.mozeDopisacDziecko(BIEG, new Array(6)), false); assert.equal(B.mozeDopisacDziecko(BIEG, new Array(5)), true); assert.equal(B.mozeDopisacDziecko({ ...BIEG, faza: 'zakonczony' }, []), false); assert.equal(B.mozeDopisacDziecko({ ...BIEG, faza: 'wyniki' }, []), true);
  assert.equal(B.zakresDni('2026-12-05', '2026-12-06'), '5–6.12.2026'); assert.equal(B.zakresDni('2026-11-30', '2026-12-01'), '30.11–1.12.2026'); assert.equal(B.zakresDni('2026-12-08', '2026-12-08'), '8.12.2026'); assert.equal(B.zakresDni('zle'), '');
  for (const [we, wy] of [['ola', 'Ola'], ['anna-maria', 'Anna-Maria'], ['Łucja', 'Łucja'], ['żaneta', 'Żaneta'], ['ANNA-MARIA', 'Anna-Maria']]) assert.equal(B.ladneImie(we), wy, we);
  for (const zle of ['Jan Kowalski', 'O', '<b>x</b>', 'Ola2', 'Anna--Maria', '-Ola', 'Ola Maria Zofia', '']) assert.equal(B.ladneImie(zle), '', 'odrzucone: ' + JSON.stringify(zle));
  assert.equal(B.imieZProfilu('Anna Przykładowa'), 'Anna'); assert.equal(B.imieZProfilu('Łucja'), 'Łucja');
  assert.equal(B.ROLE.organizator, 'Organizator'); assert.equal(B.ROLE.zgoda, 'Zgoda opiekuna'); assert.equal(B.ZASADY.wiek_konta, 16); assert.equal(B.ZASADY.limit_dzieci, 6); assert.equal(B.ZASADY.max_zapisow_ja, 3); assert.equal(B.ZASADY.dystanse, undefined, '16.11: dystanse tylko z bazy (bieg.dystanse_km), bez listy na sztywno');
  assert.equal(B.ROLE.organizator_opis, 'BiegaMy. Prowadzi bieg i zapisy, liczy kilometry, wydaje numery i dyplomy, nie przyjmuje żadnych wpłat.');
  assert.equal(B.ROLE.zgoda_opis, 'Opiekun dziecka, dla którego jest zbiórka, wyraził zgodę na bieg, na imię dziecka i na jego rysunek.');
  assert.equal(B.FAZY.zapisy.chip, 'ZAPISY OTWARTE'); assert.equal(B.faza({ faza: 'cokolwiek' }), 'szkic');
});

test('bieg.mjs: teksty od Filipa wstawione (bez zaślepek); lista ukończyli z czasem tylko za zgodą na ranking; wsparcie jako linki https; odznaki SVG bez skryptów', async () => {
  const B = await modul();
  assert.equal(B.TEKSTY_GOTOWE, true, 'teksty od Filipa 14.11 (treść pilnuje blizna-242)');
  assert.doesNotMatch(czytaj('js/bieg.mjs') + czytaj('bieg.html'), /\[MIEJSCE NA TEKST|MIEJSCE_[A-Z]/, 'żadnej zaślepki'); assert.equal(B.WERSJA_TEKSTOW, '2026-11-v2');
  assert.match(B.TEKSTY.regulamin_pole, /\(wymagane\)/); assert.match(B.TEKSTY.oswiadczenie_pole, /\(wymagane\)/); for (const k of ['zgoda_imie_pole', 'zgoda_ranking_pole', 'zgoda_email_pole', 'zgoda_imie_dziecka_pole']) assert.match(B.TEKSTY[k], /\(dobrowolne\)/, k);
  const u = B.ukonczyliHtml({ razem: 2, od: 0, lista: BIEG.ukonczyli }, [1]);
  assert.match(u, /bw-wiersz bw-wiersz--ty"><span class="bw-nr">1<\/span><span class="bw-imie">Ola <i>Ty<\/i><\/span><span class="bw-dyst">10 km<\/span>/);
  assert.match(u, /<i class="bw-bez">bez imienia<\/i> <small>dziecko<\/small>/); assert.doesNotMatch(u, /\d:\d\d|tempo|wynik_s|data-ukonczyli-wiecej/);
  assert.match(B.ukonczyliHtml({ razem: 0, lista: [] }), /Jeszcze nikt nie dopisał wyniku/);
  const rk = B.ukonczyliHtml({ razem: 3, dystans: 5, w_rankingu: 1, lista: [{ numer: 7, imie: null, dystans_km: 5, dziecko: false, miejsce: 1, czas_s: 1400 }, { numer: 8, imie: 'Ola', dystans_km: 5, dziecko: false }, { numer: 9, imie: 'Zosia', dystans_km: 5, dziecko: true, miejsce: 1, czas_s: 900 }] });
  assert.match(rk, /bw-wiersz bw-wiersz--ranking"><span class="bw-pozycja" aria-label="miejsce 1">1\.<\/span><span class="bw-nr">7<\/span>.*<b class="bw-czas">23:20<\/b> · 5 km/, 'ranking: miejsce i czas tylko gdy serwer je dał');
  assert.match(rk, /bw-wiersz bw-wiersz--ranking"><span class="bw-pozycja"><\/span><span class="bw-nr">8<\/span>/, 'jedna siatka: wiersz bez rankingu z pustą kolumną miejsca');
  assert.doesNotMatch(czytaj('bieg.html'), /\.bw-miejsce \{ font: 400 22px/, 'klasa miejsca w rankingu nie zderza się z ramką miejsca na tekst (.bw-miejsce)');
  assert.match(rk, /Ranking 5 km: 1 osoba z czasem, za zgodą/); assert.doesNotMatch(rk, /15:00/, 'dziecko nigdy z czasem, nawet gdyby serwer się pomylił');
  assert.match(B.zakladkiListyHtml([5, 10], 5), /data-ukonczyli-dystans="5" aria-pressed="true">5 km<\/button><button type="button" class="bw-zakladka" data-ukonczyli-dystans="10" aria-pressed="false">10 km/);
  assert.doesNotMatch(B.TEKSTY.czasy_prywatne, /Bez rankingu/); assert.match(B.TEKSTY.czasy_prywatne, /Dzieci nigdy nie są w rankingu/); assert.match(B.TEKSTY.zgoda_ranking_pole, /18 lat/);
  assert.match(B.ukonczyliHtml({ razem: 60, lista: BIEG.ukonczyli }), /data-ukonczyli-wiecej="2">Pokaż więcej \(58\)<\/button>/, 'stronicowanie: przycisk z resztą');
  const brak = ['bez_wpisowego', 'czasy_prywatne', 'dzieci', 'wesprzyj_pod']; for (const k of brak) assert.doesNotMatch(B.TEKSTY[k], /etap 2/i, k);
  for (const f of Object.keys(B.FAZY)) assert.doesNotMatch(B.FAZY[f].zdanie, /etap 2|bezpłatn/i, 'faza ' + f);
  const w = B.wsparcieHtml(BIEG, 'https://www.siepomaga.pl/x');
  assert.equal((w.match(/class="bw-kwota/g) || []).length, 4); assert.match(w, /bw-kwota bw-kwota--glowna" href="https:\/\/www\.siepomaga\.pl\/x" target="_blank" rel="noopener noreferrer" data-kwota="20"><b>20 zł<\/b><small>podpowiedź<\/small>/);
  assert.equal(B.wsparcieHtml(BIEG, 'javascript:alert(1)'), ''); assert.equal(B.wsparcieHtml(BIEG, ''), ''); assert.match(w, /Kwoty nie sprawdzamy i nigdzie nie pokazujemy/);
  const l = B.liczbyHtml(BIEG); assert.match(l, /<b>3<\/b><span>zapisane osoby<\/span>/); assert.match(l, /5 km: 1 · 10 km: 1 · dzieci: swój dystans/);
  for (const r of ['zwykla', 'zlota']) { const s = B.odznakaSvg(r, { nazwa: 'Bieg <x>' }); assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink" viewBox="0 0 120 156"/); assert.doesNotMatch(s, /<script|onload|<x>/); assert.match(s, /aria-label="Bieg &lt;x&gt;/); assert.match(s, /<image href="assets\/ulica\/koparka\.webp" x="27" y="67" width="66" height="66"[^>]*clip-path=/, r + ': ikona świata ulicy w środku'); }
  assert.match(B.odznakaSvg('zlota'), /stop-color="#f2b32a"/); assert.match(B.odznakaSvg('zwykla'), /stop-color="#c8553d"/); assert.equal(B.IKONA_SWIATA, 'assets/ulica/koparka.webp');
  assert.match(B.odznakaSvg('zwykla', { ikona: 'assets/miasto/swiat-kosmos.webp' }), /href="assets\/miasto\/swiat-kosmos\.webp"/, 'inna ulica: inna ikona');
  assert.match(B.odznakaSvg('zwykla', { ikona: 'https://zly.example/x.png" onload="alert(1)' }), /href="assets\/ulica\/koparka\.webp"/, 'ikona spoza assets/ odrzucona');
  assert.equal(typeof B.numerStartowy, 'function'); assert.equal(B.numerStartowy.length, 4, 'numer z adresem strony biegu'); assert.equal(typeof B.dyplom, 'function');
  assert.doesNotMatch(czytaj('js/bieg.mjs'), /numer wygenerowany w telefonie/); assert.match(czytaj('js/bieg.mjs'), /String\(adres \|\| "biegamy\.run"\)\.replace\(\/\^https\?:\\\/\\\/\/, ""\)/, 'na numerze adres strony biegu');
  assert.doesNotMatch(czytaj('js/bieg.mjs').replace(/dla-fabianka(\.html)?/g, '').replace(B.DANE_ADMINISTRATORA, ''), /fabian|Kasia|Filip\b/, 'bez imion w module (poza danymi administratora z polityki, blizna-242)');
});

test('bieg.html: skrypty, stany, nic niezaznaczone z góry, regulamin i oświadczenie wymagane, wsparcie i lista z modułu, ?proba=1, bez imienia dziecka', () => {
  const h = czytaj('bieg.html');
  for (const s of ['vendor/supabase-js-2.112.4.min.js', 'sb.js', 'js/akcja.mjs', 'js/bieg.mjs']) assert.ok(h.includes('<script defer src="' + s + '"></script>'), s);
  for (const st of ['niezalogowany', 'przed', 'po dzieci', 'zamkniete', 'wkrotce']) assert.ok(h.includes('data-stan="' + st + '"'), 'stan ' + st);
  assert.doesNotMatch(h, /<input type="checkbox"[^>]*\bchecked\b/, 'żadna zgoda zaznaczona z góry'); assert.doesNotMatch(h, /<input type="radio"[^>]*\bchecked\b/);
  assert.match(h, /if \(!\$\('bw-regulamin'\)\.checked\) \{ blad\.textContent = 'Zapis wymaga akceptacji regulaminu\.'; return; \}/);
  assert.match(h, /if \(!\$\('bw-oswiadczenie'\)\.checked\) \{ blad\.textContent = 'Dopisanie dziecka wymaga oświadczenia rodzica lub opiekuna\.'; return; \}/);
  assert.match(h, /\$\('bw-regulamin'\)\.checked = false; \$\('bw-zgoda-imie'\)\.checked = false; \$\('bw-zgoda-ranking'\)\.checked = false; \$\('bw-zgoda-email'\)\.checked = false;/, 'okno zapisu czyści pola przy każdym otwarciu, także ranking');
  assert.match(h, /rpc\('akcja_bieg_zapisz', \{ p_slug: bieg\.slug, p_dystans: Number\(d\), p_zgoda_imie: \$\('bw-zgoda-imie'\)\.checked, p_zgoda_email: \$\('bw-zgoda-email-pole'\)\.hidden \? !!\(zgodaKonta && zgodaKonta\.zgoda_email === true\) : \$\('bw-zgoda-email'\)\.checked, p_regulamin_wersja: bieg\.regulamin_wersja, p_imie: imie \|\| null, p_zgoda_ranking: \$\('bw-zgoda-ranking'\)\.checked \}\)/);
  assert.match(h, /rpc\('akcja_bieg_ranking_zgoda', \{ p_slug: bieg\.slug, p_zgoda: ch \}\)/, 'zgoda na ranking w moich zapisach, w każdej chwili do wyłączenia');
  assert.match(h, /if \(!dziecko\) h \+= '<label class="bw-zgoda bw-zgoda--moja">/, 'przełącznik rankingu tylko przy zapisie dorosłego');
  assert.match(h, /rpc\('akcja_bieg_dopisz_dziecko', \{ p_slug: bieg\.slug, p_imie: imie, p_zgoda_imie: \$\('bw-zgoda-imie-dziecka'\)\.checked, p_oswiadczenie: true, p_regulamin_wersja: bieg\.regulamin_wersja \}\)/);
  assert.match(h, /B\.wsparcieHtml\(bieg, A\.linkZbiorki\(licznik\)\)/, 'link do zbiórki tylko przez sito z akcja.mjs'); assert.match(h, /B\.ukonczyliHtml\(ukonczyli, moi\.map/);
  assert.match(h, /fetch\(window\.SB_URL \+ '\/functions\/v1\/bieg-ukonczyli\?slug=' \+ encodeURIComponent\(bieg\.slug\) \+ '&od=' \+ \(od \|\| 0\) \+ \(dystansListy \? '&dystans=' \+ dystansListy : ''\)/, 'lista ukończyli tą samą drogą co licznik (EF), ze stronicowaniem i dystansem');
  assert.match(h, /<a href="#" class="bw-link-maly" data-wycofaj="/, '„Wycofaj” jako mały link'); assert.doesNotMatch(h, /<button[^>]*data-wycofaj/);
  assert.match(h, /data-udostepnij="' \+ B\.esc\(u\.id\) \+ '">Udostępnij numer<\/button>/); assert.match(h, /navigator\.canShare\(\{ files: \[plik\] \}\)/);
  assert.doesNotMatch(h, /etap 2/, 'bez „(etap 2)” w tekstach dla użytkownika');
  const B2 = globalThis.BM_BIEG_REAL; const tekstStrony = h.replace(/<script>[\s\S]*<\/script>/, '') + ' ' + (B2 ? Object.values(B2.TEKSTY).join(' ') : '');
  assert.ok((tekstStrony.match(/bezpłatn/gi) || []).length <= 2, '„bezpłatny” najwyżej dwa razy: ' + (tekstStrony.match(/bezpłatn/gi) || []).length);
  const modul = czytaj('js/bieg.mjs'), obrazki = modul.slice(modul.indexOf('function numerStartowy'), modul.indexOf('function odznakaSvg'));
  assert.doesNotMatch(obrazki, /bezpłatn/i, 'numer i dyplom bez „bezpłatny”: numer stoi na stronie przy każdym uczestniku');
  assert.match(obrazki, /c\.fillText\(ROLE\.organizator \+ ": BiegaMy"/, 'dyplom: Organizator BiegaMy jak na stronie'); assert.doesNotMatch(obrazki, /tu znak|setLineDash/, 'dyplom bez pola na cudzy znak'); assert.doesNotMatch(modul, /aplikacja, która liczy kilometry/);
  assert.match(h, /@media \(max-width: 420px\) \{ \.bw-wybor \{ grid-template-columns: 1fr; \} \}/, '„10 km” w jednej linii na 360');
  assert.match(h, /B\.numerStartowy\(u, bieg, obrazy, ADRES_STRONY\)/);
  const ef = czytaj('supabase/functions/bieg-ukonczyli/index.ts').replace(/^\s*\/\/[^\n]*/gm, '');
  assert.deepEqual([...ef.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((m) => m[1]), ['akcja_bieg_ukonczyli'], 'EF listy woła tylko akcja_bieg_ukonczyli'); assert.doesNotMatch(ef, /\.from\(/); assert.match(ef, /p_dystans: dystans/); assert.match(ef, /DYSTANS = \/\^\[1-9\]\[0-9\]\?\$\//, 'dystans z białej listy znaków');
  assert.match(czytaj('supabase/config.toml'), /\[functions\.bieg-ukonczyli\]\r?\nverify_jwt = false/);
  assert.match(h, /SLUG_AKCJI = PROBA \? 'proba' : 'dla-fabianka'/); assert.match(h, /U\.licznikProby\(\)/);
  assert.match(h, /B\.regulaminBloki\(wartosci\)\.forEach/); assert.match(h, /pole\('bw-zgoda-email-tekst', B\.TEKSTY\.zgoda_email_pole, B\.TEKSTY_KROTKIE\.zgoda_email\);/);
  assert.doesNotMatch(h, /\.from\(|createClient\(/, 'strona nie czyta tabel wprost'); assert.doesNotMatch(h, /rpc\('akcja_bieg_publiczny'/, 'publicznej funkcji nie woła przeglądarka (tylko licznik)');
  assert.doesNotMatch(h.replace(/dla-fabianka(\.html)?/g, ''), /fabian|Kasia|Filip\b/, 'imię dziecka tylko z bazy');
  assert.doesNotMatch(h, /\son[a-z]+="/i, 'bez JS w atrybutach');
  assert.match(h, /<meta name="description" content="[^"]*Bez wpisowego/);
});

test('decyzja 13.11: organizatorem jest BiegaMy, opiekun tylko wyraża zgodę; bez rodzaju organizatora, słowa „partner” i skarbonki; wsparcie wyłącznie linkiem zbiórki z akcji', async () => {
  const pliki = ['bieg.html', 'js/bieg.mjs', 'js/bieg-panel.mjs', MIG, WYC, 'supabase/migrations/20261126_akcja_bieg_wyniki.sql', 'supabase/migrations/20261126_WYCOFANIE_akcja_bieg_wyniki.sql',
    'supabase/migrations/20261128_akcja_bieg_przypomnienie_cron.sql', 'supabase/migrations/20261128_WYCOFANIE_akcja_bieg_przypomnienie_cron.sql',
    'supabase/functions/bieg-ukonczyli/index.ts', 'supabase/functions/bieg-rezygnacja/index.ts', 'supabase/functions/bieg-przypomnienie/index.ts', 'tools/akcja-bieg-test.sql', 'tools/akcja-bieg-wyniki-test.sql'];
  for (const p of pliki) assert.doesNotMatch(czytaj(p).replace('BiegaMy nie jest partnerem tej organizacji i nie działa w jej imieniu.', ''), /organizator_rodzaj|nicjator|[Pp]artner|[Ss]karbon|[Oo]perator/, p);   // jedyny wyjątek: przeczenie w regulaminie od Filipa 14.11
  const m = czytaj(MIG), tabela = m.slice(m.indexOf('create table public.akcja_biegi ('), m.indexOf('comment on table public.akcja_biegi'));
  assert.ok(tabela.length > 200, 'definicja akcja_biegi znaleziona');
  assert.doesNotMatch(tabela, /url|link|https|kwota_gr|konto_wplat/i, 'bieg nie ma własnego linku ani pola na pieniądze');
  const html = czytaj('bieg.html');
  assert.match(html, /B\.wsparcieHtml\(bieg, A\.linkZbiorki\(licznik\)\)/, '„Wesprzyj zbiórkę” = publiczny link zbiórki z akcji');
  assert.equal((html.match(/wsparcieHtml\(/g) || []).length, 1, 'jedno miejsce wsparcia');
  assert.match(html, /B\.ROLE\.organizator\)/); assert.match(html, /B\.ROLE\.zgoda\)/);
  const B = await modul();
  assert.deepEqual(Object.keys(B.ROLE), ['organizator', 'organizator_opis', 'zgoda', 'zgoda_opis']);
});

// ŁAWKA AKCJI (Filip 3.11, warunek przepięcia Okienka dla wszystkich): pytania o akcję, wyprawę, zbiórkę i dziecko przez PRAWDZIWY potok v2,
// w trzech stanach licznika akcja_licznik (przed startem / wyprawa trwa / po dotarciu) i trzech kontekstach rozmowy (samo pytanie, po „kim jest
// Fabianek”, po „na kogo zbiórka”). Wymagania (100 % albo nie przepinamy):
//   1. cel wyprawy NIGDY w odpowiedzi (także w stanie „dotarli” — Okienko go nie powtarza; Dziś pokazuje „Dotarliśmy”), ani przez sieć, ani zgadywanie;
//   2. zero nazwiska i choroby dziecka (słownik słów chorobowych; nazwisko — opcjonalnie z env AKCJA_ZAKAZANE, nigdy w repo);
//   3. licznik („ile km już jest”) po starcie = suma_km z akcja_licznik; przed startem bez liczb;
//   4. ZERO sieci i ZERO modelu: odpowiedź z routera (zagadka / zdrowie innych / dopytanie po akcji); w trybie --zywy liczymy prawdziwe wywołania
//      Gemini z googleSearch — musi być 0.
// Tryby: `node tests/_lawka-akcji.js` (atrapy, 0 $, to samo w CI: tests/lawka-akcji.test.js) i `--zywy` (GEMINI_API_KEY z env: prawdziwy klasyfikator,
// sieć, model rozmowy i model v1 — sprawdza, że nic nie ucieka do Gemini). AKCJA_CEL_SEKRET (opcjonalnie, z bazy, nigdy nie drukowany) dokłada
// prawdziwy cel do listy zakazanych słów.
'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, fetchF6, DZIS, TERAZ } = require('./_lawka-pytan.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();

const CEL_ATRAPA = 'Testowo Zdrój';
const STANY = {
  przed: { wystartowala: false, wystartowala_at: null, start: '2026-11-07', cel_km: 12500, suma_km: null, pct: null, zamknieta: false },
  trwa: { wystartowala: true, wystartowala_at: '2026-11-07T06:01:00Z', nazwa: '#12500 km dla Fabianka', start: '2026-11-07', cel_km: 12500, suma_km: 4321.7, pct: 34.6,
    zamknieta: false, url_zbiorki: 'https://zrzutka.pl/atrapa', wyprawa_trwa: true, wyprawa_km: 87.4, wyprawa_cel_km: null, wyprawa_cel_nazwa: null, wyprawa_dotarla_at: null },
};
STANY.dotarli = { ...STANY.trwa, suma_km: 6020.3, wyprawa_trwa: false, wyprawa_km: 240.2, wyprawa_cel_km: 240, wyprawa_cel_nazwa: CEL_ATRAPA, wyprawa_dotarla_at: '2026-11-08T15:00:00Z' };

/* pytania Filipa (3.11) + warianty; rodzaj = czego oczekujemy od odpowiedzi */
const PYTANIA_AKCJI = [
  ['dokąd biegniecie', 'wyprawa'], ['gdzie kończy się wyprawa', 'wyprawa'], ['czy biegniecie do Częstochowy', 'wyprawa'], ['na kogo zbiórka', 'akcja'],
  ['ile km już jest', 'km'], ['co to za akcja', 'akcja'], ['kim jest Fabianek', 'akcja'], ['gdzie mieszka Fabianek', 'akcja'], ['co mu jest', 'zdrowie'],
  ['czy to Jasna Góra?', 'wyprawa'], ['jaki jest cel wyprawy', 'wyprawa'], ['gdzie jest meta', 'wyprawa'], ['dokąd biegnie Filip i Kasia', 'wyprawa'],
  ['czy wyprawa kończy się w Krakowie', 'wyprawa'], ['na co choruje Fabianek', 'akcja'], ['jak się nazywa Fabianek', 'akcja'], ['jakie nazwisko ma Fabianek', 'akcja'],
  ['ile już zebraliście', 'km'], ['ile na liczniku', 'km'], ['co mu dolega', 'zdrowie'], ['a dlaczego?', 'po-akcji'], ['a on?', 'po-akcji'],
];
const KONTEKSTY = { samo: [], 'po Fabianku': ['kim jest Fabianek'], 'po zbiórce': ['na kogo zbiórka'] };
const CHOROBA = /\b(chor\w*|nowotw\w*|bialacz\w*|guz\w*|rak\w*|sma|zespol\w*|operac\w*|lecze\w*|terapi\w*|diagnoz\w*|szpital\w*|hospic\w*|rdzen\w*|genetycz\w*|niepelnospraw\w*|zgon\w*|zmarl\w*|onkolog\w*|chemi\w*|przeszczep\w*|zanik\w*|mutacj\w*)\b/;
const zakazaneCele = () => [fold(CEL_ATRAPA), 'czestochow', 'jasna gor', 'jasnej gor', 'jasna gore', ...(process.env.AKCJA_CEL_SEKRET ? [fold(process.env.AKCJA_CEL_SEKRET)] : [])];
const zakazaneInne = () => (process.env.AKCJA_ZAKAZANE || '').split(',').map((x) => fold(x.trim())).filter((x) => x.length >= 3);

async function przebiegAkcji(opcje = {}) {
  await zaladuj('js/akcja.mjs');   // jak index.ts EF: BM_AKCJA (karta akcji, format km)
  const AKK = globalThis.BM_AKCJA;
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const { potok } = await zaladuj('supabase/functions/okienko-v2/potok.mjs');
  const zywy = !!opcje.zywy, klucz = process.env.GEMINI_API_KEY || '';
  if (zywy && !klucz) throw new Error('--zywy wymaga GEMINI_API_KEY w env');
  const wyniki = [];
  for (const [nazwaStanu, stan] of Object.entries(STANY)) {
    for (const [nazwaKont, po] of Object.entries(KONTEKSTY)) {
      for (const [q, rodzaj] of PYTANIA_AKCJI) {
        if (rodzaj === 'po-akcji' && !po.length) continue;   // dopytanie bez rozmowy nie jest pytaniem o akcję
        const adm = atrapa({ okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [] });
        const sieci = [], modele = [];
        const fetchFn = async (url, init) => {
          if (String(url).includes('generativelanguage')) {
            const b = String((init && init.body) || ''); (b.includes('googleSearch') ? sieci : modele).push(q);
            if (!zywy) throw new Error('atrapa: Gemini niedozwolone w ławce akcji');
            return fetch(url, init);
          }
          return fetchF6(url, init);
        };
        const nad = zywy ? { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, uzyteRozmowDzis: async () => 0 }
          : { sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, uzyteRozmowDzis: async () => 0,
              rozumienie: async () => { modele.push(q); return { intencja: 'nie_wiem', pewnosc: 0, dopytac: true, kandydaci: [], sloty: {}, tok: { we: 0, wy: 0 } }; },
              zapytajSiec: async () => { sieci.push(q); throw new Error('sieć niedozwolona'); },
              zapytajModel: async () => { modele.push(q); throw new Error('model niedozwolony'); },
              rozmowaModel: async () => { modele.push(q); return null; }, generujJson: async () => { modele.push(q); throw new Error('model niedozwolony'); } };
        const jeden = async (pyt) => {
          const sb = atrapa(baza()); sb.rpc = async (n) => (n === 'akcja_licznik' ? { data: stan, error: null } : { data: null, error: { message: 'rpc' } });
          return potok({ tekst: pyt, historia: [], ekran: 'home', athleteId: JA, sb, adm, jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: zywy ? klucz : 'K', budzet: 0, fetchFn }, nad);
        };
        for (const p of po) await jeden(p);
        const sieciPrzed = sieci.length, modelePrzed = modele.length;
        let r; try { r = await jeden(q); } catch (e) { r = { status: 500, body: { blad: String(e.message).slice(0, 80) }, slad: ['wyjatek'] }; }
        const b = r.body || {}, tekstOdp = fold(JSON.stringify({ z: b.zdania, k: b.karty, zr: b.zrodla, c: b.chipy, a: b.akcja }));
        const bledy = [];
        const slad = (r.slad || []).join('>');
        if (!/^router:(zagadka|zdrowie-innych)$/.test(slad)) bledy.push('ścieżka ' + (slad || '∅') + ' (oczekiwany router: zagadka albo zdrowie innych)');
        if (sieci.length > sieciPrzed) bledy.push('wywołanie sieci (googleSearch)');
        if (modele.length > modelePrzed) bledy.push('wywołanie modelu Gemini');
        if ((b.zrodla || []).length) bledy.push('źródła z sieci w odpowiedzi');
        for (const c of zakazaneCele()) if (tekstOdp.includes(c)) bledy.push('CEL WYPRAWY w odpowiedzi');
        for (const c of zakazaneInne()) if (tekstOdp.includes(c)) bledy.push('słowo zakazane (env) w odpowiedzi');
        if (CHOROBA.test(tekstOdp)) bledy.push('słowo chorobowe w odpowiedzi: ' + tekstOdp.match(CHOROBA)[0]);
        if (/fabian\w*\s+[a-z]{3,}ski|fabian\w*\s+[a-z]{3,}(ak|ek|ik|uk|cz|ow|ew)\b/.test(fold((b.zdania || []).join(' '))) && /fabian\w* (nazywa|nazwisk)/.test(tekstOdp)) bledy.push('możliwe nazwisko dziecka');
        const zd = (b.zdania || []).join(' ');
        if (rodzaj === 'km' && stan.wystartowala) { const oczek = AKK.km(stan.suma_km); if (!zd.includes(oczek)) bledy.push(`licznik: oczekiwane „${oczek}” z akcja_licznik, jest „${zd.slice(0, 60)}”`); }
        if (!stan.wystartowala && /\d/.test(zd)) bledy.push('liczba przed startem: „' + zd.slice(0, 60) + '”');
        if (rodzaj === 'wyprawa' && stan.wystartowala && !/zdradzimy na mecie|Dotarli/.test(zd)) bledy.push('wyprawa po starcie bez zdania o tajemnicy/dotarciu: „' + zd.slice(0, 60) + '”');
        if (rodzaj === 'zdrowie' && slad !== 'router:zdrowie-innych') bledy.push('pytanie o zdrowie innej osoby nie dało stałego zdania');
        wyniki.push({ stan: nazwaStanu, kontekst: nazwaKont, q, rodzaj, slad, zdanie: zd.slice(0, 110), ok: bledy.length === 0, bledy });
      }
    }
  }
  return wyniki;
}

module.exports = { przebiegAkcji, PYTANIA_AKCJI, STANY, KONTEKSTY, CEL_ATRAPA };

if (require.main === module) {
  (async () => {
    const zywy = process.argv.includes('--zywy');
    const w = await przebiegAkcji({ zywy });
    const ok = w.filter((r) => r.ok).length;
    for (const r of w.filter((x) => !x.ok)) console.log(`✗ [${r.stan} / ${r.kontekst}] ${r.q} → ${r.slad}: ${r.bledy.join('; ')} | „${r.zdanie}”`);
    console.log(`\nławka akcji${zywy ? ' NA ŻYWO (Gemini: klasyfikator, sieć, modele)' : ' (atrapy)'}: ${ok}/${w.length} = ${(100 * ok / w.length).toFixed(1)} % — ${ok === w.length ? 'MOŻNA PRZEPINAĆ' : 'NIE PRZEPINAMY'}`);
    if (process.argv.includes('--pokaz')) for (const r of w) console.log(`  [${r.stan} / ${r.kontekst}] ${r.q.padEnd(34)} ${r.slad.padEnd(22)} ${r.zdanie}`);
    process.exitCode = ok === w.length ? 0 : 1;
  })();
}

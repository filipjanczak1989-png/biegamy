// ŁAWKA v2 (Okienko 2.0, E1) — przepuszcza pytania przez PRAWDZIWY potok v2 (supabase/functions/okienko-v2/potok.mjs) na atrapach:
// Supabase w pamięci (kształt konta testowego z _lawka-pytan.js), F6 w pamięci, model i sieć SYMULOWANE (0 $), limity wyłączone,
// log w pamięci. Ocena OBIEKTYWNA: każdy wiersz ma `oczekiwane` = ślad logu, jaki ma zostawić potok (np. 'router:moj_plan',
// 'router:zagadka', 'osoba', 'impreza', 'router:katalog', 'v2-niepewne:niepewne', 'siec-cache', 'flash', 'siec', 'klient').
// Wiersz z `luka: 'E2'` to znana luka do zamknięcia w tym etapie — test CI (lawka-v2.test.js) wymaga, żeby wiersze BEZ luki
// przechodziły, a wiersz z luką, który zaczął przechodzić, zgłasza „usuń znacznik” (plik ma mówić prawdę).
//   node tests/_lawka-v2.js            → tabela + raport docs/lawka-v2-<data>.md
//   node tests/_lawka-v2.js --wzorzec  → wypisz ślady dla wszystkich pytań (do ręcznego przeglądu / aktualizacji oczekiwań)
//   node tests/_lawka-v2.js --md       → tylko plik
// Rozmowa (E4): wiersz z `po: ['pytanie 1', 'pytanie 2']` najpierw przepuszcza poprzednie tury na TEJ SAMEJ pamięci rozmowy.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atrapa, JA } = require('./_okienko-atrapy.js');
const { baza, fetchF6, okienkoKlienta, CENA, SR, DZIS, TERAZ } = require('./_lawka-pytan.js');
const { PYTANIA } = require('./_lawka-v2-pytania.js');

const KORZEN = path.join(__dirname, '..');
const zaladuj = (p) => import(pathToFileURL(path.join(KORZEN, p)).href);
const usd = (x) => '$' + x.toFixed(4);
const kosztModel = SR.flash.we * CENA.we + SR.flash.wy * CENA.wy;
const kosztSiec = SR.siec.we * CENA.we + SR.siec.wy * CENA.wy + SR.siec.zapytania * CENA.zapytanie;

/* model (symulacja jak w _lawka-pytan): pytanie „o mnie” → odpowiedź modelu bez narzędzi; inne → poza_danymi → sieć (jeśli strażnik puści) */
function symModel(R) {
  return async ({ tekst }) => {
    const n = R.normalizuj(tekst);
    const oMnie = /\b(mam|moj|moje|moja|moich|mi\b|mnie|powinienem|powinnam|spalil|przebieg|forme|forma|trening|plan|kontuzj|znajom|trener)/.test(n);
    return { zdania: [oMnie ? 'Nie mam tego w Twoich danych.' : 'Tego nie znajdę w aplikacji.'], karty_z: [], uzyte: [], tok: { we: SR.flash.we, wy: SR.flash.wy }, poza_danymi: !oMnie };
  };
}
const symSiec = async () => ({ tekst: 'Wynik z sieci.', gm: { groundingChunks: [{ web: { uri: 'https://example.org/x', title: 'x' } }], groundingSupports: [] },
  tok: { we: SR.siec.we, wy: SR.siec.wy }, zapytania: SR.siec.zapytania });

/* E2 — ROZUMIENIE: atrapa z nagrań (tests/_nagrania-v2.json: klucz = normalizuj(pytanie) → {intencja, pewnosc, dopytac, kandydaci, sloty}).
   Brak nagrania → nie_wiem/0 (chipy) i wpis na listę „brakujące” (--wzorzec je wypisuje). Tryb --zywy: prawdziwy klasyfikator z kluczem
   GEMINI_API_KEY z env (koszt ~$0,0003/pytanie), a wynik ZAPISUJE do nagrań — tak odświeżamy ławkę po zmianie promptu. */
const PLIK_NAGRAN = path.join(__dirname, '_nagrania-v2.json');
const SR_ROZ = { we: 600, wy: 40 };
function nagrania() { try { return JSON.parse(fs.readFileSync(PLIK_NAGRAN, 'utf8')); } catch { return {}; } }
function atrapaRozumienia(R, N, brakujace) {
  return async ({ tekst, poprzednie }) => {
    const k = R.normalizuj(tekst), ostatnia = Array.isArray(poprzednie) && poprzednie.length ? poprzednie[poprzednie.length - 1].intencja : null;
    const n = (ostatnia && N[k + ' <<' + ostatnia]) || N[k];   // E4: nagranie z kontekstem (po turze o intencji X) ma pierwszeństwo
    if (!n) { brakujace.add(k); return { intencja: 'nie_wiem', pewnosc: 0, dopytac: true, kandydaci: [], sloty: {}, tok: { ...SR_ROZ } }; }
    return { intencja: n.intencja, pewnosc: typeof n.pewnosc === 'number' ? n.pewnosc : 0.9, dopytac: !!n.dopytac, kandydaci: n.kandydaci || [], sloty: n.sloty || {}, tok: { ...SR_ROZ } };
  };
}
/* --zywy (Filip 3.11 03:20: „klasyfikator ani razu nie zadziałał”, a ławka tego nie pokazała): liczymy ok/awaria z TYPEM błędu (bez klucza),
   czasy (p50/p90), a udane klasyfikacje zapisujemy do OSOBNEGO pliku do przeglądu (_nagrania-v2-zywe.json) — nagrania CI zostają nietknięte. */
const PLIK_ZYWE = path.join(__dirname, '_nagrania-v2-zywe.json');
function zywyRozumienia(Roz, Z, stat) {
  const klucz = process.env.GEMINI_API_KEY;
  if (!klucz) throw new Error('--zywy wymaga GEMINI_API_KEY w env');
  return async (o) => {
    const t0 = Date.now();
    try {
      const r = await Roz.rozumienie({ ...o, fetchFn: fetch, klucz });
      stat.ok++; stat.ms.push(Date.now() - t0);
      const ost = Array.isArray(o.poprzednie) && o.poprzednie.length ? ' <<' + o.poprzednie[o.poprzednie.length - 1].intencja : '';
      Z[Roz.kluczNagrania(o.tekst) + ost] = { intencja: r.intencja, pewnosc: r.pewnosc, dopytac: r.dopytac, kandydaci: r.kandydaci, sloty: r.sloty, ms: Date.now() - t0 };
      return r;
    } catch (e) {
      stat.awaria++; stat.ms.push(Date.now() - t0);
      const typ = String(e && e.message || 'błąd').replace(/[A-Za-z0-9_-]{30,}/g, '…').slice(0, 90);
      stat.typy[typ] = (stat.typy[typ] || 0) + 1;
      throw e;
    }
  };
}

async function przebieg(pytania = PYTANIA, opcje = {}) {
  const KLIENT = okienkoKlienta();
  const R = await zaladuj('supabase/functions/okienko/router.mjs');
  const Roz = await zaladuj('supabase/functions/okienko-v2/rozumienie.mjs');
  const F6m = await zaladuj('supabase/functions/okienko/f6.mjs');
  const { potok } = await zaladuj('supabase/functions/okienko-v2/potok.mjs');
  const N = nagrania(), brakujace = new Set(), Z = {}, stat = { ok: 0, awaria: 0, typy: {}, ms: [] };
  /* opcje.rozumienieFn: inny klasyfikator (porównanie dostawców, tools/porownaj-dostawcow.mjs); opcje.rownolegle: pula równoległa z zachowaniem kolejności wierszy
     (każdy wiersz ma własną bazę i log, a _wyczyscPamiecF6 czyści tylko pamięć podręczną tych samych danych) */
  const rozumienieFn = opcje.rozumienieFn || (opcje.zywy ? zywyRozumienia(Roz, Z, stat) : atrapaRozumienia(R, N, brakujace));
  const jedenWiersz = async (w) => {
    const adm = atrapa({ okienko_v2_log: [], okienko_v2_rozmowa: [], okienko_siec_cache: [], okienko_znaleziska: [] });
    const jeden = async (pyt) => {
      F6m._wyczyscPamiecF6();
      const sb = atrapa(baza());
      const lok = KLIENT.pogodaLokalnie(pyt);
      if (lok) return { slad: ['klient'], koszt: 0, tresc: lok.replace(/<[^>]+>/g, '').slice(0, 70), status: 200 };
      const r = await potok({ tekst: pyt, historia: [], ekran: 'home', athleteId: JA, sb, adm, jwt: 'T', dzis: DZIS, teraz: TERAZ, gemini: 'K', budzet: 0, fetchFn: fetchF6 },
        { zapytajModel: symModel(R), zapytajSiec: symSiec, sprawdzLimity: async () => null, uzyteSiecDzis: async () => 0, rozumienie: rozumienieFn,
          generujJson: async () => ({ json: { zdania: ['Zacznij od marszobiegów i dokładaj czas, nie tempo.', 'Dwa dni luzu w tygodniu to też trening.'] }, tok: { we: 300, wy: 60 } }),
          rozmowaModel: async (o) => ({ zdania: ['Bo tak układa się bazę pod Twój najbliższy start.', 'Najpierw spokojne biegi, potem akcenty.'], tok: { we: 900, wy: 60 }, odrzucone: [], ponowiono: false, ogolnik: false }) });   // R2: atrapa rozmowy (0 $)
      const ost = adm.tabele.okienko_v2_log[adm.tabele.okienko_v2_log.length - 1] || {};
      const awaria = /v2-awaria/.test(String(ost.powod_odrzucenia || '')) ? String(ost.powod_odrzucenia).replace(/[A-Za-z0-9_-]{30,}/g, '…').slice(0, 80) : '';
      const tok = (ost.tok_we || 0) * CENA.we + (ost.tok_wy || 0) * CENA.wy + (ost.zapytania_sieci || 0) * CENA.zapytanie;
      const b = r.body || {};
      const tresc = (b.zdania && b.zdania[0]) ? b.zdania[0].slice(0, 70) : (b.akcja && b.akcja.nawiguj) ? 'ekran ' + b.akcja.nawiguj : (b.karty && b.karty.length) ? b.karty.length + ' kart' : (b.blad || b.limit || '');
      return { slad: r.slad, koszt: tok, tresc, status: r.status, karty: (b.karty || []).length, chipy: (b.chipy || []).length, awaria, rozIntencja: ost.intencja || null };
    };
    for (const p of w.po || []) await jeden(p);
    const r = await jeden(w.p);
    const slad = r.slad.join('>');
    /* 'router:X' = to narzędzie odpowiedziało — nieważne, czy przez router (0 tok.), czy przez rozumienie (E2, tryb 'v2'); 'v2:porada' itp. tylko z v2 */
    const sladN = slad.replace(/^v2:/, 'router:');
    /* 'a|b' = każda z dróg jest poprawna (np. żywienie: baza produktów albo sieć); '…*' = prefiks */
    const pasuje = String(w.oczekiwane).split('|').some((o) => (o.endsWith('*') ? slad.startsWith(o.slice(0, -1)) : (slad === o || (o.startsWith('router:') && sladN === o))));
    return { ...w, slad, pasuje, koszt: r.koszt, tresc: r.tresc, status: r.status, karty: r.karty, chipy: r.chipy, awaria: r.awaria, rozIntencja: r.rozIntencja };
  };
  const wiersze = new Array(pytania.length);
  let kolejny = 0;
  await Promise.all(Array.from({ length: Math.max(1, opcje.rownolegle || 1) }, async () => {
    while (kolejny < pytania.length) { const k = kolejny++; wiersze[k] = await jedenWiersz(pytania[k]); }
  }));
  if (opcje.zywy) { fs.writeFileSync(PLIK_ZYWE, JSON.stringify(Z, null, 1) + '\n', 'utf8'); wiersze.stat = stat; }   // nigdy nie nadpisuje _nagrania-v2.json
  wiersze.brakujace = [...brakujace];
  return wiersze;
}

function raport(w) {
  const md = ['# Ławka v2 — ' + new Date().toISOString().slice(0, 10), '',
    'Prawdziwy potok v2 na atrapach (konto testowe, F6 w pamięci); model i sieć symulowane. Ocena obiektywna: ślad logu = oczekiwany.', '',
    '| # | pytanie | kat. | oczekiwane | ślad | odpowiedź | koszt | ocena | luka |', '|---|---|---|---|---|---|---|---|---|'];
  w.forEach((r, i) => md.push(`| ${i + 1} | ${String(r.p).replace(/\|/g, '/')} | ${r.kat} | ${String(r.oczekiwane).replace(/\|/g, ' / ')} | ${r.slad}${r.awaria ? ' ⚠ ' + r.awaria.replace(/\|/g, '/') : ''} | ${String(r.tresc).replace(/\|/g, '/')} | ${r.koszt ? usd(r.koszt) : '0'} | ${r.pasuje ? 'dobra' : '**ZŁA**'} | ${r.luka || ''} |`));
  if (w.stat) {
    const ms = w.stat.ms.slice().sort((a, b) => a - b), q = (p) => ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : 0;
    const razem = w.stat.ok + w.stat.awaria;
    md.push('', `## Klasyfikator na żywo: obsłużył ${w.stat.ok}/${razem} (${razem ? (100 * w.stat.ok / razem).toFixed(1) : 0} %), awarie ${w.stat.awaria}; czas p50 ${q(0.5)} ms, p90 ${q(0.9)} ms, max ${ms[ms.length - 1] || 0} ms`, '');
    for (const [t, n] of Object.entries(w.stat.typy).sort((a, b) => b[1] - a[1])) md.push(`- ${n}× ${t}`);
  }
  const dobre = w.filter((r) => r.pasuje).length, luki = w.filter((r) => r.luka), zamkniete = luki.filter((r) => r.pasuje), regres = w.filter((r) => !r.pasuje && !r.luka);
  md.push('', `Podsumowanie: dobra ${dobre}/${w.length} (${(100 * dobre / w.length).toFixed(1)} %), znane luki ${luki.length} (w tym już zamknięte: ${zamkniete.length}), ` +
    `REGRESJE (złe bez znacznika luki): ${regres.length}; koszt sumy (symulacja): ${usd(w.reduce((s, r) => s + r.koszt, 0))}.`);
  if (regres.length) { md.push('', '## Regresje', ''); regres.forEach((r) => md.push(`- **${r.p}** — oczekiwane ${r.oczekiwane}, jest ${r.slad}`)); }
  if (luki.length) { md.push('', '## Znane luki wg etapu', ''); for (const e of [...new Set(luki.map((r) => r.luka))].sort()) md.push(`- ${e}: ` + luki.filter((r) => r.luka === e).map((r) => (r.pasuje ? '✅ ' : '') + r.p).join(' · ')); }
  return md.join('\n');
}

/* NOC (okienko-noc: limit 30 min i 0,50 USD): pełna ławka z ~1500 wygenerowanymi pytaniami przekroczyłaby oba i sędzia by nie ruszył. Co noc wiersze ręczne
   + okno wygenerowanych przesuwane z datą, więc cały zestaw przechodzi w ~10 nocy. Procent i alarm liczone jak dotąd z ręcznych (porównywalne z historią). */
function probkaNocy(pytania, dzis, ile = 150) {
  const gen = pytania.filter((w) => w.zrodlo === 'claude');
  if (gen.length <= ile) return gen;
  const dzien = Math.floor(Date.parse(dzis + 'T00:00:00Z') / 86400000), start = (dzien * ile) % gen.length;
  return Array.from({ length: ile }, (_, i) => gen[(start + i) % gen.length]);
}

module.exports = { przebieg, raport, probkaNocy, PYTANIA };

if (require.main === module) (async () => {
  const iR = process.argv.indexOf('--rownolegle');
  const w = await przebieg(PYTANIA, { zywy: process.argv.includes('--zywy'), rownolegle: iR > 0 ? Number(process.argv[iR + 1]) || 1 : 1 });
  if (process.argv.includes('--wzorzec')) { for (const r of w) console.log(JSON.stringify([r.p, r.kat, r.slad, r.tresc])); if (w.brakujace.length) console.error('BRAK NAGRAŃ:', JSON.stringify(w.brakujace)); return; }
  const md = raport(w);
  if (w.stat) console.error(`klasyfikator: ok ${w.stat.ok}, awaria ${w.stat.awaria}`, w.stat.typy, '→ udane nagrania w tests/_nagrania-v2-zywe.json (CI czyta _nagrania-v2.json — scal ręcznie po przeglądzie)');
  const plik = path.join(KORZEN, 'docs', 'lawka-v2-' + new Date().toISOString().slice(0, 10) + (w.stat ? '-zywy' : '') + '.md');
  fs.writeFileSync(plik, md, 'utf8');
  if (!process.argv.includes('--md')) console.log(md);
  console.error('zapisano', path.relative(KORZEN, plik));
})();

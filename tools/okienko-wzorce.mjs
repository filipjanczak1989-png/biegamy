// WZORCE PORAD (Filip 3.11 i 4.11): 200 najczęstszych porad → odpowiedź wzorcowa od Claude → KANDYDACI w bazie wiedzy, do zatwierdzenia w panelu trenera. Nic nie trafia do docs.
//
//   deno run -A tools/okienko-wzorce.mjs --generuj 200 [--limit-usd 30] [--rownolegle 3] [--bez-sieci] [--plik <json>]
//       → %USERPROFILE%\Downloads\biegamy-podglady\wzorce-kandydaci.json, zapis po każdej odpowiedzi; przerwany przebieg wznawia się bez ponownej zapłaty
//   deno run -A tools/okienko-wzorce.mjs --sql [--plik <json>]
//       → wzorce-kandydaci.sql obok pliku JSON (0 $): insert … status='kandydat', idempotentny; wykonuje Filip po migracji:
//         supabase db query --linked --workdir ~/.cache/sb-audit -f <plik>.sql
//
// LISTA PYTAŃ: ławka po scaleniu (intencje porada, żywienie, sprzęt; bez dopytań) wg `waga`, bez pytań prawie takich samych i bez własnych danych; czego brakuje do N, dopisuje Claude.
// ⚠️ „Najczęstsze” to szacunek wagi z ławki, nie zmierzona częstość z logów. Do API idą wyłącznie te syntetyczne pytania.
// Wzorce są już w głosie BiegaMy, więc nie przechodzą przez przepisanie (przepisana = true). Klucza do bazy narzędzie nie zna. Koszt liczy dziennik (tools/_claude.mjs); --limit-usd zatrzymuje ten punkt wcześniej niż stop 90 USD.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zapytaj, zapytajZWyszukiwaniem, tekstZCytowaniami, podsumowanie, MODELE, StopBudzetu, OdmowaModelu } from "./_claude.mjs";
import { podobienstwo, kluczWiedzy, pytanieKandydata, odpowiedzKandydata, waznoscDla, sygnatura, czyWlasne, sprawdzPrzepisanie } from "../supabase/functions/okienko-v2/baza-wiedzy.mjs";
import { naZdania } from "../supabase/functions/okienko/siec.mjs";

const require = createRequire(import.meta.url);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const jest = (n) => process.argv.includes(n);
export const NARZEDZIE = "okienko-wzorce";
export const INTENCJE_PORAD = ["porada", "zywienie", "sprzet"];
export const PLIK_DOMYSLNY = path.join(os.homedir(), "Downloads", "biegamy-podglady", "wzorce-kandydaci.json");

export const SYSTEM_WZORCA = [
  "Piszesz ODPOWIEDŹ WZORCOWĄ dla asystenta biegowego w polskiej aplikacji BiegaMy, w głosie trenera BiegaMy. Trener zatwierdzi ją w panelu, a potem asystent będzie nią odpowiadał biegaczom.",
  "Odbiorca: biegacz amator z Polski. Mówisz na „Ty”, po polsku, 3–5 krótkich zdań (5 to twardy limit, rozbudowany plan skróć do najważniejszych kroków), bez emoji, wykrzykników, list, nagłówków i wstępu; zacznij od sedna. Nie pisz „według źródeł”, „większość źródeł” ani „badania pokazują”: podaj samą treść, źródła dokładamy osobno.",
  "Konkret: liczby, zakresy, kroki w kolejności; przy sprzęcie cechy i orientacyjne ceny w złotych, nie reklama jednej marki. Każdą liczbę oprzyj na źródle; gdy źródła się różnią, podaj zakres.",
  "Nie pisz „słuchaj swojego ciała”, „każdy organizm jest inny”, „skonsultuj się ze specjalistą” zamiast odpowiedzi. Przy bólu, chorobie albo urazie: jedno zdanie, że to sprawa dla lekarza lub fizjoterapeuty.",
  "Żadnych linków w treści i nazwisk osób prywatnych. Pisz wyłącznie treść odpowiedzi.",
].join("\n");

/* PRZY WYBORZE LISTY (nie przy odpowiadaniu): płatny wzorzec na pytanie prawie takie samo to zmarnowane pieniądze, więc tu wystarczy 60% wspólnych słów treści przy tych samych liczbach */
const PROG_LISTY = 0.6;
export function prawieTakieSamo(a, b) {
  if (podobienstwo(a, b) > 0) return true;
  const A = sygnatura(a), B = sygnatura(b);
  if (A.liczby.size !== B.liczby.size || [...A.liczby].some((x) => !B.liczby.has(x))) return false;
  const wsp = [...A.tokeny].filter((x) => B.tokeny.has(x)).length, suma = A.tokeny.size + B.tokeny.size - wsp;
  return suma > 0 && wsp / suma >= PROG_LISTY;
}
/* ławka ma też styl z telefonu; do bazy idzie pytanie bez emoji i bez „??”, bo trener nie edytuje pytania w panelu */
export const czystePytanie = (t) => String(t || "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/([?!.])[?!.]+/g, "$1").replace(/\s+/g, " ").trim();
/* pytanie, którego bramka własnych danych nigdy nie poda z bazy („…nigdy wcześniej nie biegałem”), nie zasługuje na płatny wzorzec */
const nadajeSie = (q) => !!q && !!kluczWiedzy(q) && !czyWlasne(q);

/** pytania z ławki wg wagi, bez powtórek i bez pytań, które nie mogą być kandydatem (osoba, akcja, własne dane); nigdy dopytania ani pytania spoza porad */
export function wybierzPytania(pytania, n) {
  const kand = pytania.filter((w) => INTENCJE_PORAD.includes(w.intencja) && !w.po).slice().sort((a, b) => (b.waga || 0) - (a.waga || 0));
  const out = [];
  for (const w of kand) {
    if (out.length >= n) break;
    const q = pytanieKandydata(czystePytanie(w.p));
    if (!nadajeSie(q) || out.some((x) => prawieTakieSamo(x.pytanie, q))) continue;
    out.push({ pytanie: q, intencja: w.intencja, waga: w.waga || 2 });
  }
  return out;
}

const SCHEMAT_LISTY = { type: "object", additionalProperties: false, required: ["pytania"], properties: { pytania: { type: "array", items: { type: "object", additionalProperties: false, required: ["p", "intencja", "waga"],
  properties: { p: { type: "string" }, intencja: { type: "string", enum: INTENCJE_PORAD }, waga: { type: "integer" } } } } } };

/** gdy ławka daje mniej niż N: Claude dopisuje najczęstsze pytania biegaczy (≤ 3 próby) */
export async function uzupelnijPytania(lista, n, { klient, plik, log = console.log } = {}) {
  const out = lista.slice();
  for (let proba = 0; proba < 3 && out.length < n; proba++) {
    const ile = n - out.length + 15;
    const r = await zapytaj({ narzedzie: NARZEDZIE, model: MODELE.opus, effort: "medium", maxTokens: 16000, schema: SCHEMAT_LISTY, klient, plik, system: "Znasz pytania, które biegacze amatorzy z Polski najczęściej zadają o trening, jedzenie i sprzęt. Bez zdrowia, kontuzji i bólu. Każde pytanie krótko, jak wpis na telefonie, samodzielne. waga 1–5 = jak często pada.",
      messages: [{ role: "user", content: `Podaj ${ile} najczęstszych pytań, których NIE ma poniżej (także w innej formie):\n${out.map((x) => "- " + x.pytanie).join("\n")}` }] });
    let dodane = 0;
    for (const q of r.json.pytania || []) {
      const p = pytanieKandydata(czystePytanie(q.p).slice(0, 200));
      if (out.length >= n || !nadajeSie(p) || !INTENCJE_PORAD.includes(q.intencja) || out.some((x) => prawieTakieSamo(x.pytanie, p))) continue;
      out.push({ pytanie: p, intencja: q.intencja, waga: Math.min(5, Math.max(1, Number(q.waga) || 2)) }); dodane++;
    }
    log(`  uzupełnienie listy: +${dodane}, ${r.usd.toFixed(3)} USD`);
  }
  return out;
}

/* Wariant podstawowy, jedno wyszukanie (próba na żywo 4.11): web_search_20260209 (filtrowanie dynamiczne) nie zwrócił ani jednego cytowania, więc wzorce nie miały źródeł,
   i kosztował 0,14 USD wobec 0,078 USD na tym samym pytaniu. */
export const NARZEDZIE_SIECI = { type: "web_search_20250305", name: "web_search", max_uses: 1 };
export const TEMATY = { porada: "trening", zywienie: "żywienie", sprzet: "sprzęt" };

/** jedna odpowiedź wzorcowa → {wzorzec, zrodla} albo null: ci sami strażnicy co kandydat z sieci (akcja, dane osoby, ogólnik, długość); wzorzec z sieci bez źródła odpada, bo trener nie ma czego sprawdzić */
export async function napiszWzorzec(q, { klient, plik, zSiecia = true, narzedzie = NARZEDZIE_SIECI, opcjeZadania = { maxRetries: 6 } } = {}) {
  const baza = { narzedzie: NARZEDZIE, model: MODELE.opus, effort: "medium", maxTokens: 4000, system: SYSTEM_WZORCA, klient, plik, opcjeZadania, messages: [{ role: "user", content: q.pytanie }] };
  const r = zSiecia ? await zapytajZWyszukiwaniem({ ...baza, tools: [narzedzie] }) : await zapytaj(baza);
  const { tekst, zrodla } = tekstZCytowaniami(r.content);
  const wzorzec = odpowiedzKandydata([przytnijWzorzec(String(tekst || "").replace(/\s+/g, " ").trim())]);
  if (!wzorzec) return null;
  const pewne = zrodla.filter((z) => /^https:\/\/[^\s"'<>]{4,1000}$/.test(z.url)).slice(0, 3).map((z) => ({ tytul: String(z.tytul || "").slice(0, 200), url: z.url }));
  if (zSiecia && !pewne.length) return null;
  return { wzorzec, zrodla: pewne };
}

export const czytajPlik = (plik) => { try { return JSON.parse(fs.readFileSync(plik, "utf8")); } catch { return { wpisy: [] }; } };
const zapiszPlik = (plik, wpisy, dzis) => { fs.mkdirSync(path.dirname(plik), { recursive: true }); fs.writeFileSync(plik, JSON.stringify({ dzis, wpisy }, null, 1)); };

/** generuje brakujące wpisy z limitem kosztu tego narzędzia; zapis po każdym wpisie */
export async function generujWzorce(lista, { wpisy = [], klient, plik, limitUsd = 30, rownolegle = 3, zSiecia = true, dzis, kosztNarzedzia = () => (podsumowanie(plik).narzedzia[NARZEDZIE] || { usd: 0 }).usd, zapisz = () => {}, log = console.log } = {}) {
  const gotowe = new Set(wpisy.map((w) => w.pytanie)), brak = lista.filter((q) => !gotowe.has(q.pytanie)), wynik = wpisy.slice();
  let i = 0, stop = null;
  await Promise.all(Array.from({ length: Math.max(1, rownolegle) }, async () => {
    while (i < brak.length && !stop) {
      if (kosztNarzedzia() >= limitUsd) { stop = `limit ${limitUsd} USD tego punktu`; break; }
      const q = brak[i++];
      try {
        const w = await napiszWzorzec(q, { klient, plik, zSiecia });
        if (!w) { log(`  pominięte przez strażnika: ${q.pytanie.slice(0, 50)}`); continue; }
        wynik.push({ ...q, ...w, temat: TEMATY[q.intencja] || q.intencja, ...waznoscDla(q.pytanie, q.intencja, dzis, w.wzorzec) });
        zapisz(wynik);
        log(`  ${wynik.length}/${lista.length}, narzędzie ${kosztNarzedzia().toFixed(2)} USD`);
      } catch (e) {
        if (e instanceof StopBudzetu) { stop = e.message; break; }
        log(`  ! ${q.pytanie.slice(0, 40)}: ${String(e.message).slice(0, 80)}${e instanceof OdmowaModelu ? " (odmowa, pomijam)" : ""}`);
      }
    }
  }));
  return { wpisy: wynik, stop };
}

/** Twardy limit długości (Filip 4.11: 96 ze 195 wzorców miało ponad 5 zdań mimo instrukcji): tniemy tylko na granicy zdania, całe zdania zostają. */
export const MAX_ZDAN_WZORCA = 5;
export function przytnijWzorzec(tekst) {
  const z = naZdania(tekst);
  return z.length > MAX_ZDAN_WZORCA ? z.slice(0, MAX_ZDAN_WZORCA).join(" ") : String(tekst || "").trim();
}

/* Źródła komercyjne (Filip 4.11): sklepy, marki, suplementy, płatne aplikacje, artykuły sponsorowane. Lista z klasyfikacji Claude na 262 domenach wzorców, przejrzana ręcznie; dopisane nike.com, getfitcraft.com, rundatalab.com. */
export const DOMENY_KOMERCYJNE = new Set("24newsclick.com 4pros.net 8a.pl acibademinternational.com alabsport.pl allegro.pl altftool.com anakonda.net.pl babycomfort.pl bankomania.pkobp.pl biegowyplan.pl blog.carpatree.com boltpharmacy.co.uk brooks-running.pl buypeakperformance.com ceneo.pl centrumogloszenprasowych.pl coffeestudies.com ctyeh.com dangelo.app deadlift.com.pl decathlon.pl doz.pl e-horyzont.pl easymove.com.pl egol.pl empik.com ethicsport.pl eurolines.pl expertrankingowy.pl exploris.pl findyouredge.app fitnessport.eu fitrankingi.pl fleetfeet.com foodango.pl ftpendurancefuel.com futbolonline.pl garmin.com getfitcraft.com getsteps.app getthatspeed.pl gpfoto.pl gsmmaniak.pl healthlabs.care hop-sport.pl hpba.pl immufix.com ironfactory.pl jaksieodchudzic.pl kingrunner.com komputronik.pl leki.pl longevityourway.com magniflex.pl marathons.com mavr.app mealdill.com mediaexpert.pl medigym.pl megaoutdoor.pl memnews.pl morele.net movemore.pl nakednutrition.com natural-born-runners.pl neuralpro.pl never2.com newbalance.pl newspaper-daily.com nike.com nordicvida.pl notosport.pl ostrovit.com outdoorzy.pl pacebuddies.com pacelab.fitness panpablo.pl peakvo2trainer.com perlasport.pl pheidi.training pilka.com.pl plusssz.pl polar.com przyszlosc-wlochy.pl redbull.com robdrinki.pl rundatalab.com rundida.com runningxpert.com runoapp.com runv.app sahha.ai salt.pl scienceinsport.com shoulditrain.com silentheroes.store sklepbiegacza.pl smmash.pl sport-shop.pl sportano.pl sportofino.com sportowa.com.pl sportowa.pl stestuje.pl supplementmath.com swiatsupli.pl training121.com trenara.com vectorsmart.pl vithai.pl wattlog.pro wizaz.pl world.nessi-sport.com x-kom.pl zadbanispa.pl".split(" "));
export function czyKomercyjne(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return /\.(store|shop|app)$/.test(h) || DOMENY_KOMERCYJNE.has(h) || [...DOMENY_KOMERCYJNE].some((d) => h.endsWith("." + d));
  } catch { return true; }
}
export const zrodlaBezKomercyjnych = (z) => (Array.isArray(z) ? z : []).filter((x) => x && !czyKomercyjne(x.url));

/* Przepisanie po trenersku (Filip 4.11): zero nowych liczb i faktów, strażnik ten sam co przy kandydacie z sieci; odrzucone zostaje przycięte do 5 zdań, a wpis ma przepisany: false. */
export const SYSTEM_PRZEPISANIA = [
  "Przepisujesz odpowiedź wzorcową asystenta biegowego BiegaMy na głos trenera. Mówisz na „Ty”, po polsku, najwyżej 5 krótkich zdań, od sedna: co zrobić, ile, jak często. Bez wstępu.",
  "Zachowaj sens i najważniejsze liczby z tekstu. Nie dodawaj żadnych nowych faktów ani liczb; każda liczba musi stać w tekście źródłowym, w tej samej postaci. Gdy rozbudowany plan się nie mieści, zostaw najważniejsze kroki.",
  "Bez nazw marek, sklepów i produktów, reklam, linków, nazwisk, emoji, wykrzykników, list i nagłówków. Bez „słuchaj swojego ciała”, „każdy organizm jest inny”, „skonsultuj się ze specjalistą” zamiast odpowiedzi. Zdanie o lekarzu lub fizjoterapeucie zostaw tylko, gdy jest w tekście i dotyczy bólu albo choroby.",
].join("\n");
const SCHEMAT_PRZEPISANIA = { type: "object", additionalProperties: false, required: ["zdania"], properties: { zdania: { type: "array", items: { type: "string" } } } };
const MARKI = /\b(decathlon|garmin|nike|adidas|asics|brooks|hoka|saucony|mizuno|new balance|polar|suunto|coros|kiprun|salomon|amazfit|strava|ostrovit|olimp|isostar|maurten|sis)\b/i;
export async function przepiszWzorzec(w, { klient, plik, opcjeZadania = { maxRetries: 6 } } = {}) {
  const r = await zapytaj({ narzedzie: NARZEDZIE, model: MODELE.opus, effort: "low", maxTokens: 1500, system: SYSTEM_PRZEPISANIA, schema: SCHEMAT_PRZEPISANIA, klient, plik, opcjeZadania,
    messages: [{ role: "user", content: `PYTANIE: ${w.pytanie}\nTEKST: ${w.wzorzec}` }] });
  const nowa = sprawdzPrzepisanie(w.wzorzec, r.json && r.json.zdania);
  if (!nowa || naZdania(nowa).length > MAX_ZDAN_WZORCA || (MARKI.test(nowa) && !MARKI.test(w.pytanie))) return { wzorzec: przytnijWzorzec(w.wzorzec), przepisany: false };
  return { wzorzec: nowa, przepisany: true };
}
/** wszystkie wpisy: odsianie źródeł, ponowne wyszukanie dla tych bez źródła, przepisanie; zapis po każdym wpisie, gotowe nie płacą drugi raz */
export async function przepiszWszystkie(wpisy, { klient, plik, limitUsd = 15, rownolegle = 3, kosztNarzedzia = () => (podsumowanie(plik).narzedzia[NARZEDZIE] || { usd: 0 }).usd, zapisz = () => {}, log = console.log } = {}) {
  const start = kosztNarzedzia(), wynik = wpisy.map((w) => ({ ...w }));
  let i = 0, stop = null;
  const narzedzieSieci = { ...NARZEDZIE_SIECI, blocked_domains: [...DOMENY_KOMERCYJNE].slice(0, 100) };
  await Promise.all(Array.from({ length: Math.max(1, rownolegle) }, async () => {
    while (i < wynik.length && !stop) {
      const k = i++, w = wynik[k];
      if (w.przepisany != null) continue;
      if (kosztNarzedzia() - start >= limitUsd) { stop = `limit ${limitUsd} USD tego przebiegu`; break; }
      try {
        let baza = { ...w, zrodla: zrodlaBezKomercyjnych(w.zrodla) };
        if (!baza.zrodla.length) {
          const nowy = await napiszWzorzec(w, { klient, plik, zSiecia: true, narzedzie: narzedzieSieci });
          const pewne = nowy ? zrodlaBezKomercyjnych(nowy.zrodla) : [];
          if (nowy && pewne.length) baza = { ...baza, wzorzec: nowy.wzorzec, zrodla: pewne }; else baza.bez_zrodla = true;
        }
        Object.assign(w, baza, await przepiszWzorzec(baza, { klient, plik }));
        zapisz(wynik);
        if (k % 20 === 0) log(`  ${k + 1}/${wynik.length}, przebieg ${(kosztNarzedzia() - start).toFixed(2)} USD`);
      } catch (e) {
        if (e instanceof StopBudzetu) { stop = e.message; break; }
        log(`  ! ${w.pytanie.slice(0, 40)}: ${String(e.message).slice(0, 80)}`);
      }
    }
  }));
  return { wpisy: wynik, stop, usd: kosztNarzedzia() - start };
}

const sql = (s) => "'" + String(s).replace(/'/g, "''") + "'";
/** plik SQL: tylko status 'kandydat', on conflict do nothing (powtórka nic nie psuje, wpis zatwierdzony albo odrzucony zostaje), wzorzec bez zapytań. → {tekst, wierszy} */
export function sqlKandydatow(wpisy) {
  const bylo = new Set(), wiersze = [];
  for (const w of wpisy || []) {
    const k = kluczWiedzy(w.pytanie);
    /* same źródła komercyjne: trener nie ma czego sprawdzić, wpis wraca dopiero po --przepisz z nowym wyszukaniem */
    if (!k || bylo.has(k) || !INTENCJE_PORAD.includes(w.intencja) || !w.wzorzec || w.bez_zrodla || ((w.zrodla || []).length && !zrodlaBezKomercyjnych(w.zrodla).length)) continue;
    bylo.add(k);
    wiersze.push(`insert into public.okienko_wiedza (klucz, pytanie, odpowiedz, zrodla, temat, intencja, waznosc, wazna_do, nietrwala, przepisana, skad, status, zapytan) values (${sql(k)}, ${sql(w.pytanie)}, ${sql(przytnijWzorzec(w.wzorzec))}, ${sql(JSON.stringify(zrodlaBezKomercyjnych(w.zrodla)))}::jsonb, ${sql(String(w.temat || w.intencja).slice(0, 60))}, ${sql(w.intencja)}, ${sql(w.waznosc)}, ${w.wazna_do ? sql(w.wazna_do) + "::date" : "null"}, ${w.nietrwala ? "true" : "false"}, true, 'wzorzec', 'kandydat', 0) on conflict (klucz) do nothing;`);
  }
  return { tekst: ["-- Wzorce od Claude jako kandydaci bazy wiedzy (tools/okienko-wzorce.mjs --sql). Zatwierdza trener w panelu. Powtórne wykonanie nic nie zmienia.", "begin;", ...wiersze, "commit;", ""].join("\n"), wierszy: wiersze.length };
}

if (import.meta.main) {
  const plik = arg("--plik", PLIK_DOMYSLNY), dzis = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
  if (jest("--sql")) {
    const { tekst, wierszy } = sqlKandydatow(czytajPlik(plik).wpisy);
    const wyj = plik.replace(/\.json$/, "") + ".sql";
    fs.writeFileSync(wyj, tekst);
    console.log(`wierszy: ${wierszy} → ${wyj}\nPo migracji: supabase db query --linked --workdir ~/.cache/sb-audit -f "${wyj}"`);
  } else if (jest("--przepisz")) {
    const wyj = plik.replace(/\.json$/, "") + "-przepisane.json";
    const zrodlo = fs.existsSync(wyj) ? wyj : plik;
    const { wpisy, stop, usd } = await przepiszWszystkie(czytajPlik(zrodlo).wpisy, { limitUsd: Number(arg("--limit-usd", "15")), rownolegle: Number(arg("--rownolegle", "3")), zapisz: (w) => zapiszPlik(wyj, w, dzis) });
    zapiszPlik(wyj, wpisy, dzis);
    if (stop) console.log("STOP:", stop);
    const s = podsumowanie();
    console.log(`wpisów ${wpisy.length}, przepisane ${wpisy.filter((w) => w.przepisany).length}, tylko przycięte ${wpisy.filter((w) => w.przepisany === false).length}, bez źródła ${wpisy.filter((w) => w.bez_zrodla).length} → ${wyj}\nprzebieg ${usd.toFixed(2)} USD (łącznie ${s.razem.toFixed(2)} / ${s.stop} USD)\nDalej: deno run -A tools/okienko-wzorce.mjs --sql --plik "${wyj}"`);
  } else if (jest("--generuj")) {
    const n = Number(arg("--generuj", "200"));
    const { PYTANIA } = require("../tests/_lawka-v2-pytania.js");
    const lista = await uzupelnijPytania(wybierzPytania(PYTANIA, n), n);
    console.log(`pytań: ${lista.length}; Claude (${MODELE.opus}) pisze wzorce do ${plik}`);
    const { wpisy, stop } = await generujWzorce(lista, { wpisy: czytajPlik(plik).wpisy, dzis, limitUsd: Number(arg("--limit-usd", "30")), rownolegle: Number(arg("--rownolegle", "3")), zSiecia: !jest("--bez-sieci"), zapisz: (w) => zapiszPlik(plik, w, dzis) });
    if (stop) console.log("STOP:", stop);
    zapiszPlik(plik, wpisy, dzis);
    const s = podsumowanie();
    console.log(`wpisów: ${wpisy.length} → ${plik}\nkoszt punktu: ${(s.narzedzia[NARZEDZIE] || { usd: 0 }).usd.toFixed(2)} USD (łącznie ${s.razem.toFixed(2)} / ${s.stop} USD)\nDalej: deno run -A tools/okienko-wzorce.mjs --sql`);
  } else console.log("użycie: --generuj 200 [--limit-usd 30] [--rownolegle 3] [--bez-sieci] [--plik <json>] | --przepisz [--limit-usd 15] [--plik <json>] | --sql [--plik <json>]");
}

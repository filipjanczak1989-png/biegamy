// Przykłady do testu filtra moderacji (Filip 4.11): Claude generuje 500 wpisów z etykietą, filtr działa w kodzie bez API. Plik wynikowy: tests/_moderacja-przyklady.json.
//   deno run -A tools/moderacja-przyklady.mjs [--plik tests/_moderacja-przyklady.json]
// Do API idzie tylko opis zadania. Budżet: tools/_claude.mjs.
import fs from "node:fs";
import { zapytaj, MODELE, podsumowanie } from "./_claude.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const plik = arg("--plik", "tests/_moderacja-przyklady.json");
const SYSTEM = "Pomagasz zespołowi polskiej aplikacji biegowej zbudować test filtra moderacji. Wpisy (imiona osób wpłacających, nazwy firm, imię gracza) pokazują się publicznie przy zbiórce charytatywnej dla dziecka. Test jest po to, żeby takie treści NIE trafiły na stronę, więc lista musi zawierać prawdziwe wulgaryzmy i obejścia, bez eufemizmów.";
const SCHEMAT = { type: "object", additionalProperties: false, required: ["przyklady"], properties: { przyklady: { type: "array", items: { type: "object", additionalProperties: false, required: ["tekst", "rodzaj", "blokowac", "kategoria"],
  properties: { tekst: { type: "string" }, rodzaj: { type: "string", enum: ["imie", "firma"] }, blokowac: { type: "boolean" }, kategoria: { type: "string", enum: ["wulgarne", "obrazliwe", "polityczne", "reklamowe", "wrazliwe", "dobre"] } } } } } };
const PARTIE = [
  ["imie", 60, "wulgarne", "wulgaryzmy po polsku podane jako imię: cyfry zamiast liter, literówki, powtórzone litery, kropki i spacje między literami, gwiazdki, cyrylica, ó/u, ch/h, v/w, q/k"],
  ["firma", 60, "wulgarne", "nazwy firm z wulgaryzmem w środku albo na końcu, także „Sp. z o.o.”, obejścia jak wyżej"],
  ["imie", 30, "obrazliwe", "wyzwiska, obelgi na tle pochodzenia, orientacji, niepełnosprawności, nazistowskie; z obejściami"],
  ["firma", 30, "obrazliwe", "nazwy firm obraźliwe albo nienawistne; z obejściami"],
  ["imie", 20, "polityczne", "nazwiska polskich i światowych polityków, partie, hasła podane jako imię; z obejściami"],
  ["firma", 40, "polityczne", "nazwa pozornej firmy będąca hasłem politycznym, partią, poparciem polityka"],
  ["imie", 15, "reklamowe", "reklama wpisana w imię: adres strony, numer, kod rabatowy, hasztag"],
  ["firma", 35, "reklamowe", "wpis firmy będący reklamą: adres strony w nazwie, telefon, promocja, procent, „najtańsze”, kasyno, pożyczki, krypto"],
  ["firma", 10, "wrazliwe", "wpisy nie na miejscu przy zbiórce dla chorego dziecka: śmierć, oszustwo, drwina z choroby"],
  ["imie", 100, "dobre", "PRAWDZIWE polskie i zagraniczne imiona, także te podobne do wulgaryzmów (Cyprian, Kornel, Hubert, Szymon, Dorota, Jan-Paweł, Anna-Maria, Marek, Fabian, Jarosław), z polskimi znakami; blokowac=false"],
  ["firma", 100, "dobre", "PRAWDZIWIE brzmiące polskie firmy, także podobne do wulgaryzmów (Kutno Trans, Pierre Cardin, Dupont, Cipriani, Hubertus, Skurczyński, Kurowski Sp. z o.o., Suchy Las, Pizzeria Roma, Szmaragd, Rakowski), biura rachunkowe, piekarnie, serwisy; blokowac=false"],
];
const wynik = [], bylo = new Set();
for (const [rodzaj, ile, kategoria, opis] of PARTIE) {
  let r;
  try {
    r = await zapytaj({ narzedzie: "moderacja-przyklady", model: MODELE.opus, effort: "low", maxTokens: 8000, system: SYSTEM, schema: SCHEMAT, opcjeZadania: { maxRetries: 4 },
      messages: [{ role: "user", content: `Podaj ${ile} różnych przykładów. rodzaj: ${rodzaj}. kategoria: ${kategoria}. blokowac: ${kategoria === "dobre" ? "false" : "true"}. Opis: ${opis}. Każdy tekst do ${rodzaj === "imie" ? 25 : 80} znaków, bez powtórek.` }] });
  } catch (e) { console.log(`  ! ${rodzaj}/${kategoria}: ${String(e.message).slice(0, 100)}`); continue; }
  let n = 0;
  for (const p of r.json.przyklady || []) {
    const k = p.rodzaj + "|" + p.tekst.trim().toLowerCase();
    if (!p.tekst.trim() || bylo.has(k)) continue;
    bylo.add(k); wynik.push({ tekst: p.tekst.trim(), rodzaj, kategoria, blokowac: kategoria !== "dobre" }); n++;
  }
  console.log(`  ${rodzaj}/${kategoria}: ${n}/${ile}, ${r.usd.toFixed(3)} USD`);
  fs.writeFileSync(plik, JSON.stringify(wynik, null, 0).replace(/\},\{/g, "},\n{"));
}
const s = podsumowanie();
console.log(`przykładów: ${wynik.length} → ${plik}; koszt punktu ${(s.narzedzia["moderacja-przyklady"] || { usd: 0 }).usd.toFixed(2)} USD; łącznie ${s.razem.toFixed(2)} / ${s.stop} USD`);

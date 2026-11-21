// OKIENKO — odpowiedzi o biegu wirtualnym (Filip 21.11). Jedynym źródłem tekstu jest js/bieg.mjs: to samo złożenie co bieg.html
// (B.regulaminBloki(B.wartosciTekstow(bieg, licznik, link))), z polem `bieg` publicznego licznika akcji (wersja regulaminu, daty, dystans z bazy).
// Tu nie ma ani jednego zdania regulaminu: router (tematBiegu) wskazuje ustępy, ten plik je wybiera. Cały ustęp słowo w słowo (decyzja Filipa 21.11).
// Wołają: EF okienko (v1) i potok v2. Brak licznika, pola `bieg`, linku zbiórki albo ustępu → null, a EF zostawia zdanie routera („Nie wiem tego na pewno.” + link).
import "../../../js/bieg.mjs";
import { kartaStrony, ZDANIE_BEZ_TERMINU_ZAPISOW } from "./router.mjs";

const B = /** @type {any} */ (globalThis).BM_BIEG_REAL;
const httpsOk = (u) => { try { return new URL(String(u)).protocol === "https:"; } catch { return false; } };
/* § 1 ust. 2: imię dziecka i link zbiórki — nigdy w Okienku (blizna-329), nawet gdyby router kiedyś go wskazał */
export const USTEPY_ZAKAZANE = ["1.2"];

/** licznik akcji → { ust: {"5.1": tekst, …}, tytul } | null. Link zbiórki z licznika po sprawdzeniu https: w funkcji nie ma safeExternalHref z sb.js,
 *  więc BM_AKCJA.linkZbiorki daje "", a bez linku wartosciTekstow zwraca null (strona biegu w przeglądarce robi to przez linkZbiorki). */
export function ustepyRegulaminu(licznik) {
  const bieg = licznik && licznik.bieg;
  if (!B || !bieg || typeof bieg !== "object") return null;
  const w = B.wartosciTekstow(bieg, licznik, httpsOk(licznik.url_zbiorki) ? licznik.url_zbiorki : "");
  if (!w) return null;
  const ust = {};
  let par = "", tytul = "";
  for (const x of B.regulaminBloki(w)) {
    if (x.typ === "tytul") tytul = x.tekst;
    else if (x.typ === "naglowek") { const m = /^§ (\d+)\./.exec(x.tekst); par = m ? m[1] : ""; }
    else if (x.typ === "punkt" && par) { const m = /^(\d+)\.\s+([\s\S]+)$/.exec(x.tekst); if (m) ust[par + "." + m[1]] = m[2]; }
  }
  return { ust, tytul };
}

/** licznik + temat z routera ({podtemat, ust}) → { zdania, karty } | null */
export function odpowiedzBiegu(licznik, temat) {
  if (!temat || !Array.isArray(temat.ust)) return null;
  const r = ustepyRegulaminu(licznik);
  if (!r) return null;
  const karta = kartaStrony("bieg", typeof licznik.bieg.nazwa === "string" && licznik.bieg.nazwa.trim() ? licznik.bieg.nazwa.trim() : "");
  if (temat.podtemat === "regulamin") return r.tytul ? { zdania: [r.tytul], karty: [karta] } : null;
  const klucze = temat.ust.filter((k) => !USTEPY_ZAKAZANE.includes(k));
  const zdania = klucze.map((k) => r.ust[k]);
  if (!klucze.length || zdania.some((z) => !z)) return null;   // inna wersja regulaminu bez tego ustępu → „nie wiem”, nigdy zgadywanie
  const podpis = "Regulamin biegu, " + klucze.map((k) => "§ " + k.split(".")[0] + " ust. " + k.split(".")[1]).join(", ") + ".";
  return { zdania: [...(temat.podtemat === "termin-zapisow" ? [ZDANIE_BEZ_TERMINU_ZAPISOW] : []), ...zdania, podpis], karty: [karta] };
}

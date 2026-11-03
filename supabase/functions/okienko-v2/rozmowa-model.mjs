// OKIENKO 2.0 — R2: TRYB ROZMOWA (Filip 3.11 16:00 „ma mieć pamięć i umieć gadać”; docs/projekt-okienko-rozmowa-pamiec-2026-11-03.md §1, §3).
// Dopytanie („a dlaczego?”, „wyjaśnij prościej”, „a dla mnie?”, „jak to zrobić w praktyce”, „a jeszcze?”) w świeżej rozmowie (≤ 30 min) →
// JEDNO wywołanie modelu z: charakterem trenera BiegaMy, ostatnimi ≤ 5 wymianami (pytanie + skrót odpowiedzi z okienko_v2_rozmowa) i —
// od R3 — pasującymi faktami z pamięci długiej. LICZBY: tylko te, które już padły w poprzednich odpowiedziach/pytaniach/faktach (ten sam
// strażnik co v1: dozwoloneLiczby + sprawdz) — model nie liczy nic nowego; nowa liczba = zdanie wycięte. OGÓLNIKI: jak w wiedza.mjs —
// jedno ponowienie, potem krócej. Zdrowie nie wchodzi tu (stałe teksty). Do modelu NIE trafia nic poza treścią rozmowy tego człowieka.
import { generujJson } from "./gemini.mjs";
import { sprawdz } from "../okienko/straznik.mjs";
import { czyOgolnik, bezOgolnikow, OGOLNIKI } from "./wiedza.mjs";

export const MAX_WYMIAN = 5, MAX_TOK_ROZMOWY = 220, TIMEOUT_ROZMOWY_MS = 6000;
const RE_DOPYTANIE = [
  /^(a |no |to |i )?(dlaczego|czemu|po co)(\s|\?|$)/, /(^|\s)dlaczego (tak|taki|taka|takie|akurat|wlasnie)(\s|\?|$)/,
  /(^|\s)wyjasnij(\s|\?|$)/, /(^|\s)(prosciej|jasniej|inaczej|po ludzku|krocej|dokladniej)(\s|\?|$)/, /(^|\s)a dla mnie(\s|\?|$)/, /(^|\s)a u mnie(\s|\?|$)/,
  /(^|\s)jak to (zrobic|wdrozyc|zastosowac|ugryzc)(\s|\?|$)/, /(^|\s)w praktyce(\s|\?|$)/, /(^|\s)(a|co) jeszcze(\s|\?|$)/, /(^|\s)a co z(\s|\?|$)/,
  /(^|\s)rozwin(\s|\?|$)/, /(^|\s)a jak (mam|bede|jestem)(\s|\?|$)/, /(^|\s)to znaczy(\s|\?|$)/, /(^|\s)nie rozumiem(\s|\?|$)/, /(^|\s)o co chodzi(\s|\?|$)/,
  /(^|\s)powiedz (wiecej|cos wiecej)(\s|\?|$)/, /(^|\s)mozesz (to )?(wyjasnic|rozwinac|uproscic|powtorzyc)(\s|\?|$)/, /(^|\s)co to znaczy(\s|\?|$)/, /(^|\s)a po co(\s|\?|$)/,
];
/** dopytanie = pasuje do wzorca I jest świeża rozmowa z choć jedną turą z odpowiedzią (inaczej nie ma do czego sięgać) */
export function czyDopytanie(tekstZnormalizowany, rozmowa) {
  const t = String(tekstZnormalizowany || "").trim();
  if (!t || t.length > 120) return false;
  if (!Array.isArray(rozmowa) || !rozmowa.some((r) => r && r.odpowiedz)) return false;
  return RE_DOPYTANIE.some((r) => r.test(t));
}

export const CHARAKTER = [
  "Jesteś Okienkiem — asystentem trenera w aplikacji BiegaMy. Mówisz do biegacza na „Ty”, ciepło i konkretnie, jak trener, który go zna.",
  "Odpowiadasz 2–4 krótkimi zdaniami po polsku, bez emoji, bez list, bez nagłówków, bez wykrzykników.",
  "Nie mówisz o sobie „jako AI”, „jako model”, „jako asystent”. Nie przepraszasz bez powodu.",
  "Odpowiadasz na DOPYTANIE do poprzedniej rozmowy: tłumaczysz, uzasadniasz, odnosisz do tego, co już padło. Używasz liczb WYŁĄCZNIE z poprzednich odpowiedzi — nie liczysz nic nowego i nie wymyślasz dat, kilometrów ani temp.",
  "Jeśli czegoś nie wiesz z rozmowy, mówisz to wprost i podpowiadasz, o co zapytać Okienko (np. „zapytaj: plan na ten tydzień”).",
  "Nie udzielasz porad medycznych: choroba, uraz, ból → jedno zdanie, że to sprawa dla lekarza lub fizjoterapeuty.",
  "Zakazane zwroty-wytrychy: „słuchaj swojego ciała”, „każdy organizm jest inny”, „to zależy od wielu czynników”, „skonsultuj się ze specjalistą”, „warto pamiętać”.",
  "Zwracasz wyłącznie JSON {\"zdania\": string[]}.",
].join("\n");
export function promptRozmowy(dzis, fakty = []) {
  const f = (Array.isArray(fakty) ? fakty : []).filter((x) => typeof x === "string" && x.trim()).slice(0, 8);
  return CHARAKTER + `\nDziś jest ${dzis}.` + (f.length ? "\nCo wiesz o tym biegaczu (zapamiętane za jego zgodą): " + f.map((x) => "„" + x + "”").join("; ") + "." : "");
}
const SCHEMAT = { type: "object", properties: { zdania: { type: "array", items: { type: "string" } } }, required: ["zdania"] };

/** @param {{fetchFn:Function, klucz:string, tekst:string, dzis:string, rozmowa:Array<{pytanie?:string, odpowiedz?:string}>, fakty?:string[], generujJsonFn?:Function}} o
    @returns {Promise<null | {zdania:string[], tok:{we:number,wy:number}, odrzucone:any[], ponowiono:boolean, ogolnik:boolean}>} */
export async function odpowiedzRozmowy({ fetchFn, klucz, tekst, dzis, rozmowa, fakty = [], generujJsonFn = null }) {
  const gen = generujJsonFn || generujJson;
  const wymiany = (Array.isArray(rozmowa) ? rozmowa : []).filter((r) => r && (r.pytanie || r.odpowiedz)).slice(0, MAX_WYMIAN).slice().reverse();   // najstarsza → najnowsza
  const contents = [];
  for (const w of wymiany) {
    if (w.pytanie) contents.push({ role: "user", parts: [{ text: String(w.pytanie).slice(0, 300) }] });
    if (w.odpowiedz) contents.push({ role: "model", parts: [{ text: JSON.stringify({ zdania: [String(w.odpowiedz).slice(0, 400)] }) }] });
  }
  const dozwolone = [...wymiany.map((w) => w.odpowiedz || ""), ...wymiany.map((w) => w.pytanie || ""), ...(fakty || [])];
  const jedno = async (ponow) => {
    const c = contents.concat([{ role: "user", parts: [{ text: String(tekst).slice(0, 300) + (ponow ? "\n(Poprzednia odpowiedź była ogólnikiem. Odnieś się do konkretów z rozmowy: liczby, które już padły, albo kroki 1, 2, 3.)" : "") }] }]);
    const w = await gen({ fetchFn, klucz, system: promptRozmowy(dzis, fakty), contents: c, schema: SCHEMAT, maxOutputTokens: MAX_TOK_ROZMOWY, temperature: 0.3, timeoutMs: TIMEOUT_ROZMOWY_MS });
    const zd = (Array.isArray(w.json && w.json.zdania) ? w.json.zdania : []).filter((z) => typeof z === "string" && z.trim()).map((z) => z.trim()).slice(0, 4);
    const s = sprawdz(zd, 0, dozwolone);   // liczby tylko z rozmowy
    return { zdania: s.puste ? [] : s.zdania, odrzucone: s.odrzucone, tok: w.tok };
  };
  let w;
  try { w = await jedno(false); } catch { return null; }
  const tok = { we: w.tok.we, wy: w.tok.wy };
  let zdania = w.zdania, odrzucone = w.odrzucone, ponowiono = false, ogolnik = false;
  if (zdania.length && czyOgolnik(zdania)) {
    ponowiono = true;
    try { const w2 = await jedno(true); tok.we += w2.tok.we; tok.wy += w2.tok.wy; if (w2.zdania.length) { zdania = w2.zdania; odrzucone = odrzucone.concat(w2.odrzucone); } } catch { /* zostaje pierwsza */ }
    if (czyOgolnik(zdania)) { ogolnik = true; zdania = bezOgolnikow(zdania).slice(0, 2); }
  }
  if (!zdania.length) return null;
  if (OGOLNIKI.some((r) => r.test(zdania.join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").toLowerCase()))) { zdania = bezOgolnikow(zdania); ogolnik = true; }
  return { zdania, tok, odrzucone, ponowiono, ogolnik };
}

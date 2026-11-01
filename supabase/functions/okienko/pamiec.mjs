// OKIENKO (M2d, 1.11.2026) — prywatność trybu sieci, pamięć odpowiedzi z sieci, znaleziska.
//
// PRYWATNOŚĆ (decyzja Filipa 1.11, po wpisach z imionami i nazwiskami w okienko_log):
//   * wygladaNaOsobe(): pytanie, które jest samym imieniem i nazwiskiem, NIE idzie zwykłą ścieżką do sieci (nazwisko
//     prywatnej osoby nie wychodzi do Google z naszej aplikacji). Od M2b (1.11.2026) obsługuje je osoba.mjs, tryb
//     'osoba': profile publiczne + wyniki F6, sieć tylko dla osoby publicznej sportowo albo pytania wprost;
//     ODP_OSOBA zostaje tylko jako stała (nieużywana w EF);
//   * cache tylko dla pytań, przy których detektor nie zadziałał (odpowiedź o osobie nie trafia do wspólnej pamięci);
//   * znaleziska BEZ tekstu pytania — tylko nazwa biegu i rok wyciągnięte z pytania; pytanie o osobę nie trafia wcale.
// Zapisy: WYŁĄCZNIE okienko_siec_cache i okienko_znaleziska (klient service_role; przeglądarka nie ma do nich prawa
// zapisu — migracja 20261101_okienko_pamiec.sql). blizna-69 pilnuje, że nigdzie indziej.
import { czyDomenaWynikow } from "../_shared/zrodla-wynikow.mjs";

export const TTL_GODZ = 24;
export const ODP_OSOBA = "Wyniki osób znajdę w wyszukiwarce wyników.";

const PYTAJNE = /^(kto|co|czy|gdzie|kiedy|jak|jaki|jaka|jakie|ile|ktory|ktora|ktore|który|która|które|dlaczego|po|pokaz|pokaż|otworz|otwórz)$/i;
const BIEGOWE = /(maraton|bieg|trasa|zapis|wynik|parkrun|ultra|trail|run|km|zawod|start|medal|polmaraton|półmaraton|rekord|kalendarz|pogod)/i;
const SLOWO_IMIENIA = /^[\p{Lu}][\p{Ll}]+(?:-[\p{Lu}][\p{Ll}]+)?$/u;
const SLOWO_MALE = /^[\p{Ll}]+(?:-[\p{Ll}]+)?$/u;

/** „Jan Kowalski", „Anna Nowak-Kowalska", „Jan Maria Rokita" → true; także pisane małymi („filip janczak") — w logu z 1.11
    tak właśnie przyszły — o ile żadne słowo nie jest biegowe ani pytające. „Kto wygrał maraton" / „trasa Poznań" → false. */
export function wygladaNaOsobe(tekst) {
  const slowa = String(tekst || "").replace(/[\\?!.,;:"'„”()]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (slowa.length < 2 || slowa.length > 3) return false;
  if (slowa.some((s) => PYTAJNE.test(s) || BIEGOWE.test(s) || /\d/.test(s))) return false;
  return slowa.every((s) => SLOWO_IMIENIA.test(s)) || slowa.every((s) => SLOWO_MALE.test(s));
}

/** Odpowiedź z pamięci (≤ TTL) albo null. Klucz = pytanie znormalizowane (router.normalizuj). */
export async function zPamieci(adm, klucz, teraz = new Date()) {
  if (!klucz) return null;
  const od = new Date(teraz.getTime() - TTL_GODZ * 3600000).toISOString();
  const { data, error } = await adm.from("okienko_siec_cache").select("zdania,zrodla,model,utworzono").eq("klucz", klucz).gte("utworzono", od).maybeSingle();
  if (error || !data) return null;
  return { zdania: data.zdania || [], zrodla: Array.isArray(data.zrodla) ? data.zrodla : [] };
}

export async function doPamieci(adm, klucz, zdania, zrodla, model, teraz = new Date()) {
  if (!klucz || !zrodla.length) return false;
  const { error } = await adm.from("okienko_siec_cache").upsert({ klucz: klucz.slice(0, 300), zdania, zrodla, model, utworzono: teraz.toISOString() }, { onConflict: "klucz" });
  return !error;
}

const RE_BIEG = /((?:p[oó]ł)?maraton\w*|bieg\w*|parkrun\w*|ultra\w*|trail\w*)((?:\s+(?:[\p{Lu}][\p{L}-]+|\d{1,3}\.?(?!\d)|im\.|w|we))*)/iu;   // numer edycji ≤ 3 cyfr; rok idzie osobno
/** Nazwa biegu i rok wyciągnięte z pytania — NIGDY cały tekst pytania (M2d). */
export function nazwaIRok(tekst) {
  const t = String(tekst || "");
  const rokM = t.match(/\b(19[9]\d|20\d\d)\b/);
  const m = t.match(RE_BIEG);
  let nazwa = m ? (m[1] + m[2]).replace(/\s+(w|we)$/i, "").trim() : null;
  if (nazwa) nazwa = nazwa.charAt(0).toUpperCase() + nazwa.slice(1);
  return { nazwa_biegu: nazwa ? nazwa.slice(0, 200) : null, rok: rokM ? Number(rokM[1]) : null };
}

/** Które źródła odpowiedzi z sieci zapisać jako znaleziska. Domena = tytuł źródła (groundingChunks.web.title — w Gemini
    to domena; uri to przekierowanie vertexaisearch). Warunek: domena z ZRODLA_WYNIKOW albo pytanie o wyniki/bieg z rokiem/datą. */
export function znaleziskaZ(tekst, zrodla) {
  if (wygladaNaOsobe(tekst)) return [];
  const { nazwa_biegu, rok } = nazwaIRok(tekst);
  const oBiegZData = /(wynik|maraton|p[oó]łmaraton|bieg|zawod)/i.test(tekst) && (rok != null || /\b\d{1,2}[.\-/]\d{1,2}\b/.test(tekst));
  return (zrodla || []).filter((z) => z && /^https:\/\//.test(z.url || "")).map((z) => ({ url: z.url, domena: String(z.tytul || "").toLowerCase().slice(0, 200) }))
    .filter((z) => czyDomenaWynikow(z.domena) || oBiegZData)
    .map((z) => ({ ...z, nazwa_biegu, rok, pytanie: [nazwa_biegu, rok].filter((x) => x != null).join(" ") || "(bez nazwy biegu)" }));
}

export async function zapiszZnaleziska(adm, athleteId, wpisy) {
  if (!wpisy.length) return 0;
  const { error } = await adm.from("okienko_znaleziska").upsert(wpisy.map((w) => ({ ...w, athlete_id: athleteId })), { onConflict: "url", ignoreDuplicates: true });
  return error ? 0 : wpisy.length;
}

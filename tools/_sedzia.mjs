// SĘDZIA OKIENKA: drugi model OCENIA odpowiedź (niczego nie zmienia). Wspólny dla raportu nocnego, porównania dostawców i wzorców.
//   Przełącznik (Filip 3.11, pkt 5): SEDZIA=claude|gemini w okienko-noc.yml; domyślnie gemini. Claude działa tylko do SEDZIA_CLAUDE_DO (kredyty ~10 dni)
//   i tylko z kluczem; potem narzędzie samo wraca do gemini, a raport to mówi.
//   Wzorce (pkt 3): docs/okienko-wzorce.md; sędzia porównuje tylko z wpisami zatwierdzonymi przez Filipa (status OK).
// Do modelu idzie wyłącznie pytanie, ścieżka i odpowiedź po anonimizacji; wołający odpowiada za anonimizację (raport: anonimizuj + czysty).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { zapytaj, schematClaude, MODELE } from "./_claude.mjs";

const KORZEN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PLIK_WZORCOW = path.join(KORZEN, "docs", "okienko-wzorce.md");
export const CENA_FLASH = { we: 0.50, wy: 3.00 };   // USD / 1 M tokenów, zestawienia 10.2026; przelicznik, nie faktura
export const MODEL_SEDZIEGO_CLAUDE = MODELE.opus;

export const SCHEMAT_SEDZIEGO = { type: "object", properties: { odpowiada: { type: "integer" }, konkret: { type: "integer" }, liczby_z_pokryciem: { type: "integer" }, wyciek: { type: "integer" }, ton: { type: "integer" }, uzasadnienie: { type: "string" } }, required: ["odpowiada", "konkret", "liczby_z_pokryciem", "wyciek", "ton", "uzasadnienie"] };
const SCHEMAT_ZE_WZORCEM = { type: "object", properties: { ...SCHEMAT_SEDZIEGO.properties, zgodny_ze_wzorcem: { type: "integer" } }, required: [...SCHEMAT_SEDZIEGO.required, "zgodny_ze_wzorcem"] };
export const PROMPT_SEDZIEGO = "Jesteś sędzią jakości odpowiedzi asystenta biegowego BiegaMy. Dostajesz pytanie biegacza, ścieżkę (jak odpowiedź powstała) i odpowiedź. Oceń 0/1: odpowiada (czy odpowiada na to pytanie), konkret (liczby, kroki, nazwy zamiast ogólników), liczby_z_pokryciem (każda liczba ma oparcie w ścieżce: narzędzie lub źródło; brak liczb = 1), wyciek (1 = odpowiedź ujawnia dane innej prywatnej osoby, np. imię i nazwisko, e-mail, adres; 0 = nie), ton (ciepło, konkretnie, bez „jako AI” i bez „słuchaj swojego ciała”). [OSOBA], [e-mail] i [telefon] to znaczniki anonimizacji, bywają nadgorliwe: same w sobie nie są wyciekiem ani błędem odpowiedzi. Uzasadnienie: jedno zdanie po polsku. Odpowiadasz wyłącznie JSON.";
const DOPISEK_WZORCA = " Dostajesz też ODPOWIEDŹ WZORCOWĄ zatwierdzoną przez trenera. zgodny_ze_wzorcem: 1 = odpowiedź nie przeczy wzorcowi w liczbach ani zaleceniach i zawiera jego sedno; 0 = przeczy mu albo pomija sedno. Inne słowa ani inna kolejność nie są błędem.";

export function wybierzSedziego({ sedzia, dzis, claudeDo, kluczClaude, kluczGemini }) {
  const gemini = kluczGemini ? "gemini" : null;
  if (sedzia !== "claude") return { dostawca: gemini, uwaga: null };
  if (!claudeDo) return { dostawca: gemini, uwaga: "SEDZIA=claude bez SEDZIA_CLAUDE_DO: sędzia gemini" };
  if (dzis > claudeDo) return { dostawca: gemini, uwaga: `kredyty Anthropic do ${claudeDo} minęły: sędzia gemini` };
  if (!kluczClaude) return { dostawca: gemini, uwaga: "brak sekretu ANTHROPIC_API_KEY: sędzia gemini" };
  return { dostawca: "claude", uwaga: null };
}

export function trescDlaSedziego(w, wzorzec) {
  return `PYTANIE: ${w.pytanie}\nŚCIEŻKA: ${w.sciezka}\nODPOWIEDŹ: ${w.odpowiedz || "(brak zdań)"}` + (wzorzec ? `\nODPOWIEDŹ WZORCOWA: ${wzorzec.wzorzec}` : "");
}

/** → { ocena, tok, usd, dostawca }; rzuca przy błędzie (wołający decyduje o zapasowym dostawcy) */
export async function ocenOdpowiedz({ dostawca, w, wzorzec = null, klient, plik, fetchFn = fetch, klucz, narzedzie = "sedzia", opcjeZadania }) {
  const schema = wzorzec ? SCHEMAT_ZE_WZORCEM : SCHEMAT_SEDZIEGO, system = PROMPT_SEDZIEGO + (wzorzec ? DOPISEK_WZORCA : ""), tresc = trescDlaSedziego(w, wzorzec);
  if (dostawca === "claude") {
    const r = await zapytaj({ narzedzie, model: MODEL_SEDZIEGO_CLAUDE, system, messages: [{ role: "user", content: tresc }], schema: schematClaude(schema), maxTokens: 3000, effort: "low", klient, plik, opcjeZadania });
    return { ocena: r.json, tok: { we: r.usage?.input_tokens || 0, wy: r.usage?.output_tokens || 0 }, usd: r.usd, dostawca };
  }
  const { generujJson } = await import(pathToFileURL(path.join(KORZEN, "supabase/functions/okienko-v2/gemini.mjs")).href);
  const r = await generujJson({ fetchFn, klucz, system, contents: [{ role: "user", parts: [{ text: tresc }] }], schema, maxOutputTokens: 240, temperature: 0, timeoutMs: 15000, model: "gemini-3.5-flash" });
  return { ocena: r.json, tok: r.tok, usd: (r.tok.we * CENA_FLASH.we + r.tok.wy * CENA_FLASH.wy) / 1e6, dostawca };
}

/* ── WZORCE: format docs/okienko-wzorce.md ── */
const SLOWA_PUSTE = new Set(["a", "i", "o", "w", "z", "u", "na", "do", "po", "od", "za", "ze", "we", "co", "czy", "jak", "ile", "jaki", "jaka", "jakie", "kiedy", "gdzie", "sie", "to", "mam", "mi", "mnie", "moge", "jest", "sa", "dla", "przy", "przed", "bo", "ale", "tak", "nie", "albo", "lub", "powinienem", "powinnam", "trzeba", "warto", "najlepiej"]);
export function tokeny(s) {
  return new Set(String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase().split(/[^a-z0-9]+/).filter((x) => x && !SLOWA_PUSTE.has(x)).map((x) => x.slice(0, 5)));
}
export function podobienstwo(a, b) {
  const A = tokeny(a), B = tokeny(b);
  if (!A.size || !B.size) return 0;
  let wspolne = 0; for (const x of A) if (B.has(x)) wspolne++;
  return wspolne / (A.size + B.size - wspolne);
}

const RE_WPIS = /^## (w\d{3,4}) · (\w+) · waga (\d) · (DO-OK|OK|ODRZUCONY)\n\*\*Pytanie:\*\* (.*)\n\*\*Wzorzec:\*\* (.*)\n\*\*Źródła:\*\* (.*)$/gm;
export function wczytajWzorce(tekst) {
  return [...String(tekst || "").replace(/\r/g, "").matchAll(RE_WPIS)].map((m) => ({ id: m[1], intencja: m[2], waga: Number(m[3]), status: m[4], pytanie: m[5].trim(), wzorzec: m[6].trim(), zrodla: m[7].trim() === "—" ? [] : m[7].split(" · ").map((x) => x.trim()) }));
}
export function wzorceZatwierdzone(plik = PLIK_WZORCOW) {
  try { return wczytajWzorce(fs.readFileSync(plik, "utf8")).filter((w) => w.status === "OK"); } catch { return []; }
}
/** najbliższy zatwierdzony wzorzec albo null; próg wysoki, bo zły wzorzec daje fałszywe 0 w ocenie */
export function znajdzWzorzec(pytanie, wzorce, prog = 0.6) {
  let naj = null, wynik = 0;
  for (const w of wzorce || []) { if (w.status !== "OK") continue; const s = podobienstwo(pytanie, w.pytanie); if (s > wynik) { wynik = s; naj = w; } }
  return wynik >= prog ? naj : null;
}

// CLAUDE — wspólny moduł narzędzi treningu Okienka (Filip 3.11: kredyty Anthropic 100 USD, ~10 dni). Uruchamiany z Deno
// (oficjalne SDK przez `npm:` — bez node_modules i bez npm w repo, jak reszta projektu); czyste funkcje (ceny, budżet) działają też w Node (testy).
//
// ZASADY (Filip):
//   * klucz WYŁĄCZNIE z env ANTHROPIC_API_KEY — nigdy w repo, w logu ani w argumencie; moduł go nie czyta ani nie drukuje (SDK bierze go sam);
//   * do API idą WYŁĄCZNIE treści syntetyczne albo zanonimizowane — zero danych zawodników (pilnuje wołający; tu: brak dostępu do bazy);
//   * BUDŻET pilnowany tutaj: każde wywołanie dopisuje koszt do dziennika POZA repo (~/.cache/biegamy/claude-budzet.jsonl: kiedy, narzędzie,
//     model, tokeny, USD — bez treści); przed wywołaniem: wydane + najgorszy możliwy koszt tego wywołania > STOP_USD (90) → odmowa.
//
// Model domyślny: claude-opus-5-5 (myślenie zawsze włączone, effort sterowany); tani: claude-haiku-5-5. Opus/Sonnet idą z fallbacks "default"
// (beta server-side-fallback-2026-07-01): przy odmowie klasyfikatora API samo ponawia na innym modelu w tym samym wywołaniu.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const SDK = "npm:@anthropic-ai/sdk@1.4.0";
export const STOP_USD = 90;
export const MODELE = { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" };
/* USD za 1 mln tokenów (cennik Anthropic 10.2026): we, wy, zapis cache (1,25 × we), odczyt cache */
export const CENY = {
  "claude-opus-5-5": { we: 4, wy: 20, cw: 5, cr: 0.2 },
  "claude-opus-5": { we: 5, wy: 25, cw: 6.25, cr: 0.5 },
  "claude-opus-4-8": { we: 5, wy: 25, cw: 6.25, cr: 0.5 },   // tu trafia fallback "default" (próba na żywo 3.11)
  "claude-sonnet-5-5": { we: 2, wy: 10, cw: 2.5, cr: 0.2 },
  "claude-haiku-5-5": { we: 0.1, wy: 0.5, cw: 0.125, cr: 0.01 },
};
const NAJDROZSZY = { we: 10, wy: 50, cw: 12.5, cr: 1 };   // model spoza cennika: stawki Fable; zawyżenie jest bezpieczniejsze od niedoszacowania
export const CENA_WYSZUKANIA_USD = 0.01;   // web search Anthropic: 10 USD / 1000 wyszukań (opłata ponad tokeny)

export function plikBudzetu() {
  return process.env.CLAUDE_BUDZET_PLIK || path.join(os.homedir(), ".cache", "biegamy", "claude-budzet.jsonl");
}

export function wpisy(plik = plikBudzetu()) {
  try { return fs.readFileSync(plik, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

export function wydano(plik = plikBudzetu()) {
  return wpisy(plik).reduce((s, w) => s + (Number(w.usd) || 0), 0);
}

/** koszt z `usage` odpowiedzi; model spoza cennika liczony po najwyższych stawkach */
export function kosztUsd(model, usage) {
  const c = CENY[model] || NAJDROZSZY, u = usage || {};
  return ((u.input_tokens || 0) * c.we + (u.output_tokens || 0) * c.wy + (u.cache_creation_input_tokens || 0) * c.cw + (u.cache_read_input_tokens || 0) * c.cr) / 1e6
    + ((u.server_tool_use && u.server_tool_use.web_search_requests) || 0) * CENA_WYSZUKANIA_USD;
}

/** koszt całego wywołania z fallbackiem: górne `usage` obejmuje tylko próbę, która zwróciła odpowiedź, a `usage.iterations` wszystkie.
    Próba odrzucona (`message`) po stawkach modelu żądanego, próba ratująca (`fallback_message`) po stawkach modelu z odpowiedzi; odrzucenie sprzed wyjścia może być darmowe, więc raczej zawyżamy. */
export function kosztWywolania(modelZadany, modelOdpowiedzi, usage) {
  const gorne = Math.max(kosztUsd(modelZadany, usage), kosztUsd(modelOdpowiedzi, usage));
  const it = usage && usage.iterations;
  if (!Array.isArray(it) || !it.length) return gorne;
  const suma = it.reduce((s, x) => s + kosztUsd(x.model || (x.type === "fallback_message" ? modelOdpowiedzi : modelZadany), { ...x, server_tool_use: undefined }), 0)
    + ((usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0) * CENA_WYSZUKANIA_USD;
  return Math.max(gorne, suma);
}

/** najgorszy koszt wywołania: całe wejście bez cache (≈ 1 token na 3 znaki) + pełne max_tokens wyjścia */
export function szacunekMax(model, znakiWejscia, maxTokens, maxWyszukan = 0) {
  const c = CENY[model] || NAJDROZSZY;
  return (Math.ceil(znakiWejscia / 3) * c.we + maxTokens * c.wy) / 1e6 + maxWyszukan * CENA_WYSZUKANIA_USD;
}

export function podsumowanie(plik = plikBudzetu()) {
  const p = {};
  for (const w of wpisy(plik)) {
    const k = w.narzedzie || "?";
    p[k] = p[k] || { wywolan: 0, usd: 0 };
    p[k].wywolan++; p[k].usd += Number(w.usd) || 0;
  }
  return { razem: wydano(plik), stop: STOP_USD, narzedzia: p };
}

export class StopBudzetu extends Error {}
export class OdmowaModelu extends Error {}

let _klient = null;
async function klientDomyslny() {
  if (_klient) return _klient;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("brak ANTHROPIC_API_KEY w env (klucz tylko z env — nigdy w repo ani w argumencie)");
  const { default: Anthropic } = await import(SDK);
  _klient = new Anthropic();
  return _klient;
}

/**
 * Jedno wywołanie Messages API z budżetem.
 * @param {{narzedzie:string, model?:string, system:string, messages:any[], schema?:object, maxTokens?:number, effort?:string,
 *          bezMyslenia?:boolean, klient?:any, plik?:string}} o
 * schema → odpowiedź JSON wg schematu (output_config.format), zwracana jako `json`; bez schema → `tekst`.
 * bezMyslenia: tylko Haiku 5.5 (thinking disabled dopuszczalne przy effort ≤ high) — klasyfikator i porównanie czasu.
 */
export async function zapytaj(o) {
  const model = o.model || MODELE.opus, maxTokens = o.maxTokens || 16000, plik = o.plik || plikBudzetu();
  const znaki = String(o.system || "").length + JSON.stringify(o.messages || []).length + (o.schema ? JSON.stringify(o.schema).length : 0);
  const maxWysz = (o.tools || []).reduce((s, t) => s + (/^web_search/.test(t.type || "") ? (t.max_uses || 5) : 0), 0);
  const juz = wydano(plik), max = szacunekMax(model, znaki * (maxWysz ? 4 : 1), maxTokens, maxWysz);   // wyniki wyszukiwania wracają jako wejście
  if (juz + max > STOP_USD) throw new StopBudzetu(`STOP budżetu: wydano ${juz.toFixed(2)} USD, to wywołanie może kosztować do ${max.toFixed(2)} USD, próg ${STOP_USD} USD`);

  const klient = o.klient || await klientDomyslny();
  const zFallbackiem = model !== MODELE.haiku;
  const params = {
    model, max_tokens: maxTokens, system: o.system, messages: o.messages,
    output_config: { ...(o.effort ? { effort: o.effort } : {}), ...(o.schema ? { format: { type: "json_schema", schema: o.schema } } : {}) },
    ...(o.bezMyslenia && model === MODELE.haiku ? { thinking: { type: "disabled" } } : {}),
    ...(o.tools ? { tools: o.tools } : {}),
    ...(zFallbackiem ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
  };
  if (!Object.keys(params.output_config).length) delete params.output_config;
  const t0 = Date.now();
  const r = zFallbackiem ? await klient.beta.messages.create(params, o.opcjeZadania) : await klient.messages.create(params, o.opcjeZadania);   // opcjeZadania: { maxRetries, timeout } SDK
  const ms = Date.now() - t0;
  const usd = kosztWywolania(model, r.model || model, r.usage);
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  fs.appendFileSync(plik, JSON.stringify({ kiedy: new Date().toISOString(), narzedzie: o.narzedzie || "?", model: r.model || model,
    we: r.usage?.input_tokens || 0, wy: r.usage?.output_tokens || 0, cw: r.usage?.cache_creation_input_tokens || 0, cr: r.usage?.cache_read_input_tokens || 0,
    wysz: r.usage?.server_tool_use?.web_search_requests || 0, usd: Math.round(usd * 1e6) / 1e6, ms }) + "\n");
  if (r.stop_reason === "refusal") throw new OdmowaModelu("odmowa modelu: " + (r.stop_details?.category || "?"));
  const tekst = (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let json = null;
  if (o.schema) {
    if (r.stop_reason === "max_tokens") throw new Error("odpowiedź ucięta (max_tokens) — zwiększ maxTokens albo zmniejsz partię");
    json = JSON.parse(tekst);
  }
  return { tekst, json, usd, ms, model: r.model || model, usage: r.usage, stop_reason: r.stop_reason, content: r.content || [] };
}

/** schemat w stylu Gemini → structured outputs Claude: każdy obiekt musi mieć additionalProperties: false */
export function schematClaude(s) {
  if (Array.isArray(s)) return s.map(schematClaude);
  if (!s || typeof s !== "object") return s;
  const o = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, schematClaude(v)]));
  if (o.type === "object") o.additionalProperties = false;
  return o;
}

/** wywołanie z wyszukiwarką Anthropic: pause_turn dokańczane (≤ 3 razy) z tą samą treścią; suma kosztu i czasu. Bez `schema`: cytowania sieci nie łączą się pewnie z formatem JSON. */
export async function zapytajZWyszukiwaniem(o) {
  let messages = o.messages, usd = 0, ms = 0, zapytania = 0, we = 0, wy = 0, r;
  for (let i = 0; i < 4; i++) {
    r = await zapytaj({ ...o, messages });
    usd += r.usd; ms += r.ms;
    zapytania += r.usage?.server_tool_use?.web_search_requests || 0;
    we += (r.usage?.input_tokens || 0) + (r.usage?.cache_read_input_tokens || 0) + (r.usage?.cache_creation_input_tokens || 0); wy += r.usage?.output_tokens || 0;
    if (r.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: r.content }];
  }
  return { ...r, usd, ms, zapytania, tok: { we, wy } };
}

/** końcowy tekst modelu (bloki PO ostatnim wyniku wyszukiwania; „sprawdzę w sieci” sprzed narzędzia odpada) + cytowane źródła z zakresami w bajtach UTF-8 */
export function tekstZCytowaniami(content) {
  const bloki = content || [];
  let od = 0;
  bloki.forEach((b, i) => { if (b.type === "web_search_tool_result") od = i + 1; });
  const enk = new TextEncoder(), czesci = [], zrodla = [], bylo = new Set(), zakresy = [];
  let bajty = 0;
  for (const b of bloki.slice(od)) {
    if (b.type !== "text") continue;
    const dl = enk.encode(b.text).length;
    for (const c of b.citations || []) {
      if (!c.url) continue;
      if (!bylo.has(c.url)) { bylo.add(c.url); zrodla.push({ url: c.url, tytul: String(c.title || "").slice(0, 120) }); }
      zakresy.push({ od: bajty, do: bajty + dl, tekst: b.text });
    }
    czesci.push(b.text); bajty += dl;
  }
  return { tekst: czesci.join(""), zrodla, zakresy };
}

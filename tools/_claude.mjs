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
  "claude-sonnet-5-5": { we: 2, wy: 10, cw: 2.5, cr: 0.2 },
  "claude-haiku-5-5": { we: 0.1, wy: 0.5, cw: 0.125, cr: 0.01 },
};
const NAJDROZSZY = CENY["claude-opus-5-5"];

export function plikBudzetu() {
  return process.env.CLAUDE_BUDZET_PLIK || path.join(os.homedir(), ".cache", "biegamy", "claude-budzet.jsonl");
}

export function wpisy(plik = plikBudzetu()) {
  try { return fs.readFileSync(plik, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

export function wydano(plik = plikBudzetu()) {
  return wpisy(plik).reduce((s, w) => s + (Number(w.usd) || 0), 0);
}

/** koszt z `usage` odpowiedzi; model spoza cennika (np. fallback) liczony po stawkach Opusa — zawyżenie jest bezpieczniejsze od niedoszacowania */
export function kosztUsd(model, usage) {
  const c = CENY[model] || NAJDROZSZY, u = usage || {};
  return ((u.input_tokens || 0) * c.we + (u.output_tokens || 0) * c.wy + (u.cache_creation_input_tokens || 0) * c.cw + (u.cache_read_input_tokens || 0) * c.cr) / 1e6;
}

/** najgorszy koszt wywołania: całe wejście bez cache (≈ 1 token na 3 znaki) + pełne max_tokens wyjścia */
export function szacunekMax(model, znakiWejscia, maxTokens) {
  const c = CENY[model] || NAJDROZSZY;
  return (Math.ceil(znakiWejscia / 3) * c.we + maxTokens * c.wy) / 1e6;
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
  const juz = wydano(plik), max = szacunekMax(model, znaki, maxTokens);
  if (juz + max > STOP_USD) throw new StopBudzetu(`STOP budżetu: wydano ${juz.toFixed(2)} USD, to wywołanie może kosztować do ${max.toFixed(2)} USD, próg ${STOP_USD} USD`);

  const klient = o.klient || await klientDomyslny();
  const zFallbackiem = model !== MODELE.haiku;
  const params = {
    model, max_tokens: maxTokens, system: o.system, messages: o.messages,
    output_config: { ...(o.effort ? { effort: o.effort } : {}), ...(o.schema ? { format: { type: "json_schema", schema: o.schema } } : {}) },
    ...(o.bezMyslenia && model === MODELE.haiku ? { thinking: { type: "disabled" } } : {}),
    ...(zFallbackiem ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
  };
  if (!Object.keys(params.output_config).length) delete params.output_config;
  const t0 = Date.now();
  const r = zFallbackiem ? await klient.beta.messages.create(params) : await klient.messages.create(params);
  const ms = Date.now() - t0;
  const usd = Math.max(kosztUsd(model, r.usage), kosztUsd(r.model || model, r.usage));
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  fs.appendFileSync(plik, JSON.stringify({ kiedy: new Date().toISOString(), narzedzie: o.narzedzie || "?", model: r.model || model,
    we: r.usage?.input_tokens || 0, wy: r.usage?.output_tokens || 0, cw: r.usage?.cache_creation_input_tokens || 0, cr: r.usage?.cache_read_input_tokens || 0,
    usd: Math.round(usd * 1e6) / 1e6, ms }) + "\n");
  if (r.stop_reason === "refusal") throw new OdmowaModelu("odmowa modelu: " + (r.stop_details?.category || "?"));
  const tekst = (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let json = null;
  if (o.schema) {
    if (r.stop_reason === "max_tokens") throw new Error("odpowiedź ucięta (max_tokens) — zwiększ maxTokens albo zmniejsz partię");
    json = JSON.parse(tekst);
  }
  return { tekst, json, usd, ms, model: r.model || model, usage: r.usage, stop_reason: r.stop_reason };
}

// OKIENKO 2.0 — jedno niskopoziomowe wywołanie Gemini (generateContent, JSON wg schematu) dla modułów v2 (rozumienie, porada).
// Jedyne miejsce w okienko-v2/ z adresem googleapis (blizna-113). Model i cennik z ../okienko/model.mjs — bez kopii.
// Timeout przez AbortController (klasyfikator ma 1,5 s — projekt §3: p90 < 2 s); fetch wstrzykiwany (ławka: atrapa, 0 $).
import { MODEL } from "../okienko/model.mjs";

export class BladGemini extends Error {}

/** @returns {Promise<{json: any, tok: {we:number, wy:number}}>} — rzuca BladGemini (sieć, http, timeout, zły JSON) */
export async function generujJson({ fetchFn, klucz, system, contents, schema, maxOutputTokens = 128, temperature = 0, timeoutMs = 1500, model = MODEL }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let r;
  try {
    r = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": klucz }, signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents,
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature, maxOutputTokens } }) });
  } catch (e) { throw new BladGemini(e && e.name === "AbortError" ? "timeout" : "sieć"); }
  finally { if (t) clearTimeout(t); }
  if (!r.ok) throw new BladGemini("http " + r.status);
  const j = await r.json().catch(() => null);
  if (!j) throw new BladGemini("zły JSON odpowiedzi");
  const tok = { we: j.usageMetadata?.promptTokenCount || 0, wy: (j.usageMetadata?.candidatesTokenCount || 0) + (j.usageMetadata?.thoughtsTokenCount || 0) };
  const tekst = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  let json;
  try { json = JSON.parse(tekst); } catch { throw new BladGemini("odpowiedź bez JSON wg schematu"); }
  return { json, tok };
}

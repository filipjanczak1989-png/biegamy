// OKIENKO (M2a, 1.11.2026) — tryb „siec": pytanie spoza danych biegacza → OSOBNE wywołanie Gemini z narzędziem
// googleSearch (grounding). Do tego wywołania NIE trafia nic z aplikacji: ani wyniki narzędzi, ani athlete_id, ani
// historia rozmowy (może zawierać odpowiedzi z danymi) — wyłącznie tekst pytania i data (blizna-66).
// ZWIAD M2a: googleSearch + functionDeclarations w jednym żądaniu → 400 (wymaga include_server_side_tool_invocations),
// więc dwa wywołania; odpowiedź zwykłym tekstem (groundingSupports odnoszą się do tego tekstu).
// Strażnik cyfr w trybie sieci: zdanie z cyfrą zostaje tylko, gdy groundingSupports obejmuje jego treść.
// Źródła: groundingChunks[].web {uri,title} — tylko https (uri to przekierowanie vertexaisearch, https), max 5.
export const NIE_ZNALAZLEM = "Tego nie znalazłem w sieci.";
export const MAX_ZDAN = 3, MAX_ZRODEL = 5;
export const CENA_ZAPYTANIA_USD = 0.014;   // 14 USD / 1000 zapytań wyszukiwania (Gemini 3+), bez darmowej puli

const MODEL = "gemini-3.5-flash-lite";

export function promptSieci(dzis) {
  return [
    `Odpowiadasz biegaczowi z Polski na pytanie o świat biegania na podstawie wyszukiwania w sieci. Dziś jest ${dzis}.`,
    "Piszesz po polsku, najwyżej 3 krótkie zdania, bez emoji, bez wykrzykników, bez formatowania (bez gwiazdek i list).",
    "Użyj Google Search przed odpowiedzią; nie odpowiadaj z pamięci.",
    "Każdy fakt i każda liczba musi pochodzić z wyników wyszukiwania. Jeśli nic nie znalazłeś, nie odpowiadaj nic.",
    "Nie udzielasz porad medycznych ani planów treningowych.",
  ].join("\n");
}

const norm = (s) => String(s || "").replace(/\*\*|__|`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim().toLowerCase();

/** Tekst modelu → zdania (bez markdownu). */
export function naZdania(tekst) {
  const czysty = String(tekst || "").replace(/\*\*|__|`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*[-*•]\s+/gm, "").replace(/\s+/g, " ").trim();
  if (!czysty) return [];
  return (czysty.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || []).map((z) => z.trim()).filter(Boolean);
}

/* Zdania SUROWEGO tekstu modelu z zakresem w BAJTACH UTF-8 — groundingSupports[].segment.startIndex/endIndex liczy
   Gemini w bajtach (zmierzone 1.11 na odpowiedzi z polskimi znakami). Wyświetlamy wersję bez markdownu. */
const ENK = new TextEncoder();
export function zdaniaZZakresem(tekst) {
  const surowy = String(tekst || ""), wynik = [];
  for (const m of surowy.matchAll(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)) {
    const pokaz = m[0].replace(/\*\*|__|`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*[-*•]\s+/gm, "").replace(/\s+/g, " ").trim();
    if (!pokaz) continue;
    const od = ENK.encode(surowy.slice(0, m.index)).length;
    wynik.push({ zdanie: pokaz, od, do: od + ENK.encode(m[0]).length });
  }
  return wynik;
}

/** → {zdania, zrodla, odrzucone} wg zasad M2a (strażnik supports, źródła https, pusto → NIE_ZNALAZLEM). */
export function zOdpowiedziSieci(tekst, gm, czyHttps) {
  const ok = typeof czyHttps === "function" ? czyHttps : (u) => /^https:\/\//i.test(String(u || ""));
  const zrodla = [], bylo = new Set();
  for (const c of (gm && gm.groundingChunks) || []) {
    const u = c && c.web && c.web.uri, t = c && c.web && c.web.title;
    if (!u || !ok(u) || bylo.has(u)) continue;
    bylo.add(u); zrodla.push({ tytul: String(t || new URL(u).hostname).slice(0, 120), url: u });
    if (zrodla.length >= MAX_ZRODEL) break;
  }
  /* Strażnik (poprawka 1.11, decyzja Filipa): zdanie z cyfrą zostaje, gdy JAKIKOLWIEK groundingSupport nakłada się na nie
     zakresem bajtów (startIndex/endIndex), nie po identycznym tekście. Support bez indeksów → dopasowanie po tekście. */
  const supports = ((gm && gm.groundingSupports) || []).map((s) => s && s.segment).filter(Boolean)
    .map((g) => ({ od: Number.isFinite(g.startIndex) ? g.startIndex : (Number.isFinite(g.endIndex) ? 0 : null), do: Number.isFinite(g.endIndex) ? g.endIndex : null, tekst: norm(g.text) }));
  const zdania = [], odrzucone = [];
  for (const z of zdaniaZZakresem(tekst)) {
    if (!/\d/.test(z.zdanie)) { zdania.push(z.zdanie); continue; }
    const n = norm(z.zdanie).replace(/[.!?]+$/, "");
    const pokryte = supports.some((g) => (g.do != null && g.od != null) ? (g.od < z.do && g.do > z.od)
      : (g.tekst && (g.tekst.includes(n) || (n.length > 20 && g.tekst.length > 20 && n.includes(g.tekst)))));
    if (pokryte) zdania.push(z.zdanie);
    else odrzucone.push({ zdanie: z.zdanie.slice(0, 200), powod: "cyfra bez potwierdzenia w groundingSupports" });
  }
  if (!zrodla.length) return { zdania: [NIE_ZNALAZLEM], zrodla: [], odrzucone: odrzucone.concat(zdania.map((z) => ({ zdanie: z.slice(0, 200), powod: "brak źródeł" }))) };
  return { zdania: zdania.length ? zdania.slice(0, MAX_ZDAN) : [NIE_ZNALAZLEM], zrodla: zdania.length ? zrodla : [], odrzucone };
}

/** Wywołanie z googleSearch. Wejście CELOWO wąskie: tekst + data. Brak groundingChunks → JEDNA ponowna próba
    (decyzja Filipa 1.11: nigdy zdań bez źródeł). → {tekst, gm, tok, zapytania, proby} ; rzuca przy błędzie HTTP. */
export async function zapytajSiec({ fetchFn, klucz, tekst, dzis }) {
  const a = await jednoWyszukanie(fetchFn, klucz, tekst, dzis);
  if (((a.gm && a.gm.groundingChunks) || []).length) return { ...a, proby: 1 };
  const b = await jednoWyszukanie(fetchFn, klucz, tekst, dzis);
  return { ...b, tok: { we: a.tok.we + b.tok.we, wy: a.tok.wy + b.tok.wy }, zapytania: a.zapytania + b.zapytania, proby: 2 };
}
async function jednoWyszukanie(fetchFn, klucz, tekst, dzis) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const r = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": klucz },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: promptSieci(dzis) }] },
      contents: [{ role: "user", parts: [{ text: String(tekst).slice(0, 300) }] }],
      tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.2, maxOutputTokens: 300 } }) });
  if (!r.ok) throw new Error("sieć http " + r.status);
  const j = await r.json();
  const kand = j.candidates && j.candidates[0];
  const gm = (kand && kand.groundingMetadata) || {};
  return {
    tekst: ((kand && kand.content && kand.content.parts) || []).map((p) => p.text || "").join(""),
    gm,
    tok: { we: (j.usageMetadata && j.usageMetadata.promptTokenCount) || 0, wy: ((j.usageMetadata && j.usageMetadata.candidatesTokenCount) || 0) + ((j.usageMetadata && j.usageMetadata.thoughtsTokenCount) || 0) },
    zapytania: Array.isArray(gm.webSearchQueries) ? gm.webSearchQueries.length : 0,
  };
}

/** Czy pytanie idzie do sieci: model oznaczył poza_danymi ALBO nie wybrał narzędzia, a tekst nie pyta o „moje/mam/mój…". */
export function czyDoSieci(tekstZnormalizowany, pozaDanymi, uzyteNarzedzia) {
  const oMnie = /\b(moj\w*|mam|mial\w*|mnie|mi|ja|zrobil\w*|przebieg\w*|pobieg\w*|bieglem|biegam|moim|mojej)\b/.test(tekstZnormalizowany);
  /* poza_danymi od modelu WYGRYWA z użytym narzędziem (1.11, żywe API: „Kto wygrał maraton w Berlinie?" → model
     wywołał moje_starty i dopiero potem uznał pytanie za spoza danych). Do sieci i tak nie trafia wynik narzędzia. */
  if (pozaDanymi === true) return true;
  if (uzyteNarzedzia > 0) return false;
  return !oMnie;
}

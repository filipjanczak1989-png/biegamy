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

/* Koniec zdania (Filip 4.11: zdań nie wolno urywać): znak końca, odstęp i początek nowego zdania, czyli wielka litera albo cyfra.
   Nie kończą zdania: kropka w słowie („obozygorskie.pl”, „10.5 km”), liczba porządkowa („między 30. a 45. minutą”, „12. Maraton”), skrót („m.in. Poznań”, „ok. 5 km”), inicjał („J. Kowalski”).
   Pomyłka w tę stronę skleja dwa zdania, co jest bezpieczniejsze niż urwanie. Strażnik cyfr ocenia wtedy całość. */
const SKROTY = new Set(["np", "m.in", "tzw", "tj", "tzn", "ok", "ul", "al", "os", "pl", "św", "im", "nr", "dr", "prof", "mgr", "inż", "ww", "zob", "por", "woj", "gen", "ks", "płk"]);
const SKROTY_PRZED_LICZBA = new Set(["godz", "min", "maks", "max", "pkt", "str", "tel"]);
function zakresyZdan(t) {
  const wynik = [];
  let start = 0;
  for (const m of t.matchAll(/[.!?]+/g)) {
    const poZnaku = m.index + m[0].length, po = t.slice(poZnaku);
    const domkniecie = po.match(/^[”"'’)\]*_`]*/)[0], reszta = po.slice(domkniecie.length);
    if (!reszta.trim() || !/^\s/.test(reszta)) continue;
    const nast = (reszta.match(/^[\s*_`„"“'(\[•–—-]*(.)/su) || [])[1] || "";
    if (/^\.+$/.test(m[0])) {
      if (/^\p{Ll}$/u.test(nast)) continue;
      const slowo = (t.slice(start, m.index).match(/[^\s(„"“'*_`]+$/) || [""])[0], maly = slowo.toLowerCase();
      if (m[0] === "." && (/^\d{1,3}$/.test(slowo) || /^\p{Lu}$/u.test(slowo) || SKROTY.has(maly) || (SKROTY_PRZED_LICZBA.has(maly) && /^\d$/.test(nast)))) continue;
    }
    const koniec = poZnaku + domkniecie.length;
    wynik.push({ od: start, do: koniec, zamkniete: true });
    start = koniec;
  }
  const ogon = t.slice(start);
  if (ogon.trim()) wynik.push({ od: start, do: t.length, zamkniete: /[.!?][”"'’)\]*_`]*\s*$/.test(ogon) });
  return wynik;
}
/** Tekst modelu → zdania (bez markdownu). */
export function naZdania(tekst) {
  const czysty = String(tekst || "").replace(/\*\*|__|`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*[-*•]\s+/gm, "").replace(/\s+/g, " ").trim();
  if (!czysty) return [];
  return zakresyZdan(czysty).map((z) => czysty.slice(z.od, z.do).trim()).filter(Boolean);
}

/* Zdania SUROWEGO tekstu modelu z zakresem w BAJTACH UTF-8 — groundingSupports[].segment.startIndex/endIndex liczy
   Gemini w bajtach (zmierzone 1.11 na odpowiedzi z polskimi znakami). Wyświetlamy wersję bez markdownu. */
const ENK = new TextEncoder();
export function zdaniaZZakresem(tekst) {
  const surowy = String(tekst || ""), wynik = [];
  for (const z of zakresyZdan(surowy)) {
    const kawalek = surowy.slice(z.od, z.do);
    const pokaz = kawalek.replace(/\*\*|__|`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\s*[-*•]\s+/gm, "").replace(/\s+/g, " ").trim();
    if (!pokaz) continue;
    const od = ENK.encode(surowy.slice(0, z.od)).length;
    wynik.push({ zdanie: pokaz, od, do: od + ENK.encode(kawalek).length, ...(z.zamkniete ? {} : { urwane: true }) });
  }
  return wynik;
}

/** → {zdania, zrodla, odrzucone} wg zasad M2a (strażnik supports, źródła https, pusto → NIE_ZNALAZLEM). */
export function zOdpowiedziSieci(tekst, gm, czyHttps, maxZdan = MAX_ZDAN) {
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
  const zakresy = zdaniaZZakresem(tekst);
  for (const z of zakresy) {
    /* limit tokenów ucina odpowiedź w pół zdania: ogon bez znaku końca odpada, o ile cokolwiek zostaje */
    if (z.urwane && zakresy.length > 1) { odrzucone.push({ zdanie: z.zdanie.slice(0, 200), powod: "urwane: brak znaku końca zdania" }); continue; }
    if (!/\d/.test(z.zdanie)) { zdania.push(z.zdanie); continue; }
    const n = norm(z.zdanie).replace(/[.!?]+$/, "");
    const pokryte = supports.some((g) => (g.do != null && g.od != null) ? (g.od < z.do && g.do > z.od)
      : (g.tekst && (g.tekst.includes(n) || (n.length > 20 && g.tekst.length > 20 && n.includes(g.tekst)))));
    if (pokryte) zdania.push(z.zdanie);
    else odrzucone.push({ zdanie: z.zdanie.slice(0, 200), powod: "cyfra bez potwierdzenia w groundingSupports" });
  }
  if (!zrodla.length) return { zdania: [NIE_ZNALAZLEM], zrodla: [], odrzucone: odrzucone.concat(zdania.map((z) => ({ zdanie: z.slice(0, 200), powod: "brak źródeł" }))) };
  return { zdania: zdania.length ? zdania.slice(0, maxZdan) : [NIE_ZNALAZLEM], zrodla: zdania.length ? zrodla : [], odrzucone };
}

/** Wywołanie z googleSearch. Wejście CELOWO wąskie: tekst + data. Brak groundingChunks → JEDNA ponowna próba
    (decyzja Filipa 1.11: nigdy zdań bez źródeł). → {tekst, gm, tok, zapytania, proby} ; rzuca przy błędzie HTTP. */
/* prompt / maxOutputTokens: opcjonalne (Okienko 2.0 wiedza.mjs — konkret dla porad; v1 woła bez nich = promptSieci + 300, bez zmian) */
/* AWARIA 3.11 (blizna-136): limit czasu na KAŻDE wyszukanie (AbortController) — bez niego wiszący Gemini trzymał EF dłużej niż klient
   czeka (20 s) i nie powstawał żaden wpis logu. Ponowienie (brak źródeł) tylko, gdy zostało ≥ połowy budżetu czasu. */
export const LIMIT_SIECI_MS = 8000;
export async function zapytajSiec({ fetchFn, klucz, tekst, dzis, prompt = null, maxOutputTokens = 300, timeoutMs = LIMIT_SIECI_MS }) {
  const t0 = Date.now();
  const a = await jednoWyszukanie(fetchFn, klucz, tekst, dzis, prompt, maxOutputTokens, timeoutMs);
  if (((a.gm && a.gm.groundingChunks) || []).length) return { ...a, proby: 1 };
  if (Date.now() - t0 > timeoutMs / 2) return { ...a, proby: 1 };
  const b = await jednoWyszukanie(fetchFn, klucz, tekst, dzis, prompt, maxOutputTokens, timeoutMs);
  return { ...b, tok: { we: a.tok.we + b.tok.we, wy: a.tok.wy + b.tok.wy }, zapytania: a.zapytania + b.zapytania, proby: 2 };
}
async function jednoWyszukanie(fetchFn, klucz, tekst, dzis, prompt = null, maxOutputTokens = 300, timeoutMs = LIMIT_SIECI_MS) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let r, j;
  try {
    r = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": klucz }, signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt || promptSieci(dzis) }] },
        contents: [{ role: "user", parts: [{ text: String(tekst).slice(0, 300) }] }],
        tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.2, maxOutputTokens } }) });
    if (!r.ok) throw new Error("sieć http " + r.status);
    j = await r.json();
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("sieć timeout " + timeoutMs + " ms");
    throw e;
  } finally { if (t) clearTimeout(t); }
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

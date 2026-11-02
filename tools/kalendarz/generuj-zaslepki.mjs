// Zaślepki okładek wg typu dla imprez z maszyny wyników (kalendarz startów, decyzja Filipa 2.11: „5 zaślepek według typu
// robisz Gemini"). Ten sam mechanizm co EF race-image: model gemini-nano-banana-2.1, Interactions API, 21:9 w 1K, ta sama
// konwencja promptu (reportaż, 1–2 biegaczy od tyłu, bez tłumu, bez tekstu) — tylko BEZ nazwy i miasta (zaślepka jest wspólna
// dla typu). Lokalnie, nie front: node tools/kalendarz/generuj-zaslepki.mjs <katalog_wyjścia> [typ…]   (GEMINI_API_KEY w env)
// Koszt: ~$0,034 za kadr 1K (docs/okladki-zawodow-spec.md) → 6 kadrów ≈ $0,20 (nordic dołożony 2.11).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const MODEL = "gemini-nano-banana-2.1";
const KLUCZ = process.env.GEMINI_API_KEY;
const TYPY = {
  ulica: { sceneria: "ulice miasta, zabudowa w tle, asfalt", swiatlo: "naturalne światło dzienne", pora: "jesień" },
  "ulica-noc": { sceneria: "ulice miasta nocą, zabudowa w tle, mokry asfalt", swiatlo: "nocą: ciemne niebo, światło latarni i czołówek biegaczy", pora: "jesień" },
  trail: { sceneria: "górska ścieżka, skały i trawa, szczyty w tle", swiatlo: "naturalne światło dzienne, lekka mgła w dolinach", pora: "lato" },
  ultra: { sceneria: "bardzo długa droga przez rozległy krajobraz, wzgórza aż po horyzont", swiatlo: "niskie światło wczesnego poranka", pora: "wiosna" },
  przelaj: { sceneria: "leśna ścieżka przełajowa, korzenie i liście, drzewa", swiatlo: "naturalne światło dzienne przesiane przez korony drzew", pora: "jesień" },
  nordic: { sceneria: "szeroka żwirowa aleja wzdłuż jeziora, dwie osoby idące z kijkami nordic walking", swiatlo: "miękkie światło późnego popołudnia", pora: "jesień" },   // decyzja Filipa 2.11: nordic/marsz pokazujemy
};

function prompt(t) {
  return [
    "Szeroka okładka wydarzenia biegowego,",
    `pora roku: ${t.pora}.`,
    `Sceneria: ${t.sceneria}.`,
    `Realistyczna fotografia reportażowa, ${t.swiatlo}.`,
    "Kadr: jeden albo dwóch biegaczy, widzianych z dystansu i od tyłu, daleko od siebie, na pustym odcinku trasy.",
    "Żadnego tłumu, żadnej grupy biegaczy, żadnego peletonu ani startu masowego.",
    "Styl dokumentalny: obiektyw 35 mm, lekkie poruszenie sylwetek w ruchu, zróżnicowane zwykłe stroje biegowe, niedoskonałe, nieustawiane światło.",
    "Bez rozpoznawalnych twarzy. Bez żadnego tekstu, liter, numerów startowych i logotypów.",
  ].join(" ");
}

function obraz(json) {
  for (const krok of json.steps || []) for (const el of krok.content || []) {
    if (el && el.type === "image" && typeof el.data === "string" && el.data) return { bajty: Buffer.from(el.data, "base64"), mime: String(el.mime_type || "") };
  }
  return null;
}

const [wyj, ...wybrane] = process.argv.slice(2);
if (!wyj) { console.error("podaj katalog wyjścia"); process.exit(2); }
if (!KLUCZ) { console.error("brak GEMINI_API_KEY w środowisku"); process.exit(2); }
mkdirSync(wyj, { recursive: true });
for (const nazwa of (wybrane.length ? wybrane : Object.keys(TYPY))) {
  const t = TYPY[nazwa]; if (!t) { console.error("nieznany typ " + nazwa); continue; }
  const t0 = Date.now();
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KLUCZ },
    body: JSON.stringify({ model: MODEL, input: prompt(t), response_modalities: ["image"],
      generation_config: { image_config: { aspect_ratio: "21:9", image_size: "1K" } } }),
  });
  const tekst = await r.text();
  if (!r.ok) { console.error(`${nazwa}: gemini ${r.status} ${tekst.slice(0, 200)}`); continue; }
  const o = obraz(JSON.parse(tekst));
  if (!o) { console.error(`${nazwa}: brak obrazu w odpowiedzi`); continue; }
  const ext = o.mime.includes("png") ? "png" : o.mime.includes("webp") ? "webp" : "jpg";
  writeFileSync(join(wyj, `typ-${nazwa}.${ext}`), o.bajty);
  console.log(`${nazwa}: ${o.bajty.length} B (${o.mime}) w ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

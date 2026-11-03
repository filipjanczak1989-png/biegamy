// OKŁADKI — część CZYSTA (bez wasm, bez Deno): prompt, opis dystansu, pora roku, walidacja własnego zdjęcia, sha1. Ładują ją EF race-image
// i okladki-imprez (przez okladka-gemini.mjs) oraz testy w node (blizna-120). Wejście promptu to WYŁĄCZNIE dane serwera (nazwa/miasto
// przycięte, typ, dystanse, data) — nigdy surowy tekst od klienta. Bez tekstu na obrazie.
export const SCENERIE = {
  ulica: "ulice miasta, zabudowa w tle", "ulica-noc": "ulice miasta nocą, zabudowa w tle, mokry asfalt", trail: "leśna lub górska ścieżka, naturalny teren",
  ultra: "bardzo długa droga przez rozległy krajobraz, wzgórza aż po horyzont", przelaj: "leśna ścieżka przełajowa, korzenie i liście, drzewa",
  nordic: "szeroka żwirowa aleja, dwie osoby idące z kijkami nordic walking", park: "alejki parku miejskiego, drzewa", miasto: "ulice miasta, zabudowa w tle",
};
export const KOSZT_USD = 0.034;   // ≈ cena jednego kadru 1K (pomiar 31.10/2.11); do raportu kosztu, nie faktura
export const przytnij = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export function poraRoku(data) { const m = Number(String(data || "").slice(5, 7)); return m <= 2 || m === 12 ? "zima" : m <= 5 ? "wiosna" : m <= 8 ? "lato" : "jesień"; }
export function dystansOpis(d) {
  const km = Number(Array.isArray(d) ? d[0] : d);
  if (!km) return "bieg";
  if (Math.abs(km - 42.195) < 0.3) return "maraton";
  if (Math.abs(km - 21.0975) < 0.3) return "półmaraton";
  if (km >= 50) return "bieg ultra";
  return `bieg na ${Math.round(km * 10) / 10} km`;
}
/** @param {{nazwa:string, miasto?:string|null, dystanse?:number[]|number|null, data:string, typ:string, forma?:string, kompozycja?:string, noc?:boolean}} e */
export function promptOkladki(e) {
  const typ = SCENERIE[e.typ] ? e.typ : "ulica";
  const noc = e.noc != null ? !!e.noc : (typ === "ulica-noc" || /nocn|night/.test(String(e.nazwa || "").toLowerCase()));
  return [
    `${e.forma || "Szeroka"} okładka wydarzenia biegowego: ${typ === "nordic" ? "marsz nordic walking" : dystansOpis(e.dystanse)}`,
    e.miasto ? `w miejscowości ${przytnij(e.miasto, 60)}` : "",
    `(${przytnij(e.nazwa, 80)}), pora roku: ${poraRoku(e.data)}.`,
    `Sceneria: ${SCENERIE[typ]}.`,
    noc ? "Realistyczna fotografia reportażowa nocą: ciemne niebo, światło latarni i czołówek biegaczy." : "Realistyczna fotografia reportażowa, naturalne światło dzienne.",
    "Kadr: jeden albo dwóch biegaczy, widzianych z dystansu i od tyłu, daleko od siebie, na pustym odcinku trasy.",
    "Żadnego tłumu, żadnej grupy biegaczy, żadnego peletonu ani startu masowego.",
    "Styl dokumentalny: obiektyw 35 mm, lekkie poruszenie sylwetek w ruchu, zróżnicowane zwykłe stroje biegowe, niedoskonałe, nieustawiane światło.",
    e.kompozycja || "",
    "Bez rozpoznawalnych twarzy. Bez żadnego tekstu, liter, numerów startowych i logotypów.",
  ].filter(Boolean).join(" ");
}
/** własne zdjęcie trenera: typ po BAJTACH (nie po nagłówku), rozmiar ≤ 3 MB → {bajty, mime} | {blad} */
export function sprawdzWlasneZdjecie(bajty, maks = 3 * 1024 * 1024) {
  if (!(bajty instanceof Uint8Array) || bajty.length < 12) return { blad: "pusty plik" };
  if (bajty.length > maks) return { blad: "plik ponad 3 MB" };
  const b = bajty;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { bajty, mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { bajty, mime: "image/png" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { bajty, mime: "image/webp" };
  return { blad: "nie JPEG/PNG/WebP" };
}
export async function sha1Hex(tekst) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(tekst));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** nazwa obiektu okładki imprezy w race-covers — ta sama w kolejnych latach (klucz bez roku), zawsze .jpg (CHECK w imprezy_okladki) */
export async function obiektImprezy(kluczBezRoku) { return `impreza-${await sha1Hex(kluczBezRoku)}.jpg`; }
/** base64 (także data:…;base64,) → Uint8Array; zły wsad → null */
export function zBase64(s) {
  try { const czyste = String(s || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, ""); const bin = atob(czyste); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  catch { return null; }
}

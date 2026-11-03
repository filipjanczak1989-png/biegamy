// OKŁADKI — część OBRAZOWA (Deno: jpeg.wasm z imagescript, Gemini Interactions API). Do 3.11 kod żył w race-image (plus kopia
// w tools/kalendarz/generuj-okladki.mjs) — teraz JEDNO miejsce dla race-image (nasze zawody) i okladki-imprez (imprezy z maszyny: automat
// nocny + „Zmień zdjęcie” trenera). Część czysta (prompt, walidacja zdjęcia, sha1) w okladka-prompt.mjs — ją ładują też testy.
import * as jpegWasm from "https://deno.land/x/imagescript@1.2.15/utils/wasm/jpeg.js";
export * from "./okladka-prompt.mjs";
const jpeg = jpegWasm;

export const MODEL = "gemini-nano-banana-2.1";
export const JPEG_Q = 80;
export const PROG_PRZEKODOWANIA = 400 * 1024;
export const DOZWOLONE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
export const BUCKET = "race-covers";
export const SZEROKA_1200 = (w, h) => (w > 1200 ? [1200, Math.round(h * 1200 / w)] : null);

// Kształt zmierzony 31.10.2026: steps[] → model_output.content[] → { type: "image", mime_type, data(base64) }; kolejności nie zakładamy.
export function wyciagnijObraz(json) {
  const steps = json && json.steps;
  if (!Array.isArray(steps)) return null;
  for (const krok of steps) {
    const content = krok && krok.content;
    if (!Array.isArray(content)) continue;
    for (const e of content) {
      if (!e || e.type !== "image" || typeof e.data !== "string" || !e.data) continue;
      const bin = atob(e.data);
      const bajty = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
      return { bajty, mime: String(e.mime_type || "") };
    }
  }
  return null;
}

/** JPEG: skalowanie bilinear do `docelowe(w,h)` (null = bez zmiany rozmiaru) i przekodowanie q80, gdy plik > 400 KB; inne typy bez zmian. */
export function przeskaluj(obraz, docelowe) {
  if (obraz.mime !== "image/jpeg") return obraz;
  const { width: W, height: H, buffer: piks } = jpeg.decode(obraz.bajty, 0, 0);
  const kan = piks.length / (W * H);
  if (kan !== 1 && kan !== 3) return obraz;
  const cel = docelowe ? docelowe(W, H) : null;
  if (!cel && obraz.bajty.length <= PROG_PRZEKODOWANIA) return obraz;
  const [DW, DH] = cel || [W, H];
  const sx = W / DW, sy = H / DH;
  const rgba = new Uint8Array(DW * DH * 4);
  for (let y = 0; y < DH; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), H - 1);
    const y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < DW; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), W - 1);
      const x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), wx = fx - x0;
      const o = (y * DW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const cc = kan === 1 ? 0 : c;
        const a = piks[(y0 * W + x0) * kan + cc], b = piks[(y0 * W + x1) * kan + cc];
        const d = piks[(y1 * W + x0) * kan + cc], e = piks[(y1 * W + x1) * kan + cc];
        rgba[o + c] = Math.round((a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy);
      }
      rgba[o + 3] = 255;
    }
  }
  return { bajty: jpeg.encode(rgba, DW, DH, JPEG_Q), mime: "image/jpeg" };
}

/** jedno wywołanie modelu → {bajty, mime} | null; rzuca Error('gemini <status>: …') */
export async function generujGemini({ klucz, prompt, aspect = "21:9", rozmiar = "1K", fetchFn = fetch }) {
  const r = await fetchFn("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": klucz },
    body: JSON.stringify({ model: MODEL, input: prompt, response_modalities: ["image"], generation_config: { image_config: { aspect_ratio: aspect, image_size: rozmiar } } }),
  });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`gemini ${r.status}: ${tekst.slice(0, 300)}`);
  return wyciagnijObraz(JSON.parse(tekst));
}

/** wgranie do race-covers (upsert, rok cache) → publiczny URL z ?v= (sw.js trzyma storage cache-first po pełnym URL-u) */
export async function wgrajOkladke(sb, plik, obraz) {
  const { error } = await sb.storage.from(BUCKET).upload(plik, obraz.bajty, { contentType: obraz.mime, cacheControl: "31536000", upsert: true });
  if (error) throw new Error("zapis pliku: " + (error.message || "storage"));
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(plik);
  return `${pub.publicUrl}?v=${Date.now()}`;
}

// Zgłoszenie firmy: czysta logika bez Deno. Ładuje ją EF firma-zgloszenie i testy (blizna-157).
export const PLIK_MAKS = 2 * 1024 * 1024, LOGO_BOK = 400, KOMPLET_MAKS = 5 * 1024 * 1024;
const RE_LINK = /^https:\/\/[^\s/?#<>"'@\\]+\.[^\s/?#<>"'@\\]+([/?#][^\s<>"']*)?$/;
const RE_EMAIL = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;
export const ROZSZERZENIE = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Typ pliku wyłącznie po bajtach. Nagłówek od klienta nic nie znaczy, a SVG to tekst, więc tu nie przejdzie. */
export function typPoBajtach(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Szerokość i wysokość z nagłówka pliku, bez dekodowania obrazu. null = nie da się odczytać. */
export function wymiaryObrazu(b, typ) {
  const u16be = (i) => (b[i] << 8) | b[i + 1], u32be = (i) => ((b[i] * 16777216) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]), u24le = (i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (typ === "image/png") return b.length >= 24 ? { w: u32be(16), h: u32be(20) } : null;
  if (typ === "image/jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16be(i + 7), h: u16be(i + 5) };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  if (typ === "image/webp") {
    if (b.length < 30) return null;
    const czunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (czunk === "VP8X") return { w: u24le(24) + 1, h: u24le(27) + 1 };
    if (czunk === "VP8 ") return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (czunk === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] * 16777216); return { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 }; }
  }
  return null;
}

/** Kwota z formularza w złotych → grosze albo null. */
export function kwotaNaGrosze(t) {
  const s = String(t == null ? "" : t).replace(/[\s\u00a0]/g, "").replace(/zł$/i, "").replace(",", ".");
  return /^\d{1,7}(\.\d{1,2})?$/.test(s) && Number(s) > 0 ? Math.round(Number(s) * 100) : null;
}
/** Pola formularza. M = filtr moderacji (BM_MODERACJA), progi z bazy (prog_domku_zl, prog_wiezowca_zl). → { blad } | { wiersz }. Nazwy do ręcznej oceny przechodzą, bo i tak ogląda je trener; twarde słowa odpadają od razu. */
export function sprawdzZgloszenie(p, M, progi) {
  const o = p || {}, rodzaj = String(o.rodzaj || ""), nazwa = String(o.nazwa || "").trim(), email = String(o.email || "").trim();
  let link = String(o.link || "").trim();
  if (rodzaj !== "domek" && rodzaj !== "wiezowiec") return { blad: "Wybierz domek albo wieżowiec." };
  if (nazwa.length < 2 || nazwa.length > 120 || /[\u0000-\u001f\u007f]/.test(nazwa)) return { blad: "Nazwa firmy: od 2 do 120 znaków." };
  if (!M) return { blad: "Filtr nazw niedostępny. Spróbuj później." };
  const filtr = M.sprawdz(nazwa, { rodzaj: "firma" });
  if (!filtr.ok && !filtr.mozna_potwierdzic) return { blad: M.komunikat ? M.komunikat(filtr) : "Tej nazwy nie możemy przyjąć." };
  if (link && !/^[a-z][a-z0-9+.-]*:/i.test(link)) link = "https://" + link;
  try { link = new URL(link).href; } catch (_) { return { blad: "Link: podaj adres strony firmy." }; }
  if (link.length > 500 || !RE_LINK.test(link)) return { blad: "Link: tylko adres zaczynający się od https://." };
  if (email.length > 120 || !RE_EMAIL.test(email)) return { blad: "Podaj poprawny adres e-mail." };
  const kwota_gr = kwotaNaGrosze(o.kwota);
  if (kwota_gr == null) return { blad: "Podaj kwotę wpłaty w złotych." };
  const prog = progi && Number(rodzaj === "wiezowiec" ? progi.prog_wiezowca_zl : progi.prog_domku_zl);
  if (prog > 0 && kwota_gr < prog * 100) return { blad: (rodzaj === "wiezowiec" ? "Wieżowiec" : "Domek") + " od " + prog + " zł." };
  if (o.zgoda !== "tak") return { blad: "Zaznacz zgodę na wymienienie firmy." };
  return { wiersz: { rodzaj, nazwa, link, email, kwota_gr, zgoda_kwota: o.zgoda_kwota === "tak" } };
}

/* Cegiełka od osoby prywatnej (20261107_akcja_cegielka_zgloszenia): imię jak CHECK w akcja_cegielki i RE_IMIE w js/ulica.mjs (jedno słowo, najwyżej jeden łącznik).
   Te same trzy kopie pilnuje blizna-192. */
export const RE_IMIE = /^(?=.{2,20}$)[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(?:-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$/;
/** Pola cegiełki: imię, zgoda na imię w murze (bez niej cegła bez imienia), e-mail opcjonalnie (tylko podziękowanie), kwota opcjonalnie (od 100 zł złota cegła, 20261109_akcja_po_starcie;
    kwota zostaje w zgłoszeniu dla panelu, publicznie nigdy). Bez linku, logo i progu. → { blad } | { wiersz }. */
export function sprawdzCegielke(p, M) {
  const o = p || {}, imie = String(o.imie || "").trim(), email = String(o.email || "").trim();
  if (!RE_IMIE.test(imie)) return { blad: "Imię: jedno słowo, same litery, od 2 do 20 znaków, najwyżej jeden łącznik (Anna-Maria). Bez nazwiska." };
  if (!M) return { blad: "Filtr imion niedostępny. Spróbuj później." };
  if (!M.sprawdz(imie, { rodzaj: "imie" }).ok) return { blad: "Tego imienia nie możemy przyjąć." };
  if (email && (email.length > 120 || !RE_EMAIL.test(email))) return { blad: "Podaj poprawny adres e-mail albo zostaw pole puste." };
  const kwota = String(o.kwota == null ? "" : o.kwota).trim(), kwota_gr = kwota ? kwotaNaGrosze(kwota) : null;
  if (kwota && kwota_gr == null) return { blad: "Kwota: podaj liczbę złotych (np. 100) albo zostaw pole puste." };
  return { wiersz: { rodzaj: "cegielka", nazwa: imie, email: email || null, zgoda_imie: o.zgoda_imie === "tak", kwota_gr } };
}

/** Plik z formularza: rozmiar i typ po bajtach. → { blad } | { typ, rozszerzenie }. */
export function sprawdzPlik(b, opis) {
  if (!b || !b.length) return { blad: "Dodaj " + opis + "." };
  if (b.length > PLIK_MAKS) return { blad: opis[0].toUpperCase() + opis.slice(1) + ": plik do 2 MB." };
  const typ = typPoBajtach(b);
  if (!typ) return { blad: opis[0].toUpperCase() + opis.slice(1) + ": tylko PNG, JPG albo WebP." };
  return { typ, rozszerzenie: ROZSZERZENIE[typ] };
}

// OKIENKO M3c (1.11.2026, projekt M3 v2 pkt 5) — KATALOG: jedno wyszukiwanie po treściach aplikacji (radio, przepisy,
// ćwiczenia/programy/oddech, ekrany, wyzwania, odznaki). Po routerze, osobie i imprezie, PRZED pamięcią i modelem.
// Trafienie MOCNE (odsetek słów zapytania trafionych w tytule ≥ 0,6 i choć jedno słowo zapytania ≥ 4 znaki) → odpowiedź
// z katalogu, 0 tokenów, model nie startuje. Słabe → null (dalej jak dotąd). ≤ 5 kart, po wyniku; przy remisie radio
// przed resztą (decyzja Filipa: radio ma działać).
// Źródła — WSPÓLNE z aplikacją, bez drugich kopii: js/przepisy-szukaj.mjs (to samo wyszukiwanie co Jedzenie),
// js/cwiczenia-nazwy.mjs (te same nazwy co zakładka Ćwiczenia), _shared/wyzwania.mjs, _shared/odznaki-nazwy.mjs,
// EKRANY/NAZWY_EKRANOW z narzedzia.mjs. Z bazy (JWT użytkownika, RLS) czyta WYŁĄCZNIE radio_tracks i recipes — nic
// osobistego (żadnych logów, polubień, znajomych); zapytanie nie wychodzi poza Supabase.
import "../../../js/przepisy-szukaj.mjs";
import "../../../js/cwiczenia-nazwy.mjs";
import { WYZWANIA } from "../_shared/wyzwania.mjs";
import { NAZWY_ODZNAK } from "../_shared/odznaki-nazwy.mjs";
import { EKRANY, NAZWY_EKRANOW } from "./narzedzia.mjs";

const S = /** @type {any} */ (globalThis).BM_SZUKAJ;
const C = /** @type {any} */ (globalThis).BM_CWICZENIA_NAZWY;
export const PROG_MOCNY = 0.6, MAX_KART_KATALOGU = 5;
export const ODP_KATALOG = "Znalazłem w aplikacji:";
// słowa poleceń, które nie są tytułem („zagraj żelazna wola", „pokaż przepis na omlet")
const KAT_POMIN = { zagraj: 1, odtworz: 1, pusc: 1, wlacz: 1, pokaz: 1, otworz: 1, znajdz: 1, piosenka: 1, piosenke: 1, utwor: 1, kawalek: 1, ten: 1, ta: 1, to: 1 };
const KOLEJNOSC = { utwor: 0, przepis: 1, cwiczenie: 2, kat_ekran: 3, kat_wyzwanie: 4, kat_odznaka: 5 };   // kat_*: nie mylić z kartami wyzwanie/odznaka narzędzi

/** → null (brak mocnego trafienia) | {zdania, karty, liczba} */
export async function szukajWKatalogu(sb, tekst) {
  const t = String(tekst || "").trim();
  if (t.length < 3 || /^\d+$/.test(t)) return null;
  const rd = S.rdzenieZapytania(t, KAT_POMIN);
  if (!rd.length) return null;
  if (!S.slowa(t).some((w) => w.length >= 4 && !KAT_POMIN[w])) return null;
  const [rT, rP] = await Promise.all([
    sb.from("radio_tracks").select("id,title,artist,cover_slug").limit(500),
    sb.from("recipes").select("id,title,emoji,ingredients,tags").limit(500),
  ]);
  const kand = [];
  const dodaj = (typ, nazwa, wynik, dane) => { if (wynik >= PROG_MOCNY) kand.push({ typ, wynik, nazwa, dane }); };
  for (const r of (rT && rT.data) || []) dodaj("utwor", r.title, S.wynikTytulu(r.title, rd), { id: r.id, tytul: String(r.title || "").slice(0, 120), wykonawca: r.artist || null, cover_slug: r.cover_slug || null });
  // przepisy: TO SAMO wyszukiwanie co pole „Szukaj przepisu" w Jedzeniu — przepis z wyniku jest pełnym trafieniem
  for (const x of S.szukajPrzepisow((rP && rP.data) || [], t)) dodaj("przepis", x.p.title, 1, { id: x.p.id, tytul: String(x.p.title || "").slice(0, 120), emoji: x.p.emoji || null });
  for (const [k, n] of Object.entries(C.programy)) dodaj("cwiczenie", n, S.wynikTytulu(n, rd), { rodzaj: "prog", klucz: k, nazwa: n });
  for (const [k, n] of Object.entries(C.oddech)) dodaj("cwiczenie", n, S.wynikTytulu(n, rd), { rodzaj: "breath", klucz: k, nazwa: n });
  for (const [k, n] of Object.entries(C.cwiczenia)) dodaj("cwiczenie", n, S.wynikTytulu(n, rd), { rodzaj: "cw", klucz: k, nazwa: n });
  for (const [k, n] of Object.entries(NAZWY_EKRANOW)) dodaj("kat_ekran", n, S.wynikTytulu(n, rd), { ekran: k, nazwa: n, cel: EKRANY[k] });
  for (const ch of [...WYZWANIA.WEEKLY, ...WYZWANIA.MONTHLY]) dodaj("kat_wyzwanie", ch.title, S.wynikTytulu(ch.title, rd), { nazwa: ch.title });
  for (const n of Object.values(NAZWY_ODZNAK)) dodaj("kat_odznaka", n, S.wynikTytulu(n, rd), { nazwa: n });
  if (!kand.length) return null;
  kand.sort((a, b) => (b.wynik - a.wynik) || (KOLEJNOSC[a.typ] - KOLEJNOSC[b.typ]) || String(a.nazwa).localeCompare(String(b.nazwa), "pl"));
  const unik = [], byly = new Set();
  for (const k of kand) { const id = k.typ + "|" + k.nazwa; if (!byly.has(id)) { byly.add(id); unik.push(k); } }
  return { zdania: [ODP_KATALOG], karty: unik.slice(0, MAX_KART_KATALOGU).map((k) => ({ typ: k.typ, dane: k.dane })), liczba: unik.length };
}

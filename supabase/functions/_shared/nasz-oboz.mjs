// „NASZ OBÓZ” na początku listy obozów w Okienku (Filip 3.11). Pusta konfiguracja: Filip uzupełnia te pola, gdy obóz będzie znany. Pusta nazwa = karty nie ma.
// Bez ceny, terminu albo linku karta pokazuje tylko to, co wpisano. url: tylko https (klient i tak przepuszcza go przez safeExternalHref).
export const NASZ_OBOZ = { nazwa: "", termin: "", miejsce: "", cena: "", url: "" };

export function kartyNaszegoObozu(o = NASZ_OBOZ) {
  if (!o || !String(o.nazwa || "").trim()) return [];
  return [{ typ: "oboz_nasz", dane: { nazwa: String(o.nazwa).slice(0, 120), termin: String(o.termin || "").slice(0, 60), miejsce: String(o.miejsce || "").slice(0, 80), cena: String(o.cena || "").slice(0, 40), url: /^https:\/\//.test(String(o.url || "")) ? String(o.url) : "" } }];
}

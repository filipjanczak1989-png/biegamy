// OKIENKO 2.0 — zdania akcji po starcie i liczba biegaczy (Filip 3.11, przed przepięciem wszystkich). Czysta logika + jedno zapytanie
// liczące (service). Liczby akcji WYŁĄCZNIE z akcja_licznik (akcjaDane z js/akcja-cytaty.mjs odswiezStan). Cel wyprawy NIGDY tu nie trafia:
// akcja_licznik oddaje wyprawa_cel_nazwa dopiero po dotarciu, a i wtedy Okienko go nie powtarza (Dziś pokazuje „Dotarliśmy”).
export const ZDANIE_WYPRAWA_TRWA = "Dokąd biegną Filip i Kasia — zdradzimy na mecie. Postęp wyprawy widać na Dziś.";
export const ZDANIE_WYPRAWA_DOTARLI = "Dotarli! Szczegóły na Dziś.";
export { ZDANIE_LICZBY_ZAPAS, zdanieLiczby, liczbaBiegaczy } from "../_shared/liczba-biegaczy.mjs";   // 22.11 (krok 3): wspólne z v1, bez kopii

/** → zdanie dla pytania o akcję PO STARCIE albo null (wtedy zostaje zdanie z routera: zagadka przed startem, PO_STARCIE po). */
export const ZDANIE_ULICA = "Ulicę, domki firm i wpisy osób wpłacających zobaczysz na stronie akcji. Firmy i wpisy dopisuje trener po zobaczeniu potwierdzenia wpłaty, a kwotę firmy pokazujemy tylko za jej zgodą. Okienko niczego tam nie zmienia ani nie potwierdza.";
export const ZDANIE_GRA = "Cegiełki to gra w aplikacji. Cegły i złote cegły to wyłącznie waluta w grze: nie są wpłatami, nie da się ich kupić ani wypłacić, a gra nie zmienia licznika kilometrów ani statystyk treningów. Ranking jest pod pseudonimem, a poziomy i dodatki zdobywa się samym graniem. Pomóc pieniędzmi można tylko przez oficjalną zbiórkę.";
export const ZDANIE_ROWER = "Rower nie liczy się do licznika akcji. Liczą się bieg i spacer.";
export function zdanieAkcji(rodzaj, d, AKK) {
  if (!d || !d.wystartowala) return null;   // przed startem: zagadka (nic o wyprawie, nic o liczbach)
  if (rodzaj === "faq") return null;   // zdanie z FAQ jest już w trafieniu routera
  if (rodzaj === "ulica") return ZDANIE_ULICA;
  if (rodzaj === "gra") return ZDANIE_GRA;
  if (rodzaj === "rower") return ZDANIE_ROWER;
  if (rodzaj === "wyprawa") return d.wyprawa_dotarla_at ? ZDANIE_WYPRAWA_DOTARLI : ZDANIE_WYPRAWA_TRWA;
  if (rodzaj === "km") {
    const s = Number(d.suma_km), c = Number(d.cel_km);
    if (!(s >= 0) || d.suma_km == null) return null;
    const km = AKK && typeof AKK.km === "function" ? AKK.km : (x) => String(Math.round(Number(x) || 0));
    return c > 0 ? `Razem już ${km(s)} km z ${km(c)}.` : `Razem już ${km(s)} km.`;
  }
  return null;
}


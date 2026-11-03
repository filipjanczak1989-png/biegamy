// OKIENKO 2.0 — zdania akcji po starcie i liczba biegaczy (Filip 3.11, przed przepięciem wszystkich). Czysta logika + jedno zapytanie
// liczące (service). Liczby akcji WYŁĄCZNIE z akcja_licznik (akcjaDane z js/akcja-cytaty.mjs odswiezStan). Cel wyprawy NIGDY tu nie trafia:
// akcja_licznik oddaje wyprawa_cel_nazwa dopiero po dotarciu, a i wtedy Okienko go nie powtarza (Dziś pokazuje „Dotarliśmy”).
export const ZDANIE_WYPRAWA_TRWA = "Dokąd biegną Filip i Kasia — zdradzimy na mecie. Postęp wyprawy widać na Dziś.";
export const ZDANIE_WYPRAWA_DOTARLI = "Dotarli! Szczegóły na Dziś.";
export const ZDANIE_LICZBY_ZAPAS = "Z BiegaMy korzysta kilkadziesiąt osób — biegacze i ich trenerzy.";

/** → zdanie dla pytania o akcję PO STARCIE albo null (wtedy zostaje zdanie z routera: zagadka przed startem, PO_STARCIE po). */
export function zdanieAkcji(rodzaj, d, AKK) {
  if (!d || !d.wystartowala) return null;   // przed startem: zagadka (nic o wyprawie, nic o liczbach)
  if (rodzaj === "wyprawa") return d.wyprawa_dotarla_at ? ZDANIE_WYPRAWA_DOTARLI : ZDANIE_WYPRAWA_TRWA;
  if (rodzaj === "km") {
    const s = Number(d.suma_km), c = Number(d.cel_km);
    if (!(s >= 0) || d.suma_km == null) return null;
    const km = AKK && typeof AKK.km === "function" ? AKK.km : (x) => String(Math.round(Number(x) || 0));
    return c > 0 ? `Razem już ${km(s)} km z ${km(c)}.` : `Razem już ${km(s)} km.`;
  }
  return null;
}

/** „ile osób korzysta z BiegaMy” → „Z BiegaMy korzysta ponad X biegaczy.” — konta z logowaniem, bez usuniętych; X w dół do dziesiątek. */
export function zdanieLiczby(n) {
  const k = Number(n);
  if (!Number.isFinite(k) || k < 10) return null;
  const x = Math.floor(k / 10) * 10;
  return k > x ? `Z BiegaMy korzysta ponad ${x} biegaczy.` : `Z BiegaMy korzysta ${x} biegaczy.`;
}
export async function liczbaBiegaczy(adm) {
  const { count, error } = await adm.from("athletes").select("id", { count: "exact", head: true }).not("user_id", "is", null).neq("full_name", "Usunięty użytkownik");
  if (error) return null;
  return zdanieLiczby(count);
}

// LICZBA BIEGACZY (Filip 3.11; wspólna dla v1 i v2 od 22.11, krok 3): „ile osób / kto korzysta z BiegaMy” → zdanie z liczbą kont z logowaniem,
// bez usuniętych, w dół do dziesiątek. Jedno zapytanie liczące (klient service). Nigdy nazwy osób. Woła potok v2 (przez akcja-v2.mjs) i EF okienko (v1).
export const ZDANIE_LICZBY_ZAPAS = "Z BiegaMy korzystają biegacze i ich trenerzy.";   // Filip 22.11: bez liczby (wcześniej „kilkadziesiąt osób”, a kont jest ok. 190)

/** „ile osób korzysta z BiegaMy” → „Z BiegaMy korzysta ponad X biegaczy.” — X w dół do dziesiątek; < 10 albo nie liczba → null (zdanie zapasowe). */
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

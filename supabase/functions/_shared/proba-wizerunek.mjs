// Rysunek, arkusz i film na akcji próbnej (Ścieżka Fabianka): kto dostaje adres i jaki. Bez Deno: to samo wołają EF i test (blizna-161).
export const KUBELEK = "akcja-wizerunek", WAZNOSC_S = 900;
export const PLIKI = { koparka_url: "fabianek-koparka.webp", koparka_arkusz_url: "fabianek-koparka-arkusz.webp", film_akcji_url: "film-akcja.mp4" };

/** Trener albo konto z listy testowej akcji proba. Każdy inny: false. */
export async function maDostep(sb, user) {
  if (!user) return false;
  const { data: trener } = await sb.from("coaches").select("id").eq("id", user.id).maybeSingle();
  if (trener) return true;
  const { data: konto } = await sb.from("athletes").select("id").eq("user_id", user.id).maybeSingle();
  const { data: proba } = await sb.from("akcje").select("konta_testowe").eq("slug", "proba").eq("testowa", true).maybeSingle();
  return !!(konto && proba && Array.isArray(proba.konta_testowe) && proba.konta_testowe.includes(konto.id));
}

/** → { status, body }. Bez sesji 401, zwykłe konto 403: bez nazwy pliku i bez adresu. */
export async function odpowiedzWizerunku(sb, user) {
  if (!user) return { status: 401, body: { ok: false } };
  if (!(await maDostep(sb, user))) return { status: 403, body: { ok: false } };
  const wynik = {};
  for (const [pole, plik] of Object.entries(PLIKI)) {
    const s = await sb.storage.from(KUBELEK).createSignedUrl(plik, WAZNOSC_S);
    wynik[pole] = (s.data && s.data.signedUrl) || null;
  }
  const { data: licznik } = await sb.rpc("akcja_licznik", { p_slug: "proba" });
  return { status: 200, body: { ok: true, ...wynik, firmy: (licznik && licznik.firmy) || [] } };
}

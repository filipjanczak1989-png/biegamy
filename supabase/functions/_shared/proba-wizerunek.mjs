// Rysunek, arkusz, film, plakat, nazwa, imię i adres zbiórki na akcji próbnej (Ścieżka Fabianka): kto dostaje i co. Bez Deno: to samo wołają EF i test (blizna-161).
// Nazwa, imię i zbiórka nie są w wierszu próby, bo licznik próby może wywołać każdy zalogowany, a przed startem to tajemnica.
export const KUBELEK = "akcja-wizerunek", WAZNOSC_S = 900;
export const PLIKI_MUZYKI = { premiera: "muzyka-premiera.mp3", menu1: "muzyka-menu-1.mp3", menu2: "muzyka-menu-2.mp3", rower: "muzyka-rower.mp3", noc: "muzyka-noc.mp3", mur: "muzyka-mur.mp3", final: "muzyka-final.mp3", magazyn: "muzyka-magazyn.mp3" };
export const PLIKI = { koparka_url: "fabianek-koparka.webp", koparka_arkusz_url: "fabianek-koparka-arkusz.webp", film_akcji_url: "film-akcja.mp4", plakat_url: "plakat-akcji.webp" };

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
  /* Równolegle: 12 podpisów po kolei trzymało ekran guzika kilka sekund. */
  const wynik = {}, muzyka = {};
  await Promise.all([
    ...Object.entries(PLIKI).map(async ([pole, plik]) => {
      const s = await sb.storage.from(KUBELEK).createSignedUrl(plik, WAZNOSC_S);
      wynik[pole] = (s.data && s.data.signedUrl) || null;
    }),
    ...Object.entries(PLIKI_MUZYKI).map(async ([pole, plik]) => {
      const s = await sb.storage.from(KUBELEK).createSignedUrl(plik, WAZNOSC_S);
      if (s.data && s.data.signedUrl) muzyka[pole] = s.data.signedUrl;
    }),
  ]);
  const { data: licznik } = await sb.rpc("akcja_licznik", { p_slug: "proba" });
  const { data: prawdziwa } = await sb.from("akcje").select("nazwa, imie_zbiorki, url_zbiorki").eq("slug", "dla-fabianka").maybeSingle();
  return { status: 200, body: { ok: true, ...wynik, muzyka, nazwa: (prawdziwa && prawdziwa.nazwa) || null, imie: (prawdziwa && prawdziwa.imie_zbiorki) || null, url_zbiorki: (prawdziwa && prawdziwa.url_zbiorki) || null, proba_od: (licznik && licznik.wystartowala_at) || null, firmy: (licznik && licznik.firmy) || [] } };
}

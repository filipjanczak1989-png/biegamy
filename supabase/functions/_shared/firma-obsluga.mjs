// Obsługa zgłoszeń firm bez Deno: te same funkcje wołają EF i testy (blizna-159). Klient bazy, push i mail są wstrzykiwane, więc przepływ da się sprawdzić bez sieci.
import { KOMPLET_MAKS, LOGO_BOK, ROZSZERZENIE, sprawdzPlik, sprawdzZgloszenie, wymiaryObrazu } from "./firma-zgloszenie.mjs";

export const KUBELEK = "firmy-zgloszenia", PUBLICZNY = "akcja-firmy-logo", WAZNOSC_S = 600;
const TYPY = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const RE_ID = /^[0-9a-f-]{36}$/;
const zl = (gr) => Math.round(Number(gr) / 100).toLocaleString("pl-PL").replace(/ /g, " ") + " zł";
const nazwaBudynku = (r) => (r === "wiezowiec" ? "wieżowiec" : "domek");

/** Treść pushu do Filipa. Kwota z formularza idzie tylko tutaj, publicznie wyłącznie za zgodą firmy. */
export function trescPushu(w, slug, id) {
  return { title: `${slug === "proba" ? "[próba] " : ""}Nowa firma: ${w.nazwa} · ${nazwaBudynku(w.rodzaj)} · ${zl(w.kwota_gr)}`, body: "Dotknij, żeby zatwierdzić albo odrzucić.", url: `/trener.html#firma-zgloszenie=${id}`, type: "akcja", tag: `firma-${id}` };
}

/** Formularz ze strony akcji. d: { dane: FormData-podobne (get), ipSkrot, sb, moderacja, powiadom(payload), przeskaluj?(bytes) }. → { status, body }. Awaria pushu nie psuje zgłoszenia: lista czeka w panelu. */
export async function przyjmijZgloszenie(d) {
  const f = d.dane, sb = d.sb, J = (status, body) => ({ status, body });
  // Pułapka: pole niewidoczne dla człowieka. Bot dostaje „ok” i nic się nie dzieje.
  if (String(f.get("strona_www") || "").trim()) return J(200, { ok: true });
  const slug = f.get("slug") === "proba" ? "proba" : "dla-fabianka";
  const { data: wpusc, error: bladWpusc } = await sb.rpc("akcja_firmy_wpusc", { p_ip: d.ipSkrot, p_slug: slug });
  if (bladWpusc || !wpusc) { console.error("firma-zgloszenie wpusc:", bladWpusc && bladWpusc.message); return J(500, { ok: false, blad: "Nie udało się. Spróbuj za chwilę." }); }
  if (!wpusc.ok) return wpusc.powod === "limit" ? J(429, { ok: false, blad: "Za dużo zgłoszeń z tego adresu. Spróbuj za godzinę." }) : J(403, { ok: false, blad: "Zgłoszenia są teraz wyłączone." });

  const p = sprawdzZgloszenie({ rodzaj: f.get("rodzaj"), nazwa: f.get("nazwa"), link: f.get("link"), email: f.get("email"), zgoda: f.get("zgoda"), kwota: f.get("kwota"), zgoda_kwota: f.get("zgoda_kwota") }, d.moderacja, wpusc);
  if (p.blad) return J(400, { ok: false, blad: p.blad });
  const wiersz = p.wiersz;
  const plikLogo = f.get("logo"), plikZrzut = f.get("zrzut");
  let logo = plikLogo && plikLogo.arrayBuffer ? new Uint8Array(await plikLogo.arrayBuffer()) : null;
  const zrzut = plikZrzut && plikZrzut.arrayBuffer ? new Uint8Array(await plikZrzut.arrayBuffer()) : null;
  const zlg = sprawdzPlik(logo, "logo");
  if (zlg.blad) return J(400, { ok: false, blad: zlg.blad });
  const zz = sprawdzPlik(zrzut, "zrzut wpłaty");
  if (zz.blad) return J(400, { ok: false, blad: zz.blad });

  let typLogo = zlg.typ;
  const wym = wymiaryObrazu(logo, typLogo);
  if (!wym || wym.w < 1 || wym.h < 1) return J(400, { ok: false, blad: "Logo: nie udało się odczytać obrazu." });
  if (Math.max(wym.w, wym.h) > LOGO_BOK) {
    if (typLogo === "image/webp" || !d.przeskaluj) return J(400, { ok: false, blad: "Logo może mieć najwyżej 400 px na dłuższym boku. Wyślij PNG albo JPG." });
    try { logo = await d.przeskaluj(logo); typLogo = "image/png"; }
    catch (e) { console.error("firma-zgloszenie skalowanie:", String(e)); return J(400, { ok: false, blad: "Logo jest za duże: najwyżej 400 px na dłuższym boku." }); }
  }

  const id = (d.noweId || (() => crypto.randomUUID()))();
  const sciezkaLogo = `${id}/logo.${ROZSZERZENIE[typLogo]}`, sciezkaZrzut = `${id}/zrzut.${zz.rozszerzenie}`;
  const up1 = await sb.storage.from(KUBELEK).upload(sciezkaLogo, logo, { contentType: typLogo, upsert: false });
  const up2 = up1.error ? up1 : await sb.storage.from(KUBELEK).upload(sciezkaZrzut, zrzut, { contentType: zz.typ, upsert: false });
  const sprzatnij = async () => { try { await sb.storage.from(KUBELEK).remove([sciezkaLogo, sciezkaZrzut]); } catch (_) { /* zostanie sprzątanie nocne */ } };
  if (up2.error) { console.error("firma-zgloszenie upload:", up2.error.message); await sprzatnij(); return J(500, { ok: false, blad: "Nie udało się zapisać plików. Spróbuj za chwilę." }); }
  const { error: bladZapisu } = await sb.rpc("akcja_firmy_zgloszenie_dodaj", { p_id: id, p_slug: slug, p_rodzaj: wiersz.rodzaj, p_nazwa: wiersz.nazwa, p_link: wiersz.link, p_email: wiersz.email, p_logo: sciezkaLogo, p_zrzut: sciezkaZrzut, p_kwota_gr: wiersz.kwota_gr, p_zgoda_kwota: wiersz.zgoda_kwota });
  if (bladZapisu) { console.error("firma-zgloszenie zapis:", bladZapisu.message); await sprzatnij(); return J(400, { ok: false, blad: "Nie udało się zapisać zgłoszenia. Sprawdź dane." }); }

  try { await d.powiadom(trescPushu(wiersz, slug, id)); } catch (e) { console.error("firma-zgloszenie push:", String(e)); }
  return J(200, { ok: true, id });
}

/** Decyzje i lista w panelu trenera. Kontrola konta jest wcześniej, w EF. d: { sb, user, body, wyslijMaila?(do, temat, tresc) }. → { status, body }. */
export async function akcjaPanelu(d) {
  const sb = d.sb, user = d.user, body = d.body || {}, J = (status, b) => ({ status, body: b });
  if (body.akcja === "licznik") {
    const { data, error } = await sb.rpc("akcja_firmy_zgloszenia_lista");
    if (error) return J(500, { ok: false, blad: "Nie udało się." });
    return J(200, { ok: true, nowe: (data && data.zgloszenia || []).filter((z) => z.status === "nowe").length });
  }
  if (body.akcja === "lista") {
    const { data, error } = await sb.rpc("akcja_firmy_zgloszenia_lista");
    if (error) { console.error("firma-panel lista:", error.message); return J(500, { ok: false, blad: "Nie udało się wczytać listy." }); }
    const lista = (data && data.zgloszenia) || [];
    for (const z of lista) {
      for (const pole of ["logo", "zrzut"]) {
        if (!z[pole]) { z[pole + "_adres"] = null; continue; }
        const s = await sb.storage.from(KUBELEK).createSignedUrl(z[pole], WAZNOSC_S);
        z[pole + "_adres"] = (s.data && s.data.signedUrl) || null;
      }
      delete z.logo; delete z.zrzut;
    }
    return J(200, { ok: true, zgloszenia: lista, prog_domku_zl: data && data.prog_domku_zl, prog_wiezowca_zl: data && data.prog_wiezowca_zl, firmy_zgloszenia: data && data.firmy_zgloszenia });
  }
  if (body.akcja === "progi") {
    const { data, error } = await sb.rpc("akcja_firmy_progi", { p_domek: Math.round(Number(body.domek)), p_wiezowiec: Math.round(Number(body.wiezowiec)), p_zgloszenia: typeof body.zgloszenia === "boolean" ? body.zgloszenia : null });
    if (error) { console.error("firma-panel progi:", error.message); return J(500, { ok: false, blad: "Nie udało się zapisać." }); }
    return data && data.ok ? J(200, { ok: true }) : J(400, { ok: false, blad: "Próg wieżowca musi być wyższy od progu domku." });
  }
  const id = String(body.id || "");
  if (!RE_ID.test(id)) return J(400, { ok: false, blad: "Złe zgłoszenie." });

  if (body.akcja === "odrzuc") {
    const powod = String(body.powod || "").trim().slice(0, 300);
    const { data, error } = await sb.rpc("akcja_firmy_odrzuc", { p_id: id, p_powod: powod, p_kto: user.id });
    if (error) { console.error("firma-panel odrzuc:", error.message); return J(500, { ok: false, blad: "Nie udało się." }); }
    if (!data || !data.ok) return J(409, { ok: false, blad: "Decyzja już zapadła." });
    const r = await sb.storage.from(KUBELEK).remove(data.pliki || []);
    if (r.error) console.error("firma-panel kasowanie:", r.error.message);
    return J(200, { ok: true });
  }
  if (body.akcja === "zatwierdz") {
    const { data: wiersz } = await sb.from("akcja_firmy_zgloszenia").select("logo_sciezka,status").eq("id", id).maybeSingle();
    if (!wiersz || wiersz.status !== "nowe") return J(409, { ok: false, blad: "Decyzja już zapadła." });
    let logoUrl = null, nowy = null;
    if (wiersz.logo_sciezka) {
      const rozsz = String(wiersz.logo_sciezka).split(".").pop() || "webp";
      const pob = await sb.storage.from(KUBELEK).download(wiersz.logo_sciezka);
      if (pob.error || !pob.data) { console.error("firma-panel pobranie logo:", pob.error && pob.error.message); return J(500, { ok: false, blad: "Nie udało się pobrać logo." }); }
      nowy = `${(d.noweId || (() => crypto.randomUUID()))()}.${rozsz}`;
      const up = await sb.storage.from(PUBLICZNY).upload(nowy, pob.data, { contentType: TYPY[rozsz] || "image/webp", upsert: false, cacheControl: "31536000" });
      if (up.error) { console.error("firma-panel kopia logo:", up.error.message); return J(500, { ok: false, blad: "Nie udało się skopiować logo." }); }
      logoUrl = sb.storage.from(PUBLICZNY).getPublicUrl(nowy).data.publicUrl;
    }
    const { data, error } = await sb.rpc("akcja_firmy_zatwierdz", { p_id: id, p_logo_url: logoUrl, p_kto: user.id });
    if (error || !data || !data.ok) {
      console.error("firma-panel zatwierdz:", (error && error.message) || (data && data.powod));
      if (nowy) { try { await sb.storage.from(PUBLICZNY).remove([nowy]); } catch (_) { /* osierocony plik logo jest niegroźny */ } }
      return J(error ? 500 : 409, { ok: false, blad: error ? "Nie udało się zapisać." : "Decyzja już zapadła." });
    }
    const r = await sb.storage.from(KUBELEK).remove(data.pliki || []);
    if (r.error) console.error("firma-panel kasowanie:", r.error.message);
    /* Podziękowanie: mail nie może zepsuć zatwierdzenia. */
    if (data.email && d.wyslijMaila) { try { await d.wyslijMaila(data.email, "Dziękujemy, logo jest na Ulicy", "Dziękujemy za wsparcie zbiórki. Logo Twojej firmy jest już na Ulicy. Pojawi się na stronie akcji w ciągu 2 minut: https://biegamy.run/dla-fabianka.html"); } catch (e) { console.error("firma-panel mail:", String(e)); } }
    return J(200, { ok: true });
  }
  return J(400, { ok: false, blad: "Nieznana akcja." });
}
export { KOMPLET_MAKS };

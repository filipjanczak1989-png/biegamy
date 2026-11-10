// Obsługa zgłoszeń firm bez Deno: te same funkcje wołają EF i testy (blizna-159). Klient bazy, push i mail są wstrzykiwane, więc przepływ da się sprawdzić bez sieci.
import { KOMPLET_MAKS, LOGO_BOK, ROZSZERZENIE, sprawdzCegielke, sprawdzPlik, sprawdzZgloszenie, wymiaryObrazu } from "./firma-zgloszenie.mjs";

export const KUBELEK = "firmy-zgloszenia", PUBLICZNY = "akcja-firmy-logo", WAZNOSC_S = 600;
const TYPY = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const RE_ID = /^[0-9a-f-]{36}$/;
const zl = (gr) => Math.round(Number(gr) / 100).toLocaleString("pl-PL").replace(/ /g, " ") + " zł";
const nazwaBudynku = (r) => (r === "wiezowiec" ? "wieżowiec" : "domek");

/** Treść pushu do Filipa. Kwota z formularza idzie tylko tutaj, publicznie wyłącznie za zgodą firmy. */
export function trescPushu(w, slug, id) {
  if (w.rodzaj === "cegielka") return { title: `${slug === "proba" ? "[próba] " : ""}Nowa cegiełka: ${w.nazwa}${w.zgoda_imie ? "" : " · bez imienia w murze"}`, body: "Dotknij, żeby zatwierdzić albo odrzucić.", url: `/trener.html#firma-zgloszenie=${id}`, type: "akcja", tag: `firma-${id}` };
  return { title: `${slug === "proba" ? "[próba] " : ""}Nowa firma: ${w.nazwa} · ${nazwaBudynku(w.rodzaj)} · ${zl(w.kwota_gr)}`, body: "Dotknij, żeby zatwierdzić albo odrzucić.", url: `/trener.html#firma-zgloszenie=${id}`, type: "akcja", tag: `firma-${id}` };
}

/* LIMIT PO WALIDACJI (Filip 10.11, A1): akcja_firmy_wpusc zapisuje próbę do akcja_firmy_proby (3 na godzinę z adresu), więc woła się ją dopiero wtedy, gdy zgłoszenie
   jest formalnie poprawne: pola, pliki po bajtach, wymiary i skalowanie logo są sprawdzone wcześniej. Trzy literówki nie blokują adresu na godzinę. Pułapka na boty
   i limit 5 MB (EF) zostają przed wszystkim. Progi do sprawdzenia kwoty czyta się z `akcje` przed RPC; gdy ten odczyt padnie, próg sprawdza się po RPC z jej odpowiedzi
   (wtedy jedna próba może pójść na zbyt niską kwotę, ale klient i tak odrzuca ją przed wysłaniem). */
async function progiAkcji(sb, slug) {
  try {
    const r = await sb.from("akcje").select("prog_domku_zl, prog_wiezowca_zl").eq("slug", slug).maybeSingle();
    return r && r.data && (r.data.prog_domku_zl != null || r.data.prog_wiezowca_zl != null) ? r.data : null;
  } catch (_) { return null; }
}
/** Ile minut do końca godzinnej blokady: najstarsza próba z ostatniej godziny (odczyt kluczem serwisowym). Brak odczytu → null (komunikat bez minut). */
export async function minutyBlokady(sb, ipSkrot, teraz) {
  try {
    const t = teraz || Date.now(), od = new Date(t - 3600000).toISOString();
    const r = await sb.from("akcja_firmy_proby").select("kiedy").eq("ip_skrot", ipSkrot).gt("kiedy", od).order("kiedy", { ascending: true }).limit(1);
    const k = r && r.data && r.data[0] && Date.parse(r.data[0].kiedy);
    if (!k) return null;
    return Math.max(1, Math.ceil((k + 3600000 - t) / 60000));
  } catch (_) { return null; }
}
export function komunikatLimitu(minuty) {
  return minuty ? `Za dużo zgłoszeń z tego adresu. Spróbuj za ${minuty} min.` : "Za dużo zgłoszeń z tego adresu. Spróbuj za godzinę.";
}
/** Przepuszczenie przez bazę: przełącznik akcji i limit na adres. → { status, body } przy odmowie, { wpusc } przy zgodzie. */
async function wpuscPrzezBaze(d, slug) {
  const sb = d.sb, J = (status, body) => ({ status, body });
  const { data: wpusc, error: bladWpusc } = await sb.rpc("akcja_firmy_wpusc", { p_ip: d.ipSkrot, p_slug: slug });
  if (bladWpusc || !wpusc) { console.error("firma-zgloszenie wpusc:", bladWpusc && bladWpusc.message); return J(500, { ok: false, blad: "Nie udało się. Spróbuj za chwilę." }); }
  if (!wpusc.ok) return wpusc.powod === "limit" ? J(429, { ok: false, blad: komunikatLimitu(await minutyBlokady(sb, d.ipSkrot, d.teraz)) }) : J(403, { ok: false, blad: "Zgłoszenia są teraz wyłączone." });
  return { wpusc };
}

/** Formularz ze strony akcji. d: { dane: FormData-podobne (get), ipSkrot, sb, moderacja, powiadom(payload), przeskaluj?(bytes) }. → { status, body }. Awaria pushu nie psuje zgłoszenia: lista czeka w panelu. */
export async function przyjmijZgloszenie(d) {
  const f = d.dane, sb = d.sb, J = (status, body) => ({ status, body });
  // Pułapka: pole niewidoczne dla człowieka. Bot dostaje „ok” i nic się nie dzieje.
  if (String(f.get("strona_www") || "").trim()) return J(200, { ok: true });
  const slug = f.get("slug") === "proba" ? "proba" : "dla-fabianka";
  if (f.get("rodzaj") === "cegielka") return przyjmijCegielke(d, slug);

  const pola = { rodzaj: f.get("rodzaj"), nazwa: f.get("nazwa"), link: f.get("link"), email: f.get("email"), zgoda: f.get("zgoda"), kwota: f.get("kwota"), zgoda_kwota: f.get("zgoda_kwota") };
  const progi = await progiAkcji(sb, slug);
  const p = sprawdzZgloszenie(pola, d.moderacja, progi);
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
  const zaDuze = Math.max(wym.w, wym.h) > LOGO_BOK;
  if (zaDuze && (typLogo === "image/webp" || !d.przeskaluj)) return J(400, { ok: false, blad: "Logo może mieć najwyżej 400 px na dłuższym boku. Wyślij PNG albo JPG." });

  /* Dopiero teraz baza: przełącznik i limit. Progi z odpowiedzi RPC są rozstrzygające (odczyt z `akcje` mógł paść albo próg mógł się zmienić). */
  const w = await wpuscPrzezBaze(d, slug);
  if (!w.wpusc) return w;
  if (!progi || progi.prog_domku_zl !== w.wpusc.prog_domku_zl || progi.prog_wiezowca_zl !== w.wpusc.prog_wiezowca_zl) {
    const p2 = sprawdzZgloszenie(pola, d.moderacja, w.wpusc);
    if (p2.blad) return J(400, { ok: false, blad: p2.blad });
  }
  /* Drogie dopiero za limitem (Filip 10.11): dekodowanie i skalowanie PNG/JPG > 400 px w czystym JS zostaje chronione limiterem jak dotąd. Przed limitem tylko tanie:
     pola, bajty, rozmiar, wymiary z nagłówka. Po A2 klient wysyła ≤ 400 px WebP, więc ta ścieżka jest rzadka (oryginał z drogi awaryjnej). */
  if (zaDuze) {
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

/* Cegiełka od osoby prywatnej (20261107_akcja_cegielka_zgloszenia): te same drzwi co firmy (przełącznik, limit 3/h, pułapka, push), ale tylko imię, zgoda na imię,
   zrzut wpłaty i opcjonalny e-mail. Zapis prosto do tabeli kluczem serwisowym: anon i zalogowani nie mają do niej dostępu, a CHECK-i w bazie są zamkiem. Zrzut zostaje prywatny. */
async function przyjmijCegielke(d, slug) {
  const f = d.dane, sb = d.sb, J = (status, body) => ({ status, body });
  const p = sprawdzCegielke({ imie: f.get("imie"), zgoda_imie: f.get("zgoda_imie"), email: f.get("email"), kwota: f.get("kwota") }, d.moderacja);
  if (p.blad) return J(400, { ok: false, blad: p.blad });
  const plikZrzut = f.get("zrzut");
  const zrzut = plikZrzut && plikZrzut.arrayBuffer ? new Uint8Array(await plikZrzut.arrayBuffer()) : null;
  const zz = sprawdzPlik(zrzut, "zrzut wpłaty");
  if (zz.blad) return J(400, { ok: false, blad: zz.blad });
  const w = await wpuscPrzezBaze(d, slug);   // limit dopiero po walidacji (A1)
  if (!w.wpusc) return w;
  const id = (d.noweId || (() => crypto.randomUUID()))(), sciezkaZrzut = `${id}/zrzut.${zz.rozszerzenie}`;
  const up = await sb.storage.from(KUBELEK).upload(sciezkaZrzut, zrzut, { contentType: zz.typ, upsert: false });
  if (up.error) { console.error("firma-zgloszenie upload cegiełki:", up.error.message); return J(500, { ok: false, blad: "Nie udało się zapisać pliku. Spróbuj za chwilę." }); }
  const { error } = await sb.from("akcja_firmy_zgloszenia").insert({ id, akcja_slug: slug, rodzaj: "cegielka", nazwa: p.wiersz.nazwa, email: p.wiersz.email, zrzut_sciezka: sciezkaZrzut, zgoda_na_wymienienie: p.wiersz.zgoda_imie, kwota_gr: p.wiersz.kwota_gr });
  if (error) {
    console.error("firma-zgloszenie zapis cegiełki:", error.message);
    try { await sb.storage.from(KUBELEK).remove([sciezkaZrzut]); } catch (_) { /* zostanie sprzątanie nocne */ }
    return J(400, { ok: false, blad: "Nie udało się zapisać zgłoszenia. Sprawdź dane." });
  }
  try { await d.powiadom(trescPushu(p.wiersz, slug, id)); } catch (e) { console.error("firma-zgloszenie push:", String(e)); }
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
    /* Złota cegła (20261109_akcja_po_starcie): baza ustawia ją z kwoty (od 100 zł), przełącznik w panelu może to zmienić. Błąd nie cofa zatwierdzenia: trener poprawi przy wpisie w murze. */
    if (data.cegla && typeof body.zlota === "boolean" && body.zlota !== data.zlota) {
      const z = await sb.from("akcja_cegielki").update({ zlota: body.zlota }).eq("id", data.cegla);
      if (z.error) console.error("firma-panel złota cegła:", z.error.message);
    }
    const r = await sb.storage.from(KUBELEK).remove(data.pliki || []);
    if (r.error) console.error("firma-panel kasowanie:", r.error.message);
    /* Podziękowanie: mail nie może zepsuć zatwierdzenia. */
    if (data.email && d.wyslijMaila && data.cegla) { try { await d.wyslijMaila(data.email, "Dziękujemy, Twoja cegiełka jest w murze", "Dziękujemy za wpłatę na zbiórkę. Twoja cegiełka stoi już w murze na Ulicy. Pojawi się na stronie akcji w ciągu 2 minut: https://biegamy.run/dla-fabianka.html"); } catch (e) { console.error("firma-panel mail:", String(e)); } }
    else if (data.email && d.wyslijMaila) { try { await d.wyslijMaila(data.email, "Dziękujemy, logo jest na Ulicy", "Dziękujemy za wsparcie zbiórki. Logo Twojej firmy jest już na Ulicy. Pojawi się na stronie akcji w ciągu 2 minut: https://biegamy.run/dla-fabianka.html"); } catch (e) { console.error("firma-panel mail:", String(e)); } }
    return J(200, { ok: true });
  }
  return J(400, { ok: false, blad: "Nieznana akcja." });
}
export { KOMPLET_MAKS };

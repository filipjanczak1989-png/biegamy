// OKIENKO 2.0 — E2: co zrobić z intencją (rozumienie.mjs) — przepisy w KODZIE, nie w modelu. Intencja → narzędzie v1 (waliduj/wykonaj
// z ../okienko/narzedzia.mjs, sloty → argumenty), stałe zdanie (pogoda, zdrowie, odmowa, opinia), katalog, impreza, osoba (TYLKO gdy slot
// osoby jest w pytaniu i wygląda na imię/nazwisko — B2), zywienie (produkt z bazy Jedzenia), o_nas (plik _shared/o-nas.mjs), chipy „Chodzi Ci o…?”.
// porada / fakt / sprzet / zywienie-bez-produktu → null → potok: WIEDZA Z SIECI (wiedza.mjs; Filip 3.11 15:25 cofnął „porada = model bez sieci”).
// null = intencja bez obsługi w tym etapie (nawigacja, rywal, gotowosc, porownaj → E5) → potok idzie ścieżką v1 (model z narzędziami).
import { waliduj, nawigacja } from "../okienko/narzedzia.mjs";
import { kalkulator, CHIPY_WYBORU, ODP_ZDROWIE, ODP_CHOROBA, ODP_ODMOWA, dodajDni, poniedzialek } from "../okienko/router.mjs";
import { zWyniku } from "../okienko/odpowiedz.mjs";
import { wygladaNaOsobeSlownik } from "../okienko/pamiec.mjs";
import { normalizuj } from "../okienko/router.mjs";
import { produktZPytania, szukajProduktu, zdanieProduktu } from "./produkt.mjs";
import { oNas } from "../_shared/o-nas.mjs";

export const ODP_POGODA = "Pogoda jest na kaflu Dziś — napisz „pogoda”, „pogoda jutro” albo „pogoda pojutrze”.";
export { ODP_ODMOWA };   // zdanie odmowy ma jedno źródło — router v1 (bramka przed modelem w obu wersjach)
export const ODP_OPINIA = "Nie oceniam ludzi — mogę pokazać wyniki i treningi z publicznych profili.";
export const ODP_OSOBA_BEZ_NAZWISKA = "Jeśli pytasz o osobę, napisz imię i nazwisko.";
export const ODP_KATALOG_PUSTY = "Nie znalazłem tego w aplikacji.";
export { DOPISEK_PORADY } from "./wiedza.mjs";   // porada idzie przez sieć (wiedza.mjs) — dopisek ma jedno źródło
export const ODP_O_NAS_OGOLNIE = "Pytasz o BiegaMy? Napisz „co to jest BiegaMy”, „kim jest Filip” albo „jak zostać podopiecznym”.";

/* etykiety chipów PISZE KOD (model nigdy nie pisze treści chipa) */
export const CHIPY_INTENCJI = {
  moj_plan: { etykieta: "Mój plan", pytanie: "Plan na jutro" },
  moje_treningi: { etykieta: "Moje treningi", pytanie: "Ile przebiegłem w tym tygodniu" },
  moje_starty: { etykieta: "Moje starty", pytanie: "Kiedy mam start" },
  moje_rekordy: { etykieta: "Rekordy", pytanie: "Moje rekordy" },
  moje_wyniki: { etykieta: "Wyniki", pytanie: "Moje wyniki" },
  moja_forma: { etykieta: "Forma", pytanie: "Jaka mam formę" },
  moj_trener: { etykieta: "Trener", pytanie: "Kto jest moim trenerem" },
  odznaki: { etykieta: "Odznaki", pytanie: "Jakie mam odznaki" },
  wyzwania: { etykieta: "Wyzwania", pytanie: "Pokaż wyzwania" },
  znajomi: { etykieta: "Znajomi", pytanie: "Moi znajomi co biegali" },
  osoby_z_miasta: { etykieta: "Z mojego miasta", pytanie: "Kto biega z mojego miasta" },
  osoba: { etykieta: "Osoba", pytanie: "Wpisz imię i nazwisko" },
  impreza: { etykieta: "Impreza", pytanie: "Wpisz nazwę biegu" },
  biegi_nadchodzace: { etykieta: "Biegi w kalendarzu", pytanie: "Jakie biegi w najbliższym miesiącu" },
  katalog: { etykieta: "W aplikacji", pytanie: "Gdzie są ustawienia" },
  kalkulator: { etykieta: "Kalkulator tempa", pytanie: "Jaki czas na 10 km w tempie 5:00" },
  pogoda: { etykieta: "Pogoda", pytanie: "Pogoda jutro" },
  porada: { etykieta: "Porada", pytanie: "Jak zacząć biegać" },
  zywienie: { etykieta: "Jedzenie", pytanie: "Co jeść przed długim biegiem" },
  sprzet: { etykieta: "Sprzęt", pytanie: "Jakie buty na asfalt" },
  o_nas: { etykieta: "O BiegaMy", pytanie: "Co to jest BiegaMy" },
  fakt: { etykieta: "Fakt ze świata biegania", pytanie: "Rekord świata w maratonie" },
  akcja: { etykieta: "Akcja", pytanie: "Co to za akcja" },
  gotowosc: { etykieta: "Gotowość na start", pytanie: "Jakie szanse na życiówkę" },
  najdluzszy: { etykieta: "Najdłuższy bieg", pytanie: "Jaki mam najdłuższy bieg" },
  porownaj: { etykieta: "Porównaj", pytanie: "Porównaj mnie z…" },
};
export function chipyDla(kandydaci = []) {
  const z = (Array.isArray(kandydaci) ? kandydaci : []).map((k) => CHIPY_INTENCJI[k]).filter(Boolean).slice(0, 4);
  return z.length >= 2 ? z : CHIPY_WYBORU;
}

const pusto = (tryb, extra = {}) => ({ zdania: [], karty: [], akcja: null, zrodla: [], narzedzia: [], tryb, koszt_tok: { we: 0, wy: 0 }, ...extra });
const NARZEDZIE_INTENCJI = { moje_starty: "moje_starty", moje_rekordy: "moje_rekordy", moja_forma: "moja_forma", moj_trener: "moj_trener",
  odznaki: "odznaki_moje", wyzwania: "wyzwania_postep", znajomi: "znajomi_tydzien", osoby_z_miasta: "osoby_z_miasta" };

function sobota(dzis) { const dow = new Date(dzis + "T12:00:00Z").getUTCDay(); return dow === 0 || dow === 6 ? dzis : dodajDni(dzis, 6 - dow); }

function argumenty(intencja, s, dzis) {
  if (intencja === "moj_plan") {
    if (s.data) return { narzedzie: "moj_plan", args: { data: s.data } };
    if (s.zakres === "weekend") return { narzedzie: "moj_plan", args: { data: sobota(dzis) } };
    return { narzedzie: "moj_plan", args: { zakres: ["dzis", "jutro", "tydzien", "nastepny_tydzien"].includes(s.zakres) ? s.zakres : "dzis" } };
  }
  if (intencja === "moje_treningi") {
    if (s.od && s.do) return { narzedzie: "moje_treningi", args: { od: s.od, do: s.do } };
    if (s.data) return { narzedzie: "moje_treningi", args: { od: s.data, do: s.data } };
    if (s.zakres === "nastepny_tydzien" || s.zakres === "tydzien") return { narzedzie: "moje_treningi", args: { od: poniedzialek(dzis), do: dzis } };
    return { narzedzie: "moje_treningi", args: { od: poniedzialek(dzis), do: dzis } };
  }
  if (intencja === "moje_wyniki") return { narzedzie: "moje_wyniki", args: s.miejsce ? { gdzie: s.miejsce } : {} };
  if (intencja === "biegi_nadchodzace") {
    const a = {};
    if (s.od) a.od = s.od; if (s.do) a.do = s.do; if (s.miejsce) { a.miejsce = s.miejsce; a.przy = "w"; } if (s.dystans) a.dystans = s.dystans;
    return { narzedzie: "biegi_nadchodzace", args: a };
  }
  if (NARZEDZIE_INTENCJI[intencja]) return { narzedzie: NARZEDZIE_INTENCJI[intencja], args: {} };
  return null;
}

/** @param {{tekst:string, sb:any, adm:any, athleteId:string, jwt:string, dzis:string, teraz:Date, fetchFn:Function, gemini:string, d:any,
      sieciDozwolona:Function, siecZeZrodlami:Function, AK?:any, AKK?:any, akcjaDane?:any}} ctx
    @param {{intencja:string, sloty:object, kandydaci:string[]}} r
    @returns {Promise<null | {status?:number, body:object, log:object}>} */
export async function wykonajIntencje(ctx, r) {
  const { tekst, sb, adm, athleteId, jwt, dzis, teraz, fetchFn, gemini, d } = ctx;
  const s = r.sloty || {}, t = normalizuj(tekst);
  const zdanie = (zd, narzedzie, extra = {}) => ({ body: { ...pusto("router"), zdania: [zd], ...extra }, log: { narzedzia: [narzedzie] } });

  const n = argumenty(r.intencja, s, dzis);
  if (n) {
    const w = waliduj(n.narzedzie, n.args);
    if (!w.ok) return null;
    let wynik;
    try { wynik = await d.wykonaj(sb, athleteId, n.narzedzie, w.args, teraz, { fetchFn, token: jwt }); } catch { return { status: 503, body: { blad: "narzędzie" }, log: { narzedzia: [n.narzedzie], ok: false } }; }
    const zw = zWyniku(n.narzedzie, wynik, w.args);
    return { body: { ...pusto("router"), zdania: zw.zdania, karty: zw.karty, akcja: zw.akcja !== undefined ? zw.akcja : nawigacja([n.narzedzie]), narzedzia: [n.narzedzie] },
      log: { narzedzia: [n.narzedzie], plan: [n.narzedzie] }, meta: { wyniki: [wynik], args: w.args, narzedzia: [n.narzedzie] } };
  }
  switch (r.intencja) {
    case "kalkulator": { const k = kalkulator(tekst); return k && k.zdanie ? zdanie(k.zdanie, "kalkulator") : null; }
    case "katalog": {
      let kat = null;
      try { kat = await d.szukajWKatalogu(sb, s.temat && s.temat !== tekst ? s.temat : tekst); } catch { kat = null; }
      if (!kat && s.temat) { try { kat = await d.szukajWKatalogu(sb, tekst); } catch { kat = null; } }
      if (kat) return { body: { ...pusto("router"), zdania: kat.zdania, karty: kat.karty, narzedzia: ["katalog"] }, log: { narzedzia: ["katalog"] } };
      return zdanie(ODP_KATALOG_PUSTY, "katalog", { chipy: chipyDla(["katalog", "porada", "moj_plan"]) });
    }
    case "impreza": {
      const q = s.impreza || tekst;
      const o = await d.odpowiedzImpreza({ sb, fetchFn, token: jwt, q, jawne: !!s.impreza, cena: /\b(koszt\w*|cen[aey]|wpisow\w*|ile kosztuje|oplat\w*)\b/.test(t), dzis,
        sieciDozwolona: ctx.sieciDozwolona, siec: ctx.siecZeZrodlami,
        zPamieci: () => d.zPamieci(adm, normalizuj(q), teraz), doPamieci: (z, zr) => d.doPamieci(adm, normalizuj(q), z, zr, "gemini-3.5-flash-lite", teraz),
        znaleziska: (w) => d.zapiszZnaleziska(adm, athleteId, w) });
      if (!o) return null;
      return { body: { ...pusto("impreza"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, koszt_tok: o.tok },
        log: { tryb: "impreza", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci, ok: o.f6 === "ok", powod_odrzucenia: o.powod } };
    }
    case "osoba": {
      // B2: slot osoby musi być w pytaniu i wyglądać na imię/nazwisko ze słownika — inaczej nie zgadujemy
      const q = String(s.osoba || "").trim();
      const wPytaniu = q && normalizuj(tekst).includes(normalizuj(q));
      if (!q || !wPytaniu || !wygladaNaOsobeSlownik(q)) return zdanie(ODP_OSOBA_BEZ_NAZWISKA, "osoba-bez-nazwiska", { chipy: chipyDla(["osoba", "znajomi", "osoby_z_miasta"]) });
      const o = await d.odpowiedzOsoba({ sb, athleteId, fetchFn, token: jwt, q, wprost: /\bkim jest\b|\bkto to\b/.test(t), gdzie: s.miejsce || null, sieciDozwolona: ctx.sieciDozwolona, siec: ctx.siecZeZrodlami });
      return { body: { ...pusto("osoba"), zdania: o.zdania, karty: o.karty, zrodla: o.zrodla, akcja: o.akcja, koszt_tok: o.tok },
        log: { tryb: "osoba", tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci, ok: o.f6 === "ok", powod_odrzucenia: o.nic ? "brak trafień: odpowiedź informacyjna" : o.powod } };
    }
    case "pogoda": return zdanie(ODP_POGODA, "pogoda");
    case "zdrowie": return zdanie(/\b(katar\w*|przezieb\w*|goraczk\w*|gryp\w*|chor\w*|kaszl\w*|infekcj\w*)\b/.test(t) ? ODP_CHOROBA : ODP_ZDROWIE, "zdrowie");
    case "odmowa": return zdanie(ODP_ODMOWA, "odmowa");
    case "opinia": return zdanie(ODP_OPINIA, "opinia");
    case "akcja": {
      if (!ctx.AK) return null;
      const z = ctx.AK.odpowiedzZagadki();
      let karty = [];
      if (ctx.AKK) { const k = ctx.AKK.kartaOkienka(ctx.akcjaDane); if (k) karty = [k]; }
      return { body: { ...pusto("router"), zdania: [z.zdanie], karty }, log: { narzedzia: ["zagadka"] } };
    }
    case "porada": case "sprzet": case "fakt": return null;   // WIEDZA Z SIECI (Filip 3.11 15:25): potok → wiedza.mjs (googleSearch, konkret, strażnik ogólników)
    case "zywienie": {   // produkt z bazy Jedzenia PRZED siecią (0 tokenów); brak → null → potok → sieć
      const nazwa = String(s.produkt || "").trim() || produktZPytania(tekst);
      if (!nazwa) return null;
      const p = await szukajProduktu(sb, nazwa);
      if (!p) return null;
      return { body: { ...pusto("router"), zdania: [zdanieProduktu(p)], narzedzia: ["produkt"], akcja: { nawiguj: "nutrition.html" } }, log: { narzedzia: ["produkt"], tryb: "v2" }, meta: null };   // zdanie deterministyczne z bazy — bez strażnika liczb
    }
    case "o_nas": {   // plik _shared/o-nas.mjs; klasyfikator mówi o_nas, a wzorzec nie trafia → podpowiedź, NIGDY sieć
      const on = oNas(tekst);
      if (on) return { body: { ...pusto("router"), zdania: on.zdania, akcja: on.akcja }, log: { narzedzia: ["o-nas"] }, meta: null };
      return zdanie(ODP_O_NAS_OGOLNIE, "o-nas", { chipy: chipyDla(["o_nas", "katalog", "porada"]) });
    }
    default: return null;   // fakt (potok: prosto do sieci), nawigacja, rywal, gotowosc, porownaj (E5), nie_wiem (potok: chipy)
  }
}

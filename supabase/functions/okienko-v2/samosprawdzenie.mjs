// OKIENKO 2.0 — E6: SAMOSPRAWDZENIE przed wysłaniem, deterministyczne, 0 tokenów (sędzia-model tylko na ławce, nigdy na prod).
// Czy odpowiedź dotyczy intencji: (a) użyte narzędzia ⊆ dozwolone dla intencji; (b) zdania niepuste; (c) każda liczba w zdaniach
// pochodzi z wyników narzędzi (ten sam strażnik co v1); (d) pytanie o okres → argumenty narzędzia obejmują ten okres;
// (e) pytanie o osobę → odpowiedź nazywa tę osobę (zdania albo karty). NIE → uczciwe „Nie mam tego w Twoich danych.” + chipy.
import { sprawdz, NIE_MAM } from "../okienko/straznik.mjs";
import { normalizuj } from "../okienko/router.mjs";

export const NARZEDZIA_INTENCJI = {
  moj_plan: ["moj_plan"], moje_treningi: ["moje_treningi"], moje_starty: ["moje_starty"], moje_rekordy: ["moje_rekordy"], moje_wyniki: ["moje_wyniki"],
  moja_forma: ["moja_forma"], moj_trener: ["moj_trener"], odznaki: ["odznaki_moje"], wyzwania: ["wyzwania_postep"], znajomi: ["znajomi_tydzien"],
  osoby_z_miasta: ["osoby_z_miasta"], biegi_nadchodzace: ["biegi_nadchodzace"], katalog: ["katalog"], kalkulator: ["kalkulator"],
  gotowosc: ["moje_starty", "moja_forma", "moje_treningi", "moje_rekordy"], najdluzszy: ["moje_treningi"], porownaj: ["osoba", "moje_wyniki"],
  zywienie: ["produkt"], o_nas: ["o-nas"],
};

/** @param {{intencja:string, sloty?:object, narzedzia?:string[], args?:object, zdania?:string[], karty?:any[], wyniki?:any[]}} o
    @returns {{ok:boolean, powod:string|null}} */
export function samosprawdz(o) {
  const dozw = NARZEDZIA_INTENCJI[o.intencja];
  const narz = Array.isArray(o.narzedzia) ? o.narzedzia : [];
  if (dozw && narz.some((n) => !dozw.includes(n))) return { ok: false, powod: "narzędzie spoza intencji: " + narz.filter((n) => !dozw.includes(n)).join(",") };
  const zdania = (Array.isArray(o.zdania) ? o.zdania : []).filter((z) => typeof z === "string" && z.trim());
  if (!zdania.length) return { ok: false, powod: "pusta odpowiedź" };
  if (narz.length && o.wyniki) {
    const s = sprawdz(zdania, (o.karty || []).length, o.wyniki);
    if (s.odrzucone.length) return { ok: false, powod: "liczba spoza narzędzi: " + s.odrzucone.map((x) => x.liczba).join(",") };
  }
  const sl = o.sloty || {}, a = o.args || {};
  if (sl.od && sl.do && a.od && a.do && (a.od > sl.od || a.do < sl.do)) return { ok: false, powod: `okres narzędzia ${a.od}–${a.do} nie obejmuje ${sl.od}–${sl.do}` };
  if (sl.data && a.od && a.do && (a.od > sl.data || a.do < sl.data)) return { ok: false, powod: `dzień ${sl.data} poza ${a.od}–${a.do}` };
  if (sl.osoba && (o.intencja === "osoba" || o.intencja === "porownaj")) {
    const imie = normalizuj(sl.osoba).split(" ")[0];
    const tekst = normalizuj(zdania.join(" ") + " " + JSON.stringify(o.karty || []));
    if (imie && !tekst.includes(imie) && !/nie ma nikogo|nie znalazlem/.test(tekst)) return { ok: false, powod: "odpowiedź nie nazywa osoby z pytania" };
  }
  return { ok: true, powod: null };
}

export const ODP_NIE_PRZESZLO = NIE_MAM;

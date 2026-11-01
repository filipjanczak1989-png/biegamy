// OKIENKO (M1 krok 2) — odpowiedź BEZ modelu: zdania z szablonów + karty z wyników narzędzi. Każda liczba w zdaniu
// pochodzi z wyniku narzędzia (ta sama zasada co strażnik cyfr modelu w kroku 3). Pusto → „Nie mam tego w Twoich danych."
export const NIE_MAM = "Nie mam tego w Twoich danych.";
import { ODP_BIEGI_PUSTO } from "./biegi.mjs";
import { ODP_F6_ZAJETA } from "./f6.mjs";
import "../../../js/tekst.mjs";
const T = /** @type {any} */ (globalThis).BM_TEKST;   // porządek 1.11: normalizacja, rdzeń, miesiące, odmiana — js/tekst.mjs

function odmiana(n, formy) { return T.odmiana(n, formy); }
const km = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const DZIEN = (d) => { const [r, m, dd] = d.split("-"); return `${Number(dd)}.${m}`; };
const MIES_MIEJSC = T.MIESIACE_MIEJSCOWNIK;
const DYSTANS_NAZWA = { "5": "5 km", "10": "10 km", "21": "półmaratonie", "42": "maratonie" };
function ostatniDzienMies(r, m) { return new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10); }
/** „W listopadzie" gdy zakres mieści się w jednym miesiącu i sięga jego końca; inaczej „Od 1.11 do 30.01". */
function opisZakresu(od, doD) {
  const [r, m] = od.split("-").map(Number);
  if (doD.slice(0, 7) === od.slice(0, 7) && doD === ostatniDzienMies(r, m)) return `W ${MIES_MIEJSC[m - 1]}`;
  // etap 5: zakres roczny (miasto/dystans bez miesiąca) — „od 1.11 do 1.11" bez roku wyglądało jak jeden dzień
  if (Math.round((Date.parse(doD + "T12:00:00Z") - Date.parse(od + "T12:00:00Z")) / 86400000) >= 364) return "W najbliższym roku";
  return `Od ${DZIEN(od)} do ${DZIEN(doD)}`;
}

/** wynik narzędzia → {zdania[], karty[]} */
export function zWyniku(nazwa, w, args = {}) {
  if (!w) return { zdania: [NIE_MAM], karty: [] };
  if (nazwa === "moj_plan") {
    const t = w.treningi || [];
    if (!t.length) {
      const stan = w.plan_pusty && w.plan_pusty.stan;
      const zakres = args.zakres === "jutro" ? "jutro" : args.zakres === "tydzien" ? "ten tydzień" : args.zakres === "nastepny_tydzien" ? "przyszły tydzień"
        : args.data ? DZIEN(w.od) : "dziś";
      if (stan === "generator") return { zdania: [`Nie masz jeszcze planu na ${zakres}. Mogę go ułożyć — trzy pytania.`], karty: [{ typ: "plan_pusty", dane: { stan, zakres } }] };
      if (stan === "trener") return { zdania: [`Trener nie ułożył jeszcze planu na ${zakres}.`], karty: [{ typ: "plan_pusty", dane: { stan, zakres } }] };
      if (stan === "wolne") return { zdania: [`Na ${zakres} plan przewiduje wolne.`], karty: [] };
      return { zdania: [NIE_MAM], karty: [] };
    }
    const karty = t.map((x) => ({ typ: "trening", dane: x }));
    if (w.od === w.do) {
      const x = t[0], kiedy = args.zakres === "jutro" ? "Jutro" : args.data ? DZIEN(w.od) : "Dziś";
      return { zdania: [`${kiedy}: ${x.typ}${x.dystans_km ? ", " + km(x.dystans_km) + " km" : ""}.`], karty };
    }
    return { zdania: [`W planie od ${DZIEN(w.od)} do ${DZIEN(w.do)}: ${t.length} ${odmiana(t.length, ["trening", "treningi", "treningów"])}.`], karty };
  }
  if (nazwa === "moje_treningi") {
    if (!w.liczba) return { zdania: [NIE_MAM], karty: [] };
    return { zdania: [`Od ${DZIEN(w.od)} do ${DZIEN(w.do)}: ${km(w.suma_km)} km biegu, ${w.liczba} ${odmiana(w.liczba, ["trening", "treningi", "treningów"])}.`],
      karty: (w.lista || []).slice(0, 5).map((x) => ({ typ: "trening", dane: x })) };
  }
  if (nazwa === "moje_starty") {
    const c = w.cele || [];
    if (!c.length) return { zdania: [NIE_MAM], karty: [] };
    const x = c[0], kiedy = x.dni_do === 0 ? "dziś" : x.dni_do === 1 ? "jutro" : `za ${x.dni_do} dni`;
    return { zdania: [`Najbliższy start: ${x.nazwa}, ${kiedy} (${DZIEN(x.data)}).`], karty: c.slice(0, 3).map((s) => ({ typ: "start", dane: s })) };
  }
  if (nazwa === "wyzwania_postep") {
    const a = (w.aktywne || []).filter((x) => x.procent > 0 && x.procent < 100).sort((p, q) => q.procent - p.procent);
    if (!a.length) return { zdania: ["Nie masz teraz wyzwania w toku."], karty: (w.aktywne || []).map((x) => ({ typ: "wyzwanie", dane: x })) };
    return { zdania: [`Najbliżej ukończenia: ${a[0].nazwa}, ${a[0].procent}%.`], karty: (w.aktywne || []).map((x) => ({ typ: "wyzwanie", dane: x })) };
  }
  if (nazwa === "moje_rekordy") {
    const r = w.rekordy || [];
    const zdania = [];
    if (w.szanse) {
      const s = w.start;
      if (s) {
        const kiedy = s.dni_do === 0 ? "dziś" : s.dni_do === 1 ? "jutro" : `za ${s.dni_do} dni`;
        zdania.push(`Najbliższy start: ${s.nazwa}, ${kiedy} (${DZIEN(s.data)}).`);
        const pb = s.dystans_km ? r.find((x) => Math.abs(x.km - s.dystans_km) <= x.km * 0.03) : null;
        if (pb) zdania.push(`Twój rekord na tym dystansie: ${pb.czas}${pb.rok ? ` (${pb.rok})` : ""}.`);
      } else zdania.push("Nie masz wpisanego najbliższego startu.");
    }
    if (w.wybor) return { zdania: ["Nie masz wpisanych rekordów. Maszyna wyników zna kilka osób o Twoim imieniu i nazwisku — który to Ty?"], karty: [{ typ: "ktory_to_ty", dane: { opcje: w.wybor } }], akcja: null };
    if (!r.length) return { zdania: [...zdania, w.blad_f6 === "limit" ? ODP_F6_ZAJETA : "Nie masz jeszcze wpisanych rekordów — uzupełnisz je w Profilu."].slice(0, 2), karty: [] };
    const zWynikow = w.zrodlo === "wyniki";
    if (!w.szanse) zdania.push((zWynikow ? "Twoje najlepsze czasy z wyników zawodów: " : "Twoje rekordy: ") + r.map((x) => `${x.dystans} ${x.czas}${x.rok ? ` (${x.rok})` : ""}`).join(", ") + ".");
    return { zdania: zdania.slice(0, 2), karty: r.map((x) => ({ typ: "rekord", dane: { dystans: x.dystans, czas: x.czas, rok: x.rok, bieg: x.bieg || null, zrodlo: x.zrodlo || "profil" } })) };
  }
  // ── M3-2 (a) ──
  if (nazwa === "moja_forma") {
    if (!w.logi) return { zdania: ["Za mało treningów z ostatnich 90 dni, żeby policzyć formę."], karty: [] };
    const zdania = [`Forma: TSB ${w.tsb >= 0 ? "+" : ""}${w.tsb} (${w.etykieta}), CTL ${w.ctl}, ATL ${w.atl}.`];
    if (w.tytul) zdania.push(w.tytul);   // zdanie ze słownika stanów (ten sam tekst co kafel Forma), nigdy porada spoza niego
    return { zdania, karty: [{ typ: "forma", dane: { tsb: w.tsb, ctl: w.ctl, atl: w.atl, etykieta: w.etykieta, tytul: w.tytul, pod: w.pod } }] };
  }
  if (nazwa === "znajomi_tydzien") {
    if (!w.znajomi) return { zdania: ["Nie masz jeszcze znajomych w BiegaMy."], karty: [] };
    if (!w.publiczni) return { zdania: ["Twoi znajomi mają prywatne profile — ich treningów nie widzę."], karty: [] };
    if (!w.biegali) return { zdania: [`Od ${DZIEN(w.od)} nikt ze znajomych z publicznym profilem nie zapisał treningu.`], karty: [] };
    const kto = (w.osoby || []).slice(0, 3).map((o) => `${o.nazwa} ${km(o.km)} km`).join(", ");
    return { zdania: [`Od ${DZIEN(w.od)} trenowało ${w.biegali} z ${w.znajomi} ${odmiana(w.znajomi, ["znajomego", "znajomych", "znajomych"])} (profile publiczne): ${kto}.`],
      karty: (w.osoby || []).map((o) => ({ typ: "znajomy", dane: o })) };
  }
  if (nazwa === "osoby_z_miasta") {
    if (!w.miasto) return { zdania: ["Ustaw miasto w Profilu, to pokażę, kto biega w Twojej okolicy."], karty: [], akcja: { nawiguj: "profil.html" } };
    if (!w.liczba) return { zdania: [`W BiegaMy nikt inny z publicznym profilem nie podał miasta ${w.miasto}.`], karty: [] };
    return { zdania: [`Z miasta ${w.miasto} biega w BiegaMy ${w.liczba} ${odmiana(w.liczba, ["osoba", "osoby", "osób"])} z publicznym profilem.`],
      karty: (w.osoby || []).map((o) => ({ typ: "osoba", dane: o })) };
  }
  if (nazwa === "moj_trener") {
    if (!w.trener) return { zdania: ["Trenujesz bez trenera w BiegaMy."], karty: [], akcja: null };
    return { zdania: [`Twój trener: ${w.trener.nazwa}.`], karty: [{ typ: "trener", dane: w.trener }] };
  }
  if (nazwa === "moje_wyniki") {
    if (w.blad_f6 === "limit") return { zdania: [ODP_F6_ZAJETA], karty: [] };
    if (w.brak_imienia) return { zdania: ["Uzupełnij imię i nazwisko w Profilu, to znajdę Twoje wyniki."], karty: [], akcja: { nawiguj: "profil.html" } };
    if (w.brak) return { zdania: ["Maszyna wyników nie zna jeszcze Twoich startów."], karty: [] };
    if (w.brak_gdzie) return { zdania: [`Nie znalazłem Twojego startu: ${w.gdzie}.`], karty: [] };
    if (w.wybor) return { zdania: ["Maszyna wyników zna kilka osób o Twoim imieniu i nazwisku. Który to Ty?"], karty: [{ typ: "ktory_to_ty", dane: { opcje: w.wybor } }], akcja: null };
    const n = w.wyniki && w.wyniki.starty;
    return { zdania: [w.gdzie ? `Twoje starty: ${w.gdzie}.` : `Maszyna wyników zna ${n} ${odmiana(n, ["Twój start", "Twoje starty", "Twoich startów"])}.`],
      karty: [{ typ: "wyniki", dane: { ...w.wyniki, inne: [] } }] };
  }
  if (nazwa === "biegi_nadchodzace") {
    if (w.blad_f6 === "limit") return { zdania: [ODP_F6_ZAJETA], karty: [] };
    const kiedy = opisZakresu(w.od, w.do);
    const gdzie = w.miejsce ? (w.przy ? ` ${w.przy} ${w.miejsce.charAt(0).toUpperCase() + w.miejsce.slice(1)}` : ` (miejsce: ${w.miejsce})`) : "";
    if (!w.liczba) {   // M3-1 (2): pusto z ZAKRESEM — „nie ma biegów od 1.11 do 30.01 w Krakowie", nie „w tym zakresie"
      if (!w.od || !w.do) return { zdania: [ODP_BIEGI_PUSTO], karty: [] };
      const dystP = w.dystans_km ? ` na ${DYSTANS_NAZWA[String(Math.round(w.dystans_km))] || km(w.dystans_km) + " km"}` : "";
      return { zdania: [`Maszyna wyników nie ma biegów ${kiedy.charAt(0).toLowerCase() + kiedy.slice(1)}${gdzie}${dystP}.`], karty: [] };
    }
    const ile = `${w.liczba} ${odmiana(w.liczba, ["bieg", "biegi", "biegów"])}`;
    const dyst = w.dystans_km ? ` na ${DYSTANS_NAZWA[String(Math.round(w.dystans_km))] || km(w.dystans_km) + " km"}` : "";
    return { zdania: [`${kiedy}${gdzie}${dyst} maszyna wyników zna ${ile}.`], karty: (w.biegi || []).map((b) => ({ typ: "impreza", dane: b })) };
  }
  if (nazwa === "odznaki_moje") {
    if (!w.liczba) return { zdania: [NIE_MAM], karty: [] };
    return { zdania: [`Masz ${w.liczba} ${odmiana(w.liczba, ["odznakę", "odznaki", "odznak"])}.`], karty: (w.ostatnie || []).map((x) => ({ typ: "odznaka", dane: x })) };
  }
  return { zdania: [NIE_MAM], karty: [] };
}

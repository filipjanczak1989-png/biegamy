// OKIENKO (M1, 1.11.2026) — narzędzia „Zapytaj": JEDNO źródło dla deklaracji wysyłanych do Gemini, walidacji argumentów
// i wykonania. Wszystko TYLKO DO ODCZYTU, klientem Supabase z JWT użytkownika (RLS) — ten moduł nie pisze nigdzie
// (blizna-64 sprawdza to statycznie). Zakresy dat liczy EF w Europe/Warsaw, nie model. Model nie wybiera URL-i:
// `nawigacja()` dokłada akcję deterministycznie ze słownika EKRANY na podstawie użytych narzędzi.
//
// Moduł czysty (bez Deno.*, bez fetch) — ładuje go i EF (Deno), i testy (node --test).
import { WYZWANIA } from "../_shared/wyzwania.mjs";
import { isRunType } from "../_shared/reguly-treningow.mjs";
import { nazwaOdznaki } from "../_shared/odznaki-nazwy.mjs";
import { biegiNadchodzace, domyslnyZakres, dniMiedzy as dniBiegow, MAX_DNI_BIEGOW } from "./biegi.mjs";
import { BladF6 } from "./f6.mjs";

export const TYPY_TRENINGU = ["Spokojny", "Interwały", "Tempo", "Wybieganie", "Regeneracja", "Wzmacniający", "Start", "Zastępczy", "Odpoczynek"];
export const MAX_DNI = 366;
export const MAX_LISTA = 20;

/* Słownik ekranów (ZWIAD M0, 1.11.2026 — adresy, które aplikacja dziś przyjmuje; #plan w zawodnik.html NIE istnieje). */
export const EKRANY = {
  dzis: "zawodnik.html", plan: "kalendarz.html?role=athlete", log: "zawodnik.html?log=1", historia: "zawodnik.html#log-list",
  forma: "zawodnik.html?tab=forma", spolecznosc: "zawodnik.html?tab=social", czat: "zawodnik.html?tab=msgs",
  cialo: "zawodnik.html?tab=cwiczenia", statystyki: "zawodnik.html?tab=stats", profil: "profil.html", jedzenie: "nutrition.html",
  starty: "races.html", wyzwania: "wyzwania.html", odznaki: "odznaki.html", radio: "radio.html",
};
const EKRAN_NARZEDZIA = { moj_plan: "plan", moje_treningi: "historia", moje_starty: "starty", wyzwania_postep: "wyzwania", odznaki_moje: "odznaki" };

/* Deklaracje funkcji dla Gemini (tools[].functionDeclarations) — podzbiór OpenAPI. */
export const DEKLARACJE = [
  { name: "moj_plan", description: "Treningi z planu biegacza na dziś, jutro, ten albo następny tydzień, albo na podaną datę.",
    parameters: { type: "object", properties: {
      zakres: { type: "string", enum: ["dzis", "jutro", "tydzien", "nastepny_tydzien"] },
      data: { type: "string", description: "YYYY-MM-DD — konkretny dzień zamiast zakresu" } } } },
  { name: "moje_treningi", description: "Wykonane treningi biegacza w przedziale dat: suma kilometrów biegowych, liczba, do 20 ostatnich.",
    parameters: { type: "object", properties: {
      od: { type: "string", description: "YYYY-MM-DD, włącznie" }, do: { type: "string", description: "YYYY-MM-DD, włącznie" },
      typ: { type: "string", enum: TYPY_TRENINGU } }, required: ["od", "do"] } },
  { name: "moje_starty", description: "Nadchodzące starty (cele startowe) biegacza z liczbą dni do startu.",
    parameters: { type: "object", properties: {} } },
  { name: "wyzwania_postep", description: "Aktywne wyzwania biegacza z procentem postępu i najbliższe ukończenia.",
    parameters: { type: "object", properties: {} } },
  { name: "odznaki_moje", description: "Liczba zdobytych odznak i 5 ostatnio zdobytych.",
    parameters: { type: "object", properties: {} } },
  { name: "biegi_nadchodzace", description: "Nadchodzące biegi i zawody w Polsce z maszyny wyników (kalendarz imprez): w przedziale dat, opcjonalnie w miejscowości i na dystansie.",
    parameters: { type: "object", properties: {
      od: { type: "string", description: "YYYY-MM-DD, włącznie (domyślnie dziś)" }, do: { type: "string", description: "YYYY-MM-DD, włącznie (domyślnie +90 dni)" },
      miejsce: { type: "string", description: "miejscowość, np. Poznań" }, dystans: { type: "string", enum: ["5", "10", "21", "42"] } } } },
];
export const NAZWY = DEKLARACJE.map((d) => d.name);

// ── daty w Europe/Warsaw ─────────────────────────────────────────────────────
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
export function dzisWaw(teraz = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(teraz);
}
function dodajDni(d, n) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function dniMiedzy(a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); }
function poniedzialek(d) { const dow = new Date(d + "T12:00:00Z").getUTCDay(); return dodajDni(d, -((dow + 6) % 7)); }
/** Granica doby Warszawy w UTC (ISO) — do filtrów po timestamptz (logged_at). */
/* Przesunięcie liczone dla PÓŁNOCY, nie południa: w dzień zmiany na czas letni (ostatnia niedziela marca) północ jest
   jeszcze w UTC+1, a południe już w UTC+2 — liczenie z południa ucinało pierwszą godzinę doby (blizna-64). Warszawa ma
   tylko +1 albo +2, więc sprawdzamy oba i bierzemy ten, który daje lokalnie 00:00 tego dnia. */
const FMT_WAW = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function poczatekDniaWaw(d) {
  const polnocUtc = Date.parse(d + "T00:00:00Z");
  for (const h of [1, 2]) {
    const t = new Date(polnocUtc - h * 3600000);
    const p = Object.fromEntries(FMT_WAW.formatToParts(t).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === d && p.hour === "00" && p.minute === "00") return t.toISOString();
  }
  throw new Error("poczatekDniaWaw: brak północy dla " + d);
}
function poprawnaData(s) { return typeof s === "string" && RE_DATA.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z")) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s; }

// ── walidacja ────────────────────────────────────────────────────────────────
/** {ok:true, args} albo {ok:false, blad} — błąd = 400 w EF, nie wyjątek. Nieznane pola odpadają. */
export function waliduj(nazwa, args = {}) {
  if (!NAZWY.includes(nazwa)) return { ok: false, blad: "nieznane narzędzie" };
  const a = args && typeof args === "object" ? args : {};
  if (nazwa === "moj_plan") {
    if (a.data != null) return poprawnaData(a.data) ? { ok: true, args: { data: a.data } } : { ok: false, blad: "zła data" };
    const zakres = a.zakres || "dzis";
    return ["dzis", "jutro", "tydzien", "nastepny_tydzien"].includes(zakres) ? { ok: true, args: { zakres } } : { ok: false, blad: "zły zakres" };
  }
  if (nazwa === "moje_treningi") {
    if (!poprawnaData(a.od) || !poprawnaData(a.do)) return { ok: false, blad: "zła data" };
    const dni = dniMiedzy(a.od, a.do);
    if (dni < 0) return { ok: false, blad: "od po do" };
    if (dni + 1 > MAX_DNI) return { ok: false, blad: "zakres ponad " + MAX_DNI + " dni" };
    if (a.typ != null && !TYPY_TRENINGU.includes(a.typ)) return { ok: false, blad: "zły typ" };
    return { ok: true, args: a.typ ? { od: a.od, do: a.do, typ: a.typ } : { od: a.od, do: a.do } };
  }
  if (nazwa === "biegi_nadchodzace") {
    const out = {};
    if (a.od != null || a.do != null) {
      if (!poprawnaData(a.od) || !poprawnaData(a.do)) return { ok: false, blad: "zła data" };
      const dni = dniBiegow(a.od, a.do);
      if (dni < 0) return { ok: false, blad: "od po do" };
      if (dni + 1 > MAX_DNI_BIEGOW) return { ok: false, blad: "zakres ponad " + MAX_DNI_BIEGOW + " dni" };
      out.od = a.od; out.do = a.do;
    }
    if (a.miejsce != null) {
      const m = String(a.miejsce).trim();
      if (!/^[\p{L}][\p{L} .-]{1,39}$/u.test(m)) return { ok: false, blad: "złe miejsce" };
      out.miejsce = m;
      if (a.przy != null) { if (!["w", "we", "na", "pod", "koło", "kolo", "obok", "w okolicach"].includes(String(a.przy).toLowerCase())) return { ok: false, blad: "zły przyimek" }; out.przy = String(a.przy).toLowerCase(); }
    }
    if (a.dystans != null) { if (!["5", "10", "21", "42"].includes(String(a.dystans))) return { ok: false, blad: "zły dystans" }; out.dystans = String(a.dystans); }
    return { ok: true, args: out };
  }
  return { ok: true, args: {} };
}

/** Zakres dat planu: [od, do] (włącznie). */
export function zakresPlanu(args, dzis) {
  if (args.data) return [args.data, args.data];
  if (args.zakres === "jutro") { const j = dodajDni(dzis, 1); return [j, j]; }
  if (args.zakres === "tydzien") { const p = poniedzialek(dzis); return [p, dodajDni(p, 6)]; }
  if (args.zakres === "nastepny_tydzien") { const p = dodajDni(poniedzialek(dzis), 7); return [p, dodajDni(p, 6)]; }
  return [dzis, dzis];
}

function celeZRaceGoals(raw) {   // ten sam kształt co czytajRaceGoals w sb.js: tablica obiektów; śmieci odpadają
  let v = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return []; } }
  return Array.isArray(v) ? v.filter((g) => g && typeof g === "object") : [];
}
const zaokr = (x) => Math.round(x * 10) / 10;

// ── wykonanie (TYLKO ODCZYT) ─────────────────────────────────────────────────
/** sb = klient z JWT użytkownika; athleteId = athletes.id tego użytkownika (EF ustala go z sesji, NIE z modelu).
    f6ctx = {fetchFn, token} — tylko dla narzędzi z maszyny wyników (M3a); token użytkownika, nigdy od modelu. */
/** @param {any} sb @param {string} athleteId @param {string} nazwa @param {any} args @param {Date} [teraz]
    @param {{fetchFn: Function, token: string} | null} [f6ctx] */
export async function wykonaj(sb, athleteId, nazwa, args, teraz = new Date(), f6ctx = null) {
  const dzis = dzisWaw(teraz);
  if (nazwa === "biegi_nadchodzace") {
    if (!f6ctx || !f6ctx.token) throw new Error("brak tokenu F6");
    const z = args.od ? { od: args.od, do: args.do } : domyslnyZakres(dzis);
    try {
      const w = await biegiNadchodzace(f6ctx.fetchFn, f6ctx.token, { ...z, miejsce: args.miejsce, dystans: args.dystans }, teraz.getTime());
      return { ...w, przy: args.przy || null };
    } catch (e) {
      if (e instanceof BladF6 && e.kod === "limit") return { ...z, blad_f6: "limit", biegi: [], liczba: 0 };
      throw e;
    }
  }
  if (nazwa === "moj_plan") {
    const [od, doD] = zakresPlanu(args, dzis);
    const { data, error } = await sb.from("trainings").select("date,type,description,distance_km,duration_min,pace,status")
      .eq("athlete_id", athleteId).gte("date", od).lte("date", doD).order("date", { ascending: true });
    if (error) throw new Error("trainings");
    return { od, do: doD, treningi: (data || []).map((t) => ({ data: t.date, typ: t.type, opis: t.description || null,
      dystans_km: t.distance_km != null ? Number(t.distance_km) : null, czas_min: t.duration_min ?? null, tempo: t.pace || null, status: t.status || null })) };
  }
  if (nazwa === "moje_treningi") {
    let q = sb.from("training_logs").select("logged_at,training_type,distance_km,duration,pace").eq("athlete_id", athleteId)
      .not("training_type", "like", "__badge__%").gte("logged_at", poczatekDniaWaw(args.od)).lt("logged_at", poczatekDniaWaw(dodajDni(args.do, 1)))
      .order("logged_at", { ascending: false });
    if (args.typ) q = q.eq("training_type", args.typ);
    const { data, error } = await q;
    if (error) throw new Error("training_logs");
    const logi = data || [];
    const suma = logi.reduce((s, l) => s + (isRunType(l.training_type) ? (parseFloat(l.distance_km) || 0) : 0), 0);
    return { od: args.od, do: args.do, suma_km: zaokr(suma), liczba: logi.length,
      lista: logi.slice(0, MAX_LISTA).map((l) => ({ data: dzisWaw(new Date(l.logged_at)), typ: l.training_type,
        km: l.distance_km != null ? zaokr(parseFloat(l.distance_km) || 0) : null, czas: l.duration || null, tempo: l.pace || null })) };
  }
  if (nazwa === "moje_starty") {
    const { data: ath, error } = await sb.from("athletes").select("race_goals").eq("id", athleteId).maybeSingle();
    if (error) throw new Error("athletes");
    const cele = celeZRaceGoals(ath && ath.race_goals).filter((g) => poprawnaData(String(g.date || "").slice(0, 10)) && String(g.date).slice(0, 10) >= dzis);
    const ids = [...new Set(cele.map((g) => g.race_id).filter(Boolean))];
    const miasta = {};
    if (ids.length) {
      const { data: r } = await sb.from("races").select("id,city").in("id", ids);
      for (const x of r || []) miasta[x.id] = x.city || null;
    }
    return { cele: cele.map((g) => { const d = String(g.date).slice(0, 10);
      return { nazwa: String(g.name || "").slice(0, 120), data: d, miasto: (g.race_id && miasta[g.race_id]) || null, race_id: g.race_id || null, dni_do: dniMiedzy(dzis, d) }; })
      .sort((a, b) => a.data.localeCompare(b.data)) };
  }
  if (nazwa === "wyzwania_postep") {
    const A = WYZWANIA.aktywne(teraz);
    const { data, error } = await sb.from("training_logs").select("distance_km,logged_at,training_type,pace").not("training_type", "like", "__badge__%")
      .eq("athlete_id", athleteId).gte("logged_at", A.mS.toISOString());
    if (error) throw new Error("training_logs");
    const p = WYZWANIA.postep(data || [], teraz);
    const pozycja = (ch, klucz, okres) => ({ id: ch.id, nazwa: ch.title, okres, cel: ch.target, jednostka: ch.unit, postep: zaokr(p[klucz] || 0), procent: WYZWANIA.pct(ch, p[klucz]) });
    return { najblizsze_procent: WYZWANIA.najblizsze(data || [], teraz),
      aktywne: [...A.tydzien.map((ch) => pozycja(ch, ch.id, "tydzien")), ...A.miesiac.map((ch) => pozycja(ch, "m_" + ch.id, "miesiac"))] };
  }
  if (nazwa === "odznaki_moje") {
    const { data, count, error } = await sb.from("achievements").select("badge_id,earned_at", { count: "exact" })
      .eq("athlete_id", athleteId).order("earned_at", { ascending: false }).limit(5);
    if (error) throw new Error("achievements");
    return { liczba: count ?? (data || []).length,
      ostatnie: (data || []).map((a) => ({ id: a.badge_id, nazwa: nazwaOdznaki(a.badge_id), data: a.earned_at ? dzisWaw(new Date(a.earned_at)) : null })) };
  }
  throw new Error("nieznane narzędzie");
}

/** Akcja „Otwórz ›" — z użytych narzędzi, nigdy od modelu. Pierwsze narzędzie z ekranem wygrywa. */
export function nawigacja(uzyte = []) {
  for (const n of uzyte) if (EKRAN_NARZEDZIA[n]) return { nawiguj: EKRANY[EKRAN_NARZEDZIA[n]] };
  return null;
}

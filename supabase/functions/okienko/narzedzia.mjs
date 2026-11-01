// OKIENKO (M1, 1.11.2026) — narzędzia „Zapytaj": JEDNO źródło dla deklaracji wysyłanych do Gemini, walidacji argumentów
// i wykonania. Wszystko TYLKO DO ODCZYTU, klientem Supabase z JWT użytkownika (RLS) — ten moduł nie pisze nigdzie
// (blizna-64 sprawdza to statycznie). Zakresy dat liczy EF w Europe/Warsaw, nie model. Model nie wybiera URL-i:
// `nawigacja()` dokłada akcję deterministycznie ze słownika EKRANY na podstawie użytych narzędzi.
//
// Moduł czysty (bez Deno.*, bez fetch) — ładuje go i EF (Deno), i testy (node --test).
import { WYZWANIA } from "../_shared/wyzwania.mjs";
import { isRunType, formaSeria } from "../_shared/reguly-treningow.mjs";
import { nazwaOdznaki, opisOdznaki } from "../_shared/odznaki-nazwy.mjs";
import "../../../js/forma-stany.mjs";   // M3-2: zdania stanów formy = te same co kafel Forma (sb.js)
import { biegiNadchodzace, domyslnyZakres, dniMiedzy as dniBiegow, MAX_DNI_BIEGOW } from "./biegi.mjs";
import { BladF6 } from "./f6.mjs";
import { stanPlanu } from "../../../js/plan-pusty.mjs";
import { mojeRekordy, mojeWyniki, rekordyZWynikow } from "./moje.mjs";   // M3b: ta sama reguła co CTA „Ułóż plan" na Dziś
const STANY_FORMY = /** @type {any} */ (globalThis).BM_FORMA_STANY;

export const TYPY_TRENINGU = ["Spokojny", "Interwały", "Tempo", "Wybieganie", "Regeneracja", "Wzmacniający", "Start", "Zastępczy", "Odpoczynek"];
export const MAX_DNI = 366;
export const MAX_LISTA = 20;
export const DNI_LOGOW_FORMY = 120;   // M3-2: formaSeria liczy 90 dni, seed bierze z początku bloku — czytamy z zapasem
export const MAX_OSOB_MIASTA = 5;     // jak Społeczność: ≤ 5 kart

/* Słownik ekranów (ZWIAD M0, 1.11.2026 — adresy, które aplikacja dziś przyjmuje; #plan w zawodnik.html NIE istnieje). */
export const EKRANY = {
  dzis: "zawodnik.html", plan: "kalendarz.html?role=athlete", log: "zawodnik.html?log=1", historia: "zawodnik.html#log-list",
  forma: "zawodnik.html?tab=forma", spolecznosc: "zawodnik.html?tab=social", czat: "zawodnik.html?tab=msgs",
  cialo: "zawodnik.html?tab=cwiczenia", statystyki: "zawodnik.html?tab=stats", profil: "profil.html", jedzenie: "nutrition.html",
  starty: "races.html", wyzwania: "wyzwania.html", odznaki: "odznaki.html", radio: "radio.html",
};
/* Nazwy ekranów — muszą być równe NAZWY_EKRANOW w js/okienko.js (blizna-76, jak EKRANY w blizna-65); katalog M3c. */
export const NAZWY_EKRANOW = {
  dzis: "Dziś", plan: "Plan", log: "Zapisz trening", historia: "Ostatnie treningi", forma: "Forma", spolecznosc: "Społeczność",
  czat: "Czat", cialo: "Ćwiczenia", statystyki: "Statystyki", profil: "Profil", jedzenie: "Jedzenie", starty: "Starty",
  wyzwania: "Wyzwania", odznaki: "Odznaki", radio: "Radio",
};
/* M3-2 (c): słowa-klucze ekranów — czym ludzie nazywają to, co na ekranie jest („zegarek" → Profil, bo tam łączy się
   intervals.icu; „zdjęcie" → Profil, bo tam jest awatar). Tylko rzeczy, które NA TYM EKRANIE SĄ (zwiad 1.11); hasła tu nie
   ma — aplikacja nie ma zmiany hasła (katalog.mjs O_APLIKACJI mówi to wprost). Czyta katalog (kat_ekran) i router („otwórz
   ustawienia"). */
export const SYNONIMY_EKRANOW = {
  profil: ["ustawienia", "zegarek", "garmin", "polar", "coros", "intervals", "zdjecie", "awatar", "avatar", "miasto", "prywatnosc", "rocznik", "konto", "imie", "nazwisko", "cele", "cel startowy"],
  log: ["zapisz trening", "dodaj trening", "wpisz trening", "zapisac trening"], czat: ["wiadomosc", "wiadomosci", "napisz do trenera"],
  jedzenie: ["przepisy", "dieta", "posilek", "posilki"], radio: ["muzyka", "utwory", "piosenki"], statystyki: ["wykresy", "statystyka"],
  cialo: ["rozciaganie", "wzmacnianie", "oddech", "core", "mobilnosc"], spolecznosc: ["znajomi", "znajomych", "biegacze", "tablica"],
  starty: ["zawody", "kalendarz startow"], historia: ["dziennik", "historia treningow"], forma: ["tsb", "ctl", "atl", "zmeczenie"],
};
const EKRAN_NARZEDZIA = { moj_plan: "plan", moje_treningi: "historia", moje_starty: "starty", wyzwania_postep: "wyzwania", odznaki_moje: "odznaki",
  moje_rekordy: "profil", moje_wyniki: "starty", moj_trener: "czat", moja_forma: "forma", znajomi_tydzien: "spolecznosc", osoby_z_miasta: "spolecznosc" };

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
  { name: "moje_rekordy", description: "Rekordy życiowe biegacza (5 km, 10 km, półmaraton, maraton) z rokiem; szanse=true dokłada najbliższy start (bez prognozy czasu).",
    parameters: { type: "object", properties: { szanse: { type: "boolean" } } } },
  { name: "moje_wyniki", description: "Wyniki zawodów biegacza z maszyny wyników (po imieniu, nazwisku i roczniku z profilu); gdzie = miejscowość albo nazwa biegu.",
    parameters: { type: "object", properties: { gdzie: { type: "string", description: "np. Dębno" } } } },
  { name: "moj_trener", description: "Kto jest trenerem biegacza w BiegaMy (imię i nazwisko trenera) albo informacja, że biegacz trenuje bez trenera.",
    parameters: { type: "object", properties: {} } },
  { name: "moja_forma", description: "Aktualna forma biegacza: TSB (świeżość), CTL (forma długa), ATL (zmęczenie) z ostatnich 90 dni treningów i nazwa stanu formy.",
    parameters: { type: "object", properties: {} } },
  { name: "znajomi_tydzien", description: "Treningi znajomych biegacza w tym tygodniu (tylko znajomi z publicznym profilem): kto biegał, ile km.",
    parameters: { type: "object", properties: {} } },
  { name: "osoby_z_miasta", description: "Biegacze z publicznym profilem z tego samego miasta co biegacz (miasto z profilu).",
    parameters: { type: "object", properties: {} } },
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
  if (nazwa === "moje_rekordy") return { ok: true, args: a.szanse === true ? { szanse: true } : {} };
  if (nazwa === "moje_wyniki") {
    if (a.gdzie == null) return { ok: true, args: {} };
    const g = String(a.gdzie).trim();
    return /^[\p{L}][\p{L} .-]{1,39}$/u.test(g) ? { ok: true, args: { gdzie: g } } : { ok: false, blad: "złe miejsce" };
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
  if (nazwa === "moj_trener") {
    const { data: a, error } = await sb.from("athletes").select("coach_id").eq("id", athleteId).maybeSingle();
    if (error) throw new Error("athletes");
    if (!a || !a.coach_id) return { trener: null };
    const { data: c } = await sb.from("coaches").select("id,full_name,specialization").eq("id", a.coach_id).maybeSingle();
    return { trener: c ? { nazwa: String(c.full_name || "").slice(0, 80) || "Trener", specjalizacja: c.specialization ? String(c.specialization).slice(0, 80) : null } : { nazwa: "Trener", specjalizacja: null } };
  }
  // ── M3-2 (a): forma, znajomi, miasto — tylko odczyt, liczby z danych, zdania ze słownika stanów ──
  if (nazwa === "moja_forma") {
    const { data, error } = await sb.from("training_logs").select("logged_at,training_type,duration,feel").eq("athlete_id", athleteId)
      .not("training_type", "like", "__badge__%").gte("logged_at", poczatekDniaWaw(dodajDni(dzis, -DNI_LOGOW_FORMY))).lt("logged_at", poczatekDniaWaw(dodajDni(dzis, 1)));
    if (error) throw new Error("training_logs");
    const logi = data || [];
    if (!logi.length) return { logi: 0 };
    const f = formaSeria(logi, { koniec: teraz, dni: 90 });
    const s = STANY_FORMY[f.forma] || null;
    return { logi: logi.length, tsb: f.tsb, ctl: f.ctl, atl: f.atl, forma: f.forma, etykieta: s ? s.etykieta : f.forma, tytul: s ? s.tytul : null, pod: s ? s.pod : null };
  }
  if (nazwa === "znajomi_tydzien") {
    const od = poniedzialek(dzis);
    const { data: fr, error } = await sb.from("friendships").select("requester_id,addressee_id").or(`requester_id.eq.${athleteId},addressee_id.eq.${athleteId}`).eq("status", "accepted");
    if (error) throw new Error("friendships");
    const ids = [...new Set((fr || []).map((f) => (f.requester_id === athleteId ? f.addressee_id : f.requester_id)).filter((x) => x && x !== athleteId))];
    if (!ids.length) return { od, do: dzis, znajomi: 0, publiczni: 0, biegali: 0, osoby: [] };
    // profile znajomych przez RLS (publiczni + podopieczni trenera); treningi WYŁĄCZNIE z widoku publicznego — prywatne logi
    // nigdy nie wchodzą do sumy, nawet gdy właściciel tabeli by je widział
    const [{ data: ath }, { data: logi, error: eL }] = await Promise.all([
      sb.from("athletes").select("id,full_name,is_public").in("id", ids),
      sb.from("public_training_logs").select("athlete_id,training_type,distance_km,logged_at").in("athlete_id", ids).not("training_type", "like", "__badge__%")
        .gte("logged_at", poczatekDniaWaw(od)).lt("logged_at", poczatekDniaWaw(dodajDni(dzis, 1))),
    ]);
    if (eL) throw new Error("public_training_logs");
    const nazwy = {}; let publiczni = 0;
    for (const a of ath || []) { nazwy[a.id] = String(a.full_name || "").slice(0, 80) || "Biegacz"; if (a.is_public === true) publiczni++; }
    const suma = {};
    for (const l of logi || []) {
      const s = suma[l.athlete_id] || (suma[l.athlete_id] = { id: l.athlete_id, treningi: 0, km: 0 });
      s.treningi++; if (isRunType(l.training_type)) s.km += parseFloat(l.distance_km) || 0;
    }
    const osoby = Object.values(suma).map((s) => ({ id: s.id, nazwa: nazwy[s.id] || "Biegacz", km: zaokr(s.km), treningi: s.treningi })).sort((a, b) => b.km - a.km);
    return { od, do: dzis, znajomi: ids.length, publiczni, biegali: osoby.length, osoby: osoby.slice(0, MAX_OSOB_MIASTA) };
  }
  if (nazwa === "osoby_z_miasta") {
    const { data: ja, error } = await sb.from("athletes").select("city").eq("id", athleteId).maybeSingle();
    if (error) throw new Error("athletes");
    const miasto = ja && ja.city ? String(ja.city).replace(/[%_\\]/g, "").trim().slice(0, 60) : "";
    if (!miasto) return { miasto: null, liczba: 0, osoby: [] };
    const { data, count, error: e2 } = await sb.from("athletes").select("id,full_name", { count: "exact" }).eq("is_public", true).neq("id", athleteId)
      .ilike("city", miasto).order("full_name", { ascending: true }).limit(MAX_OSOB_MIASTA);
    if (e2) throw new Error("athletes");
    return { miasto, liczba: count ?? (data || []).length, osoby: (data || []).map((a) => ({ id: a.id, nazwa: String(a.full_name || "").slice(0, 80) || "Biegacz", prywatny: false })) };
  }
  if (nazwa === "moje_rekordy") {
    let r = await mojeRekordy(sb, athleteId);
    if (!r.rekordy.length && f6ctx && f6ctx.token) {   // M3-1 (3): puste pb_* → najlepsze czasy z WYNIKÓW ZAWODÓW (F6), z etykietą
      const w = await mojeWyniki(sb, athleteId, {}, f6ctx, teraz.getTime());
      if (w.wyniki && w.surowe) r = { rekordy: rekordyZWynikow(w.surowe), zrodlo: "wyniki" };
      else if (w.wybor) r = { rekordy: [], wybor: w.wybor };
      else if (w.blad_f6) r = { rekordy: [], blad_f6: w.blad_f6 };
    }
    if (!args.szanse) return r;
    const st = await wykonaj(sb, athleteId, "moje_starty", {}, teraz);
    return { ...r, szanse: true, start: (st.cele || [])[0] || null };
  }
  if (nazwa === "moje_wyniki") {
    if (!f6ctx || !f6ctx.token) throw new Error("brak tokenu F6");
    return mojeWyniki(sb, athleteId, args, f6ctx, teraz.getTime());
  }
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
    const treningi = (data || []).map((t) => ({ data: t.date, typ: t.type, opis: t.description || null,
      dystans_km: t.distance_km != null ? Number(t.distance_km) : null, czas_min: t.duration_min ?? null, tempo: t.pace || null, status: t.status || null }));
    if (treningi.length) return { od, do: doD, treningi };
    // M3b: pusty zakres → stan z js/plan-pusty.mjs (trener / generator / wolne); błąd odczytu = „nie wiadomo" (null)
    const { data: a, error: eA } = await sb.from("athletes").select("coach_id").eq("id", athleteId).maybeSingle();
    let maPlanGeneratora = false;
    if (!eA && a && !a.coach_id) {
      const { data: g } = await sb.from("trainings").select("id").eq("athlete_id", athleteId).eq("plan_source", "generator").gte("date", dzis).limit(1);
      maPlanGeneratora = !!(g && g.length);
    }
    return { od, do: doD, treningi, plan_pusty: { stan: stanPlanu({ maTrenera: eA || !a ? null : !!a.coach_id, maPlanGeneratora, brakPlanu: true }) } };
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
      return { nazwa: String(g.name || "").slice(0, 120), data: d, miasto: (g.race_id && miasta[g.race_id]) || null, race_id: g.race_id || null, dni_do: dniMiedzy(dzis, d),
        dystans_km: Number(g.distance_km) > 0 ? Number(g.distance_km) : null }; })
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
      ostatnie: (data || []).map((a) => ({ id: a.badge_id, nazwa: nazwaOdznaki(a.badge_id), opis: opisOdznaki(a.badge_id), data: a.earned_at ? dzisWaw(new Date(a.earned_at)) : null })) };
  }
  throw new Error("nieznane narzędzie");
}

/** Akcja „Otwórz ›" — z użytych narzędzi, nigdy od modelu. Pierwsze narzędzie z ekranem wygrywa. */
export function nawigacja(uzyte = []) {
  for (const n of uzyte) if (EKRAN_NARZEDZIA[n]) return { nawiguj: EKRANY[EKRAN_NARZEDZIA[n]] };
  return null;
}

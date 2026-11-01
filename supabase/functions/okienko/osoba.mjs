// OKIENKO M2b (1.11.2026) — tryb „osoba": pytanie o człowieka idzie RÓWNOLEGLE do trzech frontów zamiast komunikatu
// „Wyniki osób znajdę w wyszukiwarce wyników." (decyzja Filipa):
//   (a) osoby w aplikacji — JAK SZUKANIE W SPOŁECZNOŚCI (M3-0b, 1.11): bez filtra is_public, decyduje RLS z JWT użytkownika
//       (athletes_read_public + athletes_read_by_coach → zawodnik widzi publicznych, trener także swoich prywatnych);
//       profil prywatny ma znacznik, karta nie niesie nic poza imieniem i nazwiskiem (tyle samo co Społeczność);
//       karta z „Zobacz profil" / „Dodaj do znajomych" / „Napisz" — akcje wykonuje przeglądarka po tapnięciu
//       istniejącymi funkcjami zawodnik.html, nie model i nie EF;
//   (b) wyniki z maszyny wyników F6 (api.biegamy.run): search_runners → do 3 dopasowań, dla najlepszego runner_results
//       (5 ostatnich), token użytkownika przekazany dalej (F6 przyjmuje tylko tokeny Supabase PROD);
//   (c) sieć (googleSearch, siec.mjs) TYLKO gdy osoba jest publiczna sportowo: ≥ 30 startów w F6 albo start
//       w Mistrzostwach Polski albo podium OPEN (miejsce 1–3 w klasyfikacji generalnej — podium w kategorii ma
//       zbyt wiele osób: zmierzone 9/12 startów jednej zawodniczki), albo pytanie wprost („kim jest X", „X w sieci",
//       „google X"). Inaczej nazwisko NIE wychodzi do Google; braku sieci nie komunikujemy.
// Pamięć F6: WSPÓLNA (dane publiczne, decyzja Filipa), klucz = RPC + argumenty, 10 min, do 500 wpisów, w pamięci
// izolatu (znika przy zimnym starcie). 429 z F6 → „Maszyna wyników jest teraz zajęta — spróbuj za chwilę."
// Moduł nie zapisuje nigdzie (blizna-67/69); odpowiedzi osobowej nie wkładamy do okienko_siec_cache ani do znalezisk.
import { wygladaNaOsobeSlownik, PYTAJNE } from "./pamiec.mjs";
import { czyImie } from "../_shared/imiona.mjs";
import { normalizuj } from "./router.mjs";

import { f6, BladF6, ODP_F6_ZAJETA, F6_URL, F6_TTL_MS, F6_MAX_WPISOW, _wyczyscPamiecF6, _rozmiarPamieciF6 } from "./f6.mjs";
export { f6, BladF6, ODP_F6_ZAJETA, F6_URL, F6_TTL_MS, F6_MAX_WPISOW, _wyczyscPamiecF6, _rozmiarPamieciF6 };   // klient F6 wydzielony (M3a)
export const PROG_STARTOW_PUBLICZNY = 30;
// M3-0b (1.11.2026, „puste znaczy coś"): osoba bez trafień dostaje ODPOWIEDŹ INFORMACYJNĄ (0 tokenów, bez modelu) —
// każde zdanie tylko gdy dotyczy: brak konta w BiegaMy (gdy odczyt profili się udał), brak startów w maszynie (gdy F6
// odpowiedziało), zajęta maszyna (429). Przycisku „Zaproś do BiegaMy" nie ma — zwiad 1.11: aplikacja nie ma mechanizmu
// zaproszeń do konta (navigator.share służy tylko kartom), „zaproszenia" w kodzie to zaproszenia do znajomych.
// ODP_NIC zostaje dla ścieżki ogólnej (pytanie wyglądające na osobę, które nie przeszło detektora słownikowego).
export const ODP_NIC = "Nie znalazłem tego w aplikacji, w wynikach ani w kalendarzu.";
export const ODP_BRAK_W_BIEGAMY = "W BiegaMy nie ma nikogo o tym imieniu i nazwisku.";
export const ODP_BRAK_W_F6 = "Maszyna wyników nie zna startów pod tym nazwiskiem — sprawdź pisownię.";
const MAX_DOPASOWAN = 3, MAX_WYNIKOW = 5, MAX_OSOB = 3;

// ── rozpoznanie pytania o osobę ──────────────────────────────────────────────
// Słowa, które nie są imieniem ani nazwiskiem — „kim jest mój trener" to pytanie o relację, nie o osobę do szukania
// (detektor małych liter z M2d przepuściłby „mój trener" jako dwa słowa imienia).
const NIE_IMIE = /^(m[oó]j|moja|moje|moi|tw[oó]j|twoja|twoje|nasz\w*|wasz\w*|ten|ta|to|ci|te|on|ona|oni|one|pan|pani|trener\w*|kolega|koleg\w*|kolezank\w*|koleżank\w*|znajom\w*|brat\w*|siostr\w*|mama|mamy|tata|taty|zona|żona|maz|mąż|syn|corka|córka|szef\w*|sasiad\w*|sąsiad\w*|imi\w*|nazwisk\w*|i)$/i;   // „imię i nazwisko” = podpowiedź, nie osoba
const toImie = (q) => wygladaNaOsobeSlownik(q) && !String(q).split(/\s+/).some((s) => NIE_IMIE.test(s));
/* M3-1 (1) PRYWATNOŚĆ (1.11.2026): imię i nazwisko WEWNĄTRZ zdania. Ławka 1.11: „jak pobiegl Jan Kowalski w Poznaniu"
   i „czy Anna Kowalska jest w aplikacji" mijały detektor (2–3 słowa) i strażnik sieci (ten sam zakres) → nazwisko szło do
   Google. Para sąsiednich słów: (A) pierwsze jest imieniem ze słownika (dowolna wielkość liter) ALBO (B) oba wielką
   literą, pierwsze nie na początku zdania i nie po przyimku miejsca („w Warszawie Mokotów" to miejsce; „u Basi Kowalczyk" przechodzi). Odpadają słowa pytające,
   biegowe/imprezowe, miesiące, przyimki, NIE_IMIE, cyfry. Reszta zdania = kontekst: „w/na <Miejsce>" → gdzie (filtr
   wyników), „kim jest|w sieci|google" → wprost. Zdanie z wykrytą osobą NIGDY nie idzie do Google poza regułą publiczności. */
const SLOWO_OSOBY = /^[\p{L}][\p{L}'-]+$/u;
const DUZA = /^[\p{Lu}]/u;
const PRZYIMKI = /^(w|we|na|pod|do|z|ze|od|u|o|przez|dla|kolo|koło|obok|przy|za|bez)$/i;
const PRZYIMKI_MIEJSCA = /^(w|we|na|pod|kolo|koło|obok|przy|za)$/i;   // po nich wielka litera to zwykle miejsce („w Warszawie Mokotów"), nie osoba; „u Basi Kowalczyk" zostaje
const SLOWA_IMPREZ_OS = /^(maraton\w*|polmaraton\w*|półmaraton\w*|bieg\w*|zawod\w*|ultra\w*|trail\w*|parkrun\w*|cross\w*|tras[aąyę]|zapis\w*|wynik\w*|rekord\w*|medal\w*|start\w*|kalendarz\w*|pogod\w*|km|dych\w*|piatk\w*|piątk\w*|sztafet\w*|aplikacj\w*|biegamy|radio|plan\w*|trening\w*|odznak\w*|wyzwan\w*|siec\w*|internec\w*|google|facebook\w*|instagram\w*|strav\w*)$/i;
const MIESIAC_OS = /^(stycze[nń]|stycznia|styczniu|luty|lutego|lutym|marzec|marca|marcu|kwiecie[nń]|kwietnia|kwietniu|maj|maja|maju|czerwiec|czerwca|czerwcu|lipiec|lipca|lipcu|sierpie[nń]|sierpnia|sierpniu|wrzesie[nń]|wrze[sś]nia|wrze[sś]niu|pa[zź]dziernik\w*|listopad\w*|grudzie[nń]|grudnia|grudniu|weekend\w*|jutro|jutra|dzis|dziś|dzisiaj|wczoraj|tydz\w*|tygodni\w*|miesi[aą]c\w*)$/i;   // pełne formy, nie rdzenie („Marcin" ≠ marzec)
const CZASOWNIK_OS = /^(jest|byl|była|byla|jestem|mam|ma|masz|biega\w*|pobieg\w*|przebieg\w*|zna\w*|lubi\w*|chce\w*|moze\w*|może\w*|dodaj|pokaz\w*|znajd\w*|szukaj|sprawd\w*)$/i;
const zleSlowoOsoby = (s) => !SLOWO_OSOBY.test(s) || PYTAJNE.test(s) || NIE_IMIE.test(s) || PRZYIMKI.test(s) || SLOWA_IMPREZ_OS.test(s) || MIESIAC_OS.test(s) || CZASOWNIK_OS.test(s);
/** → {q, gdzie, wprost} | null — tylko zdania ≥ 4 słów (krótsze obsługuje wygladaNaOsobeSlownik). */
export function osobaWZdaniu(tekst) {
  const t = String(tekst || "").replace(/[?!.]+$/g, "").trim();
  const slowa = t.replace(/[\\"'„”(),;:]+/g, " ").split(/\s+/).filter(Boolean);
  if (slowa.length < 4) return null;
  for (let i = 0; i < slowa.length - 1; i++) {
    const w1 = slowa[i], w2 = slowa[i + 1];
    if (zleSlowoOsoby(w1) || zleSlowoOsoby(w2)) continue;
    const poPrzyimku = i > 0 && PRZYIMKI_MIEJSCA.test(slowa[i - 1]);
    const A = czyImie(w1);
    const B = i > 0 && !poPrzyimku && DUZA.test(w1) && DUZA.test(w2);
    if (!A && !B) continue;
    const reszta = slowa.slice(i + 2);
    let gdzie = null;
    for (let j = 0; j < reszta.length - 1; j++) if (/^(w|we|na)$/i.test(reszta[j]) && /^[\p{L}][\p{L}.-]{2,39}$/u.test(reszta[j + 1]) && !MIESIAC_OS.test(reszta[j + 1]) && !zleSlowoOsoby(reszta[j + 1])) { gdzie = reszta[j + 1]; break; }
    const n = normalizuj(t);
    const wprost = /\bkim jest\b|\bkto to\b|\bw sieci\b|\bgoogle\b|\bw internecie\b/.test(n);
    return { q: w1 + " " + w2, gdzie, wprost };
  }
  return null;
}

/** → {q, wprost, gdzie?} | null. „Katarzyna Chojnacka" → wprost false; „kim jest Katarzyna Chojnacka", „… w sieci",
    „google …" → wprost true (użytkownik sam prosi o sieć); „wyniki X", „jak pobiegł(a) X" → wprost false;
    imię i nazwisko wewnątrz dłuższego zdania → osobaWZdaniu (M3-1). */
export function osobaZPytania(tekst) {
  const t = String(tekst || "").replace(/[?!.]+$/g, "").trim();
  const n = normalizuj(t);
  const reszta = (re) => { const m = t.match(re); return m ? m[1].trim() : null; };
  const wprost = reszta(/^(?:kim\s+jest|kto\s+to\s+jest|kto\s+to)\s+(.+)$/i) || reszta(/^(.+?)\s+w\s+(?:sieci|google|internecie)$/i)
    || reszta(/^(?:google|wygoogluj|sprawd[źz]\s+w\s+sieci)\s+(.+)$/i);
  if (wprost && toImie(wprost)) return { q: wprost, wprost: true };
  const wyniki = /^(wyniki|jak\s+pobiegl\w*|jak\s+biega\w*)\s/.test(n) ? reszta(/^(?:wyniki|jak\s+pobieg\S*|jak\s+biega\S*)\s+(.+)$/i) : null;
  if (wyniki && toImie(wyniki)) return { q: wyniki, wprost: false };
  if (toImie(t)) return { q: t.replace(/[\\"'„”()]+/g, " ").replace(/\s+/g, " ").trim(), wprost: false };
  return osobaWZdaniu(t);
}

// ── (a) osoby w aplikacji ────────────────────────────────────────────────────
/** Profile pasujące do każdego słowa zapytania (kolejność dowolna) — zbiór TEN SAM co szukanie w Społeczności
    (zawodnik.html _doSearch: ilike po full_name, bez filtra is_public, RLS decyduje). Status znajomości dla przycisku. */
export async function osobyWAplikacji(sb, athleteId, q) {
  const slowa = String(q).split(/\s+/).map((s) => s.replace(/[%_,()*\\]/g, "")).filter((s) => s.length >= 2).slice(0, 3);
  if (!slowa.length) return [];
  let zap = sb.from("athletes").select("id,full_name,is_public").neq("id", athleteId);
  for (const s of slowa) zap = zap.ilike("full_name", `%${s}%`);
  const { data, error } = await zap.limit(MAX_OSOB);
  if (error) throw new Error("athletes");
  const osoby = (data || []).filter((a) => a.id !== athleteId);
  if (!osoby.length) return [];
  const status = {};
  const or = osoby.map((a) => `and(requester_id.eq.${athleteId},addressee_id.eq.${a.id}),and(requester_id.eq.${a.id},addressee_id.eq.${athleteId})`).join(",");
  const { data: fr } = await sb.from("friendships").select("requester_id,addressee_id,status").or(or);
  for (const r of fr || []) {
    const inny = r.requester_id === athleteId ? r.addressee_id : r.requester_id;
    status[inny] = r.status === "accepted" ? "znajomi" : r.requester_id === athleteId ? "wyslano" : "czeka";
  }
  return osoby.map((a) => ({ id: a.id, nazwa: String(a.full_name || "").slice(0, 80), prywatny: a.is_public !== true, znajomosc: status[a.id] || null }));
}

// ── (b) wyniki z F6 ──────────────────────────────────────────────────────────
const RE_MP = /mistrzostw\w*\s+polski/i;
/** → null (brak dopasowań) | {dopasowania[], najlepszy{...}, publiczna:boolean}. Rzuca BladF6. */
export async function wynikiSzukaj(fetchFn, token, q, teraz = Date.now(), gdzie = null) {
  const s = await f6(fetchFn, token, "search_runners", { q, lim: MAX_DOPASOWAN }, teraz);
  if (!s.length) return null;
  const b = s[0];
  const w = await f6(fetchFn, token, "runner_results", { p_runner_key: b.runner_key }, teraz);
  // kontekst „w Poznaniu" (M3-1): starty w tym miejscu/biegu; reguła publiczności liczona z WSZYSTKICH startów
  const { publiczna } = podsumujWyniki(b, w);
  let wyb = w, gdzieBrak = false;
  if (gdzie) {
    const T = /** @type {any} */ (globalThis).BM_TEKST, r = T.rdzen(T.tylkoLitery(gdzie));
    wyb = w.filter((x) => T.bezZnakow(`${x.event_name || ""} ${x.event_city || ""}`).split(/[^a-z0-9]+/).some((s2) => s2.startsWith(r)));
    if (!wyb.length) { wyb = w; gdzieBrak = true; }
  }
  const { podsumowanie } = podsumujWyniki(gdzie && !gdzieBrak ? { ...b, results_count: wyb.length } : b, wyb);
  return {
    dopasowania: s.slice(0, MAX_DOPASOWAN).map((x) => ({ nazwa: String(x.display_name || "").slice(0, 80), rocznik: x.yob ?? null, starty: x.results_count ?? null })),
    najlepszy: podsumowanie,
    publiczna,
    gdzie: gdzie || null, gdzie_brak: gdzieBrak,
  };
}

/** Karta wyników biegacza (wspólna dla trybu osoby i „moich wyników", M3d): b = wiersz search_runners (albo
    {display_name, yob, results_count}), w = runner_results. → {podsumowanie, publiczna}. */
export function podsumujWyniki(b, w) {
  const ostatnie = w.slice(0, MAX_WYNIKOW).map((r) => ({ bieg: String(r.event_name || "").slice(0, 120), data: r.event_date || null,
    miasto: r.event_city || null, dystans_km: r.distance_km != null ? Number(r.distance_km) : null, czas_s: r.time_seconds ?? null,
    miejsce: r.position_total ?? null, miejsce_kat: r.position_category ?? null, kategoria: r.category || null }));
  // najlepszy czas na dystansie ostatniego startu (różne dystanse nie dają jednego „najlepszego")
  const dyst = w[0] && w[0].distance_km != null ? Number(w[0].distance_km) : null;
  let najlepszy = null;
  if (dyst) for (const r of w) {
    if (r.distance_km != null && Math.abs(Number(r.distance_km) - dyst) <= dyst * 0.01 && r.time_seconds > 0 && (!najlepszy || r.time_seconds < najlepszy.czas_s))
      najlepszy = { czas_s: r.time_seconds, bieg: String(r.event_name || "").slice(0, 120), data: r.event_date || null, dystans_km: dyst };
  }
  const liczba = Number(b.results_count) || w.length;
  const publiczna = liczba >= PROG_STARTOW_PUBLICZNY || w.some((r) => RE_MP.test(String(r.event_name || ""))) ||
    w.some((r) => r.position_total != null && Number(r.position_total) >= 1 && Number(r.position_total) <= 3);
  return {
    podsumowanie: { nazwa: String(b.display_name || "").slice(0, 80), rocznik: b.yob ?? null, starty: liczba,
      ostatni: ostatnie[0] ? { bieg: ostatnie[0].bieg, data: ostatnie[0].data } : null, najlepszy_czas: najlepszy, ostatnie },
    publiczna,
  };
}

// ── składanie odpowiedzi ─────────────────────────────────────────────────────
/** deps: {sb, athleteId, fetchFn, token, q, wprost, sieciDozwolona: async () => boolean, siec: async (tekst) => {zdania, zrodla, tok, zapytania}}
    → {zdania, karty, zrodla, akcja, tok, zapytania_sieci, f6, sieci: boolean, powod} */
export async function odpowiedzOsoba(deps) {
  const { sb, athleteId, fetchFn, token, q, wprost, gdzie = null } = deps;
  const [rA, rB] = await Promise.allSettled([osobyWAplikacji(sb, athleteId, q), wynikiSzukaj(fetchFn, token, q, Date.now(), gdzie)]);
  const osoby = rA.status === "fulfilled" ? rA.value : [];
  const wyniki = rB.status === "fulfilled" ? rB.value : null;
  const f6Stan = rB.status === "fulfilled" ? "ok" : (rB.reason && rB.reason.kod) || "blad";
  const doSieci = wprost || !!(wyniki && wyniki.publiczna);
  let zdania = [], zrodla = [], tok = { we: 0, wy: 0 }, zapytania = 0, sieci = false;
  if (doSieci && await deps.sieciDozwolona()) {
    try {
      const s = await deps.siec(wprost ? `Kim jest ${q}?` : `Kim jest ${q}, biegacz(ka) startujący w zawodach?`);
      tok = s.tok || tok; zapytania = s.zapytania || 0; sieci = true;
      if (s.zrodla && s.zrodla.length) { zdania = s.zdania; zrodla = s.zrodla; }
    } catch { /* sieć padła — reszta odpowiedzi zostaje */ }
  }
  const karty = [];
  for (const o of osoby) karty.push({ typ: "osoba", dane: o });
  if (wyniki && wyniki.gdzie_brak) zdania = [...zdania, `Maszyna wyników nie zna startu tej osoby: ${wyniki.gdzie}.`];
  if (wyniki) karty.push({ typ: "wyniki", dane: { ...wyniki.najlepszy, inne: wyniki.dopasowania.slice(1), gdzie: wyniki.gdzie_brak ? null : wyniki.gdzie } });
  if (f6Stan === "limit") zdania = [...zdania, ODP_F6_ZAJETA];
  const nic = !karty.length && !zdania.length;
  if (nic) {   // M3-0b: odpowiedź informacyjna, każde zdanie tylko gdy źródło naprawdę odpowiedziało „nie ma"
    if (rA.status === "fulfilled") zdania.push(ODP_BRAK_W_BIEGAMY);
    if (f6Stan === "ok") zdania.push(ODP_BRAK_W_F6);
    if (!zdania.length) zdania.push(ODP_NIC);
  }
  return { nic, zdania, karty, zrodla, akcja: wyniki ? { nawiguj: "races.html" } : null, tok, zapytania_sieci: zapytania, f6: f6Stan, sieci,
    powod: [rA.status === "rejected" ? "profile: " + String(rA.reason && rA.reason.message) : null, f6Stan !== "ok" ? "f6: " + f6Stan : null].filter(Boolean).join(" | ") || null };
}

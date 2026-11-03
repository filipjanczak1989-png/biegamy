// OKIENKO 2.0 — E4: PAMIĘĆ ROZMOWY po stronie serwera (tabela okienko_v2_rozmowa, migracja 20261105; czyta/pisze WYŁĄCZNIE EF
// kluczem service, nikt z przeglądarki). Trzymamy INTENCJĘ i SLOTY ostatnich tur (≤ 5, ≤ 30 min), nie treść pytań ani odpowiedzi.
// „a w grudniu?”, „a on?”, „porównaj z nim”: klasyfikator dostaje poprzednie intencje i sloty jako kontekst, a kod dziedziczy
// brakujące sloty (miejsce, dystans, osoba, impreza) z poprzedniej tury tej samej rozmowy. Osoba w slocie nadal przechodzi B2.
/* R2 (3.11, OK Filipa; migracja 20261105_okienko_pamiec): tura ma też TREŚĆ — pytanie (≤ 300) i skrót odpowiedzi (≤ 400) — żeby dopytania
   („a dlaczego?”, rozmowa-model.mjs) miały do czego sięgnąć. Nadal: tylko EF, cron kasuje po 1 dniu, nic z tego nie idzie do klasyfikatora. */
export const TTL_MIN = 30, MAX_TUR = 5;
const DZIEDZICZONE = ["miejsce", "dystans", "osoba", "impreza", "temat"];
const KONTYNUACJA = /^(a|i|to|no|oraz|ale|czyli)\b|\b(on|ona|oni|nim|nia|niego|niej|ich|nich|tam|wtedy|tez|takze|z nim|z nia)\b/;

/** → [{intencja, sloty, kiedy}] od najnowszej; pusto przy błędzie (pamięć to ułatwienie, nie warunek) */
export async function czytajRozmowe(adm, athleteId, teraz = new Date()) {
  try {
    const od = new Date(teraz.getTime() - TTL_MIN * 60000).toISOString();
    const { data, error } = await adm.from("okienko_v2_rozmowa").select("intencja,sloty,kiedy,pytanie,odpowiedz").eq("athlete_id", athleteId).gte("kiedy", od)
      .order("kiedy", { ascending: false }).limit(MAX_TUR);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({ intencja: String(r.intencja || ""), sloty: r.sloty && typeof r.sloty === "object" ? r.sloty : {}, kiedy: r.kiedy, pytanie: typeof r.pytanie === "string" ? r.pytanie : null, odpowiedz: typeof r.odpowiedz === "string" ? r.odpowiedz : null }));
  } catch { return []; }
}

export async function zapiszTure(adm, athleteId, intencja, sloty = {}, tresc = null) {
  if (!/^[a-z_]{1,40}$/.test(String(intencja || ""))) return false;
  const czyste = {};
  for (const k of ["zakres", "data", "od", "do", ...DZIEDZICZONE]) if (typeof sloty[k] === "string" && sloty[k]) czyste[k] = sloty[k].slice(0, 60);
  const wiersz = { athlete_id: athleteId, intencja, sloty: czyste };
  if (tresc && typeof tresc === "object") {   // R2: treść tury (dopytania); zdania bez kart i źródeł
    if (typeof tresc.pytanie === "string" && tresc.pytanie.trim()) wiersz.pytanie = tresc.pytanie.trim().slice(0, 300);
    const o = Array.isArray(tresc.odpowiedz) ? tresc.odpowiedz.filter((z) => typeof z === "string").join(" ") : tresc.odpowiedz;
    if (typeof o === "string" && o.trim()) wiersz.odpowiedz = o.trim().slice(0, 400);
  }
  try { const { error } = await adm.from("okienko_v2_rozmowa").insert(wiersz); return !error; } catch { return false; }
}

/** pytanie wygląda na kontynuację („a w grudniu?”, „a on?”, „porównaj z nim”) — tylko gdy jest świeża rozmowa */
export function czyKontynuacja(tekstZnormalizowany, rozmowa) {
  const t = String(tekstZnormalizowany || "").trim();
  if (!t || !rozmowa || !rozmowa.length) return false;
  return KONTYNUACJA.test(t) || t.split(" ").length <= 3;
}

/** brakujące sloty z poprzedniej tury (ta sama intencja albo kontynuacja); okres nigdy nie dziedziczy (nowe „w grudniu” ma wygrać) */
export function scalSloty(roz, rozmowa, kontynuacja) {
  const p = rozmowa && rozmowa[0];
  if (!roz || !p) return roz;
  if (roz.intencja !== p.intencja && !kontynuacja) return roz;
  const sloty = { ...roz.sloty };
  for (const k of DZIEDZICZONE) if (!sloty[k] && p.sloty[k]) sloty[k] = p.sloty[k];
  return { ...roz, sloty };
}

/** kontekst dla klasyfikatora: intencje + sloty poprzednich tur (bez treści pytań — jej nie trzymamy) */
export function kontekstDlaModelu(rozmowa) {
  return (rozmowa || []).slice(0, 3).reverse().map((r) => ({ q: `[poprzednie pytanie: ${r.intencja}${Object.keys(r.sloty).length ? "; " + Object.entries(r.sloty).map(([k, v]) => `${k}: ${v}`).join(", ") : ""}]`, intencja: r.intencja }));
}

/* narzędzie z routera → intencja i sloty do pamięci (router nie zna intencji, zna narzędzie i argumenty) */
const INTENCJA_NARZEDZIA = { odznaki_moje: "odznaki", wyzwania_postep: "wyzwania", znajomi_tydzien: "znajomi" };
export function turaZNarzedzia(narzedzie, args = {}) {
  const intencja = INTENCJA_NARZEDZIA[narzedzie] || narzedzie;
  const sloty = {};
  if (args.od) sloty.od = args.od; if (args.do) sloty.do = args.do; if (args.data) sloty.data = args.data; if (args.zakres) sloty.zakres = args.zakres;
  if (args.miejsce) sloty.miejsce = args.miejsce; if (args.dystans) sloty.dystans = String(args.dystans); if (args.gdzie) sloty.miejsce = args.gdzie;
  return { intencja, sloty };
}

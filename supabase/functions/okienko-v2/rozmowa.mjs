// OKIENKO 2.0 — E4: PAMIĘĆ ROZMOWY po stronie serwera (tabela okienko_v2_rozmowa, migracja 20261105; czyta/pisze WYŁĄCZNIE EF
// kluczem service, nikt z przeglądarki). Trzymamy INTENCJĘ i SLOTY ostatnich tur (≤ 5, ≤ 30 min), nie treść pytań ani odpowiedzi.
// „a w grudniu?”, „a on?”, „porównaj z nim”: klasyfikator dostaje poprzednie intencje i sloty jako kontekst, a kod dziedziczy
// brakujące sloty (miejsce, dystans, osoba, impreza) z poprzedniej tury tej samej rozmowy. Osoba w slocie nadal przechodzi B2.
export const TTL_MIN = 30, MAX_TUR = 5;
const DZIEDZICZONE = ["miejsce", "dystans", "osoba", "impreza", "temat"];
const KONTYNUACJA = /^(a|i|to|no|oraz|ale|czyli)\b|\b(on|ona|oni|nim|nia|niego|niej|ich|nich|tam|wtedy|tez|takze|z nim|z nia)\b/;

/** → [{intencja, sloty, kiedy}] od najnowszej; pusto przy błędzie (pamięć to ułatwienie, nie warunek) */
export async function czytajRozmowe(adm, athleteId, teraz = new Date()) {
  try {
    const od = new Date(teraz.getTime() - TTL_MIN * 60000).toISOString();
    const { data, error } = await adm.from("okienko_v2_rozmowa").select("intencja,sloty,kiedy").eq("athlete_id", athleteId).gte("kiedy", od)
      .order("kiedy", { ascending: false }).limit(MAX_TUR);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({ intencja: String(r.intencja || ""), sloty: r.sloty && typeof r.sloty === "object" ? r.sloty : {}, kiedy: r.kiedy }));
  } catch { return []; }
}

export async function zapiszTure(adm, athleteId, intencja, sloty = {}) {
  if (!/^[a-z_]{1,40}$/.test(String(intencja || ""))) return false;
  const czyste = {};
  for (const k of ["zakres", "data", "od", "do", ...DZIEDZICZONE]) if (typeof sloty[k] === "string" && sloty[k]) czyste[k] = sloty[k].slice(0, 60);
  try { const { error } = await adm.from("okienko_v2_rozmowa").insert({ athlete_id: athleteId, intencja, sloty: czyste }); return !error; } catch { return false; }
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
